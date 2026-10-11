# Report template for `docs/pgbouncer-redis-plan.md`

Use exactly these top-level sections, in this order, in every run. Keep the headings even when a section is "none found". Never include secrets or connection strings (env var names only).

```
# PgBouncer + Redis plan - <repo name>
Generated <date>. Read-only analysis; nothing was changed or applied.
Source data: inventory-db-operations.mjs, pool-math.mjs[, submission-dataflow-readiness output <path>]

## 1. Summary
- Risk level: Low | Medium | High (one sentence why)
- Top three actions (1-3, each with file/operation evidence)
- Biggest unknown

## 2. Inputs and assumptions
| Input | Value | Source (provided / found in repo / assumed) | Evidence |

## 3. Current state
- Pool settings per pool (file:line, max, idle, connection timeout), driver
- PM2 instances and exec mode (web vs worker)
- Worst-case connection demand vs max_connections (paste pool-math output)
- Existing Redis usage (cache, stream/worker) and PgBouncer hints

## 4. Operation classification
| file:line | route/function | table | operation | class | reason |
(class = cacheable read | hot write for buffer | must-stay-direct | fine as is)

## 5. PgBouncer plan
- Placement, pool mode, sizing (from pool-math)
- Compatibility blockers (list each with file:line, or "none found") and confirmed false positives dropped
- What bypasses PgBouncer (direct connections)
- Appendix A: draft pgbouncer.ini (placeholders for secrets; not applied)
- App-side pool changes (draft, per pool)

## 6. Redis plan
- Cache candidates: key, TTL (+jitter), invalidation trigger, evidence
- Write-buffer design: flow, ack point, retry/backoff, dead-letter, idempotency key + unique constraint, persistence, backpressure, how no data is lost and no duplicates occur on retry
- Appendix B: draft redis config for cache and buffer (not applied)

## 7. Failure scenarios and expected behavior
| Scenario | Expected behavior | User sees |
Redis down; PgBouncer down; Postgres slow; worker killed mid-job; burst above capacity

## 8. Rollout order
Numbered steps; each has: change, environment (staging first), rollback, success check. One change at a time.

## 9. How to verify
Metrics (cl_waiting, maxwait, queue depth, oldest-item age, dead-letter count, connection count) and tests to run in staging, and what must be tested before production.

## 10. Open questions and unverified items
```
