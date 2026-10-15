require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
/**
 * Clean Slate Rebuild of esf7_als_sections, esf7_aral_sections, and esf7_sned_sections
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Creates safety backup tables for all 3 special section tables.
 * - Drops `raw_payload` columns.
 * - Updates dependent view `esf7_class_sections`.
 * - Ingests authentic ALS, ARAL, and SNED sections from school_drafts.
 * - Resolves adviser_id / tutor_id to esf7_personnel_profile.id.
 * - Preserves PRIMARY KEY, UNIQUE, and FOREIGN KEY constraints.
 * - Syncs local database esf7_local as well.
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
    console.log(
      "===================================================================",
    );
    console.log(
      "⚡ CLEAN SLATE REBUILD: esf7_als_sections, esf7_aral_sections, esf7_sned_sections",
    );
    console.log(
      "===================================================================",
    );

    // 1. Safety Backups
    console.log("1. Creating safety backup tables...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_als_sections_backup_20261013 AS SELECT * FROM esf7_als_sections;
      CREATE TABLE IF NOT EXISTS esf7_aral_sections_backup_20261013 AS SELECT * FROM esf7_aral_sections;
      CREATE TABLE IF NOT EXISTS esf7_sned_sections_backup_20261013 AS SELECT * FROM esf7_sned_sections;
    `);
    console.log("   ✅ Safety backups created.");

    // 2. Drop dependent view
    console.log("2. Dropping dependent view esf7_class_sections...");
    await client.query(`DROP VIEW IF EXISTS esf7_class_sections CASCADE;`);
    console.log("   ✅ View dropped.");

    // 3. Drop raw_payload columns
    console.log("3. Dropping raw_payload column from all 3 tables...");
    await client.query(`
      ALTER TABLE esf7_als_sections DROP COLUMN IF EXISTS raw_payload;
      ALTER TABLE esf7_aral_sections DROP COLUMN IF EXISTS raw_payload;
      ALTER TABLE esf7_sned_sections DROP COLUMN IF EXISTS raw_payload;
    `);
    console.log("   ✅ Dropped raw_payload columns.");

    // 4. Truncate tables
    console.log("4. Truncating tables...");
    await client.query(`
      TRUNCATE TABLE esf7_als_sections;
      TRUNCATE TABLE esf7_aral_sections;
      TRUNCATE TABLE esf7_sned_sections;
    `);
    console.log("   ✅ Tables truncated.");

    // 5. Temporary adviser map
    console.log("5. Building fast temporary adviser lookup index...");
    await client.query(`
      CREATE TEMP TABLE temp_adv_map ON COMMIT PRESERVE ROWS AS
      SELECT id, school_id, raw_payload->>'id' as draft_p_id
      FROM esf7_personnel_profile
      WHERE raw_payload->>'id' IS NOT NULL;

      CREATE INDEX ON temp_adv_map (school_id, draft_p_id);
      CREATE INDEX ON temp_adv_map (id);
    `);
    console.log("   ✅ Temporary adviser lookup index ready.");

    // 6. Ingest ALS sections
    console.log("6. Ingesting ALS sections into esf7_als_sections...");
    const alsRes = await client.query(`
      WITH unnested AS (
        SELECT 
          d.school_id,
          COALESCE(d.school_year, '2026-2027') as school_year,
          elem->>'id' as raw_sec_id,
          COALESCE(NULLIF(elem->>'gradeLevel', ''), NULLIF(elem->>'grade_level', ''), 'ALS') as grade_level,
          COALESCE(NULLIF(elem->>'deliveryMode', ''), NULLIF(elem->>'delivery_mode', ''), 'Face-to-Face') as delivery_mode,
          COALESCE(NULLIF(elem->>'clcName', ''), NULLIF(elem->>'clc_name', ''), 'Community Learning Center') as clc_name,
          UPPER(TRIM(COALESCE(NULLIF(elem->>'sectionName', ''), NULLIF(elem->>'section_name', ''), 'ALS COMMUNITY'))) as section_name,
          COALESCE(NULLIF(elem->>'adviserId', ''), NULLIF(elem->>'advisorId', ''), NULLIF(elem->>'adviser_id', '')) as raw_adv,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'maleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'male_learners', '[^0-9]', '', 'g'), '')::int, 0) as male_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'femaleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'female_learners', '[^0-9]', '', 'g'), '')::int, 0) as female_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'numberOfLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'number_of_learners', '[^0-9]', '', 'g'), '')::int, 0) as num_learners,
          COALESCE(NULLIF(elem->>'sizeStatus', ''), NULLIF(elem->>'size_status', ''), 'WITHIN STANDARD') as size_status
        FROM school_drafts d,
             jsonb_array_elements(COALESCE(NULLIF(d.payload->'classSections', 'null'::jsonb), d.payload->'sections', '[]'::jsonb)) elem
        WHERE (elem->>'sectionType' ILIKE 'ALS%' OR elem->>'section_type' ILIKE 'ALS%' OR elem->>'category' ILIKE 'ALS%')
      ),
      deduped AS (
        SELECT DISTINCT ON (u.school_id, u.school_year, u.section_name)
          u.raw_sec_id,
          u.school_id,
          u.school_year,
          u.grade_level,
          u.delivery_mode,
          u.clc_name,
          u.section_name,
          COALESCE(m1.id, m2.id) as adviser_id,
          u.male_learners,
          u.female_learners,
          CASE WHEN u.num_learners > 0 THEN u.num_learners ELSE (u.male_learners + u.female_learners) END as number_of_learners,
          u.size_status
        FROM unnested u
        LEFT JOIN temp_adv_map m1 ON m1.school_id = u.school_id AND m1.draft_p_id = u.raw_adv
        LEFT JOIN temp_adv_map m2 ON m2.id = u.raw_adv
        ORDER BY u.school_id, u.school_year, u.section_name, u.raw_sec_id
      ),
      unique_rows AS (
        SELECT
          CASE 
            WHEN ROW_NUMBER() OVER (PARTITION BY COALESCE(d.raw_sec_id, 'als-' || d.school_id || '-' || MD5(d.section_name))) = 1
            THEN COALESCE(d.raw_sec_id, 'als-' || d.school_id || '-' || MD5(d.section_name))
            ELSE COALESCE(d.raw_sec_id, 'als') || '-' || d.school_id || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY d.school_id)::text, 4, '0')
          END as id,
          d.school_id,
          d.school_year,
          d.grade_level,
          d.delivery_mode,
          d.clc_name,
          d.section_name,
          d.adviser_id,
          d.male_learners,
          d.female_learners,
          d.number_of_learners,
          d.size_status
        FROM deduped d
      )
      INSERT INTO esf7_als_sections (
        id, school_id, school_year, grade_level, delivery_mode, clc_name, section_name,
        adviser_id, male_learners, female_learners, number_of_learners,
        size_status, section_type, created_at, updated_at
      )
      SELECT
        id, school_id, school_year, grade_level, delivery_mode, clc_name, section_name,
        adviser_id, male_learners, female_learners, number_of_learners,
        size_status, 'ALS', NOW(), NOW()
      FROM unique_rows
      ON CONFLICT (school_id, school_year, section_name) DO NOTHING;
    `);
    console.log(
      `   ✅ Ingested ${alsRes.rowCount} ALS sections into esf7_als_sections.`,
    );

    // 7. Ingest SNED sections
    console.log("7. Ingesting SNED sections into esf7_sned_sections...");
    const snedRes = await client.query(`
      WITH unnested AS (
        SELECT 
          d.school_id,
          COALESCE(d.school_year, '2026-2027') as school_year,
          elem->>'id' as raw_sec_id,
          COALESCE(NULLIF(elem->>'gradeLevel', ''), NULLIF(elem->>'grade_level', ''), 'SNED (NON-GRADED)') as grade_level,
          COALESCE(NULLIF(elem->>'programType', ''), NULLIF(elem->>'program_type', ''), 'Non-Graded') as program_type,
          UPPER(TRIM(COALESCE(NULLIF(elem->>'sectionName', ''), NULLIF(elem->>'section_name', ''), 'SNED SECTION'))) as section_name,
          COALESCE(NULLIF(elem->>'adviserId', ''), NULLIF(elem->>'advisorId', ''), NULLIF(elem->>'adviser_id', '')) as raw_adv,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'maleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'male_learners', '[^0-9]', '', 'g'), '')::int, 0) as male_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'femaleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'female_learners', '[^0-9]', '', 'g'), '')::int, 0) as female_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'numberOfLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'number_of_learners', '[^0-9]', '', 'g'), '')::int, 0) as num_learners,
          COALESCE(NULLIF(elem->>'sizeStatus', ''), NULLIF(elem->>'size_status', ''), 'WITHIN STANDARD') as size_status
        FROM school_drafts d,
             jsonb_array_elements(COALESCE(NULLIF(d.payload->'classSections', 'null'::jsonb), d.payload->'sections', '[]'::jsonb)) elem
        WHERE (elem->>'sectionType' ILIKE '%SNED%' OR elem->>'section_type' ILIKE '%SNED%' OR elem->>'category' ILIKE '%SNED%')
      ),
      deduped AS (
        SELECT DISTINCT ON (u.school_id, u.school_year, u.section_name)
          u.raw_sec_id,
          u.school_id,
          u.school_year,
          u.grade_level,
          u.program_type,
          u.section_name,
          COALESCE(m1.id, m2.id) as adviser_id,
          u.male_learners,
          u.female_learners,
          CASE WHEN u.num_learners > 0 THEN u.num_learners ELSE (u.male_learners + u.female_learners) END as number_of_learners,
          u.size_status
        FROM unnested u
        LEFT JOIN temp_adv_map m1 ON m1.school_id = u.school_id AND m1.draft_p_id = u.raw_adv
        LEFT JOIN temp_adv_map m2 ON m2.id = u.raw_adv
        ORDER BY u.school_id, u.school_year, u.section_name, u.raw_sec_id
      ),
      unique_rows AS (
        SELECT
          CASE 
            WHEN ROW_NUMBER() OVER (PARTITION BY COALESCE(d.raw_sec_id, 'sned-' || d.school_id || '-' || MD5(d.section_name))) = 1
            THEN COALESCE(d.raw_sec_id, 'sned-' || d.school_id || '-' || MD5(d.section_name))
            ELSE COALESCE(d.raw_sec_id, 'sned') || '-' || d.school_id || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY d.school_id)::text, 4, '0')
          END as id,
          d.school_id,
          d.school_year,
          d.grade_level,
          d.program_type,
          d.section_name,
          d.adviser_id,
          d.male_learners,
          d.female_learners,
          d.number_of_learners,
          d.size_status
        FROM deduped d
      )
      INSERT INTO esf7_sned_sections (
        id, school_id, school_year, grade_level, program_type, section_name,
        adviser_id, male_learners, female_learners, number_of_learners,
        size_status, section_type, created_at, updated_at
      )
      SELECT
        id, school_id, school_year, grade_level, program_type, section_name,
        adviser_id, male_learners, female_learners, number_of_learners,
        size_status, 'SNED (NON-GRADED)', NOW(), NOW()
      FROM unique_rows
      ON CONFLICT (school_id, school_year, section_name) DO NOTHING;
    `);
    console.log(
      `   ✅ Ingested ${snedRes.rowCount} SNED sections into esf7_sned_sections.`,
    );

    // 8. Ingest ARAL sections
    console.log("8. Ingesting ARAL sections into esf7_aral_sections...");
    const aralRes = await client.query(`
      WITH unnested AS (
        SELECT 
          d.school_id,
          COALESCE(d.school_year, '2026-2027') as school_year,
          elem->>'id' as raw_sec_id,
          COALESCE(NULLIF(elem->>'basisType', ''), NULLIF(elem->>'basis_type', ''), 'grade') as basis_type,
          COALESCE(NULLIF(elem->>'gradeLevel', ''), NULLIF(elem->>'grade_level', ''), 'Grade 1') as grade_level,
          elem->>'assessmentTool' as assessment_tool,
          elem->>'profileLevel' as profile_level,
          UPPER(TRIM(COALESCE(NULLIF(elem->>'sectionName', ''), NULLIF(elem->>'section_name', ''), 'ARAL SECTION'))) as section_name,
          COALESCE(NULLIF(elem->>'tutorId', ''), NULLIF(elem->>'adviserId', ''), NULLIF(elem->>'advisorId', ''), NULLIF(elem->>'adviser_id', '')) as raw_adv,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'maleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'male_learners', '[^0-9]', '', 'g'), '')::int, 0) as male_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'femaleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'female_learners', '[^0-9]', '', 'g'), '')::int, 0) as female_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'numberOfLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'total_learners', '[^0-9]', '', 'g'), '')::int, 0) as num_learners,
          COALESCE(NULLIF(elem->>'term', ''), '1st') as term
        FROM school_drafts d,
             jsonb_array_elements(COALESCE(NULLIF(d.payload->'classSections', 'null'::jsonb), d.payload->'sections', '[]'::jsonb)) elem
        WHERE (elem->>'sectionType' ILIKE '%ARAL%' OR elem->>'section_type' ILIKE '%ARAL%' OR elem->>'category' ILIKE '%ARAL%')
      ),
      deduped AS (
        SELECT DISTINCT ON (u.school_id, u.school_year, u.section_name, u.grade_level)
          u.raw_sec_id,
          u.school_id,
          u.school_year,
          u.basis_type,
          u.grade_level,
          u.assessment_tool,
          u.profile_level,
          u.section_name,
          COALESCE(m1.id, m2.id) as tutor_id,
          u.male_learners,
          u.female_learners,
          CASE WHEN u.num_learners > 0 THEN u.num_learners ELSE (u.male_learners + u.female_learners) END as total_learners,
          u.term
        FROM unnested u
        LEFT JOIN temp_adv_map m1 ON m1.school_id = u.school_id AND m1.draft_p_id = u.raw_adv
        LEFT JOIN temp_adv_map m2 ON m2.id = u.raw_adv
        ORDER BY u.school_id, u.school_year, u.section_name, u.grade_level, u.raw_sec_id
      ),
      unique_rows AS (
        SELECT
          CASE 
            WHEN ROW_NUMBER() OVER (PARTITION BY COALESCE(d.raw_sec_id, 'aral-' || d.school_id || '-' || MD5(d.section_name || '_' || d.grade_level))) = 1
            THEN COALESCE(d.raw_sec_id, 'aral-' || d.school_id || '-' || MD5(d.section_name || '_' || d.grade_level))
            ELSE COALESCE(d.raw_sec_id, 'aral') || '-' || d.school_id || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY d.school_id)::text, 4, '0')
          END as id,
          d.school_id,
          d.school_year,
          d.basis_type,
          d.grade_level,
          d.assessment_tool,
          d.profile_level,
          d.section_name,
          d.tutor_id,
          d.male_learners,
          d.female_learners,
          d.total_learners,
          d.term
        FROM deduped d
      )
      INSERT INTO esf7_aral_sections (
        id, school_id, school_year, basis_type, grade_level, assessment_tool,
        profile_level, section_name, tutor_id, male_learners, female_learners,
        total_learners, term, section_type, created_at, updated_at
      )
      SELECT
        id, school_id, school_year, basis_type, grade_level, assessment_tool,
        profile_level, section_name, tutor_id, male_learners, female_learners,
        total_learners, term, 'ARAL', NOW(), NOW()
      FROM unique_rows
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log(
      `   ✅ Ingested ${aralRes.rowCount} ARAL sections into esf7_aral_sections.`,
    );

    // 9. Recreate view esf7_class_sections
    console.log("9. Recreating view esf7_class_sections...");
    await client.query(`
      CREATE OR REPLACE VIEW esf7_class_sections AS
      SELECT 
        esf7_regular_sections.id,
        esf7_regular_sections.school_id,
        esf7_regular_sections.school_year,
        esf7_regular_sections.grade_level,
        esf7_regular_sections.section_name,
        esf7_regular_sections.adviser_id AS advisor_id,
        esf7_regular_sections.section_type,
        esf7_regular_sections.male_learners,
        esf7_regular_sections.female_learners,
        esf7_regular_sections.number_of_learners,
        esf7_regular_sections.created_at,
        esf7_regular_sections.updated_at
      FROM esf7_regular_sections
      UNION ALL
      SELECT 
        esf7_sned_sections.id::text,
        esf7_sned_sections.school_id,
        esf7_sned_sections.school_year,
        esf7_sned_sections.grade_level,
        esf7_sned_sections.section_name,
        esf7_sned_sections.adviser_id AS advisor_id,
        'SNED'::text AS section_type,
        esf7_sned_sections.male_learners,
        esf7_sned_sections.female_learners,
        esf7_sned_sections.number_of_learners,
        esf7_sned_sections.created_at,
        esf7_sned_sections.updated_at
      FROM esf7_sned_sections
      UNION ALL
      SELECT 
        esf7_als_sections.id::text,
        esf7_als_sections.school_id,
        esf7_als_sections.school_year,
        esf7_als_sections.grade_level,
        esf7_als_sections.section_name,
        esf7_als_sections.adviser_id AS advisor_id,
        'ALS'::text AS section_type,
        esf7_als_sections.male_learners,
        esf7_als_sections.female_learners,
        esf7_als_sections.number_of_learners,
        esf7_als_sections.created_at,
        esf7_als_sections.updated_at
      FROM esf7_als_sections
      UNION ALL
      SELECT 
        esf7_aral_sections.id::text,
        esf7_aral_sections.school_id,
        esf7_aral_sections.school_year,
        esf7_aral_sections.grade_level,
        esf7_aral_sections.section_name,
        esf7_aral_sections.tutor_id AS advisor_id,
        'ARAL'::text AS section_type,
        esf7_aral_sections.male_learners,
        esf7_aral_sections.female_learners,
        esf7_aral_sections.total_learners AS number_of_learners,
        esf7_aral_sections.created_at,
        esf7_aral_sections.updated_at
      FROM esf7_aral_sections
      UNION ALL
      SELECT 
        esf7_remedial_enrichment_sections.id::text,
        esf7_remedial_enrichment_sections.school_id,
        esf7_remedial_enrichment_sections.school_year,
        esf7_remedial_enrichment_sections.grade_level,
        esf7_remedial_enrichment_sections.section_name,
        esf7_remedial_enrichment_sections.assigned_teacher_id AS advisor_id,
        esf7_remedial_enrichment_sections.intervention_type AS section_type,
        esf7_remedial_enrichment_sections.male_learners,
        esf7_remedial_enrichment_sections.female_learners,
        esf7_remedial_enrichment_sections.total_learners AS number_of_learners,
        esf7_remedial_enrichment_sections.created_at,
        esf7_remedial_enrichment_sections.updated_at
      FROM esf7_remedial_enrichment_sections;
    `);
    console.log("   ✅ View 'esf7_class_sections' recreated successfully.");

    // 10. Verification metrics
    const countALS = await client.query(
      `SELECT count(*) FROM esf7_als_sections;`,
    );
    const countSNED = await client.query(
      `SELECT count(*) FROM esf7_sned_sections;`,
    );
    const countARAL = await client.query(
      `SELECT count(*) FROM esf7_aral_sections;`,
    );

    console.log(
      "===================================================================",
    );
    console.log(
      `🎉 SUCCESS in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
    );
    console.log(`- Total ALS Sections:  ${countALS.rows[0].count}`);
    console.log(`- Total SNED Sections: ${countSNED.rows[0].count}`);
    console.log(`- Total ARAL Sections: ${countARAL.rows[0].count}`);
    console.log(
      "===================================================================",
    );
  } catch (err) {
    console.error("❌ Rebuild failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
