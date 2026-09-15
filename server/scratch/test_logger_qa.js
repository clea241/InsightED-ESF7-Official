const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runQATests() {
  console.log('🧪 [Logger QA Verifier]: Testing Express API Live Endpoints...');
  
  // 1. GET /api/salary-matrix
  try {
    const res1 = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/salary-matrix',
      method: 'GET'
    });
    console.log(`✅ [Test 1] GET /api/salary-matrix -> HTTP ${res1.status}`);
  } catch (err) {
    console.error(`❌ [Test 1 Failed]:`, err.message);
  }

  // 2. GET /api/schools
  try {
    const res2 = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/schools',
      method: 'GET'
    });
    console.log(`✅ [Test 2] GET /api/schools -> HTTP ${res2.status}`);
  } catch (err) {
    console.error(`❌ [Test 2 Failed]:`, err.message);
  }

  // 3. 404 Route Test
  try {
    const res3 = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/unknown-endpoint-qa-check',
      method: 'GET'
    });
    console.log(`✅ [Test 3] GET /api/unknown-endpoint-qa-check -> HTTP ${res3.status} (Expected 404)`);
  } catch (err) {
    console.error(`❌ [Test 3 Failed]:`, err.message);
  }
}

runQATests();
