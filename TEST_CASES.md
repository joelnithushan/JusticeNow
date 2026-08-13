# JusticeNow — Test Cases

Automated tests live in `server/tests/` (Jest). Run them with:

```bash
cd server && npm test
```

API cases marked *manual* require a configured `server/.env` and the schema
from `docs/schema.sql` applied in Supabase. They will be automated with
Supertest once the team's shared Supabase project is provisioned.

## Reference code generator (automated — `referenceCode.test.js`)

| ID | Description | Expected result |
|---|---|---|
| TC-RC-01 | Generate a code | Length is exactly 10 characters |
| TC-RC-02 | Column fit | Code length is between 8 and 12 (fits `VARCHAR(12)`) |
| TC-RC-03 | Character set (500 codes) | Only uppercase A–Z / 2–9, never O, 0, I or 1 |
| TC-RC-04 | Uniqueness (1000 codes) | All 1000 codes distinct |

## POST /api/reports (manual until Supabase test project exists)

| ID | Description | Input | Expected result |
|---|---|---|---|
| TC-RP-01 | Valid report | valid case_type, district, description | `201`, body contains `reference_code` |
| TC-RP-02 | Missing case_type | no case_type | `400` with helpful message |
| TC-RP-03 | Invalid case_type | `case_type=theft` | `400` listing valid types |
| TC-RP-04 | Missing district | no district | `400` with helpful message |
| TC-RP-05 | Invalid district | `district=Chennai` | `400` "valid Sri Lankan district" |
| TC-RP-06 | Empty description | `description="   "` | `400` with helpful message |
| TC-RP-07 | Invalid incident_date | `incident_date=not-a-date` | `400` with helpful message |
| TC-RP-08 | With evidence file | multipart upload ≤ 10 MB | `201`; stored filename is random, original discarded |
| TC-RP-09 | No identity stored | valid report | Row in `case_reports` has no name/email/phone/user id |

## GET /api/reports (manual until Supabase test project exists)

| ID | Description | Input | Expected result |
|---|---|---|---|
| TC-RL-01 | List all | no filters | `200`, newest first |
| TC-RL-02 | Filter by type | `?case_type=land_dispute` | `200`, only matching rows |
| TC-RL-03 | Filter by status | `?status=received` | `200`, only matching rows |
| TC-RL-04 | Invalid type filter | `?case_type=bogus` | `400` listing valid types |
| TC-RL-05 | Invalid status filter | `?status=bogus` | `400` listing valid statuses |

## GET /api/health (manual)

| ID | Description | Expected result |
|---|---|---|
| TC-HL-01 | DB reachable | `200` `{ status: 'ok', database: 'connected' }` |
| TC-HL-02 | DB unreachable / bad key | `503` with clear error message |

## Frontend (manual)

| ID | Description | Expected result |
|---|---|---|
| TC-FE-01 | Submit valid report | Redirected to success page showing the reference code |
| TC-FE-02 | Submit empty form | Inline errors for case type, district, description; no request sent |
| TC-FE-03 | Language switching | en/ta/si buttons switch all visible text |
| TC-FE-04 | Quick Exit mid-form | Instantly navigates away; back button does not return to the form; nothing in localStorage/sessionStorage |
| TC-FE-05 | Reload success page | Redirects home (code is never persisted on the device) |
| TC-FE-06 | Staff list filter | Selecting a case type reloads the table filtered |
