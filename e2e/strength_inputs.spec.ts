import { expect, test } from '@playwright/test';
import { onboard, signUp, uniqueEmail } from './helpers';
import { independentIntro, reachSource } from './introScenario';

test('separate strength views preserve independent values, drafts, back navigation, offline saves and profile editing', async ({ page, context }, info) => {
  await signUp(page, uniqueEmail('strength'));
  await independentIntro(page, context, `docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/regression/onboarding/${info.project.name}`);
});

test('incomplete entries can be postponed and source choice does not delete confirmed entries', async ({ page }) => {
  await signUp(page, uniqueEmail('postpone')); await reachSource(page);
  await page.getByText('Ange styrkeuppgifter nu', { exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
  await page.getByRole('button', { name: 'Max för 1 repetition', exact: true }).click();
  await page.getByLabel('Vikt (kg)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Spara och lägg till en uppgift' }).click();
  await page.getByRole('button', { name: 'Ett vanligt träningsset', exact: true }).click();
  await page.getByLabel('Vikt (kg)', { exact: true }).fill('70');
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
  await expect(page.getByLabel('Repetitioner (1–8)')).toBeFocused();
  await page.getByRole('button', { name: 'Fyll i senare', exact: true }).click();
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await page.getByRole('button', { name: 'Ett vanligt träningsset', exact: true }).click();
  await expect(page.getByLabel('Vikt (kg)', { exact: true })).toHaveValue('70');
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await page.getByText('Utgå från mina träningspass', { exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt', exact: true }).click();
  await page.getByRole('button', { name: 'Skapa min plan', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  const squat = page.locator('.workout-card').first();
  await squat.locator('.workout-title').click();
  await expect(squat.getByRole('button',{name:/Vikt set 1/})).toContainText('Välj vikt');
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('link', { name: 'Övningar: nivå, viktsteg och maxvärden' }).click();
  await expect(page.getByRole('group', { name: 'Max för 1 repetition', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('100');
  await expect(page.getByRole('group', { name: 'Ett vanligt träningsset', exact: true })).toHaveCount(0);
});

test('new user can create a plan without strength data and change the source later', async ({ page }) => {
  await signUp(page, uniqueEmail('no-strength')); await onboard(page, { estimates: false });
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Utgå från mina träningspass/ })).toBeChecked();
  await page.getByText('Använd även mina styrkeuppgifter', { exact: true }).click();
  await expect(page.getByText('Sparat. Gäller från nästa pass.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: /Använd även mina styrkeuppgifter/ })).toBeChecked();
});
