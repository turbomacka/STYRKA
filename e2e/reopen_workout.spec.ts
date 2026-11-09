import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signUp, onboard, uniqueEmail } from './helpers';

test('reopen an accidentally finished workout, continue offline and add sets without advancing twice', async ({ page, context }, info) => {
  await signUp(page, uniqueEmail('reopen')); await onboard(page);
  await page.getByRole('button', { name: 'Öppna passet', exact: true }).click();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await expect(page.locator('.train-head h1')).toBeVisible();
  const workoutUrl = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Registrera set 1', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click();
  await expect(page.getByRole('heading', { name: 'Passet är sparat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Återuppta pass', exact: true })).toBeEnabled();
  if (info.project.name !== 'iphone-webkit') {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
  }
  await page.getByRole('button', { name: 'Återuppta pass', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(workoutUrl + '$'));
  const first = page.getByRole('listitem', { name: 'Arbetsset 1', exact: true });
  await expect(first.getByRole('button', { name: 'Ångra registrering', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrera set 2', exact: true }).click();
  await page.getByRole('button', { name: 'Lägg till set', exact: true }).click();
  await page.getByRole('button', { name: 'Registrera set 3', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ångra registrering', exact: true })).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ångra registrering', exact: true })).toHaveCount(3);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click();
  await page.getByRole('button', { name: 'Till planen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pass B – bänk och marklyft' })).toBeVisible();
  await page.getByRole('button', { name: 'Visa genomfört pass' }).click();
  await expect(page.locator('.plan-row-head')).toHaveCount(1);
  await expect(page.locator('.plan-row-head')).toContainText('Pass 1');
  await expect(page.locator('.plan-row-head')).toContainText('3 set');
  await page.locator('.plan-row-head').click();
  await expect(page.getByRole('button', { name: 'Återuppta pass', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Synkstatus: Synkat. Visa detaljer' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('reopened-history.png'), fullPage: true });
  // The same control works from history after sync/reload, with the same saved sets.
  await page.reload(); await page.locator('.plan-row-head').click();
  await page.getByRole('button', { name: 'Återuppta pass', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(workoutUrl + '$'));
  await expect(page.getByRole('button', { name: 'Ångra registrering', exact: true })).toHaveCount(3);
});
