/**
 * Röktest av publicerad staging-PWA mot staging-databasen. Ett bekräftat syntetiskt konto skapas via
 * Supabase admin-API (secret-nyckel hämtas via CLI i testprocessen, skrivs aldrig ut) och raderas efteråt.
 */
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { onboard } from '../e2e/helpers';

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Array<{ type: string; api_key: string }>;
const admin = createClient(`https://${ref}.supabase.co`, keys.find((k) => k.type === 'secret')!.api_key, { auth: { persistSession: false } });

test('staging: inloggning, intro, pass med synk till staging-databasen, utan CSP-fel', async ({ page }, info) => {
  const email = `staging-ui-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Stg-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const userId = data.user!.id;
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  const dir = `docs/evidence/screenshots/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'STYRKA' })).toBeVisible();
    await page.screenshot({ path: `${dir}/S01-valkommen.png`, fullPage: true });
    await page.getByLabel('E-post', { exact: true }).fill(email);
    await page.getByLabel('Lösenord', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Logga in', exact: true }).click();
    await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 20_000 });
    await onboard(page);
    await page.getByRole('button', { name: 'Starta dagens pass' }).click();
    await page.getByRole('button', { name: 'Starta', exact: true }).click();
    await page.getByRole('button', { name: 'Klart, set 1' }).click();
    await page.getByRole('button', { name: 'Klart, set 2' }).click();
    await expect(page.getByText('Synkat').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${dir}/S08-trana.png`, fullPage: true });
    await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
    await page.getByRole('button', { name: 'Spara passet' }).click();
    await page.getByRole('button', { name: 'Till Idag' }).click();
    await expect(page.getByRole('link', { name: /Synkstatus: Synkat/ })).toBeVisible({ timeout: 30_000 });
    // Verifiera i staging-databasen via användarens egen session (RLS).
    const userClient = createClient(`https://${ref}.supabase.co`, keys.find((k) => k.type === 'publishable')!.api_key, { auth: { persistSession: false } });
    await userClient.auth.signInWithPassword({ email, password });
    const sets = await userClient.from('training_sets').select('status');
    expect(sets.data?.filter((s) => s.status === 'done').length).toBe(2);
    const sess = await userClient.from('training_sessions').select('status');
    expect(sess.data?.map((s) => s.status)).toEqual(['partial']);
    expect(problems.filter((p) => /Content Security Policy|CSP|Refused/i.test(p))).toEqual([]);
    const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
    expect(sw).toBe(true);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
