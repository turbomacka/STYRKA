import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { onboard, signUp, uniqueEmail } from './helpers';

for (const scenario of [{ feeling: 'Lätt', nextMode: 'Tung' }, { feeling: 'Lagom', nextMode: 'Medel' }, { feeling: 'Maxansträngning', nextMode: 'Lätt' }]) {
  test(`completed bench ${scenario.feeling}: next bench is ${scenario.nextMode}, offline and after reload`, async ({page, context}, info) => {
    await signUp(page, uniqueEmail('recovery')); await onboard(page);
    await page.getByRole('button',{name:'Starta dagens pass'}).click();
    await page.getByRole('button',{name:'Starta',exact:true}).click();
    await page.getByRole('button',{name:'Nästa övning',exact:true}).click();
    await expect(page.locator('.train-head h1')).toHaveText('Bänkpress');
    const first=page.getByRole('listitem',{name:'Arbetsset 1',exact:true});
    await first.getByRole('button',{name:'Klart, set 1',exact:true}).click();
    await first.getByRole('button',{name:scenario.feeling==='Maxansträngning'?/Maxansträngning/:scenario.feeling,exact:scenario.feeling!=='Maxansträngning'}).click();
    await expect(first).toContainText(`Känsla: ${scenario.feeling}`);
    await page.getByRole('button',{name:'Avsluta',exact:true}).click();
    await page.getByRole('button',{name:'Spara passet',exact:true}).click();
    await page.getByRole('button',{name:'Till Idag',exact:true}).click();
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await context.setOffline(true);
    try {
      await page.getByRole('button',{name:'Starta dagens pass'}).click();
      const bench=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:'Bänkpress',exact:true})});
      await expect(bench.locator('.chip').first()).toHaveText(scenario.nextMode);
      await page.reload();
      await expect(bench.locator('.chip').first()).toHaveText(scenario.nextMode);
      const warning=page.getByText('Förslaget är anpassat för återhämtning. Du kan fortfarande ändra vikt och repetitioner.',{exact:true});
      if(scenario.feeling==='Lätt') await expect(warning).toHaveCount(0);
      else await expect(warning).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
      const dir=`docs/evidence/recovery/${info.project.name}`;mkdirSync(dir,{recursive:true});
      await page.screenshot({path:`${dir}/${scenario.feeling==='Lätt'?'easy':scenario.feeling==='Lagom'?'normal':'maximal'}.png`,fullPage:true});
      await page.getByRole('button',{name:'Starta',exact:true}).click();
      await expect(page.locator('.train-head h1')).toHaveText('Bänkpress');
      await page.getByRole('listitem',{name:'Arbetsset 1',exact:true}).getByRole('button',{name:'Klart, set 1',exact:true}).click();
      await expect(page.getByRole('button',{name:'Set 1 utfört. Ändra eller ångra',exact:true})).toBeVisible();
    } finally {await context.setOffline(false);}
  });
}
