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

async function plotPhase1ProfileFromRoomRoster() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log(
      "================================================================================",
    );
    console.log(
      "🚀 PHASE 1: PLOTTING PROFILE DATA FROM esf7_room_roster_cache TO esf7_personnel_profile",
    );
    console.log(
      "   Fields: deped_email, ethnic_group, philsys_no, employee_no",
    );
    console.log("   Target Database: insighted_esf7 (STRICT ISOLATION)");
    console.log(
      "   Safety Policy: ADDITIVE / ENRICHMENT ONLY - ZERO DELETIONS",
    );
    console.log(
      "================================================================================",
    );

    // Step 1: Pre-execution stats
    console.log(
      "\n[Step 1/5] Pre-execution stats in esf7_personnel_profile...",
    );
    const preStatsRes = await client.query(`
      SELECT 
        count(*) as total_personnel,
        count(deped_email) as with_email,
        count(*) - count(deped_email) as null_email,
        count(ethnic_group) as with_ethnic,
        count(*) - count(ethnic_group) as null_ethnic,
        count(philsys_no) as with_philsys,
        count(*) - count(philsys_no) as null_philsys,
        count(employee_no) as with_emp_no,
        count(*) - count(employee_no) as null_emp_no
      FROM esf7_personnel_profile;
    `);
    const pre = preStatsRes.rows[0];
    const preTotal = parseInt(pre.total_personnel, 10);
    console.log(`   - Total personnel: ${preTotal.toLocaleString()}`);
    console.log(
      `   - With deped_email: ${parseInt(pre.with_email, 10).toLocaleString()} (NULL: ${parseInt(pre.null_email, 10).toLocaleString()})`,
    );
    console.log(
      `   - With ethnic_group: ${parseInt(pre.with_ethnic, 10).toLocaleString()} (NULL: ${parseInt(pre.null_ethnic, 10).toLocaleString()})`,
    );
    console.log(
      `   - With philsys_no: ${parseInt(pre.with_philsys, 10).toLocaleString()} (NULL: ${parseInt(pre.null_philsys, 10).toLocaleString()})`,
    );
    console.log(
      `   - With employee_no: ${parseInt(pre.with_emp_no, 10).toLocaleString()} (NULL: ${parseInt(pre.null_emp_no, 10).toLocaleString()})`,
    );

    // Step 2: Dedicated safety backup table
    console.log("\n[Step 2/5] Creating dedicated safety backup table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_profile_backup_roster AS
      SELECT * FROM esf7_personnel_profile;
    `);
    const backupRes = await client.query(
      "SELECT count(*) FROM esf7_personnel_profile_backup_roster;",
    );
    console.log(
      `   ✓ Backup verified: ${parseInt(backupRes.rows[0].count, 10).toLocaleString()} rows preserved in 'esf7_personnel_profile_backup_roster'.`,
    );

    // Step 3: Fetch cached school keys
    console.log("\n[Step 3/5] Inspecting esf7_room_roster_cache keys...");
    const keysRes = await client.query(
      `SELECT school_id FROM esf7_room_roster_cache ORDER BY school_id;`,
    );
    const allSchools = keysRes.rows.map((r) => r.school_id);
    const totalSchools = allSchools.length;
    console.log(`   ✓ Found ${totalSchools.toLocaleString()} cached schools.`);

    // Step 4: Batch processing
    console.log("\n[Step 4/5] Processing cache in resilient batches...");
    const BATCH_SIZE = 1000;
    const totalBatches = Math.ceil(totalSchools / BATCH_SIZE);
    let totalUpdated = 0;

    for (let i = 0; i < totalSchools; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batchIds = allSchools.slice(i, i + BATCH_SIZE);
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
            NULLIF(TRIM(COALESCE(p->>'philsys_no', p->>'philsysNo', p->>'philSysNo')), '') as d_philsys,
            NULLIF(TRIM(COALESCE(p->>'depedEmail', p->>'deped_email', p->>'email')), '') as d_email,
            NULLIF(TRIM(COALESCE(p->>'ethnicGroup', p->>'ethnic_group')), '') as d_ethnic,
            TRIM(UPPER(COALESCE(p->>'first_name', p->>'firstName', ''))) as fn_norm,
            TRIM(UPPER(COALESCE(p->>'last_name', p->>'lastName', ''))) as ln_norm
          FROM batch_cache c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.roster_json) = 'array' THEN c.roster_json ELSE '[]'::jsonb END
          ) p
        ),
        candidates AS (
          -- Priority 1: Direct ID or Legacy ID
          SELECT 
            p.id as personnel_id,
            x.d_emp_no, x.d_philsys, x.d_email, x.d_ethnic,
            1 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p ON (p.id = x.d_id OR p.legacy_id = x.d_id)
          
          UNION ALL
          
          -- Priority 2: DepEd PRN
          SELECT 
            p.id as personnel_id,
            x.d_emp_no, x.d_philsys, x.d_email, x.d_ethnic,
            2 as priority
          FROM extracted x
          JOIN esf7_personnel_profile p 
            ON x.d_prn IS NOT NULL AND x.d_prn NOT IN ('0', 'N/A', 'NONE') AND p.prn = x.d_prn
            
          UNION ALL
          
          -- Priority 3: Same School + Full Name
          SELECT 
            p.id as personnel_id,
            x.d_emp_no, x.d_philsys, x.d_email, x.d_ethnic,
            3 as priority
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
        UPDATE esf7_personnel_profile p
        SET 
          deped_email = CASE 
            WHEN (p.deped_email IS NULL OR p.deped_email = '') AND d.d_email ~* '^[A-Za-z0-9._%+-]+@deped\\.gov\\.ph$' 
              THEN d.d_email 
            ELSE p.deped_email 
          END,
          no_deped_email = CASE 
            WHEN (p.deped_email IS NULL OR p.deped_email = '') AND d.d_email ~* '^[A-Za-z0-9._%+-]+@deped\\.gov\\.ph$' 
              THEN FALSE 
            ELSE p.no_deped_email 
          END,
          ethnic_group = CASE 
            WHEN (p.ethnic_group IS NULL OR p.ethnic_group = '' OR p.ethnic_group IN ('NONE', 'N/A', '0')) AND d.d_ethnic NOT IN ('NONE', 'N/A', '0')
              THEN d.d_ethnic 
            ELSE p.ethnic_group 
          END,
          philsys_no = CASE 
            WHEN (p.philsys_no IS NULL OR p.philsys_no = '' OR p.philsys_no IN ('NONE', 'N/A', '0')) AND d.d_philsys NOT IN ('NONE', 'N/A', '0')
              THEN d.d_philsys 
            ELSE p.philsys_no 
          END,
          no_philsys = CASE 
            WHEN (p.philsys_no IS NULL OR p.philsys_no = '' OR p.philsys_no IN ('NONE', 'N/A', '0')) AND d.d_philsys NOT IN ('NONE', 'N/A', '0')
              THEN FALSE 
            ELSE p.no_philsys 
          END,
          employee_no = CASE 
            WHEN (p.employee_no IS NULL OR p.employee_no = '' OR p.employee_no IN ('NONE', 'N/A', '0')) AND d.d_emp_no NOT IN ('NONE', 'N/A', '0')
              THEN d.d_emp_no 
            ELSE p.employee_no 
          END,
          updated_at = NOW()
        FROM deduped d
        WHERE p.id = d.personnel_id
          AND (
            ((p.deped_email IS NULL OR p.deped_email = '') AND d.d_email ~* '^[A-Za-z0-9._%+-]+@deped\\.gov\\.ph$')
            OR ((p.ethnic_group IS NULL OR p.ethnic_group = '' OR p.ethnic_group IN ('NONE', 'N/A', '0')) AND d.d_ethnic NOT IN ('NONE', 'N/A', '0'))
            OR ((p.philsys_no IS NULL OR p.philsys_no = '' OR p.philsys_no IN ('NONE', 'N/A', '0')) AND d.d_philsys NOT IN ('NONE', 'N/A', '0'))
            OR ((p.employee_no IS NULL OR p.employee_no = '' OR p.employee_no IN ('NONE', 'N/A', '0')) AND d.d_emp_no NOT IN ('NONE', 'N/A', '0'))
          );
      `,
        [batchIds],
      );

      const count = updateBatch.rowCount || 0;
      totalUpdated += count;
      const duration = ((Date.now() - tBatch) / 1000).toFixed(2);
      console.log(
        `   [Batch ${batchNum}/${totalBatches}] Processed ${batchIds.length} schools -> ${count} profiles updated (${duration}s)`,
      );
    }

    console.log(
      `\n   ✓ All batches complete! Total profiles updated: ${totalUpdated.toLocaleString()}`,
    );

    // Step 5: Post-execution stats & verification
    console.log("\n[Step 5/5] Post-execution verification & auditing...");
    const postStatsRes = await client.query(`
      SELECT 
        count(*) as total_personnel,
        count(deped_email) as with_email,
        count(*) - count(deped_email) as null_email,
        count(ethnic_group) as with_ethnic,
        count(*) - count(ethnic_group) as null_ethnic,
        count(philsys_no) as with_philsys,
        count(*) - count(philsys_no) as null_philsys,
        count(employee_no) as with_emp_no,
        count(*) - count(employee_no) as null_emp_no
      FROM esf7_personnel_profile;
    `);
    const post = postStatsRes.rows[0];
    const postTotal = parseInt(post.total_personnel, 10);

    console.log(
      `   - Post total personnel: ${postTotal.toLocaleString()} (Verified: ${postTotal === preTotal ? "PERFECT MATCH, 0 DELETIONS" : "MISMATCH"})`,
    );
    console.log(
      `   - deped_email: ${parseInt(post.with_email, 10).toLocaleString()} (+${(parseInt(post.with_email, 10) - parseInt(pre.with_email, 10)).toLocaleString()} newly populated)`,
    );
    console.log(
      `   - ethnic_group: ${parseInt(post.with_ethnic, 10).toLocaleString()} (+${(parseInt(post.with_ethnic, 10) - parseInt(pre.with_ethnic, 10)).toLocaleString()} newly populated)`,
    );
    console.log(
      `   - philsys_no: ${parseInt(post.with_philsys, 10).toLocaleString()} (+${(parseInt(post.with_philsys, 10) - parseInt(pre.with_philsys, 10)).toLocaleString()} newly populated)`,
    );
    console.log(
      `   - employee_no: ${parseInt(post.with_emp_no, 10).toLocaleString()} (+${(parseInt(post.with_emp_no, 10) - parseInt(pre.with_emp_no, 10)).toLocaleString()} newly populated)`,
    );

    // Sample 5 updated records comparing backup and current
    const sampleRes = await client.query(`
      SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.school_id,
        b.deped_email as old_email,
        p.deped_email as new_email,
        b.ethnic_group as old_ethnic,
        p.ethnic_group as new_ethnic,
        b.philsys_no as old_philsys,
        p.philsys_no as new_philsys,
        b.employee_no as old_emp_no,
        p.employee_no as new_emp_no
      FROM esf7_personnel_profile p
      JOIN esf7_personnel_profile_backup_roster b ON b.id = p.id
      WHERE (b.deped_email IS NULL AND p.deped_email IS NOT NULL)
         OR (b.ethnic_group IS NULL AND p.ethnic_group IS NOT NULL)
         OR (b.philsys_no IS NULL AND p.philsys_no IS NOT NULL)
         OR (b.employee_no IS NULL AND p.employee_no IS NOT NULL)
      ORDER BY p.updated_at DESC
      LIMIT 5;
    `);

    console.log("\nSample 5 successfully enriched records:");
    console.table(
      sampleRes.rows.map((r) => ({
        ID: r.id,
        Name: `${r.first_name} ${r.last_name}`,
        School: r.school_id,
        Email: `${r.old_email || "NULL"} ➔ ${r.new_email || "NULL"}`,
        Ethnic: `${r.old_ethnic || "NULL"} ➔ ${r.new_ethnic || "NULL"}`,
        PhilSys: `${r.old_philsys || "NULL"} ➔ ${r.new_philsys || "NULL"}`,
        EmpNo: `${r.old_emp_no || "NULL"} ➔ ${r.new_emp_no || "NULL"}`,
      })),
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      "\n================================================================================",
    );
    console.log(
      `🎉 SUCCESS! Completed Phase 1 profile enrichment in ${elapsed}s`,
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

plotPhase1ProfileFromRoomRoster().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
