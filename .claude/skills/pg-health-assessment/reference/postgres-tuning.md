# PostgreSQL tuning for a heavily normalized, highly relational workload

> Note: this file is a condensed reference written from the outline of the "Optimizing PostgreSQL for a heavily normalized, highly relational workload" guide. Replace or extend it with the full original text if you have it; `check-catalog.md` is what the scripts actually apply.

Contents: 1. Essential configuration; 2. Relational schema practices; 3. Indexing; 4. Warning signs.

## 1. Essential configuration

**Memory.** `shared_buffers` about 25% of RAM (restart). `effective_cache_size` 50-75% of RAM (planner hint only). `work_mem` is per sort/hash node per connection: keep `work_mem x max_connections x 4` under RAM; raise it per role for reporting jobs. `maintenance_work_mem` 256MB-1GB for VACUUM and index builds.

**Connection architecture.** Each connection is a process. Keep `max_connections` 100-200 and put PgBouncer or Odyssey in transaction pooling mode in front; size application pools small (for example 10-20 per app instance).

**WAL and checkpoints.** `checkpoint_completion_target = 0.9` (already the default from PostgreSQL 14, so a default value is not a finding). `max_wal_size` 4-16 GB so checkpoints are time-triggered, not size-triggered; check `num_requested` versus `num_timed`. On PostgreSQL 17+ these counters are in `pg_stat_checkpointer`; before that in `pg_stat_bgwriter`.

**Storage.** On SSD/NVMe set `random_page_cost` about 1.1 and `effective_io_concurrency` higher.

**Safety nets.** `idle_in_transaction_session_timeout` (for example 60s), `statement_timeout` per role, `log_temp_files = 0`, `log_min_duration_statement`, `pg_stat_statements`.

## 2. Relational schema best practices

- Index every foreign key (PostgreSQL does not do it for you); joins and `ON DELETE` checks depend on it.
- Prefer `bigint GENERATED ... AS IDENTITY` or time-ordered UUIDv7 over random UUIDv4 primary keys (index locality, WAL volume).
- Use `text` instead of `varchar(n)` unless a real business limit exists; `numeric` for money; `timestamptz` for instants.
- Raise `default_statistics_target` (for example 200-500) on skewed columns; use `CREATE STATISTICS` for correlated columns.
- For queries joining many tables consider `join_collapse_limit`/`from_collapse_limit` and `geqo_threshold` after measuring planning time.

## 3. Indexing

- Covering indexes (`INCLUDE`) enable index-only scans; composite indexes follow the leftmost-prefix rule; partial indexes serve skewed status columns.
- BRIN for huge, naturally ordered tables; GIN for jsonb containment/full text; GiST for ranges/geometry.
- Maintenance: `REINDEX CONCURRENTLY`, `CREATE/DROP INDEX CONCURRENTLY` (not inside a transaction block).
- **Correction to the original guide's unused-index query:** `indisunique` is not in `pg_stat_user_indexes`. Join `pg_index` on `indexrelid`, and exclude primary keys, unique indexes and indexes that back constraints (foreign keys rely on them). Also check `pg_stat_database.stats_reset`: `idx_scan = 0` is meaningless right after a reset or restart.

## 4. Warning signs

- **Bloat:** dead-tuple ratio above 20% with many rows; tune per-table autovacuum.
- **XID wraparound:** `max(age(datfrozenxid))` above 150M is a warning, 200M urgent.
- **Long transactions and inactive replication slots** hold back vacuum and retain WAL.
- **Temp-file spilling:** growing `temp_bytes` means `work_mem` is too small or an index is missing.
- **Connection starvation:** backends near `max_connections`; add pooling.
