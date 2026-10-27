import { adaptiveNext, type AdaptiveEvidence, type ProgressionOptions, type TrainingLevel } from './adaptiveProgression';
import type { PerceivedEffort } from './model';
import type { RecoveryAssessment } from './recoveryPolicy';
import { recommendRest } from './restPolicy';
/** STYRKA ENGINE/2.1.0. Pure adaptive policy entry point.
 * Product heuristics are NOT clinical rules. All percentages and intervals are
 * configurable and subject to validation. Never interpret as injury probabilities.
 */
export const ENGINE_VERSION = '2.1.0' as const;
export type Experience = 'novice'|'intermediate'|'experienced';
export type Mode = 'heavy'|'moderate'|'light';
export type Evidence = 'E1'|'E2'|'H'|'U';
export type Recovery = 'normal'|'caution'|'restart'|'review_required'|'blocked';
export type ExerciseId = 'squat'|'bench_press'|'deadlift'|'romanian_deadlift'|'overhead_press'|'lat_pulldown'|'assisted_pullup'|'pullup'|'cable_row'|'chest_supported_row'|'cable_lateral_raise'|'biceps_curl'|'triceps_pushdown'|'cable_crunch'|'plank'|'split_squat'|'leg_press';
export type LiftEstimate = { kind:'1rm'|'3rm'; kg:number; testedAt?:string; measured?:boolean };
export type SymptomState = 'none'|'baseline'|'transient'|'persistent'|'limping'|'swelling'|'unknown';
export type SetResult = { effort?:PerceivedEffort|null; originalKg?:number|null; originalReps?:number|null; role?:'ordinary'|'extra'; plannedKg:number; actualKg:number; plannedReps:number; actualReps:number; rir:number|null; technique:'controlled'|'uncertain'|'poor'; status:'done'|'skipped'; kind:'work'|'warmup' };
export type Exposure = { attemptBaseline?:TrainingLevel|null; attempted?:TrainingLevel|null; shortObservedRest?:boolean; id?:string; originalKg?:number|null; plannedSets?:number; finished?:boolean; exerciseId:ExerciseId; whenUtc:string; complete:boolean; plannedTargetReps:number; bandMax:number; sets:SetResult[]; symptom:SymptomState; voluntaryAbort?:boolean };
export type Recommendation = { adaptive?:AdaptiveEvidence; exerciseId:ExerciseId; kg:number|null; reps:number; sets:number; bandMin:number; bandMax:number; mode:Mode; state:Recovery; reasons:string[]; engineVersion:string; confidence:'unknown'|'low'|'medium'|'high' };
const START:Record<Experience,Record<Mode,number>>={novice:{heavy:.65,moderate:.60,light:.50},intermediate:{heavy:.775,moderate:.70,light:.60},experienced:{heavy:.825,moderate:.725,light:.625}};
const REGIONS:Record<string,string[]>={squat:['knee','hip','lower_back'],deadlift:['knee','hip','lower_back'],romanian_deadlift:['hip','lower_back','hamstring'],bench_press:['shoulder','elbow','wrist'],overhead_press:['shoulder','elbow','wrist'],assisted_pullup:['shoulder','elbow','wrist'],lat_pulldown:['shoulder','elbow'],cable_lateral_raise:['shoulder']};
function assertFinitePos(v:number,label:string){ if(!Number.isFinite(v)||v<=0) throw new Error(`INVALID_${label}`); }
export function estimatedOneRepMax(e:LiftEstimate):number { assertFinitePos(e.kg,'WEIGHT'); if(e.kg>500)throw new Error('WEIGHT_TOO_LARGE'); return e.kind==='1rm'? e.kg : +(e.kg*1.1).toFixed(3); }
/** Floor to user's feasible minimum increment, never round UP. */
export function roundDownKg(kg:number, increment:number):number{if(!Number.isFinite(kg)||kg<0)throw new Error('INVALID_KG');assertFinitePos(increment,'INCREMENT'); if(increment>500)throw new Error('INVALID_INCREMENT');return Math.max(0, +(Math.floor((kg+1e-10)/increment)*increment).toFixed(3));}
export function isRelevantRegion(exerciseId:string,flaggedAreas:string[]):boolean{const regions=REGIONS[exerciseId]||[];return regions.some(x=>flaggedAreas.includes(x));}
export function recoveryGate(hoursSinceRelevant:number|null, symptom:SymptomState, impacted:boolean):{state:Recovery;factor:number;dropOneSet:boolean;reason:string}{
  if(impacted && (symptom==='persistent'||symptom==='limping'||symptom==='swelling')) return {state:'review_required',factor:1,dropOneSet:false,reason:'SYMPTOM_REVIEW_REQUIRED'};
  if(impacted && symptom==='transient') return {state:'caution',factor:1,dropOneSet:false,reason:'TRANSIENT_SYMPTOM_HOLD'};
  if(hoursSinceRelevant===null) return {state:'normal',factor:1,dropOneSet:false,reason:'NO_RELEVANT_HISTORY'};
  if(!Number.isFinite(hoursSinceRelevant)||hoursSinceRelevant<0)throw new Error('INVALID_RECOVERY_HOURS');
  if(hoursSinceRelevant<24) return {state:'caution',factor:1,dropOneSet:false,reason:'RECOVERY_UNDER_24H'};
  if(hoursSinceRelevant<48) return {state:'caution',factor:1,dropOneSet:false,reason:'RECOVERY_24_TO_48H'};
  if(hoursSinceRelevant>=672) return {state:'restart',factor:.90,dropOneSet:true,reason:'RESTART_28D'};
  if(hoursSinceRelevant>312) return {state:'restart',factor:.95,dropOneSet:true,reason:'RESTART_AFTER_13D'};
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
/** The continuous assessment owns soft recovery restrictions when supplied. */
export function prescriptionGate(hours:number|null,symptom:SymptomState,impacted:boolean,recovery?:RecoveryAssessment) {
  const gate=recoveryGate(recovery && (hours===null || hours<=312) ? null : hours,symptom,impacted);
  return gate.state==='normal'&&recovery?.modeCap ? {...gate,state:'caution' as const,reason:recovery.reason??'RECOVERY_MATCHED_WORK'} : gate;
}
export function recommendNext(args:ProgressionOptions & {hoursSinceRelevant:number|null;relevantSymptoms:SymptomState;blockExercise?:boolean;recovery?:RecoveryAssessment}):Recommendation {
  const previous = {...args.previous, engineVersion:ENGINE_VERSION};
  if(args.blockExercise) return {...previous,kg:null,state:'blocked',reasons:['USER_BLOCK_EXERCISE']};
  const gate=prescriptionGate(args.hoursSinceRelevant,args.relevantSymptoms,args.impactedRegion,args.recovery);
  if(gate.state==='review_required') return {...previous,kg:null,state:gate.state,reasons:[gate.reason]};
  if(previous.kg===null) return {...previous,state:gate.state,reasons:['CALIBRATION_REQUIRED']};
  let r=adaptiveNext({...args,previous,hold:gate.state!=='normal'||args.hold===true||args.recovery?.modeCap!=null});
  r={...r,state:(args.hold||args.recovery?.modeCap!=null)&&gate.state==='normal'?'caution':gate.state,reasons:[...r.reasons,gate.reason]};
  if(gate.state==='restart' && r.kg!==null) {
    if(args.loadModel==='ordinal') {
      r.kg=args.availableLoads?.length ? (args.availableLoads.filter(x=>x<r.kg!).sort((a,b)=>b-a)[0] ?? Math.min(...args.availableLoads)) : Math.max(args.minKg??0,r.kg-args.increment);
    } else if(args.loadModel==='assistance') r.kg+=args.increment;
    else if(args.loadModel!=='reps') r.kg=roundDownKg(r.kg*gate.factor,args.increment);
    r.sets=Math.max(1,r.sets-1);
    r.reasons.push('RESTART_PRESERVES_CAPACITY');
  }
  if(r.kg!==null && args.maxLoadKg!==undefined && r.kg>args.maxLoadKg) r.kg=roundDownKg(args.maxLoadKg,args.increment);
  if(r.kg!==null && args.availableLoads?.length) {
    const allowed=args.availableLoads.filter(x=>x>=(args.minKg??0)&&x<=(args.maxLoadKg??Infinity));
    if(args.loadModel==='assistance') r.kg=allowed.filter(x=>x>=r.kg!).sort((a,b)=>a-b)[0] ?? (allowed.length?Math.max(...allowed):null);
    else {const feasible=allowed.filter(x=>x<=r.kg!);r.kg=feasible.length?Math.max(...feasible):null;}
  }
  return r;
}
export type SessionExercise = {exerciseId:ExerciseId;mode:Mode;sets:number;plannedKg?:number|null;estimatedOneRM?:number|null;isMarkedHeavy?:boolean};
export function isHeavy(x:SessionExercise):boolean{ if(x.isMarkedHeavy || x.mode==='heavy')return true; if(x.plannedKg!==undefined && x.plannedKg!==null && x.estimatedOneRM!==undefined && x.estimatedOneRM!==null && x.estimatedOneRM>0) return x.plannedKg/x.estimatedOneRM>=.75;return false; }
export function validateHeavyPair(exercises:SessionExercise[],a:ExerciseId,b:ExerciseId):boolean {return !(exercises.some(x=>x.exerciseId===a&&isHeavy(x))&&exercises.some(x=>x.exerciseId===b&&isHeavy(x)));}
export function estimateMinutes(exercises:Array<{mode:Mode;sets:number;kind:'barbell_compound'|'other_compound'|'isolation';firstBarbell?:boolean;restSeconds?:number;reps?:number;seconds?:number;sideMultiplier?:number;betweenSidesSeconds?:number}>,generalWarmup=4):number{
  let sum=generalWarmup; for(const [i,x] of exercises.entries()){
    if(x.sets<1||x.sets>6)throw new Error('INVALID_SETS');
    const warmup=x.kind==='barbell_compound'?(x.firstBarbell?5:3):1;
    const work=Math.max(x.kind==='isolation'?35:45,x.seconds??(x.reps??0)*3)*(x.sideMultiplier??1)/60;
    const rest=(x.restSeconds??recommendRest({category:x.kind,mode:x.mode,strengthFocus:true,experience:'intermediate',adaptive:false,kind:'work',nextKind:'work'}).seconds)/60;
    sum+=warmup+x.sets*(work+(x.betweenSidesSeconds??0)/60)+Math.max(0,x.sets-1)*rest+(i===0?0:1);
  } return +sum.toFixed(2);
}
export function urgencyForSpontaneous(args:{minutes:number;lastHeavyRelevantHours:number|null;symptom:SymptomState}):{allowHeavy:boolean;reason:string}{
  if(args.minutes<15||args.minutes>120)throw new Error('INVALID_DURATION');
  if(['limping','persistent','swelling'].includes(args.symptom))return {allowHeavy:false,reason:'SYMPTOM_REVIEW_REQUIRED'};
  if(args.lastHeavyRelevantHours!==null && args.lastHeavyRelevantHours<48)return {allowHeavy:false,reason:'RECENT_HEAVY_PATTERN'};
  return {allowHeavy:true,reason:'NO_RECENT_HEAVY_FLAG'};
}
