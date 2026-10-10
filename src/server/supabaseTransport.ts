import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentSlug } from '../domain/catalog';
import type { ServerTable } from '../storage/db';
import { TransportError, type MutationEnvelope, type ProfilePatchResult, type ServerSnapshot, type SyncTransport } from './transport';

type PgError = { message?: string; code?: string; status?: number } | null;

/** Klassificerar Supabase/PostgREST-fel till API-felmatrisen (03 §6). Loggar aldrig payload. */
export function classify(error: PgError, status?: number): TransportError {
  const st = status ?? error?.status;
  const msg = error?.message ?? '';
  if (!st || /fetch|network|Failed to fetch|NetworkError|ECONNREFUSED|Load failed/i.test(msg)) return new TransportError('OFFLINE', 'nätverk');
  // Statement timeout/serialiseringsfel: transient – kön försöker igen med samma eventId (idempotent).
  if (error?.code === '57014' || error?.code === '40001' || error?.code === '40P01') return new TransportError('DB_UNAVAILABLE', error.code);
  if (st === 401 || error?.code === 'PGRST301' || error?.code === 'PGRST303') return new TransportError('AUTH_REQUIRED');
  if (error?.code === '42501') return new TransportError('FORBIDDEN');
  if (st === 403) return new TransportError('FORBIDDEN');
  if (st >= 500) return new TransportError('DB_UNAVAILABLE');
  return new TransportError('VALIDATION_ERROR', error?.code ?? String(st));
}

async function guard<T>(p: PromiseLike<{ data: T; error: PgError; status: number }>): Promise<T> {
  let r: { data: T; error: PgError; status: number };
  try {
    r = await p;
  } catch {
    throw new TransportError('OFFLINE', 'nätverk');
  }
  if (r.error) throw classify(r.error, r.status);
  return r.data;
}

const PAGE = 1000;

export class SupabaseTransport implements SyncTransport {
  constructor(private readonly sb: SupabaseClient) {}

  async applySetMutation(eventId: string, setId: string, baseRevision: number | null, payload: Record<string, unknown>): Promise<MutationEnvelope> {
    const data = await guard(this.sb.rpc('apply_set_mutation', { event_id: eventId, set_id: setId, base_revision: baseRevision, payload }));
    return data as MutationEnvelope;
  }

  async upsert(table: ServerTable, row: Record<string, unknown>, opts: { immutable?: boolean } = {}): Promise<void> {
    const conflictCol = table === 'health_consents' ? 'user_id' : 'id';
    if (opts.immutable) {
      await guard(this.sb.from(table).upsert(row, { onConflict: conflictCol, ignoreDuplicates: true }));
    } else {
      await guard(this.sb.from(table).upsert(row, { onConflict: conflictCol }));
    }
  }

  async remove(table: ServerTable, id: string, idColumn = 'id'): Promise<void> {
    await guard(this.sb.from(table).delete().eq(idColumn, id));
  }

  async patchProfile(userId: string, baseRevision: number, patch: Record<string, unknown>): Promise<ProfilePatchResult> {
    const updated = await guard(
      this.sb
        .from('profiles')
        .update({ ...patch, revision: baseRevision + 1, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('revision', baseRevision)
        .select('revision'),
    );
    if (updated && updated.length === 1) return { status: 'applied', revision: (updated[0] as { revision: number }).revision };
    const existing = await guard(this.sb.from('profiles').select('*').eq('user_id', userId).maybeSingle());
    if (!existing) {
      await guard(this.sb.from('profiles').insert({ ...patch, user_id: userId, revision: baseRevision + 1 }));
      return { status: 'applied', revision: baseRevision + 1 };
    }
    return { status: 'conflict', revision: (existing as { revision: number }).revision, server: existing as Record<string, unknown> };
  }

  async replaceEquipment(userId: string, equipment: EquipmentSlug[]): Promise<void> {
    if (equipment.length) {
      await guard(this.sb.from('user_equipment').upsert(equipment.map((e) => ({ user_id: userId, equipment_slug: e })), { onConflict: 'user_id,equipment_slug', ignoreDuplicates: true }));
      await guard(this.sb.from('user_equipment').delete().eq('user_id', userId).not('equipment_slug', 'in', `(${equipment.map((e) => `"${e}"`).join(',')})`));
    } else {
      await guard(this.sb.from('user_equipment').delete().eq('user_id', userId));
    }
  }

  async eraseHealthData(): Promise<void> {
    const r = (await guard(this.sb.rpc('erase_health_data'))) as { status: string };
    if (r.status !== 'applied') throw new TransportError('VALIDATION_ERROR', 'erase_health_data');
  }

  async deleteAccount(): Promise<void> {
    const r = (await guard(this.sb.rpc('delete_my_account'))) as { status: string };
    if (r.status !== 'applied') throw new TransportError('FORBIDDEN', 'delete_my_account');
  }

  private async all(table: string, userId: string, order = 'id'): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = (await guard(this.sb.from(table).select('*').eq('user_id', userId).order(order).range(from, from + PAGE - 1))) as Record<string, unknown>[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  async pullAll(userId: string): Promise<ServerSnapshot> {
    const profile = (await guard(this.sb.from('profiles').select('*').eq('user_id', userId).maybeSingle())) as Record<string, unknown> | null;
    const [equipment, exerciseProfiles, consents, restrictions, symptoms, programs, sessions, sessionExercises, sets, audits] = await Promise.all([
      this.all('user_equipment', userId),
      this.all('user_exercise_profiles', userId),
      this.all('health_consents', userId, 'user_id'),
      this.all('restriction_rules', userId),
      this.all('symptom_reports', userId),
      this.all('programs', userId),
      this.all('training_sessions', userId),
      this.all('session_exercises', userId),
      this.all('training_sets', userId),
      this.all('recommendation_audits', userId),
    ]);
    return { profile, equipment: equipment.map((e) => e.equipment_slug as string), exerciseProfiles, consents, restrictions, symptoms, programs, sessions, sessionExercises, sets, audits };
  }
}
