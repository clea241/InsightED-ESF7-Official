const db = require('./db');
const redisQueue = require('./services/redisQueue');
const { claimJob, recoverStaleJobs, pickNextPendingJob } = require('./services/queueClaims');
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
  if (pos.includes('ADMINISTRATIVE') || pos.includes('ADAS') || pos.includes('ADA ') || pos.includes('UTILITY') || pos.includes('CLERK') || pos.includes('GUARD') || pos.includes('NURSE') || pos === 'COOK' || pos.includes('COOK')) {
    return 'NON-TEACHING';
  }
  if (pos.includes('PRINCIPAL') || pos.includes('HEAD TEACHER') || pos.includes('SUPERVISOR') || pos.includes('GUIDANCE')) {
    return 'RELATED TEACHING';
  }
  return 'TEACHING';
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

  const degreeRows = combinedSource.degreeRows || [];
  if (Array.isArray(degreeRows)) {
    for (const d of degreeRows) {
      const lvl = String(d.level || '').toUpperCase();
      const dList = extractList(d.postGraduateDiscipline || d.discipline || d.disciplines);
      if (lvl === 'MASTERS' && masters.length === 0) masters.push(...dList);
      if (lvl === 'DOCTORATE' && doctorate.length === 0) doctorate.push(...dList);
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

  if (upper.includes('KINDER') || upper === 'K') {
    return 'Kinder';
  }

  if (upper === 'SNED' || upper === 'SPED' || upper === 'NON-GRADED' || upper === 'NON GRADED' || upper.includes('SNED') || upper.includes('NON-GRADED') || upper.includes('NON GRADED')) {
    return 'SNED (NON-GRADED)';
  }
  if (upper === 'ALS' || upper.startsWith('ALS-') || upper.startsWith('ALS ')) return 'ALS';

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

/**
 * Paginated / Chunked Batch Insert Builder & Executor
 * Chunks rows into batches (e.g. 50 items) so parameter arrays and SQL strings
 * never exceed memory limits or PostgreSQL parameter caps ($65535).
 */
async function executeBatchInsertInChunks(client, tableName, columns, rows, conflictClause = '', chunkSize = 50) {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const batch = buildBatchInsert(tableName, columns, chunk, conflictClause);
    if (batch) {
      await client.query(batch.query, batch.values);
    }
  }
}

let activeWorkersCount = 0;
const MAX_CONCURRENT_WORKERS = 5;
let isRedisWorkerActive = false;
let currentProcessingJobId = null;

async function processJobById(targetJobId, specificClient = null) {
  let client = specificClient;
  let shouldRelease = false;
  let jobId = targetJobId;
  // Declared before the try block so the catch block below can always read them.
  let jobStartTime = Date.now();
  let currentStage = '[Loading job]';

  try {
    if (!client) {
      client = await db.pool.connect();
      shouldRelease = true;
    }

    let jobRes = await client.query(
      `SELECT id, school_id, school_year, payload, signature, certified_by, status 
       FROM esf7_submission_queue 
       WHERE id = $1 
       FOR UPDATE`,
      [jobId]
    );

    if (jobRes.rows.length === 0 && db.stagingPool && db.stagingPool !== db.pool) {
      if (shouldRelease && client) {
        try { client.release(); } catch (e) {}
      }
      client = await db.stagingPool.connect();
      shouldRelease = true;
      jobRes = await client.query(
        `SELECT id, school_id, school_year, payload, signature, certified_by, status 
         FROM esf7_submission_queue 
         WHERE id = $1 
         FOR UPDATE`,
        [jobId]
      );
    }

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
    const isTestAccount = db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(cleanSchoolId);
    jobStartTime = Date.now();
    currentProcessingJobId = jobId;
    currentStage = '[Step 1/8: Initializing Transaction]';

    console.log(`\n\x1b[36m⏳ [Queue Worker] Starting Ingestion Job #${jobId} ➔ School ${cleanSchoolId} (${cleanSchoolYear}) ${isTestAccount ? '[STAGING ROUTE]' : '[PROD ROUTE]'}...\x1b[0m`);

    // If division test account or dummy account, write to staging database
    if (isTestAccount && db.stagingPool) {
      const stagingClient = await db.stagingPool.connect();
      try {
        await client.query(`UPDATE esf7_submission_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`, [jobId]).catch(() => {});
        if (shouldRelease && client) {
          try { client.release(); } catch (e) {}
        }
        client = stagingClient; // Redirect ingestion client to staging
        shouldRelease = true;
      } catch (err) {
        stagingClient.release();
        throw err;
      }
    } else {
      // 2. Atomically claim the job: only one worker (stream delivery or PostgreSQL poll) can move it to 'processing'.
      // If another worker already claimed it, skip it; the stream entry stays unacknowledged until the job is completed.
      const claimed = await claimJob(client, jobId);
      if (!claimed) {
        console.log(`[Queue Worker] Job #${jobId} is already being processed by another worker; skipping duplicate delivery.`);
        if (shouldRelease && client) client.release();
        return false;
      }
    }


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
          no_deped_email: p.noDepedEmail === true || p.no_deped_email === true || String(p.depedEmail || p.deped_email || '').toUpperCase() === 'N/A',
          allow_email_discrepancy: p.allowEmailDiscrepancy === true || p.allow_email_discrepancy === true,
          is_school_head: isHead,
          raw_payload: JSON.stringify(p.rawPayload || p)
        });

        // 4B. Employment
        const empId = p.employmentId || p.emp_id || generateEmploymentId();
        const rawAssignedGrades = p.assignedGradeLevels || p.assigned_grade_levels || p.gradeLevelsTaught || p.grade_levels_taught || [];
        const sanitizedGrades = sanitizeGradeArray(rawAssignedGrades);
        const teachesShsFlag = !!(
          p.teachesShs || p.teaches_shs ||
          sanitizedGrades.some(g => String(g).includes('11') || String(g).includes('12'))
        );

        const isCook = String(p.position || '').trim().toUpperCase() === 'COOK';
        let cleanFundSource = p.fundSource || p.fund_source || (isCook ? 'SBFP' : 'NATIONAL');
        if (!isCook && String(cleanFundSource).toUpperCase() === 'SBFP') {
          cleanFundSource = 'NATIONAL';
        }
        const cleanNature = p.natureOfAppointment || p.nature_of_appointment || (isCook ? 'CONTRACTUAL' : 'REGULAR PERMANENT');
        const cleanHiring = p.hiringArrangement || p.hiring_arrangement || (isCook ? 'CONTRACTUAL' : 'REGULAR');

        const empRawPayload = (p.employment_raw_payload && typeof p.employment_raw_payload === 'object' && Object.keys(p.employment_raw_payload).length > 0)
          ? p.employment_raw_payload
          : ((p.employment && typeof p.employment === 'object' && Object.keys(p.employment).length > 0)
            ? p.employment
            : {
                position: p.position || 'TEACHER I',
                positionCategory: posCat,
                stepIncrement: stepInc,
                fundSource: cleanFundSource,
                natureOfAppointment: cleanNature,
                hiringArrangement: cleanHiring,
                deploymentStatus: p.deploymentStatus || p.deployment_status || 'OWN STATION',
                assignedSchools: p.assignedSchools || p.assigned_schools || [],
                gradeLevelsTaught: sanitizedGrades,
                assignedGradeLevels: sanitizedGrades,
                hasNoTeachingLoad: p.hasNoTeachingLoad === true || p.has_no_teaching_load === true || (isHead && sanitizedGrades.length === 0),
                has_no_teaching_load: p.hasNoTeachingLoad === true || p.has_no_teaching_load === true || (isHead && sanitizedGrades.length === 0),
                teachesShs: teachesShsFlag,
                teaches_shs: teachesShsFlag,
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
          fund_source: cleanFundSource,
          nature_of_appointment: cleanNature,
          hiring_arrangement: cleanHiring,
          deployment_status: p.deploymentStatus || p.deployment_status || 'OWN STATION',
          assigned_schools: JSON.stringify(p.assignedSchools || p.assigned_schools || []),
          grade_levels_taught: JSON.stringify(sanitizedGrades),
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

        // Process College Degrees array (multiple degrees support)
        const rawCollegeDegrees = Array.isArray(p.collegeDegrees) && p.collegeDegrees.length > 0
          ? p.collegeDegrees
          : (Array.isArray(p.college_degrees) && p.college_degrees.length > 0
            ? p.college_degrees
            : (Array.isArray(p.degreeRows) && p.degreeRows.length > 0
              ? p.degreeRows.map(d => ({
                  collegeDegree: d.collegeDegree || '',
                  major: d.major || '',
                  minor: d.minor || ''
                }))
              : (p.collegeDegree || p.college_degree ? [{
                  collegeDegree: p.collegeDegree || p.college_degree,
                  major: p.major || '',
                  minor: p.minor || ''
                }] : [])));

        const primaryCollege = rawCollegeDegrees[0] || {};
        const primaryDegree = p.collegeDegree || p.college_degree || primaryCollege.collegeDegree || null;
        const primaryMajor = p.major || primaryCollege.major || null;
        const primaryMinor = p.minor || primaryCollege.minor || null;

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
                collegeDegree: primaryDegree,
                collegeDegrees: rawCollegeDegrees,
                major: primaryMajor,
                minor: primaryMinor,
                degreeRows: p.degreeRows || rawCollegeDegrees,
                postGraduateDegree: p.postGraduateDegree || p.post_graduate_degree || 'N/A',
                postGraduateDiscipline: postDiscVal,
                mastersDisciplines: parsedPostDisc.masters,
                doctorateDisciplines: parsedPostDisc.doctorate,
                mastersWithUnitsDisciplines: parsedPostDisc.mastersWithUnits,
                mastersGraduatedDisciplines: parsedPostDisc.mastersGraduated,
                doctorateWithUnitsDisciplines: parsedPostDisc.doctorateWithUnits,
                doctorateGraduatedDisciplines: parsedPostDisc.doctorateGraduated,
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
          college_degree: primaryDegree,
          college_degrees: JSON.stringify(rawCollegeDegrees),
          major: primaryMajor,
          minor: primaryMinor,
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

        // 4F. Designations (with full Key Stage 1, 2, 3, 4 parsing & key_stage column)
        const rawDesigList = [];
        if (p.designation) {
          const dStr = typeof p.designation === 'string' ? p.designation : (p.designation?.name || p.designation?.designation || p.designation?.serializedKey || '');
          if (dStr && dStr !== '[object Object]') rawDesigList.push(dStr);
        }
        if (Array.isArray(p.designations)) {
          p.designations.forEach(d => {
            if (!d) return;
            const dStr = typeof d === 'string' ? d : (d?.name || d?.designation || d?.serializedKey || '');
            if (dStr && dStr !== '[object Object]') rawDesigList.push(dStr);
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
            let keyStage = null;
            let gradeLevel = null;
            let subjectArea = null;
            let track = null;

            const upper = cleanKey.toUpperCase();

            // 1. Department Head - Key Stage 1 (Kinder - Grade 3)
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
            // 2. Department Head - Key Stage 2 (Grade 4 - Grade 6)
            else if (upper.startsWith('DEPARTMENT HEAD') && (upper.includes('KEY STAGE 2') || upper.includes('KS2'))) {
              keyStage = 'KS2';
              dsgName = 'DEPARTMENT HEAD';
              gradeLevel = 'Grade 4, Grade 5, Grade 6';
              if (cleanKey.includes(' - ')) {
                const parts = cleanKey.split(' - ');
                subjectArea = parts[parts.length - 1].trim();
              }
            }
            // 3. Department Head - Key Stage 3 (Grade 7 - Grade 10)
            else if (upper.startsWith('DEPARTMENT HEAD') && (upper.includes('KEY STAGE 3') || upper.includes('KS3'))) {
              keyStage = 'KS3';
              dsgName = 'DEPARTMENT HEAD';
              gradeLevel = 'Grade 7, Grade 8, Grade 9, Grade 10';
              if (cleanKey.includes(' - ')) {
                const parts = cleanKey.split(' - ');
                subjectArea = parts[parts.length - 1].trim();
              }
            }
            // 4. Department Head - Key Stage 4 (Grade 11 - Grade 12)
            else if (upper.startsWith('DEPARTMENT HEAD') && (upper.includes('KEY STAGE 4') || upper.includes('KS4') || upper.includes('ACADEMIC TRACK') || upper.includes('TECH-PRO TRACK') || upper.includes('SHS'))) {
              keyStage = 'KS4';
              dsgName = 'DEPARTMENT HEAD';
              gradeLevel = 'Grade 11, Grade 12';
              track = upper.includes('TECH') ? 'Tech-Pro Track' : 'Academic Track';
            }
            // 5. Grade Level / Learning Area Chairpersons
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
              rawPayload: { designation: cleanKey, keyStage: keyStage || null, gradeLevel: gradeLevel || null, subjectArea: subjectArea || null, track: track || null, isSdsApproved: isSds, serializedKey: rawStr }
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
          const seq = String(dsgCounter++).padStart(3, '0');
          const dsgId = `DSG-${cleanSchoolId}-${pId.split('-').pop()}-${seq}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

          dsgBatch.push({
            id: dsgId,
            personnel_id: pId,
            designation_name: dsgObj.designationName,
            key_stage: dsgObj.keyStage || null,
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

        // 4H. Ingest Administrative Tasks (from p.administrativeRows AND admin rows in p.workloadRows)
        const ADMIN_TASK_KEYWORDS = [
          'PERSONNEL ADMINISTRATION',
          'PROPERTY CUSTODIANSHIP',
          'FINANCIAL MANAGEMENT',
          'GENERAL ADMINISTRATIVE SUPPORT',
          'RECORDS MANAGEMENT & LIS',
          'DISASTER RISK REDUCTION (SDRRM)',
          'FEEDING PROGRAM MANAGEMENT',
          'BAC & PROCUREMENT SUPPORT',
          'BRIGADA ESKWELA & PARTNERSHIPS',
          'ADMINISTRATIVE DUTY',
          'ADMINISTRATIVE TASK'
        ];

        const isRowAdminTask = (r) => {
          if (!r) return false;
          if (r.isAdmin === true || r.is_admin === true) return true;
          const sName = String(r.task || r.task_name || r.subject || r.name || '').toUpperCase();
          if (sName.includes('ADMIN') || ADMIN_TASK_KEYWORDS.some(kw => sName.includes(kw))) return true;
          if (r.category === 'admin' || r.taskCategory === 'General Administration') return true;
          return false;
        };

        const admList = [
          ...(Array.isArray(p.administrativeRows) ? p.administrativeRows : (Array.isArray(p.administrative_rows) ? p.administrative_rows : [])),
          ...(Array.isArray(p.workloadRows) ? p.workloadRows.filter(r => isRowAdminTask(r)) : [])
        ];

        let admCounter = 1;
        const processedAdminKeys = new Set();

        for (const adm of admList) {
          if (!adm || (!adm.task && !adm.task_name && !adm.name && !adm.subject)) continue;
          const tName = adm.task || adm.task_name || adm.name || adm.subject || 'Administrative Task';
          const startTime = adm.startTime || adm.start_time || null;
          const endTime = adm.endTime || adm.end_time || null;
          const term = adm.term || '1st';
          const days = Array.isArray(adm.days) ? adm.days : ['M', 'T', 'W', 'TH', 'F'];
          
          const uniqueAdminKey = `${tName}_${startTime}_${endTime}_${term}`.toUpperCase();
          if (processedAdminKeys.has(uniqueAdminKey)) continue;
          processedAdminKeys.add(uniqueAdminKey);

          const admId = `ADM-${cleanSchoolId}-${pId.split('-').pop()}-${String(admCounter++).padStart(3, '0')}`;
          const datesArr = Array.isArray(adm.dates) ? adm.dates : (adm.taskDate ? [adm.taskDate] : (adm.date ? [adm.date] : []));
          const category = adm.category || adm.taskCategory || adm.task_category || 'General Administration';
          const startDate = adm.startDate || adm.start_date || null;
          const endDate = adm.endDate || adm.end_date || null;

          let durMins = 60;
          if (adm.duration_minutes !== undefined && adm.duration_minutes !== null) {
            durMins = parseInt(adm.duration_minutes, 10) || 60;
          } else if (adm.durationMinutes !== undefined && adm.durationMinutes !== null) {
            durMins = parseInt(adm.durationMinutes, 10) || 60;
          } else if (adm.minutes !== undefined && adm.minutes !== null) {
            durMins = parseInt(adm.minutes, 10) || 60;
          } else if (adm.hours !== undefined && adm.hours !== null) {
            durMins = Math.round(parseFloat(adm.hours) * 60) || 60;
          } else if (startTime && endTime) {
            const [sh, sm] = String(startTime).split(':').map(Number);
            const [eh, em] = String(endTime).split(':').map(Number);
            if (!isNaN(sh) && !isNaN(eh)) {
              durMins = Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
            }
          }

          const daysCount = days.length > 0 ? days.length : 5;
          const weeklyHours = (durMins / 60) * daysCount;
          const termTotalHours = parseFloat((weeklyHours * 12).toFixed(2));
          const isDesig = !!(adm.isDesignationSynced || adm.is_designation_synced);

          adminBatch.push({
            id: admId,
            personnel_id: pId,
            school_id: cleanSchoolId,
            school_year: cleanSchoolYear,
            task_name: tName,
            task_category: category,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime,
            end_time: endTime,
            days: JSON.stringify(days),
            dates: JSON.stringify(datesArr),
            term: term,
            duration_minutes: durMins,
            term_total_hours: termTotalHours,
            is_designation_synced: isDesig,
            status: 'ACTIVE',
            raw_payload: JSON.stringify(adm)
          });
        }
      }
    }

    // Step 3/8: Execute Parameterized Multi-Row Inserts for Personnel Master & Children
    currentStage = '[Step 3/8: Batch Ingesting Personnel & Sub-records]';

    if (profileBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_personnel_profile', Object.keys(profileBatch[0]), profileBatch, `
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
          no_deped_email = EXCLUDED.no_deped_email,
          allow_email_discrepancy = EXCLUDED.allow_email_discrepancy,
          is_school_head = EXCLUDED.is_school_head,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      profileBatch.length = 0;
    }

    if (empBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_personnel_employment', Object.keys(empBatch[0]), empBatch, `
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
      `, 50);
      empBatch.length = 0;
    }

    if (educBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_perssonel_educ', Object.keys(educBatch[0]), educBatch, `
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
      `, 50);
      educBatch.length = 0;
    }

    if (laBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_personnel_learning_areas', Object.keys(laBatch[0]), laBatch, `
        ON CONFLICT (personnel_id) DO UPDATE SET
          matrix_data = EXCLUDED.matrix_data,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      laBatch.length = 0;
    }

    // Clean and batch insert child records for processed personnel IDs
    if (processedPersonnelIds.length > 0) {
      await client.query('DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (ldBatch.length > 0) {
        await executeBatchInsertInChunks(client, 'esf7_personnel_ld_trainings', Object.keys(ldBatch[0]), ldBatch, '', 50);
        ldBatch.length = 0;
      }

      await client.query('DELETE FROM esf7_personnel_designations WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (dsgBatch.length > 0) {
        await executeBatchInsertInChunks(client, 'esf7_personnel_designations', Object.keys(dsgBatch[0]), dsgBatch, '', 50);
        dsgBatch.length = 0;
      }

      await client.query('DELETE FROM esf7_related_task WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (relatedBatch.length > 0) {
        await executeBatchInsertInChunks(client, 'esf7_related_task', Object.keys(relatedBatch[0]), relatedBatch, '', 50);
        relatedBatch.length = 0;
      }

      await client.query('DELETE FROM esf7_admin_task WHERE personnel_id = ANY($1)', [processedPersonnelIds]);
      if (adminBatch.length > 0) {
        await executeBatchInsertInChunks(client, 'esf7_admin_task', Object.keys(adminBatch[0]), adminBatch, '', 50);
        adminBatch.length = 0;
      }
    }

    // Step 4/8: Ingest Class Sections (Regular, SNED, ALS, ARAL, Remedial/Enrichment)
    currentStage = '[Step 4/8: Organized Sections]';
    const sectionsList = payload.classSections || [];
    console.log(`  \x1b[90m├─\x1b[0m \x1b[33m${currentStage}\x1b[0m Batch ingesting ${sectionsList.length} organized sections...`);

    await client.query('DELETE FROM esf7_regular_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_sned_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_als_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_aral_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);
    await client.query('DELETE FROM esf7_remedial_enrichment_sections WHERE school_id = $1 AND school_year = $2', [cleanSchoolId, cleanSchoolYear]);

    const regSecBatch = [];
    const snedSecBatch = [];
    const alsSecBatch = [];
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

      const glUpper = String(gl).toUpperCase().trim();
      const stUpper = String(st).toUpperCase().trim();

      const isSned = stUpper.includes('SNED') || glUpper.includes('SNED') || glUpper.includes('NON-GRADED') || glUpper.includes('SPED');
      const isAls = stUpper === 'ALS' || glUpper.includes('ALS');
      const isAral = stUpper.startsWith('ARAL') || stUpper.includes('ARAL') || glUpper.includes('ARAL') || Boolean(s.aralBasis || s.aralToolKey || s.aralTool);
      const isRem = stUpper === 'REMEDIAL' || stUpper === 'ENRICHMENT' || stUpper.includes('REMEDIAL') || stUpper.includes('ENRICHMENT') || stUpper.includes('REMEDIATION');

      if (isSned) {
        snedSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          grade_level: 'SNED (NON-GRADED)',
          section_name: sn,
          program_type: s.programType || s.program_type || null,
          adviser_id: advId,
          male_learners: maleL,
          female_learners: femaleL,
          number_of_learners: totalL,
          size_status: sizeStat,
          raw_payload: JSON.stringify(s)
        });
      } else if (isAls) {
        alsSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          grade_level: gl,
          section_name: sn,
          delivery_mode: s.deliveryMode || s.delivery_mode || null,
          clc_name: s.clcName || s.clc_name || null,
          adviser_id: advId,
          male_learners: maleL,
          female_learners: femaleL,
          number_of_learners: totalL,
          size_status: sizeStat,
          raw_payload: JSON.stringify(s)
        });
      } else if (isAral) {
        aralSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          basis_type: s.basisType || s.aralBasis || (s.aralTool ? 'assessment' : 'grade'),
          grade_level: s.aralGrade || gl,
          assessment_tool: s.assessmentTool || s.aralTool || s.aralToolKey || null,
          profile_level: s.profileLevel || s.aralProfileLevel || null,
          section_name: sn,
          tutor_id: s.tutorId || s.tutor_id || advId,
          male_learners: maleL,
          female_learners: femaleL,
          total_learners: totalL || Number(s.aralLearners || 0),
          raw_payload: JSON.stringify(s)
        });
      } else if (isRem) {
        remSecBatch.push({
          id: secId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          intervention_type: (stUpper.includes('ENRICHMENT') ? 'ENRICHMENT' : 'REMEDIAL'),
          grade_level: gl,
          section_name: sn,
          assigned_teacher_id: s.assignedTeacherId || s.teacherId || advId,
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
      await executeBatchInsertInChunks(client, 'esf7_regular_sections', Object.keys(regSecBatch[0]), regSecBatch, `
        ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
          section_type = EXCLUDED.section_type,
          adviser_id = EXCLUDED.adviser_id,
          male_learners = EXCLUDED.male_learners,
          female_learners = EXCLUDED.female_learners,
          number_of_learners = EXCLUDED.number_of_learners,
          size_status = EXCLUDED.size_status,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      regSecBatch.length = 0;
    }

    if (snedSecBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_sned_sections', Object.keys(snedSecBatch[0]), snedSecBatch, `
        ON CONFLICT (school_id, school_year, section_name) DO UPDATE SET
          grade_level = EXCLUDED.grade_level,
          program_type = EXCLUDED.program_type,
          adviser_id = EXCLUDED.adviser_id,
          male_learners = EXCLUDED.male_learners,
          female_learners = EXCLUDED.female_learners,
          number_of_learners = EXCLUDED.number_of_learners,
          size_status = EXCLUDED.size_status,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      snedSecBatch.length = 0;
    }

    if (alsSecBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_als_sections', Object.keys(alsSecBatch[0]), alsSecBatch, `
        ON CONFLICT (school_id, school_year, section_name) DO UPDATE SET
          grade_level = EXCLUDED.grade_level,
          delivery_mode = EXCLUDED.delivery_mode,
          clc_name = EXCLUDED.clc_name,
          adviser_id = EXCLUDED.adviser_id,
          male_learners = EXCLUDED.male_learners,
          female_learners = EXCLUDED.female_learners,
          number_of_learners = EXCLUDED.number_of_learners,
          size_status = EXCLUDED.size_status,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      alsSecBatch.length = 0;
    }

    if (aralSecBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_aral_sections', Object.keys(aralSecBatch[0]), aralSecBatch, `
        ON CONFLICT (id) DO UPDATE SET
          basis_type = EXCLUDED.basis_type,
          grade_level = EXCLUDED.grade_level,
          assessment_tool = EXCLUDED.assessment_tool,
          profile_level = EXCLUDED.profile_level,
          section_name = EXCLUDED.section_name,
          tutor_id = EXCLUDED.tutor_id,
          male_learners = EXCLUDED.male_learners,
          female_learners = EXCLUDED.female_learners,
          total_learners = EXCLUDED.total_learners,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      aralSecBatch.length = 0;
    }

    if (remSecBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_remedial_enrichment_sections', Object.keys(remSecBatch[0]), remSecBatch, `
        ON CONFLICT (id) DO UPDATE SET
          intervention_type = EXCLUDED.intervention_type,
          grade_level = EXCLUDED.grade_level,
          section_name = EXCLUDED.section_name,
          assigned_teacher_id = EXCLUDED.assigned_teacher_id,
          male_learners = EXCLUDED.male_learners,
          female_learners = EXCLUDED.female_learners,
          total_learners = EXCLUDED.total_learners,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      remSecBatch.length = 0;
    }

    // Step 5/8: Ingest Workload Rows for this School
    currentStage = '[Step 5/8: Elementary, JHS & SHS Workload Timetables]';
    console.log(`  \x1b[90m├─\x1b[0m \x1b[33m${currentStage}\x1b[0m Batch ingesting timetable schedules...`);

    const workloadBatch = [];
    const shsWorkloadBatch = [];

    for (const p of personnelList) {
      if (!p) continue;
      const pId = p.id || p.personnel_id;
      if (!pId) continue;

      const allWk = [
        ...(Array.isArray(p.workloadRows) ? p.workloadRows : []),
        ...(Array.isArray(p.workload_rows) ? p.workload_rows : [])
      ];

      for (let sIdx = 0; sIdx < allWk.length; sIdx++) {
        const wk = allWk[sIdx];
        if (!wk || (!wk.subject && !wk.subjectName && !wk.task)) continue;

        const wkId = (wk.id && !String(wk.id).startsWith('wk-local-') && !String(wk.id).startsWith('client-') && wk.id.length <= 40)
          ? wk.id
          : `WKL-${cleanSchoolId}-${pId.replace(/[^0-9]/g, '').slice(-3) || '001'}-${String(sIdx + 1).padStart(3, '0')}`;
        const daysArr = Array.isArray(wk.days) && wk.days.length > 0 ? wk.days : ['M', 'T', 'W', 'TH', 'F'];
        const rowTerm = wk.term || payload.term || payload.activeTerm || '1st';
        const gradeLevel = wk.gradeLevel || wk.grade_level || 'Grade 7';
        const isShsRow = gradeLevel.includes('11') || gradeLevel.includes('12') || gradeLevel.toUpperCase().includes('SHS') || Boolean(wk.trackStrand || wk.track_strand);

        const record = {
          id: wkId,
          personnel_id: pId,
          school_id: cleanSchoolId,
          school_year: cleanSchoolYear,
          grade_level: gradeLevel,
          section_id: wk.sectionId || wk.section_id || null,
          section_name: wk.sectionName || wk.section_name || 'Section 1',
          subject: wk.subject || wk.subjectName || wk.task || 'Subject',
          subject_id: wk.subjectId || wk.subject_id || null,
          remediation_subject: wk.remediationSubject || wk.remediation_subject || null,
          start_time: wk.startTime || wk.start_time || '08:00',
          end_time: wk.endTime || wk.end_time || '09:00',
          days: JSON.stringify(daysArr),
          term: rowTerm,
          raw_payload: JSON.stringify({ ...wk, term: rowTerm })
        };

        workloadBatch.push(record);

        if (isShsRow) {
          shsWorkloadBatch.push({
            ...record,
            track_strand: wk.trackStrand || wk.track_strand || '',
            shs_subject_category: wk.shsSubjectCategory || wk.shs_subject_category || wk.category || 'SHS-CORE SUBJECTS',
            semester: wk.semester || (rowTerm === '2nd' ? '2nd Semester' : '1st Semester')
          });
        }
      }
    }

    // Determine terms being submitted to avoid deleting other historical/active terms
    const submittedTerms = [...new Set(workloadBatch.map(w => w.term))];
    if (submittedTerms.length > 0) {
      await client.query(
        'DELETE FROM esf7_workload_rows WHERE (school_id = $1 OR school_id = $2) AND (school_year = $3 OR school_year = $4) AND term = ANY($5)',
        [cleanSchoolId, `SCH-${cleanSchoolId.replace('SCH-', '')}`, cleanSchoolYear, cleanSchoolYear.replace('SY ', '20').replace('-', '-20'), submittedTerms]
      );
      await client.query(
        'DELETE FROM esf7_shs_workload_rows WHERE (school_id = $1 OR school_id = $2) AND (school_year = $3 OR school_year = $4) AND term = ANY($5)',
        [cleanSchoolId, `SCH-${cleanSchoolId.replace('SCH-', '')}`, cleanSchoolYear, cleanSchoolYear.replace('SY ', '20').replace('-', '-20'), submittedTerms]
      ).catch(() => {});
    } else if (payload.term || payload.activeTerm) {
      const explicitTerm = payload.term || payload.activeTerm;
      await client.query(
        'DELETE FROM esf7_workload_rows WHERE (school_id = $1 OR school_id = $2) AND (school_year = $3 OR school_year = $4) AND term = $5',
        [cleanSchoolId, `SCH-${cleanSchoolId.replace('SCH-', '')}`, cleanSchoolYear, cleanSchoolYear.replace('SY ', '20').replace('-', '-20'), explicitTerm]
      );
      await client.query(
        'DELETE FROM esf7_shs_workload_rows WHERE (school_id = $1 OR school_id = $2) AND (school_year = $3 OR school_year = $4) AND term = $5',
        [cleanSchoolId, `SCH-${cleanSchoolId.replace('SCH-', '')}`, cleanSchoolYear, cleanSchoolYear.replace('SY ', '20').replace('-', '-20'), explicitTerm]
      ).catch(() => {});
    }

    if (workloadBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_workload_rows', Object.keys(workloadBatch[0]), workloadBatch, '', 50);
      workloadBatch.length = 0;
    }

    if (shsWorkloadBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'esf7_shs_workload_rows', Object.keys(shsWorkloadBatch[0]), shsWorkloadBatch, '', 50).catch(() => {});
      shsWorkloadBatch.length = 0;
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
      await executeBatchInsertInChunks(client, 'esf7_personnel_allowances', Object.keys(allowancesBatch[0]), allowancesBatch, `
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
      `, 50);
      allowancesBatch.length = 0;
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
      await executeBatchInsertInChunks(client, 'esf7_workload_transfer', Object.keys(transferBatch[0]), transferBatch, '', 50);
      transferBatch.length = 0;
    }

    // Ingest Overload Pay & Reasons (overload_pay_and_reason)
    const overloadBatch = [];
    const overloadReasonsMap = payload.overloadReasonsMap || payload.overloadReasons || {};
    const explicitOverloadList = payload.overloadPayAndReason || payload.overloadRecords || payload.overloadList || payload.overloadRoster || [];
    const seenOverloadPersonnel = new Set();
    const targetTerm = payload.activeTerm || payload.term || 'Term 1';

    // 1. Ingest any explicitly passed overload records
    for (let oIdx = 0; oIdx < explicitOverloadList.length; oIdx++) {
      const oItem = explicitOverloadList[oIdx];
      if (!oItem) continue;
      const pId = oItem.personnelId || oItem.personnel_id || oItem.teacherId || oItem.teacher_id || oItem.teacher?.id;
      if (!pId) continue;
      seenOverloadPersonnel.add(pId);

      const oHours = parseFloat(oItem.overloadHours || oItem.overload_hours || oItem.hours || oItem.totalStats?.net || 0) || 0;
      const oPay = parseFloat(oItem.overloadPay || oItem.overload_pay || oItem.pay || 0) || 0;
      const netPay = parseFloat(oItem.netTermPay || oItem.net_term_pay || oPay) || 0;
      const reasons = Array.isArray(oItem.reasons) && oItem.reasons.length > 0
        ? oItem.reasons
        : (overloadReasonsMap[pId] || ['Teacher Shortage']);

      const oId = oItem.id || `OPR-${cleanSchoolId}-${pId.split('-').pop() || String(oIdx + 1).padStart(3, '0')}`;

      overloadBatch.push({
        id: oId,
        personnel_id: pId,
        school_id: cleanSchoolId,
        school_year: cleanSchoolYear,
        term: oItem.term || targetTerm,
        month: oItem.month || 'All',
        overload_hours: oHours,
        overload_pay: oPay,
        net_term_pay: netPay,
        reasons: JSON.stringify(reasons),
        raw_payload: JSON.stringify(oItem),
        updated_at: new Date()
      });
    }

    // 2. Derive overload from timetable workloads & substitute transfers
    try {
      const smRes = await client.query(`SELECT position_title, step_number, basic_salary FROM salary_matrix`);
      const smRows = smRes.rows || [];
      const fallbackSalaries = {
        'TEACHER I': 31705, 'TEACHER II': 33947, 'TEACHER III': 36125,
        'TEACHER IV': 38764, 'TEACHER V': 42178, 'TEACHER VI': 45694,
        'TEACHER VII': 49562, 'MASTER TEACHER I': 53818, 'MASTER TEACHER II': 59153,
        'MASTER TEACHER III': 66052, 'MASTER TEACHER IV': 73303, 'MASTER TEACHER V': 81796
      };

      const parseTimeMins = (t) => {
        if (!t) return 0;
        const [h, m] = String(t).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };

      const getWeekdaysInMonth = (monthIndex, year) => {
        const dates = [];
        const date = new Date(year, monthIndex, 1);
        while (date.getMonth() === monthIndex) {
          const day = date.getDay();
          if (day >= 1 && day <= 5) dates.push(new Date(date));
          date.setDate(date.getDate() + 1);
        }
        return dates;
      };

      const term1Dates = [
        ...getWeekdaysInMonth(5, 2026),
        ...getWeekdaysInMonth(6, 2026),
        ...getWeekdaysInMonth(7, 2026)
      ];
      const dayShortMap = { 1: 'M', 2: 'T', 3: 'W', 4: 'TH', 5: 'F' };

      for (let pIdx = 0; pIdx < personnelList.length; pIdx++) {
        const p = personnelList[pIdx];
        if (!p) continue;
        const pId = p.id || p.personnel_id || `PER-${cleanSchoolId}-${String(pIdx + 1).padStart(3, '0')}`;
        if (seenOverloadPersonnel.has(pId)) continue;

        const pWorkloads = p.workloadRows || [];
        let netOverloadHours = 0;

        term1Dates.forEach(d => {
          const dateStr = d.toISOString().split('T')[0];
          const dayShort = dayShortMap[d.getDay()];

          let dayMins = 0;
          pWorkloads.forEach(w => {
            let daysArr = [];
            if (Array.isArray(w.days)) {
              daysArr = w.days;
            } else if (typeof w.days === 'string') {
              try { daysArr = JSON.parse(w.days); } catch (e) { daysArr = w.days.split(',').map(s => s.trim()).filter(Boolean); }
            }
            if (daysArr.includes(dayShort)) {
              const sub = String(w.subject || w.subject_title || w.subjectName || '').toUpperCase().trim();
              if (sub === 'HGP') {
                // Excluded
              } else if (sub === 'ADVISORY') {
                dayMins += 60;
              } else {
                const sTime = w.startTime || w.start_time;
                const eTime = w.endTime || w.end_time;
                dayMins += Math.max(0, parseTimeMins(eTime) - parseTimeMins(sTime));
              }
            }
          });

          // Add substitute transferred workloads
          transfersList.forEach(t => {
            const tStart = t.startDate || t.start_date;
            const tEnd = t.endDate || t.end_date || tStart;
            if (dateStr >= tStart && dateStr <= tEnd) {
              const isSub = (t.substituteTeacherId === pId || t.substitute_personnel_id === pId || t.relievingPersonnelId === pId || t.relieving_personnel_id === pId);
              if (isSub) {
                const tRows = t.workloadRows || t.workload_rows || [];
                tRows.forEach(tw => {
                  let tdays = [];
                  try { tdays = Array.isArray(tw.days) ? tw.days : JSON.parse(tw.days); } catch(e) { tdays = String(tw.days).split(','); }
                  if (tdays.includes(dayShort)) {
                    const sub = String(tw.subject || '').toUpperCase().trim();
                    if (sub !== 'HGP') {
                      dayMins += Math.max(0, parseTimeMins(tw.endTime || tw.end_time) - parseTimeMins(tw.startTime || tw.start_time));
                    }
                  }
                });
              }
            }
          });

          const dayHours = dayMins / 60;
          if (dayHours > 6.0) {
            netOverloadHours += (dayHours - 6.0);
          }
        });

        // Also check standard 30h/wk baseline
        let baseWeeklyMins = 0;
        pWorkloads.forEach(w => {
          let daysArr = [];
          if (Array.isArray(w.days)) {
            daysArr = w.days;
          } else if (typeof w.days === 'string') {
            try { daysArr = JSON.parse(w.days); } catch (e) { daysArr = w.days.split(',').map(s => s.trim()).filter(Boolean); }
          }
          const daysCount = Array.isArray(daysArr) && daysArr.length > 0 ? daysArr.length : 5;
          const sub = String(w.subject || w.subject_title || w.subjectName || '').toUpperCase().trim();
          if (sub !== 'HGP') {
            const sTime = w.startTime || w.start_time;
            const eTime = w.endTime || w.end_time;
            baseWeeklyMins += Math.max(0, parseTimeMins(eTime) - parseTimeMins(sTime)) * daysCount;
          }
        });
        const baseWeeklyHours = baseWeeklyMins / 60;
        if (baseWeeklyHours > 30 && netOverloadHours === 0) {
          netOverloadHours = (baseWeeklyHours - 30) * 12;
        }

        if (netOverloadHours > 0) {
          const termOverloadHours = Math.round(netOverloadHours * 100) / 100;
          const pos = String(p.position || 'TEACHER I').toUpperCase().trim();
          const step = Number(p.stepIncrement || p.step_increment || 1);
          const smMatch = smRows.find(r => String(r.position_title).toUpperCase().trim() === pos && Number(r.step_number) === step);
          const basicSalary = smMatch ? Number(smMatch.basic_salary) : (fallbackSalaries[pos] || 31705);
          const phtr = 0.000781 * 12 * basicSalary;
          const overloadPay = Math.round(termOverloadHours * phtr * 100) / 100;
          const reasons = overloadReasonsMap[pId] || ['Teacher Shortage'];

          const oId = `OPR-${cleanSchoolId}-${pId.split('-').pop()}`;
          overloadBatch.push({
            id: oId,
            personnel_id: pId,
            school_id: cleanSchoolId,
            school_year: cleanSchoolYear,
            term: targetTerm,
            month: 'All',
            overload_hours: termOverloadHours,
            overload_pay: overloadPay,
            net_term_pay: overloadPay,
            reasons: JSON.stringify(reasons),
            raw_payload: JSON.stringify({ termOverloadHours, phtr, overloadPay }),
            updated_at: new Date()
          });
        }
      }
    } catch (overloadCalcErr) {
      console.warn('[Queue Worker] Overload calculation warning:', overloadCalcErr.message);
    }

    if (overloadBatch.length > 0) {
      await executeBatchInsertInChunks(client, 'overload_pay_and_reason', Object.keys(overloadBatch[0]), overloadBatch, `
        ON CONFLICT (personnel_id, school_year, term, month) DO UPDATE SET
          overload_hours = CASE WHEN EXCLUDED.overload_hours > 0 THEN EXCLUDED.overload_hours ELSE overload_pay_and_reason.overload_hours END,
          overload_pay = CASE WHEN EXCLUDED.overload_pay > 0 THEN EXCLUDED.overload_pay ELSE overload_pay_and_reason.overload_pay END,
          net_term_pay = CASE WHEN EXCLUDED.net_term_pay > 0 THEN EXCLUDED.net_term_pay ELSE overload_pay_and_reason.net_term_pay END,
          reasons = EXCLUDED.reasons,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `, 50);
      overloadBatch.length = 0;
    }



    // Step 8/8: COMMIT transaction & Mark Complete
    currentStage = '[Step 8/8: Transaction Finalization]';
    await client.query('COMMIT');

    await client.query(
      `UPDATE esf7_submission_queue SET status = 'completed', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    try {
      const { syncAllOverloadPayAndReasons } = require('./services/overloadSync');
      await syncAllOverloadPayAndReasons(cleanSchoolId, cleanSchoolYear);
    } catch (syncErr) {
      console.warn('[Queue Worker Overload Sync Warning]:', syncErr.message);
    }

    const totalDuration = Date.now() - jobStartTime;
    console.log(`  \x1b[32m✔ [Queue Worker] Job #${jobId} (School ${cleanSchoolId}) COMPLETED in ${totalDuration}ms\x1b[0m\n`);
    currentProcessingJobId = null;
    if (shouldRelease && client) client.release();
    return true;


  } catch (error) {
    currentProcessingJobId = null;
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
    await recoverStaleJobs(client).catch(() => {});

    // Fetch next pending job with row lock skipping already locked rows
    const nextId = await pickNextPendingJob(client);

    if (nextId === null) {
      if (db.stagingPool && db.stagingPool !== db.pool) {
        let stagingClient = null;
        try {
          stagingClient = await db.stagingPool.connect();
          await recoverStaleJobs(stagingClient).catch(() => {});
          const nextStagingId = await pickNextPendingJob(stagingClient);
          if (nextStagingId !== null) {
            const res = await processJobById(nextStagingId, stagingClient);
            stagingClient.release();
            client.release();
            activeWorkersCount--;
            setImmediate(() => {
              processNextJob().catch(() => {});
            });
            return res;
          }
        } catch (sErr) {
          // ignore
        } finally {
          if (stagingClient) {
            try { stagingClient.release(); } catch (e) {}
          }
        }
      }
      client.release();
      activeWorkersCount--;
      return false;
    }


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

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Claim and process everything left over: unacknowledged stream entries (XPENDING/XAUTOCLAIM) and queued
// PostgreSQL rows. Each job is acknowledged only after processJobById returns true (i.e. after the DB commit),
// and processJobById claims the row atomically, so a job delivered twice is still processed once.
async function drainBacklog(consumerName) {
  try {
    const entries = await redisQueue.drainPendingEntries({ consumerName, minIdleTimeMs: 30000 });
    if (entries.length > 0) console.log(`🔄 [Queue Worker] Draining ${entries.length} unacknowledged stream entr${entries.length === 1 ? 'y' : 'ies'}...`);
    for (const entry of entries) {
      const success = await processJobById(entry.jobId);
      if (success) await redisQueue.ackJob(entry.messageId);
    }
  } catch (err) {
    if (err && err.name === 'RedisConfigError') throw err;
    console.warn('[Queue Worker] Stream backlog drain notice:', err.message);
  }
  // Rows queued in PostgreSQL while Redis was down (or never published).
  for (let i = 0; i < 500; i++) {
    const didWork = await processNextJob().catch(() => false);
    if (!didWork) break;
  }
}

async function startRedisStreamWorker(consumerName = `worker-${process.pid || '1'}`) {
  if (isRedisWorkerActive) return;
  isRedisWorkerActive = true;

  console.log(`🌊 [Redis Queue Worker] Started Redis Stream consumer loop (${consumerName})...`);
  redisQueue.startMonitor(); // idempotent; also covers run_redis_worker.js, which calls this function directly

  let lastClaimCheck = 0;
  let needsDrain = true; // drain on startup
  const offMode = redisQueue.onModeChange((mode) => { if (mode === 'redis') needsDrain = true; });

  try {
    while (isRedisWorkerActive) {
      try {
        // While Redis is unreachable, do not spin: the PostgreSQL poller keeps processing queued rows.
        if (!redisQueue.isRedisAvailable()) {
          await sleep(1000);
          continue;
        }

        if (needsDrain) {
          needsDrain = false;
          lastClaimCheck = Date.now();
          await redisQueue.initRedisStream();
          await drainBacklog(consumerName);
        } else if (Date.now() - lastClaimCheck > 30000) {
          // Periodic recovery of entries held by crashed workers
          lastClaimCheck = Date.now();
          await drainBacklog(consumerName);
        }

        // Read next incoming event from stream (blocking up to 2000ms)
          const event = await redisQueue.readNextStreamJob({ consumerName, blockMs: 2000 });
        if (event && event.jobId) {
          console.log(`📥 [Redis Queue Worker] Received job ${event.jobId} from stream (School: ${event.schoolId})`);
          const success = await processJobById(event.jobId);
          if (success) {
            // Postgres fallback check: verify row is committed as 'completed' in DB before acknowledging stream
            const targetPool = (db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(event.schoolId) && db.stagingPool)
              ? db.stagingPool
              : db.pool;
            const checkRes = await targetPool.query(
              `SELECT status FROM esf7_submission_queue WHERE id = $1`,
              [event.jobId]
            ).catch(() => ({ rows: [] }));

            if (checkRes.rows.length > 0 && checkRes.rows[0].status === 'completed') {
              await redisQueue.ackJob(event.messageId);
            } else {
              console.warn(`⚠️ [Redis Queue Worker] Post-commit check failed: Job #${event.jobId} is not 'completed' in database. Retaining unacknowledged in stream.`);
            }
          }
        }
      } catch (err) {
        if (err && err.name === 'RedisConfigError') throw err;
        console.warn('[Redis Queue Worker Loop Notice]:', err.message);
        await sleep(2000);
      }
    }
  } finally {
    offMode();
    isRedisWorkerActive = false;
  }
}

let workerInterval = null;
let workerIntervalMs = 0;
let offModeListener = null;

function setPollInterval(ms) {
  if (workerInterval && workerIntervalMs === ms) return;
  if (workerInterval) clearInterval(workerInterval);
  workerIntervalMs = ms;
  workerInterval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (err) {
      console.error('[Queue Worker] Unexpected error in worker loop:', err.message);
    }
  }, ms);
}

async function startWorker(intervalMs = 2000) {
  if (workerInterval || isRedisWorkerActive) return;

  console.log('[Queue Worker] Initializing submissions queue high-performance processor...');

  // Validates REDIS_* settings (throws a clear error if malformed) and starts connecting in the background.
  redisQueue.startMonitor();

  const applyMode = (mode) => {
    if (mode === 'redis') {
      console.log('🚀 [Queue Worker] Redis Streams connected! Running in Event-Driven Consumer Mode.');
      setPollInterval(10000); // low-frequency safety poll
      startRedisStreamWorker().catch((err) => {
        console.error('[Redis Worker Fatal]:', err);
      });
    } else {
      console.log('ℹ️ [Queue Worker] Operating in High-Throughput PostgreSQL (FOR UPDATE SKIP LOCKED) mode.');
      setPollInterval(intervalMs);
    }
  };

  // Start in PostgreSQL mode immediately so no queued row waits for Redis; upgrade automatically when Redis is ready.
  applyMode(redisQueue.getQueueStatus().mode);
  offModeListener = redisQueue.onModeChange(applyMode);
}

function stopWorker() {
  isRedisWorkerActive = false;
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    workerIntervalMs = 0;
  }
  if (offModeListener) {
    offModeListener();
    offModeListener = null;
  }
  console.log('[Queue Worker] Stopped background processor.');
}

function getCurrentProcessingJobId() {
  return currentProcessingJobId;
}

async function requeueInFlightJob() {
  if (!currentProcessingJobId) return;
  const jId = currentProcessingJobId;
  console.warn(`⚠️ [Queue Worker] Requeuing in-flight Job #${jId} back to 'pending' in PostgreSQL due to shutdown...`);
  await db.query(
    `UPDATE esf7_submission_queue SET status = 'pending', updated_at = NOW() WHERE id = $1 AND status = 'processing'`,
    [jId]
  ).catch(() => {});
  if (db.stagingPool && db.stagingPool !== db.pool) {
    await db.stagingPool.query(
      `UPDATE esf7_submission_queue SET status = 'pending', updated_at = NOW() WHERE id = $1 AND status = 'processing'`,
      [jId]
    ).catch(() => {});
  }
}

module.exports = {
  processJobById,
  processNextJob,
  startRedisStreamWorker,
  startWorker,
  stopWorker,
  getCurrentProcessingJobId,
  requeueInFlightJob
};
