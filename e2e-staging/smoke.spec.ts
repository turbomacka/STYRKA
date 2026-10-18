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
  const dir = `docs/evidence/design-001/staging/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'STYRKA' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-design', 'refined');
    await page.screenshot({ path: `${dir}/S01-valkommen.png`, fullPage: true });
    await page.getByLabel('E-post', { exact: true }).fill(email);
    await page.getByLabel('Lösenord', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Logga in', exact: true }).click();
    await expect(page.getByText('Intro 1/4')).toBeVisible({ timeout: 20_000 });
    await onboard(page, { multipleEstimates: true });
    await page.getByRole('button', { name: 'Starta dagens pass' }).click();
    await page.getByRole('button', { name: 'Starta', exact: true }).click();
    const firstSet = page.getByRole('button', { name: 'Klart, set 1' });
    await firstSet.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 1 });
    await expect(firstSet).toHaveAttribute('data-pressed', 'true');
    await firstSet.dispatchEvent('pointercancel', { pointerId: 1 });
    await expect(firstSet).not.toHaveAttribute('data-pressed');
    await expect(page.locator('.set-row.done')).toHaveCount(0);
    await page.context().setOffline(true);
    await firstSet.click();
    await expect(page.locator('.toast')).toContainText('registrerat på enheten');
    await expect(page.getByText('Sparas när du är uppkopplad').first()).toBeVisible();
    await page.context().setOffline(false);
    await page.getByRole('button', { name: 'Klart, set 2' }).click();
    await expect(page.getByText('Synkat').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${dir}/S08-trana.png`, fullPage: true });
    await page.getByRole('button', { name: 'Nästa övning', exact: true }).click();
    await page.getByRole('button', { name: 'Nästa övning', exact: true }).click();
    await page.getByRole('button', { name: 'Nästa övning', exact: true }).click();
    await page.getByRole('button', { name: 'Hoppa över övningen', exact: true }).click();
    await page.getByRole('button', { name: 'Hann inte', exact: true }).click();
    await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
    await page.getByRole('button', { name: 'Spara passet' }).click();
    await page.getByRole('button', { name: 'Använd förslaget nästa pass' }).click();
    await expect(page.getByRole('heading', { name: 'Ditt val för nästa pass' })).toBeVisible();
    await page.getByRole('button', { name: 'Till Idag' }).click();
    await expect(page.getByRole('link', { name: /Synkstatus: Synkat/ })).toBeVisible({ timeout: 30_000 });
    // Verifiera i staging-databasen via användarens egen session (RLS).
    const userClient = createClient(`https://${ref}.supabase.co`, keys.find((k) => k.type === 'publishable')!.api_key, { auth: { persistSession: false } });
    await userClient.auth.signInWithPassword({ email, password });
    const strength = await userClient.from('user_exercise_profiles').select('strength_inputs').eq('exercise_slug', 'squat').single();
    expect(strength.error).toBeNull();
    expect(strength.data?.strength_inputs).toEqual([
      { kind: '1rm', grams: 100000, reps: null, rir: null, measured: false, testedAt: null },
      { kind: '3rm', grams: 90000, reps: null, rir: null, measured: false, testedAt: null },
      { kind: 'submax', grams: 75000, reps: 6, rir: 1, measured: false, testedAt: null },
    ]);
    const sets = await userClient.from('training_sets').select('status');
    expect(sets.data?.filter((s) => s.status === 'done').length).toBe(2);
    const sess = await userClient.from('training_sessions').select('status');
    expect(sess.data?.map((s) => s.status)).toEqual(['partial']);
    expect((await userClient.from('exercise_skip_events').select('action')).data?.map((r) => r.action).sort()).toEqual(['accepted', 'skipped']);
    await page.getByRole('link', { name: 'Profil', exact: true }).click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Mörkt', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('link', { name: 'Utveckling', exact: true }).click();
    await page.getByLabel('Välj datapunkt').selectOption('0');
    await expect(page.locator('.chart-tooltip')).not.toContainText('Tryck på en punkt');
    await page.screenshot({ path: `${dir}/S12-utveckling-morkt.png`, fullPage: true });
    await page.getByRole('button', { name: 'Ta bort pass', exact: true }).click();
    await page.getByRole('button', { name: 'Ja, ta bort passet' }).click();
    await expect(page.getByText('Inga avslutade pass ännu.')).toBeVisible();
    // Utveckling has no sync-status link; wait for the actual server commit instead.
    await expect.poll(async () => {
      const r = await userClient.from('training_sessions').select('id');
      return { error: r.error?.code ?? null, rows: r.data };
    }, { timeout: 30_000 }).toEqual({ error: null, rows: [] });
    expect((await userClient.from('training_sessions').select('id')).data).toEqual([]);
    expect((await userClient.from('training_sets').select('id')).data).toEqual([]);
    expect((await userClient.from('exercise_skip_events').select('id')).data).toEqual([]);
    expect((await userClient.from('deleted_training_sessions').select('id')).data).toHaveLength(1);
    await page.reload();
    await expect(page.getByText('Inga avslutade pass ännu.')).toBeVisible();
    expect(problems.filter((p) => /Content Security Policy|CSP|Refused/i.test(p))).toEqual([]);
    await page.getByRole('link', { name: 'Profil', exact: true }).click();
    await page.getByRole('radio', { name: 'Ljust', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('link', { name: 'Övningar: nivå, viktsteg och maxvärden' }).click();
    await expect(page.getByRole('group', { name: 'Max för 1 repetition', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('100');
    await expect(page.getByRole('group', { name: 'Max för 3 repetitioner', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('90');
    await expect(page.getByRole('group', { name: 'Ett vanligt träningsset', exact: true }).getByLabel('Vikt (kg)', { exact: true })).toHaveValue('75');
    const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
    expect(sw).toBe(true);
  } finally {
    await page.context().setOffline(false);
    await admin.auth.admin.deleteUser(userId);
  }
});

test('staging: /vetenskap är publik (utan konto), källor visas, inga CSP- eller konsolfel', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Vetenskapen bakom STYRKA' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vetenskapen bakom STYRKA' })).toBeVisible();
  await expect(page.locator('#kalla-gullett2009 a[href^="https://doi.org/"]').first()).toBeVisible();
  await page.goto('/vetenskap#regel-forsta-exponering');
  await expect(page.locator('#regel-forsta-exponering')).toBeInViewport();
  expect(problems).toEqual([]);
});
