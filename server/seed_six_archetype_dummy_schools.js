const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const SCHOOLS_CONFIG = [
  {
    schoolId: '800001',
    schoolName: 'MABINI ELEMENTARY SCHOOL',
    mcoc: 'PURELY ES',
    curricularOffering: 'Purely ES',
    region: 'REGION V',
    division: 'ALBAY',
    district: 'DARAGA NORTH DISTRICT',
    personnel: [
      {
        employee_no: '801001',
        first: 'CORAZON',
        middle: 'VILLANUEVA',
        last: 'AQUINO',
        tin: '101-202-301',
        gender: 'FEMALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1979',
        birthday_mm: '04',
        birthday_dd: '12',
        position: 'ELEMENTARY SCHOOL PRINCIPAL II',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'GENERAL EDUCATION',
        post_graduate__degree: 'MASTER OF ARTS IN EDUCATIONAL MANAGEMENT',
        eligibility: 'PRINCIPALS TEST / LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2005',
        appt_mm: '06',
        appt_dd: '01',
        teaching_load: '0'
      },
      {
        employee_no: '801002',
        first: 'TERESA',
        middle: 'MAGSAYSAY',
        last: 'RAMOS',
        tin: '101-202-302',
        gender: 'FEMALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1988',
        birthday_mm: '08',
        birthday_dd: '23',
        position: 'MASTER TEACHER I (ELEM)',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'EARLY CHILDHOOD EDUCATION',
        post_graduate__degree: 'CAR - MASTER OF ARTS IN EDUCATION',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2012',
        appt_mm: '06',
        appt_dd: '15',
        teaching_load: '6'
      },
      {
        employee_no: '801003',
        first: 'ROLANDO',
        middle: 'CRUZ',
        last: 'DELA ROSA',
        tin: '101-202-303',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'TAGALOG',
        birthday_yyyy: '1992',
        birthday_mm: '11',
        birthday_dd: '05',
        position: 'TEACHER III (ELEM)',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'MATHEMATICS',
        post_graduate__degree: 'NONE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2016',
        appt_mm: '07',
        appt_dd: '01',
        teaching_load: '6'
      },
      {
        employee_no: '801004',
        first: 'JENNY',
        middle: 'SANTOS',
        last: 'GARCIA',
        tin: '101-202-304',
        gender: 'FEMALE',
        civil_status: 'SINGLE',
        religion: 'IGLESIA NI CRISTO',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1996',
        birthday_mm: '02',
        birthday_dd: '18',
        position: 'TEACHER I (ELEM)',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'ENGLISH',
        post_graduate__degree: 'NONE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2020',
        appt_mm: '08',
        appt_dd: '24',
        teaching_load: '6'
      },
      {
        employee_no: '801005',
        first: 'ANTONIO',
        middle: 'LOPEZ',
        last: 'MENDOZA',
        tin: '101-202-305',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1990',
        birthday_mm: '09',
        birthday_dd: '30',
        position: 'ADMINISTRATIVE AIDE VI',
        degree_finished__baccalaureate: 'BS IN BUSINESS ADMINISTRATION',
        major__specialization: 'FINANCIAL MANAGEMENT',
        post_graduate__degree: 'NONE',
        eligibility: 'CAREER SERVICE PROFESSIONAL',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2018',
        appt_mm: '01',
        appt_dd: '10',
        teaching_load: '0'
      }
    ]
  },
  {
    schoolId: '800002',
    schoolName: 'RIZAL MEMORIAL JUNIOR HIGH SCHOOL',
    mcoc: 'PURELY JHS',
    curricularOffering: 'Purely JHS',
    region: 'REGION V',
    division: 'ALBAY',
    district: 'DARAGA SOUTH DISTRICT',
    personnel: [
      {
        employee_no: '802001',
        first: 'DANILO',
        middle: 'CASTRO',
        last: 'VALENCIA',
        tin: '102-202-301',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'TAGALOG',
        birthday_yyyy: '1975',
        birthday_mm: '03',
        birthday_dd: '15',
        position: 'SECONDARY SCHOOL PRINCIPAL III',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'PHYSICAL SCIENCE',
        post_graduate__degree: 'DOCTOR OF PHILOSOPHY IN EDUCATION',
        eligibility: 'PRINCIPALS TEST / PBET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '1998',
        appt_mm: '06',
        appt_dd: '01',
        teaching_load: '0'
      },
      {
        employee_no: '802002',
        first: 'MYRNA',
        middle: 'ALVAREZ',
        last: 'BAUTISTA',
        tin: '102-202-302',
        gender: 'FEMALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1982',
        birthday_mm: '10',
        birthday_dd: '08',
        position: 'HEAD TEACHER III (SCIENCE)',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'GENERAL SCIENCE',
        post_graduate__degree: 'MASTER OF ARTS IN SCIENCE EDUCATION',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2006',
        appt_mm: '06',
        appt_dd: '16',
        teaching_load: '4'
      },
      {
        employee_no: '802003',
        first: 'GABRIEL',
        middle: 'NARCISO',
        last: 'PASCUAL',
        tin: '102-202-303',
        gender: 'MALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1991',
        birthday_mm: '05',
        birthday_dd: '20',
        position: 'TEACHER III (SEC)',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'MATHEMATICS',
        post_graduate__degree: 'CAR - MAED MATHEMATICS',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2015',
        appt_mm: '07',
        appt_dd: '01',
        teaching_load: '6'
      },
      {
        employee_no: '802004',
        first: 'CLARISSA',
        middle: 'MOLINA',
        last: 'CRUZ',
        tin: '102-202-304',
        gender: 'FEMALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'TAGALOG',
        birthday_yyyy: '1995',
        birthday_mm: '12',
        birthday_dd: '11',
        position: 'TEACHER I (SEC)',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'ENGLISH',
        post_graduate__degree: 'NONE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2019',
        appt_mm: '06',
        appt_dd: '10',
        teaching_load: '6'
      }
    ]
  },
  {
    schoolId: '800003',
    schoolName: 'ALBAY STANDALONE SENIOR HIGH SCHOOL',
    mcoc: 'PURELY SHS',
    curricularOffering: 'Purely SHS',
    region: 'REGION V',
    division: 'ALBAY',
    district: 'DARAGA EAST DISTRICT',
    personnel: [
      {
        employee_no: '803001',
        first: 'BENJAMIN',
        middle: 'OCAMPO',
        last: 'TOLENTINO',
        tin: '103-202-301',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1976',
        birthday_mm: '07',
        birthday_dd: '22',
        position: 'SECONDARY SCHOOL PRINCIPAL II',
        degree_finished__baccalaureate: 'BS IN COMPUTER SCIENCE / BSE',
        major__specialization: 'INFORMATION TECHNOLOGY',
        post_graduate__degree: 'DOCTOR IN PUBLIC ADMINISTRATION',
        eligibility: 'PRINCIPALS TEST / LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2002',
        appt_mm: '06',
        appt_dd: '03',
        teaching_load: '0'
      },
      {
        employee_no: '803002',
        first: 'CHRISTINE',
        middle: 'VILLAREAL',
        last: 'NAVARRO',
        tin: '103-202-302',
        gender: 'FEMALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1989',
        birthday_mm: '01',
        birthday_dd: '14',
        position: 'MASTER TEACHER I (SHS ACADEMIC)',
        degree_finished__baccalaureate: 'BS IN APPLIED MATHEMATICS',
        major__specialization: 'STEM TRACK - CALCULUS & PHYSICS',
        post_graduate__degree: 'MASTER OF SCIENCE IN APPLIED MATHEMATICS',
        eligibility: 'LET / RA 1080',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2016',
        appt_mm: '06',
        appt_dd: '13',
        teaching_load: '6'
      },
      {
        employee_no: '803003',
        first: 'FERNANDO',
        middle: 'SALVADOR',
        last: 'ORTEGA',
        tin: '103-202-303',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'TAGALOG',
        birthday_yyyy: '1987',
        birthday_mm: '09',
        birthday_dd: '04',
        position: 'TEACHER II (SHS TVL/TECHPRO)',
        degree_finished__baccalaureate: 'BS IN INDUSTRIAL TECHNOLOGY',
        major__specialization: 'ELECTRICAL & MECHATRONICS (NC II / TM I)',
        post_graduate__degree: 'DIPLOMA IN TECHNICAL VOCATIONAL TEACHING',
        eligibility: 'LET / NATIONAL TVET TRAINER CERTIFICATE',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2017',
        appt_mm: '07',
        appt_dd: '01',
        teaching_load: '6'
      },
      {
        employee_no: '803004',
        first: 'DIANE',
        middle: 'MERCADO',
        last: 'HERRERA',
        tin: '103-202-304',
        gender: 'FEMALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1993',
        birthday_mm: '03',
        birthday_dd: '29',
        position: 'TEACHER II (SHS HUMSS)',
        degree_finished__baccalaureate: 'AB POLITICAL SCIENCE',
        major__specialization: 'PHILIPPINE POLITICS & GOVERNANCE',
        post_graduate__degree: 'MASTER IN PUBLIC GOVERNANCE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2018',
        appt_mm: '06',
        appt_dd: '04',
        teaching_load: '6'
      }
    ]
  },
  {
    schoolId: '800004',
    schoolName: 'SAN ISIDRO INTEGRATED SCHOOL (K-10)',
    mcoc: 'ES AND JHS',
    curricularOffering: 'ES and JHS (K to 10)',
    region: 'REGION V',
    division: 'ALBAY',
    district: 'DARAGA WEST DISTRICT',
    personnel: [
      {
        employee_no: '804001',
        first: 'ARLENE',
        middle: 'CASTILLO',
        last: 'CORPUZ',
        tin: '104-202-301',
        gender: 'FEMALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1980',
        birthday_mm: '06',
        birthday_dd: '19',
        position: 'PRINCIPAL I (INTEGRATED)',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'EDUCATIONAL ADMINISTRATION',
        post_graduate__degree: 'MASTER OF ARTS IN EDUCATION',
        eligibility: 'PRINCIPALS TEST / LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2004',
        appt_mm: '06',
        appt_dd: '07',
        teaching_load: '0'
      },
      {
        employee_no: '804002',
        first: 'JOCELYN',
        middle: 'DEL MUNDO',
        last: 'SANTOS',
        tin: '104-202-302',
        gender: 'FEMALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1986',
        birthday_mm: '11',
        birthday_dd: '12',
        position: 'TEACHER III (ELEM)',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'FILIPINO & AP',
        post_graduate__degree: 'NONE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2011',
        appt_mm: '06',
        appt_dd: '14',
        teaching_load: '6'
      },
      {
        employee_no: '804003',
        first: 'PATRICK',
        middle: 'VILLANUEVA',
        last: 'AGUILAR',
        tin: '104-202-303',
        gender: 'MALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'TAGALOG',
        birthday_yyyy: '1992',
        birthday_mm: '04',
        birthday_dd: '08',
        position: 'TEACHER II (JHS SCIENCE)',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'BIOLOGICAL SCIENCE',
        post_graduate__degree: 'CAR - MAED SCIENCE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2016',
        appt_mm: '06',
        appt_dd: '20',
        teaching_load: '6'
      }
    ]
  },
  {
    schoolId: '800005',
    schoolName: 'DARAGA NATIONAL HIGH SCHOOL (7-12)',
    mcoc: 'JHS WITH SHS',
    curricularOffering: 'JHS with SHS',
    region: 'REGION V',
    division: 'ALBAY',
    district: 'DARAGA CENTRAL DISTRICT',
    personnel: [
      {
        employee_no: '805001',
        first: 'EDGARDO',
        middle: 'SAMSON',
        last: 'FERRER',
        tin: '105-202-301',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1973',
        birthday_mm: '12',
        birthday_dd: '01',
        position: 'SECONDARY SCHOOL PRINCIPAL IV',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'MATHEMATICS',
        post_graduate__degree: 'DOCTOR OF EDUCATION (ED.D.)',
        eligibility: 'PRINCIPALS TEST / PBET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '1996',
        appt_mm: '06',
        appt_dd: '01',
        teaching_load: '0'
      },
      {
        employee_no: '805002',
        first: 'VICTORIA',
        middle: 'PIMENTEL',
        last: 'GOMEZ',
        tin: '105-202-302',
        gender: 'FEMALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1984',
        birthday_mm: '08',
        birthday_dd: '17',
        position: 'MASTER TEACHER II (JHS ENGLISH)',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'ENGLISH LANGUAGE TEACHING',
        post_graduate__degree: 'MASTER OF ARTS IN ENGLISH EDUCATION',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2008',
        appt_mm: '06',
        appt_dd: '09',
        teaching_load: '5'
      },
      {
        employee_no: '805003',
        first: 'RENE',
        middle: 'BALTAZAR',
        last: 'CARREON',
        tin: '105-202-303',
        gender: 'MALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1990',
        birthday_mm: '02',
        birthday_dd: '25',
        position: 'TEACHER II (SHS ABM/FINANCE)',
        degree_finished__baccalaureate: 'BS IN ACCOUNTANCY',
        major__specialization: 'ACCOUNTING & BUSINESS MANAGEMENT',
        post_graduate__degree: 'MASTER IN BUSINESS ADMINISTRATION',
        eligibility: 'CPA / LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2016',
        appt_mm: '06',
        appt_dd: '13',
        teaching_load: '6'
      }
    ]
  },
  {
    schoolId: '800006',
    schoolName: 'ALBAY MODEL INTEGRATED SCHOOL (K-12)',
    mcoc: 'ALL OFFERING',
    curricularOffering: 'All Offering (K to 12)',
    region: 'REGION V',
    division: 'ALBAY',
    district: 'DARAGA SOUTH DISTRICT',
    personnel: [
      {
        employee_no: '806001',
        first: 'MANUEL',
        middle: 'DELA CRUZ',
        last: 'SORIANO',
        tin: '106-202-301',
        gender: 'MALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1971',
        birthday_mm: '10',
        birthday_dd: '28',
        position: 'INTEGRATED SCHOOL PRINCIPAL IV',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'EDUCATIONAL MANAGEMENT',
        post_graduate__degree: 'DOCTOR OF EDUCATION (ED.D.)',
        eligibility: 'PRINCIPALS TEST / PBET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '1995',
        appt_mm: '06',
        appt_dd: '01',
        teaching_load: '0'
      },
      {
        employee_no: '806002',
        first: 'CECILIA',
        middle: 'BUENAVENTURA',
        last: 'LORENZO',
        tin: '106-202-302',
        gender: 'FEMALE',
        civil_status: 'MARRIED',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1985',
        birthday_mm: '05',
        birthday_dd: '16',
        position: 'MASTER TEACHER I (ELEM)',
        degree_finished__baccalaureate: 'BACHELOR IN ELEMENTARY EDUCATION',
        major__specialization: 'EARLY CHILDHOOD & READING',
        post_graduate__degree: 'MASTER OF ARTS IN READING EDUCATION',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2009',
        appt_mm: '06',
        appt_dd: '08',
        teaching_load: '6'
      },
      {
        employee_no: '806003',
        first: 'ARTHUR',
        middle: 'VILLACORTA',
        last: 'MAGNO',
        tin: '106-202-303',
        gender: 'MALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1991',
        birthday_mm: '03',
        birthday_dd: '19',
        position: 'HEAD TEACHER I (JHS TLE/EPP)',
        degree_finished__baccalaureate: 'BACHELOR OF SECONDARY EDUCATION',
        major__specialization: 'TECHNOLOGY AND LIVELIHOOD EDUCATION',
        post_graduate__degree: 'CAR - MAED TLE',
        eligibility: 'LET / TM I',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2015',
        appt_mm: '07',
        appt_dd: '01',
        teaching_load: '4'
      },
      {
        employee_no: '806004',
        first: 'BEATRICE',
        middle: 'CORTEZ',
        last: 'SALVACION',
        tin: '106-202-304',
        gender: 'FEMALE',
        civil_status: 'SINGLE',
        religion: 'ROMAN CATHOLIC',
        ehtinic_group: 'BICOLANO',
        birthday_yyyy: '1994',
        birthday_mm: '11',
        birthday_dd: '03',
        position: 'TEACHER II (SHS STEM/BIOLOGY)',
        degree_finished__baccalaureate: 'BS IN BIOLOGY / BSE',
        major__specialization: 'GENERAL BIOLOGY & EARTH SCIENCE',
        post_graduate__degree: 'MS IN BIOLOGICAL SCIENCE',
        eligibility: 'LET',
        fund_source: 'NATIONAL',
        nature_of_appointment: 'REGULAR PERMANENT',
        hiring_arrangement: 'REGULAR/PERMANENT',
        appt_yyyy: '2018',
        appt_mm: '06',
        appt_dd: '04',
        teaching_load: '6'
      }
    ]
  }
];

async function seedSixArchetypeSchools() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting Seeding for 6 Archetype Dummy Schools (800001 - 800006)...');
    await client.query('BEGIN');

    // 1. Ensure esf7_database_dummy table exists
    await client.query(`CREATE TABLE IF NOT EXISTS esf7_database_dummy (LIKE esf7_database INCLUDING ALL);`);

    for (const sch of SCHOOLS_CONFIG) {
      console.log(`\n🏫 Seeding School [${sch.schoolId}] - ${sch.schoolName} (mcoc: ${sch.mcoc})...`);

      // A. Update / Insert into 2025-2026_SchoolID
      try {
        await client.query(`
          DELETE FROM "2025-2026_SchoolID" WHERE "schoool_id" = $1;
        `, [parseInt(sch.schoolId, 10)]);

        await client.query(`
          INSERT INTO "2025-2026_SchoolID" (
            "schoool_id", "school_name", "region", "division", "district", "mcoc"
          ) VALUES ($1, $2, $3, $4, $5, $6);
        `, [parseInt(sch.schoolId, 10), sch.schoolName, sch.region, sch.division, sch.district, sch.mcoc]);
        console.log(`  ✓ Registered in 2025-2026_SchoolID`);
      } catch (err) {
        console.warn(`  ⚠️ 2025-2026_SchoolID note:`, err.message);
      }

      // B. Update / Insert into schools_IERN
      try {
        await client.query(`
          DELETE FROM "schools_IERN" WHERE "SchoolID" = $1;
        `, [sch.schoolId]);

        await client.query(`
          INSERT INTO "schools_IERN" (
            "SchoolID", "School_Name", "Region", "Division", "District", "Curricular_Offering", "IERN"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7);
        `, [sch.schoolId, sch.schoolName, sch.region, sch.division, sch.district, sch.curricularOffering, `IERN-${sch.schoolId}`]);
        console.log(`  ✓ Registered in schools_IERN`);
      } catch (err) {
        console.warn(`  ⚠️ schools_IERN note:`, err.message);
      }

      // C. Clear previous dummy records for this school
      await client.query(`DELETE FROM esf7_database_dummy WHERE CAST(schoool_id AS TEXT) = $1`, [sch.schoolId]);

      // D. Insert Personnel into esf7_database_dummy
      for (const p of sch.personnel) {
        const prn = `PRN-${sch.schoolId}-${p.employee_no}`;
        await client.query(`
          INSERT INTO esf7_database_dummy (
            schoool_id, school_id, school_name, region, division, muncipality, district,
            employee_no, first, middle, last, tin, gender, sex, civil_status,
            religion, ehtinic_group, birthday_yyyy, birthday_mm, birthday_dd,
            position, degree_finished__baccalaureate, major__specialization, major_specialization,
            post_graduate__degree, eligibility, fund_source, nature_of_appointment,
            hiring_arrangement, appt_yyyy, appt_mm, appt_dd, teaching_load, phylsys_num, esf7_id
          ) VALUES (
            $1, $1, $2, $3, $4, $5, $5,
            $6, $7, $8, $9, $10, $11, $11, $12,
            $13, $14, $15, $16, $17,
            $18, $19, $20, $20,
            $21, $22, $23, $24,
            $25, $26, $27, $28, $29, $30, $31
          )
        `, [
          sch.schoolId, sch.schoolName, sch.region, sch.division, sch.district,
          p.employee_no, p.first, p.middle, p.last, p.tin, p.gender, p.civil_status,
          p.religion, p.ehtinic_group, p.birthday_yyyy, p.birthday_mm, p.birthday_dd,
          p.position, p.degree_finished__baccalaureate, p.major__specialization,
          p.post_graduate__degree, p.eligibility, p.fund_source, p.nature_of_appointment,
          p.hiring_arrangement, p.appt_yyyy, p.appt_mm, p.appt_dd, p.teaching_load,
          `PHILSYS-${sch.schoolId}-${p.employee_no}`, `ESF7-${sch.schoolId}-${p.employee_no}`
        ]);
      }
      console.log(`  ✓ Inserted ${sch.personnel.length} personnel into esf7_database_dummy`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 ALL 6 ARCHETYPE DUMMY SCHOOLS SEEDED SUCCESSFULLY!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding 6 archetype dummy schools:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSixArchetypeSchools();
