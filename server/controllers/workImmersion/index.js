const express = require('express');
const router = express.Router();
const db = require('../../db/index.js');

// GET /api/work-immersion?personnelId=<id>&schoolYear=<sy>&month=<month>
router.get('/', async (req, res) => {
  const { personnelId, schoolYear, month } = req.query;
  if (!personnelId || !schoolYear || !month) {
    return res.status(400).json({ error: 'personnelId, schoolYear, and month are required' });
  }
  try {
    const result = await db.query(
      'SELECT id, personnel_id, school_year, month, day, minutes FROM work_immersion_minutes WHERE personnel_id = $1 AND school_year = $2 AND month = $3 ORDER BY day ASC',
      [personnelId, schoolYear, month]
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error('[work-immersion GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/work-immersion/save
router.post('/save', async (req, res) => {
  const { personnelId, schoolYear, month, day, minutes } = req.body;
  if (!personnelId || !schoolYear || !month || day === undefined || minutes === undefined) {
    return res.status(400).json({ error: 'personnelId, schoolYear, month, day, minutes are required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO work_immersion_minutes (personnel_id, school_year, month, day, minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (personnel_id, school_year, month, day)
       DO UPDATE SET minutes = EXCLUDED.minutes
       RETURNING id, personnel_id, school_year, month, day, minutes`,
      [personnelId, schoolYear, month, day, minutes]
    );
    res.json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('[work-immersion POST save]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
