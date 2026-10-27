/**
 * ÄA-PLAN-001 i UI: två tryck från Idag till hela planen (PL01/§7), struktur utan framtidsvikt (PL02), nästa pass
 * med rekommendation (PL03), genomfört pass med verkliga set och anteckning (PL05/PL06/PL14), planversioner (PL15),
 * utskrift (PL22/PL23) och åtskilda vikttyper (PL26). Tillgänglighet med axe.
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

test('Min träningsplan: kommande, genomförda, anteckning, planversioner och utskrift', async ({ page }, info) => {
  const shot = shooter(page, info);
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });
  await signUp(page, uniqueEmail('plan'));
  await onboard(page);

  // Högst två tryck från Idag till hela framtidslistan.
  let taps = 0;
  await page.getByText('Planens omfattning och tidigare versioner',{exact:true}).click();
  await page.getByRole('radio',{name:'36',exact:true}).click();
  taps++;
  const upcoming = page.getByRole('list', { name: 'Kommande pass' });
  await expect(upcoming.locator(':scope > li')).toHaveCount(36);
  expect(taps).toBeLessThanOrEqual(2);
  await expect(page.getByRole('heading', { name: 'Min träningsplan' })).toBeVisible();
  await expect(page.getByText('Planen är preliminär och uppdateras efter varje pass.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pass 1 · .*Nästa/ })).toBeVisible();
  await shot('PLAN-1-kommande');
  await axe(page, 'plan-kommande');
  await noHorizontalScroll(page);

  // PL02: pass 20 – struktur utan numerisk framtidsvikt.
  await page.getByRole('button', { name: /^Pass 20 · / }).click();
  const p20 = upcoming.locator(':scope > li').nth(19);
  await expect(p20.getByText('Vikt beräknas närmare passet').first()).toBeVisible();
  await expect(p20.locator('.ex-line').first()).toContainText(/\d+ arbetsset/);
  await expect(p20.getByText(/\d+(,\d+)? kg/)).toHaveCount(0);

  // Horisont 12 / 72.
  await page.getByRole('radio', { name: '72' }).click();
  await expect(upcoming.locator(':scope > li')).toHaveCount(72);
  await page.getByRole('radio', { name: '12' }).click();
  await expect(upcoming.locator(':scope > li')).toHaveCount(12);

  // PL03/PL26: nästa pass – rekommenderad vikt, öppnas i befintlig förhandsvisning (ett tryck till).
  await page.getByRole('button', { name: /^Pass 1 · / }).click();
  const p1 = upcoming.locator(':scope > li').first();
  await expect(p1.getByText('Rekommenderad vikt')).toBeVisible();
  await expect(p1.getByText(/\d+(,\d+)? kg/).first()).toBeVisible();
  await shot('PLAN-2-nasta-pass');
  await p1.getByRole('button', { name: 'Öppna passet' }).click();
  await expect(page.getByRole('button', { name: 'Starta passet', exact: true })).toBeEnabled();

  // Genomför ett delvis pass (ett set).
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await page.getByRole('button', { name: 'Registrera set 1' }).click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click(); await expect(page.getByRole('heading',{name:'Så påverkas kommande träning'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();

  // Genomförda: verkliga set, status och åtskilda vikttyper.
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await page.getByRole('radio', { name: 'Genomförda' }).click();
  const done = page.getByRole('list', { name: 'Genomförda pass' });
  await expect(done.locator(':scope > li')).toHaveCount(1);
  await page.getByRole('button', { name: /^Pass 1 · .*Delvis genomfört/ }).click();
  await expect(done.getByText('Utfört', { exact: true }).first()).toBeVisible();
  await expect(done.getByText(/Rekommenderat då/).first()).toBeVisible();
  await expect(done.getByText('Inte utfört').first()).toBeVisible();
  // PL14: anteckning sparas lokalt först och finns kvar efter omladdning.
  const note = done.getByLabel('Egen anteckning (privat)');
  await note.fill('Fungerade bra, men knät trött efteråt');
  await note.blur();
  await expect(done.getByText(/Sparad på enheten|Synkad/)).toBeVisible();
  await shot('PLAN-3-genomforda');
  await axe(page, 'plan-genomforda');
  await page.reload();
  await page.getByRole('button', { name: /^Pass 1 · / }).click();
  await expect(page.getByLabel('Egen anteckning (privat)')).toHaveValue('Fungerade bra, men knät trött efteråt');

  // PL23: utskrift utan anteckningar som standard, med anteckningar efter aktivt val.
  await page.getByRole('button', { name: 'Skriv ut / Spara som PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Ögonblicksbild – framtida plan kan ändras')).toBeVisible();
  await expect(page.getByText(/Anteckning: Fungerade bra/)).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.getByLabel('Ta med mina anteckningar').check();
  await page.getByRole('button', { name: 'Skriv ut / Spara som PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(2);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText(/Anteckning: Fungerade bra/)).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // Kommande börjar nu på pass 2; tidigare planversion finns med orsak (PL05/PL15).
  await page.getByRole('radio', { name: 'Kommande' }).click();
  await expect(page.getByRole('button', { name: /^Pass 2 · .*Nästa/ })).toBeVisible();
  await page.getByText('Planens omfattning och tidigare versioner',{exact:true}).click();
  await page.getByText('Tidigare planversioner').click();
  await expect(page.getByRole('button', { name: /Första planen/ })).toBeVisible();
  await page.getByRole('button', { name: /Första planen/ }).click();
  await expect(page.getByText('Du tittar på en tidigare planversion.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pass 1 · / })).toBeVisible();
  await page.getByRole('button', { name: 'Visa aktuell plan' }).click();
  await expect(page.getByRole('button', { name: /^Pass 2 · .*Nästa/ })).toBeVisible();

  // PL22: utskrift av 36 kommande pass med datumstämpel, alla expanderade med skrivrader.
  await page.getByRole('radio', { name: '36' }).click();
  await page.getByRole('button', { name: 'Skriv ut / Spara som PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(3);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText(/Ögonblicksbild – framtida plan kan ändras · Skapad/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Kommande pass' }).locator(':scope > li')).toHaveCount(36);
  await expect(page.locator('.plan-row-body')).toHaveCount(36);
  await expect(page.locator('.print-write').first()).toBeVisible();
  await shot('PLAN-4-utskrift', { fullPage: false });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  // Collapsed panels now retain drafts in the DOM, but are invisible and inert.
  await expect(page.locator('.plan-row-body:visible')).toHaveCount(0);
  await expect(page.locator('.expandable:not([inert])')).toHaveCount(0);
});
