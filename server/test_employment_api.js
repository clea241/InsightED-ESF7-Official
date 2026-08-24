const db = require('./db');

async function testEmploymentFlow() {
  console.log('Testing esf7_personnel_employment insertion & FK join...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-001'`);

  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-001', 'PRN-999', '108348', '2026-2027', 'JUAN', 'CRUZ'
    )
  `);

  await db.query(`
    INSERT INTO esf7_personnel_employment (
      id, personnel_id, position_category, position, step_increment, fund_source,
      nature_of_appointment, hiring_arrangement, assigned_schools, grade_levels_taught, raw_payload
    ) VALUES (
      'EMP-108348-001', 'PER-TEST-001', 'TEACHING', 'TEACHER I', 2, 'NATIONAL',
      'REGULAR PERMANENT', 'PERMANENT', '["School A", "School B"]'::jsonb, '["Grade 7", "Grade 8"]'::jsonb,
      '{"positionCategory": "TEACHING", "assignedSchools": ["School A", "School B"]}'::jsonb
    )
  `);

  const res = await db.query(`
    SELECT e.*, p.first_name, p.last_name, p.prn
    FROM esf7_personnel_employment e
    JOIN esf7_personnel_profile p ON e.personnel_id = p.id
    WHERE p.id = 'PER-TEST-001'
  `);

  console.log('✅ Successfully joined Record:');
  console.log('EMP ID:', res.rows[0].id);
  console.log('Personnel:', `${res.rows[0].first_name} ${res.rows[0].last_name}`);
  console.log('Category:', res.rows[0].position_category);
  console.log('Position:', res.rows[0].position);
  console.log('Assigned Schools (JSONB):', res.rows[0].assigned_schools);
  console.log('Grade Levels Taught (JSONB):', res.rows[0].grade_levels_taught);

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-001'`);
  console.log('🧹 Cleaned up sample test records.');
  process.exit(0);
}

testEmploymentFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
