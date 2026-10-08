"""
scan_dump_drops.py

High-performance, low-memory Python audit script to stream the PostgreSQL 17
custom dump and find schools whose class sections dropped between backup and live database.
"""

import subprocess
import json
import re
import sys
import os
import psycopg2

DUMP_PATH = sys.argv[1] if len(sys.argv) > 1 else '/mnt/esf7_backups/20261008_snapshot/db/insighted_esf7.dump'
THRESHOLD = int(sys.argv[2]) if len(sys.argv) > 2 else 5
PG_RESTORE = '/usr/lib/postgresql/17/bin/pg_restore' if os.path.exists('/usr/lib/postgresql/17/bin/pg_restore') else 'pg_restore'

print(f"=== Scanning backup dump using {PG_RESTORE}: {DUMP_PATH} ===")

dump_counts = {}

proc = subprocess.Popen([
    PG_RESTORE, '-f', '-', '-a', '-t', 'school_drafts', DUMP_PATH
], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace', bufsize=65536)

line_count = 0
for line in proc.stdout:
    if not line or line.startswith('\\.'):
        continue
    parts = line.split('\t', 3)
    if len(parts) >= 3:
        school_id = parts[0]
        school_year = parts[1]
        raw_json = parts[2]
        updated_at = parts[3].strip() if len(parts) > 3 else 'N/A'

        # Fast extraction without parsing giant JSON
        sec_idx = raw_json.find('"classSections"')
        sec_count = 0
        if sec_idx != -1:
            start_b = raw_json.find('[', sec_idx)
            if start_b != -1:
                end_b = raw_json.find(']', start_b)
                if end_b != -1:
                    slice_str = raw_json[start_b:end_b+1]
                    sec_count = len(re.findall(r'"id"\s*:', slice_str))

        per_idx = raw_json.find('"personnel"')
        per_count = 0
        if per_idx != -1:
            start_p = raw_json.find('[', per_idx)
            if start_p != -1:
                end_p = raw_json.find(']', start_p)
                if end_p != -1:
                    slice_p = raw_json[start_p:end_p+1]
                    per_count = len(re.findall(r'"id"\s*:', slice_p))

        dump_counts[f"{school_id}_{school_year}"] = {
            'school_id': school_id,
            'school_year': school_year,
            'sections': sec_count,
            'personnel': per_count,
            'updated_at': updated_at
        }
        line_count += 1
        if line_count % 3000 == 0:
            print(f"  Parsed {line_count} schools from backup dump...")

proc.terminate()
print(f"✓ Total schools indexed from backup: {len(dump_counts)}")

# Connect to database and compare with live
db_url = os.environ.get('DATABASE_URL')
conn = None
if not db_url:
    # Read from /mnt/insighted-esf7-staging/server/.env if available
    env_file = '/mnt/insighted-esf7-staging/server/.env'
    if os.path.exists(env_file):
        with open(env_file) as f:
            for l in f:
                if l.startswith('DATABASE_URL='):
                    db_url = l.split('=', 1)[1].strip()

if db_url:
    conn = psycopg2.connect(db_url)
else:
    conn = psycopg2.connect(
        host=os.environ.get('DB_HOST', 'stride-posgre-prod-01.postgres.database.azure.com'),
        user=os.environ.get('DB_USER', 'Administrator1'),
        password=os.environ.get('DB_PASSWORD', 'pRZTbQ2T1JD7'),
        dbname=os.environ.get('DB_NAME', 'insighted_esf7'),
        port=5432,
        sslmode='require'
    )

cur = conn.cursor()
cur.execute("""
    SELECT school_id, school_year, updated_at,
           payload->'schoolInfo'->>'schoolName' as school_name,
           jsonb_array_length(COALESCE(payload->'classSections', '[]'::jsonb)) as live_sections,
           jsonb_array_length(COALESCE(payload->'personnel', '[]'::jsonb)) as live_personnel
    FROM school_drafts
""")

rows = cur.fetchall()
print(f"✓ Total active schools in live DB: {len(rows)}")

drops = []
for r in rows:
    sid, sy, live_updated, sname, live_sec, live_per = r
    key = f"{sid}_{sy}"
    if key in dump_counts:
        bk = dump_counts[key]
        diff = bk['sections'] - live_sec
        if diff >= THRESHOLD:
            drops.append({
                'school_id': sid,
                'name': sname or f"School {sid}",
                'sy': sy,
                'backup_sec': bk['sections'],
                'live_sec': live_sec,
                'drop': diff,
                'personnel': live_per,
                'backup_updated': bk['updated_at'],
                'live_updated': str(live_updated)
            })

print("\n" + "="*80)
if drops:
    print(f"🚨 FOUND {len(drops)} SCHOOL(S) WITH CLASS SECTION DROPS >= {THRESHOLD}:")
    print("="*80)
    for d in sorted(drops, key=lambda x: x['drop'], reverse=True):
        print(f"School ID: {d['school_id']:<10} | Name: {d['name'][:30]:<30} | SY: {d['sy']}")
        print(f"  Backup Sections: {d['backup_sec']:<4} -> Live Sections: {d['live_sec']:<4} (DROP: -{d['drop']})")
        print(f"  Personnel: {d['personnel']:<4} | Backup Time: {d['backup_updated']} | Live Time: {d['live_updated']}\n")
else:
    print(f"✓ Zero schools found with section drops >= {THRESHOLD} between backup dump and live DB.")
print("="*80)

cur.close()
conn.close()
