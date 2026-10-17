#!/usr/bin/env python3
"""PM2 self-heal watchdog. One-shot run, executed every 30 s by a systemd timer.

Python 3 standard library only. Every threshold comes from the config file.
Secrets come only from environment variables (watchdog.env, mode 600).
Exit codes: 0 normal, 1 internal error (logged, no traceback to systemd).
"""
import argparse
import hashlib
import json
import logging
import os
import re
import shlex
import shutil
import smtplib
import socket
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

DEFAULT_THRESHOLDS = {
    "check_interval_s": 30, "failure_threshold": 3,
    "lag_ms": 500, "lag_sustained_s": 180,
    "cpu_stuck_pct": 90, "cpu_stuck_checks": 3, "cpu_sibling_median_pct": 50,
    "nginx_burst_count": 10, "nginx_burst_window_s": 60,
    "fd_pct": 80, "close_wait_max": 500,
    "emfile_count": 3, "emfile_window_s": 60,
    "pool_starvation_count": 3, "pool_window_s": 120,
    "heartbeat_stale_s": 120, "idle_in_tx_s": 60,
    "blocker_age_s": 120, "blocker_min_waiters": 3,
    "blocker_cancel_wait_s": 10, "blocker_cap_kills": 2, "blocker_cap_window_s": 900,
    "stagger_wait_s": 60, "kill_escalation_wait_s": 10,
    "recheck_wait_s": 15, "poll_interval_s": 2,
    "startup_grace_s": 60, "cap_restarts": 3, "cap_window_s": 900,
    "disk_pct": 90, "disk_warn_pct": 90, "alert_dedupe_s": 60,
}
DEFAULT_PATHS = {
    "state_file": "/var/lib/pm2-watchdog/state.json",
    "deploy_lock": "/var/lib/pm2-watchdog/deploy.lock",
    "disabled_file": "/etc/pm2-watchdog/DISABLED",
    "nginx_error_log": "/var/log/nginx/error.log",
    "log_file": "/var/log/pm2-watchdog/watchdog.log",
    "proc_root": "/proc",
    "disk_path": "/",
}
DEFAULT_BINARIES = {
    "pm2_bin": "pm2", "systemctl_bin": "systemctl", "ss_bin": "ss",
    "kill_bin": "/bin/kill", "psql_bin": "psql", "nginx_bin": "nginx",
}
POOL_RE = re.compile(r"timeout acquiring connection|pool.?starvation|timeout exceeded when trying to connect", re.I)
EMFILE_RE = re.compile(r"EMFILE")
TS_RE = re.compile(r"^(\d{4}/\d\d/\d\d \d\d:\d\d:\d\d)")

log = logging.getLogger("pm2-watchdog")


def setup_logging(path):
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%dT%H:%M:%S")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        h = logging.FileHandler(path)
    except OSError:
        h = logging.StreamHandler(sys.stderr)
    h.setFormatter(fmt)
    log.addHandler(h)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)


def load_config(path):
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["thresholds"] = {**DEFAULT_THRESHOLDS, **cfg.get("thresholds", {})}
    cfg["paths"] = {**DEFAULT_PATHS, **cfg.get("paths", {})}
    cfg["binaries"] = {**DEFAULT_BINARIES, **cfg.get("binaries", {})}
    cfg.setdefault("apps", [])
    cfg.setdefault("dependencies", [])
    cfg.setdefault("alerts", {"channel": "none"})
    cfg.setdefault("nginx_maintenance", {"enabled": False})
    cfg.setdefault("postgres_blockers", {"enabled": True})
    return cfg


def new_state():
    return {"apps": {}, "deps": {}, "hashes": {}, "offsets": {}, "alerts_last": {}, "decisions": [], "notes": {}, "blocker_kills": []}


def load_state(path):
    try:
        with open(path, encoding="utf-8") as f:
            return {**new_state(), **json.load(f)}
    except (OSError, ValueError):
        return new_state()


def save_state(path, state):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".state-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, path)


def http_get(url, timeout):
    """Return (ok, parsed_json_or_None). ok means HTTP 200 within the timeout.
    Sends direct loopback HTTP GET without proxy headers (no X-Forwarded-For, no X-Real-IP).
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "pm2-watchdog/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(65536)
            code = r.status
    except urllib.error.HTTPError as e:
        return False, None
    except Exception:
        return False, None
    try:
        body = json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        body = None
    return code == 200, body


class Watchdog:
    def __init__(self, cfg, args):
        self.cfg, self.args = cfg, args
        self.t, self.P = cfg["thresholds"], cfg["paths"]
        self.dry = bool(args.dry_run or cfg.get("dry_run", False))
        self.now = time.time()
        pats = cfg.get("log_patterns", {})
        global POOL_RE, EMFILE_RE
        if pats.get("pool"):
            POOL_RE = re.compile("|".join(pats["pool"]), re.I)
        if pats.get("emfile"):
            EMFILE_RE = re.compile("|".join(pats["emfile"]))
        self.state = load_state(self.P["state_file"])
        self._lines = {}
        self.taken = []

    # ---------- helpers ----------
    def cmd(self, key, args, timeout=60, env=None):
        b = self.cfg["binaries"][key]
        base = b if isinstance(b, list) else shlex.split(b, posix=(os.name != "nt"))
        e = dict(os.environ)
        e.update(env or {})
        try:
            r = subprocess.run(base + [str(a) for a in args], capture_output=True, text=True,
                               timeout=timeout, env=e)
            return r.returncode, r.stdout
        except Exception as ex:
            return 127, "%s" % type(ex).__name__

    def astate(self, name):
        return self.state["apps"].setdefault(name, {
            "cnt": {}, "restarts": [], "capped": False, "maint": False,
            "lag_since": None, "events": {}})

    def decide(self, app, action, reason):
        log.info("DECISION app=%s action=%s reason=%s%s", app, action, reason, " [dry-run]" if self.dry else "")
        d = self.state["decisions"]
        d.append({"t": int(self.now), "app": app, "action": action, "reason": reason, "dry": self.dry})
        del d[:-50]

    def debounce(self, st, key, cond, threshold):
        c = st["cnt"]
        c[key] = c.get(key, 0) + 1 if cond else 0
        return c[key] >= threshold

    def window(self, st, key, times, span):
        ev = [t for t in st["events"].get(key, []) + times if self.now - t < span]
        st["events"][key] = ev
        return len(ev)

    def new_lines(self, path):
        if path in self._lines:
            return self._lines[path]
        out, off = [], self.state["offsets"].get(path)
        try:
            size = os.path.getsize(path)
            if off is None or size < off:
                off = size if off is None else 0
            with open(path, "rb") as f:
                f.seek(off)
                out = f.read().decode("utf-8", "replace").splitlines()
                self.state["offsets"][path] = f.tell()
        except OSError:
            pass
        self._lines[path] = out
        return out

    # ---------- alerts ----------
    def alert(self, key, text, dedupe_s=None):
        span = self.t["alert_dedupe_s"] if dedupe_s is None else dedupe_s
        last = self.state["alerts_last"].get(key, 0)
        if self.now - last < span:
            return
        self.state["alerts_last"][key] = self.now
        log.warning("ALERT [%s] %s%s", key, text, " [dry-run: not sent]" if self.dry else "")
        if self.dry:
            return
        a = self.cfg["alerts"]
        ch = a.get("channel", "none")
        host = a.get("host_label", socket.gethostname())
        msg = "[%s] %s" % (host, text)
        try:
            if ch == "telegram":
                tok, chat = os.environ.get("WATCHDOG_TELEGRAM_BOT_TOKEN"), os.environ.get("WATCHDOG_TELEGRAM_CHAT_ID")
                if tok and chat:
                    data = urllib.parse.urlencode({"chat_id": chat, "text": msg}).encode()
                    urllib.request.urlopen("https://api.telegram.org/bot%s/sendMessage" % tok, data, timeout=10)
            elif ch == "slack":
                hook = os.environ.get("WATCHDOG_SLACK_WEBHOOK_URL")
                if hook:
                    req = urllib.request.Request(hook, json.dumps({"text": msg}).encode(),
                                                 {"Content-Type": "application/json"})
                    urllib.request.urlopen(req, timeout=10)
            elif ch == "email":
                m = EmailMessage()
                m["Subject"], m["From"], m["To"] = "pm2-watchdog alert", os.environ.get("WATCHDOG_SMTP_FROM", ""), os.environ.get("WATCHDOG_SMTP_TO", "")
                m.set_content(msg)
                with smtplib.SMTP(os.environ.get("WATCHDOG_SMTP_HOST", ""), int(os.environ.get("WATCHDOG_SMTP_PORT", "587")), timeout=10) as s:
                    s.starttls()
                    if os.environ.get("WATCHDOG_SMTP_USER"):
                        s.login(os.environ["WATCHDOG_SMTP_USER"], os.environ.get("WATCHDOG_SMTP_PASSWORD", ""))
                    s.send_message(m)
        except Exception as ex:  # never log the exception text: it can contain a URL with a token
            log.error("alert delivery failed via %s: %s", ch, type(ex).__name__)

    # ---------- pm2 ----------
    def jlist(self):
        rc, out = self.cmd("pm2_bin", ["jlist"])
        i = out.find("[")
        try:
            return json.loads(out[i:]) if rc == 0 and i >= 0 else None
        except ValueError:
            return None

    @staticmethod
    def instances(app, jl):
        procs = sorted((p for p in jl if p.get("name") == app["pm2_name"]), key=lambda p: p.get("pm_id", 0))
        out = []
        for n, p in enumerate(procs):
            env = p.get("pm2_env", {})
            idx = env.get("NODE_APP_INSTANCE")
            out.append({"pm_id": p.get("pm_id"), "pid": p.get("pid") or 0,
                        "status": env.get("status"), "cpu": (p.get("monit") or {}).get("cpu", 0),
                        "up_s": (time.time() * 1000 - env["pm_uptime"]) / 1000.0 if env.get("pm_uptime") else 1e9,
                        "err_log": env.get("pm_err_log_path"), "out_log": env.get("pm_out_log_path"),
                        "idx": int(idx) if str(idx).isdigit() else n})
        return out

    def health_url_for(self, app, inst):
        base = app.get("instance_health_base_port")
        if base and inst is not None:
            path = urllib.parse.urlparse(app.get("health_url", "")).path or "/health"
            return "http://127.0.0.1:%d%s" % (base + inst["idx"], path)
        return app.get("health_url")

    def is_healthy(self, app, inst):
        url = self.health_url_for(app, inst)
        if url:
            return http_get(url, app.get("health_timeout_s", 5))[0]
        jl = self.jlist() or []
        ins = [i for i in self.instances(app, jl) if inst is None or i["pm_id"] == inst["pm_id"]]
        return bool(ins) and all(i["status"] == "online" for i in ins)

    def wait_healthy(self, app, inst, max_wait):
        end = time.time() + max_wait
        while True:
            if self.is_healthy(app, inst):
                return True
            left = end - time.time()
            if left <= 0:
                return False
            time.sleep(min(self.t["poll_interval_s"], left))

    # ---------- escalation ladder ----------
    def ladder(self, app, inst, start, label):
        """reload -> restart -> kill -9. Re-checks health between steps."""
        n_live = len(app.get("_insts", []))
        steps = ["reload", "restart", "kill"]
        if start == "restart" or app.get("mode") == "fork" or n_live < 2:
            steps = steps[1:]  # reload on fork/1 instance is a hard restart anyway
        for step in steps:
            if self.dry:
                log.info("DRY-RUN would run step=%s on %s id=%s", step, app["name"], inst["pm_id"])
                return True
            if step == "kill":
                time.sleep(app.get("kill_timeout_ms", 5000) / 1000.0 + self.t["kill_escalation_wait_s"])
                cur = [i for i in self.instances(app, self.jlist() or []) if i["pm_id"] == inst["pm_id"]]
                pid = cur[0]["pid"] if cur else 0
                if not pid:
                    continue
                self.cmd("kill_bin", ["-9", pid])
                log.info("ACTION app=%s step=kill -9 pid=%s (%s)", app["name"], pid, label)
            else:
                self.cmd("pm2_bin", [step, inst["pm_id"]])
                log.info("ACTION app=%s step=pm2 %s %s (%s)", app["name"], step, inst["pm_id"], label)
            self.taken.append("%s:%s:%s" % (app["name"], step, inst["pm_id"]))
            if self.wait_healthy(app, inst, self.t["recheck_wait_s"]):
                log.info("RESULT app=%s id=%s healthy after %s", app["name"], inst["pm_id"], step)
                return True
            log.warning("RESULT app=%s id=%s still failing after %s", app["name"], inst["pm_id"], step)
        return False

    def staggered(self, app, insts, start, label):
        for n, inst in enumerate(insts):
            if not self.ladder(app, inst, start, label):
                return False
            if n < len(insts) - 1 and not self.dry and not self.wait_healthy(app, None, self.t["stagger_wait_s"]):
                log.warning("stagger wait expired for %s, aborting remaining instances", app["name"])
                return False
        return True

    # ---------- cap / maintenance ----------
    def hit_cap(self, app, st, why):
        if st["capped"]:
            return
        st["capped"] = True
        log.error("CAP app=%s %s", app["name"], why)
        mm = self.cfg["nginx_maintenance"]
        flag = app.get("maintenance_flag_file")
        note = "maintenance page not enabled"
        if mm.get("enabled") and flag:
            rc, _ = self.cmd("nginx_bin", ["-t"])
            if rc != 0:
                note = "maintenance page skipped: nginx -t failed"
            elif self.dry:
                note = "maintenance page would be enabled (dry-run)"
            else:
                os.makedirs(os.path.dirname(flag), exist_ok=True)
                open(flag, "a").close()
                st["maint"] = True
                note = "maintenance page enabled"
        log.info("MAINTENANCE app=%s %s", app["name"], note)
        self.alert("cap:" + app["name"],
                   "%s hit the restart cap (%s). Auto-restarts stopped; %s. Clear with: watchdog.py --reset %s"
                   % (app["name"], why, note, app["name"]), dedupe_s=0)

    # ---------- dependencies ----------
    def check_deps(self):
        down, restarted = {}, []
        for d in self.cfg["dependencies"]:
            ds = self.state["deps"].setdefault(d["name"], {})
            rc, out = self.cmd("systemctl_bin", ["is-active", d["systemd_unit"]])
            active = rc == 0 and out.strip() == "active"
            tcp = False
            try:
                socket.create_connection((d.get("host", "127.0.0.1"), d["port"]), 2).close()
                tcp = True
            except OSError:
                pass
            if not (active and tcp):
                down[d["name"]] = d
                if not ds.get("down"):
                    ds["down"] = True
                    self.alert("dep-down:" + d["name"], "dependency %s is DOWN (active=%s, tcp=%s); restarts blocked for dependent apps"
                               % (d["name"], active, tcp), dedupe_s=0)
                continue
            if ds.get("down"):
                ds["down"] = False
                log.info("dependency %s recovered", d["name"])
            if d.get("kind") in ("pgbouncer", "redis"):
                _, ts = self.cmd("systemctl_bin", ["show", "-p", "ActiveEnterTimestamp", "--value", d["systemd_unit"]])
                ts = ts.strip()
                if ds.get("start_ts") and ts and ds["start_ts"] != ts:
                    restarted.append(d["name"])
                if ts:
                    ds["start_ts"] = ts
        return down, restarted

    # ---------- hashes ----------
    def app_hash(self, app):
        h = hashlib.sha256()
        for p in app.get("env_files", []):
            try:
                with open(p, "rb") as f:
                    h.update(f.read())
            except OSError:
                h.update(b"missing:" + p.encode())
        return h.hexdigest()

    def refresh_hashes(self):
        for app in self.cfg["apps"]:
            self.state["hashes"][app["name"]] = self.app_hash(app)

    # ---------- external signals ----------
    def pgb_pools(self):
        pw = os.environ.get("PGB_ADMIN_PASSWORD")
        if not pw:
            log.info("INFO pgbouncer admin credentials not set; skipping pool-leak check")
            return None
        rc, out = self.cmd("psql_bin", ["-h", os.environ.get("PGB_HOST", "127.0.0.1"), "-p", os.environ.get("PGB_PORT", "6432"),
                                        "-U", os.environ.get("PGB_ADMIN_USER", "pgbouncer"), "pgbouncer", "--csv", "-c", "SHOW POOLS"],
                           timeout=15, env={"PGPASSWORD": pw})
        if rc != 0 or "\n" not in out:
            return None
        lines = out.strip().splitlines()
        hdr = lines[0].split(",")
        rows = [dict(zip(hdr, l.split(","))) for l in lines[1:]]
        return rows

    def check_idle_tx(self):
        if not os.environ.get("WATCHDOG_PG_PASSWORD"):
            return
        q = ("select pid, application_name, left(query,80) from pg_stat_activity where state='idle in transaction' "
             "and now()-state_change > interval '%d seconds'" % int(self.t["idle_in_tx_s"]))
        rc, out = self.cmd("psql_bin", ["-h", os.environ.get("WATCHDOG_PG_HOST", ""), "-p", os.environ.get("WATCHDOG_PG_PORT", "5432"),
                                        "-U", os.environ.get("WATCHDOG_PG_USER", ""), os.environ.get("WATCHDOG_PG_DB", "postgres"),
                                        "--csv", "-c", q], timeout=15, env={"PGPASSWORD": os.environ["WATCHDOG_PG_PASSWORD"]})
        rows = out.strip().splitlines()[1:] if rc == 0 else []
        if rows:
            self.alert("idle-tx", "idle-in-transaction > %ss (human review, never auto-terminated): %s" % (self.t["idle_in_tx_s"], " | ".join(rows[:5])), dedupe_s=600)

    def get_pg_backend_pid(self, host, port, user, db, env):
        rc, out = self.cmd("psql_bin", ["-h", host, "-p", port, "-U", user, db, "-t", "-A", "-c", "SELECT pg_backend_pid()"],
                           timeout=10, env=env)
        if rc == 0 and out.strip().isdigit():
            return int(out.strip())
        return None

    def check_postgres_blockers(self):
        if not os.environ.get("WATCHDOG_PG_PASSWORD"):
            return
        pg_cfg = self.cfg.get("postgres_blockers", {})
        if not pg_cfg.get("enabled", True):
            return

        host = os.environ.get("WATCHDOG_PG_HOST", "127.0.0.1")
        port = os.environ.get("WATCHDOG_PG_PORT", "5432")
        user = os.environ.get("WATCHDOG_PG_USER", "pm2_watchdog")
        db = os.environ.get("WATCHDOG_PG_DB", "postgres")
        env = {"PGPASSWORD": os.environ["WATCHDOG_PG_PASSWORD"]}

        allowlist_users = set(pg_cfg.get("allowlist_users", ["Administrator1", "azure_pg_admin", "pm2_watchdog"]))
        allowlist_apps = [a.lower() for a in pg_cfg.get("allowlist_apps", ["pg_dump", "migration", "drizzle"])]

        own_pid = self.get_pg_backend_pid(host, port, user, db, env)

        q = (
            "WITH waiters AS ("
            "  SELECT unnest(pg_blocking_pids(pid)) AS blocker_pid, pid AS waiter_pid "
            "  FROM pg_stat_activity "
            "  WHERE cardinality(pg_blocking_pids(pid)) > 0"
            "), "
            "blocker_counts AS ("
            "  SELECT blocker_pid, count(*) AS waiter_count "
            "  FROM waiters "
            "  GROUP BY blocker_pid"
            ") "
            "SELECT a.pid, a.usename, COALESCE(a.application_name, '') AS application_name, a.state, "
            "EXTRACT(EPOCH FROM (now() - COALESCE(a.xact_start, a.state_change)))::int AS age_seconds, "
            "b.waiter_count, COALESCE(a.query, '') AS query "
            "FROM blocker_counts b "
            "JOIN pg_stat_activity a ON a.pid = b.blocker_pid "
            "WHERE a.pid <> pg_backend_pid();"
        )
        rc, out = self.cmd("psql_bin", ["-h", host, "-p", port, "-U", user, db, "--csv", "-c", q],
                           timeout=15, env=env)
        if rc != 0 or not out.strip():
            return

        import csv
        import io
        try:
            reader = csv.DictReader(io.StringIO(out.strip()))
            rows = list(reader)
        except Exception as ex:
            log.warning("failed to parse psql blocker output: %s", ex)
            return

        for r in rows:
            try:
                pid = int(r.get("pid", 0) or 0)
                usename = (r.get("usename") or "").strip()
                app_name = (r.get("application_name") or "").strip()
                state = (r.get("state") or "").strip().lower()
                age = int(r.get("age_seconds", 0) or 0)
                waiters = int(r.get("waiter_count", 0) or 0)
                query = (r.get("query") or "").strip()
            except (ValueError, TypeError):
                continue

            if pid <= 0:
                continue

            # (e) Never target watchdog's own backend
            if own_pid is not None and pid == own_pid:
                log.info("INFO blocker pid=%d skipped: watchdog's own backend pid", pid)
                continue

            # (c) Waiter count >= 3
            if waiters < self.t["blocker_min_waiters"]:
                log.info("INFO blocker pid=%d skipped: waiters %d < %d", pid, waiters, self.t["blocker_min_waiters"])
                continue

            # (b) Older than 2 minutes (120 s)
            if age < self.t["blocker_age_s"]:
                log.info("INFO blocker pid=%d skipped: age %ds < %ds", pid, age, self.t["blocker_age_s"])
                continue

            # (a) Executing DML (DELETE/UPDATE/INSERT) or idle in transaction
            is_dml = bool(re.match(r"^\s*(delete|update|insert)\b", query, re.I))
            is_idle_in_tx = "idle in transaction" in state
            if not (is_dml or is_idle_in_tx):
                log.info("INFO blocker pid=%d skipped: query not DML or idle-in-tx (state=%s query=%s)", pid, state, query[:50])
                continue

            # (d) Allowlist checks
            if usename in allowlist_users:
                log.info("INFO blocker pid=%d skipped: user %s is allowlisted", pid, usename)
                continue
            if any(token in app_name.lower() for token in allowlist_apps):
                log.info("INFO blocker pid=%d skipped: application_name %s is allowlisted", pid, app_name)
                continue
            if "pg_dump" in query.lower():
                log.info("INFO blocker pid=%d skipped: query contains allowlisted token", pid)
                continue

            # Rate limit / Cap: max 2 kills per 15 minutes
            cap_window = self.t["blocker_cap_window_s"]
            recent_kills = [ts for ts in self.state.get("blocker_kills", []) if self.now - ts < cap_window]
            self.state["blocker_kills"] = recent_kills
            if len(recent_kills) >= self.t["blocker_cap_kills"]:
                log.warning("CAP-REACHED postgres blocker pid=%d (waiters=%d, age=%ds): %d kills in %ds cap reached; alert only",
                            pid, waiters, age, len(recent_kills), cap_window)
                self.alert("blocker-cap", "Postgres blocker kill cap reached (%d in %ds); pid %d (waiters %d, age %ds, user %s) not killed. Query: %s"
                           % (self.t["blocker_cap_kills"], cap_window, pid, waiters, age, usename, query[:100]), dedupe_s=900)
                continue

            # Mandatory logging order: log the full query, user, age, waiter count and pid
            log.warning("POSTGRES-BLOCKER candidate pid=%d user=%s app=%s age=%ds waiters=%d state=%s query=%s",
                        pid, usename, app_name, age, waiters, state, query)

            if self.dry:
                log.info("DRY-RUN would cancel and terminate Postgres blocker pid=%d (waiters=%d, age=%ds)", pid, waiters, age)
                self.decide("postgres", "dry_blocker_kill", "pid=%d waiters=%d age=%ds" % (pid, waiters, age))
                continue

            # Step 1: pg_cancel_backend
            log.info("ACTION executing pg_cancel_backend(%d) on blocker", pid)
            self.cmd("psql_bin", ["-h", host, "-p", port, "-U", user, db, "-c", "SELECT pg_cancel_backend(%d)" % pid],
                     timeout=15, env=env)
            self.taken.append("postgres:cancel:%d" % pid)

            # Step 2: wait 10 seconds (or configured blocker_cancel_wait_s)
            wait_s = self.t["blocker_cancel_wait_s"]
            if wait_s > 0:
                time.sleep(wait_s)

            # Step 3: check if still active
            check_rc, check_out = self.cmd("psql_bin", ["-h", host, "-p", port, "-U", user, db, "--csv", "-c",
                                                        "SELECT count(*) FROM pg_stat_activity WHERE pid = %d" % pid],
                                           timeout=15, env=env)
            still_alive = True
            if check_rc == 0 and check_out.strip():
                lines_alive = [l.strip() for l in check_out.strip().splitlines() if l.strip()]
                val = lines_alive[-1] if lines_alive else "1"
                if val == "0":
                    still_alive = False

            terminated = False
            if still_alive:
                log.warning("ACTION blocker pid=%d still active after cancel; executing pg_terminate_backend(%d)", pid, pid)
                self.cmd("psql_bin", ["-h", host, "-p", port, "-U", user, db, "-c", "SELECT pg_terminate_backend(%d)" % pid],
                         timeout=15, env=env)
                self.taken.append("postgres:terminate:%d" % pid)
                terminated = True

            # Record kill
            self.state["blocker_kills"].append(self.now)

            # Step 4: alert
            action_label = "terminated after cancel" if terminated else "cancelled"
            self.alert("blocker-kill:%d" % pid,
                       "Postgres blocker pid %d %s (waiters=%d, age=%ds, user=%s). Query: %s"
                       % (pid, action_label, waiters, age, usename, query[:150]), dedupe_s=0)

    # ---------- per-app evaluation ----------
    def evaluate(self, app, insts, dep_restarted):
        t, st, name = self.t, self.astate(app["name"]), app["name"]
        decs = []
        online = [i for i in insts if i["status"] == "online"]
        ft = t["failure_threshold"]
        # startup grace: a process started/reloaded in the last startup_grace_s (or by us) is not judged yet
        grace = t["startup_grace_s"]
        starting = [i for i in insts if i["up_s"] < grace] or ([True] if self.now < st.get("grace_until", 0) else [])
        starting_ids = {i["pm_id"] for i in starting if i is not True}
        if starting:
            log.info("INFO app=%s in startup grace (%ss): health/missing/heartbeat not judged", name, grace)
        # missing / errored instance
        miss = (len(online) < app.get("expected_instances", 1) or len(online) < len(insts)) and not starting
        if self.debounce(st, "missing", miss, ft):
            decs.append({"kind": "start_eco", "reason": "%d/%d instances online" % (len(online), app.get("expected_instances", 1))})
            st["cnt"]["missing"] = 0
        if not online:
            return decs
        # health (shared or per-instance) and event-loop lag
        lag = 0.0
        if app.get("instance_health_base_port"):
            for i in online:
                if i["pm_id"] in starting_ids or (starting and starting[0] is True):
                    st["cnt"]["ih%s" % i["pm_id"]] = 0
                    continue
                ok, body = http_get(self.health_url_for(app, i), app.get("health_timeout_s", 5))
                lag = max(lag, float((body or {}).get(app.get("lag_field", "event_loop_lag_ms"), 0) or 0))
                if self.debounce(st, "ih%s" % i["pm_id"], not ok, ft):
                    decs.append({"kind": "restart_inst", "ids": [i["pm_id"]], "reason": "instance %s health failed %dx" % (i["pm_id"], ft)})
                    st["cnt"]["ih%s" % i["pm_id"]] = 0
        elif app.get("health_url"):
            ok, body = http_get(app["health_url"], app.get("health_timeout_s", 5))
            lag = float((body or {}).get(app.get("lag_field", "event_loop_lag_ms"), 0) or 0)
            if self.debounce(st, "health", not ok and not starting, ft):
                decs.append({"kind": "restart_app", "reason": "health check failed/timed out %d consecutive times" % ft})
                st["cnt"]["health"] = 0
        if lag > t["lag_ms"]:
            st["lag_since"] = st["lag_since"] or self.now
            if self.now - st["lag_since"] >= t["lag_sustained_s"]:
                decs.append({"kind": "reload_app", "reason": "event-loop lag %.0f ms > %s ms for %ss" % (lag, t["lag_ms"], int(self.now - st["lag_since"]))})
                st["lag_since"] = None
        else:
            st["lag_since"] = None
        # per-instance CPU stuck
        if len(online) >= 2:
            cpus = {i["pm_id"]: float(i["cpu"] or 0) for i in online}
            if all(c >= t["cpu_stuck_pct"] for c in cpus.values()):
                self.alert("cpu-all:" + name, "%s: ALL instances above %s%% CPU (real load, no restart)" % (name, t["cpu_stuck_pct"]))
                for i in online:
                    st["cnt"]["cpu%s" % i["pm_id"]] = 0
            else:
                for i in online:
                    sib = [c for k, c in cpus.items() if k != i["pm_id"]]
                    stuck = cpus[i["pm_id"]] >= t["cpu_stuck_pct"] and statistics.median(sib) < t["cpu_sibling_median_pct"]
                    if self.debounce(st, "cpu%s" % i["pm_id"], stuck, t["cpu_stuck_checks"]):
                        decs.append({"kind": "restart_inst", "ids": [i["pm_id"]], "reason": "instance %s CPU %.0f%% for %d checks, siblings median %.0f%%"
                                     % (i["pm_id"], cpus[i["pm_id"]], t["cpu_stuck_checks"], statistics.median(sib))})
                        st["cnt"]["cpu%s" % i["pm_id"]] = 0
        # nginx 502/504 burst while pm2 says online
        # the shared nginx error log is full of unrelated errors: only proxy errors naming THIS app's upstream count
        port_re = re.compile(r'upstream: "\w+://(127\.0\.0\.1|localhost|\[::1\]):%s[/"]' % app["port"]) if app.get("port") else None
        times = []
        for ln in self.new_lines(self.P["nginx_error_log"]):
            if port_re and "[error]" in ln and port_re.search(ln):
                m = TS_RE.match(ln)
                try:
                    times.append(time.mktime(time.strptime(m.group(1), "%Y/%m/%d %H:%M:%S")) if m else self.now)
                except ValueError:
                    times.append(self.now)
        if self.window(st, "nginx", times, t["nginx_burst_window_s"]) >= t["nginx_burst_count"]:
            decs.append({"kind": "restart_app", "reason": ">=%d nginx 502/504 upstream errors in %ss while pm2 reports online" % (t["nginx_burst_count"], t["nginx_burst_window_s"])})
            st["events"]["nginx"] = []
        # app logs: EMFILE and pool starvation
        emf, pool = [], []
        # log paths come from pm2 jlist every run (the name embeds the pm_id and pm2-logrotate renames files)
        logs = [i["err_log"] for i in insts if i.get("err_log")] + list(app.get("app_log_files", []))
        for p in dict.fromkeys(logs):
            for ln in self.new_lines(p):
                if EMFILE_RE.search(ln):
                    emf.append(self.now)
                if POOL_RE.search(ln):
                    pool.append(self.now)
        if self.window(st, "emfile", emf, t["emfile_window_s"]) >= t["emfile_count"]:
            decs.append({"kind": "restart_app", "reason": "EMFILE errors in app log (fd exhaustion)"})
            st["events"]["emfile"] = []
        if self.window(st, "pool", pool, t["pool_window_s"]) >= t["pool_starvation_count"]:
            rows = self.pgb_pools()
            if rows is not None:
                idle = sum(int(r.get("sv_idle", 0) or 0) for r in rows)
                waiting = sum(int(r.get("cl_waiting", 0) or 0) for r in rows)
                if idle > 0 and waiting == 0:
                    decs.append({"kind": "reload_app", "reason": "pool starvation in app log but PgBouncer has %d idle servers, 0 waiting (leaked app pool)" % idle})
                    st["events"]["pool"] = []
        # fd usage near the soft limit
        for i in online:
            if not i["pid"]:
                continue
            try:
                used = len(os.listdir(os.path.join(self.P["proc_root"], str(i["pid"]), "fd")))
                with open(os.path.join(self.P["proc_root"], str(i["pid"]), "limits")) as f:
                    soft = next(int(l.split()[3]) for l in f if l.startswith("Max open files"))
            except (OSError, StopIteration, ValueError):
                continue
            hot = used * 100.0 / soft >= t["fd_pct"]
            if self.debounce(st, "fd%s" % i["pm_id"], hot, ft):
                decs.append({"kind": "restart_inst", "ids": [i["pm_id"]], "reason": "fd usage %d/%d (>= %s%%)" % (used, soft, t["fd_pct"])})
                st["cnt"]["fd%s" % i["pm_id"]] = 0
        # CLOSE_WAIT pile on the app port
        if app.get("port"):
            _, out = self.cmd("ss_bin", ["-tan"])
            cw = sum(1 for l in out.splitlines() if "CLOSE-WAIT" in l and l.split()[3:4] and l.split()[3].endswith(":%s" % app["port"]))
            if self.debounce(st, "closewait", cw > t["close_wait_max"], ft):
                decs.append({"kind": "restart_app", "reason": "%d CLOSE_WAIT sockets on port %s" % (cw, app["port"])})
                st["cnt"]["closewait"] = 0
        # worker heartbeat: missing file or a file older than this process's start = "no heartbeat yet" (never judged
        # during startup grace; after it only an alert). A heartbeat that was fresh and went stale follows heartbeat_action.
        hb = app.get("heartbeat_file")
        if hb and not starting:
            start_ts = self.now - min(i["up_s"] for i in online)
            try:
                mt = os.path.getmtime(hb)
            except OSError:
                mt = None
            if mt is None or mt < start_ts:
                log.info("INFO %s: no heartbeat yet (file %s %s)", name, hb, "missing" if mt is None else "older than process start")
                self.alert("hb-none:" + name, "%s: no worker heartbeat after startup grace (hook not deployed? alert only, no restart)" % name, dedupe_s=3600)
            elif self.now - mt > t["heartbeat_stale_s"]:
                reason = "worker heartbeat stale %ds (> %ss)" % (self.now - mt, t["heartbeat_stale_s"])
                if app.get("heartbeat_action", "alert") == "restart":
                    decs.append({"kind": "restart_app", "reason": reason})
                else:
                    log.warning("ALERT-ONLY %s: %s (heartbeat_action=alert; no restart)", name, reason)
                    self.alert("hb-stale:" + name, "%s: %s; heartbeat_action is alert-only" % (name, reason), dedupe_s=900)
        # readiness: logging/alert only, never a restart trigger (it depends on DB/Redis)
        if app.get("readiness_url"):
            rok, _ = http_get(app["readiness_url"], app.get("health_timeout_s", 5))
            if not rok:
                log.info("INFO app=%s readiness check failing (alert only, no restart)", name)
                if self.debounce(st, "readiness", True, ft):
                    self.alert("readiness:" + name, "%s readiness failing %d+ checks (DB/Redis dependent; no restart)" % (name, ft), dedupe_s=900)
            else:
                st["cnt"]["readiness"] = 0
        # dependency restarted
        for dn in dep_restarted:
            if dn in app.get("depends_on", []):
                decs.append({"kind": "reload_app", "reason": "dependency %s restarted" % dn})
        # env / config hash
        cur, old = self.app_hash(app), self.state["hashes"].get(name)
        if old is None:
            self.state["hashes"][name] = cur
        elif cur != old:
            decs.append({"kind": "reload_env", "reason": "env/config hash changed"})
        return decs

    @staticmethod
    def merge(decs):
        out = [d for d in decs if d["kind"] == "start_eco"][:1]
        for kind in ("restart_app", "reload_app"):
            hit = [d for d in decs if d["kind"] == kind]
            if hit:
                hit[0]["reason"] = "; ".join(d["reason"] for d in hit)
                return out + [hit[0]]
        inst = [d for d in decs if d["kind"] == "restart_inst"]
        if inst:
            out.append({"kind": "restart_inst", "ids": sorted({i for d in inst for i in d["ids"]}), "reason": "; ".join(d["reason"] for d in inst)})
        elif any(d["kind"] == "reload_env" for d in decs):
            out.append([d for d in decs if d["kind"] == "reload_env"][0])
        return out

    # ---------- execution ----------
    def act(self, app, st, decs, insts):
        if st["capped"]:
            log.warning("app=%s capped, awaiting 'watchdog.py --reset %s'; no action", app["name"], app["name"])
            return
        recent = [x for x in st["restarts"] if self.now - x < self.t["cap_window_s"]]
        st["restarts"] = recent
        if len(recent) >= self.t["cap_restarts"]:
            self.hit_cap(app, st, "%d auto-restarts in %ds" % (len(recent), self.t["cap_window_s"]))
            return
        if not self.dry:
            st["restarts"].append(self.now)
        app["_insts"] = [i for i in insts if i["status"] == "online"]
        ok = True
        for d in decs:
            self.decide(app["name"], d["kind"], d["reason"])
            if d["kind"] == "start_eco":
                eco = app.get("ecosystem_file")
                if not eco:
                    self.alert("noeco:" + app["name"], "%s: instance missing but no ecosystem_file in config" % app["name"])
                    continue
                if not self.dry:
                    self.cmd("pm2_bin", ["start", eco, "--only", app["pm2_name"]])
                    self.taken.append("%s:start" % app["name"])
            elif d["kind"] == "reload_env":
                if self.dry:
                    log.info("DRY-RUN would run pm2 reload %s --update-env", app["pm2_name"])
                else:
                    self.cmd("pm2_bin", ["reload", app["pm2_name"], "--update-env"])
                    self.taken.append("%s:reload-env" % app["name"])
                    if not self.wait_healthy(app, None, self.t["recheck_wait_s"]):
                        ok = self.staggered(app, insts, "restart", d["reason"])
            elif d["kind"] == "restart_inst":
                ok = self.staggered(app, [i for i in insts if i["pm_id"] in d["ids"]], "restart", d["reason"])
            else:  # restart_app / reload_app
                ok = self.staggered(app, insts, "restart" if d["kind"] == "restart_app" else "reload", d["reason"])
            if not ok:
                self.hit_cap(app, st, "escalation ladder exhausted (%s)" % d["reason"])
                return
        st["grace_until"] = time.time() + self.t["startup_grace_s"]
        if not self.dry:
            self.state["hashes"][app["name"]] = self.app_hash(app)
            self.alert("restart:" + app["name"], "%s auto-healed: %s" % (app["name"], "; ".join(d["reason"] for d in decs)), dedupe_s=0)

    # ---------- main run ----------
    def run(self):
        if os.path.exists(self.P["disabled_file"]):
            log.info("disabled (%s exists), exiting", self.P["disabled_file"])
            return 0
        if os.path.exists(self.P["deploy_lock"]):
            self.refresh_hashes()
            save_state(self.P["state_file"], self.state)
            log.info("deploy lock, no action")
            return 0
        jl = self.jlist()
        apps = self.cfg["apps"]
        if not jl:
            log.warning("pm2 jlist empty or failed: wrong user or PM2_HOME? skipping all actions")
            self.alert("jlist-empty", "pm2 jlist returned nothing; watchdog cannot see PM2 (user/PM2_HOME mismatch?)", dedupe_s=3600)
            save_state(self.P["state_file"], self.state)
            return 0
        down, restarted = self.check_deps()
        disk_full = False
        for dp in self.P.get("disk_paths") or [self.P["disk_path"]]:
            try:
                du = shutil.disk_usage(dp)
            except OSError:
                continue
            pct = du.used * 100.0 / du.total
            if pct >= self.t["disk_pct"]:
                disk_full = True
                self.alert("disk-full:" + dp, "disk %s at %.0f%% (>= %s%%): auto-restarts disabled (alert only)" % (dp, pct, self.t["disk_pct"]), dedupe_s=3600)
            elif pct >= self.t.get("disk_warn_pct", 90):
                self.alert("disk-warn:" + dp, "disk %s at %.0f%% (warning at %s%%, restarts blocked at %s%%)" % (dp, pct, self.t.get("disk_warn_pct", 90), self.t["disk_pct"]), dedupe_s=21600)
        self.check_idle_tx()
        self.check_postgres_blockers()
        blocked = 0
        for app in apps:
            app.pop("_insts", None)
            st = self.astate(app["name"])
            wait_on = [d for d in app.get("depends_on", []) if d in down]
            if wait_on or disk_full:
                blocked += 1
                log.info("app=%s blocked (%s down); alert only, no restart", app["name"], ",".join(wait_on) or "disk full")
                continue
            insts = self.instances(app, jl)
            if not insts:
                log.warning("app=%s not found in pm2 jlist as '%s'", app["name"], app["pm2_name"])
                continue
            decs = self.merge(self.evaluate(app, insts, restarted))
            if decs:
                self.act(app, st, decs, insts)
        if self.taken:
            log.info("run: checked %d apps (%d blocked), actions: %s", len(apps), blocked, ", ".join(self.taken))
        else:
            log.info("run: checked %d apps (%d blocked), no action", len(apps), blocked)
        save_state(self.P["state_file"], self.state)
        return 0


def main():
    ap = argparse.ArgumentParser(description="PM2 self-heal watchdog (one-shot)")
    ap.add_argument("--config", default="/etc/pm2-watchdog/config.json")
    ap.add_argument("--once", action="store_true", help="default behavior; the systemd timer provides the loop")
    ap.add_argument("--dry-run", action="store_true", help="log decisions, take no action")
    ap.add_argument("--reset", metavar="APP", help="clear cap and maintenance state for APP")
    ap.add_argument("--record-hashes", action="store_true", help="refresh stored env/config hashes (deploy script calls this)")
    ap.add_argument("--status", action="store_true", help="print state and recent decisions")
    args = ap.parse_args()
    try:
        cfg = load_config(args.config)
        setup_logging(cfg["paths"]["log_file"])
        w = Watchdog(cfg, args)
        if args.status:
            print(json.dumps({"dry_run": w.dry, "apps": w.state["apps"], "deps": w.state["deps"], "recent_decisions": w.state["decisions"][-15:]}, indent=1))
            return 0
        if args.record_hashes:
            w.refresh_hashes()
            save_state(w.P["state_file"], w.state)
            log.info("hashes recorded")
            return 0
        if args.reset:
            app = next((a for a in cfg["apps"] if a["name"] == args.reset), None)
            if not app:
                print("unknown app %s" % args.reset)
                return 1
            st = w.astate(app["name"])
            st.update({"cnt": {}, "restarts": [], "capped": False, "maint": False, "lag_since": None, "events": {}})
            flag = app.get("maintenance_flag_file")
            if flag and os.path.exists(flag):
                os.remove(flag)
            w.state["alerts_last"].pop("cap:" + app["name"], None)
            save_state(w.P["state_file"], w.state)
            log.info("reset app=%s (cap and maintenance cleared)", app["name"])
            return 0
        return w.run()
    except Exception as ex:
        try:
            log.error("internal error: %s: %s", type(ex).__name__, ex)
        except Exception:
            print("internal error: %s" % type(ex).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
