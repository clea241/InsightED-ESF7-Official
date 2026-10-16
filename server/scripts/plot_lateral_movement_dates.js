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
  connectionTimeoutMillis: 15000,
});

async function plotLateralMovementDates() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log(
      "🚀 PLOTTING last_lateral_movement_date FROM school_drafts TO esf7_personnel_employment",
    );
    console.log("   Target Database: insighted_esf7 (STRICT ISOLATION)");
    console.log("   Safety Policy: ADDITIVE / UPDATE ONLY - ZERO DELETIONS");
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution count
    const preCountRes = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(last_lateral_movement_date) as non_null_count
      FROM esf7_personnel_employment;
    `);
    const preTotal = parseInt(preCountRes.rows[0].total_rows, 10);
    const preNonNull = parseInt(preCountRes.rows[0].non_null_count, 10);
    console.log(
      `\n[Step 1/5] Pre-execution stats in esf7_personnel_employment:`,
    );
    console.log(`   - Total rows: ${preTotal.toLocaleString()}`);
    console.log(
      `   - Existing non-null last_lateral_movement_date: ${preNonNull.toLocaleString()}`,
    );

    // Step 2: Create safety backup table
    console.log("\n[Step 2/5] Creating dedicated safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_employment_backup_lateral AS
      SELECT * FROM esf7_personnel_employment;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment_backup_lateral;",
    );
    console.log(
      `   ✓ Backup verified: ${parseInt(backupRes.rows[0].count, 10).toLocaleString()} rows preserved in 'esf7_personnel_employment_backup_lateral'.`,
    );

    // Step 3: Extract valid lateral movement records from school_drafts into an unlogged staging table
    console.log(
      "\n[Step 3/5] Extracting valid lateral movement dates from school_drafts...",
    );
    await client.query(`DROP TABLE IF EXISTS tmp_draft_lateral_dates;`);
    await client.query(`
      CREATE UNLOGGED TABLE tmp_draft_lateral_dates AS
      WITH raw_draft_items AS (
        SELECT 
          d.school_id as d_school_id,
          CASE 
            WHEN d.payload->'schoolInfo'->>'schoolId' ~ '^\\d{6}$' THEN d.payload->'schoolInfo'->>'schoolId'
            WHEN REPLACE(d.school_id, 'SCH-', '') ~ '^\\d{6}$' THEN REPLACE(d.school_id, 'SCH-', '')
            ELSE REPLACE(d.school_id, 'SCH-', '')
          END as school_id,
          p->>'id' as d_id,
          NULLIF(TRIM(p->>'prn'), '') as d_prn,
          NULLIF(TRIM(COALESCE(p->>'employee_no', p->>'employeeNo')), '') as d_emp_no,
          NULLIF(TRIM(LOWER(COALESCE(p->>'deped_email', p->>'depedEmail', p->>'email'))), '') as d_email,
          TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
          TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm,
          safe_cast_date(COALESCE(p->>'last_lateral_movement_date', p->>'lastLateralMovementDate', p->>'last_lateral_moevment_date')) as draft_lateral_date
        FROM school_drafts d,
        LATERAL jsonb_array_elements(
          CASE 
            WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel'
            ELSE '[]'::jsonb
          END
        ) p
        WHERE safe_cast_date(COALESCE(p->>'last_lateral_movement_date', p->>'lastLateralMovementDate', p->>'last_lateral_moevment_date')) IS NOT NULL
      )
      SELECT * FROM raw_draft_items;
    `);

    const extractedCount = await client.query(
      "SELECT count(*) FROM tmp_draft_lateral_dates;",
    );
    console.log(
      `   ✓ Extracted ${parseInt(extractedCount.rows[0].count, 10).toLocaleString()} valid lateral dates from school_drafts.`,
    );

    // Create fast indexes on staging table
    await client.query(
      `CREATE INDEX idx_tmp_draft_school ON tmp_draft_lateral_dates(school_id);`,
    );
    await client.query(
      `CREATE INDEX idx_tmp_draft_d_id ON tmp_draft_lateral_dates(d_id);`,
    );
    await client.query(
      `CREATE INDEX idx_tmp_draft_prn ON tmp_draft_lateral_dates(d_prn);`,
    );
    await client.query(
      `CREATE INDEX idx_tmp_draft_emp ON tmp_draft_lateral_dates(d_emp_no);`,
    );

    // Step 4: Resolve candidate personnel IDs and perform targeted safe UPDATE
    console.log(
      "\n[Step 4/5] Resolving personnel IDs and updating esf7_personnel_employment...",
    );
    await client.query(`DROP TABLE IF EXISTS tmp_resolved_updates;`);
    await client.query(`
      CREATE UNLOGGED TABLE tmp_resolved_updates AS
      WITH resolved_candidates AS (
        -- Priority 1: Direct ID
        SELECT 
          p.id as personnel_id, 
          t.draft_lateral_date,
          1 as priority
        FROM tmp_draft_lateral_dates t
        JOIN esf7_personnel_profile p ON p.id = t.d_id
        
        UNION ALL
        
        -- Priority 2: DepEd PRN
        SELECT 
          p.id as personnel_id, 
          t.draft_lateral_date,
          2 as priority
        FROM tmp_draft_lateral_dates t
        JOIN esf7_personnel_profile p ON p.prn = t.d_prn
        WHERE t.d_prn IS NOT NULL AND t.d_prn NOT IN ('0', 'N/A', 'NONE', 'null')
        
        UNION ALL
        
        -- Priority 3: Same School + Name
        SELECT 
          p.id as personnel_id, 
          t.draft_lateral_date,
          3 as priority
        FROM tmp_draft_lateral_dates t
        JOIN esf7_personnel_profile p 
          ON (p.school_id = t.school_id OR p.school_id = t.d_school_id)
         AND t.fn_norm <> '' AND t.ln_norm <> ''
         AND UPPER(TRIM(p.first_name)) = t.fn_norm
         AND UPPER(TRIM(p.last_name)) = t.ln_norm
         
        UNION ALL
        
        -- Priority 4: Same School + Employee No
        SELECT 
          p.id as personnel_id, 
          t.draft_lateral_date,
          4 as priority
        FROM tmp_draft_lateral_dates t
        JOIN esf7_personnel_profile p 
          ON (p.school_id = t.school_id OR p.school_id = t.d_school_id)
         AND t.d_emp_no IS NOT NULL AND t.d_emp_no NOT IN ('NONE', 'N/A', '', '0')
         AND p.employee_no = t.d_emp_no

        UNION ALL

        -- Priority 5: Cross-School (Clustered/Reassigned/Transferred) - Employee No AND Last Name match
        SELECT 
          p.id as personnel_id, 
          t.draft_lateral_date,
          5 as priority
        FROM tmp_draft_lateral_dates t
        JOIN esf7_personnel_profile p 
          ON t.d_emp_no IS NOT NULL AND t.d_emp_no NOT IN ('NONE', 'N/A', '', '0')
         AND p.employee_no = t.d_emp_no
         AND t.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = t.ln_norm
      ),
      deduped_updates AS (
        SELECT 
          personnel_id,
          draft_lateral_date,
          ROW_NUMBER() OVER (PARTITION BY personnel_id ORDER BY priority ASC, draft_lateral_date DESC) as rn
        FROM resolved_candidates
      )
      SELECT personnel_id, draft_lateral_date
      FROM deduped_updates
      WHERE rn = 1;
    `);

    await client.query(
      `CREATE INDEX idx_tmp_res_pid ON tmp_resolved_updates(personnel_id);`,
    );

    const readyUpdates = await client.query(`
      SELECT 
        count(*) as total_ready,
        count(*) FILTER (WHERE e.last_lateral_movement_date IS NULL) as filling_null,
        count(*) FILTER (WHERE e.last_lateral_movement_date <> u.draft_lateral_date) as updating_different,
        count(*) FILTER (WHERE e.last_lateral_movement_date = u.draft_lateral_date) as already_matched
      FROM tmp_resolved_updates u
      JOIN esf7_personnel_employment e ON e.personnel_id = u.personnel_id;
    `);

    console.log("   Update readiness summary:", readyUpdates.rows[0]);

    // Execute the safe UPDATE (only where null or different)
    const updateResult = await client.query(`
      UPDATE esf7_personnel_employment e
      SET 
        last_lateral_movement_date = u.draft_lateral_date,
        updated_at = NOW()
      FROM tmp_resolved_updates u
      WHERE e.personnel_id = u.personnel_id
        AND (e.last_lateral_movement_date IS NULL OR e.last_lateral_movement_date <> u.draft_lateral_date);
    `);

    console.log(
      `   ✓ Successfully updated ${updateResult.rowCount} rows in esf7_personnel_employment!`,
    );

    // Clean up temporary tables
    await client.query(`DROP TABLE IF EXISTS tmp_draft_lateral_dates;`);
    await client.query(`DROP TABLE IF EXISTS tmp_resolved_updates;`);

    // Step 5: Post-execution verification
    console.log("\n[Step 5/5] Post-execution verification...");
    const postCountRes = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(last_lateral_movement_date) as non_null_count
      FROM esf7_personnel_employment;
    `);
    const postTotal = parseInt(postCountRes.rows[0].total_rows, 10);
    const postNonNull = parseInt(postCountRes.rows[0].non_null_count, 10);

    console.log(`   - Pre Total Rows:  ${preTotal.toLocaleString()}`);
    console.log(
      `   - Post Total Rows: ${postTotal.toLocaleString()} (Verified 0 deletions: ${postTotal === preTotal ? "PASS ✓" : "FAIL ✗"})`,
    );
    console.log(`   - Pre Non-Null:    ${preNonNull.toLocaleString()}`);
    console.log(
      `   - Post Non-Null:   ${postNonNull.toLocaleString()} (+${postNonNull - preNonNull} newly populated)`,
    );

    // Sample 5 updated records
    const sampleUpdated = await client.query(`
      SELECT 
        e.id, 
        e.personnel_id, 
        p.first_name, 
        p.last_name, 
        p.school_id, 
        e.position, 
        e.last_lateral_movement_date,
        e.updated_at
      FROM esf7_personnel_employment e
      JOIN esf7_personnel_profile p ON p.id = e.personnel_id
      WHERE e.last_lateral_movement_date IS NOT NULL
      ORDER BY e.updated_at DESC
      LIMIT 5;
    `);
    console.log("\nSample verified records in esf7_personnel_employment:");
    console.table(sampleUpdated.rows);

    console.log(
      `\n✨ Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
    );
  } catch (err) {
    console.error("❌ Error during plotting:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

plotLateralMovementDates();
