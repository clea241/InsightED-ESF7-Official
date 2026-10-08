const db = require('../db');

async function testDatabaseRouting() {
  console.log('--- Testing Database Pool Routing for Dummy Accounts vs Real Schools ---');

  // Test 1: Identify dummy / test accounts
  const testIds = [
    '900230',
    '900223',
    '900001',
    '900222',
    '800000',
    '800050',
    '199999',
    '199000',
    'divtest-900001',
    'pilot-199999',
    'r5.naga.test',
    'mcoc.all.test',
    'mcoc.elem',
    'dummy-station'
  ];

  const realSchoolIds = [
    '108348',
    '305337',
    '101190',
    '124214',
    '500552'
  ];

  console.log('\n1. Checking isDivisionOrTestAccount():');
  for (const id of testIds) {
    const isTest = db.isDivisionOrTestAccount(id);
    if (!isTest) {
      console.error(`❌ FAILED: ${id} should be identified as dummy/test account`);
      process.exit(1);
    }
    console.log(`  ✅ ${id} -> isDivisionOrTestAccount: TRUE`);
  }

  for (const id of realSchoolIds) {
    const isTest = db.isDivisionOrTestAccount(id);
    if (isTest) {
      console.error(`❌ FAILED: ${id} is a real school and should NOT be identified as dummy/test account`);
      process.exit(1);
    }
    console.log(`  ✅ Real School ${id} -> isDivisionOrTestAccount: FALSE`);
  }

  console.log('\n2. Checking Pool resolution in Production Mode:');
  process.env.NODE_ENV = 'production';

  for (const id of testIds) {
    const pool = db.getPoolForSchool(id);
    if (pool !== db.stagingPool) {
      console.error(`❌ FAILED: ${id} did not resolve to stagingPool in production!`);
      process.exit(1);
    }
    console.log(`  ✅ ${id} -> Pool correctly resolves to stagingPool (insighted_esf7_staging)`);
  }

  for (const id of realSchoolIds) {
    const pool = db.getPoolForSchool(id);
    if (pool !== db.prodPool) {
      console.error(`❌ FAILED: ${id} did not resolve to prodPool in production!`);
      process.exit(1);
    }
    console.log(`  ✅ Real School ${id} -> Pool correctly resolves to prodPool (insighted_esf7)`);
  }

  console.log('\n3. Testing AsyncLocalStorage Execution Context:');
  // Query inside runWithSchool for 900230 (dummy account)
  await db.runWithSchool('900230', async () => {
    const res = await db.query('SELECT current_database() as db_name');
    console.log(`  🔍 Dummy School 900230 Query Database Name: ${res.rows[0].db_name}`);
    if (res.rows[0].db_name !== 'insighted_esf7_staging') {
      console.error(`❌ FAILED: 900230 queried database ${res.rows[0].db_name}, expected insighted_esf7_staging`);
      process.exit(1);
    }
    console.log('  ✅ Dummy School 900230 executed on insighted_esf7_staging');
  });

  // Query inside runWithSchool for 199999 (dummy account)
  await db.runWithSchool('199999', async () => {
    const res = await db.query('SELECT current_database() as db_name');
    console.log(`  🔍 Dummy School 199999 Query Database Name: ${res.rows[0].db_name}`);
    if (res.rows[0].db_name !== 'insighted_esf7_staging') {
      console.error(`❌ FAILED: 199999 queried database ${res.rows[0].db_name}, expected insighted_esf7_staging`);
      process.exit(1);
    }
    console.log('  ✅ Dummy School 199999 executed on insighted_esf7_staging');
  });

  // Query inside runWithSchool for real school 108348
  await db.runWithSchool('108348', async () => {
    const res = await db.query('SELECT current_database() as db_name');
    console.log(`  🔍 Real School 108348 Query Database Name: ${res.rows[0].db_name}`);
    if (res.rows[0].db_name !== 'insighted_esf7') {
      console.error(`❌ FAILED: 108348 queried database ${res.rows[0].db_name}, expected insighted_esf7`);
      process.exit(1);
    }
    console.log('  ✅ Real School 108348 executed on insighted_esf7');
  });

  console.log('\n4. Testing Fallback Query Parameter Inspection outside request context:');
  const fallbackDummyRes = await db.query('SELECT current_database() as db_name, $1 as sch_id', ['900230']);
  console.log(`  🔍 Param fallback query for '900230' Database Name: ${fallbackDummyRes.rows[0].db_name}`);
  if (fallbackDummyRes.rows[0].db_name !== 'insighted_esf7_staging') {
    console.error(`❌ FAILED: Fallback dummy param query was not routed to staging!`);
    process.exit(1);
  }
  console.log('  ✅ Fallback parameter-based query routed to insighted_esf7_staging successfully!');

  console.log('\n🎉 ALL PRODUCTION DUMMY ACCOUNT STAGING DATABASE ISOLATION TESTS PASSED!');
  process.exit(0);
}

testDatabaseRouting().catch(err => {
  console.error('Fatal Error during test:', err);
  process.exit(1);
});
