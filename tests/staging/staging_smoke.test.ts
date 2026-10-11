/**
 * Röktest mot STAGING (länkat Supabase-projekt). Körs manuellt: `npx vitest run --project staging`.
 * - Klienter använder ENBART publishable-nyckeln och riktig inloggning.
 * - Secret-nyckeln används endast här i testprocessen för att skapa/radera två bekräftade syntetiska konton
 *   (staging kräver e-postbekräftelse). Nycklar hämtas via Supabase CLI vid körning och skrivs aldrig ut eller till fil.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/domain/catalog';

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const url = `https://${ref}.supabase.co`;
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const publishable = keys.find((k) => k.type === 'publishable')!.api_key;
const secret = keys.find((k) => k.type === 'secret')!.api_key;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const client = () => createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });

type U = { id: string; email: string; c: SupabaseClient };
const PASSWORD = `Stg-${randomUUID()}`;
async function user(label: string): Promise<U> {
  const email = `staging-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const c = client();
  const s = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw new Error(`signIn: ${s.error.message}`);
  return { id: data.user.id, email, c };
}
const rpc = async (u: U, ev: string, setId: string, base: number | null, payload: Record<string, unknown>) => {
  const { data, error } = await u.c.rpc('apply_set_mutation', { event_id: ev, set_id: setId, base_revision: base, payload });
  if (error) throw new Error(error.message);
  return data as { status: string; code?: string; revision?: number };
};

const TABLES = ['profiles', 'user_equipment', 'user_exercise_profiles', 'health_consents', 'restriction_rules', 'programs', 'training_sessions', 'session_exercises', 'training_sets', 'symptom_reports', 'recommendation_audits', 'mutation_receipts'];
let A: U, B: U;
const sess = randomUUID(), se = randomUUID(), setId = randomUUID();

beforeAll(async () => {
  A = await user('a');
  B = await user('b');
  for (const u of [A, B]) expect((await u.c.from('profiles').insert({ user_id: u.id, adult_confirmed: true })).error).toBeNull();
  expect((await A.c.from('training_sessions').insert({ id: sess, user_id: A.id, kind: 'planned', status: 'in_progress' })).error).toBeNull();
  expect((await A.c.from('session_exercises').insert({ id: se, user_id: A.id, session_id: sess, exercise_slug: 'squat', order_index: 0, mode: 'heavy', band_min: 5, band_max: 7, target_sets: 3 })).error).toBeNull();
  expect((await A.c.from('restriction_rules').insert({ user_id: A.id, rule_kind: 'block_pair_heavy', exercise_a: 'squat', exercise_b: 'deadlift' })).error).toBeNull();
}, 60_000);

afterAll(async () => {
  for (const u of [A, B]) {
    if (!u) continue;
    const r = await u.c.rpc('delete_my_account');
    if ((r.data as { status?: string } | null)?.status !== 'applied') await admin.auth.admin.deleteUser(u.id);
  }
});

describe('staging', () => {
  it('anon: katalogen (samma övningar som appen) syns, inga användardata, RPC nekas', async () => {
    const anon = client();
    expect(((await anon.from('exercise_catalog').select('slug')).data ?? []).map((r) => r.slug).sort()).toEqual(CATALOG.map((c) => c.slug).sort());
    for (const t of TABLES) expect((await anon.from(t).select('*')).data ?? [], t).toEqual([]);
    expect((await anon.rpc('apply_set_mutation', { event_id: randomUUID(), set_id: randomUUID(), base_revision: null, payload: {} })).error).not.toBeNull();
  });

  it('apply_set_mutation: applied → duplicate → revisionskonflikt', async () => {
    const ev = randomUUID();
    const p = { sessionExerciseId: se, ordinal: 1, kind: 'work', status: 'done', targetKg: '80.000', targetReps: 5, actualKg: '80.000', actualReps: 5, occurredAt: new Date().toISOString() };
    expect((await rpc(A, ev, setId, null, p)).status).toBe('applied');
    expect(await rpc(A, ev, setId, null, p)).toMatchObject({ status: 'duplicate', revision: 1 });
    expect((await rpc(A, randomUUID(), setId, 1, { actualReps: 6 })).revision).toBe(2);
    expect(await rpc(A, randomUUID(), setId, 1, { actualReps: 4 })).toMatchObject({ status: 'conflict', code: 'REVISION_CONFLICT' });
    expect((await rpc(A, ev, setId, null, { ...p, actualReps: 1 })).code).toBe('EVENT_REUSE_MISMATCH');
  });

  it('B kan inte läsa, ändra, radera eller skapa A:s data', async () => {
    for (const t of TABLES) {
      expect((await B.c.from(t).select('*').eq('user_id', A.id)).data ?? [], t).toEqual([]);
      await B.c.from(t).update({ user_id: B.id }).eq('user_id', A.id);
      await B.c.from(t).delete().eq('user_id', A.id);
    }
    expect((await A.c.from('training_sets').select('actual_reps').eq('id', setId)).data).toEqual([{ actual_reps: 6 }]);
    expect((await A.c.from('restriction_rules').select('id')).data?.length).toBe(1);
    expect((await B.c.from('training_sessions').insert({ id: randomUUID(), user_id: A.id, kind: 'planned', status: 'preview' })).error).not.toBeNull();
    expect((await B.c.from('session_exercises').insert({ id: randomUUID(), user_id: B.id, session_id: sess, exercise_slug: 'squat', order_index: 1, mode: 'light', band_min: 8, band_max: 12, target_sets: 2 })).error).not.toBeNull();
    expect(await rpc(B, randomUUID(), randomUUID(), null, { sessionExerciseId: se, ordinal: 2, kind: 'work', status: 'planned' })).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    expect(await rpc(B, randomUUID(), setId, 2, { actualReps: 1 })).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
  });

  it('direkta setskrivningar och snapshotändringar nekas; symtom kräver samtycke', async () => {
    expect((await A.c.from('training_sets').insert({ id: randomUUID(), user_id: A.id, session_exercise_id: se, ordinal: 9, kind: 'work', status: 'planned' })).error).not.toBeNull();
    expect((await A.c.from('session_exercises').update({ mode: 'light' }).eq('id', se)).error).not.toBeNull();
    expect((await A.c.from('symptom_reports').insert({ user_id: A.id, area: 'knee', reaction: 'limping' })).error).not.toBeNull();
    expect((await A.c.from('health_consents').insert({ user_id: A.id, consent_version: 'HC-test', granted_at: new Date().toISOString() })).error).toBeNull();
    expect((await A.c.from('symptom_reports').insert({ user_id: A.id, area: 'knee', reaction: 'limping' })).error).toBeNull();
  });

  it('migration 004: kalibrering och revisionsposter med ägar-RLS, append-only, perceived_effort via RPC', async () => {
    const anon = client();
    for (const t of ['user_exercise_calibrations', 'session_exercise_substitution_events']) expect((await anon.from(t).select('*')).data ?? [], t).toEqual([]);
    const cal = randomUUID();
    expect((await A.c.from('user_exercise_calibrations').insert({ id: cal, user_id: A.id, exercise_slug: 'front_squat', familiarity: 'familiar' })).error).toBeNull();
    const ev = randomUUID();
    const row = { id: ev, event_id: ev, user_id: A.id, session_id: sess, original_exercise_slug: 'squat', replacement_exercise_slug: 'front_squat', original_session_exercise_id: se, choice_scope: 'today', engine_version: '1.0.0', substitution_catalog_version: 'SUBST/1.0.0', algorithm_rule_version: 'STYRKA-RULES/1.1.0', source_evidence_ids: ['gullett2009'], load_estimation_kind: 'calibration', reason_codes: ['SUB_RELATION_CLOSE'], user_override: false };
    expect((await A.c.from('session_exercise_substitution_events').insert(row)).error).toBeNull();
    expect((await A.c.from('session_exercise_substitution_events').update({ user_override: true }).eq('id', ev)).error).not.toBeNull();
    expect((await A.c.from('session_exercise_substitution_events').delete().eq('id', ev)).error).not.toBeNull();
    expect((await B.c.from('session_exercise_substitution_events').select('id').eq('id', ev)).data ?? []).toEqual([]);
    expect((await B.c.from('user_exercise_calibrations').select('id').eq('id', cal)).data ?? []).toEqual([]);
    expect((await B.c.from('session_exercise_substitution_events').insert({ ...row, id: randomUUID(), event_id: randomUUID(), user_id: B.id })).error).not.toBeNull();
    const s2 = randomUUID();
    expect((await rpc(A, randomUUID(), s2, null, { sessionExerciseId: se, ordinal: 2, kind: 'work', status: 'done', actualKg: '40.000', actualReps: 5, occurredAt: new Date().toISOString(), perceivedEffort: 'too_heavy' })).status).toBe('applied');
    expect((await A.c.from('training_sets').select('perceived_effort').eq('id', s2)).data).toEqual([{ perceived_effort: 'too_heavy' }]);
    expect(await rpc(A, randomUUID(), s2, 1, { perceivedEffort: 'max' })).toMatchObject({ status: 'rejected', code: 'VALIDATION_ERROR' });
  });

  it('kontoradering tar bort kontot (körs även som städning)', async () => {
    const C = await user('c');
    await C.c.from('profiles').insert({ user_id: C.id, adult_confirmed: true });
    expect(((await C.c.rpc('delete_my_account')).data as { status: string }).status).toBe('applied');
    expect((await client().auth.signInWithPassword({ email: C.email, password: PASSWORD })).error).not.toBeNull();
  });
});
