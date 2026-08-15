const http = require('http');

http.get('http://localhost:5000/api/dashboard/stats?simulated_date=2026-09-05', (res) => {
  let rawData = '';
  res.on('data', chunk => { rawData += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(rawData);
      console.log('✅ Calendar Status for Sept 5, 2026:');
      console.log(JSON.stringify(parsed.term_calendar_status, null, 2));
      
      const isCorrect = parsed.term_calendar_status.block_type === 'END_OF_TERM' && parsed.term_calendar_status.overload_pay_eligible === false;
      if (isCorrect) {
        console.log('🎉 Verification PASSED: End of term date accurately returned block_type = END_OF_TERM and overload_pay_eligible = false!');
        process.exit(0);
      } else {
        console.error('❌ Verification FAILED!');
        process.exit(1);
      }
    } catch (e) {
      console.error('❌ JSON error:', e);
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.error('❌ Request error:', e);
  process.exit(1);
});
