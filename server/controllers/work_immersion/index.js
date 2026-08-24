const express = require('express');
const router = express.Router();
const db = require('../../db');

/**
 * Calculates duration in minutes between start_time (HH:MM) and end_time (HH:MM).
 * EXCLUDES 12:00 PM - 1:00 PM (12:00 - 13:00 / 720 - 780 mins) lunch break.
 */
function calculateMinutesExcludingLunch(startTime, endTime) {
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

function formatWorkImmersionRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const vDate = row.visit_date ? (row.visit_date instanceof Date ? row.visit_date.toISOString().split('T')[0] : String(row.visit_date).split('T')[0]) : null;
  const sTime = row.start_time ? String(row.start_time).substring(0, 5) : null;
  const eTime = row.end_time ? String(row.end_time).substring(0, 5) : null;
  const durMins = Number(row.duration_minutes || 0);

  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    visitDate: vDate,
    visit_date: vDate,
    date: vDate,
    startTime: sTime,
    start_time: sTime,
    endTime: eTime,
    end_time: eTime,
    durationMinutes: durMins,
    duration_minutes: durMins,
    hours: (durMins / 60).toFixed(1),
    rawPayload: raw
  };
}

// GET all Work Immersion visit records for personnel
router.get('/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const schoolYear = req.query.schoolYear || req.query.school_year || '2026-2027';

    const result = await db.query(
      `SELECT * FROM esf7_work_immersion WHERE personnel_id = $1 AND school_year = $2 ORDER BY visit_date ASC`,
      [personnel_id, schoolYear]
    );

    res.json({
      success: true,
      data: result.rows.map(formatWorkImmersionRecord)
    });
  } catch (err) {
    console.error('[WorkImmersion GET Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET all Work Immersion records for school
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM esf7_work_immersion ORDER BY visit_date ASC`);
    res.json(result.rows.map(formatWorkImmersionRecord));
  } catch (err) {
    console.error('[WorkImmersion GET ALL Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Add or update a Work Immersion visit entry
router.post('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      visit_date, visitDate, date,
      start_time, startTime,
      end_time, endTime
    } = req.body;

    const targetPersonnelId = personnel_id || personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ success: false, error: 'personnel_id is required' });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId]
    );
    const targetSchoolId = school_id || bodySchoolId || (personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348');
    const targetSchoolYear = school_year || bodySchoolYear || (personRes.rows.length > 0 ? personRes.rows[0].school_year : '2026-2027');
    const targetDate = visit_date || visitDate || date;
    const targetStart = start_time || startTime;
    const targetEnd = end_time || endTime;

    if (!targetDate || !targetStart || !targetEnd) {
      return res.status(400).json({ success: false, error: 'visit_date, start_time, and end_time are required' });
    }

    const durationMins = calculateMinutesExcludingLunch(targetStart, targetEnd);

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_work_immersion`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const wimId = req.body.id || `WIM-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_work_immersion (
        id, personnel_id, school_id, school_year, visit_date, start_time, end_time, duration_minutes, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (personnel_id, school_year, visit_date) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        duration_minutes = EXCLUDED.duration_minutes,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      wimId,
      targetPersonnelId,
      targetSchoolId,
      targetSchoolYear,
      targetDate,
      targetStart,
      targetEnd,
      durationMins,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json({
      success: true,
      data: formatWorkImmersionRecord(result.rows[0])
    });
  } catch (err) {
    console.error('[WorkImmersion POST Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a Work Immersion entry
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_work_immersion WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Work Immersion entry ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
