#!/usr/bin/env python3
"""Deploy ESF7 to STAGING. Thin config: all logic (gate, build info, health/smoke checks, rollback) is in deploy_common.py.

    python deploy_esf7_staging.py [--skip-gate] [--ship-env]
"""
import deploy_common as dc

TARGET = dc.Target(
    name="staging",
    title="ESF7 OFFICIAL STAGING: DEPLOYMENT (v2.0 verified, auto-rollback)",
    remote_host="20.24.58.49",
    remote_user="Administrator1",
    remote_root="/mnt/insighted-esf7-staging",
    port=5035,
    pm2_name="insighted-esf7-staging-backend",
    ecosystem_config="ecosystem.esf7-staging.config.cjs",
    archive_name="esf7-staging-deploy.tar.gz",
    public_url="https://stride.deped.gov.ph/insighted-esf7-staging/",
    vite_base_path="/insighted-esf7-staging/",
    vite_api_url="/insighted-esf7-staging/api",
    db_name="insighted_esf7",
    path_token="staging",
    other_token="prod",
    db_direct_host="stride-posgre-prod-01.postgres.database.azure.com",
    gate="light",
    use_watchdog_lock=True,
    ssh_strict_host_key="no",
    ssh_alive_interval=5,
)

if __name__ == "__main__":
    dc.run_deploy(TARGET)
