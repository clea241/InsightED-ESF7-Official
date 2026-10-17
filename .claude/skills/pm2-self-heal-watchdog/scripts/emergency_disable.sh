#!/usr/bin/env bash
# Stop the pm2 watchdog instantly. Idempotent. Run on the VM (or: ssh host 'sudo bash -s' < emergency_disable.sh)
set -u
touch /etc/pm2-watchdog/DISABLED          # checked first on every run
systemctl stop pm2-watchdog.timer 2>/dev/null || true
echo "pm2-watchdog DISABLED. Re-enable with:"
echo "  rm /etc/pm2-watchdog/DISABLED && systemctl start pm2-watchdog.timer"
