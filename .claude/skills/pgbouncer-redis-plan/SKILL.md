---
name: pgbouncer-redis-plan
description: Reads the app's Drizzle ORM code and API database operations, then produces a read-only plan for using PgBouncer and Redis (read cache plus durable write buffer) so PostgreSQL does not crash under bursts. Use when the user asks how PgBouncer and Redis should protect Postgres, wants connection pool sizing, Redis caching or write buffering planned from their actual code, or says 'pgbouncer redis plan'. Do not use for slow-query tuning, Postgres config assessment, load tests, or data-flow mapping alone.
---

# PgBouncer + Redis plan

This skill reads the repo's database code (Drizzle ORM, or raw `pg` queries behind Drizzle schemas), the pool setup, PM2 settings and any Redis usage, then writes one report that says how PgBouncer (connection pooling) and Redis (read cache plus a durable write buffer) should protect PostgreSQL during bursts. It is **read-only**: it analyzes, calculates and recommends. It never installs, configures, starts or stops PgBouncer or Redis, never connects to a database, and changes only `docs/pgbouncer-redis-plan.md`.

## Workflow

1. Read `rules.md` first.
2. Look for output of the `submission-dataflow-readiness` skill (for example `docs/plans/submission-readiness/` containing `inventory.json`, `dataflow.md`, `readiness-plan.md`). If present, read it and reuse its routes, tables and write counts instead of re-mapping. Cite it in the report.
3. **Run `node .claude/skills/pgbouncer-redis-plan/scripts/inventory-db-operations.mjs`** (do not write new code for this). It lists every database operation by file, line, table and enclosing route/function, the pool configuration, features incompatible with transaction pooling, Redis usage and PM2 settings. Full data is in `inventory.json` in the OS temp folder (path printed by the script).
4. Read the inventory, then open the flagged files to confirm each finding. The script finds candidates; you verify. Expect false positives (strings in scratch files, `SET` inside SQL text that is not a session SET) and drop them with a stated reason.
5. Gather numbers: PM2 instance count (ecosystem file), pool `max` per process (all pools a process opens, not just one), other apps sharing the database, `max_connections`, DB CPU cores if known. `max_connections` comes only from user-supplied values or local test config. If numbers are unknown, ask the user once for all missing numbers together; otherwise mark them `assumed`.
6. **Run `node .claude/skills/pgbouncer-redis-plan/scripts/pool-math.mjs`** with those numbers, for example:
   `--instances 4 --pool-max 25 --max-connections 100 --other-apps 5 --found instances,pool-max --peak-concurrent-writes 2000 --avg-tx-ms 30`
   Use `--found a,b` for values read from the repo and `--assumed a,b` for guesses so the output labels each input. Where a process opens several pools (primary, staging, master), sum their `max` for `--pool-max`, and say so.
7. Classify each database operation using `reference/redis-practices.md` (operation classification guide): cacheable read, hot write suited to the buffer, must-stay-direct (migrations, advisory locks, LISTEN/NOTIFY, long transactions), or fine as is. Group repetitive operations by route/file but keep file:line evidence for each group member. Skip one-off scripts (`context: "script"`) except to list them under "must stay direct".
8. Write `docs/pgbouncer-redis-plan.md` following `reference/report-template.md` exactly, applying `reference/pgbouncer-practices.md` and `reference/redis-practices.md`. Also state what already exists (for example a Redis stream worker, or a DB port suggesting PgBouncer is already present) and recommend extending it rather than replacing it.
9. Present in chat the top three actions, the biggest risk, and the report path.

## References

- `rules.md` - hard rules and known failure modes (read first).
- `reference/pgbouncer-practices.md` - pooling mode, sizing, compatibility, placement, monitoring.
- `reference/redis-practices.md` - cache vs. durable buffer, idempotency, backpressure, operation classification.
- `reference/report-template.md` - exact report structure.
- `scripts/inventory-db-operations.mjs`, `scripts/pool-math.mjs` - deterministic scans and math; run them, do not rewrite them. If a script is wrong, fix the script (smallest durable place), then re-run.

## Acceptance criteria

- Every Drizzle write and every read on a hot route in the inventory is classified and appears in the report with file path and line (groups are fine if each member's file:line is listed).
- Pool math is shown with all inputs, marking each as `provided`, `found in repo` or `assumed`.
- The report names which operations are incompatible with transaction pooling (or states none were found) and what must connect directly to Postgres.
- The buffer design states how it guarantees no data loss and no duplicates on retry.
- No file in the repo was changed except `docs/pgbouncer-redis-plan.md`.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the inventory output, the `pool-math.mjs` output and a check of `git status`, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
