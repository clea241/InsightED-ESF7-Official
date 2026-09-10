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
  generateTransferId
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

let isProcessing = false;
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

    console.log(`[Queue Worker] Processing job ${jobId} for School ${cleanSchoolId} (SY ${cleanSchoolYear})...`);

    // 2. Set job status to processing
    await client.query(
      `UPDATE esf7_submission_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    // Start atomic transaction
    await client.query('BEGIN');

    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    const schoolInfo = payload.schoolInfo || {};

    // 3. Ingest esf7_school_profile (UPSERT matching uq_school_sy_profile constraint)
    const existingProfRes = await client.query(
      'SELECT id FROM esf7_school_profile WHERE school_id = $1 AND school_year = $2 LIMIT 1',
      [cleanSchoolId, cleanSchoolYear]
    );
    const schoolDbId = existingProfRes.rows.length > 0 
      ? existingProfRes.rows[0].id 
      : `SCH-PROFILE-${cleanSchoolId}`;

    await client.query(
      `INSERT INTO esf7_school_profile (
         id, school_id, school_year, has_elem_special_programs, has_jhs_special_programs, 
         jhs_special_programs, shs_curriculum_model, raw_payload, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (school_id, school_year) DO UPDATE SET
         has_elem_special_programs = EXCLUDED.has_elem_special_programs,
         has_jhs_special_programs = EXCLUDED.has_jhs_special_programs,
         jhs_special_programs = EXCLUDED.jhs_special_programs,
         shs_curriculum_model = EXCLUDED.shs_curriculum_model,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = NOW()`,
      [
        schoolDbId,
        cleanSchoolId,
        cleanSchoolYear,
        !!(schoolInfo.hasElemSpecialPrograms || schoolInfo.has_elem_special_programs),
        !!(schoolInfo.hasJhsSpecialPrograms || schoolInfo.has_jhs_special_programs),
        JSON.stringify(schoolInfo.jhsSpecialPrograms || schoolInfo.jhs_special_programs || []),
        schoolInfo.shsCurriculumModel || schoolInfo.shs_curriculum_model || 'Model A',
        JSON.stringify(schoolInfo)
      ]
    );

    // 4. Ingest Personnel & Child Tables FIRST (so parent IDs exist for section adviser foreign keys)
    const personnelList = payload.personnel || [];

    for (let i = 0; i < personnelList.length; i++) {
      const p = personnelList[i];
      if (!p || typeof p !== 'object') continue;

      const pId = p.id || p.personnel_id || `PER-${cleanSchoolId}-${String(i + 1).padStart(3, '0')}`;
      const prn = String(p.prn || p.employee_no || pId).trim();
      const isShared = !!p.isShared;

      if (isShared) {
        // Shared / Borrowed / Clustered teacher from Mother School:
        // Ensure parent row exists without overwriting Mother School's master details!
        await client.query(
          `INSERT INTO esf7_personnel_profile (
             id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
             raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            pId,
            prn,
            cleanSchoolId,
            cleanSchoolYear,
            p.type || 'teaching',
            p.salutation || 'MR.',
            p.firstName || p.first_name || 'TEACHER',
            p.middleName || p.middle_name || '',
            p.lastName || p.last_name || 'STAFF',
            p.nameExtension || p.name_extension || '',
            JSON.stringify(p)
          ]
        );
      } else {
        // Full Mother School Teacher Profile:
        const posCat = sanitizePositionCategory(p.positionCategory || p.position_category, p.position);
        const stepInc = sanitizeStepIncrement(p.stepIncrement || p.step_increment);
        const bDate = parseDate(p.birthdate || p.birth_date);
        const age = calculateAge(p);
        const isHead = checkIsSchoolHead(p);

        // 4A. Insert/Update esf7_personnel_profile
        await client.query(
          `INSERT INTO esf7_personnel_profile (
             id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
             tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
             philsys_no, no_philsys, employee_no, deped_email, is_school_head, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW(), NOW())
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
             updated_at = NOW()`,
          [
            pId,
            prn,
            cleanSchoolId,
            cleanSchoolYear,
            p.type || 'teaching',
            p.salutation || 'MR.',
            p.firstName || p.first_name || 'TEACHER',
            p.middleName || p.middle_name || '',
            p.lastName || p.last_name || 'STAFF',
            p.nameExtension || p.name_extension || '',
            p.tin || null,
            p.noTin === true || p.no_tin === true,
            p.sexAtBirth || p.sex_at_birth || p.sex || 'FEMALE',
            p.civilStatus || p.civil_status || 'SINGLE',
            p.soloParent === true || p.soloParent === 'YES' || p.solo_parent === true,
            p.religion === 'OTHERS' ? null : (p.religion || 'CHRISTIANITY'),
            (p.ethnicGroup === 'OTHERS' || p.ethnic_group === 'OTHERS') ? null : (p.ethnicGroup || p.ethnic_group || null),
            bDate,
            age,
            p.philsysNo || p.philsys_no || null,
            p.noPhilsys === true || p.no_philsys === true,
            p.employeeNo || p.employee_no || null,
            p.depedEmail || p.deped_email || null,
            isHead,
            JSON.stringify(p.rawPayload || p)
          ]
        );

        // 4B. Insert/Update esf7_personnel_employment
        const empId = p.employmentId || p.emp_id || `EMP-${pId.replace('PER-', '')}`;
        await client.query(
          `INSERT INTO esf7_personnel_employment (
             id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment,
             hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught, first_service_date,
             last_promotion_date, new_station_date, last_lateral_movement_date, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
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
             updated_at = NOW()`,
          [
            empId,
            pId,
            posCat,
            p.position || 'TEACHER I',
            stepInc,
            p.fundSource || p.fund_source || 'NATIONAL',
            p.natureOfAppointment || p.nature_of_appointment || 'REGULAR PERMANENT',
            p.hiringArrangement || p.hiring_arrangement || 'REGULAR',
            p.deploymentStatus || p.deployment_status || 'OWN STATION',
            JSON.stringify(p.assignedSchools || p.assigned_schools || []),
            JSON.stringify(p.gradeLevelsTaught || p.grade_levels_taught || []),
            parseDate(p.firstServiceDate || p.first_service_date),
            parseDate(p.lastPromotionDate || p.last_promotion_date),
            parseDate(p.newStationDate || p.new_station_date),
            parseDate(p.lastLateralMovementDate || p.last_lateral_movement_date),
            JSON.stringify(p.employment_raw_payload || {})
          ]
        );

        // 4C. Insert/Update esf7_perssonel_educ
        const educId = p.educationId || p.educ_id || `EDU-${pId.replace('PER-', '')}`;
        const highestAttainment = p.highestEducationalAttainment || p.highest_educational_attainment || (p.collegeDegree || p.college_degree ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'COLLEGE GRADUATE / BACCALAUREATE');
        const shsTrack = p.shsTrack || p.shs_track || null;
        const vocCourse = p.vocationalCourse || p.vocational_course || null;
        const vocLevel = p.vocationalLevel || p.vocational_level || null;

        await client.query(
          `INSERT INTO esf7_perssonel_educ (
             id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
             college_degree, major, minor, post_graduate_degree, post_graduate_discipline,
             eligibility, prc_specialization, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
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
             updated_at = NOW()`,
          [
            educId,
            pId,
            highestAttainment,
            shsTrack,
            vocCourse,
            vocLevel,
            p.collegeDegree || p.college_degree || null,
            p.major || null,
            p.minor || null,
            p.postGraduateDegree || p.post_graduate_degree || 'N/A',
            p.postGraduateDiscipline || p.post_graduate_discipline || null,
            JSON.stringify(Array.isArray(p.eligibility) ? p.eligibility : [p.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS']),
            p.prcSpecialization || p.prc_specialization || null,
            JSON.stringify(p.educ_raw_payload || {})
          ]
        );

        // 4D. Insert/Update esf7_personnel_learning_areas
        const laId = p.learningAreaId || p.la_id || `LA-${pId.replace('PER-', '')}`;
        await client.query(
          `INSERT INTO esf7_personnel_learning_areas (
             id, personnel_id, matrix_data, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (personnel_id) DO UPDATE SET
             matrix_data = EXCLUDED.matrix_data,
             raw_payload = EXCLUDED.raw_payload,
             updated_at = NOW()`,
          [
            laId,
            pId,
            JSON.stringify(p.learningAreaMap || p.matrix_data || {}),
            JSON.stringify(p.la_raw_payload || {})
          ]
        );

        // 4E. Ingest L&D Trainings (NEAP, TESDA, Other)
        await client.query('DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = $1', [pId]);
        const trainings = [
          ...(p.neapTrainingRows || []).map(t => ({ ...t, type: 'NEAP' })),
          ...(p.certificationRows || []).map(t => ({ ...t, type: 'TESDA' })),
          ...(p.otherTrainingRows || []).map(t => ({ ...t, type: 'OTHER' }))
        ];

        for (const tr of trainings) {
          if (!tr || !tr.title) continue;
          const trId = tr.id || generateTrainingId();
          await client.query(
            `INSERT INTO esf7_personnel_ld_trainings (
               id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours, raw_payload, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
            [
              trId,
              pId,
              tr.type || 'OTHER',
              tr.title || 'Training',
              tr.conductor || 'N/A',
              parseDate(tr.startDate || tr.start_date),
              parseDate(tr.endDate || tr.end_date),
              parseInt(tr.days || 1, 10) || 1,
              parseFloat(tr.totalHours || tr.total_hours || 0) || 0,
              JSON.stringify(tr)
            ]
          );
        }

        // 4F. Ingest Designations
        await client.query('DELETE FROM esf7_personnel_designations WHERE personnel_id = $1', [pId]);
        for (const dsg of (p.designations || [])) {
          if (!dsg || !dsg.designationName) continue;
          const dsgId = dsg.id || `DSG-${pId}-${Date.now()}`;
          await client.query(
            `INSERT INTO esf7_personnel_designations (
               id, personnel_id, designation_name, grade_level, subject_area, track, is_sds_approved, sds_confirmed, serialized_key, raw_payload, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
            [
              dsgId,
              pId,
              dsg.designationName || dsg.designation_name || 'Designation',
              dsg.gradeLevel || dsg.grade_level || '',
              dsg.subjectArea || dsg.subject_area || '',
              dsg.track || '',
              !!dsg.isSdsApproved,
              !!dsg.sdsConfirmed,
              dsg.serializedKey || dsg.serialized_key || `${dsg.designationName}_${dsg.gradeLevel || ''}`,
              JSON.stringify(dsg)
            ]
          );
        }
      }
    }

    // 5. Ingest Class Sections (Regular, ARAL, Remedial/Enrichment)
    await client.query('DELETE FROM esf7_regular_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_aral_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_remedial_enrichment_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);

    for (const s of payload.classSections || []) {
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
        await client.query(
          `INSERT INTO esf7_aral_sections (
             id, school_id, school_year, basis_type, grade_level, section_name, tutor_id,
             male_learners, female_learners, total_learners, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [secId, cleanSchoolId, cleanSchoolYear, s.basisType || 'grade', gl, sn, advId, maleL, femaleL, totalL, JSON.stringify(s)]
        );
      } else if (st === 'REMEDIAL' || st === 'ENRICHMENT') {
        await client.query(
          `INSERT INTO esf7_remedial_enrichment_sections (
             id, school_id, school_year, intervention_type, grade_level, section_name, assigned_teacher_id,
             male_learners, female_learners, total_learners, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [secId, cleanSchoolId, cleanSchoolYear, st, gl, sn, advId, maleL, femaleL, totalL, JSON.stringify(s)]
        );
      } else {
        await client.query(
          `INSERT INTO esf7_regular_sections (
             id, school_id, school_year, grade_level, section_name, section_type, adviser_id,
             male_learners, female_learners, number_of_learners, size_status, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
           ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
             section_type = EXCLUDED.section_type,
             adviser_id = EXCLUDED.adviser_id,
             male_learners = EXCLUDED.male_learners,
             female_learners = EXCLUDED.female_learners,
             number_of_learners = EXCLUDED.number_of_learners,
             size_status = EXCLUDED.size_status,
             raw_payload = EXCLUDED.raw_payload,
             updated_at = NOW()`,
          [secId, cleanSchoolId, cleanSchoolYear, gl, sn, st, advId, maleL, femaleL, totalL, sizeStat, JSON.stringify(s)]
        );
      }
    }

    // 6. Ingest Workload Rows for this School
    await client.query('DELETE FROM esf7_workload_rows WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);

    for (const p of personnelList) {
      if (!p) continue;
      const pId = p.id || p.personnel_id;
      if (!pId) continue;

      for (let sIdx = 0; sIdx < (p.workloadRows || []).length; sIdx++) {
        const wk = p.workloadRows[sIdx];
        if (!wk || !wk.subject) continue;

        const wkId = wk.id && !String(wk.id).startsWith('wk-local-') ? wk.id : `wk-${pId}-${sIdx + 1}`;
        const daysArr = Array.isArray(wk.days) ? wk.days : ['M', 'T', 'W', 'TH', 'F'];

        await client.query(
          `INSERT INTO esf7_workload_rows (
             id, personnel_id, school_id, school_year, grade_level, section_name, subject,
             start_time, end_time, days, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [
            wkId,
            pId,
            cleanSchoolId,
            cleanSchoolYear,
            wk.gradeLevel || wk.grade_level || 'Grade 7',
            wk.sectionName || wk.section_name || 'Section 1',
            wk.subject || wk.subjectName || 'Subject',
            wk.startTime || wk.start_time || '08:00',
            wk.endTime || wk.end_time || '09:00',
            JSON.stringify(daysArr),
            JSON.stringify(wk)
          ]
        );
      }
    }

    // 7. Ingest Allowances (if present)
    await client.query('DELETE FROM esf7_personnel_allowances WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    const allowancesMap = payload.allowancesMap || {};
    for (const [pId, allowObj] of Object.entries(allowancesMap)) {
      if (allowObj && typeof allowObj === 'object') {
        const allowId = `alw-${pId}-${cleanSchoolId}`;
        await client.query(
          `INSERT INTO esf7_personnel_allowances (
             id, personnel_id, school_id, school_year, has_pera, pera_amount,
             has_uniform, uniform_amount, has_supplies, supplies_amount,
             has_medical, medical_amount, has_hardship, hardship_amount,
             raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
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
             updated_at = NOW()`,
          [
            allowId,
            pId,
            cleanSchoolId,
            cleanSchoolYear,
            allowObj.hasPera !== false && allowObj.has_pera !== false,
            parseFloat(allowObj.peraAmount || allowObj.pera_amount || 2000.00) || 2000.00,
            allowObj.hasUniform !== false && allowObj.has_uniform !== false,
            parseFloat(allowObj.uniformAmount || allowObj.uniform_amount || 7000.00) || 7000.00,
            allowObj.hasSupplies !== false && allowObj.has_supplies !== false,
            parseFloat(allowObj.suppliesAmount || allowObj.supplies_amount || 10000.00) || 10000.00,
            allowObj.hasMedical !== false && allowObj.has_medical !== false,
            parseFloat(allowObj.medicalAmount || allowObj.medical_amount || 7000.00) || 7000.00,
            !!(allowObj.hasHardship || allowObj.has_hardship),
            parseFloat(allowObj.hardshipAmount || allowObj.hardship_amount || 0.00) || 0.00,
            JSON.stringify(allowObj)
          ]
        );
      }
    }

    // 8. Ingest Workload Transfers (if present)
    await client.query('DELETE FROM esf7_workload_transfer WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    for (const tfr of (payload.workloadTransfers || [])) {
      if (!tfr) continue;
      const tfrId = tfr.id && !String(tfr.id).startsWith('local-tfr-') ? tfr.id : generateTransferId();
      const absentId = tfr.absentPersonnelId || tfr.absent_personnel_id || tfr.absentTeacherId || tfr.absent_teacher_id;
      const relievingId = tfr.relievingPersonnelId || tfr.relieving_personnel_id || tfr.substituteTeacherId || tfr.substitute_personnel_id;
      if (!absentId || !relievingId) continue;

      await client.query(
        `INSERT INTO esf7_workload_transfer (
           id, school_id, school_year, absent_personnel_id, relieving_personnel_id,
           absence_id, workload_id, workload_type, subject, start_date, end_date,
           relieving_hours, raw_payload, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [
          tfrId,
          cleanSchoolId,
          cleanSchoolYear,
          absentId,
          relievingId,
          tfr.absenceId || tfr.absence_id || null,
          tfr.workloadId || tfr.workload_id || 'WK-DEFAULT',
          tfr.workloadType || tfr.workload_type || 'ELEM_JHS',
          tfr.subject || 'N/A',
          parseDate(tfr.startDate || tfr.start_date) || new Date().toISOString().split('T')[0],
          parseDate(tfr.endDate || tfr.end_date) || new Date().toISOString().split('T')[0],
          parseFloat(tfr.relievingHours || tfr.relieving_hours || 1.0) || 1.0,
          JSON.stringify(tfr)
        ]
      );
    }

    // 9. COMMIT transaction
    await client.query('COMMIT');

    // 10. Mark submission job as completed
    await client.query(
      `UPDATE esf7_submission_queue SET status = 'completed', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    console.log(`[Queue Worker] Job ${jobId} for School ${cleanSchoolId} completed successfully!`);
    if (shouldRelease && client) client.release();
    return true;

  } catch (error) {
    if (jobId) {
      console.error(`[Queue Worker] Job ${jobId} failed:`, error.message);
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
            [error.message, jobId]
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
  if (isProcessing) return false;
  isProcessing = true;
  let client = null;

  try {
    client = await db.pool.connect();
    
    // 0. Auto-recover jobs stuck in 'processing' for > 2 minutes
    await client.query(`
      UPDATE esf7_submission_queue
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '2 minutes'
    `).catch(() => {});

    // 1. Fetch next pending job
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
      isProcessing = false;
      return false;
    }

    const nextId = jobRes.rows[0].id;
    const result = await processJobById(nextId, client);
    client.release();
    isProcessing = false;
    return result;
  } catch (err) {
    if (client) {
      try { client.release(true); } catch (e) {}
    }
    isProcessing = false;
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
        const stalledJobs = await redisQueue.claimStalledJobs({ consumerName, minIdleTimeMs: 120000 });
        for (const sJob of stalledJobs) {
          console.log(`🔄 [Redis Queue Worker] Auto-claimed stalled job ${sJob.jobId} (Message: ${sJob.messageId})`);
          const success = await processJobById(sJob.jobId);
          if (success) {
            await redisQueue.ackJob(sJob.messageId);
          }
        }
      }

      // Read next incoming event from stream (blocking up to 3000ms)
      const event = await redisQueue.readNextStreamJob({ consumerName, blockMs: 3000 });
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

async function startWorker(intervalMs = 3000) {
  if (workerInterval || isRedisWorkerActive) return;

  console.log('[Queue Worker] Initializing submissions queue background processor...');

  // 1. Attempt Redis Stream Consumer setup
  const hasRedis = await redisQueue.initRedisStream();

  if (hasRedis) {
    console.log('🚀 [Queue Worker] Redis Streams connected! Running in Event-Driven Consumer Mode.');
    // Start consumer loop in background
    startRedisStreamWorker().catch(err => {
      console.error('[Redis Worker Fatal]:', err);
    });

    // Also run a low-frequency DB sweep (every 15 seconds) as fallback safety net
    workerInterval = setInterval(async () => {
      try {
        await processNextJob();
      } catch (err) {}
    }, 15000);
  } else {
    console.log('ℹ️ [Queue Worker] Redis offline. Operating in PostgreSQL (SKIP LOCKED) fallback mode.');
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
