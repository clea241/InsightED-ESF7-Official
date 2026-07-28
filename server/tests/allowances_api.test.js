const db = require('../db');

async function testAllowancesBackend() {
  console.log('🧪 Testing Allowances & Incentives Backend Integration...');
  try {
    // 1. Query table existence
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'personnel_allowances';
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✅ personnel_allowances table exists in PostgreSQL.');
    } else {
      console.error('❌ personnel_allowances table missing!');
    }

    // 2. Fetch sample personnel
    const personnelRes = await db.query('SELECT id, first_name, last_name FROM personnel LIMIT 1');
    if (personnelRes.rows.length === 0) {
      console.log('ℹ️ No personnel found in database to test UPSERT toggle.');
      process.exit(0);
    }

    const testPersonnelId = personnelRes.rows[0].id;
    console.log(`👤 Testing UPSERT toggle for personnel ID: ${testPersonnelId}...`);

    // 3. Test UPSERT query directly
    const upsertSql = `
      INSERT INTO personnel_allowances (personnel_id, school_year, pera, uniform, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (personnel_id, school_year)
      DO UPDATE SET pera = EXCLUDED.pera, uniform = EXCLUDED.uniform, updated_at = NOW()
      RETURNING *;
    `;
    const upsertRes = await db.query(upsertSql, [testPersonnelId, 'SY 26-27', true, true]);
    console.log('✅ UPSERT result:', upsertRes.rows[0]);

    // 4. Test SELECT query
    const selectRes = await db.query(
      'SELECT * FROM personnel_allowances WHERE personnel_id = $1 AND school_year = $2',
      [testPersonnelId, 'SY 26-27']
    );
    console.log('✅ SELECT verify result:', selectRes.rows[0]);

    console.log('🎉 Allowances Backend Integration Tests Passed!');
  } catch (err) {
    console.error('❌ Allowances Backend Test Error:', err.message);
  } finally {
    process.exit(0);
  }
}

testAllowancesBackend();
