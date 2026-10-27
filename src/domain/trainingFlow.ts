import { exercise, type ExerciseId } from './catalog';
import { canonicalJson, sha256Hex } from './hash';
import type { PerceivedEffort, SetKind, SetStatus, Technique } from './model';

export type ExecutionMode = 'bilateral' | 'sequential' | 'alternating' | 'single_side';
export type PerformanceSide = 'both' | 'right' | 'left';
export type LoadMeasurement = 'free_mass' | 'per_dumbbell' | 'barbell_total' | 'machine_stack' | 'machine_level' | 'cable_known' | 'cable_unknown' | 'bodyweight_added' | 'bodyweight_assistance' | 'bodyweight' | 'duration';
export type EquipmentProfile = {
  id: string; name: string; type: string; manufacturer: string; model: string;
  unit: 'kg' | 'level' | 's'; measurement: LoadMeasurement;
  /** Mechanical ratio: stack mass / nominal handle load. 2 means 2:1. Null means unknown. */
  pulleyRatio: number | null; ratioVerified: boolean;
  stackCount: 1 | 2; handleCount: 1 | 2;
  basis: 'shared' | 'per_handle' | 'per_stack' | 'independent';
  increments: number[]; step: number; minimum: number | null;
  settings: string; comparisonGroup: string | null;
};
export type ExerciseConfiguration = {
  executionMode: ExecutionMode; startingSide: 'right' | 'left';
  equipment: EquipmentProfile; betweenSidesSeconds: number;
  restSeconds: number | null; warmupVisible: boolean | null;
};
export type SetPerformance = {
  effort?: PerceivedEffort | null;
  id: string; side: PerformanceSide; status: 'started' | 'done' | 'skipped';
  repetitions: number | null; loadValue: number | null; secondLoadValue: number | null;
  seconds: number | null; rir: number | null; technique: Technique | null;
  startedAt: string | null; completedAt: string | null;
  equipment: EquipmentProfile; executionMode: ExecutionMode; comparisonKey: string;
};
export type RestRecord = {
  initialRecommendedSeconds?: number;
  recommendationInput?: import('./restPolicy').RestInput;
  userAdjustmentSeconds?: number;
  recommendationUpdates?: Array<{ at: string; seconds: number; reasons: string[] }>;
  id: string; precedingPerformanceId: string; followingPerformanceId: string | null;
  followingSetId: string | null; type: 'between_sides' | 'between_sets' | 'warmup' | 'before_work';
  startedAt: string; endedAt: string | null; recommendedSeconds: number; actualSeconds: number | null;
  adjustmentSeconds: number; reasons: string[]; policyVersion: string;
  outcome: 'active' | 'started' | 'unobserved' | 'dismissed' | 'session_ended';
};
export type RecordedState = {
  status: SetStatus; deleted: boolean; grams: number|null; reps: number|null; seconds: number|null;
  rir: number|null; technique: Technique|null; effort: PerceivedEffort|null;
  sides: Array<Pick<SetPerformance,'id'|'side'|'status'|'loadValue'|'secondLoadValue'|'repetitions'|'seconds'|'rir'|'technique'|'comparisonKey'> & {unit: EquipmentProfile['unit']; measurement: LoadMeasurement; effort: PerceivedEffort|null}>;
};
export type SetDoseTarget = { loadValue: number | null; secondLoadValue: number | null; reps: number | null; seconds: number | null };
export type SetPrescriptionOrigin = {
  version: 1;
  source?: 'engine' | 'unknown';
  role: 'ordinary' | 'extra';
  original: SetDoseTarget;
  originalSides?: Partial<Record<PerformanceSide, SetDoseTarget>>;
  userEditedSides: PerformanceSide[];
};
export type SetDetail = {
  /** Immutable app targets; explicit edits do not overwrite the original prescription. */
  prescriptionOrigin?: SetPrescriptionOrigin;
  recordingChanges?: Array<{id:string;at:string;before:RecordedState;afterHash:string}>;
  /** Absent on legacy/manual rows: never infer ownership of old warmups. */
  warmupProposal?: { policyVersion: string; managed: boolean; suppressed?: boolean };
  plannedSides?: Partial<Record<PerformanceSide, { grams: number | null; reps: number | null; seconds: number | null; secondLoad: number | null }>>;
  targetLoadValue?: number | null; targetSecondLoadValue?: number | null;
  version: 1; configuration: ExerciseConfiguration; performances: SetPerformance[]; rests: RestRecord[];
  aborted: boolean;
};
export type TrainingPreferences = {
  /** Missing on older profiles: retain their existing estimate-based behaviour. */
  loadRecommendationSource?: 'performed_sets' | 'strength_inputs';
  showWarmupSets: boolean; adaptiveRestEnabled: boolean; defaultStartingSide: 'right' | 'left';
  preferredRestOverrides: Partial<Record<ExerciseId, number>>;
  exerciseDefaults: Partial<Record<ExerciseId, ExerciseConfiguration>>;
  equipmentProfiles: EquipmentProfile[];
};
export const trainingPreferences = (value?: Partial<TrainingPreferences>): TrainingPreferences => ({
  showWarmupSets: false, adaptiveRestEnabled: true, defaultStartingSide: 'right', preferredRestOverrides: {}, exerciseDefaults: {}, equipmentProfiles: [], ...value,
});
export const EXECUTION_LABELS: Record<ExecutionMode, string> = { bilateral: 'Båda samtidigt', sequential: 'En sida i taget', alternating: 'Växelvis · reps per sida', single_side: 'Endast en sida' };
export const SIDE_LABELS: Record<PerformanceSide, string> = { both: 'Båda', right: 'Höger', left: 'Vänster' };
export const LOAD_LABELS: Record<LoadMeasurement, string> = { free_mass: 'Fri vikt', per_dumbbell: 'Per hantel', barbell_total: 'Skivstång totalt', machine_stack: 'Maskinens viktstapel', machine_level: 'Maskinens nivå', cable_known: 'Kabel · känd utväxling', cable_unknown: 'Kabel · okänd utväxling', bodyweight_added: 'Kroppsvikt + extra vikt', bodyweight_assistance: 'Assistans', bodyweight: 'Kroppsvikt', duration: 'Tid' };

export function supportedMeasurements(id: ExerciseId): LoadMeasurement[] {
  const kind = exercise(id).loadKind;
  if (kind === 'duration_sec') return ['duration'];
  if (kind === 'reps_only') return ['bodyweight'];
  if (kind === 'bodyweight_plus_kg') return ['bodyweight_added'];
  if (kind === 'assistance_kg') return ['bodyweight_assistance'];
  return ['free_mass', 'per_dumbbell', 'barbell_total', 'machine_stack', 'machine_level', 'cable_known', 'cable_unknown'];
}

export function executionDefinition(id: ExerciseId): { supported: ExecutionMode[]; default: ExecutionMode } {
  const c = exercise(id);
  const unilateral = c.unilateral || id === 'cable_lateral_raise';
  const flexible = unilateral || ['dumbbell', 'cable', 'machine'].includes(c.equipmentClass);
  return { supported: flexible ? ['bilateral', 'sequential', 'alternating', 'single_side'] : ['bilateral'], default: unilateral ? 'sequential' : 'bilateral' };
}
export function defaultConfiguration(id: ExerciseId, side: 'right' | 'left' = 'right'): ExerciseConfiguration {
  const c = exercise(id);
  const measurement: LoadMeasurement = c.loadKind === 'duration_sec' ? 'duration' : c.loadKind === 'reps_only' ? 'bodyweight' : c.loadKind === 'bodyweight_plus_kg' ? 'bodyweight_added' : c.loadKind === 'assistance_kg' ? 'bodyweight_assistance' : c.equipmentClass === 'cable' ? 'cable_unknown' : c.equipmentClass === 'machine' || c.equipmentClass === 'smith' ? 'machine_stack' : c.loadDisplayBasis === 'per_hand_kg' ? 'per_dumbbell' : c.equipmentClass === 'barbell' || c.equipmentClass === 'specialty_bar' ? 'barbell_total' : 'free_mass';
  return { executionMode: executionDefinition(id).default, startingSide: side, betweenSidesSeconds: 0, restSeconds: null, warmupVisible: null,
    equipment: { id: '', name: '', type: c.equipmentClass, manufacturer: '', model: '', unit: measurement === 'duration' ? 's' : 'kg', measurement, pulleyRatio: null, ratioVerified: false, stackCount: 1, handleCount: measurement === 'per_dumbbell' && id !== 'one_arm_dumbbell_row' ? 2 : 1, basis: 'shared', increments: [], step: c.defaultIncrementKg, minimum: null, settings: '', comparisonGroup: null } };
}
export function requiredSides(c: ExerciseConfiguration): PerformanceSide[] {
  return c.executionMode === 'bilateral' ? ['both'] : c.executionMode === 'single_side' ? [c.startingSide] : [c.startingSide, c.startingSide === 'right' ? 'left' : 'right'];
}
export function detailStatus(d: SetDetail): SetStatus {
  const sides = requiredSides(d.configuration);
  if (sides.every((side) => d.performances.some((p) => p.side === side && p.status === 'done'))) return 'done';
  if (d.performances.some((p) => p.status === 'done' || p.status === 'started')) return 'partial';
  return d.aborted || sides.every((side) => d.performances.some((p) => p.side === side && p.status === 'skipped')) ? 'skipped' : 'planned';
}
export function nextSide(d: SetDetail): PerformanceSide | null {
  if (d.aborted) return null;
  return requiredSides(d.configuration).find((s) => !d.performances.some((p) => p.side === s && (p.status === 'done' || p.status === 'skipped'))) ?? null;
}
export function comparisonKey(id: ExerciseId, c: ExerciseConfiguration): string {
  const e = c.equipment;
  // Explicit group is the user's comparison assertion. Measurement semantics still have to agree.
  const identity = e.comparisonGroup ? { group: e.comparisonGroup } : { id: e.id, ratio: e.pulleyRatio, verified: e.ratioVerified, stacks: e.stackCount, handles: e.handleCount, settings: e.settings };
  return sha256Hex(canonicalJson({ exercise: id, mode: c.executionMode, single: c.executionMode === 'single_side' ? c.startingSide : null, unit: e.unit, measurement: e.measurement, basis: e.basis, identity })).slice(0, 32);
}
export function nominalHandleLoad(value: number | null, e: EquipmentProfile): number | null {
  return value !== null && e.unit === 'kg' && e.measurement === 'cable_known' && e.ratioVerified && e.pulleyRatio !== null && e.pulleyRatio > 0 && (e.basis !== 'shared' || e.handleCount === 1) ? value / e.pulleyRatio : null;
}
export function canEstimateMax(e: EquipmentProfile): boolean {
  return e.unit === 'kg' && ['free_mass', 'per_dumbbell', 'barbell_total', 'machine_stack', 'cable_known', 'cable_unknown'].includes(e.measurement) && e.basis !== 'independent';
}
/** Mass × reps is descriptive recorded volume, never mechanical energy or bilateral strength. */
export function recordedWork(p: SetPerformance): number | null {
  if (p.status !== 'done' || p.repetitions === null || p.loadValue === null || p.equipment.unit !== 'kg') return null;
  const e = p.equipment;
  if (!['free_mass', 'per_dumbbell', 'barbell_total'].includes(e.measurement)) return null;
  const multiplier = e.measurement === 'per_dumbbell' && p.side === 'both' ? e.handleCount : 1;
  return p.loadValue * p.repetitions * multiplier;
}
export function setCounts(sets: Array<{ kind: SetKind; status: SetStatus; deleted: boolean; detail?: SetDetail }>) {
  const work = sets.filter((s) => !s.deleted && s.kind === 'work');
  const done = work.flatMap((s) => s.detail?.performances.filter((p) => p.status === 'done') ?? []);
  return { planned: work.length, complete: work.filter((s) => s.status === 'done').length,
    partial: work.filter((s) => s.status === 'partial').length, performances: done.length,
    right: done.filter((p) => p.side === 'right' || p.side === 'both').length,
    left: done.filter((p) => p.side === 'left' || p.side === 'both').length,
    unknownSideSets: work.filter((s) => s.status === 'done' && !s.detail).length,
  };
}
export function validateConfiguration(c: ExerciseConfiguration): boolean {
  if (!c || !Object.keys(EXECUTION_LABELS).includes(c.executionMode) || !['right', 'left'].includes(c.startingSide)) return false;
  const e = c.equipment;
  if (!e || !Object.keys(LOAD_LABELS).includes(e.measurement) || !['kg', 'level', 's'].includes(e.unit)) return false;
  if ((e.measurement === 'machine_level') !== (e.unit === 'level') || (e.measurement === 'duration') !== (e.unit === 's')) return false;
  if (!Number.isFinite(e.step) || e.step <= 0 || e.step > 500 || ![1, 2].includes(e.stackCount) || ![1, 2].includes(e.handleCount)) return false;
  if (!['shared', 'per_handle', 'per_stack', 'independent'].includes(e.basis) || !Array.isArray(e.increments) || e.increments.length > 100 || e.increments.some((n) => !Number.isFinite(n) || n < 0 || n > 500)) return false;
  if (e.minimum !== null && (!Number.isFinite(e.minimum) || e.minimum < 0 || e.minimum > 500)) return false;
  if (e.pulleyRatio !== null && (!Number.isFinite(e.pulleyRatio) || e.pulleyRatio <= 0 || e.pulleyRatio > 20)) return false;
  if (typeof e.ratioVerified !== 'boolean' || (e.measurement === 'cable_known' && (!e.ratioVerified || e.pulleyRatio === null))) return false;
  if ([e.id, e.name, e.type, e.manufacturer, e.model, e.settings, e.comparisonGroup ?? ''].some((s) => typeof s !== 'string' || s.length > 200)) return false;
  return Number.isInteger(c.betweenSidesSeconds) && c.betweenSidesSeconds >= 0 && c.betweenSidesSeconds <= 300 && (c.restSeconds === null || (Number.isInteger(c.restSeconds) && c.restSeconds >= 15 && c.restSeconds <= 300)) && (c.warmupVisible === null || typeof c.warmupVisible === 'boolean');
}
