const { prodPool } = require('../db');

async function restoreActualSchoolIdRequests() {
  console.log('=== Normalizing and Expanding All Requests to Real 1-to-1 School IDs ===');

  // 1. Fetch all draft personnel who are Clustered or have assignedSchools
  const draftPersonnelRes = await prodPool.query(`
    SELECT 
      d.school_id,
      d.school_year,
      p_elem as p
    FROM school_drafts d,
         jsonb_array_elements(d.payload->'personnel') as p_elem
    WHERE (
      UPPER(COALESCE(p_elem->>'deploymentStatus', '')) IN ('CLUSTERED', 'REASSIGNED')
      OR p_elem->>'isClustered' = 'true'
      OR p_elem->>'isReassigned' = 'true'
      OR (p_elem->'assignedSchools' IS NOT NULL AND jsonb_array_length(p_elem->'assignedSchools') > 1)
      OR (p_elem->'assigned_schools' IS NOT NULL AND jsonb_array_length(p_elem->'assigned_schools') > 1)
    )
  `);

  console.log(`Found ${draftPersonnelRes.rows.length} relevant teacher entries in drafts`);

  const rowsToInsert = [];
  const seenPair = new Set();

  for (const r of draftPersonnelRes.rows) {
    const sId = String(r.school_id || '').replace(/^SCH-/i, '').trim();
    if (!/^\d{5,7}$/.test(sId)) continue; // Must be valid DepEd ID

    const p = r.p || {};
    const sy = r.school_year || '2026-2027';
    const depStatus = String(p.deploymentStatus || p.deployment_status || '').toUpperCase();
    const isClustered = depStatus === 'CLUSTERED' || p.isClustered === true;
    const isReassigned = depStatus === 'REASSIGNED' || p.isReassigned === true;
    const pName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name || 'TEACHER';
    const pId = p.id || p.prn;

    // Collect all assigned schools
    const rawAssigned = [
      ...(Array.isArray(p.assignedSchools) ? p.assignedSchools : []),
      ...(Array.isArray(p.assigned_schools) ? p.assigned_schools : []),
      p.otherSchoolId,
      p.borrowingSchoolId,
      p.motherSchoolId,
      p.targetSchoolId
    ].filter(Boolean);

    // Clean and deduplicate target school IDs
    const otherSchoolIds = new Set();
    for (const raw of rawAssigned) {
      const clean = String(raw).replace(/^SCH-/i, '').trim();
      if (/^\d{5,7}$/.test(clean) && clean !== sId) {
        otherSchoolIds.add(clean);
      }
    }

    // Determine request type
    const reqType = isReassigned ? 'reassigned_personnel' : 'clustered_teacher';

    // Create 1 distinct row per target school ID
    for (const targetSchoolId of otherSchoolIds) {
      const pairKey = `${sId}|${targetSchoolId}|${pId}|${reqType}`;
      if (!seenPair.has(pairKey)) {
        seenPair.add(pairKey);
        rowsToInsert.push({
          requester_school_id: sId,
          target_school_id: targetSchoolId,
          school_year: sy,
          request_type: reqType,
          personnel_name: pName,
          status: p.requestStatus || 'pending',
          remarks: `${reqType === 'clustered_teacher' ? 'Clustered' : 'Reassigned'} teacher assignment: School ${sId} ↔ School ${targetSchoolId}`,
          raw_payload: {
            personnelId: pId,
            personnelName: pName,
            requesterSchoolId: sId,
            targetSchoolId: targetSchoolId,
            requestType: reqType,
            deploymentStatus: depStatus
          }
        });
      }
    }
  }

  console.log(`Generated ${rowsToInsert.length} exact 1-to-1 request rows with actual numeric DepEd School IDs.`);

  // Clear table and re-populate cleanly
  await prodPool.query('TRUNCATE TABLE esf7_requests CASCADE;');

  // Batch insert in chunks of 200
  const CHUNK_SIZE = 200;
  let totalInserted = 0;

  for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders = [];
    const values = [];
    let pIdx = 1;

    for (let cIdx = 0; cIdx < chunk.length; cIdx++) {
      const c = chunk[cIdx];
      const reqId = `REQ-${c.requester_school_id}-${c.target_school_id}-${i + cIdx + 1}-${Math.floor(1000 + Math.random() * 9000)}`;

      valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NULL, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW(), NOW())`);
      values.push(
        reqId,
        c.requester_school_id,
        c.target_school_id,
        c.school_year,
        c.request_type,
        c.personnel_name,
        c.status,
        c.remarks,
        JSON.stringify(c.raw_payload)
      );
    }

    const query = `
      INSERT INTO esf7_requests (
        id, requester_school_id, target_school_id, school_year,
        request_type, personnel_id, personnel_name, status, remarks, raw_payload,
        created_at, updated_at
      )
      VALUES ${valuePlaceholders.join(',\n')}
      ON CONFLICT (id) DO NOTHING
    `;

    const res = await prodPool.query(query, values);
    totalInserted += res.rowCount;
  }

  const finalRes = await prodPool.query(`
    SELECT count(*)::int as total,
           count(DISTINCT requester_school_id)::int as requesters,
           count(DISTINCT target_school_id)::int as targets
    FROM esf7_requests
  `);

  console.log(`\n=== Verification Results ===`);
  console.log(`Total 1-to-1 rows inserted: ${totalInserted}`);
  console.log(`Distinct Requester Schools: ${finalRes.rows[0].requesters}`);
  console.log(`Distinct Target Schools   : ${finalRes.rows[0].targets}`);

  // Sample check: Ensure no non-numeric school IDs exist
  const badRows = await prodPool.query(`
    SELECT id, requester_school_id, target_school_id 
    FROM esf7_requests 
    WHERE requester_school_id !~ '^\\d{5,7}$' OR target_school_id !~ '^\\d{5,7}$'
  `);
  console.log(`Non-numeric School ID count: ${badRows.rows.length} (Expected: 0)`);

  await prodPool.end();
}

restoreActualSchoolIdRequests().catch(console.error);
