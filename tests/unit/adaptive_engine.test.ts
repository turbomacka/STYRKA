import { afterEach, describe, expect, it } from 'vitest';
import { recommendNext, type Exposure } from '../../src/domain/decision_engine';
import { estimateCapacity } from '../../src/domain/adaptiveProgression';
import { comparableHistory } from '../../src/domain/comparableTraining';
import { assessRecovery, recoveryDose } from '../../src/domain/recoveryPolicy';
import { rollingDose } from '../../src/domain/trainingDose';
import { prescribe } from '../../src/domain/prescription';
import { configuredPrescription } from '../../src/domain/configuredPrescription';
import { comparisonKey, defaultConfiguration, trainingPreferences } from '../../src/domain/trainingFlow';
import { gateFor } from '../../src/planner/history';
import { planRegular, planReplacement } from '../../src/planner/planner';
import { ALL_ESTIMATES, NOW, est, hoursBefore, input, performed, plan, rule, sets } from './helpers';
import { harness, onboard, type Harness } from './appHarness';
import { previewNext, startSession, recordPerformance, exceedsPlannedMaximum, finishSession } from '../../src/application/training';
import { deleteTrainingSet, editPlannedSet } from '../../src/application/workout';
import { buildHistory } from '../../src/application/plannerInput';
import { updateExerciseSettings } from '../../src/application/profile';

import { base, exposure } from './adaptiveFixtures';
const next=(history:Exposure[],previous=base,extra:Partial<Parameters<typeof recommendNext>[0]>={})=>recommendNext({previous,history,experience:'experienced',increment:2.5,hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:false,...extra});
const wins=(p=base)=>[exposure(p,{},0),exposure(p,{},1)];

describe('Adaptive acceptance A–P and adversarial cases',()=>{
  it('A: repeated 80 × 7 supports a trial at 82.5 × 5 despite 3.125%',()=>{
    const r=next(wins());expect([r.kg,r.reps]).toEqual([82.5,5]);expect(r.adaptive?.confirmed).toEqual({kg:80,reps:7,sets:3});expect(r.adaptive?.attempted?.kg).toBe(82.5);
  });
  it('B: successful trial requires two experienced exposures to confirm',()=>{
    const h=wins(),trial=next(h);h.push(exposure(trial,{},2));expect(next(h,trial).adaptive?.confirmed?.kg).toBe(80);
    h.push(exposure(trial,{},3));expect(next(h,trial).adaptive?.confirmed).toEqual({kg:82.5,reps:5,sets:3});
  });
  it('C: failed load trial restores all confirmed dimensions and waits for new evidence',()=>{
    const h=wins(),trial=next(h);h.push(exposure(trial,{reps:3,rir:0},2));const back=next(h,trial);
    expect([back.kg,back.reps,back.sets]).toEqual([80,7,3]);expect(back.reasons).toContain('TRIAL_RETURN_TO_CONFIRMED');
    h.push(exposure(back,{},3));expect(next(h,back).reasons).toContain('TRIAL_RETRY_WAIT');
    h.push(exposure(back,{},4));expect(next(h,back).kg).toBe(82.5);
  });
  it('a failed trial followed by one baseline miss is not two baseline failures',()=>{
    const h=wins(),trial=next(h);h.push(exposure(trial,{reps:3,rir:0},2));const back=next(h,trial);h.push(exposure(back,{reps:6,rir:0},3));expect(next(h,back).kg).toBe(80);
  });
  it('a failed repetition trial cannot erase the cooldown of a repeatedly failed weight trial',()=>{
    const trial={...base,kg:82.5,reps:5},h=wins();
    h.push(exposure(trial,{reps:3,rir:null},2),exposure(base,{rir:null},3),exposure(base,{rir:null},4),exposure(trial,{reps:3,rir:null},5));
    h.push(exposure({...base,reps:8},{reps:7,rir:null},6),exposure(base,{rir:null},7),exposure(base,{rir:null},8));
    expect(next(h).kg).toBe(80);
  });
  it('a failed trial with poor technique still returns to the established level',()=>{
    const h=wins(),trial=next(h),miss=exposure(trial,{reps:3},2);miss.sets[0].technique='poor';h.push(miss);
    expect(next(h,trial)).toMatchObject({kg:80,reps:7});
  });
  it('reliably short rests prevent automatic repeated-miss strength-loss inference',()=>{
    const h=wins();h.push({...exposure(base,{reps:6},2),shortObservedRest:true},{...exposure(base,{reps:6},3),shortObservedRest:true});
    expect(next(h)).toMatchObject({kg:80,reps:7});expect(next(h).reasons).toContain('SHORT_OBSERVED_REST_HOLD');
  });
  it('D: absent RIR and a failed eighth rep never invent a loss of strength',()=>{
    const p={...base,kg:40,bandMax:10},h=[exposure(p,{rir:null},0),exposure(p,{rir:null},1)],trial=next(h,p);
    expect(trial.reps).toBe(8);h.push(exposure(trial,{reps:7,rir:null},2));expect(next(h,trial)).toMatchObject({kg:40,reps:7});
  });
  it('E/F: uniform 3 × 6 adapts repetitions, 10/10/6 does not',()=>{
    const p={...base,exerciseId:'squat' as const,kg:60,reps:10,bandMax:10},h=exposure(p,{reps:6});
    expect(next([h],p,{impactedRegion:true})).toMatchObject({kg:60,reps:6,sets:3});
    h.sets[0].actualReps=10;h.sets[1].actualReps=10;expect(next([h],p,{impactedRegion:true}).reps).toBe(10);
  });
  it('a smaller repetition choice can recur across trials separated by baseline visits',()=>{
    const p={...base,reps:6,bandMax:10},trial={...p,reps:7};
    const h=wins(p);h.push(exposure(trial,{reps:6},2),exposure(p,{},3),exposure(p,{},4),exposure(trial,{reps:6},5));
    const r=next(h,trial,{impactedRegion:true});expect(r.reasons).toContain('USER_DOSE_ADAPTED');expect(r.reps).toBe(6);
    h.push(exposure(p,{rir:4},6),exposure(p,{rir:4},7));const review=next(h,p,{impactedRegion:true});
    expect(review.reps).toBe(7);expect(review.reasons).toContain('USER_DOSE_REVIEW_TRIAL');expect(review.adaptive?.trialBaseline?.reps).toBe(6);
  });
  it('G/H: chosen weight and set reductions stay in their own dimensions',()=>{
    const p={...base,kg:60,reps:10,sets:4};
    expect(next([exposure(p,{kg:50})],p,{impactedRegion:true})).toMatchObject({kg:50,reps:10,sets:4});
    expect(next([exposure(p,{sets:2})],p,{impactedRegion:true})).toMatchObject({kg:60,reps:10,sets:2});
    const partial={...exposure(p,{sets:2}),finished:false,voluntaryAbort:true};
    expect(next([partial],p,{impactedRegion:true})).toMatchObject({kg:60,reps:10,sets:4});
  });
  it('two finished partial sessions can establish a consistent smaller set dose; one interruption cannot',()=>{
    const p={...base,sets:4};
    const h=[0,1].map(i=>({...exposure(p,{sets:2},i),complete:false,voluntaryAbort:true,finished:true}));
    expect(next([h[0]],p,{impactedRegion:true}).sets).toBe(4);
    expect(next(h,p,{impactedRegion:true}).sets).toBe(2);
  });
  it('I/J: reps and relative intensity contribute; decay is continuous at 48 hours',()=>{
    const scores=[2,3].flatMap(n=>[1,20].map(reps=>n*recoveryDose(reps,2,'ok',.75)));
    expect(new Set(scores).size).toBe(4);expect(recoveryDose(1,0,'maximal',.95)).toBeGreaterThan(recoveryDose(1,5,'easy',.4));
    const history=[performed('squat',hoursBefore(NOW,48),{},sets(3,{kg:80,reps:20,rir:1}))];
    const a=assessRecovery('squat',history,hoursBefore(NOW,1/60)),b=assessRecovery('squat',history,NOW);
    expect(Math.abs(a.residualDose!-b.residualDose!)).toBeLessThan(.002);expect(a.modeCap).toBe(b.modeCap);
  });
  it('K: three sessions distribute supplementary dose and both schedules fit real rest',()=>{
    const schedule=(f:number)=>Array.from({length:6},(_,i)=>planRegular(input({profile:{plannedSessionsPerWeek:f},rotationIndex:i,exerciseSettings:ALL_ESTIMATES})));
    const a=schedule(2),b=schedule(3),count=(xs:typeof a)=>xs.reduce((n,p)=>n+p.exercises.reduce((m,e)=>m+e.sets,0),0);
    expect(count(b)).toBeLessThan(count(a));expect(count(b)*3/count(a)/2).toBeLessThan(1.4);
    for(const p of [...a,...b])expect(p.estimatedMinutes).toBeLessThanOrEqual(p.budgetMinutes+1);
  });
  it('L: left restriction does not affect right-only work; side dose is not doubled',()=>{
    const c={...defaultConfiguration('split_squat'),executionMode:'single_side' as const,startingSide:'right' as const};
    const note=rule({kind:'region_note',area:'knee',side:'left'});
    expect(gateFor('split_squat',[],[],NOW,c,[note]).impactedRegion).toBe(false);
    expect(gateFor('split_squat',[],[],NOW,{...c,startingSide:'left'},[note]).impactedRegion).toBe(true);
    const h=performed('split_squat',hoursBefore(NOW,72),{},sets(2,{kg:20,reps:8}));
    expect(rollingDose('split_squat',[h],NOW).left).toMatchObject({sets:2,repetitions:16});
  });
  it('L: paired execution keeps a reduced left-side target separate from the right side',()=>{
    const c=defaultConfiguration('split_squat');
    const h=performed('split_squat',hoursBefore(NOW,72),{kg:20,reps:10,bandMax:12,configuration:c},sets(3,{kg:20,reps:10}));
    h.sets.forEach((s,i)=>s.detail={version:1,configuration:c,aborted:false,rests:[],performances:(['left','right'] as const).map(side=>({id:`${i}:${side}`,side,status:'done',repetitions:side==='left'?6:10,loadValue:20,secondLoadValue:null,seconds:null,rir:2,technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:c.executionMode,comparisonKey:comparisonKey('split_squat',c)}))});
    const p=planRegular(input({history:[h],profile:{substitutions:{squat:'split_squat'},trainingPreferences:trainingPreferences({exerciseDefaults:{split_squat:c}})},restrictions:[rule({kind:'region_note',area:'knee',side:'left'})]})).exercises.find(e=>e.exerciseId==='split_squat')!;
    expect(p.sideTargets?.left).toEqual({kg:20,reps:6});expect(p.sideTargets?.right?.reps).toBeGreaterThanOrEqual(10);
    const dose=rollingDose('split_squat',[h],NOW);expect(dose.left.repetitions).toBe(18);expect(dose.right.repetitions).toBe(30);
  });
  it('M: ordinal restart moves one available level, never a percentage',()=>{
    const c=defaultConfiguration('leg_press');c.equipment={...c.equipment,id:'levels',unit:'level',measurement:'machine_level',increments:[1,4,9,16],step:1};
    const h=performed('leg_press',hoursBefore(NOW,800),{targetLoadValue:9,reps:7},sets(3,{reps:7}));
    h.sets.forEach((s,i)=>s.detail={version:1,configuration:c,aborted:false,rests:[],targetLoadValue:9,performances:[{id:String(i),side:'both',status:'done',repetitions:7,loadValue:9,secondLoadValue:null,seconds:null,rir:2,technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:'bilateral',comparisonKey:comparisonKey('leg_press',c)}]});
    const r=configuredPrescription({...h.plan,state:'restart'},[h],c,{hoursSinceRelevant:800,experience:'experienced'});
    expect(r.targetLoadValue).toBe(4);expect(r.kg).toBeNull();expect(r.estimatedOneRM).toBeNull();
  });
  it('ordinal minimum is retained on restart; assistance reductions round toward more help',()=>{
    const p={...base,kg:1};expect(next(wins(p),p,{loadModel:'ordinal',availableLoads:[1,4,9],hoursSinceRelevant:800}).kg).toBe(1);
    const assisted={...base,kg:10};const h=[exposure(assisted,{reps:3},0),exposure(assisted,{reps:3},1)];
    expect(next(h,assisted,{loadModel:'assistance',availableLoads:[5,10,15,20],bodyweightKg:80}).kg).toBe(15);
  });
  it('O: added exercise contributes its actual repetitions and overlapping exposure',()=>{
    const h=performed('romanian_deadlift',hoursBefore(NOW,10),{substitutionReason:'USER_ADDED'},sets(4,{kg:40,reps:12}));
    expect(rollingDose('deadlift',[h],NOW).left.repetitions).toBe(48);expect(assessRecovery('deadlift',[h],NOW).residualDose).toBeGreaterThan(0);
  });
  it('P: explicit caps beat manual successes, calibration and replacement',()=>{
    const r=next(wins({...base,kg:100}),{...base,kg:100},{maxLoadKg:81});expect(r.kg).toBeLessThanOrEqual(81);
    const i=input({exerciseSettings:[est('bench_press',200,{maxLoadKg:61})]});
    expect(planReplacement(i,{from:plan('bench_press'),to:'bench_press',others:[]}).planned!.kg).toBeLessThanOrEqual(61);
  });
  it('a knee note affects squat dosage through the real planner but not bench press',()=>{
    const history=[performed('squat',hoursBefore(NOW,72),{kg:60,reps:10,sets:3},sets(3,{kg:60,reps:6,plannedReps:10}))];
    const i=input({history,exerciseSettings:ALL_ESTIMATES,restrictions:[rule({kind:'region_note',area:'knee'})]});
    expect(planRegular(i).exercises.find(e=>e.exerciseId==='squat')).toMatchObject({kg:60,reps:6,sets:3});
    expect(gateFor('bench_press',history,[],NOW,undefined,i.restrictions).impactedRegion).toBe(false);
  });
  it('coarse 20→25 uses bounded reps, never forces a 25% jump',()=>{
    const p={...base,kg:20};const r=next(wins(p),p,{increment:5});expect(r.kg).toBe(20);expect(r.reps).toBe(8);
    const top={...p,reps:9};expect(next(wins(top),top,{increment:5}).reps).toBe(9);
  });
  it('capacity excludes warmups and high reps and resists a single outlier',()=>{
    const h=wins();const old=estimateCapacity(h);h.push(exposure({...base,kg:200}, {},2));expect(estimateCapacity(h).estimatedMax).toBe(old.estimatedMax);
    expect(estimateCapacity([exposure({...base,reps:30})]).estimatedMax).toBeNull();
  });
  it('a duplicate session cannot confirm a trial',()=>{const e=exposure();expect(next([e,e]).adaptive?.confirmed).toBeNull();});
  it('removing confirming observations removes stale confirmation even if a plan carries metadata',()=>{
    const h=wins(),r=next(h);expect(next([h[0]],r).adaptive?.confirmed).toBeNull();
  });
  it('repeated higher manual doses can release an earlier adaptation without clearing the problem',()=>{
    const p={...base,reps:10},h=[exposure(p,{reps:6},0)],adapt=next(h,p,{impactedRegion:true});
    h.push(exposure(adapt,{reps:8},1));expect(next(h,adapt,{impactedRegion:true}).reps).toBe(6);
    h.push(exposure(adapt,{reps:8},2));expect(next(h,adapt,{impactedRegion:true}).reps).toBeGreaterThanOrEqual(8);
  });
  it('recovery mode changes cannot undo the chosen repetition dose',()=>{
    const history=[performed('squat',hoursBefore(NOW,5),{kg:60,reps:10},sets(3,{kg:60,reps:6,plannedReps:10}))];
    const p=prescribe({exerciseId:'squat',mode:'light',sets:3,role:'main',experience:'experienced',settings:est('squat',120),history,gate:{hoursSinceRelevant:5,relevantSymptoms:'none',impactedRegion:true},bodyweightKg:null});
    expect(p.reps).toBeLessThanOrEqual(6);expect(p.kg).toBeLessThanOrEqual(60);
  });
  it('editing planned reps before recording still exposes a chosen dose against the original plan',()=>{
    const h=performed('squat',hoursBefore(NOW,72),{kg:60,reps:10},sets(3,{kg:60,reps:6,plannedReps:6}));
    const p=prescribe({exerciseId:'squat',mode:'heavy',sets:3,role:'main',experience:'experienced',settings:null,history:[h],gate:{hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:true},bodyweightKg:null});
    expect(p).toMatchObject({kg:60,reps:6});expect(p.reasons).toContain('USER_DOSE_ADAPTED');
  });
  it('severe symptoms override even initial calibration',()=>{
    const p=prescribe({exerciseId:'squat',mode:'heavy',sets:3,role:'main',experience:'experienced',settings:est('squat',150),history:[],gate:{hoursSinceRelevant:null,relevantSymptoms:'swelling',impactedRegion:true},bodyweightKg:null});
    expect(p).toMatchObject({kg:null,state:'review_required'});
  });
  it('a region note does not restore the old 48-hour cliff for a small dose',()=>{
    const h=[performed('squat',hoursBefore(NOW,48),{kg:60,reps:7},sets(1,{kg:60,reps:7,rir:5}))];
    const restrictions=[rule({kind:'region_note',area:'knee'})];
    const a=planRegular(input({nowUtc:hoursBefore(NOW,1/60),history:h,restrictions}));
    const b=planRegular(input({nowUtc:NOW,history:h,restrictions}));
    expect(a.exercises.map(e=>[e.exerciseId,e.kg,e.reps,e.sets,e.mode])).toEqual(b.exercises.map(e=>[e.exerciseId,e.kg,e.reps,e.sets,e.mode]));
  });
  it('performed-only mode preserves the original load for chosen-dose detection',()=>{
    const h=performed('squat',hoursBefore(NOW,72),{kg:60,reps:10},sets(3,{kg:50,reps:10,plannedKg:50}));
    const p=prescribe({performedSetsOnly:true,exerciseId:'squat',mode:'heavy',sets:3,role:'main',experience:'experienced',settings:null,history:[h],gate:{hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:true},bodyweightKg:null});
    expect(p).toMatchObject({kg:50,reps:10});expect(p.reasons).toContain('USER_DOSE_ADAPTED');
  });
  it('equipment step and offset survive normal planning and replacement',()=>{
    const c=defaultConfiguration('leg_press');c.equipment={...c.equipment,step:5,minimum:2};
    const history=[0,1].map(i=>{
      const h=performed('leg_press',hoursBefore(NOW,144-i*72),{kg:82,reps:7,configuration:c},sets(3,{kg:82,reps:7,rir:2}));
      h.sets.forEach((s,j)=>s.detail={version:1,configuration:c,aborted:false,rests:[],performances:[{id:String(j),side:'both',status:'done',repetitions:7,loadValue:82,secondLoadValue:null,seconds:null,rir:2,technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:'bilateral',comparisonKey:comparisonKey('leg_press',c)}]});return h;
    });
    const i=input({history,profile:{substitutions:{squat:'leg_press'},trainingPreferences:trainingPreferences({exerciseDefaults:{leg_press:c}})}});
    expect(planRegular(i).exercises.find(e=>e.exerciseId==='leg_press')?.kg).toBe(87);
    expect(planReplacement(i,{from:plan('squat'),to:'leg_press',others:[]}).planned?.kg).toBe(87);
  });
  it('duration records reach the shared trial kernel through the actual comparison adapter',()=>{
    const c=defaultConfiguration('plank');
    const history=[0,1].map(i=>{
      const h=performed('plank',hoursBefore(NOW,144-i*72),{kg:null,loadKind:'duration_sec',targetSeconds:30,sets:2,reps:1,bandMin:1,bandMax:1,configuration:c},sets(2,{kg:null,reps:1,actualSeconds:30,plannedSeconds:30}));
      h.sets.forEach((s,j)=>s.detail={version:1,configuration:c,aborted:false,rests:[],performances:[{id:String(j),side:'both',status:'done',repetitions:null,loadValue:null,secondLoadValue:null,seconds:30,rir:null,technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:'bilateral',comparisonKey:comparisonKey('plank',c)}]});return h;
    });
    const p=prescribe({exerciseId:'plank',mode:'heavy',sets:2,role:'accessory',experience:'experienced',settings:null,history:comparableHistory(history,'plank',c),gate:{hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:false},bodyweightKg:null});
    expect(p.targetSeconds).toBe(35);expect(p.estimatedOneRM).toBeNull();
  });
});

const hs:Harness[]=[];afterEach(async()=>{for(const h of hs.splice(0)){h.sync.dispose();await h.db.delete();}});
it('N: actual delete pipeline removes work from capacity, recovery and future recommendations',async()=>{
  const h=harness();hs.push(h);await onboard(h);h.server.online=false;
  const session=await startSession(h.ctx,await previewNext(h.ctx));const row=(await h.db.sets.where('sessionId').equals(session.id).toArray()).find(s=>s.exerciseId==='squat'&&s.kind==='work')!;
  await recordPerformance(h.ctx,row.id,'both',{actualGrams:60000,actualReps:7});expect((await buildHistory(h.db)).length).toBe(1);
  await deleteTrainingSet(h.ctx,row.id);const history=await buildHistory(h.db);expect(history).toEqual([]);expect(rollingDose('squat',history,h.clock.now()).left.sets).toBe(0);
});
it('P: manual plan edits cannot exceed maximum; actual recording remains factual',async()=>{
  const h=harness();hs.push(h);await onboard(h);h.server.online=false;
  await updateExerciseSettings(h.ctx,'squat',{maxLoadGrams:60000});
  const session=await startSession(h.ctx,await previewNext(h.ctx));const row=(await h.db.sets.where('sessionId').equals(session.id).toArray()).find(s=>s.exerciseId==='squat'&&s.kind==='work')!;
  await expect(editPlannedSet(h.ctx,row.id,{grams:62500})).rejects.toThrow('VALIDATION_ERROR');
  await recordPerformance(h.ctx,row.id,'both',{actualGrams:62500,actualReps:7});expect((await h.db.sets.get(row.id))?.actualGrams).toBe(62500);
});
it('H: removing planned sets and finishing a partial session preserves the selected dose in real history',async()=>{
  const h=harness();hs.push(h);await onboard(h);h.server.online=false;
  const snapshot=await previewNext(h.ctx);const squat=snapshot.exercises.find(e=>e.exerciseId==='squat')!;
  Object.assign(squat,{kg:60,reps:10,sets:4,calibration:false});
  const session=await startSession(h.ctx,snapshot);
  const work=(await h.db.sets.where('sessionId').equals(session.id).toArray()).filter(s=>s.exerciseId==='squat'&&s.kind==='work').sort((a,b)=>a.ordinal-b.ordinal);
  for(const s of work.slice(2))await deleteTrainingSet(h.ctx,s.id);
  for(const s of work.slice(0,2))await recordPerformance(h.ctx,s.id,'both',{actualGrams:60000,actualReps:10});
  expect((await finishSession(h.ctx,session.id)).status).toBe('partial');
  const history=(await buildHistory(h.db)).filter(p=>p.exerciseId==='squat');
  const p=prescribe({exerciseId:'squat',mode:squat.mode,sets:4,role:'main',experience:'experienced',settings:null,history,gate:{hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:true},bodyweightKg:null});
  expect(p).toMatchObject({kg:60,reps:10,sets:2});expect(p.reasons).toContain('USER_DOSE_ADAPTED');
});
it('P: independent second stacks and side overrides are included in the same mass cap',()=>{
  const c=defaultConfiguration('cable_row');c.equipment.basis='independent';
  const d={version:1 as const,configuration:c,performances:[],rests:[],aborted:false,targetLoadValue:40,targetSecondLoadValue:65};
  expect(exceedsPlannedMaximum({targetGrams:null,detail:d},60000)).toBe(true);
  expect(exceedsPlannedMaximum({targetGrams:null,detail:{...d,targetSecondLoadValue:40,plannedSides:{left:{grams:40000,reps:8,seconds:null,secondLoad:65}}}},60000)).toBe(true);
  expect(exceedsPlannedMaximum({targetGrams:null,detail:{...d,configuration:{...c,equipment:{...c.equipment,unit:'level'}}}},60000)).toBe(false);
});
