# Check catalog

Every check is evaluated or listed as "unverified" with a reason. Severities map to penalties: critical 15, high 8, medium 4, low 1, info 0. Category caps (weights): Configuration 20, Schema 25, Indexes 20, JSON 15, Health 20. Score = 100 minus capped penalties.

Contents: Configuration, Schema, Indexes, Health, JSON.

## Configuration

| ID | Evidence | Threshold | Severity | Fix |
|---|---|---|---|---|
| CFG-01 | `pg_settings.shared_buffers`, RAM | default 128MB with RAM >= 4 GB; below 15% of RAM; above 40% | high; medium; low | `ALTER SYSTEM SET shared_buffers` ~25% RAM, restart |
| CFG-02 | `effective_cache_size`, RAM | below 40% of RAM | medium | set to ~65% of RAM, reload |
| CFG-03 | `work_mem`, `max_connections`, RAM | work_mem x max_connections x 4 > RAM | high | lower connections/work_mem, per-role work_mem |
| CFG-04 | `work_mem`, `pg_stat_database.temp_bytes` | 4MB default and temp_bytes > 100 MB | medium | raise work_mem moderately |
| CFG-05 | `maintenance_work_mem`, RAM | 64MB default with RAM >= 8 GB | low | 512MB |
| CFG-06 | `max_connections`, backends, pooler evidence | > 200 without a pooler; observed backends > 200 | high | PgBouncer transaction pooling |
| CFG-07 | `random_page_cost`, storage | 4.0 on SSD/NVMe | medium | 1.1 |
| CFG-08 | `checkpoint_completion_target` | below 0.9 (defaults already 0.9 from PG 14 are not flagged) | low | 0.9 |
| CFG-09 | `max_wal_size`, checkpointer stats (`pg_stat_checkpointer` on PG 17+, else `pg_stat_bgwriter`) | below 4 GB and requested > timed | medium | raise max_wal_size |
| CFG-10 | `idle_in_transaction_session_timeout` | 0 | medium | 60s |
| CFG-11 | `log_temp_files` | -1 | low | 0 |
| CFG-12 | `autovacuum` | off | critical | on |
| CFG-13 | installed extensions | `pg_stat_statements` missing | medium | preload + CREATE EXTENSION |
| CFG-14 | repo/config | pooler evidence | info | none |

RAM-relative checks (CFG-01, 02, 03, 05) are unverified when RAM is unknown; CFG-07 is unverified when storage type is unknown.

## Schema

| ID | Evidence | Threshold | Severity | Fix |
|---|---|---|---|---|
| SCH-01 | `pg_constraint` | table without primary key | high | add identity PK |
| SCH-02 | constraints + indexes | FK columns not the leading columns of a valid btree index | high | `CREATE INDEX CONCURRENTLY` |
| SCH-03 | column type + default | uuid PK defaulting to `gen_random_uuid()`/`uuid_generate_v4()` | medium if table >= 100k rows, else low | bigint identity or UUIDv7 |
| SCH-04 | column types | `varchar(n)` | low | `text` |
| SCH-05 | column type + name | real/double precision on price/amount/cost/total/balance/salary/fee/rate/payment/tax names | high | `numeric(p,s)` |
| SCH-06 | column types | `timestamp without time zone` | medium | `timestamptz` |
| SCH-07 | ORM vs live | nullability differs | medium | align NOT NULL |
| SCH-08 | statistics | correlated filter pairs needing extended statistics | low | `CREATE STATISTICS` (not automated: unverified) |
| SCH-09 | ORM vs live | tables, columns, types or indexes on only one side | medium | reviewed migration or ORM update |

SCH-07 and SCH-09 are unverified when no ORM schema was extracted.

## Indexes

| ID | Evidence | Threshold | Severity | Fix |
|---|---|---|---|---|
| IDX-01 | `pg_index.indisvalid` | invalid | high | drop + recreate concurrently |
| IDX-02 | index definitions | identical columns, or a non-unique prefix of another index | medium | `DROP INDEX CONCURRENTLY` |
| IDX-03 | `pg_stat_user_indexes` joined to `pg_index` | `idx_scan = 0`, not unique, not primary, not backing a constraint; medium if > 10 MB and stats >= 7 days old, otherwise low | medium / low | drop after verifying on replicas |
| IDX-04 | `pg_stat_user_tables` | rows > 10k and `seq_scan` > 10 x `idx_scan` | medium | add matching indexes |
| IDX-05 | `pg_stats` (frequencies only) | status-like column with a dominant value above 90% on a table > 10k rows | low | partial index |

## Health

| ID | Evidence | Threshold | Severity | Fix |
|---|---|---|---|---|
| HLT-01 | `max(age(datfrozenxid))` | > 150M; > 200M | high; critical | VACUUM FREEZE, clear blockers |
| HLT-02 | `pg_stat_user_tables` | dead ratio > 20% and > 10k dead rows; > 40% | medium; high | tune autovacuum, VACUUM |
| HLT-03 | `pg_stat_activity` | non-idle transaction older than 5 min | high | fix long transactions |
| HLT-04 | `pg_stat_activity` | idle in transaction older than 1 min | medium | timeout + app fix |
| HLT-05 | `pg_replication_slots` | inactive slot | high | drop dead slot |
| HLT-06 | `pg_stat_database` | cache hit < 99%; < 95% (needs >= 10k block reads) | medium; high | memory/indexes |
| HLT-07 | `pg_stat_database.temp_bytes` | > 1 GB | high | work_mem, indexes, log_temp_files |
| HLT-08 | `pg_stat_database.deadlocks` | > 0 | low | consistent lock order |
| HLT-09 | `pg_roles` + privileges | superuser, createdb/createrole, writable tables, CREATE on public | high | least-privilege roles |

## JSON

| ID | Evidence | Rule | Severity | Fix |
|---|---|---|---|---|
| JSN-01 | `analyze-json.mjs` | classification `split` (thresholds in `json-splitting.md`) | medium; high if p95 > 64 KB or high-churn | split pattern |
| JSN-02 | `analyze-json.mjs` | classification `watch` | low | jsonb / index / promote keys |

`keep` columns produce no finding. Columns that cannot be sampled are listed as unverified.
