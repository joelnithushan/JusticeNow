# CLAUDE.md — Rules for AI Coding Agents

This file contains standing instructions for any AI coding agent (Claude Code, Copilot,
Cursor, etc.) working in this repository. **Follow these rules on every task, even when
the developer's prompt doesn't mention them.**

## Project Overview

**JusticeNow** — anonymous human rights case reporting and tracking for Sri Lanka,
aligned to UN SDG 16. Survivors and witnesses report violations (harassment, unlawful
detention, land disputes, discrimination, official misconduct) without revealing their
identity; a server-generated reference code is their only handle. Legal aid attorneys
and NGO advocacy officers handle cases in a staff dashboard.
University group project. Repo owner and reviewer: **Joel Nithushan**.

**Stack:** React (Vite) PWA client · react-i18next (en/ta/si) · Node.js/Express server ·
Supabase PostgreSQL + Storage

```
/client   React PWA (Vite, port 3000)
/server   Express API (port 5000)
  /config       supabase.js — Supabase client (reads server/.env)
  /controllers  request handlers
  /routes       route definitions
  /utils        referenceCode.js — reference code generator
  /tests        Jest tests
/docs
  schema.sql    database DDL — source of truth for the schema
TEST_CASES.md   human-readable test case tables (keep in sync with tests)
```

**Commands** (run from repo root unless noted):

| Command | Purpose |
|---|---|
| `npm run install:all` | install root + server + client deps |
| `npm run dev` | start server + client together |
| `npm test` (in `/server`) | run the test suite — must pass before any push |

## ANONYMITY — THE ONE RULE THAT OVERRIDES EVERYTHING

Reporters never create accounts and never log in. `case_reports` has NO foreign key
to any user record, and no name/email/phone columns — **by design**.

- **NEVER** add a `reporter_id`, `user_id`, `email`, `phone` or `name` column to
  `case_reports`, no matter how convenient it would be for a feature.
- **NEVER** add authentication for reporters. Only staff authenticate.
- **NEVER** log request bodies, IP addresses, or anything that could identify a
  reporter — not in server logs, not in error reports.
- **NEVER** cache case data (form contents, reference codes) in `localStorage`,
  `sessionStorage`, cookies, or any other client-side persistence.
- Uploaded evidence files get random storage names; original filenames are discarded.
- The Quick Exit button must remain reachable on every reporter-facing page.

If a requested feature seems to require breaking one of these rules, stop and flag it
to Joel instead of implementing it.

## Git Workflow — MANDATORY

1. **Never commit or push directly to `main`.** No exceptions, including "tiny" fixes.
2. **Before starting work:** update main and branch from it:
   ```bash
   git checkout main && git pull origin main
   git checkout -b <type>/<short-description>
   ```
3. **Branch naming** — lowercase, hyphen-separated, with one of these prefixes:
   - `feat/` — new feature (e.g. `feat/status-lookup`)
   - `fix/` — bug fix (e.g. `fix/report-validation`)
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
   `server/.env` (Supabase key) must NEVER be committed; only `.env.example`
   with placeholders.

## Testing — Required for All New Code

**Every new feature, endpoint, or bug fix must ship with test cases in the same
branch/PR.** Untested code will not be merged.

- Pure logic (validators, generators, helpers) gets Jest unit tests in `server/tests/`.
- Endpoint behavior gets integration tests (Jest + Supertest) once the team's shared
  Supabase test project is provisioned; until then, document the cases as *manual*
  in `TEST_CASES.md` and verify them by hand before the PR.
- Cover the happy path AND failure paths: missing fields, invalid enum values,
  not-found, duplicates.
- Follow the `TC-XX-YY` numbering scheme and add new cases to `TEST_CASES.md`.
- For bug fixes: write a test that reproduces the bug first, then fix it.

## Code Conventions

- **Enums are lowercase snake_case** everywhere:
  case types `harassment|unlawful_detention|land_dispute|discrimination|official_misconduct|other`,
  statuses `received|under_review|referred|closed`,
  staff roles `attorney|officer|admin`.
  API input is normalized to lowercase before insert. District names keep their
  proper capitalisation (e.g. `Nuwara Eliya`) and must match `server/constants.js`.
- **Controller validation must mirror `docs/schema.sql`** CHECK/NOT NULL constraints and
  return `400` with a helpful message — never let raw DB constraint errors surface
  as `500`s.
- **Schema changes** go into `docs/schema.sql` (single source of truth) and must be
  announced in the PR description so the team re-runs it in Supabase. Keep
  `server/constants.js` and `client/src/constants.js` in sync with it.
- **i18n:** all user-facing strings go through react-i18next. Adding a string means
  adding the key to ALL THREE of `en.json`, `ta.json`, `si.json` (English fallback
  text is acceptable in ta/si until translated).
- **API response shape:** `{ success: boolean, message?, data?, error? }` — keep it
  consistent with existing controllers.
- **Passwords:** always `bcryptjs`-hashed into `password_hash`; never store, log, or
  return plaintext passwords or hashes.
- **Secrets:** read from `server/.env` via `dotenv`; document new variables in
  `server/.env.example` with placeholder values.
