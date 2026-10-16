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

async function checkAdvisers() {
  try {
    for (const schoolId of ["300488", "342285"]) {
      console.log(`\n=== PROD Sections for ${schoolId} ===`);
      const pSec = await prodPool.query(
        `
        SELECT section_name, grade_level, adviser_id
        FROM esf7_regular_sections WHERE school_id = $1
        ORDER BY grade_level, section_name LIMIT 10
      `,
        [schoolId],
      );
      console.log(pSec.rows);

      // Check how many adviser_id in PROD match esf7_personnel_profile.id or prn
      const pMatch = await prodPool.query(
        `
        SELECT count(*) as total_sec,
               count(p.id) as matched_by_id,
               count(p2.id) as matched_by_prn
        FROM esf7_regular_sections s
        LEFT JOIN esf7_personnel_profile p ON p.school_id = s.school_id AND p.id::text = s.adviser_id::text
        LEFT JOIN esf7_personnel_profile p2 ON p2.school_id = s.school_id AND p2.prn = s.adviser_id::text
        WHERE s.school_id = $1
      `,
        [schoolId],
      );
      console.log("PROD adviser match:", pMatch.rows[0]);

      console.log(`\n=== STAGING Sections for ${schoolId} ===`);
      const sMatch = await stagingPool.query(
        `
        SELECT count(*) as total_sec,
               count(p.id) as matched_by_id,
               count(p2.id) as matched_by_prn
        FROM esf7_regular_sections s
        LEFT JOIN esf7_personnel_profile p ON p.school_id = s.school_id AND p.id::text = s.adviser_id::text
        LEFT JOIN esf7_personnel_profile p2 ON p2.school_id = s.school_id AND p2.prn = s.adviser_id::text
        WHERE s.school_id = $1
      `,
        [schoolId],
      );
      console.log("STAGING adviser match:", sMatch.rows[0]);
    }
  } finally {
    await prodPool.end();
    await stagingPool.end();
  }
}

checkAdvisers();
