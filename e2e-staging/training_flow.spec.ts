import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onboard } from '../e2e/helpers';
import { runTrainingFlow } from '../e2e/trainingFlowScenario';
import type { SetDetail, TrainingPreferences } from '../src/domain/trainingFlow';

// Secrets stay in the test process. All mutations belong to a disposable test account.
const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const url = `https://${ref}.supabase.co`;
const admin = createClient(url, keys.find((k) => k.type === 'secret')!.api_key, { auth: { persistSession: false, autoRefreshToken: false } });

test('staging: integrated training, offline reload and exact remote side/warmup/rest records', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const email = `staging-flow-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Stg-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  const client = createClient(url, keys.find((k) => k.type === 'publishable')!.api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const cspErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|CSP|Refused/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByLabel('E-post', { exact: true }).fill(email);
    await page.getByLabel('Lösenord', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Logga in', exact: true }).click();
    await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 20000 });
    await onboard(page);
    const offlineReload = info.project.name !== 'staging-iphone';
    if (!offlineReload) info.annotations.push({ type: 'limitation', description: 'Windows WebKit uses online reload; physical iPhone offline QA remains.' });
    await runTrainingFlow(page, context, `docs/evidence/adaptive-2026-10-22/published/training-flow/staging/${info.project.name}`, offlineReload);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    await expect.poll(async () => {
      const r = await client.from('training_sets').select('kind,status,detail');
      expect(r.error).toBeNull();
      return r.data?.filter((s) => s.status === 'done').length;
    }, { timeout: 30000 }).toBe(3);
    // The set can already be done while the later timer mutation is still queued.
    await expect.poll(async () => {
      const r = await client.from('training_sets').select('detail').eq('status', 'done');
      expect(r.error).toBeNull();
      return (r.data as Array<{ detail: SetDetail | null }> | null)
        ?.find((s) => s.detail?.configuration.executionMode === 'sequential')?.detail?.rests[0]?.outcome;
    }, { timeout: 30000 }).toBe('started');
    await expect.poll(async () => (await client.from('training_sessions').select('status')).data,
      { timeout: 30000 }).toEqual([{ status: 'partial' }]);
    const result = await client.from('training_sets').select('kind,status,detail');
    expect(result.error).toBeNull();
    const sets = result.data! as Array<{ kind: string; status: string; detail: SetDetail | null }>;
    expect(sets.filter((s) => s.status === 'done' && s.kind === 'work')).toHaveLength(2);
    expect(sets.filter((s) => s.status === 'done' && s.kind === 'warmup')).toHaveLength(1);
    const cable = sets.find((s) => s.status === 'done' && s.detail?.configuration.executionMode === 'sequential')!.detail!;
    expect(cable.performances.map((p) => ({ side: p.side, load: p.loadValue, reps: p.repetitions }))).toEqual([
      { side: 'right', load: 30, reps: 10 }, { side: 'left', load: 30, reps: 8 },
    ]);
    expect(new Set(cable.performances.map((p) => p.id)).size).toBe(2);
    expect(cable.performances.every((p) => p.equipment.unit === 'kg')).toBe(true);
    expect(cable.rests).toHaveLength(1);
    expect(cable.rests[0]).toMatchObject({ type: 'between_sets', adjustmentSeconds: 30, outcome: 'started' });
    expect(cable.rests[0].actualSeconds).toBeGreaterThanOrEqual(0);
    expect(cable.rests[0].policyVersion).toBeTruthy();
    const profile = await client.from('profiles').select('training_preferences').single();
    expect(profile.error).toBeNull();
    const prefs = profile.data!.training_preferences as TrainingPreferences;
    expect(prefs.showWarmupSets).toBe(false);
    expect(prefs.equipmentProfiles).toEqual([]);
    expect((await client.from('training_sessions').select('status')).data).toEqual([{ status: 'partial' }]);
    expect(cspErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => {});
    const cleanup = await admin.auth.admin.deleteUser(userId);
    expect(cleanup.error).toBeNull();
  }
});
