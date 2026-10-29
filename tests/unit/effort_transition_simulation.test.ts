/* eslint-disable @typescript-eslint/no-explicit-any -- Heterogeneous diagnostic traces are persisted for review; behavior is asserted below. */
import { it, expect, afterAll, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { adaptiveNext, estimateCapacity } from '../../src/domain/adaptiveProgression';
import { recommendNext, isHeavy, type Experience, type Exposure, type Recommendation } from '../../src/domain/decision_engine';
import { prescribe } from '../../src/domain/prescription';
import { assessRecovery, recoveryDose } from '../../src/domain/recoveryPolicy';
import { weeklyDoseGuard, successfulDoseExposure } from '../../src/domain/trainingDose';
import { recommendRest } from '../../src/domain/restPolicy';
import { REASONS } from '../../src/ui/strings';
import { EFFORT_OPTIONS, effectiveRir } from '../../src/domain/effort';
import { plan, performed, sets, input, ALL_ESTIMATES, rule } from './helpers';
import { planRegular } from '../../src/planner/planner';
import { comparableHistory } from '../../src/domain/comparableTraining';
import { comparisonKey, defaultConfiguration } from '../../src/domain/trainingFlow';
import { harness, onboard } from './appHarness';
import { previewNext, startSession, recordPerformance, rateSet, finishSession } from '../../src/application/training';
import { strengthSeries } from '../../src/application/history';
import { buildHistory } from '../../src/application/plannerInput';
import { savedWorkoutFeedback } from '../../src/application/workoutFeedback';
import type { PerformedExercise, PerceivedEffort } from '../../src/domain/model';

vi.setConfig({testTimeout:120000});
const output:any={baselineCommit:'305aa36f4f028f5645a32f98698c26d1ea9a374c',policy:'ADAPTIVE/2.2.0',sessionsPerRun:36, assumptions:'Deterministic synthetic counterfactuals; independent capacity trajectory, no causal or physiological forecast. Effort deliberately varied independently from performance to isolate decision sensitivity. Full traces retained.'};
afterAll(()=>{
 mkdirSync('test-results',{recursive:true});mkdirSync('docs/evidence/effort-scale-2026-10-29',{recursive:true});
 writeFileSync('test-results/effort-simulation.json',JSON.stringify(output,null,2));
 const summary={...output,engine:output.engine.map(({trace,...run}:any)=>({...run,sessions:trace.length})),planner:output.planner.map(({trace,...run}:any)=>({...run,sessions:trace.length,final:trace.at(-1)}))};
 writeFileSync('docs/evidence/effort-scale-2026-10-29/simulation.json',JSON.stringify(summary,null,2));
});
const experiences:Experience[]=['novice','intermediate','experienced'];
const ratings=['too_easy','easy','ok','hard','maximal','mixed','none','rir2'] as const;
const base:Recommendation={exerciseId:'bench_press',kg:60,reps:6,sets:3,bandMin:6,bandMax:10,mode:'moderate',state:'normal',reasons:[],engineVersion:'2.1.0',confidence:'low'};
const date=(i:number)=>new Date(Date.UTC(2026,0,1)+i*72*3600000).toISOString();
function feeling(r:string,i:number,j:number):PerceivedEffort|null { return r==='none'||r==='rir2'?null:r==='mixed'?(['easy','ok','hard','maximal'] as const)[(i+j)%4]:r as PerceivedEffort; }
function exposure(p:Recommendation,i:number,r:string,kg=p.kg!,reps=p.reps):Exposure {return {id:`e${i}`,exerciseId:p.exerciseId,whenUtc:date(i),complete:true,finished:true,plannedSets:p.sets,plannedTargetReps:p.reps,bandMax:p.bandMax,symptom:'none',attemptBaseline:p.adaptive?.trialBaseline,attempted:p.adaptive?.attempted,sets:Array.from({length:p.sets},(_,j)=>({kind:'work',status:'done',plannedKg:p.kg!,originalKg:p.kg!,actualKg:kg,plannedReps:p.reps,originalReps:p.reps,actualReps:reps,rir:effectiveRir(r==='rir2'?2:null,feeling(r,i,j)),effort:feeling(r,i,j),technique:'controlled'}))};}
it('thresholds, exact reasons, conflicts and confirmation are reproducible',()=>{
 const rows=[];
 for(const count of [1,2,3,4])for(const rating of ['hard','maximal','too_heavy','rir1','rir0'])for(let n=0;n<=count;n++){
  const p={...base,sets:count}; const h=Array.from({length:3},(_,i)=>exposure(p,i,'ok'));
  h[2].sets.forEach((s,j)=>{s.effort=j<n?(rating.startsWith('rir')?null:rating as PerceivedEffort):'ok';s.rir=j<n&&rating.startsWith('rir')?Number(rating.at(-1)):null;});
  const next=adaptiveNext({previous:p,history:h,experience:'experienced',increment:2.5,impactedRegion:false});
  rows.push({count,rating,n,reason:next.reasons[0],nextKg:next.kg,nextReps:next.reps});
 }
 output.thresholds=rows;
 expect(rows.find(x=>x.count===3&&x.rating==='hard'&&x.n===2)?.reason).toBe('DOUBLE_PROGRESS_REPS');
 expect(rows.find(x=>x.count===3&&x.rating==='hard'&&x.n===1)?.reason).toBe('DOUBLE_PROGRESS_REPS');
 const h=[exposure(base,0,'hard'),exposure(base,1,'hard')];h.forEach(e=>e.sets.forEach(s=>s.rir=4));
 const conflict=adaptiveNext({previous:base,history:h,experience:'experienced',increment:2.5,impactedRegion:false});
 output.conflictingHardRir4={reason:conflict.reasons[0],text:REASONS[conflict.reasons[0]].text};
 expect(conflict.reasons[0]).toBe('HARD_EFFORT_CONFIRMATION');
});
it('192 engine trajectories with 36 sessions each',()=>{
 const trajectories=['improving','stable','temporary_decline','failed_trials','manual_reduction','break_return','restriction','self_improving'] as const;
 output.engine=[];
 for(const experience of experiences)for(const rating of ratings)for(const trajectory of trajectories){
  let p={...base};const history:Exposure[]=[],trace:any[]=[];
  for(let i=0;i<36;i++){
   let capacity=75*(trajectory==='stable'||trajectory==='failed_trials'?1:1+.004*i);
   if(trajectory==='temporary_decline'&&i>=12&&i<16)capacity*=.82;
   let kg=p.kg!,reps=Math.max(1,Math.min(p.reps,Math.floor(30*(capacity/kg-1))));
   if(trajectory==='manual_reduction'&&i===10){kg-=10;reps=p.reps;}
   if(trajectory==='restriction'&&i>=10&&i<25){kg=Math.min(kg,50);reps=Math.min(reps,5);}
   if(trajectory==='self_improving'){kg=60+Math.floor(i/6)*2.5;reps=6+Math.floor(i%6/2);}
   const e=exposure(p,i,rating,kg,reps);if(trajectory==='break_return'&&i>=16)e.whenUtc=new Date(Date.parse(e.whenUtc)+32*86400000).toISOString();history.push(e);
   const args={previous:p,history,experience,increment:2.5,impactedRegion:trajectory==='restriction'&&i>=10&&i<25,hoursSinceRelevant:trajectory==='break_return'&&i===15?840:72,relevantSymptoms:'none' as const};
   const next=recommendNext(args);expect(recommendNext(args)).toEqual(next);expect(next.kg).toBeGreaterThanOrEqual(0);
   trace.push({session:i+1,capacity,observed:{kg,reps,sets:e.sets.length},target:{kg:p.kg,reps:p.reps,sets:p.sets},next:{kg:next.kg,reps:next.reps,sets:next.sets},reason:next.reasons[0],confirmed:next.adaptive?.confirmed});p=next;
  }
  const reasons:Record<string,number>={};trace.forEach(t=>reasons[t.reason]=(reasons[t.reason]??0)+1);
  output.engine.push({experience,rating,trajectory,final:{kg:p.kg,reps:p.reps,sets:p.sets},reasons,trace});
 }
 for(const x of output.engine.filter((x:any)=>x.rating==='hard'&&x.trajectory==='improving')){expect(x.final.kg).toBeGreaterThan(60);expect(x.reasons.LOW_RIR_HOLD??0).toBe(0);}
});
it('30-session repeated performance, recovery and dose comparison',()=>{
 output.tolerance=[];
 for(const rating of ratings)for(const gap of [24,48,72]){
  const h:PerformedExercise[]=[];
  for(let i=0;i<36;i++){
   const at=new Date(Date.UTC(2026,0,1)+i*gap*3600000).toISOString();
   h.push(performed('bench_press',at,{kg:60,reps:8,sets:3,mode:'moderate',estimatedOneRM:null},sets(3,{kg:60,reps:8,rir:rating==='rir2'?2:null,perceivedEffort:feeling(rating,i,0)})));
  }
  const now=new Date(Date.parse(h.at(-1)!.whenUtc)+gap*3600000).toISOString();
  output.tolerance.push({rating,gap,successful:h.filter(successfulDoseExposure).length,recovery:assessRecovery('bench_press',h,now),weekly:weeklyDoseGuard('bench_press',h,now)});
 }
});
it('54 whole-planner trajectories, each 36 sessions, three experience levels and qualitative ratings',()=>{
 output.planner=[];
 for(const experience of experiences)for(const rating of ['easy','ok','hard','maximal','mixed','none'])for(const trajectory of ['improving','stable','restriction']){
  const history:PerformedExercise[]=[],trace:any[]=[];
  for(let i=0;i<36;i++){
   const now=date(i),p=planRegular(input({nowUtc:now,history,rotationIndex:i,exerciseSettings:ALL_ESTIMATES,profile:{experience,plannedSessionsPerWeek:2},restrictions:trajectory==='restriction'&&i>=10&&i<25?[rule({kind:'region_note',area:'knee'})]:[]}));
   trace.push({session:i+1,minutes:p.estimatedMinutes,exercises:p.exercises.map(e=>({id:e.exerciseId,kg:e.kg,reps:e.reps,sets:e.sets,mode:e.mode,reasons:e.reasons}))});
   for(const e of p.exercises){
    const initial=ALL_ESTIMATES.find(s=>s.exerciseId===e.exerciseId)?.estimate?.kg??60;
    const capacity=initial*(trajectory==='stable'?1:1+.003*i),kg=e.kg??Math.floor(initial*.4/2.5)*2.5;
    const possible=kg>0?Math.max(1,Math.floor(30*(capacity/kg-1))):e.reps;
    const count=trajectory==='restriction'&&i>=10&&i<25&&e.exerciseId==='squat'?Math.min(2,e.sets):e.sets;
    const setList=sets(count,{kg,reps:Math.min(e.reps,possible),plannedKg:e.kg,plannedReps:e.reps,rir:null});setList.forEach((s,j)=>{s.perceivedEffort=feeling(rating,i,j);s.rir=effectiveRir(null,s.perceivedEffort);});
    const h=performed(e.exerciseId,now,e,setList);h.sessionId=`${experience}-${rating}-${trajectory}-${i}`;history.push(h);
   }
  }
  output.planner.push({experience,rating,trajectory,trace});
 }
});
it('36-session side-specific projection and shared targets',()=>{
 output.sides=[];
 for(const experience of experiences)for(const rating of ['hard','maximal','none']){
  const id='one_arm_dumbbell_row',c=defaultConfiguration(id),h:PerformedExercise[]=[];
  c.executionMode='alternating';
  for(let i=0;i<36;i++){
   const p=plan(id,{kg:25,reps:8,sets:3,mode:'moderate',bandMin:6,bandMax:10,configuration:c});
   const work=sets(3,{kg:20,reps:8});
   work.forEach((s,j)=>s.detail={version:1,configuration:c,plannedSides:{left:{grams:20000,reps:8,seconds:null},right:{grams:25000,reps:8,seconds:null}},performances:(['left','right'] as const).map(side=>({id:`${i}:${j}:${side}`,side,status:'done',loadValue:side==='left'?20:25,secondLoadValue:null,repetitions:8,seconds:null,rir:null,effort:side==='left'?feeling(rating,i,j):'easy',technique:'controlled',startedAt:null,completedAt:date(i),equipment:c.equipment,executionMode:c.executionMode,comparisonKey:comparisonKey(id,c)})),rests:[],aborted:false} as any);
   work.forEach(s=>s.detail!.prescriptionOrigin={version:1,source:'engine',role:'ordinary',original:{loadValue:25,secondLoadValue:null,reps:8,seconds:null},originalSides:{left:{loadValue:20,secondLoadValue:null,reps:8,seconds:null},right:{loadValue:25,secondLoadValue:null,reps:8,seconds:null}},userEditedSides:[]});
   h.push(performed(id,date(i),p,work));
  }
  const run=(side?:'left'|'right')=>{const projected=comparableHistory(h,id,c,'default',side);return prescribe({exerciseId:id,mode:'moderate',sets:3,role:'main',experience,settings:null,history:projected,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none'},bodyweightKg:80});};
  output.sides.push({experience,rating,shared:run(),left:run('left'),right:run('right')});
 }
});
it('calibration, capacity and rest counterexamples',()=>{
 output.calibration=[];
 for(const experience of experiences)for(const effort of [...EFFORT_OPTIONS,'too_heavy',null] as const){
  const h=performed('bench_press',date(0),{kg:null,calibration:true,reps:6,bandMin:6,bandMax:10,mode:'moderate',estimatedOneRM:null},sets(3,{kg:60,reps:3,plannedReps:6,perceivedEffort:effort}));
  const r=prescribe({exerciseId:'bench_press',mode:'moderate',sets:3,role:'main',experience,settings:null,history:[h],gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none'},bodyweightKg:80});
  output.calibration.push({experience,effort,performedReps:3,next:{kg:r.kg,reps:r.reps},reasons:r.reasons});
 }
 expect(output.calibration.find((r:any)=>r.experience==='experienced'&&r.effort==='maximal').next).toEqual({kg:60,reps:3});
 output.capacity=[];
 for(const rir of [null,0,1,2,3,4]){
  const h=Array.from({length:3},(_,i)=>{const e=exposure({...base,reps:8},i,'none');e.sets.forEach(s=>s.rir=rir);return e;});
  const capacity=estimateCapacity(h);output.capacity.push({rir,capacity,relative:60/capacity.estimatedMax!,heavy:isHeavy({sets:3,exerciseId:'bench_press',mode:'moderate',plannedKg:60,estimatedOneRM:capacity.estimatedMax})});
 }
 output.rest=ratings.map(rating=>({rating,...recommendRest({category:'barbell_compound',mode:'moderate',strengthFocus:true,experience:'experienced',adaptive:true,kind:'work',nextKind:'work',effort:feeling(rating,0,0),effortRir:effectiveRir(null,feeling(rating,0,0))})}));
 output.recoveryFactors=ratings.map(rating=>({rating,dose:recoveryDose(8,null,feeling(rating,0,0))}));
 const history=Array.from({length:3},(_,i)=>performed('bench_press',date(i),{kg:60,reps:8,sets:3,mode:'moderate',estimatedOneRM:120,confidence:'medium'},sets(3,{kg:60,reps:8,rir:null,perceivedEffort:'easy'})));
 const replaced=prescribe({exerciseId:'bench_press',mode:'moderate',sets:3,role:'main',experience:'experienced',settings:{exerciseId:'bench_press',experience:null,incrementKg:null,estimate:{kind:'1rm',kg:120,measured:true},maxLoadKg:null,machineMinKg:null,machineMaxKg:null},history,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none'},bodyweightKg:80});
 output.replacedMaximum={before:120,after:replaced.estimatedOneRM,confidence:replaced.confidence,capacity:replaced.adaptive?.capacity,heavy:isHeavy({sets:3,exerciseId:'bench_press',mode:replaced.mode,plannedKg:replaced.kg,estimatedOneRM:replaced.estimatedOneRM})};
 expect(replaced.estimatedOneRM).toBe(120);expect(replaced.confidence).toBe('medium');
});
it('application: calibration caps repetitions and graphs retain 3x6 versus 3x8',async()=>{
 const h=harness();await onboard(h);
 try{
  output.application=[];
  for(let i=0;i<3;i++){
   h.clock.advanceHours(72);const p=await previewNext(h.ctx);
   p.exercises=[{...plan('bench_press',{kg:i===0?null:60,reps:6,mode:'moderate',bandMin:6,bandMax:10,estimatedOneRM:null,calibration:i===0}),sets:3}];
   const session=await startSession(h.ctx,p);const se=(await h.db.sessionExercises.where('sessionId').equals(session.id).toArray())[0];
   const work=(await h.db.sets.where('sessionId').equals(session.id).toArray()).filter(s=>s.kind==='work').sort((a,b)=>a.ordinal-b.ordinal);
   for(const [j,s] of work.entries()){
    await recordPerformance(h.ctx,s.id,'both',{actualGrams:60000,actualReps:i===0?3:i===1?6:8,technique:'controlled'});
    if(i===0){await rateSet(h.ctx,s.id,'maximal');if(j===0){const next=await h.db.sets.get(work[1].id);output.calibrationRemaining=next?.targetGrams;expect(next?.targetReps).toBe(3);}}
    if(i===2)await rateSet(h.ctx,s.id,'hard');
   }
   await finishSession(h.ctx,session.id);
   const hist=comparableHistory(await buildHistory(h.db),'bench_press',se.configuration);
   const next=prescribe({exerciseId:'bench_press',mode:'moderate',sets:3,role:'main',experience:'experienced',settings:null,history:hist,gate:{hoursSinceRelevant:72,impactedRegion:false,relevantSymptoms:'none'},bodyweightKg:80});
   output.application.push({sessionId:session.id,reps:i===0?3:i===1?6:8,next:{kg:next.kg,reps:next.reps,reasons:next.reasons},series:await strengthSeries(h.ctx,'bench_press'),feedback:await savedWorkoutFeedback(h.ctx,session.id),calibrations:await h.db.calibrations.toArray()});
  }
  const points=output.application.at(-1).series.points.filter((p:any)=>p.source==='performance');
  expect(points.map((p:any)=>p.kg)).toEqual([60,60,60]);expect(output.calibrationRemaining).toBe(60000);expect(points.map((p:any)=>p.work.map((w:any)=>w.reps))).toEqual([[3,3,3],[6,6,6],[8,8,8]]);expect(output.application.at(-1).feedback.insight).toBeDefined();
  output.applicationHistory=(await buildHistory(h.db)).map(h=>({id:h.sessionId,sets:h.sets.map(s=>({rir:s.rir,effort:s.perceivedEffort}))}));
 }finally{h.sync.dispose();await h.db.delete();}
});
it('two short maximal calibration workouts cannot establish calibrated quality',async()=>{
 const h=harness();await onboard(h);
 try{
  for(let i=0;i<2;i++){
   h.clock.advanceHours(72);const p=await previewNext(h.ctx);p.exercises=[plan('bench_press',{kg:null,reps:6,sets:3,mode:'moderate',calibration:true})];
   const session=await startSession(h.ctx,p),work=(await h.db.sets.where('sessionId').equals(session.id).toArray()).filter(s=>s.kind==='work');
   for(const s of work){await recordPerformance(h.ctx,s.id,'both',{actualGrams:60000,actualReps:3});await rateSet(h.ctx,s.id,'maximal');}
   await finishSession(h.ctx,session.id);
  }
  output.maximalCalibrationQuality=await h.db.calibrations.toArray();
  expect(output.maximalCalibrationQuality.some((c:any)=>c.quality==='calibrated')).toBe(false);
 }finally{h.sync.dispose();await h.db.delete();}
});
it('application rest adapter retains easy feedback on a repetition drop',async()=>{
 const h=harness();await onboard(h);
 try{
  const p=await previewNext(h.ctx);p.exercises=[plan('bench_press',{kg:60,reps:10,sets:3,mode:'moderate',estimatedOneRM:null})];
  const session=await startSession(h.ctx,p),work=(await h.db.sets.where('sessionId').equals(session.id).toArray()).filter(s=>s.kind==='work').sort((a,b)=>a.ordinal-b.ordinal);
  await recordPerformance(h.ctx,work[0].id,'both',{actualGrams:60000,actualReps:10});await rateSet(h.ctx,work[0].id,'easy');
  h.clock.advanceHours(.1);
  await recordPerformance(h.ctx,work[1].id,'both',{actualGrams:60000,actualReps:8});await rateSet(h.ctx,work[1].id,'easy');
  const saved=(await h.db.sets.get(work[1].id))!;output.easyRest=saved.detail!.rests;
  expect(saved.detail!.rests.at(-1)!.reasons).not.toContain('REPETITIONS_DECREASED_UNCERTAIN');
 }finally{h.sync.dispose();await h.db.delete();}
});
