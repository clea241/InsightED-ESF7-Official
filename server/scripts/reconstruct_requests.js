const { prodPool, insightEdPool } = require("../db");
const { codec } = require("../utils/payloadExtras");

// esf7_requests keeps typed columns + a slim `extras` JSONB instead of a copy of the request body (run the expand migration first)
const requestsPayload = codec("esf7_requests");

async function inspectAndReconstructRequests() {
  console.log("=== High-Speed SQL Request Reconstruction ===");

  // 1. Find all clustered personnel from drafts
  const clusteredRes = await prodPool.query(`
    SELECT DISTINCT
      d.school_id as requester_school_id,
      COALESCE(p_elem->>'targetSchoolId', p_elem->>'borrowingSchoolId', p_elem->'assignedSchools'->>0, 'MULTI-SCHOOL') as target_school_id,
      d.school_year,
      'clustered_teacher' as request_type,
      COALESCE(p_elem->>'id', p_elem->>'prn') as personnel_id,
      TRIM(CONCAT(p_elem->>'firstName', ' ', p_elem->>'lastName')) as personnel_name,
      'pending' as status,
      'Clustered teacher assignment' as remarks,
      p_elem as raw_payload
    FROM school_drafts d,
         jsonb_array_elements(d.payload->'personnel') as p_elem
    WHERE UPPER(COALESCE(p_elem->>'deploymentStatus', '')) = 'CLUSTERED'
       OR (p_elem->'assignedSchools' IS NOT NULL AND jsonb_array_length(p_elem->'assignedSchools') > 1)
  `);

  console.log(
    `Found ${clusteredRes.rows.length} clustered teacher records in drafts`,
  );

  // 2. Find all reassigned personnel from drafts
  const reassignedRes = await prodPool.query(`
    SELECT DISTINCT
      d.school_id as requester_school_id,
      COALESCE(p_elem->>'motherSchoolId', p_elem->>'targetSchoolId', p_elem->>'borrowingSchoolId', 'UNKNOWN') as target_school_id,
      d.school_year,
      'reassigned_personnel' as request_type,
      COALESCE(p_elem->>'id', p_elem->>'prn') as personnel_id,
      TRIM(CONCAT(p_elem->>'firstName', ' ', p_elem->>'lastName')) as personnel_name,
      'pending' as status,
      'Reassigned personnel assignment' as remarks,
      p_elem as raw_payload
    FROM school_drafts d,
         jsonb_array_elements(d.payload->'personnel') as p_elem
    WHERE UPPER(COALESCE(p_elem->>'deploymentStatus', '')) = 'REASSIGNED'
       OR p_elem->>'isReassigned' = 'true'
  `);

  console.log(
    `Found ${reassignedRes.rows.length} reassigned personnel records in drafts`,
  );

  // 3. Find any explicit requests saved in payload.interSchoolRequests or payload.requests
  const explicitRes = await prodPool.query(`
    SELECT 
      d.school_id,
      d.school_year,
      req_elem as raw_payload
    FROM school_drafts d,
         jsonb_array_elements(COALESCE(d.payload->'interSchoolRequests', d.payload->'requests', '[]'::jsonb)) as req_elem
    WHERE jsonb_typeof(COALESCE(d.payload->'interSchoolRequests', d.payload->'requests', '[]'::jsonb)) = 'array'
  `);

  console.log(`Found ${explicitRes.rows.length} explicit requests in drafts`);

  // Expand varchar limits if needed
  await prodPool.query(`
    ALTER TABLE esf7_requests ALTER COLUMN id TYPE TEXT;
    ALTER TABLE esf7_requests ALTER COLUMN personnel_id TYPE TEXT;
  `);

  // Combine and restore into esf7_requests
  const allCandidates = [...clusteredRes.rows, ...reassignedRes.rows];
  console.log(
    `Restoring ${allCandidates.length} total request records into esf7_requests...`,
  );

  // Batch insert in chunks of 200
  const CHUNK_SIZE = 200;
  let totalInserted = 0;

  for (let i = 0; i < allCandidates.length; i += CHUNK_SIZE) {
    const chunk = allCandidates.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders = [];
    const values = [];
    let pIdx = 1;

    for (const c of chunk) {
      const sId =
        String(c.requester_school_id || "")
          .replace(/^SCH-/i, "")
          .trim() || "SCHOOL";
      const tId =
        String(c.target_school_id || "")
          .replace(/^SCH-/i, "")
          .trim() || "TARGET";
      const reqId = `REQ-${sId}-${tId}-${i + totalInserted + 1}-${Math.floor(100 + Math.random() * 900)}`;

      valuePlaceholders.push(
        `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NULL, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW(), NOW())`,
      );
      values.push(
        reqId,
        sId,
        tId,
        c.school_year || "2026-2027",
        c.request_type,
        c.personnel_name || "TEACHER",
        c.status || "pending",
        c.remarks,
        JSON.stringify(
          requestsPayload.buildExtras(c.raw_payload, {
            requester_school_id: sId,
            target_school_id: tId,
            school_year: c.school_year || "2026-2027",
            request_type: c.request_type,
            personnel_name: c.personnel_name || "TEACHER",
            status: c.status || "pending",
            remarks: c.remarks,
          }),
        ),
      );
    }

    const query = `
      INSERT INTO esf7_requests (
        id, requester_school_id, target_school_id, school_year,
        request_type, personnel_id, personnel_name, status, remarks, extras,
        created_at, updated_at
      )
      VALUES ${valuePlaceholders.join(",\n")}
      ON CONFLICT (id) DO NOTHING
    `;

    const res = await prodPool.query(query, values);
    totalInserted += res.rowCount;
  }

  const finalCount = await prodPool.query(
    "SELECT count(*)::int as count FROM esf7_requests",
  );
  console.log(
    `\n✅ Successfully Restored ${totalInserted} requests! Total rows in esf7_requests: ${finalCount.rows[0].count}`,
  );

  await prodPool.end();
}

inspectAndReconstructRequests().catch(console.error);
