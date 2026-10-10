#!/usr/bin/env bash
# Installs only MISSING tools, user-level only. Never uses sudo. Prints every command before running it.
# Run only after the user agreed to the commands shown here.
. "$(dirname "${BASH_SOURCE[0]}")/env-path.sh"
run() { echo "+ $*"; "$@" || echo "WARN: command failed: $*"; }
have() { command -v "$1" >/dev/null 2>&1; }
IS_WIN=false; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) IS_WIN=true;; esac
if $IS_WIN; then
  # gitleaks (winget id is case-sensitive: Gitleaks.Gitleaks)
  have gitleaks || run winget install --id Gitleaks.Gitleaks -e --accept-source-agreements --accept-package-agreements
  PY="py -m pip"
  if have py; then
    have semgrep || run py -m pip install --user semgrep
    have sqlmap || run py -m pip install --user sqlmap
  else echo "Python launcher 'py' not found. Install Python, then: py -m pip install --user semgrep sqlmap"; fi
  # ZAP is NOT installed here: it needs Docker (zaproxy/zap-stable, zap-baseline.py) or the Java desktop install plus zap-baseline.py.
  echo "ZAP: skipped (needs Docker with zap-baseline.py, or a manual ZAP install)."
else
  if have brew; then
    have gitleaks || run brew install gitleaks
    have zap.sh || have zaproxy || run brew install --cask zaproxy
  else echo "brew not found. Install gitleaks and ZAP manually (github.com/gitleaks/gitleaks/releases, zaproxy.org/download)."; fi
  P=""; have pip && P=pip; [ -z "$P" ] && have pip3 && P=pip3
  if [ -n "$P" ]; then have semgrep || run "$P" install --user semgrep; have sqlmap || run "$P" install --user sqlmap
  else echo "pip not found. Install Python, then: python -m pip install --user semgrep sqlmap"; fi
fi
[ -d node_modules/eslint-plugin-security ] || run npm install -D eslint-plugin-security
exit 0
