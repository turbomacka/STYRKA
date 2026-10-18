import 'fake-indexeddb/auto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { StyrkaDB } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { SyncEngine } from '../../src/application/sync';
import { completeOnboarding, patchProfile } from '../../src/application/profile';
import { trainingPreferences } from '../../src/domain/trainingFlow';
import { previewNext } from '../../src/application/training';
import { ONBOARDING, TestClock } from '../unit/appHarness';
import { closeSql, newUser, sql, withProfile, type TestUser } from './dbHelpers';
import type { AppContext } from '../../src/application/context';

let a: TestUser, b: TestUser;
const dbs: StyrkaDB[] = [], syncs: SyncEngine[] = [];
beforeAll(async () => { a = await newUser('source-a'); b = await newUser('source-b'); await withProfile(b); });
afterAll(async () => { for (const s of syncs) s.dispose(); for (const db of dbs) await db.delete(); await sql('delete from auth.users where id=any($1::uuid[])', [[a.id, b.id]]); await closeSql(); });
it('round trips the source choice and retained inputs between devices through the existing profile JSON', async () => {
  const context = (): AppContext => {
    const db = new StyrkaDB(`test-intro-${randomUUID()}`); dbs.push(db);
    return { db, userId: a.id, transport: new SupabaseTransport(a.client), clock: new TestClock(), ids: { uuid: randomUUID }, isOnline: () => true };
  };
  const c1 = context(), c2 = context();
  const s1 = new SyncEngine(c1), s2 = new SyncEngine(c2); syncs.push(s1, s2);
  await completeOnboarding(c1, { ...ONBOARDING, loadRecommendationSource: 'performed_sets' });
  expect(await s1.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null });
  await s2.pull();
  expect((await c2.db.profile.get(a.id))?.trainingPreferences?.loadRecommendationSource).toBe('performed_sets');
  expect((await previewNext(c2)).exercises.find((e) => e.exerciseId === 'squat')?.kg).toBeNull();
  const entries = await c2.db.exerciseSettings.toArray();
  expect(entries.length).toBeGreaterThan(0);
  const other = await b.client.from('profiles').select('training_preferences').eq('user_id', a.id);
  expect(other.error).toBeNull(); expect(other.data).toEqual([]);
  await patchProfile(c2, { trainingPreferences: trainingPreferences({ loadRecommendationSource: 'strength_inputs' }) });
  expect(await s2.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null }); await s1.pull();
  expect((await previewNext(c1)).exercises.find((e) => e.exerciseId === 'squat')?.kg).toBeGreaterThan(0);
  expect(await c1.db.exerciseSettings.toArray()).toEqual(entries);
});
