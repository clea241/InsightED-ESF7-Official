const express = require('express');
const router = express.Router();
const db = require('../../db');

/**
 * Helper to calculate duration in minutes between start_time (HH:MM) and end_time (HH:MM).
 * Automatically excludes 12:00 PM - 1:00 PM (12:00 - 13:00 / 720 - 780 mins) lunch break.
 */
function calculateMinutes(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return 0;

  const startMins = sh * 60 + (sm || 0);
  const endMins = eh * 60 + (em || 0);
  if (endMins <= startMins) return 0;

  let totalDiff = endMins - startMins;

  // Lunch Break Window: 12:00 PM (720 mins) to 1:00 PM (780 mins)
  const lunchStart = 720;
  const lunchEnd = 780;

  if (startMins < lunchEnd && endMins > lunchStart) {
    const overlapStart = Math.max(startMins, lunchStart);
    const overlapEnd = Math.min(endMins, lunchEnd);
    const lunchDeduction = Math.max(0, overlapEnd - overlapStart);
    totalDiff -= lunchDeduction;
  }

  return Math.max(0, totalDiff);
}

/**
 * GET /api/work-immersion/:personnel_id
 * Query: schoolYear (optional)
 * Returns array of work immersion daily schedules for the personnel
 */
router.get('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  const schoolYear = req.query.schoolYear || '2026-2027';

  try {
    const result = await db.query(
      `SELECT id, personnel_id, school_id, school_year, TO_CHAR(schedule_date, 'YYYY-MM-DD') AS schedule_date, start_time, end_time, duration_minutes
       FROM work_immersion_schedules
       WHERE personnel_id = $1 AND school_year = $2
       ORDER BY schedule_date ASC`,
      [personnel_id, schoolYear]
    );

    res.json({
      success: true,
      data: result.rows.map(r => ({
        id: r.id,
        personnelId: r.personnel_id,
        schoolId: r.school_id,
        schoolYear: r.school_year,
        date: r.schedule_date,
        startTime: r.start_time,
        endTime: r.end_time,
        durationMinutes: r.duration_minutes,
        hours: (r.duration_minutes / 60).toFixed(1)
      }))
    });
  } catch (err) {
    console.error('[WorkImmersion GET Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/work-immersion/batch
 * Body: { personnelId, schoolId, schoolYear, schedules: [ { date, startTime, endTime }, ... ] }
 * Replaces or upserts multiple daily Work Immersion schedule items
 */
router.post('/batch', async (req, res) => {
  const { personnelId, schoolId = '123456', schoolYear = '2026-2027', schedules = [] } = req.body;

  if (!personnelId) {
    return res.status(400).json({ success: false, error: 'personnelId is required.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const upserted = [];
    for (const item of schedules) {
      if (!item.date || !item.startTime || !item.endTime) continue;
      const durationMins = calculateMinutes(item.startTime, item.endTime);

      const r = await client.query(
        `INSERT INTO work_immersion_schedules (personnel_id, school_id, school_year, schedule_date, start_time, end_time, duration_minutes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (personnel_id, school_year, schedule_date)
         DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, duration_minutes = EXCLUDED.duration_minutes, updated_at = NOW()
         RETURNING id, personnel_id, TO_CHAR(schedule_date, 'YYYY-MM-DD') AS schedule_date, start_time, end_time, duration_minutes`,
        [personnelId, schoolId, schoolYear, item.date, item.startTime, item.endTime, durationMins]
      );
      upserted.push(r.rows[0]);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Successfully saved ${upserted.length} Work Immersion schedule entries.`,
      data: upserted
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[WorkImmersion Batch POST Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/work-immersion/date
 * Body: { personnelId, schoolYear, date }
 * Deletes a single daily schedule entry
 */
router.delete('/date', async (req, res) => {
  const { personnelId, schoolYear = '2026-2027', date } = req.body;
  try {
    await db.query(
      `DELETE FROM work_immersion_schedules WHERE personnel_id = $1 AND school_year = $2 AND schedule_date = $3`,
      [personnelId, schoolYear, date]
    );
    res.json({ success: true, message: `Removed Work Immersion schedule for ${date}` });
  } catch (err) {
    console.error('[WorkImmersion DELETE Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
