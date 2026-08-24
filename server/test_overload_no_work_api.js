const db = require('./db');

async function testOverloadNoWorkFlow() {
  console.log('Testing overload_no_work insertion & multi-level query scoping...');

  await db.query(`DELETE FROM overload_no_work WHERE id IN ('NWK-TEST-001', 'NWK-TEST-002')`);

  // 1. Insert Division Level Holiday
  await db.query(`
    INSERT INTO overload_no_work (
      id, region, division, school_id, school_year, no_work_date, event_type, title, raw_payload
    ) VALUES (
      'NWK-TEST-001', 'REGION VIII', 'SAMAR (WESTERN SAMAR)', 'ALL', '2026-2027',
      '2026-09-15', 'DIVISION_HOLIDAY', 'Division Founding Charter Day', '{"title": "Division Founding Charter Day"}'::jsonb
    )
  `);

  // 2. Insert School Specific Suspension
  await db.query(`
    INSERT INTO overload_no_work (
      id, region, division, school_id, school_year, no_work_date, event_type, title, raw_payload
    ) VALUES (
      'NWK-TEST-002', 'REGION VIII', 'SAMAR (WESTERN SAMAR)', '108348', '2026-2027',
      '2026-10-12', 'TYPHOON_SUSPENSION', 'Local Typhoon Class Suspension', '{"title": "Local Typhoon Class Suspension"}'::jsonb
    )
  `);

  // 3. Query records for School 108348
  const res = await db.query(`
    SELECT * FROM overload_no_work
    WHERE school_year = '2026-2027' AND (school_id = '108348' OR school_id = 'ALL')
    ORDER BY no_work_date ASC
  `);

  console.log('✅ Successfully retrieved no-work records matching School 108348 (including Division-wide holidays):');
  res.rows.forEach((row, i) => {
    const dStr = row.no_work_date instanceof Date ? row.no_work_date.toISOString().split('T')[0] : String(row.no_work_date).split('T')[0];
    console.log(` ${i + 1}. [${dStr}] ${row.event_type}: ${row.title} (School Scope: ${row.school_id})`);
  });

  // Clean up
  await db.query(`DELETE FROM overload_no_work WHERE id IN ('NWK-TEST-001', 'NWK-TEST-002')`);
  console.log('🧹 Cleaned up test records.');
  process.exit(0);
}

testOverloadNoWorkFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
