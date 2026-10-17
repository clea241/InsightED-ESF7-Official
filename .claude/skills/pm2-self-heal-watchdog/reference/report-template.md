# PM2 self-heal watchdog report

## 1. Target and mode
- Environment: staging | production (approved by: ___)  
- Mode: dry-run | live

## 2. Discovered setup
Apps, instances, cluster/fork, health routes, PM2 owner + PM2_HOME, services (PgBouncer/Redis/Postgres), nginx paths, deploy scripts, alert channel, RAM/CPU/ulimit.

## 3. Files created or changed
- Repo: (path, what changed)
- VM: /opt/pm2-watchdog/watchdog.py, /etc/pm2-watchdog/{config.json,watchdog.env (600)}, /etc/systemd/system/pm2-watchdog.{service,timer}, /etc/logrotate.d/pm2-watchdog, /var/log/pm2-watchdog/watchdog.log

## 4. Thresholds chosen and why
(table of non-default values with reasons)

## 5. Test results
| Condition | Tier 1 | Tier 2 |
|---|---|---|

## 6. Conditions not implemented
(condition, missing app hook)

## 7. Install steps
`py install_watchdog.py ... --apply`; `systemctl enable --now pm2-watchdog.timer`; verify with `systemctl list-timers` and `watchdog.py --once --dry-run`.

## 8. Emergency disable / re-enable
- Disable: `sudo bash emergency_disable.sh` (touches /etc/pm2-watchdog/DISABLED and stops the timer; effective within one 30 s interval)
- Re-enable: `rm /etc/pm2-watchdog/DISABLED && systemctl start pm2-watchdog.timer`
- Clear a capped app: `python3 /opt/pm2-watchdog/watchdog.py --reset <app>`

## 9. Still needs the user's approval
Production rollout, nginx change, app hooks, dry-run -> live.
