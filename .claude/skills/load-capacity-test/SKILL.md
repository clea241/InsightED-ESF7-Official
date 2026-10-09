---
name: load-capacity-test
description: "Estimates expected peak load, runs k6 load tests (baseline, peak, spike, stress ramp) against the local test environment with synthetic data, samples CPU, memory, event loop and database connections, and analyzes the slowest queries on the largest tenant with EXPLAIN (ANALYZE, BUFFERS). Reports the first bottleneck and relative headroom. Use whenever the user says 'run a load test', 'how many users can my app handle', 'estimate our peak load', 'find slow queries on the biggest school', 'check the database under load', or 'will it hold up on deadline day'. Local test environment only; never staging or production. Do not use for security scans, failure-path e2e tests, deploys, backup drills, or readiness scoring."
---

# Load capacity test

Find the first thing that breaks, and which queries cause it, before real users do. The skill estimates a peak from numbers the user supplies, runs repeatable k6 scenarios against a **local, disposable** copy of the app with synthetic data at realistic size, samples the machine and PostgreSQL while it runs, and analyzes the slowest queries on the largest tenant. Results are local and relative; they never state what production can handle.

All scripts are in `.claude/skills/load-capacity-test/scripts/` (shown as `$S`). Run them from the repo root. Execute the saved scripts; do not write new runner code.

## Workflow

1. Run `node $S/guard-load-env.js`. If it fails, stop and report why. Do not work around it or edit it.
2. If `load-test/load-model.json` does not exist or is stale, ask the user for the inputs in `reference/capacity-model.md` (no more than three questions at a time): number of schools and users, how many are active at the busiest time, what happens on the busiest day (for example deadline day), and typical actions per active user per minute, including save bursts. Start from `load-test/load-model.example.json`. Label every number `stated`, `assumed` or `from-log`. If the user can export a local nginx access log, pass it to the estimator so the endpoint mix comes from real traffic.
3. Run `node $S/estimate-peak.js [--access-log <path>]` to produce the scenarios (baseline, estimated peak, spike, stress ramp; soak only with `--soak`) with arrival rates and a safety factor, and write them into the model file.
4. Run `node $S/check-data-volume.js`. If the local test database is smaller than the model's largest-tenant target, run `node load-test/seed-large.js` (synthetic data only), then check again. Do not proceed on a tiny database; results would be meaningless.
5. Run `bash $S/run-load.sh --scenario <name>` for each scenario in order: baseline, peak, spike, stress. Run `--scenario soak` only if the user explicitly asked for a soak test. The script starts the app in production mode locally, starts resource sampling, runs k6 from `load-test/k6/`, and tears everything down. Exit code 3 means the run is invalid (machine or generator saturated): repeat it, do not report it as an application limit.
6. Run `node $S/db-analysis.js` right after the peak run to read the slowest statements recorded during the load and analyze them on the largest tenant. For real (not generic) plans, write parameter values for the heaviest statements into `load-test/query-params.json` (synthetic values of the largest tenant) and rerun.
7. Run `node $S/build-load-report.js` to write `load-test/reports/<timestamp>-load-report.md`, update `load-test/history.json`, and compare with the previous run.
8. Read `reference/load-checklist.md` and `reference/db-analysis-guide.md` and add the findings they describe to the report (for example pool size versus `max_connections`, sequential scans on large tables, functions or casts that bypass indexes, unpaginated payloads, workers in every web process).

`rules.md` contains hard constraints; they apply at every step. Read it before the first run. Read `reference/k6-patterns.md` only when a k6 script needs to change.

## Acceptance criteria

- The guard passed before the app started or any load was generated.
- Every number in the load model is labelled stated or assumed, and the report lists the assumptions.
- The local database met the largest-tenant volume target before the runs.
- The load generator was not the bottleneck: no dropped iterations and generator CPU below the configured limit, or the run is marked invalid and repeated.
- Each scenario has p50, p95, p99, error rate and throughput, compared with thresholds from the model, and the first bottleneck is named with evidence (for example pool saturation, CPU, event loop lag, a specific query).
- The database analysis lists the top queries by total time, each with its plan summary (scan type, rows, buffers, sort or hash spills), and states whether the query was analyzed with real parameters or only a generic plan.
- The report states that results are local and relative, lists what could not be verified locally (nginx, gateway and CDN timeouts, production hardware), and makes no claim about production capacity.
- No schema change, index creation or data change was made outside the test database and the synthetic data generator.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the k6 results, the resource samples, the database analysis output and the generator health checks, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
