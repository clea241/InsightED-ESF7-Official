const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generateWorkloadId } = require('../../db/idGenerator');

/**
 * GET /api/shs-transfers
 * Query: personnelId, term, schoolYear
 */
router.get('/', async (req, res) => {
  const { personnelId, term, schoolYear = '2026-2027' } = req.query;
  try {
    let query = `
      SELECT t.*,
        ap.first_name || ' ' || ap.last_name AS absent_name,
        sp.first_name || ' ' || sp.last_name AS substitute_name,
        swr.subject, swr.grade_level, swr.section_id
      FROM shs_workload_transfers t
      LEFT JOIN personnel ap ON t.absent_personnel_id = ap.id
      LEFT JOIN personnel sp ON t.substitute_personnel_id = sp.id
      LEFT JOIN shs_workload_rows swr ON t.shs_workload_row_id = swr.id
      WHERE t.school_year = $1`;
    const params = [schoolYear];

    if (personnelId) {
      params.push(personnelId);
      query += ` AND (t.absent_personnel_id = $${params.length} OR t.substitute_personnel_id = $${params.length})`;
    }
    if (term) {
      params.push(term);
      query += ` AND t.term = $${params.length}`;
    }
    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[SHS Transfers GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shs-transfers
 * Log a new SHS workload transfer
 */
router.post('/', async (req, res) => {
  const {
    school_id, school_year = '2026-2027',
    term, absent_personnel_id, substitute_personnel_id,
    shs_workload_row_id, start_date, end_date, reason, logged_by
  } = req.body;

  if (!term || !['1st', '2nd', '3rd'].includes(term)) {
    return res.status(400).json({ error: 'term is required (1st, 2nd, or 3rd).' });
  }
  if (!absent_personnel_id || !substitute_personnel_id || !shs_workload_row_id) {
    return res.status(400).json({ error: 'absent_personnel_id, substitute_personnel_id, and shs_workload_row_id are required.' });
  }

  try {
    const transferId = generateWorkloadId();
    const result = await db.query(
      `INSERT INTO shs_workload_transfers
        (id, school_id, school_year, term, absent_personnel_id, substitute_personnel_id, shs_workload_row_id, start_date, end_date, reason, status, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)
       RETURNING *`,
      [transferId, school_id, school_year, term,
       absent_personnel_id, substitute_personnel_id, shs_workload_row_id,
       start_date, end_date, reason || null, logged_by || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[SHS Transfers POST Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/shs-transfers/:id/status
 * Update transfer status (active / ended / cancelled)
 */
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['active', 'ended', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'status must be active, ended, or cancelled.' });
  }
  try {
    const result = await db.query(
      `UPDATE shs_workload_transfers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
