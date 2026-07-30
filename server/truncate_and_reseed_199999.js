/**
 * Truncate all tables in insighted_esf7 database and re-seed 199999 with ALL OFFERINGS (K-12)
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
    console.log('🔄 Connected to insighted_esf7 database...');

    // 1. Get user table names in public schema (excluding static system reference tables)
    const res = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('salary_matrix', 'insighted_esf7_pilot');
    `);

    const tableNames = res.rows.map(r => r.table_name);
    console.log(`📋 Found ${tableNames.length} user testing tables to truncate:`, tableNames.join(', '));

    if (tableNames.length > 0) {
      const truncateQuery = `TRUNCATE TABLE ${tableNames.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
      await db.query(truncateQuery);
      console.log('✅ All tables successfully truncated.');
    }

    // 2. Insert test school 199999 with ALL OFFERINGS (K-12)
    console.log('🏫 Seeding Test School 199999 (K-12 Offerings) with 0 personnel...');
    await db.query(`
      INSERT INTO schools (
        id, school_id, school_name, region, division, district, school_year, number_of_shifts, curricular_offering
      ) VALUES (
        'sch-199999', 
        '199999', 
        'TEST K-12 INTEGRATED SCHOOL', 
        'REGION VIII', 
        'SAMAR (WESTERN SAMAR)', 
        'BASEY I', 
        'SY 26-27', 
        1, 
        ARRAY['Kindergarten', 'Elementary', 'Junior High School', 'Senior High School', 'K-12', 'Kinder', 'Elementary', 'JHS', 'SHS']
      )
    `);
    console.log('✅ School 199999 created.');

    // 3. Seed pilot personnel entries for 199999
    await db.query(`
      INSERT INTO insighted_esf7_pilot (
        school_id, name, sex, civil_status, birthday_mm, birthday_dd, birthday_yyyy,
        position, nature_of_appointment, fund_source, eligibility,
        appt_mm, appt_dd, appt_yyyy, station_mm, station_dd, station_yyyy,
        major_specialization, iern
      ) VALUES 
      (
        '199999', 'SANTOS, MARIA A.', 'Female', 'Single', '05', '12', '1990',
        'TEACHER I', 'REGULAR PERMANENT', 'NATIONAL', 'LET',
        '06', '15', '2018', '06', '15', '2018',
        'GENERAL EDUCATION', '2026-99991'
      ),
      (
        '199999', 'REYES, JUAN B.', 'Male', 'Married', '08', '24', '1985',
        'TEACHER III', 'REGULAR PERMANENT', 'NATIONAL', 'LET',
        '09', '01', '2012', '09', '01', '2012',
        'GENERAL EDUCATION', '2026-99992'
      )
    `);
    console.log('✅ Seeded 2 pilot teachers in insighted_esf7_pilot.');

    console.log('✅ Seeded 2 pilot teachers in insighted_esf7_pilot ONLY. Personnel table is 100% empty.');

    console.log('🎉 Database reset & 199999 K-12 pilot re-seeding completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Database truncate error:', e.message);
    process.exit(1);
  }
}

main();
