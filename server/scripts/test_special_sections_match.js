require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("--- Testing SNED matching query ---");
    const testSned = await client.query(`
      SELECT w.id, w.school_id, w.section_id, w.section_name, s.id as sned_id, s.section_name as sned_name
      FROM esf7_workload_rows w
      JOIN esf7_sned_sections s 
        ON w.school_id = s.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(s.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections r WHERE r.id = w.section_id)
        AND (w.section_id IS NULL OR w.section_id != s.id)
      LIMIT 10;
    `);
    console.log("Sample SNED potential matches:", testSned.rows);

    console.log("\n--- Testing ALS matching query ---");
    const testAls = await client.query(`
      SELECT w.id, w.school_id, w.section_id, w.section_name, a.id as als_id, a.section_name as als_name
      FROM esf7_workload_rows w
      JOIN esf7_als_sections a 
        ON w.school_id = a.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(a.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections r WHERE r.id = w.section_id)
        AND (w.section_id IS NULL OR w.section_id != a.id)
      LIMIT 10;
    `);
    console.log("Sample ALS potential matches:", testAls.rows);

    console.log("\n--- Testing ARAL matching query ---");
    const testAral = await client.query(`
      SELECT w.id, w.school_id, w.section_id, w.section_name, ar.id as aral_id, ar.section_name as aral_name
      FROM esf7_workload_rows w
      JOIN esf7_aral_sections ar 
        ON w.school_id = ar.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(ar.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections r WHERE r.id = w.section_id)
        AND (w.section_id IS NULL OR w.section_id != ar.id)
      LIMIT 10;
    `);
    console.log("Sample ARAL potential matches:", testAral.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
