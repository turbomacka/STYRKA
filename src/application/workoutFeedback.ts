import { hashOf } from '../domain/hash';
import type { AppContext } from './context';
import { feedbackCategory, selectFeedback, WORKOUT_FEEDBACK_VERSION, type FeedbackChoice } from '../domain/workoutFeedback';
import type { ReplanningFeedback } from './replanningFeedback';

export type SavedWorkoutFeedback={text:string;sessionId:string;category:string;createdAt:string;inputsHash?:string;observationsHash?:string;sourceSessionIds?:string[];sourceSetIds?:string[];messages?:string[];decisionHash?:string;planRevisionId?:string|null};
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
    const comparable=all.filter(s=>s.sessionId!==id&&(s.detail?.performances.some(p=>p.status==='done'&&currentKeys.has(p.comparisonKey))||sets.some(o=>o.exerciseId===s.exerciseId&&!o.detail&&!s.detail)));
    const history=sessions.filter(s=>s.id!==id&&all.some(x=>x.sessionId===s.id&&(x.status==='done'||x.detail?.performances.some(p=>p.status==='done'))));
    const symptoms=(await ctx.db.symptoms.toArray()).filter(s=>s.sessionId===id).sort((a,b)=>a.id.localeCompare(b.id));
    const dependencies=[...sets,...comparable];
    const observationsHash=hashOf({version:WORKOUT_FEEDBACK_VERSION,status:session.status,startedAt:session.startedAt,at,
      sets:dependencies.map(s=>({id:s.id,session:s.sessionId,status:s.status,grams:s.actualGrams,reps:s.actualReps,seconds:s.actualSeconds,targetGrams:s.targetGrams,targetReps:s.targetReps,effort:s.perceivedEffort,rir:s.rir,technique:s.technique,performances:s.detail?.performances})),
      exercises:exs.map(e=>({id:e.id,replacedById:e.replacedById,snapshot:e.snapshot})),symptoms,
      previous:history[0]?{id:history[0].id,at:history[0].finishedAt}:null});
    const previousFactsUnchanged=existing?.observationsHash===observationsHash;
    const decisionHash=comparison?.inputsHash??(previousFactsUnchanged?existing?.decisionHash:undefined);
    const inputsHash=hashOf({observationsHash,decisionHash});
    if(existing?.inputsHash===inputsHash)return existing;
    const decisions=comparison?.decisions??[];
    const performed=sets.filter(s=>s.status==='done'||s.detail?.performances.some(p=>p.status==='done')).length;
    const reduced=sets.some(s=>s.status==='done'&&((s.actualReps!==null&&s.targetReps!==null&&s.actualReps<s.targetReps)||(s.actualGrams!==null&&s.targetGrams!==null&&s.actualGrams<s.targetGrams&&exs.find(e=>e.id===s.sessionExerciseId)?.snapshot.loadKind!=='assistance_kg')));
    const maintained=perf.some(p=>comparable.filter(s=>s.sessionId===history[0]?.id).some(s=>s.detail?.performances.some(o=>o.status==='done'&&o.comparisonKey===p.comparisonKey&&o.side===p.side&&o.seconds===p.seconds&&o.loadValue===p.loadValue&&o.repetitions===p.repetitions&&o.secondLoadValue===p.secondLoadValue)));
    const category=feedbackCategory({performed,protected:decisions.some(d=>d.kind==='constraint')||symptoms.some(s=>['persistent','limping','swelling'].includes(s.reaction)),trialReturn:decisions.some(d=>d.kind==='trial_return'),
      extra:exs.some(e=>(e.snapshot.substitutionReason==='USER_ADDED'&&sets.some(s=>s.sessionExerciseId===e.id&&s.status==='done'))||sets.filter(s=>s.sessionExerciseId===e.id&&s.status==='done').length>e.snapshot.sets),
      first:perf.some(p=>!comparable.some(s=>s.detail?.performances.some(o=>o.status==='done'&&o.comparisonKey===p.comparisonKey))),
      maintained,complete:session.status==='completed',improved:decisions.some(d=>d.kind==='trial'),adjusted:decisions.some(d=>d.kind==='selected')||reduced,
      demanding:perf.filter(p=>['hard','maximal','too_heavy'].includes(p.effort??'')).length>=2,substituted:exs.some(e=>!!e.replacedById),partial:session.status==='partial'||session.status==='abandoned',
      returning:!!history[0]?.finishedAt&&Date.parse(session.startedAt??at)-Date.parse(history[0].finishedAt)>=21*86400000});
    const choiceKey=`feedback-choice:${id}`;
    const prior=(await ctx.db.meta.get(choiceKey))?.value as FeedbackChoice|undefined;
    const recent=(await ctx.db.meta.where('key').startsWith('feedback-choice:').toArray()).map(r=>r.value as FeedbackChoice).filter(r=>r.sessionId!==id&&(r.at<at||r.at===at&&r.sessionId<id)).sort((a,b)=>b.at.localeCompare(a.at)||b.sessionId.localeCompare(a.sessionId));
    const selected=selectFeedback({sessionId:id,at,category,existing:prior,recent,seed:parseInt(hashOf({id,category,version:WORKOUT_FEEDBACK_VERSION}).slice(0,8),16),allowHumor:!symptoms.length&&session.status==='completed'&&!decisions.some(d=>['constraint','trial_return'].includes(d.kind))});
    const sourceSessionIds=[...new Set([id,...dependencies.map(s=>s.sessionId),...(history[0]?[history[0].id]:[]),...(comparison?.sourceSessionIds??[])])].sort();
    const sourceSetIds=[...new Set([...dependencies.map(s=>s.id),...(comparison?.sourceSetIds??[])])].sort();
    const value:SavedWorkoutFeedback={inputsHash,observationsHash,text:selected.text,category,sessionId:id,createdAt:existing?.createdAt??ctx.clock.now(),sourceSessionIds,sourceSetIds,
      ...(decisionHash?{decisionHash}:{}),messages:comparison?.messages??(previousFactsUnchanged?existing?.messages:undefined),planRevisionId:comparison?.revisionId??(previousFactsUnchanged?existing?.planRevisionId:undefined)};
    await ctx.db.meta.put({key,value});await ctx.db.meta.put({key:choiceKey,value:selected.choice});await ctx.db.meta.delete('recent-workout-feedback');
    return value;
  });
}
