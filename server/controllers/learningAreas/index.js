const express = require('express');
const router = express.Router();
const db = require('../../db/index.js');

// GET /api/learning-areas?personnelId=<id>
router.get('/', async (req, res) => {
  const { personnelId } = req.query;
  if (!personnelId) return res.status(400).json({ error: 'personnelId required' });
  try {
    const result = await db.query(
      'SELECT id, personnel_id, school_year, learning_area, COALESCE(years_taught, 1) as years_taught FROM personnel_learning_areas WHERE personnel_id = $1 ORDER BY school_year DESC, learning_area ASC',
      [personnelId]
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error('[learning-areas GET]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/learning-areas/toggle
router.post('/toggle', async (req, res) => {
  const { personnelId, schoolYear, learningArea, checked, yearsTaught } = req.body;
  if (!personnelId || !schoolYear || !learningArea || checked === undefined) {
    return res.status(400).json({ error: 'personnelId, schoolYear, learningArea, checked required' });
  }
  const yearsVal = Math.max(1, parseInt(yearsTaught || 1, 10));
  try {
    if (checked) {
      await db.query(
        `INSERT INTO personnel_learning_areas (personnel_id, school_year, learning_area, years_taught) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (personnel_id, school_year, learning_area) 
         DO UPDATE SET years_taught = EXCLUDED.years_taught`,
        [personnelId, schoolYear, learningArea, yearsVal]
      );
    } else {
      await db.query(
        'DELETE FROM personnel_learning_areas WHERE personnel_id = $1 AND school_year = $2 AND learning_area = $3',
        [personnelId, schoolYear, learningArea]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[learning-areas POST toggle]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
