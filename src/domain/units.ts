/**
 * Exakt viktrepresentation. Kilogram lagras som heltal gram i domän och IndexedDB,
 * och som numeric(8,3) i Postgres. Inga flyttalsjämförelser mot databasen (02 §10).
 */
export const MAX_KG = 500;
export const MAX_GRAMS = MAX_KG * 1000;

export type KgParseResult =
  | { ok: true; grams: number }
  | { ok: false; error: 'EMPTY' | 'FORMAT' | 'NEGATIVE' | 'TOO_LARGE' | 'TOO_PRECISE' };

/** Accepterar `102,5`, `102.5`, `102`, `0,125`. Avvisar `102,,5`, `1.2.3`, `-5`, `abc`. */
export function parseKg(input: string): KgParseResult {
  const s = input.trim().replace(/\s/g, '');
  if (s === '') return { ok: false, error: 'EMPTY' };
  if (s.startsWith('-')) return { ok: false, error: 'NEGATIVE' };
  const m = /^(\d{1,4})(?:[.,](\d+))?$/.exec(s);
  if (!m) return { ok: false, error: 'FORMAT' };
  const frac = m[2] ?? '';
  if (frac.length > 3) return { ok: false, error: 'TOO_PRECISE' };
  const grams = Number(m[1]) * 1000 + Number(frac.padEnd(3, '0') || '0');
  if (grams > MAX_GRAMS) return { ok: false, error: 'TOO_LARGE' };
  return { ok: true, grams };
}

export function gramsToKg(grams: number): number {
  return grams / 1000;
}

/** Konverterar ett kg-tal (från motorn) till exakta gram, med avrundning till närmaste gram. */
export function kgToGrams(kg: number): number {
  if (!Number.isFinite(kg) || kg < 0) throw new Error('INVALID_KG');
  return Math.round(kg * 1000);
}

/** Postgres numeric(8,3)-sträng, t.ex. 102500 → "102.500". */
export function gramsToDecimalString(grams: number): string {
  if (!Number.isInteger(grams) || grams < 0) throw new Error('INVALID_GRAMS');
  const whole = Math.floor(grams / 1000);
  const frac = String(grams % 1000).padStart(3, '0');
  return `${whole}.${frac}`;
}

export function decimalStringToGrams(s: string | number): number {
  const r = parseKg(String(s));
  if (!r.ok) throw new Error(`INVALID_DECIMAL_${r.error}`);
  return r.grams;
}

/** Svensk visning: 102500 → "102,5", 80000 → "80", 1250 → "1,25". */
export function formatKg(grams: number, opts: { minDecimals?: number } = {}): string {
  const whole = Math.floor(grams / 1000);
  let frac = String(grams % 1000).padStart(3, '0').replace(/0+$/, '');
  const min = opts.minDecimals ?? 0;
  while (frac.length < min) frac += '0';
  return frac ? `${whole},${frac}` : String(whole);
}

export type IntParseResult = { ok: true; value: number } | { ok: false; error: 'EMPTY' | 'FORMAT' | 'RANGE' };

export function parseIntInRange(input: string, min: number, max: number): IntParseResult {
  const s = input.trim();
  if (s === '') return { ok: false, error: 'EMPTY' };
  if (!/^\d{1,4}$/.test(s)) return { ok: false, error: 'FORMAT' };
  const v = Number(s);
  if (v < min || v > max) return { ok: false, error: 'RANGE' };
  return { ok: true, value: v };
}
