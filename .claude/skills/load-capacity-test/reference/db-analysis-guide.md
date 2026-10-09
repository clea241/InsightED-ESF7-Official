# Database analysis guide

`scripts/db-analysis.js` reads the top statements from `pg_stat_statements` (reset before each run) and plans them on the largest tenant. For configuration and schema review use the **pg-health-assessment** skill; this guide does not duplicate it.

## Reading EXPLAIN (ANALYZE, BUFFERS)

- **Scan types:** `Seq Scan` on a large table is the first thing to question; `Index Scan`, `Index Only Scan` and `Bitmap Heap Scan` are normal. A sequential scan with a large `Rows Removed by Filter` means the filter columns lack a usable index.
- **Join types:** Nested Loop is good for few outer rows and bad when the outer side is large; Hash Join needs memory (`Hash Batches > 1` means it spilled to disk); Merge Join needs sorted input.
- **Estimated vs actual rows:** a ratio above 10x either way means stale or missing statistics (run `ANALYZE` on the local test table) or correlated columns.
- **Buffers:** `shared hit` is memory, `shared read` is disk. Mostly reads on a repeated query means cache pressure or a scan reading too much.
- **Sort spills:** `Sort Method: external merge Disk` means `work_mem` was too small for that sort.

## Common causes in this app's query style

- Casts or functions on indexed columns (`lower(col)`, `col::text`, `date(col)`) prevent index use; add a matching expression index or compare on the raw column.
- Missing tenant id in composite indexes: most queries filter `school_id` (and `school_year`); the index should start with those columns.
- Unbounded `SELECT *` for a whole school: paginate or select only the needed columns.
- JSON column bloat: large `raw_payload` or `payload` values are read and rewritten whole (TOAST); see the pg-health-assessment JSON analysis.

## GENERIC_PLAN versus a real plan

`EXPLAIN (GENERIC_PLAN)` (PostgreSQL 16+) plans a normalized statement with `$n` placeholders and no actual values. It does not execute and may differ from the plan the app really gets (the planner picks custom plans using the real values). A real plan needs parameter values: put them in `load-test/query-params.json` as `{ "<queryid>": ["900001", "SY 26-27"] }` (synthetic values of the largest tenant). The report says which mode each statement used.

## Safety

EXPLAIN ANALYZE executes the statement, so it runs only for SELECT, inside a read-only transaction that is rolled back, with a statement timeout. Writes get plain EXPLAIN only.

## Indexes

Suggestions are text only. On live tables use `CREATE INDEX CONCURRENTLY` (it does not block writes, cannot run inside a transaction block, and takes longer); apply it through the deploy process, never from this skill. A local index experiment needs the user's approval, records the before and after plans, and drops the index afterwards.
