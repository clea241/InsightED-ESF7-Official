# Redis practices

## Two jobs, kept separate
**Read cache** (cache-aside) and **write buffer** (durable queue) must not share an eviction policy. Run the buffer on a separate Redis instance (or separate logical setup) with `maxmemory-policy noeviction`. Run the cache with a bounded `maxmemory` and `allkeys-lru` or `volatile-lru`, so memory pressure can never delete queued writes. If the repo has one Redis serving both, that is a finding.

## Read cache
- Cache only read-heavy, slow-changing data: reference lists, lookups, per-tenant settings.
- Per-tenant key namespaces (for example `app:v1:tenant:<id>:<thing>`).
- TTL with random jitter (for example TTL +/- 10-20%).
- Stampede protection: single-flight lock or stale-while-revalidate.
- Explicit invalidation on the writes that change the cached data.
- Never cache user-specific data or authorization decisions without keys that include the user/role.
- Use `SCAN`, never `KEYS`, in production paths.
- Fall back to PostgreSQL if Redis is down, with rate limiting on the fallback so a Redis outage does not become a database outage.

## Write buffer
- State the ack point as a product decision: acknowledge after the buffer accepted the write durably (fast; user sees "queued"), or after the DB commit (slower; user sees "saved"). Never ack before durability.
- Redis Streams with consumer groups. `XACK` only after the database commit. Failed writes stay pending and are retried with backoff (`XAUTOCLAIM` for abandoned entries).
- Dead-letter after N attempts with an alert. Never delete silently.
- Persistence on: AOF `appendfsync everysec` at minimum; test restart behavior. No TTLs on stream keys.
- **Idempotency:** every buffered write carries an idempotency key; the database write is an upsert or protected by a unique constraint, so retries cannot create duplicates.
- **Backpressure:** bounded stream length (reject new items with a clear message at the cap, do not trim unprocessed entries), worker concurrency tied to the PgBouncer pool size, batch inserts in transactions of sensible size, return `202` / "please wait" with a status check endpoint.
- One consumer set only (not one per web process); a separate worker process under PM2; graceful shutdown that finishes or returns in-flight jobs.

## Health and metrics
- Readiness (app + DB) is separate from the deep check (Redis).
- Expose queue depth, oldest-item age, retry count, dead-letter count.

## Operation classification guide
| Class | Criteria |
|---|---|
| **Cacheable read** | SELECT, same result for many users/requests, tolerates seconds-to-minutes staleness, high call rate, not tied to the caller's identity/permissions. |
| **Hot write for the buffer** | INSERT/UPDATE on a burst path (many users at once), single-row or small payload, can be keyed idempotently, user can accept "queued" or "please wait", no read-your-write needed immediately (or status endpoint covers it). |
| **Must stay direct** | Migrations, session advisory locks, LISTEN/NOTIFY, long or multi-step transactions with reads depending on the writes, admin/maintenance, writes needing synchronous validation against current DB state, `TRUNCATE`/bulk deletes. |
| **Fine as is** | Low-rate reads/writes, per-user data, anything where caching or buffering adds risk without reducing database load. |
