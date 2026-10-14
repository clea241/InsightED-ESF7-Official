const { Pool } = require('../node_modules/pg');

const pool = new Pool({
  host: 'stride-posgre-prod-01.postgres.database.azure.com',
  port: 5432,
  user: 'Administrator1',
  password: 'pRZTbQ2T1JD7',
  database: 'insighted_esf7',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, legacy_id, employee_no, first_name, last_name 
      FROM esf7_personnel_profile 
      WHERE school_id = '150020' 
      LIMIT 5;
    `);
    console.log('Sample profiles with legacy_id:', res.rows);

    const matchLegacy = await client.query(`
      SELECT count(*) 
      FROM esf7_personnel_allowances a
      JOIN esf7_personnel_profile p ON a.personnel_id = p.legacy_id;
    `);
    console.log('Matches between allowances.personnel_id and profile.legacy_id:', matchLegacy.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
