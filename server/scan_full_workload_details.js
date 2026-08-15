const pg = require('pg');
const { Pool } = pg;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

function excelTimeToString(fractionVal) {
  if (!fractionVal) return '';
  const num = parseFloat(fractionVal);
  if (isNaN(num)) return String(fractionVal);
  if (num >= 0 && num <= 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hh = String(hrs).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return String(fractionVal);
}

async function main() {
  try {
    const schoolId = '502624';
    console.log(`🔍 Scanning all 20 workload slots for school ${schoolId}...`);

    const res = await pool.query(
      `SELECT * FROM esf7_database WHERE school_id = $1 OR schoool_id = $1 LIMIT 5`,
      [schoolId]
    );

    const rows = res.rows;
    console.log(`✅ Loaded ${rows.length} teacher rows.\n`);

    const uniqueSections = new Set();
    const totalWorkloadSlotsFound = [];

    rows.forEach((teacher, tIdx) => {
      const teacherName = `${teacher.first || ''} ${teacher.last || ''}`.trim();
      let slotCount = 0;

      for (let i = 1; i <= 20; i++) {
        const lvlKey = i === 1 ? 'lvl_1' : `lvl_1_${i}`;
        const subjKey = i === 1 ? 'subject_1' : `subject_1_${i}`;
        const secKey = i === 1 ? 'section_1' : `section_1_${i}`;
        const fromKey = i === 1 ? 'from_1' : `from_1_${i}`;
        const toKey = i === 1 ? 'to_1' : `to_1_${i}`;

        const lvl = teacher[lvlKey];
        const subj = teacher[subjKey];
        const sec = teacher[secKey];
        const fromVal = teacher[fromKey];
        const toVal = teacher[toKey];

        if (lvl || subj || sec) {
          slotCount++;
          uniqueSections.add(`Grade ${lvl} - Section: ${sec}`);
          
          // Days check
          const activeDays = [];
          ['1','2','3','4','5','6','7'].forEach((dNum, idx) => {
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const dKey = i === 1 ? `d${dNum}_1` : `d${dNum}_1_${i}`;
            const isDayActive = String(teacher[dKey]).toLowerCase() === 'true' || teacher[dKey] === '1' || teacher[dKey] === true;
            if (isDayActive) activeDays.push(dayNames[idx]);
          });

          totalWorkloadSlotsFound.push({
            teacher: teacherName,
            slot: i,
            grade: lvl,
            subject: subj,
            section: sec,
            time: `${excelTimeToString(fromVal)} - ${excelTimeToString(toVal)}`,
            days: activeDays.join(', ')
          });
        }
      }

      console.log(`👤 Teacher #${tIdx + 1}: ${teacherName} -> Found ${slotCount} active teaching slots.`);
    });

    console.log(`\n🏫 Unique Class Sections Discovered (${uniqueSections.size}):`);
    console.log(Array.from(uniqueSections));

    console.log(`\n📋 First 5 Extracted Workload Slots:`);
    console.table(totalWorkloadSlotsFound.slice(0, 5));

    process.exit(0);
  } catch (err) {
    console.error('❌ Error scanning details:', err);
    process.exit(1);
  }
}

main();
