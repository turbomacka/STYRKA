import { hashOf } from '../domain/hash';
import type { AppContext } from './context';
import { feedbackCategory, selectFeedback, WORKOUT_FEEDBACK_VERSION, type FeedbackChoice } from '../domain/workoutFeedback';
import type { PerformanceInsight } from '../domain/workoutPerformanceInsight';
import { REPLANNING_FEEDBACK_VERSION, type ReplanningFeedback } from './replanningFeedback';
import { hasWork, workoutExerciseFeedback, type ExerciseFeedback } from './workoutExerciseFeedback';

export type SavedWorkoutFeedback={text:string;sessionId:string;category:string;createdAt:string;version?:string;exercises?:ExerciseFeedback[];insights?:PerformanceInsight[];insight?:PerformanceInsight;inputsHash?:string;observationsHash?:string;sourceSessionIds?:string[];sourceSetIds?:string[];messages?:string[];decisionHash?:string;planRevisionId?:string|null};
/** Saved prose is derived from observations and, when available, the applied planning result. */
export async function savedWorkoutFeedback(ctx:AppContext,id:string,comparison?:ReplanningFeedback):Promise<SavedWorkoutFeedback> {
  return ctx.db.transaction('rw',[ctx.db.meta,ctx.db.sessions,ctx.db.sets,ctx.db.sessionExercises,ctx.db.symptoms],async()=>{
    const key=`workout-feedback:${id}`,existing=(await ctx.db.meta.get(key))?.value as SavedWorkoutFeedback|undefined;
    const session=await ctx.db.sessions.get(id);if(!session)throw new Error('SESSION_NOT_FOUND');
    const at=session.finishedAt??session.startedAt??session.clientCreatedAt;
    const sessions=(await ctx.db.sessions.toArray()).filter(s=>s.id===id||!!s.finishedAt&&(s.finishedAt<at||s.finishedAt===at&&s.id<id)).sort((a,b)=>(b.finishedAt??'').localeCompare(a.finishedAt??'')||b.id.localeCompare(a.id));
    const validSessions=new Set(sessions.map(s=>s.id));
    const all=(await ctx.db.sets.toArray()).filter(s=>validSessions.has(s.sessionId)&&!s.deleted&&s.kind==='work').sort((a,b)=>a.id.localeCompare(b.id));
    const sets=all.filter(s=>s.sessionId===id),perf=sets.flatMap(s=>s.detail?.performances.filter(p=>p.status==='done')??[]);
    const exs=(await ctx.db.sessionExercises.where('sessionId').equals(id).toArray()).sort((a,b)=>a.id.localeCompare(b.id));
    const currentKeys=new Set(perf.map(p=>p.comparisonKey));
    const comparable=all.filter(s=>s.sessionId!==id&&(s.detail?.performances.some(p=>p.status==='done'&&currentKeys.has(p.comparisonKey))||sets.some(o=>o.exerciseId===s.exerciseId&&!s.detail)));
    const history=sessions.filter(s=>s.id!==id&&all.some(x=>x.sessionId===s.id&&(x.status==='done'||x.detail?.performances.some(p=>p.status==='done'))));
    const recentHistory=history.filter(s=>Date.parse(at)-Date.parse(s.finishedAt??'')<=14*86400000);
    const recentIds=new Set(recentHistory.map(s=>s.id));
    const symptoms=(await ctx.db.symptoms.toArray()).filter(s=>s.sessionId===id ||
      s.reportedAt<=at && (!s.resolvedAt||s.resolvedAt>at) && ['persistent','limping','swelling'].includes(s.reaction)).sort((a,b)=>a.id.localeCompare(b.id));
    const dependencies=[...sets,...all.filter(s=>s.sessionId!==id&&(comparable.includes(s)||recentIds.has(s.sessionId)))];
    const observationsHash=hashOf({version:WORKOUT_FEEDBACK_VERSION,status:session.status,readiness:session.readiness,startedAt:session.startedAt,at,
      sets:dependencies.map(s=>({id:s.id,session:s.sessionId,exercise:s.exerciseId,instance:s.sessionExerciseId,ordinal:s.ordinal,status:s.status,grams:s.actualGrams,reps:s.actualReps,seconds:s.actualSeconds,targetGrams:s.targetGrams,targetReps:s.targetReps,effort:s.perceivedEffort,rir:s.rir,technique:s.technique,performances:s.detail?.performances,configuration:s.detail?.configuration,plannedSides:s.detail?.plannedSides,targetLoad:s.detail?.targetLoadValue,targetSecondLoad:s.detail?.targetSecondLoadValue})),
      comparisonSessions:sessions.filter(s=>dependencies.some(d=>d.sessionId===s.id)).map(s=>({id:s.id,at:s.finishedAt,status:s.status})),
      exercises:exs.map(e=>({id:e.id,order:e.orderIndex,variant:e.variantKey,replacedById:e.replacedById,snapshot:e.snapshot})),symptoms,
      previous:history[0]?{id:history[0].id,at:history[0].finishedAt}:null,
      recentHistory:recentHistory.map(s=>({id:s.id,at:s.finishedAt,status:s.status}))});
    const previousFactsUnchanged=existing?.observationsHash===observationsHash&&existing?.version===WORKOUT_FEEDBACK_VERSION;
    const stored=previousFactsUnchanged&&existing?.decisionHash?(await ctx.db.meta.get(`replanning:${id}:${existing.decisionHash}`))?.value as ReplanningFeedback|undefined:undefined;
    const receipt=comparison??stored;
    const validReceipt=receipt?.version===REPLANNING_FEEDBACK_VERSION?receipt:undefined;
    const decisionHash=validReceipt?.inputsHash;
    const inputsHash=hashOf({observationsHash,decisionHash});
    if(existing?.inputsHash===inputsHash&&existing.version===WORKOUT_FEEDBACK_VERSION&&Array.isArray(existing.exercises))return existing;
    const decisions=validReceipt?.decisions??[];
    const performed=sets.filter(s=>s.status==='done'||s.detail?.performances.some(p=>p.status==='done')).length;
    const insightInput={sessionId:id,at,currentSets:sets,historySets:dependencies.filter(s=>s.sessionId!==id),sessions:[session,...history],seed:parseInt(hashOf({id,version:WORKOUT_FEEDBACK_VERSION,kind:'insight'}).slice(0,8),16)};
    const exercises=workoutExerciseFeedback({...insightInput,exercises:exs,symptoms,decisions});
    const observations=exercises.flatMap(e=>e.variants.flatMap(v=>v.observations));
    const insights=observations.flatMap(o=>o.insight?[o.insight]:[]);
    const insight=insights[0];
    const maintained=observations.some(o=>o.comparison==='repeated');
    const reduced=observations.some(o=>o.adjusted);
    const category=feedbackCategory({performed,protected:session.readiness==='pain'||decisions.some(d=>d.kind==='constraint')||symptoms.length>0,trialReturn:decisions.some(d=>d.kind==='trial_return'),
      recovery:session.readiness==='tired'||decisions.some(d=>d.kind==='recovery')||perf.some(p=>p.technique==='poor'||p.effort==='too_heavy'),
      extra:exs.some(e=>(e.snapshot.substitutionReason==='USER_ADDED'&&sets.some(s=>s.sessionExerciseId===e.id&&hasWork(s)))||sets.filter(s=>s.sessionExerciseId===e.id&&hasWork(s)).length>e.snapshot.sets),
      first:perf.some(p=>!comparable.some(s=>s.detail?.performances.some(o=>o.status==='done'&&o.comparisonKey===p.comparisonKey))),
      maintained,complete:session.status==='completed',improved:decisions.some(d=>d.kind==='trial'),adjusted:decisions.some(d=>d.kind==='selected')||reduced,
      demanding:sets.filter(s=>s.detail?.performances.some(p=>p.status==='done'&&['hard','maximal','too_heavy'].includes(p.effort??''))).length>=2,substituted:exs.some(e=>!!e.replacedById),partial:session.status==='partial'||session.status==='abandoned',
      returning:!!history[0]?.finishedAt&&Date.parse(session.startedAt??at)-Date.parse(history[0].finishedAt)>=21*86400000});
    const choiceKey=`feedback-choice:${id}`;
    const prior=(await ctx.db.meta.get(choiceKey))?.value as FeedbackChoice|undefined;
    const recent=(await ctx.db.meta.where('key').startsWith('feedback-choice:').toArray()).map(r=>r.value as FeedbackChoice).filter(r=>r.sessionId!==id&&(r.at<at||r.at===at&&r.sessionId<id)).sort((a,b)=>b.at.localeCompare(a.at)||b.sessionId.localeCompare(a.sessionId));
    const selected=selectFeedback({sessionId:id,at,category,existing:prior,recent,seed:parseInt(hashOf({id,category,version:WORKOUT_FEEDBACK_VERSION}).slice(0,8),16),allowHumor:!symptoms.length&&session.status==='completed'&&!decisions.some(d=>['constraint','trial_return','recovery'].includes(d.kind))});
    const sourceSessionIds=[...new Set([id,...dependencies.map(s=>s.sessionId),...recentHistory.map(s=>s.id),...(history[0]?[history[0].id]:[]),...(validReceipt?.sourceSessionIds??[])])].sort();
    const sourceSetIds=[...new Set([...dependencies.map(s=>s.id),...(validReceipt?.sourceSetIds??[])])].sort();
    const improvedExercises=exercises.filter(e=>e.variants.some(v=>v.observations.some(o=>o.insight&&['reps','load','assistance'].includes(o.insight.kind)))).length;
    const progress=improvedExercises>1?`${improvedExercises} övningar tog ett steg framåt i dag. `:'';
    const value:SavedWorkoutFeedback={version:WORKOUT_FEEDBACK_VERSION,exercises,insights,inputsHash,observationsHash,text:progress+selected.text,...(insight?{insight}:{}),category,sessionId:id,createdAt:existing?.createdAt??ctx.clock.now(),sourceSessionIds,sourceSetIds,
      ...(decisionHash?{decisionHash}:{}),messages:validReceipt?.messages,planRevisionId:validReceipt?.revisionId};
    await ctx.db.meta.put({key,value});await ctx.db.meta.put({key:choiceKey,value:selected.choice});await ctx.db.meta.delete('recent-workout-feedback');
    return value;
  });
}
