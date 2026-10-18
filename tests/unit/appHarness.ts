import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from '../../src/domain/hash';
import type { EquipmentSlug } from '../../src/domain/catalog';
import { openUserDb, type ServerTable, type StyrkaDB } from '../../src/storage/db';
import { TransportError, type MutationEnvelope, type NoteSaveResult, type ProfilePatchResult, type ServerSnapshot, type SyncTransport } from '../../src/server/transport';
import type { AppContext, Clock } from '../../src/application/context';
import { SyncEngine } from '../../src/application/sync';
import { completeOnboarding, GYM_STANDARD, type OnboardingInput } from '../../src/application/profile';

/** In-memory server med samma semantik som `private.apply_set_mutation` (för snabba enhetstester). */
export class FakeServer implements SyncTransport {
  async patchExerciseConfiguration(exerciseId: string, configuration: import('../../src/domain/trainingFlow').ExerciseConfiguration): Promise<void> {
    this.check();
    const row = this.table('session_exercises').get(exerciseId);
    if (row) this.table('session_exercises').set(exerciseId, { ...row, configuration });
  }
  online = true;
  /** Utför nästa skrivning men tappa svaret (nätet bryts före ack). */
  dropNextAck = 0;
  sets = new Map<string, Record<string, unknown> & { revision: number; userId: string }>();
  receipts = new Map<string, { userId: string; recordId: string; hash: string }>();
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  profiles = new Map<string, Record<string, unknown> & { revision: number }>();
  equipment = new Map<string, EquipmentSlug[]>();
  calls: string[] = [];
  constructor(public userId: string) {}

  private check() {
    if (!this.online) throw new TransportError('OFFLINE');
  }
  private maybeDrop() {
    if (this.dropNextAck > 0) {
      this.dropNextAck--;
      throw new TransportError('OFFLINE');
    }
  }
  table(t: string) {
    let m = this.tables.get(t);
    if (!m) this.tables.set(t, (m = new Map()));
    return m;
  }

  async applySetMutation(eventId: string, setId: string, base: number | null, payload: Record<string, unknown>): Promise<MutationEnvelope> {
    this.check();
    this.calls.push(`set:${eventId}`);
    const hash = canonicalJson({ setId, base, payload });
    const r = this.receipts.get(eventId);
    if (r) {
      if (r.userId !== this.userId) return { status: 'rejected', code: 'EVENT_ID_UNAVAILABLE' };
      if (r.hash === hash) return { status: 'duplicate', recordId: r.recordId, revision: this.sets.get(r.recordId)?.revision ?? null };
      return { status: 'conflict', code: 'EVENT_REUSE_MISMATCH' };
    }
    const cur = this.sets.get(setId);
    let rev: number;
    if (!cur) {
      if (base !== null) return { status: 'rejected', code: 'NOT_FOUND' };
      if (!this.table('session_exercises').has(payload.sessionExerciseId as string)) return { status: 'rejected', code: 'NOT_FOUND' };
      this.sets.set(setId, { ...payload, revision: 1, userId: this.userId });
      rev = 1;
    } else {
      if (base === null || base !== cur.revision) return { status: 'conflict', code: 'REVISION_CONFLICT', revision: cur.revision, server: { ...cur } };
      if ('sessionExerciseId' in payload && payload.sessionExerciseId !== cur.sessionExerciseId) return { status: 'rejected', code: 'PARENT_CHANGE_FORBIDDEN' };
      rev = cur.revision + 1;
      this.sets.set(setId, { ...cur, ...payload, revision: rev });
    }
    this.receipts.set(eventId, { userId: this.userId, recordId: setId, hash });
    this.maybeDrop();
    return { status: 'applied', recordId: setId, revision: rev };
  }

  async upsert(table: ServerTable, row: Record<string, unknown>, opts: { immutable?: boolean } = {}): Promise<void> {
    this.check();
    const id = (row.id ?? row.user_id) as string;
    const t = this.table(table);
    if (opts.immutable && t.has(id)) return;
    t.set(id, { ...row });
    this.maybeDrop();
  }
  async remove(table: ServerTable, id: string): Promise<void> {
    this.check();
    this.table(table).delete(id);
  }
  async deleteWorkout(sessionId: string, sequence: number | null): Promise<void> {
    this.check();
    const ledger = this.table('deleted_training_sessions');
    if (!ledger.has(sessionId)) ledger.set(sessionId, { id: sessionId, sequence });
    const exIds = new Set([...this.table('session_exercises').values()].filter((e) => e.session_id === sessionId).map((e) => e.id));
    for (const [id, s] of this.sets) if (exIds.has(s.sessionExerciseId)) this.sets.delete(id);
    for (const table of ['session_exercises', 'recommendation_audits', 'notebook_notes', 'session_exercise_substitution_events', 'exercise_skip_events']) {
      for (const [id, r] of this.table(table)) if (r.session_id === sessionId) this.table(table).delete(id);
    }
    this.table('training_sessions').delete(sessionId);
    for (const r of this.table('symptom_reports').values()) if (r.session_id === sessionId) r.session_id = null;
    this.maybeDrop();
  }
  async patchProfile(userId: string, base: number, patch: Record<string, unknown>): Promise<ProfilePatchResult> {
    this.check();
    const cur = this.profiles.get(userId);
    if (!cur) {
      this.profiles.set(userId, { ...patch, user_id: userId, revision: base + 1 });
      this.maybeDrop();
      return { status: 'applied', revision: base + 1 };
    }
    if (cur.revision !== base) return { status: 'conflict', revision: cur.revision, server: { ...cur } };
    this.profiles.set(userId, { ...cur, ...patch, revision: base + 1 });
    this.maybeDrop();
    return { status: 'applied', revision: base + 1 };
  }
  async saveNote(row: Record<string, unknown>, base: number): Promise<NoteSaveResult> {
    this.check();
    const t = this.table('notebook_notes');
    const cur = t.get(row.id as string) as (Record<string, unknown> & { revision: number }) | undefined;
    if (base > 0 && cur && cur.revision === base) {
      t.set(row.id as string, { ...cur, body: row.body, updated_at: row.updated_at, revision: base + 1 });
      this.maybeDrop();
      return { status: 'applied', revision: base + 1 };
    }
    if (base === 0 && !cur) {
      t.set(row.id as string, { ...row, revision: 1 });
      this.maybeDrop();
      return { status: 'applied', revision: 1 };
    }
    if (!cur) throw new TransportError('VALIDATION_ERROR', 'note_missing');
    return { status: 'conflict', revision: cur.revision, server: { ...cur } };
  }
  async replaceEquipment(userId: string, equipment: EquipmentSlug[]): Promise<void> {
    this.check();
    this.equipment.set(userId, [...equipment]);
  }
  async eraseHealthData(): Promise<void> {
    this.check();
    this.table('symptom_reports').clear();
    this.table('restriction_rules').clear();
    this.table('notebook_notes').clear();
    this.table('exercise_skip_events').clear();
  }
  async deleteAccount(): Promise<void> {
    this.check();
    this.sets.clear();
    this.tables.clear();
    this.profiles.clear();
  }
  async pullAll(userId: string): Promise<ServerSnapshot> {
    this.check();
    const rows = (t: string) => [...this.table(t).values()];
    const setRows = [...this.sets.entries()].map(([id, s]) => ({
      id,
      user_id: s.userId,
      session_exercise_id: s.sessionExerciseId,
      ordinal: s.ordinal,
      kind: s.kind,
      status: s.status,
      target_kg: s.targetKg,
      target_reps: s.targetReps,
      target_seconds: s.targetSeconds,
      actual_kg: s.actualKg,
      actual_reps: s.actualReps,
      actual_seconds: s.actualSeconds,
      rir: s.rir,
      technique: s.technique,
      occurred_at: s.occurredAt,
      deleted_at: s.deleted ? 'x' : null,
      revision: s.revision,
      perceived_effort: s.perceivedEffort ?? null,
      detail: s.detail ?? null,
    }));
    return {
      skipEvents: rows('exercise_skip_events'),
      deletedWorkouts: rows('deleted_training_sessions') as Array<{ id: string; sequence: number | null }>,
      profile: this.profiles.get(userId) ?? null,
      equipment: this.equipment.get(userId) ?? [],
      exerciseProfiles: rows('user_exercise_profiles'),
      consents: rows('health_consents'),
      restrictions: rows('restriction_rules'),
      symptoms: rows('symptom_reports'),
      programs: rows('programs'),
      sessions: rows('training_sessions'),
      sessionExercises: rows('session_exercises'),
      sets: setRows,
      audits: rows('recommendation_audits'),
      calibrations: rows('user_exercise_calibrations'),
      substitutionEvents: rows('session_exercise_substitution_events'),
      planRevisions: rows('plan_revisions'),
      notes: rows('notebook_notes'),
      balanceDecisions: rows('balance_suggestion_decisions'),
    };
  }
}

export class TestClock implements Clock {
  constructor(public t: number = Date.parse('2026-10-01T07:00:00.000Z')) {}
  now(): string {
    return new Date(this.t).toISOString();
  }
  advanceHours(h: number) {
    this.t += h * 3_600_000;
  }
}

export type Harness = { ctx: AppContext; db: StyrkaDB; sync: SyncEngine; server: FakeServer; clock: TestClock; userId: string };

export function harness(opts: { userId?: string; server?: FakeServer; clock?: TestClock; online?: () => boolean } = {}): Harness {
  const userId = opts.userId ?? randomUUID();
  const server = opts.server ?? new FakeServer(userId);
  const clock = opts.clock ?? new TestClock();
  const db = openUserDb(userId);
  const ctx: AppContext = { db, userId, transport: server, clock, ids: { uuid: () => randomUUID() }, isOnline: opts.online ?? (() => server.online) };
  const sync = new SyncEngine(ctx);
  return { ctx, db, sync, server, clock, userId };
}

export const ONBOARDING: OnboardingInput = {
  adultConfirmed: true,
  plannedSessionsPerWeek: 2,
  minutesPerSession: 60,
  experience: 'intermediate',
  equipment: GYM_STANDARD,
  goals: { squat: 1, bench_press: 1, deadlift: 1 },
  estimates: [
    { exerciseId: 'squat', kind: '1rm', grams: 120_000 },
    { exerciseId: 'bench_press', kind: '1rm', grams: 100_000 },
    { exerciseId: 'deadlift', kind: '3rm', grams: 140_000 },
    { exerciseId: 'overhead_press', kind: '1rm', grams: 60_000 },
    { exerciseId: 'lat_pulldown', kind: '1rm', grams: 80_000 },
    { exerciseId: 'cable_lateral_raise', kind: '1rm', grams: 20_000 },
    { exerciseId: 'biceps_curl', kind: '1rm', grams: 30_000 },
    { exerciseId: 'triceps_pushdown', kind: '1rm', grams: 40_000 },
  ],
  healthConsent: true,
  restrictions: [],
};

export async function onboard(h: Harness, over: Partial<OnboardingInput> = {}) {
  return completeOnboarding(h.ctx, { ...ONBOARDING, ...over });
}
