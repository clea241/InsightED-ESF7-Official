require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Sample rows in esf7_personnel_allowances ===");
    const sample = await client.query(`
      SELECT id, personnel_id, school_id, school_year, 
        has_pera, pera_amount, has_uniform, uniform_amount, 
        has_supplies, supplies_amount, has_medical, medical_amount, 
        has_hardship, hardship_amount, disabled_allowances,
        raw_payload
      FROM esf7_personnel_allowances
      LIMIT 3;
    `);
    console.log(JSON.stringify(sample.rows, null, 2));

    console.log("\n=== Check how many have raw_payload non-null ===");
    const rpCount = await client.query(`
      SELECT 
        count(*) as total,
        count(raw_payload) as with_raw_payload,
        count(has_pera) as with_has_pera
      FROM esf7_personnel_allowances;
    `);
    console.log(rpCount.rows[0]);

    console.log("\n=== Check draft payload for allowances ===");
    const draftSample = await client.query(`
      SELECT school_id,
        payload->'allowances' as allowances,
        payload->'teachers' as teachers
      FROM school_drafts
      WHERE payload->'allowances' IS NOT NULL 
        OR payload->'teachers' IS NOT NULL
      LIMIT 10;
    `);

    let foundAllowanceInDraft = false;
    for (const d of draftSample.rows) {
      if (d.allowances) {
        console.log(
          `School ${d.school_id} has top-level allowances:`,
          JSON.stringify(d.allowances).slice(0, 200),
        );
        foundAllowanceInDraft = true;
      }
      if (Array.isArray(d.teachers)) {
        for (const t of d.teachers) {
          if (t.allowances || t.personnelAllowances || t.allowance) {
            console.log(
              `School ${d.school_id} teacher ${t.id} has allowances:`,
              t.allowances || t.personnelAllowances || t.allowance,
            );
            foundAllowanceInDraft = true;
            break;
          }
        }
      }
      if (foundAllowanceInDraft) break;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
