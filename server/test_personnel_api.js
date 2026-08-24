const db = require('./db');

async function testPersonnelFlow() {
  console.log('Testing esf7_personnel_profile insertion & retrieval...');

  const insertQuery = `
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name,
      tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age, raw_payload
    ) VALUES (
      'PER-108348-001', 'PRN-998877665544', '108348', '2026-2027', 'teaching', 'MR.', 'JUAN', 'DELA', 'CRUZ',
      '123-456-789', false, 'MALE', 'MARRIED', false, 'ROMAN CATHOLIC', 'TAGALOG', '1988-06-15', 38,
      '{"firstName": "JUAN", "lastName": "CRUZ", "salaryGrade": 11}'::jsonb
    )
    RETURNING *;
  `;

  await db.query('DELETE FROM esf7_personnel_profile WHERE id = \'PER-108348-001\'');
  const res = await db.query(insertQuery);
  console.log('✅ Successfully inserted sample personnel record:');
  console.log('ID:', res.rows[0].id);
  console.log('Name:', `${res.rows[0].salutation} ${res.rows[0].first_name} ${res.rows[0].last_name}`);
  console.log('PRN:', res.rows[0].prn);
  console.log('Raw Payload:', res.rows[0].raw_payload);

  const fetchRes = await db.query('SELECT * FROM esf7_personnel_profile WHERE id = \'PER-108348-001\'');
  console.log('✅ Successfully queried record. Count:', fetchRes.rows.length);

  await db.query('DELETE FROM esf7_personnel_profile WHERE id = \'PER-108348-001\'');
  console.log('🧹 Cleaned up sample record.');
  process.exit(0);
}

testPersonnelFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
