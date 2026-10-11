/**
 * ÄA-PLAN-001 "Min träningsplan": levande framtidsplan, planrevisioner, träningsdagbok och anteckningar.
 *
 * Inga nya träningsregler: framtidssekvensen tas fram genom att anropa den befintliga, deterministiska planeraren
 * (`planRegular`) för kommande rotationsplatser. Endast struktur sparas (övning, nivå, set, repetitionsintervall,
 * tid) – aldrig framtida vikter. Nästa pass rekommenderas alltid live av befintlig `previewNext` (samma som Idag).
 * Genomförda pass och set läses ur befintliga tabeller och ändras aldrig härifrån.
 */
import type { ExerciseId, LoadDisplayBasis, LoadKind } from '../domain/catalog';
import { CATALOG_VERSION } from '../domain/catalog';
import { ENGINE_VERSION, type Mode } from '../domain/decision_engine';
import { hashOf, uuidFromSeed } from '../domain/hash';
import { PLANNER_VERSION, RULESET_VERSION, type PlanStatus, type PlannerInput, type Role, type WarningCode } from '../domain/model';
import { SUBSTITUTION_CATALOG_VERSION } from '../domain/substitutionCatalog';
import { planRegular, TEMPLATE_VERSION } from '../planner/planner';
import type { LocalNote, LocalPlanRevision, LocalSession, LocalSessionExercise, LocalSet } from '../storage/db';
import { noteRow, planRevisionRow } from '../server/mapping';
import { AppError, outbox, type AppContext } from './context';
import { buildPlannerInput } from './plannerInput';

/** Standardhorisont och val (§3.3). Lagrad horisont per revision; längre visning beräknas utan ny revision. */
export const PLAN_HORIZONS = [12, 36, 72] as const;
export const DEFAULT_HORIZON = 36;
export const STORED_HORIZON = 72;
/** Pass 2–3 i sekvensen visas som "preliminära" (§4 p.2); övriga strukturella (§4 p.3). */
const PROVISIONAL_SLOTS = 2;
/**
 * Visningsantagande för strukturell plan (inte en träningsregel): varje framtida plats beräknas som om normal vila
 * (3 dygn efter senaste utförda pass) föregår den. Påverkar aldrig nästa pass, som alltid beräknas vid passtillfället.
 */
const STRUCTURAL_REST_HOURS = 72;
export const NOTE_MAX_LENGTH = 2000;

export type SlotStatus = 'ready' | 'provisional' | 'structural';

export type PlanSlotExercise = {
  exerciseId: ExerciseId;
  variantKey: string;
  role: Role;
  mode: Mode;
  sets: number;
  reps: number;
  bandMin: number;
  bandMax: number;
  loadKind: LoadKind;
  loadBasis: LoadDisplayBasis | null;
  /** Kalibreringsläge: ingen vikt finns att beräkna ännu (§4 p.1, PL04). */
  calibration: boolean;
  substitutionFrom: ExerciseId | null;
};

export type PlanSlot = {
  slotSequence: number;
  plannedSlotId: string;
  programId: string | null;
  rotationIndex: number;
  templateKey: string | null;
  /** "Ungefär vecka X" räknat från nu; inget datum, aldrig "missat" (PL17). */
  approxWeek: number;
  estimatedMinutes: number;
  status: SlotStatus;
  planStatus: PlanStatus;
  exercises: PlanSlotExercise[];
  removed: Array<{ exerciseId: ExerciseId; reason: string }>;
  warnings: WarningCode[];
};

export const slotId = (userId: string, sequence: number) => uuidFromSeed(`slot|${userId}|${sequence}`);
export const noteIdFor = (userId: string, t: { targetType: 'slot'; slotSequence: number } | { targetType: 'session'; sessionId: string }) =>
  uuidFromSeed(t.targetType === 'slot' ? `note|${userId}|slot|${t.slotSequence}` : `note|${userId}|session|${t.sessionId}`);

const FINISHED = new Set(['completed', 'partial', 'abandoned']);

/**
 * Löpande ordinarie passnummer (stabil passplats över planrevisioner och programversioner). Ett ordinarie pass räknas
 * när det flyttade rotationen: första avslutade (genomfört/delvis) pass med utfört arbetsset per programplats, samt
 * spontanpass som användaren uttryckligen räknat som ordinarie. Spontanpass i övrigt får inget nummer (§5.4).
 */
export async function ordinarySequence(ctx: AppContext): Promise<Map<string, number>> {
  const { db } = ctx;
  const sessions = (await db.sessions.toArray()).filter((s) => FINISHED.has(s.status));
  const doneBySession = new Set((await db.sets.toArray()).filter((x) => x.status === 'done' && !x.deleted && x.kind === 'work').map((x) => x.sessionId));
  const seen = new Set<string>();
  const counted: Array<{ id: string; at: string }> = [];
  const byFinish = [...sessions].sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? '') || a.id.localeCompare(b.id));
  for (const s of byFinish) {
    if (s.kind === 'planned' && (s.status === 'completed' || s.status === 'partial') && doneBySession.has(s.id)) {
      const key = `${s.programId}|${s.rotationIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counted.push({ id: s.id, at: s.finishedAt ?? '' });
    } else if (s.kind === 'extra' && s.countsAsPlannedAt) {
      counted.push({ id: s.id, at: s.countsAsPlannedAt });
    }
  }
  counted.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return new Map(counted.map((c, i) => [c.id, i + 1]));
}

type PlanInputs = { input: PlannerInput; programId: string | null; rotationIndex: number; frequency: number; baseSequence: number; parts: Record<string, string>; inputsHash: string };

/** Konsekvent indata för framtidsplanen. Pågående pass ingår inte (deras accepterade plan ändras aldrig tyst, PL25). */
async function planInputs(ctx: AppContext): Promise<PlanInputs> {
  const { db, userId } = ctx;
  const program = (await db.programs.where('active').equals(1).toArray())[0];
  const raw = await buildPlannerInput(db, userId, ctx.clock.now());
  const history = raw.history.filter((h) => FINISHED.has(h.sessionStatus));
  const lastWork = history.reduce((m, h) => (h.whenUtc > m ? h.whenUtc : m), '');
  const anchor = lastWork || program?.createdAt || (await db.profile.get(userId))?.onboardingCompletedAt || '2026-01-01T00:00:00.000Z';
  const nowUtc = new Date(Date.parse(anchor) + STRUCTURAL_REST_HOURS * 3_600_000).toISOString();
  const input: PlannerInput = { ...raw, nowUtc, history, rotationIndex: program?.rotationIndex ?? 0 };
  const seq = await ordinarySequence(ctx);
  const sessions = await db.sessions.toArray();
  const extras = sessions.filter((s) => s.kind === 'extra' && FINISHED.has(s.status)).map((s) => `${s.id}|${s.countsAsPlannedAt ?? ''}`).sort();
  const { substitutions, equipmentProfiles, ...profileRest } = input.profile;
  const parts: Record<string, string> = {
    ordinary: hashOf([...seq.keys()].sort()),
    counted: hashOf(sessions.filter((s) => s.countsAsPlannedAt).map((s) => s.id).sort()),
    extra: hashOf(extras),
    profile: hashOf({ profileRest, minutes: input.minutes ?? null, programId: program?.id ?? null }),
    substitutions: hashOf({ substitutions, equipmentProfiles: equipmentProfiles ?? {} }),
    restrictions: hashOf(input.restrictions),
    symptoms: hashOf(input.symptoms),
    settings: hashOf(input.exerciseSettings),
    history: hashOf(history),
    versions: hashOf([ENGINE_VERSION, PLANNER_VERSION, RULESET_VERSION, CATALOG_VERSION, SUBSTITUTION_CATALOG_VERSION, TEMPLATE_VERSION]),
  };
  return { input, programId: program?.id ?? null, rotationIndex: program?.rotationIndex ?? 0, frequency: input.profile.plannedSessionsPerWeek, baseSequence: seq.size + 1, parts, inputsHash: hashOf({ parts, rotation: program?.rotationIndex ?? 0 }) };
}

/** Deterministisk framtidssekvens: befintlig planerare per kommande rotationsplats. Inga vikter sparas. */
function computeSlots(ctx: AppContext, pi: PlanInputs, count: number, offset = 0): PlanSlot[] {
  const out: PlanSlot[] = [];
  for (let k = offset; k < offset + count; k++) {
    const plan = planRegular({ ...pi.input, rotationIndex: pi.rotationIndex + k });
    const sequence = pi.baseSequence + k;
    out.push({
      slotSequence: sequence,
      plannedSlotId: slotId(ctx.userId, sequence),
      programId: pi.programId,
      rotationIndex: pi.rotationIndex + k,
      templateKey: plan.templateKey,
      approxWeek: Math.floor(k / Math.max(1, pi.frequency)) + 1,
      estimatedMinutes: Math.round(plan.estimatedMinutes),
      status: k === 0 ? 'ready' : k <= PROVISIONAL_SLOTS ? 'provisional' : 'structural',
      planStatus: plan.status,
      exercises: plan.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        variantKey: e.variantKey ?? 'default',
        role: e.role,
        mode: e.mode,
        sets: e.sets,
        reps: e.reps,
        bandMin: e.bandMin,
        bandMax: e.bandMax,
        loadKind: e.loadKind,
        loadBasis: e.loadBasis ?? null,
        calibration: e.calibration,
        substitutionFrom: e.substitutionFrom,
      })),
      removed: plan.removed,
      warnings: plan.warnings,
    });
  }
  return out;
}

const CHANGE_ORDER = ['SESSION_COMPLETED', 'EXTRA_COUNTED_AS_PLANNED', 'EXTRA_SESSION_COMPLETED', 'SUBSTITUTION_CHANGED', 'PROFILE_CHANGED', 'RESTRICTION_CHANGED', 'SYMPTOM_CHANGED', 'EXERCISE_SETTINGS_CHANGED', 'ALGORITHM_VERSION_CHANGED', 'HISTORY_CHANGED'] as const;
const PART_CHANGE: Record<string, (typeof CHANGE_ORDER)[number]> = {
  ordinary: 'SESSION_COMPLETED',
  counted: 'EXTRA_COUNTED_AS_PLANNED',
  extra: 'EXTRA_SESSION_COMPLETED',
  substitutions: 'SUBSTITUTION_CHANGED',
  profile: 'PROFILE_CHANGED',
  restrictions: 'RESTRICTION_CHANGED',
  symptoms: 'SYMPTOM_CHANGED',
  settings: 'EXERCISE_SETTINGS_CHANGED',
  versions: 'ALGORITHM_VERSION_CHANGED',
  history: 'HISTORY_CHANGED',
};
/** Ändringar som alltid ger en spårbar revision (§5.2), även om kommande pass råkar bli oförändrade. */
const ALWAYS_REVISE = new Set(['SESSION_COMPLETED', 'EXTRA_COUNTED_AS_PLANNED', 'EXTRA_SESSION_COMPLETED', 'SUBSTITUTION_CHANGED', 'PROFILE_CHANGED', 'RESTRICTION_CHANGED', 'SYMPTOM_CHANGED', 'ALGORITHM_VERSION_CHANGED']);

export const CHANGE_TYPE_SV: Record<string, string> = {
  INITIAL: 'Första planen',
  SESSION_COMPLETED: 'Ordinarie pass genomfört',
  EXTRA_COUNTED_AS_PLANNED: 'Spontanpass räknat som ordinarie',
  EXTRA_SESSION_COMPLETED: 'Spontanpass genomfört',
  SUBSTITUTION_CHANGED: 'Övningsval ändrat framöver',
  PROFILE_CHANGED: 'Inställningar ändrade',
  RESTRICTION_CHANGED: 'Begränsningar ändrade',
  SYMPTOM_CHANGED: 'Besvär rapporterade eller lösta',
  EXERCISE_SETTINGS_CHANGED: 'Övningsinställningar ändrade',
  ALGORITHM_VERSION_CHANGED: 'Ny regelversion',
  HISTORY_CHANGED: 'Träningshistorik ändrad',
};

const slotShape = (s: PlanSlot) => JSON.stringify([s.templateKey, s.estimatedMinutes, s.exercises.map((e) => [e.exerciseId, e.variantKey, e.mode, e.sets, e.bandMin, e.bandMax, e.calibration])]);

function summarize(changeTypes: string[], prev: LocalPlanRevision | null, slots: PlanSlot[]): string {
  const parts: string[] = [];
  const base = slots[0]?.slotSequence ?? 1;
  if (changeTypes.includes('SESSION_COMPLETED') || changeTypes.includes('EXTRA_COUNTED_AS_PLANNED')) parts.push(`Planen gäller nu från pass ${base}.`);
  if (prev) {
    const old = new Map((prev.slots as PlanSlot[]).map((s) => [s.slotSequence, slotShape(s)]));
    const changed = slots.filter((s) => old.has(s.slotSequence) && old.get(s.slotSequence) !== slotShape(s)).length;
    parts.push(changed ? `${changed} kommande pass ändrade (övningar, set eller tid).` : 'Inga kommande pass ändrades.');
  }
  return [changeTypes.map((c) => CHANGE_TYPE_SV[c] ?? c).join(', ') + '.', ...parts].join(' ');
}

/**
 * Revisioner, senaste först. Ordningen följer revisionskedjan (`previousRevisionId`), så att två revisioner med samma
 * tidsstämpel ändå ordnas rätt; vid förgrening (två enheter) avgör tid och därefter id.
 */
export async function planRevisions(ctx: AppContext): Promise<LocalPlanRevision[]> {
  const all = await ctx.db.planRevisions.toArray();
  const byId = new Map(all.map((r) => [r.id, r]));
  const depth = new Map<string, number>();
  const depthOf = (r: LocalPlanRevision): number => {
    const known = depth.get(r.id);
    if (known !== undefined) return known;
    depth.set(r.id, 0);
    const prev = r.previousRevisionId ? byId.get(r.previousRevisionId) : undefined;
    const d = prev ? depthOf(prev) + 1 : 0;
    depth.set(r.id, d);
    return d;
  };
  return all.sort((a, b) => depthOf(b) - depthOf(a) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export async function latestRevision(ctx: AppContext): Promise<LocalPlanRevision | null> {
  return (await planRevisions(ctx))[0] ?? null;
}

const locks = new WeakMap<object, Promise<LocalPlanRevision | null>>();

/**
 * Omplanering (§5.3): skapar en ny, oföränderlig revision endast när indata ändrats. Att öppna planen eller expandera
 * rader ändrar ingen indata och ger därför ingen revision (PL16). Samma indata ⇒ samma innehåll och samma id.
 */
export type RefreshOptions = {
  /** Uttryckliga användarbeslut som ska synas i revisionens orsakskoder (t.ex. USER_ACCEPTED_BALANCE_SUGGESTION). */
  extraReasons?: string[];
};

export function refreshFuturePlan(ctx: AppContext, opts: RefreshOptions = {}): Promise<LocalPlanRevision | null> {
  const running = locks.get(ctx.db);
  if (running) return running.then(() => refreshFuturePlanNow(ctx, opts));
  const p = refreshFuturePlanNow(ctx, opts).finally(() => locks.delete(ctx.db));
  locks.set(ctx.db, p);
  return p;
}

async function refreshFuturePlanNow(ctx: AppContext, opts: RefreshOptions = {}): Promise<LocalPlanRevision | null> {
  const { db, userId } = ctx;
  if (!(await db.profile.get(userId))?.onboardingCompletedAt) return null;
  const pi = await planInputs(ctx);
  const latest = await latestRevision(ctx);
  if (latest && latest.inputsHash === pi.inputsHash) return latest;
  const checked = (await db.meta.get(`planChecked:${latest?.id ?? ''}`))?.value;
  if (latest && checked === pi.inputsHash) return latest;
  const changeTypes = latest ? CHANGE_ORDER.filter((c) => Object.entries(PART_CHANGE).some(([part, t]) => t === c && latest.inputParts[part] !== pi.parts[part])) : [];
  // Ett genomfört spontanpass räknat som ordinarie redovisas som det, inte dessutom som "ordinarie pass genomfört".
  const types: string[] = changeTypes.includes('EXTRA_COUNTED_AS_PLANNED') ? changeTypes.filter((c) => c !== 'SESSION_COMPLETED' && c !== 'EXTRA_SESSION_COMPLETED') : [...changeTypes];
  const slots = computeSlots(ctx, pi, STORED_HORIZON);
  const contentHash = hashOf(slots);
  if (latest && latest.contentHash === contentHash && !types.some((t) => ALWAYS_REVISE.has(t))) {
    // Ingen förändring av kommande pass (t.ex. ett rättat set): ingen ny revision, men kom ihåg kontrollen.
    await db.meta.put({ key: `planChecked:${latest.id}`, value: pi.inputsHash });
    return latest;
  }
  const changeType = latest ? (types[0] ?? 'HISTORY_CHANGED') : 'INITIAL';
  const rev: LocalPlanRevision = {
    id: uuidFromSeed(`planrev|${userId}|${latest?.id ?? 'none'}|${pi.inputsHash}`),
    programId: pi.programId,
    previousRevisionId: latest?.id ?? null,
    baseSequence: pi.baseSequence,
    horizon: STORED_HORIZON,
    changeType,
    reasonCodes: [...(latest ? types : ['INITIAL']), ...(opts.extraReasons ?? [])],
    summary: (opts.extraReasons?.includes('USER_ACCEPTED_BALANCE_SUGGESTION') ? 'Balansförslag godkänt av dig. ' : '') + (latest ? summarize(types.length ? types : ['HISTORY_CHANGED'], latest, slots) : `Första planen: ${STORED_HORIZON} kommande ordinarie pass från pass ${pi.baseSequence}.`),
    inputsHash: pi.inputsHash,
    inputParts: pi.parts,
    contentHash,
    engineVersion: ENGINE_VERSION,
    plannerVersion: PLANNER_VERSION,
    rulesetVersion: RULESET_VERSION,
    catalogVersion: CATALOG_VERSION,
    substitutionCatalogVersion: SUBSTITUTION_CATALOG_VERSION,
    slots,
    createdAt: ctx.clock.now(),
    syncState: 'queued',
  };
  await db.transaction('rw', [db.planRevisions, db.outbox], async () => {
    if (await db.planRevisions.get(rev.id)) return;
    await db.planRevisions.add(rev);
    await db.outbox.add(outbox(ctx, rev.id, { type: 'upsert', table: 'plan_revisions', row: planRevisionRow(userId, rev), immutable: true }));
  });
  ctx.onQueued?.();
  return (await db.planRevisions.get(rev.id)) ?? rev;
}

/**
 * Framtidsplan för vald horisont (§3.3). Med `asOfRevision` visas en äldre revision oförändrad (PL15). Längre än den
 * lagrade horisonten beräknas ur samma indata utan att skapa någon revision eller några poster.
 */
export async function getFuturePlan(ctx: AppContext, count: number, asOfRevision?: string): Promise<{ revision: LocalPlanRevision; slots: PlanSlot[]; current: boolean } | null> {
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new AppError('VALIDATION_ERROR', 'count');
  if (asOfRevision) {
    const r = await ctx.db.planRevisions.get(asOfRevision);
    if (!r) throw new AppError('NOT_FOUND');
    return { revision: r, slots: (r.slots as PlanSlot[]).slice(0, count), current: r.id === (await latestRevision(ctx))?.id };
  }
  const revision = (await refreshFuturePlan(ctx)) ?? null;
  if (!revision) return null;
  let slots = (revision.slots as PlanSlot[]).slice(0, count);
  if (count > revision.horizon) {
    const pi = await planInputs(ctx);
    if (pi.inputsHash === revision.inputsHash) slots = [...slots, ...computeSlots(ctx, pi, count - revision.horizon, revision.horizon)];
  }
  return { revision, slots, current: true };
}

/**
 * Simulering utan sidoeffekter (ÄA-BAL-001 förhandsvisning): samma framtidssekvens som planen men med ändrade
 * användarval i profilen. Använder befintliga planeraren oförändrad; skapar inga revisioner eller poster.
 */
export async function simulateFutureSlots(ctx: AppContext, count: number, profileChanges: Partial<PlannerInput['profile']> = {}): Promise<PlanSlot[]> {
  const pi = await planInputs(ctx);
  const input = { ...pi.input, profile: { ...pi.input.profile, ...profileChanges } };
  return computeSlots(ctx, { ...pi, input }, count);
}

// ---------------------------------------------------------------------------
// Genomförda pass (journal) – läses ur befintliga tabeller, ändras aldrig härifrån
// ---------------------------------------------------------------------------

export type HistoryStatus = 'completed' | 'partial' | 'abandoned';
export type WorkoutSummary = {
  session: LocalSession;
  /** Löpande ordinarie passnummer; null för spontanpass som inte räknats som ordinarie. */
  sequence: number | null;
  durationMinutes: number | null;
  doneWorkSets: number;
  exerciseIds: ExerciseId[];
};

export async function getWorkoutHistory(ctx: AppContext, opts: { before?: string; limit?: number } = {}): Promise<{ items: WorkoutSummary[]; next: string | null }> {
  const { db } = ctx;
  const limit = opts.limit ?? 30;
  const seq = await ordinarySequence(ctx);
  const all = (await db.sessions.toArray()).filter((s) => FINISHED.has(s.status)).sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '') || b.id.localeCompare(a.id));
  const start = opts.before ? all.findIndex((s) => `${s.startedAt}|${s.id}` === opts.before) + 1 : 0;
  const page = all.slice(start, start + limit);
  const items: WorkoutSummary[] = [];
  for (const s of page) {
    const exs = await db.sessionExercises.where('sessionId').equals(s.id).toArray();
    const sets = (await db.sets.where('sessionId').equals(s.id).toArray()).filter((x) => !x.deleted && x.kind === 'work' && x.status === 'done');
    const minutes = s.startedAt && s.finishedAt ? Math.max(0, Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60_000)) : null;
    items.push({ session: s, sequence: seq.get(s.id) ?? null, durationMinutes: minutes, doneWorkSets: sets.length, exerciseIds: [...new Set(exs.sort((a, b) => a.orderIndex - b.orderIndex).filter((e) => !e.replacedById || sets.some((x) => x.sessionExerciseId === e.id)).map((e) => e.exerciseId))] });
  }
  const last = page[page.length - 1];
  return { items, next: start + limit < all.length && last ? `${last.startedAt}|${last.id}` : null };
}

export type WorkoutDetail = {
  session: LocalSession;
  exercises: Array<{ sessionExercise: LocalSessionExercise; replaced: boolean; sets: LocalSet[] }>;
};

/** Verkliga set per övning, inklusive utbytta övningar som hann få set (oförändrade). */
export async function getWorkoutDetail(ctx: AppContext, sessionId: string): Promise<WorkoutDetail> {
  const { db } = ctx;
  const session = await db.sessions.get(sessionId);
  if (!session) throw new AppError('NOT_FOUND');
  const exs = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.orderIndex - b.orderIndex);
  const sets = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter((x) => !x.deleted);
  return {
    session,
    exercises: exs
      .map((e) => ({ sessionExercise: e, replaced: !!e.replacedById, sets: sets.filter((x) => x.sessionExerciseId === e.id).sort((a, b) => a.ordinal - b.ordinal) }))
      .filter((x) => !x.replaced || x.sets.some((s) => s.status === 'done')),
  };
}

/** Senast verifierade arbetsvikt (referens, aldrig prognos – §4 p.2). */
export async function lastPerformed(ctx: AppContext, exerciseId: ExerciseId, variantKey = 'default'): Promise<{ grams: number | null; reps: number | null; seconds: number | null; at: string } | null> {
  const { db } = ctx;
  const exIds = new Set((await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()).filter((e) => e.variantKey === variantKey).map((e) => e.id));
  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter((s) => exIds.has(s.sessionExerciseId) && s.status === 'done' && !s.deleted && s.kind === 'work' && s.occurredAt);
  if (!sets.length) return null;
  const last = sets.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))[0];
  return { grams: last.actualGrams, reps: last.actualReps, seconds: last.actualSeconds, at: last.occurredAt! };
}

// ---------------------------------------------------------------------------
// Anteckningar (§6.1)
// ---------------------------------------------------------------------------

export type NoteTarget = { targetType: 'slot'; slotSequence: number } | { targetType: 'session'; sessionId: string };

export async function getNote(ctx: AppContext, target: NoteTarget): Promise<LocalNote | undefined> {
  return ctx.db.notes.get(noteIdFor(ctx.userId, target));
}

/**
 * Sparar (eller tömmer = raderar innehållet i) en privat anteckning lokalt först, med köpost i samma transaktion.
 * Synk sker villkorat mot senast kända serverrevision; samtidiga ändringar ger konflikt, aldrig tyst överskrivning.
 */
export async function saveNote(ctx: AppContext, target: NoteTarget, body: string): Promise<LocalNote> {
  if (typeof body !== 'string' || body.length > NOTE_MAX_LENGTH) throw new AppError('VALIDATION_ERROR', 'note');
  if (target.targetType === 'slot' && (!Number.isInteger(target.slotSequence) || target.slotSequence < 1)) throw new AppError('VALIDATION_ERROR', 'slotSequence');
  const { db } = ctx;
  if (target.targetType === 'session' && !(await db.sessions.get(target.sessionId))) throw new AppError('NOT_FOUND');
  const id = noteIdFor(ctx.userId, target);
  let out!: LocalNote;
  await db.transaction('rw', [db.notes, db.outbox], async () => {
    const cur = await db.notes.get(id);
    if (cur && cur.body === body) {
      out = cur;
      return;
    }
    out = {
      id,
      targetType: target.targetType,
      slotSequence: target.targetType === 'slot' ? target.slotSequence : null,
      sessionId: target.targetType === 'session' ? target.sessionId : null,
      body,
      revision: cur?.revision ?? 0,
      updatedAt: ctx.clock.now(),
      syncState: cur?.syncState === 'conflict' ? 'conflict' : 'queued',
    };
    await db.notes.put(out);
    await db.outbox.add(outbox(ctx, id, { type: 'note', noteId: id, row: noteRow(ctx.userId, out) }));
  });
  ctx.onQueued?.();
  return out;
}

export async function listNotes(ctx: AppContext): Promise<LocalNote[]> {
  return (await ctx.db.notes.toArray()).filter((n) => n.body.length > 0);
}
