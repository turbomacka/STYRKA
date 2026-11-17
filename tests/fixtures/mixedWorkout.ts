import { onboard, type Harness } from '../unit/appHarness';
import { finishSession, previewNext, recordPerformance, startSession } from '../../src/application/training';
import { addExercise, editPlannedSet } from '../../src/application/workout';
import { compareSessionRecommendations } from '../../src/application/replanningFeedback';
import { savedWorkoutFeedback } from '../../src/application/workoutFeedback';
import { defaultConfiguration, trainingPreferences } from '../../src/domain/trainingFlow';
import { selectFeedback, WORKOUT_FEEDBACK_VERSION, type FeedbackChoice } from '../../src/domain/workoutFeedback';
import { uuidFromSeed } from '../../src/domain/hash';

/** Four exercises, two comparable gains, a reduced bench dose, and a real user addition. */
export async function mixedWorkout(h:Harness) {
  let sequence=0;h.ctx.ids.uuid=()=>uuidFromSeed(`mixed-feedback-${sequence++}`);
  await onboard(h);
  const rowConfiguration=defaultConfiguration('cable_row');
  rowConfiguration.equipment.id='cable-row-a';rowConfiguration.equipment.name='Kabelrodd A';
  await h.db.profile.update(h.userId,{trainingPreferences:trainingPreferences({exerciseDefaults:{cable_row:rowConfiguration}})});
  const plan=await previewNext(h.ctx);
  const base=plan.exercises[0];
  plan.exercises=([
    ['cable_row',40,8],['squat',60,6],['bench_press',50,8],
  ] as const).map(([exerciseId,kg,reps])=>({...base,exerciseId,kg,reps,sets:2,variantKey:'default',
    configuration:exerciseId==='cable_row'?rowConfiguration:defaultConfiguration(exerciseId),sideTargets:undefined,targetLoadValue:kg,reasons:[]}));
  const previous=await startSession(h.ctx,plan);
  for(const set of await h.db.sets.where('sessionId').equals(previous.id).toArray())if(set.kind==='work')
    await recordPerformance(h.ctx,set.id,'both',{actualGrams:set.targetGrams,actualReps:set.targetReps});
  await finishSession(h.ctx,previous.id);h.clock.advanceHours(72);
  const session=await startSession(h.ctx,{...plan,generatedAtUtc:h.clock.now()});
  const added=await addExercise(h.ctx,session.id,'biceps_curl');
  const sets=await h.db.sets.where('sessionId').equals(session.id).toArray();
  for(const set of sets)if(set.kind==='work') {
    const reps=set.exerciseId==='cable_row'?10:set.exerciseId==='squat'?7:set.exerciseId==='bench_press'?6:set.targetReps;
    if(set.exerciseId==='bench_press')await editPlannedSet(h.ctx,set.id,{grams:40000,reps:6});
    await recordPerformance(h.ctx,set.id,'both',{actualGrams:set.exerciseId==='bench_press'?40000:set.targetGrams??10000,actualReps:reps});
  }
  await finishSession(h.ctx,session.id);
  // Deterministic editorial selection; the application must still permit this joke alongside facts.
  const recent:FeedbackChoice[]=[0,1].map(i=>({version:WORKOUT_FEEDBACK_VERSION,sessionId:`old-${i}`,at:previous.finishedAt??previous.startedAt!,category:'complete',templateId:`complete:${i}`}));
  const selected=selectFeedback({sessionId:session.id,at:h.clock.now(),category:'adjusted',seed:0,recent,allowHumor:true});
  await h.db.meta.put({key:`feedback-choice:${session.id}`,value:selected.choice});
  const comparison=await compareSessionRecommendations(h.ctx,session.id);
  const feedback=await savedWorkoutFeedback(h.ctx,session.id,comparison);
  return {session,previous,added,sets,comparison,feedback};
}
