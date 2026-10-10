#!/usr/bin/env bash
# Sourced by the other scripts: makes user-level tool locations visible on Windows (winget links, pip --user Scripts).
if [ -n "${LOCALAPPDATA:-}" ]; then
  L=$(cygpath -u "$LOCALAPPDATA" 2>/dev/null || echo "$LOCALAPPDATA")
  [ -d "$L/Microsoft/WinGet/Links" ] && PATH="$PATH:$L/Microsoft/WinGet/Links"
  for d in "$L"/Microsoft/WinGet/Packages/Gitleaks*; do [ -d "$d" ] && PATH="$PATH:$d"; done
fi
if command -v py >/dev/null 2>&1; then
  S=$(py -c "import sysconfig;print(sysconfig.get_path('scripts','nt_user'))" 2>/dev/null | tr -d '\r')
  [ -n "$S" ] && S=$(cygpath -u "$S" 2>/dev/null || echo "$S") && [ -d "$S" ] && PATH="$PATH:$S"
fi
export PATH
