# Pilot: esf7_workload_rows stops duplicating its request body (2026-10-10, esf7_local only)

Result: `raw_payload` is dropped from `esf7_workload_rows` on the local database; typed columns plus a slim `extras` JSONB hold everything. The other six tables are not touched yet.

## What was proven before anything was removed
- **Backup:** `pg_dump -Fc` of the table (33 MB), restored into a scratch database: 651,940 rows and the same content fingerprint as the live table. Scratch databases were dropped afterwards.
- **Verification (`workload-rows-payload-verification.json/.md`, PASS):** all 651,940 rows, 8,663,841 payload keys: 6,990,259 equal to a typed column, 1,673,582 held in `extras`, **0 unaccounted**. The eight keys every old payload carried (`id, gradeLevel, sectionId, sectionName, subject, startTime, endTime, days`) are rebuilt exactly. `raw_payload` was byte-identical to the backup when verified.
- **The check can fail:** removing one key from one row's `extras` made it report FAIL (1 unaccounted key) and the drop script refused to run; re-running the backfill repaired it and the report went back to PASS.
- **After the drop (`workload-rows-post-drop-proof.json`, PASS):** original payloads from the backup compared with the live columns plus `extras` after the column was dropped and the table rewritten: same ids, same row count, 0 unaccounted keys.
- **API responses unchanged:** the original formatter (from git `HEAD`) on the old payload vs the new formatter on columns plus extras, for every row: 0 rows differ in any existing key or value. The only difference is additive: `subjectName` and `subject_name` (always equal to `subject`) are now on every row; before they were on 125k and 352k rows. The `rawPayload` echo no longer carries snake_case copies of typed columns.

## What the old payload really held
- 81% of the payload keys (6.99M of 8.66M) were copies of a typed column, as the skill reported; the other 19% (1.67M keys) are not, and are now in `extras` (only 8,449 rows ended with empty extras).
- It was not a pure duplicate: 8 keys have no typed column (`task`, `rowType`, `minsPerDay`, `category`, `daySchedule`, `durationMinutes`, `trackStrand`, nested `rawPayload`). They now live in `extras`, on 123k to 352k rows each.
- 43 rows had an empty `remediation_subject` while the payload had a value; the value was moved into the column. About 24,000 rows had an empty-string `sectionId` in the payload against a NULL column, and similar small differences on `gradeLevel`, `subject`, `section_name`; every such difference is kept in `extras` rather than discarded.
- Average per row: payload 350 B (up to 1.7 kB) vs extras 55 B.

## Effect (esf7_local, 651,940 rows, plans in `plans/workload-rows-split-*.json`)

| Measure | Before (restored backup) | After |
|---|---|---|
| Heap size | 405 MB | 194 MB |
| Table + indexes | 501 MB | 290 MB |
| Full scan of the table (EXPLAIN buffers) | 51,848 (48,322 read) | 24,836 (19,838 read) |
| Full scan time | 208 ms | 161 ms |
| Average row width | 624 B | about 300 B |
| List page, 501 rows, plan width per row | 765 B | 419 B |
| List page time | 0.59 ms | 0.86 ms (index scan both; within noise) |

The first page of the list was already fast after the earlier pagination change; what shrinks is the data each row carries (45% narrower rows) and everything that scans the table.

## Files
- Schema: `server/drizzle/schema.ts` (`extras` added, `rawPayload` removed for this table).
- Helper: `server/utils/workloadPayload.js` (+ `server/tests/unit/workload_payload.test.js`).
- Migrations (in order): `expand_workload_rows_extras.js`, `backfill_workload_rows_extras.js` (dry run by default, `--apply`), `verify_workload_rows_extras.js`, `drop_workload_rows_raw_payload.js` (refuses without a PASS report for this database and row count, a backup file and `--confirm`).
- Writers: `controllers/workload_rows/index.js` (POST, bulk save, PUT), `queue_worker.js`, `scripts/disaggregate_school_drafts.js`, `scripts/sync_workload_rows.js`, `create_esf7_workload_tables.js`. Readers: the two `formatWorkloadRecord` functions and the section-conflict query. Tests: `tests/integration/workload_extras.integration.test.js` (includes the post-drop state).

## Production runbook (not run; local rehearsal only)
1. Back up the table (`pg_dump -Fc -t esf7_workload_rows`) and note the fingerprint query in `verify_workload_rows_extras.js`.
2. `expand_workload_rows_extras.js`, then `backfill_workload_rows_extras.js` (dry run, review, then `--apply`). The backfill rewrites about 640k rows (the table roughly doubles on disk until vacuumed): run off-peak.
3. Deploy the new code. It works before and after the drop (a missing column is tolerated) and folds an old payload into `extras` if a not-yet-backfilled row is edited.
4. Run the backfill again (rows written by old code in between), then `verify_workload_rows_extras.js`.
5. Only with PASS: `drop_workload_rows_raw_payload.js --backup <dump> --confirm`. Space is reclaimed only by a rewrite (`--rewrite` runs `VACUUM FULL`, exclusive lock; `pg_repack` avoids the lock). Table bloat and settings belong to `pg-health-assessment`.
- Rollback before step 5: nothing to undo (the column is untouched). After step 5: add the column back and restore it from the dump (instructions are in the drop script header).

## Not done / for review
- Hot payload-only keys (`task`, `rowType`, `minsPerDay`, `category`) are on over half the rows; promoting them to typed columns would be a follow-up if they are filtered or sorted on. They are kept in `extras` for now, which is lossless.
- Old-code instances still running after step 3 and before the drop would write `raw_payload` only; the drop script checks for that and refuses.
- The other six tables (`esf7_regular_sections`, `esf7_personnel_allowances`, `esf7_school_profile`, `esf7_related_task`, `esf7_admin_task`, `esf7_requests`) are unchanged. Two of them (`related_task`, `admin_task`) are written by the same bulk-save handler, and `esf7_regular_sections` merges the stored payload with the request body on update, so it needs its own key analysis first.
