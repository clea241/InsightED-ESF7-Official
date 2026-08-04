const db = require('./db');
const { 
  generateSchoolId,
  generatePersonnelId, 
  generateEmploymentId, 
  generateQualificationId, 
  generateTrainingId, 
  generateSectionId, 
  generateWorkloadId,
  generateWorkloadDateId,
  generateTransferId
} = require('./db/idGenerator');

const parseDate = (d) => {
  if (!d) return null;
  const str = String(d).trim().toUpperCase();
  if (str === 'N/A' || str === 'NONE' || str === 'NULL' || str === 'UNDEFINED' || str === '') return null;
  return d;
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
  return age;
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

let isProcessing = false;

async function processNextJob() {
  if (isProcessing) {
    return false;
  }
  isProcessing = true;
  const client = await db.pool.connect();
  let jobId = null;
  try {
    // 0. Auto-recover jobs stuck in 'processing' for > 2 minutes
    await client.query(`
      UPDATE submission_queue
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '2 minutes'
    `);

    // 1. Fetch next pending job
    const jobRes = await client.query(`
      SELECT id, school_id, school_year, payload, signature, certified_by 
      FROM submission_queue 
      WHERE status = 'pending' 
      ORDER BY id ASC 
      LIMIT 1 
      FOR UPDATE SKIP LOCKED
    `);

    if (jobRes.rows.length === 0) {
      client.release();
      isProcessing = false;
      return false; // No pending jobs
    }

    const job = jobRes.rows[0];
    jobId = job.id;
    console.log(`[Queue Worker] Processing job ${jobId} for School ${job.school_id}...`);

    // 2. Set job status to processing
    await client.query(
      `UPDATE submission_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    // Start transaction
    await client.query('BEGIN');

    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

    // 3. Ensure school record exists & update certification details (UPSERT)
    const schoolInfo = payload.schoolInfo || {};
    const schoolDbId = generateSchoolId();
    await client.query(
      `INSERT INTO schools (
         id, school_id, school_year, school_name, region, division, district, 
         number_of_shifts, curricular_offering, certified_by, certified_signature, certified_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (school_id, school_year) DO UPDATE SET
         school_name = EXCLUDED.school_name,
         region = EXCLUDED.region,
         division = EXCLUDED.division,
         district = EXCLUDED.district,
         certified_by = EXCLUDED.certified_by,
         certified_signature = EXCLUDED.certified_signature,
         certified_at = NOW(),
         updated_at = NOW()`,
      [
        schoolDbId,
        job.school_id,
        job.school_year,
        schoolInfo.schoolName || schoolInfo.school_name || 'Sample School',
        schoolInfo.region || 'Region IV-A',
        schoolInfo.division || 'Sample Division',
        schoolInfo.district || 'Sample District',
        parseInt(schoolInfo.numberOfShifts || 1, 10) || 1,
        schoolInfo.curricularOffering || ['Elementary'],
        job.certified_by,
        job.signature
      ]
    );

    // 4. Clear old data
    await client.query('DELETE FROM shs_workload_transfers WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM shs_workload_rows WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM class_sections WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM workload_transfers WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM workload_rows WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM personnel WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);

    // 5. Insert Class Sections FIRST so section_ids exist for workload mapping
    const sectionIdMap = {};
    const sectionIdMapByGradeSec = {};

    for (const s of payload.classSections || []) {
      const gl = s.gradeLevel || s.grade_level || '';
      const sn = s.sectionName || s.section_name || '';
      const st = (() => {
        const type = s.sectionType || s.section_type || 'MONO GRADE';
        if (['MULTIGRADE', 'MONO GRADE', 'NON GRADED'].includes(type)) return type;
        return 'MONO GRADE';
      })();

      const newSecId = generateSectionId();
      const sRes = await client.query(
        `INSERT INTO class_sections (id, school_id, school_year, grade_level, section_name, adviser_id, section_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (school_id, school_year, grade_level, section_name)
         DO UPDATE SET section_type = EXCLUDED.section_type
         RETURNING id`,
        [newSecId, job.school_id, job.school_year, gl, sn, null, st]
      );

      const dbSecId = sRes.rows[0].id;
      if (s.id) sectionIdMap[s.id] = dbSecId;
      sectionIdMapByGradeSec[`${gl}_${sn}`] = dbSecId;
    }

    // 6. Insert Personnel & Sync Sequences
    const personnelIdMap = {};

    // Sequence health alignment safeguard
    try {
      await client.query(`
        DO $$ 
        DECLARE 
          seq_rec RECORD; 
        BEGIN 
          FOR seq_rec IN 
            SELECT sequence_name FROM information_schema.sequences WHERE sequence_name LIKE '%personnel%' 
          LOOP 
            EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(id::integer) FROM personnel WHERE id ~ ''^[0-9]+$''), 1), true)', seq_rec.sequence_name); 
          END LOOP; 
        END $$;
      `);
    } catch (sErr) {
      // Ignore sequence alignment errors on non-integer PK table schemas
    }

    for (const p of payload.personnel || []) {
      if (!p || typeof p !== 'object') continue;

      let targetPersonnelId;
      
      if (p.isShared) {
        targetPersonnelId = (typeof p.id === 'string' && p.id.trim().startsWith('PER-'))
          ? p.id.trim()
          : (typeof p.personnel_id === 'string' && p.personnel_id.trim().startsWith('PER-'))
          ? p.personnel_id.trim()
          : generatePersonnelId();
        if (p.id) personnelIdMap[p.id] = targetPersonnelId;
        personnelIdMap[targetPersonnelId] = targetPersonnelId;
      } else {
        const rawId = p.id || p.personnel_id;
        const personnelId = (typeof rawId === 'string' && rawId.trim().startsWith('PER-')) 
          ? rawId.trim() 
          : generatePersonnelId();

        const empId = (p.employment && typeof p.employment.id === 'string' && p.employment.id.trim().startsWith('EMP-'))
          ? p.employment.id.trim()
          : generateEmploymentId();

        const qualId = (p.qualifications && typeof p.qualifications.id === 'string' && p.qualifications.id.trim().startsWith('QLF-'))
          ? p.qualifications.id.trim()
          : generateQualificationId();

        const pRes = await client.query(
          `INSERT INTO personnel (
            id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension, 
            sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, philsys_no, tin, no_tin, 
            employee_no, deped_email, deployment_status, personal_verified, workload_verified, profiling_code,
            age, is_school_head
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
          RETURNING id`,
          [
            personnelId,
            (() => {
              const val = p.employeeReferenceId || p.prn;
              if (val && val !== 'null' && val !== 'undefined') return val;
              return Math.floor(100000000000 + Math.random() * 900000000000).toString();
            })(),
            job.school_id,
            job.school_year,
            p.type || 'teaching',
            p.salutation || 'MR.',
            p.firstName || 'N/A',
            p.middleName || null,
            p.lastName || 'N/A',
            p.nameExtension || null,
            p.sexAtBirth || null,
            p.civilStatus || null,
            p.soloParent === true || p.soloParent === 'Yes',
            p.religion || null,
            p.ethnicGroup || null,
            parseDate(p.birthdate),
            p.philsysNo || null,
            p.tin || null,
            p.noTin === true,
            p.employeeNo || null,
            p.depedEmail && p.depedEmail.includes('@deped.gov.ph')
              ? p.depedEmail
              : `auto_${personnelId}_${job.school_id}@deped.gov.ph`,
            p.deploymentStatus || 'Own Station',
            p.personalVerified === true,
            p.workloadVerified === true,
            p.profilingCode || 'AUTO',
            calculateAge(p),
            checkIsSchoolHead(p)
          ]
        );

        targetPersonnelId = pRes.rows[0].id;
        if (p.id) personnelIdMap[p.id] = targetPersonnelId;
        personnelIdMap[targetPersonnelId] = targetPersonnelId;

        // Employment
        await client.query(
          `INSERT INTO personnel_employment (
            id, personnel_id, position, designation, fund_source, nature_of_appointment, hiring_arrangement, 
            assigned_schools, grade_levels_taught, first_service_date, last_promotion_date, new_station_date, step_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            empId,
            targetPersonnelId,
            p.position || '',
            p.designation || null,
            p.fundSource || 'SEF',
            p.natureOfAppointment || 'Provincial',
            p.hiringArrangement || 'Permanent',
            p.assignedSchools || [],
            p.gradeLevelsTaught || [],
            parseDate(p.firstServiceDate) || '2000-01-01',
            parseDate(p.lastPromotionDate) || '2000-01-01',
            parseDate(p.newStationDate) || '2000-01-01',
            parseInt(p.stepIncrement || p.step_increment || p.step || 1, 10) || 1
          ]
        );

        // Qualifications
        await client.query(
          `INSERT INTO personnel_qualifications (
            id, personnel_id, college_degree, major, minor, post_graduate_degree, discipline, eligibility, 
            prc_specialization, prc_license_no, prc_expiry_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            qualId,
            targetPersonnelId,
            p.collegeDegree || '',
            p.major || '',
            p.minor || null,
            p.postGraduateDegree || 'N/A',
            p.discipline || null,
            p.eligibility || '',
            p.prcSpecialization || null,
            p.prcLicenseNo || null,
            parseDate(p.prcExpiryDate)
          ]
        );

        // Trainings
        const trainings = [
          ...(p.neapTrainingRows || []).map(t => ({ ...t, type: 'neap' })),
          ...(p.certificationRows || []).map(t => ({ ...t, type: 'certification' })),
          ...(p.otherTrainingRows || []).map(t => ({ ...t, type: 'other' }))
        ];
        for (const t of trainings) {
          const newTrnId = generateTrainingId();
          await client.query(
            `INSERT INTO personnel_trainings (
              id, personnel_id, training_type, title, conductor, start_date, end_date, days, hours_per_day, total_hours
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              newTrnId,
              targetPersonnelId,
              t.type,
              t.title || '',
              t.conductor || '',
              parseDate(t.startDate) || '2000-01-01',
              parseDate(t.endDate) || '2000-01-01',
              t.days || 1,
              t.hoursPerDay || 8,
              t.totalHours || 8
            ]
          );
        }
      }

      // Ensure ADVISORY workload (60 minutes every day: 07:30 to 08:30 M-F) for section advisers
      const pOrigId = p.id;
      const advisorySections = (payload.classSections || []).filter(s => 
        s.advisorId && (String(s.advisorId) === String(pOrigId) || String(s.advisorId) === String(targetPersonnelId))
      );

      let teacherWorkloadRows = [...(p.workloadRows || [])];
      
      for (const sec of advisorySections) {
        const secIdStr = String(sec.id);
        const hasAdv = teacherWorkloadRows.some(r => r.subject === 'ADVISORY' && (String(r.sectionId) === secIdStr || String(r.section_id) === secIdStr || !r.sectionId));
        if (!hasAdv) {
          teacherWorkloadRows.push({
            id: `adv-${secIdStr}-${Date.now()}`,
            sectionId: secIdStr,
            gradeLevel: sec.gradeLevel,
            subject: 'ADVISORY',
            startTime: null,
            endTime: null, // Flexible clock time (60 mins/day automatic)
            days: ['M', 'T', 'W', 'TH', 'F'] // Every workday
          });
        } else {
          teacherWorkloadRows = teacherWorkloadRows.map(r => {
            if (r.subject === 'ADVISORY' && (String(r.sectionId) === secIdStr || !r.sectionId)) {
              return {
                ...r,
                sectionId: secIdStr,
                gradeLevel: sec.gradeLevel || r.gradeLevel,
                days: (Array.isArray(r.days) && r.days.length > 0) ? r.days : ['M', 'T', 'W', 'TH', 'F']
              };
            }
            return r;
          });
        }
      }

      // Insert Teaching Workload Rows (including ADVISORY) into PostgreSQL workload_rows table
      for (const r of teacherWorkloadRows) {
        const secId = r.sectionId || r.section_id;
        const mappedSecId = (secId && sectionIdMap[secId])
          || (r.gradeLevel && r.sectionName && sectionIdMapByGradeSec[`${r.gradeLevel}_${r.sectionName}`])
          || null;

        const newWklId = generateWorkloadId();
        await client.query(
          `INSERT INTO workload_rows (
            id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            newWklId,
            targetPersonnelId,
            job.school_id,
            job.school_year,
            'teaching',
            r.subject || r.remediationSubject || null,
            r.gradeLevel || null,
            mappedSecId,
            r.startTime || '07:30',
            r.endTime || '08:30',
            r.days || ['M', 'T', 'W', 'TH', 'F']
          ]
        );
      }

      // Insert teaching-related workload rows
      for (const r of p.teachingRelatedRows || []) {
        const newWklId = generateWorkloadId();
        const wRes = await client.query(
          `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, task)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [newWklId, targetPersonnelId, job.school_id, job.school_year, 'teaching-related', r.task || null]
        );
        const newRowId = wRes.rows[0].id;

        for (const d of r.dates || []) {
          const newWkdId = generateWorkloadDateId();
          await client.query(
            `INSERT INTO workload_row_dates (id, workload_row_id, task_date, start_time, end_time)
             VALUES ($1, $2, $3, $4, $5)`,
            [newWkdId, newRowId, parseDate(d.date) || null, d.startTime || null, d.endTime || null]
          );
        }
      }

      // Insert administrative workload rows
      for (const r of p.administrativeRows || []) {
        const newWklId = generateWorkloadId();
        const wRes = await client.query(
          `INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, task)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [newWklId, targetPersonnelId, job.school_id, job.school_year, 'administrative', r.task || null]
        );
        const newRowId = wRes.rows[0].id;

        for (const d of r.dates || []) {
          const newWkdId = generateWorkloadDateId();
          await client.query(
            `INSERT INTO workload_row_dates (id, workload_row_id, task_date, start_time, end_time)
             VALUES ($1, $2, $3, $4, $5)`,
            [newWkdId, newRowId, parseDate(d.date) || null, d.startTime || null, d.endTime || null]
          );
        }
      }

      // Insert SHS Workload Rows (per term: '1st', '2nd', '3rd') into shs_workload_rows table
      const shsData = p.shsWorkloadRows || {};
      for (const term of ['1st', '2nd', '3rd']) {
        const termRows = shsData[term] || [];
        for (const r of termRows) {
          const secId = r.sectionId || r.section_id;
          const mappedSecId = (secId && sectionIdMap[secId])
            || (r.gradeLevel && r.sectionName && sectionIdMapByGradeSec[`${r.gradeLevel}_${r.sectionName}`])
            || null;

          const newWklId = generateWorkloadId();
          await client.query(
            `INSERT INTO shs_workload_rows (
              id, personnel_id, school_id, school_year, term, row_type, subject, shs_category, grade_level, section_id, start_time, end_time, days, designated_by_sds
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              newWklId,
              targetPersonnelId,
              job.school_id,
              job.school_year,
              term,
              r.rowType || 'teaching',
              r.subject || null,
              r.shsCategory || null,
              r.gradeLevel || null,
              mappedSecId,
              r.startTime || '07:30',
              r.endTime || '08:30',
              r.days || ['M', 'T', 'W', 'TH', 'F'],
              !!(r.designatedBySds || r.designated_by_sds)
            ]
          );
        }
      }
    }

    // 7. Update Class Sections Adviser IDs now that personnel are created
    for (const s of payload.classSections || []) {
      const advId = s.advisorId || s.adviser_id;
      const mappedAdviserId = advId ? personnelIdMap[advId] : null;
      if (mappedAdviserId && (s.id || (s.gradeLevel && s.sectionName))) {
        const dbSecId = sectionIdMap[s.id] || sectionIdMapByGradeSec[`${s.gradeLevel}_${s.sectionName}`];
        if (dbSecId) {
          await client.query(
            `UPDATE class_sections SET adviser_id = $1 WHERE id = $2`,
            [mappedAdviserId, dbSecId]
          );
        }
      }
    }

    // 8. Insert Workload Transfers
    for (const t of payload.workloadTransfers || []) {
      const newTrfId = generateTransferId();
      await client.query(
        `INSERT INTO workload_transfers (
          id, school_id, school_year, absent_personnel_id, substitute_personnel_id, workload_row_id, start_date, end_date, reason, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newTrfId,
          job.school_id,
          job.school_year,
          personnelIdMap[t.absentPersonnelId] || t.absentPersonnelId,
          personnelIdMap[t.substitutePersonnelId] || t.substitutePersonnelId,
          t.workloadRowId,
          parseDate(t.startDate) || '2000-01-01',
          parseDate(t.endDate) || '2000-01-01',
          t.reason || '',
          t.status || 'active'
        ]
      );
    }

    // 9. Insert Personnel Absences & Tardiness Logs
    for (const a of payload.absences || []) {
      const origPId = a.personnelId || a.personnel_id;
      const dbPersonnelId = personnelIdMap[origPId] || origPId;
      if (dbPersonnelId) {
        const absDate = parseDate(a.absenceDate || a.absence_date || a.startDate);
        if (absDate) {
          const targetP = (payload.personnel || []).find(p => String(p.id) === String(origPId));
          const firstName = a.firstName || a.first_name || targetP?.firstName || targetP?.first_name || null;
          const lastName = a.lastName || a.last_name || targetP?.lastName || targetP?.last_name || null;
          const prn = a.prn || targetP?.prn || null;
          const tin = a.tin || targetP?.tin || null;

          await client.query(
            `INSERT INTO personnel_absences (
              personnel_id, absence_date, leave_type, prn, first_name, last_name, tin
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              dbPersonnelId,
              absDate,
              a.leaveType || a.leave_type || 'Tardiness / Late',
              prn,
              firstName,
              lastName,
              tin
            ]
          );
        }
      }
    }

    // COMMIT transaction
    await client.query('COMMIT');

    // Mark submission job as completed
    await client.query(
      `UPDATE submission_queue SET status = 'completed', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    console.log(`[Queue Worker] Job ${jobId} completed successfully!`);
    client.release();
    isProcessing = false;
    return true;

  } catch (error) {
    console.error(`[Queue Worker] Job ${jobId} failed:`, error.message);
    console.error(error.stack);
    try {
      await client.query('ROLLBACK');
    } catch (rErr) {
      console.error('[Queue Worker] Rollback failed:', rErr.message);
    }
    if (jobId) {
      await client.query(
        `UPDATE submission_queue SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [error.message, jobId]
      );
    }
    client.release();
    isProcessing = false;
    return false;
  }
}

let workerInterval = null;

function startWorker(intervalMs = 3000) {
  if (workerInterval) return;
  console.log('[Queue Worker] Initializing submissions queue background processor...');
  workerInterval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (err) {
      console.error('[Queue Worker] Unexpected error in worker loop:', err.message);
    }
  }, intervalMs);
}

function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[Queue Worker] Stopped background processor.');
  }
}

module.exports = {
  processNextJob,
  startWorker,
  stopWorker
};
