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

test('reporter submits a report, receives a code, and looks it up', async ({ page }) => {
  // Needs the backend running (VITE_API_BASE_URL pointed at it) and the
  // anonymous status-lookup endpoint. Journey:
  //   1. fill case type + district + description on /report
  //   2. submit, land on /report/success, capture the JN- reference code
  //   3. look the code up on /status and see the case status
  await page.goto('/report');

  // First real option after each select's placeholder (value="").
  await page.selectOption('#caseType', { index: 1 });
  await page.selectOption('#district', { index: 1 });
  await page.fill(
    '#description',
    'Automated end-to-end check: a placeholder narrative long enough to pass validation.',
  );

  await page.getByRole('button', { name: /submit report/i }).click();

  // Land on success and read the reference code the server issued.
  await expect(page).toHaveURL(/\/report\/success$/);
  const code = (await page.locator('.reference-code').innerText()).trim();
  expect(code).toMatch(/^JN-/);

  // Look it up anonymously and confirm the case is found (status chip shows).
  await page.goto('/status');
  await page.fill('#referenceCode', code);
  await page.getByRole('button', { name: /check status|look ?up/i }).click();

  await expect(page.locator('.status-card')).toBeVisible();
  await expect(page.locator('.status-chip')).toBeVisible();
});
