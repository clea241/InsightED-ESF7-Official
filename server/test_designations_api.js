const db = require('./db');

async function testDesignationsFlow() {
  console.log('Testing esf7_personnel_designations insertion & sds_confirmed column...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-006'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-006', 'PRN-600700800900', '108348', '2026-2027', 'GABRIELA', 'SILANG'
    )
  `);

  // 2. Insert Designation with is_sds_approved = true and sds_confirmed = true
  await db.query(`
    INSERT INTO esf7_personnel_designations (
      id, personnel_id, designation_name, grade_level, subject_area, track,
      is_sds_approved, sds_confirmed, serialized_key, raw_payload
    ) VALUES (
      'DSG-108348-006', 'PER-TEST-006', 'DEPARTMENT HEAD', 'Grade 7', 'Mathematics', 'ACADEMIC',
      true, true, 'DEPARTMENT HEAD - Grade 7 - Mathematics::APPROVED_SDS',
      '{"designationName": "DEPARTMENT HEAD", "sdsConfirmed": true}'::jsonb
    )
  `);

  // 3. Query Designations for Personnel
  const res = await db.query(`
    SELECT 
      p.id, p.first_name, p.last_name,
      d.id AS dsg_id, d.designation_name, d.serialized_key, d.is_sds_approved, d.sds_confirmed
    FROM esf7_personnel_profile p
    JOIN esf7_personnel_designations d ON p.id = d.personnel_id
    WHERE p.id = 'PER-TEST-006'
  `);

  console.log('✅ Successfully retrieved designation record:');
  const row = res.rows[0];
  console.log('Personnel:', `${row.first_name} ${row.last_name}`);
  console.log('DSG ID:', row.dsg_id);
  console.log('Designation Name:', row.designation_name);
  console.log('Serialized Key:', row.serialized_key);
  console.log('IS SDS APPROVED:', row.is_sds_approved);
  console.log('SDS CONFIRMED Column (External Repo):', row.sds_confirmed);

  // 4. Test ON DELETE CASCADE
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-006'`);
  const checkDSG = await db.query(`SELECT COUNT(*) FROM esf7_personnel_designations WHERE personnel_id = 'PER-TEST-006'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkDSG.rows[0].count);

  process.exit(0);
}

testDesignationsFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
