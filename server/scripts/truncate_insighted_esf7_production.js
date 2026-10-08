const { Client } = require('pg');

const PROD_URL = 'postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require';

async function prepareCleanProduction() {
  const client = new Client({ connectionString: PROD_URL });
  await client.connect();

  console.log('Connecting to insighted_esf7 (Production Database)...');

  // Verify connection to the right database
  const dbCheck = await client.query('SELECT current_database()');
  if (dbCheck.rows[0].current_database !== 'insighted_esf7') {
    throw new Error(`Safety abort: connected to ${dbCheck.rows[0].current_database} instead of insighted_esf7`);
  }

  console.log(`Connected to: ${dbCheck.rows[0].current_database}`);

  // Fetch all tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const allTables = tablesRes.rows.map(r => r.table_name);
  const tablesToTruncate = allTables.filter(t => t !== 'salary_matrix' && t !== 'esf7_salary_matrix' && t !== 'esf7_database');

  console.log(`\nPreparing to TRUNCATE ${tablesToTruncate.length} tables in insighted_esf7...`);
  console.log(`Preserved Tables: salary_matrix`);

  // Execute Truncate in a transaction with CASCADE
  await client.query('BEGIN');

  for (const table of tablesToTruncate) {
    await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);
    console.log(`  ✓ Truncated: ${table}`);
  }

  await client.query('COMMIT');
  console.log('\n✅ All test/draft tables successfully truncated!');

  // Verify Salary Matrix is preserved
  const salaryCheck = await client.query('SELECT COUNT(*) as count FROM salary_matrix');
  console.log(`🔒 Salary Matrix verification: ${salaryCheck.rows[0].count} rows intact.`);

  // Print summary of all tables
  console.log('\n--- Final Production Table Status ---');
  for (const t of allTables) {
    const res = await client.query(`SELECT COUNT(*) as count FROM "${t}"`);
    console.log(`${t}: ${res.rows[0].count} rows`);
  }

  await client.end();
}

prepareCleanProduction().catch(err => {
  console.error('❌ Truncation Error:', err);
  process.exit(1);
});
