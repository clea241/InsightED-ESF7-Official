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
    console.log("=== Sample Linked Rows from esf7_regular_sections ===");
    const sampleReg = await client.query(`
      SELECT w.id as workload_id, w.school_id, w.subject, w.section_id, r.section_name as reg_section_name, r.grade_level as reg_grade
      FROM esf7_workload_rows w
      JOIN esf7_regular_sections r ON w.section_id = r.id
      LIMIT 3;
    `);
    console.log(sampleReg.rows);

    console.log("\n=== Sample Linked Rows from esf7_als_sections ===");
    const sampleAls = await client.query(`
      SELECT w.id as workload_id, w.school_id, w.subject, w.section_id, a.section_name as als_section_name, a.grade_level as als_grade
      FROM esf7_workload_rows w
      JOIN esf7_als_sections a ON w.section_id = a.id
      LIMIT 3;
    `);
    console.log(sampleAls.rows);

    console.log("\n=== Sample Linked Rows from esf7_aral_sections ===");
    const sampleAral = await client.query(`
      SELECT w.id as workload_id, w.school_id, w.subject, w.section_id, ar.section_name as aral_section_name, ar.grade_level as aral_grade
      FROM esf7_workload_rows w
      JOIN esf7_aral_sections ar ON w.section_id = ar.id
      LIMIT 3;
    `);
    console.log(sampleAral.rows);

    console.log("\n=== Sample Linked Rows from esf7_sned_sections ===");
    const sampleSned = await client.query(`
      SELECT w.id as workload_id, w.school_id, w.subject, w.section_id, s.section_name as sned_section_name, s.grade_level as sned_grade
      FROM esf7_workload_rows w
      JOIN esf7_sned_sections s ON w.section_id = s.id
      LIMIT 3;
    `);
    console.log(sampleSned.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
