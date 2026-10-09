---
name: pg-health-assessment
description: "Independent, read-only health assessment of a PostgreSQL database with a 0-100 score: checks server config (shared_buffers, work_mem, max_connections, WAL/checkpoints), the schema as defined in the ORM (Drizzle, Prisma, TypeORM, Sequelize) versus the live database, foreign-key and missing/unused/duplicate indexes, bloat, XID wraparound, long transactions, temp-file spilling, and detects bloated json/jsonb columns that should be split into typed columns or child tables. Use when the user says things like 'assess my postgres', 'is my database healthy', 'check my postgres config', 'do I have bloated jsonb columns', 'audit my drizzle schema', or 'which indexes are unused'. Always produces a prioritized fix prompt. Do NOT use for whole-application launch readiness (use prelaunch-readiness-check) or for writing/running migrations."
---

# PostgreSQL health assessment

An independent, scored, strictly read-only assessment of one PostgreSQL database: server configuration, the schema as the ORM defines it versus what really exists, indexes, maintenance health, and json/jsonb columns that have outgrown a single column. Data safety comes first: every live query runs in a `READ ONLY` transaction with timeouts, and the skill never prints row values, json values or passwords. It ends with a prioritized "how to improve" prompt; it never applies fixes.

Scripts live in `.claude/skills/pg-health-assessment/scripts/` (shown below as `$S`). All accept `--root <path>` (default: current directory), which is the folder holding `package.json` and the ORM config.

## Workflow

**Run the scripts directly; do not write new analysis code.** If a script fails on an ORM variant, fix the script in `scripts/` (the smallest durable place), then rerun.

1. **Detect the ORM.** `node $S/detect-orm.mjs --root .` prints `{ orm, schemaFiles, configFile, connectionSource, driver, poolerHints }`. If `orm` is `none`, continue with live introspection only and say so in the report.
2. **Parse the ORM schema.** `node $S/parse-orm-schema.mjs --root .` extracts tables, columns, types, PK/FK, indexes and every `json`/`jsonb` column into `pg-health-reports/.work/orm-schema.json` (text parsing only, no project code is executed).
3. **Confirm the target.** The connection string comes from the project's own config/env (the variable named in step 1; override with `--url-env NAME`). Tell the user the **host and database name (never the password)** and ask them to confirm. Prefer a replica or staging copy. Warn that a superuser or write-capable role is itself a finding (HLT-09). Proceed only after confirmation.
4. **Collect live data.** `node $S/collect-live.mjs --root . [--ram-gb N] [--storage ssd|hdd]` writes `.work/live.json`. It opens `BEGIN READ ONLY` with `statement_timeout` 5s and `lock_timeout` 1s. RAM and storage are read from `/proc/meminfo` and `/sys/block/*/queue/rotational` only when the database is local; otherwise pass the flags or those checks become "unverified".
5. **Analyze json/jsonb.** `node $S/analyze-json.mjs --root .` samples each json/jsonb column (capped rows, aggregates only) and classifies it `keep`, `watch` or `split`, writing `.work/json.json`.
6. **Assess and score.** `node $S/assess.mjs --root .` applies `reference/check-catalog.md`, computes ORM-vs-live drift and the score, and writes `.work/findings.json`.
7. **Render.** `node $S/render-report.mjs --root .` writes `pg-health-reports/pg-health-<date>.md` and `.json`, ending with the "How to improve (prompt)" section.
8. **Explain.** Read `reference/postgres-tuning.md` when explaining a finding or its fix, `reference/json-splitting.md` when writing json split recommendations, and `reference/orm-adapters.md` if the ORM is not Drizzle.

Make sure `pg-health-reports/` is listed in `.gitignore`.

Read `rules.md` before the first run; its constraints are hard rules.

## Acceptance criteria

- Every check in `reference/check-catalog.md` is either evaluated or listed as "unverified" with the reason (for example, no RAM value, no `pg_stat_statements`).
- Every finding has id, category, severity, evidence (numbers, table, column, never row values), and a concrete fix with SQL shown as text only.
- The score is computed by `assess.mjs`, not by the model, and the report states the score breakdown by category.
- Every json/jsonb column is classified `keep`, `watch`, or `split`, with the reason and the recommended split pattern for `split`.
- ORM-vs-live drift is reported (tables, columns, indexes present on only one side).
- The "how to improve" prompt section exists, lists fixes ordered critical, high, medium, low, and each item says whether it needs a maintenance window or can run `CONCURRENTLY`.
- The report contains no secrets and no JSON values.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the fixture test in `tests/run-fixture-test.sh` (it must report every expected finding) and by cross-checking each reported number against the raw output in `.work/live.json`, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
