const http = require('http');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function testStaging() {
  console.log('=== Verifying Section Merge Protection on Staging (Port 5035) ===');

  const pool = db.getPool();
  const testSchoolId = '999302'; // dedicated staging test school
  const schoolYear = 'SY 26-27';

  // 1. Seed test school with 44 sections in staging DB
  const initialSections = Array.from({ length: 44 }, (_, i) => ({
    id: `sec-test-${i + 1}`,
    gradeLevel: `Grade ${7 + (i % 3)}`,
    sectionName: `Section ${i + 1}`,
    numberOfLearners: 35
  }));

  const initialPayload = {
    schoolInfo: { schoolId: testSchoolId, schoolName: 'Staging Test High School', schoolYear },
    personnel: [{ id: 'PER-TEST-001', name: 'Test Teacher' }],
    classSections: initialSections
  };

  await pool.query(`
    INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (school_id, school_year)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `, [testSchoolId, schoolYear, JSON.stringify(initialPayload)]);

  console.log('✓ Seeded test draft with 44 sections on staging database.');

  // 2. Generate test JWT
  const secret = process.env.JWT_SECRET || 'secret';
  const token = jwt.sign({ uid: 'test-user', role: 'school', school_id: testSchoolId }, secret, { expiresIn: '1h' });

  // 3. Make PUT /api/school/draft with 2 sections
  const incomingTwo = [
    { id: 'sec-new-1', gradeLevel: 'Grade 7', sectionName: 'New Alpha', numberOfLearners: 30 },
    { id: 'sec-new-2', gradeLevel: 'Grade 7', sectionName: 'New Beta', numberOfLearners: 32 }
  ];

  const putBody = JSON.stringify({
    schoolYear,
    payload: {
      schoolInfo: { schoolId: testSchoolId, schoolYear },
      personnel: [{ id: 'PER-TEST-001' }],
      classSections: incomingTwo
    }
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: 5035,
    path: '/api/school/draft',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(putBody),
      'Authorization': `Bearer ${token}`,
      'x-school-id': testSchoolId
    }
  }, async (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      console.log(`✓ Staging API Response: HTTP ${res.statusCode} -> ${data}`);
      
      // 4. Check DB row: how many sections are stored?
      const checkRes = await pool.query('SELECT payload FROM school_drafts WHERE school_id = $1 AND school_year = $2', [testSchoolId, schoolYear]);
      const savedSecs = checkRes.rows[0].payload.classSections || [];
      console.log(`✓ Staging Database Sections Count after save: ${savedSecs.length}`);

      if (savedSecs.length === 46) {
        console.log('🎉 SUCCESS: Staging successfully merged 44 existing + 2 incoming = 46 sections! Zero data loss!');
      } else {
        console.error(`❌ FAILED: Expected 46 sections, got ${savedSecs.length}`);
        process.exit(1);
      }

      // Cleanup test row
      await pool.query('DELETE FROM school_drafts WHERE school_id = $1 AND school_year = $2', [testSchoolId, schoolYear]);
      console.log('✓ Cleaned up staging test draft.');
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err.message);
    process.exit(1);
  });

  req.write(putBody);
  req.end();
}

testStaging().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
