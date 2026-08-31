const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function formatRegularRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total = row.number_of_learners !== null && row.number_of_learners !== undefined ? Number(row.number_of_learners) : (m + f);

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
    adviserId: row.adviser_id ? String(row.adviser_id) : null,
    adviser_id: row.adviser_id ? String(row.adviser_id) : null,
    advisorId: row.adviser_id ? String(row.adviser_id) : null,
    advisor_id: row.adviser_id ? String(row.adviser_id) : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    numberOfLearners: total,
    number_of_learners: total,
    rawPayload: raw
  };
}

function formatAralRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total = row.total_learners !== null && row.total_learners !== undefined ? Number(row.total_learners) : (m + f);

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    basisType: row.basis_type || 'grade',
    basis_type: row.basis_type || 'grade',
    gradeLevel: row.grade_level,
    grade_level: row.grade_level,
    assessmentTool: row.assessment_tool || null,
    assessment_tool: row.assessment_tool || null,
    profileLevel: row.profile_level || null,
    profile_level: row.profile_level || null,
    sectionName: row.section_name,
    section_name: row.section_name,
    tutorId: row.tutor_id ? String(row.tutor_id) : null,
    tutor_id: row.tutor_id ? String(row.tutor_id) : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    totalLearners: total,
    total_learners: total,
    numberOfLearners: total,
    rawPayload: raw
  };
}

function formatRemedialRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total = row.total_learners !== null && row.total_learners !== undefined ? Number(row.total_learners) : (m + f);

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    interventionType: row.intervention_type || 'REMEDIAL',
    intervention_type: row.intervention_type || 'REMEDIAL',
    sectionType: row.intervention_type || 'REMEDIAL',
    section_type: row.intervention_type || 'REMEDIAL',
    gradeLevel: row.grade_level,
    grade_level: row.grade_level,
    sectionName: row.section_name,
    section_name: row.section_name,
    assignedTeacherId: row.assigned_teacher_id ? String(row.assigned_teacher_id) : null,
    assigned_teacher_id: row.assigned_teacher_id ? String(row.assigned_teacher_id) : null,
    adviserId: row.assigned_teacher_id ? String(row.assigned_teacher_id) : null,
    adviser_id: row.assigned_teacher_id ? String(row.assigned_teacher_id) : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    totalLearners: total,
    total_learners: total,
    numberOfLearners: total,
    rawPayload: raw
  };
}

// GET all sections across 3 tables
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '108348';
    const cleanSchoolId = schoolId.replace('SCH-', '');

    const [regRes, aralRes, remRes] = await Promise.all([
      db.query(`SELECT * FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`, [schoolId, cleanSchoolId]),
      db.query(`SELECT * FROM esf7_aral_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`, [schoolId, cleanSchoolId]),
      db.query(`SELECT * FROM esf7_remedial_enrichment_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`, [schoolId, cleanSchoolId])
    ]);

    const regularSections = regRes.rows.map(formatRegularRecord);
    const aralSections = aralRes.rows.map(formatAralRecord);
    const remedialEnrichmentSections = remRes.rows.map(formatRemedialRecord);

    res.json({
      success: true,
      regularSections,
      aralSections,
      remedialEnrichmentSections,
      // Flat list for backward compatibility
      allSections: [...regularSections, ...aralSections, ...remedialEnrichmentSections]
    });
  } catch (err) {
    console.error('Error fetching section tables:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /regular - Insert/Update Regular Section
router.post('/regular', async (req, res) => {
  const {
    id, school_id, schoolId: bodySchoolId, school_year, schoolYear: bodySchoolYear,
    grade_level, gradeLevel, section_name, sectionName,
    adviser_id, advisor_id, advisorId, adviserId,
    section_type, sectionType,
    male_learners, maleLearners, female_learners, femaleLearners, number_of_learners, numberOfLearners
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || '108348';
  const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';
  const targetGradeLevel = grade_level || gradeLevel || 'Grade 1';
  const targetSectionName = (section_name || sectionName || 'SECTION 1').toUpperCase().trim();
  const targetAdviserId = adviser_id || advisor_id || advisorId || adviserId || null;
  const targetType = section_type || sectionType || 'MONO GRADE';

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal = number_of_learners !== undefined ? number_of_learners : numberOfLearners;
  const totalLearners = rawTotal !== undefined && rawTotal !== null && rawTotal !== '' ? Number(rawTotal) : (mVal + fVal);

  try {
    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_regular_sections WHERE school_id = $1`, [targetSchoolId]);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const secId = id || `REG-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    let validAdviserId = null;
    if (targetAdviserId) {
      const pCheck = await db.query(`SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`, [targetAdviserId]);
      if (pCheck.rows.length > 0) validAdviserId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_regular_sections (
        id, school_id, school_year, grade_level, section_name, section_type,
        adviser_id, male_learners, female_learners, number_of_learners, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
        adviser_id = COALESCE(EXCLUDED.adviser_id, esf7_regular_sections.adviser_id),
        section_type = EXCLUDED.section_type,
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        number_of_learners = EXCLUDED.number_of_learners,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId, targetSchoolId, targetSchoolYear, targetGradeLevel, targetSectionName, targetType,
      validAdviserId, mVal, fVal, totalLearners, JSON.stringify(req.body)
    ]);
    res.status(201).json(formatRegularRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_regular_sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /aral - Insert/Update ARAL Section
router.post('/aral', async (req, res) => {
  const {
    id, school_id, schoolId: bodySchoolId, school_year, schoolYear: bodySchoolYear,
    basis_type, basisType, grade_level, gradeLevel, assessment_tool, assessmentTool,
    profile_level, profileLevel, section_name, sectionName, tutor_id, tutorId,
    male_learners, maleLearners, female_learners, femaleLearners, total_learners, totalLearners
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || '108348';
  const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';
  const targetBasis = basis_type || basisType || 'grade';
  const targetGrade = grade_level || gradeLevel || 'Grade 3';
  const targetTool = assessment_tool || assessmentTool || null;
  const targetProfile = profile_level || profileLevel || null;
  const targetName = section_name || sectionName || `ARAL Section`;
  const targetTutorId = tutor_id || tutorId || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal = total_learners !== undefined ? total_learners : totalLearners;
  const computedTotal = rawTotal !== undefined && rawTotal !== null && rawTotal !== '' ? Number(rawTotal) : (mVal + fVal);

  try {
    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_aral_sections WHERE school_id = $1`, [targetSchoolId]);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const secId = id || `ARAL-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    let validTutorId = null;
    if (targetTutorId) {
      const pCheck = await db.query(`SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`, [targetTutorId]);
      if (pCheck.rows.length > 0) validTutorId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_aral_sections (
        id, school_id, school_year, basis_type, grade_level, assessment_tool,
        profile_level, section_name, tutor_id, male_learners, female_learners, total_learners, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        basis_type = EXCLUDED.basis_type,
        grade_level = EXCLUDED.grade_level,
        assessment_tool = EXCLUDED.assessment_tool,
        profile_level = EXCLUDED.profile_level,
        section_name = EXCLUDED.section_name,
        tutor_id = EXCLUDED.tutor_id,
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        total_learners = EXCLUDED.total_learners,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId, targetSchoolId, targetSchoolYear, targetBasis, targetGrade, targetTool,
      targetProfile, targetName, validTutorId, mVal, fVal, computedTotal, JSON.stringify(req.body)
    ]);
    res.status(201).json(formatAralRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_aral_sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /remedial-enrichment - Insert/Update Remedial/Enrichment Section
router.post('/remedial-enrichment', async (req, res) => {
  const {
    id, school_id, schoolId: bodySchoolId, school_year, schoolYear: bodySchoolYear,
    intervention_type, interventionType, section_type, sectionType,
    grade_level, gradeLevel, section_name, sectionName,
    assigned_teacher_id, assignedTeacherId, adviser_id, adviserId,
    male_learners, maleLearners, female_learners, femaleLearners, total_learners, totalLearners
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || '108348';
  const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';
  const targetIntervention = intervention_type || interventionType || section_type || sectionType || 'REMEDIAL';
  const targetGrade = grade_level || gradeLevel || 'Grade 1';
  const targetName = (section_name || sectionName || `${targetIntervention} SECTION`).toUpperCase().trim();
  const targetTeacherId = assigned_teacher_id || assignedTeacherId || adviser_id || adviserId || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal = total_learners !== undefined ? total_learners : totalLearners;
  const computedTotal = rawTotal !== undefined && rawTotal !== null && rawTotal !== '' ? Number(rawTotal) : (mVal + fVal);

  try {
    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_remedial_enrichment_sections WHERE school_id = $1`, [targetSchoolId]);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const secId = id || `REM-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    let validTeacherId = null;
    if (targetTeacherId) {
      const pCheck = await db.query(`SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`, [targetTeacherId]);
      if (pCheck.rows.length > 0) validTeacherId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_remedial_enrichment_sections (
        id, school_id, school_year, intervention_type, grade_level, section_name,
        assigned_teacher_id, male_learners, female_learners, total_learners, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        intervention_type = EXCLUDED.intervention_type,
        grade_level = EXCLUDED.grade_level,
        section_name = EXCLUDED.section_name,
        assigned_teacher_id = EXCLUDED.assigned_teacher_id,
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        total_learners = EXCLUDED.total_learners,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId, targetSchoolId, targetSchoolYear, targetIntervention, targetGrade, targetName,
      validTeacherId, mVal, fVal, computedTotal, JSON.stringify(req.body)
    ]);
    res.status(201).json(formatRemedialRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_remedial_enrichment_sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE endpoints for each table category
router.delete('/regular/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_regular_sections WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Regular section ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/aral/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_aral_sections WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `ARAL section ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/remedial-enrichment/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_remedial_enrichment_sections WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Remedial section ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /clear-all — Remove all sections for a school
router.delete('/clear-all', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '108348';
    const cleanSchoolId = String(schoolId).replace('SCH-', '').trim();

    await Promise.all([
      db.query(`DELETE FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, cleanSchoolId]).catch(() => {}),
      db.query(`DELETE FROM esf7_aral_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, cleanSchoolId]).catch(() => {}),
      db.query(`DELETE FROM esf7_remedial_enrichment_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, cleanSchoolId]).catch(() => {}),
      db.query(`DELETE FROM esf7_class_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, cleanSchoolId]).catch(() => {}),
      db.query(`DELETE FROM class_sections WHERE school_id = $1 OR school_id = $2`, [schoolId, cleanSchoolId]).catch(() => {})
    ]);

    res.json({ success: true, message: `All class sections for school ${schoolId} cleared successfully.` });
  } catch (err) {
    console.error('Error clearing class sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generic DELETE endpoint (checks all section tables)
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await Promise.all([
      db.query(`DELETE FROM esf7_regular_sections WHERE id = $1`, [id]).catch(() => {}),
      db.query(`DELETE FROM esf7_aral_sections WHERE id = $1`, [id]).catch(() => {}),
      db.query(`DELETE FROM esf7_remedial_enrichment_sections WHERE id = $1`, [id]).catch(() => {}),
      db.query(`DELETE FROM esf7_class_sections WHERE id = $1`, [id]).catch(() => {}),
      db.query(`DELETE FROM class_sections WHERE id = $1`, [id]).catch(() => {})
    ]);
    res.json({ success: true, message: `Section ${id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
