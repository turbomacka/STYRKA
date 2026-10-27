import { estimateCapacity } from './adaptiveProgression';
import { exercise } from './catalog';
import { comparableHistory } from './comparableTraining';
import { recoveryGate } from './decision_engine';
import type { PerformedExercise, PlannedExercise, PlannerInput, UserExerciseSettings } from './model';
import { e1rmFromEstimate, toExposure, type GateInput } from './prescription';
import { allRelations } from './substitutionCatalog';
import { comparisonKey, defaultConfiguration } from './trainingFlow';

export const STARTING_LOAD_VERSION = 'STARTING-LOAD/1.0.0';
export const SOURCE_LABELS = {
  history: 'Egen historik', estimate: 'Egen styrkeuppskattning', performance: 'Beräknat från egna arbetsset',
  transfer: 'Försiktig styrkeöverföring', model: 'Generell styrkemodell', conservative: 'Försiktigt startvärde', calibration: 'Kalibrering',
} as const;
export type RecommendationSource = keyof typeof SOURCE_LABELS;

/** Only actual comparable work can establish an observed max; never inherit a forecast. */
function observedMax(history: PerformedExercise[]): number | null {
  return estimateCapacity(history.filter(h=>h.sessionStatus!=='preview').map(toExposure)).estimatedMax;
}

/** Shared by regular, replacement and added exercises. Numerical fallbacks are product heuristics. */
export function resolveStartingLoad(input: PlannerInput, plan: PlannedExercise, history: PerformedExercise[], settings: UserExerciseSettings | null, gate: GateInput): PlannedExercise {
  const id = plan.exerciseId, ex = exercise(id);
  const c = input.profile.trainingPreferences?.exerciseDefaults[id] ?? defaultConfiguration(id), e = c.equipment;
  const observedOnly = input.profile.trainingPreferences?.loadRecommendationSource === 'performed_sets';
  const withSource = (p: PlannedExercise, source: RecommendationSource, sourceExerciseId?: string): PlannedExercise => ({
    ...p, recommendation: { version: STARTING_LOAD_VERSION, source, confidence: p.confidence, suggestedKg: p.kg, ...(sourceExerciseId ? { sourceExerciseId } : {}) },
  });
  if (plan.kg !== null || plan.targetSeconds !== null) return withSource(plan, history.length ? 'history' : settings?.estimate ? 'estimate' : 'conservative');
  if (['blocked','review_required'].includes(plan.state)) return withSource(plan,'calibration');
  if (ex.loadKind === 'duration_sec') return withSource({ ...plan, targetSeconds: 15, calibration: false, confidence: 'low' }, 'conservative');
  if (ex.loadKind === 'bodyweight_plus_kg') return withSource({ ...plan, kg: 0, calibration: false, confidence: 'low' }, 'conservative');
  if (ex.loadKind === 'reps_only') return withSource({ ...plan, calibration: false }, 'conservative');
  const empty = () => withSource(plan, 'calibration');
  // An unknown machine/assistance scale cannot be inferred from free weights.
  if (ex.loadKind !== 'external_kg' || e.unit !== 'kg' || e.basis === 'independent' ||
      !['free_mass','per_dumbbell','barbell_total'].includes(e.measurement) || ex.requiresEquipmentProfile) return empty();
  let raw: number | null = null, source: RecommendationSource = 'conservative', sourceId: string | undefined;
  const ownMax = observedMax(history);
  if (ownMax !== null) { raw = ownMax * (plan.mode === 'light' ? .4 : .5); source = 'performance'; }
  const restricted = (sourceExercise: string) => input.restrictions.some((r) => r.active &&
    ([id,sourceExercise].includes(r.exerciseA ?? '') || [id,sourceExercise].includes(r.exerciseB ?? '') || (r.area && ex.areas.includes(r.area))));
  if (raw === null && !observedOnly && !gate.impactedRegion && comparisonKey(id,c) === comparisonKey(id,defaultConfiguration(id))) {
    const candidates: Array<{ value: number; source: RecommendationSource; id: string }> = [];
    for (const rel of allRelations().filter((r) => r.to === id && r.relation !== 'accessory')) {
      if (restricted(rel.from)) continue;
      const from = exercise(rel.from), config = input.profile.trainingPreferences?.exerciseDefaults[rel.from] ?? defaultConfiguration(rel.from);
      if (from.loadKind !== 'external_kg' || from.requiresEquipmentProfile || config.executionMode !== 'bilateral' ||
          !['free_mass','per_dumbbell','barbell_total'].includes(config.equipment.measurement) ||
          comparisonKey(rel.from,config) !== comparisonKey(rel.from,defaultConfiguration(rel.from))) continue;
      const recent = comparableHistory(input.history, rel.from, config).filter((h) => Date.parse(input.nowUtc)-Date.parse(h.whenUtc) <= 180*86400000);
      const estimate = input.exerciseSettings.find((s) => s.exerciseId === rel.from)?.estimate;
      const max = observedMax(recent) ?? (estimate ? e1rmFromEstimate(estimate)?.kg ?? null : null);
      if (max === null) continue;
      const prior = rel.load_prior;
      // Empirical priors are uncertain group averages. Other same-pattern relations use a deliberately
      // low work-load heuristic, never a prediction of the target's individual maximum.
      if (prior.kind === 'population_ratio') candidates.push({ value: max * prior.ratio * .5 / (prior.basis === 'per_hand_total' ? 2 : 1), source: 'transfer', id: rel.from });
      else if (from.pattern === ex.pattern && from.loadDisplayBasis === ex.loadDisplayBasis && !ex.unilateral)
        candidates.push({ value: max * .4, source: 'model', id: rel.from });
    }
    const chosen = candidates.sort((a,b) => a.value-b.value || a.id.localeCompare(b.id))[0];
    if (chosen) { raw = chosen.value; source = chosen.source; sourceId = chosen.id; }
  }
  if (raw === null) {
    // These are trial loads, not estimates based on sex, age, body mass or experience.
    raw = e.minimum ?? (e.increments.length ? Math.min(...e.increments.filter((x) => x > 0)) :
      e.measurement === 'per_dumbbell' || e.measurement === 'free_mass' ? (ex.timeKind === 'isolation' ? 2 : 4) : null);
  }
  if (raw === null || !Number.isFinite(raw)) return empty();
  if (plan.state === 'restart') raw *= recoveryGate(gate.hoursSinceRelevant,gate.relevantSymptoms,gate.impactedRegion).factor;
  if (plan.mode === 'light' && (source === 'transfer' || source === 'model')) raw *= .8;
  raw = Math.min(raw, settings?.maxLoadKg ?? 500);
  const minimum = e.minimum ?? 0;
  const feasible = e.increments.filter((x) => x > 0 && x >= minimum && x <= raw!);
  const load = e.increments.length ? (feasible.length ? Math.max(...feasible) : 0) :
    Math.floor((raw-minimum)/e.step)*e.step+minimum;
  if (!(load > 0) || load < minimum) return empty();
  return withSource({ ...plan, kg: +load.toFixed(3), calibration: true, confidence: 'low', estimatedOneRM: null,
    reasons: [...plan.reasons.filter((r) => r !== 'CALIBRATION_REQUIRED'), 'STARTING_LOAD_' + source.toUpperCase()] },source,sourceId);
}
