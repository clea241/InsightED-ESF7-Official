const express = require('express');
const router = express.Router();
const db = require('../../db');
const { Pool } = require('pg');
require('dotenv').config();

// Create connection to the read-only 'insightEd' database containing schools_IERN
const insightEdPoolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: insightEdPoolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

insightEdPool.on('error', (err) => {
  console.error('[Requests DB Pool Error]:', err.message);
});

// Middleware helper to authenticate and extract user's school_id
const getSchoolId = (req) => {
  // Decode JWT or headers (assumes JWT verified upstream or uses authorization header decode)
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'STRIDE_INSIGHTED_SECRET_2026_KEY_PROD');
    return decoded.school_id;
  } catch (e) {
    return null;
  }
};

// GET /api/requests/incoming
router.get('/incoming', async (req, res) => {
  const schoolId = getSchoolId(req);
  if (!schoolId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await db.query(
      `SELECT * FROM clustered_connections WHERE target_school_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
      [schoolId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/outgoing
router.get('/outgoing', async (req, res) => {
  const schoolId = getSchoolId(req);
  if (!schoolId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await db.query(
      `SELECT * FROM clustered_connections WHERE requester_school_id = $1 ORDER BY created_at DESC`,
      [schoolId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/district-schools
// Returns all schools in the current school's district from the read-only schools_IERN table
router.get('/district-schools', async (req, res) => {
  const schoolId = getSchoolId(req);
  if (!schoolId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Get the current school's district
    const schoolRes = await db.query(`SELECT district FROM schools WHERE school_id = $1`, [schoolId]);
    let district = schoolRes.rows[0]?.district;

    if (!district) {
      // Fallback: check schools_IERN in the master database
      const fallbackRes = await insightEdPool.query(
        `SELECT "District" as district FROM "schools_IERN" WHERE "SchoolID" = $1`,
        [schoolId]
      );
      district = fallbackRes.rows[0]?.district;
    }

    if (!district) {
      return res.json([]);
    }

    // 2. Fetch all other schools in that same district
    const districtSchools = await insightEdPool.query(
      `SELECT "SchoolID" as school_id, "School_Name" as school_name, "Curricular_Offering" as offering 
       FROM "schools_IERN" 
       WHERE "District" = $1 AND "SchoolID" != $2 AND status = 'Active'
       ORDER BY "School_Name"`,
      [district, schoolId]
    );

    res.json(districtSchools.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/create
router.post('/create', async (req, res) => {
  const requesterId = getSchoolId(req);
  if (!requesterId) return res.status(401).json({ error: 'Unauthorized' });

  const { targetSchoolId, requestType, personnelId, personnelName } = req.body;
  if (!targetSchoolId || !requestType) {
    return res.status(400).json({ error: 'Target school ID and request type are required.' });
  }

  try {
    // Prevent duplicate pending requests of the same type/target
    const checkDup = await db.query(
      `SELECT id FROM clustered_connections 
       WHERE requester_school_id = $1 AND target_school_id = $2 AND request_type = $3 AND status = 'pending'
       ${personnelId ? 'AND personnel_id = $4' : ''}`,
      personnelId ? [requesterId, targetSchoolId, requestType, personnelId] : [requesterId, targetSchoolId, requestType]
    );

    if (checkDup.rows.length > 0) {
      return res.status(400).json({ error: 'A pending request already exists for this connection.' });
    }

    const insertRes = await db.query(
      `INSERT INTO clustered_connections (requester_school_id, target_school_id, request_type, personnel_id, personnel_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [requesterId, targetSchoolId, requestType, personnelId || null, personnelName || null]
    );

    res.json({ success: true, request: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:id/respond
router.post('/:id/respond', async (req, res) => {
  const targetId = getSchoolId(req);
  if (!targetId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { action } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action response.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch and verify request target
    const reqRes = await client.query(
      `SELECT * FROM clustered_connections WHERE id = $1 AND target_school_id = $2 AND status = 'pending' FOR UPDATE`,
      [id, targetId]
    );

    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending request not found or unauthorized.' });
    }

    const request = reqRes.rows[0];

    // 2. Update request status
    await client.query(
      `UPDATE clustered_connections SET status = $1, updated_at = NOW() WHERE id = $2`,
      [action, id]
    );

    // 3. If approved, apply the Type A or Type B updates
    if (action === 'approved') {
      if (request.request_type === 'school_merger') {
        const childId = request.requester_school_id;
        const parentId = request.target_school_id;

        // Perform the migration of all data from child to parent school ID
        // Move personnel
        await client.query(`UPDATE personnel SET school_id = $1 WHERE school_id = $2`, [parentId, childId]);
        // Move sections
        await client.query(`UPDATE class_sections SET school_id = $1 WHERE school_id = $2`, [parentId, childId]);
        // Move workload rows
        await client.query(`UPDATE workload_rows SET school_id = $1 WHERE school_id = $2`, [parentId, childId]);

        // Register the merger permanently
        await client.query(
          `INSERT INTO school_merger_registry (parent_school_id, child_school_id) VALUES ($1, $2)`,
          [parentId, childId]
        );
      } else if (request.request_type === 'clustered_teacher') {
        if (request.personnel_id) {
          // Officially link the shared personnel to the target school in clustered_personnel table
          // Avoid duplicates if they click approve multiple times or it was already inserted
          await client.query(
            `INSERT INTO clustered_personnel (prn, source_school_id, target_school_id) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (prn, target_school_id) DO NOTHING`,
            [request.personnel_id, request.requester_school_id, request.target_school_id]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, status: action });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
