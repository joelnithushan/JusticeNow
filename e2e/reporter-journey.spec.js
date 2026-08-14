/**
 * E2E — the anonymous reporter journey.
 *
 * The parts that need only the client (navigation, language switching) run and
 * must pass. The full submit-and-look-up flow needs the backend and a seeded
 * case, so it is marked test.fixme until the anonymous status-lookup story
 * lands; it documents the intended journey in the meantime.
 */

import { test, expect } from '@playwright/test';

test('reporter can switch language and open the report form', async ({ page }) => {
  await page.goto('/');

  // Language switch: pick Tamil, then the report action should be in Tamil.
  await page.getByRole('button', { name: 'தமிழ்' }).click();
  await expect(page.getByRole('link', { name: 'புகார் அளிக்க' })).toBeVisible();

  // Back to English and open the report form.
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('link', { name: /report a case/i }).click();

  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole('button', { name: /submit report/i })).toBeVisible();
});

test('the Quick Exit control is present on the report form', async ({ page }) => {
  await page.goto('/report');
  // Safety feature must be reachable on reporter-facing pages.
  await expect(page.getByRole('button', { name: /quick exit/i })).toBeVisible();
});

test.fixme(
  'reporter submits a report, receives a code, and looks it up',
  async ({ page }) => {
    // PENDING: needs the backend running and the anonymous status-lookup
    // endpoint (rate limited, internal notes stripped). Steps:
    //   1. go to /report, fill case type + district + description
    //   2. submit, land on /report/success, capture the JN- reference code
    //   3. go to /status, enter the code, see the case status
    await page.goto('/report');
  },
);
