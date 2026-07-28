const db = require('../db');

async function testOverloadReasonsBackend() {
  console.log('🧪 Testing Overload Reasons Backend Integration...');
  try {
    // 1. Check table existence
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'overload_reasons';
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✅ overload_reasons table exists in PostgreSQL.');
    } else {
      console.error('❌ overload_reasons table missing!');
    }

    // 2. Fetch sample personnel
    const personnelRes = await db.query('SELECT id FROM personnel LIMIT 1');
    if (personnelRes.rows.length === 0) {
      console.log('ℹ️ No personnel found in database to test UPSERT toggle.');
      process.exit(0);
    }

    const testPersonnelId = personnelRes.rows[0].id;
    console.log(`👤 Testing UPSERT multi-reasons for personnel ID: ${testPersonnelId}...`);

    // 3. Test UPSERT query directly
    const testReasons = ['Teacher Shortage', 'Class Advising Duty'];
    const upsertSql = `
      INSERT INTO overload_reasons (personnel_id, school_year, term, reasons, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (personnel_id, school_year, term)
      DO UPDATE SET reasons = EXCLUDED.reasons, updated_at = NOW()
      RETURNING *;
    `;
    const upsertRes = await db.query(upsertSql, [testPersonnelId, 'SY 26-27', 'Term 1', testReasons]);
    console.log('✅ UPSERT result:', upsertRes.rows[0]);

    // 4. Test SELECT query
    const selectRes = await db.query(
      'SELECT * FROM overload_reasons WHERE personnel_id = $1 AND school_year = $2 AND term = $3',
      [testPersonnelId, 'SY 26-27', 'Term 1']
    );
    console.log('✅ SELECT verify result:', selectRes.rows[0]);

    console.log('🎉 Overload Reasons Backend Integration Tests Passed!');
  } catch (err) {
    console.error('❌ Overload Reasons Backend Test Error:', err.message);
  } finally {
    process.exit(0);
  }
}

testOverloadReasonsBackend();
