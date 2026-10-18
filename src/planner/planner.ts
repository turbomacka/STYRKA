import { recoveryMode } from '../domain/recoveryPolicy';
import { comparableHistory } from '../domain/comparableTraining';
import { configuredPrescription } from '../domain/configuredPrescription';
import { comparisonKey } from '../domain/trainingFlow';
/**
 * Deterministisk schemagenerator enligt 08 §2 och 02 §7–9.
 * Ren funktion: ingen Date.now, ingen slump, ingen I/O. Samma input + version ⇒ samma output.
 */
import { ENGINE_VERSION, estimateMinutes, isHeavy, roundDownKg, type Experience, type Mode } from '../domain/decision_engine';
import { heavyPairAllowed } from '../domain/heavyPair';
import type { ExerciseId } from '../domain/catalog';
import { CATALOG, CATALOG_VERSION, RETIRED_SLUGS, V1_SLUGS, exercise, impactsAreas, isAvailable, type Area, type EquipmentSlug } from '../domain/catalog';
import { hashOf } from '../domain/hash';
import { relationBetween, relationsFrom, SUBSTITUTION_CATALOG_VERSION, type SubstitutionRelation } from '../domain/substitutionCatalog';
import { PLANNER_VERSION, RULESET_VERSION, type Familiarity, type LoadEstimationKind, type PlanSnapshot, type PlanStatus, type PlannedExercise, type PlannerInput, type Readiness, type RelationClass, type RestrictionRule, type Role, type SubstitutionMeta, type WarningCode } from '../domain/model';
import { e1rmFromEstimate, prescribe, START_PCT } from '../domain/prescription';
import { activeSymptoms, capMode, gateFor, hoursSinceExercise, isBlocked, isLowerSensitive, modeRank, pastWork, ruleTargets } from './history';
import templatesJson from './planner_templates.json';

type TemplateEntry = [string, string, number];
type Templates = {
  version: string;
  splits: Record<string, string[]>;
  templates: Record<string, TemplateEntry[]>;
  replacementFamilies: Record<string, string[]>;
  minimumPassMinutes: number;
  maximumPassMinutes: number;
};
export const TEMPLATES = templatesJson as unknown as Templates;
export const TEMPLATE_VERSION = TEMPLATES.version;

/** H: tolerans för avrundning av tidsestimat (08 §2 steg 8). */
export const TIME_TOLERANCE_MIN = 1;
/** H: prioriterat baslyft som inte tränats på 14 dygn får högre prioritet (08 §5). */
export const OVERDUE_HOURS = 14 * 24;
/** H: novis max 2 arbetsset per övning initialt; marklyft heavy max 2 (08 §2 steg 2). */
export const NOVICE_MAX_SETS = 2;
export const DEADLIFT_HEAVY_MAX_SETS = 2;

type Item = {
  slug: ExerciseId;
  templateSlug: ExerciseId;
  mode: Mode;
  sets: number;
  role: Role;
  order: number;
  reasons: string[];
  substitutionFrom: ExerciseId | null;
  substitutionReason: string | null;
  acceptedByUserAt: string | null;
};

type Ctx = {
  input: PlannerInput;
  history: ReturnType<typeof pastWork>;
  active: ReturnType<typeof activeSymptoms>;
  equipment: Set<EquipmentSlug>;
  removed: Array<{ exerciseId: ExerciseId; reason: string }>;
  reasons: string[];
  minutes: number;
};

export class PlannerInputError extends Error {}

export function validatePlannerInput(input: PlannerInput): void {
  const p = input.profile;
  if (!Number.isInteger(p.plannedSessionsPerWeek) || p.plannedSessionsPerWeek < 1 || p.plannedSessionsPerWeek > 7) throw new PlannerInputError('VALIDATION_ERROR:plannedSessionsPerWeek');
  const m = input.minutes ?? p.minutesPerSession;
  if (!Number.isInteger(m) || m < TEMPLATES.minimumPassMinutes || m > TEMPLATES.maximumPassMinutes) throw new PlannerInputError('VALIDATION_ERROR:minutes');
  if (!Number.isFinite(Date.parse(input.nowUtc))) throw new PlannerInputError('VALIDATION_ERROR:nowUtc');
  if (!Number.isInteger(input.rotationIndex) || input.rotationIndex < 0) throw new PlannerInputError('VALIDATION_ERROR:rotationIndex');
}

function roleFor(slug: ExerciseId, index: number): Role {
  const ex = exercise(slug);
  if (index === 0) return 'main';
  if (ex.bonus) return 'bonus';
  if (ex.timeKind === 'isolation') return 'accessory';
  return 'supplementary';
}

function experienceFor(ctx: Ctx, slug: ExerciseId): Experience {
  return ctx.input.exerciseSettings.find((s) => s.exerciseId === slug)?.experience ?? ctx.input.profile.experience;
}

function settingsFor(ctx: Ctx, slug: ExerciseId) {
  const s = ctx.input.exerciseSettings.find((s) => s.exerciseId === slug) ?? null;
  return s && ctx.input.profile.trainingPreferences?.loadRecommendationSource === 'performed_sets' ? { ...s, estimate: null } : s;
}

function remove(ctx: Ctx, items: Item[], i: number, reason: string): void {
  ctx.removed.push({ exerciseId: items[i].slug, reason });
  items.splice(i, 1);
}

/** 08 §2 steg 3: användarval och utrustning, endast inom definierad ersättningsfamilj. */
function applySubstitutions(ctx: Ctx, items: Item[]): void {
  const fams = TEMPLATES.replacementFamilies;
  const sensitive = isLowerSensitive(ctx.input.restrictions, ctx.active);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const family = (fams[it.slug] ?? []) as ExerciseId[];
    const chosen = ctx.input.profile.substitutions[it.slug];
    // Användarens aktiva val: mallens ersättningsfamilj ELLER en relation i substitutionskatalogen (CR §2.1 p.6).
    if (chosen && (family.includes(chosen) || !!relationBetween(it.slug, chosen)) && isAvailable(chosen, ctx.equipment)) {
      it.substitutionFrom = it.slug;
      it.slug = chosen;
      it.substitutionReason = 'USER_CHOSEN_VARIANT';
      it.acceptedByUserAt = ctx.input.nowUtc;
      it.reasons.push('USER_CHOSEN_VARIANT');
      continue;
    }
    if (isAvailable(it.slug, ctx.equipment)) continue;
    const candidates = family.filter((c) => isAvailable(c, ctx.equipment) && !isBlocked(c, ctx.input.restrictions));
    const fav = candidates.find((c) => ctx.input.profile.favorites.includes(c));
    const pick = fav ?? candidates[0];
    if (!pick) {
      remove(ctx, items, i--, 'EQUIPMENT_UNAVAILABLE');
      continue;
    }
    // 08 §6: marklyft → rumänska marklyft kräver användaraccept för känslig profil.
    if (it.slug === 'deadlift' && pick === 'romanian_deadlift' && sensitive) {
      remove(ctx, items, i--, 'SUBSTITUTION_REQUIRES_ACCEPT');
      continue;
    }
    it.substitutionFrom = it.slug;
    it.slug = pick;
    it.substitutionReason = 'EQUIPMENT_SUBSTITUTION';
    it.reasons.push('EQUIPMENT_SUBSTITUTION');
  }
  // Inga dubbletter av samma övning i ett pass.
  const seen = new Set<ExerciseId>();
  for (let i = 0; i < items.length; i++) {
    if (seen.has(items[i].slug)) remove(ctx, items, i--, 'DUPLICATE_AFTER_SUBSTITUTION');
    else seen.add(items[i].slug);
  }
}

/** 08 §2 steg 4: block_exercise, limit_sets, limit_mode. */
function applyUserRules(ctx: Ctx, items: Item[]): void {
  const rules = ctx.input.restrictions;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (isBlocked(it.slug, rules)) {
      remove(ctx, items, i--, 'USER_BLOCK_EXERCISE');
      continue;
    }
    for (const r of rules) {
      if (!ruleTargets(r, it.slug)) continue;
      if (r.kind === 'limit_sets' && r.maxSets !== null && it.sets > r.maxSets) {
        it.sets = r.maxSets;
        it.reasons.push('USER_LIMIT_SETS');
      }
      if (r.kind === 'limit_mode' && r.maxMode !== null && modeRank(it.mode) > modeRank(r.maxMode)) {
        it.mode = capMode(it.mode, r.maxMode);
        it.reasons.push('USER_LIMIT_MODE');
      }
    }
  }
}

/** 08 §2 steg 5: review_required tas bort; nivån anpassas efter faktiskt arbete, ansträngning och rörelseöverlapp. */
function applyRecovery(ctx: Ctx, items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const g = gateFor(it.slug, ctx.history, ctx.active, ctx.input.nowUtc, ctx.input.profile.trainingPreferences?.exerciseDefaults[it.slug]);
    if (g.impactedRegion && ['persistent', 'limping', 'swelling'].includes(g.relevantSymptoms)) {
      remove(ctx, items, i--, 'SYMPTOM_REVIEW_REQUIRED');
      continue;
    }
    const mode = recoveryMode(it.mode, g.recovery);
    if (mode !== it.mode) {
      it.mode = mode;
      it.reasons.push('RECOVERY_MODE_REDUCED');
    }
  }
}

function priorityScore(ctx: Ctx, it: Item): number {
  const goal = ctx.input.profile.goals[it.slug] ?? (exercise(it.slug).priorityLift ? 1 : 0);
  const h = exercise(it.slug).priorityLift ? hoursSinceExercise(ctx.history, it.slug, ctx.input.nowUtc) : null;
  const overdue = exercise(it.slug).priorityLift && ctx.history.length > 0 && (h === null || h > OVERDUE_HOURS) ? 1 : 0;
  return goal * 10 + overdue * 5;
}

/** 02 §7: känslig underkroppsprofil får endast EN av knäböj/marklyft i samma pass. */
function applyLowerSensitivity(ctx: Ctx, items: Item[]): void {
  if (!isLowerSensitive(ctx.input.restrictions, ctx.active)) return;
  const idx = items.map((it, i) => ({ it, i })).filter((x) => x.it.slug === 'squat' || x.it.slug === 'deadlift');
  if (idx.length < 2) return;
  const sorted = [...idx].sort((a, b) => priorityScore(ctx, b.it) - priorityScore(ctx, a.it) || a.it.order - b.it.order);
  const drop = sorted[1];
  remove(ctx, items, items.indexOf(drop.it), 'SENSITIVE_PROFILE_SINGLE_LOWER_LIFT');
}

type PairRule = { a: ExerciseId; b: ExerciseId };

function pairRules(ctx: Ctx): PairRule[] {
  return ctx.input.restrictions
    .filter((r) => r.active && r.kind === 'block_pair_heavy' && r.exerciseA && r.exerciseB)
    .map((r) => ({ a: r.exerciseA as ExerciseId, b: r.exerciseB as ExerciseId }));
}

/** 08 §2 steg 6 på mode-nivå: håll högst prioriterad tung, gör den andra lätt. Monoton ⇒ terminerar. */
function applyPairRulesByMode(ctx: Ctx, items: Item[]): void {
  for (const pr of pairRules(ctx)) {
    const a = items.find((x) => x.slug === pr.a || x.substitutionFrom === pr.a);
    const b = items.find((x) => x.slug === pr.b || x.substitutionFrom === pr.b);
    if (a && a === b) continue;
    if (!a || !b || a.mode !== 'heavy' || b.mode !== 'heavy') continue;
    const [, lower] = [a, b].sort((x, y) => priorityScore(ctx, y) - priorityScore(ctx, x) || x.order - y.order);
    lower.mode = 'light';
    lower.reasons.push('PAIR_RULE_DOWNGRADED');
  }
}

function toSessionExercise(p: PlannedExercise) {
  return { exerciseId: p.exerciseId, mode: p.mode, sets: p.sets, plannedKg: p.kg, estimatedOneRM: p.estimatedOneRM, isMarkedHeavy: p.mode === 'heavy' };
}

/**
 * Parregler gäller även ersättare: en övning som ersätter t.ex. knäböj räknas också som knäböj i parkontrollen
 * (CR §4.1 – ett byte får inte skapa ett förbjudet tungt par). Utan byten är listan oförändrad.
 */
function heavyList(ps: PlannedExercise[]) {
  return ps.flatMap((p) => (p.substitutionFrom && p.substitutionFrom !== p.exerciseId ? [toSessionExercise(p), { ...toSessionExercise(p), exerciseId: p.substitutionFrom }] : [toSessionExercise(p)]));
}

/** Aktiv maskinprofil för en övning (CR §2.3). Endast maskin-/kabelövningar kan ha annan än 'default'. */
export function activeVariant(profile: PlannerInput['profile'], slug: ExerciseId): string {
  const c = profile.trainingPreferences?.exerciseDefaults[slug];
  if (c) return `flow:${comparisonKey(slug, c)}`;
  return (exercise(slug).requiresEquipmentProfile ? profile.equipmentProfiles?.[slug] : undefined) ?? 'default';
}
const variantOf = (p: PlannedExercise) => p.variantKey ?? 'default';


/** Historik och inställningar för en övning och redskapsvariant. Uppskattning gäller bara standardvarianten. */
function variantData(ctx: Ctx, slug: ExerciseId, variantKey: string) {
  const configuration = ctx.input.profile.trainingPreferences?.exerciseDefaults[slug];
  const history = comparableHistory(ctx.history, slug, configuration, variantKey);
  const s = settingsFor(ctx, slug);
  const settings = s && variantKey !== 'default' ? { ...s, estimate: null } : s;
  return { history, settings };
}

function prescribeItem(ctx: Ctx, it: Item, variantKey = activeVariant(ctx.input.profile, it.slug)): PlannedExercise {
  const gate = gateFor(it.slug, ctx.history, ctx.active, ctx.input.nowUtc, ctx.input.profile.trainingPreferences?.exerciseDefaults[it.slug]);
  const { history, settings } = variantData(ctx, it.slug, variantKey);
  const p = prescribe({
    performedSetsOnly: ctx.input.profile.trainingPreferences?.loadRecommendationSource === 'performed_sets',
    exerciseId: it.slug,
    mode: it.mode,
    sets: it.sets,
    role: it.role,
    experience: experienceFor(ctx, it.slug),
    settings,
    history,
    gate,
    bodyweightKg: ctx.input.profile.bodyweightKg,
  });
  const configuration = ctx.input.profile.trainingPreferences?.exerciseDefaults[it.slug];
  const withVariant = { ...(variantKey !== 'default' ? { variantKey } : {}), ...(configuration ? { configuration } : {}) };
  const adapted = configuration ? configuredPrescription(p, ctx.history, configuration) : p;
  return { ...adapted, ...withVariant, reasons: [...it.reasons, ...adapted.reasons], substitutionFrom: it.substitutionFrom, substitutionReason: it.substitutionReason, acceptedByUserAt: it.acceptedByUserAt };
}

/** 08 §2 steg 6–7: efter viktberäkning kan relativ last ≥75 % e1RM göra en övning tung (02 §2). */
function prescribeWithPairCheck(ctx: Ctx, items: Item[]): PlannedExercise[] {
  let planned = items.map((it) => prescribeItem(ctx, it));
  const rules = pairRules(ctx);
  for (let guard = 0; guard <= items.length * 2 + 2; guard++) {
    const violation = rules.find((r) => !heavyPairAllowed(heavyList(planned), r.a, r.b));
    if (!violation) return planned;
    const ia = planned.findIndex((p) => p.exerciseId === violation.a || p.substitutionFrom === violation.a);
    const ib = planned.findIndex((p) => p.exerciseId === violation.b || p.substitutionFrom === violation.b);
    const [, lowerIdx] = [ia, ib].sort((x, y) => priorityScore(ctx, items[y]) - priorityScore(ctx, items[x]) || items[x].order - items[y].order);
    const it = items[lowerIdx];
    if (it.mode !== 'light') {
      it.mode = 'light';
      it.reasons.push('PAIR_RULE_DOWNGRADED');
      planned[lowerIdx] = prescribeItem(ctx, it);
    } else {
      // Även lätt variant räknas som tung (relativ last) – ta bort den andra övningen.
      remove(ctx, items, lowerIdx, 'PAIR_RULE_REMOVED');
      planned = planned.filter((_, i) => i !== lowerIdx);
    }
  }
  throw new Error('PAIR_RULE_UNSATISFIABLE');
}

function minutesFor(exs: PlannedExercise[]): number {
  if (!exs.length) return 0;
  let firstBarbellSeen = false;
  return estimateMinutes(
    exs.map((p) => {
      const kind = exercise(p.exerciseId).timeKind;
      const firstBarbell = kind === 'barbell_compound' && !firstBarbellSeen;
      if (kind === 'barbell_compound') firstBarbellSeen = true;
      // H: ensidiga övningar i katalog 2.0.0 räknas för båda sidor (tidsfaktor 2); version 1 har faktor 1.
      const sets = Math.min(6, p.sets * exercise(p.exerciseId).timeMultiplier);
      return { mode: p.mode, sets, kind, firstBarbell };
    }),
  );
}

/** 08 §2 steg 8. Vila för tungt baslyft kortas aldrig. */
function pruneToBudget(ctx: Ctx, exs: PlannedExercise[]): { exercises: PlannedExercise[]; status: PlanStatus; warnings: WarningCode[] } {
  const budget = ctx.minutes + TIME_TOLERANCE_MIN;
  const list = exs.map((x) => ({ ...x }));
  const fits = () => minutesFor(list) <= budget;
  if (fits()) return { exercises: list, status: 'ok', warnings: [] };
  const dropLast = (pred: (p: PlannedExercise) => boolean, reason: string): boolean => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (pred(list[i])) {
        ctx.removed.push({ exerciseId: list[i].exerciseId, reason });
        list.splice(i, 1);
        return true;
      }
    }
    return false;
  };
  const reduceLast = (pred: (p: PlannedExercise) => boolean, min: number): boolean => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (pred(list[i]) && list[i].sets > min) {
        list[i] = { ...list[i], sets: list[i].sets - 1, reasons: list[i].reasons.includes('TIME_SETS_REDUCED') ? list[i].reasons : [...list[i].reasons, 'TIME_SETS_REDUCED'] };
        return true;
      }
    }
    return false;
  };
  // (1) bonus
  while (!fits() && dropLast((p) => p.role === 'bonus', 'TIME_PRUNED_BONUS'));
  // (2) accessorisset från slutet; övning med 0 set tas bort
  while (!fits()) {
    if (reduceLast((p) => p.role === 'accessory', 1)) continue;
    if (dropLast((p) => p.role === 'accessory', 'TIME_PRUNED_ACCESSORY')) continue;
    break;
  }
  // (3) kompletterande set till min 1
  while (!fits() && reduceLast((p) => p.role === 'supplementary', 1));
  // (4) lägst prioriterad kompletterande övning (sist i ordningen)
  while (!fits() && dropLast((p) => p.role === 'supplementary', 'TIME_PRUNED_SUPPLEMENTARY'));
  if (fits()) return { exercises: list, status: 'time_reduced', warnings: ['WARN_TIME'] };
  // (5) huvudlyftet ryms inte: kortare alternativ utan tungt maxlyft.
  const main = list[0];
  if (!main) return { exercises: [], status: 'empty', warnings: ['WARN_TIME_INSUFFICIENT'] };
  return { exercises: list, status: 'time_insufficient', warnings: ['WARN_TIME_INSUFFICIENT'] };
}

function shortAlternative(ctx: Ctx, items: Item[]): PlannedExercise[] {
  const mainItem = items[0];
  if (!mainItem) return [];
  const alt: Item = { ...mainItem, mode: mainItem.mode === 'heavy' ? 'light' : mainItem.mode, reasons: [...mainItem.reasons, 'TIME_MAIN_LIFT_SHORT_ALTERNATIVE'] };
  for (let sets = Math.min(2, alt.sets); sets >= 1; sets--) {
    const p = prescribeItem(ctx, { ...alt, sets });
    const one = [{ ...p, sets: Math.min(p.sets, sets) }];
    if (minutesFor(one) <= ctx.minutes + TIME_TOLERANCE_MIN) return one;
  }
  return [];
}

function warningsFor(exs: PlannedExercise[], ctx: Ctx): WarningCode[] {
  const w: WarningCode[] = [];
  if (exs.some((e) => e.calibration)) w.push('WARN_CAL');
  if (ctx.removed.some((r) => r.reason === 'SYMPTOM_REVIEW_REQUIRED') || ctx.active.some((s) => ['persistent', 'limping', 'swelling'].includes(s.reaction))) w.push('WARN_REVIEW');
  if (exs.some((e) => e.reasons.includes('RECOVERY_MODE_REDUCED') || e.reasons.includes('HEAVY_DOWNGRADED_TO_LIGHT') || e.state === 'caution')) w.push('WARN_RECOVERY');
  return w;
}

/** 08 §2 steg 9: invarianta regler verifieras igen; brott är ett programfel, aldrig tyst. */
export function verifyInvariants(snapshot: PlanSnapshot, input: PlannerInput): void {
  const active = activeSymptoms(input.symptoms, pastWork(input.history, input.nowUtc));
  for (const e of snapshot.exercises) {
    if (isBlocked(e.exerciseId, input.restrictions)) throw new Error(`INVARIANT_BLOCKED_${e.exerciseId}`);
    const hit = active.find((s) => ['persistent', 'limping', 'swelling'].includes(s.reaction) && impactsAreas(e.exerciseId, [s.area]));
    if (hit) throw new Error(`INVARIANT_REVIEW_${e.exerciseId}`);
    if (e.loadKind === 'external_kg' && e.kg !== null && (e.kg < 0 || e.kg > 500)) throw new Error('INVARIANT_KG_RANGE');
  }
  for (const r of input.restrictions) {
    if (r.active && r.kind === 'block_pair_heavy' && r.exerciseA && r.exerciseB && !heavyPairAllowed(heavyList(snapshot.exercises), r.exerciseA, r.exerciseB)) {
      throw new Error('INVARIANT_PAIR_HEAVY');
    }
  }
}

function finalize(ctx: Ctx, base: { kind: 'planned' | 'extra'; templateKey: string | null; rotationIndex: number | null; readiness: Readiness | null; extraInputs?: unknown }, exs: PlannedExercise[], status: PlanStatus, warnings: WarningCode[]): PlanSnapshot {
  const allWarnings = [...new Set([...warnings, ...warningsFor(exs, ctx)])];
  const snapshot: PlanSnapshot = {
    kind: base.kind,
    templateKey: base.templateKey,
    templateVersion: TEMPLATE_VERSION,
    rotationIndex: base.rotationIndex,
    engineVersion: ENGINE_VERSION,
    plannerVersion: PLANNER_VERSION,
    ruleSetVersion: RULESET_VERSION,
    catalogVersion: CATALOG_VERSION,
    generatedAtUtc: ctx.input.nowUtc,
    inputsHash: hashOf({ input: ctx.input, extra: base.extraInputs ?? null, v: [ENGINE_VERSION, PLANNER_VERSION, RULESET_VERSION, CATALOG_VERSION, TEMPLATE_VERSION] }),
    budgetMinutes: ctx.minutes,
    estimatedMinutes: minutesFor(exs),
    readiness: base.readiness,
    status,
    exercises: exs,
    removed: ctx.removed,
    reasons: ctx.reasons,
    warnings: allWarnings,
  };
  verifyInvariants(snapshot, ctx.input);
  return snapshot;
}

function makeCtx(input: PlannerInput): Ctx {
  validatePlannerInput(input);
  const history = pastWork(input.history, input.nowUtc);
  return {
    input,
    history,
    active: activeSymptoms(input.symptoms, history),
    equipment: new Set(input.profile.equipment),
    removed: [],
    reasons: [],
    minutes: input.minutes ?? input.profile.minutesPerSession,
  };
}

export function templateKeyFor(frequency: number, rotationIndex: number): string {
  const split = TEMPLATES.splits[String(frequency)];
  if (!split) throw new PlannerInputError('VALIDATION_ERROR:plannedSessionsPerWeek');
  return split[rotationIndex % split.length];
}

/** Nästa ordinarie pass. */
export function planRegular(input: PlannerInput): PlanSnapshot {
  const ctx = makeCtx(input);
  const key = templateKeyFor(input.profile.plannedSessionsPerWeek, input.rotationIndex);
  const entries = TEMPLATES.templates[key];
  const items: Item[] = entries.map(([slug, mode, sets], i) => ({
    slug: slug as ExerciseId,
    templateSlug: slug as ExerciseId,
    mode: mode as Mode,
    sets,
    role: roleFor(slug as ExerciseId, i),
    order: i,
    reasons: [`TEMPLATE_${key}`],
    substitutionFrom: null,
    substitutionReason: null,
    acceptedByUserAt: null,
  }));
  for (const it of items) {
    if (experienceFor(ctx, it.slug) === 'novice' && it.sets > NOVICE_MAX_SETS) {
      it.sets = NOVICE_MAX_SETS;
      it.reasons.push('NOVICE_MAX_SETS');
    }
    if (it.slug === 'deadlift' && it.mode === 'heavy' && it.sets > DEADLIFT_HEAVY_MAX_SETS) it.sets = DEADLIFT_HEAVY_MAX_SETS;
  }
  const templateCount = items.length;
  applySubstitutions(ctx, items);
  const catchUp = input.catchUp?.targetRotationIndex === input.rotationIndex ? input.catchUp : undefined;
  if (catchUp && !items.some((i) => i.slug === catchUp.exerciseId) && isAvailable(catchUp.exerciseId, ctx.equipment)) {
    const index = items.findIndex((i) => i.slug === catchUp.replacesExerciseId && i.role !== 'main' && !exercise(i.slug).priorityLift);
    if (index >= 0) {
      const original = items[index];
      let sets = Math.min(4, Math.max(1, catchUp.sets));
      if (experienceFor(ctx, catchUp.exerciseId) === 'novice') sets = Math.min(sets, NOVICE_MAX_SETS);
      if (catchUp.exerciseId === 'deadlift' && catchUp.mode === 'heavy') sets = Math.min(sets, DEADLIFT_HEAVY_MAX_SETS);
      items[index] = { ...original, slug: catchUp.exerciseId, templateSlug: catchUp.exerciseId, mode: catchUp.mode, sets, reasons: ['USER_ACCEPTED_CATCH_UP'], substitutionFrom: catchUp.substitutionFrom ?? null, substitutionReason: catchUp.substitutionFrom ? 'USER_ACCEPTED_CATCH_UP' : null };
    }
  }
  applyUserRules(ctx, items);
  applyRecovery(ctx, items);
  applyLowerSensitivity(ctx, items);
  applyPairRulesByMode(ctx, items);
  // Roll: om huvudlyftet försvunnit blir första kvarvarande flerledsövning huvudlyft.
  if (items.length && !items.some((i) => i.role === 'main')) {
    const first = items.find((i) => i.role === 'supplementary') ?? items[0];
    first.role = 'main';
  }
  for (const it of items) {
    if (exercise(it.slug).priorityLift && priorityScore(ctx, it) % 10 >= 5) it.reasons.push('PRIORITY_LIFT_OVERDUE_14D');
  }
  if (!items.length) {
    return finalize(ctx, { kind: 'planned', templateKey: key, rotationIndex: input.rotationIndex, readiness: null }, [], 'empty', ['WARN_EMPTY', 'WARN_NO_FULL_SCHEDULE']);
  }
  const planned = prescribeWithPairCheck(ctx, items);
  const ruleRemoved = items.length < templateCount;
  const pruned = pruneToBudget(ctx, planned);
  let exs = pruned.exercises;
  let status: PlanStatus = pruned.status;
  const warnings = [...pruned.warnings];
  if (status === 'time_insufficient') {
    exs = shortAlternative(ctx, items);
    if (!exs.length) status = 'empty';
  }
  if (ruleRemoved) {
    warnings.push('WARN_NO_FULL_SCHEDULE');
    if (status === 'ok') status = 'no_full_schedule';
  }
  if (!exs.length && !warnings.includes('WARN_EMPTY')) warnings.push('WARN_EMPTY');
  const result = finalize(ctx, { kind: 'planned', templateKey: key, rotationIndex: input.rotationIndex, readiness: null }, exs, exs.length ? status : 'empty', warnings);
  if (catchUp) {
    const original = planRegular({ ...input, catchUp: undefined });
    const main = original.exercises.find((e) => e.role === 'main');
    const preservedMain = !main || result.exercises.some((e) => e.exerciseId === main.exerciseId && e.mode === main.mode && e.sets === main.sets);
    const preservedOthers = original.exercises.filter((e) => e.exerciseId !== catchUp.replacesExerciseId).every((e) => result.exercises.some((r) => r.exerciseId === e.exerciseId && r.mode === e.mode && r.sets === e.sets));
    // A changed situation must fall back to the normal plan, not silently drop more work or the requested exercise.
    if (!preservedMain || !preservedOthers || result.exercises.length !== original.exercises.length || result.status === 'empty' || result.status === 'time_insufficient' || !result.exercises.some((e) => e.exerciseId === catchUp.exerciseId && e.reasons.includes('USER_ACCEPTED_CATCH_UP'))) return original;
    result.catchUp = { sourceExerciseId: catchUp.sourceExerciseId, exerciseId: catchUp.exerciseId, replacesExerciseId: catchUp.replacesExerciseId, reason: catchUp.reason, decisionId: catchUp.decisionId };
    result.plannerVersion = 'STYRKA-PLANNER/1.1.0';
  }
  return result;
}

export type ExtraOptions = { minutes: number; readiness: Readiness; painAreas?: Area[] };

const EXTRA_SLOTS: Array<{ kind: 'compound' | 'accessory' }> = [{ kind: 'compound' }, { kind: 'compound' }, { kind: 'compound' }, { kind: 'accessory' }, { kind: 'accessory' }];

/** Spontanpass (02 §8, 08 §3). Separat typ `extra`; påverkar aldrig rotationen automatiskt. */
export function planExtra(input: PlannerInput, opts: ExtraOptions): PlanSnapshot {
  const ctx = makeCtx({ ...input, minutes: opts.minutes });
  const now = input.nowUtc;
  const painAreas = opts.readiness === 'pain' ? (opts.painAreas?.length ? opts.painAreas : [...new Set([...ctx.active.map((s) => s.area), ...input.restrictions.filter((r) => r.active && r.area).map((r) => r.area as Area)])]) : [];
  ctx.reasons.push(`TIME_LIMIT_${opts.minutes}`);
  if (opts.readiness === 'tired') ctx.reasons.push('READINESS_TIRED');
  if (opts.readiness === 'pain') ctx.reasons.push('READINESS_PAIN');

  type Cand = { slug: ExerciseId; recoveryLimited: boolean; exposure7d: number; score: number; order: number };
  const cands: Cand[] = [];
  // Urval: version 1-katalogen (oförändrat beteende) plus övningar som användaren permanent valt som ersättare.
  const chosenTargets = new Set(Object.values(input.profile.substitutions).filter((x): x is ExerciseId => !!x));
  CATALOG.filter((ex) => V1_SLUGS.has(ex.slug) || chosenTargets.has(ex.slug)).forEach((ex, order) => {
    const slug = ex.slug;
    if (!isAvailable(slug, ctx.equipment)) return;
    if (isBlocked(slug, input.restrictions)) {
      ctx.removed.push({ exerciseId: slug, reason: 'USER_RESTRICTION' });
      return;
    }
    const g = gateFor(slug, ctx.history, ctx.active, now, ctx.input.profile.trainingPreferences?.exerciseDefaults[slug]);
    if (g.impactedRegion && ['persistent', 'limping', 'swelling'].includes(g.relevantSymptoms)) {
      ctx.removed.push({ exerciseId: slug, reason: 'SYMPTOM_REVIEW_REQUIRED' });
      return;
    }
    if (painAreas.length && impactsAreas(slug, painAreas)) {
      ctx.removed.push({ exerciseId: slug, reason: 'READINESS_PAIN_AREA' });
      return;
    }
    const sevenDays = ctx.history.filter((h) => (Date.parse(now) - Date.parse(h.whenUtc)) / 3_600_000 <= 168 && (h.exerciseId === slug || (ex.recoveryGroup !== 'own' && exercise(h.exerciseId).recoveryGroup === ex.recoveryGroup)));
    const exposure7d = sevenDays.reduce((n, h) => n + h.sets.filter((s) => s.kind === 'work' && s.status === 'done').length, 0);
    const fav = input.profile.favorites.includes(slug) ? 1 : 0;
    const goal = input.profile.goals[slug] ?? (ex.priorityLift ? 1 : 0);
    const exH = hoursSinceExercise(ctx.history, slug, now);
    const overdue = ex.priorityLift && ctx.history.length > 0 && (exH === null || exH > OVERDUE_HOURS) ? 1 : 0;
    const chosenVariantPenalty = Object.entries(input.profile.substitutions).some(([from, to]) => from === slug && to !== slug) ? 1 : 0;
    cands.push({
      slug,
      recoveryLimited: g.recovery.modeCap !== null,
      exposure7d,
      score: fav * 6 + goal * 4 + overdue * 5 - exposure7d - chosenVariantPenalty * 20 - (ex.bonus ? 3 : 0),
      order,
    });
  });
  // Sortering: utan aktuell återhämtningsbegränsning först (08 §3), sedan prioritet/favorit och minst exponering, sist katalogordning.
  cands.sort((a, b) => Number(a.recoveryLimited) - Number(b.recoveryLimited) || b.score - a.score || a.order - b.order);

  const items: Item[] = [];
  const usedGroups = new Set<string>();
  for (const slot of EXTRA_SLOTS) {
    const pick = cands.find((c) => {
      if (items.some((i) => i.slug === c.slug)) return false;
      const ex = exercise(c.slug);
      if (slot.kind === 'compound') return ex.timeKind !== 'isolation' && !usedGroups.has(ex.recoveryGroup);
      return ex.timeKind === 'isolation';
    });
    if (!pick) continue;
    const ex = exercise(pick.slug);
    const idx = items.length;
    const reasons: string[] = ['EXTRA_SESSION'];
    if (!pick.recoveryLimited) reasons.push('LEAST_RECENT_PATTERN');
    if (input.profile.favorites.includes(pick.slug)) reasons.push('PREFERRED_MOVEMENT');
    let mode: Mode;
    if (ex.timeKind === 'isolation') mode = 'light';
    else if (idx === 0) {
      if (opts.readiness === 'good' && !pick.recoveryLimited) mode = 'heavy';
      else if (opts.readiness === 'tired' || opts.readiness === 'pain') mode = 'light';
      else mode = 'moderate';
    } else mode = opts.readiness === 'tired' || opts.readiness === 'pain' ? 'light' : 'moderate';
    const exp = experienceFor(ctx, pick.slug);
    let sets = mode === 'heavy' ? (exp === 'novice' ? 2 : 3) : 2;
    if (opts.readiness === 'tired') sets = Math.min(sets, 2);
    items.push({ slug: pick.slug, templateSlug: pick.slug, mode, sets, role: idx === 0 ? 'main' : ex.bonus ? 'bonus' : ex.timeKind === 'isolation' ? 'accessory' : 'supplementary', order: idx, reasons, substitutionFrom: null, substitutionReason: null, acceptedByUserAt: null });
    if (ex.timeKind !== 'isolation') usedGroups.add(ex.recoveryGroup);
  }
  applyUserRules(ctx, items);
  applyRecovery(ctx, items);
  applyLowerSensitivity(ctx, items);
  applyPairRulesByMode(ctx, items);
  if (opts.readiness === 'tired') for (const it of items) if (it.mode === 'heavy') it.mode = 'moderate';
  const baseInfo = { kind: 'extra' as const, templateKey: null, rotationIndex: null, readiness: opts.readiness, extraInputs: opts };
  const extraWarnings: WarningCode[] = opts.readiness === 'pain' ? ['WARN_PAIN'] : [];
  if (!items.length) return finalize(ctx, baseInfo, [], 'empty', [...extraWarnings, 'WARN_EMPTY']);
  const planned = prescribeWithPairCheck(ctx, items);
  const pruned = pruneToBudget(ctx, planned);
  let exs = pruned.exercises;
  let status = pruned.status;
  if (status === 'time_insufficient') {
    exs = shortAlternative(ctx, items);
    if (!exs.length) status = 'empty';
  }
  return finalize(ctx, baseInfo, exs, exs.length ? status : 'empty', [...extraWarnings, ...pruned.warnings]);
}

/**
 * 02 §8 / 08 §3: "Räkna som ordinarie" erbjuds bara när motsvarande huvudarbete faktiskt gjorts:
 * nästa ordinarie pass huvudlyft utförts i extrapasset med minst lika många arbetsset.
 */
export function canCountAsPlanned(nextPlanned: PlanSnapshot, extraDone: Array<{ exerciseId: ExerciseId; doneWorkSets: number }>): boolean {
  const main = nextPlanned.exercises.find((e) => e.role === 'main') ?? nextPlanned.exercises[0];
  if (!main) return false;
  const done = extraDone.find((e) => e.exerciseId === main.exerciseId);
  return !!done && done.doneWorkSets >= main.sets;
}

// ---------------------------------------------------------------------------
// Övningsbyte (STYRKA-CR-2026-10-10-01 §2–§3). Återanvänder motorn; ingen andra progressionsalgoritm.
// ---------------------------------------------------------------------------

export type ReplacementStatus = 'ok' | 'NOT_IN_CATALOG' | 'EQUIPMENT_UNAVAILABLE' | 'USER_BLOCK_EXERCISE' | 'SYMPTOM_REVIEW_REQUIRED' | 'PAIR_RULE' | 'ALREADY_IN_SESSION';

export type ReplacementResult = {
  status: ReplacementStatus;
  planned: PlannedExercise | null;
  relation: SubstitutionRelation | null;
  /** Hjälpskattning möjlig men vana i målövningen okänd – fråga "Har du gjort övningen tidigare?". */
  needsFamiliarity: boolean;
  /** Hjälpskattning används: användaren måste bekräfta eller justera vikten. */
  requiresConfirmation: boolean;
};

export type ReplacementArgs = {
  from: PlannedExercise;
  to: ExerciseId;
  /** Övriga aktiva övningar i passet (parregler och dubbletter). */
  others: PlannedExercise[];
  familiarity?: Familiarity;
  variantKey?: string;
  replacesSessionExerciseId?: string;
};

/** H (CR §3.2): högsta andel av preliminär e1RM vid första exponering från hjälpskattning. */
export const FIRST_EXPOSURE_MAX_PCT = 0.6;

const RELATION_CODE: Record<RelationClass, string> = { near_variant: 'SUB_RELATION_NEAR_VARIANT', movement_family: 'SUB_RELATION_MOVEMENT_FAMILY', accessory: 'SUB_RELATION_ACCESSORY' };
const KIND_CODE: Record<LoadEstimationKind, string> = {
  target_observed: 'SUB_TARGET_OBSERVED',
  target_estimated: 'SUB_TARGET_ESTIMATED',
  calibration: 'SUB_CALIBRATION',
  population_prior_low_confidence: 'SUB_POPULATION_PRIOR_LOW_CONFIDENCE',
  none: 'SUB_NO_ESTIMATE',
};

/**
 * Seed-filens villkor för hjälpskattning: "no active restriction". Tolkas försiktigt: ingen aktiv användarregel
 * (blockering, parregel, set-/nivågräns eller områdesnotering) som rör käll- eller målövningen eller målövningens
 * områden. Då används kalibrering i stället – ingen siffra från populationsdata.
 */
function priorRestricted(rules: RestrictionRule[], exercises: ExerciseId[], target: ExerciseId): boolean {
  return rules.some((r) => r.active && (exercises.some((e) => r.exerciseA === e || r.exerciseB === e) || (!!r.area && impactsAreas(target, [r.area]))));
}

/** Giltig e1RM i källövningen: egen uppskattning, annars senaste föreskrifts e1RM (standardvariant). */
function sourceE1rm(ctx: Ctx, from: ExerciseId): number | null {
  // No population ratios or inherited estimated maxima in the explicitly observed-only mode.
  if (ctx.input.profile.trainingPreferences?.loadRecommendationSource === 'performed_sets') return null;
  const s = settingsFor(ctx, from);
  if (s?.estimate) {
    const e = e1rmFromEstimate(s.estimate);
    if (e && e.kg > 0) return e.kg;
  }
  const hist = ctx.history.filter((h) => h.exerciseId === from && variantOf(h.plan) === 'default' && h.plan.estimatedOneRM !== null && h.plan.estimatedOneRM > 0);
  return hist.length ? (hist[hist.length - 1].plan.estimatedOneRM as number) : null;
}

/**
 * Föreskrift för ersättare enligt auktoritetsordningen (CR §3.1). Tillämpar blockeringar, symtomspärr,
 * återhämtning, användarens gränser och parregler innan något visas. Den ursprungliga övningens kilo används aldrig.
 */
export function planReplacement(input: PlannerInput, args: ReplacementArgs): ReplacementResult {
  const ctx = makeCtx(input);
  const { from, to } = args;
  const fail = (status: ReplacementStatus, relation: SubstitutionRelation | null = null): ReplacementResult => ({ status, planned: null, relation, needsFamiliarity: false, requiresConfirmation: false });
  const sameExercise = to === from.exerciseId;
  const revert = !sameExercise && from.substitutionFrom === to;
  const relation = sameExercise ? null : (relationBetween(from.exerciseId, to) ?? null);
  if (!sameExercise && !relation && !revert) return fail('NOT_IN_CATALOG');
  if (!isAvailable(to, ctx.equipment)) return fail('EQUIPMENT_UNAVAILABLE', relation);
  if (isBlocked(to, input.restrictions)) return fail('USER_BLOCK_EXERCISE', relation);
  const gate = gateFor(to, ctx.history, ctx.active, input.nowUtc, input.profile.trainingPreferences?.exerciseDefaults[to]);
  if (gate.impactedRegion && ['persistent', 'limping', 'swelling'].includes(gate.relevantSymptoms)) return fail('SYMPTOM_REVIEW_REQUIRED', relation);
  const variantKey = args.variantKey ?? activeVariant(input.profile, to);
  if (args.others.some((o) => o.exerciseId === to && variantOf(o) === variantKey)) return fail('ALREADY_IN_SESSION', relation);

  // Behåll träningssyfte och belastningsroll; användarens gränser och återhämtning gäller som i planeringen.
  const it: Item = { slug: to, templateSlug: from.exerciseId, mode: from.mode, sets: from.sets, role: from.role, order: 0, reasons: [], substitutionFrom: from.exerciseId, substitutionReason: 'USER_SWAP', acceptedByUserAt: input.nowUtc };
  const items = [it];
  applyUserRules(ctx, items);
  if (!items.length) return fail('USER_BLOCK_EXERCISE', relation);
  const recoveredMode = recoveryMode(it.mode, gate.recovery);
  if (recoveredMode !== it.mode) {
    it.mode = recoveredMode;
    it.reasons.push('RECOVERY_MODE_REDUCED');
  }
  const pairs = pairRules(ctx);
  const othersHeavy = heavyList(args.others);
  const root = from.substitutionFrom ?? from.exerciseId;
  const modeOk = pairs.every((r) => heavyPairAllowed([...othersHeavy, { exerciseId: to, mode: it.mode, sets: it.sets, isMarkedHeavy: it.mode === 'heavy' }, { exerciseId: root, mode: it.mode, sets: it.sets, isMarkedHeavy: it.mode === 'heavy' }], r.a, r.b));
  if (!modeOk && it.mode !== 'light') {
    it.mode = 'light';
    it.reasons.push('PAIR_RULE_DOWNGRADED');
  }

  // Auktoritetsordning för startvikt (§3.1).
  const { history, settings } = variantData(ctx, to, variantKey);
  const experience = experienceFor(ctx, to);
  const hasHistory = history.some((h) => h.sets.some((s) => s.kind === 'work' && s.status === 'done'));
  let p = prescribe({ performedSetsOnly: input.profile.trainingPreferences?.loadRecommendationSource === 'performed_sets', exerciseId: to, mode: it.mode, sets: it.sets, role: it.role, experience, settings, history, gate, bodyweightKg: input.profile.bodyweightKg });
  let kind: LoadEstimationKind;
  let needsFamiliarity = false;
  let requiresConfirmation = false;
  let prior: SubstitutionMeta['prior'];
  let suggestion: number | null = null;
  if (hasHistory) {
    kind = p.reasons.some((r) => r.startsWith('CALIBRATED_FROM_USER')) ? 'calibration' : p.kg !== null || p.targetSeconds !== null ? 'target_observed' : 'none';
  } else if (settings?.estimate && p.kg !== null) {
    kind = 'target_estimated';
  } else {
    kind = 'none';
    const lp = relation?.load_prior;
    const srcE1rm = lp?.kind === 'population_ratio' ? sourceE1rm(ctx, from.exerciseId) : null;
    const restricted = priorRestricted(input.restrictions, [from.exerciseId, root, to], to);
    if (lp?.kind === 'population_ratio' && srcE1rm !== null && !gate.impactedRegion && !restricted && exercise(to).loadKind === 'external_kg') {
      if (args.familiarity === 'familiar') {
        const inc = p.incrementKg;
        const tentative = +(lp.ratio * srcE1rm).toFixed(3);
        const pct = Math.min(START_PCT[experience][it.mode], lp.first_exposure_cap, FIRST_EXPOSURE_MAX_PCT);
        const perHand = lp.basis === 'per_hand_total';
        let kg = roundDownKg((tentative * pct) / (perHand ? 2 : 1), inc);
        const maxLoad = settings?.maxLoadKg ?? null;
        if (maxLoad !== null && kg > maxLoad) kg = roundDownKg(maxLoad, inc);
        if (kg > 0) {
          kind = 'population_prior_low_confidence';
          requiresConfirmation = true;
          suggestion = kg;
          prior = { ratio: lp.ratio, sourceExerciseId: from.exerciseId, sourceE1rm: srcE1rm, tentativeE1rm: tentative, pct, perHand };
        }
      } else if (args.familiarity === undefined || args.familiarity === 'unknown') {
        needsFamiliarity = true;
      }
    }
    // Ingen giltig skattning: kontrollerad kalibrering, aldrig en påhittad siffra (§3.1 p.5).
    p = { ...p, kg: null, calibration: true };
  }
  const evidenceIds = [...new Set([...(relation?.evidence_ids ?? []), ...(prior && relation?.load_prior.kind === 'population_ratio' ? relation.load_prior.reference_ids : [])])];
  const reasons = [
    ...(relation ? [RELATION_CODE[relation.relation]] : sameExercise ? ['SUB_NEW_MACHINE_PROFILE'] : ['SUB_REVERT_TO_ORIGINAL']),
    KIND_CODE[kind],
    ...it.reasons,
    ...p.reasons,
    'USER_SWAP',
  ];
  const planned: PlannedExercise = {
    ...p,
    reasons: [...new Set(reasons)],
    confidence: kind === 'population_prior_low_confidence' ? 'low' : p.confidence,
    // Kedjade byten pekar på den ursprungligen planerade övningen (parregler, "återställ", "Använd framöver").
    substitutionFrom: to === root ? null : root,
    substitutionReason: 'USER_SWAP',
    acceptedByUserAt: input.nowUtc,
    loadEstimationKind: kind,
    calibrationSuggestionKg: suggestion,
    ...(exercise(to).requiresEquipmentProfile && variantKey !== 'default' ? { variantKey } : {}),
    substitution: {
      catalogVersion: SUBSTITUTION_CATALOG_VERSION,
      ruleSetVersion: RULESET_VERSION,
      relation: relation?.relation ?? 'same_exercise_new_profile',
      evidenceIds,
      ...(prior ? { prior } : {}),
      ...(args.replacesSessionExerciseId ? { replacesSessionExerciseId: args.replacesSessionExerciseId } : {}),
    },
  };
  // Slutkontroll efter föreskrift: relativ last kan göra övningen tung (02 §2) – stoppa hellre än att visa.
  if (!pairs.every((r) => heavyPairAllowed([...othersHeavy, toSessionExercise(planned), { ...toSessionExercise(planned), exerciseId: root }], r.a, r.b))) return fail('PAIR_RULE', relation);
  verifySubstitutionInvariants(planned);
  return { status: 'ok', planned, relation, needsFamiliarity, requiresConfirmation };
}

/**
 * SUB19: en hjälpskattning får aldrig presenteras utan markerad osäkerhet. Kastar vid brott.
 * Ingen vikt utan underlag: 'none' får varken kg eller förslag.
 */
export function verifySubstitutionInvariants(p: PlannedExercise): void {
  if (p.loadEstimationKind === 'population_prior_low_confidence') {
    if (p.confidence !== 'low' || !p.calibration || p.kg !== null || p.calibrationSuggestionKg == null || !p.reasons.includes('SUB_POPULATION_PRIOR_LOW_CONFIDENCE') || !p.substitution?.prior) {
      throw new Error('INVARIANT_PRIOR_UNMARKED');
    }
  } else if (p.calibrationSuggestionKg != null) {
    throw new Error('INVARIANT_SUGGESTION_WITHOUT_PRIOR');
  }
  if (p.loadEstimationKind === 'none' && (p.kg !== null || p.calibrationSuggestionKg != null)) throw new Error('INVARIANT_FABRICATED_KG');
}

export type SubstitutionCandidate = {
  exerciseId: ExerciseId;
  relation: SubstitutionRelation | null;
  result: ReplacementResult;
};

const RELATION_RANK: Record<RelationClass, number> = { near_variant: 0, movement_family: 1, accessory: 2 };

/**
 * Kandidater för "Byt övning" (§2.1 p.2–4): högst 3 prioriterade, tillåtna först; därefter övriga tillåtna
 * och ej tillåtna med skäl. Deterministisk ordning: relationsklass, egna data, favorit, ordning i seed-filen.
 */
export function substitutionCandidates(input: PlannerInput, from: PlannedExercise, others: PlannedExercise[], familiarity: Partial<Record<ExerciseId, Familiarity>> = {}): { suggested: SubstitutionCandidate[]; more: SubstitutionCandidate[] } {
  const rels = relationsFrom(from.exerciseId);
  const targets: Array<{ to: ExerciseId; relation: SubstitutionRelation | null }> = rels.filter((r) => !RETIRED_SLUGS.has(r.to)).map((r) => ({ to: r.to, relation: r }));
  if (from.substitutionFrom && !targets.some((t) => t.to === from.substitutionFrom)) targets.unshift({ to: from.substitutionFrom, relation: null });
  const ctx = makeCtx(input);
  const ownData = (to: ExerciseId) => ctx.history.some((h) => h.exerciseId === to) || !!settingsFor(ctx, to)?.estimate;
  const all = targets.map((t) => ({ ...t, result: planReplacement(input, { from, to: t.to, others, familiarity: familiarity[t.to] }) }));
  const score = (x: (typeof all)[number]) => [x.relation ? RELATION_RANK[x.relation.relation] : -1, ownData(x.to) ? 0 : 1, input.profile.favorites.includes(x.to) ? 0 : 1, x.relation ? x.relation.order : -1];
  const cmp = (a: (typeof all)[number], b: (typeof all)[number]) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return 0;
  };
  const allowed = all.filter((x) => x.result.status === 'ok').sort(cmp);
  const blocked = all.filter((x) => x.result.status !== 'ok').sort(cmp);
  const toCand = (x: (typeof all)[number]): SubstitutionCandidate => ({ exerciseId: x.to, relation: x.relation, result: x.result });
  return { suggested: allowed.slice(0, 3).map(toCand), more: [...allowed.slice(3), ...blocked].map(toCand) };
}

/** Beräknad tid för en lista föreskrifter (t.ex. återstående set efter byte). */
export function estimatedMinutesFor(exs: PlannedExercise[]): number {
  return minutesFor(exs.filter((e) => e.sets > 0));
}

export { isHeavy };
