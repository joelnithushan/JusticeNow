/**
 * E2E — accessibility checks with axe-core.
 *
 * Runs axe on each public page and asserts there are no CRITICAL violations.
 * (Serious/moderate findings are worth fixing too, but we gate the build on
 * critical only, so the check is stable as the UI grows. Tighten as you go.)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PUBLIC_PAGES = [
  { name: 'Home', path: '/' },
  { name: 'Report a case', path: '/report' },
  { name: 'Check status', path: '/status' },
  { name: 'Directory', path: '/directory' },
  { name: 'Staff login', path: '/staff/login' },
];

for (const { name, path } of PUBLIC_PAGES) {
  test(`no critical accessibility violations on: ${name}`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical');

    // Attach any critical findings to the report to make failures actionable.
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
}
