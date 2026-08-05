const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insighted_esf7`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Seed data generators
const FIRST_NAMES = ['MARIA', 'JUAN', 'JOSE', 'ANA', 'CARLOS', 'ELENA', 'GRACE', 'PEDRO', 'LUIS', 'MARK', 'ANGEL', 'ROSA', 'PAOLO', 'CHRISTINE', 'DANIEL', 'PATRICIA', 'RAMON', 'MICHELLE', 'FRANCISCO', 'LEA'];
const LAST_NAMES = ['DELA CRUZ', 'SANTOS', 'REYES', 'GONZALES', 'BAUTISTA', 'GARCIA', 'RAMOS', 'MENDOZA', 'FLORES', 'TORRES', 'VILLANUEVA', 'CASTILLO', 'ALVAREZ', 'AQUINO', 'NAVARRO', 'RODRIGUEZ', 'PEREZ', 'CRUZ', 'SOLIS', 'VALDEZ'];
const MIDDLE_INITIALS = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'M.', 'R.', 'S.', 'T.'];

const POSITIONS = [
  'TEACHER I', 'TEACHER I', 'TEACHER I',
  'TEACHER II', 'TEACHER II',
  'TEACHER III', 'TEACHER III',
  'MASTER TEACHER I', 'MASTER TEACHER II',
  'SPED TEACHER I', 'HEAD TEACHER I'
];

const SPECIALIZATIONS = [
  'GENERAL EDUCATION', 'ENGLISH', 'FILIPINO', 'MATHEMATICS',
  'SCIENCE', 'ARALING PANLIPUNAN', 'MAPEH', 'VALUES EDUCATION', 'TLE/EPP'
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

async function reseedPilotTable() {
  const pilotConfig = [
    { schoolId: '305337', division: 'Quezon City', count: 380 },
    { schoolId: '101190', division: 'Alaminos City', count: 17 },
    { schoolId: '305280', division: 'Baguio City', count: 80 },
    { schoolId: '110416', division: 'Oriental Mindoro', count: 19 },
    { schoolId: '500552', division: 'Iloilo City', count: 46 },
    { schoolId: '500484', division: 'Cebu', count: 32 },
    { schoolId: '124214', division: 'Ormoc City', count: 36 },
    { schoolId: '125789', division: 'Zamboanga Sibugay', count: 22 },
    { schoolId: '305514', division: 'Davao Oriental', count: 12 },
    { schoolId: '131280', division: 'General Santos City', count: 111 },
    { schoolId: '199999', division: 'Test Account', count: 2 }
  ];

  console.log('🔄 Truncating insighted_esf7_pilot table...');
  await db.query(`TRUNCATE TABLE insighted_esf7_pilot RESTART IDENTITY CASCADE;`);
  console.log('✅ insighted_esf7_pilot table truncated successfully.');

  let totalInserted = 0;

  for (const cfg of pilotConfig) {
    console.log(`🌱 Seeding ${cfg.count} dummy personnel for School ID: ${cfg.schoolId} (${cfg.division})...`);
    
    for (let i = 1; i <= cfg.count; i++) {
      const lastName = getRandomItem(LAST_NAMES).toUpperCase();
      const firstName = getRandomItem(FIRST_NAMES);
      const middle = getRandomItem(MIDDLE_INITIALS);
      const fullName = `${lastName}, ${firstName} ${middle}`;

      const sex = Math.random() > 0.4 ? 'Female' : 'Male';
      const civilStatus = Math.random() > 0.3 ? 'Married' : 'Single';
      const birthMm = padZero(getRandomInt(1, 12));
      const birthDd = padZero(getRandomInt(1, 28));
      const birthYyyy = String(getRandomInt(1975, 1999));

      const apptMm = padZero(getRandomInt(1, 12));
      const apptDd = padZero(getRandomInt(1, 28));
      const apptYyyy = String(getRandomInt(2010, 2023));

      const position = getRandomItem(POSITIONS);
      const spec = getRandomItem(SPECIALIZATIONS);
      const iern = `2026-${cfg.schoolId}-${padZero(i)}`;
      const phylsys = `7000-${getRandomInt(1000, 9999)}-${getRandomInt(1000, 9999)}`;

      await db.query(`
        INSERT INTO insighted_esf7_pilot (
          school_id, name, sex, civil_status, birthday_mm, birthday_dd, birthday_yyyy,
          phylsys_num, position, nature_of_appointment, fund_source, eligibility,
          appt_mm, appt_dd, appt_yyyy, station_mm, station_dd, station_yyyy,
          major_specialization, iern, is_pilot, semester, pilot_password
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, 'REGULAR PERMANENT', 'NATIONAL', 'PBET / LET',
          $10, $11, $12, $10, $11, $12,
          $13, $14, TRUE, '1st Semester', 'Pilot2026!'
        )
      `, [
        cfg.schoolId, fullName, sex, civilStatus, birthMm, birthDd, birthYyyy,
        phylsys, position, apptMm, apptDd, apptYyyy,
        spec, iern
      ]);

      totalInserted++;
    }
  }

  console.log(`\n🎉 SUCCESS: Reseeded a total of ${totalInserted} dummy personnel records across 11 Pilot Schools into insighted_esf7_pilot!`);

  // Verify counts in DB
  const verifyRes = await db.query(`
    SELECT school_id, COUNT(*) as count 
    FROM insighted_esf7_pilot 
    GROUP BY school_id 
    ORDER BY school_id
  `);

  console.log('\n=== VERIFICATION COUNTS IN insighted_esf7_pilot ===');
  verifyRes.rows.forEach(r => {
    console.log(`  - School ID ${r.school_id}: ${r.count} records`);
  });

  process.exit(0);
}

reseedPilotTable().catch(err => {
  console.error('❌ Reseeding error:', err);
  process.exit(1);
});
