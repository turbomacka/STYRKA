import { afterEach, describe, expect, it } from 'vitest';
import { harness, onboard, type Harness } from './appHarness';
import { addSet, editSet, finishSession, logSet, previewNext, recordPerformance, startSession, undoSet } from '../../src/application/training';
import { editPlannedSet } from '../../src/application/workout';
import { buildHistory } from '../../src/application/plannerInput';
import { deleteWorkout } from '../../src/application/deleteWorkout';
import { SyncEngine } from '../../src/application/sync';
import { defaultConfiguration } from '../../src/domain/trainingFlow';
import { eraseHealthData } from '../../src/application/privacy';
import { listSessions } from '../../src/application/history';

const instances: Harness[] = [];
afterEach(async () => {
  for (const h of instances.splice(0)) { h.sync.dispose(); await h.db.delete(); }
});
async function setup() {
  const h = harness(); instances.push(h); await onboard(h);
  const snapshot = await previewNext(h.ctx);
  const bench = snapshot.exercises.find(e => e.exerciseId === 'bench_press')!;
  const session = await startSession(h.ctx, { ...snapshot, exercises: [{ ...bench, kg: 80, reps: 7, sets: 3, calibration: false, configuration: defaultConfiguration('bench_press') }] });
  const sets = await h.db.sets.where('sessionId').equals(session.id).sortBy('ordinal');
  return { h, session, sets };
}
async function cache(h: Harness, own: string, depends: string, setId: string) {
  await h.db.meta.bulkPut([
    { key: `workout-feedback:${own}`, value: { sessionId: own, sourceSessionIds: [depends], sourceSetIds: [setId], text: 'Old facts' } },
    { key: `replanning:${own}:hash`, value: { sessionId: own, sourceSessionIds: [depends], sourceSetIds: [setId] } },
    { key: `feedback-choice:${own}`, value: { templateId: 'stable-template' } },
  ]);
}

describe('adaptive input provenance and derived feedback lifecycle', () => {
  it('a pull begun before finishing cannot hide an acknowledged workout from history', async () => {
    const { h, session, sets } = await setup();
    await recordPerformance(h.ctx, sets[0].id, 'both', { actualGrams: 80_000, actualReps: 7 });
    await h.sync.syncNow();
    const originalPull = h.server.pullAll.bind(h.server);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const captured = new Promise<void>(resolve => { started = resolve; });
    h.server.pullAll = async userId => {
      const snapshot = structuredClone(await originalPull(userId));
      started();
      await gate;
      return snapshot;
    };
    const pendingPull = h.sync.pull();
    await captured;
    try {
      await finishSession(h.ctx, session.id);
      await h.sync.syncNow();
      expect(await h.db.outbox.count()).toBe(0);
      expect((await h.db.sessions.get(session.id))?.status).toBe('partial');
    } finally {
      release();
      await pendingPull;
      h.server.pullAll = originalPull;
    }
    expect((await h.db.sessions.get(session.id))?.status).toBe('partial');
    expect((await listSessions(h.ctx)).map(s => s.session.id)).toContain(session.id);
    // Fresh remote reads must still be accepted after the overlapping pull.
    const fresh = structuredClone(await originalPull(h.userId));
    fresh.sessions.find(s => s.id === session.id)!.status = 'completed';
    h.server.pullAll = async () => fresh;
    await h.sync.pull();
    expect((await h.db.sessions.get(session.id))?.status).toBe('completed');
  });

  it('erasing health data removes derived prose and template choices without deleting performed sets', async () => {
    const { h, session, sets } = await setup();
    await logSet(h.ctx, sets[0].id, { actualGrams: 75_000 });
    await cache(h, session.id, session.id, sets[0].id);
    await h.db.meta.put({ key: 'unrelated-setting', value: true });
    await eraseHealthData(h.ctx);
    expect(await h.db.meta.get(`workout-feedback:${session.id}`)).toBeUndefined();
    expect(await h.db.meta.get(`replanning:${session.id}:hash`)).toBeUndefined();
    expect(await h.db.meta.get(`feedback-choice:${session.id}`)).toBeUndefined();
    expect((await h.db.sets.get(sets[0].id))?.actualGrams).toBe(75_000);
    expect((await h.db.meta.get('unrelated-setting'))?.value).toBe(true);
  });
  it('preserves original app targets through repeated plan edits and sync round-trip', async () => {
    const { h, sets } = await setup();
    await editPlannedSet(h.ctx, sets[0].id, { grams: 75_000, reps: 6 });
    await editPlannedSet(h.ctx, sets[0].id, { grams: 70_000 });
    await recordPerformance(h.ctx, sets[0].id, 'both', { actualGrams: 70_000, actualReps: 6, perceivedEffort: 'ok' });
    const saved = (await h.db.sets.get(sets[0].id))!;
    expect(saved.detail?.prescriptionOrigin).toMatchObject({ role: 'ordinary', original: { loadValue: 80, reps: 7 }, userEditedSides: ['both'] });
    expect(saved.targetGrams).toBe(70_000);
    const history = await buildHistory(h.db);
    expect(history[0].sets[0].provenance).toMatchObject({ source: 'user', original: { loadValue: 80, reps: 7 } });
    expect(history[0].sets[0].perceivedEffort).toBe('ok');
    await h.sync.syncNow(); await h.sync.pull();
    expect((await h.db.sets.get(saved.id))?.detail?.prescriptionOrigin).toEqual(saved.detail?.prescriptionOrigin);
  });

  it('marks extra sets without changing the ordinary set count or inventing legacy intent', async () => {
    const { h, session, sets } = await setup();
    const extra = await addSet(h.ctx, sets[0].sessionExerciseId);
    await recordPerformance(h.ctx, extra.id, 'both', { actualGrams: 80_000, actualReps: 7, perceivedEffort: 'easy' });
    await logSet(h.ctx, sets[0].id, { actualGrams: 75_000, actualReps: 7, perceivedEffort: 'ok' });
    const history = (await buildHistory(h.db)).find(x => x.sessionId === session.id)!;
    expect(history.sets.at(-1)?.provenance?.role).toBe('extra');
    expect(history.sets[0].provenance?.source).toBe('unknown');
    expect(history.plan.sets).toBe(3);
  });

  it('keeps side-specific originals and records only the explicitly edited side', async () => {
    const h = harness(); instances.push(h); await onboard(h);
    const snapshot = await previewNext(h.ctx);
    const p = { ...snapshot.exercises[0], exerciseId: 'split_squat' as const, kg: 20, reps: 8, sets: 2, configuration: defaultConfiguration('split_squat'), sideTargets: { left: { kg: 20, reps: 6 }, right: { kg: 22, reps: 8 } } };
    const session = await startSession(h.ctx, { ...snapshot, exercises: [p] });
    const first = (await h.db.sets.where('sessionId').equals(session.id).sortBy('ordinal'))[0];
    await editPlannedSet(h.ctx, first.id, { grams: 15_000, reps: 5 }, 'left');
    await recordPerformance(h.ctx, first.id, 'left', { actualGrams: 15_000, actualReps: 5, perceivedEffort: 'ok' });
    const d = (await h.db.sets.get(first.id))!.detail!;
    expect(d.prescriptionOrigin?.originalSides).toMatchObject({ left: { loadValue: 20, reps: 6 }, right: { loadValue: 22, reps: 8 } });
    expect(d.prescriptionOrigin?.userEditedSides).toEqual(['left']);
    expect(d.plannedSides?.right).toMatchObject({ grams: 22_000, reps: 8 });
  });

  it('correction invalidates dependent facts, preserves unrelated facts and a reusable template', async () => {
    const { h, session, sets } = await setup();
    await recordPerformance(h.ctx, sets[0].id, 'both', { actualGrams: 80_000, actualReps: 7, perceivedEffort: 'easy' });
    await cache(h, 'later-dependent', session.id, sets[0].id);
    await cache(h, 'unrelated', 'other-session', 'other-set');
    await h.db.meta.put({ key: 'recent-workout-feedback', value: ['stale legacy text'] });
    await editSet(h.ctx, sets[0].id, { actualGrams: 75_000 });
    expect(await h.db.meta.get('workout-feedback:later-dependent')).toBeUndefined();
    expect(await h.db.meta.get('replanning:later-dependent:hash')).toBeUndefined();
    expect(await h.db.meta.get('feedback-choice:later-dependent')).toBeDefined();
    expect(await h.db.meta.get('workout-feedback:unrelated')).toBeDefined();
    expect(await h.db.meta.get('recent-workout-feedback')).toBeUndefined();
    expect((await h.db.sets.get(sets[0].id))?.detail?.performances[0].effort).toBeNull();
    await undoSet(h.ctx, sets[0].id);
    expect(await buildHistory(h.db)).toEqual([]);
  });

  it('workout deletion removes own choices and downstream facts without leaving legacy replanning', async () => {
    const { h, session, sets } = await setup();
    await logSet(h.ctx, sets[0].id, {}); await finishSession(h.ctx, session.id);
    await cache(h, session.id, session.id, sets[0].id);
    await cache(h, 'later', session.id, sets[0].id);
    await h.db.meta.put({ key: `replanning:${session.id}:legacy`, value: { messages: ['old'] } });
    await deleteWorkout(h.ctx, session.id);
    expect(await h.db.meta.get(`feedback-choice:${session.id}`)).toBeUndefined();
    expect(await h.db.meta.get('workout-feedback:later')).toBeUndefined();
    expect(await h.db.meta.where('key').startsWith(`replanning:${session.id}:`).count()).toBe(0);
    expect(await buildHistory(h.db)).toEqual([]);
  });

  it('a newer server correction invalidates dependent feedback and older pulls cannot reverse it', async () => {
    const { h, session, sets } = await setup();
    await recordPerformance(h.ctx, sets[0].id, 'both', { actualGrams: 80_000, actualReps: 7 });
    await h.sync.syncNow();
    const b = harness({ server: h.server, clock: h.clock }); instances.push(b); b.ctx.userId = h.userId;
    const remoteSync = new SyncEngine(b.ctx);
    try {
      await remoteSync.pull();
      const oldSnapshot = structuredClone(await h.server.pullAll(h.userId));
      await cache(h, 'later', session.id, sets[0].id);
      await editSet(b.ctx, sets[0].id, { actualGrams: 75_000, perceivedEffort: 'ok' });
      await remoteSync.syncNow(); await h.sync.pull();
      expect((await h.db.sets.get(sets[0].id))?.actualGrams).toBe(75_000);
      expect(await h.db.meta.get('workout-feedback:later')).toBeUndefined();
      const original = h.server.pullAll.bind(h.server);
      h.server.pullAll = async () => oldSnapshot;
      await h.sync.pull(); h.server.pullAll = original;
      expect((await h.db.sets.get(sets[0].id))?.actualGrams).toBe(75_000);
    } finally { remoteSync.dispose(); }
  });
});
