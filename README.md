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
  - **Schema Tables:** `users`, `hazard_reports`, `sos`

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
│   ├── schema.sql              # Supabase PostgreSQL DDL migration script
│   ├── index.js                # Main Express server entry point
│   ├── .env.example            # Server env template
│   └── package.json
├── .gitignore                  # Git exclusions (node_modules, .env, build output)
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
3. Open `.env` and fill in your Supabase credentials:
   ```env
   PORT=5000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-supabase-anon-key
   CLIENT_URL=http://localhost:3000
   ```

#### B. Database Initialization (Supabase SQL Editor)
1. Log in to your [Supabase Dashboard](https://app.supabase.com).
2. Go to your project's **SQL Editor**.
3. Open the file `server/schema.sql` from this codebase.
4. Copy and paste all the contents into the Supabase SQL Editor and click **Run**.
   *This creates the `users`, `hazard_reports`, and `sos` tables along with sample data.*

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

## 🤝 Code Guidelines for Team Members

1. **Comments & Readability:** All controllers and components contain explanatory comments to help team members get up to speed quickly.
2. **Never commit `.env` files:** Always add private keys to `.env` locally. `.env` is ignored by `.gitignore`.
3. **Map Coordinates:** Sri Lanka map center is set to `[7.8731, 80.7718]` (lat/lng) with zoom level `8`.
