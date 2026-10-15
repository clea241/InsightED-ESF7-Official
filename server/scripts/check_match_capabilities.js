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
    console.log("--- Checking match capabilities ---");

    // 1. Where section_id does NOT directly match any of the 4 tables, how many match regular sections by (school_id, section_name)?
    const resRegName = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id);
    `);
    console.log(
      "Unmatched workloads matching regular_sections by name:",
      resRegName.rows[0].count,
    );

    // 2. What about with grade_level match as well?
    const resRegGradeAndName = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
        AND UPPER(TRIM(COALESCE(w.grade_level, ''))) = UPPER(TRIM(COALESCE(r.grade_level, '')))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id);
    `);
    console.log(
      "Unmatched workloads matching regular_sections by name AND grade_level:",
      resRegGradeAndName.rows[0].count,
    );

    // 3. For SNED sections
    const resSned = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_sned_sections s 
        ON w.school_id = s.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(s.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id);
    `);
    console.log(
      "Unmatched workloads matching sned_sections by name:",
      resSned.rows[0].count,
    );

    // 4. For ALS sections
    const resAls = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_als_sections a 
        ON w.school_id = a.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(a.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id);
    `);
    console.log(
      "Unmatched workloads matching als_sections by name:",
      resAls.rows[0].count,
    );

    // 5. For ARAL sections
    const resAral = await client.query(`
      SELECT count(*) FROM esf7_workload_rows w
      JOIN esf7_aral_sections ar 
        ON w.school_id = ar.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(ar.section_name))
      WHERE NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id);
    `);
    console.log(
      "Unmatched workloads matching aral_sections by name:",
      resAral.rows[0].count,
    );

    // 6. Look at a sample of matching pairs
    const sampleMatches = await client.query(`
      SELECT w.id, w.school_id, w.section_id as old_sec_id, r.id as new_sec_id, w.section_name, w.grade_level
      FROM esf7_workload_rows w
      JOIN esf7_regular_sections r 
        ON w.school_id = r.school_id 
        AND UPPER(TRIM(w.section_name)) = UPPER(TRIM(r.section_name))
      WHERE w.section_id != r.id
      LIMIT 10;
    `);
    console.log("\nSample matching pairs (regular):");
    console.log(sampleMatches.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
