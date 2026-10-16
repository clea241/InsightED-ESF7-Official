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

async function plotPhase3LdTrainings() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log(
      "🚀 PHASE 3: PLOTTING L&D TRAININGS FROM school_drafts & esf7_room_roster_cache",
    );
    console.log(
      "   Target Table: esf7_personnel_ld_trainings (insighted_esf7)",
    );
    console.log(
      "   Safety Policy: ADDITIVE INSERT (DEDUPLICATED) - ZERO DELETIONS",
    );
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    console.log(
      "\n[Step 1/6] Pre-execution stats in esf7_personnel_ld_trainings...",
    );
    const preCountRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_ld_trainings;",
    );
    const preTotal = parseInt(preCountRes.rows[0].count, 10);
    console.log(`   - Current total trainings: ${preTotal.toLocaleString()}`);

    const maxIdRes = await client.query(`
      SELECT max(CASE WHEN id ~ '^[0-9]+$' THEN id::bigint ELSE 0 END) as max_id
      FROM esf7_personnel_ld_trainings;
    `);
    let currentMaxId = parseInt(maxIdRes.rows[0].max_id || "0", 10);
    console.log(
      `   - Current max numeric ID: ${currentMaxId.toLocaleString()}`,
    );

    // Step 2: Dedicated safety backup table
    console.log("\n[Step 2/6] Creating dedicated safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_ld_trainings_backup_phase3 AS
      SELECT * FROM esf7_personnel_ld_trainings;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_ld_trainings_backup_phase3;",
    );
    console.log(
      `   ✓ Backup verified: ${parseInt(backupRes.rows[0].count, 10).toLocaleString()} rows preserved in 'esf7_personnel_ld_trainings_backup_phase3'.`,
    );

    // Step 3: Pass 1 - Process school_drafts
    console.log(
      "\n[Step 3/6] PASS 1: Extracting & inserting missing trainings from school_drafts...",
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
          SELECT d.school_id, d.payload
          FROM school_drafts d
          JOIN UNNEST($1::text[], $2::text[]) AS k(s_id, s_yr)
            ON d.school_id = k.s_id AND d.school_year = k.s_yr
        ),
        extracted_raw AS (
          SELECT 
            REPLACE(d.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            'NEAP' as training_type,
            TRIM(UPPER(COALESCE(elem->>'title', ''))) as title,
            TRIM(UPPER(COALESCE(elem->>'conductor', elem->>'provider', 'NEAP'))) as conductor,
            CASE 
              WHEN elem->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'startDate')::date
              WHEN elem->>'startDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'startDate', 'MM/DD/YYYY')
              ELSE NULL
            END as start_date,
            CASE 
              WHEN elem->>'endDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'endDate')::date
              WHEN elem->>'endDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'endDate', 'MM/DD/YYYY')
              ELSE NULL
            END as end_date,
            CASE WHEN elem->>'days' ~ '^[0-9]+$' THEN (elem->>'days')::integer ELSE NULL END as days,
            CASE WHEN elem->>'totalHours' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'totalHours')::numeric ELSE NULL END as total_hours
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel' ELSE '[]'::jsonb END
          ) p,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(p->'neapTrainingRows') = 'array' THEN p->'neapTrainingRows' ELSE '[]'::jsonb END
          ) elem
          WHERE TRIM(COALESCE(elem->>'title', '')) <> ''

          UNION ALL

          SELECT 
            REPLACE(d.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            CASE WHEN elem->>'title' ILIKE '%TESDA%' THEN 'TESDA' ELSE 'OTHER' END as training_type,
            TRIM(UPPER(COALESCE(elem->>'title', ''))) as title,
            TRIM(UPPER(COALESCE(elem->>'conductor', elem->>'provider', ''))) as conductor,
            CASE 
              WHEN elem->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'startDate')::date
              WHEN elem->>'startDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'startDate', 'MM/DD/YYYY')
              ELSE NULL
            END as start_date,
            CASE 
              WHEN elem->>'endDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'endDate')::date
              WHEN elem->>'endDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'endDate', 'MM/DD/YYYY')
              ELSE NULL
            END as end_date,
            CASE WHEN elem->>'days' ~ '^[0-9]+$' THEN (elem->>'days')::integer ELSE NULL END as days,
            CASE WHEN elem->>'totalHours' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'totalHours')::numeric ELSE NULL END as total_hours
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel' ELSE '[]'::jsonb END
          ) p,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(p->'otherTrainingRows') = 'array' THEN p->'otherTrainingRows' ELSE '[]'::jsonb END
          ) elem
          WHERE TRIM(COALESCE(elem->>'title', '')) <> ''
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.training_type, x.title, x.conductor, x.start_date, x.end_date, x.days, x.total_hours,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          -- Priority 2: DepEd PRN
          SELECT 
            p.id as personnel_id,
            x.training_type, x.title, x.conductor, x.start_date, x.end_date, x.days, x.total_hours,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn

          UNION ALL

          -- Priority 3: Same School + Full Name
          SELECT 
            p.id as personnel_id,
            x.training_type, x.title, x.conductor, x.start_date, x.end_date, x.days, x.total_hours,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped_candidates AS (
          SELECT DISTINCT ON (personnel_id, title)
            personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours
          FROM resolved
          ORDER BY personnel_id, title, priority ASC
        ),
        missing_trainings AS (
          SELECT d.*
          FROM deduped_candidates d
          WHERE NOT EXISTS (
            SELECT 1 FROM esf7_personnel_ld_trainings ex
            WHERE ex.personnel_id = d.personnel_id
              AND UPPER(TRIM(ex.title)) = UPPER(TRIM(d.title))
          )
        )
        INSERT INTO esf7_personnel_ld_trainings (
          id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours, created_at, updated_at
        )
        SELECT 
          ($3 + ROW_NUMBER() OVER (ORDER BY personnel_id, title))::text as id,
          personnel_id,
          training_type,
          title,
          conductor,
          start_date,
          end_date,
          days,
          total_hours,
          NOW(),
          NOW()
        FROM missing_trainings;
      `,
        [schoolIds, schoolYears, currentMaxId],
      );

      const insertedCount = insertBatch.rowCount || 0;
      totalInsertedFromDrafts += insertedCount;
      currentMaxId += insertedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Drafts Batch ${batchNum}/${totalDraftBatches}] Processed ${batchKeys.length} drafts -> ${insertedCount} trainings inserted (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 1 Complete! Total trainings inserted from school_drafts: ${totalInsertedFromDrafts.toLocaleString()}`,
    );

    // Step 4: Pass 2 - Process esf7_room_roster_cache
    console.log(
      "\n[Step 4/6] PASS 2: Extracting & inserting missing trainings from esf7_room_roster_cache...",
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
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            'NEAP' as training_type,
            TRIM(UPPER(COALESCE(elem->>'title', ''))) as title,
            TRIM(UPPER(COALESCE(elem->>'conductor', elem->>'provider', 'NEAP'))) as conductor,
            CASE 
              WHEN elem->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'startDate')::date
              WHEN elem->>'startDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'startDate', 'MM/DD/YYYY')
              ELSE NULL
            END as start_date,
            CASE 
              WHEN elem->>'endDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'endDate')::date
              WHEN elem->>'endDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'endDate', 'MM/DD/YYYY')
              ELSE NULL
            END as end_date,
            CASE WHEN elem->>'days' ~ '^[0-9]+$' THEN (elem->>'days')::integer ELSE NULL END as days,
            CASE WHEN elem->>'totalHours' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'totalHours')::numeric ELSE NULL END as total_hours
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(p->'neapTrainingRows') = 'array' THEN p->'neapTrainingRows' ELSE '[]'::jsonb END
          ) elem
          WHERE TRIM(COALESCE(elem->>'title', '')) <> ''

          UNION ALL

          SELECT 
            REPLACE(c.school_id, 'SCH-', '') as school_id,
            p->>'id' as d_id,
            NULLIF(TRIM(p->>'prn'), '') as d_prn,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
            CASE WHEN elem->>'title' ILIKE '%TESDA%' THEN 'TESDA' ELSE 'OTHER' END as training_type,
            TRIM(UPPER(COALESCE(elem->>'title', ''))) as title,
            TRIM(UPPER(COALESCE(elem->>'conductor', elem->>'provider', ''))) as conductor,
            CASE 
              WHEN elem->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'startDate')::date
              WHEN elem->>'startDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'startDate', 'MM/DD/YYYY')
              ELSE NULL
            END as start_date,
            CASE 
              WHEN elem->>'endDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'endDate')::date
              WHEN elem->>'endDate' ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(elem->>'endDate', 'MM/DD/YYYY')
              ELSE NULL
            END as end_date,
            CASE WHEN elem->>'days' ~ '^[0-9]+$' THEN (elem->>'days')::integer ELSE NULL END as days,
            CASE WHEN elem->>'totalHours' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'totalHours')::numeric ELSE NULL END as total_hours
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(p->'otherTrainingRows') = 'array' THEN p->'otherTrainingRows' ELSE '[]'::jsonb END
          ) elem
          WHERE TRIM(COALESCE(elem->>'title', '')) <> ''
        ),
        resolved AS (
          SELECT 
            p.id as personnel_id,
            x.training_type, x.title, x.conductor, x.start_date, x.end_date, x.days, x.total_hours,
            1 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          -- Priority 2: DepEd PRN
          SELECT 
            p.id as personnel_id,
            x.training_type, x.title, x.conductor, x.start_date, x.end_date, x.days, x.total_hours,
            2 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn

          UNION ALL

          -- Priority 3: Same School + Full Name
          SELECT 
            p.id as personnel_id,
            x.training_type, x.title, x.conductor, x.start_date, x.end_date, x.days, x.total_hours,
            3 as priority
          FROM extracted_raw x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        deduped_candidates AS (
          SELECT DISTINCT ON (personnel_id, title)
            personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours
          FROM resolved
          ORDER BY personnel_id, title, priority ASC
        ),
        missing_trainings AS (
          SELECT d.*
          FROM deduped_candidates d
          WHERE NOT EXISTS (
            SELECT 1 FROM esf7_personnel_ld_trainings ex
            WHERE ex.personnel_id = d.personnel_id
              AND UPPER(TRIM(ex.title)) = UPPER(TRIM(d.title))
          )
        )
        INSERT INTO esf7_personnel_ld_trainings (
          id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours, created_at, updated_at
        )
        SELECT 
          ($2 + ROW_NUMBER() OVER (ORDER BY personnel_id, title))::text as id,
          personnel_id,
          training_type,
          title,
          conductor,
          start_date,
          end_date,
          days,
          total_hours,
          NOW(),
          NOW()
        FROM missing_trainings;
      `,
        [batchIds, currentMaxId],
      );

      const insertedCount = insertBatch.rowCount || 0;
      totalInsertedFromCache += insertedCount;
      currentMaxId += insertedCount;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Cache Batch ${batchNum}/${totalCacheBatches}] Processed ${batchIds.length} schools -> ${insertedCount} trainings inserted (${duration}s)`,
      );
    }

    console.log(
      `   ✓ Pass 2 Complete! Total trainings inserted from room_roster_cache: ${totalInsertedFromCache.toLocaleString()}`,
    );

    // Step 5: Refresh alias views
    console.log(
      "\n[Step 5/6] Refreshing alias views 'esf7_personnel_ld' and 'esf7_personnel_l&d'...",
    );
    await client.query(
      `CREATE OR REPLACE VIEW esf7_personnel_ld AS SELECT * FROM esf7_personnel_ld_trainings;`,
    );
    await client.query(
      `CREATE OR REPLACE VIEW "esf7_personnel_l&d" AS SELECT * FROM esf7_personnel_ld_trainings;`,
    );
    console.log("   ✓ Alias views refreshed.");

    // Step 6: Post-execution stats & verification
    console.log("\n[Step 6/6] Post-execution verification & auditing...");
    const postCountRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_ld_trainings;",
    );
    const postTotal = parseInt(postCountRes.rows[0].count, 10);

    console.log(`   - Previous trainings count: ${preTotal.toLocaleString()}`);
    console.log(
      `   - Post total trainings count: ${postTotal.toLocaleString()} (+${(postTotal - preTotal).toLocaleString()} new authentic records)`,
    );

    // Sample 5 newly inserted records
    const sampleRes = await client.query(`
      SELECT 
        t.id,
        t.personnel_id,
        p.first_name,
        p.last_name,
        p.school_id,
        t.training_type,
        t.title,
        t.start_date,
        t.end_date,
        t.days,
        t.total_hours
      FROM esf7_personnel_ld_trainings t
      JOIN esf7_personnel_profile p ON p.id = t.personnel_id
      WHERE t.id::bigint > ${preTotal}
      ORDER BY t.id::bigint DESC
      LIMIT 5;
    `);

    console.log("\nSample 5 newly inserted training records:");
    console.table(
      sampleRes.rows.map((r) => ({
        ID: r.id,
        Personnel: `${r.first_name} ${r.last_name}`,
        School: r.school_id,
        Type: r.training_type,
        Title: r.title.substring(0, 45) + (r.title.length > 45 ? "..." : ""),
        Start: r.start_date ? r.start_date.toISOString().split("T")[0] : "N/A",
        End: r.end_date ? r.end_date.toISOString().split("T")[0] : "N/A",
        Days: r.days,
        Hours: r.total_hours,
      })),
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(
      `🎉 SUCCESS! Completed Phase 3 L&D Trainings Ingestion in ${elapsed}s`,
    );
    console.log(
      `   - Added from school_drafts: ${totalInsertedFromDrafts.toLocaleString()}`,
    );
    console.log(
      `   - Added from room_roster_cache: ${totalInsertedFromCache.toLocaleString()}`,
    );
    console.log(
      `   - Total Net Trainings Growth: +${(postTotal - preTotal).toLocaleString()}`,
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

plotPhase3LdTrainings().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
