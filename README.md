# JusticeNow

> **Anonymous Human Rights Case Reporting & Tracking Platform**

JusticeNow is an installable web app (PWA) that lets survivors and witnesses of human
rights violations in Sri Lanka report what happened **without revealing their
identity**, and follow what is being done about their case using only a reference code.
Legal aid attorneys and NGO advocacy officers receive each report in a secure dashboard
and update its status.

This project is aligned to **UN Sustainable Development Goal 16 — Peace, Justice and
Strong Institutions**, which calls for access to justice for all and accountable
institutions.

## Project rules

The whole product depends on one property — reporters are anonymous by construction —
and these rules protect it. Full detail is in [`CLAUDE.md`](CLAUDE.md).

1. **No reporter identity on a case.** `case_reports` has no `user_id`, `email`,
   `phone`, `name`, IP or session id, and none may be added.
2. **Reporters never authenticate.** Only staff (attorneys, NGO officers, admins) log in.
3. **No case data on the device.** Nothing in `localStorage`/`sessionStorage` except a
   single "onboarding seen" flag.
4. **Internal notes and evidence are staff-only.** Filter server-side; serve evidence
   via short-lived signed URLs; the anonymous status lookup is rate limited.
5. **Never commit `.env`, and never merge your own PR.**

## Team

**Group ID:** `SPM_NU_WE_01`

| Name | Registration number |
|---|---|
| Joel Nithushan A.T | IT23556652 |
| Vaishnavi L | IT23717336 |
| Thushalini U | IT23794870 |
| Kanistan T | IT23748644 |

**Modules:** SE3080 Software Project Management · SE3050 UX Engineering
**Course:** BSc (Hons) in Information Technology — Software Engineering, SLIIT

## The problem

People who experience harassment, unlawful detention, land grabbing, discrimination or
official misconduct often do not come forward. Every existing channel requires them to
identify themselves first — a name, a phone number, an address, an ID. But identifying
yourself to the very institution you are complaining about carries a real risk of
retaliation, and the person responsible is sometimes the one who holds power over you.

So the report never gets made, and the violation goes unrecorded.

JusticeNow removes identification as the price of seeking help. A reporter can describe
what happened and get their case in front of people who can act on it, without ever
handing over anything that identifies them.

## How it works

1. A reporter opens the app, picks their language, and describes what happened — **no
   account, no name, no phone number**.
2. The system issues a **unique reference code**. That code is the only handle to the
   case.
3. Legal aid attorneys and NGO advocacy officers receive the report in a **secure
   dashboard** and update its status.
4. The reporter **checks progress at any time using the reference code alone**.

Case types covered: harassment, unlawful detention, land dispute, discrimination,
official misconduct, and other.

## Key design decisions

Two decisions are deliberate and central to the product, not incidental:

- **Anonymity by construction.** The `case_reports` table has **no foreign key to any
  user record**. There is no column anywhere that links a case to a person. This is not
  an oversight — storing such a link would defeat the entire purpose of the product, so
  the data model makes it impossible. Only staff (attorneys, advocacy officers) ever
  authenticate; reporters never log in.

- **PWA rather than native.** JusticeNow is a Progressive Web App, not a native mobile
  app. A native app leaves an install record and a visible entry in the device's app
  list — a real risk for someone whose phone may be checked by the person they are
  reporting. A PWA can still be added to the home screen, but leaves far less behind. In
  the same spirit, the app caches no case data on the device and offers a quick-exit
  control.

## Features

| Feature | Description |
|---|---|
| Anonymous case reporting | Submit case type, date, district, description, and optional evidence |
| Reference code issuing | A unique code is returned on submission — the reporter's only handle |
| Case status tracking | Look up status and the update timeline using the reference code |
| Legal resource directory | Find NGOs and legal aid bodies by district and case type |
| Case management dashboard | Staff triage reports, update status, and add case notes |
| Safety & discreet use | Quick-exit control, no cached case data, privacy reassurance throughout |
| Multi-language | Tamil, English and Sinhala |

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React + Vite, installable PWA via `vite-plugin-pwa` |
| Routing | React Router |
| Localisation | react-i18next — Tamil (`ta`), English (`en`), Sinhala (`si`) |
| HTTP client | Axios |
| Backend | Node.js + Express (REST API) |
| Database | PostgreSQL via Supabase |
| File storage | Supabase Storage (evidence uploads) |
| Authentication | Supabase Auth — **staff accounts only**; reporters never log in |
| Project management | Jira (Scrum board, key `JNOW`) |
| Communication | MS Teams |

## Project structure

The repository now contains **three** parts that share one backend:

- **`/client`** — the React + Vite **PWA** (the original submitted coursework).
- **`/mobile`** — an **Expo React Native** app (installable Android APK). It is an
  *addition* that consumes the same API; it does not replace the PWA.
- **`/server`** — the **shared** Express REST API (Supabase). Both `/client` and
  `/mobile` talk to it — the server is unchanged by the mobile addition.

See [`mobile/README.md`](mobile/README.md) and [`mobile/BUILDING.md`](mobile/BUILDING.md)
for running the app on a phone and producing the APK.

```
/client                 React PWA (Vite, port 3000)
  index.html            App shell — title, meta, PWA hooks
  vite.config.js        Vite + vite-plugin-pwa (manifest, service worker)
  /src
    /pages              Home, ReportCase, ReportSuccess, CheckStatus,
                        Directory, StaffLogin, StaffReports
    /components         LanguageSwitcher, QuickExitButton
    /i18n               index.js + en/ta/si translation files
    /api                client.js — Axios instance + API helpers
    constants.js        Case types and districts (mirrors the server)
/mobile                 Expo React Native app (Android APK via EAS)
  app/                  expo-router screens (Home, 3-step report, success,
                        status, directory, staff login/reports)
  components/           LanguageSwitcher, QuickExitButton
  src/                  api/client.ts, constants.ts, i18n (en/ta/si),
                        context/ReportFormContext.tsx, theme.ts
  app.json / eas.json   Expo + EAS build config (preview profile = APK)
  BUILDING.md           Dev + APK build guide
/server                 Express API (port 5000)
  index.js              HTTP listener
  app.js                Express app (routes, CORS, error handling)
  /routes               reports.js, status.js, organisations.js, staff.js, health.js
  /controllers          request handlers
  /config               supabase.js — Supabase client (reads server/.env)
  /utils                referenceCode.js — reference code generator
  /constants.js         Case types, statuses, districts (mirrors the schema)
  /tests                Jest tests
/docs
  schema.sql            Database schema — run this in the Supabase SQL Editor
                        (Sprint 0 planning documents also live here)
TEST_CASES.md           Human-readable test case tables
CLAUDE.md               Standing rules for AI coding agents in this repo
```

## Getting started

### Prerequisites

- Node.js 18 or newer, and npm
- A free [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/joelnithushan/JusticeNow.git
cd JusticeNow
npm run install:all      # installs root + server + client dependencies
```

### 2. Set up the database

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, and run the contents of [`docs/schema.sql`](docs/schema.sql).
3. Open **Storage** and create a **private** bucket named `evidence` (for uploads).

### 3. Configure environment variables

Copy the example file and fill in your Supabase credentials from
**Project Settings → API**:

```bash
cp server/.env.example server/.env
```

```
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-anon-key
PORT=5000
```

> ⚠️ Never commit `server/.env`. It is gitignored; only `server/.env.example` (with
> placeholders) belongs in version control.

### 4. Run the app

```bash
npm run dev              # starts server (5000) + client (3000) together
```

Or run them separately:

```bash
cd server && npm run dev   # API on http://localhost:5000
cd client && npm run dev   # app on http://localhost:3000
```

### 5. Health check

Confirm the API is up and can reach the database:

```
http://localhost:5000/api/health
```

A healthy response is `{ "success": true, "status": "ok", "database": "connected" }`.

## Running tests

Tests run from the repo root. See [`TESTING.md`](TESTING.md) for the full guide.

```bash
npm test           # unit + integration + component tests (Vitest + Supertest + Testing Library)
npm run test:watch # watch mode (client)
npm run test:e2e   # Playwright end-to-end (builds and serves the client first)
npm run test:a11y  # accessibility checks (axe-core)
npm run test:all   # lint + unit/integration + e2e — the full gate
```

- **Unit** — pure logic: reference-code generation, the status state machine.
- **Integration** — HTTP endpoints via Supertest, with the Supabase client mocked (no
  real database, no credentials needed).
- **Component** — React form behaviour via Testing Library.
- **End-to-end / accessibility** — Playwright drives the built app; axe-core checks every
  public page.

First-time Playwright setup: `npx playwright install --with-deps`.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch, commit and PR workflow, and
[`CLAUDE.md`](CLAUDE.md) for the rules our AI agents must follow. In short: branch from
`main` with the Jira key, commit under your own account, keep CI green, and have another
member review before merge.

## Team workflow

Individual contribution is assessed, so **each member commits under their own GitHub
account** and references the Jira issue key in commit messages.

1. Branch from `main`, naming the branch with the Jira key and a short description:
   ```bash
   git checkout main && git pull origin main
   git checkout -b feat/JNOW-9-submit-case-report
   ```
2. Reference the issue key in every commit message:
   ```
   JNOW-9: add case report submission endpoint
   ```
3. Open a Pull Request into `main`, and have **another team member review** it before
   it is merged. Never merge your own PR without a review.
4. Keep `server/.env` and any real secrets out of commits.

## Sprint scope

| Sprint | Scope |
|---|---|
| Sprint 0 | Tooling, charter, backlog, roles, database schema, project scaffold |
| Sprint 1 | Anonymous access, language selection, case submission, reports list |
| Sprint 2 | Status lookup, resource directory, case management, quick exit |

## Academic project notice

This is an **academic project** built for SLIIT coursework (modules SE3080 and SE3050).
It is **not a live service**. It provides **no legal advice**, and it **must not be used
to report real human rights incidents**. For a genuine concern, contact a qualified
legal aid organisation or the relevant authorities directly.
