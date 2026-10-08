import os
import json
import psycopg2

print("=== Legazpi City National High School (302261) Restore Prep ===")

# 1. Connect to PostgreSQL
conn = psycopg2.connect(
    host=os.environ.get('DB_HOST', 'stride-posgre-prod-01.postgres.database.azure.com'),
    user=os.environ.get('DB_USER', 'Administrator1'),
    password=os.environ.get('DB_PASSWORD', 'pRZTbQ2T1JD7'),
    dbname='insighted_esf7',
    port=5432,
    sslmode='require'
)
cur = conn.cursor()

# 2. Backup current live row
cur.execute("SELECT payload, updated_at FROM school_drafts WHERE school_id = '302261' AND school_year = 'SY 26-27'")
row = cur.fetchone()
if not row:
    print("ERROR: Row for 302261 not found in live DB!")
    exit(1)

live_payload, live_updated_at = row
backup_path = "/mnt/esf7_backups/302261_pre_restore_backup.json"
with open(backup_path, "w") as f:
    json.dump(live_payload, f, indent=2)

print(f"✓ Backed up live state ({len(json.dumps(live_payload))} bytes, updated_at={live_updated_at}) to {backup_path}")

# 3. Load backup sections
with open("/tmp/legazpi_302261_backup_sections.json") as f:
    backup_sections = json.load(f)

print(f"✓ Loaded {len(backup_sections)} sections from backup snapshot.")

live_sections = live_payload.get('classSections', [])
print(f"✓ Current live sections count: {len(live_sections)}")

# 4. Merge logic:
# Map by stable key: section ID and normalized (gradeLevel + '::' + sectionName)
merged_map = {}
for s in backup_sections:
    sid = s.get('id')
    gl = (s.get('gradeLevel') or s.get('grade_level') or '').strip().upper()
    sn = (s.get('sectionName') or s.get('section_name') or '').strip().upper()
    key = sid or f"{gl}::{sn}"
    merged_map[key] = s

# Now overlay live sections: if live section has edits, keep them; if live section has null learners but backup has numbers, keep backup numbers!
for s in live_sections:
    sid = s.get('id')
    gl = (s.get('gradeLevel') or s.get('grade_level') or '').strip().upper()
    sn = (s.get('sectionName') or s.get('section_name') or '').strip().upper()
    key = sid or f"{gl}::{sn}"
    
    if key in merged_map:
        existing = merged_map[key]
        # Merge fields
        merged = dict(existing)
        # Update with live fields if not null/empty
        for k, v in s.items():
            if v is not None and v != '':
                merged[k] = v
            elif k in ['maleLearners', 'femaleLearners', 'numberOfLearners'] and (v is None or v == ''):
                # keep existing learner count from backup if live is null
                pass
        merged_map[key] = merged
    else:
        # brand new section added by user
        merged_map[key] = s

final_sections = list(merged_map.values())
print(f"✓ Merged sections count: {len(final_sections)}")

# Check grade level breakdown
gl_breakdown = {}
for s in final_sections:
    gl = s.get('gradeLevel') or s.get('grade_level') or 'Unknown'
    gl_breakdown[gl] = gl_breakdown.get(gl, 0) + 1

print("Merged Grade Breakdown:")
for gl, c in sorted(gl_breakdown.items()):
    print(f"  {gl}: {c} sections")

# Prepare new payload
new_payload = dict(live_payload)
new_payload['classSections'] = final_sections

# Save merged payload for review before committing
with open("/tmp/302261_merged_payload.json", "w") as f:
    json.dump(new_payload, f, indent=2)

print("✓ Saved /tmp/302261_merged_payload.json for application.")

cur.close()
conn.close()
