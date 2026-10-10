/**
 * TrainingService: pass-tillståndsmaskin och setloggning (01 §3.1, 03 §5.1, 09).
 * Varje användarhandling = en lokal IndexedDB-transaktion som skriver post + köpost atomärt.
 * UI får "sparat" ENDAST när transaktionen har commitats.
 */
import { validateHeavyPair, type ExerciseId, type Mode } from '../domain/decision_engine';
import { exercise } from '../domain/catalog';
import type { PlanSnapshot, PlannedExercise, Readiness, SessionStatus, Side, SymptomReaction, Technique } from '../domain/model';
import { kgToGrams, MAX_GRAMS } from '../domain/units';
import { canCountAsPlanned, planExtra, planRegular, type ExtraOptions } from '../planner/planner';
import { prescribe } from '../domain/prescription';
import { gateFor, activeSymptoms, pastWork } from '../planner/history';
import type { Area } from '../domain/catalog';
import { LocalSaveError, type LocalSession, type LocalSessionExercise, type LocalSet, type LocalSymptom } from '../storage/db';
import { auditRow, programRow, sessionExerciseRow, sessionRow, setCreatePayload, setPatchPayload, symptomRow } from '../server/mapping';
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
    const r = await db.transaction('rw', [db.sets, db.outbox, db.sessions, db.sessionExercises, db.audits, db.programs, db.symptoms], fn);
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

function plannedSetsFor(ctx: AppContext, sessionId: string, se: LocalSessionExercise, now: string): LocalSet[] {
  const p = se.snapshot;
  return Array.from({ length: p.sets }, (_, i) => ({
    id: ctx.ids.uuid(),
    sessionId,
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    ordinal: i + 1,
    kind: 'work' as const,
    status: 'planned' as const,
    targetGrams: p.kg === null ? null : kgToGrams(p.kg),
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
    variantKey: 'default',
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
  const sets = exs.flatMap((e) => plannedSetsFor(ctx, session.id, e, now));
  const audit = { id: ctx.ids.uuid(), sessionId: session.id, engineVersion: snapshot.engineVersion, inputsHash: snapshot.inputsHash, reasonCodes: [...new Set([...snapshot.reasons, ...snapshot.exercises.flatMap((e) => e.reasons)])], snapshot, generatedAt: snapshot.generatedAtUtc, syncState: 'queued' as const };
  await tx(ctx, async () => {
    await ctx.db.sessions.add(session);
    await ctx.db.sessionExercises.bulkAdd(exs);
    await ctx.db.sets.bulkAdd(sets);
    await ctx.db.audits.add(audit);
    await ctx.db.outbox.add(outbox(ctx, session.id, { type: 'upsert', table: 'training_sessions', row: sessionRow(ctx.userId, session) }));
    for (const e of exs) await ctx.db.outbox.add(outbox(ctx, e.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, e), immutable: true }));
    await ctx.db.outbox.add(outbox(ctx, audit.id, { type: 'upsert', table: 'recommendation_audits', row: auditRow(ctx.userId, audit), immutable: true }));
  });
  return session;
}

export type SetValues = { actualGrams?: number | null; actualReps?: number | null; actualSeconds?: number | null; rir?: number | null; technique?: Technique | null };

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

/** Gemensam väg: ändra set lokalt + köa create/patch i SAMMA transaktion. */
async function mutateSet(ctx: AppContext, setId: string, change: (s: LocalSet, se: LocalSessionExercise) => LocalSet): Promise<LocalSet> {
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
  return mutateSet(ctx, setId, (s) => ({ ...s, status: 'done', actualGrams: v.actualGrams ?? null, actualReps: v.actualReps ?? null, actualSeconds: v.actualSeconds ?? null, rir: v.rir ?? null, technique: v.technique ?? null, occurredAt: ctx.clock.now(), manualOverride: isOverride(s, v) }));
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
 * S09: byt övning under passet. Ny föreskrift beräknas av motorn (separat historik/e1RM);
 * tidigare loggade set i den gamla övningen behålls oförändrade.
 */
export async function swapExercise(ctx: AppContext, sessionExerciseId: string, to: ExerciseId, opts: { mode?: Mode } = {}): Promise<LocalSessionExercise> {
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
    if (!validateHeavyPair(list, r.exerciseA!, r.exerciseB!)) throw new AppError('RULE_UNSATISFIABLE', 'PAIR_RULE');
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
