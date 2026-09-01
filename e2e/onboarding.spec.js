/**
 * E2E — the 3-slide onboarding flow (language → privacy → safety).
 *
 * Runs at a small phone viewport (360×640) because the flow must hold there,
 * and asserts the behaviour the story calls for: advance, Back, Skip, and the
 * language chosen on slide 1 carrying through. Also gates on no CRITICAL axe
 * violations per slide, and confirms the live Quick Exit button never appears
 * on onboarding (slide 3 shows only a static picture of it).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The flow must hold at a small phone viewport.
test.use({ viewport: { width: 360, height: 640 } });

const exitButton = { name: /leave this app now/i };

test('bare /onboarding lands on slide 1', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/onboarding\/language$/);
  await expect(
    page.getByRole('heading', { name: 'Choose your language' }),
  ).toBeVisible();
});

test('advances 1 → 2 → 3 → home and never shows the live Quick Exit button', async ({
  page,
}) => {
  await page.goto('/onboarding/language');
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', exitButton)).toHaveCount(0);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'You stay anonymous' })).toBeVisible();
  await expect(page.getByRole('button', exitButton)).toHaveCount(0);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Leave instantly, any time' }),
  ).toBeVisible();
  await expect(page.getByRole('button', exitButton)).toHaveCount(0);

  // Last slide's button is "Get started" and it leaves the flow for home.
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /report a case/i })).toBeVisible();
});

test('Back steps between slides; Skip leaves for home', async ({ page }) => {
  await page.goto('/onboarding/safety');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'You stay anonymous' })).toBeVisible();

  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the language chosen on slide 1 carries through to slide 2', async ({ page }) => {
  await page.goto('/onboarding/language');

  // Tamil onboarding strings are placeholder-marked "[uncertain]", so seeing
  // them is proof the language switched and then persisted across the slide.
  await page.getByRole('button', { name: 'தமிழ்' }).click();
  await expect(
    page.getByRole('heading', { name: '[uncertain] Choose your language' }),
  ).toBeVisible();

  await page.getByRole('button', { name: '[uncertain] Continue' }).click();
  await expect(
    page.getByRole('heading', { name: '[uncertain] You stay anonymous' }),
  ).toBeVisible();
});

for (const step of ['language', 'privacy', 'safety']) {
  test(`no critical accessibility violations on onboarding: ${step}`, async ({
    page,
  }) => {
    await page.goto(`/onboarding/${step}`);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
}
