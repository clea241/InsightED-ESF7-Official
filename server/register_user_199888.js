const { insightEdPool, db } = require('./db');

async function main() {
  const schoolId = '199888';
  const schoolName = 'PILOT TEST INTEGRATED SCHOOL';
  const email = 'pilot.test@deped.gov.ph';
  const rawPass = 'Pilot2026!';
  const passcodePin = '123456';

  console.log(`🔐 Registering School ID ${schoolId} in Auth DB with password "${rawPass}"...`);

  try {
    // 1. Check if bcryptjs exists
    let bcrypt;
    try {
      bcrypt = require('bcryptjs');
    } catch (e) {
      bcrypt = require('bcrypt');
    }

    const hashedPass = await bcrypt.hash(rawPass, 10);
    const hashedPin = passcodePin; // plain or hashed

    // Delete existing user if any
    await insightEdPool.query(
      'DELETE FROM users WHERE school_id = $1 OR LOWER(email) = $2',
      [schoolId, email.toLowerCase()]
    ).catch(e => console.log('Auth delete note:', e.message));

    // Insert user into master auth pool
    await insightEdPool.query(`
      INSERT INTO users (
        uid, email, password_hash, hash_version, passcode, role, region, division, first_name, last_name, school_id, disabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      `usr-${schoolId}`,
      email.toLowerCase(),
      hashedPass,
      'bcrypt',
      passcodePin,
      'School Admin',
      'REGION VIII',
      'SAMAR (WESTERN SAMAR)',
      'PILOT',
      'ADMIN',
      schoolId,
      false
    ]);

    console.log(`✅ User account inserted into master users table!`);

    // 2. Ensure school exists in schools table
    await db.query(`DELETE FROM schools WHERE school_id = $1`, [schoolId]);
    await db.query(`
      INSERT INTO schools (id, school_id, school_name, region, division, district, school_year, number_of_shifts, curricular_offering)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      `sch-${schoolId}`,
      schoolId,
      schoolName,
      'REGION VIII',
      'SAMAR (WESTERN SAMAR)',
      'BASEY I',
      'SY 26-27',
      1,
      ['Kindergarten', 'Elementary', 'Junior High School', 'Senior High School']
    ]);

    // 3. Clear active personnel so it starts completely fresh and auto-populates
    await db.query(`DELETE FROM personnel WHERE school_id = $1`, [schoolId]);
    await db.query(`DELETE FROM school_drafts WHERE school_id = $1`, [schoolId]);
    await db.query(`DELETE FROM class_sections WHERE school_id = $1`, [schoolId]);

    console.log(`\n🎉 LOGIN READY!`);
    console.log(`===========================================`);
    console.log(`School ID / Username : ${schoolId}`);
    console.log(`Email                : ${email}`);
    console.log(`Password             : ${rawPass}`);
    console.log(`Passcode (PIN Mode)  : ${passcodePin}`);
    console.log(`===========================================`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Registration error:', err);
    process.exit(1);
  }
}

main();
