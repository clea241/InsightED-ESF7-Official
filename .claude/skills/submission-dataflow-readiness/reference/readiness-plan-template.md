# Template for `readiness-plan.md`

Write the plan with **exactly these ten `##` headings, in this order** (the validator compares them). Adapt the text to the repo; never change the structure. Quote numbers from `capacity.json` (its `display` values) without recomputing. Every claim cites a `file:line` or a script output (`inventory.json`, `capacity.json`). Do not paste personal data or secrets.

Primary success measure (state it in section 1 and section 8): **100% reconciliation: every accepted submission ID is eventually committed in PostgreSQL.** Retry rate is a secondary measure.

---

# Submission readiness plan: <repo name>

> Static analysis only. Inputs: <normal and worst-case submissions per minute, outage duration, VM, database tier>. Each input is marked `user`, `inventory`, `default`, or `unknown` in `capacity.json`.

## 1. Summary and verdict

- Verdict in one of three forms: **Ready as is**, **Ready with Phase 1**, or **Needs Phase 2 before the peak day**, with the one-sentence reason.
- The three biggest findings (each with `file:line`).
- Primary success measure: 100% reconciliation (every accepted submission ID committed). Retry rate is secondary.
- What this plan could not verify (list).

## 2. Current-state findings

- Data path in two or three sentences, pointing to `dataflow.md` sections (routes, tables, field-to-column table).
- Findings table: finding | evidence (`file:line`) | why it matters under a burst. Use the rule-based and judgment findings from `dataflow.md` Section 7; do not repeat all of them, keep the ones that change the plan.
- **Capacity estimate** (a table copied from `capacity.json`): normal and worst average requests/s, peak requests/s, queries/s at peak, connections available from pools, connections needed at each transaction-time scenario (5, 20, 50 ms, or the supplied value, labelled *scenario, not a measurement*), Redis backlog estimate in MiB for the outage duration (labelled *estimate*). State database `max_connections` or write "unknown".

## 3. Risks ranked by impact

A table ranked 1..N: risk | impact (data loss, wrong data, outage, slow) | likelihood under the stated burst | evidence | mitigation (link to a step in section 5). Rank data-loss and wrong-tenant risks above latency.

## 4. Recommended architecture in two phases

- **Phase 1 (no new infrastructure):** the smallest set of changes that removes the top risks (pooler settings, pool sizes, batching, idempotency, admission control, client backoff). Pull the patterns from `buffering-patterns.md`.
- **Gate:** the measurable condition under which Phase 1 is enough (for example: load test at the worst-case rate keeps 503 rate below X and accepted-to-committed p99 below Y with zero lost IDs) and the condition that triggers Phase 2.
- **Phase 2 (durable buffer):** only if the gate fails or the outage duration cannot be survived by Phase 1. State Redis memory limit, `noeviction`, AOF setting, replication or managed service, dead-letter path, and the residual risk.
- **Kill switch:** the single setting that sends all writes back to the direct path, who can flip it, and how to verify it worked.
- Restate the invariants from `rules.md` and show where each is enforced in the design.

## 5. Phased implementation plan

For each step, use this shape:

| Field | Content |
|---|---|
| Step | short name |
| Files affected | exact paths (from the inventory) |
| Starting config values | with the arithmetic reference to `capacity.json` |
| Tests | unit, integration, failure-path |
| Rollback | exact way back |
| Verification | the observable that proves it works |

Order: measurement and idempotency first, then pooling, then batching, then admission control, then (only if the gate says so) the durable buffer, then the kill switch drill.

## 6. Load-test plan

Staging only, synthetic data only, generated from a **separate machine**. Execution belongs to the `load-capacity-test` skill; this section only designs the scenarios.

- Scenarios: normal, worst-case, a 10-second burst at the worst-case rate, and a sustained run.
- Metrics: HTTP 503 rate, p50/p95/p99 latency, accepted-to-committed p99, database CPU, connections in use, queue depth (if a buffer exists), Node memory.
- Pass criteria taken from the gate in section 4.
- State that staging results do not prove production capacity.

## 7. Failure-path test plan

Each test: setup | action | expected result | evidence to capture.

- Database down for the full outage duration (accepted submissions must survive and drain afterwards with zero loss).
- Poison entry (a payload that always fails): must go to the dead-letter path with an alert, without blocking the queue.
- Redis restart (entries must survive according to the AOF setting; state the residual risk).
- Redis near `maxmemory` (backpressure with `503` before anything is dropped).
- Kill-switch fallback to direct writes.
- Reload or navigate away while a submission is pending (the draft stays on the device until the server confirms).
- Duplicate submission with the same ID (one row).

## 8. Monitoring, reconciliation, and canary rollout

- Alerts (queue depth, oldest-entry age, dead-letter count, 503 rate, database connections, pool wait time).
- **Continuous reconciliation:** compare accepted submission IDs with committed rows on a schedule; any gap pages the owner. This is the primary success measure.
- Canary: percentage steps, what is watched at each step, and the rollback trigger.

## 9. Peak-day readiness checklist

A short checklist of yes/no items to confirm in the 24 hours before the peak (backups verified, kill switch tested, alert contacts, pool and pooler settings, disk space, Redis memory, on-call owner, load-test result attached).

## 10. Open questions for the owner

Numbered questions, taken from `dataflow.md` Section 8 and from every `unknown` input in `capacity.json`. Each question names who can answer it.
