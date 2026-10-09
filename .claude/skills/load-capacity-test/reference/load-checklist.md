# Load checklist (eSF7 performance lessons)

Use this after the runs to add findings to the report.

## Contents

1. Pools and connections
2. Payloads and heavy writes
3. Queue workers
4. Memory
5. Timeouts
6. Tenants
7. Follow-up Tracked Items (From Load Analysis)

## 1. Pools and connections

- Right-size pools: `pool size x processes x apps sharing the database` must stay well under `max_connections`. Measure first (the sampler records active + idle + idle-in-transaction versus `max_connections`), then change.
- Idle-in-transaction connections or lock waits during load point at code holding transactions open.

## 2. Payloads and heavy writes

- Keep large payloads out of blocking requests: paginate or chunk, select only the needed columns, compress, and queue heavy writes, returning 202.
- Look for unbounded `SELECT *` and endpoints returning a whole school's data on every call (compare rows per call in the database analysis).

## 3. Queue workers

- Only one queue-worker consumer set, not one in every web process. Check that PM2 cluster instances do not each start a worker.

## 4. Memory

- Set caps: `max_memory_restart` for PM2, `maxmemory` for Redis.
- A memory fix is unproven until a multi-hour soak (`--soak`, only when the user asks) shows flat memory.
- Redis: per-tenant cache keys, `SCAN` not `KEYS`, no TTLs on stream keys with `volatile-lru`.

## 5. Timeouts

- Check every layer: browser, CDN or gateway, nginx, app, database. Mark which layers cannot be tested locally (nginx, gateway, CDN) in the report.

## 6. Tenants

- Look at the largest tenant, not the average one. Both the data volume and 70% of the generated traffic target the largest tenant.

## 7. Follow-up Tracked Items (From Load Analysis)

1. `GET /api/personnel` runs `SELECT * FROM esf7_workload_rows WHERE school_id = ANY($1)` with no `LIMIT` or pagination, which risks memory spikes on large schools.
2. `GET /api/personnel` does about 770 individual `INSERT INTO esf7_personnel_node_status` operations per request. That is an N+1 write inside a read endpoint, and it amplifies transaction log writes.
3. Lookups on `esf7_workload_rows` by person would benefit from an index on `personnel_id`, as a suggestion only. If it is implemented in production, apply it with `CREATE INDEX CONCURRENTLY idx_esf7_workload_personnel_id ON esf7_workload_rows(personnel_id)`.
4. The application code reads `esf7_personnel_educ.college_degrees`, which is missing from the introspected database schema file.
5. `server/drizzle/0000_*.sql` is wrapped entirely in a comment block, so migrations don't manage the live schema declarations.
6. Per-process CPU and memory sampling in `sample-resources.sh` depends on `/proc` and Linux-specific commands (`ps -o`, `free`, `vmstat`), so it doesn't work on Windows. The multi-core PM2 cluster layout also isn't simulated in single-process fallback mode.
