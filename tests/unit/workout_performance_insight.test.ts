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
