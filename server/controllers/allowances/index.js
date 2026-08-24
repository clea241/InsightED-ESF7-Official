const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

const ALLOWED_KEYS = ['pera', 'uniform', 'supplies', 'medical', 'hardship'];

const DEFAULT_AMOUNTS = {
  pera: 2000.00,
  uniform: 7000.00,
  supplies: 10000.00,
  medical: 7000.00,
  hardship: 0.00
};

function formatAllowanceRecord(row) {
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
    
    // Booleans & Amounts
    pera: !!row.has_pera,
    has_pera: !!row.has_pera,
    hasPera: !!row.has_pera,
    pera_amount: Number(row.pera_amount || DEFAULT_AMOUNTS.pera),
    peraAmount: Number(row.pera_amount || DEFAULT_AMOUNTS.pera),
    
    uniform: !!row.has_uniform,
    has_uniform: !!row.has_uniform,
    hasUniform: !!row.has_uniform,
    uniform_amount: Number(row.uniform_amount || DEFAULT_AMOUNTS.uniform),
    uniformAmount: Number(row.uniform_amount || DEFAULT_AMOUNTS.uniform),
    
    supplies: !!row.has_supplies,
    has_supplies: !!row.has_supplies,
    hasSupplies: !!row.has_supplies,
    supplies_amount: Number(row.supplies_amount || DEFAULT_AMOUNTS.supplies),
    suppliesAmount: Number(row.supplies_amount || DEFAULT_AMOUNTS.supplies),
    
    medical: !!row.has_medical,
    has_medical: !!row.has_medical,
    hasMedical: !!row.has_medical,
    medical_amount: Number(row.medical_amount || DEFAULT_AMOUNTS.medical),
    medicalAmount: Number(row.medical_amount || DEFAULT_AMOUNTS.medical),
    
    hardship: !!row.has_hardship,
    has_hardship: !!row.has_hardship,
    hasHardship: !!row.has_hardship,
    hardship_amount: Number(row.hardship_amount || DEFAULT_AMOUNTS.hardship),
    hardshipAmount: Number(row.hardship_amount || DEFAULT_AMOUNTS.hardship),
    
    rawPayload: raw
  };
}

// GET /api/allowances
// Retrieves all personnel allowance records for school
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '108348';
    const schoolYear = req.query.schoolYear || req.query.school_year || '2026-2027';

    // 1. Fetch all personnel profiles for school
    const personnelRes = await db.query(
      `SELECT id, school_id, school_year FROM esf7_personnel_profile WHERE school_id = $1 OR school_id = $2`,
      [schoolId, schoolId.replace('SCH-', '')]
    );

    // 2. Fetch existing allowances records
    const result = await db.query(
      `SELECT * FROM esf7_personnel_allowances WHERE school_id = $1 OR school_id = $2`,
      [schoolId, schoolId.replace('SCH-', '')]
    );

    const existingMap = {};
    result.rows.forEach(r => {
      existingMap[r.personnel_id] = r;
    });

    const allowancesMap = {};
    const fullRecords = [];

    // Ensure EVERY personnel profile gets an allowance record even if all flags are FALSE
    for (const p of personnelRes.rows) {
      let row = existingMap[p.id];

      if (!row) {
        // Auto-create a default FALSE record for personnel
        const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_allowances`);
        const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
        const alwId = `ALW-${p.school_id.replace('SCH-', '')}-${seq}`;

        const insertRes = await db.query(
          `INSERT INTO esf7_personnel_allowances (
            id, personnel_id, school_id, school_year,
            has_pera, pera_amount, has_uniform, uniform_amount,
            has_supplies, supplies_amount, has_medical, medical_amount,
            has_hardship, hardship_amount, raw_payload
          ) VALUES ($1, $2, $3, $4, FALSE, $5, FALSE, $6, FALSE, $7, FALSE, $8, FALSE, $9, '{}'::jsonb)
           ON CONFLICT (personnel_id, school_year) DO UPDATE SET updated_at = NOW()
           RETURNING *;`,
          [alwId, p.id, p.school_id, schoolYear, DEFAULT_AMOUNTS.pera, DEFAULT_AMOUNTS.uniform, DEFAULT_AMOUNTS.supplies, DEFAULT_AMOUNTS.medical, DEFAULT_AMOUNTS.hardship]
        );
        row = insertRes.rows[0];
      }

      const formatted = formatAllowanceRecord(row);
      allowancesMap[p.id] = {
        pera: formatted.pera,
        uniform: formatted.uniform,
        supplies: formatted.supplies,
        medical: formatted.medical,
        hardship: formatted.hardship,
        pera_amount: formatted.pera_amount,
        uniform_amount: formatted.uniform_amount,
        supplies_amount: formatted.supplies_amount,
        medical_amount: formatted.medical_amount,
        hardship_amount: formatted.hardship_amount
      };
      fullRecords.push(formatted);
    }

    res.json({
      success: true,
      schoolYear,
      data: allowancesMap,
      raw: fullRecords
    });
  } catch (error) {
    console.error('[Allowances GET Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/allowances/toggle
// Body: { personnelId, allowanceKey, isGranted, amount, schoolYear }
router.post('/toggle', async (req, res) => {
  try {
    const { personnelId, allowanceKey, isGranted, amount, schoolYear = '2026-2027' } = req.body;

    if (!personnelId || !allowanceKey) {
      return res.status(400).json({ success: false, error: 'personnelId and allowanceKey are required.' });
    }

    const keyLower = String(allowanceKey).toLowerCase();
    if (!ALLOWED_KEYS.includes(keyLower)) {
      return res.status(400).json({ success: false, error: `Invalid allowanceKey. Allowed keys: ${ALLOWED_KEYS.join(', ')}` });
    }

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnelId]
    );
    const targetSchoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_allowances`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const alwId = `ALW-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const grantedBool = Boolean(isGranted);
    const targetAmount = amount !== undefined && amount !== null ? Number(amount) : (DEFAULT_AMOUNTS[keyLower] || 0);

    const hasCol = `has_${keyLower}`;
    const amtCol = `${keyLower}_amount`;

    const sql = `
      INSERT INTO esf7_personnel_allowances (
        id, personnel_id, school_id, school_year, ${hasCol}, ${amtCol}, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (personnel_id, school_year)
      DO UPDATE SET
        ${hasCol} = EXCLUDED.${hasCol},
        ${amtCol} = COALESCE(EXCLUDED.${amtCol}, esf7_personnel_allowances.${amtCol}),
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      alwId,
      personnelId,
      targetSchoolId,
      schoolYear,
      grantedBool,
      targetAmount,
      JSON.stringify(req.body)
    ]);

    res.json({
      success: true,
      message: `Updated ${keyLower} allowance to ${grantedBool} (Amount: ₱${targetAmount}) for personnel ${personnelId}`,
      record: formatAllowanceRecord(result.rows[0])
    });
  } catch (error) {
    console.error('[Allowances Toggle Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/allowances/bulk
// Body: { personnelId, allowances: { pera, uniform, ... }, amounts: { pera_amount, ... }, schoolYear }
router.post('/bulk', async (req, res) => {
  try {
    const { personnelId, allowances = {}, amounts = {}, schoolYear = '2026-2027' } = req.body;

    if (!personnelId) {
      return res.status(400).json({ success: false, error: 'personnelId is required.' });
    }

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnelId]
    );
    const targetSchoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_allowances`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const alwId = `ALW-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const hasPera = Boolean(allowances.pera || allowances.has_pera);
    const peraAmt = Number(amounts.pera_amount || amounts.peraAmount || DEFAULT_AMOUNTS.pera);

    const hasUniform = Boolean(allowances.uniform || allowances.has_uniform);
    const uniformAmt = Number(amounts.uniform_amount || amounts.uniformAmount || DEFAULT_AMOUNTS.uniform);

    const hasSupplies = Boolean(allowances.supplies || allowances.has_supplies);
    const suppliesAmt = Number(amounts.supplies_amount || amounts.suppliesAmount || DEFAULT_AMOUNTS.supplies);

    const hasMedical = Boolean(allowances.medical || allowances.has_medical);
    const medicalAmt = Number(amounts.medical_amount || amounts.medicalAmount || DEFAULT_AMOUNTS.medical);

    const hasHardship = Boolean(allowances.hardship || allowances.has_hardship);
    const hardshipAmt = Number(amounts.hardship_amount || amounts.hardshipAmount || DEFAULT_AMOUNTS.hardship);

    const sql = `
      INSERT INTO esf7_personnel_allowances (
        id, personnel_id, school_id, school_year,
        has_pera, pera_amount,
        has_uniform, uniform_amount,
        has_supplies, supplies_amount,
        has_medical, medical_amount,
        has_hardship, hardship_amount,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
      ON CONFLICT (personnel_id, school_year)
      DO UPDATE SET
        has_pera = EXCLUDED.has_pera,
        pera_amount = EXCLUDED.pera_amount,
        has_uniform = EXCLUDED.has_uniform,
        uniform_amount = EXCLUDED.uniform_amount,
        has_supplies = EXCLUDED.has_supplies,
        supplies_amount = EXCLUDED.supplies_amount,
        has_medical = EXCLUDED.has_medical,
        medical_amount = EXCLUDED.medical_amount,
        has_hardship = EXCLUDED.has_hardship,
        hardship_amount = EXCLUDED.hardship_amount,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      alwId, personnelId, targetSchoolId, schoolYear,
      hasPera, peraAmt,
      hasUniform, uniformAmt,
      hasSupplies, suppliesAmt,
      hasMedical, medicalAmt,
      hasHardship, hardshipAmt,
      JSON.stringify(req.body)
    ]);

    res.json({
      success: true,
      record: formatAllowanceRecord(result.rows[0])
    });
  } catch (error) {
    console.error('[Allowances Bulk Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
