/**
 * Clean Slate Rebuild of esf7_personnel_learning_areas from authentic school_drafts and profiles
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Option A: 1:1 with id = personnel_id (1 to 351,762).
 * - Drops `raw_payload` column as requested by user.
 * - Extracts authentic learningAreaMap / matrix_data from school_drafts and profiles.
 * - Preserves FOREIGN KEY and UNIQUE(personnel_id) constraints.
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
    console.log(
      "⚡ CLEAN SLATE REBUILD: esf7_personnel_learning_areas (Option A)",
    );
    console.log("==========================================================");

    // 1. Create safety backup
    console.log("1. Creating safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_learning_areas_backup_20261013 AS 
      SELECT * FROM esf7_personnel_learning_areas;
    `);
    console.log("   ✅ Safety backup ensured.");

    // 2. Drop raw_payload column
    console.log("2. Dropping raw_payload column...");
    await client.query(`
      ALTER TABLE esf7_personnel_learning_areas DROP COLUMN IF EXISTS raw_payload;
    `);
    console.log("   ✅ Dropped raw_payload column.");

    // 3. Truncate table
    console.log("3. Truncating esf7_personnel_learning_areas...");
    await client.query(`TRUNCATE TABLE esf7_personnel_learning_areas;`);
    console.log("   ✅ Table truncated.");

    // 4. Initial insert: 1:1 from esf7_personnel_profile using profile payload
    console.log(
      "4. Ingesting base records (id = personnel_id) from esf7_personnel_profile...",
    );
    const baseInsert = await client.query(`
      INSERT INTO esf7_personnel_learning_areas (
        id,
        personnel_id,
        matrix_data,
        created_at,
        updated_at
      )
      SELECT
        p.id,
        p.id,
        COALESCE(
          NULLIF(p.raw_payload->'learningAreaMap', '{}'::jsonb),
          NULLIF(p.raw_payload->'matrix_data', '{}'::jsonb),
          NULLIF(p.raw_payload->'matrixData', '{}'::jsonb),
          '{}'::jsonb
        ),
        NOW(),
        NOW()
      FROM esf7_personnel_profile p;
    `);
    console.log(
      `   ✅ Inserted ${baseInsert.rowCount} base personnel rows into esf7_personnel_learning_areas.`,
    );

    // 5. Overlay latest maps from school_drafts for schools with active drafts
    console.log(
      "5. Overlaying latest authentic learningAreaMap from school_drafts...",
    );
    const overlayResult = await client.query(`
      WITH draft_teachers AS (
        SELECT 
          d.school_id,
          elem->>'prn' as raw_prn,
          COALESCE(
            NULLIF(elem->'learningAreaMap', '{}'::jsonb),
            NULLIF(elem->'matrix_data', '{}'::jsonb)
          ) as draft_matrix
        FROM school_drafts d,
             jsonb_array_elements(d.payload->'personnel') elem
        WHERE (elem->'learningAreaMap' IS NOT NULL AND elem->'learningAreaMap' != '{}'::jsonb)
           OR (elem->'matrix_data' IS NOT NULL AND elem->'matrix_data' != '{}'::jsonb)
      ),
      matched_updates AS (
        SELECT 
          p.id as personnel_id,
          dt.draft_matrix
        FROM draft_teachers dt
        JOIN esf7_personnel_profile p 
          ON p.school_id = dt.school_id 
         AND (
           p.raw_payload->>'prn' = dt.raw_prn
           OR p.raw_payload->>'original_prn' = dt.raw_prn
           OR p.prn = dt.raw_prn
           OR p.prn = 'PRN-' || LPAD(REGEXP_REPLACE(dt.raw_prn, '^PRN-?', '', 'i'), 7, '0')
         )
      )
      UPDATE esf7_personnel_learning_areas la
      SET matrix_data = mu.draft_matrix,
          updated_at = NOW()
      FROM matched_updates mu
      WHERE la.personnel_id = mu.personnel_id
        AND la.matrix_data = '{}'::jsonb;
    `);
    console.log(
      `   ✅ Overlaid ${overlayResult.rowCount} additional active drafts from school_drafts.`,
    );

    // 6. Verification
    const countCheck = await client.query(
      `SELECT count(*) FROM esf7_personnel_learning_areas;`,
    );
    const populatedCheck = await client.query(`
      SELECT count(*) FROM esf7_personnel_learning_areas 
      WHERE matrix_data IS NOT NULL AND matrix_data != '{}'::jsonb;
    `);
    const colsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_learning_areas' 
      ORDER BY ordinal_position;
    `);
    const sampleCheck = await client.query(`
      SELECT id, personnel_id, matrix_data 
      FROM esf7_personnel_learning_areas 
      WHERE matrix_data != '{}'::jsonb 
      LIMIT 2;
    `);

    console.log("==========================================================");
    console.log(
      `🎉 SUCCESS in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
    );
    console.log(`- Total Records: ${countCheck.rows[0].count}`);
    console.log(`- Populated Matrices: ${populatedCheck.rows[0].count}`);
    console.log(
      `- Columns: ${colsCheck.rows.map((r) => r.column_name).join(", ")}`,
    );
    console.log(
      `- Sample Populated Matrix:\n`,
      JSON.stringify(sampleCheck.rows[0], null, 2),
    );
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
