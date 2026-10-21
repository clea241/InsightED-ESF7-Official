---
name: esf7-scale-46k-architect
description: Master agent skill for scaling InsightED eSF7 to 46,000 schools. Eliminates DB pool timeouts, lock cascades, and connection bottlenecks via PgBouncer transaction pooling, Redis read caching, write buffering, and Azure PostgreSQL hardening.
---

# 46k Schools High-Concurrency & DB Stabilization Architecture

## 1. Context & Scalability Challenge
InsightED eSF7 serves over **46,000 schools nationwide**. During national submission and updating windows:
- Thousands of School Heads and Teachers access the system simultaneously.
- Typical failure symptom: **`Error: timeout exceeded when trying to connect`** (DB Pool Timeout) and **`HTTP 504 Gateway Time-out`**.
- Root causes:
  1. Direct connections bypassing PgBouncer (connecting to `5432` direct instead of `6432`).
  2. Long-lived or abandoned transactions (`idle in transaction`) locking tables (`esf7_school_profile`, `esf7_regular_sections`, `esf7_personnel_profile`) for hours, triggering a lock cascade.
  3. Every UI click hitting PostgreSQL for static/reference data rather than Redis cache.
  4. Heavy relational multi-table writes executing directly during synchronous client HTTP requests.

---

## 2. Core Architectural Pillars

### Pillar 1: PgBouncer Port 6432 Enforcement & Transaction Pooling
- **Port Enforcement**: All application instances MUST connect to PgBouncer on **`127.0.0.1:6432`** with `sslmode=disable` (or the internal Azure PgBouncer port), NEVER direct to `stride-posgre-prod-01:5432`.
- **Pool Mode**: Ensure `pgbouncer.ini` has:
  ```ini
  pool_mode = transaction
  default_pool_size = 200
  max_client_conn = 10000
  reserve_pool_size = 25
  ```
- **Transaction Mode Rule**: In transaction pooling, connections are returned to the pool the exact millisecond a query or transaction ends. Never use session-level state, advisory locks, or long uncommitted transactions.

### Pillar 2: Database Lock Cascade Prevention (Zero Uncommitted Hangs)
1. **Azure PostgreSQL Parameter Hardening**:
   - `idle_in_transaction_session_timeout = 10000` (10 seconds hard limit): PostgreSQL automatically terminates any connection sitting idle inside an uncommitted `BEGIN...` block.
   - `lock_timeout = 5000` (5 seconds): Queries waiting on row/table locks abort immediately with an error rather than piling up connections.
   - `statement_timeout = 30000` (30 seconds): Hard upper limit on any single query execution.
2. **Application Pool Release Hygiene**:
   - Every `const client = await pool.connect()` MUST be paired with `client.release()` inside a `finally` block:
     ```javascript
     const client = await pool.connect();
     try {
       await client.query("BEGIN");
       // operations...
       await client.query("COMMIT");
     } catch (err) {
       await client.query("ROLLBACK").catch(() => {});
       throw err;
     } finally {
       client.release(); // GUARANTEED RELEASE
     }
     ```

### Pillar 3: Redis Read-Aside Caching (Shedding 90% of DB Reads)
1. **Reference Data (1-Hour TTL)**:
   - Regions, divisions, municipalities, position categories, and school profile metadata must be cached in Redis on first read:
     `KEY: ref:school:{school_id}`
2. **Auth & Token Verification (Zero DB Reads per Request)**:
   - Do NOT hit `users_database` on every API route to verify sessions.
   - Verify JWT cryptographically, or check active session in Redis: `auth:session:{uid}` with short TTL.
3. **Debounced Draft Auto-Save**:
   - Frontend auto-save debounce must be set to **30–60 seconds** minimum. Instant updates stay in browser `IndexedDB`.

### Pillar 4: Asynchronous Write Buffering (Decoupled Ingestion)
- **High-Velocity Ingestion**: For bulk workload updates or draft autosaves:
  1. API endpoint validates payload and writes to Redis queue (`XADD esf7:draft:stream` or BullMQ).
  2. Returns `200 OK { success: true, buffered: true }` in **< 5ms**.
  3. Background worker (`server/run_redis_worker.js`) drains the stream and batches relational database writes at a controlled throughput (50–100 writes/sec), protecting PostgreSQL from spike saturation.

### Pillar 5: Azure Infrastructure Sizing for 46k Schools
- **Compute**: Minimum **8 to 16 vCores** (Memory Optimized / General Purpose) during active submission periods.
- **Storage & IOPS**: Provision at least **3,000 to 5,000 IOPS** with storage auto-grow enabled.
- **Read Replica**: Route all read-only dashboard aggregations and division reporting to an Azure PostgreSQL Read Replica (`stride-posgre-replica.postgres.database.azure.com`).

---

## 3. Emergency Diagnostic Runbook

### Check 1: Detect Root Blocking Queries & Idle in Transaction
Run to identify who is holding locks:
```sql
SELECT
  blocking_locks.pid     AS blocking_pid,
  blocked_locks.pid      AS blocked_pid,
  now() - blocking_activity.query_start AS duration,
  blocking_activity.state AS blocking_state,
  blocking_activity.query AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### Check 2: Kill All Sessions Older than 2 Minutes (Emergency Lock Relief)
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid != pg_backend_pid()
  AND (
    (state != 'idle' AND (now() - query_start) > interval '2 minutes')
    OR (state = 'idle in transaction' AND (now() - state_change) > interval '10 seconds')
  );
```

### Check 3: Audit Active Connections by State & Database
```sql
SELECT datname, state, count(*)
FROM pg_stat_activity
GROUP BY datname, state
ORDER BY count(*) DESC;
```

---

## 4. Agent Checklist for Future Implementations
1. **Never write raw `pool.connect()` without `finally { client.release(); }`.**
2. **Never deploy `.env` with direct `5432` connection strings to production servers without PgBouncer verification.**
3. **Always ensure `esf7-prod` runs on official Port `5007` (never 5000).**
4. **Always deploy all folders: `client/`, `server/`, and `shared/` together.**
5. **Set and verify database timeouts in code or Azure configuration on every deployment.**
