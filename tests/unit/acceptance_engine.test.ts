/**
 * Acceptanstest 04 §2.1 på motor-/planerarnivå. Numreringen följer specifikationen.
 * Applikations-, lagrings- och DB-nivåfall finns i övriga testfiler (se docs/TESTPROTOKOLL.md).
 */
import { describe, expect, it } from 'vitest';
import { estimatedOneRepMax, initialPrescription, recommendNext, recoveryGate, validateHeavyPair, type Exposure } from '../../src/domain/decision_engine';
import { heavyPairAllowed } from '../../src/domain/heavyPair';
import { exercise } from '../../src/domain/catalog';
import { prescribe } from '../../src/domain/prescription';
import { gramsToDecimalString, parseKg } from '../../src/domain/units';
import { planExtra, planRegular, PlannerInputError } from '../../src/planner/planner';
import { ALL_ESTIMATES, NOW, est, hoursBefore, input, performed, rule, sets, symptom } from './helpers';

const bench100 = initialPrescription({ exerciseId: 'bench_press', estimate: { kind: '1rm', kg: 100 }, experience: 'intermediate', mode: 'heavy', increment: 2.5 });
const exp = (over: Partial<Exposure> = {}, rir: number | null = 3, reps = 5, kg = 77.5): Exposure => ({
  exerciseId: 'bench_press',
  whenUtc: '2026-10-01T12:00:00Z',
  complete: true,
  plannedTargetReps: 5,
  bandMax: 7,
  sets: Array.from({ length: 3 }, () => ({ kind: 'work' as const, status: 'done' as const, plannedKg: 77.5, actualKg: kg, plannedReps: 5, actualReps: reps, rir, technique: 'controlled' as const })),
  symptom: 'none',
  ...over,
});
const next = (history: Exposure[], over: Partial<Parameters<typeof recommendNext>[0]> = {}) =>
  recommendNext({ previous: bench100, history, experience: 'intermediate', increment: 2.5, hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false, ...over });

describe('04 §2.1 acceptanstest – motor och planerare', () => {
  it('01: 90 kg 3RM → 99 kg e1RM; felaktig vikt förkastas', () => {
    expect(estimatedOneRepMax({ kind: '3rm', kg: 90 })).toBe(99);
    expect(() => estimatedOneRepMax({ kind: '1rm', kg: -1 })).toThrow();
    expect(() => estimatedOneRepMax({ kind: '1rm', kg: 501 })).toThrow();
    expect(() => estimatedOneRepMax({ kind: '1rm', kg: Number.NaN })).toThrow();
  });

  it('02: nybörjare e1RM 100 bänk heavy, 2,5 kg steg → 65 kg, 2×8 (även via planeraren)', () => {
    const r = initialPrescription({ exerciseId: 'bench_press', estimate: { kind: '1rm', kg: 100 }, experience: 'novice', mode: 'heavy', increment: 2.5 });
    expect([r.kg, r.sets, r.reps]).toEqual([65, 2, 8]);
    const snap = planRegular(input({ rotationIndex: 1, profile: { experience: 'novice' }, exerciseSettings: [est('bench_press', 100), est('deadlift', 150), est('lat_pulldown', 80)] }));
    const bench = snap.exercises.find((e) => e.exerciseId === 'bench_press')!;
    expect([bench.kg, bench.sets, bench.reps, bench.mode]).toEqual([65, 2, 8, 'heavy']);
  });

  it('03: medelvan e1RM 100 → 77,5 kg, 3×5; samma indata ⇒ byte-identiskt förslag', () => {
    expect([bench100.kg, bench100.sets, bench100.reps]).toEqual([77.5, 3, 5]);
    const a = planRegular(input({ rotationIndex: 1, exerciseSettings: ALL_ESTIMATES }));
    const b = planRegular(input({ rotationIndex: 1, exerciseSettings: ALL_ESTIMATES }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.exercises.find((e) => e.exerciseId === 'bench_press')!.kg).toBe(77.5);
  });

  it('04: okänd maxstyrka ⇒ kg=null, CALIBRATION_REQUIRED, aldrig slumpvikt', () => {
    const r = initialPrescription({ exerciseId: 'squat', estimate: null, experience: 'novice', mode: 'heavy', increment: 2.5 });
    expect(r.kg).toBeNull();
    expect(r.reasons).toContain('CALIBRATION_REQUIRED');
    const snap = planRegular(input({}));
    for (const e of snap.exercises) {
      expect(e.kg).toBeNull();
      expect(e.calibration).toBe(true);
    }
    expect(snap.warnings).toContain('WARN_CAL');
  });

  it('05: assisterade chins normaliseras inte till skivstångs-1RM', () => {
    const r = initialPrescription({ exerciseId: 'assisted_pullup', estimate: { kind: '1rm', kg: 100 }, experience: 'novice', mode: 'light', increment: 5 });
    expect(r.kg).toBeNull();
    const p = prescribe({ exerciseId: 'assisted_pullup', mode: 'moderate', sets: 2, role: 'supplementary', experience: 'novice', settings: est('assisted_pullup', 100), history: [], gate: { hoursSinceRelevant: null, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: 80 });
    expect(p.kg).toBeNull();
    expect(p.estimatedOneRM).toBeNull();
    expect(exercise('assisted_pullup').loadKind).toBe('assistance_kg');
  });

  it('06: vid minskad assistans blir progressionen korrekt riktad (lägre assistans = progression)', () => {
    const when = hoursBefore(NOW, 72);
    const h = [
      performed('assisted_pullup', hoursBefore(NOW, 240), { loadKind: 'assistance_kg', kg: 30, reps: 10, bandMin: 8, bandMax: 10, sets: 2, mode: 'moderate', incrementKg: 5 }, sets(2, { kg: 30, reps: 10, rir: 3 }), 'completed', 'moderate'),
      performed('assisted_pullup', when, { loadKind: 'assistance_kg', kg: 30, reps: 10, bandMin: 8, bandMax: 10, sets: 2, mode: 'moderate', incrementKg: 5 }, sets(2, { kg: 30, reps: 10, rir: 3 }), 'completed', 'moderate'),
    ];
    const p = prescribe({ exerciseId: 'assisted_pullup', mode: 'moderate', sets: 2, role: 'supplementary', experience: 'novice', settings: null, history: h, gate: { hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: null });
    expect(p.kg).toBe(25);
    expect(p.reps).toBe(8);
    expect(p.reasons).toContain('ASSISTANCE_REDUCED');
    // Två missar ⇒ MER assistans (lättare), aldrig mindre.
    const miss = [h[0], h[1]].map((x) => ({ ...x, sets: sets(2, { kg: 30, reps: 6, plannedReps: 10, rir: null }) }));
    const p2 = prescribe({ exerciseId: 'assisted_pullup', mode: 'moderate', sets: 2, role: 'supplementary', experience: 'novice', settings: null, history: miss, gate: { hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: null });
    expect(p2.kg).toBe(35);
  });

  it('07: marklyft 2 lätta + knäböj 4 tunga tillåts utan uttrycklig parregel', () => {
    expect(validateHeavyPair([{ exerciseId: 'squat', mode: 'heavy', sets: 4 }, { exerciseId: 'deadlift', mode: 'light', sets: 2 }], 'squat', 'deadlift')).toBe(true);
    const sq = prescribe({ exerciseId: 'squat', mode: 'heavy', sets: 4, role: 'main', experience: 'intermediate', settings: est('squat', 120), history: [], gate: { hoursSinceRelevant: null, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: null });
    expect(sq.sets).toBe(4);
  });

  it('08: knäböj 4 tunga + marklyft 3 tunga avvisas vid aktiv block_pair_heavy; planeraren föreslår aldrig båda tunga', () => {
    expect(validateHeavyPair([{ exerciseId: 'squat', mode: 'heavy', sets: 4 }, { exerciseId: 'deadlift', mode: 'heavy', sets: 3 }], 'squat', 'deadlift')).toBe(false);
    // Knäböj "lätt" men med relativ last ≥75 % e1RM räknas som tung (02 §2) – får inte kombineras med tung marklyft.
    const pr = rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' });
    const h = [performed('squat', hoursBefore(NOW, 100), { kg: 95, mode: 'light', reps: 8, bandMin: 8, bandMax: 12, sets: 2, estimatedOneRM: 120 }, sets(2, { kg: 95, reps: 8, rir: 1 }), 'completed', 'light')];
    const snap = planRegular(input({ rotationIndex: 2, exerciseSettings: ALL_ESTIMATES, restrictions: [pr], history: h }));
    const sq = snap.exercises.find((e) => e.exerciseId === 'squat');
    const dl = snap.exercises.find((e) => e.exerciseId === 'deadlift');
    expect(dl?.mode).toBe('heavy');
    expect(sq).toBeUndefined();
    expect(snap.removed).toContainEqual({ exerciseId: 'squat', reason: 'PAIR_RULE_REMOVED' });
  });

  it('09: saknad utrustning ⇒ ingen föreslagen blockerad maskin', () => {
    for (let rot = 0; rot < 3; rot++) {
      const snap = planRegular(input({ rotationIndex: rot, exerciseSettings: ALL_ESTIMATES, profile: { equipment: ['rack', 'barbell', 'plates', 'bench', 'pullup-assist', 'dumbbell'] } }));
      for (const e of snap.exercises) for (const req of exercise(e.exerciseId).equipment) expect(['rack', 'barbell', 'plates', 'bench', 'pullup-assist', 'dumbbell']).toContain(req);
      // Rotation B now supplies horizontal pulling. Its available barbell variant
      // must be substituted just as the vertical pull is in rotations A and C.
      const sub = snap.exercises.find((e) => e.substitutionFrom === (rot===1?'cable_row':'lat_pulldown'));
      expect(sub?.exerciseId).toBe(rot===1?'barbell_row':'assisted_pullup');
      expect(sub?.reasons).toContain('EQUIPMENT_SUBSTITUTION');
    }
  });

  it('10: alla mål uppnådda, RIR 3, normal tid ⇒ reps+1 inom band', () => {
    const r = next([exp()]);
    expect([r.kg, r.reps]).toEqual([77.5, 6]);
    expect(r.reasons).toContain('DOUBLE_PROGRESS_REPS');
  });

  it('11: alla set vid bandets topp, god RIR, steg inom tak ⇒ +1 steg och åter till min-reps', () => {
    const prev = { ...bench100, reps: 7 };
    const h = [exp({ plannedTargetReps: 7, sets: exp().sets.map((s) => ({ ...s, plannedReps: 7, actualReps: 7 })) })];
    const r = recommendNext({ previous: prev, history: h, experience: 'intermediate', increment: 2.5, hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false });
    expect([r.kg, r.reps]).toEqual([80, 5]);
  });

  it('12: RIR 0 ⇒ inga automatiska extra kilon', () => {
    const r = next([exp({}, 0)]);
    expect(r.kg).toBe(77.5);
    expect(r.reps).toBe(5);
    expect(r.reasons).toContain('NUMERIC_RESERVE_HOLD');
  });

  it('13: RIR saknas ⇒ kräver två kompletta, kontrollerade tillfällen på samma målnivå', () => {
    expect(next([exp({}, null)]).reasons).toContain('WAIT_FOR_SECOND_CONFIRMED_PASS');
    expect(next([exp({}, null), exp({}, null)]).reps).toBe(6);
  });

  it('14: ett missat set ⇒ håll; två misslyckade fullständiga pass ⇒ minska enligt H', () => {
    const miss = exp({ sets: exp().sets.map((s, i) => (i === 2 ? { ...s, actualReps: 3 } : s)) }, null);
    const one = next([miss]);
    expect([one.kg, one.reasons[0]]).toEqual([77.5, 'FIRST_MISS_HOLD']);
    const two = next([miss, miss]);
    expect(two.kg).toBe(72.5); // max(2,5 ; 5 % av 77,5=3,875) = 3,875 → 73,625 → nedåt till 72,5
    expect(two.reasons[0]).toBe('TWO_CONSECUTIVE_MISSES');
  });

  it('15: avbrutet pass av tidsskäl behandlas inte som misslyckad styrka (P12)', () => {
    const aborted = exp({ complete: false, voluntaryAbort: true, sets: exp().sets.slice(0, 1) });
    const r = next([aborted, aborted]);
    expect(r.kg).toBe(77.5);
    expect(r.reasons[0]).toBe('PARTIAL_NOT_FAILURE');
  });

  it('16: dålig teknik ⇒ ingen automatisk ökning', () => {
    const poor = exp({ sets: exp().sets.map((s) => ({ ...s, technique: 'poor' as const })) });
    const r = next([poor, poor]);
    expect([r.kg, r.reps]).toEqual([77.5, 5]);
    expect(r.reasons[0]).toBe('TECHNIQUE_NOT_CONTROLLED');
  });

  it('17: 20 timmar efter tung knäböj ⇒ ingen automatisk tung knäböj i spontanpass (P08)', () => {
    const h = [performed('squat', hoursBefore(NOW, 20), { kg: 92.5, mode: 'heavy' }, sets(3, { kg: 92.5, reps: 5, rir: 2 }))];
    for (const readiness of ['good', 'normal'] as const) {
      const snap = planExtra(input({ exerciseSettings: ALL_ESTIMATES, history: h }), { minutes: 20, readiness });
      for (const e of snap.exercises) {
        if (exercise(e.exerciseId).recoveryGroup === 'lower') expect(e.mode).not.toBe('heavy');
      }
      expect(snap.kind).toBe('extra');
      expect(snap.reasons).toContain('TIME_LIMIT_20');
    }
    expect(recoveryGate(20, 'none', true).state).toBe('caution');
  });

  it('18: 72 timmar utan problem ⇒ inte automatiskt extra vikt på grund av tid', () => {
    const g72 = recoveryGate(72, 'none', true);
    const g50 = recoveryGate(50, 'none', true);
    expect([g72.state, g72.factor]).toEqual(['normal', 1]);
    expect(next([exp()], { hoursSinceRelevant: 72 })).toEqual(next([exp()], { hoursSinceRelevant: 50 }));
    expect(g50.factor).toBe(1);
  });

  it('19: 18 dagars uppehåll ⇒ omstart 5 %; 30 dagar ⇒ 10 % samt setreduktion', () => {
    const r18 = next([exp()], { hoursSinceRelevant: 18 * 24 });
    expect(r18.state).toBe('restart');
    expect(r18.kg).toBe(72.5); // 77,5 × 0,95 = 73,625 → 72,5
    const r30 = next([exp()], { hoursSinceRelevant: 30 * 24 });
    expect(r30.kg).toBe(67.5); // 77,5 × 0,90 = 69,75 → 67,5
    expect(r30.sets).toBe(2);
    // Via planeraren: knäböj 30 dagar sedan, 3 set ⇒ 2 set och reducerad vikt.
    const h = [performed('squat', hoursBefore(NOW, 30 * 24), { kg: 92.5, mode: 'heavy', reps: 5, sets: 3 }, sets(3, { kg: 92.5, reps: 5, rir: 3 }))];
    const snap = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES, history: h }));
    const sq = snap.exercises.find((e) => e.exerciseId === 'squat')!;
    expect(sq.state).toBe('restart');
    expect(sq.sets).toBe(2);
    expect(sq.kg).toBeLessThan(92.5);
  });

  it('20: ny hälta ⇒ review_required för berörd övning, ingen autohöjning (P07)', () => {
    const r = next([exp()], { relevantSymptoms: 'limping', impactedRegion: true, hoursSinceRelevant: 96 });
    expect([r.state, r.kg]).toEqual(['review_required', null]);
    const snap = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES, symptoms: [symptom({ area: 'knee', reaction: 'limping' })] }));
    expect(snap.exercises.map((e) => e.exerciseId)).not.toContain('squat');
    expect(snap.removed).toContainEqual({ exerciseId: 'squat', reason: 'SYMPTOM_REVIEW_REQUIRED' });
    expect(snap.warnings).toContain('WARN_REVIEW');
    // Ingen tyst tidsbaserad borttagning: 60 dagar senare gäller spärren fortfarande.
    const later = planRegular(input({ nowUtc: '2026-12-10T08:00:00.000Z', rotationIndex: 0, exerciseSettings: ALL_ESTIMATES, symptoms: [symptom({ area: 'knee', reaction: 'limping' })] }));
    expect(later.exercises.map((e) => e.exerciseId)).not.toContain('squat');
  });

  it('21: restriktion ändrad av användaren gäller framtida planer; tidigare snapshot oförändrat', () => {
    const before = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES }));
    const frozen = JSON.stringify(before);
    const after = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'block_exercise', exerciseA: 'squat' })] }));
    expect(after.exercises.map((e) => e.exerciseId)).not.toContain('squat');
    expect(JSON.stringify(before)).toBe(frozen);
    expect(before.exercises.map((e) => e.exerciseId)).toContain('squat');
  });

  it('22: plan med 20 min ⇒ tidsestimat ryms i budget (+1 min avrundning) eller anges som ej rymligt', () => {
    for (let f = 1; f <= 7; f++) {
      for (let rot = 0; rot < 7; rot++) {
        const snap = planRegular(input({ rotationIndex: rot, minutes: 20, exerciseSettings: ALL_ESTIMATES, profile: { plannedSessionsPerWeek: f } }));
        if (snap.status === 'time_insufficient' || snap.status === 'empty') expect(snap.warnings).toContain('WARN_TIME_INSUFFICIENT');
        else expect(snap.estimatedMinutes).toBeLessThanOrEqual(21);
      }
    }
  });

  it('23: för högt minsta viktsteg ⇒ håll vikt och dokumentera stegproblem', () => {
    const prev = initialPrescription({ exerciseId: 'cable_lateral_raise', estimate: { kind: '1rm', kg: 20 }, experience: 'intermediate', mode: 'heavy', increment: 2.5 });
    const top = { ...prev, kg: 15, reps: prev.bandMax };
    const h: Exposure[] = [{ ...exp(), exerciseId: 'cable_lateral_raise', plannedTargetReps: top.reps, sets: exp().sets.map((s) => ({ ...s, plannedKg: 15, actualKg: 15, plannedReps: top.reps, actualReps: top.reps })) }];
    const r = recommendNext({ previous: top, history: h, experience: 'intermediate', increment: 2.5, hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false });
    expect(r.kg).toBe(15);
    expect(r.reasons[0]).toBe('EQUIPMENT_BRIDGE_REPS');
    expect(r.reps).toBe(top.reps+1); // bounded bridge, not a permanent percentage stop
  });

  it('24: decimal 102,5 sparas 102.500; punkt och komma ger samma värde', () => {
    const a = parseKg('102,5');
    const b = parseKg('102.5');
    expect(a).toEqual({ ok: true, grams: 102500 });
    expect(b).toEqual(a);
    if (a.ok) expect(gramsToDecimalString(a.grams)).toBe('102.500');
    expect(parseKg('102,,5').ok).toBe(false);
  });

  it('25: 1–7 pass/vecka och 15–120 min valideras; utanför ger tydligt fel', () => {
    for (const f of [1, 7]) expect(() => planRegular(input({ profile: { plannedSessionsPerWeek: f } }))).not.toThrow();
    for (const f of [0, 8, 2.5]) expect(() => planRegular(input({ profile: { plannedSessionsPerWeek: f } }))).toThrow(PlannerInputError);
    for (const m of [15, 120]) expect(() => planRegular(input({ minutes: m }))).not.toThrow();
    for (const m of [14, 121, 40.5]) expect(() => planRegular(input({ minutes: m }))).toThrow(/VALIDATION_ERROR:minutes/);
  });

  it('41: avsaknad av maxvärde tvingar aldrig fram ett 1RM-försök', () => {
    const snap = planRegular(input({}));
    const all = JSON.stringify(snap);
    expect(all).not.toMatch(/MAX_TEST|1RM_TEST|AMRAP/);
    expect(snap.exercises.every((e) => e.reps < 50 && e.kg === null)).toBe(true);
  });

  it('43: tung benkombination tillåts inte när parregel finns (alla mallar, alla frekvenser)', () => {
    const pr = rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' });
    for (let f = 1; f <= 7; f++) for (let rot = 0; rot < 7; rot++) {
      const snap = planRegular(input({ rotationIndex: rot, exerciseSettings: ALL_ESTIMATES, restrictions: [pr], profile: { plannedSessionsPerWeek: f } }));
      expect(heavyPairAllowed(snap.exercises.map((e) => ({ exerciseId: e.exerciseId, mode: e.mode, sets: e.sets, plannedKg: e.kg, estimatedOneRM: e.estimatedOneRM })), 'squat', 'deadlift')).toBe(true);
    }
  });

  it('44: flera kombinationsbegränsningar (även cykliska) ger aldrig oändlig loop', () => {
    const rules = [
      rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' }),
      rule({ kind: 'block_pair_heavy', exerciseA: 'deadlift', exerciseB: 'bench_press' }),
      rule({ kind: 'block_pair_heavy', exerciseA: 'bench_press', exerciseB: 'squat' }),
      rule({ kind: 'block_pair_heavy', exerciseA: 'overhead_press', exerciseB: 'bench_press' }),
      rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'squat' }),
    ];
    for (let f = 1; f <= 7; f++) for (let rot = 0; rot < 7; rot++) {
      const t0 = performance.now();
      const snap = planRegular(input({ rotationIndex: rot, exerciseSettings: ALL_ESTIMATES, restrictions: rules, profile: { plannedSessionsPerWeek: f } }));
      expect(performance.now() - t0).toBeLessThan(500);
      expect(snap.exercises.filter((e) => e.mode === 'heavy').length).toBeLessThanOrEqual(1);
    }
  });

  it('45: symtom och inga tillåtna alternativ ⇒ neutralt tomläge, ingen improviserad övning', () => {
    const areas = ['knee', 'hip', 'lower_back', 'shoulder', 'elbow', 'wrist'] as const;
    const symptoms = areas.map((area) => symptom({ area, reaction: 'persistent' }));
    const snap = planRegular(input({ exerciseSettings: ALL_ESTIMATES, symptoms }));
    expect(snap.status).toBe('empty');
    expect(snap.exercises).toEqual([]);
    expect(snap.warnings).toEqual(expect.arrayContaining(['WARN_EMPTY', 'WARN_REVIEW']));
    const extra = planExtra(input({ exerciseSettings: ALL_ESTIMATES, symptoms }), { minutes: 30, readiness: 'normal' });
    expect(extra.exercises).toEqual([]);
    expect(extra.status).toBe('empty');
  });
});
