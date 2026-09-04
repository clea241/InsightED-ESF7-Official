const { Pool } = require('pg');
const path = require('path');
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = require('bcrypt');
}
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const usersDbPool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('insighted_esf7', 'users_database')
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/users_database`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const SCHOOLS = [
  { schoolId: '800001', name: 'Mabini ES (Purely ES)', email: 'school800001@deped.gov.ph', mcoc: 'PURELY ES' },
  { schoolId: '800002', name: 'Rizal Memorial JHS (Purely JHS)', email: 'school800002@deped.gov.ph', mcoc: 'PURELY JHS' },
  { schoolId: '800003', name: 'Albay Standalone SHS (Purely SHS)', email: 'school800003@deped.gov.ph', mcoc: 'PURELY SHS' },
  { schoolId: '800004', name: 'San Isidro IS (ES and JHS)', email: 'school800004@deped.gov.ph', mcoc: 'ES AND JHS' },
  { schoolId: '800005', name: 'Daraga NHS (JHS with SHS)', email: 'school800005@deped.gov.ph', mcoc: 'JHS WITH SHS' },
  { schoolId: '800006', name: 'Albay Model IS (All Offering K-12)', email: 'school800006@deped.gov.ph', mcoc: 'ALL OFFERING' }
];

async function registerUsers() {
  const insightClient = await pool.connect();
  const usersDbClient = await usersDbPool.connect();
  try {
    console.log('Registering test user accounts for 800001 - 800006 in users_database.user_schoolhead and insightEd.users...');
    const defaultPassword = 'password123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    for (const sch of SCHOOLS) {
      // 1. In insightEd.users
      await insightClient.query(`DELETE FROM users WHERE school_id = $1 OR email = $2`, [sch.schoolId, sch.email]);
      await insightClient.query(`
        INSERT INTO users (
          uid, email, role, first_name, last_name, region, division,
          account_category, password_hash, hash_version, passcode,
          school_id, registration_status, is_testaccount
        ) VALUES (
          $1, $2, 'School Head', 'Principal', $3, 'REGION V', 'ALBAY',
          'School Head', $4, 'bcrypt', $5,
          $5, 'Valid', true
        );
      `, [
        `uid-test-${sch.schoolId}`,
        sch.email,
        sch.name,
        passwordHash,
        sch.schoolId
      ]);

      // 2. In users_database.user_schoolhead
      await usersDbClient.query(`DELETE FROM user_schoolhead WHERE school_id = $1 OR email = $2`, [sch.schoolId, sch.email]);
      await usersDbClient.query(`
        INSERT INTO user_schoolhead (
          uid, email, role, first_name, last_name, region, division,
          account_category, password_hash, hash_version, passcode,
          school_id, registration_status, is_testaccount, disabled
        ) VALUES (
          $1, $2, 'School Head', 'Principal', $3, 'REGION V', 'ALBAY',
          'School Head', $4, 'bcrypt', $5,
          $5, 'Valid', true, false
        );
      `, [
        `uid-test-${sch.schoolId}`,
        sch.email,
        sch.name,
        passwordHash,
        sch.schoolId
      ]);

      console.log(`✓ Created user for School ${sch.schoolId} (${sch.name}) with password '${defaultPassword}' and passcode '${sch.schoolId}'`);
    }
    console.log('\nAll 6 test school accounts ready in user_schoolhead!');
  } catch (err) {
    console.error('Error creating user accounts:', err);
  } finally {
    insightClient.release();
    usersDbClient.release();
    await pool.end();
    await usersDbPool.end();
  }
}

registerUsers();
