/**
 * ÄA-BAL-001 "Balans" – rent, deterministiskt analyslager (ingen nätverks-, klock- eller UI-åtkomst).
 *
 * Beskriver faktiskt utförd träning per versionsstyrt rörelsemönster, jämför genomförda ordinarie pass mot den
 * HISTORISKA plan som accepterades vid passets start, och gör försiktiga, metodhomogena jämförelser av befintliga
 * e1RM-observationer. Inga nya vikter, volymmål, riskpoäng eller medicinska bedömningar. Högst ett frivilligt
 * förslag (PLAN_PATTERN_GAP) enligt produktheuristiken i §7.1.
 */
import { CATALOG, exercise, impactsAreas, type ExerciseId, type LoadDisplayBasis, type LoadKind } from './catalog';
import { hashOf } from './hash';
import type { RestrictionRule, SymptomReport } from './model';
import { appSlug } from './substitutionCatalog';

export const PATTERN_POLICY_VERSION = 'balance-patterns/1.0.0';
export const DECISION_POLICY_VERSION = 'balance-decisions/1.0.0';

export const MAIN_PATTERNS = ['knee_dominant', 'hip_dominant', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'] as const;
export type MainPattern = (typeof MAIN_PATTERNS)[number];
export type BalancePatternId = MainPattern | 'accessory_upper' | 'trunk' | 'other';
export const ALL_PATTERNS: readonly BalancePatternId[] = [...MAIN_PATTERNS, 'accessory_upper', 'trunk', 'other'];

/**
 * Auktoritativ policy (§4) uttryckt med seed-filens sluggar; alias mappas till appens id via substitutionskatalogen.
 * Exakt ett primärt mönster per övning. Övningar som inte står här klassas `other` (aldrig tyst bortfall).
 */
const POLICY_SEED_SLUGS: Record<Exclude<BalancePatternId, 'other'>, string[]> = {
  knee_dominant: ['squat', 'front_squat', 'safety_bar_squat', 'smith_squat', 'hack_squat', 'goblet_squat', 'leg_press', 'split_squat', 'bulgarian_split_squat', 'step_up'],
  hip_dominant: ['deadlift', 'sumo_deadlift', 'trap_bar_deadlift', 'romanian_deadlift', 'dumbbell_romanian_deadlift', 'stiff_leg_deadlift'],
  horizontal_push: ['bench_press', 'dumbbell_flat_bench', 'smith_bench_press', 'machine_chest_press', 'incline_bench_press'],
  vertical_push: ['overhead_press', 'dumbbell_overhead_press', 'seated_barbell_press', 'machine_shoulder_press'],
  horizontal_pull: ['cable_row', 'chest_supported_row', 'seated_machine_row', 'one_arm_dumbbell_row', 'barbell_row'],
  vertical_pull: ['lat_pulldown', 'neutral_grip_lat_pulldown', 'assisted_pullup', 'pullup'],
  accessory_upper: ['cable_lateral_raise', 'dumbbell_lateral_raise', 'machine_lateral_raise', 'biceps_curl', 'dumbbell_curl', 'cable_curl', 'incline_dumbbell_curl', 'triceps_pushdown', 'rope_triceps_pushdown', 'overhead_triceps_extension'],
  trunk: ['plank', 'cable_crunch', 'machine_crunch', 'weighted_crunch'],
};

const PATTERN_BY_APP_ID: ReadonlyMap<string, BalancePatternId> = new Map(
  (Object.entries(POLICY_SEED_SLUGS) as Array<[BalancePatternId, string[]]>).flatMap(([p, slugs]) => slugs.map((s) => [appSlug(s), p] as const)),
);

/** Primärt rörelsemönster för ett övnings-id (även okända/historiska id ⇒ `other`). */
export function patternOf(exerciseId: string): BalancePatternId {
  return PATTERN_BY_APP_ID.get(exerciseId) ?? 'other';
}

export const PATTERN_SV: Record<BalancePatternId, string> = {
  knee_dominant: 'Knädominant',
  hip_dominant: 'Höftdominant',
  horizontal_push: 'Horisontell press',
  vertical_push: 'Vertikal press',
  horizontal_pull: 'Horisontellt drag',
  vertical_pull: 'Vertikalt drag',
  accessory_upper: 'Kompletterande överkropp',
  trunk: 'Bål',
  other: 'Övrigt/ej klassificerat',
};

/** Övningar i katalogen per mönster (för begränsningskontroll). */
export function exercisesOf(pattern: BalancePatternId): ExerciseId[] {
  return CATALOG.filter((c) => patternOf(c.slug) === pattern).map((c) => c.slug);
}

// ---------------------------------------------------------------------------
// Lokalt 28-dygnsfönster i IANA-tidszon (§3.1)
// ---------------------------------------------------------------------------

/** Minuter som tidszonen ligger före UTC vid ett givet ögonblick. */
function offsetMinutes(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ms / 1000) * 1000) / 60_000;
}

/** Lokalt datum (YYYY-MM-DD) för ett ögonblick. */
export function localDate(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  return new Date(ms + offsetMinutes(ms, tz) * 60_000).toISOString().slice(0, 10);
}

/** Ögonblicket (UTC) då ett lokalt kalenderdygn börjar – korrekt även vid sommartidsomställning. */
export function startOfLocalDay(date: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  let guess = naive - offsetMinutes(naive, tz) * 60_000;
  guess = naive - offsetMinutes(guess, tz) * 60_000;
  return new Date(guess).toISOString();
}

export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Senaste 28 kalenderdygnen inklusive idag: från lokal midnatt 27 dygn bakåt till asOf. */
export function balanceWindow(asOf: string, tz: string): { startUtc: string; endUtc: string; startLocalDate: string; endLocalDate: string } {
  const end = localDate(asOf, tz);
  const start = addLocalDays(end, -27);
  return { startUtc: startOfLocalDay(start, tz), endUtc: asOf, startLocalDate: start, endLocalDate: end };
}

// ---------------------------------------------------------------------------
// Indata och resultat
// ---------------------------------------------------------------------------

export type BalanceSessionInput = {
  id: string;
  /** Befintliga passtyper; endast 'planned' kan jämföras mot plan, 'extra' redovisas som utöver plan. */
  kind: string;
  status: string;
  startedAt: string | null;
  /** Accepterad plan vid passets start (snapshot.exercises i ordning) eller null om den saknas. */
  plannedAtStart: Array<{ exerciseId: string; sets: number }> | null;
  countsAsPlanned: boolean;
};
export type BalanceSessionExerciseInput = { id: string; sessionId: string; exerciseId: string; orderIndex: number; replacedById: string | null };
export type BalanceSetInput = { id: string; sessionId: string; sessionExerciseId: string; exerciseId: string; kind: string; status: string; deleted: boolean; actualReps: number | null; actualSeconds: number | null; occurredAt: string | null };
export type StrengthObservation = { at: string; kg: number; source: 'estimated' | 'measured'; sessionId: string };
export type StrengthSeriesInput = { exerciseId: string; loadKind: LoadKind; basis: LoadDisplayBasis; observations: StrengthObservation[] };

export type BalanceInput = {
  userId: string;
  timezone: string;
  sessions: BalanceSessionInput[];
  sessionExercises: BalanceSessionExerciseInput[];
  sets: BalanceSetInput[];
  strength: StrengthSeriesInput[];
  restrictions: RestrictionRule[];
  /** Redan aktiva symtom enligt befintlig regel (endast med giltigt samtycke). */
  activeSymptoms: SymptomReport[];
  goals: Partial<Record<string, number>>;
  activePlanRevisionId: string | null;
  decisions: Array<{ candidateKey: string; basisKey: string; status: 'dismissed' | 'accepted' | 'previewed' | 'invalidated' }>;
};

export type BalancePatternSummary = {
  patternId: BalancePatternId;
  actualWorkSets28d: number;
  actualSessionCount28d: number;
  eligiblePlannedWorkSets: number | null;
  matchedCompletedWorkSets: number | null;
  extraWorkSets28d: number;
  supportingSetIds: string[];
  supportingWorkoutIds: string[];
  dataQuality: 'complete' | 'partial' | 'insufficient';
};

export type BalanceInsight = {
  kind: 'descriptive' | 'positive' | 'optional_action' | 'limitation';
  reasonCode: string;
  textSv: string;
  supportingSourceIds: string[];
  decisionPolicyVersion: string;
  evidenceLevel: 'observed' | 'descriptive_rule' | 'product_heuristic';
};

export type BalanceSuggestion = BalanceInsight & { candidateKey: string; basisKey: string; patternId: MainPattern; planned: number; matched: number; plannedTaskIds: string[] };

export type BalanceOverview = {
  asOf: string;
  timezone: string;
  patternPolicyVersion: string;
  decisionPolicyVersion: string;
  historyRevisionOrHash: string;
  windowStartLocalDate: string;
  windowEndLocalDate: string;
  hasData: boolean;
  sessionCount28d: number;
  summaries: BalancePatternSummary[];
  insights: BalanceInsight[];
  progressComparisons: BalanceInsight[];
  recoveryStatus: 'not_evaluated' | 'no_block' | 'limited' | 'review_required';
  topSuggestion?: BalanceSuggestion;
  /** Kvalificerade men undertryckta luckor (spårbarhet; visas inte som förslag). */
  suppressed: Array<{ patternId: MainPattern; reasonCode: string }>;
  headlineSv: string;
};

// Produktheuristiker §7.1 och §5 (H) – versionssatta, ej kliniskt validerade.
export const GAP_MIN_SESSIONS = 2;
export const GAP_MIN_PLANNED = 4;
export const GAP_MIN_MISSING = 3;
export const GAP_MAX_RATIO = 0.7;
export const STRENGTH_WINDOW_DAYS = 84;
export const STRENGTH_MIN_OBS = 3;
export const STRENGTH_MIN_SPAN_DAYS = 42;
/** "Ligger nära valt upplägg": minst två jämförbara pass, minst 8 planerade set och minst 90 % matchade (H). */
const ADHERENCE_MIN_SESSIONS = 2;
const ADHERENCE_MIN_PLANNED = 8;
const ADHERENCE_MIN_RATIO = 0.9;
/** "Täcker flera rörelsemönster": minst tre av de sex huvudmönstren har utförda set (beskrivande, H). */
const COVERAGE_MIN_PATTERNS = 3;

const isValidDone = (s: BalanceSetInput) => s.kind === 'work' && s.status === 'done' && !s.deleted && ((s.actualReps ?? 0) > 0 || (s.actualSeconds ?? 0) > 0) && !!s.occurredAt;
const SEVERE = new Set(['persistent', 'limping', 'swelling']);
const insight = (kind: BalanceInsight['kind'], reasonCode: string, textSv: string, supportingSourceIds: string[], evidenceLevel: BalanceInsight['evidenceLevel']): BalanceInsight => ({ kind, reasonCode, textSv, supportingSourceIds, decisionPolicyVersion: DECISION_POLICY_VERSION, evidenceLevel });
const numSv = (n: number) => ['noll', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'][n] ?? String(n);
const dateSv = (iso: string, tz: string) => {
  const [y, m, d] = localDate(iso, tz).split('-').map(Number);
  return `${d} ${['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][m - 1]} ${y}`;
};

/** §8: deterministisk balansöversikt. Samma indata + asOf + policyversioner ⇒ identisk output. */
export function deriveBalanceOverview(input: BalanceInput, asOf: string): BalanceOverview {
  const tz = input.timezone;
  const win = balanceWindow(asOf, tz);
  const inWindow = (iso: string | null) => !!iso && iso >= win.startUtc && iso <= win.endUtc;
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const exById = new Map(input.sessionExercises.map((e) => [e.id, e]));

  // 1–3. Faktiskt utförda arbetsset i fönstret, ett primärt mönster per set, inga dubbletter.
  const seenSet = new Set<string>();
  const sets = [...input.sets]
    .filter((s) => sessions.has(s.sessionId) && isValidDone(s) && inWindow(s.occurredAt))
    .filter((s) => (seenSet.has(s.id) ? false : (seenSet.add(s.id), true)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const historyHash = hashOf({ sets: sets.map((s) => [s.id, s.exerciseId, s.sessionExerciseId, s.occurredAt]), sessions: input.sessions.map((s) => [s.id, s.kind, s.status, s.startedAt, s.countsAsPlanned, s.plannedAtStart]) });

  const base = { asOf, timezone: tz, patternPolicyVersion: PATTERN_POLICY_VERSION, decisionPolicyVersion: DECISION_POLICY_VERSION, historyRevisionOrHash: historyHash, windowStartLocalDate: win.startLocalDate, windowEndLocalDate: win.endLocalDate };
  const recoveryStatus = recovery(input);
  const progressComparisons = strengthComparisons(input, asOf);
  if (!sets.length) {
    return { ...base, hasData: false, sessionCount28d: 0, summaries: [], insights: [insight('limitation', 'BAL_NO_DATA', 'När du har genomfört några pass kan du se hur träningen fördelas mellan olika rörelser.', [], 'observed')], progressComparisons, recoveryStatus, suppressed: [], headlineSv: 'Se hur din träning är fördelad' };
  }

  const acc = new Map<BalancePatternId, { sets: string[]; sessions: Set<string>; planned: number; matched: number; extra: number; comparable: boolean; missing: boolean; plannedSessions: Set<string>; taskIds: string[]; matchedSetIds: string[] }>();
  const get = (p: BalancePatternId) => {
    let a = acc.get(p);
    if (!a) acc.set(p, (a = { sets: [], sessions: new Set(), planned: 0, matched: 0, extra: 0, comparable: false, missing: false, plannedSessions: new Set(), taskIds: [], matchedSetIds: [] }));
    return a;
  };
  for (const s of sets) {
    const a = get(patternOf(s.exerciseId));
    a.sets.push(s.id);
    a.sessions.add(s.sessionId);
  }

  // 4–5. Matchning mot historisk accepterad plan i genomförda ordinarie pass (aldrig dagens framtidsplan).
  const setsBySe = new Map<string, BalanceSetInput[]>();
  for (const s of sets) setsBySe.set(s.sessionExerciseId, [...(setsBySe.get(s.sessionExerciseId) ?? []), s]);
  const replacedFrom = new Map<string, string>();
  for (const e of input.sessionExercises) if (e.replacedById) replacedFrom.set(e.replacedById, e.id);
  const chainOf = (rootId: string) => {
    const out: string[] = [];
    let cur: string | undefined = rootId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      out.push(cur);
      cur = exById.get(cur)?.replacedById ?? undefined;
    }
    return out;
  };
  const accounted = new Set<string>();
  let comparableSessions = 0;
  let missingSessions = 0;
  const sessionsInWindow = new Set(sets.map((s) => s.sessionId));
  for (const sid of [...sessionsInWindow].sort()) {
    const sess = sessions.get(sid)!;
    const ordinary = sess.kind === 'planned' && (sess.status === 'completed' || sess.status === 'partial') && inWindow(sess.startedAt);
    if (!ordinary) continue;
    const exs = input.sessionExercises.filter((e) => e.sessionId === sid);
    if (!sess.plannedAtStart || !sess.plannedAtStart.length) {
      missingSessions++;
      for (const s of sets.filter((x) => x.sessionId === sid)) {
        get(patternOf(s.exerciseId)).missing = true;
        accounted.add(s.id);
      }
      continue;
    }
    comparableSessions++;
    sess.plannedAtStart.forEach((task, i) => {
      const root = exs.find((e) => e.orderIndex === i && !replacedFrom.has(e.id)) ?? exs.find((e) => e.orderIndex === i);
      const pattern = patternOf(task.exerciseId);
      const a = get(pattern);
      a.comparable = true;
      a.planned += task.sets;
      a.plannedSessions.add(sid);
      if (root) a.taskIds.push(root.id);
      const chainSets = root ? chainOf(root.id).flatMap((id) => setsBySe.get(id) ?? []) : [];
      const same = chainSets.filter((s) => patternOf(s.exerciseId) === pattern).sort((x, y) => (x.occurredAt ?? '').localeCompare(y.occurredAt ?? '') || x.id.localeCompare(y.id));
      const credited = same.slice(0, task.sets);
      a.matched += credited.length;
      a.matchedSetIds.push(...credited.map((s) => s.id));
      for (const s of credited) accounted.add(s.id);
      // Utöver planerat antal, eller utförd i annat mönster (substitution), redovisas som "utöver plan".
      for (const s of chainSets) {
        if (accounted.has(s.id)) continue;
        get(patternOf(s.exerciseId)).extra++;
        accounted.add(s.id);
      }
    });
    for (const s of sets.filter((x) => x.sessionId === sid && !accounted.has(x.id))) {
      get(patternOf(s.exerciseId)).extra++;
      accounted.add(s.id);
    }
  }
  // Spontanpass och övriga ej planmatchade set: utöver plan, aldrig krediterade som planerade.
  for (const s of sets) {
    if (accounted.has(s.id)) continue;
    const sess = sessions.get(s.sessionId)!;
    if (sess.kind === 'extra') get(patternOf(s.exerciseId)).extra++;
  }

  const summaries: BalancePatternSummary[] = ALL_PATTERNS.filter((p) => (MAIN_PATTERNS as readonly string[]).includes(p) || (acc.get(p)?.sets.length ?? 0) > 0 || (acc.get(p)?.planned ?? 0) > 0).map((p) => {
    const a = acc.get(p);
    const comparable = comparableSessions > 0;
    return {
      patternId: p,
      actualWorkSets28d: a?.sets.length ?? 0,
      actualSessionCount28d: a?.sessions.size ?? 0,
      eligiblePlannedWorkSets: comparable ? (a?.planned ?? 0) : null,
      matchedCompletedWorkSets: comparable ? (a?.matched ?? 0) : null,
      extraWorkSets28d: a?.extra ?? 0,
      supportingSetIds: [...(a?.sets ?? [])].sort(),
      supportingWorkoutIds: [...(a?.sessions ?? [])].sort(),
      dataQuality: !a || (!a.sets.length && !a.planned) ? 'insufficient' : a.missing || missingSessions > 0 ? 'partial' : 'complete',
    };
  });

  const insights: BalanceInsight[] = [];
  const sessionCount = sessionsInWindow.size;
  insights.push(insight('positive', 'BAL_SESSIONS_OBSERVED', `Du har genomfört ${numSv(sessionCount)} träningspass under de senaste 28 dagarna.`, [...sessionsInWindow].sort(), 'observed'));
  const coverageCount = MAIN_PATTERNS.filter((p) => (acc.get(p)?.sets.length ?? 0) > 0).length;
  if (coverageCount >= COVERAGE_MIN_PATTERNS) insights.push(insight('positive', 'BAL_PATTERN_COVERAGE', `Din träning täcker ${numSv(coverageCount)} av sex rörelsemönster.`, [], 'descriptive_rule'));
  if (missingSessions > 0) insights.push(insight('limitation', 'BAL_NO_PLAN_SNAPSHOT', 'Vi kan visa vad du har tränat, men saknar äldre planunderlag för en rättvis jämförelse.', [], 'observed'));
  const totPlanned = [...acc.values()].reduce((n, a) => n + a.planned, 0);
  const totMatched = [...acc.values()].reduce((n, a) => n + a.matched, 0);
  if (missingSessions === 0 && comparableSessions >= ADHERENCE_MIN_SESSIONS && totPlanned >= ADHERENCE_MIN_PLANNED && totMatched / totPlanned >= ADHERENCE_MIN_RATIO) {
    insights.push(insight('positive', 'BAL_PATTERN_COVERAGE', 'Din genomförda träning ligger nära det upplägg du valt.', [], 'product_heuristic'));
  }

  // 7–10. Kandidater (§7.1) – filtreras mot spärrar, användarval och tidigare beslut.
  const suppressed: BalanceOverview['suppressed'] = [];
  const candidates: BalanceSuggestion[] = [];
  for (const p of MAIN_PATTERNS) {
    const a = acc.get(p);
    if (!a || !a.comparable || a.missing) continue;
    const missing = a.planned - a.matched;
    if (!(a.plannedSessions.size >= GAP_MIN_SESSIONS && a.planned >= GAP_MIN_PLANNED && missing >= GAP_MIN_MISSING && a.matched / a.planned < GAP_MAX_RATIO)) continue;
    const block = blockerFor(input, p);
    if (block) {
      suppressed.push({ patternId: p, reasonCode: block });
      continue;
    }
    const candidateKey = hashOf([input.userId, DECISION_POLICY_VERSION, input.activePlanRevisionId, p, [...a.matchedSetIds].sort(), [...a.taskIds].sort()]);
    const basisKey = hashOf([input.userId, DECISION_POLICY_VERSION, p, [...a.matchedSetIds].sort(), [...a.taskIds].sort()]);
    // Avböjt gäller samma kandidatnyckel; godkänt gäller samma underlag (annars dyker förslaget upp direkt i nästa planrevision).
    const decided = input.decisions.find((d) => (d.status === 'dismissed' && d.candidateKey === candidateKey) || (d.status === 'accepted' && d.basisKey === basisKey));
    if (decided) {
      suppressed.push({ patternId: p, reasonCode: decided.status === 'dismissed' ? 'BAL_DISMISSED' : 'BAL_ACCEPTED' });
      continue;
    }
    const name = PATTERN_SV[p].toLowerCase();
    candidates.push({
      ...insight('optional_action', 'BAL_PLAN_PATTERN_GAP', `Du har tränat mindre ${name} än planerat i dina genomförda pass (${a.matched} av ${a.planned} planerade arbetsset). Vill du se en möjlig justering inom din vanliga träningstid?`, [...a.matchedSetIds].sort(), 'product_heuristic'),
      candidateKey,
      basisKey,
      patternId: p,
      planned: a.planned,
      matched: a.matched,
      plannedTaskIds: [...a.taskIds].sort(),
    });
  }
  candidates.sort((x, y) => y.planned - y.matched - (x.planned - x.matched) || x.patternId.localeCompare(y.patternId));
  const topSuggestion = candidates[0];
  for (const s of suppressed) {
    if (s.reasonCode === 'BAL_RESTRICTION_SUPPRESSED') insights.push(insight('limitation', s.reasonCode, 'Det finns en aktuell begränsning. Förslag som påverkar området visas inte som automatiska ökningar.', [], 'descriptive_rule'));
    if (s.reasonCode === 'BAL_REVIEW_REQUIRED') insights.push(insight('limitation', s.reasonCode, 'Du har rapporterat besvär som ännu inte är markerade som lösta. Balans föreslår därför inga ökningar som berör området.', [], 'descriptive_rule'));
    if (s.reasonCode === 'BAL_USER_DEPRIORITIZED') insights.push(insight('descriptive', s.reasonCode, `${PATTERN_SV[s.patternId]} har tränats mindre än planerat, i linje med den prioritering du valt.`, [], 'observed'));
  }

  const headlineSv = topSuggestion
    ? `Möjligt nästa steg: ${PATTERN_SV[topSuggestion.patternId].toLowerCase()}`
    : coverageCount >= COVERAGE_MIN_PATTERNS
      ? 'Din träning täcker flera rörelsemönster'
      : 'Se hur din träning är fördelad';

  return { ...base, hasData: true, sessionCount28d: sessionCount, summaries, insights: dedupe(insights), progressComparisons, recoveryStatus, topSuggestion, suppressed, headlineSv };
}

function dedupe(list: BalanceInsight[]): BalanceInsight[] {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.textSv) ? false : (seen.add(i.textSv), true)));
}

/** §6/§7.1: användarspärr, olöst review_required och uttalad bortprioritering går före varje förslag. */
function blockerFor(input: BalanceInput, p: MainPattern): string | null {
  const exs = exercisesOf(p);
  if (input.activeSymptoms.some((s) => SEVERE.has(s.reaction) && exs.some((e) => impactsAreas(e, [s.area])))) return 'BAL_REVIEW_REQUIRED';
  const restricted = input.restrictions.some((r) => r.active && (exs.some((e) => r.exerciseA === e || r.exerciseB === e) || (!!r.area && exs.some((e) => impactsAreas(e, [r.area!])))));
  if (restricted) return 'BAL_RESTRICTION_SUPPRESSED';
  // Målprioritet 0 för ett prioriterat lyft i mönstret = uttryckligt avstående.
  if (Object.entries(input.goals).some(([lift, prio]) => prio === 0 && patternOf(lift) === p)) return 'BAL_USER_DEPRIORITIZED';
  return null;
}

function recovery(input: BalanceInput): BalanceOverview['recoveryStatus'] {
  if (input.activeSymptoms.some((s) => SEVERE.has(s.reaction))) return 'review_required';
  if (input.restrictions.some((r) => r.active) || input.activeSymptoms.length) return 'limited';
  return 'no_block';
}

/** §5: endast session-härledda e1RM-observationer, samma lastsemantik, ≥3 pass och ≥42 dagars spann inom 12 veckor. */
function strengthComparisons(input: BalanceInput, asOf: string): BalanceInsight[] {
  const from = new Date(Date.parse(asOf) - STRENGTH_WINDOW_DAYS * 86_400_000).toISOString();
  type Q = { exerciseId: string; basis: LoadDisplayBasis; first: StrengthObservation; last: StrengthObservation; n: number; pct: number };
  const qualified: Q[] = [];
  for (const s of input.strength) {
    if (s.loadKind !== 'external_kg') continue; // assistans/kroppsvikt/tid jämförs aldrig procentuellt
    const obs = s.observations.filter((o) => o.source === 'estimated' && o.kg > 0 && o.at >= from && o.at <= asOf).sort((a, b) => a.at.localeCompare(b.at) || a.sessionId.localeCompare(b.sessionId));
    const bySession = new Map(obs.map((o) => [o.sessionId, o]));
    const uniq = [...bySession.values()].sort((a, b) => a.at.localeCompare(b.at));
    if (uniq.length < STRENGTH_MIN_OBS) continue;
    const first = uniq[0];
    const last = uniq[uniq.length - 1];
    if ((Date.parse(last.at) - Date.parse(first.at)) / 86_400_000 < STRENGTH_MIN_SPAN_DAYS) continue;
    qualified.push({ exerciseId: s.exerciseId, basis: s.basis, first, last, n: uniq.length, pct: (100 * (last.kg - first.kg)) / first.kg });
  }
  if (!qualified.length) return [insight('limitation', 'BAL_STRENGTH_NOT_COMPARABLE', 'Vi behöver fler jämförbara prestationer innan vi kan jämföra utvecklingen mellan övningar.', [], 'descriptive_rule')];
  // Jämför bara inom samma lastsemantik (t.ex. inte kg per hantel mot total kg).
  const groups = new Map<string, Q[]>();
  for (const q of qualified) groups.set(q.basis, [...(groups.get(q.basis) ?? []), q]);
  const chosen = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] === 'total_kg' ? -1 : b[0] === 'total_kg' ? 1 : a[0].localeCompare(b[0])))[0][1];
  const top = chosen.sort((a, b) => b.n - a.n || a.exerciseId.localeCompare(b.exerciseId)).slice(0, 3);
  const tz = input.timezone;
  const out = top.map((q) => {
    const sign = q.pct > 0 ? '+' : q.pct < 0 ? '−' : '±';
    const name = exercise(q.exerciseId as ExerciseId).nameSv;
    return insight('descriptive', 'BAL_STRENGTH_CHANGE', `${name} ${sign}${Math.abs(Math.round(q.pct))} % uppskattad maxstyrka (${dateSv(q.first.at, tz)} → ${dateSv(q.last.at, tz)}, ${q.n} pass)`, [q.first.sessionId, q.last.sessionId], 'observed');
  });
  if (top.length < 2) out.push(insight('limitation', 'BAL_STRENGTH_NOT_COMPARABLE', 'Det finns ännu inte tillräckligt jämförbara observationer för att jämföra utvecklingstakten.', [], 'descriptive_rule'));
  return out;
}
