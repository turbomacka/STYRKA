import { afterEach, describe, expect, it } from 'vitest';
import { recommendNext, type Exposure } from '../../src/domain/decision_engine';
import { configuredPrescription } from '../../src/domain/configuredPrescription';
import { prescribe, toExposure } from '../../src/domain/prescription';
import { comparableHistory } from '../../src/domain/comparableTraining';
import { comparisonKey, defaultConfiguration } from '../../src/domain/trainingFlow';
import type { PerceivedEffort } from '../../src/domain/model';
import { RECOVERY_POLICY, type RecoveryAssessment } from '../../src/domain/recoveryPolicy';
import { base, exposure } from './adaptiveFixtures';
import { NOW, performed, sets } from './helpers';
import { harness, onboard, type Harness } from './appHarness';
import { finishSession, previewNext, recordPerformance, startSession } from '../../src/application/training';
import { editPlannedSet } from '../../src/application/workout';
import { buildHistory } from '../../src/application/plannerInput';

const next=(h:Exposure[],p=base,extra:Partial<Parameters<typeof recommendNext>[0]>={})=>recommendNext({previous:p,history:h,experience:'experienced',increment:2.5,hoursSinceRelevant:72,relevantSymptoms:'none',impactedRegion:false,...extra});
function observed(p=base,kg=p.kg!,reps=p.reps,feeling:PerceivedEffort|null='ok',i=0):Exposure {
 const e=exposure(p,{kg,reps,rir:null},i);e.attemptBaseline=p.adaptive?.trialBaseline;e.attempted=p.adaptive?.attempted;e.sets.forEach(s=>s.effort=feeling);return e;
}
const wins=()=>[observed(base,80,7,'ok',0),observed(base,80,7,'ok',1)];
const neutral:RecoveryAssessment={version:RECOVERY_POLICY.version,modeCap:null,activeHours:null,reason:null};

describe('manual dose revision: actual choice, effort and trial anchor',()=>{
 it.each(['ok','easy'] as const)('keeps a completed higher manual weight (%s), without RIR or old percentage caps',effort=>{
  const h=wins();h.push(observed(base,82.5,7,effort,2));const r=next(h);expect(r.kg).toBeGreaterThanOrEqual(82.5);expect(r.adaptive?.workingDose).toEqual({kg:82.5,reps:7,sets:3});
 });
 it('accepts manual 82.5 x 5 + ok against app 80 x 7 as a provisional dose, not new confirmed strength',()=>{
  const h=wins();h.push(observed(base,82.5,5,'ok',2));const r=next(h);
  expect(r).toMatchObject({kg:82.5,reps:5,sets:3});expect(r.adaptive?.confirmed).toEqual({kg:80,reps:7,sets:3});expect(r.reasons).toContain('MANUAL_WORKING_DOSE');
 });
 it('unchanged app trial with missed reps is a failed trial even if it was rated ok',()=>{
  const h=wins(),trial=next(h);h.push(observed(trial,trial.kg!,3,'ok',2));expect(next(h,trial)).toMatchObject({kg:80,reps:7});
 });
 it('a lower manual load + ok is respected and not counted as two strength failures',()=>{
  const a=observed(base,75,7,'ok',0),r=next([a]);expect(r).toMatchObject({kg:75,reps:7});
  const b=observed(base,75,7,'ok',1);expect(next([a,b]).kg).toBeGreaterThanOrEqual(75);expect(next([a,b]).reasons).not.toContain('TWO_CONSECUTIVE_MISSES');
 });
 it('allows a supported load trial immediately after a representative easy reduction and keeps its own fallback',()=>{
  const h=wins();h.push(observed(base,75,7,'easy',2));const trial=next(h);
  expect(trial).toMatchObject({kg:77.5,reps:5});expect(trial.reasons).toContain('EASY_SELECTED_DOSE_TRIAL');expect(trial.adaptive?.trialBaseline).toEqual({kg:75,reps:7,sets:3});
  h.push(observed(trial,77.5,3,'maximal',3));expect(next(h,trial)).toMatchObject({kg:75,reps:7,sets:3});
 });
 it('previews do not provide evidence or stack successive trials',()=>{
  const h=[observed(base,75,7,'easy')],r=next(h);for(let i=0;i<10;i++)expect(next(h,r)).toMatchObject({kg:r.kg,reps:r.reps});
 });
 it('one easy response is insufficient for the immediate trial; two of three is representative',()=>{
  const e=observed(base,75,7,null);e.sets[0].effort='easy';expect(next([e]).kg).toBe(75);
  e.sets[1].effort='easy';expect(next([e]).kg).toBe(77.5);
 });
 it('easy does not override low RIR, an explicit maximum, recovery or problem-related dose',()=>{
  const e=observed(base,75,7,'easy');e.sets[2].rir=0;expect(next([e]).kg).toBeLessThanOrEqual(75);
  e.sets[2].rir=null;expect(next([e],base,{maxLoadKg:75}).kg).toBe(75);
  expect(next([e],base,{recovery:{...neutral,modeCap:'moderate'}}).kg).toBe(75);
  expect(next([e],base,{impactedRegion:true})).toMatchObject({kg:75,reps:7});
 });
 it('problem-related dose can be reviewed from later positive observations without a manual increase',()=>{
  const initial=observed({...base,reps:10},60,6,'easy');let r=next([initial],{...base,reps:10},{impactedRegion:true});
  const h=[initial,observed(r,60,6,'easy',1),observed(r,60,6,'easy',2)];r=next(h,r,{impactedRegion:true});
  expect(r.reps).toBe(7);expect(r.reasons).toContain('USER_DOSE_REVIEW_TRIAL');expect(r.adaptive?.trialBaseline?.reps).toBe(6);
 });
 it('confirming a repetition review preserves the separately selected lower load and requires fresh support',()=>{
  const p={...base,kg:60},h=[observed(p,55,5,'easy')];
  let r=next(h,p,{impactedRegion:true});
  h.push(observed(r,55,5,'easy',1),observed(r,55,5,'easy',2));r=next(h,r,{impactedRegion:true});
  expect(r.reps).toBe(6);expect(r.reasons).toContain('USER_DOSE_REVIEW_TRIAL');
  h.push(observed(r,55,6,'easy',3),observed(r,55,6,'easy',4));r=next(h,r,{impactedRegion:true});
  expect(r).toMatchObject({kg:55,reps:6});expect(r.adaptive?.chosenDose).toEqual({kg:55,reps:6,sets:3});expect(r.adaptive?.chosenDimensions).toEqual(['load']);
  h.push(observed(r,55,6,'easy',5));expect(next(h,r,{impactedRegion:true}).reps).toBe(6);
  h.push(observed(r,55,6,'easy',6));r=next(h,r,{impactedRegion:true});expect(r.reps).toBe(7);expect(r.reasons).toContain('USER_DOSE_REVIEW_TRIAL');
  h.push(observed(r,55,7,'easy',7),observed(r,55,7,'easy',8));r=next(h,r,{impactedRegion:true});expect(r.kg).toBe(55);expect(r.adaptive?.chosenDimensions).toEqual(['load']);
  h.push(observed(r,55,7,'easy',9),observed(r,55,7,'easy',10));r=next(h,r,{impactedRegion:true});expect(r).toMatchObject({kg:57.5,reps:5});expect(r.reasons).toContain('USER_DOSE_REVIEW_TRIAL');expect(r.adaptive?.trialBaseline?.kg).toBe(55);
 });
 it.each([{loads:[80,80,60]},{loads:[80,80,85]}])('does not make mixed loads $loads the prescription for all sets',({loads})=>{
  const e=observed();e.sets.forEach((s,i)=>s.actualKg=loads[i]);const r=next([e]);expect(r.kg).toBe(80);expect(r.reasons).toContain('MIXED_WORK_DOSE_HOLD');
 });
 it('an extra easy set counts in actual reps but not in the ordinary target or confirmation',()=>{
  const e=observed({...base,sets:2});e.sets.push({...e.sets[0],actualKg:85,effort:'easy',role:'extra'});const r=next([e],{...base,sets:2});expect(r.sets).toBe(2);expect(r.adaptive?.completedReps).toBe(21);
 });
 it('an isolated final hard/low RIR set does not permanently veto whole-exercise progression',()=>{
  const h=wins();for(const e of h)e.sets[2]={...e.sets[2],rir:1,effort:'hard'};expect(next(h).kg).toBe(82.5);
  for(const e of h)e.sets.forEach(s=>{s.rir=0;s.effort='maximal';});expect(next(h).kg).toBe(80);
 });
 it('an unfinished exercise cannot establish the lower selected dose just from an easy set',()=>{
  const e=observed(base,75,7,'easy');e.sets=e.sets.slice(0,1);e.complete=false;e.finished=false;e.voluntaryAbort=true;expect(next([e]).kg).toBe(80);
 });
 it('removing the selected observation invalidates its cached trial anchor',()=>{
  const e=observed(base,75,7,'easy'),r=next([e]);const missed=observed(r,r.kg!,3,'maximal',1);expect(next([missed],r).adaptive?.workingDose).toBeNull();
 });
 it('a repeatedly declined trial cannot masquerade as a fresh manual choice and bypass cooldown',()=>{
  const h=[observed(base,75,7,'easy')],trial=next(h);
  const declined=observed(trial,75,7,'easy',1);h.push(declined);
  expect(next(h,trial)).toMatchObject({kg:75,reps:7});expect(next(h,trial).reasons).toContain('TRIAL_RETURN_TO_CONFIRMED');
  const edited=structuredClone(declined);edited.sets.forEach(s=>{s.originalKg=trial.kg;s.plannedKg=75;});
  expect(next([h[0],edited],trial)).toMatchObject({kg:75,reps:7});expect(next([h[0],edited],trial).reasons).toContain('TRIAL_RETURN_TO_CONFIRMED');
 });
 it('assistances use the opposite load direction and coarse external steps remain bounded',()=>{
  const p={...base,kg:20},e=observed(p,25,7,'easy');expect(next([e],p,{loadModel:'assistance',bodyweightKg:80}).kg).toBe(22.5);
  const small={...base,kg:25},low=observed(small,20,7,'easy');expect(next([low],small,{increment:5}).kg).toBe(20);
 });
});

const databases:Harness[]=[];
afterEach(async()=>{for(const h of databases.splice(0)){h.sync.dispose();await h.db.delete();}});
describe('real registration paths feed identical selected-dose decisions',()=>{
 it.each([{kg:75,reps:7,effort:'ok' as const,expectedKg:75},{kg:75,reps:7,effort:'easy' as const,expectedKg:77.5},{kg:82.5,reps:5,effort:'ok' as const,expectedKg:82.5}])('$kg x $reps with $effort has the same result before/after target editing',async({kg,reps,effort,expectedKg})=>{
  const outcomes=[];
  for(const editFirst of [false,true]) {
   const h=harness();databases.push(h);await onboard(h);
   const snapshot=await previewNext(h.ctx),bench=snapshot.exercises.find(e=>e.exerciseId==='bench_press')!;
   const c=defaultConfiguration('bench_press');
   const session=await startSession(h.ctx,{...snapshot,exercises:[{...bench,mode:'heavy',kg:80,reps:7,bandMin:5,bandMax:7,sets:3,calibration:false,configuration:c}]});
   const rows=(await h.db.sets.where('sessionId').equals(session.id).sortBy('ordinal')).filter(s=>s.kind==='work');
   for(const s of rows) {if(editFirst)await editPlannedSet(h.ctx,s.id,{grams:kg*1000,reps});await recordPerformance(h.ctx,s.id,'both',{actualGrams:kg*1000,actualReps:reps,perceivedEffort:effort,technique:'controlled'});}
   await finishSession(h.ctx,session.id);
   const history=comparableHistory(await buildHistory(h.db),'bench_press',c);
   const result=prescribe({exerciseId:'bench_press',mode:'heavy',sets:3,role:'main',experience:'experienced',history,settings:null,bodyweightKg:null,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none',recovery:neutral}});
   expect(result.kg).toBe(expectedKg);outcomes.push([result.kg,result.reps,result.sets,result.adaptive?.workingDose]);
  }
  expect(outcomes[0]).toEqual(outcomes[1]);
 });
});

describe('shared observation and adapter context',()=>{
 it('pre-edited and directly recorded lower load have identical progression semantics',()=>{
  const raw=performed('bench_press',NOW,{kg:80,reps:7,sets:3},sets(3,{kg:75,reps:7}));raw.sets.forEach(s=>{s.perceivedEffort='ok';s.rir=null;s.plannedKg=80;});
  const edited=structuredClone(raw);edited.sets.forEach(s=>{s.plannedKg=75;s.provenance={source:'user',role:'ordinary',original:{loadValue:80,reps:7}};});
  const a=next([toExposure(raw)]),b=next([toExposure(edited)]);expect([a.kg,a.reps,a.sets]).toEqual([b.kg,b.reps,b.sets]);expect(a.kg).toBe(75);
 });
 it('preserves effort and original targets on the correct side',()=>{
  const c=defaultConfiguration('split_squat'),h=performed('split_squat',NOW,{configuration:c,kg:20,reps:7},sets(3,{kg:20,reps:7}));
  h.sets.forEach((s,i)=>s.detail={version:1,configuration:c,rests:[],aborted:false,prescriptionOrigin:{version:1,role:'ordinary',original:{loadValue:20,secondLoadValue:null,reps:7,seconds:null},originalSides:{left:{loadValue:18,secondLoadValue:null,reps:6,seconds:null}},userEditedSides:['left']},performances:(['left','right'] as const).map(side=>({id:`${i}-${side}`,side,status:'done',loadValue:side==='left'?17:20,secondLoadValue:null,repetitions:7,seconds:null,rir:null,effort:side==='left'?'easy':'hard',technique:'controlled',startedAt:null,completedAt:NOW,equipment:c.equipment,executionMode:c.executionMode,comparisonKey:comparisonKey('split_squat',c)}))});
  const left=toExposure(comparableHistory([h],'split_squat',c,'default','left')[0]),right=toExposure(comparableHistory([h],'split_squat',c,'default','right')[0]);
  expect(left.sets[0]).toMatchObject({effort:'easy',originalKg:18,originalReps:6});expect(right.sets[0].effort).toBe('hard');
 });
 const levelHistory=()=>{
  const c=defaultConfiguration('leg_press');c.equipment={...c.equipment,id:'ordinal-manual',unit:'level',measurement:'machine_level',increments:[1,4,5,6,9,16],step:1};
  const make=(mode:'heavy'|'moderate',index:number,value:number,reps:number)=>{
   const h=performed('leg_press',new Date(Date.parse(NOW)+index*86400000).toISOString(),{configuration:c,mode,targetLoadValue:9,kg:null,reps:10,sets:3},sets(3,{reps,plannedReps:10}));h.sessionId=`level-${index}`;
   h.sets.forEach((s,i)=>s.detail={version:1,configuration:c,rests:[],aborted:false,targetLoadValue:9,performances:[{id:`${index}-${i}`,side:'both',status:'done',loadValue:value,secondLoadValue:null,repetitions:reps,seconds:null,rir:null,effort:'ok',technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:c.executionMode,comparisonKey:comparisonKey('leg_press',c)}]});return h;
  };
  return {c,history:[make('heavy',0,9,10),make('heavy',1,9,10),make('moderate',2,5,6)]};
 };
 it('a lower selected ordinal dose survives a heavy/moderate mode switch',()=>{
  const {c,history}=levelHistory();const r=configuredPrescription({...history[0].plan,bandMin:5,bandMax:7},history,c,{experience:'experienced',impactedRegion:true,recovery:neutral,hoursSinceRelevant:72});
  expect(r).toMatchObject({targetLoadValue:5,reps:6,sets:3});
 });
 it('continuous recovery remains authoritative across 47:59 / 48:00 in the ordinal adapter',()=>{
  const {c,history}=levelHistory();const h=history.slice(0,2),p={...h[1].plan,bandMin:6,bandMax:10,state:'normal' as const};
  const f=(hours:number)=>configuredPrescription(p,h,c,{hoursSinceRelevant:hours,recovery:{...neutral,modeCap:'moderate',activeHours:hours},experience:'experienced'});
  expect([f(48-1/60).targetLoadValue,f(48).targetLoadValue]).toEqual([9,9]);
 });
 it('restores one temporary set without separately progressing load/reps or undoing a manual load choice',()=>{
  const h=performed('bench_press',NOW,{kg:80,reps:7,sets:1,doseContext:{version:'DOSE/2.1.0',ordinarySets:3,temporaryReasons:['TIME_SETS_REDUCED']}},sets(1,{kg:75,reps:7}));h.sets[0].plannedKg=80;h.sets[0].perceivedEffort='ok';
  const r=prescribe({exerciseId:'bench_press',mode:h.plan.mode,sets:3,ordinarySets:3,role:'main',experience:'experienced',history:[h],settings:null,bodyweightKg:null,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none',recovery:neutral}});
  expect(r).toMatchObject({kg:75,reps:7,sets:2});expect(r.reasons).toContain('TEMPORARY_SETS_RESTORED');
 });
 it('revalidates both independent stack ceilings after restoring a temporary set',()=>{
  const c=defaultConfiguration('bench_press');c.equipment={...c.equipment,id:'two-stacks',basis:'independent',stackCount:2,step:2.5};
  const h=performed('bench_press',NOW,{configuration:c,kg:null,targetLoadValue:100,targetSecondLoadValue:100,reps:7,sets:1,doseContext:{version:'DOSE/2.1.0',ordinarySets:3,temporaryReasons:['TIME_SETS_REDUCED']}},sets(1,{kg:100,reps:7}));
  h.sets[0].detail={version:1,configuration:c,rests:[],aborted:false,targetLoadValue:100,targetSecondLoadValue:100,performances:[{id:'stacks',side:'both',status:'done',loadValue:100,secondLoadValue:100,repetitions:7,seconds:null,rir:2,effort:'ok',technique:'controlled',startedAt:null,completedAt:NOW,equipment:c.equipment,executionMode:c.executionMode,comparisonKey:comparisonKey('bench_press',c)}]};
  const p={...h.plan,sets:3,doseContext:{version:'DOSE/2.1.0' as const,ordinarySets:3,temporaryReasons:[]}};
  const r=configuredPrescription(p,[h],c,{hoursSinceRelevant:72,recovery:neutral,maxLoadKg:81});
  expect(r.sets).toBe(2);expect(r.targetLoadValue).toBe(80);expect(r.targetSecondLoadValue).toBe(80);
 });
});
