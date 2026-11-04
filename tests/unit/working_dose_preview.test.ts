import { afterEach, expect, it } from 'vitest';
import { prescribe, toExposure } from '../../src/domain/prescription';
import { adaptiveNext } from '../../src/domain/adaptiveProgression';
import { performed, sets, est, input } from './helpers';
import { planRegular } from '../../src/planner/planner';
import { harness, onboard, type Harness } from './appHarness';
import { finishSession, previewNext, recordPerformance, startSession } from '../../src/application/training';
import { beginPreparedSession, editPlannedSet } from '../../src/application/workout';
import { refreshPreparedSession } from '../../src/application/refreshPreview';
import { defaultConfiguration } from '../../src/domain/trainingFlow';

const hs: Harness[]=[];
afterEach(async()=>{for(const h of hs.splice(0)){h.sync.dispose();await h.db.delete();}});
const history=()=>[1,2].map(day=>performed('bench_press',`2026-11-0${day}T16:00:00.000Z`,
  {kg:75,reps:6,sets:2,mode:'moderate'},sets(2,{kg:75,reps:6,plannedReps:6,rir:null,perceivedEffort:'ok'})));

it('75 x 6 stays the working dose across modes; recovery is temporary and does not become 52.5',()=>{
  const h=history();
  const args={exerciseId:'bench_press' as const,mode:'light' as const,sets:2,role:'main' as const,experience:'intermediate' as const,settings:est('bench_press',87.5),history:h,gate:{hoursSinceRelevant:72,relevantSymptoms:'none' as const,impactedRegion:false},bodyweightKg:null};
  expect(prescribe({...args,history:h.slice(0,1)})).toMatchObject({kg:75,reps:6});
  expect(prescribe(args)).toMatchObject({kg:75,reps:7});
  const improved=performed('bench_press','2026-11-03T16:00:00.000Z',{...h[1].plan,kg:77.5},sets(2,{kg:77.5,reps:6,rir:null,perceivedEffort:'ok'}));
  expect(prescribe({...args,history:[...h,improved]}).kg).toBe(77.5);
  const recovery={version:'RECOVERY/3.2.0' as const,modeCap:'light' as const,activeHours:17,reason:'RECOVERY_MATCHED_WORK' as const,residualDose:5,workReps:12};
  const light=prescribe({...args,gate:{...args.gate,recovery}});
  expect(light).toMatchObject({kg:67.5,reps:6,doseContext:{workingLevel:{kg:75,reps:6,sets:2}}});
  const recoveryWork=performed('bench_press','2026-11-03T16:00:00.000Z',light,sets(2,{kg:67.5,reps:6,plannedReps:6,rir:null,perceivedEffort:'ok'}));
  expect(prescribe({...args,mode:'moderate',history:[...h,recoveryWork]}).kg).toBe(75);
  const planned=planRegular(input({nowUtc:'2026-11-02T17:00:00.000Z',history:h,exerciseSettings:[est('bench_press',87.5)]})).exercises.find(e=>e.exerciseId==='bench_press')!;
  expect(planned.doseContext?.workingLevel).toEqual({kg:75,reps:6,sets:2});
  expect(planned.doseContext?.temporaryReasons).toContain('TEMPORARY_LOAD_REDUCED');
  recoveryWork.sets.forEach(s=>{s.perceivedEffort='maximal';});
  expect(prescribe({...args,mode:'moderate',history:[...h,recoveryWork]}).reasons).toContain('MAXIMAL_EFFORT_HOLD');
});

it('easy completed work supports an immediate small repetition trial without invented RIR',()=>{
  const h=history()[0];h.sets.forEach(s=>{s.perceivedEffort='easy';});
  const p=h.plan;
  const next=adaptiveNext({previous:{...p,exerciseId:'bench_press',state:'normal'},history:[toExposure(h)],experience:'experienced',increment:2.5,impactedRegion:false});
  expect(next).toMatchObject({kg:75,reps:7});
  const ok=history();
  expect(prescribe({exerciseId:'bench_press',mode:'moderate',sets:2,role:'main',experience:'experienced',settings:est('bench_press',87.5),history:ok,gate:{hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:false},bodyweightKg:null})).toMatchObject({kg:75,reps:7});
});

it.each(['easy','ok'] as const)('alternating modes keep progressing through 30 successful qualitative sessions: %s',rating=>{
  const h=history().slice(0,1);
  for(let i=0;i<30;i++){
    const p=prescribe({exerciseId:'bench_press',mode:i%2?'moderate':'light',sets:2,role:'main',experience:'experienced',settings:est('bench_press',87.5),history:h,gate:{hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:false},bodyweightKg:null});
    expect(p.kg).toBeGreaterThanOrEqual(h.at(-1)!.plan.kg!);
    h.push(performed('bench_press',new Date(Date.UTC(2026,10,4+i*3)).toISOString(),p,sets(2,{kg:p.kg,reps:p.reps,plannedReps:p.reps,rir:null,perceivedEffort:rating})));
  }
  expect(h.at(-1)!.plan.kg).toBeGreaterThan(75);
});

it.each([false,true])('old preview refresh preserves results, manual targets (%s), sync and stable reopening',async manual=>{
  const h=harness();hs.push(h);await onboard(h);
  const p=await previewNext(h.ctx),bench=p.exercises.find(e=>e.exerciseId==='bench_press')!;
  const completed=await startSession(h.ctx,{...p,exercises:[{...bench,kg:75,reps:6,sets:2,mode:'moderate',calibration:false,configuration:defaultConfiguration('bench_press')}]});
  for(const s of await h.db.sets.where('sessionId').equals(completed.id).toArray()) await recordPerformance(h.ctx,s.id,'both',{actualGrams:75000,actualReps:6,perceivedEffort:'ok',technique:'controlled'});
  await finishSession(h.ctx,completed.id);
  const factual=await h.db.sets.where('sessionId').equals(completed.id).toArray();
  h.clock.t+=72*3600000;
  const proposal=await previewNext(h.ctx);
  const stale={...proposal,engineVersion:'2.1.0',exercises:proposal.exercises.map(e=>e.exerciseId==='bench_press'?{...e,engineVersion:'2.1.0',kg:52.5,reps:6}:e)};
  const draft=await startSession(h.ctx,stale,true);
  const old=(await h.db.sessionExercises.where('sessionId').equals(draft.id).toArray()).find(e=>e.exerciseId==='bench_press')!;
  const rows=await h.db.sets.where('sessionExerciseId').equals(old.id).sortBy('ordinal');
  if(manual)await editPlannedSet(h.ctx,rows[0].id,{grams:77500,reps:5});
  await h.sync.syncNow();
  expect(await refreshPreparedSession(h.ctx,draft.id)).toBe(true);
  const replacement=(await h.db.sessionExercises.get(old.id))!.replacedById!;
  const updated=await h.db.sets.where('sessionExerciseId').equals(replacement).sortBy('ordinal');
  expect(updated[0].targetGrams).toBe(manual?77500:75000);
  expect(updated[0].targetReps).toBe(manual?5:6);
  expect(updated.slice(1).every(s=>s.targetGrams===75000)).toBe(true);
  expect((await h.db.sets.where('sessionId').equals(completed.id).toArray()).map(s=>[s.actualGrams,s.actualReps,s.perceivedEffort])).toEqual(factual.map(s=>[s.actualGrams,s.actualReps,s.perceivedEffort]));
  await h.sync.syncNow();await h.sync.pull();
  expect((await h.db.sessionExercises.get(old.id))!.replacedById).toBe(replacement);
  expect(await refreshPreparedSession(h.ctx,draft.id)).toBe(false);
  await beginPreparedSession(h.ctx,draft.id);
  expect(await refreshPreparedSession(h.ctx,draft.id)).toBe(false);
  expect((await h.db.sets.get(updated[0].id))!.targetGrams).toBe(manual?77500:75000);
});
