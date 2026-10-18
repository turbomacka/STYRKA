import { afterEach, expect, it } from 'vitest';
import { deleteWorkout } from '../../src/application/deleteWorkout';
import { listSessions, strengthSeries } from '../../src/application/history';
import { exportJson } from '../../src/application/privacy';
import { finishSession, logSet, previewNext, startSession } from '../../src/application/training';
import { ordinarySequence, saveNote } from '../../src/application/trainingPlan';
import { harness, onboard, type Harness } from './appHarness';

const instances: Harness[] = [];
async function setup() { const h = harness(); instances.push(h); await onboard(h); return h; }
afterEach(async () => { for (const h of instances.splice(0)) { h.sync.dispose(); await h.db.delete(); } });
async function workout(h: Harness) {
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  const set = (await h.db.sets.where('sessionId').equals(s.id).toArray())[0];
  await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000, rir: 2 });
  await finishSession(h.ctx, s.id);
  h.clock.advanceHours(72);
  return { s, set };
}

it('removes workout, children, private note, pending mutations and statistics, but preserves subsequent pass numbers', async () => {
  const h = await setup();
  const { s, set } = await workout(h);
  const second = await workout(h);
  await saveNote(h.ctx, { targetType: 'session', sessionId: s.id }, 'privat anteckning');
  const programs = await h.db.programs.toArray();
  await deleteWorkout(h.ctx, s.id);
  expect(await h.db.sessions.get(s.id)).toBeUndefined();
  for (const table of [h.db.sets, h.db.sessionExercises, h.db.audits, h.db.notes]) expect(await table.where('sessionId').equals(s.id).count()).toBe(0);
  expect((await listSessions(h.ctx)).map((w) => w.session.id)).toEqual([second.s.id]);
  expect((await strengthSeries(h.ctx, set.exerciseId)).points.filter((p) => p.sessionId === s.id)).toEqual([]);
  expect(await h.db.programs.toArray()).toEqual(programs);
  expect((await ordinarySequence(h.ctx)).get(second.s.id)).toBe(2);
  expect((await h.db.outbox.where('recordId').equals(s.id).toArray()).map((e) => e.op.type)).toEqual(['deleteWorkout']);
  expect(JSON.stringify(await exportJson(h.ctx))).not.toContain('privat anteckning');
  await expect(saveNote(h.ctx, { targetType: 'session', sessionId: s.id }, 'late save')).rejects.toThrow('NOT_FOUND');
});

it('queues deletion offline, retries lost acknowledgements and remains deleted after reload/pull', async () => {
  const h = await setup(); const { s } = await workout(h);
  await h.sync.syncNow();
  h.server.online = false;
  await deleteWorkout(h.ctx, s.id);
  expect((await h.sync.syncNow()).stoppedBy).toBe('OFFLINE');
  h.server.online = true;
  h.server.dropNextAck = 1;
  expect((await h.sync.syncNow()).stoppedBy).toBe('OFFLINE');
  await h.sync.syncNow(); await h.sync.pull();
  expect(await h.db.outbox.count()).toBe(0);
  expect(await h.db.sessions.get(s.id)).toBeUndefined();
  expect(h.server.table('training_sessions').has(s.id)).toBe(false);
  await deleteWorkout(h.ctx, s.id); // Idempotent double tap.
  expect(await h.db.outbox.count()).toBe(0);
});

it('reconciles deletion from another device despite local pending changes', async () => {
  const h = await setup(); const { s, set } = await workout(h);
  await h.sync.syncNow();
  await saveNote(h.ctx, { targetType: 'session', sessionId: s.id }, 'unsynced note');
  await h.server.deleteWorkout(s.id, 1);
  await h.sync.pull();
  expect(await h.db.sessions.get(s.id)).toBeUndefined();
  expect(await h.db.sets.get(set.id)).toBeUndefined();
  expect(await h.db.notes.count()).toBe(0);
  expect(await h.db.outbox.count()).toBe(0);
});

it('does not resurrect local deletion from an earlier in-flight snapshot', async () => {
  const h = await setup(); const { s } = await workout(h); await h.sync.syncNow();
  const snapshot = await h.server.pullAll(h.userId);
  await deleteWorkout(h.ctx, s.id);
  h.server.pullAll = async () => snapshot;
  await h.sync.pull();
  expect(await h.db.sessions.count()).toBe(0);
  expect(await h.db.sets.count()).toBe(0);
  expect(await h.db.audits.count()).toBe(0);
  expect((await h.db.outbox.toArray()).some((e) => e.op.type === 'deleteWorkout')).toBe(true);
});

it('blocks deletion of active workouts', async () => {
  const h = await setup(); const s = await startSession(h.ctx, await previewNext(h.ctx));
  await expect(deleteWorkout(h.ctx, s.id)).rejects.toThrow('INVALID_STATE');
  expect(await h.db.sessions.get(s.id)).toBeDefined();
});

it('preserves health reports and cleans derived calibration references', async () => {
  const h = await setup(); const { s, set } = await workout(h);
  await h.db.calibrations.put({ id: 'calibration', exerciseId: set.exerciseId, variantKey: 'default', familiarity: 'familiar', quality: 'calibrated', observations: [set.id], calibratedAt: h.clock.now(), updatedAt: h.clock.now(), syncState: 'synced' });
  // Use real symptom workflow so both local and queued links are verified.
  const { reportSymptom } = await import('../../src/application/training');
  await reportSymptom(h.ctx, { sessionId: s.id, area: 'knee', side: 'both', reaction: 'persistent' });
  await deleteWorkout(h.ctx, s.id);
  expect((await h.db.symptoms.toArray())[0].sessionId).toBeNull();
  const queued = (await h.db.outbox.toArray()).find((e) => e.op.type === 'upsert' && e.op.table === 'symptom_reports');
  expect(queued?.op.type === 'upsert' && queued.op.row.session_id).toBeNull();
  expect(await h.db.calibrations.get('calibration')).toMatchObject({ familiarity: 'familiar', quality: 'none', observations: [], calibratedAt: null });
});
