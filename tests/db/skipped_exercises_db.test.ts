import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { StyrkaDB } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { SyncEngine } from '../../src/application/sync';
import type { AppContext } from '../../src/application/context';
import { completeOnboarding } from '../../src/application/profile';
import { finishSession, logSet, previewNext, startSession } from '../../src/application/training';
import { acceptCatchUp, catchUpOverview, skipExercise } from '../../src/application/skippedExercises';
import { deleteWorkout } from '../../src/application/deleteWorkout';
import { ONBOARDING, TestClock } from '../unit/appHarness';
import { anonClient, closeSql, newUser, sessionWithExercise, sql, withProfile, type TestUser } from './dbHelpers';

let a: TestUser, b: TestUser;
const dbs: StyrkaDB[] = [], syncs: SyncEngine[] = [];
beforeAll(async () => { a = await newUser('skip-a'); b = await newUser('skip-b'); await withProfile(b); });
afterAll(async () => { for (const s of syncs) s.dispose(); for (const d of dbs) await d.delete(); await sql('delete from auth.users where id=any($1::uuid[])', [[a.id, b.id]]); await closeSql(); });

it('real sync between two devices, immutable events, and source deletion cascade', async () => {
  const clock = new TestClock();
  const context = (): AppContext => {
    const db = new StyrkaDB(`test-skip-${randomUUID()}`); dbs.push(db);
    return { db, userId: a.id, transport: new SupabaseTransport(a.client), clock, ids: { uuid: randomUUID }, isOnline: () => true };
  };
  const c1 = context(), c2 = context();
  const s1 = new SyncEngine(c1), s2 = new SyncEngine(c2); syncs.push(s1, s2);
  await completeOnboarding(c1, ONBOARDING);
  const session = await startSession(c1, await previewNext(c1));
  const first = (await c1.db.sets.where('sessionId').equals(session.id).toArray()).find((s) => s.exerciseId === 'squat')!;
  await logSet(c1, first.id, { actualGrams: first.targetGrams!, rir: 2 });
  const source = (await c1.db.sessionExercises.where('sessionId').equals(session.id).toArray()).find((e) => e.exerciseId === 'cable_lateral_raise')!;
  await skipExercise(c1, source.id, 'time');
  await finishSession(c1, session.id); clock.advanceHours(72);
  expect(await s1.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null });
  await s2.pull();
  const proposal = (await catchUpOverview(c2)).proposal;
  expect(proposal).not.toBeNull();
  await acceptCatchUp(c2, proposal!);
  expect(await s2.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null });
  await s1.pull();
  expect((await previewNext(c1)).catchUp?.exerciseId).toBe('cable_lateral_raise');
  const row = (await a.client.from('exercise_skip_events').select('*').eq('action', 'accepted').single()).data!;
  expect((await a.client.from('exercise_skip_events').update({ reason: 'other' }).eq('id', row.id)).error).not.toBeNull();
  expect((await b.client.from('exercise_skip_events').select('*')).data).toEqual([]);
  expect((await anonClient().from('exercise_skip_events').select('*')).error).not.toBeNull();
  const bs = await sessionWithExercise(b);
  expect((await b.client.from('exercise_skip_events').insert({ ...row, id: randomUUID(), user_id: b.id, session_id: bs.sessionId, program_id: null, action: 'skipped', target_rotation_index: null, replaces_exercise_slug: null })).error).not.toBeNull();
  await deleteWorkout(c1, session.id); await s1.syncNow(); await s2.pull();
  expect(await c2.db.skipEvents.count()).toBe(0);
  expect((await a.client.from('exercise_skip_events').select('id')).data).toEqual([]);
  expect((await previewNext(c2)).catchUp).toBeUndefined();
});

it('discomfort requires consent; health erasure deletes skip explanations and decisions', async () => {
  const { sessionId, seId } = await sessionWithExercise(b);
  const row = { id: randomUUID(), user_id: b.id, session_id: sessionId, session_exercise_id: seId, reason: 'discomfort', action: 'skipped', created_at: new Date().toISOString() };
  expect((await b.client.from('exercise_skip_events').insert(row)).error?.code).toBe('42501');
  expect((await b.client.from('health_consents').insert({ user_id: b.id, granted_at: new Date().toISOString(), consent_version: 'test' })).error).toBeNull();
  expect((await b.client.from('exercise_skip_events').insert(row)).error).toBeNull();
  expect((await b.client.rpc('erase_health_data')).error).toBeNull();
  expect((await b.client.from('exercise_skip_events').select('id')).data).toEqual([]);
  expect((await b.client.from('exercise_skip_events').insert({ ...row, id: randomUUID() })).error?.code).toBe('42501');
});
