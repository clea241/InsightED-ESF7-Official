# InsightED eSF7

React client (`client/`) and Node/Express server (`server/`). This file documents the automated quality gates.

## Quality gates

Everything runs from the repository root. One command runs them all, in order:

```bash
npm install && npm install --prefix client && npm install --prefix server   # first time only
npm run verify
```

| Command | What it protects against | Notes |
|---|---|---|
| `npm run lint` | Undeclared variables (`ReferenceError: activeDraftAbortController is not defined` fails here), hooks called conditionally, use-before-define, dead branches, unawaited promises, `async` without `await` | ESLint (`eslint.config.mjs`). Strict tier = draft/save/sync/API client and queue/Redis modules (every rule is an error, including `no-floating-promises`). Everything else: bug-class rules are errors; legacy style rules are warnings counted by a ratchet (`--max-warnings 343`): the number may only go down. |
| `npm run typecheck` | Wrong shapes passed between the draft, sync, error-reporting and API client modules | `tsc --noEmit` with `allowJs`/`checkJs` over the files in `tsconfig.typecheck.json`. Add files there to widen coverage. |
| `npm run test:unit` | Regressions in save queue (superseded saves, newest always committed), API client (non-OK, HTML 502/503/504, bad JSON, timeout, retry/backoff), draft version comparison, server-error lock logic, "Copy error details" report (secrets excluded), Redis config validation | Vitest, no database or browser. `npm run test:coverage` adds per-module coverage thresholds (`vitest.config.mjs`). |
| `npm run test:integration` | "Saved" before the row is committed, lost updates, duplicate job processing, stranded jobs, a worker killed mid-job, missing indexes on large tables, non-additive migrations, bad startup config | Real PostgreSQL. Locally it starts a throw-away embedded PostgreSQL automatically (no Docker). Refuses to run unless the database name contains `test`. In CI it uses the workflow's PostgreSQL and Redis services (`npm run test:integration:ci`). Redis stream tests run only when `TEST_REDIS_URL` is set. |
| `npm run test:e2e` | The real user flows in a browser: edit, log out, log in; slow/failing network; 503/504 outage modal and replay; two tabs | Playwright against the built client with an in-memory fake API (`e2e/fakeApi.mjs`), so no backend or database is needed. First time: `npx playwright install chromium`. |
| `npm run check:env` | Malformed environment values (for example a Redis port above 65535) | Reads `server/.env` and the process environment; never prints values. Add `-- --strict` to also require database settings and `JWT_SECRET`. |
| `npm run build` | Build warnings, bundle growth | Fails on any Vite warning and on bundle budgets (entry chunk, any chunk, total gzip) in `scripts/build-check.mjs`. |
| `npm run smoke` | A build that compiles but does not run | Starts the real server against a throw-away database, checks `/api/health` (runs a real query), does a real draft save and read, and loads the built client and its assets. |
| `npm run verify` | All of the above | Writes `.verify-passed` for the current commit, which `deploy_esf7_prod.py` requires. |

### Run the integration and end-to-end suites locally

```bash
npm run test:integration          # embedded PostgreSQL, nothing to install
npm run test:e2e                  # builds the client, serves it, drives Chromium
# against your own disposable database instead:
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/esf7_test npm run test:integration:ci
# include the Redis stream tests:
TEST_REDIS_URL=redis://127.0.0.1:6379/15 TEST_DATABASE_URL=... npm run test:integration:ci
```

### Hooks and CI

- **Pre-commit** (husky + lint-staged): ESLint errors on the staged files.
- **Pre-push**: lint, type check and unit tests.
- **GitHub Actions** (`.github/workflows/ci.yml`): `verify` (lint, typecheck, unit + coverage, integration with PostgreSQL and Redis services, env check, build, smoke) and `e2e` run on every pull request and on pushes to `main`. To make them mandatory: GitHub > Settings > Branches > branch protection rule for `main` > "Require status checks to pass before merging" > select `verify` and `e2e`.

### Deploying

`python deploy_esf7_prod.py` now refuses to run unless `npm run verify` passed for the exact commit being deployed (clean working tree, stamp younger than 24 h). Then it: takes and verifies a `pg_dump` on the server before running the migrations listed in `MIGRATIONS`; reloads PM2; runs a post-deploy smoke test (health with a database query, a real draft save, read and cleanup on the reserved record school `000000` / year `SMOKE`); and rolls back to the previous build automatically if any of it fails.

### Health endpoints and session expiry

- `GET /api/health` (also `/health`) is the **readiness** check: 200 when the app and PostgreSQL answer, with `"redis": "up" | "degraded"` in the body. A Redis outage never fails it (the queue runs in PostgreSQL fallback mode). The frontend server-health lock, the deploy script and the smoke test use only this one.
- `GET /api/health/deep` (also `/health/deep`) additionally pings Redis and answers 503 when it is down. For monitoring and alerts only.
- A 401 on an authenticated call (expired token, rotated `JWT_SECRET`) is not a server failure: no modal. The app keeps the newest state on the device (IndexedDB), queues the unsent save, goes to the login screen without deleting any draft, localStorage or IndexedDB data, and replays the save after the next login (the version check still applies; a newer server copy raises the usual conflict prompt). See `client/src/services/session.js`.
- Read-only incident report: `node server/scripts/find_personnel_500_and_cross_school.js --log <pm2 log> [--log ...] [--days 30]` lists personnel creates that returned 500, drafts that look cross-school, and (from logs written after the auth gate) refused requests. It changes nothing.

### Authentication and school access (server)

- Every `/api` route needs a valid JWT (`Authorization: Bearer ...`) except `/api/health`, `/api/auth/*`, `/api/room-profiling/*` (the public QR / passcode flow) and `/api/salary-matrix`. Implementation: `server/middleware/auth.js`, mounted once in `server/server.js`.
- **401** = no token, malformed, forged (wrong signature, `alg: none`) or expired. **403** = valid token, but the request names a school the user may not access (header, query, body or a school id in the URL path).
- The school a request acts on comes from the verified token, never from the `x-school-id` header. Role rules: `Admin` / `Super Admin` any school; `School Division Office` / `Regional Division Office` schools in their own division / region (looked up server-side, denied when the lookup fails); everyone else only their own school.
- `JWT_SECRET` is required. There is no built-in default: with `NODE_ENV=production` the server refuses to start when it is missing or shorter than 16 characters (`server/utils/jwtSecret.js`). In development a random per-process secret is used (logins do not survive a restart). See `server/.env.example`. `node scripts/check-env.mjs --strict --ecosystem ecosystem.esf7-prod.config.cjs` (run by the deploy gate) fails when it is missing.
- Changing `JWT_SECRET` logs every user out (old tokens stop verifying).

### Known latent bugs (found by the first lint run, not yet fixed)

Fixed so far: personnel create/update, Workload unlock-term dialog, Overload absence and tardiness forms (each has a regression test and was moved out of the LEGACY list). The files still listed under "LEGACY" in `eslint.config.mjs` reference variables that are never declared or call hooks conditionally: `OrganizedClasses.jsx` (`DEFAULT_SUBJECTS`, `toolKey`, `levelToSave`, a hook called inside a callback), `ValidationCenter.jsx` (`workloadTransfers`, `absences`), `PersonnelProfile.jsx` (`setPersonnel`), `RoomQR.jsx` (`personnel`) and `server/controllers/dashboard/index.js` (`esfMatch`). They only fail when that code path runs. They are reported as warnings so CI stays green; remove a file from the LEGACY list as soon as its errors are fixed.
