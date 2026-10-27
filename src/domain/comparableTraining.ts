import { exercise, type ExerciseId } from './catalog';
import { effectiveRir } from './effort';
import type { PerformedExercise } from './model';
import { comparisonKey, defaultConfiguration, requiredSides, type ExerciseConfiguration } from './trainingFlow';

/** Projects exact side records conservatively into the established progression engine. */
export function comparableHistory(history: PerformedExercise[], id: ExerciseId, configuration?: ExerciseConfiguration, legacyVariant = 'default', targetSide?: 'left'|'right'): PerformedExercise[] {
  const c = configuration ?? defaultConfiguration(id);
  const key = comparisonKey(id, c);
  // Known default free-weight semantics remain comparable across the upgrade.
  // Older unilateral and machine aggregates cannot establish side/equipment identity.
  const defaultFreeWeight = c.executionMode === 'bilateral' && ['free_mass','per_dumbbell','barbell_total'].includes(c.equipment.measurement) && key === comparisonKey(id,defaultConfiguration(id));
  const legacyAllowed = defaultFreeWeight || (!configuration && !history.some((h) => h.exerciseId === id && h.sets.some((s) => s.detail)));
  return history.filter((h) => h.exerciseId === id).flatMap((h) => {
    const sets = h.sets.map((s) => {
      if (!s.detail) return legacyAllowed && (h.plan.variantKey ?? 'default') === legacyVariant ? s : { ...s, status: 'skipped' as const };
      const done = s.detail.performances.filter((p) => p.status === 'done' && p.comparisonKey === key && (!targetSide || p.side===targetSide));
      const complete = (targetSide?[targetSide]:requiredSides(c)).every((side) => done.some((p) => p.side === side));
      if (!done.length || !['kg','s'].includes(c.equipment.unit) || c.equipment.basis === 'independent') return { ...s, status: 'skipped' as const };
      const loads = done.flatMap((p) => p.loadValue === null ? [] : [p.loadValue]);
      const reps = done.flatMap((p) => p.repetitions === null ? [] : [p.repetitions]);
      const sidePlan=targetSide?s.detail.plannedSides?.[targetSide]:undefined;
      const origin=s.detail.prescriptionOrigin;
      const original=targetSide?origin?.originalSides?.[targetSide]??origin?.original:origin?.original;
      const feelings=done.map(p=>p.effort??null);
      const effort=feelings.includes('too_heavy')?'too_heavy' as const:feelings.includes('maximal')?'maximal' as const:feelings.includes('hard')?'hard' as const:feelings.some(f=>f===null)?null:feelings.includes('ok')?'ok' as const:feelings.includes('easy')?'easy' as const:feelings.every(f=>f==='too_easy')?'too_easy' as const:null;
      return { ...s, ...(sidePlan?{plannedKg:sidePlan.grams===null?null:sidePlan.grams/1000,plannedReps:sidePlan.reps}:{}), status: complete ? 'done' as const : 'partial' as const,
        ...(original?{provenance:{...s.provenance,original,source:targetSide&&origin?.userEditedSides.includes(targetSide)?'user' as const:s.provenance?.source}}:{}),
        perceivedEffort:effort,
        actualKg: loads.length ? (exercise(id).loadKind === 'assistance_kg' ? Math.max(...loads) : Math.min(...loads)) : null,
        actualReps: reps.length ? Math.min(...reps) : null,
        actualSeconds: done.every(p=>p.seconds!==null) ? Math.min(...done.map(p=>p.seconds!)) : s.actualSeconds,
        rir: done.some((p) => effectiveRir(p.rir,p.effort) === 0) ? 0 : done.every((p) => effectiveRir(p.rir,p.effort) !== null) ? Math.min(...done.map((p) => effectiveRir(p.rir,p.effort)!)) : null,
        technique: done.some(p=>p.technique==='poor') ? 'poor' as const : done.some((p) => p.technique !== 'controlled') ? 'uncertain' as const : 'controlled' as const };
    });
    if (!sets.some((s) => s.kind === 'work' && ['done', 'partial'].includes(s.status))) return [];
    return [{ ...h, sets }];
  });
}
