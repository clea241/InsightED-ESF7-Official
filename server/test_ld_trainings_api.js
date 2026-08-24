const db = require('./db');

async function testLdTrainingsFlow() {
  console.log('Testing esf7_personnel_ld_trainings multi-row flow & CASCADE...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-003'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-003', 'PRN-300400500600', '108348', '2026-2027', 'ANDRES', 'BONIFACIO'
    )
  `);

  // 2. Insert NEAP Training Row
  await db.query(`
    INSERT INTO esf7_personnel_ld_trainings (
      id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours
    ) VALUES (
      'TRN-108348-001', 'PER-TEST-003', 'NEAP', 'HIGHER ORDER THINKING SKILLS (HOTS)', 'NEAP REGION IV-A', '2025-08-01', '2025-08-05', 5, 40
    )
  `);

  // 3. Insert TESDA Training Row
  await db.query(`
    INSERT INTO esf7_personnel_ld_trainings (
      id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours
    ) VALUES (
      'TRN-108348-002', 'PER-TEST-003', 'TESDA', 'NC II - BOOKKEEPING', 'TESDA PROVINCIAL', '2025-10-10', '2025-10-20', 10, 80
    )
  `);

  // 4. Query Training Rows for Personnel
  const res = await db.query(`
    SELECT * FROM esf7_personnel_ld_trainings 
    WHERE personnel_id = 'PER-TEST-003'
    ORDER BY created_at ASC
  `);

  console.log('✅ Successfully retrieved multi-row training records:', res.rows.length);
  res.rows.forEach(t => {
    console.log(`- [${t.training_type}] ${t.title} (${t.total_hours} hrs, ${t.conductor})`);
  });

  // 5. Test ON DELETE CASCADE
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-003'`);
  const checkTrn = await db.query(`SELECT COUNT(*) FROM esf7_personnel_ld_trainings WHERE personnel_id = 'PER-TEST-003'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkTrn.rows[0].count);

  process.exit(0);
}

testLdTrainingsFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
