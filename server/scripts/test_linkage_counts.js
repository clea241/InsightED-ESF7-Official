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
    console.log("Testing linkage across section tables...");

    // 1. Direct matches currently in DB:
    const q1 = await client.query(`
      SELECT 
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_regular_sections r ON w.section_id = r.id) as direct_reg,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_als_sections a ON w.section_id = a.id) as direct_als,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_aral_sections ar ON w.section_id = ar.id) as direct_aral,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_sned_sections s ON w.section_id = s.id) as direct_sned;
    `);
    console.log("Current direct ID matches:", q1.rows[0]);

    // 2. Count by school_id + exact grade_level + exact section_name
    console.log("\nTesting exact grade + section_name matches:");
    const qGradeReg = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
        AND UPPER(TRIM(COALESCE(w.grade_level, ''))) = UPPER(TRIM(COALESCE(r.grade_level, '')));
    `);
    console.log("Regular (grade + name):", qGradeReg.rows[0].count);

    // 3. Count by school_id + section_name only (ignoring grade_level differences like "Grade 5" vs "Grade 5 - Diamond")
    const qNameReg = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name));
    `);
    console.log("Regular (name only on school_id):", qNameReg.rows[0].count);

    const qNameAls = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_als_sections a 
        ON w.school_id = a.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(a.section_name));
    `);
    console.log("ALS (name only on school_id):", qNameAls.rows[0].count);

    const qNameAral = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_aral_sections ar 
        ON w.school_id = ar.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(ar.section_name));
    `);
    console.log("ARAL (name only on school_id):", qNameAral.rows[0].count);

    const qNameSned = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_sned_sections s 
        ON w.school_id = s.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(s.section_name));
    `);
    console.log("SNED (name only on school_id):", qNameSned.rows[0].count);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
