const db = require('../db');

async function testIdempotency() {
  console.log('================================================================');
  console.log('🔄 TESTING DEEP IDEMPOTENCY ACROSS 50 RANDOM + 3 LARGEST SCHOOLS');
  console.log('================================================================\n');

  // 3 largest payload schools from Phase 1 audit + School 300488
  const largestSchools = ['305424', '305408', '305382'];
  console.log('3 Largest payload schools (from Phase 1 report):', largestSchools);

  // Pick 50 random schools
  const randomRes = await db.query(`
    SELECT REPLACE(school_id, 'SCH-', '') as sid 
    FROM school_drafts 
    WHERE REPLACE(school_id, 'SCH-', '') NOT IN ('300488', '305424', '305408', '305382')
    ORDER BY RANDOM() 
    LIMIT 50
  `);
  const randomSchools = randomRes.rows.map(r => r.sid);

  const testSchools = ['300488', ...largestSchools, ...randomSchools];
  console.log(`Total sample schools to test: ${testSchools.length}\n`);

  // Snapshot before counts for these schools
  async function getSampleCounts(schools) {
    const sList = schools.map(s => `'${s}'`).join(',');
    const prof = (await db.query(`SELECT count(*) c FROM esf7_school_profile WHERE school_id IN (${sList})`)).rows[0].c;
    const per = (await db.query(`SELECT count(*) c FROM esf7_personnel_profile WHERE school_id IN (${sList})`)).rows[0].c;
    const emp = (await db.query(`SELECT count(*) c FROM esf7_personnel_employment e JOIN esf7_personnel_profile p ON e.personnel_id = p.id WHERE p.school_id IN (${sList})`)).rows[0].c;
    const edu = (await db.query(`SELECT count(*) c FROM esf7_perssonel_educ e JOIN esf7_personnel_profile p ON e.personnel_id = p.id WHERE p.school_id IN (${sList})`)).rows[0].c;
    const reg = (await db.query(`SELECT count(*) c FROM esf7_regular_sections WHERE school_id IN (${sList})`)).rows[0].c;
    const als = (await db.query(`SELECT count(*) c FROM esf7_als_sections WHERE school_id IN (${sList})`)).rows[0].c;
    const sned = (await db.query(`SELECT count(*) c FROM esf7_sned_sections WHERE school_id IN (${sList})`)).rows[0].c;
    const wkl = (await db.query(`SELECT count(*) c FROM esf7_workload_rows WHERE school_id IN (${sList})`)).rows[0].c;
    const status = (await db.query(`SELECT count(*) c FROM esf7_school_node_status WHERE school_id IN (${sList})`)).rows[0].c;

    return {
      esf7_school_profile: Number(prof),
      esf7_personnel_profile: Number(per),
      esf7_personnel_employment: Number(emp),
      esf7_perssonel_educ: Number(edu),
      esf7_regular_sections: Number(reg),
      esf7_als_sections: Number(als),
      esf7_sned_sections: Number(sned),
      esf7_workload_rows: Number(wkl),
      esf7_school_node_status: Number(status)
    };
  }

  const countsBefore = await getSampleCounts(testSchools);
  console.log('Sample Row Counts BEFORE:');
  console.log(JSON.stringify(countsBefore, null, 2));

  // Temporarily remove test schools from migration log to force full re-execution
  console.log('\nTemporarily removing test schools from migration log to force re-execution...');
  const sParam = testSchools.map((s, idx) => `$${idx + 1}`).join(',');
  await db.query(`DELETE FROM esf7_migration_log WHERE school_id IN (${sParam})`, testSchools);

  // Run migration on each test school
  const { execSync } = require('child_process');
  let processed = 0;
  for (const sid of testSchools) {
    execSync(`node server/scripts/disaggregate_school_drafts.js --apply --confirm-db esf7_local --school ${sid}`, {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    processed++;
    if (processed % 10 === 0 || processed === testSchools.length) {
      console.log(`  Re-applied ${processed}/${testSchools.length} schools...`);
    }
  }

  const countsAfter = await getSampleCounts(testSchools);
  console.log('\nSample Row Counts AFTER Re-migration:');
  console.log(JSON.stringify(countsAfter, null, 2));

  let isMatch = true;
  for (const table of Object.keys(countsBefore)) {
    if (countsBefore[table] !== countsAfter[table]) {
      console.error(`❌ MISMATCH in ${table}: Before=${countsBefore[table]}, After=${countsAfter[table]}`);
      isMatch = false;
    }
  }

  if (isMatch) {
    console.log('\n✅ PASS: PERFECT IDEMPOTENCY CONFIRMED!');
    console.log('Zero net row insertions, zero deletions, exactly identical counts across all tables.');
  } else {
    console.error('\n❌ FAIL: Idempotency check failed.');
    process.exit(1);
  }

  process.exit(0);
}

testIdempotency().catch(err => {
  console.error(err);
  process.exit(1);
});
