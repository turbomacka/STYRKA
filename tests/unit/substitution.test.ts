/**
 * STYRKA-CR-2026-10-10-01 – övningssubstitution på domän-/planerarnivå.
 * Numrering enligt anmodans §5 (SUB01–SUB24). Applikations-, offline- och DB-fall finns i egna filer.
 */
import { describe, expect, it } from 'vitest';
import { CATALOG, exercise, V1_SLUGS, type ExerciseId } from '../../src/domain/catalog';
import { heavyPairAllowed } from '../../src/domain/heavyPair';
import type { PlannedExercise } from '../../src/domain/model';
import { allRelations, APPROVED_PRIORS, relationBetween, relationsFrom, validateSubstitutionCatalog } from '../../src/domain/substitutionCatalog';
import { estimatedMinutesFor, planRegular, planReplacement, substitutionCandidates, verifySubstitutionInvariants } from '../../src/planner/planner';
import { ALL_ESTIMATES, NOW, est, hoursBefore, input, performed, plan, rule, sets, symptom } from './helpers';

const squatHeavy = plan('squat', { kg: 92.5, mode: 'heavy', sets: 3, reps: 5, estimatedOneRM: 120 });
const benchHeavy = plan('bench_press', { kg: 77.5, mode: 'heavy', sets: 3, reps: 5, estimatedOneRM: 100 });

describe('substitutionskatalog (replacement_seed.json, SUBST/1.0.0)', () => {
  it('är giltig: kända övningar, inga dubbletter, motivering, priors bara för godkända par', () => {
    expect(() => validateSubstitutionCatalog()).not.toThrow();
    const priors = allRelations().filter((r) => r.load_prior.kind === 'population_ratio').map((r) => [r.from, r.to]);
    expect(priors).toEqual(APPROVED_PRIORS.map((x) => [...x]));
  });

  it('täcker anmodans tabell §2.2 och varje mallövning har minst ett alternativ', () => {
    const table: Array<[ExerciseId, ExerciseId[]]> = [
      ['squat', ['front_squat', 'safety_bar_squat', 'smith_squat', 'hack_squat', 'goblet_squat', 'leg_press']],
      ['front_squat', ['squat', 'safety_bar_squat', 'goblet_squat']],
      ['deadlift', ['sumo_deadlift', 'trap_bar_deadlift', 'romanian_deadlift']],
      ['romanian_deadlift', ['dumbbell_romanian_deadlift', 'stiff_leg_deadlift', 'trap_bar_deadlift']],
      ['bench_press', ['dumbbell_bench_press', 'smith_bench_press', 'chest_press_machine', 'incline_bench_press']],
      ['overhead_press', ['dumbbell_shoulder_press', 'seated_barbell_press', 'shoulder_press_machine']],
      ['lat_pulldown', ['neutral_grip_lat_pulldown', 'assisted_pullup', 'pullup']],
      ['assisted_pullup', ['lat_pulldown', 'neutral_grip_lat_pulldown', 'pullup']],
      ['cable_row', ['chest_supported_row', 'seated_machine_row', 'one_arm_dumbbell_row']],
      ['cable_lateral_raise', ['dumbbell_lateral_raise', 'lateral_raise_machine']],
      ['biceps_curl', ['dumbbell_curl', 'cable_curl', 'incline_dumbbell_curl']],
      ['triceps_pushdown', ['rope_pushdown', 'overhead_triceps_extension']],
      ['cable_crunch', ['machine_crunch', 'weighted_crunch', 'plank']],
      ['bulgarian_split_squat', ['lunge', 'split_squat', 'step_up']],
    ];
    for (const [from, tos] of table) for (const to of tos) expect(relationBetween(from, to), `${from}->${to}`).toBeTruthy();
    for (const slug of ['squat', 'bench_press', 'deadlift', 'romanian_deadlift', 'overhead_press', 'lat_pulldown', 'cable_row', 'chest_supported_row', 'cable_lateral_raise', 'biceps_curl', 'triceps_pushdown', 'cable_crunch', 'split_squat'] as ExerciseId[]) {
      expect(relationsFrom(slug).length, slug).toBeGreaterThan(0);
    }
    // Ingen relation kallas likvärdig: alla har klass och svensk motivering.
    for (const r of allRelations()) expect(['close_variant', 'same_family', 'complementary']).toContain(r.relation);
  });

  it('katalog 2.0.0: version 1-övningarna är oförändrade och nya varianter har korrekt lastsemantik', () => {
    expect(CATALOG.filter((c) => V1_SLUGS.has(c.slug)).map((c) => c.slug)).toEqual([...V1_SLUGS]);
    expect(exercise('squat')).toMatchObject({ loadKind: 'external_kg', defaultIncrementKg: 2.5, timeMultiplier: 1, catalogSince: '1.0.0' });
    expect(exercise('dumbbell_bench_press').loadDisplayBasis).toBe('per_hand_kg');
    expect(exercise('assisted_pullup').loadDisplayBasis).toBe('assistance_kg');
    expect(exercise('plank').loadDisplayBasis).toBe('seconds');
    expect(exercise('leg_press').requiresEquipmentProfile).toBe(true);
    expect(exercise('bulgarian_split_squat')).toMatchObject({ unilateral: true, timeMultiplier: 2 });
    // Befintlig split squat: tidsmodellen oförändrad.
    expect(exercise('split_squat').timeMultiplier).toBe(1);
  });
});

describe('§5 SUB-fall (domän/planerare)', () => {
  it('SUB01: målövningens egen historik styr vikten; knäböjens kg kopieras inte', () => {
    const h = [performed('front_squat', hoursBefore(NOW, 96), { kg: 60, mode: 'heavy', reps: 5, sets: 3, loadKind: 'external_kg' }, sets(3, { kg: 60, reps: 5, rir: 3 }))];
    const r = planReplacement(input({ exerciseSettings: ALL_ESTIMATES, history: h }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' });
    expect(r.status).toBe('ok');
    expect(r.planned!.loadEstimationKind).toBe('target_observed');
    expect(r.planned!.kg).toBe(60); // egen historik (reps+1 vid nästa), inte 92,5 eller 0,8 × 120
    expect(r.planned!.reps).toBe(6);
    expect(r.planned!.calibrationSuggestionKg).toBeNull();
  });

  it('SUB02: knäböj 1RM 120, van vid frontböj, inga måldata ⇒ e1RM 96, första förslag 57,5 kg (låg säkerhet, redigerbart)', () => {
    const r = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' });
    expect(r.status).toBe('ok');
    expect(r.requiresConfirmation).toBe(true);
    const p = r.planned!;
    expect(p.loadEstimationKind).toBe('population_prior_low_confidence');
    expect(p.calibrationSuggestionKg).toBe(57.5);
    expect(p.substitution!.prior).toMatchObject({ ratio: 0.8, sourceE1rm: 120, tentativeE1rm: 96, pct: 0.6, perHand: false });
    expect([p.kg, p.calibration, p.confidence]).toEqual([null, true, 'low']);
    expect(p.reasons).toContain('SUB_POPULATION_PRIOR_LOW_CONFIDENCE');
    expect(p.substitution!.evidenceIds).toEqual(expect.arrayContaining(['davis2020', 'gullett2009']));
  });

  it('SUB03: samma men okänd/ingen vana ⇒ ingen automatisk siffra, manuell kalibrering', () => {
    const unknown = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [] });
    expect(unknown.needsFamiliarity).toBe(true);
    expect([unknown.planned!.kg, unknown.planned!.calibrationSuggestionKg, unknown.planned!.loadEstimationKind]).toEqual([null, null, 'none']);
    const novice = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'unfamiliar' });
    expect(novice.needsFamiliarity).toBe(false);
    expect([novice.planned!.kg, novice.planned!.calibrationSuggestionKg, novice.planned!.calibration]).toEqual([null, null, true]);
  });

  it('SUB04: bänkpress e1RM 100 → hantelpress, vana, steg 2 kg per hantel ⇒ 83 kg totalt, 24 kg per hantel', () => {
    const r = planReplacement(input({ exerciseSettings: [est('bench_press', 100)] }), { from: benchHeavy, to: 'dumbbell_bench_press', others: [], familiarity: 'familiar' });
    const p = r.planned!;
    expect(p.calibrationSuggestionKg).toBe(24);
    expect(p.substitution!.prior).toMatchObject({ ratio: 0.83, tentativeE1rm: 83, perHand: true, pct: 0.6 });
    expect(p.loadBasis).toBe('per_hand_kg');
    expect(p.incrementKg).toBe(2);
  });

  it('SUB05: latsdrag 60 kg → assisterade chins ⇒ inga 60 kg, ingen Epley-1RM, assistansprofil/kalibrering', () => {
    const lat = plan('lat_pulldown', { kg: 60, mode: 'moderate', reps: 8, sets: 2, estimatedOneRM: 85 });
    const h = [performed('lat_pulldown', hoursBefore(NOW, 96), { kg: 60, mode: 'moderate', reps: 8, sets: 2 }, sets(2, { kg: 60, reps: 8, rir: 2 }), 'completed', 'moderate')];
    const r = planReplacement(input({ exerciseSettings: [est('lat_pulldown', 85)], history: h }), { from: lat, to: 'assisted_pullup', others: [], familiarity: 'familiar' });
    const p = r.planned!;
    expect([p.kg, p.calibrationSuggestionKg, p.estimatedOneRM]).toEqual([null, null, null]);
    expect(p.loadKind).toBe('assistance_kg');
    expect(p.loadBasis).toBe('assistance_kg');
  });

  it('SUB06/SUB07: knäböj → benpress och marklyft → rumänska marklyft: kompletterande, ingen omräkning', () => {
    const lp = planReplacement(input({ exerciseSettings: [est('squat', 100)] }), { from: squatHeavy, to: 'leg_press', others: [], familiarity: 'familiar' });
    expect([lp.relation!.relation, lp.planned!.kg, lp.planned!.calibrationSuggestionKg, lp.planned!.loadEstimationKind]).toEqual(['complementary', null, null, 'none']);
    const dl = plan('deadlift', { kg: 115, mode: 'heavy', sets: 2, reps: 5, estimatedOneRM: 150 });
    const rdl = planReplacement(input({ exerciseSettings: [est('deadlift', 150)] }), { from: dl, to: 'romanian_deadlift', others: [], familiarity: 'familiar' });
    expect([rdl.relation!.relation, rdl.planned!.kg, rdl.planned!.calibrationSuggestionKg]).toEqual(['complementary', null, null]);
    // Med egen uppskattning i målövningen används den (aldrig marklyftets).
    const own = planReplacement(input({ exerciseSettings: [est('deadlift', 150), est('romanian_deadlift', 110)] }), { from: dl, to: 'romanian_deadlift', others: [] });
    expect(own.planned!.loadEstimationKind).toBe('target_estimated');
    expect(own.planned!.estimatedOneRM).toBe(110);
  });

  it('SUB08: blockering av knäområdet respekteras för frontböj; symtom spärrar likaså', () => {
    const area = planReplacement(input({ exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'block_exercise', area: 'knee' })] }), { from: squatHeavy, to: 'front_squat', others: [] });
    expect(area.status).toBe('USER_BLOCK_EXERCISE');
    const sym = planReplacement(input({ exerciseSettings: ALL_ESTIMATES, symptoms: [symptom({ area: 'knee', reaction: 'limping' })] }), { from: squatHeavy, to: 'front_squat', others: [] });
    expect(sym.status).toBe('SYMPTOM_REVIEW_REQUIRED');
    const c = substitutionCandidates(input({ exerciseSettings: ALL_ESTIMATES, restrictions: [rule({ kind: 'block_exercise', area: 'knee' })] }), squatHeavy, []);
    expect(c.suggested.map((x) => x.exerciseId)).toEqual([]); // alla knäböjsalternativ belastar knä
    expect(c.more.every((x) => x.result.status !== 'ok')).toBe(true);
  });

  it('SUB09: byte får inte skapa förbjudet tungt par – planen justeras (lätt) eller stoppas innan den visas', () => {
    const pr = rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' });
    const dlHeavy = plan('deadlift', { kg: 115, mode: 'heavy', sets: 2, estimatedOneRM: 150 });
    const r = planReplacement(input({ exerciseSettings: ALL_ESTIMATES, restrictions: [pr] }), { from: squatHeavy, to: 'front_squat', others: [dlHeavy], familiarity: 'familiar' });
    expect(r.status).toBe('ok');
    expect(r.planned!.mode).toBe('light');
    expect(r.planned!.reasons).toContain('PAIR_RULE_DOWNGRADED');
    // Parkontroll med ersättaren som "knäböj" håller.
    expect(heavyPairAllowed([{ exerciseId: 'deadlift', mode: 'heavy', sets: 2 }, { exerciseId: 'squat', mode: r.planned!.mode, sets: r.planned!.sets, plannedKg: r.planned!.kg, estimatedOneRM: r.planned!.estimatedOneRM }], 'squat', 'deadlift')).toBe(true);
    // Relativ last ≥ 75 % även i lätt variant ⇒ stoppas.
    const heavyHist = [performed('front_squat', hoursBefore(NOW, 100), { kg: 90, mode: 'light', reps: 8, bandMin: 8, bandMax: 12, sets: 2, estimatedOneRM: 100 }, sets(2, { kg: 90, reps: 8, rir: 1 }), 'completed', 'light')];
    const stop = planReplacement(input({ exerciseSettings: [est('front_squat', 100)], restrictions: [pr], history: heavyHist }), { from: squatHeavy, to: 'front_squat', others: [dlHeavy] });
    expect(stop.status).toBe('PAIR_RULE');
  });

  it('SUB10/SUB11 (planerare): utan permanent val behålls originalet; permanent val påverkar bara kommande planer', () => {
    const today = planRegular(input({ exerciseSettings: ALL_ESTIMATES }));
    expect(today.exercises[0].exerciseId).toBe('squat');
    const future = planRegular(input({ exerciseSettings: ALL_ESTIMATES, profile: { substitutions: { squat: 'front_squat' } } }));
    expect(future.exercises[0]).toMatchObject({ exerciseId: 'front_squat', substitutionFrom: 'squat', substitutionReason: 'USER_CHOSEN_VARIANT' });
    expect(future.templateKey).toBe(today.templateKey);
  });

  it('SUB15: ny övning utan e1RM och utan källprior ⇒ ingen påhittad siffra', () => {
    const r = planReplacement(input({ exerciseSettings: [est('bench_press', 100)] }), { from: benchHeavy, to: 'chest_press_machine', others: [], familiarity: 'familiar' });
    expect([r.planned!.kg, r.planned!.calibrationSuggestionKg, r.planned!.loadEstimationKind, r.planned!.calibration]).toEqual([null, null, 'none', true]);
  });

  it('SUB19: hjälpskattning utan markerad osäkerhet underkänns', () => {
    const ok = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' }).planned!;
    expect(() => verifySubstitutionInvariants(ok)).not.toThrow();
    const forged: PlannedExercise[] = [
      { ...ok, confidence: 'medium' },
      { ...ok, calibration: false },
      { ...ok, kg: 57.5 },
      { ...ok, reasons: ok.reasons.filter((r) => r !== 'SUB_POPULATION_PRIOR_LOW_CONFIDENCE') },
      { ...ok, loadEstimationKind: 'target_estimated' },
      { ...ok, loadEstimationKind: 'none' },
    ];
    for (const f of forged) expect(() => verifySubstitutionInvariants(f)).toThrow(/INVARIANT/);
  });

  it('SUB22: giltigt e1RM i målövningen prioriteras även om källövningen är starkare', () => {
    const r = planReplacement(input({ exerciseSettings: [est('squat', 200), est('front_squat', 80)] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' });
    expect(r.planned!.loadEstimationKind).toBe('target_estimated');
    expect(r.planned!.estimatedOneRM).toBe(80);
    expect(r.planned!.kg).toBe(60); // van tung: 0,775 × 80 = 62 → nedåt till 2,5-steg = 60 (målövningens egen e1RM, inte 0,80 × 200)
  });

  it('SUB23: annan maskinmodell med samma övningsnamn ⇒ inga kg överförs', () => {
    const lpPlan = plan('leg_press', { kg: 150, mode: 'moderate', reps: 8, sets: 2, estimatedOneRM: 200 });
    const h = [performed('leg_press', hoursBefore(NOW, 96), { kg: 150, mode: 'moderate', reps: 8, sets: 2 }, sets(2, { kg: 150, reps: 8, rir: 3 }), 'completed', 'moderate')];
    const same = planReplacement(input({ exerciseSettings: [est('leg_press', 200)], history: h }), { from: lpPlan, to: 'leg_press', others: [], variantKey: 'gym-b' });
    expect(same.status).toBe('ok');
    expect([same.planned!.kg, same.planned!.loadEstimationKind, same.planned!.variantKey]).toEqual([null, 'none', 'gym-b']);
    expect(same.planned!.reasons).toContain('SUB_NEW_MACHINE_PROFILE');
    // Standardmaskinen behåller sin historik i vanlig planering.
    const normal = planRegular(input({ exerciseSettings: [est('leg_press', 200)], history: h, profile: { substitutions: { squat: 'leg_press' } } }));
    expect(normal.exercises[0]).toMatchObject({ exerciseId: 'leg_press' });
    expect(normal.exercises[0].kg).not.toBeNull();
    const otherMachine = planRegular(input({ exerciseSettings: [est('leg_press', 200)], history: h, profile: { substitutions: { squat: 'leg_press' }, equipmentProfiles: { leg_press: 'gym-b' } } }));
    expect([otherMachine.exercises[0].kg, otherMachine.exercises[0].variantKey]).toEqual([null, 'gym-b']);
  });

  it('SUB24: frontböj → knäböj: ingen invertering av 0,80 (1,25); egna knäböjsdata eller kalibrering', () => {
    const front = plan('front_squat', { kg: 60, mode: 'heavy', sets: 3, reps: 5, estimatedOneRM: 100 });
    const none = planReplacement(input({ exerciseSettings: [est('front_squat', 100)] }), { from: front, to: 'squat', others: [], familiarity: 'familiar' });
    expect([none.planned!.kg, none.planned!.calibrationSuggestionKg, none.planned!.loadEstimationKind]).toEqual([null, null, 'none']);
    const own = planReplacement(input({ exerciseSettings: [est('front_squat', 100), est('squat', 140)] }), { from: front, to: 'squat', others: [] });
    expect(own.planned!.estimatedOneRM).toBe(140);
  });

  it('kandidatlista: högst 3 prioriterade tillåtna; ej tillgänglig utrustning hamnar under "Visa fler" med skäl', () => {
    const eq = ['rack', 'barbell', 'plates', 'bench', 'cable', 'dumbbell', 'machines', 'bodyweight', 'pullup-assist'] as const;
    const c = substitutionCandidates(input({ exerciseSettings: ALL_ESTIMATES, profile: { equipment: [...eq] } }), squatHeavy, []);
    expect(c.suggested.length).toBe(3);
    expect(c.suggested[0].exerciseId).toBe('front_squat');
    const sb = c.more.find((x) => x.exerciseId === 'safety_bar_squat')!;
    expect(sb.result.status).toBe('EQUIPMENT_UNAVAILABLE');
    // Deterministisk ordning.
    const again = substitutionCandidates(input({ exerciseSettings: ALL_ESTIMATES, profile: { equipment: [...eq] } }), squatHeavy, []);
    expect(again.suggested.map((x) => x.exerciseId)).toEqual(c.suggested.map((x) => x.exerciseId));
  });

  it('ensidig ny övning räknas för båda sidor i tidsmodellen; befintlig split squat oförändrad', () => {
    const bss = plan('bulgarian_split_squat', { mode: 'light', sets: 2, role: 'supplementary' });
    const ss = plan('split_squat', { mode: 'light', sets: 2, role: 'supplementary' });
    expect(estimatedMinutesFor([bss])).toBeGreaterThan(estimatedMinutesFor([ss]));
  });

  it('återgång till ursprunglig övning erbjuds för en ersättare', () => {
    const front = { ...plan('front_squat', { mode: 'heavy' }), substitutionFrom: 'squat' as ExerciseId };
    const c = substitutionCandidates(input({ exerciseSettings: ALL_ESTIMATES }), front, []);
    expect(c.suggested.map((x) => x.exerciseId)).toContain('squat');
  });
});
