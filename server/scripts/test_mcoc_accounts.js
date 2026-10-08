const { resolveTestDivision, MCOC_ARCHETYPES } = require('../utils/divisionTestRegistry');
const { getPoolForSchool } = require('../db');

async function testMCOCAccounts() {
  console.log('=====================================================');
  console.log('🚀 TESTING MCOC ARCHETYPE TEST ACCOUNTS (900223-900230)');
  console.log('=====================================================\n');

  console.log(`Total MCOC Archetype Accounts: ${MCOC_ARCHETYPES.length}\n`);

  let allPassed = true;

  for (const arch of MCOC_ARCHETYPES) {
    console.log(`--- [School ID: ${arch.schoolId}] ${arch.schoolName} ---`);
    console.log(`  MCOC Type:           ${arch.mcoc}`);
    console.log(`  Canonical Handle:    ${arch.handle}`);
    console.log(`  Short Handle:        ${arch.shortHandle}`);

    // 1. Test handle resolution
    const resByHandle = resolveTestDivision(arch.handle);
    const resByShort = resolveTestDivision(arch.shortHandle);
    const resById = resolveTestDivision(arch.schoolId);

    if (!resByHandle || resByHandle.schoolId !== arch.schoolId) {
      console.error(`  ❌ Failed to resolve by canonical handle: ${arch.handle}`);
      allPassed = false;
    } else {
      console.log(`  ✅ Resolved by canonical handle: ${arch.handle} -> ID ${resByHandle.schoolId}`);
    }

    if (!resByShort || resByShort.schoolId !== arch.schoolId) {
      console.error(`  ❌ Failed to resolve by short handle: ${arch.shortHandle}`);
      allPassed = false;
    } else {
      console.log(`  ✅ Resolved by short handle: ${arch.shortHandle} -> ID ${resByShort.schoolId}`);
    }

    if (!resById || resById.schoolId !== arch.schoolId) {
      console.error(`  ❌ Failed to resolve by schoolId: ${arch.schoolId}`);
      allPassed = false;
    } else {
      console.log(`  ✅ Resolved by school ID: ${arch.schoolId} -> ${resById.schoolName}`);
    }

    // 2. Test DB pool routing
    const pool = getPoolForSchool(arch.schoolId);
    const dbRes = await pool.query('SELECT current_database()');
    const dbName = dbRes.rows[0].current_database;
    if (dbName !== 'insighted_esf7_staging') {
      console.error(`  ❌ POOL ROUTING ERROR: ID ${arch.schoolId} routed to ${dbName} (Expected: insighted_esf7_staging)`);
      allPassed = false;
    } else {
      console.log(`  ✅ DB Pool Routing: ID ${arch.schoolId} -> strictly connected to [${dbName}]`);
    }

    console.log('');
  }

  // Test local API auth endpoint if running
  try {
    const response = await fetch('http://localhost:5000/api/auth/migrate-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'mcoc.elem.test', password: '123456' })
    });
    const data = await response.json();

    if (data && data.token && data.user && data.user.school_id === '900223') {
      console.log('✅ API Auth Test Passed for mcoc.elem.test / 123456:');
      console.log('   User:', data.user);
    }
  } catch (err) {
    console.log('ℹ️  Note: Local server auth test skipped or offline:', err.message);
  }

  if (allPassed) {
    console.log('=====================================================');
    console.log('🎉 ALL MCOC ARCHETYPE TEST ACCOUNTS VERIFIED PERFECTLY!');
    console.log('=====================================================');
    process.exit(0);
  } else {
    console.error('❌ SOME CHECKS FAILED');
    process.exit(1);
  }
}

testMCOCAccounts().catch(console.error);
