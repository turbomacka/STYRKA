/**
 * Förvaltad substitutionskatalog (STYRKA-CR-2026-10-10-01 §2.2).
 *
 * Enda auktoritativa källa: `src/planner/replacement_seed.json` (katalogversion 1.2.0). Den är produktägarens
 * kandidatmappning (`spec/cr-2026-10-10-01/STYRKA_replacement_seed.json`, schema 1.0.0, oförändrad) plus tre par ur
 * anmodans obligatoriska tabell som produktägaren beslutat föra in 2026-10-11. Modulen mappar seed-sluggar till appens
 * faktiska övnings-id och lägger till svenska förklaringstexter per `notes_key`. Inga egna viktomräkningar:
 * kvantitativa priors finns ENDAST i seed-filens `empirical_priors` (två par) och gäller bara i angiven riktning (SUB24).
 */
import seed from '../planner/replacement_seed.json';
import { exercise, isExerciseId, type ExerciseId } from './catalog';
import type { RelationClass } from './model';

type SeedEdge = {
  from_slug: string;
  to_slug: string;
  relation_class: RelationClass;
  load_estimation_policy: string;
  notes_key: string;
  evidence_ids: string[];
  reverse_candidate_allowed: boolean;
  reverse_load_prior_allowed: boolean;
};
type SeedPrior = {
  source_slug: string;
  target_slug: string;
  ratio_e1rm?: number;
  ratio_e1rm_total?: number;
  prior_confidence: 'low';
  population_basis: string;
  first_exposure_fraction_cap: number;
  divide_per_hand?: boolean;
  evidence_ids: string[];
  eligible_if: string;
};
type Seed = {
  schema_version: string;
  catalog_version: string;
  updated_on: string;
  derived_from: { file: string; schema_version: string; created_on: string };
  changelog: string[];
  created_on: string;
  disclaimer: string;
  classification_definition: Record<RelationClass, string>;
  empirical_priors: SeedPrior[];
  reference_urls: Record<string, string>;
  candidate_edges: SeedEdge[];
};
export const SEED = seed as unknown as Seed;

/** Katalogversion = seed-filens `catalog_version`. */
export const SUBSTITUTION_CATALOG_VERSION = `SUBST/${SEED.catalog_version}`;

/**
 * Seed-sluggar som i appen har ett annat (redan driftsatt, stabilt) övnings-id. Övriga seed-sluggar är identiska
 * med appens. Mappningen är 1:1 och kontrolleras i test (utrustning, lastbas).
 */
export const SEED_SLUG_TO_APP: Readonly<Record<string, ExerciseId>> = {
  dumbbell_flat_bench: 'dumbbell_bench_press',
  machine_chest_press: 'chest_press_machine',
  dumbbell_overhead_press: 'dumbbell_shoulder_press',
  machine_shoulder_press: 'shoulder_press_machine',
  machine_lateral_raise: 'lateral_raise_machine',
  rope_triceps_pushdown: 'rope_pushdown',
};

export function appSlug(seedSlug: string): ExerciseId {
  const s = SEED_SLUG_TO_APP[seedSlug] ?? seedSlug;
  if (!isExerciseId(s)) throw new Error(`OKÄND_SEED_SLUG ${seedSlug}`);
  return s;
}

/** CR-text (§2): "Nära variant", "Samma rörelsefamilj", "Kompletterande alternativ". */
export const RELATION_LABEL_SV: Record<RelationClass, string> = {
  near_variant: 'Nära variant',
  movement_family: 'Samma rörelsefamilj',
  accessory: 'Kompletterande alternativ',
};

/** Seed-filens klassdefinitioner på svenska (visas som förklaring vid behov). */
export const RELATION_DEFINITION_SV: Record<RelationClass, string> = {
  near_variant: 'Liknande teknik, men styrkan är fortfarande övningsspecifik.',
  movement_family: 'Delvis överlapp – räkna inte med samma maxvikt eller direkt överföring.',
  accessory: 'Delvis träningsstimulus – inte likvärdig för ett specifikt styrkemål.',
};

/** Svenska förklaringar per `notes_key` i seed-filen (redaktionella, utan medicinska påståenden). */
export const NOTES_SV: Readonly<Record<string, string>> = {
  barbell_front_vs_back: 'Stången vilar framtill i stället för på ryggen. Liknande rörelse, men lägre maxvikt och egen styrkehistorik.',
  load_position_changes: 'Lastens placering ändras. Egen vikt och historik.',
  machine_specific: 'Maskinens utväxling och rörelsebana styr belastningen – vikterna går inte att jämföra med fria vikter eller andra maskiner.',
  machine_and_rom: 'Maskinstyrd rörelse med annat rörelseomfång. Egen vikt och historik.',
  equipment_and_load_limit: 'Hantel framför bröstet; begränsas av hur tungt du kan hålla.',
  no_specific_squat_strength_claim: 'Tränar benen, men ger ingen specifik knäböjsstyrka.',
  front_loaded_pattern: 'Belastning framtill med liknande hållning.',
  different_setup_and_moments: 'Bredare fotställning och annan startposition ger andra ledmoment.',
  different_bar_and_kinetics: 'Annan stång med annan belastningsfördelning och rörelsemekanik.',
  hip_hinge_different_joint_demands: 'Höftfällning med andra krav på lederna; kompletterar men ersätter inte marklyft.',
  different_load_basis: 'Hantlar i stället för skivstång – vikten anges per hantel.',
  different_rom_and_knee_angle: 'Annat rörelseomfång och annan knävinkel.',
  load_per_hand: 'Hantlar – vikten anges per hantel och kräver mer stabilisering.',
  stabilization_and_machine: 'Styrd stång minskar kravet på stabilisering.',
  changed_incline_and_muscle_emphasis: 'Lutande bänk ändrar vinkel och muskelbetoning.',
  per_hand_stability: 'Hantlar – vikten anges per hantel och kräver mer stabilisering.',
  position_change: 'Sittande i stället för stående.',
  grip_and_machine_may_differ: 'Annat grepp; maskinen kan också skilja sig.',
  external_vs_assistance_load: 'Assistans i stället för extern vikt – siffrorna betyder olika saker.',
  bodyweight_load: 'Din kroppsvikt är belastningen.',
  reduces_external_spinal_stabilization: 'Bröststödet minskar kravet på att själv stabilisera ryggen.',
  unilateral_per_hand: 'En arm i taget – vikten anges per hantel.',
  different_trunk_demand: 'Framåtlutad position med större krav på bålen.',
  resistance_curve_differs: 'Motståndet fördelas annorlunda genom rörelsen.',
  per_hand: 'Hantlar – vikten anges per hantel.',
  resistance_curve: 'Kabeln ger ett annat motstånd genom rörelsen.',
  shoulder_position: 'Lutande bänk ändrar axelns läge.',
  grip_differs: 'Rep i stället för stång ger ett annat grepp.',
  elbow_shoulder_position: 'Armen över huvudet ändrar armbågens och axelns läge.',
  load_method: 'Annat sätt att belasta övningen.',
  dynamic_vs_isometric: 'Statisk hållning i stället för rörelse; ersätter inte dynamisk styrka.',
  unilateral_depth: 'Bakre foten upphöjd ger större rörelseomfång.',
  unilateral_dynamic: 'Ett ben i taget upp på en låda eller bänk.',
  assistance_vs_bodyweight_load_model: 'Samma rörelse, men assistans och kroppsvikt är skilda belastningsmodeller – kilon kan inte jämföras eller räknas om.',
  broader_hinge_alternative: 'Bredare höftfällningsalternativ: träningseffekten och belastningsfördelningen skiljer sig, och övningen är inte styrkemässigt likvärdig.',
};

/** Seed-filens `population_basis` på svenska (gruppmedelvärden, inte individuella faktorer). */
export const PRIOR_BASIS_SV: Readonly<Record<string, string>> = {
  'squat->front_squat': '11 styrketränade personer i en studie: medel-1RM 102,4 kg i frontböj mot 123,9 kg i knäböj (kvot 0,83). STYRKA använder den lägre kvoten 0,80.',
  'bench_press->dumbbell_flat_bench': '12 träningsvana män i en studie: total maxvikt med hantlar i genomsnitt 17 % lägre än med skivstång (kvot 0,83), delat på två hantlar.',
};

export function priorBasisSv(fromApp: ExerciseId, toApp: ExerciseId): string | null {
  const p = SEED.empirical_priors.find((x) => appSlug(x.source_slug) === fromApp && appSlug(x.target_slug) === toApp);
  return p ? (PRIOR_BASIS_SV[`${p.source_slug}->${p.target_slug}`] ?? null) : null;
}

export type LoadPrior =
  | { kind: 'none' }
  | {
      kind: 'population_ratio';
      ratio: number;
      reference_ids: string[];
      basis: 'total' | 'per_hand_total';
      /** Seed: `first_exposure_fraction_cap` (produktheuristik). */
      first_exposure_cap: number;
      /** Seed: `population_basis` (gruppmedelvärde, inte individuell faktor). */
      population_basis: string;
    };

/** Var relationen kommer ifrån: seed-filens par eller dess omvända kandidat. */
export type RelationOrigin = 'seed' | 'seed_reverse';

export type SubstitutionRelation = {
  from: ExerciseId;
  to: ExerciseId;
  relation: RelationClass;
  notes_key: string;
  rationale_sv: string;
  evidence_ids: string[];
  load_estimation_policy: string;
  load_prior: LoadPrior;
  origin: RelationOrigin;
  /** Ordning i seed-filen (deterministisk sortering av förslag). */
  order: number;
};

function priorFor(edge: SeedEdge, reverse: boolean): LoadPrior {
  if (reverse || edge.load_estimation_policy === 'manual_calibration') return { kind: 'none' };
  const p = SEED.empirical_priors.find((x) => x.source_slug === edge.from_slug && x.target_slug === edge.to_slug);
  if (!p) throw new Error(`PRIOR_SAKNAS ${edge.from_slug}->${edge.to_slug} (${edge.load_estimation_policy})`);
  const ratio = p.ratio_e1rm ?? p.ratio_e1rm_total;
  if (ratio === undefined) throw new Error(`KVOT_SAKNAS ${edge.from_slug}->${edge.to_slug}`);
  return { kind: 'population_ratio', ratio, reference_ids: [...p.evidence_ids], basis: p.divide_per_hand ? 'per_hand_total' : 'total', first_exposure_cap: p.first_exposure_fraction_cap, population_basis: p.population_basis };
}

function build(): SubstitutionRelation[] {
  const out: SubstitutionRelation[] = [];
  const has = (a: ExerciseId, b: ExerciseId) => out.some((r) => r.from === a && r.to === b);
  for (const e of SEED.candidate_edges) {
    const from = appSlug(e.from_slug);
    const to = appSlug(e.to_slug);
    if (has(from, to)) throw new Error(`DUBBLETT_I_SEED ${e.from_slug}->${e.to_slug}`);
    out.push({ from, to, relation: e.relation_class, notes_key: e.notes_key, rationale_sv: NOTES_SV[e.notes_key] ?? '', evidence_ids: [...e.evidence_ids], load_estimation_policy: e.load_estimation_policy, load_prior: priorFor(e, false), origin: 'seed', order: out.length });
  }
  // Omvända kandidater (reverse_candidate_allowed) – aldrig med viktprior (reverse_load_prior_allowed = false).
  for (const e of SEED.candidate_edges) {
    if (!e.reverse_candidate_allowed) continue;
    const from = appSlug(e.to_slug);
    const to = appSlug(e.from_slug);
    if (has(from, to)) continue;
    if (e.reverse_load_prior_allowed) throw new Error(`OMVÄND_PRIOR_EJ_GODKÄND ${e.from_slug}->${e.to_slug}`);
    out.push({ from, to, relation: e.relation_class, notes_key: e.notes_key, rationale_sv: NOTES_SV[e.notes_key] ?? '', evidence_ids: [...e.evidence_ids], load_estimation_policy: 'manual_calibration', load_prior: { kind: 'none' }, origin: 'seed_reverse', order: out.length });
  }
  return out;
}

const RELATIONS: readonly SubstitutionRelation[] = build();

/** Seed-filens godkända kvantitativa priors (appens id). Inga andra får finnas. */
export const APPROVED_PRIORS: ReadonlyArray<readonly [ExerciseId, ExerciseId]> = SEED.empirical_priors.map((p) => [appSlug(p.source_slug), appSlug(p.target_slug)] as const);

export function allRelations(): readonly SubstitutionRelation[] {
  return RELATIONS;
}

export function relationsFrom(from: ExerciseId): SubstitutionRelation[] {
  return RELATIONS.filter((r) => r.from === from);
}

export function relationBetween(from: ExerciseId, to: ExerciseId): SubstitutionRelation | undefined {
  return RELATIONS.find((r) => r.from === from && r.to === to);
}

/** Validering av katalogen: kända övningar, inga dubbletter, texter, priors bara enligt seed. Kastar vid fel. */
export function validateSubstitutionCatalog(): void {
  const seen = new Set<string>();
  for (const r of RELATIONS) {
    if (r.from === r.to) throw new Error(`SJÄLVRELATION ${r.from}`);
    const key = `${r.from}->${r.to}`;
    if (seen.has(key)) throw new Error(`DUBBLETT ${key}`);
    seen.add(key);
    if (!r.rationale_sv.trim()) throw new Error(`MOTIVERING_SAKNAS ${key} (${r.notes_key})`);
    if (r.load_prior.kind === 'population_ratio') {
      if (r.origin !== 'seed' || !APPROVED_PRIORS.some(([a, b]) => a === r.from && b === r.to)) throw new Error(`EJ_GODKÄND_PRIOR ${key}`);
      if (!(r.load_prior.ratio > 0 && r.load_prior.ratio < 1)) throw new Error(`OGILTIG_KVOT ${key}`);
      if (!r.load_prior.reference_ids.length) throw new Error(`PRIOR_UTAN_KÄLLA ${key}`);
      const perHand = exercise(r.to).loadDisplayBasis === 'per_hand_kg';
      if (perHand !== (r.load_prior.basis === 'per_hand_total')) throw new Error(`PRIOR_FEL_LASTBAS ${key}`);
    }
  }
}
