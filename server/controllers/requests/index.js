const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function formatRequestRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
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
    const cleanSchoolId = schoolId.replace('SCH-', '');
    
    const { Pool } = require('pg');
    const poolString = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
      : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
    const insightEdPool = new Pool({
      connectionString: poolString,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    const schoolsRes = await insightEdPool.query(
      `SELECT DISTINCT CAST(school_id AS TEXT) as school_id, school_name FROM esf7_database WHERE CAST(school_id AS TEXT) != $1 LIMIT 20`,
      [cleanSchoolId]
    ).catch(() => ({ rows: [] }));

    await insightEdPool.end().catch(() => {});

    const districtList = schoolsRes.rows.map(r => ({
      schoolId: r.school_id,
      schoolName: r.school_name || `School ${r.school_id}`
    }));

    res.json(districtList.length > 0 ? districtList : [
      { schoolId: '108348', schoolName: 'Legazpi Port District Central School' },
      { schoolId: '135245', schoolName: 'Albay National High School' }
    ]);
  } catch (err) {
    console.error('[District Schools Error]:', err.message);
    res.json([
      { schoolId: '108348', schoolName: 'Legazpi Port District Central School' },
      { schoolId: '135245', schoolName: 'Albay National High School' }
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
        personnelId || personnel_id || null,
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
