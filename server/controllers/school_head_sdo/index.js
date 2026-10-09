const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

// SDO-supplied school head (e.g. an EPS II serving as OIC Principal) for schools whose roster has no school head.
// Kept in its own table on purpose: this person is NOT part of the school's personnel roster.
// Table is created by migrations/add_school_head_sdo_and_unique_head.js (run it before deploying).

const cleanSchool = (req) => String(getSchoolIdFromRequest(req) || '').replace(/^SCH-/i, '').trim();

const format = (r) => r && ({
  id: r.id, schoolId: r.school_id, name: r.name, email: r.email, positionTitle: r.position_title,
  updatedAt: r.updated_at
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/school-head-sdo -> { success, data: record | null }
router.get('/', async (req, res) => {
  try {
    const schoolId = cleanSchool(req);
    if (!schoolId) return res.status(400).json({ success: false, error: 'school id is required.' });
    const r = await db.query(`SELECT * FROM esf7_school_head_sdo WHERE school_id = $1`, [schoolId]);
    res.json({ success: true, data: format(r.rows[0]) || null });
  } catch (e) {
    console.error('[SchoolHeadSdo GET]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/school-head-sdo  Body: { name, email, positionTitle }  (one record per school; saving again replaces it)
router.put('/', async (req, res) => {
  try {
    const schoolId = cleanSchool(req);
    if (!schoolId) return res.status(400).json({ success: false, error: 'school id is required.' });
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const positionTitle = String(req.body?.positionTitle || req.body?.position_title || '').trim();
    if (!name || !email || !positionTitle) {
      return res.status(400).json({ success: false, error: 'Name, Email and Position Title are all required.' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Enter a valid email address.' });

    // A roster school head always takes precedence, so the fallback is only accepted while the roster has none.
    const head = await db.query(
      `SELECT 1 FROM esf7_personnel_profile
        WHERE REPLACE(school_id, 'SCH-', '') = $1 AND is_school_head = TRUE LIMIT 1`, [schoolId]
    );
    if (head.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'The roster already has a school head, so the SDO fallback is not needed.' });
    }
    const r = await db.query(
      `INSERT INTO esf7_school_head_sdo (id, school_id, name, email, position_title)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (school_id) DO UPDATE
         SET name = EXCLUDED.name, email = EXCLUDED.email, position_title = EXCLUDED.position_title, updated_at = NOW()
       RETURNING *`,
      [`SHS-${schoolId}`, schoolId, name, email, positionTitle]
    );
    res.json({ success: true, data: format(r.rows[0]) });
  } catch (e) {
    console.error('[SchoolHeadSdo PUT]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
