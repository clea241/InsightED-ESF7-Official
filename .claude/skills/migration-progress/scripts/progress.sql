-- Live Migration Progress SQL Queries
-- Database: esf7_local (or insighted_esf7)
-- Strictly Read-Only (SELECT only)
--
-- Usage with psql:
--   psql -h localhost -p 5432 -U postgres -d esf7_local -f progress.sql

-- 1. Reconciliation & Progress Summary
WITH target AS (
  SELECT count(*)::int AS total_target FROM school_drafts
),
migrated AS (
  SELECT
    count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
    count(*) FILTER (WHERE status = 'FAILED')::int AS failed_count
  FROM esf7_migration_log
)
SELECT 
  'Stage 2 Disaggregation' AS stage,
  migrated.completed_count,
  migrated.failed_count,
  (target.total_target - migrated.completed_count - migrated.failed_count) AS pending_count,
  target.total_target AS target_total,
  ROUND((migrated.completed_count::numeric / NULLIF(target.total_target, 0)::numeric) * 100, 1) AS pct_complete
FROM target, migrated;

-- 2. Status Breakdown in Migration Log
SELECT 
  status,
  count(*)::int AS school_count,
  min(migrated_at) AS first_migrated_at,
  max(migrated_at) AS latest_migrated_at
FROM esf7_migration_log
GROUP BY status
ORDER BY status;

-- 3. Normalized Relational Tables Live Row Counts
SELECT
  (SELECT count(*)::int FROM esf7_personnel_profile) AS personnel_profile,
  (SELECT count(*)::int FROM esf7_regular_sections) AS regular_sections,
  (SELECT count(*)::int FROM esf7_workload_rows) AS workload_rows,
  (SELECT count(*)::int FROM esf7_school_profile) AS school_profile,
  (SELECT count(*)::int FROM esf7_sned_sections) AS sned_sections,
  (SELECT count(*)::int FROM esf7_als_sections) AS als_sections;
