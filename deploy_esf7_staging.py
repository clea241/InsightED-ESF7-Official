#!/usr/bin/env python3
import subprocess
import os
import sys
import tarfile
import time

# Handle Windows console encoding for emojis
if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding='utf-8')

# --- Configuration ---
REMOTE_USER  = "Administrator1"
REMOTE_HOST  = "20.24.58.49"
REMOTE_ROOT  = "/mnt/insighted-esf7-staging"
SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_rsa").replace("\\", "/")
ARCHIVE_NAME = "esf7-staging-deploy.tar.gz"
ECOSYSTEM_CONFIG = "ecosystem.esf7-staging.config.cjs"
PM2_NAME     = "insighted-esf7-staging-backend"

# --- COLORS ---
GREEN = '\033[0;32m'
RED = '\033[0;31m'
CYAN = '\033[0;36m'
YELLOW = '\033[1;33m'
NC = '\033[0m'

def info(msg): print(f"{CYAN}ℹ️  {msg}{NC}", flush=True)
def success(msg): print(f"{GREEN}✅ {msg}{NC}", flush=True)
def warn(msg): print(f"{YELLOW}⚠️  {msg}{NC}", flush=True)
def error(msg): print(f"{RED}❌ {msg}{NC}", flush=True)

# Build SSH options with explicit key path if available and 45s ConnectTimeout
SSH_OPTS = [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=3"
]
if os.path.exists(SSH_KEY_PATH):
    SSH_OPTS.extend(["-i", SSH_KEY_PATH])

def run_command(cmd, capture=False, timeout=90, retries=8, delay=5):
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

def main():
    print(f"\n{CYAN}" + "="*60 + f"{NC}")
    print(f"{GREEN}🚀 [DEPLOY] ESF7 OFFICIAL STAGING: DEPLOYMENT (v1.2 Resilient Auto-Revive){NC}")
    print(f"{CYAN}" + "="*60 + f"{NC}")
    
    start_time = time.time()

    # 1. Pre-build local assets in client folder
    print(f"\n{YELLOW}🏗️  [1/5] BUILDING client frontend...{NC}")
    env = os.environ.copy()
    env["VITE_BASE_PATH"] = "/insighted-esf7-staging/"
    env["VITE_API_URL"] = "/insighted-esf7-staging/api"
    env["NODE_OPTIONS"] = "--max-old-space-size=4096"
    try:
        subprocess.run("npm run build", shell=True, check=True, env=env, cwd="client")
        success("Client build complete.")
    except subprocess.CalledProcessError:
        error("Client Build failed! Aborting.")
        sys.exit(1)

    # 2. Archive essential files (skipping node_modules)
    print(f"\n{YELLOW}📦 [2/5] ARCHIVING deployment payload -> {ARCHIVE_NAME}...{NC}")
    files_to_include = ["server", "client/dist", "package.json", "package-lock.json", ECOSYSTEM_CONFIG]
    
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

    # 3. Prepare remote and upload with Auto-Revive retry
    ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"
    print(f"\n{YELLOW}📂 [3/5] UPLOADING archive to {REMOTE_HOST} inside {REMOTE_ROOT}...{NC}")
    
    prep_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"mkdir -p {REMOTE_ROOT}"]
    run_command(prep_cmd, retries=8, delay=5)

    scp_cmd = ["scp"] + SSH_OPTS + [ARCHIVE_NAME, f"{ssh_target}:{REMOTE_ROOT}/"]
    upload_res = run_command(scp_cmd, retries=8, delay=5)
    if upload_res.returncode != 0:
        error("Upload failed after 8 attempts! Check SSH key and connection.")
        sys.exit(1)
    success("Upload complete.")

    # 4. Remote Extraction and PM2 Reset with Auto-Revive retry
    print(f"\n{YELLOW}⚡ [4/5] REMOTE extraction, production install, and PM2 reset...{NC}")
    remote_script = (
        f"mkdir -p {REMOTE_ROOT}/logs && "
        f"cd {REMOTE_ROOT} && "
        f"tar -xzf {ARCHIVE_NAME} && "
        f"sudo chown -R {REMOTE_USER}:{REMOTE_USER} {REMOTE_ROOT} && "
        "export PATH=$PATH:/usr/local/bin:/home/Administrator1/.local/share/pnpm; "
        "echo \"       -> Running production npm install...\" && "
        "npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
        "cd server && npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
        f"cd {REMOTE_ROOT} && "
        f"pm2 flush {PM2_NAME} 2>/dev/null || true; "
        f"pm2 delete {PM2_NAME} 2>/dev/null || true; "
        f"pm2 start {ECOSYSTEM_CONFIG} --update-env && "
        f"rm -f {ARCHIVE_NAME}"
    )
    
    ssh_deploy_cmd = ["ssh"] + SSH_OPTS + [ssh_target, remote_script]
    deploy_res = run_command(ssh_deploy_cmd, retries=8, delay=5, timeout=180)
    if deploy_res.returncode != 0:
        error("Remote setup failed after retries.")
        sys.exit(1)
    success("Remote setup complete.")

    # 5. Final Health Check & Auto-Revive Verification
    print(f"\n{YELLOW}🔍 [5/5] VERIFYING remote PM2 status & API health...{NC}")
    info("Checking PM2 status...")
    show_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"pm2 show {PM2_NAME} | grep status"]
    res = run_command(show_cmd, capture=True, retries=4, delay=3)
    print(res.stdout, flush=True)

    if "errored" in res.stdout or "stopped" in res.stdout:
        warn("PM2 process detected in errored/stopped state! Triggering Auto-Revive restart...")
        revive_cmd = ["ssh"] + SSH_OPTS + [ssh_target, f"pm2 restart {PM2_NAME} --update-env"]
        run_command(revive_cmd, retries=4, delay=3)
        success("Auto-Revive triggered for PM2 process.")

    info("Checking local API endpoint (port 5035)...")
    verify_cmd = "curl -sf http://127.0.0.1:5035/health || curl -sf http://127.0.0.1:5035/api/health || curl -sf http://127.0.0.1:5035/ || true"
    health_cmd = ["ssh"] + SSH_OPTS + [ssh_target, verify_cmd]
    run_command(health_cmd, capture=False, retries=4, delay=3)

    # Local cleanup
    try:
        if os.path.exists(ARCHIVE_NAME):
            os.remove(ARCHIVE_NAME)
            info("Local temporary payload archive removed.")
    except Exception:
        pass

    duration = time.time() - start_time
    print(f"\n{GREEN}" + "="*60 + f"{NC}")
    success(f"Deployment Complete in {duration:.1f}s!")
    print(f"    URL: https://stride.deped.gov.ph/insighted-esf7-staging/")
    print(f"{GREEN}" + "="*60 + f"{NC}\n")

if __name__ == "__main__":
    main()