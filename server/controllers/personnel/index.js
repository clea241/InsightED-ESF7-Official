const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');
const { Pool } = require('pg');
require('dotenv').config();

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

const MONTH_NAME_MAP = {
  'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
  'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
  'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
};

const parseDateFromParts = (yyyy, mmName, dd) => {
  if (!yyyy || !mmName || !dd) return null;
  const monthNum = MONTH_NAME_MAP[String(mmName).trim().toUpperCase()];
  if (!monthNum) return null;
  const dayPadded = String(dd).padStart(2, '0');
  return `${yyyy}-${monthNum}-${dayPadded}`;
};

const checkIsSchoolHead = (p) => {
  if (p.isSchoolHead === true || p.is_school_head === true || String(p.isSchoolHead).toLowerCase() === 'true' || String(p.is_school_head).toLowerCase() === 'true') {
    return true;
  }
  const pos = String(p.position || '').toUpperCase();
  const des = String(p.designation || '').toUpperCase();
  return pos.includes('PRINCIPAL') || pos.includes('TEACHER-IN-CHARGE') || pos.includes('TIC') || pos.includes('OFFICER-IN-CHARGE') || pos.includes('OIC') || des.includes('SCHOOL HEAD');
};

const sanitizeStepIncrement = (rawVal) => {
  if (!rawVal) return 1;
  const num = Math.round(Number(rawVal));
  if (isNaN(num) || num < 1 || num > 8) {
    return 1;
  }
  return num;
};

const sanitizeAge = (rawVal, bDate) => {
  if (rawVal) {
    const num = Math.round(Number(rawVal));
    if (!isNaN(num) && num > 18 && num < 100) return num;
  }
  if (!bDate) return null;
  const birth = new Date(bDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age > 0 ? age : null;
};

function convertExcelTimeToHHMM(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return String(val).trim();
}

function determinePositionCategory(positionStr) {
  if (!positionStr) return { type: 'teaching', category: 'TEACHING' };
  const pos = String(positionStr).toUpperCase().trim();

  if (
    pos.includes('ADMINISTRATIVE') ||
    pos.includes('AO ') ||
    pos.includes('AO I') ||
    pos.includes('ADAS') ||
    pos.includes('ADA ') ||
    pos.includes('AIDE') ||
    pos.includes('UTILITY') ||
    pos.includes('CLERK') ||
    pos.includes('WATCHMAN') ||
    pos.includes('SECURITY') ||
    pos.includes('GUARD') ||
    pos.includes('NURSE') ||
    pos.includes('DENTIST') ||
    pos.includes('PHYSICIAN') ||
    pos.includes('MEDICAL') ||
    pos.includes('BOOKKEEPER') ||
    pos.includes('ACCOUNTANT') ||
    pos.includes('DISBURSING') ||
    pos.includes('REGISTRAR') ||
    pos.includes('DRIVER') ||
    pos.includes('WORKER') ||
    pos.includes('JANITOR') ||
    pos.includes('ENGINEER') ||
    pos.includes('CUSTODIAN')
  ) {
    return { type: 'non-teaching', category: 'NON-TEACHING' };
  }

  if (
    pos.includes('PRINCIPAL') ||
    pos.includes('HEAD TEACHER') ||
    pos.includes('SUPERVISOR') ||
    pos.includes('SUPERINTENDENT') ||
    pos.includes('GUIDANCE') ||
    pos.includes('VOCATIONAL SCHOOL') ||
    pos.includes('CHIEF')
  ) {
    return { type: 'teaching-related', category: 'RELATED TEACHING' };
  }

  return { type: 'teaching', category: 'TEACHING' };
}

async function fetchMasterPersonnelFromInsightEd(schoolId) {
  const cleanSchoolId = String(schoolId).replace('SCH-', '');
  console.log(`[LocalDraft] Reading master personnel records in-memory from insightEd.esf7_database for School ID ${cleanSchoolId}...`);
  
  const masterRes = await insightEdPool.query(
    `SELECT * FROM esf7_database WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1`,
    [cleanSchoolId]
  );

  if (masterRes.rows.length === 0) {
    console.log(`[LocalDraft] No master records found in esf7_database for School ID ${cleanSchoolId}.`);
    return [];
  }

  console.log(`[LocalDraft] Formatting ${masterRes.rows.length} personnel records in-memory (0 database inserts)...`);

  const list = [];
  for (let i = 0; i < masterRes.rows.length; i++) {
    const row = masterRes.rows[i];
    const seq = String(i + 1).padStart(3, '0');
    const profileId = `PER-${cleanSchoolId}-${seq}`;
    const empId = `EMP-${cleanSchoolId}-${seq}`;
    const educId = `EDU-${cleanSchoolId}-${seq}`;

    let fName = row.first_name || row.first || '';
    let lName = row.last_name || row.last || '';
    let mName = row.middle_name || row.middle || '';

    if ((!fName || !lName) && row.last_first) {
      const parts = String(row.last_first).trim().split(/\s+/);
      lName = parts[0] || 'TEACHER';
      fName = parts.slice(1).join(' ') || 'STAFF';
    }

    if (!fName) fName = `TEACHER`;
    if (!lName) lName = `STAFF ${seq}`;

    const prn = (row.prn || row.employee_no || `PRN-${cleanSchoolId}-${seq}`).trim();
    const isSchoolHead = checkIsSchoolHead(row);
    const bDate = parseDateFromParts(row.birthday_yyyy, row.birthday_mm, row.birthday_dd) || row.birthdate || null;
    const computedAge = sanitizeAge(row.age, bDate);
    const firstApptDate = parseDateFromParts(row.appt_yyyy, row.appt_mm, row.appt_dd) || row.first_service_date || null;
    const stationDate = parseDateFromParts(row.station_yyyy, row.station_mm, row.station_dd) || row.new_station_date || null;
    const stepIncrement = sanitizeStepIncrement(row.step_increment);
    const degree = row.degree_finished__baccalaureate || row.college_degree || 'BACHELOR OF SECONDARY EDUCATION';
    const major = row.major__specialization || row.major || 'GENERAL EDUCATION';
    const postGrad = row.post_graduate__degree || row.post_graduate_degree || 'N/A';
    const elig = row.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS';

    const depedEmail = row.deped_email || (row.employee_no ? `${row.employee_no}@deped.gov.ph` : `prn.${cleanSchoolId}.${seq}@deped.gov.ph`);

    const posName = (row.position || 'TEACHER I').toUpperCase();
    const catObj = determinePositionCategory(posName);

    // Parse Workload Slots 1..20
    const teacherWorkloads = [];
    const gradeLevelsSet = new Set();

    for (let s = 1; s <= 20; s++) {
      const sKey = s === 1 ? '_1' : `_1_${s}`;
      const subj = row[`subject${sKey}`];
      const lvl = row[`lvl${sKey}`];
      const sec = row[`section${sKey}`];
      const fromTime = convertExcelTimeToHHMM(row[`from${sKey}`]);
      const toTime = convertExcelTimeToHHMM(row[`to${sKey}`]);

      if (subj && String(subj).trim() !== '') {
        const gradeStr = lvl ? (String(lvl).startsWith('Grade') ? String(lvl) : `Grade ${lvl}`) : 'Grade 7';
        gradeLevelsSet.add(gradeStr);
        teacherWorkloads.push({
          id: `wk-${profileId}-${s}`,
          personnelId: profileId,
          schoolId: cleanSchoolId,
          schoolYear: '2026-2027',
          subject: String(subj).trim(),
          subjectName: String(subj).trim(),
          gradeLevel: gradeStr,
          sectionName: sec ? String(sec).trim() : '',
          startTime: fromTime || '08:00',
          endTime: toTime || '09:00',
          days: ['M', 'T', 'W', 'TH', 'F']
        });
      }
    }

    const gradeLevelsTaught = Array.from(gradeLevelsSet);

    list.push({
      ...row,
      id: profileId,
      prn,
      schoolId: cleanSchoolId,
      school_id: cleanSchoolId,
      schoolYear: '2026-2027',
      school_year: '2026-2027',
      type: catObj.type,
      salutation: (row.salutation || 'MR.').toUpperCase(),
      firstName: String(fName).toUpperCase(),
      first_name: String(fName).toUpperCase(),
      middleName: mName ? String(mName).toUpperCase() : '',
      middle_name: mName ? String(mName).toUpperCase() : '',
      lastName: String(lName).toUpperCase(),
      last_name: String(lName).toUpperCase(),
      nameExtension: row.name_extension || '',
      name_extension: row.name_extension || '',
      tin: row.tin || '',
      noTin: !row.tin,
      no_tin: !row.tin,
      sexAtBirth: (row.sex || row.sex_at_birth || 'FEMALE').toUpperCase(),
      sex_at_birth: (row.sex || row.sex_at_birth || 'FEMALE').toUpperCase(),
      civilStatus: (row.civil_status || 'SINGLE').toUpperCase(),
      civil_status: (row.civil_status || 'SINGLE').toUpperCase(),
      soloParent: row.solo_parent ? 'YES' : 'NO',
      religion: (row.religion || 'CHRISTIANITY').toUpperCase(),
      ethnicGroup: (row.ehtinic_group || row.ethnic_group || 'OTHERS').toUpperCase(),
      ethnic_group: (row.ehtinic_group || row.ethnic_group || 'OTHERS').toUpperCase(),
      birthdate: bDate,
      age: computedAge,
      employeeNo: row.employee_no || prn,
      employee_no: row.employee_no || prn,
      depedEmail: depedEmail,
      deped_email: depedEmail,

      isSchoolHead: isSchoolHead,
      is_school_head: isSchoolHead,

      // Employment Fields
      employmentId: empId,
      positionCategory: catObj.category,
      position_category: catObj.category,
      position: posName,
      stepIncrement,
      step_increment: stepIncrement,
      fundSource: (row.fund_source || 'NATIONAL').toUpperCase(),
      fund_source: (row.fund_source || 'NATIONAL').toUpperCase(),
      natureOfAppointment: (row.nature_of_appointment || 'REGULAR PERMANENT').toUpperCase(),
      nature_of_appointment: (row.nature_of_appointment || 'REGULAR PERMANENT').toUpperCase(),
      hiringArrangement: (row.hiring_arrangement || 'REGULAR').toUpperCase(),
      deploymentStatus: (row.status__item_ || 'OWN STATION').toUpperCase(),
      deployment_status: (row.status__item_ || 'OWN STATION').toUpperCase(),
      assignedSchools: [],
      assigned_schools: [],
      gradeLevelsTaught: gradeLevelsTaught,
      grade_levels_taught: gradeLevelsTaught,
      assignedGradeLevels: gradeLevelsTaught,
      assigned_grade_levels: gradeLevelsTaught,
      firstServiceDate: firstApptDate,
      lastPromotionDate: firstApptDate,
      newStationDate: stationDate,


      // Education Fields
      educationId: educId,
      collegeDegree: String(degree).toUpperCase(),
      college_degree: String(degree).toUpperCase(),
      major: String(major).toUpperCase(),
      minor: 'N/A',
      postGraduateDegree: String(postGrad).toUpperCase(),
      post_graduate_degree: String(postGrad).toUpperCase(),
      eligibility: [elig],

      workloadRows: teacherWorkloads,
      neapTrainingRows: [],
      certificationRows: [],
      otherTrainingRows: [],
      learningAreaMap: {},
      designations: []
    });
  }

  return list;
}



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

function formatTrainingRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    type: String(row.training_type).toLowerCase(),
    title: row.title,
    conductor: row.conductor || 'N/A',
    startDate: row.start_date ? (row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : String(row.start_date).split('T')[0]) : null,
    endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : String(row.end_date).split('T')[0]) : null,
    days: row.days || 0,
    totalHours: Number(row.total_hours || 0)
  };
}

function formatDesignationRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    designationName: row.designation_name,
    designation_name: row.designation_name,
    gradeLevel: row.grade_level || '',
    grade_level: row.grade_level || '',
    subjectArea: row.subject_area || '',
    subject_area: row.subject_area || '',
    track: row.track || '',
    isSdsApproved: !!row.is_sds_approved,
    is_sds_approved: !!row.is_sds_approved,
    sdsConfirmed: !!row.sds_confirmed,
    sds_confirmed: !!row.sds_confirmed,
    serializedKey: row.serialized_key,
    serialized_key: row.serialized_key,
    rawPayload: raw
  };
}

// Formatter to standardize database rows into frontend-compatible objects
function formatPersonnelRecord(row, trainingsList = [], designationsList = []) {
  if (!row) return null;
  const rawProfile = row.raw_payload || {};
  const rawEmp = row.employment_raw_payload || {};
  const rawEduc = row.educ_raw_payload || {};
  const rawLA = row.la_raw_payload || {};

  const neapRows = [];
  const certRows = [];
  const otherRows = [];

  for (const tr of trainingsList) {
    const formatted = formatTrainingRecord(tr);
    const type = String(tr.training_type).toUpperCase();
    if (type === 'NEAP') neapRows.push(formatted);
    else if (type === 'TESDA' || type === 'CERTIFICATION') certRows.push(formatted);
    else otherRows.push(formatted);
  }
  const formattedDesignations = designationsList.map(formatDesignationRecord);
  const primaryDesignation = formattedDesignations.length > 0 ? formattedDesignations[0].serializedKey : (rawProfile.designation || '');

  const catObj = determinePositionCategory(row.position);
  const finalType = (row.position_category ? (
    row.position_category.toLowerCase().includes('non') ? 'non-teaching' :
    row.position_category.toLowerCase().includes('related') ? 'teaching-related' : 'teaching'
  ) : catObj.type);

  return {
    ...rawProfile,
    ...rawEmp,
    ...rawEduc,
    ...rawLA,
    id: row.id,
    prn: row.prn,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    type: finalType,
    salutation: row.salutation || 'MR.',
    firstName: row.first_name,
    first_name: row.first_name,
    middleName: row.middle_name || '',
    middle_name: row.middle_name || '',
    lastName: row.last_name,
    last_name: row.last_name,
    nameExtension: row.name_extension || '',
    name_extension: row.name_extension || '',
    tin: row.tin || '',
    noTin: !!row.no_tin,
    no_tin: !!row.no_tin,
    sexAtBirth: row.sex_at_birth || '',
    sex_at_birth: row.sex_at_birth || '',
    civilStatus: row.civil_status || '',
    civil_status: row.civil_status || '',
    soloParent: row.solo_parent ? 'YES' : 'NO',
    religion: row.religion || '',
    ethnicGroup: row.ethnic_group || '',
    ethnic_group: row.ethnic_group || '',
    birthdate: row.birthdate ? (row.birthdate instanceof Date ? row.birthdate.toISOString().split('T')[0] : String(row.birthdate).split('T')[0]) : null,
    age: row.age || (row.birthdate ? calculateAge(row.birthdate) : null),
    philsysNo: row.philsys_no || '',
    philsys_no: row.philsys_no || '',
    employeeNo: row.employee_no || '',
    employee_no: row.employee_no || '',
    depedEmail: row.deped_email || '',
    deped_email: row.deped_email || '',
    isSchoolHead: !!row.is_school_head,
    is_school_head: !!row.is_school_head,

    // Employment Tab Fields
    employmentId: row.emp_id || null,
    positionCategory: catObj.category,
    position_category: catObj.category,
    position: row.position || '',
    stepIncrement: row.step_increment || 1,
    step_increment: row.step_increment || 1,
    fundSource: row.fund_source || '',
    fund_source: row.fund_source || '',
    natureOfAppointment: row.nature_of_appointment || '',
    nature_of_appointment: row.nature_of_appointment || '',
    hiringArrangement: row.hiring_arrangement || '',
    hiring_arrangement: row.hiring_arrangement || '',
    deploymentStatus: row.deployment_status || 'OWN STATION',
    deployment_status: row.deployment_status || 'OWN STATION',
    assignedSchools: row.assigned_schools || [],
    assigned_schools: row.assigned_schools || [],
    gradeLevelsTaught: row.grade_levels_taught || [],
    grade_levels_taught: row.grade_levels_taught || [],
    assignedGradeLevels: row.grade_levels_taught || [],
    assigned_grade_levels: row.grade_levels_taught || [],
    teachesShs: !!(rawEmp.teachesShs || rawEmp.teaches_shs || rawProfile.teachesShs) || (Array.isArray(row.grade_levels_taught) && row.grade_levels_taught.some(g => String(g).includes('11') || String(g).includes('12'))),
    teaches_shs: !!(rawEmp.teachesShs || rawEmp.teaches_shs || rawProfile.teachesShs) || (Array.isArray(row.grade_levels_taught) && row.grade_levels_taught.some(g => String(g).includes('11') || String(g).includes('12'))),
    firstServiceDate: row.first_service_date ? (row.first_service_date instanceof Date ? row.first_service_date.toISOString().split('T')[0] : String(row.first_service_date).split('T')[0]) : null,
    lastPromotionDate: row.last_promotion_date ? (row.last_promotion_date instanceof Date ? row.last_promotion_date.toISOString().split('T')[0] : String(row.last_promotion_date).split('T')[0]) : null,
    newStationDate: row.new_station_date ? (row.new_station_date instanceof Date ? row.new_station_date.toISOString().split('T')[0] : String(row.new_station_date).split('T')[0]) : null,
    lastLateralMovementDate: row.last_lateral_movement_date ? (row.last_lateral_movement_date instanceof Date ? row.last_lateral_movement_date.toISOString().split('T')[0] : String(row.last_lateral_movement_date).split('T')[0]) : null,

    // Education Tab Fields
    educationId: row.educ_id || null,
    collegeDegree: row.college_degree || '',
    college_degree: row.college_degree || '',
    major: row.major || '',
    minor: row.minor || '',
    postGraduateDegree: row.post_graduate_degree || 'N/A',
    post_graduate_degree: row.post_graduate_degree || 'N/A',
    postGraduateDiscipline: row.post_graduate_discipline || '',
    post_graduate_discipline: row.post_graduate_discipline || '',
    eligibility: row.eligibility || [],
    prcSpecialization: row.prc_specialization || '',
    prc_specialization: row.prc_specialization || '',

    // L&D Training Rows
    neapTrainingRows: neapRows,
    certificationRows: certRows,
    otherTrainingRows: otherRows,

    // Learning Area Matrix Tab
    learningAreaId: row.la_id || null,
    learningAreaMap: row.matrix_data || {},
    matrix_data: row.matrix_data || {},

    // Designations Tab (Relational table esf7_personnel_designations with sds_confirmed)
    designation: primaryDesignation,
    designations: formattedDesignations,

    rawPayload: { ...rawProfile, ...rawEmp, ...rawEduc, ...rawLA }
  };
}

// GET all personnel profiles JOINED with Employment, Education, Trainings, Learning Areas & Designations
router.get('/', async (req, res) => {
  try {
    let schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id;
    if (!schoolId) {
      schoolId = '108348';
    }

    const cleanSchoolId = schoolId.replace('SCH-', '');

    // 1. Auto-fill personnel from insightEd.esf7_database if 0 personnel records exist locally!
    let result = await db.query(`
      SELECT 
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment,
        e.fund_source,
        e.nature_of_appointment,
        e.hiring_arrangement,
        e.deployment_status,
        e.assigned_schools,
        e.grade_levels_taught,
        e.first_service_date,
        e.last_promotion_date,
        e.new_station_date,
        e.last_lateral_movement_date,
        e.raw_payload AS employment_raw_payload,
        ed.id AS educ_id,
        ed.college_degree,
        ed.major,
        ed.minor,
        ed.post_graduate_degree,
        ed.post_graduate_discipline,
        ed.eligibility,
        ed.prc_specialization,
        ed.raw_payload AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        la.raw_payload AS la_raw_payload
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
      WHERE p.school_id = $1 OR p.school_id = $2
      ORDER BY p.created_at ASC, p.id ASC
    `, [cleanSchoolId, `SCH-${cleanSchoolId}`]);

    if (result.rows.length === 0) {
      const draftList = await fetchMasterPersonnelFromInsightEd(cleanSchoolId);
      return res.json(draftList);
    }

    const formattedList = [];
    for (const row of result.rows) {
      const trRes = await db.query(
        `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
        [row.id]
      );
      const dsgRes = await db.query(
        `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
        [row.id]
      );
      formattedList.push(formatPersonnelRecord(row, trRes.rows, dsgRes.rows));
    }

    res.json(formattedList);
  } catch (err) {
    console.error('Error fetching personnel profiles:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/personnel/autofill-template
router.get('/autofill-template', async (req, res) => {
  try {
    let schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || '502949';
    const list = await fetchMasterPersonnelFromInsightEd(schoolId);
    res.json(list);
  } catch (err) {
    console.error('Error in /autofill-template:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET single personnel profile by ID
router.get('/:id', async (req, res) => {

  try {
    const result = await db.query(`
      SELECT 
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment,
        e.fund_source,
        e.nature_of_appointment,
        e.hiring_arrangement,
        e.deployment_status,
        e.assigned_schools,
        e.grade_levels_taught,
        e.first_service_date,
        e.last_promotion_date,
        e.new_station_date,
        e.last_lateral_movement_date,
        e.raw_payload AS employment_raw_payload,
        ed.id AS educ_id,
        ed.college_degree,
        ed.major,
        ed.minor,
        ed.post_graduate_degree,
        ed.post_graduate_discipline,
        ed.eligibility,
        ed.prc_specialization,
        ed.raw_payload AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        la.raw_payload AS la_raw_payload
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
      WHERE p.id = $1 OR p.prn = $1 
      LIMIT 1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Personnel profile not found' });
    }

    const row = result.rows[0];
    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );
    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );

    res.json(formatPersonnelRecord(row, trRes.rows, dsgRes.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to sync trainings in transaction
async function syncTrainingsInTransaction(client, personnelId, neapTrainingRows, certificationRows, otherTrainingRows) {
  if (!neapTrainingRows && !certificationRows && !otherTrainingRows) return;

  await client.query('DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = $1', [personnelId]);

  const allTrainings = [
    ...(neapTrainingRows || []).map(t => ({ ...t, training_type: 'NEAP' })),
    ...(certificationRows || []).map(t => ({ ...t, training_type: 'TESDA' })),
    ...(otherTrainingRows || []).map(t => ({ ...t, training_type: 'OTHER' }))
  ];

  let counter = 1;
  for (const t of allTrainings) {
    const trnId = `TRN-${personnelId.replace('PER-', '')}-${String(counter++).padStart(3, '0')}`;
    const type = (t.training_type || t.type || 'OTHER').toUpperCase();
    const title = t.title || 'Professional Training';
    const conductor = t.conductor || 'NEAP / DepEd';
    const startDate = t.startDate || t.start_date || null;
    const endDate = t.endDate || t.end_date || null;
    const days = t.days ? Number(t.days) : 0;
    const totalHours = t.totalHours ? Number(t.totalHours) : (t.total_hours ? Number(t.total_hours) : 0);

    await client.query(
      `INSERT INTO esf7_personnel_ld_trainings (
        id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [trnId, personnelId, type, title, conductor, startDate, endDate, days, totalHours, JSON.stringify(t)]
    );
  }
}

// Helper function to sync learning areas matrix in transaction
async function syncLearningAreasInTransaction(client, personnelId, targetSchoolId, learningAreaMap, matrix_data, reqBody) {
  const targetMap = learningAreaMap || matrix_data;
  if (!targetMap) return;

  const countRes = await client.query(`SELECT COUNT(*) FROM esf7_personnel_learning_areas`);
  const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
  const laId = `LA-${targetSchoolId.replace('SCH-', '')}-${seq}`;

  await client.query(
    `INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, raw_payload)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (personnel_id) DO UPDATE SET
       matrix_data = EXCLUDED.matrix_data,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = NOW()`,
    [laId, personnelId, JSON.stringify(targetMap), JSON.stringify(reqBody)]
  );
}

// Helper function to sync designations in transaction
async function syncDesignationsInTransaction(client, personnelId, targetSchoolId, designation, designations, reqBody) {
  if (!designation && !designations) return;

  await client.query('DELETE FROM esf7_personnel_designations WHERE personnel_id = $1', [personnelId]);

  let desigList = [];
  if (Array.isArray(designations) && designations.length > 0) {
    desigList = designations;
  } else if (designation && typeof designation === 'string' && designation.trim().length > 0) {
    desigList = [{ designation: designation.trim() }];
  }

  let counter = 1;
  for (const d of desigList) {
    const dsgId = `DSG-${targetSchoolId.replace('SCH-', '')}-${String(counter++).padStart(3, '0')}`;
    const key = d.serializedKey || d.serialized_key || d.designation || d.designation_name || d.name || 'OFFICIAL DESIGNATION';
    const isApproved = d.isSdsApproved === true || d.is_sds_approved === true || key.endsWith('::APPROVED_SDS');
    const isConfirmed = d.sdsConfirmed === true || d.sds_confirmed === true;
    const name = d.designationName || d.designation_name || d.name || key.split(' - ')[0].replace('::APPROVED_SDS', '').trim();

    await client.query(
      `INSERT INTO esf7_personnel_designations (
        id, personnel_id, designation_name, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        dsgId,
        personnelId,
        name,
        d.gradeLevel || d.grade_level || null,
        d.subjectArea || d.subject_area || null,
        d.track || null,
        isApproved,
        isConfirmed,
        key,
        JSON.stringify(d)
      ]
    );
  }
}

// POST Add new personnel profile
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const {
      school_id, schoolId: bodySchoolId, school_year, schoolYear: bodySchoolYear,
      type, salutation, first_name, firstName, middle_name, middleName,
      last_name, lastName, name_extension, nameExtension,
      sex_at_birth, sexAtBirth, civil_status, civilStatus,
      solo_parent, soloParent, religion, ethnic_group, ethnicGroup,
      birthdate, age, philsys_no, philsysNo, tin, no_tin, noTin,
      employee_no, employeeNo, deped_email, depedEmail, is_school_head, isSchoolHead,
      prn: inputPrn,
      // Employment fields
      position_category, positionCategory, position, step_increment, stepIncrement,
      fund_source, fundSource, nature_of_appointment, natureOfAppointment,
      hiring_arrangement, hiringArrangement, deployment_status, deploymentStatus,
      assigned_schools, assignedSchools, grade_levels_taught, gradeLevelsTaught, assignedGradeLevels, assigned_grade_levels,
      first_service_date, firstServiceDate, last_promotion_date, lastPromotionDate,
      new_station_date, newStationDate, last_lateral_movement_date, lastLateralMovementDate,
      // Education fields
      college_degree, collegeDegree, major, minor,
      post_graduate_degree, postGraduateDegree,
      post_graduate_discipline, postGraduateDiscipline, postGraduateDisciplineCustom,
      eligibility, prc_specialization, prcSpecialization,
      // L&D Training rows
      neapTrainingRows, certificationRows, otherTrainingRows,
      // Learning Area Map
      learningAreaMap, matrix_data,
      // Designations
      designation, designations
    } = req.body;

    const targetSchoolId = school_id || bodySchoolId || '108348';
    const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';

    // Sequence ID Generation
    const countRes = await client.query(
      `SELECT COUNT(*) FROM esf7_personnel_profile WHERE school_id = $1`,
      [targetSchoolId]
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const customId = req.body.id || `PER-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const prn = inputPrn || Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const finalFirstName = (first_name || firstName || '').toUpperCase();
    const finalLastName = (last_name || lastName || '').toUpperCase();
    const finalMiddleName = (middle_name || middleName || '').toUpperCase();
    const finalSalutation = (salutation || 'MR.').toUpperCase();
    const finalSex = (sex_at_birth || sexAtBirth || 'MALE').toUpperCase();
    const computedAge = calculateAge(birthdate) || (age ? Number(age) : null);

    const insertProfileQuery = `
      INSERT INTO esf7_personnel_profile (
        id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
        tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
        philsys_no, employee_no, deped_email, is_school_head, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      RETURNING *;
    `;

    const profileValues = [
      customId,
      prn,
      targetSchoolId,
      targetSchoolYear,
      type || 'teaching',
      finalSalutation,
      finalFirstName,
      finalMiddleName || null,
      finalLastName,
      (name_extension || nameExtension || '').toUpperCase() || null,
      tin || null,
      no_tin === true || noTin === true,
      finalSex,
      (civil_status || civilStatus || '').toUpperCase() || null,
      solo_parent === true || soloParent === 'YES' || soloParent === true,
      (religion || '').toUpperCase() || null,
      (ethnic_group || ethnicGroup || '').toUpperCase() || null,
      birthdate || null,
      computedAge,
      philsys_no || philsysNo || null,
      employee_no || employeeNo || null,
      deped_email || depedEmail || '',
      is_school_head === true || isSchoolHead === true,
      JSON.stringify(req.body)
    ];

    const profileRes = await client.query(insertProfileQuery, profileValues);
    const createdProfile = profileRes.rows[0];

    // Insert linked employment
    const empCat = (position_category || positionCategory || type || 'TEACHING').toUpperCase();
    const empPos = (position || 'TEACHER I').toUpperCase();
    const empStep = Number(step_increment || stepIncrement || 1);
    const empFund = (fund_source || fundSource || 'NATIONAL').toUpperCase();
    const empAppt = (nature_of_appointment || natureOfAppointment || 'REGULAR PERMANENT').toUpperCase();
    const empHire = (hiring_arrangement || hiringArrangement || 'PERMANENT').toUpperCase();
    const empDeploy = (deployment_status || deploymentStatus || 'OWN STATION').toUpperCase();
    const empId = `EMP-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const insertEmpQuery = `
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

    const empValues = [
      empId,
      createdProfile.id,
      empCat,
      empPos,
      empStep,
      empFund,
      empAppt,
      empHire,
      empDeploy,
      JSON.stringify(assigned_schools || assignedSchools || []),
      JSON.stringify(assignedGradeLevels || assigned_grade_levels || grade_levels_taught || gradeLevelsTaught || []),
      first_service_date || firstServiceDate || null,
      last_promotion_date || lastPromotionDate || null,
      new_station_date || newStationDate || null,
      last_lateral_movement_date || lastLateralMovementDate || null,
      JSON.stringify(req.body)
    ];

    const empRes = await client.query(insertEmpQuery, empValues);

    // Insert linked education
    const eduDegree = (college_degree || collegeDegree || 'BACHELOR OF SECONDARY EDUCATION').toUpperCase();
    const eduMaj = (major || '').toUpperCase();
    const eduMin = (minor || '').toUpperCase();
    const eduPostDeg = (post_graduate_degree || postGraduateDegree || 'N/A').toUpperCase();
    const eduPostDisc = (post_graduate_discipline || postGraduateDiscipline || postGraduateDisciplineCustom || '').toUpperCase();
    const eduPrcSpec = (prc_specialization || prcSpecialization || '').toUpperCase();
    const eduId = `EDU-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    let eligibilityArray = [];
    if (Array.isArray(eligibility)) {
      eligibilityArray = eligibility;
    } else if (typeof eligibility === 'string' && eligibility.trim().length > 0) {
      eligibilityArray = eligibility.split(',').map(s => s.trim()).filter(Boolean);
    }

    const insertEducQuery = `
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, college_degree, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        college_degree = EXCLUDED.college_degree,
        major = EXCLUDED.major,
        minor = EXCLUDED.minor,
        post_graduate_degree = EXCLUDED.post_graduate_degree,
        post_graduate_discipline = EXCLUDED.post_graduate_discipline,
        eligibility = EXCLUDED.eligibility,
        prc_specialization = EXCLUDED.prc_specialization,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const educValues = [
      eduId,
      createdProfile.id,
      eduDegree,
      eduMaj || null,
      eduMin || null,
      eduPostDeg,
      eduPostDisc || null,
      JSON.stringify(eligibilityArray),
      eduPrcSpec || null,
      JSON.stringify(req.body)
    ];

    const educRes = await client.query(insertEducQuery, educValues);

    // Sync training rows into esf7_personnel_ld_trainings
    await syncTrainingsInTransaction(client, createdProfile.id, neapTrainingRows, certificationRows, otherTrainingRows);

    // Sync learning area matrix into esf7_personnel_learning_areas
    await syncLearningAreasInTransaction(client, createdProfile.id, targetSchoolId, learningAreaMap, matrix_data, req.body);

    // Sync designations into esf7_personnel_designations
    await syncDesignationsInTransaction(client, createdProfile.id, targetSchoolId, designation, designations, req.body);

    await client.query('COMMIT');

    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [createdProfile.id]
    );

    const laRes = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [createdProfile.id]
    );

    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [createdProfile.id]
    );

    const laRow = laRes.rows.length > 0 ? laRes.rows[0] : {};

    const combinedRow = {
      ...createdProfile,
      emp_id: empRes.rows[0].id,
      position_category: empRes.rows[0].position_category,
      position: empRes.rows[0].position,
      step_increment: empRes.rows[0].step_increment,
      fund_source: empRes.rows[0].fund_source,
      nature_of_appointment: empRes.rows[0].nature_of_appointment,
      hiring_arrangement: empRes.rows[0].hiring_arrangement,
      deployment_status: empRes.rows[0].deployment_status,
      assigned_schools: empRes.rows[0].assigned_schools,
      grade_levels_taught: empRes.rows[0].grade_levels_taught,
      first_service_date: empRes.rows[0].first_service_date,
      last_promotion_date: empRes.rows[0].last_promotion_date,
      new_station_date: empRes.rows[0].new_station_date,
      last_lateral_movement_date: empRes.rows[0].last_lateral_movement_date,
      employment_raw_payload: empRes.rows[0].raw_payload,
      educ_id: educRes.rows[0].id,
      college_degree: educRes.rows[0].college_degree,
      major: educRes.rows[0].major,
      minor: educRes.rows[0].minor,
      post_graduate_degree: educRes.rows[0].post_graduate_degree,
      post_graduate_discipline: educRes.rows[0].post_graduate_discipline,
      eligibility: educRes.rows[0].eligibility,
      prc_specialization: educRes.rows[0].prc_specialization,
      educ_raw_payload: educRes.rows[0].raw_payload,
      la_id: laRow.id || null,
      matrix_data: laRow.matrix_data || {},
      la_raw_payload: laRow.raw_payload || {}
    };

    res.status(201).json(formatPersonnelRecord(combinedRow, trRes.rows, dsgRes.rows));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error inserting personnel record:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT Update personnel profile and linked records
router.put('/:id', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const targetId = req.params.id;

    const existingRes = await client.query(`SELECT * FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`, [targetId]);
    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Personnel profile not found.' });
    }

    const existingRow = existingRes.rows[0];
    const {
      type, salutation, first_name, firstName, middle_name, middleName,
      last_name, lastName, name_extension, nameExtension,
      sex_at_birth, sexAtBirth, civil_status, civilStatus,
      solo_parent, soloParent, religion, ethnic_group, ethnicGroup,
      birthdate, age, philsys_no, philsysNo, tin, no_tin, noTin,
      employee_no, employeeNo, deped_email, depedEmail, is_school_head, isSchoolHead,
      // Employment fields
      position_category, positionCategory, position, step_increment, stepIncrement,
      fund_source, fundSource, nature_of_appointment, natureOfAppointment,
      hiring_arrangement, hiringArrangement, deployment_status, deploymentStatus,
      assigned_schools, assignedSchools, grade_levels_taught, gradeLevelsTaught, assignedGradeLevels, assigned_grade_levels,
      first_service_date, firstServiceDate, last_promotion_date, lastPromotionDate,
      new_station_date, newStationDate, last_lateral_movement_date, lastLateralMovementDate,
      // Education fields
      college_degree, collegeDegree, major, minor,
      post_graduate_degree, postGraduateDegree,
      post_graduate_discipline, postGraduateDiscipline, postGraduateDisciplineCustom,
      eligibility, prc_specialization, prcSpecialization,
      // L&D Training rows
      neapTrainingRows, certificationRows, otherTrainingRows,
      // Learning Area Map
      learningAreaMap, matrix_data,
      // Designations
      designation, designations
    } = req.body;

    const updatedProfilePayload = { ...(existingRow.raw_payload || {}), ...req.body };
    const computedAge = calculateAge(birthdate) || (age ? Number(age) : existingRow.age);

    const updateProfileQuery = `
      UPDATE esf7_personnel_profile
      SET 
        type = COALESCE($1, type),
        salutation = COALESCE($2, salutation),
        first_name = COALESCE($3, first_name),
        middle_name = COALESCE($4, middle_name),
        last_name = COALESCE($5, last_name),
        name_extension = COALESCE($6, name_extension),
        tin = COALESCE($7, tin),
        no_tin = COALESCE($8, no_tin),
        sex_at_birth = COALESCE($9, sex_at_birth),
        civil_status = COALESCE($10, civil_status),
        solo_parent = COALESCE($11, solo_parent),
        religion = COALESCE($12, religion),
        ethnic_group = COALESCE($13, ethnic_group),
        birthdate = COALESCE($14, birthdate),
        age = COALESCE($15, age),
        philsys_no = COALESCE($16, philsys_no),
        employee_no = COALESCE($17, employee_no),
        deped_email = COALESCE($18, deped_email),
        is_school_head = COALESCE($19, is_school_head),
        raw_payload = $20,
        updated_at = NOW()
      WHERE id = $21 OR prn = $21
      RETURNING *;
    `;

    const profileValues = [
      type || null,
      salutation ? salutation.toUpperCase() : null,
      (first_name || firstName) ? (first_name || firstName).toUpperCase() : null,
      (middle_name || middleName) ? (middle_name || middleName).toUpperCase() : null,
      (last_name || lastName) ? (last_name || lastName).toUpperCase() : null,
      (name_extension || nameExtension) ? (name_extension || nameExtension).toUpperCase() : null,
      tin || null,
      no_tin !== undefined ? no_tin === true : (noTin !== undefined ? noTin === true : null),
      (sex_at_birth || sexAtBirth) ? (sex_at_birth || sexAtBirth).toUpperCase() : null,
      (civil_status || civilStatus) ? (civil_status || civilStatus).toUpperCase() : null,
      solo_parent !== undefined ? solo_parent === true : (soloParent !== undefined ? (soloParent === 'YES' || soloParent === true) : null),
      religion ? religion.toUpperCase() : null,
      (ethnic_group || ethnicGroup) ? (ethnic_group || ethnicGroup).toUpperCase() : null,
      birthdate || null,
      computedAge || null,
      philsys_no || philsysNo || null,
      employee_no || employeeNo || null,
      deped_email || depedEmail || null,
      is_school_head !== undefined ? is_school_head === true : (isSchoolHead !== undefined ? isSchoolHead === true : null),
      JSON.stringify(updatedProfilePayload),
      targetId
    ];

    const profileRes = await client.query(updateProfileQuery, profileValues);
    const updatedProfile = profileRes.rows[0];

    // Upsert linked employment
    const empCat = (position_category || positionCategory || updatedProfile.type || 'TEACHING').toUpperCase();
    const empPos = (position || 'TEACHER I').toUpperCase();
    const empStep = Number(step_increment || stepIncrement || 1);
    const empFund = (fund_source || fundSource || 'NATIONAL').toUpperCase();
    const empAppt = (nature_of_appointment || natureOfAppointment || 'REGULAR PERMANENT').toUpperCase();
    const empHire = (hiring_arrangement || hiringArrangement || 'PERMANENT').toUpperCase();
    const empDeploy = (deployment_status || deploymentStatus || 'OWN STATION').toUpperCase();

    const empId = `EMP-${updatedProfile.school_id.replace('SCH-', '')}-${updatedProfile.id.split('-').pop()}`;

    const upsertEmpQuery = `
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment,
        hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught,
        first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        position_category = COALESCE(EXCLUDED.position_category, esf7_personnel_employment.position_category),
        position = COALESCE(EXCLUDED.position, esf7_personnel_employment.position),
        step_increment = COALESCE(EXCLUDED.step_increment, esf7_personnel_employment.step_increment),
        fund_source = COALESCE(EXCLUDED.fund_source, esf7_personnel_employment.fund_source),
        nature_of_appointment = COALESCE(EXCLUDED.nature_of_appointment, esf7_personnel_employment.nature_of_appointment),
        hiring_arrangement = COALESCE(EXCLUDED.hiring_arrangement, esf7_personnel_employment.hiring_arrangement),
        deployment_status = COALESCE(EXCLUDED.deployment_status, esf7_personnel_employment.deployment_status),
        assigned_schools = COALESCE(EXCLUDED.assigned_schools, esf7_personnel_employment.assigned_schools),
        grade_levels_taught = COALESCE(EXCLUDED.grade_levels_taught, esf7_personnel_employment.grade_levels_taught),
        first_service_date = COALESCE(EXCLUDED.first_service_date, esf7_personnel_employment.first_service_date),
        last_promotion_date = COALESCE(EXCLUDED.last_promotion_date, esf7_personnel_employment.last_promotion_date),
        new_station_date = COALESCE(EXCLUDED.new_station_date, esf7_personnel_employment.new_station_date),
        last_lateral_movement_date = COALESCE(EXCLUDED.last_lateral_movement_date, esf7_personnel_employment.last_lateral_movement_date),
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const empValues = [
      empId,
      updatedProfile.id,
      empCat,
      empPos,
      empStep,
      empFund,
      empAppt,
      empHire,
      empDeploy,
      JSON.stringify(assigned_schools || assignedSchools || []),
      JSON.stringify(assignedGradeLevels || assigned_grade_levels || grade_levels_taught || gradeLevelsTaught || []),
      first_service_date || firstServiceDate || null,
      last_promotion_date || lastPromotionDate || null,
      new_station_date || newStationDate || null,
      last_lateral_movement_date || lastLateralMovementDate || null,
      JSON.stringify(req.body)
    ];

    const empRes = await client.query(upsertEmpQuery, empValues);

    // Upsert linked education
    const eduDegree = (college_degree || collegeDegree || 'BACHELOR OF SECONDARY EDUCATION').toUpperCase();
    const eduMaj = (major || '').toUpperCase();
    const eduMin = (minor || '').toUpperCase();
    const eduPostDeg = (post_graduate_degree || postGraduateDegree || 'N/A').toUpperCase();
    const eduPostDisc = (post_graduate_discipline || postGraduateDiscipline || postGraduateDisciplineCustom || '').toUpperCase();
    const eduPrcSpec = (prc_specialization || prcSpecialization || '').toUpperCase();
    const eduId = `EDU-${updatedProfile.school_id.replace('SCH-', '')}-${updatedProfile.id.split('-').pop()}`;

    let eligibilityArray = [];
    if (Array.isArray(eligibility)) {
      eligibilityArray = eligibility;
    } else if (typeof eligibility === 'string' && eligibility.trim().length > 0) {
      eligibilityArray = eligibility.split(',').map(s => s.trim()).filter(Boolean);
    }

    const upsertEducQuery = `
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, college_degree, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        college_degree = COALESCE(EXCLUDED.college_degree, esf7_perssonel_educ.college_degree),
        major = COALESCE(EXCLUDED.major, esf7_perssonel_educ.major),
        minor = COALESCE(EXCLUDED.minor, esf7_perssonel_educ.minor),
        post_graduate_degree = COALESCE(EXCLUDED.post_graduate_degree, esf7_perssonel_educ.post_graduate_degree),
        post_graduate_discipline = COALESCE(EXCLUDED.post_graduate_discipline, esf7_perssonel_educ.post_graduate_discipline),
        eligibility = COALESCE(EXCLUDED.eligibility, esf7_perssonel_educ.eligibility),
        prc_specialization = COALESCE(EXCLUDED.prc_specialization, esf7_perssonel_educ.prc_specialization),
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const educValues = [
      eduId,
      updatedProfile.id,
      eduDegree,
      eduMaj || null,
      eduMin || null,
      eduPostDeg,
      eduPostDisc || null,
      JSON.stringify(eligibilityArray),
      eduPrcSpec || null,
      JSON.stringify(req.body)
    ];

    const educRes = await client.query(upsertEducQuery, educValues);

    // Sync L&D training rows into esf7_personnel_ld_trainings
    await syncTrainingsInTransaction(client, updatedProfile.id, neapTrainingRows, certificationRows, otherTrainingRows);

    // Sync learning area matrix into esf7_personnel_learning_areas
    await syncLearningAreasInTransaction(client, updatedProfile.id, updatedProfile.school_id, learningAreaMap, matrix_data, req.body);

    // Sync designations into esf7_personnel_designations
    await syncDesignationsInTransaction(client, updatedProfile.id, updatedProfile.school_id, designation, designations, req.body);

    await client.query('COMMIT');

    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [updatedProfile.id]
    );

    const laRes = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [updatedProfile.id]
    );

    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [updatedProfile.id]
    );

    const laRow = laRes.rows.length > 0 ? laRes.rows[0] : {};

    const combinedRow = {
      ...updatedProfile,
      emp_id: empRes.rows[0].id,
      position_category: empRes.rows[0].position_category,
      position: empRes.rows[0].position,
      step_increment: empRes.rows[0].step_increment,
      fund_source: empRes.rows[0].fund_source,
      nature_of_appointment: empRes.rows[0].nature_of_appointment,
      hiring_arrangement: empRes.rows[0].hiring_arrangement,
      deployment_status: empRes.rows[0].deployment_status,
      assigned_schools: empRes.rows[0].assigned_schools,
      grade_levels_taught: empRes.rows[0].grade_levels_taught,
      first_service_date: empRes.rows[0].first_service_date,
      last_promotion_date: empRes.rows[0].last_promotion_date,
      new_station_date: empRes.rows[0].new_station_date,
      last_lateral_movement_date: empRes.rows[0].last_lateral_movement_date,
      employment_raw_payload: empRes.rows[0].raw_payload,
      educ_id: educRes.rows[0].id,
      college_degree: educRes.rows[0].college_degree,
      major: educRes.rows[0].major,
      minor: educRes.rows[0].minor,
      post_graduate_degree: educRes.rows[0].post_graduate_degree,
      post_graduate_discipline: educRes.rows[0].post_graduate_discipline,
      eligibility: educRes.rows[0].eligibility,
      prc_specialization: educRes.rows[0].prc_specialization,
      educ_raw_payload: educRes.rows[0].raw_payload,
      la_id: laRow.id || null,
      matrix_data: laRow.matrix_data || {},
      la_raw_payload: laRow.raw_payload || {}
    };

    res.json(formatPersonnelRecord(combinedRow, trRes.rows, dsgRes.rows));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating personnel profile:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE personnel profile (ON DELETE CASCADE automatically removes linked records)
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_personnel_profile WHERE id = $1 OR prn = $1`, [req.params.id]);
    res.json({ success: true, message: `Personnel profile ${req.params.id} and all linked records deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
