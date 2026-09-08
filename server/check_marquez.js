const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: 'insighted_esf7',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT p.*, e.*, ed.*
    FROM esf7_personnel_profile p
    LEFT JOIN esf7_personnel_employment e ON e.personnel_id = p.id
    LEFT JOIN esf7_perssonel_educ ed ON ed.personnel_id = p.id
    WHERE (p.school_id = '800005' OR p.school_id = 'SCH-800005') AND p.first_name ILIKE '%BIENVENIDO%'
  `);
  console.log('Found rows:', res.rows.length);
  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log('Row keys & values:');
    for (const [k, v] of Object.entries(row)) {
      if (k !== 'raw_payload') {
        console.log(`  ${k}:`, v);
      }
    }
  }
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
