# Hard rules

- Load tests run only against the local test environment. Never staging, production, or any host not on loopback. There is no override.
- Synthetic data only. Never use a production copy or a restored backup (`drill_*` databases) as load-test data.
- Never edit `scripts/guard-load-env.js` to loosen it. If it fails, stop and tell the user why.
- Never create indexes, change schema or alter configuration outside the local test database. Never create indexes automatically. An index experiment needs the user's approval in this conversation, must record before and after plans, and must be dropped afterwards.
- `EXPLAIN ANALYZE` only for SELECT, inside a read-only transaction that is rolled back. Never for writes (plain `EXPLAIN` / `GENERIC_PLAN` only).
- Never print or store IP addresses, user ids, tokens or row contents from logs or the database. Aggregate only.
- Mark a run invalid if the load generator or the machine was saturated. Never present invalid results as application limits.
- Never state that production can handle a given load. State only local, relative findings and what remains to be verified on staging.
- Label every assumption (stated, assumed, from-log). Do not use fixed assumptions silently.
- Do not put this workflow into CLAUDE.md.
- If it is unclear whether a target or dataset is safe, stop and ask. Do not run.

## Known failure modes to prevent

- Testing against an empty or tiny database.
- Testing only the average tenant instead of the largest one.
- A load generator that is the bottleneck (dropped iterations, k6 CPU too high).
- Confusing a laptop's limits with production capacity.
- Seeding with real personal data.
- Running load against a shared environment.
- Analyzing normalized queries without parameters and calling the generic plan a real plan.
- Forgetting that `pg_stat_statements` counters include warm-up (reset before each run).
