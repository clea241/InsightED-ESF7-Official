#!/usr/bin/env bash
# Active scans (sqlmap, ZAP) against endpoints listed in security/targets.json. Run from the repo root.
# Usage: bash run-active-scans.sh --target local|staging [--confirm-host <host>]
# Runs guard-scan-target.js first and aborts if it fails. Uses synthetic test accounts only.
. "$(dirname "${BASH_SOURCE[0]}")/env-path.sh"
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""; CONFIRM=""
while [ $# -gt 0 ]; do case "$1" in
  --target) TARGET="${2:-}"; shift 2;;
  --confirm-host) CONFIRM="${2:-}"; shift 2;;
  *) echo "unknown argument: $1"; exit 2;;
esac; done
[ -n "$TARGET" ] || { echo "usage: --target local|staging"; exit 2; }

G=(node "$HERE/guard-scan-target.js" --target "$TARGET")
[ -n "$CONFIRM" ] && G+=(--confirm-host "$CONFIRM")
"${G[@]}" || { echo "ABORT: target guard refused. Nothing was scanned."; exit 1; }

RAW="security/reports/raw"; mkdir -p "$RAW/sqlmap"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -f "$RAW/.token" 2>/dev/null; }
trap cleanup EXIT INT TERM

FORBIDDEN='--dump|--dump-all|--passwords|--os-shell|--os-cmd|--file-read|--file-write|--sql-shell|--priv-esc|--users|--dbs|--tables|--columns|--sql-query'
SQLMAP_BASE=(--batch --level=2 --risk=1 --random-agent --delay=1 --flush-session)
# SQLMAP_EXTRA_ARGS exists so the guard can be tested; any forbidden option aborts the whole script.
read -r -a EXTRA <<< "${SQLMAP_EXTRA_ARGS:-}"
SQLMAP_ARGS=("${SQLMAP_BASE[@]}" "${EXTRA[@]:-}")
for a in "${SQLMAP_ARGS[@]}"; do
  if [[ "$a" =~ ^($FORBIDDEN)(=.*)?$ ]]; then echo "ABORT: forbidden sqlmap option '${a%%=*}'. Nothing was scanned."; exit 1; fi
done

# Plan + login (token stays in a 0600 file removed on exit; never printed)
PLAN=$(node -e '
const fs=require("fs");
const env={};for(const l of fs.readFileSync(".env.security","utf8").split(/\r?\n/)){const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);if(m&&!l.trim().startsWith("#"))env[m[1]]=m[2];}
const t=JSON.parse(fs.readFileSync("security/targets.json","utf8"));
const base=(process.argv[1]==="local"?env.LOCAL_APP_URL:env.STAGING_APP_URL).replace(/\/$/,"");
(async()=>{
  let token="";
  try{const f=t.login.bodyFields||{};const body={};for(const [k,v] of Object.entries(f))body[k]=env[v]!==undefined?env[v]:v;
    const r=await fetch(base+t.login.path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));token=j[t.login.tokenField||"token"]||"";
    if(!r.ok||!token)console.error("login failed with status "+r.status+" (authenticated endpoints will be skipped)");
  }catch(e){console.error("login request failed: "+e.code)}
  fs.writeFileSync("security/reports/raw/.token",token,{mode:0o600});
  console.log(JSON.stringify({base,allowStagingActive:t.allowActiveScanOnStaging===true,endpoints:t.endpoints||[]}));
})();' "$TARGET") || { echo "ABORT: could not read targets/login"; exit 1; }
BASE=$(node -p 'JSON.parse(process.argv[1]).base' "$PLAN")
ALLOW_ACTIVE=$(node -p 'JSON.parse(process.argv[1]).allowStagingActive' "$PLAN")
COUNT=$(node -p 'JSON.parse(process.argv[1]).endpoints.length' "$PLAN")
TOKEN=$(cat "$RAW/.token" 2>/dev/null || true)
[ "$COUNT" -gt 0 ] || { echo "ABORT: no endpoints in security/targets.json"; exit 1; }

# sqlmap
if command -v sqlmap >/dev/null 2>&1; then
  for i in $(seq 0 $((COUNT-1))); do
    EP=$(node -p 'const e=JSON.parse(process.argv[1]).endpoints[+process.argv[2]];JSON.stringify(e)' "$PLAN" "$i")
    M=$(node -p 'JSON.parse(process.argv[1]).method||"GET"' "$EP"); P=$(node -p 'JSON.parse(process.argv[1]).path' "$EP")
    NEEDS=$(node -p 'JSON.parse(process.argv[1]).auth!==false' "$EP")
    PARAMS=$(node -p '(JSON.parse(process.argv[1]).params||[]).join(",")' "$EP")
    if [ "$NEEDS" = "true" ] && [ -z "$TOKEN" ]; then echo "sqlmap: skip $M $P (no token)"; continue; fi
    URL="$BASE$P"; ARGS=("${SQLMAP_ARGS[@]}" -o --output-dir="$RAW/sqlmap" --method="$M")
    if [ "$M" = "GET" ]; then [ -n "$PARAMS" ] && URL="$URL?$(node -p 'JSON.parse(process.argv[1]).params.map(p=>p+"=1").join("&")' "$EP")"
    else ARGS+=(--data="$(node -p 'JSON.stringify(JSON.parse(process.argv[1]).body||{})' "$EP")" --headers="Content-Type: application/json"); fi
    [ -n "$PARAMS" ] && ARGS+=(-p "$PARAMS")
    [ "$NEEDS" = "true" ] && ARGS+=(--header="Authorization: Bearer $TOKEN")
    timeout 600 sqlmap -u "$URL" "${ARGS[@]}" > "$RAW/sqlmap/run-$i.log" 2>&1 &
    PIDS+=($!); wait $! ; echo "sqlmap: $M $P done (exit $?); log saved, not printed"
    # keep only injection verdict lines in the log
    grep -iE "is vulnerable|injectable|Parameter:|Type:|Title:" "$RAW/sqlmap/run-$i.log" > "$RAW/sqlmap/run-$i.findings" 2>/dev/null || : > "$RAW/sqlmap/run-$i.findings"
  done
else echo "sqlmap: not run (not installed)"; echo '{"tool":"sqlmap","status":"not run","reason":"sqlmap not installed"}' > "$RAW/sqlmap/not-run.json"; fi

# ZAP: baseline on staging; baseline + active scan on local
ZAP=""; command -v zap.sh >/dev/null 2>&1 && ZAP=zap.sh; [ -z "$ZAP" ] && command -v zaproxy >/dev/null 2>&1 && ZAP=zaproxy
ACTIVE=false
if [ "$TARGET" = "local" ]; then ACTIVE=true
elif [ "$ALLOW_ACTIVE" = "true" ] && [ "${STAGING_ACTIVE_CONFIRMED:-}" = "yes" ]; then ACTIVE=true; fi
if [ "$ACTIVE" = "true" ] && [ -n "$ZAP" ]; then
  echo "zap: baseline + active scan"
  timeout 1800 "$ZAP" -cmd -quickurl "$BASE" -quickout "$(pwd)/$RAW/zap.json" > "$RAW/zap.log" 2>&1 &
  PIDS+=($!); wait $!; echo "zap: exit $? (output in raw/zap.json)"
elif command -v zap-baseline.py >/dev/null 2>&1; then
  echo "zap: passive baseline only"
  timeout 900 zap-baseline.py -t "$BASE" -J "$(pwd)/$RAW/zap.json" > "$RAW/zap.log" 2>&1 &
  PIDS+=($!); wait $!; echo "zap: exit $? (output in raw/zap.json)"
else
  echo "zap: not run (not installed, or staging without zap-baseline.py: the active scan is never used there)"
  echo "{\"tool\":\"zap\",\"status\":\"not run\",\"reason\":\"ZAP not installed or active scan not permitted\"}" > "$RAW/zap.json"
fi
exit 0
