const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { TEST_DIVISIONS } = require('./utils/divisionTestRegistry');

// Strictly target insightEd.esf7_database_dummy and insighted_esf7
const insightEdPoolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: insightEdPoolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const esf7Pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'insighted_esf7',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Surnames and First Names pools for realistic synthetic anonymization
const SURNAMES = [
  'DELA CRUZ', 'SANTOS', 'REYES', 'GARCIA', 'MENDOZA', 
  'NAVARRO', 'BAUTISTA', 'VILLANUEVA', 'RAMOS', 'AQUINO',
  'SORIANO', 'DIZON', 'FLORES', 'CASTILLO', 'ALVAREZ'
];

function generatePersonnelForSchool(sch) {
  const sId = sch.schoolId;
  const sName = sch.schoolName;
  const reg = sch.region;
  const div = sch.division;
  const baseNum = parseInt(sId.slice(-3), 10);

  return [
    // 1. School Principal II (School Head)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `410${sId}`,
      first: 'MARIA CORAZON',
      middle: 'SANTOS',
      last: SURNAMES[(baseNum + 1) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-001`,
      gender: 'FEMALE',
      civil_status: 'MARRIED',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1979',
      birthday_mm: '05',
      birthday_dd: '14',
      position: 'SCHOOL PRINCIPAL II',
      degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
      major__specialization: 'EDUCATIONAL MANAGEMENT',
      post_graduate__degree: 'DOCTOR OF EDUCATION (ED.D.)',
      eligibility: 'PRINCIPALS TEST / LET',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2002',
      appt_mm: '06',
      appt_dd: '01'
    },
    // 2. Master Teacher I (Overload Teaching Scenario >360 mins)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `425${sId}`,
      first: 'JUAN MANUEL',
      middle: 'REYES',
      last: SURNAMES[(baseNum + 2) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-002`,
      gender: 'MALE',
      civil_status: 'MARRIED',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1984',
      birthday_mm: '08',
      birthday_dd: '22',
      position: 'MASTER TEACHER I',
      degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
      major__specialization: 'MATHEMATICS',
      post_graduate__degree: 'MASTER OF ARTS IN EDUCATION (MAED)',
      eligibility: 'LICENSURE EXAMINATION FOR TEACHERS',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2007',
      appt_mm: '06',
      appt_dd: '15',
      subject_1: 'MATHEMATICS 7',
      lvl_1: 'Grade 7',
      section_1: 'DIAMOND',
      from_1: '07:30',
      to_1: '08:30',
      d1_1: 'M', d2_1: 'T', d3_1: 'W', d4_1: 'TH', d5_1: 'F',
      subject_1_2: 'MATHEMATICS 8',
      lvl_1_2: 'Grade 8',
      section_1_2: 'EMERALD',
      from_1_2: '08:30',
      to_1_2: '09:30',
      d1_1_2: 'M', d2_1_2: 'T', d3_1_2: 'W', d4_1_2: 'TH', d5_1_2: 'F',
      subject_1_3: 'HOMEROOM GUIDANCE (HGP)',
      lvl_1_3: 'Grade 7',
      section_1_3: 'DIAMOND',
      from_1_3: '09:45',
      to_1_3: '10:45',
      d1_1_3: 'M', d2_1_3: 'T', d3_1_3: 'W', d4_1_3: 'TH', d5_1_3: 'F',
      subject_1_4: 'ADVISORY CLASS',
      lvl_1_4: 'Grade 7',
      section_1_4: 'DIAMOND',
      from_1_4: '09:45',
      to_1_4: '10:45',
      d1_1_4: 'M', d2_1_4: 'T', d3_1_4: 'W', d4_1_4: 'TH', d5_1_4: 'F',
      subject_1_5: 'ADVANCED ALGEBRA (SPECIAL PERIOD)',
      lvl_1_5: 'Grade 8',
      section_1_5: 'EMERALD',
      from_1_5: '15:00',
      to_1_5: '16:15',
      d1_1_5: 'M', d2_1_5: 'T', d3_1_5: 'W', d4_1_5: 'TH', d5_1_5: 'F'
    },
    // 3. Teacher III (Science Specialist)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `439${sId}`,
      first: 'ANA MARIE',
      middle: 'GARCIA',
      last: SURNAMES[(baseNum + 3) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-003`,
      gender: 'FEMALE',
      civil_status: 'SINGLE',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1991',
      birthday_mm: '11',
      birthday_dd: '03',
      position: 'TEACHER III',
      degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
      major__specialization: 'GENERAL SCIENCE',
      post_graduate__degree: 'CAR - MASTER OF ARTS IN TEACHING',
      eligibility: 'LICENSURE EXAMINATION FOR TEACHERS',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2015',
      appt_mm: '07',
      appt_dd: '01',
      subject_1: 'SCIENCE 9',
      lvl_1: 'Grade 9',
      section_1: 'RUBY',
      from_1: '07:30',
      to_1: '08:30',
      d1_1: 'M', d2_1: 'T', d3_1: 'W', d4_1: 'TH', d5_1: 'F',
      subject_1_2: 'SCIENCE 10',
      lvl_1_2: 'Grade 10',
      section_1_2: 'SAPPHIRE',
      from_1_2: '08:30',
      to_1_2: '09:30',
      d1_1_2: 'M', d2_1_2: 'T', d3_1_2: 'W', d4_1_2: 'TH', d5_1_2: 'F',
      subject_1_3: 'RESEARCH II',
      lvl_1_3: 'Grade 10',
      section_1_3: 'SAPPHIRE',
      from_1_3: '10:45',
      to_1_3: '11:45',
      d1_1_3: 'M', d2_1_3: 'T', d3_1_3: 'W', d4_1_3: 'TH', d5_1_3: 'F'
    },
    // 4. Teacher II (English Specialist)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `451${sId}`,
      first: 'ROBERTO CARLOS',
      middle: 'LOPEZ',
      last: SURNAMES[(baseNum + 4) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-004`,
      gender: 'MALE',
      civil_status: 'SINGLE',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1995',
      birthday_mm: '04',
      birthday_dd: '19',
      position: 'TEACHER II',
      degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
      major__specialization: 'ENGLISH',
      post_graduate__degree: 'N/A',
      eligibility: 'LICENSURE EXAMINATION FOR TEACHERS',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2020',
      appt_mm: '08',
      appt_dd: '22',
      subject_1: 'ENGLISH 7',
      lvl_1: 'Grade 7',
      section_1: 'DIAMOND',
      from_1: '08:30',
      to_1: '09:30',
      d1_1: 'M', d2_1: 'T', d3_1: 'W', d4_1: 'TH', d5_1: 'F',
      subject_1_2: 'ENGLISH 8',
      lvl_1_2: 'Grade 8',
      section_1_2: 'EMERALD',
      from_1_2: '09:45',
      to_1_2: '10:45',
      d1_1_2: 'M', d2_1_2: 'T', d3_1_2: 'W', d4_1_2: 'TH', d5_1_2: 'F',
      subject_1_3: 'ENGLISH 9',
      lvl_1_3: 'Grade 9',
      section_1_3: 'RUBY',
      from_1_3: '13:00',
      to_1_3: '14:00',
      d1_1_3: 'M', d2_1_3: 'T', d3_1_3: 'W', d4_1_3: 'TH', d5_1_3: 'F'
    },
    // 5. Teacher I (Araling Panlipunan / Values)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `462${sId}`,
      first: 'ELENA JOYCE',
      middle: 'VALDEZ',
      last: SURNAMES[(baseNum + 5) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-005`,
      gender: 'FEMALE',
      civil_status: 'MARRIED',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1993',
      birthday_mm: '09',
      birthday_dd: '28',
      position: 'TEACHER I',
      degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
      major__specialization: 'ARALING PANLIPUNAN',
      post_graduate__degree: 'N/A',
      eligibility: 'LICENSURE EXAMINATION FOR TEACHERS',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2021',
      appt_mm: '06',
      appt_dd: '05',
      subject_1: 'ARALING PANLIPUNAN 7',
      lvl_1: 'Grade 7',
      section_1: 'DIAMOND',
      from_1: '07:30',
      to_1: '08:30',
      d1_1: 'M', d2_1: 'T', d3_1: 'W', d4_1: 'TH', d5_1: 'F',
      subject_1_2: 'VALUES EDUCATION 7',
      lvl_1_2: 'Grade 7',
      section_1_2: 'DIAMOND',
      from_1_2: '08:30',
      to_1_2: '09:30',
      d1_1_2: 'M', d2_1_2: 'T', d3_1_2: 'W', d4_1_2: 'TH', d5_1_2: 'F'
    },
    // 6. Head Teacher III (Filipino / Department Head)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `478${sId}`,
      first: 'MARK ANTHONY',
      middle: 'BELTRAN',
      last: SURNAMES[(baseNum + 6) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-006`,
      gender: 'MALE',
      civil_status: 'MARRIED',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1986',
      birthday_mm: '12',
      birthday_dd: '10',
      position: 'HEAD TEACHER III',
      degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
      major__specialization: 'FILIPINO',
      post_graduate__degree: 'MASTER OF ARTS IN FILIPINO',
      eligibility: 'LICENSURE EXAMINATION FOR TEACHERS',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2010',
      appt_mm: '06',
      appt_dd: '01',
      subject_1: 'FILIPINO 10',
      lvl_1: 'Grade 10',
      section_1: 'SAPPHIRE',
      from_1: '07:30',
      to_1: '08:30',
      d1_1: 'M', d2_1: 'T', d3_1: 'W', d4_1: 'TH', d5_1: 'F',
      subject_1_2: 'TR - DEPARTMENT HEAD (INSTRUCTIONAL SUPERVISION)',
      lvl_1_2: 'Grade 10',
      section_1_2: 'ALL',
      from_1_2: '08:30',
      to_1_2: '11:30',
      d1_1_2: 'M', d2_1_2: 'T', d3_1_2: 'W', d4_1_2: 'TH', d5_1_2: 'F'
    },
    // 7. Administrative Officer II (Non-Teaching)
    {
      schoool_id: sId,
      school_name: sName,
      region: reg,
      division: div,
      muncipality: `${div} CENTRAL DISTRICT`,
      district: `${div} CENTRAL DISTRICT`,
      employee_no: `489${sId}`,
      first: 'CLARISSA MAE',
      middle: 'FLORES',
      last: SURNAMES[(baseNum + 7) % SURNAMES.length],
      tin: `999-${sId.slice(0, 3)}-${sId.slice(3, 6)}-007`,
      gender: 'FEMALE',
      civil_status: 'SINGLE',
      religion: 'ROMAN CATHOLIC',
      ehtinic_group: 'TAGALOG',
      birthday_yyyy: '1995',
      birthday_mm: '03',
      birthday_dd: '17',
      position: 'ADMINISTRATIVE OFFICER II',
      degree_finished__baccalaureate: 'BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION',
      major__specialization: 'FINANCIAL MANAGEMENT',
      post_graduate__degree: 'N/A',
      eligibility: 'CAREER SERVICE PROFESSIONAL',
      fund_source: 'NATIONAL',
      nature_of_appointment: 'REGULAR PERMANENT',
      hiring_arrangement: 'REGULAR/PERMANENT',
      appt_yyyy: '2020',
      appt_mm: '10',
      appt_dd: '01'
    }
  ];
}

async function seed222Divisions() {
  console.log('================================================================');
  console.log(`🚀 Seeding ${TEST_DIVISIONS.length} DepEd Division Test Schools (900001 - 900222)`);
  console.log('================================================================\n');

  try {
    // 1. Ensure table exists in insightEd
    await insightEdPool.query(`CREATE TABLE IF NOT EXISTS esf7_database_dummy (LIKE esf7_database INCLUDING ALL);`);
    console.log('✓ Table insightEd.esf7_database_dummy verified.');

    // 2. Clear old 900xxx series in dummy database
    await insightEdPool.query(`DELETE FROM esf7_database_dummy WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) >= '900001' AND CAST(COALESCE(schoool_id, school_id) AS TEXT) <= '900250'`);
    console.log('✓ Cleared existing test division records from esf7_database_dummy.');

    // 3. Batch insert personnel
    let totalInserted = 0;
    const client = await insightEdPool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < TEST_DIVISIONS.length; i++) {
        const sch = TEST_DIVISIONS[i];
        const personnel = generatePersonnelForSchool(sch);

        for (const p of personnel) {
          const keys = Object.keys(p);
          const values = Object.values(p);
          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
          const colNames = keys.map(k => `"${k}"`).join(', ');

          await client.query(
            `INSERT INTO esf7_database_dummy (${colNames}) VALUES (${placeholders})`,
            values
          );
          totalInserted++;
        }

        if ((i + 1) % 50 === 0 || i === TEST_DIVISIONS.length - 1) {
          console.log(`  [Batch Progress] Seeded ${i + 1}/${TEST_DIVISIONS.length} division test schools (${totalInserted} personnel rows)...`);
        }
      }

      await client.query('COMMIT');
      console.log(`\n🎉 SUCCESS: Seeded ${totalInserted} dummy personnel rows across ${TEST_DIVISIONS.length} DepEd Divisions!`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Error during 222 division seeding:', err.message);
  } finally {
    await insightEdPool.end();
    await esf7Pool.end();
  }
}

seed222Divisions();
