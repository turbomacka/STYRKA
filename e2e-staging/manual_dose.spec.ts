import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onboard, signIn } from '../e2e/helpers';
import { runManualDoseScenario } from '../e2e/manualDoseScenario';

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (!/^[a-z0-9]+$/.test(ref)) throw new Error('Invalid project reference');
// Disposable test accounts only. Credentials never leave this process or enter reports.
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const url = `https://${ref}.supabase.co`;
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, keys.find(k => k.type === 'secret')!.api_key, { auth });

test('published manual dose: actual lower load persists and easy sets support a comparable trial', async ({ page }, info) => {
  test.setTimeout(180_000);
  const email = `staging-dose-${randomUUID()}@example.com`, password = `Stg-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  const client = createClient(url, keys.find(k => k.type === 'publishable')!.api_key, { auth });
  try {
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    await signIn(page, email, password);
    await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 20_000 });
    await onboard(page);
    await runManualDoseScenario(page, `docs/evidence/adaptation-2026-10-26/published/${info.project.name}`);
    await expect.poll(async () => {
      const result = await client.from('training_sets').select('actual_kg,actual_reps,perceived_effort').eq('status', 'done').eq('kind', 'work');
      expect(result.error).toBeNull();
      return result.data?.map(s => ({ kg: Number(s.actual_kg), reps: s.actual_reps, effort: s.perceived_effort }));
    }, { timeout: 30_000 }).toEqual([
      { kg: 50, reps: 10, effort: 'easy' }, { kg: 50, reps: 10, effort: 'easy' },
    ]);
  } finally {
    await page.close().catch(() => {});
    await client.auth.signOut();
    await expect.poll(async () => {
      const result = await admin.auth.admin.deleteUser(userId);
      return result.error === null || result.error.status === 404;
    }, { timeout: 15_000, intervals: [500, 1000, 2000] }).toBe(true);
    expect((await admin.auth.admin.getUserById(userId)).data.user).toBeNull();
  }
});
