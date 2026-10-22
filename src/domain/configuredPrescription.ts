import type { Exposure } from './decision_engine';
import { effectiveRir } from './effort';
import type { PerformedExercise, PlannedExercise } from './model';
import { progressionDecision } from './prescription';
import { comparisonKey, requiredSides, type ExerciseConfiguration } from './trainingFlow';

/** Reuses the established repetition rules for ordinal levels / independent stacks.
 * The load fields supplied to progressionDecision are neutral 0/1 comparison flags,
 * never a conversion of levels or independent stacks to kilograms or estimated strength.
 */
function configuredPrescriptionImpl(plan: PlannedExercise, history: PerformedExercise[], c: ExerciseConfiguration): PlannedExercise {
  const e = c.equipment;
  if (e.unit === 'kg' && e.basis !== 'independent') {
    if (plan.kg === null || !e.increments.length) return plan;
    const feasible = e.increments.filter((x) => x <= plan.kg!);
    return { ...plan, kg: feasible.length ? Math.max(...feasible) : null };
  }
  if (e.unit === 's' || e.measurement === 'bodyweight') return plan;
  const key = comparisonKey(plan.exerciseId,c);
  const relevant = history.filter((h) => h.exerciseId === plan.exerciseId && h.plan.mode === plan.mode).map((h) => ({ h, work: h.sets.filter((s) => s.kind === 'work'), matched: h.sets.filter((s) => s.kind === 'work' && s.detail?.performances.some((p) => p.status === 'done' && p.comparisonKey === key)) })).filter((h) => h.matched.length);
  const last = relevant.at(-1);
  const empty = { ...plan, kg: null, estimatedOneRM: null, calibrationSuggestionKg: null, targetLoadValue: null, targetSecondLoadValue: null };
  if (!last) return empty;
  const performances = last.matched.flatMap((s) => s.detail!.performances.filter((p) => p.status === 'done' && p.comparisonKey === key));
  const loads = performances.flatMap((p) => p.loadValue === null ? [] : [p.loadValue]);
  const seconds = performances.flatMap((p) => p.secondLoadValue === null ? [] : [p.secondLoadValue]);
  if (!loads.length) return empty;
  let load = Math.min(...loads), second = seconds.length ? Math.min(...seconds) : null;
  let reps = last.h.plan.reps;
  const exposures: Exposure[] = relevant.map(({ h, work }) => ({
    exerciseId: plan.exerciseId as Exposure['exerciseId'], whenUtc: h.whenUtc,
    complete: work.filter((s) => s.status === 'done' && requiredSides(c).every((side) => s.detail?.performances.some((p) => p.side === side && p.status === 'done' && p.comparisonKey === key))).length >= h.plan.sets,
    plannedTargetReps: h.plan.reps, bandMax: h.plan.bandMax, symptom: 'none', voluntaryAbort: h.sessionStatus === 'abandoned',
    sets: work.map((s) => {
      const ps = s.detail?.performances.filter((p) => p.status === 'done' && p.comparisonKey === key) ?? [];
      const complete = requiredSides(c).every((side) => ps.some((p) => p.side === side));
      const met = ps.length > 0 && ps.every((p) => p.loadValue !== null && p.loadValue >= (s.detail?.targetLoadValue ?? load) && (e.basis !== 'independent' || (p.secondLoadValue !== null && p.secondLoadValue >= (s.detail?.targetSecondLoadValue ?? second ?? 0))));
      const reserves = ps.map((p) => effectiveRir(p.rir,p.effort));
      return { kind: 'work', status: complete ? 'done' : 'skipped', plannedKg: 1, actualKg: met ? 1 : 0, plannedReps: s.plannedReps ?? h.plan.reps, actualReps: ps.length ? Math.min(...ps.map((p) => p.repetitions ?? 0)) : 0, rir: reserves.includes(0) ? 0 : reserves.length && reserves.every((r) => r !== null) ? Math.min(...reserves) : null, technique: ps.every((p) => p.technique === 'controlled') ? 'controlled' : 'poor' };
    }),
  }));
  const decision = progressionDecision({ previous: { sets: last.h.plan.sets, reps, bandMax: plan.bandMax }, exposures });
  const step = (value: number, direction: 1 | -1) => e.increments.length ? (direction === 1 ? Math.min(...e.increments.filter((x) => x > value), value === Math.max(...e.increments) ? value : Infinity) : Math.max(...e.increments.filter((x) => x < value), e.minimum ?? 0)) : Math.max(e.minimum ?? 0, +(value + direction * e.step).toFixed(3));
  const progressionHeld = plan.state === 'caution' && (decision.kind === 'reps_up' || decision.kind === 'load_up');
  if (!['restart','review_required','blocked'].includes(plan.state) && !progressionHeld) {
    if (decision.kind === 'reps_up') reps++;
    if (decision.kind === 'load_up' || decision.kind === 'load_down') {
      const direction = decision.kind === 'load_up' ? 1 : -1;
      load = step(load,direction); if (second !== null) second = step(second,direction);
      if (direction === 1) reps = plan.bandMin;
    }
  }
  return { ...empty, targetLoadValue: Number.isFinite(load) ? Math.min(500,load) : null, targetSecondLoadValue: second !== null && Number.isFinite(second) ? Math.min(500,second) : null, reps, calibration: false, reasons: [...plan.reasons,progressionHeld ? 'RECOVERY_HOLD' : decision.reason] };
}

/** Keep source metadata consistent after equipment rounding or an ordinal load decision. */
export function configuredPrescription(plan: PlannedExercise, history: PerformedExercise[], c: ExerciseConfiguration): PlannedExercise {
  const result = configuredPrescriptionImpl(plan,history,c);
  if (!result.recommendation) return result;
  const calibratedValue = result.targetLoadValue != null;
  const source = calibratedValue ? 'history' : result.kg === null && result.targetSeconds === null && c.equipment.measurement !== 'bodyweight' ? 'calibration' : result.recommendation.source;
  return {...result,recommendation:{...result.recommendation,source,suggestedKg:result.kg}};
}
