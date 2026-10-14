const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const {
  sanitizeStepIncrement,
  calculateAge,
  formatWorkloadRecord,
  formatPersonnelRecord,
  fetchMasterPersonnelFromInsightEd,
  formatCanonicalPrn,
  resolvePersonnelIdentity,
} = require("./common");


const DATE_PLACEHOLDERS = new Set(["", "N/A", "NA", "N.A.", "NONE", "NULL", "UNDEFINED", "-", "--", "—", "NOT APPLICABLE", "TBD"]);

function safeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (DATE_PLACEHOLDERS.has(s.toUpperCase())) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const m = parseInt(us[1], 10);
    const d = parseInt(us[2], 10);
    const y = parseInt(us[3], 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = dt.getUTCFullYear();
    if (y >= 1900 && y <= 2100) {
      return dt.toISOString().slice(0, 10);
    }
  }
  return null;
}

function safeJson(val, fallback = null) {
  if (val === null || val === undefined) return fallback !== null ? JSON.stringify(fallback) : null;
  if (typeof val === "object") return JSON.stringify(val);
  const s = String(val).trim();
  if (!s || s === "N/A" || s === "NA" || s === "NONE" || s === "NULL" || s === "UNDEFINED") {
    return fallback !== null ? JSON.stringify(fallback) : null;
  }
  try {
    JSON.parse(s);
    return s;
  } catch (e) {
    if (Array.isArray(fallback)) {
      return JSON.stringify([s]);
    }
    return JSON.stringify(s);
  }
}

async function autoPopulateFromMaster(cleanSchoolId, masterList) {
  if (!Array.isArray(masterList) || masterList.length === 0) return;

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    // Re-check inside transaction to avoid race conditions
    const checkAgain = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM esf7_personnel_profile WHERE school_id IN ($1, $2)",
      [cleanSchoolId, `SCH-${cleanSchoolId}`]
    );
    if ((checkAgain.rows[0]?.cnt || 0) > 0) {
      await client.query("ROLLBACK");
      return;
    }

    const maxIdRes = await client.query(
      "SELECT MAX(id::bigint) AS max_id FROM esf7_personnel_profile WHERE id ~ '^[0-9]+$'"
    );
    let nextNumericId = maxIdRes.rows[0]?.max_id ? BigInt(maxIdRes.rows[0].max_id) : 843140n;

    for (let i = 0; i < masterList.length; i++) {
      const m = masterList[i];
      const seq = i + 1;
      nextNumericId += 1n;
      const newId = nextNumericId.toString();
      const newPrn = `PRN-${seq}`;
      const legacyId = m.id || m.legacy_id || `PER-${cleanSchoolId}-${String(seq).padStart(3, "0")}`;

      const fName = String(m.firstName || m.first_name || "TEACHER").toUpperCase().trim();
      const lName = String(m.lastName || m.last_name || ("STAFF " + seq)).toUpperCase().trim();
      const mName = String(m.middleName || m.middle_name || "").toUpperCase().trim() || null;
      const ext = m.nameExtension || m.name_extension || null;
      const sex = String(m.sexAtBirth || m.sex_at_birth || m.gender || "MALE").toUpperCase();
      const bDate = safeDate(m.birthdate);
      const age = m.age ? Number(m.age) : (calculateAge(bDate) || null);
      const empNo = m.employeeNo || m.employee_no || null;
      const depedEmail = m.depedEmail || m.deped_email || null;
      const isHead = Boolean(m.isSchoolHead || m.is_school_head);

      await client.query(`
        INSERT INTO esf7_personnel_profile (
          id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
          tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
          philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head,
          deleted, status, legacy_id, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26,
          false, 'canonical', $27, NOW()
        ) ON CONFLICT (id) DO NOTHING
      `, [
        newId, newPrn, cleanSchoolId, m.schoolYear || m.school_year || "SY 26-27",
        m.type || "teaching", m.salutation || "MR.", fName, mName, lName, ext,
        m.tin || null, Boolean(m.noTin || m.no_tin), sex, m.civilStatus || m.civil_status || null,
        Boolean(m.soloParent || m.solo_parent), m.religion || null, m.ethnicGroup || m.ethnic_group || null,
        bDate, age, m.philsysNo || m.philsys_no || null, Boolean(m.noPhilsys || m.no_philsys),
        empNo, depedEmail, Boolean(m.noDepedEmail || m.no_deped_email), Boolean(m.allowEmailDiscrepancy || m.allow_email_discrepancy),
        isHead, legacyId
      ]);

      await client.query(`
        INSERT INTO esf7_personnel_employment (
          id, personnel_id, position, position_category, step_increment, fund_source, nature_of_appointment,
          hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught,
          first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
        ) ON CONFLICT (personnel_id) DO NOTHING
      `, [
        `emp-${newId}`, newId, m.position || "Teacher I", m.positionCategory || m.position_category || "TEACHING",
        sanitizeStepIncrement(m.stepIncrement || m.step_increment), m.fundSource || m.fund_source || "NATIONAL",
        m.natureOfAppointment || m.nature_of_appointment || "REGULAR PERMANENT",
        m.hiringArrangement || m.hiring_arrangement || "REGULAR",
        m.deploymentStatus || m.deployment_status || "Permanent",
        m.assignedSchools || m.assigned_schools || null,
        m.gradeLevelsTaught || m.grade_levels_taught || null,
        safeDate(m.firstServiceDate || m.first_service_date),
        safeDate(m.lastPromotionDate || m.last_promotion_date),
        safeDate(m.newStationDate || m.new_station_date),
        safeDate(m.lastLateralMovementDate || m.last_lateral_movement_date)
      ]);

      const effectiveDegree = m.collegeDegree || m.college_degree || "";
      const effectiveDegrees = Array.isArray(m.collegeDegrees) 
        ? JSON.stringify(m.collegeDegrees) 
        : (effectiveDegree ? JSON.stringify([{ collegeDegree: effectiveDegree, major: m.major || "", minor: m.minor || "" }]) : "[]");

      let postGradDisc = m.postGraduateDiscipline || m.post_graduate_discipline || null;
      if (postGradDisc && typeof postGradDisc !== "object") {
        try { postGradDisc = JSON.parse(postGradDisc); } catch (e) { postGradDisc = [postGradDisc]; }
      }
      const postGradDiscJson = postGradDisc ? JSON.stringify(postGradDisc) : null;

      let elig = m.eligibility || "LET";
      if (elig && typeof elig !== "object") {
        try { elig = JSON.parse(elig); } catch (e) { elig = [elig]; }
      }
      const eligJson = JSON.stringify(Array.isArray(elig) ? elig : [elig]);

      await client.query(`
        INSERT INTO esf7_perssonel_educ (
          id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
          college_degree, college_degrees, major, minor, post_graduate_degree, post_graduate_discipline,
          eligibility, prc_specialization, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, NOW()
        ) ON CONFLICT (personnel_id) DO NOTHING
      `, [
        `edu-${newId}`, newId, m.highestEducationalAttainment || m.highest_educational_attainment || "BACCALAUREATE DEGREE",
        m.shsTrack || m.shs_track || null, m.vocationalCourse || m.vocational_course || null,
        m.vocationalLevel || m.vocational_level || null, effectiveDegree, effectiveDegrees,
        m.major || null, m.minor || null, m.postGraduateDegree || m.post_graduate_degree || null,
        postGradDiscJson,
        eligJson,
        m.prcSpecialization || m.prc_specialization || null
      ]);

      if (m.matrixData || m.matrix_data || m.learningAreas) {
        const laData = m.matrixData || m.matrix_data || m.learningAreas;
        await client.query(`
          INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, updated_at)
          VALUES ($1, $2, $3::jsonb, NOW())
          ON CONFLICT (personnel_id) DO NOTHING
        `, [`la-${newId}`, newId, JSON.stringify(laData)]);
      }
    }

    await client.query("COMMIT");
    console.log(`[Roster] Auto-populated ${masterList.length} personnel with standardized PRNs for school ${cleanSchoolId}.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Roster] Auto-population error:", err.message);
  } finally {
    client.release();
  }
}

router.get("/", async (req, res) => {
  try {
    let schoolId =
      getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id;
    if (!schoolId) {
      schoolId = "108348";
    }

    const cleanSchoolId = schoolId.replace("SCH-", "");
    const sidPair = [cleanSchoolId, `SCH-${cleanSchoolId}`];
    const timing = { start: Date.now(), master: 0, local: 0 };

    // 1. Check if school already has records in esf7_personnel_profile
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM esf7_personnel_profile WHERE school_id = ANY($1)`,
      [sidPair]
    );
    const existingCount = countRes.rows[0]?.cnt || 0;

    // Auto-populate ONLY if 0 records exist
    if (existingCount === 0) {
      console.log(`[Roster] 0 records in esf7_personnel_profile for school ${cleanSchoolId}. Auto-populating from master...`);
      const masterList = await fetchMasterPersonnelFromInsightEd(cleanSchoolId);
      if (Array.isArray(masterList) && masterList.length > 0) {
        await autoPopulateFromMaster(cleanSchoolId, masterList);
      }
    }

    // Start independent per-school lookups concurrently (previously run one after another)
    // Select only columns utilized by the UI to eliminate TOAST overhead and prevent memory bloat
    const wklPromise = db
      .query(
        `SELECT id, personnel_id, school_id, school_year, grade_level, section_id, section_name, subject, subject_id, remediation_subject, start_time, end_time, days, term FROM esf7_workload_rows WHERE school_id = ANY($1) ORDER BY created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const shsWklPromise = db
      .query(
        `SELECT id, personnel_id, school_id, school_year, grade_level, section_id, section_name, subject, subject_id, remediation_subject, start_time, end_time, days, term, semester, track, strand FROM esf7_shs_workload_rows WHERE school_id = ANY($1) ORDER BY created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const admPromise = db
      .query(
        `SELECT * FROM esf7_admin_task WHERE school_id = $1 ORDER BY created_at ASC`,
        [schoolId],
      )
      .catch(() => ({ rows: [] }));
    const trPromise = db
      .query(
        `SELECT * FROM esf7_personnel_ld_trainings WHERE school_id = ANY($1) ORDER BY created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const dsgPromise = db
      .query(
        `SELECT * FROM esf7_personnel_designations WHERE school_id = ANY($1) ORDER BY created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const delPromise = Promise.all([
      db
        .query(
          `SELECT * FROM esf7_deleted_personnel WHERE school_id = ANY($1)`,
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
      db.getStagingPool
        ? db
            .getStagingPool()
            .query(
              `SELECT * FROM esf7_deleted_personnel WHERE school_id = ANY($1)`,
              [sidPair],
            )
            .catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
    ]).then(([r1, r2]) => {
      const combined = [...(r1?.rows || []), ...(r2?.rows || [])];
      const seen = new Set();
      const deduped = [];
      for (const row of combined) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          deduped.push(row);
        }
      }
      return { rows: deduped };
    });

    // 2. Fetch locally saved records from esf7_personnel_profile
    let result = await db.query(
      `
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
        '{}'::jsonb AS employment_raw_payload,
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
        '{}'::jsonb AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        '{}'::jsonb AS la_raw_payload
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
      WHERE p.school_id = ANY($1)
      ORDER BY p.created_at ASC, p.id ASC
    `,
      [sidPair],
    );

    // 3. Fetch all workload rows for this school from esf7_workload_rows and esf7_shs_workload_rows
    const [wklRes, shsWklRes] = await Promise.all([
      wklPromise,
      typeof shsWklPromise !== "undefined"
        ? shsWklPromise
        : Promise.resolve({ rows: [] }),
    ]);

    const workloadMap = new Map();
    for (const wRow of [...wklRes.rows, ...(shsWklRes?.rows || [])]) {
      const pKey = String(wRow.personnel_id || "")
        .trim()
        .toUpperCase();
      if (!pKey) continue;
      const formattedWkl = formatWorkloadRecord(wRow);
      if (!workloadMap.has(pKey)) workloadMap.set(pKey, []);
      const existing = workloadMap.get(pKey);
      if (!existing.some((r) => r.id === wRow.id)) {
        existing.push(formattedWkl);
      }

      // Also index clean numeric key if personnel_id is PER-xxxxxx-nnn or PRN-xxxxxx-nnn
      const stripped = pKey.replace(/^PER-/, "").replace(/^PRN-/, "");
      if (stripped && stripped !== pKey) {
        if (!workloadMap.has(stripped)) workloadMap.set(stripped, []);
        const strippedExisting = workloadMap.get(stripped);
        if (!strippedExisting.some((r) => r.id === wRow.id)) {
          strippedExisting.push(formattedWkl);
        }
      }
    }

    const getWorkloadForTeacher = (id, prn, empNo, legacyId) => {
      const kId = String(id || "")
        .trim()
        .toUpperCase();
      const kLegacy = String(legacyId || "")
        .trim()
        .toUpperCase();
      const kPrn = String(prn || "")
        .trim()
        .toUpperCase();
      const kEmp = String(empNo || "")
        .trim()
        .toUpperCase();
      const direct =
        (kId && workloadMap.get(kId)) ||
        (kLegacy && workloadMap.get(kLegacy)) ||
        (kPrn && workloadMap.get(kPrn)) ||
        (kEmp && workloadMap.get(kEmp));
      if (direct && direct.length > 0) return direct;
      if (kId) {
        const stripped = kId.replace(/^PER-/, "").replace(/^PRN-/, "");
        if (stripped && workloadMap.has(stripped))
          return workloadMap.get(stripped);
      }
      if (kLegacy) {
        const stripped = kLegacy.replace(/^PER-/, "").replace(/^PRN-/, "");
        if (stripped && workloadMap.has(stripped))
          return workloadMap.get(stripped);
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
      if (!val || typeof val !== "string") return false;
      const s = val.trim().toUpperCase();
      if (
        !s ||
        s === "N/A" ||
        s === "NA" ||
        s === "NONE" ||
        s === "NULL" ||
        s === "UNDEFINED" ||
        s === "-" ||
        s === "TEACHER STAFF" ||
        s === "TEACHER" ||
        s === "STAFF"
      ) {
        return false;
      }
      return s.length >= 2;
    };

    for (const dRow of delRes.rows) {
      if (isNonGenericKey(dRow.personnel_id))
        deletedIdSet.add(String(dRow.personnel_id).trim().toUpperCase());
      if (isNonGenericKey(dRow.prn))
        deletedPrnSet.add(String(dRow.prn).trim().toUpperCase());
      if (isNonGenericKey(dRow.employee_no))
        deletedEmpNoSet.add(String(dRow.employee_no).trim().toUpperCase());
      if (
        isNonGenericKey(dRow.full_name_clean) &&
        String(dRow.full_name_clean).trim().toUpperCase() !== "TEACHER STAFF"
      ) {
        deletedNameSet.add(String(dRow.full_name_clean).trim().toUpperCase());
      }
      if (dRow.first_name && dRow.last_name) {
        const full =
          `${String(dRow.first_name).trim()} ${String(dRow.last_name).trim()}`
            .trim()
            .toUpperCase();
        if (isNonGenericKey(full) && full !== "TEACHER STAFF") {
          deletedNameSet.add(full);
        }
      }
    }

    timing.local = Date.now() - timing.start - timing.master;

    const isRecordTombstoned = (pId, pPrn, pEmp, pName) => {
      const idUpper = String(pId || "")
        .trim()
        .toUpperCase();
      const prnUpper = String(pPrn || "")
        .trim()
        .toUpperCase();
      const empUpper = String(pEmp || "")
        .trim()
        .toUpperCase();
      const nameUpper = String(pName || "")
        .trim()
        .toUpperCase();

      if (isNonGenericKey(idUpper) && deletedIdSet.has(idUpper)) return true;
      if (isNonGenericKey(prnUpper) && deletedPrnSet.has(prnUpper)) return true;
      if (isNonGenericKey(empUpper) && deletedEmpNoSet.has(empUpper))
        return true;
      if (
        isNonGenericKey(nameUpper) &&
        nameUpper !== "TEACHER STAFF" &&
        deletedNameSet.has(nameUpper)
      )
        return true;

      const stripId = idUpper.replace(/^PER-/, "").replace(/^PRN-/, "");
      if (
        stripId &&
        isNonGenericKey(stripId) &&
        (deletedIdSet.has(stripId) ||
          deletedPrnSet.has(stripId) ||
          deletedEmpNoSet.has(stripId))
      ) {
        return true;
      }
      const stripPrn = prnUpper.replace(/^PRN-/, "");
      if (
        stripPrn &&
        isNonGenericKey(stripPrn) &&
        (deletedPrnSet.has(stripPrn) ||
          deletedIdSet.has(stripPrn) ||
          deletedEmpNoSet.has(stripPrn))
      ) {
        return true;
      }

      return false;
    };

    const dbMap = new Map();
    for (const row of result.rows) {
      const pNameUpper =
        `${String(row.first_name || "").trim()} ${String(row.last_name || "").trim()}`
          .trim()
          .toUpperCase();

      // Skip locally saved records only if explicitly tombstoned by valid non-generic key
      if (isRecordTombstoned(row.id, row.prn, row.employee_no, pNameUpper)) {
        continue;
      }

      const trList =
        trainingsMap.get(String(row.id).toUpperCase()) ||
        (row.prn ? trainingsMap.get(String(row.prn).toUpperCase()) : []) ||
        [];
      const dsgList =
        designationsMap.get(String(row.id).toUpperCase()) ||
        (row.prn ? designationsMap.get(String(row.prn).toUpperCase()) : []) ||
        [];
      const wklList = getWorkloadForTeacher(row.id, row.prn, row.employee_no);
      const admList =
        adminTaskMap.get(String(row.id).toUpperCase()) ||
        (row.prn ? adminTaskMap.get(String(row.prn).toUpperCase()) : []) ||
        [];
      const formatted = formatPersonnelRecord(
        row,
        trList,
        dsgList,
        wklList,
        admList,
      );
      if (formatted.id)
        dbMap.set(String(formatted.id).toUpperCase(), formatted);
      if (formatted.prn)
        dbMap.set(String(formatted.prn).toUpperCase(), formatted);
    }

    // Populate mergedList directly from saved database records (strictly avoiding runtime merging duplicates)
    const mergedList = [];
    const seenIds = new Set();
    for (const dbRec of dbMap.values()) {
      if (!seenIds.has(dbRec.id)) {
        seenIds.add(dbRec.id);
        mergedList.push(dbRec);
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
        '{}'::jsonb AS employment_raw_payload,
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
        '{}'::jsonb AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        '{}'::jsonb AS la_raw_payload,
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
    const targetParams = [
      cleanSchoolId,
      `SCH-${cleanSchoolId}`,
      `%${cleanSchoolId}%`,
    ];
    let targetReqs = await db
      .query(targetQueryText, targetParams)
      .catch((err) => {
        console.warn("[targetReqs join warning]:", err.message);
        return { rows: [] };
      });

    if (targetReqs.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId)
        ? db.prodPool
        : db.stagingPool;
      targetReqs = await fallbackPool
        .query(targetQueryText, targetParams)
        .catch(() => ({ rows: [] }));
    }

    for (const reqRow of targetReqs.rows) {
      const targetPrn =
        reqRow.master_prn ||
        reqRow.personnel_id ||
        reqRow.extras?.prn ||
        reqRow.extras?.personnelId;
      const targetId =
        reqRow.personnel_id ||
        reqRow.master_prn ||
        `PER-${cleanSchoolId}-${targetPrn}`;
      const targetName =
        reqRow.personnel_name ||
        (reqRow.master_fn
          ? `${reqRow.master_fn} ${reqRow.master_ln}`
          : reqRow.extras?.personnelName || "SHARED TEACHER");
      const isClustered = String(reqRow.request_type || "")
        .toLowerCase()
        .includes("cluster");
      const depStatus = isClustered ? "CLUSTERED" : "BORROWED";

      const existingMatch = mergedList.find(
        (p) =>
          String(p.id).toUpperCase() === String(targetId).toUpperCase() ||
          String(p.prn).toUpperCase() === String(targetPrn).toUpperCase() ||
          `${p.firstName} ${p.lastName}`.toUpperCase() ===
            targetName.toUpperCase(),
      );

      // Fetch training & designation records for the borrowed personnel if available
      let trRows = [];
      let dsgRows = [];
      if (reqRow.master_profile_id) {
        const trRes = await db
          .query(
            `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
            [reqRow.master_profile_id],
          )
          .catch(() => ({ rows: [] }));
        trRows = trRes.rows || [];

        const dsgRes = await db
          .query(
            `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
            [reqRow.master_profile_id],
          )
          .catch(() => ({ rows: [] }));
        dsgRows = dsgRes.rows || [];
      }

      const wklList =
        workloadMap.get(String(targetId).toUpperCase()) ||
        (targetPrn ? workloadMap.get(String(targetPrn).toUpperCase()) : []) ||
        [];
      const admList =
        adminTaskMap.get(String(targetId).toUpperCase()) ||
        (targetPrn ? adminTaskMap.get(String(targetPrn).toUpperCase()) : []) ||
        [];

      if (!existingMatch) {
        if (reqRow.master_profile_id) {
          const formatted = formatPersonnelRecord(
            reqRow,
            trRows,
            dsgRows,
            wklList,
            admList,
          );
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
            workloadRows: wklList,
          });
        } else {
          const pParts = String(targetName).split(" ");
          const fName = reqRow.master_fn || pParts[0] || "TEACHER";
          const lName =
            reqRow.master_ln || pParts.slice(1).join(" ") || "STAFF";

          mergedList.push({
            id: targetId,
            prn: targetPrn,
            schoolId: cleanSchoolId,
            school_id: cleanSchoolId,
            schoolYear: "2026-2027",
            type: "teaching",
            salutation: "MR.",
            firstName: fName,
            first_name: fName,
            middleName: "",
            lastName: lName,
            last_name: lName,
            position: reqRow.master_pos || "TEACHER I",
            positionCategory: "TEACHING",
            deploymentStatus: depStatus,
            deployment_status: depStatus,
            requestType: reqRow.request_type,
            motherSchoolId: reqRow.requester_school_id,
            partnerSchoolId: reqRow.requester_school_id,
            isClustered: isClustered,
            isBorrowed: !isClustered,
            isShared: true,
            workloadRows: wklList,
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
    const motherParams = [
      cleanSchoolId,
      `SCH-${cleanSchoolId}`,
      `%${cleanSchoolId}%`,
    ];
    let motherReqs = await db
      .query(motherQueryText, motherParams)
      .catch(() => ({ rows: [] }));
    if (motherReqs.rows.length === 0) {
      const fallbackPool = db.isDivisionOrTestAccount(cleanSchoolId)
        ? db.prodPool
        : db.stagingPool;
      motherReqs = await fallbackPool
        .query(motherQueryText, motherParams)
        .catch(() => ({ rows: [] }));
    }

    for (const reqRow of motherReqs.rows) {
      const pId = reqRow.personnel_id;
      const pName = reqRow.personnel_name || "";
      const isClustered = String(reqRow.request_type || "")
        .toLowerCase()
        .includes("cluster");
      const depStatus = isClustered ? "CLUSTERED" : "REASSIGNED";

      const match = mergedList.find(
        (p) =>
          String(p.id).toUpperCase() === String(pId).toUpperCase() ||
          String(p.prn).toUpperCase() === String(pId).toUpperCase() ||
          `${p.firstName} ${p.lastName}`.toUpperCase() === pName.toUpperCase(),
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
      console.warn(
        `[Personnel Timing] school ${cleanSchoolId} slow: total=${timing.total}ms master=${timing.master}ms local=${timing.local}ms rows=${mergedList.length}`,
      );
    }

    const total = mergedList.length;
    if (req.query.page || req.query.limit) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(req.query.limit, 10) || 100),
      );
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedList = mergedList.slice(startIndex, startIndex + limit);

      return res.json({
        data: paginatedList,
        total,
        page,
        limit,
        totalPages,
      });
    }

    res.json({
      data: mergedList,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
    });
  } catch (err) {
    console.error("Error fetching personnel profiles:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/personnel/autofill-template


/**
 * POST /bulk
 * Saves / commits all active personnel on the roster into esf7_personnel_profile
 * (Triggered on 'ADD PERSONNEL' or when user clicks 'SAVE')
 * Strictly without raw_payload.
 */
router.post("/bulk", async (req, res) => {
  const client = await db.pool.connect();
  try {
    const schoolId =
      getSchoolIdFromRequest(req) ||
      req.body.schoolId ||
      req.body.school_id ||
      "108348";
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
    const schoolYear = req.body.schoolYear || req.body.school_year || "SY 26-27";
    const personnelList = req.body.personnelList || req.body.personnel || [];

    if (!Array.isArray(personnelList) || personnelList.length === 0) {
      return res.json({ success: true, count: 0, message: "No personnel to save." });
    }

    await client.query("BEGIN");
    let savedCount = 0;

    const maxIdRes = await client.query(
      "SELECT MAX(id::bigint) AS max_id FROM esf7_personnel_profile WHERE id ~ '^[0-9]+$'"
    );
    let nextNumericId = maxIdRes.rows[0]?.max_id ? BigInt(maxIdRes.rows[0].max_id) : 843140n;

    // Determine next sequential PRN for this school (PRN-1, PRN-2, ..., PRN-N)
    const maxPrnRes = await client.query(
      `SELECT COALESCE(MAX(SUBSTRING(prn FROM 5)::integer), 0) AS max_prn 
       FROM esf7_personnel_profile 
       WHERE school_id = ANY($1) AND prn ~ '^PRN-[0-9]+$'`,
      [[cleanSchoolId, `SCH-${cleanSchoolId}`]]
    );
    let nextPrnSeq = (maxPrnRes.rows[0]?.max_prn || 0) + 1;

    const updatedPersonnelList = [];

    for (let idx = 0; idx < personnelList.length; idx++) {
      const p = personnelList[idx];
      const seq = idx + 1;

      // 1. Deterministic Identity Resolution: Find existing teacher in this school
      const matched = await resolvePersonnelIdentity(client, cleanSchoolId, p);

      let pId = null;
      let prn = null;

      if (matched) {
        // Teacher exists: preserve their canonical database ID and PRN
        pId = matched.id;
        prn = matched.prn || formatCanonicalPrn(p.prn);
      } else {
        // Genuinely brand-new teacher: assign standardized numeric ID and sequential PRN
        nextNumericId += 1n;
        pId = nextNumericId.toString();
        prn = formatCanonicalPrn(p.prn, nextPrnSeq++);
      }

      const fName = String(p.firstName || p.first_name || p.first || "TEACHER").toUpperCase().trim();
      const lName = String(p.lastName || p.last_name || p.last || ("STAFF " + seq)).toUpperCase().trim();
      const mName = String(p.middleName || p.middle_name || p.middle || "").toUpperCase().trim() || null;
      const ext = p.nameExtension || p.name_extension || null;
      const salutation = String(p.salutation || "MR.").toUpperCase();
      const pType = String(p.type || "teaching").toLowerCase();
      const sex = String(p.sexAtBirth || p.sex_at_birth || p.gender || "MALE").toUpperCase();
      const bDate = safeDate(p.birthdate);
      const age = p.age ? Number(p.age) : (calculateAge(bDate) || null);
      const tin = p.tin || null;
      const noTin = Boolean(p.noTin || p.no_tin);
      const civilStatus = p.civilStatus || p.civil_status || null;
      const soloParent = Boolean(p.soloParent || p.solo_parent);
      const religion = p.religion || null;
      const ethnic = p.ethnicGroup || p.ethnic_group || null;
      const philsys = p.philsysNo || p.philsys_no || null;
      const noPhilsys = Boolean(p.noPhilsys || p.no_philsys);
      const empNo = p.employeeNo || p.employee_no || null;
      const depedEmail = p.depedEmail || p.deped_email || null;
      const noEmail = Boolean(p.noDepedEmail || p.no_deped_email);
      const allowDisc = Boolean(p.allowEmailDiscrepancy || p.allow_email_discrepancy);
      const isHead = Boolean(p.isSchoolHead || p.is_school_head);
      const legacyId = p.legacyId || p.legacy_id || p.id || pId;

      // 2. Upsert esf7_personnel_profile
      await client.query(`
        INSERT INTO esf7_personnel_profile (
          id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
          tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
          philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head,
          deleted, status, legacy_id, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26,
          false, 'canonical', $27, NOW()
        )
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
          deleted = false,
          updated_at = NOW();
      `, [
        pId, prn, cleanSchoolId, schoolYear, pType, salutation,
        fName, mName, lName, ext, tin, noTin, sex,
        civilStatus, soloParent, religion, ethnic, bDate, age,
        philsys, noPhilsys, empNo, depedEmail, noEmail,
        allowDisc, isHead, legacyId
      ]);

      // 3. Upsert esf7_personnel_employment
      const pos = p.position || p.plantilla_position || p.position_title || "Teacher I";
      const posCat = p.positionCategory || p.position_category || "TEACHING";
      const step = sanitizeStepIncrement(p.stepIncrement || p.step_increment);
      const fund = p.fundSource || p.fund_source || "NATIONAL";
      const appt = p.natureOfAppointment || p.nature_of_appointment || "REGULAR PERMANENT";
      const hiring = p.hiringArrangement || p.hiring_arrangement || "REGULAR";
      const depStatus = p.deploymentStatus || p.deployment_status || "Permanent";
      const assignedSchoolsJson = safeJson(p.assignedSchools || p.assigned_schools, []);
      const gradeLevelsTaughtJson = safeJson(p.gradeLevelsTaught || p.grade_levels_taught || p.assignedGradeLevels || p.assigned_grade_levels, []);
      const firstServiceDate = safeDate(p.firstServiceDate || p.first_service_date);
      const lastPromotionDate = safeDate(p.lastPromotionDate || p.last_promotion_date);
      const newStationDate = safeDate(p.newStationDate || p.new_station_date);
      const lastLateralMovementDate = safeDate(p.lastLateralMovementDate || p.last_lateral_movement_date);

      await client.query(`
        INSERT INTO esf7_personnel_employment (
          id, personnel_id, position_category, position, step_increment,
          fund_source, nature_of_appointment, hiring_arrangement, deployment_status,
          assigned_schools, grade_levels_taught, first_service_date, last_promotion_date,
          new_station_date, last_lateral_movement_date, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, NOW()
        )
        ON CONFLICT (personnel_id) DO UPDATE SET
          position_category = EXCLUDED.position_category,
          position = EXCLUDED.position,
          step_increment = EXCLUDED.step_increment,
          fund_source = EXCLUDED.fund_source,
          nature_of_appointment = EXCLUDED.nature_of_appointment,
          hiring_arrangement = EXCLUDED.hiring_arrangement,
          deployment_status = EXCLUDED.deployment_status,
          assigned_schools = COALESCE(EXCLUDED.assigned_schools, esf7_personnel_employment.assigned_schools),
          grade_levels_taught = COALESCE(EXCLUDED.grade_levels_taught, esf7_personnel_employment.grade_levels_taught),
          first_service_date = COALESCE(EXCLUDED.first_service_date, esf7_personnel_employment.first_service_date),
          last_promotion_date = COALESCE(EXCLUDED.last_promotion_date, esf7_personnel_employment.last_promotion_date),
          new_station_date = COALESCE(EXCLUDED.new_station_date, esf7_personnel_employment.new_station_date),
          last_lateral_movement_date = COALESCE(EXCLUDED.last_lateral_movement_date, esf7_personnel_employment.last_lateral_movement_date),
          updated_at = NOW();
      `, [
        `emp-${pId}`, pId, posCat, pos, step, fund, appt, hiring, depStatus,
        assignedSchoolsJson,
        gradeLevelsTaughtJson,
        firstServiceDate, lastPromotionDate, newStationDate, lastLateralMovementDate
      ]);

      // 4. Upsert esf7_perssonel_educ
      const effectiveDegree = p.collegeDegree || p.college_degree || "";
      const degreesFallback = effectiveDegree ? [{ collegeDegree: effectiveDegree, major: p.major || "", minor: p.minor || "" }] : [];
      const degreesJson = safeJson(p.collegeDegrees || p.degreeRows, degreesFallback);
      const postGradJson = safeJson(p.postGraduateDiscipline || p.post_graduate_discipline, { masters: [], doctorate: [] });
      const eligibilityJson = safeJson(p.eligibility, ["LET"]);

      await client.query(`
        INSERT INTO esf7_perssonel_educ (
          id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
          college_degree, college_degrees, major, minor, post_graduate_degree, post_graduate_discipline,
          eligibility, prc_specialization, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, NOW()
        )
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
          updated_at = NOW();
      `, [
        `edu-${pId}`, pId,
        p.highestEducationalAttainment || p.highest_educational_attainment || "BACCALAUREATE DEGREE",
        p.shsTrack || p.shs_track || null,
        p.vocationalCourse || p.vocational_course || null,
        p.vocationalLevel || p.vocational_level || null,
        effectiveDegree, degreesJson,
        p.major || null, p.minor || null,
        p.postGraduateDegree || p.post_graduate_degree || null,
        postGradJson,
        eligibilityJson,
        p.prcSpecialization || p.prc_specialization || null
      ]);

      // 5. Upsert esf7_personnel_learning_areas (if provided)
      if (p.matrixData || p.matrix_data || p.learningAreas || p.learningAreaMap) {
        const laJson = safeJson(p.matrixData || p.matrix_data || p.learningAreas || p.learningAreaMap, {});
        await client.query(`
          INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, updated_at)
          VALUES ($1, $2, $3::jsonb, NOW())
          ON CONFLICT (personnel_id) DO UPDATE SET
            matrix_data = EXCLUDED.matrix_data,
            updated_at = NOW();
        `, [`la-${pId}`, pId, laJson]);
      }

      // 6. Upsert esf7_personnel_allowances (default standard DepEd allowances if missing)
      await client.query(`
        INSERT INTO esf7_personnel_allowances (
          id, personnel_id, school_id, school_year,
          has_pera, pera_amount, has_uniform, uniform_amount,
          has_supplies, supplies_amount, has_medical, medical_amount,
          has_hardship, hardship_amount, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, NOW()
        )
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
          updated_at = NOW();
      `, [
        `alw-${pId}`, pId, cleanSchoolId, schoolYear,
        p.hasPera !== false, Number(p.peraAmount || 2000),
        p.hasUniform !== false, Number(p.uniformAmount || 7000),
        p.hasSupplies !== false, Number(p.suppliesAmount || 5000),
        p.hasMedical !== false, Number(p.medicalAmount || 10000),
        Boolean(p.hasHardship), Number(p.hardshipAmount || 0)
      ]);

      savedCount++;
      updatedPersonnelList.push({
        ...p,
        id: pId,
        prn: prn,
        schoolId: cleanSchoolId,
        school_id: cleanSchoolId,
        schoolYear: schoolYear,
        school_year: schoolYear,
      });
    }

    await client.query("COMMIT");
    res.json({
      success: true,
      count: savedCount,
      personnel: updatedPersonnelList,
      message: `Successfully saved ${savedCount} personnel into esf7_personnel_profile.`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in POST /api/personnel/bulk:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/personnel/:id/school-head — Dedicated endpoint to toggle or designate a School Head
router.put("/:id/school-head", async (req, res) => {
  const targetId = String(req.params.id || "").trim();
  const schoolId =
    getSchoolIdFromRequest(req) ||
    req.query.schoolId ||
    req.query.school_id ||
    req.body?.schoolId ||
    req.body?.school_id ||
    "";
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
  const isSchoolHead = Boolean(req.body?.isSchoolHead);

  try {
    const sidPair = cleanSchoolId ? [cleanSchoolId, `SCH-${cleanSchoolId}`] : [];

    const executeToggle = async (pool) => {
      if (!pool || !pool.query) return;
      try {
        await pool.query("BEGIN");

        // 1. If designating as School Head, unset any existing School Head for this school
        if (isSchoolHead && sidPair.length > 0) {
          await pool.query(
            "UPDATE esf7_personnel_profile SET is_school_head = FALSE WHERE school_id = ANY($1)",
            [sidPair],
          );
        }

        // 2. Update the target personnel in esf7_personnel_profile
        await pool.query(
          "UPDATE esf7_personnel_profile SET is_school_head = $1 WHERE id = $2 OR legacy_id = $2 OR prn = $2",
          [isSchoolHead, targetId],
        );

        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK").catch(() => {});
        throw err;
      }
    };

    await executeToggle(db);
    if (db.getStagingPool) await executeToggle(db.getStagingPool());
    if (db.getProdPool) await executeToggle(db.getProdPool());

    res.json({
      success: true,
      id: targetId,
      isSchoolHead,
      message: isSchoolHead ? "School Head designated." : "School Head designation removed.",
    });
  } catch (err) {
    console.error("Error in PUT /api/personnel/:id/school-head:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const targetId = String(req.params.id || "").trim();
  const schoolId =
    getSchoolIdFromRequest(req) ||
    req.query.schoolId ||
    req.query.school_id ||
    req.body?.schoolId ||
    req.body?.school_id ||
    "";
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();

  try {
    // A. Query existing details to construct persistent tombstone
    let existingRec = null;
    const profRes = await db
      .query(`SELECT * FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1`, [
        targetId,
      ])
      .catch(() => ({ rows: [] }));

    if (profRes.rows.length > 0) {
      existingRec = profRes.rows[0];
    }

    const sid = String(existingRec?.school_id || cleanSchoolId || "")
      .replace(/^SCH-/i, "")
      .trim();
    let fName =
      existingRec?.first_name ||
      req.body?.firstName ||
      req.query?.firstName ||
      "";
    let lName =
      existingRec?.last_name || req.body?.lastName || req.query?.lastName || "";
    let prn = existingRec?.prn || req.body?.prn || req.query?.prn || targetId;
    let empNo =
      existingRec?.employee_no ||
      req.body?.employeeNo ||
      req.query?.employeeNo ||
      "";

    // If details not in esf7_personnel_profile, check master table for accurate names/PRN
    if ((!fName || !lName) && sid) {
      const isTest =
        db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(sid);
      const tbl = isTest ? "esf7_database_dummy" : "esf7_database";
      const mRes = await (db.insightEdPool || db)
        .query(
          `SELECT * FROM ${tbl} WHERE (school_id = $1 OR schoool_id = $1) AND (id::text = $2 OR employee_no = $2)`,
          [sid, targetId],
        )
        .catch(() => ({ rows: [] }));

      if (mRes.rows.length > 0) {
        const mRow = mRes.rows[0];
        fName = mRow.first_name || mRow.first || fName;
        lName = mRow.last_name || mRow.last || lName;
        prn = mRow.prn || prn;
        empNo = mRow.employee_no || empNo;
      }
    }

    const isNonGenericVal = (val) => {
      if (!val || typeof val !== "string") return false;
      const s = val.trim().toUpperCase();
      if (
        !s ||
        s === "N/A" ||
        s === "NA" ||
        s === "NONE" ||
        s === "NULL" ||
        s === "UNDEFINED" ||
        s === "-" ||
        s === "TEACHER STAFF" ||
        s === "TEACHER" ||
        s === "STAFF"
      ) {
        return false;
      }
      return s.length >= 2;
    };

    const cleanFullName =
      `${String(fName || "").trim()} ${String(lName || "").trim()}`
        .trim()
        .toUpperCase();
    const validTargetId = isNonGenericVal(targetId) ? targetId : null;
    const validPrn = isNonGenericVal(prn) ? prn : null;
    const validEmpNo = isNonGenericVal(empNo) ? empNo : null;
    const validName =
      isNonGenericVal(cleanFullName) && cleanFullName !== "TEACHER STAFF"
        ? cleanFullName
        : null;

    // B. Record in esf7_deleted_personnel across BOTH pools
    if (sid && (validTargetId || validPrn || validEmpNo || validName)) {
      const tombstoneId = `DEL-${sid}-${String(validPrn || validTargetId || Math.random().toString(36).substring(2, 9)).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const recordTombstone = async (pool) => {
        if (!pool || !pool.query) return;
        await pool
          .query(
            `
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
        `,
            [
              tombstoneId,
              sid,
              validTargetId,
              validPrn,
              validEmpNo,
              validName ? String(fName).toUpperCase() : null,
              validName ? String(lName).toUpperCase() : null,
              validName,
            ],
          )
          .catch((e) => {
            console.warn("[Tombstone Record Notice]:", e.message);
          });
      };

      await recordTombstone(db);
      if (db.getStagingPool) await recordTombstone(db.getStagingPool());
      if (db.getProdPool) await recordTombstone(db.getProdPool());
    }

    
    // Flag deleted = true in esf7_database for old personnel
    try {
      const matchCriteria = [];
      const matchParams = [sid];
      let pCounter = 2;

      if (validTargetId) {
        matchCriteria.push("(id::text = $" + pCounter + " OR employee_no = $" + pCounter + ")");
        matchParams.push(validTargetId);
        pCounter++;
      }
      if (validEmpNo && validEmpNo !== validTargetId) {
        matchCriteria.push("employee_no = $" + pCounter);
        matchParams.push(validEmpNo);
        pCounter++;
      }
      if (fName && lName) {
        matchCriteria.push("(UPPER(TRIM(first)) = $" + pCounter + " AND UPPER(TRIM(last)) = $" + (pCounter + 1) + ")");
        matchParams.push(String(fName).trim().toUpperCase(), String(lName).trim().toUpperCase());
        pCounter += 2;
      }

      if (matchCriteria.length > 0) {
        const updateSql = "UPDATE esf7_database SET deleted = true WHERE (school_id = $1 OR schoool_id = $1) AND (" + matchCriteria.join(" OR ") + ")";
        await (db.insightEdPool || db).query(updateSql, matchParams).catch(() => {});
        await db.query(updateSql, matchParams).catch(() => {});
        console.log("[Roster Delete] Flagged deleted = true in esf7_database for " + (cleanFullName || targetId));
      }
    } catch (e) {
      console.warn("[esf7_database update warning]:", e.message);
    }

    // Execute cascade cleanups across BOTH pools
    const executeCascadeDeletes = async (pool) => {
      if (!pool || !pool.query) return;
      await Promise.all([
        pool
          .query(
            `UPDATE esf7_class_sections SET advisor_id = NULL WHERE advisor_id = $1`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_workload_rows WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_trainings WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_designations WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_extra_tasks WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_allowances WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_overload_late_undertime WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_overload_no_work WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_employment WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_education WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_learning_areas WHERE personnel_id = $1 OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE prn = $1)`,
            [targetId],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1`,
            [targetId],
          )
          .catch(() => {}),
      ]);
    };

    await executeCascadeDeletes(db);
    if (db.getStagingPool) await executeCascadeDeletes(db.getStagingPool());
    if (db.getProdPool) await executeCascadeDeletes(db.getProdPool());

    res.json({
      success: true,
      count: 1,
      message: `Personnel profile ${targetId} and all linked records deleted successfully.`,
    });
  } catch (err) {
    console.error("Error deleting personnel:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
