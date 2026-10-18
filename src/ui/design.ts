/** Presentation only. These preferences never enter a workout or its sync queue. */
export const refinedDesign = import.meta.env.VITE_FLAG_DESIGN_V2 !== 'false';
export type Theme = 'auto' | 'light' | 'dark';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* usable without storage */ } };
let theme: Theme = (() => { const v = read('styrka.theme'); return v === 'light' || v === 'dark' ? v : 'auto'; })();
let haptics = read('styrka.haptics') === 'on';
export const getTheme = () => theme;
export const getHaptics = () => haptics;
export const supportsHaptics = () => typeof navigator.vibrate === 'function';
function applyTheme() {
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}
export function setTheme(value: Theme) { theme = value; write('styrka.theme', value); applyTheme(); }
export function setHaptics(value: boolean) { haptics = value; write('styrka.haptics', value ? 'on' : 'off'); }
/** Optional, best effort, AFTER local commit. A true return is not proof of felt vibration. */
export function confirmSetHaptic() {
  if (!refinedDesign || !haptics || !supportsHaptics()) return;
  try { navigator.vibrate(8); } catch { /* feedback must never change a successful save into an error */ }
}

/** Visual feedback only; native click/keyboard activation retains all action semantics. */
export function installPressFeedback(doc: Document = document) {
  let active: HTMLElement | null = null;
  let bounds: DOMRect | null = null;
  let pointer: number | null = null;
  const clear = () => { active?.removeAttribute('data-pressed'); active = null; bounds = null; pointer = null; };
  const down = (e: PointerEvent) => {
    clear();
    if (e.button !== 0 || !e.isPrimary) return;
    const el = (e.target as Element).closest<HTMLElement>('button, a.btn, summary');
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    active = el; bounds = el.getBoundingClientRect(); pointer = e.pointerId;
    el.dataset.pressed = 'true';
  };
  const move = (e: PointerEvent) => {
    if (pointer !== e.pointerId || !bounds) return;
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) clear();
  };
  const keyDown = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLElement && e.target.matches('button:not(:disabled), a.btn, summary')) {
      active = e.target; active.dataset.pressed = 'true';
    }
  };
  doc.addEventListener('pointerdown', down, { passive: true });
  doc.addEventListener('pointermove', move, { passive: true });
  doc.addEventListener('pointerup', clear); doc.addEventListener('pointercancel', clear);
  doc.addEventListener('keydown', keyDown); doc.addEventListener('keyup', clear);
  doc.addEventListener('visibilitychange', clear); window.addEventListener('blur', clear);
  return () => {
    clear(); doc.removeEventListener('pointerdown', down); doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', clear); doc.removeEventListener('pointercancel', clear);
    doc.removeEventListener('keydown', keyDown); doc.removeEventListener('keyup', clear);
    doc.removeEventListener('visibilitychange', clear); window.removeEventListener('blur', clear);
  };
}

export function initializeDesign() {
  document.documentElement.dataset.design = refinedDesign ? 'refined' : 'classic';
  if (!refinedDesign) return;
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  installPressFeedback();
}
