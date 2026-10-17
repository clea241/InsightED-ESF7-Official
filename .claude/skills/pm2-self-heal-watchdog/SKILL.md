---
name: pm2-self-heal-watchdog
description: "Install an automated self-healing watchdog for PM2 apps on the shared VM: PM2 built-in restart settings plus a systemd-timer Python watchdog that restarts or reloads hung, stuck, leaking, or wedged processes (failed health checks, event-loop lag, one runaway cluster worker, stalled queue worker, 502/504 bursts, fd/CLOSE_WAIT exhaustion, leaked DB pool, restarted PgBouncer/Redis, changed .env) with debounce, cooldown caps, deploy-lock skip, dependency-down protection, escalation to kill -9, logging, and alerts. Use whenever the user says 'make the VM heal itself', 'auto restart pm2', 'pm2 watchdog', 'restart when health check fails', 'a process is stuck and causing a bottleneck', or wants the VM to protect itself, even without saying 'skill'. Not for investigating an incident (incident-diagnosis), writing deploy scripts (vm-deploy-script), or tuning PgBouncer (pgbouncer-stress-optimize)."
---

# PM2 self-heal watchdog

Removes the manual "SSH in and `pm2 restart` it" cycle. Part 1 sets sensible PM2 built-in options in the ecosystem files. Part 2 installs an external Python watchdog (stdlib only, run every 30 s by a systemd timer) that detects hung, stuck, leaking or wedged processes and restarts or reloads them safely: debounced, capped, deploy-lock aware, blocked when a dependency is down, escalating reload -> restart -> `kill -9`, with logs and alerts. It never fights a deploy and never creates a restart loop or thundering herd.

Hard constraints are in [rules.md](rules.md). Read it first.

## Workflow

0. **Safety.** Confirm the target is **staging** unless the user explicitly approves production. Nothing is installed on production until approved. Discovery is read-only. The first live run on any VM is `dry_run: true`.
1. **Discover** (repo + VM over ssh, read-only). Confirm actual names and paths; assume nothing:
   ecosystem file(s), PM2 app names, instance counts, cluster vs fork, health routes, ports, **who owns the PM2 daemon and its PM2_HOME**, nginx config and error-log paths, whether a maintenance mechanism already exists ([reference/nginx-maintenance.md](reference/nginx-maintenance.md)), service names for PgBouncer, Redis and Postgres, deploy scripts, existing alert channel (Telegram/Slack/email), total RAM, CPU count, `ulimit -n`, existing logrotate and pm2-logrotate, whether `pm2 startup` is configured.
2. **PM2 built-in settings (Part 1).** Update every app's ecosystem entry using [reference/pm2-settings.md](reference/pm2-settings.md). Smallest edit; touch only this app's entries; list every touched file.
3. **App hooks.** Apply only the minimal hooks from [reference/app-hooks.md](reference/app-hooks.md). Show each diff to the user. Skip any hook that does not apply or already exists.
4. **Generate `config.json` and `watchdog.env`** from `assets/watchdog.config.example.json` and `assets/watchdog.env.example`, filled with the discovered values. Keep them out of git (the env file especially).
5. **Deploy-lock hook.** In the existing deploy script(s), add lock create/remove in try/finally using that script's conventions (lock path = `paths.deploy_lock`), and call `watchdog.py --record-hashes` after a successful deploy. Do not rewrite the script.
6. **Test.** Tier 1 (hermetic) and tier 2 (staging) via `scripts/simulate_failures.py`.
7. **Install on the VM** with `scripts/install_watchdog.py` (dry-run by default; `--apply` only after approval), with `dry_run: true` in the config so the watchdog only logs what it would do. Flip to live after the user reviews a day of logs.
8. **Report** using [reference/report-template.md](reference/report-template.md), including how to disable it in an emergency.

## Run the saved scripts; do not write new code

Execute `scripts/watchdog.py`, `scripts/install_watchdog.py`, `scripts/simulate_failures.py` and `scripts/emergency_disable.sh` directly. If deterministic behavior is wrong, fix it **in those scripts** (and re-run the tests), never in a one-off copy. On Windows run them with `py` under PowerShell.

References: exact condition table and thresholds -> [reference/conditions-and-actions.md](reference/conditions-and-actions.md); ecosystem values -> [reference/pm2-settings.md](reference/pm2-settings.md); Node snippets -> [reference/app-hooks.md](reference/app-hooks.md); **read [reference/nginx-maintenance.md](reference/nginx-maintenance.md) before touching nginx**.

```powershell
py scripts\simulate_failures.py                       # tier 1, hermetic (add --only "text" for one case)
py scripts\install_watchdog.py --host H --user U --key K --config cfg.json --env-file w.env          # dry-run
py scripts\install_watchdog.py --host H --user U --key K --config cfg.json --env-file w.env --apply  # after approval
```
Tier 2 (on the staging VM only): `python3 simulate_failures.py --tier2 --staging-host H --i-am-on-staging --config /etc/pm2-watchdog/config.json --pm2-name <app>`.
On the VM: `watchdog.py --status`, `--reset <app>`, `--record-hashes`, `--dry-run`.

## Acceptance criteria

- Every condition in `reference/conditions-and-actions.md` has a passing simulated test, or is listed as "not implementable" with the missing app hook named.
- A simulated restart loop is stopped by the cap (max 3 auto-restarts per app per 15 minutes) and produces exactly one alert plus the maintenance page step (if approved).
- No action fires while the deploy lock exists, and none fires when Postgres, Redis, or PgBouncer is down (alert only).
- Staggered reloads touch one instance at a time and wait for a passing health check before the next.
- `systemd-analyze verify` passes for both unit files (after the installer fills `User=`/`PM2_HOME=`), and `python3 -m py_compile` passes for every script; `bash -n` passes for `emergency_disable.sh`.
- Emergency disable takes effect within one timer interval and is documented in the report.
- No secrets in config files committed to git, logs, or the report; `watchdog.env` is mode 600.
- Nothing was applied to production without explicit approval.

## Verification

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the simulated-failure results, systemd-analyze verify, py_compile, and the watchdog log from a staging run, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
