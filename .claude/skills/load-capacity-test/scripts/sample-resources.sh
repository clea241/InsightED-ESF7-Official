#!/usr/bin/env bash
# Samples machine/app/database resources every 5 seconds into a CSV. No row contents, no secrets.
# Usage: sample-resources.sh <out.csv> <app-pid-file> <k6-pid-file>   (needs LOAD_BASE_URL and LOAD_DATABASE_URL in the environment)
set -u
OUT="${1:?out csv}"
APP_PIDS="${2:?app pid file}"
K6_PID="${3:?k6 pid file}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
INTERVAL="${SAMPLE_INTERVAL:-5}"

echo "timestamp,machine_cpu_pct,app_cpu_pct,k6_cpu_pct,app_rss_mb_per_process,loadavg1,pm2_restarts,pg_active,pg_idle,pg_idle_in_tx,pg_waiting,pg_max_connections,event_loop_lag_ms,app_pool_in_use" > "$OUT"

# One node call returns: machine_cpu_pct|pg_active|pg_idle|pg_idle_in_tx|pg_waiting|pg_max|loop_lag|pool_in_use|loadavg1
probe() {
  ( cd "$ROOT/server" 2>/dev/null || cd "$ROOT"
    node -e '
      const os = require("os"), http = require("http");
      const snap = () => os.cpus().map(c => [c.times.idle, Object.values(c.times).reduce((a, b) => a + b, 0)]);
      const a = snap();
      const fin = (db, h) => {
        const b = snap(); let di = 0, dt = 0; b.forEach((x, i) => { di += x[0] - a[i][0]; dt += x[1] - a[i][1]; });
        const cpu = dt ? Math.round((1 - di / dt) * 100) : "";
        console.log([cpu, db.a, db.i, db.t, db.w, db.m, h.lag, h.pool, os.loadavg()[0].toFixed(2)].join("|"));
        process.exit(0);
      };
      const health = (cb) => {
        const u = new URL(process.env.LOAD_BASE_URL + "/api/health/deep");
        const r = http.get(u, { timeout: 2000 }, (res) => { let s = ""; res.on("data", d => s += d); res.on("end", () => { try { const j = JSON.parse(s); cb({ lag: j.eventLoopLagMs ?? j.eventLoop?.lagMs ?? "", pool: j.pool?.inUse ?? j.db?.pool?.inUse ?? "" }); } catch { cb({ lag: "", pool: "" }); } }); });
        r.on("error", () => cb({ lag: "", pool: "" })); r.on("timeout", () => { r.destroy(); cb({ lag: "", pool: "" }); });
      };
      (async () => {
        let db = { a: "", i: "", t: "", w: "", m: "" };
        try {
          const { Client } = require("pg");
          const c = new Client({ connectionString: process.env.LOAD_DATABASE_URL, statement_timeout: 3000 });
          await c.connect();
          const r = await c.query("SELECT count(*) FILTER (WHERE state = $$active$$)::int a, count(*) FILTER (WHERE state = $$idle$$)::int i, count(*) FILTER (WHERE state = $$idle in transaction$$)::int t, count(*) FILTER (WHERE wait_event_type = $$Lock$$)::int w, (SELECT setting::int FROM pg_settings WHERE name = $$max_connections$$) m FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
          db = r.rows[0]; await c.end();
        } catch {}
        setTimeout(() => health(h => fin(db, h)), 900);
      })();
    ' 2>/dev/null )
}

while true; do
  TS="$(date +%s)"
  APP_CPU=0; K6_CPU=0; RSS=""
  if [ -s "$APP_PIDS" ]; then
    for p in $(cat "$APP_PIDS"); do
      # include child processes (PM2 cluster workers) of each recorded pid
      for q in $p $(pgrep -P "$p" 2>/dev/null); do
        line="$(ps -o pcpu=,rss= -p "$q" 2>/dev/null | head -1)"
        [ -z "$line" ] && continue
        c="$(echo "$line" | awk '{print $1}')"; r="$(echo "$line" | awk '{printf "%d", $2/1024}')"
        APP_CPU="$(awk -v a="$APP_CPU" -v b="$c" 'BEGIN{printf "%.1f", a+b}')"
        RSS="${RSS:+$RSS;}$r"
      done
    done
  fi
  if [ -s "$K6_PID" ]; then K6_CPU="$(ps -o pcpu= -p "$(cat "$K6_PID")" 2>/dev/null | awk '{printf "%.1f", $1}')"; K6_CPU="${K6_CPU:-0}"; fi
  RESTARTS=""
  if command -v pm2 >/dev/null 2>&1 && [ -n "${PM2_HOME:-}" ]; then
    RESTARTS="$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).reduce((a,p)=>a+(p.pm2_env.restart_time||0),0))}catch{console.log("")}})' 2>/dev/null)"
  fi
  IFS='|' read -r MCPU PGA PGI PGT PGW PGM LAG POOL LA <<< "$(probe)"
  echo "$TS,${MCPU:-},$APP_CPU,$K6_CPU,$RSS,${LA:-},$RESTARTS,${PGA:-},${PGI:-},${PGT:-},${PGW:-},${PGM:-},${LAG:-},${POOL:-}" >> "$OUT"
  sleep "$INTERVAL"
done
