const { prodPool } = require("../db");
const { codec } = require("../utils/payloadExtras");

// esf7_requests keeps typed columns + a slim `extras` JSONB instead of a copy of the request body (run the expand migration first)
const requestsPayload = codec("esf7_requests");

async function populateActualSchoolRequests() {
  console.log(
    "=== Populating esf7_requests with Actual 1-to-1 DepEd School IDs ===",
  );

  // 1. Unnest all teachers across drafts
  const teacherRowsRes = await prodPool.query(`
    WITH unnested AS (
      SELECT 
        d.school_id,
        d.school_year,
        COALESCE(p_elem->>'prn', p_elem->>'employeeNo', p_elem->>'id') as teacher_key,
        TRIM(CONCAT(p_elem->>'firstName', ' ', p_elem->>'lastName')) as teacher_name,
        p_elem->>'deploymentStatus' as dep_status,
        p_elem as raw_p
      FROM school_drafts d,
           jsonb_array_elements(d.payload->'personnel') as p_elem
      WHERE d.school_id ~ '^\\d{5,7}$'
    )
    SELECT teacher_key, teacher_name,
           array_agg(DISTINCT school_id) as schools,
           array_agg(DISTINCT COALESCE(dep_status, 'REGULAR')) as statuses,
           count(DISTINCT school_id) as school_count
    FROM unnested
    WHERE teacher_key IS NOT NULL 
      AND teacher_key != '' 
      AND teacher_key !~ '^PER-[0-9a-f]'
    GROUP BY teacher_key, teacher_name
    HAVING count(DISTINCT school_id) > 1
  `);

  console.log(
    `Found ${teacherRowsRes.rows.length} multi-school teachers across drafts.`,
  );

  // 2. Also get from esf7_clustered_ghost_sync
  const ghostRes = await prodPool.query(`
    SELECT room_key, 
           array_agg(DISTINCT school_id) as schools
    FROM esf7_clustered_ghost_sync
    WHERE school_id ~ '^\\d{5,7}$'
    GROUP BY room_key
    HAVING count(DISTINCT school_id) > 1
  `);

  console.log(
    `Found ${ghostRes.rows.length} multi-school rooms in ghost sync.`,
  );

  const pairsToInsert = [];
  const seenPairKey = new Set();

  // Process multi-school teachers from drafts
  for (const t of teacherRowsRes.rows) {
    const schools = t.schools
      .map((s) => String(s).replace(/^SCH-/i, "").trim())
      .filter((s) => /^\d{5,7}$/.test(s));
    const isReassigned = t.statuses.some(
      (st) => String(st).toUpperCase() === "REASSIGNED",
    );
    const reqType = isReassigned ? "reassigned_personnel" : "clustered_teacher";
    const pName = t.teacher_name || "TEACHER";
    const pId = t.teacher_key;

    // For every pair of schools (School A -> School B)
    for (let i = 0; i < schools.length; i++) {
      for (let j = 0; j < schools.length; j++) {
        if (i !== j) {
          const reqSchool = schools[i];
          const tgtSchool = schools[j];
          const pairKey = `${reqSchool}|${tgtSchool}|${pId}|${reqType}`;

          if (!seenPairKey.has(pairKey)) {
            seenPairKey.add(pairKey);
            pairsToInsert.push({
              requester_school_id: reqSchool,
              target_school_id: tgtSchool,
              school_year: "2026-2027",
              request_type: reqType,
              personnel_id: pId,
              personnel_name: pName,
              status: "pending",
              remarks: `${reqType === "clustered_teacher" ? "Clustered" : "Reassigned"} teacher assignment: School ${reqSchool} ↔ School ${tgtSchool}`,
              raw_payload: {
                personnelId: pId,
                personnelName: pName,
                requesterSchoolId: reqSchool,
                targetSchoolId: tgtSchool,
                requestType: reqType,
                allAssignedSchools: schools,
              },
            });
          }
        }
      }
    }
  }

  // Process ghost sync rooms
  for (const g of ghostRes.rows) {
    const schools = g.schools
      .map((s) => String(s).replace(/^SCH-/i, "").trim())
      .filter((s) => /^\d{5,7}$/.test(s));
    const pId = g.room_key.replace(/^ROOM_/i, "");
    const pName = `TEACHER (${pId})`;
    const reqType = "clustered_teacher";

    for (let i = 0; i < schools.length; i++) {
      for (let j = 0; j < schools.length; j++) {
        if (i !== j) {
          const reqSchool = schools[i];
          const tgtSchool = schools[j];
          const pairKey = `${reqSchool}|${tgtSchool}|${pId}|${reqType}`;

          if (!seenPairKey.has(pairKey)) {
            seenPairKey.add(pairKey);
            pairsToInsert.push({
              requester_school_id: reqSchool,
              target_school_id: tgtSchool,
              school_year: "2026-2027",
              request_type: reqType,
              personnel_id: pId,
              personnel_name: pName,
              status: "pending",
              remarks: `Clustered ghost sync: School ${reqSchool} ↔ School ${tgtSchool}`,
              raw_payload: {
                personnelId: pId,
                personnelName: pName,
                requesterSchoolId: reqSchool,
                targetSchoolId: tgtSchool,
                requestType: reqType,
                allAssignedSchools: schools,
              },
            });
          }
        }
      }
    }
  }

  console.log(
    `\nGenerated ${pairsToInsert.length} exact 1-to-1 request rows with REAL DepEd School IDs.`,
  );

  // 3. Truncate and insert all pairs
  await prodPool.query("TRUNCATE TABLE esf7_requests CASCADE;");

  const CHUNK_SIZE = 200;
  let totalInserted = 0;

  for (let i = 0; i < pairsToInsert.length; i += CHUNK_SIZE) {
    const chunk = pairsToInsert.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders = [];
    const values = [];
    let pIdx = 1;

    for (let cIdx = 0; cIdx < chunk.length; cIdx++) {
      const c = chunk[cIdx];
      const reqId = `REQ-${c.requester_school_id}-${c.target_school_id}-${i + cIdx + 1}-${Math.floor(100 + Math.random() * 900)}`;

      valuePlaceholders.push(
        `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NULL, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW(), NOW())`,
      );
      values.push(
        reqId,
        c.requester_school_id,
        c.target_school_id,
        c.school_year,
        c.request_type,
        c.personnel_name,
        c.status,
        c.remarks,
        JSON.stringify(
          requestsPayload.buildExtras(c.raw_payload, {
            requester_school_id: c.requester_school_id,
            target_school_id: c.target_school_id,
            school_year: c.school_year,
            request_type: c.request_type,
            personnel_name: c.personnel_name,
            status: c.status,
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

  // Verification queries
  const countRes = await prodPool.query(
    "SELECT count(*)::int as count FROM esf7_requests",
  );
  const sampleRes = await prodPool.query(
    "SELECT id, requester_school_id, target_school_id, personnel_name, request_type FROM esf7_requests LIMIT 10",
  );

  console.log(`\n=== Verification Results ===`);
  console.log(
    `Total exact 1-to-1 rows in esf7_requests: ${countRes.rows[0].count}`,
  );
  console.log("\nSample Restored Requests:");
  console.log(sampleRes.rows);

  await prodPool.end();
}

populateActualSchoolRequests().catch(console.error);
