const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

// GET /api/absences
router.get('/', async (req, res) => {
  const schoolId = getSchoolIdFromRequest(req);
  if (!schoolId) {
    return res.status(400).json({ error: 'Authentication required' });
  }
  try {
    const result = await db.query(`
      SELECT a.id, a.personnel_id as "personnelId", a.absence_date as "absenceDate", a.leave_type as "leaveType",
             COALESCE(a.first_name, p.first_name) as "firstName", 
             COALESCE(a.last_name, p.last_name) as "lastName",
             COALESCE(a.prn, p.prn) as "prn",
             COALESCE(a.tin, p.tin) as "tin"
      FROM personnel_absences a
      LEFT JOIN personnel p ON a.personnel_id = p.id
      WHERE p.school_id = $1
      ORDER BY a.absence_date DESC
    `, [schoolId]);
    
    // Format date as YYYY-MM-DD
    const formatted = result.rows.map(row => ({
      ...row,
      absenceDate: row.absenceDate ? new Date(row.absenceDate).toISOString().substring(0, 10) : ''
    }));
    
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/absences
router.post('/', async (req, res) => {
  const { personnel_id, start_date, end_date, leave_type } = req.body;
  if (!personnel_id || !start_date || !end_date || !leave_type) {
    return res.status(400).json({ error: 'personnel_id, start_date, end_date, and leave_type are required' });
  }

  const start = new Date(start_date);
  const end = new Date(end_date);
  if (end < start) {
    return res.status(400).json({ error: 'End date cannot be before start date.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const datesToInsert = [];
    let current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      // Skip Saturdays (6) and Sundays (0)
      if (day !== 0 && day !== 6) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        datesToInsert.push(`${yyyy}-${mm}-${dd}`);
      }
      current.setDate(current.getDate() + 1);
    }

    if (datesToInsert.length === 0) {
      return res.status(400).json({ error: 'No school weekdays found in the selected date range.' });
    }

    const personnelRes = await client.query('SELECT prn, first_name, last_name, tin FROM personnel WHERE id = $1', [personnel_id]);
    if (personnelRes.rows.length === 0) {
      return res.status(404).json({ error: 'Personnel not found.' });
    }
    const { prn, first_name, last_name, tin } = personnelRes.rows[0];

    const inserted = [];
    for (const dateStr of datesToInsert) {
      const checkDup = await client.query(
        'SELECT id FROM personnel_absences WHERE personnel_id = $1 AND absence_date = $2',
        [personnel_id, dateStr]
      );
      if (checkDup.rows.length === 0) {
        const result = await client.query(`
          INSERT INTO personnel_absences (personnel_id, absence_date, leave_type, prn, first_name, last_name, tin)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, personnel_id as "personnelId", absence_date as "absenceDate", leave_type as "leaveType", prn, first_name as "firstName", last_name as "lastName", tin
        `, [personnel_id, dateStr, leave_type, prn, first_name, last_name, tin]);
        inserted.push(result.rows[0]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, count: inserted.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/absences/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM personnel_absences WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
