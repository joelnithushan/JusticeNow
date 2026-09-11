# JusticeNow — End-to-End Build Plan

Working spec for the full-stack build of every remaining page (mobile app + shared
Express/Supabase backend). **Every agent must read this file AND the root `CLAUDE.md`
before writing code.** CLAUDE.md's hard rules win over anything here.

Scope: **mobile app (`/mobile`, Expo + expo-router) + backend (`/server`)**. The web
client (`/client`) is out of scope for this pass; the backend we build serves it too.

---

## Non-negotiable rules (from CLAUDE.md — repeated so agents don't miss them)

- **Anonymity by construction.** `case_reports` gets NO reporter identity, ever
  (no user_id/email/phone/name/IP/session). Do not add such columns or fields.
- **Reporters never authenticate.** Only staff (officer/attorney/admin) log in.
- **Internal notes never reach an unauthenticated caller.** Filter on the SERVER.
  The anonymous status endpoint returns reporter-visible notes only.
- **No device storage** except the existing "onboarding seen" boolean. Staff auth
  token lives in memory only (re-login on cold start is acceptable and safest).
- **Evidence only via short-lived signed URLs.** Never a public URL.
- **Never log** case narratives, evidence paths, reference codes, or request bodies.
- **Anonymous status lookup is rate-limited** and returns an IDENTICAL generic
  response for "not found" and "rate limited" (no oracle).
- Every user-facing string goes through `t('key')`; add keys to `en.json`, `ta.json`,
  `si.json` together with identical structure. Mark uncertain ta/si with a leading
  `[uncertain]` (existing convention).
- Comment the WHY for anything about anonymity/safety.

## Architecture patterns (match existing code exactly)

- **Server:** `routes/*` define paths only → `controllers/*` do req/res → `services/*`
  hold logic + all Supabase calls. No Supabase calls in routes or (ideally) controllers
  beyond thin orchestration. Responses: success `{ success:true, data }`; validation
  `400 { success:false, message }` (or `{ errors:{field:msg} }`); never leak stack traces.
- **Supabase client:** `server/config/supabase.js` (already exists). New tables → append
  to `docs/schema.sql` and add a `docs/migrations/NNN_*.sql` file. Do NOT assume a live DB
  in tests — mock Supabase like the existing `server/__tests__` do.
- **Constants** mirrored in `server/constants.js` AND `mobile/src/constants.ts`. Keep in
  sync in the same change. Add new shared lists (e.g. audit actions) to both.
- **Mobile:** screens in `/mobile/app` (expo-router file routes). API calls ONLY through
  `mobile/src/api/client.ts` (axios). Presentational styling via `src/theme.ts` tokens and
  the shared components. No `fetch`/`axios` inside a screen component.
- **Theme:** navy→teal brand gradient via `components/GradientBackground.tsx`; brand mark
  via `components/BrandMark.tsx`; selects via `components/SelectField.tsx`. Reuse them.
- **Verify each unit:** mobile `cd mobile && node_modules/.bin/tsc --noEmit` must pass;
  server `cd server && npm test` must pass; keep `npm run format` clean.

## Data model additions

- **`audit_log`** (new): `id uuid pk`, `case_id uuid null → case_reports`, `actor_id uuid
  null → staff_users`, `action text`, `detail jsonb`, `created_at timestamptz default now()`.
  Written on every status transition, note add, assignment, and admin mutation. Never store
  narrative/PII in `detail`.
- No other schema changes to `case_reports` (anonymity).

## Auth design

- `POST /api/staff/login` → verify email + bcrypt password → issue JWT
  (`{ sub: staff.id, role, org: organisation_id }`, short expiry). Add `jsonwebtoken` dep.
- Middleware `requireStaff` (valid token) and `requireRole('admin')` for admin routes.
- Mobile `AuthContext` holds the token + decoded role/org IN MEMORY; axios attaches
  `Authorization: Bearer` for staff calls only (never on reporter calls).
- Seed script (`server/scripts/seed.js`) to create one org + one admin for local testing.

## Navigation model

- **Reporter side:** no bottom tabs. Shared `ReporterTopBar` (Back + Quick Exit) on
  Home/Report/Status/Directory/About. Hub-and-spoke from Home.
- **Staff side:** expo-router group `app/staff/(tabs)` with bottom tabs **Reports ·
  Analytics · Admin** (Admin tab hidden unless role === 'admin'). Guarded by AuthContext;
  unauthenticated → redirect to `/staff/login`.
- `app/+not-found.tsx` for unknown routes.

---

## Execution units (build strictly in this order, one at a time)

| # | Unit | Backend | Mobile |
|---|------|---------|--------|
| U0 | **Foundations** | `jsonwebtoken` dep; `audit_log` schema + migration; `services/auth.js` (login, JWT), `middleware/auth.js`; `services/audit.js`; `scripts/seed.js`; tests | — |
| U1 | **Nav foundation** | — | `AuthContext`; `ReporterTopBar`; `app/staff/(tabs)/_layout.tsx`; `+not-found.tsx`; `ErrorState` component; wire `_layout.tsx` |
| U2 | **Status lookup + detail** | `GET /api/status/:reference_code` (rate-limited, generic not-found, reporter-visible notes only) | `app/status.tsx` — code entry → status + note timeline |
| U3 | **Directory list + detail** | `GET /api/organisations` (filter district/case_type), `GET /api/organisations/:id` | `app/directory.tsx` (list+filter), `app/directory/[id].tsx` |
| U4 | **About / Privacy / Safety** | — | `app/about.tsx` (how-it-works, anonymity, Quick Exit explainer) |
| U5 | **Staff login** | (from U0) | `app/staff/login.tsx` real form → AuthContext → tabs |
| U6 | **Staff reports list** | (list exists) add auth guard | move `reports.tsx` into `(tabs)`, restyle, row → case detail |
| U7 | **Staff case detail** | `GET /api/reports/:id` (full + notes + signed evidence URL), `POST /api/reports/:id/notes`, `PATCH /api/reports/:id/status` (canTransition + reason + audit), `PATCH /api/reports/:id/assign` | `app/staff/case/[id].tsx` — narrative, evidence, notes (add, visibility), status transition, assign org |
| U8 | **Analytics** | `GET /api/analytics` (counts by status/type/district, recent volume) | `app/staff/(tabs)/analytics.tsx` |
| U9 | **Audit trail** | `GET /api/audit` (admin, paginated) | `app/staff/audit.tsx` (admin) |
| U10 | **Admin — organisations** | `POST/PUT/DELETE /api/organisations` (admin) | `app/staff/admin/organisations.tsx` + editor |
| U11 | **Admin — staff** | `GET/POST/PUT/DELETE /api/staff` (admin; bcrypt on create) | `app/staff/admin/staff.tsx` + editor |

### Per-unit acceptance checklist
- [ ] Backend: route→controller→service; validation; audit where it mutates; tests pass.
- [ ] Anonymity/authorization rules honoured (esp. server-side note filtering, rate limit).
- [ ] Mobile: screen wired through `src/api/client.ts`; loading/empty/error states; theme.
- [ ] i18n keys added to en/ta/si together.
- [ ] `tsc --noEmit` clean (mobile); `npm test` green (server); formatted.
- [ ] Nav wired; back + Quick Exit present on reporter screens; guards on staff screens.
