const db = require('./db');

async function testAbsencesAndTransferFlow() {
  console.log('Testing overload_absences & esf7_workload_transfer insertion, linking, and cascading deletion...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id IN ('PER-TEST-010', 'PER-TEST-011')`);

  // 1. Insert 2 Profiles (Absent Teacher & Relieving Teacher)
  await db.query(`
    INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name)
    VALUES
      ('PER-TEST-010', 'PRN-010010010010', '108348', '2026-2027', 'JUAN', 'LUNA'),
      ('PER-TEST-011', 'PRN-011011011011', '108348', '2026-2027', 'APOLINARIO', 'MABINI')
  `);

  // 2. Insert Absence Record for Juan Luna (Absent)
  const absRes = await db.query(`
    INSERT INTO overload_absences (
      id, personnel_id, school_id, school_year, start_date, end_date, leave_type, total_days, raw_payload
    ) VALUES (
      'ABS-108348-010', 'PER-TEST-010', '108348', '2026-2027',
      '2026-09-14', '2026-09-15', 'SICK_LEAVE', 2, '{"reason": "Sick Leave"}'::jsonb
    ) RETURNING *
  `);
  console.log('✅ Created Absence Record:');
  console.log('ID:', absRes.rows[0].id, '| Teacher:', absRes.rows[0].personnel_id, '| Leave:', absRes.rows[0].leave_type);

  // 3. Insert Workload Transfer to Apolinario Mabini (Relieving Teacher)
  const trfRes = await db.query(`
    INSERT INTO esf7_workload_transfer (
      id, school_id, school_year, absent_personnel_id, relieving_personnel_id, absence_id,
      workload_id, workload_type, subject, start_date, end_date, relieving_hours, raw_payload
    ) VALUES (
      'TRF-108348-010', '108348', '2026-2027', 'PER-TEST-010', 'PER-TEST-011', 'ABS-108348-010',
      'WKL-108348-001', 'ELEM_JHS', 'MATHEMATICS', '2026-09-14', '2026-09-15', 1.00, '{"subject": "MATHEMATICS"}'::jsonb
    ) RETURNING *
  `);
  console.log('✅ Created Workload Transfer Record (Relieving Duty):');
  console.log('ID:', trfRes.rows[0].id, '| Relieving Teacher:', trfRes.rows[0].relieving_personnel_id, '| Subject:', trfRes.rows[0].subject, '| Hours:', trfRes.rows[0].relieving_hours);

  // 4. Test CASCADE Deletion of Profile
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id IN ('PER-TEST-010', 'PER-TEST-011')`);
  const checkAbs = await db.query(`SELECT COUNT(*) FROM overload_absences WHERE id = 'ABS-108348-010'`);
  const checkTrf = await db.query(`SELECT COUNT(*) FROM esf7_workload_transfer WHERE id = 'TRF-108348-010'`);
  console.log('✅ ON DELETE CASCADE check (Absences count & Transfer count should be 0):', checkAbs.rows[0].count, checkTrf.rows[0].count);

  process.exit(0);
}

testAbsencesAndTransferFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
