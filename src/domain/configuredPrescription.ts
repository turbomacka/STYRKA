import { recommendNext, ENGINE_VERSION, type Exposure, type Experience, type SymptomState } from './decision_engine';
import { effectiveRir } from './effort';
import { hasShortObservedRest } from './restPolicy';
import { restoreTemporarySets } from './prescription';
import type { RecoveryAssessment } from './recoveryPolicy';
import type { PerformedExercise, PlannedExercise, PerceivedEffort } from './model';
import { comparisonKey, requiredSides, type ExerciseConfiguration } from './trainingFlow';

type Context = { experience?: Experience; impactedRegion?: boolean; hoursSinceRelevant?: number | null; maxLoadKg?: number | null; recovery?:RecoveryAssessment; relevantSymptoms?:SymptomState };
const combinedEffort=(v:Array<PerceivedEffort|null>):PerceivedEffort|null=>v.includes('too_heavy')?'too_heavy':v.includes('maximal')?'maximal':v.includes('hard')?'hard':v.some(x=>x===null)?null:v.includes('ok')?'ok':v.includes('easy')?'easy':v.length&&v.every(x=>x==='too_easy')?'too_easy':null;
/** Load adapters realize equipment values; they never define a competing dose/recovery policy. */
export function configuredPrescription(plan: PlannedExercise, history: PerformedExercise[], c: ExerciseConfiguration, context: Context = {}): PlannedExercise {
  const e=c.equipment;
  if (['blocked','review_required'].includes(plan.state) || context.impactedRegion&&['persistent','limping','swelling'].includes(context.relevantSymptoms??'none')) return {...plan,state:plan.state==='blocked'?'blocked':'review_required',kg:null,targetLoadValue:null,targetSecondLoadValue:null};
  if(e.unit==='kg' && e.basis!=='independent') {
    if(plan.kg===null) return plan;
    const ceiling=Math.min(plan.kg,context.maxLoadKg??500),minimum=e.minimum??0;
    const feasible=e.increments.filter(x=>x<=ceiling && x>=minimum);
    const stepped=+(minimum+Math.floor((ceiling-minimum+1e-9)/e.step)*e.step).toFixed(3);
    const kg=e.increments.length?(feasible.length?Math.max(...feasible):null):stepped>=minimum?stepped:null;
    return {...plan,kg,incrementKg:e.step,calibration:kg===null || plan.calibration,...(plan.recommendation?{recommendation:{...plan.recommendation,suggestedKg:kg}}:{})};
  }
  if(e.unit==='s'||e.measurement==='bodyweight') return plan;
  const key=comparisonKey(plan.exerciseId,c);
  const relevant=history.filter(h=>h.sessionStatus!=='preview'&&h.exerciseId===plan.exerciseId&&h.sets.some(s=>s.kind==='work'&&s.detail?.performances.some(p=>p.status==='done'&&p.comparisonKey===key))).sort((a,b)=>a.whenUtc.localeCompare(b.whenUtc)||a.sessionId.localeCompare(b.sessionId));
  const empty={...plan,kg:null,estimatedOneRM:null,calibrationSuggestionKg:null,targetLoadValue:null,targetSecondLoadValue:null};
  const latest=relevant.at(-1);if(!latest)return empty;
  const run=(second:boolean)=> {
    const exposures:Exposure[]=relevant.map(h=> {
      const work=h.sets.filter(s=>s.kind==='work');
      const sets=work.map((s,index)=> {
        const ps=s.detail?.performances.filter(p=>p.status==='done'&&p.comparisonKey===key)??[];
        const complete=requiredSides(c).every(side=>ps.some(p=>p.side===side));
        const loads=ps.flatMap(p=>(second?p.secondLoadValue:p.loadValue)===null?[]:[(second?p.secondLoadValue:p.loadValue)!]);
        const reserves=ps.map(p=>effectiveRir(p.rir,p.effort));
        const original=s.provenance?.original??s.detail?.prescriptionOrigin?.original;
        return {kind:'work' as const,role:s.provenance?.role??(index>=h.plan.sets?'extra' as const:'ordinary' as const),status:complete&&loads.length===ps.length?'done' as const:'skipped' as const,
          originalKg:(second?original?.secondLoadValue:original?.loadValue)??(second?h.plan.targetSecondLoadValue:h.plan.targetLoadValue),originalReps:original?.reps??h.plan.reps,
          plannedKg:(second?s.detail?.targetSecondLoadValue:s.detail?.targetLoadValue)??(second?h.plan.targetSecondLoadValue:h.plan.targetLoadValue)??(loads.length?Math.min(...loads):0),
          actualKg:loads.length?Math.min(...loads):0,plannedReps:s.plannedReps??h.plan.reps,actualReps:ps.length?Math.min(...ps.map(p=>p.repetitions??0)):0,
          effort:combinedEffort(ps.map(p=>p.effort??null)),rir:reserves.length&&reserves.every(r=>r!==null)?Math.min(...reserves as number[]):null,
          technique:ps.some(p=>p.technique==='poor')?'poor' as const:ps.some(p=>p.technique!=='controlled')?'uncertain' as const:'controlled' as const};
      });
      return {id:h.sessionId,attemptBaseline:second?undefined:h.plan.adaptive?.trialBaseline,attempted:second?undefined:h.plan.adaptive?.attempted,shortObservedRest:hasShortObservedRest(work.flatMap(s=>s.detail?.rests??[])),exerciseId:plan.exerciseId as Exposure['exerciseId'],whenUtc:h.whenUtc,plannedTargetReps:h.plan.reps,plannedSets:h.plan.sets,bandMax:h.plan.bandMax,
        complete:sets.filter(s=>s.status==='done'&&s.role!=='extra').length>=h.plan.sets,finished:['completed','partial'].includes(h.sessionStatus),voluntaryAbort:work.length>=h.plan.sets&&['partial','abandoned','in_progress','paused'].includes(h.sessionStatus)&&sets.filter(s=>s.status==='done').length<h.plan.sets,symptom:'none' as const,sets};
    });
    const sameMode=exposures.filter((_,i)=>relevant[i].plan.mode===plan.mode);
    const selected=sameMode.length?sameMode:exposures,last=selected.at(-1)!,performed=last.sets.filter(s=>s.status==='done'&&s.role!=='extra');
    if(!performed.length)return null;
    const args={previous:{exerciseId:last.exerciseId,kg:Math.min(...performed.map(s=>s.plannedKg)),reps:last.plannedTargetReps,sets:last.plannedSets??plan.sets,bandMin:plan.bandMin,bandMax:plan.bandMax,mode:plan.mode,state:plan.state,reasons:[],engineVersion:ENGINE_VERSION,confidence:'low' as const},
      experience:context.experience??'intermediate',increment:e.step,availableLoads:e.increments.length?e.increments:undefined,loadModel:e.unit==='level'?'ordinal' as const:'mass' as const,
      impactedRegion:context.impactedRegion??false,relevantSymptoms:context.relevantSymptoms??'none',recovery:context.recovery,hoursSinceRelevant:context.hoursSinceRelevant??(plan.state==='restart'?672:null),hold:plan.state!=='normal'||context.recovery?.modeCap!=null||!sameMode.length,minKg:e.minimum??0,maxLoadKg:e.unit==='kg'?context.maxLoadKg??500:500};
    const normal=recommendNext({...args,history:selected});
    // Dose choices are evaluated before mode partitioning, on the same equipment only.
    const all=recommendNext({...args,history:exposures});
    return all.adaptive?.chosenDose?all:normal;
  };
  const first=run(false),second=e.basis==='independent'?run(true):null;if(!first)return empty;
  let result:PlannedExercise={...empty,state:first.state,targetLoadValue:first.kg,targetSecondLoadValue:second?.kg??null,reps:Math.min(first.reps,second?.reps??first.reps),sets:Math.min(plan.sets,first.sets,second?.sets??first.sets),adaptive:first.adaptive,calibration:false,reasons:[...new Set([...plan.reasons.filter(r=>!r.startsWith('CALIBRATION')),...first.reasons,...(second?.reasons??[])])]};
  const restored=restoreTemporarySets({...result,kg:first.kg},{sets:plan.sets,ordinarySets:plan.doseContext?.ordinarySets,temporaryReasons:plan.doseContext?.temporaryReasons,gate:{hoursSinceRelevant:context.hoursSinceRelevant??null,recovery:context.recovery,impactedRegion:context.impactedRegion??false,relevantSymptoms:context.relevantSymptoms??'none'}},latest);
  if(restored.reasons.includes('TEMPORARY_SETS_RESTORED'))result={...restored,kg:null,targetLoadValue:restored.kg,targetSecondLoadValue:second?.adaptive?.workingDose?.kg??result.targetSecondLoadValue};
  // Restoring a set may restore the working anchor; recheck both stacks after that operation.
  const fit=(value:number|null|undefined)=>{
    if(value==null)return null;
    const ceiling=Math.min(value,e.unit==='kg'?context.maxLoadKg??500:500),minimum=e.minimum??0;
    const allowed=e.increments.filter(x=>x>=minimum&&x<=ceiling);
    if(e.increments.length)return allowed.length?Math.max(...allowed):null;
    const snapped=+(minimum+Math.floor((ceiling-minimum+1e-9)/e.step)*e.step).toFixed(3);
    return snapped>=minimum?snapped:null;
  };
  result={...result,targetLoadValue:fit(result.targetLoadValue),targetSecondLoadValue:e.basis==='independent'?fit(result.targetSecondLoadValue):null};
  if(result.targetLoadValue===null||e.basis==='independent'&&result.targetSecondLoadValue===null)result={...result,calibration:true};
  return {...result,...(result.recommendation?{recommendation:{...result.recommendation,source:'history' as const,suggestedKg:null}}:{})};
}
