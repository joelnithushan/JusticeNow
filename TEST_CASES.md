# Test Cases — Community Hazard Alert & Response System

**Group:** SPM_NU_WE_01
**Module scope:** Backend API (Express + Supabase PostgreSQL)
**Test type:** Automated integration tests (Jest + Supertest) hitting the real database
**Last executed:** 2026-08-05 — **25 / 25 passed**

## How to run

```bash
cd server
npm test
```

Test data uses unique per-run emails (`test_<timestamp>@example.lk`) and is cleaned up
automatically after the run (deleting the test user cascades to their reports and SOS rows).

---

## TC-01 — General API

| ID | Test Case | Steps / Input | Expected Result | Status |
|----|-----------|---------------|-----------------|--------|
| TC-01-01 | Root welcome endpoint | `GET /` | 200; welcome message with group ID | ✅ Pass |
| TC-01-02 | Unknown route handling | `GET /api/does-not-exist` | 404; `success: false` | ✅ Pass |
| TC-01-03 | Health check verifies DB connection | `GET /api/health` | 200; `status: ok`, `database: connected`, numeric `userCount` | ✅ Pass |

## TC-02 — User Registration

| ID | Test Case | Steps / Input | Expected Result | Status |
|----|-----------|---------------|-----------------|--------|
| TC-02-01 | Missing required fields | `POST /api/auth/register` with only email + password | 400; `success: false` | ✅ Pass |
| TC-02-02 | Successful registration | Valid name, email, password, district, DS division | 201; user object with generated UUID | ✅ Pass |
| TC-02-03 | Password never exposed | Register a valid user | Response contains no `password` / `password_hash` field | ✅ Pass |
| TC-02-04 | Duplicate email rejected | Register again with an existing email | 409 Conflict | ✅ Pass |

## TC-03 — User Login

| ID | Test Case | Steps / Input | Expected Result | Status |
|----|-----------|---------------|-----------------|--------|
| TC-03-01 | Missing credentials | `POST /api/auth/login` with email only | 400 | ✅ Pass |
| TC-03-02 | Wrong password | Valid email, incorrect password | 401; generic "Invalid email or password" | ✅ Pass |
| TC-03-03 | Unknown email | Non-existent email | 401 (same generic message — no user enumeration) | ✅ Pass |
| TC-03-04 | Successful login | Correct email + password (bcrypt comparison) | 200; token + user profile, no hash in response | ✅ Pass |
| TC-03-05 | Seeded demo account | `joel@example.lk` / `Password123!` | 200; district = Colombo | ✅ Pass |

## TC-04 — Hazard Reports

| ID | Test Case | Steps / Input | Expected Result | Status |
|----|-----------|---------------|-----------------|--------|
| TC-04-01 | List reports | `GET /api/hazards` | 200; array ordered newest-first | ✅ Pass |
| TC-04-02 | Missing required fields | Report without longitude/severity | 400 | ✅ Pass |
| TC-04-03 | Missing reporter | Report without `reporter_id` | 400; message names the missing field | ✅ Pass |
| TC-04-04 | Invalid hazard type | `type: "tsunami"` | 400; lists allowed types (dengue, flood, heat, landslide) | ✅ Pass |
| TC-04-05 | Invalid severity | `severity: "catastrophic"` | 400; lists allowed levels (low, medium, high) | ✅ Pass |
| TC-04-06 | Out-of-range coordinates | `latitude: 99` | 400 | ✅ Pass |
| TC-04-07 | Successful report creation | Valid flood report | 201; `status` defaults to `pending` | ✅ Pass |
| TC-04-08 | Case-insensitive input | `type: "Flood"`, `severity: "HIGH"` | 201; stored lowercase (`flood` / `high`) | ✅ Pass |

## TC-05 — SOS Emergency Signals

| ID | Test Case | Steps / Input | Expected Result | Status |
|----|-----------|---------------|-----------------|--------|
| TC-05-01 | Missing coordinates | `POST /api/sos` without lat/lng | 400 | ✅ Pass |
| TC-05-02 | Missing user | SOS without `user_id` | 400; message names the missing field | ✅ Pass |
| TC-05-03 | Out-of-range coordinates | `longitude: 200` | 400 | ✅ Pass |
| TC-05-04 | Successful SOS | Valid user + GPS coordinates | 201; `status` defaults to `active` | ✅ Pass |
| TC-05-05 | Active SOS listing | `GET /api/sos` | 200; includes new SOS; only `active` rows returned | ✅ Pass |

---

## Not yet covered (future work)

- **Alerts API** — no endpoints exist yet for the `alerts` table; add tests when the
  threshold/weather alert feature is implemented.
- **Frontend (React) tests** — component and end-to-end tests (e.g. Vitest + React
  Testing Library, Playwright).
- **Auth hardening** — once real JWTs are added, test token expiry and protected routes.
- **Report status transitions** — admin confirm/reject endpoints and their tests.
