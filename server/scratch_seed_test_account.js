const db = require('./db');
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  try {
    bcrypt = require('bcrypt');
  } catch (err) {
    bcrypt = null;
  }
}

async function createTestAccount() {
  const schoolId = '199888';
  const schoolName = 'PILOT TEST INTEGRATED SCHOOL';
  const email = 'pilot.test@deped.gov.ph';
  const rawPass = 'test1234';
  const passcodePin = '123456';

  console.log(`🚀 Creating new test account for School ID ${schoolId}...`);

  try {
    // 1. Ensure school exists in schools table
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
    console.log(`✅ School record created for ${schoolName} (${schoolId}).`);

    // 2. Clear previous test personnel / draft tables for 199888
    await db.query(`DELETE FROM personnel WHERE school_id = $1`, [schoolId]);
    await db.query(`DELETE FROM school_drafts WHERE school_id = $1`, [schoolId]);
    await db.query(`DELETE FROM class_sections WHERE school_id = $1`, [schoolId]);
    await db.query(`DELETE FROM insighted_esf7_pilot WHERE school_id = $1`, [schoolId]);

    // 3. Seed personnel in insighted_esf7_pilot table so auto-populate works seamlessly
    const pilotPersonnel = [
      {
        name: 'DELA CRUZ, JUAN P.',
        sex: 'Male',
        civil_status: 'Married',
        birthday_mm: '04', birthday_dd: '15', birthday_yyyy: '1988',
        position: 'MASTER TEACHER I',
        nature_of_appointment: 'REGULAR PERMANENT',
        fund_source: 'NATIONAL',
        eligibility: 'PBET / LET',
        first_service_date: '2015-06-01',
        iern: '2026-88801'
      },
      {
        name: 'GONZALES, MARIA L.',
        sex: 'Female',
        civil_status: 'Single',
        birthday_mm: '09', birthday_dd: '20', birthday_yyyy: '1994',
        position: 'TEACHER III',
        nature_of_appointment: 'REGULAR PERMANENT',
        fund_source: 'NATIONAL',
        eligibility: 'LET',
        first_service_date: '2019-08-15',
        iern: '2026-88802'
      },
      {
        name: 'SANTOS, ARTHURO K.',
        sex: 'Male',
        civil_status: 'Single',
        birthday_mm: '11', birthday_dd: '03', birthday_yyyy: '1998',
        position: 'TEACHER I',
        nature_of_appointment: 'REGULAR PERMANENT',
        fund_source: 'NATIONAL',
        eligibility: 'LET',
        first_service_date: '2022-06-01',
        iern: '2026-88803'
      },
      {
        name: 'VALDEZ, CLARA S.',
        sex: 'Female',
        civil_status: 'Married',
        birthday_mm: '01', birthday_dd: '30', birthday_yyyy: '1982',
        position: 'HEAD TEACHER III',
        nature_of_appointment: 'REGULAR PERMANENT',
        fund_source: 'NATIONAL',
        eligibility: 'LET',
        first_service_date: '2008-05-10',
        iern: '2026-88804'
      },
      {
        name: 'RAMOS, BENJAMIN R.',
        sex: 'Male',
        civil_status: 'Married',
        birthday_mm: '07', birthday_dd: '12', birthday_yyyy: '1991',
        position: 'TEACHER II',
        nature_of_appointment: 'REGULAR PERMANENT',
        fund_source: 'NATIONAL',
        eligibility: 'LET',
        first_service_date: '2018-09-01',
        iern: '2026-88805'
      }
    ];

    for (const p of pilotPersonnel) {
      const [apptY, apptM, apptD] = p.first_service_date.split('-');
      await db.query(`
        INSERT INTO insighted_esf7_pilot (
          school_id, name, sex, civil_status, birthday_mm, birthday_dd, birthday_yyyy,
          position, nature_of_appointment, fund_source, eligibility,
          appt_mm, appt_dd, appt_yyyy, station_mm, station_dd, station_yyyy,
          major_specialization, iern
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $12, $13, $14,
          $15, $16
        )
      `, [
        schoolId, p.name, p.sex, p.civil_status, p.birthday_mm, p.birthday_dd, p.birthday_yyyy,
        p.position, p.nature_of_appointment, p.fund_source, p.eligibility,
        apptM, apptD, apptY,
        'GENERAL EDUCATION', p.iern
      ]);
    }
    console.log(`✅ Seeded ${pilotPersonnel.length} personnel records into insighted_esf7_pilot for school ${schoolId}.`);

    // 4. Also register user in users table if table exists
    const hashedPass = bcrypt ? await bcrypt.hash(rawPass, 10) : rawPass;
    const hashedPin = bcrypt ? await bcrypt.hash(passcodePin, 10) : passcodePin;

    await db.query(`DELETE FROM users WHERE school_id = $1 OR email = $2`, [schoolId, email]).catch(() => {});
    await db.query(`
      INSERT INTO users (uid, email, password_hash, hash_version, passcode, role, region, division, first_name, last_name, school_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      `usr-${schoolId}`,
      email,
      hashedPass,
      bcrypt ? 'bcrypt' : 'plain',
      hashedPin,
      'School Admin',
      'REGION VIII',
      'SAMAR (WESTERN SAMAR)',
      'PILOT',
      'ADMIN',
      schoolId
    ]).catch(err => console.log('Users table insert info:', err.message));

    console.log(`\n🎉 TEST ACCOUNT CREATED SUCCESSFULLY!`);
    console.log(`===========================================`);
    console.log(`School ID  : ${schoolId}`);
    console.log(`School Name: ${schoolName}`);
    console.log(`Email      : ${email}`);
    console.log(`Password   : ${rawPass}`);
    console.log(`Passcode   : ${passcodePin}`);
    console.log(`===========================================`);
    console.log(`👉 You can log in using School ID "${schoolId}" or Email "${email}".`);
    console.log(`👉 When you open Personnel Roster or click "Auto Populate", it will load ${pilotPersonnel.length} fresh pilot records from insighted_esf7_pilot!\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating test account:', err);
    process.exit(1);
  }
}

createTestAccount();
