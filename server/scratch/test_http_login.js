const http = require('http');

function testPost(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/migrate-login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
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
    req.write(data);
    req.end();
  });
}

async function run() {
  // Test 1: Login with password
  const r1 = await testPost({ school_id: '800001', password: 'password123' });
  console.log('Login with password ("password123"):', r1.status === 200 ? '✅ SUCCESS' : '❌ FAILED', r1.body.user?.school_id, r1.body.user?.last_name);

  // Test 2: Login with passcode
  const r2 = await testPost({ school_id: '800001', password: '800001' });
  console.log('Login with passcode ("800001"):', r2.status === 200 ? '✅ SUCCESS' : '❌ FAILED', r2.body.user?.school_id, r2.body.user?.last_name);

  // Test 2b: POST /api/auth/pin-login
  const rPin = await new Promise((resolve, reject) => {
    const data = JSON.stringify({ school_id: '800001', pin: '800001' });
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/pin-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resBody) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
  console.log('POST /api/auth/pin-login:', rPin.status === 200 ? '✅ SUCCESS' : '❌ FAILED', rPin.body.user?.school_id);

  // Test 3: Unregistered school
  const r3 = await testPost({ school_id: '899999', password: 'password123' });
  console.log('Login with unregistered school:', r3.status === 401 ? '✅ CORRECT 401' : '❌ UNEXPECTED', r3.body.error);
}

run();
