import type { Experience, Mode, Recovery, SymptomState } from './decision_engine';
import type { ExerciseId } from './catalog';
import type { Area, EquipmentSlug, LoadDisplayBasis, LoadKind } from './catalog';

/** Versionsnummer som sparas i varje plansnapshot (04 §4). */
export const RULESET_VERSION = 'STYRKA-RULES/2.1.0' as const;
export const PLANNER_VERSION = 'STYRKA-PLANNER/2.1.0' as const;

export type Readiness = 'good' | 'normal' | 'tired' | 'pain';
export type SessionKind = 'planned' | 'extra' | 'calibration';
export type SessionStatus = 'preview' | 'in_progress' | 'paused' | 'completed' | 'partial' | 'abandoned';
export type Technique = 'controlled' | 'uncertain' | 'poor';
export type SetKind = 'work' | 'warmup';
export type SetStatus = 'planned' | 'partial' | 'done' | 'skipped';
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
  confidence?: 'low' | 'medium';
  inputReason?: 'MULTIPLE_STRENGTH_INPUTS' | 'STRENGTH_INPUTS_DISAGREE';
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
  trainingPreferences?: import('./trainingFlow').TrainingPreferences;
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
  /** Aktiv maskinprofil per övning (§2.3). Saknas ⇒ 'default'. */
  equipmentProfiles?: Partial<Record<ExerciseId, string>>;
};

/** Föreskrift för en övning i ett plansnapshot. Immutabel efter skapande. */
export type PlannedExercise = {
  /** Ordinary dose survives temporary time/recovery reductions; never a debt to repay. */
  doseContext?: { version: 'DOSE/2.1.0'; ordinarySets: number; temporaryReasons: string[] };
  sideTargets?: Partial<Record<'left'|'right', {kg:number|null;reps:number}>>;
  adaptive?: import('./adaptiveProgression').AdaptiveEvidence;
  recommendation?: { version: string; source: import('./startingLoad').RecommendationSource; confidence: Confidence; sourceExerciseId?: string; suggestedKg?: number | null };
  /** Present only when the user explicitly selects the performed-set source policy. */
  loadSourcePolicyVersion?: 'STYRKA-LOAD-SOURCE/1.0.0';
  targetLoadValue?: number | null;
  targetSecondLoadValue?: number | null;
  configuration?: import('./trainingFlow').ExerciseConfiguration;
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
  // ---- Tillägg STYRKA-CR-2026-10-10-01 (valfria; äldre snapshots saknar dem) ----
  /** Hur kg-värdet ska förstås (t.ex. per hantel). */
  loadBasis?: LoadDisplayBasis;
  /** Maskinprofil/redskapsvariant; historik matchas per variant för maskinövningar. */
  variantKey?: string;
  /** Underlag för vikten (§4.3). */
  loadEstimationKind?: LoadEstimationKind;
  /** Osäkert kalibreringsförslag (hjälpskattning) när kg är null; ska bekräftas av användaren. */
  calibrationSuggestionKg?: number | null;
  /** Substitutionens revisionsuppgifter. */
  substitution?: SubstitutionMeta;
};

export type LoadEstimationKind = 'target_observed' | 'target_estimated' | 'calibration' | 'population_prior_low_confidence' | 'none';
/** Relationsklasser enligt replacement_seed.json (schema 1.0.0). */
export type RelationClass = 'near_variant' | 'movement_family' | 'accessory';
export type Familiarity = 'familiar' | 'unfamiliar' | 'unknown';
export type ChoiceScope = 'today' | 'future';
/** too_heavy is retained for earlier calibration answers; hard does not mean too_heavy. */
export type PerceivedEffort = 'too_easy' | 'easy' | 'ok' | 'hard' | 'maximal' | 'too_heavy';

export type SubstitutionMeta = {
  catalogVersion: string;
  ruleSetVersion: string;
  relation: RelationClass | 'same_exercise_new_profile';
  evidenceIds: string[];
  /** Endast hjälpskattning: kvot, källans e1RM och använd andel. */
  prior?: { ratio: number; sourceExerciseId: ExerciseId; sourceE1rm: number; tentativeE1rm: number; pct: number; perHand: boolean };
  /** Ursprunglig planerad övning (sessionens snapshot-id). */
  replacesSessionExerciseId?: string;
};

/** Byte som gjorts i förhandsvisningen innan passet startat; skrivs som händelse vid start. */
export type PendingSubstitution = {
  original: PlannedExercise;
  replacementExerciseId: ExerciseId;
  scope: ChoiceScope;
  userOverride: boolean;
  createdAt: string;
  /** Ersättarens maskinprofil (matchning mot övningen i snapshotet). */
  variantKey?: string;
  /** Användarens bekräftade/ändrade startvikt i gram (förifylld målvikt); null = väljer själv. */
  startGrams?: number | null;
};

export type PlanStatus = 'ok' | 'time_reduced' | 'time_insufficient' | 'no_full_schedule' | 'empty';

export type WarningCode = 'WARN_CAL' | 'WARN_TIME' | 'WARN_REVIEW' | 'WARN_NO_FULL_SCHEDULE' | 'WARN_TIME_INSUFFICIENT' | 'WARN_EMPTY' | 'WARN_PAIN' | 'WARN_RECOVERY';

export type PlanSnapshot = {
  catchUp?: { sourceExerciseId: string; exerciseId: ExerciseId; replacesExerciseId: ExerciseId; reason: 'time' | 'equipment'; decisionId: string };
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
  /** Byten i förhandsvisningen (original bevaras). */
  substitutions?: PendingSubstitution[];
};

/** Ett utfört set i historiken (från lokal databas), kg som tal. */
export type HistorySet = {
  provenance?: {
    original?: { loadValue: number | null; secondLoadValue?: number | null; reps: number | null; seconds?: number | null };
    source?: 'engine' | 'user' | 'unknown';
    role?: 'ordinary' | 'extra';
  };
  detail?: import('./trainingFlow').SetDetail;
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
  /** Frivillig setkänsla. Ensidiga svar finns på respektive prestation i detail. */
  perceivedEffort?: PerceivedEffort | null;
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
  catchUp?: { sourceExerciseId: string; exerciseId: ExerciseId; replacesExerciseId: ExerciseId; reason: 'time' | 'equipment'; decisionId: string; mode: Mode; sets: number; targetRotationIndex: number; substitutionFrom?: ExerciseId | null };
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
