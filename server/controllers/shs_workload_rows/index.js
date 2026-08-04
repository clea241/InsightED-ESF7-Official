const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generateWorkloadId } = require('../../db/idGenerator');

/**
 * GET /api/shs-workloads/:personnel_id
 * Returns all SHS workload rows for a personnel (all terms)
 */
router.get('/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT swr.*, cs.section_name
       FROM shs_workload_rows swr
       LEFT JOIN class_sections cs ON swr.section_id = cs.id
       WHERE swr.personnel_id = $1
       ORDER BY swr.term, swr.created_at ASC`,
      [personnel_id]
    );

    const rows = result.rows.map(r => ({
      id: String(r.id),
      personnelId: String(r.personnel_id),
      term: r.term,
      rowType: r.row_type,
      subject: r.subject || r.task || '',
      shsCategory: r.shs_category || '',
      task: r.task || '',
      gradeLevel: r.grade_level,
      sectionId: r.section_id ? String(r.section_id) : null,
      sectionName: r.section_name || null,
      startTime: r.start_time ? r.start_time.substring(0, 5) : null,
      endTime: r.end_time ? r.end_time.substring(0, 5) : null,
      days: r.days || [],
      designatedBySds: !!r.designated_by_sds,
    }));

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[SHS Workload GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shs-workloads
 * Add a single SHS workload row
 */
router.post('/', async (req, res) => {
  const {
    personnel_id, school_id, school_year,
    term, row_type, subject, shs_category, task,
    grade_level, section_id, days, designatedBySds
  } = req.body;

  const start_time = req.body.start_time || req.body.startTime || null;
  const end_time   = req.body.end_time   || req.body.endTime   || null;
  const isSds      = !!designatedBySds;

  if (!term || !['1st', '2nd', '3rd'].includes(term)) {
    return res.status(400).json({ error: 'term is required and must be 1st, 2nd, or 3rd.' });
  }

  try {
    const rowId = generateWorkloadId();
    const result = await db.query(
      `INSERT INTO shs_workload_rows
        (id, personnel_id, school_id, school_year, term, row_type, subject, shs_category, task, grade_level, section_id, start_time, end_time, days, designated_by_sds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [rowId, personnel_id, school_id || '123456', school_year || '2026-2027',
       term, row_type, subject || null, shs_category || null, task || null,
       grade_level || null, section_id || null, start_time, end_time,
       days || [], isSds]
    );
    const row = result.rows[0];
    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        term: row.term,
        rowType: row.row_type,
        subject: row.subject,
        shsCategory: row.shs_category,
        task: row.task,
        gradeLevel: row.grade_level,
        sectionId: row.section_id || '',
        startTime: row.start_time ? row.start_time.substring(0, 5) : '',
        endTime: row.end_time ? row.end_time.substring(0, 5) : '',
        days: row.days,
        designatedBySds: !!row.designated_by_sds,
      }
    });
  } catch (err) {
    console.error('[SHS Workload POST Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/shs-workloads/personnel/:personnel_id
 * Full replace of all SHS workload rows for a personnel (all terms).
 * Body: { shsWorkloadRows: { '1st': [...], '2nd': [...], '3rd': [...] } }
 */
router.put('/personnel/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  const { shsWorkloadRows = {} } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const pInfo = await client.query('SELECT school_id, school_year FROM personnel WHERE id = $1', [personnel_id]);
    const { school_id, school_year } = pInfo.rows[0] || { school_id: '123456', school_year: '2026-2027' };

    await client.query('DELETE FROM shs_workload_rows WHERE personnel_id = $1', [personnel_id]);

    for (const term of ['1st', '2nd', '3rd']) {
      const termRows = shsWorkloadRows[term] || [];
      for (const r of termRows) {
        const rowId = generateWorkloadId();
        const isSds = !!(r.designatedBySds || r.designated_by_sds);
        const result = await client.query(
          `INSERT INTO shs_workload_rows
            (id, personnel_id, school_id, school_year, term, row_type, subject, shs_category, task, grade_level, section_id, start_time, end_time, days, designated_by_sds)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [rowId, personnel_id, school_id, school_year, term,
           r.rowType || 'teaching', r.subject || null, r.shsCategory || null,
           r.task || null, r.gradeLevel || null, r.sectionId || null,
           r.startTime || null, r.endTime || null, r.days || [], isSds]
        );
        for (const d of (r.dates || [])) {
          const dateId = generateWorkloadId();
          await client.query(
            `INSERT INTO shs_workload_row_dates (id, shs_workload_row_id, task_date, start_time, end_time) VALUES ($1,$2,$3,$4,$5)`,
            [dateId, result.rows[0].id, d.date || null, d.startTime || null, d.endTime || null]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SHS Workload PUT Error]:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/shs-workloads/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM shs_workload_rows WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
