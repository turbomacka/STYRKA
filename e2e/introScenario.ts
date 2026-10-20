import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export async function reachSource(page: Page) {
  await page.getByText('Jag bekräftar att jag är vuxen').click();
  await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hur vill du hitta dina startvikter?' })).toBeVisible();
}
export async function independentIntro(page: Page, context: BrowserContext, dir: string) {
  mkdirSync(dir, { recursive: true });
  await reachSource(page);
  await expect(page.getByRole('radio', { name: /Utgå från mina träningspass/ })).toBeChecked();
  await page.screenshot({ path: `${dir}/source-light.png`, fullPage: true, animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: `${dir}/source-dark.png`, fullPage: true, animations: 'disabled' });
  await page.getByText('Ange styrkeuppgifter nu', { exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knäböj', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Max för 1 repetition', exact: true }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await page.getByLabel('Vikt (kg)', { exact: true }).fill('100');
  await expect(page.getByRole('status')).toContainText('Redo att fortsätta');
  await page.getByRole('button', { name: 'Spara och lägg till en uppgift' }).click();
  await expect(page.getByRole('button', { name: /Max för 1 repetition/ })).toContainText('100 kg · sparat');
  await page.getByRole('button', { name: 'Max för 3 repetitioner', exact: true }).click();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toHaveValue('');
  await page.getByLabel('Vikt (kg)', { exact: true }).fill('92,5');
  await page.reload();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toHaveValue('92,5');
  await page.getByRole('button', { name: 'Spara och lägg till en uppgift' }).click();
  await page.getByRole('button', { name: 'Ett vanligt träningsset', exact: true }).click();
  await page.getByLabel('Vikt (kg)', { exact: true }).fill('70');
  await page.getByLabel('Repetitioner (1–8)').fill('8');
  await page.getByText('Fler detaljer', { exact: false }).click();
  await page.getByLabel('Hur många fler repetitioner hade du kunnat göra?').selectOption('2');
  await page.getByLabel('När gjorde du det? (valfritt)').fill('2026-10-01');
  await page.screenshot({ path: `${dir}/entry-dark.png`, fullPage: true, animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.screenshot({ path: `${dir}/entry-light.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Spara och lägg till en uppgift' }).click();
  await expect(page.getByRole('button', { name: /Ett vanligt träningsset 70 kg/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toHaveValue('70');
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await page.getByRole('button', { name: /Max för 3 repetitioner/ }).click();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toHaveValue('92,5');
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await page.getByRole('button', { name: /Max för 1 repetition/ }).click();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toHaveValue('100');
  const size = await page.getByRole('button', { name: 'Fortsätt', exact: true }).boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(48);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  // No page overflow does not rule out overlapping labels within the progress grid.
  expect(await page.locator('.intro-lifts li, .intro-progress li').evaluateAll(items => items.every(item => {
    const cell = item.getBoundingClientRect();
    return [...item.children].every(child => {
      const box = child.getBoundingClientRect();
      return box.left >= cell.left - 1 && box.right <= cell.right + 1 && box.top >= cell.top - 1 && box.bottom <= cell.bottom + 1;
    });
  }))).toBe(true);
  await page.screenshot({ path: `${dir}/entry-320-200percent.png`, fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bänkpress', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fyll i senare', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Marklyft', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fyll i senare', exact: true }).click();
    await expect(page.getByText('Kan fyllas i senare')).toHaveCount(2);
    await expect(page.getByText('✓ 3 uppgifter sparade')).toBeVisible();
    await page.screenshot({ path: `${dir}/summary.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
    await page.getByRole('button', { name: 'Skapa min plan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Min träningsplan' })).toBeVisible();
    await page.getByRole('link', { name: 'Profil', exact: true }).click();
    await page.getByRole('link', { name: 'Övningar: nivå, viktsteg och maxvärden' }).click();
    await expect(page.getByRole('group', { name: 'Max för 1 repetition', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('100');
    await expect(page.getByRole('group', { name: 'Max för 3 repetitioner', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('92,5');
    await expect(page.getByRole('group', { name: 'Ett vanligt träningsset', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('70');
    await page.getByRole('group', { name: 'Max för 3 repetitioner', exact: true }).getByLabel('Vikt (kg)', { exact: true }).fill('90');
    await page.getByRole('button', { name: 'Spara styrkeuppgifter' }).click();
    await expect(page.getByText('Styrkeuppgifterna sparade. Tidigare pass ändras inte.')).toBeVisible();
  } finally { await context.setOffline(false); }
  await page.reload();
  await expect(page.getByRole('group', { name: 'Max för 1 repetition', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('100');
  await expect(page.getByRole('group', { name: 'Max för 3 repetitioner', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('90');
}
