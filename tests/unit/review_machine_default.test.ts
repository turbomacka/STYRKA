import { expect, it } from 'vitest';
import { logSet, previewNext, startSession, swapExercise, swapInPreview } from '../../src/application/training';
import { SyncEngine } from '../../src/application/sync';
import { StyrkaDB, openUserDb } from '../../src/storage/db';
import { harness, onboard } from './appHarness';

it('keeps the default machine for future workouts when replacing a previously selected machine profile', async () => {
  const h = harness();
  try {
    await onboard(h, { substitutions: { bench_press: 'chest_press_machine' } });
    await h.db.profile.update(h.userId, { equipmentProfiles: { chest_press_machine: 'maskin-A' } });
    const before = await previewNext(h.ctx);
    const index = before.exercises.findIndex((e) => e.exerciseId === 'chest_press_machine');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(before.exercises[index].variantKey).toBe('maskin-A');
    const current = await swapInPreview(h.ctx, before, index, 'chest_press_machine', { variantKey: 'default', scope: 'future' });
    expect(current.exercises[index].variantKey ?? 'default').toBe('default');
    const next = await previewNext(h.ctx);
    expect(next.exercises.find((e) => e.exerciseId === 'chest_press_machine')?.variantKey ?? 'default').toBe('default');
  } finally {
    h.sync.dispose();
    await h.db.delete();
  }
});

it.each([
  ['preview', 'future'], ['active', 'future'], ['preview', 'today'], ['active', 'today'],
] as const)('%s machine change with %s scope survives reload and a second device without rewriting history', async (place, scope) => {
  const h = harness();
  const secondDb = new StyrkaDB(`machine-review-${crypto.randomUUID()}`);
  const secondSync = new SyncEngine({ ...h.ctx, db: secondDb });
  try {
    await onboard(h, { substitutions: { bench_press: 'chest_press_machine' } });
    await h.db.profile.update(h.userId, { equipmentProfiles: { chest_press_machine: 'maskin-A' } });
    const before = await previewNext(h.ctx);
    const i = before.exercises.findIndex((e) => e.exerciseId === 'chest_press_machine');
    expect(i).toBeGreaterThanOrEqual(0);
    if (place === 'preview') await swapInPreview(h.ctx, before, i, 'chest_press_machine', { variantKey: 'default', scope });
    else {
      const session = await startSession(h.ctx, before);
      const old = (await h.db.sessionExercises.where('sessionId').equals(session.id).toArray()).find((e) => e.exerciseId === 'chest_press_machine')!;
      const set = (await h.db.sets.where('sessionExerciseId').equals(old.id).sortBy('ordinal'))[0];
      await logSet(h.ctx, set.id, { actualGrams: 20_000 });
      const history = await h.db.sets.get(set.id);
      const replacement = await swapExercise(h.ctx, old.id, old.exerciseId, { variantKey: 'default', scope });
      expect(replacement.sessionExercise.variantKey).toBe('default');
      expect(await h.db.sets.get(set.id)).toEqual(history);
      expect((await h.db.sessionExercises.get(old.id))?.variantKey).toBe('maskin-A');
    }
    const expected = scope === 'future' ? 'default' : 'maskin-A';
    h.db.close();
    const reopened = openUserDb(h.userId);
    expect((await previewNext({ ...h.ctx, db: reopened })).exercises.find((e) => e.exerciseId === 'chest_press_machine')?.variantKey ?? 'default').toBe(expected);
    reopened.close();
    await h.db.open();
    // För today har testets ursprungliga maskinval inte köats via profiltjänsten; synka det explicit.
    if (scope === 'today') {
      const { patchProfile } = await import('../../src/application/profile');
      await patchProfile(h.ctx, { equipmentProfiles: { chest_press_machine: 'maskin-A' } });
    }
    await h.sync.refresh();
    await secondSync.pull();
    expect((await previewNext({ ...h.ctx, db: secondDb })).exercises.find((e) => e.exerciseId === 'chest_press_machine')?.variantKey ?? 'default').toBe(expected);
  } finally { h.sync.dispose(); secondSync.dispose(); await h.db.delete(); await secondDb.delete(); }
});
