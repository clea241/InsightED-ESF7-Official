const express = require('express');
const router = express.Router();
const db = require('../../db');
const { insightEdPool, usersDbPool } = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');
const cacheService = require('../../services/cacheService');

function formatRequestRecord(row) {
  if (!row) return null;
  let raw = row.raw_payload || {};
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  return {
    ...raw,
    id: row.id,
    requesterSchoolId: row.requester_school_id,
    requester_school_id: row.requester_school_id,
    targetSchoolId: row.target_school_id,
    target_school_id: row.target_school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    requestType: row.request_type,
    request_type: row.request_type,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    personnelName: row.personnel_name,
    personnel_name: row.personnel_name,
    status: row.status,
    remarks: row.remarks || '',
    rawPayload: raw
  };
}

async function resolveSchoolId(input) {
  if (!input) return '';
  const str = String(input).trim();
  const parenMatch = str.match(/\((\d{5,})\)/);
  if (parenMatch) return parenMatch[1];
  const directDigits = str.match(/\b(\d{5,})\b/);
  if (directDigits) return directDigits[1];
  const cleaned = str.replace(/^SCH-/i, '').trim();
  if (/^\d{5,}$/.test(cleaned)) return cleaned;

  // Non-numeric name passed: look up against users_database.schools_iern
  const upperName = cleaned.toUpperCase();
  try {
    const res1 = await usersDbPool.query(
      `SELECT school_id FROM schools_iern WHERE UPPER(TRIM(school_name)) = $1 LIMIT 1`,
      [upperName]
    );
    if (res1.rows.length > 0) return String(res1.rows[0].school_id).trim();

    const normalized = upperName
      .replace(/\bNHS\b/g, 'NATIONAL HIGH SCHOOL')
      .replace(/\bIS\b/g, 'INTEGRATED SCHOOL')
      .replace(/\bES\b/g, 'ELEMENTARY SCHOOL')
      .replace(/\bHIGHSCHOOL\b/g, 'HIGH SCHOOL')
      .trim();

    const res2 = await usersDbPool.query(
      `SELECT school_id FROM schools_iern WHERE UPPER(TRIM(school_name)) = $1 OR school_name ILIKE $2 LIMIT 1`,
      [normalized, `%${normalized}%`]
    );
    if (res2.rows.length > 0) return String(res2.rows[0].school_id).trim();

    const res3 = await insightEdPool.query(
      `SELECT school_id FROM unit1_school_identity WHERE UPPER(TRIM(school_name)) = $1 OR school_name ILIKE $2 LIMIT 1`,
      [upperName, `%${upperName}%`]
    );
    if (res3.rows.length > 0) return String(res3.rows[0].school_id).trim();
  } catch (e) {
    console.warn('[resolveSchoolId lookup error]:', e.message);
  }

  return cleaned;
}

// GET /api/requests/incoming
router.get('/incoming', async (req, res) => {
  try {
    const schoolId = req.query.schoolId || req.query.school_id || getSchoolIdFromRequest(req) || '108348';
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, '').trim();

    const cacheKey = `requests:incoming:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    // Also look up current school name to catch any name-based requests
    let schoolNames = [];
    try {
      const sRes = await usersDbPool.query(
        `SELECT school_name FROM schools_iern WHERE CAST(school_id AS TEXT) = $1 LIMIT 1`,
        [cleanSchoolId]
      );
      if (sRes.rows.length > 0 && sRes.rows[0].school_name) {
        schoolNames.push(sRes.rows[0].school_name.trim().toUpperCase());
      }
    } catch (e) {}

    const queryText = `
      SELECT * FROM esf7_requests 
      WHERE (
        target_school_id = $1 
        OR target_school_id = $2 
        OR REPLACE(target_school_id, 'SCH-', '') = $1 
        OR target_school_id ILIKE $3
        ${schoolNames.length > 0 ? `OR UPPER(TRIM(target_school_id)) = $4` : ''}
      ) 
        AND LOWER(status) = 'pending' 
      ORDER BY created_at DESC
    `;
    const params = [cleanSchoolId, `SCH-${cleanSchoolId}`, `%${cleanSchoolId}%`];
    if (schoolNames.length > 0) {
      params.push(schoolNames[0]);
    }

    let result = await db.query(queryText, params);

    // Fallback: If 0 rows found in active pool, check the alternative pool
    if (result.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId) ? db.prodPool : db.stagingPool;
      const fallbackRes = await fallbackPool.query(queryText, params).catch(() => ({ rows: [] }));
      if (fallbackRes.rows.length > 0) {
        result = fallbackRes;
      }
    }

    const formatted = result.rows.map(formatRequestRecord);
    await cacheService.set(cacheKey, formatted, 5);
    res.json(formatted);
  } catch (err) {
    console.error('[Requests Incoming GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/outgoing
router.get('/outgoing', async (req, res) => {
  try {
    const schoolId = req.query.schoolId || req.query.school_id || getSchoolIdFromRequest(req) || '108348';
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, '').trim();

    const cacheKey = `requests:outgoing:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const queryText = `
      SELECT * FROM esf7_requests 
      WHERE (requester_school_id = $1 OR requester_school_id = $2 OR REPLACE(requester_school_id, 'SCH-', '') = $1 OR requester_school_id ILIKE $3) 
      ORDER BY created_at DESC
    `;
    const params = [cleanSchoolId, `SCH-${cleanSchoolId}`, `%${cleanSchoolId}%`];

    let result = await db.query(queryText, params);

    // Fallback: If 0 rows found in active pool, check alternative pool
    if (result.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId) ? db.prodPool : db.stagingPool;
      const fallbackRes = await fallbackPool.query(queryText, params).catch(() => ({ rows: [] }));
      if (fallbackRes.rows.length > 0) {
        result = fallbackRes;
      }
    }

    const formatted = result.rows.map(formatRequestRecord);
    await cacheService.set(cacheKey, formatted, 5);
    res.json(formatted);
  } catch (err) {
    console.error('[Requests Outgoing GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/history
router.get('/history', async (req, res) => {
  try {
    const schoolId = req.query.schoolId || req.query.school_id || getSchoolIdFromRequest(req) || '108348';
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, '').trim();

    const cacheKey = `requests:history:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const queryText = `
      SELECT * FROM esf7_requests 
      WHERE (target_school_id IN ($1, $2) OR requester_school_id IN ($1, $2))
        AND LOWER(status) IN ('approved', 'rejected', 'cancelled') 
      ORDER BY updated_at DESC LIMIT 500
    `;
    const params = [cleanSchoolId, `SCH-${cleanSchoolId}`];

    let result = await db.query(queryText, params);

    // Fallback: If 0 rows found in active pool, check alternative pool
    if (result.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId) ? db.prodPool : db.stagingPool;
      // Bounded so a slow secondary pool can never push the request past the gateway timeout.
      const fallbackRes = await Promise.race([
        fallbackPool.query(queryText, params),
        new Promise((_, rej) => setTimeout(() => rej(new Error('fallback timeout')), 5000))
      ]).catch(() => ({ rows: [] }));
      if (fallbackRes.rows.length > 0) {
        result = fallbackRes;
      }
    }

    const formatted = result.rows.map(formatRequestRecord);
    await cacheService.set(cacheKey, formatted, 5);
    res.json(formatted);
  } catch (err) {
    console.error('[Requests History GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/district-schools
router.get('/district-schools', async (req, res) => {
  try {
    const schoolId = req.query.schoolId || req.query.school_id || getSchoolIdFromRequest(req) || '502949';
    const reqDivision = req.query.division ? String(req.query.division).trim() : '';
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, '').trim();

    let currentSchoolMeta = null;
    let schoolsRes = { rows: [] };

    // 1. Primary: Lookup current school in users_database.schools_iern
    try {
      const metaRes = await usersDbPool.query(
        `SELECT school_id, school_name, district, division, region 
         FROM schools_iern 
         WHERE CAST(school_id AS TEXT) = $1 
         LIMIT 1`,
        [cleanSchoolId]
      );
      if (metaRes.rows.length > 0) {
        currentSchoolMeta = metaRes.rows[0];
      }
    } catch (e) {
      console.warn('[users_database.schools_iern lookup error]:', e.message);
    }

    // 2. Fallback: Lookup in insightEd unit1_school_identity
    if (!currentSchoolMeta || !currentSchoolMeta.division) {
      try {
        const idRes = await insightEdPool.query(
          `SELECT school_id, school_name, district, division, region 
           FROM unit1_school_identity 
           WHERE CAST(school_id AS TEXT) = $1 
           LIMIT 1`,
          [cleanSchoolId]
        );
        if (idRes.rows.length > 0) {
          currentSchoolMeta = idRes.rows[0];
        }
      } catch (e) {}
    }

    // 3. Fallback: Lookup in primary DB esf7_school_profile
    if (!currentSchoolMeta || !currentSchoolMeta.division) {
      try {
        const profRes = await db.query(
          `SELECT school_id, school_name, district, division, region 
           FROM esf7_school_profile 
           WHERE CAST(school_id AS TEXT) = $1 OR school_id = $2
           LIMIT 1`,
          [cleanSchoolId, `SCH-${cleanSchoolId}`]
        );
        if (profRes.rows.length > 0) {
          currentSchoolMeta = profRes.rows[0];
        }
      } catch (e) {}
    }

    const divisionToFilter = reqDivision || (currentSchoolMeta && currentSchoolMeta.division ? String(currentSchoolMeta.division).trim() : '');
    const isTestSchool = cleanSchoolId.startsWith('900') || cleanSchoolId.startsWith('800') || cleanSchoolId.startsWith('199') || cleanSchoolId.startsWith('divtest-') || cleanSchoolId.startsWith('pilot-');

    // 4. Query all schools in the exact same DIVISION from users_database.schools_iern
    if (divisionToFilter) {
      const testClause = isTestSchool ? '' : 'AND (is_testaccount IS NOT TRUE)';

      schoolsRes = await usersDbPool.query(
        `SELECT school_id, school_name, district, division, region 
         FROM schools_iern 
         WHERE (
           UPPER(TRIM(division)) = UPPER(TRIM($1)) 
           OR division ILIKE $2
         )
         AND CAST(school_id AS TEXT) != $3 
         ${testClause}
         ORDER BY school_name ASC`,
        [
          divisionToFilter,
          `%${divisionToFilter}%`,
          cleanSchoolId
        ]
      ).catch((err) => {
        console.warn('[schools_iern division query error]:', err.message);
        return { rows: [] };
      });
    }

    // 5. Fallback: Query same division from insightEd unit1_school_identity
    if (schoolsRes.rows.length === 0 && divisionToFilter) {
      try {
        const idDivRes = await insightEdPool.query(
          `SELECT school_id, school_name, district, division, region 
           FROM unit1_school_identity 
           WHERE (
             UPPER(TRIM(division)) = UPPER(TRIM($1))
             OR division ILIKE $2
           )
           AND CAST(school_id AS TEXT) != $3 
           ORDER BY school_name ASC`,
          [divisionToFilter, `%${divisionToFilter}%`, cleanSchoolId]
        );
        if (idDivRes.rows.length > 0) {
          schoolsRes = idDivRes;
        }
      } catch (e) {}
    }

    // 6. If still 0 results, query from local esf7_school_profile as fallback
    if (schoolsRes.rows.length === 0) {
      try {
        const localRes = await db.query(
          `SELECT school_id, school_name, district, division, region
           FROM esf7_school_profile
           WHERE CAST(school_id AS TEXT) != $1 AND school_id != $2
           ORDER BY school_name ASC
           LIMIT 50`,
          [cleanSchoolId, `SCH-${cleanSchoolId}`]
        );
        if (localRes.rows.length > 0) {
          schoolsRes = localRes;
        }
      } catch (e) {}
    }

    let districtList = schoolsRes.rows.map(r => ({
      schoolId: String(r.school_id || '').trim(),
      school_id: String(r.school_id || '').trim(),
      schoolName: (r.school_name || `School ${r.school_id}`).trim(),
      school_name: (r.school_name || `School ${r.school_id}`).trim(),
      district: r.district || '',
      division: r.division || '',
      region: r.region || ''
    })).filter(s => s.schoolId !== cleanSchoolId && s.schoolId !== '199997' && s.schoolId !== '199998');

    // ── Archetype & Demo Account Partner Additions ──
    if (isTestSchool || districtList.length === 0) {
      const archetypeTestSchools = [
        { schoolId: '900223', schoolName: 'MCOC Elementary Demo School (SSES)', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '900224', schoolName: 'MCOC Junior High School Demo (SPA/SPJ/STE)', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '900225', schoolName: 'MCOC Senior High School Demo', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '900226', schoolName: 'MCOC Integrated School Demo (K-10)', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '900227', schoolName: 'MCOC Multigrade Elementary Demo (MG ES)', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '900228', schoolName: 'MCOC Comprehensive K-12 Demo', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '900229', schoolName: 'MCOC Inclusive Special Education (SNED/ALS/ARAL)', district: 'MCOC DISTRICT', division: 'MCOC CENTRAL DIVISION' },
        { schoolId: '199997', schoolName: 'Orientation Satellite Elementary School', district: 'ALBAY II DISTRICT', division: 'LEGASPI CITY' },
        { schoolId: '199998', schoolName: 'Orientation Demonstration Integrated School', district: 'ALBAY II DISTRICT', division: 'LEGASPI CITY' }
      ];

      for (const tSchool of archetypeTestSchools) {
        if (tSchool.schoolId !== cleanSchoolId && !districtList.some(d => d.schoolId === tSchool.schoolId)) {
          districtList.push({
            ...tSchool,
            school_id: tSchool.schoolId,
            school_name: tSchool.schoolName,
            region: 'REGION IV-A'
          });
        }
      }
    }

    res.json(districtList);
  } catch (err) {
    console.error('[District Schools Error]:', err.message);
    res.status(500).json({ error: err.message, schools: [] });
  }
});


// POST /api/requests/create
router.post('/create', async (req, res) => {
  try {
    const { targetSchoolId, target_school_id, requestType, request_type, personnelId, personnel_id, personnelName, personnel_name, remarks } = req.body;
    let rawRequester = getSchoolIdFromRequest(req) || req.body.requesterSchoolId || req.body.requester_school_id || '108348';
    let rawTarget = targetSchoolId || target_school_id;
    const rType = requestType || request_type;

    if (!rawTarget || !rType) {
      return res.status(400).json({ error: 'Target school ID and request type are required.' });
    }

    const requesterId = await resolveSchoolId(rawRequester);
    const tSchoolId = await resolveSchoolId(rawTarget);
    const pId = personnelId || personnel_id || null;
    const pName = personnelName || personnel_name || '';

    // Check if identical request is already pending for this specific teacher
    const checkDup = await db.query(
      `SELECT * FROM esf7_requests 
       WHERE (requester_school_id = $1 OR requester_school_id = $2 OR REPLACE(requester_school_id, 'SCH-', '') = $1)
         AND (target_school_id = $3 OR target_school_id = $4 OR REPLACE(target_school_id, 'SCH-', '') = $3)
         AND request_type = $5 
         AND (personnel_id = $6 OR raw_payload->>'personnelId' = $6 OR personnel_name ILIKE $7)
         AND LOWER(status) = 'pending'`,
      [requesterId, `SCH-${requesterId}`, tSchoolId, `SCH-${tSchoolId}`, rType, pId || '', pName ? `%${pName}%` : '']
    );

    if (checkDup.rows.length > 0) {
      return res.json({ success: true, alreadyExists: true, request: formatRequestRecord(checkDup.rows[0]) });
    }

    let targetPersonnelId = pId;
    if (targetPersonnelId) {
      const pRes = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetPersonnelId]
      );
      if (pRes.rows.length > 0) {
        targetPersonnelId = pRes.rows[0].id;
      } else {
        const idParts = String(targetPersonnelId).split('-');
        const schoolId = idParts.length > 1 ? idParts[1] : requesterId;
        const cleanSchoolId = schoolId.replace(/^SCH-/i, '').trim();
        const isTest = db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(cleanSchoolId);
        const seqIndex = idParts.length > 2 ? parseInt(idParts[2], 10) - 1 : 0;
        let masterRows = { rows: [] };
        if (isTest) {
          masterRows = await insightEdPool.query(
            `SELECT * FROM esf7_database_dummy WHERE school_id = $1 OR schoool_id = $1`,
            [cleanSchoolId]
          ).catch(() => ({ rows: [] }));
        } else {
          masterRows = await insightEdPool.query(
            `SELECT * FROM esf7_database WHERE school_id = $1`,
            [cleanSchoolId]
          ).catch(() => ({ rows: [] }));
          if (masterRows.rows.length === 0) {
            masterRows = await insightEdPool.query(
              `SELECT * FROM esf7_database WHERE schoool_id = $1`,
              [cleanSchoolId]
            ).catch(() => ({ rows: [] }));
          }
        }
        
        const masterRow = masterRows.rows[seqIndex] || masterRows.rows[0] || {};
        const fName = masterRow.first || masterRow.first_name || (pName ? pName.split(' ')[0] : 'TEACHER');
        const lName = masterRow.last || masterRow.last_name || (pName ? pName.split(' ').slice(1).join(' ') : 'STAFF');
        const actualPrn = masterRow.prn || String(targetPersonnelId).replace('PER-', 'PRN-');
        const actualId = String(targetPersonnelId).replace('PRN-', 'PER-');

        await db.query(
          `INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, type, first_name, last_name, created_at, updated_at)
           VALUES ($1, $2, $3, 'SY 26-27', 'teaching', $4, $5, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [actualId, actualPrn, cleanSchoolId, fName, lName]
        ).catch(() => {});
        targetPersonnelId = actualId;
      }
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_requests`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const reqId = req.body.id || `REQ-${requesterId}-${seq}-${Math.floor(Math.random()*1000)}`;

    const insertRes = await db.query(
      `INSERT INTO esf7_requests (id, requester_school_id, target_school_id, request_type, personnel_id, personnel_name, remarks, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING *`,
      [
        reqId,
        requesterId,
        tSchoolId,
        rType,
        targetPersonnelId,
        pName || null,
        remarks || null,
        JSON.stringify({ ...req.body, requesterId, targetSchoolId: tSchoolId, personnelId: targetPersonnelId, personnelName: pName })
      ]
    );

    await cacheService.delPattern('requests:*');
    res.json({ success: true, request: formatRequestRecord(insertRes.rows[0]) });
  } catch (err) {
    console.error('[Requests Create Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:id/respond
router.post('/:id/respond', async (req, res) => {
  const { id } = req.params;
  const { action, remarks } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action response.' });
  }

  try {
    const result = await db.query(
      `UPDATE esf7_requests SET status = $1, remarks = COALESCE($2, remarks), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [action, remarks || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    await cacheService.delPattern('requests:*');
    res.json({ success: true, status: action, request: formatRequestRecord(result.rows[0]) });
  } catch (err) {
    console.error('[Requests Respond Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Ensure PostgreSQL table for Clustered Ghost State Sync across all cluster workers
let isGhostTableInitialized = false;
async function ensureGhostSyncTable() {
  if (isGhostTableInitialized) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_clustered_ghost_sync (
        room_key TEXT NOT NULL,
        school_id TEXT NOT NULL,
        school_name TEXT,
        slots JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (room_key, school_id)
      );
      CREATE INDEX IF NOT EXISTS idx_clustered_ghost_room ON esf7_clustered_ghost_sync(room_key);
    `);
    isGhostTableInitialized = true;
  } catch (err) {
    console.warn('[ensureGhostSyncTable Warning]:', err.message);
  }
}

// Helper to resolve canonical room key from any PRN, ID, or Name with fast in-memory cache
const roomKeyCache = new Map();
async function resolveCanonicalRoomKey(rawKey) {
  if (!rawKey) return 'UNKNOWN';
  const clean = String(rawKey).trim();
  if (roomKeyCache.has(clean)) {
    return roomKeyCache.get(clean);
  }

  const cleanStripped = clean.replace(/^(PER-|PRN-)/i, '').trim();

  try {
    // 1. Check personnel profile table using exact ID or exact PRN
    const pRes = await db.query(
      `SELECT id, prn, first_name, last_name FROM esf7_personnel_profile 
       WHERE id = $1 OR prn = $1 OR (prn = $2 AND length($2) >= 6)
       LIMIT 1`,
      [clean, cleanStripped]
    );

    if (pRes.rows.length > 0) {
      const p = pRes.rows[0];
      const fn = (p.first_name || '').toUpperCase().trim();
      const ln = (p.last_name || '').toUpperCase().trim();
      const resolved = p.prn ? `ROOM_${p.prn}` : `ROOM_${fn}_${ln}`.replace(/[^A-Z0-9_]/g, '');
      if (roomKeyCache.size > 2000) roomKeyCache.clear();
      roomKeyCache.set(clean, resolved);
      return resolved;
    }

    // 2. Check requests table using exact ID
    const reqRes = await db.query(
      `SELECT personnel_id, personnel_name FROM esf7_requests 
       WHERE personnel_id = $1 OR personnel_id = $2
       LIMIT 1`,
      [clean, cleanStripped]
    );

    if (reqRes.rows.length > 0) {
      const r = reqRes.rows[0];
      const name = (r.personnel_name || r.personnel_id || '').toUpperCase().trim();
      const resolved = `ROOM_${name}`.replace(/[^A-Z0-9_]/g, '');
      if (roomKeyCache.size > 2000) roomKeyCache.clear();
      roomKeyCache.set(clean, resolved);
      return resolved;
    }
  } catch (err) {
    console.warn('[resolveCanonicalRoomKey Error]:', err.message);
  }

  const fallback = `ROOM_${cleanStripped.toUpperCase()}`.replace(/[^A-Z0-9_]/g, '');
  if (roomKeyCache.size > 2000) roomKeyCache.clear();
  roomKeyCache.set(clean, fallback);
  return fallback;
}

// GET /api/requests/clustered/:prn/sync
// Fetch active ghost slots from partner schools for a clustered teacher
router.get('/clustered/:prn/sync', async (req, res) => {
  const { prn } = req.params;
  const requestingSchoolId = String(getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '').replace('SCH-', '').trim();

  try {
    await ensureGhostSyncTable();
    const roomKey = await resolveCanonicalRoomKey(prn);
    const cleanStripped = String(prn).replace(/^(PER-|PRN-)/i, '').trim();

    // Query partner school slots from PostgreSQL
    const syncRes = await db.query(
      `SELECT school_id, school_name, slots FROM esf7_clustered_ghost_sync 
       WHERE room_key = $1 AND school_id != $2`,
      [roomKey, requestingSchoolId]
    );

    let sharedSlots = [];

    if (syncRes.rows.length > 0) {
      syncRes.rows.forEach(row => {
        const rowSlots = Array.isArray(row.slots) ? row.slots : [];
        rowSlots.forEach(slot => {
          const sub = String(slot.subject || '').toUpperCase();
          if (sub.startsWith('ADMIN') || sub.includes('ADMINISTRATIVE')) return;
          sharedSlots.push({
            ...slot,
            schoolId: row.school_id,
            schoolName: row.school_name || `School ${row.school_id}`
          });
        });
      });
    } else {
      // If table has no partner entries yet, query active DB workloads for exact PRN match
      if (cleanStripped && cleanStripped.length >= 6) {
        const dbSlots = await db.query(
          `SELECT w.*, p.school_id, s.school_name, p.first_name, p.last_name 
           FROM esf7_workload_rows w
           JOIN esf7_personnel_profile p ON w.personnel_id = p.id
           LEFT JOIN esf7_school_profile s ON p.school_id = s.school_id
           WHERE (p.prn = $1 OR p.prn = $2)
             AND p.school_id != $3
             AND (w.subject NOT ILIKE 'ADMIN%' AND w.subject NOT ILIKE '%ADMINISTRATIVE%')
           ORDER BY w.start_time ASC`,
          [prn, cleanStripped, requestingSchoolId]
        ).catch(() => ({ rows: [] }));

        if (dbSlots.rows.length > 0) {
          dbSlots.rows.forEach(row => {
            const schId = String(row.school_id || '').replace('SCH-', '').trim();
            const schName = row.school_name || `School ${schId}`;
            sharedSlots.push({
              day: row.days && Array.isArray(row.days) ? row.days[0] : (row.day || 'MONDAY'),
              days: Array.isArray(row.days) && row.days.length > 0 ? row.days : [row.day || 'MONDAY'],
              startTime: row.start_time,
              endTime: row.end_time,
              subject: row.subject,
              gradeLevel: row.grade_level,
              sectionName: row.section_name,
              schoolId: schId,
              schoolName: schName
            });
          });
        }
      }
    }

    res.json({
      success: true,
      prn,
      roomKey,
      sharedSlots,
      count: sharedSlots.length
    });
  } catch (err) {
    console.error('[Clustered Sync GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/clustered/:prn/sync
// Broadcast or update active school timetable slots for a clustered teacher
router.post('/clustered/:prn/sync', async (req, res) => {
  const { prn } = req.params;
  const { authorSchoolId, authorSchoolName, slots } = req.body;

  if (!prn || !authorSchoolId) {
    return res.status(400).json({ error: 'prn and authorSchoolId are required.' });
  }

  const cleanAuthorSchoolId = String(authorSchoolId).replace('SCH-', '').trim();

  try {
    await ensureGhostSyncTable();
    const roomKey = await resolveCanonicalRoomKey(prn);
    const rawSlots = Array.isArray(slots) ? slots : [];
    const validSlots = rawSlots.filter(s => {
      const sub = String(s.subject || s.task || '').toUpperCase();
      return !sub.startsWith('ADMIN') && !sub.includes('ADMINISTRATIVE');
    });

    // Atomically upsert slots into PostgreSQL (persists across all PM2 cluster instances)
    await db.query(
      `INSERT INTO esf7_clustered_ghost_sync (room_key, school_id, school_name, slots, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (room_key, school_id)
       DO UPDATE SET 
         school_name = EXCLUDED.school_name,
         slots = EXCLUDED.slots,
         updated_at = NOW()`,
      [roomKey, cleanAuthorSchoolId, authorSchoolName || `School ${cleanAuthorSchoolId}`, JSON.stringify(validSlots)]
    );

    // Fetch and return the partner schools' latest slots
    const syncRes = await db.query(
      `SELECT school_id, school_name, slots FROM esf7_clustered_ghost_sync 
       WHERE room_key = $1 AND school_id != $2`,
      [roomKey, cleanAuthorSchoolId]
    );

    const sharedSlots = [];
    syncRes.rows.forEach(row => {
      const rowSlots = Array.isArray(row.slots) ? row.slots : [];
      rowSlots.forEach(slot => {
        const sub = String(slot.subject || slot.task || '').toUpperCase();
        if (sub.startsWith('ADMIN') || sub.includes('ADMINISTRATIVE')) return;
        sharedSlots.push({
          ...slot,
          schoolId: row.school_id,
          schoolName: row.school_name || `School ${row.school_id}`
        });
      });
    });

    res.json({
      success: true,
      prn,
      roomKey,
      authorSchoolId: cleanAuthorSchoolId,
      sharedSlots
    });
  } catch (err) {
    console.error('[Clustered Sync POST Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

