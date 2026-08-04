const express = require('express');
const router = express.Router();
const db = require('../../db');

// Update employment details for a personnel record
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
