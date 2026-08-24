const db = require('./db');

async function testSchoolHeadField() {
  console.log('Testing is_school_head column in esf7_personnel_profile...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-HEAD'`);

  const res = await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name, is_school_head
    ) VALUES (
      'PER-TEST-HEAD', 'PRN-HEAD-999', '108348', '2026-2027', 'JUAN', 'DELA CRUZ', true
    ) RETURNING id, first_name, last_name, is_school_head;
  `);

  console.log('✅ Inserted School Head Record:');
  console.log(res.rows[0]);

  if (res.rows[0].is_school_head !== true) {
    throw new Error('Expected is_school_head to be true!');
  }

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-HEAD'`);
  console.log('✅ Cleaned up test record.');
  process.exit(0);
}

testSchoolHeadField().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
