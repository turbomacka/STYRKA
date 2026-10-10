/**
 * Deterministisk schemagenerator enligt 08 §2 och 02 §7–9.
 * Ren funktion: ingen Date.now, ingen slump, ingen I/O. Samma input + version ⇒ samma output.
 */
import { ENGINE_VERSION, estimateMinutes, isHeavy, urgencyForSpontaneous, validateHeavyPair, type ExerciseId, type Experience, type Mode } from '../domain/decision_engine';
import { CATALOG, CATALOG_VERSION, exercise, impactsAreas, isAvailable, type Area, type EquipmentSlug } from '../domain/catalog';
import { hashOf } from '../domain/hash';
import { PLANNER_VERSION, RULESET_VERSION, type PlanSnapshot, type PlanStatus, type PlannedExercise, type PlannerInput, type Readiness, type Role, type WarningCode } from '../domain/model';
import { prescribe } from '../domain/prescription';
import { activeSymptoms, capMode, gateFor, hoursSinceExercise, hoursSinceGroup, isBlocked, isLowerSensitive, modeRank, pastWork, ruleTargets } from './history';
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
  return ctx.input.exerciseSettings.find((s) => s.exerciseId === slug) ?? null;
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
    if (chosen && family.includes(chosen) && isAvailable(chosen, ctx.equipment)) {
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

/** 08 §2 steg 5: review_required tas bort; tung övning vid relevant arbete <48 h blir lätt. */
function applyRecovery(ctx: Ctx, items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const g = gateFor(it.slug, ctx.history, ctx.active, ctx.input.nowUtc);
    if (g.impactedRegion && ['persistent', 'limping', 'swelling'].includes(g.relevantSymptoms)) {
      remove(ctx, items, i--, 'SYMPTOM_REVIEW_REQUIRED');
      continue;
    }
    if (it.mode === 'heavy' && g.groupHours !== null && g.groupHours < 48) {
      it.mode = 'light';
      it.reasons.push(exercise(it.slug).recoveryGroup === 'lower' ? 'RECENT_LOWER_HEAVY' : 'RECENT_PATTERN_WORK', 'HEAVY_DOWNGRADED_TO_LIGHT');
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
    const a = items.find((x) => x.slug === pr.a);
    const b = items.find((x) => x.slug === pr.b);
    if (!a || !b || a.mode !== 'heavy' || b.mode !== 'heavy') continue;
    const [, lower] = [a, b].sort((x, y) => priorityScore(ctx, y) - priorityScore(ctx, x) || x.order - y.order);
    lower.mode = 'light';
    lower.reasons.push('PAIR_RULE_DOWNGRADED');
  }
}

function toSessionExercise(p: PlannedExercise) {
  return { exerciseId: p.exerciseId, mode: p.mode, sets: p.sets, plannedKg: p.kg, estimatedOneRM: p.estimatedOneRM, isMarkedHeavy: p.mode === 'heavy' };
}

function prescribeItem(ctx: Ctx, it: Item): PlannedExercise {
  const gate = gateFor(it.slug, ctx.history, ctx.active, ctx.input.nowUtc);
  const p = prescribe({
    exerciseId: it.slug,
    mode: it.mode,
    sets: it.sets,
    role: it.role,
    experience: experienceFor(ctx, it.slug),
    settings: settingsFor(ctx, it.slug),
    history: ctx.history.filter((h) => h.exerciseId === it.slug),
    gate,
    bodyweightKg: ctx.input.profile.bodyweightKg,
  });
  return { ...p, reasons: [...it.reasons, ...p.reasons], substitutionFrom: it.substitutionFrom, substitutionReason: it.substitutionReason, acceptedByUserAt: it.acceptedByUserAt };
}

/** 08 §2 steg 6–7: efter viktberäkning kan relativ last ≥75 % e1RM göra en övning tung (02 §2). */
function prescribeWithPairCheck(ctx: Ctx, items: Item[]): PlannedExercise[] {
  let planned = items.map((it) => prescribeItem(ctx, it));
  const rules = pairRules(ctx);
  for (let guard = 0; guard <= items.length * 2 + 2; guard++) {
    const violation = rules.find((r) => !validateHeavyPair(planned.map(toSessionExercise), r.a, r.b));
    if (!violation) return planned;
    const ia = planned.findIndex((p) => p.exerciseId === violation.a);
    const ib = planned.findIndex((p) => p.exerciseId === violation.b);
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
      return { mode: p.mode, sets: p.sets, kind, firstBarbell };
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
  if (exs.some((e) => e.reasons.includes('HEAVY_DOWNGRADED_TO_LIGHT') || e.state === 'caution')) w.push('WARN_RECOVERY');
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
    if (r.active && r.kind === 'block_pair_heavy' && r.exerciseA && r.exerciseB && !validateHeavyPair(snapshot.exercises.map(toSessionExercise), r.exerciseA, r.exerciseB)) {
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
  return finalize(ctx, { kind: 'planned', templateKey: key, rotationIndex: input.rotationIndex, readiness: null }, exs, exs.length ? status : 'empty', warnings);
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

  type Cand = { slug: ExerciseId; recent48: boolean; recentHeavy48: boolean; exposure7d: number; score: number; order: number };
  const cands: Cand[] = [];
  CATALOG.forEach((ex, order) => {
    const slug = ex.slug;
    if (!isAvailable(slug, ctx.equipment)) return;
    if (isBlocked(slug, input.restrictions)) {
      ctx.removed.push({ exerciseId: slug, reason: 'USER_RESTRICTION' });
      return;
    }
    const g = gateFor(slug, ctx.history, ctx.active, now);
    if (g.impactedRegion && ['persistent', 'limping', 'swelling'].includes(g.relevantSymptoms)) {
      ctx.removed.push({ exerciseId: slug, reason: 'SYMPTOM_REVIEW_REQUIRED' });
      return;
    }
    if (painAreas.length && impactsAreas(slug, painAreas)) {
      ctx.removed.push({ exerciseId: slug, reason: 'READINESS_PAIN_AREA' });
      return;
    }
    const groupH = hoursSinceGroup(ctx.history, slug, now);
    const heavyH = hoursSinceGroup(ctx.history, slug, now, { heavyOnly: true });
    const sevenDays = ctx.history.filter((h) => (Date.parse(now) - Date.parse(h.whenUtc)) / 3_600_000 <= 168 && (h.exerciseId === slug || (ex.recoveryGroup !== 'own' && exercise(h.exerciseId).recoveryGroup === ex.recoveryGroup)));
    const exposure7d = sevenDays.reduce((n, h) => n + h.sets.filter((s) => s.kind === 'work' && s.status === 'done').length, 0);
    const fav = input.profile.favorites.includes(slug) ? 1 : 0;
    const goal = input.profile.goals[slug] ?? (ex.priorityLift ? 1 : 0);
    const exH = hoursSinceExercise(ctx.history, slug, now);
    const overdue = ex.priorityLift && ctx.history.length > 0 && (exH === null || exH > OVERDUE_HOURS) ? 1 : 0;
    const chosenVariantPenalty = Object.entries(input.profile.substitutions).some(([from, to]) => from === slug && to !== slug) ? 1 : 0;
    cands.push({
      slug,
      recent48: groupH !== null && groupH < 48,
      recentHeavy48: heavyH !== null && heavyH < 48,
      exposure7d,
      score: fav * 6 + goal * 4 + overdue * 5 - exposure7d - chosenVariantPenalty * 20 - (ex.bonus ? 3 : 0),
      order,
    });
  });
  // Sortering: utan relevant belastning senaste 48 h först (08 §3), sedan prioritet/favorit och minst exponering, sist katalogordning.
  cands.sort((a, b) => Number(a.recent48) - Number(b.recent48) || b.score - a.score || a.order - b.order);

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
    if (!pick.recent48) reasons.push('LEAST_RECENT_PATTERN');
    if (input.profile.favorites.includes(pick.slug)) reasons.push('PREFERRED_MOVEMENT');
    let mode: Mode;
    if (ex.timeKind === 'isolation') mode = 'light';
    else if (idx === 0) {
      const heavyH = hoursSinceGroup(ctx.history, pick.slug, now, { heavyOnly: true });
      const sym = gateFor(pick.slug, ctx.history, ctx.active, now);
      const u = urgencyForSpontaneous({ minutes: opts.minutes, lastHeavyRelevantHours: heavyH, symptom: sym.impactedRegion ? sym.relevantSymptoms : 'none' });
      if (opts.readiness === 'good' && u.allowHeavy && !pick.recent48) mode = 'heavy';
      else if (opts.readiness === 'tired' || opts.readiness === 'pain') mode = 'light';
      else mode = pick.recent48 ? 'light' : 'moderate';
      if (!u.allowHeavy) reasons.push(u.reason === 'RECENT_HEAVY_PATTERN' && ex.recoveryGroup === 'lower' ? 'RECENT_LOWER_HEAVY' : u.reason);
    } else mode = opts.readiness === 'tired' || opts.readiness === 'pain' || pick.recent48 ? 'light' : 'moderate';
    if (pick.recent48 && ex.timeKind !== 'isolation') reasons.push(ex.recoveryGroup === 'lower' && pick.recentHeavy48 ? 'RECENT_LOWER_HEAVY' : 'RECENT_PATTERN_WORK');
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

export { isHeavy };
