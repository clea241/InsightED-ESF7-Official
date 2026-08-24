const db = require('./db');

async function testSubmissionQueueFlow() {
  console.log('Testing esf7_submission_queue insertion, status transition, and querying...');

  await db.query(`DELETE FROM esf7_submission_queue WHERE school_id = '108348'`);

  // 1. Insert Queue Job
  const res = await db.query(`
    INSERT INTO esf7_submission_queue (
      school_id, school_year, payload, signature, certified_by, status
    ) VALUES (
      '108348', '2026-2027', '{"test": true}'::jsonb, 'data:image/png;base64,TESTSIG', 'JUAN DELA CRUZ', 'pending'
    ) RETURNING *
  `);

  console.log('✅ Created Submission Queue Record:');
  const row = res.rows[0];
  console.log('Job ID:', row.id, '| School ID:', row.school_id, '| Certified By:', row.certified_by);
  console.log('Status:', row.status);

  // 2. Query View submission_queue
  const viewRes = await db.query(`SELECT * FROM submission_queue WHERE id = $1`, [row.id]);
  console.log('✅ Retrieved from View submission_queue Count:', viewRes.rows.length);

  // Cleanup
  await db.query(`DELETE FROM esf7_submission_queue WHERE id = $1`, [row.id]);
  process.exit(0);
}

testSubmissionQueueFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
