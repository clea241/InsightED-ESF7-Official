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
router.get('/', async (req, res) => {
  try {
    const rawSchoolId = getSchoolIdFromRequest(req) || '199999';
    const cleanSchoolId = String(rawSchoolId).replace('SCH-', '').trim();

    // 1. Check local ESF7 database for saved school profile
    const localProf = await db.query(
      'SELECT * FROM esf7_school_profile WHERE school_id = $1 OR school_id = $2 LIMIT 1',
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    if (localProf.rows.length > 0) {
      const pRow = localProf.rows[0];
      return res.json({
        schoolId: pRow.school_id || cleanSchoolId,
        schoolName: pRow.school_name || `School ${cleanSchoolId}`,
        region: pRow.region || '',
        division: pRow.division || '',
        district: pRow.district || '',
        schoolYear: pRow.school_year || 'SY 26-27',
        numberOfShifts: String(pRow.number_of_shifts || 1),
        curricularOffering: Array.isArray(pRow.curricular_offering) && pRow.curricular_offering.length > 0
          ? pRow.curricular_offering
          : ['Elementary'],
        certifiedBy: pRow.certified_by || null,
        certifiedSignature: pRow.certified_signature || null,
        certifiedAt: pRow.certified_at || null,
        subjectsConfig: pRow.subjects_config || null,
        specialPrograms: pRow.special_programs || [],
        shsCurriculumModel: pRow.shs_curriculum_model || 'Standard K-12 SHS Curriculum'
      });
    }

    // 2. Check local schools table for local test definitions (e.g. test school 199999)
    const localRes = await db.query(
      'SELECT * FROM schools WHERE school_id = $1 OR school_id = $2 LIMIT 1',
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    if (localRes.rows.length > 0) {
      const localRow = localRes.rows[0];
      let offerings = [];

      if (String(cleanSchoolId) === '199999') {
        offerings = ['Elementary', 'JHS', 'SHS'];
      } else if (Array.isArray(localRow.curricular_offering)) {
        const rawList = localRow.curricular_offering.map(o => String(o).toLowerCase());
        if (rawList.some(o => o.includes('elem') || o.includes('primary') || o.includes('kinder'))) offerings.push('Elementary');
        if (rawList.some(o => o.includes('jhs') || o.includes('junior') || o.includes('sec') || o.includes('high'))) offerings.push('JHS');
        if (rawList.some(o => o.includes('shs') || o.includes('senior'))) offerings.push('SHS');
        if (rawList.includes('k-12') || rawList.includes('all')) {
          offerings = ['Elementary', 'JHS', 'SHS'];
        }
      }

      if (offerings.length === 0) {
        offerings = ['Elementary'];
      }

      return res.json({
        schoolId: localRow.school_id || cleanSchoolId,
        schoolName: localRow.school_name || `School ${cleanSchoolId}`,
        region: localRow.region || '',
        division: localRow.division || '',
        district: localRow.district || '',
        schoolYear: localRow.school_year || 'SY 26-27',
        numberOfShifts: String(localRow.number_of_shifts || 1),
        curricularOffering: Array.from(new Set(offerings)),
        certifiedBy: localRow.certified_by || null,
        certifiedSignature: localRow.certified_signature || null,
        certifiedAt: localRow.certified_at || null,
        subjectsConfig: localRow.subjects_config || null
      });
    }

    // 3. Query main unit1_school_identity
    let result = await insightEdPool.query(
      'SELECT * FROM unit1_school_identity WHERE CAST(school_id AS TEXT) = $1 OR CAST(school_id AS TEXT) = $2 ORDER BY updated_at DESC LIMIT 1',
      [cleanSchoolId, rawSchoolId]
    ).catch(() => ({ rows: [] }));

    if (result.rows.length === 0) {
      // Check esf7_database / esf7_database_dummy table for historical school submission identity
      const tableName = ['199998', '199997'].includes(cleanSchoolId) ? 'esf7_database_dummy' : 'esf7_database';
      const esfMatch = await insightEdPool.query(
        `SELECT DISTINCT school_name, division, region, muncipality as district FROM ${tableName} WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1 LIMIT 1`,
        [cleanSchoolId]
      ).catch(() => ({ rows: [] }));

      if (esfMatch.rows.length > 0) {
        const esf = esfMatch.rows[0];
        const esfSchoolName = esf.school_name || `School ${cleanSchoolId}`;
        const esfRegion = esf.region ? (String(esf.region).toUpperCase().startsWith('REGION') ? esf.region : `REGION ${esf.region}`) : '';
        const esfDivision = esf.division || '';
        const esfDistrict = esf.district || '';

        return res.json({
          schoolId: cleanSchoolId,
          schoolName: esfSchoolName,
          region: esfRegion,
          division: esfDivision,
          district: esfDistrict,
          schoolYear: "SY 26-27",
          numberOfShifts: "1",
          curricularOffering: ['Elementary'],
          certifiedBy: null,
          certifiedSignature: null,
          certifiedAt: null,
          subjectsConfig: null
        });
      }
    }

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const dbOffering = String(row.curricular_offering || '').toLowerCase();
      let offerings = [];

      if (dbOffering.includes('elementary') || dbOffering.includes('primary') || dbOffering.includes('purely') || dbOffering.includes('kinder')) {
        offerings.push('Elementary');
      }
      if (dbOffering.includes('jhs') || dbOffering.includes('junior') || dbOffering.includes('secondary') || dbOffering.includes('high school')) {
        offerings.push('JHS');
      }
      if (dbOffering.includes('shs') || dbOffering.includes('senior')) {
        offerings.push('SHS');
      }
      if (offerings.length === 0) {
        offerings = ['Elementary'];
      }

      return res.json({
        schoolId: String(row.school_id || cleanSchoolId),
        schoolName: String(cleanSchoolId) === '199999' ? 'TEST K-12 INTEGRATED SCHOOL' : (row.school_name || `School ${cleanSchoolId}`),
        region: row.region || '',
        division: row.division || '',
        district: row.district || '',
        schoolYear: 'SY 26-27',
        numberOfShifts: "1",
        curricularOffering: Array.from(new Set(offerings)),
        certifiedBy: null,
        certifiedSignature: null,
        certifiedAt: null,
        subjectsConfig: null
      });
    }

    return res.json({
      schoolId: cleanSchoolId || '199999',
      schoolName: `School ${cleanSchoolId}`,
      region: "",
      division: "",
      district: "",
      schoolYear: "SY 26-27",
      numberOfShifts: "1",
      curricularOffering: ['Elementary'],
      subjectsConfig: null
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
