# Hard rules

- Strictly read-only. Every live connection runs inside `BEGIN READ ONLY` with `SET LOCAL statement_timeout = '5s'` and `SET LOCAL lock_timeout = '1s'`. Only `SELECT`, `SHOW`, and `EXPLAIN` (without `ANALYZE`) are allowed. Never run `ANALYZE`, `VACUUM`, `REINDEX`, `CREATE`, `ALTER`, `DROP`, `SET` outside the transaction, `pg_terminate_backend`, or `pg_stat_reset`.
- Never print, log, or store json/jsonb values or any row data. Only key names, key paths, types, counts, and byte sizes.
- Never print connection strings with passwords; print host and database name only.
- Recommended SQL is output as text only and is never executed. Index changes are written with `CONCURRENTLY`; note that `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
- Sample large tables (`TABLESAMPLE SYSTEM`, capped at 1000 rows) and skip tables above a configurable size (`--skip-above-gb`). Never run an unbounded scan on a large table.
- When a metric cannot be measured, mark it "unverified" and exclude it from the score; never guess RAM, storage type, or PostgreSQL version.
- Data safety outranks completeness: if a query is slow or blocked, abort that check and report it.
- Never install packages; use only the driver already installed in the project.
- Parsing ORM files must never execute project code (no `import()` of the user's schema or config). Parse as text only.
- Writes, migrations and auto-fixing are out of scope even if the user asks mid-run.

## Known failure modes to prevent

- The unused-index query in the user's tuning guide filters `indisunique`, but that column is not in `pg_stat_user_indexes`. Join `pg_index` on `indexrelid` and also exclude primary keys and indexes that back foreign keys or constraints.
- `idx_scan = 0` is meaningless right after a stats reset or restart; check `pg_stat_database.stats_reset` and downgrade the finding if stats are younger than 7 days.
- `pg_stat_bgwriter` checkpoint columns moved to `pg_stat_checkpointer` in PostgreSQL 17; branch on `server_version_num`.
- `checkpoint_completion_target` default is already 0.9 from PostgreSQL 14; do not flag defaults that are already good.
- Do not flag `shared_buffers` against RAM when RAM is unknown.
- A failed statement aborts the transaction: the collector rolls back and opens a new read-only transaction instead of using SAVEPOINT.
