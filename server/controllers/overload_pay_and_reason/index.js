const express = require('express');
const router = express.Router();
const db = require('../../db');

const VALID_REASONS = [
  'Teacher Shortage',
  'Relieving Duty',
  'Remediation or Enhancement Class',
  'Class Advising Duty'
];

function formatOverloadPayRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    term: row.term,
    month: row.month,
    overloadHours: Number(row.overload_hours || 0),
    overload_hours: Number(row.overload_hours || 0),
    overloadPay: Number(row.overload_pay || 0),
    overload_pay: Number(row.overload_pay || 0),
    netTermPay: Number(row.net_term_pay || 0),
    net_term_pay: Number(row.net_term_pay || 0),
    reasons: Array.isArray(row.reasons) ? row.reasons : ['Teacher Shortage'],
    rawPayload: raw
  };
}

// GET /api/overload-pay-and-reason
// Retrieves all overload pay and reason records (or mapped by personnel_id)
router.get('/', async (req, res) => {
  try {
    const { schoolYear, school_year, term, month, personnel_id, personnelId } = req.query;
    const targetSy = schoolYear || school_year || '2026-2027';

    let query = `SELECT * FROM overload_pay_and_reason WHERE school_year = $1 OR school_year = 'SY 26-27'`;
    const values = [targetSy];
    let counter = 2;

    if (term) {
      query += ` AND term = $${counter}`;
      values.push(term);
      counter++;
    }

    if (month) {
      query += ` AND month = $${counter}`;
      values.push(month);
      counter++;
    }

    if (personnel_id || personnelId) {
      query += ` AND personnel_id = $${counter}`;
      values.push(personnel_id || personnelId);
      counter++;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, values);
    const records = result.rows.map(formatOverloadPayRecord);

    const reasonsMap = {};
    records.forEach(r => {
      reasonsMap[r.personnel_id] = r.reasons;
    });

    res.json({
      success: true,
      schoolYear: targetSy,
      term,
      month,
      data: reasonsMap,
      raw: records
    });
  } catch (err) {
    console.error('[OverloadPayAndReason GET Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/overload-pay-and-reason/save
// Body: { personnelId, schoolYear, term, month, overloadHours, overloadPay, netTermPay, reasons }
router.post('/save', async (req, res) => {
  try {
    const {
      personnelId, personnel_id,
      schoolYear = '2026-2027', school_year,
      term = 'Term 1',
      month = 'All',
      overloadHours = 0, overload_hours,
      overloadPay = 0, overload_pay,
      netTermPay = 0, net_term_pay,
      reasons
    } = req.body;

    const targetPersonnelId = personnelId || personnel_id;
    if (!targetPersonnelId) {
      return res.status(400).json({ success: false, error: 'personnelId is required.' });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId]
    );
    const targetSchoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';
    const targetSy = schoolYear || school_year || '2026-2027';

    const cleanedReasons = Array.isArray(reasons) && reasons.length > 0 
      ? reasons.filter(r => VALID_REASONS.includes(r))
      : ['Teacher Shortage'];

    const countRes = await db.query(`SELECT COUNT(*) FROM overload_pay_and_reason`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const oprId = req.body.id || `OPR-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const sql = `
      INSERT INTO overload_pay_and_reason (
        id, personnel_id, school_id, school_year, term, month,
        overload_hours, overload_pay, net_term_pay, reasons, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      ON CONFLICT (personnel_id, school_year, term, month)
      DO UPDATE SET
        overload_hours = EXCLUDED.overload_hours,
        overload_pay = EXCLUDED.overload_pay,
        net_term_pay = EXCLUDED.net_term_pay,
        reasons = EXCLUDED.reasons,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      oprId,
      targetPersonnelId,
      targetSchoolId,
      targetSy,
      term,
      month,
      overloadHours || overload_hours || 0,
      overloadPay || overload_pay || 0,
      netTermPay || net_term_pay || 0,
      JSON.stringify(cleanedReasons),
      JSON.stringify(req.body)
    ]);

    res.json({
      success: true,
      message: `Saved overload pay and reasons for ${targetPersonnelId}`,
      record: formatOverloadPayRecord(result.rows[0])
    });
  } catch (err) {
    console.error('[OverloadPayAndReason SAVE Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
