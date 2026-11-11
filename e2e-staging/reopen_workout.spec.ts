import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onboard } from '../e2e/helpers';

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const admin = createClient(`https://${ref}.supabase.co`, keys.find(k => k.type === 'secret')!.api_key, { auth: { persistSession: false } });

test('staging: reopen, add sets, replan and sync without duplicate workouts', async ({ page, context }, info) => {
  const email = `staging-reopen-${randomUUID()}@example.com`, password = `Stg-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const userId = data.user!.id;
  const userClient = createClient(`https://${ref}.supabase.co`, keys.find(k => k.type === 'publishable')!.api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
  expect((await userClient.auth.signInWithPassword({ email, password })).error).toBeNull();
  await page.goto('/');
  await page.getByLabel('E-post', { exact: true }).fill(email);
  await page.getByLabel('Lösenord', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
  await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 20000 });
  await onboard(page);
  await page.getByRole('button', { name: 'Öppna passet', exact: true }).click();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await expect(page.locator('.train-head h1')).toBeVisible();
  const workoutUrl = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Registrera set 1', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click();
  await expect(page.getByRole('heading', { name: 'Passet är sparat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Återuppta pass', exact: true })).toBeEnabled();
  if (info.project.name !== 'staging-iphone') {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
  }
  await page.getByRole('button', { name: 'Återuppta pass', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(workoutUrl + '$'));
  const first = page.getByRole('listitem', { name: 'Arbetsset 1', exact: true });
  await expect(first.getByRole('button', { name: 'Ångra registrering', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrera set 2', exact: true }).click();
  await page.getByRole('button', { name: 'Lägg till set', exact: true }).click();
  await page.getByRole('button', { name: 'Registrera set 3', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ångra registrering', exact: true })).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ångra registrering', exact: true })).toHaveCount(3);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click();
  await page.getByRole('button', { name: 'Till planen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pass B – bänk och marklyft' })).toBeVisible();
  await page.getByRole('button', { name: 'Visa genomfört pass' }).click();
  await expect(page.locator('.plan-row-head')).toHaveCount(1);
  await expect(page.locator('.plan-row-head')).toContainText('Pass 1');
  await expect(page.locator('.plan-row-head')).toContainText('3 set');
  await page.locator('.plan-row-head').click();
  await expect(page.getByRole('button', { name: 'Återuppta pass', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Synkstatus: Synkat. Visa detaljer' })).toBeVisible();
  await page.getByRole('button', { name: 'Redigera pass', exact: true }).click();
  await page.getByRole('button', { name: 'Korrigera set 1', exact: true }).click();
  const correction = page.getByRole('dialog', { name: 'Korrigera registrering' });
  await correction.getByLabel('Registrerad vikt (kg)').fill('60');
  await correction.getByLabel('Hur kändes setet?').selectOption('easy');
  await correction.getByRole('button', { name: 'Spara korrigering' }).click();
  await expect(correction.getByRole('status')).toContainText('planen är uppdaterad');
  await correction.getByRole('button', { name: 'Klart', exact: true }).click();
  await page.getByRole('button', { name: 'Klar med redigeringen', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Synkstatus: Synkat. Visa detaljer' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('reopened-history.png'), fullPage: true });
  // The same control works from history after sync/reload, with the same saved sets.
  await page.reload(); await page.locator('.plan-row-head').click();
  await page.getByRole('button', { name: 'Återuppta pass', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(workoutUrl + '$'));
  await expect(page.getByRole('button', { name: 'Ångra registrering', exact: true })).toHaveCount(3);

  await expect(page.getByRole('listitem', { name: 'Arbetsset 1', exact: true }).getByRole('button', { name: /Vikt set 1:/ })).toContainText('60');

  await expect.poll(async () => {
    const result = await userClient.from('training_sessions').select('id,status,first_counted_at').eq('user_id', userId);
    expect(result.error).toBeNull();
    return result.data?.length === 1 && result.data[0].status === 'in_progress' && !!result.data[0].first_counted_at;
  }, { timeout: 30000 }).toBe(true);
  } finally {
    await userClient.auth.signOut();
    expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
