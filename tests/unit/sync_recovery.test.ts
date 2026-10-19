import { expect, it, vi } from 'vitest';
import { deleteRestriction, saveRestriction } from '../../src/application/profile';
import { eraseHealthData, exportJson } from '../../src/application/privacy';
import { logSet, previewNext, reportSymptom, startSession } from '../../src/application/training';
import { TransportError } from '../../src/server/transport';
import { harness, onboard } from './appHarness';

it('removes remote health deletions, preserves queued changes and training, including legacy acknowledged rows', async () => {
  const h = harness();
  try {
    await onboard(h);
    const gone = await saveRestriction(h.ctx, { kind: 'block_exercise', exerciseA: 'squat', active: true });
    await reportSymptom(h.ctx, { sessionId: null, area: 'knee', side: 'both', reaction: 'transient' });
    await h.sync.refresh();
    expect((await h.db.restrictions.get(gone.id))?.syncState).toBe('synced');
    expect((await h.db.symptoms.toArray())[0].syncState).toBe('synced');
    // Uppgradering från versionen som inte markerade serverkvitterade upserts.
    await h.db.restrictions.update(gone.id, { syncState: 'queued' });
    const pending = await saveRestriction(h.ctx, { kind: 'block_exercise', exerciseA: 'bench_press', active: true });
    const session = await startSession(h.ctx, await previewNext(h.ctx));
    const set = (await h.db.sets.where('sessionId').equals(session.id).first())!;
    await logSet(h.ctx, set.id, { actualGrams: 20_000 });
    const queue = await h.db.outbox.toArray();
    await h.server.eraseHealthData();
    await h.sync.pull();
    expect(await h.db.restrictions.get(gone.id)).toBeUndefined();
    expect(await h.db.restrictions.get(pending.id)).toMatchObject({ syncState: 'queued' });
    expect(await h.db.symptoms.count()).toBe(0);
    expect(await h.db.outbox.toArray()).toEqual(queue);
    expect(await h.db.sets.get(set.id)).toMatchObject({ status: 'done', actualGrams: 20_000 });
    expect(JSON.stringify(await exportJson(h.ctx))).not.toContain(gone.id);
  } finally { h.sync.dispose(); await h.db.delete(); }
});

it('does not delete local data on failed fetch or a change made while the full snapshot was in flight', async () => {
  const h = harness();
  try {
    await onboard(h);
    const rule = await saveRestriction(h.ctx, { kind: 'limit_sets', exerciseA: 'squat', maxSets: 2, active: true });
    await h.sync.refresh();
    const original = h.server.pullAll.bind(h.server);
    const spy = vi.spyOn(h.server, 'pullAll').mockRejectedValueOnce(new TransportError('DB_UNAVAILABLE'));
    await expect(h.sync.pull()).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
    expect(await h.db.restrictions.get(rule.id)).toBeTruthy();
    expect((await h.sync.status()).pullState).toBe('error');
    spy.mockImplementationOnce(async () => {
      await saveRestriction(h.ctx, { kind: 'limit_sets', exerciseA: 'squat', maxSets: 3, active: true }, rule.id);
      return { ...await original(h.userId), restrictions: [] };
    });
    await h.sync.pull();
    expect(await h.db.restrictions.get(rule.id)).toMatchObject({ maxSets: 3, syncState: 'queued' });
    spy.mockRestore();
  } finally { h.sync.dispose(); await h.db.delete(); }
});

it('does not resurrect a pending local deletion or health erasure from the server', async () => {
  const h = harness();
  try {
    await onboard(h);
    const rule = await saveRestriction(h.ctx, { kind: 'block_exercise', exerciseA: 'squat', active: true });
    await reportSymptom(h.ctx, { sessionId: null, area: 'knee', side: 'both', reaction: 'transient' });
    await h.sync.refresh();
    await deleteRestriction(h.ctx, rule.id);
    await h.sync.pull();
    expect(await h.db.restrictions.count()).toBe(0);
    await eraseHealthData(h.ctx);
    await h.sync.pull();
    expect(await h.db.symptoms.count()).toBe(0);
    expect((await h.db.consents.get(h.userId))?.withdrawnAt).toBeTruthy();
    expect(await h.db.outbox.count()).toBeGreaterThan(0);
  } finally { h.sync.dispose(); await h.db.delete(); }
});

it('holds the queue on AUTH_REQUIRED and resumes the same events exactly once after authentication', async () => {
  const h = harness();
  try {
    await onboard(h);
    const session = await startSession(h.ctx, await previewNext(h.ctx));
    await h.sync.refresh();
    const set = (await h.db.sets.where('sessionId').equals(session.id).first())!;
    await logSet(h.ctx, set.id, {});
    const queuedId = (await h.db.outbox.toArray())[0].eventId;
    const send = vi.spyOn(h.server, 'applySetMutation').mockRejectedValueOnce(new TransportError('AUTH_REQUIRED'));
    await h.sync.refresh();
    expect((await h.sync.status()).state).toBe('auth_required');
    expect((await h.db.outbox.toArray())[0].eventId).toBe(queuedId);
    h.sync.request();
    expect(send).toHaveBeenCalledTimes(1);
    await h.sync.refresh();
    await h.sync.refresh();
    expect(await h.db.outbox.count()).toBe(0);
    expect(h.server.sets.size).toBe(await h.db.sets.count());
    expect([...h.server.sets.values()].filter((s)=>s.status==='done')).toHaveLength(1);
    expect(send.mock.calls.map((c) => c[0])).toEqual([queuedId, queuedId]);
    expect((await h.sync.status()).state).toBe('idle');
  } finally { h.sync.dispose(); await h.db.delete(); }
});

it('a successful in-flight pull never hides an authentication failure from a newer queued mutation', async () => {
  const h = harness();
  try {
    await onboard(h);
    const session = await startSession(h.ctx, await previewNext(h.ctx));
    await h.sync.refresh();
    const snapshot = await h.server.pullAll(h.userId);
    let release!: () => void;
    let started!: () => void;
    const pulling = new Promise<void>((resolve) => { started = resolve; });
    vi.spyOn(h.server, 'pullAll').mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return snapshot;
    });
    const pull = h.sync.pull();
    await pulling;
    const set = (await h.db.sets.where('sessionId').equals(session.id).first())!;
    await logSet(h.ctx, set.id, {});
    vi.spyOn(h.server, 'applySetMutation').mockRejectedValueOnce(new TransportError('AUTH_REQUIRED'));
    await h.sync.syncNow();
    release();
    await pull;
    expect((await h.sync.status()).state).toBe('auth_required');
    expect((await h.sync.status()).pullState).toBe('ready');
    expect(await h.db.outbox.count()).toBe(1);
    expect((await h.db.sets.get(set.id))?.status).toBe('done');
  } finally { h.sync.dispose(); await h.db.delete(); }
});
