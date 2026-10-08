const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const formattedDate = row.log_date 
    ? (row.log_date instanceof Date ? row.log_date.toISOString().split('T')[0] : String(row.log_date).split('T')[0])
    : null;

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    term: row.term || '1st',
    month: row.month,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    logDate: formattedDate,
    log_date: formattedDate,
    tardinessDate: formattedDate,
    tardiness_date: formattedDate,
    startDate: formattedDate,
    endDate: formattedDate,
    timeIn: row.time_in,
    time_in: row.time_in,
    timeOut: row.time_out,
    time_out: row.time_out,
    lateMinutes: Number(row.late_minutes || 0),
    late_minutes: Number(row.late_minutes || 0),
    undertimeMinutes: Number(row.undertime_minutes || 0),
    undertime_minutes: Number(row.undertime_minutes || 0),
    totalDtrDeficitMinutes: Number(row.total_dtr_deficit_minutes || 0),
    total_dtr_deficit_minutes: Number(row.total_dtr_deficit_minutes || 0),
    scheduledTeachingMinutes: Number(row.scheduled_teaching_minutes || 0),
    scheduled_teaching_minutes: Number(row.scheduled_teaching_minutes || 0),
    missedTeachingMinutes: Number(row.missed_teaching_minutes || 0),
    missed_teaching_minutes: Number(row.missed_teaching_minutes || 0),
    missedMinutes: Number(row.missed_teaching_minutes || 0),
    actualRenderedMinutes: Number(row.actual_rendered_minutes || 0),
    actual_rendered_minutes: Number(row.actual_rendered_minutes || 0),
    missedSlotIds: Array.isArray(row.missed_slot_ids) ? row.missed_slot_ids : [],
    missed_slot_ids: Array.isArray(row.missed_slot_ids) ? row.missed_slot_ids : [],
    logType: row.log_type || 'TARDINESS',
    log_type: row.log_type || 'TARDINESS',
    leaveType: row.log_type || 'Tardiness / DTR',
    reason: row.reason || '',
    isExcused: !!row.is_excused,
    is_excused: !!row.is_excused,
    rawPayload: raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET all tardiness / undertime records
router.get('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      school_id, schoolId,
      school_year, schoolYear,
      term, month,
      log_date, logDate, date
    } = req.query;

    const targetPersonnelId = personnel_id || personnelId;
    const targetSchoolId = school_id || schoolId;
    const targetSchoolYear = school_year || schoolYear;
    const targetDate = log_date || logDate || date;

    let query = `SELECT * FROM overload_late_undertime WHERE 1=1`;
    const values = [];
    let counter = 1;

    if (targetSchoolId) {
      query += ` AND school_id = $${counter}`;
      values.push(targetSchoolId);
      counter++;
    }

    if (targetPersonnelId) {
      query += ` AND personnel_id = $${counter}`;
      values.push(targetPersonnelId);
      counter++;
    }

    if (targetSchoolYear) {
      query += ` AND (school_year = $${counter} OR school_year = $${counter + 1})`;
      values.push(targetSchoolYear, targetSchoolYear === 'SY 26-27' ? '2026-2027' : 'SY 26-27');
      counter += 2;
    }

    if (term) {
      query += ` AND term = $${counter}`;
      values.push(term);
      counter++;
    }

    if (month) {
      query += ` AND LOWER(month) = LOWER($${counter})`;
      values.push(month);
      counter++;
    }

    if (targetDate) {
      query += ` AND log_date = $${counter}`;
      values.push(targetDate);
      counter++;
    }

    query += ` ORDER BY log_date DESC, created_at DESC`;

    const result = await db.query(query, values);
    res.json(result.rows.map(formatRecord));
  } catch (err) {
    console.error('Error fetching overload_late_undertime:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Add or update a tardiness / undertime record
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      id,
      personnel_id, personnelId,
      school_id, schoolId,
      school_year, schoolYear,
      term,
      month,
      log_date, logDate, tardiness_date, tardinessDate, date, startDate,
      time_in, timeIn,
      time_out, timeOut,
      late_minutes, lateMinutes,
      undertime_minutes, undertimeMinutes,
      total_dtr_deficit_minutes, totalDtrDeficitMinutes,
      scheduled_teaching_minutes, scheduledTeachingMinutes,
      missed_teaching_minutes, missedTeachingMinutes, missedMinutes,
      actual_rendered_minutes, actualRenderedMinutes,
      missed_slot_ids, missedSlotIds,
      log_type, logType, leaveType,
      reason,
      is_excused, isExcused,
      raw_payload, rawPayload
    } = body;

    const targetPersonnelId = personnel_id || personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: 'personnel_id is required' });
    }

    const tDate = log_date || logDate || tardiness_date || tardinessDate || date || startDate;
    if (!tDate) {
      return res.status(400).json({ error: 'log_date is required' });
    }

    const targetSchoolId = school_id || schoolId || req.headers['x-school-id'] || '108348';
    const targetSchoolYear = school_year || schoolYear || '2026-2027';
    const targetTerm = term || '1st';
    const targetMonth = month || (new Date(tDate).toLocaleString('default', { month: 'long' }));

    const tIn = time_in || timeIn || null;
    const tOut = time_out || timeOut || null;
    const lateM = Number(late_minutes ?? lateMinutes ?? 0);
    const underM = Number(undertime_minutes ?? undertimeMinutes ?? 0);
    const totalDeficit = Number(total_dtr_deficit_minutes ?? totalDtrDeficitMinutes ?? (lateM + underM));
    const schedM = Number(scheduled_teaching_minutes ?? scheduledTeachingMinutes ?? 0);
    const missedM = Number(missed_teaching_minutes ?? missedTeachingMinutes ?? missedMinutes ?? 0);
    const actualRendered = Number(actual_rendered_minutes ?? actualRenderedMinutes ?? Math.max(0, schedM - missedM));
    const missedSlots = Array.isArray(missed_slot_ids || missedSlotIds) ? (missed_slot_ids || missedSlotIds) : [];
    const lType = log_type || logType || leaveType || 'TARDINESS';
    const rReason = reason || '';
    const excused = Boolean(is_excused ?? isExcused ?? false);
    const payload = raw_payload || rawPayload || body;

    const recordId = id || `DTR-${targetSchoolId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const query = `
      INSERT INTO overload_late_undertime (
        id, school_id, school_year, term, month, personnel_id,
        log_date, time_in, time_out, late_minutes, undertime_minutes, total_dtr_deficit_minutes,
        scheduled_teaching_minutes, missed_teaching_minutes, actual_rendered_minutes,
        missed_slot_ids, log_type, reason, is_excused, raw_payload, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16::jsonb, $17, $18, $19, $20::jsonb, NOW()
      )
      ON CONFLICT (school_id, school_year, personnel_id, log_date) DO UPDATE SET
        term = EXCLUDED.term,
        month = EXCLUDED.month,
        time_in = EXCLUDED.time_in,
        time_out = EXCLUDED.time_out,
        late_minutes = EXCLUDED.late_minutes,
        undertime_minutes = EXCLUDED.undertime_minutes,
        total_dtr_deficit_minutes = EXCLUDED.total_dtr_deficit_minutes,
        scheduled_teaching_minutes = EXCLUDED.scheduled_teaching_minutes,
        missed_teaching_minutes = EXCLUDED.missed_teaching_minutes,
        actual_rendered_minutes = EXCLUDED.actual_rendered_minutes,
        missed_slot_ids = EXCLUDED.missed_slot_ids,
        log_type = EXCLUDED.log_type,
        reason = EXCLUDED.reason,
        is_excused = EXCLUDED.is_excused,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      recordId, targetSchoolId, targetSchoolYear, targetTerm, targetMonth, targetPersonnelId,
      tDate, tIn, tOut, lateM, underM, totalDeficit,
      schedM, missedM, actualRendered,
      JSON.stringify(missedSlots), lType, rReason, excused, JSON.stringify(payload)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatRecord(result.rows[0]));
  } catch (err) {
    console.error('Error upserting overload_late_undertime:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a tardiness / undertime record
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await db.query(`DELETE FROM overload_late_undertime WHERE id = $1`, [id]);
    res.json({ success: true, message: `DTR record ${id} deleted successfully.` });
  } catch (err) {
    console.error('Error deleting overload_late_undertime:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
