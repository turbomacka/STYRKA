/**
 * STYRKA-CR-2026-10-10-01 mot verklig lokal Supabase: migration 004 (katalog 2.0.0, nya tabeller med ägar-RLS,
 * append-only revisionsposter, perceived_effort via apply_set_mutation, lastbas per hantel) och hela appflödet
 * (byte → lokal IndexedDB → outbox → SupabaseTransport → ny enhet hämtar).
 */
import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG, OFFERED_CATALOG } from '../../src/domain/catalog';
import { openUserDb } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import type { AppContext } from '../../src/application/context';
import { SyncEngine } from '../../src/application/sync';
import { completeOnboarding, GYM_STANDARD } from '../../src/application/profile';
import { displayOrder, finishSession, logSet, previewNext, rateSet, startSession, swapExercise } from '../../src/application/training';
import { anonClient, closeSql, mutate, newUser, sessionWithExercise, setPayload, sql, withProfile, type TestUser } from './dbHelpers';

let A: TestUser;
let B: TestUser;
let aSe: { sessionId: string; seId: string };
let bSe: { sessionId: string; seId: string };
let calId: string;
let eventId: string;

const NEW_TABLES = ['user_exercise_calibrations', 'session_exercise_substitution_events'];

function eventRow(u: TestUser, se: { sessionId: string; seId: string }, over: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    event_id: id,
    user_id: u.id,
    session_id: se.sessionId,
    original_exercise_slug: 'squat',
    replacement_exercise_slug: 'front_squat',
    original_session_exercise_id: se.seId,
    replacement_session_exercise_id: null,
    choice_scope: 'today',
    engine_version: '1.0.0',
    substitution_catalog_version: 'SUBST/1.0.0',
    algorithm_rule_version: 'STYRKA-RULES/1.1.0',
    source_evidence_ids: ['gullett2009'],
    load_estimation_kind: 'population_prior_low_confidence',
    reason_codes: ['SUB_RELATION_CLOSE'],
    user_override: false,
    ...over,
  };
}

beforeAll(async () => {
  A = await newUser('sub-a');
  B = await newUser('sub-b');
  await withProfile(A);
  await withProfile(B);
  aSe = await sessionWithExercise(A);
  bSe = await sessionWithExercise(B);
  calId = randomUUID();
  const c = await A.client.from('user_exercise_calibrations').insert({ id: calId, user_id: A.id, exercise_slug: 'front_squat', familiarity: 'familiar', quality: 'calibrating', observations: [] });
  expect(c.error).toBeNull();
  const ev = eventRow(A, aSe);
  eventId = ev.id;
  const e = await A.client.from('session_exercise_substitution_events').insert(ev);
  expect(e.error).toBeNull();
});

afterAll(async () => {
  await closeSql();
});

describe('migration 004/005: katalog 2.0.1 med variantmetadata', () => {
  it('alla appens övningar finns med lastbas, redskapsklass, maskinprofilkrav, unilateral och tidsfaktor; endast erbjudna är aktiva', async () => {
    const rows = await sql<{ slug: string; active: boolean; load_display_basis: string; equipment_class: string; requires_equipment_profile: boolean; unilateral: boolean; time_multiplier: string; catalog_since: string }>(`select slug, active, load_display_basis, equipment_class, requires_equipment_profile, unilateral, time_multiplier::text, catalog_since from public.exercise_catalog`);
    expect(rows.map((r) => r.slug).sort()).toEqual(CATALOG.map((c) => c.slug).sort());
    expect(rows.filter((r) => r.active).map((r) => r.slug).sort()).toEqual(OFFERED_CATALOG.map((c) => c.slug).sort());
    expect(rows.find((r) => r.slug === 'lunge')?.active).toBe(false);
    expect(rows.find((r) => r.slug === 'barbell_row')).toMatchObject({ active: true, catalog_since: '2.0.1' });
    for (const c of CATALOG) {
      const r = rows.find((x) => x.slug === c.slug)!;
      expect({ basis: r.load_display_basis, eq: r.equipment_class, req: r.requires_equipment_profile, uni: r.unilateral, tm: Number(r.time_multiplier), since: r.catalog_since }, c.slug).toEqual({ basis: c.loadDisplayBasis, eq: c.equipmentClass, req: c.requiresEquipmentProfile, uni: c.unilateral, tm: c.timeMultiplier, since: c.catalogSince });
    }
  });
});

describe('nya persondatatabeller: ägarbaserad RLS', () => {
  it('A ser sina rader; B och anon ser inga', async () => {
    for (const t of NEW_TABLES) {
      const own = await A.client.from(t).select('*');
      expect(own.error, t).toBeNull();
      expect(own.data!.length, t).toBeGreaterThan(0);
      expect((await B.client.from(t).select('*').eq('user_id', A.id)).data ?? [], t).toEqual([]);
      expect((await anonClient().from(t).select('*')).data ?? [], t).toEqual([]);
    }
  });

  it('B kan inte skapa rader med A:s user_id eller ändra/radera A:s rader', async () => {
    expect((await B.client.from('user_exercise_calibrations').insert({ id: randomUUID(), user_id: A.id, exercise_slug: 'goblet_squat' })).error).not.toBeNull();
    expect((await B.client.from('session_exercise_substitution_events').insert(eventRow({ ...B, id: A.id }, aSe))).error).not.toBeNull();
    await B.client.from('user_exercise_calibrations').update({ quality: 'calibrated' }).eq('id', calId);
    await B.client.from('user_exercise_calibrations').delete().eq('id', calId);
    expect((await sql(`select quality from public.user_exercise_calibrations where id=$1`, [calId]))[0].quality).toBe('calibrating');
    for (const t of NEW_TABLES) expect((await sql(`select count(*)::int n from public.${t} where user_id=$1`, [A.id]))[0].n, t).toBeGreaterThan(0);
  });

  it('34: revisionspost som pekar på annan användares pass eller övning nekas (sammansatt FK)', async () => {
    expect((await B.client.from('session_exercise_substitution_events').insert(eventRow(B, { sessionId: aSe.sessionId, seId: bSe.seId }))).error).not.toBeNull();
    expect((await B.client.from('session_exercise_substitution_events').insert(eventRow(B, { sessionId: bSe.sessionId, seId: aSe.seId }))).error).not.toBeNull();
    expect((await B.client.from('session_exercise_substitution_events').insert(eventRow(B, bSe))).error).toBeNull();
  });

  it('revisionsposter är append-only för klienten: ägaren kan varken ändra eller radera', async () => {
    const upd = await A.client.from('session_exercise_substitution_events').update({ user_override: true }).eq('id', eventId);
    expect(upd.error).not.toBeNull();
    const del = await A.client.from('session_exercise_substitution_events').delete().eq('id', eventId);
    expect(del.error).not.toBeNull();
    expect((await sql(`select user_override from public.session_exercise_substitution_events where id=$1`, [eventId]))[0].user_override).toBe(false);
  });

  it('ägaren kan uppdatera egen kalibrering; en rad per övning och maskinprofil; ogiltiga värden nekas', async () => {
    expect((await A.client.from('user_exercise_calibrations').update({ quality: 'calibrated', calibrated_at: new Date().toISOString() }).eq('id', calId)).error).toBeNull();
    expect((await A.client.from('user_exercise_calibrations').insert({ id: randomUUID(), user_id: A.id, exercise_slug: 'front_squat' })).error).not.toBeNull();
    expect((await A.client.from('user_exercise_calibrations').insert({ id: randomUUID(), user_id: A.id, exercise_slug: 'front_squat', variant_key: 'gym-b' })).error).toBeNull();
    expect((await A.client.from('user_exercise_calibrations').insert({ id: randomUUID(), user_id: A.id, exercise_slug: 'leg_press', quality: 'perfect' })).error).not.toBeNull();
    expect((await A.client.from('session_exercise_substitution_events').insert(eventRow(A, aSe, { load_estimation_kind: 'guess' }))).error).not.toBeNull();
    expect((await A.client.from('session_exercise_substitution_events').insert(eventRow(A, aSe, { choice_scope: 'forever' }))).error).not.toBeNull();
  });
});

describe('additiva kolumner', () => {
  it('perceived_effort via apply_set_mutation: skapa, ändra, ogiltigt värde avvisas atomiskt', async () => {
    const setId = randomUUID();
    const r = await mutate(A, randomUUID(), setId, null, setPayload(aSe.seId, { ordinal: 3, perceivedEffort: 'too_heavy' }));
    expect(r.status).toBe('applied');
    expect((await sql(`select perceived_effort from public.training_sets where id=$1`, [setId]))[0].perceived_effort).toBe('too_heavy');
    expect((await mutate(A, randomUUID(), setId, 1, { perceivedEffort: 'ok' })).status).toBe('applied');
    expect((await sql(`select perceived_effort, revision from public.training_sets where id=$1`, [setId]))[0]).toEqual({ perceived_effort: 'ok', revision: 2 });
    const ev = randomUUID();
    expect(await mutate(A, ev, setId, 2, { perceivedEffort: 'max' })).toMatchObject({ status: 'rejected', code: 'VALIDATION_ERROR' });
    expect((await sql(`select perceived_effort, revision from public.training_sets where id=$1`, [setId]))[0]).toEqual({ perceived_effort: 'ok', revision: 2 });
    expect((await sql(`select count(*)::int n from public.mutation_receipts where event_id=$1`, [ev]))[0].n).toBe(0);
    // Befintliga set utan svar påverkas inte (null).
    const plain = randomUUID();
    expect((await mutate(A, randomUUID(), plain, null, setPayload(aSe.seId, { ordinal: 4 }))).status).toBe('applied');
    expect((await sql(`select perceived_effort from public.training_sets where id=$1`, [plain]))[0].perceived_effort).toBeNull();
  });

  it('SUB14 i databasen: lastbas per hantel lagras; ogiltig lastbas nekas', async () => {
    const id = randomUUID();
    const ok = await A.client.from('session_exercises').insert({ id, user_id: A.id, session_id: aSe.sessionId, exercise_slug: 'dumbbell_bench_press', order_index: 101, mode: 'heavy', band_min: 6, band_max: 8, target_sets: 3, recommendation_snapshot: { kg: null }, load_basis: 'per_hand_kg' });
    expect(ok.error).toBeNull();
    expect((await sql(`select load_basis from public.session_exercises where id=$1`, [id]))[0].load_basis).toBe('per_hand_kg');
    const setId = randomUUID();
    expect((await mutate(A, randomUUID(), setId, null, setPayload(id, { ordinal: 1, actualKg: '24.000', targetKg: '24.000' }))).status).toBe('applied');
    expect((await sql(`select actual_kg::text v from public.training_sets where id=$1`, [setId]))[0].v).toBe('24.000');
    const bad = await A.client.from('session_exercises').insert({ id: randomUUID(), user_id: A.id, session_id: aSe.sessionId, exercise_slug: 'dumbbell_bench_press', order_index: 111, mode: 'heavy', band_min: 6, band_max: 8, target_sets: 3, recommendation_snapshot: {}, load_basis: 'per_foot_kg' });
    expect(bad.error).not.toBeNull();
  });

  it('profilens maskinprofiler måste vara ett objekt', async () => {
    expect((await A.client.from('profiles').update({ equipment_profiles: { leg_press: 'gym-b' } }).eq('user_id', A.id)).error).toBeNull();
    expect((await A.client.from('profiles').update({ equipment_profiles: ['gym-b'] }).eq('user_id', A.id)).error).not.toBeNull();
  });
});

describe('appflöde mot verklig server', () => {
  it('byte med hjälpskattning + kalibreringssvar synkas; ny enhet hämtar revisionspost, kalibrering och lastbas', async () => {
    const U = await newUser('sub-app');
    const mk = (): AppContext => ({ db: openUserDb(U.id), userId: U.id, transport: new SupabaseTransport(U.client), clock: { now: () => new Date().toISOString() }, ids: { uuid: () => randomUUID() }, isOnline: () => true });
    const ctx = mk();
    const sync = new SyncEngine(ctx);
    await completeOnboarding(ctx, { adultConfirmed: true, plannedSessionsPerWeek: 2, minutesPerSession: 60, experience: 'novice', equipment: GYM_STANDARD, goals: { squat: 1, bench_press: 1, deadlift: 1 }, estimates: [{ exerciseId: 'bench_press', kind: '1rm', grams: 100_000 }], healthConsent: false, restrictions: [] });
    let snap = await previewNext(ctx);
    if (!snap.exercises.some((e) => e.exerciseId === 'bench_press')) throw new Error('mall utan bänkpress');
    snap = { ...snap };
    const s = await startSession(ctx, snap);
    const bench = displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(s.id).toArray()).find((e) => e.exerciseId === 'bench_press')!;
    const { sessionExercise: db, event } = await swapExercise(ctx, bench.id, 'dumbbell_bench_press', { familiarity: 'familiar', startGrams: 20_000, scope: 'future' });
    const sets = await ctx.db.sets.where('sessionExerciseId').equals(db.id).sortBy('ordinal');
    await logSet(ctx, sets[0].id, { actualGrams: 20_000, actualReps: 8 });
    await rateSet(ctx, sets[0].id, 'too_heavy');
    for (const x of sets.slice(1)) await logSet(ctx, x.id, {});
    await finishSession(ctx, s.id);
    const run = await sync.syncNow();
    expect(run.stoppedBy).toBeNull();
    expect(run.rejected).toBe(0);
    expect((await sql(`select exercise_slug, load_basis, variant_key from public.session_exercises where id=$1`, [db.id]))[0]).toEqual({ exercise_slug: 'dumbbell_bench_press', load_basis: 'per_hand_kg', variant_key: 'default' });
    expect((await sql(`select actual_kg::text kg, perceived_effort from public.training_sets where id=$1`, [sets[0].id]))[0]).toEqual({ kg: '20.000', perceived_effort: 'too_heavy' });
    // Resterande set förifylldes ett steg lättare (2 kg per hantel) efter "för tungt".
    expect((await sql(`select target_kg::text kg from public.training_sets where id=$1`, [sets[1].id]))[0].kg).toBe('18.000');
    const evRows = await sql(`select * from public.session_exercise_substitution_events where id=$1`, [event.id]);
    expect(evRows[0]).toMatchObject({ user_id: U.id, original_exercise_slug: 'bench_press', replacement_exercise_slug: 'dumbbell_bench_press', choice_scope: 'future', load_estimation_kind: 'calibration', user_override: false });
    expect((await sql(`select substitutions from public.profiles where user_id=$1`, [U.id]))[0].substitutions).toEqual({ bench_press: 'dumbbell_bench_press' });
    // Ny enhet.
    const fresh = { ...mk(), db: new (openUserDb(U.id).constructor as new (n: string) => ReturnType<typeof openUserDb>)(`styrka_${U.id}_dev2`) };
    await new SyncEngine(fresh).pull();
    expect(await fresh.db.substitutionEvents.get(event.id)).toMatchObject({ choiceScope: 'future', replacementExerciseId: 'dumbbell_bench_press', syncState: 'synced' });
    expect((await fresh.db.sessionExercises.get(db.id))?.snapshot.loadBasis).toBe('per_hand_kg');
    expect((await fresh.db.sessionExercises.get(bench.id))?.replacedById).toBe(db.id);
    expect((await fresh.db.sets.get(sets[0].id))?.perceivedEffort).toBe('too_heavy');
    expect((await fresh.db.calibrations.toArray()).find((c) => c.exerciseId === 'dumbbell_bench_press')).toMatchObject({ familiarity: 'familiar', quality: 'none' });
    // Kontoradering tar även bort de nya tabellernas rader.
    const del = await U.client.rpc('delete_my_account');
    expect(del.error, JSON.stringify(del.error)).toBeNull();
    for (const t of NEW_TABLES) expect((await sql(`select count(*)::int n from public.${t} where user_id=$1`, [U.id]))[0].n, t).toBe(0);
  });
});
