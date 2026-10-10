-- params: []
-- database: esf7_local
SELECT count(*) FROM (SELECT 1 FROM "esf7_admin_task" LIMIT 20000) s;
