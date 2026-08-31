const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

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

// GET /api/requests/incoming
router.get('/incoming', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '108348';
    const result = await db.query(
      `SELECT * FROM esf7_requests WHERE target_school_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
      [schoolId]
    );
    res.json(result.rows.map(formatRequestRecord));
  } catch (err) {
    console.error('[Requests Incoming GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/outgoing
router.get('/outgoing', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '108348';
    const result = await db.query(
      `SELECT * FROM esf7_requests WHERE requester_school_id = $1 ORDER BY created_at DESC`,
      [schoolId]
    );
    res.json(result.rows.map(formatRequestRecord));
  } catch (err) {
    console.error('[Requests Outgoing GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/history
router.get('/history', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '108348';
    const result = await db.query(
      `SELECT * FROM esf7_requests 
       WHERE (target_school_id = $1 OR requester_school_id = $1) AND status IN ('approved', 'rejected', 'CANCELLED') 
       ORDER BY updated_at DESC`,
      [schoolId]
    );
    res.json(result.rows.map(formatRequestRecord));
  } catch (err) {
    console.error('[Requests History GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/district-schools
router.get('/district-schools', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '502949';
    const cleanSchoolId = schoolId.replace('SCH-', '').trim();
    
    const { Pool } = require('pg');
    const poolString = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/insighted_esf7|insightEd/gi, 'users_database')
      : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/users_database`;
    
    const usersDbPool = new Pool({
      connectionString: poolString,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    let currentSchoolMeta = null;
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

    let schoolsRes = { rows: [] };

    // 1. If current school district is known, get schools in the same district from schools_iern
    if (currentSchoolMeta && currentSchoolMeta.district) {
      schoolsRes = await usersDbPool.query(
        `SELECT school_id, school_name, district, division, region 
         FROM schools_iern 
         WHERE UPPER(district) = UPPER($1) 
           AND CAST(school_id AS TEXT) != $2 
           AND (is_testaccount IS NOT TRUE)
         ORDER BY school_name ASC`,
        [currentSchoolMeta.district, cleanSchoolId]
      ).catch(() => ({ rows: [] }));
    }

    // 2. If district query has few/no results, query same division from schools_iern
    if (schoolsRes.rows.length === 0 && currentSchoolMeta && currentSchoolMeta.division) {
      schoolsRes = await usersDbPool.query(
        `SELECT school_id, school_name, district, division, region 
         FROM schools_iern 
         WHERE UPPER(division) = UPPER($1) 
           AND CAST(school_id AS TEXT) != $2 
           AND (is_testaccount IS NOT TRUE)
         ORDER BY school_name ASC`,
        [currentSchoolMeta.division, cleanSchoolId]
      ).catch(() => ({ rows: [] }));
    }

    // 3. Fallback: query schools_iern for Legazpi / Albay
    if (schoolsRes.rows.length === 0) {
      schoolsRes = await usersDbPool.query(
        `SELECT school_id, school_name, district, division, region 
         FROM schools_iern 
         WHERE (division ILIKE '%legazpi%' OR division ILIKE '%legaspi%' OR division ILIKE '%albay%')
           AND CAST(school_id AS TEXT) != $1
           AND (is_testaccount IS NOT TRUE)
         ORDER BY school_name ASC`,
        [cleanSchoolId]
      ).catch(() => ({ rows: [] }));
    }

    await usersDbPool.end().catch(() => {});

    let districtList = schoolsRes.rows.map(r => ({
      schoolId: String(r.school_id || '').trim(),
      schoolName: (r.school_name || `School ${r.school_id}`).trim(),
      district: r.district || '',
      division: r.division || ''
    })).filter(s => s.schoolId !== cleanSchoolId && s.schoolId !== '199997' && s.schoolId !== '199998');

    // ── Orientation Demo Pairing Exclusivity ──
    // School 199997 only appears in 199998, and School 199998 only appears in 199997.
    // They NEVER appear in any real/production school's dropdown list.
    if (cleanSchoolId === '199998') {
      districtList.unshift({
        schoolId: '199997',
        schoolName: 'Orientation Satellite Elementary School',
        district: 'ALBAY II DISTRICT',
        division: 'LEGASPI CITY'
      });
    } else if (cleanSchoolId === '199997') {
      districtList.unshift({
        schoolId: '199998',
        schoolName: 'Orientation Demonstration Integrated School',
        district: 'ALBAY II DISTRICT',
        division: 'LEGASPI CITY'
      });
    }

    res.json(districtList.length > 0 ? districtList : [
      { schoolId: '108348', schoolName: 'Legazpi Port District Central School', district: 'Legazpi Port District', division: 'LEGASPI CITY' },
      { schoolId: '135245', schoolName: 'Albay National High School', district: 'Legazpi City District', division: 'LEGASPI CITY' }
    ]);
  } catch (err) {
    console.error('[District Schools Error]:', err.message);
    res.json([
      { schoolId: '108348', schoolName: 'Legazpi Port District Central School', district: 'Legazpi Port District', division: 'LEGASPI CITY' },
      { schoolId: '135245', schoolName: 'Albay National High School', district: 'Legazpi City District', division: 'LEGASPI CITY' }
    ]);
  }
});


// POST /api/requests/create
router.post('/create', async (req, res) => {
  try {
    const { targetSchoolId, target_school_id, requestType, request_type, personnelId, personnel_id, personnelName, personnel_name, remarks } = req.body;
    const requesterId = getSchoolIdFromRequest(req) || req.body.requesterSchoolId || req.body.requester_school_id || '108348';
    const tSchoolId = targetSchoolId || target_school_id;
    const rType = requestType || request_type;

    if (!tSchoolId || !rType) {
      return res.status(400).json({ error: 'Target school ID and request type are required.' });
    }

    const checkDup = await db.query(
      `SELECT id FROM esf7_requests 
       WHERE requester_school_id = $1 AND target_school_id = $2 AND request_type = $3 AND status = 'pending'`,
      [requesterId, tSchoolId, rType]
    );

    if (checkDup.rows.length > 0) {
      return res.status(400).json({ error: 'A pending request already exists for this connection.' });
    }

    let targetPersonnelId = personnelId || personnel_id || null;
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
        const cleanSchoolId = schoolId.replace('SCH-', '');
        const tableName = ['199998', '199997'].includes(cleanSchoolId) ? 'esf7_database_dummy' : 'esf7_database';
        
        const { Pool } = require('pg');
        const poolString = process.env.DATABASE_URL
          ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
          : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
        const insightEdPool = new Pool({
          connectionString: poolString,
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        });
        
        const seqIndex = idParts.length > 2 ? parseInt(idParts[2], 10) - 1 : 0;
        const masterRows = await insightEdPool.query(
          `SELECT * FROM ${tableName} WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1`,
          [cleanSchoolId]
        ).catch(() => ({ rows: [] }));
        await insightEdPool.end().catch(() => {});
        
        const masterRow = masterRows.rows[seqIndex] || masterRows.rows[0] || {};
        const pName = personnelName || personnel_name || '';
        const fName = masterRow.first || masterRow.first_name || (pName ? pName.split(' ')[0] : 'TEACHER');
        const lName = masterRow.last || masterRow.last_name || (pName ? pName.split(' ').slice(1).join(' ') : 'STAFF');
        const actualPrn = masterRow.prn || String(targetPersonnelId).replace('PER-', 'PRN-');
        const actualId = String(targetPersonnelId).replace('PRN-', 'PER-');

        await db.query(
          `INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, type, first_name, last_name, created_at, updated_at)
           VALUES ($1, $2, $3, 'SY 26-27', 'teaching', $4, $5, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [actualId, actualPrn, schoolId, fName, lName]
        ).catch(() => {});
        targetPersonnelId = actualId;
      }
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_requests`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const reqId = req.body.id || `REQ-${requesterId.replace('SCH-', '')}-${seq}`;

    const insertRes = await db.query(
      `INSERT INTO esf7_requests (id, requester_school_id, target_school_id, request_type, personnel_id, personnel_name, remarks, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING *`,
      [
        reqId,
        requesterId,
        tSchoolId,
        rType,
        targetPersonnelId,
        personnelName || personnel_name || null,
        remarks || null,
        JSON.stringify(req.body)
      ]
    );

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

    res.json({ success: true, status: action, request: formatRequestRecord(result.rows[0]) });
  } catch (err) {
    console.error('[Requests Respond Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
