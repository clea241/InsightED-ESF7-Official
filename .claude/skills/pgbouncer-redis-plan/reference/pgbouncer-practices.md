# PgBouncer practices

Verify every setting name and default against the installed PgBouncer version before recommending it.

## Mode and sizing
- Use **transaction pooling** (`pool_mode = transaction`) for web/API traffic. Use session pooling only for clients that need session state.
- **Pool size follows what Postgres can run in parallel, not client count.** Many idle app connections are the problem PgBouncer solves. Keep total server connections (`(default_pool_size + reserve_pool_size)` per database/user pair, summed over pairs) below `max_connections` minus a reserve for admin and maintenance, and minus other apps sharing the database.
- `max_client_conn`: high enough for every app process's pool (instances x pool max, with headroom).
- `reserve_pool_size` + `reserve_pool_timeout`: absorb brief spikes.
- `query_wait_timeout`: make overloaded requests fail fast with a clear error instead of piling up. Keep it below the gateway/nginx timeout.
- `server_idle_timeout`, `server_lifetime`: set sensibly (recycle connections without churning during bursts).

## Compatibility
- **Prepared statements:** depending on PgBouncer version, protocol-level prepared statements in transaction mode may need `max_prepared_statements`. With the `postgres` driver, set `prepare: false` if the PgBouncer version does not support them; with `pg`, avoid named queries (`name:` in query config). Confirm with the actual driver and versions.
- **Anything needing session state must bypass PgBouncer:** session advisory locks (`pg_advisory_lock`; the `_xact_` variants are fine inside one transaction), `LISTEN/NOTIFY`, session-level `SET` (use `SET LOCAL` inside a transaction), temp tables, `WITH HOLD` cursors.
- `SELECT ... FOR UPDATE` is fine only when lock and write share one transaction on one client.
- **Migrations and admin tasks connect directly to Postgres**, never through PgBouncer in transaction mode.

## Placement and security
- Run PgBouncer on the same host as the app, or on the database host. With several app VMs, decide centrally and document the trade-off (local = no extra hop and no single point of failure per app, but more server connections to budget; central = one pool to size, but one more failure point).
- Never expose it publicly. Restrict by firewall and `pg_hba`. Use TLS to the database across servers.
- `auth_type` / auth file handled by a secrets mechanism. Never put passwords in the repo.

## App side
- Application pools shrink behind PgBouncer: small per-process pools; connection timeouts shorter than the gateway timeout.
- Treat "pool full" / `query_wait_timeout` errors as a retryable **503** with `Retry-After`, not a 500.

## Operations
- Monitor `SHOW POOLS`, `SHOW STATS`, `SHOW CLIENTS`: watch `cl_waiting`, `maxwait`, and server connection saturation. Alert on sustained waiting.
- Apply config changes with `RELOAD` / `SIGHUP`. Do not restart during traffic.
- Keep a direct-connection path (separate port or DB alias) available as rollback.
