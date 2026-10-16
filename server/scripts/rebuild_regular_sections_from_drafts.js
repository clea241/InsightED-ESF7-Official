require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
/**
 * Clean Slate Rebuild of esf7_regular_sections from authentic school_drafts
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Creates safety backup table `esf7_regular_sections_backup_20261013`.
 * - Drops `raw_payload` column as requested by user.
 * - Updates dependent view `esf7_class_sections`.
 * - Extracts authentic classSections from school_drafts (~175,000 sections).
 * - Resolves adviser_id to esf7_personnel_profile.id (or NULL if unassigned).
 * - Preserves PRIMARY KEY, UNIQUE(school_id, school_year, grade_level, section_name), and FOREIGN KEY constraints.
 * - Creates convenience alias view `esf7_regualar_sections` for typo tolerance.
 */

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
  connectionTimeoutMillis: 10000,
});

async function main() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log("==========================================================");
    console.log("⚡ CLEAN SLATE REBUILD: esf7_regular_sections");
    console.log("==========================================================");

    // 1. Safety Backup
    console.log("1. Creating safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_regular_sections_backup_20261013 AS 
      SELECT * FROM esf7_regular_sections;
    `);
    console.log("   ✅ Safety backup ensured.");

    // 2. Drop dependent view temporarily
    console.log("2. Handling dependent views...");
    await client.query(`DROP VIEW IF EXISTS esf7_class_sections CASCADE;`);
    console.log("   ✅ Dependent view esf7_class_sections dropped.");

    // 3. Drop raw_payload column
    console.log("3. Dropping raw_payload column...");
    await client.query(`
      ALTER TABLE esf7_regular_sections DROP COLUMN IF EXISTS raw_payload;
    `);
    console.log("   ✅ Dropped raw_payload column.");

    // 4. Truncate table
    console.log("4. Truncating esf7_regular_sections...");
    await client.query(`TRUNCATE TABLE esf7_regular_sections;`);
    console.log("   ✅ Table truncated.");

    // 5. Build temporary adviser lookup map
    console.log("5. Building fast in-memory temporary adviser lookup index...");
    await client.query(`
      CREATE TEMP TABLE temp_adviser_map ON COMMIT PRESERVE ROWS AS
      SELECT id, school_id, raw_payload->>'id' as draft_p_id
      FROM esf7_personnel_profile
      WHERE raw_payload->>'id' IS NOT NULL;

      CREATE INDEX ON temp_adviser_map (school_id, draft_p_id);
      CREATE INDEX ON temp_adviser_map (id);
    `);
    console.log("   ✅ Temporary adviser lookup index ready.");

    // 6. Ingest regular sections from school_drafts
    console.log("6. Ingesting authentic sections from school_drafts...");
    const insertResult = await client.query(`
      WITH unnested AS (
        SELECT 
          d.school_id,
          COALESCE(d.school_year, '2026-2027') as school_year,
          elem->>'id' as raw_sec_id,
          COALESCE(NULLIF(elem->>'gradeLevel', ''), NULLIF(elem->>'grade_level', ''), 'Grade 7') as grade_level,
          UPPER(TRIM(COALESCE(NULLIF(elem->>'sectionName', ''), NULLIF(elem->>'section_name', ''), 'A'))) as section_name,
          COALESCE(NULLIF(elem->>'sectionType', ''), NULLIF(elem->>'section_type', ''), 'MONO GRADE') as section_type,
          COALESCE(NULLIF(elem->>'adviserId', ''), NULLIF(elem->>'advisorId', ''), NULLIF(elem->>'adviser_id', '')) as raw_adv,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'maleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'male_learners', '[^0-9]', '', 'g'), '')::int, 0) as male_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'femaleLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'female_learners', '[^0-9]', '', 'g'), '')::int, 0) as female_learners,
          COALESCE(NULLIF(REGEXP_REPLACE(elem->>'numberOfLearners', '[^0-9]', '', 'g'), '')::int, NULLIF(REGEXP_REPLACE(elem->>'number_of_learners', '[^0-9]', '', 'g'), '')::int, 0) as num_learners,
          COALESCE(NULLIF(elem->>'sizeStatus', ''), NULLIF(elem->>'size_status', ''), 'WITHIN STANDARD') as size_status,
          COALESCE(NULLIF(elem->>'term', ''), '1st') as term
        FROM school_drafts d,
             jsonb_array_elements(COALESCE(NULLIF(d.payload->'classSections', 'null'::jsonb), d.payload->'sections', '[]'::jsonb)) elem
        WHERE elem IS NOT NULL
      ),
      deduped_by_section AS (
        SELECT DISTINCT ON (u.school_id, u.school_year, u.grade_level, u.section_name)
          u.raw_sec_id,
          u.school_id,
          u.school_year,
          u.grade_level,
          u.section_name,
          u.section_type,
          COALESCE(m1.id, m2.id) as adviser_id,
          u.male_learners,
          u.female_learners,
          CASE WHEN u.num_learners > 0 THEN u.num_learners ELSE (u.male_learners + u.female_learners) END as number_of_learners,
          u.size_status,
          u.term
        FROM unnested u
        LEFT JOIN temp_adviser_map m1 
          ON m1.school_id = u.school_id AND m1.draft_p_id = u.raw_adv
        LEFT JOIN temp_adviser_map m2 
          ON m2.id = u.raw_adv
        ORDER BY u.school_id, u.school_year, u.grade_level, u.section_name, u.raw_sec_id
      ),
      unique_ids AS (
        SELECT
          CASE 
            WHEN ROW_NUMBER() OVER (PARTITION BY COALESCE(d.raw_sec_id, 'sec-' || d.school_id || '-' || MD5(d.grade_level || '_' || d.section_name))) = 1
            THEN COALESCE(d.raw_sec_id, 'sec-' || d.school_id || '-' || MD5(d.grade_level || '_' || d.section_name))
            ELSE COALESCE(d.raw_sec_id, 'sec') || '-' || d.school_id || '-' || LPAD(ROW_NUMBER() OVER (PARTITION BY d.school_id)::text, 4, '0')
          END as id,
          d.school_id,
          d.school_year,
          d.grade_level,
          d.section_name,
          d.section_type,
          d.adviser_id,
          d.male_learners,
          d.female_learners,
          d.number_of_learners,
          d.size_status,
          d.term
        FROM deduped_by_section d
      )
      INSERT INTO esf7_regular_sections (
        id,
        school_id,
        school_year,
        grade_level,
        section_name,
        section_type,
        adviser_id,
        male_learners,
        female_learners,
        number_of_learners,
        size_status,
        term,
        created_at,
        updated_at
      )
      SELECT
        u.id,
        u.school_id,
        u.school_year,
        u.grade_level,
        u.section_name,
        u.section_type,
        u.adviser_id,
        u.male_learners,
        u.female_learners,
        u.number_of_learners,
        u.size_status,
        u.term,
        NOW(),
        NOW()
      FROM unique_ids u
      ON CONFLICT (school_id, school_year, grade_level, section_name) DO NOTHING;
    `);
    console.log(
      `   ✅ Ingested ${insertResult.rowCount} authentic sections into esf7_regular_sections.`,
    );

    // 7. Recreate view esf7_class_sections
    console.log("7. Recreating view 'esf7_class_sections'...");
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
        esf7_sned_sections.id,
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
        esf7_als_sections.id,
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
        esf7_aral_sections.id,
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
        esf7_remedial_enrichment_sections.id,
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

    // 8. Create convenience alias view for typo tolerance
    console.log("8. Creating alias view 'esf7_regualar_sections'...");
    await client.query(`
      CREATE OR REPLACE VIEW esf7_regualar_sections AS 
      SELECT * FROM esf7_regular_sections;
    `);
    console.log("   ✅ View 'esf7_regualar_sections' created.");

    // 9. Verification metrics
    const totalCount = await client.query(
      `SELECT count(*) FROM esf7_regular_sections;`,
    );
    const adviserCount = await client.query(
      `SELECT count(*) FROM esf7_regular_sections WHERE adviser_id IS NOT NULL;`,
    );
    const schoolCount = await client.query(
      `SELECT count(DISTINCT school_id) FROM esf7_regular_sections;`,
    );
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'esf7_regular_sections' 
      ORDER BY ordinal_position;
    `);
    const sample = await client.query(`
      SELECT id, school_id, grade_level, section_name, section_type, adviser_id, number_of_learners, size_status 
      FROM esf7_regular_sections 
      WHERE adviser_id IS NOT NULL 
      LIMIT 2;
    `);

    console.log("==========================================================");
    console.log(
      `🎉 SUCCESS in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
    );
    console.log(`- Total Sections: ${totalCount.rows[0].count}`);
    console.log(`- Schools Covered: ${schoolCount.rows[0].count}`);
    console.log(
      `- Sections with Assigned Advisers: ${adviserCount.rows[0].count}`,
    );
    console.log(
      `- Columns Present: ${cols.rows.map((r) => r.column_name).join(", ")}`,
    );
    console.log(`- Sample Sections:\n`, JSON.stringify(sample.rows, null, 2));
    console.log("==========================================================");
  } catch (err) {
    console.error("❌ Rebuild failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
