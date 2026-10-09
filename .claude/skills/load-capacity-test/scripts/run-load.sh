#!/usr/bin/env bash
# Runs one load scenario against the LOCAL app with the saved k6 script.
# Usage: bash run-load.sh --scenario baseline|peak|spike|stress|soak
# Exit codes: 0 thresholds met, 99 thresholds crossed (k6), 3 run invalid (machine/generator saturated), 2 guard/setup failure.
set -euo pipefail

SCENARIO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --scenario) SCENARIO="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 2 ;;
  esac
done
case "$SCENARIO" in baseline|peak|spike|stress|soak) ;; *) echo "Usage: run-load.sh --scenario baseline|peak|spike|stress|soak"; exit 2 ;; esac

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
cd "$ROOT"
RAW="$ROOT/load-test/reports/raw"
mkdir -p "$RAW"

# 1. Guard first. Nothing starts if it fails.
node "$SKILL_DIR/scripts/guard-load-env.js" --root "$ROOT" || { echo "Guard failed: not running."; exit 2; }

# 2. Environment from .env.load only
set -a; . "$ROOT/.env.load"; set +a
MODEL="$ROOT/load-test/load-model.json"
[ -f "$MODEL" ] || { echo "load-test/load-model.json missing"; exit 2; }
[ -f "$ROOT/load-test/k6/$SCENARIO.js" ] || { echo "load-test/k6/$SCENARIO.js missing"; exit 2; }
INSTANCES="$(node -e 'const m=require(process.argv[1]);console.log((m.inputs.pm2_instances||{value:1}).value)' "$MODEL")"
read -r DBHOST DBPORT DBNAME DBUSER DBPASS < <(node -e 'const u=new URL(process.env.LOAD_DATABASE_URL);console.log([u.hostname,u.port||5432,decodeURIComponent(u.pathname.slice(1)),decodeURIComponent(u.username),decodeURIComponent(u.password)].join(" "))')
PORT="${LOAD_APP_PORT:-5007}"

TS="$(date +%Y%m%d-%H%M%S)"
PREFIX="$RAW/$TS-$SCENARIO"
APP_PIDS="$PREFIX-app.pids"; K6_PID="$PREFIX-k6.pid"; CSV="$PREFIX-resources.csv"; K6OUT="$PREFIX-k6.json"; META="$PREFIX-meta.json"
: > "$APP_PIDS"; : > "$K6_PID"
SAMPLER_PID=""; WATCH_PID=""; APP_PID=""; USED_PM2=0; INVALID=""
export PM2_HOME="$RAW/pm2home"

cleanup() {
  set +e
  [ -n "$WATCH_PID" ] && kill "$WATCH_PID" 2>/dev/null
  [ -n "$SAMPLER_PID" ] && kill "$SAMPLER_PID" 2>/dev/null
  [ -s "$K6_PID" ] && kill "$(cat "$K6_PID")" 2>/dev/null
  if [ "$USED_PM2" = 1 ]; then pm2 delete load-capacity-app >/dev/null 2>&1; pm2 kill >/dev/null 2>&1; fi
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
  rm -rf "$PM2_HOME" 2>/dev/null
  true
}
trap cleanup EXIT INT TERM

# 3. pg_stat_statements in the LOCAL test database, counters reset before the run
node -e '
  const { createRequire } = require("module");
  const { Client } = createRequire(process.cwd() + "/server/package.json")("pg");
  (async () => {
    const c = new Client({ connectionString: process.env.LOAD_DATABASE_URL }); await c.connect();
    try { await c.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements"); await c.query("SELECT pg_stat_statements_reset()"); console.log("pg_stat_statements enabled and reset"); }
    catch (e) { console.log("WARNING pg_stat_statements unavailable (" + e.message.split("\n")[0] + "): add it to shared_preload_libraries of the local test server; db-analysis will be limited."); }
    await c.end();
  })().catch((e) => { console.log("WARNING could not prepare pg_stat_statements: " + e.message.split("\n")[0]); });
'

# 4. Start the app in production mode (PM2 cluster when available, otherwise one process: recorded in the meta file)
# NODE_ENV is deliberately NOT "production": server/db/index.js sends real-school traffic in production mode to a pool with a
# hard-coded database name (insighted_esf7), which would bypass the guard. Instances/cluster layout and PM2 settings still match production.
export NODE_ENV=load-test PORT="$PORT" JWT_SECRET="$LOAD_JWT_SECRET" DATABASE_URL="$LOAD_DATABASE_URL" DB_HOST="$DBHOST" DB_PORT="$DBPORT" DB_NAME="$DBNAME" DB_USER="$DBUSER" DB_PASSWORD="$DBPASS" DB_SSL=false
# The app has separate pools (master, users/auth, ...). Point every one of them at the local test database so nothing falls back to a built-in default host.
export INSIGHTED_DB_NAME="$DBNAME" USERS_DB_NAME="$DBNAME" AUTH_DB_NAME="$DBNAME"
[ -n "${LOAD_REDIS_URL:-}" ] && export REDIS_URL="$LOAD_REDIS_URL"
LAYOUT="single node process (pm2 not installed: cluster layout NOT reproduced)"
if command -v pm2 >/dev/null 2>&1; then
  mkdir -p "$PM2_HOME"
  pm2 start ecosystem.config.js --only insighted-backend --name load-capacity-app -i "$INSTANCES" --update-env >/dev/null
  USED_PM2=1; LAYOUT="pm2 cluster x$INSTANCES"
  pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).map(p=>p.pid).join("\n"))})' > "$APP_PIDS"
else
  node server/server.js > "$PREFIX-app.log" 2>&1 &
  APP_PID=$!; echo "$APP_PID" > "$APP_PIDS"
fi
echo "App layout: $LAYOUT"
READY=0
for i in $(seq 1 60); do
  if node -e 'require("http").get(process.env.LOAD_BASE_URL+"/api/health/readiness",{timeout:2000},r=>process.exit(r.statusCode<500?0:1)).on("error",()=>process.exit(1))' 2>/dev/null; then READY=1; break; fi
  sleep 1
done
[ "$READY" = 1 ] || { echo "App did not become ready within 60s (see $PREFIX-app.log)"; exit 2; }

# 5. Resource sampling
bash "$SKILL_DIR/scripts/sample-resources.sh" "$CSV" "$APP_PIDS" "$K6_PID" &
SAMPLER_PID=$!

# 6. k6 (+ watchdog: machine CPU above 95% for 30s means the laptop, not the app, is being measured)
START="$(date -u +%FT%TZ)"
k6 run "$ROOT/load-test/k6/$SCENARIO.js" --summary-export "$K6OUT" \
  -e BASE_URL="$LOAD_BASE_URL" -e MODEL_FILE="$MODEL" -e ACCOUNTS_FILE="$ROOT/$LOAD_TEST_ACCOUNTS_FILE" -e SCENARIO="$SCENARIO" &
K6=$!; echo "$K6" > "$K6_PID"
(
  hot=0
  while kill -0 "$K6" 2>/dev/null; do
    sleep 5
    cpu="$(tail -1 "$CSV" 2>/dev/null | cut -d, -f2)"
    if [ -n "$cpu" ] && [ "${cpu%.*}" -ge 95 ] 2>/dev/null; then hot=$((hot+5)); else hot=0; fi
    if [ "$hot" -ge 30 ]; then echo "machine CPU above 95% for 30s: aborting, run is INVALID" >&2; touch "$PREFIX.invalid-cpu"; kill "$K6" 2>/dev/null; break; fi
  done
) &
WATCH_PID=$!
set +e; wait "$K6"; K6_EXIT=$?; set -e
END="$(date -u +%FT%TZ)"
[ -f "$PREFIX.invalid-cpu" ] && INVALID="machine CPU above 95% for 30 seconds (results would measure the laptop)"
rm -f "$PREFIX.invalid-cpu"

node -e '
  const [meta, scenario, start, end, k6exit, layout, invalid, instances, prefix] = process.argv.slice(1);
  require("fs").writeFileSync(meta, JSON.stringify({ scenario, started_at: start, ended_at: end, k6_exit_code: +k6exit, app_layout: layout, requested_instances: +instances, invalid_reason: invalid || null, files: { k6: prefix + "-k6.json", resources: prefix + "-resources.csv" } }, null, 2));
' "$META" "$SCENARIO" "$START" "$END" "$K6_EXIT" "$LAYOUT" "$INVALID" "$INSTANCES" "$PREFIX"
echo "$PREFIX" > "$RAW/latest-$SCENARIO.txt"
echo "Raw results: $PREFIX-*"

if [ -n "$INVALID" ]; then echo "RUN INVALID: $INVALID"; exit 3; fi
exit "$K6_EXIT"
