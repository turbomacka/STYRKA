/**
 * Klassisk inloggning (e-post + lösenord) mot lokal Supabase med e-postbekräftelse PÅ (som staging).
 * Mejl läses från Mailpit. Täcker: skapa konto + bekräftelsekod, befintlig e-post, fel lösenord,
 * validering, glömt lösenord via kod och via länk, konto utan lösenord, obekräftad inloggning,
 * byt lösenord, engångskod för befintligt konto, samt förklaring av länk i fel webbläsare.
 */
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { clearAuth, enterEmailCode, fillSignup, mailIds, nextMail, onboard, PASSWORD, shooter, signIn, signUp, uniqueEmail } from './helpers';

const NEW_PASSWORD = 'Nytt-losen-456!';

function localAdmin() {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?`, 'm').exec(out)?.[1] ?? '';
  return createClient(get('API_URL'), get('SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

async function axe(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${name}: ${v.id}`)).toEqual([]);
}

async function requestReset(page: Page, email: string) {
  await page.getByRole('button', { name: 'Glömt lösenordet?' }).click();
  await expect(page.getByRole('heading', { name: 'Glömt lösenordet' })).toBeVisible();
  await page.getByLabel('E-post', { exact: true }).fill(email);
  const seen = await mailIds(email);
  await page.getByRole('button', { name: 'Skicka återställningsmejl' }).click();
  await expect(page.getByRole('heading', { name: 'Återställ lösenordet' })).toBeVisible();
  await expect(page.getByText(/Om det finns ett konto för/)).toBeVisible();
  return nextMail(email, seen);
}

async function chooseNewPassword(page: Page, pw = NEW_PASSWORD) {
  await expect(page.getByRole('heading', { name: 'Välj nytt lösenord' })).toBeVisible();
  await page.getByLabel('Nytt lösenord', { exact: true }).fill(pw);
  await page.getByLabel('Upprepa nytt lösenord').fill(pw);
  await page.getByRole('button', { name: 'Spara nytt lösenord' }).click();
  await expect(page.getByText('Ditt nya lösenord är sparat.')).toBeVisible();
  await page.getByRole('button', { name: 'Fortsätt till appen' }).click();
}

test('skapa konto med e-post och lösenord → bekräftelsekod → logga in igen med lösenord', async ({ page }, info) => {
  const shot = shooter(page, info);
  const email = uniqueEmail('konto');
  await page.goto('/');
  await shot('S01-logga-in');
  await axe(page, 'logga in');
  await fillSignup(page, email);
  await shot('S01-skapa-konto');
  await axe(page, 'skapa konto');
  const seen = await mailIds(email);
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Bekräfta din e-post' })).toBeVisible();
  await expect(page.getByText(`Kontot är skapat. Vi har skickat ett bekräftelsemejl till ${email}.`)).toBeVisible();
  await shot('S01-bekrafta-epost');
  await axe(page, 'bekräfta');
  const mail = await nextMail(email, seen);
  expect(mail.subject).toBe('Bekräfta din e-post för STYRKA');
  await enterEmailCode(page, mail.code);
  await page.getByRole('button', { name: 'Bekräfta med kod' }).click();
  await expect(page.getByText('Intro 1/4')).toBeVisible();

  await clearAuth(page);
  await signIn(page, email);
  await expect(page.getByText('Intro 1/4')).toBeVisible();
});

test('befintlig e-post vid skapa konto ger tydligt besked och leder till inloggning', async ({ page }) => {
  const email = uniqueEmail('finns');
  await signUp(page, email);
  await clearAuth(page);
  await fillSignup(page, email, 'Annat-losen-789!');
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByText(`Det finns redan ett konto för ${email}.`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Logga in' })).toBeVisible();
  await expect(page.getByLabel('E-post', { exact: true })).toHaveValue(email);
});

test('fel lösenord och ogiltiga uppgifter ger tydliga fel', async ({ page }) => {
  const email = uniqueEmail('fel');
  await signUp(page, email);
  await clearAuth(page);
  await signIn(page, email, 'helt-fel-losen');
  await expect(page.getByRole('alert')).toContainText('Fel e-post eller lösenord');

  await fillSignup(page, 'inte-en-adress', 'kort', 'kort');
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByRole('alert')).toHaveText('Ange en giltig e-postadress.');
  await page.getByLabel('E-post', { exact: true }).fill(uniqueEmail('ny'));
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByRole('alert')).toHaveText('Lösenordet måste ha minst 8 tecken.');
  await page.getByLabel('Lösenord', { exact: true }).fill('Langtlosen-1');
  await page.getByLabel('Upprepa lösenord', { exact: true }).fill('Langtlosen-2');
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByRole('alert')).toHaveText('Lösenorden matchar inte.');
  // Visa lösenord
  await page.getByRole('button', { name: 'Visa lösenord', exact: true }).click();
  await expect(page.getByLabel('Lösenord', { exact: true })).toHaveAttribute('type', 'text');
});

test('glömt lösenordet med kod → nytt lösenord; gamla slutar fungera', async ({ page }, info) => {
  const shot = shooter(page, info);
  const email = uniqueEmail('glomt');
  await signUp(page, email);
  await clearAuth(page);
  const mail = await requestReset(page, email);
  expect(mail.subject).toBe('Återställ ditt lösenord till STYRKA');
  await shot('S01-aterstallningskod');
  await enterEmailCode(page, mail.code);
  await page.getByRole('button', { name: 'Fortsätt med kod' }).click();
  await shot('S01-nytt-losenord');
  await axe(page, 'nytt lösenord');
  await chooseNewPassword(page);
  await expect(page.getByText('Intro 1/4')).toBeVisible();

  await clearAuth(page);
  await signIn(page, email, PASSWORD);
  await expect(page.getByRole('alert')).toContainText('Fel e-post eller lösenord');
  await signIn(page, email, NEW_PASSWORD);
  await expect(page.getByText('Intro 1/4')).toBeVisible();
});

test('glömt lösenordet via länken i mejlet (samma webbläsare) visar "Välj nytt lösenord"', async ({ page }) => {
  const email = uniqueEmail('lank');
  await signUp(page, email);
  await clearAuth(page);
  const mail = await requestReset(page, email);
  expect(mail.link).toMatch(/type=recovery/);
  await page.goto(mail.link!);
  await chooseNewPassword(page);
  await expect(page.getByText('Intro 1/4')).toBeVisible();
  await clearAuth(page);
  await signIn(page, email, NEW_PASSWORD);
  await expect(page.getByText('Intro 1/4')).toBeVisible();
});

test('konto utan lösenord (skapat med kod) får hjälp och kan skapa lösenord via Glömt lösenordet', async ({ page }) => {
  const email = uniqueEmail('utanlosen');
  const { error } = await localAdmin().auth.admin.createUser({ email, email_confirm: true });
  expect(error).toBeNull();
  await signIn(page, email, 'gissat-losen');
  await expect(page.getByRole('alert')).toContainText('saknar kontot lösenord');
  const mail = await requestReset(page, email);
  await enterEmailCode(page, mail.code);
  await page.getByRole('button', { name: 'Fortsätt med kod' }).click();
  await chooseNewPassword(page);
  await clearAuth(page);
  await signIn(page, email, NEW_PASSWORD);
  await expect(page.getByText('Intro 1/4')).toBeVisible();
});

test('inloggning innan e-posten bekräftats ger besked och ny kod', async ({ page }) => {
  const email = uniqueEmail('obekraftad');
  await fillSignup(page, email);
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Bekräfta din e-post' })).toBeVisible();
  await page.getByRole('button', { name: 'Tillbaka till inloggning' }).click();
  await page.waitForTimeout(1500); // Supabase tillåter ny kod först efter en kort stund
  const seen = await mailIds(email);
  await page.getByLabel('E-post', { exact: true }).fill(email);
  await page.getByLabel('Lösenord', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
  await expect(page.getByText(/inte bekräftad ännu\. Vi har skickat ett nytt bekräftelsemejl/)).toBeVisible();
  const { code } = await nextMail(email, seen);
  await enterEmailCode(page, code);
  await page.getByRole('button', { name: 'Bekräfta med kod' }).click();
  await expect(page.getByText('Intro 1/4')).toBeVisible();
});

test('byt lösenord under Data och konto', async ({ page }) => {
  const email = uniqueEmail('byt');
  await signUp(page, email);
  await onboard(page);
  await page.goto('/profil/data');
  await page.getByRole('button', { name: 'Byt lösenord' }).click();
  await page.getByLabel('Nytt lösenord', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Upprepa nytt lösenord').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Byt lösenord' }).click();
  await expect(page.getByText('Lösenordet är bytt.')).toBeVisible();
  await clearAuth(page);
  await signIn(page, email, NEW_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Min träningsplan' })).toBeVisible();
});

test('inloggning via e-post utan lösenord (kod) för befintligt konto; fel kod och okänt konto ger tydliga fel', async ({ page }) => {
  const email = uniqueEmail('kod');
  await signUp(page, email);
  await clearAuth(page);
  await page.waitForTimeout(1500);
  await page.getByText('Andra sätt att logga in', { exact: true }).click();
  await page.getByRole('button', { name: 'Logga in via e-post utan lösenord' }).click();
  await page.getByLabel('E-post', { exact: true }).fill(email);
  const seen = await mailIds(email);
  await page.getByRole('button', { name: 'Skicka inloggningsmejl' }).click();
  await expect(page.getByRole('heading', { name: 'Kolla din e-post' })).toBeVisible();
  const mail = await nextMail(email, seen);
  expect(mail.subject).toBe('Din inloggningskod till STYRKA');
  await enterEmailCode(page, '000000');
  await page.getByRole('button', { name: 'Logga in med koden' }).click();
  await expect(page.getByRole('alert')).toContainText('Koden stämmer inte');
  await enterEmailCode(page, mail.code);
  await page.getByRole('button', { name: 'Logga in med koden' }).click();
  await expect(page.getByText('Intro 1/4')).toBeVisible();

  await clearAuth(page);
  await page.getByText('Andra sätt att logga in', { exact: true }).click();
  await page.getByRole('button', { name: 'Logga in via e-post utan lösenord' }).click();
  await page.getByLabel('E-post', { exact: true }).fill(uniqueEmail('finnsinte'));
  await page.getByRole('button', { name: 'Skicka inloggningsmejl' }).click();
  await expect(page.getByRole('alert')).toContainText('inget konto');
});

test('länk öppnad i annan webbläsare eller utgången länk förklaras', async ({ page }) => {
  await page.goto('/?code=00000000-0000-0000-0000-000000000000');
  await expect(page.getByText(/öppnades i en annan webbläsare/)).toBeVisible();
  await page.goto('/?recovery=1&code=00000000-0000-0000-0000-000000000000');
  await expect(page.getByText(/Återställningslänken öppnades i en annan webbläsare/)).toBeVisible();
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.reload();
  await expect(page.getByText(/gått ut eller redan använts/)).toBeVisible();
});

test.describe('e-postlänkar öppnade i en ANNAN webbläsare (t.ex. e-postappens)', () => {
  test('bekräftelselänk i annan webbläsare bekräftar kontot; "Jag har bekräftat – logga in" fungerar', async ({ page, browser }) => {
    const email = uniqueEmail('annanbekr');
    await fillSignup(page, email);
    const seen = await mailIds(email);
    await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Bekräfta din e-post' })).toBeVisible();
    // Innan länken klickats: tydligt besked.
    await page.getByRole('button', { name: 'Jag har bekräftat – logga in' }).click();
    await expect(page.getByRole('alert')).toContainText('inte bekräftad ännu');
    const mail = await nextMail(email, seen);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(mail.link!);
    await expect(otherPage.getByText('Intro 1/4')).toBeVisible();
    await other.close();
    await page.getByRole('button', { name: 'Jag har bekräftat – logga in' }).click();
    await expect(page.getByText('Intro 1/4')).toBeVisible();
  });

  test('återställningslänk i annan webbläsare låter användaren välja nytt lösenord där', async ({ page, browser }) => {
    const email = uniqueEmail('annanreset');
    await signUp(page, email);
    await clearAuth(page);
    const mail = await requestReset(page, email);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(mail.link!);
    await chooseNewPassword(otherPage);
    await other.close();
    await page.getByRole('button', { name: 'Tillbaka till inloggning' }).click();
    await signIn(page, email, NEW_PASSWORD);
    await expect(page.getByText('Intro 1/4')).toBeVisible();
  });
});
