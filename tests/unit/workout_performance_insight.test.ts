import { expect, it } from 'vitest';
import { comparisonKey, defaultConfiguration, type PerformanceSide } from '../../src/domain/trainingFlow';
import { workoutPerformanceInsight } from '../../src/domain/workoutPerformanceInsight';
import { selectFeedback, WORKOUT_FEEDBACK, WORKOUT_FEEDBACK_VERSION, type FeedbackChoice } from '../../src/domain/workoutFeedback';
import type { ExerciseId } from '../../src/domain/catalog';
import type { LocalSession, LocalSet } from '../../src/storage/db';

function sampleSet(sessionId:string,ordinal:number,reps:number,load:number|null,options:{
  exerciseId?:ExerciseId;targetReps?:number|null;targetLoad?:number|null;
  side?:PerformanceSide;equipmentId?:string;assistance?:boolean;
}={}):LocalSet {
  const exerciseId=options.exerciseId??'squat';
  const configuration=defaultConfiguration(exerciseId);
  configuration.equipment.id=options.equipmentId??'';
  if(options.assistance)configuration.equipment.measurement='bodyweight_assistance';
  const side=options.side??'both';
  const id=sessionId+'-'+ordinal+'-'+side;
  const performance={
    id,side,status:'done' as const,repetitions:reps,loadValue:load,secondLoadValue:null,
    seconds:null,rir:null,technique:'controlled' as const,startedAt:null,completedAt:null,
    equipment:configuration.equipment,executionMode:configuration.executionMode,
    comparisonKey:comparisonKey(exerciseId,configuration),
  };
  return {
    id,sessionId,ordinal,exerciseId,sessionExerciseId:sessionId+'-ex',
    kind:'work',status:'done',deleted:false,
    targetGrams:options.targetLoad===null?null:Math.round((options.targetLoad??load??0)*1000),
    targetReps:options.targetReps??null,targetSeconds:null,
    actualGrams:load===null?null:Math.round(load*1000),
    actualReps:reps,actualSeconds:null,rir:null,technique:'controlled',
    occurredAt:null,serverRevision:null,createQueued:false,manualOverride:false,
    syncState:'local',updatedAt:'2026-10-20T12:00:00.000Z',
    detail:{version:1,configuration,performances:[performance],rests:[],aborted:false},
  } as LocalSet;
}
function session(id:string,day:number):LocalSession {
  return {id,finishedAt:'2026-10-'+String(day).padStart(2,'0')+'T12:00:00.000Z',
    status:'completed'} as LocalSession;
}
function insight(current:LocalSet[],previous:LocalSet[],
  sessions:LocalSession[]=[session('today',20),session('before',17)]) {
  return workoutPerformanceInsight({sessionId:'today',at:'2026-10-20T12:00:00.000Z',
    currentSets:current,historySets:previous,sessions,seed:0});
}
const sets=(id:string,reps:number,load:number,count=3,options:Parameters<typeof sampleSet>[4]={})=>
  Array.from({length:count},(_,i)=>sampleSet(id,i+1,reps,load,options));

it('celebrates additional repetitions at identical load and set count',()=>{
  const result=insight(sets('today',8,60),sets('before',6,60));
  expect(result).toMatchObject({kind:'reps',exerciseId:'squat',difference:6,previousSessionId:'before'});
  expect(result?.text).toMatch(/6 fler repetitioner/);
  expect(result?.text).not.toMatch(/personbästa|rekord/i);
});
it('acknowledges a load increase only when repetitions are maintained',()=>{
  expect(insight(sets('today',8,62.5),sets('before',8,60))).toMatchObject({kind:'load',difference:2.5});
  expect(insight(sets('today',5,62.5),sets('before',8,60))).toBeNull();
});
it('does not turn an extra set into an imaginary rep improvement',()=>{
  expect(insight(sets('today',6,60,4),sets('before',6,60,3))).toBeNull();
});
it('does not compare results across different equipment profiles or sides',()=>{
  expect(insight(sets('today',8,60,3,{equipmentId:'machine-b'}),sets('before',6,60,3,{equipmentId:'machine-a'}))).toBeNull();
  expect(insight(sets('today',8,60,3,{side:'right'}),sets('before',6,60,3,{side:'left'}))).toBeNull();
  expect(insight(sets('today',8,60,3,{side:'right'}),sets('before',6,60,3,{side:'right'}))?.text).toContain('höger sida');
});
it('treats reduced assisted load as progress, not a heavier lift',()=>{
  const before=sets('before',8,30,3,{exerciseId:'assisted_pullup',assistance:true});
  const current=sets('today',8,25,3,{exerciseId:'assisted_pullup',assistance:true});
  expect(insight(current,before)).toMatchObject({kind:'assistance',difference:5});
  expect(insight(current,before)?.text).toContain('mindre assistans');
});
it('requires at least prescribed load before praising repetitions above target',()=>{
  const current=sets('today',8,60,3,{targetReps:6,targetLoad:60});
  expect(insight(current,[])).toMatchObject({kind:'target',difference:6});
  expect(insight(sets('today',8,55,3,{targetReps:6,targetLoad:60}),[])).toBeNull();
});
it('counts deficits in other sets before claiming a goal was exceeded',()=>{
  const current=sets('today',6,60,3,{targetReps:6});
  current[0].detail!.performances[0].repetitions=8;
  current[1].detail!.performances[0].repetitions=3;
  expect(insight(current,[])).toBeNull();
  current[1].detail!.performances[0].repetitions=5;
  expect(insight(current,[])).toMatchObject({kind:'target',difference:1});
});
it('does not filter away poor technique to manufacture equal set counts',()=>{
  const previous=sets('before',6,60,3);
  previous[2].detail!.performances[0].technique='poor';
  expect(insight(sets('today',8,60,2),previous)).toBeNull();
});
it('does not skip the latest matching variant to find a more flattering set count',()=>{
  const previous=[...sets('before',10,60,4),...sets('older',6,60,3)];
  expect(insight(sets('today',8,60,3),previous,[session('today',20),session('before',17),session('older',1)])).toBeNull();
});
it('never uses future performances as a historical baseline',()=>{
  expect(insight(sets('today',8,60),sets('before',6,60),[session('today',20),session('before',21)])).toBeNull();
});
it('requires known machine levels and both independent loads',()=>{
  const current=sets('today',8,60,3,{targetReps:6});
  for(const s of current){
    s.detail!.configuration.equipment.basis='independent';
    s.detail!.targetSecondLoadValue=40;
    s.detail!.performances[0].secondLoadValue=20;
  }
  expect(insight(current,[])).toBeNull();
  for(const s of current){
    s.detail!.configuration.equipment.unit='level';
    s.detail!.configuration.equipment.measurement='machine_level';
    s.detail!.performances[0].loadValue=null;
    s.targetGrams=null;
  }
  expect(insight(current,[])).toBeNull();
});
it('rejects invalid values and unknown side targets instead of treating them as success',()=>{
  const current=sets('today',8,60,1,{targetReps:6});
  current[0].detail!.performances[0].loadValue=NaN;
  expect(insight(current,[])).toBeNull();
  current[0].detail!.performances[0].loadValue=60;
  current[0].detail!.plannedSides={both:{grams:null,reps:6,seconds:null,secondLoad:null}};
  expect(insight(current,[])).toBeNull();
});
it('requires actual current work even for a consistency observation',()=>{
  expect(insight([], [...sets('before',6,60,1),...sets('older',6,60,1)],
    [session('today',20),session('before',17),session('older',12)])).toBeNull();
});
it('counts completed sessions for consistency only within two weeks',()=>{
  const current=sets('today',6,60,1);
  const previous=[...sets('before',6,60,1),...sets('older',6,60,1)];
  expect(insight(current,previous,[session('today',20),session('before',17),session('older',12)])?.text).toContain('3 pass');
  expect(insight(current,previous,[session('today',20),session('before',17),session('older',1)])).toBeNull();
});
it('keeps extensive feedback variety and avoids unsafe jokes',()=>{
  const total=Object.values(WORKOUT_FEEDBACK).reduce((n,arr)=>n+arr.length,0);
  expect(total).toBeGreaterThanOrEqual(160);
  const recent:FeedbackChoice[]=[
    {version:WORKOUT_FEEDBACK_VERSION,sessionId:'2',at:'2',category:'complete',templateId:'complete:1'},
    {version:WORKOUT_FEEDBACK_VERSION,sessionId:'1',at:'1',category:'complete',templateId:'complete:0'},
  ];
  const first=selectFeedback({sessionId:'3',at:'3',category:'complete',seed:0,recent,allowHumor:true});
  expect(first.choice.humorId).toBeDefined();
  expect(selectFeedback({sessionId:'5',at:'5',category:'complete',seed:3,
    recent:[{...first.choice,sessionId:'4',at:'4',humorId:undefined},first.choice,...recent],
    allowHumor:true}).choice.humorId).toBeUndefined();
  expect(selectFeedback({sessionId:'6',at:'6',category:'protected',seed:0,recent,
    allowHumor:true}).choice.humorId).toBeUndefined();
});
it('keeps selection deterministic across shuffled data and a long sequence of sessions',()=>{
  const current=sets('today',8,60),previous=sets('before',6,60);
  expect(insight([...current].reverse(),[...previous].reverse())).toEqual(insight(current,previous));
  const recent:FeedbackChoice[]=[];
  for(let i=0;i<60;i++){
    const args={sessionId:String(i),at:String(i),category:'complete' as const,seed:i,recent:[...recent],allowHumor:true};
    const result=selectFeedback(args);
    expect(selectFeedback(args)).toEqual(result);
    expect(selectFeedback({...args,existing:result.choice,seed:999})).toEqual(result);
    expect(result.choice.templateId).not.toBe(recent[0]?.templateId);
    if(result.choice.humorId){expect(recent.slice(0,2).every(r=>!r.humorId)).toBe(true);expect(recent.slice(0,20).some(r=>r.humorId===result.choice.humorId)).toBe(false);}
    recent.unshift(result.choice);
  }
});
it('ignores warmups and deleted sets and refuses mixed loads or unknown equipment values',()=>{
  const current=sets('today',8,60),previous=sets('before',6,60);
  const warmup=sampleSet('today',4,20,20);warmup.kind='warmup';
  const deleted=sampleSet('today',5,20,60);deleted.deleted=true;
  expect(insight([...current,warmup,deleted],previous)).toEqual(insight(current,previous));
  current[1].detail!.performances[0].loadValue=50;
  expect(insight(current,previous)).toBeNull();
  for(const s of [...current,...previous]){s.detail!.performances[0].equipment.unit='level';s.detail!.performances[0].loadValue=null;}
  expect(insight(current,previous)).toBeNull();
});
it('checks assistance targets in the right direction and includes both independent loads',()=>{
  const current=sets('today',8,25,3,{exerciseId:'assisted_pullup',targetLoad:30,targetReps:6});
  expect(insight(current,[])).toMatchObject({kind:'target',difference:6});
  current[0].detail!.performances[0].loadValue=35;
  expect(insight(current,[])).toBeNull();
  const independent=sets('today',8,60,3,{targetLoad:60,targetReps:6});
  for(const s of independent){s.detail!.configuration.equipment.basis='independent';s.detail!.targetSecondLoadValue=40;s.detail!.performances[0].secondLoadValue=40;}
  expect(insight(independent,[])).toMatchObject({kind:'target',difference:6});
  independent[1].detail!.performances[0].secondLoadValue=39;
  expect(insight(independent,[])).toBeNull();
});
