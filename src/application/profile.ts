/** ProfileService, ExerciseService-inställningar, begränsningar och samtycke (01 §2, S02–S05, S13–S14). */
import type { Experience, Mode } from '../domain/decision_engine';
import type { ExerciseId } from '../domain/catalog';
import { ALL_EQUIPMENT, isExerciseId, type Area, type EquipmentSlug } from '../domain/catalog';
import type { RuleKind, Side } from '../domain/model';
import { TEMPLATE_VERSION, TEMPLATES } from '../planner/planner';
import { resolveStrengthInputs, validStrengthInput, type StrengthInput } from '../domain/strengthInputs';
import { defaultConfiguration, trainingPreferences, validateConfiguration, type TrainingPreferences } from '../domain/trainingFlow';
import type { LocalConsent, LocalExerciseSettings, LocalProfile, LocalProgram, LocalRestriction } from '../storage/db';
import { consentRow, exerciseSettingsRow, profileRow, programRow, restrictionRow } from '../server/mapping';
import { AppError, outbox, type AppContext } from './context';

export const HEALTH_CONSENT_VERSION = 'HC-2026-10-v1';
export const PRIVACY_NOTICE_VERSION = 'PN-2026-10-v1-UTKAST';

export const DEFAULT_PROFILE = { plannedSessionsPerWeek: 2, minutesPerSession: 40, experience: 'novice' as Experience };
/** "Standardgym" (S03 default). */
export const GYM_STANDARD: EquipmentSlug[] = ['rack', 'barbell', 'plates', 'bench', 'cable', 'pullup-assist', 'dumbbell', 'machines', 'bodyweight'];

export function validateProfileFields(p: { plannedSessionsPerWeek?: number; minutesPerSession?: number; experience?: string; ageYears?: number | null; bodyweightGrams?: number | null; goals?: Record<string, number> }): void {
  if (p.plannedSessionsPerWeek !== undefined && (!Number.isInteger(p.plannedSessionsPerWeek) || p.plannedSessionsPerWeek < 1 || p.plannedSessionsPerWeek > 7)) throw new AppError('VALIDATION_ERROR', 'plannedSessionsPerWeek');
  if (p.minutesPerSession !== undefined && (!Number.isInteger(p.minutesPerSession) || p.minutesPerSession < 15 || p.minutesPerSession > 120 || p.minutesPerSession % 5 !== 0)) throw new AppError('VALIDATION_ERROR', 'minutesPerSession');
  if (p.experience !== undefined && !['novice', 'intermediate', 'experienced'].includes(p.experience)) throw new AppError('VALIDATION_ERROR', 'experience');
  if (p.ageYears !== undefined && p.ageYears !== null && (!Number.isInteger(p.ageYears) || p.ageYears < 18 || p.ageYears > 120)) throw new AppError('VALIDATION_ERROR', 'ageYears');
  if (p.bodyweightGrams !== undefined && p.bodyweightGrams !== null && (p.bodyweightGrams <= 0 || p.bodyweightGrams > 400_000)) throw new AppError('VALIDATION_ERROR', 'bodyweightKg');
  if (p.goals) for (const [k, v] of Object.entries(p.goals)) if (!isExerciseId(k) || !Number.isInteger(v) || v < 0 || v > 3) throw new AppError('VALIDATION_ERROR', 'goals');
}

async function txAll<T>(ctx: AppContext, fn: () => Promise<T>): Promise<T> {
  const { db } = ctx;
  const r = await db.transaction('rw', [db.profile, db.programs, db.exerciseSettings, db.restrictions, db.consents, db.outbox, db.symptoms, db.meta], fn);
  ctx.onQueued?.();
  return r;
}

function newProgram(ctx: AppContext, freq: number): LocalProgram {
  return { id: ctx.ids.uuid(), template: `split_${freq}:${TEMPLATES.splits[String(freq)].join(',')}`, version: TEMPLATE_VERSION, plannedSessionsPerWeek: freq, rotationIndex: 0, active: 1, createdAt: ctx.clock.now(), endedAt: null, revision: 1, syncState: 'queued' };
}

export type EstimateInput = { exerciseId: ExerciseId; kind: '1rm' | '3rm' | 'submax'; grams: number; reps?: number | null; rir?: number | null; measured?: boolean; testedAt?: string | null };

export type OnboardingInput = {
  loadRecommendationSource?: TrainingPreferences['loadRecommendationSource'];
  adultConfirmed: boolean;
  ageYears?: number | null;
  plannedSessionsPerWeek: number;
  minutesPerSession: number;
  experience: Experience;
  equipment: EquipmentSlug[];
  goals: Partial<Record<ExerciseId, number>>;
  substitutions?: Partial<Record<ExerciseId, ExerciseId>>;
  estimates: EstimateInput[];
  strengthInputs?: Array<{ exerciseId: ExerciseId; inputs: StrengthInput[] }>;
  healthConsent: boolean;
  restrictions: Array<Omit<NewRestriction, 'active'> & { active?: boolean }>;
  timezone?: string;
};

/** S02–S05: skapar profil, program, uppskattningar, samtycke och frivilliga begränsningar i en transaktion. */
export async function completeOnboarding(ctx: AppContext, input: OnboardingInput): Promise<LocalProfile> {
  if (!input.adultConfirmed) throw new AppError('VALIDATION_ERROR', 'adultConfirmed');
  validateProfileFields(input);
  if (input.loadRecommendationSource !== undefined && !['performed_sets', 'strength_inputs'].includes(input.loadRecommendationSource)) throw new AppError('VALIDATION_ERROR', 'loadRecommendationSource');
  if (!input.equipment.length || input.equipment.some((e) => !ALL_EQUIPMENT.includes(e))) throw new AppError('VALIDATION_ERROR', 'equipment');
  if (!input.healthConsent && input.restrictions.some((r) => r.area)) throw new AppError('PRIVACY_CONSENT_REQUIRED');
  const now = ctx.clock.now();
  const existing = await ctx.db.profile.get(ctx.userId);
  const profile: LocalProfile = {
    userId: ctx.userId,
    ...(input.loadRecommendationSource ? { trainingPreferences: trainingPreferences({ loadRecommendationSource: input.loadRecommendationSource }) } : {}),
    plannedSessionsPerWeek: input.plannedSessionsPerWeek,
    minutesPerSession: input.minutesPerSession,
    experience: input.experience,
    goals: input.goals,
    equipment: [...new Set(input.equipment)],
    substitutions: input.substitutions ?? {},
    favorites: [],
    bodyweightGrams: null,
    adultConfirmed: true,
    ageYears: input.ageYears ?? null,
    timezone: input.timezone ?? 'Europe/Stockholm',
    revision: existing?.revision ?? 0,
    onboardingCompletedAt: now,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    syncState: 'queued',
  };
  await txAll(ctx, async () => {
    await ctx.db.profile.put(profile);
    await ctx.db.outbox.add(outbox(ctx, ctx.userId, { type: 'profile', patch: profileRow(profile) }));
    await ctx.db.outbox.add(outbox(ctx, `equipment:${ctx.userId}`, { type: 'equipment', equipment: profile.equipment }));
    const active = await ctx.db.programs.where('active').equals(1).first();
    if (!active) {
      const p = newProgram(ctx, input.plannedSessionsPerWeek);
      await ctx.db.programs.put(p);
      await ctx.db.outbox.add(outbox(ctx, p.id, { type: 'upsert', table: 'programs', row: programRow(ctx.userId, p) }));
    }
    const groups = new Map<ExerciseId, EstimateInput[]>();
    for (const e of input.estimates) groups.set(e.exerciseId, [...(groups.get(e.exerciseId) ?? []), e]);
    for (const [exerciseId, entries] of groups) {
      if (entries.length === 1) await putEstimate(ctx, entries[0]);
      else await putStrengthInputs(ctx, exerciseId, entries.map((e) => ({ kind: e.kind, grams: e.grams, reps: e.reps ?? null, rir: e.rir ?? null, measured: !!e.measured, testedAt: e.testedAt ?? null })));
    }
    for (const entry of input.strengthInputs ?? []) {
      if (groups.has(entry.exerciseId)) throw new AppError('VALIDATION_ERROR', 'duplicateStrengthInputs');
      await putStrengthInputs(ctx, entry.exerciseId, entry.inputs);
    }
    await putConsent(ctx, input.healthConsent);
    for (const r of input.restrictions) await putRestriction(ctx, { ...r, active: r.active ?? true });
    await ctx.db.meta.delete('onboarding-draft-v1');
  });
  return profile;
}

export type ProfileChanges = Partial<Pick<LocalProfile, 'plannedSessionsPerWeek' | 'minutesPerSession' | 'experience' | 'goals' | 'substitutions' | 'favorites' | 'bodyweightGrams' | 'ageYears' | 'timezone' | 'equipmentProfiles' | 'trainingPreferences'>> & { equipment?: EquipmentSlug[] };

/** Maskinprofil: kort etikett som användaren själv anger (t.ex. "gym-b"). */
export function validateVariantKey(key: string): void {
  if (!/^[\p{L}\p{N} ._-]{1,64}$/u.test(key)) throw new AppError('VALIDATION_ERROR', 'variantKey');
}

/**
 * S13: ändringar gäller endast prospektivt. Frekvensändring ⇒ ny programversion med ny sekvens från idag (08 §4).
 */
export async function patchProfile(ctx: AppContext, changes: ProfileChanges): Promise<LocalProfile> {
  validateProfileFields(changes);
  if (changes.trainingPreferences) {
    const p = changes.trainingPreferences;
    if (p.loadRecommendationSource !== undefined && !['performed_sets', 'strength_inputs'].includes(p.loadRecommendationSource)) throw new AppError('VALIDATION_ERROR', 'loadRecommendationSource');
    if (typeof p.showWarmupSets !== 'boolean' || typeof p.adaptiveRestEnabled !== 'boolean' || !['right','left'].includes(p.defaultStartingSide)
      || !Array.isArray(p.equipmentProfiles) || p.equipmentProfiles.length > 100
      || Object.entries(p.exerciseDefaults).some(([id,c]) => !isExerciseId(id) || !validateConfiguration(c!))
      || p.equipmentProfiles.some((e) => !validateConfiguration({ ...defaultConfiguration('cable_row'), equipment: e }))
      || Object.entries(p.preferredRestOverrides).some(([id,n]) => !isExerciseId(id) || !Number.isInteger(n) || n! < 30 || n! > 300)) throw new AppError('VALIDATION_ERROR','trainingPreferences');
  }
  if (changes.equipmentProfiles) for (const [k, v] of Object.entries(changes.equipmentProfiles)) if (!isExerciseId(k) || typeof v !== 'string') throw new AppError('VALIDATION_ERROR', 'equipmentProfiles');
  if (changes.equipmentProfiles) for (const v of Object.values(changes.equipmentProfiles)) validateVariantKey(v as string);
  if (changes.equipment && (!changes.equipment.length || changes.equipment.some((e) => !ALL_EQUIPMENT.includes(e)))) throw new AppError('VALIDATION_ERROR', 'equipment');
  let out!: LocalProfile;
  await txAll(ctx, async () => {
    const p = await ctx.db.profile.get(ctx.userId);
    if (!p) throw new AppError('NOT_FOUND');
    out = { ...p, ...changes, equipment: changes.equipment ? [...new Set(changes.equipment)] : p.equipment, syncState: 'queued' };
    await ctx.db.profile.put(out);
    await ctx.db.outbox.add(outbox(ctx, ctx.userId, { type: 'profile', patch: profileRow(out) }));
    if (changes.equipment) await ctx.db.outbox.add(outbox(ctx, `equipment:${ctx.userId}`, { type: 'equipment', equipment: out.equipment }));
    if (changes.plannedSessionsPerWeek !== undefined && changes.plannedSessionsPerWeek !== p.plannedSessionsPerWeek) {
      const now = ctx.clock.now();
      for (const old of await ctx.db.programs.where('active').equals(1).toArray()) {
        const ended = { ...old, active: 0 as const, endedAt: now, revision: old.revision + 1, syncState: 'queued' as const };
        await ctx.db.programs.put(ended);
        await ctx.db.outbox.add(outbox(ctx, old.id, { type: 'upsert', table: 'programs', row: programRow(ctx.userId, ended) }));
      }
      const np = newProgram(ctx, changes.plannedSessionsPerWeek);
      await ctx.db.programs.put(np);
      await ctx.db.outbox.add(outbox(ctx, np.id, { type: 'upsert', table: 'programs', row: programRow(ctx.userId, np) }));
    }
  });
  return out;
}

async function putEstimate(ctx: AppContext, e: EstimateInput): Promise<void> {
  if (!isExerciseId(e.exerciseId)) throw new AppError('VALIDATION_ERROR', 'exerciseId');
  if (!Number.isInteger(e.grams) || e.grams <= 0 || e.grams > 500_000) throw new AppError('VALIDATION_ERROR', 'estimateKg');
  if (e.kind === 'submax' && (e.reps == null || e.reps < 1 || e.reps > 8)) throw new AppError('VALIDATION_ERROR', 'estimateReps');
  if (e.rir != null && (e.rir < 0 || e.rir > 5)) throw new AppError('VALIDATION_ERROR', 'estimateRir');
  const current = await ctx.db.exerciseSettings.where('exerciseId').equals(e.exerciseId).first();
  const s: LocalExerciseSettings = {
    ...(current ?? emptySettings(ctx, e.exerciseId)),
    estimateGrams: e.grams,
    estimateKind: e.kind,
    estimateReps: e.reps ?? null,
    estimateRir: e.rir ?? null,
    estimateMeasured: !!e.measured,
    estimateTestedAt: e.testedAt ?? null,
    updatedAt: ctx.clock.now(),
    syncState: 'queued',
  };
  await ctx.db.exerciseSettings.put(s);
  await ctx.db.outbox.add(outbox(ctx, s.id, { type: 'upsert', table: 'user_exercise_profiles', row: exerciseSettingsRow(ctx.userId, s) }));
}

function emptySettings(ctx: AppContext, exerciseId: ExerciseId): LocalExerciseSettings {
  return { id: ctx.ids.uuid(), exerciseId, variantKey: 'default', experience: null, incrementGrams: null, estimateGrams: null, estimateKind: null, estimateReps: null, estimateRir: null, estimateMeasured: false, estimateTestedAt: null, maxLoadGrams: null, machineMinGrams: null, machineMaxGrams: null, updatedAt: ctx.clock.now(), syncState: 'queued' };
}

export async function setEstimate(ctx: AppContext, e: EstimateInput): Promise<void> {
  await txAll(ctx, async () => {
    const current = await ctx.db.exerciseSettings.where('exerciseId').equals(e.exerciseId).first();
    if (current?.strengthInputs !== undefined) {
      await putStrengthInputs(ctx, e.exerciseId, [...current.strengthInputs.filter((s) => s.kind !== e.kind), { kind: e.kind, grams: e.grams, reps: e.reps ?? null, rir: e.rir ?? null, measured: !!e.measured, testedAt: e.testedAt ?? null }]);
    } else await putEstimate(ctx, e);
  });
}

/** Existing single estimates are retained when an older profile is opened in the new editor. */
export function strengthInputsFromSettings(s?: LocalExerciseSettings): StrengthInput[] {
  if (s?.strengthInputs !== undefined) return s.strengthInputs;
  return s?.estimateKind && s.estimateGrams !== null ? [{ kind: s.estimateKind, grams: s.estimateGrams, reps: s.estimateReps, rir: s.estimateRir, measured: s.estimateMeasured, testedAt: s.estimateTestedAt }] : [];
}

async function putStrengthInputs(ctx: AppContext, exerciseId: ExerciseId, inputs: StrengthInput[]): Promise<void> {
  if (!isExerciseId(exerciseId) || inputs.length > 3 || new Set(inputs.map((s) => s.kind)).size !== inputs.length || inputs.some((s) => !validStrengthInput(s, ctx.clock.now().slice(0, 10)))) throw new AppError('VALIDATION_ERROR', 'strengthInputs');
  const current = await ctx.db.exerciseSettings.where('exerciseId').equals(exerciseId).first();
  const estimate = resolveStrengthInputs(inputs).estimate;
  const s: LocalExerciseSettings = {
    ...(current ?? emptySettings(ctx, exerciseId)), strengthInputs: inputs.map((x) => ({ ...x })),
    estimateKind: estimate?.kind ?? null, estimateGrams: estimate ? Math.round(estimate.kg * 1000) : null,
    estimateReps: estimate?.reps ?? null, estimateRir: estimate?.rir ?? null,
    estimateMeasured: !!estimate?.measured, estimateTestedAt: estimate?.testedAt ?? null,
    updatedAt: ctx.clock.now(), syncState: 'queued',
  };
  await ctx.db.exerciseSettings.put(s);
  await ctx.db.outbox.add(outbox(ctx, s.id, { type: 'upsert', table: 'user_exercise_profiles', row: exerciseSettingsRow(ctx.userId, s) }));
}

export async function setStrengthInputs(ctx: AppContext, exerciseId: ExerciseId, inputs: StrengthInput[]): Promise<void> {
  await txAll(ctx, () => putStrengthInputs(ctx, exerciseId, inputs));
}

export type ExerciseSettingsChanges = Partial<Pick<LocalExerciseSettings, 'experience' | 'incrementGrams' | 'maxLoadGrams' | 'machineMinGrams' | 'machineMaxGrams'>> & { clearEstimate?: boolean };

/** Övningsspecifika viktsteg, nivå, maxlasttak och maskinspann. Steg: >0 och ≤10 kg (02 §3). */
export async function updateExerciseSettings(ctx: AppContext, exerciseId: ExerciseId, changes: ExerciseSettingsChanges): Promise<void> {
  if (changes.incrementGrams !== undefined && changes.incrementGrams !== null && (changes.incrementGrams <= 0 || changes.incrementGrams > 10_000)) throw new AppError('VALIDATION_ERROR', 'incrementKg');
  if (changes.maxLoadGrams !== undefined && changes.maxLoadGrams !== null && (changes.maxLoadGrams <= 0 || changes.maxLoadGrams > 500_000)) throw new AppError('VALIDATION_ERROR', 'maxLoadKg');
  if (changes.machineMinGrams != null && changes.machineMaxGrams != null && changes.machineMinGrams > changes.machineMaxGrams) throw new AppError('VALIDATION_ERROR', 'machineRange');
  await txAll(ctx, async () => {
    const current = (await ctx.db.exerciseSettings.where('exerciseId').equals(exerciseId).first()) ?? emptySettings(ctx, exerciseId);
    const { clearEstimate, ...rest } = changes;
    const s: LocalExerciseSettings = { ...current, ...rest, ...(clearEstimate ? { strengthInputs: [], estimateGrams: null, estimateKind: null, estimateReps: null, estimateRir: null, estimateMeasured: false, estimateTestedAt: null } : {}), updatedAt: ctx.clock.now(), syncState: 'queued' };
    await ctx.db.exerciseSettings.put(s);
    await ctx.db.outbox.add(outbox(ctx, s.id, { type: 'upsert', table: 'user_exercise_profiles', row: exerciseSettingsRow(ctx.userId, s) }));
  });
}

export type NewRestriction = { kind: RuleKind; exerciseA?: ExerciseId | null; exerciseB?: ExerciseId | null; area?: Area | null; side?: Side | null; maxSets?: number | null; maxMode?: Mode | null; active: boolean; description?: string | null };

function validateRestriction(r: NewRestriction): void {
  if (!['block_exercise', 'block_pair_heavy', 'limit_sets', 'limit_mode', 'region_note'].includes(r.kind)) throw new AppError('VALIDATION_ERROR', 'kind');
  if (r.kind === 'block_pair_heavy' && (!r.exerciseA || !r.exerciseB || r.exerciseA === r.exerciseB)) throw new AppError('VALIDATION_ERROR', 'exercisePair');
  if ((r.kind === 'block_exercise' || r.kind === 'limit_sets' || r.kind === 'limit_mode') && !r.exerciseA && !r.area) throw new AppError('VALIDATION_ERROR', 'exerciseA');
  if (r.kind === 'limit_sets' && (r.maxSets == null || r.maxSets < 1 || r.maxSets > 6)) throw new AppError('VALIDATION_ERROR', 'maxSets');
  if (r.kind === 'limit_mode' && !r.maxMode) throw new AppError('VALIDATION_ERROR', 'maxMode');
  if (r.kind === 'region_note' && !r.area) throw new AppError('VALIDATION_ERROR', 'area');
  if (r.description && r.description.length > 500) throw new AppError('VALIDATION_ERROR', 'description');
}

async function putRestriction(ctx: AppContext, r: NewRestriction, id?: string): Promise<LocalRestriction> {
  validateRestriction(r);
  if (r.area && !(await hasConsent(ctx))) throw new AppError('PRIVACY_CONSENT_REQUIRED');
  const now = ctx.clock.now();
  const prev = id ? await ctx.db.restrictions.get(id) : undefined;
  const rule: LocalRestriction = { id: id ?? ctx.ids.uuid(), kind: r.kind, exerciseA: r.exerciseA ?? null, exerciseB: r.exerciseB ?? null, area: r.area ?? null, side: r.side ?? null, maxSets: r.maxSets ?? null, maxMode: r.maxMode ?? null, active: r.active, description: r.description ?? null, createdAt: prev?.createdAt ?? now, updatedAt: now, syncState: 'queued' };
  await ctx.db.restrictions.put(rule);
  await ctx.db.outbox.add(outbox(ctx, rule.id, { type: 'upsert', table: 'restriction_rules', row: restrictionRow(ctx.userId, rule) }));
  return rule;
}

/** S14: regler får bara ändras av användaren och gäller framtida planer (acceptanstest 21, 43). */
export async function saveRestriction(ctx: AppContext, r: NewRestriction, id?: string): Promise<LocalRestriction> {
  return txAll(ctx, () => putRestriction(ctx, r, id));
}

export async function deleteRestriction(ctx: AppContext, id: string): Promise<void> {
  await txAll(ctx, async () => {
    await ctx.db.restrictions.delete(id);
    await ctx.db.outbox.add(outbox(ctx, id, { type: 'delete', table: 'restriction_rules', id }));
  });
}

async function hasConsent(ctx: AppContext): Promise<boolean> {
  const c = await ctx.db.consents.get(ctx.userId);
  return !!c?.grantedAt && !c.withdrawnAt;
}

async function putConsent(ctx: AppContext, granted: boolean): Promise<void> {
  const now = ctx.clock.now();
  const prev = await ctx.db.consents.get(ctx.userId);
  if (!prev && !granted) return;
  const c: LocalConsent = granted
    ? { userId: ctx.userId, consentVersion: HEALTH_CONSENT_VERSION, grantedAt: now, withdrawnAt: null, revision: (prev?.revision ?? 0) + 1, syncState: 'queued' }
    : { userId: ctx.userId, consentVersion: prev!.consentVersion, grantedAt: prev!.grantedAt, withdrawnAt: now, revision: prev!.revision + 1, syncState: 'queued' };
  await ctx.db.consents.put(c);
  await ctx.db.outbox.add(outbox(ctx, `consent:${ctx.userId}`, { type: 'upsert', table: 'health_consents', row: consentRow(ctx.userId, c) }));
}

/** S14/ConsentPanel: separat, återkalleligt samtycke för hälsorelaterade uppgifter. */
export async function setHealthConsent(ctx: AppContext, granted: boolean): Promise<void> {
  await txAll(ctx, () => putConsent(ctx, granted));
}

export { hasConsent as hasHealthConsent };

/**
 * "Återställ originalövning" för ett permanent byte (CR §2.1 p.6): påverkar endast kommande planering;
 * historiska pass och tidigare snapshots ändras inte.
 */
export async function removePermanentSubstitution(ctx: AppContext, original: ExerciseId): Promise<LocalProfile> {
  const p = await ctx.db.profile.get(ctx.userId);
  if (!p) throw new AppError('NOT_FOUND');
  const substitutions = { ...p.substitutions };
  delete substitutions[original];
  return patchProfile(ctx, { substitutions });
}

/** Aktiv maskinprofil för en maskin-/kabelövning ('default' = ursprunglig). Separat historik per profil (§2.3). */
export async function setActiveEquipmentProfile(ctx: AppContext, exerciseId: ExerciseId, variantKey: string): Promise<LocalProfile> {
  if (!isExerciseId(exerciseId)) throw new AppError('VALIDATION_ERROR', 'exerciseId');
  validateVariantKey(variantKey);
  const p = await ctx.db.profile.get(ctx.userId);
  if (!p) throw new AppError('NOT_FOUND');
  const equipmentProfiles = { ...(p.equipmentProfiles ?? {}) };
  if (variantKey === 'default') delete equipmentProfiles[exerciseId];
  else equipmentProfiles[exerciseId] = variantKey;
  return patchProfile(ctx, { equipmentProfiles });
}
