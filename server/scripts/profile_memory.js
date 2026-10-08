const http = require('http');
const { execSync } = require('child_process');

function getPm2Processes() {
  try {
    const raw = execSync('pm2 jlist', { encoding: 'utf8' });
    const list = JSON.parse(raw);
    return list.filter(p => 
      p.name.includes('esf7-staging') || p.name.includes('esf7-prod')
    ).map(p => ({
      id: p.pm_id,
      name: p.name,
      status: p.pm2_env.status,
      memory_mb: (p.monit.memory / 1024 / 1024).toFixed(2),
      cpu: p.monit.cpu,
      restart_time: p.pm2_env.restart_time,
      node_args: p.pm2_env.node_args
    }));
  } catch (err) {
    return { error: err.message };
  }
}

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Generate realistic heavy 15-20MB personnel payload
function generateHeavyPayload(teacherCount = 400) {
  const personnel = [];
  // Large string pad to simulate realistic rich JSON docs, CVs, matrix strings
  const sampleMatrix = JSON.stringify({
    major: 'Mathematics',
    minors: ['Physics', 'General Science'],
    history: Array.from({ length: 30 }, (_, i) => ({
      sy: `201${i % 10}-201${(i % 10) + 1}`,
      learningArea: `Learning Area Grade ${7 + (i % 4)}`,
      minutesPerWeek: 240,
      notes: 'Detailed DepEd curriculum mapping and competency documentation '.repeat(10)
    }))
  });

  for (let i = 1; i <= teacherCount; i++) {
    const pId = `PER-HEAVY-${String(i).padStart(4, '0')}`;
    const workloadRows = [];
    for (let w = 1; w <= 6; w++) {
      workloadRows.push({
        subject: `Mathematics Elective ${w}`,
        gradeLevel: `Grade ${7 + (w % 4)}`,
        sectionName: `Diamond ${w}`,
        startTime: `0${7 + w}:00`,
        endTime: `0${8 + w}:00`,
        days: ['M', 'T', 'W', 'TH', 'F'],
        term: '1st',
        extraNotes: 'Curriculum delivery standards verified '.repeat(20)
      });
    }
    personnel.push({
      id: pId,
      prn: `PRN-HEAVY-${i}`,
      firstName: `TEACHER_${i}`,
      lastName: `DELA_CRUZ_${i}`,
      middleName: 'SANTOS',
      salutation: 'MR.',
      sexAtBirth: 'MALE',
      civilStatus: 'MARRIED',
      position: 'TEACHER III',
      stepIncrement: 3,
      workloadRows,
      administrativeRows: [
        { task: 'Property Custodianship & SDRRM Support', hours: 2, term: '1st', days: ['M', 'T', 'W', 'TH', 'F'], notes: 'Detailed task log '.repeat(15) },
        { task: 'Records Management & LIS Verification', hours: 1, term: '1st', days: ['M', 'W', 'F'], notes: 'Daily attendance logs '.repeat(15) }
      ],
      neapTrainingRows: [
        { title: 'National Educators Academy of the Philippines Advanced Pedagogical Standards', conductor: 'NEAP Central', totalHours: 40, notes: 'Accredited training cert '.repeat(20) },
        { title: 'Higher Order Thinking Skills Professional Development', conductor: 'ROSDO', totalHours: 24, notes: 'Division memo approved '.repeat(20) }
      ],
      certificationRows: [
        { title: 'National Certificate II - Information & Communications Technology', conductor: 'TESDA', totalHours: 120 }
      ],
      designations: [
        'DEPARTMENT HEAD - KEY STAGE 3::APPROVED_SDS',
        'GRADE LEVEL COORDINATOR (Grade 9)::APPROVED_SDS'
      ],
      learningAreaMatrix: sampleMatrix,
      allowances: {
        pera: true,
        uniform: true,
        supplies: true,
        medical: true,
        hardship: false
      }
    });
  }

  const classSections = [];
  for (let s = 1; s <= 60; s++) {
    classSections.push({
      gradeLevel: `Grade ${7 + (s % 4)}`,
      sectionName: `Section ${s}`,
      sectionType: 'MONO GRADE',
      numberOfLearners: 42,
      maleLearners: 21,
      femaleLearners: 21,
      adviserId: `PER-HEAVY-${String((s % teacherCount) + 1).padStart(4, '0')}`
    });
  }

  return {
    schoolId: '199999',
    schoolYear: 'SY 26-27',
    signature: 'data:image/png;base64,' + 'A'.repeat(50000), // ~50KB signature
    certifiedBy: 'HEAVY BENCHMARK PRINCIPAL',
    payload: {
      schoolInfo: {
        schoolName: 'Heavy Ingestion Staging Benchmark High School',
        schoolId: '199999',
        division: 'Division of Benchmark',
        region: 'National Capital Region',
        hasJhsSpecialPrograms: true,
        jhsSpecialPrograms: ['SPECIAL PROGRAM IN THE ARTS', 'SPECIAL PROGRAM IN JOURNALISM']
      },
      personnel,
      classSections,
      term: '1st'
    }
  };
}

async function runProfile() {
  console.log('=== BENCHMARK: GENERATING HEAVY PAYLOAD ===');
  const submission = generateHeavyPayload(350);
  const postData = JSON.stringify(submission);
  const payloadSizeMB = (Buffer.byteLength(postData) / 1024 / 1024).toFixed(2);
  console.log(`Generated heavy payload size: ${payloadSizeMB} MB (${submission.payload.personnel.length} teachers, ${submission.payload.classSections.length} sections)`);

  console.log('\n=== BEFORE LOAD: PM2 METRICS ===');
  console.table(getPm2Processes());

  console.log(`\nSubmitting ${payloadSizeMB} MB to Staging Backend (Port 5035)...`);
  const t0 = Date.now();
  const res = await makeRequest({
    hostname: '127.0.0.1',
    port: 5035,
    path: '/api/submissions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);

  const submitDuration = Date.now() - t0;
  console.log(`HTTP ${res.status} in ${submitDuration}ms:`, res.body);

  if (!res.body || !res.body.jobId) {
    console.error('Submission was not accepted!');
    return;
  }

  const jobId = res.body.jobId;
  console.log(`Monitoring Job #${jobId} heavy processing and memory telemetry...`);

  let maxWorkerMem = 0;
  let maxWebMem = 0;

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    const procs = getPm2Processes();
    const stagingProcs = procs.filter(p => p.name.includes('staging'));
    const worker = stagingProcs.find(p => p.name.includes('worker'));
    const web = stagingProcs.find(p => p.name.includes('backend'));

    if (worker) {
      const wMem = parseFloat(worker.memory_mb);
      if (wMem > maxWorkerMem) maxWorkerMem = wMem;
    }
    if (web) {
      const bMem = parseFloat(web.memory_mb);
      if (bMem > maxWebMem) maxWebMem = bMem;
    }

    try {
      const statusRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 5035,
        path: `/api/submissions/status/${jobId}`,
        method: 'GET'
      });
      if (statusRes.body && (statusRes.body.status === 'completed' || statusRes.body.status === 'failed')) {
        console.log(`\nJob #${jobId} reached '${statusRes.body.status}' after ${(i * 0.5).toFixed(1)}s!`);
        break;
      }
    } catch (e) {}
  }

  console.log('\n=== AFTER PROCESSING: PM2 PROCESS METRICS ===');
  console.table(getPm2Processes());

  console.log('\n=== HEAVY LOAD MEMORY PROFILING SUMMARY ===');
  console.log(`Payload Size:                      ${payloadSizeMB} MB`);
  console.log(`Peak Web Backend Process Memory:   ${maxWebMem.toFixed(2)} MB`);
  console.log(`Peak Dedicated Worker Memory:      ${maxWorkerMem.toFixed(2)} MB`);
}

runProfile().catch(console.error);
