/** STYRKA ENGINE/1.0.0. Stand-alone, side-effect free v1 reference.
 * Product heuristics are NOT clinical rules. All percentages and intervals are
 * configurable and subject to validation. Never interpret as injury probabilities.
 */
export const ENGINE_VERSION = '1.0.0' as const;
export type Experience = 'novice'|'intermediate'|'experienced';
export type Mode = 'heavy'|'moderate'|'light';
export type Evidence = 'E1'|'E2'|'H'|'U';
export type Recovery = 'normal'|'caution'|'restart'|'review_required'|'blocked';
export type ExerciseId = 'squat'|'bench_press'|'deadlift'|'romanian_deadlift'|'overhead_press'|'lat_pulldown'|'assisted_pullup'|'pullup'|'cable_row'|'chest_supported_row'|'cable_lateral_raise'|'biceps_curl'|'triceps_pushdown'|'cable_crunch'|'plank'|'split_squat'|'leg_press';
export type LiftEstimate = { kind:'1rm'|'3rm'; kg:number; testedAt?:string; measured?:boolean };
export type SymptomState = 'none'|'baseline'|'transient'|'persistent'|'limping'|'swelling'|'unknown';
export type SetResult = { plannedKg:number; actualKg:number; plannedReps:number; actualReps:number; rir:number|null; technique:'controlled'|'uncertain'|'poor'; status:'done'|'skipped'; kind:'work'|'warmup' };
export type Exposure = { exerciseId:ExerciseId; whenUtc:string; complete:boolean; plannedTargetReps:number; bandMax:number; sets:SetResult[]; symptom:SymptomState; voluntaryAbort?:boolean };
export type Recommendation = { exerciseId:ExerciseId; kg:number|null; reps:number; sets:number; bandMin:number; bandMax:number; mode:Mode; state:Recovery; reasons:string[]; engineVersion:typeof ENGINE_VERSION; confidence:'unknown'|'low'|'medium'|'high' };
const START:Record<Experience,Record<Mode,number>>={novice:{heavy:.65,moderate:.60,light:.50},intermediate:{heavy:.775,moderate:.70,light:.60},experienced:{heavy:.825,moderate:.725,light:.625}};
const MAX_INCREASE:Record<Experience,number>={novice:.05,intermediate:.05,experienced:.03};
const REGIONS:Record<string,string[]>={squat:['knee','hip','lower_back'],deadlift:['knee','hip','lower_back'],romanian_deadlift:['hip','lower_back','hamstring'],bench_press:['shoulder','elbow','wrist'],overhead_press:['shoulder','elbow','wrist'],assisted_pullup:['shoulder','elbow','wrist'],lat_pulldown:['shoulder','elbow'],cable_lateral_raise:['shoulder']};
function assertFinitePos(v:number,label:string){ if(!Number.isFinite(v)||v<=0) throw new Error(`INVALID_${label}`); }
export function estimatedOneRepMax(e:LiftEstimate):number { assertFinitePos(e.kg,'WEIGHT'); if(e.kg>500)throw new Error('WEIGHT_TOO_LARGE'); return e.kind==='1rm'? e.kg : +(e.kg*1.1).toFixed(3); }
/** Floor to user's feasible minimum increment, never round UP. */
export function roundDownKg(kg:number, increment:number):number{if(!Number.isFinite(kg)||kg<0)throw new Error('INVALID_KG');assertFinitePos(increment,'INCREMENT'); if(increment>10)throw new Error('INVALID_INCREMENT');return Math.max(0, +(Math.floor((kg+1e-10)/increment)*increment).toFixed(3));}
export function isRelevantRegion(exerciseId:string,flaggedAreas:string[]):boolean{const regions=REGIONS[exerciseId]||[];return regions.some(x=>flaggedAreas.includes(x));}
export function recoveryGate(hoursSinceRelevant:number|null, symptom:SymptomState, impacted:boolean):{state:Recovery;factor:number;dropOneSet:boolean;reason:string}{
  if(impacted && (symptom==='persistent'||symptom==='limping'||symptom==='swelling')) return {state:'review_required',factor:1,dropOneSet:false,reason:'SYMPTOM_REVIEW_REQUIRED'};
  if(hoursSinceRelevant===null) return {state:'normal',factor:1,dropOneSet:false,reason:'NO_RELEVANT_HISTORY'};
  if(!Number.isFinite(hoursSinceRelevant)||hoursSinceRelevant<0)throw new Error('INVALID_RECOVERY_HOURS');
  if(hoursSinceRelevant<24) return {state:'caution',factor:1,dropOneSet:false,reason:'RECOVERY_UNDER_24H'};
  if(hoursSinceRelevant<48) return {state:'caution',factor:1,dropOneSet:false,reason:'RECOVERY_24_TO_48H'};
  if(hoursSinceRelevant>=672) return {state:'restart',factor:.90,dropOneSet:true,reason:'RESTART_28D'};
  if(hoursSinceRelevant>312) return {state:'restart',factor:.95,dropOneSet:true,reason:'RESTART_AFTER_13D'};
  if(impacted && symptom==='transient') return {state:'caution',factor:1,dropOneSet:false,reason:'TRANSIENT_SYMPTOM_HOLD'};
  return {state:'normal',factor:1,dropOneSet:false,reason:'NORMAL_TIME_WINDOW'};
}
export function initialPrescription(args:{exerciseId:ExerciseId;estimate:LiftEstimate|null;experience:Experience;mode:Mode;increment:number;manualSetOverride?:number;maxLoadKg?:number}):Recommendation{
  const {exerciseId,estimate,experience,mode,increment}=args;assertFinitePos(increment,'INCREMENT');
  let sets=experience==='novice'?2:(mode==='light'?2:3);
  if(args.manualSetOverride!==undefined){if(!Number.isInteger(args.manualSetOverride)||args.manualSetOverride<1||args.manualSetOverride>4)throw new Error('INVALID_SETS');sets=args.manualSetOverride;}
  const range=experience==='novice'?(mode==='light'?[10,12]:[8,10]):(mode==='heavy'?[5,7]:(mode==='moderate'?[6,10]:[8,12]));
  // Assistance is never convertible to free-weight 1RM.
  const needsManual=exerciseId==='assisted_pullup'||exerciseId==='pullup'||exerciseId==='plank'||!estimate;
  const e1rm=needsManual?null:estimatedOneRepMax(estimate);
  const proposed=e1rm===null?null:roundDownKg(Math.min(e1rm*START[experience][mode], args.maxLoadKg??Infinity),increment);
  return {exerciseId,kg:proposed,reps:range[0],sets,bandMin:range[0],bandMax:range[1],mode,state:'normal',reasons:proposed===null?['CALIBRATION_REQUIRED']:['INITIAL_HEURISTIC','ROUNDED_DOWN_TO_EQUIPMENT'],engineVersion:ENGINE_VERSION,confidence:proposed===null?'unknown':(estimate?.measured?'medium':'low')};
}
export function recommendNext(args:{previous:Recommendation;history:Exposure[];experience:Experience;increment:number;hoursSinceRelevant:number|null;relevantSymptoms:SymptomState;impactedRegion:boolean;blockExercise?:boolean;minKg?:number}):Recommendation{
  const {previous,history,experience,increment}=args;const r:Recommendation={...previous,reasons:[],engineVersion:ENGINE_VERSION};
  if(args.blockExercise){r.kg=null;r.state='blocked';r.reasons=['USER_BLOCK_EXERCISE'];return r;}
  const gate=recoveryGate(args.hoursSinceRelevant,args.relevantSymptoms,args.impactedRegion);r.state=gate.state;
  if(gate.state==='review_required'){r.kg=null;r.reasons=[gate.reason];return r;}
  if(gate.state==='caution' && previous.mode==='heavy' && args.hoursSinceRelevant!==null && args.hoursSinceRelevant<48){r.kg=null;r.reasons=['RECENT_HEAVY_MODE_REQUIRES_REPLAN',gate.reason];return r;}
  if(r.kg===null){r.reasons=['CALIBRATION_REQUIRED'];return r;}
  const latest=history.filter(x=>x.exerciseId===previous.exerciseId).slice(-1)[0];
  if(!latest){r.reasons=['NO_EXPOSURE_YET',gate.reason];}
  else if(latest.voluntaryAbort||!latest.complete){r.reasons=['PARTIAL_NOT_FAILURE',gate.reason];}
  else {
    const work=latest.sets.filter(x=>x.kind==='work'&&x.status==='done');
    const complete=work.length===previous.sets;
    const controlled=work.every(s=>s.technique!=='poor');
    const targetsMet=complete && work.every(s=>s.actualReps>=s.plannedReps && s.actualKg>=s.plannedKg);
    const rirHold=work.some(s=>s.rir!==null && s.rir<=1);
    const allRirGood=work.length>0 && work.every(s=>s.rir!==null && s.rir>=2);
    if(!complete){r.reasons=['PARTIAL_NOT_FAILURE',gate.reason];}
    else if(!controlled){r.reasons=['TECHNIQUE_NOT_CONTROLLED',gate.reason];}
    else if(targetsMet && !rirHold){
      const pastTwo=history.filter(x=>x.exerciseId===previous.exerciseId).slice(-2);
      const twoWins=pastTwo.length===2&&pastTwo.every(x=>x.complete&&x.plannedTargetReps===previous.reps&&x.sets.filter(s=>s.kind==='work'&&s.status==='done').length===previous.sets&&x.sets.filter(s=>s.kind==='work'&&s.status==='done').every(s=>s.actualReps>=s.plannedReps && s.actualKg>=s.plannedKg && s.technique!=='poor'));
      if(!allRirGood&&!twoWins){r.reasons=['WAIT_FOR_SECOND_CONFIRMED_PASS',gate.reason];}
      else if(gate.state==='caution'){r.reasons=['RECOVERY_HOLD',gate.reason];}
      else if(previous.reps<previous.bandMax){r.reps=previous.reps+1;r.reasons=['DOUBLE_PROGRESS_REPS',gate.reason];}
      else {
        const candidate=+(r.kg+increment).toFixed(3);
        if(candidate>r.kg*(1+MAX_INCREASE[experience])+1e-9){r.reasons=['STEP_EXCEEDS_PROGRESS_CAP',gate.reason];}
        else {r.kg=candidate;r.reps=previous.bandMin;r.reasons=['DOUBLE_PROGRESS_WEIGHT',gate.reason];}
      }
    }else if(rirHold){r.reasons=['LOW_RIR_HOLD',gate.reason];}
    else {
      const lastTwo=history.filter(x=>x.exerciseId===previous.exerciseId).slice(-2);
      const fails=(x:Exposure)=>x.complete&&!x.voluntaryAbort&&x.sets.filter(s=>s.kind==='work'&&s.status==='done').some(s=>s.actualReps<s.plannedReps);
      if(lastTwo.length===2&&lastTwo.every(fails)){
        const reduction=Math.max(increment,r.kg*.05);
        r.kg=roundDownKg(Math.max(args.minKg??0,r.kg-reduction),increment);
        r.reasons=['TWO_CONSECUTIVE_MISSES',gate.reason];
      }else{r.reasons=['FIRST_MISS_HOLD',gate.reason];}
    }
  }
  if(gate.state==='restart'&&r.kg!==null){r.kg=roundDownKg(Math.max(args.minKg??0,r.kg*gate.factor),increment);r.sets=Math.max(1,r.sets-(gate.dropOneSet?1:0));r.reasons.push(gate.reason);}
  return r;
}
export type SessionExercise = {exerciseId:ExerciseId;mode:Mode;sets:number;plannedKg?:number|null;estimatedOneRM?:number|null;isMarkedHeavy?:boolean};
export function isHeavy(x:SessionExercise):boolean{ if(x.isMarkedHeavy || x.mode==='heavy')return true; if(x.plannedKg!==undefined && x.plannedKg!==null && x.estimatedOneRM!==undefined && x.estimatedOneRM!==null && x.estimatedOneRM>0) return x.plannedKg/x.estimatedOneRM>=.75;return false; }
export function validateHeavyPair(exercises:SessionExercise[],a:ExerciseId,b:ExerciseId):boolean {return !(exercises.some(x=>x.exerciseId===a&&isHeavy(x))&&exercises.some(x=>x.exerciseId===b&&isHeavy(x)));}
export function estimateMinutes(exercises:Array<{mode:Mode;sets:number;kind:'barbell_compound'|'other_compound'|'isolation';firstBarbell?:boolean}>,generalWarmup=4):number{
  let sum=generalWarmup; for(const [i,x] of exercises.entries()){
    if(x.sets<1||x.sets>6)throw new Error('INVALID_SETS');
    const warmup=x.kind==='barbell_compound'?(x.firstBarbell?5:3):1;
    const work=x.kind==='isolation'?35/60:45/60;
    const rest=x.kind==='barbell_compound'?(x.mode==='heavy'?2.5:1.5):(x.kind==='isolation'?1:1.5);
    sum+=warmup+x.sets*work+Math.max(0,x.sets-1)*rest+(i===0?0:1);
  } return +sum.toFixed(2);
}
export function urgencyForSpontaneous(args:{minutes:number;lastHeavyRelevantHours:number|null;symptom:SymptomState}):{allowHeavy:boolean;reason:string}{
  if(args.minutes<15||args.minutes>120)throw new Error('INVALID_DURATION');
  if(['limping','persistent','swelling'].includes(args.symptom))return {allowHeavy:false,reason:'SYMPTOM_REVIEW_REQUIRED'};
  if(args.lastHeavyRelevantHours!==null && args.lastHeavyRelevantHours<48)return {allowHeavy:false,reason:'RECENT_HEAVY_PATTERN'};
  return {allowHeavy:true,reason:'NO_RECENT_HEAVY_FLAG'};
}
