const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generateTrainingId } = require('../../db/idGenerator');

// Add a training row
router.post('/', async (req, res) => {
  const { personnel_id, training_type, title, conductor, start_date, end_date, days, hours_per_day } = req.body;
  const total_hours = Number(days) * Number(hours_per_day);
  try {
    const trainingId = generateTrainingId();
    const result = await db.query(
      `INSERT INTO personnel_trainings (id, personnel_id, training_type, title, conductor, start_date, end_date, days, hours_per_day, total_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [trainingId, personnel_id, training_type, title, conductor, start_date || '2000-01-01', end_date || '2000-01-01', Number(days) || 0, Number(hours_per_day) || 0, total_hours || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update all training rows for a personnel (clears and inserts new rows to match client-side arrays)
router.put('/personnel/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  const { neapTrainingRows, certificationRows, otherTrainingRows } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear old trainings
    await client.query('DELETE FROM personnel_trainings WHERE personnel_id = $1', [personnel_id]);

    const allTrainings = [
      ...(neapTrainingRows || []).map(t => ({ ...t, type: 'neap' })),
      ...(certificationRows || []).map(t => ({ ...t, type: 'certification' })),
      ...(otherTrainingRows || []).map(t => ({ ...t, type: 'other' }))
    ];

    const inserted = [];
    for (const t of allTrainings) {
      const total_hours = Number(t.totalHours || 0);
      const hours_per_day = t.days ? (total_hours / Number(t.days)) : 0;
      const trainingId = generateTrainingId();
      const result = await client.query(
        `INSERT INTO personnel_trainings (id, personnel_id, training_type, title, conductor, start_date, end_date, days, hours_per_day, total_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [trainingId, personnel_id, t.type, t.title || '', t.conductor || 'N/A', t.startDate || '2000-01-01', t.endDate || '2000-01-01', Number(t.days) || 0, hours_per_day, total_hours]
      );
      inserted.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.json(inserted);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Delete a training row
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM personnel_trainings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
