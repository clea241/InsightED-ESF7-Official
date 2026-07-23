const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generateWorkloadId } = require('../../db/idGenerator');
const { validateWorkloadSchedules } = require('../../utils/scheduleValidator');

// Get workloads for a specific personnel
router.get('/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT wr.*, cs.section_name 
       FROM workload_rows wr
       LEFT JOIN class_sections cs ON wr.section_id = cs.id
       WHERE wr.personnel_id = $1`,
      [personnel_id]
    );

    const rows = result.rows.map(r => ({
      id: String(r.id),
      personnelId: String(r.personnel_id),
      subject: r.subject || r.task || '',
      subject_name: r.subject || r.task || '',
      teaching_type: (r.subject && (r.subject.includes('Advisory') || r.subject === 'ADVISORY')) ? 'Advisory' : 'Teaching',
      gradeLevel: r.grade_level,
      grade_level: r.grade_level,
      sectionId: r.section_id ? String(r.section_id) : null,
      sectionName: r.section_name || null,
      section_name: r.section_name || null,
      startTime: r.start_time ? r.start_time.substring(0, 5) : null,
      endTime: r.end_time ? r.end_time.substring(0, 5) : null,
      days: r.days || [],
      minutes_per_week: (r.subject && (r.subject.includes('Advisory') || r.subject === 'ADVISORY')) ? 240 : 60
    }));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a workload row (teaching, teaching-related, or administrative)
router.post('/', async (req, res) => {
  const { personnel_id, school_id, school_year, row_type, subject, remediation_subject, task, grade_level, section_id, days } = req.body;
  const start_time = req.body.start_time || req.body.startTime || null;
  const end_time = req.body.end_time || req.body.endTime || null;
  try {
    if (row_type === 'teaching' && start_time && end_time) {
      // Validate against existing workload rows
      const existingRes = await db.query('SELECT * FROM workload_rows WHERE personnel_id = $1 AND row_type = \'teaching\'', [personnel_id]);
      const combinedRows = [
        ...existingRes.rows.map(r => ({
          sectionId: String(r.section_id || ''),
          subject: r.subject,
          startTime: r.start_time ? r.start_time.substring(0, 5) : '',
          endTime: r.end_time ? r.end_time.substring(0, 5) : '',
          days: r.days || []
        })),
        {
          sectionId: String(section_id || ''),
          subject: subject,
          startTime: start_time.substring(0, 5),
          endTime: end_time.substring(0, 5),
          days: days || []
        }
      ];

      const validationError = validateWorkloadSchedules(combinedRows);
      if (validationError) {
        return res.status(400).json({ error: validationError.error, type: validationError.type });
      }
    }

    const workloadId = generateWorkloadId();
    const result = await db.query(
      `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, remediation_subject, task, grade_level, section_id, start_time, end_time, days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [workloadId, personnel_id, school_id || '123456', school_year || '2026-2027', row_type, subject || null, remediation_subject || null, task || null, grade_level || null, section_id || null, start_time, end_time, days || []]
    );
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      subject: row.subject,
      remediationSubject: row.remediation_subject,
      task: row.task,
      gradeLevel: row.grade_level,
      sectionId: row.section_id || '',
      startTime: row.start_time ? row.start_time.substring(0, 5) : '',
      endTime: row.end_time ? row.end_time.substring(0, 5) : '',
      days: row.days
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an entire personnel's workloadRows list
router.put('/personnel/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  const { workloadRows, teachingRelatedRows, administrativeRows } = req.body;

  // Validate schedule conflicts before opening transaction
  const validationError = validateWorkloadSchedules(workloadRows || []);
  if (validationError) {
    return res.status(400).json({ error: validationError.error, type: validationError.type });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get personnel info to get school context
    const pInfo = await client.query('SELECT school_id, school_year FROM personnel WHERE id = $1', [personnel_id]);
    const { school_id, school_year } = pInfo.rows[0] || { school_id: '123456', school_year: '2026-2027' };

    // Clear all old workload rows for this personnel
    await client.query('DELETE FROM workload_rows WHERE personnel_id = $1', [personnel_id]);

    const inserted = [];

    // Insert teaching rows
    for (const r of workloadRows || []) {
      const workloadId = generateWorkloadId();
      const result = await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, remediation_subject, grade_level, section_id, start_time, end_time, days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [workloadId, personnel_id, school_id, school_year, 'teaching', r.subject, r.remediationSubject || null, r.gradeLevel, r.sectionId || null, r.startTime || null, r.endTime || null, r.days || []]
      );
      inserted.push(result.rows[0]);
    }

    // Insert teaching-related rows
    for (const r of teachingRelatedRows || []) {
      const workloadId = generateWorkloadId();
      const result = await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, task)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [workloadId, personnel_id, school_id, school_year, 'teaching-related', r.task]
      );
      const rowId = result.rows[0].id;
      for (const d of r.dates || []) {
        await client.query(
          `INSERT INTO workload_row_dates (workload_row_id, task_date, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [rowId, d.date || null, d.startTime || null, d.endTime || null]
        );
      }
    }

    // Insert administrative rows
    for (const r of administrativeRows || []) {
      const workloadId = generateWorkloadId();
      const result = await client.query(
        `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, task)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [workloadId, personnel_id, school_id, school_year, 'administrative', r.task]
      );
      const rowId = result.rows[0].id;
      for (const d of r.dates || []) {
        await client.query(
          `INSERT INTO workload_row_dates (workload_row_id, task_date, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [rowId, d.date || null, d.startTime || null, d.endTime || null]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Delete a workload row
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM workload_rows WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
