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
    console.log("--- 1. Ensuring helper indexes exist ---");
    console.time("indexes");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wkl_school_sec_lower ON esf7_workload_rows (school_id, UPPER(TRIM(section_name)));
      CREATE INDEX IF NOT EXISTS idx_reg_school_sec_lower ON esf7_regular_sections (school_id, UPPER(TRIM(section_name)));
      CREATE INDEX IF NOT EXISTS idx_sned_school_sec_lower ON esf7_sned_sections (school_id, UPPER(TRIM(section_name)));
      CREATE INDEX IF NOT EXISTS idx_als_school_sec_lower ON esf7_als_sections (school_id, UPPER(TRIM(section_name)));
      CREATE INDEX IF NOT EXISTS idx_aral_school_sec_lower ON esf7_aral_sections (school_id, UPPER(TRIM(section_name)));
    `);
    console.timeEnd("indexes");
    console.log("✓ Helper indexes ready.");

    console.log("\n--- 2. Measuring before stats ---");
    const beforeStats = await client.query(`
      SELECT 
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_regular_sections r ON w.section_id = r.id) as reg_connected,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_als_sections a ON w.section_id = a.id) as als_connected,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_aral_sections ar ON w.section_id = ar.id) as aral_connected,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_sned_sections s ON w.section_id = s.id) as sned_connected;
    `);
    console.log("Before stats:", beforeStats.rows[0]);

    // Step 1: Regular sections exact grade + name
    console.log(
      "\n--- Step 1: Connecting regular sections (exact grade + name) ---",
    );
    console.time("step1");
    const step1 = await client.query(`
      UPDATE esf7_workload_rows w
      SET section_id = r.id
      FROM (
        SELECT DISTINCT ON (school_id, UPPER(TRIM(section_name)), UPPER(TRIM(grade_level)))
          id, school_id, UPPER(TRIM(section_name)) as norm_name, UPPER(TRIM(grade_level)) as norm_grade
        FROM esf7_regular_sections
        ORDER BY school_id, UPPER(TRIM(section_name)), UPPER(TRIM(grade_level)), id
      ) r
      WHERE w.school_id = r.school_id
        AND UPPER(TRIM(w.section_name)) = r.norm_name
        AND UPPER(TRIM(COALESCE(w.grade_level, ''))) = r.norm_grade
        AND (w.section_id IS NULL OR w.section_id != r.id);
    `);
    console.timeEnd("step1");
    console.log(`Step 1 updated ${step1.rowCount} rows.`);

    // Step 2: Regular sections name only (where not yet pointing to a valid regular section)
    console.log(
      "\n--- Step 2: Connecting regular sections (section_name match) ---",
    );
    console.time("step2");
    const step2 = await client.query(`
      UPDATE esf7_workload_rows w
      SET section_id = r.id
      FROM (
        SELECT DISTINCT ON (school_id, UPPER(TRIM(section_name)))
          id, school_id, UPPER(TRIM(section_name)) as norm_name
        FROM esf7_regular_sections
        ORDER BY school_id, UPPER(TRIM(section_name)), id
      ) r
      WHERE w.school_id = r.school_id
        AND UPPER(TRIM(w.section_name)) = r.norm_name
        AND (w.section_id IS NULL OR w.section_id != r.id)
        AND NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id);
    `);
    console.timeEnd("step2");
    console.log(`Step 2 updated ${step2.rowCount} rows.`);

    // Step 3: Regular sections split '/' name (e.g. "SATURN/ HGP" -> "SATURN")
    console.log(
      "\n--- Step 3: Connecting regular sections (split slash name) ---",
    );
    console.time("step3");
    const step3 = await client.query(`
      UPDATE esf7_workload_rows w
      SET section_id = r.id
      FROM (
        SELECT DISTINCT ON (school_id, UPPER(TRIM(section_name)))
          id, school_id, UPPER(TRIM(section_name)) as norm_name
        FROM esf7_regular_sections
        ORDER BY school_id, UPPER(TRIM(section_name)), id
      ) r
      WHERE w.school_id = r.school_id
        AND w.section_name LIKE '%/%'
        AND UPPER(TRIM(SPLIT_PART(w.section_name, '/', 1))) = r.norm_name
        AND (w.section_id IS NULL OR w.section_id != r.id)
        AND NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id);
    `);
    console.timeEnd("step3");
    console.log(`Step 3 updated ${step3.rowCount} rows.`);

    // Step 4: SNED sections
    console.log("\n--- Step 4: Connecting SNED sections ---");
    console.time("step4");
    const step4 = await client.query(`
      UPDATE esf7_workload_rows w
      SET section_id = s.id
      FROM (
        SELECT DISTINCT ON (school_id, UPPER(TRIM(section_name)))
          id, school_id, UPPER(TRIM(section_name)) as norm_name
        FROM esf7_sned_sections
        ORDER BY school_id, UPPER(TRIM(section_name)), id
      ) s
      WHERE w.school_id = s.school_id
        AND (
          UPPER(TRIM(w.section_name)) = s.norm_name
          OR (w.section_name LIKE '%/%' AND UPPER(TRIM(SPLIT_PART(w.section_name, '/', 1))) = s.norm_name)
        )
        AND (w.section_id IS NULL OR w.section_id != s.id)
        AND NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id);
    `);
    console.timeEnd("step4");
    console.log(`Step 4 updated ${step4.rowCount} rows.`);

    // Step 5: ALS sections
    console.log("\n--- Step 5: Connecting ALS sections ---");
    console.time("step5");
    const step5 = await client.query(`
      UPDATE esf7_workload_rows w
      SET section_id = a.id
      FROM (
        SELECT DISTINCT ON (school_id, UPPER(TRIM(section_name)))
          id, school_id, UPPER(TRIM(section_name)) as norm_name
        FROM esf7_als_sections
        ORDER BY school_id, UPPER(TRIM(section_name)), id
      ) a
      WHERE w.school_id = a.school_id
        AND (
          UPPER(TRIM(w.section_name)) = a.norm_name
          OR (w.section_name LIKE '%/%' AND UPPER(TRIM(SPLIT_PART(w.section_name, '/', 1))) = a.norm_name)
        )
        AND (w.section_id IS NULL OR w.section_id != a.id)
        AND NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id);
    `);
    console.timeEnd("step5");
    console.log(`Step 5 updated ${step5.rowCount} rows.`);

    // Step 6: ARAL sections
    console.log("\n--- Step 6: Connecting ARAL sections ---");
    console.time("step6");
    const step6 = await client.query(`
      UPDATE esf7_workload_rows w
      SET section_id = ar.id
      FROM (
        SELECT DISTINCT ON (school_id, UPPER(TRIM(section_name)))
          id, school_id, UPPER(TRIM(section_name)) as norm_name
        FROM esf7_aral_sections
        ORDER BY school_id, UPPER(TRIM(section_name)), id
      ) ar
      WHERE w.school_id = ar.school_id
        AND (
          UPPER(TRIM(w.section_name)) = ar.norm_name
          OR (w.section_name LIKE '%/%' AND UPPER(TRIM(SPLIT_PART(w.section_name, '/', 1))) = ar.norm_name)
        )
        AND (w.section_id IS NULL OR w.section_id != ar.id)
        AND NOT EXISTS (SELECT 1 FROM esf7_regular_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_sned_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_als_sections x WHERE x.id = w.section_id)
        AND NOT EXISTS (SELECT 1 FROM esf7_aral_sections x WHERE x.id = w.section_id);
    `);
    console.timeEnd("step6");
    console.log(`Step 6 updated ${step6.rowCount} rows.`);

    console.log("\n--- 3. Measuring after stats ---");
    const afterStats = await client.query(`
      SELECT 
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_regular_sections r ON w.section_id = r.id) as reg_connected,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_als_sections a ON w.section_id = a.id) as als_connected,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_aral_sections ar ON w.section_id = ar.id) as aral_connected,
        (SELECT count(*) FROM esf7_workload_rows w JOIN esf7_sned_sections s ON w.section_id = s.id) as sned_connected;
    `);
    console.log("After stats:", afterStats.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
