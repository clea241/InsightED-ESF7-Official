const http = require('http');
const { execSync } = require('child_process');

function getRedisTelemetry() {
  const xlen = execSync('redis-cli XLEN esf7:submission_stream', { encoding: 'utf8' }).trim();
  const xpending = execSync('redis-cli XPENDING esf7:submission_stream esf7_submission_group', { encoding: 'utf8' }).trim();
  const pendingCount = (xpending.match(/^\d+/) || ['0'])[0];
  return { xlen: parseInt(xlen, 10), pendingCount: parseInt(pendingCount, 10), rawPending: xpending };
}

async function verifySubmission() {
  console.log('--- Verifying Staging Submission & Redis Stream ---');
  const before = getRedisTelemetry();
  console.log(`Before: Stream Length = ${before.xlen}, Pending = ${before.pendingCount}`);

  const subPayload = JSON.stringify({
    school_id: '900230',
    school_year: '2026-2027',
    certified_by: 'Redis Verifier Step',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    payload: {
      schoolInfo: { schoolId: '900230', schoolName: 'VERIFY TEST SCHOOL' },
      personnel: [
        { id: 'PER-900230-001', prn: 'TEST-900230-001', firstName: 'TEST', lastName: 'TEACHER', position: 'TEACHER I' }
      ]
    }
  });

  const t0 = Date.now();
  const subResult = await new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5035,
      path: '/api/submissions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(subPayload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, duration: Date.now() - t0 }));
    });
    req.on('error', err => resolve({ statusCode: 0, error: err.message, duration: Date.now() - t0 }));
    req.write(subPayload);
    req.end();
  });

  console.log(`Submission HTTP Status: ${subResult.statusCode} in ${subResult.duration}ms`);
  
  // Wait up to 5s for queue worker to ingest and stream entry to appear
  let after = getRedisTelemetry();
  const deadline = Date.now() + 5000;
  while (after.xlen === before.xlen && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    after = getRedisTelemetry();
  }

  // Allow worker to finish acknowledgment
  await new Promise(r => setTimeout(r, 500));
  after = getRedisTelemetry();

  console.log(`After: Stream Length = ${after.xlen}, Pending = ${after.pendingCount}`);

  const streamOk = after.xlen === before.xlen + 1;
  const pendingOk = after.pendingCount === 0;
  const statusOk = subResult.statusCode === 200 || subResult.statusCode === 202;

  if (statusOk && streamOk && pendingOk) {
    console.log('✅ VERIFICATION PASSED: Submission ingested and acknowledged with 0 pending entries.');
    process.exit(0);
  } else {
    console.error(`❌ VERIFICATION FAILED: statusOk=${statusOk}, streamOk=${streamOk}, pendingOk=${pendingOk}`);
    process.exit(1);
  }
}

verifySubmission().catch(err => {
  console.error(err);
  process.exit(1);
});
