/**
 * TrainingService: pass-tillståndsmaskin och setloggning (01 §3.1, 03 §5.1, 09).
 * Varje användarhandling = en lokal IndexedDB-transaktion som skriver post + köpost atomärt.
 * UI får "sparat" ENDAST när transaktionen har commitats.
 */
import { ENGINE_VERSION, type Mode } from '../domain/decision_engine';
import Dexie from 'dexie';
import type { ExerciseId } from '../domain/catalog';
import { exercise } from '../domain/catalog';
import { RULESET_VERSION, type ChoiceScope, type Familiarity, type PendingSubstitution, type PerceivedEffort, type PlanSnapshot, type PlannedExercise, type Readiness, type SessionStatus, type Side, type SymptomReaction, type Technique } from '../domain/model';
import { kgToGrams, MAX_GRAMS } from '../domain/units';
import { hashOf, uuidFromSeed } from '../domain/hash';
import { SUBSTITUTION_CATALOG_VERSION } from '../domain/substitutionCatalog';
import { canCountAsPlanned, estimatedMinutesFor, planExtra, planRegular, planReplacement, substitutionCandidates, type ExtraOptions, type ReplacementResult } from '../planner/planner';
import type { Area } from '../domain/catalog';
import { LocalSaveError, type LocalCalibration, type LocalProfile, type LocalSession, type LocalSessionExercise, type LocalSet, type LocalSubstitutionEvent, type LocalSymptom } from '../storage/db';
import { auditRow, calibrationRow, profileRow, programRow, sessionExerciseRow, sessionRow, setCreatePayload, setPatchPayload, substitutionEventRow, symptomRow } from '../server/mapping';
import { AppError, outbox, type AppContext } from './context';
import { activeHealthConsent, buildPlannerInput } from './plannerInput';
import { comparisonKey, defaultConfiguration, detailStatus, executionDefinition, nextSide, requiredSides, supportedMeasurements, trainingPreferences, validateConfiguration, type ExerciseConfiguration, type PerformanceSide, type SetDetail, type SetPerformance } from '../domain/trainingFlow';
import { observedRestSeconds, recommendRest, type RestPerformance, type RestInput } from '../domain/restPolicy';
import { warmupSuggestions } from '../domain/warmupPolicy';
import { effectiveRir, validEffort } from '../domain/effort';
import { invalidateFeedback } from './feedbackCache';

const ALLOWED: Record<SessionStatus, SessionStatus[]> = {
  preview: ['in_progress'],
  in_progress: ['paused', 'completed', 'partial', 'abandoned'],
  paused: ['in_progress', 'completed', 'partial', 'abandoned'],
  completed: [],
  partial: [],
  abandoned: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Validate prospective mass targets, including independent stacks and per-side overrides.
 * Historical actual values remain factual and are never rewritten to satisfy a later limit.
 */
export function exceedsPlannedMaximum(set: Pick<LocalSet,'targetGrams'|'detail'>, maximumGrams: number): boolean {
  const detail=set.detail;
  if(detail && detail.configuration.equipment.unit!=='kg') return false;
  return (set.targetGrams??0)>maximumGrams || (detail?.targetLoadValue??0)*1000>maximumGrams ||
    (detail?.targetSecondLoadValue??0)*1000>maximumGrams ||
    Object.values(detail?.plannedSides??{}).some(x=>(x.grams??0)>maximumGrams || (x.secondLoad??0)*1000>maximumGrams);
}

export async function trainingTransaction<T>(ctx: AppContext, fn: () => Promise<T>): Promise<T> {
  const { db } = ctx;
  try {
    let queued = false;
    const r = await db.transaction('rw', [db.sets, db.outbox, db.sessions, db.sessionExercises, db.audits, db.programs, db.symptoms, db.calibrations, db.substitutionEvents, db.profile, db.skipEvents, db.exerciseSettings, db.meta], async () => {
      const before = await db.outbox.count();
      const result = await fn();
      queued = await db.outbox.count() > before;
      return result;
    });
    if (queued && !Dexie.currentTransaction) ctx.onQueued?.();
    return r;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new LocalSaveError(e);
  }
}

export async function previewNext(ctx: AppContext, minutes?: number): Promise<PlanSnapshot> {
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now(), minutes);
  return planRegular(input);
}

export async function previewExtra(ctx: AppContext, opts: ExtraOptions): Promise<PlanSnapshot> {
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now(), opts.minutes);
  return planExtra(input, opts);
}

/** Aktivt pass (in_progress/paused) om sådant finns – frånkopplade pass försvinner aldrig vid omstart. */
export async function activeSession(ctx: AppContext): Promise<LocalSession | undefined> {
  const list = await ctx.db.sessions.where('status').anyOf(['in_progress', 'paused']).toArray();
  return list.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
}

/**
 * Planerade set för en övning. Startvikt: föreskriven kg, annars bekräftat kalibreringsförslag, annars ingen.
 * Ersättare får deterministiska set-id (samma byte på två enheter ⇒ samma set ⇒ revisionskonflikt i stället för dubblett).
 */
export function plannedSetsFor(ctx: AppContext, sessionId: string, se: LocalSessionExercise, now: string, opts: { deterministic?: boolean; targetGrams?: number | null } = {}): LocalSet[] {
  const p = se.snapshot;
  const startKg = p.kg ?? p.calibrationSuggestionKg ?? null;
  const target = opts.targetGrams !== undefined ? opts.targetGrams : startKg === null ? null : kgToGrams(startKg);
  return Array.from({ length: p.sets }, (_, i) => ({
    ...(se.configuration && (p.sideTargets || se.configuration.equipment.unit === 'level' || se.configuration.equipment.basis === 'independent') ? { detail: {
      version: 1 as const, configuration: structuredClone(se.configuration), performances: [], rests: [], aborted: false,
      targetLoadValue: p.targetLoadValue ?? p.kg, targetSecondLoadValue: p.targetSecondLoadValue ?? null,
      ...(p.sideTargets ? { plannedSides: Object.fromEntries(Object.entries(p.sideTargets).map(([side, sideTarget]) => [side, {
        grams: sideTarget.kg === null ? null : kgToGrams(sideTarget.kg), reps: sideTarget.reps, seconds: null, secondLoad: null,
      }])) } : {}),
    } } : {}),
    id: opts.deterministic ? uuidFromSeed(`${se.id}|set|${i + 1}|work`) : ctx.ids.uuid(),
    sessionId,
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    ordinal: i + 1,
    kind: 'work' as const,
    status: 'planned' as const,
    targetGrams: se.configuration?.equipment.unit === 'level' || se.configuration?.equipment.basis === 'independent' ? null : target,
    targetReps: p.loadKind === 'duration_sec' ? null : p.reps,
    targetSeconds: p.loadKind === 'duration_sec' ? p.targetSeconds : null,
    actualGrams: null,
    actualReps: null,
    actualSeconds: null,
    rir: null,
    technique: null,
    occurredAt: null,
    deleted: false,
    serverRevision: null,
    createQueued: false,
    manualOverride: false,
    syncState: 'local' as const,
    updatedAt: now,
  }));
}

/** Startar pass från ett immutabelt snapshot. Snapshot + audit skrivs i samma transaktion. */
export async function startSession(ctx: AppContext, snapshot: PlanSnapshot, prepare = false): Promise<LocalSession> {
  if (!snapshot.exercises.length) throw new AppError('RULE_UNSATISFIABLE');
  if (await activeSession(ctx)) throw new AppError('INVALID_STATE', 'active_session_exists');
  if (snapshot.catchUp) {
    const current = await previewNext(ctx, snapshot.budgetMinutes);
    if (current.catchUp?.decisionId !== snapshot.catchUp.decisionId) throw new AppError('INVALID_STATE', 'CATCH_UP_CHANGED');
  }
  const now = ctx.clock.now();
  const program = (await ctx.db.programs.where('active').equals(1).toArray())[0];
  const profile = await ctx.db.profile.get(ctx.userId);
  const session: LocalSession = {
    id: ctx.ids.uuid(),
    programId: snapshot.kind === 'planned' ? (program?.id ?? null) : null,
    kind: snapshot.kind === 'extra' ? 'extra' : 'planned',
    status: prepare ? 'preview' : 'in_progress',
    timezone: profile?.timezone ?? 'Europe/Stockholm',
    startedAt: prepare ? null : now,
    finishedAt: null,
    plannedMinutes: snapshot.budgetMinutes,
    readiness: snapshot.readiness,
    templateKey: snapshot.templateKey,
    rotationIndex: snapshot.rotationIndex,
    countsAsPlannedAt: null,
    isReplacementForPlanned: false,
    clientCreatedAt: now,
    snapshot,
    revision: 1,
    syncState: 'queued',
  };
  const exs: LocalSessionExercise[] = snapshot.exercises.map((p, i) => ({
    id: ctx.ids.uuid(),
    sessionId: session.id,
    exerciseId: p.exerciseId,
    variantKey: p.variantKey ?? 'default',
    orderIndex: i,
    mode: p.mode,
    bandMin: p.bandMin,
    bandMax: p.bandMax,
    targetSets: p.sets,
    snapshot: { ...p, acceptedByUserAt: p.substitutionFrom ? (p.acceptedByUserAt ?? now) : null },
    configuration: initialConfiguration(p, profile, session.id),
    replacedById: null,
    createdAt: now,
    syncState: 'queued',
  }));
  // Byten i förhandsvisningen: originalet finns kvar i snapshotet; revisionsposter skrivs nu när passet har id.
  const pending = snapshot.substitutions ?? [];
  const exFor = (s: PendingSubstitution) => exs.find((e) => e.exerciseId === s.replacementExerciseId && e.variantKey === (s.variantKey ?? 'default'));
  const sets = exs.flatMap((e) => {
    const s = pending.find((x) => exFor(x) === e);
    return plannedSetsFor(ctx, session.id, e, now, s && s.startGrams !== undefined ? { targetGrams: s.startGrams } : {});
  });
  const events = pending.map((s) => {
    const target = exFor(s);
    return substitutionEvent(ctx, { sessionId: session.id, original: s.original, replacement: target?.snapshot ?? null, replacementSessionExerciseId: target?.id ?? null, originalSessionExerciseId: null, scope: s.scope, userOverride: s.userOverride, seed: `preview|${session.id}|${s.original.exerciseId}|${s.replacementExerciseId}|${s.variantKey ?? 'default'}` });
  });
  const audit = { id: ctx.ids.uuid(), sessionId: session.id, engineVersion: snapshot.engineVersion, inputsHash: snapshot.inputsHash, reasonCodes: [...new Set([...snapshot.reasons, ...snapshot.exercises.flatMap((e) => e.reasons)])], snapshot, generatedAt: snapshot.generatedAtUtc, syncState: 'queued' as const };
  await trainingTransaction(ctx, async () => {
    if (await activeSession(ctx)) throw new AppError('INVALID_STATE', 'active_session_exists');
    if (prepare && (await ctx.db.sessions.where('status').equals('preview').count())) throw new AppError('INVALID_STATE', 'preview_exists');
    const limits=await ctx.db.exerciseSettings.toArray();
    for(const set of sets) {const max=limits.find(x=>x.exerciseId===set.exerciseId)?.maxLoadGrams;if(max!=null && exceedsPlannedMaximum(set,max)) throw new AppError('VALIDATION_ERROR','maxLoadKg');}
    await ctx.db.sessions.add(session);
    await ctx.db.sessionExercises.bulkAdd(exs);
    await ctx.db.sets.bulkAdd(sets);
    await ctx.db.audits.add(audit);
    await ctx.db.outbox.add(outbox(ctx, session.id, { type: 'upsert', table: 'training_sessions', row: sessionRow(ctx.userId, session) }));
    for (const e of exs) await ctx.db.outbox.add(outbox(ctx, e.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, e), immutable: true }));
    for (const set of sets) await mutateSet(ctx, set.id, (x) => x);
    await ctx.db.outbox.add(outbox(ctx, audit.id, { type: 'upsert', table: 'recommendation_audits', row: auditRow(ctx.userId, audit), immutable: true }));
    for (const ev of events) {
      await ctx.db.substitutionEvents.put(ev);
      await ctx.db.outbox.add(outbox(ctx, ev.id, { type: 'upsert', table: 'session_exercise_substitution_events', row: substitutionEventRow(ctx.userId, ev), immutable: true }));
    }
  });
  return session;
}

export type SetValues = { secondLoadValue?: number | null; actualGrams?: number | null; actualReps?: number | null; actualSeconds?: number | null; rir?: number | null; technique?: Technique | null; perceivedEffort?: PerceivedEffort | null };

function validateValues(se: LocalSessionExercise, v: SetValues, done: boolean): void {
  if (v.perceivedEffort !== undefined && !validEffort(v.perceivedEffort)) throw new AppError('VALIDATION_ERROR', 'perceivedEffort');
  const lk = se.snapshot.loadKind;
  if (v.actualGrams !== undefined && v.actualGrams !== null) {
    if (!Number.isInteger(v.actualGrams) || v.actualGrams < 0 || v.actualGrams > MAX_GRAMS) throw new AppError('VALIDATION_ERROR', 'actualKg');
    if (v.actualGrams === 0 && lk === 'external_kg' && !se.snapshot.calibration) throw new AppError('VALIDATION_ERROR', 'actualKg');
  }
  if (v.actualReps !== undefined && v.actualReps !== null && (!Number.isInteger(v.actualReps) || v.actualReps < 0 || v.actualReps > 50)) throw new AppError('VALIDATION_ERROR', 'actualReps');
  if (v.actualSeconds !== undefined && v.actualSeconds !== null && (!Number.isInteger(v.actualSeconds) || v.actualSeconds < 0 || v.actualSeconds > 900)) throw new AppError('VALIDATION_ERROR', 'actualSeconds');
  if (v.rir !== undefined && v.rir !== null && (!Number.isInteger(v.rir) || v.rir < 0 || v.rir > 5)) throw new AppError('VALIDATION_ERROR', 'rir');
  if (done) {
    if (lk === 'duration_sec' ? v.actualSeconds == null : v.actualReps == null) throw new AppError('VALIDATION_ERROR', lk === 'duration_sec' ? 'actualSeconds' : 'actualReps');
    if ((lk === 'external_kg' || lk === 'assistance_kg') && v.actualGrams == null) throw new AppError('VALIDATION_ERROR', 'actualKg');
  }
}

/**
 * Gemensam väg: ändra set lokalt + köa create/patch i SAMMA transaktion. `post` körs i samma transaktion
 * efter att setet sparats (t.ex. kalibreringsfortsättning), så att allt eller inget sparas.
 */
/** Compact prior values for correction traceability; never used as current training. */
function recordedState(s: LocalSet): import('../domain/trainingFlow').RecordedState {
  return {status:s.status,deleted:s.deleted,grams:s.actualGrams,reps:s.actualReps,seconds:s.actualSeconds,rir:s.rir,technique:s.technique,effort:s.perceivedEffort??null,
    sides:(s.detail?.performances??[]).filter(p=>p.status==='done').map(p=>({id:p.id,side:p.side,status:p.status,loadValue:p.loadValue,secondLoadValue:p.secondLoadValue,repetitions:p.repetitions,seconds:p.seconds,rir:p.rir,technique:p.technique,comparisonKey:p.comparisonKey,unit:p.equipment.unit,measurement:p.equipment.measurement,effort:p.effort??null}))};
}

export async function mutateSet(ctx: AppContext, setId: string, change: (s: LocalSet, se: LocalSessionExercise) => LocalSet, post?: (saved: LocalSet, se: LocalSessionExercise) => Promise<void>): Promise<LocalSet> {
  let result!: LocalSet;
  await trainingTransaction(ctx, async () => {
    const before = await ctx.db.sets.get(setId);
    if (!before) throw new AppError('NOT_FOUND');
    const session = await ctx.db.sessions.get(before.sessionId);
    if (!session) throw new AppError('NOT_FOUND');
    const se = await ctx.db.sessionExercises.get(before.sessionExerciseId);
    if (!se) throw new AppError('NOT_FOUND');
    const after = { ...change(before, se), updatedAt: ctx.clock.now() };
    const recordedBefore=recordedState(before), recordedAfter=recordedState(after);
    if(after.detail && (recordedBefore.sides.length || before.status==='done') && hashOf(recordedBefore)!==hashOf(recordedAfter)) {
      after.detail={...after.detail,recordingChanges:[...(before.detail?.recordingChanges??[]),{id:ctx.ids.uuid(),at:ctx.clock.now(),before:recordedBefore,afterHash:hashOf(recordedAfter)}]};
    }
    // Fail atomically before queueing a detail that the server cannot accept.
    // Indented JSON is a conservative upper bound for PostgreSQL jsonb text size.
    if (after.detail && new TextEncoder().encode(JSON.stringify(after.detail,null,1)).length > 64000) throw new AppError('VALIDATION_ERROR','setDetailSize');
    if (!before.createQueued) {
      after.createQueued = true;
      await ctx.db.outbox.add(outbox(ctx, setId, { type: 'set', setId, create: true, payload: setCreatePayload(after) }));
    } else {
      const patch = setPatchPayload(before, after);
      if (Object.keys(patch).length) await ctx.db.outbox.add(outbox(ctx, setId, { type: 'set', setId, create: false, payload: patch }));
    }
    after.syncState = before.syncState === 'conflict' ? 'conflict' : 'queued';
    await ctx.db.sets.put(after);
    if (hashOf(recordedBefore) !== hashOf(recordedAfter)) await invalidateFeedback(ctx.db, { sessionId: after.sessionId, setId });
    result = after;
    if (post) await post(after, se);
    if (after.kind === 'work' && ['completed','partial'].includes(session.status)) await updateCalibrationsTx(ctx,session.id);
  });
  return result;
}

function isOverride(s: LocalSet, v: SetValues): boolean {
  return (v.actualGrams !== undefined && v.actualGrams !== s.targetGrams) || (v.actualReps !== undefined && s.targetReps !== null && v.actualReps !== s.targetReps) || (v.actualSeconds !== undefined && s.targetSeconds !== null && v.actualSeconds !== s.targetSeconds);
}

/** "Klart": registrera set som utfört (1 tryck med förifyllda värden). */
export async function logSet(ctx: AppContext, setId: string, values: SetValues): Promise<LocalSet> {
  const existing = await ctx.db.sets.get(setId);
  if (!existing) throw new AppError('NOT_FOUND');
  const session = await ctx.db.sessions.get(existing.sessionId);
  if (!session || !['in_progress', 'paused'].includes(session.status)) throw new AppError('INVALID_STATE');
  const se = await ctx.db.sessionExercises.get(existing.sessionExerciseId);
  if (!se) throw new AppError('NOT_FOUND');
  // Compatibility API for old aggregate registrations. Never fabricate two sides.
  // The current UI uses recordPerformance with an explicit, idempotent side.
  if (existing.detail) {
    if (existing.detail.configuration.executionMode !== 'bilateral') throw new AppError('VALIDATION_ERROR', 'choose_side');
    return recordPerformance(ctx, setId, 'both', values);
  }
  const v: SetValues = {
    actualGrams: values.actualGrams !== undefined ? values.actualGrams : existing.targetGrams,
    actualReps: values.actualReps !== undefined ? values.actualReps : existing.targetReps,
    actualSeconds: values.actualSeconds !== undefined ? values.actualSeconds : existing.targetSeconds,
    rir: values.rir ?? null,
    technique: values.technique ?? 'controlled',
    perceivedEffort: values.perceivedEffort ?? null,
  };
  if (se.snapshot.loadKind === 'bodyweight_plus_kg' && v.actualGrams == null) v.actualGrams = 0;
  validateValues(se, v, true);
  const effort = { perceivedEffort: values.perceivedEffort ?? null };
  return mutateSet(ctx, setId, (s) => ({ ...s, ...effort, status: 'done', actualGrams: v.actualGrams ?? null, actualReps: v.actualReps ?? null, actualSeconds: v.actualSeconds ?? null, rir: effort.perceivedEffort === 'maximal' ? null : v.rir ?? null, technique: v.technique ?? null, occurredAt: ctx.clock.now(), manualOverride: isOverride(s, v) }), (saved, x) => continueCalibration(ctx, x, saved));
}

/**
 * Optional, per-set/side effort. Only explicit maximal effort defines zero reserve;
 * descriptive answers do not infer RIR or force load reductions. Old calibration answers survive.
 */
export async function rateSet(ctx: AppContext, setId: string, effort: PerceivedEffort | null, side?: PerformanceSide): Promise<LocalSet> {
  if (!validEffort(effort)) throw new AppError('VALIDATION_ERROR', 'perceivedEffort');
  return trainingTransaction(ctx, async () => {
    const existing = await ctx.db.sets.get(setId);
    if (!existing) throw new AppError('NOT_FOUND');
    if (existing.deleted || existing.kind !== 'work') throw new AppError('INVALID_STATE');
    if (existing.detail) {
      const target = side ?? (existing.detail.configuration.executionMode === 'bilateral' ? 'both' : null);
      const performance = existing.detail.performances.find((p) => p.side === target && p.status === 'done');
      if (!performance) throw new AppError('INVALID_STATE', 'choose_side');
      if ((performance.effort ?? null) === effort) return existing;
      return mutateSet(ctx, setId, (s) => {
        const detail = structuredClone(s.detail!);
        detail.performances = detail.performances.map((p) => p.id === performance.id ? { ...p, effort, rir: effort === 'maximal' ? null : p.rir } : p);
        return withDetail(s, detail);
      }, async (saved, x) => { await continueCalibration(ctx, x, saved); await refreshActiveRest(ctx,saved); });
    }
    if (existing.status !== 'done' || side && side !== 'both') throw new AppError('INVALID_STATE');
    if ((existing.perceivedEffort ?? null) === effort) return existing;
    return mutateSet(ctx, setId, (s) => ({ ...s, perceivedEffort: effort, rir: effort === 'maximal' ? null : s.rir }), (saved, x) => continueCalibration(ctx, x, saved));
  });
}

/** "Ändra set": redigera ett redan utfört set. */
export async function editSet(ctx: AppContext, setId: string, values: SetValues): Promise<LocalSet> {
  const existing = await ctx.db.sets.get(setId);
  if (!existing) throw new AppError('NOT_FOUND');
  const se = await ctx.db.sessionExercises.get(existing.sessionExerciseId);
  if (!se) throw new AppError('NOT_FOUND');
  if (existing.detail) {
    if (existing.detail.configuration.executionMode !== 'bilateral') throw new AppError('VALIDATION_ERROR', 'choose_side');
    return recordPerformance(ctx, setId, 'both', values, { edit: true });
  }
  const merged: SetValues = { actualGrams: existing.actualGrams, actualReps: existing.actualReps, actualSeconds: existing.actualSeconds, rir: existing.rir, technique: existing.technique, ...values };
  const changed = merged.actualGrams !== existing.actualGrams || merged.actualReps !== existing.actualReps || merged.actualSeconds !== existing.actualSeconds;
  const effort = values.perceivedEffort !== undefined ? values.perceivedEffort : changed || (values.rir != null && values.rir > 0 && existing.perceivedEffort === 'maximal') ? null : existing.perceivedEffort ?? null;
  if (changed && values.rir === undefined) merged.rir = null;
  validateValues(se, merged, existing.status === 'done');
  return mutateSet(ctx, setId, (s) => ({ ...s, perceivedEffort: effort, actualGrams: merged.actualGrams ?? null, actualReps: merged.actualReps ?? null, actualSeconds: merged.actualSeconds ?? null, rir: effort === 'maximal' ? null : merged.rir ?? null, technique: merged.technique ?? null, manualOverride: isOverride(s, merged) }));
}

/** "Ångra": utfört set → planerat igen, historiken förblir korrekt (acceptanstest 37). */
export async function undoSet(ctx: AppContext, setId: string): Promise<LocalSet> {
  return mutateSet(ctx, setId, (s) => ({ ...s, ...(s.detail ? { detail: { ...s.detail, performances: [], rests: [], aborted: false } } : {}), status: 'planned', perceivedEffort: null, actualGrams: null, actualReps: null, actualSeconds: null, rir: null, technique: null, occurredAt: null, manualOverride: false }));
}

export async function skipSet(ctx: AppContext, setId: string): Promise<LocalSet> {
  const s = await ctx.db.sets.get(setId);
  if (s?.detail) return abortTrainingSet(ctx, setId);
  return mutateSet(ctx, setId, (s) => ({ ...s, status: 'skipped', occurredAt: null }));
}

/** Lägg till ett set (kopia av senaste setets mål). Ordinal max 20 (DB). */
export async function addSet(ctx: AppContext, sessionExerciseId: string): Promise<LocalSet> {
  return trainingTransaction(ctx,async () => {
    const se=await ctx.db.sessionExercises.get(sessionExerciseId);
    const session=se && await ctx.db.sessions.get(se.sessionId);
    if(!se || !session) throw new AppError('NOT_FOUND');
    if(se.replacedById || !['preview','in_progress','paused'].includes(session.status)) throw new AppError('INVALID_STATE');
    const sets=(await ctx.db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s)=>s.kind==='work');
    const ordinal=Math.max(0,...sets.map((s)=>s.ordinal))+1;
    if(ordinal>20) throw new AppError('VALIDATION_ERROR','ordinal');
    const last=sets.filter((s)=>!s.deleted).sort((a,b)=>b.ordinal-a.ordinal)[0];
    const s:LocalSet={...plannedSetsFor(ctx,se.sessionId,{...se,snapshot:{...se.snapshot,sets:1}},ctx.clock.now())[0],ordinal,
      targetGrams:last?.targetGrams ?? null,targetReps:last?.targetReps ?? se.snapshot.reps,targetSeconds:last?.targetSeconds ?? se.snapshot.targetSeconds};
    await ctx.db.sets.add(s);
    return mutateSet(ctx,s.id,(x)=>({...x,detail:{...detailFor(x,se),targetLoadValue:last?.detail?.targetLoadValue,targetSecondLoadValue:last?.detail?.targetSecondLoadValue,plannedSides:last?.detail?.plannedSides ? structuredClone(last.detail.plannedSides) : undefined}}));
  });
}

export async function setStatus(ctx: AppContext, sessionId: string, to: SessionStatus, extra: Partial<LocalSession> = {}): Promise<LocalSession> {
  let out!: LocalSession;
  await trainingTransaction(ctx, async () => {
    const s = await ctx.db.sessions.get(sessionId);
    if (!s) throw new AppError('NOT_FOUND');
    if (!canTransition(s.status, to)) throw new AppError('INVALID_STATE', `${s.status}->${to}`);
    out = { ...s, ...extra, status: to, revision: s.revision + 1, syncState: 'queued' };
    await ctx.db.sessions.put(out);
    await ctx.db.outbox.add(outbox(ctx, sessionId, { type: 'upsert', table: 'training_sessions', row: sessionRow(ctx.userId, out) }));
  });
  return out;
}

export const pauseSession = (ctx: AppContext, id: string) => setStatus(ctx, id, 'paused');
export const resumeSession = (ctx: AppContext, id: string) => setStatus(ctx, id, 'in_progress');

export type FinishOptions = { status?: 'completed' | 'partial' | 'abandoned'; keepLoggedSets?: boolean };

/**
 * Avsluta pass. completed om alla planerade arbetsset är utförda, annars partial (om inte abandoned valts).
 * Ordinarie pass med ≥1 utfört arbetsset (completed/partial) flyttar rotationsindex (08 §2 steg 9).
 * Loggade set försvinner aldrig vid partial (42); vid abandoned endast om användaren uttryckligen väljer det.
 */
export async function finishSession(ctx: AppContext, sessionId: string, opts: FinishOptions = {}): Promise<LocalSession> {
  const now = ctx.clock.now();
  let out!: LocalSession;
  await trainingTransaction(ctx, async () => {
    const s = await ctx.db.sessions.get(sessionId);
    if (!s) throw new AppError('NOT_FOUND');
    if (['completed', 'partial', 'abandoned'].includes(s.status)) return void (out = s);
    const sets = (await ctx.db.sets.where('sessionId').equals(sessionId).toArray()).filter((x) => !x.deleted && x.kind === 'work');
    const doneWork = sets.filter((x) => x.status === 'done').length;
    const allPlannedDone = sets.length > 0 && sets.every((x) => x.status === 'done');
    const status = opts.status === 'abandoned' ? 'abandoned' : opts.status ?? (allPlannedDone ? 'completed' : 'partial');
    if (!canTransition(s.status, status)) throw new AppError('INVALID_STATE', `${s.status}->${status}`);
    for (const set of await ctx.db.sets.where('sessionId').equals(sessionId).toArray()) if (set.detail?.rests.some((r) => r.outcome === 'active')) await mutateSet(ctx, set.id, (x) => ({ ...x, detail: { ...x.detail!, rests: x.detail!.rests.map((r) => r.outcome === 'active' ? { ...r, outcome: 'session_ended', endedAt: now } : r) } }));
    if (status === 'abandoned' && opts.keepLoggedSets === false) {
      for (const set of (await ctx.db.sets.where('sessionId').equals(sessionId).toArray()).filter((x) => !x.deleted && (x.status === 'done' || x.status === 'partial'))) {
        const after: LocalSet = { ...set, deleted: true, updatedAt: now, syncState: 'queued' };
        await ctx.db.outbox.add(outbox(ctx, set.id, { type: 'set', setId: set.id, create: false, payload: setPatchPayload(set, after) }));
        await ctx.db.sets.put(after);
      }
    }
    out = { ...s, status, finishedAt: now, revision: s.revision + 1, syncState: 'queued' };
    await ctx.db.sessions.put(out);
    await ctx.db.outbox.add(outbox(ctx, sessionId, { type: 'upsert', table: 'training_sessions', row: sessionRow(ctx.userId, out) }));
    if (status === 'completed' || status === 'partial') await updateCalibrationsTx(ctx, sessionId);
    if (s.kind === 'planned' && (status === 'completed' || status === 'partial') && doneWork > 0 && s.programId) {
      const program = await ctx.db.programs.get(s.programId);
      if (program && program.active === 1 && s.rotationIndex === program.rotationIndex) {
        const next = { ...program, rotationIndex: program.rotationIndex + 1, revision: program.revision + 1, syncState: 'queued' as const };
        await ctx.db.programs.put(next);
        await ctx.db.outbox.add(outbox(ctx, program.id, { type: 'upsert', table: 'programs', row: programRow(ctx.userId, next) }));
      }
    }
  });
  return out;
}

/** 08 §3: "Räkna som ordinarie" – endast med aktivt användarval och när huvudarbetet faktiskt gjorts. */
export async function countExtraAsPlanned(ctx: AppContext, extraSessionId: string): Promise<boolean> {
  const s = await ctx.db.sessions.get(extraSessionId);
  if (!s || s.kind !== 'extra' || s.countsAsPlannedAt || !['completed', 'partial'].includes(s.status)) return false;
  const next = await previewNext(ctx);
  const exs = await ctx.db.sessionExercises.where('sessionId').equals(extraSessionId).toArray();
  const sets = await ctx.db.sets.where('sessionId').equals(extraSessionId).toArray();
  const done = exs.map((e) => ({ exerciseId: e.exerciseId, doneWorkSets: sets.filter((x) => x.sessionExerciseId === e.id && x.kind === 'work' && x.status === 'done' && !x.deleted).length }));
  if (!canCountAsPlanned(next, done)) return false;
  const now = ctx.clock.now();
  await trainingTransaction(ctx, async () => {
    const program = (await ctx.db.programs.where('active').equals(1).toArray())[0];
    const upd = { ...s, countsAsPlannedAt: now, isReplacementForPlanned: true, programId: program?.id ?? null, revision: s.revision + 1, syncState: 'queued' as const };
    await ctx.db.sessions.put(upd);
    await ctx.db.outbox.add(outbox(ctx, s.id, { type: 'upsert', table: 'training_sessions', row: sessionRow(ctx.userId, upd) }));
    if (program) {
      const np = { ...program, rotationIndex: program.rotationIndex + 1, revision: program.revision + 1, syncState: 'queued' as const };
      await ctx.db.programs.put(np);
      await ctx.db.outbox.add(outbox(ctx, program.id, { type: 'upsert', table: 'programs', row: programRow(ctx.userId, np) }));
    }
  });
  return true;
}

export async function canOfferCountAsPlanned(ctx: AppContext, extraSessionId: string): Promise<boolean> {
  const s = await ctx.db.sessions.get(extraSessionId);
  if (!s || s.kind !== 'extra' || s.countsAsPlannedAt || !['completed', 'partial'].includes(s.status)) return false;
  const next = await previewNext(ctx);
  const exs = await ctx.db.sessionExercises.where('sessionId').equals(extraSessionId).toArray();
  const sets = await ctx.db.sets.where('sessionId').equals(extraSessionId).toArray();
  return canCountAsPlanned(next, exs.map((e) => ({ exerciseId: e.exerciseId, doneWorkSets: sets.filter((x) => x.sessionExerciseId === e.id && x.kind === 'work' && x.status === 'done' && !x.deleted).length })));
}

/**
 * S09 (version 1, används när feature flag för substitution v2 är avstängd): byt övning under passet.
 * Ny föreskrift beräknas av motorn (separat historik/e1RM); tidigare loggade set behålls oförändrade.
 */
export async function swapExerciseLegacy(ctx: AppContext, sessionExerciseId: string, to: ExerciseId, opts: { mode?: Mode } = {}): Promise<LocalSessionExercise> {
  const old = await ctx.db.sessionExercises.get(sessionExerciseId);
  if (!old) throw new AppError('NOT_FOUND');
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const remaining = (await ctx.db.sets.where('sessionExerciseId').equals(old.id).toArray()).filter(s=>!s.deleted&&s.kind==='work'&&s.status!=='done'&&!s.detail?.performances.some(p=>p.status==='done'));
  if(!remaining.length||old.replacedById) throw new AppError('INVALID_STATE');
  const siblings=(await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray()).filter(e=>!e.replacedById&&e.id!==old.id);
  const result=planReplacement(input,{from:{...old.snapshot,mode:opts.mode??old.mode,sets:remaining.length},to,others:siblings.map(e=>e.snapshot)});
  if(result.status!=='ok'||!result.planned) throw new AppError('RULE_UNSATISFIABLE',result.status);
  const p=result.planned,now=ctx.clock.now();
  const all = await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray();
  const ne: LocalSessionExercise = {
    id: ctx.ids.uuid(),
    sessionId: old.sessionId,
    exerciseId: to,
    variantKey: 'default',
    orderIndex: Math.max(...all.map((e) => e.orderIndex)) + 1,
    mode: p.mode,
    bandMin: p.bandMin,
    bandMax: p.bandMax,
    targetSets: p.sets,
    snapshot: { ...p, substitutionFrom: old.exerciseId, substitutionReason: 'USER_SWAP', acceptedByUserAt: now, reasons: [...p.reasons, 'USER_SWAP'] },
    configuration: initialConfiguration(p, await ctx.db.profile.get(ctx.userId), old.sessionId),
    replacedById: null,
    createdAt: now,
    syncState: 'queued',
  };
  const newSets = plannedSetsFor(ctx, old.sessionId, ne, now);
  await trainingTransaction(ctx, async () => {
    await dismissExerciseRests(ctx,old.id);
    await ctx.db.sessionExercises.put({ ...old, replacedById: ne.id });
    await ctx.db.sessionExercises.add(ne);
    // Oanvända planerade set i gamla övningen tas bort lokalt (de har aldrig synkats).
    const oldSets = await ctx.db.sets.where('sessionExerciseId').equals(old.id).toArray();
    for (const s of oldSets) {
      if (s.status === 'partial') await abortTrainingSet(ctx, s.id);
      else if (s.status !== 'done' && !s.deleted) await mutateSet(ctx, s.id, (x) => ({ ...x, deleted: true }));
    }
    await ctx.db.sets.bulkAdd(newSets);
    await ctx.db.outbox.add(outbox(ctx, ne.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, ne), immutable: true }));
    for (const set of newSets) await mutateSet(ctx, set.id, (x) => x);
  });
  return ne;
}

async function dismissExerciseRests(ctx:AppContext,exerciseId:string) {
  for(const set of await ctx.db.sets.where('sessionExerciseId').equals(exerciseId).toArray()) {
    if(set.detail?.rests.some((r)=>r.outcome==='active'))await mutateSet(ctx,set.id,(s)=>({...s,detail:{...s.detail!,rests:s.detail!.rests.map((r)=>r.outcome==='active'?{...r,outcome:'dismissed',endedAt:ctx.clock.now()}:r)}}));
  }
}

// ---------------------------------------------------------------------------
// Övningsbyte v2 (STYRKA-CR-2026-10-10-01)
// ---------------------------------------------------------------------------

export type SwapOptions = {
  /** "Bara idag" (standard) eller "Använd framöver" (endast kommande planering). */
  scope?: ChoiceScope;
  /** Svar på "Har du gjort övningen tidigare?" – lagras per övning. */
  familiarity?: Familiarity;
  /** Användarens bekräftade eller ändrade startvikt (gram). Krävs vid hjälpskattning. */
  startGrams?: number | null;
  /** Annan maskinprofil för maskin-/kabelövning. */
  variantKey?: string;
};

function substitutionEvent(ctx: AppContext, a: { sessionId: string; original: PlannedExercise; replacement: PlannedExercise | null; originalSessionExerciseId: string | null; replacementSessionExerciseId: string | null; scope: ChoiceScope; userOverride: boolean; seed: string }): LocalSubstitutionEvent {
  const r = a.replacement;
  return {
    id: uuidFromSeed(`subevent|${a.seed}`),
    sessionId: a.sessionId,
    originalExerciseId: a.original.exerciseId,
    replacementExerciseId: r?.exerciseId ?? a.original.exerciseId,
    originalSessionExerciseId: a.originalSessionExerciseId,
    replacementSessionExerciseId: a.replacementSessionExerciseId,
    choiceScope: a.scope,
    engineVersion: r?.engineVersion ?? a.original.engineVersion,
    substitutionCatalogVersion: r?.substitution?.catalogVersion ?? SUBSTITUTION_CATALOG_VERSION,
    algorithmRuleVersion: r?.substitution?.ruleSetVersion ?? RULESET_VERSION,
    sourceEvidenceIds: r?.substitution?.evidenceIds ?? [],
    loadEstimationKind: r?.loadEstimationKind ?? 'none',
    reasonCodes: r?.reasons ?? [],
    userOverride: a.userOverride,
    createdAt: ctx.clock.now(),
    syncState: 'queued',
  };
}

async function familiarityMap(ctx: AppContext): Promise<Partial<Record<ExerciseId, Familiarity>>> {
  const out: Partial<Record<ExerciseId, Familiarity>> = {};
  for (const c of await ctx.db.calibrations.toArray()) if (c.variantKey === 'default' && c.familiarity !== 'unknown') out[c.exerciseId] = c.familiarity;
  return out;
}

const calibrationId = (ctx: AppContext, exerciseId: ExerciseId, variantKey: string) => uuidFromSeed(`calibration|${ctx.userId}|${exerciseId}|${variantKey}`);

async function putFamiliarity(ctx: AppContext, exerciseId: ExerciseId, familiarity: Familiarity, variantKey = 'default'): Promise<void> {
  const id = calibrationId(ctx, exerciseId, variantKey);
  const cur = await ctx.db.calibrations.get(id);
  const row: LocalCalibration = { id, exerciseId, variantKey, familiarity, quality: cur?.quality ?? 'none', observations: cur?.observations ?? [], calibratedAt: cur?.calibratedAt ?? null, updatedAt: ctx.clock.now(), syncState: 'queued' };
  await ctx.db.calibrations.put(row);
  await ctx.db.outbox.add(outbox(ctx, id, { type: 'upsert', table: 'user_exercise_calibrations', row: calibrationRow(ctx.userId, row) }));
}

/** "Har du gjort övningen tidigare?" – sparas per övning och används för hjälpskattning (§3.3). */
export async function setFamiliarity(ctx: AppContext, exerciseId: ExerciseId, familiarity: Familiarity): Promise<void> {
  await trainingTransaction(ctx, () => putFamiliarity(ctx, exerciseId, familiarity));
}

export async function getFamiliarities(ctx: AppContext): Promise<Partial<Record<ExerciseId, Familiarity>>> {
  return familiarityMap(ctx);
}

/** Aktiva övningar i ett pass i visningsordning (ersättare på originalets plats). */
export function displayOrder(exs: LocalSessionExercise[]): LocalSessionExercise[] {
  const root = (e: LocalSessionExercise) => (e.orderIndex >= 100 ? Math.floor((e.orderIndex - 100) / 10) : e.orderIndex);
  return exs.filter((e) => !e.replacedById).sort((a, b) => root(a) - root(b) || a.orderIndex - b.orderIndex);
}

function nextOrderIndex(old: LocalSessionExercise): number {
  // Ersättare får deterministisk ordning: 100 + 10 × ursprunglig position + kedjedjup (1–9).
  if (old.orderIndex < 100) return 100 + old.orderIndex * 10 + 1;
  const depth = (old.orderIndex - 100) % 10;
  if (depth >= 9) throw new AppError('VALIDATION_ERROR', 'too_many_swaps');
  return old.orderIndex + 1;
}

/** Kandidater för bytesvyn (S09 v2) för en övning i ett pågående pass. */
export async function swapCandidates(ctx: AppContext, sessionExerciseId: string): Promise<ReturnType<typeof substitutionCandidates>> {
  const old = await ctx.db.sessionExercises.get(sessionExerciseId);
  if (!old) throw new AppError('NOT_FOUND');
  const others = displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray()).filter((e) => e.id !== old.id).map((e) => e.snapshot);
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  return substitutionCandidates(input, old.snapshot, others, await familiarityMap(ctx));
}

/** Kandidater för bytesvyn i passförhandsvisningen (planerat pass eller spontanpass). */
export async function previewSwapCandidates(ctx: AppContext, snapshot: PlanSnapshot, index: number): Promise<ReturnType<typeof substitutionCandidates>> {
  const from = snapshot.exercises[index];
  if (!from) throw new AppError('NOT_FOUND');
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  return substitutionCandidates(input, from, snapshot.exercises.filter((_, i) => i !== index), await familiarityMap(ctx));
}

/** Förhandsgranska ett byte (utan att spara) – visar set/reps, vikt eller kalibreringsläge. */
export async function previewReplacement(ctx: AppContext, from: PlannedExercise, others: PlannedExercise[], to: ExerciseId, opts: Pick<SwapOptions, 'familiarity' | 'variantKey'> = {}): Promise<ReplacementResult> {
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const fam = opts.familiarity ?? (await familiarityMap(ctx))[to];
  return planReplacement(input, { from, to, others, familiarity: fam, variantKey: opts.variantKey });
}

/** Förhandsgranska byte av en övning i ett pågående pass (övriga aktiva övningar hämtas lokalt). */
export async function previewSwap(ctx: AppContext, sessionExerciseId: string, to: ExerciseId, opts: Pick<SwapOptions, 'familiarity' | 'variantKey'> = {}): Promise<ReplacementResult> {
  const old = await ctx.db.sessionExercises.get(sessionExerciseId);
  if (!old) throw new AppError('NOT_FOUND');
  const others = displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray()).filter((e) => e.id !== old.id).map((e) => e.snapshot);
  return previewReplacement(ctx, old.snapshot, others, to, opts);
}

async function applyFutureScope(ctx: AppContext, root: ExerciseId, to: ExerciseId, variantKey: string | undefined): Promise<void> {
  const p = await ctx.db.profile.get(ctx.userId);
  if (!p) return;
  const substitutions = { ...p.substitutions };
  if (to === root) delete substitutions[root];
  else substitutions[root] = to;
  const equipmentProfiles = { ...(p.equipmentProfiles ?? {}) };
  if (variantKey && variantKey !== 'default') equipmentProfiles[to] = variantKey;
  else delete equipmentProfiles[to];
  const out: LocalProfile = { ...p, substitutions, equipmentProfiles, syncState: 'queued' };
  await ctx.db.profile.put(out);
  await ctx.db.outbox.add(outbox(ctx, ctx.userId, { type: 'profile', patch: profileRow(out) }));
}

/**
 * Byt övning under passet (CR §2.1). Ursprunglig planerad övning och dess snapshot bevaras; utförda set behåller
 * sitt exercise_id (SUB16); nya set knyts till ersättaren. Allt skrivs i EN lokal transaktion med köposter.
 */
export async function swapExercise(ctx: AppContext, sessionExerciseId: string, to: ExerciseId, opts: SwapOptions = {}): Promise<{ sessionExercise: LocalSessionExercise; event: LocalSubstitutionEvent }> {
  const old = await ctx.db.sessionExercises.get(sessionExerciseId);
  if (!old) throw new AppError('NOT_FOUND');
  if (old.replacedById) throw new AppError('INVALID_STATE', 'ALREADY_REPLACED');
  const session = await ctx.db.sessions.get(old.sessionId);
  if (!session || !['preview', 'in_progress', 'paused'].includes(session.status)) throw new AppError('INVALID_STATE');
  const scope = opts.scope ?? 'today';
  const all = await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray();
  const others = displayOrder(all).filter((e) => e.id !== old.id).map((e) => e.snapshot);
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const familiarity = opts.familiarity ?? (await familiarityMap(ctx))[to];
  const res = planReplacement(input, { from: old.snapshot, to, others, familiarity, variantKey: opts.variantKey, replacesSessionExerciseId: old.id });
  if (res.status !== 'ok' || !res.planned) throw new AppError('RULE_UNSATISFIABLE', res.status);
  const remaining = (await ctx.db.sets.where('sessionExerciseId').equals(old.id).toArray()).filter((s) => !s.deleted && s.kind === 'work' && s.status !== 'done' && !s.detail?.performances.some((p) => p.status === 'done'));
  if (!remaining.length) throw new AppError('INVALID_STATE', 'no_remaining_sets');
  const planned = { ...res.planned, sets: Math.min(res.planned.sets, remaining.length) };
  const proposedKg = planned.kg ?? planned.calibrationSuggestionKg ?? null;
  if (res.requiresConfirmation && opts.startGrams === undefined) throw new AppError('VALIDATION_ERROR', 'CONFIRM_START_WEIGHT');
  if (opts.startGrams !== undefined && opts.startGrams !== null && (!Number.isInteger(opts.startGrams) || opts.startGrams < 0 || opts.startGrams > MAX_GRAMS)) throw new AppError('VALIDATION_ERROR', 'startKg');
  const maxStart=input.exerciseSettings.find(s=>s.exerciseId===to)?.maxLoadKg;
  if(opts.startGrams!=null && maxStart!=null && opts.startGrams>maxStart*1000) throw new AppError('VALIDATION_ERROR','maxLoadKg');
  const proposedGrams = proposedKg === null ? null : kgToGrams(proposedKg);
  const userOverride = opts.startGrams !== undefined && opts.startGrams !== proposedGrams;
  const now = ctx.clock.now();
  const variantKey = planned.variantKey ?? 'default';
  const seed = `${old.id}|${to}|${variantKey}`;
  const ne: LocalSessionExercise = {
    id: uuidFromSeed(`swap|${seed}`),
    sessionId: old.sessionId,
    exerciseId: to,
    variantKey,
    orderIndex: nextOrderIndex(old),
    mode: planned.mode,
    bandMin: planned.bandMin,
    bandMax: planned.bandMax,
    targetSets: planned.sets,
    snapshot: planned,
    configuration: initialConfiguration(planned, await ctx.db.profile.get(ctx.userId), old.sessionId),
    replacedById: null,
    replacesId: old.id,
    createdAt: now,
    syncState: 'queued',
  };
  const newSets = plannedSetsFor(ctx, old.sessionId, ne, now, { deterministic: true, ...(opts.startGrams !== undefined ? { targetGrams: opts.startGrams } : {}) });
  const event = substitutionEvent(ctx, { sessionId: old.sessionId, original: old.snapshot, replacement: planned, originalSessionExerciseId: old.id, replacementSessionExerciseId: ne.id, scope, userOverride, seed });
  await trainingTransaction(ctx, async () => {
    const fresh = await ctx.db.sessionExercises.get(old.id);
    if (fresh?.replacedById) throw new AppError('INVALID_STATE', 'ALREADY_REPLACED');
    await dismissExerciseRests(ctx,old.id);
    await ctx.db.sessionExercises.put({ ...old, replacedById: ne.id });
    await ctx.db.sessionExercises.put(ne);
    // Planerade set markeras borttagna även på servern; utförda prestationer behålls.
    for (const s of await ctx.db.sets.where('sessionExerciseId').equals(old.id).toArray()) {
      if (!s.deleted && s.status !== 'done') {
        if (s.detail?.performances.some((p) => p.status === 'done')) await abortTrainingSet(ctx, s.id);
        else await mutateSet(ctx, s.id, (x) => ({ ...x, deleted: true }));
      }
    }
    for (const s of newSets) if (!(await ctx.db.sets.get(s.id))) await ctx.db.sets.add(s);
    await ctx.db.substitutionEvents.put(event);
    if (opts.familiarity) await putFamiliarity(ctx, to, opts.familiarity);
    await ctx.db.outbox.add(outbox(ctx, ne.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, ne), immutable: true }));
    for (const set of newSets) await mutateSet(ctx, set.id, (x) => x);
    await ctx.db.outbox.add(outbox(ctx, event.id, { type: 'upsert', table: 'session_exercise_substitution_events', row: substitutionEventRow(ctx.userId, event), immutable: true }));
    if (scope === 'future') await applyFutureScope(ctx, old.snapshot.substitutionFrom ?? old.exerciseId, to, planned.variantKey);
  });
  return { sessionExercise: ne, event };
}

/**
 * Byt övning i förhandsvisningen (före start). Returnerar ett nytt snapshot där ersättaren står på originalets
 * plats; originalet bevaras i `substitutions` och skrivs som revisionspost när passet startar. Byte tillbaka
 * till originalet återställer originalets föreskrift oförändrad. "Använd framöver" sparas direkt i profilen.
 */
export async function swapInPreview(ctx: AppContext, snapshot: PlanSnapshot, index: number, to: ExerciseId, opts: SwapOptions = {}): Promise<PlanSnapshot> {
  const from = snapshot.exercises[index];
  if (!from) throw new AppError('NOT_FOUND');
  const scope = opts.scope ?? 'today';
  const pending = snapshot.substitutions ?? [];
  // Tidigare byte av samma plats i förhandsvisningen: kedjan räknas från det ursprungliga planerade valet.
  const prior = pending.find((p) => p.replacementExerciseId === from.exerciseId && (p.variantKey ?? 'default') === (from.variantKey ?? 'default'));
  const rest = pending.filter((p) => p !== prior);
  const original = prior?.original ?? from;
  const root = original.substitutionFrom ?? original.exerciseId;
  if (prior && to === original.exerciseId && (opts.variantKey ?? original.variantKey ?? 'default') === (original.variantKey ?? 'default')) {
    await trainingTransaction(ctx, async () => {
      if (opts.familiarity) await putFamiliarity(ctx, to, opts.familiarity);
      if (scope === 'future') await applyFutureScope(ctx, root, to, original.variantKey);
    });
    const exercises = snapshot.exercises.map((e, i) => (i === index ? original : e));
    return { ...snapshot, exercises, substitutions: rest, estimatedMinutes: estimatedMinutesFor(exercises) };
  }
  const others = snapshot.exercises.filter((_, i) => i !== index);
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const familiarity = opts.familiarity ?? (await familiarityMap(ctx))[to];
  const res = planReplacement(input, { from, to, others, familiarity, variantKey: opts.variantKey });
  if (res.status !== 'ok' || !res.planned) throw new AppError('RULE_UNSATISFIABLE', res.status);
  if (res.requiresConfirmation && opts.startGrams === undefined) throw new AppError('VALIDATION_ERROR', 'CONFIRM_START_WEIGHT');
  if (opts.startGrams !== undefined && opts.startGrams !== null && (!Number.isInteger(opts.startGrams) || opts.startGrams < 0 || opts.startGrams > MAX_GRAMS)) throw new AppError('VALIDATION_ERROR', 'startKg');
  const maxStart=input.exerciseSettings.find(s=>s.exerciseId===to)?.maxLoadKg;
  if(opts.startGrams!=null && maxStart!=null && opts.startGrams>maxStart*1000) throw new AppError('VALIDATION_ERROR','maxLoadKg');
  const planned = res.planned;
  const proposedKg = planned.kg ?? planned.calibrationSuggestionKg ?? null;
  const proposedGrams = proposedKg === null ? null : kgToGrams(proposedKg);
  const userOverride = opts.startGrams !== undefined && opts.startGrams !== proposedGrams;
  const entry: PendingSubstitution = {
    original,
    replacementExerciseId: to,
    scope,
    userOverride,
    createdAt: ctx.clock.now(),
    ...(planned.variantKey ? { variantKey: planned.variantKey } : {}),
    ...(opts.startGrams !== undefined ? { startGrams: opts.startGrams } : {}),
  };
  await trainingTransaction(ctx, async () => {
    if (opts.familiarity) await putFamiliarity(ctx, to, opts.familiarity);
    if (scope === 'future') await applyFutureScope(ctx, root, to, planned.variantKey);
  });
  const exercises = snapshot.exercises.map((e, i) => (i === index ? planned : e));
  return { ...snapshot, exercises, substitutions: [...rest, entry], estimatedMinutes: estimatedMinutesFor(exercises) };
}

/**
 * CR §2.1 p.7/§3.3 (produktregel 'upplevd-anstrangning'): efter varje registrerat arbetsset i en kalibreringsövning
 * förifylls kvarvarande, orörda set med den faktiska vikten. "För tungt" ger ett viktsteg lättare (assistans: mer
 * assistans). Vikten höjs aldrig automatiskt inom passet. Körs i set-transaktionen; historiken ändras inte.
 */
async function continueCalibration(ctx: AppContext, se: LocalSessionExercise, saved: LocalSet): Promise<void> {
  if (!se.snapshot.calibration || saved.kind !== 'work' || saved.status !== 'done' || saved.actualGrams === null) return;
  if (saved.detail && (saved.detail.performances.some((p) => p.equipment.unit !== 'kg' || p.equipment.basis === 'independent') || new Set(saved.detail.performances.map((p) => p.comparisonKey)).size !== 1)) return;
  const lk = se.snapshot.loadKind;
  if (lk !== 'external_kg' && lk !== 'assistance_kg') return;
  const mine = (await ctx.db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s) => !s.deleted && s.kind === 'work');
  // Endast senaste utförda setet styr fortsättningen (ett äldre sets svar ändrar inte senare val).
  const later = mine.some((s) => s.id !== saved.id && s.status === 'done' && s.ordinal > saved.ordinal);
  if (later) return;
  const step = Math.round(se.snapshot.incrementKg * 1000);
  const assistance = lk === 'assistance_kg';
  let target = saved.actualGrams;
  const settings=(await ctx.db.exerciseSettings.toArray()).find(x=>x.exerciseId===se.exerciseId);
  const maximum=settings?.maxLoadGrams;
  if (saved.perceivedEffort === 'too_heavy') target = assistance ? Math.min(MAX_GRAMS, target + step) : Math.max(0, target - step);
  if(maximum!=null) target=Math.min(target,Math.floor(maximum/step)*step);
  for (const s of mine) {
    if (s.status !== 'planned' || s.detail?.plannedSides || s.detail?.performances.length || s.ordinal < saved.ordinal || s.targetGrams === target) continue;
    await mutateSet(ctx,s.id,(x)=>({...x,targetGrams:target,detail:x.detail ? {...x.detail,targetLoadValue:target/1000} : undefined}));
  }
}

/** Minsta antal kontrollerade exponeringar (pass) för nivån 'calibrated' – produktregel 'kalibrerad-niva'. */
export const CALIBRATED_MIN_EXPOSURES = 2;

/**
 * Kalibreringsnivå per övning och maskinprofil (CR §3.3): 'calibrated' efter minst två kontrollerade pass med
 * utförda arbetsset (kontrollerad teknik, inget "för tungt") utan rapporterade besvär i berörda områden.
 * Följs för övningar i kalibreringsläge, efter byte eller med sparad vana. Observationer = set-id (referenser).
 * Körs i avslutstransaktionen.
 */
async function updateCalibrationsTx(ctx: AppContext, sessionId: string): Promise<void> {
  const { db } = ctx;
  const exs = await db.sessionExercises.where('sessionId').equals(sessionId).toArray();
  const symptoms = await db.symptoms.toArray();
  const seen = new Set<string>();
  for (const e of exs) {
    const own = await db.sets.where('sessionExerciseId').equals(e.id).toArray();
    const detailed = own.some((s) => !!s.detail);
    const config = e.configuration ?? defaultConfiguration(e.exerciseId);
    const comparison = comparisonKey(e.exerciseId, config);
    const variant = detailed ? `flow:${comparison}` : e.variantKey;
    const key = `${e.exerciseId}|${variant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = calibrationId(ctx, e.exerciseId, variant);
    const cur = await db.calibrations.get(id);
    const tracked = e.snapshot.calibration || e.snapshot.loadEstimationKind !== undefined || !!cur;
    if (!tracked) continue;
    const sameExs = (await db.sessionExercises.where('exerciseId').equals(e.exerciseId).toArray()).filter((x) => detailed || x.variantKey === e.variantKey);
    const exposures = new Map<string, string[]>();
    for (const x of sameExs) {
      const session = await db.sessions.get(x.sessionId);
      if (!session || !['completed', 'partial'].includes(session.status)) continue;
      const sets = (await db.sets.where('sessionExerciseId').equals(x.id).toArray()).filter((s) => s.kind === 'work' && s.status === 'done' && !s.deleted && (detailed ? s.detail?.performances.every((p) => p.comparisonKey === comparison && p.equipment.unit === 'kg') : !s.detail));
      if (!sets.length || sets.some((s) => (s.technique ?? 'controlled') !== 'controlled' || s.perceivedEffort === 'too_heavy')) continue;
      const areas = exercise(x.exerciseId).areas;
      if (symptoms.some((s) => s.sessionId === x.sessionId && areas.includes(s.area) && s.reaction !== 'baseline')) continue;
      exposures.set(x.sessionId, [...(exposures.get(x.sessionId) ?? []), ...sets.map((s) => s.id)]);
    }
    const count = exposures.size;
    const quality: LocalCalibration['quality'] = count >= CALIBRATED_MIN_EXPOSURES ? 'calibrated' : count >= 1 ? 'calibrating' : 'none';
    const observations = [...exposures.values()].flat().slice(-40);
    if (cur && cur.quality === quality && cur.observations.length === observations.length && cur.observations.every((o, i) => o === observations[i])) continue;
    const now = ctx.clock.now();
    const row: LocalCalibration = { id, exerciseId: e.exerciseId, variantKey: variant, familiarity: cur?.familiarity ?? 'unknown', quality, observations, calibratedAt: quality === 'calibrated' ? now : null, updatedAt: now, syncState: 'queued' };
    await db.calibrations.put(row);
    await db.outbox.add(outbox(ctx, id, { type: 'upsert', table: 'user_exercise_calibrations', row: calibrationRow(ctx.userId, row) }));
  }
}

/** Räkna om kalibreringsnivåer för ett avslutat pass (används även av tester). */
export async function updateCalibrations(ctx: AppContext, sessionId: string): Promise<void> {
  await trainingTransaction(ctx, () => updateCalibrationsTx(ctx, sessionId));
}

/** S11/02 §6: frivillig symtomrapport; lagras endast med aktivt hälsosamtycke (03 §4). */
export async function reportSymptom(ctx: AppContext, r: { sessionId: string | null; area: Area; side: Side | null; reaction: SymptomReaction; pain?: number | null }): Promise<LocalSymptom> {
  if (!(await activeHealthConsent(ctx.db, ctx.userId))) throw new AppError('PRIVACY_CONSENT_REQUIRED');
  if (r.pain !== undefined && r.pain !== null && (!Number.isInteger(r.pain) || r.pain < 0 || r.pain > 10)) throw new AppError('VALIDATION_ERROR', 'pain');
  const s: LocalSymptom = { id: ctx.ids.uuid(), sessionId: r.sessionId, area: r.area, side: r.side, reaction: r.reaction, pain: r.pain ?? null, reportedAt: ctx.clock.now(), resolvedAt: null, syncState: 'queued' };
  await trainingTransaction(ctx, async () => {
    await ctx.db.symptoms.add(s);
    await ctx.db.outbox.add(outbox(ctx, s.id, { type: 'upsert', table: 'symptom_reports', row: symptomRow(ctx.userId, s) }));
  });
  return s;
}

/** Endast användarens aktiva bekräftelse häver review_required (02 §6). */
export async function resolveSymptom(ctx: AppContext, id: string): Promise<void> {
  await trainingTransaction(ctx, async () => {
    const s = await ctx.db.symptoms.get(id);
    if (!s) throw new AppError('NOT_FOUND');
    const upd = { ...s, resolvedAt: ctx.clock.now(), syncState: 'queued' as const };
    await ctx.db.symptoms.put(upd);
    await ctx.db.outbox.add(outbox(ctx, id, { type: 'upsert', table: 'symptom_reports', row: symptomRow(ctx.userId, upd) }));
  });
}

export type { ExtraOptions, Readiness };

/** New sessions snapshot execution and equipment. Unidentified machines are session-specific. */
export function initialConfiguration(p: PlannedExercise, profile: LocalProfile | undefined, sessionId: string): ExerciseConfiguration {
  const prefs = trainingPreferences(profile?.trainingPreferences);
  const c = structuredClone(p.configuration ?? prefs.exerciseDefaults[p.exerciseId] ?? defaultConfiguration(p.exerciseId, prefs.defaultStartingSide));
  if ((!c.equipment.id || c.equipment.id.startsWith('unidentified:')) && ['machine_stack', 'machine_level', 'cable_known', 'cable_unknown', 'bodyweight_assistance'].includes(c.equipment.measurement)) c.equipment.id = p.variantKey && p.variantKey !== 'default' ? `legacy:${p.variantKey}` : `unidentified:${sessionId}`;
  return c;
}

export function detailFor(s: LocalSet, se: LocalSessionExercise): SetDetail {
  const d: SetDetail = structuredClone(s.detail ?? { version: 1 as const, configuration: se.configuration ?? defaultConfiguration(se.exerciseId), performances: [], rests: [], aborted: false });
  if (s.kind === 'work' && !d.prescriptionOrigin) {
    const p = se.snapshot;
    d.prescriptionOrigin = {
      version: 1,
      source: p.engineVersion === ENGINE_VERSION ? 'engine' : 'unknown',
      role: s.ordinal > p.sets ? 'extra' : 'ordinary',
      original: { loadValue: p.targetLoadValue ?? p.kg ?? p.calibrationSuggestionKg ?? null, secondLoadValue: p.targetSecondLoadValue ?? null, reps: p.loadKind === 'duration_sec' ? null : p.reps, seconds: p.targetSeconds },
      ...(p.sideTargets ? { originalSides: Object.fromEntries(Object.entries(p.sideTargets).map(([side, t]) => [side, { loadValue: t.kg, secondLoadValue: null, reps: t.reps, seconds: null }])) } : {}),
      userEditedSides: [],
    };
  }
  return d;
}

function withDetail(s: LocalSet, d: SetDetail): LocalSet {
  const done = d.performances.filter((p) => p.status === 'done');
  const loads = done.filter((p) => p.equipment.unit === 'kg' && p.loadValue !== null).map((p) => Math.round(p.loadValue! * 1000));
  const reps = done.flatMap((p) => p.repetitions === null ? [] : [p.repetitions]);
  const seconds = done.flatMap((p) => p.seconds === null ? [] : [p.seconds]);
  // Legacy summary is conservative. All exact measurements remain in performances.
  const assistance = d.configuration.equipment.measurement === 'bodyweight_assistance';
  return { ...s, detail: d, status: detailStatus(d), actualGrams: loads.length ? (assistance ? Math.max(...loads) : Math.min(...loads)) : null,
    perceivedEffort: d.configuration.executionMode === 'bilateral' ? done[0]?.effort ?? null : null,
    actualReps: reps.length ? Math.min(...reps) : null, actualSeconds: seconds.length ? Math.min(...seconds) : null,
    rir: done.every((p) => p.rir !== null) && done.length ? Math.min(...done.map((p) => p.rir!)) : null,
    technique: done.length ? (done.some((p) => p.technique === 'poor') ? 'poor' : done.some((p) => p.technique !== 'controlled') ? 'uncertain' : 'controlled') : null,
    occurredAt: done.map((p) => p.completedAt!).sort().at(-1) ?? null };
}

async function requireActive(ctx: AppContext, s: LocalSet): Promise<void> {
  const session = await ctx.db.sessions.get(s.sessionId);
  const se = await ctx.db.sessionExercises.get(s.sessionExerciseId);
  if (!session || !['in_progress', 'paused'].includes(session.status) || s.deleted || se?.replacedById) throw new AppError('INVALID_STATE');
}

function restPerformance(s: LocalSet, p: SetPerformance): RestPerformance {
  return { comparisonKey: p.comparisonKey, side: p.side, load: p.loadValue, secondLoad: p.secondLoadValue, reps: p.repetitions, targetReps: s.detail?.plannedSides?.[p.side]?.reps ?? s.targetReps, rir: effectiveRir(p.rir, p.effort), kind: s.kind, technique: p.technique };
}

/** Close previously active timers atomically with the next observed training action. */
async function closeRests(ctx: AppContext, sessionId: string, followingSet: string, followingPerformance: string, started: boolean): Promise<void> {
  const sets = await ctx.db.sets.where('sessionId').equals(sessionId).toArray();
  for (const s of sets.filter((x) => x.detail?.rests.some((r) => r.outcome === 'active'))) {
    await mutateSet(ctx, s.id, (x) => {
      const d = structuredClone(x.detail!);
      d.rests = d.rests.map((r) => r.outcome !== 'active' ? r : { ...r, followingSetId: followingSet, followingPerformanceId: followingPerformance,
        endedAt: ctx.clock.now(), actualSeconds: started ? observedRestSeconds(r.startedAt, ctx.clock.now()) : null, outcome: started ? 'started' : 'unobserved' });
      return { ...x, detail: d };
    });
  }
}

/** Stable side IDs and an explicit side argument make rapid duplicate activation idempotent. */
export async function recordPerformance(ctx: AppContext, setId: string, side: PerformanceSide, values: SetValues & { secondLoadValue?: number | null }, options: { edit?: boolean; alternating?: boolean } = {}): Promise<LocalSet> {
  return trainingTransaction(ctx, async () => {
    const existing = await ctx.db.sets.get(setId);
    const se = existing && await ctx.db.sessionExercises.get(existing.sessionExerciseId);
    if (!existing || !se) throw new AppError('NOT_FOUND');
    if (!options.edit) await requireActive(ctx, existing);
    else if (existing.deleted) throw new AppError('INVALID_STATE');
    const d = detailFor(existing, se);
    if (!requiredSides(d.configuration).includes(side)) throw new AppError('VALIDATION_ERROR', 'side');
    const old = d.performances.find((p) => p.side === side);
    if (options.edit && old?.status !== 'done') throw new AppError('INVALID_STATE');
    if (old?.status === 'done' && !options.edit) return existing;
    const sidePlan = d.plannedSides?.[side];
    const v = { actualGrams: old?.loadValue != null ? Math.round(old.loadValue * 1000) : (sidePlan ? sidePlan.grams : existing.targetGrams), actualReps: old?.repetitions ?? sidePlan?.reps ?? existing.targetReps, actualSeconds: old?.seconds ?? sidePlan?.seconds ?? existing.targetSeconds, rir: old?.rir ?? null, technique: old?.technique ?? 'controlled', ...values };
    if (se.snapshot.loadKind === 'bodyweight_plus_kg' && v.actualGrams == null) v.actualGrams = 0;
    validateValues(se, v, true);
    const equipment = options.edit && old ? old.equipment : structuredClone(se.configuration?.equipment ?? d.configuration.equipment);
    const second = values.secondLoadValue !== undefined ? values.secondLoadValue : old?.secondLoadValue ?? (sidePlan ? sidePlan.secondLoad : d.targetSecondLoadValue ?? null);
    if (equipment.basis === 'independent' && (second === null || !Number.isFinite(second) || second < 0 || second > 500)) throw new AppError('VALIDATION_ERROR', 'secondLoadValue');
    const id = old?.id ?? uuidFromSeed(`${setId}|${side}`);
    if (!options.edit) await closeRests(ctx, existing.sessionId, setId, id, false);
    // Re-read detail: closing a between-side rest may have changed this same set.
    const current = await ctx.db.sets.get(setId);
    const updated = detailFor(current!, se);
    updated.aborted = false;
    const changedPerformance = !!old && (old.loadValue !== (v.actualGrams == null ? null : v.actualGrams / 1000) || old.repetitions !== (v.actualReps ?? null) || old.seconds !== (v.actualSeconds ?? null) || old.secondLoadValue !== second);
    if (changedPerformance && values.rir === undefined) v.rir = null;
    const effort = values.perceivedEffort !== undefined ? values.perceivedEffort : changedPerformance || (values.rir != null && values.rir > 0 && old?.effort === 'maximal') ? null : old?.effort ?? null;
    if (!validEffort(effort)) throw new AppError('VALIDATION_ERROR', 'perceivedEffort');
    const p: SetPerformance = { id, side, status: 'done', effort, repetitions: v.actualReps ?? null, loadValue: v.actualGrams == null ? null : v.actualGrams / 1000,
      secondLoadValue: second, seconds: v.actualSeconds ?? null, rir: effort === 'maximal' ? null : v.rir ?? null, technique: v.technique ?? null, startedAt: old?.startedAt ?? null,
      completedAt: options.edit && old?.completedAt ? old.completedAt : ctx.clock.now(), equipment, executionMode: d.configuration.executionMode,
      comparisonKey: options.edit && old ? old.comparisonKey : comparisonKey(se.exerciseId, { ...d.configuration, equipment }) };
    updated.performances = [...updated.performances.filter((x) => x.side !== side), p];
    if (options.alternating && d.configuration.executionMode === 'alternating' && !options.edit) {
      for (const other of requiredSides(d.configuration).filter((x) => x !== side)) if (!updated.performances.some((x) => x.side === other && x.status === 'done')) updated.performances.push({ ...p, id: uuidFromSeed(`${setId}|${other}`), side: other });
    }
    if (!options.edit) {
      const prefs = trainingPreferences((await ctx.db.profile.get(ctx.userId))?.trainingPreferences);
      const all = (await ctx.db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s) => !s.deleted);
      const secondSidePending = nextSide(updated) !== null;
      const showWarmup = prefs.showWarmupSets;
      const following = all.filter((s) => s.id !== setId && !['done', 'skipped'].includes(s.status) && !s.detail?.aborted && (s.kind === 'work' || (showWarmup && existing.kind === 'warmup')))
        .sort((a, b) => (a.kind === 'warmup' ? 0 : 1) - (b.kind === 'warmup' ? 0 : 1) || a.ordinal - b.ordinal)[0];
      const previous = all.filter((s) => s.id !== setId && s.kind === existing.kind).flatMap((s) => (s.detail?.performances ?? []).filter((x) => x.side === side && x.status === 'done').map((x) => ({ s, p: x }))).sort((a, b) => (b.p.completedAt ?? '').localeCompare(a.p.completedAt ?? ''))[0];
      const knownRir = updated.performances.filter((x) => x.status === 'done').flatMap((x) => effectiveRir(x.rir,x.effort) === null ? [] : [effectiveRir(x.rir,x.effort)!]);
      const reliableMax = se.snapshot.estimatedOneRM && comparisonKey(se.exerciseId, se.snapshot.configuration ?? defaultConfiguration(se.exerciseId)) === p.comparisonKey && ['high','medium'].includes(se.snapshot.confidence) ? se.snapshot.estimatedOneRM : null;
      const restInput: RestInput = { effort: updated.performances.some((x) => x.effort === 'maximal') ? 'maximal' : updated.performances.some((x) => x.effort === 'hard' || x.effort === 'too_heavy') ? 'hard' : null, category: exercise(se.exerciseId).timeKind, mode: se.mode, strengthFocus: se.mode === 'heavy', experience: (await ctx.db.profile.get(ctx.userId))?.experience ?? 'novice', adaptive: prefs.adaptiveRestEnabled,
        kind: existing.kind, nextKind: following?.kind ?? null, secondSidePending, betweenSidesSeconds: d.configuration.betweenSidesSeconds, relativeIntensity: reliableMax && p.loadValue !== null ? p.loadValue / reliableMax : null,
        overrideSeconds: se.configuration?.restSeconds ?? prefs.preferredRestOverrides[se.exerciseId], current: restPerformance(existing, p), effortRir: knownRir.length ? Math.min(...knownRir) : null, previous: previous && restPerformance(previous.s, previous.p) };
      const recommendation = recommendRest(restInput);
      if (recommendation.seconds > 0) updated.rests.push({ id: ctx.ids.uuid(), precedingPerformanceId: id, followingPerformanceId: null, followingSetId: secondSidePending ? setId : following?.id ?? null,
        type: secondSidePending ? 'between_sides' : existing.kind === 'warmup' ? (following?.kind === 'work' ? 'before_work' : 'warmup') : 'between_sets',
        recommendationInput: restInput, initialRecommendedSeconds: recommendation.seconds, startedAt: ctx.clock.now(), endedAt: null, recommendedSeconds: recommendation.seconds, actualSeconds: null, adjustmentSeconds: 0, reasons: recommendation.reasons, policyVersion: recommendation.version, outcome: 'active' });
    }
    const saved = await mutateSet(ctx, setId, (s) => ({ ...withDetail(s, updated), manualOverride: isOverride(s, v) }), async (saved, x) => {
      if (saved.kind === 'work' && saved.status === 'done' && updated.configuration.executionMode === 'bilateral' && equipment.unit === 'kg') await continueCalibration(ctx, x, saved);
    });
    if (options.edit) await refreshActiveRest(ctx, saved);
    return saved;
  });
}

/** Optional explicit start is the only source of measured rest. Logging remains one press. */
export async function startPerformance(ctx: AppContext, setId: string, side: PerformanceSide): Promise<void> {
  await trainingTransaction(ctx, async () => {
    const s = await ctx.db.sets.get(setId); const se = s && await ctx.db.sessionExercises.get(s.sessionExerciseId);
    if (!s || !se) throw new AppError('NOT_FOUND');
    await requireActive(ctx, s);
    const d = detailFor(s, se);
    if (!requiredSides(d.configuration).includes(side) || d.performances.some((p) => p.side === side && p.status !== 'skipped')) return;
    const id = uuidFromSeed(`${setId}|${side}`);
    await closeRests(ctx, s.sessionId, setId, id, true);
    await mutateSet(ctx, setId, (current) => {
      const next = detailFor(current, se); next.aborted = false;
      next.performances = [...next.performances.filter((p) => p.side !== side), { id, side, status: 'started', repetitions: null, loadValue: null, secondLoadValue: null, seconds: null, rir: null, technique: null, startedAt: ctx.clock.now(), completedAt: null, equipment: structuredClone(se.configuration?.equipment ?? d.configuration.equipment), executionMode: d.configuration.executionMode, comparisonKey: comparisonKey(se.exerciseId, d.configuration) }];
      return withDetail(current, next);
    });
  });
}

export async function skipPerformance(ctx: AppContext, setId: string, side: PerformanceSide): Promise<LocalSet> {
  return mutateSet(ctx, setId, (s, se) => {
    const d = detailFor(s, se); const old = d.performances.find((p) => p.side === side);
    if (!requiredSides(d.configuration).includes(side) || old?.status === 'done') throw new AppError('INVALID_STATE');
    d.performances = [...d.performances.filter((p) => p.side !== side), { id: uuidFromSeed(`${setId}|${side}`), side, status: 'skipped', repetitions: null, loadValue: null, secondLoadValue: null, seconds: null, rir: null, technique: null, startedAt: old?.startedAt ?? null, completedAt: null, equipment: structuredClone(d.configuration.equipment), executionMode: d.configuration.executionMode, comparisonKey: comparisonKey(se.exerciseId, d.configuration) }];
    d.rests = d.rests.map((r) => r.outcome === 'active' ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : r);
    return withDetail(s, d);
  });
}

/** Correct one side without discarding the other side's performance. */
export async function undoPerformance(ctx: AppContext, setId: string, side: PerformanceSide): Promise<LocalSet> {
  return mutateSet(ctx, setId, (s, se) => {
    if (s.deleted) throw new AppError('INVALID_STATE');
    const d = detailFor(s, se);
    const removed = d.performances.find((p) => p.side === side);
    d.performances = d.performances.filter((p) => p.side !== side);
    d.rests = d.rests.filter((r) => r.precedingPerformanceId !== removed?.id).map((r) => r.outcome === 'active' ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : r);
    d.aborted = false;
    return withDetail(s, d);
  });
}

export async function abortTrainingSet(ctx: AppContext, setId: string, resume = false): Promise<LocalSet> {
  return mutateSet(ctx, setId, (s, se) => {
    const d = detailFor(s, se); d.aborted = !resume;
    if (resume) d.performances = d.performances.filter((p) => p.status !== 'skipped');
    else d.rests = d.rests.map((r) => r.outcome === 'active' ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : r);
    return withDetail(s, d);
  });
}

export async function adjustRest(ctx: AppContext, setId: string, restId: string, delta: number | 'dismiss'): Promise<void> {
  await mutateSet(ctx, setId, (s) => {
    if (!s.detail) throw new AppError('NOT_FOUND');
    return { ...s, detail: { ...s.detail, rests: s.detail.rests.map((r) => r.id !== restId || r.outcome !== 'active' ? r : delta === 'dismiss' ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : { ...r, userAdjustmentSeconds: Math.max(-300,Math.min(300,(r.userAdjustmentSeconds ?? r.adjustmentSeconds)+delta)), adjustmentSeconds: Math.max(0, Math.min(300, r.recommendedSeconds + (r.userAdjustmentSeconds ?? r.adjustmentSeconds) + delta)) - r.recommendedSeconds }) } };
  });
}

export async function configureExercise(ctx: AppContext, id: string, configuration: ExerciseConfiguration, remember = true): Promise<void> {
  if (!validateConfiguration(configuration)) throw new AppError('VALIDATION_ERROR', 'configuration');
  await trainingTransaction(ctx, async () => {
    const se = await ctx.db.sessionExercises.get(id); if (!se) throw new AppError('NOT_FOUND');
    if (!supportedMeasurements(se.exerciseId).includes(configuration.equipment.measurement)) throw new AppError('VALIDATION_ERROR', 'loadMeasurement');
    if (!executionDefinition(se.exerciseId).supported.includes(configuration.executionMode)) throw new AppError('VALIDATION_ERROR', 'executionMode');
    await ctx.db.sessionExercises.put({ ...se, configuration: structuredClone(configuration), syncState: 'queued' });
    await ctx.db.outbox.add(outbox(ctx, id, { type: 'exerciseConfig', exerciseId: id, configuration }));
    // In-progress sets retain their execution mode. Unstarted sets follow the newly chosen mode.
    const changedEquipment = comparisonKey(se.exerciseId, se.configuration ?? defaultConfiguration(se.exerciseId)) !== comparisonKey(se.exerciseId, configuration);
    for (const s of await ctx.db.sets.where('sessionExerciseId').equals(id).toArray()) if (s.status === 'planned' && !s.detail?.performances.length) await mutateSet(ctx, s.id, (x) => ({ ...x,
      targetGrams: changedEquipment ? null : x.targetGrams,
      detail: { ...detailFor(x, se), configuration: structuredClone(configuration), ...(changedEquipment ? { targetLoadValue: null, targetSecondLoadValue: null, plannedSides: undefined } : {}) } }));
    if (remember) {
      const p = await ctx.db.profile.get(ctx.userId); if (!p) throw new AppError('NOT_FOUND');
      const prefs = trainingPreferences(p.trainingPreferences);
      prefs.exerciseDefaults[se.exerciseId] = structuredClone(configuration);
      const e = configuration.equipment;
      if (e.id && !e.id.startsWith('unidentified:')) prefs.equipmentProfiles = [...prefs.equipmentProfiles.filter((x) => x.id !== e.id), structuredClone(e)];
      const updated = { ...p, trainingPreferences: prefs, syncState: 'queued' as const };
      await ctx.db.profile.put(updated); await ctx.db.outbox.add(outbox(ctx, ctx.userId, { type: 'profile', patch: profileRow(updated) }));
    }
  });
}

export async function ensureWarmups(ctx: AppContext, exerciseInstanceId: string): Promise<void> {
  await trainingTransaction(ctx, async () => {
    const se = await ctx.db.sessionExercises.get(exerciseInstanceId); const profile = await ctx.db.profile.get(ctx.userId);
    if (!se) throw new AppError('NOT_FOUND');
    const prefs = trainingPreferences(profile?.trainingPreferences);
    if (!(prefs.showWarmupSets)) return;
    const sets = await ctx.db.sets.where('sessionExerciseId').equals(se.id).toArray();
    // Only rows explicitly owned by this policy may be updated. Legacy rows remain untouched.
    const warmups = sets.filter((s) => s.kind === 'warmup');
    if (warmups.length && !warmups.some((s) => s.detail?.warmupProposal)) return;
    const work = sets.filter((s) => s.kind === 'work' && !s.deleted).sort((a, b) => a.ordinal - b.ordinal)[0];
    if (!work || sets.some((s) => !s.deleted && s.kind === 'work' && (s.status === 'done' || s.status === 'partial'))) return;
    const configuration = se.configuration ?? defaultConfiguration(se.exerciseId);
    const earlier = (await ctx.db.sets.where('sessionId').equals(se.sessionId).toArray()).filter((s) => !s.deleted && s.kind === 'work' && s.status === 'done' && s.sessionExerciseId !== se.id && exercise(s.exerciseId).pattern === exercise(se.exerciseId).pattern).length;
    const input = { targetReps: work.targetReps ?? 0, mode: se.mode, category: exercise(se.exerciseId).timeKind, equipment: configuration.equipment, experience: profile?.experience ?? 'novice', samePatternWorkDone: earlier, reliableMax: ['high','medium'].includes(se.snapshot.confidence) && comparisonKey(se.exerciseId,se.snapshot.configuration??defaultConfiguration(se.exerciseId))===comparisonKey(se.exerciseId,configuration) ? se.snapshot.estimatedOneRM : null };
    const sharedLoad = work.detail?.targetLoadValue ?? (work.targetGrams === null ? null : work.targetGrams / 1000);
    const sideLoads=requiredSides(configuration).map(side=>work.detail?.plannedSides?.[side] ? (work.detail.plannedSides[side]!.grams===null?null:work.detail.plannedSides[side]!.grams!/1000):sharedLoad);
    const workingLoad=sideLoads.some(x=>x===null)?null:Math.min(...sideLoads as number[]);
    const suggestions = warmupSuggestions({ ...input, workingLoad });
    const independent = configuration.equipment.basis === 'independent';
    const secondSuggestions = independent ? warmupSuggestions({ ...input, workingLoad: work.detail?.targetSecondLoadValue ?? null }) : [];
    for (const [index, p] of suggestions.entries()) {
      const second = secondSuggestions.find((x) => x.reps === p.reps);
      if (independent && !second) continue;
      const s: LocalSet = { ...work, id: uuidFromSeed(`${se.id}|warmup|${index + 1}`), kind: 'warmup', ordinal: index + 1, status: 'planned', targetGrams: independent ? null : kgToGrams(p.load), targetReps: p.reps, actualGrams: null, actualReps: null, actualSeconds: null, occurredAt: null, serverRevision: null, createQueued: false, detail: undefined, syncState: 'local' };

      const old = warmups.find((x) => x.id === s.id);
      if (old && (!old.detail?.warmupProposal?.managed || (old.deleted && !old.detail.warmupProposal.suppressed) || old.status !== 'planned' || old.detail.performances.length)) continue;
      const proposal = { policyVersion: p.policyVersion, managed: true };
      if (old) {
        if (!old.deleted && old.targetReps === p.reps && old.detail?.targetLoadValue === p.load && (!independent || old.detail?.targetSecondLoadValue === second!.load) && old.detail.warmupProposal?.policyVersion === p.policyVersion) continue;
        await mutateSet(ctx, old.id, (x) => ({ ...x, deleted: false, targetGrams: s.targetGrams, targetReps: p.reps,
          detail: { ...x.detail!, plannedSides: undefined, targetLoadValue: p.load, targetSecondLoadValue: independent ? second!.load : null, warmupProposal: proposal } }));
      } else {
        await ctx.db.sets.add(s);
        await mutateSet(ctx, s.id, (x) => ({ ...x, detail: { ...detailFor(x, se), targetLoadValue: p.load, ...(independent ? { targetSecondLoadValue: second!.load } : {}), warmupProposal: proposal } }));
      }
    }
    for (const old of warmups) {
      if (old.ordinal <= suggestions.length || old.deleted || old.status !== 'planned' || !old.detail?.warmupProposal?.managed || old.detail.performances.length) continue;
      await mutateSet(ctx, old.id, (x) => ({ ...x, deleted: true, detail: { ...x.detail!, warmupProposal: { ...x.detail!.warmupProposal!, suppressed: true } } }));
    }
  });
}

export async function addWarmup(ctx: AppContext, exerciseInstanceId: string): Promise<LocalSet> {
  return trainingTransaction(ctx, async () => {
    const se = await ctx.db.sessionExercises.get(exerciseInstanceId); if (!se) throw new AppError('NOT_FOUND');
    const sets = await ctx.db.sets.where('sessionExerciseId').equals(se.id).toArray();
    const ordinal = Math.max(0, ...sets.filter((s) => s.kind === 'warmup').map((s) => s.ordinal)) + 1;
    if (ordinal > 20) throw new AppError('VALIDATION_ERROR', 'ordinal');
    const s = { ...plannedSetsFor(ctx, se.sessionId, { ...se, snapshot: { ...se.snapshot, sets: 1 } }, ctx.clock.now())[0], kind: 'warmup' as const, ordinal, targetGrams: null, targetReps: 5 };
    await ctx.db.sets.add(s);
    return mutateSet(ctx, s.id, (x) => ({ ...x, detail: detailFor(x, se) }));
  });
}

export async function removeWarmup(ctx: AppContext, setId: string): Promise<void> {
  await mutateSet(ctx, setId, (s) => {
    if (s.kind !== 'warmup' || s.status === 'done' || s.detail?.performances.some((p) => p.status === 'done')) throw new AppError('INVALID_STATE');
    return { ...s, deleted: true };
  });
}

/** Feedback can arrive after the timer starts; its epoch and manual adjustment survive. */
async function refreshActiveRest(ctx:AppContext,saved:LocalSet) {
  if(!saved.detail?.rests.some((r)=>r.outcome==='active' && r.recommendationInput)) return;
  await mutateSet(ctx,saved.id,(s)=>{
    const d=structuredClone(s.detail!);
    const performed=d.performances.filter((p)=>p.status==='done');
    const effort: PerceivedEffort | null=performed.some((p)=>p.effort==='maximal') ? 'maximal' : performed.some((p)=>p.effort==='hard'||p.effort==='too_heavy') ? 'hard' : null;
    const known=performed.flatMap((p)=>effectiveRir(p.rir,p.effort)===null?[]:[effectiveRir(p.rir,p.effort)!]);
    d.rests=d.rests.map((r)=>{
      if(r.outcome!=='active' || !r.recommendationInput) return r;
      const p=performed.find((x)=>x.id===r.precedingPerformanceId); if(!p) return r;
      const prior=r.recommendationInput;
      const max=prior.relativeIntensity && prior.current?.load ? prior.current.load/prior.relativeIntensity : null;
      const input={...prior,relativeIntensity:max && p.loadValue!==null ? p.loadValue/max:null,effort,effortRir:known.length?Math.min(...known):null,current:restPerformance(s,p)};
      const next=recommendRest(input);
      if(next.seconds===r.recommendedSeconds && JSON.stringify(next.reasons)===JSON.stringify(r.reasons)) return r;
      const manual=r.userAdjustmentSeconds ?? r.adjustmentSeconds;
      return {...r,initialRecommendedSeconds:r.initialRecommendedSeconds??r.recommendedSeconds,recommendationInput:input,recommendedSeconds:next.seconds,reasons:next.reasons,policyVersion:next.version,userAdjustmentSeconds:manual,
        adjustmentSeconds:Math.max(0,Math.min(300,next.seconds+manual))-next.seconds,
        recommendationUpdates:[...(r.recommendationUpdates??[]).slice(-9),{at:ctx.clock.now(),seconds:next.seconds,reasons:next.reasons}]};
    });
    return {...s,detail:d};
  });
}
