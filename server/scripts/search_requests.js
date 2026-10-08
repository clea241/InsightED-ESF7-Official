const { prodPool, stagingPool } = require('../db');

async function searchAllRequests() {
  console.log('=== SEARCHING ALL REQUESTS ACROSS DATABASES & DRAFTS ===');
  
  // 1. In prodPool esf7_requests
  const rProd = await prodPool.query('SELECT * FROM esf7_requests');
  console.log(`esf7_requests in prodPool: ${rProd.rows.length} rows`);
  if (rProd.rows.length > 0) {
    console.log('Prod requests:', rProd.rows.map(r => ({ id: r.id, from: r.requester_school_id, to: r.target_school_id, name: r.personnel_name, type: r.request_type })));
  }

  // 2. In stagingPool esf7_requests
  if (stagingPool && stagingPool !== prodPool) {
    try {
      const rStaging = await stagingPool.query('SELECT * FROM esf7_requests');
      console.log(`esf7_requests in stagingPool: ${rStaging.rows.length} rows`);
      if (rStaging.rows.length > 0) {
        console.log('Staging requests:', rStaging.rows.map(r => ({ id: r.id, from: r.requester_school_id, to: r.target_school_id, name: r.personnel_name, type: r.request_type })));
      }
    } catch (e) {
      console.log('Staging error:', e.message);
    }
  }

  // 3. In school_drafts JSON payloads
  const draftsWithRequests = await prodPool.query(`
    SELECT school_id, 
           payload->'interSchoolRequests' as inter_reqs,
           payload->'reassignedPersonnel' as reassigned,
           payload->'clusteredPersonnel' as clustered
    FROM school_drafts
    WHERE (payload->'interSchoolRequests' IS NOT NULL AND jsonb_array_length(payload->'interSchoolRequests') > 0)
       OR (payload->'reassignedPersonnel' IS NOT NULL AND jsonb_array_length(payload->'reassignedPersonnel') > 0)
       OR (payload->'clusteredPersonnel' IS NOT NULL AND jsonb_array_length(payload->'clusteredPersonnel') > 0)
  `);

  console.log(`\nFound ${draftsWithRequests.rows.length} schools with inter-school / transfer / clustered records in school_drafts:`);
  draftsWithRequests.rows.forEach(d => {
    console.log(`- School ${d.school_id}:`, {
      interSchoolRequests: d.inter_reqs ? d.inter_reqs.length : 0,
      reassignedPersonnel: d.reassigned ? d.reassigned.length : 0,
      clusteredPersonnel: d.clustered ? d.clustered.length : 0
    });
  });

  // 4. In esf7_clustered_ghost_sync
  const ghostRes = await prodPool.query('SELECT count(*)::int as count FROM esf7_clustered_ghost_sync');
  console.log(`\nesf7_clustered_ghost_sync count: ${ghostRes.rows[0].count} rows`);

  await prodPool.end();
}

searchAllRequests().catch(console.error);
