const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatDesignationRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    designationName: row.designation_name,
    designation_name: row.designation_name,
    gradeLevel: row.grade_level || '',
    grade_level: row.grade_level || '',
    subjectArea: row.subject_area || '',
    subject_area: row.subject_area || '',
    track: row.track || '',
    isSdsApproved: !!row.is_sds_approved,
    is_sds_approved: !!row.is_sds_approved,
    sdsConfirmed: !!row.sds_confirmed,
    sds_confirmed: !!row.sds_confirmed,
    serializedKey: row.serialized_key,
    serialized_key: row.serialized_key,
    rawPayload: raw
  };
}

// GET all designations for a personnel_id
router.get('/personnel/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [personnel_id]
    );
    res.json(result.rows.map(formatDesignationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all designations in the school
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM esf7_personnel_designations ORDER BY created_at ASC`);
    res.json(result.rows.map(formatDesignationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Add or update a designation for a personnel record
router.post('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      designation_name, designationName,
      grade_level, gradeLevel,
      subject_area, subjectArea,
      track,
      is_sds_approved, isSdsApproved,
      sds_confirmed, sdsConfirmed,
      serialized_key, serializedKey, designation
    } = req.body;

    const targetPersonId = personnel_id || personnelId;
    if (!targetPersonId) {
      return res.status(400).json({ error: 'personnel_id is required' });
    }

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonId]
    );
    const schoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_designations`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const dsgId = req.body.id || `DSG-${schoolId.replace('SCH-', '')}-${seq}`;

    const key = serialized_key || serializedKey || designation || designation_name || designationName || 'OFFICIAL DESIGNATION';
    const isApproved = is_sds_approved === true || isSdsApproved === true || key.endsWith('::APPROVED_SDS');
    const isConfirmed = sds_confirmed === true || sdsConfirmed === true;
    const name = designation_name || designationName || key.split(' - ')[0].replace('::APPROVED_SDS', '').trim();

    const query = `
      INSERT INTO esf7_personnel_designations (
        id, personnel_id, designation_name, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      RETURNING *;
    `;

    const values = [
      dsgId,
      targetPersonId,
      name,
      grade_level || gradeLevel || null,
      subject_area || subjectArea || null,
      track || null,
      isApproved,
      isConfirmed,
      key,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatDesignationRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting designation:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a designation by ID
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_personnel_designations WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Designation ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
