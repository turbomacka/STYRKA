/**
 * Förvaltad substitutionskatalog (STYRKA-CR-2026-10-10-01 §2.2, `exercise_substitutions`).
 * Versionsstyrd lokal data. Relationerna är riktade: en relation från A till B innebär INTE att B → A finns,
 * och en hjälpskattning (kvot) gäller endast i angiven riktning – ingen automatisk invertering (SUB24).
 */
import seed from '../planner/replacement_seed.json';
import { exercise, isExerciseId, type ExerciseId } from './catalog';
import type { RelationClass } from './model';

export type StrengthSpecificity = 'high' | 'moderate' | 'low';
export type LoadPrior = { kind: 'none' } | { kind: 'population_ratio'; ratio: number; reference_ids: string[]; basis: 'total' | 'per_hand_total' };

export type SubstitutionRelation = {
  from: ExerciseId;
  to: ExerciseId;
  relation: RelationClass;
  strength_specificity: StrengthSpecificity;
  rationale_sv: string;
  evidence_ids: string[];
  load_prior: LoadPrior;
  enabled: boolean;
};

type Seed = { catalogVersion: string; relationLabels_sv: Record<RelationClass, string>; relations: SubstitutionRelation[] };
const SEED = seed as unknown as Seed;

export const SUBSTITUTION_CATALOG_VERSION = SEED.catalogVersion;
export const RELATION_LABEL_SV: Record<RelationClass, string> = SEED.relationLabels_sv;

/** Endast dessa två par har godkänd kvantitativ hjälpskattning (§3.1 p.4, §3.2). */
export const APPROVED_PRIORS: ReadonlyArray<readonly [ExerciseId, ExerciseId]> = [
  ['squat', 'front_squat'],
  ['bench_press', 'dumbbell_bench_press'],
];

export function allRelations(): readonly SubstitutionRelation[] {
  return SEED.relations;
}

export function relationsFrom(from: ExerciseId): SubstitutionRelation[] {
  return SEED.relations.filter((r) => r.enabled && r.from === from);
}

export function relationBetween(from: ExerciseId, to: ExerciseId): SubstitutionRelation | undefined {
  return SEED.relations.find((r) => r.enabled && r.from === from && r.to === to);
}

/** Validering av katalogen: kända övningar, inga dubbletter, priors bara för godkända par. Kastar vid fel. */
export function validateSubstitutionCatalog(): void {
  const seen = new Set<string>();
  for (const r of SEED.relations) {
    if (!isExerciseId(r.from) || !isExerciseId(r.to)) throw new Error(`OKÄND_ÖVNING ${r.from}->${r.to}`);
    if (r.from === r.to) throw new Error(`SJÄLVRELATION ${r.from}`);
    const key = `${r.from}->${r.to}`;
    if (seen.has(key)) throw new Error(`DUBBLETT ${key}`);
    seen.add(key);
    if (!r.rationale_sv.trim()) throw new Error(`MOTIVERING_SAKNAS ${key}`);
    if (r.load_prior.kind === 'population_ratio') {
      if (!APPROVED_PRIORS.some(([a, b]) => a === r.from && b === r.to)) throw new Error(`EJ_GODKÄND_PRIOR ${key}`);
      if (!(r.load_prior.ratio > 0 && r.load_prior.ratio < 1)) throw new Error(`OGILTIG_KVOT ${key}`);
      if (!r.load_prior.reference_ids.length) throw new Error(`PRIOR_UTAN_KÄLLA ${key}`);
      const perHand = exercise(r.to).loadDisplayBasis === 'per_hand_kg';
      if (perHand !== (r.load_prior.basis === 'per_hand_total')) throw new Error(`PRIOR_FEL_LASTBAS ${key}`);
    }
  }
}
