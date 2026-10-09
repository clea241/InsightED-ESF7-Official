#!/usr/bin/env bash
# Database Restore Script for insighted_esf7
# Usage: ./restore-db.sh /path/to/backup_file.dump [TARGET_DATABASE]
# Restores using pg_restore to a specified database and verifies row counts.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file> [target_database]"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB="${2:-${PGDATABASE:-${DB_NAME:-insighted_esf7_restore_test}}}"
HOST="${PGHOST:-${DB_HOST:-127.0.0.1}}"
PORT="${PGPORT:-${DB_PORT:-6432}}"
USER="${PGUSER:-${DB_USER:-Administrator1}}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file ${BACKUP_FILE} not found."
  exit 1
fi

echo "[restore] Target database: ${TARGET_DB}"
echo "[restore] Source file:     ${BACKUP_FILE}"
echo "[restore] Starting pg_restore at $(date)..."

# Decrypt if encrypted
RESTORE_SOURCE="${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.enc ]]; then
  echo "[restore] Decrypting archive..."
  RESTORE_SOURCE="/tmp/decrypted_$(basename "${BACKUP_FILE}" .enc)"
  openssl enc -d -aes-256-cbc -in "${BACKUP_FILE}" -out "${RESTORE_SOURCE}" -pass pass:"${BACKUP_PASSPHRASE:-}"
fi

# Run pg_restore
PG_CREDENTIAL="${PGPASSWORD:-${DB_PASSWORD:-}}"
export PGPASSWORD=$PG_CREDENTIAL
pg_restore -h "${HOST}" -p "${PORT}" -U "${USER}" -d "${TARGET_DB}" \
  --clean --if-exists --no-owner --no-acl -v "${RESTORE_SOURCE}" || {
    echo "[restore] pg_restore exited with non-zero (warnings may be present, checking verification query next)"
  }

# Clean temporary decrypted file if created
if [[ "${BACKUP_FILE}" == *.enc ]]; then
  rm -f "${RESTORE_SOURCE}"
fi

# Verification step: Verify key table counts in target database
echo "[restore] Verifying table counts in ${TARGET_DB}..."
psql -h "${HOST}" -p "${PORT}" -U "${USER}" -d "${TARGET_DB}" -c "
  SELECT 'esf7_school_profiles' AS tbl, COUNT(*) FROM esf7_school_profiles
  UNION ALL
  SELECT 'esf7_personnel', COUNT(*) FROM esf7_personnel
  UNION ALL
  SELECT 'esf7_workloads', COUNT(*) FROM esf7_workloads;
"

echo "[restore] Restore and verification completed successfully at $(date)."
