const http = require('http');

async function run() {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const payload = JSON.stringify({
    school_id: '123456',
    school_year: 'SY 26-27',
    type: 'teaching',
    salutation: 'MR.',
    first_name: 'RANDOM' + randomSuffix,
    middle_name: 'N/A',
    last_name: 'USER' + randomSuffix,
    deped_email: `random.user${randomSuffix}@deped.gov.ph`,
    position: 'TEACHER I'
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/personnel',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  console.log('Sending POST to /api/personnel...');
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      console.log('Response data:', data);
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
  });

  req.write(payload);
  req.end();
}

run();
