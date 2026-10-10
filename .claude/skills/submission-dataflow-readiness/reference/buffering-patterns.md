# Buffering patterns for a submission burst

Use this in step 7. Every recommendation in the plan must tie back to something found in the repo; this file supplies the mechanics and the numbers to check. Values here are **starting points to verify**, not facts about the target system.

## Contents

1. Phase 1: make the direct path survive a burst
2. PgBouncer and Drizzle / node-postgres / postgres-js gotchas
3. Phase 2: durable Redis buffer
4. Decision: when Phase 1 is enough, when Phase 2 is required
5. Invariants (do not break)

## 1. Phase 1: make the direct path survive a burst

1. **Pool math.** Connections the app can open = PM2 instances x pool `max` x number of pools per process (some apps create several pools; check `infra.pools`). This must be below the pooler's server-side pool, which must be below the database `max_connections` minus a reserve for admin, replication, and workers. `capacity.json` gives the available figure and the needed figure at several transaction times.
2. **PgBouncer in transaction pooling mode** (`pool_mode = transaction`) lets thousands of client connections share a small number of server connections. Start with `default_pool_size` near the number of CPU cores of the database x 2-4, `max_client_conn` above the sum of all app pools, and `reserve_pool_size` small. Verify against the database tier before committing numbers. See section 2 for the gotchas.
3. **Small per-process pools.** Prefer a small `max` (for example 5-10) per process and let the pooler multiplex. Set `connectionTimeoutMillis` so waiting requests fail fast (and return `503`) instead of queueing without bound. Keep `statement_timeout` and `idle_in_transaction_session_timeout` on the database role used by the app.
4. **One-round-trip multi-row inserts through Drizzle:**
   `await db.insert(t).values(rows).onConflictDoNothing({ target: t.submissionId })`
   inserts many rows in one statement. Add `.returning({ id: t.id })` only if the IDs are needed.
5. **Chunking and the bind-parameter limit.** PostgreSQL allows at most **65,535** bind parameters per statement. Rows x columns must stay below it. Chunk size = floor(65,535 / columns) at most; use a much smaller chunk in practice (for example 500-1,000 rows) to keep statements and locks short. Example: 14 columns gives at most 4,681 rows per statement.
6. **Idempotency.** The client generates a submission ID (UUID) once per user action and reuses it on every retry. The table has a unique constraint on it (together with the tenant if IDs are per tenant). The insert uses `ON CONFLICT (submission_id) DO NOTHING` (or `DO UPDATE` for last-write-wins with a version check). The response to a duplicate is the same success response.
7. **Admission control.** When the pool wait queue or event-loop lag passes a threshold, return `503` with a **jittered** `Retry-After` (for example a random value in a window that grows with load) instead of accepting work that cannot be completed. Count every `503`.
8. **nginx.** `limit_req_zone` / `limit_req` with a `burst` and `nodelay` tuned from the peak rate; `limit_conn`; `proxy_read_timeout` above the slowest legitimate request; `client_max_body_size` matched to the real payload (not a blanket 50 MB). `worker_connections` must exceed expected concurrent connections.
9. **Client.** Exponential backoff with full jitter, a cap on attempts, retry only on network errors, `429`, `502`, `503`, `504`; never retry on `4xx` validation errors; the same submission ID on every retry; disable the submit button while pending; keep the draft on the device until the server confirms.
10. **Shrink the transaction.** Do validation and serialization before `BEGIN`; no network calls inside a transaction; commit as soon as the last write is done; reply after `COMMIT`.

## 2. PgBouncer and Drizzle / driver gotchas

| Driver | Transaction pooling setting |
|---|---|
| `postgres` (postgres-js) | Pass `prepare: false`. Without it, named prepared statements are created on one server connection and fail on another ("prepared statement does not exist"). |
| `pg` (node-postgres) | Do not pass a `name` in query configs (named statements are prepared per connection). Plain parameterized `pool.query(text, values)` is safe in transaction mode. |
| Drizzle on either driver | Drizzle inherits the driver behavior above; configure the driver, not Drizzle. |

- **Session features do not work in transaction mode:** `SET` (without `SET LOCAL` inside a transaction), advisory locks held across statements, `LISTEN/NOTIFY`, temporary tables, and cursors held across transactions. Search the repo for them before recommending the pooler.
- **Newer PgBouncer versions can support protocol-level prepared statements in transaction mode** (via `max_prepared_statements`). Do not assume: **verify the installed PgBouncer version and setting** and state which you checked. If you cannot check, keep the safe driver settings above.
- Pool mode `session` gives no multiplexing benefit for a burst; confirm which mode is configured.
- Put migrations and `pg_dump` on a direct (non-pooled) connection.

## 3. Phase 2: durable Redis buffer

Use only when the gate in the plan says Phase 1 is not enough (see section 4). The goal: accept a submission durably and quickly, then write it to PostgreSQL at a rate the database can sustain, without ever losing an accepted submission.

**Design**

1. **Validate before accepting.** Run the same schema validation, auth, and tenant check as the direct path; reject bad input with `4xx` before it reaches Redis.
2. **Write path:** `XADD` the full payload (or a pointer to a durable row) to a stream. Reply `202 Accepted` with `{ submissionId, status: "received" }`. The UI shows **"received", not "saved"**.
3. **Consumer group** (`XGROUP CREATE`, `XREADGROUP`) with a **single consumer set** (a fixed, named set of worker processes). Each worker reads a batch, writes it to PostgreSQL in one transaction using `INSERT ... ON CONFLICT DO NOTHING` (chunked under the bind-parameter limit), and **only after the commit** calls `XACK`.
4. **Reclaim stuck entries** with `XAUTOCLAIM` (minimum idle time longer than the slowest normal batch) so a crashed worker's entries are retried. Because writes are idempotent, a retry is safe.
5. **No TTL on stream entries and no `MAXLEN`/`MINID` trimming of unacknowledged entries.** Delete only acknowledged entries (`XDEL`/`XTRIM` guarded so it cannot pass the oldest pending ID, checked via `XPENDING`).
6. **Dead-letter stream** for entries that fail after N attempts or fail validation at write time. The dead-letter entries are **kept**, never dropped; each has an owner, an alert (count > 0), and a runbook step (inspect, fix data or code, replay).
7. **Memory and eviction:** set `maxmemory` to the estimate in `capacity.json` plus headroom, and `maxmemory-policy noeviction`. A `noeviction` Redis rejects writes when full, which the app must turn into `503` (backpressure) **before** Redis would drop anything: monitor `used_memory` and reject new submissions above a threshold (for example 70-80% of `maxmemory`).
8. **Persistence:** AOF on, `appendfsync everysec` (loses up to about one second of accepted entries on a crash) or `always` (slower, no loss on a process crash). **State the residual risk in the plan:** with `everysec`, entries accepted in the last second can be lost if the Redis host fails, so decide with the owner whether the client's pending state (kept on the device until the server confirms *saved*) covers that gap; a replica does not remove the gap because replication is asynchronous.
9. **Availability and security:** replication or a managed Redis with failover; private network only; auth enabled; TLS if it leaves the host. The entries contain personal data: apply the same access control and retention as the primary table.
10. **Stale-read protection:** while a submission is pending the UI shows the pending data over server data, blocks auto-save of older edits over it, and uses server version numbers (compare-and-set) so a late write cannot overwrite a newer one.
11. **Backpressure:** `503` plus jittered `Retry-After` when Redis memory, stream length, or consumer lag passes thresholds.
12. **Reconciliation:** a scheduled job compares accepted submission IDs (from an accepted-IDs log or the stream history) with committed rows; any ID not committed after the expected delay raises an alert. This is the primary success measure.
13. **Kill switch:** one setting that returns all submissions to the direct Phase 1 path; the buffer is then drained by the workers before the switch is considered complete. Test it.
14. **Existing queue in the repo.** If the repo already has a queue (a table, a stream, a worker), do not design a second one: analyze the existing one against points 1-13 and list the gaps.

## 4. Decision

**Phase 1 alone is enough when all hold:**
- Peak queries/s and connections needed (from `capacity.json`, at the pessimistic transaction time) fit inside the pooler and database limits with at least 30-50% headroom.
- The required outage survival time is short enough that clients can hold their drafts and retry (the stated outage duration is the deciding input: minutes of tolerated failure with client-side retries is Phase 1; "must accept submissions while the database is down" is Phase 2).
- The staging load test at the worst-case rate and the 10-second burst keeps the `503` rate and accepted-to-committed p99 inside the gate.

**Phase 2 is required when any hold:**
- The requirement is to accept submissions during a database outage longer than clients can reasonably retry.
- The burst is much shorter than the database can absorb but much taller than it can serve at the same moment, and the database cannot be scaled.
- Per-request work is large and cannot be moved out of the request (heavy processing after submit) and a queue is the natural shape.
- Phase 1 failed the gate in staging.

## 5. Invariants (do not break)

- "Saved" appears only after the PostgreSQL commit.
- Nothing accepted into Redis is deleted, trimmed, expired, or evicted before its PostgreSQL write commits.
- Retries reuse the same submission ID and are idempotent.
- Tenant comes from the verified token, never from client input.
- Drafts stay on the device until the server confirms.
