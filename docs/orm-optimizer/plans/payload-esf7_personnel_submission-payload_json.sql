-- params: []
-- database: esf7_local
SELECT sum(length(s.v::text)) FROM (SELECT "payload_json" AS v FROM "esf7_personnel_submission" LIMIT 8309) s;
