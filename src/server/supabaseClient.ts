import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Endast publik anon/publishable-nyckel får finnas i klienten (03 §4, 06 autonomiregler).
 * En service_role/secret-nyckel vägras uttryckligen.
 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_secret_')) throw new Error('FÖRBJUDET: secret-nyckel i klienten');
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role && payload.role !== 'anon') throw new Error('FÖRBJUDET: icke-anon JWT-roll i klienten');
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('FÖRBJUDET')) throw e;
    }
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!url && !!key;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  if (!client) {
    assertPublicKey(key);
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  }
  return client;
}
