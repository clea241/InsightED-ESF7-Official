---
name: orm-optimizer
description: "Finds performance problems in query code that uses Drizzle ORM or raw node-postgres (pg pool.query / client.query): N+1 and queries inside loops, SELECT * and select-all, missing LIMIT, per-row inserts, string-built SQL, pool size, raw_payload-style JSON columns that re-store whole request bodies already held in typed columns, and missing indexes for the WHERE/JOIN/ORDER BY columns used in my queries. Confirms each suspect with EXPLAIN (ANALYZE, BUFFERS) on a local test database and writes a ranked read-only report. Use when the user says 'find slow SQL queries in my app', 'check my pg queries for N+1 and missing indexes', 'find slow Drizzle queries', 'why is this query slow', or 'run EXPLAIN on my app's queries and rank the problems'. It analyzes query code and per-query plans only: not PostgreSQL server configuration or bloat, load tests or peak-load estimates, or API-to-database data-flow mapping."
---

# ORM optimizer

Read-only analysis of query code written with Drizzle ORM or raw node-postgres (`pool.query` / `client.query`), plus per-query plan verification on a local test database. Many apps use Drizzle only for the schema and run their queries through raw `pg`; both access layers are covered and each finding names its `access layer`. The skill scans the repo for query patterns that are usually slow, checks declared and live indexes, runs `EXPLAIN (ANALYZE, BUFFERS)` on the suspects, and writes a ranked report that separates proven problems from guesses. It never changes application code, schema, migrations, config or the database.

All scripts live in `.claude/skills/orm-optimizer/scripts/` (written `$S` below). Run them from the repo root with Node 18+. They need the `pg` package, which they resolve from the repo (`./node_modules` or `./server/node_modules`).

## Setup

The database URL comes from `DATABASE_URL` (or the env var name the user gives; pass it as the first argument to the guard and as `--env NAME` to the other scripts). The host must be `localhost`, `127.0.0.1` or `::1` and the database name must contain `test` or `local`. If the user has only `DB_HOST/DB_USER/...` variables, ask them to export a `DATABASE_URL` for the local database; never read production env files and never print the password.

## Workflow

1. Run `node $S/guard-local-db.mjs`. If it fails, stop and tell the user why. Never continue against a non-local database.
2. Run `node $S/scan-drizzle-queries.mjs [repoPath]` to list candidate query sites with file, line, pattern and a short snippet. It writes `docs/orm-optimizer/plans/candidates.md` (grouped table) and `candidates.json`. One-off scripts (tier `script`: `scripts/`, `scratch*/`, `seed*/`, `backfill*/`, `migrat*/` folders and files named `check_*`, `seed_*`, `migrate_*` and similar; the list is at the top of the scanner) are **excluded by default**, and the count of excluded hits is printed and written to `candidates.md`. Pass `--include-scripts` to list them. Use `--glob "server/controllers/**"` to narrow to a module. Read the grouped table first; one finding per group, not per call site.
3. Run `node $S/payload-columns.mjs` (needs the scan from step 2). It reads `schema.ts` JSON/JSONB columns and the raw `pg`/Drizzle write sites, and for each payload-style column (`raw_payload`, `payload`, `payload_json`, `*_data`, ...) measures on the local DB, read-only: average and max `pg_column_size` of the column vs the rest of the row, heap vs TOAST vs index size, how many top-level JSON keys have a same-named typed column (key names and byte counts only; row contents are never printed), and EXPLAIN (ANALYZE, BUFFERS) of reading the column vs a baseline. It writes `plans/payload-columns.{md,json}` and saves the plans. The scanner already lists the static hits as `duplicated-json-payload` (schema column) and `payload-write-whole-body` (write site); the verdicts come from this script.
4. Run `node $S/index-coverage.mjs` to compare `schema.ts` indexes and the live local DB indexes against the columns used in WHERE, JOIN and ORDER BY at the candidate sites, and to list unused, duplicate and redundant indexes and tables with many sequential scans. It writes `docs/orm-optimizer/plans/index-coverage.md`. Note the row counts and whether the stats are thin.
5. For each candidate worth checking, obtain the real SQL (Drizzle's `.toSQL()` or temporary local-only logging, as described in `reference/drizzle-antipatterns.md`), then run `node $S/explain-query.mjs --name <short-name> --sql "<SELECT ...>" --params '[...]'` on it. Use realistic parameter values taken from existing rows in the local test DB. Pick candidates by request-path first (controllers, services, middleware), then by table size from step 3. Skip one-off scripts unless the user asks. Anything that is not a SELECT (inserts and updates in loops) cannot be explained: it goes in "Not verified".
6. Read `reference/reading-explain.md` before interpreting any plan. Classify each finding as **Verified** (plan evidence), **Static only** (could not run it), or **Rejected** (looked bad, plan is fine).
7. Rank findings by severity (impact on the hot paths first, then table size, then frequency) (group duplicated-json-payload findings by table, with the write sites listed inside) and write `docs/orm-optimizer/report-<YYYY-MM-DD>.md` from `assets/report-template.md`. Keep its structure exactly.

**Run the scripts in `scripts/` directly.** Never regenerate or inline their logic. If a script misses something or errors, report the gap; do not write a replacement scanner. The only code you may write is a throwaway script in the scratchpad (not the repo) to print `.toSQL()`.

## Not this skill

- PostgreSQL server configuration, table or index bloat, dead tuples, a schema-versus-live health score: use `pg-health-assessment`. That skill also judges whether a JSON column's size is a bloat problem; this skill only reports, from query code plus size measurements, that a write path stores the same fields twice.
- Load tests, peak-load estimates, "how many users can it handle": use `load-capacity-test`.
- Mapping how API calls reach tables, burst-of-submissions readiness, PgBouncer or Redis buffering plans: use `submission-dataflow-readiness`.

This skill only reads query code and explains individual SELECT statements.

## References

- `reference/drizzle-antipatterns.md`: checklist of every pattern the scanner reports, how to confirm each one, the fix wording, how to capture SQL, and pool settings notes.
- `reference/reading-explain.md`: how to read the plan JSON, when a sequential scan is fine, the thresholds for Verified vs Rejected, two worked examples.
- `rules.md`: hard constraints and known failure modes. Read it before the first run.

## Duplicated JSON payload verdicts

Take the verdict from `plans/payload-columns.json`: **Verified** = at least 1,000 rows locally and at least 30% of the payload bytes sit under keys that also have a typed column; **Static only** = too few rows or the table is absent locally (state the row count); **Rejected** = the payload mostly holds data with no typed column (that is a design choice, not duplication; still mention very wide payloads in the details). Severity: High when Verified and the table has 100k+ rows or 100+ MB total; Medium for 10k+ rows; Low otherwise. Fix wording is in `reference/drizzle-antipatterns.md`.

## Severity guide

- **High:** request-path code, table above ~100k rows, plan shows a spill, a result above 10k rows, or an N+1 whose length is unbounded.
- **Medium:** request-path code with measurable but bounded cost, or a Verified problem on a mid-size table (10k to 100k rows); string-built SQL; missing pool `max`.
- **Low:** one-off scripts, small tables, redundant or unused indexes, Static only findings with no size evidence.

## Acceptance criteria

- Every finding has `file:line`, a pattern name, an evidence type (Verified / Static only / Rejected), a severity rank, and a suggested fix written as text only.
- Every Verified finding cites the plan node, estimated vs actual rows, and actual time, and links to its saved plan file; the numbers match the saved JSON.
- The report has a "Not verified" section listing anything that could not be run, with the reason.
- `git status` shows changes only under `docs/orm-optimizer/` (plus the skill folder itself when the skill is being edited).
- No query was run against a non-local database.

## Verification

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using git status, the saved plan files, and a recount of findings against the report table, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
