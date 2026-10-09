const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function formatAbsenceRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    startDate: row.start_date ? (row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date).split('T')[0]) : null,
    start_date: row.start_date ? (row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date).split('T')[0]) : null,
    endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date).split('T')[0]) : null,
    end_date: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date).split('T')[0]) : null,
    leaveType: row.leave_type,
    leave_type: row.leave_type,
    totalDays: row.total_days || 1,
    total_days: row.total_days || 1,
    rawPayload: raw
  };
}

// GET all absence records for school or personnel
router.get('/', async (req, res) => {
  try {
    const { personnel_id, personnelId, school_id, schoolId, school_year, schoolYear } = req.query;
    const targetPersonnelId = personnel_id || personnelId;

    let query = `SELECT * FROM overload_absences WHERE 1=1`;
    const values = [];
    let counter = 1;

    if (targetPersonnelId) {
      query += ` AND personnel_id = $${counter}`;
      values.push(targetPersonnelId);
      counter++;
    }

    // Scoped to the requesting school: without this the list contained every school's absences.
    const scopeSchool = String(school_id || schoolId || getSchoolIdFromRequest(req) || '').replace(/^SCH-/i, '');
    if (scopeSchool) {
      query += ` AND (school_id = $${counter} OR school_id = $${counter + 1})`;
      values.push(scopeSchool, `SCH-${scopeSchool}`);
      counter += 2;
    }

    query += ` ORDER BY start_date DESC, created_at DESC`;

    const result = await db.query(query, values);
    res.json(result.rows.map(formatAbsenceRecord));
  } catch (err) {
    console.error('Error fetching overload_absences:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Create new absence record in overload_absences
router.post('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      start_date, startDate,
      end_date, endDate,
      leave_type, leaveType,
      total_days, totalDays
    } = req.body;

    const targetPersonnelId = personnel_id || personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: 'personnel_id is required' });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId]
    );
    const targetSchoolId = school_id || bodySchoolId || (personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348');
    const targetSchoolYear = school_year || bodySchoolYear || (personRes.rows.length > 0 ? personRes.rows[0].school_year : '2026-2027');
    const sDate = start_date || startDate;
    const eDate = end_date || endDate || sDate;

    if (!sDate) {
      return res.status(400).json({ error: 'start_date is required' });
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM overload_absences`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const absId = req.body.id || `ABS-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO overload_absences (
        id, personnel_id, school_id, school_year, start_date, end_date, leave_type, total_days, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, leave_type = EXCLUDED.leave_type,
        total_days = EXCLUDED.total_days, raw_payload = EXCLUDED.raw_payload, updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      absId,
      targetPersonnelId,
      targetSchoolId,
      targetSchoolYear,
      sDate,
      eDate,
      leave_type || leaveType || 'SICK_LEAVE',
      total_days || totalDays || 1,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatAbsenceRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting overload_absences:', err);
    if (err.code === '23503') {
      // foreign key: overload_absences.personnel_id must exist in esf7_personnel_profile
      return res.status(422).json({ error: `This person has no personnel profile yet, so the absence cannot be linked (${err.detail || err.message}).`, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE an absence record
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM overload_absences WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Absence record ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
