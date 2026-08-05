# CLAUDE.md — Rules for AI Coding Agents

This file contains standing instructions for any AI coding agent (Claude Code, Copilot,
Cursor, etc.) working in this repository. **Follow these rules on every task, even when
the developer's prompt doesn't mention them.**

## Project Overview

Community Hazard Alert & Response System — citizens in Sri Lanka report hazards
(dengue / flood / heat / landslide) and send SOS distress signals with GPS location.
University group project, team **SPM_NU_WE_01**. Repo owner and reviewer: **Joel Nithushan**.

**Stack:** React (Vite) client · Node.js/Express server · Supabase PostgreSQL

```
/client   React frontend (Vite, port 3000)
/server   Express API (port 5000)
  /config       supabase.js — Supabase client (reads server/.env)
  /controllers  request handlers
  /routes       route definitions
  /tests        Jest + Supertest integration tests
  schema.sql    database DDL — source of truth for the schema
TEST_CASES.md   human-readable test case tables (keep in sync with tests)
```

**Commands** (run from repo root unless noted):

| Command | Purpose |
|---|---|
| `npm run install:all` | install root + server + client deps |
| `npm run dev` | start server + client together |
| `npm test` (in `/server`) | run the full API test suite — must pass before any push |

## Git Workflow — MANDATORY

1. **Never commit or push directly to `main`.** No exceptions, including "tiny" fixes.
2. **Before starting work:** update main and branch from it:
   ```bash
   git checkout main && git pull origin main
   git checkout -b <type>/<short-description>
   ```
3. **Branch naming** — lowercase, hyphen-separated, with one of these prefixes:
   - `feat/` — new feature (e.g. `feat/alerts-api`)
   - `fix/` — bug fix (e.g. `fix/sos-status-casing`)
   - `refactor/` — code restructuring, no behavior change
   - `test/` — adding or improving tests only
   - `docs/` — documentation only
   - `chore/` — tooling, deps, config
4. **Push the branch and open a Pull Request to `main`.** Use a clear PR title and a
   description of what changed and how it was tested.
5. **Only the repo owner (Joel) reviews and merges PRs.** Never merge your own PR,
   never self-approve, never force-push to `main`.

## Before Every Push — Quality Gate

Work is not "done" when it runs. Before pushing, ALWAYS:

1. **Refactor the code you touched:**
   - Remove dead code, commented-out blocks, unused imports/variables, and stray
     `console.log` debugging statements.
   - Extract duplicated logic; keep functions small and single-purpose.
   - Match the existing style of the file (naming, error-response shape, comments).
2. **Run the full test suite** — `cd server && npm test`. All tests must pass.
   If your change breaks a test, fix the code or the test; never delete or skip
   tests to make the suite green.
3. **Check nothing sensitive is staged** — `git status` before committing.
   `server/.env` (Supabase secret key) must NEVER be committed; only `.env.example`
   with placeholders.

## Testing — Required for All New Code

**Every new feature, endpoint, or bug fix must ship with complete test cases in the
same branch/PR.** Untested code will not be merged.

- Add integration tests to `server/tests/` (Jest + Supertest pattern in `api.test.js`).
- Cover the happy path AND failure paths: missing fields, invalid enum values,
  out-of-range coordinates, not-found, duplicates — mirror the style of existing tests.
- Follow the `TC-XX-YY` numbering scheme and add the new cases to `TEST_CASES.md`.
- For bug fixes: write a test that reproduces the bug first, then fix it.
- Tests run against the real Supabase DB. Use unique per-run identifiers
  (e.g. `test_<timestamp>@example.lk`) and clean up created rows in `afterAll`
  (deleting a test user cascades to their reports/SOS).

## Code Conventions

- **Enums are lowercase** everywhere: hazard types `dengue|flood|heat|landslide`,
  severity `low|medium|high`, report status `pending|confirmed|rejected`,
  SOS status `active|resolved`. API input is normalized to lowercase before insert.
- **Controller validation must mirror `schema.sql`** CHECK/NOT NULL constraints and
  return `400` with a helpful message — never let raw DB constraint errors surface
  as `500`s.
- **Schema changes** go into `server/schema.sql` (single source of truth) and must be
  announced in the PR description so the team re-runs it in Supabase.
- **API response shape:** `{ success: boolean, message?, data?, error? }` — keep it
  consistent with existing controllers.
- **Passwords:** always `bcryptjs`-hashed into `password_hash`; never store, log, or
  return plaintext passwords or hashes.
- **Secrets:** read from `server/.env` via `dotenv`; document new variables in
  `server/.env.example` with placeholder values.
