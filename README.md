# ShiftCast

**Customer volume forecasting and shift-level staffing optimization for independent restaurants.**

ShiftCast turns a restaurant's historical POS data, the local events calendar, and the
weather outlook into a concrete weekly plan: how many covers to expect each shift, how
many people to put on each station, and what that labor will cost as a percentage of
sales. A rule-based forecasting engine produces the plan deterministically; an optional
Google Gemini pass refines it and writes the manager briefings.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [npm scripts](#npm-scripts)
- [API reference](#api-reference)
- [Forecasting methodology](#forecasting-methodology)
- [Data & persistence](#data--persistence)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Features

| Module | What it does |
| --- | --- |
| **Weekly Shift Forecast** | 7-day covers forecast with per-shift recommended headcount by station (FOH/BOH), optimized labor cost vs. a "gut-feel" baseline, manual headcount overrides, and CSV export for Toast / 7shifts. |
| **Hourly Rush Radar** | 15-minute demand curves per shift, peak-window detection, and floor/kitchen deployment for each hour so shift start times can be staggered. |
| **Local Events Radar** | Tracks nearby sports games, concerts, festivals and conventions with per-event volume multipliers. Supports manual entry, `.ics` import, and AI event discovery by neighborhood. |
| **Historical POS Data** | Sales & labor audit table with day-of-week baseline averages. Paste raw Toast / Square / Clover exports and have them parsed into training records. |
| **Team Schedule Builder** | Maps a staff roster to the recommended shift requirements, 1-click auto-assign with overtime and availability checks, wage-type-aware costing, and printable kitchen pinboard text. |
| **Forecast Accuracy (MAPE)** | Logs actual shift covers against predictions, computes MAPE / accuracy % and forecast bias, and charts multi-week accuracy trends and daypart performance. |

Every modal form validates input inline (required fields, non-negative numbers, sane
ranges) before it will submit. The UI is responsive down to ~360px.

---

## Tech stack

**Client**

- React 19 + TypeScript
- Vite 6 (build) with `@vitejs/plugin-react`
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Recharts (charts), lucide-react (icons)

**Server**

- Express 4 (single process; serves the API and the client)
- `tsx` for the dev runner, `esbuild` to bundle the server for production
- `@google/genai` — Google Gemini, used only when `GEMINI_API_KEY` is set
- `bcryptjs` + `jsonwebtoken` for auth
- A file-backed JSON store (`data/shiftcast_db.json`) — no external database

---

## Architecture

One Express server hosts everything on port `3000`.

- **Development** (`npm run dev`) — Express runs Vite in middleware mode, so the same
  origin serves the API and the hot-reloading client. No separate dev server, no CORS.
- **Production** (`npm run build && npm start`) — Vite builds the static client into
  `dist/`, esbuild bundles the server into `dist/server.cjs`, and Express serves the
  static assets plus the API.

```
Browser
  │
  ▼
Express (server/index.ts)
  ├─ /api/auth/*          → server/routes/auth.routes.ts
  ├─ /api/restaurant/*    → server/routes/restaurant.routes.ts
  ├─ /api/forecast|calendar|briefing|pos  → server/routes/ai.routes.ts
  ├─ dev:  Vite middleware (HMR)
  └─ prod: static dist/
        │
        ▼
   server/db.ts  ←→  data/shiftcast_db.json
```

The client's forecasting logic lives in `src/lib/` and is pure and framework-free — it is
exercised directly by the test suite without a running server.

---

## Project structure

```
.
├── index.html                  # Vite entry
├── server/
│   ├── index.ts                # app bootstrap: middleware, routers, dev/prod switch
│   ├── db.ts                   # file-backed JSON store, auth, JWT, demo seeding
│   ├── middleware/
│   │   └── auth.ts             # authMiddleware (soft) + strictAuthMiddleware (hard)
│   ├── lib/
│   │   └── gemini.ts           # Gemini client factory + model id
│   └── routes/
│       ├── auth.routes.ts      # register / login / demo / me
│       ├── restaurant.routes.ts# profile, POS, events, roster, assignments, accuracy…
│       └── ai.routes.ts        # forecast refine, event discovery, briefing, POS parse
├── src/
│   ├── main.tsx                # React root + AuthProvider
│   ├── App.tsx                 # top-level state, tab routing, persistence handlers
│   ├── index.css               # Tailwind entry + custom utilities
│   ├── types.ts                # shared domain types (client + server)
│   ├── components/
│   │   ├── layout/             # Header
│   │   ├── views/              # the six main tab views
│   │   └── modals/             # Auth, Manager Briefing, Restaurant Profile
│   ├── context/
│   │   └── AuthContext.tsx     # session state
│   ├── data/
│   │   └── restaurantPresets.ts# demo restaurants + sample POS / roster / events
│   ├── services/
│   │   └── apiClient.ts        # typed fetch wrapper for every endpoint
│   └── lib/                    # pure logic — no React, no network
│       ├── staffingEngine.ts   # covers forecast + recommended headcount + labor cost
│       ├── accuracyEngine.ts   # MAPE, accuracy %, weekly trend aggregation
│       ├── calendarUtils.ts    # schedule CSV / pinboard text / .ics parsing
│       ├── formValidation.ts   # shared inline form validation
│       └── format.ts           # signed-currency / net-impact display helpers
└── tests/                      # standalone tsx scripts (see Testing)
```

---

## Getting started

### Prerequisites

- Node.js **20 or newer**
- npm (or Bun — a `bun.lock` is also committed)

### Install & run

```bash
npm install
cp .env.example .env      # optional — see below; the app runs without it
npm run dev
```

Open **http://localhost:3000**.

The app is fully usable without signing in (it falls back to a demo manager account).
To exercise auth, use the **"Instant Demo"** button in the sign-in dialog, or:

```
email:    manager@rustictable.com
password: manager123
```

### Production build

```bash
npm run build     # → dist/ (client) + dist/server.cjs (server)
npm start         # serves dist/ on http://localhost:3000
```

---

## Environment variables

All are optional. Copy `.env.example` to `.env` to set them.

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Enables the AI features (forecast refine, event discovery, manager briefings, POS parsing). Without it these endpoints return a graceful fallback and the rule-based engine is used. | _unset_ |
| `APP_URL` | Public URL of the deployment, for self-referential links. | _unset_ |
| `JWT_SECRET` | Signing secret for session tokens. **Set this in production.** | a hard-coded development string |
| `PORT` | Server port. | `3000` |

---

## npm scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Express + Vite dev server with HMR on `:3000`. |
| `npm run build` | Build the client (`dist/`) and bundle the server (`dist/server.cjs`). |
| `npm start` | Run the production server from `dist/`. |
| `npm run lint` | Type-check the whole project (`tsc --noEmit`). |
| `npm test` | Run the business-logic regression suite. |
| `npm run test:scoping` | Run the per-restaurant data-scoping tests. |
| `npm run test:http` | Run the HTTP integration tests (**requires `npm run dev` in another terminal**). |
| `npm run clean` | Remove `dist/`. |

---

## API reference

All responses are JSON. Endpoints under `/api/restaurant` and the AI endpoints accept an
optional `Authorization: Bearer <token>` header; without it they operate on the shared
demo account. `/api/auth/me` requires a valid token.

### Auth — `/api/auth`

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/register` | `email, password, name?, restaurantName?, concept?, location?` | Password ≥ 6 chars. Returns `{ user, token }`. |
| `POST` | `/login` | `email, password` | Returns `{ user, token }`. |
| `POST` | `/demo` | — | Logs in the pre-seeded demo manager. |
| `GET` | `/me` | — | Current user. Requires a valid token. |

### Restaurant data — `/api/restaurant`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/data` | Load all saved data for the current user (`?restaurantId=` to scope). |
| `POST` | `/profile` | Save the restaurant profile / wage settings. |
| `POST` | `/switch-preset` | Switch concept preset (reloads scoped POS, roster, events, logs). |
| `POST` / `DELETE` | `/pos/records` · `/pos/records/:id` | Append/replace or delete POS records. |
| `POST` | `/events` | Save the Local Events Radar list. |
| `POST` | `/roster` | Save the staff roster. |
| `POST` | `/assignments` | Save shift schedule assignments. |
| `POST` | `/overrides` | Save manual shift headcount overrides. |
| `POST` | `/scenario` | Save the what-if scenario state. |
| `GET` / `POST` / `DELETE` | `/accuracy/logs` · `/accuracy/logs/:id` | Read, append/replace, or delete shift accuracy logs. |
| `POST` | `/reset-defaults` | Restore the account to demo data. |

### AI (Gemini) — graceful fallback when no key is set

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/forecast/ai-analyze` | Refine the weekly forecast and executive insight. |
| `POST` | `/api/calendar/discover-events` | Discover realistic local events for a location. |
| `POST` | `/api/briefing/generate` | Generate a pre-shift manager briefing for a day. |
| `POST` | `/api/pos/parse` | Parse pasted POS / spreadsheet text into records. |

### Misc

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check. |

---

## Forecasting methodology

The rule-based engine (`src/lib/staffingEngine.ts`) produces the plan in layers:

1. **Baseline covers** — a 4-week rolling day-of-week average from the POS history.
2. **Adjustments** — weather multipliers (rain closes the patio, etc.), local-event
   multipliers for the day, and an optional what-if scenario modifier.
3. **Shift split** — day covers are distributed across shifts and then into a
   15-minute rush curve, flagging peak windows.
4. **Recommended headcount** — per-station staffing from productivity standards
   (covers per server / line cook / bartender), plus **fixed blocks**: prep cooks
   arrive hours before service and closing dishwashers stay after, regardless of volume.
5. **Labor cost** — computed with **wage-type awareness**: tipped roles are costed at
   the employer's direct cash wage (not a blended market rate), non-tipped BOH at their
   full flat rate. The result is compared against a naïve "gut-feel" staffing baseline
   to produce the **Net Savings** (or **Net Overage**) figure.

**Accuracy tracking** (`src/lib/accuracyEngine.ts`) uses Mean Absolute Percentage Error
(MAPE) between predicted and actual covers, aggregated into weekly accuracy %, bias
direction (over/under-forecast) and best/worst shift.

When `GEMINI_API_KEY` is present, the AI endpoints layer a model pass on top of this for
narrative insight and briefings — but the deterministic engine is always the source of
truth for the numbers.

---

## Data & persistence

State is stored in a single JSON file, **`data/shiftcast_db.json`**, created
automatically on first run and seeded from `src/data/restaurantPresets.ts`. It is
git-ignored — delete it to reset the entire workspace to demo data. There is no external
database to provision.

---

## Testing

The `tests/` directory holds standalone `tsx` scripts (no test framework):

```bash
npm test              # 91 assertions — pure engine logic (no server needed)
npm run test:scoping  # 18 assertions — per-restaurant data isolation & reset
npm run test:http     # 18 assertions — live API contract  (needs `npm run dev` running)
```

`npm run lint` type-checks the entire codebase, including the server and tests.

---

## Deployment

`npm run build` emits a self-contained `dist/` (static client + `server.cjs`). Any Node
20+ host works:

```bash
npm ci
npm run build
NODE_ENV=production PORT=8080 JWT_SECRET=… GEMINI_API_KEY=… npm start
```

Mount a writable volume at `data/` to persist the store across restarts.
