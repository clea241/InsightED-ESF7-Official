const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function computeSectionStandard(gradeLevel, totalLearners) {
  const total = Number(totalLearners) || 0;
  const g = String(gradeLevel || '').toUpperCase().trim();

  if (g.includes('KINDER')) {
    if (total < 15) return 'BELOW STANDARD';
    if (total <= 25) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  if (['GRADE 1', 'GRADE 2', 'GRADE 3', 'G1', 'G2', 'G3'].some(k => g === k || g.includes(k))) {
    if (total < 25) return 'BELOW STANDARD';
    if (total <= 35) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  if (['GRADE 4', 'GRADE 5', 'GRADE 6', 'G4', 'G5', 'G6'].some(k => g === k || g.includes(k))) {
    if (total < 30) return 'BELOW STANDARD';
    if (total <= 45) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  if (['GRADE 7', 'GRADE 8', 'GRADE 9', 'GRADE 10', 'G7', 'G8', 'G9', 'G10', 'JHS'].some(k => g === k || g.includes(k))) {
    if (total < 35) return 'BELOW STANDARD';
    if (total <= 45) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  if (['GRADE 11', 'GRADE 12', 'G11', 'G12', 'SHS'].some(k => g === k || g.includes(k))) {
    if (total < 30) return 'BELOW STANDARD';
    if (total <= 40) return 'WITHIN STANDARD';
    return 'ABOVE STANDARD';
  }

  if (total < 35) return 'BELOW STANDARD';
  if (total <= 45) return 'WITHIN STANDARD';
  return 'ABOVE STANDARD';
}

function formatSectionRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total = row.number_of_learners !== null && row.number_of_learners !== undefined ? Number(row.number_of_learners) : (m + f);
  const evaluatedStandard = row.standard || computeSectionStandard(row.grade_level, total);

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level,
    grade_level: row.grade_level,
    sectionName: row.section_name,
    section_name: row.section_name,
    sectionType: row.section_type || 'MONO GRADE',
    section_type: row.section_type || 'MONO GRADE',
    advisorId: row.advisor_id ? String(row.advisor_id) : null,
    advisor_id: row.advisor_id ? String(row.advisor_id) : null,
    adviserId: row.advisor_id ? String(row.advisor_id) : null,
    adviser_id: row.advisor_id ? String(row.advisor_id) : null,
    advisoryMinutes: Number(row.advisory_minutes || 300),
    advisory_minutes: Number(row.advisory_minutes || 300),
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    numberOfLearners: total,
    number_of_learners: total,
    standard: evaluatedStandard,
    rawPayload: raw
  };
}

// GET all class sections from esf7_class_sections
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '108348';
    const result = await db.query(
      `SELECT * FROM esf7_class_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`,
      [schoolId, schoolId.replace('SCH-', '')]
    );
    res.json(result.rows.map(formatSectionRecord));
  } catch (err) {
    console.error('Error fetching esf7_class_sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single section by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM esf7_class_sections WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }
    res.json(formatSectionRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Add a new class section into esf7_class_sections
router.post('/', async (req, res) => {
  const {
    school_id, schoolId: bodySchoolId, school_year, schoolYear: bodySchoolYear,
    grade_level, gradeLevel, section_name, sectionName,
    adviser_id, advisor_id, advisorId,
    section_type, sectionType,
    advisory_minutes, advisoryMinutes,
    male_learners, maleLearners, female_learners, femaleLearners,
    number_of_learners, numberOfLearners,
    standard: inputStandard
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || '108348';
  const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';
  const targetGradeLevel = grade_level || gradeLevel || 'Grade 1';
  const targetSectionName = (section_name || sectionName || 'SECTION 1').toUpperCase().trim();
  const targetAdvisorId = adviser_id || advisor_id || advisorId || null;
  const targetType = section_type || sectionType || 'MONO GRADE';
  const advMins = Number(advisory_minutes || advisoryMinutes || 300);

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal = number_of_learners !== undefined ? number_of_learners : numberOfLearners;
  const totalLearners = rawTotal !== undefined && rawTotal !== null && rawTotal !== '' ? Number(rawTotal) : (mVal + fVal);
  const evaluatedStandard = inputStandard || computeSectionStandard(targetGradeLevel, totalLearners);

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM esf7_class_sections WHERE school_id = $1`,
      [targetSchoolId]
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const secId = req.body.id || `SEC-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    // Verify advisor ID exists in esf7_personnel_profile if provided
    let validAdvisorId = null;
    if (targetAdvisorId) {
      const pCheck = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetAdvisorId]
      );
      if (pCheck.rows.length > 0) {
        validAdvisorId = pCheck.rows[0].id;
      }
    }

    const query = `
      INSERT INTO esf7_class_sections (
        id, school_id, school_year, grade_level, section_name, section_type,
        advisor_id, advisory_minutes, male_learners, female_learners, number_of_learners,
        standard, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
        advisor_id = COALESCE(EXCLUDED.advisor_id, esf7_class_sections.advisor_id),
        section_type = EXCLUDED.section_type,
        advisory_minutes = EXCLUDED.advisory_minutes,
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        number_of_learners = EXCLUDED.number_of_learners,
        standard = EXCLUDED.standard,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      secId,
      targetSchoolId,
      targetSchoolYear,
      targetGradeLevel,
      targetSectionName,
      targetType,
      validAdvisorId,
      advMins,
      mVal,
      fVal,
      totalLearners,
      evaluatedStandard,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatSectionRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_class_sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Update details of a class section
router.put('/:id', async (req, res) => {
  const targetId = req.params.id;
  const {
    grade_level, gradeLevel, section_name, sectionName,
    adviser_id, advisor_id, advisorId,
    section_type, sectionType,
    advisory_minutes, advisoryMinutes,
    male_learners, maleLearners, female_learners, femaleLearners,
    number_of_learners, numberOfLearners,
    standard: inputStandard
  } = req.body;

  try {
    const existingRes = await db.query(`SELECT * FROM esf7_class_sections WHERE id = $1 LIMIT 1`, [targetId]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const existingRow = existingRes.rows[0];
    const targetGrade = grade_level || gradeLevel || existingRow.grade_level;
    const targetName = (section_name || sectionName || existingRow.section_name).toUpperCase().trim();
    const targetType = section_type || sectionType || existingRow.section_type;
    const targetAdvisorId = adviser_id !== undefined ? adviser_id : (advisor_id !== undefined ? advisor_id : (advisorId !== undefined ? advisorId : existingRow.advisor_id));

    const mVal = male_learners !== undefined ? Number(male_learners) : (maleLearners !== undefined ? Number(maleLearners) : Number(existingRow.male_learners || 0));
    const fVal = female_learners !== undefined ? Number(female_learners) : (femaleLearners !== undefined ? Number(femaleLearners) : Number(existingRow.female_learners || 0));
    const rawTotal = number_of_learners !== undefined ? number_of_learners : numberOfLearners;
    const totalLearners = rawTotal !== undefined && rawTotal !== null && rawTotal !== '' ? Number(rawTotal) : (mVal + fVal);
    const evaluatedStandard = inputStandard || computeSectionStandard(targetGrade, totalLearners);

    let validAdvisorId = null;
    if (targetAdvisorId) {
      const pCheck = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetAdvisorId]
      );
      if (pCheck.rows.length > 0) {
        validAdvisorId = pCheck.rows[0].id;
      }
    }

    const query = `
      UPDATE esf7_class_sections
      SET
        grade_level = $1,
        section_name = $2,
        section_type = $3,
        advisor_id = $4,
        male_learners = $5,
        female_learners = $6,
        number_of_learners = $7,
        standard = $8,
        raw_payload = $9::jsonb,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *;
    `;

    const values = [
      targetGrade,
      targetName,
      targetType,
      validAdvisorId,
      mVal,
      fVal,
      totalLearners,
      evaluatedStandard,
      JSON.stringify({ ...(existingRow.raw_payload || {}), ...req.body }),
      targetId
    ];

    const result = await db.query(query, values);
    res.json(formatSectionRecord(result.rows[0]));
  } catch (err) {
    console.error('Error updating esf7_class_sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a class section
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_class_sections WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Class section ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
