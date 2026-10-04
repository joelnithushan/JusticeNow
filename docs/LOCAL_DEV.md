# Local development runbook

How to run JusticeNow on a developer machine. No application code is required
to follow this guide — only tools, env files, and commands.

## What you need

- **Node.js 22** (see `.nvmrc` at the repo root)
- **npm**
- A free [Supabase](https://supabase.com) project (database + private `evidence` bucket)

Optional:

- **Expo Go** on a phone, if you want to run `/mobile`

## One-time setup

```bash
# From the repo root
npm run install:all

# Server secrets — NEVER commit server/.env
cp server/.env.example server/.env
```

Fill `server/.env` from Supabase **Project Settings → API**:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_KEY` | anon / public key |
| `JWT_SECRET` | Long random string — server will not start without it |
| `PORT` | Usually `5000` |
| `CLIENT_URL` | `http://localhost:3000` for the Vite PWA |

Apply the schema: open Supabase **SQL Editor** and run `docs/schema.sql`, then
any numbered files under `docs/migrations/` that your team has not applied yet.
Create a **private** Storage bucket named `evidence`.

The web client defaults to `http://localhost:5000/api`. A `client/.env` is only
needed if you override that, or if you enable staff Google sign-in
(`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

## Run the web stack

```bash
npm run dev
```

| Process | URL |
|---------|-----|
| Express API | http://localhost:5000 |
| React PWA | http://localhost:3000 |
| Health check | http://localhost:5000/api/health |

Separate terminals:

```bash
npm run dev:server
npm run dev:client
```

## Run the mobile app

The API must already be running. A physical phone cannot use `localhost` — use
your computer’s LAN IPv4 address (same Wi‑Fi as the phone).

```bash
cd mobile
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://YOUR-LAN-IP:5000/api
npx expo start
```

See also [MOBILE_TROUBLESHOOTING.md](./MOBILE_TROUBLESHOOTING.md).

## Do not commit

- Any `.env` file with real values
- Real Supabase keys, JWT secrets, or API tokens

Only `*.env.example` files belong in git.
