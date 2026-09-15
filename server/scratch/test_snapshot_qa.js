const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function testSnapshot() {
  console.log('🧪 [Snapshot QA Verifier]: Testing /api/dev/snapshot/:schoolId...');

  // 1. Real / Pilot school 502624
  try {
    const res = await fetchJson('http://127.0.0.1:5000/api/dev/snapshot/502624');
    console.log(`✅ [Test 1] School 502624 -> HTTP ${res.status}`);
    console.log('   Snapshot Payload Result:');
    console.log(`   - Health Status: ${res.data.healthStatus}`);
    console.log(`   - Personnel Total: ${res.data.summary.personnel.total} (School Head: ${res.data.summary.personnel.schoolHeadFound})`);
    console.log(`   - Regular Sections: ${res.data.summary.sections.regularCount} (Learners: ${res.data.summary.sections.totalLearners})`);
    console.log(`   - Workloads: ${res.data.summary.workloads.total}`);
    console.log(`   - Orphans: ${JSON.stringify(res.data.orphans)}`);
  } catch (err) {
    console.error('❌ [Test 1 Failed]:', err.message);
  }

  // 2. Dummy / Test School 199999
  try {
    const res2 = await fetchJson('http://127.0.0.1:5000/api/dev/snapshot/199999');
    console.log(`\n✅ [Test 2] School 199999 -> HTTP ${res2.status}`);
    console.log(`   - Health Status: ${res2.data.healthStatus}`);
    console.log(`   - Personnel Total: ${res2.data.summary.personnel.total}`);
    console.log(`   - Orphans: ${JSON.stringify(res2.data.orphans)}`);
  } catch (err) {
    console.error('❌ [Test 2 Failed]:', err.message);
  }
}

testSnapshot();
