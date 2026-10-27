/**
 * STYRKA-CR-2026-10-10-01 – övningssubstitution på domän-/planerarnivå.
 * Numrering enligt anmodans §5 (SUB01–SUB24). Applikations-, offline- och DB-fall finns i egna filer.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CATALOG, OFFERED_CATALOG, RETIRED_SLUGS, exercise, isExerciseId, V1_SLUGS, type ExerciseId } from '../../src/domain/catalog';
import { heavyPairAllowed } from '../../src/domain/heavyPair';
import type { PlannedExercise } from '../../src/domain/model';
import { allRelations, appSlug, APPROVED_PRIORS, NOTES_SV, relationBetween, relationsFrom, SEED, SEED_SLUG_TO_APP, SUBSTITUTION_CATALOG_VERSION, validateSubstitutionCatalog } from '../../src/domain/substitutionCatalog';
import { estimatedMinutesFor, FIRST_EXPOSURE_MAX_PCT, planRegular, planReplacement, substitutionCandidates, verifySubstitutionInvariants } from '../../src/planner/planner';
import { ALL_ESTIMATES, NOW, est, hoursBefore, input, performed, plan, rule, sets, symptom } from './helpers';

const squatHeavy = plan('squat', { kg: 92.5, mode: 'heavy', sets: 3, reps: 5, estimatedOneRM: 120 });
const benchHeavy = plan('bench_press', { kg: 77.5, mode: 'heavy', sets: 3, reps: 5, estimatedOneRM: 100 });

describe('substitutionskatalog = replacement_seed.json 1.2.0 (enda källa) + slugmappning', () => {
  const official = JSON.parse(readFileSync('spec/cr-2026-10-10-01/STYRKA_replacement_seed.json', 'utf8')) as typeof SEED;
  const current = JSON.parse(readFileSync('src/planner/replacement_seed.json', 'utf8')) as typeof SEED;
  const ADDED = [
    { from_slug: 'assisted_pullup', to_slug: 'neutral_grip_lat_pulldown', relation_class: 'movement_family', notes_key: 'external_vs_assistance_load' },
    { from_slug: 'assisted_pullup', to_slug: 'pullup', relation_class: 'near_variant', notes_key: 'assistance_vs_bodyweight_load_model' },
    { from_slug: 'romanian_deadlift', to_slug: 'trap_bar_deadlift', relation_class: 'accessory', notes_key: 'broader_hinge_alternative' },
  ];

  it('originalunderlagen är oförändrade (SHA-256) och appen läser endast den auktoritativa seed-filen', () => {
    const manifest = JSON.parse(readFileSync('spec/cr-2026-10-10-01/SHA256.json', 'utf8')) as { files: Array<{ path: string; sha256: string }> };
    for (const f of manifest.files) expect(createHash('sha256').update(readFileSync(`spec/cr-2026-10-10-01/${f.path}`)).digest('hex'), f.path).toBe(f.sha256);
    expect(SEED).toEqual(current);
    expect(SEED.catalog_version).toBe('1.2.0');
    expect(SUBSTITUTION_CATALOG_VERSION).toBe('SUBST/1.2.0');
    expect(SEED.derived_from).toEqual({ file: 'spec/cr-2026-10-10-01/STYRKA_replacement_seed.json', schema_version: official.schema_version, created_on: official.created_on });
  });

  it('version 1.2.0 = originalet ordagrant + exakt de tre beslutade paren (inget annat ändrat)', () => {
    for (const k of ['schema_version', 'disclaimer', 'classification_definition', 'empirical_priors', 'reference_urls'] as const) expect(current[k], k).toEqual(official[k]);
    expect(current.candidate_edges.slice(0, official.candidate_edges.length)).toEqual(official.candidate_edges);
    const added = current.candidate_edges.slice(official.candidate_edges.length);
    expect(added.map((e) => ({ from_slug: e.from_slug, to_slug: e.to_slug, relation_class: e.relation_class, notes_key: e.notes_key }))).toEqual(ADDED);
    for (const e of added) expect(e).toMatchObject({ load_estimation_policy: 'manual_calibration', evidence_ids: [], reverse_candidate_allowed: true, reverse_load_prior_allowed: false });
    expect(current.changelog.join(' ')).toMatch(/1\.2\.0/);
  });

  it('de tre nya paren: rätt klass i båda riktningar, ingen viktomräkning, separat historik och kalibrering', () => {
    for (const a of ADDED) {
      for (const [f, t] of [[a.from_slug, a.to_slug], [a.to_slug, a.from_slug]] as Array<[ExerciseId, ExerciseId]>) {
        const r = relationBetween(f, t)!;
        expect(r, `${f}->${t}`).toMatchObject({ relation: a.relation_class, load_prior: { kind: 'none' }, load_estimation_policy: 'manual_calibration' });
        const res = planReplacement(input({ exerciseSettings: ALL_ESTIMATES }), { from: plan(f, { kg: 60, mode: 'moderate', sets: 2, reps: 8, estimatedOneRM: 80 }), to: t, others: [], familiarity: 'familiar' });
        expect(res.status, `${f}->${t}`).toBe('ok');
        expect([res.planned!.calibrationSuggestionKg, res.requiresConfirmation, res.planned!.substitution!.prior], `${f}->${t}`).toEqual([null, false, undefined]);
        const changed = planReplacement(input({ exerciseSettings: ALL_ESTIMATES }), { from: plan(f, { kg: 200, mode: 'moderate', sets: 2, reps: 8, estimatedOneRM: 300 }), to: t, others: [], familiarity: 'familiar' });
        expect(res.planned!.kg).toBe(changed.planned!.kg); // Source forecast is never observed strength.
      }
    }
    // RDL ↔ trap bar visas med tydlig information om skild träningseffekt och belastningsfördelning.
    expect(relationBetween('romanian_deadlift', 'trap_bar_deadlift')!.rationale_sv).toMatch(/träningseffekten och belastningsfördelningen skiljer sig.*inte styrkemässigt likvärdig/);
    expect(relationBetween('assisted_pullup', 'pullup')!.rationale_sv).toMatch(/skilda belastningsmodeller/);
  });

  it('katalogintegritet: inga dubbletter eller motsägande klasser, alla texter, endast seed-ursprung', () => {
    expect(() => validateSubstitutionCatalog()).not.toThrow();
    const key = (a: string, b: string) => [a, b].sort().join('<>');
    const cls = new Map<string, string>();
    for (const e of current.candidate_edges) {
      const k = key(e.from_slug, e.to_slug);
      expect(cls.has(k), `dubblett ${k}`).toBe(false);
      cls.set(k, e.relation_class);
      expect(Object.keys(current.classification_definition)).toContain(e.relation_class);
      expect(NOTES_SV[e.notes_key], e.notes_key).toBeTruthy();
      expect(e.reverse_load_prior_allowed, `${e.from_slug}->${e.to_slug}`).toBe(false);
      if (e.load_estimation_policy !== 'manual_calibration') expect(current.empirical_priors.some((p) => p.source_slug === e.from_slug && p.target_slug === e.to_slug)).toBe(true);
    }
    const appCls = new Map(current.candidate_edges.map((e) => [key(appSlug(e.from_slug), appSlug(e.to_slug)), e.relation_class]));
    for (const r of allRelations()) {
      expect(['seed', 'seed_reverse']).toContain(r.origin);
      expect(r.relation, `${r.from}->${r.to}`).toBe(appCls.get(key(r.from, r.to)));
    }
    expect(allRelations().length).toBe(current.candidate_edges.length * 2);
  });

  it('varje seed-slugg mappas till en befintlig övning med rimlig utrustning och lastbas', () => {
    const slugs = new Set([...current.candidate_edges.flatMap((e) => [e.from_slug, e.to_slug]), ...official.empirical_priors.flatMap((p) => [p.source_slug, p.target_slug])]);
    for (const s of slugs) expect(isExerciseId(appSlug(s)), s).toBe(true);
    // Befintliga övningar (version 1) har samma id i seed-filen.
    for (const s of slugs) if (V1_SLUGS.has(s as ExerciseId)) expect(appSlug(s)).toBe(s);
    expect(exercise(appSlug('dumbbell_flat_bench'))).toMatchObject({ loadDisplayBasis: 'per_hand_kg', equipmentClass: 'dumbbell' });
    expect(exercise(appSlug('dumbbell_overhead_press'))).toMatchObject({ loadDisplayBasis: 'per_hand_kg', equipmentClass: 'dumbbell' });
    for (const m of ['machine_chest_press', 'machine_shoulder_press', 'machine_lateral_raise']) expect(exercise(appSlug(m))).toMatchObject({ equipmentClass: 'machine', requiresEquipmentProfile: true });
    expect(exercise(appSlug('rope_triceps_pushdown'))).toMatchObject({ equipmentClass: 'cable' });
    expect(exercise('barbell_row')).toMatchObject({ pattern: 'horizontal_pull', loadDisplayBasis: 'total_kg', equipmentClass: 'barbell' });
    // Mappningen är 1:1.
    expect(new Set(Object.values(SEED_SLUG_TO_APP)).size).toBe(Object.keys(SEED_SLUG_TO_APP).length);
  });

  it('alla seed-par finns med seed-filens relationsklass och evidens; omvända kandidater utan viktprior', () => {
    for (const e of current.candidate_edges) {
      const r = relationBetween(appSlug(e.from_slug), appSlug(e.to_slug));
      expect(r, `${e.from_slug}->${e.to_slug}`).toMatchObject({ relation: e.relation_class, evidence_ids: e.evidence_ids, notes_key: e.notes_key, origin: 'seed' });
      const rev = relationBetween(appSlug(e.to_slug), appSlug(e.from_slug));
      expect(rev, `omvänd ${e.to_slug}->${e.from_slug}`).toBeTruthy();
      expect(rev!.load_prior.kind, `omvänd ${e.to_slug}->${e.from_slug}`).toBe('none');
    }
    for (const r of allRelations()) expect(r.rationale_sv.length, `${r.from}->${r.to}`).toBeGreaterThan(10);
  });

  it('kvantitativa priors finns endast för seed-filens två par, i angiven riktning, med seed-filens värden', () => {
    const priors = allRelations().filter((r) => r.load_prior.kind === 'population_ratio');
    expect(priors.map((r) => [r.from, r.to])).toEqual([
      ['squat', 'front_squat'],
      ['bench_press', 'dumbbell_bench_press'],
    ]);
    expect(APPROVED_PRIORS.map((x) => [...x])).toEqual(priors.map((r) => [r.from, r.to]));
    expect(priors[0].load_prior).toMatchObject({ ratio: 0.8, basis: 'total', first_exposure_cap: 0.6, reference_ids: ['davis2020', 'gullett2009'] });
    expect(priors[1].load_prior).toMatchObject({ ratio: 0.83, basis: 'per_hand_total', first_exposure_cap: 0.6, reference_ids: ['saeterbakken2011'] });
    expect(FIRST_EXPOSURE_MAX_PCT).toBe(official.empirical_priors[0].first_exposure_fraction_cap);
  });

  it('anmodans tabell §2.2 täcks och varje mallövning har minst ett alternativ', () => {
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
    ];
    for (const [from, tos] of table) for (const to of tos) expect(relationBetween(from, to), `${from}->${to}`).toBeTruthy();
    for (const slug of V1_SLUGS) expect(relationsFrom(slug).length, slug).toBeGreaterThan(0);
  });

  it('katalog 2.0.1: version 1-övningarna oförändrade, nya varianter med korrekt lastsemantik, utfall erbjuds inte', () => {
    expect(CATALOG.filter((c) => V1_SLUGS.has(c.slug)).map((c) => c.slug)).toEqual([...V1_SLUGS]);
    expect(exercise('squat')).toMatchObject({ loadKind: 'external_kg', defaultIncrementKg: 2.5, timeMultiplier: 1, catalogSince: '1.0.0' });
    expect(exercise('dumbbell_bench_press').loadDisplayBasis).toBe('per_hand_kg');
    expect(exercise('assisted_pullup').loadDisplayBasis).toBe('assistance_kg');
    expect(exercise('plank').loadDisplayBasis).toBe('seconds');
    expect(exercise('leg_press').requiresEquipmentProfile).toBe(true);
    expect(exercise('bulgarian_split_squat')).toMatchObject({ unilateral: true, timeMultiplier: 2 });
    expect(exercise('split_squat').timeMultiplier).toBe(1);
    expect(RETIRED_SLUGS.has('lunge')).toBe(true);
    expect(OFFERED_CATALOG.some((c) => c.slug === 'lunge')).toBe(false);
    expect(allRelations().some((r) => r.from === 'lunge' || r.to === 'lunge')).toBe(false);
    // Varje erbjuden övning finns i kandidatmappningen.
    const reachable = new Set(allRelations().flatMap((r) => [r.from, r.to]));
    for (const c of OFFERED_CATALOG) expect(reachable.has(c.slug), c.slug).toBe(true);
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

  it('SUB02: knäböj 1RM 120, van vid frontböj, inga måldata ⇒ första förslag 47,5 kg utan påstådd maxstyrka (låg säkerhet, redigerbart)', () => {
    const r = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' });
    expect(r.status).toBe('ok');
    expect(r.requiresConfirmation).toBe(false);
    const p = r.planned!;
    expect(p.loadEstimationKind).toBe('calibration');
    expect(p.kg).toBe(47.5);
    expect(p.recommendation).toMatchObject({source:'transfer', sourceExerciseId:'squat', confidence:'low'});
    expect(p.estimatedOneRM).toBeNull();
    expect([p.kg, p.calibration, p.confidence]).toEqual([47.5, true, 'low']);
    expect(p.reasons).toContain('STARTING_LOAD_TRANSFER');
    expect(p.substitution!.evidenceIds).toEqual(expect.arrayContaining(['davis2020', 'gullett2009']));
  });

  it('seed eligible_if: aktiv begränsning för käll-/målövning eller målets område ⇒ ingen hjälpskattning (kalibrering)', () => {
    const cases = [
      rule({ kind: 'limit_mode', exerciseA: 'squat', maxMode: 'moderate' }),
      rule({ kind: 'limit_sets', exerciseA: 'front_squat', maxSets: 2 }),
      rule({ kind: 'region_note', area: 'knee' }),
      rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' }),
    ];
    for (const r of cases) {
      const res = planReplacement(input({ exerciseSettings: [est('squat', 120)], restrictions: [r] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' });
      expect(res.status, r.kind).toBe('ok');
      expect([res.planned!.calibrationSuggestionKg, res.planned!.loadEstimationKind, res.requiresConfirmation], r.kind).toEqual([null, 'none', false]);
    }
    // Inaktiv regel påverkar inte.
    const inactive = planReplacement(input({ exerciseSettings: [est('squat', 120)], restrictions: [{ ...cases[2], active: false }] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'familiar' });
    expect(inactive.planned!.kg).toBe(47.5);
  });

  it('SUB03: samma men okänd vana får samma försiktiga och korrigerbara provbelastning', () => {
    const unknown = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [] });
    expect(unknown.needsFamiliarity).toBe(false);
    expect([unknown.planned!.kg, unknown.planned!.calibrationSuggestionKg, unknown.planned!.loadEstimationKind]).toEqual([47.5, null, 'calibration']);
    const novice = planReplacement(input({ exerciseSettings: [est('squat', 120)] }), { from: squatHeavy, to: 'front_squat', others: [], familiarity: 'unfamiliar' });
    expect(novice.needsFamiliarity).toBe(false);
    expect([novice.planned!.kg, novice.planned!.calibrationSuggestionKg, novice.planned!.calibration]).toEqual([47.5, null, true]);
  });

  it('SUB04: bänkpress e1RM 100 → hantelpress, vana, steg 2 kg per hantel ⇒ 20 kg per hantel som försiktigt startförslag', () => {
    const r = planReplacement(input({ exerciseSettings: [est('bench_press', 100)] }), { from: benchHeavy, to: 'dumbbell_bench_press', others: [], familiarity: 'familiar' });
    const p = r.planned!;
    expect(p.kg).toBe(20);
    expect(p.recommendation?.source).toBe('transfer'); expect(p.estimatedOneRM).toBeNull();
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

  it('SUB06/SUB07: knäböj → benpress och marklyft → rumänska marklyft: kompletterande (accessory), ingen omräkning', () => {
    const lp = planReplacement(input({ exerciseSettings: [est('squat', 100)] }), { from: squatHeavy, to: 'leg_press', others: [], familiarity: 'familiar' });
    expect([lp.relation!.relation, lp.planned!.kg, lp.planned!.calibrationSuggestionKg, lp.planned!.loadEstimationKind]).toEqual(['accessory', null, null, 'none']);
    const dl = plan('deadlift', { kg: 115, mode: 'heavy', sets: 2, reps: 5, estimatedOneRM: 150 });
    const rdl = planReplacement(input({ exerciseSettings: [est('deadlift', 150)] }), { from: dl, to: 'romanian_deadlift', others: [], familiarity: 'familiar' });
    expect([rdl.relation!.relation, rdl.planned!.kg, rdl.planned!.calibrationSuggestionKg]).toEqual(['accessory', null, null]);
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
      { ...ok, reasons: ok.reasons.filter((r) => r !== 'STARTING_LOAD_TRANSFER') },
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
    const standard=normal.exercises.find(e=>e.exerciseId==='leg_press');
    expect(standard).toBeDefined();
    expect(standard!.kg).not.toBeNull();
    const otherMachine = planRegular(input({ exerciseSettings: [est('leg_press', 200)], history: h, profile: { substitutions: { squat: 'leg_press' }, equipmentProfiles: { leg_press: 'gym-b' } } }));
    const changed=otherMachine.exercises.find(e=>e.exerciseId==='leg_press');
    expect(changed).toBeDefined();
    expect([changed!.kg, changed!.variantKey]).toEqual([null, 'gym-b']);
  });

  it('SUB24: frontböj → knäböj: ingen invertering av 0,80 (1,25); egna knäböjsdata eller kalibrering', () => {
    const front = plan('front_squat', { kg: 60, mode: 'heavy', sets: 3, reps: 5, estimatedOneRM: 100 });
    const none = planReplacement(input({ exerciseSettings: [est('front_squat', 100)] }), { from: front, to: 'squat', others: [], familiarity: 'familiar' });
    expect([none.planned!.kg, none.planned!.calibrationSuggestionKg, none.planned!.loadEstimationKind]).toEqual([40, null, 'calibration']);
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
