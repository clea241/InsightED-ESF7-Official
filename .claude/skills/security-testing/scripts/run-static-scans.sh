#!/usr/bin/env bash
# Non-intrusive scans. One failing tool never skips the others. Same raw file names every run. Never prints secrets.
# Run from the repo root.
. "$(dirname "${BASH_SOURCE[0]}")/env-path.sh"
set -uo pipefail
export PYTHONUTF8=1
RAW="security/reports/raw"; mkdir -p "$RAW"
have() { command -v "$1" >/dev/null 2>&1; }
note() { echo "$1: $2"; }
skip() { printf '{"tool":"%s","status":"not run","reason":"%s"}\n' "$1" "$2" > "$RAW/$1.json"; note "$1" "not run ($2)"; }

# gitleaks: working tree, then full git history. --redact keeps values out of output and reports.
GLCFG="$(dirname "${BASH_SOURCE[0]}")/gitleaks.toml"
rm -f "$RAW"/gitleaks-*.json "$RAW"/semgrep.json "$RAW"/npm-audit-*.json "$RAW"/eslint-security.json
if have gitleaks; then
  gitleaks detect --config "$GLCFG" --no-git --source . --redact --report-format json --report-path "$RAW/gitleaks-tree.json" >/dev/null 2>&1; rc=$?
  [ -f "$RAW/gitleaks-tree.json" ] || echo '[]' > "$RAW/gitleaks-tree.json"
  note gitleaks-tree "exit $rc (1 = leaks found)"
  gitleaks detect --config "$GLCFG" --source . --redact --report-format json --report-path "$RAW/gitleaks-history.json" >/dev/null 2>&1; rc=$?
  [ -f "$RAW/gitleaks-history.json" ] || echo '[]' > "$RAW/gitleaks-history.json"
  note gitleaks-history "exit $rc (1 = leaks found)"
else skip gitleaks-tree "gitleaks not installed"; skip gitleaks-history "gitleaks not installed"; fi

# semgrep
if have semgrep; then
  # NOTE: --config auto is skipped: it requires sending metrics, which this skill keeps off.
  semgrep scan --config p/nodejs --config p/typescript --config p/react --config p/sql-injection \
    --exclude node_modules --exclude coverage --exclude dist --exclude security/reports \
    --json --output "$RAW/semgrep.json" --metrics off >/dev/null 2>&1; rc=$?
  [ -s "$RAW/semgrep.json" ] || skip semgrep "semgrep failed (exit $rc; registry rulesets need network)"
  note semgrep "exit $rc"
else skip semgrep "semgrep not installed"; fi

# npm audit: root, server, client
for d in . server client; do
  n="$d"; [ "$d" = "." ] && n=root
  if [ -f "$d/package.json" ]; then
    (cd "$d" && npm audit --json > "$OLDPWD/$RAW/npm-audit-$n.json" 2>/dev/null)
    if [ -s "$RAW/npm-audit-$n.json" ]; then note "npm-audit-$n" done; else skip "npm-audit-$n" "npm audit returned no JSON (offline?)"; fi
  fi
done

# ESLint security rules via an ad hoc config; the repo's own ESLint config is untouched.
if [ -d node_modules/eslint-plugin-security ] && [ -x node_modules/.bin/eslint ]; then
  CFG="$RAW/eslint-security.config.mjs"
  printf '%s\n' 'import security from "eslint-plugin-security";' \
    'export default [security.configs.recommended, { files: ["**/*.js","**/*.mjs","**/*.jsx"], languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } } }];' > "$CFG"
  node_modules/.bin/eslint --no-config-lookup -c "$CFG" -f json -o "$RAW/eslint-security.json" server/controllers server/middleware server/utils server/server.js client/src >/dev/null 2>&1; rc=$?
  [ -s "$RAW/eslint-security.json" ] || skip eslint-security "eslint failed (exit $rc)"
  note eslint-security "exit $rc"
else skip eslint-security "eslint-plugin-security not installed"; fi
exit 0
