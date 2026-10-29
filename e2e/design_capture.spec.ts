import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { onboard, signUp, uniqueEmail } from './helpers';

const phase = process.env.DES_CAPTURE;
test.skip(!phase, 'Explicit before/after evidence capture only');
for (const theme of ['light', 'dark'] as const) test(`design evidence ${theme}`, async ({ page }, info) => {
  const dir = `docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/regression/design-001/${phase}/${info.project.name}/${theme}`;
  mkdirSync(dir, { recursive: true });
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(() => {
    const evidence = { interactions: [] as number[], cls: 0, eventTimingSupported: PerformanceObserver.supportedEntryTypes.includes('event'), clsSupported: PerformanceObserver.supportedEntryTypes.includes('layout-shift') };
    Object.assign(window, { designEvidence: evidence });
    try { new PerformanceObserver((list) => { for (const e of list.getEntries()) if ((e as PerformanceEventTiming & { interactionId?: number }).interactionId) evidence.interactions.push(e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit); } catch { /* unsupported in WebKit */ }
    try { new PerformanceObserver((list) => { for (const e of list.getEntries()) { const entry = e as PerformanceEntry & { hadRecentInput: boolean; value: number }; if (!entry.hadRecentInput) evidence.cls += entry.value; } }).observe({ type: 'layout-shift', buffered: true }); } catch { /* unsupported */ }
  });
  const shot = async (name: string) => { await page.screenshot({ path: `${dir}/${name}.png`, fullPage: name !== '02-science', scale: 'css', animations: 'disabled' }); };
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'STYRKA' })).toBeVisible(); await shot('01-login');
  await page.goto('/vetenskap'); await expect(page.getByRole('heading', { name: /Vetenskap/, level: 1 })).toBeVisible(); await shot('02-science');
  await signUp(page, uniqueEmail('design')); await onboard(page); await shot('03-today');
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Registrera set 1' })).toBeVisible(); await shot('04-train');
  await page.getByRole('button', { name: 'Byt övning', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.sub-option').first()).toBeVisible(); await shot('05-substitution');
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  const start = performance.now();
  await page.getByRole('button', { name: 'Registrera set 1' }).click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  const logWallMs = performance.now() - start;
  await page.getByRole('button', { name: 'Registrera set 2' }).click();
  await expect(page.getByRole('button', { name: 'Set 2 utfört. Ändra eller ångra' })).toBeVisible(); await shot('06-saved');
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara', exact: true }).click(); await expect(page.getByRole('heading',{name:'Så påverkas kommande träning'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await expect(page.locator('.plan-row-head').first()).toBeVisible(); await page.locator('.plan-row-head').first().click();
  await expect(page.getByLabel('Egen anteckning (privat)').first()).toBeVisible(); await shot('07-plan');
  await page.getByRole('link', { name: 'Utveckling', exact: true }).click();
  await expect(page.locator('.chart').first()).toBeVisible();
  await expect(page.locator('.balance-head')).not.toContainText('Hämtar');
  if (phase === 'after') await page.getByLabel('Välj datapunkt').first().selectOption('0');
  await shot('08-progress');
  await page.locator('.balance-head').click();
  await expect(page.locator('.balance-bar').first()).toBeVisible(); await shot('08b-balance');
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible(); await shot('09-profile');
  const metrics = await page.evaluate(() => (window as unknown as { designEvidence: { interactions: number[]; cls: number } }).designEvidence);
  writeFileSync(`${dir}/lab.json`, JSON.stringify({ phase, theme, project: info.project.name, viewport: page.viewportSize(), logWallMs, ...metrics, caveat: 'Desktop browser emulation. Event durations and Playwright wall clock are lab diagnostics, not real-device INP p75.' }, null, 2));
});
