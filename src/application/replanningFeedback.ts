import type { AppContext } from './context';
import { exercise } from '../domain/catalog';
import { hashOf } from '../domain/hash';
import type { PerformedExercise, PlannedExercise } from '../domain/model';
import { prescriptionSignature, prescriptionText } from '../domain/prescriptionDisplay';
import { futurePlanningHorizon, planInputs, type FuturePlanningResult } from './trainingPlan';

export const REPLANNING_FEEDBACK_VERSION='REPLAN-FEEDBACK/2.1.0';
export type AdaptationDecision={
  exerciseId:PlannedExercise['exerciseId'];variantKey:string;kind:'constraint'|'selected'|'trial_return'|'trial'|'restored'|'recovery'|'changed'|'hold'|'unavailable';
  before:PlannedExercise|null;after:PlannedExercise|null;reasons:string[];assumedAtUtc:string;rotationIndex:number;
  observed:string|null;message:string;changed:boolean;
};
export type ReplanningFeedback={version:string;inputsHash:string;sessionId:string;revisionId:string|null;sourceSessionIds:string[];sourceSetIds:string[];before:PlannedExercise[];after:PlannedExercise[];decisions:AdaptationDecision[];messages:string[]};
const key=(e:Pick<PlannedExercise,'exerciseId'|'variantKey'>)=>e.exerciseId+'|'+(e.variantKey??'default');
const actualWork=(h:PerformedExercise)=>h.sets.filter(s=>s.kind==='work'&&(s.status==='done'||s.detail?.performances.some(p=>p.status==='done')));
/** Describe only a genuinely uniform completed dose. Mixed or partial sides remain observations, not invented averages. */
export function observedDose(h:PerformedExercise):string|null {
  const work=actualWork(h);if(!work.length)return null;
  const performances=work.flatMap(s=>s.detail?.performances.filter(p=>p.status==='done')??[]);
  if(performances.length) {
    const first=performances[0];
    if(!performances.every(p=>p.loadValue===first.loadValue&&p.secondLoadValue===first.secondLoadValue&&p.repetitions===first.repetitions&&p.seconds===first.seconds))return `${work.length} arbetsset registrerade.`;
    const sides=new Set(performances.map(p=>p.side));
    if(sides.size>1&&!work.every(s=>s.status==='done'))return `${performances.length} sidprestationer registrerade.`;
    const configuration=structuredClone(work[0].detail!.configuration);
    if(sides.size===1&&!sides.has('both')){configuration.executionMode='single_side';configuration.startingSide=first.side as 'left'|'right';}
    const text=prescriptionText({...h.plan,configuration,sideTargets:undefined,sets:work.length,reps:first.repetitions??h.plan.reps,kg:first.loadValue,targetLoadValue:first.loadValue,targetSecondLoadValue:first.secondLoadValue,targetSeconds:first.seconds});
    const effort=performances.every(p=>p.effort==='easy'||p.effort==='too_easy')?' Du markerade seten som lätta.':performances.every(p=>p.effort==='ok')?' Du markerade seten som lagom.':'';
    return `Du genomförde ${text}.${effort}`;
  }
  const first=work[0];
  if(!work.every(s=>s.actualKg===first.actualKg&&s.actualReps===first.actualReps&&s.actualSeconds===first.actualSeconds))return `${work.length} arbetsset registrerade.`;
  return `Du genomförde ${prescriptionText({...h.plan,sideTargets:undefined,sets:work.length,reps:first.actualReps??h.plan.reps,kg:first.actualKg,targetSeconds:first.actualSeconds})}.`;
}
const priority:Record<AdaptationDecision['kind'],number>={constraint:0,unavailable:1,selected:2,trial_return:3,restored:4,trial:5,recovery:6,changed:7,hold:8};
function decision(previous:PlannedExercise|null,next:PlannedExercise,observation:PerformedExercise|undefined,at:string,rotation:number):AdaptationDecision {
  const reasons=next.reasons,has=(...codes:string[])=>codes.some(c=>reasons.includes(c));
  const changed=!previous||prescriptionSignature(previous)!==prescriptionSignature(next);
  const kind:AdaptationDecision['kind']=has('USER_MAX_LOAD_CAP','SYMPTOM_REVIEW_REQUIRED','TRANSIENT_SYMPTOM_HOLD')?'constraint':has('TRIAL_RETURN_TO_CONFIRMED','TRIAL_RETRY_WAIT')?'trial_return':has('EASY_SELECTED_DOSE_TRIAL','USER_DOSE_REVIEW_TRIAL')?'trial':has('USER_DOSE_ADAPTED','MANUAL_WORKING_DOSE')?'selected':has('TEMPORARY_SETS_RESTORED')?'restored':has('RECOVERY_HOLD','RECOVERY_MODE_REDUCED','RECOVERY_MATCHED_WORK','RECOVERY_OVERLAPPING_WORK')?'recovery':next.adaptive?.attempted?'trial':changed?'changed':'hold';
  const observed=observation?observedDose(observation):null;
  const name=exercise(next.exerciseId).nameSv;
  const target=`Nästa förslag för ${name.toLocaleLowerCase('sv-SE')}: ${prescriptionText(next)}.`;
  const reason=kind==='constraint'?'Din aktuella begränsning gäller även för nästa förslag.':kind==='selected'?'Förslaget utgår från den dos du genomfört.':kind==='trial_return'?"Vi utgår från den tidigare genomförda nivån innan ett nytt högre försök.":kind==='restored'?'Den tillfälliga begränsningen har upphört och ett ordinarie set ryms igen.':kind==='trial'?'Dina registrerade pass ger stöd för att prova ett litet steg.':kind==='recovery'?'De senaste passens dos och ansträngning vägs in.':has('WAIT_FOR_SECOND_CONFIRMED_PASS')?'Vi behåller nivån för ett till jämförbart pass.':!changed?'Samma nivå behålls med det underlag som finns.':'';
  return {exerciseId:next.exerciseId,variantKey:next.variantKey??'default',kind,before:previous,after:next,reasons,assumedAtUtc:at,rotationIndex:rotation,observed,message:[observed,target,reason].filter(Boolean).join(' '),changed};
}
/** Compare the same future occurrence with/without this session. Never simulate successful future performances. */
export async function compareSessionRecommendations(ctx:AppContext,sessionId:string,computed?:FuturePlanningResult):Promise<ReplanningFeedback> {
  const input=computed?.input??(await planInputs(ctx)).input;
  const count=Math.max(2,Math.min(14,input.profile.plannedSessionsPerWeek*2));
  const plans=(computed?.plans??futurePlanningHorizon(input,count)).slice(0,count);
  const baseline={...input,history:input.history.filter(h=>h.sessionId!==sessionId)};
  const previous=futurePlanningHorizon(baseline,count);
  const current=input.history.filter(h=>h.sessionId===sessionId&&actualWork(h).length);
  const relevant=new Set(current.map(h=>key(h.plan))),seen=new Set<string>(),decisions:AdaptationDecision[]=[];
  for(let index=0;index<plans.length;index++)for(const next of plans[index].exercises) {
    const id=key(next);if(seen.has(id))continue;seen.add(id);
    const before=previous[index]?.exercises.find(p=>key(p)===id)??null;
    const observation=current.find(h=>key(h.plan)===id);
    if(!relevant.has(id)&&(!before||prescriptionSignature(before)===prescriptionSignature(next)))continue;
    decisions.push(decision(before,next,observation,plans[index].generatedAtUtc,plans[index].rotationIndex??input.rotationIndex+index));
  }
  for(const h of current)if(!seen.has(key(h.plan))) {
    const reasons=plans.flatMap(p=>p.removed.filter(e=>e.exerciseId===h.exerciseId).map(e=>e.reason));
    const blocked=reasons.some(r=>['USER_BLOCK_EXERCISE','USER_RESTRICTION','SYMPTOM_REVIEW_REQUIRED','READINESS_PAIN_AREA'].includes(r));
    decisions.push({exerciseId:h.exerciseId,variantKey:h.plan.variantKey??'default',kind:blocked?'constraint':'unavailable',before:null,after:null,reasons,assumedAtUtc:input.nowUtc,rotationIndex:input.rotationIndex,observed:observedDose(h),changed:false,message:`${exercise(h.exerciseId).nameSv}: ditt genomförda arbete är registrerat. ${blocked?'Din aktuella begränsning gör att övningen inte föreslås nu.':'Övningen har inget nytt förslag inom den närmaste planeringen.'}`});
  }
  decisions.sort((a,b)=>priority[a.kind]-priority[b.kind]||Number(relevant.has(key(b)))-Number(relevant.has(key(a)))||a.rotationIndex-b.rotationIndex||a.exerciseId.localeCompare(b.exerciseId));
  const extra=current.some(h=>h.plan.substitutionReason==='USER_ADDED'||actualWork(h).length>h.plan.sets);
  const messages=decisions.slice(0,extra?1:2).map(d=>d.message);
  if(extra)messages.unshift('Dina extra arbetsset räknas in när kommande träningsdos planeras.');
  if(!messages.length)messages.push(current.length?'Samma nivå behålls med det underlag som finns.':'Inga nya arbetsset finns att använda i planeringen.');
  const sourceSessionIds=[...new Set(input.history.map(h=>h.sessionId))].sort();
  const sourceSetIds=(await ctx.db.sets.toArray()).filter(s=>!s.deleted&&s.kind==='work'&&sourceSessionIds.includes(s.sessionId)).map(s=>s.id).sort();
  const result:ReplanningFeedback={version:REPLANNING_FEEDBACK_VERSION,inputsHash:hashOf({input,version:REPLANNING_FEEDBACK_VERSION}),sessionId,revisionId:computed?.revisionId??null,sourceSessionIds,sourceSetIds,before:decisions.flatMap(d=>d.before?[d.before]:[]),after:decisions.flatMap(d=>d.after?[d.after]:[]),decisions,messages};
  await ctx.db.meta.put({key:'replanning:'+sessionId+':'+result.inputsHash,value:result});
  return result;
}
