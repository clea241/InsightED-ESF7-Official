# Six more tables stop duplicating their request body (2026-10-10, esf7_local only)

Follows the `esf7_workload_rows` pilot (`workload-rows-payload-pilot.md`). `raw_payload` is now dropped from `esf7_personnel_allowances`, `esf7_requests`, `esf7_school_profile`, `esf7_related_task`, `esf7_admin_task` and `esf7_regular_sections` on the local database; each table keeps its typed columns plus a slim `extras` JSONB. Nothing was run on staging or production, and nothing is committed.

## What was proven
- **Backup first:** one `pg_dump` of the six tables (10 MB, `~/insighted_backups/payload-six-tables-20261010-220413.dump`), restored into a scratch database: row counts and content fingerprints identical for all six.
- **Verification before the drop (`<table>-payload-verification.json/.md`, all PASS):** every payload key and value is held by a typed column or by `extras`, and each `raw_payload` was byte-identical to the backup. 2,513,336 keys checked in total, **0 unaccounted**.
- **After the drop (`six-tables-post-drop-proof.json`, PASS):** the original payloads from the backup compared with the live columns plus `extras` after the columns were dropped and the tables rewritten: same ids, same row counts, 0 unaccounted keys.
- **API responses unchanged:** the original formatter (git `HEAD`) on the old payload against the new formatter on columns plus `extras`, for every row: allowances 63,980 rows, requests 3,208, admin tasks 15,313 (both formatters), regular sections 139,797: **0 rows differ**, no key added or lost. School-profile has no formatter; the exact fallback expressions `schools/index.js` reads (12 per row) were compared on all 14,804 rows: 0 mismatches. `esf7_related_task` is written but never read by the app.
- **Write routes work before and after the drop:** a scratch database with the real table definitions (schema only), the real routers mounted: allowances toggle and bulk, regular-section create and partial update, request create, workload bulk save with related and admin tasks. 22 checks pass, including the same calls after `raw_payload` is dropped.

## What each payload really held
| Table | Rows | Payload keys with no typed column (kept in `extras`) |
|---|---|---|
| esf7_personnel_allowances | 63,980 (37,682 with a payload) | `allowanceKey`, `isGranted` (the first toggle request; `ON CONFLICT` never refreshed it) |
| esf7_requests | 3,208 | `requesterId`, `allAssignedSchools`, plus `personnelId` where the column is empty (1,427 rows) |
| esf7_school_profile | 14,804 | `region`, `district`, `division`, `schoolName`, `numberOfShifts`, `curricularOffering`, `specialPrograms`, certification fields |
| esf7_related_task | 15,589 | `hours`, `cadence`, `isLocked`, `isSdsApproved`, `designatedBySds` |
| esf7_admin_task | 15,313 | `hours` (11,669 rows) and 3,643 differing `id` values |
| esf7_regular_sections | 139,797 | `adviserRemarks`, `hgpMinutes`, `advisoryMinutes`, ARAL fields, and `advisorId` where the adviser has no profile row yet (the foreign key cannot hold it) |

Any value that differs from, or is empty in, its typed column stays in `extras` instead of being merged or discarded, so nothing is "fixed up" silently (for example `sectionName: "Rose"` next to the stored `ROSE`).

## Effect (esf7_local; "before" measured on the restored backup, "after" after the rewrite)
| Table | Heap before -> after | Table + indexes | Average row | Payload -> extras per row |
|---|---|---|---|---|
| esf7_personnel_allowances | 12.5 -> 10.0 MB | 20.5 -> 18.0 MB | 188 -> 154 B | 101 -> 43 B |
| esf7_requests | 1.36 -> 0.82 MB | 1.77 -> 1.20 MB | 427 -> 254 B | 214 -> 53 B |
| esf7_school_profile | 14.6 -> 7.2 MB | 16.0 -> 8.6 MB | 955 -> 485 B | 726 -> 287 B |
| esf7_related_task | 7.6 -> 4.3 MB | 8.8 -> 5.5 MB | 484 -> 271 B | 282 -> 93 B |
| esf7_admin_task | 6.6 -> 4.4 MB | 7.8 -> 5.5 MB | 434 -> 286 B | 136 -> 17 B |
| esf7_regular_sections | 74.5 -> 35.4 MB | 93.7 -> 54.5 MB | 538 -> 252 B | 318 -> 62 B |
| **Six tables** | **117 -> 62 MB (-47%)** | **149 -> 93 MB (-37%)** | | |

A full scan of `esf7_regular_sections` (the only one big enough to show it) reads 4,526 buffers instead of 9,540 (plan files `plans/six-before-*.json`, `six-after-*.json`). The small tables fit in cache, so their time barely changes; what shrinks is storage, backups, WAL per write and the bytes returned per row. With the pilot, seven tables now carry about 150 MB less.

Re-running the orm-optimizer skill: Verified duplicated-payload tables 6 -> 0 (7 -> 0 including the pilot), `duplicated-json-payload` schema candidates 30 -> 23, `payload-write-whole-body` sites 53 -> 44. What remains is the Rejected set from the earlier report plus empty tables (Static only).

## What changed in the code
- Engine: `server/utils/payloadExtras.js` (per-table column kinds; strict equality; no fills into typed columns, so foreign-key and empty-value semantics are untouched) with `server/tests/unit/payload_extras.test.js`.
- One generic CLI: `server/migrations/payload_extras.js expand|backfill|verify|drop <table>` (same gates as the pilot: dry-run backfill, per-table verification report, drop refuses without a PASS report for this database and row count, a backup file and `--confirm`).
- Writers: `controllers/allowances`, `controllers/requests`, `controllers/class_sections` (regular sections; folds an unbackfilled legacy payload into `extras` on update), `controllers/workload_rows` (related and admin tasks), `controllers/schools` (draft persistence for school profile, regular sections and, from the pilot, workload rows), `queue_worker.js`, and the one-off scripts `disaggregate_school_drafts`, `seed_mcoc_archetypes_staging`, `populate_actual_school_requests`, `restore_exact_requests`, `reconstruct_requests`. Setup scripts (`create_esf7_*`) now create `extras` instead of `raw_payload` for these tables.
- Readers: the allowance, request, regular-section and admin-task formatters, the school-profile fallbacks, and the duplicate-request check (`extras->>'personnelId'`).
- `server/drizzle/schema.ts`: `extras` added and `rawPayload` removed on all seven tables.

## Production runbook (not run)
Per table, in this order, off-peak: backup (`pg_dump -Fc -t <table>`) and fingerprint; `expand`; `backfill` (dry run, then `--apply`); deploy the new code (it works before and after the drop); `backfill` again; `verify --backup-fingerprint <md5> --backup-rows <n>`; only on PASS `drop --backup <dump> --confirm` (add `--rewrite` in a maintenance window, or use pg_repack). `esf7_regular_sections` is the only large one (140k rows).

## Review points
- `schools/index.js` carries your uncommitted draft-persistence work. My edits there are narrow (workload, school profile and regular-section inserts, and the `pRow.raw_payload` reads), but the file also contains your other changes.
- Deploy ordering matters for one reason: code that writes `extras` must be live before the drop, and the backfill must have covered the rows written by older code. The verifier and drop script check both.
- Not changed, by your instruction: personnel employment/profile/education, `esf7_personnel_submission.payload_json` and `school_drafts.payload`.
