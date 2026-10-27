/** Load adapters over the shared adaptive engine. Mass, assistance, repetitions and
 * duration share confirmation and trial handling; only load semantics differ.
 * All numerical policy thresholds are product heuristics, not clinical thresholds.
 */
import { adaptiveNext, estimateCapacity } from './adaptiveProgression';
import { hasShortObservedRest } from './restPolicy';
import { ENGINE_VERSION, estimatedOneRepMax, initialPrescription, recommendNext, prescriptionGate, roundDownKg, type Experience, type Exposure, type LiftEstimate, type Mode, type Recommendation, type SetResult, type SymptomState } from './decision_engine';
import type { ExerciseId, RefExerciseId } from './catalog';
import { exercise } from './catalog';
import type { Confidence, HistorySet, LiftEstimateInput, PerformedExercise, PlannedExercise, Role, UserExerciseSettings } from './model';
import type { RecoveryAssessment } from './recoveryPolicy';


/** H: tidsövningar (plankan). */
export const DURATION_H = { startSeconds: null as number | null, stepSeconds: 5, minSeconds: 10, maxSeconds: 90 };
/** H: startprocent (02 §4), dupliceras för härledning mellan mode. Testas mot referensen. */
export const START_PCT: Record<Experience, Record<Mode, number>> = {
  novice: { heavy: 0.65, moderate: 0.6, light: 0.5 },
  intermediate: { heavy: 0.775, moderate: 0.7, light: 0.6 },
  experienced: { heavy: 0.825, moderate: 0.725, light: 0.625 },
};

export type GateInput = {
  /** Verkliga timmar för en aktiv korttidsbegränsning eller för omstart; null = ingen tidsbegränsning. */
  hoursSinceRelevant: number | null;
  recovery?: RecoveryAssessment;
  relevantSymptoms: SymptomState;
  impactedRegion: boolean;
};

export type PrescribeArgs = {
  ordinarySets?: number;
  temporaryReasons?: string[];
  performedSetsOnly?: boolean;
  availableLoads?: number[];
  equipmentStep?: number;
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

function prescriptionIncrement(args: PrescribeArgs): number {
  const value = args.equipmentStep ?? incrementFor(args.exerciseId,args.settings);
  if (!Number.isFinite(value) || value <= 0 || value > 500) throw new Error('INVALID_INCREMENT');
  return value;
}

/** e1RM från användarens uppskattning (02 §4). Submax kräver 1–8 reps och RIR 0–3. */
export function e1rmFromEstimate(e: LiftEstimateInput): { kg: number; confidence: Confidence; source: 'measured' | 'estimated' } | null {
  if (e.kind === '1rm' || e.kind === '3rm') {
    const kg = estimatedOneRepMax({ kind: e.kind, kg: e.kg });
    return { kg, confidence: e.confidence ?? (e.kind === '1rm' && e.measured ? 'high' : 'medium'), source: e.kind === '1rm' && e.measured ? 'measured' : 'estimated' };
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
  return { est: { kind: e.kind, kg: e.kg, measured: e.measured }, confidence: e.confidence ?? (e.kind === '1rm' && e.measured ? 'medium' : 'low') };
}

function workDone(sets: HistorySet[]): HistorySet[] {
  return sets.filter((s) => s.kind === 'work' && s.status === 'done');
}

export function hasWork(p: PerformedExercise): boolean {
  return p.sets.some((s) => s.kind === 'work' && (s.status === 'done' || s.detail?.performances.some((p) => p.status === 'done')));
}

/** Mappar en historisk övning till referensmotorns Exposure. */
export function toExposure(p: PerformedExercise & { originalPlannedKg?: number | null }): Exposure {
  const work = p.sets.filter((s) => s.kind === 'work');
  const done = workDone(work);
  const complete = done.filter(s=>s.provenance?.role!=='extra').length >= p.plan.sets;
  const sets: SetResult[] = work.map((s,index) => ({
    effort: s.perceivedEffort,
    role: s.provenance?.role ?? (index>=p.plan.sets?'extra':'ordinary'),
    originalKg: s.provenance?.original?.loadValue ?? p.originalPlannedKg ?? p.plan.kg,
    originalReps: s.provenance?.original?.reps ?? p.plan.reps,
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
    id: p.sessionId,
    attemptBaseline:p.plan.adaptive?.trialBaseline,
    attempted:p.plan.adaptive?.attempted,
    shortObservedRest:hasShortObservedRest(work.flatMap(s=>s.detail?.rests??[])),
    originalKg:p.originalPlannedKg ?? p.plan.kg,
    exerciseId: p.exerciseId as RefExerciseId,
    whenUtc: p.whenUtc,
    complete,
    plannedSets: p.plan.sets,
    finished: p.sessionStatus === 'completed' || p.sessionStatus === 'partial',
    plannedTargetReps: p.plan.reps,
    bandMax: p.plan.bandMax,
    sets,
    symptom: 'none',
    voluntaryAbort: !complete && work.length >= p.plan.sets && (p.sessionStatus === 'partial' || p.sessionStatus === 'abandoned' || p.sessionStatus === 'in_progress' || p.sessionStatus === 'paused'),
  };
}

function toRecommendation(plan: PlannedExercise): Recommendation {
  return {
    exerciseId: plan.exerciseId as RefExerciseId,
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
    doseContext:{version:'DOSE/2.1.0',ordinarySets:args.ordinarySets??args.sets,temporaryReasons:args.temporaryReasons??[]},
    ...(rec.adaptive ? { adaptive: rec.adaptive } : {}),
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
    reasons: [...new Set([...rec.reasons, ...(args.gate.recovery?.reason ? [args.gate.recovery.reason] : [])])],
    confidence: rec.confidence,
    engineVersion: ENGINE_VERSION,
    calibration: rec.kg === null,
    incrementKg: prescriptionIncrement(args),
    estimatedOneRM: null,
    substitutionFrom: null,
    substitutionReason: null,
    acceptedByUserAt: null,
    loadBasis: ex.loadDisplayBasis,
    ...extra,
  };
}

/** Sets från programmet tar företräde inom 1–4 (02 §4); omstart drar av ett set om >2 (02 §6). */
function applySets(templateSets: number, restartDrop: boolean): number {
  const s = Math.max(1, Math.min(4, templateSets));
  return restartDrop && s > 2 ? s - 1 : s;
}

function latestFor(history: PerformedExercise[], mode: Mode): { latest: PerformedExercise | null; sameMode: PerformedExercise[] } {
  const sameMode = history.filter((h) => h.sessionStatus !== 'preview' && h.plan.mode === mode && hasWork(h)).sort((a,b)=>a.whenUtc.localeCompare(b.whenUtc)||a.sessionId.localeCompare(b.sessionId));
  return { latest: sameMode.length ? sameMode[sameMode.length - 1] : null, sameMode };
}

/**
 * Huvudfunktion: föreskrift för en övning givet mode, set, historik och grind.
 * Förutsätter att planeraren redan tagit bort blockerade/review_required övningar och
 * nedgraderat tung övning vid caution <48 h (08 §2 steg 4–5).
 */
export function prescribe(args: PrescribeArgs): PlannedExercise {
  if(args.gate.impactedRegion && ['persistent','limping','swelling'].includes(args.gate.relevantSymptoms)) return base(args,{...initialPrescription({exerciseId:args.exerciseId as RefExerciseId,estimate:null,experience:args.experience,mode:args.mode,increment:prescriptionIncrement(args)}),state:'review_required',reasons:['SYMPTOM_REVIEW_REQUIRED']},{calibration:false});
  // Extra work contributes to dose, not automatically to the next ordinary set target.
  if (args.performedSetsOnly) {
    // Projection only: never rewrite immutable historical plans or stored observations.
    args = { ...args, settings: args.settings ? { ...args.settings, estimate: null } : null,
      history: args.history.map((h) => {
        const loads = workDone(h.sets).flatMap(s => s.actualKg !== null && s.actualKg >= 0 ? [s.actualKg] : []);
        const observed = loads.length ? (exercise(h.exerciseId).loadKind === 'assistance_kg' ? Math.max(...loads) : Math.min(...loads)) : null;
        return { ...h, originalPlannedKg: h.plan.kg, plan: { ...h.plan, kg: h.plan.kg === null ? null : observed, estimatedOneRM: null, confidence: 'low' } };
      }),
    };
  }
  let result = prescribeForLoad(args);
  // A mode change must not silently undo a relevant chosen dose or compensate its repetitions.
  const last=args.history.filter(h=>h.sessionStatus!=='preview'&&hasWork(h)).at(-1);
  if(last && !['blocked','review_required'].includes(result.state) && ['external_kg','assistance_kg','bodyweight_plus_kg'].includes(exercise(args.exerciseId).loadKind)) {
    const assistance=exercise(args.exerciseId).loadKind==='assistance_kg';
    const all=adaptiveNext({previous:{...toRecommendation(last.plan),bandMin:result.bandMin,bandMax:result.bandMax},history:args.history.map(toExposure),experience:args.experience,increment:prescriptionIncrement(args),impactedRegion:args.gate.impactedRegion,hold:last.plan.mode!==args.mode||result.state!=='normal'||args.gate.recovery?.modeCap!=null,maxLoadKg:args.settings?.maxLoadKg??undefined,availableLoads:args.availableLoads,bodyweightKg:args.bodyweightKg,loadModel:assistance?'assistance':exercise(args.exerciseId).loadKind==='bodyweight_plus_kg'?'added':'mass'});
    const observed=all.adaptive?.chosenDose;
    if(observed && last.plan.mode!==args.mode) result={...result,kg:result.kg===null?observed.kg:assistance?Math.max(result.kg,observed.kg):Math.min(result.kg,observed.kg),reps:Math.min(result.reps,observed.reps),sets:Math.min(result.sets,observed.sets),adaptive:all.adaptive,reasons:[...new Set([all.adaptive?.chosenReason==='problem'?'USER_DOSE_ADAPTED':'MANUAL_WORKING_DOSE',...result.reasons])],calibration:false};
    else if(observed && result.state!=='restart') result={...result,kg:all.kg,reps:all.reps,sets:Math.min(args.sets,all.sets),adaptive:all.adaptive,reasons:[...new Set([...all.reasons,...result.reasons.filter(r=>!['DOUBLE_PROGRESS_REPS','DOUBLE_PROGRESS_WEIGHT','USER_DOSE_ADAPTED','WAIT_FOR_SECOND_CONFIRMED_PASS'].includes(r))])],calibration:false};
  }
  result=restoreTemporarySets(result,args,last??null);
  const maximum=args.settings?.maxLoadKg;
  if(maximum!=null && result.kg!==null && result.kg>maximum) result={...result,kg:roundDownKg(maximum,prescriptionIncrement(args)),reasons:[...result.reasons,'USER_MAX_LOAD_CAP']};
  return args.performedSetsOnly ? { ...result, loadSourcePolicyVersion: 'STYRKA-LOAD-SOURCE/1.0.0' } : result;
}

/** Restore only the engine's temporary set reduction, never an active selected set dose. */
export function restoreTemporarySets(result:PlannedExercise,args:Pick<PrescribeArgs,'sets'|'ordinarySets'|'temporaryReasons'|'gate'>,last:PerformedExercise|null):PlannedExercise {
  if(!last?.plan.doseContext?.temporaryReasons.length || args.temporaryReasons?.length || args.gate.recovery?.modeCap || args.gate.relevantSymptoms!=='none' || result.state==='restart' || result.adaptive?.chosenReason==='problem' || result.adaptive?.chosenDimensions?.includes('sets'))return result;
  const goal=Math.min(args.sets,args.ordinarySets??args.sets,last.plan.doseContext.ordinarySets);
  const completed=workDone(last.sets).filter(s=>s.provenance?.role!=='extra');
  const baseline=result.adaptive?.workingDose;
  if(!baseline||completed.length<last.plan.sets||goal<=last.plan.sets)return result;
  return {...result,kg:result.kg===null?null:baseline.kg,reps:baseline.reps,sets:Math.min(goal,last.plan.sets+1),adaptive:result.adaptive?{...result.adaptive,attempted:null,trialBaseline:null,decision:'TEMPORARY_SETS_RESTORED'}:undefined,reasons:['TEMPORARY_SETS_RESTORED',...result.reasons.filter(r=>!['DOUBLE_PROGRESS_REPS','DOUBLE_PROGRESS_WEIGHT','EASY_SELECTED_DOSE_TRIAL','USER_DOSE_REVIEW_TRIAL'].includes(r))]};
}

function prescribeForLoad(args: PrescribeArgs): PlannedExercise {
  switch (exercise(args.exerciseId).loadKind) {
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
  const inc = prescriptionIncrement(args);
  const maxLoad = args.settings?.maxLoadKg ?? undefined;
  const { latest, sameMode } = latestFor(args.history, args.mode);
  const gate = prescriptionGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion, args.gate.recovery);
  const supplied = toEngineEstimate(args.settings?.estimate ?? null);
  const observed=estimateCapacity([...args.history].sort((a,b)=>a.whenUtc.localeCompare(b.whenUtc)).map(toExposure));
  const est:LiftEstimate|null=observed.estimatedMax!==null?{kind:'1rm',kg:observed.estimatedMax,measured:false}:supplied.est;
  const confidence=observed.estimatedMax!==null?observed.confidence:supplied.confidence;
  const e1rm = est ? estimatedOneRepMax(est) : null;

  if (!latest) {
    // Första exponering i detta mode.
    const init = initialPrescription({ exerciseId: args.exerciseId as RefExerciseId, estimate: est, experience: args.experience, mode: args.mode, increment: inc, manualSetOverride: Math.max(1, Math.min(4, args.sets)), maxLoadKg: maxLoad });
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
    if (args.settings?.estimate?.inputReason) rec.reasons = [...rec.reasons, args.settings.estimate.inputReason];
    return base(args, rec, { estimatedOneRM: e1rm, calibration: rec.kg === null });
  }

  if (latest.plan.kg === null || (latest.plan.calibration && latest.plan.recommendation)) return fromCalibration(args, latest, inc, e1rm);

  const exposures = sameMode.map(toExposure);
  const next = recommendNext({
    previous: toRecommendation(latest.plan),
    history: exposures,
    experience: args.experience,
    increment: inc,
    hoursSinceRelevant: args.gate.hoursSinceRelevant, recovery: args.gate.recovery,
    relevantSymptoms: args.gate.relevantSymptoms,
    impactedRegion: args.gate.impactedRegion,
    minKg: 0,
    maxLoadKg: maxLoad,
    availableLoads: args.availableLoads,
    hold: gate.state !== 'normal' || args.gate.recovery?.modeCap != null,
  });
  let kg = next.kg;
  const reasons = [...next.reasons];
  if (kg !== null && maxLoad !== undefined && kg > maxLoad) {
    kg = roundDownKg(maxLoad, inc);
    reasons.push('USER_MAX_LOAD_CAP');
  }
  const rec: Recommendation = { ...next, kg, reasons, sets: Math.min(applySets(args.sets, gate.state === 'restart'), next.sets) };
  return base(args, rec, { estimatedOneRM: next.adaptive?.capacity.estimatedMax ?? e1rm ?? latest.plan.estimatedOneRM, calibration: kg === null, confidence: latest.plan.confidence === 'unknown' ? 'low' : latest.plan.confidence });
}

function deriveFromOtherMode(args: PrescribeArgs, inc: number): { kg: number } | null {
  const actualLoad = (h: PerformedExercise) => {
    const loads = workDone(h.sets).flatMap((s) => s.actualKg !== null && s.actualKg > 0 ? [s.actualKg] : []);
    return loads.length ? Math.min(...loads) : null;
  };
  const load = (h: PerformedExercise) => args.performedSetsOnly || h.plan.calibration ? actualLoad(h) : h.plan.kg;
  const others = args.history.filter((h) => h.plan.mode !== args.mode && load(h) !== null && hasWork(h));
  const src = others[others.length - 1];
  if (!src || load(src) === null) return null;
  const pctSrc = START_PCT[args.experience][src.plan.mode];
  const pctDst = START_PCT[args.experience][args.mode];
  if (pctDst > pctSrc) return null; // aldrig uppåt utan uppskattning
  const kg = roundDownKg((load(src)! / pctSrc) * pctDst, inc);
  return kg > 0 ? { kg } : null;
}

/** H: efter kalibrering gäller användarens egen valda arbetsvikt (lägsta utförda), reps = bandets min. */
function fromCalibration(args: PrescribeArgs, latest: PerformedExercise, inc: number, e1rm: number | null): PlannedExercise {
  const init = initialPrescription({ exerciseId: args.exerciseId as RefExerciseId, estimate: null, experience: args.experience, mode: args.mode, increment: inc, manualSetOverride: Math.max(1, Math.min(4, args.sets)) });
  const done = workDone(latest.sets).filter((s) => s.actualKg !== null && s.actualKg > 0);
  const gate = prescriptionGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion, args.gate.recovery);
  if (!done.length) return base(args, { ...init, state: gate.state, sets: applySets(args.sets, false) }, { calibration: true, estimatedOneRM: e1rm });
  let kg = roundDownKg(Math.min(...done.map((s) => s.actualKg as number)), inc);
  const reasons = ['CALIBRATED_FROM_USER_WEIGHT'];
  // H (CR §3.3): enkelt svar 'för tungt' vid kalibrering ⇒ nästa förslag ett viktsteg lägre (aldrig högre).
  if (done.some((s) => s.perceivedEffort === 'too_heavy')) {
    kg = roundDownKg(Math.max(0, kg - inc), inc);
    reasons.push('CALIBRATION_EFFORT_TOO_HEAVY');
  }
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
  const derivedE1rm = estimateCapacity(args.history.map(toExposure)).estimatedMax ?? (submax.length ? Math.min(...submax.map((x) => x!.kg)) : null);
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
  const {previous,exposures}=args;
  const latest=exposures.at(-1);
  const kg=latest?.sets.find(s=>s.status==='done')?.plannedKg??0;
  const p: Recommendation={exerciseId:latest?.exerciseId??'plank',kg,reps:previous.reps,sets:previous.sets,bandMin:1,bandMax:previous.bandMax,mode:'moderate',state:'normal',reasons:[],engineVersion:ENGINE_VERSION,confidence:'low'};
  const next=adaptiveNext({previous:p,history:exposures,experience:'intermediate',increment:1,impactedRegion:false,loadModel:'ordinal'});
  if(next.reasons[0]==='DOUBLE_PROGRESS_REPS') return {kind:'reps_up',reason:'DOUBLE_PROGRESS_REPS'};
  if(next.reasons[0]==='DOUBLE_PROGRESS_WEIGHT') return {kind:'load_up',reason:'DOUBLE_PROGRESS_WEIGHT'};
  if(next.reasons[0]==='TWO_CONSECUTIVE_MISSES') return {kind:'load_down',reason:'TWO_CONSECUTIVE_MISSES'};
  return {kind:'hold',reason:next.reasons[0]};
}

function prescribeRepsOrAssisted(args: PrescribeArgs): PlannedExercise {
  const ex = exercise(args.exerciseId);
  const inc = prescriptionIncrement(args);
  const assistance = ex.loadKind === 'assistance_kg';
  const init = initialPrescription({ exerciseId: args.exerciseId as RefExerciseId, estimate: null, experience: args.experience, mode: args.mode, increment: inc, manualSetOverride: Math.max(1, Math.min(4, args.sets)) });
  const gate = prescriptionGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion, args.gate.recovery);
  const restart = gate.state === 'restart';
  const sets = applySets(args.sets, restart);
  const { latest, sameMode } = latestFor(args.history, args.mode);
  const minKg = assistance ? args.settings?.machineMinKg ?? 0 : 0;
  const maxKg = assistance ? args.settings?.machineMaxKg ?? 500 : 500;

  if (!latest) {
    return base(args, { ...init, kg: null, state: gate.state, sets, reasons: ['CALIBRATION_REQUIRED'], confidence: 'unknown' }, { calibration: true });
  }
  if (latest.plan.kg === null && ex.loadKind!=='reps_only') {
    const done = workDone(latest.sets).filter((s) => s.actualKg !== null);
    if (!done.length) return base(args, { ...init, kg: null, state: gate.state, sets, reasons: ['CALIBRATION_REQUIRED'], confidence: 'unknown' }, { calibration: true });
    // Assistans: mest hjälp som användaren valt (försiktigast); extra vikt: minst tillagd vikt.
    const vals = done.map((s) => s.actualKg as number);
    let kg = assistance ? Math.max(...vals) : Math.min(...vals);
    const reasons = ['CALIBRATED_FROM_USER_WEIGHT'];
    if (done.some((s) => s.perceivedEffort === 'too_heavy')) {
      // Assistans: mer hjälp = lättare. Extra vikt: mindre vikt.
      kg = assistance ? Math.min(maxKg, r3(kg + inc)) : Math.max(0, r3(kg - inc));
      reasons.push('CALIBRATION_EFFORT_TOO_HEAVY');
    }
    if (restart) {
      kg = assistance ? Math.min(maxKg, r3(kg + inc)) : roundDownKg(kg * gate.factor, inc);
      reasons.push(gate.reason);
    }
    return base(args, { ...init, kg, reps: init.bandMin, state: gate.state, sets, reasons, confidence: 'low' }, { calibration: false });
  }

  const next = recommendNext({previous:{...toRecommendation(latest.plan),kg:ex.loadKind==='reps_only'?0:latest.plan.kg},history:sameMode.map(toExposure),experience:args.experience,increment:inc,
    hoursSinceRelevant:args.gate.hoursSinceRelevant,recovery:args.gate.recovery,relevantSymptoms:args.gate.relevantSymptoms,impactedRegion:args.gate.impactedRegion,
    hold:gate.state!=='normal'||args.gate.recovery?.modeCap!=null,
    minKg, maxLoadKg:Math.min(maxKg,args.settings?.maxLoadKg??500), availableLoads:args.availableLoads,bodyweightKg:args.bodyweightKg,
    loadModel:assistance?'assistance':ex.loadKind==='bodyweight_plus_kg'?'added':'reps'});
  return base(args,{...next,kg:ex.loadKind==='reps_only'?null:next.kg,sets:Math.min(sets,next.sets)},{calibration:false});
}

function prescribeDuration(args: PrescribeArgs): PlannedExercise {
  const gate = prescriptionGate(args.gate.hoursSinceRelevant, args.gate.relevantSymptoms, args.gate.impactedRegion, args.gate.recovery);
  const restart = gate.state === 'restart';
  const sets = applySets(args.sets, restart);
  const baseRec: Recommendation = { exerciseId: args.exerciseId as RefExerciseId, kg: null, reps: 1, sets, bandMin: 1, bandMax: 1, mode: args.mode, state: gate.state, reasons: [], engineVersion: ENGINE_VERSION, confidence: 'unknown' };
  const { latest, sameMode } = latestFor(args.history, args.mode);
  if (!latest) return base(args, { ...baseRec, reasons: ['CALIBRATION_REQUIRED'] }, { calibration: true, targetSeconds: null });
  if (latest.plan.targetSeconds === null) {
    const secs = workDone(latest.sets).map((s) => s.actualSeconds).filter((x): x is number => x !== null && x > 0);
    if (!secs.length) return base(args, { ...baseRec, reasons: ['CALIBRATION_REQUIRED'] }, { calibration: true, targetSeconds: null });
    const t = Math.max(DURATION_H.minSeconds, Math.min(DURATION_H.maxSeconds, Math.min(...secs)));
    return base(args, { ...baseRec, reasons: ['CALIBRATED_FROM_USER_DURATION'], confidence: 'low' }, { calibration: false, targetSeconds: t });
  }
  // Seconds use the same confirmation/trial kernel as ordered targets, never a kilogram e1RM.
  const exposures=sameMode.map(p=>{
    const e=toExposure(p),work=p.sets.filter(s=>s.kind==='work');
    return {...e,plannedTargetReps:1,sets:e.sets.map((s,i)=>({...s,plannedKg:work[i]?.plannedSeconds??p.plan.targetSeconds??work[i]?.actualSeconds??0,actualKg:work[i]?.actualSeconds??0,plannedReps:1,actualReps:(work[i]?.actualSeconds??0)>0?1:0}))};
  });
  const next=recommendNext({previous:{...baseRec,kg:latest.plan.targetSeconds},history:exposures,experience:args.experience,increment:DURATION_H.stepSeconds,
    loadModel:'ordinal',minKg:DURATION_H.minSeconds,maxLoadKg:DURATION_H.maxSeconds,hoursSinceRelevant:args.gate.hoursSinceRelevant,recovery:args.gate.recovery,relevantSymptoms:args.gate.relevantSymptoms,impactedRegion:args.gate.impactedRegion,hold:gate.state!=='normal'||args.gate.recovery?.modeCap!=null});
  return base(args,{...next,kg:null,reps:1,sets:Math.min(sets,next.sets),reasons:next.reasons.map(r=>r==='DOUBLE_PROGRESS_WEIGHT'?'DURATION_INCREASED':r)},{calibration:false,targetSeconds:next.kg});
}
