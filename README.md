# Community Hazard Alert & Response System

> **Sri Lanka Community Hazard Alert & Response Platform**  
> A full-stack web application for Sri Lankan citizens to report localized hazards (floods, dengue outbreaks, landslides, heavy storms) and issue real-time location-enabled emergency SOS alerts.

---

## 👥 Group Information

- **Group ID:** `SPM_NU_WE_01`
- **Team Members:**
  1. **Joel Nithushan A.T** – IT23556652
  2. **Vaishnavi L** – IT23717336
  3. **Thushalini U** – IT23794870
  4. **Kanistan T** – IT23748644

---

## 🛠️ Tech Stack

- **Frontend (`/client`):**
  - **Framework:** React 18 + Vite (Fast HMR)
  - **Routing:** React Router v6
  - **Mapping & Geolocation:** Leaflet + React-Leaflet (OpenStreetMap tiles - 100% free, no API key required)
  - **HTTP Client:** Axios
  - **Icons:** Lucide React
  - **Styling:** Modern Vanilla CSS Design System (Glassmorphism, Sri Lanka hazard color palettes, dark/light accents)

- **Backend (`/server`):**
  - **Runtime:** Node.js
  - **Framework:** Express.js (REST API)
  - **Database Client:** `@supabase/supabase-js` (PostgreSQL via Supabase Cloud)
  - **Middleware:** CORS, `dotenv`, `express.json()`

- **Database:**
  - **Provider:** PostgreSQL (Supabase)
  - **Schema Tables:** `users`, `hazard_reports`, `alerts`, `sos`

- **Testing:**
  - **Framework:** Jest + Supertest (API integration tests against the real database)
  - **Docs:** See [`TEST_CASES.md`](TEST_CASES.md) for the full test case tables

---

## 📁 Repository Structure

```text
Community-Hazard-Alert-Response-System/
├── client/                     # Frontend React + Vite app
│   ├── src/
│   │   ├── components/         # Reusable UI components (Navbar, MapComponent)
│   │   ├── pages/              # App views (Home, Login, Register, ReportHazard, ReportsFeed)
│   │   ├── services/           # Axios API configuration (api.js)
│   │   ├── App.jsx             # React Router route definitions
│   │   ├── index.css           # Design tokens & styling
│   │   └── main.jsx            # Vite React entry point
│   ├── index.html              # HTML shell & Leaflet CSS CDN link
│   ├── vite.config.js          # Vite config (dev server port 3000)
│   ├── .env.example            # Client env template
│   └── package.json
├── server/                     # Backend Node + Express REST API
│   ├── config/                 # Config files (supabase.js client)
│   ├── controllers/            # Request handlers (health, auth, hazard, sos)
│   ├── routes/                 # API Express routers (health, auth, hazard, sos)
│   ├── tests/                  # Jest + Supertest API integration tests
│   ├── schema.sql              # Supabase PostgreSQL DDL migration script
│   ├── app.js                  # Express app definition (used by server & tests)
│   ├── index.js                # Server entry point (starts the listener)
│   ├── .env.example            # Server env template
│   └── package.json
├── .gitignore                  # Git exclusions (node_modules, .env, build output)
├── CLAUDE.md                   # Standing rules for AI coding agents
├── TEST_CASES.md               # Test case documentation (kept in sync with tests)
├── package.json                # Root monorepo workspace scripts
└── README.md                   # Project documentation
```

---

## 🚀 Quick Start & Setup Guide

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher) installed on your system
- **npm** (v9.0.0 or higher)
- **Supabase Account** (Free tier at [supabase.com](https://supabase.com))

---

### 2. Environment Setup

#### A. Backend Environment Setup (`/server`)
1. Navigate to the `/server` directory:
   ```bash
   cd server
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in your Supabase credentials
   (Supabase Dashboard → Project Settings → API):
   ```env
   PORT=5000
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_KEY=sb_secret_...
   CLIENT_URL=http://localhost:3000
   ```
   > ⚠️ `SUPABASE_URL` is the **Project URL** (not an API key), and `SUPABASE_KEY`
   > is the **Secret key** (`sb_secret_...`) — the backend is the only thing that
   > talks to the database. Ask Joel for the team's shared credentials privately;
   > never commit them.

#### B. Database Initialization (Supabase SQL Editor)
1. Log in to your [Supabase Dashboard](https://app.supabase.com).
2. Go to your project's **SQL Editor**.
3. Open the file `server/schema.sql` from this codebase.
4. Copy and paste all the contents into the Supabase SQL Editor and click **Run**.
   *This creates the `users`, `hazard_reports`, `alerts`, and `sos` tables along with
   sample data. All seeded demo accounts use the password `Password123!`.*

#### C. Frontend Environment Setup (`/client`)
1. Navigate to the `/client` directory:
   ```bash
   cd client
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Ensure `.env` points to the backend API:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```

---

### 3. Installation & Running the Project

You can run the project using **two methods**:

#### Method 1: Concurrent Startup from Root (Recommended)
From the project root directory:
```bash
# 1. Install all dependencies for root, client, and server
npm run install:all

# 2. Run both Client and Server concurrently
npm run dev
```

#### Method 2: Running Client and Server Separately

**Terminal 1 (Backend Server):**
```bash
cd server
npm install
npm run dev
```
*Server will start at: `http://localhost:5000`*  
*Health Check endpoint: `http://localhost:5000/api/health`*

**Terminal 2 (Frontend Client):**
```bash
cd client
npm install
npm run dev
```
*Client will open at: `http://localhost:3000`*

---

## 📡 API Endpoints Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Health check endpoint & Supabase connection test |
| `/api/auth/register` | `POST` | Register a new citizen account |
| `/api/auth/login` | `POST` | Authenticate user credentials |
| `/api/hazards` | `GET` | Retrieve all community hazard reports |
| `/api/hazards` | `POST` | Create a new hazard report (flood, dengue, landslide, storm) |
| `/api/sos` | `GET` | List active emergency SOS requests |
| `/api/sos` | `POST` | Trigger an urgent SOS distress signal with lat/lng |

---

## 🧪 Running the Tests

The backend has a full API integration test suite (25 tests) that runs against the
real Supabase database. It requires a valid `server/.env`.

```bash
cd server
npm test
```

Test data uses unique per-run emails and cleans itself up automatically. The full
test case tables (IDs, steps, expected results) are documented in
[`TEST_CASES.md`](TEST_CASES.md).

---

## 🤝 Contribution Workflow (Required)

The `main` branch is protected — direct pushes are blocked by GitHub. All changes
go through Pull Requests:

1. **Branch from the latest `main`:**
   ```bash
   git checkout main && git pull origin main
   git checkout -b feat/your-feature-name
   ```
2. **Branch naming:** use a type prefix — `feat/`, `fix/`, `refactor/`, `test/`,
   `docs/`, or `chore/` — followed by a short hyphenated description.
3. **Before pushing:** refactor your code (no dead code / stray `console.log`s) and
   run `npm test` in `/server` — all tests must pass. New features and bug fixes
   must include their own test cases (see `CLAUDE.md` for the full rules).
4. **Open a Pull Request to `main`** with a clear description of what changed and
   how it was tested.
5. **Review & merge:** Joel (repo owner) reviews and merges all PRs. PRs require
   1 approval; self-merging is disabled.

> 🤖 Using an AI coding agent (Claude Code, Cursor, Copilot)? It will pick up these
> rules automatically from [`CLAUDE.md`](CLAUDE.md).

### Other Guidelines

1. **Never commit `.env` files:** keep credentials local; `.env` is gitignored.
2. **Comments & readability:** controllers and components contain explanatory comments — keep them up to date when you change behavior.
3. **Map coordinates:** Sri Lanka map center is `[7.8731, 80.7718]` (lat/lng), zoom level `8`.
