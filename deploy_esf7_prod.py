import subprocess
import os
import sys
import threading
import time
import tarfile
import shutil

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

def main():
    print(f"\n{CYAN}" + "="*60 + f"{NC}")
    print(f"{GREEN}🚀 [DEPLOY] ESF7 OFFICIAL PRODUCTION: DEPLOYMENT{NC}")
    print(f"{CYAN}Target: {REMOTE_ROOT} | Port: {PORT}{NC}")
    print(f"{CYAN}" + "="*60 + f"{NC}")
    
    start_time = time.time()

    try:
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
        ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"
        print(f"\n{YELLOW}📤 [3/5] UPLOADING archive to {REMOTE_HOST}:{REMOTE_ROOT}...{NC}")
        
        prep_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"sudo mkdir -p {REMOTE_ROOT} && sudo chown -R {REMOTE_USER}:{REMOTE_USER} {REMOTE_ROOT}"]
        run_command(prep_cmd, retries=5, delay=3)

        scp_cmd = ["scp"] + SSH_OPTS + [ARCHIVE_NAME, f"{ssh_target}:{REMOTE_ROOT}/"]
        upload_res = run_command(scp_cmd, retries=5, delay=3)
        if upload_res.returncode != 0:
            error("Upload failed! Check SSH key and connection.")
            sys.exit(1)
        success("Upload complete.")

        # 4. Remote Extraction, PM2 Setup, and Immediate Remote Tar Deletion
        print(f"\n{YELLOW}⚙️  [4/5] REMOTE extraction, npm install, and PM2 reset...{NC}")
        remote_script = (
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
            f"pm2 flush {PM2_NAME} 2>/dev/null || true; "
            f"pm2 delete {PM2_NAME} 2>/dev/null || true; "
            f"pm2 start {ECOSYSTEM_CONFIG} --update-env && "
            "pm2 save"
        )
        
        ssh_deploy_cmd = ["ssh"] + SSH_OPTS + [ssh_target, remote_script]
        deploy_res = run_command(ssh_deploy_cmd, retries=1, delay=3, timeout=180)
        if deploy_res.returncode != 0:
            error("Remote setup failed.")
            sys.exit(1)
        success("Remote setup complete and remote tar archive recycled.")

        # 5. Verification
        print(f"\n{YELLOW}🔬 [5/5] VERIFYING remote PM2 status & API health...{NC}")
        info("Checking PM2 status...")
        show_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"pm2 show {PM2_NAME} | grep status"]
        res = run_command(show_cmd, capture=True, retries=3, delay=3)
        print(res.stdout, flush=True)

        if "errored" in res.stdout or "stopped" in res.stdout:
            warn("PM2 process detected in errored/stopped state! Triggering Auto-Revive restart...")
            revive_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"pm2 restart {PM2_NAME} --update-env"]
            run_command(revive_cmd, retries=3, delay=3)
            success("Auto-Revive triggered for PM2 process.")

        info(f"Checking local API endpoint (port {PORT})...")
        verify_cmd = f"curl -sf http://127.0.0.1:{PORT}/health || curl -sf http://127.0.0.1:{PORT}/api/health || curl -sf http://127.0.0.1:{PORT}/ || true"
        health_cmd = ["ssh"] + SSH_OPTS + [ssh_target, verify_cmd]
        run_command(health_cmd, capture=False, retries=3, delay=3)

    finally:
        # Guaranteed Local Cleanup in finally block
        cleanup_local_archive()

    duration = time.time() - start_time
    print(f"\n{GREEN}" + "="*60 + f"{NC}")
    success(f"Deployment Complete in {duration:.1f}s!")
    print(f"    URL: https://stride.deped.gov.ph/insighted-esf7-prod/")
    print(f"{GREEN}" + "="*60 + f"{NC}\n")

if __name__ == "__main__":
    main()
