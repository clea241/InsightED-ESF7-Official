require("../db/directPort");
const { Pool } = require("pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 30000,
});

async function plotPersonnelEducation() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log("🚀 PLOTTING PERSONNEL EDUCATION TO esf7_personnel_educ");
    console.log("   Sources: school_drafts & esf7_room_roster_cache");
    console.log(
      "   Target Table: esf7_perssonel_educ / View: esf7_personnel_educ (insighted_esf7)",
    );
    console.log(
      "   Safety Policy: ADDITIVE / ENRICHMENT ONLY - ZERO DELETIONS",
    );
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    console.log("\n[Step 1/6] Pre-execution stats in esf7_perssonel_educ...");
    const preCountRes = await client.query(
      "SELECT count(*) FROM esf7_perssonel_educ;",
    );
    const preTotal = parseInt(preCountRes.rows[0].count, 10);
    console.log(
      `   - Total personnel education records: ${preTotal.toLocaleString()}`,
    );

    const preStatsRes = await client.query(`
      SELECT 
        count(CASE WHEN college_degree IS NOT NULL AND TRIM(college_degree) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_college,
        count(CASE WHEN major IS NOT NULL AND TRIM(major) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_major,
        count(CASE WHEN minor IS NOT NULL AND TRIM(minor) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_minor,
        count(CASE WHEN post_graduate_degree IS NOT NULL AND TRIM(post_graduate_degree) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_pg,
        count(CASE WHEN prc_specialization IS NOT NULL AND TRIM(prc_specialization) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_prc,
        count(CASE WHEN eligibility IS NOT NULL AND eligibility <> '[]'::jsonb AND eligibility <> '["NONE"]'::jsonb AND eligibility <> '["N/A"]'::jsonb THEN 1 END) as with_elig,
        count(CASE WHEN college_degrees IS NOT NULL AND college_degrees <> '[]'::jsonb THEN 1 END) as with_degrees
      FROM esf7_perssonel_educ;
    `);
    const pre = preStatsRes.rows[0];
    console.log(
      `   - Valid college_degree:    ${parseInt(pre.with_college, 10).toLocaleString()}`,
    );
    console.log(
      `   - Valid major:             ${parseInt(pre.with_major, 10).toLocaleString()}`,
    );
    console.log(
      `   - Valid minor:             ${parseInt(pre.with_minor, 10).toLocaleString()}`,
    );
    console.log(
      `   - Valid post_grad_degree:  ${parseInt(pre.with_pg, 10).toLocaleString()}`,
    );
    console.log(
      `   - Valid prc_spec:          ${parseInt(pre.with_prc, 10).toLocaleString()}`,
    );
    console.log(
      `   - Valid eligibility:       ${parseInt(pre.with_elig, 10).toLocaleString()}`,
    );
    console.log(
      `   - Valid college_degrees:   ${parseInt(pre.with_degrees, 10).toLocaleString()}`,
    );

    // Step 2: Dedicated safety backup table
    console.log(
      "\n[Step 2/6] Creating dedicated safety backup table 'esf7_perssonel_educ_backup_educ'...",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_perssonel_educ_backup_educ AS
      SELECT * FROM esf7_perssonel_educ;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_perssonel_educ_backup_educ;",
    );
    const backupCount = parseInt(backupRes.rows[0].count, 10);
    console.log(
      `   ✓ Backup verified: ${backupCount.toLocaleString()} rows preserved in 'esf7_perssonel_educ_backup_educ'.`,
    );

    // Step 3: Pass 1 - Process school_drafts
    console.log(
      "\n[Step 3/6] PASS 1: Extracting & enriching education from school_drafts...",
    );
    const draftKeysRes = await client.query(`
      SELECT school_id, school_year 
      FROM school_drafts 
      WHERE payload->'personnel' IS NOT NULL
      ORDER BY school_id;
    `);
    const allDrafts = draftKeysRes.rows;
    const totalDrafts = allDrafts.length;
    console.log(
      `   ✓ Found ${totalDrafts.toLocaleString()} drafts to inspect.`,
    );

    const DRAFT_BATCH_SIZE = 1000;
    const totalDraftBatches = Math.ceil(totalDrafts / DRAFT_BATCH_SIZE);
    let totalUpdatedFromDrafts = 0;

    for (let i = 0; i < totalDrafts; i += DRAFT_BATCH_SIZE) {
      const batchNum = Math.floor(i / DRAFT_BATCH_SIZE) + 1;
      const batchKeys = allDrafts.slice(i, i + DRAFT_BATCH_SIZE);
      const schoolIds = batchKeys.map((k) => k.school_id);
      const schoolYears = batchKeys.map((k) => k.school_year);
      const tBatch = Date.now();

      const updateBatch = await client.query(
        `
        WITH batch_drafts AS (
          SELECT d.school_id, d.school_year, d.payload
          FROM school_drafts d
          JOIN UNNEST($1::varchar[], $2::varchar[]) AS k(s_id, sy) 
            ON d.school_id = k.s_id AND d.school_year = k.sy
        ),
        extracted_raw AS (
          SELECT 
            REPLACE(d.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            
            NULLIF(TRIM(COALESCE(p->>'collegeDegree', p->>'college_degree')), '') as college_degree,
            NULLIF(TRIM(COALESCE(p->>'major', p->>'majorSpecialization', p->>'major_specialization')), '') as major,
            NULLIF(TRIM(p->>'minor'), '') as minor,
            NULLIF(TRIM(COALESCE(p->>'postGraduateDegree', p->>'post_graduate_degree', p->>'postGraduate')), '') as post_grad,
            NULLIF(TRIM(COALESCE(p->>'prcSpecialization', p->>'prc_specialization')), '') as prc_spec,
            NULLIF(TRIM(COALESCE(p->>'highestEducationalAttainment', p->>'highest_educational_attainment')), '') as hea,
            NULLIF(TRIM(COALESCE(p->>'vocationalCourse', p->>'vocational_course')), '') as voc_course,
            NULLIF(TRIM(COALESCE(p->>'vocationalLevel', p->>'vocational_level')), '') as voc_level,
            NULLIF(TRIM(COALESCE(p->>'shsTrack', p->>'shs_track')), '') as shs_track,
            
            CASE 
              WHEN jsonb_typeof(p->'eligibility') = 'array' AND jsonb_array_length(p->'eligibility') > 0 THEN p->'eligibility'
              WHEN p->>'eligibility' IS NOT NULL AND TRIM(p->>'eligibility') NOT IN ('', '[]', 'null', 'NONE', 'N/A') 
                THEN to_jsonb(string_to_array(p->>'eligibility', ','))
              ELSE NULL
            END as elig,
            
            CASE 
              WHEN jsonb_typeof(p->'degreeRows') = 'array' AND jsonb_array_length(p->'degreeRows') > 0 THEN p->'degreeRows'
              WHEN jsonb_typeof(p->'college_degrees') = 'array' AND jsonb_array_length(p->'college_degrees') > 0 THEN p->'college_degrees'
              ELSE NULL
            END as degrees,
            
            CASE 
              WHEN jsonb_typeof(p->'postGraduateDiscipline') = 'object' AND p->'postGraduateDiscipline' <> '{}'::jsonb THEN p->'postGraduateDiscipline'
              WHEN jsonb_typeof(p->'post_graduate_discipline') = 'object' AND p->'post_graduate_discipline' <> '{}'::jsonb THEN p->'post_graduate_discipline'
              ELSE NULL
            END as pg_discipline
            
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel' ELSE '[]'::jsonb END
          ) p
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.*,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          SELECT 
            p.id as personnel_id,
            x.*,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn

          UNION ALL

          SELECT 
            p.id as personnel_id,
            x.*,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped AS (
          SELECT DISTINCT ON (personnel_id)
            personnel_id, college_degree, major, minor, post_grad, prc_spec, hea, voc_course, voc_level, shs_track, elig, degrees, pg_discipline
          FROM resolved
          ORDER BY personnel_id, priority ASC
        )
        UPDATE esf7_perssonel_educ e
        SET 
          college_degree = CASE 
            WHEN (e.college_degree IS NULL OR TRIM(e.college_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.college_degree IS NOT NULL AND d.college_degree NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.college_degree 
            ELSE e.college_degree 
          END,
          major = CASE 
            WHEN (e.major IS NULL OR TRIM(e.major) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.major IS NOT NULL AND d.major NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.major 
            ELSE e.major 
          END,
          minor = CASE 
            WHEN (e.minor IS NULL OR TRIM(e.minor) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.minor IS NOT NULL AND d.minor NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.minor 
            ELSE e.minor 
          END,
          post_graduate_degree = CASE 
            WHEN (e.post_graduate_degree IS NULL OR TRIM(e.post_graduate_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.post_grad IS NOT NULL AND d.post_grad NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.post_grad 
            ELSE e.post_graduate_degree 
          END,
          prc_specialization = CASE 
            WHEN (e.prc_specialization IS NULL OR TRIM(e.prc_specialization) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.prc_spec IS NOT NULL AND d.prc_spec NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.prc_spec 
            ELSE e.prc_specialization 
          END,
          highest_educational_attainment = CASE 
            WHEN (e.highest_educational_attainment IS NULL OR TRIM(e.highest_educational_attainment) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.hea IS NOT NULL AND d.hea NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.hea 
            ELSE e.highest_educational_attainment 
          END,
          vocational_course = CASE 
            WHEN e.vocational_course IS NULL AND d.voc_course IS NOT NULL THEN d.voc_course ELSE e.vocational_course 
          END,
          vocational_level = CASE 
            WHEN e.vocational_level IS NULL AND d.voc_level IS NOT NULL THEN d.voc_level ELSE e.vocational_level 
          END,
          shs_track = CASE 
            WHEN e.shs_track IS NULL AND d.shs_track IS NOT NULL THEN d.shs_track ELSE e.shs_track 
          END,
          eligibility = CASE 
            WHEN d.elig IS NOT NULL THEN (
              SELECT jsonb_agg(DISTINCT elem)
              FROM (
                SELECT jsonb_array_elements_text(COALESCE(e.eligibility, '[]'::jsonb)) as elem
                UNION
                SELECT jsonb_array_elements_text(d.elig) as elem
              ) sub
              WHERE elem IS NOT NULL AND elem <> '' AND UPPER(elem) NOT IN ('NONE', 'N/A')
            )
            ELSE e.eligibility 
          END,
          college_degrees = CASE 
            WHEN (e.college_degrees IS NULL OR e.college_degrees = '[]'::jsonb) 
                 AND d.degrees IS NOT NULL 
            THEN d.degrees 
            ELSE e.college_degrees 
          END,
          post_graduate_discipline = CASE 
            WHEN (e.post_graduate_discipline IS NULL OR e.post_graduate_discipline = '{}'::jsonb) 
                 AND d.pg_discipline IS NOT NULL 
            THEN d.pg_discipline 
            ELSE e.post_graduate_discipline 
          END,
          updated_at = NOW()
        FROM deduped d
        WHERE e.personnel_id = d.personnel_id
          AND (
            ((e.college_degree IS NULL OR TRIM(e.college_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.college_degree IS NOT NULL AND d.college_degree NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.major IS NULL OR TRIM(e.major) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.major IS NOT NULL AND d.major NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.minor IS NULL OR TRIM(e.minor) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.minor IS NOT NULL AND d.minor NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.post_graduate_degree IS NULL OR TRIM(e.post_graduate_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.post_grad IS NOT NULL AND d.post_grad NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.prc_specialization IS NULL OR TRIM(e.prc_specialization) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.prc_spec IS NOT NULL AND d.prc_spec NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.highest_educational_attainment IS NULL OR TRIM(e.highest_educational_attainment) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.hea IS NOT NULL AND d.hea NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR (e.vocational_course IS NULL AND d.voc_course IS NOT NULL)
            OR (e.vocational_level IS NULL AND d.voc_level IS NOT NULL)
            OR (e.shs_track IS NULL AND d.shs_track IS NOT NULL)
            OR (d.elig IS NOT NULL AND (e.eligibility IS NULL OR e.eligibility = '[]'::jsonb OR NOT (e.eligibility @> d.elig)))
            OR ((e.college_degrees IS NULL OR e.college_degrees = '[]'::jsonb) AND d.degrees IS NOT NULL)
            OR ((e.post_graduate_discipline IS NULL OR e.post_graduate_discipline = '{}'::jsonb) AND d.pg_discipline IS NOT NULL)
          );
      `,
        [schoolIds, schoolYears],
      );

      const updatedCount = updateBatch.rowCount || 0;
      totalUpdatedFromDrafts += updatedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Drafts Batch ${batchNum}/${totalDraftBatches}] Processed ${batchKeys.length} drafts -> ${updatedCount} records updated (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 1 Complete! Total records updated from school_drafts: ${totalUpdatedFromDrafts.toLocaleString()}`,
    );

    // Step 4: Pass 2 - Process esf7_room_roster_cache
    console.log(
      "\n[Step 4/6] PASS 2: Extracting & enriching education from esf7_room_roster_cache...",
    );
    const cacheKeysRes = await client.query(
      `SELECT school_id FROM esf7_room_roster_cache ORDER BY school_id;`,
    );
    const allCacheSchools = cacheKeysRes.rows.map((r) => r.school_id);
    const totalCacheSchools = allCacheSchools.length;
    console.log(
      `   ✓ Found ${totalCacheSchools.toLocaleString()} cached schools to inspect.`,
    );

    const CACHE_BATCH_SIZE = 1000;
    const totalCacheBatches = Math.ceil(totalCacheSchools / CACHE_BATCH_SIZE);
    let totalUpdatedFromCache = 0;

    for (let i = 0; i < totalCacheSchools; i += CACHE_BATCH_SIZE) {
      const batchNum = Math.floor(i / CACHE_BATCH_SIZE) + 1;
      const batchIds = allCacheSchools.slice(i, i + CACHE_BATCH_SIZE);
      const tBatch = Date.now();

      const updateBatch = await client.query(
        `
        WITH batch_cache AS (
          SELECT c.school_id, c.roster_json
          FROM esf7_room_roster_cache c
          JOIN UNNEST($1::varchar[]) AS k(s_id) ON c.school_id = k.s_id
        ),
        extracted_raw AS (
          SELECT 
            REPLACE(c.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            
            NULLIF(TRIM(COALESCE(p->>'collegeDegree', p->>'college_degree')), '') as college_degree,
            NULLIF(TRIM(COALESCE(p->>'major', p->>'majorSpecialization', p->>'major_specialization')), '') as major,
            NULLIF(TRIM(p->>'minor'), '') as minor,
            NULLIF(TRIM(COALESCE(p->>'postGraduateDegree', p->>'post_graduate_degree', p->>'postGraduate')), '') as post_grad,
            NULLIF(TRIM(COALESCE(p->>'prcSpecialization', p->>'prc_specialization')), '') as prc_spec,
            NULLIF(TRIM(COALESCE(p->>'highestEducationalAttainment', p->>'highest_educational_attainment')), '') as hea,
            NULLIF(TRIM(COALESCE(p->>'vocationalCourse', p->>'vocational_course')), '') as voc_course,
            NULLIF(TRIM(COALESCE(p->>'vocationalLevel', p->>'vocational_level')), '') as voc_level,
            NULLIF(TRIM(COALESCE(p->>'shsTrack', p->>'shs_track')), '') as shs_track,
            
            CASE 
              WHEN jsonb_typeof(p->'eligibility') = 'array' AND jsonb_array_length(p->'eligibility') > 0 THEN p->'eligibility'
              WHEN p->>'eligibility' IS NOT NULL AND TRIM(p->>'eligibility') NOT IN ('', '[]', 'null', 'NONE', 'N/A') 
                THEN to_jsonb(string_to_array(p->>'eligibility', ','))
              ELSE NULL
            END as elig,
            
            CASE 
              WHEN jsonb_typeof(p->'degreeRows') = 'array' AND jsonb_array_length(p->'degreeRows') > 0 THEN p->'degreeRows'
              WHEN jsonb_typeof(p->'college_degrees') = 'array' AND jsonb_array_length(p->'college_degrees') > 0 THEN p->'college_degrees'
              ELSE NULL
            END as degrees,
            
            CASE 
              WHEN jsonb_typeof(p->'postGraduateDiscipline') = 'object' AND p->'postGraduateDiscipline' <> '{}'::jsonb THEN p->'postGraduateDiscipline'
              WHEN jsonb_typeof(p->'post_graduate_discipline') = 'object' AND p->'post_graduate_discipline' <> '{}'::jsonb THEN p->'post_graduate_discipline'
              ELSE NULL
            END as pg_discipline
            
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.*,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          SELECT 
            p.id as personnel_id,
            x.*,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn

          UNION ALL

          SELECT 
            p.id as personnel_id,
            x.*,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped AS (
          SELECT DISTINCT ON (personnel_id)
            personnel_id, college_degree, major, minor, post_grad, prc_spec, hea, voc_course, voc_level, shs_track, elig, degrees, pg_discipline
          FROM resolved
          ORDER BY personnel_id, priority ASC
        )
        UPDATE esf7_perssonel_educ e
        SET 
          college_degree = CASE 
            WHEN (e.college_degree IS NULL OR TRIM(e.college_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.college_degree IS NOT NULL AND d.college_degree NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.college_degree 
            ELSE e.college_degree 
          END,
          major = CASE 
            WHEN (e.major IS NULL OR TRIM(e.major) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.major IS NOT NULL AND d.major NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.major 
            ELSE e.major 
          END,
          minor = CASE 
            WHEN (e.minor IS NULL OR TRIM(e.minor) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.minor IS NOT NULL AND d.minor NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.minor 
            ELSE e.minor 
          END,
          post_graduate_degree = CASE 
            WHEN (e.post_graduate_degree IS NULL OR TRIM(e.post_graduate_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.post_grad IS NOT NULL AND d.post_grad NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.post_grad 
            ELSE e.post_graduate_degree 
          END,
          prc_specialization = CASE 
            WHEN (e.prc_specialization IS NULL OR TRIM(e.prc_specialization) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.prc_spec IS NOT NULL AND d.prc_spec NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.prc_spec 
            ELSE e.prc_specialization 
          END,
          highest_educational_attainment = CASE 
            WHEN (e.highest_educational_attainment IS NULL OR TRIM(e.highest_educational_attainment) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) 
                 AND d.hea IS NOT NULL AND d.hea NOT IN ('N/A', 'NONE', 'NOT APPLICABLE')
            THEN d.hea 
            ELSE e.highest_educational_attainment 
          END,
          vocational_course = CASE 
            WHEN e.vocational_course IS NULL AND d.voc_course IS NOT NULL THEN d.voc_course ELSE e.vocational_course 
          END,
          vocational_level = CASE 
            WHEN e.vocational_level IS NULL AND d.voc_level IS NOT NULL THEN d.voc_level ELSE e.vocational_level 
          END,
          shs_track = CASE 
            WHEN e.shs_track IS NULL AND d.shs_track IS NOT NULL THEN d.shs_track ELSE e.shs_track 
          END,
          eligibility = CASE 
            WHEN d.elig IS NOT NULL THEN (
              SELECT jsonb_agg(DISTINCT elem)
              FROM (
                SELECT jsonb_array_elements_text(COALESCE(e.eligibility, '[]'::jsonb)) as elem
                UNION
                SELECT jsonb_array_elements_text(d.elig) as elem
              ) sub
              WHERE elem IS NOT NULL AND elem <> '' AND UPPER(elem) NOT IN ('NONE', 'N/A')
            )
            ELSE e.eligibility 
          END,
          college_degrees = CASE 
            WHEN (e.college_degrees IS NULL OR e.college_degrees = '[]'::jsonb) 
                 AND d.degrees IS NOT NULL 
            THEN d.degrees 
            ELSE e.college_degrees 
          END,
          post_graduate_discipline = CASE 
            WHEN (e.post_graduate_discipline IS NULL OR e.post_graduate_discipline = '{}'::jsonb) 
                 AND d.pg_discipline IS NOT NULL 
            THEN d.pg_discipline 
            ELSE e.post_graduate_discipline 
          END,
          updated_at = NOW()
        FROM deduped d
        WHERE e.personnel_id = d.personnel_id
          AND (
            ((e.college_degree IS NULL OR TRIM(e.college_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.college_degree IS NOT NULL AND d.college_degree NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.major IS NULL OR TRIM(e.major) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.major IS NOT NULL AND d.major NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.minor IS NULL OR TRIM(e.minor) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.minor IS NOT NULL AND d.minor NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.post_graduate_degree IS NULL OR TRIM(e.post_graduate_degree) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.post_grad IS NOT NULL AND d.post_grad NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.prc_specialization IS NULL OR TRIM(e.prc_specialization) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.prc_spec IS NOT NULL AND d.prc_spec NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR ((e.highest_educational_attainment IS NULL OR TRIM(e.highest_educational_attainment) IN ('', 'N/A', 'NONE', 'NOT APPLICABLE')) AND d.hea IS NOT NULL AND d.hea NOT IN ('N/A', 'NONE', 'NOT APPLICABLE'))
            OR (e.vocational_course IS NULL AND d.voc_course IS NOT NULL)
            OR (e.vocational_level IS NULL AND d.voc_level IS NOT NULL)
            OR (e.shs_track IS NULL AND d.shs_track IS NOT NULL)
            OR (d.elig IS NOT NULL AND (e.eligibility IS NULL OR e.eligibility = '[]'::jsonb OR NOT (e.eligibility @> d.elig)))
            OR ((e.college_degrees IS NULL OR e.college_degrees = '[]'::jsonb) AND d.degrees IS NOT NULL)
            OR ((e.post_graduate_discipline IS NULL OR e.post_graduate_discipline = '{}'::jsonb) AND d.pg_discipline IS NOT NULL)
          );
      `,
        [batchIds],
      );

      const updatedCount = updateBatch.rowCount || 0;
      totalUpdatedFromCache += updatedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Cache Batch ${batchNum}/${totalCacheBatches}] Processed ${batchIds.length} schools -> ${updatedCount} records updated (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 2 Complete! Total records updated from esf7_room_roster_cache: ${totalUpdatedFromCache.toLocaleString()}`,
    );

    // Step 5: Refresh View esf7_personnel_educ
    console.log("\n[Step 5/6] Refreshing view 'esf7_personnel_educ'...");
    await client.query(`
      CREATE OR REPLACE VIEW esf7_personnel_educ AS
      SELECT id, personnel_id, college_degree, major, minor, post_graduate_degree,
             post_graduate_discipline, eligibility, prc_specialization, created_at,
             updated_at, highest_educational_attainment, shs_track, vocational_course,
             vocational_level, college_degrees
      FROM esf7_perssonel_educ;
    `);
    console.log("   ✓ View 'esf7_personnel_educ' refreshed.");

    // Step 6: Post-execution stats & verification
    console.log(
      "\n[Step 6/6] Post-execution verification in esf7_perssonel_educ...",
    );
    const postCountRes = await client.query(
      "SELECT count(*) FROM esf7_perssonel_educ;",
    );
    const postTotal = parseInt(postCountRes.rows[0].count, 10);

    const postStatsRes = await client.query(`
      SELECT 
        count(CASE WHEN college_degree IS NOT NULL AND TRIM(college_degree) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_college,
        count(CASE WHEN major IS NOT NULL AND TRIM(major) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_major,
        count(CASE WHEN minor IS NOT NULL AND TRIM(minor) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_minor,
        count(CASE WHEN post_graduate_degree IS NOT NULL AND TRIM(post_graduate_degree) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_pg,
        count(CASE WHEN prc_specialization IS NOT NULL AND TRIM(prc_specialization) NOT IN ('', 'N/A', 'NONE', 'NOT APPLICABLE') THEN 1 END) as with_prc,
        count(CASE WHEN eligibility IS NOT NULL AND eligibility <> '[]'::jsonb AND eligibility <> '["NONE"]'::jsonb AND eligibility <> '["N/A"]'::jsonb THEN 1 END) as with_elig,
        count(CASE WHEN college_degrees IS NOT NULL AND college_degrees <> '[]'::jsonb THEN 1 END) as with_degrees
      FROM esf7_perssonel_educ;
    `);
    const post = postStatsRes.rows[0];

    console.log(
      `   - Total personnel records:     ${postTotal.toLocaleString()} (Must equal ${preTotal.toLocaleString()})`,
    );
    console.log(
      `   - Valid college_degree:        ${parseInt(post.with_college, 10).toLocaleString()} (+${(parseInt(post.with_college, 10) - parseInt(pre.with_college, 10)).toLocaleString()})`,
    );
    console.log(
      `   - Valid major:                 ${parseInt(post.with_major, 10).toLocaleString()} (+${(parseInt(post.with_major, 10) - parseInt(pre.with_major, 10)).toLocaleString()})`,
    );
    console.log(
      `   - Valid minor:                 ${parseInt(post.with_minor, 10).toLocaleString()} (+${(parseInt(post.with_minor, 10) - parseInt(pre.with_minor, 10)).toLocaleString()})`,
    );
    console.log(
      `   - Valid post_grad_degree:      ${parseInt(post.with_pg, 10).toLocaleString()} (+${(parseInt(post.with_pg, 10) - parseInt(pre.with_pg, 10)).toLocaleString()})`,
    );
    console.log(
      `   - Valid prc_spec:              ${parseInt(post.with_prc, 10).toLocaleString()} (+${(parseInt(post.with_prc, 10) - parseInt(pre.with_prc, 10)).toLocaleString()})`,
    );
    console.log(
      `   - Valid eligibility:           ${parseInt(post.with_elig, 10).toLocaleString()} (+${(parseInt(post.with_elig, 10) - parseInt(pre.with_elig, 10)).toLocaleString()})`,
    );
    console.log(
      `   - Valid college_degrees:       ${parseInt(post.with_degrees, 10).toLocaleString()} (+${(parseInt(post.with_degrees, 10) - parseInt(pre.with_degrees, 10)).toLocaleString()})`,
    );

    if (postTotal !== preTotal) {
      throw new Error(
        `CRITICAL INTEGRITY FAILURE: Table count changed from ${preTotal} to ${postTotal}!`,
      );
    }

    console.log("\n--- Sample of newly updated education records ---");
    const sampleUpdated = await client.query(`
      SELECT e.id, e.personnel_id, prof.school_id, prof.first_name, prof.last_name, 
             e.college_degree, e.major, e.minor, e.post_graduate_degree, e.prc_specialization
      FROM esf7_perssonel_educ e
      JOIN esf7_personnel_profile prof ON e.personnel_id = prof.id
      ORDER BY e.updated_at DESC
      LIMIT 5;
    `);
    console.table(
      sampleUpdated.rows.map((r) => ({
        id: r.personnel_id,
        name: `${r.first_name} ${r.last_name}`,
        degree: r.college_degree,
        major: r.major,
        minor: r.minor,
        post_grad: r.post_graduate_degree,
        prc: r.prc_specialization,
      })),
    );

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(
      `🎉 PERSONNEL EDUCATION ENRICHED SUCCESSFULLY in ${totalSeconds}s!`,
    );
    console.log(
      `   - Pass 1 (school_drafts):        ${totalUpdatedFromDrafts.toLocaleString()} records updated`,
    );
    console.log(
      `   - Pass 2 (esf7_room_roster_cache): ${totalUpdatedFromCache.toLocaleString()} records updated`,
    );
    console.log(
      `   - Zero Deletions: Verified! Total rows preserved: exactly ${postTotal.toLocaleString()}`,
    );
    console.log(
      "================================================================================",
    );
  } catch (err) {
    console.error("❌ Error during education enrichment:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

plotPersonnelEducation().catch((err) => {
  console.error(err);
  process.exit(1);
});
