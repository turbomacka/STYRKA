import { afterEach, expect, it, vi } from 'vitest';
import { harness, onboard, type Harness } from './appHarness';
import { addSet, adjustRest, finishSession, previewNext, rateSet, recordPerformance, startSession, swapExercise, swapExerciseLegacy, undoPerformance } from '../../src/application/training';
import { saveRestriction } from '../../src/application/profile';
import { addExercise, availableAdditions, beginPreparedSession, editPlannedSet, moveExercise, removeRemainingExercise, removeRemainingSet, restorePlannedSet, workoutOrder } from '../../src/application/workout';
import { chooseFeedback, feedbackCategory, WORKOUT_FEEDBACK } from '../../src/domain/workoutFeedback';
import { savedWorkoutFeedback } from '../../src/application/workoutFeedback';
import { remainingRest } from '../../src/domain/restPolicy';
import type { ExerciseId } from '../../src/domain/catalog';
import Dexie from 'dexie';
import { StyrkaDB } from '../../src/storage/db';
import { exportJson } from '../../src/application/privacy';
import { deleteWorkout } from '../../src/application/deleteWorkout';
const hs:Harness[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const h of hs.splice(0)){h.sync.dispose();await h.db.delete();}});
async function setup(id:ExerciseId='squat',prepare=true){
  const h=harness();hs.push(h);await onboard(h);const p=await previewNext(h.ctx);
  p.exercises=[{...p.exercises[0],exerciseId:id,sets:3,reps:5,kg:80,calibration:false,loadKind:'external_kg'}];
  const session=await startSession(h.ctx,p,prepare);
  const se=(await h.db.sessionExercises.toArray())[0],sets=await h.db.sets.toCollection().sortBy('ordinal');return {...h,session,se,sets};
}
it('A: autosaving a prepared target preserves the recommendation and never records performance',async()=>{
  const h=await setup();const original=structuredClone(h.session.snapshot);
  await editPlannedSet(h.ctx,h.sets[0].id,{grams:82500,reps:6});
  expect(await h.db.sets.get(h.sets[0].id)).toMatchObject({targetGrams:82500,targetReps:6,actualGrams:null,actualReps:null,occurredAt:null,status:'planned'});
  expect((await h.db.sessions.get(h.session.id))!.snapshot).toEqual(original);
  expect((await exportJson(h.ctx)).sessions).toEqual([expect.objectContaining({id:h.session.id,status:'preview'})]);
  await h.sync.refresh();expect(h.server.sets.size).toBe(3);
  expect(h.server.sets.get(h.sets[0].id)).toMatchObject({targetKg:'82.500',status:'planned',actualKg:null});
  await beginPreparedSession(h.ctx,h.session.id);
  expect((await h.db.sets.get(h.sets[0].id))!.targetGrams).toBe(82500);
});
it('B/I: repeated completion is idempotent, correction and undo preserve one identity',async()=>{
  const h=await setup('squat',false),id=h.sets[0].id;
  await Promise.all([recordPerformance(h.ctx,id,'both',{}),recordPerformance(h.ctx,id,'both',{})]);
  const before=(await h.db.sets.get(id))!;expect(before.detail!.performances).toHaveLength(1);
  await recordPerformance(h.ctx,id,'both',{actualGrams:85000},{edit:true});
  const after=(await h.db.sets.get(id))!;expect(after.actualGrams).toBe(85000);expect(after.detail!.performances[0].id).toBe(before.detail!.performances[0].id);
  await undoPerformance(h.ctx,id,'both');expect((await h.db.sets.get(id))!.status).toBe('planned');
});
it('C/G: late effort changes rest while keeping epoch, manual adjustments, and reload arithmetic',async()=>{
  const h=await setup('squat',false),id=h.sets[0].id;
  await recordPerformance(h.ctx,id,'both',{});const rest=(await h.db.sets.get(id))!.detail!.rests[0];
  await adjustRest(h.ctx,id,rest.id,30);h.clock.t+=45000;
  await rateSet(h.ctx,id,'hard');const next=(await h.db.sets.get(id))!.detail!.rests[0];
  expect(next.startedAt).toBe(rest.startedAt);expect(next.recommendedSeconds).toBe(rest.recommendedSeconds+30);
  expect(next.userAdjustmentSeconds).toBe(30);expect(next.policyVersion).toBe('REST/1.1.0');
  expect(remainingRest(next,h.clock.now())).toBe(next.recommendedSeconds+30-45);
  expect((await h.db.sets.get(id))!.detail!.performances[0].rir).toBeNull();
  await adjustRest(h.ctx,id,rest.id,'dismiss');const closed=(await h.db.sets.get(id))!.detail!.rests;
  await rateSet(h.ctx,id,'maximal');expect((await h.db.sets.get(id))!.detail!.rests).toEqual(closed);
});
it('E/H: deleting remaining work changes completion without erasing performed sets',async()=>{
  const h=await setup('squat',false);await recordPerformance(h.ctx,h.sets[0].id,'both',{});
  const recorded=structuredClone((await h.db.sets.get(h.sets[0].id))!.detail!.performances);
  await removeRemainingExercise(h.ctx,h.se.id);
  expect((await h.db.sets.get(h.sets[0].id))!.detail!.performances).toEqual(recorded);
  expect((await finishSession(h.ctx,h.session.id)).status).toBe('completed');
  const before=await h.db.outbox.count();await finishSession(h.ctx,h.session.id);expect(await h.db.outbox.count()).toBe(before);
});
it('added sets count in completion; removal can be undone',async()=>{
  const h=await setup('squat',false);for(const s of h.sets)await recordPerformance(h.ctx,s.id,'both',{});
  const added=await addSet(h.ctx,h.se.id);await removeRemainingSet(h.ctx,added.id);await restorePlannedSet(h.ctx,added.id);
  expect((await finishSession(h.ctx,h.session.id)).status).toBe('partial');
});
it('F: two independent side targets survive automatic side switching',async()=>{
  const h=await setup('one_arm_dumbbell_row');const id=h.sets[0].id;
  await editPlannedSet(h.ctx,id,{grams:25000,reps:10},'right');await editPlannedSet(h.ctx,id,{grams:22500,reps:8},'left');
  await beginPreparedSession(h.ctx,h.session.id);
  await recordPerformance(h.ctx,id,'right',{});await recordPerformance(h.ctx,id,'left',{});
  const s=(await h.db.sets.get(id))!;expect(s.status).toBe('done');
  expect(s.detail!.performances.map((p)=>[p.side,p.loadValue,p.repetitions])).toEqual([['right',25,10],['left',22.5,8]]);
});
it('D: swapping after one set keeps its exercise identity and only replaces remaining work',async()=>{
  const h=await setup('squat',false);await recordPerformance(h.ctx,h.sets[0].id,'both',{});
  const before=(await h.db.sets.get(h.sets[0].id))!.detail!.performances;
  const result=await swapExercise(h.ctx,h.se.id,'front_squat',{familiarity:'familiar',startGrams:60000});
  expect((await h.db.sets.get(h.sets[0].id))!.detail!.performances).toEqual(before);
  expect((await h.db.sets.get(h.sets[0].id))!.detail!.rests.every((r)=>r.outcome!=='active')).toBe(true);
  expect((await h.db.sets.where('sessionExerciseId').equals(result.sessionExercise.id).toArray()).filter((s)=>!s.deleted)).toHaveLength(2);
  expect((await h.db.sets.get(h.sets[1].id))!.deleted).toBe(true);
});
it('additions and reorder events leave the source recommendation unchanged',async()=>{
  const h=await setup();const choices=await availableAdditions(h.ctx,h.session.id);expect(choices.length).toBeGreaterThan(0);
  const added=await addExercise(h.ctx,h.session.id,choices.find((c)=>c.exerciseId!==h.se.exerciseId)!.exerciseId);
  await moveExercise(h.ctx,added.id,h.se.id);await moveExercise(h.ctx,added.id,null);await moveExercise(h.ctx,added.id,h.se.id);
  const events=await h.db.workoutOrderEvents.toArray();expect(new Set(events.map((e)=>e.createdAt)).size).toBe(3);
  expect(workoutOrder(await h.db.sessionExercises.toArray(),events)[0].id).toBe(added.id);
  expect((await h.db.sessions.get(h.session.id))!.snapshot.exercises).toHaveLength(1);
  expect((await h.sync.syncNow()).rejected).toBe(0);expect(h.server.table('workout_order_events').size).toBe(3);
});
it('failed planning transactions preserve targets and queue atomically',async()=>{
  const h=await setup();const before=await h.db.sets.get(h.sets[0].id);const count=await h.db.outbox.count();
  vi.spyOn(h.db.outbox,'add').mockImplementationOnce(()=>{throw new Error('quota');});
  await expect(editPlannedSet(h.ctx,h.sets[0].id,{grams:90000})).rejects.toThrow();
  expect(await h.db.sets.get(h.sets[0].id)).toEqual(before);expect(await h.db.outbox.count()).toBe(count);
});
it('feedback has eight distinct evidence categories and avoids recent repeats',()=>{
  const base={performed:1,complete:false,improved:false,adjusted:false,demanding:false,substituted:false,returning:false,partial:false};
  for(const [field,category] of [['complete','complete'],['improved','progress'],['adjusted','adjusted'],['demanding','demanding'],['substituted','substituted'],['returning','returning'],['partial','partial']] as const)expect(feedbackCategory({...base,[field]:true})).toBe(category);
  expect(feedbackCategory(base)).toBe('general');expect(feedbackCategory({...base,performed:0})).toBe('empty');
  for(const category of Object.keys(WORKOUT_FEEDBACK) as Array<keyof typeof WORKOUT_FEEDBACK>){if(category==='empty')continue;const first=chooseFeedback(category,[],0);expect(chooseFeedback(category,[first],0)).not.toBe(first);}
});
it('finish feedback is stable across reload and never invents an improvement from onboarding estimates',async()=>{
  const h=await setup('squat',false);for(const s of h.sets)await recordPerformance(h.ctx,s.id,'both',{});
  await finishSession(h.ctx,h.session.id);const first=await savedWorkoutFeedback(h.ctx,h.session.id);
  expect(first.category).toBe('complete');expect(await savedWorkoutFeedback(h.ctx,h.session.id)).toEqual(first);
  await deleteWorkout(h.ctx,h.session.id);expect(await h.db.meta.get(`workout-feedback:${h.session.id}`)).toBeUndefined();
});

it('a newly blocked exercise cannot start from an older prepared draft',async()=>{
  const h=await setup();await saveRestriction(h.ctx,{kind:'block_exercise',exerciseA:'squat',active:true});
  await expect(beginPreparedSession(h.ctx,h.session.id)).rejects.toMatchObject({field:'workout_needs_review'});
  expect((await h.db.sessions.get(h.session.id))!.status).toBe('preview');
  expect((await h.db.sets.get(h.sets[0].id))!.actualGrams).toBeNull();
});
it('removing the next set dismisses its timer, without claiming actual rest',async()=>{
  const h=await setup('squat',false);await recordPerformance(h.ctx,h.sets[0].id,'both',{});
  await removeRemainingSet(h.ctx,h.sets[1].id);
  const rest=(await h.db.sets.get(h.sets[0].id))!.detail!.rests[0];
  expect(rest.outcome).toBe('dismissed');expect(rest.actualSeconds).toBeNull();
});
it('legacy swap also tombstones synced plans and preserves completed exercise identity',async()=>{
  const h=await setup('squat',false);await recordPerformance(h.ctx,h.sets[0].id,'both',{});await h.sync.refresh();
  const replacement=await swapExerciseLegacy(h.ctx,h.se.id,'front_squat');
  expect((await h.db.sets.get(h.sets[0].id))!.exerciseId).toBe('squat');
  expect((await h.db.sets.get(h.sets[1].id))!.deleted).toBe(true);
  expect(await h.db.sets.where('sessionExerciseId').equals(replacement.id).count()).toBe(2);
  await removeRemainingExercise(h.ctx,replacement.id);
  expect((await finishSession(h.ctx,h.session.id)).status).toBe('completed');
  expect((await h.sync.syncNow()).rejected).toBe(0);
});
it('an explicitly cleared side target cannot silently reuse the old weight',async()=>{
  const h=await setup('one_arm_dumbbell_row',false);const id=h.sets[0].id;
  await editPlannedSet(h.ctx,id,{grams:null},'right');
  await expect(recordPerformance(h.ctx,id,'right',{})).rejects.toThrow();
  expect((await h.db.sets.get(id))!.status).toBe('planned');
});
it('progress feedback uses the latest comparable session, not an old lighter set',async()=>{
  const h=await setup('squat',false);
  for(const s of h.sets)await recordPerformance(h.ctx,s.id,'both',{actualGrams:90000,rir:0});
  await finishSession(h.ctx,h.session.id);h.clock.t+=86400000*3;
  const next=await startSession(h.ctx,{...h.session.snapshot,exercises:[{...h.se.snapshot,sets:2}]});
  const nextSets=await h.db.sets.where('sessionId').equals(next.id).toArray();
  for(const s of nextSets)await recordPerformance(h.ctx,s.id,'both',{actualGrams:85000,rir:0});
  await finishSession(h.ctx,next.id);
  expect((await savedWorkoutFeedback(h.ctx,next.id)).category).not.toBe('progress');
});
it('Dexie v5 to v6 preserves existing session and performance bytes without duplication',async()=>{
  const h=await setup('squat',false);await recordPerformance(h.ctx,h.sets[0].id,'both',{});
  const saved=(await h.db.sets.get(h.sets[0].id))!;
  const name=`${h.db.name}_migration`;const legacy=new Dexie(name);
  legacy.version(5).stores({sessions:'id, status',sets:'id, sessionId, sessionExerciseId, exerciseId, occurredAt, status, syncState'});
  await legacy.table('sessions').put(h.session);await legacy.table('sets').put(saved);legacy.close();
  const upgraded=new StyrkaDB(name);
  try {
    await upgraded.open();expect(await upgraded.sets.get(saved.id)).toEqual(saved);
    expect(await upgraded.sets.count()).toBe(1);expect(await upgraded.sessions.get(h.session.id)).toEqual(h.session);
    expect(await upgraded.workoutOrderEvents.count()).toBe(0);
  }finally{await upgraded.delete();}
});
