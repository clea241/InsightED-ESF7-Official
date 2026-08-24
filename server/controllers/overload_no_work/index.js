const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatNoWorkRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    region: row.region,
    division: row.division,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    noWorkDate: row.no_work_date ? (row.no_work_date instanceof Date ? row.no_work_date.toISOString().split('T')[0] : String(row.no_work_date).split('T')[0]) : null,
    no_work_date: row.no_work_date ? (row.no_work_date instanceof Date ? row.no_work_date.toISOString().split('T')[0] : String(row.no_work_date).split('T')[0]) : null,
    eventType: row.event_type,
    event_type: row.event_type,
    title: row.title,
    rawPayload: raw
  };
}

// GET all local holidays & suspensions matching region, division, or school_id
router.get('/', async (req, res) => {
  try {
    const { region, division, schoolId, school_id, schoolYear, school_year } = req.query;
    const targetSchoolId = schoolId || school_id || 'ALL';
    const targetSchoolYear = schoolYear || school_year || '2026-2027';

    let query = `SELECT * FROM overload_no_work WHERE school_year = $1`;
    const values = [targetSchoolYear];
    let counter = 2;

    if (schoolId || school_id) {
      query += ` AND (school_id = $${counter} OR school_id = 'ALL')`;
      values.push(targetSchoolId);
      counter++;
    }

    if (region) {
      query += ` AND (region = $${counter} OR region = 'ALL')`;
      values.push(region);
      counter++;
    }

    if (division) {
      query += ` AND (division = $${counter} OR division = 'ALL')`;
      values.push(division);
      counter++;
    }

    query += ` ORDER BY no_work_date ASC`;

    const result = await db.query(query, values);
    res.json(result.rows.map(formatNoWorkRecord));
  } catch (err) {
    console.error('Error fetching overload_no_work:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST Add a new local holiday or suspension record into overload_no_work
router.post('/', async (req, res) => {
  try {
    const {
      region, division,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      no_work_date, noWorkDate, date,
      event_type, eventType,
      title, description, name
    } = req.body;

    const targetRegion = (region || 'REGION VIII').toUpperCase().trim();
    const targetDivision = (division || 'SAMAR (WESTERN SAMAR)').toUpperCase().trim();
    const targetSchoolId = school_id || bodySchoolId || 'ALL';
    const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';
    const targetDate = no_work_date || noWorkDate || date;
    const targetEventType = (event_type || eventType || 'LOCAL_HOLIDAY').toUpperCase().trim();
    const targetTitle = (title || description || name || 'Local Non-Working Day').trim();

    if (!targetDate) {
      return res.status(400).json({ error: 'no_work_date is required' });
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM overload_no_work`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const nwkId = req.body.id || `NWK-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO overload_no_work (
        id, region, division, school_id, school_year, no_work_date, event_type, title, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (region, division, school_id, school_year, no_work_date) DO UPDATE SET
        event_type = EXCLUDED.event_type,
        title = EXCLUDED.title,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      nwkId,
      targetRegion,
      targetDivision,
      targetSchoolId,
      targetSchoolYear,
      targetDate,
      targetEventType,
      targetTitle,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatNoWorkRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting overload_no_work:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a no-work holiday / suspension record
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM overload_no_work WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: `Overload no-work record ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
