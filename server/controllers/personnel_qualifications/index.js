const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatEducRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const elList = Array.isArray(row.eligibility) ? row.eligibility : [];

  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    highestEducationalAttainment: row.highest_educational_attainment || (row.college_degree ? 'COLLEGE GRADUATE / BACCALAUREATE' : ''),
    highest_educational_attainment: row.highest_educational_attainment || (row.college_degree ? 'COLLEGE GRADUATE / BACCALAUREATE' : ''),
    shsTrack: row.shs_track || '',
    shs_track: row.shs_track || '',
    vocationalCourse: row.vocational_course || '',
    vocational_course: row.vocational_course || '',
    vocationalLevel: row.vocational_level || '',
    vocational_level: row.vocational_level || '',
    collegeDegree: row.college_degree || '',
    college_degree: row.college_degree || '',
    major: row.major || '',
    minor: row.minor || '',
    postGraduateDegree: row.post_graduate_degree || 'N/A',
    post_graduate_degree: row.post_graduate_degree || 'N/A',
    postGraduateDiscipline: row.post_graduate_discipline || '',
    post_graduate_discipline: row.post_graduate_discipline || '',
    eligibility: elList,
    prcSpecialization: row.prc_specialization || '',
    prc_specialization: row.prc_specialization || '',
    rawPayload: raw
  };
}

// GET education record for a personnel_id
router.get('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM esf7_perssonel_educ WHERE personnel_id = $1 LIMIT 1`,
      [personnel_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Education record not found' });
    }
    res.json(formatEducRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT Upsert education details for a personnel record
router.post('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const {
      highest_educational_attainment, highestEducationalAttainment,
      shs_track, shsTrack,
      vocational_course, vocationalCourse,
      vocational_level, vocationalLevel,
      college_degree, collegeDegree, major, minor,
      post_graduate_degree, postGraduateDegree,
      post_graduate_discipline, postGraduateDiscipline, postGraduateDisciplineCustom,
      eligibility, prc_specialization, prcSpecialization
    } = req.body;

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id]
    );
    const schoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_perssonel_educ`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const eduId = `EDU-${schoolId.replace('SCH-', '')}-${seq}`;

    const eduHighestAttainment = (
      highest_educational_attainment || highestEducationalAttainment ||
      (college_degree || collegeDegree ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'COLLEGE GRADUATE / BACCALAUREATE')
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || '').toUpperCase() || null;
    const eduVocationalCourse = (vocational_course || vocationalCourse || '').toUpperCase() || null;
    const eduVocationalLevel = (vocational_level || vocationalLevel || '').toUpperCase() || null;
    const degree = (college_degree || collegeDegree || '').toUpperCase() || null;
    const maj = (major || '').toUpperCase();
    const min = (minor || '').toUpperCase();
    const postDeg = (post_graduate_degree || postGraduateDegree || 'N/A').toUpperCase();
    const postDisc = (post_graduate_discipline || postGraduateDiscipline || postGraduateDisciplineCustom || '').toUpperCase();
    const prcSpec = (prc_specialization || prcSpecialization || '').toUpperCase();

    // Process eligibility array preserving custom RA 1080 strings
    let eligibilityArray = [];
    if (Array.isArray(eligibility)) {
      eligibilityArray = eligibility;
    } else if (typeof eligibility === 'string' && eligibility.trim().length > 0) {
      eligibilityArray = eligibility.split(',').map(s => s.trim()).filter(Boolean);
    }
    const elJson = JSON.stringify(eligibilityArray);

    const query = `
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
        college_degree = EXCLUDED.college_degree,
        major = EXCLUDED.major,
        minor = EXCLUDED.minor,
        post_graduate_degree = EXCLUDED.post_graduate_degree,
        post_graduate_discipline = EXCLUDED.post_graduate_discipline,
        eligibility = EXCLUDED.eligibility,
        prc_specialization = EXCLUDED.prc_specialization,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      eduId,
      personnel_id,
      eduHighestAttainment,
      eduShsTrack,
      eduVocationalCourse,
      eduVocationalLevel,
      degree,
      maj || null,
      min || null,
      postDeg,
      postDisc || null,
      elJson,
      prcSpec || null,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.json(formatEducRecord(result.rows[0]));
  } catch (err) {
    console.error('Error upserting esf7_perssonel_educ:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Single update route
router.put('/:personnel_id', async (req, res) => {
  return router.handle({ ...req, method: 'POST' }, res);
});

module.exports = router;
