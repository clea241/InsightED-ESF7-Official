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
 */
router.get('/', async (req, res) => {
  try {
    const schoolYear = req.query.schoolYear || '2026-2027';
    const term = req.query.term || 'Term 1';

    const result = await db.query(
      `SELECT personnel_id, school_year, term, reasons, updated_at
       FROM overload_pay_and_reason
       WHERE (school_year = $1 OR school_year = 'SY 26-27') AND (term = $2 OR term = 'Term 1')`,
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
 */
router.post('/save', async (req, res) => {
  try {
    const { personnelId, schoolYear = '2026-2027', term = 'Term 1', month = 'All', reasons } = req.body;

    if (!personnelId) {
      return res.status(400).json({ success: false, error: 'personnelId is required.' });
    }

    if (!Array.isArray(reasons) || reasons.length < 1) {
      return res.status(400).json({ success: false, error: 'At least 1 overload reason is required.' });
    }

    const cleanedReasons = reasons.filter(r => VALID_REASONS.includes(r));
    if (cleanedReasons.length === 0) {
      return res.status(400).json({ success: false, error: `Invalid reasons provided. Valid options: ${VALID_REASONS.join(', ')}` });
    }

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnelId]
    );
    const targetSchoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';

    const countRes = await db.query(`SELECT COUNT(*) FROM overload_pay_and_reason`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const oprId = `OPR-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const sql = `
      INSERT INTO overload_pay_and_reason (id, personnel_id, school_id, school_year, term, month, reasons, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      ON CONFLICT (personnel_id, school_year, term, month)
      DO UPDATE SET reasons = EXCLUDED.reasons, updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [oprId, personnelId, targetSchoolId, schoolYear, term, month, JSON.stringify(cleanedReasons)]);

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
