const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function recreateDatabase() {
  const adminDbName = 'postgres';
  const targetDbName = 'insighted_esf7';

  console.log(`[1/5] Connecting to administrative database '${adminDbName}'...`);
  const adminClient = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: adminDbName,
    ssl: sslConfig
  });

  await adminClient.connect();

  try {
    console.log(`[2/5] Terminating active connections to '${targetDbName}'...`);
    await adminClient.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid();
    `, [targetDbName]);

    console.log(`[3/5] Dropping database '${targetDbName}'...`);
    await adminClient.query(`DROP DATABASE IF EXISTS "${targetDbName}";`);

    console.log(`[4/5] Recreating clean database '${targetDbName}'...`);
    await adminClient.query(`CREATE DATABASE "${targetDbName}";`);
    console.log(`Database '${targetDbName}' created successfully.`);
  } finally {
    await adminClient.end();
  }

  console.log(`[5/5] Connecting to clean database '${targetDbName}' and running schema initialization...`);
  const targetClient = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDbName,
    ssl: sslConfig
  });

  await targetClient.connect();

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`Executing schema.sql on '${targetDbName}'...`);
    await targetClient.query(schemaSql);
    console.log(`Schema initialized successfully! All tables created.`);

    // Run table verifications
    const res = await targetClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n--- Verified Tables in insighted_esf7 ---');
    res.rows.forEach((row, idx) => console.log(`${idx + 1}. ${row.table_name}`));
    console.log('-----------------------------------------\n');

  } finally {
    await targetClient.end();
  }
}

recreateDatabase().catch(err => {
  console.error('FAILED to recreate database:', err);
  process.exit(1);
});
