#!/usr/bin/env python3
"""Shared deploy logic for deploy_esf7_staging.py and deploy_esf7_prod.py.

Each environment's script is only a `Target` (host, root, port, PM2 name, ecosystem file, URLs); everything else
(command running, gates, archive, build info, remote steps, health/smoke checks, rollback) lives here so the two
scripts cannot drift apart again.

A deploy only prints "Deployment Complete" when EVERY check passed. Any failure after the server was touched restores
the previous release from `<REMOTE_ROOT>.prev`, reloads PM2, re-checks health and exits non-zero.

Python 3.9+ standard library only.
"""
import argparse
import base64
import datetime
import fnmatch
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
from dataclasses import dataclass, field

if sys.platform == "win32":  # emojis in the Windows console
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# --- COLORS / LOGGING -----------------------------------------------------------------------------------------
GREEN = "\033[0;32m"
RED = "\033[0;31m"
CYAN = "\033[0;36m"
YELLOW = "\033[1;33m"
NC = "\033[0m"


def info(msg): print(f"{CYAN}ℹ️   {msg}{NC}", flush=True)
def success(msg): print(f"{GREEN}✅ {msg}{NC}", flush=True)
def warn(msg): print(f"{YELLOW}⚠️   {msg}{NC}", flush=True)
def error(msg): print(f"{RED}❌ {msg}{NC}", flush=True)


class DeployError(Exception):
    """A step failed. `touched_server` says whether the release on the server may already be modified."""


# --- TARGET CONFIG ------------------------------------------------------------------------------------------
@dataclass
class Target:
    name: str                      # "staging" | "production": also written to BUILD_INFO.json
    title: str                     # banner text
    remote_host: str
    remote_user: str
    remote_root: str
    port: int
    pm2_name: str                  # backend process
    ecosystem_config: str
    archive_name: str
    public_url: str
    vite_base_path: str
    vite_api_url: str
    db_name: str                   # the database this environment must be using (checked before backup/migrate)
    path_token: str                # "staging" / "prod": must appear in root, pm2 name and ecosystem file
    other_token: str               # the OTHER environment's token: must appear in none of them
    gate: str = "light"            # "strict" (npm run verify stamp) | "light" (clean tree, not behind remote)
    use_watchdog_lock: bool = False
    stream_precheck: bool = False
    ssh_strict_host_key: str = "accept-new"
    ssh_alive_interval: int = 15
    extra_archive: tuple = ()
    migrations: tuple = ("migrations/add_personnel_parity_columns.js",)
    backup_dir: str = "/var/backups/esf7"
    ssh_key_path: str = field(default_factory=lambda: os.path.expanduser("~/.ssh/id_rsa").replace("\\", "/"))
    verify_stamp: str = ".verify-passed"
    verify_max_age_hours: int = 24
    health_path: str = "/api/health/readiness"
    # Where ops scripts (migrations, backup, checks) reach the REAL database server directly. PgBouncer runs on the VM and
    # forwards to a remote server; the VM's own port 5432 is a different Postgres. Passed only to ops scripts, never to the app.
    db_direct_host: str = ""

    @property
    def prev_root(self): return f"{self.remote_root}.prev"
    @property
    def ssh_target(self): return f"{self.remote_user}@{self.remote_host}"

    def ssh_opts(self):
        opts = [
            "-o", "BatchMode=yes",
            "-o", f"StrictHostKeyChecking={self.ssh_strict_host_key}",
            "-o", "ConnectTimeout=10",
            "-o", f"ServerAliveInterval={self.ssh_alive_interval}",
            "-o", "ServerAliveCountMax=3",
        ]
        if os.path.exists(self.ssh_key_path):
            opts.extend(["-i", self.ssh_key_path])
        return opts


# --- ARGUMENTS ---------------------------------------------------------------------------------------------
def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Deploy ESF7 to the configured environment")
    p.add_argument("--skip-gate", action="store_true",
                   help="DANGEROUS: skip the pre-deploy gate (clean tree / verify stamp / behind-remote check)")
    p.add_argument("--ship-env", action="store_true",
                   help="ship the local .env files as .env.shipped; installed ONLY if the server has no .env, never overwrites")
    return p.parse_args(argv)


# --- PURE HELPERS (unit-tested in scripts/test_deploy_common.py) ------------------------------------------------
def should_exclude(name):
    """True for paths that must never go into the deploy archive. Windows backslashes are normalised first."""
    n = name.replace("\\", "/").strip("/")
    low = n.lower()
    parts = [p for p in low.split("/") if p not in ("", ".")]
    if not parts:
        return False
    if any(p in ("node_modules", ".git", ".turbo") for p in parts):
        return True
    if low.startswith(("server/uploads", "server/scratch", "server/backups", "server/tests")):
        return True
    base = parts[-1]
    if parts[0] == "server" and fnmatch.fnmatch(base, "test_*.js"):
        return True  # ad-hoc test scripts (one inserts fake rows into the live L&D table)
    if base.startswith(".env") and base != ".env.example":
        return True  # secrets live on the server, not in the archive
    if base.endswith((".tar.gz", ".log")) or ".bak" in base:
        return True
    return False


def build_info(sha, branch, environment, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return {
        "sha": sha,
        "branch": branch,
        "builtAtUtc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "environment": environment,
    }


def evaluate_consistency(target, apps):
    """Problems if the root, PM2 name, port and ecosystem file do not all belong to the target's environment.
    `apps` = [{name, port, cwd, logs:[...]}] read from the ecosystem file."""
    problems = []
    tok, other = target.path_token.lower(), target.other_token.lower()

    def check_text(label, value):
        v = (value or "").lower()
        if tok not in v:
            problems.append(f"{label} '{value}' does not look like the {target.name} environment (expected '{tok}')")
        if other in v:
            problems.append(f"{label} '{value}' contains '{other}': it belongs to the OTHER environment")

    check_text("REMOTE_ROOT", target.remote_root)
    check_text("PM2_NAME", target.pm2_name)
    check_text("ecosystem config", target.ecosystem_config)

    names = [a.get("name") for a in apps]
    if target.pm2_name not in names:
        problems.append(f"PM2 name '{target.pm2_name}' is not defined in {target.ecosystem_config} (it defines: {names})")
    for a in apps:
        check_text(f"ecosystem app '{a.get('name')}'", a.get("name"))
        for path in ([a.get("cwd")] if a.get("cwd") else []) + list(a.get("logs") or []):
            if path and other in path.lower():
                problems.append(f"ecosystem path '{path}' belongs to the OTHER environment")
            if path and path.startswith("/") and not path.startswith(target.remote_root):
                problems.append(f"ecosystem path '{path}' is outside REMOTE_ROOT '{target.remote_root}'")
    backend = next((a for a in apps if a.get("name") == target.pm2_name), None)
    if backend is not None and backend.get("port") is not None and int(backend["port"]) != int(target.port):
        problems.append(f"PORT {target.port} does not match the ecosystem file's port {backend['port']}")
    return problems


def evaluate_pm2(first, second, names):
    """Problems from two `pm2 jlist` samples taken some seconds apart: every process online, none restarting."""
    problems = []
    for name in names:
        a = [p for p in first if p.get("name") == name]
        b = {p.get("pm_id"): p for p in second if p.get("name") == name}
        if not a or not b:
            problems.append(f"{name}: not running")
            continue
        for p in a:
            q = b.get(p.get("pm_id"))
            status = (q or p).get("pm2_env", {}).get("status")
            if status != "online":
                problems.append(f"{name}[{p.get('pm_id')}]: status is '{status}', expected 'online'")
                continue
            r1 = p.get("pm2_env", {}).get("restart_time", 0)
            r2 = (q or p).get("pm2_env", {}).get("restart_time", 0)
            if r2 != r1:
                problems.append(f"{name}[{p.get('pm_id')}]: restarted {r2 - r1} time(s) during the check (restart loop)")
            if (q or p).get("pm2_env", {}).get("unstable_restarts", 0):
                problems.append(f"{name}[{p.get('pm_id')}]: unstable restarts reported")
    return problems


def parse_json_from_output(text):
    """Remote commands can print noise before JSON; take the first '[' or '{' onward."""
    for i, ch in enumerate(text):
        if ch in "[{":
            try:
                return json.loads(text[i:])
            except ValueError:
                continue
    raise ValueError("no JSON in output")


def evaluate_health(payload, sha, environment, require_build=True):
    problems = []
    if payload.get("db") != "up":
        problems.append(f"database is '{payload.get('db')}', expected 'up'")
    if require_build:
        build = payload.get("build") or {}
        if not build.get("sha"):
            problems.append("the running server reports no build SHA (old code is being served)")
        elif build.get("sha") != sha:
            problems.append(f"server runs {str(build.get('sha'))[:8]} but {sha[:8]} was deployed")
        if build.get("environment") and build.get("environment") != environment:
            problems.append(f"server build says environment '{build.get('environment')}', expected '{environment}'")
    return problems


# --- REMOTE SCRIPTS (pure string builders) --------------------------------------------------------------------
PATH_EXPORT = "export PATH=$PATH:/usr/local/bin:/home/Administrator1/.local/share/pnpm"


def script_snapshot(t):
    return (
        "set -e; "
        f"if [ -d {t.remote_root}/server ]; then "
        f"  sudo mkdir -p {t.prev_root} && sudo chown {t.remote_user}:{t.remote_user} {t.prev_root} && chmod 700 {t.prev_root}; "
        f"  find {t.prev_root} -mindepth 1 -maxdepth 1 -exec rm -rf {{}} +; "
        f"  (cd {t.remote_root} && tar cf - --exclude=./logs --exclude=./server/uploads --exclude='./*.tar.gz' .) "
        f"  | (cd {t.prev_root} && tar xf -); "
        "  echo SNAPSHOT_OK; "
        "else echo NO_PREVIOUS_RELEASE; fi"
    )


def script_clear_stale(t):
    """Remove what the archive owns from the old release, KEEPING uploads, logs, .env files and node_modules."""
    return (
        f"cd {t.remote_root} && "
        "if [ -d server ]; then "
        "find server -mindepth 1 -maxdepth 1 ! -name node_modules ! -name uploads ! -name .env -exec rm -rf {} + ; fi; "
        "rm -rf shared client/dist dist"
    )


def script_extract_install(t, ship_env):
    env_block = ""
    if ship_env:
        env_block = (
            "echo '       -> --ship-env: installing shipped env files ONLY where the server has none...'; "
            "[ -f .env.shipped ] && { [ -f .env ] && echo '       -> root .env exists: left untouched' || cp .env.shipped .env; }; "
            "[ -f server/.env.shipped ] && { [ -f server/.env ] && echo '       -> server/.env exists: left untouched' || cp server/.env.shipped server/.env; }; "
            "rm -f .env.shipped server/.env.shipped; "
        )
    return (
        "set -e; "
        f"{PATH_EXPORT}; "
        f"mkdir -p {t.remote_root}/logs {t.remote_root}/client/dist {t.remote_root}/dist && "
        f"{script_clear_stale(t)}; "
        f"cd {t.remote_root} && "
        f"tar -xzf {t.archive_name} && rm -f {t.archive_name} && "
        f"{env_block}"
        "mkdir -p dist && cp -rf client/dist/* dist/ 2>/dev/null || true; "
        f"sudo chown -R {t.remote_user}:{t.remote_user} {t.remote_root}; "
        "chmod -R a+rX dist client shared 2>/dev/null || true; "
        "if [ ! -f .env ] && [ ! -f server/.env ]; then "
        "echo '       !! WARNING: no .env on the server (root or server/). The app then relies on the PM2/systemd environment only.'; fi; "
        'echo "       -> Running production npm install..." && '
        "npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
        "cd server && npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
        'echo "       -> Verifying server entry and shared modules import cleanly before reload..." && '
        "node -e \"require('./utils/sharedRules').loadScheduleRules().then(() => console.log('       -> Shared rules import OK.')).catch(e => { console.error('FATAL: Shared rules import failed:', e); process.exit(1); })\""
    )


def script_pm2_reload(t):
    return (
        f"{PATH_EXPORT}; cd {t.remote_root} && "
        f"if pm2 describe {t.pm2_name} >/dev/null 2>&1; then "
        f"  echo '       -> Reloading {t.pm2_name} (--update-env)...'; "
        f"  pm2 reload {t.ecosystem_config} --update-env; "
        "else "
        "  echo '       -> Process not found; performing initial start...'; "
        f"  pm2 start {t.ecosystem_config} --update-env; "
        "fi && pm2 save"
    )


def direct_host_env(t):
    return f"DB_DIRECT_HOST={t.db_direct_host} " if t.db_direct_host else ""


def node_with_env(t, js_path, args=""):
    """Run a server-side script with the SAME environment PM2 gives the app."""
    return (
        f"{PATH_EXPORT}; cd {t.remote_root}/server && "
        f"{direct_host_env(t)}ESF7_ECOSYSTEM=../{t.ecosystem_config} node -r ./scripts/with_ecosystem_env.js {js_path} {args}".rstrip()
    )


def script_backup(t, dump):
    return (
        f"set -e; sudo mkdir -p {t.backup_dir} && sudo chown {t.remote_user}:{t.remote_user} {t.backup_dir}; "
        + node_with_env(t, "scripts/backup_database.js", f"--out {dump} --expect-db {t.db_name}")
    )


def script_rollback(t):
    return (
        "set -e; "
        f"{PATH_EXPORT}; "
        f"test -d {t.prev_root}/server || {{ echo NO_PREVIOUS_RELEASE; exit 3; }}; "
        f"{script_clear_stale(t)}; "
        f"cd {t.remote_root} && "
        f"(cd {t.prev_root} && tar cf - --exclude=./logs --exclude=./server/uploads --exclude=./.env --exclude=./server/.env .) "
        f"| (cd {t.remote_root} && tar xf -); "
        "echo RESTORED_FROM_PREV; "
        f"{script_pm2_reload(t)}"
    )


def smoke_token_js(t):
    return (
        "require('./loadEnv');\n"
        "let secret = process.env.JWT_SECRET;\n"
        "if (!secret) {\n"
        "  try {\n"
        f"    const eco = require('../{t.ecosystem_config}');\n"
        "    secret = (eco.apps || []).map((a) => (a.env || {}).JWT_SECRET).find(Boolean);\n"
        "  } catch (e) {}\n"
        "}\n"
        "if (!secret) {\n"
        "  try {\n"
        "    const list = JSON.parse(require('child_process').execSync('pm2 jlist', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());\n"
        f"    const proc = list.find((p) => p.name === '{t.pm2_name}');\n"
        "    secret = proc && proc.pm2_env && proc.pm2_env.JWT_SECRET;\n"
        "  } catch (e) {}\n"
        "}\n"
        "if (!secret) { console.error('JWT_SECRET not found'); process.exit(3); }\n"
        "console.log(require('jsonwebtoken').sign({ uid: 'smoke-000000', role: 'school', school_id: '000000' }, secret, { expiresIn: '5m' }));\n"
    )


SMOKE_TAGS = (
    ("HEALTH_OK", "health endpoint (database up)"),
    ("AUTH_OK", "request without a token is rejected (401)"),
    ("PASSCODE_OK", "verify-passcode endpoint (schedule rules loaded)"),
    ("SAVE_OK", "draft save confirmed"),
    ("READ_OK", "draft read back"),
    ("CLEANUP_OK", "smoke record removed"),
)


def script_smoke(t):
    base = f"http://127.0.0.1:{t.port}/api"
    token_b64 = base64.b64encode(smoke_token_js(t).encode()).decode()
    hdr = "-H 'Content-Type: application/json' -H 'x-school-id: 000000' -H 'x-smoke-test: 1' -H \"Authorization: Bearer $TOKEN\""
    body = '{"schoolYear":"SMOKE","payload":{"schoolInfo":{"schoolId":"000000"},"personnel":[],"smoke":true}}'
    return (
        f"{PATH_EXPORT}; set -e; "
        f"TOKEN=$(cd {t.remote_root}/server && echo {token_b64} | base64 -d | node -); "
        f"curl -sf {base}/health/readiness | grep -q '\"db\":\"up\"' && echo HEALTH_OK; "
        f"test \"$(curl -s -o /dev/null -w '%{{http_code}}' -H 'x-school-id: 000000' '{base}/school/draft?schoolYear=SMOKE')\" = 401 && echo AUTH_OK; "
        f"curl -s -X POST -H 'Content-Type: application/json' -d '{{\"schoolId\":\"000000\",\"passcode\":\"TEST999\"}}' {base}/room-profiling/verify-passcode | grep -q 'success' && echo PASSCODE_OK; "
        f"curl -sf -X PUT {hdr} -d '{body}' {base}/school/draft | grep -q '\"success\":true' && echo SAVE_OK; "
        f"curl -sf {hdr} '{base}/school/draft?schoolYear=SMOKE' | grep -q '\"smoke\":true' && echo READ_OK; "
        f"curl -sf -X DELETE {hdr} '{base}/school/draft?schoolYear=SMOKE' | grep -q '\"success\":true' && echo CLEANUP_OK"
    )


# --- THE DEPLOYER ---------------------------------------------------------------------------------------------
class Deployer:
    def __init__(self, target, args):
        self.t = target
        self.args = args
        self.sha = ""
        self.branch = ""
        self.touched_server = False
        self.locked = False

    # --- running commands ---
    def run(self, cmd, capture=False, timeout=120, retries=1, delay=3, must=None):
        """Run a command. Retries are for CONNECTIVITY steps only (pass retries>1 explicitly).
        `must` = message: raise DeployError when the command still fails."""
        cmd_str = cmd if isinstance(cmd, str) else " ".join(cmd)
        is_network = "ssh" in cmd_str or "scp" in cmd_str
        attempts = retries if is_network else 1
        result = None
        for attempt in range(1, attempts + 1):
            if not capture:
                prefix = f"[Attempt {attempt}/{attempts}] " if is_network else ""
                print(f"{CYAN}> {prefix}Running: {cmd_str[:300]}{NC}", flush=True)
            try:
                result = subprocess.run(
                    cmd, shell=isinstance(cmd, str), capture_output=capture, text=True,
                    encoding="utf-8", errors="replace", timeout=timeout, stdin=subprocess.DEVNULL,
                )
                if result.returncode == 0:
                    return result
                if attempt < attempts:
                    warn(f"Command returned exit code {result.returncode}. Retrying in {delay}s...")
            except subprocess.TimeoutExpired:
                result = subprocess.CompletedProcess(cmd, 124, "", "timed out")
                if attempt < attempts:
                    warn(f"Command timed out after {timeout}s. Retrying in {delay}s...")
            if attempt < attempts:
                time.sleep(delay)
        if result is None or result.returncode == 0:
            result = subprocess.CompletedProcess(cmd, 1, "", "failed")
        if must:
            raise DeployError(f"{must} (exit code {result.returncode})")
        return result

    def ssh(self, script, **kw):
        return self.run(["ssh"] + self.t.ssh_opts() + [self.t.ssh_target, script], **kw)

    def git(self, *args):
        r = subprocess.run(["git", *args], capture_output=True, text=True)
        return r.returncode, r.stdout.strip()

    # --- 1. gates ---
    def gate(self):
        t = self.t
        rc, self.sha = self.git("rev-parse", "HEAD")
        _, self.branch = self.git("rev-parse", "--abbrev-ref", "HEAD")
        if rc != 0 or not self.sha:
            raise DeployError("not a git checkout: cannot tell which commit is being deployed")
        info(f"Deploying branch '{self.branch}' at commit {self.sha[:8]} to {t.name.upper()}")

        if self.args.skip_gate:
            warn("=" * 66)
            warn("--skip-gate: the pre-deploy gate is SKIPPED. Nothing vouches for this commit.")
            warn("=" * 66)
            return
        _, dirty = self.git("status", "--porcelain", "--untracked-files=no")
        if dirty:
            raise DeployError("Deploy gate: tracked files have uncommitted changes. Commit them first (or use --skip-gate).")
        if t.gate == "strict":
            self._strict_gate()
        else:
            self._light_gate()
        success(f"Deploy gate passed for {self.sha[:8]} on '{self.branch}'.")

    def _light_gate(self):
        rc, upstream = self.git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
        if rc != 0 or not upstream:
            warn(f"Branch '{self.branch}' has no upstream: cannot check whether it is behind its remote.")
            return
        rc, _ = self.git("fetch", "--quiet")
        if rc != 0:
            raise DeployError("Deploy gate: could not reach the git remote to verify the branch is up to date (use --skip-gate to override).")
        rc, behind = self.git("rev-list", "--count", f"HEAD..{upstream}")
        if rc != 0 or not behind.isdigit():
            raise DeployError("Deploy gate: could not compare the branch with its remote.")
        if int(behind) > 0:
            raise DeployError(f"Deploy gate: '{self.branch}' is {behind} commit(s) BEHIND {upstream}. Pull first (or use --skip-gate).")

    def _strict_gate(self):
        t = self.t
        info("Deploy gate: checking that `npm run verify` passed for this commit...")
        if not os.path.exists(t.verify_stamp):
            raise DeployError(f"Deploy gate: {t.verify_stamp} not found. Run `npm run verify` first.")
        try:
            with open(t.verify_stamp, "r", encoding="utf-8") as fh:
                stamp = json.load(fh)
        except (OSError, ValueError):
            raise DeployError(f"Deploy gate: {t.verify_stamp} is unreadable. Run `npm run verify` again.")
        if stamp.get("commit") != self.sha:
            raise DeployError(f"Deploy gate: verify passed for {str(stamp.get('commit'))[:8]}, but HEAD is {self.sha[:8]}. Run `npm run verify` on this commit.")
        if stamp.get("dirty"):
            raise DeployError("Deploy gate: verify ran with uncommitted changes, so it does not vouch for this commit.")
        try:
            verified_at = datetime.datetime.fromisoformat(stamp["verifiedAt"].replace("Z", "+00:00"))
            age_h = (datetime.datetime.now(datetime.timezone.utc) - verified_at).total_seconds() / 3600
        except (KeyError, ValueError):
            raise DeployError("Deploy gate: verify stamp has no valid timestamp. Run `npm run verify` again.")
        if age_h > t.verify_max_age_hours:
            raise DeployError(f"Deploy gate: verify passed {age_h:.0f}h ago (limit {t.verify_max_age_hours}h). Run `npm run verify` again.")
        # The environment check only means something for env files that are actually shipped.
        if self.args.ship_env:
            r = subprocess.run(f"node scripts/check-env.mjs --strict --ecosystem {t.ecosystem_config}", shell=True)
            if r.returncode != 0:
                raise DeployError("Deploy gate: environment check failed (see messages above).")

    # --- 2. same-environment consistency ---
    def check_consistency(self):
        t = self.t
        js = (
            "const p=require('path');const e=require(p.resolve(process.argv[1]));"
            "console.log(JSON.stringify((e.apps||[]).map(a=>({name:a.name,port:a.env&&a.env.PORT,cwd:a.cwd||null,"
            "logs:[a.error_file,a.out_file].filter(Boolean)}))))"
        )
        env = {k: v for k, v in os.environ.items() if k != "PORT"}
        r = subprocess.run(["node", "-e", js, t.ecosystem_config], capture_output=True, text=True, env=env)
        if r.returncode != 0:
            raise DeployError(f"Could not read {t.ecosystem_config}: {r.stderr.strip()[:200]}")
        problems = evaluate_consistency(t, json.loads(r.stdout))
        if problems:
            for p in problems:
                error(f"Config mismatch: {p}")
            raise DeployError("REMOTE_ROOT / PM2_NAME / PORT / ecosystem file do not all belong to the same environment. Nothing was changed.")
        success(f"Config is consistent for {t.name} (root, PM2 name, port {t.port}, {t.ecosystem_config}).")

    # --- 3. build + archive ---
    def sync_media_assets(self):
        info("Synchronizing media assets...")
        if os.path.exists("INSIGHTED LOADING.gif"):
            os.makedirs("client/public", exist_ok=True)
            shutil.copy2("INSIGHTED LOADING.gif", "client/public/INSIGHTED LOADING.gif")
            shutil.copy2("INSIGHTED LOADING.gif", "client/public/insighted_loading.gif")
        if os.path.exists("client/public") and os.path.exists("client/dist"):
            shutil.copytree("client/public", "client/dist", dirs_exist_ok=True)

    def build(self):
        t = self.t
        self.sync_media_assets()  # public assets must exist before the build too
        env = os.environ.copy()
        env["VITE_BASE_PATH"] = t.vite_base_path
        env["VITE_API_URL"] = t.vite_api_url
        env["NODE_OPTIONS"] = "--max-old-space-size=4096"
        try:
            subprocess.run("npm run build", shell=True, check=True, env=env, cwd="client")
        except subprocess.CalledProcessError:
            raise DeployError("Client build failed.")
        self.sync_media_assets()
        success("Client build & media synchronization complete.")

    def make_archive(self):
        t = self.t
        files = ["server", "shared", "client/dist", "package.json", "package-lock.json", t.ecosystem_config, *t.extra_archive]
        info_json = json.dumps(build_info(self.sha, self.branch, t.name), indent=2).encode()

        def keep(tarinfo):
            return None if should_exclude(tarinfo.name) else tarinfo

        with tarfile.open(t.archive_name, "w:gz") as tar:
            for f in files:
                if os.path.exists(f):
                    tar.add(f, filter=keep)
                    info(f"       + {f}")
                else:
                    warn(f"       [SKIP] not found: {f}")
            ti = tarfile.TarInfo("BUILD_INFO.json")
            ti.size = len(info_json)
            ti.mtime = int(time.time())
            tar.addfile(ti, io.BytesIO(info_json))
            info(f"       + BUILD_INFO.json ({self.sha[:8]} on {self.branch}, {t.name})")
            if self.args.ship_env:
                warn("--ship-env: shipping local env files as .env.shipped (installed only if the server has no .env).")
                for src, arc in ((".env", ".env.shipped"), ("server/.env", "server/.env.shipped")):
                    if os.path.exists(src):
                        tar.add(src, arcname=arc)
                        warn(f"       + {src} -> {arc}")
        success("Archive created (no local .env, uploads, scratch, backups or test scripts inside).")

    # --- 4. remote ---
    def engage_lock(self):
        if not self.t.use_watchdog_lock:
            return
        info("Engaging PM2 watchdog deploy lock (/var/lib/pm2-watchdog/deploy.lock)...")
        self.ssh("sudo mkdir -p /var/lib/pm2-watchdog && sudo touch /var/lib/pm2-watchdog/deploy.lock",
                 retries=3, delay=2, must="Could not engage the PM2 watchdog deploy lock")
        self.locked = True

    def release_lock(self):
        if not self.t.use_watchdog_lock or not self.locked:
            return
        info("Releasing watchdog deploy lock and recording fresh env/config hashes...")
        r = self.ssh(
            "sudo rm -f /var/lib/pm2-watchdog/deploy.lock; "
            "if [ -f /usr/local/bin/watchdog.py ]; then sudo python3 /usr/local/bin/watchdog.py --record-hashes 2>/dev/null || true; fi",
            retries=3, delay=2)
        if r.returncode != 0:
            error("COULD NOT RELEASE THE WATCHDOG DEPLOY LOCK. Remove /var/lib/pm2-watchdog/deploy.lock by hand, or the watchdog stays paused.")

    def stream_precheck(self):
        if not self.t.stream_precheck:
            return
        info("Running pre-deploy check on Redis submission stream...")
        res = self.ssh("redis-cli XPENDING esf7:submission_stream esf7_submission_group 2>/dev/null || echo '0'",
                       capture=True, retries=2, delay=2)
        lines = (res.stdout or "").strip().splitlines()
        pending = int(lines[0]) if lines and lines[0].isdigit() else 0
        if pending > 0:
            warn(f"Stream pre-check: {pending} pending unacknowledged entries. Ensure workers are draining.")
        else:
            success("Stream pre-check passed: 0 stuck pending entries.")

    def upload(self):
        t = self.t
        self.ssh(f"mkdir -p {t.remote_root}", retries=5, delay=3, must="Could not prepare the remote directory")
        scp = ["scp"] + t.ssh_opts() + [t.archive_name, f"{t.ssh_target}:{t.remote_root}/"]
        self.run(scp, retries=5, delay=3, timeout=600, must="Upload failed (check SSH key and connection)")
        success("Upload complete.")

    def snapshot(self):
        r = self.ssh(script_snapshot(self.t), capture=True, timeout=900, must="Could not snapshot the current release")
        out = r.stdout or ""
        if "SNAPSHOT_OK" in out:
            success(f"Previous release snapshotted to {self.t.prev_root} for rollback.")
        else:
            warn("No previous release on the server: a rollback is not possible for this deploy.")

    def extract_and_install(self):
        self.touched_server = True  # from here the live files change
        self.ssh(script_extract_install(self.t, self.args.ship_env), timeout=1500,
                 must="Remote extract / npm install failed")
        success("Remote extraction and install complete.")

    def verify_build_info(self):
        r = self.ssh(f"cat {self.t.remote_root}/BUILD_INFO.json", capture=True, retries=3, delay=2,
                     must="Could not read BUILD_INFO.json back from the server")
        try:
            remote = json.loads(r.stdout)
        except ValueError:
            raise DeployError("BUILD_INFO.json on the server is not valid JSON")
        if remote.get("sha") != self.sha:
            raise DeployError(f"The server holds commit {str(remote.get('sha'))[:8]} but {self.sha[:8]} was deployed: the wrong code reached the server")
        if remote.get("environment") != self.t.name:
            raise DeployError(f"BUILD_INFO says environment '{remote.get('environment')}', expected '{self.t.name}'")
        success(f"Server release verified: {self.sha[:8]} ({self.t.name}).")

    def backup_and_migrate(self):
        t = self.t
        if not t.migrations:
            info("No migrations to run for this deploy.")
            return
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dump = f"{t.backup_dir}/{t.db_name}_pre_deploy_{stamp}.dump"
        info(f"Backing up '{t.db_name}' to {dump} before migrations: {', '.join(t.migrations)}")
        r = self.ssh(script_backup(t, dump), capture=True, timeout=1800)
        if r.returncode != 0 or "BACKUP_VERIFIED" not in (r.stdout or ""):
            print(r.stdout, flush=True)
            print(r.stderr, flush=True)
            raise DeployError("Database backup FAILED or could not be verified. Migrations were NOT run.")
        success("Database backup written and verified (pg_restore --list OK).")
        for mig in t.migrations:
            info(f"Applying migration {mig}...")
            self.ssh(node_with_env(t, mig), timeout=600, must=f"Migration {mig} failed (restore from {dump} if needed)")
        success("Migrations applied.")

    def reload_pm2(self):
        self.ssh(script_pm2_reload(self.t), timeout=300, must="PM2 reload failed")
        success("PM2 reload complete.")

    # --- 5. post-deploy checks (all must pass) ---
    def _ecosystem_names(self):
        js = "const p=require('path');console.log(JSON.stringify((require(p.resolve(process.argv[1])).apps||[]).map(a=>a.name)))"
        r = subprocess.run(["node", "-e", js, self.t.ecosystem_config], capture_output=True, text=True)
        return json.loads(r.stdout)

    def pm2_samples(self):
        out = []
        for i in range(2):
            r = self.ssh(f"{PATH_EXPORT}; pm2 jlist", capture=True, retries=2, delay=2, must="Could not read PM2 status")
            out.append(parse_json_from_output(r.stdout))
            if i == 0:
                time.sleep(10)
        return out

    def check_pm2(self):
        info("Checking PM2 processes are online and not restarting...")
        first, second = self.pm2_samples()
        problems = evaluate_pm2(first, second, self._ecosystem_names())
        if problems:
            for p in problems:
                error(f"PM2: {p}")
            raise DeployError("PM2 is not healthy after the deploy")
        success("PM2: all processes online, no restart loop.")

    def check_health(self, expect_sha=True, attempts=12):
        t = self.t
        info(f"Checking http://127.0.0.1:{t.port}{t.health_path} (waiting for the new build)...")
        problems = ["no response"]
        for i in range(attempts):
            r = self.ssh(f"curl -s --max-time 8 http://127.0.0.1:{t.port}{t.health_path}", capture=True, retries=1)
            try:
                payload = parse_json_from_output(r.stdout or "")
                problems = evaluate_health(payload, self.sha, t.name, require_build=expect_sha)
                if not problems:
                    success(f"Health OK" + (f": server is running {self.sha[:8]}." if expect_sha else "."))
                    return
            except ValueError:
                problems = ["health endpoint did not return JSON"]
            if i < attempts - 1:
                time.sleep(5)
        for p in problems:
            error(f"Health: {p}")
        raise DeployError("Health check failed")

    def check_pipeline_and_schema(self):
        info("Running the merge-pipeline and schema checks on the server...")
        self.ssh(node_with_env(self.t, "scripts/check_merge_pipeline.js"), timeout=180,
                 must="Merge pipeline check failed (a table or column the Approve & Merge needs is missing)")
        self.ssh(node_with_env(self.t, "migrations/add_personnel_parity_columns.js", "--check"), timeout=180,
                 must="Schema parity check failed (the database is behind the code)")
        success("Merge pipeline and schema parity checks passed.")

    def smoke_test(self):
        info("Running the post-deploy smoke test (health, auth, passcode, draft save/read/delete)...")
        r = self.ssh(script_smoke(self.t), capture=True, timeout=90)
        out = r.stdout or ""
        ok = True
        for tag, label in SMOKE_TAGS:
            (success if tag in out else error)(f"Smoke test: {label}")
            ok = ok and tag in out
        if not ok:
            raise DeployError("Smoke test failed")

    def post_deploy_checks(self):
        time.sleep(5)
        self.check_health(expect_sha=True)
        self.check_pm2()
        self.check_pipeline_and_schema()
        self.smoke_test()

    # --- rollback ---
    def rollback(self):
        t = self.t
        warn("=" * 66)
        warn(f"ROLLING BACK {t.name.upper()} to the previous release from {t.prev_root}")
        warn("=" * 66)
        r = self.ssh(script_rollback(t), capture=True, timeout=900)
        out = r.stdout or ""
        if "NO_PREVIOUS_RELEASE" in out or r.returncode != 0 or "RESTORED_FROM_PREV" not in out:
            error("ROLLBACK FAILED or there was no previous release. The server may be running broken code: fix it by hand NOW.")
            print(out, flush=True)
            return False
        try:
            time.sleep(8)
            self.check_health(expect_sha=False, attempts=8)
            self.check_pm2()
        except DeployError as e:
            error(f"Rolled back, but the previous release is not healthy either: {e}")
            return False
        success("Rolled back: the previous release is running and healthy.")
        return True

    # --- main ---
    def cleanup_archive(self):
        for attempt in range(5):
            try:
                if os.path.exists(self.t.archive_name):
                    os.remove(self.t.archive_name)
                    success("Local temporary payload archive cleaned up.")
                break
            except Exception:
                time.sleep(1.5)

    def deploy(self):
        t = self.t
        start = time.time()
        print(f"\n{CYAN}" + "=" * 60 + f"{NC}")
        print(f"{GREEN}🚀 [DEPLOY] {t.title}{NC}")
        print(f"{CYAN}Target: {t.remote_root} | Port: {t.port} | PM2: {t.pm2_name}{NC}")
        print(f"{CYAN}" + "=" * 60 + f"{NC}")

        failed = None
        try:
            print(f"\n{YELLOW}🛡️   [0/6] GATE & CONFIG...{NC}")
            self.gate()
            self.check_consistency()
            self.stream_precheck()
            print(f"\n{YELLOW}🏗️   [1/6] BUILDING client frontend (base {t.vite_base_path})...{NC}")
            self.build()
            print(f"\n{YELLOW}📦 [2/6] ARCHIVING deployment payload -> {t.archive_name}...{NC}")
            self.make_archive()
            self.engage_lock()
            print(f"\n{YELLOW}📤 [3/6] UPLOADING archive to {t.remote_host}:{t.remote_root}...{NC}")
            self.upload()
            print(f"\n{YELLOW}⚙️  [4/6] SNAPSHOT, extract, install, verify build, backup, migrate, reload...{NC}")
            self.snapshot()
            self.extract_and_install()
            self.verify_build_info()
            self.backup_and_migrate()
            self.reload_pm2()
            print(f"\n{YELLOW}🔬 [5/6] POST-DEPLOY checks (health+SHA, PM2, pipeline, schema, smoke)...{NC}")
            self.post_deploy_checks()
        except DeployError as e:
            failed = e
        except KeyboardInterrupt:
            failed = DeployError("Interrupted by the user")
        finally:
            self.release_lock()
            self.cleanup_archive()

        if failed is not None:
            error(f"DEPLOY FAILED: {failed}")
            if self.touched_server:
                restored = self.rollback()
                error("Deployment did NOT complete. " + ("The previous release was restored." if restored else "ROLLBACK DID NOT SUCCEED."))
            else:
                error("Deployment did NOT complete. The server was not modified.")
            sys.exit(1)

        print(f"\n{YELLOW}✔️   [6/6] DONE{NC}")
        print(f"\n{GREEN}" + "=" * 60 + f"{NC}")
        success(f"Deployment Complete in {time.time() - start:.1f}s! ({self.sha[:8]} on {t.name})")
        print(f"    URL: {t.public_url}")
        print(f"{GREEN}" + "=" * 60 + f"{NC}\n")


def run_deploy(target, argv=None):
    Deployer(target, parse_args(argv)).deploy()
