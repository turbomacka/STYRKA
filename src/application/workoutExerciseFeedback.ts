import { exercise, type ExerciseId } from '../domain/catalog';
import { comparisonKey, defaultConfiguration, LOAD_LABELS, SIDE_LABELS, type PerformanceSide, type SetPerformance } from '../domain/trainingFlow';
import { performanceComparison, workoutPerformanceInsights, type InsightInput, type PerformanceInsight } from '../domain/workoutPerformanceInsight';
import type { LocalSessionExercise, LocalSet, LocalSymptom } from '../storage/db';
import type { AdaptationDecision } from './replanningFeedback';

export type ExerciseObservation = {
  side: PerformanceSide; setIds: string[]; work: string; headline: string;
  comparison: ReturnType<typeof performanceComparison>; insight?: PerformanceInsight;
  previousWork?: string;
  adjusted: boolean; caution?: string;
};
export type ExerciseFeedbackVariant = {
  key: string; comparisonKey: string | null; variantKey: string; label: string;
  observations: ExerciseObservation[]; recommendation: AdaptationDecision | null;
};
export type ExerciseFeedback = {
  exerciseId: ExerciseId; name: string; headline: string; setCount: number;
  added: boolean; variants: ExerciseFeedbackVariant[];
};
const number=(n:number)=>n.toLocaleString('sv-SE',{maximumFractionDigits:2});
const known=(n:number|null):n is number=>n!==null&&Number.isFinite(n)&&n>=0;
export const hasWork=(s:LocalSet)=>!s.deleted&&s.kind==='work'&&(s.detail?s.detail.performances.some(p=>p.status==='done'):s.status==='done');

/** Compare against the selected targets, including explicit nulls and both independent loads. */
export function reducedDose(set:LocalSet,p?:SetPerformance,assistance=false):boolean {
  const side=p&&set.detail?.plannedSides?.[p.side];
  const reps=side?side.reps:set.targetReps;
  const load=side?(side.grams===null?null:side.grams/1000):set.detail?.targetLoadValue!==undefined?set.detail.targetLoadValue:set.targetGrams===null?null:set.targetGrams/1000;
  const second=side?side.secondLoad:set.detail?.targetSecondLoadValue??null;
  const lighter=(a:number|null,b:number|null)=>known(a)&&known(b)&&((p?.equipment.measurement==='bodyweight_assistance'||assistance)?a>b:a<b);
  const actualReps=p?p.repetitions:set.actualReps;
  const original=p&&set.detail?.prescriptionOrigin;
  const originalTarget=original?.originalSides?.[p!.side]??original?.original;
  const belowOriginal=!!originalTarget&&(known(actualReps)&&known(originalTarget.reps)&&actualReps<originalTarget.reps
    ||lighter(p!.loadValue,originalTarget.loadValue)||lighter(p!.secondLoadValue,originalTarget.secondLoadValue));
  return belowOriginal||known(actualReps)&&known(reps)&&actualReps<reps
    ||lighter(p?p.loadValue:set.actualGrams===null?null:set.actualGrams/1000,load)
    ||!!p&&lighter(p.secondLoadValue,second);
}

function dose(p:SetPerformance):string {
  const reps=known(p.repetitions)?`${number(p.repetitions)} reps`:'';
  const seconds=known(p.seconds)?`${number(p.seconds)} s`:'';
  const e=p.equipment;
  const unit=e.unit==='level'?'nivå':'kg';
  const load=e.measurement==='duration'?'':e.measurement==='bodyweight'?'kroppsvikt':known(p.loadValue)
    ?`${e.measurement==='bodyweight_added'?'+':''}${number(p.loadValue)} ${unit}${e.basis==='independent'?` + ${known(p.secondLoadValue)?number(p.secondLoadValue):'?'} ${unit} (separata staplar)`:''}${e.measurement==='bodyweight_assistance'?' assistans':e.measurement==='per_dumbbell'?' per hantel':e.basis==='per_stack'?' per stapel':e.basis==='per_handle'?' per handtag':''}`:'';
  return [reps,seconds,load].filter(Boolean).join(' · ')||'genomfört arbete';
}
function workText(entries:Array<{set:LocalSet;p?:SetPerformance}>):string {
  const doses=entries.map(({set,p})=>p?dose(p):[
    known(set.actualReps)?`${number(set.actualReps)} reps`:'',known(set.actualSeconds)?`${number(set.actualSeconds)} s`:'',
    known(set.actualGrams)?`${number(set.actualGrams/1000)} kg${exercise(set.exerciseId).loadKind==='assistance_kg'?' assistans':''}`:'',
  ].filter(Boolean).join(' · ')||'genomfört arbete');
  const work=doses.every(d=>d===doses[0])?`${doses.length} × ${doses[0]}.`
    :doses.map((d,i)=>`Set ${i+1}: ${d}`).join('; ')+'.';
  const effort=entries.every(e=>['easy','too_easy'].includes((e.p?e.p.effort:e.set.perceivedEffort)??''))?' Du markerade seten som lätta.'
    :entries.every(e=>(e.p?e.p.effort:e.set.perceivedEffort)==='ok')?' Du markerade seten som lagom.':'';
  return work+effort;
}
function headline(insight:PerformanceInsight):string {
  const value=number(insight.difference!);
  switch(insight.kind){
    case 'reps':return `${value} fler repetitioner på samma belastning.`;
    case 'load':return `${value} kg högre belastning med minst lika många repetitioner.`;
    case 'assistance':return `${value} kg mindre assistans med minst lika många repetitioner.`;
    default:return `${value} repetitioner över dagens mål, utan lättare belastning.`;
  }
}

/** Observations and future proposals remain separate, even when there is no planning receipt. */
export function workoutExerciseFeedback(args:InsightInput&{exercises:LocalSessionExercise[];symptoms:LocalSymptom[];decisions:AdaptationDecision[]}):ExerciseFeedback[] {
  const insights=workoutPerformanceInsights(args);
  const byExercise=new Map<ExerciseId,Map<string,{variant:ExerciseFeedbackVariant;entries:Array<{set:LocalSet;p?:SetPerformance}>}>>();
  const ordered=[...args.currentSets].sort((a,b)=>(args.exercises.find(e=>e.id===a.sessionExerciseId)?.orderIndex??0)-(args.exercises.find(e=>e.id===b.sessionExerciseId)?.orderIndex??0)||a.ordinal-b.ordinal||a.id.localeCompare(b.id));
  for(const set of ordered.filter(hasWork)) {
    const instance=args.exercises.find(e=>e.id===set.sessionExerciseId);
    const variantKey=instance?.variantKey??'default';
    const variants=byExercise.get(set.exerciseId)??new Map();byExercise.set(set.exerciseId,variants);
    const entries=set.detail?set.detail.performances.filter(p=>p.status==='done'):[undefined];
    for(const p of entries) {
      const key=JSON.stringify([variantKey,p?.comparisonKey??'legacy']);
      let group=variants.get(key);
      if(!group){
        const recommendation=args.decisions.find(d=>d.exerciseId===set.exerciseId&&d.variantKey===variantKey
          &&(!p||!d.after||comparisonKey(d.exerciseId,d.after.configuration??defaultConfiguration(d.exerciseId))===p.comparisonKey))??null;
        group={variant:{key,comparisonKey:p?.comparisonKey??null,variantKey,
          label:p?[p.equipment.name||LOAD_LABELS[p.equipment.measurement],p.equipment.settings].filter(Boolean).join(' · '):'Äldre genomförande',observations:[],recommendation},entries:[]};
        variants.set(key,group);
      }
      group.entries.push({set,p});
    }
  }
  return [...byExercise].map(([exerciseId,groups])=>{
    const setIds=new Set<string>();
    const variants=[...groups.values()].map(({variant,entries})=>{
      const sides=[...new Set(entries.map(e=>e.p?.side??'both'))];
      variant.observations=sides.map(side=>{
        const own=entries.filter(e=>(e.p?.side??'both')===side);
        const ids=[...new Set(own.map(e=>e.set.id))];ids.forEach(id=>setIds.add(id));
        const adjusted=own.some(e=>reducedDose(e.set,e.p,exercise(exerciseId).loadKind==='assistance_kg'));
        const symptom=args.symptoms.some(s=>(s.area==='other'||exercise(exerciseId).areas.includes(s.area))
          &&(side==='both'||!s.side||!['left','right'].includes(s.side)||s.side===side));
        const constrained=variant.recommendation?.kind==='constraint';
        const unsafe=own.some(e=>e.p?.technique==='poor'||e.p?.effort==='too_heavy'||!e.p&&(e.set.technique==='poor'||e.set.perceivedEffort==='too_heavy'));
        const insight=!adjusted&&!symptom&&!constrained&&!unsafe?insights.find(i=>i.exerciseId===exerciseId&&i.comparisonKey===variant.comparisonKey&&i.side===side):undefined;
        const comparison=variant.comparisonKey?performanceComparison(args,variant.comparisonKey,side):'uncertain';
        const previous=insight?.previousSessionId?args.historySets.filter(s=>s.sessionId===insight.previousSessionId&&s.exerciseId===exerciseId&&hasWork(s))
          .sort((a,b)=>a.ordinal-b.ordinal||a.id.localeCompare(b.id)).flatMap(set=>(set.detail?.performances??[])
            .filter(p=>p.status==='done'&&p.comparisonKey===variant.comparisonKey&&p.side===side).map(p=>({set,p}))):[];
        const work=workText(own);
        const main=insight?headline(insight):adjusted?`Anpassad dos i ${ids.length} arbetsset.`:comparison==='repeated'?`Du upprepade nivån från förra gången. Stabilt jobbat.`:comparison==='first'?`${ids.length} arbetsset. En första referens finns nu.`:`${ids.length} arbetsset genomförda.`;
        return {side,setIds:ids,work,headline:main,comparison,adjusted,...(insight?{insight}:{}),
          ...(previous.length?{previousWork:workText(previous)}:{}),
          ...(symptom?{caution:'Rapporterade besvär berör den här övningen och sidan och behöver tas med i fortsättningen.'}:constrained?{caution:'En aktuell begränsning gäller för den här övningen.'}:unsafe?{caution:'Du beskrev problem med utförandet eller att belastningen var för tung.'}:{})};
      });
      return variant;
    });
    const observations=variants.flatMap(v=>v.observations);
    const gains=observations.filter(o=>o.insight&&['reps','load','assistance'].includes(o.insight.kind)).length;
    const main=observations.length===1?observations[0].headline:`${setIds.size} arbetsset med ${variants.length>1?'olika utrustningsvarianter':'arbete på båda sidor'}.${gains?` ${gains} ${gains===1?'jämförelse visar':'jämförelser visar'} framsteg.`:observations.some(o=>o.adjusted)?' En del av dosen anpassades.':''}`;
    return {exerciseId,name:exercise(exerciseId).nameSv,headline:main,setCount:setIds.size,
      added:args.exercises.some(e=>e.exerciseId===exerciseId&&e.snapshot.substitutionReason==='USER_ADDED'),variants};
  });
}

export const observationLabel=(o:ExerciseObservation)=>o.side==='both'?'Dagens arbete':SIDE_LABELS[o.side];
