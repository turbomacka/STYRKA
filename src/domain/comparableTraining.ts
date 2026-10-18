import { exercise, type ExerciseId } from './catalog';
import { effectiveRir } from './effort';
import type { PerformedExercise } from './model';
import { comparisonKey, defaultConfiguration, requiredSides, type ExerciseConfiguration } from './trainingFlow';

/** Projects exact side records conservatively into the established progression engine. */
export function comparableHistory(history: PerformedExercise[], id: ExerciseId, configuration?: ExerciseConfiguration, legacyVariant = 'default'): PerformedExercise[] {
  const c = configuration ?? defaultConfiguration(id);
  const key = comparisonKey(id, c);
  // Known default free-weight semantics remain comparable across the upgrade.
  // Older unilateral and machine aggregates cannot establish side/equipment identity.
  const defaultFreeWeight = c.executionMode === 'bilateral' && ['free_mass','per_dumbbell','barbell_total'].includes(c.equipment.measurement) && key === comparisonKey(id,defaultConfiguration(id));
  const legacyAllowed = defaultFreeWeight || (!configuration && !history.some((h) => h.exerciseId === id && h.sets.some((s) => s.detail)));
  return history.filter((h) => h.exerciseId === id).flatMap((h) => {
    const sets = h.sets.map((s) => {
      if (!s.detail) return legacyAllowed && (h.plan.variantKey ?? 'default') === legacyVariant ? s : { ...s, status: 'skipped' as const };
      const done = s.detail.performances.filter((p) => p.status === 'done' && p.comparisonKey === key);
      const complete = requiredSides(c).every((side) => done.some((p) => p.side === side));
      if (!done.length || c.equipment.unit !== 'kg' || c.equipment.basis === 'independent') return { ...s, status: 'skipped' as const };
      const loads = done.flatMap((p) => p.loadValue === null ? [] : [p.loadValue]);
      const reps = done.flatMap((p) => p.repetitions === null ? [] : [p.repetitions]);
      return { ...s, status: complete ? 'done' as const : 'partial' as const,
        actualKg: loads.length ? (exercise(id).loadKind === 'assistance_kg' ? Math.max(...loads) : Math.min(...loads)) : null,
        actualReps: reps.length ? Math.min(...reps) : null,
        rir: done.some((p) => effectiveRir(p.rir,p.effort) === 0) ? 0 : done.every((p) => effectiveRir(p.rir,p.effort) !== null) ? Math.min(...done.map((p) => effectiveRir(p.rir,p.effort)!)) : null,
        technique: done.some((p) => p.technique !== 'controlled') ? 'uncertain' as const : 'controlled' as const };
    });
    if (!sets.some((s) => s.kind === 'work' && ['done', 'partial'].includes(s.status))) return [];
    return [{ ...h, sets }];
  });
}
