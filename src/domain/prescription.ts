/**
 * Lastsemantisk föreskrift ovanpå referensmotorn (ENGINE/1.0.0).
 *
 * - `external_kg` använder referensens `initialPrescription`/`recommendNext` oförändrade (normativt).
 * - `assistance_kg`, `bodyweight_plus_kg`, `duration_sec`, `reps_only` använder `progressionDecision`,
 *   som speglar referensens beslutsordning men med lastriktning enligt 02 §5 (assistans: lägre = progression).
 *
 * Alla tal märkta H är produktheuristiker (05 §1), inte kliniska trösklar.
 */
import {
  ENGINE_VERSION,
  estimatedOneRepMax,
  initialPrescription,
  recommendNext,
  recoveryGate,
  roundDownKg,
  type ExerciseId,
  type Experience,
  type Exposure,
  type LiftEstimate,
  type Mode,
  type Recommendation,
  type SetResult,
  type SymptomState,
} from './decision_engine';
import { exercise } from './catalog';
import type { Confidence, HistorySet, LiftEstimateInput, PerformedExercise, PlannedExercise, Role, UserExerciseSettings } from './model';

/** H: samma som referensens MAX_INCREASE (exporteras inte där). Testas för ekvivalens. */
export const MAX_INCREASE_PCT: Record<Experience, number> = { novice: 0.05, intermediate: 0.05, experienced: 0.03 };
/** H: tidsövningar (plankan). */
export const DURATION_H = { startSeconds: null as number | null, stepSeconds: 5, minSeconds: 10, maxSeconds: 90 };
/** H: startprocent (02 §4), dupliceras för härledning mellan mode. Testas mot referensen. */
export const START_PCT: Record<Experience, Record<Mode, number>> = {
  novice: { heavy: 0.65, moderate: 0.6, light: 0.5 },
  intermediate: { heavy: 0.775, moderate: 0.7, light: 0.6 },
  experienced: { heavy: 0.825, moderate: 0.725, light: 0.625 },
};

export type GateInput = {
  /** Timmar sedan relevant arbete enligt 02 §6 (grupp <48 h, annars samma övning), null = ingen historik. */
  hoursSinceRelevant: number | null;
  relevantSymptoms: SymptomState;
  impactedRegion: boolean;
};

export type PrescribeArgs = {
  exerciseId: ExerciseId;
  mode: Mode;
  sets: number;
  role: Role;
  experience: Experience;
  settings: UserExerciseSettings | null;
  /** Historik för samma övning (alla mode), stigande tid. */
  history: PerformedExercise[];
  gate: GateInput;
  bodyweightKg: number | null;
};

const r3 = (x: number) => +x.toFixed(3);

export function incrementFor(exerciseId: ExerciseId, settings: UserExerciseSettings | null): number {
  const inc = settings?.incrementKg ?? exercise(exerciseId).defaultIncrementKg;
  if (!(inc > 0 && inc <= 10)) throw new Error('INVALID_INCREMENT');
  return inc;
}

/** e1RM från användarens uppskattning (02 §4). Submax kräver 1–8 reps och RIR 0–3. */
export function e1rmFromEstimate(e: LiftEstimateInput): { kg: number; confidence: Confidence; source: 'measured' | 'estimated' } | null {
  if (e.kind === '1rm' || e.kind === '3rm') {
    const kg = estimatedOneRepMax({ kind: e.kind, kg: e.kg });
    return { kg, confidence: e.kind === '1rm' && e.measured ? 'high' : 'medium', source: e.kind === '1rm' && e.measured ? 'measured' : 'estimated' };
  }
  if (e.reps === undefined || e.rir === undefined || e.rir === null) return null;
  return submaxE1rm(e.kg, e.reps, e.rir);
}

export function submaxE1rm(kg: number, reps: number, rir: number): { kg: number; confidence: Confidence; source: 'estimated' } | null {
  if (!(kg > 0 && kg <= 500) || !Number.isInteger(reps) || reps < 1 || reps > 8 || !Number.isInteger(rir) || rir < 0 || rir > 3) return null;
  return { kg: r3(kg * (1 + (reps + rir) / 30)), confidence: 'low', source: 'estimated' };
}

function toEngineEstimate(e: LiftEstimateInput | null): { est: LiftEstimate | null; confidence: Confidence } {
  if (!e) return { est: null, confidence: 'unknown' };
  if (e.kind === 'submax') {
    const s = e1rmFromEstimate(e);
    return s ? { est: { kind: '1rm', kg: s.kg, measured: false }, confidence: 'low' } : { est: null, confidence: 'unknown' };
  }
  return { est: { kind: e.kind, kg: e.kg, measured: e.measured }, confidence: e.kind === '1rm' && e.measured ? 'medium' : 'low' };
}

function workDone(sets: HistorySet[]): HistorySet[] {
  return sets.filter((s) => s.kind === 'work' && s.status === 'done');
}

export function hasWork(p: PerformedExercise): boolean {
  return workDone(p.sets).length > 0;
}

/** Mappar en historisk övning till referensmotorns Exposure. */
export function toExposure(p: PerformedExercise): Exposure {
  const work = p.sets.filter((s) => s.kind === 'work');
  const done = workDone(work);
  const complete = done.length >= p.plan.sets;
  const sets: SetResult[] = work.map((s) => ({
    kind: 'work',
    status: s.status === 'done' ? 'done' : 'skipped',
    plannedKg: s.plannedKg ?? p.plan.kg ?? 0,
    actualKg: s.actualKg ?? 0,
    plannedReps: s.plannedReps ?? p.plan.reps,
    actualReps: s.actualReps ?? 0,
    rir: s.rir,
    technique: s.technique ?? 'uncertain',
  }));
  return {
    exerciseId: p.exerciseId,
    whenUtc: p.whenUtc,
    complete,
    plannedTargetReps: p.plan.reps,
    bandMax: p.plan.bandMax,
    sets,
    symptom: 'none',
    voluntaryAbort: !complete && (p.sessionStatus === 'partial' || p.sessionStatus === 'abandoned'),
  };
}

function toRecommendation(plan: PlannedExercise): Recommendation {
  return {
    exerciseId: plan.exerciseId,
    kg: plan.kg,
    reps: plan.reps,
    sets: plan.sets,
    bandMin: plan.bandMin,
    bandMax: plan.bandMax,
    mode: plan.mode,
    state: plan.state === 'blocked' || plan.state === 'review_required' ? 'normal' : plan.state,
    reasons: plan.reasons,
    engineVersion: ENGINE_VERSION,
    confidence: plan.confidence,
  };
}

function base(args: PrescribeArgs, rec: Recommendation, extra: Partial<PlannedExercise>): PlannedExercise {
  const ex = exercise(args.exerciseId);
  return {
    exerciseId: args.exerciseId,
    loadKind: ex.loadKind,
    role: args.role,
    mode: args.mode,
    sets: rec.sets,
    reps: rec.reps,
    bandMin: rec.bandMin,
    bandMax: rec.bandMax,
    kg: rec.kg,
    targetSeconds: null,
    state: rec.state,
    reasons: rec.reasons,
    confidence: rec.confidence,
    engineVersion: ENGINE_VERSION,
    calibration: rec.kg === null,
    incrementKg: incrementFor(args.exerciseId, args.settings),
    estimatedOneRM: null,
    substitutionFrom: null,
    substitutionReason: null,
    acceptedByUserAt: null,
    ...extra,
  };
}

/** Sets från programmet tar företräde inom 1–4 (02 §4); omstart drar av ett set om >2 (02 §6). */
function applySets(templateSets: number, restartDrop: boolean): number {
  const s = Math.max(1, Math.min(4, templateSets));
  return restartDrop && s > 2 ? s - 1 : s;
}

function latestFor(history: PerformedExercise[], mode: Mode): { latest: PerformedExercise | null; sameMode: PerformedExercise[] } {
  const sameMode = history.filter((h) => h.plan.mode === mode && hasWork(h));
  return { latest: sameMode.length ? sameMode[sameMode.length - 1] : null, sameMode };
}

/**
 * Huvudfunktion: föreskrift för en övning givet mode, set, historik och grind.
 * Förutsätter att planeraren redan tagit bort blockerade/review_required övningar och
 * nedgraderat tung övning vid caution <48 h (08 §2 steg 4–5).
 */
export function prescribe(args: PrescribeArgs): PlannedExercise {
  const ex = exercise(args.exerciseId);
  switch (ex.loadKind) {
    case 'external_kg':
      return prescribeExternal(args);
    case 'assistance_kg':
    case 'bodyweight_plus_kg':
    case 'reps_only':
      return prescribeRepsOrAssisted(args);
    case 'duration_sec':
      return prescribeDuration(args);
  }
}

function prescribeExternal(args: PrescribeArgs): PlannedExercise {
  const inc = incrementFor(args.exerciseId, args.settings);
  const maxLoad = args.settings?.maxLoadKg ?? undefined;
  const { latest, sameMode } = latestFor(args.history, args.mode);
  const gate = recoveryGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion);
  const { est, confidence } = toEngineEstimate(args.settings?.estimate ?? null);
  const e1rm = est ? estimatedOneRepMax(est) : null;

  if (!latest) {
    // Första exponering i detta mode.
    const init = initialPrescription({ exerciseId: args.exerciseId, estimate: est, experience: args.experience, mode: args.mode, increment: inc, manualSetOverride: Math.max(1, Math.min(4, args.sets)), maxLoadKg: maxLoad });
    let rec = { ...init, confidence: init.kg === null ? 'unknown' as const : confidence };
    if (rec.kg === null) {
      // H: härled försiktigt från arbetsvikt i ett tyngre mode (aldrig uppåt) om ingen uppskattning finns.
      const derived = deriveFromOtherMode(args, inc);
      if (derived) rec = { ...rec, kg: derived.kg, reasons: ['DERIVED_FROM_OTHER_MODE', 'ROUNDED_DOWN_TO_EQUIPMENT'], confidence: 'low' };
    }
    const restart = gate.state === 'restart';
    if (restart && rec.kg !== null) {
      rec = { ...rec, kg: roundDownKg(rec.kg * gate.factor, inc), reasons: [...rec.reasons, gate.reason] };
    }
    rec = { ...rec, state: gate.state, sets: applySets(args.sets, restart) };
    if (gate.state === 'caution') rec.reasons = [...rec.reasons, gate.reason];
    return base(args, rec, { estimatedOneRM: e1rm, calibration: rec.kg === null });
  }

  if (latest.plan.kg === null) return fromCalibration(args, latest, inc, e1rm);

  const exposures = sameMode.map(toExposure);
  const next = recommendNext({
    previous: toRecommendation(latest.plan),
    history: exposures,
    experience: args.experience,
    increment: inc,
    hoursSinceRelevant: args.gate.hoursSinceRelevant,
    relevantSymptoms: args.gate.relevantSymptoms,
    impactedRegion: args.gate.impactedRegion,
    minKg: 0,
  });
  let kg = next.kg;
  const reasons = [...next.reasons];
  if (kg !== null && maxLoad !== undefined && kg > maxLoad) {
    kg = roundDownKg(maxLoad, inc);
    reasons.push('USER_MAX_LOAD_CAP');
  }
  const rec: Recommendation = { ...next, kg, reasons, sets: applySets(args.sets, gate.state === 'restart') };
  return base(args, rec, { estimatedOneRM: e1rm ?? latest.plan.estimatedOneRM, calibration: kg === null, confidence: latest.plan.confidence === 'unknown' ? 'low' : latest.plan.confidence });
}

function deriveFromOtherMode(args: PrescribeArgs, inc: number): { kg: number } | null {
  const others = args.history.filter((h) => h.plan.mode !== args.mode && h.plan.kg !== null && hasWork(h));
  const src = others[others.length - 1];
  if (!src || src.plan.kg === null) return null;
  const pctSrc = START_PCT[args.experience][src.plan.mode];
  const pctDst = START_PCT[args.experience][args.mode];
  if (pctDst > pctSrc) return null; // aldrig uppåt utan uppskattning
  const kg = roundDownKg((src.plan.kg / pctSrc) * pctDst, inc);
  return kg > 0 ? { kg } : null;
}

/** H: efter kalibrering gäller användarens egen valda arbetsvikt (lägsta utförda), reps = bandets min. */
function fromCalibration(args: PrescribeArgs, latest: PerformedExercise, inc: number, e1rm: number | null): PlannedExercise {
  const init = initialPrescription({ exerciseId: args.exerciseId, estimate: null, experience: args.experience, mode: args.mode, increment: inc, manualSetOverride: Math.max(1, Math.min(4, args.sets)) });
  const done = workDone(latest.sets).filter((s) => s.actualKg !== null && s.actualKg > 0);
  const gate = recoveryGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion);
  if (!done.length) return base(args, { ...init, state: gate.state, sets: applySets(args.sets, false) }, { calibration: true, estimatedOneRM: e1rm });
  let kg = roundDownKg(Math.min(...done.map((s) => s.actualKg as number)), inc);
  const reasons = ['CALIBRATED_FROM_USER_WEIGHT'];
  if (gate.state === 'restart') {
    kg = roundDownKg(kg * gate.factor, inc);
    reasons.push(gate.reason);
  }
  const maxLoad = args.settings?.maxLoadKg;
  if (maxLoad != null && kg > maxLoad) {
    kg = roundDownKg(maxLoad, inc);
    reasons.push('USER_MAX_LOAD_CAP');
  }
  const submax = done.map((s) => (s.actualReps !== null && s.rir !== null ? submaxE1rm(s.actualKg as number, s.actualReps, s.rir) : null)).filter((x) => x !== null);
  const derivedE1rm = submax.length ? Math.max(...submax.map((x) => x!.kg)) : null;
  return base(args, { ...init, kg, reps: init.bandMin, state: gate.state, reasons, sets: applySets(args.sets, gate.state === 'restart'), confidence: 'low' }, { calibration: false, estimatedOneRM: e1rm ?? derivedE1rm });
}

export type Decision =
  | { kind: 'hold'; reason: string }
  | { kind: 'reps_up'; reason: 'DOUBLE_PROGRESS_REPS' }
  | { kind: 'load_up'; reason: 'DOUBLE_PROGRESS_WEIGHT' }
  | { kind: 'load_down'; reason: 'TWO_CONSECUTIVE_MISSES' };

/**
 * Lastriktningsneutral speglning av referensens beslutsordning i `recommendNext`
 * (exklusive grindar, som hanteras av anroparen). "load_up" betyder ökat krav:
 * mer extern vikt, MINDRE assistans, fler sekunder.
 */
export function progressionDecision(args: {
  previous: { sets: number; reps: number; bandMax: number };
  exposures: Exposure[];
  /** För tidsövning: jämför sekunder i stället för reps (sets mappas så att plannedReps=sekundmål). */
}): Decision {
  const { previous, exposures } = args;
  const latest = exposures[exposures.length - 1];
  if (!latest) return { kind: 'hold', reason: 'NO_EXPOSURE_YET' };
  if (latest.voluntaryAbort || !latest.complete) return { kind: 'hold', reason: 'PARTIAL_NOT_FAILURE' };
  const work = latest.sets.filter((x) => x.kind === 'work' && x.status === 'done');
  const complete = work.length === previous.sets;
  const controlled = work.every((s) => s.technique !== 'poor');
  const targetsMet = complete && work.every((s) => s.actualReps >= s.plannedReps && s.actualKg >= s.plannedKg);
  const rirHold = work.some((s) => s.rir !== null && s.rir <= 1);
  const allRirGood = work.length > 0 && work.every((s) => s.rir !== null && s.rir >= 2);
  if (!complete) return { kind: 'hold', reason: 'PARTIAL_NOT_FAILURE' };
  if (!controlled) return { kind: 'hold', reason: 'TECHNIQUE_NOT_CONTROLLED' };
  if (targetsMet && !rirHold) {
    const pastTwo = exposures.slice(-2);
    const twoWins =
      pastTwo.length === 2 &&
      pastTwo.every((x) => {
        const w = x.sets.filter((s) => s.kind === 'work' && s.status === 'done');
        return x.complete && x.plannedTargetReps === previous.reps && w.length === previous.sets && w.every((s) => s.actualReps >= s.plannedReps && s.actualKg >= s.plannedKg && s.technique !== 'poor');
      });
    if (!allRirGood && !twoWins) return { kind: 'hold', reason: 'WAIT_FOR_SECOND_CONFIRMED_PASS' };
    if (previous.reps < previous.bandMax) return { kind: 'reps_up', reason: 'DOUBLE_PROGRESS_REPS' };
    return { kind: 'load_up', reason: 'DOUBLE_PROGRESS_WEIGHT' };
  }
  if (rirHold) return { kind: 'hold', reason: 'LOW_RIR_HOLD' };
  const lastTwo = exposures.slice(-2);
  const fails = (x: Exposure) => x.complete && !x.voluntaryAbort && x.sets.filter((s) => s.kind === 'work' && s.status === 'done').some((s) => s.actualReps < s.plannedReps);
  if (lastTwo.length === 2 && lastTwo.every(fails)) return { kind: 'load_down', reason: 'TWO_CONSECUTIVE_MISSES' };
  return { kind: 'hold', reason: 'FIRST_MISS_HOLD' };
}

/** Exponering för icke-extern last: kg-jämförelse neutraliseras (riktning hanteras separat). */
function neutralExposure(p: PerformedExercise, assistance: boolean): Exposure {
  const e = toExposure(p);
  return {
    ...e,
    sets: e.sets.map((s, i) => {
      const src = p.sets.filter((x) => x.kind === 'work')[i];
      const planned = src?.plannedKg ?? p.plan.kg ?? 0;
      const actual = src?.actualKg ?? planned;
      // Assistans: att ta MER hjälp än planerat innebär att målet inte nåtts med planerad last.
      const metLoad = assistance ? actual <= planned : actual >= planned;
      return { ...s, plannedKg: 0, actualKg: metLoad ? 0 : -1 };
    }),
  };
}

function prescribeRepsOrAssisted(args: PrescribeArgs): PlannedExercise {
  const ex = exercise(args.exerciseId);
  const inc = incrementFor(args.exerciseId, args.settings);
  const assistance = ex.loadKind === 'assistance_kg';
  const init = initialPrescription({ exerciseId: args.exerciseId, estimate: null, experience: args.experience, mode: args.mode, increment: inc, manualSetOverride: Math.max(1, Math.min(4, args.sets)) });
  const gate = recoveryGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion);
  const restart = gate.state === 'restart';
  const sets = applySets(args.sets, restart);
  const { latest, sameMode } = latestFor(args.history, args.mode);
  const minKg = assistance ? args.settings?.machineMinKg ?? 0 : 0;
  const maxKg = assistance ? args.settings?.machineMaxKg ?? 500 : 500;

  if (!latest) {
    return base(args, { ...init, kg: null, state: gate.state, sets, reasons: ['CALIBRATION_REQUIRED'], confidence: 'unknown' }, { calibration: true });
  }
  if (latest.plan.kg === null) {
    const done = workDone(latest.sets).filter((s) => s.actualKg !== null);
    if (!done.length) return base(args, { ...init, kg: null, state: gate.state, sets, reasons: ['CALIBRATION_REQUIRED'], confidence: 'unknown' }, { calibration: true });
    // Assistans: mest hjälp som användaren valt (försiktigast); extra vikt: minst tillagd vikt.
    const vals = done.map((s) => s.actualKg as number);
    let kg = assistance ? Math.max(...vals) : Math.min(...vals);
    const reasons = ['CALIBRATED_FROM_USER_WEIGHT'];
    if (restart) {
      kg = assistance ? Math.min(maxKg, r3(kg + inc)) : roundDownKg(kg * gate.factor, inc);
      reasons.push(gate.reason);
    }
    return base(args, { ...init, kg, reps: init.bandMin, state: gate.state, sets, reasons, confidence: 'low' }, { calibration: false });
  }

  const prev = latest.plan;
  const reasons: string[] = [];
  let kg = prev.kg as number;
  let reps = prev.reps;
  const d = progressionDecision({ previous: prev, exposures: sameMode.map((p) => neutralExposure(p, assistance)) });
  if (d.kind === 'hold') reasons.push(d.reason);
  else if (gate.state === 'caution' && (d.kind === 'reps_up' || d.kind === 'load_up')) reasons.push('RECOVERY_HOLD');
  else if (d.kind === 'reps_up') {
    reps = prev.reps + 1;
    reasons.push(d.reason);
  } else if (d.kind === 'load_up') {
    if (assistance) {
      const candidate = Math.max(minKg, r3(kg - inc));
      const bw = args.bodyweightKg;
      if (candidate === kg) reasons.push('ASSISTANCE_AT_MINIMUM');
      else if (bw !== null && bw - kg > 0 && (kg - candidate) / (bw - kg) > MAX_INCREASE_PCT[args.experience] + 1e-9) reasons.push('ASSIST_STEP_TOO_LARGE');
      else {
        kg = candidate;
        reps = prev.bandMin;
        reasons.push('ASSISTANCE_REDUCED');
      }
    } else if (ex.loadKind === 'bodyweight_plus_kg') {
      const bw = args.bodyweightKg;
      if (bw === null) reasons.push('BODYWEIGHT_UNKNOWN_HOLD');
      else if (inc / (bw + kg) > MAX_INCREASE_PCT[args.experience] + 1e-9) reasons.push('STEP_EXCEEDS_PROGRESS_CAP');
      else {
        kg = r3(kg + inc);
        reps = prev.bandMin;
        reasons.push(d.reason);
      }
    } else reasons.push('REPS_ONLY_AT_BAND_MAX');
  } else if (d.kind === 'load_down') {
    if (assistance) kg = Math.min(maxKg, r3(kg + inc));
    else kg = Math.max(0, roundDownKg(Math.max(0, kg - inc), inc));
    reasons.push(d.reason);
  }
  reasons.push(gate.reason);
  if (restart) {
    kg = assistance ? Math.min(maxKg, r3(kg + inc)) : roundDownKg(kg * gate.factor, inc);
  }
  return base(args, { ...init, kg, reps, bandMin: prev.bandMin, bandMax: prev.bandMax, state: gate.state, sets, reasons, confidence: 'low' }, { calibration: false });
}

function prescribeDuration(args: PrescribeArgs): PlannedExercise {
  const gate = recoveryGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion);
  const restart = gate.state === 'restart';
  const sets = applySets(args.sets, restart);
  const baseRec: Recommendation = { exerciseId: args.exerciseId, kg: null, reps: 1, sets, bandMin: 1, bandMax: 1, mode: args.mode, state: gate.state, reasons: [], engineVersion: ENGINE_VERSION, confidence: 'unknown' };
  const { latest, sameMode } = latestFor(args.history, args.mode);
  if (!latest) return base(args, { ...baseRec, reasons: ['CALIBRATION_REQUIRED'] }, { calibration: true, targetSeconds: null });
  if (latest.plan.targetSeconds === null) {
    const secs = workDone(latest.sets).map((s) => s.actualSeconds).filter((x): x is number => x !== null && x > 0);
    if (!secs.length) return base(args, { ...baseRec, reasons: ['CALIBRATION_REQUIRED'] }, { calibration: true, targetSeconds: null });
    const t = Math.max(DURATION_H.minSeconds, Math.min(DURATION_H.maxSeconds, Math.min(...secs)));
    return base(args, { ...baseRec, reasons: ['CALIBRATED_FROM_USER_DURATION'], confidence: 'low' }, { calibration: false, targetSeconds: t });
  }
  const target = latest.plan.targetSeconds;
  // Tidsövning: sekunder spelar rollen av reps, ingen bandprogression – bandMax=1 ger direkt "load_up" (= +sekunder).
  const exposures = sameMode.map((p) => {
    const e = toExposure(p);
    const work = p.sets.filter((x) => x.kind === 'work');
    return { ...e, plannedTargetReps: 1, sets: e.sets.map((s, i) => ({ ...s, plannedKg: 0, actualKg: 0, plannedReps: work[i]?.plannedSeconds ?? p.plan.targetSeconds ?? 0, actualReps: work[i]?.actualSeconds ?? 0 })) };
  });
  const d = progressionDecision({ previous: { sets: latest.plan.sets, reps: 1, bandMax: 1 }, exposures });
  let t = target;
  const reasons: string[] = [];
  if (d.kind === 'hold') reasons.push(d.reason);
  else if (gate.state === 'caution' && d.kind !== 'load_down') reasons.push('RECOVERY_HOLD');
  else if (d.kind === 'load_up' || d.kind === 'reps_up') {
    t = Math.min(DURATION_H.maxSeconds, target + DURATION_H.stepSeconds);
    reasons.push(t === target ? 'DURATION_AT_MAX' : 'DURATION_INCREASED');
  } else {
    t = Math.max(DURATION_H.minSeconds, target - DURATION_H.stepSeconds);
    reasons.push(d.reason);
  }
  if (restart) t = Math.max(DURATION_H.minSeconds, Math.floor(t * gate.factor));
  reasons.push(gate.reason);
  return base(args, { ...baseRec, reasons, confidence: 'low' }, { calibration: false, targetSeconds: t });
}
