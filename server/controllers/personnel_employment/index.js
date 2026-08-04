const express = require('express');
const router = express.Router();
const db = require('../../db');
const { generateDesignationId, generateWorkloadId } = require('../../db/idGenerator');

// Get all normalized designations for a personnel
router.get('/:personnel_id/designations', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [personnel_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update / Assign multiple designations transactionally
router.put('/:personnel_id/designations', async (req, res) => {
  const { personnel_id } = req.params;
  const { designations } = req.body; // Array of designation objects

  if (!Array.isArray(designations)) {
    return res.status(400).json({ error: 'Designations must be an array' });
  }

  let client;
  try {
    client = await db.getClient();
    await client.query('BEGIN');

    // 1. Get school_id and school_year for personnel
    const personRes = await client.query(
      `SELECT school_id, school_year FROM personnel WHERE id = $1`,
      [personnel_id]
    );

    if (personRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Personnel not found' });
    }

    const { school_id, school_year } = personRes.rows[0];

    // 2. Fetch existing designations for comparison
    const existingRes = await client.query(
      `SELECT * FROM personnel_designations WHERE personnel_id = $1`,
      [personnel_id]
    );
    const existingMap = new Map(existingRes.rows.map(d => [`${d.designation_name}|${d.grade_level || ''}|${d.learning_area || ''}|${d.track || ''}`, d]));

    const keptIds = new Set();
    const resultDesignations = [];

    // 3. Process each designation in payload
    for (const d of designations) {
      const key = `${d.designation_name}|${d.grade_level || ''}|${d.learning_area || ''}|${d.track || ''}`;
      const existing = existingMap.get(key);
      const desigId = existing ? existing.id : generateDesignationId();
      const isApproved = !!d.approved_by_sds;

      const upsertRes = await client.query(
        `INSERT INTO personnel_designations 
          (id, personnel_id, school_id, school_year, designation_name, grade_level, learning_area, track, approved_by_sds, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (personnel_id, designation_name, grade_level, learning_area, track)
         DO UPDATE SET approved_by_sds = EXCLUDED.approved_by_sds, updated_at = NOW()
         RETURNING *`,
        [desigId, personnel_id, school_id, school_year, d.designation_name, d.grade_level || null, d.learning_area || null, d.track || null, isApproved]
      );

      const savedDesig = upsertRes.rows[0];
      keptIds.add(savedDesig.id);
      resultDesignations.push(savedDesig);

      // Workload Sync: If approved by SDS, ensure workload_rows entry exists
      if (isApproved) {
        let formattedTask = savedDesig.designation_name;
        if (savedDesig.grade_level) formattedTask += ` - ${savedDesig.grade_level}`;
        if (savedDesig.learning_area) formattedTask += ` - ${savedDesig.learning_area}`;
        if (savedDesig.track) formattedTask += ` - ${savedDesig.track}`;

        const existingWkl = await client.query(
          `SELECT id FROM workload_rows WHERE designation_id = $1`,
          [savedDesig.id]
        );

        if (existingWkl.rows.length === 0) {
          const wklId = generateWorkloadId();
          await client.query(
            `INSERT INTO workload_rows 
              (id, personnel_id, school_id, school_year, row_type, task, designated_by_sds, designation_id, days)
             VALUES ($1, $2, $3, $4, 'teaching-related', $5, TRUE, $6, $7)`,
            [wklId, personnel_id, school_id, school_year, formattedTask, savedDesig.id, ['M', 'T', 'W', 'TH', 'F']]
          );
        }
      } else {
        // If not approved by SDS, delete any linked workload_row
        await client.query(
          `DELETE FROM workload_rows WHERE designation_id = $1`,
          [savedDesig.id]
        );
      }
    }

    // 4. Delete designations no longer present in payload (ON DELETE CASCADE removes linked workload_rows automatically)
    const existingIds = existingRes.rows.map(d => d.id);
    const toDelete = existingIds.filter(id => !keptIds.has(id));
    if (toDelete.length > 0) {
      await client.query(
        `DELETE FROM personnel_designations WHERE id = ANY($1::varchar[])`,
        [toDelete]
      );
    }

    // 5. Backfill cache string into personnel_employment.designation for backward compatibility
    const currentAllRes = await client.query(
      `SELECT * FROM personnel_designations WHERE personnel_id = $1`,
      [personnel_id]
    );

    const serializedParts = currentAllRes.rows.map(d => {
      let str = d.designation_name;
      if (d.grade_level) str += ` - ${d.grade_level}`;
      if (d.learning_area) str += ` - ${d.learning_area}`;
      if (d.track) str += ` - ${d.track}`;
      if (d.approved_by_sds) str += `::APPROVED_SDS`;
      return str;
    });
    const serializedString = serializedParts.join(', ');

    await client.query(
      `UPDATE personnel_employment SET designation = $1, updated_at = NOW() WHERE personnel_id = $2`,
      [serializedString, personnel_id]
    );

    await client.query('COMMIT');
    res.json({ designations: resultDesignations, serializedDesignation: serializedString });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Legacy single update route for employment details
router.put('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  const { position, designation, fund_source, nature_of_appointment, hiring_arrangement, assigned_schools, grade_levels_taught, first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, step_number, teaches_shs } = req.body;
  try {
    const result = await db.query(
      `UPDATE personnel_employment 
       SET position = $1, designation = $2, fund_source = $3, nature_of_appointment = $4, 
           hiring_arrangement = $5, assigned_schools = $6, grade_levels_taught = $7, 
           first_service_date = $8, last_promotion_date = $9, new_station_date = $10,
           last_lateral_movement_date = $11, step_number = $12, teaches_shs = $13,
           updated_at = NOW()
       WHERE personnel_id = $14 RETURNING *`,
      [position, designation, fund_source, nature_of_appointment, hiring_arrangement, assigned_schools, grade_levels_taught, first_service_date || null, last_promotion_date || null, new_station_date || null, last_lateral_movement_date || null, step_number ? Number(step_number) : 1, !!teaches_shs, personnel_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
