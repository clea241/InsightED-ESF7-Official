const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generateSectionId, generateWorkloadId } = require('../../db/idGenerator');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function calculateEndTime(startTimeStr, minutes) {
  const parts = (startTimeStr || '07:30:00').split(':').map(Number);
  const startH = parts[0] || 7;
  const startM = parts[1] || 30;
  const totalMinutes = startH * 60 + startM + minutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
}

// Get all class sections
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    let result;
    if (schoolId) {
      result = await db.query('SELECT * FROM class_sections WHERE school_id = $1 ORDER BY grade_level ASC, section_name ASC', [schoolId]);
    } else {
      result = await db.query('SELECT * FROM class_sections ORDER BY grade_level ASC, section_name ASC');
    }
    res.json(result.rows.map(row => ({
      id: String(row.id),
      gradeLevel: row.grade_level,
      sectionName: row.section_name,
      advisorId: row.adviser_id ? String(row.adviser_id) : null,
      sectionType: row.section_type
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a class section
router.post('/', async (req, res) => {
  const {
    school_id,
    school_year,
    grade_level,
    section_name,
    adviser_id,
    advisor_id,
    advisorId,
    section_type,
    advisory_minutes,
    advisoryMinutes
  } = req.body;

  const targetAdvisorId = adviser_id || advisor_id || advisorId || null;
  const advisoryMins = Number(advisory_minutes || advisoryMinutes || 300);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let validAdvisorId = null;
    if (targetAdvisorId) {
      const pCheck = await client.query('SELECT id FROM personnel WHERE id = $1', [targetAdvisorId]);
      if (pCheck.rows.length > 0) {
        validAdvisorId = targetAdvisorId;
      }
    }

    const newSecId = generateSectionId();
    const result = await client.query(
      `INSERT INTO class_sections (id, school_id, school_year, grade_level, section_name, adviser_id, section_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [newSecId, school_id || '123456', school_year || '2026-2027', grade_level, section_name, validAdvisorId, section_type || 'MONO GRADE']
    );

    const section = result.rows[0];

    if (validAdvisorId) {
      const advWklId = generateWorkloadId();

      const dailyAdvisoryMins = Math.round(advisoryMins / 5);
      const advStartTime = '07:30:00';
      const advEndTime = calculateEndTime(advStartTime, dailyAdvisoryMins);

      // ADVISORY row (teaching task)
      await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days)
         VALUES ($1, $2, $3, $4, 'teaching', 'ADVISORY', $5, $6, $7, $8, ARRAY['M','T','W','TH','F'])`,
        [advWklId, validAdvisorId, section.school_id, section.school_year, section.grade_level, section.id, advStartTime, advEndTime]
      );

      // HGP row (nested under ADVISORY time window)
      const hgpWklId = generateWorkloadId();
      await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days)
         VALUES ($1, $2, $3, $4, 'teaching', 'HGP', $5, $6, $7, $8, ARRAY['F'])`,
        [hgpWklId, validAdvisorId, section.school_id, section.school_year, section.grade_level, section.id, advStartTime, advEndTime]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      id: section.id,
      gradeLevel: section.grade_level,
      sectionName: section.section_name,
      advisorId: section.adviser_id ? String(section.adviser_id) : null,
      sectionType: section.section_type
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Update a section's adviser and workload minutes
router.put('/:id', async (req, res) => {
  const {
    advisorId,
    adviser_id,
    advisor_id,
    advisory_minutes,
    advisoryMinutes
  } = req.body;

  const targetAdvisorId = advisorId || adviser_id || advisor_id || null;
  const advisoryMins = Number(advisory_minutes || advisoryMinutes || 300);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get the current section details before updating
    const sectionRes = await client.query('SELECT * FROM class_sections WHERE id = $1', [req.params.id]);
    if (sectionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Class section not found.' });
    }
    const section = sectionRes.rows[0];

    let validAdvisorId = null;
    if (targetAdvisorId) {
      const pCheck = await client.query('SELECT id FROM personnel WHERE id = $1', [targetAdvisorId]);
      if (pCheck.rows.length > 0) {
        validAdvisorId = targetAdvisorId;
      }
    }

    // 2. Update the adviser in the class_sections table
    const result = await client.query(
      `UPDATE class_sections SET adviser_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [validAdvisorId, req.params.id]
    );

    // 3. Delete existing auto-generated ADVISORY & HGP rows for this section
    await client.query(
      `DELETE FROM workload_rows 
       WHERE section_id = $1 AND (subject = 'ADVISORY' OR subject = 'HGP' OR subject = 'HOMEROOM GUIDANCE')`,
      [req.params.id]
    );

    // 4. If a valid adviser is assigned, insert section-scoped ADVISORY & HGP workload rows
    if (validAdvisorId) {
      const advWklId = generateWorkloadId();

      const dailyAdvisoryMins = Math.round(advisoryMins / 5);
      const advStartTime = '07:30:00';
      const advEndTime = calculateEndTime(advStartTime, dailyAdvisoryMins);

      // ADVISORY row
      await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days)
         VALUES ($1, $2, $3, $4, 'teaching', 'ADVISORY', $5, $6, $7, $8, ARRAY['M','T','W','TH','F'])`,
        [advWklId, validAdvisorId, section.school_id, section.school_year, section.grade_level, section.id, advStartTime, advEndTime]
      );

      // HGP row (nested under ADVISORY time window)
      const hgpWklId = generateWorkloadId();
      await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days)
         VALUES ($1, $2, $3, $4, 'teaching', 'HGP', $5, $6, $7, $8, ARRAY['F'])`,
        [hgpWklId, validAdvisorId, section.school_id, section.school_year, section.grade_level, section.id, advStartTime, advEndTime]
      );
    }

    await client.query('COMMIT');

    res.json({
      id: result.rows[0].id,
      gradeLevel: result.rows[0].grade_level,
      sectionName: result.rows[0].section_name,
      advisorId: result.rows[0].adviser_id ? String(result.rows[0].adviser_id) : null,
      sectionType: result.rows[0].section_type
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Delete a class section
router.delete('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete any workload rows associated with this section
    await client.query(
      `DELETE FROM workload_rows WHERE section_id = $1`,
      [req.params.id]
    );

    await client.query('DELETE FROM class_sections WHERE id = $1', [req.params.id]);
    
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
