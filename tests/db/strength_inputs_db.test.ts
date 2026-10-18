import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { StyrkaDB } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { SyncEngine } from '../../src/application/sync';
import type { AppContext } from '../../src/application/context';
import { completeOnboarding, setStrengthInputs, strengthInputsFromSettings } from '../../src/application/profile';
import { toUserSettings } from '../../src/application/plannerInput';
import { ONBOARDING, TestClock } from '../unit/appHarness';
import { closeSql, newUser, sql, withProfile, type TestUser } from './dbHelpers';
import type { StrengthInput } from '../../src/domain/strengthInputs';

let a: TestUser, b: TestUser;
const dbs: StyrkaDB[] = [], syncs: SyncEngine[] = [];
beforeAll(async () => { a = await newUser('strength-a'); b = await newUser('strength-b'); await withProfile(b); });
afterAll(async () => { for (const s of syncs) s.dispose(); for (const d of dbs) await d.delete(); await sql('delete from auth.users where id=any($1::uuid[])', [[a.id, b.id]]); await closeSql(); });

it('real offline queue, two devices, legacy preservation, owner isolation and clearing', async () => {
  const clock = new TestClock();
  const context = (): AppContext => {
    const db = new StyrkaDB(`test-strength-${randomUUID()}`); dbs.push(db);
    return { db, userId: a.id, transport: new SupabaseTransport(a.client), clock, ids: { uuid: randomUUID }, isOnline: () => true };
  };
  const c1 = context(), c2 = context();
  const s1 = new SyncEngine(c1), s2 = new SyncEngine(c2); syncs.push(s1, s2);
  await completeOnboarding(c1, ONBOARDING); await s1.syncNow(); await s2.pull();
  const legacy = (await c2.db.exerciseSettings.where('exerciseId').equals('squat').first())!;
  expect(legacy.strengthInputs).toBeUndefined();
  const inputs: StrengthInput[] = [...strengthInputsFromSettings(legacy),
    { kind: '3rm', grams: 110_000, reps: null, rir: null, measured: false, testedAt: null },
    { kind: 'submax', grams: 100_000, reps: 5, rir: 1, measured: false, testedAt: null }];
  c2.isOnline = () => false;
  await setStrengthInputs(c2, 'squat', inputs);
  expect(await c2.db.outbox.count()).toBeGreaterThan(0);
  c2.isOnline = () => true;
  expect(await s2.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null }); await s1.pull();
  expect((await c1.db.exerciseSettings.get(legacy.id))?.strengthInputs).toEqual(inputs);
  const remote = await a.client.from('user_exercise_profiles').select('*').eq('id', legacy.id).single();
  expect(remote.error).toBeNull(); expect(remote.data.strength_inputs).toEqual(inputs);
  expect((await b.client.from('user_exercise_profiles').select('id').eq('id', legacy.id)).data).toEqual([]);
  expect((await b.client.from('user_exercise_profiles').update({ strength_inputs: [] }).eq('id', legacy.id).select('id')).data).toEqual([]);
  expect((await a.client.from('user_exercise_profiles').update({ user_id: b.id }).eq('id', legacy.id)).error).not.toBeNull();
  await setStrengthInputs(c1, 'squat', []); await s1.syncNow(); await s2.pull();
  const cleared = (await c2.db.exerciseSettings.get(legacy.id))!;
  expect(cleared.strengthInputs).toEqual([]); expect(toUserSettings(cleared).estimate).toBeNull();
});

it('server rejects malformed, repeated, out-of-range or impossible dated inputs', async () => {
  const id = randomUUID();
  const valid: StrengthInput = { kind: '1rm', grams: 100_000, reps: null, rir: null, measured: true, testedAt: '2026-10-01' };
  const row = { id, user_id: b.id, exercise_slug: 'bench_press', strength_inputs: [valid] };
  expect((await b.client.from('user_exercise_profiles').insert(row)).error).toBeNull();
  for (const invalid of [[valid, valid], [{ ...valid, grams: -1 }], [{ ...valid, grams: 1.5 }], [{ ...valid, testedAt: '2026-02-30' }], [{ ...valid, testedAt: '2099-01-01' }], [{ ...valid, kind: 'submax', reps: 5, rir: 9 }], { value: valid }]) {
    expect((await b.client.from('user_exercise_profiles').update({ strength_inputs: invalid }).eq('id', id)).error?.code).toBe('23514');
  }
  expect((await b.client.from('user_exercise_profiles').select('strength_inputs').eq('id', id).single()).data?.strength_inputs).toEqual([valid]);
});
