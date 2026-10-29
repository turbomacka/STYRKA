import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync } from 'node:fs';

// Synthetic local history in the real built app. Every backend request is intercepted.
// Live authentication and synchronization are covered by the separate staging smoke suite.
test.use({ serviceWorkers: 'block' });
test('feedback: real rep progress, compact accessible finish, reload and symptom correction',async({page,context},info)=>{
  const fixture=JSON.parse(readFileSync('e2e/fixtures/workout-feedback.json','utf8')) as {
    userId:string;name:string;at:string;sessionId:string;rows:Record<string,unknown[]>};
    // Keep the browser clock consistent with the fixture and planning horizon.
    await page.clock.setFixedTime(new Date(fixture.at));
    await context.route('**/auth/v1/**',route=>route.fulfill({json:{id:fixture.userId,aud:'authenticated',role:'authenticated'}}));
    await context.route('**/rest/v1/**',route=>route.fulfill({status:route.request().method()==='GET'?200:503,
      json:route.request().method()==='GET'?(new URL(route.request().url()).pathname.endsWith('/profiles')?null:[]):{code:'SYNTHETIC_LOCAL_ONLY'}}));
    await context.addInitScript(({userId,at})=>{
      const expires=Math.floor(Date.parse(at)/1000)+86400;
      const token=`e30.${btoa(JSON.stringify({sub:userId,role:'authenticated',exp:expires}))}.synthetic-only`;
      for(const ref of ['127','zjjlttbwofohyqmklvkf'])localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify({
        access_token:token,refresh_token:'synthetic-only',token_type:'bearer',expires_in:86400,expires_at:expires,
        user:{id:userId,aud:'authenticated',role:'authenticated'}}));
    },{userId:fixture.userId,at:fixture.at});
    await page.goto('/');
    await expect(page.getByText('Intro 1/4')).toBeVisible();
    await page.evaluate(async({name,rows})=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open(name);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction(Object.keys(rows),'readwrite');
          for(const [table,values] of Object.entries(rows))for(const row of values)tx.objectStore(table).put(row);
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };
      });
    },{name:fixture.name,rows:fixture.rows});
    await page.goto(`/pass/${fixture.sessionId}/avsluta`);
    await page.getByRole('button',{name:'Avsluta och spara',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Så påverkas kommande träning'})).toBeVisible();
    const feedback=page.locator('.finish-feedback');
    await expect(feedback).toContainText(/6 (fler|extra) repetitioner|med 6 på samma belastning|6 fler utan/);
    const text=await feedback.innerText();expect(text.length).toBeLessThan(400);
    await page.reload();await expect(feedback).toHaveText(text);
    const dir=`docs/evidence/feedback-pr3/${info.project.name}`;mkdirSync(dir,{recursive:true});
    for(const colorScheme of ['light','dark'] as const){
      await page.emulateMedia({colorScheme});
      await page.screenshot({path:`${dir}/finish-${colorScheme}.png`,fullPage:true});
      expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    }
    await page.setViewportSize({width:320,height:740});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`${dir}/finish-320.png`,fullPage:true});
    // Reopening must refresh cached prose when the underlying facts change.
    await page.evaluate(async({name,sessionId,at})=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open(name);request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('symptoms','readwrite');
          tx.objectStore('symptoms').put({id:'synthetic-symptom',sessionId,area:'knee',side:'both',reaction:'transient',pain:null,reportedAt:at,resolvedAt:null,syncState:'local'});
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
      });
    },{name:fixture.name,sessionId:fixture.sessionId,at:fixture.at});
    await page.reload();await expect(feedback).not.toHaveText(text);
    await expect(feedback).not.toContainText(/fler repetitioner|extra repetitioner|konkret framsteg/);
    await expect(feedback).toContainText(/hänsyn|begränsningar|förutsättningar|anpass|underlag/);
    await page.screenshot({path:`${dir}/finish-symptom.png`,fullPage:true});
});
