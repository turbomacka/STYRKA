import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { SyncEngine } from '../../src/application/sync';
import { exportJson } from '../../src/application/privacy';
import { logSet, previewNext, reportSymptom, startSession } from '../../src/application/training';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { harness, onboard } from '../unit/appHarness';
import { anonClient, newUser } from './dbHelpers';

it('another device erases health data in real Supabase; a full pull removes it locally and preserves an unsent set', async () => {
  const user = await newUser('health-sync-review');
  const h = harness({ userId: user.id });
  h.ctx.transport = new SupabaseTransport(user.client);
  const sync = new SyncEngine(h.ctx);
  const second = anonClient();
  try {
    await onboard(h, { restrictions: [{ kind: 'block_exercise', exerciseA: 'squat', area: 'knee', side: 'both' }] });
    await reportSymptom(h.ctx, { sessionId: null, area: 'knee', side: 'both', reaction: 'transient' });
    const session = await startSession(h.ctx, await previewNext(h.ctx));
    await sync.refresh();
    expect(await h.db.symptoms.count()).toBe(1);
    expect(await h.db.restrictions.count()).toBe(1);
    const set = (await h.db.sets.where('sessionId').equals(session.id).first())!;
    await logSet(h.ctx, set.id, { actualGrams: 20_000 });
    const pending = await h.db.outbox.toArray();
    const login = await second.auth.signInWithPassword({ email: user.email, password: 'Testlosen-123!' });
    expect(login.error).toBeNull();
    await new SupabaseTransport(second).eraseHealthData();
    await sync.pull();
    expect(await h.db.restrictions.count()).toBe(0);
    expect(await h.db.symptoms.count()).toBe(0);
    expect((await h.db.consents.get(user.id))?.withdrawnAt).toBeTruthy();
    expect(await h.db.outbox.toArray()).toEqual(pending);
    expect(await h.db.sets.get(set.id)).toMatchObject({ status: 'done', actualGrams: 20_000 });
    const exported = await exportJson(h.ctx);
    expect(exported.restrictions).toEqual([]);
    expect(exported.symptomReports).toEqual([]);
    await sync.refresh();
    expect(await h.db.outbox.count()).toBe(0);
    const rows = await user.client.from('training_sets').select('id').eq('id', set.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
  } finally {
    sync.dispose(); h.sync.dispose(); await h.db.delete();
    await h.ctx.transport.deleteAccount();
  }
});
