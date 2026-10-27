import type { Experience, Exposure, Recommendation, SetResult } from './decision_engine';

/** Product heuristics, not physiological measurements. See the adaptation implementation plan. */
export const ADAPTIVE_POLICY = { version: 'ADAPTIVE/2.1.0', confirmation: 2, extraReps: 2, doseRepRatio: .8, retryWins: 2 } as const;
export type TrainingLevel = { kg: number; reps: number; sets: number };
export type AdaptiveEvidence = {
  version: string;
  confirmed: TrainingLevel | null;
  attempted: TrainingLevel | null;
  chosenDose: TrainingLevel | null;
  workingDose?: TrainingLevel | null;
  trialBaseline?: TrainingLevel | null;
  chosenReason?: 'manual' | 'problem' | null;
  chosenDimensions?: Array<'load'|'reps'|'sets'>;
  capacity: { estimatedMax: number | null; observations: number; confidence: 'low' | 'medium' };
  completedReps: number;
  decision: string;
};
export type ProgressionOptions = {
  previous: Recommendation; history: Exposure[]; experience: Experience; increment: number;
  impactedRegion: boolean; hold?: boolean; maxLoadKg?: number; minKg?: number;
  loadModel?: 'mass' | 'ordinal' | 'assistance' | 'added' | 'reps';
  availableLoads?: number[]; bodyweightKg?: number | null;
};
const done = (e: Exposure) => e.sets.filter(s => s.kind === 'work' && s.status === 'done' && Number.isFinite(s.actualKg) && s.actualKg >= 0 && Number.isFinite(s.actualReps) && s.actualReps > 0);
const ordinary = (e: Exposure) => done(e).filter(s=>s.role!=='extra').slice(0,e.plannedSets ?? e.sets.filter(s=>s.kind==='work'&&s.role!=='extra').length);
const same = (a: TrainingLevel, b: TrainingLevel) => Math.abs(a.kg-b.kg) < .001 && a.reps === b.reps && a.sets === b.sets;
const goodRir = (w: SetResult[]) => w.length > 0 && w.every(s => s.rir !== null && s.rir >= 2 && s.rir <= 10);
const positiveFeeling = (s:SetResult) => ['too_easy','easy','ok'].includes(s.effort??'');
const easyFeeling = (s:SetResult) => s.effort==='easy'||s.effort==='too_easy';
const conflict = (s:SetResult) => s.technique==='poor' || (easyFeeling(s) && s.rir!==null && s.rir<=1);
/** One final hard set is different from a predominantly maximal exercise. */
const highEffort = (w:SetResult[]) => w.some(conflict) || w.some(s=>s.effort==='too_heavy') || w.filter(s=>s.rir===0||s.effort==='maximal').length>=Math.ceil(w.length/2) || w.filter(s=>(s.rir!==null&&s.rir<=1)||s.effort==='hard').length>w.length/2;
const median = (v: number[]) => [...v].sort((a,b) => a-b)[Math.floor((v.length-1)/2)];
const uniform = (w:SetResult[]) => w.length>0 && w.every(s=>s.technique!=='poor') && Math.max(...w.map(s=>s.actualKg))-Math.min(...w.map(s=>s.actualKg))<.001 && Math.max(...w.map(s=>s.actualReps))-Math.min(...w.map(s=>s.actualReps))<=1;

/** Per-exposure robust estimate; warmups, extras and single-set peaks never define capacity. */
export function estimateCapacity(history: Exposure[], model: ProgressionOptions['loadModel'] = 'mass'): AdaptiveEvidence['capacity'] {
  if (model !== 'mass') return { estimatedMax: null, observations: 0, confidence: 'low' };
  const observations = history.flatMap(e => {
    const values = ordinary(e).filter(s => s.technique === 'controlled' && s.actualKg > 0 && s.actualReps <= 10)
      .map(s => s.actualKg * (1 + (s.actualReps + Math.min(2, Math.max(0, (s.rir ?? 0)-1))) / 30));
    return values.length ? [median(values)] : [];
  }).slice(-5);
  return { estimatedMax: observations.length >= 2 ? +median(observations).toFixed(3) : null, observations: observations.length, confidence: observations.length >= 3 ? 'medium' : 'low' };
}

/** Replay currently valid observations; cached plan evidence cannot survive deletion by itself. */
export function adaptiveNext(a: ProgressionOptions): Recommendation {
  const model=a.loadModel??'mass', direction=model==='assistance'?-1:1, seen=new Set<string>();
  const history=a.history.filter(e=>{if(e.exerciseId!==a.previous.exerciseId||e.id&&seen.has(e.id))return false;if(e.id)seen.add(e.id);return true;}).sort((x,y)=>x.whenUtc.localeCompare(y.whenUtc)||(x.id??'').localeCompare(y.id??''));
  const level=(w:SetResult[]):TrainingLevel=>({kg:direction===1?Math.min(...w.map(s=>s.actualKg)):Math.max(...w.map(s=>s.actualKg)),reps:Math.min(...w.map(s=>s.actualReps)),sets:w.length});
  const harder=(p:TrainingLevel,c:TrainingLevel)=>direction*(p.kg-c.kg)>.001 || (Math.abs(p.kg-c.kg)<.001&&(p.reps>c.reps||p.sets>c.sets));
  const fulfilled=(e:Exposure,w=ordinary(e))=>e.complete&&!e.voluntaryAbort&&w.length>0&&w.every(s=>s.technique!=='poor'&&s.actualReps>=s.plannedReps&&direction*(s.actualKg-s.plannedKg)>=-.001);
  const trials=new Set<number>(), successes=new Set<number>();
  const failed=new Map<string,{index:number;count:number;baseline:TrainingLevel}>(),key=(p:TrainingLevel)=>`${p.kg}:${p.reps}:${p.sets}`;
  let confirmed:TrainingLevel|null=null, working:TrainingLevel|null=null, pending:TrainingLevel|null=null, wins=0;
  let chosen:TrainingLevel|null=null, chosenReason:AdaptiveEvidence['chosenReason']=null, dimensions:NonNullable<AdaptiveEvidence['chosenDimensions']>=[], chosenAt=-1;
  let latestMissBaseline:TrainingLevel|null=null, failureAt=-1, failureCount=0, releasedAt=-1, manualAt=-1;
  for(const [index,e] of history.entries()) {
    const w=ordinary(e); if(!w.length)continue;
    const actual=level(w), prior=index>0?ordinary(history[index-1]):[];
    const repeatedPartial=a.impactedRegion&&e.finished===true&&index>0&&history[index-1].finished===true&&prior.length>0&&same(level(prior),actual);
    if(e.voluntaryAbort&&!repeatedPartial)continue;
    const consistent=uniform(w), full=e.complete&&!e.voluntaryAbort;
    const originalLoad=(s:SetResult)=>s.originalKg??e.originalKg??s.plannedKg;
    const originalReps=(s:SetResult)=>s.originalReps??e.plannedTargetReps;
    const planned:TrainingLevel={kg:originalLoad(w[0]),reps:originalReps(w[0]),sets:e.plannedSets??w.length};
    const declinedExistingTrial=chosen!==null&&same(actual,chosen)&&harder(planned,chosen);
    const changedLoad=consistent&&w.every(s=>Math.abs(s.actualKg-originalLoad(s))>=a.increment-.001);
    const reducedLoad=changedLoad&&w.every(s=>direction*(originalLoad(s)-s.actualKg)>0);
    const reducedSets=e.finished===true&&actual.sets<planned.sets&&w.every(s=>s.actualReps>=s.plannedReps);
    const repeatedReduction=w.every(s=>s.actualReps<Math.max(s.plannedReps,originalReps(s)))&&history.slice(Math.max(0,index-5),index).some(h=>{
      const old=ordinary(h);return old.length===w.length&&old.length>0&&same(level(old),actual)&&old.every(s=>s.technique!=='poor'&&s.actualReps<Math.max(s.plannedReps,s.originalReps??h.plannedTargetReps));
    });
    const reducedReps=consistent&&(w.every(s=>s.actualReps<=Math.max(s.plannedReps,originalReps(s))*ADAPTIVE_POLICY.doseRepRatio)||repeatedReduction);
    const problemChoice=a.impactedRegion&&(full||e.finished===true)&&consistent&&(reducedReps||reducedLoad||reducedSets);
    // A changed load plus uniformly changed reps is a choice with positive/passable evidence.
    // Missing reps on the unchanged app trial are never a choice merely because it felt 'ok'.
    const manualChoice=full&&changedLoad&&(w.every(s=>s.actualReps>=Math.min(s.plannedReps,originalReps(s)))||!highEffort(w)&&(w.every(positiveFeeling)||goodRir(w)));
    const keepProblemChoice=chosenReason==='problem'&&chosen!==null&&harder(actual,chosen);
    if(problemChoice || manualChoice&&!keepProblemChoice) {
      if(!chosen||!same(chosen,actual)) {
        chosen={...actual};chosenAt=index;pending=null;wins=0;
        dimensions=[...(changedLoad?['load' as const]:[]),...(w.some(s=>s.actualReps!==originalReps(s))?['reps' as const]:[]),...(reducedSets?['sets' as const]:[])];
      }
      chosenReason=problemChoice?'problem':'manual';working={...actual};manualAt=index;
    }
    const selectedSuccess=!declinedExistingTrial&&(manualChoice || problemChoice&&full);
    const success=!declinedExistingTrial&&(fulfilled(e,w)||selectedSuccess);
    // Prefer the trial anchor only if the current history still supports it.
    const recorded=e.attemptBaseline;
    const supported=recorded&&history.slice(0,index).some(h=>{const old=ordinary(h);return old.length>0&&uniform(old)&&same(level(old),recorded);});
    const anchor=supported?recorded:chosen??confirmed??working;
    if(!selectedSuccess&&full&&(declinedExistingTrial||!fulfilled(e,w))&&anchor&&harder(planned,anchor)) {
      trials.add(index);const id=key(planned),old=failed.get(id);failureCount=(old?.count??0)+1;failureAt=index;
      failed.set(id,{index,count:failureCount,baseline:{...anchor}});latestMissBaseline={...anchor};
    }
    if(success) {
      successes.add(index);
      if(!consistent) {pending=null;wins=0;continue;}
      if(pending&&same(actual,pending))wins++;else{pending={...actual};wins=1;}
      const required=w.length===1?3:a.experience==='experienced'||!goodRir(w)||(confirmed!==null&&harder(actual,confirmed))?ADAPTIVE_POLICY.confirmation:1;
      if(!keepProblemChoice)working={...actual};
      if(wins>=required) {
        confirmed={...actual};
        if(chosen&&index>chosenAt&&harder(actual,chosen)) {
          // Confirming more reps does not remove an independently selected load/set limit.
          // Re-establish each changed dimension only from performance in that dimension.
          const retained=dimensions.filter(d=>d==='load'?direction*(actual.kg-chosen!.kg)<=.001:d==='reps'?actual.reps<=chosen!.reps:actual.sets<=chosen!.sets);
          if(retained.length) {
            chosen={kg:retained.includes('load')?chosen.kg:actual.kg,reps:retained.includes('reps')?chosen.reps:actual.reps,sets:retained.includes('sets')?chosen.sets:actual.sets};
            dimensions=retained;chosenAt=index;working={...chosen};
          } else {chosen=null;chosenReason=null;dimensions=[];working={...actual};}
          releasedAt=index;
        }
      }
    } else {pending=null;wins=0;}
  }
  const latest=history.at(-1),work=latest?ordinary(latest):[],capacity=estimateCapacity(history,model);
  let r={...a.previous,reasons:[] as string[]};
  const finish=(reason:string,attempted:TrainingLevel|null=null,baseline:TrainingLevel|null=null):Recommendation=>{
    if(r.kg!==null&&r.kg>(a.maxLoadKg??Infinity)) {
      const maximum=a.maxLoadKg!,feasible=a.availableLoads?.filter(x=>x<=maximum);
      r.kg=feasible?.length?Math.max(...feasible):a.availableLoads?.length?null:Math.floor((maximum+1e-9)/a.increment)*a.increment;r.reasons.push('USER_MAX_LOAD_CAP');
    }
    return {...r,reasons:[reason,...r.reasons],adaptive:{version:ADAPTIVE_POLICY.version,confirmed,attempted,chosenDose:chosen,workingDose:working,trialBaseline:baseline,chosenReason,chosenDimensions:dimensions,capacity,completedReps:latest?done(latest).reduce((n,s)=>n+s.actualReps,0):0,decision:reason}};
  };
  if(!latest||!work.length)return finish('NO_EXPOSURE_YET');
  if(failureAt===history.length-1&&latestMissBaseline) {r={...r,...latestMissBaseline};working={...latestMissBaseline};return finish('TRIAL_RETURN_TO_CONFIRMED');}
  if(chosenReason==='problem'&&chosen)r={...r,...chosen};
  if(latest.voluntaryAbort||!latest.complete)return finish(chosen?'USER_DOSE_ADAPTED':'PARTIAL_NOT_FAILURE');
  if(work.some(s=>s.technique==='poor'))return finish('TECHNIQUE_NOT_CONTROLLED');
  const actual=level(work),consistent=uniform(work),success=successes.has(history.length-1);
  if(!success) {
    if(chosen){r={...r,...chosen};return finish(chosenReason==='problem'?'USER_DOSE_ADAPTED':'MANUAL_WORKING_DOSE');}
    if(latest.shortObservedRest)return finish('SHORT_OBSERVED_REST_HOLD');
    // Mixed or lowered loads do not show lost strength at the prescribed load.
    const comparableMiss=(e:Exposure,i:number)=>e.complete&&!e.voluntaryAbort&&!e.shortObservedRest&&!successes.has(i)&&!trials.has(i)&&ordinary(e).every(s=>Math.abs(s.actualKg-s.plannedKg)<.001);
    if(history.length>=2&&history.slice(-2).every((e,i)=>comparableMiss(e,history.length-2+i))) {
      const kg=r.kg??actual.kg;
      if(model==='ordinal')r.kg=a.availableLoads?.length?(a.availableLoads.filter(x=>x<kg).sort((x,y)=>y-x)[0]??Math.min(...a.availableLoads)):Math.max(a.minKg??0,kg-a.increment);
      else if(model==='reps')r.reps=Math.max(1,r.reps-1);
      else r.kg=direction===-1?kg+a.increment:Math.max(a.minKg??0,Math.floor((kg-Math.max(a.increment,kg*.05)+1e-9)/a.increment)*a.increment);
      return finish('TWO_CONSECUTIVE_MISSES');
    }
    return finish(work.some(s=>Math.abs(s.actualKg-s.plannedKg)>.001)?'MIXED_WORK_DOSE_HOLD':'FIRST_MISS_HOLD');
  }
  if(!consistent)return finish('MIXED_WORK_DOSE_HOLD');
  if(chosenReason!=='problem')r={...r,...actual};
  if(releasedAt===history.length-1)return finish('DOSE_REESTABLISHED');
  if(highEffort(work))return finish('LOW_RIR_HOLD');
  if(a.hold)return finish(chosenReason==='problem'?'USER_DOSE_ADAPTED':'RECOVERY_HOLD');
  const enoughEasy=work.filter(easyFeeling).length>=Math.max(work.length===1?1:2,Math.ceil(work.length*2/3))&&!work.some(s=>['hard','maximal','too_heavy'].includes(s.effort??'')||(s.rir!==null&&s.rir<=1));
  const priorSimilar=history.slice(0,-1).some(h=>{const old=ordinary(h);return old.length>0&&same(level(old),actual)&&fulfilled(h,old);});
  const quickTrial=chosenReason==='manual'&&manualAt===history.length-1&&chosen!==null&&enoughEasy&&(work.length>1||priorSimilar);
  let reviewTrial=false;
  if(chosenReason==='problem'&&chosen) {
    const stable=history.slice(chosenAt+1).filter((e,i)=>successes.has(chosenAt+1+i)&&!highEffort(ordinary(e))&&uniform(ordinary(e))&&same(level(ordinary(e)),chosen!));
    reviewTrial=stable.length>=2&&(enoughEasy||goodRir(work))||stable.length>=3&&work.every(positiveFeeling);
    if(!reviewTrial)return finish('USER_DOSE_ADAPTED');
  }
  if(!quickTrial&&!reviewTrial&&(!confirmed||!same(actual,confirmed)))return finish(chosenReason==='manual'?'MANUAL_WORKING_DOSE':'WAIT_FOR_SECOND_CONFIRMED_PASS');
  const positiveAfter=(index:number)=>history.slice(index+1).filter((e,i)=>successes.has(index+1+i)&&!highEffort(ordinary(e))).length;
  if(failureAt>=0&&positiveAfter(failureAt)<ADAPTIVE_POLICY.retryWins+Math.min(4,failureCount-1))return finish('TRIAL_RETRY_WAIT');
  const canRetry=(target:TrainingLevel)=>{const old=failed.get(key(target));if(!old)return true;const stronger=actual.reps>old.baseline.reps||work.every(s=>s.rir!==null&&s.rir>=3);return positiveAfter(old.index)>=(old.count>=2&&!stronger?6:ADAPTIVE_POLICY.retryWins);};
  const base=chosenReason==='problem'&&chosen?chosen:actual;
  const attempt=(reason:string)=>finish(quickTrial?'EASY_SELECTED_DOSE_TRIAL':reviewTrial?'USER_DOSE_REVIEW_TRIAL':reason,{kg:r.kg!,reps:r.reps,sets:r.sets},{...base});
  const available=a.availableLoads?.filter(x=>direction*(x-base.kg)>.001).sort((x,y)=>direction*(x-y));
  const candidate=available?available[0]:+(base.kg+direction*a.increment).toFixed(3);
  let feasible=candidate!==undefined&&candidate>=(a.minKg??0)&&candidate<=(a.maxLoadKg??Infinity)&&model!=='reps';
  const effective=model==='assistance'?(a.bodyweightKg??0)-base.kg:model==='added'?(a.bodyweightKg??0)+base.kg:base.kg;
  const candidateEffective=effective+direction*((candidate??base.kg)-base.kg);
  if(model==='mass'||model==='added'||model==='assistance'&&effective>0) {
    const reserve=goodRir(work)?1:0;
    const supported=effective*(1+(Math.min(base.reps,12)+reserve)/30)/(1+r.bandMin/30);
    feasible=feasible&&effective>0&&candidateEffective<=supported+1e-9;
  }
  if(model==='added'&&a.bodyweightKg==null)return finish('BODYWEIGHT_UNKNOWN_HOLD');
  feasible=feasible&&canRetry({kg:candidate!,reps:r.bandMin,sets:base.sets});
  // Strongly easy manual choices may try a supported step immediately, without invented RIR.
  if(feasible&&(base.reps>=r.bandMax||quickTrial)&&r.bandMin<=base.reps) {
    r.kg=candidate;r.reps=r.bandMin;return attempt(model==='assistance'?'ASSISTANCE_REDUCED':'DOUBLE_PROGRESS_WEIGHT');
  }
  if(base.reps<r.bandMax) {
    if(!canRetry({...base,reps:base.reps+1}))return finish('TRIAL_RETRY_WAIT');
    r.reps=base.reps+1;return attempt('DOUBLE_PROGRESS_REPS');
  }
  if(base.reps<Math.min(15,r.bandMax+ADAPTIVE_POLICY.extraReps)&&!a.impactedRegion) {
    if(!canRetry({...base,reps:base.reps+1}))return finish('TRIAL_RETRY_WAIT');
    r.reps=base.reps+1;return attempt('EQUIPMENT_BRIDGE_REPS');
  }
  return finish('EQUIPMENT_STEP_NOT_SUPPORTED');
}
