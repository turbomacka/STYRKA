import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onboard, signIn } from '../e2e/helpers';
import { independentIntro } from '../e2e/introScenario';

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (!/^[a-z0-9]+$/.test(ref)) throw new Error('Invalid project reference');
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const url = `https://${ref}.supabase.co`;
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, keys.find((k) => k.type === 'secret')!.api_key, { auth });

for (const source of ['strength_inputs', 'performed_sets'] as const) {
  test(`published onboarding: ${source}, persistence, sync and account cleanup`, async ({ page, context }, info) => {
    test.setTimeout(150_000);
    const email = `staging-intro-${randomUUID()}@example.com`, password = `Stg-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    const client = createClient(url, keys.find((k) => k.type === 'publishable')!.api_key, { auth });
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    try {
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      await signIn(page, email, password);
      await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 25_000 });
      if (source === 'strength_inputs') await independentIntro(page, context, `docs/evidence/adaptive-2026-10-22/published/onboarding/published/${info.project.name}`);
      else await onboard(page, { estimates: false });
      await expect.poll(async () => (await client.from('profiles').select('training_preferences').eq('user_id', id).single()).data?.training_preferences?.loadRecommendationSource, { timeout: 30_000 }).toBe(source);
      if (source === 'strength_inputs') {
        await expect.poll(async () => (await client.from('user_exercise_profiles').select('strength_inputs').eq('exercise_slug', 'squat').single()).data?.strength_inputs?.length, { timeout: 30_000 }).toBe(3);
      } else {
        await page.getByRole('button', { name: 'Öppna passet' }).click();
        const squat = page.locator('.workout-card').filter({ hasText: 'Knäböj' });
        await squat.locator('.workout-title').click();
        await expect(squat).toContainText('Välj vikt');
        await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
        await page.getByRole('link', { name: 'Profil', exact: true }).click();
        await page.getByText('Använd även mina styrkeuppgifter', { exact: true }).click();
        await expect.poll(async () => (await client.from('profiles').select('training_preferences').eq('user_id', id).single()).data?.training_preferences?.loadRecommendationSource).toBe('strength_inputs');
        await page.reload();
        await expect(page.getByRole('radio', { name: /Använd även mina styrkeuppgifter/ })).toBeChecked();
      }
      expect(problems).toEqual([]);
    } finally {
      await context.setOffline(false).catch(() => {}); await client.auth.signOut();
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
      const removed = await admin.auth.admin.getUserById(id);
      expect(removed.data.user).toBeNull(); expect(removed.error?.status).toBe(404);
    }
  });
}
