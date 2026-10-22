import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { onboard, signUp, uniqueEmail } from './helpers';

for (const scenario of [{ feeling: 'Lätt', nextMode: 'Tung' }, { feeling: 'Lagom', nextMode: 'Medel' }, { feeling: 'Maxansträngning', nextMode: 'Lätt' }]) {
  test(`completed bench ${scenario.feeling}: next bench is ${scenario.nextMode}, offline and after reload`, async ({page, context}, info) => {
    await signUp(page, uniqueEmail('recovery')); await onboard(page);
    await page.getByRole('button',{name:'Öppna passet'}).click();
    await page.getByRole('button',{name:'Starta passet',exact:true}).click();
    await page.getByRole('button',{name:'Nästa övning',exact:true}).click();
    await expect(page.locator('.train-head h1')).toHaveText('Bänkpress');
    const first=page.getByRole('listitem',{name:'Arbetsset 1',exact:true});
    await first.getByRole('button',{name:'Registrera set 1',exact:true}).click();
    await first.getByRole('button',{name:scenario.feeling==='Maxansträngning'?/Maxansträngning/:scenario.feeling,exact:scenario.feeling!=='Maxansträngning'}).click();
    await expect(first).toContainText(`Känsla: ${scenario.feeling}`);
    await page.getByRole('button',{name:'Avsluta',exact:true}).click();
    await page.getByRole('button',{name:'Avsluta och spara',exact:true}).click(); await expect(page.getByRole('heading',{name:'Så påverkas nästa pass'})).toBeVisible(); await page.getByRole('button',{name:'Till planen',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await context.setOffline(true);
    try {
      await page.getByRole('button',{name:'Öppna passet'}).click();
      const bench=page.locator('.workout-card').filter({hasText:'Bänkpress'});
      await expect(bench).toHaveAttribute('data-mode',scenario.nextMode==='Tung'?'heavy':scenario.nextMode==='Medel'?'moderate':'light');
      await page.reload();
      await expect(bench).toHaveAttribute('data-mode',scenario.nextMode==='Tung'?'heavy':scenario.nextMode==='Medel'?'moderate':'light');
      await expect(page.getByText('Varför det här förslaget?',{exact:true})).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
      const dir=`docs/evidence/adaptive-2026-10-22/regression/ux-2026-10-18/regression/recovery/${info.project.name}`;mkdirSync(dir,{recursive:true});
      await page.screenshot({path:`${dir}/${scenario.feeling==='Lätt'?'easy':scenario.feeling==='Lagom'?'normal':'maximal'}.png`,fullPage:true});
      await page.getByRole('button',{name:'Starta passet',exact:true}).click();
      await expect(page.locator('.train-head h1')).toHaveText('Bänkpress');
      await page.getByRole('listitem',{name:'Arbetsset 1',exact:true}).getByRole('button',{name:'Registrera set 1',exact:true}).click();
      await expect(page.getByRole('button',{name:'Set 1 utfört. Ändra eller ångra',exact:true})).toBeVisible();
    } finally {await context.setOffline(false);}
  });
}
