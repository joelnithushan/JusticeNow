# JusticeNow

> **Anonymous human rights case reporting and tracking — Sri Lanka**
> Aligned to UN SDG 16 (Peace, Justice and Strong Institutions).

Survivors and witnesses of human rights violations (harassment, unlawful detention,
land disputes, discrimination, official misconduct) can report what happened
**without revealing their identity**. They receive a reference code and can use that
code alone to follow what is being done about their case. Legal aid attorneys and
NGO advocacy officers receive reports in a secure dashboard and update case status.

## Anonymity by construction

Reporters **never create accounts and never log in**. The `case_reports` table has
**no foreign key to any user record** — there is deliberately no link between a case
and a person. The server-generated `reference_code` is the reporter's only handle.

> ⚠️ Do not add a `reporter_id`, `user_id`, `email`, `phone` or `name` column to
> `case_reports`. Only **staff** (attorneys, advocacy officers) authenticate.

**Why a PWA and not a native app?** A native app leaves an install record and a
visible entry in the device app list — a risk for someone whose phone may be checked
by the person they are reporting. A PWA can still be added to the home screen but
leaves far less behind. For the same reason the app never caches case data in
`localStorage`/`sessionStorage`, and every page has a **Quick Exit** button.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, installable PWA (`vite-plugin-pwa`) |
| Routing | React Router |
| Localisation | react-i18next — Tamil (ta), English (en), Sinhala (si) |
| HTTP client | Axios |
| Backend | Node.js + Express (REST API) |
| Database | PostgreSQL via Supabase (`@supabase/supabase-js`) |
| File storage | Supabase Storage (evidence uploads) |
| Auth | Supabase Auth — **staff accounts only** (next sprint) |

## Project structure

```
/client                 React PWA (Vite, port 3000)
  /src
    /pages              Home, ReportCase, ReportSuccess, CheckStatus,
                        Directory, StaffLogin, StaffReports
    /components         LanguageSwitcher, QuickExitButton
    /i18n               index.js + en/ta/si translation files
    /api                client.js — Axios instance + API helpers
/server                 Express API (port 5000)
  /routes               reports.js, status.js, organisations.js, staff.js, health.js
  /controllers          request handlers
  /config               supabase.js — Supabase client (reads server/.env)
  /utils                referenceCode.js — reference code generator
  /tests                Jest unit tests
/docs                   schema.sql — database DDL (run in Supabase SQL Editor)
TEST_CASES.md           human-readable test case tables
```

## Getting started

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of `docs/schema.sql`.
3. Open **Storage** and create a **private** bucket named `evidence`.
4. Copy `server/.env.example` to `server/.env` and fill in `SUPABASE_URL` and
   `SUPABASE_KEY` from **Project Settings → API**. Never commit `server/.env`.

### 3. Run the app

```bash
npm run dev        # starts server (5000) + client (3000) together
```

Or individually:

```bash
cd server && npm run dev   # API on http://localhost:5000
cd client && npm run dev   # app on http://localhost:3000
```

### 4. Verify everything works

```bash
# API + database connectivity
curl http://localhost:5000/api/health
# -> { "success": true, "status": "ok", "database": "connected" }

# Submit an anonymous report
curl -X POST http://localhost:5000/api/reports \
  -H "Content-Type: application/json" \
  -d '{"case_type":"land_dispute","district":"Jaffna","description":"Test report"}'
# -> { "success": true, ..., "data": { "reference_code": "..." } }

# Staff list with a filter
curl "http://localhost:5000/api/reports?case_type=land_dispute"

# Unit tests
cd server && npm test
```

In the browser: open http://localhost:3000, switch languages, submit a report via
**Report a case**, note the reference code on the success page, then open
**Staff login → Incoming reports** to see it listed.

## Current sprint status

| Feature | Status |
|---|---|
| Anonymous report submission (API + form) | ✅ done |
| Reference code generation & success page | ✅ done |
| Staff reports list with case-type filter | ✅ done |
| en/ta/si localisation + language switcher | ✅ done |
| Quick Exit button | ✅ done |
| PWA manifest | ✅ done |
| Check status by reference code | 🔜 next sprint |
| Legal resource directory | 🔜 next sprint |
| Staff login (Supabase Auth) | 🔜 next sprint |
