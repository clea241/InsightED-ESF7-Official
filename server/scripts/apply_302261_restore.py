import os
import json
import psycopg2

print("=== Executing Safe Restoration for Legazpi City National High School (302261) ===")

# Verify pre-restore backup exists
backup_path = "/mnt/esf7_backups/302261_pre_restore_backup.json"
if not os.path.exists(backup_path):
    print("FATAL ERROR: Pre-restore backup file does not exist! Aborting.")
    exit(1)

with open("/tmp/302261_merged_payload.json") as f:
    merged_payload = json.load(f)

sections = merged_payload.get('classSections', [])
personnel = merged_payload.get('personnel', [])

print(f"Target payload verified: {len(sections)} sections, {len(personnel)} personnel.")
if len(sections) < 44:
    print(f"FATAL ERROR: Sections count is only {len(sections)}, expected >= 44! Aborting.")
    exit(1)

conn = psycopg2.connect(
    host=os.environ.get('DB_HOST', 'stride-posgre-prod-01.postgres.database.azure.com'),
    user=os.environ.get('DB_USER', 'Administrator1'),
    password=os.environ.get('DB_PASSWORD', 'pRZTbQ2T1JD7'),
    dbname='insighted_esf7',
    port=5432,
    sslmode='require'
)
conn.autocommit = False
cur = conn.cursor()

try:
    cur.execute("""
        UPDATE school_drafts
        SET payload = %s::jsonb, updated_at = NOW()
        WHERE school_id = '302261' AND school_year = 'SY 26-27'
        RETURNING school_id, school_year, updated_at, jsonb_array_length(payload->'classSections') as sec_count, jsonb_array_length(payload->'personnel') as per_count
    """, [json.dumps(merged_payload)])

    row = cur.fetchone()
    if not row:
        raise Exception("Update returned 0 rows! School ID 302261 not found.")

    conn.commit()
    print("✓ COMMIT SUCCESSFUL!")
    print(f"  School ID: {row[0]}")
    print(f"  School Year: {row[1]}")
    print(f"  Updated At: {row[2]}")
    print(f"  Active Sections Count in Database: {row[3]}")
    print(f"  Active Personnel Count in Database: {row[4]}")

except Exception as e:
    conn.rollback()
    print("FATAL: Rollback executed due to error:", e)
    exit(1)
finally:
    cur.close()
    conn.close()

# Invalidate Redis dashboard cache for school 302261
try:
    import subprocess
    cmd = "redis-cli --scan --pattern 'dashboard:stats:302261:*' | xargs -r redis-cli del"
    subprocess.run(cmd, shell=True, check=False)
    print("✓ Cleared Redis cache keys for 302261 via redis-cli.")
except Exception as re_err:
    print("Notice (Redis cache clearance):", re_err)

print("\n🎉 RESTORATION COMPLETED SUCCESSFULLY!")
