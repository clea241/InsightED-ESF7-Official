#!/usr/bin/env bash
# Automated Scheduled PostgreSQL Backup Script for insighted_esf7
# Reads credentials strictly from environment variables - NO hardcoded secrets.
# Supports compression, retention cleanup, encryption, and off-host sync.

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/insighted_esf7}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE="$(date +'%Y%m%d_%H%M%S')"
DATABASE="${PGDATABASE:-${DB_NAME:-insighted_esf7}}"
HOST="${PGHOST:-${DB_HOST:-127.0.0.1}}"
PORT="${PGPORT:-${DB_PORT:-6432}}"
USER="${PGUSER:-${DB_USER:-Administrator1}}"
BACKUP_FILE="${BACKUP_DIR}/${DATABASE}_${DATE}.dump"

# Ensure target directory exists outside app directory
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[backup] Starting automated pg_dump for database ${DATABASE} at $(date)..."

# Execute compressed custom-format pg_dump
PG_CREDENTIAL="${PGPASSWORD:-${DB_PASSWORD:-}}"
export PGPASSWORD=$PG_CREDENTIAL
pg_dump -h "${HOST}" -p "${PORT}" -U "${USER}" -d "${DATABASE}" \
  -F c -b -v -f "${BACKUP_FILE}"

echo "[backup] Backup completed successfully: ${BACKUP_FILE} ($(stat -c%s "${BACKUP_FILE}" 2>/dev/null || wc -c < "${BACKUP_FILE}") bytes)"

# Optional encryption (e.g. openssl enc -aes-256-cbc or gpg --encrypt)
if [ "${ENCRYPT_BACKUPS:-false}" = "true" ] && [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  echo "[backup] Encrypting backup with AES-256..."
  openssl enc -aes-256-cbc -salt -in "${BACKUP_FILE}" -out "${BACKUP_FILE}.enc" -pass pass:"${BACKUP_PASSPHRASE}"
  rm -f "${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE}.enc"
fi

# Optional off-host replication to object storage (rclone / aws s3 sync)
if [ "${OFFHOST_SYNC:-false}" = "true" ] && [ -n "${OFFHOST_DESTINATION:-}" ]; then
  echo "[backup] Syncing backup off-host to ${OFFHOST_DESTINATION}..."
  rclone copy "${BACKUP_FILE}" "${OFFHOST_DESTINATION}" || aws s3 cp "${BACKUP_FILE}" "${OFFHOST_DESTINATION}"
fi

# Retention policy: prune backups older than RETENTION_DAYS
echo "[backup] Pruning local backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "${DATABASE}_*.dump*" -type f -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;

echo "[backup] Backup job finished cleanly at $(date)."
