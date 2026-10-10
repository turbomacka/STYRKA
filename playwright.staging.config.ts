import { defineConfig, devices } from '@playwright/test';
/** Röktest mot publicerad staging. Körs manuellt: `npx playwright test -c playwright.staging.config.ts`. */
export default defineConfig({
  testDir: 'e2e-staging',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.STAGING_URL ?? 'https://styrka-staging.homeboard-mh.workers.dev', locale: 'sv-SE', timezoneId: 'Europe/Stockholm', trace: 'retain-on-failure' },
  projects: [
    { name: 'staging-android', use: { ...devices['Pixel 7'] } },
    { name: 'staging-iphone', use: { ...devices['iPhone 14'] } },
  ],
});
