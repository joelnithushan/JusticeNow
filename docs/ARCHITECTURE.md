# Architecture overview

Short map of how the JusticeNow monorepo is layered. Keep this accurate to the
code; prefer links over duplication.

## Packages

| Path | Role |
|------|------|
| `/server` | Express REST API + Supabase (PostgreSQL, Storage, optional Auth helpers) |
| `/client` | React + Vite PWA (reporter + staff web UI) |
| `/mobile` | Expo / React Native app (same API as the PWA) |
| `/docs` | `schema.sql`, numbered migrations, security and runbooks |

Both `/client` and `/mobile` are API consumers. They must not embed business
rules that belong on the server (especially anything about who may see internal
notes or evidence).

## Server layering

```
routes  →  controllers  →  services  →  Supabase / external APIs
             ↑                ↑
         req/res only    business logic, no Express
```

- **`routes/`** — path + middleware only (auth, rate limit, multer). No SQL.
- **`controllers/`** — validate input, call services, shape HTTP responses.
- **`services/`** — domain logic (cases, staff, places proxy, transcription, audit…).
- **`middleware/`** — staff JWT auth, rate limiting.
- **`constants.js`** — case types, statuses, districts (must stay aligned with
  `docs/schema.sql` and the client/mobile constant modules).

Public (tokenless) examples: `POST /api/reports`, `GET /api/status/:code`,
`POST /api/places/autocomplete`, `POST /api/transcribe`.  
Staff-only examples: report list/detail, notes, assign, admin org/staff.

## Mobile routing

`/mobile` uses **expo-router** (`app/` = file-based routes):

- Reporter: `index`, `report/`, `status`, `directory`, `guidance`, `rights`, …
- Staff: `app/staff/...` (login, tabs, case detail, admin).

Shared mobile modules live under `mobile/src/` (`api/`, `context/`, `i18n/`,
`constants.ts`, `theme.ts`).

## Shared constants

Do **not** redeclare case-type / district / status lists in random files.

| Surface | Module |
|---------|--------|
| Server | `server/constants.js` |
| Web client | `client/src/constants.js` |
| Mobile | `mobile/src/constants.ts` |
| Database | CHECK constraints in `docs/schema.sql` |

## Anonymity boundary

`case_reports` has **no** reporter identity columns and must never gain any.
Reporters never authenticate. Staff authenticate; org-scoping and audits apply
to staff actions only. Full rules: [`CLAUDE.md`](../CLAUDE.md).

## Related docs

- [LOCAL_DEV.md](./LOCAL_DEV.md) — how to run locally
- [TEST_MAP.md](./TEST_MAP.md) — where tests live
- [REVIEW_ANONYMITY_CHECKLIST.md](./REVIEW_ANONYMITY_CHECKLIST.md) — PR review ticks
- [security/](./security/) — env hygiene and threat notes
