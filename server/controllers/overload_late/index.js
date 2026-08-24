const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatOverloadLateRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    tardinessDate: row.tardiness_date ? (row.tardiness_date instanceof Date ? row.tardiness_date.toISOString().split('T')[0] : String(row.tardiness_date).split('T')[0]) : null,
    tardiness_date: row.tardiness_date ? (row.tardiness_date instanceof Date ? row.tardiness_date.toISOString().split('T')[0] : String(row.tardiness_date).split('T')[0]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET all tardiness records for school or personnel
router.get('/', async (req, res) => {
  try {
    const { personnel_id, personnelId, school_id, schoolId, school_year, schoolYear } = req.query;
    const targetPersonnelId = personnel_id || personnelId;

    let query = `SELECT * FROM overload_late WHERE 1=1`;
    const values = [];
    let counter = 1;

    if (targetPersonnelId) {
      query += ` AND personnel_id = $${counter}`;
      values.push(targetPersonnelId);
      counter++;
    }

    query += ` ORDER BY tardiness_date DESC, created_at DESC`;

    const result = await db.query(query, values);
    res.json(result.rows.map(formatOverloadLateRecord));
  } catch (err) {
    console.error('Error fetching overload_late:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Add a tardiness date for a teacher into overload_late
router.post('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      tardiness_date, tardinessDate, date
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
    const tDate = tardiness_date || tardinessDate || date;

    if (!tDate) {
      return res.status(400).json({ error: 'tardiness_date is required' });
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM overload_late`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const lteId = req.body.id || `LTE-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO overload_late (
        id, personnel_id, school_id, school_year, tardiness_date
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (personnel_id, school_year, tardiness_date) DO UPDATE SET
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      lteId,
      targetPersonnelId,
      targetSchoolId,
      targetSchoolYear,
      tDate
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatOverloadLateRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting overload_late:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a tardiness record
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM overload_late WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Tardiness record ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
