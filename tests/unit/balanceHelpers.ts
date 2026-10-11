/** Testhjälpare för ÄA-BAL-001. */
import { exercise, type ExerciseId } from '../../src/domain/catalog';
import { displayOrder, finishSession, logSet, previewNext, startSession } from '../../src/application/training';
import type { Harness } from './appHarness';

/** Ordinarie pass där användaren hoppar över angivna övningar (övriga set loggas med förifyllda värden). */
export async function doSession(h: Harness, skip: ExerciseId[] = []) {
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  for (const se of displayOrder(await h.db.sessionExercises.where('sessionId').equals(s.id).toArray())) {
    if (skip.includes(se.exerciseId)) continue;
    for (const set of await h.db.sets.where('sessionExerciseId').equals(se.id).sortBy('ordinal')) {
      h.clock.advanceHours(0.03);
      await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? (exercise(se.exerciseId).loadKind === 'duration_sec' ? null : 20_000), rir: 2 });
    }
  }
  const fin = await finishSession(h.ctx, s.id);
  h.clock.advanceHours(72);
  return fin;
}

