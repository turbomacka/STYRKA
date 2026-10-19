import type { StyrkaDB } from '../storage/db';
import { AppError, outbox, type AppContext } from './context';
import { ordinarySequence } from './trainingPlan';

export const deletedWorkoutKey = (id: string) => `deletedWorkout:${id}`;
export type DeletedWorkout = { id: string; sequence: number | null };

export async function deletedWorkouts(db: StyrkaDB): Promise<DeletedWorkout[]> {
  return (await db.meta.where('key').startsWith('deletedWorkout:').toArray()).map((m) => m.value as DeletedWorkout);
}

/** Called within a transaction. Keep only an ID and reserved pass number, never workout contents. */
export async function purgeWorkout(db: StyrkaDB, deleted: DeletedWorkout): Promise<void> {
  const id = deleted.id;
  await db.meta.put({ key: deletedWorkoutKey(id), value: deleted });
  await db.meta.delete(`workout-feedback:${id}`);
  const ids = new Set<string>([id]);
  for (const table of [db.sets, db.sessionExercises, db.audits, db.substitutionEvents, db.notes, db.skipEvents, db.workoutOrderEvents]) {
    const rows = await table.where('sessionId').equals(id).toArray();
    rows.forEach((r) => ids.add(r.id));
    await table.bulkDelete(rows.map((r) => r.id));
  }
  await db.sessions.delete(id);
  await db.conflicts.filter((c) => ids.has(c.recordId)).delete();
  for (const e of await db.outbox.toArray()) {
    // Health reports survive; detach their optional workout link even when queued offline.
    if (e.op.type === 'upsert' && e.op.table === 'symptom_reports' && e.op.row.session_id === id) {
      await db.outbox.update(e.seq!, { op: { ...e.op, row: { ...e.op.row, session_id: null } }, status: 'pending', lastError: null });
    } else if (e.op.type !== 'deleteWorkout' && (ids.has(e.recordId) ||
      (e.op.type === 'upsert' || e.op.type === 'note') && e.op.row.session_id === id)) {
      await db.outbox.delete(e.seq!);
    }
  }
  await db.symptoms.filter((s) => s.sessionId === id).modify({ sessionId: null });
}

/** Drop deleted set references, including references arriving later from an old device. */
export async function cleanCalibrations(db: StyrkaDB): Promise<void> {
  for (const c of await db.calibrations.toArray()) {
    const rows = await db.sets.bulkGet(c.observations);
    const observations = c.observations.filter((_, i) => rows[i] && !rows[i]!.deleted);
    if (observations.length === c.observations.length) continue;
    const exposures = new Set(rows.filter((s) => s && !s.deleted).map((s) => s!.sessionId)).size;
    await db.calibrations.update(c.id, { observations, quality: exposures >= 2 ? 'calibrated' : exposures ? 'calibrating' : 'none', calibratedAt: exposures >= 2 ? c.calibratedAt : null });
  }
}

export async function deleteWorkout(ctx: AppContext, sessionId: string): Promise<void> {
  const { db } = ctx;
  await db.transaction('rw', [db.meta, db.sessions, db.sessionExercises, db.sets, db.audits, db.substitutionEvents, db.notes, db.outbox, db.conflicts, db.symptoms, db.calibrations, db.skipEvents, db.workoutOrderEvents], async () => {
    if (await db.meta.get(deletedWorkoutKey(sessionId))) return;
    const session = await db.sessions.get(sessionId);
    if (!session) throw new AppError('NOT_FOUND');
    if (!['completed', 'partial', 'abandoned'].includes(session.status)) throw new AppError('INVALID_STATE');
    const sequence = (await ordinarySequence(ctx)).get(sessionId) ?? null;
    await purgeWorkout(db, { id: sessionId, sequence });
    await cleanCalibrations(db);
    await db.outbox.add(outbox(ctx, sessionId, { type: 'deleteWorkout', sessionId, sequence }));
  });
  ctx.onQueued?.();
}
