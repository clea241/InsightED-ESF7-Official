# PgBouncer setup notes (draft, not applied)

Source: `docs/pgbouncer-redis-plan.md` (sections 3, 5 and 8). Nothing here has been installed or applied. Do staging first, one change at a time, and keep the direct path as the rollback.

Assumptions in the plan that must be confirmed: database `max_connections` (assumed 100), other apps sharing the server (assumed 5), DB cores (unknown), whether PgBouncer already runs on port 6432, nginx timeouts.

## What the app does now

- Request code and the queue worker use `DB_HOST:DB_PORT`. In production `DB_PORT` defaults to `6432` (`ecosystem.esf7-prod.config.cjs`), so they go through PgBouncer once it exists.
- Scripts, migrations and `migrate_*.js` load `server/db/directPort.js` first. It points them at `DB_DIRECT_PORT` (default `5432`) so session `SET`, temp tables and DDL never run through transaction pooling. A port is only rewritten when `DB_DIRECT_PORT` is set explicitly or the current port is `6432`, so a developer machine on another port is left alone.
- Not covered: the older one-off files in `server/` itself (`create_*.js`, `seed_*.js`, `test_*.js`, `recreate_*.js`, `safe_truncate_*.js`, ...). Run them with `DB_PORT` set to the direct port, or add the same one-line `require`.
- `server/server.js` runs a self-healing `initDB` block (DDL such as `ALTER COLUMN ... TYPE`) on every app start through the normal pool. Each statement is a single query, so it works behind PgBouncer, but it is DDL: consider moving it to a migration later.

## Draft `pgbouncer.ini`

Placeholders only. Verify every setting name and default against the installed PgBouncer version before use.

```ini
[databases]
insighted_esf7 = host=127.0.0.1 port=5432 dbname=insighted_esf7
; add insightEd master and users DB entries here (one per name used in server/db/index.js)

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = scram-sha-256
auth_file = <path to secrets-managed userlist>   ; never commit passwords
pool_mode = transaction
default_pool_size = 20
reserve_pool_size = 4
reserve_pool_timeout = 3
min_pool_size = 5
max_client_conn = 600
query_wait_timeout = 20            ; keep below the nginx timeout and above nothing the app waits on longer
server_idle_timeout = 600
server_lifetime = 3600
max_prepared_statements = 0        ; set after checking the installed version
admin_users = <admin user>
```

Rules:

- **Lower `default_pool_size` first** if the real `max_connections` is below about 45. Pool size follows what Postgres can run in parallel, not the number of app connections.
- PgBouncer has one pool per database/user pair. This app uses up to three databases (main, insightEd master, users/auth) when they are separate, so server connections = `(default_pool_size + reserve_pool_size)` x number of pairs. Add the other apps' connections and keep the total under `max_connections` minus a reserve (about 10).
- Never expose PgBouncer publicly. Restrict by firewall and `pg_hba`.
- No named prepared statements are used anywhere in app code. Do not add any (`name:` in a `pg` query config).

## Suggested per-process pool values

Set these with the environment variables (defaults in brackets are today's values and apply when the variable is unset):

| Variable | Suggested | Default | Notes |
|---|---|---|---|
| `PG_POOL_MAX_PRIMARY` | 8 | 8 | Web process primary pool |
| `PG_POOL_MAX_INSIGHTED` | 3 | 5 | Master data reads |
| `PG_POOL_MAX_USERS` | 3 | 4 | Auth reads |
| `PG_POOL_MAX_STAGING` | 3 | 5 | Only opened when `DB_HOST` is not local |
| `PG_POOL_MAX_PROD` | 3 | 8 | Only opened when `DB_HOST` is not local |
| `PG_POOL_MAX_WORKER` | 5 | 8 | Primary pool of the queue worker process (`DB_POOL_ROLE=worker`, set by `run_redis_worker.js`); matches `MAX_CONCURRENT_WORKERS = 5` |
| `PG_CONNECT_TIMEOUT_MS` | 10000 | 15000 | Keep below the nginx timeout |

The worker holds one connection for the whole of each job (one long transaction), so up to five jobs use five server connections. That is safe in transaction mode because the lock and the writes share one client and one transaction.

A pool timeout (or PgBouncer `query_wait_timeout`) now returns `503` with `Retry-After` (1 to 5 seconds, jittered) instead of `500`.

## Staging rollout (one change at a time)

1. Apply the additive migration `server/migrations/add_queue_retry_columns.js` (and, later, the `submission_id` one) after a backup. Rollback: run it with `--down`.
2. Set `QUEUE_CONSUMER_ENABLED=true` on staging only. Rollback: set it to `false` and restart the worker.
3. Install PgBouncer on staging with the draft above; point staging `DB_PORT` at it, keep `DB_DIRECT_PORT=5432`. Rollback: set `DB_PORT=5432`.
4. Lower the pool sizes in the table. Rollback: unset the variables (defaults return).

## What to watch

`SHOW POOLS` (`cl_waiting`, `maxwait`), `SHOW STATS`, `SHOW CLIENTS`; Postgres connection count against `max_connections`; queue depth, oldest pending job age, `failed` job count.
