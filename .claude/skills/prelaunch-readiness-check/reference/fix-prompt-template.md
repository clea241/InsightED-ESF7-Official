# Production-readiness fix prompt

## Role

You are fixing production-readiness gaps in this repository.

## Current state

- Readiness score: {{score}} / 100
- Verdict: {{verdict}}
- Date: {{date}}
- Check counts: {{counts}}
- {{summary_line}}

## Guardrails

- Work on staging first; production only after staging is verified.
- Take and verify a backup before any change that touches data, schema or config.
- Make one change at a time, with a rollback step for each.
- No destructive commands on production (`DROP`, `TRUNCATE`, `FLUSH*`, `pm2 delete`, `pm2 stop all`); use `pm2 reload`, and `nginx -t` then reload (never restart).
- Read-only diagnosis before any fix; report before/after numbers.
- Redact secrets in all output.
- Stop and report if a result is unexpected.
- Review the full diff before committing anything touching auth, queues or deploy code.

## Fixes by priority

### P0 — critical (release blockers)

{{p0_items}}

### P1 — high

{{p1_items}}

### P2 — medium

{{p2_items}}

### P3 — low and partially met items

{{p3_items}}

## Order of work

Fix P0 first, then P1, P2 and P3. Re-run the readiness check after each priority tier and stop if the score drops or a new critical blocker appears.

## Definition of done

Re-run the prelaunch-readiness-check skill. Target score: {{target}} or higher, with zero critical blockers.

## Final report

When finished, report:

- Files changed
- Checks fixed (IDs)
- New score versus old score
- Anything you could not verify
