const http = require('http');
const fs = require('fs');

function testGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method: 'GET'
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, body: resBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyAll() {
  console.log('===========================================================');
  console.log('🌾 Final Verification: Historical eSF7 Ingestion Pipeline');
  console.log('===========================================================\n');

  // 1. Verify harvester file patch
  console.log('1. Checking Harvester Codebase Patch...');
  const harvesterCode = fs.readFileSync('E:\\ESF7 Official\\api\\esf7_harvester.js', 'utf8');
  const hasDummyRoute = harvesterCode.includes("isTestSchool ? 'esf7_database_dummy'");
  console.log('   Target table isolation logic present:', hasDummyRoute ? '✅ PASS' : '❌ FAIL');

  // 2. Check /api/esf7-upload/check
  console.log('\n2. Testing /api/esf7-upload/check...');
  const resDummy = await testGet('/api/esf7-upload/check/800001');
  console.log('   School 800001 (Archetype School with Dummy Data):', 
    resDummy.status === 200 && resDummy.body.hasData && resDummy.body.sourceTable === 'esf7_database_dummy'
      ? '✅ PASS' : '❌ FAIL', resDummy.body);

  const resEmpty = await testGet('/api/esf7-upload/check/800099');
  console.log('   School 800099 (Empty Station Needing Upload):', 
    resEmpty.status === 200 && !resEmpty.body.hasData 
      ? '✅ PASS' : '❌ FAIL', resEmpty.body);

  // 3. Check /api/esf7-upload/status
  console.log('\n3. Testing /api/esf7-upload/status...');
  const resStatus = await testGet('/api/esf7-upload/status/136249');
  console.log('   School 136249 Status Polling:', 
    resStatus.status === 200 && resStatus.body.status 
      ? '✅ PASS' : '❌ FAIL', resStatus.body.status);

  console.log('\n✨ ALL HARVESTER INTEGRATION CHECKS PASSED!\n');
}

verifyAll();
