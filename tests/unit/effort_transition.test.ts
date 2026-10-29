import { afterEach, expect, it } from 'vitest';
import { adaptiveNext } from '../../src/domain/adaptiveProgression';
import { prescribe, toExposure } from '../../src/domain/prescription';
import { reliableOneRM } from '../../src/domain/maxEvidence';
import { successfulDoseExposure } from '../../src/domain/trainingDose';
import { repetitionProgress, type StrengthPoint } from '../../src/application/history';
import { editPlannedSet } from '../../src/application/workout';
import { finishSession, previewNext, rateSet, recordPerformance, startSession } from '../../src/application/training';
import { plan, performed, sets, est } from './helpers';
import { harness, onboard, type Harness } from './appHarness';
import type { PerceivedEffort } from '../../src/domain/model';

const history=(effort:PerceivedEffort|null,n=3,rir:number|null=null)=>Array.from({length:n},(_,i)=>performed('bench_press',`2026-10-${String(i+1).padStart(2,'0')}T10:00:00Z`,{kg:60,reps:6,mode:'moderate'},sets(3,{kg:60,reps:6,rir,perceivedEffort:effort})));
const next=(h:ReturnType<typeof history>)=>adaptiveNext({previous:{...plan('bench_press',{kg:60,reps:6,mode:'moderate'}),exerciseId:'bench_press'},history:h.map(toExposure),experience:'experienced',increment:2.5,impactedRegion:false});

it('hard needs three controlled comparable passes; maximal, low reserve and conflicts retain distinct holds',()=>{
  expect(next(history('hard',2)).reasons[0]).toBe('HARD_EFFORT_CONFIRMATION');
  expect(next(history('hard')).reasons[0]).toBe('DOUBLE_PROGRESS_REPS');
  expect(next(history('maximal')).reasons[0]).toBe('MAXIMAL_EFFORT_HOLD');
  expect(next(history(null,3,1)).reasons[0]).toBe('NUMERIC_RESERVE_HOLD');
  expect(next(history('easy',3,1)).reasons[0]).toBe('EFFORT_CONFLICT_HOLD');
  const uncertain=history('hard'); uncertain[1].sets[0].technique='uncertain';
  expect(next(uncertain).reasons[0]).toBe('HARD_EFFORT_CONFIRMATION');
  const miss=history('hard');miss[1].sets[0].actualReps=4;
  expect(next(miss).reasons[0]).toBe('HARD_EFFORT_CONFIRMATION');
  const changed=history('hard');changed[1].sets.forEach(s=>s.actualKg=62.5);
  expect(next(changed).reasons[0]).toBe('HARD_EFFORT_CONFIRMATION');
});

it('hard success informs dose tolerance; max, numeric low reserve, misses and poor sides do not',()=>{
  expect(successfulDoseExposure(history('hard')[0])).toBe(true);
  expect(successfulDoseExposure(history('maximal')[0])).toBe(false);
  expect(successfulDoseExposure(history('hard',1,1)[0])).toBe(false);
  const h=history('hard')[0];h.sets[0].actualReps=3;expect(successfulDoseExposure(h)).toBe(false);
});

it('unknown reserve cannot manufacture a max or replace the supplied max; old capacity snapshots have no intensity provenance',()=>{
  const h=history('easy');
  const args={exerciseId:'bench_press' as const,mode:'moderate' as const,role:'main' as const,sets:3,experience:'experienced' as const,settings:null,history:h,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none' as const},bodyweightKg:80};
  const unknown=prescribe(args);expect(unknown.estimatedOneRM).toBeNull();expect(unknown.adaptive?.capacity.estimatedMax).toBe(72);
  const known=prescribe({...args,settings:est('bench_press',120,{estimate:{kind:'1rm',kg:120,measured:true}})});
  expect(known.estimatedOneRM).toBe(120);expect(reliableOneRM(known)).toBe(120);
  expect(reliableOneRM({...known,maxEvidence:undefined})).toBeNull();
  const explicit=prescribe({...args,history:history(null,3,2)});
  expect(explicit.estimatedOneRM).toBe(76);expect(explicit.maxEvidence?.source).toBe('reported_set');expect(reliableOneRM(explicit)).toBeNull();
  const single=history('maximal',1);single[0].sets.forEach(s=>s.actualReps=1);
  expect(prescribe({...args,history:single}).estimatedOneRM).toBe(60);
});

it.each(['bench_press','assisted_pullup','pullup'] as const)('calibration of %s never raises reps beyond demonstrated performance',id=>{
  const h=history('maximal',1).map(h=>({...h,exerciseId:id,plan:plan(id,{kg:60,calibration:true,reps:6,mode:'moderate'}),sets:sets(3,{kg:60,reps:3,perceivedEffort:'maximal'})}));
  const p=prescribe({exerciseId:id,mode:'moderate',role:'main',sets:3,experience:'novice',settings:null,history:h,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none'},bodyweightKg:80});
  expect(p.reps).toBe(3);expect(p.reasons).toContain('CALIBRATION_REPS_OBSERVED');
});

it('rep improvement requires matching load and set count, not just greater total volume',()=>{
  const point=(reps:number,n=3,load=60):StrengthPoint=>({at:'2026-10-01',kg:load,source:'performance',detail:'',work:Array.from({length:n},()=>({load,reps,seconds:null}))});
  expect(repetitionProgress([point(6),point(8)])).toContain('6 fler repetitioner');
  expect(repetitionProgress([point(6),point(8,4)])).toBeNull();
  expect(repetitionProgress([point(6),point(8,3,50)])).toBeNull();
});

const hs:Harness[]=[];
afterEach(async()=>{for(const h of hs.splice(0)){h.sync.dispose();await h.db.delete();}});
it('calibration keeps manually edited upcoming targets and never earns quality from unilateral maximal work',async()=>{
  const h=harness();hs.push(h);await onboard(h);
  for(let i=0;i<2;i++){
    h.clock.advanceHours(72);const p=await previewNext(h.ctx);
    p.exercises=[plan('one_arm_dumbbell_row',{kg:20,reps:6,sets:3,calibration:true,mode:'moderate'})];
    const session=await startSession(h.ctx,p);
    const work=(await h.db.sets.where('sessionId').equals(session.id).toArray()).filter(s=>s.kind==='work').sort((a,b)=>a.ordinal-b.ordinal);
    await editPlannedSet(h.ctx,work[1].id,{grams:15000,reps:5});
    for(const s of work){
      await recordPerformance(h.ctx,s.id,'left',{actualGrams:20000,actualReps:6,perceivedEffort:'maximal'});
      await recordPerformance(h.ctx,s.id,'right',{actualGrams:20000,actualReps:6,perceivedEffort:'easy'});
    }
    await finishSession(h.ctx,session.id);
    expect((await h.db.calibrations.toArray()).some(c=>c.quality==='calibrated')).toBe(false);
  }
});

it('late easy feedback removes uncertain rest extension without resetting the timer or user adjustment',async()=>{
  const h=harness();hs.push(h);await onboard(h);const p=await previewNext(h.ctx);
  p.exercises=[plan('bench_press',{kg:60,reps:10,mode:'moderate'})];
  const session=await startSession(h.ctx,p);
  const work=(await h.db.sets.where('sessionId').equals(session.id).toArray()).filter(s=>s.kind==='work').sort((a,b)=>a.ordinal-b.ordinal);
  await editPlannedSet(h.ctx,work[2].id,{grams:50000,reps:7});
  await recordPerformance(h.ctx,work[0].id,'both',{actualGrams:60000,actualReps:10});
  await recordPerformance(h.ctx,work[1].id,'both',{actualGrams:60000,actualReps:8});
  const before=(await h.db.sets.get(work[1].id))!.detail!.rests.at(-1)!;
  expect(before.reasons).toContain('REPETITIONS_DECREASED_UNCERTAIN');
  await rateSet(h.ctx,work[1].id,'easy');
  const after=(await h.db.sets.get(work[1].id))!.detail!.rests.at(-1)!;
  expect(after.startedAt).toBe(before.startedAt);expect(after.reasons).not.toContain('REPETITIONS_DECREASED_UNCERTAIN');
  expect((await h.db.sets.get(work[2].id))?.targetReps).toBe(7);
});
