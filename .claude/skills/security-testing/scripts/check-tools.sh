#!/usr/bin/env bash
# Lists scanning tools, install status and version. Always exits 0; the table is the signal. Installs nothing.
. "$(dirname "${BASH_SOURCE[0]}")/env-path.sh"
row() { printf '%-24s %-10s %s\n' "$1" "$2" "$3"; }
ver() { local out; out=$(timeout 20 "$@" </dev/null 2>&1 | grep -m1 -E "[0-9]+.[0-9]+" ) || true; echo "${out:-unknown}" | cut -c1-60; }
row TOOL INSTALLED VERSION
chk() { local name="$1" bin="$2"; shift 2
  if command -v "$bin" >/dev/null 2>&1; then row "$name" yes "$(ver "$bin" "$@")"; else row "$name" no -; fi; }
chk gitleaks gitleaks version
chk semgrep semgrep --version
chk sqlmap sqlmap --version
if command -v zap.sh >/dev/null 2>&1; then row zap yes "$(ver zap.sh -version)"
elif command -v zaproxy >/dev/null 2>&1; then row zap yes "$(ver zaproxy -version)"
else row zap no -; fi
chk npm npm --version
if [ -x node_modules/.bin/eslint ]; then row eslint yes "$(ver node_modules/.bin/eslint --version)"; else row eslint no -; fi
if [ -d node_modules/eslint-plugin-security ]; then
  row eslint-plugin-security yes "$(node -p "require('eslint-plugin-security/package.json').version" 2>/dev/null)"
else row eslint-plugin-security no -; fi
exit 0
