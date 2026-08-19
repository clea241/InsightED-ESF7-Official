const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generatePersonnelId, generateEmploymentId, generateQualificationId } = require('../../db/idGenerator');
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

// GET /api/requests/history
router.get('/history', async (req, res) => {
  const schoolId = getSchoolId(req);
  if (!schoolId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await db.query(
      `SELECT * FROM clustered_connections 
       WHERE (target_school_id = $1 OR requester_school_id = $1) AND status IN ('approved', 'rejected') 
       ORDER BY updated_at DESC`,
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
    const sId = String(schoolId);
    let district = null;

    // 1. Primary source: check authoritative schools_IERN table for school's official district
    const iernDistrictRes = await insightEdPool.query(
      `SELECT "District" as district FROM "schools_IERN" WHERE CAST("SchoolID" AS TEXT) = $1 LIMIT 1`,
      [sId]
    );

    if (iernDistrictRes.rows.length > 0 && iernDistrictRes.rows[0].district) {
      district = iernDistrictRes.rows[0].district;
    } else {
      // Fallback: check local schools table
      const schoolRes = await db.query(`SELECT district FROM schools WHERE school_id = $1`, [sId]);
      district = schoolRes.rows[0]?.district;
    }

    if (!district || district === 'District' || district === 'UNSPECIFIED') {
      return res.json([]);
    }

    // 2. Fetch all other schools in that same district from schools_IERN
    let districtSchools = await insightEdPool.query(
      `SELECT "SchoolID" as school_id, "School_Name" as school_name, "Curricular_Offering" as offering 
       FROM "schools_IERN" 
       WHERE LOWER("District") = LOWER($1) 
         AND CAST("SchoolID" AS TEXT) != $2 
         AND (LOWER(status) = 'active' OR status IS NULL)
       ORDER BY "School_Name"`,
      [district, sId]
    );

    // Fallback if schools_IERN returns 0 rows (e.g. custom pilot sandbox schools)
    if (districtSchools.rows.length === 0) {
      districtSchools = await db.query(
        `SELECT school_id, school_name 
         FROM schools 
         WHERE LOWER(district) = LOWER($1) AND school_id != $2
         ORDER BY school_name`,
        [district, sId]
      );
    }

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
      } else if (['clustered_teacher', 'reassigned_teacher'].includes(request.request_type)) {
        if (request.personnel_id) {
          // Check if personnel exists in personnel table
          const pCheck = await client.query(
            `SELECT id, prn FROM personnel WHERE prn = $1 OR profiling_code = $1 OR id = $1 LIMIT 1`,
            [request.personnel_id]
          );

          let prnToInsert = request.personnel_id;
          if (pCheck.rows.length > 0) {
            prnToInsert = pCheck.rows[0].prn || pCheck.rows[0].profiling_code || pCheck.rows[0].id;
          } else {
            // Ensure personnel row exists in personnel table so JOIN in GET /api/personnel succeeds!
            const newPersonnelId = generatePersonnelId();
            const names = (request.personnel_name || 'Clustered Teacher').trim().split(' ');
            const fName = names[0] || 'Clustered';
            const lName = names.slice(1).join(' ') || 'Teacher';
            await client.query(
              `INSERT INTO personnel (id, prn, school_id, school_year, type, salutation, first_name, last_name, deployment_status, profiling_code, is_school_head)
               VALUES ($1, $2, $3, 'SY 2026-2027', 'teaching', 'Mr/Ms', $4, $5, 'CLUSTERED', $6, false)
               ON CONFLICT DO NOTHING`,
              [newPersonnelId, request.personnel_id, request.requester_school_id, fName, lName, request.personnel_id]
            );

            // Also insert employment row for new personnel
            await client.query(
              `INSERT INTO personnel_employment (id, personnel_id, position, designation, fund_source, nature_of_appointment, hiring_arrangement, first_service_date, last_promotion_date, new_station_date)
               VALUES ($1, $2, 'Teacher I', '', 'NATIONAL', 'REGULAR PERMANENT', 'TEACHING', '2020-01-01', '2020-01-01', '2020-01-01')
               ON CONFLICT DO NOTHING`,
              [generateEmploymentId(), newPersonnelId]
            );

            // Also insert qualification row
            await client.query(
              `INSERT INTO personnel_qualifications (id, personnel_id, college_degree, major, post_graduate_degree, eligibility)
               VALUES ($1, $2, 'Bachelor of Secondary Education', 'General Education', 'N/A', 'LET')
               ON CONFLICT DO NOTHING`,
              [generateQualificationId(), newPersonnelId]
            );
          }

          // Officially link the shared personnel to the target school in clustered_personnel table
          await client.query(
            `INSERT INTO clustered_personnel (prn, source_school_id, target_school_id) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (prn, target_school_id) DO NOTHING`,
            [prnToInsert, request.requester_school_id, request.target_school_id]
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
