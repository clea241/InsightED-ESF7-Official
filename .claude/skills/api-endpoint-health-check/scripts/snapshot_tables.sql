-- Read-only per-table write counters used for before/after comparison. SELECT only (enforced by lib.assertSelectOnly).
-- Counters are Postgres statistics: they lag by up to ~1 second and include activity from every client of the database,
-- so a delta is evidence only when the database was otherwise idle (run_probes.js calibrates this first).
SELECT relname AS table_name,
       n_tup_ins, n_tup_upd, n_tup_del, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
