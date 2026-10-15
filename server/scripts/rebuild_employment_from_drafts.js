require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
/**
 * Clean Slate Rebuild of esf7_personnel_employment from authentic personnel profiles
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Primary Key `id` matches `personnel_id` 1:1 (Sequential '1' to 'N').
 * - Preserves all employment fields (position, category, step, fund source, dates, arrays).
 * - Enforces DepEd business rules (Cook -> SBFP, valid step increments, safe date parsing).
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
    console.log("⚡ CLEAN SLATE REBUILD: esf7_personnel_employment");
    console.log("==========================================================");

    // 1. Create safety backup
    console.log("\n[Step 1/4] Creating safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_employment_backup_20261013_v2 AS
      SELECT * FROM esf7_personnel_employment;
    `);
    const backupCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment_backup_20261013_v2",
    );
    console.log(
      `  ✓ Safety backup ready with ${backupCount.rows[0].count} rows.`,
    );

    // 2. Truncate table
    console.log("\n[Step 2/4] Truncating esf7_personnel_employment...");
    await client.query("TRUNCATE TABLE esf7_personnel_employment;");
    console.log("  ✓ Table cleanly truncated.");

    // 3. Insert standardized employment records
    console.log(
      "\n[Step 3/4] Ingesting 351,762 standardized employment records (Option B: id = personnel_id)...",
    );
    const tInsert = Date.now();
    const insertRes = await client.query(`
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position, position_category, step_increment, actual_step, school_reported_step,
        fund_source, nature_of_appointment, hiring_arrangement, deployment_status,
        first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date,
        grade_levels_taught, assigned_schools, created_at, updated_at
      )
      SELECT 
        p.id as id,
        p.id as personnel_id,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(p.raw_payload->>'position', p.raw_payload->>'plantilla_position', ''))), ''), 'TEACHER I') as position,
        CASE 
          WHEN p.raw_payload->>'position_category' ILIKE '%NON%' THEN 'NON-TEACHING'
          WHEN p.raw_payload->>'position_category' ILIKE '%RELATED%' THEN 'RELATED TEACHING'
          ELSE 'TEACHING'
        END as position_category,
        CASE 
          WHEN p.raw_payload->>'step_increment' ~ '^[1-8]$' THEN (p.raw_payload->>'step_increment')::integer
          WHEN p.raw_payload->>'stepIncrement' ~ '^[1-8]$' THEN (p.raw_payload->>'stepIncrement')::integer
          ELSE 1
        END as step_increment,
        CASE 
          WHEN p.raw_payload->>'step_increment' ~ '^[1-8]$' THEN (p.raw_payload->>'step_increment')::integer
          WHEN p.raw_payload->>'stepIncrement' ~ '^[1-8]$' THEN (p.raw_payload->>'stepIncrement')::integer
          ELSE 1
        END as actual_step,
        CASE 
          WHEN p.raw_payload->>'step_increment' ~ '^[1-8]$' THEN (p.raw_payload->>'step_increment')::integer
          WHEN p.raw_payload->>'stepIncrement' ~ '^[1-8]$' THEN (p.raw_payload->>'stepIncrement')::integer
          ELSE 1
        END as school_reported_step,
        CASE 
          WHEN COALESCE(p.raw_payload->>'position', p.raw_payload->>'plantilla_position', '') ILIKE '%COOK%' THEN 'SBFP'
          ELSE COALESCE(NULLIF(TRIM(UPPER(p.raw_payload->>'fund_source')), ''), 'NATIONAL')
        END as fund_source,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(p.raw_payload->>'nature_of_appointment', p.raw_payload->>'natureOfAppointment', ''))), ''), 'REGULAR PERMANENT') as nature_of_appointment,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(p.raw_payload->>'hiring_arrangement', p.raw_payload->>'hiringArrangement', ''))), ''), 'REGULAR') as hiring_arrangement,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(p.raw_payload->>'deployment_status', p.raw_payload->>'deploymentStatus', ''))), ''), 'IN STATION') as deployment_status,
        safe_cast_date(COALESCE(p.raw_payload->>'first_service_date', p.raw_payload->>'firstServiceDate')) as first_service_date,
        safe_cast_date(COALESCE(p.raw_payload->>'last_promotion_date', p.raw_payload->>'lastPromotionDate')) as last_promotion_date,
        safe_cast_date(COALESCE(p.raw_payload->>'new_station_date', p.raw_payload->>'newStationDate')) as new_station_date,
        safe_cast_date(COALESCE(p.raw_payload->>'last_lateral_movement_date', p.raw_payload->>'lastLateralMovementDate')) as last_lateral_movement_date,
        CASE 
          WHEN jsonb_typeof(p.raw_payload->'grade_levels_taught') = 'array' THEN p.raw_payload->'grade_levels_taught'
          WHEN jsonb_typeof(p.raw_payload->'gradeLevelsTaught') = 'array' THEN p.raw_payload->'gradeLevelsTaught'
          ELSE '[]'::jsonb
        END as grade_levels_taught,
        CASE 
          WHEN jsonb_typeof(p.raw_payload->'assigned_schools') = 'array' THEN p.raw_payload->'assigned_schools'
          WHEN jsonb_typeof(p.raw_payload->'assignedSchools') = 'array' THEN p.raw_payload->'assignedSchools'
          ELSE '[]'::jsonb
        END as assigned_schools,
        NOW(),
        NOW()
      FROM esf7_personnel_profile p;
    `);

    console.log(
      `  ✓ Inserted ${insertRes.rowCount} rows in ${((Date.now() - tInsert) / 1000).toFixed(1)}s!`,
    );

    // 4. Verification
    console.log("\n[Step 4/4] Verifying table integrity and sample records...");
    const countRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment",
    );
    const minMaxRes = await client.query(
      "SELECT min(id::bigint) as min_id, max(id::bigint) as max_id FROM esf7_personnel_employment",
    );

    // Check 1:1 match with profile
    const matchCheck = await client.query(`
      SELECT count(*) as mismatched
      FROM esf7_personnel_employment e
      FULL OUTER JOIN esf7_personnel_profile p ON e.personnel_id = p.id
      WHERE e.id IS NULL OR p.id IS NULL OR e.id <> e.personnel_id;
    `);

    const first5 = await client.query(`
      SELECT id, personnel_id, position, position_category, step_increment, fund_source, nature_of_appointment, deployment_status
      FROM esf7_personnel_employment
      ORDER BY id::bigint ASC
      LIMIT 5;
    `);

    const last5 = await client.query(`
      SELECT id, personnel_id, position, position_category, step_increment, fund_source, nature_of_appointment, deployment_status
      FROM esf7_personnel_employment
      ORDER BY id::bigint DESC
      LIMIT 5;
    `);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n==========================================================");
    console.log(`🎉 REBUILD COMPLETE IN ${totalDuration}s!`);
    console.log(`✓ Total Employment Records: ${countRes.rows[0].count}`);
    console.log(
      `✓ ID Range: ${minMaxRes.rows[0].min_id} to ${minMaxRes.rows[0].max_id}`,
    );
    console.log(
      `✓ Mismatched / Orphaned records: ${matchCheck.rows[0].mismatched}`,
    );
    console.log("==========================================================");

    console.log("\nFirst 5 records:");
    console.table(first5.rows);

    console.log("\nLast 5 records:");
    console.table(last5.rows);
  } catch (err) {
    console.error("FATAL ERROR DURING EMPLOYMENT REBUILD:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
