const http = require('http');

const TOTAL_REQUESTS = 60;
const CONCURRENCY = 8;

const ENDPOINTS = [
  '/api/personnel?schoolId=302261',
  '/api/schools?schoolId=302261',
  '/api/class-sections?schoolId=302261',
  '/api/school?schoolId=199999',
  '/api/personnel?schoolId=199999',
  '/api/requests/incoming?schoolId=302261'
];

function makeRequest(path) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5035,
      path: path,
      method: 'GET',
      headers: { 'Connection': 'close' },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          path,
          statusCode: res.statusCode,
          durationMs: Date.now() - t0,
          sizeBytes: data.length,
          error: null
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('HTTP request timed out after 30s'));
    });

    req.on('error', (err) => {
      resolve({
        path,
        statusCode: 0,
        durationMs: Date.now() - t0,
        sizeBytes: 0,
        error: err.message
      });
    });

    req.end();
  });
}

async function runLoadTest() {
  console.log('🚀 Starting Staging Load Test...');
  console.log(`Configuration: ${TOTAL_REQUESTS} total requests across ${ENDPOINTS.length} endpoints at concurrency ${CONCURRENCY}`);
  console.log('Target: http://127.0.0.1:5035 (insighted-esf7-staging-backend)');

  const results = [];
  const queue = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    queue.push(ENDPOINTS[i % ENDPOINTS.length]);
  }

  const startTime = Date.now();
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const endpoint = queue.shift();
      const res = await makeRequest(endpoint);
      results.push(res);
      completed++;
      if (completed % 10 === 0 || completed === TOTAL_REQUESTS) {
        process.stdout.write(`  [${completed}/${TOTAL_REQUESTS}] completed...\n`);
      }
    }
  }

  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  const totalDuration = Date.now() - startTime;

  console.log('\n=== LOAD TEST SUMMARY ===');
  console.log(`Total Duration: ${totalDuration} ms (${(TOTAL_REQUESTS / (totalDuration / 1000)).toFixed(1)} req/sec)`);

  const statusCounts = {};
  let errorCount = 0;
  let totalLatency = 0;

  for (const r of results) {
    statusCounts[r.statusCode] = (statusCounts[r.statusCode] || 0) + 1;
    if (r.error || r.statusCode !== 200) {
      errorCount++;
      console.warn(`⚠️ Request issue: ${r.path} -> Status: ${r.statusCode}, Error: ${r.error}`);
    }
    totalLatency += r.durationMs;
  }

  const avgLatency = Math.round(totalLatency / results.length);
  const maxLatency = Math.max(...results.map(r => r.durationMs));
  const minLatency = Math.min(...results.map(r => r.durationMs));

  console.log('Status Codes:', JSON.stringify(statusCounts));
  console.log(`Latency: Avg = ${avgLatency}ms | Min = ${minLatency}ms | Max = ${maxLatency}ms`);
  console.log(`Errors / Dropped Requests: ${errorCount} of ${TOTAL_REQUESTS}`);

  // Test Submission Flow
  console.log('\n--- Testing Submission Pipeline ---');
  const subPayload = JSON.stringify({
    school_id: '900230',
    school_year: '2026-2027',
    certified_by: 'Staging Load Tester',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    payload: {
      schoolInfo: { schoolId: '900230', schoolName: 'STAGING LOAD TEST SCHOOL' },
      personnel: [
        { id: 'PER-900230-001', prn: 'TEST-900230-001', firstName: 'TEST', lastName: 'TEACHER', position: 'TEACHER I' }
      ]
    }
  });

  const subResult = await new Promise((resolve) => {
    const t0 = Date.now();
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
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          durationMs: Date.now() - t0,
          response: data
        });
      });
    });
    req.on('error', err => resolve({ statusCode: 0, error: err.message }));
    req.write(subPayload);
    req.end();
  });

  console.log(`Submission Response: Status ${subResult.statusCode} in ${subResult.durationMs}ms`);

  return { errorCount, avgLatency, maxLatency, subStatus: subResult.statusCode };
}

runLoadTest().then(summary => {
  if (summary.errorCount === 0 && (summary.subStatus === 200 || summary.subStatus === 201 || summary.subStatus === 202)) {
    console.log('\n🎉 STAGING LOAD TEST PASSED: 100% SUCCESSFUL, ZERO DROPPED REQUESTS.');
    process.exit(0);
  } else {
    console.error('\n❌ STAGING LOAD TEST FAILED: Observed errors or dropped submissions.');
    process.exit(1);
  }
}).catch(err => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
