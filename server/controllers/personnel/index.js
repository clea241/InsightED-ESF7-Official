const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { insightEdPool } = require('../../db');
const { getSchoolIdFromRequest } = require('../../utils/auth');
const { coerceDateField, isDatePlaceholder } = require('../../utils/dateInput');

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
  const str = String(val).trim();
  if (str.match(/^\d{1,2}:\d{2}/)) return str.substring(0, 5);
  return str;
}

function parseDays(r, sfx) {
  const d1 = r[`d1_1${sfx}`];
  const d2 = r[`d2_1${sfx}`];
  const d3 = r[`d3_1${sfx}`];
  const d4 = r[`d4_1${sfx}`];
  const d5 = r[`d5_1${sfx}`];
  const d6 = r[`d6_1${sfx}`];
  const d7 = r[`d7_1${sfx}`];

  const days = [];
  if (d1 === true || d1 === 'true' || d1 === 1 || d1 === '1') days.push('M');
  if (d2 === true || d2 === 'true' || d2 === 1 || d2 === '1') days.push('T');
  if (d3 === true || d3 === 'true' || d3 === 1 || d3 === '1') days.push('W');
  if (d4 === true || d4 === 'true' || d4 === 1 || d4 === '1') days.push('TH');
  if (d5 === true || d5 === 'true' || d5 === 1 || d5 === '1') days.push('F');
  if (d6 === true || d6 === 'true' || d6 === 1 || d6 === '1') days.push('S');
  if (d7 === true || d7 === 'true' || d7 === 1 || d7 === '1') days.push('SU');

  return days.length > 0 ? days : ['M', 'T', 'W', 'TH', 'F'];
}

function sanitizeGrade(rawLvl) {
  if (!rawLvl) return 'Grade 7';
  const str = String(rawLvl).trim().toUpperCase();
  if (str.includes('KINDER')) return 'Kinder';
  if (str.includes('SNED') || str.includes('NON-GRADED') || str.includes('MULTI-GRADE')) return 'SNED (NON-GRADED)';
  const m = str.match(/^(?:GRADE\s*|G\s*)?(\d{1,2})$/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
  }
  return str.startsWith('GRADE') ? str : `Grade ${str}`;
}


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
  let mastersWithUnits = [];
  let mastersGraduated = [];
  let doctorateWithUnits = [];
  let doctorateGraduated = [];
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

  const attainmentStr = String(highestAttainment || '').toUpperCase();
  const isDoc = attainmentStr.includes('DOCTOR');
  const isWithUnits = attainmentStr.includes('WITH UNITS');

  if (rawDiscipline && typeof rawDiscipline === 'object' && !Array.isArray(rawDiscipline)) {
    if (Array.isArray(rawDiscipline.mastersWithUnits)) mastersWithUnits = rawDiscipline.mastersWithUnits;
    if (Array.isArray(rawDiscipline.mastersGraduated)) mastersGraduated = rawDiscipline.mastersGraduated;
    if (Array.isArray(rawDiscipline.doctorateWithUnits)) doctorateWithUnits = rawDiscipline.doctorateWithUnits;
    if (Array.isArray(rawDiscipline.doctorateGraduated)) doctorateGraduated = rawDiscipline.doctorateGraduated;
    if (Array.isArray(rawDiscipline.masters)) masters = rawDiscipline.masters;
    if (Array.isArray(rawDiscipline.doctorate)) doctorate = rawDiscipline.doctorate;
  } else if (typeof rawDiscipline === 'string' && rawDiscipline.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawDiscipline);
      if (Array.isArray(parsed.mastersWithUnits)) mastersWithUnits = parsed.mastersWithUnits;
      if (Array.isArray(parsed.mastersGraduated)) mastersGraduated = parsed.mastersGraduated;
      if (Array.isArray(parsed.doctorateWithUnits)) doctorateWithUnits = parsed.doctorateWithUnits;
      if (Array.isArray(parsed.doctorateGraduated)) doctorateGraduated = parsed.doctorateGraduated;
      if (Array.isArray(parsed.masters)) masters = parsed.masters;
      if (Array.isArray(parsed.doctorate)) doctorate = parsed.doctorate;
    } catch (e) {}
  } else if (rawDiscipline) {
    const list = extractList(rawDiscipline);
    if (isDoc) {
      if (isWithUnits) doctorateWithUnits = list;
      else doctorateGraduated = list;
      doctorate = list;
    } else {
      if (isWithUnits) mastersWithUnits = list;
      else mastersGraduated = list;
      masters = list;
    }
  }

  const combinedSource = { ...rawProfile, ...rawEduc };
  if (mastersWithUnits.length === 0 && combinedSource.mastersWithUnitsDisciplines) {
    mastersWithUnits = extractList(combinedSource.mastersWithUnitsDisciplines);
  }
  if (mastersGraduated.length === 0 && combinedSource.mastersGraduatedDisciplines) {
    mastersGraduated = extractList(combinedSource.mastersGraduatedDisciplines);
  }
  if (doctorateWithUnits.length === 0 && combinedSource.doctorateWithUnitsDisciplines) {
    doctorateWithUnits = extractList(combinedSource.doctorateWithUnitsDisciplines);
  }
  if (doctorateGraduated.length === 0 && combinedSource.doctorateGraduatedDisciplines) {
    doctorateGraduated = extractList(combinedSource.doctorateGraduatedDisciplines);
  }

  // Fallback from legacy masters / doctorate
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

  if (mastersWithUnits.length === 0 && mastersGraduated.length === 0 && masters.length > 0) {
    if (isWithUnits && !isDoc) mastersWithUnits = [...masters];
    else mastersGraduated = [...masters];
  }
  if (doctorateWithUnits.length === 0 && doctorateGraduated.length === 0 && doctorate.length > 0) {
    if (isWithUnits && isDoc) doctorateWithUnits = [...doctorate];
    else doctorateGraduated = [...doctorate];
  }

  const allMasters = [...new Set([...mastersWithUnits, ...mastersGraduated, ...masters].map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  const allDoctorate = [...new Set([...doctorateWithUnits, ...doctorateGraduated, ...doctorate].map(s => String(s).trim().toUpperCase()).filter(Boolean))];

  mastersWithUnits = [...new Set(mastersWithUnits.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  mastersGraduated = [...new Set(mastersGraduated.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  doctorateWithUnits = [...new Set(doctorateWithUnits.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  doctorateGraduated = [...new Set(doctorateGraduated.map(s => String(s).trim().toUpperCase()).filter(Boolean))];

  return {
    mastersWithUnits,
    mastersGraduated,
    doctorateWithUnits,
    doctorateGraduated,
    masters: allMasters,
    doctorate: allDoctorate,
    mastersDiscipline: allMasters.join(', '),
    doctorateDiscipline: allDoctorate.join(', '),
    jsonString: JSON.stringify({
      mastersWithUnits,
      mastersGraduated,
      doctorateWithUnits,
      doctorateGraduated,
      masters: allMasters,
      doctorate: allDoctorate
    }),
    rawObject: {
      mastersWithUnits,
      mastersGraduated,
      doctorateWithUnits,
      doctorateGraduated,
      masters: allMasters,
      doctorate: allDoctorate
    }
  };
};

const sanitizeGradeLevel = (rawLvl, secName = '') => {
  if (!rawLvl && !secName) return null;
  const str = String(rawLvl || '').trim();
  const upper = str.toUpperCase();

  // 1. Filter out delivery modes / section types that are NOT grade levels
  if (
    upper.includes('MULTI-GRADE') || upper.includes('MULTIGRADE') || upper.includes('MULTI GRADE') ||
    upper.includes('MONO-GRADE') || upper.includes('MONOGRADE') || upper.includes('MONO GRADE') ||
    upper.includes('PHIL-IRI') || upper.includes('PHIL IRI') ||
    upper.includes('CRLA') || upper.includes('RMA') ||
    upper === 'ARAL' || upper.startsWith('ARAL ') ||
    upper.includes('INDEPENDENT') || upper.includes('INSTRUCTIONAL') || upper.includes('FRUSTRATION')
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
  if (upper.includes('KINDER') || upper === 'K') {
    return 'Kinder';
  }

  // 3. Handle Special Programs (SNED & NON-GRADED unified)
  if (upper === 'SNED' || upper === 'SPED' || upper === 'NON-GRADED' || upper === 'NON GRADED' || upper.includes('SNED') || upper.includes('NON-GRADED') || upper.includes('NON GRADED')) {
    return 'SNED (NON-GRADED)';
  }
  if (upper === 'ALS' || upper.startsWith('ALS-') || upper.startsWith('ALS ')) return 'ALS';

  // 4. Handle Numeric e.g. "7", "G7", "Grade 7"
  const numMatch = str.match(/^(?:Grade\s*|G\s*)?(\d{1,2})$/i);
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
    const subMatch = rest.match(/^(\d{1,2})$/);
    if (subMatch) {
      const num = parseInt(subMatch[1], 10);
      if (num >= 1 && num <= 12) return `Grade ${num}`;
    }
    return null;
  }

  return null;
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

const CANONICAL_POSITIONS_BY_CATEGORY = {
  teaching: [
    "TEACHER I", "TEACHER II", "TEACHER III", "TEACHER IV", "TEACHER IV - SNED",
    "TEACHER V", "TEACHER V - SNED", "TEACHER VI", "TEACHER VI - SNED",
    "TEACHER VII", "TEACHER VII - SNED", "EXTERNAL TUTOR",
    "SPECIAL SCIENCE TEACHER I", "SPECIAL SCIENCE TEACHER II", "SPECIAL SCIENCE TEACHER III",
    "SPECIAL SCIENCE TEACHER IV", "SPECIAL SCIENCE TEACHER V",
    "MASTER TEACHER I", "MASTER TEACHER II", "MASTER TEACHER III", "MASTER TEACHER IV",
    "MASTER TEACHER V", "LEARNER SUPPORT AIDE",
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
    "VOCATIONAL PLACEMENT COORDINATOR", "WATCHMAN",
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
  
  const isTest = db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(cleanSchoolId);
  let sourceTable = isTest ? 'esf7_database_dummy' : 'esf7_database';
  let masterRes = { rows: [] };
  // A failure to reach the master database is an ERROR, not "no data": it is logged with the exact message and travels
  // with every record (masterSourceError) so the client can report it instead of silently trusting the fallback.
  let masterError = null;
  const noteMasterFailure = (label) => (err) => {
    masterError = masterError || { query: label, message: err.message, code: err.code || null };
    console.error(`[LocalDraft][ERROR] ${label} failed for ${cleanSchoolId}: ${err.message}${err.code ? ` (code ${err.code})` : ''}. Master database is unreachable - the roster will NOT come from esf7_database.`);
    return { rows: [] };
  };

  if (isTest) {
    masterRes = await insightEdPool.query(
      `SELECT * FROM esf7_database_dummy WHERE (school_id = $1 OR schoool_id = $1)`,
      [cleanSchoolId]
    ).catch(noteMasterFailure('esf7_database_dummy query'));
  } else {
    // 1. Primary: Fast indexed lookup on school_id in production esf7_database (< 1s)
    masterRes = await insightEdPool.query(
      `SELECT * FROM esf7_database WHERE school_id = $1`,
      [cleanSchoolId]
    ).catch(noteMasterFailure('esf7_database primary indexed query'));

    // Fallback: If 0 rows found with school_id, check schoool_id
    if (masterRes.rows.length === 0) {
      masterRes = await insightEdPool.query(
        `SELECT * FROM esf7_database WHERE schoool_id = $1`,
        [cleanSchoolId]
      ).catch(noteMasterFailure('esf7_database schoool_id query'));
    }

    // 2. Secondary: If not found in production esf7_database, check test dummy table
    if (masterRes.rows.length === 0) {
      console.log(`[LocalDraft] No master records in esf7_database for School ID ${cleanSchoolId}, checking esf7_database_dummy...`);
      masterRes = await insightEdPool.query(
        `SELECT * FROM esf7_database_dummy WHERE (school_id = $1 OR schoool_id = $1)`,
        [cleanSchoolId]
      ).catch(noteMasterFailure('esf7_database_dummy fallback query'));
      if (masterRes.rows.length > 0) {
        sourceTable = 'esf7_database_dummy';
      }
    }
  }

  // 3. Tertiary Fallback: Check esf7_room_roster_cache in local database
  if (masterRes.rows.length === 0) {
    console.log(`[LocalDraft] No master records in esf7_database/dummy for School ID ${cleanSchoolId}, checking esf7_room_roster_cache...`);
    const cacheRes = await db.query(
      `SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1`,
      [cleanSchoolId]
    ).catch(() => ({ rows: [] }));
    if (cacheRes.rows.length > 0 && Array.isArray(cacheRes.rows[0].roster_json) && cacheRes.rows[0].roster_json.length > 0) {
      console.log(`[LocalDraft] Found ${cacheRes.rows[0].roster_json.length} records in esf7_room_roster_cache for School ID ${cleanSchoolId}`);
      masterRes = { rows: cacheRes.rows[0].roster_json };
      sourceTable = 'esf7_room_roster_cache';
      console.warn(`[LocalDraft][SOURCE] Using esf7_room_roster_cache as a LAST RESORT for ${cleanSchoolId} - this roster is NOT confirmed saved data.`);
    }
  }

  if (masterRes.rows.length === 0) {
    console.log(`[LocalDraft] No master records found in esf7_database, esf7_database_dummy, or esf7_room_roster_cache for School ID ${cleanSchoolId}.`);
    return [];
  }


  // One person = one row: the same person listed twice (same PRN / employee no., else same name) is kept once, first copy wins.
  {
    const seenKeys = new Set();
    const before = masterRes.rows.length;
    masterRes = { rows: masterRes.rows.filter((r) => {
      const prnKey = String(r.prn || r.employee_no || r.employeeNo || '').trim().toUpperCase();
      const nameKey = `${r.firstName || r.first_name || r.first || ''} ${r.lastName || r.last_name || r.last || r.last_first || ''}`.trim().toUpperCase();
      const key = prnKey && !prnKey.startsWith('PRN-') ? 'p:' + prnKey : (nameKey ? 'n:' + nameKey : '');
      if (!key) return true;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    }) };
    if (masterRes.rows.length !== before) console.warn(`[LocalDraft] Dropped ${before - masterRes.rows.length} duplicate master row(s) from ${sourceTable} for ${cleanSchoolId}.`);
  }
  const sourceConfirmed = sourceTable !== 'esf7_room_roster_cache';

  console.log(`[LocalDraft] Formatting ${masterRes.rows.length} personnel records from ${sourceTable} in-memory (0 database inserts)...`);

  const list = [];
  for (let i = 0; i < masterRes.rows.length; i++) {
    const row = masterRes.rows[i];
    const seq = String(i + 1).padStart(3, '0');
    const profileId = row.id || `PER-${cleanSchoolId}-${seq}`;
    const empId = row.employmentId || `EMP-${cleanSchoolId}-${seq}`;
    const educId = row.educationId || `EDU-${cleanSchoolId}-${seq}`;

    let fName = row.firstName || row.first_name || row.first || '';
    let lName = row.lastName || row.last_name || row.last || '';
    let mName = row.middleName || row.middle_name || row.middle || '';

    if ((!fName || !lName) && row.last_first) {
      const parts = String(row.last_first).trim().split(/\s+/);
      lName = parts[0] || 'TEACHER';
      fName = parts.slice(1).join(' ') || 'STAFF';
    }

    if (!fName) fName = `TEACHER`;
    if (!lName) lName = `STAFF ${seq}`;

    const prn = (row.prn || row.employee_no || row.employeeNo || `PRN-${cleanSchoolId}-${seq}`).trim();
    const isSchoolHead = row.isSchoolHead !== undefined ? !!row.isSchoolHead : (row.is_school_head !== undefined ? !!row.is_school_head : checkIsSchoolHead(row));
    const bDate = row.birthdate || parseDateFromParts(row.birthday_yyyy, row.birthday_mm, row.birthday_dd) || null;
    const computedAge = sanitizeAge(row.age, bDate);
    const firstApptDate = row.firstServiceDate || row.first_service_date || parseDateFromParts(row.appt_yyyy, row.appt_mm, row.appt_dd) || null;
    const stationDate = row.newStationDate || row.new_station_date || parseDateFromParts(row.station_yyyy, row.station_mm, row.station_dd) || null;
    const stepIncrement = sanitizeStepIncrement(row.stepIncrement || row.step_increment);
    const degree = row.collegeDegree || row.college_degree || row.degree_finished__baccalaureate || 'BACHELOR OF SECONDARY EDUCATION';
    const major = row.major || row.major__specialization || 'GENERAL EDUCATION';
    const minor = row.minor || 'N/A';
    const highestAttainment = row.highestEducationalAttainment || row.highest_educational_attainment || 'COLLEGE GRADUATE / BACCALAUREATE';
    const postGrad = row.postGraduateDegree || row.post_graduate_degree || row.post_graduate__degree || 'N/A';
    const postGradDisc = row.postGraduateDiscipline || row.post_graduate_discipline || '{"mastersWithUnits":[],"mastersGraduated":[],"doctorateWithUnits":[],"doctorateGraduated":[],"masters":[],"doctorate":[]}';
    const elig = Array.isArray(row.eligibility) ? row.eligibility : [row.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS'];
    const prcSpec = row.prcSpecialization || row.prc_specialization || major;
    const degreeRows = (Array.isArray(row.degreeRows) && row.degreeRows.length > 0) ? row.degreeRows : (Array.isArray(row.collegeDegrees) && row.collegeDegrees.length > 0 ? row.collegeDegrees : [{ collegeDegree: degree, major, minor }]);

    const cleanEmpNo = (row.employee_no && !String(row.employee_no).toUpperCase().startsWith('PRN')) ? String(row.employee_no).trim() : (row.employeeNo && !String(row.employeeNo).toUpperCase().startsWith('PRN') ? String(row.employeeNo).trim() : '');
    const depedEmail = row.deped_email || row.depedEmail || '';

    const rawPos = (row.position_title || row.position || row.plantilla_position || '').trim();
    const isCanon = isCanonicalPosition(rawPos);
    const posName = isCanon ? rawPos : '';
    const catObj = determinePositionCategory(posName);

    list.push({
      ...row,
      masterSource: sourceTable,
      masterSourceConfirmed: sourceConfirmed,
      masterSourceError: masterError ? `${masterError.query}: ${masterError.message}${masterError.code ? ` (code ${masterError.code})` : ''}` : null,
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
      nameExtension: row.name_extension || row.nameExtension || '',
      name_extension: row.name_extension || row.nameExtension || '',
      tin: row.tin || '',
      noTin: !row.tin,
      no_tin: !row.tin,
      sexAtBirth: (row.sex || row.sex_at_birth || row.sexAtBirth || row.gender || 'FEMALE').toUpperCase(),
      sex_at_birth: (row.sex || row.sex_at_birth || row.sexAtBirth || row.gender || 'FEMALE').toUpperCase(),
      civilStatus: (row.civil_status || row.civilStatus || 'SINGLE').toUpperCase(),
      civil_status: (row.civil_status || row.civilStatus || 'SINGLE').toUpperCase(),
      soloParent: (row.solo_parent === 'YES' || row.soloParent === 'YES' || row.soloParent === true) ? 'YES' : 'NO',
      religion: ((row.religion === 'OTHERS' ? '' : row.religion) || 'CHRISTIANITY').toUpperCase(),
      ethnicGroup: ((row.ehtinic_group === 'OTHERS' || row.ethnic_group === 'OTHERS' || row.ethnicGroup === 'OTHERS' ? '' : (row.ehtinic_group || row.ethnic_group || row.ethnicGroup)) || '').toUpperCase(),
      ethnic_group: ((row.ehtinic_group === 'OTHERS' || row.ethnic_group === 'OTHERS' || row.ethnicGroup === 'OTHERS' ? '' : (row.ehtinic_group || row.ethnic_group || row.ethnicGroup)) || '').toUpperCase(),
      birthdate: bDate,
      age: computedAge,
      employeeNo: cleanEmpNo,
      employee_no: cleanEmpNo,
      depedEmail: depedEmail,
      noDepedEmail: !!row.no_deped_email || !!row.noDepedEmail || depedEmail === 'N/A',
      no_deped_email: !!row.no_deped_email || !!row.noDepedEmail || depedEmail === 'N/A',
      allowEmailDiscrepancy: !!row.allow_email_discrepancy || !!row.allowEmailDiscrepancy,
      allow_email_discrepancy: !!row.allow_email_discrepancy || !!row.allowEmailDiscrepancy,

      isSchoolHead: isSchoolHead,
      is_school_head: isSchoolHead,

      // Employment Fields
      employmentId: empId,
      positionCategory: catObj.category,
      position_category: catObj.category,
      position: posName,
      stepIncrement,
      step_increment: stepIncrement,
      fundSource: (row.fund_source || row.fundSource || 'NATIONAL').toUpperCase(),
      fund_source: (row.fund_source || row.fundSource || 'NATIONAL').toUpperCase(),
      natureOfAppointment: (row.nature_of_appointment || row.natureOfAppointment || 'REGULAR PERMANENT').toUpperCase(),
      nature_of_appointment: (row.nature_of_appointment || row.natureOfAppointment || 'REGULAR PERMANENT').toUpperCase(),
      hiringArrangement: (row.hiring_arrangement || row.hiringArrangement || 'REGULAR').toUpperCase(),
      deploymentStatus: (row.status__item_ || row.deploymentStatus || row.deployment_status || 'OWN STATION').toUpperCase(),
      deployment_status: (row.status__item_ || row.deploymentStatus || row.deployment_status || 'OWN STATION').toUpperCase(),
      assignedSchools: row.assignedSchools || row.assigned_schools || [],
      assigned_schools: row.assignedSchools || row.assigned_schools || [],
      gradeLevelsTaught: row.gradeLevelsTaught || row.grade_levels_taught || row.assignedGradeLevels || row.assigned_grade_levels || [],
      grade_levels_taught: row.gradeLevelsTaught || row.grade_levels_taught || row.assignedGradeLevels || row.assigned_grade_levels || [],
      assignedGradeLevels: row.gradeLevelsTaught || row.grade_levels_taught || row.assignedGradeLevels || row.assigned_grade_levels || [],
      assigned_grade_levels: row.gradeLevelsTaught || row.grade_levels_taught || row.assignedGradeLevels || row.assigned_grade_levels || [],
      firstServiceDate: firstApptDate,
      lastPromotionDate: firstApptDate,
      newStationDate: stationDate || firstApptDate,
      lastLateralMovementDate: 'N/A',
      last_lateral_movement_date: 'N/A',
      stepIncrementConfirmed: true,
      step_increment_confirmed: true,

      // Education Fields
      educationId: educId,
      collegeDegree: String(degree).toUpperCase(),
      college_degree: String(degree).toUpperCase(),
      major: String(major).toUpperCase(),
      minor: String(minor).toUpperCase(),
      highestEducationalAttainment: String(highestAttainment).toUpperCase(),
      highest_educational_attainment: String(highestAttainment).toUpperCase(),
      degreeRows: degreeRows,
      collegeDegrees: degreeRows,
      postGraduateDegree: String(postGrad).toUpperCase(),
      post_graduate_degree: String(postGrad).toUpperCase(),
      postGraduateDiscipline: typeof postGradDisc === 'string' ? postGradDisc : JSON.stringify(postGradDisc),
      post_graduate_discipline: typeof postGradDisc === 'string' ? postGradDisc : JSON.stringify(postGradDisc),
      eligibility: elig,
      prcSpecialization: String(prcSpec).toUpperCase(),
      prc_specialization: String(prcSpec).toUpperCase(),

      workloadRows: (() => {
        if (Array.isArray(row.workloadRows) && row.workloadRows.length > 0) return row.workloadRows;
        const parsedWorkloads = [];
        for (let slot = 1; slot <= 20; slot++) {
          const sfx = slot === 1 ? '' : `_${slot}`;
          const subj = row[`subject_1${sfx}`];
          const from = row[`from_1${sfx}`];
          const to = row[`to_1${sfx}`];
          const sec = row[`section_1${sfx}`];
          const lvl = row[`lvl_1${sfx}`];
          if (!subj && !from && !sec) continue;

          const subjectStr = String(subj || 'GENERAL SUBJECT').trim();
          const sectionStr = String(sec || 'SECTION 1').trim();
          const gradeStr = sanitizeGrade(lvl);
          const startTime = convertExcelTimeToHHMM(from) || '07:30';
          const endTime = convertExcelTimeToHHMM(to) || '08:30';
          const days = parseDays(row, sfx);
          const rowId = `wkl_${cleanSchoolId}_${profileId}_${slot}`;
          const isShs = gradeStr.includes('11') || gradeStr.includes('12') || String(row[`department_1${sfx}`] || '').toUpperCase().includes('SHS') || String(row[`categ_1${sfx}`] || '').toUpperCase().includes('SHS');

          parsedWorkloads.push({
            id: rowId,
            personnelId: profileId,
            personnel_id: profileId,
            schoolId: cleanSchoolId,
            school_id: cleanSchoolId,
            schoolYear: '2025-2026',
            school_year: '2025-2026',
            gradeLevel: gradeStr,
            grade_level: gradeStr,
            sectionId: `SEC-${cleanSchoolId}-${slot}`,
            section_id: `SEC-${cleanSchoolId}-${slot}`,
            sectionName: sectionStr,
            section_name: sectionStr,
            subject: subjectStr,
            subjectId: `SUB-${cleanSchoolId}-${slot}`,
            subject_id: `SUB-${cleanSchoolId}-${slot}`,
            remediationSubject: '',
            remediation_subject: '',
            startTime: startTime,
            start_time: startTime,
            endTime: endTime,
            end_time: endTime,
            days: days,
            term: '1st',
            trackStrand: isShs ? 'TVL/ACADEMIC' : '',
            track_strand: isShs ? 'TVL/ACADEMIC' : '',
            shsSubjectCategory: isShs ? 'Specialized' : '',
            shs_subject_category: isShs ? 'Specialized' : '',
            semester: '1st Semester',
            rawPayload: {
              id: rowId,
              personnelId: profileId,
              schoolId: cleanSchoolId,
              gradeLevel: gradeStr,
              sectionName: sectionStr,
              subject: subjectStr,
              startTime,
              endTime,
              days,
              term: '1st'
            }
          });
        }
        return parsedWorkloads;
      })(),
      neapTrainingRows: Array.isArray(row.neapTrainingRows) ? row.neapTrainingRows : [],
      certificationRows: Array.isArray(row.certificationRows) ? row.certificationRows : [],
      otherTrainingRows: Array.isArray(row.otherTrainingRows) ? row.otherTrainingRows : [],
      learningAreaMap: row.learningAreaMap || row.matrixData || row.matrix_data || {},
      designations: Array.isArray(row.designations) ? row.designations : []
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
    keyStage: row.key_stage || raw.keyStage || null,
    key_stage: row.key_stage || raw.keyStage || null,
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
    term: row.term || raw.term || '1st',
    rawPayload: raw
  };
}

function formatAdminTaskRecord(row) {
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
    task: row.task_name,
    task_name: row.task_name,
    taskName: row.task_name,
    category: row.task_category || raw.category || 'General Administration',
    taskCategory: row.task_category || raw.category || 'General Administration',
    startTime: row.start_time ? String(row.start_time).substring(0, 5) : (raw.startTime || '13:00'),
    start_time: row.start_time ? String(row.start_time).substring(0, 5) : (raw.startTime || '13:00'),
    endTime: row.end_time ? String(row.end_time).substring(0, 5) : (raw.endTime || '14:00'),
    end_time: row.end_time ? String(row.end_time).substring(0, 5) : (raw.endTime || '14:00'),
    days: row.days || raw.days || ['M', 'T', 'W', 'TH', 'F'],
    term: row.term || raw.term || '1st',
    startDate: row.start_date || raw.startDate || null,
    start_date: row.start_date || raw.startDate || null,
    endDate: row.end_date || raw.endDate || null,
    end_date: row.end_date || raw.endDate || null,
    dates: row.dates || raw.dates || [],
    durationMinutes: row.duration_minutes || raw.durationMinutes || 60,
    duration_minutes: row.duration_minutes || raw.durationMinutes || 60,
    termTotalHours: row.term_total_hours ? parseFloat(row.term_total_hours) : (raw.termTotalHours || 0),
    isDesignationSynced: !!row.is_designation_synced,
    is_designation_synced: !!row.is_designation_synced,
    status: row.status || 'ACTIVE',
    rawPayload: raw
  };
}

// Formatter to standardize database rows into frontend-compatible objects
function formatPersonnelRecord(row, trainingsList = [], designationsList = [], workloadList = [], adminTaskList = []) {
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
    noDepedEmail: !!row.no_deped_email || row.deped_email === 'N/A',
    no_deped_email: !!row.no_deped_email || row.deped_email === 'N/A',
    allowEmailDiscrepancy: !!row.allow_email_discrepancy,
    allow_email_discrepancy: !!row.allow_email_discrepancy,
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
    lastPromotionDate: row.last_promotion_date ? (row.last_promotion_date instanceof Date ? row.last_promotion_date.toISOString().split('T')[0] : String(row.last_promotion_date).split('T')[0]) : (row.first_service_date ? (row.first_service_date instanceof Date ? row.first_service_date.toISOString().split('T')[0] : String(row.first_service_date).split('T')[0]) : 'N/A'),
    newStationDate: row.new_station_date ? (row.new_station_date instanceof Date ? row.new_station_date.toISOString().split('T')[0] : String(row.new_station_date).split('T')[0]) : (row.first_service_date ? (row.first_service_date instanceof Date ? row.first_service_date.toISOString().split('T')[0] : String(row.first_service_date).split('T')[0]) : 'N/A'),
    lastLateralMovementDate: row.last_lateral_movement_date ? (row.last_lateral_movement_date instanceof Date ? row.last_lateral_movement_date.toISOString().split('T')[0] : String(row.last_lateral_movement_date).split('T')[0]) : 'N/A',
    stepIncrementConfirmed: true,
    step_increment_confirmed: true,

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
    mastersWithUnitsDisciplines: parsedPostDisc.mastersWithUnits,
    mastersGraduatedDisciplines: parsedPostDisc.mastersGraduated,
    doctorateDiscipline: parsedPostDisc.doctorateDiscipline,
    doctorateDisciplines: parsedPostDisc.doctorate,
    doctorateWithUnitsDisciplines: parsedPostDisc.doctorateWithUnits,
    doctorateGraduatedDisciplines: parsedPostDisc.doctorateGraduated,
    collegeDegrees: row.college_degrees && Array.isArray(row.college_degrees) && row.college_degrees.length > 0
      ? row.college_degrees
      : (rawEduc.collegeDegrees || rawProfile.collegeDegrees || (row.college_degree ? [{ collegeDegree: row.college_degree, major: row.major || '', minor: row.minor || '' }] : [])),
    degreeRows: rawEduc.degreeRows || rawProfile.degreeRows || (row.college_degree ? [{ clientKey: 'legacy-1', level: 'BACCALAUREATE', collegeDegree: row.college_degree, major: row.major || '', minor: row.minor || '' }] : []),
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

    // Administrative Tasks (from esf7_admin_task or raw_payload fallback)
    administrativeRows: (Array.isArray(adminTaskList) && adminTaskList.length > 0)
      ? adminTaskList.map(formatAdminTaskRecord)
      : (Array.isArray(rawProfile.administrativeRows) ? rawProfile.administrativeRows : []),

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

    const timing = { start: Date.now() };

    // 1. Fetch master records from insightEd database
    const masterList = await fetchMasterPersonnelFromInsightEd(cleanSchoolId);
    timing.master = Date.now() - timing.start;

    // Start independent per-school lookups concurrently (previously run one after another)
    const sidPair = [cleanSchoolId, `SCH-${cleanSchoolId}`];
    const wklPromise = db.query(
      `SELECT * FROM esf7_workload_rows WHERE school_id = ANY($1) ORDER BY created_at ASC`, [sidPair]
    ).catch(() => ({ rows: [] }));
    const shsWklPromise = db.query(
      `SELECT * FROM esf7_shs_workload_rows WHERE school_id = ANY($1) ORDER BY created_at ASC`, [sidPair]
    ).catch(() => ({ rows: [] }));
    const admPromise = db.query(
      `SELECT * FROM esf7_admin_task WHERE school_id = $1 ORDER BY created_at ASC`, [schoolId]
    ).catch(() => ({ rows: [] }));
    const trPromise = db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE school_id = ANY($1) ORDER BY created_at ASC`, [sidPair]
    ).catch(() => ({ rows: [] }));
    const dsgPromise = db.query(
      `SELECT * FROM esf7_personnel_designations WHERE school_id = ANY($1) ORDER BY created_at ASC`, [sidPair]
    ).catch(() => ({ rows: [] }));
    const delPromise = db.query(
      `SELECT * FROM esf7_deleted_personnel WHERE school_id = ANY($1)`, [sidPair]
    ).catch(() => ({ rows: [] }));

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
        ed.college_degrees,
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
      WHERE p.school_id = ANY($1)
      ORDER BY p.created_at ASC, p.id ASC
    `, [sidPair]);

    // 3. Fetch all workload rows for this school from esf7_workload_rows and esf7_shs_workload_rows
    const [wklRes, shsWklRes] = await Promise.all([wklPromise, (typeof shsWklPromise !== 'undefined' ? shsWklPromise : Promise.resolve({ rows: [] }))]);

    const workloadMap = new Map();
    for (const wRow of [...wklRes.rows, ...(shsWklRes?.rows || [])]) {
      const pKey = String(wRow.personnel_id || '').trim().toUpperCase();
      if (!pKey) continue;
      const formattedWkl = formatWorkloadRecord(wRow);
      if (!workloadMap.has(pKey)) workloadMap.set(pKey, []);
      const existing = workloadMap.get(pKey);
      if (!existing.some(r => r.id === wRow.id)) {
        existing.push(formattedWkl);
      }

      // Also index clean numeric key if personnel_id is PER-xxxxxx-nnn or PRN-xxxxxx-nnn
      const stripped = pKey.replace(/^PER-/, '').replace(/^PRN-/, '');
      if (stripped && stripped !== pKey) {
        if (!workloadMap.has(stripped)) workloadMap.set(stripped, []);
        const strippedExisting = workloadMap.get(stripped);
        if (!strippedExisting.some(r => r.id === wRow.id)) {
          strippedExisting.push(formattedWkl);
        }
      }
    }

    const getWorkloadForTeacher = (id, prn, empNo) => {
      const kId = String(id || '').trim().toUpperCase();
      const kPrn = String(prn || '').trim().toUpperCase();
      const kEmp = String(empNo || '').trim().toUpperCase();
      const direct = (kId && workloadMap.get(kId)) ||
                     (kPrn && workloadMap.get(kPrn)) ||
                     (kEmp && workloadMap.get(kEmp));
      if (direct && direct.length > 0) return direct;
      if (kId) {
        const stripped = kId.replace(/^PER-/, '').replace(/^PRN-/, '');
        if (stripped && workloadMap.has(stripped)) return workloadMap.get(stripped);
      }
      return [];
    };

    const adminTaskMap = new Map();
    const admRes = await admPromise;

    for (const aRow of admRes.rows) {
      const pKey = String(aRow.personnel_id).toUpperCase();
      if (!adminTaskMap.has(pKey)) adminTaskMap.set(pKey, []);
      adminTaskMap.get(pKey).push(aRow);
    }

    const trainingsMap = new Map();
    const trRes = await trPromise;
    for (const tRow of trRes.rows) {
      const pKey = String(tRow.personnel_id).toUpperCase();
      if (!trainingsMap.has(pKey)) trainingsMap.set(pKey, []);
      trainingsMap.get(pKey).push(tRow);
    }

    const designationsMap = new Map();
    const dsgRes = await dsgPromise;
    for (const dRow of dsgRes.rows) {
      const pKey = String(dRow.personnel_id).toUpperCase();
      if (!designationsMap.has(pKey)) designationsMap.set(pKey, []);
      designationsMap.get(pKey).push(dRow);
    }

    // Build persistent deletion tombstone sets (strictly filter out generic/placeholder keys)
    const delRes = await delPromise;
    const deletedIdSet = new Set();
    const deletedPrnSet = new Set();
    const deletedEmpNoSet = new Set();
    const deletedNameSet = new Set();

    const isNonGenericKey = (val) => {
      if (!val || typeof val !== 'string') return false;
      const s = val.trim().toUpperCase();
      if (!s || s === 'N/A' || s === 'NA' || s === 'NONE' || s === 'NULL' || s === 'UNDEFINED' || s === '-' || s === 'TEACHER STAFF' || s === 'TEACHER' || s === 'STAFF') {
        return false;
      }
      return s.length >= 2;
    };

    for (const dRow of delRes.rows) {
      if (isNonGenericKey(dRow.personnel_id)) deletedIdSet.add(String(dRow.personnel_id).trim().toUpperCase());
      if (isNonGenericKey(dRow.prn)) deletedPrnSet.add(String(dRow.prn).trim().toUpperCase());
      if (isNonGenericKey(dRow.employee_no)) deletedEmpNoSet.add(String(dRow.employee_no).trim().toUpperCase());
      if (isNonGenericKey(dRow.full_name_clean) && String(dRow.full_name_clean).trim().toUpperCase() !== 'TEACHER STAFF') {
        deletedNameSet.add(String(dRow.full_name_clean).trim().toUpperCase());
      }
      if (dRow.first_name && dRow.last_name) {
        const full = `${String(dRow.first_name).trim()} ${String(dRow.last_name).trim()}`.trim().toUpperCase();
        if (isNonGenericKey(full) && full !== 'TEACHER STAFF') {
          deletedNameSet.add(full);
        }
      }
    }

    timing.local = Date.now() - timing.start - timing.master;

    const isRecordTombstoned = (pId, pPrn, pEmp, pName) => {
      const idUpper = String(pId || '').trim().toUpperCase();
      const prnUpper = String(pPrn || '').trim().toUpperCase();
      const empUpper = String(pEmp || '').trim().toUpperCase();
      const nameUpper = String(pName || '').trim().toUpperCase();

      if (isNonGenericKey(idUpper) && deletedIdSet.has(idUpper)) return true;
      if (isNonGenericKey(prnUpper) && deletedPrnSet.has(prnUpper)) return true;
      if (isNonGenericKey(empUpper) && deletedEmpNoSet.has(empUpper)) return true;
      if (isNonGenericKey(nameUpper) && nameUpper !== 'TEACHER STAFF' && deletedNameSet.has(nameUpper)) return true;
      return false;
    };

    const dbMap = new Map();
    for (const row of result.rows) {
      const pNameUpper = `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim().toUpperCase();

      // Skip locally saved records only if explicitly tombstoned by valid non-generic key
      if (isRecordTombstoned(row.id, row.prn, row.employee_no, pNameUpper)) {
        continue;
      }

      const trList = trainingsMap.get(String(row.id).toUpperCase()) || (row.prn ? trainingsMap.get(String(row.prn).toUpperCase()) : []) || [];
      const dsgList = designationsMap.get(String(row.id).toUpperCase()) || (row.prn ? designationsMap.get(String(row.prn).toUpperCase()) : []) || [];
      const wklList = getWorkloadForTeacher(row.id, row.prn, row.employee_no);
      const admList = adminTaskMap.get(String(row.id).toUpperCase()) || (row.prn ? adminTaskMap.get(String(row.prn).toUpperCase()) : []) || [];
      const formatted = formatPersonnelRecord(row, trList, dsgList, wklList, admList);
      if (formatted.id) dbMap.set(String(formatted.id).toUpperCase(), formatted);
      if (formatted.prn) dbMap.set(String(formatted.prn).toUpperCase(), formatted);
    }

    // Filter master list against persistent tombstones
    const filteredMasterList = masterList.filter(m => {
      const mName = `${String(m.first_name || m.firstName || '').trim()} ${String(m.last_name || m.lastName || '').trim()}`.trim().toUpperCase();
      return !isRecordTombstoned(m.id, m.prn, m.employee_no || m.employeeNo, mName);
    });

    const mergedList = [];
    const usedDbKeys = new Set();

    // Overlay master records with DB saved records where available
    for (const m of filteredMasterList) {
      const idKey = String(m.id || '').toUpperCase();
      const prnKey = String(m.prn || '').toUpperCase();
      const dbMatch = (idKey && dbMap.get(idKey)) || (prnKey && dbMap.get(prnKey));

      if (dbMatch) {
        const isDbMatchPlaceholder = (!dbMatch.position && m.position) || 
          (dbMatch.firstName === 'TEACHER' && String(dbMatch.lastName || '').startsWith('STAFF') && m.firstName !== 'TEACHER');

        const savedWkl = getWorkloadForTeacher(dbMatch.id || m.id, dbMatch.prn || m.prn, dbMatch.employee_no || m.employee_no || m.employeeNo);
        const resolvedWkl = (Array.isArray(dbMatch.workloadRows) && dbMatch.workloadRows.length > 0)
          ? dbMatch.workloadRows
          : (savedWkl.length > 0 ? savedWkl : (Array.isArray(m.workloadRows) ? m.workloadRows : []));

        const mergedRecord = isDbMatchPlaceholder ? {
          ...m,
          ...dbMatch,
          firstName: m.firstName,
          first_name: m.first_name,
          lastName: m.lastName,
          last_name: m.last_name,
          middleName: m.middleName || dbMatch.middleName,
          middle_name: m.middle_name || dbMatch.middle_name,
          position: m.position || dbMatch.position,
          plantilla_position: m.plantilla_position || dbMatch.plantilla_position,
          position_title: m.position_title || dbMatch.position_title,
          type: m.type || dbMatch.type,
          positionCategory: m.positionCategory || dbMatch.positionCategory,
          position_category: m.position_category || dbMatch.position_category,
          sexAtBirth: m.sexAtBirth || dbMatch.sexAtBirth,
          sex_at_birth: m.sex_at_birth || dbMatch.sex_at_birth,
          birthdate: m.birthdate || dbMatch.birthdate,
          age: m.age || dbMatch.age,
          collegeDegree: m.collegeDegree || dbMatch.collegeDegree,
          college_degree: m.college_degree || dbMatch.college_degree,
          major: m.major || dbMatch.major,
          minor: m.minor || dbMatch.minor || 'N/A',
          highestEducationalAttainment: m.highestEducationalAttainment || dbMatch.highestEducationalAttainment,
          highest_educational_attainment: m.highest_educational_attainment || dbMatch.highest_educational_attainment,
          degreeRows: (Array.isArray(m.degreeRows) && m.degreeRows.length > 0) ? m.degreeRows : (dbMatch.degreeRows || []),
          collegeDegrees: (Array.isArray(m.collegeDegrees) && m.collegeDegrees.length > 0) ? m.collegeDegrees : (dbMatch.collegeDegrees || []),
          prcSpecialization: m.prcSpecialization || dbMatch.prcSpecialization,
          prc_specialization: m.prc_specialization || dbMatch.prc_specialization,
          eligibility: (Array.isArray(m.eligibility) && m.eligibility.length > 0) ? m.eligibility : dbMatch.eligibility,
          workloadRows: resolvedWkl,
          designations: (Array.isArray(dbMatch.designations) && dbMatch.designations.length > 0) ? dbMatch.designations : (m.designations || []),
          trainings: (Array.isArray(dbMatch.trainings) && dbMatch.trainings.length > 0) ? dbMatch.trainings : (m.trainings || [])
        } : {
          ...m,
          ...dbMatch,
          position: dbMatch.position || m.position,
          position_title: dbMatch.position_title || m.position_title || m.position,
          collegeDegree: dbMatch.collegeDegree || dbMatch.college_degree || m.collegeDegree || m.college_degree || '',
          college_degree: dbMatch.college_degree || dbMatch.collegeDegree || m.college_degree || m.collegeDegree || '',
          major: dbMatch.major || m.major || '',
          minor: dbMatch.minor || m.minor || 'N/A',
          highestEducationalAttainment: dbMatch.highestEducationalAttainment || dbMatch.highest_educational_attainment || m.highestEducationalAttainment || m.highest_educational_attainment || '',
          highest_educational_attainment: dbMatch.highest_educational_attainment || dbMatch.highestEducationalAttainment || m.highest_educational_attainment || m.highestEducationalAttainment || '',
          degreeRows: (Array.isArray(dbMatch.degreeRows) && dbMatch.degreeRows.length > 0) ? dbMatch.degreeRows : (m.degreeRows || []),
          collegeDegrees: (Array.isArray(dbMatch.collegeDegrees) && dbMatch.collegeDegrees.length > 0) ? dbMatch.collegeDegrees : (m.collegeDegrees || []),
          prcSpecialization: dbMatch.prcSpecialization || dbMatch.prc_specialization || m.prcSpecialization || m.prc_specialization || '',
          prc_specialization: dbMatch.prc_specialization || dbMatch.prcSpecialization || m.prc_specialization || m.prcSpecialization || '',
          workloadRows: resolvedWkl
        };

        mergedList.push(mergedRecord);
        if (dbMatch.id) usedDbKeys.add(String(dbMatch.id).toUpperCase());
        if (dbMatch.prn) usedDbKeys.add(String(dbMatch.prn).toUpperCase());
      } else {
        const mWkl = getWorkloadForTeacher(m.id, m.prn, m.employee_no || m.employeeNo);
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
    const targetQueryText = `
      SELECT 
        r.*,
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment,
        e.fund_source,
        e.nature_of_appointment,
        e.hiring_arrangement,
        e.deployment_status as mother_deployment_status,
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
        ed.college_degrees,
        ed.major,
        ed.minor,
        ed.post_graduate_degree,
        ed.post_graduate_discipline,
        ed.eligibility,
        ed.prc_specialization,
        ed.raw_payload AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        la.raw_payload AS la_raw_payload,
        p.id as master_profile_id,
        p.prn as master_prn,
        p.first_name as master_fn,
        p.last_name as master_ln,
        e.position as master_pos
      FROM esf7_requests r
      LEFT JOIN esf7_personnel_profile p ON (r.personnel_id = p.id OR r.personnel_id = p.prn)
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
      WHERE (r.target_school_id = $1 OR r.target_school_id = $2 OR REPLACE(r.target_school_id, 'SCH-', '') = $1 OR r.target_school_id ILIKE $3)
        AND LOWER(r.status) = 'approved'
    `;
    const targetParams = [cleanSchoolId, `SCH-${cleanSchoolId}`, `%${cleanSchoolId}%`];
    let targetReqs = await db.query(targetQueryText, targetParams).catch((err) => {
      console.warn('[targetReqs join warning]:', err.message);
      return { rows: [] };
    });

    if (targetReqs.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId) ? db.prodPool : db.stagingPool;
      targetReqs = await fallbackPool.query(targetQueryText, targetParams).catch(() => ({ rows: [] }));
    }

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

      // Fetch training & designation records for the borrowed personnel if available
      let trRows = [];
      let dsgRows = [];
      if (reqRow.master_profile_id) {
        const trRes = await db.query(
          `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
          [reqRow.master_profile_id]
        ).catch(() => ({ rows: [] }));
        trRows = trRes.rows || [];

        const dsgRes = await db.query(
          `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
          [reqRow.master_profile_id]
        ).catch(() => ({ rows: [] }));
        dsgRows = dsgRes.rows || [];
      }

      const wklList = workloadMap.get(String(targetId).toUpperCase()) || (targetPrn ? workloadMap.get(String(targetPrn).toUpperCase()) : []) || [];
      const admList = adminTaskMap.get(String(targetId).toUpperCase()) || (targetPrn ? adminTaskMap.get(String(targetPrn).toUpperCase()) : []) || [];

      if (!existingMatch) {
        if (reqRow.master_profile_id) {
          const formatted = formatPersonnelRecord(reqRow, trRows, dsgRows, wklList, admList);
          mergedList.push({
            ...formatted,
            schoolId: cleanSchoolId,
            school_id: cleanSchoolId,
            deploymentStatus: depStatus,
            deployment_status: depStatus,
            requestType: reqRow.request_type,
            motherSchoolId: reqRow.requester_school_id,
            partnerSchoolId: reqRow.requester_school_id,
            isClustered: isClustered,
            isBorrowed: !isClustered,
            isShared: true,
            workloadRows: wklList
          });
        } else {
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
            motherSchoolId: reqRow.requester_school_id,
            partnerSchoolId: reqRow.requester_school_id,
            isClustered: isClustered,
            isBorrowed: !isClustered,
            isShared: true,
            workloadRows: wklList
          });
        }
      } else {
        existingMatch.deploymentStatus = depStatus;
        existingMatch.deployment_status = depStatus;
        existingMatch.requestType = reqRow.request_type;
        existingMatch.motherSchoolId = reqRow.requester_school_id;
        existingMatch.partnerSchoolId = reqRow.requester_school_id;
        existingMatch.isClustered = isClustered;
        existingMatch.isBorrowed = !isClustered;
        existingMatch.isShared = true;
      }
    }

    // B. Check for requests REQUESTED BY this school (Mother/Plantilla School)
    const motherQueryText = `
      SELECT * FROM esf7_requests 
      WHERE (requester_school_id = $1 OR requester_school_id = $2 OR REPLACE(requester_school_id, 'SCH-', '') = $1 OR requester_school_id ILIKE $3)
        AND LOWER(status) = 'approved'
    `;
    const motherParams = [cleanSchoolId, `SCH-${cleanSchoolId}`, `%${cleanSchoolId}%`];
    let motherReqs = await db.query(motherQueryText, motherParams).catch(() => ({ rows: [] }));
    if (motherReqs.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId) ? db.prodPool : db.stagingPool;
      motherReqs = await fallbackPool.query(motherQueryText, motherParams).catch(() => ({ rows: [] }));
    }

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

    timing.total = Date.now() - timing.start;
    // Stage timings so a future slow/504 request shows where the time went (master DB vs local DB vs requests).
    if (timing.total > 2000) {
      console.warn(`[Personnel Timing] school ${cleanSchoolId} slow: total=${timing.total}ms master=${timing.master}ms local=${timing.local}ms rows=${mergedList.length}`);
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
        ed.college_degrees,
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
    const [wklRes, shsWklRes] = await Promise.all([
      db.query(`SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`, [row.id]).catch(() => ({ rows: [] })),
      db.query(`SELECT * FROM esf7_shs_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`, [row.id]).catch(() => ({ rows: [] }))
    ]);
    const seenWklIds = new Set();
    const wklList = [];
    for (const r of [...wklRes.rows, ...shsWklRes.rows]) {
      if (!seenWklIds.has(r.id)) {
        seenWklIds.add(r.id);
        wklList.push(formatWorkloadRecord(r));
      }
    }

    const admRes = await db.query(
      `SELECT * FROM esf7_admin_task WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );

    res.json(formatPersonnelRecord(row, trRes.rows, dsgRes.rows, wklList, admRes.rows));
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
      let keyStage = null;
      let gradeLevel = null;
      let subjectArea = null;
      let track = null;

      const upper = cleanKey.toUpperCase();

      // 1. Department Head - Key Stage 1 (Early Primary: Kinder - Grade 3)
      if (
        upper.startsWith('DEPARTMENT HEAD') && (
          upper.includes('KEY STAGE 1') || upper.includes('KS1') || 
          upper.includes('KINDER') || upper.includes('GRADE 1') || upper.includes('GRADE 2') || upper.includes('GRADE 3')
        ) && !upper.includes('KEY STAGE 2') && !upper.includes('KEY STAGE 3') && !upper.includes('KEY STAGE 4') &&
        !upper.includes('GRADE 4') && !upper.includes('GRADE 5') && !upper.includes('GRADE 6') &&
        !upper.includes('GRADE 7') && !upper.includes('GRADE 8') && !upper.includes('GRADE 9') && !upper.includes('GRADE 10')
      ) {
        keyStage = 'KS1';
        dsgName = 'DEPARTMENT HEAD';
        subjectArea = 'Early Primary Literacy & Numeracy';

        if (upper.includes('KINDER - GRADE 3') || upper.includes('KINDER TO GRADE 3') || upper === 'DEPARTMENT HEAD - KEY STAGE 1' || upper === 'DEPARTMENT HEAD - KS1') {
          gradeLevel = 'Kinder, Grade 1, Grade 2, Grade 3';
        } else {
          const detected = [];
          if (upper.includes('KINDER')) detected.push('Kinder');
          if (upper.includes('GRADE 1') || upper.includes('G1')) detected.push('Grade 1');
          if (upper.includes('GRADE 2') || upper.includes('G2')) detected.push('Grade 2');
          if (upper.includes('GRADE 3') || upper.includes('G3')) detected.push('Grade 3');
          gradeLevel = detected.length > 0 ? detected.join(', ') : 'Kinder, Grade 1, Grade 2, Grade 3';
        }
      }
      // 2. Department Head - Key Stage 2 (Intermediate: Grade 4 - Grade 6)
      else if (upper.startsWith('DEPARTMENT HEAD') && (upper.includes('KEY STAGE 2') || upper.includes('KS2'))) {
        keyStage = 'KS2';
        dsgName = 'DEPARTMENT HEAD';
        gradeLevel = 'Grade 4, Grade 5, Grade 6';
        if (cleanKey.includes(' - ')) {
          const parts = cleanKey.split(' - ');
          subjectArea = parts[parts.length - 1].trim();
        }
      }
      // 3. Department Head - Key Stage 3 (Junior High School: Grade 7 - Grade 10)
      else if (upper.startsWith('DEPARTMENT HEAD') && (upper.includes('KEY STAGE 3') || upper.includes('KS3'))) {
        keyStage = 'KS3';
        dsgName = 'DEPARTMENT HEAD';
        gradeLevel = 'Grade 7, Grade 8, Grade 9, Grade 10';
        if (cleanKey.includes(' - ')) {
          const parts = cleanKey.split(' - ');
          subjectArea = parts[parts.length - 1].trim();
        }
      }
      // 4. Department Head - Key Stage 4 (Senior High School: Grade 11 - Grade 12)
      else if (upper.startsWith('DEPARTMENT HEAD') && (upper.includes('KEY STAGE 4') || upper.includes('KS4') || upper.includes('ACADEMIC TRACK') || upper.includes('TECH-PRO TRACK') || upper.includes('SHS'))) {
        keyStage = 'KS4';
        dsgName = 'DEPARTMENT HEAD';
        gradeLevel = 'Grade 11, Grade 12';
        track = upper.includes('TECH') ? 'Tech-Pro Track' : 'Academic Track';
      }
      // 5. Grade Level / Learning Area Chairpersons & Other Roles
      else if (cleanKey.includes(' - ')) {
        const parts = cleanKey.split(' - ');
        dsgName = parts[0].trim();
        const subPart = parts.slice(1).join(' - ').trim();

        const gradeMatch = subPart.match(/\((Grade\s*\d+|Kinder|Grade\s*1[0-2])\)/i) || subPart.match(/^(Grade\s*\d+|Kinder|Grade\s*1[0-2])$/i);
        if (gradeMatch) {
          gradeLevel = gradeMatch[1] || gradeMatch[0];
          subjectArea = subPart.replace(gradeMatch[0], '').trim() || null;
        } else {
          subjectArea = subPart;
        }
      }

      dsgObj = {
        designationName: dsgName,
        keyStage: keyStage || null,
        gradeLevel: gradeLevel || '',
        subjectArea: subjectArea || '',
        track: track || '',
        isSdsApproved: isSds,
        sdsConfirmed: isSds,
        serializedKey: rawStr,
        rawPayload: {
          designation: cleanKey,
          keyStage: keyStage || null,
          gradeLevel: gradeLevel || null,
          subjectArea: subjectArea || null,
          track: track || null,
          isSdsApproved: isSds,
          serializedKey: rawStr
        }
      };
    } else if (typeof item === 'object') {
      const rawKey = item.serializedKey || item.serialized_key || item.designation || item.designationName || item.designation_name || item.name || 'OFFICIAL DESIGNATION';
      const cleanKey = String(rawKey).replace(/::APPROVED_SDS/gi, '').trim();
      if (!cleanKey || processedKeys.has(cleanKey.toUpperCase())) continue;
      processedKeys.add(cleanKey.toUpperCase());

      const upper = cleanKey.toUpperCase();
      let keyStage = item.keyStage || item.key_stage || null;
      if (!keyStage) {
        if (
          upper.startsWith('DEPARTMENT HEAD') && (
            upper.includes('KEY STAGE 1') || upper.includes('KS1') || 
            upper.includes('KINDER') || upper.includes('GRADE 1') || upper.includes('GRADE 2') || upper.includes('GRADE 3')
          ) && !upper.includes('KEY STAGE 2') && !upper.includes('KEY STAGE 3') && !upper.includes('KEY STAGE 4') &&
          !upper.includes('GRADE 4') && !upper.includes('GRADE 5') && !upper.includes('GRADE 6') &&
          !upper.includes('GRADE 7') && !upper.includes('GRADE 8') && !upper.includes('GRADE 9') && !upper.includes('GRADE 10')
        ) {
          keyStage = 'KS1';
        } else if (upper.includes('KEY STAGE 2') || upper.includes('KS2')) {
          keyStage = 'KS2';
        } else if (upper.includes('KEY STAGE 3') || upper.includes('KS3')) {
          keyStage = 'KS3';
        } else if (upper.includes('KEY STAGE 4') || upper.includes('KS4') || upper.includes('ACADEMIC TRACK') || upper.includes('TECH-PRO TRACK')) {
          keyStage = 'KS4';
        }
      }

      const isSds = !!(item.isSdsApproved || item.is_sds_approved || String(rawKey).includes('::APPROVED_SDS'));
      const isConf = !!(item.sdsConfirmed || item.sds_confirmed || isSds);
      const dsgName = (item.designationName || item.designation_name || item.name || cleanKey.split(' - ')[0]).replace(/::APPROVED_SDS/gi, '').trim();

      dsgObj = {
        designationName: dsgName || 'OFFICIAL DESIGNATION',
        keyStage: keyStage || null,
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

    const dsgId = `DSG-${String(targetSchoolId).replace('SCH-', '')}-${String(personnelId).split('-').pop()}-${String(counter++).padStart(3, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    await client.query(
      `INSERT INTO esf7_personnel_designations (
        id, personnel_id, designation_name, key_stage, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        dsgId,
        personnelId,
        dsgObj.designationName,
        dsgObj.keyStage || null,
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
      employee_no, employeeNo, deped_email, depedEmail, no_deped_email, noDepedEmail,
      allow_email_discrepancy, allowEmailDiscrepancy,
      is_school_head, isSchoolHead,
      prn: inputPrn,
      // Employment fields
      position_category, positionCategory, position, step_increment, stepIncrement,
      fund_source, fundSource, nature_of_appointment, natureOfAppointment,
      hiring_arrangement, hiringArrangement, deployment_status, deploymentStatus,
      assigned_schools, assignedSchools, grade_levels_taught, gradeLevelsTaught, assignedGradeLevels, assigned_grade_levels,
      first_service_date, firstServiceDate, last_promotion_date, lastPromotionDate,
      new_station_date, newStationDate, last_lateral_movement_date, lastLateralMovementDate,
      // Education fields
      highest_educational_attainment, highestEducationalAttainment,
      shs_track, shsTrack,
      vocational_course, vocationalCourse,
      vocational_level, vocationalLevel,
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

    const targetSchoolId = school_id || bodySchoolId || (req.auth && req.auth.schoolId) || '108348';
    const targetSchoolYear = school_year || bodySchoolYear || '2026-2027';

    // Idempotent create: a client-chosen id (or PRN) that already exists is the same person. A retry or a second save
    // answers "existing" and writes nothing instead of failing on the primary key or creating a second record.
    if (req.body.id || inputPrn) {
      const dup = await client.query(
        'SELECT id, prn, school_id FROM esf7_personnel_profile WHERE ($1::text IS NOT NULL AND id = $1) OR ($2::text IS NOT NULL AND prn = $2) LIMIT 1',
        [req.body.id || null, inputPrn || null]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(200).json({ id: dup.rows[0].id, prn: dup.rows[0].prn, schoolId: dup.rows[0].school_id, existing: true });
      }
    }

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

    const finalAllowEmailDiscrepancy = allow_email_discrepancy !== undefined ? (allow_email_discrepancy === true || allow_email_discrepancy === 'true') : allowEmailDiscrepancy !== undefined ? (allowEmailDiscrepancy === true || allowEmailDiscrepancy === 'true') : false;

    const insertProfileQuery = `
      INSERT INTO esf7_personnel_profile (
        id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
        tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
        philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
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
      coerceDateField(birthdate, 'birthdate'),
      computedAge,
      philsys_no || philsysNo || null,
      no_philsys === true || noPhilsys === true,
      employee_no || employeeNo || null,
      (() => {
        const rawAppt = (nature_of_appointment || natureOfAppointment || '').toUpperCase().trim();
        const rawMail = (deped_email || depedEmail || '').trim();
        if (rawAppt === 'REGULAR PERMANENT' && rawMail === 'N/A') return '';
        return rawMail;
      })(),
      (() => {
        const rawAppt = (nature_of_appointment || natureOfAppointment || '').toUpperCase().trim();
        if (rawAppt === 'REGULAR PERMANENT') return false;
        return no_deped_email === true || noDepedEmail === true || deped_email === 'N/A' || depedEmail === 'N/A';
      })(),
      finalAllowEmailDiscrepancy,
      is_school_head === true || isSchoolHead === true,
      JSON.stringify(req.body)
    ];

    const profileRes = await client.query(insertProfileQuery, profileValues);
    const createdProfile = profileRes.rows[0];

    // Insert linked employment
    const empPos = (position || 'TEACHER I').toUpperCase();
    const isCook = empPos === 'COOK';
    const catObj = determinePositionCategory(empPos);
    const empCat = isCook ? 'NON-TEACHING' : (position_category || positionCategory || type || catObj.category || 'TEACHING').toUpperCase();
    const empStep = Number(step_increment || stepIncrement || 1);
    let empFund = (fund_source || fundSource || (isCook ? 'SBFP' : 'NATIONAL')).toUpperCase();
    if (!isCook && empFund === 'SBFP') {
      empFund = 'NATIONAL';
    }
    const empAppt = (nature_of_appointment || natureOfAppointment || (isCook ? 'CONTRACTUAL' : 'REGULAR PERMANENT')).toUpperCase();
    const empHire = (hiring_arrangement || hiringArrangement || (isCook ? 'CONTRACTUAL' : 'PERMANENT')).toUpperCase();
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
      coerceDateField(first_service_date || firstServiceDate, 'first_service_date'),
      coerceDateField(last_promotion_date || lastPromotionDate, 'last_promotion_date'),
      coerceDateField(new_station_date || newStationDate, 'new_station_date'),
      coerceDateField(last_lateral_movement_date || lastLateralMovementDate, 'last_lateral_movement_date'),
      JSON.stringify(req.body)
    ];

    const empRes = await client.query(insertEmpQuery, empValues);

    //     // Upsert linked education
    const eduHighestAttainment = (
      highest_educational_attainment || highestEducationalAttainment ||
      (college_degree || collegeDegree ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'COLLEGE GRADUATE / BACCALAUREATE')
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || '').toUpperCase() || null;
    const eduVocationalCourse = (vocational_course || vocationalCourse || '').toUpperCase() || null;
    const eduVocationalLevel = (vocational_level || vocationalLevel || '').toUpperCase() || null;
    let eduDegree = (college_degree || collegeDegree || '').toUpperCase() || null;
    let eduMaj = (major || '').toUpperCase();
    let eduMin = (minor || '').toUpperCase();

    const rawCollegeDegrees = req.body.college_degrees || req.body.collegeDegrees;
    let eduCollegeDegrees = [];
    if (Array.isArray(rawCollegeDegrees)) {
      eduCollegeDegrees = rawCollegeDegrees
        .filter(d => d && (d.collegeDegree || d.college_degree))
        .map(d => ({
          collegeDegree: (d.collegeDegree || d.college_degree || '').trim().toUpperCase(),
          major: (d.major || '').trim().toUpperCase(),
          minor: (d.minor || '').trim().toUpperCase()
        }));
    }
    if (eduCollegeDegrees.length > 0) {
      eduDegree = eduCollegeDegrees[0].collegeDegree || eduDegree;
      eduMaj = eduCollegeDegrees[0].major || eduMaj;
      eduMin = eduCollegeDegrees[0].minor || eduMin;
    } else if (eduDegree) {
      eduCollegeDegrees = [{
        collegeDegree: eduDegree,
        major: eduMaj || '',
        minor: eduMin || ''
      }];
    }

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
        college_degree, college_degrees, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
        college_degree = EXCLUDED.college_degree,
        college_degrees = EXCLUDED.college_degrees,
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
      JSON.stringify(eduCollegeDegrees),
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
        ed.college_degrees,
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
    res.status(err.status || 500).json({ error: err.message, ...(err.field ? { field: err.field } : {}) });
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
      no_deped_email, noDepedEmail,
      allow_email_discrepancy, allowEmailDiscrepancy,
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
      `SELECT * FROM esf7_personnel_profile WHERE id = $1 OR UPPER(id) = UPPER($1) OR prn = $1 LIMIT 1`,
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
    const finalBDate = birthdate !== undefined ? (isDatePlaceholder(birthdate) && birthdate !== null && birthdate !== '' ? current.birthdate : coerceDateField(birthdate, 'birthdate')) : current.birthdate;
    const finalAge = age !== undefined ? age : sanitizeAge(current.age, finalBDate);
    const finalPhilSys = (philsys_no !== undefined ? philsys_no : philsysNo !== undefined ? philsysNo : current.philsys_no || '').trim();
    const finalNoPhilSys = (no_philsys !== undefined ? (no_philsys === true || no_philsys === 'true') : noPhilsys !== undefined ? (noPhilsys === true || noPhilsys === 'true') : current.no_philsys);
    const finalEmpNo = (employee_no !== undefined ? employee_no : employeeNo !== undefined ? employeeNo : current.employee_no || '').trim();
    const empApptCheck = (nature_of_appointment || natureOfAppointment || (current.nature_of_appointment || 'REGULAR PERMANENT')).toUpperCase().trim();
    const isRegularPermanent = empApptCheck === 'REGULAR PERMANENT';
    const rawEmail = (deped_email !== undefined ? deped_email : depedEmail !== undefined ? depedEmail : current.deped_email || '').trim();
    const finalEmail = (isRegularPermanent && rawEmail === 'N/A') ? '' : rawEmail;
    const finalNoEmail = isRegularPermanent
      ? false
      : ((no_deped_email !== undefined ? (no_deped_email === true || no_deped_email === 'true') : noDepedEmail !== undefined ? (noDepedEmail === true || noDepedEmail === 'true') : !!current.no_deped_email) || finalEmail === 'N/A');
    const finalAllowEmailDiscrepancy = allow_email_discrepancy !== undefined 
      ? (allow_email_discrepancy === true || allow_email_discrepancy === 'true') 
      : allowEmailDiscrepancy !== undefined 
      ? (allowEmailDiscrepancy === true || allowEmailDiscrepancy === 'true') 
      : !!current.allow_email_discrepancy;
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
        no_deped_email = $21,
        allow_email_discrepancy = $22,
        is_school_head = $23,
        raw_payload = $24::jsonb,
        updated_at = NOW()
      WHERE id = $25
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
      finalNoEmail,
      finalAllowEmailDiscrepancy,
      isTargetHead,
      JSON.stringify(req.body),
      current.id
    ];

    const profileRes = await client.query(updateProfileQuery, profileValues);
    const updatedProfile = profileRes.rows[0];

    let empPos = (position || 'TEACHER I').toUpperCase();
    const isCook = empPos === 'COOK';
    const catObj = determinePositionCategory(empPos);
    const empCat = isCook ? 'NON-TEACHING' : (position_category || positionCategory || catObj.category || 'TEACHING').toUpperCase();
    const empStep = sanitizeStepIncrement(step_increment || stepIncrement);
    let empFund = (fund_source || fundSource || (isCook ? 'SBFP' : 'NATIONAL')).toUpperCase();
    if (!isCook && empFund === 'SBFP') {
      empFund = 'NATIONAL';
    }
    const empAppt = (nature_of_appointment || natureOfAppointment || (isCook ? 'CONTRACTUAL' : 'REGULAR PERMANENT')).toUpperCase();
    const empHire = (hiring_arrangement || hiringArrangement || (isCook ? 'CONTRACTUAL' : 'REGULAR')).toUpperCase();
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
      coerceDateField(first_service_date || firstServiceDate, 'first_service_date'),
      coerceDateField(last_promotion_date || lastPromotionDate, 'last_promotion_date'),
      coerceDateField(new_station_date || newStationDate, 'new_station_date'),
      coerceDateField(last_lateral_movement_date || lastLateralMovementDate, 'last_lateral_movement_date'),
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
    let eduDegree = (college_degree || collegeDegree || '').toUpperCase() || null;
    let eduMaj = (major || '').toUpperCase();
    let eduMin = (minor || '').toUpperCase();

    const rawCollegeDegrees = req.body.college_degrees || req.body.collegeDegrees;
    let eduCollegeDegrees = [];
    if (Array.isArray(rawCollegeDegrees)) {
      eduCollegeDegrees = rawCollegeDegrees
        .filter(d => d && (d.collegeDegree || d.college_degree))
        .map(d => ({
          collegeDegree: (d.collegeDegree || d.college_degree || '').trim().toUpperCase(),
          major: (d.major || '').trim().toUpperCase(),
          minor: (d.minor || '').trim().toUpperCase()
        }));
    }
    if (eduCollegeDegrees.length > 0) {
      eduDegree = eduCollegeDegrees[0].collegeDegree || eduDegree;
      eduMaj = eduCollegeDegrees[0].major || eduMaj;
      eduMin = eduCollegeDegrees[0].minor || eduMin;
    } else if (eduDegree) {
      eduCollegeDegrees = [{
        collegeDegree: eduDegree,
        major: eduMaj || '',
        minor: eduMin || ''
      }];
    }

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
        college_degree, college_degrees, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
        college_degree = EXCLUDED.college_degree,
        college_degrees = EXCLUDED.college_degrees,
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
      JSON.stringify(eduCollegeDegrees),
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
      college_degrees: educRes.rows[0].college_degrees,
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
    res.status(err.status || 500).json({ error: err.message, ...(err.field ? { field: err.field } : {}) });
  } finally {
    client.release();
  }
});

// DELETE personnel profile (and cleanly cascade remove linked records + record deletion tombstone)
router.delete('/:id', async (req, res) => {
  const targetId = String(req.params.id || '').trim();
  const schoolId = getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id || req.body?.schoolId || req.body?.school_id || '';
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, '').trim();

  try {
    // A. Query existing details to construct persistent tombstone
    let existingRec = null;
    const profRes = await db.query(
      `SELECT * FROM esf7_personnel_profile WHERE id = $1 OR prn = $1`, [targetId]
    ).catch(() => ({ rows: [] }));

    if (profRes.rows.length > 0) {
      existingRec = profRes.rows[0];
    }

    const sid = String(existingRec?.school_id || cleanSchoolId || '').replace(/^SCH-/i, '').trim();
    let fName = existingRec?.first_name || req.body?.firstName || req.query?.firstName || '';
    let lName = existingRec?.last_name || req.body?.lastName || req.query?.lastName || '';
    let prn = existingRec?.prn || req.body?.prn || req.query?.prn || targetId;
    let empNo = existingRec?.employee_no || req.body?.employeeNo || req.query?.employeeNo || '';

    // If details not in esf7_personnel_profile, check master table for accurate names/PRN
    if ((!fName || !lName) && sid) {
      const isTest = db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(sid);
      const tbl = isTest ? 'esf7_database_dummy' : 'esf7_database';
      const mRes = await insightEdPool.query(
        `SELECT * FROM ${tbl} WHERE (school_id = $1 OR schoool_id = $1) AND (prn = $2 OR employee_no = $2)`,
        [sid, targetId]
      ).catch(() => ({ rows: [] }));

      if (mRes.rows.length > 0) {
        const mRow = mRes.rows[0];
        fName = mRow.first_name || mRow.first || fName;
        lName = mRow.last_name || mRow.last || lName;
        prn = mRow.prn || prn;
        empNo = mRow.employee_no || empNo;
      }
    }

    const isNonGenericVal = (val) => {
      if (!val || typeof val !== 'string') return false;
      const s = val.trim().toUpperCase();
      if (!s || s === 'N/A' || s === 'NA' || s === 'NONE' || s === 'NULL' || s === 'UNDEFINED' || s === '-' || s === 'TEACHER STAFF' || s === 'TEACHER' || s === 'STAFF') {
        return false;
      }
      return s.length >= 2;
    };

    const cleanFullName = `${String(fName || '').trim()} ${String(lName || '').trim()}`.trim().toUpperCase();
    const validTargetId = isNonGenericVal(targetId) ? targetId : null;
    const validPrn = isNonGenericVal(prn) ? prn : null;
    const validEmpNo = isNonGenericVal(empNo) ? empNo : null;
    const validName = isNonGenericVal(cleanFullName) && cleanFullName !== 'TEACHER STAFF' ? cleanFullName : null;

    // B. Record in esf7_deleted_personnel (only if at least one valid key exists)
    if (sid && (validTargetId || validPrn || validEmpNo || validName)) {
      const tombstoneId = `DEL-${sid}-${String(validPrn || validTargetId || Math.random().toString(36).substring(2, 9)).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      await db.query(`
        INSERT INTO esf7_deleted_personnel (id, school_id, personnel_id, prn, employee_no, first_name, last_name, full_name_clean, deleted_by, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHOOL_HEAD', NOW())
        ON CONFLICT (id) DO UPDATE SET
          personnel_id = EXCLUDED.personnel_id,
          prn = EXCLUDED.prn,
          employee_no = EXCLUDED.employee_no,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          full_name_clean = EXCLUDED.full_name_clean,
          deleted_at = NOW()
      `, [tombstoneId, sid, validTargetId, validPrn, validEmpNo, validName ? String(fName).toUpperCase() : null, validName ? String(lName).toUpperCase() : null, validName]).catch((e) => {
        console.warn('[Tombstone Record Notice]:', e.message);
      });

      // B2. Scrub deleted personnel from school_drafts for this school
      try {
        const dRes = await db.query(`SELECT payload, school_year FROM school_drafts WHERE school_id = $1`, [sid]);
        for (const row of dRes.rows) {
          let pld = row.payload;
          if (pld && typeof pld === 'object') {
            let changed = false;
            if (Array.isArray(pld.personnel)) {
              const beforeLen = pld.personnel.length;
              pld.personnel = pld.personnel.filter(p => {
                const pId = String(p.id || '').trim().toLowerCase();
                const pPrn = String(p.prn || '').trim().toLowerCase();
                const pEmp = String(p.employeeNo || p.employee_no || '').trim().toLowerCase();
                const pName = `${String(p.firstName || '').trim()} ${String(p.lastName || '').trim()}`.toLowerCase();
                const tId = validTargetId ? String(validTargetId).toLowerCase() : '';
                const tPrn = validPrn ? String(validPrn).toLowerCase() : '';
                const tEmp = validEmpNo ? String(validEmpNo).toLowerCase() : '';
                const tName = validName ? validName.toLowerCase() : '';
                return (!tId || (pId !== tId && pPrn !== tId)) && (!tPrn || pPrn !== tPrn) && (!tEmp || pEmp !== tEmp) && (!tName || pName !== tName);
              });
              if (pld.personnel.length !== beforeLen) changed = true;
            }
            if (Array.isArray(pld.classSections)) {
              pld.classSections = pld.classSections.map(sec => {
                if ((validTargetId && String(sec.advisorId) === String(validTargetId)) || (validPrn && String(sec.advisorId) === String(validPrn))) {
                  changed = true;
                  return { ...sec, advisorId: null };
                }
                return sec;
              });
            }
            const existingDel = Array.isArray(pld.deletedPersonnelIds) ? pld.deletedPersonnelIds : [];
            const newKeys = [validTargetId, validPrn, validEmpNo, validName ? validName.toLowerCase() : null].filter(Boolean);
            pld.deletedPersonnelIds = Array.from(new Set([...existingDel, ...newKeys]));
            changed = true;
            if (changed) {
              await db.query(
                `UPDATE school_drafts SET payload = $1, updated_at = NOW() WHERE school_id = $2 AND school_year = $3`,
                [JSON.stringify(pld), sid, row.school_year]
              );
            }
          }
        }
      } catch (e) {
        console.warn('[Draft scrub notice]:', e.message);
      }
    }

    // 1. Unassign advisor from any class sections
    await db.query(`UPDATE esf7_class_sections SET advisor_id = NULL WHERE advisor_id = $1`, [targetId]).catch(() => {});
    
    // 2. Clean up child records (workloads, designations, trainings, tasks, allowances)
    await db.query(`DELETE FROM esf7_workload_rows WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_personnel_trainings WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_personnel_designations WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_personnel_extra_tasks WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_personnel_allowances WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_overload_late_undertime WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});
    await db.query(`DELETE FROM esf7_overload_no_work WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`, [targetId]).catch(() => {});

    // 3. Remove from esf7_personnel_profile
    const delRes = await db.query(`DELETE FROM esf7_personnel_profile WHERE id = $1 OR prn = $1`, [targetId]);
    res.json({ success: true, count: delRes.rowCount, message: `Personnel profile ${targetId} and all linked records deleted successfully.` });
  } catch (err) {
    console.error('Error deleting personnel:', err);
    res.status(500).json({ error: err.message });
  }
});

router.parsePostGraduateDiscipline = parsePostGraduateDiscipline;
router.formatPersonnelRecord = formatPersonnelRecord;

router.fetchMasterPersonnelFromInsightEd = fetchMasterPersonnelFromInsightEd; // exposed for tests
module.exports = router;
