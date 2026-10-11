/**
 * TrainingService: pass-tillståndsmaskin och setloggning (01 §3.1, 03 §5.1, 09).
 * Varje användarhandling = en lokal IndexedDB-transaktion som skriver post + köpost atomärt.
 * UI får "sparat" ENDAST när transaktionen har commitats.
 */
import type { Mode } from '../domain/decision_engine';
import { heavyPairAllowed } from '../domain/heavyPair';
import type { ExerciseId } from '../domain/catalog';
import { exercise } from '../domain/catalog';
import { RULESET_VERSION, type ChoiceScope, type Familiarity, type PendingSubstitution, type PerceivedEffort, type PlanSnapshot, type PlannedExercise, type Readiness, type SessionStatus, type Side, type SymptomReaction, type Technique } from '../domain/model';
import { kgToGrams, MAX_GRAMS } from '../domain/units';
import { uuidFromSeed } from '../domain/hash';
import { SUBSTITUTION_CATALOG_VERSION } from '../domain/substitutionCatalog';
import { canCountAsPlanned, estimatedMinutesFor, planExtra, planRegular, planReplacement, substitutionCandidates, type ExtraOptions, type ReplacementResult } from '../planner/planner';
import { prescribe } from '../domain/prescription';
import { gateFor, activeSymptoms, pastWork } from '../planner/history';
import type { Area } from '../domain/catalog';
import { LocalSaveError, type LocalCalibration, type LocalProfile, type LocalSession, type LocalSessionExercise, type LocalSet, type LocalSubstitutionEvent, type LocalSymptom } from '../storage/db';
import { auditRow, calibrationRow, profileRow, programRow, sessionExerciseRow, sessionRow, setCreatePayload, setPatchPayload, substitutionEventRow, symptomRow } from '../server/mapping';
import { AppError, outbox, type AppContext } from './context';
import { activeHealthConsent, buildPlannerInput } from './plannerInput';

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

async function tx<T>(ctx: AppContext, fn: () => Promise<T>): Promise<T> {
  const { db } = ctx;
  try {
    const r = await db.transaction('rw', [db.sets, db.outbox, db.sessions, db.sessionExercises, db.audits, db.programs, db.symptoms, db.calibrations, db.substitutionEvents, db.profile], fn);
    ctx.onQueued?.();
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
function plannedSetsFor(ctx: AppContext, sessionId: string, se: LocalSessionExercise, now: string, opts: { deterministic?: boolean; targetGrams?: number | null } = {}): LocalSet[] {
  const p = se.snapshot;
  const startKg = p.kg ?? p.calibrationSuggestionKg ?? null;
  const target = opts.targetGrams !== undefined ? opts.targetGrams : startKg === null ? null : kgToGrams(startKg);
  return Array.from({ length: p.sets }, (_, i) => ({
    id: opts.deterministic ? uuidFromSeed(`${se.id}|set|${i + 1}|work`) : ctx.ids.uuid(),
    sessionId,
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    ordinal: i + 1,
    kind: 'work' as const,
    status: 'planned' as const,
    targetGrams: target,
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
export async function startSession(ctx: AppContext, snapshot: PlanSnapshot): Promise<LocalSession> {
  if (!snapshot.exercises.length) throw new AppError('RULE_UNSATISFIABLE');
  if (await activeSession(ctx)) throw new AppError('INVALID_STATE', 'active_session_exists');
  const now = ctx.clock.now();
  const program = (await ctx.db.programs.where('active').equals(1).toArray())[0];
  const profile = await ctx.db.profile.get(ctx.userId);
  const session: LocalSession = {
    id: ctx.ids.uuid(),
    programId: snapshot.kind === 'planned' ? (program?.id ?? null) : null,
    kind: snapshot.kind === 'extra' ? 'extra' : 'planned',
    status: 'in_progress',
    timezone: profile?.timezone ?? 'Europe/Stockholm',
    startedAt: now,
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
  await tx(ctx, async () => {
    await ctx.db.sessions.add(session);
    await ctx.db.sessionExercises.bulkAdd(exs);
    await ctx.db.sets.bulkAdd(sets);
    await ctx.db.audits.add(audit);
    await ctx.db.outbox.add(outbox(ctx, session.id, { type: 'upsert', table: 'training_sessions', row: sessionRow(ctx.userId, session) }));
    for (const e of exs) await ctx.db.outbox.add(outbox(ctx, e.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, e), immutable: true }));
    await ctx.db.outbox.add(outbox(ctx, audit.id, { type: 'upsert', table: 'recommendation_audits', row: auditRow(ctx.userId, audit), immutable: true }));
    for (const ev of events) {
      await ctx.db.substitutionEvents.put(ev);
      await ctx.db.outbox.add(outbox(ctx, ev.id, { type: 'upsert', table: 'session_exercise_substitution_events', row: substitutionEventRow(ctx.userId, ev), immutable: true }));
    }
  });
  return session;
}

export type SetValues = { actualGrams?: number | null; actualReps?: number | null; actualSeconds?: number | null; rir?: number | null; technique?: Technique | null; perceivedEffort?: PerceivedEffort | null };

function validateValues(se: LocalSessionExercise, v: SetValues, done: boolean): void {
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
async function mutateSet(ctx: AppContext, setId: string, change: (s: LocalSet, se: LocalSessionExercise) => LocalSet, post?: (saved: LocalSet, se: LocalSessionExercise) => Promise<void>): Promise<LocalSet> {
  let result!: LocalSet;
  await tx(ctx, async () => {
    const before = await ctx.db.sets.get(setId);
    if (!before) throw new AppError('NOT_FOUND');
    const session = await ctx.db.sessions.get(before.sessionId);
    if (!session) throw new AppError('NOT_FOUND');
    const se = await ctx.db.sessionExercises.get(before.sessionExerciseId);
    if (!se) throw new AppError('NOT_FOUND');
    const after = { ...change(before, se), updatedAt: ctx.clock.now() };
    const touched = after.status !== 'planned' || before.createQueued;
    if (!touched) {
      await ctx.db.sets.put({ ...after, syncState: 'local' });
      result = { ...after, syncState: 'local' };
      return;
    }
    if (!before.createQueued) {
      after.createQueued = true;
      await ctx.db.outbox.add(outbox(ctx, setId, { type: 'set', setId, create: true, payload: setCreatePayload(after) }));
    } else {
      const patch = setPatchPayload(before, after);
      if (Object.keys(patch).length) await ctx.db.outbox.add(outbox(ctx, setId, { type: 'set', setId, create: false, payload: patch }));
    }
    after.syncState = before.syncState === 'conflict' ? 'conflict' : 'queued';
    await ctx.db.sets.put(after);
    result = after;
    if (post) await post(after, se);
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
  const v: SetValues = {
    actualGrams: values.actualGrams !== undefined ? values.actualGrams : existing.targetGrams,
    actualReps: values.actualReps !== undefined ? values.actualReps : existing.targetReps,
    actualSeconds: values.actualSeconds !== undefined ? values.actualSeconds : existing.targetSeconds,
    rir: values.rir ?? null,
    technique: values.technique ?? 'controlled',
  };
  if (se.snapshot.loadKind === 'bodyweight_plus_kg' && v.actualGrams == null) v.actualGrams = 0;
  validateValues(se, v, true);
  const effort = values.perceivedEffort ? { perceivedEffort: values.perceivedEffort } : {};
  return mutateSet(ctx, setId, (s) => ({ ...s, ...effort, status: 'done', actualGrams: v.actualGrams ?? null, actualReps: v.actualReps ?? null, actualSeconds: v.actualSeconds ?? null, rir: v.rir ?? null, technique: v.technique ?? null, occurredAt: ctx.clock.now(), manualOverride: isOverride(s, v) }), (saved, x) => continueCalibration(ctx, x, saved));
}

/**
 * CR §3.3: enkelt svar efter ett kalibreringsset (lätt / lagom / för tungt). Sparas på setet och styr
 * fortsättningen i passet; inga slutsatser om ledstatus dras av svaret.
 */
export async function rateSet(ctx: AppContext, setId: string, effort: PerceivedEffort | null): Promise<LocalSet> {
  if (effort !== null && !['easy', 'ok', 'too_heavy'].includes(effort)) throw new AppError('VALIDATION_ERROR', 'perceivedEffort');
  const existing = await ctx.db.sets.get(setId);
  if (!existing) throw new AppError('NOT_FOUND');
  if (existing.status !== 'done') throw new AppError('INVALID_STATE');
  return mutateSet(ctx, setId, (s) => ({ ...s, perceivedEffort: effort }), (saved, x) => continueCalibration(ctx, x, saved));
}

/** "Ändra set": redigera ett redan utfört set. */
export async function editSet(ctx: AppContext, setId: string, values: SetValues): Promise<LocalSet> {
  const existing = await ctx.db.sets.get(setId);
  if (!existing) throw new AppError('NOT_FOUND');
  const se = await ctx.db.sessionExercises.get(existing.sessionExerciseId);
  if (!se) throw new AppError('NOT_FOUND');
  const merged: SetValues = { actualGrams: existing.actualGrams, actualReps: existing.actualReps, actualSeconds: existing.actualSeconds, rir: existing.rir, technique: existing.technique, ...values };
  validateValues(se, merged, existing.status === 'done');
  return mutateSet(ctx, setId, (s) => ({ ...s, actualGrams: merged.actualGrams ?? null, actualReps: merged.actualReps ?? null, actualSeconds: merged.actualSeconds ?? null, rir: merged.rir ?? null, technique: merged.technique ?? null, manualOverride: isOverride(s, merged) }));
}

/** "Ångra": utfört set → planerat igen, historiken förblir korrekt (acceptanstest 37). */
export async function undoSet(ctx: AppContext, setId: string): Promise<LocalSet> {
  return mutateSet(ctx, setId, (s) => ({ ...s, status: 'planned', actualGrams: null, actualReps: null, actualSeconds: null, rir: null, technique: null, occurredAt: null, manualOverride: false }));
}

export async function skipSet(ctx: AppContext, setId: string): Promise<LocalSet> {
  return mutateSet(ctx, setId, (s) => ({ ...s, status: 'skipped', occurredAt: null }));
}

/** Lägg till ett set (kopia av senaste setets mål). Ordinal max 20 (DB). */
export async function addSet(ctx: AppContext, sessionExerciseId: string): Promise<LocalSet> {
  const se = await ctx.db.sessionExercises.get(sessionExerciseId);
  if (!se) throw new AppError('NOT_FOUND');
  const sets = await ctx.db.sets.where('sessionExerciseId').equals(sessionExerciseId).toArray();
  const ordinal = Math.max(0, ...sets.map((s) => s.ordinal)) + 1;
  if (ordinal > 20) throw new AppError('VALIDATION_ERROR', 'ordinal');
  const last = sets.sort((a, b) => b.ordinal - a.ordinal)[0];
  const now = ctx.clock.now();
  const s: LocalSet = { ...plannedSetsFor(ctx, se.sessionId, { ...se, snapshot: { ...se.snapshot, sets: 1 } }, now)[0], ordinal, targetGrams: last?.targetGrams ?? null, targetReps: last?.targetReps ?? null, targetSeconds: last?.targetSeconds ?? null };
  await tx(ctx, async () => {
    await ctx.db.sets.add(s);
  });
  return s;
}

async function setStatus(ctx: AppContext, sessionId: string, to: SessionStatus, extra: Partial<LocalSession> = {}): Promise<LocalSession> {
  let out!: LocalSession;
  await tx(ctx, async () => {
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
  await tx(ctx, async () => {
    const s = await ctx.db.sessions.get(sessionId);
    if (!s) throw new AppError('NOT_FOUND');
    const sets = (await ctx.db.sets.where('sessionId').equals(sessionId).toArray()).filter((x) => !x.deleted && x.kind === 'work');
    const exs = await ctx.db.sessionExercises.where('sessionId').equals(sessionId).toArray();
    const activeEx = exs.filter((e) => !e.replacedById);
    const plannedWork = activeEx.reduce((n, e) => n + e.snapshot.sets, 0);
    const doneWork = sets.filter((x) => x.status === 'done').length;
    const status = opts.status === 'abandoned' ? 'abandoned' : opts.status ?? (doneWork >= plannedWork ? 'completed' : 'partial');
    if (!canTransition(s.status, status)) throw new AppError('INVALID_STATE', `${s.status}->${status}`);
    if (status === 'abandoned' && opts.keepLoggedSets === false) {
      for (const set of sets.filter((x) => x.status === 'done')) {
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
  await tx(ctx, async () => {
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
  if (input.restrictions.some((r) => r.active && r.kind === 'block_exercise' && (r.exerciseA === to || (!r.exerciseA && r.area && exercise(to).areas.includes(r.area))))) throw new AppError('RULE_UNSATISFIABLE', 'USER_BLOCK_EXERCISE');
  const history = pastWork(input.history, input.nowUtc);
  const active = activeSymptoms(input.symptoms, history);
  const gate = gateFor(to, history, active, input.nowUtc);
  if (gate.impactedRegion && ['persistent', 'limping', 'swelling'].includes(gate.relevantSymptoms)) throw new AppError('RULE_UNSATISFIABLE', 'SYMPTOM_REVIEW_REQUIRED');
  let mode: Mode = opts.mode ?? old.mode;
  if (mode === 'heavy' && gate.groupHours !== null && gate.groupHours < 48) mode = 'light';
  const sets = old.snapshot.sets;
  const settings = input.exerciseSettings.find((s) => s.exerciseId === to) ?? null;
  const p: PlannedExercise = prescribe({ exerciseId: to, mode, sets, role: old.snapshot.role, experience: settings?.experience ?? input.profile.experience, settings, history: history.filter((h) => h.exerciseId === to), gate, bodyweightKg: input.profile.bodyweightKg });
  const now = ctx.clock.now();
  // Parregel får inte brytas genom byte under passet.
  const siblings = (await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray()).filter((e) => !e.replacedById && e.id !== old.id);
  for (const r of input.restrictions.filter((r) => r.active && r.kind === 'block_pair_heavy' && r.exerciseA && r.exerciseB)) {
    const list = [...siblings.map((e) => ({ exerciseId: e.exerciseId, mode: e.mode, sets: e.targetSets, plannedKg: e.snapshot.kg, estimatedOneRM: e.snapshot.estimatedOneRM })), { exerciseId: to, mode: p.mode, sets: p.sets, plannedKg: p.kg, estimatedOneRM: p.estimatedOneRM }];
    if (!heavyPairAllowed(list, r.exerciseA!, r.exerciseB!)) throw new AppError('RULE_UNSATISFIABLE', 'PAIR_RULE');
  }
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
    replacedById: null,
    createdAt: now,
    syncState: 'queued',
  };
  const newSets = plannedSetsFor(ctx, old.sessionId, ne, now);
  await tx(ctx, async () => {
    await ctx.db.sessionExercises.put({ ...old, replacedById: ne.id });
    await ctx.db.sessionExercises.add(ne);
    // Oanvända planerade set i gamla övningen tas bort lokalt (de har aldrig synkats).
    const oldSets = await ctx.db.sets.where('sessionExerciseId').equals(old.id).toArray();
    for (const s of oldSets) if (s.status === 'planned' && !s.createQueued) await ctx.db.sets.delete(s.id);
    await ctx.db.sets.bulkAdd(newSets);
    await ctx.db.outbox.add(outbox(ctx, ne.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, ne), immutable: true }));
  });
  return ne;
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
  await tx(ctx, () => putFamiliarity(ctx, exerciseId, familiarity));
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
  if (!session || !['in_progress', 'paused'].includes(session.status)) throw new AppError('INVALID_STATE');
  const scope = opts.scope ?? 'today';
  const all = await ctx.db.sessionExercises.where('sessionId').equals(old.sessionId).toArray();
  const others = displayOrder(all).filter((e) => e.id !== old.id).map((e) => e.snapshot);
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const familiarity = opts.familiarity ?? (await familiarityMap(ctx))[to];
  const res = planReplacement(input, { from: old.snapshot, to, others, familiarity, variantKey: opts.variantKey, replacesSessionExerciseId: old.id });
  if (res.status !== 'ok' || !res.planned) throw new AppError('RULE_UNSATISFIABLE', res.status);
  const planned = res.planned;
  const proposedKg = planned.kg ?? planned.calibrationSuggestionKg ?? null;
  if (res.requiresConfirmation && opts.startGrams === undefined) throw new AppError('VALIDATION_ERROR', 'CONFIRM_START_WEIGHT');
  if (opts.startGrams !== undefined && opts.startGrams !== null && (!Number.isInteger(opts.startGrams) || opts.startGrams < 0 || opts.startGrams > MAX_GRAMS)) throw new AppError('VALIDATION_ERROR', 'startKg');
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
    replacedById: null,
    replacesId: old.id,
    createdAt: now,
    syncState: 'queued',
  };
  const newSets = plannedSetsFor(ctx, old.sessionId, ne, now, { deterministic: true, ...(opts.startGrams !== undefined ? { targetGrams: opts.startGrams } : {}) });
  const event = substitutionEvent(ctx, { sessionId: old.sessionId, original: old.snapshot, replacement: planned, originalSessionExerciseId: old.id, replacementSessionExerciseId: ne.id, scope, userOverride, seed });
  await tx(ctx, async () => {
    const fresh = await ctx.db.sessionExercises.get(old.id);
    if (fresh?.replacedById) throw new AppError('INVALID_STATE', 'ALREADY_REPLACED');
    await ctx.db.sessionExercises.put({ ...old, replacedById: ne.id });
    await ctx.db.sessionExercises.put(ne);
    // Oanvända planerade set i den gamla övningen tas bort lokalt (de har aldrig synkats); utförda set behålls.
    for (const s of await ctx.db.sets.where('sessionExerciseId').equals(old.id).toArray()) if (s.status === 'planned' && !s.createQueued) await ctx.db.sets.delete(s.id);
    for (const s of newSets) if (!(await ctx.db.sets.get(s.id))) await ctx.db.sets.add(s);
    await ctx.db.substitutionEvents.put(event);
    if (opts.familiarity) await putFamiliarity(ctx, to, opts.familiarity);
    await ctx.db.outbox.add(outbox(ctx, ne.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, ne), immutable: true }));
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
    await tx(ctx, async () => {
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
  await tx(ctx, async () => {
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
  const lk = se.snapshot.loadKind;
  if (lk !== 'external_kg' && lk !== 'assistance_kg') return;
  const mine = (await ctx.db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s) => !s.deleted && s.kind === 'work');
  // Endast senaste utförda setet styr fortsättningen (ett äldre sets svar ändrar inte senare val).
  const later = mine.some((s) => s.id !== saved.id && s.status === 'done' && s.ordinal > saved.ordinal);
  if (later) return;
  const step = Math.round(se.snapshot.incrementKg * 1000);
  const assistance = lk === 'assistance_kg';
  let target = saved.actualGrams;
  if (saved.perceivedEffort === 'too_heavy') target = assistance ? Math.min(MAX_GRAMS, target + step) : Math.max(0, target - step);
  for (const s of mine) {
    if (s.status !== 'planned' || s.createQueued || s.ordinal < saved.ordinal || s.targetGrams === target) continue;
    await ctx.db.sets.put({ ...s, targetGrams: target, updatedAt: ctx.clock.now() });
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
    const key = `${e.exerciseId}|${e.variantKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = calibrationId(ctx, e.exerciseId, e.variantKey);
    const cur = await db.calibrations.get(id);
    const tracked = e.snapshot.calibration || e.snapshot.loadEstimationKind !== undefined || !!cur;
    if (!tracked || cur?.quality === 'calibrated') continue;
    const sameExs = (await db.sessionExercises.where('exerciseId').equals(e.exerciseId).toArray()).filter((x) => x.variantKey === e.variantKey);
    const exposures = new Map<string, string[]>();
    for (const x of sameExs) {
      const session = await db.sessions.get(x.sessionId);
      if (!session || !['completed', 'partial'].includes(session.status)) continue;
      const sets = (await db.sets.where('sessionExerciseId').equals(x.id).toArray()).filter((s) => s.kind === 'work' && s.status === 'done' && !s.deleted);
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
    const row: LocalCalibration = { id, exerciseId: e.exerciseId, variantKey: e.variantKey, familiarity: cur?.familiarity ?? 'unknown', quality, observations, calibratedAt: quality === 'calibrated' ? now : null, updatedAt: now, syncState: 'queued' };
    await db.calibrations.put(row);
    await db.outbox.add(outbox(ctx, id, { type: 'upsert', table: 'user_exercise_calibrations', row: calibrationRow(ctx.userId, row) }));
  }
}

/** Räkna om kalibreringsnivåer för ett avslutat pass (används även av tester). */
export async function updateCalibrations(ctx: AppContext, sessionId: string): Promise<void> {
  await tx(ctx, () => updateCalibrationsTx(ctx, sessionId));
}

/** S11/02 §6: frivillig symtomrapport; lagras endast med aktivt hälsosamtycke (03 §4). */
export async function reportSymptom(ctx: AppContext, r: { sessionId: string | null; area: Area; side: Side | null; reaction: SymptomReaction; pain?: number | null }): Promise<LocalSymptom> {
  if (!(await activeHealthConsent(ctx.db, ctx.userId))) throw new AppError('PRIVACY_CONSENT_REQUIRED');
  if (r.pain !== undefined && r.pain !== null && (!Number.isInteger(r.pain) || r.pain < 0 || r.pain > 10)) throw new AppError('VALIDATION_ERROR', 'pain');
  const s: LocalSymptom = { id: ctx.ids.uuid(), sessionId: r.sessionId, area: r.area, side: r.side, reaction: r.reaction, pain: r.pain ?? null, reportedAt: ctx.clock.now(), resolvedAt: null, syncState: 'queued' };
  await tx(ctx, async () => {
    await ctx.db.symptoms.add(s);
    await ctx.db.outbox.add(outbox(ctx, s.id, { type: 'upsert', table: 'symptom_reports', row: symptomRow(ctx.userId, s) }));
  });
  return s;
}

/** Endast användarens aktiva bekräftelse häver review_required (02 §6). */
export async function resolveSymptom(ctx: AppContext, id: string): Promise<void> {
  await tx(ctx, async () => {
    const s = await ctx.db.symptoms.get(id);
    if (!s) throw new AppError('NOT_FOUND');
    const upd = { ...s, resolvedAt: ctx.clock.now(), syncState: 'queued' as const };
    await ctx.db.symptoms.put(upd);
    await ctx.db.outbox.add(outbox(ctx, id, { type: 'upsert', table: 'symptom_reports', row: symptomRow(ctx.userId, upd) }));
  });
}

export type { ExtraOptions, Readiness };
