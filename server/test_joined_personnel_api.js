const db = require('./db');

async function testJoinedFlow() {
  console.log('Testing full joined flow for esf7_personnel_profile + esf7_personnel_employment...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-108348-001'`);

  // Insert profile
  const profileRes = await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name,
      tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age, raw_payload
    ) VALUES (
      'PER-108348-001', 'PRN-100200300400', '108348', '2026-2027', 'teaching', 'MR.', 'MARIA', 'CLARA', 'SANTOS',
      '987-654-321', false, 'FEMALE', 'SINGLE', false, 'ROMAN CATHOLIC', 'TAGALOG', '1992-03-20', 34,
      '{"firstName": "MARIA", "lastName": "SANTOS"}'::jsonb
    )
    RETURNING *;
  `);

  // Insert employment
  const empRes = await db.query(`
    INSERT INTO esf7_personnel_employment (
      id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment,
      hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught, raw_payload
    ) VALUES (
      'EMP-108348-001', 'PER-108348-001', 'TEACHING', 'MASTER TEACHER I', 3, 'NATIONAL', 'REGULAR PERMANENT',
      'PERMANENT', 'OWN STATION', '["Majayjay ES"]'::jsonb, '["Grade 5", "Grade 6"]'::jsonb,
      '{"positionCategory": "TEACHING", "position": "MASTER TEACHER I"}'::jsonb
    )
    RETURNING *;
  `);

  // Query Left Join
  const joinQuery = `
    SELECT 
      p.*,
      e.id AS emp_id,
      e.position_category,
      e.position,
      e.step_increment,
      e.fund_source,
      e.nature_of_appointment,
      e.hiring_arrangement,
      e.deployment_status,
      e.assigned_schools,
      e.grade_levels_taught,
      e.first_service_date,
      e.last_promotion_date,
      e.new_station_date,
      e.last_lateral_movement_date,
      e.raw_payload AS employment_raw_payload
    FROM esf7_personnel_profile p
    LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
    WHERE p.id = 'PER-108348-001'
  `;

  const result = await db.query(joinQuery);
  console.log('✅ Query Joined Result Count:', result.rows.length);
  const row = result.rows[0];
  console.log('Personnel ID:', row.id);
  console.log('Full Name:', `${row.salutation} ${row.first_name} ${row.last_name}`);
  console.log('Position Category:', row.position_category);
  console.log('Position:', row.position);
  console.log('Step Increment:', row.step_increment);
  console.log('Assigned Schools (JSONB):', row.assigned_schools);
  console.log('Grade Levels Taught (JSONB):', row.grade_levels_taught);

  // Test ON DELETE CASCADE
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-108348-001'`);
  const checkEmp = await db.query(`SELECT COUNT(*) FROM esf7_personnel_employment WHERE id = 'EMP-108348-001'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkEmp.rows[0].count);

  process.exit(0);
}

testJoinedFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
