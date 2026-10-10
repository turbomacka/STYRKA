import type { ExerciseId, Experience, Mode, Recovery, SymptomState } from './decision_engine';
import type { Area, EquipmentSlug, LoadKind } from './catalog';

/** Versionsnummer som sparas i varje plansnapshot (04 §4). */
export const RULESET_VERSION = 'STYRKA-RULES/1.0.0-app.1' as const;
export const PLANNER_VERSION = 'STYRKA-PLANNER/1.0.0' as const;

export type Readiness = 'good' | 'normal' | 'tired' | 'pain';
export type SessionKind = 'planned' | 'extra' | 'calibration';
export type SessionStatus = 'preview' | 'in_progress' | 'paused' | 'completed' | 'partial' | 'abandoned';
export type Technique = 'controlled' | 'uncertain' | 'poor';
export type SetKind = 'work' | 'warmup';
export type SetStatus = 'planned' | 'done' | 'skipped';
export type Confidence = 'unknown' | 'low' | 'medium' | 'high';
export type Role = 'main' | 'supplementary' | 'accessory' | 'bonus';
export type SymptomReaction = Exclude<SymptomState, 'none'>;
export type Side = 'left' | 'right' | 'both' | 'not_applicable';

export type RuleKind = 'block_exercise' | 'block_pair_heavy' | 'limit_sets' | 'limit_mode' | 'region_note';

export type RestrictionRule = {
  id: string;
  kind: RuleKind;
  exerciseA: ExerciseId | null;
  exerciseB: ExerciseId | null;
  area: Area | null;
  side: Side | null;
  maxSets: number | null;
  maxMode: Mode | null;
  active: boolean;
  description: string | null;
};

export type SymptomReport = {
  id: string;
  sessionId: string | null;
  area: Area;
  side: Side | null;
  reaction: SymptomReaction;
  reportedAt: string;
  resolvedAt: string | null;
};

export type LiftEstimateInput = {
  kind: '1rm' | '3rm' | 'submax';
  /** För `submax`: belastning och reps/RIR för det utförda setet. */
  kg: number;
  reps?: number;
  rir?: number | null;
  measured?: boolean;
  testedAt?: string;
};

export type UserExerciseSettings = {
  exerciseId: ExerciseId;
  experience: Experience | null;
  incrementKg: number | null;
  estimate: LiftEstimateInput | null;
  maxLoadKg: number | null;
  /** Assistansmaskinens tillåtna spann (för assistance_kg). */
  machineMinKg: number | null;
  machineMaxKg: number | null;
};

export type PlannerProfile = {
  plannedSessionsPerWeek: number;
  minutesPerSession: number;
  experience: Experience;
  /** Prioritet 0–3 per huvudlyft. */
  goals: Partial<Record<ExerciseId, number>>;
  equipment: EquipmentSlug[];
  /** Aktiva användarval: mallövning → vald ersättare inom samma familj. */
  substitutions: Partial<Record<ExerciseId, ExerciseId>>;
  favorites: ExerciseId[];
  bodyweightKg: number | null;
};

/** Föreskrift för en övning i ett plansnapshot. Immutabel efter skapande. */
export type PlannedExercise = {
  exerciseId: ExerciseId;
  loadKind: LoadKind;
  role: Role;
  mode: Mode;
  sets: number;
  reps: number;
  bandMin: number;
  bandMax: number;
  /** extern kg, assistans-kg eller extra-kg beroende på loadKind; null = kalibrering/ingen siffra. */
  kg: number | null;
  targetSeconds: number | null;
  state: Recovery;
  reasons: string[];
  confidence: Confidence;
  engineVersion: string;
  calibration: boolean;
  incrementKg: number;
  estimatedOneRM: number | null;
  substitutionFrom: ExerciseId | null;
  substitutionReason: string | null;
  acceptedByUserAt: string | null;
};

export type PlanStatus = 'ok' | 'time_reduced' | 'time_insufficient' | 'no_full_schedule' | 'empty';

export type WarningCode = 'WARN_CAL' | 'WARN_TIME' | 'WARN_REVIEW' | 'WARN_NO_FULL_SCHEDULE' | 'WARN_TIME_INSUFFICIENT' | 'WARN_EMPTY' | 'WARN_PAIN' | 'WARN_RECOVERY';

export type PlanSnapshot = {
  kind: 'planned' | 'extra';
  templateKey: string | null;
  templateVersion: string;
  rotationIndex: number | null;
  engineVersion: string;
  plannerVersion: string;
  ruleSetVersion: string;
  catalogVersion: string;
  generatedAtUtc: string;
  inputsHash: string;
  budgetMinutes: number;
  estimatedMinutes: number;
  readiness: Readiness | null;
  status: PlanStatus;
  exercises: PlannedExercise[];
  /** Övningar som togs bort av regler/tid, med skäl (för transparens). */
  removed: Array<{ exerciseId: ExerciseId; reason: string }>;
  reasons: string[];
  warnings: WarningCode[];
};

/** Ett utfört set i historiken (från lokal databas), kg som tal. */
export type HistorySet = {
  kind: SetKind;
  status: SetStatus;
  plannedKg: number | null;
  actualKg: number | null;
  plannedReps: number | null;
  actualReps: number | null;
  plannedSeconds: number | null;
  actualSeconds: number | null;
  rir: number | null;
  technique: Technique | null;
  occurredAt: string | null;
};

/** En övning i ett genomfört (completed/partial/abandoned) pass. */
export type PerformedExercise = {
  sessionId: string;
  sessionKind: SessionKind;
  sessionStatus: SessionStatus;
  exerciseId: ExerciseId;
  plan: PlannedExercise;
  sets: HistorySet[];
  /** Senaste tidpunkt med utfört arbetsset (UTC ISO). */
  whenUtc: string;
};

export type PlannerInput = {
  nowUtc: string;
  profile: PlannerProfile;
  exerciseSettings: UserExerciseSettings[];
  restrictions: RestrictionRule[];
  symptoms: SymptomReport[];
  /** Hela historiken av genomförda övningar, i valfri ordning. */
  history: PerformedExercise[];
  rotationIndex: number;
  /** Minuter för passet (standard: profilens). */
  minutes?: number;
};
