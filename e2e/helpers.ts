import { expect, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

export const PASSWORD = 'Testlosen-123!';

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.styrka.local`;
}

/** Reservvägen väljs uttryckligen när det mottagna mejlet innehåller en kod. */
export async function enterEmailCode(page: Page, code: string): Promise<void> {
  const field = page.getByLabel('Kod från mejlet');
  if (!await field.isVisible()) await page.getByText('Jag har en kod från mejlet', { exact: true }).click();
  await field.fill(code);
}

// ---- Lokal e-post (Mailpit) ----
const MAILPIT = 'http://127.0.0.1:54324';
type Msg = { ID: string; Subject: string; To: Array<{ Address: string }> };

export async function mailIds(to: string): Promise<Set<string>> {
  return new Set((await messagesTo(to)).map((m) => m.ID));
}

async function messagesTo(to: string): Promise<Msg[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const list = (await res.json()) as { messages: Msg[] };
  return list.messages.filter((m) => m.To.some((t) => t.Address === to));
}

/** Väntar på ett NYTT mejl till adressen (id som inte fanns i `seen`) och returnerar kod, länk och ämne. */
export async function nextMail(to: string, seen: Set<string>): Promise<{ code: string; link: string | null; subject: string }> {
  for (let i = 0; i < 60; i++) {
    const msg = (await messagesTo(to)).find((m) => !seen.has(m.ID));
    if (msg) {
      const res = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`);
      const full = (await res.json()) as { Text: string };
      const code = /\b(\d{6,10})\b/.exec(full.Text)?.[1];
      const link = /(https?:\/\/[^\s)]+\/auth\/v1\/verify[^\s)]*)/.exec(full.Text)?.[1] ?? null;
      if (code) return { code, link, subject: msg.Subject };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Inget mejl med kod till ${to}`);
}

// ---- Konto ----
export async function fillSignup(page: Page, email: string, password = PASSWORD, repeat = password): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skapa konto' }).click();
  await expect(page.getByRole('heading', { name: 'Skapa konto' })).toBeVisible();
  await page.getByLabel('E-post', { exact: true }).fill(email);
  await page.getByLabel('Lösenord', { exact: true }).fill(password);
  await page.getByLabel('Upprepa lösenord', { exact: true }).fill(repeat);
}

/** Skapa konto via UI: e-post + lösenord → bekräftelse med kod från mejlet (lokala mallar) → inloggad i introduktionen. */
export async function signUp(page: Page, email: string, password = PASSWORD): Promise<void> {
  await fillSignup(page, email, password);
  const seen = await mailIds(email);
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Bekräfta din e-post' })).toBeVisible();
  const { code } = await nextMail(email, seen);
  await enterEmailCode(page, code);
  await page.getByRole('button', { name: 'Bekräfta med kod' }).click();
  await expect(page.getByText('Intro 1/4')).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-post', { exact: true }).fill(email);
  await page.getByLabel('Lösenord', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
}

/** Rensa inloggning i webbläsaren (som att öppna appen på en ny enhet). */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
}

/** Intro med 1RM för knäböj/bänk/marklyft och i övrigt standardval. */
export async function onboard(page: Page, opts: { pull?: 'Latsdrag' | 'Assisterade chins'; estimates?: boolean; screenshot?: (n: string) => Promise<void> } = {}): Promise<void> {
  await page.getByText('Jag bekräftar att jag är vuxen').click();
  await opts.screenshot?.('S02-intro-1');
  await page.getByRole('button', { name: 'Nästa' }).click();
  if (opts.pull) await page.getByRole('radio', { name: opts.pull }).click();
  await opts.screenshot?.('S03-intro-2');
  await page.getByRole('button', { name: 'Nästa' }).click();
  if (opts.estimates !== false) {
    const lifts: Array<[string, string]> = [
      ['Knäböj', '100'],
      ['Bänkpress', '80'],
      ['Marklyft', '120'],
    ];
    for (const [name, kg] of lifts) {
      const card = page.locator('.card', { has: page.getByRole('heading', { name, exact: true }) });
      await card.getByRole('radio', { name: '1RM' }).click();
      await card.getByRole('textbox').fill(kg);
    }
  }
  await opts.screenshot?.('S04-intro-3');
  await page.getByRole('button', { name: 'Nästa' }).click();
  await opts.screenshot?.('S05-intro-4');
  await page.getByRole('button', { name: /Hoppa över och börja|Klar/ }).click();
  await expect(page.getByRole('heading', { name: 'Idag' })).toBeVisible();
}

export function shooter(page: Page, info: TestInfo) {
  const dir = `docs/evidence/screenshots/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  return async (name: string, opts: { fullPage?: boolean } = {}) => {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: opts.fullPage ?? true });
  };
}
