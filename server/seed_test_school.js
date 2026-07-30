/**
 * Create a new pilot school with exactly 2 personnel for testing
 */
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insighted_esf7`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function main() {
  try {
    console.log('Seeding new pilot school 199999...');
    // 1. Create the school entry directly in the insighted_esf7 schools table
    await db.query(`DELETE FROM schools WHERE school_id = '199999'`);
    await db.query(`
      INSERT INTO schools (id, school_id, school_name, region, division, district, school_year, number_of_shifts, curricular_offering)
      VALUES ('sch-199999', '199999', 'TEST K-12 INTEGRATED SCHOOL', 'REGION VIII', 'SAMAR (WESTERN SAMAR)', 'BASEY I', 'SY 26-27', 1, ARRAY['Kindergarten', 'Elementary', 'Junior High School', 'Senior High School', 'K-12', 'Kinder', 'Elementary', 'JHS', 'SHS'])
    `);
    console.log('✅ School created directly in insighted_esf7 database.');

    // 3. Clear local draft overrides if any
    await db.query(`DELETE FROM school_drafts WHERE school_id = '199999'`);

    // 4. Create the pilot personnel table entries (2 teachers) in insighted_esf7_pilot
    await db.query(`DELETE FROM insighted_esf7_pilot WHERE school_id = '199999'`);
    
    // Teacher 1
    await db.query(`
      INSERT INTO insighted_esf7_pilot (
        school_id, name, sex, civil_status, birthday_mm, birthday_dd, birthday_yyyy,
        position, nature_of_appointment, fund_source, eligibility,
        appt_mm, appt_dd, appt_yyyy, station_mm, station_dd, station_yyyy,
        major_specialization, iern
      ) VALUES (
        '199999', 'SANTOS, MARIA A.', 'Female', 'Single', '05', '12', '1990',
        'TEACHER I', 'REGULAR PERMANENT', 'NATIONAL', 'LET',
        '06', '15', '2018', '06', '15', '2018',
        'GENERAL EDUCATION', '2026-99991'
      )
    `);

    // Teacher 2
    await db.query(`
      INSERT INTO insighted_esf7_pilot (
        school_id, name, sex, civil_status, birthday_mm, birthday_dd, birthday_yyyy,
        position, nature_of_appointment, fund_source, eligibility,
        appt_mm, appt_dd, appt_yyyy, station_mm, station_dd, station_yyyy,
        major_specialization, iern
      ) VALUES (
        '199999', 'REYES, JUAN B.', 'Male', 'Married', '08', '24', '1985',
        'TEACHER III', 'REGULAR PERMANENT', 'NATIONAL', 'LET',
        '09', '01', '2012', '09', '01', '2012',
        'GENERAL EDUCATION', '2026-99992'
      )
    `);

    console.log('✅ Seeded 2 pilot teachers in insighted_esf7_pilot.');

    // 5. Create active personnel table entries for school 199999
    await db.query(`DELETE FROM personnel WHERE school_id = '199999'`);

    await db.query(`
      INSERT INTO personnel (
        id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name,
        sex_at_birth, civil_status, birthdate, profiling_code, is_school_head, deped_email
      ) VALUES
      ('p-199999-1', '2026-99991', '199999', 'SY 26-27', 'teaching', 'MS.', 'MARIA', 'A.', 'SANTOS', 'Female', 'SINGLE', '1990-05-12', 'CODE01', false, ''),
      ('p-199999-2', '2026-99992', '199999', 'SY 26-27', 'teaching', 'MR.', 'JUAN', 'B.', 'REYES', 'Male', 'MARRIED', '1985-08-24', 'CODE02', false, '')
    `);

    await db.query(`
      INSERT INTO personnel_employment (
        id, personnel_id, position, fund_source, nature_of_appointment, hiring_arrangement,
        first_service_date, last_promotion_date, new_station_date
      ) VALUES
      ('emp-199999-1', 'p-199999-1', 'TEACHER I', 'NATIONAL', 'REGULAR PERMANENT', 'Permanent', '2018-06-15', '2018-06-15', '2018-06-15'),
      ('emp-199999-2', 'p-199999-2', 'TEACHER III', 'NATIONAL', 'REGULAR PERMANENT', 'Permanent', '2012-09-01', '2012-09-01', '2012-09-01')
    `);

    console.log('✅ Seeded 2 active teachers in personnel & personnel_employment tables.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
}

main();
