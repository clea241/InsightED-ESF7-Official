const { pool } = require('../db');

async function truncateAllTablesExceptSalaryMatrix() {
  const client = await pool.connect();
  try {
    console.log('Fetching list of tables in insighted_esf7...');
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_type='BASE TABLE'
        AND table_name != 'salary_matrix'
      ORDER BY table_name;
    `);

    const tables = res.rows.map(r => `"${r.table_name}"`);
    if (tables.length === 0) {
      console.log('No tables to truncate.');
      return;
    }

    console.log(`Truncating ${tables.length} tables (excluding salary_matrix)...`);
    await client.query('BEGIN;');
    const truncateSql = `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`;
    await client.query(truncateSql);
    await client.query('COMMIT;');

    console.log('✅ Successfully truncated all tables in insighted_esf7 (salary_matrix preserved)!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Error truncating tables:', err);
  } finally {
    client.release();
    process.exit();
  }
}

truncateAllTablesExceptSalaryMatrix();
