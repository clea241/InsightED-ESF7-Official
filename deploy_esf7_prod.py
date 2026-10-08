import subprocess
import os
import sys
import threading
import time
import tarfile
import shutil
import json
import base64
import datetime

# Handle Windows console encoding for emojis
if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding='utf-8')

# --- CONFIGURATION ---
REMOTE_HOST = "20.24.58.49"
REMOTE_USER = "Administrator1"
REMOTE_ROOT = "/var/www/html/InsightED-ROSDO/insighted-esf7-prod"
PORT = 5007
PM2_NAME = "insighted-esf7-prod-backend"
ARCHIVE_NAME = "esf7-prod-deploy.tmp.tar.gz"
ECOSYSTEM_CONFIG = "ecosystem.esf7-prod.config.cjs"
VERIFY_STAMP = ".verify-passed"          # written by `npm run verify`
VERIFY_MAX_AGE_HOURS = 24
BACKUP_DIR = "/var/backups/esf7"        # on the server
# Additive migrations to apply on this deploy (only AFTER a verified database backup). Keep each one idempotent.
MIGRATIONS = ["migrations/add_school_drafts_version.js"]

SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_rsa")

# --- COLORS ---
GREEN = '\033[0;32m'
RED = '\033[0;31m'
CYAN = '\033[0;36m'
YELLOW = '\033[1;33m'
NC = '\033[0m'

def info(msg): print(f"{CYAN}ℹ️   {msg}{NC}", flush=True)
def success(msg): print(f"{GREEN}✅ {msg}{NC}", flush=True)
def warn(msg): print(f"{YELLOW}⚠️   {msg}{NC}", flush=True)
def error(msg): print(f"{RED}❌ {msg}{NC}", flush=True)

SSH_OPTS = [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3"
]
if os.path.exists(SSH_KEY_PATH):
    SSH_OPTS.extend(["-i", SSH_KEY_PATH])

def run_command(cmd, capture=False, timeout=120, retries=5, delay=3):
    cmd_str = cmd if isinstance(cmd, str) else ' '.join(cmd)
    is_network = "ssh" in cmd_str or "scp" in cmd_str
    max_attempts = retries if is_network else 1

    for attempt in range(1, max_attempts + 1):
        if not capture:
            prefix = f"[Attempt {attempt}/{max_attempts}] " if is_network else ""
            print(f"{CYAN}> {prefix}Running: {cmd_str}{NC}", flush=True)
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=capture, text=True, 
                timeout=timeout, stdin=subprocess.DEVNULL
            )
            if result.returncode == 0:
                return result
            if attempt < max_attempts:
                warn(f"Command returned exit code {result.returncode}. Retrying in {delay}s...")
        except subprocess.TimeoutExpired:
            if attempt < max_attempts:
                warn(f"Command timed out after {timeout}s. Retrying in {delay}s...")
        
        if attempt < max_attempts:
            time.sleep(delay)

    if not capture:
        error(f"Command failed after {max_attempts} attempts: {cmd_str}")
    return subprocess.CompletedProcess(cmd, 1, "", "Failed after retries")

def pre_deploy_stream_check(ssh_target):
    info("Running pre-deploy check on Redis submission stream...")
    check_cmd = [
        "ssh"
    ] + SSH_OPTS + [
        ssh_target,
        "redis-cli XPENDING esf7:submission_stream esf7_submission_group 2>/dev/null || echo '0'"
    ]
    res = run_command(check_cmd, capture=True, retries=2, delay=2)
    out = res.stdout.strip()
    pending_count = 0
    lines = out.splitlines()
    if lines and lines[0].isdigit():
        pending_count = int(lines[0])
    
    if pending_count > 0:
        warn(f"Stream pre-check: detected {pending_count} pending unacknowledged entries.")
        # Check if entries are stuck (idle > 30s)
        detail_cmd = [
            "ssh"
        ] + SSH_OPTS + [
            ssh_target,
            "redis-cli XPENDING esf7:submission_stream esf7_submission_group - + 10 2>/dev/null"
        ]
        detail_res = run_command(detail_cmd, capture=True)
        print(detail_res.stdout, flush=True)
        warn("Stuck pending entries present. Ensure workers are draining before proceed.")
    else:
        success("Stream pre-check passed: 0 stuck pending entries in esf7:submission_stream.")

def post_deploy_health_check(ssh_target):
    info(f"Performing post-deploy health check on local port {PORT}...")
    healthy = False
    last_code = "0"
    
    # Poll for health with retries to allow worker wait_ready / listen to establish
    for attempt in range(1, 7):
        time.sleep(4)
        check_script = (
            f"curl -sf -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{PORT}/api/schools?schoolId=302261 || "
            f"curl -sf -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{PORT}/api/school?schoolId=199999 || "
            f"curl -sf -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{PORT}/api/health || "
            f"echo '0'"
        )
        cmd = ["ssh"] + SSH_OPTS + [ssh_target, check_script]
        res = run_command(cmd, capture=True)
        code = res.stdout.strip()
        last_code = code
        if code in ["200", "204"]:
            healthy = True
            success(f"Health check attempt {attempt}/6 passed: HTTP {code}")
            break
        else:
            warn(f"Health check attempt {attempt}/6 returned code '{code}'. Retrying in 4s...")

    smoke_ok = healthy and post_deploy_smoke_test(ssh_target)
    if healthy and not smoke_ok:
        last_code = "smoke test failed"
        healthy = False

    if not healthy:
        error(f"Post-deploy health check FAILED (last code: {last_code})! Triggering automatic rollback...")
        rollback_script = (
            f"if [ -d {REMOTE_ROOT}.prev ]; then "
            f"  echo '       -> Restoring previous build from {REMOTE_ROOT}.prev...'; "
            f"  rm -rf {REMOTE_ROOT} && cp -r {REMOTE_ROOT}.prev {REMOTE_ROOT}; "
            f"  cd {REMOTE_ROOT} && pm2 reload {ECOSYSTEM_CONFIG} --update-env; "
            f"  echo '       -> Rollback reload completed.'; "
            f"else "
            f"  echo '       -> No previous snapshot found at {REMOTE_ROOT}.prev to restore.'; "
            f"fi"
        )
        run_command(["ssh"] + SSH_OPTS + [ssh_target, rollback_script])
        error("Rollback executed. Deployment aborted due to post-deploy health check failure.")
        sys.exit(1)
    
    success("Post-deploy health check verified successfully.")

def sync_media_assets():
    info("Synchronizing media assets...")
    if os.path.exists("INSIGHTED LOADING.gif"):
        os.makedirs("client/public", exist_ok=True)
        shutil.copy2("INSIGHTED LOADING.gif", "client/public/INSIGHTED LOADING.gif")
        shutil.copy2("INSIGHTED LOADING.gif", "client/public/insighted_loading.gif")
    
    if os.path.exists("client/public") and os.path.exists("client/dist"):
        shutil.copytree("client/public", "client/dist", dirs_exist_ok=True)

def cleanup_local_archive():
    """Foolproof cleanup of local .tar.gz archive with retry for Windows lock release."""
    for attempt in range(1, 6):
        try:
            if os.path.exists(ARCHIVE_NAME):
                os.remove(ARCHIVE_NAME)
                success("Local temporary payload archive cleaned up and recycled.")
            break
        except Exception:
            if attempt < 5:
                time.sleep(1.5)
            else:
                warn(f"Could not automatically delete local {ARCHIVE_NAME} (held by process).")


def _git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()


def require_verified_commit():
    """Refuse to deploy unless `npm run verify` passed for exactly this commit with a clean working tree."""
    info("Deploy gate: checking that `npm run verify` passed for this commit...")
    head = _git("rev-parse", "HEAD")
    dirty = _git("status", "--porcelain", "--untracked-files=no")
    if dirty:
        error("Deploy gate: tracked files have uncommitted changes. Commit them, run `npm run verify`, then deploy.")
        sys.exit(1)
    if not os.path.exists(VERIFY_STAMP):
        error(f"Deploy gate: {VERIFY_STAMP} not found. Run `npm run verify` first.")
        sys.exit(1)
    try:
        with open(VERIFY_STAMP, "r", encoding="utf-8") as fh:
            stamp = json.load(fh)
    except (OSError, ValueError):
        error(f"Deploy gate: {VERIFY_STAMP} is unreadable. Run `npm run verify` again.")
        sys.exit(1)
    if stamp.get("commit") != head:
        error(f"Deploy gate: verify passed for {str(stamp.get('commit'))[:8]}, but HEAD is {head[:8]}. Run `npm run verify` on this commit.")
        sys.exit(1)
    if stamp.get("dirty"):
        error("Deploy gate: verify ran with uncommitted changes, so it does not vouch for this commit. Commit, then re-run `npm run verify`.")
        sys.exit(1)
    try:
        verified_at = datetime.datetime.fromisoformat(stamp["verifiedAt"].replace("Z", "+00:00"))
        age_h = (datetime.datetime.now(datetime.timezone.utc) - verified_at).total_seconds() / 3600
    except (KeyError, ValueError):
        error("Deploy gate: verify stamp has no valid timestamp. Run `npm run verify` again.")
        sys.exit(1)
    if age_h > VERIFY_MAX_AGE_HOURS:
        error(f"Deploy gate: verify passed {age_h:.0f}h ago (limit {VERIFY_MAX_AGE_HOURS}h). Run `npm run verify` again.")
        sys.exit(1)
    # Check the environment that will be shipped: malformed values (e.g. a Redis port above 65535) fail, and --strict also
    # requires JWT_SECRET (the server refuses to start in production without it) and the database settings.
    env_check = subprocess.run(f"node scripts/check-env.mjs --strict --ecosystem {ECOSYSTEM_CONFIG}", shell=True)
    if env_check.returncode != 0:
        error("Deploy gate: environment check failed (see messages above).")
        sys.exit(1)
    success(f"Deploy gate passed: verify OK for {head[:8]} ({age_h:.1f}h ago), clean tree, environment parses.")


def backup_database_and_migrate(ssh_target):
    """Take and verify a database backup on the server; only then apply additive migrations."""
    if not MIGRATIONS:
        info("No migrations to run for this deploy.")
        return
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dump = f"{BACKUP_DIR}/insighted_esf7_pre_deploy_{stamp}.dump"
    info(f"Backing up the database to {dump} before running migrations: {', '.join(MIGRATIONS)}")
    script = (
        f"set -e; sudo mkdir -p {BACKUP_DIR} && sudo chown {REMOTE_USER}:{REMOTE_USER} {BACKUP_DIR}; "
        f"cd {REMOTE_ROOT}/server; set -a; . ./.env; set +a; "
        f"PGPASSWORD=\"$DB_PASSWORD\" pg_dump -h \"$DB_HOST\" -p \"${{DB_PORT:-5432}}\" -U \"$DB_USER\" -d \"$DB_NAME\" -Fc -f {dump}; "
        f"test -s {dump}; pg_restore --list {dump} > /dev/null; echo BACKUP_VERIFIED"
    )
    res = run_command(["ssh"] + SSH_OPTS + [ssh_target, script], capture=True, retries=1, timeout=900)
    if res.returncode != 0 or "BACKUP_VERIFIED" not in (res.stdout or ""):
        error("Database backup FAILED or could not be verified. Migrations were NOT run.")
        print(res.stdout, flush=True)
        sys.exit(1)
    success("Database backup written and verified (pg_restore --list OK).")
    for mig in MIGRATIONS:
        info(f"Applying migration {mig}...")
        mres = run_command(["ssh"] + SSH_OPTS + [ssh_target, f"cd {REMOTE_ROOT}/server && node {mig}"], retries=1, timeout=300)
        if mres.returncode != 0:
            error(f"Migration {mig} failed. Restore from {dump} if needed. Aborting.")
            sys.exit(1)
    success("Migrations applied.")


# Runs on the server inside server/: signs a short-lived token for the reserved smoke school (000000) with the secret the
# app itself uses (server/.env or the PM2 ecosystem env). Prints only the token, never the secret.
SMOKE_TOKEN_JS = """
require('dotenv').config({ path: '.env' });
let secret = process.env.JWT_SECRET;
if (!secret) {
  try {
    const eco = require('../%s');
    secret = (eco.apps || []).map((a) => (a.env || {}).JWT_SECRET).find(Boolean);
  } catch (e) {}
}
if (!secret) { console.error('JWT_SECRET not found'); process.exit(3); }
console.log(require('jsonwebtoken').sign({ uid: 'smoke-000000', role: 'school', school_id: '000000' }, secret, { expiresIn: '5m' }));
""" % ECOSYSTEM_CONFIG


def post_deploy_smoke_test(ssh_target):
    """Health (with a real DB query), an auth check, plus a real draft save/read/delete on a reserved smoke record.
    Returns True when all pass."""
    base = f"http://127.0.0.1:{PORT}/api"
    token_b64 = base64.b64encode(SMOKE_TOKEN_JS.encode()).decode()
    hdr = "-H 'Content-Type: application/json' -H 'x-school-id: 000000' -H 'x-smoke-test: 1' -H \"Authorization: Bearer $TOKEN\""
    body = '{"schoolYear":"SMOKE","payload":{"schoolInfo":{"schoolId":"000000"},"personnel":[],"smoke":true}}'
    script = (
        f"set -e; "
        f"TOKEN=$(cd {REMOTE_ROOT}/server && echo {token_b64} | base64 -d | node -); "
        f"curl -sf {base}/health | grep -q '\"db\":\"up\"' && echo HEALTH_OK; "
        f"test \"$(curl -s -o /dev/null -w '%{{http_code}}' -H 'x-school-id: 000000' '{base}/school/draft?schoolYear=SMOKE')\" = 401 && echo AUTH_OK; "
        f"curl -sf -X PUT {hdr} -d '{body}' {base}/school/draft | grep -q '\"success\":true' && echo SAVE_OK; "
        f"curl -sf {hdr} '{base}/school/draft?schoolYear=SMOKE' | grep -q '\"smoke\":true' && echo READ_OK; "
        f"curl -sf -X DELETE {hdr} '{base}/school/draft?schoolYear=SMOKE' | grep -q '\"success\":true' && echo CLEANUP_OK"
    )
    res = run_command(["ssh"] + SSH_OPTS + [ssh_target, script], capture=True, retries=1, timeout=60)
    out = res.stdout or ""
    tags = (("HEALTH_OK", "health endpoint (database up)"), ("AUTH_OK", "request without a token is rejected (401)"),
            ("SAVE_OK", "draft save confirmed"), ("READ_OK", "draft read back"), ("CLEANUP_OK", "smoke record removed"))
    for tag, label in tags:
        (success if tag in out else error)(f"Smoke test: {label}")
    return all(tag in out for tag, _ in tags)


def main():
    print(f"\n{CYAN}" + "="*60 + f"{NC}")
    print(f"{GREEN}🚀 [DEPLOY] ESF7 OFFICIAL PRODUCTION: ZERO-DOWNTIME RELOAD DEPLOYMENT{NC}")
    print(f"{CYAN}Target: {REMOTE_ROOT} | Port: {PORT}{NC}")
    print(f"{CYAN}" + "="*60 + f"{NC}")
    
    start_time = time.time()
    ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"

    # Gate: nothing below runs unless `npm run verify` passed for this exact commit.
    require_verified_commit()

    try:
        # 0. Pre-Deploy Queue Check
        pre_deploy_stream_check(ssh_target)

        # 1. Build Frontend
        print(f"\n{YELLOW}🏗️   [1/5] BUILDING client frontend (Base path: /insighted-esf7-prod/)...{NC}")
        env = os.environ.copy()
        env["VITE_BASE_PATH"] = "/insighted-esf7-prod/"
        env["VITE_API_URL"] = "/insighted-esf7-prod/api"
        env["NODE_OPTIONS"] = "--max-old-space-size=4096"
        
        try:
            subprocess.run("npm run build", shell=True, check=True, env=env, cwd="client")
            sync_media_assets()
            success("Client build & media synchronization complete.")
        except subprocess.CalledProcessError:
            error("Client Build failed! Aborting.")
            sys.exit(1)

        # 2. Archive
        print(f"\n{YELLOW}📦 [2/5] ARCHIVING deployment payload -> {ARCHIVE_NAME}...{NC}")
        files_to_include = [".env", "server", "client/dist", "client/public", "package.json", "package-lock.json", ECOSYSTEM_CONFIG]
        
        def exclude_node_modules(tarinfo):
            if "node_modules" in tarinfo.name or ".git" in tarinfo.name:
                return None
            return tarinfo

        with tarfile.open(ARCHIVE_NAME, "w:gz") as tar:
            for f in files_to_include:
                if os.path.exists(f):
                    tar.add(f, filter=exclude_node_modules)
                    info(f"       + {f}")
                else:
                    warn(f"       [SKIP] not found: {f}")
        success("Archive created.")

        # 3. Upload
        print(f"\n{YELLOW}📤 [3/5] UPLOADING archive to {REMOTE_HOST}:{REMOTE_ROOT}...{NC}")
        
        prep_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"sudo mkdir -p {REMOTE_ROOT} && sudo chown -R {REMOTE_USER}:{REMOTE_USER} {REMOTE_ROOT}"]
        run_command(prep_cmd, retries=5, delay=3)

        scp_cmd = ["scp"] + SSH_OPTS + [ARCHIVE_NAME, f"{ssh_target}:{REMOTE_ROOT}/"]
        upload_res = run_command(scp_cmd, retries=5, delay=3)
        if upload_res.returncode != 0:
            error("Upload failed! Check SSH key and connection.")
            sys.exit(1)
        success("Upload complete.")

        # 4. Snapshot Previous Build, Remote Extraction, NPM Install, and Zero-Downtime PM2 Reload
        print(f"\n{YELLOW}⚙️  [4/5] REMOTE snapshot, extraction, npm install, and zero-downtime PM2 reload...{NC}")
        remote_script = (
            f"if [ -d {REMOTE_ROOT}/server ]; then "
            f"  echo '       -> Snapshotting current build to {REMOTE_ROOT}.prev for instant rollback...'; "
            f"  rm -rf {REMOTE_ROOT}.prev && cp -r {REMOTE_ROOT} {REMOTE_ROOT}.prev; "
            f"fi && "
            f"mkdir -p {REMOTE_ROOT}/logs {REMOTE_ROOT}/client/dist {REMOTE_ROOT}/dist && "
            f"cd {REMOTE_ROOT} && "
            f"tar -xzf {ARCHIVE_NAME} && "
            f"rm -f {ARCHIVE_NAME} && "
            f"cp -rf {REMOTE_ROOT}/client/dist/* {REMOTE_ROOT}/dist/ 2>/dev/null || true && "
            f"sudo chown -R {REMOTE_USER}:{REMOTE_USER} {REMOTE_ROOT} && "
            f"sudo chmod -R 755 {REMOTE_ROOT} && "
            "export PATH=$PATH:/usr/local/bin:/home/Administrator1/.local/share/pnpm; "
            "echo \"       -> Running production npm install...\" && "
            "npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
            "cd server && npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
            f"cd {REMOTE_ROOT} && "
            f"if pm2 describe {PM2_NAME} >/dev/null 2>&1; then "
            f"  echo '       -> Reloading {PM2_NAME} cluster with zero downtime (--update-env)...'; "
            f"  pm2 reload {ECOSYSTEM_CONFIG} --update-env; "
            f"else "
            f"  echo '       -> Process not found; performing initial start...'; "
            f"  pm2 start {ECOSYSTEM_CONFIG} --update-env; "
            f"fi && "
            "pm2 save"
        )
        
        ssh_deploy_cmd = ["ssh"] + SSH_OPTS + [ssh_target, remote_script]
        deploy_res = run_command(ssh_deploy_cmd, retries=1, delay=3, timeout=180)
        if deploy_res.returncode != 0:
            error("Remote setup failed.")
            sys.exit(1)
        success("Remote extraction and zero-downtime PM2 reload complete.")

        # 4b. Backup first, then additive migrations (the new routes also work without them, so this order is safe)
        backup_database_and_migrate(ssh_target)

        # 5. Post-Deploy Health Check with Automatic Rollback
        print(f"\n{YELLOW}🔬 [5/5] POST-DEPLOY health check & verification...{NC}")
        post_deploy_health_check(ssh_target)

    finally:
        # Guaranteed Local Cleanup in finally block
        cleanup_local_archive()

    duration = time.time() - start_time
    print(f"\n{GREEN}" + "="*60 + f"{NC}")
    success(f"Zero-Downtime Deployment Complete in {duration:.1f}s!")
    print(f"    URL: https://stride.deped.gov.ph/insighted-esf7-prod/")
    print(f"{GREEN}" + "="*60 + f"{NC}\n")

if __name__ == "__main__":
    main()
