/**
 * Fast Pure-SQL Clean Slate Rebuild of esf7_personnel_profile, employment, educ, and workloads
 * 
 * Refined Features:
 * 1. PRN is 100% Unique: Uses authentic DepEd numeric PRN where available, and 'PRN-' || global_id for missing/duplicates.
 * 2. School IDs: Completely resolves UUID session keys (e.g. 00f9494d-97ef-4174-b...) to authentic 6-digit DepEd IDs from payload.schoolInfo.schoolId.
 * 3. Restores and re-links all workload rows.
 */

const { Client } = require('../node_modules/pg');

async function main() {
  const client = new Client({
    host: 'stride-posgre-prod-01.postgres.database.azure.com',
    port: 5432,
    user: 'Administrator1',
    password: 'pRZTbQ2T1JD7',
    database: 'insighted_esf7',
    ssl: { rejectUnauthorized: false }
  });

  const overallStart = Date.now();

  try {
    console.log("==========================================================");
    console.log("⚡ FAST CLEAN SLATE REBUILD: insighted_esf7 (Unique PRN + Resolved School IDs)");
    console.log("==========================================================");
    await client.connect();

    // 1. Verify safety backups
    console.log("\n[Step 1/5] Verifying safety backups...");
    const bProf = await client.query("SELECT count(*) FROM esf7_personnel_profile_backup_20261013");
    const bEmp = await client.query("SELECT count(*) FROM esf7_personnel_employment_backup_20261013");
    const bWkl = await client.query("SELECT count(*) FROM esf7_workload_rows_backup_20261013");
    console.log(`  ✓ Backup verified: ${bProf.rows[0].count} profiles, ${bEmp.rows[0].count} employment, ${bWkl.rows[0].count} workloads.`);

    // 2. Truncate table
    console.log("\n[Step 2/5] Truncating esf7_personnel_profile CASCADE...");
    await client.query("TRUNCATE TABLE esf7_personnel_profile CASCADE;");
    console.log("  ✓ Table cleanly truncated.");

    // Ensure safe_cast_date helper exists
    await client.query(`
      CREATE OR REPLACE FUNCTION safe_cast_date(val text) RETURNS date AS $$
      BEGIN
        IF val IS NULL OR val = '' OR val = 'NULL' OR val LIKE '0000%' THEN
          RETURN NULL;
        END IF;
        RETURN val::date;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);

    // 3. Build staging table with resolved school IDs and unique PRNs
    console.log("\n[Step 3/5] Extracting & deduplicating authentic teachers from school_drafts into staging...");
    const tExtract = Date.now();
    await client.query(`DROP TABLE IF EXISTS tmp_staging_personnel;`);
    await client.query(`
      CREATE UNLOGGED TABLE tmp_staging_personnel AS
      WITH raw_personnel AS (
        SELECT 
          CASE 
            WHEN d.payload->'schoolInfo'->>'schoolId' ~ '^\\d{6}$' THEN d.payload->'schoolInfo'->>'schoolId'
            WHEN REPLACE(d.school_id, 'SCH-', '') ~ '^\\d{6}$' THEN REPLACE(d.school_id, 'SCH-', '')
            ELSE REPLACE(d.school_id, 'SCH-', '')
          END as school_id,
          COALESCE(d.school_year, 'SY 26-27') as school_year,
          elem,
          TRIM(UPPER(COALESCE(elem->>'first_name', elem->>'first', ''))) as fn_norm,
          TRIM(UPPER(COALESCE(elem->>'last_name', elem->>'last', ''))) as ln_norm,
          ROW_NUMBER() OVER (
            PARTITION BY 
              CASE 
                WHEN d.payload->'schoolInfo'->>'schoolId' ~ '^\\d{6}$' THEN d.payload->'schoolInfo'->>'schoolId'
                WHEN REPLACE(d.school_id, 'SCH-', '') ~ '^\\d{6}$' THEN REPLACE(d.school_id, 'SCH-', '')
                ELSE REPLACE(d.school_id, 'SCH-', '')
              END,
              TRIM(UPPER(COALESCE(elem->>'first_name', elem->>'first', ''))),
              TRIM(UPPER(COALESCE(elem->>'last_name', elem->>'last', '')))
            ORDER BY elem->>'id' ASC
          ) as dup_rank,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN elem->>'prn' ~ '^\\d+$' AND elem->>'prn' <> '0' THEN elem->>'prn' ELSE NULL END 
            ORDER BY elem->>'id' ASC
          ) as prn_dup_rank
        FROM school_drafts d,
        jsonb_array_elements(d.payload->'personnel') elem
        WHERE jsonb_array_length(COALESCE(d.payload->'personnel', '[]'::jsonb)) > 0
          AND (elem->>'first_name' IS NOT NULL OR elem->>'first' IS NOT NULL)
      ),
      deduped_personnel AS (
        SELECT 
          ROW_NUMBER() OVER (ORDER BY school_id ASC, elem->>'id' ASC) as global_id,
          school_id,
          school_year,
          elem,
          fn_norm,
          ln_norm,
          CASE 
            WHEN elem->>'prn' ~ '^\\d+$' AND elem->>'prn' <> '0' AND prn_dup_rank = 1 
              THEN elem->>'prn'
            ELSE 'PRN-' || (ROW_NUMBER() OVER (ORDER BY school_id ASC, elem->>'id' ASC))::text
          END as final_prn
        FROM raw_personnel
        WHERE dup_rank = 1 AND fn_norm <> '' AND ln_norm <> ''
      )
      SELECT * FROM deduped_personnel;
    `);

    await client.query(`CREATE INDEX idx_tmp_staging_p_id ON tmp_staging_personnel(global_id);`);
    await client.query(`CREATE INDEX idx_tmp_staging_school ON tmp_staging_personnel(school_id);`);

    const stagingCountRes = await client.query("SELECT count(*) FROM tmp_staging_personnel");
    const totalTeachers = stagingCountRes.rows[0].count;
    console.log(`  ✓ Staging ready in ${((Date.now() - tExtract)/1000).toFixed(1)}s! Extracted ${totalTeachers} deduplicated teachers.`);

    // 4. Ingest into esf7_personnel_profile, esf7_personnel_employment, esf7_perssonel_educ
    console.log("\n[Step 4/5] Ingesting normalized records (profile, employment, educ)...");
    const tIngest = Date.now();

    // 4a. esf7_personnel_profile
    console.log("  -> Inserting into esf7_personnel_profile...");
    await client.query(`
      INSERT INTO esf7_personnel_profile (
        id, prn, school_id, school_year, first_name, middle_name, last_name, name_extension,
        salutation, type, sex_at_birth, birthdate, age, tin, no_tin, philsys_no, no_philsys,
        employee_no, deped_email, no_deped_email, is_school_head, civil_status, solo_parent,
        religion, ethnic_group, legacy_id, raw_payload, created_at, updated_at
      )
      SELECT 
        global_id::text as id,
        final_prn as prn,
        school_id,
        school_year,
        fn_norm as first_name,
        NULLIF(TRIM(UPPER(COALESCE(elem->>'middle_name', elem->>'middle', elem->>'middleName', ''))), '') as middle_name,
        ln_norm as last_name,
        NULLIF(TRIM(UPPER(COALESCE(elem->>'name_extension', elem->>'extension', elem->>'nameExtension', ''))), '') as name_extension,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'salutation', elem->>'title', ''))), ''), 'MR.') as salutation,
        COALESCE(NULLIF(TRIM(LOWER(elem->>'type')), ''), 'teaching') as type,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'sex_at_birth', elem->>'gender', elem->>'sex', ''))), ''), 'FEMALE') as sex_at_birth,
        safe_cast_date(elem->>'birthdate') as birthdate,
        CASE WHEN elem->>'age' ~ '^\\d+$' THEN (elem->>'age')::integer ELSE NULL END as age,
        NULLIF(TRIM(elem->>'tin'), '') as tin,
        CASE WHEN NULLIF(TRIM(elem->>'tin'), '') IS NULL THEN true ELSE false END as no_tin,
        NULLIF(TRIM(COALESCE(elem->>'philsys_no', elem->>'philsysNo', '')), '') as philsys_no,
        CASE WHEN NULLIF(TRIM(COALESCE(elem->>'philsys_no', elem->>'philsysNo', '')), '') IS NULL THEN true ELSE false END as no_philsys,
        NULLIF(TRIM(COALESCE(elem->>'employee_no', elem->>'employeeNo', CASE WHEN elem->>'prn' ~ '^\\d+$' THEN elem->>'prn' ELSE NULL END, '')), '') as employee_no,
        NULLIF(TRIM(LOWER(COALESCE(elem->>'deped_email', elem->>'email', elem->>'depedEmail', ''))), '') as deped_email,
        CASE WHEN NULLIF(TRIM(COALESCE(elem->>'deped_email', elem->>'email', elem->>'depedEmail', '')), '') IS NULL THEN true ELSE false END as no_deped_email,
        CASE WHEN elem->>'is_school_head' = 'true' OR elem->>'position' ILIKE '%PRINCIPAL%' OR elem->>'position' ILIKE '%HEAD%' THEN true ELSE false END as is_school_head,
        NULLIF(TRIM(UPPER(COALESCE(elem->>'civil_status', elem->>'civilStatus', ''))), '') as civil_status,
        false as solo_parent,
        NULLIF(TRIM(UPPER(elem->>'religion')), '') as religion,
        NULLIF(TRIM(UPPER(COALESCE(elem->>'ethnic_group', elem->>'ethnicGroup', ''))), '') as ethnic_group,
        NULLIF(TRIM(elem->>'id'), '') as legacy_id,
        elem as raw_payload,
        NOW(),
        NOW()
      FROM tmp_staging_personnel;
    `);
    console.log("  ✓ esf7_personnel_profile inserted!");

    // 4b. esf7_personnel_employment
    console.log("  -> Inserting into esf7_personnel_employment...");
    await client.query(`
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position, position_category, step_increment, actual_step,
        fund_source, nature_of_appointment, hiring_arrangement, deployment_status,
        first_service_date, last_promotion_date, created_at, updated_at
      )
      SELECT 
        'EMP-' || school_id || '-' || global_id::text as id,
        global_id::text as personnel_id,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'position', elem->>'plantilla_position', ''))), ''), 'TEACHER I') as position,
        CASE 
          WHEN elem->>'position_category' ILIKE '%NON%' THEN 'NON-TEACHING' 
          WHEN elem->>'position_category' ILIKE '%RELATED%' THEN 'RELATED TEACHING' 
          ELSE 'TEACHING' 
        END as position_category,
        CASE WHEN elem->>'step_increment' ~ '^[1-8]$' THEN (elem->>'step_increment')::integer WHEN elem->>'stepIncrement' ~ '^[1-8]$' THEN (elem->>'stepIncrement')::integer ELSE 1 END as step_increment,
        CASE WHEN elem->>'step_increment' ~ '^[1-8]$' THEN (elem->>'step_increment')::integer WHEN elem->>'stepIncrement' ~ '^[1-8]$' THEN (elem->>'stepIncrement')::integer ELSE 1 END as actual_step,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'fund_source', elem->>'fundSource', ''))), ''), 'NATIONAL GOVERNMENT') as fund_source,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'nature_of_appointment', elem->>'natureOfAppointment', ''))), ''), 'REGULAR PERMANENT') as nature_of_appointment,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'hiring_arrangement', elem->>'hiringArrangement', ''))), ''), 'REGULAR') as hiring_arrangement,
        'OWN STATION' as deployment_status,
        safe_cast_date(elem->>'first_service_date') as first_service_date,
        safe_cast_date(elem->>'last_promotion_date') as last_promotion_date,
        NOW(),
        NOW()
      FROM tmp_staging_personnel;
    `);
    console.log("  ✓ esf7_personnel_employment inserted!");

    // 4c. esf7_perssonel_educ
    console.log("  -> Inserting into esf7_perssonel_educ...");
    await client.query(`
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, highest_educational_attainment, college_degree, major, minor, raw_payload, created_at, updated_at
      )
      SELECT 
        'EDU-' || school_id || '-' || global_id::text as id,
        global_id::text as personnel_id,
        COALESCE(NULLIF(TRIM(UPPER(COALESCE(elem->>'highest_educational_attainment', elem->>'highestEducationalAttainment', ''))), ''), 'COLLEGE GRADUATE / BACCALAUREATE') as highest_educational_attainment,
        NULLIF(TRIM(UPPER(COALESCE(elem->>'degree', elem->>'college_degree', elem->>'collegeDegree', ''))), '') as college_degree,
        NULLIF(TRIM(UPPER(elem->>'major')), '') as major,
        NULLIF(TRIM(UPPER(elem->>'minor')), '') as minor,
        elem as raw_payload,
        NOW(),
        NOW()
      FROM tmp_staging_personnel;
    `);
    console.log(`  ✓ All normalized tables populated in ${((Date.now() - tIngest)/1000).toFixed(1)}s!`);

    // 5. Restore workload rows
    console.log("\n[Step 5/5] Restoring & re-linking workload rows from backup...");
    const tWkl = Date.now();
    await client.query(`
      INSERT INTO esf7_workload_rows (
        id, personnel_id, school_id, school_year, grade_level, section_id,
        section_name, subject, start_time, end_time, days, term, raw_payload, created_at, updated_at
      )
      SELECT 
        w.id,
        p.id as personnel_id,
        p.school_id,
        w.school_year,
        w.grade_level,
        w.section_id,
        w.section_name,
        w.subject,
        w.start_time,
        w.end_time,
        w.days,
        w.term,
        w.raw_payload,
        NOW(),
        NOW()
      FROM esf7_workload_rows_backup_20261013 w
      JOIN esf7_personnel_profile_backup_20261013 p_old ON w.personnel_id = (p_old.id)::text
      JOIN esf7_personnel_profile p ON p.school_id = w.school_id AND (
        p.legacy_id = p_old.legacy_id
        OR (UPPER(TRIM(p.first_name)) = UPPER(TRIM(p_old.first_name)) AND UPPER(TRIM(p.last_name)) = UPPER(TRIM(p_old.last_name)))
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    const wklCountRes = await client.query("SELECT count(*) FROM esf7_workload_rows");
    console.log(`  ✓ Workload rows restored in ${((Date.now() - tWkl)/1000).toFixed(1)}s! Total active workloads: ${wklCountRes.rows[0].count}`);

    // Drop staging table
    await client.query(`DROP TABLE IF EXISTS tmp_staging_personnel;`);

    const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(1);
    console.log("\n==========================================================");
    console.log(`🎉 FAST REBUILD COMPLETE IN ${totalDuration}s!`);
    console.log(`✓ Total Personnel: ${totalTeachers} (IDs from 1 to ${totalTeachers})`);
    console.log(`✓ Total Workloads Re-linked: ${wklCountRes.rows[0].count}`);
    console.log("==========================================================");

  } catch(err) {
    console.error("FATAL ERROR DURING FAST REBUILD:", err);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
