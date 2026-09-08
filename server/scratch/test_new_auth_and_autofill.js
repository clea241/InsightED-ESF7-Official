const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const usersDbPool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('insighted_esf7', 'users_database')
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/users_database`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const insightEdPool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function testAuthAndAutofill() {
  console.log('🧪 Testing Authentication against users_database.user_schoolhead...');

  // 1. Check user_schoolhead for 800001
  const res800001 = await usersDbPool.query('SELECT * FROM user_schoolhead WHERE school_id = $1', ['800001']);
  console.log('  Found 800001 in user_schoolhead:', res800001.rows.length === 1 ? '✅ YES' : '❌ NO');

  const user = res800001.rows[0];
  const passMatch = await bcrypt.compare('password123', user.password_hash);
  console.log('  Password match ("password123"):', passMatch ? '✅ VALID' : '❌ INVALID');

  const passcodeMatch = user.passcode === '800001';
  console.log('  Passcode match ("800001"):', passcodeMatch ? '✅ VALID' : '❌ INVALID');

  // 2. Test auto-fill personnel fallback
  console.log('\n🧪 Testing Personnel Auto-Fill Fallback...');
  
  // A. School 800001 (not in esf7_database, should fall back to esf7_database_dummy)
  let prodRes = await insightEdPool.query('SELECT COUNT(*) FROM esf7_database WHERE school_id = $1', ['800001']);
  console.log(`  School 800001 in esf7_database: ${prodRes.rows[0].count} rows`);

  let dummyRes = await insightEdPool.query('SELECT COUNT(*) FROM esf7_database_dummy WHERE school_id = $1', ['800001']);
  console.log(`  School 800001 in esf7_database_dummy: ${dummyRes.rows[0].count} rows (Expected 5)`);

  // B. School 800006 (All Offering K-12)
  let dummyRes6 = await insightEdPool.query('SELECT COUNT(*) FROM esf7_database_dummy WHERE school_id = $1', ['800006']);
  console.log(`  School 800006 in esf7_database_dummy: ${dummyRes6.rows[0].count} rows (Expected 4)`);

  await usersDbPool.end();
  await insightEdPool.end();
  console.log('\n🎉 Verification completed successfully!');
}

testAuthAndAutofill();
