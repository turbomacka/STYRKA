import { afterEach, expect, it } from 'vitest';
import { harness, onboard, type Harness } from './appHarness';
import { addSet, configureExercise, ensureWarmups, finishSession, mutateSet, previewNext, rateSet, recordPerformance, startSession, undoPerformance } from '../../src/application/training';
import { addExercise, deleteTrainingSet, editPlannedSet, restorePlannedSet } from '../../src/application/workout';
import { buildPlannerInput, buildHistory } from '../../src/application/plannerInput';
import { patchProfile } from '../../src/application/profile';
import { defaultConfiguration, trainingPreferences } from '../../src/domain/trainingFlow';
import { planRegular, planReplacement } from '../../src/planner/planner';
import { refreshFuturePlan } from '../../src/application/trainingPlan';
import { compareSessionRecommendations } from '../../src/application/replanningFeedback';
import { warmupSuggestions } from '../../src/domain/warmupPolicy';
import { savedWorkoutFeedback } from '../../src/application/workoutFeedback';
const hs: Harness[] = [];
afterEach(async () => { for (const h of hs.splice(0)) { h.sync.dispose(); await h.db.delete(); } });
async function setup() {
  const h = harness(); hs.push(h); await onboard(h);
  const plan = await previewNext(h.ctx);
  plan.exercises = [{ ...plan.exercises.find((p) => p.exerciseId === 'squat')!, sets: 3, mode: 'heavy', kg: 100, reps: 5 }];
  const session = await startSession(h.ctx,plan);
  const se = (await h.db.sessionExercises.toArray())[0];
  const sets = (await h.db.sets.toArray()).sort((a,b) => a.ordinal-b.ordinal);
  return { ...h,session,se,sets };
}
it('1: undo middle set, correct, re-register; deleted performance is absent until restored',async () => {
  const h = await setup();
  for (const s of h.sets) await recordPerformance(h.ctx,s.id,'both',{});
  await undoPerformance(h.ctx,h.sets[1].id,'both');
  expect((await buildHistory(h.db))[0].sets.filter((s) => s.status === 'done')).toHaveLength(2);
  await editPlannedSet(h.ctx,h.sets[1].id,{grams:80000,reps:5});
  expect((await h.db.sets.get(h.sets[1].id))!.actualGrams).toBeNull();
  await recordPerformance(h.ctx,h.sets[1].id,'both',{});
  await deleteTrainingSet(h.ctx,h.sets[1].id);
  expect((await buildHistory(h.db))[0].sets.filter((s) => s.status === 'done')).toHaveLength(2);
  await restorePlannedSet(h.ctx,h.sets[1].id);
  expect((await buildHistory(h.db))[0].sets.find((s) => s.actualKg === 80)).toBeDefined();
});
it('3: 100 to 80 kg recomputes managed warmups, preserves manual/completed rows and is idempotent',async () => {
  const h=await setup(), c=defaultConfiguration('squat'); c.equipment.minimum=20;
  c.warmupVisible=false; await configureExercise(h.ctx,h.se.id,c);
  await patchProfile(h.ctx,{trainingPreferences:trainingPreferences({showWarmupSets:true})});
  await ensureWarmups(h.ctx,h.se.id);
  let warm=(await h.db.sets.toArray()).filter((s)=>s.kind==='warmup').sort((a,b)=>a.ordinal-b.ordinal);
  expect(warm.map((s)=>s.targetGrams)).toEqual([50000,70000,85000]);
  await editPlannedSet(h.ctx,warm[0].id,{grams:45000});
  await recordPerformance(h.ctx,warm[1].id,'both',{});
  await editPlannedSet(h.ctx,h.sets[0].id,{grams:80000});
  warm=(await h.db.sets.toArray()).filter((s)=>s.kind==='warmup').sort((a,b)=>a.ordinal-b.ordinal);
  expect(warm.map((s)=>s.targetGrams)).toEqual([45000,70000,67500]);
  expect(warm[1].status).toBe('done');
  const count=await h.db.outbox.count(); await ensureWarmups(h.ctx,h.se.id); await ensureWarmups(h.ctx,h.se.id);
  expect(await h.db.outbox.count()).toBe(count);
  await patchProfile(h.ctx,{trainingPreferences:trainingPreferences({showWarmupSets:false})});
  await ensureWarmups(h.ctx,h.se.id); expect((await h.db.sets.get(warm[1].id))!.status).toBe('done');
});
it.each([['squat','front_squat'],['deadlift','trap_bar_deadlift']] as const)('4/7: permanent and runtime %s to %s use the same conservative source',async(from,to)=>{
  const h=harness();hs.push(h);await onboard(h);
  const input=await buildPlannerInput(h.db,h.userId,h.clock.now());
  input.profile.equipment.push('trap_bar');
  input.rotationIndex=from==='deadlift'?1:0;
  const original=planRegular(input).exercises.find((e)=>e.exerciseId===from) ?? {...planRegular(input).exercises[0],exerciseId:from};
  const replacement=planReplacement(input,{from:original,to,others:[]}).planned!;
  input.profile.substitutions[from]=to;
  const permanent=planRegular(input).exercises.find((e)=>e.exerciseId===to);
  expect(replacement.kg).toBeGreaterThan(0); expect(replacement.estimatedOneRM).toBeNull();
  expect(permanent).toBeDefined();
  if(permanent){ expect(permanent.kg).toBe(replacement.kg);expect(permanent.recommendation?.source).toBe(replacement.recommendation?.source); }
});
it('5: rests target remaining sets in this exercise and late effort retains the epoch',async()=>{
 const h=await setup(); await recordPerformance(h.ctx,h.sets[0].id,'both',{});
 let r=(await h.db.sets.get(h.sets[0].id))!.detail!.rests.at(-1)!;
 expect(r.followingSetId).toBe(h.sets[1].id); const start=r.startedAt, seconds=r.recommendedSeconds;
 await rateSet(h.ctx,h.sets[0].id,'hard','both');r=(await h.db.sets.get(h.sets[0].id))!.detail!.rests.at(-1)!;
 expect(r.startedAt).toBe(start);expect(r.recommendedSeconds).toBeGreaterThanOrEqual(seconds);
 await deleteTrainingSet(h.ctx,h.sets[1].id);await recordPerformance(h.ctx,h.sets[2].id,'both',{});
 expect((await h.db.sets.toArray()).flatMap((s)=>s.detail?.rests??[]).filter((r)=>r.outcome==='active')).toHaveLength(0);
});
it('2/6/8/9: extra work, offline finish, correction and immutable revision sync',async()=>{
 const h=await setup();h.server.online=false;
 const added=await addExercise(h.ctx,h.session.id,'biceps_curl');
 const row=(await h.db.sets.where('sessionExerciseId').equals(added.id).toArray())[0];
 expect(row.targetGrams).toBeGreaterThan(0);
 await recordPerformance(h.ctx,row.id,'both',{actualGrams:12000,actualReps:8,rir:2});
 const extra=await addSet(h.ctx,added.id);await recordPerformance(h.ctx,extra.id,'both',{actualGrams:12000,actualReps:8,rir:2});
 await finishSession(h.ctx,h.session.id);
 const revision=await refreshFuturePlan(h.ctx);expect(revision).not.toBeNull();
 const stored=structuredClone(revision);
 const comparison=await compareSessionRecommendations(h.ctx,h.session.id);
 expect(comparison.messages[0]).toContain('extra arbetsset');
 await undoPerformance(h.ctx,row.id,'both');
 const next=await refreshFuturePlan(h.ctx); expect(next!.id).not.toBe(revision!.id);
 expect(await h.db.planRevisions.get(revision!.id)).toEqual(stored);
 h.db.close();await h.db.open();expect((await h.db.sets.get(extra.id))!.status).toBe('done');
 h.server.online=true;expect((await h.sync.syncNow()).rejected).toBe(0);
 expect(h.server.sets.get(row.id)!.status).toBe('planned');
});
it('warmup reductions stay below work weight and separate from observed strength',()=>{
 const equipment=defaultConfiguration('squat').equipment;equipment.minimum=20;
 const p=warmupSuggestions({workingLoad:100,targetReps:5,mode:'heavy',category:'barbell_compound',equipment,experience:'experienced',samePatternWorkDone:0});
 expect(p.map(({load,reps})=>[load,reps])).toEqual([[50,5],[70,3],[85,1]]);
});
it('feedback is recalculated after a corrected performance',async()=>{
 const h=await setup();await recordPerformance(h.ctx,h.sets[0].id,'both',{});await finishSession(h.ctx,h.session.id);
 const a=await savedWorkoutFeedback(h.ctx,h.session.id);
 await undoPerformance(h.ctx,h.sets[0].id,'both');
 const b=await savedWorkoutFeedback(h.ctx,h.session.id);expect(b.inputsHash).not.toBe(a.inputsHash);expect(b.category).toBe('empty');
});

it('rejects oversized correction detail atomically before it can poison the sync queue',async()=>{
 const h=await setup();await recordPerformance(h.ctx,h.sets[0].id,'both',{});
 const before=await h.db.sets.get(h.sets[0].id), count=await h.db.outbox.count();
 await expect(mutateSet(h.ctx,h.sets[0].id,s=>({...s,detail:{...s.detail!,recordingChanges:[{id:'x'.repeat(64000),at:h.clock.now(),before:{status:'done',deleted:false,grams:100000,reps:5,seconds:null,rir:null,technique:null,effort:null,sides:[]},afterHash:'x'}]}}))).rejects.toThrow('setDetailSize');
 expect(await h.db.sets.get(h.sets[0].id)).toEqual(before);expect(await h.db.outbox.count()).toBe(count);
});

it('server timestamp formatting does not create a history revision',async()=>{
 const h=await setup();await recordPerformance(h.ctx,h.sets[0].id,'both',{});await finishSession(h.ctx,h.session.id);
 const before=await refreshFuturePlan(h.ctx), set=await h.db.sets.get(h.sets[0].id);
 await h.db.sets.update(set!.id,{occurredAt:set!.occurredAt!.replace('Z','+00:00')});
 expect((await refreshFuturePlan(h.ctx))!.id).toBe(before!.id);
});

it('first actual calibration load replaces a low fallback when moving to lighter mode',async()=>{
 const h=await setup();await h.db.exerciseSettings.where('exerciseId').equals('biceps_curl').delete();
 const added=await addExercise(h.ctx,h.session.id,'biceps_curl');
 const row=(await h.db.sets.where('sessionExerciseId').equals(added.id).toArray())[0];
 expect(added.snapshot.calibration).toBe(true);
 await recordPerformance(h.ctx,row.id,'both',{actualGrams:12000,actualReps:8});
 const input=await buildPlannerInput(h.db,h.userId,h.clock.now());
 const {prescribe}=await import('../../src/domain/prescription');
 const p=prescribe({exerciseId:'biceps_curl',mode:'light',sets:2,role:'accessory',experience:'novice',settings:null,history:input.history.filter(h=>h.exerciseId==='biceps_curl'),gate:{hoursSinceRelevant:0,relevantSymptoms:'none',impactedRegion:false},bodyweightKg:80});
 expect(p.kg).toBeGreaterThan(added.snapshot.kg!);expect(p.kg).toBeLessThanOrEqual(12);
});
