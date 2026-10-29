/**
 * Regression (CR 2026-10-10-01, SUB20): 2 100 planer (ordinarie pass och spontanpass; 1–7 pass/vecka, tre nivåer,
 * fem rotationslägen, fem tider; med parregel + nylig knäböj, permanent variantval + symtom).
 * Regeländringen 2026-10-16 ändrar avsiktligt återhämtningsfallen. Den ursprungliga kontrollsumman
 * finns oförändrad; scripts/verify-recovery-regression.mjs jämför mot 3ec01ef och verifierar att
 * samtliga skillnader gäller just nyligt arbete (405 ändrade, 1695 identiska planer).
 * Ny versionssatt referens låser fortfarande övning, nivå, set, reps, kg, sekunder, skäl, status och tid.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { RULESET_VERSION, type PlanSnapshot } from '../../src/domain/model';
import { planExtra, planRegular } from '../../src/planner/planner';
import { ALL_ESTIMATES, NOW, hoursBefore, input, performed, rule, sets, symptom } from './helpers';

type In = Parameters<typeof input>[0];
it('2 100 planer följer verifierad adaptiv referens; ursprunglig referens bevarad', () => {
  const out: Array<ReturnType<typeof strip>> = [];
  const strip = (p: PlanSnapshot) => ({ status: p.status, est: p.estimatedMinutes, removed: p.removed, warnings: p.warnings, ex: p.exercises.map((e) => [e.exerciseId, e.mode, e.sets, e.reps, e.kg, e.targetSeconds, e.calibration, [...e.reasons].sort().join(',')]) });
  for (const freq of [1, 2, 3, 4, 5, 6, 7]) for (const exp of ['novice', 'intermediate', 'experienced'] as const) for (const rot of [0, 1, 2, 3, 4]) for (const min of [20, 30, 45, 60, 90]) {
    const base = { exerciseSettings: ALL_ESTIMATES, rotationIndex: rot, minutes: min, profile: { plannedSessionsPerWeek: freq, experience: exp } };
    out.push(strip(planRegular(input(base as In))));
    out.push(strip(planRegular(input({ ...base, restrictions: [rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' })], history: [performed('squat', hoursBefore(NOW, 30), { kg: 80, mode: 'heavy', sets: 3, reps: 5 }, sets(3, { kg: 80, reps: 5, rir: 2 }))] } as In))));
    out.push(strip(planRegular(input({ ...base, profile: { ...base.profile, substitutions: { lat_pulldown: 'assisted_pullup' } }, symptoms: [symptom({ area: 'knee', reaction: 'transient' })] } as In))));
    out.push(strip(planExtra(input(base as In), { minutes: min, readiness: (['good', 'normal', 'tired', 'pain'] as const)[rot % 4], painAreas: rot % 4 === 3 ? ['knee'] : [] })));
  }
  const json = JSON.stringify(out);
  const original = JSON.parse(readFileSync('tests/unit/golden/plans_pre_cr_3ec01ef.json', 'utf8')) as { sha256: string };
  expect(original.sha256).toBe('b04aa62d7c78a105e4d49c34a8b31953ef173e20d2fe68394217f9c5aa09e3e8');
  const golden = JSON.parse(readFileSync('tests/unit/golden/plans_adaptive_v2_2.json', 'utf8')) as { ruleSetVersion: string; plans: number; exercises: number; sha256: string };
  expect(golden.ruleSetVersion).toBe(RULESET_VERSION);
  expect({ plans: out.length, exercises: out.reduce((n: number, p: ReturnType<typeof strip>) => n + p.ex.length, 0), sha256: createHash('sha256').update(json).digest('hex') }).toEqual({ plans: golden.plans, exercises: golden.exercises, sha256: golden.sha256 });
});
