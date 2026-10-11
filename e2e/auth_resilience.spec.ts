import { expect, test } from '@playwright/test';
import { closeSql, sql } from '../tests/db/dbHelpers';
import { onboard, PASSWORD, shooter, signIn, signUp, uniqueEmail } from './helpers';

test.use({ serviceWorkers: 'block' });
test.afterAll(closeSql);

test('login and account creation are visible on the first small-mobile screen', async ({ page }, info) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    for (const name of ['Logga in', 'Skapa konto']) {
      const button = page.getByRole('button', { name, exact: true });
      const rect = await button.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
      expect(rect!.height).toBeGreaterThanOrEqual(48);
    }
    expect(await page.getByRole('button', { name: 'Logga in via e-post utan lösenord' }).isVisible()).toBe(false);
  }
  await shooter(page, info)('S01-mobil-forsta-skarmen', { fullPage: false });
});

test('slow first fetch and server failure never turn an existing account into a new one; retry restores it', async ({ page, browser }) => {
  const email = uniqueEmail('slow-login');
  await signUp(page, email);
  await onboard(page);
  await expect(page.getByText('Synkat', { exact: true })).toBeVisible({ timeout: 20_000 });
  const fresh = await browser.newContext({ serviceWorkers: 'block', baseURL: 'http://127.0.0.1:4173' });
  const second = await fresh.newPage();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  try {
    await second.route('**/rest/v1/profiles?*', async (route) => {
      await delayed;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service unavailable"}' });
    });
    await signIn(second, email);
    await expect(second.getByText('Hämtar dina uppgifter…')).toBeVisible();
    // Regression: den tidigare implementationen visade nyintroduktion efter 6 sekunder.
    await second.waitForTimeout(6500);
    await expect(second.getByText('Hämtar dina uppgifter…')).toBeVisible();
    await expect(second.getByText('Intro 1/4')).toHaveCount(0);
    release();
    await expect(second.getByRole('heading', { name: 'Vi kunde inte hämta dina uppgifter' })).toBeVisible();
    await second.unroute('**/rest/v1/profiles?*');
    await second.getByRole('button', { name: 'Försök igen' }).click();
    await expect(second.getByRole('heading', { name: 'Idag', exact: true })).toBeVisible();
    await expect(second.getByText('Intro 1/4')).toHaveCount(0);
  } finally { release(); await fresh.close(); }
});

test('401 during sync offers reauthentication and preserves a logged set through reload and retry', async ({ page }, info) => {
  const email = uniqueEmail('reauth');
  await signUp(page, email);
  await onboard(page);
  await expect(page.getByText('Synkat', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Starta dagens pass' }).click();
  await page.getByRole('button', { name: 'Starta', exact: true }).click();
  await page.route('**/rest/v1/rpc/apply_set_mutation', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"PGRST301","message":"JWT expired"}' }));
  await page.getByRole('button', { name: 'Klart, set 1' }).click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  const sessionUrl = page.url();
  await page.goto('/synk');
  await expect(page.getByRole('heading', { name: 'Logga in igen för att synka' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Logga in igen', exact: true }).click();
  await page.getByLabel('Lösenord', { exact: true }).fill('fel-losenord');
  await page.getByRole('button', { name: 'Logga in och synka' }).click();
  await expect(page.getByRole('alert')).toContainText('Fel e-post eller lösenord');
  await shooter(page, info)('S16-aterinloggning');
  await page.unroute('**/rest/v1/rpc/apply_set_mutation');
  await page.getByLabel('Lösenord', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Logga in och synka' }).click();
  await expect(page.getByRole('heading', { name: 'Logga in igen för att synka' })).toHaveCount(0);
  await expect(page.getByText('0 ändring(ar) väntar på att synkas.')).toBeVisible();
  await page.goto(sessionUrl);
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  const rows = await sql<{ n: number }>('select count(*)::int n from public.training_sets t join auth.users u on u.id=t.user_id where u.email=$1 and t.status=$2', [email, 'done']);
  expect(rows[0].n).toBe(1);
});
