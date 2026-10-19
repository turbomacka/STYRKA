/**
 * G3/G4 i webbläsaren: offline hela passet + omladdning + synk (29), utloggning med osynkat (32),
 * dataisolering mellan konton på samma enhet.
 */
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { onboard, shooter, signUp, uniqueEmail } from './helpers';

const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
async function q<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

async function swReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test('29: flygplansläge hela passet + omladdning offline + återanslutning ⇒ exakt utförda set på servern', async ({ page, context, browserName }, info) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit på Windows saknar stöd för service worker-offline; täcks av Chromium + manuell iOS-QA.');
  const shot = shooter(page, info);
  const email = uniqueEmail('offline');
  await signUp(page, email);
  await onboard(page);
  await swReady(page);
  await expect(page.getByRole('heading', { name: 'Min träningsplan' })).toBeVisible();
  await expect(page.getByText('Synkat')).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await expect(page.getByText('Du tränar offline.')).toBeVisible();
  await page.getByRole('button', { name: 'Registrera set 1' }).click();
  await page.getByRole('button', { name: 'Registrera set 2' }).click();
  await page.getByRole('button', { name: 'Nästa övning' }).click();
  await page.getByRole('button', { name: 'Registrera set 1' }).click();
  await expect(page.getByText('Du tränar offline.')).toBeVisible();
  await shot('G3-offline-set-sparade-lokalt');

  // Oväntad omstart offline: appen laddas från service worker, passet finns kvar.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta och spara' }).click();
  await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
  await expect(page.getByText(/sparade lokalt/)).toBeVisible();
  await shot('G3-offline-idag-ko');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Synkat')).toBeVisible({ timeout: 30_000 });
  const rows = await q<{ n: number }>(`select count(*)::int n from public.training_sets t join auth.users u on u.id=t.user_id where u.email=$1 and t.status='done'`, [email]);
  expect(rows[0].n).toBe(3);
  const sess = await q<{ status: string }>(`select s.status from public.training_sessions s join auth.users u on u.id=s.user_id where u.email=$1`, [email]);
  expect(sess.map((s) => s.status)).toEqual(['partial']);
});

test.describe('utloggning', () => {
  // Routing av API-anrop kräver att service worker inte mellanhandlar (Playwright-begränsning i WebKit).
  test.use({ serviceWorkers: 'block' });
test('32: utloggning med osynkade data varnar; nästa användare på enheten ser inget av första', async ({ page, context }, info) => {
  const shot = shooter(page, info);
  const emailA = uniqueEmail('dela-a');
  await signUp(page, emailA);
  await onboard(page);
  await expect(page.getByText('Synkat')).toBeVisible({ timeout: 20_000 });
  const userA = (await q<{ id: string }>(`select id from auth.users where email=$1`, [emailA]))[0].id;
  // Servern onåbar (motsvarar dålig täckning): skrivningar stannar i den lokala kön.
  await context.route('**/rest/v1/**', (r) => r.abort());
  await page.getByRole('button', { name: 'Öppna passet' }).click();
  await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  await page.getByRole('button', { name: 'Registrera set 1' }).click();
  await page.goto('/profil/data');
  await expect(page.getByText(/finns bara på den här enheten/)).toBeVisible();
  await shot('S15-utloggning-varning');
  await page.getByRole('button', { name: 'Logga ut ändå' }).click();
  await page.getByRole('button', { name: 'Logga ut och radera osynkat' }).click();
  await context.unroute('**/rest/v1/**');
  await expect(page.getByRole('heading', { name: 'STYRKA' })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('load');
  await expect.poll(async () => page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name)).catch(() => ['navigating']), { timeout: 15_000 }).not.toContain(`styrka_${userA}`);
  await expect.poll(async () => page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name)).catch(() => ['navigating'])).not.toContain('navigating');
  const ls = await page.evaluate(() => JSON.stringify(localStorage));
  expect(ls).not.toContain('Knäböj');

  await signUp(page, uniqueEmail('dela-b'));
  await expect(page.getByText('Intro 1/4')).toBeVisible();
  const dbs2 = await page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name));
  expect(dbs2).not.toContain(`styrka_${userA}`);
});
});
