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

async function plotGradeLevelsTaught() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log("🚀 PLOTTING GRADE LEVELS TAUGHT TO esf7_personnel_employment");
    console.log("   Sources: school_drafts & esf7_room_roster_cache");
    console.log(
      "   Target Table: esf7_personnel_employment.grade_levels_taught (insighted_esf7)",
    );
    console.log("   Safety Policy: ADDITIVE / MERGE ONLY - ZERO DELETIONS");
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    console.log(
      "\n[Step 1/5] Pre-execution stats in esf7_personnel_employment...",
    );
    const preCountRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment;",
    );
    const preTotal = parseInt(preCountRes.rows[0].count, 10);
    console.log(
      `   - Total personnel employment records: ${preTotal.toLocaleString()}`,
    );

    const preGltRes = await client.query(`
      SELECT 
        count(CASE WHEN jsonb_typeof(grade_levels_taught) = 'array' AND jsonb_array_length(grade_levels_taught) > 0 THEN 1 END) as populated,
        count(CASE WHEN grade_levels_taught IS NULL OR grade_levels_taught = '[]'::jsonb THEN 1 END) as empty
      FROM esf7_personnel_employment;
    `);
    const prePopulated = parseInt(preGltRes.rows[0].populated, 10);
    const preEmpty = parseInt(preGltRes.rows[0].empty, 10);
    console.log(`   - Currently populated: ${prePopulated.toLocaleString()}`);
    console.log(`   - Currently empty/null: ${preEmpty.toLocaleString()}`);

    // Step 2: Dedicated safety backup table
    console.log(
      "\n[Step 2/5] Creating dedicated safety backup table 'esf7_personnel_employment_backup_grade_levels'...",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_employment_backup_grade_levels AS
      SELECT * FROM esf7_personnel_employment;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment_backup_grade_levels;",
    );
    const backupCount = parseInt(backupRes.rows[0].count, 10);
    console.log(
      `   ✓ Backup verified: ${backupCount.toLocaleString()} rows preserved in 'esf7_personnel_employment_backup_grade_levels'.`,
    );

    // Step 3: Pass 1 - Process school_drafts
    console.log(
      "\n[Step 3/5] PASS 1: Extracting & merging grade_levels_taught from school_drafts...",
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
            COALESCE(
              CASE 
                WHEN jsonb_typeof(p->'grade_levels_taught') = 'array' AND jsonb_array_length(p->'grade_levels_taught') > 0 THEN p->'grade_levels_taught'
                WHEN jsonb_typeof(p->'gradeLevelsTaught') = 'array' AND jsonb_array_length(p->'gradeLevelsTaught') > 0 THEN p->'gradeLevelsTaught'
                WHEN jsonb_typeof(p->'grade_level_taught') = 'array' AND jsonb_array_length(p->'grade_level_taught') > 0 THEN p->'grade_level_taught'
                WHEN p->>'grade_levels_taught' IS NOT NULL AND TRIM(p->>'grade_levels_taught') NOT IN ('', '[]', 'null') 
                  THEN to_jsonb(string_to_array(p->>'grade_levels_taught', ','))
                WHEN p->>'gradeLevelsTaught' IS NOT NULL AND TRIM(p->>'gradeLevelsTaught') NOT IN ('', '[]', 'null') 
                  THEN to_jsonb(string_to_array(p->>'gradeLevelsTaught', ','))
                ELSE NULL
              END,
              (
                SELECT jsonb_agg(DISTINCT TRIM(elem->>'gradeLevel'))
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p->'workloadRows') = 'array' THEN p->'workloadRows' ELSE '[]'::jsonb END
                ) elem
                WHERE NULLIF(TRIM(elem->>'gradeLevel'), '') IS NOT NULL
              )
            ) as grade_levels
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel' ELSE '[]'::jsonb END
          ) p
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.grade_levels,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          WHERE x.grade_levels IS NOT NULL AND jsonb_array_length(x.grade_levels) > 0
          
          UNION ALL
          
          SELECT 
            p.id as personnel_id,
            x.grade_levels,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn
          WHERE x.grade_levels IS NOT NULL AND jsonb_array_length(x.grade_levels) > 0

          UNION ALL

          SELECT 
            p.id as personnel_id,
            x.grade_levels,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
          WHERE x.grade_levels IS NOT NULL AND jsonb_array_length(x.grade_levels) > 0
        ),
        deduped AS (
          SELECT DISTINCT ON (personnel_id)
            personnel_id, grade_levels
          FROM resolved
          ORDER BY personnel_id, priority ASC
        )
        UPDATE esf7_personnel_employment e
        SET 
          grade_levels_taught = (
            SELECT jsonb_agg(DISTINCT elem)
            FROM (
              SELECT jsonb_array_elements_text(COALESCE(e.grade_levels_taught, '[]'::jsonb)) as elem
              UNION
              SELECT jsonb_array_elements_text(d.grade_levels) as elem
            ) sub
            WHERE elem IS NOT NULL AND elem <> ''
          ),
          updated_at = NOW()
        FROM deduped d
        WHERE e.personnel_id = d.personnel_id
          AND (
            e.grade_levels_taught IS NULL 
            OR e.grade_levels_taught = '[]'::jsonb 
            OR NOT (e.grade_levels_taught @> d.grade_levels)
          );
      `,
        [schoolIds, schoolYears],
      );

      const updatedCount = updateBatch.rowCount || 0;
      totalUpdatedFromDrafts += updatedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Drafts Batch ${batchNum}/${totalDraftBatches}] Processed ${batchKeys.length} drafts -> ${updatedCount} employment records updated (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 1 Complete! Total employment records updated from school_drafts: ${totalUpdatedFromDrafts.toLocaleString()}`,
    );

    // Step 4: Pass 2 - Process esf7_room_roster_cache
    console.log(
      "\n[Step 4/5] PASS 2: Extracting & merging grade_levels_taught from esf7_room_roster_cache...",
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
            COALESCE(
              CASE 
                WHEN jsonb_typeof(p->'grade_levels_taught') = 'array' AND jsonb_array_length(p->'grade_levels_taught') > 0 THEN p->'grade_levels_taught'
                WHEN jsonb_typeof(p->'gradeLevelsTaught') = 'array' AND jsonb_array_length(p->'gradeLevelsTaught') > 0 THEN p->'gradeLevelsTaught'
                WHEN jsonb_typeof(p->'grade_level_taught') = 'array' AND jsonb_array_length(p->'grade_level_taught') > 0 THEN p->'grade_level_taught'
                WHEN p->>'grade_levels_taught' IS NOT NULL AND TRIM(p->>'grade_levels_taught') NOT IN ('', '[]', 'null') 
                  THEN to_jsonb(string_to_array(p->>'grade_levels_taught', ','))
                WHEN p->>'gradeLevelsTaught' IS NOT NULL AND TRIM(p->>'gradeLevelsTaught') NOT IN ('', '[]', 'null') 
                  THEN to_jsonb(string_to_array(p->>'gradeLevelsTaught', ','))
                ELSE NULL
              END,
              (
                SELECT jsonb_agg(DISTINCT TRIM(elem->>'gradeLevel'))
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p->'workloadRows') = 'array' THEN p->'workloadRows' ELSE '[]'::jsonb END
                ) elem
                WHERE NULLIF(TRIM(elem->>'gradeLevel'), '') IS NOT NULL
              )
            ) as grade_levels
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.grade_levels,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          WHERE x.grade_levels IS NOT NULL AND jsonb_array_length(x.grade_levels) > 0
          
          UNION ALL
          
          SELECT 
            p.id as personnel_id,
            x.grade_levels,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn
          WHERE x.grade_levels IS NOT NULL AND jsonb_array_length(x.grade_levels) > 0

          UNION ALL

          SELECT 
            p.id as personnel_id,
            x.grade_levels,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
          WHERE x.grade_levels IS NOT NULL AND jsonb_array_length(x.grade_levels) > 0
        ),
        deduped AS (
          SELECT DISTINCT ON (personnel_id)
            personnel_id, grade_levels
          FROM resolved
          ORDER BY personnel_id, priority ASC
        )
        UPDATE esf7_personnel_employment e
        SET 
          grade_levels_taught = (
            SELECT jsonb_agg(DISTINCT elem)
            FROM (
              SELECT jsonb_array_elements_text(COALESCE(e.grade_levels_taught, '[]'::jsonb)) as elem
              UNION
              SELECT jsonb_array_elements_text(d.grade_levels) as elem
            ) sub
            WHERE elem IS NOT NULL AND elem <> ''
          ),
          updated_at = NOW()
        FROM deduped d
        WHERE e.personnel_id = d.personnel_id
          AND (
            e.grade_levels_taught IS NULL 
            OR e.grade_levels_taught = '[]'::jsonb 
            OR NOT (e.grade_levels_taught @> d.grade_levels)
          );
      `,
        [batchIds],
      );

      const updatedCount = updateBatch.rowCount || 0;
      totalUpdatedFromCache += updatedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Cache Batch ${batchNum}/${totalCacheBatches}] Processed ${batchIds.length} schools -> ${updatedCount} employment records updated (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 2 Complete! Total employment records updated from esf7_room_roster_cache: ${totalUpdatedFromCache.toLocaleString()}`,
    );

    // Step 5: Post-execution stats & verification
    console.log(
      "\n[Step 5/5] Post-execution verification in esf7_personnel_employment...",
    );
    const postCountRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment;",
    );
    const postTotal = parseInt(postCountRes.rows[0].count, 10);

    const postGltRes = await client.query(`
      SELECT 
        count(CASE WHEN jsonb_typeof(grade_levels_taught) = 'array' AND jsonb_array_length(grade_levels_taught) > 0 THEN 1 END) as populated,
        count(CASE WHEN grade_levels_taught IS NULL OR grade_levels_taught = '[]'::jsonb THEN 1 END) as empty
      FROM esf7_personnel_employment;
    `);
    const postPopulated = parseInt(postGltRes.rows[0].populated, 10);
    const postEmpty = parseInt(postGltRes.rows[0].empty, 10);
    const netPopulated = postPopulated - prePopulated;

    console.log(
      `   - Total personnel employment records: ${postTotal.toLocaleString()} (Must equal ${preTotal.toLocaleString()})`,
    );
    console.log(`   - Previously populated: ${prePopulated.toLocaleString()}`);
    console.log(`   - Newly populated:      ${postPopulated.toLocaleString()}`);
    console.log(
      `   - Net gain in coverage: +${netPopulated.toLocaleString()} personnel`,
    );
    console.log(`   - Remaining empty/null: ${postEmpty.toLocaleString()}`);

    if (postTotal !== preTotal) {
      throw new Error(
        `CRITICAL INTEGRITY FAILURE: Table row count changed from ${preTotal} to ${postTotal}!`,
      );
    }

    console.log("\n--- Sample of newly updated grade_levels_taught ---");
    const sampleUpdated = await client.query(`
      SELECT e.id, e.personnel_id, prof.school_id, prof.first_name, prof.last_name, e.grade_levels_taught
      FROM esf7_personnel_employment e
      JOIN esf7_personnel_profile prof ON e.personnel_id = prof.id
      WHERE jsonb_typeof(e.grade_levels_taught) = 'array' 
        AND jsonb_array_length(e.grade_levels_taught) > 0
      ORDER BY e.updated_at DESC
      LIMIT 5;
    `);
    console.table(
      sampleUpdated.rows.map((r) => ({
        personnel_id: r.personnel_id,
        school_id: r.school_id,
        name: `${r.first_name} ${r.last_name}`,
        grade_levels_taught: JSON.stringify(r.grade_levels_taught),
      })),
    );

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(
      `🎉 GRADE LEVELS TAUGHT PLOTTED SUCCESSFULLY in ${totalSeconds}s!`,
    );
    console.log(
      `   - Pass 1 (school_drafts):        ${totalUpdatedFromDrafts.toLocaleString()} records updated`,
    );
    console.log(
      `   - Pass 2 (esf7_room_roster_cache): ${totalUpdatedFromCache.toLocaleString()} records updated`,
    );
    console.log(
      `   - Net Newly Populated Personnel:  +${netPopulated.toLocaleString()}`,
    );
    console.log(
      `   - Zero Deletions: Verified! Total rows preserved: exactly ${postTotal.toLocaleString()}`,
    );
    console.log(
      "================================================================================",
    );
  } catch (err) {
    console.error("❌ Error during grade levels execution:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

plotGradeLevelsTaught().catch((err) => {
  console.error(err);
  process.exit(1);
});
