const db = require('./db');

async function testTeachingTabConnection() {
  console.log('Testing Teaching Tab fields connected in esf7_personnel_employment...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-005'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-005', 'PRN-500600700800', '108348', '2026-2027', 'MELCHORA', 'AQUINO'
    )
  `);

  // 2. Insert Employment with Teaching Tab fields (assignedGradeLevels & teachesShs)
  const assignedGrades = ['Grade 7', 'Grade 8', 'Grade 11'];
  await db.query(`
    INSERT INTO esf7_personnel_employment (
      id, personnel_id, position_category, position, fund_source, nature_of_appointment, hiring_arrangement,
      grade_levels_taught, raw_payload
    ) VALUES (
      'EMP-108348-005', 'PER-TEST-005', 'TEACHING', 'TEACHER II', 'NATIONAL', 'REGULAR PERMANENT', 'PERMANENT',
      $1::jsonb, $2::jsonb
    )
  `, [JSON.stringify(assignedGrades), JSON.stringify({ teachesShs: true })]);

  // 3. Query Joined Record
  const res = await db.query(`
    SELECT 
      p.id, p.first_name, p.last_name,
      e.position_category, e.position, e.grade_levels_taught, e.raw_payload AS emp_raw
    FROM esf7_personnel_profile p
    JOIN esf7_personnel_employment e ON p.id = e.personnel_id
    WHERE p.id = 'PER-TEST-005'
  `);

  console.log('✅ Successfully retrieved employment record with Teaching tab fields:');
  const row = res.rows[0];
  console.log('Personnel:', `${row.first_name} ${row.last_name}`);
  console.log('Category:', row.position_category);
  console.log('Position:', row.position);
  console.log('Assigned Grade Levels (JSONB):', row.grade_levels_taught);
  console.log('Teaches SHS Flag:', row.emp_raw.teachesShs);

  // Clean up
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-005'`);
  console.log('🧹 Cleaned up test records.');
  process.exit(0);
}

testTeachingTabConnection().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
