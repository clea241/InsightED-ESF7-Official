---
name: prelaunch-readiness-check
description: "Audit a Node.js + PostgreSQL + nginx/PM2 application before production launch and produce a scored readiness checklist plus a prioritized prompt for fixing what failed. Use whenever the user asks 'is my app ready for production', 'run the pre-launch checklist', 'go-live readiness score', 'audit before launch', or wants to check for API errors, wrong database tables, security vulnerabilities, exposed endpoints, rate limiting, load balancing, deployment safety or monitoring before release, even if they don't say 'checklist'. Read-only: it reports and generates the fix prompt but does not change the app."
---

# Pre-launch readiness check

Audits a Node.js (Express-style) + PostgreSQL + nginx/PM2 app (optionally React and Redis) against a weighted catalog of 108 checks across API, DB, DATA, SEC, EXP, RATE, LB, RES, DEP, OBS and GOV. It gathers facts with a saved script, you judge each check against that evidence, and a second saved script scores the result and always writes a prioritized fix prompt. Data safety comes first: the skill starts in **safe mode** (reads local files only), and every network, database or command action is opt-in. It never changes the app.

## Workflow

1. **Start in safe mode.** Tell the user safe mode reads local files only and skips: staging probes, the database schema check, `npm audit`, `nginx -t` and the rate-limit probe (checks that depend on them will be `unknown`, which scores as a fail). Then ask, one item at a time and only for what is still missing, whether they want to opt in to each extra. The default answer to every one is **no**.
   - (a) Staging probes: needs the staging URL and the user's confirmation that it is staging, never production.
   - (b) Read-only database schema check: needs `STAGING_DATABASE_URL` pointing at a staging database with a read-only role.
   - (c) `npm audit` via the registry, or supply an existing `npm audit --json` file instead.
   - (d) `nginx -t` config test.
   - (e) Rate-limit probe (up to 30 GETs to the health endpoint; warn that it may trigger WAF or alerting on staging).
   Also ask for optional inputs: a nginx config path, a PM2 ecosystem path, and (only with staging probes) a file of GET routes the user confirms are safe to call.
2. **Create the output folder** `readiness-reports/<YYYY-MM-DD-HHMM>/` in the repo (owner-only: `mkdir -m 700`; `readiness-reports/` is git-ignored).
3. **Run `scripts/collect-evidence.js` directly** (do not write new inspection code). Safe-mode command:
   `node .claude/skills/prelaunch-readiness-check/scripts/collect-evidence.js --repo . [--nginx-conf PATH] [--pm2 PATH] [--audit-file PATH] --out readiness-reports/<timestamp>/evidence.json`
   Add opt-in flags only for what the user approved: `--probe-staging --staging-url URL --confirm-staging`, `--check-db --confirm-staging`, `--allow-npm-audit`, `--run-nginx-test`, `--probe-rate-limit`, `--safe-routes FILE`. Optional `--health-path /path` overrides the detected health endpoint. If the script refuses (exit 1), report why and do not work around it.
4. **Read `reference/checks.json`.** For **every** check, decide a status using `evidence.json`, and open the cited files when judgment is needed. Write `results.json` as an array of `{ "id", "status", "evidence", "note" }`.
   - `status` is one of `pass`, `partial`, `fail`, `na`, `unknown`.
   - `evidence` is mandatory for `pass`, `partial` and `fail` (file:line, config key, command output summary, or an `evidence.json` path). `na` needs a one-line justification in `note`. Use `unknown` when it cannot be verified (counts as a fail in scoring).
   - If an evidence section is `skipped: not opted in`, mark the dependent checks `unknown` with note "skipped in safe mode". Never guess a pass from missing evidence.
   - Documentation-type checks (runbooks, on-call, restore tests, load tests, pen tests) are `unknown` unless a file in the repo or something the user shows you proves them.
   - Never put secret values in `evidence` or `note`; cite file and line only.
5. **Run `scripts/score.js` directly:**
   `node .claude/skills/prelaunch-readiness-check/scripts/score.js --results <dir>/results.json --checks .claude/skills/prelaunch-readiness-check/reference/checks.json --out-dir <dir>`
   If validation fails, fix `results.json` and re-run. Do not edit the generated files by hand.
6. **Present to the user:** overall score, verdict, category scores, the critical blockers, the evidence-coverage note (how much of a low score is just skipped sections), and the path to `fix-prompt.md`. Offer to run the fixes only if the user asks.

## Reference

- `reference/scoring.md`: the scoring model, verdict bands and a worked example.
- `reference/checks.json`: the check catalog (IDs, severities, how to verify, how to fix).
- `reference/fix-prompt-template.md`: the template `score.js` fills.
- `rules.md`: hard constraints. Read it before the first run.

## Acceptance criteria

- `results.json` contains exactly one entry for every check ID in `checks.json`.
- Every `pass`, `partial` and `fail` cites evidence; `score.js` exits 0.
- `report.md`, `score.json` and `fix-prompt.md` all exist in the output folder.
- `fix-prompt.md` lists fixes grouped P0 -> P3 and contains the guardrails block.
- `git status` shows no changes to tracked files other than the ignored `readiness-reports/` folder.
- No opt-in action ran without its flag; `evidence.json` records which sections ran and which were skipped.
- `evidence.json` and `report.md` contain no secret values and no database row data (schema metadata only).

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using `score.js` validation, the file-existence check and `git status`, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
