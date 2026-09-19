# Env hygiene audit (JNOW-64)
#
# Hard rule (CLAUDE.md): never commit `.env` or any real credential.
# Only `*.env.example` files belong in the repository, and those must
# contain placeholders — never live keys, tokens, or passwords.
#
# Audited: 2026-09-19 (chore/JNOW-64-repo-governance)

## Summary

| File | Result | Notes |
|------|--------|-------|
| `client/.env.example` | PASS — placeholders only | No real secrets found |
| `mobile/.env.example` | PASS — placeholders only | No real secrets found |
| `server/.env.example` | PASS — placeholders only | No real secrets found |

**Verdict:** all three committed env examples use obviously fake / instructional
values. No real-looking secret was found. No history rewrite required.

## Per-file findings

### `client/.env.example`

| Variable | Value observed | Assessment |
|----------|----------------|------------|
| `VITE_API_BASE_URL` | `http://localhost:5000/api` | Local default — not a secret |
| `VITE_SUPABASE_URL` | `your-supabase-url` | Explicit placeholder |
| `VITE_SUPABASE_ANON_KEY` | `your-supabase-anon-key` | Explicit placeholder |

### `mobile/.env.example`

| Variable | Value observed | Assessment |
|----------|----------------|------------|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.X:5000/api` | Instructional LAN template (`X` is not a host) — not a secret |

Comments in the file tell developers how to substitute their own LAN IP. No
API keys, tokens, or passwords are present.

### `server/.env.example`

| Variable | Value observed | Assessment |
|----------|----------------|------------|
| `SUPABASE_URL` | `your-project-url` | Explicit placeholder |
| `SUPABASE_KEY` | `your-anon-key` | Explicit placeholder |
| `PORT` | `5000` | Non-secret default |
| `CLIENT_URL` | `http://localhost:3000` | Local default — not a secret |
| `JWT_SECRET` | `change-me-in-production` | Explicit placeholder (not a production secret) |

## What to do if a real secret appears later

1. **Do not** amend or force-push history to scrub it from a shared branch.
2. Stop, rotate the credential with the provider (Supabase / JWT issuer / etc.).
3. Report it to the maintainer (`@joelnithushan`) and the team before merging.
4. Replace the committed value with a clear placeholder in a normal follow-up commit.
