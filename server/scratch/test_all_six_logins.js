const http = require('http');

function testPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
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
  const schools = ['800001', '800002', '800003', '800004', '800005', '800006'];
  console.log('Validating all 6 schools on PIN login & Password login...');
  
  for (const s of schools) {
    // 1. Passcode login
    const pinRes = await testPost('/api/auth/passcode-login', { school_id: s, passcode: s });
    const pinOk = pinRes.status === 200 && pinRes.body.success;

    // 2. Password login
    const passRes = await testPost('/api/auth/migrate-login', { school_id: s, password: 'password123' });
    const passOk = passRes.status === 200 && passRes.body.success;

    console.log(`School [${s}]: Passcode(${s}) -> ${pinOk ? '✅ OK' : '❌ FAIL ' + JSON.stringify(pinRes.body)} | Password -> ${passOk ? '✅ OK' : '❌ FAIL'}`);
  }
}

run();
