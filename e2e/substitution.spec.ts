/**
 * CR 2026-10-10-01 del B i UI: "Byt övning" i passförhandsvisning och aktivt pass, hjälpskattning med
 * bekräftad startvikt, kalibreringsläge, "kg per hantel", lätt/lagom/för tungt, "Använd framöver" + återställ.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, shooter, signUp, uniqueEmail } from './helpers';

async function axe(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${name}: ${v.id} – ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

test('byte före start (hjälpskattning, Använd framöver) och under passet (kalibrering per hantel, ≤2 tryck)', async ({ page }, info) => {
  const shot = shooter(page, info);
  await signUp(page, uniqueEmail('byt'));
  await onboard(page);
  await page.getByRole('button', { name: 'Starta dagens pass' }).click();
  await expect(page.getByRole('button', { name: 'Starta', exact: true })).toBeEnabled();

  // Förhandsvisning: knäböj → frontböj.
  await page.getByRole('button', { name: 'Byt övning: Knäböj' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Byt övning' })).toBeVisible();
  const options = sheet.getByRole('list', { name: 'Föreslagna alternativ' }).getByRole('button');
  expect(await options.count()).toBeLessThanOrEqual(3);
  await expect(sheet.getByRole('button', { name: /^Frontböj\. Nära variant/ })).toBeVisible();
  await shot('SUB-1-byt-lista');
  await axe(page, 'bytesvy');
  await sheet.getByRole('button', { name: /^Frontböj\./ }).click();
  await expect(sheet.getByRole('heading', { name: 'Frontböj' })).toBeVisible();
  await sheet.getByRole('radio', { name: 'Ja' }).click();
  await expect(sheet.getByText('Uppskattning – bekräfta vikten med ett kontrollerat första set')).toBeVisible();
  const start = sheet.getByLabel('Startvikt (kg)');
  await expect(start).not.toHaveValue('');
  await expect(sheet.getByRole('radio', { name: 'Bara idag' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', { name: 'Använd framöver' }).click();
  await expect(sheet.getByText(/Ditt mål för Knäböj ligger kvar/)).toBeVisible();
  await shot('SUB-2-bekrafta-uppskattning');
  await axe(page, 'bytesvy-bekräfta');
  await sheet.getByRole('button', { name: 'Byt till Frontböj' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Frontböj' })).toBeVisible();
  await expect(page.getByText('· ersätter Knäböj')).toBeVisible();

  // Aktivt pass: meddelande om osäker vikt.
  await page.getByRole('button', { name: 'Starta', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Frontböj' })).toBeVisible();
  await expect(page.getByText('Bytt från knäböj till frontböj. Vikten är ett första, osäkert förslag och kalibreras med din prestation.')).toBeVisible();
  await shot('SUB-3-pass-bytt');

  // Bänkpress → hantelpress liggande under passet: två tryck efter "Byt övning".
  await page.getByRole('button', { name: 'Nästa övning' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bänkpress' })).toBeVisible();
  await page.getByRole('button', { name: 'Byt övning' }).click();
  let taps = 0;
  await page.getByRole('dialog').getByRole('button', { name: /^Hantelpress liggande\./ }).click();
  taps++;
  await page.getByRole('button', { name: 'Byt till Hantelpress liggande' }).click();
  taps++;
  expect(taps).toBeLessThanOrEqual(2);
  await expect(page.getByRole('heading', { level: 1, name: 'Hantelpress liggande' })).toBeVisible();
  await expect(page.getByText('Vikt anges per hantel.')).toBeVisible();
  await expect(page.getByText(/Ingen tillförlitlig vikt ännu/).first()).toBeVisible();
  await expect(page.getByText(/Testa inte maximal vikt/)).toBeVisible();

  // Kontrollerat första set med egen vikt; "För tungt" ⇒ nästa set ett viktsteg lättare (2 kg per hantel).
  await page.getByRole('button', { name: /^Vikt set 1/ }).click();
  await page.getByLabel('Vikt (kg per hantel)').fill('20');
  await page.getByRole('listitem', { name: /^Set 1,/ }).getByRole('button', { name: 'Klart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Vikt set 1: 20 kilo per hantel/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Vikt set 2: 20 kilo per hantel/ })).toBeVisible();
  const effort = page.getByRole('group', { name: /Hur kändes setet\? Set 1/ });
  await effort.getByRole('button', { name: 'För tungt' }).click();
  await expect(effort.getByRole('button', { name: 'För tungt' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Vikt set 2: 18 kilo per hantel/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Vikt set 2/ })).toHaveText(/18\s*kg\/hantel/);
  await shot('SUB-4-kalibrering-per-hantel');
  await axe(page, 'pass-kalibrering');

  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Spara passet' }).click();
  await page.getByRole('button', { name: 'Till Idag' }).click();

  // Permanent byte syns i profilen och kan återställas.
  await page.getByRole('link', { name: 'Profil' }).click();
  await expect(page.getByRole('heading', { name: 'Bytta övningar' })).toBeVisible();
  await expect(page.getByText(/Knäböj →/)).toBeVisible();
  await page.getByRole('button', { name: 'Återställ knäböj' }).click();
  await expect(page.getByText('Knäböj är återställd från nästa pass.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bytta övningar' })).toHaveCount(0);
});
