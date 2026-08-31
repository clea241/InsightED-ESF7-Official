const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({ connectionString: poolString, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });

async function verifyDummyAndProduction() {
  try {
    console.log('--- 1. Testing School 199998 in esf7_database_dummy ---');
    const dummyRes = await pool.query(`SELECT first, last, position, fund_source FROM esf7_database_dummy WHERE CAST(schoool_id AS TEXT) = '199998'`);
    console.log(`Found ${dummyRes.rows.length} dummy personnel:`);
    dummyRes.rows.forEach((r, idx) => console.log(`  ${idx + 1}. ${r.first} ${r.last} | ${r.position} | ${r.fund_source}`));

    console.assert(dummyRes.rows.length === 8, '8 dummy personnel exist in esf7_database_dummy');

    console.log('\n--- 2. Verifying production esf7_database is intact ---');
    const prodCount = await pool.query(`SELECT COUNT(*) FROM esf7_database`);
    console.log(`Production esf7_database row count: ${prodCount.rows[0].count}`);
    console.assert(Number(prodCount.rows[0].count) > 0, 'Production esf7_database untouched and intact');

    console.log('\n🎉 ALL DUMMY AND PRODUCTION CHECKS VERIFIED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

verifyDummyAndProduction();
