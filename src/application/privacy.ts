/** PrivacyService (03 §6, S15): export, radering av hälsodata, kontoradering, utloggning. */
import { exercise } from '../domain/catalog';
import { ENGINE_VERSION } from '../domain/decision_engine';
import { formatKg, gramsToDecimalString } from '../domain/units';
import { destroyUserDb } from '../storage/db';
import { CATALOG_VERSION } from '../domain/catalog';
import { AppError, outbox, type AppContext } from './context';
import { HEALTH_CONSENT_VERSION, PRIVACY_NOTICE_VERSION } from './profile';

export type ExportBundle = {
  format: 'styrka-export';
  formatVersion: 1;
  exportedAt: string;
  userId: string;
  versions: { engine: string; catalog: string; privacyNotice: string; healthConsent: string };
  unsyncedLocalChanges: number;
  profile: unknown;
  exerciseSettings: unknown[];
  healthConsent: unknown;
  restrictions: unknown[];
  symptomReports: unknown[];
  programs: unknown[];
  sessions: unknown[];
  recommendationAudits: unknown[];
  /** Tillägg CR 2026-10-10-01: kalibreringsnivå per övning och revisionsposter för övningsbyten. */
  exerciseCalibrations: unknown[];
  substitutionEvents: unknown[];
  /** Tillägg ÄA-PLAN-001: privata anteckningar och planrevisioner (strukturell plan, inga framtidsvikter). */
  notebookNotes: unknown[];
  planRevisions: unknown[];
  /** Tillägg ÄA-BAL-001: dina beslut om balansförslag. */
  balanceDecisions: unknown[];
  skippedExerciseDecisions: unknown[];
  workoutOrderEvents: unknown[];
  workoutFeedback: unknown[];
};

const strip = <T extends { syncState?: unknown }>(x: T) => {
  const { syncState: _s, ...rest } = x;
  return rest;
};

/** Export omfattar källregistreringar, set, pass, planversion, rekommendationsgrunder och aktuell profil (35). */
export async function exportJson(ctx: AppContext): Promise<ExportBundle> {
  const { db } = ctx;
  const [profile, settings, consent, restrictions, symptoms, programs, sessions, exs, sets, audits, pending, calibrations, events, notes, revisions, balanceDecisions] = await Promise.all([
    db.profile.get(ctx.userId),
    db.exerciseSettings.toArray(),
    db.consents.get(ctx.userId),
    db.restrictions.toArray(),
    db.symptoms.toArray(),
    db.programs.toArray(),
    db.sessions.toArray(),
    db.sessionExercises.toArray(),
    db.sets.toArray(),
    db.audits.toArray(),
    db.outbox.count(),
    db.calibrations.toArray(),
    db.substitutionEvents.toArray(),
    db.notes.toArray(),
    db.planRevisions.toArray(),
    db.balanceDecisions.toArray(),
  ]);
  return {
    format: 'styrka-export',
    formatVersion: 1,
    exportedAt: ctx.clock.now(),
    userId: ctx.userId,
    versions: { engine: ENGINE_VERSION, catalog: CATALOG_VERSION, privacyNotice: PRIVACY_NOTICE_VERSION, healthConsent: HEALTH_CONSENT_VERSION },
    unsyncedLocalChanges: pending,
    profile: profile ? strip(profile) : null,
    exerciseSettings: settings.map(strip),
    healthConsent: consent ? strip(consent) : null,
    restrictions: restrictions.map(strip),
    symptomReports: symptoms.map(strip),
    programs: programs.map(strip),
    sessions: sessions.sort((a,b)=>(a.startedAt??a.clientCreatedAt).localeCompare(b.startedAt??b.clientCreatedAt)).map((s) => ({
      ...strip(s),
      exercises: exs
        .filter((e) => e.sessionId === s.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((e) => ({ ...strip(e), sets: sets.filter((x) => x.sessionExerciseId === e.id).sort((a, b) => a.ordinal - b.ordinal).map(strip) })),
    })),
    recommendationAudits: audits.map(strip),
    exerciseCalibrations: calibrations.map(strip),
    substitutionEvents: events.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(strip),
    notebookNotes: notes.filter((n) => n.body.length > 0).map(strip),
    planRevisions: revisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(strip),
    balanceDecisions: balanceDecisions.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map(strip),
    skippedExerciseDecisions: (await db.skipEvents.toArray()).map(strip),
    workoutOrderEvents: (await db.workoutOrderEvents.toArray()).map(strip),
    workoutFeedback: (await db.meta.where('key').startsWith('workout-feedback:').toArray()).map((x)=>x.value),
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV: en rad per set (semikolon-separerad för svensk Excel; kg med punkt för maskinläsbarhet). */
export async function exportCsv(ctx: AppContext): Promise<string> {
  const { db } = ctx;
  const sessions = new Map((await db.sessions.toArray()).map((s) => [s.id, s]));
  const exs = new Map((await db.sessionExercises.toArray()).map((e) => [e.id, e]));
  const sets = (await db.sets.toArray()).filter((s) => s.status !== 'planned' || s.createQueued);
  const header = ['session_id', 'session_kind', 'session_status', 'started_at', 'exercise', 'exercise_sv', 'mode', 'set_ordinal', 'set_kind', 'set_status', 'target_kg', 'target_reps', 'target_seconds', 'actual_kg', 'actual_reps', 'actual_seconds', 'rir', 'technique', 'occurred_at', 'manual_override', 'deleted', 'engine_version', 'recommendation_reasons', 'load_basis', 'perceived_effort', 'substituted_from', 'execution_mode', 'side_performances_json', 'rest_records_json', 'equipment_configuration_json'];
  const rows = sets
    .map((s) => {
      const se = exs.get(s.sessionExerciseId);
      const sess = sessions.get(s.sessionId);
      return [s.sessionId, sess?.kind, sess?.status, sess?.startedAt, s.exerciseId, exercise(s.exerciseId).nameSv, se?.mode, s.ordinal, s.kind, s.status, s.targetGrams === null ? '' : gramsToDecimalString(s.targetGrams), s.targetReps, s.targetSeconds, s.actualGrams === null ? '' : gramsToDecimalString(s.actualGrams), s.actualReps, s.actualSeconds, s.rir, s.technique, s.occurredAt, s.manualOverride, s.deleted, se?.snapshot.engineVersion, se?.snapshot.reasons.join('|'), se?.snapshot.loadBasis ?? '', s.perceivedEffort ?? '', se?.snapshot.substitutionFrom ?? '', s.detail?.configuration.executionMode ?? '', s.detail ? JSON.stringify(s.detail.performances) : '', s.detail ? JSON.stringify(s.detail.rests) : '', s.detail ? JSON.stringify(s.detail.configuration.equipment) : ''];
    })
    .sort((a, b) => String(a[3]).localeCompare(String(b[3])) || String(a[4]).localeCompare(String(b[4])) || Number(a[7]) - Number(b[7]));
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}

/** Radera hälsorelaterade uppgifter (symtom, begränsningar, samtycke) lokalt + på servern atomiskt. */
export async function eraseHealthData(ctx: AppContext): Promise<void> {
  const { db } = ctx;
  await db.transaction('rw', [db.symptoms, db.restrictions, db.consents, db.outbox, db.notes, db.conflicts, db.skipEvents], async () => {
    // Köade men osända hälsoposter ska aldrig nå servern efter radering. Anteckningar (fri text) räknas hit (ÄA-PLAN-001 PL27).
    const noteIds = await db.notes.toCollection().primaryKeys();
    const ids = new Set([...(await db.symptoms.toCollection().primaryKeys()), ...(await db.restrictions.toCollection().primaryKeys()), ...noteIds, `consent:${ctx.userId}`]);
    for (const id of noteIds) await db.conflicts.delete(`note:${id}`);
    for (const id of await db.skipEvents.toCollection().primaryKeys()) ids.add(id);
    await db.skipEvents.clear();
    await db.notes.clear();
    for (const e of await db.outbox.toArray()) if (ids.has(e.recordId)) await db.outbox.delete(e.seq!);
    await db.symptoms.clear();
    await db.restrictions.clear();
    const c = await db.consents.get(ctx.userId);
    if (c) await db.consents.put({ ...c, withdrawnAt: ctx.clock.now(), syncState: 'queued' });
    await db.outbox.add(outbox(ctx, `erase:${ctx.userId}`, { type: 'rpc', name: 'erase_health_data' }));
  });
  ctx.onQueued?.();
}

/** Kontoradering kräver uppkoppling (servern är källan); lokal data förstörs efteråt. */
export async function eraseAccount(ctx: AppContext): Promise<void> {
  if (!ctx.isOnline()) throw new AppError('OFFLINE');
  await ctx.transport.deleteAccount();
  ctx.db.close();
  await destroyUserDb(ctx.userId);
}

/**
 * Utloggning: om osynkade data finns krävs uttryckligt `discardUnsynced` (S15/32).
 * Lokal databas raderas alltid så att nästa användare inte ser tidigare användares data.
 */
export async function signOutLocal(ctx: AppContext, opts: { discardUnsynced?: boolean } = {}): Promise<void> {
  const pending = await ctx.db.outbox.count();
  if (pending > 0 && !opts.discardUnsynced) throw new AppError('PENDING_SYNC');
  ctx.db.close();
  await destroyUserDb(ctx.userId);
}

export function describeKg(grams: number | null): string {
  return grams === null ? '' : `${formatKg(grams)} kg`;
}
