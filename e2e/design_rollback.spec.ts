import { expect, test } from '@playwright/test';
import { onboard, signUp, uniqueEmail } from './helpers';

test('DES rollback: classic theme and functional set/card without migration', async ({ page }) => {
  test.skip(process.env.VITE_FLAG_DESIGN_V2 !== 'false', 'Run explicitly against a fresh classic build');
  await signUp(page, uniqueEmail('des-classic')); await onboard(page);
  await expect(page.locator('html')).toHaveAttribute('data-design', 'classic');
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim())).toBe('#0b5cad');
  await page.getByRole('button', { name: 'Öppna passet' }).click(); await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await page.getByRole('button', { name: 'Registrera set 1' }).click(); await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click(); await page.getByRole('button', { name: 'Avsluta och spara', exact: true }).click(); await expect(page.getByRole('heading',{name:'Så påverkas nästa pass'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click(); await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
  await page.getByRole('link', { name: 'Plan', exact: true }).click(); const head = page.locator('.plan-row-head').first();
  await head.click(); await expect(page.getByLabel('Egen anteckning (privat)')).toBeVisible();
  await head.click(); await expect(page.getByLabel('Egen anteckning (privat)')).not.toBeVisible();
});
