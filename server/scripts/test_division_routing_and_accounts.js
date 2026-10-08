const assert = require('assert');
const { TEST_DIVISIONS, resolveTestDivision, getRegionSlug } = require('../utils/divisionTestRegistry');
const db = require('../db');

async function testDivisionRegistryAndRouting() {
  console.log('🧪 Testing Division Test Accounts & Staging Routing...\n');

  // 1. Verify 1 Division = 1 Account
  console.log(`Total DepEd Divisions registered: ${TEST_DIVISIONS.length}`);
  const handleSet = new Set();
  const schoolIdSet = new Set();

  for (const div of TEST_DIVISIONS) {
    assert(!handleSet.has(div.handle), `Duplicate handle detected: ${div.handle}`);
    assert(!schoolIdSet.has(div.schoolId), `Duplicate schoolId detected: ${div.schoolId}`);
    handleSet.add(div.handle);
    schoolIdSet.add(div.schoolId);
  }
  console.log(`✅ 1-to-1 Mapping Verified: Exactly ${handleSet.size} unique division accounts mapped to ${schoolIdSet.size} unique IDs.\n`);

  // 2. Test Region-Prefixed Handles
  const testCases = [
    { input: 'rcar.benguet.test', expectedRegion: 'CAR', expectedDiv: 'BENGUET' },
    { input: 'rcar.benguet', expectedRegion: 'CAR', expectedDiv: 'BENGUET' },
    { input: 'r5.naga.test', expectedRegion: 'REGION V', expectedDiv: 'NAGA CITY' },
    { input: 'r5.naga', expectedRegion: 'REGION V', expectedDiv: 'NAGA CITY' },
    { input: 'rncr.pasig.test', expectedRegion: 'NCR', expectedDiv: 'PASIG CITY' },
    { input: 'r4a.cavite.test', expectedRegion: 'REGION IV-A', expectedDiv: 'CAVITE CITY' },
    { input: 'r11.davao.test', expectedRegion: 'REGION XI', expectedDiv: 'DAVAO CITY' },
    { input: 'rbarmm.marawi.test', expectedRegion: 'BARMM', expectedDiv: 'MARAWI CITY' },
    { input: 'r7.nagacebu.test', expectedRegion: 'REGION VII', expectedDiv: 'CITY OF NAGA, CEBU' }
  ];

  for (const tc of testCases) {
    const res = resolveTestDivision(tc.input);
    assert(res, `Failed to resolve handle: ${tc.input}`);
    assert.strictEqual(res.region, tc.expectedRegion, `Region mismatch for ${tc.input}: expected ${tc.expectedRegion}, got ${res.region}`);
    console.log(`  ✓ Resolved '${tc.input}' ➔ ${res.region} (${res.division}) [ID: ${res.schoolId}]`);
  }

  // 3. Test Staging vs Prod Database Routing
  console.log('\nTesting Database Routing...');
  assert.strictEqual(db.isDivisionOrTestAccount('900085'), true, '900085 should be test account');
  assert.strictEqual(db.isDivisionOrTestAccount('divtest-900215'), true, 'divtest should be test account');
  assert.strictEqual(db.isDivisionOrTestAccount('100115'), false, '100115 should NOT be test account');

  const stagingPool = db.getPoolForSchool('900085');
  console.log(`  ✓ 900085 (r5.naga.test) ➔ Routes to: ${stagingPool.options.connectionString.split('/').pop()}`);
  assert(stagingPool.options.connectionString.includes('insighted_esf7_staging'), 'Should route to staging DB');

  console.log('\n🎉 ALL TESTS PASSED! 1 Division = 1 Account with region.division.test format and staging isolation verified!');
}

testDivisionRegistryAndRouting().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
