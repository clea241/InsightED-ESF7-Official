const http = require('http');

const startTime = Date.now();

http.get('http://localhost:5000/api/dashboard/stats', (res) => {
  let rawData = '';
  res.on('data', chunk => { rawData += chunk; });
  res.on('end', () => {
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ Response Time: ${elapsed}ms (Status ${res.statusCode})`);
    try {
      const parsed = JSON.parse(rawData);
      console.log('✅ Response Payload Structure Validated:');
      console.log(JSON.stringify(parsed, null, 2));
      process.exit(0);
    } catch (e) {
      console.error('❌ Failed to parse JSON response:', e);
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.error('❌ Request error:', e.message);
  process.exit(1);
});
