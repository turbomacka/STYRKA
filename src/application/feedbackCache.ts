import type { StyrkaDB } from '../storage/db';

/** Derived prose is disposable; observations and immutable workout snapshots are not.
 * Call within the same transaction as the history mutation (including db.meta).
 */
export async function invalidateFeedback(db: StyrkaDB, change: { sessionId?: string; setId?: string; deleted?: boolean; all?: boolean }): Promise<void> {
  const keys: string[] = [];
  for (const row of await db.meta.toArray()) {
    if (row.key === 'recent-workout-feedback') { keys.push(row.key); continue; }
    if (row.key.startsWith('feedback-choice:')) {
      // A still-applicable template survives a factual correction. Its fact requirements
      // are checked by the renderer, and its content is never a second source of truth.
      if (change.all || change.deleted && change.sessionId && row.key === `feedback-choice:${change.sessionId}`) keys.push(row.key);
      continue;
    }
    if (!row.key.startsWith('workout-feedback:') && !row.key.startsWith('replanning:')) continue;
    const value = row.value as { sessionId?: string; sourceSessionIds?: string[]; sourceSetIds?: string[] } | null;
    const own = change.sessionId && (value?.sessionId === change.sessionId || row.key === `workout-feedback:${change.sessionId}` || row.key.startsWith(`replanning:${change.sessionId}:`));
    const dependent = (change.sessionId && value?.sourceSessionIds?.includes(change.sessionId)) || (change.setId && value?.sourceSetIds?.includes(change.setId));
    // Older caches did not record dependencies: invalidate conservatively, once.
    const legacy = !value?.sourceSessionIds && !value?.sourceSetIds;
    if (change.all || own || dependent || legacy) keys.push(row.key);
  }
  if (keys.length) await db.meta.bulkDelete(keys);
}
