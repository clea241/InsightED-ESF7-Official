#!/usr/bin/env bash
# The single gateway for every remote command. Read-only, allowlisted, logged, redacted.
#   remote-readonly.sh [--incident ID] -- <command> [args...]       run an allowlisted command over SSH
#   remote-readonly.sh [--incident ID] --psql < query.sql           run SQL (stdin) as the read-only database user
#   remote-readonly.sh [--incident ID] --pull <remote-file> <local-file>   copy a log file here (pull only)
# --bootstrap is used only by guard-incident-env.js for its own role check.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
GUARD="$HERE/guard-incident-env.js"
MAX_OUT=${REMOTE_MAX_OUT_BYTES:-5000000}
TIMEOUT=${REMOTE_TIMEOUT_S:-60}

ID="" BOOT=0 MODE="cmd"
while [ $# -gt 0 ]; do
  case "$1" in
    --incident) ID="$2"; shift 2 ;;
    --bootstrap) BOOT=1; shift ;;
    --psql) MODE="psql"; shift ;;
    --pull) MODE="pull"; shift; break ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[ -z "$ID" ] && ID="$(cat "$ROOT/incident/.current" 2>/dev/null || true)"
DIR="$ROOT/incident/$ID"
PASS="$DIR/.guard-pass"
die() { echo "REFUSED: $*" >&2; exit 97; }

[ -n "$ID" ] && [ -f "$PASS" ] || die "guard has not passed for this incident (run guard-incident-env.js --mode investigate first)"
# one node call reads the guard pass, checks the allowlist is unchanged, and prints target/host/user/key/db settings
CFG="$(node -e '
const g=require(process.argv[1]),fs=require("fs");
const p=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const c=g.loadConfig(p.target);
if(g.sha(fs.readFileSync(g.ROOT+"/incident/allowed-remote-commands.json"))!==p.allowlistSha){console.error("allowlist changed since the guard passed");process.exit(1)}
if(Date.now()-Date.parse(p.time)>12*3600e3){console.error("guard pass is older than 12 hours");process.exit(1)}
if(process.argv[3]!=="1"&&!p.dbVerified){console.error("database role not verified");process.exit(1)}
console.log([c.sshUser+"@"+c.sshHost,c.sshKey,c.dbHost,c.dbPort,c.dbUser,c.dbName,c.evidenceMaxMb].join("\t"))
' "$GUARD" "$PASS" "$BOOT")" || die "guard pass invalid"
IFS=$'\t' read -r TARGET KEY DBHOST DBPORT DBUSER DBNAME MAXMB <<<"$CFG"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes -o ServerAliveInterval=10)
[ -n "$KEY" ] && SSH+=(-i "$KEY")

q() { printf "'%s'" "${1//\'/\'\\\'\'}"; }          # single-quote one argument for the remote shell
jstr() { node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- "$@"; }
log() { # type exit bytes argv...
  local t="$1" ec="$2" by="$3"; shift 3
  node -e 'const [t,ec,by,...a]=process.argv.slice(1);console.log(JSON.stringify({type:t,ts:new Date().toISOString(),exit:+ec,bytes:+by,argv:a}))' "$t" "$ec" "$by" "$@" >>"$DIR/commands.log"
}
BIG=" grep zgrep cat tail head sha256sum du "

run_remote() { # argv...  (already allowlisted) ; stdin passed through
  local pre="" rcmd="" a
  case "$BIG" in *" $1 "*) pre="nice -n 19 ionice -c3 " ;; esac
  for a in "$@"; do rcmd+=" $(q "$a")"; done
  [ "$1" = "psql" ] && rcmd="env PGOPTIONS='-c default_transaction_read_only=on' $rcmd"
  [ "$1" = "pm2" ] && rcmd="env PATH=\"\$PATH:/usr/local/bin:/usr/bin\" $rcmd"
  local tmp; tmp="$(mktemp)"
  timeout "$TIMEOUT" "${SSH[@]}" "$TARGET" "${pre}${rcmd}" 2>&1 | head -c "$MAX_OUT" >"$tmp"
  local ec=${PIPESTATUS[0]}
  local bytes; bytes=$(wc -c <"$tmp" | tr -d ' ')
  [ "$bytes" -ge "$MAX_OUT" ] && echo "[output truncated at $MAX_OUT bytes]" >&2
  log cmd "$ec" "$bytes" "$@"
  node "$GUARD" --redact <"$tmp"; rm -f "$tmp"
  return "$ec"
}

check() { node "$GUARD" --incident "$ID" --match -- "$@" || exit 98; }

case "$MODE" in
  cmd)
    [ $# -gt 0 ] || die "no command given"
    [ "$1" = "psql" ] && die "psql only through --psql (run-queries.js)"
    check "$@"; run_remote "$@" ;;
  psql)
    ARGV=(psql -X -w -q --csv -v ON_ERROR_STOP=1 -h "$DBHOST" -p "$DBPORT" -U "$DBUSER" -d "$DBNAME" -f -)
    check "${ARGV[@]}"
    SQLTMP="$(mktemp)"; cat >"$SQLTMP"
    run_remote "${ARGV[@]}" <"$SQLTMP"; ec=$?; rm -f "$SQLTMP"; exit $ec ;;
  pull)
    [ $# -eq 2 ] || die "usage: --pull <remote-file> <local-file>"
    REMOTE="$1" LOCAL="$2"
    check cat "$REMOTE"                                  # the remote path must be an allowed log path
    case "$LOCAL" in "$DIR"/*) ;; *) die "local destination must be inside the incident folder" ;; esac
    [ -e "$LOCAL" ] && die "refusing to overwrite $LOCAL"
    check stat "$REMOTE"
    SZ="$(run_remote stat "$REMOTE" | awk '/Size:/{print $2; exit}')"
    [ -n "$SZ" ] || die "cannot stat remote file"
    [ "$SZ" -le $((MAXMB * 1048576)) ] || die "file larger than EVIDENCE_MAX_MB"
    mkdir -p "$(dirname "$LOCAL")"
    SCP=(scp -p -q -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes); [ -n "$KEY" ] && SCP+=(-i "$KEY")
    # Redacted-only: copy to a temp file, record the RAW sha256 + size, write a redacted copy (gz is unpacked), delete the raw temp.
    RAWTMP="$DIR/.raw-$$.tmp"
    timeout 600 "${SCP[@]}" "$TARGET:$REMOTE" "$RAWTMP"; ec=$?
    log pull "$ec" "${SZ:-0}" "$REMOTE"
    if [ $ec -eq 0 ]; then
      mkdir -p "$DIR/evidence"
      printf '%s  %s  %s bytes  %s\n' "$(sha256sum <"$RAWTMP" | cut -d' ' -f1)" "$(basename "$REMOTE")" "$SZ" "$REMOTE" >>"$DIR/evidence/raw-hashes.txt"
      GZ=""; case "$REMOTE" in *.gz) GZ="--gz"; LOCAL="${LOCAL%.gz}" ;; esac
      node "$GUARD" --redact-file "$RAWTMP" "$LOCAL" $GZ || ec=1
      chmod 600 "$LOCAL" 2>/dev/null
    fi
    rm -f "$RAWTMP"
    echo "pulled $(basename "$LOCAL") ($SZ bytes)"; exit $ec ;;
esac
