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

async function plotPhase4WorkloadRows() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log("🚀 PHASE 4: PLOTTING TEACHING ASSIGNMENTS (WORKLOAD ROWS)");
    console.log("   Sources: school_drafts & esf7_room_roster_cache");
    console.log("   Target Table: esf7_workload_rows (insighted_esf7)");
    console.log(
      "   Safety Policy: ADDITIVE INSERT (DEDUPLICATED) - ZERO DELETIONS",
    );
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    console.log("\n[Step 1/6] Pre-execution stats in esf7_workload_rows...");
    const preCountRes = await client.query(
      "SELECT count(*) FROM esf7_workload_rows;",
    );
    const preTotal = parseInt(preCountRes.rows[0].count, 10);
    console.log(
      `   - Current total workload rows: ${preTotal.toLocaleString()}`,
    );

    // Step 2: Dedicated safety backup table
    console.log(
      "\n[Step 2/6] Ensuring dedicated safety backup table 'esf7_workload_rows_backup_phase4' exists...",
    );
    const backupExistsRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'esf7_workload_rows_backup_phase4'
      );
    `);
    const backupExists = backupExistsRes.rows[0].exists;

    if (!backupExists) {
      console.log("   Creating backup table (1.89M rows, please wait)...");
      const tBackupStart = Date.now();
      await client.query(`
        CREATE TABLE esf7_workload_rows_backup_phase4 AS
        SELECT * FROM esf7_workload_rows;
      `);
      const backupSec = ((Date.now() - tBackupStart) / 1000).toFixed(1);
      console.log(`   ✓ Backup created in ${backupSec}s.`);
    } else {
      console.log(
        "   ✓ Backup table 'esf7_workload_rows_backup_phase4' already exists.",
      );
    }

    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_workload_rows_backup_phase4;",
    );
    const backupCount = parseInt(backupRes.rows[0].count, 10);
    console.log(
      `   ✓ Backup verified: ${backupCount.toLocaleString()} rows preserved in 'esf7_workload_rows_backup_phase4'.`,
    );

    // Step 3: Pass 1 - Process school_drafts
    console.log(
      "\n[Step 3/6] PASS 1: Extracting & inserting missing workloads from school_drafts...",
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

    const DRAFT_BATCH_SIZE = 500;
    const totalDraftBatches = Math.ceil(totalDrafts / DRAFT_BATCH_SIZE);
    let totalInsertedFromDrafts = 0;

    for (let i = 0; i < totalDrafts; i += DRAFT_BATCH_SIZE) {
      const batchNum = Math.floor(i / DRAFT_BATCH_SIZE) + 1;
      const batchKeys = allDrafts.slice(i, i + DRAFT_BATCH_SIZE);
      const schoolIds = batchKeys.map((k) => k.school_id);
      const schoolYears = batchKeys.map((k) => k.school_year);
      const tBatch = Date.now();

      const insertBatch = await client.query(
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
            COALESCE(NULLIF(TRIM(d.school_year), ''), 'SY 26-27') as school_year,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            TRIM(COALESCE(elem->>'subject', elem->>'subject_name', elem->>'task', '')) as subject,
            TRIM(COALESCE(elem->>'sectionName', elem->>'section_name', '')) as section_name,
            TRIM(COALESCE(elem->>'sectionId', elem->>'section_id', '')) as section_id,
            TRIM(COALESCE(elem->>'gradeLevel', elem->>'grade_level', '')) as grade_level,
            TRIM(COALESCE(elem->>'subjectId', elem->>'subject_id', '')) as subject_id,
            TRIM(COALESCE(elem->>'remediationSubject', elem->>'remediation_subject', '')) as remediation_subject,
            TRIM(COALESCE(elem->>'term', '1st')) as term,
            CASE 
              WHEN elem->>'startTime' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'startTime')::time
              WHEN elem->>'start_time' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'start_time')::time
              WHEN elem->>'startTime' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'startTime', 'HH12:MI AM')::time
              WHEN elem->>'start_time' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'start_time', 'HH12:MI AM')::time
              ELSE NULL
            END as start_time,
            CASE 
              WHEN elem->>'endTime' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'endTime')::time
              WHEN elem->>'end_time' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'end_time')::time
              WHEN elem->>'endTime' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'endTime', 'HH12:MI AM')::time
              WHEN elem->>'end_time' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'end_time', 'HH12:MI AM')::time
              ELSE NULL
            END as end_time,
            CASE 
              WHEN jsonb_typeof(elem->'days') = 'array' THEN elem->'days'
              WHEN elem->>'days' IS NOT NULL AND TRIM(elem->>'days') <> '' THEN to_jsonb(string_to_array(elem->>'days', ','))
              ELSE '["M", "T", "W", "TH", "F"]'::jsonb
            END as days
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel' ELSE '[]'::jsonb END
          ) p,
          LATERAL jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(p->'workloadRows') = 'array' THEN p->'workloadRows'
              WHEN jsonb_typeof(p->'teaching_assignments') = 'array' THEN p->'teaching_assignments'
              WHEN jsonb_typeof(p->'teachingAssignments') = 'array' THEN p->'teachingAssignments'
              WHEN jsonb_typeof(p->'workload_rows') = 'array' THEN p->'workload_rows'
              ELSE '[]'::jsonb 
            END
          ) elem
          WHERE TRIM(COALESCE(elem->>'subject', elem->>'subject_name', elem->>'task', '')) <> ''
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.school_id,
            'SY 26-27'::text as school_year,
            x.grade_level,
            x.section_id,
            x.section_name,
            x.subject,
            x.subject_id,
            x.remediation_subject,
            x.start_time,
            x.end_time,
            x.days,
            x.term,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          SELECT 
            p.id as personnel_id,
            x.school_id,
            'SY 26-27'::text as school_year,
            x.grade_level,
            x.section_id,
            x.section_name,
            x.subject,
            x.subject_id,
            x.remediation_subject,
            x.start_time,
            x.end_time,
            x.days,
            x.term,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn

          UNION ALL

          SELECT 
            p.id as personnel_id,
            x.school_id,
            'SY 26-27'::text as school_year,
            x.grade_level,
            x.section_id,
            x.section_name,
            x.subject,
            x.subject_id,
            x.remediation_subject,
            x.start_time,
            x.end_time,
            x.days,
            x.term,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped_candidates AS (
          SELECT DISTINCT ON (personnel_id, UPPER(TRIM(subject)), COALESCE(UPPER(TRIM(section_name)), ''), COALESCE(start_time, '00:00:00'::time))
            personnel_id, school_id, school_year, grade_level, section_id, section_name,
            subject, subject_id, remediation_subject, start_time, end_time, days, term
          FROM resolved
          ORDER BY personnel_id, UPPER(TRIM(subject)), COALESCE(UPPER(TRIM(section_name)), ''), COALESCE(start_time, '00:00:00'::time), priority ASC
        ),
        missing_rows AS (
          SELECT d.*
          FROM deduped_candidates d
          WHERE NOT EXISTS (
            SELECT 1 FROM esf7_workload_rows ex
            WHERE ex.personnel_id = d.personnel_id
              AND UPPER(TRIM(ex.subject)) = UPPER(TRIM(d.subject))
              AND COALESCE(UPPER(TRIM(ex.section_name)), '') = COALESCE(UPPER(TRIM(d.section_name)), '')
              AND COALESCE(ex.start_time, '00:00:00'::time) = COALESCE(d.start_time, '00:00:00'::time)
          )
        )
        INSERT INTO esf7_workload_rows (
          id,
          personnel_id,
          school_id,
          school_year,
          grade_level,
          section_id,
          section_name,
          subject,
          subject_id,
          remediation_subject,
          start_time,
          end_time,
          days,
          created_at,
          updated_at,
          term,
          extras
        )
        SELECT 
          'wkl_sync_' || school_id || '_' || personnel_id || '_' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '_' || ROW_NUMBER() OVER () as id,
          personnel_id,
          school_id,
          school_year,
          NULLIF(grade_level, ''),
          NULLIF(section_id, ''),
          NULLIF(section_name, ''),
          subject,
          NULLIF(subject_id, ''),
          NULLIF(remediation_subject, ''),
          start_time,
          end_time,
          days,
          NOW(),
          NOW(),
          term,
          '{}'::jsonb
        FROM missing_rows;
      `,
        [schoolIds, schoolYears],
      );

      const insertedCount = insertBatch.rowCount || 0;
      totalInsertedFromDrafts += insertedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Drafts Batch ${batchNum}/${totalDraftBatches}] Processed ${batchKeys.length} drafts -> ${insertedCount} workloads inserted (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 1 Complete! Total workloads inserted from school_drafts: ${totalInsertedFromDrafts.toLocaleString()}`,
    );

    // Step 4: Pass 2 - Process esf7_room_roster_cache
    console.log(
      "\n[Step 4/6] PASS 2: Extracting & inserting missing workloads from esf7_room_roster_cache...",
    );
    const cacheKeysRes = await client.query(
      `SELECT school_id FROM esf7_room_roster_cache ORDER BY school_id;`,
    );
    const allCacheSchools = cacheKeysRes.rows.map((r) => r.school_id);
    const totalCacheSchools = allCacheSchools.length;
    console.log(
      `   ✓ Found ${totalCacheSchools.toLocaleString()} cached schools to inspect.`,
    );

    const CACHE_BATCH_SIZE = 500;
    const totalCacheBatches = Math.ceil(totalCacheSchools / CACHE_BATCH_SIZE);
    let totalInsertedFromCache = 0;

    for (let i = 0; i < totalCacheSchools; i += CACHE_BATCH_SIZE) {
      const batchNum = Math.floor(i / CACHE_BATCH_SIZE) + 1;
      const batchIds = allCacheSchools.slice(i, i + CACHE_BATCH_SIZE);
      const tBatch = Date.now();

      const insertBatch = await client.query(
        `
        WITH batch_cache AS (
          SELECT c.school_id, c.roster_json
          FROM esf7_room_roster_cache c
          JOIN UNNEST($1::varchar[]) AS k(s_id) ON c.school_id = k.s_id
        ),
        extracted_raw AS (
          SELECT 
            REPLACE(c.school_id, 'SCH-', '') as school_id,
            'SY 26-27'::text as school_year,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            TRIM(COALESCE(elem->>'subject', elem->>'subject_name', elem->>'task', '')) as subject,
            TRIM(COALESCE(elem->>'sectionName', elem->>'section_name', '')) as section_name,
            TRIM(COALESCE(elem->>'sectionId', elem->>'section_id', '')) as section_id,
            TRIM(COALESCE(elem->>'gradeLevel', elem->>'grade_level', '')) as grade_level,
            TRIM(COALESCE(elem->>'subjectId', elem->>'subject_id', '')) as subject_id,
            TRIM(COALESCE(elem->>'remediationSubject', elem->>'remediation_subject', '')) as remediation_subject,
            TRIM(COALESCE(elem->>'term', '1st')) as term,
            CASE 
              WHEN elem->>'startTime' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'startTime')::time
              WHEN elem->>'start_time' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'start_time')::time
              WHEN elem->>'startTime' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'startTime', 'HH12:MI AM')::time
              WHEN elem->>'start_time' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'start_time', 'HH12:MI AM')::time
              ELSE NULL
            END as start_time,
            CASE 
              WHEN elem->>'endTime' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'endTime')::time
              WHEN elem->>'end_time' ~ '^\\d{1,2}:\\d{2}(:\\d{2})?$' THEN (elem->>'end_time')::time
              WHEN elem->>'endTime' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'endTime', 'HH12:MI AM')::time
              WHEN elem->>'end_time' ~* '^\\d{1,2}:\\d{2}\\s*(AM|PM)$' THEN to_timestamp(elem->>'end_time', 'HH12:MI AM')::time
              ELSE NULL
            END as end_time,
            CASE 
              WHEN jsonb_typeof(elem->'days') = 'array' THEN elem->'days'
              WHEN elem->>'days' IS NOT NULL AND TRIM(elem->>'days') <> '' THEN to_jsonb(string_to_array(elem->>'days', ','))
              ELSE '["M", "T", "W", "TH", "F"]'::jsonb
            END as days
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p,
          LATERAL jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(p->'workloadRows') = 'array' THEN p->'workloadRows'
              WHEN jsonb_typeof(p->'teaching_assignments') = 'array' THEN p->'teaching_assignments'
              WHEN jsonb_typeof(p->'teachingAssignments') = 'array' THEN p->'teachingAssignments'
              WHEN jsonb_typeof(p->'workload_rows') = 'array' THEN p->'workload_rows'
              ELSE '[]'::jsonb 
            END
          ) elem
          WHERE TRIM(COALESCE(elem->>'subject', elem->>'subject_name', elem->>'task', '')) <> ''
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.school_id,
            'SY 26-27'::text as school_year,
            x.grade_level,
            x.section_id,
            x.section_name,
            x.subject,
            x.subject_id,
            x.remediation_subject,
            x.start_time,
            x.end_time,
            x.days,
            x.term,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          SELECT 
            p.id as personnel_id,
            x.school_id,
            'SY 26-27'::text as school_year,
            x.grade_level,
            x.section_id,
            x.section_name,
            x.subject,
            x.subject_id,
            x.remediation_subject,
            x.start_time,
            x.end_time,
            x.days,
            x.term,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn

          UNION ALL

          SELECT 
            p.id as personnel_id,
            x.school_id,
            'SY 26-27'::text as school_year,
            x.grade_level,
            x.section_id,
            x.section_name,
            x.subject,
            x.subject_id,
            x.remediation_subject,
            x.start_time,
            x.end_time,
            x.days,
            x.term,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped_candidates AS (
          SELECT DISTINCT ON (personnel_id, UPPER(TRIM(subject)), COALESCE(UPPER(TRIM(section_name)), ''), COALESCE(start_time, '00:00:00'::time))
            personnel_id, school_id, school_year, grade_level, section_id, section_name,
            subject, subject_id, remediation_subject, start_time, end_time, days, term
          FROM resolved
          ORDER BY personnel_id, UPPER(TRIM(subject)), COALESCE(UPPER(TRIM(section_name)), ''), COALESCE(start_time, '00:00:00'::time), priority ASC
        ),
        missing_rows AS (
          SELECT d.*
          FROM deduped_candidates d
          WHERE NOT EXISTS (
            SELECT 1 FROM esf7_workload_rows ex
            WHERE ex.personnel_id = d.personnel_id
              AND UPPER(TRIM(ex.subject)) = UPPER(TRIM(d.subject))
              AND COALESCE(UPPER(TRIM(ex.section_name)), '') = COALESCE(UPPER(TRIM(d.section_name)), '')
              AND COALESCE(ex.start_time, '00:00:00'::time) = COALESCE(d.start_time, '00:00:00'::time)
          )
        )
        INSERT INTO esf7_workload_rows (
          id,
          personnel_id,
          school_id,
          school_year,
          grade_level,
          section_id,
          section_name,
          subject,
          subject_id,
          remediation_subject,
          start_time,
          end_time,
          days,
          created_at,
          updated_at,
          term,
          extras
        )
        SELECT 
          'wkl_sync_' || school_id || '_' || personnel_id || '_' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '_' || ROW_NUMBER() OVER () as id,
          personnel_id,
          school_id,
          school_year,
          NULLIF(grade_level, ''),
          NULLIF(section_id, ''),
          NULLIF(section_name, ''),
          subject,
          NULLIF(subject_id, ''),
          NULLIF(remediation_subject, ''),
          start_time,
          end_time,
          days,
          NOW(),
          NOW(),
          term,
          '{}'::jsonb
        FROM missing_rows;
      `,
        [batchIds],
      );

      const insertedCount = insertBatch.rowCount || 0;
      totalInsertedFromCache += insertedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Cache Batch ${batchNum}/${totalCacheBatches}] Processed ${batchIds.length} schools -> ${insertedCount} workloads inserted (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 2 Complete! Total workloads inserted from esf7_room_roster_cache: ${totalInsertedFromCache.toLocaleString()}`,
    );

    // Step 5: Refresh View
    console.log(
      "\n[Step 5/6] Refreshing dependent view 'esf7_workload_row'...",
    );
    await client.query(
      "CREATE OR REPLACE VIEW esf7_workload_row AS SELECT * FROM esf7_workload_rows;",
    );
    console.log("   ✓ View 'esf7_workload_row' refreshed.");

    // Step 6: Post-execution stats & verification
    console.log(
      "\n[Step 6/6] Post-execution verification in esf7_workload_rows...",
    );
    const postCountRes = await client.query(
      "SELECT count(*) FROM esf7_workload_rows;",
    );
    const postTotal = parseInt(postCountRes.rows[0].count, 10);
    const netAdded = postTotal - preTotal;

    console.log(
      `   - Original total workload rows: ${preTotal.toLocaleString()}`,
    );
    console.log(
      `   - New total workload rows:      ${postTotal.toLocaleString()}`,
    );
    console.log(
      `   - Net new workloads inserted:   +${netAdded.toLocaleString()}`,
    );

    if (postTotal < preTotal) {
      throw new Error(
        `CRITICAL INTEGRITY FAILURE: Post count (${postTotal}) < pre count (${preTotal})!`,
      );
    }

    console.log("\n--- Sample of newly inserted workload rows ---");
    const sampleInserted = await client.query(`
      SELECT id, personnel_id, school_id, school_year, grade_level, section_name, subject, start_time, end_time, days, term
      FROM esf7_workload_rows
      WHERE id LIKE 'wkl_sync_%'
      LIMIT 5;
    `);
    console.table(sampleInserted.rows);

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(`🎉 PHASE 4 COMPLETED SUCCESSFULLY in ${totalSeconds}s!`);
    console.log(
      `   - Pass 1 (school_drafts):        +${totalInsertedFromDrafts.toLocaleString()} workloads`,
    );
    console.log(
      `   - Pass 2 (esf7_room_roster_cache): +${totalInsertedFromCache.toLocaleString()} workloads`,
    );
    console.log(
      `   - Total Net Additions:            +${netAdded.toLocaleString()} workloads`,
    );
    console.log(
      `   - Zero Deletions: Verified! Table grew from ${preTotal.toLocaleString()} to ${postTotal.toLocaleString()}`,
    );
    console.log(
      "================================================================================",
    );
  } catch (err) {
    console.error("❌ Error during Phase 4 execution:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

plotPhase4WorkloadRows().catch((err) => {
  console.error(err);
  process.exit(1);
});
