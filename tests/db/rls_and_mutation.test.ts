/**
 * G3/G4: RLS-negativtester och atomisk, idempotent setmutation mot verklig lokal Supabase (Postgres 17 + GoTrue + PostgREST).
 * Acceptanstest 04 §2.1: 30, 31, 33, 34, 36 samt fixturfall P09, P10, P11.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, closeSql, mutate, newUser, sessionWithExercise, setPayload, sql, withProfile, type TestUser } from './dbHelpers';

let A: TestUser;
let B: TestUser;
let aSe: { sessionId: string; seId: string };
let aSetId: string;

const USER_TABLES = ['profiles', 'user_equipment', 'user_exercise_profiles', 'health_consents', 'restriction_rules', 'programs', 'training_sessions', 'session_exercises', 'training_sets', 'symptom_reports', 'recommendation_audits', 'mutation_receipts'];

beforeAll(async () => {
  A = await newUser('a');
  B = await newUser('b');
  await withProfile(A);
  await withProfile(B);
  aSe = await sessionWithExercise(A);
  aSetId = randomUUID();
  const r = await mutate(A, randomUUID(), aSetId, null, setPayload(aSe.seId));
  expect(r.status).toBe('applied');
  await A.client.from('health_consents').insert({ user_id: A.id, consent_version: 'HC-1', granted_at: new Date().toISOString() });
  await A.client.from('symptom_reports').insert({ user_id: A.id, area: 'knee', side: 'left', reaction: 'transient' });
  await A.client.from('restriction_rules').insert({ user_id: A.id, rule_kind: 'block_pair_heavy', exercise_a: 'squat', exercise_b: 'deadlift' });
  await A.client.from('recommendation_audits').insert({ user_id: A.id, session_id: aSe.sessionId, engine_version: '1.0.0', inputs_hash: 'x', reason_codes: ['T'], plan_snapshot: {} });
  await A.client.from('user_equipment').insert({ user_id: A.id, equipment_slug: 'rack' });
  await A.client.from('user_exercise_profiles').insert({ user_id: A.id, exercise_slug: 'squat', estimate_kg: '100.000', estimate_kind: '1rm' });
  await A.client.from('programs').insert({ user_id: A.id, template: '2', version: '1.0.0' });
});

afterAll(async () => {
  await closeSql();
});

describe('33/P10: två konton – B kan aldrig läsa, skapa, ändra eller radera A:s poster', () => {
  it('A ser sina egna rader i alla tabeller', async () => {
    for (const t of USER_TABLES) {
      const { data, error } = await A.client.from(t).select('*');
      expect(error, t).toBeNull();
      expect(data!.length, t).toBeGreaterThan(0);
      expect(data!.every((r: { user_id: string }) => r.user_id === A.id), t).toBe(true);
    }
  });

  it('B:s SELECT ser inga av A:s rader (select=false)', async () => {
    for (const t of USER_TABLES) {
      const { data } = await B.client.from(t).select('*').eq('user_id', A.id);
      expect(data ?? [], t).toEqual([]);
    }
  });

  it('B:s UPDATE/DELETE av A:s rader påverkar 0 rader (update=false, delete=false)', async () => {
    for (const t of USER_TABLES) {
      await B.client.from(t).update({ user_id: B.id }).eq('user_id', A.id);
      await B.client.from(t).delete().eq('user_id', A.id);
    }
    for (const t of USER_TABLES) {
      const rows = await sql(`select count(*)::int as n from public.${t} where user_id = $1`, [A.id]);
      expect(rows[0].n, t).toBeGreaterThan(0);
    }
  });

  it('B:s INSERT med A:s user_id nekas (insert=false)', async () => {
    const r1 = await B.client.from('training_sessions').insert({ id: randomUUID(), user_id: A.id, kind: 'planned', status: 'preview' });
    expect(r1.error).not.toBeNull();
    const r2 = await B.client.from('restriction_rules').insert({ user_id: A.id, rule_kind: 'block_exercise', exercise_a: 'squat' });
    expect(r2.error).not.toBeNull();
    const n = await sql(`select count(*)::int as n from public.restriction_rules where user_id = $1 and rule_kind = 'block_exercise'`, [A.id]);
    expect(n[0].n).toBe(0);
  });

  it('34: annan användares session_id i barnets FK nekas även med egen user_id', async () => {
    const r = await B.client.from('session_exercises').insert({ id: randomUUID(), user_id: B.id, session_id: aSe.sessionId, exercise_slug: 'squat', order_index: 5, mode: 'light', band_min: 8, band_max: 12, target_sets: 2 });
    expect(r.error).not.toBeNull();
    const sym = await B.client.from('recommendation_audits').insert({ user_id: B.id, session_id: aSe.sessionId, engine_version: '1', inputs_hash: 'y', plan_snapshot: {} });
    expect(sym.error).not.toBeNull();
  });

  it('B kan inte skapa set i A:s övning eller ändra A:s set via RPC; svaret avslöjar inte existens', async () => {
    const create = await mutate(B, randomUUID(), randomUUID(), null, setPayload(aSe.seId));
    const missing = await mutate(B, randomUUID(), randomUUID(), null, setPayload(randomUUID()));
    expect(create).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    expect(missing.code).toBe(create.code);
    const edit = await mutate(B, randomUUID(), aSetId, 1, { actualReps: 1 });
    expect(edit).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    const row = await sql(`select actual_reps from public.training_sets where id = $1`, [aSetId]);
    expect(row[0].actual_reps).toBe(5);
  });

  it('B kan inte återanvända A:s eventId', async () => {
    const ev = randomUUID();
    await mutate(A, ev, randomUUID(), null, setPayload(aSe.seId, { ordinal: 9 }));
    const r = await mutate(B, ev, randomUUID(), null, { kind: 'work' });
    expect(r).toMatchObject({ status: 'rejected', code: 'EVENT_ID_UNAVAILABLE' });
  });

  it('redigerbar användarmetadata ger aldrig behörighet', async () => {
    await B.client.auth.updateUser({ data: { role: 'service_role', user_id: A.id, is_admin: true } });
    const { data } = await B.client.from('training_sets').select('*');
    expect(data).toEqual([]);
  });
});

describe('oautentiserad (anon) användare', () => {
  it('ser katalogen (17 övningar) men aldrig historik eller restriktioner', async () => {
    const anon = anonClient();
    const cat = await anon.from('exercise_catalog').select('slug');
    expect(cat.data?.length).toBe(17);
    for (const t of USER_TABLES) {
      const { data } = await anon.from(t).select('*');
      expect(data ?? [], t).toEqual([]);
    }
    const rpc = await anon.rpc('apply_set_mutation', { event_id: randomUUID(), set_id: randomUUID(), base_revision: null, payload: {} });
    expect(rpc.error).not.toBeNull();
  });

  it('katalogen är skrivskyddad även för inloggad', async () => {
    const r = await A.client.from('exercise_catalog').update({ name_sv: 'X' }).eq('slug', 'squat');
    expect(r.error).not.toBeNull();
    const rows = await sql(`select name_sv from public.exercise_catalog where slug='squat'`);
    expect(rows[0].name_sv).toBe('Knäböj');
  });
});

describe('09: apply_set_mutation – atomisk, idempotent, revisionsskyddad', () => {
  it('30/P11: dubbelklick och två retries med samma UUID ⇒ en serverpost och ett kvitto', async () => {
    const ev = randomUUID();
    const setId = randomUUID();
    const p = setPayload(aSe.seId, { ordinal: 2 });
    const r1 = await mutate(A, ev, setId, null, p);
    const r2 = await mutate(A, ev, setId, null, p);
    const r3 = await mutate(A, ev, setId, null, p);
    expect([r1.status, r2.status, r3.status]).toEqual(['applied', 'duplicate', 'duplicate']);
    expect(r2.revision).toBe(1);
    expect((await sql(`select count(*)::int n from public.training_sets where id=$1`, [setId]))[0].n).toBe(1);
    expect((await sql(`select count(*)::int n from public.mutation_receipts where event_id=$1`, [ev]))[0].n).toBe(1);
  });

  it('samtidiga identiska anrop (10 parallella) ⇒ exakt ett applied', async () => {
    const ev = randomUUID();
    const setId = randomUUID();
    const p = setPayload(aSe.seId, { ordinal: 3 });
    const results = await Promise.all(Array.from({ length: 10 }, () => mutate(A, ev, setId, null, p)));
    expect(results.filter((r) => r.status === 'applied').length).toBe(1);
    expect(results.filter((r) => r.status === 'duplicate').length).toBe(9);
    expect((await sql(`select count(*)::int n from public.training_sets where id=$1`, [setId]))[0].n).toBe(1);
  });

  it('annan payload med samma eventId ⇒ EVENT_REUSE_MISMATCH, första posten orörd', async () => {
    const ev = randomUUID();
    const setId = randomUUID();
    await mutate(A, ev, setId, null, setPayload(aSe.seId, { ordinal: 4, actualReps: 5 }));
    const r = await mutate(A, ev, setId, null, setPayload(aSe.seId, { ordinal: 4, actualReps: 1 }));
    expect(r).toMatchObject({ status: 'conflict', code: 'EVENT_REUSE_MISMATCH' });
    expect((await sql(`select actual_reps, revision from public.training_sets where id=$1`, [setId]))[0]).toEqual({ actual_reps: 5, revision: 1 });
  });

  it('31/09 §3: samtidiga ändringar av samma set ⇒ REVISION_CONFLICT, ingen tyst överskrivning', async () => {
    const setId = randomUUID();
    await mutate(A, randomUUID(), setId, null, setPayload(aSe.seId, { ordinal: 5 }));
    const devB = await mutate(A, randomUUID(), setId, 1, { actualReps: 6 }); // "enhet B"
    expect(devB).toMatchObject({ status: 'applied', revision: 2 });
    const devA = await mutate(A, randomUUID(), setId, 1, { actualReps: 4 }); // "enhet A" offline med gammal revision
    expect(devA).toMatchObject({ status: 'conflict', code: 'REVISION_CONFLICT', revision: 2 });
    expect(devA.server).toMatchObject({ actualReps: 6 });
    expect((await sql(`select actual_reps from public.training_sets where id=$1`, [setId]))[0].actual_reps).toBe(6);
    // Användaren väljer sin version: ny händelse med aktuell revision.
    const resolved = await mutate(A, randomUUID(), setId, 2, { actualReps: 4 });
    expect(resolved).toMatchObject({ status: 'applied', revision: 3 });
  });

  it('09 §3: förlorad ack ⇒ retry ger duplicate med samma revision', async () => {
    const setId = randomUUID();
    await mutate(A, randomUUID(), setId, null, setPayload(aSe.seId, { ordinal: 6 }));
    const x = randomUUID();
    const first = await mutate(A, x, setId, 1, { actualReps: 7 });
    const retry = await mutate(A, x, setId, 1, { actualReps: 7 });
    expect([first.status, first.revision, retry.status, retry.revision]).toEqual(['applied', 2, 'duplicate', 2]);
  });

  it('validering: ogiltiga värden avvisas atomiskt – varken set eller kvitto skrivs', async () => {
    const cases: Array<Record<string, unknown>> = [
      { actualReps: 51 },
      { actualKg: '-1' },
      { actualKg: '500.001' },
      { rir: 6 },
      { technique: 'great' },
      { kind: 'cooldown' },
      { status: 'done', actualReps: null, actualSeconds: null },
      { occurredAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
      { occurredAt: 'inte-ett-datum' },
      { hacker: true },
      { ordinal: 21 },
    ];
    for (const [i, over] of cases.entries()) {
      const ev = randomUUID();
      const setId = randomUUID();
      const r = await mutate(A, ev, setId, null, setPayload(aSe.seId, { ordinal: Math.min(20, 8 + i), ...over }));
      expect(r, JSON.stringify(over)).toMatchObject({ status: 'rejected', code: 'VALIDATION_ERROR' });
      expect((await sql(`select count(*)::int n from public.training_sets where id=$1`, [setId]))[0].n).toBe(0);
      expect((await sql(`select count(*)::int n from public.mutation_receipts where event_id=$1`, [ev]))[0].n).toBe(0);
    }
  });

  it('decimal lagras exakt: 102,5 kg ⇒ 102.500', async () => {
    const setId = randomUUID();
    const { seId } = await sessionWithExercise(A);
    expect((await mutate(A, randomUUID(), setId, null, setPayload(seId, { ordinal: 1, actualKg: '102.500' }))).status).toBe('applied');
    expect((await sql(`select actual_kg::text v from public.training_sets where id=$1`, [setId]))[0].v).toBe('102.500');
  });

  it('föräldrabyte efter skapande förbjuds; skapande med baseRevision ≠ null nekas', async () => {
    const setId = randomUUID();
    const { seId } = await sessionWithExercise(A);
    expect((await mutate(A, randomUUID(), setId, null, setPayload(seId, { ordinal: 1 }))).status).toBe('applied');
    const other = await sessionWithExercise(A);
    expect(await mutate(A, randomUUID(), setId, 1, { sessionExerciseId: other.seId })).toMatchObject({ status: 'rejected', code: 'PARENT_CHANGE_FORBIDDEN' });
    expect(await mutate(A, randomUUID(), randomUUID(), 3, setPayload(seId, { ordinal: 2 }))).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
  });

  it('direkta tabellskrivningar som kringgår RPC nekas (set, kvitton, snapshot, audit)', async () => {
    expect((await A.client.from('training_sets').insert({ id: randomUUID(), user_id: A.id, session_exercise_id: aSe.seId, ordinal: 40, kind: 'work', status: 'planned' })).error).not.toBeNull();
    expect((await A.client.from('training_sets').update({ actual_reps: 1 }).eq('id', aSetId)).error).not.toBeNull();
    expect((await A.client.from('mutation_receipts').insert({ event_id: randomUUID(), user_id: A.id, record_id: aSetId, record_type: 'x', payload_hash: 'x', status: 'applied' })).error).not.toBeNull();
    expect((await A.client.from('session_exercises').update({ recommendation_snapshot: { kg: 999 } }).eq('id', aSe.seId)).error).not.toBeNull();
    expect((await A.client.from('recommendation_audits').update({ reason_codes: ['HACK'] }).eq('user_id', A.id)).error).not.toBeNull();
    expect((await sql(`select recommendation_snapshot from public.session_exercises where id=$1`, [aSe.seId]))[0].recommendation_snapshot).toEqual({ kg: 77.5 });
  });

  it('P09: 10 offlinehändelser uppspelade två gånger (i omvänd ordning) ⇒ 10 unika poster', async () => {
    const { seId } = await sessionWithExercise(A);
    const events = Array.from({ length: 10 }, (_, i) => ({ ev: randomUUID(), setId: randomUUID(), p: setPayload(seId, { ordinal: i + 1 }) }));
    for (const e of events) await mutate(A, e.ev, e.setId, null, e.p);
    for (const e of [...events].reverse()) expect((await mutate(A, e.ev, e.setId, null, e.p)).status).toBe('duplicate');
    expect((await sql(`select count(*)::int n from public.training_sets where session_exercise_id=$1`, [seId]))[0].n).toBe(10);
  });
});

describe('36: hälsosamtycke styr symtomposter och områdesregler', () => {
  it('utan samtycke: inga symtomposter eller områdesregler; övningsblockering tillåts ändå', async () => {
    const s = await B.client.from('symptom_reports').insert({ user_id: B.id, area: 'knee', reaction: 'limping' });
    expect(s.error).not.toBeNull();
    const area = await B.client.from('restriction_rules').insert({ user_id: B.id, rule_kind: 'region_note', affected_area: 'knee' });
    expect(area.error).not.toBeNull();
    const block = await B.client.from('restriction_rules').insert({ user_id: B.id, rule_kind: 'block_exercise', exercise_a: 'deadlift' });
    expect(block.error).toBeNull();
  });

  it('erase_health_data raderar symtom och regler, återkallar samtycke; därefter nekas nya symtom', async () => {
    const C = await newUser('c');
    await withProfile(C);
    await C.client.from('health_consents').insert({ user_id: C.id, consent_version: 'HC-1', granted_at: new Date().toISOString() });
    expect((await C.client.from('symptom_reports').insert({ user_id: C.id, area: 'knee', reaction: 'transient' })).error).toBeNull();
    const r = await C.client.rpc('erase_health_data');
    expect(r.data).toMatchObject({ status: 'applied', symptomReports: 1 });
    expect((await sql(`select count(*)::int n from public.symptom_reports where user_id=$1`, [C.id]))[0].n).toBe(0);
    expect((await C.client.from('symptom_reports').insert({ user_id: C.id, area: 'knee', reaction: 'transient' })).error).not.toBeNull();
  });
});

describe('profil: villkorad ändring med förväntad revision', () => {
  it('fel revision ⇒ 0 rader ändras', async () => {
    const ok = await A.client.from('profiles').update({ minutes_per_session: 45, revision: 2 }).eq('user_id', A.id).eq('revision', 1).select('revision');
    expect(ok.data).toEqual([{ revision: 2 }]);
    const stale = await A.client.from('profiles').update({ minutes_per_session: 60, revision: 2 }).eq('user_id', A.id).eq('revision', 1).select('revision');
    expect(stale.data).toEqual([]);
    expect((await sql(`select minutes_per_session from public.profiles where user_id=$1`, [A.id]))[0].minutes_per_session).toBe(45);
  });

  it('DB-gränser: 1–7 pass/vecka och 15–120 min', async () => {
    expect((await A.client.from('profiles').update({ planned_sessions_per_week: 8 }).eq('user_id', A.id)).error).not.toBeNull();
    expect((await A.client.from('profiles').update({ minutes_per_session: 10 }).eq('user_id', A.id)).error).not.toBeNull();
  });
});

describe('kontoradering end-to-end', () => {
  it('delete_my_account tar bort auth-användaren och all identifierbar data via kaskad', async () => {
    const D = await newUser('d');
    await withProfile(D);
    const { seId } = await sessionWithExercise(D);
    await mutate(D, randomUUID(), randomUUID(), null, setPayload(seId));
    const r = await D.client.rpc('delete_my_account');
    expect(r.data).toMatchObject({ status: 'applied' });
    for (const t of USER_TABLES) expect((await sql(`select count(*)::int n from public.${t} where user_id=$1`, [D.id]))[0].n, t).toBe(0);
    expect((await sql(`select count(*)::int n from auth.users where id=$1`, [D.id]))[0].n).toBe(0);
    const again = await anonClient().auth.signInWithPassword({ email: D.email, password: 'Testlosen-123!' });
    expect(again.error).not.toBeNull();
    // A:s data orörd
    expect((await sql(`select count(*)::int n from public.training_sets where user_id=$1`, [A.id]))[0].n).toBeGreaterThan(0);
  });
});

describe('säkerhetskonfiguration i databasen', () => {
  it('RLS aktiverat på alla tabeller i public; inga SECURITY DEFINER-funktioner i public', async () => {
    const noRls = await sql(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(noRls).toEqual([]);
    const definers = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`);
    expect(definers).toEqual([]);
    const privDefiners = await sql<{ proname: string; cfg: string[] | null }>(`select p.proname, p.proconfig as cfg from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prosecdef`);
    expect(privDefiners.length).toBeGreaterThan(0);
    for (const f of privDefiners) expect(f.cfg, f.proname).toContain('search_path=""');
  });

  it('private-schemat exponeras inte via REST', async () => {
    const r = await fetch(`${(await import('./dbHelpers')).env.url}/rest/v1/rpc/delete_my_account`, { method: 'POST', headers: { apikey: (await import('./dbHelpers')).env.anon, 'Content-Profile': 'private', 'Content-Type': 'application/json' }, body: '{}' });
    expect(r.ok).toBe(false);
  });
});
