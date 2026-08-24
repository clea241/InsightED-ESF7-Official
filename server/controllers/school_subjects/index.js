const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function formatSchoolSubjectRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    subjectName: row.subject_name,
    subject_name: row.subject_name,
    name: row.subject_name,
    keyStage: row.key_stage,
    key_stage: row.key_stage,
    band: row.key_stage,
    gradeLevel: row.grade_level || 'All',
    grade_level: row.grade_level || 'All',
    shsCategory: row.shs_category || null,
    shs_category: row.shs_category || null,
    isCustom: !!row.is_custom,
    is_custom: !!row.is_custom,
    isActive: !!row.is_active,
    is_active: !!row.is_active,
    rawPayload: raw
  };
}

// GET custom school subjects from esf7_school_subjects
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '108348';
    const result = await db.query(
      `SELECT * FROM esf7_school_subjects WHERE (school_id = $1 OR school_id = $2) AND is_active = TRUE ORDER BY created_at ASC`,
      [schoolId, schoolId.replace('SCH-', '')]
    );
    res.json(result.rows.map(formatSchoolSubjectRecord));
  } catch (err) {
    console.error('Error fetching esf7_school_subjects:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Add custom subject into esf7_school_subjects
router.post('/', async (req, res) => {
  try {
    const {
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      subject_name, subjectName, name,
      key_stage, keyStage, band,
      grade_level, gradeLevel,
      shs_category, shsCategory
    } = req.body;

    const targetSchoolId = school_id || bodySchoolId || '108348';
    const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';
    const targetSubjectName = (subject_name || subjectName || name || '').toUpperCase().trim();
    const targetKeyStage = key_stage || keyStage || band || 'Elementary';

    if (!targetSubjectName) {
      return res.status(400).json({ error: 'subject_name is required' });
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_school_subjects`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const subId = req.body.id || `SUB-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_school_subjects (
        id, school_id, school_year, subject_name, key_stage, grade_level, shs_category,
        is_custom, is_active, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE, $8::jsonb)
      ON CONFLICT (school_id, school_year, key_stage, subject_name) DO UPDATE SET
        grade_level = EXCLUDED.grade_level,
        shs_category = EXCLUDED.shs_category,
        is_active = TRUE,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      subId,
      targetSchoolId,
      targetSchoolYear,
      targetSubjectName,
      targetKeyStage,
      grade_level || gradeLevel || 'All',
      shs_category || shsCategory || null,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatSchoolSubjectRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_school_subjects:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a custom subject from esf7_school_subjects
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_school_subjects WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `School subject ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
