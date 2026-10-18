import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/design.css', 'utf8');
function tokens(theme: 'light' | 'dark') {
  const rule = theme === 'light' ? ":root[data-design='refined'] {" : ":root[data-design='refined'][data-theme='dark'] {";
  return Object.fromEntries([...css.split(rule)[1].split('}')[0].matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map((m) => [m[1], m[2]]));
}
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

for (const theme of ['light', 'dark'] as const) describe(`DES04 ${theme}`, () => {
  const t = tokens(theme);
  for (const bg of ['background', 'surface', 'surface-raised', 'accent-soft', 'success-soft', 'warning-soft', 'danger-soft']) {
    for (const fg of ['text-primary', 'text-secondary']) it(`${fg} on ${bg} >= 4.5`, () => expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5));
  }
  for (const [fg, bg] of [['accent-text', 'accent'], ['danger-text', 'danger'], ['success', 'success-soft'], ['warning', 'warning-soft'], ['danger', 'danger-soft'], ['accent', 'surface'], ['accent', 'accent-soft']]) {
    it(`${fg} on ${bg} >= 4.5`, () => expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5));
  }
  for (const bg of ['background', 'surface', 'surface-raised']) {
    for (const fg of ['control-border', 'focus', 'accent']) it(`${fg} control on ${bg} >= 3`, () => expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3));
  }
});
