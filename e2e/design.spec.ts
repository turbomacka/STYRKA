import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, signUp, uniqueEmail } from './helpers';

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
}
async function targets(page: Page) {
  const small = await page.locator('button, a.btn, .tabs a').evaluateAll((els) => els.filter((el) => !el.closest('[inert]') && (el as HTMLElement).offsetParent !== null).map((el) => ({ name: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() })).filter(({ r }) => r.width < 47.9 || r.height < 47.9).map(({ name, r }) => ({ name, w: r.width, h: r.height })));
  expect(small).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) test(`DES mobile states and 200% text: ${theme}`, async ({ page, context }, info) => {
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page, uniqueEmail('des')); await onboard(page);
  await accessible(page); await targets(page);
  // State transitions must not briefly combine enabled text with a disabled background.
  const action = page.getByRole('button', { name: 'Öppna passet', exact: true });
  const ratios = await action.evaluate(async (el) => {
    const button = el as HTMLButtonElement;
    const luminance = (rgb: string) => {
      const c = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    button.disabled = true;
    // Finish any previous transition, then sample the entire enable transition.
    button.getAnimations().forEach(a => a.finish());
    void getComputedStyle(button).backgroundColor;
    button.disabled = false;
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const s = getComputedStyle(button), a = luminance(s.color), b = luminance(s.backgroundColor);
      samples.push((Math.max(a,b) + .05) / (Math.min(a,b) + .05));
      await new Promise(requestAnimationFrame);
    }
    return samples;
  });
  expect(Math.min(...ratios), 'primary action contrast while enabling').toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => document.documentElement.style.fontSize = '200%'); await fits(page);
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.getByRole('button', { name: 'Öppna passet' }).click(); await page.getByRole('button', { name: 'Starta passet', exact: true }).click();
  const log = page.getByRole('button', { name: 'Registrera set 1' }); await expect(log).toBeVisible();
  // Native activation remains on click: a touch down or canceled gesture saves nothing.
  await log.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 1 });
  await expect(log).toHaveAttribute('data-pressed', 'true');
  await expect(log).toBeVisible();
  await log.dispatchEvent('pointercancel', { pointerId: 1 }); await expect(log).not.toHaveAttribute('data-pressed');
  await log.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 2 });
  await page.locator('body').dispatchEvent('pointermove', { pointerId: 2, clientX: -1, clientY: -1 });
  await expect(log).not.toHaveAttribute('data-pressed');
  await expect(page.locator('.set-row.done')).toHaveCount(0);
  await targets(page); await accessible(page);
  await context.setOffline(true);
  await log.click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  await expect(page.locator('.toast')).toHaveText(/registrerat på enheten/);
  await expect(page.locator('.toast')).toContainText('registrerat på enheten');
  await context.setOffline(false);
  await page.getByRole('button', { name: /Vikt set 2:/ }).click();
  const weight = page.getByLabel('Vikt (kg)', { exact: true });
  const before = await weight.boundingBox(); await weight.fill('82,5'); const after = await weight.boundingBox();
  expect(after!.width).toBe(before!.width); expect(after!.x).toBe(before!.x);
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  const swap = page.getByRole('button', { name: 'Byt övning', exact: true });
  // Test keyboard return focus explicitly; Safari does not focus buttons on a touch/click.
  await swap.focus(); await swap.press('Enter');
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); await accessible(page);
  const startingOpacity = await dialog.evaluate(el => {
    // Restart the real CSS animation so this also checks its first frame on slow CI.
    const panel = el as HTMLElement;
    panel.style.animation = 'none';
    void getComputedStyle(panel).animationName;
    panel.style.animation = '';
    const animation = el.getAnimations().find(a => a instanceof CSSAnimation && a.animationName === 'sheet-enter');
    if (!animation) return Number(getComputedStyle(el).opacity);
    animation.pause(); animation.currentTime = 0;
    const opacity = Number(getComputedStyle(el).opacity); animation.finish(); return opacity;
  });
  expect(startingOpacity, 'dialog text retains full contrast throughout entry').toBe(1);
  // Focus trapping is verified in desktop Chromium, not claimed as VoiceOver/Safari device QA.
  if (info.project.name === 'desktop-keyboard') {
    const buttons = dialog.locator('button:enabled'); await buttons.last().focus(); await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(swap).toBeFocused();
  await page.getByRole('button', { name: 'Nästa övning' }).click();
  await expect(page.locator('.train-head h1')).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Föregående', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set 1 utfört. Ändra eller ångra' })).toBeVisible();
  // Real CSS text enlargement, separate from narrow viewport checks.
  await page.evaluate(() => document.documentElement.style.fontSize = '200%'); await fits(page); await targets(page);
  const brokenValues = await page.locator('.set-value').evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(), p = el.parentElement!.getBoundingClientRect(); return r.width > p.width || r.height > parseFloat(getComputedStyle(el).fontSize) * 1.6; }).map((el) => el.textContent));
  expect(brokenValues).toEqual([]);
  await page.getByRole('button', { name: /Vikt set 2:/ }).click(); await fits(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/evidence/ux-2026-10-18/regression/design-001/after/${info.project.name}/${theme}/10-text-200.png`, fullPage: true, scale: 'css' });
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta', exact: true }).click(); await page.getByRole('button', { name: 'Avsluta och spara', exact: true }).click(); await expect(page.getByRole('heading',{name:'Min träningsplan'})).toBeVisible();
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  const head = page.locator('.plan-row-head').first(); await head.click();
  const note = page.getByLabel('Egen anteckning (privat)').first(); await note.fill('Behåll min anteckning'); await head.click(); await head.click();
  await expect(note).toHaveValue('Behåll min anteckning');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.expandable').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await head.click(); await expect(head).toHaveAttribute('aria-expanded', 'false'); await head.click(); await expect(note).toBeVisible();
  await page.getByRole('link', { name: 'Utveckling', exact: true }).click();
  const select = page.getByLabel('Välj datapunkt'); await select.selectOption('0'); await expect(page.locator('.chart-tooltip')).not.toContainText('Tryck på en punkt');
  await page.locator('.chart-point').first().click(); await targets(page); await accessible(page);
  await page.locator('.balance-head').click(); await accessible(page);
  await page.evaluate(() => document.documentElement.style.fontSize = '200%'); await fits(page);
  await page.getByRole('link', { name: 'Profil', exact: true }).click(); await fits(page);
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.getByRole('radio', { name: 'Mörkt', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Ljust', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Som enheten', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.setViewportSize({ width: 320, height: 640 }); await fits(page); await targets(page);
});
