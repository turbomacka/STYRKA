import type { AppContext } from './context';

/** Repair only the unsaved refresh nodes affected by the duplicate-order regression.
 * Keep IDs, event IDs, FIFO order, recorded performances and mutation payloads intact.
 * No server row is rewritten and unrelated validation errors remain visible.
 */
export async function repairPreviewSync(ctx: AppContext): Promise<void> {
  const db = ctx.db;
  await db.transaction('rw', [db.sessionExercises, db.sets, db.outbox], async () => {
    const entries = await db.outbox.orderBy('seq').toArray();
    for (const entry of entries) {
      const op = entry.op;
      if (op.type !== 'upsert' || op.table !== 'session_exercises' || !op.immutable ||
          op.row.user_id !== ctx.userId || entry.status === 'conflict' ||
          (entry.status === 'rejected' && entry.lastError !== 'VALIDATION_ERROR')) continue;
      const node = await db.sessionExercises.get(entry.recordId);
      const parentId = node?.snapshot.refreshOfSessionExerciseId;
      if (!node || !parentId || op.row.id !== node.id || op.row.session_id !== node.sessionId || op.row.order_index !== node.orderIndex) continue;
      const all = await db.sessionExercises.where('sessionId').equals(node.sessionId).toArray();
      if (!all.some(e => e.id === parentId) || !all.some(e => e.id !== node.id && e.orderIndex === node.orderIndex)) continue;
      const orderIndex = Math.max(...all.map(e => e.orderIndex)) + 1;
      await db.sessionExercises.update(node.id, { orderIndex, syncState: 'queued' });
      await db.outbox.update(entry.seq!, { op: { ...op, row: { ...op.row, order_index: orderIndex } }, status: 'pending', lastError: null });
      const sets = await db.sets.where('sessionExerciseId').equals(node.id).toArray();
      for (const set of sets) {
        if (set.serverRevision !== null) continue;
        const creation = entries.find(e => e.recordId === set.id && e.op.type === 'set' && e.op.create);
        if (!creation || creation.status !== 'rejected' || creation.lastError !== 'NOT_FOUND') continue;
        await db.outbox.update(creation.seq!, { status: 'pending', lastError: null });
        await db.sets.update(set.id, { syncState: 'queued' });
      }
    }
  });
}
