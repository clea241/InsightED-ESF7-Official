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
    console.log("--- Breakdown of unmatched workloads ---");

    // 1. How many workloads belong to schools that have 0 regular sections in esf7_regular_sections?
    const qNoSecInSchool = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections r WHERE r.school_id = w.school_id);
    `);
    console.log(
      "Workloads in schools with ZERO sections in DB:",
      qNoSecInSchool.rows[0].count,
    );

    // 2. How many workloads are ADMINISTRATIVE or ANCILLARY duties?
    const qAdmin = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      WHERE w.subject = 'ADMINISTRATIVE' OR w.subject LIKE 'TR - %' OR w.subject LIKE 'ADMIN %';
    `);
    console.log(
      "Workloads that are administrative / coordinator / ancillary duties:",
      qAdmin.rows[0].count,
    );

    // 3. For workloads in schools that DO have sections in DB, but didn't match section_name:
    const qSchoolsWithSecUnmatched = await client.query(`
      SELECT w.school_id, w.section_id, w.section_name, w.grade_level, w.subject
      FROM esf7_workload_rows w
      WHERE EXISTS (SELECT 1 FROM esf7_regular_sections r WHERE r.school_id = w.school_id)
        AND NOT EXISTS (
          SELECT 1 FROM esf7_regular_sections r 
          WHERE r.school_id = w.school_id AND UPPER(TRIM(r.section_name)) = UPPER(TRIM(w.section_name))
        )
        AND NOT EXISTS (
          SELECT 1 FROM esf7_als_sections a 
          WHERE a.school_id = w.school_id AND UPPER(TRIM(a.section_name)) = UPPER(TRIM(w.section_name))
        )
        AND NOT EXISTS (
          SELECT 1 FROM esf7_aral_sections ar 
          WHERE ar.school_id = w.school_id AND UPPER(TRIM(ar.section_name)) = UPPER(TRIM(w.section_name))
        )
        AND NOT EXISTS (
          SELECT 1 FROM esf7_sned_sections s 
          WHERE s.school_id = w.school_id AND UPPER(TRIM(s.section_name)) = UPPER(TRIM(w.section_name))
        )
      LIMIT 15;
    `);
    console.log(
      "\nSample unmatched workloads in schools that DO have sections in DB:",
    );
    console.log(qSchoolsWithSecUnmatched.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
