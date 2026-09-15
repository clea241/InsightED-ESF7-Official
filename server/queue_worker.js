const db = require('./db');
const redisQueue = require('./services/redisQueue');
const { 
  generateSchoolId,
  generatePersonnelId, 
  generateEmploymentId, 
  generateQualificationId, 
  generateTrainingId, 
  generateSectionId, 
  generateWorkloadId,
  generateTransferId,
  generateDesignationId
} = require('./db/idGenerator');

const parseDate = (d) => {
  if (!d) return null;
  const str = String(d).trim().toUpperCase();
  if (str === 'N/A' || str === 'NONE' || str === 'NULL' || str === 'UNDEFINED' || str === '') return null;
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString().split('T')[0];
};

const calculateAge = (p) => {
  if (p.age !== undefined && p.age !== null && !isNaN(parseInt(p.age, 10)) && parseInt(p.age, 10) > 0) {
    return parseInt(p.age, 10);
  }
  const bDateStr = p.birthdate || p.birth_date || p.dob;
  if (!bDateStr) return null;
  const birthDate = new Date(bDateStr);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 ? age : null;
};

const checkIsSchoolHead = (p) => {
  if (p.isSchoolHead === true || p.is_school_head === true || String(p.isSchoolHead).toLowerCase() === 'true' || String(p.is_school_head).toLowerCase() === 'true' || p.isSchoolHead === 1) {
    return true;
  }
  const pos = String(p.position || (p.employment && p.employment.position) || '').toUpperCase();
  const des = String(p.designation || (p.employment && p.employment.designation) || '').toUpperCase();
  return pos.includes('PRINCIPAL') || pos.includes('TEACHER-IN-CHARGE') || pos.includes('TIC') || pos.includes('OFFICER-IN-CHARGE') || pos.includes('OIC') ||
         des.includes('PRINCIPAL') || des.includes('TEACHER-IN-CHARGE') || des.includes('TIC') || des.includes('OFFICER-IN-CHARGE') || des.includes('OIC') ||
         des.includes('SCHOOL HEAD');
};

const sanitizeStepIncrement = (val) => {
  const num = parseInt(val, 10);
  if (isNaN(num) || num < 1 || num > 8) return 1;
  return num;
};

const sanitizePositionCategory = (posCat, position) => {
  const cat = String(posCat || '').toUpperCase().trim();
  if (cat.includes('NON')) return 'NON-TEACHING';
  if (cat.includes('RELATED') || cat.includes('TEACHING-RELATED')) return 'RELATED TEACHING';
  if (cat.includes('TEACHING')) return 'TEACHING';

  const pos = String(position || '').toUpperCase().trim();
  if (pos.includes('ADMINISTRATIVE') || pos.includes('ADAS') || pos.includes('ADA ') || pos.includes('UTILITY') || pos.includes('CLERK') || pos.includes('GUARD') || pos.includes('NURSE')) {
    return 'NON-TEACHING';
  }
  if (pos.includes('PRINCIPAL') || pos.includes('HEAD TEACHER') || pos.includes('SUPERVISOR') || pos.includes('GUIDANCE')) {
    return 'RELATED TEACHING';
  }
  return 'TEACHING';
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

/**
 * High-Performance Parameterized Multi-Row INSERT / UPSERT Builder
 * Batches hundreds of records into 1 single roundtrip query.
 */
function buildBatchInsert(tableName, columns, rows, conflictClause = '') {
  if (!rows || rows.length === 0) return null;
  const colNames = columns.join(', ');
  const values = [];
  const rowPlaceholders = [];
  let paramIdx = 1;

  for (const row of rows) {
    const placeholders = [];
    for (const col of columns) {
      placeholders.push(`$${paramIdx++}`);
      values.push(row[col] !== undefined ? row[col] : null);
    }
    rowPlaceholders.push(`(${placeholders.join(', ')})`);
  }

  const query = `
    INSERT INTO ${tableName} (${colNames})
    VALUES ${rowPlaceholders.join(',\n           ')}
    ${conflictClause}
  `;

  return { query, values };
}

let activeWorkersCount = 0;
const MAX_CONCURRENT_WORKERS = 5;
let isRedisWorkerActive = false;

async function processJobById(targetJobId, specificClient = null) {
  let client = specificClient;
  let shouldRelease = false;
  let jobId = targetJobId;

  try {
    if (!client) {
      client = await db.pool.connect();
      shouldRelease = true;
    }

    const jobRes = await client.query(
      `SELECT id, school_id, school_year, payload, signature, certified_by, status 
       FROM esf7_submission_queue 
       WHERE id = $1 
       FOR UPDATE`,
      [jobId]
    );

    if (jobRes.rows.length === 0) {
      if (shouldRelease && client) client.release();
      return false;
    }

    const job = jobRes.rows[0];
    if (job.status === 'completed') {
      if (shouldRelease && client) client.release();
      return true;
    }

    const cleanSchoolId = String(job.school_id).replace('SCH-', '').trim();
    const cleanSchoolYear = job.school_year || '2026-2027';
    const jobStartTime = Date.now();
    let currentStage = '[Step 1/8: Initializing Transaction]';

    console.log(`\n\x1b[36m⏳ [Queue Worker] Starting Ingestion Job #${jobId} ➔ School ${cleanSchoolId} (${cleanSchoolYear})...\x1b[0m`);

    // 2. Set job status to processing
    await client.query(
      `UPDATE esf7_submission_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    // Start atomic transaction
    await client.query('BEGIN');

    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {});
    const schoolInfo = payload.schoolInfo || {};

    // Step 1/8: Ingest esf7_school_profile (UPSERT matching uq_school_sy_profile constraint)
    currentStage = '[Step 1/8: School Profile]';
    const existingProfRes = await client.query(
      'SELECT id FROM esf7_school_profile WHERE school_id = $1 AND school_year = $2 LIMIT 1',
      [cleanSchoolId, cleanSchoolYear]
    );
    const schoolDbId = existingProfRes.rows.length > 0 
      ? existingProfRes.rows[0].id 
      : `SCH-PROFILE-${cleanSchoolId}`;

    const elemSpecialFlag = !!(
      schoolInfo.hasElemSpecialPrograms === true ||
      schoolInfo.has_elem_special_programs === true ||
      schoolInfo.elemSpecialProgram === true ||
      (Array.isArray(schoolInfo.specialPrograms) && schoolInfo.specialPrograms.some(p => String(p).toUpperCase().includes('SCIENCE') || String(p).toUpperCase().includes('SSES') || String(p).toUpperCase().includes('ELEMENTARY'))) ||
      (Array.isArray(schoolInfo.elemSpecialPrograms) && schoolInfo.elemSpecialPrograms.length > 0) ||
      (Array.isArray(schoolInfo.elem_special_programs) && schoolInfo.elem_special_programs.length > 0)
    );

    const elemSpecialProgs = (Array.isArray(schoolInfo.elemSpecialPrograms) && schoolInfo.elemSpecialPrograms.length > 0)
      ? schoolInfo.elemSpecialPrograms
      : (Array.isArray(schoolInfo.elem_special_programs) && schoolInfo.elem_special_programs.length > 0)
        ? schoolInfo.elem_special_programs
        : (Array.isArray(schoolInfo.specialPrograms) && schoolInfo.specialPrograms.some(p => String(p).toUpperCase().includes('SCIENCE') || String(p).toUpperCase().includes('SSES')))
          ? schoolInfo.specialPrograms.filter(p => String(p).toUpperCase().includes('SCIENCE') || String(p).toUpperCase().includes('SSES'))
          : (elemSpecialFlag ? ['SPECIAL SCIENCE ELEMENTARY SCHOOL'] : []);

    const jhsSpecialFlag = !!(
      schoolInfo.hasJhsSpecialPrograms === true ||
      schoolInfo.has_jhs_special_programs === true ||
      (Array.isArray(schoolInfo.jhsSpecialPrograms) && schoolInfo.jhsSpecialPrograms.length > 0) ||
      (Array.isArray(schoolInfo.jhs_special_programs) && schoolInfo.jhs_special_programs.length > 0) ||
      (Array.isArray(schoolInfo.specialPrograms) && schoolInfo.specialPrograms.some(p => !p.includes('ELEMENTARY') && !p.includes('SSES')))
    );

    const jhsSpecialProgs = (Array.isArray(schoolInfo.jhsSpecialPrograms) && schoolInfo.jhsSpecialPrograms.length > 0)
      ? schoolInfo.jhsSpecialPrograms
      : (Array.isArray(schoolInfo.jhs_special_programs) && schoolInfo.jhs_special_programs.length > 0)
        ? schoolInfo.jhs_special_programs
        : (Array.isArray(schoolInfo.specialPrograms) ? schoolInfo.specialPrograms.filter(p => !p.includes('ELEMENTARY') && !p.includes('SSES')) : []);

    const elemInc = !!(
      schoolInfo.hasElemInclusive === true ||
      schoolInfo.has_elem_inclusive === true ||
      (Array.isArray(schoolInfo.elemInclusivePrograms) && schoolInfo.elemInclusivePrograms.length > 0) ||
      (Array.isArray(schoolInfo.elem_inclusive_programs) && schoolInfo.elem_inclusive_programs.length > 0) ||
      (Array.isArray(schoolInfo.inclusivePrograms) && schoolInfo.inclusivePrograms.some(p => String(p).endsWith('-ES')))
    );

    const elemIncProgs = (Array.isArray(schoolInfo.elemInclusivePrograms) && schoolInfo.elemInclusivePrograms.length > 0)
      ? schoolInfo.elemInclusivePrograms
      : (Array.isArray(schoolInfo.elem_inclusive_programs) && schoolInfo.elem_inclusive_programs.length > 0)
        ? schoolInfo.elem_inclusive_programs
        : (Array.isArray(schoolInfo.inclusivePrograms) ? schoolInfo.inclusivePrograms.filter(p => String(p).endsWith('-ES')) : []);

    const jhsInc = !!(
      schoolInfo.hasJhsInclusive === true ||
      schoolInfo.has_jhs_inclusive === true ||
      (Array.isArray(schoolInfo.jhsInclusivePrograms) && schoolInfo.jhsInclusivePrograms.length > 0) ||
      (Array.isArray(schoolInfo.jhs_inclusive_programs) && schoolInfo.jhs_inclusive_programs.length > 0) ||
      (Array.isArray(schoolInfo.inclusivePrograms) && schoolInfo.inclusivePrograms.some(p => String(p).endsWith('-JHS')))
    );

    const jhsIncProgs = (Array.isArray(schoolInfo.jhsInclusivePrograms) && schoolInfo.jhsInclusivePrograms.length > 0)
      ? schoolInfo.jhsInclusivePrograms
      : (Array.isArray(schoolInfo.jhs_inclusive_programs) && schoolInfo.jhs_inclusive_programs.length > 0)
        ? schoolInfo.jhs_inclusive_programs
        : (Array.isArray(schoolInfo.inclusivePrograms) ? schoolInfo.inclusivePrograms.filter(p => String(p).endsWith('-JHS')) : []);

    const shsInc = !!(
      schoolInfo.hasShsInclusive === true ||
      schoolInfo.has_shs_inclusive === true ||
      (Array.isArray(schoolInfo.shsInclusivePrograms) && schoolInfo.shsInclusivePrograms.length > 0) ||
      (Array.isArray(schoolInfo.shs_inclusive_programs) && schoolInfo.shs_inclusive_programs.length > 0) ||
      (Array.isArray(schoolInfo.inclusivePrograms) && schoolInfo.inclusivePrograms.some(p => String(p).endsWith('-SHS')))
    );

    const shsIncProgs = (Array.isArray(schoolInfo.shsInclusivePrograms) && schoolInfo.shsInclusivePrograms.length > 0)
      ? schoolInfo.shsInclusivePrograms
      : (Array.isArray(schoolInfo.shs_inclusive_programs) && schoolInfo.shs_inclusive_programs.length > 0)
        ? schoolInfo.shs_inclusive_programs
        : (Array.isArray(schoolInfo.inclusivePrograms) ? schoolInfo.inclusivePrograms.filter(p => String(p).endsWith('-SHS')) : []);

    const incProgs = schoolInfo.inclusivePrograms || schoolInfo.inclusive_programs || [
      ...(elemInc ? elemIncProgs : []),
      ...(jhsInc ? jhsIncProgs : []),
      ...(shsInc ? shsIncProgs : [])
    ];
    const hasAls = incProgs.some(p => String(p).toUpperCase().includes('ALS'));
    const hasSned = incProgs.some(p => String(p).toUpperCase().includes('SNED') || String(p).toUpperCase().includes('SPED'));
    const hasIped = incProgs.some(p => String(p).toUpperCase().includes('IPED') || String(p).toUpperCase().startsWith('IP-'));
    const hasMadrasah = incProgs.some(p => String(p).toUpperCase().includes('MADRASAH') || String(p).toUpperCase().includes('MEP') || String(p).toUpperCase().includes('ALIVE'));

    await client.query(
      `INSERT INTO esf7_school_profile (
         id, school_id, school_year,
         has_elem_special_programs, elem_special_programs,
         has_jhs_special_programs, jhs_special_programs,
         shs_curriculum_model,
         has_elem_inclusive, elem_inclusive_programs,
         has_jhs_inclusive, jhs_inclusive_programs,
         has_shs_inclusive, shs_inclusive_programs,
         has_als, has_sned, has_iped, has_madrasah,
         inclusive_programs, raw_payload, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
       ON CONFLICT (school_id, school_year) DO UPDATE SET
         has_elem_special_programs = EXCLUDED.has_elem_special_programs,
         elem_special_programs = EXCLUDED.elem_special_programs,
         has_jhs_special_programs = EXCLUDED.has_jhs_special_programs,
         jhs_special_programs = EXCLUDED.jhs_special_programs,
         shs_curriculum_model = EXCLUDED.shs_curriculum_model,
         has_elem_inclusive = EXCLUDED.has_elem_inclusive,
         elem_inclusive_programs = EXCLUDED.elem_inclusive_programs,
         has_jhs_inclusive = EXCLUDED.has_jhs_inclusive,
         jhs_inclusive_programs = EXCLUDED.jhs_inclusive_programs,
         has_shs_inclusive = EXCLUDED.has_shs_inclusive,
         shs_inclusive_programs = EXCLUDED.shs_inclusive_programs,
         has_als = EXCLUDED.has_als,
         has_sned = EXCLUDED.has_sned,
         has_iped = EXCLUDED.has_iped,
         has_madrasah = EXCLUDED.has_madrasah,
         inclusive_programs = EXCLUDED.inclusive_programs,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = NOW()`,
      [
        schoolDbId,
        cleanSchoolId,
        cleanSchoolYear,
        elemSpecialFlag,
        JSON.stringify(elemSpecialProgs),
        jhsSpecialFlag,
        JSON.stringify(jhsSpecialProgs),
        schoolInfo.shsCurriculumModel || schoolInfo.shs_curriculum_model || 'Model A',
        elemInc,
        JSON.stringify(elemIncProgs),
        jhsInc,
        JSON.stringify(jhsIncProgs),
        shsInc,
        JSON.stringify(shsIncProgs),
        hasAls,
        hasSned,
        hasIped,
        hasMadrasah,
        JSON.stringify(incProgs),
        JSON.stringify(schoolInfo)
      ]
    );

    // Step 2 & 3: Batch Prepare Personnel Master & Child Tables
    currentStage = '[Step 2/8: Personnel Master Profiles & PRNs]';
    const personnelList = payload.personnel || [];
    console.log(`  \x1b[90m├─\x1b[0m \x1b[33m${currentStage}\x1b[0m Batch ingesting ${personnelList.length} teacher records...`);

    const profileBatch = [];
    const empBatch = [];
    const educBatch = [];
    const laBatch = [];
    const ldBatch = [];
    const dsgBatch = [];
    const relatedBatch = [];
    const adminBatch = [];
    const processedPersonnelIds = [];

    for (let i = 0; i < personnelList.length; i++) {
      const p = personnelList[i];
      if (!p || typeof p !== 'object') continue;

      const pId = p.id || p.personnel_id || `PER-${cleanSchoolId}-${String(i + 1).padStart(3, '0')}`;
      const prn = String(p.prn || p.employee_no || pId).trim();
      const isShared = !!p.isShared;
      processedPersonnelIds.push(pId);

      if (isShared) {
        // Shared teacher
        profileBatch.push({
          id: pId,
          prn: prn,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          type: p.type || 'teaching',
          salutation: p.salutation || 'MR.',
          first_name: p.firstName || p.first_name || 'TEACHER',
          middle_name: p.middleName || p.middle_name || '',
          last_name: p.lastName || p.last_name || 'STAFF',
          name_extension: p.nameExtension || p.name_extension || '',
          tin: null,
          no_tin: false,
          sex_at_birth: p.sexAtBirth || p.sex_at_birth || 'FEMALE',
          civil_status: p.civilStatus || p.civil_status || 'SINGLE',
          solo_parent: false,
          religion: 'CHRISTIANITY',
          ethnic_group: null,
          birthdate: null,
          age: null,
          philsys_no: null,
          no_philsys: false,
          employee_no: null,
          deped_email: null,
          is_school_head: false,
          raw_payload: JSON.stringify(p)
        });
      } else {
        const posCat = sanitizePositionCategory(p.positionCategory || p.position_category, p.position);
        const stepInc = sanitizeStepIncrement(p.stepIncrement || p.step_increment);
        const bDate = parseDate(p.birthdate || p.birth_date);
        const age = calculateAge(p);
        const isHead = checkIsSchoolHead(p);

        // 4A. Profile
        profileBatch.push({
          id: pId,
          prn: prn,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          type: p.type || 'teaching',
          salutation: p.salutation || 'MR.',
          first_name: p.firstName || p.first_name || 'TEACHER',
          middle_name: p.middleName || p.middle_name || '',
          last_name: p.lastName || p.last_name || 'STAFF',
          name_extension: p.nameExtension || p.name_extension || '',
          tin: p.tin || null,
          no_tin: p.noTin === true || p.no_tin === true,
          sex_at_birth: p.sexAtBirth || p.sex_at_birth || p.sex || 'FEMALE',
          civil_status: p.civilStatus || p.civil_status || 'SINGLE',
          solo_parent: p.soloParent === true || p.soloParent === 'YES' || p.solo_parent === true,
          religion: p.religion === 'OTHERS' ? null : (p.religion || 'CHRISTIANITY'),
          ethnic_group: (p.ethnicGroup === 'OTHERS' || p.ethnic_group === 'OTHERS') ? null : (p.ethnicGroup || p.ethnic_group || null),
          birthdate: bDate,
          age: age,
          philsys_no: p.philsysNo || p.philsys_no || null,
          no_philsys: p.noPhilsys === true || p.no_philsys === true,
          employee_no: p.employeeNo || p.employee_no || null,
          deped_email: p.depedEmail || p.deped_email || null,
          is_school_head: isHead,
          raw_payload: JSON.stringify(p.rawPayload || p)
        });

        // 4B. Employment
        const empId = p.employmentId || p.emp_id || generateEmploymentId();
        const empRawPayload = (p.employment_raw_payload && typeof p.employment_raw_payload === 'object' && Object.keys(p.employment_raw_payload).length > 0)
          ? p.employment_raw_payload
          : ((p.employment && typeof p.employment === 'object' && Object.keys(p.employment).length > 0)
            ? p.employment
            : {
                position: p.position || 'TEACHER I',
                positionCategory: posCat,
                stepIncrement: stepInc,
                fundSource: p.fundSource || p.fund_source || 'NATIONAL',
                natureOfAppointment: p.natureOfAppointment || p.nature_of_appointment || 'REGULAR PERMANENT',
                hiringArrangement: p.hiringArrangement || p.hiring_arrangement || 'REGULAR',
                deploymentStatus: p.deploymentStatus || p.deployment_status || 'OWN STATION',
                assignedSchools: p.assignedSchools || p.assigned_schools || [],
                gradeLevelsTaught: p.gradeLevelsTaught || p.grade_levels_taught || [],
                firstServiceDate: p.firstServiceDate || p.first_service_date || null,
                lastPromotionDate: p.lastPromotionDate || p.last_promotion_date || null,
                newStationDate: p.newStationDate || p.new_station_date || null,
                lastLateralMovementDate: p.lastLateralMovementDate || p.last_lateral_movement_date || null
              });

        empBatch.push({
          id: empId,
          personnel_id: pId,
          position_category: posCat,
          position: p.position || 'TEACHER I',
          step_increment: stepInc,
          fund_source: p.fundSource || p.fund_source || 'NATIONAL',
          nature_of_appointment: p.natureOfAppointment || p.nature_of_appointment || 'REGULAR PERMANENT',
          hiring_arrangement: p.hiringArrangement || p.hiring_arrangement || 'REGULAR',
          deployment_status: p.deploymentStatus || p.deployment_status || 'OWN STATION',
          assigned_schools: JSON.stringify(p.assignedSchools || p.assigned_schools || []),
          grade_levels_taught: JSON.stringify(p.gradeLevelsTaught || p.grade_levels_taught || []),
          first_service_date: parseDate(p.firstServiceDate || p.first_service_date),
          last_promotion_date: parseDate(p.lastPromotionDate || p.last_promotion_date),
          new_station_date: parseDate(p.newStationDate || p.new_station_date),
          last_lateral_movement_date: parseDate(p.lastLateralMovementDate || p.last_lateral_movement_date),
          raw_payload: JSON.stringify(empRawPayload)
        });

        // 4C. Education
        const educId = p.educationId || p.educ_id || generateQualificationId();
        const highestAttainment = p.highestEducationalAttainment || p.highest_educational_attainment || (p.collegeDegree || p.college_degree ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'COLLEGE GRADUATE / BACCALAUREATE');
        const shsTrack = p.shsTrack || p.shs_track || null;
        const vocCourse = p.vocationalCourse || p.vocational_course || null;
        const vocLevel = p.vocationalLevel || p.vocational_level || null;

        const parsedPostDisc = parsePostGraduateDiscipline(
          p.postGraduateDiscipline || p.post_graduate_discipline,
          p,
          p,
          highestAttainment
        );
        const postDiscVal = parsedPostDisc.jsonString;

        const educRawPayload = (p.educ_raw_payload && typeof p.educ_raw_payload === 'object' && Object.keys(p.educ_raw_payload).length > 0)
          ? p.educ_raw_payload
          : ((p.education && typeof p.education === 'object' && Object.keys(p.education).length > 0)
            ? p.education
            : {
                highestEducationalAttainment: highestAttainment,
                collegeDegree: p.collegeDegree || p.college_degree || null,
                major: p.major || null,
                minor: p.minor || null,
                degreeRows: p.degreeRows || [],
                postGraduateDegree: p.postGraduateDegree || p.post_graduate_degree || 'N/A',
                postGraduateDiscipline: postDiscVal,
                mastersDisciplines: parsedPostDisc.masters,
                doctorateDisciplines: parsedPostDisc.doctorate,
                mastersDiscipline: parsedPostDisc.mastersDiscipline,
                doctorateDiscipline: parsedPostDisc.doctorateDiscipline,
                eligibility: Array.isArray(p.eligibility) ? p.eligibility : [p.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS'],
                prcSpecialization: p.prcSpecialization || p.prc_specialization || null,
                prcLicenseNo: p.prcLicenseNo || p.prc_license_no || null,
                prcExpiryDate: p.prcExpiryDate || p.prc_expiry_date || null,
                shsTrack,
                vocationalCourse: vocCourse,
                vocationalLevel: vocLevel
              });

        educBatch.push({
          id: educId,
          personnel_id: pId,
          highest_educational_attainment: highestAttainment,
          shs_track: shsTrack,
          vocational_course: vocCourse,
          vocational_level: vocLevel,
          college_degree: p.collegeDegree || p.college_degree || null,
          major: p.major || null,
          minor: p.minor || null,
          post_graduate_degree: p.postGraduateDegree || p.post_graduate_degree || 'N/A',
          post_graduate_discipline: postDiscVal,
          eligibility: JSON.stringify(Array.isArray(p.eligibility) ? p.eligibility : [p.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS']),
          prc_specialization: p.prcSpecialization || p.prc_specialization || null,
          raw_payload: JSON.stringify(educRawPayload)
        });

        // 4D. Learning Areas Matrix
        const laId = p.learningAreaId || p.la_id || generateQualificationId().replace('QLF', 'LA');
        const laMatrix = p.learningAreaMap || p.matrix_data || {};
        const laRawPayload = p.la_raw_payload || { matrix_data: laMatrix };

        laBatch.push({
          id: laId,
          personnel_id: pId,
          matrix_data: JSON.stringify(laMatrix),
          raw_payload: JSON.stringify(laRawPayload)
        });

        // 4E. L&D Trainings
        const trainings = [
          ...(p.neapTrainingRows || []).map(t => ({ ...t, type: 'NEAP' })),
          ...(p.certificationRows || []).map(t => ({ ...t, type: 'TESDA' })),
          ...(p.otherTrainingRows || []).map(t => ({ ...t, type: 'OTHER' }))
        ];

        for (const tr of trainings) {
          if (!tr || !tr.title) continue;
          const trId = (tr.id && tr.id.length <= 40) ? tr.id : generateTrainingId();
          ldBatch.push({
            id: trId,
            personnel_id: pId,
            training_type: tr.type || 'OTHER',
            title: tr.title || 'Training',
            conductor: tr.conductor || 'N/A',
            start_date: parseDate(tr.startDate || tr.start_date),
            end_date: parseDate(tr.endDate || tr.end_date),
            days: parseInt(tr.days || 1, 10) || 1,
            total_hours: parseFloat(tr.totalHours || tr.total_hours || 0) || 0,
            raw_payload: JSON.stringify(tr)
          });
        }

        // 4F. Designations
        const rawDesigList = [];
        if (p.designation && typeof p.designation === 'string' && p.designation.trim()) {
          rawDesigList.push(p.designation.trim());
        }
        if (Array.isArray(p.designations)) {
          p.designations.forEach(d => {
            if (d) rawDesigList.push(d);
          });
        }

        const processedKeys = new Set();
        let dsgCounter = 1;

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
          const seq = String(dsgCounter++).padStart(3, '0');
          const dsgId = `DSG-${cleanSchoolId}-${pId.split('-').pop()}-${seq}`;

          dsgBatch.push({
            id: dsgId,
            personnel_id: pId,
            designation_name: dsgObj.designationName,
            grade_level: dsgObj.gradeLevel || null,
            subject_area: dsgObj.subjectArea || null,
            track: dsgObj.track || null,
            is_sds_approved: !!dsgObj.isSdsApproved,
            sds_confirmed: !!dsgObj.sdsConfirmed,
            serialized_key: dsgObj.serializedKey || dsgObj.designationName,
            raw_payload: JSON.stringify(dsgObj.rawPayload || dsgObj)
          });
        }

        // 4G. Ingest Teaching-Related Tasks (esf7_related_task)
        const trList = p.teachingRelatedRows || p.teaching_related_rows || [];
        let trCounter = 1;
        for (const tr of trList) {
          if (!tr || (!tr.task && !tr.task_name && !tr.designationName)) continue;
          const trId = `TRT-${cleanSchoolId}-${pId.split('-').pop()}-${String(trCounter++).padStart(3, '0')}`;
          const tName = tr.task || tr.task_name || tr.designationName || 'Teaching-Related Task';
          const freq = String(tr.cadence || tr.frequency || 'weekly').toLowerCase();
          
          let durMins = 60;
          if (tr.duration_minutes !== undefined && tr.duration_minutes !== null) {
            durMins = parseInt(tr.duration_minutes, 10) || 60;
          } else if (tr.durationMinutes !== undefined && tr.durationMinutes !== null) {
            durMins = parseInt(tr.durationMinutes, 10) || 60;
          } else if (tr.hours !== undefined && tr.hours !== null) {
            durMins = Math.round(parseFloat(tr.hours) * 60) || 60;
          }

          const durHours = durMins / 60;
          let t1Hrs = 0;
          if (freq === 'daily') {
            t1Hrs = parseFloat((durHours * 60).toFixed(2));
          } else if (freq === 'monthly') {
            t1Hrs = parseFloat((durHours * 3).toFixed(2));
          } else {
            t1Hrs = parseFloat((durHours * 12).toFixed(2));
          }

          const isDesig = !!(tr.isDesignationSynced || tr.is_designation_synced || tr.isLocked || tr.isSdsApproved);

          relatedBatch.push({
            id: trId,
            personnel_id: pId,
            school_id: cleanSchoolId,
            school_year: cleanSchoolYear,
            task_name: tName,
            frequency: freq,
            duration_minutes: durMins,
            term1_hours: t1Hrs,
            is_designation_synced: isDesig,
            raw_payload: JSON.stringify(tr)
          });
        }

        // 4H. Ingest Administrative Tasks (esf7_admin_task)
        const admList = p.administrativeRows || p.administrative_rows || [];
        let admCounter = 1;
        for (const adm of admList) {
          if (!adm || (!adm.task && !adm.task_name && !adm.name)) continue;
          const admId = `ADM-${cleanSchoolId}-${pId.split('-').pop()}-${String(admCounter++).padStart(3, '0')}`;
          const tName = adm.task || adm.task_name || adm.name || 'Administrative Task';
          const datesArr = Array.isArray(adm.dates) ? adm.dates : (adm.taskDate ? [adm.taskDate] : (adm.date ? [adm.date] : []));
          
          let durMins = 60;
          if (adm.duration_minutes !== undefined && adm.duration_minutes !== null) {
            durMins = parseInt(adm.duration_minutes, 10) || 60;
          } else if (adm.durationMinutes !== undefined && adm.durationMinutes !== null) {
            durMins = parseInt(adm.durationMinutes, 10) || 60;
          } else if (adm.minutes !== undefined && adm.minutes !== null) {
            durMins = parseInt(adm.minutes, 10) || 60;
          } else if (adm.hours !== undefined && adm.hours !== null) {
            durMins = Math.round(parseFloat(adm.hours) * 60) || 60;
          } else if (adm.startTime && adm.endTime) {
            const [sh, sm] = adm.startTime.split(':').map(Number);
            const [eh, em] = adm.endTime.split(':').map(Number);
            if (!isNaN(sh) && !isNaN(eh)) {
              durMins = Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
            }
          }

          adminBatch.push({
            id: admId,
            personnel_id: pId,
            school_id: cleanSchoolId,
            school_year: cleanSchoolYear,
            task_name: tName,
            dates: JSON.stringify(datesArr),
            duration_minutes: durMins,
            raw_payload: JSON.stringify(adm)
          });
        }
      }
    }

    // Step 3/8: Execute Parameterized Multi-Row Inserts for Personnel Master & Children
    currentStage = '[Step 3/8: Batch Ingesting Personnel & Sub-records]';

    if (profileBatch.length > 0) {
      const bProf = buildBatchInsert('esf7_personnel_profile', Object.keys(profileBatch[0]), profileBatch, `
        ON CONFLICT (id) DO UPDATE SET
          prn = EXCLUDED.prn,
          school_id = EXCLUDED.school_id,
          school_year = EXCLUDED.school_year,
          type = EXCLUDED.type,
          salutation = EXCLUDED.salutation,
          first_name = EXCLUDED.first_name,
          middle_name = EXCLUDED.middle_name,
          last_name = EXCLUDED.last_name,
          name_extension = EXCLUDED.name_extension,
          tin = EXCLUDED.tin,
          no_tin = EXCLUDED.no_tin,
          sex_at_birth = EXCLUDED.sex_at_birth,
          civil_status = EXCLUDED.civil_status,
          solo_parent = EXCLUDED.solo_parent,
          religion = EXCLUDED.religion,
          ethnic_group = EXCLUDED.ethnic_group,
          birthdate = EXCLUDED.birthdate,
          age = EXCLUDED.age,
          philsys_no = EXCLUDED.philsys_no,
          no_philsys = EXCLUDED.no_philsys,
          employee_no = EXCLUDED.employee_no,
          deped_email = EXCLUDED.deped_email,
          is_school_head = EXCLUDED.is_school_head,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `);
      if (bProf) await client.query(bProf.query, bProf.values);
    }

    if (empBatch.length > 0) {
      const bEmp = buildBatchInsert('esf7_personnel_employment', Object.keys(empBatch[0]), empBatch, `
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
      `);
      if (bEmp) await client.query(bEmp.query, bEmp.values);
    }

    if (educBatch.length > 0) {
      const bEduc = buildBatchInsert('esf7_perssonel_educ', Object.keys(educBatch[0]), educBatch, `
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
      `);
      if (bEduc) await client.query(bEduc.query, bEduc.values);
    }

    if (laBatch.length > 0) {
      const bLa = buildBatchInsert('esf7_personnel_learning_areas', Object.keys(laBatch[0]), laBatch, `
        ON CONFLICT (personnel_id) DO UPDATE SET
          matrix_data = EXCLUDED.matrix_data,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `);
      if (bLa) await client.query(bLa.query, bLa.values);
    }

    // Clean and batch insert child records for processed personnel IDs
    if (processedPersonnelIds.length > 0) {
      await client.query('DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (ldBatch.length > 0) {
        const bLd = buildBatchInsert('esf7_personnel_ld_trainings', Object.keys(ldBatch[0]), ldBatch);
        if (bLd) await client.query(bLd.query, bLd.values);
      }

      await client.query('DELETE FROM esf7_personnel_designations WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (dsgBatch.length > 0) {
        const bDsg = buildBatchInsert('esf7_personnel_designations', Object.keys(dsgBatch[0]), dsgBatch);
        if (bDsg) await client.query(bDsg.query, bDsg.values);
      }

      await client.query('DELETE FROM esf7_related_task WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (relatedBatch.length > 0) {
        const bRel = buildBatchInsert('esf7_related_task', Object.keys(relatedBatch[0]), relatedBatch);
        if (bRel) await client.query(bRel.query, bRel.values);
      }

      await client.query('DELETE FROM esf7_admin_task WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (adminBatch.length > 0) {
        const bAdm = buildBatchInsert('esf7_admin_task', Object.keys(adminBatch[0]), adminBatch);
        if (bAdm) await client.query(bAdm.query, bAdm.values);
      }
    }

    // Step 4/8: Ingest Class Sections (Regular, ARAL, Remedial/Enrichment)
    currentStage = '[Step 4/8: Organized Sections]';
    const sectionsList = payload.classSections || [];
    console.log(`  \x1b[90m├─\x1b[0m \x1b[33m${currentStage}\x1b[0m Batch ingesting ${sectionsList.length} organized sections...`);

    await client.query('DELETE FROM esf7_regular_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_aral_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_remedial_enrichment_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);

    const regSecBatch = [];
    const aralSecBatch = [];
    const remSecBatch = [];

    for (const s of sectionsList) {
      if (!s) continue;
      const secId = s.id && !String(s.id).startsWith('sec-draft-') ? s.id : generateSectionId();
      const gl = s.gradeLevel || s.grade_level || 'Grade 7';
      const sn = s.sectionName || s.section_name || 'Section 1';
      const st = s.sectionType || s.section_type || 'MONO GRADE';
      const advId = s.advisorId || s.adviserId || s.adviser_id || null;
      const totalL = parseInt(s.numberOfLearners || s.number_of_learners || s.total_learners || 0, 10) || 0;
      const maleL = parseInt(s.maleLearners || s.male_learners || 0, 10) || 0;
      const femaleL = parseInt(s.femaleLearners || s.female_learners || 0, 10) || 0;

      const sizeStat = s.sizeStatus || s.size_status || ((() => {
        if (!totalL || totalL === 0) return 'UNSET';
        const g = String(gl).toUpperCase().trim();
        const t = String(st).toUpperCase().trim();
        if (t.includes('MULTI') || g.includes('MULTI') || g.includes('MG')) return totalL <= 25 ? 'WITHIN STANDARD' : 'ABOVE STANDARD';
        if (g.includes('SNED') || g.includes('SPED')) return totalL < 5 ? 'BELOW STANDARD' : (totalL <= 15 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        if (g.includes('ALS')) return totalL < 15 ? 'BELOW STANDARD' : (totalL <= 50 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        if (g.includes('KINDER')) return totalL < 25 ? 'BELOW STANDARD' : (totalL <= 30 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        if (['GRADE 1', 'GRADE 2', 'GRADE 3', '1', '2', '3', 'G1', 'G2', 'G3'].some(k => g === k || g.includes(k))) return totalL < 30 ? 'BELOW STANDARD' : (totalL <= 35 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        if (g === 'GRADE 4' || g === '4' || g === 'G4' || g.includes('GRADE 4')) return totalL < 40 ? 'BELOW STANDARD' : (totalL <= 45 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        if (['GRADE 5', 'GRADE 6', 'GRADE 7', 'GRADE 8', 'GRADE 9', 'GRADE 10', '5', '6', '7', '8', '9', '10', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'JHS'].some(k => g === k || g.includes(k))) return totalL < 40 ? 'BELOW STANDARD' : (totalL <= 45 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        if (['GRADE 11', 'GRADE 12', '11', '12', 'G11', 'G12', 'SHS'].some(k => g === k || g.includes(k))) return totalL < 30 ? 'BELOW STANDARD' : (totalL <= 40 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
        return totalL < 40 ? 'BELOW STANDARD' : (totalL <= 45 ? 'WITHIN STANDARD' : 'ABOVE STANDARD');
      })());

      if (st === 'ARAL') {
        aralSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          basis_type: s.basisType || 'grade',
          grade_level: gl,
          section_name: sn,
          tutor_id: advId,
          male_learners: maleL,
          female_learners: femaleL,
          total_learners: totalL,
          raw_payload: JSON.stringify(s)
        });
      } else if (st === 'REMEDIAL' || st === 'ENRICHMENT') {
        remSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          intervention_type: st,
          grade_level: gl,
          section_name: sn,
          assigned_teacher_id: advId,
          male_learners: maleL,
          female_learners: femaleL,
          total_learners: totalL,
          raw_payload: JSON.stringify(s)
        });
      } else {
        regSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          grade_level: gl,
          section_name: sn,
          section_type: st,
          adviser_id: advId,
          male_learners: maleL,
          female_learners: femaleL,
          number_of_learners: totalL,
          size_status: sizeStat,
          raw_payload: JSON.stringify(s)
        });
      }
    }

    if (regSecBatch.length > 0) {
      const bReg = buildBatchInsert('esf7_regular_sections', Object.keys(regSecBatch[0]), regSecBatch, `
        ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
          section_type = EXCLUDED.section_type,
          adviser_id = EXCLUDED.adviser_id,
          male_learners = EXCLUDED.male_learners,
          female_learners = EXCLUDED.female_learners,
          number_of_learners = EXCLUDED.number_of_learners,
          size_status = EXCLUDED.size_status,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `);
      if (bReg) await client.query(bReg.query, bReg.values);
    }

    if (aralSecBatch.length > 0) {
      const bAral = buildBatchInsert('esf7_aral_sections', Object.keys(aralSecBatch[0]), aralSecBatch);
      if (bAral) await client.query(bAral.query, bAral.values);
    }

    if (remSecBatch.length > 0) {
      const bRem = buildBatchInsert('esf7_remedial_enrichment_sections', Object.keys(remSecBatch[0]), remSecBatch);
      if (bRem) await client.query(bRem.query, bRem.values);
    }

    // Step 5/8: Ingest Workload Rows for this School
    currentStage = '[Step 5/8: Elementary & JHS Workload Timetables]';
    console.log(`  \x1b[90m├─\x1b[0m \x1b[33m${currentStage}\x1b[0m Batch ingesting timetable schedules...`);
    await client.query('DELETE FROM esf7_workload_rows WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);

    const workloadBatch = [];
    for (const p of personnelList) {
      if (!p) continue;
      const pId = p.id || p.personnel_id;
      if (!pId) continue;

      for (let sIdx = 0; sIdx < (p.workloadRows || []).length; sIdx++) {
        const wk = p.workloadRows[sIdx];
        if (!wk || !wk.subject) continue;

        const wkId = (wk.id && !String(wk.id).startsWith('wk-local-') && !String(wk.id).startsWith('client-') && wk.id.length <= 40) ? wk.id : generateWorkloadId();
        const daysArr = Array.isArray(wk.days) ? wk.days : ['M', 'T', 'W', 'TH', 'F'];

        workloadBatch.push({
          id: wkId,
          personnel_id: pId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          grade_level: wk.gradeLevel || wk.grade_level || 'Grade 7',
          section_name: wk.sectionName || wk.section_name || 'Section 1',
          subject: wk.subject || wk.subjectName || 'Subject',
          start_time: wk.startTime || wk.start_time || '08:00',
          end_time: wk.endTime || wk.end_time || '09:00',
          days: JSON.stringify(daysArr),
          raw_payload: JSON.stringify(wk)
        });
      }
    }

    if (workloadBatch.length > 0) {
      const bWk = buildBatchInsert('esf7_workload_rows', Object.keys(workloadBatch[0]), workloadBatch);
      if (bWk) await client.query(bWk.query, bWk.values);
    }

    // Step 6/8: Ingest Allowances
    currentStage = '[Step 6/8: Personnel Allowances]';
    const allowancesMap = payload.allowancesMap || {};
    const allowancesBatch = [];
    const seenAllowancePersonnel = new Set();

    await client.query(
      'DELETE FROM esf7_personnel_allowances WHERE (school_id = $1 OR school_id = $2) AND (school_year = $3 OR school_year = $4)',
      [cleanSchoolId, `SCH-${cleanSchoolId.replace('SCH-', '')}`, cleanSchoolYear, cleanSchoolYear.replace('SY ', '20').replace('-', '-20')]
    );

    // 1. Ingest allowances for all submitted personnel
    for (let i = 0; i < personnelList.length; i++) {
      const p = personnelList[i];
      if (!p || typeof p !== 'object') continue;
      const pId = p.id || p.personnel_id || `PER-${cleanSchoolId}-${String(i + 1).padStart(3, '0')}`;
      if (seenAllowancePersonnel.has(pId)) continue;
      seenAllowancePersonnel.add(pId);

      const allowObj = allowancesMap[pId] || allowancesMap[p.id] || allowancesMap[p.employeeNo] || allowancesMap[p.employee_no] || allowancesMap[p.prn] || p.allowances || p.allowance || {};

      const hasPera = allowObj.pera !== undefined ? Boolean(allowObj.pera) : (allowObj.hasPera !== undefined ? Boolean(allowObj.hasPera) : (allowObj.has_pera !== undefined ? Boolean(allowObj.has_pera) : false));
      const hasUniform = allowObj.uniform !== undefined ? Boolean(allowObj.uniform) : (allowObj.hasUniform !== undefined ? Boolean(allowObj.hasUniform) : (allowObj.has_uniform !== undefined ? Boolean(allowObj.has_uniform) : false));
      const hasSupplies = allowObj.supplies !== undefined ? Boolean(allowObj.supplies) : (allowObj.hasSupplies !== undefined ? Boolean(allowObj.hasSupplies) : (allowObj.has_supplies !== undefined ? Boolean(allowObj.has_supplies) : false));
      const hasMedical = allowObj.medical !== undefined ? Boolean(allowObj.medical) : (allowObj.hasMedical !== undefined ? Boolean(allowObj.hasMedical) : (allowObj.has_medical !== undefined ? Boolean(allowObj.has_medical) : false));
      const hasHardship = allowObj.hardship !== undefined ? Boolean(allowObj.hardship) : (allowObj.hasHardship !== undefined ? Boolean(allowObj.hasHardship) : (allowObj.has_hardship !== undefined ? Boolean(allowObj.has_hardship) : false));

      const allowId = `ALW-${cleanSchoolId.replace('SCH-', '')}-${pId.split('-').pop()}`;

      allowancesBatch.push({
        id: allowId,
        personnel_id: pId,
        school_id: cleanSchoolId,
        school_year: cleanSchoolYear,
        has_pera: hasPera,
        pera_amount: null,
        has_uniform: hasUniform,
        uniform_amount: null,
        has_supplies: hasSupplies,
        supplies_amount: null,
        has_medical: hasMedical,
        medical_amount: null,
        has_hardship: hasHardship,
        hardship_amount: null,
        raw_payload: JSON.stringify(allowObj)
      });
    }

    // 2. Ingest any remaining allowances entries not present in personnelList
    for (const [pId, allowObj] of Object.entries(allowancesMap)) {
      if (seenAllowancePersonnel.has(pId) || !allowObj || typeof allowObj !== 'object') continue;
      seenAllowancePersonnel.add(pId);

      const hasPera = allowObj.pera !== undefined ? Boolean(allowObj.pera) : (allowObj.hasPera !== undefined ? Boolean(allowObj.hasPera) : (allowObj.has_pera !== undefined ? Boolean(allowObj.has_pera) : false));
      const hasUniform = allowObj.uniform !== undefined ? Boolean(allowObj.uniform) : (allowObj.hasUniform !== undefined ? Boolean(allowObj.hasUniform) : (allowObj.has_uniform !== undefined ? Boolean(allowObj.has_uniform) : false));
      const hasSupplies = allowObj.supplies !== undefined ? Boolean(allowObj.supplies) : (allowObj.hasSupplies !== undefined ? Boolean(allowObj.hasSupplies) : (allowObj.has_supplies !== undefined ? Boolean(allowObj.has_supplies) : false));
      const hasMedical = allowObj.medical !== undefined ? Boolean(allowObj.medical) : (allowObj.hasMedical !== undefined ? Boolean(allowObj.hasMedical) : (allowObj.has_medical !== undefined ? Boolean(allowObj.has_medical) : false));
      const hasHardship = allowObj.hardship !== undefined ? Boolean(allowObj.hardship) : (allowObj.hasHardship !== undefined ? Boolean(allowObj.hasHardship) : (allowObj.has_hardship !== undefined ? Boolean(allowObj.has_hardship) : false));

      const allowId = `ALW-${cleanSchoolId.replace('SCH-', '')}-${pId.split('-').pop() || generateQualificationId().replace('QLF', 'ALW')}`;

      allowancesBatch.push({
        id: allowId,
        personnel_id: pId,
        school_id: cleanSchoolId,
        school_year: cleanSchoolYear,
        has_pera: hasPera,
        pera_amount: null,
        has_uniform: hasUniform,
        uniform_amount: null,
        has_supplies: hasSupplies,
        supplies_amount: null,
        has_medical: hasMedical,
        medical_amount: null,
        has_hardship: hasHardship,
        hardship_amount: null,
        raw_payload: JSON.stringify(allowObj)
      });
    }

    if (allowancesBatch.length > 0) {
      const bAlw = buildBatchInsert('esf7_personnel_allowances', Object.keys(allowancesBatch[0]), allowancesBatch, `
        ON CONFLICT (personnel_id, school_year) DO UPDATE SET
          has_pera = EXCLUDED.has_pera,
          pera_amount = EXCLUDED.pera_amount,
          has_uniform = EXCLUDED.has_uniform,
          uniform_amount = EXCLUDED.uniform_amount,
          has_supplies = EXCLUDED.has_supplies,
          supplies_amount = EXCLUDED.supplies_amount,
          has_medical = EXCLUDED.has_medical,
          medical_amount = EXCLUDED.medical_amount,
          has_hardship = EXCLUDED.has_hardship,
          hardship_amount = EXCLUDED.hardship_amount,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `);
      if (bAlw) await client.query(bAlw.query, bAlw.values);
    }

    // Step 7/8: Ingest Workload Transfers (if present)
    currentStage = '[Step 7/8: Workload Transfers & Overload Logs]';
    const transfersList = payload.workloadTransfers || [];
    const transferBatch = [];

    await client.query('DELETE FROM esf7_workload_transfer WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    for (const tfr of transfersList) {
      if (!tfr) continue;
      const tfrId = tfr.id && !String(tfr.id).startsWith('local-tfr-') ? tfr.id : generateTransferId();
      const absentId = tfr.absentPersonnelId || tfr.absent_personnel_id || tfr.absentTeacherId || tfr.absent_teacher_id;
      const relievingId = tfr.relievingPersonnelId || tfr.relieving_personnel_id || tfr.substituteTeacherId || tfr.substitute_personnel_id;
      if (!absentId || !relievingId) continue;

      transferBatch.push({
        id: tfrId,
        school_id: cleanSchoolId,
        school_year: cleanSchoolYear,
        absent_personnel_id: absentId,
        relieving_personnel_id: relievingId,
        absence_id: tfr.absenceId || tfr.absence_id || null,
        workload_id: tfr.workloadId || tfr.workload_id || 'WK-DEFAULT',
        workload_type: tfr.workloadType || tfr.workload_type || 'ELEM_JHS',
        subject: tfr.subject || 'N/A',
        start_date: parseDate(tfr.startDate || tfr.start_date) || new Date().toISOString().split('T')[0],
        end_date: parseDate(tfr.endDate || tfr.end_date) || new Date().toISOString().split('T')[0],
        relieving_hours: parseFloat(tfr.relievingHours || tfr.relieving_hours || 1.0) || 1.0,
        raw_payload: JSON.stringify(tfr)
      });
    }

    if (transferBatch.length > 0) {
      const bTfr = buildBatchInsert('esf7_workload_transfer', Object.keys(transferBatch[0]), transferBatch);
      if (bTfr) await client.query(bTfr.query, bTfr.values);
    }

    // Step 8/8: COMMIT transaction & Mark Complete
    currentStage = '[Step 8/8: Transaction Finalization]';
    await client.query('COMMIT');

    await client.query(
      `UPDATE esf7_submission_queue SET status = 'completed', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    const totalDuration = Date.now() - jobStartTime;
    console.log(`  \x1b[32m✔ [Queue Worker] Job #${jobId} (School ${cleanSchoolId}) COMPLETED in ${totalDuration}ms\x1b[0m\n`);
    if (shouldRelease && client) client.release();
    return true;

  } catch (error) {
    const duration = Date.now() - (jobStartTime || Date.now());
    if (jobId) {
      console.error(`  \x1b[31m✖ [Queue Worker] Job #${jobId} FAILED at ${currentStage} after ${duration}ms:\x1b[0m ${error.message}\n`);
    } else {
      console.warn(`[Queue Worker] Database query/connection notice:`, error.message);
    }
    
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rErr) {
        // Ignore rollback errors if client is disconnected
      }
      try {
        if (jobId) {
          await client.query(
            `UPDATE esf7_submission_queue SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
            [`${currentStage}: ${error.message}`, jobId]
          );
        }
      } catch (uErr) {
        // Ignore update error on broken connection
      }
      if (shouldRelease) {
        try {
          client.release(true);
        } catch (relErr) {
          // Ignore release error
        }
      }
    }
    return false;
  }
}

async function processNextJob() {
  if (activeWorkersCount >= MAX_CONCURRENT_WORKERS) return false;
  activeWorkersCount++;

  let client = null;
  try {
    client = await db.pool.connect();
    
    // Auto-recover jobs stuck in 'processing' for > 60 seconds
    await client.query(`
      UPDATE esf7_submission_queue
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '1 minute'
    `).catch(() => {});

    // Fetch next pending job with row lock skipping already locked rows
    const jobRes = await client.query(`
      SELECT id 
      FROM esf7_submission_queue 
      WHERE status = 'pending' 
      ORDER BY id ASC 
      LIMIT 1 
      FOR UPDATE SKIP LOCKED
    `);

    if (jobRes.rows.length === 0) {
      client.release();
      activeWorkersCount--;
      return false;
    }

    const nextId = jobRes.rows[0].id;
    const result = await processJobById(nextId, client);
    client.release();
    activeWorkersCount--;

    // Check if there are more pending jobs immediately
    setImmediate(() => {
      processNextJob().catch(() => {});
    });

    return result;
  } catch (err) {
    if (client) {
      try { client.release(true); } catch (e) {}
    }
    activeWorkersCount--;
    return false;
  }
}

async function startRedisStreamWorker(consumerName = `worker-${process.pid || '1'}`) {
  if (isRedisWorkerActive) return;
  isRedisWorkerActive = true;

  console.log(`🌊 [Redis Queue Worker] Started Redis Stream consumer loop (${consumerName})...`);

  let lastClaimCheck = 0;

  while (isRedisWorkerActive) {
    try {
      const now = Date.now();
      // Check for stalled jobs every 30 seconds
      if (now - lastClaimCheck > 30000) {
        lastClaimCheck = now;
        const stalledJobs = await redisQueue.claimStalledJobs({ consumerName, minIdleTimeMs: 60000 });
        for (const sJob of stalledJobs) {
          console.log(`🔄 [Redis Queue Worker] Auto-claimed stalled job ${sJob.jobId} (Message: ${sJob.messageId})`);
          const success = await processJobById(sJob.jobId);
          if (success) {
            await redisQueue.ackJob(sJob.messageId);
          }
        }
      }

      // Read next incoming event from stream (blocking up to 2000ms)
      const event = await redisQueue.readNextStreamJob({ consumerName, blockMs: 2000 });
      if (event && event.jobId) {
        console.log(`📥 [Redis Queue Worker] Received job ${event.jobId} from stream (School: ${event.schoolId})`);
        const success = await processJobById(event.jobId);
        if (success) {
          await redisQueue.ackJob(event.messageId);
        }
      }
    } catch (err) {
      console.warn('[Redis Queue Worker Loop Notice]:', err.message);
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

let workerInterval = null;

async function startWorker(intervalMs = 2000) {
  if (workerInterval || isRedisWorkerActive) return;

  console.log('[Queue Worker] Initializing submissions queue high-performance processor...');

  // 1. Attempt Redis Stream Consumer setup
  const hasRedis = await redisQueue.initRedisStream();

  if (hasRedis) {
    console.log('🚀 [Queue Worker] Redis Streams connected! Running in Event-Driven Consumer Mode.');
    startRedisStreamWorker().catch(err => {
      console.error('[Redis Worker Fatal]:', err);
    });

    // Low-frequency safety poll
    workerInterval = setInterval(async () => {
      try {
        await processNextJob();
      } catch (err) {}
    }, 10000);
  } else {
    console.log('ℹ️ [Queue Worker] Operating in High-Throughput PostgreSQL (FOR UPDATE SKIP LOCKED) mode.');
    workerInterval = setInterval(async () => {
      try {
        await processNextJob();
      } catch (err) {
        console.error('[Queue Worker] Unexpected error in worker loop:', err.message);
      }
    }, intervalMs);
  }
}

function stopWorker() {
  isRedisWorkerActive = false;
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  console.log('[Queue Worker] Stopped background processor.');
}

module.exports = {
  processJobById,
  processNextJob,
  startRedisStreamWorker,
  startWorker,
  stopWorker
};
