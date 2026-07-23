const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { generatePersonnelId, generateEmploymentId, generateQualificationId } = require('../../db/idGenerator');


// Helper to generate a random 6-character profiling code
const generateProfilingCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const calculateAge = (dobString) => {
  if (!dobString) return null;
  const birth = new Date(dobString);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const { getSchoolIdFromRequest } = require('../../utils/auth');

// GET all personnel (detailed join)
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    let personnelResult;
    if (schoolId) {
      personnelResult = await db.query(`
        SELECT p.*, false as is_shared 
        FROM personnel p 
        WHERE p.school_id = $1
        UNION ALL
        SELECT p.*, true as is_shared 
        FROM personnel p 
        JOIN clustered_personnel cp ON p.prn = cp.prn 
        WHERE cp.target_school_id = $1
        ORDER BY id ASC
      `, [schoolId]);
    } else {
      personnelResult = await db.query('SELECT *, false as is_shared FROM personnel ORDER BY id ASC');
    }
    const personnelList = [];

    for (const p of personnelResult.rows) {
      // Get Employment
      const empRes = await db.query('SELECT * FROM personnel_employment WHERE personnel_id = $1', [p.id]);
      // Get Qualifications
      const qualRes = await db.query('SELECT * FROM personnel_qualifications WHERE personnel_id = $1', [p.id]);
      // Get Trainings
      const trRes = await db.query('SELECT * FROM personnel_trainings WHERE personnel_id = $1', [p.id]);
      // Get Workloads
      const workRes = await db.query(`
        SELECT wr.*, d.id as date_id, d.task_date, d.start_time AS date_start_time, d.end_time AS date_end_time
        FROM workload_rows wr
        LEFT JOIN workload_row_dates d ON wr.id = d.workload_row_id
        WHERE wr.personnel_id = $1
      `, [p.id]);

      const rowsMap = {};
      for (const r of workRes.rows) {
        if (!rowsMap[r.id]) {
          rowsMap[r.id] = {
            id: r.id,
            personnel_id: r.personnel_id,
            school_id: r.school_id,
            school_year: r.school_year,
            row_type: r.row_type,
            subject: r.subject,
            remediation_subject: r.remediation_subject,
            task: r.task,
            grade_level: r.grade_level,
            section_id: r.section_id,
            start_time: r.start_time,
            end_time: r.end_time,
            days: r.days,
            dates: []
          };
        }
        if (r.date_id) {
          rowsMap[r.id].dates.push({
            id: r.date_id,
            date: r.task_date,
            startTime: r.date_start_time ? r.date_start_time.substring(0, 5) : '',
            endTime: r.date_end_time ? r.date_end_time.substring(0, 5) : ''
          });
        }
      }
      const aggregatedRows = Object.values(rowsMap);

      const emp = empRes.rows[0] || {};
      const qual = qualRes.rows[0] || {};

      personnelList.push({
        id: String(p.id),
        employeeReferenceId: p.prn,
        type: p.type,
        salutation: p.salutation,
        firstName: p.first_name,
        middleName: p.middle_name || '',
        lastName: p.last_name,
        nameExtension: p.name_extension || '',
        sexAtBirth: p.sex_at_birth,
        civilStatus: p.civil_status,
        soloParent: p.solo_parent ? 'Yes' : 'No',
        religion: p.religion,
        ethnicGroup: p.ethnic_group,
        birthdate: p.birthdate,
        age: p.age,
        philsysNo: p.philsys_no,
        tin: p.tin || '',
        noTin: p.no_tin,
        employeeNo: p.employee_no,
        depedEmail: p.deped_email,
        deploymentStatus: p.deployment_status,
        personalVerified: p.personal_verified,
        workloadVerified: p.workload_verified,
        profilingCode: p.profiling_code,
        stepIncrement: emp.step_number || p.step_increment || 1,
        isSchoolHead: p.is_school_head || false,
        isShared: p.is_shared || false,
        sourceSchoolId: p.school_id,

        // Employment
        position: emp.position || '',
        designation: emp.designation || '',
        fundSource: emp.fund_source || '',
        natureOfAppointment: emp.nature_of_appointment || '',
        hiringArrangement: emp.hiring_arrangement || '',
        assignedSchools: emp.assigned_schools || [],
        gradeLevelsTaught: emp.grade_levels_taught || [],
        firstServiceDate: emp.first_service_date || '',
        lastPromotionDate: emp.last_promotion_date || '',
        newStationDate: emp.new_station_date || '',
        lastLateralMovementDate: emp.last_lateral_movement_date || '',

        // Qualifications
        collegeDegree: qual.college_degree || '',
        major: qual.major || '',
        minor: qual.minor || '',
        postGraduateDegree: qual.post_graduate_degree || 'N/A',
        discipline: qual.discipline || '',
        eligibility: qual.eligibility || '',
        prcSpecialization: qual.prc_specialization || '',
        prcLicenseNo: qual.prc_license_no || '',
        prcExpiryDate: qual.prc_expiry_date || '',

        // Trainings separated by type
        neapTrainingRows: trRes.rows.filter(t => t.training_type === 'neap').map(t => ({ id: t.id, title: t.title, startDate: t.start_date, endDate: t.end_date, days: t.days, hoursPerDay: Number(t.hours_per_day), totalHours: Number(t.total_hours), conductor: t.conductor })),
        certificationRows: trRes.rows.filter(t => t.training_type === 'certification').map(t => ({ id: t.id, title: t.title, startDate: t.start_date, endDate: t.end_date, days: t.days, hoursPerDay: Number(t.hours_per_day), totalHours: Number(t.total_hours), conductor: t.conductor })),
        otherTrainingRows: trRes.rows.filter(t => t.training_type === 'other').map(t => ({ id: t.id, title: t.title, startDate: t.start_date, endDate: t.end_date, days: t.days, hoursPerDay: Number(t.hours_per_day), totalHours: Number(t.total_hours), conductor: t.conductor })),

        workloadRows: aggregatedRows.filter(w => w.row_type === 'teaching').map(w => ({ id: w.id, subject: w.subject, remediationSubject: w.remediation_subject || '', gradeLevel: w.grade_level, sectionId: String(w.section_id || ''), startTime: w.start_time ? w.start_time.substring(0, 5) : '', endTime: w.end_time ? w.end_time.substring(0, 5) : '', days: w.days, schoolYear: w.school_year })),
        teachingRelatedRows: aggregatedRows.filter(w => w.row_type === 'teaching-related').map(w => ({ id: w.id, task: w.task, dates: w.dates, schoolYear: w.school_year })),
        administrativeRows: aggregatedRows.filter(w => w.row_type === 'administrative').map(w => ({ id: w.id, task: w.task, dates: w.dates, schoolYear: w.school_year }))
      });
    }

    res.json(personnelList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Add new personnel (triggers automatic sub-table row creation)
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const {
      school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
      sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, philsys_no, tin, no_tin,
      employee_no, deped_email, deployment_status,
      // Employment
      position, designation, fund_source, nature_of_appointment, hiring_arrangement, assigned_schools, grade_levels_taught,
      first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date,
      // Qualifications
      college_degree, major, minor, post_graduate_degree, discipline, eligibility, prc_specialization, prc_license_no, prc_expiry_date
    } = req.body;

    // 0. Ensure school exists in schools table to prevent foreign key violation
    const schoolId = school_id || '999163';
    const schoolYear = school_year || '2026-2027';
    await client.query(
      `INSERT INTO schools (school_id, school_name, region, division, district, school_year, number_of_shifts, curricular_offering)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (school_id, school_year) DO NOTHING`,
      [schoolId, 'InsightED School', 'Region IV-A', 'Sample Division', 'Sample District', schoolYear, 1, ['Elementary', 'JHS', 'SHS']]
    );

    // 1. Generate PRN
    const prn = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const profilingCode = generateProfilingCode();

    // 2. Insert into personnel
    const step_increment = req.body.step_increment || req.body.stepIncrement || 1;
    const computedAge = calculateAge(birthdate) || (req.body.age ? Number(req.body.age) : null);
    const posStr = String(position || '').toUpperCase();
    const desStr = String(designation || '').toUpperCase();
    const isSchoolHead = req.body.is_school_head === true || req.body.isSchoolHead === true ||
      posStr.includes('PRINCIPAL') || posStr.includes('TEACHER-IN-CHARGE') || posStr.includes('TIC') || posStr.includes('OFFICER-IN-CHARGE') || posStr.includes('OIC') ||
      desStr.includes('PRINCIPAL') || desStr.includes('TEACHER-IN-CHARGE') || desStr.includes('TIC') || desStr.includes('OFFICER-IN-CHARGE') || desStr.includes('OIC') ||
      desStr.includes('SCHOOL HEAD');

    const newPersonnelId = generatePersonnelId();
    const employmentId = generateEmploymentId();
    const qualificationId = generateQualificationId();

    const personnelRes = await client.query(
      `INSERT INTO personnel (id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, philsys_no, tin, no_tin, employee_no, deped_email, deployment_status, profiling_code, step_increment, age, is_school_head)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id`,
      [newPersonnelId, prn, schoolId, schoolYear, type, salutation, first_name, middle_name || null, last_name, name_extension || null, sex_at_birth || null, civil_status || null, solo_parent === 'Yes', religion || null, ethnic_group || null, birthdate || null, philsys_no || null, tin || null, no_tin === true, employee_no || null, deped_email || null, deployment_status || null, profilingCode, Number(step_increment), computedAge, isSchoolHead]
    );
    const personnelId = personnelRes.rows[0].id;

    // 3. Insert Employment
    await client.query(
      `INSERT INTO personnel_employment (id, personnel_id, position, designation, fund_source, nature_of_appointment, hiring_arrangement, assigned_schools, grade_levels_taught, first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [employmentId, personnelId, position || '', designation || '', fund_source || '', nature_of_appointment || '', hiring_arrangement || '', assigned_schools || [], grade_levels_taught || [], first_service_date || '2000-01-01', last_promotion_date || '2000-01-01', new_station_date || '2000-01-01', last_lateral_movement_date || null]
    );

    // 4. Insert Qualifications
    await client.query(
      `INSERT INTO personnel_qualifications (id, personnel_id, college_degree, major, minor, post_graduate_degree, discipline, eligibility, prc_specialization, prc_license_no, prc_expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [qualificationId, personnelId, college_degree || '', major || '', minor || '', post_graduate_degree || 'N/A', discipline || '', eligibility || '', prc_specialization || '', prc_license_no || '', prc_expiry_date || null]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: personnelId, prn });
  } catch (err) {
    await client.query('ROLLBACK');
    fs.appendFileSync(path.join(__dirname, '../../error.log'), `[${new Date().toISOString()}] ADD PERSONNEL ERROR: ${err.message}\n${err.stack}\n\n`);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update core personnel fields
router.put('/:id', async (req, res) => {
  try {
    const {
      type, salutation, first_name, middle_name, last_name, name_extension,
      sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate,
      philsys_no, tin, no_tin, employee_no, deployment_status, step_increment
    } = req.body;

    const computedAge = calculateAge(birthdate);
    await db.query(
      `UPDATE personnel 
       SET type = $1, 
           salutation = $2, 
           first_name = $3, 
           middle_name = $4, 
           last_name = $5, 
           name_extension = $6, 
           sex_at_birth = $7, 
           civil_status = $8, 
           solo_parent = $9, 
           religion = $10, 
           ethnic_group = $11, 
           birthdate = $12, 
           philsys_no = $13, 
           tin = $14, 
           no_tin = $15, 
           employee_no = $16, 
           deployment_status = $17, 
           step_increment = $18,
           age = $19,
           updated_at = NOW() 
       WHERE id = $20`,
      [
        type, salutation, first_name, middle_name || null, last_name, name_extension || null,
        sex_at_birth || null, civil_status || null, solo_parent === true, religion || null, ethnic_group || null,
        birthdate || null, philsys_no || null, tin || null, no_tin === true, employee_no || null, deployment_status || null,
        Number(step_increment || 1),
        computedAge,
        req.params.id
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT verify personnel status
router.put('/:id/verify', async (req, res) => {
  const { field, value } = req.body; // field = 'personal' or 'workload'
  const col = field === 'personal' ? 'personal_verified' : 'workload_verified';
  try {
    await db.query(`UPDATE personnel SET ${col} = $1, updated_at = NOW() WHERE id = $2`, [value, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE personnel
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM personnel WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { Pool } = require('pg');
const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

insightEdPool.on('error', (err) => {
  console.error('[Personnel DB Pool Error]:', err.message);
});

// Date parsing utility for ESF7 database fields
function parseDateFromParts(yyyy, mm, dd) {
  if (!yyyy) return '2000-01-01';
  const year = String(yyyy).trim();
  const months = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };
  const monthName = String(mm || 'JANUARY').toLowerCase().trim();
  const month = months[monthName] || '01';
  const dayVal = parseInt(dd || '01');
  const day = dayVal < 10 ? `0${dayVal}` : `${dayVal}`;
  return `${year}-${month}-${day}`;
}

// GET auto-fill template from master database
router.get('/autofill-template', async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req);
    if (!schoolId) {
      return res.status(400).json({ error: 'Unauthorized or missing school ID' });
    }

    // Check if the school has pre-defined pilot personnel in the local PG pilot table first
    let masterRes = await db.query('SELECT * FROM insighted_esf7_pilot WHERE school_id = $1', [schoolId]);
    let isPilotTableSource = masterRes.rows.length > 0;

    if (!isPilotTableSource) {
      // Fallback to the master registry database
      masterRes = await insightEdPool.query('SELECT * FROM esf7_database WHERE school_id = $1', [schoolId]);
    }
    
    // Map teachers to the local personnel structure
    const template = masterRes.rows.map((teacher, index) => {
      // Handle column mappings depending on whether we sourced from insighted_esf7_pilot or esf7_database
      const rawName = teacher.name || '';
      const nameParts = rawName.includes(',') ? rawName.split(',').map(s => s.trim()) : [rawName, ''];
      
      const lastName = isPilotTableSource ? nameParts[0] : (teacher.last || '');
      const firstName = isPilotTableSource ? nameParts[1] : (teacher.first || '');
      const middleName = isPilotTableSource ? 'N/A' : (teacher.middle || 'N/A');
      
      const sexAtBirth = (isPilotTableSource ? (teacher.sex || 'Female') : (teacher.gender || teacher.sex || teacher.sex_at_birth || 'Female')).toUpperCase();

      // Employment
      const position = teacher.position || 'TEACHER I';
      const type = (() => {
        const pos = position.toLowerCase();
        if (pos.includes('principal') || pos.includes('head teacher') || pos.includes('tic')) {
          return 'teaching-related';
        }
        if (pos.includes('teacher')) {
          return 'teaching';
        }
        return 'non-teaching';
      })();

      const salutation = teacher.salutation || 'MR.';
      const civilStatus = (isPilotTableSource ? (teacher.civil_status || 'SINGLE') : (teacher.civil_status || 'SINGLE')).toUpperCase();
      const soloParent = teacher.solo_parent === true;
      const religion = teacher.religion || 'CHRISTIANITY';
      const ethnicGroup = teacher.ethnic_group || teacher.ehtinic_group || 'OTHERS';
      
      const birthdate = isPilotTableSource 
        ? parseDateFromParts(teacher.birthday_yyyy, teacher.birthday_mm, teacher.birthday_dd)
        : parseDateFromParts(teacher.birthday_yyyy, teacher.birthday_mm, teacher.birthday_dd);
      
      const tin = teacher.tin || null;
      const employeeNo = teacher.employee_no || null;
      const deploymentStatus = (isPilotTableSource ? (teacher.deployment_status || 'OWN STATION') : (teacher.deployment_status || teacher.status__item_ || 'OWN STATION')).toUpperCase();
      const profilingCode = teacher.profiling_code || Math.random().toString(36).substring(2, 8).toUpperCase();
      const depedEmail = isPilotTableSource ? `${firstName.replace(/\s+/g, '').toLowerCase()}.${lastName.replace(/\s+/g, '').toLowerCase()}@deped.gov.ph` : null;

      // Qualifications
      const collegeDegree = isPilotTableSource ? (teacher.college_degree || 'N/A') : (teacher.college_degree || teacher.degree_finished__baccalaureate || 'N/A');
      const major = isPilotTableSource ? (teacher.major_specialization || 'N/A') : (teacher.major || teacher.major__specialization || 'N/A');
      const minor = teacher.minor || 'N/A';
      const postGraduateDegree = teacher.post_graduate_degree || 'N/A';
      const eligibility = teacher.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS';

      const designation = teacher.designation || null;
      const fundSource = teacher.fund_source || 'NATIONAL';
      const natureOfAppointment = teacher.nature_of_appointment || 'REGULAR PERMANENT';
      const hiringArrangement = teacher.hiring_arrangement || 'REGULAR';
      
      const firstServiceDate = isPilotTableSource 
        ? parseDateFromParts(teacher.appt_yyyy, teacher.appt_mm, teacher.appt_dd)
        : parseDateFromParts(teacher.appt_yyyy, teacher.appt_mm, teacher.appt_dd);
        
      const lastPromotionDate = '2000-01-01';
      
      const newStationDate = isPilotTableSource 
        ? parseDateFromParts(teacher.station_yyyy, teacher.station_mm, teacher.station_dd)
        : parseDateFromParts(teacher.station_yyyy, teacher.station_mm, teacher.station_dd);

      return {
        id: `draft-${index}`,
        isDraft: true,
        employeeReferenceId: teacher.esf7_id || null,
        type,
        salutation,
        firstName,
        middleName,
        lastName,
        sexAtBirth,
        civilStatus,
        soloParent: soloParent ? 'Yes' : 'No',
        religion,
        ethnicGroup,
        birthdate,
        philsys_no: teacher.phylsys_num || null,
        philsysNo: teacher.phylsys_num || null,
        tin,
        employeeNo,
        depedEmail,
        deploymentStatus,
        profilingCode,
        position,
        designation,
        fundSource,
        natureOfAppointment,
        hiringArrangement,
        firstServiceDate,
        lastPromotionDate,
        newStationDate,
        collegeDegree,
        major,
        minor,
        postGraduateDegree,
        eligibility,
        workloadRows: [],
        neapTrainingRows: [],
        certificationRows: [],
        otherTrainingRows: []
      };
    });

    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk save auto-filled drafts
router.post('/bulk', async (req, res) => {
  const { personnelList } = req.body;
  const schoolId = getSchoolIdFromRequest(req);
  if (!schoolId) {
    return res.status(400).json({ error: 'Unauthorized' });
  }

  // Get active school year
  const schoolRes = await db.query('SELECT school_year FROM schools WHERE school_id = $1 LIMIT 1', [schoolId]);
  let schoolYear = 'SY 26-27';
  if (schoolRes.rows.length === 0) {
    const masterSchoolRes = await insightEdPool.query('SELECT * FROM unit1_school_identity WHERE school_id = $1 LIMIT 1', [schoolId]);
    const schoolName = masterSchoolRes.rows[0]?.school_name || 'Default School';
    const region = masterSchoolRes.rows[0]?.region || 'Region';
    const division = masterSchoolRes.rows[0]?.division || 'Division';
    
    await db.query(
      'INSERT INTO schools (school_id, school_name, region, division, school_year) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [schoolId, schoolName, region, division, schoolYear]
    );
  } else {
    schoolYear = schoolRes.rows[0].school_year;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of personnelList) {
      // 1. Insert into personnel
      const generatedPrn = p.employeeReferenceId || Math.floor(100000000000 + Math.random() * 900000000000).toString();
      const computedAge = calculateAge(p.birthdate);
      const newPid = generatePersonnelId();
      const newEmpId = generateEmploymentId();
      const newQualId = generateQualificationId();

      const insertPersonnelQuery = `
        INSERT INTO personnel (
          id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, 
          sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, 
          philsys_no, tin, employee_no, deped_email, deployment_status, profiling_code, age
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING id
      `;
      const pResult = await client.query(insertPersonnelQuery, [
        newPid, generatedPrn, schoolId, schoolYear, p.type, p.salutation, p.firstName, p.middleName || 'N/A', p.lastName,
        p.sexAtBirth, p.civilStatus, p.soloParent === 'Yes', p.religion, p.ethnicGroup, p.birthdate,
        p.philsys_no || null, p.tin || null, p.employeeNo || null, p.depedEmail, p.deploymentStatus, p.profilingCode,
        computedAge
      ]);
      const personnelId = pResult.rows[0].id;

      // 2. Insert into personnel_employment
      const insertEmploymentQuery = `
        INSERT INTO personnel_employment (
          id, personnel_id, position, designation, fund_source, nature_of_appointment, 
          hiring_arrangement, first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, step_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;
      await client.query(insertEmploymentQuery, [
        newEmpId, personnelId, p.position, p.designation || null, p.fundSource, p.natureOfAppointment,
        p.hiringArrangement, p.firstServiceDate, p.lastPromotionDate, p.newStationDate, p.lastLateralMovementDate || null,
        p.stepIncrement ? Number(p.stepIncrement) : 1
      ]);

      // 3. Insert into personnel_qualifications
      const insertQualsQuery = `
        INSERT INTO personnel_qualifications (
          id, personnel_id, college_degree, major, minor, post_graduate_degree, discipline, eligibility,
          prc_specialization, prc_license_no, prc_expiry_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;
      await client.query(insertQualsQuery, [
        newQualId, personnelId, p.collegeDegree, p.major, p.minor, p.postGraduateDegree, p.discipline || null, p.eligibility,
        p.prcSpecialization || null, p.prcLicenseNo || null, p.prcExpiryDate || null
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'All auto-filled personnel saved successfully!' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST Share personnel to clustered schools
router.post('/share', async (req, res) => {
  const { prn, target_school_ids, first_name, last_name } = req.body;
  const source_school_id = getSchoolIdFromRequest(req);
  if (!prn || !target_school_ids || !Array.isArray(target_school_ids)) {
    return res.status(400).json({ error: "Missing required fields: prn and target_school_ids array" });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch personnel name for the request
    const pRes = await client.query('SELECT first_name, last_name FROM personnel WHERE prn = $1 AND school_id = $2 LIMIT 1', [prn, source_school_id]);
    let pName = prn;
    if (pRes.rows.length > 0) {
      pName = `${pRes.rows[0].first_name} ${pRes.rows[0].last_name}`;
    } else if (first_name || last_name) {
      pName = `${first_name || ''} ${last_name || ''}`.trim();
    }
    
    // We don't delete existing clustered_personnel here anymore because they are active.
    // Instead, we will manage the requests.
    // First, clear existing PENDING shares for this PRN from this source school
    await client.query(`DELETE FROM clustered_connections WHERE personnel_id = $1 AND requester_school_id = $2 AND status = 'pending'`, [prn, source_school_id]);
    
    // Then insert the requested target schools as pending requests
    for (const target_id of target_school_ids) {
      // Check if it already exists in clustered_personnel
      const existing = await client.query('SELECT 1 FROM clustered_personnel WHERE prn = $1 AND target_school_id = $2', [prn, target_id]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO clustered_connections (requester_school_id, target_school_id, request_type, personnel_id, personnel_name, status)
           VALUES ($1, $2, 'clustered_teacher', $3, $4, 'pending')`,
          [source_school_id, target_id, prn, pName]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Personnel share requests sent successfully to clustered schools.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST Unshare personnel from all clustered schools (or specific ones if we expand this later)
router.post('/unshare', async (req, res) => {
  const { prn } = req.body;
  const source_school_id = getSchoolIdFromRequest(req);
  if (!prn) {
    return res.status(400).json({ error: "Missing required field: prn" });
  }

  try {
    await db.query('DELETE FROM clustered_personnel WHERE prn = $1 AND source_school_id = $2', [prn, source_school_id]);
    res.json({ success: true, message: 'Personnel unshared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Toggle School Head designation (Single-selection per school/year)
router.put('/:id/school-head', async (req, res) => {
  const { isSchoolHead } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Find the personnel's school_id and school_year
    const pRes = await client.query('SELECT school_id, school_year FROM personnel WHERE id = $1', [req.params.id]);
    if (pRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Personnel not found' });
    }
    const { school_id, school_year } = pRes.rows[0];

    if (isSchoolHead) {
      // Step 1: Turn off school head for all personnel in this school & year
      await client.query(
        'UPDATE personnel SET is_school_head = false WHERE school_id = $1 AND school_year = $2',
        [school_id, school_year]
      );
      // Step 2: Turn on school head for this person
      await client.query(
        'UPDATE personnel SET is_school_head = true WHERE id = $1',
        [req.params.id]
      );
    } else {
      // Just turn off school head for this person
      await client.query(
        'UPDATE personnel SET is_school_head = false WHERE id = $1',
        [req.params.id]
      );
    }
    
    await client.query('COMMIT');
    client.release();
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
