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
  await expect(page.getByRole('button', { name: /leave this app now/i })).toBeVisible();
});

test('Quick Exit is not shown on the splash screen', async ({ page }) => {
  await page.goto('/');
  // Nothing has been typed yet on the splash, so there is nothing to clear.
  await expect(page.getByRole('button', { name: /leave this app now/i })).toHaveCount(
    0,
  );
});

test('Quick Exit clears the form and Back cannot restore it', async ({ page }) => {
  await page.goto('/report');

  // Type into the description, then bail out via Quick Exit.
  const description = page.getByLabel(/what happened\?/i);
  await description.fill('Sensitive details that must not survive an exit.');
  await page.getByRole('button', { name: /leave this app now/i }).click();

  // We land on a neutral screen that reveals nothing about the app.
  await expect(page).toHaveURL(/\/exit$/);
  await expect(page.getByText(/justicenow/i)).toHaveCount(0);

  // The report page was replaced, so Back does not return to the filled form.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/report$/);

  // Even navigating back to the form directly shows an empty field.
  await page.goto('/report');
  await expect(page.getByLabel(/what happened\?/i)).toHaveValue('');
});

test.fixme('reporter submits a report, receives a code, and looks it up', async ({
  page,
}) => {
  // PENDING: needs the backend running and the anonymous status-lookup
  // endpoint (rate limited, internal notes stripped). Steps:
  //   1. go to /report, fill case type + district + description
  //   2. submit, land on /report/success, capture the JN- reference code
  //   3. go to /status, enter the code, see the case status
  await page.goto('/report');
});
