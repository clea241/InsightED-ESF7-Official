# PgBouncer + Redis plan - InsightED-ESF7-Official
Generated 2026-10-15. Read-only analysis; nothing was changed or applied.
Source data: inventory-db-operations.mjs, pool-math.mjs, submission-dataflow-readiness output (`docs/plans/submission-readiness/readiness-plan.md`, `dataflow.md`, `capacity.json`).

## 1. Summary
- **Risk level: High.** Nothing in the repo proves what the production pooler or Redis is doing, and the submission queue consumer is switched off in code (see action 1), so accepted submissions are not being processed by this code.
- **Top three actions**
  1. **Resolve the disabled queue consumer before any scaling work.** `processNextJob` returns on its first line (`server/queue_worker.js:3230`), `startWorker` returns before starting (`server/queue_worker.js:3437`), and `startRedisStreamWorker` returns immediately (`server/queue_worker.js:3330`). `POST /api/submissions` still inserts a `pending` row and publishes a Redis pointer (`server/controllers/submissions/index.js:31`, `:51`), and the comment at `:62` says "Worker execution disabled per user instructions". The prod worker process (`ecosystem.esf7-prod.config.cjs:43`, `server/run_redis_worker.js`) therefore starts and does nothing. The earlier readiness plan assumed a working Postgres polling fallback; that fallback is also disabled. Confirm with the owner whether this is intentional (for example a migration freeze) and how certified submissions are being turned into normalized rows today. Everything below assumes the consumer is re-enabled.
  2. **Put PgBouncer (transaction mode) in front of the app pools and shrink them.** One process can open up to 30 connections (5 pools, `server/db/index.js:98,127,157,193,224`), about 17 in the likely prod setup. 5 PM2 processes x 17 = 85 connections plus other apps against an unknown `max_connections`. Behind PgBouncer: `default_pool_size` 20, per-process app pools of 8 (section 5).
  3. **Split Redis into a cache instance and a buffer instance.** One Redis currently serves the cache (`server/services/cacheService.js:147`, TTL keys, pub/sub invalidation) and the submission stream (`server/services/redisQueue.js:201`) with a single set of `REDIS_*` variables. A cache eviction policy could drop stream entries. Keep Redis as a job-pointer queue (the payload is already committed to Postgres first); do not buffer full payloads in Redis.
- **Biggest unknown:** database `max_connections`, DB core count, and whether PgBouncer already runs on port 6432 (inferred only from `DB_PORT` default `"6432"` at `ecosystem.esf7-prod.config.cjs:28`).

## 2. Inputs and assumptions
| Input | Value | Source | Evidence |
|---|---|---|---|
| PM2 processes (prod) | 5 (4 backend cluster + 1 worker fork) | found in repo | `ecosystem.esf7-prod.config.cjs:15,46` |
| Staging processes | 2 backend + 1 worker | found in repo | `ecosystem.esf7-staging.config.cjs` |
| Pool max per process, likely prod | 17 (primary 8 + insightEd 5 + users 4) | found in repo, inferred | `server/db/index.js:100,195,226`; prod host `127.0.0.1` makes `getProdPool` and `getStagingPool` return the primary pool (`:115,144`) |
| Pool max per process, worst case | 30 (adds staging 5 + prod 8) | found in repo | `server/db/index.js:129,159`; applies if DB host is not local |
| Pool idle / connect timeout | 10 s / 15 s | found in repo | `server/db/index.js:77-78` |
| Worker concurrency | `MAX_CONCURRENT_WORKERS = 5`, each job holds one client for the whole transaction | found in repo | `server/queue_worker.js:528,545,637,3164` |
| `max_connections` | 100 | **assumed** | not in repo |
| Other apps on the same DB | 5 connections | **assumed** | not in repo |
| DB cores | unknown (math assumes 20 parallel backends) | **assumed** | not in repo |
| Peak write rate | 30 /s (worst average 10 /s x spike 3) | assumed, from earlier plan | `capacity.json` |
| Draft-save / worker transaction time | 300 ms (draft save), unmeasured | **assumed** | not measured anywhere |
| Redis `maxmemory`, eviction, persistence | unknown | not in repo | none found |

## 3. Current state
- **Driver:** `pg` `Pool` with raw SQL (1,648 raw operations vs 12 Drizzle `sql` operations in the scan). Drizzle is used for schema and `db:studio`; almost all request code is raw `pg`, so PgBouncer compatibility is a `pg` concern, not a Drizzle one.
- **Pools** (all in `server/db/index.js`): primary max 8 (`:98`), staging max 5 (`:127`), production max 8 (`:157`), insightEd master max 5 (`:193`), users/auth max 4 (`:224`). All share `idle=10000`, `connectionTimeout=15000`, no `prepare`/named statements (none found in app code). Each pool is lazy; the primary pool is reused for the others on localhost.
- **PM2:** backend cluster x4 with `START_LOCAL_WORKER=false`, one fork worker running `server/run_redis_worker.js`. `ecosystem.config.js` uses `instances: "max"` (one process per CPU core); if that file is ever used for prod, connection demand scales with core count.
- **Worst-case demand vs `max_connections`** (pool-math, 100 assumed):
  - likely: 5 x 17 + 5 = **90 vs budget 90** (zero headroom; migrations, `psql`, backups would push it over)
  - worst: 5 x 30 + 5 = **155 vs budget 90** (overshoot by 65)
  - PgBouncer sizing at either: `default_pool_size` 20, `reserve_pool_size` 4, `min_pool_size` 5, `max_client_conn` 400 (600 for the 30-connection case), total server connections 24 + 5 other = 29.
  - Little's law at the stated peak: 30 writes/s x 0.3 s = **9** concurrent server connections (20 is enough). Even 600 writes/s at 30 ms is 18.
- **Redis today:** `ioredis`, one connection config (`server/utils/redisConfig.js`). Uses: (a) cache-aside with in-memory fallback and `SCAN`-based prefix deletes plus pub/sub invalidation (`server/services/cacheService.js:125-200`); (b) submission stream `esf7:submission_stream` with consumer group, pointer-only entries, no `MAXLEN` (`server/services/redisQueue.js:201`). The scanner's `KEYS` hit is `Map.keys()` on the in-memory cache (`cacheService.js:22`), a false positive.
- **PgBouncer hint:** `DB_PORT` defaults to 6432 in both prod processes (`ecosystem.esf7-prod.config.cjs:28,58`). Unverified.

## 4. Operation classification
Source: `inventory.json` (555 app operations). Scripts and scratch files are excluded except in section 5. Groups list every member's file:line.

| file:line | route/function | table | operation | class | reason |
|---|---|---|---|---|---|
| `server/controllers/submissions/index.js:31` | `POST /api/submissions` | `esf7_submission_queue` | insert | **hot write, already buffered in Postgres** | One row commits before `202`; Redis only carries the pointer. Needs an idempotency key (readiness plan Step 1) |
| `server/controllers/submissions/index.js:64,90,104,130` | submission status/position | `esf7_submission_queue` | select | fine as is | Per-user status; the `COUNT(*)` at `:64` is the one to watch under a burst |
| `server/controllers/schools/drafts.js:2059-2158` (tx), `:399,556,951,1006,1086,1149,1291,1405` | `PUT /api/school/draft` | `school_drafts`, `esf7_school_profile`, `esf7_personnel_*`, `esf7_regular_sections`, `esf7_workload_rows`, `esf7_perssonel_educ` | insert/upsert, one transaction | **must stay direct** (hot) | Multi-step transaction with version check (`baseVersion`, 409 on conflict) and server-verified entity counts the client reads back. Needs a synchronous answer, so not Redis-bufferable. PgBouncer transaction mode is fine because everything is inside one `BEGIN`..`COMMIT` |
| `server/controllers/workload_rows/index.js:488-575`, `:494` (xact advisory lock), `:610-866` | workload bulk save | `esf7_workload_rows`, `esf7_shs_workload_rows`, `esf7_related_task`, `esf7_personnel_profile` | delete+insert in tx | **must stay direct** | `pg_advisory_xact_lock` is transaction-scoped, so it is **compatible** with transaction pooling. Synchronous result needed |
| `server/queue_worker.js:554,574,621-3164` | `processJobById` | ~20 normalized tables | one long tx with `FOR UPDATE` | **must stay direct** (worker) | Lock and writes share one client/tx, so transaction pooling is safe; the connection is held for the whole job. Give the worker its own small pool |
| `server/services/queueClaims.js:46`, `server/queue_worker.js:3239-3242` | `pickNextPendingJob` | `esf7_submission_queue` | `FOR UPDATE SKIP LOCKED` outside a transaction | **fine as is, but dead code today** | Called with autocommit, so the row lock is released immediately; harmless only while `processNextJob` is disabled. If re-enabled, wrap claim + pick in one transaction or rely on `claimJob`'s atomic `UPDATE` (`queueClaims.js:11`) |
| `server/controllers/class_sections/index.js:270-286,483,761,878,991` | class-section lists | `esf7_*_sections`, `esf7_personnel_profile` | select | **cacheable read** (per school, short TTL) | Same result for every request for a school; invalidate on the section writes at `:550,579,659-1326` |
| `server/controllers/class_sections/index.js:550,579,610-615,659-1326` | section CRUD | `esf7_*_sections` | update/insert/delete | fine as is | Low rate, per school |
| `server/controllers/dashboard/index.js:108-231` | dashboard stats | profile, personnel, workload, sections, queue, `esf7_database*`, `unit1_school_identity` | 9 selects | **cacheable read** (already cached 5 s) | Cache exists (`:91,399`) and is invalidated by `drafts.js:2178`. Split the master-data selects (`:176-231`) into a longer TTL |
| `server/controllers/requests/index.js:56-291,524-614,751` | request lists | `schools_iern`, `unit1_school_identity`, `esf7_requests`, `esf7_personnel_profile` | select | **cacheable read** (already cached 5 s at `:98,170,220`) | Cache-aside exists; `delPattern("requests:*")` at `:654,684` is broad but fine |
| `server/controllers/requests/index.js:603,620,675,905` | request writes | `esf7_requests`, `esf7_personnel_profile`, `esf7_clustered_ghost_sync` | insert/update | fine as is | Low rate |
| `server/controllers/room_profiling/index.js:75-393` | passcode, submission rows | `esf7_passcode_lockout`, `esf7_personnel_submission` | select/insert/delete | **must stay direct** | Lockout counters need current state; already rate limited |
| `server/controllers/room_profiling/index.js:115,351,1661` | room lookups | `esf7_passcode_lockout`, `esf7_personnel_submission`, `esf7_personnel_profile` | select | **cacheable read** (already cached 3-5 s) | Keys must stay per school/room (`:327,430,1629,2406` invalidate by prefix) |
| `server/controllers/personnel/roster.js:34-73,736-744` | roster reads | workload, SHS workload, admin task, trainings, designations, deleted personnel | select | **cacheable read** (per school) | Heaviest file (54 groups); read-your-writes matters, so invalidate on roster writes (`:966-1313`) rather than relying on TTL alone |
| `server/controllers/personnel/roster.js:966-1313` | roster writes | `esf7_personnel_profile`, `_employment`, `_node_status`, `esf7_school_profile` | tx writes | **must stay direct** | Multi-step transaction |
| `server/controllers/personnel/common.js:38-93,816-846`, `personnel_learning_areas/index.js:66-79,195-208`, `requests/index.js:569-582`, `esf7_upload/index.js:107-160,364-370`, `schools/identity.js:123-295`, `reports/esf7_xlsb.js:91-138`, `reports/index.js:134,258,281-293,487-491` | master data lookups | `esf7_database`, `esf7_database_dummy`, `schools_iern`, `unit1_school_identity`, `school_calendar_terms` | select | **cacheable read** (long TTL) | Read-only reference data shared by all schools; best cache candidate |
| `server/controllers/personnel/profile.js:67-1305`, `personnel_*` controllers, `allowances`, `absences`, `overload_*`, `school_subjects`, `school_head_sdo`, `shs_workload_*`, `node_status`, `validation` | per-teacher CRUD | `esf7_personnel_*`, `overload_*`, `esf7_school_subjects`, etc. | select/insert/update/delete | fine as is | Per-user data, moderate rate; PgBouncer is the only protection needed |
| `server/controllers/validation/index.js:125` | validation submit | `esf7_submission_queue` | insert | hot write, already buffered in Postgres | Second queue insert path; give it the same idempotency key as `/api/submissions` |
| `server/controllers/auth/index.js:103,113` | login | `user_schoolhead`, `users` | select | fine as is | Identity decision; do not cache auth results |
| `server/controllers/dev_snapshot.js:20-105` | dev snapshot | ~14 tables | select | fine as is | Developer route (confirm it is not exposed in prod; not in scope here) |
| `server/controllers/workload_transfers/index.js`, `shs_workload_transfers/index.js` | transfers | `esf7_workload_transfer` | select/tx/delete | fine as is | Low rate |
| `check_local_queue.js`, `insert_test_queue.js` (repo root) | helper scripts | `esf7_personnel_submission` | select/insert | must stay direct | Not request code |

Not classified individually: 1,105 scan hits in scripts, tests and scratch files (`context: script`); they are listed in section 5 for what must connect directly.

## 5. PgBouncer plan
- **Placement:** run it on the same VM as the app (`127.0.0.1:6432`), which matches the existing `DB_HOST`/`DB_PORT` defaults. Only if prod already runs PgBouncer there should this step become "verify and tune".
- **Pool mode:** `transaction`. All request code uses `pg` `Pool.query` / `client.query` inside explicit `BEGIN`..`COMMIT`, so it fits.
- **Sizing (pool-math, `max_connections` 100 assumed):** `default_pool_size = 20`, `reserve_pool_size = 4`, `min_pool_size = 5`, `max_client_conn = 600`. If the real `max_connections` is smaller than ~45, lower `default_pool_size` first. Pool size follows what Postgres can run in parallel, not the 85-155 client connections.
- **PgBouncer needs one pool per database/user pair.** This app talks to at least three databases (main, insightEd master, users/auth) when not on localhost, so the real server-connection count is (24 x number of pairs). Re-run pool-math with `--db-user-pairs 3` once the topology is known.
- **Compatibility blockers (app code):**
  - none found in request/worker code: no session `SET`, `LISTEN/NOTIFY`, temp tables, `WITH HOLD`, or session advisory locks; no named prepared statements.
  - confirmed compatible: `pg_advisory_xact_lock` at `server/controllers/workload_rows/index.js:494` (transaction scoped); `FOR UPDATE` at `server/queue_worker.js:554,574` and `:3458` (lock and write share one client).
  - needs a code decision, not a blocker: `FOR UPDATE SKIP LOCKED` at `server/services/queueClaims.js:46` runs outside a transaction (dead code today, see section 4).
- **Dropped false positives:** `session-set` at `scratch/audit_cache_vs_normalized.cjs:18`, `scratch/detailed_cache_audit.cjs:18`, `scratch/inspect_roster_cache.cjs:18` (scratch scripts); `server/scripts/disaggregate_school_drafts.js:1585` (one-off script). `KEYS` in `cacheService.js:22` is `Map.keys()`.
- **What must connect directly to Postgres (port 5432, bypassing PgBouncer):** the one-off scripts `server/scripts/disaggregate_school_drafts.js` (session `SET`), `rebuild_regular_sections_from_drafts.js:66` and `rebuild_special_sections_from_drafts.js:79` (temp tables), the other `server/scripts/*` and `server/migrate_*.js` (e.g. `server/migrate_email_nullable.js:6`, which builds its own `Pool`), all migrations and admin work, and backups. Add a separate env var for the direct port (suggested name `DB_DIRECT_PORT`) so scripts cannot inherit 6432. Note: today scripts that read `DB_PORT` would go through PgBouncer.
- **Appendix A: draft `pgbouncer.ini` (not applied):**
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
  query_wait_timeout = 20            ; below nginx timeout (unknown), above app connectionTimeout 15 s is NOT wanted; keep < nginx
  server_idle_timeout = 600
  server_lifetime = 3600
  max_prepared_statements = 0        ; set after checking the installed version
  admin_users = <admin user>
  ```
  Verify each setting name against the installed PgBouncer version before use.
- **App-side pool changes (draft):** in `server/db/index.js`, `max` per pool behind PgBouncer: primary 8 is already right; lower insightEd to 3, users to 3, staging/prod pools to 3 each (they are idle on localhost). Target about 8 per process in total for web processes (pool-math: 8). Give the worker its own env-driven `max` (suggest 5, matching `MAX_CONCURRENT_WORKERS`). Add `PG_POOL_MAX_*` environment overrides instead of hardcoded numbers. Return 503 with `Retry-After` on pool timeout rather than 500 (currently `connectionTimeoutMillis: 15000` waits 15 s, longer than most gateways).

## 6. Redis plan
- **Cache candidates** (all already use `cacheService`; extend, do not replace):
  | Key | TTL (+/- 15% jitter) | Invalidation | Evidence |
  |---|---|---|---|
  | `master:school:<id>` (esf7_database, esf7_database_dummy, unit1_school_identity, schools_iern lookups) | 10 min | on `esf7_upload` write (`esf7_upload/index.js:397,404`) | `personnel/common.js:816-846`, `schools/identity.js:123-295`, `requests/index.js:56-104` |
  | `calendar:terms:<school>:<year>` | 5 min | on `reports/index.js:201-207` write | `reports/index.js:134,258` |
  | `sections:<school>:<year>` | 30 s | on section writes `class_sections/index.js:550-1326` | `class_sections/index.js:270-286` |
  | `dashboard:stats:<school>:*` | keep 5 s | `drafts.js:2178` | `dashboard/index.js:91,399` |
  Existing broad `delPattern` calls (`requests:*`, `room_profiling:*`, `personnel:*`) are acceptable at this size; do not widen them. Add single-flight (stampede) protection on the dashboard and master-data keys. Never cache auth (`auth/index.js`) or the passcode lockout decision beyond its current 3 s.
- **Write-buffer design (submission path only; draft saves stay direct):**
  - Flow: client sends `submissionId` (new, UUID per certify click, reused on retry) -> server inserts into `esf7_submission_queue` with `ON CONFLICT (school_id, submission_id) DO NOTHING` and **commits** -> then `XADD` a pointer -> returns `202 received`. Postgres is the source of truth; Redis is a wake-up signal.
  - Ack point: the stream entry is `XACK`ed only **after** the worker's Postgres commit (`server/queue_worker.js:3164`). The UI says "received" after the `202` and "saved" only after completion.
  - Retry / backoff: failed jobs return to `pending` with an attempt counter and exponential backoff with jitter; `recoverStaleJobs` (`queueClaims.js:25`) already returns jobs stuck in `processing` for over a minute.
  - Dead letter: after N attempts set `status = 'failed'` (exists, `queue_worker.js:3066`) and alert; add an owner and replay runbook. Never delete.
  - Idempotency: new `submission_id` column with a unique index plus `ON CONFLICT DO NOTHING`; the worker's write is already a full replace per teacher under `pg_advisory_xact_lock` in the workload path, so a re-run converges to the same data.
  - Persistence: because the payload is already in Postgres, Redis persistence is a convenience, not a safety requirement; still use AOF `everysec` on the buffer instance so pending pointers survive a restart.
  - Backpressure: reject with 503 + jittered `Retry-After` when `pending` rows or event-loop lag exceed a threshold; set a stream length cap that rejects new entries rather than trimming (no `MAXLEN` trim of unprocessed entries; `XADD` at `redisQueue.js:201` has none today, keep it that way).
  - No full payloads in Redis (the earlier estimate of ~51 GiB for 30 min at peak with 500 KB payloads is not feasible).
  - How no data is lost and none duplicated: loss is prevented because the row is committed before `202` and Redis never holds the only copy; duplicates are prevented by the unique `submission_id` and the idempotent worker write.
  - **Prerequisite:** re-enable the consumer (action 1).
- **Appendix B: draft Redis config (not applied):**
  ```conf
  # Instance A - cache (port 6379)
  maxmemory 256mb
  maxmemory-policy allkeys-lru
  appendonly no

  # Instance B - submission buffer (port 6380), private network, auth + TLS if remote
  maxmemory 512mb
  maxmemory-policy noeviction
  appendonly yes
  appendfsync everysec
  requirepass <from secrets>
  ```
  App change: separate env vars for the cache (`REDIS_CACHE_*`) and the stream (`REDIS_QUEUE_*`); `server/utils/redisConfig.js` currently reads one set. Sizes are placeholders until payload size and queue depth are measured.

## 7. Failure scenarios and expected behavior
| Scenario | Expected behavior | User sees |
|---|---|---|
| Redis down | Cache falls back to the in-memory map (`cacheService.js:132`); submissions still commit to Postgres and the pointer publish fails soft (`redisQueue.js:217`). Pending rows must be picked up by a working Postgres poller (**currently disabled**) | "Received"; processing delayed |
| PgBouncer down | App connection errors; return 503 with `Retry-After`, keep a direct-port rollback path | "Try again shortly", draft kept on device |
| Postgres slow | Pool waits hit `query_wait_timeout`/`connectionTimeout`; 503 not 500; worker concurrency (5) bounded | Slower saves, retry message |
| Worker killed mid-job | Transaction rolls back; the row stays `processing`, returns to `pending` after 1 minute (`queueClaims.js:25`); stream entry reclaimed via `XAUTOCLAIM`; re-run is idempotent | Delay, no duplicate |
| Burst above capacity | Admission control returns 503 + `Retry-After` with jitter; pending rows drain at worker speed; no payloads in Redis | "Busy, retrying" |

## 8. Rollout order
1. **Decide the disabled consumer.** Change: owner decision, then re-enable `processNextJob`/`startRedisStreamWorker` behind an env flag in staging. Env: staging. Rollback: flag off. Success: pending rows reach `completed`.
2. **Measure.** Change: none; record worker job duration, payload size, `max_connections`, `SHOW pool_mode`, Redis `maxmemory`. Env: prod read-only metrics and staging. Rollback: n/a. Success: section 2 `assumed` rows become `provided`.
3. **Make pool sizes env-driven and add 503 on pool timeout.** Env: staging. Rollback: revert env values. Success: no change at current values.
4. **Install PgBouncer in staging** (transaction mode, Appendix A) and point staging `DB_PORT` at it; scripts use `DB_DIRECT_PORT`. Rollback: point `DB_PORT` back to 5432. Success: `cl_waiting` ~0, no prepared-statement errors, tests in section 9 pass.
5. **Shrink app pools** to ~8 per process in staging. Rollback: raise `PG_POOL_MAX_*`. Success: server connections <= 29.
6. **Add `submission_id` + unique index + idempotent insert** (shared with the `validation/index.js:125` path). Env: staging. Rollback: drop the unique index (column nullable until the client ships).
7. **Split cache and buffer Redis**, then add the cache keys in section 6 one by one. Rollback: one Redis again via env vars.
8. **Production**, one step at a time, in the same order, off peak, after a backup. Each step keeps the previous config for rollback.

## 9. How to verify
- PgBouncer: `SHOW POOLS` (`cl_waiting`, `maxwait`), `SHOW STATS`, `SHOW CLIENTS`; alert on sustained `cl_waiting` > 0. Postgres `pg_stat_activity` count versus `max_connections`.
- Queue: pending depth, oldest-pending age, `processing` stuck > 1 min, `failed` count (dead letter), XPENDING, stream length.
- Tests in staging (use the `e2e-failure-path-tests` and `load-capacity-test` skills; synthetic data only): double-click certify -> one row; kill worker mid-job -> recovers; stop PgBouncer -> 503 with `Retry-After`; stop Redis -> submissions still commit; burst at 30/s and 10-second spike -> no 500s, connections below budget.
- Before production: backup restore tested, scripts proven to use the direct port, load test attached, rollback tried once in staging.

## 10. Open questions and unverified items
1. **Is the disabled queue consumer intentional** (`server/queue_worker.js:3230,3330,3437`)? How do certified submissions reach the normalized tables right now? Owner/developer.
2. Is PgBouncer already running on 6432 in prod, in which `pool_mode`? Infrastructure owner.
3. Database `max_connections`, CPU cores, and other applications using the same server (assumed 100 / unknown / 5).
4. Is the DB host `127.0.0.1` in prod (decides 17 vs 30 connections per process)? Are the insightEd and users databases on the same server?
5. Draft-save and worker transaction durations (assumed 300 ms; not measured).
6. Redis `maxmemory`, eviction, persistence, and whether it is shared with other apps.
7. nginx timeout and body limit (needed to set `query_wait_timeout`).
8. Is `server/controllers/dev_snapshot.js` reachable in production? (outside this plan's scope, noted because it reads about 14 tables.)
9. The inventory finds 1,660 operations by pattern matching; dynamic SQL and ORM calls built at runtime may be missed.
