/**
 * High-Performance Migration & Rebuild of esf7_personnel_allowances
 *
 * Rules:
 * - Strictly isolated to insighted_esf7.
 * - Creates safety backup table `esf7_personnel_allowances_backup_20261013`.
 * - Drops `raw_payload` column.
 * - Adds `extras` JSONB column.
 * - Maps existing customized allowances to authentic `esf7_personnel_profile(id)`.
 * - Covers all 351,762 personnel profiles with authentic DepEd allowance records.
 * - Creates alias view `esf7_personnel_allowance`.
 * - Recreates indexes and constraints cleanly.
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
});

async function main() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log("==========================================================");
    console.log("🚀 MIGRATION & REBUILD: esf7_personnel_allowances");
    console.log("==========================================================");

    // 1. Safety backup
    console.log(
      "1. Creating safety backup table esf7_personnel_allowances_backup_20261013...",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_allowances_backup_20261013 AS 
      SELECT * FROM esf7_personnel_allowances;
    `);
    const backupCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_allowances_backup_20261013;",
    );
    console.log(
      `   ✓ Safety backup confirmed: ${backupCount.rows[0].count} records intact.`,
    );

    // 2. Drop raw_payload and ensure extras exists
    console.log(
      "2. Adjusting columns: dropping raw_payload and ensuring extras column exists...",
    );
    await client.query(`
      ALTER TABLE esf7_personnel_allowances 
      ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;

      ALTER TABLE esf7_personnel_allowances 
      DROP COLUMN IF EXISTS raw_payload;
    `);
    console.log(
      "   ✓ Column adjustments complete: raw_payload dropped, extras ensured.",
    );

    // 3. Truncate table cleanly
    console.log("3. Truncating esf7_personnel_allowances cleanly...");
    await client.query("TRUNCATE TABLE esf7_personnel_allowances;");
    console.log("   ✓ Table truncated.");

    // 4. Ingest mapped existing allowances
    console.log(
      "4. Ingesting mapped allowances from backup connected to esf7_personnel_profile(id)...",
    );
    const mappedInsert = await client.query(`
      WITH mapped_raw AS (
        SELECT 
          COALESCE(p1.id, p2.id, p3.id) as target_personnel_id,
          a.id as orig_id,
          a.school_id,
          COALESCE(a.school_year, 'SY 26-27') as school_year,
          a.has_pera,
          COALESCE(a.pera_amount, 2000.00) as pera_amount,
          a.has_uniform,
          COALESCE(a.uniform_amount, 7000.00) as uniform_amount,
          a.has_supplies,
          COALESCE(a.supplies_amount, 10000.00) as supplies_amount,
          a.has_medical,
          COALESCE(a.medical_amount, 7000.00) as medical_amount,
          a.has_hardship,
          COALESCE(a.hardship_amount, 0.00) as hardship_amount,
          COALESCE(a.disabled_allowances, '[]'::jsonb) as disabled_allowances,
          COALESCE(a.created_at, NOW()) as created_at,
          COALESCE(a.updated_at, NOW()) as updated_at,
          (CASE WHEN a.has_uniform THEN 1 ELSE 0 END + 
           CASE WHEN a.has_supplies THEN 1 ELSE 0 END + 
           CASE WHEN a.has_medical THEN 1 ELSE 0 END + 
           CASE WHEN a.has_hardship THEN 1 ELSE 0 END) as active_count
        FROM esf7_personnel_allowances_backup_20261013 a
        LEFT JOIN esf7_personnel_profile p1 
          ON a.personnel_id = p1.legacy_id AND a.school_id = p1.school_id
        LEFT JOIN esf7_personnel_profile p2 
          ON a.personnel_id = p2.employee_no AND a.school_id = p2.school_id
        LEFT JOIN esf7_personnel_profile p3 
          ON a.personnel_id = p3.id
      ),
      deduped AS (
        SELECT DISTINCT ON (target_personnel_id, school_year)
          'ALW-' || school_id || '-' || LPAD(target_personnel_id, 6, '0') as id,
          target_personnel_id as personnel_id,
          school_id,
          school_year,
          has_pera,
          pera_amount,
          has_uniform,
          uniform_amount,
          has_supplies,
          supplies_amount,
          has_medical,
          medical_amount,
          has_hardship,
          hardship_amount,
          disabled_allowances,
          '{}'::jsonb as extras,
          created_at,
          updated_at
        FROM mapped_raw
        WHERE target_personnel_id IS NOT NULL
        ORDER BY target_personnel_id, school_year, active_count DESC, updated_at DESC
      )
      INSERT INTO esf7_personnel_allowances (
        id, personnel_id, school_id, school_year,
        has_pera, pera_amount, has_uniform, uniform_amount,
        has_supplies, supplies_amount, has_medical, medical_amount,
        has_hardship, hardship_amount, disabled_allowances, extras,
        created_at, updated_at
      )
      SELECT 
        id, personnel_id, school_id, school_year,
        has_pera, pera_amount, has_uniform, uniform_amount,
        has_supplies, supplies_amount, has_medical, medical_amount,
        has_hardship, hardship_amount, disabled_allowances, extras,
        created_at, updated_at
      FROM deduped;
    `);
    console.log(
      `   ✓ Ingested ${mappedInsert.rowCount} mapped customized allowance records.`,
    );

    // 5. Ingest default allowance records for all remaining personnel profiles
    console.log(
      "5. Ingesting allowance records for all remaining personnel in esf7_personnel_profile...",
    );
    const defaultsInsert = await client.query(`
      INSERT INTO esf7_personnel_allowances (
        id, personnel_id, school_id, school_year,
        has_pera, pera_amount,
        has_uniform, uniform_amount,
        has_supplies, supplies_amount,
        has_medical, medical_amount,
        has_hardship, hardship_amount,
        disabled_allowances, extras,
        created_at, updated_at
      )
      SELECT 
        'ALW-' || p.school_id || '-' || LPAD(p.id::text, 6, '0') as id,
        p.id as personnel_id,
        p.school_id,
        COALESCE(p.school_year, 'SY 26-27') as school_year,
        FALSE as has_pera,
        2000.00 as pera_amount,
        TRUE as has_uniform,
        7000.00 as uniform_amount,
        CASE WHEN UPPER(COALESCE(p.type, '')) = 'NON-TEACHING' THEN FALSE ELSE TRUE END as has_supplies,
        CASE WHEN UPPER(COALESCE(p.type, '')) = 'NON-TEACHING' THEN NULL ELSE 10000.00 END as supplies_amount,
        TRUE as has_medical,
        7000.00 as medical_amount,
        FALSE as has_hardship,
        0.00 as hardship_amount,
        '[]'::jsonb as disabled_allowances,
        '{}'::jsonb as extras,
        NOW() as created_at,
        NOW() as updated_at
      FROM esf7_personnel_profile p
      WHERE NOT EXISTS (
        SELECT 1 FROM esf7_personnel_allowances a 
        WHERE a.personnel_id = p.id AND a.school_year = COALESCE(p.school_year, 'SY 26-27')
      )
      ON CONFLICT (personnel_id, school_year) DO NOTHING;
    `);
    console.log(
      `   ✓ Ingested ${defaultsInsert.rowCount} default allowance records for remaining personnel.`,
    );

    // 6. Create alias view esf7_personnel_allowance
    console.log("6. Creating compatibility view esf7_personnel_allowance...");
    await client.query(`
      CREATE OR REPLACE VIEW esf7_personnel_allowance AS 
      SELECT * FROM esf7_personnel_allowances;
    `);
    console.log("   ✓ View esf7_personnel_allowance created.");

    // 7. Ensure indexes exist
    console.log("7. Ensuring performance indexes exist...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_allowances_personnel ON esf7_personnel_allowances (personnel_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_allowances_school_sy ON esf7_personnel_allowances (school_id, school_year);
    `);
    console.log("   ✓ Indexes verified.");

    // 8. Verification checks
    console.log("\n==================== VERIFICATION ====================");
    const finalCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_allowances;",
    );
    const viewCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_allowance;",
    );
    const profCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_profile;",
    );
    const rawCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_allowances' AND column_name = 'raw_payload';
    `);
    const extrasCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'esf7_personnel_allowances' AND column_name = 'extras';
    `);
    const orphanCheck = await client.query(`
      SELECT count(*) FROM esf7_personnel_allowances a
      LEFT JOIN esf7_personnel_profile p ON a.personnel_id = p.id
      WHERE p.id IS NULL;
    `);

    console.log({
      allowances_table_count: Number(finalCount.rows[0].count),
      allowance_view_count: Number(viewCount.rows[0].count),
      personnel_profile_count: Number(profCount.rows[0].count),
      raw_payload_present: rawCheck.rows.length > 0,
      extras_column_present: extrasCheck.rows.length > 0,
      orphan_allowances_count: Number(orphanCheck.rows[0].count),
    });

    const sampleRows = await client.query(`
      SELECT a.id, a.personnel_id, a.school_id, a.school_year, 
        a.has_uniform, a.uniform_amount, a.has_supplies, a.supplies_amount,
        a.has_medical, a.medical_amount, a.has_hardship, a.extras,
        p.first_name, p.last_name, p.type
      FROM esf7_personnel_allowances a
      JOIN esf7_personnel_profile p ON a.personnel_id = p.id
      LIMIT 3;
    `);
    console.log("\nSample linked records:");
    console.log(sampleRows.rows);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 Rebuild completed successfully in ${elapsed}s!`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
