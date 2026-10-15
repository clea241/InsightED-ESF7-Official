#!/usr/bin/env bash
# Runs the saved failure-path Playwright tests against a LOCAL app and a LOCAL disposable test database.
# Usage: bash run-failure-paths.sh [--grep <pattern>]
# Exit code: the Playwright result (0 = all passed), or 2 when the guard/setup failed (no test ran).
set -euo pipefail

GREP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --grep) GREP="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 2 ;;
  esac
done

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
cd "$ROOT"
RUN="$ROOT/e2e/reports/.run"
mkdir -p "$RUN"
DB_PID=""; APP_PID=""; WEB_PID=""; STOPFILE="$RUN/stop-db"
rm -f "$STOPFILE"

cleanup() {
  set +e
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
  if [ -n "$DB_PID" ]; then
    # Ask the helper to stop the database and wait until its port is really closed (kill -0 cannot be trusted for native Windows pids;
    # killing the helper early would orphan postgres.exe and wedge the next run).
    touch "$STOPFILE"
    for _ in $(seq 1 40); do port_open "$DBHOST" "$DBPORT" || break; sleep 0.5; done
    sleep 1
    kill "$DB_PID" 2>/dev/null
  fi
  rm -f "$STOPFILE"
  true
}
trap cleanup EXIT INT TERM

# 1. Guard first. Nothing starts if it fails.
node "$SKILL_DIR/scripts/guard-test-env.js" --root "$ROOT" || { echo "Guard failed: not running."; exit 2; }

# 2. Environment from .env.test only
set -a; . "$ROOT/.env.test"; set +a
read -r DBHOST DBPORT DBNAME DBUSER DBPASS < <(node -e 'const u=new URL(process.env.DATABASE_URL);console.log([u.hostname.replace(/^\[|\]$/g,""),u.port||5432,decodeURIComponent(u.pathname.slice(1)),decodeURIComponent(u.username),decodeURIComponent(u.password)].join(" "))')
PORT="${PORT:-5017}"; FRONTEND_PORT="${FRONTEND_PORT:-4217}"

# 3. The database: use what listens on the configured local port, otherwise start a disposable embedded PostgreSQL there.
port_open() { node -e 'const s=require("net").connect(+process.argv[2],process.argv[1]);s.on("connect",()=>process.exit(0));s.on("error",()=>process.exit(1))' "$1" "$2" 2>/dev/null; }
if port_open "$DBHOST" "$DBPORT"; then
  echo "Using the PostgreSQL already listening on $DBHOST:$DBPORT (database $DBNAME will be dropped and recreated)."
else
  echo "Starting a disposable embedded PostgreSQL on $DBHOST:$DBPORT"
  node "$SKILL_DIR/scripts/test-db.mjs" start "$STOPFILE" > "$RUN/db.log" 2>&1 &
  DB_PID=$!
  for _ in $(seq 1 60); do port_open "$DBHOST" "$DBPORT" && break; sleep 1; done
  port_open "$DBHOST" "$DBPORT" || { echo "Embedded PostgreSQL did not start (see $RUN/db.log)"; exit 2; }
fi

# 4. Schema: recreate the guarded test database and apply the project's schema (no db:migrate script exists in this repo).
node "$SKILL_DIR/scripts/test-db.mjs" bootstrap || { echo "Schema bootstrap failed"; exit 2; }

# 5. Pin EVERY connection setting to the test environment. server/loadEnv.js lets the root .env override the process
# environment unless NODE_ENV=test, so NODE_ENV=test is mandatory and every variable the root .env defines is set here too.
REDIS_PORT_VALUE="6379"; REDIS_HOST_VALUE="127.0.0.1"
if [ -n "${REDIS_URL:-}" ]; then
  read -r REDIS_HOST_VALUE REDIS_PORT_VALUE < <(node -e 'const u=new URL(process.env.REDIS_URL);console.log(u.hostname,u.port||6379)')
fi
export NODE_ENV=test TEST_DATABASE_URL="$DATABASE_URL" PORT
export PRIMARY_DATABASE_URL="$DATABASE_URL" USERS_DATABASE_URL="$DATABASE_URL" INSIGHTED_DATABASE_URL="$DATABASE_URL"
export STAGING_DATABASE_URL="$DATABASE_URL" PROD_DATABASE_URL="$DATABASE_URL" PRODUCTION_DATABASE_URL="$DATABASE_URL"
export DB_HOST="$DBHOST" DB_PORT="$DBPORT" DB_NAME="$DBNAME" DB_USER="$DBUSER" DB_PASSWORD="$DBPASS" DB_SSL=false
export INSIGHTED_DB_NAME="$DBNAME" USERS_DB_NAME="$DBNAME" AUTH_DB_NAME="$DBNAME"
export REDIS_HOST="$REDIS_HOST_VALUE" REDIS_PORT="$REDIS_PORT_VALUE" REDIS_PASSWORD="${REDIS_PASSWORD:-}"
[ -n "${REDIS_URL:-}" ] || export REDIS_URL=""
export JWT_SECRET E2E_PROJECT_ROOT="$ROOT"
# Defense in depth: every pg connection made by the app (and by worker processes the tests start) is forced to the test database,
# even where legacy code hard-codes a real database name.
# Native-style path (C:/...) because node on Windows does not understand Git Bash /c/... paths; plain pwd elsewhere.
SKILL_NATIVE="$(cd "$SKILL_DIR" && (pwd -W 2>/dev/null || pwd))"
export E2E_PIN_DB="$SKILL_NATIVE/scripts/pin-db.cjs"
export NODE_OPTIONS="--require \"$E2E_PIN_DB\""

# 6. Backend, then the frontend built against it (separate output folder, so client/dist is untouched)
node server/server.js > "$RUN/app.log" 2>&1 &
APP_PID=$!
ready() { node -e 'require("http").get(process.argv[1],{timeout:2000},r=>process.exit(r.statusCode<500?0:1)).on("error",()=>process.exit(1))' "$1" 2>/dev/null; }
for _ in $(seq 1 60); do ready "$APP_URL/api/health/readiness" && break; kill -0 "$APP_PID" 2>/dev/null || break; sleep 1; done
ready "$APP_URL/api/health/readiness" || { echo "Backend did not become ready (see $RUN/app.log)"; exit 2; }

(cd client && VITE_API_URL="$APP_URL/api" node node_modules/vite/bin/vite.js build --outDir "$RUN/client-build" --emptyOutDir > "$RUN/client-build.log" 2>&1) || { echo "Client build failed (see $RUN/client-build.log)"; exit 2; }
# No subshell here: $! must be the node process itself, or cleanup would leave the preview server running.
node client/node_modules/vite/bin/vite.js preview client --outDir "$RUN/client-build" --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort > "$RUN/web.log" 2>&1 &
WEB_PID=$!
for _ in $(seq 1 30); do ready "$FRONTEND_URL/" && break; sleep 1; done
ready "$FRONTEND_URL/" || { echo "Frontend did not start (see $RUN/web.log)"; exit 2; }

# 7. Tests
ARGS=(-c playwright.failure-paths.config.ts)
[ -n "$GREP" ] && ARGS+=(--grep "$GREP")
set +e
npx playwright test "${ARGS[@]}"
RESULT=$?
set -e
exit "$RESULT"
