import { expect, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

export const PASSWORD = 'Testlosen-123!';

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.styrka.local`;
}

export async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skapa konto' }).click();
  await page.getByLabel('E-post').fill(email);
  await page.getByLabel('Lösenord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Skapa konto' }).last().click();
  await expect(page.getByText('Intro 1/4')).toBeVisible();
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Logga in med lösenord' }).click();
  await page.getByLabel('E-post').fill(email);
  await page.getByLabel('Lösenord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
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
  return async (name: string) => {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  };
}
