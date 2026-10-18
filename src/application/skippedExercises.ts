import { exercise, type ExerciseId } from '../domain/catalog';
import { hashOf } from '../domain/hash';
import type { PlanSnapshot, PlannerInput } from '../domain/model';
import { planRegular, TIME_TOLERANCE_MIN } from '../planner/planner';
import { setCreatePayload, setPatchPayload, skipEventRow } from '../server/mapping';
import type { LocalSkipEvent, SkipReason } from '../storage/db';
import { AppError, outbox, type AppContext } from './context';
import { activeHealthConsent, buildPlannerInput } from './plannerInput';
import { compareSkipEvents, latestSkipEvents } from './skipState';

async function append(ctx: AppContext, data: Omit<LocalSkipEvent, 'id' | 'createdAt' | 'syncState'>): Promise<LocalSkipEvent> {
  const last = (await ctx.db.skipEvents.toArray()).sort(compareSkipEvents).at(-1)?.createdAt;
  const createdAt = new Date(Math.max(Date.parse(ctx.clock.now()), last ? Date.parse(last) + 1 : 0)).toISOString();
  const e: LocalSkipEvent = { ...data, id: ctx.ids.uuid(), createdAt, syncState: 'queued' };
  await ctx.db.skipEvents.add(e);
  await ctx.db.outbox.add(outbox(ctx, e.id, { type: 'upsert', table: 'exercise_skip_events', row: skipEventRow(ctx.userId, e), immutable: true }));
  return e;
}

export async function skipExercise(ctx: AppContext, sessionExerciseId: string, reason: SkipReason): Promise<void> {
  if (!['time', 'equipment', 'discomfort', 'other'].includes(reason)) throw new AppError('VALIDATION_ERROR');
  const { db } = ctx;
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.skipEvents, db.outbox, db.consents], async () => {
    const se = await db.sessionExercises.get(sessionExerciseId);
    const session = se && await db.sessions.get(se.sessionId);
    if (!se || se.replacedById || !session || !['in_progress', 'paused'].includes(session.status)) throw new AppError('INVALID_STATE');
    if (reason === 'discomfort' && !(await activeHealthConsent(db, ctx.userId))) throw new AppError('PRIVACY_CONSENT_REQUIRED');
    const sets = (await db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s) => s.kind === 'work' && !s.deleted);
    if (!sets.some((s) => s.status !== 'done')) throw new AppError('INVALID_STATE');
    const allSets = (await db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter((s) => !s.deleted);
    for (const before of allSets.filter((s) => s.status === 'planned' || s.status === 'partial' || s.detail?.rests.some((r) => r.outcome === 'active'))) {
      const performed = before.status === 'done' || before.detail?.performances.some((p) => p.status === 'done');
      const after = { ...before, status: performed ? before.status : 'skipped' as const, occurredAt: performed ? before.occurredAt : null,
        ...(before.detail ? { detail: { ...before.detail, aborted: before.status !== 'done', rests: before.detail.rests.map((r) => r.outcome === 'active' ? { ...r, outcome: 'dismissed' as const, endedAt: ctx.clock.now() } : r) } } : {}),
        updatedAt: ctx.clock.now(), createQueued: true, syncState: 'queued' as const };
      await db.sets.put(after);
      await db.outbox.add(outbox(ctx, after.id, { type: 'set', setId: after.id, create: !before.createQueued, payload: before.createQueued ? setPatchPayload(before, after) : setCreatePayload(after) }));
    }
    const previous = latestSkipEvents(await db.skipEvents.where('sessionExerciseId').equals(se.id).toArray())[0];
    if (previous?.action === 'skipped' && previous.reason === reason) return;
    await append(ctx, { sessionId: se.sessionId, sessionExerciseId: se.id, reason, action: 'skipped', programId: null, targetRotationIndex: null, replacesExerciseId: null });
  });
  ctx.onQueued?.();
}

export type CatchUpProposal = {
  event: LocalSkipEvent; exerciseId: ExerciseId; before: PlanSnapshot; after: PlanSnapshot;
  programId: string; rotation: number; replacesExerciseId: ExerciseId; signature: string;
};
export type CatchUpOverview = { proposal: CatchUpProposal | null; accepted: LocalSkipEvent | null; applied: PlanSnapshot['catchUp']; message: string | null };
const shape = (p: PlanSnapshot) => [p.templateKey, p.rotationIndex, p.budgetMinutes, p.status, p.exercises.map((e) => [e.exerciseId, e.mode, e.sets, e.reps, e.kg, e.targetSeconds, e.state])];

/** One optional adjustment from the most recently finished workout. Never accumulate a training debt. */
export async function catchUpOverview(ctx: AppContext): Promise<CatchUpOverview> {
  const { db } = ctx;
  const empty: CatchUpOverview = { proposal: null, accepted: null, applied: undefined, message: null };
  if (await db.sessions.where('status').anyOf(['in_progress', 'paused']).count()) return empty;
  const program = (await db.programs.where('active').equals(1).toArray())[0];
  if (!program || !(await db.profile.get(ctx.userId))) return empty;
  const input = await buildPlannerInput(db, ctx.userId, ctx.clock.now());
  const events = latestSkipEvents(await db.skipEvents.toArray());
  const accepted = events.filter((e) => e.action === 'accepted' && e.programId === program.id && e.targetRotationIndex === program.rotationIndex)
    .sort((a, b) => compareSkipEvents(b, a))[0];
  if (accepted) {
    const applied = planRegular(input).catchUp;
    return { ...empty, accepted, applied, message: applied ? null : 'Ditt tidigare val passar inte längre det aktuella underlaget. Det ordinarie passet visas.' };
  }
  const latest = (await db.sessions.toArray()).filter((s) => ['completed', 'partial', 'abandoned'].includes(s.status))
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') || b.id.localeCompare(a.id))[0];
  if (!latest) return empty;
  const before = planRegular({ ...input, catchUp: undefined });
  let message: string | null = null;
  const candidates = events.filter((e) => e.sessionId === latest.id && e.action === 'skipped' && (e.reason === 'time' || e.reason === 'equipment')).sort(compareSkipEvents);
  for (const event of candidates) {
    const se = await db.sessionExercises.get(event.sessionExerciseId);
    if (!se || se.replacedById) continue;
    if (await db.sets.where('exerciseId').equals(se.exerciseId).filter((s) => s.kind === 'work' && !s.deleted && (s.status === 'done' || !!s.detail?.performances.some((p) => p.status === 'done')) && (s.sessionId === se.sessionId || (s.occurredAt ?? '') >= event.createdAt)).count()) continue;
    if (before.exercises.some((e) => e.exerciseId === se.exerciseId)) {
      message ??= `${exercise(se.exerciseId).nameSv} finns redan i nästa pass. Inga extra set läggs till.`;
      continue;
    }
    const replaceable = before.exercises.filter((e) => e.role !== 'main' && !exercise(e.exerciseId).priorityLift).reverse();
    for (const replace of replaceable) {
      const catchUp: NonNullable<PlannerInput['catchUp']> = { sourceExerciseId: se.id, exerciseId: se.exerciseId, mode: se.mode, sets: se.snapshot.sets, substitutionFrom: se.snapshot.substitutionFrom, reason: event.reason as 'time' | 'equipment', decisionId: event.id, targetRotationIndex: program.rotationIndex, replacesExerciseId: replace.exerciseId };
      const after = planRegular({ ...input, catchUp });
      // Keep the reviewed change small: replace exactly one exercise, preserve all others including doses.
      const unchanged = before.exercises.filter((e) => e.exerciseId !== replace.exerciseId).every((e) => after.exercises.some((a) => a.exerciseId === e.exerciseId && a.mode === e.mode && a.sets === e.sets));
      if (!after.catchUp || !unchanged || after.exercises.length !== before.exercises.length || after.estimatedMinutes > after.budgetMinutes + TIME_TOLERANCE_MIN) continue;
      return { ...empty, proposal: { event, exerciseId: se.exerciseId, before, after, programId: program.id, rotation: program.rotationIndex, replacesExerciseId: replace.exerciseId, signature: hashOf([event.id, program.id, shape(before), shape(after)]) } };
    }
    message ??= `${exercise(se.exerciseId).nameSv} kan inte flyttas till nästa pass inom dina nuvarande ramar. Grundplanen fortsätter.`;
  }
  return { ...empty, message };
}

export async function acceptCatchUp(ctx: AppContext, proposal: CatchUpProposal): Promise<void> {
  const { db } = ctx;
  // Cover all planner inputs so an edit or pull cannot interleave with validation and acceptance.
  await db.transaction('rw', db.tables, async () => {
    const current = (await catchUpOverview(ctx)).proposal;
    if (!current || current.signature !== proposal.signature) throw new AppError('INVALID_STATE', 'PROPOSAL_CHANGED');
    const e = current.event;
    await append(ctx, { sessionId: e.sessionId, sessionExerciseId: e.sessionExerciseId, reason: e.reason, action: 'accepted', programId: current.programId, targetRotationIndex: current.rotation, replacesExerciseId: current.replacesExerciseId });
  });
  ctx.onQueued?.();
}

export async function dismissCatchUp(ctx: AppContext, event: LocalSkipEvent): Promise<void> {
  const { db } = ctx;
  await db.transaction('rw', [db.skipEvents, db.outbox, db.sessions, db.sessionExercises], async () => {
    if (!(await db.sessionExercises.get(event.sessionExerciseId))) throw new AppError('NOT_FOUND');
    if (await db.sessions.where('status').anyOf(['in_progress', 'paused']).count()) throw new AppError('INVALID_STATE');
    const current = latestSkipEvents(await db.skipEvents.where('sessionExerciseId').equals(event.sessionExerciseId).toArray())[0];
    if (current?.id !== event.id) throw new AppError('INVALID_STATE', 'PROPOSAL_CHANGED');
    await append(ctx, { sessionId: event.sessionId, sessionExerciseId: event.sessionExerciseId, reason: event.reason, action: 'dismissed', programId: null, targetRotationIndex: null, replacesExerciseId: null });
  });
  ctx.onQueued?.();
}
