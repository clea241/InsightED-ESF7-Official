-- params: []
-- database: esf7_local
SELECT sum(length(s.v::text)) FROM (SELECT "raw_payload" AS v FROM "esf7_personnel_allowances" LIMIT 20000) s;
