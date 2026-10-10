# PROGRESS

## 2026-10-10 (payload change finished for all seven tables on esf7_local)
- Done on `esf7_local`: backup of the six tables (restore-tested), expand, backfill, per-table verification PASS (2.5M keys, 0 unaccounted), old-vs-new response comparison (0 differences), write-route functional test before and after the drop (22 checks), drop + rewrite, post-drop proof against the backup PASS, unit tests 236 pass.
- Not done: nothing has run on staging/production; follow the runbook in `docs/orm-optimizer/payload-six-tables.md` per table. Integration: 8 draft/startup tests fail with missing tables (`esf7_school_profile`, `esf7_deleted_personnel`) in their test fixture; they failed the same way before this change and relate to the uncommitted draft-persistence work in `schools/index.js`.
- Untouched on purpose: personnel employment/profile/education, `esf7_personnel_submission.payload_json`, `school_drafts.payload` (size is a `pg-health-assessment` question).

## 2026-10-10 (payload pilot: esf7_workload_rows)
- Done on `esf7_local`: backup (restore-tested), expand, backfill (idempotent), verification PASS (8.66M keys, 0 unaccounted), drop, table rewrite, post-drop proof against the backup PASS, unit (230) + integration (19) tests pass.
- Not done: nothing has run on staging/production. Follow the runbook in `docs/orm-optimizer/workload-rows-payload-pilot.md` (backup, expand, backfill, deploy, backfill again, verify, then the drop).
- Next, one table at a time and only after review of the pilot: `esf7_personnel_allowances`, `esf7_school_profile`, `esf7_requests`, `esf7_related_task`, `esf7_admin_task`, `esf7_regular_sections` (needs its own key analysis; it merges the stored payload with the body on update). Open question: promote `task`, `rowType`, `minsPerDay`, `category` (on 190k to 350k rows) to typed columns?

## 2026-10-10 (Global Server-Health Modal & Recovery Sync Complete)
- All 6 requirements for the Server Health Modal, uncommitted form flush, autosave timing, canonical storage keys, PM2 shutdown margins, and recovery sync path completed.
- Unit test suite (225 tests) passes cleanly.
- Client builds in 1.19s with 0 errors.


## 2026-10-10 (workload list pagination, esf7_local only)
- Done on `esf7_local`: paginated `GET /api/workloads`, new index + migration, before/after EXPLAIN saved, equivalence check passed, unit tests (225) pass and lint is clean; the workload integration test was skipped (needs the throwaway test DB via `npm run test:integration`).
- Not done: migration has NOT been run on staging/production. Run `node server/migrations/add_workload_rows_created_at_index.js` there after a backup; it builds the index without blocking writes.
- Open: the route is still not scoped by school (returns every school's rows) and nothing uses it; consider removing it or requiring a school filter (product decision).

## 2026-10-09 (endpoint health check, esf7_local only)
- Ran the endpoint health check against a local server + `esf7_local` (public routes only; 200 protected routes gate-checked, 75 protected GETs not called). CRITICAL 18 -> 0 after the health/error-handler fixes.
- Open, report only: `esf7_class_sections` is read by `workload_rows` (findTimeAllotmentViolations) but does not exist (replaced by the esf7_*_sections tables) - workload saves with changed rows may fail; `DELETE /api/personnel/:id` is not transactional, swallows every cleanup error, and uses wrong names (`esf7_personnel_trainings`, `esf7_overload_late_undertime`, `esf7_overload_no_work`, `esf7_class_sections`); `esf7_validation` / `esf7_clustered_ghost_sync` are created lazily at runtime.
- Next: HC_* test login + HC_SCHOOL_ID for the protected routes; convert the draft routes and personnel delete to normalized transactional writes after the school_drafts migration is verified.

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
- 2026-10-09 (later): lock now readiness-only; single session school id. Open: check logs/DB for writes under a wrong school (see report: payload.schoolInfo.schoolId 100093 before the auth gate could land a draft under another school: run find_personnel_500_and_cross_school.js and compare class sections 44 vs 2).

- 2026-10-09: Plotting lock implemented (client + server). Not yet browser-tested. Note: By Section view has no per-block legacy flag; the flag appears in By Personnel only.
- 2026-10-09: Workload save write-through + failure handling applied (Workload.jsx, AppContext.jsx). Not browser-tested. School 300488 still needs its teachers to re-save from the original browser.
- 2026-10-09: Workload single-source-of-truth load/merge, conflict dialog and DB-backed clears built (client + server). Deploy the server before the client. Not browser-tested; hydration glue in Workload.jsx has no unit test (merge rules in workloadMerge.js do).
- 2026-10-09: Round 2 (block-level merge, robust save) done. Not browser-tested. Open: hydration runs when a teacher/term is opened, not for every teacher at login; server accepts client-sent assignedGradeLevels when the employment table has none (weakens the "no classes assigned" rule for those teachers).
- 2026-10-09: Restore prompt done on top of the other editor's normalizer/snapshot work in Workload.jsx (both edit that file). Not browser-tested.
- 2026-10-09: App-wide unsaved-changes Save wired (6 pages + Workload). Not browser-tested. Roster's Discard is still a no-op (pre-existing). Overload/Room QR unguarded by design (no unsaved state).
- 2026-10-09: School 300488 Node 04 "0 Profiles Configured" and profiling records read/write path resolved. Full database hydration completed from authentic harvested roster in `esf7_room_roster_cache`; backend controller now falls back to room roster cache and preserves educational attainment / degree rows across master/db merging; `NodeMap.jsx` card summary now accounts for multi-degree lists, attainments, and completed flags while displaying loading indicators before initialization; `AppContext` and `PersonnelProfile.jsx` now write through to PostgreSQL via awaited `api.updatePersonnel`.

- 2026-10-09: Duplicate-sections fix + read-only login (server draftDedupe, schools controller, AppContext gating, cleanup script). Not browser-tested. Open: cleanup `--apply` for 300488 awaits user confirmation; draft holds 91 unique personnel vs 14 rows in esf7_personnel_profile (not duplicates - master-roster people; user to decide what "registered" means for the counters); 4 repeating workload-row groups (PER-300488-001, -047) need review; 63 client tests + draft_save_route suite already failed before this change.
- 2026-10-09: Sections load now DB-first with draft overlay (AppContext, sectionMerge.js, class_sections controller, OrganizedClasses). Upsert verified against local DB in a rolled-back transaction; client merge has 9 unit tests; not browser-tested. Open: school 300488's stored draft still lists ~55 old sections vs 4 in the DB, so first login will show the restore prompt; dashboard counters read context state (DB baseline + confirmed overlay), not a separate query; draft's section entry is not cleared after save (autosave rewrites it to match state).
- 2026-10-09: Personnel PUT date fix + non-swallowed savePersonnelChanges + strict dirty guard. Unit tests pass; PUT not exercised live (route writes with no rollback) and not browser-tested. Open: draft personnel still hold "N/A" strings in state (only cleaned when sent); other pages that call savePersonnelChanges (Designations, Deployment, PersonnelProfile) now surface real save errors where they used to report success.
- 2026-10-09: Global error reporter built (errorAlert.js, ApiError details, ErrorBoundary, global handlers). 15 unit tests; not browser-tested. Open: ~300 other catch blocks (mostly localStorage/IndexedDB or UI-only) were not individually rewritten - API failures in them are still reported by the unclaimed-failure rule, non-API errors that are caught and swallowed are not; background GET 5xx/network failures are not auto-alerted (server-health modal owns those).
- 2026-10-09: Login read fix (master DB config + error flag, cache dedupe, DB workload baseline over draft, bulk rowsWritten). Verified the server read against local DB; client overlay has 4 unit tests; not browser-tested. Open: the cloud draft in school_drafts still has the stale 8 rows for PER-300488-001 until the next draft save; locally the master database never exists so the dialog will appear once per page load in dev.
- 2026-10-09: Adviser persistence fix. Write scenarios verified against the local DB in a rolled-back transaction (unregistered adviser kept, no-field keeps, '' clears, registered links, insert); not browser-tested. Open decision: dropdown still offers all roster people (77 of 91 have no profile row, so their assignment is stored but not FK-linked) - alternative is restricting it to profiled people or auto-creating profiles.
- 2026-10-09: Dirty false-positive fix (Organized Classes done; shared guard has dev reasons). 3 new diff tests pass; not browser-tested. Open: other pages that use the shared guard (Roster, Designations, Deployment, PersonnelProfile, SchoolProfile, Workload) were NOT rewritten to the settle-then-snapshot approach - they will log "dirty but gave no reasons" in dev if they false-positive; pass `getDirtyReasons` there when one shows up.
- 2026-10-09: Master DB connection unification + startup health fail-loudly + honest cache dedupe + workload persistence verified end-to-end. Root cause of code 3D000 eliminated by configuring `INSIGHTED_DB_NAME=esf7_local` and sharing `getPool()` in `server/db/index.js` when master database matches primary database. Server boot runs connectivity checks against Primary DB, Master DB, and Auth DB, reporting reachability. Ensured `esf7_database` in `esf7_local` with 91 deduplicated authentic personnel for school 300488. Cleaned duplicate entry in `esf7_room_roster_cache`. Stable-key workload overlay in `server/controllers/personnel/index.js` ensures `esf7_workload_rows` are attached to personnel even after cache clears. End-to-end verified with live HTTP tests. All 21 unit test suites pass (204 tests) and client builds cleanly.

- 2026-10-09: Persistence audit written and P1/P2 fixes applied (list in PERSISTENCE_AUDIT.md section 8). Not browser-tested. Decisions needed: (1) should "Save" on the Roster register the 77 auto-filled master people as profile rows, (2) run dedupe + unique indexes on this database (2,786 extra copies locally; 300488 is clean), (3) production env must set INSIGHTED_DATABASE_URL/INSIGHTED_DB_NAME now that the master pool defaults to the primary DB.
- 2026-10-09: PM2 restart/stop audit. Draft save (single-statement upsert) and /api/workloads/bulk (BEGIN..COMMIT, ack after commit) are safe; client draftSaver keeps dirty state and retries every 10s on failure. Fixed pool close + DB-before-listen + dev ecosystem timeouts. NOT live-tested with pm2 (no pm2 run here). Open: syncDraftToNodeStatus runs fire-and-forget after the draft commit, so a restart in that window can leave derived node-status rows stale until the next save.

## 2026-10-09 session
Done: time-allotment rules (shared/, client Validation Center 6.3, server save check), QR constant. Open: ARCHITECTURE.md `shared/` note awaits user edit; RoomQR countdown uses local midnight while passcodes roll at UTC midnight (08:00 PH) - pre-existing mismatch, not changed; no 12h QR setting was found; no automated tests added yet.

## 2026-10-09 session 2 - Rows 9-13
Done in code: all five rows (see CHANGELOG). Client builds; shared multigrade logic unit-checked with a node script. NOT browser-tested. Open: ARCHITECTURE.md / PRODUCT_OVERVIEW.md still have `[fill in]` (Success Targets, Out of Scope, shared/ note). Existing saved Librarian personnel keep their stored `type` until re-saved (category is re-derived from position in most views).

## 2026-10-09 session 3 - Rows 14, 16
Done in code; not browser-tested. TODO: user runs `node server/migrations/add_school_head_sdo_and_unique_head.js` after backup (table auto-creates on first API call regardless). Row 15 blocked on user input.

## 2026-10-09 session 4 - Rows 17-22
Done: 17, 19, 22, last row. Row 18: Home Economics / Digital Literacy NOT in the SHS subject lists (Workload.jsx / OrganizedClasses.jsx) - awaiting user. Row 20: needs a CLC assignment-location field - awaiting user. Row 21: no action. Not browser-tested. Server has no Department Head requirement check, so rule 19 is client-only (shared fn ready).
