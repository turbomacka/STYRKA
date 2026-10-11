/** ÄA-BAL-001 mot verklig lokal Supabase: RLS för balance_suggestion_decisions (BAL07) och kaskad vid kontoradering. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, closeSql, newUser, sql, withProfile, type TestUser } from './dbHelpers';

let A: TestUser;
let B: TestUser;
let id: string;
const row = (u: TestUser, over: Record<string, unknown> = {}) => ({ id: randomUUID(), user_id: u.id, candidate_key: 'a'.repeat(64), basis_key: 'b'.repeat(64), pattern_id: 'horizontal_pull', status: 'dismissed', policy_version: 'balance-decisions/1.0.0', event_id: randomUUID(), ...over });

beforeAll(async () => {
  A = await newUser('bal-a');
  B = await newUser('bal-b');
  await withProfile(A);
  await withProfile(B);
  const r = row(A);
  id = r.id;
  expect((await A.client.from('balance_suggestion_decisions').insert(r)).error).toBeNull();
});
afterAll(async () => {
  await closeSql();
});

describe('BAL07: balansbeslut isolerade per konto', () => {
  it('A ser sitt beslut; B och anon ser inget', async () => {
    expect((await A.client.from('balance_suggestion_decisions').select('id')).data).toEqual([{ id }]);
    expect((await B.client.from('balance_suggestion_decisions').select('*').eq('user_id', A.id)).data ?? []).toEqual([]);
    expect((await anonClient().from('balance_suggestion_decisions').select('*')).data ?? []).toEqual([]);
  });

  it('B kan inte skapa med A:s user_id, ändra eller radera A:s beslut; ogiltiga värden nekas', async () => {
    expect((await B.client.from('balance_suggestion_decisions').insert(row({ ...B, id: A.id }))).error).not.toBeNull();
    await B.client.from('balance_suggestion_decisions').update({ status: 'accepted' }).eq('id', id);
    await B.client.from('balance_suggestion_decisions').delete().eq('id', id);
    expect((await sql(`select status from public.balance_suggestion_decisions where id=$1`, [id]))[0].status).toBe('dismissed');
    expect((await A.client.from('balance_suggestion_decisions').insert(row(A, { candidate_key: 'c'.repeat(64), pattern_id: 'muscle_balance' }))).error).not.toBeNull();
    expect((await A.client.from('balance_suggestion_decisions').insert(row(A, { candidate_key: 'd'.repeat(64), status: 'risk' }))).error).not.toBeNull();
    // En rad per kandidat och användare.
    expect((await A.client.from('balance_suggestion_decisions').insert(row(A))).error).not.toBeNull();
    // Samma kandidatnyckel hos B är tillåten (egen rad).
    expect((await B.client.from('balance_suggestion_decisions').insert(row(B))).error).toBeNull();
  });

  it('kontoradering tar även bort balansbeslut', async () => {
    const C = await newUser('bal-c');
    await withProfile(C);
    await C.client.from('balance_suggestion_decisions').insert(row(C));
    expect((await C.client.rpc('delete_my_account')).error).toBeNull();
    expect((await sql(`select count(*)::int n from public.balance_suggestion_decisions where user_id=$1`, [C.id]))[0].n).toBe(0);
  });
});
