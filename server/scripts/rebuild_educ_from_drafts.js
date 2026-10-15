/**
 * Clean Slate Rebuild of esf7_perssonel_educ from authentic personnel profiles
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Drops `raw_payload` column as requested by user.
 * - Primary Key `id` matches `personnel_id` 1:1 (Sequential '1' to 'N').
 * - Preserves all typed educational columns:
 *   - highest_educational_attainment
 *   - college_degree & college_degrees (JSONB)
 *   - major & minor
 *   - post_graduate_degree & post_graduate_discipline (JSONB)
 *   - eligibility (JSONB)
 *   - prc_specialization, shs_track, vocational_course, vocational_level
 */

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
  connectionTimeoutMillis: 10000,
});

async function main() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log("==========================================================");
    console.log("⚡ CLEAN SLATE REBUILD: esf7_perssonel_educ");
    console.log("==========================================================");

    // 1. Create safety backup
    console.log("\n[Step 1/5] Creating safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_perssonel_educ_backup_20261013 AS
      SELECT * FROM esf7_perssonel_educ;
    `);
    const backupCount = await client.query(
      "SELECT count(*) FROM esf7_perssonel_educ_backup_20261013",
    );
    console.log(
      `  ✓ Safety backup ready with ${backupCount.rows[0].count} rows.`,
    );

    // 2. Drop raw_payload column
    console.log(
      "\n[Step 2/5] Dropping raw_payload column from esf7_perssonel_educ...",
    );
    await client.query(
      "ALTER TABLE esf7_perssonel_educ DROP COLUMN IF EXISTS raw_payload;",
    );
    console.log("  ✓ raw_payload column dropped.");

    // 3. Truncate table
    console.log("\n[Step 3/5] Truncating esf7_perssonel_educ...");
    await client.query("TRUNCATE TABLE esf7_perssonel_educ;");
    console.log("  ✓ Table cleanly truncated.");

    // 4. Ingest standardized records (Option B: id = personnel_id)
    console.log(
      "\n[Step 4/5] Ingesting 351,762 standardized education records (id = personnel_id)...",
    );
    const tInsert = Date.now();

    const insertRes = await client.query(`
      INSERT INTO esf7_perssonel_educ (
        id,
        personnel_id,
        highest_educational_attainment,
        college_degree,
        college_degrees,
        major,
        minor,
        post_graduate_degree,
        post_graduate_discipline,
        eligibility,
        prc_specialization,
        shs_track,
        vocational_course,
        vocational_level,
        created_at,
        updated_at
      )
      SELECT 
        p.id as id,
        p.id as personnel_id,
        COALESCE(
          NULLIF(TRIM(UPPER(COALESCE(
            p.raw_payload->>'highest_educational_attainment',
            p.raw_payload->>'highestEducationalAttainment',
            ''
          ))), ''),
          'COLLEGE GRADUATE / BACCALAUREATE'
        ) as highest_educational_attainment,
        NULLIF(TRIM(UPPER(COALESCE(
          p.raw_payload->>'degree',
          p.raw_payload->>'college_degree',
          p.raw_payload->>'collegeDegree',
          p.raw_payload->>'degree_finished__baccalaureate',
          ''
        ))), '') as college_degree,
        CASE 
          WHEN jsonb_typeof(p.raw_payload->'college_degrees') = 'array' THEN p.raw_payload->'college_degrees'
          WHEN jsonb_typeof(p.raw_payload->'collegeDegrees') = 'array' THEN p.raw_payload->'collegeDegrees'
          WHEN p.raw_payload->>'degree' IS NOT NULL OR p.raw_payload->>'college_degree' IS NOT NULL THEN
            jsonb_build_array(jsonb_build_object(
              'collegeDegree', COALESCE(p.raw_payload->>'degree', p.raw_payload->>'college_degree', ''),
              'major', COALESCE(p.raw_payload->>'major', ''),
              'minor', COALESCE(p.raw_payload->>'minor', 'N/A')
            ))
          ELSE '[]'::jsonb
        END as college_degrees,
        NULLIF(TRIM(UPPER(COALESCE(
          p.raw_payload->>'major',
          p.raw_payload->>'major__specialization',
          ''
        ))), '') as major,
        NULLIF(TRIM(UPPER(p.raw_payload->>'minor')), '') as minor,
        COALESCE(
          NULLIF(TRIM(UPPER(COALESCE(
            p.raw_payload->>'post_graduate_degree',
            p.raw_payload->>'postGraduateDegree',
            p.raw_payload->>'post_graduate__degree',
            ''
          ))), ''),
          'N/A'
        ) as post_graduate_degree,
        CASE 
          WHEN jsonb_typeof(p.raw_payload->'post_graduate_discipline') = 'object' THEN p.raw_payload->'post_graduate_discipline'
          WHEN jsonb_typeof(p.raw_payload->'postGraduateDiscipline') = 'object' THEN p.raw_payload->'postGraduateDiscipline'
          WHEN jsonb_typeof(p.raw_payload->'post_graduate_discipline') = 'string' THEN 
            (CASE WHEN p.raw_payload->>'post_graduate_discipline' ~ '^\\{.*\\}$' 
              THEN (p.raw_payload->>'post_graduate_discipline')::jsonb 
              ELSE '{}'::jsonb END)
          ELSE '{}'::jsonb
        END as post_graduate_discipline,
        CASE 
          WHEN jsonb_typeof(p.raw_payload->'eligibility') = 'array' THEN p.raw_payload->'eligibility'
          WHEN p.raw_payload->>'eligibility' IS NOT NULL AND p.raw_payload->>'eligibility' <> '' THEN
            jsonb_build_array(p.raw_payload->>'eligibility')
          ELSE '[]'::jsonb
        END as eligibility,
        NULLIF(TRIM(UPPER(COALESCE(
          p.raw_payload->>'prc_specialization',
          p.raw_payload->>'prcSpecialization',
          ''
        ))), '') as prc_specialization,
        NULLIF(TRIM(UPPER(COALESCE(
          p.raw_payload->>'shs_track',
          p.raw_payload->>'shsTrack',
          ''
        ))), '') as shs_track,
        NULLIF(TRIM(UPPER(COALESCE(
          p.raw_payload->>'vocational_course',
          p.raw_payload->>'vocationalCourse',
          ''
        ))), '') as vocational_course,
        NULLIF(TRIM(UPPER(COALESCE(
          p.raw_payload->>'vocational_level',
          p.raw_payload->>'vocationalLevel',
          ''
        ))), '') as vocational_level,
        NOW(),
        NOW()
      FROM esf7_personnel_profile p;
    `);

    console.log(
      `  ✓ Inserted ${insertRes.rowCount} rows in ${((Date.now() - tInsert) / 1000).toFixed(1)}s!`,
    );

    // 5. Verification
    console.log("\n[Step 5/5] Verifying table integrity and sample records...");
    const countRes = await client.query(
      "SELECT count(*) FROM esf7_perssonel_educ",
    );
    const minMaxRes = await client.query(
      "SELECT min(id::bigint) as min_id, max(id::bigint) as max_id FROM esf7_perssonel_educ",
    );

    // Check raw_payload is gone
    const rawColCheck = await client.query(`
      SELECT count(*) 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_perssonel_educ' AND column_name = 'raw_payload';
    `);

    // Check 1:1 match with profile
    const matchCheck = await client.query(`
      SELECT count(*) as mismatched
      FROM esf7_perssonel_educ e
      FULL OUTER JOIN esf7_personnel_profile p ON e.personnel_id = p.id
      WHERE e.id IS NULL OR p.id IS NULL OR e.id <> e.personnel_id;
    `);

    const first5 = await client.query(`
      SELECT id, personnel_id, highest_educational_attainment, college_degree, major, post_graduate_degree
      FROM esf7_perssonel_educ
      ORDER BY id::bigint ASC
      LIMIT 5;
    `);

    const last5 = await client.query(`
      SELECT id, personnel_id, highest_educational_attainment, college_degree, major, post_graduate_degree
      FROM esf7_perssonel_educ
      ORDER BY id::bigint DESC
      LIMIT 5;
    `);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n==========================================================");
    console.log(`🎉 REBUILD COMPLETE IN ${totalDuration}s!`);
    console.log(`✓ Total Education Records: ${countRes.rows[0].count}`);
    console.log(
      `✓ ID Range: ${minMaxRes.rows[0].min_id} to ${minMaxRes.rows[0].max_id}`,
    );
    console.log(
      `✓ raw_payload column dropped: ${rawColCheck.rows[0].count === "0" ? "YES" : "NO"}`,
    );
    console.log(
      `✓ Mismatched / Orphaned records: ${matchCheck.rows[0].mismatched}`,
    );
    console.log("==========================================================");

    console.log("\nFirst 5 records:");
    console.table(first5.rows);

    console.log("\nLast 5 records:");
    console.table(last5.rows);
  } catch (err) {
    console.error("FATAL ERROR DURING EDUCATION REBUILD:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
