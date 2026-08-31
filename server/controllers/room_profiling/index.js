const express = require('express');
const router = express.Router();
const db = require('../../db');

// Ensure ephemeral queue table exists (UNLOGGED for near-RAM speeds & zero disk write overhead)
let isTableInitialized = false;
const initQueueTable = async () => {
  try {
    await db.query(`
      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_personnel_submission (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        personnel_id VARCHAR(64) NOT NULL,
        personnel_name VARCHAR(255),
        room_name VARCHAR(255),
        status VARCHAR(32) DEFAULT 'PENDING',
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_timestamp BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_pers_sub_school_status ON esf7_personnel_submission(school_id, status);
    `);
    isTableInitialized = true;
    console.log('✅ [Room Profiling Queue] Table esf7_personnel_submission initialized successfully.');
  } catch (err) {
    console.warn('[Room Profiling Queue Table Init Warning]:', err.message);
  }
};
initQueueTable();

// Periodic self-cleanup for queue records older than 24 hours
setInterval(async () => {
  try {
    await db.query(`DELETE FROM esf7_personnel_submission WHERE created_at < NOW() - INTERVAL '24 hours'`);
  } catch (e) {}
}, 15 * 60 * 1000);

// POST /api/room-profiling/submit — Teacher submits verified profile from phone
router.post('/submit', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, room, roomName, personnelId, personnel_id, personnelName, personnel_name, profileData } = req.body;
    const activeSchoolId = String(schoolId || school_id || '199998').replace('SCH-', '').trim();
    const activePersonnelId = String(personnelId || personnel_id || profileData?.id || '').trim();

    if (!activePersonnelId) {
      return res.status(400).json({ error: 'personnelId is required' });
    }

    const subId = `SUB-${activePersonnelId}-${Date.now()}`;
    const pName = personnelName || personnel_name || `${profileData?.firstName || ''} ${profileData?.lastName || ''}`.trim() || 'Teacher';
    const activeRoom = room || roomName || 'Faculty Room 1';
    const now = Date.now();

    // Replace any prior pending submission for this teacher
    await db.query(`
      DELETE FROM esf7_personnel_submission 
      WHERE school_id = $1 AND personnel_id = $2
    `, [activeSchoolId, activePersonnelId]);

    await db.query(`
      INSERT INTO esf7_personnel_submission (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_timestamp)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)
    `, [subId, activeSchoolId, activePersonnelId, pName, activeRoom, JSON.stringify(profileData || req.body), now]);

    console.log(`[Room Profiling Queue] Enqueued submission ${subId} for ${pName} (School ${activeSchoolId}, Room: ${activeRoom})`);
    res.json({ success: true, queueId: subId, message: 'Profile queued for School Head review.' });
  } catch (err) {
    console.error('[Room Profiling Queue Submit Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/pending — School Head checks for incoming teacher submissions
router.get('/pending', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const schoolId = req.query.schoolId || req.query.school_id || '199998';
    const cleanSchoolId = String(schoolId).replace('SCH-', '').trim();

    const { rows } = await db.query(`
      SELECT id, school_id as "schoolId", personnel_id as "personnelId", personnel_name as "personnelName", 
             room_name as "roomName", payload_json as "profileData", created_at as "submittedAt", created_timestamp as "submittedTimestamp"
      FROM esf7_personnel_submission 
      WHERE school_id = $1 AND status = 'PENDING'
      ORDER BY created_timestamp DESC
    `, [cleanSchoolId]);

    res.json(rows || []);
  } catch (err) {
    console.error('[Room Profiling Queue Pending GET Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/ack — School Head merges/acknowledges submissions (purges from queue)
router.post('/ack', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, submissionIds, personnelIds } = req.body;
    const cleanSchoolId = String(schoolId || school_id || '199998').replace('SCH-', '').trim();

    const subIds = Array.isArray(submissionIds) && submissionIds.length > 0 ? submissionIds : ['NONE'];
    const pIds = Array.isArray(personnelIds) && personnelIds.length > 0 ? personnelIds : ['NONE'];

    const result = await db.query(`
      DELETE FROM esf7_personnel_submission 
      WHERE school_id = $1 AND (id = ANY($2::varchar[]) OR personnel_id = ANY($3::varchar[]))
    `, [cleanSchoolId, subIds, pIds]);

    console.log(`[Room Profiling Queue] Purged ${result.rowCount || 0} approved submissions for School ${cleanSchoolId}`);
    res.json({ success: true, count: result.rowCount || 0 });
  } catch (err) {
    console.error('[Room Profiling Queue ACK Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
