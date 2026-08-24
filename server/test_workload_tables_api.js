const db = require('./db');

async function testWorkloadTablesFlow() {
  console.log('Testing esf7_workload_rows & esf7_shs_workload_rows insertion & querying...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-008'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-008', 'PRN-800900100200', '108348', '2026-2027', 'ANDRES', 'BONIFACIO'
    )
  `);

  // 2. Insert Elem/JHS Workload Row into esf7_workload_rows
  await db.query(`
    INSERT INTO esf7_workload_rows (
      id, personnel_id, school_id, school_year, grade_level, section_name,
      subject, start_time, end_time, days, raw_payload
    ) VALUES (
      'WKL-108348-008', 'PER-TEST-008', '108348', '2026-2027', 'Grade 7', 'ROSE',
      'MATHEMATICS', '08:00:00', '09:00:00', '["M","T","W","TH","F"]'::jsonb, '{"subject": "MATHEMATICS"}'::jsonb
    )
  `);

  // 3. Insert SHS Workload Row (1st Term) into esf7_shs_workload_rows
  await db.query(`
    INSERT INTO esf7_shs_workload_rows (
      id, personnel_id, school_id, school_year, term, grade_level, track_strand, shs_subject_category, section_name,
      subject, start_time, end_time, days, raw_payload
    ) VALUES (
      'SHS-WKL-108348-008', 'PER-TEST-008', '108348', '2026-2027', '1st', 'Grade 11', 'ACADEMIC - STEM', 'SHS-CORE SUBJECTS', 'EAGLE',
      'GENERAL MATHEMATICS', '09:00:00', '11:00:00', '["M","W","F"]'::jsonb, '{"subject": "GENERAL MATHEMATICS", "term": "1st"}'::jsonb
    )
  `);

  // 4. Query Elem/JHS Workload Rows
  const resElem = await db.query(`SELECT * FROM esf7_workload_rows WHERE personnel_id = 'PER-TEST-008'`);
  console.log('✅ Successfully retrieved Elem/JHS Workload Record:');
  console.log('ID:', resElem.rows[0].id);
  console.log('Subject:', resElem.rows[0].subject);
  console.log('Grade:', resElem.rows[0].grade_level);
  console.log('Schedule:', `${resElem.rows[0].start_time} - ${resElem.rows[0].end_time}`);

  // 5. Query SHS Workload Rows
  const resShs = await db.query(`SELECT * FROM esf7_shs_workload_rows WHERE personnel_id = 'PER-TEST-008' AND term = '1st'`);
  console.log('✅ Successfully retrieved SHS 1st Term Workload Record:');
  console.log('ID:', resShs.rows[0].id);
  console.log('Term:', resShs.rows[0].term);
  console.log('SHS Subject:', resShs.rows[0].subject);
  console.log('Track/Strand:', resShs.rows[0].track_strand);

  // 6. Test CASCADE Deletion
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-008'`);
  const checkElem = await db.query(`SELECT COUNT(*) FROM esf7_workload_rows WHERE personnel_id = 'PER-TEST-008'`);
  const checkShs = await db.query(`SELECT COUNT(*) FROM esf7_shs_workload_rows WHERE personnel_id = 'PER-TEST-008'`);
  console.log('✅ ON DELETE CASCADE check (Elem count & SHS count should be 0):', checkElem.rows[0].count, checkShs.rows[0].count);

  process.exit(0);
}

testWorkloadTablesFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
