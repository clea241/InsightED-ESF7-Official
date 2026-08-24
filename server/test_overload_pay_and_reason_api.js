const db = require('./db');

async function testOverloadPayAndReasonFlow() {
  console.log('Testing overload_pay_and_reason insertion, JSONB reasons array, month, net_term_pay, and CASCADE deletion...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-014'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name)
    VALUES ('PER-TEST-014', 'PRN-014014014014', '108348', '2026-2027', 'GRACIANO', 'LOPEZ JAENA')
  `);

  // 2. Insert Overload Pay Record
  const oprRes = await db.query(`
    INSERT INTO overload_pay_and_reason (
      id, personnel_id, school_id, school_year, term, month,
      overload_hours, overload_pay, net_term_pay, reasons, raw_payload
    ) VALUES (
      'OPR-108348-014', 'PER-TEST-014', '108348', '2026-2027', 'Term 1', 'September',
      24.00, 7500.50, 6800.00, '["Teacher Shortage", "Relieving Duty"]'::jsonb, '{"saved": true}'::jsonb
    ) RETURNING *
  `);

  console.log('✅ Created Overload Pay and Reason Record:');
  const row = oprRes.rows[0];
  console.log('ID:', row.id, '| Teacher:', row.personnel_id, '| Term:', row.term, '| Month:', row.month);
  console.log('Hours:', row.overload_hours, '| Gross Pay: ₱' + row.overload_pay, '| Net Term Pay: ₱' + row.net_term_pay);
  console.log('Reasons JSONB:', row.reasons);

  // 3. Query record
  const checkRes = await db.query(`SELECT * FROM overload_pay_and_reason WHERE personnel_id = 'PER-TEST-014'`);
  console.log('✅ Retrieved Overload Record Count:', checkRes.rows.length);

  // 4. Test CASCADE Deletion
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-014'`);
  const checkDel = await db.query(`SELECT COUNT(*) FROM overload_pay_and_reason WHERE personnel_id = 'PER-TEST-014'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkDel.rows[0].count);

  process.exit(0);
}

testOverloadPayAndReasonFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
