const express = require('express');
const router = express.Router();
const db = require('../../db');

// Helper function to format employment DB row
function formatEmploymentRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const grades = row.grade_levels_taught || [];
  const hasShsGrade = Array.isArray(grades) && grades.some(g => String(g).includes('11') || String(g).includes('12'));
  const teachesShsFlag = raw.teachesShs !== undefined ? !!raw.teachesShs : (raw.teaches_shs !== undefined ? !!raw.teaches_shs : hasShsGrade);

  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    positionCategory: row.position_category,
    position_category: row.position_category,
    position: row.position,
    stepIncrement: row.step_increment,
    step_increment: row.step_increment,
    fundSource: row.fund_source,
    fund_source: row.fund_source,
    natureOfAppointment: row.nature_of_appointment,
    nature_of_appointment: row.nature_of_appointment,
    hiringArrangement: row.hiring_arrangement,
    hiring_arrangement: row.hiring_arrangement,
    deploymentStatus: row.deployment_status,
    deployment_status: row.deployment_status,
    assignedSchools: row.assigned_schools || [],
    assigned_schools: row.assigned_schools || [],
    gradeLevelsTaught: grades,
    grade_levels_taught: grades,
    assignedGradeLevels: grades,
    assigned_grade_levels: grades,
    teachesShs: teachesShsFlag,
    teaches_shs: teachesShsFlag,
    firstServiceDate: row.first_service_date ? (row.first_service_date instanceof Date ? row.first_service_date.toISOString().split('T')[0] : String(row.first_service_date).split('T')[0]) : null,
    lastPromotionDate: row.last_promotion_date ? (row.last_promotion_date instanceof Date ? row.last_promotion_date.toISOString().split('T')[0] : String(row.last_promotion_date).split('T')[0]) : null,
    newStationDate: row.new_station_date ? (row.new_station_date instanceof Date ? row.new_station_date.toISOString().split('T')[0] : String(row.new_station_date).split('T')[0]) : null,
    lastLateralMovementDate: row.last_lateral_movement_date ? (row.last_lateral_movement_date instanceof Date ? row.last_lateral_movement_date.toISOString().split('T')[0] : String(row.last_lateral_movement_date).split('T')[0]) : null,
    rawPayload: raw
  };
}

// GET employment record by personnel_id
router.get('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_employment WHERE personnel_id = $1 LIMIT 1`,
      [personnel_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employment record not found' });
    }
    res.json(formatEmploymentRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT Upsert employment details for a personnel record
router.post('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const {
      position_category, positionCategory, position, step_increment, stepIncrement,
      fund_source, fundSource, nature_of_appointment, natureOfAppointment,
      hiring_arrangement, hiringArrangement, deployment_status, deploymentStatus,
      assigned_schools, assignedSchools, grade_levels_taught, gradeLevelsTaught, assignedGradeLevels, assigned_grade_levels,
      first_service_date, firstServiceDate, last_promotion_date, lastPromotionDate,
      new_station_date, newStationDate, last_lateral_movement_date, lastLateralMovementDate
    } = req.body;

    // Get school_id from linked personnel profile to construct EMP ID
    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id]
    );

    const schoolId = personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348';
    
    // Count existing for sequence ID
    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_personnel_employment`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const empId = `EMP-${schoolId.replace('SCH-', '')}-${seq}`;

    const cat = (position_category || positionCategory || 'TEACHING').toUpperCase();
    const pos = (position || 'TEACHER I').toUpperCase();
    const step = Number(step_increment || stepIncrement || 1);
    const fund = (fund_source || fundSource || 'NATIONAL').toUpperCase();
    const appt = (nature_of_appointment || natureOfAppointment || 'REGULAR PERMANENT').toUpperCase();
    const hire = (hiring_arrangement || hiringArrangement || 'PERMANENT').toUpperCase();
    const deploy = (deployment_status || deploymentStatus || 'OWN STATION').toUpperCase();

    const targetGrades = assignedGradeLevels || assigned_grade_levels || grade_levels_taught || gradeLevelsTaught || [];
    const schoolsJson = JSON.stringify(assigned_schools || assignedSchools || []);
    const gradesJson = JSON.stringify(targetGrades);

    const query = `
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment,
        hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught,
        first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        position_category = EXCLUDED.position_category,
        position = EXCLUDED.position,
        step_increment = EXCLUDED.step_increment,
        fund_source = EXCLUDED.fund_source,
        nature_of_appointment = EXCLUDED.nature_of_appointment,
        hiring_arrangement = EXCLUDED.hiring_arrangement,
        deployment_status = EXCLUDED.deployment_status,
        assigned_schools = EXCLUDED.assigned_schools,
        grade_levels_taught = EXCLUDED.grade_levels_taught,
        first_service_date = EXCLUDED.first_service_date,
        last_promotion_date = EXCLUDED.last_promotion_date,
        new_station_date = EXCLUDED.new_station_date,
        last_lateral_movement_date = EXCLUDED.last_lateral_movement_date,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      empId,
      personnel_id,
      cat,
      pos,
      step,
      fund,
      appt,
      hire,
      deploy,
      schoolsJson,
      gradesJson,
      first_service_date || firstServiceDate || null,
      last_promotion_date || lastPromotionDate || null,
      new_station_date || newStationDate || null,
      last_lateral_movement_date || lastLateralMovementDate || null,
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.json(formatEmploymentRecord(result.rows[0]));
  } catch (err) {
    console.error('Error upserting esf7_personnel_employment:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Single update route
router.put('/:personnel_id', async (req, res) => {
  return router.handle({ ...req, method: 'POST' }, res);
});

module.exports = router;
