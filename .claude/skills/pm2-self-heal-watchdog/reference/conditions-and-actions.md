# Conditions and actions

All thresholds are config keys under `thresholds` (defaults shown). "Debounced" = needs N consecutive checks (`failure_threshold` = 3 unless stated). All actions are capped (3 per 900 s per app) and re-check health afterwards.

| # | Condition | Signal read | Default | Action | Debounce / cap |
|---|---|---|---|---|---|
| 1 | Health times out or non-200 | HTTP GET `health_url`, `health_timeout_s` 5 | 3 consecutive | `pm2 restart` each instance, one at a time (hung: graceful reload won't work) | debounced, capped |
| 2 | Event-loop lag | `event_loop_lag_ms` field of health JSON | > 500 ms for 180 s | `pm2 reload`, staggered | sustained, capped |
| 3 | nginx 502/504 burst while PM2 says online | new lines of nginx error log containing `upstream` + app `port`/`nginx_match` | >= 10 in 60 s | `pm2 restart` (staggered) | windowed, capped |
| 4 | Missing/errored/stopped instance | `pm2 jlist` vs `expected_instances` | 3 consecutive | `pm2 start <ecosystem_file> --only <pm2_name>` | debounced, capped |
| 5a | fd near limit | `/proc/<pid>/fd` count vs soft limit in `/proc/<pid>/limits` | >= 80 % x3 | `pm2 restart <id>` for that instance | debounced, capped |
| 5b | EMFILE in app logs | `app_log_files` new lines | 3 in 60 s | `pm2 restart` staggered | windowed, capped |
| 5c | CLOSE_WAIT pile | `ss -tan` (no `-p`, no root) filtered on app port | > 500 x3 | `pm2 restart` staggered | debounced, capped |
| 6 | Leaked app-side DB pool | "timeout acquiring connection"/pool-starvation lines AND PgBouncer `SHOW POOLS` has `sv_idle` > 0 and `cl_waiting` = 0 | 3 lines in 120 s | `pm2 reload` staggered; INFO log + skip if no PgBouncer admin creds | windowed, capped |
| 7 | PgBouncer or Redis restarted | `systemctl show -p ActiveEnterTimestamp --value <unit>` changed | any change | staggered `pm2 reload` of dependent apps | one-shot per change, capped |
| 8 | Config/.env changed | sha256 of `env_files` vs stored hash | any change | `pm2 reload <app> --update-env` (restart ladder if unhealthy) | capped; hash refreshed after deploy |
| 9 | One stuck cluster instance | `pm2 jlist` per-instance CPU | one >= 90 % x3 while sibling median < 50 % | `pm2 restart <that id>` only | debounced, capped |
| 9b | ALL instances high CPU | same | all >= 90 % | **alert only** (real load) | rate-limited alert |
| 10 | Per-instance health | `instance_health_base_port + NODE_APP_INSTANCE` | 3 consecutive | ladder on that instance only; falls back to shared port, limitation noted in report | debounced, capped |
| 11 | Worker heartbeat stale | `heartbeat_file` mtime | > 120 s | `pm2 restart` worker only. Queue-age-growing variant needs an app hook (not implemented; heartbeat only) | capped |
| 12 | Stuck DB blocker | `pg_stat_activity` with `pg_blocking_pids()` via `WATCHDOG_PG_*` | DML or idle-in-tx, age > 120s, blocking >= 3 sessions, non-allowlisted | `pg_cancel_backend` -> wait 10s -> `pg_terminate_backend` if still blocking -> alert. If idle-in-tx with < 3 waiters: alert only. | capped at 2 kills / 15 min; alert dedupe |

## Postgres Blocker Kill Escalation & Safety Guardrails

When Condition 12 detects a blocking session:
1. **Eligibility Criteria (ALL must match):**
   - Active state is executing DML (`DELETE`, `UPDATE`, `INSERT`) or `idle in transaction`.
   - Age (`xact_start` or `state_change`) > 120 s.
   - Waiters count $\ge 3$ via `pg_blocking_pids()`.
   - Not on allowlist: `usename` not admin (`Administrator1`, `azure_pg_admin`), `application_name` not in allowlist (`pg_dump`, migration tools), and query not allowlisted.
   - Target PID $\neq$ `pg_backend_pid()`.
2. **Escalation Sequence:**
   - Log full query, user, age, waiter count, and pid.
   - Run `SELECT pg_cancel_backend(pid)`.
   - Wait 10 seconds.
   - Re-check if session is still alive and blocking. If still blocking, run `SELECT pg_terminate_backend(pid)`.
   - Send alert with outcome.
3. **Guardrails & Limits:**
   - Capped at 2 kills per 15 minutes. Once capped, logs warning and alerts only without signaling.
   - In `dry_run: true`, decisions are logged but no SQL cancel or terminate is ever executed.
4. **Rollback Warning:**
   - Terminating an active `DELETE` (or `UPDATE`/`INSERT`) forces PostgreSQL into transaction rollback, which must undo all written WAL records. Rollback duration can equal the query execution time, meaning table/row locks remain held after termination until the engine finishes rollback.

## Escalation ladder (per instance, health re-checked after each step)

`pm2 reload <id>` -> `pm2 restart <id>` -> after `kill_timeout_ms` + `kill_escalation_wait_s`, `kill -9 <pid>` (PM2 respawns it) -> still failing: stop, set cap, alert once, maintenance page (if approved). Hung-process conditions (1) start at `restart`. Fork mode or a single instance skips `reload` (it would be a hard restart anyway).

## Guardrails

Debounce; cap 3 restarts / 15 min, one cap alert, maintenance page; staggered one instance at a time, waiting up to `stagger_wait_s` for a passing health check; re-check health after every action; deploy-lock skip; alert-only for dependency down, disk >= 90 %, all-instances-high-CPU, empty `pm2 jlist`.

## Noise rules (learned on ESF7 staging)

- App log paths are read from `pm2 jlist` (`pm_err_log_path`) every run; never hardcode `error-<pm_id>.log` (the id changes and pm2-logrotate renames files). Offsets reset when a file shrinks.
- The nginx error log is shared by every app: only `[error]` lines whose `upstream: "http://127.0.0.1:<app port>` matches count toward the 502/504 burst.
- `log_patterns.pool` / `log_patterns.emfile` in the config override the default regexes. Check the app's real log for repeating lines before enabling a log condition; the pool-leak condition is also gated by PgBouncer `SHOW POOLS`.
- `readiness_url` (DB/Redis dependent) is alert/log only, never a restart trigger; restart decisions use a liveness `health_url` that does no DB call.
- Disk: alert at `disk_warn_pct` (90), block restarts at `disk_pct`.

## Startup grace and heartbeat rules

- `startup_grace_s` (60): an instance whose `pm_uptime` is younger than this (or any app the watchdog just acted on) is not judged for health, missing instance or heartbeat. A `pm2 reload` brings the new instance's port up late; that is not a failure.
- Heartbeat: a missing file, or a file older than the worker's process start, means "no heartbeat yet" (alert only after grace, never a restart). A heartbeat that was fresh and went stale follows `heartbeat_action`: `alert` (default, no restart) or `restart`. Keep `alert` until a restart mid-job has been reviewed for the app's queue semantics.
- `heartbeat_stale_s` must be at least 2x the longest real job; jobs only beat between jobs.
