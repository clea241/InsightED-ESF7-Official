-- params: ["CACHE_100182_CACHE_100182_local-p-1790903968006-jmse0blqz","1st"]
-- database: esf7_local
SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2 ORDER BY created_at ASC;
