import type { Mode, SymptomState } from '../domain/decision_engine';
import type { ExerciseId } from '../domain/catalog';
import { exercise, impactsAreas, isRelevantFor, type Area } from '../domain/catalog';
import type { PerformedExercise, RestrictionRule, SymptomReport } from '../domain/model';
import { hasWork, type GateInput } from '../domain/prescription';

export const HOUR_MS = 3_600_000;

export function hoursBetween(earlierUtc: string, laterUtc: string): number {
  const a = Date.parse(earlierUtc);
  const b = Date.parse(laterUtc);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('INVALID_TIMESTAMP');
  return (b - a) / HOUR_MS;
}

/** Historik som faktiskt har utförda arbetsset och ligger före `nowUtc`, stigande tid. */
export function pastWork(history: PerformedExercise[], nowUtc: string): PerformedExercise[] {
  const now = Date.parse(nowUtc);
  return history
    .filter((h) => hasWork(h) && Date.parse(h.whenUtc) <= now)
    .sort((a, b) => Date.parse(a.whenUtc) - Date.parse(b.whenUtc) || a.sessionId.localeCompare(b.sessionId));
}

export function hoursSinceExercise(history: PerformedExercise[], ex: ExerciseId, nowUtc: string): number | null {
  const last = [...history].reverse().find((h) => h.exerciseId === ex);
  return last ? hoursBetween(last.whenUtc, nowUtc) : null;
}

export function hoursSinceGroup(history: PerformedExercise[], ex: ExerciseId, nowUtc: string, opts: { heavyOnly?: boolean } = {}): number | null {
  const last = [...history].reverse().find((h) => isRelevantFor(ex, h.exerciseId) && (!opts.heavyOnly || h.plan.mode === 'heavy'));
  return last ? hoursBetween(last.whenUtc, nowUtc) : null;
}

const SEVERE: SymptomState[] = ['persistent', 'limping', 'swelling'];

/**
 * Aktuella symtom per område:
 * - persistent/limping/swelling gäller tills användaren aktivt markerar löst (02 §6, ingen tyst tidsbaserad borttagning).
 * - transient gäller tills nästa relevanta exponering efter rapporten (som inte själv fick ny rapport).
 */
export function activeSymptoms(symptoms: SymptomReport[], history: PerformedExercise[]): SymptomReport[] {
  return symptoms.filter((s) => {
    if (s.resolvedAt) return false;
    if (SEVERE.includes(s.reaction)) return true;
    if (s.reaction !== 'transient') return false;
    const reported = Date.parse(s.reportedAt);
    const laterRelevant = history.some((h) => Date.parse(h.whenUtc) > reported && h.sessionId !== s.sessionId && impactsAreas(h.exerciseId, [s.area]));
    return !laterRelevant;
  });
}

export function symptomFor(ex: ExerciseId, active: SymptomReport[]): { state: SymptomState; impacted: boolean } {
  const matching = active.filter((s) => impactsAreas(ex, [s.area]));
  if (!matching.length) return { state: 'none', impacted: false };
  const severe = matching.find((s) => SEVERE.includes(s.reaction));
  return { state: severe ? severe.reaction : 'transient', impacted: true };
}

/**
 * Grindens timmar (02 §6): omstart (>13 dygn sedan samma övning) dominerar lastberäkningen;
 * annars gäller relevant gruppexponering <48 h; annars samma övning.
 */
export function gateFor(ex: ExerciseId, history: PerformedExercise[], active: SymptomReport[], nowUtc: string): GateInput & { groupHours: number | null } {
  const exHours = hoursSinceExercise(history, ex, nowUtc);
  const groupHours = hoursSinceGroup(history, ex, nowUtc);
  let hours: number | null;
  if (exHours !== null && exHours > 312) hours = exHours;
  else if (groupHours !== null && groupHours < 48) hours = groupHours;
  else hours = exHours;
  const sym = symptomFor(ex, active);
  return { hoursSinceRelevant: hours, relevantSymptoms: sym.state, impactedRegion: sym.impacted, groupHours };
}

export function ruleTargets(rule: RestrictionRule, ex: ExerciseId): boolean {
  if (!rule.active) return false;
  if (rule.exerciseA) return rule.exerciseA === ex;
  if (rule.area) return impactsAreas(ex, [rule.area]);
  return false;
}

export function isBlocked(ex: ExerciseId, rules: RestrictionRule[]): boolean {
  return rules.some((r) => r.kind === 'block_exercise' && ruleTargets(r, ex));
}

const MODE_RANK: Record<Mode, number> = { light: 0, moderate: 1, heavy: 2 };
export function capMode(mode: Mode, max: Mode): Mode {
  return MODE_RANK[mode] > MODE_RANK[max] ? max : mode;
}
export function modeRank(mode: Mode): number {
  return MODE_RANK[mode];
}

const LOWER_AREAS: Area[] = ['knee', 'hip', 'lower_back', 'hamstring'];
/** Underkroppskänslig profil: aktiv områdesnotering eller aktivt symtom i underkropp/ländrygg. */
export function isLowerSensitive(rules: RestrictionRule[], active: SymptomReport[]): boolean {
  return rules.some((r) => r.active && r.area !== null && LOWER_AREAS.includes(r.area)) || active.some((s) => LOWER_AREAS.includes(s.area));
}

export function lastPerformedPriorityLift(history: PerformedExercise[], ex: ExerciseId, nowUtc: string): number | null {
  if (!exercise(ex).priorityLift) return null;
  return hoursSinceExercise(history, ex, nowUtc);
}
