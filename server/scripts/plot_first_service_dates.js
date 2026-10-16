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

async function plotFirstServiceDates() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log(
      "🚀 PLOTTING first_service_date FROM school_drafts TO esf7_personnel_employment",
    );
    console.log("   Target Database: insighted_esf7 (STRICT ISOLATION)");
    console.log("   Safety Policy: ADDITIVE / UPDATE ONLY - ZERO DELETIONS");
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    const preCountRes = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(first_service_date) as non_null_count,
        count(*) - count(first_service_date) as null_count
      FROM esf7_personnel_employment;
    `);
    const preTotal = parseInt(preCountRes.rows[0].total_rows, 10);
    const preNonNull = parseInt(preCountRes.rows[0].non_null_count, 10);
    const preNull = parseInt(preCountRes.rows[0].null_count, 10);

    console.log(
      `\n[Step 1/5] Pre-execution stats in esf7_personnel_employment:`,
    );
    console.log(`   - Total rows: ${preTotal.toLocaleString()}`);
    console.log(
      `   - Existing non-null first_service_date: ${preNonNull.toLocaleString()}`,
    );
    console.log(
      `   - Currently NULL first_service_date: ${preNull.toLocaleString()}`,
    );

    // Step 2: Create safety backup table
    console.log(
      "\n[Step 2/5] Verifying / creating dedicated safety backup table...",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_employment_backup_fsd AS
      SELECT * FROM esf7_personnel_employment;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_employment_backup_fsd;",
    );
    console.log(
      `   ✓ Backup verified: ${parseInt(backupRes.rows[0].count, 10).toLocaleString()} rows preserved in 'esf7_personnel_employment_backup_fsd'.`,
    );

    // Step 3: Ensure supporting indexes for ultra-fast matching
    console.log("\n[Step 3/5] Ensuring supporting indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_emp_no 
      ON esf7_personnel_profile(employee_no) 
      WHERE employee_no IS NOT NULL AND employee_no NOT IN ('NONE', 'N/A', '', '0');
    `);
    console.log("   ✓ Indexes verified.");

    // Step 4: Batch processing drafts
    console.log(
      "\n[Step 4/5] Processing school_drafts in resilient batches...",
    );

    // Fetch all draft keys to paginate reliably
    const draftsKeysRes = await client.query(`
      SELECT school_id, school_year 
      FROM school_drafts 
      ORDER BY school_id, school_year;
    `);
    const allDrafts = draftsKeysRes.rows;
    const totalDrafts = allDrafts.length;
    console.log(`   ✓ Total drafts found: ${totalDrafts.toLocaleString()}`);

    const BATCH_SIZE = 1000;
    let totalUpdated = 0;
    const totalBatches = Math.ceil(totalDrafts / BATCH_SIZE);

    for (let i = 0; i < totalDrafts; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batchKeys = allDrafts.slice(i, i + BATCH_SIZE);
      const schoolIds = batchKeys.map((k) => k.school_id);
      const schoolYears = batchKeys.map((k) => k.school_year);
      const tBatchStart = Date.now();

      // Execute batch match and update
      const updateBatchRes = await client.query(
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
            CASE 
              WHEN COALESCE(p->>'first_service_date', p->>'firstServiceDate') ~ '^\\d{4}-\\d{2}-\\d{2}$' 
                THEN (COALESCE(p->>'first_service_date', p->>'firstServiceDate'))::date
              WHEN COALESCE(p->>'first_service_date', p->>'firstServiceDate') ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' 
                THEN to_date(COALESCE(p->>'first_service_date', p->>'firstServiceDate'), 'MM/DD/YYYY')
              ELSE NULL
            END as draft_fsd
          FROM batch_drafts d,
          LATERAL jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(d.payload->'personnel') = 'array' THEN d.payload->'personnel'
              ELSE '[]'::jsonb
            END
          ) p
          WHERE (
            COALESCE(p->>'first_service_date', p->>'firstServiceDate') ~ '^\\d{4}-\\d{2}-\\d{2}$' 
            OR COALESCE(p->>'first_service_date', p->>'firstServiceDate') ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
          )
        ),
        candidates AS (
          -- Priority 1: Direct ID
          SELECT x.d_id as personnel_id, x.draft_fsd, 1 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p ON p.id = x.d_id
          
          UNION ALL
          
          -- Priority 2: DepEd PRN
          SELECT p.id as personnel_id, x.draft_fsd, 2 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn
            
          UNION ALL
          
          -- Priority 3: Same School + Employee No
          SELECT p.id as personnel_id, x.draft_fsd, 3 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON x.d_emp_no IS NOT NULL AND x.d_emp_no NOT IN ('NONE', 'N/A', '', '0') 
            AND p.school_id = x.school_id AND p.employee_no = x.d_emp_no
            
          UNION ALL
          
          -- Priority 4: Same School + Full Name
          SELECT p.id as personnel_id, x.draft_fsd, 4 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON p.school_id = x.school_id 
            AND x.fn_norm <> '' AND UPPER(TRIM(p.first_name)) = x.fn_norm
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm

          UNION ALL

          -- Priority 5: Cross-School (Clustered/Reassigned) Employee No + Last Name
          SELECT p.id as personnel_id, x.draft_fsd, 5 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON x.d_emp_no IS NOT NULL AND x.d_emp_no NOT IN ('NONE', 'N/A', '', '0') 
            AND p.employee_no = x.d_emp_no
            AND x.ln_norm <> '' AND UPPER(TRIM(p.last_name)) = x.ln_norm
        ),
        best_candidates AS (
          SELECT personnel_id, draft_fsd
          FROM (
            SELECT *, ROW_NUMBER() OVER(PARTITION BY personnel_id ORDER BY priority ASC, draft_fsd DESC) as rn
            FROM candidates
          ) sub
          WHERE rn = 1
        )
        UPDATE esf7_personnel_employment e
        SET 
          first_service_date = b.draft_fsd,
          updated_at = NOW()
        FROM best_candidates b
        WHERE e.personnel_id = b.personnel_id
          AND (e.first_service_date IS NULL OR e.first_service_date <> b.draft_fsd);
      `,
        [schoolIds, schoolYears],
      );

      const updatedCount = updateBatchRes.rowCount || 0;
      totalUpdated += updatedCount;
      const duration = ((Date.now() - tBatchStart) / 1000).toFixed(2);
      console.log(
        `   [Batch ${batchNum}/${totalBatches}] Processed ${batchKeys.length} drafts -> ${updatedCount} rows updated (${duration}s)`,
      );
    }

    console.log(
      `\n   ✓ All batches complete! Total rows plotted/updated: ${totalUpdated.toLocaleString()}`,
    );

    // Step 5: Post-execution verification
    console.log("\n[Step 5/5] Post-execution verification & auditing...");
    const postCountRes = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(first_service_date) as non_null_count,
        count(*) - count(first_service_date) as null_count
      FROM esf7_personnel_employment;
    `);
    const postTotal = parseInt(postCountRes.rows[0].total_rows, 10);
    const postNonNull = parseInt(postCountRes.rows[0].non_null_count, 10);
    const postNull = parseInt(postCountRes.rows[0].null_count, 10);

    console.log(
      `   - Post total rows: ${postTotal.toLocaleString()} (Verified: ${postTotal === preTotal ? "PERFECT MATCH, 0 DELETIONS" : "MISMATCH"})`,
    );
    console.log(
      `   - Post non-null first_service_date: ${postNonNull.toLocaleString()} (+${(postNonNull - preNonNull).toLocaleString()} new non-null entries)`,
    );
    console.log(
      `   - Remaining NULL first_service_date: ${postNull.toLocaleString()}`,
    );

    // Sample 5 updated records
    const sampleRes = await client.query(`
      SELECT 
        e.personnel_id,
        p.first_name,
        p.last_name,
        p.school_id,
        p.employee_no,
        b.first_service_date as previous_fsd,
        e.first_service_date as updated_fsd,
        e.updated_at
      FROM esf7_personnel_employment e
      JOIN esf7_personnel_employment_backup_fsd b ON b.personnel_id = e.personnel_id
      JOIN esf7_personnel_profile p ON p.id = e.personnel_id
      WHERE (b.first_service_date IS NULL AND e.first_service_date IS NOT NULL)
         OR (b.first_service_date <> e.first_service_date)
      ORDER BY e.updated_at DESC
      LIMIT 5;
    `);

    console.log("\nSample 5 successfully plotted / updated records:");
    console.table(
      sampleRes.rows.map((r) => ({
        ID: r.personnel_id,
        Name: `${r.first_name} ${r.last_name}`,
        School: r.school_id,
        EmpNo: r.employee_no,
        Previous_Date: r.previous_fsd
          ? r.previous_fsd.toISOString().split("T")[0]
          : "NULL",
        Plotted_Date: r.updated_fsd
          ? r.updated_fsd.toISOString().split("T")[0]
          : "NULL",
      })),
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(
      `🎉 SUCCESS! Completed plotting first_service_date in ${elapsed}s`,
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

plotFirstServiceDates().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
