import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { onboard, signUp, uniqueEmail } from './helpers';

test('optional set feelings survive edits and offline reload; initial strength is a separate reference', async ({page,context},info) => {
  test.setTimeout(120_000);
  const dir=`docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/effort/${info.project.name}`; mkdirSync(dir,{recursive:true});
  await signUp(page,uniqueEmail('effort')); await onboard(page);
  await page.getByRole('button',{name:'Öppna passet'}).click();
  await page.getByRole('button',{name:'Starta passet',exact:true}).click();
  const first=page.getByRole('listitem',{name:'Arbetsset 1',exact:true});
  const second=page.getByRole('listitem',{name:'Arbetsset 2',exact:true});
  await first.getByRole('button',{name:'Registrera set 1',exact:true}).click();
  const feedback=first.getByRole('group',{name:'Hur kändes setet? Set 1',exact:true});
  await expect(first.getByRole('button',{name:'Set 1 utfört. Ändra eller ångra'})).toBeVisible();
  await expect(feedback.locator('[aria-pressed]')).toHaveCount(5);
  await expect(feedback.locator('[aria-pressed="true"]')).toHaveCount(0);
  const timer=page.getByRole('region',{name:'Vilotimer'}); await expect(timer).toBeVisible();
  for(const button of await feedback.getByRole('button').all()) {
    const box=await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48);
  }
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({path:`${dir}/question-light.png`,fullPage:true});
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`${dir}/question-dark.png`,fullPage:true});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  await feedback.getByRole('button',{name:'Tungt',exact:true}).click();
  await expect(feedback).toContainText('Känsla: Tungt');
  await expect(feedback.getByRole('button',{name:'Ändra känsla'})).toBeFocused();
  await expect(timer).toBeVisible();
  // Correcting the actual result asks again rather than reusing an old feeling.
  await first.getByRole('button',{name:'Set 1 utfört. Ändra eller ångra'}).click();
  await first.getByLabel('Vikt (kg)',{exact:true}).fill('75');
  await first.getByRole('button',{name:'Stäng',exact:true}).click();
  await expect(feedback.locator('[aria-pressed="true"]')).toHaveCount(0);
  await feedback.getByRole('button',{name:'Senare',exact:true}).click();
  // The explicit max answer applies only to this actual 80 kg x 6 set (96 kg e1RM).
  await second.getByRole('button',{name:/Vikt set 2:/}).click();
  await second.getByLabel('Vikt (kg)',{exact:true}).fill('80');
  await second.getByLabel('Repetitioner',{exact:true}).fill('6');
  await second.getByRole('button',{name:'Stäng',exact:true}).click();await second.getByRole('button',{name:'Registrera set 2',exact:true}).click();
  await second.getByRole('button',{name:/Maxansträngning/}).click();
  await expect(second).toContainText('Känsla: Maxansträngning');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await context.setOffline(true); await page.reload();
  await expect(second).toContainText('Känsla: Maxansträngning');
  await second.getByRole('button',{name:'Ändra känsla'}).click();
  await second.getByRole('button',{name:'Ta bort svar'}).click();
  await expect(second).toContainText('Känsla: inte angiven');
  await page.reload(); await expect(second).not.toContainText('Känsla: Maxansträngning');
  await second.getByRole('button',{name:/Maxansträngning/}).click();
  await expect(second).toContainText('Känsla: Maxansträngning');
  await context.setOffline(false);
  await page.getByRole('button',{name:'Avsluta',exact:true}).click();
  await page.getByRole('button',{name:'Avsluta och spara',exact:true}).click(); await expect(page.getByRole('heading',{name:'Så påverkas kommande träning'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
  await page.getByRole('link',{name:'Utveckling',exact:true}).click();
  await expect(page.locator('.latest-strength')).toContainText('Senaste maxskattning: 96 kg');
  await expect(page.locator('.latest-strength')).toContainText('Från registrerat set');
  await expect(page.getByText('Angiven styrkeuppgift · separat referens',{exact:true})).toBeVisible();
  await expect(page.locator('.chart path[stroke-dasharray]')).toHaveCount(0);
  await page.getByText('Set, sidor och uppvärmning',{exact:true}).click();
  await expect(page.locator('details.training-history')).toContainText('Känsla: Maxansträngning');
  await page.screenshot({path:`${dir}/progress-dark.png`,fullPage:true});
});
