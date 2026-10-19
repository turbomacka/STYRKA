/**
 * G2: träning kan startas och loggas med förifyllda värden, en tryckregistrering, paus/återuppta/ångra.
 * Interaktionsbudget (01 §3.3) mäts med antal klick.
 */
import { expect, test } from '@playwright/test';
import { onboard, shooter, signUp, uniqueEmail } from './helpers';

test('S01–S12: konto, intro, starta pass (≤2 tryck), logga set (1 tryck), ångra, paus, avsluta, utveckling', async ({ page }, info) => {
  const shot = shooter(page, info);
  await page.goto('/');
  await shot('S01-valkommen');
  await signUp(page, uniqueEmail('core'));
  await onboard(page, { screenshot: shot });
  await expect(page.getByRole('region',{name:'Nästa pass'})).toBeVisible();
  await shot('S06-idag');

  // Idag → första planerade set: 2 tryck.
  let clicks = 0;
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  clicks++;
  await expect(page.getByRole('button', { name: 'Starta passet', exact: true })).toBeEnabled();
  await shot('S07-forhandsvisning');
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  clicks++;
  const firstLog = page.getByRole('button', { name: 'Registrera set 1' });
  await expect(firstLog).toBeVisible();
  expect(clicks).toBeLessThanOrEqual(2);
  await shot('S08-trana');

  // Förifyllt set: 1 tryck.
  await firstLog.click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('registrerat på enheten');
  await shot('S08-trana-set-loggat');

  // Justera bara reps: 2 handlingar (tryck på reps + Klart), sifferinmatning ej räknad.
  await page.getByRole('button', { name: /Repetitioner set 2/ }).click();
  await page.getByLabel('Repetitioner', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Stäng',exact:true }).click();
  await expect(page.getByRole('button',{name:'Registrera set 2'})).toBeVisible();
  await page.getByRole('button',{name:'Registrera set 2'}).click();
  await expect(page.getByRole('button', { name: 'Set 2 utfört. Ändra eller ångra' })).toBeVisible();

  // Ångra set 2.
  await page.getByRole('button', { name: 'Set 2 utfört. Ändra eller ångra' }).click();
  await page.getByRole('button', { name: 'Ångra registrering' }).last().click();
  await expect(page.getByRole('button', { name: 'Registrera set 2' })).toBeVisible();

  // Paus och återuppta.
  await page.getByRole('button', { name: 'Pausa pass' }).click();
  await expect(page.getByText('Passet är pausat. Dina set är sparade.')).toBeVisible();
  await page.getByRole('button', { name: 'Återuppta pass' }).click();

  // Byt övning (S09) på sista övningen.
  await page.getByRole('button',{name:'Hela passet'}).click();
  const last=page.locator('.workout-card').last();await last.locator('.workout-title').click();
  await last.getByRole('button',{name:'Till övningen'}).click();
  await page.getByRole('button', { name: 'Byt övning' }).click();
  await shot('S09-byt-ovning');
  await page.getByRole('button', { name: 'Stäng' }).click();

  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await expect(page.getByText(/set/).first()).toBeVisible();
  await shot('S11-avsluta');
  await page.getByRole('button', { name: 'Avsluta och spara' }).click();
  await expect(page.getByText('Passet är sparat',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();

  await page.getByRole('link', { name: 'Utveckling' }).click();
  await expect(page.getByRole('heading', { name: 'Utveckling' })).toBeVisible();
  await expect(page.getByText('Faktisk prestation', { exact: true })).toBeVisible();
  await shot('S12-utveckling');

  await page.getByRole('link', { name: 'Profil' }).click();
  await shot('S13-profil');
  await page.getByRole('link', { name: 'Begränsningar och hälsouppgifter' }).click();
  await shot('S14-begransningar');
  await page.goto('/profil/data');
  await shot('S15-data-konto');
  await page.goto('/synk');
  await expect(page.getByText('Inga konflikter')).toBeVisible();
  await shot('S16-synk');
});

test('S10: spontanpass med standardtid nås med 3 tryck från Idag', async ({ page }) => {
  await signUp(page, uniqueEmail('extra'));
  await onboard(page);
  let clicks = 0;
  await page.getByRole('button', { name: 'Träna ett spontanpass' }).click();
  clicks++;
  await page.getByRole('button', { name: 'Visa förslag' }).click();
  clicks++;
  await expect(page.getByRole('button', { name: 'Starta passet', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  clicks++;
  await expect(page.getByRole('button', { name: 'Registrera set 1' })).toBeVisible();
  expect(clicks).toBe(3);
});
