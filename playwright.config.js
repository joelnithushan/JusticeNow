import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright end-to-end config.
 *
 * The webServer block builds the client and serves it on port 3000, so `npm
 * run test:e2e` works from a clean checkout with no server already running.
 * Journeys that need the backend are marked test.fixme in the specs until the
 * relevant stories land — they show as skipped, not failed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'npm --prefix client run build && npm --prefix client run preview -- --port 3000 --strictPort',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
