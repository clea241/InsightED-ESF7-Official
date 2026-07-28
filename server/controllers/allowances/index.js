const express = require('express');
const router = express.Router();
const db = require('../../db');

const ALLOWED_KEYS = ['pera', 'uniform', 'supplies', 'medical', 'hardship', 'overload'];

/**
 * GET /api/allowances
 * Query params: schoolYear (optional, defaults to 'SY 26-27')
 * Returns array of allowance records mapped by personnel_id
 */
router.get('/', async (req, res) => {
  try {
    const schoolYear = req.query.schoolYear || 'SY 26-27';
    const result = await db.query(
      `SELECT personnel_id, school_year, pera, uniform, supplies, medical, hardship, overload, updated_at
       FROM personnel_allowances
       WHERE school_year = $1`,
      [schoolYear]
    );

    // Map by personnel_id for quick client lookup
    const allowancesMap = {};
    result.rows.forEach(row => {
      allowancesMap[row.personnel_id] = {
        pera: Boolean(row.pera),
        uniform: Boolean(row.uniform),
        supplies: Boolean(row.supplies),
        medical: Boolean(row.medical),
        hardship: Boolean(row.hardship),
        overload: Boolean(row.overload)
      };
    });

    res.json({
      success: true,
      schoolYear,
      data: allowancesMap,
      raw: result.rows
    });
  } catch (error) {
    console.error('[Allowances GET Error]:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch personnel allowances.' });
  }
});

/**
 * POST /api/allowances/toggle
 * Body: { personnelId, allowanceKey, isGranted, schoolYear }
 * Atomic UPSERT toggle for a single boolean allowance flag
 */
router.post('/toggle', async (req, res) => {
  try {
    const { personnelId, allowanceKey, isGranted, schoolYear = 'SY 26-27' } = req.body;

    if (!personnelId || !allowanceKey) {
      return res.status(400).json({ success: false, error: 'personnelId and allowanceKey are required.' });
    }

    const keyLower = String(allowanceKey).toLowerCase();
    if (!ALLOWED_KEYS.includes(keyLower)) {
      return res.status(400).json({ success: false, error: `Invalid allowanceKey. Allowed keys: ${ALLOWED_KEYS.join(', ')}` });
    }

    const grantedBool = Boolean(isGranted);

    // Upsert query with dynamic column update
    const sql = `
      INSERT INTO personnel_allowances (personnel_id, school_year, ${keyLower}, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (personnel_id, school_year)
      DO UPDATE SET ${keyLower} = EXCLUDED.${keyLower}, updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [personnelId, schoolYear, grantedBool]);

    res.json({
      success: true,
      message: `Updated ${keyLower} allowance to ${grantedBool} for personnel ${personnelId}`,
      record: result.rows[0]
    });
  } catch (error) {
    console.error('[Allowances Toggle Error]:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update allowance status.' });
  }
});

/**
 * POST /api/allowances/bulk
 * Body: { personnelId, allowances: { pera, uniform, ... }, schoolYear }
 * Updates all boolean flags for a teacher at once
 */
router.post('/bulk', async (req, res) => {
  try {
    const { personnelId, allowances = {}, schoolYear = 'SY 26-27' } = req.body;

    if (!personnelId) {
      return res.status(400).json({ success: false, error: 'personnelId is required.' });
    }

    const pera = Boolean(allowances.pera);
    const uniform = Boolean(allowances.uniform);
    const supplies = Boolean(allowances.supplies);
    const medical = Boolean(allowances.medical);
    const hardship = Boolean(allowances.hardship);
    const overload = Boolean(allowances.overload);

    const sql = `
      INSERT INTO personnel_allowances 
        (personnel_id, school_year, pera, uniform, supplies, medical, hardship, overload, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (personnel_id, school_year)
      DO UPDATE SET 
        pera = EXCLUDED.pera,
        uniform = EXCLUDED.uniform,
        supplies = EXCLUDED.supplies,
        medical = EXCLUDED.medical,
        hardship = EXCLUDED.hardship,
        overload = EXCLUDED.overload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      personnelId,
      schoolYear,
      pera,
      uniform,
      supplies,
      medical,
      hardship,
      overload
    ]);

    res.json({
      success: true,
      record: result.rows[0]
    });
  } catch (error) {
    console.error('[Allowances Bulk Error]:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update personnel allowances.' });
  }
});

module.exports = router;
