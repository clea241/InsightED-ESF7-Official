const express = require('express');
const router = express.Router();
const db = require('../../db');

const VALID_REASONS = [
  'Teacher Shortage',
  'Relieving Duty',
  'Remediation or Enhancement Class',
  'Class Advising Duty'
];

/**
 * GET /api/overload-reasons
 * Query params: schoolYear (optional, defaults to 'SY 26-27'), term (optional, defaults to 'Term 1')
 * Returns object mapping personnel_id -> array of reason strings
 */
router.get('/', async (req, res) => {
  try {
    const schoolYear = req.query.schoolYear || 'SY 26-27';
    const term = req.query.term || 'Term 1';

    const result = await db.query(
      `SELECT personnel_id, school_year, term, reasons, updated_at
       FROM overload_reasons
       WHERE school_year = $1 AND term = $2`,
      [schoolYear, term]
    );

    const reasonsMap = {};
    result.rows.forEach(row => {
      reasonsMap[row.personnel_id] = Array.isArray(row.reasons) ? row.reasons : ['Teacher Shortage'];
    });

    res.json({
      success: true,
      schoolYear,
      term,
      data: reasonsMap,
      raw: result.rows
    });
  } catch (error) {
    console.error('[Overload Reasons GET Error]:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch overload reasons.' });
  }
});

/**
 * POST /api/overload-reasons/save
 * Body: { personnelId, schoolYear, term, reasons }
 * UPSERT endpoint to save overload reasons for a teacher
 */
router.post('/save', async (req, res) => {
  try {
    const { personnelId, schoolYear = 'SY 26-27', term = 'Term 1', reasons } = req.body;

    if (!personnelId) {
      return res.status(400).json({ success: false, error: 'personnelId is required.' });
    }

    // Check if personnel exists in database (handle draft / local temporary personnel gracefully)
    const personCheck = await db.query('SELECT id FROM personnel WHERE id = $1', [personnelId]);
    if (personCheck.rows.length === 0) {
      return res.json({
        success: true,
        message: 'Draft personnel reason updated locally.',
        data: { personnel_id: personnelId, school_year: schoolYear, term, reasons }
      });
    }

    if (!Array.isArray(reasons) || reasons.length < 1) {
      return res.status(400).json({ success: false, error: 'At least 1 overload reason is required.' });
    }

    // Filter to ensure only valid allowed reasons are stored
    const cleanedReasons = reasons.filter(r => VALID_REASONS.includes(r));
    if (cleanedReasons.length === 0) {
      return res.status(400).json({ success: false, error: `Invalid reasons provided. Valid options: ${VALID_REASONS.join(', ')}` });
    }

    const sql = `
      INSERT INTO overload_reasons (personnel_id, school_year, term, reasons, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (personnel_id, school_year, term)
      DO UPDATE SET reasons = EXCLUDED.reasons, updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [personnelId, schoolYear, term, cleanedReasons]);

    res.json({
      success: true,
      message: `Saved overload reasons for ${personnelId}`,
      record: result.rows[0]
    });
  } catch (error) {
    console.error('[Overload Reasons SAVE Error]:', error.message);
    res.status(500).json({ success: false, error: 'Failed to save overload reasons.' });
  }
});

module.exports = router;
