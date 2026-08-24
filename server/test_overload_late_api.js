const db = require('./db');

async function testOverloadLateFlow() {
  console.log('Testing overload_late insertion, querying, and cascading deletion...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-012'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name)
    VALUES ('PER-TEST-012', 'PRN-012012012012', '108348', '2026-2027', 'GABRIELA', 'SILANG')
  `);

  // 2. Insert Tardiness Date
  const lateRes = await db.query(`
    INSERT INTO overload_late (
      id, personnel_id, school_id, school_year, tardiness_date
    ) VALUES (
      'LTE-108348-012', 'PER-TEST-012', '108348', '2026-2027', '2026-09-18'
    ) RETURNING *
  `);
  console.log('✅ Created Overload Late Record:');
  const dStr = lateRes.rows[0].tardiness_date instanceof Date ? lateRes.rows[0].tardiness_date.toISOString().split('T')[0] : String(lateRes.rows[0].tardiness_date).split('T')[0];
  console.log('ID:', lateRes.rows[0].id, '| Teacher:', lateRes.rows[0].personnel_id, '| Tardiness Date:', dStr);

  // 3. Query Tardiness
  const checkQuery = await db.query(`SELECT * FROM overload_late WHERE personnel_id = 'PER-TEST-012'`);
  console.log('✅ Retrieved Tardiness Record Count:', checkQuery.rows.length);

  // 4. Test CASCADE Deletion
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-012'`);
  const checkDel = await db.query(`SELECT COUNT(*) FROM overload_late WHERE personnel_id = 'PER-TEST-012'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkDel.rows[0].count);

  process.exit(0);
}

testOverloadLateFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
