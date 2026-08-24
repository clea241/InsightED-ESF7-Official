const db = require('./db');

async function testSchoolProfileFlow() {
  console.log('Testing esf7_school_profile insertion and querying...');

  await db.query(`DELETE FROM esf7_school_profile WHERE school_id = '108348'`);

  // 1. Insert School Profile
  const res = await db.query(`
    INSERT INTO esf7_school_profile (
      id, school_id, school_year, has_elem_special_programs, has_jhs_special_programs,
      jhs_special_programs, shs_curriculum_model, raw_payload
    ) VALUES (
      'SCH-PROFILE-108348', '108348', '2026-2027', true, true,
      '["SPA", "STE", "SPJ"]'::jsonb, 'Standard K-12 SHS Curriculum', '{"test": true}'::jsonb
    ) RETURNING *
  `);

  console.log('✅ Created School Profile Record:');
  const row = res.rows[0];
  console.log('ID:', row.id, '| School ID:', row.school_id);
  console.log('Elem Programs:', row.has_elem_special_programs);
  console.log('JHS Programs Flag:', row.has_jhs_special_programs);
  console.log('JHS Programs JSONB:', row.jhs_special_programs);
  console.log('SHS Model:', row.shs_curriculum_model);

  // 2. Query
  const checkRes = await db.query(`SELECT * FROM esf7_school_profile WHERE school_id = '108348'`);
  console.log('✅ Retrieved School Profile Count:', checkRes.rows.length);

  // Cleanup
  await db.query(`DELETE FROM esf7_school_profile WHERE school_id = '108348'`);
  process.exit(0);
}

testSchoolProfileFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
