const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function dropAllExceptSalaryMatrix() {
  const targetDbName = 'insighted_esf7';
  console.log(`Connecting to '${targetDbName}'...`);

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
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name <> 'salary_matrix'
      ORDER BY table_name;
    `);

    const tablesToDrop = res.rows.map(r => r.table_name);
    console.log(`Found ${tablesToDrop.length} tables to drop (keeping 'salary_matrix'):`, tablesToDrop);

    for (const table of tablesToDrop) {
      console.log(`Dropping table '${table}'...`);
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    }

    console.log('\n--- Final Verification of Remaining Tables ---');
    const finalRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('Remaining Tables:', finalRes.rows.map(r => r.table_name));
    console.log('-----------------------------------------------\n');
  } finally {
    await client.end();
  }
}

dropAllExceptSalaryMatrix().catch(err => {
  console.error('Error dropping tables:', err);
  process.exit(1);
});
