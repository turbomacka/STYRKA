import { OFFERED_CATALOG, exercise, type ExerciseId } from '../domain/catalog';
import { planReplacement } from '../planner/planner';
import { modeRank, ruleTargets } from '../planner/history';
import type { PlannedExercise } from '../domain/model';
import type { LocalSessionExercise, LocalSet, LocalWorkoutOrderEvent } from '../storage/db';
import { sessionExerciseRow, workoutOrderEventRow } from '../server/mapping';
import { AppError, outbox, type AppContext } from './context';
import { buildPlannerInput } from './plannerInput';
import {
  abortTrainingSet,
  activeSession,
  detailFor,
  ensureWarmups,
  displayOrder,
  initialConfiguration,
  mutateSet,
  plannedSetsFor,
  setStatus,
  trainingTransaction,
} from './training';
import { requiredSides, type PerformanceSide } from '../domain/trainingFlow';

export async function editableSession(ctx: AppContext) {
  return (
    (await activeSession(ctx)) ??
    (await ctx.db.sessions.where('status').equals('preview').toArray()).sort((a, b) =>
      b.clientCreatedAt.localeCompare(a.clientCreatedAt),
    )[0]
  );
}

export async function beginPreparedSession(ctx: AppContext, id: string) {
  const pending = await ctx.db.sessions.get(id);
  if (pending?.status === 'preview') {
    const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
    const rows = (await ctx.db.sets.where('sessionId').equals(id).toArray()).filter((s) => !s.deleted && s.kind === 'work');
    const exercises = displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(id).toArray()).filter((e) =>
      rows.some((s) => s.sessionExerciseId === e.id),
    );
    for (const e of exercises) {
      const result = planReplacement(input, {
        from: e.snapshot,
        to: e.exerciseId,
        others: exercises.filter((x) => x.id !== e.id).map((x) => x.snapshot),
      });
      const limited = input.restrictions.some(
        (r) =>
          ruleTargets(r, e.exerciseId) &&
          ((r.kind === 'limit_sets' && r.maxSets !== null && rows.filter((s) => s.sessionExerciseId === e.id).length > r.maxSets) ||
            (r.kind === 'limit_mode' && r.maxMode !== null && modeRank(e.mode) > modeRank(r.maxMode))),
      );
      if (result.status !== 'ok' || limited) throw new AppError('RULE_UNSATISFIABLE', 'workout_needs_review');
    }
  }
  return trainingTransaction(ctx, async () => {
    const s = await ctx.db.sessions.get(id);
    if (!s) throw new AppError('NOT_FOUND');
    if (s.status !== 'preview') return s;
    if (await activeSession(ctx)) throw new AppError('INVALID_STATE', 'active_session_exists');
    const sets = await ctx.db.sets.where('sessionId').equals(id).toArray();
    if (!sets.some((x) => !x.deleted && x.kind === 'work')) throw new AppError('VALIDATION_ERROR', 'empty_workout');
    return setStatus(ctx, id, 'in_progress', { startedAt: ctx.clock.now() });
  });
}

async function requireEditable(ctx: AppContext, sessionId: string) {
  const s = await ctx.db.sessions.get(sessionId);
  if (!s || !['preview', 'in_progress', 'paused'].includes(s.status)) throw new AppError('INVALID_STATE');
}

/** Planning writes never touch actual values, occurrence times or completed sides. */
export async function editPlannedSet(
  ctx: AppContext,
  id: string,
  v: { grams?: number | null; reps?: number | null; seconds?: number | null; secondLoad?: number | null },
  side?: PerformanceSide,
) {
  return trainingTransaction(ctx, async () => {
    const s = await ctx.db.sets.get(id);
    if (!s || s.deleted) throw new AppError('NOT_FOUND');
    await requireEditable(ctx, s.sessionId);
    const saved = await mutateSet(ctx, id, (current, se) => {
      if (se.replacedById || current.status === 'done') throw new AppError('INVALID_STATE');
      const d = detailFor(current, se);
      const chosen = side ?? (requiredSides(d.configuration).length === 1 ? requiredSides(d.configuration)[0] : undefined);
      if (
        chosen &&
        (!requiredSides(d.configuration).includes(chosen) || d.performances.some((p) => p.side === chosen && p.status === 'done'))
      )
        throw new AppError('INVALID_STATE');
      if (!chosen && d.performances.some((p) => p.status === 'done')) throw new AppError('INVALID_STATE');
      const value = {
        grams: current.targetGrams,
        reps: current.targetReps,
        seconds: current.targetSeconds,
        secondLoad: d.targetSecondLoadValue ?? null,
        ...(chosen ? d.plannedSides?.[chosen] : {}),
        ...Object.fromEntries(Object.entries(v).filter(([, value]) => value !== undefined)),
      };
      for (const [key, max] of [
        ['grams', 500000],
        ['reps', 50],
        ['seconds', 900],
      ] as const)
        if (value[key] !== null && (!Number.isInteger(value[key]) || value[key]! < 0 || value[key]! > max))
          throw new AppError('VALIDATION_ERROR', key);
      if (value.secondLoad !== null && (!Number.isFinite(value.secondLoad) || value.secondLoad < 0 || value.secondLoad > 500))
        throw new AppError('VALIDATION_ERROR', 'secondLoad');
      if (d.warmupProposal) d.warmupProposal = { ...d.warmupProposal, managed: false };
      if (chosen) d.plannedSides = { ...d.plannedSides, [chosen]: value };
      const shared = !chosen || d.configuration.executionMode === 'bilateral';
      if (shared) {
        d.targetLoadValue = value.grams === null ? null : value.grams / 1000;
        d.targetSecondLoadValue = value.secondLoad;
      }
      return {
        ...current,
        detail: d,
        ...(shared
          ? {
              targetGrams: d.configuration.equipment.unit === 'kg' ? value.grams : null,
              targetReps: value.reps,
              targetSeconds: value.seconds,
            }
          : {}),
      };
    });
    if (s.kind === 'work') await ensureWarmups(ctx, s.sessionExerciseId);
    return saved;
  });
}

// Explicit deletion is separate from removing only the remaining part of an exercise.
// Tombstones preserve the recorded values for undo and use the existing mutation log.
export async function deleteTrainingSet(ctx: AppContext, id: string) {
  return trainingTransaction(ctx, async () => {
    const s = await ctx.db.sets.get(id);
    if (!s) throw new AppError('NOT_FOUND');
    await requireEditable(ctx, s.sessionId);
    for (const owner of await ctx.db.sets.where('sessionId').equals(s.sessionId).toArray()) {
      if (owner.detail?.rests.some((r) => r.outcome === 'active' && (owner.id === id || r.followingSetId === id)))
        await mutateSet(ctx, owner.id, (x) => ({ ...x, detail: { ...x.detail!, rests: x.detail!.rests.map((r) =>
          r.outcome === 'active' && (owner.id === id || r.followingSetId === id) ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : r) } }));
    }
    return mutateSet(ctx, id, (x) => ({ ...x, deleted: true }));
  });
}

/** Remove only unperformed work. A partial unilateral set keeps its completed side. */
export async function removeRemainingSet(ctx: AppContext, id: string) {
  return trainingTransaction(ctx, async () => {
    const s = await ctx.db.sets.get(id);
    if (!s) throw new AppError('NOT_FOUND');
    await requireEditable(ctx, s.sessionId);
    if (s.status === 'done') throw new AppError('INVALID_STATE');
    for (const owner of await ctx.db.sets.where('sessionId').equals(s.sessionId).toArray()) {
      if (owner.detail?.rests.some((r) => r.outcome === 'active' && r.followingSetId === id))
        await mutateSet(ctx, owner.id, (x) => ({
          ...x,
          detail: {
            ...x.detail!,
            rests: x.detail!.rests.map((r) =>
              r.outcome === 'active' && r.followingSetId === id ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : r,
            ),
          },
        }));
    }
    if (s.detail?.performances.some((p) => p.status === 'done')) return abortTrainingSet(ctx, id);
    return mutateSet(ctx, id, (x) => ({
      ...x,
      deleted: true,
      detail: x.detail
        ? {
            ...x.detail,
            rests: x.detail.rests.map((r) => (r.outcome === 'active' ? { ...r, outcome: 'dismissed', endedAt: ctx.clock.now() } : r)),
          }
        : undefined,
    }));
  });
}

export async function restorePlannedSet(ctx: AppContext, id: string) {
  return trainingTransaction(ctx, async () => {
    const s = await ctx.db.sets.get(id);
    if (!s) throw new AppError('NOT_FOUND');
    await requireEditable(ctx, s.sessionId);
    return mutateSet(ctx, id, (x, se) => {
      if (se.replacedById) throw new AppError('INVALID_STATE');
      return { ...x, deleted: false, detail: x.detail ? { ...x.detail, aborted: false } : undefined };
    });
  });
}

export async function removeRemainingExercise(ctx: AppContext, id: string) {
  return trainingTransaction(ctx, async () => {
    const se = await ctx.db.sessionExercises.get(id);
    if (!se) throw new AppError('NOT_FOUND');
    const ids: string[] = [];
    for (const s of await ctx.db.sets.where('sessionExerciseId').equals(id).toArray())
      if (!s.deleted && s.status !== 'done') {
        await removeRemainingSet(ctx, s.id);
        ids.push(s.id);
      }
    return ids;
  });
}

/** Immutable move events merge deterministically, including moves made offline. */
export function workoutOrder(exs: LocalSessionExercise[], events: LocalWorkoutOrderEvent[]) {
  const ordered = displayOrder(exs);
  const resolve = (id: string): string => {
    const seen = new Set<string>();
    let cur = id;
    while (!seen.has(cur)) {
      seen.add(cur);
      const next = exs.find((e) => e.id === cur)?.replacedById;
      if (!next) break;
      cur = next;
    }
    return cur;
  };
  for (const ev of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const from = ordered.findIndex((e) => e.id === resolve(ev.sessionExerciseId));
    if (from < 0) continue;
    const target = ev.beforeId ? resolve(ev.beforeId) : null;
    if (target === ordered[from].id || (target && !ordered.some((e) => e.id === target))) continue;
    const [moving] = ordered.splice(from, 1);
    const to = target ? ordered.findIndex((e) => e.id === target) : ordered.length;
    ordered.splice(to, 0, moving);
  }
  return ordered;
}

export async function moveExercise(ctx: AppContext, id: string, beforeId: string | null) {
  const db = ctx.db;
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.workoutOrderEvents, db.outbox], async () => {
    const se = await db.sessionExercises.get(id);
    if (!se) throw new AppError('NOT_FOUND');
    await requireEditable(ctx, se.sessionId);
    if (se.replacedById || (beforeId && (await db.sessionExercises.get(beforeId))?.sessionId !== se.sessionId))
      throw new AppError('INVALID_STATE');
    const sets = await db.sets.where('sessionExerciseId').equals(id).toArray();
    if (!sets.some((s) => !s.deleted && s.kind === 'work' && s.status !== 'done')) throw new AppError('INVALID_STATE');
    const previous = await db.workoutOrderEvents.where('sessionId').equals(se.sessionId).toArray();
    const createdAt = new Date(Math.max(Date.parse(ctx.clock.now()), ...previous.map((e) => Date.parse(e.createdAt) + 1))).toISOString();
    const event: LocalWorkoutOrderEvent = {
      id: ctx.ids.uuid(),
      sessionId: se.sessionId,
      sessionExerciseId: id,
      beforeId,
      createdAt,
      syncState: 'queued',
    };
    await db.workoutOrderEvents.add(event);
    await db.outbox.add(
      outbox(ctx, event.id, {
        type: 'upsert',
        table: 'workout_order_events',
        row: workoutOrderEventRow(ctx.userId, event),
        immutable: true,
      }),
    );
  });
  ctx.onQueued?.();
}

function additionSource(id: ExerciseId, sample: PlannedExercise): PlannedExercise {
  return {
    ...sample,
    exerciseId: id,
    loadKind: exercise(id).loadKind,
    mode: 'moderate',
    role: 'accessory',
    sets: 2,
    kg: null,
    estimatedOneRM: null,
    substitutionFrom: null,
    substitutionReason: null,
    substitution: undefined,
    configuration: undefined,
    reasons: [],
  };
}

export async function availableAdditions(ctx: AppContext, sessionId: string) {
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now());
  const exs = displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(sessionId).toArray());
  const sample = (await ctx.db.sessions.get(sessionId))?.snapshot.exercises[0];
  if (!sample) return [];
  return OFFERED_CATALOG.map((e) => ({
    exerciseId: e.slug,
    result: planReplacement(input, { from: additionSource(e.slug, sample), to: e.slug, others: exs.map((x) => x.snapshot) }),
  })).filter((x) => x.result.status === 'ok');
}

export async function addExercise(ctx: AppContext, sessionId: string, id: ExerciseId) {
  const result = (await availableAdditions(ctx, sessionId)).find((e) => e.exerciseId === id)?.result;
  if (!result?.planned) throw new AppError('RULE_UNSATISFIABLE');
  const p = {
    ...result.planned,
    substitutionFrom: null,
    substitutionReason: 'USER_ADDED',
    substitution: undefined,
    reasons: [...result.planned.reasons.filter((r) => !r.startsWith('SUB_') && r !== 'USER_SWAP'), 'USER_ADDED'],
  };
  return trainingTransaction(ctx, async () => {
    await requireEditable(ctx, sessionId);
    const all = await ctx.db.sessionExercises.where('sessionId').equals(sessionId).toArray();
    if (all.some((e) => !e.replacedById && e.exerciseId === id) || all.length >= 40) throw new AppError('INVALID_STATE');
    const se: LocalSessionExercise = {
      id: ctx.ids.uuid(),
      sessionId,
      exerciseId: id,
      variantKey: p.variantKey ?? 'default',
      orderIndex: Math.max(-1, ...all.filter((e) => e.orderIndex < 100).map((e) => e.orderIndex)) + 1,
      mode: p.mode,
      bandMin: p.bandMin,
      bandMax: p.bandMax,
      targetSets: p.sets,
      snapshot: p,
      configuration: initialConfiguration(p, await ctx.db.profile.get(ctx.userId), sessionId),
      replacedById: null,
      createdAt: ctx.clock.now(),
      syncState: 'queued',
    };
    await ctx.db.sessionExercises.add(se);
    await ctx.db.outbox.add(
      outbox(ctx, se.id, { type: 'upsert', table: 'session_exercises', row: sessionExerciseRow(ctx.userId, se), immutable: true }),
    );
    for (const set of plannedSetsFor(ctx, sessionId, se, ctx.clock.now())) {
      await ctx.db.sets.add(set);
      await mutateSet(ctx, set.id, (x) => ({ ...x, detail: detailFor(x, se) }));
    }
    return se;
  });
}

export const hasPerformed = (s: LocalSet) => s.status === 'done' || !!s.detail?.performances.some((p) => p.status === 'done');
