# Testing guide

JusticeNow has four categories of tests. This is the pattern every member copies from.

| Category | Tool | Where | Run |
|---|---|---|---|
| Unit | Vitest | `server/__tests__/unit/`, `client/src/__tests__/` | `npm test` |
| Integration (HTTP) | Vitest + Supertest | `server/__tests__/integration/` | `npm test` |
| Component | Vitest + Testing Library | `client/src/__tests__/` | `npm test` |
| End-to-end | Playwright | `e2e/` | `npm run test:e2e` |
| Accessibility | Playwright + axe-core | `e2e/accessibility.spec.js` | `npm run test:a11y` |

## Scripts (run from the repo root)

```bash
npm test           # unit + integration + component tests (server then client)
npm run test:watch # watch mode (client)
npm run test:e2e   # Playwright end-to-end (builds and serves the client first)
npm run test:a11y  # accessibility checks only
npm run test:all   # lint + unit/integration + e2e — the full gate
```

Per-package watch mode:

```bash
npm run test:watch --prefix server
npm run test:watch --prefix client
```

First-time Playwright setup (downloads the browser binaries):

```bash
npx playwright install --with-deps
```

## How the tests stay safe and fast

- **The database is mocked.** Integration tests stub the Supabase client (see
  `server/__tests__/integration/reports.test.js`) — they never touch the real project,
  so they need no credentials and cannot leak or mutate real data.
- **Anonymity is asserted, not assumed.** The reports integration test checks that the
  row sent to the database carries none of `user_id`, `reporter_id`, `email`, `phone`,
  `name` or `ip`. Keep assertions like this when you add endpoints.

## Pending tests (`it.todo` / `test.fixme`)

Some tests describe behaviour whose feature is not built yet — staff authentication, and
the rate-limited anonymous status lookup. They are written now as **executable
specification**:

- `it.todo(...)` (Vitest) and `test.fixme(...)` (Playwright) show as **skipped**, not
  failed, so the suite stays green.
- When you build the feature, turn its pending test into a real one **in the same PR**.

This is deliberate: the contract is recorded and impossible to forget, without faking a
passing test for code that does not exist.

## Writing a new test

1. Put it next to its peers in the table above.
2. Mock external systems (Supabase, network) — never hit the real backend from a unit or
   integration test.
3. Cover the happy path **and** the failure paths (missing fields, wrong role,
   not-found).
4. For anything touching anonymity or authorization, assert the boundary explicitly.
