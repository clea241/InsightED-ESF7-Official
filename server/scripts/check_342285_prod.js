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

async function check() {
  try {
    console.log("=== PROD SECTIONS 342285 ===");
    const prodSec = await prodPool.query(
      "SELECT id, grade_level, section_name, adviser_id, extras FROM esf7_regular_sections WHERE school_id = '342285' ORDER BY id ASC",
    );
    console.log(`Count: ${prodSec.rowCount}`);
    for (const s of prodSec.rows) {
      console.log(
        `Section: ${s.section_name} (${s.grade_level}) -> adviser_id: ${s.adviser_id}, extra: ${s.extras?.advisorId || s.extras?.adviserId}`,
      );
    }

    console.log(
      "\n=== Checking 843224 and 843221 in PROD Personnel 342285 ===",
    );
    const p1 = await prodPool.query(
      "SELECT id, prn, legacy_id, first_name, last_name FROM esf7_personnel_profile WHERE school_id = '342285' AND (id IN ('843224', '843221') OR legacy_id IN ('843224', '843221'))",
    );
    console.log("Matches in PROD:", p1.rows);
  } finally {
    await prodPool.end();
    await stagingPool.end();
  }
}
check();
