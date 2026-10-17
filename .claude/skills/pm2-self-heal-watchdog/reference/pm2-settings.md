# PM2 built-in settings (Part 1)

Apply per app in its ecosystem file. Smallest edit; other apps' entries stay untouched.

| Option | Value | Why |
|---|---|---|
| `autorestart` | `true` | PM2 respawns crashes |
| `max_memory_restart` | ~80 % of per-instance budget | catches slow leaks before the OOM killer |
| `min_uptime` | e.g. `'30s'` | a start that dies sooner counts as unstable |
| `max_restarts` | e.g. `10` | stop crash-looping; PM2 then marks `errored` and the watchdog alert/start path takes over |
| `exp_backoff_restart_delay` | `100` | growing delay between crash restarts |
| `kill_timeout` | e.g. `5000` (ms) | grace before SIGKILL; mirror it in config `kill_timeout_ms` |
| `wait_ready` + `listen_timeout` | `true` + e.g. `10000` | **only** cluster apps with 2+ instances, and only with the matching `process.send('ready')` hook |
| `cron_restart` | **do not add** | blanket restarts hide bugs; if a known leak forces one, flag it in the report |

**Budget** = (total RAM - ~1 GB OS - ~1 GB nginx/PgBouncer/Redis) / total instance count across ALL PM2 apps on the shared VM. `max_memory_restart` = 0.8 x budget (e.g. 8 GB RAM, 10 instances total: (8-2)/10 = 600 MB budget -> `'480M'`). Count every app on the VM, not just this one.

`pm2 reload` is zero-downtime **only in cluster mode with 2+ instances**; in fork mode or with one instance it behaves like a restart. Do not promise zero downtime otherwise.

VM-level (report existing state, change only with approval): `pm2 startup` (as the daemon owner) + `pm2 save`; `pm2 install pm2-logrotate` with `max_size 20M`, `retain 14`, `compress true`.
