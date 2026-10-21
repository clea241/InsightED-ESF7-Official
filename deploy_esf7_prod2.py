#!/usr/bin/env python3
"""Deploy ESF7 with base path /insighted-esf7-prod2/ for temporary testing.

    python deploy_esf7_prod2.py [--skip-gate] [--ship-env]
"""
import deploy_common as dc

TARGET = dc.Target(
    name="production",
    title="ESF7 OFFICIAL PRODUCTION: TESTING AT /insighted-esf7-prod2/",
    remote_host="20.24.58.49",
    remote_user="Administrator1",
    remote_root="/var/www/html/InsightED-ROSDO/insighted-esf7-prod",
    port=5007,
    pm2_name="insighted-esf7-prod-backend",
    ecosystem_config="ecosystem.esf7-prod.config.cjs",
    archive_name="esf7-prod-deploy.tmp.tar.gz",
    public_url="https://stride.deped.gov.ph/insighted-esf7-prod2/",
    vite_base_path="/insighted-esf7-prod2/",
    vite_api_url="/insighted-esf7-prod2/api",
    db_name="insighted_esf7",
    path_token="prod",
    other_token="staging",
    db_direct_host="stride-posgre-prod-01.postgres.database.azure.com",
    gate="strict",
    stream_precheck=True,
    ssh_strict_host_key="accept-new",
    ssh_alive_interval=15,
    extra_archive=("client/public",),
    backup_dir="/var/backups/esf7",
)

if __name__ == "__main__":
    dc.run_deploy(TARGET)
