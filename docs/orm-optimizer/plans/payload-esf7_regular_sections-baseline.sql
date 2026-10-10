-- params: []
-- database: esf7_local
SELECT count(*) FROM (SELECT 1 FROM "esf7_regular_sections" LIMIT 20000) s;
