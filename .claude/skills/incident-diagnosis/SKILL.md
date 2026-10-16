---
name: incident-diagnosis
description: "Quick read-only production triage: reads the PM2 logs (and nginx error logs if needed) around the time a problem started, finds the errors, and recommends fixes. Use whenever the user says 'something broke in production', 'users get 504 / cannot log in', 'investigate this error spike', 'check the pm2 logs', or 'why is production failing'. Never changes production: no restarts, no fixes, no writes. Do not use for load tests, security scans, deploys, or backup drills."
---

# Incident diagnosis (simple)

Read the PM2 logs, find the errors, recommend fixes. Read-only: never restart, fix, restore or deploy anything. The user applies the fix through the normal deploy process.

## Steps

1. **Intake.** Ask only what is missing: what users see, when it started (with timezone), what changed recently (deploy, config, migration, Redis/DB restart), how many users/schools are affected.
2. **Get the logs.** Prefer the safe gateway. Setup once: copy `.env.incident.example` to `.env.incident` and fill it in; `incident/allowed-remote-commands.json` is the allowlist (the user edits it, never the agent).
   - `node .claude/skills/incident-diagnosis/scripts/guard-incident-env.js --mode investigate --incident <id>`; if it fails, stop and report why.
   - `bash .claude/skills/incident-diagnosis/scripts/remote-readonly.sh --incident <id> -- pm2 jlist` (process status, restart counts, uptime)
   - `... -- pm2 logs --nostream --lines 500` (add an app name to narrow it down)
   - If the 504 comes from nginx, also `grep`/`tail` the nginx error log (path must be under `LOG_PATHS`).
   - If there is no SSH setup, ask the user to paste the output of those commands instead.
3. **Find the errors.** Focus on the window from just before the start time. Look for: the first error and what preceded it; repeated stack traces; crashes and restart loops (`pm2 jlist` restart count, short uptime); timeouts; DB errors (too many connections, lock waits, query timeouts); Redis errors; out-of-memory; auth/login route errors; upstream timeouts in nginx (504 means the backend did not answer in time).
4. **Recommend fixes.** List the likely causes, ranked, each with the log lines that support it (redacted), what would confirm it, the suggested fix, and a rollback. Say plainly which are confirmed, probable or unknown, and what could not be verified. Offer a short holding message for users if the outage is ongoing.

## Rules
- Read-only. Never run a command that changes state, and never run a fix. Containment (rollback, pause worker, maintenance page) is only listed as options for the user to decide.
- Redact names, emails, phone numbers, IPs, tokens and secrets in everything written or shown. Use internal ids and counts only.
- Keep any saved notes in `incident/<id>/` (gitignored). Do not commit evidence.
- Stop and report if a result is unexpected rather than guessing.
- Suggested fixes should say: test on staging first, take a backup first, one change at a time, with a rollback.
