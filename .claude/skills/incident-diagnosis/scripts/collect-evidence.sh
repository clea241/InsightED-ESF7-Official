#!/usr/bin/env bash
# Preserve evidence before analysis. Read-only on the VM: copies logs here (redacted; raw SHA-256 recorded, raw discarded), takes status snapshots, writes a checksum manifest.
#   collect-evidence.sh --incident ID --since "2026-10-15 08:00" --until "2026-10-15 18:00" [--target production|staging]
#   collect-evidence.sh --incident ID --verify     (re-check the manifest and compare PM2 restart counts / release marker with the start)
# Prints file names, sizes and checksums, never log content.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
ID="" SINCE="" UNTIL="" VERIFY=0 TARGET="production"
while [ $# -gt 0 ]; do
  case "$1" in
    --incident) ID="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    --until) UNTIL="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --verify) VERIFY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -z "$ID" ] && ID="$(cat "$ROOT/incident/.current" 2>/dev/null || true)"
[ -n "$ID" ] || { echo "no incident id (use --incident)" >&2; exit 2; }
DIR="$ROOT/incident/$ID"; EV="$DIR/evidence"
rr() { bash "$HERE/remote-readonly.sh" --incident "$ID" -- "$@"; }

pm2_filter() { # stdin: pm2 jlist output -> stdout: status fields and env variable NAMES only (never values)
  node -e '
    let s=require("fs").readFileSync(0,"utf8"); const i=s.indexOf("["); const j=JSON.parse(s.slice(i));
    console.log(JSON.stringify(j.map(p=>({name:p.name,pm_id:p.pm_id,pid:p.pid,status:p.pm2_env&&p.pm2_env.status,
      restart_time:p.pm2_env&&p.pm2_env.restart_time,unstable_restarts:p.pm2_env&&p.pm2_env.unstable_restarts,
      pm_uptime:p.pm2_env&&p.pm2_env.pm_uptime,exec_mode:p.pm2_env&&p.pm2_env.exec_mode,
      script:p.pm2_env&&p.pm2_env.pm_exec_path,memory:p.monit&&p.monit.memory,cpu:p.monit&&p.monit.cpu,
      env_names:Object.keys((p.pm2_env&&p.pm2_env.env)||{}).sort()})),null,2))'
}
cfgval() { node -e 'const g=require(process.argv[1]),c=g.loadConfig(process.argv[2]);console.log([c.logPaths.join(","),c.releaseRoot,c.marker,c.backupDir,c.evidenceMaxMb].join("\t"))' "$HERE/guard-incident-env.js" "$TARGET"; }
IFS=$'\t' read -r LOGS RELROOT MARKER BACKUPDIR MAXMB <<<"$(cfgval)"

if [ "$VERIFY" = 1 ]; then
  rc=0
  ( cd "$EV" && sha256sum -c MANIFEST.sha256 --quiet ) && echo "PASS evidence manifest verifies" || { echo "FAIL evidence manifest does not verify"; rc=1; }
  node "$HERE/guard-incident-env.js" --incident "$ID" --audit-log || rc=1
  mkdir -p "$DIR/snapshots-final"
  rr pm2 jlist | pm2_filter >"$DIR/snapshots-final/pm2-status.json"
  node -e '
    const fs=require("fs"),a=JSON.parse(fs.readFileSync(process.argv[1])),b=JSON.parse(fs.readFileSync(process.argv[2]));
    let bad=0; for(const x of a){const y=b.find(z=>z.name===x.name); if(!y||y.restart_time!==x.restart_time){bad++;console.log("FAIL PM2 restart count changed for "+x.name)}}
    if(!bad)console.log("PASS PM2 restart counts unchanged ("+a.length+" processes)"); process.exit(bad?1:0)' "$EV/snapshots/pm2-status.json" "$DIR/snapshots-final/pm2-status.json" || rc=1
  if [ -n "$MARKER" ]; then
    rr cat "$MARKER" >"$DIR/snapshots-final/release-marker.txt" || true
    cmp -s "$DIR/snapshots-final/release-marker.txt" "$EV/snapshots/release-marker.txt" && echo "PASS release marker unchanged" || { echo "FAIL release marker changed"; rc=1; }
  else echo "NOTE no RELEASE_MARKER_FILE configured: release marker comparison not possible"; fi
  exit $rc
fi

[ -n "$SINCE" ] && [ -n "$UNTIL" ] || { echo "usage: --since <time> --until <time>" >&2; exit 2; }
node "$HERE/guard-incident-env.js" --mode investigate --target "$TARGET" --incident "$ID" || { echo "guard failed: evidence collection aborted" >&2; exit 1; }
[ -e "$EV/MANIFEST.sha256" ] && { echo "evidence already preserved for this incident; refusing to overwrite (use a new incident id)" >&2; exit 1; }
umask 077
mkdir -p "$EV/snapshots" "$EV/raw"
node "$HERE/guard-incident-env.js" --incident "$ID" --init-ip-key   # random per-incident key for IP pseudonyms
printf '{"since":"%s","until":"%s"}\n' "$SINCE" "$UNTIL" >"$EV/window.json"

echo "== status snapshots =="
rr pm2 jlist | pm2_filter >"$EV/snapshots/pm2-status.json"
rr date +%z >"$EV/snapshots/vm-tz.txt"
rr date -u +%Y-%m-%dT%H:%M:%SZ >"$EV/snapshots/vm-time-utc.txt"
rr uptime >"$EV/snapshots/uptime.txt"
rr free -m >"$EV/snapshots/free.txt"
rr df -h >"$EV/snapshots/df.txt"
rr ls -la --time-style=full-iso "$RELROOT" >"$EV/snapshots/release-dirs.txt"
if [ -n "$MARKER" ]; then rr cat "$MARKER" >"$EV/snapshots/release-marker.txt"; else echo "UNKNOWN: RELEASE_MARKER_FILE not configured" >"$EV/snapshots/release-marker.txt"; fi
if [ -n "$BACKUPDIR" ]; then rr ls -la --time-style=full-iso "$BACKUPDIR" >"$EV/snapshots/backups.txt"; else echo "UNKNOWN: BACKUP_DIR not configured" >"$EV/snapshots/backups.txt"; fi

echo "== log listing and retention =="
SINCE_DATE="$(printf '%s' "$SINCE" | cut -c1-10)"
: >"$EV/snapshots/retention.txt"
total=0; max=$((MAXMB * 1048576)); n=0
IFS=',' read -ra DIRS <<<"$LOGS"
for d in "${DIRS[@]}"; do
  n=$((n+1)); lst="$EV/snapshots/logs-$n.txt"
  rr ls -la --time-style=full-iso "$d" >"$lst" || { echo "NOTE cannot list $d" | tee -a "$EV/snapshots/retention.txt"; continue; }
  oldest="$(awk '$1 ~ /^-/ {print $6}' "$lst" | sort | head -1)"
  if [ -z "$oldest" ]; then echo "GAP no files in $d" >>"$EV/snapshots/retention.txt"
  elif [ "$oldest" \> "$SINCE_DATE" ]; then echo "GAP oldest retained file in dir $n is dated $oldest, after incident start $SINCE_DATE: earlier events may be missing" >>"$EV/snapshots/retention.txt"
  else echo "OK dir $n retains files from $oldest" >>"$EV/snapshots/retention.txt"; fi
  while read -r size name; do
    [ -n "$name" ] || continue
    if [ $((total + size)) -gt "$max" ]; then echo "SKIPPED (EVIDENCE_MAX_MB reached): dir $n/$name" >>"$EV/snapshots/retention.txt"; continue; fi
    if bash "$HERE/remote-readonly.sh" --incident "$ID" --pull "$d/$name" "$EV/raw/$n/$name" >/dev/null; then total=$((total + size)); fi
  done < <(awk -v s="$SINCE_DATE" '$1 ~ /^-/ && $6 >= s && NF == 9 {print $5, $9}' "$lst")
done

node "$HERE/guard-incident-env.js" --incident "$ID" --drop-ip-key   # key discarded: pseudonyms can no longer be reversed or recomputed
echo "== manifest =="
( cd "$EV" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum >MANIFEST.sha256 )
chmod 700 "$DIR" "$EV" 2>/dev/null || true
find "$EV" -type d -exec chmod 700 {} + 2>/dev/null || true
find "$EV" -type f -exec chmod 600 {} + 2>/dev/null || true
( cd "$EV" && while read -r sum f; do printf '%s  %s  %s bytes\n' "$sum" "$f" "$(wc -c <"$f" | tr -d ' ')"; done <MANIFEST.sha256 )
echo "-- retention notes --"; cat "$EV/snapshots/retention.txt"
echo "Evidence preserved. Logs were stored redacted; raw hashes are in evidence/raw-hashes.txt. Never print log content."
