# Maintenance page (optional, needs explicit approval)

All server blocks live in ONE shared `nginx.conf`: a change affects every app. Never edit it silently.

## 1. Discover (read-only)
`grep -nE "maintenance.html|/var/www/maintenance|return 503|error_page 503" /etc/nginx/nginx.conf`

- **Exists:** document its on/off trigger (file, variable, include) and point the watchdog at it (`maintenance_flag_file` per app, `nginx_maintenance.enabled: true`).
- **None:** propose, do not apply, the minimal per-server pattern below.

## 2. Proposed per-server pattern
```nginx
# inside each server { } that should support it
error_page 503 /maintenance.html;
location = /maintenance.html { root /var/www/maintenance; internal; }
if (-f /var/www/maintenance/<app>.flag) { return 503; }
```
Apply the identical change to each affected server block. Show the diff, get explicit approval, run `nginx -t`, only then `systemctl reload nginx`. The flag-file check is evaluated per request, so toggling the flag needs no reload.

## 3. Toggling
The watchdog touches the flag file only when the cap is hit AND `nginx -t` passes (`binaries.nginx_bin`). A human clears it with `python3 /opt/pm2-watchdog/watchdog.py --reset <app>` (removes the flag and clears the cap) after fixing the cause.
