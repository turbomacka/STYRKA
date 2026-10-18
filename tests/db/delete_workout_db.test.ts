import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { anonClient, closeSql, mutate, newUser, sessionWithExercise, setPayload, sql, withProfile, type TestUser } from './dbHelpers';

let a: TestUser, b: TestUser;
beforeAll(async () => { a = await newUser('delete-a'); b = await newUser('delete-b'); await withProfile(a); await withProfile(b); });
afterAll(async () => { await sql('delete from auth.users where id = any($1::uuid[])', [[a.id, b.id]]); await closeSql(); });

it('atomically deletes contents, retains symptoms, is idempotent and prevents stale-device resurrection', async () => {
  const { sessionId, seId } = await sessionWithExercise(a);
  const setId = randomUUID(), noteId = randomUUID(), auditId = randomUUID(), symptomId = randomUUID(), calId = randomUUID();
  expect((await mutate(a, randomUUID(), setId, null, setPayload(seId))).status).toBe('applied');
  await sql("insert into public.symptom_reports(id,user_id,session_id,area,reaction) values($1,$2,$3,'knee','persistent')", [symptomId, a.id, sessionId]);
  expect((await a.client.from('notebook_notes').insert({ id: noteId, user_id: a.id, target_type: 'session', session_id: sessionId, body: 'private' })).error).toBeNull();
  expect((await a.client.from('recommendation_audits').insert({ id: auditId, user_id: a.id, session_id: sessionId, engine_version: '1', inputs_hash: 'x', plan_snapshot: {} })).error).toBeNull();
  const calibration = { id: calId, user_id: a.id, exercise_slug: 'bench_press', variant_key: randomUUID(), quality: 'calibrating', observations: [setId] };
  expect((await a.client.from('user_exercise_calibrations').insert(calibration)).error).toBeNull();
  expect((await a.client.rpc('delete_training_session', { p_session_id: sessionId, p_sequence: 1 })).error).toBeNull();
  expect((await a.client.rpc('delete_training_session', { p_session_id: sessionId, p_sequence: 2 })).error).toBeNull();
  for (const [table, id] of [['training_sessions', sessionId], ['session_exercises', seId], ['training_sets', setId], ['notebook_notes', noteId], ['recommendation_audits', auditId]]) {
    expect(await sql(`select id from public.${table} where id=$1`, [id])).toEqual([]);
  }
  expect((await sql('select session_id,reaction from public.symptom_reports where id=$1', [symptomId]))[0]).toEqual({ session_id: null, reaction: 'persistent' });
  expect((await a.client.from('deleted_training_sessions').select('sequence').eq('id', sessionId).single()).data).toEqual({ sequence: 1 });
  expect((await a.client.from('training_sessions').upsert({ id: sessionId, user_id: a.id, kind: 'planned', status: 'completed' })).error?.code).toBe('23514');
  expect((await a.client.from('user_exercise_calibrations').upsert(calibration)).error).toBeNull();
  expect((await a.client.from('user_exercise_calibrations').select('quality,observations').eq('id', calId).single()).data).toEqual({ quality: 'none', observations: [] });
});

it('protects another account and the deletion ledger from direct writes and anonymous calls', async () => {
  const { sessionId } = await sessionWithExercise(a);
  expect((await b.client.rpc('delete_training_session', { p_session_id: sessionId })).error?.code).toBe('42501');
  expect((await anonClient().rpc('delete_training_session', { p_session_id: sessionId })).error).not.toBeNull();
  expect((await sql('select id from public.training_sessions where id=$1', [sessionId]))).toHaveLength(1);
  expect((await a.client.rpc('delete_training_session', { p_session_id: sessionId })).error).toBeNull();
  expect((await b.client.from('deleted_training_sessions').select('*')).data).toEqual([]);
  expect((await b.client.rpc('delete_training_session', { p_session_id: sessionId })).error?.code).toBe('42501');
  expect((await a.client.from('deleted_training_sessions').delete().eq('id', sessionId)).error).not.toBeNull();
  expect((await a.client.from('deleted_training_sessions').insert({ id: randomUUID(), user_id: a.id })).error).not.toBeNull();
});

it('accepts an offline-created workout deletion before the first upload and blocks later stale creation', async () => {
  const id = randomUUID();
  expect((await a.client.rpc('delete_training_session', { p_session_id: id })).error).toBeNull();
  expect((await a.client.from('training_sessions').insert({ id, user_id: a.id, kind: 'extra', status: 'partial' })).error?.code).toBe('23514');
});
