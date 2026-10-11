/** HistoryService (03 §6, S12): passlista och styrkeserier som skiljer mätt från beräknad maxstyrka. */
import type { ExerciseId } from '../domain/catalog';
import { exercise } from '../domain/catalog';
import { e1rmFromEstimate, submaxE1rm } from '../domain/prescription';
import { gramsToKg } from '../domain/units';
import type { LocalSession } from '../storage/db';
import type { AppContext } from './context';
import { toUserSettings } from './plannerInput';

export type SessionSummary = { session: LocalSession; doneWorkSets: number; exercises: Array<{ exerciseId: ExerciseId; done: number; planned: number }> };

export async function listSessions(ctx: AppContext, opts: { limit?: number; before?: string } = {}): Promise<SessionSummary[]> {
  const all = (await ctx.db.sessions.toArray()).filter((s) => ['completed', 'partial', 'abandoned'].includes(s.status) && (!opts.before || (s.startedAt ?? '') < opts.before));
  all.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const page = all.slice(0, opts.limit ?? 20);
  const out: SessionSummary[] = [];
  for (const s of page) {
    const exs = await ctx.db.sessionExercises.where('sessionId').equals(s.id).toArray();
    const sets = (await ctx.db.sets.where('sessionId').equals(s.id).toArray()).filter((x) => !x.deleted && x.kind === 'work');
    const rows = exs
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => ({ exerciseId: e.exerciseId, done: sets.filter((x) => x.sessionExerciseId === e.id && x.status === 'done').length, planned: e.replacedById ? 0 : e.snapshot.sets }))
      .filter((r) => r.done > 0 || r.planned > 0);
    out.push({ session: s, doneWorkSets: sets.filter((x) => x.status === 'done').length, exercises: rows });
  }
  return out;
}

export type StrengthPoint = { at: string; kg: number; source: 'measured' | 'estimated' | 'performance'; detail: string };
export type StrengthSeries = { exerciseId: ExerciseId; comparable: boolean; points: StrengthPoint[]; note: string | null };

/**
 * - measured: användarrapporterat uppmätt 1RM, eller utfört 1-repetitionsset med RIR 0.
 * - estimated: e1RM från 3RM/1RM-uppgift (Epley) eller submaximalt set med 1–8 reps och RIR 0–3 (osäker).
 * - performance: bästa faktiska arbetsset (kg) per pass – faktisk prestation, ingen skattning.
 * Assistans/kroppsvikt/tid räknas aldrig om till skivstångs-1RM (02 §4).
 */
export async function strengthSeries(ctx: AppContext, exerciseId: ExerciseId, sinceUtc?: string, variantKey = 'default'): Promise<StrengthSeries> {
  const lk = exercise(exerciseId).loadKind;
  // Uppskattningar i inställningar gäller standardvarianten; andra maskinprofiler visas som egna serier (§2.3).
  const settings = variantKey === 'default' ? await ctx.db.exerciseSettings.where('exerciseId').equals(exerciseId).first() : undefined;
  const ofVariant = new Set((await ctx.db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()).filter((e) => e.variantKey === variantKey).map((e) => e.id));
  const sets = (await ctx.db.sets.where('exerciseId').equals(exerciseId).toArray()).filter((s) => ofVariant.has(s.sessionExerciseId) && !s.deleted && s.kind === 'work' && s.status === 'done' && s.occurredAt && (!sinceUtc || s.occurredAt >= sinceUtc));
  if (lk !== 'external_kg') {
    const bySession = new Map<string, (typeof sets)[number]>();
    for (const s of sets) {
      const cur = bySession.get(s.sessionId);
      const better = lk === 'assistance_kg' ? (cur === undefined || (s.actualGrams ?? 0) < (cur.actualGrams ?? 0)) : lk === 'duration_sec' ? (cur === undefined || (s.actualSeconds ?? 0) > (cur.actualSeconds ?? 0)) : cur === undefined || (s.actualReps ?? 0) > (cur.actualReps ?? 0);
      if (better) bySession.set(s.sessionId, s);
    }
    const points = [...bySession.values()]
      .map((s) => ({ at: s.occurredAt!, kg: lk === 'duration_sec' ? (s.actualSeconds ?? 0) : gramsToKg(s.actualGrams ?? 0), source: 'performance' as const, detail: lk === 'duration_sec' ? `${s.actualSeconds} s` : `${s.actualReps} reps` }))
      .sort((a, b) => a.at.localeCompare(b.at));
    return { exerciseId, comparable: false, points, note: lk === 'assistance_kg' ? 'Assistans: lägre värde = mer egen styrka. Inte jämförbart med skivstångsvikter.' : lk === 'duration_sec' ? 'Tid i sekunder.' : 'Repetitioner/extra vikt. Ingen beräknad maxstyrka.' };
  }
  const points: StrengthPoint[] = [];
  if (settings?.estimateKind && settings.estimateGrams !== null) {
    const est = e1rmFromEstimate(toUserSettings(settings).estimate!);
    if (est) points.push({ at: (settings.estimateTestedAt ? `${settings.estimateTestedAt}T00:00:00.000Z` : settings.updatedAt), kg: est.kg, source: est.source, detail: settings.estimateKind === '3rm' ? '3RM-uppgift' : settings.estimateKind === 'submax' ? 'submaximal uppgift' : '1RM-uppgift' });
  }
  const perSession = new Map<string, { at: string; best: number; e1rm: number | null; measured: boolean }>();
  for (const s of sets) {
    if (s.actualGrams === null || s.actualReps === null || s.actualReps < 1) continue;
    const kgv = gramsToKg(s.actualGrams);
    const cur = perSession.get(s.sessionId) ?? { at: s.occurredAt!, best: 0, e1rm: null, measured: false };
    cur.best = Math.max(cur.best, kgv);
    if (s.actualReps === 1 && s.rir === 0) {
      cur.measured = true;
      cur.e1rm = Math.max(cur.e1rm ?? 0, kgv);
    } else if (s.rir !== null) {
      const e = submaxE1rm(kgv, s.actualReps, s.rir);
      if (e) cur.e1rm = Math.max(cur.e1rm ?? 0, e.kg);
    }
    cur.at = s.occurredAt! > cur.at ? s.occurredAt! : cur.at;
    perSession.set(s.sessionId, cur);
  }
  for (const v of perSession.values()) {
    points.push({ at: v.at, kg: v.best, source: 'performance', detail: 'bästa arbetsset' });
    if (v.e1rm !== null) points.push({ at: v.at, kg: v.e1rm, source: v.measured ? 'measured' : 'estimated', detail: v.measured ? '1 rep, 0 kvar' : 'uppskattad från reps och reps kvar' });
  }
  points.sort((a, b) => a.at.localeCompare(b.at) || a.source.localeCompare(b.source));
  return { exerciseId, comparable: true, points, note: null };
}

/** Maskinprofiler med utförda set för en övning ('default' först). Serierna skarvas aldrig ihop. */
export async function performedVariants(ctx: AppContext, exerciseId: ExerciseId): Promise<string[]> {
  const exs = await ctx.db.sessionExercises.where('exerciseId').equals(exerciseId).toArray();
  const out = new Set<string>();
  for (const e of exs) {
    if (out.has(e.variantKey)) continue;
    const done = await ctx.db.sets.where('sessionExerciseId').equals(e.id).filter((s) => s.status === 'done' && !s.deleted).count();
    if (done) out.add(e.variantKey);
  }
  return [...out].sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
}
