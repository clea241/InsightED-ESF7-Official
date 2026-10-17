#!/usr/bin/env python3
"""Install / update / uninstall the pm2 watchdog on a VM over ssh/scp.

Dry-run by default: prints every command. Pass --apply to execute.
Usage (PowerShell):
  py install_watchdog.py --host 20.24.58.49 --user azureuser --key C:\\keys\\vm.pem `
     --config watchdog.config.json --env-file watchdog.env            # dry-run
  ... --apply                                                         # real install
  ... --uninstall --apply                                             # remove units, keep logs/state
"""
import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
DIRS = ["/opt/pm2-watchdog", "/etc/pm2-watchdog", "/var/lib/pm2-watchdog", "/var/log/pm2-watchdog"]


class Runner:
    def __init__(self, a):
        self.a = a
        key_arg = ["-i", a.key.replace("\\", "/")] if a.key else []
        self.ssh_base = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no"] + key_arg + ["%s@%s" % (a.user, a.host)]
        self.scp_base = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no"] + key_arg

    def ssh(self, remote, check=True):
        print("  ssh> " + remote)
        if not self.a.apply:
            return ""
        r = subprocess.run(self.ssh_base + [remote], capture_output=True, text=True)
        if check and r.returncode != 0:
            sys.exit("FAILED: %s\n%s" % (remote, r.stderr.strip()))
        return r.stdout.strip()

    def put(self, local, remote):
        print("  scp> %s -> %s" % (os.path.basename(local), remote))
        if not self.a.apply:
            return
        tmp = "/tmp/" + os.path.basename(remote) + ".upload"
        local_path = local.replace("\\", "/")
        r = subprocess.run(self.scp_base + [local_path, "%s@%s:%s" % (self.a.user, self.a.host, tmp)], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("scp failed: " + r.stderr.strip())
        self.ssh("sudo install -m %s -o root -g root %s %s && rm -f %s" % (self.mode(remote), tmp, remote, tmp))

    @staticmethod
    def mode(remote):
        return "600" if remote.endswith("watchdog.env") else "755" if remote.endswith(".py") else "644"


def discover(r):
    """Read-only: who owns the PM2 daemon and which PM2_HOME it uses."""
    owner = ""
    if r.a.apply:
        out = r.ssh("ps -eo user:20,args", check=False)
        for line in out.splitlines():
            if "God Daemon" in line and "root" not in line:
                owner = line.split()[0].strip()
                break
        if not owner:
            owner = r.a.user
    else:
        owner = "<pm2-owner>"
    home = r.ssh("getent passwd %s | cut -d: -f6" % owner, check=False) if r.a.apply and owner else "<home>"
    if not home:
        home = "/home/%s" % owner
    return owner, "%s/.pm2" % home


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--key")
    ap.add_argument("--config", help="local config.json")
    ap.add_argument("--env-file", help="local watchdog.env (never committed)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--uninstall", action="store_true")
    a = ap.parse_args()
    r = Runner(a)
    print("MODE: %s" % ("APPLY" if a.apply else "DRY-RUN (nothing executed; add --apply)"))

    if a.uninstall:
        r.ssh("sudo systemctl disable --now pm2-watchdog.timer", check=False)
        r.ssh("sudo rm -f /etc/systemd/system/pm2-watchdog.service /etc/systemd/system/pm2-watchdog.timer /etc/logrotate.d/pm2-watchdog")
        r.ssh("sudo systemctl daemon-reload")
        print("Uninstalled units. Logs and state kept in /var/log/pm2-watchdog and /var/lib/pm2-watchdog.")
        return
    if not (a.config and a.env_file):
        sys.exit("--config and --env-file are required")
    cfg = json.load(open(a.config))
    if a.apply and cfg.get("dry_run") is not True:
        print("NOTE: config dry_run is not true. The first live run on any VM must be dry_run: true.")
        if input("continue anyway? type YES: ") != "YES":
            sys.exit("aborted")

    owner, pm2_home = discover(r)
    print("PM2 daemon owner: %s  PM2_HOME: %s" % (owner, pm2_home))
    for d in DIRS:
        r.ssh("sudo mkdir -p %s && sudo chown %s:%s %s" % (d, owner, owner, d))
    r.put(os.path.join(HERE, "watchdog.py"), "/opt/pm2-watchdog/watchdog.py")
    r.put(a.config, "/etc/pm2-watchdog/config.json")
    r.put(a.env_file, "/etc/pm2-watchdog/watchdog.env")
    r.ssh("sudo chown %s:%s /etc/pm2-watchdog/config.json /etc/pm2-watchdog/watchdog.env && sudo chmod 600 /etc/pm2-watchdog/watchdog.env" % (owner, owner))

    svc = open(os.path.join(ASSETS, "pm2-watchdog.service")).read().replace("{{PM2_USER}}", owner).replace("{{PM2_HOME}}", pm2_home)
    with tempfile.TemporaryDirectory() as td:
        sp = os.path.join(td, "pm2-watchdog.service")
        open(sp, "w", newline="\n").write(svc)
        r.put(sp, "/etc/systemd/system/pm2-watchdog.service")
    r.put(os.path.join(ASSETS, "pm2-watchdog.timer"), "/etc/systemd/system/pm2-watchdog.timer")
    r.put(os.path.join(ASSETS, "pm2-watchdog.logrotate"), "/etc/logrotate.d/pm2-watchdog")
    r.ssh("sudo systemd-analyze verify /etc/systemd/system/pm2-watchdog.service /etc/systemd/system/pm2-watchdog.timer")
    r.ssh("sudo systemctl daemon-reload && sudo systemctl enable --now pm2-watchdog.timer")

    print("-- verification (report only; existing PM2 settings are never silently changed)")
    print(r.ssh("systemctl list-timers pm2-watchdog.timer --no-pager"))
    print(r.ssh("sudo -u %s env PM2_HOME=%s python3 /opt/pm2-watchdog/watchdog.py --config /etc/pm2-watchdog/config.json --once --dry-run" % (owner, shlex.quote(pm2_home))))
    print("pm2 startup unit : " + (r.ssh("systemctl list-unit-files 'pm2-*.service' --no-legend | head -3", check=False) or "NOT CONFIGURED -> run 'pm2 startup' as %s and 'pm2 save'" % owner))
    print("pm2-logrotate    : " + (r.ssh("sudo -u %s env PM2_HOME=%s pm2 list 2>/dev/null | grep -c pm2-logrotate" % (owner, shlex.quote(pm2_home)), check=False) or "n/a") + " (0 = missing -> pm2 install pm2-logrotate)")
    print("Done." if a.apply else "Dry-run finished. Re-run with --apply after approval.")


if __name__ == "__main__":
    main()
