/**
 * CR 2026-10-10-01 del A: publik vetenskaps- och transparenssida.
 * SUB17 (utloggad), SUB18 (direktlänk till källa och regel), länk från Profil och "Om regeln", tillgänglighet.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, shooter, signUp, uniqueEmail } from './helpers';

async function axe(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${name}: ${v.id} – ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

test('SUB17: utloggad besökare når /vetenskap från välkomstsidan; källor och begränsningar visas', async ({ page }, info) => {
  const shot = shooter(page, info);
  await page.goto('/');
  await page.getByRole('link', { name: 'Vetenskapen bakom STYRKA' }).click();
  await expect(page).toHaveURL(/\/vetenskap$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Vetenskapen bakom STYRKA' })).toBeVisible();
  // Användartext, källor och begränsningar utan interna versions- eller filhänvisningar.
  await expect(page.getByText('Senast uppdaterad', { exact: true })).toBeVisible();
  await expect(page.getByText('Forskningen ger vägledning, men visar inte att STYRKA:s förslag är optimala eller medicinskt säkra för just dig.')).toBeVisible();
  await expect(page.locator('#e-kallor ol > li')).toHaveCount(16); // 13 ur produktägarens register + 3 märkta tillägg (EVIDENS/2.1.0)
  await expect(page.locator('#balans')).toContainText('Så fungerar balansförslagen');
  await expect(page.locator('#kalla-gullett2009')).toContainText('2009');
  await expect(page.locator('#kalla-saeterbakken2013')).toContainText('shoulder presses');
  await expect(page.getByText('Appens antagande – inte vetenskapligt validerat').first()).toBeVisible();
  await expect(page.locator('#d-begransningar')).toContainText('Begränsningar');
  await expect(page.locator('#e-kallor')).toBeAttached();
  // Sidan är längre än WebKits maxgräns för helsidesbilder – endast första skärmen.
  await shot('VET-1-vetenskap', { fullPage: false });
  await axe(page, 'vetenskap');
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.cw + 1);
  // Inga personuppgifter eller inloggningskrav; tillbaka till inloggningen.
  await page.getByRole('link', { name: /Till inloggning/ }).first().click();
  await expect(page.getByRole('button', { name: 'Logga in', exact: true })).toBeVisible();
});

test('SUB18: direktlänk till algoritmregel och källa (DOI) fungerar', async ({ page }) => {
  await page.goto('/vetenskap#regel-forsta-exponering');
  await expect(page.locator('#regel-forsta-exponering')).toBeInViewport();
  await expect(page.locator('#regel-forsta-exponering')).toContainText('0,60');
  await page.goto('/vetenskap#kalla-gullett2009');
  await expect(page.locator('#kalla-gullett2009')).toBeInViewport();
  const doi = page.locator('#kalla-gullett2009 a[href^="https://doi.org/"]').first();
  await expect(doi).toHaveAttribute('href', 'https://doi.org/10.1519/JSC.0b013e31818546bb');
  // Sökning filtrerar utan att lämna sidan.
  await page.getByLabel('Sök bland påståenden, regler och källor').fill('frontböj');
  await expect(page.getByText(/\d+ träffar/)).toBeVisible();
});

test('inloggad: Profil → Om STYRKA → Vetenskap och metoder; "Om regeln" leder till regelns ankare', async ({ page }) => {
  await signUp(page, uniqueEmail('vet'));
  await onboard(page);
  await page.getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('link', { name: 'Vetenskap och metoder' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vetenskapen bakom STYRKA' })).toBeVisible();
  await page.getByRole('link', { name: /Till Profil|Tillbaka/ }).first().click();
  await page.goto('/');
  await page.getByRole('button', { name: 'Starta dagens pass' }).click();
  await expect(page.getByRole('button', { name: 'Starta', exact: true })).toBeEnabled();
  await page.getByText('Varför det här förslaget?').first().click();
  await page.getByRole('link', { name: /^Om regeln/ }).first().click();
  await expect(page).toHaveURL(/\/vetenskap#regel-/);
  const anchor = new URL(page.url()).hash;
  await expect(page.locator(anchor)).toBeInViewport();
});
