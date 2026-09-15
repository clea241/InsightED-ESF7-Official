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

const parsePostGraduateDiscipline = (rawDiscipline, rawEduc = {}, rawProfile = {}, highestAttainment = '') => {
  let masters = [];
  let doctorate = [];

  const extractList = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
        } catch (e) {}
      }
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  if (rawDiscipline && typeof rawDiscipline === 'object' && !Array.isArray(rawDiscipline)) {
    if (Array.isArray(rawDiscipline.masters)) masters = rawDiscipline.masters;
    if (Array.isArray(rawDiscipline.doctorate)) doctorate = rawDiscipline.doctorate;
  } else if (typeof rawDiscipline === 'string' && rawDiscipline.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawDiscipline);
      if (Array.isArray(parsed.masters)) masters = parsed.masters;
      if (Array.isArray(parsed.doctorate)) doctorate = parsed.doctorate;
    } catch (e) {}
  } else if (rawDiscipline) {
    const list = extractList(rawDiscipline);
    if (String(highestAttainment).toUpperCase().includes('DOCTOR')) {
      doctorate = list;
    } else {
      masters = list;
    }
  }

  const combinedSource = { ...rawProfile, ...rawEduc };
  if (masters.length === 0) {
    if (combinedSource.mastersDisciplines) {
      masters = extractList(combinedSource.mastersDisciplines);
    } else if (combinedSource.mastersDiscipline) {
      masters = extractList(combinedSource.mastersDiscipline);
    }
  }

  if (doctorate.length === 0) {
    if (combinedSource.doctorateDisciplines) {
      doctorate = extractList(combinedSource.doctorateDisciplines);
    } else if (combinedSource.doctorateDiscipline) {
      doctorate = extractList(combinedSource.doctorateDiscipline);
    }
  }

  const degreeRows = combinedSource.degreeRows || [];
  if (Array.isArray(degreeRows)) {
    for (const d of degreeRows) {
      const lvl = String(d.level || '').toUpperCase();
      const dList = extractList(d.postGraduateDiscipline || d.discipline || d.disciplines);
      if (lvl === 'MASTERS' && masters.length === 0) masters.push(...dList);
      if (lvl === 'DOCTORATE' && doctorate.length === 0) doctorate.push(...dList);
    }
  }

  masters = [...new Set(masters.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  doctorate = [...new Set(doctorate.map(s => String(s).trim().toUpperCase()).filter(Boolean))];

  return {
    masters,
    doctorate,
    mastersDiscipline: masters.join(', '),
    doctorateDiscipline: doctorate.join(', '),
    jsonString: JSON.stringify({ masters, doctorate }),
    rawObject: { masters, doctorate }
  };
};

const sanitizeGradeLevel = (rawLvl, secName = '') => {
  if (!rawLvl && !secName) return null;
  const str = String(rawLvl || '').trim();
  const upper = str.toUpperCase();

  // 1. Filter out delivery modes / section types that are NOT grade levels
  if (
    upper.includes('MULTI-GRADE') || upper.includes('MULTIGRADE') || upper.includes('MULTI GRADE') ||
    upper.includes('MONO-GRADE') || upper.includes('MONOGRADE') || upper.includes('MONO GRADE')
  ) {
    if (secName) {
      const secMatch = String(secName).match(/(?:Grade\s*|G)(\d{1,2})/i);
      if (secMatch) return `Grade ${secMatch[1]}`;
      if (String(secName).toUpperCase().includes('KINDER')) return 'Kinder';
      if (String(secName).toUpperCase().includes('SNED') || String(secName).toUpperCase().includes('NON-GRADED') || String(secName).toUpperCase().includes('SPED')) return 'SNED (NON-GRADED)';
      if (String(secName).toUpperCase().includes('ALS')) return 'ALS';
    }
    return null;
  }

  // 2. Handle Kinder / Kindergarten / Grade KINDER
  if (upper.includes('KINDER')) {
    return 'Kinder';
  }

  // 3. Handle Special Programs (SNED & NON-GRADED unified)
  if (upper === 'SNED' || upper === 'SPED' || upper === 'NON-GRADED' || upper === 'NON GRADED' || upper.includes('SNED') || upper.includes('NON-GRADED') || upper.includes('NON GRADED')) {
    return 'SNED (NON-GRADED)';
  }
  if (upper === 'ALS') return 'ALS';

  // 4. Handle Numeric e.g. "7", "G7", "Grade 7"
  const numMatch = str.match(/(?:Grade\s*|G|^)(\d{1,2})$/i) || str.match(/(\d{1,2})/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= 12) {
      return `Grade ${num}`;
    }
  }

  if (upper.startsWith('GRADE ')) {
    const rest = str.substring(6).trim();
    if (rest.toUpperCase().includes('KINDER')) return 'Kinder';
    if (rest.toUpperCase().includes('MULTI') || rest.toUpperCase().includes('MONO')) return null;
    if (rest.toUpperCase().includes('SNED') || rest.toUpperCase().includes('NON-GRADED') || rest.toUpperCase().includes('SPED')) return 'SNED (NON-GRADED)';
    return `Grade ${rest}`;
  }

  return str || null;
};

const sanitizeGradeArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  const res = [];
  for (const item of arr) {
    const sanitized = sanitizeGradeLevel(item);
    if (sanitized && !res.includes(sanitized)) {
      res.push(sanitized);
    }
  }
  return res;
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

const CANONICAL_POSITIONS_BY_CATEGORY = {
  teaching: [
    "TEACHER I", "TEACHER II", "TEACHER III", "TEACHER IV", "TEACHER IV - SNED",
    "TEACHER V", "TEACHER V - SNED", "TEACHER VI", "TEACHER VI - SNED",
    "TEACHER VII", "TEACHER VII - SNED", "EXTERNAL TUTOR",
    "SPECIAL SCIENCE TEACHER I", "SPECIAL SCIENCE TEACHER II", "SPECIAL SCIENCE TEACHER III",
    "SPECIAL SCIENCE TEACHER IV", "SPECIAL SCIENCE TEACHER V",
    "MASTER TEACHER I", "MASTER TEACHER II", "MASTER TEACHER III", "MASTER TEACHER IV",
    "ALIVE TEACHER"
  ],
  "teaching-related": [
    "TIC - HEAD TEACHER I", "TIC - HEAD TEACHER II", "TIC - HEAD TEACHER III",
    "TIC - HEAD TEACHER IV", "TIC - HEAD TEACHER V", "TIC - HEAD TEACHER VI",
    "GUIDANCE DESIGNATE - HEAD TEACHER I", "GUIDANCE DESIGNATE - HEAD TEACHER II",
    "GUIDANCE DESIGNATE - HEAD TEACHER III", "GUIDANCE DESIGNATE - HEAD TEACHER IV",
    "GUIDANCE DESIGNATE - HEAD TEACHER V", "GUIDANCE DESIGNATE - HEAD TEACHER VI",
    "CLINIC - HEAD TEACHER I", "CLINIC - HEAD TEACHER II", "CLINIC - HEAD TEACHER III",
    "CLINIC - HEAD TEACHER IV", "CLINIC - HEAD TEACHER V", "CLINIC - HEAD TEACHER VI",
    "ASSISTANT SCHOOL PRINCIPAL I", "ASSISTANT SCHOOL PRINCIPAL II", "ASSISTANT SCHOOL PRINCIPAL III",
    "ASSISTANT SPECIAL SCHOOL PRINCIPAL", "GUIDANCE COORDINATOR I", "GUIDANCE COORDINATOR II",
    "GUIDANCE COORDINATOR III", "GUIDANCE COUNSELOR I", "GUIDANCE COUNSELOR II",
    "GUIDANCE COUNSELOR III", "HEAD TEACHER I", "HEAD TEACHER II", "HEAD TEACHER III",
    "HEAD TEACHER IV", "HEAD TEACHER V", "HEAD TEACHER VI",
    "SCHOOL PRINCIPAL I", "SCHOOL PRINCIPAL II", "SCHOOL PRINCIPAL III", "SCHOOL PRINCIPAL IV",
    "SPECIAL SCHOOL PRINCIPAL I", "SPECIAL SCHOOL PRINCIPAL II",
    "GUIDANCE SERVICES SPECIALIST", "VOCATIONAL SCHOOL ADMINISTRATOR", "VOCATIONAL SCHOOL SUPERINTENDENT"
  ],
  "non-teaching": [
    "ACCOUNTANT", "ACCOUNTING CLERK", "ADMINISTRATIVE AIDE",
    "ADMINISTRATIVE AIDE I (ADA I)", "ADMINISTRATIVE AIDE II (ADA II)",
    "ADMINISTRATIVE AIDE III (ADA III)", "ADMINISTRATIVE AIDE IV (ADA IV)",
    "ADMINISTRATIVE AIDE V (ADA V)", "ADMINISTRATIVE AIDE VI (ADA VI)",
    "ADMINISTRATIVE ASSISTANT", "ADMINISTRATIVE ASSISTANT I (ADAS I)",
    "ADMINISTRATIVE ASSISTANT II (ADAS II)", "ADMINISTRATIVE ASSISTANT III (ADAS III)",
    "ADMINISTRATIVE ASSISTANT IV (ADAS IV)", "ADMINISTRATIVE ASSISTANT V (ADAS V)",
    "ADMINISTRATIVE ASSISTANT VI (ADAS VI)", "ADMINISTRATIVE OFFICER",
    "ADMINISTRATIVE OFFICER I (AO I)", "ADMINISTRATIVE OFFICER II (AO II)",
    "ADMINISTRATIVE OFFICER III (AO III)", "ADMINISTRATIVE OFFICER IV (AO IV)",
    "ADMINISTRATIVE OFFICER V (AO V)", "AGRICULTURIST", "AQUACULTURAL TECHNICIAN",
    "AQUACULTURIST", "BOOKKEEPER", "CASHIER", "CHIEF ADMINISTRATIVE OFFICER",
    "CLERK", "COLLEGE LIBRARIAN", "COMMUNICATIONS EQUIPMENT OPERATOR",
    "COMPUTER MAINTENANCE TECHNOLOGIST", "CONSTRUCTION AND MAINTENANCE MAN",
    "COOK", "COXSWAIN", "DENTAL AIDE", "DENTIST", "DISBURSING OFFICER",
    "DRIVER", "ENGINEER", "FARM WORKER", "FISCAL CLERK", "FISHERMAN",
    "HANDICRAFT WORKER", "HEAVY EQUIPMENT OPERATOR", "HOUSEPARENT",
    "INFORMATION SYSTEMS ANALYST", "INFORMATION TECHNOLOGY OFFICER",
    "LABORATORY TECHNICIAN", "LIBRARIAN", "LIGHT EQUIPMENT OPERATOR",
    "LINEMAN", "MARINE ENGINEMAN", "MASTER FISHERMAN", "MECHANIC",
    "MECHANICAL PLANT OPERATOR", "MEDICAL OFFICER", "NURSE", "NURSE MAID",
    "NURSING ATTENDANT", "NUTRITIONIST-DIETITIAN", "PLANNING OFFICER",
    "PROJECT DEVELOPMENT OFFICER", "PSYCHOLOGIST", "REGISTRAR",
    "REPRODUCTION MACHINE OPERATOR", "SCHOOL LIBRARIAN",
    "SCHOOLS DIVISION SUPERINTENDENT", "SECURITY GUARD", "SECURITY OFFICER",
    "SENIOR BOOKKEEPER", "SOCIAL WELFARE OFFICER", "STATISTICIAN AIDE",
    "SUPPLY OFFICER", "TECHNICAL EDUCATION AND SKILLS DEVELOPMENT SPECIALIST",
    "TELEGRAM CARRIER", "UTILITY FOREMAN", "UTILITY WORKER",
    "VOCATIONAL PLACEMENT COORDINATOR", "WATCHMAN", "LEARNING SUPPORT AIDE",
    "INTERN", "OTHERS"
  ]
};

function isCanonicalPosition(positionStr) {
  if (!positionStr || typeof positionStr !== 'string') return false;
  const pos = positionStr.trim();
  if (pos.startsWith('OTHERS')) return true;
  return (
    CANONICAL_POSITIONS_BY_CATEGORY.teaching.includes(pos) ||
    CANONICAL_POSITIONS_BY_CATEGORY['teaching-related'].includes(pos) ||
    CANONICAL_POSITIONS_BY_CATEGORY['non-teaching'].includes(pos)
  );
}

function determinePositionCategory(positionStr) {
  if (!positionStr || typeof positionStr !== 'string') return { type: '', category: '' };
  const pos = positionStr.trim();
  if (!isCanonicalPosition(pos)) return { type: '', category: '' };
  if (pos.startsWith('OTHERS')) return { type: 'non-teaching', category: 'NON-TEACHING' };
  if (CANONICAL_POSITIONS_BY_CATEGORY.teaching.includes(pos)) return { type: 'teaching', category: 'TEACHING' };
  if (CANONICAL_POSITIONS_BY_CATEGORY['teaching-related'].includes(pos)) return { type: 'teaching-related', category: 'RELATED TEACHING' };
  if (CANONICAL_POSITIONS_BY_CATEGORY['non-teaching'].includes(pos)) return { type: 'non-teaching', category: 'NON-TEACHING' };
  return { type: '', category: '' };
}

async function fetchMasterPersonnelFromInsightEd(schoolId) {
  const cleanSchoolId = String(schoolId).replace('SCH-', '');
  console.log(`[LocalDraft] Reading master personnel records for School ID ${cleanSchoolId}...`);
  
  // 1. Primary: Check production esf7_database
  let sourceTable = 'esf7_database';
  let masterRes = await insightEdPool.query(
    `SELECT * FROM esf7_database WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
    [cleanSchoolId]
  ).catch(() => ({ rows: [] }));

  // 2. Secondary: If not found in esf7_database, check esf7_database_dummy
  if (masterRes.rows.length === 0) {
    console.log(`[LocalDraft] No master records in esf7_database for School ID ${cleanSchoolId}, checking esf7_database_dummy...`);
    masterRes = await insightEdPool.query(
      `SELECT * FROM esf7_database_dummy WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
      [cleanSchoolId]
    ).catch(() => ({ rows: [] }));
    if (masterRes.rows.length > 0) {
      sourceTable = 'esf7_database_dummy';
    }
  }

  if (masterRes.rows.length === 0) {
    console.log(`[LocalDraft] No master records found in esf7_database or esf7_database_dummy for School ID ${cleanSchoolId}.`);
    return [];
  }

  console.log(`[LocalDraft] Formatting ${masterRes.rows.length} personnel records from ${sourceTable} in-memory (0 database inserts)...`);

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

    const cleanEmpNo = (row.employee_no && !String(row.employee_no).toUpperCase().startsWith('PRN')) ? String(row.employee_no).trim() : '';
    const depedEmail = row.deped_email || '';

    const rawPos = (row.position || '').trim();
    const isCanon = isCanonicalPosition(rawPos);
    const posName = isCanon ? rawPos : '';
    const catObj = determinePositionCategory(posName);

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
      religion: ((row.religion === 'OTHERS' ? '' : row.religion) || 'CHRISTIANITY').toUpperCase(),
      ethnicGroup: ((row.ehtinic_group === 'OTHERS' || row.ethnic_group === 'OTHERS' ? '' : (row.ehtinic_group || row.ethnic_group)) || '').toUpperCase(),
      ethnic_group: ((row.ehtinic_group === 'OTHERS' || row.ethnic_group === 'OTHERS' ? '' : (row.ehtinic_group || row.ethnic_group)) || '').toUpperCase(),
      birthdate: bDate,
      age: computedAge,
      employeeNo: cleanEmpNo,
      employee_no: cleanEmpNo,
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
      gradeLevelsTaught: [],
      grade_levels_taught: [],
      assignedGradeLevels: [],
      assigned_grade_levels: [],
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

      workloadRows: [],
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

function formatWorkloadRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level || '',
    grade_level: row.grade_level || '',
    sectionId: row.section_id || null,
    section_id: row.section_id || null,
    sectionName: row.section_name || '',
    section_name: row.section_name || '',
    subject: row.subject,
    subjectId: row.subject_id || null,
    subject_id: row.subject_id || null,
    remediationSubject: row.remediation_subject || '',
    remediation_subject: row.remediation_subject || '',
    startTime: row.start_time ? String(row.start_time).substring(0, 5) : null,
    start_time: row.start_time ? String(row.start_time).substring(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).substring(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).substring(0, 5) : null,
    days: row.days || ['M', 'T', 'W', 'TH', 'F'],
    rawPayload: raw
  };
}

// Formatter to standardize database rows into frontend-compatible objects
function formatPersonnelRecord(row, trainingsList = [], designationsList = [], workloadList = []) {
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

  const parsedPostDisc = parsePostGraduateDiscipline(
    row.post_graduate_discipline,
    rawEduc,
    rawProfile,
    row.highest_educational_attainment
  );

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
    noPhilsys: !!row.no_philsys,
    no_philsys: !!row.no_philsys,
    employeeNo: (row.employee_no && !String(row.employee_no).toUpperCase().startsWith('PRN')) ? String(row.employee_no).trim() : '',
    employee_no: (row.employee_no && !String(row.employee_no).toUpperCase().startsWith('PRN')) ? String(row.employee_no).trim() : '',
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
    gradeLevelsTaught: sanitizeGradeArray(row.grade_levels_taught || []),
    grade_levels_taught: sanitizeGradeArray(row.grade_levels_taught || []),
    assignedGradeLevels: sanitizeGradeArray(row.grade_levels_taught || []),
    assigned_grade_levels: sanitizeGradeArray(row.grade_levels_taught || []),
    teachesShs: !!(rawEmp.teachesShs || rawEmp.teaches_shs || rawProfile.teachesShs) || (Array.isArray(row.grade_levels_taught) && row.grade_levels_taught.some(g => String(g).includes('11') || String(g).includes('12'))),
    teaches_shs: !!(rawEmp.teachesShs || rawEmp.teaches_shs || rawProfile.teachesShs) || (Array.isArray(row.grade_levels_taught) && row.grade_levels_taught.some(g => String(g).includes('11') || String(g).includes('12'))),
    firstServiceDate: row.first_service_date ? (row.first_service_date instanceof Date ? row.first_service_date.toISOString().split('T')[0] : String(row.first_service_date).split('T')[0]) : null,
    lastPromotionDate: row.last_promotion_date ? (row.last_promotion_date instanceof Date ? row.last_promotion_date.toISOString().split('T')[0] : String(row.last_promotion_date).split('T')[0]) : null,
    newStationDate: row.new_station_date ? (row.new_station_date instanceof Date ? row.new_station_date.toISOString().split('T')[0] : String(row.new_station_date).split('T')[0]) : null,
    lastLateralMovementDate: row.last_lateral_movement_date ? (row.last_lateral_movement_date instanceof Date ? row.last_lateral_movement_date.toISOString().split('T')[0] : String(row.last_lateral_movement_date).split('T')[0]) : null,

    // Education Tab Fields
    educationId: row.educ_id || null,
    highestEducationalAttainment: row.highest_educational_attainment || (row.college_degree ? 'COLLEGE GRADUATE / BACCALAUREATE' : ''),
    highest_educational_attainment: row.highest_educational_attainment || (row.college_degree ? 'COLLEGE GRADUATE / BACCALAUREATE' : ''),
    shsTrack: row.shs_track || '',
    shs_track: row.shs_track || '',
    vocationalCourse: row.vocational_course || '',
    vocational_course: row.vocational_course || '',
    vocationalLevel: row.vocational_level || '',
    vocational_level: row.vocational_level || '',
    collegeDegree: row.college_degree || '',
    college_degree: row.college_degree || '',
    major: row.major || '',
    minor: row.minor || '',
    postGraduateDegree: row.post_graduate_degree || 'N/A',
    post_graduate_degree: row.post_graduate_degree || 'N/A',
    postGraduateDiscipline: parsedPostDisc.jsonString,
    post_graduate_discipline: parsedPostDisc.jsonString,
    mastersDiscipline: parsedPostDisc.mastersDiscipline,
    mastersDisciplines: parsedPostDisc.masters,
    doctorateDiscipline: parsedPostDisc.doctorateDiscipline,
    doctorateDisciplines: parsedPostDisc.doctorate,
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

    // Workload Rows (from esf7_workload_rows or raw_payload fallback)
    workloadRows: (Array.isArray(workloadList) && workloadList.length > 0)
      ? workloadList
      : (Array.isArray(rawProfile.workloadRows) ? rawProfile.workloadRows : []),

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

    // 1. Fetch master records from insightEd database
    const masterList = await fetchMasterPersonnelFromInsightEd(cleanSchoolId);

    // 2. Fetch locally saved records from esf7_personnel_profile
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
        ed.highest_educational_attainment,
        ed.shs_track,
        ed.vocational_course,
        ed.vocational_level,
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

    // 3. Fetch all workload rows for this school from esf7_workload_rows
    const wklRes = await db.query(
      `SELECT * FROM esf7_workload_rows WHERE school_id = $1 OR school_id = $2 ORDER BY created_at ASC`,
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    const workloadMap = new Map();
    for (const wRow of wklRes.rows) {
      const pKey = String(wRow.personnel_id).toUpperCase();
      if (!workloadMap.has(pKey)) workloadMap.set(pKey, []);
      workloadMap.get(pKey).push(formatWorkloadRecord(wRow));
    }

    const dbMap = new Map();
    for (const row of result.rows) {
      const trRes = await db.query(
        `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
        [row.id]
      );
      const dsgRes = await db.query(
        `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
        [row.id]
      );
      const wklList = workloadMap.get(String(row.id).toUpperCase()) || (row.prn ? workloadMap.get(String(row.prn).toUpperCase()) : []) || [];
      const formatted = formatPersonnelRecord(row, trRes.rows, dsgRes.rows, wklList);
      if (formatted.id) dbMap.set(String(formatted.id).toUpperCase(), formatted);
      if (formatted.prn) dbMap.set(String(formatted.prn).toUpperCase(), formatted);
    }

    const mergedList = [];
    const usedDbKeys = new Set();

    // Overlay master records with DB saved records where available
    for (const m of masterList) {
      const idKey = String(m.id || '').toUpperCase();
      const prnKey = String(m.prn || '').toUpperCase();
      const dbMatch = (idKey && dbMap.get(idKey)) || (prnKey && dbMap.get(prnKey));

      if (dbMatch) {
        mergedList.push(dbMatch);
        if (dbMatch.id) usedDbKeys.add(String(dbMatch.id).toUpperCase());
        if (dbMatch.prn) usedDbKeys.add(String(dbMatch.prn).toUpperCase());
      } else {
        const mWkl = workloadMap.get(idKey) || (prnKey ? workloadMap.get(prnKey) : null);
        if (mWkl && mWkl.length > 0) {
          m.workloadRows = mWkl;
        }
        mergedList.push(m);
      }
    }

    // Append any DB rows that were not part of the master list (e.g. manually added teachers)
    for (const [key, dbRec] of dbMap.entries()) {
      if (!usedDbKeys.has(key)) {
        mergedList.push(dbRec);
        if (dbRec.id) usedDbKeys.add(String(dbRec.id).toUpperCase());
        if (dbRec.prn) usedDbKeys.add(String(dbRec.prn).toUpperCase());
      }
    }

    // 4. ALSO link approved shared / clustered / reassigned requests for BOTH Mother School and Target School!
    // A. Check for requests TARGETING this school (Host/Receiving School)
    const targetReqs = await db.query(
      `SELECT r.*, p.prn as master_prn, p.first_name as master_fn, p.last_name as master_ln, p.position as master_pos, p.raw_payload as master_raw
       FROM esf7_requests r
       LEFT JOIN esf7_personnel_profile p ON (r.personnel_id = p.id OR r.personnel_id = p.prn)
       WHERE (r.target_school_id = $1 OR r.target_school_id = $2)
         AND r.status = 'approved'`,
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    for (const reqRow of targetReqs.rows) {
      const targetPrn = reqRow.master_prn || reqRow.personnel_id || reqRow.raw_payload?.prn || reqRow.raw_payload?.personnelId;
      const targetId = reqRow.personnel_id || reqRow.master_prn || `PER-${cleanSchoolId}-${targetPrn}`;
      const targetName = reqRow.personnel_name || (reqRow.master_fn ? `${reqRow.master_fn} ${reqRow.master_ln}` : reqRow.raw_payload?.personnelName || 'SHARED TEACHER');
      const isClustered = String(reqRow.request_type || '').toLowerCase().includes('cluster');
      const depStatus = isClustered ? 'CLUSTERED' : 'BORROWED';

      const existingMatch = mergedList.find(p => 
        String(p.id).toUpperCase() === String(targetId).toUpperCase() || 
        String(p.prn).toUpperCase() === String(targetPrn).toUpperCase() ||
        `${p.firstName} ${p.lastName}`.toUpperCase() === targetName.toUpperCase()
      );

      if (!existingMatch) {
        const pParts = String(targetName).split(' ');
        const fName = reqRow.master_fn || pParts[0] || 'TEACHER';
        const lName = reqRow.master_ln || pParts.slice(1).join(' ') || 'STAFF';

        mergedList.push({
          id: targetId,
          prn: targetPrn,
          schoolId: cleanSchoolId,
          school_id: cleanSchoolId,
          schoolYear: '2026-2027',
          type: 'teaching',
          salutation: 'MR.',
          firstName: fName,
          first_name: fName,
          middleName: '',
          lastName: lName,
          last_name: lName,
          position: reqRow.master_pos || 'TEACHER I',
          positionCategory: 'TEACHING',
          deploymentStatus: depStatus,
          deployment_status: depStatus,
          requestType: reqRow.request_type,
          partnerSchoolId: reqRow.requester_school_id,
          isClustered: isClustered,
          isShared: true,
          workloadRows: []
        });
      } else {
        existingMatch.deploymentStatus = depStatus;
        existingMatch.deployment_status = depStatus;
        existingMatch.requestType = reqRow.request_type;
        existingMatch.partnerSchoolId = reqRow.requester_school_id;
        existingMatch.isClustered = isClustered;
        existingMatch.isShared = true;
      }
    }

    // B. Check for requests REQUESTED BY this school (Mother/Plantilla School)
    const motherReqs = await db.query(
      `SELECT * FROM esf7_requests 
       WHERE (requester_school_id = $1 OR requester_school_id = $2)
         AND status = 'approved'`,
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    ).catch(() => ({ rows: [] }));

    for (const reqRow of motherReqs.rows) {
      const pId = reqRow.personnel_id;
      const pName = reqRow.personnel_name || '';
      const isClustered = String(reqRow.request_type || '').toLowerCase().includes('cluster');
      const depStatus = isClustered ? 'CLUSTERED' : 'REASSIGNED';

      const match = mergedList.find(p => 
        String(p.id).toUpperCase() === String(pId).toUpperCase() || 
        String(p.prn).toUpperCase() === String(pId).toUpperCase() ||
        `${p.firstName} ${p.lastName}`.toUpperCase() === pName.toUpperCase()
      );

      if (match) {
        match.deploymentStatus = depStatus;
        match.deployment_status = depStatus;
        match.requestType = reqRow.request_type;
        match.partnerSchoolId = reqRow.target_school_id;
        match.isClustered = isClustered;
        match.isReassigned = !isClustered;
      }
    }

    res.json(mergedList);
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

// POST /api/personnel/share — Share a clustered personnel to target satellite schools
router.post('/share', async (req, res) => {
  try {
    const { prn, target_school_ids, first_name, last_name } = req.body;
    const sourceSchoolId = getSchoolIdFromRequest(req) || '199998';
    const cleanSourceId = String(sourceSchoolId).replace('SCH-', '').trim();

    if (!prn || !Array.isArray(target_school_ids) || target_school_ids.length === 0) {
      return res.status(400).json({ error: 'prn and target_school_ids are required' });
    }

    // Ensure clustered_personnel table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS clustered_personnel (
        id SERIAL PRIMARY KEY,
        prn VARCHAR(255) NOT NULL,
        source_school_id VARCHAR(255) NOT NULL,
        target_school_id VARCHAR(255) NOT NULL,
        shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (prn, source_school_id, target_school_id)
      );
    `);

    for (const targetId of target_school_ids) {
      const cleanTargetId = String(targetId).replace('SCH-', '').trim();
      await db.query(
        `INSERT INTO clustered_personnel (prn, source_school_id, target_school_id, shared_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (prn, source_school_id, target_school_id) DO UPDATE SET shared_at = NOW()`,
        [prn, cleanSourceId, cleanTargetId]
      );
    }

    res.json({ success: true, count: target_school_ids.length, message: 'Personnel shared to clustered schools successfully.' });
  } catch (err) {
    console.error('Error sharing personnel to clustered schools:', err);
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
        ed.highest_educational_attainment,
        ed.shs_track,
        ed.vocational_course,
        ed.vocational_level,
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
    const wklRes = await db.query(
      `SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );
    const wklList = wklRes.rows.map(formatWorkloadRecord);

    res.json(formatPersonnelRecord(row, trRes.rows, dsgRes.rows, wklList));
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

  const rawDesigList = [];
  if (designation && typeof designation === 'string' && designation.trim()) {
    rawDesigList.push(designation.trim());
  }
  if (Array.isArray(designations)) {
    designations.forEach(d => {
      if (d) rawDesigList.push(d);
    });
  }

  const processedKeys = new Set();
  let counter = 1;

  for (const item of rawDesigList) {
    if (!item) continue;

    let dsgObj = {};
    if (typeof item === 'string') {
      const rawStr = item.trim();
      const isSds = rawStr.includes('::APPROVED_SDS') || rawStr.toUpperCase().includes('APPROVED_SDS');
      const cleanKey = rawStr.replace(/::APPROVED_SDS/gi, '').trim();
      if (!cleanKey || processedKeys.has(cleanKey.toUpperCase())) continue;
      processedKeys.add(cleanKey.toUpperCase());

      let dsgName = cleanKey;
      let gradeLevel = null;
      let subjectArea = null;
      let track = null;

      if (cleanKey.includes(' - ')) {
        const parts = cleanKey.split(' - ');
        dsgName = parts[0].trim();
        const subPart = parts.slice(1).join(' - ').trim();

        const gradeMatch = subPart.match(/\((Grade\s*\d+|Kinder|Grade\s*1[0-2])\)/i);
        if (gradeMatch) {
          gradeLevel = gradeMatch[1];
          subjectArea = subPart.replace(gradeMatch[0], '').trim();
        } else {
          subjectArea = subPart;
        }
      }

      dsgObj = {
        designationName: dsgName,
        gradeLevel: gradeLevel || '',
        subjectArea: subjectArea || '',
        track: track || '',
        isSdsApproved: isSds,
        sdsConfirmed: isSds,
        serializedKey: rawStr,
        rawPayload: { designation: cleanKey, isSdsApproved: isSds, serializedKey: rawStr }
      };
    } else if (typeof item === 'object') {
      const rawKey = item.serializedKey || item.serialized_key || item.designation || item.designationName || item.designation_name || item.name || 'OFFICIAL DESIGNATION';
      const cleanKey = String(rawKey).replace(/::APPROVED_SDS/gi, '').trim();
      if (!cleanKey || processedKeys.has(cleanKey.toUpperCase())) continue;
      processedKeys.add(cleanKey.toUpperCase());

      const isSds = !!(item.isSdsApproved || item.is_sds_approved || String(rawKey).includes('::APPROVED_SDS'));
      const isConf = !!(item.sdsConfirmed || item.sds_confirmed || isSds);
      const dsgName = (item.designationName || item.designation_name || item.name || cleanKey.split(' - ')[0]).replace(/::APPROVED_SDS/gi, '').trim();

      dsgObj = {
        designationName: dsgName || 'OFFICIAL DESIGNATION',
        gradeLevel: item.gradeLevel || item.grade_level || '',
        subjectArea: item.subjectArea || item.subject_area || '',
        track: item.track || '',
        isSdsApproved: isSds,
        sdsConfirmed: isConf,
        serializedKey: rawKey,
        rawPayload: item
      };
    }

    if (!dsgObj.designationName) continue;

    const dsgId = `DSG-${String(targetSchoolId).replace('SCH-', '')}-${String(personnelId).split('-').pop()}-${String(counter++).padStart(3, '0')}`;

    await client.query(
      `INSERT INTO esf7_personnel_designations (
        id, personnel_id, designation_name, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        dsgId,
        personnelId,
        dsgObj.designationName,
        dsgObj.gradeLevel || null,
        dsgObj.subjectArea || null,
        dsgObj.track || null,
        !!dsgObj.isSdsApproved,
        !!dsgObj.sdsConfirmed,
        dsgObj.serializedKey || dsgObj.designationName,
        JSON.stringify(dsgObj.rawPayload || dsgObj)
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
      birthdate, age, philsys_no, philsysNo, no_philsys, noPhilsys, tin, no_tin, noTin,
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
        philsys_no, no_philsys, employee_no, deped_email, is_school_head, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
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
      no_philsys === true || noPhilsys === true,
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
      JSON.stringify(sanitizeGradeArray(assignedGradeLevels || assigned_grade_levels || grade_levels_taught || gradeLevelsTaught || [])),
      first_service_date || firstServiceDate || null,
      last_promotion_date || lastPromotionDate || null,
      new_station_date || newStationDate || null,
      last_lateral_movement_date || lastLateralMovementDate || null,
      JSON.stringify(req.body)
    ];

    const empRes = await client.query(insertEmpQuery, empValues);

    // Insert linked education
    const eduHighestAttainment = (
      highest_educational_attainment || highestEducationalAttainment ||
      (college_degree || collegeDegree ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'COLLEGE GRADUATE / BACCALAUREATE')
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || '').toUpperCase() || null;
    const eduVocationalCourse = (vocational_course || vocationalCourse || '').toUpperCase() || null;
    const eduVocationalLevel = (vocational_level || vocationalLevel || '').toUpperCase() || null;
    const eduDegree = (college_degree || collegeDegree || '').toUpperCase() || null;
    const eduMaj = (major || '').toUpperCase();
    const eduMin = (minor || '').toUpperCase();
    const eduPostDeg = (post_graduate_degree || postGraduateDegree || 'N/A').toUpperCase();
    const parsedPostDisc = parsePostGraduateDiscipline(
      post_graduate_discipline || postGraduateDiscipline || postGraduateDisciplineCustom,
      req.body,
      req.body,
      eduHighestAttainment
    );
    const eduPostDisc = parsedPostDisc.jsonString;
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
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
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
      eduHighestAttainment,
      eduShsTrack,
      eduVocationalCourse,
      eduVocationalLevel,
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

    // Fetch the newly created complete record
    const completeRes = await db.query(`
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
        ed.highest_educational_attainment,
        ed.shs_track,
        ed.vocational_course,
        ed.vocational_level,
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
      WHERE p.id = $1
    `, [createdProfile.id]);

    const createdRecord = completeRes.rows[0];
    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [createdRecord.id]
    );
    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [createdRecord.id]
    );

    res.status(201).json(formatPersonnelRecord(createdRecord, trRes.rows, dsgRes.rows));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating personnel record:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update personnel profile JOINED with Employment, Education, Trainings, Learning Areas & Designations
router.put('/:id', async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      school_id, schoolId,
      prn,
      type,
      salutation,
      first_name, firstName,
      middle_name, middleName,
      last_name, lastName,
      name_extension, nameExtension,
      tin, no_tin, noTin,
      sex_at_birth, sexAtBirth,
      civil_status, civilStatus,
      solo_parent, soloParent,
      religion,
      ethnic_group, ethnicGroup,
      birthdate,
      age,
      philsys_no, philsysNo,
      no_philsys, noPhilsys,
      employee_no, employeeNo,
      deped_email, depedEmail,
      is_school_head, isSchoolHead,

      // Employment Fields
      position_category, positionCategory,
      position,
      step_increment, stepIncrement,
      fund_source, fundSource,
      nature_of_appointment, natureOfAppointment,
      hiring_arrangement, hiringArrangement,
      deployment_status, deploymentStatus,
      assigned_schools, assignedSchools,
      grade_levels_taught, gradeLevelsTaught, assignedGradeLevels, assigned_grade_levels,
      first_service_date, firstServiceDate,
      last_promotion_date, lastPromotionDate,
      new_station_date, newStationDate,
      last_lateral_movement_date, lastLateralMovementDate,

      // Education Fields
      highest_educational_attainment, highestEducationalAttainment,
      shs_track, shsTrack,
      vocational_course, vocationalCourse,
      vocational_level, vocationalLevel,
      college_degree, collegeDegree,
      major, minor,
      post_graduate_degree, postGraduateDegree,
      post_graduate_discipline, postGraduateDiscipline, postGraduateDisciplineCustom,
      eligibility,
      prc_specialization, prcSpecialization,

      // Training Rows
      neapTrainingRows = [],
      certificationRows = [],
      otherTrainingRows = [],

      // Learning Area Map
      learningAreaMap = {},
      matrix_data = {},

      // Designations
      designation = '',
      designations = []
    } = req.body;

    // Check if updating to school head conflicts with another school head
    const targetSchoolId = (school_id || schoolId || '108348').replace('SCH-', '');
    const isTargetHead = is_school_head !== undefined ? !!is_school_head : (isSchoolHead !== undefined ? !!isSchoolHead : false);

    if (isTargetHead) {
      const headCheck = await client.query(
        `SELECT id, first_name, last_name, position FROM esf7_personnel_profile 
         WHERE (school_id = $1 OR school_id = $2) AND is_school_head = TRUE AND id != $3 LIMIT 1`,
        [targetSchoolId, `SCH-${targetSchoolId}`, req.params.id]
      );
      if (headCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        const h = headCheck.rows[0];
        return res.status(400).json({ 
          error: `School head already designated (${h.first_name} ${h.last_name} - ${h.position}). A school can only have ONE School Head.` 
        });
      }
    }

    const currentRes = await client.query(
      `SELECT * FROM esf7_personnel_profile WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Personnel profile not found' });
    }

    const current = currentRes.rows[0];

    const finalFName = (first_name !== undefined ? first_name : firstName !== undefined ? firstName : current.first_name || '').toUpperCase();
    const finalMName = (middle_name !== undefined ? middle_name : middleName !== undefined ? middleName : current.middle_name || '').toUpperCase();
    const finalLName = (last_name !== undefined ? last_name : lastName !== undefined ? lastName : current.last_name || '').toUpperCase();
    const finalExt = (name_extension !== undefined ? name_extension : nameExtension !== undefined ? nameExtension : current.name_extension || '').toUpperCase();
    const finalTin = (tin !== undefined ? tin : current.tin || '').trim();
    const finalNoTin = (no_tin !== undefined ? no_tin : noTin !== undefined ? noTin : current.no_tin);
    const finalSex = (sex_at_birth !== undefined ? sex_at_birth : sexAtBirth !== undefined ? sexAtBirth : current.sex_at_birth || 'FEMALE').toUpperCase();
    const finalCivil = (civil_status !== undefined ? civil_status : civilStatus !== undefined ? civilStatus : current.civil_status || 'SINGLE').toUpperCase();
    const finalSolo = (solo_parent !== undefined ? (solo_parent === 'YES' || solo_parent === true) : soloParent !== undefined ? (soloParent === 'YES' || soloParent === true) : current.solo_parent);
    const finalRel = (religion !== undefined ? religion : current.religion || 'CHRISTIANITY').toUpperCase();
    const rawEth = (ethnic_group !== undefined ? ethnic_group : ethnicGroup !== undefined ? ethnicGroup : current.ethnic_group || '');
    const finalEth = (rawEth === 'OTHERS' ? '' : rawEth).toUpperCase();
    const finalBDate = birthdate !== undefined ? birthdate : current.birthdate;
    const finalAge = age !== undefined ? age : sanitizeAge(current.age, finalBDate);
    const finalPhilSys = (philsys_no !== undefined ? philsys_no : philsysNo !== undefined ? philsysNo : current.philsys_no || '').trim();
    const finalNoPhilSys = (no_philsys !== undefined ? (no_philsys === true || no_philsys === 'true') : noPhilsys !== undefined ? (noPhilsys === true || noPhilsys === 'true') : current.no_philsys);
    const finalEmpNo = (employee_no !== undefined ? employee_no : employeeNo !== undefined ? employeeNo : current.employee_no || '').trim();
    const finalEmail = (deped_email !== undefined ? deped_email : depedEmail !== undefined ? depedEmail : current.deped_email || '').trim();
    const finalSalutation = (salutation !== undefined ? salutation : current.salutation || 'MR.').toUpperCase();
    const finalType = type !== undefined ? type : current.type;

    const updateProfileQuery = `
      UPDATE esf7_personnel_profile SET
        school_id = $1,
        type = $2,
        salutation = $3,
        first_name = $4,
        middle_name = $5,
        last_name = $6,
        name_extension = $7,
        tin = $8,
        no_tin = $9,
        sex_at_birth = $10,
        civil_status = $11,
        solo_parent = $12,
        religion = $13,
        ethnic_group = $14,
        birthdate = $15,
        age = $16,
        philsys_no = $17,
        no_philsys = $18,
        employee_no = $19,
        deped_email = $20,
        is_school_head = $21,
        raw_payload = $22::jsonb,
        updated_at = NOW()
      WHERE id = $23
      RETURNING *;
    `;

    const profileValues = [
      targetSchoolId,
      finalType,
      finalSalutation,
      finalFName,
      finalMName,
      finalLName,
      finalExt,
      finalTin,
      finalNoTin,
      finalSex,
      finalCivil,
      finalSolo,
      finalRel,
      finalEth,
      finalBDate,
      finalAge,
      finalPhilSys,
      finalNoPhilSys,
      finalEmpNo,
      finalEmail,
      isTargetHead,
      JSON.stringify(req.body),
      req.params.id
    ];

    const profileRes = await client.query(updateProfileQuery, profileValues);
    const updatedProfile = profileRes.rows[0];

    // Upsert linked employment
    const empPos = (position || 'TEACHER I').toUpperCase();
    const catObj = determinePositionCategory(empPos);
    const empCat = (position_category || positionCategory || catObj.category).toUpperCase();
    const empStep = sanitizeStepIncrement(step_increment || stepIncrement);
    const empFund = (fund_source || fundSource || 'NATIONAL').toUpperCase();
    const empAppt = (nature_of_appointment || natureOfAppointment || 'REGULAR PERMANENT').toUpperCase();
    const empHire = (hiring_arrangement || hiringArrangement || 'REGULAR').toUpperCase();
    const empDeploy = (deployment_status || deploymentStatus || 'OWN STATION').toUpperCase();
    const empId = `EMP-${updatedProfile.school_id.replace('SCH-', '')}-${updatedProfile.id.split('-').pop()}`;

    const upsertEmpQuery = `
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position_category, position, step_increment, fund_source,
        nature_of_appointment, hiring_arrangement, deployment_status, assigned_schools,
        grade_levels_taught, first_service_date, last_promotion_date, new_station_date,
        last_lateral_movement_date, raw_payload
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
      updatedProfile.id,
      empCat,
      empPos,
      empStep,
      empFund,
      empAppt,
      empHire,
      empDeploy,
      JSON.stringify(assigned_schools || assignedSchools || []),
      JSON.stringify(sanitizeGradeArray(assignedGradeLevels || assigned_grade_levels || grade_levels_taught || gradeLevelsTaught || [])),
      first_service_date || firstServiceDate || null,
      last_promotion_date || lastPromotionDate || null,
      new_station_date || newStationDate || null,
      last_lateral_movement_date || lastLateralMovementDate || null,
      JSON.stringify(req.body)
    ];

    const empRes = await client.query(upsertEmpQuery, empValues);

    // Upsert linked education
    const eduHighestAttainment = (
      highest_educational_attainment || highestEducationalAttainment ||
      (college_degree || collegeDegree ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'COLLEGE GRADUATE / BACCALAUREATE')
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || '').toUpperCase() || null;
    const eduVocationalCourse = (vocational_course || vocationalCourse || '').toUpperCase() || null;
    const eduVocationalLevel = (vocational_level || vocationalLevel || '').toUpperCase() || null;
    const eduDegree = (college_degree || collegeDegree || '').toUpperCase() || null;
    const eduMaj = (major || '').toUpperCase();
    const eduMin = (minor || '').toUpperCase();
    const eduPostDeg = (post_graduate_degree || postGraduateDegree || 'N/A').toUpperCase();
    const parsedPostDisc = parsePostGraduateDiscipline(
      post_graduate_discipline || postGraduateDiscipline || postGraduateDisciplineCustom,
      req.body,
      req.body,
      eduHighestAttainment
    );
    const eduPostDisc = parsedPostDisc.jsonString;
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
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
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
      updatedProfile.id,
      eduHighestAttainment,
      eduShsTrack,
      eduVocationalCourse,
      eduVocationalLevel,
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
      highest_educational_attainment: educRes.rows[0].highest_educational_attainment,
      shs_track: educRes.rows[0].shs_track,
      vocational_course: educRes.rows[0].vocational_course,
      vocational_level: educRes.rows[0].vocational_level,
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
