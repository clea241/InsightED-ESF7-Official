const { Pool } = require("pg");

const prodUrl =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require";
const stagingUrl =
  "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7_staging?sslmode=require";

const prodPool = new Pool({
  connectionString: prodUrl,
  ssl: { rejectUnauthorized: false },
});
const stagingPool = new Pool({
  connectionString: stagingUrl,
  ssl: { rejectUnauthorized: false },
});

async function checkIds() {
  try {
    for (const schoolId of ["300488", "342285"]) {
      console.log(`\n=== PROD for ${schoolId} ===`);
      const pSummary = await prodPool.query(
        `
        SELECT count(*), min(id) as min_id, max(id) as max_id, 
               min(prn) as min_prn, max(prn) as max_prn,
               count(*) filter (where prn ~ '^PRN-[0-9]{7}$') as std_prn_count,
               count(*) filter (where id::text ~ '^[0-9]+$') as num_id_count
        FROM esf7_personnel_profile WHERE school_id = $1
      `,
        [schoolId],
      );
      console.log(pSummary.rows[0]);

      const pSamples = await prodPool.query(
        `SELECT id, prn, first_name, last_name, legacy_id FROM esf7_personnel_profile WHERE school_id = $1 ORDER BY id LIMIT 5`,
        [schoolId],
      );
      console.log("PROD samples:", pSamples.rows);

      console.log(`\n=== STAGING for ${schoolId} ===`);
      const sSummary = await stagingPool.query(
        `
        SELECT count(*), min(id) as min_id, max(id) as max_id, 
               min(prn) as min_prn, max(prn) as max_prn,
               count(*) filter (where prn ~ '^PRN-[0-9]{7}$') as std_prn_count,
               count(*) filter (where id::text ~ '^[0-9]+$') as num_id_count
        FROM esf7_personnel_profile WHERE school_id = $1
      `,
        [schoolId],
      );
      console.log(sSummary.rows[0]);

      const sSamples = await stagingPool.query(
        `SELECT id, prn, first_name, last_name, legacy_id FROM esf7_personnel_profile WHERE school_id = $1 ORDER BY id LIMIT 5`,
        [schoolId],
      );
      console.log("STAGING samples:", sSamples.rows);
    }
  } finally {
    await prodPool.end();
    await stagingPool.end();
  }
}

checkIds();
