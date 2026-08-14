# CLAUDE.md — rules for AI agents working in this repo

Claude Code reads this file automatically. It is how our project rules reach every
member's agent. Follow it on every task, even when the prompt does not mention it.
Read it before writing anything.

## Project overview

JusticeNow is an installable web app (PWA) for anonymous human rights case reporting and
tracking in Sri Lanka, aligned to UN SDG 16. Survivors and witnesses report violations
(harassment, unlawful detention, land disputes, discrimination, official misconduct)
without revealing their identity. On submission the server issues a unique
`reference_code`; that code is the reporter's only handle on their case. Legal aid
attorneys and NGO advocacy officers triage and update cases in a staff dashboard.

Reporters are **anonymous by construction**. They never create accounts. The
`case_reports` table has **no foreign key to any user record, and none may be added**.
There is no link, anywhere, between a case and a person — storing one would defeat the
purpose of the product, so the data model makes it impossible. Only staff (attorneys,
NGO officers, admins) authenticate. Every rule below exists to protect that property.

## Hard rules — never violate

- **Never add reporter identity to a case.** No `user_id`, `email`, `phone`, `name`,
  IP address or session id on `case_reports`. If a feature seems to need it, STOP and
  say so instead of implementing it.
- **Never add authentication to any reporter-facing page or flow.** Reporters do not
  log in, ever.
- **Never return internal case notes to an unauthenticated caller.** Filter on the
  server, never in the client.
- **Never write case data to `localStorage` or `sessionStorage`.** The only permitted
  device storage is a single boolean flag for "onboarding seen".
- **Never serve evidence files through public URLs.** Short-lived signed URLs only.
- **Never log case narratives, evidence paths or reference codes.**
- **Never commit `.env` or any real credential.** Only `.env.example` belongs in the repo.
- **Never merge your own pull request.**

## Architecture

- **Server:** routes define paths only. Controllers handle request/response. Business
  logic lives in services. No SQL or Supabase calls inside route files.
- **Client:** pages compose, components stay presentational, all API calls go through
  `src/api/`. No `fetch` or `axios` inside a component.
- **Shared constants** (case types, statuses, districts) live in ONE module, imported
  everywhere. Never redeclare a list.

## Naming

- `camelCase` for JS variables and functions; `PascalCase` for React components;
  `snake_case` for database columns and API payload fields (match the schema exactly).
- Booleans read as assertions: `isActive`, `hasEvidence`, `canTransition`.
- Functions are verbs: `generateReferenceCode`, `validateReport`, `listCases`.

## Validation

Three layers, deliberately:

1. **Client-side** for fast feedback — UX only, never trusted.
2. **Server-side** as the authority on every endpoint.
3. **Database CHECK constraints** as the final backstop.

Client and server read the same shared constants so the lists cannot drift apart.

## Case status state machine

```
received → under_review → referred → closed
```

| From         | May move to            | Guard                                  |
|--------------|------------------------|----------------------------------------|
| received     | under_review, closed   | authenticated staff                    |
| under_review | referred, closed       | authenticated staff                    |
| referred     | under_review, closed   | staff; backward move requires a reason |
| closed       | under_review           | admin only (reopen)                    |

Implement this as a single `canTransition(from, to, role)` guard on the server (see
`server/services/statusTransition.js`). Do not scatter status logic across controllers.
Every transition writes an audit entry.

## Authorization matrix

| Action                           | Anonymous | Officer/Attorney | Admin |
|----------------------------------|-----------|------------------|-------|
| Create a report                  | yes       | yes              | yes   |
| Read ONE case by reference code  | yes       | no               | no    |
| List cases                       | NEVER     | yes              | yes   |
| Read narrative and evidence      | no        | yes              | yes   |
| Read reporter-visible notes      | own case  | yes              | yes   |
| Read internal notes              | no        | yes              | yes   |
| Change status, refer a case      | no        | yes              | yes   |
| Manage organisations and staff   | no        | no               | yes   |
| Analytics and audit trail        | no        | dashboard only   | yes   |

Two rules that are easy to get wrong:

1. Anonymous status lookup returns exactly **ONE** case, selected by reference code,
   with internal notes stripped **server-side**.
2. That endpoint **must be rate limited** — without it the reference code is a guessable
   password. Cap attempts per IP, and return an **identical generic response** for
   "not found" and "rate limited" so it cannot be used as an oracle.

## Errors and messages

- Validation failures: HTTP `400` with `{ errors: { field: message } }`.
- Everything else: appropriate `4xx`/`5xx` with `{ message }`.
- Never leak stack traces or database error text to the client.
- Error text says what went wrong and what to do next. No apologies, no vagueness.

## Accessibility and internationalisation

- Every user-facing string goes through `t('key')`. No hardcoded text, ever.
- Add new keys to `en.json`, `ta.json` and `si.json` together, keeping identical
  structure. Mark untranslated strings clearly as placeholders rather than leaving
  English silently in place.
- Every form control has an associated label. Errors are announced to screen readers.
- Keyboard reachable, focus always visible, WCAG AA contrast, works from 320px width.

## Comments

Comment the WHY, not the what. Anything non-obvious about anonymity or safety must carry
a comment explaining the reasoning, so a future contributor does not "simplify" it away.

## Definition of Done

A story is Done only when:

- acceptance criteria are met,
- tests are written and passing,
- the feature has been run and manually verified,
- code is committed under the author's own account,
- a pull request is open with the Jira key, and
- another member has reviewed it.
