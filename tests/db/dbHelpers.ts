/**
 * Testhjälpare mot lokal Supabase. Klienter använder ENBART anon/publishable-nyckeln och riktig Auth.
 * Superuser-anslutning (pg) används bara för att verifiera databasens faktiska tillstånd i test.
 * Bekräftade testkonton skapas med lokal service role (e-postbekräftelse är på, som i staging) – endast i testprocessen.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import pg from 'pg';

function localEnv(): { url: string; anon: string; dbUrl: string; service: string } {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?`, 'm').exec(out)?.[1];
  const url = get('API_URL');
  const anon = get('ANON_KEY');
  const dbUrl = get('DB_URL');
  const service = get('SERVICE_ROLE_KEY');
  if (!url || !anon || !dbUrl || !service) throw new Error('Lokal Supabase körs inte – starta med `npm run db:start`.');
  return { url, anon, dbUrl, service };
}

export const env = localEnv();

export function anonClient(): SupabaseClient {
  return createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string; client: SupabaseClient };

export async function newUser(label: string): Promise<TestUser> {
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${label}-${randomUUID().slice(0, 8)}@test.styrka.local`;
  const created = await admin.auth.admin.createUser({ email, password: 'Testlosen-123!', email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser misslyckades: ${created.error?.message}`);
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: 'Testlosen-123!' });
  if (error) throw new Error(`inloggning misslyckades: ${error.message}`);
  return { id: created.data.user.id, email, client };
}

export async function withProfile(u: TestUser): Promise<void> {
  const { error } = await u.client.from('profiles').insert({ user_id: u.id, adult_confirmed: true });
  if (error) throw new Error(`profil: ${error.message}`);
}

export async function sessionWithExercise(u: TestUser): Promise<{ sessionId: string; seId: string }> {
  const sessionId = randomUUID();
  const seId = randomUUID();
  const s = await u.client.from('training_sessions').insert({ id: sessionId, user_id: u.id, kind: 'planned', status: 'in_progress', started_at: new Date().toISOString() });
  if (s.error) throw new Error(`session: ${s.error.message}`);
  const e = await u.client.from('session_exercises').insert({ id: seId, user_id: u.id, session_id: sessionId, exercise_slug: 'bench_press', order_index: 0, mode: 'heavy', band_min: 5, band_max: 7, target_sets: 3, recommendation_snapshot: { kg: 77.5 } });
  if (e.error) throw new Error(`session_exercise: ${e.error.message}`);
  return { sessionId, seId };
}

export function setPayload(seId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { sessionExerciseId: seId, ordinal: 1, kind: 'work', status: 'done', targetKg: '77.500', targetReps: 5, actualKg: '77.500', actualReps: 5, rir: 2, technique: 'controlled', occurredAt: new Date().toISOString(), ...over };
}

export async function mutate(u: TestUser, eventId: string, setId: string, baseRevision: number | null, payload: Record<string, unknown>) {
  // Samma beteende som klientens synk: transienta DB-fel försöks igen med SAMMA eventId.
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await u.client.rpc('apply_set_mutation', { event_id: eventId, set_id: setId, base_revision: baseRevision, payload });
    if (error && ['57014', '40001', '40P01'].includes(error.code) && attempt < 3) continue;
    if (error) throw new Error(`rpc: ${error.message}`);
    return data as { status: string; code?: string; revision?: number; recordId?: string; server?: Record<string, unknown> };
  }
}

let pool: pg.Pool | null = null;
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: env.dbUrl, max: 2 });
  const r = await pool.query<T>(text, params);
  return r.rows;
}

export async function closeSql(): Promise<void> {
  await pool?.end();
  pool = null;
}
