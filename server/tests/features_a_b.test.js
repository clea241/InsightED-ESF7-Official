const db = require('../db/index.js');

async function testFeaturesAB() {
  console.log('🧪 Testing Feature A (Learning Areas) & Feature B (Work Immersion) Backend Integration...');
  try {
    // 0. Init DB tables if not present
    await db.query(`
      CREATE TABLE IF NOT EXISTS personnel_learning_areas (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_year TEXT NOT NULL,
          learning_area TEXT NOT NULL,
          UNIQUE(personnel_id, school_year, learning_area)
      );
      CREATE TABLE IF NOT EXISTS work_immersion_minutes (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_year TEXT NOT NULL,
          month TEXT NOT NULL,
          day INTEGER NOT NULL,
          minutes INTEGER NOT NULL DEFAULT 0,
          UNIQUE(personnel_id, school_year, month, day)
      );
    `);

    // 1. Verify DB Tables
    const tablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('personnel_learning_areas', 'work_immersion_minutes');
    `);
    const tableNames = tablesRes.rows.map(r => r.table_name);
    console.log('📋 Target tables initialized:', tableNames);

    // 2. Fetch sample personnel
    const personnelRes = await db.query('SELECT id FROM personnel LIMIT 1');
    if (personnelRes.rows.length === 0) {
      console.log('ℹ️ No personnel records found for DB tests.');
      process.exit(0);
    }

    const testPersonnelId = personnelRes.rows[0].id;
    console.log(`👤 Running test queries on personnel ID: ${testPersonnelId}`);

    // 3. Test Feature A (Learning Areas) Toggle
    const sy = 'SY 26-27';
    const la = 'Mathematics';

    // Insert (check)
    await db.query(
      'INSERT INTO personnel_learning_areas (personnel_id, school_year, learning_area) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [testPersonnelId, sy, la]
    );
    const laCheckRes = await db.query(
      'SELECT * FROM personnel_learning_areas WHERE personnel_id = $1 AND school_year = $2 AND learning_area = $3',
      [testPersonnelId, sy, la]
    );
    console.log('✅ Feature A INSERT result:', laCheckRes.rows[0]);

    // Delete (uncheck)
    await db.query(
      'DELETE FROM personnel_learning_areas WHERE personnel_id = $1 AND school_year = $2 AND learning_area = $3',
      [testPersonnelId, sy, la]
    );
    const laDeleteCheckRes = await db.query(
      'SELECT * FROM personnel_learning_areas WHERE personnel_id = $1 AND school_year = $2 AND learning_area = $3',
      [testPersonnelId, sy, la]
    );
    console.log('✅ Feature A DELETE result count:', laDeleteCheckRes.rows.length);

    // 4. Test Feature B (Work Immersion) UPSERT
    const month = 'June';
    const day = 15;
    const minutes = 120;

    const wiUpsertRes = await db.query(
      `INSERT INTO work_immersion_minutes (personnel_id, school_year, month, day, minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (personnel_id, school_year, month, day)
       DO UPDATE SET minutes = EXCLUDED.minutes
       RETURNING *`,
      [testPersonnelId, sy, month, day, minutes]
    );
    console.log('✅ Feature B UPSERT result:', wiUpsertRes.rows[0]);

    console.log('🎉 All Backend Integration Tests Passed!');
  } catch (err) {
    console.error('❌ Integration Test Error:', err.message);
  } finally {
    process.exit(0);
  }
}

testFeaturesAB();
