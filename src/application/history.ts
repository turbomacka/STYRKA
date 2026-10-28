/** HistoryService (03 §6, S12): passlista och styrkeserier som skiljer mätt från beräknad maxstyrka. */
import type { ExerciseId } from '../domain/catalog';
import { exercise } from '../domain/catalog';
import { e1rmFromEstimate, submaxE1rm } from '../domain/prescription';
import { gramsToKg } from '../domain/units';
import type { LocalSession } from '../storage/db';
import type { AppContext } from './context';
import { toUserSettings } from './plannerInput';
import { effectiveRir } from '../domain/effort';
import { canEstimateMax, comparisonKey, defaultConfiguration, EXECUTION_LABELS, SIDE_LABELS, type SetPerformance } from '../domain/trainingFlow';

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

/** `sessionId` finns för punkter som härletts ur ett träningspass (inte ur en angiven uppskattning). */
export type StrengthPoint = { at: string; kg: number; source: 'measured' | 'estimated' | 'performance'; origin?: 'input'; detail: string; sessionId?: string };
export type StrengthSeries = { exerciseId: ExerciseId; comparable: boolean; points: StrengthPoint[]; latestMax?: StrengthPoint; note: string | null; unit?: string };
function latestMax(points: StrengthPoint[]): StrengthPoint | undefined {
  // Settings.updatedAt can advance on sync. An input is a reference, never a newer workout.
  const workoutMaxima = points.filter((p) => p.source !== 'performance' && p.origin !== 'input');
  const candidates = workoutMaxima.length ? workoutMaxima : points.filter((p) => p.origin === 'input');
  return candidates.sort((a,b) => a.at.localeCompare(b.at)).at(-1);
}

export function performanceSeriesKey(id: ExerciseId, p: SetPerformance): string {
  return p.side === 'both' && p.comparisonKey === comparisonKey(id, defaultConfiguration(id)) && ['free_mass','per_dumbbell','barbell_total'].includes(p.equipment.measurement) ? 'default' : `flow:${p.comparisonKey}:${p.side}`;
}

export async function trainingSeriesOptions(ctx: AppContext, id: ExerciseId): Promise<Array<{ value: string; label: string }>> {
  const exs = await ctx.db.sessionExercises.where('exerciseId').equals(id).toArray();
  const sets = (await ctx.db.sets.where('exerciseId').equals(id).toArray()).filter((s) => !s.deleted && s.kind === 'work');
  const options = new Map<string,string>();
  for (const s of sets) {
    if (!s.detail && s.status === 'done') { const key = exs.find((e) => e.id === s.sessionExerciseId)?.variantKey ?? 'default'; options.set(key, key === 'default' ? 'Standard / äldre registreringar' : key); }
    for (const p of s.detail?.performances.filter((p) => p.status === 'done') ?? []) {
      const key = performanceSeriesKey(id,p);
      const name = p.equipment.comparisonGroup ?? p.equipment.name;
      const context = !name && p.equipment.id.startsWith('unidentified:') ? `Ej namngiven maskin · ${new Date(p.completedAt!).toLocaleDateString('sv-SE')}` : name;
      const label = `${context ? context + ' · ' : ''}${EXECUTION_LABELS[p.executionMode]}${p.side !== 'both' ? ` · ${SIDE_LABELS[p.side]}` : ''}${p.equipment.basis === 'independent' ? ' · Stapel 1' : ''}`;
      options.set(key,label);
      if (p.equipment.basis === 'independent') options.set(key + ':second', label.replace('Stapel 1','Stapel 2'));
    }
  }
  return [...options].map(([value,label]) => ({ value,label }));
}

async function detailedStrengthSeries(ctx: AppContext, exerciseId: ExerciseId, key: string, since?: string): Promise<StrengthSeries> {
  const sets = (await ctx.db.sets.where('exerciseId').equals(exerciseId).toArray()).filter((s) => !s.deleted && s.kind === 'work');
  const second = key.endsWith(':second'); const baseKey = second ? key.slice(0,-7) : key;
  const entries = sets.flatMap((s) => (s.detail?.performances ?? []).filter((p) => p.status === 'done' && performanceSeriesKey(exerciseId,p) === baseKey && p.completedAt).map((p) => ({ s,p })));
  const points: StrengthPoint[] = [];
  const sample = entries[0]?.p;
  const e = sample?.equipment;
  const unit = e?.unit === 'level' ? 'nivå' : e?.measurement === 'duration' ? 's' : e?.measurement === 'bodyweight' ? 'reps' : 'kg';
  const performance = new Map<string,StrengthPoint>(); const maximum = new Map<string,StrengthPoint>();
  for (const { s,p } of entries) {
    const load = second ? p.secondLoadValue : p.loadValue;
    const value = unit === 's' ? p.seconds : unit === 'reps' ? p.repetitions : load;
    if (value === null) continue;
    const point: StrengthPoint = { at: p.completedAt!, kg: value, source: 'performance', detail: `${SIDE_LABELS[p.side]} · ${p.repetitions ?? p.seconds} ${unit === 's' ? 's' : 'reps'}${p.rir !== null ? ` · ${p.rir} reps kvar` : ''}`, sessionId: s.sessionId };
    const cur = performance.get(s.sessionId);
    if (!cur || (e?.measurement === 'bodyweight_assistance' ? value < cur.kg : value > cur.kg)) performance.set(s.sessionId,point);
    const rir = effectiveRir(p.rir,p.effort);
    if (!second && canEstimateMax(p.equipment) && load !== null && p.repetitions !== null && rir !== null && p.technique === 'controlled') {
      const estimated = submaxE1rm(load,p.repetitions,rir);
      const measured = p.repetitions === 1 && rir === 0;
      const max = measured ? load : estimated?.kg;
      if (max !== undefined && max > (maximum.get(s.sessionId)?.kg ?? 0)) maximum.set(s.sessionId,{ ...point, kg: max, source: measured ? 'measured' : 'estimated', detail: `${SIDE_LABELS[p.side]} · ${measured ? '1 rep, 0 kvar' : p.effort === 'maximal' ? 'uppskattat från maxansträngning' : 'uppskattat från reps och reps kvar'}` });
    }
  }
  points.push(...performance.values(),...maximum.values()); points.sort((a,b) => a.at.localeCompare(b.at) || a.source.localeCompare(b.source));
  return { exerciseId, comparable: !!e && canEstimateMax(e), points: points.filter((p) => !since || p.at >= since), latestMax: latestMax(points), unit, note: 'Separat serie för samma utförande, sida och utrustningskonfiguration. Angiven maskinbelastning är en prestationsindikator för just denna utrustning. Sidoskillnader är observationer, inte en bedömning av skaderisk.' };
}

/**
 * - measured: användarrapporterat uppmätt 1RM, eller utfört 1-repetitionsset med RIR 0.
 * - estimated: e1RM från 3RM/1RM-uppgift (Epley) eller submaximalt set med 1–8 reps och RIR 0–3 (osäker).
 * - performance: bästa faktiska arbetsset (kg) per pass – faktisk prestation, ingen skattning.
 * Assistans/kroppsvikt/tid räknas aldrig om till skivstångs-1RM (02 §4).
 */
export async function strengthSeries(ctx: AppContext, exerciseId: ExerciseId, sinceUtc?: string, variantKey = 'default'): Promise<StrengthSeries> {
  if (variantKey.startsWith('flow:')) return detailedStrengthSeries(ctx,exerciseId,variantKey,sinceUtc);
  const lk = exercise(exerciseId).loadKind;
  // Uppskattningar i inställningar gäller standardvarianten; andra maskinprofiler visas som egna serier (§2.3).
  const settings = variantKey === 'default' ? await ctx.db.exerciseSettings.where('exerciseId').equals(exerciseId).first() : undefined;
  const ofVariant = new Set((await ctx.db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()).filter((e) => e.variantKey === variantKey).map((e) => e.id));
  const sets = (await ctx.db.sets.where('exerciseId').equals(exerciseId).toArray()).filter((s) => {
    if (s.deleted || s.kind !== 'work' || s.status !== 'done' || !s.occurredAt) return false;
    // Older registrations only have the session variant. Detailed performances carry
    // the authoritative comparison key, even if the session was planned as "flow:".
    if (!s.detail) return ofVariant.has(s.sessionExerciseId);
    return s.detail.performances.length > 0 && s.detail.performances.every((p) => p.status === 'done' && performanceSeriesKey(exerciseId, p) === variantKey);
  });
  if (lk !== 'external_kg') {
    const bySession = new Map<string, (typeof sets)[number]>();
    for (const s of sets.filter((s) => !sinceUtc || s.occurredAt! >= sinceUtc)) {
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
    if (est) points.push({ at: (settings.estimateTestedAt ? `${settings.estimateTestedAt}T00:00:00.000Z` : settings.updatedAt), kg: est.kg, source: est.source, origin: 'input', detail: settings.estimateKind === '3rm' ? '3RM-uppgift' : settings.estimateKind === 'submax' ? 'submaximal uppgift' : '1RM-uppgift' });
  }
  const perSession = new Map<string, { at: string; best: number; maximum: StrengthPoint | null; sessionId: string }>();
  for (const s of sets) {
    if (s.actualGrams === null || s.actualReps === null || s.actualReps < 1) continue;
    const kgv = gramsToKg(s.actualGrams);
    const cur = perSession.get(s.sessionId) ?? { at: s.occurredAt!, best: 0, maximum: null, sessionId: s.sessionId };
    cur.best = Math.max(cur.best, kgv);
    const reliableTechnique = !s.detail || s.technique === 'controlled';
    const rir = effectiveRir(s.rir,s.perceivedEffort);
    if (reliableTechnique && rir !== null) {
      const measured = s.actualReps === 1 && rir === 0;
      const max = measured ? kgv : submaxE1rm(kgv, s.actualReps, rir)?.kg;
      if (max !== undefined && (!cur.maximum || max > cur.maximum.kg || (max === cur.maximum.kg && measured))) {
        cur.maximum = { at: s.occurredAt!, kg: max, source: measured ? 'measured' : 'estimated', sessionId: s.sessionId,
          detail: measured ? '1 rep, 0 kvar' : s.perceivedEffort === 'maximal' ? 'uppskattad från maxansträngning' : 'uppskattad från reps och reps kvar' };
      }
    }
    cur.at = s.occurredAt! > cur.at ? s.occurredAt! : cur.at;
    perSession.set(s.sessionId, cur);
  }
  for (const v of perSession.values()) {
    points.push({ at: v.at, kg: v.best, source: 'performance', detail: 'bästa arbetsset', sessionId: v.sessionId });
    if (v.maximum) points.push(v.maximum);
  }
  points.sort((a, b) => a.at.localeCompare(b.at) || a.source.localeCompare(b.source));
  return { exerciseId, comparable: true, points: points.filter((p) => !sinceUtc || p.at >= sinceUtc), latestMax: latestMax(points), note: null };
}

/** Maskinprofiler med utförda set för en övning ('default' först). Serierna skarvas aldrig ihop. */
export async function performedVariants(ctx: AppContext, exerciseId: ExerciseId): Promise<string[]> {
  return (await trainingSeriesOptions(ctx,exerciseId)).map((x) => x.value).sort((a,b) => a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b));
}
