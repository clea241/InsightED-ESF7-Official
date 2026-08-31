const express = require('express');
const router = express.Router();
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');

function formatExtraTaskRecord(row) {
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
    taskCategory: row.task_category,
    task_category: row.task_category,
    taskName: row.task_name || row.task,
    task_name: row.task_name || row.task,
    task: row.task_name || row.task,
    dates: row.calendar_dates || raw.dates || [],
    calendarDates: row.calendar_dates || raw.dates || [],
    calendar_dates: row.calendar_dates || raw.dates || [],
    startTime: row.start_time || '08:00',
    start_time: row.start_time || '08:00',
    endTime: row.end_time || '09:00',
    end_time: row.end_time || '09:00',
    rawPayload: raw
  };
}

// GET /api/extra-tasks
router.get('/', async (req, res) => {
  try {
    const personnelId = req.query.personnelId || req.query.personnel_id;
    const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '502949';
    const schoolYear = req.query.schoolYear || req.query.school_year || 'SY 26-27';

    let result;
    if (personnelId) {
      result = await db.query(
        `SELECT * FROM esf7_personnel_extra_tasks WHERE personnel_id = $1 ORDER BY created_at ASC`,
        [personnelId]
      );
    } else {
      result = await db.query(
        `SELECT * FROM esf7_personnel_extra_tasks WHERE school_id = $1 AND school_year = $2 ORDER BY created_at ASC`,
        [schoolId, schoolYear]
      );
    }

    res.json(result.rows.map(formatExtraTaskRecord));
  } catch (err) {
    console.error('[Extra Tasks GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/extra-tasks/batch (Save/replace extra tasks for a personnel)
router.post('/batch', async (req, res) => {
  try {
    const { personnelId, personnel_id, tasks } = req.body;
    const pId = personnelId || personnel_id;
    const schoolId = getSchoolIdFromRequest(req) || req.body.schoolId || req.body.school_id || '502949';
    const schoolYear = req.body.schoolYear || req.body.school_year || 'SY 26-27';

    if (!pId) {
      return res.status(400).json({ error: 'personnelId is required' });
    }

    // Delete existing extra tasks for this personnel
    await db.query(`DELETE FROM esf7_personnel_extra_tasks WHERE personnel_id = $1`, [pId]);

    const insertedRows = [];
    if (Array.isArray(tasks) && tasks.length > 0) {
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const taskId = t.id || `TASK-${schoolId.replace('SCH-', '')}-${Date.now()}-${i}`;
        const cat = t.taskCategory || t.task_category || (t.type === 'administrative' ? 'ADMINISTRATIVE' : 'TEACHING_RELATED');
        const tName = t.taskName || t.task_name || t.task || 'GENERAL TASK';
        const cDates = JSON.stringify(t.dates || t.calendarDates || t.calendar_dates || []);
        const sTime = t.startTime || t.start_time || '08:00';
        const eTime = t.endTime || t.end_time || '09:00';

        const insertRes = await db.query(
          `INSERT INTO esf7_personnel_extra_tasks 
           (id, personnel_id, school_id, school_year, task_category, task_name, calendar_dates, start_time, end_time, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)
           RETURNING *`,
          [taskId, pId, schoolId, schoolYear, cat, tName, cDates, sTime, eTime, JSON.stringify(t)]
        );
        insertedRows.push(formatExtraTaskRecord(insertRes.rows[0]));
      }
    }

    res.json({ success: true, count: insertedRows.length, tasks: insertedRows });
  } catch (err) {
    console.error('[Extra Tasks Batch POST Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/extra-tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM esf7_personnel_extra_tasks WHERE id = $1`, [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Extra Tasks DELETE Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
