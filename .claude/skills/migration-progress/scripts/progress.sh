#!/usr/bin/env bash
# Live Migration Progress Runner
# Wrapper around scripts/progress.js for Unix/POSIX and Git Bash environments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="${SCRIPT_DIR}/progress.js"

show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --task, -t    Task ID (e.g., task-3136 or 3136, default: task-3136)
  --db, -d      Target database name (default: esf7_local)
  --stage, -s   Migration stage name (default: "Stage 2")
  --format, -f  Output format: "markdown" (default) or "json"
  --help, -h    Show this help message

Examples:
  ./progress.sh --task task-3136
  ./progress.sh --task task-3136 --db esf7_local --stage "Stage 2"
  ./progress.sh --task task-2884 --format json
EOF
}

for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
    show_help
    exit 0
  fi
done

if ! command -v node &> /dev/null; then
  echo "Error: Node.js runtime is required to execute progress reporting script." >&2
  exit 1
fi

node "${NODE_SCRIPT}" "$@"
