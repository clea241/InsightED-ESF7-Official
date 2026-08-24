const db = require('./db');

async function testAllowancesTablesFlow() {
  console.log('Testing esf7_personnel_allowances paired boolean/amount insertion & default false record creation...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-009'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (
      id, prn, school_id, school_year, first_name, last_name
    ) VALUES (
      'PER-TEST-009', 'PRN-900100200300', '108348', '2026-2027', 'MELCHORA', 'AQUINO'
    )
  `);

  // 2. Insert Default Record (All FALSE, but amounts present)
  await db.query(`
    INSERT INTO esf7_personnel_allowances (
      id, personnel_id, school_id, school_year,
      has_pera, pera_amount,
      has_uniform, uniform_amount,
      has_supplies, supplies_amount,
      has_medical, medical_amount,
      has_hardship, hardship_amount,
      raw_payload
    ) VALUES (
      'ALW-108348-009', 'PER-TEST-009', '108348', '2026-2027',
      false, 2000.00,
      false, 7000.00,
      false, 10000.00,
      false, 7000.00,
      false, 0.00,
      '{"status": "all_false"}'::jsonb
    )
  `);

  // 3. Query Record
  const res = await db.query(`SELECT * FROM esf7_personnel_allowances WHERE personnel_id = 'PER-TEST-009'`);
  console.log('✅ Successfully retrieved Allowances Record for profile even when all flags are FALSE:');
  const row = res.rows[0];
  console.log('ID:', row.id);
  console.log('PERA:', row.has_pera, 'Amount:', row.pera_amount);
  console.log('Uniform:', row.has_uniform, 'Amount:', row.uniform_amount);
  console.log('Supplies:', row.has_supplies, 'Amount:', row.supplies_amount);
  console.log('Medical:', row.has_medical, 'Amount:', row.medical_amount);
  console.log('Hardship:', row.has_hardship, 'Amount:', row.hardship_amount);

  // 4. Test Toggle to TRUE
  await db.query(`
    UPDATE esf7_personnel_allowances
    SET has_pera = true, pera_amount = 2000.00, updated_at = NOW()
    WHERE personnel_id = 'PER-TEST-009'
  `);
  const checkUpdated = await db.query(`SELECT has_pera, pera_amount FROM esf7_personnel_allowances WHERE personnel_id = 'PER-TEST-009'`);
  console.log('✅ Toggle PERA to true check:', checkUpdated.rows[0].has_pera, 'Amount:', checkUpdated.rows[0].pera_amount);

  // 5. Test CASCADE Deletion
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-009'`);
  const checkDel = await db.query(`SELECT COUNT(*) FROM esf7_personnel_allowances WHERE personnel_id = 'PER-TEST-009'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkDel.rows[0].count);

  process.exit(0);
}

testAllowancesTablesFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
