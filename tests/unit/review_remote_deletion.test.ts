import { expect, it } from 'vitest';
import { harness, onboard } from './appHarness';

it('removes previously synced local restrictions after server-side deletion on another device', async () => {
  const h = harness();
  try {
    await onboard(h, { restrictions: [{ kind: 'block_exercise', exerciseA: 'squat', area: 'knee', side: 'both' }] });
    await h.sync.syncNow();
    await h.sync.pull();
    expect(await h.db.outbox.count()).toBe(0);
    expect(await h.db.restrictions.count()).toBe(1);
    // Simulate successful erasure from a second device, then a completed pull here.
    await h.server.eraseHealthData();
    expect((await h.server.pullAll(h.userId)).restrictions).toEqual([]);
    await h.sync.pull();
    expect(await h.db.restrictions.count()).toBe(0);
  } finally {
    h.sync.dispose();
    await h.db.delete();
  }
});
