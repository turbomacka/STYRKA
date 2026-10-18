import type { PlannerInput } from '../domain/model';
import type { LocalSkipEvent, StyrkaDB } from '../storage/db';

export const compareSkipEvents = (a: LocalSkipEvent, b: LocalSkipEvent) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);

export function latestSkipEvents(events: LocalSkipEvent[]): LocalSkipEvent[] {
  const latest = new Map<string, LocalSkipEvent>();
  for (const e of [...events].sort(compareSkipEvents)) latest.set(e.sessionExerciseId, e);
  return [...latest.values()];
}

/** Only a still-unperformed source and the explicitly accepted program slot can be changed. */
export async function acceptedCatchUp(db: StyrkaDB, programId: string | null, rotation: number): Promise<PlannerInput['catchUp']> {
  const choices = latestSkipEvents(await db.skipEvents.toArray()).filter((e) => e.action === 'accepted' && e.programId === programId && e.targetRotationIndex === rotation)
    .sort((a, b) => compareSkipEvents(b, a));
  for (const e of choices) {
    const se = await db.sessionExercises.get(e.sessionExerciseId);
    const source = se && await db.sessions.get(se.sessionId);
    if (!se || se.replacedById || !source || !['completed', 'partial', 'abandoned'].includes(source.status) || !e.replacesExerciseId || (e.reason !== 'time' && e.reason !== 'equipment')) continue;
    const done = await db.sets.where('exerciseId').equals(se.exerciseId).filter((s) => s.kind === 'work' && s.status === 'done' && !s.deleted && (s.sessionId === se.sessionId || (s.occurredAt ?? '') >= e.createdAt)).count();
    if (done) continue;
    return { sourceExerciseId: se.id, exerciseId: se.exerciseId, replacesExerciseId: e.replacesExerciseId, reason: e.reason, decisionId: e.id, mode: se.mode, sets: se.snapshot.sets, substitutionFrom: se.snapshot.substitutionFrom, targetRotationIndex: rotation };
  }
}
