/**
 * E2E — the staff journey.
 *
 * Entirely PENDING (test.fixme): it needs staff authentication (Supabase Auth),
 * the case-management endpoints, and seeded data — all later stories. Kept here
 * as the executable specification of the journey so it is not forgotten.
 */

import { test, expect } from '@playwright/test';

test.fixme(
  'staff log in, open a case, change its status, and add a reporter-visible note',
  async ({ page }) => {
    // 1. Sign in as staff at /staff/login (Supabase Auth — staff only).
    // 2. Open a case from the reports list.
    // 3. Change status via the canTransition-guarded endpoint (e.g. received
    //    -> under_review) and confirm the new status shows.
    // 4. Add a note with is_reporter_visible = true.
    await page.goto('/staff/login');
    expect(true).toBe(true);
  },
);

test.fixme(
  'a reporter-visible note added by staff appears in the reporter status view',
  async ({ page }) => {
    // Cross-checks the anonymity boundary: the reporter, using ONLY the
    // reference code, sees the reporter-visible note but never internal notes.
    await page.goto('/status');
    expect(true).toBe(true);
  },
);
