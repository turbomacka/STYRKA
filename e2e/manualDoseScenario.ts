import {expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdirSync} from 'node:fs';

/** Same visible adaptation check locally and on the exact published artifact. */
export async function runManualDoseScenario(page:Page,dir:string):Promise<void> {
  await page.getByRole('button',{name:'Öppna passet',exact:true}).click();
  await page.getByRole('button',{name:'Starta passet',exact:true}).click();
  await expect(page.locator('.train-head h1')).toHaveText('Knäböj');
  const rows=page.getByRole('listitem',{name:/^Arbetsset \d+$/});
  const count=await rows.count();expect(count).toBeGreaterThanOrEqual(2);
  for(let i=1;i<=count;i++) {
    const row=page.getByRole('listitem',{name:`Arbetsset ${i}`,exact:true});
    await row.getByRole('button',{name:new RegExp(`Vikt set ${i}:`)}).click();
    await row.getByLabel('Vikt (kg)',{exact:true}).fill('50');
    await expect(row.getByRole('status')).toContainText('Planen sparad');
    await row.getByLabel('Repetitioner',{exact:true}).fill('10');
    await expect(row.getByRole('status')).toContainText('Planen sparad');
    await row.getByRole('button',{name:'Stäng',exact:true}).click();
    await row.getByRole('button',{name:`Registrera set ${i}`,exact:true}).click();
    await row.getByRole('group',{name:`Hur kändes setet? Set ${i}`,exact:true}).getByRole('button',{name:'Lätt',exact:true}).click();
    await expect(row).toContainText('Känsla: Lätt');
  }
  await page.getByRole('button',{name:'Avsluta',exact:true}).click();
  await page.getByRole('button',{name:'Avsluta och spara',exact:true}).click();
  const comparison=page.locator('section').filter({has:page.getByRole('heading',{name:'Så påverkas kommande träning',exact:true})});
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('Du markerade seten som lätta.');
  // The next squat occurrence is C's light day. Preserve the actual selected dose
  // there; A's next heavy occurrence can offer the supported trial from that dose.
  await expect(comparison).toContainText(/Nästa förslag för knäböj: 2 × 10 reps · 50 kg/);
  await expect(comparison).toContainText('Förslaget utgår från den dos du genomfört');
  await expect(comparison).toContainText('Förslagen är preliminära');
  const before=await comparison.innerText();
  await page.reload();await expect.poll(()=>comparison.innerText()).toBe(before);
  mkdirSync(dir,{recursive:true});
  await page.screenshot({path:`${dir}/manual-easy-trial.png`,fullPage:true});
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Till planen',exact:true}).click();
  const future=page.locator('.plan-row').filter({has:page.locator('.plan-row-title').filter({hasText:/^Pass 4 ·/})});
  await future.locator('.plan-row-head').click();
  const squat=future.locator('.ex-line').filter({hasText:'Knäböj'});
  await expect(squat).toContainText(/52[,.]5 kg/);
  await expect(squat).toContainText('2 × 8 reps');
  await page.screenshot({path:`${dir}/future-comparable-trial.png`,fullPage:true});
}
