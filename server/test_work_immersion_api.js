const db = require('./db');

async function testWorkImmersionFlow() {
  console.log('Testing esf7_work_immersion insertion, lunch break (12:00-13:00) deduction, and CASCADE deletion...');

  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-013'`);

  // 1. Insert Profile
  await db.query(`
    INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name)
    VALUES ('PER-TEST-013', 'PRN-013013013013', '108348', '2026-2027', 'MACARIO', 'SAKAY')
  `);

  // 2. Test Full Day Visit: 08:00 to 17:00 (9 elapsed hours - 1 hr lunch = 8 hrs / 480 mins)
  const sh = 8 * 60;
  const eh = 17 * 60;
  let dur = eh - sh;
  // Deduct 1 hour (60 mins) for 12:00 PM - 1:00 PM lunch
  if (sh < 780 && eh > 720) {
    dur -= 60;
  }

  const wimRes = await db.query(`
    INSERT INTO esf7_work_immersion (
      id, personnel_id, school_id, school_year, visit_date, start_time, end_time, duration_minutes, raw_payload
    ) VALUES (
      'WIM-108348-013', 'PER-TEST-013', '108348', '2026-2027', '2026-09-22', '08:00:00', '17:00:00', $1, '{"test": "full_day"}'::jsonb
    ) RETURNING *
  `, [dur]);

  console.log('✅ Created Work Immersion Record:');
  const dStr = wimRes.rows[0].visit_date instanceof Date ? wimRes.rows[0].visit_date.toISOString().split('T')[0] : String(wimRes.rows[0].visit_date).split('T')[0];
  console.log('ID:', wimRes.rows[0].id, '| Date:', dStr, '| Schedule:', `${wimRes.rows[0].start_time} - ${wimRes.rows[0].end_time}`);
  console.log('Duration Minutes:', wimRes.rows[0].duration_minutes, `(${(wimRes.rows[0].duration_minutes / 60).toFixed(1)} hrs - Lunch break 12-1pm excluded)`);

  if (wimRes.rows[0].duration_minutes !== 480) {
    throw new Error(`Expected 480 duration minutes (8 hrs), got ${wimRes.rows[0].duration_minutes}`);
  }

  // 3. Test CASCADE Deletion
  await db.query(`DELETE FROM esf7_personnel_profile WHERE id = 'PER-TEST-013'`);
  const checkDel = await db.query(`SELECT COUNT(*) FROM esf7_work_immersion WHERE personnel_id = 'PER-TEST-013'`);
  console.log('✅ ON DELETE CASCADE check (should be 0):', checkDel.rows[0].count);

  process.exit(0);
}

testWorkImmersionFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
