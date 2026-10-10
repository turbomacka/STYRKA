/**
 * DEMO (STARTA_HAR_KODAGENT): två oberoende konton, 36 pass vardera och ett spontanpass som ändrar nästa
 * ordinarie rekommendation. Kör hela applikationslagret (planerare → pass → lokal IndexedDB → outbox →
 * SupabaseTransport → apply_set_mutation/RLS) mot verklig lokal Supabase. Inga mockar av server eller motor.
 * Resultatet skrivs till docs/evidence/demo_two_users.md.
 */
import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { exercise } from '../../src/domain/catalog';
import { formatKg } from '../../src/domain/units';
import { validateHeavyPair } from '../../src/domain/decision_engine';
import type { PlanSnapshot } from '../../src/domain/model';
import { openUserDb } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import type { AppContext, Clock } from '../../src/application/context';
import { SyncEngine } from '../../src/application/sync';
import { completeOnboarding, GYM_STANDARD, type OnboardingInput } from '../../src/application/profile';
import { finishSession, logSet, previewExtra, previewNext, startSession } from '../../src/application/training';
import { closeSql, newUser, sql, type TestUser } from './dbHelpers';

class SimClock implements Clock {
  constructor(public t: number) {}
  now() {
    return new Date(this.t).toISOString();
  }
  hours(h: number) {
    this.t += h * 3_600_000;
  }
}

type Actor = { name: string; user: TestUser; ctx: AppContext; sync: SyncEngine; clock: SimClock; online: boolean; log: string[] };

function actor(name: string, user: TestUser, start: string): Actor {
  const clock = new SimClock(Date.parse(start));
  const a: Actor = { name, user, clock, online: true, log: [], ctx: undefined as unknown as AppContext, sync: undefined as unknown as SyncEngine };
  a.ctx = { db: openUserDb(user.id), userId: user.id, transport: new SupabaseTransport(user.client), clock, ids: { uuid: () => randomUUID() }, isOnline: () => a.online };
  a.sync = new SyncEngine(a.ctx);
  return a;
}

function describePlan(p: PlanSnapshot): string {
  return p.exercises.map((e) => `${exercise(e.exerciseId).nameSv} ${e.mode} ${e.sets}×${e.loadKind === 'duration_sec' ? `${e.targetSeconds ?? '?'}s` : e.reps}${e.kg === null ? ' (kalibrera)' : ` @ ${formatKg(Math.round(e.kg * 1000))} kg${e.loadKind === 'assistance_kg' ? ' assistans' : ''}`}`).join('; ');
}

/** Simulerad användare: utför föreskriften; kalibrering med vald vikt; enstaka miss och avbrott. */
async function runSession(a: Actor, i: number, snap: PlanSnapshot, behaviour: { rir: number | null; missOn?: number[]; stopEarlyOn?: number[]; calib: Record<string, number> }) {
  const s = await startSession(a.ctx, snap);
  const sets = (await a.ctx.db.sets.where('sessionId').equals(s.id).toArray()).sort((x, y) => x.sessionExerciseId.localeCompare(y.sessionExerciseId) || x.ordinal - y.ordinal);
  const exs = await a.ctx.db.sessionExercises.where('sessionId').equals(s.id).toArray();
  const order = new Map(exs.map((e) => [e.id, e.orderIndex]));
  sets.sort((x, y) => order.get(x.sessionExerciseId)! - order.get(y.sessionExerciseId)! || x.ordinal - y.ordinal);
  const stopEarly = behaviour.stopEarlyOn?.includes(i);
  const todo = stopEarly ? sets.slice(0, Math.ceil(sets.length / 2)) : sets;
  for (const [k, set] of todo.entries()) {
    a.clock.hours(0.04);
    const lk = exercise(set.exerciseId).loadKind;
    const miss = behaviour.missOn?.includes(i) && k === 1;
    await logSet(a.ctx, set.id, {
      actualGrams: lk === 'duration_sec' ? null : (set.targetGrams ?? behaviour.calib[set.exerciseId] ?? 20_000),
      actualReps: lk === 'duration_sec' ? null : Math.max(0, (set.targetReps ?? 8) - (miss ? 2 : 0)),
      actualSeconds: lk === 'duration_sec' ? (set.targetSeconds ?? 30) : null,
      rir: behaviour.rir,
    });
  }
  const fin = await finishSession(a.ctx, s.id);
  if (a.online) {
    const r = await a.sync.syncNow();
    expect(r.stoppedBy, `${a.name} pass ${i}`).toBeNull();
    expect(r.rejected, `${a.name} pass ${i}`).toBe(0);
  }
  a.log.push(`| ${i} | ${a.clock.now().slice(0, 10)} | ${snap.kind === 'extra' ? 'Spontan' : snap.templateKey} | ${fin.status} | ${describePlan(snap)} |`);
  return fin;
}

const report: string[] = [];

afterAll(async () => {
  mkdirSync('docs/evidence', { recursive: true });
  writeFileSync('docs/evidence/demo_two_users.md', report.join('\n') + '\n');
  await closeSql();
});

describe('DEMO: två konton × 36 pass + spontanpass mot lokal Supabase', () => {
  it('kör hela programmet separat för A (latsdrag) och B (assisterade chins, parregel, offlineperiod)', async () => {
    const A = actor('A', await newUser('demo-a'), '2026-03-02T06:30:00.000Z');
    const B = actor('B', await newUser('demo-b'), '2026-03-02T16:00:00.000Z');
    const base: OnboardingInput = { adultConfirmed: true, plannedSessionsPerWeek: 2, minutesPerSession: 60, experience: 'intermediate', equipment: GYM_STANDARD, goals: { squat: 2, bench_press: 1, deadlift: 1 }, estimates: [], healthConsent: false, restrictions: [] };
    await completeOnboarding(A.ctx, {
      ...base,
      estimates: [
        { exerciseId: 'squat', kind: '1rm', grams: 120_000 },
        { exerciseId: 'bench_press', kind: '3rm', grams: 90_000 },
        { exerciseId: 'deadlift', kind: '1rm', grams: 150_000 },
        { exerciseId: 'overhead_press', kind: '1rm', grams: 55_000 },
        { exerciseId: 'lat_pulldown', kind: '1rm', grams: 85_000 },
        { exerciseId: 'cable_lateral_raise', kind: '1rm', grams: 20_000 },
        { exerciseId: 'biceps_curl', kind: '1rm', grams: 30_000 },
        { exerciseId: 'triceps_pushdown', kind: '1rm', grams: 40_000 },
      ],
    });
    await completeOnboarding(B.ctx, {
      ...base,
      plannedSessionsPerWeek: 3,
      minutesPerSession: 45,
      experience: 'novice',
      substitutions: { lat_pulldown: 'assisted_pullup' },
      estimates: [{ exerciseId: 'bench_press', kind: 'submax', grams: 40_000, reps: 8, rir: 2 }],
      restrictions: [{ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' }],
    });
    expect((await A.sync.syncNow()).stoppedBy).toBeNull();
    expect((await B.sync.syncNow()).stoppedBy).toBeNull();

    const calibA = { cable_lateral_raise: 10_000 };
    const calibB: Record<string, number> = { squat: 40_000, deadlift: 50_000, overhead_press: 20_000, assisted_pullup: 40_000, cable_lateral_raise: 5_000, biceps_curl: 8_000, triceps_pushdown: 15_000 };
    let extraEvidence = '';
    const assistTrail: number[] = [];
    const benchTrailA: number[] = [];
    for (let i = 1; i <= 36; i++) {
      // A: 2 pass/vecka; spontanpass före pass 21 som ändrar nästa ordinarie rekommendation.
      if (i === 21) {
        const before = await previewNext(A.ctx);
        A.clock.hours(-30);
        const extra = await previewExtra(A.ctx, { minutes: 30, readiness: 'good' });
        await runSession(A, 0, extra, { rir: 2, calib: calibA });
        A.clock.hours(30 - 1.5);
        const after = await previewNext(A.ctx);
        const changed = JSON.stringify(before.exercises) !== JSON.stringify(after.exercises);
        extraEvidence = [
          `**Nästa ordinarie (${before.templateKey}) före spontanpass:** ${describePlan(before)}`,
          '',
          `**Spontanpass (30 min, dagsform bra) ~28 h före:** ${describePlan(extra)}`,
          '',
          `**Nästa ordinarie (${after.templateKey}) efter spontanpass:** ${describePlan(after)}`,
          '',
          `Skälkoder efter: ${[...new Set(after.exercises.flatMap((e) => e.reasons))].join(', ')}`,
          '',
          `Rotationen oförändrad: ${before.templateKey === after.templateKey ? 'ja' : 'NEJ'}. Rekommendationen ändrad: ${changed ? 'ja' : 'NEJ'}.`,
        ].join('\n');
        expect(after.templateKey).toBe(before.templateKey);
        expect(changed).toBe(true);
      }
      const pa = await previewNext(A.ctx);
      const benchA = pa.exercises.find((e) => e.exerciseId === 'bench_press' && e.mode === 'heavy');
      if (benchA?.kg) benchTrailA.push(benchA.kg);
      await runSession(A, i, pa, { rir: i % 7 === 0 ? 1 : 3, missOn: [10, 11], stopEarlyOn: [15], calib: calibA });
      A.clock.hours(84);

      // B: 3 pass/vecka, inga RIR (novis) och offline under pass 5–8.
      B.online = !(i >= 5 && i <= 8);
      const pb = await previewNext(B.ctx);
      for (const r of [['squat', 'deadlift']] as const) expect(validateHeavyPair(pb.exercises.map((e) => ({ exerciseId: e.exerciseId, mode: e.mode, sets: e.sets, plannedKg: e.kg, estimatedOneRM: e.estimatedOneRM })), r[0], r[1])).toBe(true);
      expect(pb.exercises.map((e) => e.exerciseId)).not.toContain('lat_pulldown');
      const ap = pb.exercises.find((e) => e.exerciseId === 'assisted_pullup');
      if (ap?.kg != null) assistTrail.push(ap.kg);
      await runSession(B, i, pb, { rir: null, calib: calibB });
      if (i === 8) {
        B.online = true;
        const r = await B.sync.syncNow();
        expect(r.stoppedBy).toBeNull();
      }
      B.clock.hours(56);
    }
    expect(await A.sync.pendingCount()).toBe(0);
    expect(await B.sync.pendingCount()).toBe(0);

    // --- Verifiering mot databasen ---
    const counts = async (u: TestUser) => (await sql<{ kind: string; n: number }>(`select kind, count(*)::int n from public.training_sessions where user_id=$1 group by kind order by kind`, [u.id])).map((r) => `${r.kind}: ${r.n}`).join(', ');
    const setCount = async (u: TestUser) => (await sql<{ n: number }>(`select count(*)::int n from public.training_sets where user_id=$1 and status='done' and deleted_at is null`, [u.id]))[0].n;
    const localDone = async (a: Actor) => (await a.ctx.db.sets.toArray()).filter((s) => s.status === 'done' && !s.deleted).length;
    expect(await setCount(A.user)).toBe(await localDone(A));
    expect(await setCount(B.user)).toBe(await localDone(B));
    const planned = async (u: TestUser) => (await sql<{ n: number }>(`select count(*)::int n from public.training_sessions where user_id=$1 and kind='planned'`, [u.id]))[0].n;
    expect(await planned(A.user)).toBe(36);
    expect(await planned(B.user)).toBe(36);
    // Övningsval separerade: latsdrag bara hos A, assisterade chins bara hos B.
    const slugs = async (u: TestUser) => (await sql<{ s: string }>(`select distinct exercise_slug s from public.session_exercises where user_id=$1`, [u.id])).map((r) => r.s);
    expect(await slugs(A.user)).toContain('lat_pulldown');
    expect(await slugs(A.user)).not.toContain('assisted_pullup');
    expect(await slugs(B.user)).toContain('assisted_pullup');
    expect(await slugs(B.user)).not.toContain('lat_pulldown');
    // B:s parregel: aldrig tung knäböj och tung marklyft i samma pass.
    const bothHeavy = await sql(`select session_id from public.session_exercises where user_id=$1 and mode='heavy' and exercise_slug in ('squat','deadlift') group by session_id having count(distinct exercise_slug)=2`, [B.user.id]);
    expect(bothHeavy).toEqual([]);
    // Ingen blandad historik: ingen rad hos A refererar B:s poster och vice versa (FK + RLS).
    const cross = await sql(`select count(*)::int n from public.training_sets t join public.session_exercises e on e.id=t.session_exercise_id where t.user_id <> e.user_id`);
    expect(cross[0].n).toBe(0);
    const bSeesA = await B.user.client.from('training_sets').select('id').eq('user_id', A.user.id);
    expect(bSeesA.data).toEqual([]);
    // Progressionsriktning: assistans minskar (lägre = progression) och A:s tunga bänk ökar.
    expect(assistTrail.at(-1)!).toBeLessThan(assistTrail[0]);
    expect(benchTrailA.at(-1)!).toBeGreaterThan(benchTrailA[0]);

    report.push(
      '# Demo: två oberoende konton, 36 pass vardera och spontanpass',
      '',
      `Genererad av \`tests/db/demo_two_users.test.ts\` mot lokal Supabase (${new Date().toISOString().slice(0, 10)}). Simulerad klocka; alla data syntetiska.`,
      '',
      '## Konton',
      `- **A** (\`${A.user.id}\`): 2 pass/vecka, 60 min, medelvan, **latsdrag**, RIR anges.`,
      `- **B** (\`${B.user.id}\`): 3 pass/vecka, 45 min, novis, **assisterade chins** (eget variantval), \`block_pair_heavy(squat, deadlift)\`, inga RIR, offline under pass 5–8.`,
      '',
      '## Verifierat i databasen',
      `- A: ${await counts(A.user)} · utförda set på server = lokalt = ${await setCount(A.user)}`,
      `- B: ${await counts(B.user)} · utförda set på server = lokalt = ${await setCount(B.user)}`,
      `- Latsdrag endast hos A, assisterade chins endast hos B: ja`,
      `- B: pass med både tung knäböj och tung marklyft: ${bothHeavy.length}`,
      `- Set som pekar på annan användares övning: ${cross[0].n}; B:s läsning av A:s set: ${bSeesA.data?.length ?? 0} rader`,
      `- B assistans (kg) över tid: ${assistTrail.map((x) => formatKg(Math.round(x * 1000))).join(' → ')}`,
      `- A tung bänkpress (kg) över tid: ${[...new Set(benchTrailA)].map((x) => formatKg(Math.round(x * 1000))).join(' → ')}`,
      '',
      '## Spontanpass som ändrar nästa ordinarie rekommendation',
      '',
      extraEvidence,
      '',
      '## Passlogg A',
      '| # | Datum | Mall | Status | Föreskrift |',
      '|---|---|---|---|---|',
      ...A.log,
      '',
      '## Passlogg B',
      '| # | Datum | Mall | Status | Föreskrift |',
      '|---|---|---|---|---|',
      ...B.log,
    );
  }, 600_000);
});
