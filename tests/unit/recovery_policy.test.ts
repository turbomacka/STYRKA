import { afterEach, describe, expect, it } from 'vitest';
import { assessRecovery, recoveryMode } from '../../src/domain/recoveryPolicy';
import { gateFor, pastWork } from '../../src/planner/history';
import { planExtra, planRegular, planReplacement } from '../../src/planner/planner';
import { configuredPrescription } from '../../src/domain/configuredPrescription';
import { comparisonKey, defaultConfiguration, type SetPerformance } from '../../src/domain/trainingFlow';
import type { ExerciseId } from '../../src/domain/catalog';
import type { PerceivedEffort } from '../../src/domain/model';
import { ALL_ESTIMATES, NOW, hoursBefore, input, performed, plan, rule, sets, symptom } from './helpers';
import { harness, onboard, type Harness } from './appHarness';
import { finishSession, previewNext, rateSet, recordPerformance, startSession } from '../../src/application/training';
import { buildHistory } from '../../src/application/plannerInput';

function work(id: ExerciseId, n: number, hours: number, feeling?: PerceivedEffort) {
  return performed(id, hoursBefore(NOW, hours), {}, sets(n, { kg: 70, reps: 8, perceivedEffort: feeling }));
}

describe('recovery policy: dose, effort and movement overlap', () => {
  it.each([
    [1, 'easy', 1, null], [2, 'too_easy', 20, null],
    [1, 'ok', 23.99, 'moderate'], [1, 'ok', 24, null],
    [2, 'hard', 47.99, 'light'], [2, 'hard', 48, null],
    [1, 'maximal', 30, 'light'], [3, 'ok', 30, 'light'],
    [3, 'easy', 20, 'moderate'], [3, 'easy', 30, null],
    [6, 'easy', 30, 'light'],
  ] as const)('%i %s sets after %s hours -> %s cap', (n, feeling, hours, cap) => {
    expect(assessRecovery('squat', [work('squat', n, hours, feeling)], NOW).modeCap).toBe(cap);
  });

  it('missing effort is ordinary work; a heavy plan alone does not imply maximal effort', () => {
    expect(assessRecovery('squat', [work('squat', 1, 30)], NOW).modeCap).toBeNull();
    expect(assessRecovery('squat', [work('squat', 3, 30)], NOW).modeCap).toBe('light');
    const h = work('squat', 2, 30); h.sets.forEach((s) => s.rir = 1);
    expect(assessRecovery('squat', [h], NOW).modeCap).toBe('light');
    h.sets.forEach((s) => s.rir = 5);
    expect(assessRecovery('squat', [h], NOW).modeCap).toBeNull();
  });

  it('distinguishes direct variants, partial overlap and unrelated work', () => {
    const h = [work('squat', 3, 30)];
    expect(assessRecovery('front_squat', h, NOW).modeCap).toBe('light');
    expect(assessRecovery('deadlift', h, NOW).modeCap).toBeNull();
    expect(assessRecovery('deadlift', [work('squat', 3, 20)], NOW).modeCap).toBe('moderate');
    expect(assessRecovery('deadlift', [work('squat', 1, 20)], NOW).modeCap).toBeNull();
    expect(assessRecovery('overhead_press', [work('bench_press', 3, 20)], NOW).modeCap).toBe('moderate');
    expect(assessRecovery('cable_row', [work('bench_press', 3, 20)], NOW).modeCap).toBeNull();
    expect(assessRecovery('cable_curl', [work('biceps_curl', 3, 30)], NOW).modeCap).toBe('light');
    expect(assessRecovery('triceps_pushdown', [work('biceps_curl', 3, 20)], NOW).modeCap).toBeNull();
  });

  it('easy work cannot hide or extend earlier demanding work; order and duplicate snapshots do not matter', () => {
    const old = work('squat', 3, 47), easy = work('squat', 1, 1, 'easy');
    const history = [old, easy]; const before = structuredClone(history);
    expect(assessRecovery('squat', history, NOW).modeCap).toBe('light');
    expect(assessRecovery('squat', [...history].reverse(), NOW)).toEqual(assessRecovery('squat', history, NOW));
    expect(assessRecovery('squat', [easy, easy, easy], NOW).modeCap).toBeNull();
    expect(assessRecovery('squat', history, hoursBefore(NOW, -1)).modeCap).toBeNull();
    expect(history).toEqual(before);
  });

  it('excludes warmups, skipped/planned, zero work, future and preview records', () => {
    const warm = work('squat', 10, 1); warm.sets.forEach((s) => s.kind = 'warmup');
    const skipped = work('squat', 10, 1); skipped.sets.forEach((s) => s.status = 'skipped');
    const zero = work('squat', 10, 1); zero.sets.forEach((s) => s.actualReps = 0);
    const preview = work('squat', 10, 1); preview.sessionStatus = 'preview';
    expect(assessRecovery('squat', [warm, skipped, zero, preview, work('squat', 10, -1)], NOW).modeCap).toBeNull();
  });

  it('counts unilateral work per side using actual completion times, including partial sets', () => {
    const c = defaultConfiguration('one_arm_dumbbell_row'), h = work('one_arm_dumbbell_row', 2, 1, 'maximal');
    h.sets.forEach((s, index) => {
      s.detail = { version: 1, configuration: c, aborted: false, rests: [], performances: ['right', 'left'].map((side) => ({ id: `${index}:${side}`, side, status: 'done', repetitions: 8, loadValue: 25, secondLoadValue: null, seconds: null, rir: null, effort: 'ok', technique: 'controlled', startedAt: null, completedAt: hoursBefore(NOW, 30), equipment: c.equipment, executionMode: c.executionMode, comparisonKey: comparisonKey(h.exerciseId,c) } as SetPerformance)) };
    });
    // Four performances are two ordinary sets per side, not four demanding sets.
    expect(assessRecovery(h.exerciseId,[h],NOW).modeCap).toBeNull();
    h.sets[0].status = 'partial'; h.sets[0].detail!.performances = [h.sets[0].detail!.performances[0]];
    h.sets[0].detail!.performances[0].effort = 'maximal';
    expect(assessRecovery(h.exerciseId,[h],NOW).modeCap).toBe('light');
    expect(assessRecovery(h.exerciseId,[h],NOW,{...c,executionMode:'single_side',startingSide:'left'}).modeCap).toBeNull();
  });

  it('retains symptoms, long-break restart and user restrictions independently of recent-work rules', () => {
    const hist = pastWork([work('squat', 2, 20, 'easy')], NOW);
    expect(gateFor('squat',hist,[],NOW).hoursSinceRelevant).toBeNull();
    expect(gateFor('squat',hist,[symptom({area:'knee',reaction:'transient'})],NOW).hoursSinceRelevant).toBe(20);
    expect(gateFor('front_squat',hist,[symptom({area:'knee',reaction:'transient'})],NOW).hoursSinceRelevant).toBe(20);
    const longBreak = gateFor('squat',pastWork([work('squat',3,700),work('deadlift',3,10)],NOW),[],NOW);
    expect(longBreak.hoursSinceRelevant).toBe(700); expect(longBreak.recovery.modeCap).toBe('moderate');
    const blocked = planRegular(input({exerciseSettings:ALL_ESTIMATES,history:hist,restrictions:[rule({kind:'block_exercise',exerciseA:'squat'})]}));
    expect(blocked.exercises.some((e)=>e.exerciseId==='squat')).toBe(false);
    const review = planRegular(input({exerciseSettings:ALL_ESTIMATES,history:hist,symptoms:[symptom({area:'knee',reaction:'persistent'})]}));
    expect(review.exercises.some((e)=>e.exerciseId==='squat')).toBe(false);
  });

  it('regular, extra and replacement planning apply the same graded limits without moving rotation', () => {
    const inp = input({exerciseSettings:ALL_ESTIMATES,history:[work('squat',1,20,'ok')]});
    const next = planRegular(inp);
    expect(next.exercises.find((e)=>e.exerciseId==='squat')).toMatchObject({mode:'moderate',state:'caution'});
    expect(next.rotationIndex).toBe(inp.rotationIndex);
    const swap = planReplacement(inp,{from:plan('front_squat'),to:'squat',others:[],familiarity:'familiar'});
    expect(swap.planned).toMatchObject({mode:'moderate',state:'caution'});
    const extra = planExtra({...inp,profile:{...inp.profile,favorites:['squat']}},{minutes:60,readiness:'good'});
    for (const e of extra.exercises) expect(e.mode).toBe(recoveryMode(e.mode,assessRecovery(e.exerciseId,inp.history,NOW)));
    expect(extra.rotationIndex).toBeNull();
  });
});

describe('machine progression respects the same hold', () => {
  it.each(['levels','independent'] as const)('%s: blocks rep and load increases, permits a justified reduction', (kind) => {
    const c = defaultConfiguration('cable_row');
    c.equipment.id = 'synthetic'; c.equipment.step = 1;
    if (kind === 'levels') { c.equipment.unit='level'; c.equipment.measurement='machine_level'; }
    else { c.equipment.basis='independent'; c.equipment.stackCount=2; }
    const h = work('cable_row',3,20); h.plan = plan('cable_row',{mode:'moderate',sets:3,reps:10,bandMin:6,bandMax:10});
    h.sets.forEach((s,i)=>{
      s.plannedReps=10;
      s.detail={version:1,configuration:c,aborted:false,rests:[],targetLoadValue:6,targetSecondLoadValue:7,performances:[{id:`p${i}`,side:'both',status:'done',repetitions:10,loadValue:6,secondLoadValue:7,seconds:null,rir:3,technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:'bilateral',comparisonKey:comparisonKey('cable_row',c)}]};
    });
    const next = {...h.plan,state:'caution' as const};
    const hold = configuredPrescription(next,[h],c);
    expect(hold).toMatchObject({targetLoadValue:6,reps:10});
    expect(hold.reasons).toContain('RECOVERY_HOLD'); expect(hold.reasons).not.toContain('DOUBLE_PROGRESS_WEIGHT');
    if(kind==='independent') expect(hold.targetSecondLoadValue).toBe(7);
    expect(configuredPrescription({...next,state:'normal'},[h],c).targetLoadValue).toBe(7);
    h.plan.bandMax=12; next.bandMax=12;
    expect(configuredPrescription(next,[h],c).reps).toBe(10);
    expect(configuredPrescription({...next,state:'normal'},[h],c).reps).toBe(11);
    h.sets.forEach((s)=>s.detail!.performances[0].repetitions=8);
    const reduced=configuredPrescription(next,[h,{...structuredClone(h),sessionId:'another'}],c);
    expect(reduced.targetLoadValue).toBe(5); expect(reduced.reasons).toContain('TWO_CONSECUTIVE_MISSES');
  });
});

const harnesses: Harness[]=[];
afterEach(async()=>{for(const h of harnesses.splice(0)){h.sync.dispose();await h.db.delete();}});
it('saved optional answers affect the next local/offline proposal without rewriting completed plans or data', async()=>{
  const h=harness();harnesses.push(h);await onboard(h);h.server.online=false;
  const p=await previewNext(h.ctx); p.exercises=[{...p.exercises[0],sets:1}];
  const session=await startSession(h.ctx,p), s=(await h.db.sets.toArray())[0];
  await recordPerformance(h.ctx,s.id,'both',{});await rateSet(h.ctx,s.id,'easy');
  await finishSession(h.ctx,session.id); h.clock.advanceHours(30);
  const before=await h.db.sessions.get(session.id);
  const inp=input({nowUtc:h.clock.now(),exerciseSettings:ALL_ESTIMATES,history:await buildHistory(h.db)});
  expect(planRegular(inp).exercises.find((e)=>e.exerciseId==='squat')?.mode).toBe('heavy');
  await rateSet(h.ctx,s.id,'maximal');
  const changed=planRegular({...inp,history:await buildHistory(h.db)});
  expect(changed.exercises.find((e)=>e.exerciseId==='squat')).toMatchObject({mode:'light',state:'caution'});
  expect(await h.db.sessions.get(session.id)).toEqual(before);
  const record=await h.db.sets.get(s.id);
  expect(record?.actualGrams).toBe(s.targetGrams); expect(record?.actualReps).toBe(s.targetReps);
});
