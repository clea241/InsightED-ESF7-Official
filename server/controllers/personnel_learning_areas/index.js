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

// POST /toggle — Toggle / update specific learning area cell
router.post('/toggle', async (req, res) => {
  try {
    const { personnelId, schoolYear, learningArea, checked, yearsTaught } = req.body;
    if (!personnelId) return res.status(400).json({ error: 'personnelId is required' });

    // 1. Ensure parent profile exists in esf7_personnel_profile to satisfy FK
    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnelId]
    );

    let schoolId = '108348';
    if (personRes.rows.length > 0) {
      schoolId = personRes.rows[0].school_id;
    } else {
      const idParts = String(personnelId).split('-');
      schoolId = idParts.length > 1 ? idParts[1] : '108348';
      const cleanSchoolId = schoolId.replace('SCH-', '');
      const tableName = ['199998', '199997'].includes(cleanSchoolId) ? 'esf7_database_dummy' : 'esf7_database';
      
      const { Pool } = require('pg');
      const poolString = process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
        : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
      const insightEdPool = new Pool({
        connectionString: poolString,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      });
      
      const seqIndex = idParts.length > 2 ? parseInt(idParts[2], 10) - 1 : 0;
      const masterRows = await insightEdPool.query(
        `SELECT * FROM ${tableName} WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1`,
        [cleanSchoolId]
      ).catch(() => ({ rows: [] }));
      await insightEdPool.end().catch(() => {});
      
      const masterRow = masterRows.rows[seqIndex] || masterRows.rows[0] || {};
      const fName = masterRow.first || masterRow.first_name || 'TEACHER';
      const lName = masterRow.last || masterRow.last_name || 'STAFF';
      const prn = masterRow.prn || String(personnelId).replace('PER-', 'PRN-');

      await db.query(
        `INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, type, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, 'SY 26-27', 'teaching', $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [personnelId, prn, schoolId, fName, lName]
      ).catch(() => {});
    }

    const existing = await db.query(
      `SELECT matrix_data FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [personnelId]
    );

    let matrix = existing.rows.length > 0 && existing.rows[0].matrix_data ? existing.rows[0].matrix_data : {};
    const cellKey = `${schoolYear}||${learningArea}`;

    if (checked) {
      matrix[cellKey] = { checked: true, years: Number(yearsTaught || 1) };
    } else {
      delete matrix[cellKey];
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_learning_areas`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const laId = `LA-${schoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, raw_payload, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
      ON CONFLICT (personnel_id) DO UPDATE SET
        matrix_data = EXCLUDED.matrix_data,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      laId,
      personnelId,
      JSON.stringify(matrix),
      JSON.stringify({ lastToggle: { schoolYear, learningArea, checked, yearsTaught } })
    ]);

    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    console.error('Error toggling learning area:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET learning area matrix for a personnel_id param
router.get('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const altId = personnel_id.startsWith('PER-')
      ? personnel_id.replace('PER-', 'PRN-')
      : (personnel_id.startsWith('PRN-') ? personnel_id.replace('PRN-', 'PER-') : personnel_id);

    const result = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1 OR personnel_id = $2 LIMIT 1`,
      [personnel_id, altId]
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
    
    let schoolId = '108348';
    if (personRes.rows.length > 0) {
      schoolId = personRes.rows[0].school_id;
    } else {
      const idParts = String(personnel_id).split('-');
      schoolId = idParts.length > 1 ? idParts[1] : '108348';
      const cleanSchoolId = schoolId.replace('SCH-', '');
      const tableName = ['199998', '199997'].includes(cleanSchoolId) ? 'esf7_database_dummy' : 'esf7_database';
      
      const { Pool } = require('pg');
      const poolString = process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
        : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
      const insightEdPool = new Pool({
        connectionString: poolString,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      });
      
      const seqIndex = idParts.length > 2 ? parseInt(idParts[2], 10) - 1 : 0;
      const masterRows = await insightEdPool.query(
        `SELECT * FROM ${tableName} WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1`,
        [cleanSchoolId]
      ).catch(() => ({ rows: [] }));
      await insightEdPool.end().catch(() => {});
      
      const masterRow = masterRows.rows[seqIndex] || masterRows.rows[0] || {};
      const fName = masterRow.first || masterRow.first_name || 'TEACHER';
      const lName = masterRow.last || masterRow.last_name || 'STAFF';
      const prn = masterRow.prn || String(personnel_id).replace('PER-', 'PRN-');

      await db.query(
        `INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, type, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, 'SY 26-27', 'teaching', $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [personnel_id, prn, schoolId, fName, lName]
      ).catch(() => {});
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_learning_areas`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const laId = `LA-${schoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, raw_payload, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
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
