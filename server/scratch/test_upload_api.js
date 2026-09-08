const http = require('http');

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

async function run() {
  console.log('Testing /api/esf7-upload/check endpoint...');
  
  // Test 0: School 800001 (Should have dummy data)
  const r0 = await testGet('/api/esf7-upload/check/800001');
  console.log('School 800001 check:', r0.status === 200 ? '✅ OK' : '❌ FAIL', r0.body);

  // Test 1: Regular School 800009 (No data -> requiresForceUpload)
  const r1 = await testGet('/api/esf7-upload/check/800009');
  console.log('\nSchool 800009 (Established/Regular with 0 records):');
  console.log(' - requiresForceUpload:', r1.body.requiresForceUpload);
  console.log(' - isExempted:', r1.body.isExempted);

  // Test 2: Newly Established School 306480 (from pending_schools)
  const r2 = await testGet('/api/esf7-upload/check/306480');
  console.log('\nSchool 306480 (Newly Established):');
  console.log(' - pendingSchool:', r2.body.pendingSchool);
  console.log(' - isExempted:', r2.body.isExempted);
  console.log(' - requiresForceUpload:', r2.body.requiresForceUpload);

  // Test 3: Converted School 502957 (from pending_schools)
  const r3 = await testGet('/api/esf7-upload/check/502957');
  console.log('\nSchool 502957 (Converted School):');
  console.log(' - pendingSchool:', r3.body.pendingSchool);
  console.log(' - requiresForceUpload:', r3.body.requiresForceUpload);
}

run();
