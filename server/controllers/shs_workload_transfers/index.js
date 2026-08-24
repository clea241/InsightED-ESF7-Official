const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatWorkloadTransferRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    absentPersonnelId: row.absent_personnel_id,
    absent_personnel_id: row.absent_personnel_id,
    relievingPersonnelId: row.relieving_personnel_id,
    relieving_personnel_id: row.relieving_personnel_id,
    absenceId: row.absence_id || null,
    absence_id: row.absence_id || null,
    workloadId: row.workload_id,
    workload_id: row.workload_id,
    workloadType: row.workload_type || 'ELEM_JHS',
    workload_type: row.workload_type || 'ELEM_JHS',
    subject: row.subject,
    startDate: row.start_date ? (row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date).split('T')[0]) : null,
    start_date: row.start_date ? (row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date).split('T')[0]) : null,
    endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date).split('T')[0]) : null,
    end_date: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date).split('T')[0]) : null,
    relievingHours: Number(row.relieving_hours || 1.00),
    relieving_hours: Number(row.relieving_hours || 1.00),
    rawPayload: raw
  };
}

// GET all workload transfers for school or relieving personnel
router.get('/', async (req, res) => {
  try {
    const { relieving_personnel_id, relievingPersonnelId, absent_personnel_id, absentPersonnelId, school_id, schoolId } = req.query;
    const targetRelieving = relieving_personnel_id || relievingPersonnelId;
    const targetAbsent = absent_personnel_id || absentPersonnelId;

    let query = `SELECT * FROM esf7_workload_transfer WHERE 1=1`;
    const values = [];
    let counter = 1;

    if (targetRelieving) {
      query += ` AND relieving_personnel_id = $${counter}`;
      values.push(targetRelieving);
      counter++;
    }

    if (targetAbsent) {
      query += ` AND absent_personnel_id = $${counter}`;
      values.push(targetAbsent);
      counter++;
    }

    query += ` ORDER BY start_date DESC, created_at DESC`;

    const result = await db.query(query, values);
    res.json(result.rows.map(formatWorkloadTransferRecord));
  } catch (err) {
    console.error('Error fetching esf7_workload_transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Create a new workload transfer record in esf7_workload_transfer
router.post('/', async (req, res) => {
  try {
    const {
      absent_personnel_id, absentPersonnelId,
      relieving_personnel_id, relievingPersonnelId,
      absence_id, absenceId,
      workload_id, workloadId,
      workload_type, workloadType,
      subject,
      start_date, startDate,
      end_date, endDate,
      relieving_hours, relievingHours,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear
    } = req.body;

    const targetAbsent = absent_personnel_id || absentPersonnelId;
    const targetRelieving = relieving_personnel_id || relievingPersonnelId;
    const targetWorkloadId = workload_id || workloadId;
    const targetSubject = subject || 'MATHEMATICS';

    if (!targetAbsent || !targetRelieving || !targetWorkloadId) {
      return res.status(400).json({ error: 'absent_personnel_id, relieving_personnel_id, and workload_id are required' });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetRelieving]
    );
    const targetSchoolId = school_id || bodySchoolId || (personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348');
    const targetSchoolYear = school_year || bodySchoolYear || (personRes.rows.length > 0 ? personRes.rows[0].school_year : '2026-2027');
    const sDate = start_date || startDate;
    const eDate = end_date || endDate || sDate;

    if (!sDate) {
      return res.status(400).json({ error: 'start_date is required' });
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_workload_transfer`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const trfId = req.body.id || `TRF-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_workload_transfer (
        id, school_id, school_year, absent_personnel_id, relieving_personnel_id,
        absence_id, workload_id, workload_type, subject, start_date, end_date, relieving_hours, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING *;
    `;

    const values = [
      trfId,
      targetSchoolId,
      targetSchoolYear,
      targetAbsent,
      targetRelieving,
      absence_id || absenceId || null,
      targetWorkloadId,
      workload_type || workloadType || 'ELEM_JHS',
      targetSubject,
      sDate,
      eDate,
      relieving_hours || relievingHours || 1.00,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatWorkloadTransferRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_workload_transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a workload transfer record
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_workload_transfer WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Workload transfer ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
