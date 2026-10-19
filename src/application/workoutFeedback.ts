import type { AppContext } from './context';
import { chooseFeedback, feedbackCategory } from '../domain/workoutFeedback';
import { effectiveRir } from '../domain/effort';

export type SavedWorkoutFeedback = { text: string; sessionId: string; category: string; createdAt: string };
export async function savedWorkoutFeedback(ctx: AppContext, id: string): Promise<SavedWorkoutFeedback> {
  return ctx.db.transaction('rw', [ctx.db.meta, ctx.db.sessions, ctx.db.sets, ctx.db.sessionExercises], async () => {
    const key = `workout-feedback:${id}`;
    const existing = await ctx.db.meta.get(key);
    if (existing) return existing.value as SavedWorkoutFeedback;
    const session = await ctx.db.sessions.get(id);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    const all = (await ctx.db.sets.toArray()).filter((s) => !s.deleted && s.kind === 'work');
    const sets = all.filter((s) => s.sessionId === id);
    const perf = sets.flatMap((s) => s.detail?.performances.filter((p) => p.status === 'done') ?? []);
    const history = (await ctx.db.sessions.toArray())
      .filter(
        (s) =>
          s.id !== id &&
          s.finishedAt &&
          s.finishedAt < (session.finishedAt ?? ctx.clock.now()) &&
          all.some((x) => x.sessionId === s.id && x.status === 'done'),
      )
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    // Only the latest comparable session is a baseline. An old easy set cannot imply new progress.
    const improved = perf.some((p) => {
      if (p.loadValue === null || p.repetitions === null || p.technique !== 'controlled' || effectiveRir(p.rir, p.effort) == null)
        return false;
      for (const prior of history) {
        const comparable = all
          .filter((s) => s.sessionId === prior.id)
          .flatMap((s) => s.detail?.performances ?? [])
          .filter(
            (o) =>
              o.status === 'done' &&
              o.comparisonKey === p.comparisonKey &&
              o.side === p.side &&
              o.loadValue !== null &&
              o.repetitions !== null &&
              o.technique === 'controlled' &&
              effectiveRir(o.rir, o.effort) === effectiveRir(p.rir, p.effort),
          );
        if (comparable.length) return comparable.every((o) => p.loadValue! > o.loadValue! && p.repetitions! >= o.repetitions!);
      }
      return false;
    });
    const exs = await ctx.db.sessionExercises.where('sessionId').equals(id).toArray();
    const performed = sets.filter((s) => s.status === 'done' || s.detail?.performances.some((p) => p.status === 'done')).length;
    const category = feedbackCategory({
      performed,
      complete: session.status === 'completed',
      improved,
      adjusted: sets.some(
        (s) =>
          s.status === 'done' &&
          s.actualGrams !== null &&
          s.targetGrams !== null &&
          s.actualGrams < Math.max(s.targetGrams, (exs.find((e) => e.id === s.sessionExerciseId)?.snapshot.kg ?? 0) * 1000),
      ),
      demanding: perf.filter((p) => p.effort === 'hard' || p.effort === 'maximal' || p.effort === 'too_heavy').length >= 2,
      substituted: exs.some((e) => !!e.replacedById),
      partial: session.status === 'partial' || session.status === 'abandoned',
      returning:
        !!history[0]?.finishedAt && Date.parse(session.startedAt ?? ctx.clock.now()) - Date.parse(history[0].finishedAt) >= 21 * 86400000,
    });
    const recent = ((await ctx.db.meta.get('recent-workout-feedback'))?.value ?? []) as string[];
    const seed = parseInt(ctx.ids.uuid().replace(/-/g, '').slice(0, 8), 16);
    const value = { text: chooseFeedback(category, recent, seed), category, sessionId: id, createdAt: ctx.clock.now() };
    await ctx.db.meta.put({ key, value });
    await ctx.db.meta.put({ key: 'recent-workout-feedback', value: [value.text, ...recent].slice(0, 12) });
    return value;
  });
}
