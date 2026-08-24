const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatLearningAreasRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    learningAreaMap: row.matrix_data || {},
    matrix_data: row.matrix_data || {},
    rawPayload: raw
  };
}

// GET learning area matrix (supports query param personnelId)
router.get('/', async (req, res) => {
  const personnel_id = req.query.personnelId || req.query.personnel_id;
  if (!personnel_id) {
    return res.json({ learningAreaMap: {}, matrix_data: {} });
  }
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [personnel_id]
    );
    if (result.rows.length === 0) {
      return res.json({ learningAreaMap: {}, matrix_data: {} });
    }
    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET learning area matrix for a personnel_id param
router.get('/:personnel_id', async (req, res) => {

  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [personnel_id]
    );
    if (result.rows.length === 0) {
      return res.json({ learningAreaMap: {}, matrix_data: {} });
    }
    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT Upsert learning area matrix for a personnel record
router.post('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const { learningAreaMap, matrix_data } = req.body;
    const targetMap = learningAreaMap || matrix_data || {};

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id]
    );
    const schoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_learning_areas`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const laId = `LA-${schoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, raw_payload)
      VALUES ($1, $2, $3::jsonb, $4::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        matrix_data = EXCLUDED.matrix_data,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      laId,
      personnel_id,
      JSON.stringify(targetMap),
      JSON.stringify(req.body)
    ]);

    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    console.error('Error upserting esf7_personnel_learning_areas:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Single update route
router.put('/:personnel_id', async (req, res) => {
  return router.handle({ ...req, method: 'POST' }, res);
});

module.exports = router;
