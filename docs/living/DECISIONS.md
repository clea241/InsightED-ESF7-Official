# DECISIONS

## 2026-10-08 One global auth gate instead of per-route middleware
Mounted once (`app.use('/api', apiAuthGate)`) so new routes are protected by default; public paths are an explicit allow-list in `middleware/auth.js`. Chosen over editing ~160 route definitions. Trade-off: a path-based allow-list must be kept in sync when public endpoints are added.

## 2026-10-08 No JWT fallback secret
Production fails fast at startup; development uses a random per-process secret. The previous default is public in git history and must be considered compromised.

## 2026-10-09 Dedupe by stable key, keep the original
Duplicates are collapsed on id (or grade+section name for sections, prn for personnel); the first/oldest copy keeps its identity and later copies only fill its empty fields. Chosen over "newest wins" so ids that other records point at never change. Client and server each carry an identical copy of the helper because no shared layer exists yet.
## 2026-10-09 Verify DB before listen, not full initDB
Only a SELECT 1 gates the port; schema DDL in initDB still runs after listen so wait_ready (10s) is not exceeded by slow migrations. Shutdown hard-exits at 12s, inside the 15s kill_timeout; Postgres rolls back any transaction cut off by the exit.

## 2026-10-09 - Introduced `shared/` (ES modules)
Created `shared/` for rules used by both sides (ARCHITECTURE.md still says "does not exist" - frozen, needs the user's edit). Client imports via `@shared` Vite alias; server (CommonJS) loads via dynamic `import()` in `server/utils/sharedRules.js`. Caps are interpreted per subject, per section, per term (weekly cap sums all teachers' blocks of that subject). Min 40 applies to G1/G2 for regular/multigrade, all grades for SCP. ADVISORY/HGP rows are excluded. Server blocks only new/changed rows so legacy data doesn't block unrelated saves.

## 2026-10-09 - Rows 9-13 choices
- `subjectGradeLevel` row field (not overloading `gradeLevel`) so existing section/grade matching keeps working; stored in raw_payload, no migration.
- `disabled_allowances` JSONB column added with `ADD COLUMN IF NOT EXISTS` in the allowances controller (additive, existing rows default `[]`); chosen over a school-wide setting because allowances are stored per personnel.
- Disabling keeps the grant flag so re-enabling is lossless.
- server/utils/scheduleValidator.js (sync CJS, not wired to routes) left unchanged for multigrade overlap; wire it via shared isPerGradeSharedSlot if it is ever enabled.

## 2026-10-09 - Row 14/16
- Own table + one record per school (re-saving replaces it) rather than a list: the fallback is a single stand-in head.
- DB unique index lives in a reviewed migration (refuses to run if duplicates exist) instead of auto-running at startup.
- Row 15 (NTP function notes) not started: no 5-category NTP functions dropdown found (Workload has 6 ADMIN TASK categories) and the task text must come from the user.

## 2026-10-10 Keyset (cursor) paging for the workload list, body stays an array
Keyset on (created_at, id) reads each page straight off an index; OFFSET would re-scan skipped rows on deep pages. Paging data goes in headers so any unknown caller still receives the same array shape. Index built CONCURRENTLY to avoid blocking workload saves.

## 2026-10-10 Expand, backfill, verify, then contract for payload columns
The whole-body copy is removed in separate steps so a failed check leaves the old column in place: add `extras` (additive), copy, verify key by key against the old payload and a backup, deploy code that works before and after the drop, and drop only when a PASS report exists for the same database and row count (the drop script enforces it). `extras` (JSONB, strict equality rule) was chosen over new typed columns for the pilot because it is lossless for every observed key type; hot keys can be promoted later. Dropping a column does not shrink the table: a rewrite (VACUUM FULL or pg_repack) is a separate, planned step.

## 2026-10-10 One generic payload engine instead of per-table scripts
The six remaining tables share `utils/payloadExtras.js` (per-table column kinds, strict equality) and one CLI (`migrations/payload_extras.js`). No fills into typed columns: filling would change foreign-key and empty-value behavior (for example `esf7_regular_sections.adviser_id`), so a differing or empty value stays in `extras`. Aliases that a formatter does not re-emit can be listed in the table's `exclude` config so they stay in `extras`; the old-vs-new response comparison is what shows whether any is needed (none was).
