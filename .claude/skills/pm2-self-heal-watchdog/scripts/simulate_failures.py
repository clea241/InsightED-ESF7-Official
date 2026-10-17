#!/usr/bin/env python3
"""Prove every watchdog condition fires the right action.

Tier 1 (hermetic, default): local HTTP stub + fake pm2/systemctl/ss/kill/psql/nginx.
Tier 2 (real staging PM2): --tier2 --staging-host H --i-am-on-staging  (run ON the staging VM
or via ssh; it touches real processes of the app named by --pm2-name).
Prints a PASS/FAIL table; exits non-zero on any FAIL.
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
WATCHDOG = os.path.join(HERE, "watchdog.py")


# ------------------------------------------------------------------ fake binaries
def fake_main(tool, argv):
    d = os.environ["FAKE_DIR"]
    rd = lambda n, dflt="": open(os.path.join(d, n)).read() if os.path.exists(os.path.join(d, n)) else dflt
    with open(os.path.join(d, "cmds.log"), "a") as f:
        f.write("%s %s\n" % (tool, " ".join(argv)))
    verb = argv[0] if argv else ""
    if tool == "pm2" and verb == "jlist":
        print(rd("jlist.json", "[]"))
        return 0
    if tool == "ss":
        print(rd("ss.txt"))
        return 0
    if tool == "psql":
        cmd_str = " ".join(argv)
        if "SHOW" in cmd_str:
            print(rd("psql_pools.csv"))
        elif "pg_blocking_pids" in cmd_str:
            print(rd("psql_blockers.csv"))
        elif "pg_cancel_backend" in cmd_str:
            print("t")
        elif "pg_terminate_backend" in cmd_str:
            print("t")
        elif "count(*)" in cmd_str and "pg_stat_activity" in cmd_str:
            print(rd("psql_pid_alive.txt", "0"))
        elif "pg_backend_pid()" in cmd_str:
            print(rd("psql_own_pid.txt", "8888"))
        else:
            print(rd("psql_idle.csv"))
        return 0
    if tool == "nginx":
        return 0
    if tool == "systemctl":
        deps = json.loads(rd("deps.json", "{}"))
        unit = argv[-1]
        if verb == "is-active":
            ok = deps.get(unit, {}).get("active", True)
            print("active" if ok else "inactive")
            return 0 if ok else 3
        if verb == "show":
            print(deps.get(unit, {}).get("ts", "t0"))
            return 0
    heal_on = rd("heal_on.txt").split()
    key = "kill" if tool == "kill" else verb
    if key in heal_on:
        try:
            import urllib.request
            urllib.request.urlopen("http://127.0.0.1:%s/__heal" % rd("stub_port"), timeout=3).read()
        except Exception:
            pass
    return 0


# ------------------------------------------------------------------ HTTP stub
class Stub:
    def __init__(self):
        self.mode, self.lag = "ok", 0
        s = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                if self.path == "/__heal":
                    s.mode, s.lag = "ok", 0
                    self.send_response(200)
                    self.end_headers()
                    return
                if s.mode == "timeout":
                    time.sleep(1.5)
                code = 500 if s.mode == "500" else 200
                body = json.dumps({"status": "ok", "event_loop_lag_ms": s.lag}).encode()
                try:
                    self.send_response(code)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except OSError:
                    pass

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()


def free_listener():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    s.listen(64)

    def accept_loop():
        while True:
            try:
                s.accept()[0].close()
            except OSError:
                return
    threading.Thread(target=accept_loop, daemon=True).start()
    return s


# ------------------------------------------------------------------ sandbox
class Box:
    def __init__(self, stub, listener_port, worker=False):
        self.d = tempfile.mkdtemp(prefix="wdsim-")
        self.stub = stub
        stub.mode, stub.lag = "ok", 0
        p = lambda n: os.path.join(self.d, n)
        os.environ["FAKE_DIR"] = self.d
        open(p("stub_port"), "w").write(str(stub.port))
        for n in ("nginx.log", "app.log", "ss.txt", "cmds.log", "psql_pools.csv", "psql_idle.csv", "psql_blockers.csv", "psql_own_pid.txt", "psql_pid_alive.txt"):
            open(p(n), "w").close()
        open(p("env_file"), "w").write("A=1\n")
        os.makedirs(p("proc/4242/fd"), exist_ok=True)
        open(p("proc/4242/limits"), "w").write("Max open files            100                  100                  files\n")
        fake = lambda t: [sys.executable, os.path.abspath(__file__), "--fake", t]
        self.cfg = {
            "dry_run": False,
            "apps": [{
                "name": "api", "pm2_name": "api-esf7", "mode": "cluster", "expected_instances": 2,
                "health_url": "http://127.0.0.1:%d/health" % stub.port, "health_timeout_s": 0.5,
                "port": 3000, "env_files": [p("env_file")], "depends_on": ["pgbouncer", "redis"],
                "app_log_files": [p("app.log")], "ecosystem_file": "/srv/eco.cjs", "kill_timeout_ms": 0,
                "maintenance_flag_file": p("maint.flag")}],
            "dependencies": [
                {"name": "pgbouncer", "systemd_unit": "pgbouncer", "host": "127.0.0.1", "port": listener_port, "kind": "pgbouncer"},
                {"name": "redis", "systemd_unit": "redis", "host": "127.0.0.1", "port": listener_port, "kind": "redis"},
                {"name": "postgres", "systemd_unit": "postgresql", "host": "127.0.0.1", "port": listener_port, "kind": "postgres"}],
            "thresholds": {"recheck_wait_s": 1, "poll_interval_s": 0.2, "stagger_wait_s": 1, "kill_escalation_wait_s": 0,
                           "close_wait_max": 5, "nginx_burst_count": 3, "disk_pct": 101, "startup_grace_s": 0,
                           "blocker_cancel_wait_s": 0, "blocker_age_s": 120, "blocker_min_waiters": 3},
            "paths": {"state_file": p("state.json"), "deploy_lock": p("deploy.lock"), "disabled_file": p("DISABLED"),
                      "nginx_error_log": p("nginx.log"), "log_file": p("wd.log"), "proc_root": p("proc"), "disk_path": self.d},
            "binaries": {"pm2_bin": fake("pm2"), "systemctl_bin": fake("systemctl"), "ss_bin": fake("ss"),
                         "kill_bin": fake("kill"), "psql_bin": fake("psql"), "nginx_bin": fake("nginx")},
            "alerts": {"channel": "none"},
            "nginx_maintenance": {"enabled": True},
        }
        if worker:
            self.cfg["apps"].append({"name": "worker", "pm2_name": "worker-esf7", "mode": "fork", "expected_instances": 1,
                                     "heartbeat_file": p("hb"), "heartbeat_action": "restart", "depends_on": ["redis"], "env_files": [], "kill_timeout_ms": 0})
        self.set_jlist([(0, 10), (1, 10)])
        self.heal("restart reload")

    def p(self, n):
        return os.path.join(self.d, n)

    def set_jlist(self, rows, worker=True):
        out = [{"name": "api-esf7", "pm_id": i, "pid": 4242 + i, "monit": {"cpu": c},
                "pm2_env": {"status": s if isinstance(s, str) else "online", "NODE_APP_INSTANCE": i, "exec_mode": "cluster_mode"}}
               for (i, c, *s) in [(r[0], r[1], *(r[2:3])) for r in rows] for s in [s[0] if s else "online"]]
        if worker:
            out.append({"name": "worker-esf7", "pm_id": 9, "pid": 5000, "monit": {"cpu": 1},
                        "pm2_env": {"status": "online", "exec_mode": "fork_mode"}})
        open(self.p("jlist.json"), "w").write(json.dumps(out))

    def patch_jlist(self, fn):
        j = json.load(open(self.p("jlist.json")))
        for x in j:
            fn(x)
        open(self.p("jlist.json"), "w").write(json.dumps(j))

    def heal(self, verbs):
        open(self.p("heal_on.txt"), "w").write(verbs)

    def write_cfg(self):
        json.dump(self.cfg, open(self.p("config.json"), "w"))

    def run(self, n=1, extra=()):
        self.write_cfg()
        for _ in range(n):
            subprocess.run([sys.executable, WATCHDOG, "--config", self.p("config.json"), "--once", *extra],
                           capture_output=True, text=True, timeout=120)

    def cmds(self):
        return [l.strip() for l in open(self.p("cmds.log")) if not l.startswith(("systemctl", "ss ", "nginx")) and "jlist" not in l]

    def log(self):
        return open(self.p("wd.log")).read()

    def state(self):
        return json.load(open(self.p("state.json")))

    def append(self, name, text):
        open(self.p(name), "a").write(text)

    def clear_cmds(self):
        open(self.p("cmds.log"), "w").close()


# ------------------------------------------------------------------ tier 1 cases
def has(b, s):
    return any(s in c for c in b.cmds())


def nginx_line(port=3000):
    return time.strftime("%Y/%m/%d %H:%M:%S") + ' [error] 1#1: *9 upstream timed out while reading response header from upstream, upstream: "http://127.0.0.1:%d/api"\n' % port


def build_cases():
    C = []

    def case(name):
        def deco(f):
            C.append((name, f))
            return f
        return deco

    @case("health 500 x3 -> restart")
    def _(b):
        b.run(1); b.stub.mode = "500"; b.run(2)
        if has(b, "pm2 restart"):
            return False, "fired before 3 failures"
        b.run(1)
        return has(b, "pm2 restart 0") and has(b, "pm2 restart 1") and not has(b, "pm2 reload"), b.cmds()

    @case("health timeout x3 -> restart")
    def _(b):
        b.run(1); b.stub.mode = "timeout"; b.run(3)
        return has(b, "pm2 restart"), b.cmds()

    @case("lag sustained -> reload (staggered, one at a time)")
    def _(b):
        b.run(1); b.stub.lag = 900
        st = b.state(); st["apps"]["api"]["lag_since"] = time.time() - 300
        json.dump(st, open(b.p("state.json"), "w")); b.run(1)
        c = b.cmds()
        return has(b, "pm2 reload 0") and has(b, "pm2 reload 1") and c.index("pm2 reload 0") < c.index("pm2 reload 1") and not has(b, "pm2 restart"), c

    @case("one instance CPU>90 x3, siblings<50 -> restart that id only")
    def _(b):
        b.set_jlist([(0, 99), (1, 10)]); b.run(3)
        return has(b, "pm2 restart 0") and not has(b, "pm2 restart 1"), b.cmds()

    @case("all instances high CPU -> alert only")
    def _(b):
        b.set_jlist([(0, 99), (1, 97)]); b.run(4)
        return not has(b, "pm2 restart") and "ALERT [cpu-all:api]" in b.log(), b.cmds()

    @case("missing/errored instance -> pm2 start ecosystem")
    def _(b):
        b.set_jlist([(0, 10), (1, 0, "errored")]); b.run(3)
        return has(b, "pm2 start /srv/eco.cjs --only api-esf7"), b.cmds()

    @case("502/504 burst in nginx log -> restart")
    def _(b):
        b.run(1); b.append("nginx.log", nginx_line() * 4); b.run(1)
        return has(b, "pm2 restart"), b.cmds()

    @case("nginx noise (unrelated errors, port digits) -> no action")
    def _(b):
        b.run(1)
        noise = time.strftime("%Y/%m/%d %H:%M:%S") + ' [error] 30001#3000: *3000 open() "/var/www/x/index.html" failed (2: No such file), client: 1.2.3.4, upstream: "http://127.0.0.1:30001/"' + chr(10)
        b.append("nginx.log", noise * 20); b.run(2)
        return not has(b, "pm2 restart"), b.cmds()

    @case("disk warning at 90% -> alert only, still acts below block threshold")
    def _(b):
        b.cfg["thresholds"].update({"disk_warn_pct": 0.0001, "disk_pct": 101})
        b.run(1); b.stub.mode = "500"; b.run(3)
        return "ALERT [disk-warn:" in b.log() and has(b, "pm2 restart"), b.cmds()

    @case("log paths read from pm2 jlist (EMFILE in pm_err_log_path)")
    def _(b):
        b.cfg["apps"][0]["app_log_files"] = []
        j = json.load(open(b.p("jlist.json")))
        for x in j:
            if x["name"] == "api-esf7":
                x["pm2_env"]["pm_err_log_path"] = b.p("err-%d.log" % x["pm_id"])
        json.dump(j, open(b.p("jlist.json"), "w"))
        for i in (0, 1):
            open(b.p("err-%d.log" % i), "w").close()
        b.run(1); b.append("err-0.log", ("Error: EMFILE too many open files" + chr(10)) * 3); b.run(1)
        return has(b, "pm2 restart"), b.cmds()

    @case("fd near limit -> restart that instance")
    def _(b):
        for i in range(90):
            open(b.p("proc/4242/fd/%d" % i), "w").close()
        b.run(3)
        return has(b, "pm2 restart 0"), b.cmds()

    @case("EMFILE in app log -> restart")
    def _(b):
        b.run(1); b.append("app.log", "Error: EMFILE too many open files\n" * 3); b.run(1)
        return has(b, "pm2 restart"), b.cmds()

    @case("CLOSE_WAIT pile -> restart")
    def _(b):
        b.append("ss.txt", "CLOSE-WAIT 0 0 127.0.0.1:3000 1.2.3.4:5\n" * 8); b.run(3)
        return has(b, "pm2 restart"), b.cmds()

    @case("pool acquire-timeout + PgBouncer idle servers -> reload")
    def _(b):
        os.environ["PGB_ADMIN_PASSWORD"] = "x"
        b.append("psql_pools.csv", "database,user,cl_active,cl_waiting,sv_active,sv_idle\napp,app,1,0,1,5\n")
        b.run(1); b.append("app.log", "timeout acquiring connection\n" * 3); b.run(1)
        os.environ.pop("PGB_ADMIN_PASSWORD")
        return has(b, "pm2 reload 0"), b.cmds()

    @case("PgBouncer/Redis restarted -> staggered reload")
    def _(b):
        b.run(1)
        json.dump({"redis": {"ts": "t1"}}, open(b.p("deps.json"), "w")); b.run(1)
        c = b.cmds()
        return has(b, "pm2 reload 0") and has(b, "pm2 reload 1"), c

    @case("env hash changed -> reload --update-env")
    def _(b):
        b.run(1); open(b.p("env_file"), "w").write("A=2\n"); b.run(1)
        return has(b, "pm2 reload api-esf7 --update-env"), b.cmds()

    @case("stale worker heartbeat -> restart worker only")
    def _(b):
        open(b.p("hb"), "w").write("1")
        old = time.time() - 600; os.utime(b.p("hb"), (old, old)); b.run(1)
        return has(b, "pm2 restart 9") and not has(b, "pm2 restart 0"), b.cmds()

    @case("per-instance URL list: only the failing instance is restarted")
    def _(b):
        # instance 0 -> stub port (healthy); instance 1 -> stub port + 1 (nothing listening)
        b.cfg["apps"][0]["instance_health_base_port"] = b.stub.port
        b.run(3)
        return has(b, "pm2 restart 1") and not has(b, "pm2 restart 0"), b.cmds()

    @case("grace: port not yet listening on a fresh instance -> not judged")
    def _(b):
        b.cfg["apps"][0]["instance_health_base_port"] = b.stub.port
        b.cfg["thresholds"]["startup_grace_s"] = 60
        now_ms = time.time() * 1000
        b.patch_jlist(lambda x: x["pm2_env"].update(pm_uptime=now_ms - 5000) if x["pm_id"] == 1 else None)
        b.run(5)
        return not has(b, "pm2 restart") and "startup grace" in b.log(), b.cmds()

    @case("grace over: same dead port on an old instance -> restarted")
    def _(b):
        b.cfg["apps"][0]["instance_health_base_port"] = b.stub.port
        b.cfg["thresholds"]["startup_grace_s"] = 60
        old_ms = (time.time() - 1000) * 1000
        b.patch_jlist(lambda x: x["pm2_env"].update(pm_uptime=old_ms))
        b.run(3)
        return has(b, "pm2 restart 1") and not has(b, "pm2 restart 0"), b.cmds()

    @case("heartbeat file missing -> no restart (one 'no heartbeat' alert)")
    def _(b):
        b.run(4)
        return not has(b, "pm2 restart 9") and "ALERT [hb-none:worker]" in b.log(), b.cmds()

    @case("heartbeat older than process start -> 'no heartbeat yet', no restart")
    def _(b):
        open(b.p("hb"), "w").write("1")
        old = time.time() - 600
        os.utime(b.p("hb"), (old, old))
        b.cfg["thresholds"]["startup_grace_s"] = 60
        started_ms = (time.time() - 300) * 1000
        b.patch_jlist(lambda x: x["pm2_env"].update(pm_uptime=started_ms) if x["name"] == "worker-esf7" else None)
        b.run(3)
        return not has(b, "pm2 restart 9") and "older than process start" in b.log(), b.cmds()

    @case("heartbeat grace: fresh process with no file -> not judged")
    def _(b):
        b.cfg["thresholds"]["startup_grace_s"] = 60
        started_ms = (time.time() - 10) * 1000
        b.patch_jlist(lambda x: x["pm2_env"].update(pm_uptime=started_ms) if x["name"] == "worker-esf7" else None)
        b.run(3)
        return not has(b, "pm2 restart 9") and "ALERT [hb-none:worker]" not in b.log(), b.cmds()

    @case("stale heartbeat with heartbeat_action=alert (default) -> alert only")
    def _(b):
        b.cfg["apps"][1].pop("heartbeat_action")
        open(b.p("hb"), "w").write("1")
        old = time.time() - 600
        os.utime(b.p("hb"), (old, old))
        b.run(2)
        return not has(b, "pm2 restart 9") and "ALERT [hb-stale:worker]" in b.log(), b.cmds()

    @case("unresponsive after restart -> kill -9 step")
    def _(b):
        b.run(1); b.stub.mode = "500"; b.heal("kill"); b.run(3)
        c = b.cmds()
        return has(b, "kill -9") and has(b, "pm2 restart"), c

    @case("ladder exhausted -> cap, ONE cap alert, maintenance flag")
    def _(b):
        b.run(1); b.stub.mode = "500"; b.heal(""); b.run(5)
        return b.log().count("ALERT [cap:api]") == 1 and os.path.exists(b.p("maint.flag")), b.log()[-600:]

    @case("dependency down -> no restarts, ONE alert")
    def _(b):
        b.run(1); b.stub.mode = "500"
        json.dump({"redis": {"active": False}}, open(b.p("deps.json"), "w")); b.run(5)
        return not has(b, "pm2 restart") and b.log().count("ALERT [dep-down:redis]") == 1, b.cmds()

    @case("postgres down -> no restarts (alert only)")
    def _(b):
        b.cfg["apps"][0]["depends_on"].append("postgres")
        b.run(1); b.stub.mode = "500"
        json.dump({"postgresql": {"active": False}}, open(b.p("deps.json"), "w")); b.run(4)
        return not has(b, "pm2 restart") and "ALERT [dep-down:postgres]" in b.log(), b.cmds()

    @case("disk full -> alert only")
    def _(b):
        b.cfg["thresholds"]["disk_pct"] = 0.0001
        b.run(1); b.stub.mode = "500"; b.run(4)
        return not has(b, "pm2 restart") and "ALERT [disk-full:" in b.log(), b.cmds()

    @case("disk_paths list: one path over block threshold -> alert names that path, no restart")
    def _(b):
        other = tempfile.mkdtemp(prefix="wdsim-disk-")
        b.cfg["paths"]["disk_paths"] = [other, b.d]
        b.cfg["thresholds"].update({"disk_warn_pct": 0.0001, "disk_pct": 101})
        b.run(1); b.stub.mode = "500"; b.run(3)
        warn_both = b.log().count("ALERT [disk-warn:") == 2 and has(b, "pm2 restart")
        b.cfg["thresholds"]["disk_pct"] = 0.0001
        b.clear_cmds(); b.run(3)
        return warn_both and ("ALERT [disk-full:%s]" % b.d) in b.log() and not has(b, "pm2 restart"), b.log()[-500:]

    @case("deploy lock -> no actions, hashes refreshed")
    def _(b):
        b.run(1); open(b.p("deploy.lock"), "w").close(); b.stub.mode = "500"
        open(b.p("env_file"), "w").write("A=3\n"); b.run(4)
        h_locked = b.state()["hashes"]["api"]
        os.remove(b.p("deploy.lock")); b.stub.mode = "ok"; b.clear_cmds(); b.run(1)
        return not has(b, "pm2 restart") and not has(b, "reload") and "deploy lock, no action" in b.log() and h_locked, b.cmds()

    @case("restart loop -> cap after 3 restarts/15min, ONE cap alert, maintenance")
    def _(b):
        b.run(1)
        for _ in range(3):
            b.stub.mode = "500"; b.run(3)
        n_before = sum(1 for c in b.cmds() if c.startswith("pm2 restart 0"))
        b.stub.mode = "500"; b.run(4)
        n_after = sum(1 for c in b.cmds() if c.startswith("pm2 restart 0"))
        return n_before == 3 and n_after == 3 and b.log().count("ALERT [cap:api]") == 1 and os.path.exists(b.p("maint.flag")), (n_before, n_after)

    @case("--reset clears cap + maintenance")
    def _(b):
        b.run(1); b.stub.mode = "500"; b.heal(""); b.run(5)
        b.run(1, ("--reset", "api"))
        return not os.path.exists(b.p("maint.flag")) and not b.state()["apps"]["api"]["capped"], ""

    @case("DISABLED file -> no action")
    def _(b):
        b.run(1); open(b.p("DISABLED"), "w").close(); b.stub.mode = "500"; b.run(4)
        return not has(b, "pm2 restart") and "disabled" in b.log(), b.cmds()

    @case("dry-run -> decisions logged, no commands")
    def _(b):
        b.cfg["dry_run"] = True
        b.run(1); b.stub.mode = "500"; b.run(3)
        return "DECISION app=api action=restart_app" in b.log() and not has(b, "pm2 restart"), b.cmds()

    @case("idle-in-transaction -> alert only, never terminate")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_idle.csv", "pid,application_name,left\n77,esf7,update foo\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return "ALERT [idle-tx]" in b.log() and not has(b, "terminate"), b.cmds()

    @case("postgres blocker cancelled when dead after cancel")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n101,esf7_app,node_worker,active,200,4,DELETE FROM school_drafts WHERE id=1\n")
        b.append("psql_pid_alive.txt", "0\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return has(b, "pg_cancel_backend(101)") and not has(b, "pg_terminate_backend(101)") and "ALERT [blocker-kill:101]" in b.log(), b.cmds()

    @case("postgres blocker terminated after cancel fails")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n102,esf7_app,node_worker,active,200,4,UPDATE esf7_personnel SET foo=1\n")
        b.append("psql_pid_alive.txt", "1\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return has(b, "pg_cancel_backend(102)") and has(b, "pg_terminate_backend(102)") and "ALERT [blocker-kill:102]" in b.log(), b.cmds()

    @case("postgres blocker allowlisted session skipped")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n103,Administrator1,pg_dump,active,300,5,DELETE FROM temp_table\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return not has(b, "pg_cancel_backend(103)") and not has(b, "pg_terminate_backend(103)") and "skipped: user Administrator1 is allowlisted" in b.log(), b.cmds()

    @case("postgres blocker fewer than 3 waiters skipped")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n104,esf7_app,node_worker,active,200,2,DELETE FROM drafts\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return not has(b, "pg_cancel_backend(104)") and not has(b, "pg_terminate_backend(104)") and "waiters 2 < 3" in b.log(), b.cmds()

    @case("postgres blocker session younger than 2 minutes skipped")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n105,esf7_app,node_worker,active,60,4,DELETE FROM drafts\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return not has(b, "pg_cancel_backend(105)") and not has(b, "pg_terminate_backend(105)") and "age 60s < 120s" in b.log(), b.cmds()

    @case("postgres blocker own pid skipped")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_own_pid.txt", "8888\n")
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n8888,pm2_watchdog,psql,active,300,5,DELETE FROM test\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return not has(b, "pg_cancel_backend(8888)") and not has(b, "pg_terminate_backend(8888)") and "watchdog's own backend pid" in b.log(), b.cmds()

    @case("postgres blocker cap reached (2 kills per 15 min -> alert only)")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n107,esf7_app,node_worker,active,200,4,DELETE FROM drafts\n")
        b.run(1)
        st = b.state()
        st["blocker_kills"] = [time.time() - 30, time.time() - 60]
        json.dump(st, open(b.p("state.json"), "w"))
        b.clear_cmds()
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return not has(b, "pg_cancel_backend(107)") and not has(b, "pg_terminate_backend(107)") and "CAP-REACHED" in b.log() and "ALERT [blocker-cap]" in b.log(), b.cmds()

    @case("postgres blocker dry-run (log only, no cancel or terminate)")
    def _(b):
        os.environ["WATCHDOG_PG_PASSWORD"] = "x"
        b.cfg["dry_run"] = True
        b.append("psql_blockers.csv", "pid,usename,application_name,state,age_seconds,waiter_count,query\n108,esf7_app,node_worker,active,200,4,DELETE FROM drafts\n")
        b.run(1); os.environ.pop("WATCHDOG_PG_PASSWORD")
        return not has(b, "pg_cancel_backend(108)") and not has(b, "pg_terminate_backend(108)") and "DRY-RUN would cancel and terminate" in b.log() and "DECISION app=postgres action=dry_blocker_kill" in b.log(), b.cmds()

    return C


def tier1(only=None):
    stub, lst = Stub(), free_listener()
    rows, fails = [], 0
    for name, fn in build_cases():
        if only and only not in name:
            continue
        b = Box(stub, lst.getsockname()[1], worker=True)
        try:
            ok, detail = fn(b)
            ok = bool(ok)
        except Exception as ex:
            ok, detail = False, "%s: %s" % (type(ex).__name__, ex)
        rows.append((name, ok))
        fails += not ok
        if not ok:
            print("  FAIL detail [%s]: %s" % (name, detail))
    print("\n%-70s %s" % ("TIER 1 CONDITION", "RESULT"))
    for n, ok in rows:
        print("%-70s %s" % (n, "PASS" if ok else "FAIL"))
    print("\n%d/%d passed" % (len(rows) - fails, len(rows)))
    return fails


# ------------------------------------------------------------------ tier 2 (real staging PM2)
def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


def tier2(a):
    if not (a.staging_host and a.i_am_on_staging):
        print("tier 2 needs --staging-host and --i-am-on-staging"); return 2
    cfgp = a.config
    lock = json.load(open(cfgp))["paths"]["deploy_lock"]
    wd = "python3 %s --config %s --once" % ("/opt/pm2-watchdog/watchdog.py", cfgp)

    def pids():
        j = json.loads(sh("pm2 jlist"))
        return [(p["pm_id"], p["pid"], p["pm2_env"]["status"]) for p in j if p["name"] == a.pm2_name]
    stopped, results = [], []
    try:
        if not pids():
            print("no pm2 app named %s" % a.pm2_name); return 2
        pid0 = pids()[0][1]
        sh("kill -9 %d" % pid0); time.sleep(3); sh(wd); sh(wd); sh(wd)
        results.append(("killed worker brought back", all(s == "online" for _, _, s in pids())))
        sid, spid, _ = pids()[0]
        sh("kill -STOP %d" % spid); stopped.append(spid)
        for _ in range(4):
            sh(wd); time.sleep(a.interval)
        results.append(("frozen worker recovered by ladder", spid not in [p for _, p, _ in pids()]))
        sh("kill -CONT %d" % spid) if spid in [p for _, p, _ in pids()] else None
        sh("pm2 stop %d" % pids()[0][0]); time.sleep(1)
        for _ in range(4):
            sh(wd)
        results.append(("stopped instance brought back", all(s == "online" for _, _, s in pids())))
        open(lock, "w").close(); sh("pm2 stop %d" % pids()[0][0])
        for _ in range(3):
            sh(wd)
        results.append(("no action during deploy lock", any(s != "online" for _, _, s in pids())))
    finally:
        for p in stopped:
            sh("kill -CONT %d" % p)
        if os.path.exists(lock):
            os.remove(lock)
        for i, _, s in pids():
            if s != "online":
                sh("pm2 start %d" % i)
    for n, ok in results:
        print("%-50s %s" % (n, "PASS" if ok else "FAIL"))
    return sum(not ok for _, ok in results)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--fake":
        sys.exit(fake_main(sys.argv[2], sys.argv[3:]))
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier2", action="store_true")
    ap.add_argument("--staging-host")
    ap.add_argument("--i-am-on-staging", action="store_true")
    ap.add_argument("--config", default="/etc/pm2-watchdog/config.json")
    ap.add_argument("--pm2-name", default="")
    ap.add_argument("--interval", type=int, default=30)
    ap.add_argument("--only", help="run only tier-1 cases whose name contains this text")
    a = ap.parse_args()
    sys.exit(1 if (tier2(a) if a.tier2 else tier1(a.only)) else 0)


if __name__ == "__main__":
    main()
