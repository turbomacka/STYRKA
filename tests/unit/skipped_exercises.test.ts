import { afterEach, expect, it } from 'vitest';
import { acceptCatchUp, catchUpOverview, dismissCatchUp, skipExercise } from '../../src/application/skippedExercises';
import { finishSession, logSet, previewNext, startSession } from '../../src/application/training';
import { getFuturePlan, refreshFuturePlan } from '../../src/application/trainingPlan';
import { deleteWorkout } from '../../src/application/deleteWorkout';
import { eraseHealthData, exportJson } from '../../src/application/privacy';
import { patchProfile, saveRestriction } from '../../src/application/profile';
import { planRegular, TIME_TOLERANCE_MIN } from '../../src/planner/planner';
import { buildPlannerInput } from '../../src/application/plannerInput';
import { harness, onboard, type Harness } from './appHarness';
import type { SkipReason } from '../../src/storage/db';

const all: Harness[] = [];
afterEach(async () => { for (const h of all.splice(0)) { h.sync.dispose(); await h.db.delete(); } });
async function setup(reason: SkipReason = 'time') {
  const h = harness(); all.push(h); await onboard(h);
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  const first = (await h.db.sets.where('sessionId').equals(s.id).toArray()).find((x) => x.exerciseId === 'squat')!;
  await logSet(h.ctx, first.id, { actualGrams: first.targetGrams!, rir: 2 });
  const se = (await h.db.sessionExercises.where('sessionId').equals(s.id).toArray()).find((e) => e.exerciseId === 'cable_lateral_raise')!;
  await skipExercise(h.ctx, se.id, reason);
  await finishSession(h.ctx, s.id); h.clock.advanceHours(72);
  return { h, s, se };
}

it('records a reason and skipped sets atomically; preview is deterministic and makes no plan change', async () => {
  const { h, se } = await setup();
  expect((await h.db.sets.where('sessionExerciseId').equals(se.id).toArray()).every((s) => s.status === 'skipped')).toBe(true);
  const before = await previewNext(h.ctx), count = await h.db.outbox.count();
  const a = await catchUpOverview(h.ctx), b = await catchUpOverview(h.ctx);
  expect(a).toEqual(b); expect(a.proposal).not.toBeNull();
  expect(await previewNext(h.ctx)).toEqual(before); expect(await h.db.outbox.count()).toBe(count);
  expect(a.proposal!.after.catchUp?.exerciseId).toBe('cable_lateral_raise');
  expect(a.proposal!.after.estimatedMinutes).toBeLessThanOrEqual(before.budgetMinutes + TIME_TOLERANCE_MIN);
  expect(a.proposal!.after.exercises.find((e) => e.role === 'main')).toEqual(before.exercises.find((e) => e.role === 'main'));
});

it('acceptance changes exactly the next slot, records a readable revision, and can be undone', async () => {
  const { h } = await setup('equipment');
  const before = await getFuturePlan(h.ctx, 12);
  const p = (await catchUpOverview(h.ctx)).proposal!;
  await acceptCatchUp(h.ctx, p);
  const next = await previewNext(h.ctx);
  expect(next.catchUp?.reason).toBe('equipment');
  expect(next.exercises.some((e) => e.exerciseId === p.replacesExerciseId)).toBe(false);
  const revision = await refreshFuturePlan(h.ctx);
  expect(revision?.summary).toContain('prioriteras i nästa pass');
  const after = await getFuturePlan(h.ctx, 12);
  expect(after!.slots.slice(1)).toEqual(before!.slots.slice(1));
  expect(after!.slots[0].catchUp).toBeDefined();
  await dismissCatchUp(h.ctx, (await catchUpOverview(h.ctx)).accepted!);
  expect((await previewNext(h.ctx)).catchUp).toBeUndefined();
  expect((await catchUpOverview(h.ctx)).proposal).toBeNull();
});

it.each(['discomfort', 'other'] as const)('never offers catch-up for %s', async (reason) => {
  const { h } = await setup(reason);
  expect((await catchUpOverview(h.ctx)).proposal).toBeNull();
});

it('does not duplicate an exercise already in the next template', async () => {
  const h = harness(); all.push(h); await onboard(h);
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  const exs = await h.db.sessionExercises.where('sessionId').equals(s.id).toArray();
  const squat = (await h.db.sets.where('sessionExerciseId').equals(exs.find((e) => e.exerciseId === 'squat')!.id).toArray())[0];
  await logSet(h.ctx, squat.id, { actualGrams: squat.targetGrams!, rir: 2 });
  await skipExercise(h.ctx, exs.find((e) => e.exerciseId === 'bench_press')!.id, 'time');
  await finishSession(h.ctx, s.id);
  const v = await catchUpOverview(h.ctx);
  expect(v.proposal).toBeNull(); expect(v.message).toContain('finns redan');
});

it('revalidates before acceptance and respects new restrictions even after acceptance', async () => {
  const { h } = await setup();
  const p = (await catchUpOverview(h.ctx)).proposal!;
  await patchProfile(h.ctx, { minutesPerSession: 25 });
  await expect(acceptCatchUp(h.ctx, p)).rejects.toThrow('INVALID_STATE');
  await patchProfile(h.ctx, { minutesPerSession: 60 });
  await acceptCatchUp(h.ctx, (await catchUpOverview(h.ctx)).proposal!);
  await saveRestriction(h.ctx, { kind: 'block_exercise', exerciseA: 'cable_lateral_raise', active: true });
  const next = await previewNext(h.ctx);
  expect(next.catchUp).toBeUndefined(); expect(next.exercises.some((e) => e.exerciseId === 'cable_lateral_raise')).toBe(false);
  expect((await catchUpOverview(h.ctx)).message).toContain('passar inte längre');
});

it('accepted choice survives offline sync/pull and stops applying after that rotation', async () => {
  const { h } = await setup();
  h.server.online = false;
  await acceptCatchUp(h.ctx, (await catchUpOverview(h.ctx)).proposal!);
  expect((await previewNext(h.ctx)).catchUp).toBeDefined();
  h.server.online = true; await h.sync.syncNow(); await h.sync.pull();
  expect(await h.db.outbox.count()).toBe(0);
  const next = await previewNext(h.ctx);
  const s = await startSession(h.ctx, next);
  expect((await catchUpOverview(h.ctx)).accepted).toBeNull();
  const set = (await h.db.sets.where('sessionId').equals(s.id).toArray())[0];
  await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000, rir: 2 });
  await finishSession(h.ctx, s.id);
  expect((await previewNext(h.ctx)).catchUp).toBeUndefined();
});

it('export includes decisions; deleting source workout removes events and pending changes', async () => {
  const { h, s } = await setup();
  await acceptCatchUp(h.ctx, (await catchUpOverview(h.ctx)).proposal!);
  expect((await exportJson(h.ctx)).skippedExerciseDecisions).toHaveLength(2);
  await deleteWorkout(h.ctx, s.id);
  expect(await h.db.skipEvents.count()).toBe(0);
  expect((await previewNext(h.ctx)).catchUp).toBeUndefined();
  expect((await h.db.outbox.toArray()).some((e) => e.op.type === 'upsert' && e.op.table === 'exercise_skip_events')).toBe(false);
});

it('health erasure removes explanations locally and remotely and prevents stale snapshot restoration while queued', async () => {
  const { h } = await setup('discomfort'); await h.sync.syncNow();
  await eraseHealthData(h.ctx); await h.sync.pull();
  expect(await h.db.skipEvents.count()).toBe(0);
  await h.sync.syncNow(); await h.sync.pull();
  expect(h.server.table('exercise_skip_events').size).toBe(0);
});

it('pure planner repeats the same accepted result and falls back when time cannot fit', async () => {
  const { h } = await setup(); await acceptCatchUp(h.ctx, (await catchUpOverview(h.ctx)).proposal!);
  const input = await buildPlannerInput(h.db, h.userId, h.clock.now());
  expect(planRegular(input)).toEqual(planRegular(input));
  const short = { ...input, minutes: 15 };
  const p = planRegular(short);
  if (!p.catchUp) expect(p.exercises).toEqual(planRegular({ ...short, catchUp: undefined }).exercises);
  expect(p.estimatedMinutes).toBeLessThanOrEqual(16);
});

it('does not start a previously accepted preview after that choice is cancelled', async () => {
  const { h } = await setup();
  await acceptCatchUp(h.ctx, (await catchUpOverview(h.ctx)).proposal!);
  const old = await previewNext(h.ctx);
  await dismissCatchUp(h.ctx, (await catchUpOverview(h.ctx)).accepted!);
  await expect(startSession(h.ctx, old)).rejects.toThrow('CATCH_UP_CHANGED');
});

it('skipping remaining sets preserves performed work and creates no catch-up debt for that exercise', async () => {
  const h = harness(); all.push(h); await onboard(h);
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  const se = (await h.db.sessionExercises.where('sessionId').equals(s.id).toArray()).find((e) => e.exerciseId === 'cable_lateral_raise')!;
  const set = (await h.db.sets.where('sessionExerciseId').equals(se.id).toArray())[0];
  await logSet(h.ctx, set.id, { actualGrams: set.targetGrams!, rir: 2 });
  await skipExercise(h.ctx, se.id, 'time');
  expect((await h.db.sets.get(set.id))?.status).toBe('done');
  await finishSession(h.ctx, s.id);
  expect((await catchUpOverview(h.ctx)).proposal).toBeNull();
});
