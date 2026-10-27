/**
 * ÄA-BAL-001 i UI: tomläge (BAL01), fördelning och planjämförelse, ett förslag med förhandsvisning utan sparande
 * (BAL32), "Inte nu" (BAL31), metodlänk och tillgänglighet (BAL37: tangentbord, axe, 320 px, mörkt läge, reducerad rörelse).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, shooter, signUp, uniqueEmail } from './helpers';

async function axe(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${name}: ${v.id} – ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

async function noHorizontalScroll(page: Page) {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.cw + 1);
}

/** Ordinarie pass där bara första setet loggas (resten hoppas över) – ger ett delvis genomfört pass. */
async function shortSession(page: Page) {
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await page.getByRole('button', { name: 'Registrera set 1' }).click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click(); await expect(page.getByRole('heading',{name:'Så påverkas kommande träning'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
}

test('Balans under Utveckling: tomläge, fördelning, förslag, förhandsvisning och avböjande', async ({ page }, info) => {
  const shot = shooter(page, info);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signUp(page, uniqueEmail('balans'));
  await onboard(page);
  await page.getByRole('link', { name: 'Utveckling' }).click();

  // BAL01: tomläge, ingen poäng.
  const head = page.getByRole('button', { name: /^Balans/ });
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(head).toContainText('Se hur din träning är fördelad');
  // BAL37: tangentbord öppnar sektionen.
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('När du har genomfört några pass kan du se hur träningen fördelas mellan olika rörelser.')).toBeVisible();
  await expect(page.getByText(/poäng|betyg/i)).toHaveCount(0);
  await axe(page, 'balans-tom');

  // En hel A/B/C-rotation: A och C har vertikalt drag, B har horisontell rodd.
  await shortSession(page);
  await shortSession(page);
  await shortSession(page);
  await page.getByRole('link', { name: 'Utveckling' }).click();
  const section = page.locator('section.balance');
  await expect(head).toHaveAttribute('aria-expanded', 'true'); // öppet läge kom ihåg
  await expect(section.getByText(/Genomförd träning senaste 28 dagarna/)).toBeVisible();
  await expect(section.getByText(/Staplarna visar arbetsset i olika rörelsemönster\. De mäter inte muskelstyrka eller skaderisk\./)).toBeVisible();
  const vertical = section.locator('li.balance-row', { hasText: 'Vertikalt drag' });
  await expect(vertical).toContainText('0 arbetsset');
  await expect(vertical).toContainText('0 av 4 planerade set i genomförda ordinarie pass');
  await expect(section.getByText('Du har genomfört tre träningspass under de senaste 28 dagarna.')).toBeVisible();
  await expect(section.getByText('Vi behöver fler jämförbara prestationer innan vi kan jämföra utvecklingen mellan övningar.')).toBeVisible();
  await expect(section.getByText(/Balans är en hjälp att förstå och planera din träning\. Den kan inte avgöra om du kommer att skadas\./)).toBeVisible();
  // Högst ett förslag, transparent underlag.
  await expect(section.getByText(/Du har tränat mindre vertikalt drag än planerat i dina genomförda pass \(0 av 4 planerade arbetsset\)/)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Visa möjlig justering' })).toHaveCount(1);
  await shot('BAL-1-balans');
  await axe(page, 'balans-data');
  await noHorizontalScroll(page);

  // Antal planversioner innan förhandsvisning och avböjande.
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await page.getByText('Planens omfattning och tidigare versioner',{exact:true}).click();
  const versionLine = page.getByText(/^Planversion /);
  await expect(versionLine).toBeVisible();
  const versionBefore = await versionLine.textContent();
  await page.getByRole('link', { name: 'Utveckling' }).click();

  // BAL32: förhandsvisning sparar inget; den godkända katalogen ger ingen tillåten justering.
  await section.getByRole('button', { name: 'Visa möjlig justering' }).click();
  await expect(section.getByText('Det går inte att föreslå en justering inom dina nuvarande ramar.')).toBeVisible();

  // BAL31: "Inte nu" – förslaget återkommer inte vid nya öppningar.
  await section.getByRole('button', { name: 'Inte nu' }).click();
  await expect(section.getByText('Förslaget visas inte igen så länge underlaget är detsamma.')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(section.getByRole('heading', { name: 'Ditt nästa steg' })).toBeVisible();
    // Samma kandidat återkommer inte; en annan, sakligt skild kandidat (näst största lucka) får visas.
    await expect(section.getByText(/mindre vertikalt drag än planerat/)).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Visa möjlig justering' })).toHaveCount(await section.getByText(/än planerat i dina genomförda pass/).count());
  }
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await expect(versionLine).toHaveText(versionBefore!); // ingen ny planrevision av förhandsvisning eller avböjande

  // Metodlänk till /vetenskap.
  await page.getByRole('link', { name: 'Utveckling' }).click();
  await section.getByRole('link', { name: 'Så fungerar Balans' }).click();
  await expect(page.locator('#balans')).toBeInViewport();
  await expect(page.locator('#balans')).toContainText('praktisk produktklassificering');
});

test.describe('BAL37: mörkt läge och 320 px', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 320, height: 640 } });
  test('Balans läsbar i mörkt läge på smal skärm', async ({ page }, info) => {
    const shot = shooter(page, info);
    await signUp(page, uniqueEmail('balans-dark'));
    await onboard(page);
    await shortSession(page);
    await page.getByRole('link', { name: 'Utveckling' }).click();
    await page.getByRole('button', { name: /^Balans/ }).click();
    await expect(page.locator('section.balance li.balance-row').first()).toBeVisible();
    await axe(page, 'balans-mork');
    await noHorizontalScroll(page);
    await shot('BAL-2-balans-morkt-320');
  });
});
