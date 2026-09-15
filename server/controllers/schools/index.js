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

    let hasElemInclusive = false;
    let elemInclusivePrograms = [];
    let hasJhsInclusive = false;
    let jhsInclusivePrograms = [];
    let hasShsInclusive = false;
    let shsInclusivePrograms = [];
    let inclusivePrograms = [];
    let hasAls = false;
    let hasSned = false;
    let hasIped = false;
    let hasMadrasah = false;
    let elemSpecialPrograms = [];

    // 6. Query esf7_school_profile (for user-configured special programs & SHS model & inclusive programs)
    const localProf = await db.query(
      'SELECT * FROM esf7_school_profile WHERE school_id = $1 OR school_id = $2 LIMIT 1',
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    if (localProf.rows.length > 0) {
      const pRow = localProf.rows[0];
      if (pRow.school_year) schoolYear = pRow.school_year;
      if (pRow.shs_curriculum_model) shsCurriculumModel = pRow.shs_curriculum_model;
      hasElemSpecialPrograms = Boolean(pRow.has_elem_special_programs);
      elemSpecialPrograms = Array.isArray(pRow.elem_special_programs)
        ? pRow.elem_special_programs
        : (hasElemSpecialPrograms ? ['SPECIAL SCIENCE ELEMENTARY SCHOOL'] : []);
      hasJhsSpecialPrograms = Boolean(pRow.has_jhs_special_programs);
      if (Array.isArray(pRow.jhs_special_programs)) {
        jhsSpecialPrograms = pRow.jhs_special_programs;
      }

      hasElemInclusive = Boolean(pRow.has_elem_inclusive ?? pRow.raw_payload?.hasElemInclusive);
      elemInclusivePrograms = Array.isArray(pRow.elem_inclusive_programs)
        ? pRow.elem_inclusive_programs
        : (Array.isArray(pRow.raw_payload?.elemInclusivePrograms) ? pRow.raw_payload.elemInclusivePrograms : []);

      hasJhsInclusive = Boolean(pRow.has_jhs_inclusive ?? pRow.raw_payload?.hasJhsInclusive);
      jhsInclusivePrograms = Array.isArray(pRow.jhs_inclusive_programs)
        ? pRow.jhs_inclusive_programs
        : (Array.isArray(pRow.raw_payload?.jhsInclusivePrograms) ? pRow.raw_payload.jhsInclusivePrograms : []);

      hasShsInclusive = Boolean(pRow.has_shs_inclusive ?? pRow.raw_payload?.hasShsInclusive);
      shsInclusivePrograms = Array.isArray(pRow.shs_inclusive_programs)
        ? pRow.shs_inclusive_programs
        : (Array.isArray(pRow.raw_payload?.shsInclusivePrograms) ? pRow.raw_payload.shsInclusivePrograms : []);

      inclusivePrograms = Array.isArray(pRow.inclusive_programs)
        ? pRow.inclusive_programs
        : (Array.isArray(pRow.raw_payload?.inclusivePrograms) ? pRow.raw_payload.inclusivePrograms : [
            ...(hasElemInclusive ? elemInclusivePrograms : []),
            ...(hasJhsInclusive ? jhsInclusivePrograms : []),
            ...(hasShsInclusive ? shsInclusivePrograms : [])
          ]);

      hasAls = Boolean(pRow.has_als ?? inclusivePrograms.some(p => String(p).toUpperCase().includes('ALS')));
      hasSned = Boolean(pRow.has_sned ?? inclusivePrograms.some(p => String(p).toUpperCase().includes('SNED') || String(p).toUpperCase().includes('SPED')));
      hasIped = Boolean(pRow.has_iped ?? inclusivePrograms.some(p => String(p).toUpperCase().includes('IPED') || String(p).toUpperCase().startsWith('IP-')));
      hasMadrasah = Boolean(pRow.has_madrasah ?? inclusivePrograms.some(p => String(p).toUpperCase().includes('MADRASAH') || String(p).toUpperCase().includes('MEP') || String(p).toUpperCase().includes('ALIVE')));

      if (pRow.raw_payload && Array.isArray(pRow.raw_payload.specialPrograms)) {
        specialPrograms = pRow.raw_payload.specialPrograms;
      } else {
        const progs = [];
        if (hasElemSpecialPrograms) progs.push('SPECIAL SCIENCE ELEMENTARY SCHOOL');
        if (hasJhsSpecialPrograms && Array.isArray(jhsSpecialPrograms)) progs.push(...jhsSpecialPrograms);
        specialPrograms = progs;
      }
    }

    // Align special programs, inclusive programs, and curriculum model with active offerings
    const isElem = curricularOffering.includes('Elementary');
    const isJHS = curricularOffering.includes('JHS');
    const isSHS = curricularOffering.includes('SHS');

    if (!isElem) {
      hasElemSpecialPrograms = false;
      elemSpecialPrograms = [];
      hasElemInclusive = false;
      elemInclusivePrograms = [];
      specialPrograms = specialPrograms.filter(p => !p.toUpperCase().includes('ELEMENTARY') && !p.toUpperCase().includes('SSES'));
      inclusivePrograms = inclusivePrograms.filter(p => !p.endsWith('-ES'));
    }
    if (!isJHS) {
      hasJhsSpecialPrograms = false;
      jhsSpecialPrograms = [];
      hasJhsInclusive = false;
      jhsInclusivePrograms = [];
      specialPrograms = specialPrograms.filter(p => p.toUpperCase().includes('ELEMENTARY') || p.toUpperCase().includes('SSES'));
      inclusivePrograms = inclusivePrograms.filter(p => !p.endsWith('-JHS'));
    }
    if (!isSHS) {
      shsCurriculumModel = null;
      hasShsInclusive = false;
      shsInclusivePrograms = [];
      inclusivePrograms = inclusivePrograms.filter(p => !p.endsWith('-SHS'));
    }

    hasAls = inclusivePrograms.some(p => String(p).toUpperCase().includes('ALS'));
    hasSned = inclusivePrograms.some(p => String(p).toUpperCase().includes('SNED') || String(p).toUpperCase().includes('SPED'));
    hasIped = inclusivePrograms.some(p => String(p).toUpperCase().includes('IPED') || String(p).toUpperCase().startsWith('IP-'));
    hasMadrasah = inclusivePrograms.some(p => String(p).toUpperCase().includes('MADRASAH') || String(p).toUpperCase().includes('MEP') || String(p).toUpperCase().includes('ALIVE'));

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
      elemSpecialPrograms,
      hasJhsSpecialPrograms,
      jhsSpecialPrograms,
      shsCurriculumModel,
      hasElemInclusive,
      elemInclusivePrograms,
      hasJhsInclusive,
      jhsInclusivePrograms,
      hasShsInclusive,
      shsInclusivePrograms,
      hasAls,
      hasSned,
      hasIped,
      hasMadrasah,
      inclusivePrograms
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
      return res.json({ payload: null, updatedAt: null });
    }

    res.json({
      payload: result.rows[0].payload,
      updatedAt: result.rows[0].updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT / POST /api/school/draft - Upsert cloud draft for the school
const handleSaveDraft = async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '123456';
    const { payload, schoolYear = 'SY 26-27' } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Missing draft payload' });
    }

    const result = await db.query(
      `INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (school_id, school_year)
       DO UPDATE SET payload = $3, updated_at = NOW()
       RETURNING updated_at`,
      [schoolId, schoolYear, JSON.stringify(payload)]
    );

    res.json({ success: true, updatedAt: result.rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.put('/draft', handleSaveDraft);
router.post('/draft', handleSaveDraft);

// DELETE /api/school/draft - Clear cloud draft upon form reset
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

// POST /api/school-info/shifts - Update number of shifts for current school
router.post('/shifts', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || '123456';
    const { shifts } = req.body;

    if (!shifts || !['1', '2', '3'].includes(String(shifts))) {
      return res.status(400).json({ error: 'Invalid shifts value. Must be 1, 2, or 3' });
    }

    await db.query(
      `INSERT INTO schools (id, school_id, school_name, region, division, school_year, number_of_shifts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (school_id, school_year) DO UPDATE
       SET number_of_shifts = EXCLUDED.number_of_shifts, updated_at = NOW()`,
      [`SCH-${schoolId}`, schoolId, 'School', 'Region', 'Division', 'SY 26-27', parseInt(shifts, 10)]
    );

    res.json({ success: true, numberOfShifts: String(shifts) });
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

// PUT /api/schools/curricular-config - Save esf7_school_profile Special Curricular & Inclusive Programs
router.put('/curricular-config', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.body.schoolId || req.body.school_id || '108348';
    const {
      hasElemSpecialPrograms, has_elem_special_programs,
      elemSpecialPrograms, elem_special_programs,
      hasJhsSpecialPrograms, has_jhs_special_programs,
      jhsSpecialPrograms, jhs_special_programs,
      shsCurriculumModel, shs_curriculum_model,
      hasElemInclusive, has_elem_inclusive,
      elemInclusivePrograms, elem_inclusive_programs,
      hasJhsInclusive, has_jhs_inclusive,
      jhsInclusivePrograms, jhs_inclusive_programs,
      hasShsInclusive, has_shs_inclusive,
      shsInclusivePrograms, shs_inclusive_programs,
      inclusivePrograms, inclusive_programs,
      schoolYear = '2026-2027'
    } = req.body;

    const profileId = `SCH-PROFILE-${schoolId.replace('SCH-', '')}`;
    const elemFlag = hasElemSpecialPrograms === true || has_elem_special_programs === true;
    const elemSpecialProgs = Array.isArray(elemSpecialPrograms) ? elemSpecialPrograms : (Array.isArray(elem_special_programs) ? elem_special_programs : (elemFlag ? ['SPECIAL SCIENCE ELEMENTARY SCHOOL'] : []));
    const jhsFlag = hasJhsSpecialPrograms === true || has_jhs_special_programs === true;
    const jhsProgs = Array.isArray(jhsSpecialPrograms) ? jhsSpecialPrograms : (Array.isArray(jhs_special_programs) ? jhs_special_programs : []);
    const shsModel = shsCurriculumModel || shs_curriculum_model || 'Standard K-12 SHS Curriculum';

    const elemIncFlag = hasElemInclusive === true || has_elem_inclusive === true;
    const elemIncProgs = Array.isArray(elemInclusivePrograms) ? elemInclusivePrograms : (Array.isArray(elem_inclusive_programs) ? elem_inclusive_programs : []);
    const jhsIncFlag = hasJhsInclusive === true || has_jhs_inclusive === true;
    const jhsIncProgs = Array.isArray(jhsInclusivePrograms) ? jhsInclusivePrograms : (Array.isArray(jhs_inclusive_programs) ? jhs_inclusive_programs : []);
    const shsIncFlag = hasShsInclusive === true || has_shs_inclusive === true;
    const shsIncProgs = Array.isArray(shsInclusivePrograms) ? shsInclusivePrograms : (Array.isArray(shs_inclusive_programs) ? shs_inclusive_programs : []);
    const incProgs = Array.isArray(inclusivePrograms) ? inclusivePrograms : (Array.isArray(inclusive_programs) ? inclusive_programs : [
      ...(elemIncFlag ? elemIncProgs : []),
      ...(jhsIncFlag ? jhsIncProgs : []),
      ...(shsIncFlag ? shsIncProgs : [])
    ]);

    const hasAls = incProgs.some(p => String(p).toUpperCase().includes('ALS'));
    const hasSned = incProgs.some(p => String(p).toUpperCase().includes('SNED') || String(p).toUpperCase().includes('SPED'));
    const hasIped = incProgs.some(p => String(p).toUpperCase().includes('IPED') || String(p).toUpperCase().startsWith('IP-') || String(p).toUpperCase().startsWith('IP_'));
    const hasMadrasah = incProgs.some(p => String(p).toUpperCase().includes('MADRASAH') || String(p).toUpperCase().includes('MEP') || String(p).toUpperCase().includes('ALIVE'));

    const sql = `
      INSERT INTO esf7_school_profile (
        id, school_id, school_year,
        has_elem_special_programs, elem_special_programs,
        has_jhs_special_programs, jhs_special_programs,
        shs_curriculum_model,
        has_elem_inclusive, elem_inclusive_programs,
        has_jhs_inclusive, jhs_inclusive_programs,
        has_shs_inclusive, shs_inclusive_programs,
        has_als, has_sned, has_iped, has_madrasah,
        inclusive_programs, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14::jsonb, $15, $16, $17, $18, $19::jsonb, $20::jsonb)
      ON CONFLICT (school_id, school_year) DO UPDATE
      SET
        has_elem_special_programs = EXCLUDED.has_elem_special_programs,
        elem_special_programs = EXCLUDED.elem_special_programs,
        has_jhs_special_programs = EXCLUDED.has_jhs_special_programs,
        jhs_special_programs = EXCLUDED.jhs_special_programs,
        shs_curriculum_model = EXCLUDED.shs_curriculum_model,
        has_elem_inclusive = EXCLUDED.has_elem_inclusive,
        elem_inclusive_programs = EXCLUDED.elem_inclusive_programs,
        has_jhs_inclusive = EXCLUDED.has_jhs_inclusive,
        jhs_inclusive_programs = EXCLUDED.jhs_inclusive_programs,
        has_shs_inclusive = EXCLUDED.has_shs_inclusive,
        shs_inclusive_programs = EXCLUDED.shs_inclusive_programs,
        has_als = EXCLUDED.has_als,
        has_sned = EXCLUDED.has_sned,
        has_iped = EXCLUDED.has_iped,
        has_madrasah = EXCLUDED.has_madrasah,
        inclusive_programs = EXCLUDED.inclusive_programs,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      profileId,
      schoolId,
      schoolYear,
      elemFlag,
      JSON.stringify(elemSpecialProgs),
      jhsFlag,
      JSON.stringify(jhsProgs),
      shsModel,
      elemIncFlag,
      JSON.stringify(elemIncProgs),
      jhsIncFlag,
      JSON.stringify(jhsIncProgs),
      shsIncFlag,
      JSON.stringify(shsIncProgs),
      hasAls,
      hasSned,
      hasIped,
      hasMadrasah,
      JSON.stringify(incProgs),
      JSON.stringify(req.body)
    ]);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        schoolId: result.rows[0].school_id,
        schoolYear: result.rows[0].school_year,
        hasElemSpecialPrograms: result.rows[0].has_elem_special_programs,
        elemSpecialPrograms: result.rows[0].elem_special_programs,
        hasJhsSpecialPrograms: result.rows[0].has_jhs_special_programs,
        jhsSpecialPrograms: result.rows[0].jhs_special_programs,
        shsCurriculumModel: result.rows[0].shs_curriculum_model,
        hasElemInclusive: result.rows[0].has_elem_inclusive,
        elemInclusivePrograms: result.rows[0].elem_inclusive_programs,
        hasJhsInclusive: result.rows[0].has_jhs_inclusive,
        jhsInclusivePrograms: result.rows[0].jhs_inclusive_programs,
        hasShsInclusive: result.rows[0].has_shs_inclusive,
        shsInclusivePrograms: result.rows[0].shs_inclusive_programs,
        hasAls: result.rows[0].has_als,
        hasSned: result.rows[0].has_sned,
        hasIped: result.rows[0].has_iped,
        hasMadrasah: result.rows[0].has_madrasah,
        inclusivePrograms: result.rows[0].inclusive_programs
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
