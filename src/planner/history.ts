import type { Mode, SymptomState } from '../domain/decision_engine';
import type { ExerciseId } from '../domain/catalog';
import { exercise, impactsAreas, isRelevantFor, type Area } from '../domain/catalog';
import type { PerformedExercise, RestrictionRule, SymptomReport } from '../domain/model';
import { hasWork, type GateInput } from '../domain/prescription';
import { assessRecovery } from '../domain/recoveryPolicy';
import { comparisonKey, type ExerciseConfiguration } from '../domain/trainingFlow';

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
    .filter((h) => h.sessionStatus !== 'preview' && hasWork(h) && Date.parse(h.whenUtc) <= now)
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
    const laterRelevant = history.some((h) => h.sessionId !== s.sessionId && impactsAreas(h.exerciseId, [s.area]) && h.sets.some(set=>{
      if(set.kind!=='work') return false;
      if(set.detail) return set.detail.performances.some(p=>p.status==='done' && (!s.side||s.side==='both'||s.side==='not_applicable'||p.side==='both'||p.side===s.side) && Date.parse(p.completedAt??set.occurredAt??h.whenUtc)>reported);
      return set.status==='done'&&Date.parse(set.occurredAt??h.whenUtc)>reported;
    }));
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
 * annars används den aktuella mängd-/ansträngningsbedömningen. En utgången korttidsbegränsning
 * skickas som null till referensmotorn, inte som påhittade timmar. Långt uppehåll och symtom bevaras.
 */
export function gateFor(ex: ExerciseId, history: PerformedExercise[], active: SymptomReport[], nowUtc: string, configuration?: ExerciseConfiguration, restrictions: RestrictionRule[] = []): GateInput & { groupHours: number | null; recovery: ReturnType<typeof assessRecovery> } {
  const comparable=configuration?history.filter(h=>h.exerciseId===ex && h.sets.some(s=>s.kind==='work' && (s.detail?s.detail.performances.some(p=>p.status==='done' && p.comparisonKey===comparisonKey(ex,{...configuration,executionMode:s.detail!.configuration.executionMode,startingSide:s.detail!.configuration.startingSide}) && (configuration.executionMode!=='single_side'||p.side==='both'||p.side===configuration.startingSide)):s.status==='done'&&(h.plan.variantKey??'default')==='default'))):history;
  const exHours = hoursSinceExercise(comparable, ex, nowUtc);
  const groupHours = hoursSinceGroup(history, ex, nowUtc);
  const recovery = assessRecovery(ex, history, nowUtc, configuration);
  const sideMatches = (side: string | null) => configuration?.executionMode !== 'single_side' || !side || side === 'both' || side === 'not_applicable' || side === configuration.startingSide;
  const sym = symptomFor(ex, active.filter(s=>sideMatches(s.side)));
  if(restrictions.some(r=>r.active&&sideMatches(r.side)&&((r.area&&impactsAreas(ex,[r.area]))||r.exerciseA===ex))) sym.impacted=true;
  let hours: number | null;
  if (exHours !== null && exHours > 312) hours = exHours;
  // The continuous assessment is authoritative for short-term work. Retain actual
  // elapsed time only for a symptom decision or a longer-break restart.
  else if(sym.state!=='none') hours=exHours;
  else hours = null;
  return { hoursSinceRelevant: hours, relevantSymptoms: sym.state, impactedRegion: sym.impacted, groupHours, recovery };
}

export function ruleTargets(rule: RestrictionRule, ex: ExerciseId, configuration?: ExerciseConfiguration): boolean {
  if (!rule.active) return false;
  if(configuration?.executionMode==='single_side'&&rule.side&&rule.side!=='both'&&rule.side!=='not_applicable'&&rule.side!==configuration.startingSide) return false;
  if (rule.exerciseA) return rule.exerciseA === ex;
  if (rule.area) return impactsAreas(ex, [rule.area]);
  return false;
}

export function isBlocked(ex: ExerciseId, rules: RestrictionRule[], configuration?: ExerciseConfiguration): boolean {
  return rules.some((r) => r.kind === 'block_exercise' && ruleTargets(r, ex, configuration));
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
