const express = require('express');
const router = express.Router();
const db = require('../../db');

// Get all transfers
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, w.subject, w.start_time, w.end_time, w.days
      FROM workload_transfers t
      LEFT JOIN workload_rows w ON t.workload_row_id = w.id
      ORDER BY t.id DESC
    `);
    res.json(result.rows.map(row => ({
      id: String(row.id),
      schoolId: row.school_id,
      schoolYear: row.school_year,
      absentTeacherId: String(row.absent_personnel_id),
      substituteTeacherId: String(row.substitute_personnel_id),
      workloadRowId: row.workload_row_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
      loggedBy: row.logged_by,
      workloadRows: row.subject ? [{
        id: row.workload_row_id,
        subject: row.subject,
        startTime: row.start_time ? row.start_time.substring(0, 5) : '',
        endTime: row.end_time ? row.end_time.substring(0, 5) : '',
        days: row.days
      }] : []
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { generateTransferId } = require('../../db/idGenerator');

// Create workload transfers (creates a batch of transfers based on frontend array structure)
router.post('/batch', async (req, res) => {
  const { schoolId, schoolYear, absentTeacherId, substituteTeacherId, workloadRows, startDate, endDate, reason, loggedBy } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const row of workloadRows || []) {
      const newTransferId = generateTransferId();
      const result = await client.query(
        `INSERT INTO workload_transfers (id, school_id, school_year, absent_personnel_id, substitute_personnel_id, workload_row_id, start_date, end_date, reason, status, logged_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [newTransferId, schoolId || '123456', schoolYear || '2026-2027', absentTeacherId, substituteTeacherId, row.id, startDate, endDate, reason || '', 'active', loggedBy || 'School Head']
      );
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json(inserted.map(row => ({
      id: row.id,
      schoolId: row.school_id,
      schoolYear: row.school_year,
      absentTeacherId: String(row.absent_personnel_id),
      substituteTeacherId: String(row.substitute_personnel_id),
      workloadRowId: row.workload_row_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
      loggedBy: row.logged_by
    })));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Update transfer status (e.g. End or Cancel coverage)
router.put('/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const result = await db.query(
      `UPDATE workload_transfers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer log not found' });
    const row = result.rows[0];
    res.json({
      id: String(row.id),
      schoolId: row.school_id,
      schoolYear: row.school_year,
      absentTeacherId: String(row.absent_personnel_id),
      substituteTeacherId: String(row.substitute_personnel_id),
      workloadRowId: row.workload_row_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
      loggedBy: row.logged_by
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
