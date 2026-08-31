const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatWorkloadRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level || '',
    grade_level: row.grade_level || '',
    sectionId: row.section_id || null,
    section_id: row.section_id || null,
    sectionName: row.section_name || '',
    section_name: row.section_name || '',
    subject: row.subject,
    subjectId: row.subject_id || null,
    subject_id: row.subject_id || null,
    remediationSubject: row.remediation_subject || '',
    remediation_subject: row.remediation_subject || '',
    startTime: row.start_time ? String(row.start_time).substring(0, 5) : null,
    start_time: row.start_time ? String(row.start_time).substring(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).substring(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).substring(0, 5) : null,
    days: row.days || ['M', 'T', 'W', 'TH', 'F'],
    rawPayload: raw
  };
}

// GET all workload rows for a personnel
router.get('/personnel/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [personnel_id]
    );
    res.json(result.rows.map(formatWorkloadRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all workload rows in school
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM esf7_workload_rows ORDER BY created_at ASC`);
    res.json(result.rows.map(formatWorkloadRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Add a new workload row into esf7_workload_rows
router.post('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      grade_level, gradeLevel,
      section_id, sectionId,
      section_name, sectionName,
      subject,
      subject_id, subjectId,
      remediation_subject, remediationSubject,
      start_time, startTime,
      end_time, endTime,
      days
    } = req.body;

    const targetPersonnelId = personnel_id || personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: 'personnel_id is required' });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId]
    );
    const targetSchoolId = school_id || bodySchoolId || (personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348');
    const targetSchoolYear = school_year || bodySchoolYear || (personRes.rows.length > 0 ? personRes.rows[0].school_year : '2026-2027');

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_workload_rows`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const wklId = req.body.id || `WKL-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_workload_rows (
        id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
        subject, subject_id, remediation_subject, start_time, end_time, days, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
      RETURNING *;
    `;

    const values = [
      wklId,
      targetPersonnelId,
      targetSchoolId,
      targetSchoolYear,
      grade_level || gradeLevel || null,
      section_id || sectionId || null,
      section_name || sectionName || null,
      subject || 'MATHEMATICS',
      subject_id || subjectId || null,
      remediation_subject || remediationSubject || null,
      start_time || startTime || null,
      end_time || endTime || null,
      JSON.stringify(days || ['M', 'T', 'W', 'TH', 'F']),
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatWorkloadRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_workload_rows:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Update an existing workload row
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      grade_level, gradeLevel,
      section_id, sectionId,
      section_name, sectionName,
      subject,
      subject_id, subjectId,
      remediation_subject, remediationSubject,
      start_time, startTime,
      end_time, endTime,
      days
    } = req.body;

    const existingRes = await db.query(`SELECT * FROM esf7_workload_rows WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: `Workload row ${id} not found` });
    }

    const current = existingRes.rows[0];
    const mergedRaw = { ...(current.raw_payload || {}), ...req.body };

    const query = `
      UPDATE esf7_workload_rows
      SET
        grade_level = COALESCE($1, grade_level),
        section_id = COALESCE($2, section_id),
        section_name = COALESCE($3, section_name),
        subject = COALESCE($4, subject),
        subject_id = COALESCE($5, subject_id),
        remediation_subject = COALESCE($6, remediation_subject),
        start_time = COALESCE($7, start_time),
        end_time = COALESCE($8, end_time),
        days = COALESCE($9::jsonb, days),
        raw_payload = $10::jsonb,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *;
    `;

    const values = [
      grade_level || gradeLevel || null,
      section_id || sectionId || null,
      section_name || sectionName || null,
      subject || null,
      subject_id || subjectId || null,
      remediation_subject || remediationSubject || null,
      start_time || startTime || null,
      end_time || endTime || null,
      days ? JSON.stringify(days) : null,
      JSON.stringify(mergedRaw),
      id
    ];

    const result = await db.query(query, values);
    res.json(formatWorkloadRecord(result.rows[0]));
  } catch (err) {
    console.error('Error updating esf7_workload_rows:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows for a personnel
router.delete('/personnel/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    await db.query(`DELETE FROM esf7_workload_rows WHERE personnel_id = $1`, [personnel_id]);
    res.json({ success: true, message: `All workload rows for personnel ${personnel_id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows in a school
router.delete('/school/:school_id', async (req, res) => {
  try {
    const { school_id } = req.params;
    await db.query(`DELETE FROM esf7_workload_rows WHERE school_id = $1`, [school_id]);
    res.json({ success: true, message: `All workload rows for school ${school_id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows (bulk clear)
router.delete('/clear-all', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_workload_rows`);
    res.json({ success: true, message: 'All workload rows deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a specific workload row by ID
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_workload_rows WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Workload row ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
