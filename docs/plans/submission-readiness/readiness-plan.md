# Submission readiness plan: InsightED-ESF7-Official

> Static analysis only; nothing was run against a database, Redis, or server. All load inputs below are **assumptions** (`capacity.json` labels them `default`) and must be confirmed by the owner: normal 60 submissions per minute, worst case 600 per minute (roughly a 222-school division certifying inside one minute, with retries and double clicks; the 222 comes from the seed script name `server/seed_222_division_dummy_schools.js:11`, not from a stated figure), spike factor 3, outage to survive 30 minutes, typical payload 500,000 bytes (placeholder, not measured). Pool figures come from the inventory (5 PM2 processes x 17 connections). VM size, database tier, and database `max_connections` are **unknown**.

## 1. Summary and verdict

**Verdict: Ready with Phase 1.** A new durable Redis buffer is *not* the first thing to build, because the repo already has a Postgres-first outbox: the accept path commits the payload to `esf7_submission_queue` (`server/controllers/submissions/index.js:26`) and Redis only carries a job pointer with a polling fallback (`server/services/redisQueue.js:202`, `server/services/redisQueue.js:196`). An accepted submission therefore survives a Redis outage. The work to do is on idempotency, the worker's long transaction, tenant handling, admission control, and measurement.

Three biggest findings:

1. A retried or double-clicked certification creates a second queue job: the queue key is a server-side `SERIAL` and there is no client submission ID (`server/create_esf7_submission_queue_table.js:29`, `server/controllers/submissions/index.js:26`).
2. Each worker job is one transaction from `BEGIN` to `COMMIT` across about 2,400 lines of code (`server/queue_worker.js:621`, `server/queue_worker.js:3020`), with up to 5 jobs per process (`server/queue_worker.js:516`). Drain speed, not the accept path, is the bottleneck, and nothing in the repo measures job duration.
3. The school can be taken from the request body with a hardcoded fallback id (`server/controllers/submissions/index.js:12`), violating "tenant comes from the verified token".

**Primary success measure: 100% reconciliation, meaning every accepted submission ID is eventually committed in PostgreSQL.** Retry rate is secondary.

Not verified: worker job duration, payload size, PgBouncer presence and mode, nginx limits, Redis `maxmemory`/persistence, VM and database size (see section 10).

## 2. Current-state findings

**Data path.** Client `submitSchoolWorkload` posts the certified payload (`client/src/services/api.js:1127`) to `POST /api/submissions` (`server/controllers/submissions/index.js:9`): one `INSERT` into `esf7_submission_queue` (JSONB `payload`), one `SELECT` for queue position, a fire-and-forget Redis `XADD` (`server/controllers/submissions/index.js:47`), then `202` (`server/controllers/submissions/index.js:72`). A worker later claims the job (`server/services/queueClaims.js:11`) and rewrites about twenty normalized tables in one transaction. Routes, tables, and the field-to-column mapping are in `dataflow.md` Sections 3 to 5. Autosave of drafts goes through `PUT /api/school/draft` (`server/controllers/schools/index.js:920`), which carries a `baseVersion` field (optimistic version check) and writes `school_drafts`.

| Finding | Evidence | Why it matters under a burst |
|---|---|---|
| No submission ID, retries create duplicate jobs | `server/controllers/submissions/index.js:26`, `server/create_esf7_submission_queue_table.js:29` | Duplicate jobs each run the full rewrite; breaks "retries are idempotent" |
| Tenant from body with literal fallback | `server/controllers/submissions/index.js:12`, `server/controllers/workload_rows/index.js:194` | Wrong-school data; breaks the tenant invariant |
| Worker job is one very long transaction | `server/queue_worker.js:621`, `server/queue_worker.js:3020` | Holds a connection and row locks for the whole job; 5 concurrent jobs per process (`server/queue_worker.js:516`) |
| Body limit 50 MB, Node heap 1024 MB | `server/server.js:134`, `ecosystem.esf7-prod.config.cjs:35` | A few concurrent large bodies can exhaust a process |
| Rate limiter exists but is used only on auth and passcode routes | `server/middleware/rateLimiter.js:11`, `server/controllers/room_profiling/index.js:6` | Write routes have no admission control |
| Workload id built from `COUNT(*)` | `server/controllers/workload_rows/index.js:200` | Concurrent saves can generate the same id |
| Client retry has no jitter; draft retry fixed at 10 s; the submit call itself has no retry wrapper | `client/src/services/api.js:232`, `client/src/services/draftSaver.js:8`, `client/src/services/api.js:1127` | Synchronised retries after an outage; a failed submit makes the user click again, creating a duplicate job |
| PgBouncer only inferred from default port 6432 | `ecosystem.esf7-prod.config.cjs:28` | Pool mode and prepared-statement behavior unknown |
| Redis `maxmemory`, eviction policy, and persistence not in the repo | none found by the scanner | Unknown whether pointers could be evicted; Postgres fallback covers the loss |

**Capacity estimate** (from `capacity.json`; arithmetic on the assumed inputs, not measurements):

| Quantity | Value |
|---|---|
| Normal average requests per second | 1.00 |
| Worst-case average requests per second | 10.00 |
| Peak requests per second (worst x spike factor 3) | 30.00 |
| Database queries per second at peak (30 per submission, a lower bound including the 28 worker queries the scanner reached) | 900.00 |
| Connections available from pools (5 processes x 17) | 85 |
| Connections needed at 5 ms per transaction (scenario) | 0.15 |
| Connections needed at 20 ms per transaction (scenario) | 0.60 |
| Connections needed at 50 ms per transaction (scenario) | 1.50 |
| Redis backlog if full payloads were buffered for 30 min at peak (estimate) | 51498.4 MiB |
| Same, at the sustained worst-case average (estimate) | 17166.1 MiB |
| Database `max_connections` | unknown |

Reading the table: the accept path is cheap (a fraction of a connection even at 50 ms), so the burst is a worker and payload-size problem. The Redis backlog rows show that buffering full 500,000-byte payloads in Redis for 30 minutes is not feasible; keep Redis as a pointer queue (as now) or shrink the stored payload.

## 3. Risks ranked by impact

| # | Risk | Impact | Likelihood under the stated burst | Evidence | Mitigation |
|---|---|---|---|---|---|
| 1 | Wrong-school data from body tenant or literal fallback | Wrong data | Medium | `server/controllers/submissions/index.js:12` | Step 2 |
| 2 | Duplicate queue jobs from retries | Wrong data, wasted capacity | High | `server/controllers/submissions/index.js:26` | Step 1 |
| 3 | Worker transaction holds locks and a connection for the whole job | Slow drain, lock waits, pool starvation if jobs run in web processes | Medium | `server/queue_worker.js:621` | Steps 4 and 5 |
| 4 | Accepted submission lost between accept and commit | Data loss | Low today (payload committed first) but unmeasured | `server/controllers/submissions/index.js:26` | Step 6 (reconciliation) |
| 5 | Large bodies exhaust Node memory | Outage | Medium | `server/server.js:134` | Step 3 |
| 6 | No admission control on write routes | Outage, retry storm | Medium | `server/middleware/rateLimiter.js:11` | Step 3 |
| 7 | Synchronised client retries | Longer outage after recovery | Medium | `client/src/services/api.js:232` | Step 3 |
| 8 | Unknown pooler mode vs `pg` pools | Connection errors | Unknown | `ecosystem.esf7-prod.config.cjs:28` | Step 0 |
| 9 | Dead-letter path for failed jobs is only a `failed` status | Silent stuck submissions | Medium | `server/queue_worker.js:3066` | Step 6 |

## 4. Recommended architecture in two phases

**Phase 1 (no new infrastructure).** Keep Postgres-first acceptance. Add a client-generated submission ID with a unique constraint and `ON CONFLICT DO NOTHING`; take the tenant only from the verified token; add `503` plus jittered `Retry-After` admission control on the submit and save routes; reduce the body limit on those routes to the real payload size; add jitter to client retries; shorten the worker transaction (or split it per table group, keeping each group idempotent); set up the pooler explicitly. Patterns: `reference/buffering-patterns.md` section 1.

**Gate.** Phase 1 is enough if, in a staging load test at the worst-case rate and the 10-second burst: the `503` rate stays low enough that clients succeed within their retry budget, accepted-to-committed p99 is inside the target the owner sets (unknown today), reconciliation shows zero uncommitted accepted IDs, and database connections stay below the limit with at least 30% headroom. Phase 2 is triggered if the owner requires accepting submissions while PostgreSQL is down, or if the gate fails.

**Phase 2 (only if triggered).** Move acceptance to a durable buffer so the accept path does not need PostgreSQL: Redis Streams with a consumer group, `XACK` only after the PostgreSQL commit, `XAUTOCLAIM` for stuck entries (the repo already uses `XGROUP`, `XREADGROUP`, `XACK`, `XAUTOCLAIM`: `server/services/redisQueue.js:238`, `server/services/redisQueue.js:283`, `server/services/redisQueue.js:305`), `maxmemory-policy noeviction`, AOF `everysec` (residual risk: up to about one second of accepted entries lost if the Redis host fails), a replica or managed Redis on a private network with auth and TLS, a dead-letter stream with an owner and runbook, and `503` before Redis memory is full. Because full payloads would not fit (section 2), the payload must be measured and compacted first, or the outage target lowered.

**Kill switch.** A single setting on the submit route that forces the direct Postgres-first path (today `START_LOCAL_WORKER` and the Postgres polling fallback in `server/services/redisQueue.js:196` are the closest existing switches). Name the owner and test it in staging.

**Invariants.** "Saved" is shown only after the database commit (the UI should show "received" after the `202`); nothing in Redis is deleted, trimmed, expired, or evicted before its PostgreSQL write commits (no `MAXLEN` was found in the repo's `XADD` at `server/services/redisQueue.js:202`, keep it that way); retries reuse the same submission ID; tenant comes from the verified token; drafts stay on the device until the server confirms.

## 5. Phased implementation plan

**Step 0. Confirm the unknowns (no code).**
- Files affected: none. Confirm PgBouncer presence, `pool_mode`, `default_pool_size`, `max_client_conn`, database `max_connections`, nginx limits, Redis settings (section 10).
- Starting values: none until confirmed; the pools can open up to 85 connections (`capacity.json`), which must fit under the pooler and database limits.
- Tests: none. Rollback: none. Verification: answers recorded in this plan.

**Step 1. Client submission ID and unique key.**
- Files affected: `client/src/services/api.js:1127`, `server/controllers/submissions/index.js:26`, a new migration adding `submission_id` with a unique index on `esf7_submission_queue` (table created in `server/create_esf7_submission_queue_table.js:29`).
- Starting config: UUID generated once per certify action and reused on every retry; `INSERT ... ON CONFLICT (submission_id) DO NOTHING RETURNING id`, falling back to a `SELECT` of the existing job.
- Tests: duplicate POST returns the same job; double click creates one row; integration test next to `server/tests/integration/queue.integration.test.js`.
- Rollback: the column is nullable until the client ships; remove the unique index. Verification: zero duplicate `(school_id, submission_id)` rows.

**Step 2. Tenant from the token only.**
- Files affected: `server/controllers/submissions/index.js:12`, `server/controllers/workload_rows/index.js:194`, `server/controllers/workload_rows/index.js:466`.
- Starting config: reject (403) when no verified school exists; remove literal fallbacks.
- Tests: request with a body `schoolId` different from the token school is ignored or rejected. Rollback: revert the commit. Verification: grep shows no body-sourced tenant on write routes.

**Step 3. Admission control, body limits, client jitter.**
- Files affected: `server/server.js:134`, a limiter added on `POST /api/submissions` and `PUT /api/school/draft` using the existing `server/middleware/rateLimiter.js:11`, `client/src/services/api.js:232`, `client/src/services/draftSaver.js:8`, nginx config (outside the repo).
- Starting config: body limit near the measured payload plus margin (measure first), `503` with a jittered `Retry-After` when pool wait or event-loop lag passes a threshold, full jitter on the 0.5 s / 1 s / 2 s retry and on the 10 s draft retry.
- Tests: load a staging instance past the threshold and confirm `503` plus `Retry-After` and no process restart. Rollback: raise the thresholds. Verification: `503` counted, memory flat.

**Step 4. Shorten the worker transaction.**
- Files affected: `server/queue_worker.js:621` to `server/queue_worker.js:3020`.
- Starting config: split into per-table-group transactions that are each idempotent, keep `MAX_CONCURRENT_WORKERS` at its current value until job duration is measured.
- Tests: kill the worker mid-job and confirm the job recovers (`server/services/queueClaims.js:25` returns stale `processing` jobs to `pending` after one minute) and finishes with identical data. Rollback: feature flag back to the single transaction. Verification: p99 lock wait and job duration recorded.

**Step 5. Keep job processing out of web processes.**
- Files affected: `ecosystem.esf7-prod.config.cjs:23` (already `START_LOCAL_WORKER: "false"` for the backend app), `server/controllers/submissions/index.js` lines 56 to 63 (the `setImmediate` trigger).
- Starting config: confirm production and staging both set the flag; add a startup assertion log.
- Tests: with the flag unset in staging, confirm jobs run in web processes (to know the failure mode). Rollback: n/a. Verification: no `processNextJob` activity in backend process logs.

**Step 6. Reconciliation and a real dead-letter path.**
- Files affected: a scheduled job (new file under `server/scripts/`), `server/queue_worker.js:3066` (today a failed job gets `status = 'failed'` with an error message).
- Starting config: every accepted submission ID is compared with committed rows every minute during the peak window; failed jobs stay visible with an owner, an alert, and a replay runbook.
- Tests: poison payload ends in `failed` with an alert and does not block others. Rollback: disable the job. Verification: reconciliation gap is zero.

**Step 7 (only if the gate fails or the owner requires it). Phase 2 buffer** as described in section 4, after payload measurement. Files affected: `server/services/redisQueue.js`, `server/controllers/submissions/index.js`. Rollback: the kill switch.

## 6. Load-test plan

Execution belongs to the `load-capacity-test` skill; this section only designs scenarios. **Staging only, synthetic data only, from a separate load-generator machine.** Staging results do not prove production capacity.

- Scenarios: normal (60 per minute), worst case (600 per minute), a 10-second burst at the worst-case rate, and a sustained run (30 minutes at the worst-case average to expose queue growth).
- Metrics: HTTP `503` rate, p50/p95/p99 latency, accepted-to-committed p99 (from queue-table timestamps), database CPU, connections in use, queue depth and oldest-pending age, Node memory per process.
- Measure the unknowns this plan lacks: payload size distribution, worker job duration, transaction time per statement group.
- Pass criteria come from the gate in section 4 and are set with the owner.

## 7. Failure-path test plan

| Test | Setup | Action | Expected result | Evidence |
|---|---|---|---|---|
| Database down for 30 minutes | staging, synthetic submissions flowing | stop PostgreSQL for the outage duration | accept path returns `503` with `Retry-After`; clients keep drafts and retry; no accepted ID is lost; after recovery all accepted IDs commit (today the accept path needs PostgreSQL: `server/controllers/submissions/index.js:26`) | reconciliation report |
| Poison entry | one payload that always fails in the worker | submit it | job ends `failed` with an alert, others continue (`server/queue_worker.js:3066`) | dead-letter count, other jobs' timings |
| Redis restart | stream with pending pointers | restart Redis | jobs still run through the Postgres polling fallback (`server/services/redisQueue.js:196`) | no pending job older than the polling interval |
| Redis near `maxmemory` | fill Redis to the limit | submit | backpressure `503` or fallback to Postgres polling; nothing dropped | queue-table rows vs stream entries |
| Kill-switch fallback | Phase 2 enabled (if built) | flip the switch | all writes use the direct path; buffer drains | drain time |
| Reload with a pending submission | submit then reload the page | reload before the response | draft remains on the device; retry uses the same submission ID; one row | row count |
| Duplicate submission | same submission ID twice | POST twice | one queue row, same job returned | row count |

## 8. Monitoring, reconciliation, and canary rollout

- Alerts: queue depth, oldest pending job age, `failed` job count (dead-letter equivalent), `503` rate, database connections, pool wait time, process memory against `max_memory_restart` (`ecosystem.esf7-prod.config.cjs:34`).
- **Continuous reconciliation (primary success measure):** every accepted submission ID is matched against a committed row on a schedule; any gap pages the owner.
- Canary: enable the new submission ID and admission control for a small share of schools first; watch `503` rate, duplicate-job count, and accepted-to-committed p99 at each step; roll back on any reconciliation gap.

## 9. Peak-day readiness checklist

- [ ] Backups verified and a restore tested.
- [ ] Kill switch tested in staging within the last week.
- [ ] Pooler mode, pool sizes, and database `max_connections` confirmed against the 85-connection ceiling.
- [ ] `START_LOCAL_WORKER` is `false` on every web process.
- [ ] Body limit, rate limiter, and nginx limits confirmed.
- [ ] Reconciliation job running and alert contacts current.
- [ ] Disk space and Redis memory headroom checked.
- [ ] Load-test result (staging, synthetic) attached to the change.
- [ ] On-call owner named for the peak window.

## 10. Open questions for the owner

1. What are the real normal and worst-case submissions per minute (the plan assumes 60 and 600), and over what window do schools certify? Owner of the roll-out.
2. How long must the system accept submissions during a database outage (assumed 30 minutes)? Product owner.
3. What is the typical and largest certified payload size in bytes (assumed 500,000)? Can be read from `esf7_submission_queue` by the database owner.
4. VM size, database tier, and database `max_connections`? Infrastructure owner.
5. Is PgBouncer running on port 6432, in which `pool_mode`, with what pool sizes (`ecosystem.esf7-prod.config.cjs:28`)? Infrastructure owner.
6. Which nginx rate and body-size limits apply (none found in the repo)? Infrastructure owner.
7. Redis deployment, `maxmemory`, eviction policy, and persistence settings? Infrastructure owner.
8. How long does one worker job take for the largest school (not measurable statically)? Developer, in staging.
9. Which application writes listed as unlinked or dynamic in `dataflow.md` Section 8 run on every submission? Developer.
