#!/usr/bin/env python3
import subprocess
import os
import sys
import tarfile
import time

# --- Configuration ---
REMOTE_USER  = "Administrator1"
REMOTE_HOST  = "20.24.58.49"
REMOTE_ROOT  = "/mnt/insighted-esf7-staging"
SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_rsa").replace("\\", "/")
ARCHIVE_NAME = "esf7-staging-deploy.tar.gz"
ECOSYSTEM_CONFIG = "ecosystem.esf7-staging.config.cjs"
PM2_NAME     = "insighted-esf7-staging-backend"

def run_ssh(command: str, timeout=60):
    """Run bundled commands over a single SSH connection with a timeout."""
    ssh_cmd = f'ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "{SSH_KEY_PATH}" {REMOTE_USER}@{REMOTE_HOST} "{command}"'
    try:
        return subprocess.run(ssh_cmd, shell=True, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        print(f"  [ERROR] SSH command timed out after {timeout}s")
        sys.exit(1)

def main():
    print("\n" + "="*60)
    print("[DEPLOY] ESF7 OFFICIAL STAGING: DEPLOYMENT (v1.0)")
    print("="*60)
    
    start_time = time.time()

    # 1. Pre-build local assets in client folder
    print("\n[1/5] BUILDING client frontend...")
    env = os.environ.copy()
    env["VITE_BASE_PATH"] = "/insighted-esf7-staging/"
    env["VITE_API_URL"] = "/insighted-esf7-staging/api"
    env["NODE_OPTIONS"] = "--max-old-space-size=4096"
    try:
        # Run npm run build inside the client subdirectory
        subprocess.run("npm run build", shell=True, check=True, env=env, cwd="client")
    except subprocess.CalledProcessError:
        print("  [ERROR] Client Build failed! Aborting.")
        sys.exit(1)

    # 2. Archive essential files (skipping node_modules)
    print(f"[2/5] ARCHIVING deployment payload -> {ARCHIVE_NAME}...")
    files_to_include = ["server", "client/dist", "package.json", "package-lock.json", ECOSYSTEM_CONFIG]
    
    def exclude_node_modules(tarinfo):
        if "node_modules" in tarinfo.name or ".git" in tarinfo.name:
            return None
        return tarinfo

    with tarfile.open(ARCHIVE_NAME, "w:gz") as tar:
        for f in files_to_include:
            if os.path.exists(f):
                tar.add(f, filter=exclude_node_modules)
                print(f"       + {f}")
            else:
                print(f"       [SKIP] not found: {f}")

    print(f"[3/5] UPLOADING archive to {REMOTE_HOST} inside {REMOTE_ROOT}...")
    try:
        # Create directory first to ensure scp works
        run_ssh(f"mkdir -p {REMOTE_ROOT}")
        subprocess.run(f'scp -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "{SSH_KEY_PATH}" {ARCHIVE_NAME} {REMOTE_USER}@{REMOTE_HOST}:{REMOTE_ROOT}/', shell=True, check=True, stdin=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print("  [ERROR] Upload failed! Check your SSH key and connection.")
        sys.exit(1)

    # 4. Remote Extraction and PM2 Reset
    print("[4/5] REMOTE extraction, production install, and PM2 reset...")
    remote_script = (
        f"mkdir -p {REMOTE_ROOT}/logs && "
        f"cd {REMOTE_ROOT} && "
        f"tar -xzf {ARCHIVE_NAME} && "
        f"sudo chown -R {REMOTE_USER}:{REMOTE_USER} {REMOTE_ROOT} && "
        "echo \"       → Running production npm install...\" && "
        "npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
        "cd server && npm install --omit=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1 | tail -n 10 && "
        f"cd {REMOTE_ROOT} && "
        f"pm2 flush {PM2_NAME} && "
        f"pm2 delete {PM2_NAME} 2>/dev/null || true && "
        f"pm2 start {ECOSYSTEM_CONFIG} && "
        f"rm {ARCHIVE_NAME}"
    )
    
    ssh_cmd = f'ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "{SSH_KEY_PATH}" {REMOTE_USER}@{REMOTE_HOST} "{remote_script}"'
    try:
        subprocess.run(ssh_cmd, shell=True, check=True, stdin=subprocess.DEVNULL)
    except subprocess.CalledProcessError as e:
        print(f"  [ERROR] Remote setup failed with exit code {e.returncode}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n  [WARN] Deployment interrupted by user.")
        sys.exit(1)

    # 5. Final Health Check
    print("[5/5] VERIFYING remote API health...")
    verify_cmd = "curl -s http://127.0.0.1:5035/health || curl -s http://127.0.0.1:5035/api/health || curl -s http://127.0.0.1:5035/"
    health = run_ssh(verify_cmd)
    if health.stdout.strip() != "":
        print("      SUCCESS: API confirmed online on port 5035!")
    else:
        print(f"      [WARN] Health check warning: Unexpected response. Check PM2 logs.")

    # Local cleanup
    if os.path.exists(ARCHIVE_NAME):
        os.remove(ARCHIVE_NAME)

    duration = time.time() - start_time
    print("\n" + "="*60)
    print(f"[SUCCESS] Deployment Success! (Duration: {duration:.1f}s)")
    print("    URL: https://stride.deped.gov.ph/insighted-esf7-staging/")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
