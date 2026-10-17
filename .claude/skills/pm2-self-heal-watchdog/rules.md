# Hard rules

1. **Staging first.** Do not install, enable, or change anything on the production VM until the user approves. The first live run on any VM is `dry_run: true`.
2. **Never auto-restart** when Postgres, Redis, or PgBouncer is down, on disk-full, or when ALL instances of an app show high CPU together (legitimate load). Alert instead and let the app's retry logic recover (avoids a thundering herd).
3. **Never fire on a single failed check.** Always debounce.
4. **Never exceed the cap:** max 3 auto-restarts per app per 15 minutes by default. After the cap: stop, alert once, show the maintenance page (only if that mechanism is approved and `nginx -t` passes). Only `watchdog.py --reset <app>` clears it.
5. **Skip all actions while the deploy lock exists.** While it exists, refresh the stored file hashes without acting so no extra reload follows the deploy.
6. **Never auto-run `pg_terminate_backend` (narrow approved exception for stuck blockers only).** Stuck transactions without waiters are alerted for human review.
   **Approved Blocker Kill Exception:** The watchdog may cancel/terminate a blocking session ONLY when ALL criteria are satisfied:
   - (a) The session is executing DML (`DELETE`, `UPDATE`, `INSERT`) or is `idle in transaction`.
   - (b) Session age (`xact_start` or `state_change`) is older than 2 minutes (120 s).
   - (c) The session is actively blocking $\ge 3$ other sessions according to `pg_blocking_pids()`.
   - (d) The session is NOT on the allowlist (`pg_dump`, migration tools, the admin user, and configured `application_names`).
   - (e) Never target the watchdog's own backend (`pg_backend_pid()`).
   - (f) Execution order: Log full query, user, age, waiter count, and pid $\to$ `pg_cancel_backend(pid)` $\to$ wait 10 seconds $\to$ if still blocking, `pg_terminate_backend(pid)` $\to$ send alert.
   - (g) Rate limit: Strict cap of 2 kills per 15 minutes; once reached, alert only.
   - (h) Never act when `dry_run: true` (log only).
7. **Never add a blanket `cron_restart`.** If used for a known leak, flag it clearly in the report.
8. **Smallest edits only.** Never rewrite the whole deploy script, nginx.conf, or other apps' PM2 entries on the shared VM; list every touched file. There is ONE shared nginx.conf, so any nginx change affects all servers: require explicit approval and run `nginx -t` before any reload.
9. **Never print, log, or commit secrets** (alert tokens, PgBouncer admin password). They live in `/etc/pm2-watchdog/watchdog.env` (mode 600) only. Do not log exception text from alert delivery (URLs can carry tokens).
10. **Every threshold lives in the config file or env vars**, never hardcoded.

## Known failure modes to prevent

- Restart loops hiding the real bug -> cooldown cap, then escalate to alert.
- `pm2 reload` in fork mode or with one instance behaves like a hard restart and drops requests -> check mode before promising zero downtime (the ladder skips the reload step there).
- A hung process ignores SIGINT so `pm2 restart` stalls -> escalation ladder ends in `kill -9`.
- One pegged cluster worker hidden behind a shared-port health check -> per-instance CPU and per-instance health port.
- A stalled queue worker with no HTTP route goes unnoticed -> heartbeat file/key.
- The watchdog fights a deploy, or reloads right after one because the stored env hash was stale -> deploy lock + `--record-hashes`.
- The watchdog runs as the wrong user and sees an empty `pm2 jlist` -> it must run as the PM2 daemon's owner with the right `PM2_HOME`; an empty jlist makes it skip all actions and alert.
