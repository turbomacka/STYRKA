/** Översättning mellan lokala poster (gram, camelCase) och serverrader (numeric-sträng, snake_case). */
import type { Experience, Mode } from '../domain/decision_engine';
import type { LocalSkipEvent } from '../storage/db';
import type { ExerciseId } from '../domain/catalog';
import { exercise, type Area, type EquipmentSlug } from '../domain/catalog';
import type { ChoiceScope, Familiarity, LoadEstimationKind, PerceivedEffort, PlanSnapshot, PlannedExercise, Readiness, RuleKind, SessionKind, SessionStatus, SetKind, SetStatus, Side, SymptomReaction, Technique } from '../domain/model';
import { decimalStringToGrams, gramsToDecimalString } from '../domain/units';
import type { LocalAudit, LocalBalanceDecision, LocalCalibration, LocalConsent, LocalExerciseSettings, LocalNote, LocalPlanRevision, LocalProfile, LocalProgram, LocalRestriction, LocalSession, LocalSessionExercise, LocalSet, LocalSubstitutionEvent, LocalSymptom } from '../storage/db';

const dec = (g: number | null): string | null => (g === null ? null : gramsToDecimalString(g));

export function skipEventRow(userId: string, e: LocalSkipEvent): Record<string, unknown> {
  return { id: e.id, user_id: userId, session_id: e.sessionId, session_exercise_id: e.sessionExerciseId, reason: e.reason, action: e.action, program_id: e.programId, target_rotation_index: e.targetRotationIndex, replaces_exercise_slug: e.replacesExerciseId, created_at: e.createdAt };
}
export function skipEventFromRow(r: Record<string, unknown>): LocalSkipEvent {
  return { id: r.id as string, sessionId: r.session_id as string, sessionExerciseId: r.session_exercise_id as string, reason: r.reason as LocalSkipEvent['reason'], action: r.action as LocalSkipEvent['action'], programId: r.program_id as string | null, targetRotationIndex: r.target_rotation_index as number | null, replacesExerciseId: r.replaces_exercise_slug as ExerciseId | null, createdAt: r.created_at as string, syncState: 'synced' };
}
const grams = (v: unknown): number | null => (v === null || v === undefined ? null : decimalStringToGrams(String(v)));

export function profileRow(p: LocalProfile): Record<string, unknown> {
  return {
    ...(p.trainingPreferences ? { training_preferences: p.trainingPreferences } : {}),
    planned_sessions_per_week: p.plannedSessionsPerWeek,
    minutes_per_session: p.minutesPerSession,
    experience: p.experience,
    age_years: p.ageYears,
    adult_confirmed: p.adultConfirmed,
    timezone: p.timezone,
    goals: p.goals,
    substitutions: p.substitutions,
    favorites: p.favorites,
    bodyweight_kg: dec(p.bodyweightGrams),
    privacy_notice_version: p.privacyNoticeVersion,
    equipment_profiles: p.equipmentProfiles ?? {},
    onboarding_completed_at: p.onboardingCompletedAt,
  };
}

export function profileFromRow(r: Record<string, unknown>, equipment: string[]): LocalProfile {
  return {
    ...(r.training_preferences ? { trainingPreferences: r.training_preferences as LocalProfile['trainingPreferences'] } : {}),
    userId: r.user_id as string,
    plannedSessionsPerWeek: r.planned_sessions_per_week as number,
    minutesPerSession: r.minutes_per_session as number,
    experience: r.experience as Experience,
    goals: (r.goals ?? {}) as LocalProfile['goals'],
    equipment: equipment as EquipmentSlug[],
    substitutions: (r.substitutions ?? {}) as LocalProfile['substitutions'],
    favorites: (r.favorites ?? []) as ExerciseId[],
    bodyweightGrams: grams(r.bodyweight_kg),
    adultConfirmed: r.adult_confirmed as boolean,
    ageYears: (r.age_years as number | null) ?? null,
    timezone: (r.timezone as string) ?? 'Europe/Stockholm',
    revision: r.revision as number,
    onboardingCompletedAt: (r.onboarding_completed_at as string | null) ?? null,
    privacyNoticeVersion: (r.privacy_notice_version as string | null) ?? null,
    equipmentProfiles: (r.equipment_profiles ?? {}) as LocalProfile['equipmentProfiles'],
    syncState: 'synced',
  };
}

export function exerciseSettingsRow(userId: string, s: LocalExerciseSettings): Record<string, unknown> {
  return {
    id: s.id,
    user_id: userId,
    exercise_slug: s.exerciseId,
    variant_key: s.variantKey,
    experience: s.experience ?? 'novice',
    experience_override: s.experience !== null,
    // Utan eget steg lagras katalogens standardsteg (samma effektiva värde som motorn använder).
    increment_kg: dec(s.incrementGrams) ?? dec(Math.round(exercise(s.exerciseId).defaultIncrementKg * 1000)),
    estimate_kg: dec(s.estimateGrams),
    estimate_kind: s.estimateKind,
    estimate_reps: s.estimateReps,
    estimate_rir: s.estimateRir,
    estimate_measured: s.estimateMeasured,
    estimate_tested_at: s.estimateTestedAt,
    ...(s.strengthInputs !== undefined ? { strength_inputs: s.strengthInputs } : {}),
    estimate_confidence: s.estimateKind === null ? 'unknown' : s.estimateKind === 'submax' ? 'low' : s.estimateKind === '1rm' && s.estimateMeasured ? 'high' : 'medium',
    max_load_kg: dec(s.maxLoadGrams),
    machine_min_kg: dec(s.machineMinGrams),
    machine_max_kg: dec(s.machineMaxGrams),
    updated_at: s.updatedAt,
  };
}

export function exerciseSettingsFromRow(r: Record<string, unknown>): LocalExerciseSettings {
  return {
    id: r.id as string,
    exerciseId: r.exercise_slug as ExerciseId,
    variantKey: (r.variant_key as string) ?? 'default',
    experience: r.experience_override ? (r.experience as Experience) : null,
    incrementGrams: grams(r.increment_kg),
    estimateGrams: grams(r.estimate_kg),
    estimateKind: (r.estimate_kind as LocalExerciseSettings['estimateKind']) ?? null,
    estimateReps: (r.estimate_reps as number | null) ?? null,
    estimateRir: (r.estimate_rir as number | null) ?? null,
    estimateMeasured: !!r.estimate_measured,
    estimateTestedAt: (r.estimate_tested_at as string | null) ?? null,
    ...(Array.isArray(r.strength_inputs) ? { strengthInputs: r.strength_inputs as LocalExerciseSettings['strengthInputs'] } : {}),
    maxLoadGrams: grams(r.max_load_kg),
    machineMinGrams: grams(r.machine_min_kg),
    machineMaxGrams: grams(r.machine_max_kg),
    updatedAt: r.updated_at as string,
    syncState: 'synced',
  };
}

export function restrictionRow(userId: string, r: LocalRestriction): Record<string, unknown> {
  return { id: r.id, user_id: userId, rule_kind: r.kind, exercise_a: r.exerciseA, exercise_b: r.exerciseB, affected_area: r.area, side: r.side, max_sets: r.maxSets, max_mode: r.maxMode, active: r.active, description: r.description, created_at: r.createdAt, updated_at: r.updatedAt };
}

export function restrictionFromRow(r: Record<string, unknown>): LocalRestriction {
  return {
    id: r.id as string,
    kind: r.rule_kind as RuleKind,
    exerciseA: (r.exercise_a as ExerciseId | null) ?? null,
    exerciseB: (r.exercise_b as ExerciseId | null) ?? null,
    area: (r.affected_area as Area | null) ?? null,
    side: (r.side as Side | null) ?? null,
    maxSets: (r.max_sets as number | null) ?? null,
    maxMode: (r.max_mode as Mode | null) ?? null,
    active: r.active as boolean,
    description: (r.description as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    syncState: 'synced',
  };
}

export function symptomRow(userId: string, s: LocalSymptom): Record<string, unknown> {
  return { id: s.id, user_id: userId, session_id: s.sessionId, area: s.area, side: s.side, reaction: s.reaction, pain: s.pain, reported_at: s.reportedAt, resolved_at: s.resolvedAt };
}

export function symptomFromRow(r: Record<string, unknown>): LocalSymptom {
  return { id: r.id as string, sessionId: (r.session_id as string | null) ?? null, area: r.area as Area, side: (r.side as Side | null) ?? null, reaction: r.reaction as SymptomReaction, pain: (r.pain as number | null) ?? null, reportedAt: r.reported_at as string, resolvedAt: (r.resolved_at as string | null) ?? null, syncState: 'synced' };
}

export function consentRow(userId: string, c: LocalConsent): Record<string, unknown> {
  return { user_id: userId, consent_version: c.consentVersion, granted_at: c.grantedAt, withdrawn_at: c.withdrawnAt, revision: c.revision };
}

export function consentFromRow(r: Record<string, unknown>): LocalConsent {
  return { userId: r.user_id as string, consentVersion: r.consent_version as string, grantedAt: (r.granted_at as string | null) ?? null, withdrawnAt: (r.withdrawn_at as string | null) ?? null, revision: r.revision as number, syncState: 'synced' };
}

export function programRow(userId: string, p: LocalProgram): Record<string, unknown> {
  return { id: p.id, user_id: userId, template: p.template, version: p.version, rotation_index: p.rotationIndex, active: p.active === 1, created_at: p.createdAt, planned_sessions_per_week: p.plannedSessionsPerWeek, revision: p.revision, ended_at: p.endedAt };
}

export function programFromRow(r: Record<string, unknown>): LocalProgram {
  return { id: r.id as string, template: r.template as string, version: r.version as string, plannedSessionsPerWeek: (r.planned_sessions_per_week as number) ?? 2, rotationIndex: r.rotation_index as number, active: r.active ? 1 : 0, createdAt: r.created_at as string, endedAt: (r.ended_at as string | null) ?? null, revision: (r.revision as number) ?? 1, syncState: 'synced' };
}

export function sessionRow(userId: string, s: LocalSession): Record<string, unknown> {
  return {
    id: s.id,
    user_id: userId,
    program_id: s.programId,
    kind: s.kind,
    status: s.status,
    local_timezone: s.timezone,
    started_at: s.startedAt,
    finished_at: s.finishedAt,
    planned_minutes: s.plannedMinutes,
    perceived_readiness: s.readiness,
    is_replacement_for_planned: s.isReplacementForPlanned,
    template_key: s.templateKey,
    rotation_index: s.rotationIndex,
    counts_as_planned_at: s.countsAsPlannedAt,
    client_created_at: s.clientCreatedAt,
    revision: s.revision,
    updated_at: s.finishedAt ?? s.startedAt ?? s.clientCreatedAt,
  };
}

export function sessionFromRow(r: Record<string, unknown>, snapshot: PlanSnapshot): LocalSession {
  return {
    id: r.id as string,
    programId: (r.program_id as string | null) ?? null,
    kind: r.kind as SessionKind,
    status: r.status as SessionStatus,
    timezone: (r.local_timezone as string) ?? 'Europe/Stockholm',
    startedAt: (r.started_at as string | null) ?? null,
    finishedAt: (r.finished_at as string | null) ?? null,
    plannedMinutes: (r.planned_minutes as number) ?? snapshot.budgetMinutes,
    readiness: (r.perceived_readiness as Readiness | null) ?? null,
    templateKey: (r.template_key as string | null) ?? null,
    rotationIndex: (r.rotation_index as number | null) ?? null,
    countsAsPlannedAt: (r.counts_as_planned_at as string | null) ?? null,
    isReplacementForPlanned: !!r.is_replacement_for_planned,
    clientCreatedAt: (r.client_created_at as string) ?? (r.created_at as string),
    snapshot,
    revision: (r.revision as number) ?? 1,
    syncState: 'synced',
  };
}

export function sessionExerciseRow(userId: string, e: LocalSessionExercise): Record<string, unknown> {
  return {
    ...(e.configuration ? { configuration: e.configuration } : {}),
    id: e.id,
    user_id: userId,
    session_id: e.sessionId,
    exercise_slug: e.exerciseId,
    variant_key: e.variantKey,
    order_index: e.orderIndex,
    mode: e.mode,
    band_min: e.bandMin,
    band_max: e.bandMax,
    target_sets: e.targetSets,
    recommendation_snapshot: { ...e.snapshot, replacedById: undefined },
    load_basis: e.snapshot.loadBasis ?? null,
    created_at: e.createdAt,
  };
}

export function sessionExerciseFromRow(r: Record<string, unknown>, replacedById: string | null): LocalSessionExercise {
  return {
    configuration: (r.configuration ?? undefined) as LocalSessionExercise['configuration'],
    id: r.id as string,
    sessionId: r.session_id as string,
    exerciseId: r.exercise_slug as ExerciseId,
    variantKey: (r.variant_key as string) ?? 'default',
    orderIndex: r.order_index as number,
    mode: r.mode as Mode,
    bandMin: r.band_min as number,
    bandMax: r.band_max as number,
    targetSets: r.target_sets as number,
    snapshot: r.recommendation_snapshot as PlannedExercise,
    replacedById,
    replacesId: (r.recommendation_snapshot as PlannedExercise)?.substitution?.replacesSessionExerciseId ?? null,
    createdAt: r.created_at as string,
    syncState: 'synced',
  };
}

// ---- ÄA-BAL-001 ----
export function balanceDecisionRow(userId: string, d: LocalBalanceDecision): Record<string, unknown> {
  return { id: d.id, user_id: userId, candidate_key: d.candidateKey, basis_key: d.basisKey, pattern_id: d.patternId, status: d.status, policy_version: d.policyVersion, event_id: d.eventId, updated_at: d.updatedAt };
}

export function balanceDecisionFromRow(r: Record<string, unknown>): LocalBalanceDecision {
  return { id: r.id as string, candidateKey: r.candidate_key as string, basisKey: r.basis_key as string, patternId: r.pattern_id as string, status: r.status as LocalBalanceDecision['status'], policyVersion: r.policy_version as string, eventId: r.event_id as string, updatedAt: new Date(r.updated_at as string).toISOString(), syncState: 'synced' };
}

// ---- ÄA-PLAN-001 ----
export function planRevisionRow(userId: string, r: LocalPlanRevision): Record<string, unknown> {
  return {
    id: r.id,
    user_id: userId,
    program_id: r.programId,
    previous_revision_id: r.previousRevisionId,
    base_sequence: r.baseSequence,
    horizon: r.horizon,
    change_type: r.changeType,
    reason_codes: r.reasonCodes,
    summary: r.summary,
    inputs_hash: r.inputsHash,
    input_parts: r.inputParts,
    content_hash: r.contentHash,
    engine_version: r.engineVersion,
    planner_version: r.plannerVersion,
    ruleset_version: r.rulesetVersion,
    catalog_version: r.catalogVersion,
    substitution_catalog_version: r.substitutionCatalogVersion,
    slots: r.slots,
    created_at: r.createdAt,
  };
}

export function planRevisionFromRow(r: Record<string, unknown>): LocalPlanRevision {
  return {
    id: r.id as string,
    programId: (r.program_id as string | null) ?? null,
    previousRevisionId: (r.previous_revision_id as string | null) ?? null,
    baseSequence: r.base_sequence as number,
    horizon: r.horizon as number,
    changeType: r.change_type as string,
    reasonCodes: (r.reason_codes as string[]) ?? [],
    summary: (r.summary as string) ?? '',
    inputsHash: r.inputs_hash as string,
    inputParts: (r.input_parts as Record<string, string>) ?? {},
    contentHash: r.content_hash as string,
    engineVersion: r.engine_version as string,
    plannerVersion: r.planner_version as string,
    rulesetVersion: r.ruleset_version as string,
    catalogVersion: r.catalog_version as string,
    substitutionCatalogVersion: r.substitution_catalog_version as string,
    slots: (r.slots as unknown[]) ?? [],
    createdAt: new Date(r.created_at as string).toISOString(),
    syncState: 'synced',
  };
}

export function noteRow(userId: string, n: LocalNote): Record<string, unknown> {
  return { id: n.id, user_id: userId, target_type: n.targetType, slot_sequence: n.slotSequence, session_id: n.sessionId, body: n.body, updated_at: n.updatedAt };
}

export function noteFromRow(r: Record<string, unknown>): LocalNote {
  return {
    id: r.id as string,
    targetType: r.target_type as 'slot' | 'session',
    slotSequence: (r.slot_sequence as number | null) ?? null,
    sessionId: (r.session_id as string | null) ?? null,
    body: (r.body as string) ?? '',
    revision: (r.revision as number) ?? 1,
    updatedAt: new Date(r.updated_at as string).toISOString(),
    syncState: 'synced',
  };
}

/** Fullständig payload för skapande via apply_set_mutation. */
export function setCreatePayload(s: LocalSet): Record<string, unknown> {
  return {
    ...(s.detail ? { detail: s.detail } : {}),
    sessionExerciseId: s.sessionExerciseId,
    ordinal: s.ordinal,
    kind: s.kind,
    status: s.status,
    targetKg: dec(s.targetGrams),
    targetReps: s.targetReps,
    targetSeconds: s.targetSeconds,
    actualKg: dec(s.actualGrams),
    actualReps: s.actualReps,
    actualSeconds: s.actualSeconds,
    rir: s.rir,
    technique: s.technique,
    occurredAt: s.occurredAt,
    deleted: s.deleted,
    // Skickas bara när det finns (bakåtkompatibelt mot server utan migration 004).
    ...(s.perceivedEffort ? { perceivedEffort: s.perceivedEffort } : {}),
  };
}

const SET_FIELD_MAP: Array<[keyof LocalSet, string, (v: unknown) => unknown]> = [
  ['detail', 'detail', (v) => v ?? null],
  ['status', 'status', (v) => v],
  ['targetGrams', 'targetKg', (v) => dec(v as number | null)],
  ['targetReps', 'targetReps', (v) => v],
  ['targetSeconds', 'targetSeconds', (v) => v],
  ['actualGrams', 'actualKg', (v) => dec(v as number | null)],
  ['actualReps', 'actualReps', (v) => v],
  ['actualSeconds', 'actualSeconds', (v) => v],
  ['rir', 'rir', (v) => v],
  ['technique', 'technique', (v) => v],
  ['occurredAt', 'occurredAt', (v) => v],
  ['deleted', 'deleted', (v) => v],
  ['ordinal', 'ordinal', (v) => v],
  ['kind', 'kind', (v) => v],
  ['perceivedEffort', 'perceivedEffort', (v) => v ?? null],
];

/** Ändrade fält (changedFields) mellan två versioner av ett lokalt set. */
export function setPatchPayload(before: LocalSet, after: LocalSet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // null och odefinierat räknas lika (nya valfria fält skickas inte i onödan).
  for (const [k, wire, conv] of SET_FIELD_MAP) if ((before[k] ?? null) !== (after[k] ?? null)) out[wire] = conv(after[k]);
  return out;
}

/** Hela den användarredigerbara delen av setet som patch (för "behåll min version" vid konflikt). */
export function setFullPatch(s: LocalSet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, wire, conv] of SET_FIELD_MAP) out[wire] = conv(s[k]);
  return out;
}

export function setFromRow(r: Record<string, unknown>, se: { sessionId: string; exerciseId: ExerciseId }): LocalSet {
  return {
    ...(r.detail ? { detail: r.detail as LocalSet['detail'] } : {}),
    id: r.id as string,
    sessionId: se.sessionId,
    sessionExerciseId: r.session_exercise_id as string,
    exerciseId: se.exerciseId,
    ordinal: r.ordinal as number,
    kind: r.kind as SetKind,
    status: r.status as SetStatus,
    targetGrams: grams(r.target_kg),
    targetReps: (r.target_reps as number | null) ?? null,
    targetSeconds: (r.target_seconds as number | null) ?? null,
    actualGrams: grams(r.actual_kg),
    actualReps: (r.actual_reps as number | null) ?? null,
    actualSeconds: (r.actual_seconds as number | null) ?? null,
    rir: (r.rir as number | null) ?? null,
    technique: (r.technique as Technique | null) ?? null,
    occurredAt: (r.occurred_at as string | null) ?? null,
    deleted: r.deleted_at !== null && r.deleted_at !== undefined,
    serverRevision: r.revision as number,
    createQueued: true,
    manualOverride: false,
    perceivedEffort: (r.perceived_effort as PerceivedEffort | null) ?? null,
    syncState: 'synced',
    updatedAt: (r.server_received_at as string) ?? '',
  };
}

/** Applicera konfliktvyns servervärden (wire-format) på ett lokalt set. */
export function applyServerSetValues(s: LocalSet, server: Record<string, unknown>, revision: number): LocalSet {
  return {
    ...s,
    detail: (server.detail as LocalSet['detail']) ?? undefined,
    status: (server.status as SetStatus) ?? s.status,
    actualGrams: grams(server.actualKg),
    actualReps: (server.actualReps as number | null) ?? null,
    actualSeconds: (server.actualSeconds as number | null) ?? null,
    rir: (server.rir as number | null) ?? null,
    technique: (server.technique as Technique | null) ?? null,
    perceivedEffort: server.perceivedEffort !== undefined ? server.perceivedEffort as PerceivedEffort | null : s.perceivedEffort ?? null,
    occurredAt: (server.occurredAt as string | null) ?? null,
    deleted: !!server.deleted,
    targetGrams: server.targetKg !== undefined ? grams(server.targetKg) : s.targetGrams,
    targetReps: server.targetReps !== undefined ? ((server.targetReps as number | null) ?? null) : s.targetReps,
    serverRevision: revision,
    syncState: 'synced',
  };
}

export function auditRow(userId: string, a: LocalAudit): Record<string, unknown> {
  return { id: a.id, user_id: userId, session_id: a.sessionId, engine_version: a.engineVersion, inputs_hash: a.inputsHash, reason_codes: a.reasonCodes, plan_snapshot: a.snapshot, generated_at: a.generatedAt };
}

export function auditFromRow(r: Record<string, unknown>): LocalAudit {
  return { id: r.id as string, sessionId: r.session_id as string, engineVersion: r.engine_version as string, inputsHash: r.inputs_hash as string, reasonCodes: (r.reason_codes as string[]) ?? [], snapshot: r.plan_snapshot as PlanSnapshot, generatedAt: r.generated_at as string, syncState: 'synced' };
}

export function calibrationRow(userId: string, k: LocalCalibration): Record<string, unknown> {
  return { id: k.id, user_id: userId, exercise_slug: k.exerciseId, variant_key: k.variantKey, familiarity: k.familiarity, quality: k.quality, observations: k.observations, calibrated_at: k.calibratedAt, updated_at: k.updatedAt };
}

export function calibrationFromRow(r: Record<string, unknown>): LocalCalibration {
  return {
    id: r.id as string,
    exerciseId: r.exercise_slug as ExerciseId,
    variantKey: (r.variant_key as string) ?? 'default',
    familiarity: (r.familiarity as Familiarity) ?? 'unknown',
    quality: (r.quality as LocalCalibration['quality']) ?? 'none',
    observations: (r.observations as string[]) ?? [],
    calibratedAt: (r.calibrated_at as string | null) ?? null,
    updatedAt: r.updated_at as string,
    syncState: 'synced',
  };
}

export function substitutionEventRow(userId: string, e: LocalSubstitutionEvent): Record<string, unknown> {
  return {
    id: e.id,
    event_id: e.id,
    user_id: userId,
    session_id: e.sessionId,
    original_exercise_slug: e.originalExerciseId,
    replacement_exercise_slug: e.replacementExerciseId,
    original_session_exercise_id: e.originalSessionExerciseId,
    replacement_session_exercise_id: e.replacementSessionExerciseId,
    choice_scope: e.choiceScope,
    engine_version: e.engineVersion,
    substitution_catalog_version: e.substitutionCatalogVersion,
    algorithm_rule_version: e.algorithmRuleVersion,
    source_evidence_ids: e.sourceEvidenceIds,
    load_estimation_kind: e.loadEstimationKind,
    reason_codes: e.reasonCodes,
    user_override: e.userOverride,
    created_at: e.createdAt,
  };
}

export function substitutionEventFromRow(r: Record<string, unknown>): LocalSubstitutionEvent {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    originalExerciseId: r.original_exercise_slug as ExerciseId,
    replacementExerciseId: r.replacement_exercise_slug as ExerciseId,
    originalSessionExerciseId: (r.original_session_exercise_id as string | null) ?? null,
    replacementSessionExerciseId: (r.replacement_session_exercise_id as string | null) ?? null,
    choiceScope: r.choice_scope as ChoiceScope,
    engineVersion: r.engine_version as string,
    substitutionCatalogVersion: r.substitution_catalog_version as string,
    algorithmRuleVersion: r.algorithm_rule_version as string,
    sourceEvidenceIds: (r.source_evidence_ids as string[]) ?? [],
    loadEstimationKind: r.load_estimation_kind as LoadEstimationKind,
    reasonCodes: (r.reason_codes as string[]) ?? [],
    userOverride: !!r.user_override,
    createdAt: r.created_at as string,
    syncState: 'synced',
  };
}

export function workoutOrderEventRow(userId: string, e: import('../storage/db').LocalWorkoutOrderEvent): Record<string, unknown> {
  return { id:e.id,user_id:userId,session_id:e.sessionId,session_exercise_id:e.sessionExerciseId,before_id:e.beforeId,created_at:e.createdAt };
}
export function workoutOrderEventFromRow(r: Record<string, unknown>): import('../storage/db').LocalWorkoutOrderEvent {
  return { id:r.id as string,sessionId:r.session_id as string,sessionExerciseId:r.session_exercise_id as string,beforeId:r.before_id as string|null,createdAt:r.created_at as string,syncState:'synced' };
}
