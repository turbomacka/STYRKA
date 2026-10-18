/**
 * ÄA-BAL-001 "Balans" – autentiserad, ägarfiltrerad adapter (lokal databas per användare) runt det rena analyslagret.
 * Läsning är sidoeffektsfri: ingen revision, ingen omplanering, inga skrivningar. Förhandsvisning simulerar med
 * befintliga planeraren. Godkännande sker endast via befintliga profil- och revisionsflöden (idempotent, synkat).
 */
import { exercise, isExerciseId, type ExerciseId } from '../domain/catalog';
import { deriveBalanceOverview, DECISION_POLICY_VERSION, localDate, patternOf, STRENGTH_WINDOW_DAYS, type BalanceOverview, type BalanceSuggestion, type MainPattern, type StrengthSeriesInput } from '../domain/balance';
import { uuidFromSeed } from '../domain/hash';
import { heavyPairAllowed } from '../domain/heavyPair';
import { relationsFrom } from '../domain/substitutionCatalog';
import { activeSymptoms } from '../planner/history';
import { TIME_TOLERANCE_MIN } from '../planner/planner';
import type { LocalBalanceDecision } from '../storage/db';
import { balanceDecisionRow } from '../server/mapping';
import { AppError, outbox, type AppContext } from './context';
import { strengthSeries } from './history';
import { buildPlannerInput } from './plannerInput';
import { patchProfile } from './profile';
import { latestRevision, refreshFuturePlan, simulateFutureSlots, type PlanSlot } from './trainingPlan';

/** Antal kommande planplatser som en justering prövas och visas för. */
export const ADJUSTMENT_HORIZON = 12;
export const BALANCE_ACCEPT_REASON = 'USER_ACCEPTED_BALANCE_SUGGESTION';

/** Godkända substitutionsrelationer som kandidater (standard: appens substitutionskatalog). Kan injiceras i test. */
export type RelationProvider = (from: ExerciseId) => Array<{ to: ExerciseId }>;
const catalogRelations: RelationProvider = (from) => relationsFrom(from).map((r) => ({ to: r.to }));

export async function getBalanceOverview(ctx: AppContext, asOf: string = ctx.clock.now()): Promise<BalanceOverview> {
  const { db, userId } = ctx;
  const profile = await db.profile.get(userId);
  if (!profile) throw new AppError('NOT_FOUND');
  const input = await buildPlannerInput(db, userId, asOf);
  const [sessions, sessionExercises, sets, decisions, revision] = await Promise.all([db.sessions.toArray(), db.sessionExercises.toArray(), db.sets.toArray(), db.balanceDecisions.toArray(), latestRevision(ctx)]);
  // Styrkeobservationer återanvänds från Utvecklings befintliga serie (ingen ny e1RM-formel).
  const since = new Date(Date.parse(asOf) - STRENGTH_WINDOW_DAYS * 86_400_000).toISOString();
  const performed = [...new Set(sets.filter((s) => s.status === 'done' && !s.deleted && s.kind === 'work' && (s.occurredAt ?? '') >= since).map((s) => s.exerciseId))].filter((e) => isExerciseId(e)).sort();
  const strength: StrengthSeriesInput[] = [];
  for (const ex of performed) {
    const series = await strengthSeries(ctx, ex, since);
    strength.push({
      exerciseId: ex,
      loadKind: exercise(ex).loadKind,
      basis: exercise(ex).loadDisplayBasis,
      observations: series.points.filter((p) => (p.source === 'estimated' || p.source === 'measured') && p.sessionId).map((p) => ({ at: p.at, kg: p.kg, source: p.source as 'estimated' | 'measured', sessionId: p.sessionId! })),
    });
  }
  const overview = deriveBalanceOverview(
    {
      userId,
      timezone: profile.timezone || 'Europe/Stockholm',
      sessions: sessions.map((s) => ({
        id: s.id,
        kind: s.kind,
        status: s.status,
        startedAt: s.startedAt,
        plannedAtStart: s.kind === 'planned' && s.snapshot?.exercises?.length ? s.snapshot.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets })) : null,
        countsAsPlanned: !!s.countsAsPlannedAt,
      })),
      sessionExercises: sessionExercises.map((e) => ({ id: e.id, sessionId: e.sessionId, exerciseId: e.exerciseId, orderIndex: e.orderIndex, replacedById: e.replacedById })),
      sets: sets.map((s) => ({ id: s.id, sessionId: s.sessionId, sessionExerciseId: s.sessionExerciseId, exerciseId: s.exerciseId, kind: s.kind, status: s.status, deleted: s.deleted, actualReps: s.actualReps, actualSeconds: s.actualSeconds, occurredAt: s.occurredAt })),
      strength,
      restrictions: input.restrictions,
      activeSymptoms: activeSymptoms(input.symptoms, input.history),
      goals: profile.goals,
      activePlanRevisionId: revision?.id ?? null,
      decisions: decisions.map((d) => ({ candidateKey: d.candidateKey, basisKey: d.basisKey, status: d.status })),
    },
    asOf,
  );
  const observed = sets.filter((s) => !s.deleted && s.kind === 'work' && s.occurredAt && localDate(s.occurredAt, overview.timezone) >= overview.windowStartLocalDate && localDate(s.occurredAt, overview.timezone) <= overview.windowEndLocalDate);
  return { ...overview, partialWorkSets: observed.filter((s) => s.status === 'partial').length, sidePerformances: observed.flatMap((s) => s.detail?.performances ?? []).filter((p) => p.status === 'done' && p.side !== 'both').length };
}

export type SlotChange = { slotSequence: number; templateKey: string | null; removed: ExerciseId[]; added: ExerciseId[]; minutesBefore: number; minutesAfter: number };
export type AdjustmentPreview =
  | { status: 'proposal'; suggestion: BalanceSuggestion; from: ExerciseId; to: ExerciseId; substitutionKey: ExerciseId; changes: SlotChange[]; calibrationNeeded: boolean; reasonCode: 'BAL_PREVIEW_ONLY' }
  | { status: 'none'; suggestion: BalanceSuggestion; reasonCode: 'BAL_NO_SAFE_PLAN_ADJUSTMENT'; textSv: string };

const NO_ADJUSTMENT = 'Det går inte att föreslå en justering inom dina nuvarande ramar.';

/**
 * Aktuellt förslag. Matchar kandidatnyckeln, eller samma underlag (`basisKey`) om bara planrevisionen bytts i
 * bakgrunden sedan sidan visades. Annat underlag ⇒ förslaget har ändrats och måste visas på nytt.
 */
async function currentSuggestion(ctx: AppContext, candidateKey: string, basisKey?: string): Promise<BalanceSuggestion> {
  const o = await getBalanceOverview(ctx);
  const s = o.topSuggestion;
  if (!s || (s.candidateKey !== candidateKey && (!basisKey || s.basisKey !== basisKey))) throw new AppError('INVALID_STATE', 'BAL_CANDIDATE_CHANGED');
  return s;
}

/**
 * §7.1/§7.2 förhandsvisning utan sidoeffekter: byt i första hand ett icke prioriterat kompletteringsmoment i kommande
 * pass mot en redan godkänd substitution i luckans rörelsemönster. Prövas med befintliga planeraren och godtas bara om
 * mallsekvens, huvudlyft och tidsbudget bevaras, parregler håller och mönstret faktiskt får fler planerade set.
 */
export async function previewBalanceAdjustment(ctx: AppContext, candidateKey: string, opts: { relations?: RelationProvider; basisKey?: string } = {}): Promise<AdjustmentPreview> {
  const suggestion = await currentSuggestion(ctx, candidateKey, opts.basisKey);
  const profile = (await ctx.db.profile.get(ctx.userId))!;
  const relations = opts.relations ?? catalogRelations;
  const before = await simulateFutureSlots(ctx, ADJUSTMENT_HORIZON);
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const pairRules = input.restrictions.filter((r) => r.active && r.kind === 'block_pair_heavy' && r.exerciseA && r.exerciseB);
  const budget = profile.minutesPerSession + TIME_TOLERANCE_MIN;
  const gap = suggestion.patternId as MainPattern;
  const patternSets = (slots: PlanSlot[]) => slots.reduce((n, s) => n + s.exercises.filter((e) => patternOf(e.exerciseId) === gap).reduce((m, e) => m + e.sets, 0), 0);
  const tried = new Set<string>();
  for (const slot of before) {
    for (const e of slot.exercises) {
      const goalLift = (profile.goals as Record<string, number | undefined>)[e.exerciseId];
      if (!(e.role === 'accessory' || e.role === 'bonus') || patternOf(e.exerciseId) === gap || (goalLift ?? 0) > 0) continue;
      const root = e.substitutionFrom ?? e.exerciseId;
      for (const r of relations(e.exerciseId)) {
        if (patternOf(r.to) !== gap || tried.has(`${root}>${r.to}`)) continue;
        tried.add(`${root}>${r.to}`);
        const after = await simulateFutureSlots(ctx, ADJUSTMENT_HORIZON, { substitutions: { ...profile.substitutions, [root]: r.to } });
        const ok = after.every((s, i) => {
          const b = before[i];
          const mains = (x: PlanSlot) => x.exercises.filter((y) => y.role === 'main').map((y) => `${y.exerciseId}:${y.mode}:${y.sets}`).join();
          if (s.templateKey !== b.templateKey || mains(s) !== mains(b)) return false;
          if (s.estimatedMinutes > Math.max(budget, b.estimatedMinutes)) return false;
          if (b.planStatus === 'ok' && s.planStatus !== 'ok') return false;
          const list = s.exercises.map((y) => ({ exerciseId: y.exerciseId, mode: y.mode, sets: y.sets, isMarkedHeavy: y.mode === 'heavy' }));
          return pairRules.every((pr) => heavyPairAllowed(list, pr.exerciseA!, pr.exerciseB!));
        });
        if (!ok || patternSets(after) <= patternSets(before) || !after.some((s) => s.exercises.some((y) => y.exerciseId === r.to))) continue;
        const changes: SlotChange[] = after
          .map((s, i) => {
            const b = before[i];
            const bIds = b.exercises.map((y) => y.exerciseId);
            const aIds = s.exercises.map((y) => y.exerciseId);
            return { slotSequence: s.slotSequence, templateKey: s.templateKey, removed: bIds.filter((x) => !aIds.includes(x)), added: aIds.filter((x) => !bIds.includes(x)), minutesBefore: b.estimatedMinutes, minutesAfter: s.estimatedMinutes };
          })
          .filter((c) => c.removed.length || c.added.length);
        const calibrationNeeded = after.some((s) => s.exercises.some((y) => y.exerciseId === r.to && y.calibration));
        return { status: 'proposal', suggestion, from: e.exerciseId, to: r.to, substitutionKey: root, changes, calibrationNeeded, reasonCode: 'BAL_PREVIEW_ONLY' };
      }
    }
  }
  return { status: 'none', suggestion, reasonCode: 'BAL_NO_SAFE_PLAN_ADJUSTMENT', textSv: NO_ADJUSTMENT };
}

const decisionId = (ctx: AppContext, candidateKey: string) => uuidFromSeed(`baldec|${ctx.userId}|${candidateKey}`);

async function putDecision(ctx: AppContext, s: BalanceSuggestion, status: LocalBalanceDecision['status'], eventId: string): Promise<LocalBalanceDecision> {
  const { db } = ctx;
  const d: LocalBalanceDecision = { id: decisionId(ctx, s.candidateKey), candidateKey: s.candidateKey, basisKey: s.basisKey, patternId: s.patternId, status, policyVersion: DECISION_POLICY_VERSION, eventId, updatedAt: ctx.clock.now(), syncState: 'queued' };
  await db.transaction('rw', [db.balanceDecisions, db.outbox], async () => {
    await db.balanceDecisions.put(d);
    await db.outbox.add(outbox(ctx, d.id, { type: 'upsert', table: 'balance_suggestion_decisions', row: balanceDecisionRow(ctx.userId, d) }));
  });
  ctx.onQueued?.();
  return d;
}

/** Användarens aktiva avböjande ("Inte nu"/"Behåll min plan"). Idempotent; ändrar ingen träningsdata. */
export async function dismissBalanceSuggestion(ctx: AppContext, candidateKey: string, eventId: string, basisKey?: string): Promise<LocalBalanceDecision> {
  const existing = await ctx.db.balanceDecisions.get(decisionId(ctx, candidateKey));
  if (existing && (existing.status === 'dismissed' || existing.status === 'accepted')) return existing;
  const s = await currentSuggestion(ctx, candidateKey, basisKey);
  const again = await ctx.db.balanceDecisions.get(decisionId(ctx, s.candidateKey));
  if (again && (again.status === 'dismissed' || again.status === 'accepted')) return again;
  return putDecision(ctx, s, 'dismissed', eventId);
}

/**
 * Godkänd framtida planändring (§7.2): kräver oförändrad aktiv planrevision (versionskonflikt annars), sker via
 * befintlig profiländring ("Använd framöver"-mekanismen) och ger EN ny planrevision med orsak
 * USER_ACCEPTED_BALANCE_SUGGESTION. Upprepat anrop med samma kandidat är en no-op. Inga pass eller set ändras.
 */
export async function acceptBalanceAdjustment(ctx: AppContext, candidateKey: string, expectedRevisionId: string | null, eventId: string, opts: { relations?: RelationProvider } = {}): Promise<{ status: 'accepted' | 'already_accepted'; revisionId: string | null }> {
  const existing = await ctx.db.balanceDecisions.get(decisionId(ctx, candidateKey));
  if (existing?.status === 'accepted') return { status: 'already_accepted', revisionId: (await latestRevision(ctx))?.id ?? null };
  const current = await latestRevision(ctx);
  if ((current?.id ?? null) !== expectedRevisionId) throw new AppError('INVALID_STATE', 'PLAN_REVISION_CHANGED');
  const preview = await previewBalanceAdjustment(ctx, candidateKey, opts);
  if (preview.status !== 'proposal') throw new AppError('RULE_UNSATISFIABLE', 'BAL_NO_SAFE_PLAN_ADJUSTMENT');
  const profile = (await ctx.db.profile.get(ctx.userId))!;
  if (profile.substitutions[preview.substitutionKey] !== preview.to) await patchProfile(ctx, { substitutions: { ...profile.substitutions, [preview.substitutionKey]: preview.to } });
  await putDecision(ctx, preview.suggestion, 'accepted', eventId);
  const rev = await refreshFuturePlan(ctx, { extraReasons: [BALANCE_ACCEPT_REASON] });
  return { status: 'accepted', revisionId: rev?.id ?? null };
}
