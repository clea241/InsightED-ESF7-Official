/**
 * Clean Slate Rebuild of esf7_personnel_ld_trainings from authentic personnel profiles
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Drops `raw_payload` column as requested by user.
 * - Ingests all authentic NEAP and Division/Other training records.
 * - Links directly via `personnel_id = esf7_personnel_profile.id`.
 * - Sequential primary key IDs '1' to 'N'.
 * - Creates alias views for 'esf7_personnel_ld' and 'esf7_personnel_l&d' for DBeaver convenience.
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
    console.log("⚡ CLEAN SLATE REBUILD: esf7_personnel_ld_trainings");
    console.log("==========================================================");

    // 1. Create safety backup
    console.log("\n[Step 1/5] Creating safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_ld_trainings_backup_20261013 AS
      SELECT * FROM esf7_personnel_ld_trainings;
    `);
    const backupCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_ld_trainings_backup_20261013",
    );
    console.log(
      `  ✓ Safety backup ready with ${backupCount.rows[0].count} rows.`,
    );

    // 2. Drop raw_payload column
    console.log(
      "\n[Step 2/5] Dropping raw_payload column from esf7_personnel_ld_trainings...",
    );
    await client.query(
      "ALTER TABLE esf7_personnel_ld_trainings DROP COLUMN IF EXISTS raw_payload;",
    );
    console.log("  ✓ raw_payload column dropped.");

    // 3. Truncate table
    console.log("\n[Step 3/5] Truncating esf7_personnel_ld_trainings...");
    await client.query("TRUNCATE TABLE esf7_personnel_ld_trainings;");
    console.log("  ✓ Table cleanly truncated.");

    // 4. Ingest unnested training records
    console.log("\n[Step 4/5] Ingesting authentic L&D training records...");
    const tInsert = Date.now();

    const insertRes = await client.query(`
      WITH unnested_trainings AS (
        -- NEAP trainings
        SELECT 
          p.id as personnel_id,
          'NEAP' as training_type,
          TRIM(UPPER(COALESCE(elem->>'title', ''))) as title,
          TRIM(UPPER(COALESCE(elem->>'conductor', elem->>'provider', 'NEAP'))) as conductor,
          safe_cast_date(elem->>'startDate') as start_date,
          safe_cast_date(elem->>'endDate') as end_date,
          CASE WHEN elem->>'days' ~ '^[0-9]+$' THEN (elem->>'days')::integer ELSE NULL END as days,
          CASE WHEN elem->>'totalHours' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'totalHours')::numeric ELSE NULL END as total_hours
        FROM esf7_personnel_profile p,
        jsonb_array_elements(CASE WHEN jsonb_typeof(p.raw_payload->'neapTrainingRows') = 'array' THEN p.raw_payload->'neapTrainingRows' ELSE '[]'::jsonb END) elem
        WHERE jsonb_typeof(p.raw_payload->'neapTrainingRows') = 'array' 
          AND jsonb_array_length(p.raw_payload->'neapTrainingRows') > 0
          AND TRIM(COALESCE(elem->>'title', '')) <> ''

        UNION ALL

        -- Other trainings
        SELECT 
          p.id as personnel_id,
          CASE WHEN elem->>'title' ILIKE '%TESDA%' THEN 'TESDA' ELSE 'OTHER' END as training_type,
          TRIM(UPPER(COALESCE(elem->>'title', ''))) as title,
          TRIM(UPPER(COALESCE(elem->>'conductor', elem->>'provider', ''))) as conductor,
          safe_cast_date(elem->>'startDate') as start_date,
          safe_cast_date(elem->>'endDate') as end_date,
          CASE WHEN elem->>'days' ~ '^[0-9]+$' THEN (elem->>'days')::integer ELSE NULL END as days,
          CASE WHEN elem->>'totalHours' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'totalHours')::numeric ELSE NULL END as total_hours
        FROM esf7_personnel_profile p,
        jsonb_array_elements(CASE WHEN jsonb_typeof(p.raw_payload->'otherTrainingRows') = 'array' THEN p.raw_payload->'otherTrainingRows' ELSE '[]'::jsonb END) elem
        WHERE jsonb_typeof(p.raw_payload->'otherTrainingRows') = 'array' 
          AND jsonb_array_length(p.raw_payload->'otherTrainingRows') > 0
          AND TRIM(COALESCE(elem->>'title', '')) <> ''
      ),
      numbered_trainings AS (
        SELECT 
          ROW_NUMBER() OVER (ORDER BY personnel_id::bigint ASC, start_date ASC NULLS LAST, title ASC)::text as id,
          personnel_id,
          training_type,
          title,
          conductor,
          start_date,
          end_date,
          days,
          total_hours,
          NOW() as created_at,
          NOW() as updated_at
        FROM unnested_trainings
      )
      INSERT INTO esf7_personnel_ld_trainings (
        id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours, created_at, updated_at
      )
      SELECT * FROM numbered_trainings;
    `);

    console.log(
      `  ✓ Inserted ${insertRes.rowCount} training records in ${((Date.now() - tInsert) / 1000).toFixed(1)}s!`,
    );

    // 5. Create alias views
    console.log(
      "\n[Step 5/5] Creating alias views 'esf7_personnel_ld' and 'esf7_personnel_l&d' for DBeaver...",
    );
    await client.query(
      `CREATE OR REPLACE VIEW esf7_personnel_ld AS SELECT * FROM esf7_personnel_ld_trainings;`,
    );
    await client.query(
      `CREATE OR REPLACE VIEW "esf7_personnel_l&d" AS SELECT * FROM esf7_personnel_ld_trainings;`,
    );
    console.log("  ✓ Alias views created successfully.");

    // Verification
    const countRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_ld_trainings",
    );
    const teachersCount = await client.query(
      "SELECT count(distinct personnel_id) FROM esf7_personnel_ld_trainings",
    );
    const minMaxRes = await client.query(
      "SELECT min(id::bigint) as min_id, max(id::bigint) as max_id FROM esf7_personnel_ld_trainings",
    );

    const rawColCheck = await client.query(`
      SELECT count(*) 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_ld_trainings' AND column_name = 'raw_payload';
    `);

    const first5 = await client.query(`
      SELECT id, personnel_id, training_type, title, start_date, end_date, total_hours
      FROM esf7_personnel_ld_trainings
      ORDER BY id::bigint ASC
      LIMIT 5;
    `);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n==========================================================");
    console.log(`🎉 REBUILD COMPLETE IN ${totalDuration}s!`);
    console.log(`✓ Total L&D Training Records: ${countRes.rows[0].count}`);
    console.log(`✓ Teachers with Trainings: ${teachersCount.rows[0].count}`);
    console.log(
      `✓ ID Range: ${minMaxRes.rows[0].min_id} to ${minMaxRes.rows[0].max_id}`,
    );
    console.log(
      `✓ raw_payload column dropped: ${rawColCheck.rows[0].count === "0" ? "YES" : "NO"}`,
    );
    console.log("==========================================================");

    console.log("\nSample training records:");
    console.table(first5.rows);
  } catch (err) {
    console.error("FATAL ERROR DURING L&D TRAININGS REBUILD:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
