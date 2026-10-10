/**
 * Inloggning med engångskod från e-post (lokal Supabase + Mailpit). Koden fungerar oberoende av vilken
 * webbläsare mejlet öppnas i – till skillnad från länken (PKCE kräver samma webbläsare).
 */
import { expect, test, type Page } from '@playwright/test';
import { uniqueEmail } from './helpers';

const MAILPIT = 'http://127.0.0.1:54324';

type Msg = { ID: string; Subject: string; To: Array<{ Address: string }> };

async function messagesTo(to: string): Promise<Msg[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=100`);
  const list = (await res.json()) as { messages: Msg[] };
  return list.messages.filter((m) => m.To.some((t) => t.Address === to));
}

/** Väntar på ett NYTT mejl (id som inte fanns innan) – oberoende av klockskillnad mot containern. */
async function newCode(to: string, seen: Set<string>): Promise<{ code: string; subject: string }> {
  for (let i = 0; i < 40; i++) {
    const msg = (await messagesTo(to)).find((m) => !seen.has(m.ID));
    if (msg) {
      const res = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`);
      const full = (await res.json()) as { Text: string };
      const m = /\b(\d{6,10})\b/.exec(full.Text);
      if (m) return { code: m[1], subject: msg.Subject };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Inget mejl med kod till ${to}`);
}

async function loginWithCode(page: Page, email: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('E-post').fill(email);
  const seen = new Set((await messagesTo(email)).map((m) => m.ID));
  await page.getByRole('button', { name: 'Skicka inloggningskod' }).click();
  await expect(page.getByRole('heading', { name: 'Kolla din e-post' })).toBeVisible();
  const { code, subject } = await newCode(email, seen);
  await page.getByLabel('Kod från mejlet').fill(code);
  await page.getByRole('button', { name: 'Logga in med koden' }).click();
  return subject;
}

test('nytt konto och återinloggning med kod från mejlet (svenska mallar)', async ({ page, context }) => {
  const email = uniqueEmail('kod');
  const s1 = await loginWithCode(page, email);
  expect(s1).toMatch(/STYRKA/);
  await expect(page.getByText('Intro 1/4')).toBeVisible();
  // Rensa sessionen och logga in igen med ny kod (befintligt konto).
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.waitForTimeout(2000); // Supabase spärrar ny kod till samma adress en kort stund (max_frequency).
  const s2 = await loginWithCode(page, email);
  expect(s2).toBe('Din inloggningskod till STYRKA');
  await expect(page.getByText('Intro 1/4')).toBeVisible();
});

test('fel kod ger tydligt fel; länk öppnad i annan webbläsare förklaras', async ({ page }) => {
  const email = uniqueEmail('felkod');
  await page.goto('/');
  await page.getByLabel('E-post').fill(email);
  await page.getByRole('button', { name: 'Skicka inloggningskod' }).click();
  await page.getByLabel('Kod från mejlet').fill('000000');
  await page.getByRole('button', { name: 'Logga in med koden' }).click();
  await expect(page.getByRole('alert')).toContainText('Koden stämmer inte');
  await page.goto('/?code=00000000-0000-0000-0000-000000000000');
  await expect(page.getByText(/öppnades i en annan webbläsare/)).toBeVisible();
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.reload();
  await expect(page.getByText(/gått ut eller redan använts/)).toBeVisible();
});
