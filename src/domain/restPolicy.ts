import type { Experience, Mode } from './decision_engine';
import type { TimeKind } from './catalog';
import type { PerceivedEffort, SetKind } from './model';
import type { RestRecord } from './trainingFlow';

export const REST_POLICY = { version: 'REST/1.1.0', heavy: 180, compound: 120, isolation: 90, technique: 60, min: 30, max: 300, effortAddition: 30, highIntensityAddition: 60, repDrop: .2, warmup: 60, beforeHeavy: 150 } as const;
export type RestPerformance = { comparisonKey: string; side: string; load: number | null; secondLoad?: number | null; reps: number | null; targetReps: number | null; rir: number | null; kind: SetKind; technique: string | null };
export type RestInput = { effort?: PerceivedEffort | null; category: TimeKind; mode: Mode; strengthFocus: boolean; experience: Experience; adaptive: boolean; kind: SetKind; nextKind: SetKind | null; secondSidePending?: boolean; betweenSidesSeconds?: number; overrideSeconds?: number | null; relativeIntensity?: number | null; effortRir?: number | null; current?: RestPerformance; previous?: RestPerformance };
export function recommendRest(i: RestInput): { seconds: number; reasons: string[]; version: string } {
  const result = (seconds: number, reasons: string[]) => ({ seconds, reasons, version: REST_POLICY.version });
  if (i.secondSidePending) return result(i.betweenSidesSeconds ?? 0, ['BETWEEN_SIDES']);
  if (i.nextKind === null) return result(0, ['NO_FOLLOWING_SET']);
  if (i.kind === 'warmup') return result(i.nextKind === 'work' ? (i.mode === 'heavy' ? REST_POLICY.beforeHeavy : 90) : REST_POLICY.warmup, [i.nextKind === 'work' ? 'BEFORE_WORK' : 'WARMUP']);
  const heavy = i.category !== 'isolation' && i.mode === 'heavy' && i.strengthFocus;
  const base = i.mode === 'light' ? REST_POLICY.technique : heavy ? REST_POLICY.heavy : i.category === 'isolation' ? REST_POLICY.isolation : REST_POLICY.compound;
  const reasons = [i.mode === 'light' ? 'TECHNIQUE' : heavy ? 'HEAVY_STRENGTH' : i.category === 'isolation' ? 'ISOLATION' : 'COMPOUND'];
  let addition = 0;
  if (i.adaptive) {
    if (i.relativeIntensity != null && i.relativeIntensity >= .85 && i.relativeIntensity <= 1.2 && heavy) { addition = REST_POLICY.highIntensityAddition; reasons.push('HIGH_INTENSITY'); }
    if (['hard','maximal','too_heavy'].includes(i.effort ?? '') && i.mode !== 'light') { addition = Math.max(addition, REST_POLICY.effortAddition); reasons.push('REPORTED_EFFORT'); }
    const effortRir = i.effortRir ?? i.current?.rir;
    if (effortRir != null && effortRir <= 1 && i.mode !== 'light') { addition = Math.max(addition, REST_POLICY.effortAddition); reasons.push('HIGH_EFFORT'); }
    const a = i.previous, b = i.current;
    if (a && b && a.kind === 'work' && b.kind === 'work' && a.comparisonKey === b.comparisonKey && a.side === b.side && a.load === b.load && (a.secondLoad ?? null) === (b.secondLoad ?? null) && a.targetReps === b.targetReps && a.technique === b.technique && a.rir !== null && b.rir !== null && Math.abs(a.rir - b.rir) <= 1 && a.reps !== null && b.reps !== null && a.reps > 0 && a.reps - b.reps >= 2 && (a.reps - b.reps) / a.reps >= REST_POLICY.repDrop) {
      addition = Math.max(addition, REST_POLICY.effortAddition); reasons.push('REPETITIONS_DECREASED');
    }
  }
  // Correlated effort/drop signals use the largest adjustment, never accumulate blindly.
  let seconds = base + addition;
  if (i.overrideSeconds != null) { seconds = i.overrideSeconds; reasons.push('PERSONAL_PREFERENCE'); }
  return result(Math.max(REST_POLICY.min, Math.min(REST_POLICY.max, Math.round(seconds))), reasons);
}
export const REST_REASONS: Record<string, string> = {
  REPORTED_EFFORT: 'Du beskrev setet som ansträngande.', BETWEEN_SIDES: 'Din valda vila mellan sidorna.', NO_FOLLOWING_SET: 'Inga fler set återstår.', WARMUP: 'Kort vila mellan uppvärmningsset.', BEFORE_WORK: 'Vila inför första arbetssetet.',
  TECHNIQUE: 'Lättare teknikarbete.', HEAVY_STRENGTH: 'Tung flerledsövning med styrkefokus.', ISOLATION: 'Grundvila för isolationsövning.', COMPOUND: 'Grundvila för flerledsövning.', HIGH_INTENSITY: 'Hög belastning i förhållande till ett jämförbart maxvärde.', HIGH_EFFORT: 'Du angav få repetitioner kvar.', REPETITIONS_DECREASED: 'Färre repetitioner än i ett jämförbart set. Längre vila kan vara värd att prova; tappet kan ha andra orsaker.', PERSONAL_PREFERENCE: 'Din valda standardvila.',
};
export function remainingRest(r: RestRecord, now: string): number {
  const elapsed = (Date.parse(now) - Date.parse(r.startedAt)) / 1000;
  return r.outcome !== 'active' || !Number.isFinite(elapsed) ? 0 : Math.max(0, Math.ceil(r.recommendedSeconds + r.adjustmentSeconds - Math.max(0, elapsed)));
}
export function observedRestSeconds(endedAt: string, nextStartedAt: string | null): number | null {
  if (!nextStartedAt) return null;
  const diff = (Date.parse(nextStartedAt) - Date.parse(endedAt)) / 1000;
  return Number.isFinite(diff) && diff >= 0 && diff <= 86_400 ? Math.round(diff) : null;
}
export function suggestRestPreference(records: RestRecord[]): number | null {
  const recent = records.filter((r) => r.type === 'between_sets' && r.adjustmentSeconds !== 0).slice(-5);
  if (recent.length < 3) return null;
  const direction = Math.sign(recent[0].adjustmentSeconds);
  if (!recent.every((r) => Math.sign(r.adjustmentSeconds) === direction)) return null;
  const values = recent.map((r) => r.recommendedSeconds + r.adjustmentSeconds).sort((a, b) => a - b);
  return Math.max(30, Math.min(300, values[Math.floor(values.length / 2)]));
}
