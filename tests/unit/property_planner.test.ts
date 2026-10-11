/** Property-baserade tester: invarianta regler över slumpgenererade men giltiga profiler (04 §2.2). */
import { describe, expect, it } from 'vitest';
import { recommendNext, type Exposure, type Mode } from '../../src/domain/decision_engine';
import { heavyPairAllowed } from '../../src/domain/heavyPair';
import type { ExerciseId } from '../../src/domain/catalog';
import { ALL_AREAS, ALL_EQUIPMENT, CATALOG, exercise, impactsAreas, isAvailable, type EquipmentSlug } from '../../src/domain/catalog';
import type { PerformedExercise, PlannerInput, RestrictionRule, SymptomReport } from '../../src/domain/model';
import { progressionDecision } from '../../src/domain/prescription';
import { planExtra, planRegular } from '../../src/planner/planner';
import { NOW, est, hoursBefore, input, performed, rule, sets, symptom } from './helpers';

/** Deterministisk PRNG (mulberry32) så att fel kan reproduceras via seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}

const SLUGS = CATALOG.map((c) => c.slug);
const MODES: Mode[] = ['heavy', 'moderate', 'light'];

function randomInput(seed: number): PlannerInput {
  const r = rng(seed);
  const equipment = ALL_EQUIPMENT.filter(() => r.chance(0.8)) as EquipmentSlug[];
  const restrictions: RestrictionRule[] = [];
  const nRules = r.int(0, 4);
  for (let i = 0; i < nRules; i++) {
    const kind = r.pick(['block_exercise', 'block_pair_heavy', 'limit_sets', 'limit_mode', 'region_note'] as const);
    restrictions.push(
      rule({
        kind,
        exerciseA: kind === 'region_note' ? null : r.pick(SLUGS),
        exerciseB: kind === 'block_pair_heavy' ? r.pick(SLUGS) : null,
        area: kind === 'region_note' ? r.pick(ALL_AREAS) : null,
        maxSets: kind === 'limit_sets' ? r.int(1, 3) : null,
        maxMode: kind === 'limit_mode' ? r.pick(MODES) : null,
        active: r.chance(0.9),
      }),
    );
  }
  const symptoms: SymptomReport[] = r.chance(0.3) ? [symptom({ area: r.pick(ALL_AREAS), reaction: r.pick(['transient', 'persistent', 'limping', 'swelling', 'baseline'] as const), reportedAt: hoursBefore(NOW, r.int(1, 400)) })] : [];
  const history: PerformedExercise[] = [];
  const nHist = r.int(0, 12);
  for (let i = 0; i < nHist; i++) {
    const slug = r.pick(SLUGS);
    const mode = r.pick(MODES);
    const kg = exercise(slug).loadKind === 'duration_sec' ? null : r.chance(0.2) ? null : r.int(4, 80) * 2.5;
    const reps = r.int(3, 12);
    history.push(performed(slug, hoursBefore(NOW, r.int(1, 900)), { kg, mode, reps, bandMin: Math.min(reps, 8), bandMax: Math.max(reps, 10), sets: r.int(1, 4), loadKind: exercise(slug).loadKind, targetSeconds: exercise(slug).loadKind === 'duration_sec' ? 30 : null }, sets(r.int(1, 4), { kg, reps: r.int(0, 12), rir: r.chance(0.5) ? r.int(0, 5) : null, technique: r.pick(['controlled', 'uncertain', 'poor'] as const), actualSeconds: r.int(10, 60) }), r.pick(['completed', 'partial', 'abandoned'] as const), mode));
  }
  return input({
    rotationIndex: r.int(0, 20),
    minutes: r.int(3, 24) * 5,
    exerciseSettings: SLUGS.filter(() => r.chance(0.6)).map((s) => est(s, r.int(10, 120) * 2.5, { experience: r.chance(0.3) ? r.pick(['novice', 'intermediate', 'experienced'] as const) : null, incrementKg: r.chance(0.2) ? r.pick([0.5, 1, 1.25, 2.5, 5]) : null, maxLoadKg: r.chance(0.1) ? r.int(20, 100) : null })),
    restrictions,
    symptoms,
    history,
    profile: {
      plannedSessionsPerWeek: r.int(1, 7),
      experience: r.pick(['novice', 'intermediate', 'experienced'] as const),
      equipment,
      favorites: SLUGS.filter(() => r.chance(0.1)),
      substitutions: r.chance(0.3) ? { lat_pulldown: r.pick(['assisted_pullup', 'pullup'] as ExerciseId[]) } : {},
      bodyweightKg: r.chance(0.5) ? r.int(50, 110) : null,
    },
  });
}

function checkInvariants(inp: PlannerInput, snap: ReturnType<typeof planRegular>) {
  const eq = new Set(inp.profile.equipment);
  const ids = snap.exercises.map((e) => e.exerciseId);
  expect(new Set(ids).size).toBe(ids.length);
  for (const e of snap.exercises) {
    expect(isAvailable(e.exerciseId, eq)).toBe(true);
    const blocked = inp.restrictions.some((r) => r.active && r.kind === 'block_exercise' && (r.exerciseA === e.exerciseId || (!r.exerciseA && r.area && impactsAreas(e.exerciseId, [r.area]))));
    expect(blocked).toBe(false);
    expect(e.sets).toBeGreaterThanOrEqual(1);
    expect(e.sets).toBeLessThanOrEqual(4);
    if (e.kg !== null) {
      expect(e.kg).toBeGreaterThanOrEqual(0);
      expect(e.kg).toBeLessThanOrEqual(500);
      expect(Math.round(e.kg * 1000)).toBe(e.kg * 1000); // exakt i gram
    }
    // Ingen viktsiffra för last utan giltig källa (kalibrering).
    if (e.calibration) expect(e.kg).toBeNull();
    if (e.loadKind === 'assistance_kg' || e.loadKind === 'bodyweight_plus_kg') expect(e.estimatedOneRM).toBeNull();
    for (const r of inp.restrictions) {
      if (r.active && r.kind === 'limit_sets' && r.exerciseA === e.exerciseId && r.maxSets !== null) expect(e.sets).toBeLessThanOrEqual(r.maxSets);
      if (r.active && r.kind === 'limit_mode' && r.exerciseA === e.exerciseId && r.maxMode === 'light') expect(e.mode).toBe('light');
    }
  }
  for (const r of inp.restrictions) {
    if (r.active && r.kind === 'block_pair_heavy' && r.exerciseA && r.exerciseB) {
      expect(heavyPairAllowed(snap.exercises.map((e) => ({ exerciseId: e.exerciseId, mode: e.mode, sets: e.sets, plannedKg: e.kg, estimatedOneRM: e.estimatedOneRM })), r.exerciseA, r.exerciseB)).toBe(true);
    }
  }
  if (snap.status !== 'empty' && snap.status !== 'time_insufficient') expect(snap.estimatedMinutes).toBeLessThanOrEqual(snap.budgetMinutes + 1);
  if (snap.status === 'time_insufficient') expect(snap.exercises.every((e) => e.mode !== 'heavy')).toBe(true);
}

describe('property: schemagenerator', () => {
  it('600 slumpade giltiga profiler: invarianter håller, deterministiskt, terminerar', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const inp = randomInput(seed);
      let a, b;
      try {
        a = planRegular(inp);
        b = planRegular(structuredClone(inp));
      } catch (e) {
        throw new Error(`seed ${seed}: ${(e as Error).message}`, { cause: e });
      }
      expect(JSON.stringify(a), `seed ${seed}`).toBe(JSON.stringify(b));
      checkInvariants(inp, a);
    }
  });

  it('300 slumpade spontanpass: invarianter håller och inget tungt flerled i grupp med arbete <48 h', () => {
    for (let seed = 1000; seed < 1300; seed++) {
      const inp = randomInput(seed);
      const r = rng(seed);
      const readiness = r.pick(['good', 'normal', 'tired', 'pain'] as const);
      const minutes = r.int(3, 24) * 5;
      const snap = planExtra(inp, { minutes, readiness });
      checkInvariants({ ...inp, minutes }, snap);
      expect(snap.kind).toBe('extra');
      expect(snap.rotationIndex).toBeNull();
      if (readiness === 'tired') expect(snap.exercises.every((e) => e.mode !== 'heavy' && e.sets <= 2)).toBe(true);
      if (readiness === 'pain') expect(snap.warnings).toContain('WARN_PAIN');
      for (const e of snap.exercises.filter((x) => x.mode === 'heavy')) {
        const recent = inp.history.some((h) => exercise(h.exerciseId).recoveryGroup === exercise(e.exerciseId).recoveryGroup && (Date.parse(NOW) - Date.parse(h.whenUtc)) / 3.6e6 < 48 && h.sets.some((s) => s.kind === 'work' && s.status === 'done'));
        expect(recent, `seed ${seed}`).toBe(false);
      }
    }
  });
});

describe('property: lastneutral progression speglar referensmotorn', () => {
  it('progressionDecision ger samma beslut som recommendNext för extern last (2000 fall)', () => {
    const r = rng(42);
    for (let i = 0; i < 2000; i++) {
      const bandMin = r.int(4, 8);
      const bandMax = bandMin + r.int(0, 4);
      const reps = r.int(bandMin, bandMax);
      const nSets = r.int(1, 4);
      const kg = r.int(8, 60) * 2.5;
      const prev = { exerciseId: 'bench_press' as const, kg, reps, sets: nSets, bandMin, bandMax, mode: 'heavy' as const, state: 'normal' as const, reasons: [], engineVersion: '1.0.0' as const, confidence: 'low' as const };
      const history: Exposure[] = Array.from({ length: r.int(0, 3) }, () => {
        const done = r.int(0, nSets + 1);
        return {
          exerciseId: 'bench_press',
          whenUtc: NOW,
          complete: r.chance(0.8),
          voluntaryAbort: r.chance(0.1),
          plannedTargetReps: r.chance(0.8) ? reps : reps + 1,
          bandMax,
          symptom: 'none',
          sets: Array.from({ length: done }, () => ({ kind: 'work' as const, status: r.chance(0.9) ? ('done' as const) : ('skipped' as const), plannedKg: kg, actualKg: r.chance(0.9) ? kg : kg - 2.5, plannedReps: reps, actualReps: r.int(reps - 2, reps + 1), rir: r.chance(0.5) ? r.int(0, 4) : null, technique: r.pick(['controlled', 'uncertain', 'poor'] as const) })),
        };
      });
      const ref = recommendNext({ previous: prev, history, experience: 'novice', increment: 0.5, hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false });
      const d = progressionDecision({ previous: prev, exposures: history });
      const expected = ref.reasons[0];
      const mapped = d.kind === 'hold' ? d.reason : d.reason;
      expect(mapped, `case ${i}`).toBe(expected === 'STEP_EXCEEDS_PROGRESS_CAP' ? 'DOUBLE_PROGRESS_WEIGHT' : expected);
    }
  });
});
