import type { PerceivedEffort } from './model';

export const EFFORT_OPTIONS = ['too_easy', 'easy', 'ok', 'hard', 'maximal'] as const;
export type SetEffort = typeof EFFORT_OPTIONS[number];
export const EFFORT_LABELS: Record<PerceivedEffort, string> = {
  too_easy: 'För lätt', easy: 'Lätt', ok: 'Lagom', hard: 'Tungt', maximal: 'Maxansträngning', too_heavy: 'För tungt',
};
export const MAX_EFFORT_DESCRIPTION = 'Jag hade inte klarat en repetition till med god teknik.';
export function validEffort(value: unknown): value is PerceivedEffort | null {
  return value === null || [...EFFORT_OPTIONS, 'too_heavy'].includes(value as PerceivedEffort);
}
/** Only the explicit maximal-effort answer defines zero reserve. Other words never invent RIR. */
export function effectiveRir(rir: number | null, effort?: PerceivedEffort | null): number | null {
  return rir ?? (effort === 'maximal' ? 0 : null);
}
