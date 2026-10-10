-- params: []
-- database: esf7_local
SELECT sum(length(s.v::text)) FROM (SELECT "payload" AS v FROM "school_drafts" LIMIT 374) s;
