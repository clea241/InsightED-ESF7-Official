# Rules for pgbouncer-redis-plan

## Hard rules

- **Read-only.** Change nothing in the repo except writing `docs/pgbouncer-redis-plan.md`. Do not install, start, stop or configure PgBouncer or Redis. Scripts write only to the OS temp directory.
- **Never connect to a production database or Redis.** Use only repo files, numbers the user provides, or local test settings. Mark everything else `assumed`.
- **Never print or store secrets, connection strings or passwords.** Report environment variable names only.
- **Never recommend a design that can lose a submission:** no acknowledging before the write is durable, no deleting queued items before the database commit, no eviction policy on the buffer.
- **Every recommendation names the file or operation it comes from.** Claims you could not verify are labeled as such.
- **Every recommendation includes a rollback** and is staged on a non-production environment first, one change at a time.

## Known failure modes to prevent

- Recommending transaction pooling without checking session-state features (advisory locks, LISTEN/NOTIFY, session SET, temp tables, WITH HOLD cursors, named prepared statements).
- Sizing the PgBouncer pool by client count instead of database parallelism.
- Sharing one Redis eviction policy between cache and buffer.
- Acking queue jobs before the database commit.
- Unbounded queue growth (no length cap, no backpressure message).
- Missing idempotency, so retries duplicate rows.
- Running migrations through PgBouncer in transaction mode.
- Assuming `max_connections` instead of asking (or labeling it `assumed`).
- Counting only one pool per process when the code opens several.
- Trusting scanner output without opening the file.
- Recommending a new worker/queue when one already exists; extend it instead.
