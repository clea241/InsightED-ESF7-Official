# PROGRESS

## 2026-09-09
- Optimized `/api/dashboard/stats` (Executive Dashboard) load time by reusing a
  singleton `pg.Pool` for the cross-DB `insightEd` fallback queries instead of
  creating/tearing one down per request, and parallelizing the two
  independent fallback queries. See `DEVIATIONS.md` (2026-09-09) for two
  related issues found but left open pending a product decision: an
  unfiltered cross-school query in the qualifications fetch, and whether the
  cross-DB fallback path should still run live on every request.
- Weekly Schedule Editor: grade-band filtering (via `getSubjectsForGrade`
  against `MASTER_SUBJECTS_CATALOG`) now applies to both places a
  subject+section pairing gets picked, closing the gap where the MATATAG
  policy warning was the only thing catching a mismatch, and only after
  save:
  - Block Inspector's "Class Section & Grade Level" dropdown
    (`client/src/pages/Workload.jsx` ~line 4893).
  - Docked sidebar's "Organized Classes at This School" list used by the
    drag-first flow (subject picked from "Subjects Taught" first, section
    dragged after) — was reported by the user as still showing all
    sections after the Block Inspector fix, since it's a separate list
    with its own render path (~line 4666).
  Next: consider applying the same filter to the other section/subject
  pickers in the workload table's inline list/grid row editors (~lines
  9445, 9847) if the user wants consistency there too — out of scope for
  this fix since it wasn't part of either reported flow.

## 2026-10-08 handoff
- Draft save/sync error handling done (see CHANGELOG). TODO: run `node server/migrations/add_personnel_fetch_indexes.js` on staging, then check `EXPLAIN ANALYZE` of GET /api/personnel and the insightEd `esf7_database` lookups (`schoool_id` fallback / dummy-table `OR` cannot use an index) to confirm the 504 cause.
- Health lock: not yet tested in a browser (logic simulated in Node only). Only the draft is queued/replayed; other writes made during lock are paused, not queued. No service worker exists in this project, so the lock works from the static build as-is.
- 504 on /api/personnel for 302261: NOT explained by DB (all queries ~1 ms, indexed; 197 master rows, 6 local rows). Next: after deploy, check server log for `[Personnel Timing]` lines and gateway/Node process health during the incident. Pagination/caching deliberately not added (no evidence they help; all screens need the full roster).
- Startup perf: no browser/Lighthouse timings taken yet (needs a prod build against the real server). Not done: moving draft sync fully to a background step (large refactor of the 600-line init), context splitting, EXPLAIN on node-status/draft/school endpoints, `[DOM] Multiple forms` warning source not identified.
- Draft persistence overhaul done (see CHANGELOG). TODO before deploy: backup, run `add_school_drafts_version.js`, deploy server then client. Not covered: no browser end-to-end test; `deletedPersonnelIds` is not part of the auto-save payload (only the delete handler writes it, and the next auto-save overwrites it) - needs a decision; dashboard/request caches in cacheService still use per-worker memory when Redis is down.
- Redis: fix the actual `REDIS_PORT` value on the server (look for 66379 in the PM2 ecosystem file / system env). Not tested against a live Redis (none available locally): the return-to-Redis drain path is untested. Existing hazard left as is: a job running longer than 1 minute can be reset to pending by the stale-job recovery and picked up again.
- Quality gates in place (README.md). Open items: branch protection must be switched on in GitHub settings; 409 lint warnings remain (ratchet); LEGACY files in eslint.config.mjs still contain undeclared-variable bugs (Overload tardiness/absence forms, Workload unlock-term dialog, personnel POST handler, dashboard esfMatch, ValidationCenter, RoomQR, OrganizedClasses hooks); draft/submission routes do not verify the JWT (test.fails in drafts.integration.test.js); JWT_SECRET missing from server/.env (falls back to a hard-coded default); most api.js methods still call res.json() unchecked (the original 'Unexpected token <' class); Redis stream integration tests and the deploy-script backup/rollback were not run against real services.
- Auth/security pass done (see CHANGELOG 2026-10-08 second entry). BEFORE DEPLOY: set JWT_SECRET (new random value) in the server environment (everyone is logged out once); back up the DB (deploy script does); verify the real roles/division mapping works for division/regional users (their accounts were not available to test); the room-profiling page's fallback fetches of /api/personnel now 401 for anonymous users. Remaining LEGACY lint files listed in README. /api/health in server.js now returns 503 whenever Redis is down (not my change): the client health lock would lock everyone out during a Redis outage even though the queue works in PostgreSQL fallback mode; decide whether that is intended.
- 2026-10-09: health split done (readiness vs /api/health/deep: point monitoring at /deep, never the load balancer), 401 handling, API error audit, flake fixed, incident script added. Still open: LEGACY lint files; real-account test of division/regional roles; running the incident script on the production PM2 logs (`--log`).
