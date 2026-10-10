---
name: submission-dataflow-readiness
description: "Maps how data travels from client API calls through server routes and Drizzle ORM into PostgreSQL (endpoints, payload fields, tables, columns, queries per request, save/retry behavior) and writes a read-only readiness plan for surviving a burst of simultaneous submissions (PgBouncer, batching, idempotency, durable Redis buffer, load-test design). Use when the user asks to map or visualize how data is submitted and saved, to analyze the API and Drizzle schema, to plan for N users submitting at once, whether Postgres will survive a submission burst, or how to buffer writes with Redis without losing data. Do not use to run load tests (that is load-capacity-test) or to assess Postgres config or JSON bloat (that is pg-health-assessment)."
---

# Submission data flow and burst readiness

Read-only, static analysis of a Node.js/TypeScript repo that uses Drizzle ORM (or raw SQL) on PostgreSQL. It produces two things from one set of scripts: (1) a **data-flow picture** of what the client sends, which routes receive it, which queries run, and which table and column each field lands in, and (2) a **readiness plan** for surviving a burst of simultaneous submissions (pooling, batching, idempotency, an optional durable Redis buffer, load-test design). Nothing in the analyzed repo is changed; the only writes are files in `docs/plans/submission-readiness/`.

Scripts live in `.claude/skills/submission-dataflow-readiness/scripts/` (shown as `$S`). Run them from the repo root. They need only Node 18+; `typescript` and `@mermaid-js/mermaid-cli` are used only if already installed. Execute the saved scripts; do not write new analysis code.

Read `rules.md` before step 2. It holds the hard constraints (read-only, no database or Redis connections, no secrets, the five invariants).

## Workflow

1. **Confirm inputs** with the user in one short message: expected normal and worst-case submissions per minute, the outage duration the system must survive (default 30 minutes, stated as an assumption), and the VM size, database tier and its connection limit if known. Anything unanswered is recorded as an assumption in the plan, never invented. If the user cannot answer now, continue with clearly labelled assumptions and list them in section 10 of the plan.
2. **Inventory.** Run directly: `node .claude/skills/submission-dataflow-readiness/scripts/find-write-paths.mjs . --out docs/plans/submission-readiness/inventory.json`. Do not write new analysis code. It exits non-zero if it finds no routes and no tables (wrong repo or unsupported stack): then stop and tell the user.
3. **Review `inventory.json`.** For every item in `unresolved[]` and every entry with `confidence: low`, read the cited files and record manual corrections in `docs/plans/submission-readiness/overrides.json` (schema in `reference/dataflow-analysis.md`). Also check write-method routes with zero detected writes and application-code writes with `linked: unlinked`. Dismiss an item only with a written reason.
4. **Render.** Run directly: `node .claude/skills/submission-dataflow-readiness/scripts/render-dataflow.mjs docs/plans/submission-readiness/inventory.json --overrides docs/plans/submission-readiness/overrides.json --out docs/plans/submission-readiness/dataflow.md` (omit `--overrides` if the file does not exist yet).
5. **Judgment findings.** Read `reference/dataflow-analysis.md` and add what a script cannot decide (hidden extra queries in middleware, long transactions, response-before-commit, JSON payload size, personal-data fields, client auto-save and retry risks, worker concurrency). Add them to `overrides.json` under `judgmentFindings` and re-run step 4; the renderer places them in the Findings section of `dataflow.md` so a re-render never loses them.
6. **Capacity math.** Run `node $S/capacity-math.mjs` directly with the confirmed inputs and the queries-per-submission and pool values from the inventory, writing `docs/plans/submission-readiness/capacity.json`:

   ```
   node .claude/skills/submission-dataflow-readiness/scripts/capacity-math.mjs \
     --normal-per-min <n> --worst-per-min <n> --spike-factor 3 \
     --queries-per-submission <routes[].metrics.roundTrips of the submit route> \
     --payload-bytes <typical request body bytes> \
     --instances <PM2 instances> --pool-per-instance <sum of pool max per process> \
     [--db-max-connections <n>] [--txn-ms <n>] --outage-min 30 \
     --source worstPerMin=user --source instances=inventory ... \
     --out docs/plans/submission-readiness/capacity.json
   ```

   Pass `--source name=user|inventory|default|unknown` for inputs that are not user-supplied so `capacity.json` labels them correctly. If transaction time is unknown, leave `--txn-ms` out: the script outputs 5, 20 and 50 ms *scenarios*.
7. **Write the plan.** Read `reference/readiness-plan-template.md` and `reference/buffering-patterns.md`, then write `docs/plans/submission-readiness/readiness-plan.md` following the template exactly (same ten headings). Quote numbers from `capacity.json`'s `display` values; do not recompute them by hand. Tie every recommendation to something found in the repo, with `file:line`.
8. **Hand off.** Tell the user that load testing is done by the `load-capacity-test` skill and Postgres configuration or schema review by `pg-health-assessment`. Do not perform either here.

## If the repo does not use Drizzle at runtime

The scanner falls back to raw `pool.query` / `client.query` / `db.query` / `sql` detection (it parses `INSERT INTO`, `UPDATE`, `DELETE FROM` text and `$n` parameters) and marks coverage as limited. `dataflow.md` then opens with a "Coverage is limited" notice. Keep that notice; do not claim the field-to-column table is complete. Mention it in the plan summary.

## Acceptance criteria

All must hold before reporting done:

- Every write route in `inventory.json` appears in `dataflow.md` with a sequence diagram and a queries-per-request count.
- Every table written by those routes appears in the ER diagram and in the field-to-column table; every column has a source (client field, server-derived, default, or unknown).
- Unmapped client fields and unmapped columns are listed explicitly, not dropped.
- Every claim in the plan cites a `file:line` or a script output.
- Numbers in `readiness-plan.md` match `capacity.json`.
- All Mermaid blocks parse.
- Unresolved items and owner questions are listed.
- The repo's git status shows changes only under `docs/plans/submission-readiness/`.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using `node .claude/skills/submission-dataflow-readiness/scripts/validate-outputs.mjs` (route and table coverage, Mermaid parsing, capacity-number match, git-status check) plus a manual spot check of three routes against their source files, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.

## Files

- `scripts/find-write-paths.mjs` inventory (routes, validators, Drizzle schema, writes, client calls, infrastructure signals, personal-data names)
- `scripts/render-dataflow.mjs` Mermaid diagrams, field-to-column table, rule-based findings, unresolved list
- `scripts/capacity-math.mjs` Little's-law and backlog arithmetic
- `scripts/validate-outputs.mjs` the external check described above. Mermaid parsing tries `mmdc` (mermaid-cli), then the `mermaid` package under `jsdom` (`--mermaid-dir <dir containing node_modules>` points at them), then a structural check; the PASS line says which one ran. On the first build of the skill add `--allow .claude/skills/submission-dataflow-readiness/` so the new skill folder is not reported as a stray change.
- `scripts/selftest.mjs` runs the scripts on `tests/fixture-app/` and compares with `EXPECTED.json`; run it first when the scripts change
- `reference/dataflow-analysis.md`, `reference/readiness-plan-template.md`, `reference/buffering-patterns.md`
- `rules.md` hard constraints and known failure modes
