import { afterEach, expect, it, vi } from 'vitest';
import { harness, onboard, type Harness } from './appHarness';
import { activeSession, addSet, countExtraAsPlanned, finishSession, logSet, pauseSession, previewNext, recordPerformance, reopenSession, startSession } from '../../src/application/training';
import { getWorkoutHistory, ordinarySequence, planInputs, refreshFuturePlan } from '../../src/application/trainingPlan';
import { defaultConfiguration } from '../../src/domain/trainingFlow';
import { deleteWorkout } from '../../src/application/deleteWorkout';

const instances: Harness[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const h of instances.splice(0)) { h.sync.dispose(); await h.db.delete(); } });
async function setup() {
  const h = harness(); instances.push(h); await onboard(h);
  return h;
}
async function workout(h: Harness) {
  const p = await previewNext(h.ctx), bench = p.exercises.find(e => e.exerciseId === 'bench_press') ?? p.exercises[0];
  const session = await startSession(h.ctx, { ...p, exercises: [{ ...bench, exerciseId: 'bench_press', kg: 80, reps: 7, sets: 3, calibration: false, configuration: defaultConfiguration('bench_press') }] });
  const sets = await h.db.sets.where('sessionId').equals(session.id).sortBy('ordinal');
  return { session, sets };
}

it('continues remaining sets, adds extra work and finishes the same workout without counting it twice', async () => {
  const h = await setup(), { session, sets } = await workout(h);
  await logSet(h.ctx, sets[0].id, { actualGrams: 75000, perceivedEffort: 'easy' });
  const completed = await finishSession(h.ctx, session.id);
  const originalSet = await h.db.sets.get(sets[0].id), originalProgram = await h.db.programs.toArray();
  const revision = await refreshFuturePlan(h.ctx);
  await h.db.meta.put({ key: `workout-feedback:${session.id}`, value: { sessionId: session.id, text: 'Old completion' } });
  h.clock.advanceHours(0.1);
  const [a, b] = await Promise.all([reopenSession(h.ctx, session.id), reopenSession(h.ctx, session.id)]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({ id: session.id, status: 'in_progress', finishedAt: null, startedAt: session.startedAt, firstCountedAt: completed.finishedAt });
  expect(await h.db.sets.get(sets[0].id)).toEqual(originalSet);
  expect(await h.db.meta.get(`workout-feedback:${session.id}`)).toBeUndefined();
  expect((await ordinarySequence(h.ctx)).get(session.id)).toBe(1);
  expect((await planInputs(h.ctx)).baseSequence).toBe(2);
  const extra = await addSet(h.ctx, sets[0].sessionExerciseId);
  for (const row of [...sets.slice(1), extra]) await logSet(h.ctx, row.id, { actualGrams: 75000, perceivedEffort: 'easy' });
  const finished = await finishSession(h.ctx, session.id);
  expect(finished).toMatchObject({ status: 'completed', firstCountedAt: completed.finishedAt, finishedAt: h.clock.now() });
  expect(await finishSession(h.ctx, session.id)).toEqual(finished);
  expect(await h.db.programs.toArray()).toEqual(originalProgram);
  expect(await h.db.sessions.count()).toBe(1);
  expect((await getWorkoutHistory(h.ctx)).items).toMatchObject([{ sequence: 1, doneWorkSets: 4 }]);
  expect((await refreshFuturePlan(h.ctx))!.inputsHash).not.toBe(revision!.inputsHash);
  expect(await h.db.planRevisions.get(revision!.id)).toEqual(revision);
});

it('keeps older workout numbers and rotation stable across reopening, sync and another completion', async () => {
  const h = await setup(), first = await workout(h);
  await logSet(h.ctx, first.sets[0].id, {}); await finishSession(h.ctx, first.session.id);
  // Existing users have terminal sessions without the new field.
  await h.db.sessions.update(first.session.id, { firstCountedAt: undefined });
  h.clock.advanceHours(72);
  const second = await workout(h); await logSet(h.ctx, second.sets[0].id, {}); await finishSession(h.ctx, second.session.id);
  const program = await h.db.programs.toArray(), sequence = await ordinarySequence(h.ctx);
  await h.sync.syncNow(); h.server.online = false;
  h.clock.advanceHours(72); await reopenSession(h.ctx, first.session.id);
  expect(await ordinarySequence(h.ctx)).toEqual(sequence);
  expect((await planInputs(h.ctx)).baseSequence).toBe(3);
  h.server.online = true; expect(await h.sync.syncNow()).toMatchObject({ rejected: 0, conflicts: 0 });
  const remote = harness({ server: h.server, userId: h.userId, clock: h.clock }); instances.push(remote); await remote.sync.pull();
  expect((await activeSession(remote.ctx))!.id).toBe(first.session.id);
  expect(await ordinarySequence(remote.ctx)).toEqual(sequence);
  await logSet(remote.ctx, first.sets[1].id, {}); await finishSession(remote.ctx, first.session.id);
  await remote.sync.syncNow(); await h.sync.pull();
  expect(await ordinarySequence(h.ctx)).toEqual(sequence);
  expect((await h.db.programs.toArray()).map(p => [p.id, p.rotationIndex, p.revision])).toEqual(program.map(p => [p.id, p.rotationIndex, p.revision]));
});

it('an empty finished workout can count once after actual work is recorded', async () => {
  const h = await setup(), { session, sets } = await workout(h);
  await finishSession(h.ctx, session.id);
  expect((await h.db.programs.toArray())[0].rotationIndex).toBe(0);
  await reopenSession(h.ctx, session.id);
  await logSet(h.ctx, sets[0].id, {}); await finishSession(h.ctx, session.id);
  await reopenSession(h.ctx, session.id); await finishSession(h.ctx, session.id);
  expect((await h.db.programs.toArray())[0].rotationIndex).toBe(1);
  expect((await ordinarySequence(h.ctx)).get(session.id)).toBe(1);
});

it('preserves counted extra workouts without offering or applying another rotation advance', async () => {
  const h = await setup(), plan = await previewNext(h.ctx);
  const session = await startSession(h.ctx, { ...plan, kind: 'extra' });
  const sets = await h.db.sets.where('sessionId').equals(session.id).toArray();
  for (const s of sets) await logSet(h.ctx, s.id, { actualGrams: s.targetGrams ?? 20000 });
  await finishSession(h.ctx, session.id); expect(await countExtraAsPlanned(h.ctx, session.id)).toBe(true);
  const counted = await h.db.sessions.get(session.id), program = await h.db.programs.toArray();
  await reopenSession(h.ctx, session.id);
  expect((await ordinarySequence(h.ctx)).get(session.id)).toBe(1);
  const extra = await addSet(h.ctx, sets.find(s => s.exerciseId === 'bench_press')!.sessionExerciseId); await logSet(h.ctx, extra.id, { actualGrams: 20000 });
  await finishSession(h.ctx, session.id);
  expect(await countExtraAsPlanned(h.ctx, session.id)).toBe(false);
  expect((await h.db.sessions.get(session.id))!.countsAsPlannedAt).toBe(counted!.countsAsPlannedAt);
  expect(await h.db.programs.toArray()).toEqual(program);
});

it('rejects a competing active or paused workout and serializes two reopening requests', async () => {
  const h = await setup(), a = await workout(h); await finishSession(h.ctx, a.session.id);
  const b = await workout(h);
  await expect(reopenSession(h.ctx, a.session.id)).rejects.toThrow('active_session_exists');
  await pauseSession(h.ctx, b.session.id);
  await expect(reopenSession(h.ctx, a.session.id)).rejects.toThrow('active_session_exists');
  await finishSession(h.ctx, b.session.id);
  const results = await Promise.allSettled([reopenSession(h.ctx, a.session.id), reopenSession(h.ctx, b.session.id)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(await h.db.sessions.where('status').equals('in_progress').count()).toBe(1);
});

it('rolls back a failed local save and never restores a deleted workout', async () => {
  const h = await setup(), { session } = await workout(h); await finishSession(h.ctx, session.id);
  const original = await h.db.sessions.get(session.id), pending = await h.db.outbox.count();
  vi.spyOn(h.db.outbox, 'add').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(reopenSession(h.ctx, session.id)).rejects.toThrow();
  expect(await h.db.sessions.get(session.id)).toEqual(original);
  expect(await h.db.outbox.count()).toBe(pending);
  await deleteWorkout(h.ctx, session.id);
  await expect(reopenSession(h.ctx, session.id)).rejects.toThrow('NOT_FOUND');
});

it('keeps completion feedback when sync only changes the timestamp representation', async () => {
  const h = await setup(), { session, sets } = await workout(h);
  await logSet(h.ctx, sets[0].id, {}); await finishSession(h.ctx, session.id); await h.sync.syncNow();
  const key = `workout-feedback:${session.id}`, feedback = { sessionId: session.id, text: 'Completed' };
  await h.db.meta.put({ key, value: feedback });
  const snapshot = structuredClone(await h.server.pullAll(h.userId));
  const row = snapshot.sessions.find(s => s.id === session.id)!;
  row.finished_at = (row.finished_at as string).replace('Z', '+00:00');
  vi.spyOn(h.server, 'pullAll').mockResolvedValueOnce(snapshot);
  await h.sync.pull();
  expect((await h.db.meta.get(key))?.value).toEqual(feedback);
  row.finished_at = new Date(Date.parse(row.finished_at as string) + 1000).toISOString();
  vi.spyOn(h.server, 'pullAll').mockResolvedValueOnce(snapshot);
  await h.sync.pull();
  expect(await h.db.meta.get(key)).toBeUndefined();
});

it('remote reopening clears completion feedback and stale pulls cannot close the reopened workout', async () => {
  const h = await setup(), { session, sets } = await workout(h);
  await logSet(h.ctx, sets[0].id, {}); await finishSession(h.ctx, session.id); await h.sync.syncNow();
  const old = structuredClone(await h.server.pullAll(h.userId));
  const remote = harness({ server: h.server, userId: h.userId, clock: h.clock }); instances.push(remote); await remote.sync.pull();
  await h.db.meta.put({ key: `workout-feedback:${session.id}`, value: { sessionId: session.id, text: 'Completed' } });
  await reopenSession(remote.ctx, session.id); await remote.sync.syncNow(); await h.sync.pull();
  expect(await h.db.meta.get(`workout-feedback:${session.id}`)).toBeUndefined();
  vi.spyOn(h.server, 'pullAll').mockResolvedValueOnce(old); await h.sync.pull();
  expect((await h.db.sessions.get(session.id))!.status).toBe('in_progress');
});

it('preserves the completed side of a partial set when continuing the other side', async () => {
  const h = await setup(), p = await previewNext(h.ctx);
  const session = await startSession(h.ctx, { ...p, exercises: [{ ...p.exercises[0], exerciseId: 'split_squat', sets: 1, kg: 20, reps: 7, configuration: defaultConfiguration('split_squat') }] });
  const set = (await h.db.sets.where('sessionId').equals(session.id).first())!;
  await recordPerformance(h.ctx, set.id, 'right', { actualGrams: 20000, actualReps: 7 });
  const right = (await h.db.sets.get(set.id))!.detail!.performances[0];
  await finishSession(h.ctx, session.id); await reopenSession(h.ctx, session.id);
  await recordPerformance(h.ctx, set.id, 'left', { actualGrams: 18000, actualReps: 6 });
  await finishSession(h.ctx, session.id);
  expect((await h.db.sets.get(set.id))!.detail!.performances.find(p => p.side === 'right')).toEqual(right);
  expect((await h.db.programs.toArray())[0].rotationIndex).toBe(1);
});
