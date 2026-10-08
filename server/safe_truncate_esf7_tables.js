const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

// Tables that MUST NEVER be truncated or touched:
const PROTECTED_TABLES = new Set([
  'salary_matrix',
  'esf7_salary_matrix',
  'esf7_database',
  'esf7_database_dummy'
]);

async function safeTruncateTables() {
  const targetDbName = 'insighted_esf7';
  console.log(`Connecting strictly to target database: '${targetDbName}'...`);

  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDbName,
    ssl: sslConfig
  });

  await client.connect();

  try {
    // 1. Verify connected DB is strictly insighted_esf7
    const currentDbRes = await client.query('SELECT current_database();');
    const currentDb = currentDbRes.rows[0].current_database;
    if (currentDb !== targetDbName) {
      throw new Error(`ABORT: Connected database '${currentDb}' does not match '${targetDbName}'!`);
    }

    // 2. Fetch all base public tables (excluding views)
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const allTables = res.rows.map(r => r.table_name);
    const tablesToTruncate = allTables.filter(t => !PROTECTED_TABLES.has(t));
    const preservedTables = allTables.filter(t => PROTECTED_TABLES.has(t));

    console.log(`\nFound ${allTables.length} total tables in '${targetDbName}'.`);
    console.log(`🛡️ PRESERVED (Will NOT touch):`, preservedTables);
    console.log(`🧹 TO TRUNCATE (${tablesToTruncate.length} tables):`, tablesToTruncate);

    if (tablesToTruncate.length === 0) {
      console.log('No tables to truncate.');
      return;
    }

    // Truncate all non-protected tables with CASCADE
    const tableListStr = tablesToTruncate.map(t => `"${t}"`).join(', ');
    console.log(`\nExecuting: TRUNCATE TABLE ${tableListStr} CASCADE;`);
    await client.query(`TRUNCATE TABLE ${tableListStr} CASCADE;`);
    console.log('✅ Truncation successful!\n');

    // Verification: Show row counts
    console.log('--- Row Count Verification ---');
    for (const table of allTables) {
      try {
        const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "${table}";`);
        const count = countRes.rows[0].count;
        const status = PROTECTED_TABLES.has(table) ? '🛡️ [PRESERVED]' : '🧹 [TRUNCATED]';
        console.log(`${status} ${table.padEnd(38)} : ${count} rows`);
      } catch (err) {
        console.log(`Error checking table ${table}: ${err.message}`);
      }
    }
    console.log('------------------------------\n');

  } finally {
    await client.end();
  }
}

safeTruncateTables().catch(err => {
  console.error('Fatal Error during safe truncate:', err);
  process.exit(1);
});
