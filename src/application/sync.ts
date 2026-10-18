/**
 * SyncService (03 §5.1, 09): spelar upp lokal outbox i FIFO-ordning mot servern.
 * - Stabilt eventId per användarhandling; samma eventId vid retry.
 * - baseRevision fryses i köposten före första sändning (så att retry ger identisk payload-hash).
 * - Ack först efter servercommit; därefter markeras posten synkad.
 * - Revisionskonflikt ⇒ explicit konfliktpost, ingen tyst last-write-wins. Andra poster synkas oberoende.
 * - Nätverks-/serverfel ⇒ exponentiell backoff; kön ligger kvar.
 */
import { applyServerSetValues, consentFromRow, exerciseSettingsFromRow, profileFromRow, programFromRow, restrictionFromRow, sessionExerciseFromRow, sessionFromRow, setFromRow, setFullPatch, symptomFromRow, auditFromRow, profileRow, calibrationFromRow, substitutionEventFromRow, noteFromRow, noteRow, planRevisionFromRow, balanceDecisionFromRow } from '../server/mapping';
import { TransportError } from '../server/transport';
import { skipEventFromRow } from '../server/mapping';
import type { ConflictEntry, LocalProfile, LocalSet, OutboxEntry, ServerTable, SyncState } from '../storage/db';
import type { ExerciseId } from '../domain/catalog';
import type { PlanSnapshot } from '../domain/model';
import { outbox, type AppContext } from './context';
import { cleanCalibrations, deletedWorkouts, purgeWorkout } from './deleteWorkout';

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null);
  if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) {
    const na = Number(a), nb = Number(b);
    if (String(a).trim() !== '' && String(b).trim() !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    const da = Date.parse(String(a)), db = Date.parse(String(b));
    if (/\d{4}-\d{2}-\d{2}T/.test(String(a)) && Number.isFinite(da) && Number.isFinite(db)) return da === db;
    return false;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Alla fält i patchen har redan samma värde på servern. */
export function patchAlreadyApplied(patch: Record<string, unknown>, server: Record<string, unknown>): boolean {
  return Object.keys(patch).every((k) => sameValue(patch[k], server[k]));
}

export type SyncStatus = { state: 'idle' | 'syncing' | 'offline' | 'auth_required' | 'error'; pullState: 'idle' | 'loading' | 'ready' | 'error'; pending: number; conflicts: number; failed: number; lastSyncedAt: string | null; nextRetryAt: string | null };

export type SyncRunResult = { sent: number; applied: number; duplicates: number; conflicts: number; rejected: number; stoppedBy: TransportError['code'] | null };

const MAX_BACKOFF_MS = 5 * 60_000;

export class SyncEngine {
  private running: Promise<SyncRunResult> | null = null;
  private backoffMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private lastState: SyncStatus['state'] = 'idle';
  private lastSyncedAt: string | null = null;
  private nextRetryAt: string | null = null;
  private pullState: SyncStatus['pullState'] = 'idle';
  private pulling: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(private readonly ctx: AppContext) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  async status(): Promise<SyncStatus> {
    const db = this.ctx.db;
    const [pending, conflicts, failed] = await Promise.all([db.outbox.where('status').equals('pending').count(), db.conflicts.count(), db.outbox.where('status').equals('rejected').count()]);
    return { state: this.lastState, pullState: this.pullState, pending, conflicts, failed, lastSyncedAt: this.lastSyncedAt, nextRetryAt: this.nextRetryAt };
  }

  /** Antal lokala ändringar som ännu inte är bekräftade av servern (inkl. konflikter och avvisade). */
  async pendingCount(): Promise<number> {
    return this.ctx.db.outbox.count();
  }

  async conflicts(): Promise<ConflictEntry[]> {
    return this.ctx.db.conflicts.toArray();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  /** Begär synk snarast (debounce via pågående körning). */
  request(): void {
    if (this.running || this.lastState === 'auth_required') return;
    void this.syncNow().catch(() => undefined);
  }

  async syncNow(): Promise<SyncRunResult> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
      this.emit();
    });
    return this.running;
  }

  /** Användarstyrt omförsök eller ny session: spela upp kön, hämta sedan en komplett serverbild. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const result = await this.syncNow();
      if (!result.stoppedBy) await this.pull();
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private schedule(): void {
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs ? this.backoffMs * 2 : 1000);
    this.nextRetryAt = new Date(Date.parse(this.ctx.clock.now()) + this.backoffMs).toISOString();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.request(), this.backoffMs);
  }

  private async run(): Promise<SyncRunResult> {
    const res: SyncRunResult = { sent: 0, applied: 0, duplicates: 0, conflicts: 0, rejected: 0, stoppedBy: null };
    if (!this.ctx.isOnline()) {
      this.lastState = 'offline';
      res.stoppedBy = 'OFFLINE';
      return res;
    }
    this.lastState = 'syncing';
    this.emit();
    const blocked = new Set<string>();
    for (;;) {
      const entries = await this.ctx.db.outbox.orderBy('seq').toArray();
      const next = entries.find((e) => {
        if (e.status === 'conflict' || e.status === 'rejected') {
          blocked.add(e.recordId);
          return false;
        }
        return !blocked.has(e.recordId);
      });
      if (!next) break;
      try {
        res.sent++;
        const outcome = await this.send(next);
        if (outcome === 'applied') res.applied++;
        else if (outcome === 'duplicate') res.duplicates++;
        else if (outcome === 'conflict') {
          res.conflicts++;
          blocked.add(next.recordId);
        } else {
          res.rejected++;
          blocked.add(next.recordId);
        }
      } catch (e) {
        // An in-flight mutation may have been superseded by a local workout deletion.
        if (!(await this.ctx.db.outbox.get(next.seq!))) continue;
        const err = e instanceof TransportError ? e : new TransportError('DB_UNAVAILABLE', String(e));
        if (err.retryable) {
          await this.ctx.db.outbox.update(next.seq!, { attempts: next.attempts + 1, lastError: err.code });
          this.lastState = err.code === 'OFFLINE' ? 'offline' : err.code === 'AUTH_REQUIRED' ? 'auth_required' : 'error';
          res.stoppedBy = err.code;
          if (err.code !== 'AUTH_REQUIRED') this.schedule();
          else {
            if (this.timer) clearTimeout(this.timer);
            this.timer = null;
            this.nextRetryAt = null;
          }
          return res;
        }
        await this.markRejected(next, err.code);
        res.rejected++;
        blocked.add(next.recordId);
      }
    }
    this.backoffMs = 0;
    this.nextRetryAt = null;
    this.lastSyncedAt = this.ctx.clock.now();
    this.lastState = 'idle';
    return res;
  }

  private async markRejected(entry: OutboxEntry, code: string): Promise<void> {
    const db = this.ctx.db;
    await db.transaction('rw', [db.outbox, db.sets], async () => {
      await db.outbox.update(entry.seq!, { status: 'rejected', lastError: code });
      if (entry.op.type === 'set') await db.sets.update(entry.op.setId, { syncState: 'failed' });
    });
  }

  private async send(entry: OutboxEntry): Promise<'applied' | 'duplicate' | 'conflict' | 'rejected'> {
    const { db, transport, userId } = this.ctx;
    const op = entry.op;
    switch (op.type) {
      case 'deleteWorkout':
        await transport.deleteWorkout(op.sessionId, op.sequence);
        await this.ack(entry);
        return 'applied';
      case 'set': {
        let base = op.baseRevision;
        if (base === undefined) {
          const local = await db.sets.get(op.setId);
          base = op.create ? null : (local?.serverRevision ?? null);
          await db.outbox.update(entry.seq!, { op: { ...op, baseRevision: base } });
        }
        const env = await transport.applySetMutation(entry.eventId, op.setId, base, op.payload);
        if (env.status === 'applied' || env.status === 'duplicate') {
          await db.transaction('rw', [db.outbox, db.sets], async () => {
            await db.outbox.delete(entry.seq!);
            const remaining = await db.outbox.where('recordId').equals(op.setId).count();
            const s = await db.sets.get(op.setId);
            if (s) await db.sets.put({ ...s, serverRevision: env.revision ?? s.serverRevision, syncState: remaining ? 'queued' : 'synced' });
          });
          return env.status;
        }
        if (env.status === 'conflict' && env.code === 'REVISION_CONFLICT') {
          await db.transaction('rw', [db.outbox, db.sets, db.conflicts], async () => {
            const s = await db.sets.get(op.setId);
            await db.outbox.update(entry.seq!, { status: 'conflict', lastError: env.code ?? null });
            if (s) {
              await db.sets.put({ ...s, syncState: 'conflict' });
              const c: ConflictEntry = { id: op.setId, recordType: 'training_set', recordId: op.setId, local: setFullPatch(s), server: env.server ?? {}, serverRevision: env.revision ?? 0, eventId: entry.eventId, detectedAt: this.ctx.clock.now() };
              await db.conflicts.put(c);
            }
          });
          return 'conflict';
        }
        await this.markRejected(entry, env.code ?? 'REJECTED');
        return 'rejected';
      }
      case 'exerciseConfig':
        await transport.patchExerciseConfiguration(op.exerciseId, op.configuration);
        await this.ack(entry);
        return 'applied';
      case 'upsert':
        await transport.upsert(op.table, op.row, { immutable: op.immutable });
        await this.ack(entry);
        return 'applied';
      case 'delete':
        await transport.remove(op.table, op.id, op.idColumn);
        await this.ack(entry);
        return 'applied';
      case 'equipment':
        await transport.replaceEquipment(userId, op.equipment);
        await this.ack(entry);
        return 'applied';
      case 'rpc':
        await transport.eraseHealthData();
        await this.ack(entry);
        return 'applied';
      case 'note': {
        // Villkorad sparning mot förväntad revision; förlorad kvittens ⇒ samma text på servern ⇒ tillämpat.
        let base = op.baseRevision;
        if (base === undefined) {
          base = (await db.notes.get(op.noteId))?.revision ?? 0;
          await db.outbox.update(entry.seq!, { op: { ...op, baseRevision: base } });
        }
        let r = await transport.saveNote(op.row, base);
        if (r.status === 'conflict' && r.server.body === op.row.body) r = { status: 'applied', revision: r.revision };
        if (r.status === 'applied') {
          const rev = r.revision;
          await db.transaction('rw', [db.outbox, db.notes], async () => {
            await db.outbox.delete(entry.seq!);
            for (const later of await db.outbox.where('recordId').equals(op.noteId).toArray()) {
              if (later.op.type === 'note' && later.op.baseRevision !== undefined && later.op.baseRevision === base) await db.outbox.update(later.seq!, { op: { ...later.op, baseRevision: rev } });
            }
            const remaining = await db.outbox.where('recordId').equals(op.noteId).count();
            const n = await db.notes.get(op.noteId);
            if (n) await db.notes.put({ ...n, revision: Math.max(n.revision, rev), syncState: remaining ? 'queued' : 'synced' });
          });
          return 'applied';
        }
        const conflict = r;
        await db.transaction('rw', [db.outbox, db.notes, db.conflicts], async () => {
          await db.outbox.update(entry.seq!, { status: 'conflict', lastError: 'REVISION_CONFLICT' });
          const n = await db.notes.get(op.noteId);
          if (n) await db.notes.put({ ...n, syncState: 'conflict' });
          await db.conflicts.put({ id: `note:${op.noteId}`, recordType: 'note', recordId: op.noteId, local: { body: op.row.body }, server: conflict.server, serverRevision: conflict.revision, eventId: entry.eventId, detectedAt: this.ctx.clock.now() });
        });
        return 'conflict';
      }
      case 'profile': {
        let base = op.baseRevision;
        if (base === undefined) {
          base = (await db.profile.get(userId))?.revision ?? 0;
          await db.outbox.update(entry.seq!, { op: { ...op, baseRevision: base } });
        }
        let r = await transport.patchProfile(userId, base, op.patch);
        // Idempotens vid förlorad ack: servern har redan exakt de värden vi skickade ⇒ tillämpat, ingen konflikt.
        if (r.status === 'conflict' && patchAlreadyApplied(op.patch, r.server)) r = { status: 'applied', revision: r.revision };
        if (r.status === 'applied') {
          await db.transaction('rw', [db.outbox, db.profile], async () => {
            await db.outbox.delete(entry.seq!);
            const p = await db.profile.get(userId);
            const remaining = await db.outbox.where('recordId').equals(userId).count();
            // Senare köade profilposter fick bas = gammal revision; uppdatera dem så att de bygger på denna.
            for (const later of await db.outbox.where('recordId').equals(userId).toArray()) {
              if (later.op.type === 'profile' && later.op.baseRevision !== undefined && later.op.baseRevision === base) await db.outbox.update(later.seq!, { op: { ...later.op, baseRevision: r.revision } });
            }
            if (p) await db.profile.put({ ...p, revision: r.revision, syncState: remaining ? 'queued' : 'synced' });
          });
          return 'applied';
        }
        await db.transaction('rw', [db.outbox, db.profile, db.conflicts], async () => {
          await db.outbox.update(entry.seq!, { status: 'conflict', lastError: 'REVISION_CONFLICT' });
          const p = await db.profile.get(userId);
          if (p) await db.profile.put({ ...p, syncState: 'conflict' });
          await db.conflicts.put({ id: `profile:${userId}`, recordType: 'profile', recordId: userId, local: op.patch, server: r.server, serverRevision: r.revision, eventId: entry.eventId, detectedAt: this.ctx.clock.now() });
        });
        return 'conflict';
      }
    }
  }

  private async ack(entry: OutboxEntry): Promise<void> {
    const db = this.ctx.db;
    if (entry.op.type === 'exerciseConfig') {
      const id = entry.op.exerciseId;
      await db.transaction('rw', [db.outbox, db.sessionExercises], async () => {
        await db.outbox.delete(entry.seq!);
        if (await db.outbox.where('recordId').equals(id).count() === 0) await db.sessionExercises.update(id, { syncState: 'synced' });
      });
      return;
    }
    if (entry.op.type !== 'upsert') {
      await db.outbox.delete(entry.seq!);
      return;
    }
    const localTables: Record<ServerTable, string> = {
      profiles: 'profile', user_exercise_profiles: 'exerciseSettings', health_consents: 'consents',
      restriction_rules: 'restrictions', programs: 'programs', training_sessions: 'sessions',
      session_exercises: 'sessionExercises', symptom_reports: 'symptoms', recommendation_audits: 'audits',
      user_exercise_calibrations: 'calibrations', session_exercise_substitution_events: 'substitutionEvents',
      plan_revisions: 'planRevisions', notebook_notes: 'notes', balance_suggestion_decisions: 'balanceDecisions',
      exercise_skip_events: 'skipEvents',
    };
    const table = db.table<{ syncState: SyncState }, string>(localTables[entry.op.table]);
    const id = (entry.op.row.id ?? entry.op.row.user_id) as string;
    await db.transaction('rw', [db.outbox, table], async () => {
      await db.outbox.delete(entry.seq!);
      if (await db.outbox.where('recordId').equals(entry.recordId).count() === 0) await table.update(id, { syncState: 'synced' });
    });
  }

  /**
   * S16: användaren väljer vilken version som ska gälla.
   * 'server' ⇒ lokala värden ersätts av serverns; 'mine' ⇒ ny händelse som bygger på serverns revision.
   */
  async resolveConflict(conflictId: string, choice: 'mine' | 'server'): Promise<void> {
    const db = this.ctx.db;
    await db.transaction('rw', [db.conflicts, db.outbox, db.sets, db.profile, db.notes], async () => {
      const c = await db.conflicts.get(conflictId);
      if (!c) return;
      const pending = await db.outbox.where('recordId').equals(c.recordId).toArray();
      for (const p of pending) await db.outbox.delete(p.seq!);
      if (c.recordType === 'training_set') {
        const s = await db.sets.get(c.recordId);
        if (s) {
          if (choice === 'server') {
            await db.sets.put(applyServerSetValues(s, c.server, c.serverRevision));
          } else {
            const updated: LocalSet = { ...s, serverRevision: c.serverRevision, syncState: 'queued' };
            await db.sets.put(updated);
            await db.outbox.add({ ...outbox(this.ctx, s.id, { type: 'set', setId: s.id, create: false, payload: setFullPatch(updated), baseRevision: c.serverRevision }) });
          }
        }
      } else if (c.recordType === 'note') {
        const n = await db.notes.get(c.recordId);
        if (n) {
          if (choice === 'server') {
            await db.notes.put({ ...noteFromRow(c.server), syncState: 'synced' });
          } else {
            const upd = { ...n, revision: c.serverRevision, syncState: 'queued' as const };
            await db.notes.put(upd);
            await db.outbox.add(outbox(this.ctx, n.id, { type: 'note', noteId: n.id, row: noteRow(this.ctx.userId, upd), baseRevision: c.serverRevision }));
          }
        }
      } else {
        const p = await db.profile.get(c.recordId);
        if (p) {
          if (choice === 'server') {
            const fromServer = profileFromRow(c.server, p.equipment);
            await db.profile.put({ ...fromServer, equipment: p.equipment, revision: c.serverRevision, syncState: 'synced' });
          } else {
            const upd: LocalProfile = { ...p, revision: c.serverRevision, syncState: 'queued' };
            await db.profile.put(upd);
            await db.outbox.add(outbox(this.ctx, p.userId, { type: 'profile', patch: profileRow(upd), baseRevision: c.serverRevision }));
          }
        }
      }
      await db.conflicts.delete(conflictId);
    });
    this.ctx.onQueued?.();
  }

  /**
   * Hämtar serverns data och slår ihop: poster med lokala osynkade ändringar skrivs aldrig över.
   * Används vid inloggning på ny enhet och för flera enheter.
   */
  pull(): Promise<void> {
    if (this.pulling) return this.pulling;
    this.pullState = 'loading';
    this.emit();
    this.pulling = this.pullSnapshot().then(() => {
      this.pullState = 'ready';
      // En lyckad läsning får inte dölja ett skrivfel som inträffade medan hämtningen pågick.
    }).catch((e: unknown) => {
      this.pullState = 'error';
      this.lastState = e instanceof TransportError && e.code === 'AUTH_REQUIRED' ? 'auth_required' : e instanceof TransportError && e.code === 'OFFLINE' ? 'offline' : 'error';
      throw e;
    }).finally(() => {
      this.pulling = null;
      this.emit();
    });
    return this.pulling;
  }

  private async pullSnapshot(): Promise<void> {
    const { db, transport, userId } = this.ctx;
    // Bara poster som var synkade före hämtningen får avstämmas som raderade.
    // En lokal ändring/ny synk under nätanropet får inte försvinna på grund av en äldre serverbild.
    const [beforeRestrictions, beforeSymptoms, beforeQueue, beforeNotes, beforeSkipEvents] = await Promise.all([db.restrictions.toArray(), db.symptoms.toArray(), db.outbox.toArray(), db.notes.toArray(), db.skipEvents.toArray()]);
    const beforePending = new Set(beforeQueue.map((e) => e.recordId));
    // Äldre versioner tog bort kvitterade köposter men lämnade raderna märkta 'queued'.
    const wasSynced = (r: { id: string; syncState: SyncState }) => r.syncState === 'synced' || (r.syncState === 'queued' && !beforePending.has(r.id));
    const snap = await transport.pullAll(userId);
    const auditsBySession = new Map(snap.audits.map((a) => [a.session_id as string, a]));
    const replacedBy = new Map<string, string>();
    const bySession = new Map<string, Record<string, unknown>[]>();
    for (const se of snap.sessionExercises) {
      const list = bySession.get(se.session_id as string) ?? [];
      list.push(se);
      bySession.set(se.session_id as string, list);
    }
    for (const list of bySession.values()) {
      for (const se of list) {
        const snapshot = se.recommendation_snapshot as { substitutionReason?: string; substitutionFrom?: string };
        const replaces = (se.recommendation_snapshot as { substitution?: { replacesSessionExerciseId?: string } })?.substitution?.replacesSessionExerciseId;
        if (replaces && list.some((x) => x.id === replaces)) {
          replacedBy.set(replaces, se.id as string);
        } else if (snapshot?.substitutionReason === 'USER_SWAP') {
          const from = list.filter((x) => x.exercise_slug === snapshot.substitutionFrom && (x.order_index as number) < (se.order_index as number)).sort((a, b) => (b.order_index as number) - (a.order_index as number))[0];
          if (from) replacedBy.set(from.id as string, se.id as string);
        }
      }
    }
    const seIndex = new Map(snap.sessionExercises.map((se) => [se.id as string, { sessionId: se.session_id as string, exerciseId: se.exercise_slug as ExerciseId }]));
    await db.transaction('rw', [db.profile, db.exerciseSettings, db.restrictions, db.symptoms, db.consents, db.programs, db.sessions, db.sessionExercises, db.sets, db.audits, db.meta, db.calibrations, db.substitutionEvents, db.outbox, db.conflicts, db.planRevisions, db.notes, db.balanceDecisions, db.skipEvents], async () => {
      for (const d of snap.deletedWorkouts ?? []) await purgeWorkout(db, d);
      const deleted = new Set((await deletedWorkouts(db)).map((d) => d.id));
      // A snapshot started before local deletion must not bring any of its children back.
      snap.skipEvents = (snap.skipEvents ?? []).filter((r) => !deleted.has(r.session_id as string));
      snap.sessions = snap.sessions.filter((r) => !deleted.has(r.id as string));
      snap.sessionExercises = snap.sessionExercises.filter((r) => !deleted.has(r.session_id as string));
      snap.sets = snap.sets.filter((r) => !deleted.has(seIndex.get(r.session_exercise_id as string)?.sessionId ?? ''));
      snap.audits = snap.audits.filter((r) => !deleted.has(r.session_id as string));
      snap.notes = snap.notes.filter((r) => !deleted.has(r.session_id as string));
      snap.substitutionEvents = snap.substitutionEvents.filter((r) => !deleted.has(r.session_id as string));
      snap.symptoms = snap.symptoms.map((r) => deleted.has(r.session_id as string) ? { ...r, session_id: null } : r);
      const queued = await db.outbox.toArray();
      const pendingIds = new Set(queued.map((e) => e.recordId));
      const keep = <T extends { syncState: string; id?: string; userId?: string }>(local: T | undefined) => {
        if (!local || local.syncState === 'synced') return false;
        const id = local.id ?? local.userId ?? '';
        return local.syncState !== 'queued' || pendingIds.has(id) || pendingIds.has(`consent:${id}`);
      };
      const pendingErase = [...queued, ...beforeQueue].some((e) => e.op.type === 'rpc' && e.op.name === 'erase_health_data');
      const pendingDeletes = new Set(queued.filter((e) => e.op.type === 'delete').map((e) => e.recordId));
      const restrictionIds = new Set(snap.restrictions.map((r) => r.id));
      const symptomIds = new Set(snap.symptoms.map((r) => r.id));
      for (const old of beforeRestrictions) {
        if (wasSynced(old) && !restrictionIds.has(old.id) && sameValue(old, await db.restrictions.get(old.id))) await db.restrictions.delete(old.id);
      }
      for (const old of beforeSymptoms) {
        if (wasSynced(old) && !symptomIds.has(old.id) && sameValue(old, await db.symptoms.get(old.id))) await db.symptoms.delete(old.id);
      }
      if (snap.profile && !keep(await db.profile.get(userId))) await db.profile.put(profileFromRow(snap.profile, snap.equipment));
      for (const r of snap.exerciseProfiles) {
        const m = exerciseSettingsFromRow(r);
        const local = await db.exerciseSettings.where('exerciseId').equals(m.exerciseId).first();
        if (keep(local)) continue;
        if (local && local.id !== m.id) await db.exerciseSettings.delete(local.id);
        await db.exerciseSettings.put(m);
      }
      for (const r of snap.restrictions) if (!pendingErase && !pendingDeletes.has(r.id as string) && !keep(await db.restrictions.get(r.id as string))) await db.restrictions.put(restrictionFromRow(r));
      for (const r of snap.symptoms) if (!pendingErase && !pendingDeletes.has(r.id as string) && !keep(await db.symptoms.get(r.id as string))) await db.symptoms.put(symptomFromRow(r));
      for (const r of snap.consents) if (!pendingErase && !keep(await db.consents.get(r.user_id as string))) await db.consents.put(consentFromRow(r));
      for (const r of snap.programs) if (!keep(await db.programs.get(r.id as string))) await db.programs.put(programFromRow(r));
      for (const r of snap.sessions) {
        if (keep(await db.sessions.get(r.id as string))) continue;
        const audit = auditsBySession.get(r.id as string);
        const snapshot = (audit?.plan_snapshot ?? { exercises: [], budgetMinutes: r.planned_minutes, kind: r.kind === 'extra' ? 'extra' : 'planned' }) as PlanSnapshot;
        await db.sessions.put(sessionFromRow(r, snapshot));
      }
      for (const r of snap.sessionExercises) if (!keep(await db.sessionExercises.get(r.id as string))) await db.sessionExercises.put(sessionExerciseFromRow(r, replacedBy.get(r.id as string) ?? null));
      for (const r of snap.sets) {
        const se = seIndex.get(r.session_exercise_id as string);
        const local = await db.sets.get(r.id as string);
        if (!se || keep(local)) continue;
        // A fetch begun before an acknowledged write must never lower its revision.
        if (local?.serverRevision != null && typeof r.revision === 'number' && r.revision < local.serverRevision) continue;
        await db.sets.put(setFromRow(r, se));
      }
      for (const r of snap.audits) if (!keep(await db.audits.get(r.id as string))) await db.audits.put(auditFromRow(r));
      for (const r of snap.calibrations ?? []) if (!keep(await db.calibrations.get(r.id as string))) await db.calibrations.put(calibrationFromRow(r));
      for (const r of snap.substitutionEvents ?? []) if (!keep(await db.substitutionEvents.get(r.id as string))) await db.substitutionEvents.put(substitutionEventFromRow(r));
      // ÄA-PLAN-001: planrevisioner (oföränderliga) och anteckningar; anteckningar raderade på servern (t.ex. hälsoradering) tas bort lokalt.
      for (const r of snap.planRevisions ?? []) if (!(await db.planRevisions.get(r.id as string))) await db.planRevisions.put(planRevisionFromRow(r));
      const noteIds = new Set((snap.notes ?? []).map((r) => r.id));
      for (const old of beforeNotes) {
        if (wasSynced(old) && !noteIds.has(old.id) && sameValue(old, await db.notes.get(old.id))) await db.notes.delete(old.id);
      }
      for (const r of snap.notes ?? []) if (!pendingErase && !keep(await db.notes.get(r.id as string))) await db.notes.put(noteFromRow(r));
      for (const r of snap.balanceDecisions ?? []) if (!keep(await db.balanceDecisions.get(r.id as string))) await db.balanceDecisions.put(balanceDecisionFromRow(r));
      const skipIds = new Set(snap.skipEvents.map((r) => r.id));
      for (const old of beforeSkipEvents) if (wasSynced(old) && !skipIds.has(old.id) && sameValue(old, await db.skipEvents.get(old.id))) await db.skipEvents.delete(old.id);
      for (const r of snap.skipEvents) if (!pendingErase && !beforeSkipEvents.some((e) => e.id === r.id) && !(await db.skipEvents.get(r.id as string))) await db.skipEvents.put(skipEventFromRow(r));
      await cleanCalibrations(db);
      await db.meta.put({ key: 'lastPullAt', value: this.ctx.clock.now() });
    });
    this.emit();
  }
}
