const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

// POST /api/submissions - Queue a new certified submission
router.post('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.body.schoolId || '123456';
    const { schoolYear, payload, signature, certifiedBy } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Missing submission payload data' });
    }

    // 1. Insert into esf7_submission_queue
    const result = await db.query(
      `INSERT INTO esf7_submission_queue (school_id, school_year, payload, signature, certified_by, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [schoolId, schoolYear || 'SY 26-27', JSON.stringify(payload), signature || null, certifiedBy || null]
    );

    const jobId = result.rows[0].id;

    // 2. Fetch initial queue position
    const posRes = await db.query(
      `SELECT COUNT(*) FROM esf7_submission_queue WHERE status = 'pending' AND id < $1`,
      [jobId]
    );
    const queuePosition = parseInt(posRes.rows[0].count, 10) + 1;

    res.status(202).json({
      success: true,
      jobId,
      status: 'pending',
      queuePosition
    });
  } catch (err) {
    console.error('Failed to queue submission:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/status/:job_id - Check status and queue position
router.get('/status/:job_id', async (req, res) => {
  try {
    const jobId = parseInt(req.params.job_id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid Job ID' });
    }

    const result = await db.query(
      `SELECT status, error_message FROM esf7_submission_queue WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission job not found' });
    }

    const job = result.rows[0];

    // If pending, calculate position
    let queuePosition = 0;
    if (job.status === 'pending') {
      const posRes = await db.query(
        `SELECT COUNT(*) FROM esf7_submission_queue WHERE status = 'pending' AND id < $1`,
        [jobId]
      );
      queuePosition = parseInt(posRes.rows[0].count, 10) + 1;
    }

    res.json({
      success: true,
      status: job.status,
      queuePosition,
      errorMessage: job.error_message || null
    });
  } catch (err) {
    console.error('Failed to fetch job status:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/history - Fetch history of submissions for current school
router.get('/history', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    if (!schoolId) {
      return res.status(400).json({ error: 'School ID required' });
    }
    const result = await db.query(
      `SELECT id, status, created_at FROM esf7_submission_queue WHERE school_id = $1 ORDER BY created_at DESC`,
      [schoolId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch submission history:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
