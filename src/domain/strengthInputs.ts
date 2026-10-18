import type { LiftEstimateInput } from './model';
import { e1rmFromEstimate } from './prescription';

/** Product policy strength-inputs/1: one independent observation of each kind per exercise/variant. */
export type StrengthInput = {
  kind: '1rm' | '3rm' | 'submax';
  grams: number;
  reps: number | null;
  rir: number | null;
  measured: boolean;
  testedAt: string | null;
};

export function validStrengthDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && value >= '1900-01-01';
}

export function validStrengthInput(s: StrengthInput, today: string): boolean {
  return ['1rm', '3rm', 'submax'].includes(s.kind) && Number.isInteger(s.grams) && s.grams > 0 && s.grams <= 500_000
    && typeof s.measured === 'boolean'
    && (s.testedAt === null || (validStrengthDate(s.testedAt) && s.testedAt <= today))
    && (s.kind === 'submax'
      ? Number.isInteger(s.reps) && s.reps! >= 1 && s.reps! <= 8 && (s.rir === null || (Number.isInteger(s.rir) && s.rir >= 0 && s.rir <= 3))
      : s.reps === null && s.rir === null);
}

const asEstimate = (s: StrengthInput): LiftEstimateInput => ({ kind: s.kind, kg: s.grams / 1000, reps: s.reps ?? undefined, rir: s.rir, measured: s.measured, testedAt: s.testedAt ?? undefined });

export type StrengthResolution = {
  estimate: LiftEstimateInput | null;
  used: number;
  excluded: number;
  disagreement: boolean;
};

/** No new physiological formula. Existing estimates are compared within a 90-day observation window.
 * Undated observations are retained, but do not outweigh dated evidence. Missing RIR is never invented.
 * Weight 3 for measured 1RM, 2 for reported max/3RM, 1 for a set. These and the 15% threshold are H rules.
 */
export function resolveStrengthInputs(inputs: readonly StrengthInput[]): StrengthResolution {
  const candidates = inputs.map((s) => ({ s, e: asEstimate(s), value: e1rmFromEstimate(asEstimate(s))?.kg ?? null }))
    .filter((c): c is typeof c & { value: number } => c.value !== null)
    .sort((a, b) => a.s.kind.localeCompare(b.s.kind));
  const newest = candidates.map((c) => c.s.testedAt).filter((d): d is string => !!d).sort().at(-1);
  const eligible = newest ? candidates.filter((c) => c.s.testedAt && Date.parse(newest) - Date.parse(c.s.testedAt) <= 90 * 86_400_000) : candidates;
  if (!eligible.length) return { estimate: inputs.length ? asEstimate(inputs[0]) : null, used: 0, excluded: inputs.length, disagreement: false };
  if (eligible.length === 1) return { estimate: eligible[0].e, used: 1, excluded: inputs.length - 1, disagreement: false };
  const low = Math.min(...eligible.map((c) => c.value));
  const high = Math.max(...eligible.map((c) => c.value));
  const disagreement = high / low > 1.15;
  const weight = (s: StrengthInput) => s.kind === 'submax' ? 1 : s.kind === '1rm' && s.measured ? 3 : 2;
  const weighted = eligible.reduce((sum, c) => sum + c.value * weight(c.s), 0) / eligible.reduce((sum, c) => sum + weight(c.s), 0);
  // Never raise an actual reported single-repetition maximum because a formula predicts more.
  const singles = eligible.filter((c) => c.s.kind === '1rm').map((c) => c.value);
  const kg = Math.min(500, disagreement ? low : Math.min(weighted, ...singles));
  return {
    estimate: { kind: '1rm', kg: Math.floor(kg * 1000) / 1000, measured: false, testedAt: newest,
      confidence: disagreement || eligible.every((c) => c.s.kind === 'submax') ? 'low' : 'medium',
      inputReason: disagreement ? 'STRENGTH_INPUTS_DISAGREE' : 'MULTIPLE_STRENGTH_INPUTS' },
    used: eligible.length, excluded: inputs.length - eligible.length, disagreement,
  };
}
