const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

// Create a connection pool to the main 'insightEd' database containing the unit1_school_identity table
const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

insightEdPool.on('error', (err) => {
  console.error('[Schools DB Pool Error]:', err.message);
});

const { getSchoolIdFromRequest } = require('../../utils/auth');
const db = require('../../db');

// GET school info directly from unit1_school_identity
const JHS_PROGRAM_CODES = [
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE'
];

function parseCurricularOffering(rawOff) {
  const s = String(rawOff || '').toUpperCase().trim();
  if (!s) return ['Elementary'];

  if (s.includes('PURELY ES') || s === 'PURELY ES') {
    return ['Elementary'];
  } else if (s.includes('PURELY JHS') || s === 'PURELY JHS') {
    return ['JHS'];
  } else if (s.includes('PURELY SHS') || s === 'PURELY SHS') {
    return ['SHS'];
  } else if (s.includes('ES AND JHS') || s.includes('K TO 10') || s.includes('K-10')) {
    return ['Elementary', 'JHS'];
  } else if (s.includes('JHS WITH SHS') || s.includes('JHS AND SHS') || s.includes('7 TO 12') || s.includes('7-12')) {
    return ['JHS', 'SHS'];
  } else if (s.includes('ALL OFFERING') || s.includes('K TO 12') || s.includes('K-12')) {
    return ['Elementary', 'JHS', 'SHS'];
  }

  const offerings = [];
  if (s.includes('ELEM') || s.includes('ES') || s.includes('PRIMARY') || s.includes('KINDER')) {
    offerings.push('Elementary');
  }
  if (s.includes('JHS') || s.includes('JUNIOR') || s.includes('SEC') || s.includes('HIGH')) {
    offerings.push('JHS');
  }
  if (s.includes('SHS') || s.includes('SENIOR')) {
    offerings.push('SHS');
  }
  return offerings.length > 0 ? Array.from(new Set(offerings)) : ['Elementary'];
}

// GET school info with master identity resolution & local profile overlay
router.get('/', async (req, res) => {
  try {
    const rawSchoolId = getSchoolIdFromRequest(req) || '199999';
    const cleanSchoolId = String(rawSchoolId).replace('SCH-', '').trim();

    let schoolName = `School ${cleanSchoolId}`;
    let region = '';
    let division = '';
    let district = '';
    let rawMCOC = null;
    let numberOfShifts = "1";
    let schoolYear = "SY 26-27";
    let certifiedBy = null;
    let certifiedSignature = null;
    let certifiedAt = null;
    let subjectsConfig = null;
    let hasElemSpecialPrograms = false;
    let hasJhsSpecialPrograms = false;
    let jhsSpecialPrograms = [];
    let shsCurriculumModel = 'Standard K-12 SHS Curriculum';
    let specialPrograms = [];

    // Special test school 199999 handling
    if (cleanSchoolId === '199999') {
      schoolName = 'TEST K-12 INTEGRATED SCHOOL';
      region = 'REGION V';
      division = 'ALBAY';
      district = 'DARAGA NORTH';
      rawMCOC = 'ALL OFFERING';
    } else {
      // 1. Query master 2025-2026_SchoolID table (official DepEd 46k+ schools with accurate region, division, district, mcoc)
      const schIdMatch = await insightEdPool.query(
        `SELECT "schoool_id", "school_name", "region", "division", "district", "mcoc" 
         FROM "2025-2026_SchoolID" WHERE "schoool_id" = $1 LIMIT 1`,
        [parseInt(cleanSchoolId, 10) || -1]
      ).catch(() => ({ rows: [] }));

      if (schIdMatch.rows.length > 0) {
        const row = schIdMatch.rows[0];
        if (row.school_name) schoolName = row.school_name;
        if (row.region) region = row.region;
        if (row.division) division = row.division;
        if (row.district) district = row.district;
        if (row.mcoc) rawMCOC = row.mcoc;
      }

      // 2. Query schools_IERN table in insightEd
      const iernMatch = await insightEdPool.query(
        `SELECT "SchoolID", "School_Name", "Region", "Division", "District", "Curricular_Offering" 
         FROM "schools_IERN" WHERE "SchoolID" = $1 LIMIT 1`,
        [cleanSchoolId]
      ).catch(() => ({ rows: [] }));

      if (iernMatch.rows.length > 0) {
        const row = iernMatch.rows[0];
        if (!schoolName || schoolName === `School ${cleanSchoolId}`) {
          if (row.School_Name) schoolName = row.School_Name;
        }
        if (!region && row.Region && row.Region !== 'CENTRAL OFFICE') region = row.Region;
        if (!division && row.Division && row.Division !== 'BHROD-SED') division = row.Division;
        if (!district && row.District) district = row.District;
        if (!rawMCOC && row.Curricular_Offering) rawMCOC = row.Curricular_Offering;
      }

      // 3. Query unit1_school_identity
      if (!rawMCOC || !schoolName || schoolName === `School ${cleanSchoolId}`) {
        const unit1Match = await insightEdPool.query(
          'SELECT * FROM unit1_school_identity WHERE CAST(school_id AS TEXT) = $1 OR CAST(school_id AS TEXT) = $2 ORDER BY updated_at DESC LIMIT 1',
          [cleanSchoolId, rawSchoolId]
        ).catch(() => ({ rows: [] }));

        if (unit1Match.rows.length > 0) {
          const row = unit1Match.rows[0];
          if (!schoolName || schoolName === `School ${cleanSchoolId}`) schoolName = row.school_name || schoolName;
          if (!region) region = row.region || '';
          if (!division) division = row.division || '';
          if (!district) district = row.district || '';
          if (!rawMCOC && row.curricular_offering) rawMCOC = row.curricular_offering;
        }
      }

      // 4. Query esf7_database or esf7_database_dummy
      if (!schoolName || schoolName === `School ${cleanSchoolId}`) {
        let esfMatch = await insightEdPool.query(
          `SELECT DISTINCT school_name, division, region, muncipality as district FROM esf7_database WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1 LIMIT 1`,
          [cleanSchoolId]
        ).catch(() => ({ rows: [] }));

        if (esfMatch.rows.length === 0) {
          esfMatch = await insightEdPool.query(
            `SELECT DISTINCT school_name, division, region, muncipality as district FROM esf7_database_dummy WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1 LIMIT 1`,
            [cleanSchoolId]
          ).catch(() => ({ rows: [] }));
        }

        if (esfMatch.rows.length > 0) {
          const esf = esfMatch.rows[0];
          if (esf.school_name) schoolName = esf.school_name;
          if (!region && esf.region) region = String(esf.region).toUpperCase().startsWith('REGION') ? esf.region : `REGION ${esf.region}`;
          if (!division && esf.division) division = esf.division;
          if (!district && esf.district) district = esf.district;
        }
      }
    }

    // Determine Curricular Offering
    let curricularOffering = cleanSchoolId === '199999'
      ? ['Elementary', 'JHS', 'SHS']
      : parseCurricularOffering(rawMCOC);

    // 5. Query local schools table (for shifts, subjects_config, certifications)
    const localSchoolRes = await db.query(
      'SELECT * FROM schools WHERE school_id = $1 OR school_id = $2 LIMIT 1',
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    if (localSchoolRes.rows.length > 0) {
      const ls = localSchoolRes.rows[0];
      if (ls.certified_by) certifiedBy = ls.certified_by;
      if (ls.certified_signature) certifiedSignature = ls.certified_signature;
      if (ls.certified_at) certifiedAt = ls.certified_at;
      if (ls.subjects_config) subjectsConfig = ls.subjects_config;
      if (ls.number_of_shifts) numberOfShifts = String(ls.number_of_shifts);
      if (ls.school_year) schoolYear = ls.school_year;
    }

    // 6. Query esf7_school_profile (for user-configured special programs & SHS model)
    const localProf = await db.query(
      'SELECT * FROM esf7_school_profile WHERE school_id = $1 OR school_id = $2 LIMIT 1',
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    if (localProf.rows.length > 0) {
      const pRow = localProf.rows[0];
      if (pRow.school_year) schoolYear = pRow.school_year;
      if (pRow.shs_curriculum_model) shsCurriculumModel = pRow.shs_curriculum_model;
      hasElemSpecialPrograms = Boolean(pRow.has_elem_special_programs);
      hasJhsSpecialPrograms = Boolean(pRow.has_jhs_special_programs);
      if (Array.isArray(pRow.jhs_special_programs)) {
        jhsSpecialPrograms = pRow.jhs_special_programs;
      }

      if (pRow.raw_payload && Array.isArray(pRow.raw_payload.specialPrograms)) {
        specialPrograms = pRow.raw_payload.specialPrograms;
      } else {
        const progs = [];
        if (hasElemSpecialPrograms) progs.push('SPECIAL SCIENCE ELEMENTARY SCHOOL');
        if (hasJhsSpecialPrograms && Array.isArray(jhsSpecialPrograms)) progs.push(...jhsSpecialPrograms);
        specialPrograms = progs;
      }
    }

    // Align special programs and curriculum model with active offerings
    const isElem = curricularOffering.includes('Elementary');
    const isJHS = curricularOffering.includes('JHS');
    const isSHS = curricularOffering.includes('SHS');

    if (!isElem) {
      hasElemSpecialPrograms = false;
      specialPrograms = specialPrograms.filter(p => !p.toUpperCase().includes('ELEMENTARY') && !p.toUpperCase().includes('SSES'));
    }
    if (!isJHS) {
      hasJhsSpecialPrograms = false;
      jhsSpecialPrograms = [];
      specialPrograms = specialPrograms.filter(p => p.toUpperCase().includes('ELEMENTARY') || p.toUpperCase().includes('SSES'));
    }
    if (!isSHS) {
      shsCurriculumModel = null;
    }

    return res.json({
      schoolId: cleanSchoolId,
      schoolName,
      region,
      division,
      district,
      schoolYear,
      numberOfShifts,
      curricularOffering,
      certifiedBy,
      certifiedSignature,
      certifiedAt,
      subjectsConfig,
      specialPrograms,
      hasElemSpecialPrograms,
      hasJhsSpecialPrograms,
      jhsSpecialPrograms,
      shsCurriculumModel
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/school/draft - Fetch cloud draft for the school
router.get('/draft', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '123456';
    const schoolYear = req.query.schoolYear || 'SY 26-27';

    const result = await db.query(
      'SELECT payload, updated_at FROM school_drafts WHERE school_id = $1 AND school_year = $2',
      [schoolId, schoolYear]
    );

    if (result.rows.length === 0) {
      return res.json({ payload: null });
    }

    res.json({
      payload: result.rows[0].payload,
      updatedAt: result.rows[0].updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/school/draft - Save/overwrite cloud draft for the school
router.put('/draft', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '123456';
    const { schoolYear, payload, journey_state } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Missing draft payload' });
    }

    let finalPayload = payload;
    if (typeof payload === 'object' && payload !== null && journey_state) {
      finalPayload = { ...payload, journey_state };
    }

    const result = await db.query(
      `INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (school_id, school_year)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
       RETURNING updated_at`,
      [schoolId, schoolYear || 'SY 26-27', JSON.stringify(finalPayload)]
    );

    res.json({
      success: true,
      updatedAt: result.rows[0].updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/school/draft - Delete cloud draft for the school
router.delete('/draft', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '123456';
    const schoolYear = req.query.schoolYear || 'SY 26-27';

    await db.query(
      'DELETE FROM school_drafts WHERE school_id = $1 AND school_year = $2',
      [schoolId, schoolYear]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schools/subjects - Save subjects_config for current school
router.put('/subjects', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '123456';
    const { subjectsConfig } = req.body;

    if (!subjectsConfig) {
      return res.status(400).json({ error: 'Missing subjectsConfig' });
    }

    await db.query(
      `INSERT INTO schools (id, school_id, school_name, region, division, school_year, subjects_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (school_id, school_year) DO UPDATE
       SET subjects_config = EXCLUDED.subjects_config, updated_at = NOW()`,
      [`SCH-${schoolId}`, schoolId, 'School', 'Region', 'Division', 'SY 26-27', JSON.stringify(subjectsConfig)]
    );

    res.json({ success: true, subjectsConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schools/curricular-config - Save esf7_school_profile Special Curricular Programs
router.put('/curricular-config', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.body.schoolId || req.body.school_id || '108348';
    const {
      hasElemSpecialPrograms, has_elem_special_programs,
      hasJhsSpecialPrograms, has_jhs_special_programs,
      jhsSpecialPrograms, jhs_special_programs,
      shsCurriculumModel, shs_curriculum_model,
      schoolYear = '2026-2027'
    } = req.body;

    const profileId = `SCH-PROFILE-${schoolId.replace('SCH-', '')}`;
    const elemFlag = hasElemSpecialPrograms === true || has_elem_special_programs === true;
    const jhsFlag = hasJhsSpecialPrograms === true || has_jhs_special_programs === true;
    const jhsProgs = Array.isArray(jhsSpecialPrograms) ? jhsSpecialPrograms : (Array.isArray(jhs_special_programs) ? jhs_special_programs : []);
    const shsModel = shsCurriculumModel || shs_curriculum_model || 'Standard K-12 SHS Curriculum';

    const sql = `
      INSERT INTO esf7_school_profile (
        id, school_id, school_year, has_elem_special_programs, has_jhs_special_programs,
        jhs_special_programs, shs_curriculum_model, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
      ON CONFLICT (school_id, school_year) DO UPDATE
      SET
        has_elem_special_programs = EXCLUDED.has_elem_special_programs,
        has_jhs_special_programs = EXCLUDED.has_jhs_special_programs,
        jhs_special_programs = EXCLUDED.jhs_special_programs,
        shs_curriculum_model = EXCLUDED.shs_curriculum_model,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      profileId,
      schoolId,
      schoolYear,
      elemFlag,
      jhsFlag,
      JSON.stringify(jhsProgs),
      shsModel,
      JSON.stringify(req.body)
    ]);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        schoolId: result.rows[0].school_id,
        schoolYear: result.rows[0].school_year,
        hasElemSpecialPrograms: result.rows[0].has_elem_special_programs,
        hasJhsSpecialPrograms: result.rows[0].has_jhs_special_programs,
        jhsSpecialPrograms: result.rows[0].jhs_special_programs,
        shsCurriculumModel: result.rows[0].shs_curriculum_model
      }
    });
  } catch (err) {
    console.error('[Curricular Config PUT Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Read-only block: PUT/edit is not allowed
router.put('/', (req, res) => {
  res.status(403).json({ error: "Editing school profile is not allowed in the ESF7 Personnel Portal. This section is read-only." });
});

module.exports = router;
