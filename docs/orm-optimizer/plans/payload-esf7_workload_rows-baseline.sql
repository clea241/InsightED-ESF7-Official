-- params: []
-- database: esf7_local
SELECT count(*) FROM (SELECT 1 FROM "esf7_workload_rows" LIMIT 20000) s;
