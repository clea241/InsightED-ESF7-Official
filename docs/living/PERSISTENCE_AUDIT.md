# Persistence audit: school_drafts vs normalized tables

Date: 2026-10-09. Method: read-only first, then fixes. Local database `esf7_local` (46 tables), `server/drizzle/schema.ts`, `server/schema.sql`,
`server/server.js` route mounts, the controllers that write, `client/src/services/api.js`, `AppContext.jsx` and each page.
"Confirmed" = seen in code or data. "Unconfirmed" = could not be proven from the files.

## 1. Table inventory and drift

Drizzle (`drizzle/schema.ts`) is used ONLY by drizzle-kit (`npm run db:studio`). There is **no runtime Drizzle client** (no `drizzle(` call in server code).
The live schema is created by raw SQL: `schema.sql` (run on every start) plus ~35 one-off `create_*.js` / `migrate_*.js` scripts and 5 files in
`server/migrations/`. Only one Drizzle migration exists (`0000_legal_praxagora.sql`, 30 tables).

| Drift | Tables |
|---|---|
| In the database, NOT in `drizzle/schema.ts` (18) | esf7_als_sections, esf7_sned_sections, esf7_clustered_ghost_sync, esf7_correction_items, esf7_database, esf7_database_dummy, esf7_deleted_personnel, esf7_hrmo_corrections, esf7_passcode_lockout, esf7_personnel_node_status, esf7_school_node_status, esf7_personnel_submission_archive, esf7_po3_corrections, esf7_profiling_snapshots, esf7_room_roster_cache, esf7_validation, overload_late_undertime, schools_iern |
| In `schema.ts`, NOT in the database (1) | `overload_late` (the live table is `overload_late_undertime`: a name mismatch) |
| In the database, NOT in `schema.sql` (18) | clustered_personnel, esf7_clustered_ghost_sync, esf7_correction_items, esf7_database, esf7_database_dummy, esf7_hrmo_corrections, esf7_link, esf7_passcode_lockout, esf7_personnel_extra_tasks, esf7_personnel_submission, esf7_personnel_submission_archive, esf7_po3_corrections, esf7_profiling_snapshots, esf7_room_roster_cache, esf7_room_submissions_staging, esf7_term_status, esf7_validation, school_drafts |
| In `schema.ts`, missing from the 0000 migration | esf7_admin_task, esf7_related_task |
| Column drift | `school_drafts.version` (optimistic locking) exists only if `migrations/add_school_drafts_version.js` ran; locally it has not (4 columns). `room_profiling` queried `school_drafts.draft_data`, a column that does not exist (removed, see section 6). |

Natural-key uniqueness (local DB). Tables whose ONLY uniqueness is a surrogate `id` are the duplication risk:

| Table | Natural-key uniqueness today |
|---|---|
| esf7_regular_sections | UNIQUE(school_id, school_year, grade_level, section_name) ok |
| esf7_sned_sections, esf7_als_sections | UNIQUE(school_id, school_year, section_name) ok |
| esf7_aral_sections, esf7_remedial_enrichment_sections | **none** |
| esf7_personnel_profile | UNIQUE(prn) only |
| esf7_personnel_employment / educ / learning_areas | UNIQUE(personnel_id) ok |
| esf7_personnel_designations, ld_trainings, admin_task, related_task, shs_workload_rows | **none** (replaced by delete + reinsert) |
| esf7_workload_rows | **none** (serialized per teacher by an advisory lock, nothing prevents duplicates) |
| esf7_requests | **none** |
| esf7_personnel_allowances, overload_pay_and_reason, overload_late_undertime, overload_no_work, work_immersion, school_profile, school_subjects, term_status | natural keys ok |
| esf7_personnel_node_status / school_node_status | composite PK ok |
| school_drafts | PK(school_id, school_year) ok |

Duplicate groups by the proposed keys (`scripts/audit_duplicates.js`, read-only, whole local DB of 4,190 schools): esf7_workload_rows 111 groups /
188 extra copies; esf7_admin_task 683 / 1,882; esf7_requests (pending only) 186 / 716; every other keyed table 0. **School 300488: 0 everywhere.**
Same-name profile groups (4,589) were NOT treated as duplicates: they may be distinct people in seeded data (unconfirmed).

## 2. Node to table map

| Node | Save function / route / table | Load function / route / table | Match? |
|---|---|---|---|
| School Profile | WAS: localStorage + IndexedDB + `confirmServerDraftSaved()` (the **school_drafts** blob only); `api.updateCurricularConfig` existed and was never called, esf7_school_profile had 0 rows. NOW: `PUT /schools/curricular-config` -> esf7_school_profile, response verified | `GET school` (+ `curricularConfigSaved`); the database outranks the draft once saved | fixed |
| Personnel Roster | WAS: `commitDraftPersonnel()` (state) + draft flush; people added on the roster (`local-p-…`) reached no table. NOW: those people are created through `POST /personnel` (idempotent on id/PRN) | `GET /personnel` overlaid by draft | fixed for added people; the 77 auto-filled master people are still not registered (decision) |
| QR Portal (Room QR) | `/room-profiling`: esf7_room_submissions_staging, esf7_profiling_snapshots, esf7_room_roster_cache, queue worker | same | ok (dead draft branches removed) |
| Personnel Profiling | `savePersonnelChanges` -> `PUT /personnel/:id` (profile, employment, educ in one transaction, plus trainings, learning areas, designations) + `savePersonnelNode` | draft personnel first; the database only overlays placeholder drafts | write ok / read draft-first |
| Request Center | `/requests` -> esf7_requests | `/requests` | ok (no unique key) |
| Organized Classes | `POST /sections/regular/sync` (transaction) + sned/als/aral/remedial routes | database baseline, draft overlay | ok |
| Designations & Duties | `savePersonnelChanges` -> PUT /personnel/:id -> esf7_personnel_designations (delete + reinsert in the transaction) | draft first | write ok / read draft-first |
| Workload & Timetable | `POST /workloads/bulk` (one transaction: workload_rows, shs rows, related_task, admin_task; delete + reinsert per term; returns rowsWritten) | database baseline over draft; per-teacher state route | ok |
| Deployment | `savePersonnelChanges` -> PUT /personnel/:id -> esf7_personnel_employment | draft first | write ok / read draft-first |
| Overload: reasons/pay, late-undertime, work immersion | overload_pay_and_reason, overload_late_undertime, esf7_work_immersion | same | ok |
| Overload: **absences** | `api.addAbsence` has **no caller**; state + draft only | `setAbsences(activeDraft.absences)` | **only inside the blob** (client wiring blocked, see plan) |
| Workload **transfers** | `api.createBatchTransfers` / `updateTransferStatus` have **no caller** | `setWorkloadTransfers(activeDraft.workloadTransfers)` | **only inside the blob** |
| Allowances | `togglePersonnelAllowance` -> esf7_personnel_allowances | `fetchAllowances` (database overrides the draft map after load) | ok |
| Validation / Submission | `/validation`, `/submissions` tables; `deleteSchoolDraft` after submit | tables | ok |
| Node Map progress | `syncDraftToNodeStatus` (server, on every draft save) writes esf7_personnel_node_status / school_node_status **derived from the draft** | `GET /node-status` | derived from the blob |
| Journey state | draft `journey_state` + `saveSchoolNode` -> esf7_school_node_status | draft first | partly blob |

## 3. Every school_drafts dependency

| Where | What | Class |
|---|---|---|
| `schools` controller `handleSaveDraft` / `handleGetDraft` / DELETE `/draft` | the cloud draft API (whole state as one JSON) | (a) backup, but login reads it first for personnel, school info, absences, transfers, allowances, journey |
| `syncDraftToNodeStatus` | node-status tables from the blob, errors swallowed, not transactional | (b) |
| `AppContext` draft branch of the login load | personnel, schoolInfo, absences, transfers, allowances, journey from the draft | (b) |
| `AppContext` autosave (`saveDraft`) | whole-state PUT | (a) |
| `reports/index.js`, `reports/esf7_xlsb.js` | `SELECT payload FROM school_drafts LIMIT 1` with **no school filter** (any school's draft) | (b) + privacy bug: **fixed** (scoped by school) |
| `services/overloadSync.js` | "prefer draft workload rows" then writes overload_pay_and_reason | (b): **fixed** (saved rows first, draft a logged fallback) |
| `room_profiling` (2 places) | queried a nonexistent `draft_data` column | dead code: **removed** |
| `personnel` DELETE | scrubs the deleted person out of the blob | (a) housekeeping |

The server does **not** merge the draft into esf7_personnel_profile, section tables or workload tables. The only server-side draft merging is the section-list merge
inside the draft itself (it produced the duplicated sections, fixed earlier) and the derived node-status upsert. The earlier replicated records came from the
blob, not from a draft-to-table merge.

## 4. Large-JSON / unsafe write endpoints

1. `PUT|POST /api/school/draft`: whole school state (the draft store by design); not transactional with its node-status side effects.
2. `PUT /api/personnel/:id`: whole person into 5+ tables in one transaction (ok; needed the date fix).
3. `POST /api/workloads/bulk`: one transaction, delete + reinsert per term, advisory-locked; no unique key until the migration below is applied.
4. `POST /api/personnel`: was count+1 id / random PRN (not idempotent); now idempotent on client id/PRN.
5. `POST /api/esf7-upload/import-converted`: `ON CONFLICT DO NOTHING`, transaction behaviour unconfirmed.
6. `syncDraftToNodeStatus`: per-person upserts, `.catch(() => {})`, no transaction.
7. Client API calls that look like persistence and are never invoked: `addAbsence`, `deleteAbsence`, `createBatchTransfers`, `saveBulkPersonnel` (no server route). (`updateCurricularConfig` is now used.)
8. Legacy `reports/index.js` / `esf7_xlsb.js` fall back to tables that no longer exist (`personnel`, `schools`, `workload_rows`, `class_sections`); whether those routes are still used is unconfirmed.

## 5. Connections

- Five pools in `db/index.js`: primary, staging, prod, master, users.
- **Root cause of `database "insightEd" does not exist`**: the master tables `esf7_database` (91 real rows for 300488) and `esf7_database_dummy` live INSIDE
  `esf7_local` locally, but the code read them through a separate `insightEd` pool, so locally the roster fell back to the cache.
- **Resolved by commit 2ae2fb7** (made by the project owner while this audit ran): the master pool defaults to the primary database (shared pool;
  `INSIGHTED_DATABASE_URL` / `INSIGHTED_DB_NAME` override) and `server.js` logs each database name and result at startup. Verified here:
  `fetchMasterPersonnelFromInsightEd('300488')` returns 91 rows from `esf7_database`, confirmed, no error.
- **Check before deploying:** with this default, PRODUCTION also uses the primary database for the master tables unless `INSIGHTED_DATABASE_URL` or
  `INSIGHTED_DB_NAME=insightEd` is set in the production environment (unconfirmed which one production needs).
- Drizzle is not a runtime client, so there is no Drizzle connection to unify.

## 6. Fix plan and status

| # | Fix | Status |
|---|---|---|
| P1 | Reports must not read another school's draft | **DONE** (scoped by school) |
| P1 | Master pool / startup connectivity check | **DONE** (commit 2ae2fb7) |
| P1 | `overloadSync`: database rows first | **DONE** |
| P1 | Remove dead `draft_data` branches in room_profiling | **DONE** |
| P2 | School Profile -> esf7_school_profile, database-first load | **DONE** (response verified; `curricularConfigSaved` marker) |
| P2 | Roster save persists people added on the roster | **DONE for `local-p-` people**. Registering the 77 auto-filled master people changes the "registered personnel" count: **needs your decision** |
| P2 | Absences / workload transfers to real tables | **PARTLY**: server fixed (absences GET was unscoped = returned every school; POST is an idempotent upsert; a foreign-key failure returns a clear 422). **Client wiring not done**: `overload_absences.personnel_id` is a foreign key to the profile table, so roster-only people cannot have absences stored until they have profile rows (same decision as above) |
| P3 | Duplicate report, gated dedupe, unique indexes | **TOOLS DONE, NOTHING APPLIED, needs your confirmation**: `scripts/audit_duplicates.js` (read-only), `scripts/dedupe_natural_keys.js` (report; `--apply --confirm=<table>` snapshots first), `migrations/add_natural_key_constraints.js` (check-only unless `--apply --confirm=YES`; skips tables with duplicates), keys in `utils/naturalKeys.js`. Once applied, a payload that contains the same block twice will roll the whole save back (loud, by design) |
| P3 | Login load: database baseline for profile fields, designations, deployment (draft only where it differs) | not done |
| P3 | Reconcile Drizzle with the live DB (`overload_late` name, 18 missing tables) | not done |
| P4 | `syncDraftToNodeStatus`: transaction + surfaced errors; derive from tables, not the blob | not done |

## 7. Still unconfirmed

- Whether production has the same extra/missing tables (only the local DB was inspected).
- Whether the 4,589 same-name profile groups are true duplicates.
- `esf7_upload/import-converted` transactional behaviour.
- Whether the other bulk responses (allowances, overload) return the rows written.
- Browser behaviour of everything above: only the server side and the unit tests were run.
