/**
 * Lokal IndexedDB (Dexie). En databas PER autentiserad användare (`styrka_<userId>`), raderas vid utloggning
 * (03 §4: partitionering och tömning vid kontobyte). IndexedDB är en temporär cache/kö – servern är enda
 * pålitliga långsiktiga backup (03 §5.2, R11).
 */
import Dexie, { type Table } from 'dexie';
import type { Experience, Mode } from '../domain/decision_engine';
import type { ExerciseId } from '../domain/catalog';
import type { Area, EquipmentSlug } from '../domain/catalog';
import type { ChoiceScope, Familiarity, LoadEstimationKind, PerceivedEffort, PlanSnapshot, PlannedExercise, Readiness, RuleKind, SessionKind, SessionStatus, SetKind, SetStatus, Side, SymptomReaction, Technique } from '../domain/model';

export type SyncState = 'local' | 'queued' | 'synced' | 'conflict' | 'failed';

export type LocalProfile = {
  userId: string;
  plannedSessionsPerWeek: number;
  minutesPerSession: number;
  experience: Experience;
  goals: Partial<Record<ExerciseId, number>>;
  equipment: EquipmentSlug[];
  substitutions: Partial<Record<ExerciseId, ExerciseId>>;
  favorites: ExerciseId[];
  bodyweightGrams: number | null;
  adultConfirmed: boolean;
  ageYears: number | null;
  timezone: string;
  revision: number;
  onboardingCompletedAt: string | null;
  privacyNoticeVersion: string | null;
  /** Aktiv maskinprofil per övning (CR §2.3); saknas ⇒ standard. */
  equipmentProfiles?: Partial<Record<ExerciseId, string>>;
  syncState: SyncState;
};

export type LocalExerciseSettings = {
  id: string;
  exerciseId: ExerciseId;
  variantKey: string;
  experience: Experience | null;
  incrementGrams: number | null;
  estimateGrams: number | null;
  estimateKind: '1rm' | '3rm' | 'submax' | null;
  estimateReps: number | null;
  estimateRir: number | null;
  estimateMeasured: boolean;
  estimateTestedAt: string | null;
  maxLoadGrams: number | null;
  machineMinGrams: number | null;
  machineMaxGrams: number | null;
  updatedAt: string;
  syncState: SyncState;
};

export type LocalRestriction = {
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
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
};

export type LocalSymptom = {
  id: string;
  sessionId: string | null;
  area: Area;
  side: Side | null;
  reaction: SymptomReaction;
  pain: number | null;
  reportedAt: string;
  resolvedAt: string | null;
  syncState: SyncState;
};

export type LocalConsent = { userId: string; consentVersion: string; grantedAt: string | null; withdrawnAt: string | null; revision: number; syncState: SyncState };

export type LocalProgram = {
  id: string;
  template: string;
  version: string;
  plannedSessionsPerWeek: number;
  rotationIndex: number;
  active: 0 | 1;
  createdAt: string;
  endedAt: string | null;
  revision: number;
  syncState: SyncState;
};

export type LocalSession = {
  id: string;
  programId: string | null;
  kind: SessionKind;
  status: SessionStatus;
  timezone: string;
  startedAt: string | null;
  finishedAt: string | null;
  plannedMinutes: number;
  readiness: Readiness | null;
  templateKey: string | null;
  rotationIndex: number | null;
  countsAsPlannedAt: string | null;
  isReplacementForPlanned: boolean;
  clientCreatedAt: string;
  snapshot: PlanSnapshot;
  revision: number;
  syncState: SyncState;
};

export type LocalSessionExercise = {
  id: string;
  sessionId: string;
  exerciseId: ExerciseId;
  variantKey: string;
  orderIndex: number;
  mode: Mode;
  bandMin: number;
  bandMax: number;
  targetSets: number;
  snapshot: PlannedExercise;
  /** Ersatt av användaren under passet (S09); tidigare logg påverkas inte. */
  replacedById: string | null;
  /** Den planerade övning som denna ersatte (CR §2.1, original bevaras). */
  replacesId?: string | null;
  createdAt: string;
  syncState: SyncState;
};

export type LocalSet = {
  id: string;
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: ExerciseId;
  ordinal: number;
  kind: SetKind;
  status: SetStatus;
  targetGrams: number | null;
  targetReps: number | null;
  targetSeconds: number | null;
  actualGrams: number | null;
  actualReps: number | null;
  actualSeconds: number | null;
  rir: number | null;
  technique: Technique | null;
  occurredAt: string | null;
  deleted: boolean;
  /** Senast kvitterad serverrevision; null = ännu inte på servern. */
  serverRevision: number | null;
  /** En skapande-händelse har köats (efterföljande ändringar är uppdateringar). */
  createQueued: boolean;
  /** Manuell avvikelse från rekommendation (02 §1 p4) – loggas separat. */
  manualOverride: boolean;
  /** Frivilligt enkelt svar vid kalibrering: lätt / lagom / för tungt. */
  perceivedEffort?: PerceivedEffort | null;
  syncState: SyncState;
  updatedAt: string;
};

/** `user_exercise_calibrations` (CR §4.2): vana och kalibreringsnivå per övning och maskinprofil. */
export type LocalCalibration = {
  id: string;
  exerciseId: ExerciseId;
  variantKey: string;
  familiarity: Familiarity;
  quality: 'none' | 'calibrating' | 'calibrated';
  /** Referenser till utförda set (id), inte kopior av data. */
  observations: string[];
  calibratedAt: string | null;
  updatedAt: string;
  syncState: SyncState;
};

/** `session_exercise_substitution_events` (CR §4.2–4.3): append-only revisionspost per byte. */
export type LocalSubstitutionEvent = {
  id: string;
  sessionId: string;
  originalExerciseId: ExerciseId;
  replacementExerciseId: ExerciseId;
  originalSessionExerciseId: string | null;
  replacementSessionExerciseId: string | null;
  choiceScope: ChoiceScope;
  engineVersion: string;
  substitutionCatalogVersion: string;
  algorithmRuleVersion: string;
  sourceEvidenceIds: string[];
  loadEstimationKind: LoadEstimationKind;
  reasonCodes: string[];
  userOverride: boolean;
  createdAt: string;
  syncState: SyncState;
};

/** ÄA-PLAN-001: oföränderlig utgåva av den framtida plansekvensen (strukturell, inga framtidsvikter). */
export type LocalPlanRevision = {
  id: string;
  programId: string | null;
  previousRevisionId: string | null;
  baseSequence: number;
  horizon: number;
  changeType: string;
  reasonCodes: string[];
  summary: string;
  inputsHash: string;
  inputParts: Record<string, string>;
  contentHash: string;
  engineVersion: string;
  plannerVersion: string;
  rulesetVersion: string;
  catalogVersion: string;
  substitutionCatalogVersion: string;
  slots: unknown[];
  createdAt: string;
  syncState: SyncState;
};

/** ÄA-PLAN-001: privat anteckning på en planplats (löpande passnummer) eller ett genomfört pass. */
export type LocalNote = {
  id: string;
  targetType: 'slot' | 'session';
  slotSequence: number | null;
  sessionId: string | null;
  body: string;
  /** Senast kända serverrevision (0 = ännu inte på servern). */
  revision: number;
  updatedAt: string;
  syncState: SyncState;
};

export type LocalAudit = { id: string; sessionId: string; engineVersion: string; inputsHash: string; reasonCodes: string[]; snapshot: PlanSnapshot; generatedAt: string; syncState: SyncState };

export type OutboxOp =
  | { type: 'set'; setId: string; create: boolean; payload: Record<string, unknown>; baseRevision?: number | null }
  | { type: 'upsert'; table: ServerTable; row: Record<string, unknown>; immutable?: boolean }
  | { type: 'delete'; table: ServerTable; id: string; idColumn?: string }
  | { type: 'profile'; patch: Record<string, unknown>; baseRevision?: number }
  | { type: 'equipment'; equipment: EquipmentSlug[] }
  | { type: 'rpc'; name: 'erase_health_data' }
  | { type: 'note'; noteId: string; row: Record<string, unknown>; baseRevision?: number };

export type ServerTable = 'profiles' | 'user_exercise_profiles' | 'health_consents' | 'restriction_rules' | 'programs' | 'training_sessions' | 'session_exercises' | 'symptom_reports' | 'recommendation_audits' | 'user_exercise_calibrations' | 'session_exercise_substitution_events' | 'plan_revisions' | 'notebook_notes';

export type OutboxEntry = {
  seq?: number;
  eventId: string;
  recordId: string;
  op: OutboxOp;
  createdAt: string;
  attempts: number;
  status: 'pending' | 'conflict' | 'rejected';
  lastError: string | null;
};

export type ConflictEntry = {
  id: string;
  recordType: 'training_set' | 'profile' | 'note';
  recordId: string;
  local: Record<string, unknown>;
  server: Record<string, unknown>;
  serverRevision: number;
  eventId: string;
  detectedAt: string;
};

export type MetaEntry = { key: string; value: unknown };

export class StyrkaDB extends Dexie {
  meta!: Table<MetaEntry, string>;
  profile!: Table<LocalProfile, string>;
  exerciseSettings!: Table<LocalExerciseSettings, string>;
  restrictions!: Table<LocalRestriction, string>;
  symptoms!: Table<LocalSymptom, string>;
  consents!: Table<LocalConsent, string>;
  programs!: Table<LocalProgram, string>;
  sessions!: Table<LocalSession, string>;
  sessionExercises!: Table<LocalSessionExercise, string>;
  sets!: Table<LocalSet, string>;
  audits!: Table<LocalAudit, string>;
  outbox!: Table<OutboxEntry, number>;
  conflicts!: Table<ConflictEntry, string>;
  calibrations!: Table<LocalCalibration, string>;
  substitutionEvents!: Table<LocalSubstitutionEvent, string>;
  planRevisions!: Table<LocalPlanRevision, string>;
  notes!: Table<LocalNote, string>;

  constructor(name: string) {
    super(name);
    // Schemaversion 1. Framtida ändringar läggs till som version(2).upgrade(...) så att data bevaras vid PWA-uppdatering (03 §5.2).
    this.version(1).stores({
      meta: 'key',
      profile: 'userId',
      exerciseSettings: 'id, &exerciseId',
      restrictions: 'id, kind, active',
      symptoms: 'id, area, reportedAt',
      consents: 'userId',
      programs: 'id, active',
      sessions: 'id, status, kind, startedAt, finishedAt',
      sessionExercises: 'id, sessionId, exerciseId',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, syncState',
      audits: 'id, sessionId',
      outbox: '++seq, &eventId, recordId, status',
      conflicts: 'id, recordId',
    });
    // Version 2 (CR 2026-10-10-01): additiva tabeller; befintliga data och index bevaras oförändrade.
    this.version(2).stores({
      calibrations: 'id, exerciseId',
      substitutionEvents: 'id, sessionId',
    });
    // Version 3 (ÄA-PLAN-001): planrevisioner och anteckningar; befintliga data bevaras oförändrade.
    this.version(3).stores({
      planRevisions: 'id, createdAt',
      notes: 'id, targetType, slotSequence, sessionId',
    });
  }
}

export function dbNameFor(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('INVALID_USER_ID');
  return `styrka_${userId}`;
}

export function openUserDb(userId: string): StyrkaDB {
  return new StyrkaDB(dbNameFor(userId));
}

/** Tömmer användarens lokala data helt (utloggning/kontobyte/kontoradering). */
export async function destroyUserDb(userId: string): Promise<void> {
  await Dexie.delete(dbNameFor(userId));
}

export class LocalSaveError extends Error {
  readonly code = 'LOCAL_SAVE_FAILED' as const;
  constructor(cause: unknown) {
    super('LOCAL_SAVE_FAILED', { cause });
  }
}
