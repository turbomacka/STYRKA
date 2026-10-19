import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { onboard, signIn } from '../e2e/helpers';

// Only disposable accounts are touched. Keys stay in the Node process and are never printed.
const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (!/^[a-z0-9]+$/.test(ref)) throw new Error('Invalid project reference');
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const url = `https://${ref}.supabase.co`;
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, keys.find((k) => k.type === 'secret')!.api_key, { auth });

for (const scenario of [
  { feeling: 'Lätt', effort: 'easy', mode: 'Tung' },
  { feeling: 'Lagom', effort: 'ok', mode: 'Medel' },
  { feeling: 'Maxansträngning', effort: 'maximal', mode: 'Lätt' },
]) {
  test(`published recovery: ${scenario.feeling} gives ${scenario.mode}, including offline reload`, async ({ page, context }, info) => {
    const email = `staging-recovery-${randomUUID()}@example.com`, password = `Stg-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    const client = createClient(url, keys.find((k) => k.type === 'publishable')!.api_key, { auth });
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy|CSP|Refused/i.test(message.text())) problems.push(message.text());
    });
    try {
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      await signIn(page, email, password);
      await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 20000 });
      await onboard(page);
      await page.getByRole('button', { name: 'Öppna passet' }).click();
      await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
      await page.getByRole('button', { name: 'Nästa övning', exact: true }).click();
      await expect(page.locator('.train-head h1')).toHaveText('Bänkpress');
      const first = page.getByRole('listitem', { name: 'Arbetsset 1', exact: true });
      await first.getByRole('button', { name: 'Registrera set 1', exact: true }).click();
      await first.getByRole('button', { name: scenario.effort === 'maximal' ? /Maxansträngning/ : scenario.feeling, exact: scenario.effort !== 'maximal' }).click();
      await expect(first).toContainText(`Känsla: ${scenario.feeling}`);
      await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
      await page.getByRole('button', { name: 'Avsluta och spara', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Min träningsplan' })).toBeVisible();
      await expect.poll(async () => {
        const result = await client.from('training_sets').select('perceived_effort').eq('status', 'done');
        expect(result.error).toBeNull();
        return result.data?.map((set) => set.perceived_effort);
      }, { timeout: 30000 }).toEqual([scenario.effort]);
      const offlineReload=info.project.name!=='staging-iphone';
      if(offlineReload){await page.evaluate(async () => { await navigator.serviceWorker.ready; });await context.setOffline(true);}
      else info.annotations.push({type:'limitation',description:'Windows WebKit uses online reload; physical iPhone offline QA remains.'});
      await page.getByRole('button', { name: 'Öppna passet' }).click();
      const bench = page.locator('.workout-card').filter({hasText:'Bänkpress'});
      const mode=scenario.mode==='Tung'?'heavy':scenario.mode==='Medel'?'moderate':'light';
      await expect(bench).toHaveAttribute('data-mode',mode);
      await page.reload();
      await expect(bench).toHaveAttribute('data-mode',mode);
      await expect(page.getByText('Varför det här förslaget?',{exact:true})).toHaveCount(0);
      const dir = `docs/evidence/ux-2026-10-18/published/recovery/staging/${info.project.name}`;
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/${scenario.effort}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
      await expect(page.locator('.train-head h1')).toHaveText('Bänkpress');
      await first.getByRole('button', { name: 'Registrera set 1', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra', exact: true })).toBeVisible();
      expect(problems).toEqual([]);
    } finally {
      await context.setOffline(false);
      await client.auth.signOut();
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
      const removed = await admin.auth.admin.getUserById(userId);
      expect(removed.data.user).toBeNull();
      expect(removed.error?.status).toBe(404);
    }
  });
}
