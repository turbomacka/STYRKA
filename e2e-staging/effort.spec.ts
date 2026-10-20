import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { onboard } from '../e2e/helpers';
import type { SetDetail } from '../src/domain/trainingFlow';

// Credentials stay in this process; only the disposable account is changed.
const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const url = `https://${ref}.supabase.co`;
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, keys.find((k) => k.type === 'secret')!.api_key, { auth });

test('published effort: independent sides, offline save, removal, server validation and max reference', async ({page,context},info) => {
  test.setTimeout(180000);
  const email=`staging-effort-${randomUUID().slice(0,8)}@example.com`, password=`Stg-${randomUUID()}`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(created.error).toBeNull(); const userId=created.data.user!.id;
  const client=createClient(url,keys.find((k)=>k.type==='publishable')!.api_key,{auth});
  const problems:string[]=[];
  page.on('pageerror',e=>problems.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && /Content Security Policy|CSP|Refused/i.test(m.text()))problems.push(m.text());});
  const dir=`docs/evidence/ux-2026-10-18/published/effort/staging/${info.project.name}`; mkdirSync(dir,{recursive:true});
  const rows=async()=>{
    const r=await client.from('training_sets').select('id,ordinal,revision,perceived_effort,rir,detail').eq('status','done').order('ordinal');
    expect(r.error).toBeNull(); return r.data! as Array<{id:string;ordinal:number;revision:number;perceived_effort:string|null;rir:number|null;detail:SetDetail}>;
  };
  try {
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    await page.goto('/');
    await page.getByLabel('E-post',{exact:true}).fill(email); await page.getByLabel('Lösenord',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Logga in',exact:true}).click(); await expect(page.getByText('Intro 1/4')).toBeVisible({timeout:20000});
    await onboard(page); await page.getByRole('button',{name:'Öppna passet'}).click(); await page.getByRole('button',{name:'Starta passet',exact:true}).click();
    const first=page.getByRole('listitem',{name:'Arbetsset 1',exact:true}), second=page.getByRole('listitem',{name:'Arbetsset 2',exact:true});
    await first.getByRole('button',{name:'Registrera set 1',exact:true}).click();
    await first.getByRole('button',{name:'Tungt',exact:true}).click();
    await expect.poll(async()=>(await rows())[0]?.detail.performances[0].effort,{timeout:30000}).toBe('hard');
    await second.getByRole('button',{name:/Vikt set 2:/}).click(); await second.getByLabel('Vikt (kg)',{exact:true}).fill('80');
    await second.getByLabel('Repetitioner',{exact:true}).fill('6');
    const offlineReload=info.project.name!=='staging-iphone';
    if(offlineReload){await page.evaluate(async()=>{await navigator.serviceWorker.ready;}); await context.setOffline(true);}
    else info.annotations.push({type:'limitation',description:'Windows WebKit uses online reload; physical iPhone offline QA remains.'});
    await second.getByRole('button',{name:'Stäng',exact:true}).click();
    await second.getByRole('button',{name:'Registrera set 2',exact:true}).click(); await second.getByRole('button',{name:/Maxansträngning/}).click();
    await expect(second).toContainText('Känsla: Maxansträngning');
    await page.reload(); await expect(second).toContainText('Känsla: Maxansträngning'); await context.setOffline(false);
    await expect.poll(async()=>(await rows()).find(s=>s.ordinal===2)?.perceived_effort,{timeout:30000}).toBe('maximal');
    await second.getByRole('button',{name:'Ändra känsla'}).click(); await second.getByRole('button',{name:'Ta bort svar'}).click();
    await expect.poll(async()=>(await rows()).find(s=>s.ordinal===2)?.detail.performances[0].effort,{timeout:30000}).toBeNull();
    await page.reload(); await second.getByRole('button',{name:/Maxansträngning/}).click();
    await expect.poll(async()=>(await rows()).find(s=>s.ordinal===2)?.perceived_effort,{timeout:30000}).toBe('maximal');
    const bilateral=await rows(); expect(bilateral.map(s=>s.rir)).toEqual([null,null]);
    expect(bilateral.map(s=>s.detail.performances[0].effort)).toEqual(['hard','maximal']);
    const max=bilateral[1], invalid=structuredClone(max.detail); invalid.performances[0].rir=3;
    const rejected=await client.rpc('apply_set_mutation',{event_id:randomUUID(),set_id:max.id,base_revision:max.revision,payload:{detail:invalid}});
    expect(rejected.error).toBeNull(); expect(rejected.data).toMatchObject({status:'rejected',code:'VALIDATION_ERROR'});
    await page.getByRole('button',{name:'Nästa övning',exact:true}).click(); await page.getByRole('button',{name:'Nästa övning',exact:true}).click();
    await page.getByText('Uppvärmning och utförande',{exact:true}).click();
    await page.getByText('Utförande och sida',{exact:true}).click();
    await page.getByRole('combobox',{name:'Utförande',exact:true}).selectOption('sequential');
    await page.getByText('Uppvärmning och utförande',{exact:true}).click();
    await first.getByRole('button',{name:/Vikt set 1:/}).click(); await first.getByLabel('Vikt (kg)',{exact:true}).fill('30');
    await first.getByRole('button',{name:'Stäng',exact:true}).click();
    await first.getByRole('button',{name:'Registrera set 1',exact:true}).click();
    await first.getByRole('group',{name:'Hur kändes setet? Set 1 · Höger',exact:true}).getByRole('button',{name:'Lätt',exact:true}).click();
    await first.getByRole('button',{name:'Registrera set 1',exact:true}).click();
    await first.getByRole('group',{name:'Hur kändes setet? Set 1 · Vänster',exact:true}).getByRole('button',{name:/Maxansträngning/}).click();
    await expect.poll(async()=>(await rows()).find(s=>s.detail.configuration.executionMode==='sequential')?.detail.performances.map(p=>p.effort),{timeout:30000}).toEqual(['easy','maximal']);
    await page.emulateMedia({colorScheme:'dark'}); await expect(page.locator('.toast')).toHaveCount(0,{timeout:10000});
    await page.screenshot({path:`${dir}/side-feedback.png`,fullPage:true});
    await page.getByRole('button',{name:'Avsluta',exact:true}).click(); await page.getByRole('button',{name:'Avsluta och spara',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible(); await page.getByRole('link',{name:'Utveckling',exact:true}).click();
    const localMax = await page.evaluate(({userId,setId}) => new Promise<unknown>((resolve,reject) => {
      const request=indexedDB.open(`styrka_${userId}`);
      request.onerror=()=>reject(new Error('Could not inspect test database'));
      request.onsuccess=()=>{
        const db=request.result, tx=db.transaction('sets','readonly'), get=tx.objectStore('sets').get(setId);
        get.onsuccess=()=>resolve(get.result); get.onerror=()=>reject(new Error('Could not inspect test set'));
        tx.oncomplete=()=>db.close();
      };
    }),{userId,setId:max.id});
    const remoteMax=(await rows()).find(s=>s.id===max.id)!;
    expect(localMax).toMatchObject({serverRevision:remoteMax.revision,perceivedEffort:'maximal',detail:{performances:[{effort:'maximal'}]}});
    await expect(page.locator('.latest-strength')).toContainText('Senaste maxskattning: 96 kg');
    await expect(page.getByText('Angiven styrkeuppgift · separat referens',{exact:true})).toBeVisible();
    await expect(page.locator('.chart path[stroke-dasharray]')).toHaveCount(0);
    await page.screenshot({path:`${dir}/progress.png`,fullPage:true}); expect(problems).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => {}); expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
