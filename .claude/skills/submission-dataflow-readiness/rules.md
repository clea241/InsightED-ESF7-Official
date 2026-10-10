# Rules for submission-dataflow-readiness

Read this before step 2 of `SKILL.md`. These are hard constraints; they apply at every step.

## Hard rules

1. **Read-only.** Change no source file, config, schema, migration, or database. The only writes are the files in `docs/plans/submission-readiness/` (`inventory.json`, `overrides.json`, `capacity.json`, `dataflow.md`, `readiness-plan.md`).
2. **Static analysis only.** Never connect to any database, Redis, or remote server. Never run migrations, `drizzle-kit push`, `drizzle-kit generate`, seeds, or load tests. Never start the app.
3. **Secrets and personal data.** Read env var **names** only. Never open, print, or copy the values of `.env*` files, tokens, passwords, or connection strings. Redact secrets and personal data in every output; show field names and types, never real values. If a source file contains a real-looking value, do not quote it.
4. **Never invent** file paths, line numbers, routes, tables, or columns. If something cannot be found, list it under Unresolved. Every claim in the plan cites a `file:line` or a script output.
5. **State every assumption** (loads, outage duration, VM size, database tier, pooler mode). Unanswered inputs are recorded as assumptions, never invented as facts. Mark staging results as not proof for production.
6. **Do not recompute** capacity numbers by hand. Quote `capacity.json`. If an input changes, re-run `capacity-math.mjs`.
7. **Execute the saved scripts**; do not write new analysis code. If a script is wrong or incomplete, fix the script in `scripts/` (and rerun the selftest), do not patch a single output.
8. **Load tests recommended in the plan** use synthetic data only, staging only, from a separate machine. Never recommend pointing a load test at production or at a database with real personal data.

## Invariants the plan must keep

The readiness plan may change how data is buffered, but it must never propose anything that breaks these:

- "Saved" is shown to the user **only after the database commit**. Before that, show "received" (or "queued").
- Nothing accepted into Redis (or any buffer) is deleted, trimmed, expired, or evicted **before its PostgreSQL write commits**.
- Retries reuse the **same submission ID** and are idempotent (unique constraint plus `ON CONFLICT`).
- The **tenant comes from the verified token**, never from client input.
- **Drafts stay on the device** until the server confirms the save.

## Known failure modes to prevent

| Failure mode | What to do instead |
|---|---|
| Treating a heuristic route-to-query link as certain | Always show the confidence (`direct`, `one-hop`, `heuristic`, `unlinked`). Verify low-confidence links by reading the file and record the result in `overrides.json`. |
| Missing writes done through `db.execute(sql...)`, transactions (`tx.`), `client.query` on a checked-out connection, or helpers in another file | Check the `unresolved[]` list and the `unlinked-write` entries; grep the cited files for the helper. |
| Reporting PgBouncer settings that break Drizzle or `pg` prepared statements | Follow `reference/buffering-patterns.md` (postgres-js `prepare: false`; no named prepared statements with node-postgres; no session state in transaction mode). Verify the installed PgBouncer version instead of assuming. |
| Proposing Redis without memory limits, eviction policy, persistence, and a dead-letter path | Every Redis proposal must state `maxmemory`, `noeviction`, AOF setting, replication or managed service, and the dead-letter stream with an owner and runbook. |
| Ignoring the 65,535 bind-parameter limit in multi-row inserts | Chunk so `rows x columns` stays well under 65,535 and say the chunk size. |
| Generic advice not tied to the repo | Each recommendation names the route, table, or file it comes from (with `file:line`) or it is dropped. |
| Calling a value a measurement when it is arithmetic | Label estimates as estimates; label scenario transaction times as scenarios, not measurements. |
| Claiming "the diagram parses" after only a structural check | Say which check ran (`mermaid-cli` or structural only). |

## When in doubt

Report what could not be verified. A short list of honest unknowns is worth more than a confident plan built on a guess.
