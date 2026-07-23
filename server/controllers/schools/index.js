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
    const schoolId = getSchoolIdFromRequest(req);
    let result;
    if (schoolId) {
      result = await insightEdPool.query('SELECT * FROM unit1_school_identity WHERE school_id = $1 ORDER BY updated_at DESC LIMIT 1', [schoolId]);
    } else {
      result = await insightEdPool.query('SELECT * FROM unit1_school_identity ORDER BY updated_at DESC LIMIT 1');
    }
    if (result.rows.length === 0) {
      // Check local schools table in the ESF7 database first before using hardcoded fallback
      const localResult = await db.query('SELECT * FROM schools WHERE school_id = $1 LIMIT 1', [schoolId]);
      if (localResult.rows.length > 0) {
        const localRow = localResult.rows[0];
        return res.json({
          schoolId: localRow.school_id,
          schoolName: localRow.school_name,
          region: localRow.region,
          division: localRow.division,
          district: localRow.district,
          schoolYear: localRow.school_year || 'SY 26-27',
          numberOfShifts: String(localRow.number_of_shifts || 1),
          curricularOffering: Array.isArray(localRow.curricular_offering) ? localRow.curricular_offering : ['Elementary']
        });
      }

      // Return a default fallback object matching the frontend shape
      return res.json({
        schoolId: "123456",
        schoolName: "Sample National High School",
        region: "Region IV-A",
        division: "Sample Division",
        district: "Sample District",
        schoolYear: "SY 26-27",
        numberOfShifts: "1",
        curricularOffering: ['Elementary', 'JHS', 'SHS']
      });
    }

    const row = result.rows[0];

    // Map curricular offering string to ESF7 UI check arrays
    const offerings = [];
    const dbOffering = (row.curricular_offering || '').toLowerCase();
    if (dbOffering.includes('elementary') || dbOffering.includes('primary') || dbOffering.includes('purely')) {
      offerings.push('Elementary');
    }
    if (dbOffering.includes('jhs') || dbOffering.includes('junior') || dbOffering.includes('secondary') || dbOffering.includes('high school')) {
      offerings.push('JHS');
    }
    if (dbOffering.includes('shs') || dbOffering.includes('senior')) {
      offerings.push('SHS');
    }
    if (offerings.length === 0) {
      offerings.push('Elementary', 'JHS', 'SHS');
    }

    // Fetch certification status from local ESF7 schools table
    const localRes = await db.query(
      'SELECT certified_by, certified_signature, certified_at FROM schools WHERE school_id = $1 LIMIT 1',
      [schoolId || '123456']
    );
    const localRow = localRes.rows[0] || {};

    // Return mapped fields matching ESF7 expected shape
    res.json({
      schoolId: row.school_id || '123456',
      schoolName: row.school_name || '',
      region: row.region || '',
      division: row.division || '',
      district: row.district || '',
      schoolYear: 'SY 26-27',
      numberOfShifts: "1", // read-only default
      curricularOffering: offerings,
      certifiedBy: localRow.certified_by || null,
      certifiedSignature: localRow.certified_signature || null,
      certifiedAt: localRow.certified_at || null
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
    const { schoolYear, payload } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Missing draft payload' });
    }

    const result = await db.query(
      `INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (school_id, school_year)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
       RETURNING updated_at`,
      [schoolId, schoolYear || 'SY 26-27', JSON.stringify(payload)]
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

// Read-only block: PUT/edit is not allowed
router.put('/', (req, res) => {
  res.status(403).json({ error: "Editing school profile is not allowed in the ESF7 Personnel Portal. This section is read-only." });
});

module.exports = router;
