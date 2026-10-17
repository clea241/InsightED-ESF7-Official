# Minimal app hooks (apply only if missing; show the diff; skip what does not apply)

**1. Health route fields** (event-loop lag, uptime, rss, instance id):
```js
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 20 }); h.enable();
app.get('/api/health', (req, res) => {
  const lag = h.percentile(99) / 1e6; h.reset();           // ms
  res.json({ status: 'ok', event_loop_lag_ms: Math.round(lag), uptime_s: Math.round(process.uptime()),
             rss_mb: Math.round(process.memoryUsage().rss / 1048576), instance: process.env.NODE_APP_INSTANCE ?? null });
});
```
Keep it cheap: no DB call on the watchdog path.

**2. Per-instance internal listener** (so one stuck cluster worker is not hidden behind the shared port):
```js
const base = Number(process.env.INSTANCE_HEALTH_BASE_PORT);   // e.g. 4101
if (base) require('http').createServer(healthHandler).listen(base + Number(process.env.NODE_APP_INSTANCE || 0), '127.0.0.1');
```
Set `instance_health_base_port` in the watchdog config to the same base. Bind to 127.0.0.1 only.

**3. Ready signal** (cluster, 2+ instances only, with `wait_ready: true`):
```js
server.listen(port, () => { if (process.send) process.send('ready'); });
```

**4. Queue-worker heartbeat** (every loop iteration, even when idle):
```js
const fs = require('fs');
setInterval(() => fs.writeFileSync(process.env.HEARTBEAT_FILE, String(Date.now())), 15000);   // or touch once per loop pass
```
Put the file where the PM2 user can write (e.g. `/var/run/<app>/worker.heartbeat`) and set `heartbeat_file`. Prefer writing it from the loop that processes jobs, so a wedged loop stops the heartbeat.

**5. Stuck transactions: server-side timeout.** Use `ALTER ROLE <app_role> SET idle_in_transaction_session_timeout = '60s';` (a human runs it). Do NOT pass it as a connection startup parameter: PgBouncer rejects those.
