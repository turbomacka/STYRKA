import { describe, expect, it } from 'vitest';
import { estimatedOneRepMax, initialPrescription, recoveryGate, recommendNext, urgencyForSpontaneous, validateHeavyPair } from '../../src/domain/decision_engine';
import { prescribe, submaxE1rm } from '../../src/domain/prescription';
import { canCountAsPlanned, planExtra, planRegular, TEMPLATES, templateKeyFor } from '../../src/planner/planner';
import cases from './cases.json';
import { ALL_ESTIMATES, NOW, est, hoursBefore, input, performed, rule, sets, symptom } from './helpers';

const byId = (id: string) => cases.cases.find((c) => c.id === id)!;

describe('fixtures/cases.json (motorfall P01–P08, P12; P09–P11 i sync/DB-tester)', () => {
  it('P01', () => expect(estimatedOneRepMax({ kind: '3rm', kg: byId('P01').input.kg as number })).toBe(byId('P01').expected.e1rm));
  it('P02/P03', () => {
    for (const id of ['P02', 'P03']) {
      const c = byId(id);
      const r = initialPrescription({ exerciseId: 'bench_press', estimate: { kind: '1rm', kg: c.input.e1rm as number }, experience: c.input.experience as 'novice', mode: 'heavy', increment: c.input.stepKg as number });
      expect({ kg: r.kg, sets: r.sets, targetReps: r.reps }).toEqual(c.expected);
    }
  });
  it('P04', () => {
    const r = initialPrescription({ exerciseId: 'squat', estimate: null, experience: 'novice', mode: 'heavy', increment: 2.5 });
    expect({ kg: r.kg, reason: r.reasons[0] }).toEqual(byId('P04').expected);
  });
  it('P05/P06', () => {
    expect(validateHeavyPair([{ exerciseId: 'squat', mode: 'heavy', sets: 3 }, { exerciseId: 'deadlift', mode: 'heavy', sets: 2 }], 'squat', 'deadlift')).toBe(byId('P05').expected.allowed);
    expect(validateHeavyPair([{ exerciseId: 'squat', mode: 'heavy', sets: 3 }, { exerciseId: 'deadlift', mode: 'light', sets: 2 }], 'squat', 'deadlift')).toBe(byId('P06').expected.allowed);
  });
  it('P07', () => {
    const g = recoveryGate(96, 'limping', true);
    expect(g.state).toBe(byId('P07').expected.state);
  });
  it('P08', () => expect(urgencyForSpontaneous({ minutes: 20, lastHeavyRelevantHours: 20, symptom: 'none' }).allowHeavy).toBe(byId('P08').expected.automaticallyRecommendHeavySameMovement));
  it('P12', () => {
    const p = initialPrescription({ exerciseId: 'bench_press', estimate: { kind: '1rm', kg: 100 }, experience: 'intermediate', mode: 'heavy', increment: 2.5 });
    const r = recommendNext({ previous: p, history: [{ exerciseId: 'bench_press', whenUtc: NOW, complete: false, voluntaryAbort: true, plannedTargetReps: 5, bandMax: 7, symptom: 'none', sets: [{ kind: 'work', status: 'done', plannedKg: 77.5, actualKg: 77.5, plannedReps: 5, actualReps: 5, rir: null, technique: 'controlled' }] }], experience: 'intermediate', increment: 2.5, hoursSinceRelevant: 72, relevantSymptoms: 'none', impactedRegion: false });
    expect(r.reasons[0] === 'PARTIAL_NOT_FAILURE').toBe(!byId('P12').expected.treatAsFailure);
  });
});

describe('schemagenerator 08', () => {
  it('väljer mall cykliskt per frekvens 1–7 utan kalenderreset', () => {
    expect([0, 1, 2, 3].map((i) => templateKeyFor(1, i))).toEqual(['single_A', 'single_B', 'single_C', 'single_A']);
    expect([0, 1, 2, 3].map((i) => templateKeyFor(2, i))).toEqual(['A', 'B', 'C', 'A']);
    expect(templateKeyFor(7, 6)).toBe('short_accessories');
    for (let f = 1; f <= 7; f++) {
      const split = TEMPLATES.splits[String(f)];
      split.forEach((key, i) => expect(planRegular(input({ rotationIndex: i, exerciseSettings: ALL_ESTIMATES, profile: { plannedSessionsPerWeek: f } })).templateKey).toBe(key));
    }
  });

  it('varje snapshot bär motor-, mall-, regel- och katalogversion samt inputsHash', () => {
    const s = planRegular(input({ exerciseSettings: ALL_ESTIMATES }));
    expect(s).toMatchObject({ engineVersion: '1.0.0', templateVersion: '1.0.0', catalogVersion: '2.0.1' });
    expect(s.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    const s2 = planRegular(input({ exerciseSettings: ALL_ESTIMATES, minutes: 45 }));
    expect(s2.inputsHash).not.toBe(s.inputsHash);
  });

  it('användarvald variant: latsdrag → assisterade chins (separat lasthistorik)', () => {
    const s = planRegular(input({ exerciseSettings: ALL_ESTIMATES, profile: { substitutions: { lat_pulldown: 'assisted_pullup' } } }));
    const v = s.exercises.find((e) => e.substitutionFrom === 'lat_pulldown')!;
    expect(v.exerciseId).toBe('assisted_pullup');
    expect(v.kg).toBeNull(); // separat kalibrering, ingen omräkning från latsdragets e1RM
    expect(v.acceptedByUserAt).toBe(NOW);
  });

  it('variant utanför ersättningsfamiljen ignoreras (inget val utanför definierad familj)', () => {
    const s = planRegular(input({ exerciseSettings: ALL_ESTIMATES, profile: { substitutions: { lat_pulldown: 'biceps_curl' } } }));
    expect(s.exercises.map((e) => e.exerciseId)).toContain('lat_pulldown');
  });

  it('känslig underkroppsprofil: C-passet får endast EN av knäböj/marklyft (02 §7)', () => {
    const sens = planRegular(input({ rotationIndex: 2, exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'region_note', area: 'lower_back' })] }));
    expect(sens.exercises.filter((e) => e.exerciseId === 'squat' || e.exerciseId === 'deadlift').length).toBe(1);
    expect(sens.removed.map((r) => r.reason)).toContain('SENSITIVE_PROFILE_SINGLE_LOWER_LIFT');
  });

  it('block_exercise via område blockerar alla övningar som belastar området', () => {
    const s = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'block_exercise', area: 'shoulder' })] }));
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(['squat']);
    expect(s.warnings).toContain('WARN_NO_FULL_SCHEDULE');
    expect(s.status).toBe('no_full_schedule');
  });

  it('limit_mode och limit_sets respekteras', () => {
    const s = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'limit_mode', exerciseA: 'squat', maxMode: 'moderate' }), rule({ kind: 'limit_sets', exerciseA: 'bench_press', maxSets: 1 })] }));
    expect(s.exercises.find((e) => e.exerciseId === 'squat')!.mode).toBe('moderate');
    expect(s.exercises.find((e) => e.exerciseId === 'bench_press')!.sets).toBe(1);
  });

  it('inaktiv regel påverkar inte planen', () => {
    const s = planRegular(input({ exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'block_exercise', exerciseA: 'squat', active: false })] }));
    expect(s.exercises.map((e) => e.exerciseId)).toContain('squat');
  });

  it('transient symtom: ingen autohöjning tills nästa relevanta exponering', () => {
    const when = hoursBefore(NOW, 72);
    const h = [
      performed('squat', hoursBefore(NOW, 168), { kg: 92.5, reps: 5 }, sets(3, { kg: 92.5, reps: 5, rir: 3 })),
      performed('squat', when, { kg: 92.5, reps: 5 }, sets(3, { kg: 92.5, reps: 5, rir: 3 })),
    ];
    const sym = symptom({ area: 'knee', reaction: 'transient', reportedAt: hoursBefore(NOW, 70), sessionId: h[1].sessionId });
    const held = planRegular(input({ exerciseSettings: ALL_ESTIMATES, history: h, symptoms: [sym] })).exercises.find((e) => e.exerciseId === 'squat')!;
    expect(held.reps).toBe(5);
    expect(held.reasons).toContain('TRANSIENT_SYMPTOM_HOLD');
    const free = planRegular(input({ exerciseSettings: ALL_ESTIMATES, history: h })).exercises.find((e) => e.exerciseId === 'squat')!;
    expect(free.reps).toBe(6);
  });

  it('löst (resolvedAt) symtom spärrar inte längre', () => {
    const s = planRegular(input({ exerciseSettings: ALL_ESTIMATES, symptoms: [symptom({ area: 'knee', reaction: 'limping', resolvedAt: hoursBefore(NOW, 1) })] }));
    expect(s.exercises.map((e) => e.exerciseId)).toContain('squat');
  });

  it('kalibrering ⇒ användarens valda vikt blir nästa arbetsvikt; submax med RIR ger låg e1RM', () => {
    const h = [performed('squat', hoursBefore(NOW, 96), { kg: null, calibration: true, reps: 5 }, sets(3, { kg: 60, plannedKg: null, reps: 5, rir: 2 }))];
    const s = planRegular(input({ history: h })).exercises.find((e) => e.exerciseId === 'squat')!;
    expect(s.kg).toBe(60);
    expect(s.reasons).toContain('CALIBRATED_FROM_USER_WEIGHT');
    expect(s.estimatedOneRM).toBe(74);
    expect(submaxE1rm(60, 5, 2)!.kg).toBe(74);
    expect(submaxE1rm(60, 9, 2)).toBeNull();
    expect(submaxE1rm(60, 5, 4)).toBeNull();
  });

  it('frekvensändring ⇒ ny sekvens från index 0, historikens set opåverkade', () => {
    const h = [performed('squat', hoursBefore(NOW, 96), { kg: 92.5 }, sets(3, { kg: 92.5, reps: 5, rir: 3 }))];
    const frozen = JSON.stringify(h);
    const s = planRegular(input({ rotationIndex: 0, history: h, exerciseSettings: ALL_ESTIMATES, profile: { plannedSessionsPerWeek: 4 } }));
    expect(s.templateKey).toBe('lower_squat');
    expect(JSON.stringify(h)).toBe(frozen);
  });

  it('plankan: kalibrering i sekunder, sedan +5 s vid uppnått mål', () => {
    const cal = prescribe({ exerciseId: 'plank', mode: 'light', sets: 2, role: 'bonus', experience: 'novice', settings: null, history: [], gate: { hoursSinceRelevant: null, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: null });
    expect([cal.kg, cal.targetSeconds, cal.calibration]).toEqual([null, null, true]);
    const h1 = performed('plank', hoursBefore(NOW, 100), { loadKind: 'duration_sec', kg: null, targetSeconds: null, sets: 2, mode: 'light', reps: 1, bandMin: 1, bandMax: 1 }, sets(2, { kg: null, actualSeconds: 40, plannedSeconds: null, rir: 3 }), 'completed', 'light');
    const p1 = prescribe({ exerciseId: 'plank', mode: 'light', sets: 2, role: 'bonus', experience: 'novice', settings: null, history: [h1], gate: { hoursSinceRelevant: 100, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: null });
    expect(p1.targetSeconds).toBe(40);
    const h2 = performed('plank', hoursBefore(NOW, 50), { loadKind: 'duration_sec', kg: null, targetSeconds: 40, sets: 2, mode: 'light', reps: 1, bandMin: 1, bandMax: 1 }, sets(2, { kg: null, plannedSeconds: 40, actualSeconds: 40, rir: 3 }), 'completed', 'light');
    const p2 = prescribe({ exerciseId: 'plank', mode: 'light', sets: 2, role: 'bonus', experience: 'novice', settings: null, history: [h1, h2], gate: { hoursSinceRelevant: 50, relevantSymptoms: 'none', impactedRegion: false }, bodyweightKg: null });
    expect(p2.targetSeconds).toBe(45);
  });

  it('chins med extra vikt: utan kroppsvikt hålls lasten vid bandets topp (ingen gissning)', () => {
    const pl = { loadKind: 'bodyweight_plus_kg' as const, kg: 0, reps: 10, bandMin: 8, bandMax: 10, sets: 2, mode: 'moderate' as const };
    const h = [performed('pullup', hoursBefore(NOW, 200), pl, sets(2, { kg: 0, reps: 10, rir: 3 }), 'completed', 'moderate'), performed('pullup', hoursBefore(NOW, 100), pl, sets(2, { kg: 0, reps: 10, rir: 3 }), 'completed', 'moderate')];
    const g = { hoursSinceRelevant: 100, relevantSymptoms: 'none' as const, impactedRegion: false };
    expect(prescribe({ exerciseId: 'pullup', mode: 'moderate', sets: 2, role: 'supplementary', experience: 'novice', settings: null, history: h, gate: g, bodyweightKg: null }).reasons).toContain('BODYWEIGHT_UNKNOWN_HOLD');
    const withBw = prescribe({ exerciseId: 'pullup', mode: 'moderate', sets: 2, role: 'supplementary', experience: 'novice', settings: null, history: h, gate: g, bodyweightKg: 80 });
    expect([withBw.kg, withBw.reps]).toEqual([2.5, 8]);
  });

  it('användarens maxlasttak överskrids aldrig', () => {
    const s = planRegular(input({ exerciseSettings: [est('squat', 200, { maxLoadKg: 100 })] }));
    expect(s.exercises.find((e) => e.exerciseId === 'squat')!.kg).toBe(100);
  });
});

describe('spontanpass ändrar nästa ordinarie rekommendation (02 §8)', () => {
  it('tungt knäböjsextrapass i går ⇒ nästa A-pass får lätt knäböj i stället för tung, rotationen opåverkad', () => {
    const base = input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES });
    const before = planRegular(base);
    expect(before.exercises[0]).toMatchObject({ exerciseId: 'squat', mode: 'heavy', kg: 92.5 });
    const extra = planExtra({ ...base, nowUtc: hoursBefore(NOW, 20) }, { minutes: 30, readiness: 'good' });
    expect(extra.rotationIndex).toBeNull();
    const sq = extra.exercises.find((e) => e.exerciseId === 'squat')!;
    const done = performed('squat', hoursBefore(NOW, 20), { ...sq }, sets(sq.sets, { kg: sq.kg, reps: sq.reps, rir: 3 }), 'completed', sq.mode);
    done.sessionKind = 'extra';
    const after = planRegular({ ...base, history: [done] });
    expect(after.templateKey).toBe(before.templateKey);
    const sqAfter = after.exercises.find((e) => e.exerciseId === 'squat')!;
    expect(sqAfter.mode).toBe('light');
    expect(sqAfter.reasons).toEqual(expect.arrayContaining(['RECENT_LOWER_HEAVY', 'HEAVY_DOWNGRADED_TO_LIGHT']));
    expect(after.warnings).toContain('WARN_RECOVERY');
  });

  it('"Räkna som ordinarie" erbjuds endast när huvudarbetet faktiskt gjorts', () => {
    const next = planRegular(input({ rotationIndex: 0, exerciseSettings: ALL_ESTIMATES }));
    expect(canCountAsPlanned(next, [{ exerciseId: 'squat', doneWorkSets: 3 }])).toBe(true);
    expect(canCountAsPlanned(next, [{ exerciseId: 'squat', doneWorkSets: 1 }])).toBe(false);
    expect(canCountAsPlanned(next, [{ exerciseId: 'bench_press', doneWorkSets: 3 }])).toBe(false);
  });

  it('dagsform "pain" utesluter övningar i angivna områden och ger varning', () => {
    const s = planExtra(input({ exerciseSettings: ALL_ESTIMATES }), { minutes: 30, readiness: 'pain', painAreas: ['knee'] });
    expect(s.warnings).toContain('WARN_PAIN');
    for (const e of s.exercises) expect(['squat', 'deadlift', 'split_squat', 'leg_press']).not.toContain(e.exerciseId);
  });
});
