import { exercise, type ExerciseId } from './catalog';
import type { Mode } from './decision_engine';
import type { HistorySet, PerceivedEffort, PerformedExercise } from './model';
import { comparisonKey, type ExerciseConfiguration } from './trainingFlow';
import { successfulDoseExposure } from './trainingDose';

/** Product heuristics, not measured recovery or clinical thresholds. No kg comparison across equipment. */
export const RECOVERY_POLICY = {
  version: 'RECOVERY/3.1.0',
  halfLifeHours: 24,
  /** Product safeguards, sensitivity-tested rather than physiological constants. */
  moderateThreshold: .7,
  lightThreshold: 1.6,
  minimumComparableOutcomes: 3,
  maximumToleranceMultiplier: 1.5,
} as const;
export type RecoveryPolicyVariant = 'general' | 'gentle' | 'individual';
export type RecoveryEvaluation = { variant?: RecoveryPolicyVariant; halfLifeHours?: number };

export type RecoveryAssessment = {
  version: typeof RECOVERY_POLICY.version;
  modeCap: 'moderate' | 'light' | null;
  /** Internal planning score, not measured recovery. */
  residualDose?: number;
  workReps?: number;
  /** Internal supporting observations, never an estimate of physiological readiness. */
  tolerance?: { comparableOutcomes: number; moderateThreshold: number };
  activeHours: number | null;
  reason: 'RECOVERY_MATCHED_WORK' | 'RECOVERY_OVERLAPPING_WORK' | null;
};

type Effort = 'easy' | 'normal' | 'hard' | 'maximal';
type Work = { side: 'left' | 'right'; age: number; when: number; sessionId: string; exerciseId: ExerciseId; effort: Effort; direct: boolean; dose: number; reps: number };
const CURLS = new Set<ExerciseId>(['biceps_curl', 'dumbbell_curl', 'cable_curl', 'incline_dumbbell_curl']);
const EXTENSIONS = new Set<ExerciseId>(['triceps_pushdown', 'rope_pushdown', 'overhead_triceps_extension']);

/** Movement families are distinct from the old broad lower/press/pull recovery groups. */
export function recoveryFamily(id: ExerciseId): string {
  if (CURLS.has(id)) return 'elbow_flexion';
  if (EXTENSIONS.has(id)) return 'elbow_extension';
  return exercise(id).pattern;
}

function effortOf(rir: number | null, feeling?: PerceivedEffort | null): Effort {
  if (feeling === 'maximal' || rir === 0) return 'maximal';
  if (feeling === 'hard' || feeling === 'too_heavy' || rir === 1) return 'hard';
  if (rir !== null) return rir >= 4 ? 'easy' : 'normal';
  if (feeling === 'easy' || feeling === 'too_easy') return 'easy';
  // Missing answers remain ordinary/unknown work; never silently assume low effort.
  return 'normal';
}

/** Bounded rep contribution plus uncertain effort/intensity; never tonnage. */
export function recoveryDose(reps: number, rir: number | null, feeling?: PerceivedEffort | null, relativeIntensity?: number | null): number {
  const effort=effortOf(rir,feeling);
  const effortFactor={easy:.65,normal:1,hard:1.3,maximal:1.6}[effort];
  const repFactor=.35+.65*Math.sqrt(Math.min(30,Math.max(1,reps))/8);
  const intensity=relativeIntensity!=null&&relativeIntensity>0&&relativeIntensity<=1.2 ? Math.max(.7,Math.min(1.3,relativeIntensity/.75)) : 1;
  return repFactor*effortFactor*intensity;
}

/** Conservative anatomical overlap; broad recoveryGroup alone is insufficient. */
export function exposureOverlap(a: ExerciseId,b: ExerciseId): number {
  if(recoveryFamily(a)===recoveryFamily(b)) return 1;
  const x=exercise(a),y=exercise(b);
  const common=x.areas.filter(area=>y.areas.includes(area));
  if(!common.length || x.recoveryGroup==='own' || x.recoveryGroup!==y.recoveryGroup) return 0;
  return Math.min(.5,common.length/Math.max(x.areas.length,y.areas.length)*.5);
}

/** Rolling windows use each actual performance, so a newer easy set cannot hide older demanding work.
 * Each side is assessed separately: three unilateral pairs are three sets per side, not six.
 * Unfinished sets contribute only their completed sides. Opposite-only work does not limit a single-side target.
 */
export function assessRecovery(id: ExerciseId, history: PerformedExercise[], nowUtc: string, configuration?: ExerciseConfiguration, evaluation: RecoveryEvaluation = {}): RecoveryAssessment {
  const now = Date.parse(nowUtc);
  if (!Number.isFinite(now)) throw new Error('INVALID_TIMESTAMP');
  const family = recoveryFamily(id), work: Work[] = [], seen = new Set<string>();
  for (const h of history) {
    if (h.sessionStatus === 'preview') continue;
    const direct = recoveryFamily(h.exerciseId) === family;
    const overlap = exposureOverlap(id,h.exerciseId);
    if (!direct && !overlap) continue;
    const add = (key: string, side: 'left' | 'right' | 'both', when: string | null, rir: number | null, feeling: PerceivedEffort | null | undefined, reps: number | null, seconds: number | null, load: number | null = null) => {
      if (seen.has(key) || !((reps ?? 0) > 0 || (seconds ?? 0) > 0)) return;
      seen.add(key);
      const age = (now - Date.parse(when ?? h.whenUtc)) / 3_600_000;
      if (!Number.isFinite(age) || age < 0 || age > 90*24) return;
      for (const s of side === 'both' ? ['left', 'right'] as const : [side]) {
        if (configuration?.executionMode === 'single_side' && configuration.startingSide !== s) continue;
        const relative=h.plan.estimatedOneRM&&load!==null&&h.plan.loadKind==='external_kg' ? load/h.plan.estimatedOneRM : null;
        work.push({ side:s,age,when:now-age*3_600_000,sessionId:h.sessionId,exerciseId:h.exerciseId,effort:effortOf(rir,feeling),direct,reps:reps??0,dose:recoveryDose(reps??Math.max(1,(seconds??0)/3),rir,feeling,relative)*(direct?1:overlap) });
      }
    };
    h.sets.forEach((s: HistorySet, index) => {
      if (s.kind !== 'work') return;
      if (s.detail) {
        for (const p of s.detail.performances.filter((p) => p.status === 'done')) {
          add(`${h.sessionId}:${h.exerciseId}:${p.id}`, p.side, p.completedAt ?? s.occurredAt, p.rir, p.effort, p.repetitions, p.seconds, p.equipment.unit==='kg' ? p.loadValue : null);
        }
      } else if (s.status === 'done') {
        add(`${h.sessionId}:${h.exerciseId}:${index}`, 'both', s.occurredAt, s.rir, s.perceivedEffort, s.actualReps, s.actualSeconds, s.actualKg);
      }
    });
  }
  const halfLife=Math.max(12,Math.min(48,evaluation.halfLifeHours??RECOVERY_POLICY.halfLifeHours));
  const variant=evaluation.variant??'individual';
  const result: RecoveryAssessment = { version: RECOVERY_POLICY.version, modeCap:null, activeHours:null,reason:null,residualDose:0,workReps:0 };
  for(const side of ['left','right'] as const) {
    const own=work.filter(w=>w.side===side&&w.age<=14*24);
    const score=own.reduce((n,w)=>n+w.dose*Math.pow(2,-w.age/halfLife),0);
    if(score<=0) continue;
    const tolerance=variant==='individual'?observedTolerance(id,history,work,side,now,halfLife,configuration):{comparableOutcomes:0,moderateThreshold:variant==='gentle'?.9:RECOVERY_POLICY.moderateThreshold};
    // Repeated ordinary outcomes may relax a mild generic hold. They never erase
    // the high-dose guard, current warnings, explicit limits or a new adverse outcome.
    const modeCap=score>=RECOVERY_POLICY.lightThreshold?'light':score>=tolerance.moderateThreshold?'moderate':null;
    const rank=(cap:RecoveryAssessment['modeCap'])=>cap==='light'?2:cap==='moderate'?1:0;
    const previousScore=result.residualDose??0;
    result.residualDose=+Math.max(score,previousScore).toFixed(6);
    if(rank(modeCap)<rank(result.modeCap) || (rank(modeCap)===rank(result.modeCap)&&score<previousScore)) continue;
    result.workReps=own.reduce((n,w)=>n+w.reps,0);
    result.tolerance=tolerance;
    result.modeCap=modeCap;
    result.activeHours=modeCap?Math.min(...own.map(w=>w.age)):null;
    result.reason=modeCap?(own.some(w=>w.direct)?'RECOVERY_MATCHED_WORK':'RECOVERY_OVERLAPPING_WORK'):null;
  }
  return result;
}

function observedTolerance(id:ExerciseId,history:PerformedExercise[],work:Work[],side:'left'|'right',now:number,halfLife:number,configuration?:ExerciseConfiguration): NonNullable<RecoveryAssessment['tolerance']> {
  const fallback={comparableOutcomes:0,moderateThreshold:RECOVERY_POLICY.moderateThreshold},seen=new Set<string>();
  const key=configuration?comparisonKey(id,configuration):null;
  const relevant=history.filter(h=>h.exerciseId===id && Date.parse(h.whenUtc)<=now && Date.parse(h.whenUtc)>=now-90*86400000 && h.sessionStatus!=='preview' &&
    (!key || h.sets.some(s=>s.detail?.performances.some(p=>p.status==='done'&&p.comparisonKey===key&&(p.side==='both'||p.side===side)))) &&
    !seen.has(h.sessionId) && (seen.add(h.sessionId),true)).sort((a,b)=>a.whenUtc.localeCompare(b.whenUtc)||a.sessionId.localeCompare(b.sessionId)).slice(-10);
  const latest=relevant.at(-1);
  if(!latest || !successfulDoseExposure(latest)) return fallback;
  const interval=(now-Date.parse(latest.whenUtc))/3_600_000;
  if(interval<=20 || interval>=192) return fallback;
  const intervalConfidence=Math.min(1,(interval-20)/4,(192-interval)/24);
  const samples:Array<{residual:number;similarity:number;recency:number}>=[];
  for(let i=1;i<relevant.length;i++) {
    const h=relevant[i],prior=relevant[i-1],at=Date.parse(h.whenUtc),gap=(at-Date.parse(prior.whenUtc))/3_600_000;
    if(!successfulDoseExposure(h) || h.plan.mode!==latest.plan.mode || prior.plan.mode!==h.plan.mode ||
      (h.plan.variantKey??'default')!==(latest.plan.variantKey??'default') ||
      (prior.plan.variantKey??'default')!==(h.plan.variantKey??'default')) continue;
    // Similarity fades rather than introducing another sharp time boundary.
    const ratio=gap/interval,similarity=Math.max(0,Math.min(1,(ratio-.5)/.25,(1.5-ratio)/.25));
    if(similarity<=0) continue;
    // A reduced prescription is not evidence that the earlier full workload was tolerated.
    if(h.plan.sets<prior.plan.sets || h.plan.reps<prior.plan.reps || h.plan.kg!==prior.plan.kg ||
      h.plan.targetLoadValue!==prior.plan.targetLoadValue || h.plan.targetSecondLoadValue!==prior.plan.targetSecondLoadValue) continue;
    const residual=work.filter(w=>w.side===side && !(w.sessionId===h.sessionId&&w.exerciseId===h.exerciseId) && w.when<at && at-w.when<=14*86400000)
      .reduce((sum,w)=>sum+w.dose*Math.pow(2,-(at-w.when)/3_600_000/halfLife),0);
    if(residual>0) samples.push({residual,similarity,recency:i});
  }
  if(samples.length<RECOVERY_POLICY.minimumComparableOutcomes) return {...fallback,comparableOutcomes:samples.length};
  const total=samples.reduce((sum,s)=>sum+s.similarity*s.recency,0);
  const supported=samples.reduce((sum,s)=>sum+s.residual*s.similarity*s.recency,0)/total;
  // Two observations alone cannot relax the default. A third partially similar
  // observation contributes gradually rather than changing the threshold at once.
  const confidence=Math.min(1,Math.max(0,samples.reduce((sum,s)=>sum+s.similarity,0)-2))*intervalConfidence;
  const upper=Math.max(RECOVERY_POLICY.moderateThreshold,Math.min(RECOVERY_POLICY.moderateThreshold*RECOVERY_POLICY.maximumToleranceMultiplier,supported+RECOVERY_POLICY.moderateThreshold*.1));
  return {comparableOutcomes:samples.length,moderateThreshold:RECOVERY_POLICY.moderateThreshold+(upper-RECOVERY_POLICY.moderateThreshold)*confidence};
}

export function recoveryMode(mode: Mode, assessment: RecoveryAssessment): Mode {
  if (assessment.modeCap === 'light') return 'light';
  return mode === 'heavy' && assessment.modeCap === 'moderate' ? 'moderate' : mode;
}
