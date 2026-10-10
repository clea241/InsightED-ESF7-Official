-- params: []
-- database: esf7_local
SELECT sum(length(s.v::text)) FROM (SELECT "raw_payload" AS v FROM "esf7_perssonel_educ" LIMIT 9962) s;
