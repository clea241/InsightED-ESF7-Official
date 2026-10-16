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

async function plotPhase2LearningAreas() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log(
      "🚀 PHASE 2: PLOTTING LEARNING AREAS FROM school_drafts & esf7_room_roster_cache",
    );
    console.log(
      "   Target Table: esf7_personnel_learning_areas (insighted_esf7)",
    );
    console.log(
      "   Safety Policy: ADDITIVE / OVERLAY ENRICHMENT - ZERO DELETIONS",
    );
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    console.log(
      "\n[Step 1/6] Pre-execution stats in esf7_personnel_learning_areas...",
    );
    const preStatsRes = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(matrix_data) FILTER (WHERE matrix_data IS NOT NULL AND matrix_data != '{}'::jsonb) as with_data,
        count(*) FILTER (WHERE matrix_data IS NULL OR matrix_data = '{}'::jsonb) as empty_or_null
      FROM esf7_personnel_learning_areas;
    `);
    const pre = preStatsRes.rows[0];
    const preTotal = parseInt(pre.total_rows, 10);
    const preWithData = parseInt(pre.with_data, 10);
    const preEmpty = parseInt(pre.empty_or_null, 10);

    console.log(`   - Total personnel rows: ${preTotal.toLocaleString()}`);
    console.log(
      `   - With populated matrix_data: ${preWithData.toLocaleString()}`,
    );
    console.log(
      `   - Currently empty/null matrix_data: ${preEmpty.toLocaleString()}`,
    );

    // Step 2: Dedicated safety backup table
    console.log("\n[Step 2/6] Creating dedicated safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_learning_areas_backup_phase2 AS
      SELECT * FROM esf7_personnel_learning_areas;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_learning_areas_backup_phase2;",
    );
    console.log(
      `   ✓ Backup verified: ${parseInt(backupRes.rows[0].count, 10).toLocaleString()} rows preserved in 'esf7_personnel_learning_areas_backup_phase2'.`,
    );

    // Step 3: Pass 1 - Process school_drafts
    console.log(
      "\n[Step 3/6] PASS 1: Extracting & plotting learning areas from school_drafts...",
    );
    const draftKeysRes = await client.query(`
      SELECT school_id, school_year 
      FROM school_drafts 
      ORDER BY school_id, school_year;
    `);
    const allDrafts = draftKeysRes.rows;
    const totalDrafts = allDrafts.length;
    console.log(
      `   ✓ Found ${totalDrafts.toLocaleString()} drafts in school_drafts.`,
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
          SELECT d.school_id, d.payload
          FROM school_drafts d
          JOIN UNNEST($1::text[], $2::text[]) AS k(s_id, s_yr)
            ON d.school_id = k.s_id AND d.school_year = k.s_yr
        ),
        extracted AS (
          SELECT 
            REPLACE(d.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            NULLIF(TRIM(COALESCE(p->>'employee_no', p->>'employeeNo')), '') as d_emp_no,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            COALESCE(
              NULLIF(p->'learningAreaMap', '{}'::jsonb),
              NULLIF(p->'matrix_data', '{}'::jsonb),
              NULLIF(p->'matrixData', '{}'::jsonb)
            ) as matrix
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel' ELSE '[]'::jsonb END
          ) p
          WHERE (p->'learningAreaMap' IS NOT NULL AND p->'learningAreaMap' != '{}'::jsonb)
             OR (p->'matrix_data' IS NOT NULL AND p->'matrix_data' != '{}'::jsonb)
             OR (p->'matrixData' IS NOT NULL AND p->'matrixData' != '{}'::jsonb)
        ),
        candidates AS (
          -- Priority 1: Direct ID or Legacy ID
          SELECT p.id as personnel_id, x.matrix, 1 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          -- Priority 2: DepEd PRN
          SELECT p.id as personnel_id, x.matrix, 2 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn
            
          UNION ALL
          
          -- Priority 3: Same School + Full Name
          SELECT p.id as personnel_id, x.matrix, 3 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped AS (
          SELECT *
          FROM (
            SELECT *, ROW_NUMBER() OVER(PARTITION BY personnel_id ORDER BY priority ASC) as rn
            FROM candidates
          ) sub
          WHERE rn = 1
        )
        UPDATE esf7_personnel_learning_areas la
        SET 
          matrix_data = d.matrix,
          updated_at = NOW()
        FROM deduped d
        WHERE la.personnel_id = d.personnel_id
          AND (la.matrix_data IS NULL OR la.matrix_data = '{}'::jsonb OR la.matrix_data != d.matrix);
      `,
        [schoolIds, schoolYears],
      );

      const count = updateBatch.rowCount || 0;
      totalUpdatedFromDrafts += count;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Drafts Batch ${batchNum}/${totalDraftBatches}] Processed ${batchKeys.length} drafts -> ${count} learning areas updated (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 1 Complete! Total learning areas updated from school_drafts: ${totalUpdatedFromDrafts.toLocaleString()}`,
    );

    // Step 4: Pass 2 - Process esf7_room_roster_cache
    console.log(
      "\n[Step 4/6] PASS 2: Extracting & plotting learning areas from esf7_room_roster_cache...",
    );
    const cacheKeysRes = await client.query(
      `SELECT school_id FROM esf7_room_roster_cache ORDER BY school_id;`,
    );
    const allCacheSchools = cacheKeysRes.rows.map((r) => r.school_id);
    const totalCacheSchools = allCacheSchools.length;
    console.log(
      `   ✓ Found ${totalCacheSchools.toLocaleString()} cached schools.`,
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
        extracted AS (
          SELECT 
            REPLACE(c.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            NULLIF(TRIM(COALESCE(p->>'employee_no', p->>'employeeNo')), '') as d_emp_no,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            COALESCE(
              NULLIF(p->'learningAreaMap', '{}'::jsonb),
              NULLIF(p->'matrix_data', '{}'::jsonb),
              NULLIF(p->'matrixData', '{}'::jsonb)
            ) as matrix
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p
          WHERE (p->'learningAreaMap' IS NOT NULL AND p->'learningAreaMap' != '{}'::jsonb)
             OR (p->'matrix_data' IS NOT NULL AND p->'matrix_data' != '{}'::jsonb)
             OR (p->'matrixData' IS NOT NULL AND p->'matrixData' != '{}'::jsonb)
        ),
        candidates AS (
          -- Priority 1: Direct ID or Legacy ID
          SELECT p.id as personnel_id, x.matrix, 1 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          -- Priority 2: DepEd PRN
          SELECT p.id as personnel_id, x.matrix, 2 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn
            
          UNION ALL
          
          -- Priority 3: Same School + Full Name
          SELECT p.id as personnel_id, x.matrix, 3 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped AS (
          SELECT *
          FROM (
            SELECT *, ROW_NUMBER() OVER(PARTITION BY personnel_id ORDER BY priority ASC) as rn
            FROM candidates
          ) sub
          WHERE rn = 1
        )
        UPDATE esf7_personnel_learning_areas la
        SET 
          matrix_data = d.matrix,
          updated_at = NOW()
        FROM deduped d
        WHERE la.personnel_id = d.personnel_id
          AND (la.matrix_data IS NULL OR la.matrix_data = '{}'::jsonb OR la.matrix_data != d.matrix);
      `,
        [batchIds],
      );

      const count = updateBatch.rowCount || 0;
      totalUpdatedFromCache += count;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Cache Batch ${batchNum}/${totalCacheBatches}] Processed ${batchIds.length} schools -> ${count} learning areas updated (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 2 Complete! Total learning areas updated from room_roster_cache: ${totalUpdatedFromCache.toLocaleString()}`,
    );

    // Step 5: Post-execution stats & verification
    console.log("\n[Step 5/6] Post-execution verification & auditing...");
    const postStatsRes = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(matrix_data) FILTER (WHERE matrix_data IS NOT NULL AND matrix_data != '{}'::jsonb) as with_data,
        count(*) FILTER (WHERE matrix_data IS NULL OR matrix_data = '{}'::jsonb) as empty_or_null
      FROM esf7_personnel_learning_areas;
    `);
    const post = postStatsRes.rows[0];
    const postTotal = parseInt(post.total_rows, 10);
    const postWithData = parseInt(post.with_data, 10);
    const postEmpty = parseInt(post.empty_or_null, 10);

    console.log(
      `   - Post total rows: ${postTotal.toLocaleString()} (Verified: ${postTotal === preTotal ? "PERFECT MATCH, 0 DELETIONS" : "MISMATCH"})`,
    );
    console.log(
      `   - Populated learning areas: ${postWithData.toLocaleString()} (+${(postWithData - preWithData).toLocaleString()} newly populated)`,
    );
    console.log(
      `   - Remaining empty/null: ${postEmpty.toLocaleString()} (-${(preEmpty - postEmpty).toLocaleString()})`,
    );

    // Step 6: Sample 5 newly enriched records
    console.log(
      "\n[Step 6/6] Sampling 5 newly enriched learning area records...",
    );
    const sampleRes = await client.query(`
      SELECT 
        la.personnel_id,
        p.first_name,
        p.last_name,
        p.school_id,
        (b.matrix_data = '{}'::jsonb OR b.matrix_data IS NULL) as was_empty,
        jsonb_object_keys(la.matrix_data) as subject_area,
        la.matrix_data->jsonb_object_keys(la.matrix_data) as area_details
      FROM esf7_personnel_learning_areas la
      JOIN esf7_personnel_learning_areas_backup_phase2 b ON b.personnel_id = la.personnel_id
      JOIN esf7_personnel_profile p ON p.id = la.personnel_id
      WHERE (b.matrix_data IS NULL OR b.matrix_data = '{}'::jsonb)
        AND (la.matrix_data IS NOT NULL AND la.matrix_data != '{}'::jsonb)
      ORDER BY la.updated_at DESC
      LIMIT 5;
    `);

    console.table(
      sampleRes.rows.map((r) => ({
        ID: r.personnel_id,
        Name: `${r.first_name} ${r.last_name}`,
        School: r.school_id,
        Previous_State: "EMPTY ({})",
        Sample_Area: r.subject_area,
        Details: JSON.stringify(r.area_details),
      })),
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(
      `🎉 SUCCESS! Completed Phase 2 Learning Area Enrichment in ${elapsed}s`,
    );
    console.log(
      `   - Updates from school_drafts: ${totalUpdatedFromDrafts.toLocaleString()}`,
    );
    console.log(
      `   - Updates from room_roster_cache: ${totalUpdatedFromCache.toLocaleString()}`,
    );
    console.log(
      `   - Total Net Learning Area Growth: +${(postWithData - preWithData).toLocaleString()}`,
    );
    console.log(
      "================================================================================",
    );
  } catch (error) {
    console.error("\n❌ ERROR during execution:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

plotPhase2LearningAreas().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
