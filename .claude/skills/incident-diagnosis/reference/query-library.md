# Query library (read-only)

Run only through `node scripts/run-queries.js --name <result> --lib <query-name> --param key=value`. Every query is a single SELECT, returns ids and counts only, and gets a row limit added by the runner. Tenant = `school_id`; period = `school_year`.

Adapted once to this repo's schema (from `server/create_*.js`). If a table or column below does not exist on the live database, fix it **here**, once, and keep the corrected version; do not rewrite queries per incident. Items marked ADAPT could not be confirmed from the repo and need one read-only check of the live schema (`information_schema.columns`) the first time.

Cost key: cheap = indexed or catalog-sized; medium = scans one table filtered by `school_year`; avoid at peak load.

### records-per-tenant
Purpose: current number of class sections per school for a school year. Cost: medium. Columns: school_id, sections.
```sql
select school_id, count(*) as sections
from esf7_class_sections
where school_year = :school_year
group by school_id
order by sections
```

### tenants-below-threshold
Purpose: schools whose section count is at or below a threshold (for example a drop from 44 to 2). Cost: medium. Columns: school_id, sections.
```sql
select school_id, count(*) as sections
from esf7_class_sections
where school_year = :school_year
group by school_id
having count(*) <= :max_sections
order by sections
```

### records-changed-in-window
Purpose: how many sections were created or updated per school in a time window. Cost: medium (uses updated_at; add an index only through a reviewed migration, never during the incident). Columns: school_id, created_n, updated_n.
```sql
select school_id,
       count(*) filter (where created_at >= :since and created_at < :until) as created_n,
       count(*) filter (where updated_at >= :since and updated_at < :until) as updated_n
from esf7_class_sections
where school_year = :school_year
  and (created_at >= :since or updated_at >= :since)
group by school_id
order by updated_n desc
```

### draft-saves-in-window
Purpose: which schools had their whole-draft JSON row written in the window (detects whole-payload overwrites). Cost: cheap (primary key table). Columns: school_id, school_year, updated_at, payload_bytes.
```sql
select school_id, school_year, updated_at, pg_column_size(payload) as payload_bytes
from school_drafts
where updated_at >= :since and updated_at < :until
order by updated_at
```

### personnel-per-tenant
Purpose: personnel profile count per school, to compare with a previous count or threshold. Cost: medium. Columns: school_id, personnel.
```sql
select school_id, count(*) as personnel
from esf7_personnel_profile
where school_year = :school_year
group by school_id
order by personnel
```

### orphaned-sections
Purpose: sections whose advisor no longer exists (advisor_id is set to NULL on delete), a sign of deleted personnel. Cost: medium. Columns: school_id, orphaned.
```sql
select school_id, count(*) as orphaned
from esf7_class_sections s
where school_year = :school_year and advisor_id is null
group by school_id
order by orphaned desc
```

### duplicate-sections
Purpose: duplicate section names within the same school, year and grade. Cost: medium. Columns: school_id, grade_level, duplicates.
```sql
select school_id, grade_level, section_name, count(*) as duplicates
from esf7_class_sections
where school_year = :school_year
group by school_id, grade_level, section_name
having count(*) > 1
order by duplicates desc
```

### queue-backlog
Purpose: submission queue state per school (PostgreSQL queue). Cost: cheap to medium. Columns: school_id, status, jobs, oldest. ADAPT: confirm whether the live table is `esf7_submission_queue` or `submission_queue`.
```sql
select school_id, status, count(*) as jobs, min(created_at) as oldest
from esf7_submission_queue
where status <> 'done' and created_at >= :since
group by school_id, status
order by jobs desc
```

### queue-failures
Purpose: failed jobs per school in a window. Cost: cheap to medium. Columns: school_id, failed, last_failed.
```sql
select school_id, count(*) as failed, max(updated_at) as last_failed
from esf7_submission_queue
where status = 'failed' and updated_at >= :since and updated_at < :until
group by school_id
order by failed desc
```

### tenants-affected-by-release
Purpose: schools that wrote data after a release time (join the release timestamp from the deploy log or release marker into `:release_at`). Cost: medium. Columns: school_id, writes_after_release.
```sql
select school_id, count(*) as writes_after_release
from esf7_class_sections
where school_year = :school_year and updated_at >= :release_at
group by school_id
order by writes_after_release desc
```

### sessions-in-window
ADAPT: no session or token table was found in the repo's migrations. If logins are only stateless JWTs, answer "who was logged out" from nginx 401 counts (timeline) instead of a query. If a table exists, add its query here, selecting ids and timestamps only (never token values).
```sql
select 1 as adapt_me where false
```
