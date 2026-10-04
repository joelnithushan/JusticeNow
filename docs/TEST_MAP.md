# Test map

Where automated tests live and how to run them. Complements `TESTING.md` with
a quick directory map for contributors.

## Quick commands (repo root)

| Command | What runs |
|---------|-----------|
| `npm test` | Server then client Vitest suites |
| `npm run test --prefix server` | Server unit + integration only |
| `npm run test --prefix client` | Client component tests only |
| `npm run test:e2e` | Playwright end-to-end |
| `npm run test:a11y` | Playwright + axe accessibility |
| `npm run lint` | ESLint across the repo |

First-time e2e browsers:

```bash
npx playwright install --with-deps
```

## Server (`server/__tests__/`)

| Area | Path | Notes |
|------|------|-------|
| Unit | `unit/` | Pure logic (reference codes, status transitions, auth helpers, etc.) |
| Integration | `integration/` | HTTP via Supertest; **Supabase is stubbed** — no real DB credentials required |

Integration suites typically:

1. Set `SUPABASE_URL` / `SUPABASE_KEY` / `JWT_SECRET` test placeholders.
2. Stub `global.fetch` **before** importing `app.js`.
3. Sign staff JWTs when testing guarded routes.

## Client (`client/src/__tests__/`)

Component tests with Testing Library. API modules are mocked so no network
calls leave the machine.

## End-to-end (`e2e/`)

Playwright drives the built web app. These are slower and usually need the
client build / preview setup described in `TESTING.md` and `playwright.config.js`.

## Safety rules for new tests

- Never hit a real Supabase project from unit/integration tests.
- Assert anonymity boundaries where relevant (no `user_id` / email / phone /
  name / IP on inserted case rows).
- Do not log case narratives, reference codes, or evidence paths in test output.

## Related docs

- [TESTING.md](../TESTING.md) — full testing guide
- [LOCAL_DEV.md](./LOCAL_DEV.md) — how to run the apps locally
- [CLAUDE.md](../CLAUDE.md) — anonymity hard rules tests should protect
