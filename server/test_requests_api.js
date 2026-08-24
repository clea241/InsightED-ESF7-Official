const db = require('./db');

async function testRequestsFlow() {
  console.log('Testing esf7_requests insertion, status update, and querying...');

  await db.query(`DELETE FROM esf7_requests WHERE requester_school_id = '108348' AND target_school_id = '108349'`);

  // 1. Create Request
  const reqRes = await db.query(`
    INSERT INTO esf7_requests (
      id, requester_school_id, target_school_id, school_year, request_type, personnel_name, status, raw_payload
    ) VALUES (
      'REQ-108348-099', '108348', '108349', '2026-2027', 'clustered_teacher', 'MARCELO H. DEL PILAR', 'pending', '{"test": true}'::jsonb
    ) RETURNING *
  `);

  console.log('✅ Created Request Record:');
  const row = reqRes.rows[0];
  console.log('ID:', row.id, '| Requester:', row.requester_school_id, '| Target:', row.target_school_id);
  console.log('Type:', row.request_type, '| Personnel:', row.personnel_name, '| Status:', row.status);

  // 2. Respond (Approve)
  const appRes = await db.query(`
    UPDATE esf7_requests SET status = 'approved', updated_at = NOW() WHERE id = 'REQ-108348-099' RETURNING *
  `);
  console.log('✅ Approved Request New Status:', appRes.rows[0].status);

  // 3. Query History
  const histRes = await db.query(`SELECT * FROM esf7_requests WHERE status IN ('approved', 'rejected')`);
  console.log('✅ Retrieved Request History Count:', histRes.rows.length);

  // Cleanup
  await db.query(`DELETE FROM esf7_requests WHERE id = 'REQ-108348-099'`);
  process.exit(0);
}

testRequestsFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
