/**
 * ÄA-PLAN-001 mot verklig lokal Supabase: migration 006 (plan_revisions, notebook_notes), RLS mellan konton (PL21),
 * append-only revisioner, villkorad anteckningssparning (PL19/PL20) och hälsoradering av anteckningar (PL27).
 */
import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openUserDb } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import type { AppContext } from '../../src/application/context';
import { SyncEngine } from '../../src/application/sync';
import { completeOnboarding, GYM_STANDARD } from '../../src/application/profile';
import { finishSession, logSet, previewNext, startSession } from '../../src/application/training';
import { getFuturePlan, refreshFuturePlan, saveNote } from '../../src/application/trainingPlan';
import { anonClient, closeSql, newUser, sessionWithExercise, sql, withProfile, type TestUser } from './dbHelpers';

let A: TestUser;
let B: TestUser;
let aSession: { sessionId: string; seId: string };
let revId: string;
let noteId: string;

function revision(u: TestUser, over: Record<string, unknown> = {}) {
  const id = randomUUID();
  return { id, user_id: u.id, base_sequence: 1, horizon: 72, change_type: 'INITIAL', reason_codes: ['INITIAL'], summary: 'x', inputs_hash: 'a'.repeat(64), content_hash: 'b'.repeat(64), engine_version: '1.0.0', planner_version: 'p', ruleset_version: 'r', catalog_version: 'c', substitution_catalog_version: 's', slots: [], ...over };
}

beforeAll(async () => {
  A = await newUser('plan-a');
  B = await newUser('plan-b');
  await withProfile(A);
  await withProfile(B);
  aSession = await sessionWithExercise(A);
  const r = revision(A);
  revId = r.id;
  expect((await A.client.from('plan_revisions').insert(r)).error).toBeNull();
  noteId = randomUUID();
  expect((await A.client.from('notebook_notes').insert({ id: noteId, user_id: A.id, target_type: 'session', session_id: aSession.sessionId, body: 'Knät trött efteråt' })).error).toBeNull();
});

afterAll(async () => {
  await closeSql();
});

describe('PL21: två konton – plan, revisioner och anteckningar isolerade', () => {
  it('A ser sina rader; B och anon ser inget', async () => {
    for (const t of ['plan_revisions', 'notebook_notes']) {
      expect((await A.client.from(t).select('id')).data!.length, t).toBeGreaterThan(0);
      expect((await B.client.from(t).select('*').eq('user_id', A.id)).data ?? [], t).toEqual([]);
      expect((await anonClient().from(t).select('*')).data ?? [], t).toEqual([]);
    }
  });

  it('B kan inte skapa med A:s user_id, ändra eller radera A:s anteckning, eller koppla anteckning till A:s pass', async () => {
    expect((await B.client.from('plan_revisions').insert(revision({ ...B, id: A.id }))).error).not.toBeNull();
    expect((await B.client.from('notebook_notes').insert({ id: randomUUID(), user_id: A.id, target_type: 'slot', slot_sequence: 3, body: 'x' })).error).not.toBeNull();
    await B.client.from('notebook_notes').update({ body: 'kapad' }).eq('id', noteId);
    await B.client.from('notebook_notes').delete().eq('id', noteId);
    expect((await sql(`select body from public.notebook_notes where id=$1`, [noteId]))[0].body).toBe('Knät trött efteråt');
    // Sammansatt FK: egen user_id men annans pass nekas.
    expect((await B.client.from('notebook_notes').insert({ id: randomUUID(), user_id: B.id, target_type: 'session', session_id: aSession.sessionId, body: 'x' })).error).not.toBeNull();
  });

  it('revisioner är append-only; anteckningar validerar mål och längd (≤ 2 000 tecken)', async () => {
    expect((await A.client.from('plan_revisions').update({ summary: 'ändrad' }).eq('id', revId)).error).not.toBeNull();
    expect((await A.client.from('plan_revisions').delete().eq('id', revId)).error).not.toBeNull();
    expect((await sql(`select summary from public.plan_revisions where id=$1`, [revId]))[0].summary).toBe('x');
    expect((await A.client.from('notebook_notes').insert({ id: randomUUID(), user_id: A.id, target_type: 'slot', slot_sequence: 9, body: 'x'.repeat(2001) })).error).not.toBeNull();
    expect((await A.client.from('notebook_notes').insert({ id: randomUUID(), user_id: A.id, target_type: 'slot', body: 'utan mål' })).error).not.toBeNull();
    expect((await A.client.from('notebook_notes').insert({ id: randomUUID(), user_id: A.id, target_type: 'slot', slot_sequence: 9, body: 'x'.repeat(2000) })).error).toBeNull();
    // En anteckning per passplats.
    expect((await A.client.from('notebook_notes').insert({ id: randomUUID(), user_id: A.id, target_type: 'slot', slot_sequence: 9, body: 'dubblett' })).error).not.toBeNull();
  });

  it('PL27: erase_health_data raderar anteckningar men inte träningsdata', async () => {
    const C = await newUser('plan-c');
    await withProfile(C);
    const s = await sessionWithExercise(C);
    await C.client.from('notebook_notes').insert({ id: randomUUID(), user_id: C.id, target_type: 'session', session_id: s.sessionId, body: 'Ont i axeln' });
    const r = await C.client.rpc('erase_health_data');
    expect(r.data).toMatchObject({ status: 'applied', notebookNotes: 1 });
    expect((await sql(`select count(*)::int n from public.notebook_notes where user_id=$1`, [C.id]))[0].n).toBe(0);
    expect((await sql(`select count(*)::int n from public.session_exercises where user_id=$1`, [C.id]))[0].n).toBe(1);
    // A:s anteckningar orörda.
    expect((await sql(`select count(*)::int n from public.notebook_notes where user_id=$1`, [A.id]))[0].n).toBeGreaterThan(0);
  });
});

describe('appflöde mot verklig server', () => {
  it('plan, pass, anteckning synkas; förlorad kvittens ger en uppdatering; samtidig ändring ⇒ konflikt; ny enhet hämtar allt', async () => {
    const U = await newUser('plan-app');
    const mk = (name: string): AppContext => ({ db: name === 'a' ? openUserDb(U.id) : new (openUserDb(U.id).constructor as new (n: string) => ReturnType<typeof openUserDb>)(`styrka_${U.id}_${name}`), userId: U.id, transport: new SupabaseTransport(U.client), clock: { now: () => new Date().toISOString() }, ids: { uuid: () => randomUUID() }, isOnline: () => true });
    const a = mk('a');
    const syncA = new SyncEngine(a);
    await completeOnboarding(a, { adultConfirmed: true, plannedSessionsPerWeek: 2, minutesPerSession: 45, experience: 'intermediate', equipment: GYM_STANDARD, goals: { squat: 1, bench_press: 1, deadlift: 1 }, estimates: [{ exerciseId: 'squat', kind: '1rm', grams: 100_000 }], healthConsent: false, restrictions: [] });
    await refreshFuturePlan(a);
    const s = await startSession(a, await previewNext(a));
    for (const set of await a.db.sets.where('sessionId').equals(s.id).toArray()) await logSet(a, set.id, { actualGrams: set.targetGrams ?? 20_000 });
    await finishSession(a, s.id);
    const plan = (await getFuturePlan(a, 36))!;
    expect(plan.revision.changeType).toBe('SESSION_COMPLETED');
    await saveNote(a, { targetType: 'session', sessionId: s.id }, 'Bra pass');
    await saveNote(a, { targetType: 'slot', slotSequence: 5 }, 'Testa tidigare start');
    const r = await syncA.syncNow();
    expect([r.stoppedBy, r.rejected, r.conflicts]).toEqual([null, 0, 0]);
    expect((await sql(`select count(*)::int n from public.plan_revisions where user_id=$1`, [U.id]))[0].n).toBe(2);
    expect((await sql(`select body, revision from public.notebook_notes where user_id=$1 and target_type='session'`, [U.id]))[0]).toEqual({ body: 'Bra pass', revision: 1 });
    // Idempotens: samma villkorade mutation två gånger (som efter förlorad kvittens) ⇒ en logisk uppdatering.
    const tr = new SupabaseTransport(U.client);
    const row = { id: (await a.db.notes.where('targetType').equals('slot').first())!.id, user_id: U.id, target_type: 'slot', slot_sequence: 5, session_id: null, body: 'Ny text', updated_at: new Date().toISOString() };
    expect(await tr.saveNote(row, 1)).toMatchObject({ status: 'applied', revision: 2 });
    const again = await tr.saveNote(row, 1);
    expect(again.status).toBe('conflict');
    expect(again.status === 'conflict' && again.server.body).toBe('Ny text'); // klientens synk tolkar samma text som redan tillämpad
    // Ny enhet hämtar plan, revisioner och anteckningar.
    const b = mk('b');
    await new SyncEngine(b).pull();
    expect(await b.db.planRevisions.count()).toBe(2);
    expect((await b.db.notes.toArray()).map((n) => n.body).sort()).toEqual(['Bra pass', 'Ny text']);
    // Kontoradering tar även bort de nya tabellerna.
    expect((await U.client.rpc('delete_my_account')).error).toBeNull();
    for (const t of ['plan_revisions', 'notebook_notes']) expect((await sql(`select count(*)::int n from public.${t} where user_id=$1`, [U.id]))[0].n, t).toBe(0);
  });
});
