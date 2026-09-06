# Architecture

Defines where code lives in this project. This file is **frozen** — do
not edit without explicit user instruction to change this specific
file. If a new kind of file doesn't clearly fit an existing location,
ask the user rather than guessing.

## Folder Layout

- `client/` — React SPA (Vite). `client/src/pages/` holds one file per
  app view (Dashboard, Roster, Workload, Overload, Submission, etc.),
  `client/src/components/` holds shared UI (Sidebar, Topbar, modals,
  chat widget, login), `client/src/context/` holds global React context
  (`AppContext` for app/view state, `AuthContext` for auth), `client/src/services/`
  holds `api.js` (all backend HTTP calls) and `db.js` (browser-side
  IndexedDB draft cache via `idb`), `client/src/utils/` holds one-off
  helpers (e.g. `esf7Harvester.js`). `client/public/` and
  `client/src/assets/` hold static assets/logos. `client/dist/` is the
  Vite build output (generated, not source).
- `server/` — Express + PostgreSQL REST API. `server/server.js` is the
  entry point that wires all routes. `server/controllers/<feature>/index.js`
  is the per-feature route+handler module pattern (e.g. `personnel/`,
  `workload_rows/`, `class_sections/`, `reports/`, `submissions/`,
  `room_profiling/`). `server/db/index.js` is the shared `pg` Pool
  wrapper. `server/db/idGenerator.js` generates IDs. `server/utils/`
  holds shared server logic (`auth.js`, `scheduleValidator.js`).
  `server/schema.sql` is the full DB schema, run on every server start.
  `server/queue_worker.js` + `server/controllers/reports/esf7_worker_thread.js`
  implement a background job worker for report generation/submission.
  `server/tests/` holds Jest/Node test files. The many root-level
  `server/check_*.js`, `create_*.js`, `test_*.js`, `seed_*.js`,
  `migrate_*.js`, `scratch_*.js` files are ad-hoc one-off scripts used
  during development (DB inspection, table creation, manual seeding,
  manual test runs) — not part of the served application; treat new
  ones the same way (throwaway, gitignored ideally, never run against
  prod without review per the database-protection rules in `CLAUDE.md`).
- `esf7_agents/` — Claude Code skills (`SKILL.md` + `references/` +
  `scripts/` per folder) used to assist building specific features
  (dashboard, personnel profiling, roster, room-QR submission,
  submission queue, workload). These are agent tooling, not app runtime
  code.
- `shared/` — does not exist yet. There is currently no shared
  types/constants/validation layer between `client/` and `server/`;
  duplication between the two (e.g. school-year defaults, section-type
  logic) is currently tolerated. [fill in: confirm with user whether a
  `shared/` folder should be introduced, or whether duplication is an
  accepted tradeoff for this project]

## Tech Stack

- **Frontend**: React 19 + React Router 7, built with Vite 8. No CSS
  framework — plain CSS files (`App.css`, `index.css`,
  `premium-dashboard.css`) plus inline styles. `react-icons` for icons,
  `xlsx` for spreadsheet import/export, `idb` for IndexedDB draft
  persistence.
- **Backend**: Node.js + Express 4, `pg` (node-postgres) driver against
  PostgreSQL, `bcryptjs` + `jsonwebtoken` for auth, `pdf-lib` for PDF
  report generation, `xlsx` for spreadsheet report generation
  (`esf7_xlsb.js`), `dotenv` for config, `nodemon` for dev reload.
- **Database**: PostgreSQL (connection via `DATABASE_URL` or discrete
  `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_SSL` env
  vars — see `.env` / `server/.env`). Schema lives in `server/schema.sql`
  and is (re)applied on every server boot.
- **External services**: `GEMINI_API_KEY` env var present — a Gemini
  API integration exists somewhere in the codebase. [fill in: locate
  and document what it's used for — not yet traced during this pass].
- **Process management**: PM2, via `ecosystem.config.js` (production,
  cluster mode, max instances) and `ecosystem.esf7-staging.config.cjs`
  (staging, port 5035, 2 instances, memory/log settings pointing at
  `/mnt/insighted-esf7-staging/logs/`).

## Data Flow (High Level)

- The client's `services/api.js` is the single point of contact with
  the backend: every call goes through `fetchWithAuth`, which attaches
  a JWT (`Authorization: Bearer <token>` from `localStorage.token`) and
  an active-school header (`x-school-id`, resolved from localStorage or
  decoded from the JWT payload) to every request.
  - Exceptions: the public Room QR profiling endpoints
    (`submitRoomProfiling`, `getPendingRoomSubmissions`,
    `ackRoomSubmissions`) call `fetch` directly without auth — this is
    the intentional no-login public entry point (`RoomProfiling.jsx`,
    matching the `?view=room-profiling` bypass in `App.jsx`).
- In dev, Vite proxies `/api` to `http://localhost:5000` (see
  `client/vite.config.js`); in production the client calls
  `VITE_API_URL` (or defaults to `http://localhost:5000/api`).
- Server routes are mounted in `server/server.js` as
  `/api/<feature>` → `server/controllers/<feature>/index.js`, each of
  which talks directly to PostgreSQL via `server/db/index.js` (no ORM).
- Long-running report/submission work goes through
  `server/queue_worker.js`, a background worker started in-process on
  server boot (unless `START_LOCAL_WORKER=false`, used for a
  separate-daemon deployment mode) that processes jobs off a DB-backed
  submission queue; the client polls `getSubmissionStatus(jobId)` for
  progress.
- Client-side drafts (in-progress, unsaved form state) are cached
  locally in IndexedDB (`services/db.js`) before being pushed to the
  server, so work survives a refresh before submission.

## Deployment Setup

- Root `npm run dev` runs client (Vite) and server (nodemon)
  concurrently for local development.
- Root `npm run build` builds the client only (`vite build` →
  `client/dist/`); the server is deployed as plain Node.
- **Production** (`ecosystem.config.js`): PM2 app `insighted-backend`,
  cluster mode, `instances: max` (one worker per CPU core).
- **Staging** (`ecosystem.esf7-staging.config.cjs`): PM2 app
  `insighted-esf7-staging-backend`, cluster mode, 2 instances, fixed
  port 5035, 2GB memory restart threshold, 4GB old-space heap, logs to
  `/mnt/insighted-esf7-staging/logs/{error,out}.log`.
- `deploy_esf7_staging.py` exists at the repo root as a staging deploy
  script. [fill in: document its exact steps/target if it's the
  authoritative deploy path]
- Both PM2 configs run the Express server directly — the built client
  (`client/dist/`) is presumably served separately (static hosting or a
  reverse proxy). [fill in: confirm how/where `client/dist/` is served
  in staging/production]

## Conventions

- One backend feature = one folder under `server/controllers/`, always
  exporting an Express router from `index.js`. Some features are
  intentionally mounted at multiple URL prefixes for naming
  convenience/back-compat (e.g. `personnel_learning_areas` is mounted
  at both `/api/learning-areas` and `/api/personnel-learning-areas`;
  `absences` is required and mounted twice under different paths).
  Follow this pattern for new features rather than inventing a
  different module shape.
- One frontend view = one file under `client/src/pages/`, wired into
  `App.jsx`'s manual `activeView === '...'` conditional render list (no
  nested router — `react-router-dom` is a dependency but `App.jsx`
  currently does its own view switching via `AppContext`'s
  `activeView` state). [fill in: confirm whether `react-router-dom` is
  used elsewhere, e.g. for the public Room QR route, or is unused
  currently]
- All client → server calls go through `services/api.js` — do not call
  `fetch` directly from a page/component except for the documented
  public (unauthenticated) room-profiling endpoints.
- No shared types/validation layer currently exists between client and
  server (see `shared/` note above) — until one is introduced, keep
  request/response shapes consistent by hand between `api.js` and the
  corresponding controller.
