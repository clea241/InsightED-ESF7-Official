---
name: ci-gate
description: Runs npm ci, npm run lint, npm run build and npm test in order, collects every failure, produces a fix prompt for each, then fixes the code and re-runs until all four pass. Use whenever the user says things like 'run the CI checks', 'npm ci lint build test', 'make the build green', 'verify the build before I push', 'does lint/build/tests pass', or 'ci gate'. Do not use for Playwright/e2e tests, deploys, rollbacks, readiness scoring, security scans or load tests.
---

# ci-gate

Runs the four standard Node.js quality gates (`npm ci`, `npm run lint`, `npm run build`, `npm test`) in one deterministic pass using a saved script, gathers all failures with a structured fix prompt for each, then fixes the source code and re-runs until everything is green. Guardrails stop it from "fixing" by weakening checks.

## Workflow

1. Confirm `package.json` exists at the repo root and note `git status --porcelain` so pre-existing changes are known.
2. **Run `node .claude/skills/ci-gate/scripts/run-gate.mjs` directly** (do not write new code to run the commands). It runs all four steps in order and does not stop at the first failure. Options: `--skip-install`, `--timeout-min <n>` (default 15 per step).
3. Read the printed summary table. If all four pass, go to the final report.
4. If any step failed, read `fix-prompt.md` from the temp directory the script printed, and read `reference/fix-prompt-template.md` for how to interpret it. Treat failures after a failed `npm ci` as possibly caused by it: fix the install problem first.
5. Fix the failures at the root cause in source code. Priority: `npm ci`, then build, then lint, then test.
6. Run `node .claude/skills/ci-gate/scripts/guard-diff.mjs`. If it reports violations, undo those changes and fix properly.
7. Re-run `run-gate.mjs` (add `--skip-install` only if `npm ci` passed and `package.json`/lockfile were not modified). Always re-run all of lint, build and test, since a fix can break another step.
8. Repeat steps 4 to 7, at most **5 rounds**. Stop early and report if the same failure signature (in `report.json`) appears in two consecutive rounds, or if a fix would require something forbidden in `rules.md`.

## References

- `reference/fix-prompt-template.md`: structure of each failure entry and how to read cascading failures.
- `rules.md`: hard constraints. Read it before making any edit.

Outputs live in `<os tmpdir>/ci-gate-<repo-folder-name>/`: `report.json`, `fix-prompt.md`, one `<step>.log` per step (step names: `npm-ci`, `lint`, `build`, `test`).

## Acceptance criteria

- The latest `run-gate.mjs` run exits 0 and `report.json` shows all four steps `passed`.
- `guard-diff.mjs` exits 0 on the final diff.
- No step was reported as `missing` (a missing npm script is never counted as a pass).
- Every changed file is explained in the final report.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the exit codes and `report.json` from `run-gate.mjs` and the output of `guard-diff.mjs`, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
