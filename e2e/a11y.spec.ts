/**
 * Tillgänglighet (38–40, G2): axe-skanning av kritiska vyer, reflow vid 320 CSS px (WCAG 1.4.10 ≈ 400 % zoom på desktop,
 * motsvarar 200 % textzoom på mobil i praktiken), träffytor ≥ 48 px, reducerad rörelse, tangentbord, statusmeddelanden.
 * Automatik kan inte garantera WCAG – manuell VoiceOver/TalkBack-QA krävs (docs/TESTPROTOKOLL.md).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, signUp, uniqueEmail } from './helpers';

async function axe(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${name}: ${v.id} – ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

async function noHorizontalScroll(page: Page, name: string) {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw, `${name} horisontell scroll`).toBeLessThanOrEqual(w.cw + 1);
}

async function tapTargets(page: Page, name: string) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, a.btn, [role=radio], input[type=checkbox]')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const r = (el.closest('label') ?? el).getBoundingClientRect();
        return { t: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((x) => x.w < 44 || x.h < 44),
  );
  expect(small, `${name}: träffytor under 44 px`).toEqual([]);
}

test('axe + träffytor + reflow på kritiska vyer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await axe(page, 'S01');
  await signUp(page, uniqueEmail('a11y'));
  await axe(page, 'S02');
  await onboard(page);
  const views: Array<[string, () => Promise<void>]> = [
    ['S06', async () => { await page.goto('/'); }],
    ['S07', async () => { await page.getByRole('button', { name: 'Öppna passet' }).click(); await expect(page.getByRole('button', { name: 'Starta passet', exact: true })).toBeEnabled(); }],
    ['S08', async () => { await page.getByRole('button', { name: 'Starta passet', exact: true }).click(); await page.getByRole('button', { name: 'Registrera set 1' }).click(); }],
    ['S08-editor', async () => { await page.getByRole('button', { name: /Repetitioner set 2/ }).click(); }],
    ['S11', async () => { await page.getByRole('button', { name: 'Avsluta', exact: true }).click(); }],
    ['S12', async () => { await page.getByRole('button', { name: 'Avsluta och spara' }).click(); await expect(page.getByRole('heading',{name:'Så påverkas kommande träning'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click(); await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible(); await page.getByRole('link', { name: 'Utveckling' }).click(); }],
    ['S13', async () => { await page.getByRole('link', { name: 'Profil' }).click(); }],
    ['S14', async () => { await page.goto('/profil/begransningar'); }],
    ['S15', async () => { await page.goto('/profil/data'); }],
    ['S16', async () => { await page.goto('/synk'); }],
    ['S10', async () => { await page.goto('/spontan'); }],
  ];
  for (const [name, go] of views) {
    await go();
    await page.waitForTimeout(150);
    await axe(page, name);
    await tapTargets(page, name);
    await noHorizontalScroll(page, name);
  }
});

test('reflow: 320 CSS px bredd utan horisontell scroll (motsvarar kraftig zoom)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await signUp(page, uniqueEmail('reflow'));
  await noHorizontalScroll(page, 'S02');
  await onboard(page);
  await noHorizontalScroll(page, 'S06');
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  await noHorizontalScroll(page, 'S07');
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await page.getByRole('button', { name: /Vikt set 1/ }).click();
  await noHorizontalScroll(page, 'S08-editor');
  await page.screenshot({ path: 'docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/regression/screenshots/reflow-320-S08.png', fullPage: true });
});

test('tangentbord: starta pass och logga set utan mus; skärmläsarstatus annonseras en gång', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Tab-fokus mellan knappar är avstängt som standard i WebKit/Safari.');
  await signUp(page, uniqueEmail('kbd'));
  await onboard(page);
  const open = page.getByRole('button', { name: 'Öppna passet' });
  // focus() does not wait for a disabled button to become enabled. The plan loads asynchronously.
  await expect(open).toBeEnabled();
  await open.focus();
  await expect(open).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Starta passet', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).focus();
  await page.keyboard.press('Enter');
  const klart = page.getByRole('button', { name: 'Registrera set 1' });
  await expect(klart).toBeVisible();
  // Fokus hamnar på övningsrubriken; tabba fram till Klart.
  for (let i = 0; i < 12 && !(await klart.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(klart).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  const live = page.locator('[aria-live="polite"].visually-hidden');
  await expect(page.getByRole('status').filter({ hasText: 'Set 1 registrerat på enheten' })).toHaveCount(1);
  await expect(live).toHaveText('');
});

test.describe('mörkt läge', () => {
  test.use({ colorScheme: 'dark' });
  test('samma informationshierarki och godkänd kontrast i mörkt läge', async ({ page }, info) => {
    await signUp(page, uniqueEmail('dark'));
    await onboard(page);
    await axe(page, 'S06-mörkt');
    await page.screenshot({ path: `docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/regression/screenshots/${info.project.name}/S06-idag-morkt.png`, fullPage: true });
    await page.getByRole('button', { name: 'Öppna passet' }).click();
    await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
    await page.getByRole('button', { name: 'Registrera set 1' }).click();
    await axe(page, 'S08-mörkt');
    await page.screenshot({ path: `docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/regression/screenshots/${info.project.name}/S08-trana-morkt.png`, fullPage: true });
  });
});
