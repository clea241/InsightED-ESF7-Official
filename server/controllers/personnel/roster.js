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
  safeCoerceDate,
  sanitizeGradeArray,
} = require("./common");

router.get("/", async (req, res) => {
  try {
    let schoolId =
      getSchoolIdFromRequest(req) || req.query.schoolId || req.query.school_id;
    if (!schoolId) {
      schoolId = "108348";
    }

    const cleanSchoolId = schoolId.replace("SCH-", "");

    const timing = { start: Date.now() };

    // 1. Fetch master records from insightEd database
    const masterList = await fetchMasterPersonnelFromInsightEd(cleanSchoolId);
    timing.master = Date.now() - timing.start;

    // Start independent per-school lookups concurrently (previously run one after another)
    // Select only columns utilized by the UI to eliminate TOAST overhead and prevent memory bloat
    const sidPair = [cleanSchoolId, `SCH-${cleanSchoolId}`];
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
        `SELECT t.* FROM esf7_personnel_ld_trainings t
         JOIN esf7_personnel_profile p ON p.id = t.personnel_id
         WHERE p.school_id = ANY($1) ORDER BY t.created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const dsgPromise = db
      .query(
        `SELECT * FROM esf7_personnel_designations WHERE school_id = ANY($1) ORDER BY created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const delPromise = Promise.resolve({ rows: [] });

    // 2. Fetch locally saved records from esf7_personnel_profile
    let result = await db.query(
      `
      SELECT 
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment,
        e.actual_step,
        e.school_reported_step,
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

    const normalizePrnKey = (prn) => {
      if (!prn) return "";
      const s = String(prn).trim().toUpperCase();
      const m = s.match(/^PRN-0*(\d+)$/);
      if (m) return `PRN-${parseInt(m[1], 10)}`;
      const mDigits = s.match(/^0*(\d+)$/);
      if (mDigits) return `PRN-${parseInt(mDigits[1], 10)}`;
      return s;
    };

    const normalizeNameKey = (first, last) => {
      const f = String(first || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");
      const l = String(last || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");
      if (!f && !l) return "";
      return `${f}__${l}`;
    };

    const dbById = new Map();
    const dbByLegacyId = new Map();
    const dbByPrn = new Map();
    const dbByEmpNo = new Map();
    const dbByName = new Map();
    const dbList = [];

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
      const wklList = getWorkloadForTeacher(
        row.id,
        row.prn,
        row.employee_no,
        row.legacy_id,
      );
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

      dbList.push(formatted);
      if (formatted.id) {
        const uId = String(formatted.id).trim().toUpperCase();
        dbById.set(uId, formatted);
        const stripped = uId.replace(/^PER-/, "").replace(/^PRN-/, "");
        if (stripped && stripped !== uId) {
          dbById.set(stripped, formatted);
          const parts = stripped.split("-");
          if (parts.length > 1) {
            dbById.set(parts[parts.length - 1], formatted);
          }
        }
      }
      if (row.legacy_id || formatted.legacy_id || formatted.legacyId) {
        const leg = String(
          row.legacy_id || formatted.legacy_id || formatted.legacyId,
        )
          .trim()
          .toUpperCase();
        dbByLegacyId.set(leg, formatted);
        const strippedLeg = leg.replace(/^PER-/, "").replace(/^PRN-/, "");
        if (strippedLeg && strippedLeg !== leg) {
          dbByLegacyId.set(strippedLeg, formatted);
        }
      }
      if (formatted.prn) {
        dbByPrn.set(String(formatted.prn).trim().toUpperCase(), formatted);
        dbByPrn.set(normalizePrnKey(formatted.prn), formatted);
      }
      if (row.employee_no || formatted.employeeNo || formatted.employee_no) {
        const emp = String(
          row.employee_no || formatted.employeeNo || formatted.employee_no,
        )
          .trim()
          .toUpperCase();
        dbByEmpNo.set(emp, formatted);
      }
      const nKey = normalizeNameKey(
        formatted.firstName || formatted.first_name,
        formatted.lastName || formatted.last_name,
      );
      if (nKey) {
        dbByName.set(nKey, formatted);
      }
    }

    // Filter master list against persistent tombstones
    const filteredMasterList = masterList.filter((m) => {
      const mName =
        `${String(m.first_name || m.firstName || "").trim()} ${String(m.last_name || m.lastName || "").trim()}`
          .trim()
          .toUpperCase();
      return !isRecordTombstoned(
        m.id,
        m.prn,
        m.employee_no || m.employeeNo,
        mName,
      );
    });

    const mergedList = [];
    const usedDbIds = new Set();

    // Overlay master records with DB saved records where available
    for (const m of filteredMasterList) {
      const idKey = String(m.id || "")
        .trim()
        .toUpperCase();
      const prnKey = String(m.prn || "")
        .trim()
        .toUpperCase();
      const normPrn = normalizePrnKey(m.prn);
      const empKey = String(m.employee_no || m.employeeNo || "")
        .trim()
        .toUpperCase();
      const nameKey = normalizeNameKey(
        m.firstName || m.first_name,
        m.lastName || m.last_name,
      );

      const dbMatch =
        (idKey &&
          (dbById.get(idKey) ||
            dbByLegacyId.get(idKey) ||
            dbByEmpNo.get(idKey))) ||
        (prnKey && dbByPrn.get(prnKey)) ||
        (normPrn && dbByPrn.get(normPrn)) ||
        (empKey && dbByEmpNo.get(empKey)) ||
        (nameKey && dbByName.get(nameKey));

      if (dbMatch) {
        usedDbIds.add(String(dbMatch.id).trim().toUpperCase());

        const isDbMatchPlaceholder =
          dbMatch.firstName === "TEACHER" &&
          String(dbMatch.lastName || "").startsWith("STAFF") &&
          m.firstName !== "TEACHER";

        const savedWkl = getWorkloadForTeacher(
          dbMatch.id || m.id,
          dbMatch.prn || m.prn,
          dbMatch.employee_no || m.employee_no || m.employeeNo,
          dbMatch.legacy_id || m.legacyId || m.id,
        );
        const resolvedWkl =
          Array.isArray(dbMatch.workloadRows) && dbMatch.workloadRows.length > 0
            ? dbMatch.workloadRows
            : savedWkl.length > 0
              ? savedWkl
              : Array.isArray(m.workloadRows)
                ? m.workloadRows
                : [];

        const mergedRecord = isDbMatchPlaceholder
          ? {
              ...dbMatch,
              ...m,
              id: dbMatch.id,
              legacyId: dbMatch.legacyId || m.id,
              legacy_id: dbMatch.legacy_id || m.id,
              prn: dbMatch.prn || m.prn,
              firstName: m.firstName || m.first_name,
              first_name: m.first_name || m.firstName,
              lastName: m.lastName || m.last_name,
              last_name: m.last_name || m.lastName,
              middleName: m.middleName || m.middle_name || dbMatch.middleName,
              middle_name: m.middle_name || m.middleName || dbMatch.middle_name,
              position: m.position || dbMatch.position,
              plantilla_position:
                m.plantilla_position || dbMatch.plantilla_position,
              position_title: m.position_title || dbMatch.position_title,
              type: m.type || dbMatch.type,
              positionCategory: m.positionCategory || dbMatch.positionCategory,
              position_category:
                m.position_category || dbMatch.position_category,
              sexAtBirth: m.sexAtBirth || dbMatch.sexAtBirth,
              sex_at_birth: m.sex_at_birth || dbMatch.sex_at_birth,
              birthdate: m.birthdate || dbMatch.birthdate,
              age: m.age || dbMatch.age,
              collegeDegree: m.collegeDegree || dbMatch.collegeDegree,
              college_degree: m.college_degree || dbMatch.college_degree,
              major: m.major || dbMatch.major,
              minor: m.minor || dbMatch.minor || "N/A",
              highestEducationalAttainment:
                m.highestEducationalAttainment ||
                dbMatch.highestEducationalAttainment,
              highest_educational_attainment:
                m.highest_educational_attainment ||
                dbMatch.highest_educational_attainment,
              degreeRows:
                Array.isArray(m.degreeRows) && m.degreeRows.length > 0
                  ? m.degreeRows
                  : dbMatch.degreeRows || [],
              collegeDegrees:
                Array.isArray(m.collegeDegrees) && m.collegeDegrees.length > 0
                  ? m.collegeDegrees
                  : dbMatch.collegeDegrees || [],
              prcSpecialization:
                m.prcSpecialization || dbMatch.prcSpecialization,
              prc_specialization:
                m.prc_specialization || dbMatch.prc_specialization,
              eligibility:
                Array.isArray(m.eligibility) && m.eligibility.length > 0
                  ? m.eligibility
                  : dbMatch.eligibility,
              workloadRows: resolvedWkl,
              designations:
                Array.isArray(dbMatch.designations) &&
                dbMatch.designations.length > 0
                  ? dbMatch.designations
                  : m.designations || [],
              trainings:
                Array.isArray(dbMatch.trainings) && dbMatch.trainings.length > 0
                  ? dbMatch.trainings
                  : m.trainings || [],
            }
          : {
              ...m,
              ...dbMatch,
              // Explicitly ensure dbMatch values win over m for all profile fields
              firstName:
                dbMatch.firstName ||
                dbMatch.first_name ||
                m.firstName ||
                m.first_name,
              first_name:
                dbMatch.first_name ||
                dbMatch.firstName ||
                m.first_name ||
                m.firstName,
              lastName:
                dbMatch.lastName ||
                dbMatch.last_name ||
                m.lastName ||
                m.last_name,
              last_name:
                dbMatch.last_name ||
                dbMatch.lastName ||
                m.last_name ||
                m.lastName,
              middleName:
                dbMatch.middleName !== undefined
                  ? dbMatch.middleName
                  : m.middleName || m.middle_name || "",
              middle_name:
                dbMatch.middle_name !== undefined
                  ? dbMatch.middle_name
                  : m.middle_name || m.middleName || "",
              nameExtension:
                dbMatch.nameExtension !== undefined
                  ? dbMatch.nameExtension
                  : m.nameExtension || m.name_extension || "",
              name_extension:
                dbMatch.name_extension !== undefined
                  ? dbMatch.name_extension
                  : m.name_extension || m.nameExtension || "",
              sexAtBirth:
                dbMatch.sexAtBirth ||
                dbMatch.sex_at_birth ||
                m.sexAtBirth ||
                m.sex_at_birth ||
                "",
              sex_at_birth:
                dbMatch.sex_at_birth ||
                dbMatch.sexAtBirth ||
                m.sex_at_birth ||
                m.sexAtBirth ||
                "",
              birthdate: dbMatch.birthdate || m.birthdate || null,
              age:
                dbMatch.age !== null && dbMatch.age !== undefined
                  ? dbMatch.age
                  : m.age,
              civilStatus:
                dbMatch.civilStatus ||
                dbMatch.civil_status ||
                m.civilStatus ||
                m.civil_status ||
                "",
              civil_status:
                dbMatch.civil_status ||
                dbMatch.civilStatus ||
                m.civil_status ||
                m.civilStatus ||
                "",
              tin: dbMatch.tin !== undefined ? dbMatch.tin : m.tin || "",
              noTin:
                dbMatch.noTin !== undefined ? dbMatch.noTin : m.noTin || false,
              philsysNo:
                dbMatch.philsysNo !== undefined
                  ? dbMatch.philsysNo
                  : m.philsysNo || "",
              noPhilsys:
                dbMatch.noPhilsys !== undefined
                  ? dbMatch.noPhilsys
                  : m.noPhilsys || false,
              depedEmail:
                dbMatch.depedEmail !== undefined
                  ? dbMatch.depedEmail
                  : m.depedEmail || m.deped_email || "",
              deped_email:
                dbMatch.deped_email !== undefined
                  ? dbMatch.deped_email
                  : m.deped_email || m.depedEmail || "",
              noDepedEmail:
                dbMatch.noDepedEmail !== undefined
                  ? dbMatch.noDepedEmail
                  : m.noDepedEmail || false,
              position: dbMatch.position || m.position || "",
              position_title:
                dbMatch.position_title ||
                dbMatch.position ||
                m.position_title ||
                m.position ||
                "",
              positionCategory:
                dbMatch.positionCategory ||
                dbMatch.position_category ||
                m.positionCategory ||
                m.position_category ||
                "TEACHING",
              position_category:
                dbMatch.position_category ||
                dbMatch.positionCategory ||
                m.position_category ||
                m.positionCategory ||
                "TEACHING",
              stepIncrement:
                dbMatch.stepIncrement ||
                dbMatch.step_increment ||
                m.stepIncrement ||
                m.step_increment ||
                1,
              step_increment:
                dbMatch.step_increment ||
                dbMatch.stepIncrement ||
                m.step_increment ||
                m.stepIncrement ||
                1,
              fundSource:
                dbMatch.fundSource ||
                dbMatch.fund_source ||
                m.fundSource ||
                m.fund_source ||
                "",
              fund_source:
                dbMatch.fund_source ||
                dbMatch.fundSource ||
                m.fund_source ||
                m.fundSource ||
                "",
              natureOfAppointment:
                dbMatch.natureOfAppointment ||
                dbMatch.nature_of_appointment ||
                m.natureOfAppointment ||
                m.nature_of_appointment ||
                "",
              nature_of_appointment:
                dbMatch.nature_of_appointment ||
                dbMatch.natureOfAppointment ||
                m.nature_of_appointment ||
                m.natureOfAppointment ||
                "",
              hiringArrangement:
                dbMatch.hiringArrangement ||
                dbMatch.hiring_arrangement ||
                m.hiringArrangement ||
                m.hiring_arrangement ||
                "",
              hiring_arrangement:
                dbMatch.hiring_arrangement ||
                dbMatch.hiringArrangement ||
                m.hiring_arrangement ||
                m.hiringArrangement ||
                "",
              deploymentStatus:
                dbMatch.deploymentStatus ||
                dbMatch.deployment_status ||
                m.deploymentStatus ||
                m.deployment_status ||
                "OWN STATION",
              deployment_status:
                dbMatch.deployment_status ||
                dbMatch.deploymentStatus ||
                m.deployment_status ||
                m.deploymentStatus ||
                "OWN STATION",
              assignedSchools: Array.isArray(dbMatch.assignedSchools)
                ? dbMatch.assignedSchools
                : Array.isArray(dbMatch.assigned_schools)
                  ? dbMatch.assigned_schools
                  : m.assignedSchools || [],
              assigned_schools: Array.isArray(dbMatch.assigned_schools)
                ? dbMatch.assigned_schools
                : Array.isArray(dbMatch.assignedSchools)
                  ? dbMatch.assignedSchools
                  : m.assigned_schools || [],
              gradeLevelsTaught: Array.isArray(dbMatch.gradeLevelsTaught)
                ? dbMatch.gradeLevelsTaught
                : m.gradeLevelsTaught || [],
              grade_levels_taught: Array.isArray(dbMatch.grade_levels_taught)
                ? dbMatch.grade_levels_taught
                : m.grade_levels_taught || [],
              collegeDegree:
                dbMatch.collegeDegree ||
                dbMatch.college_degree ||
                m.collegeDegree ||
                m.college_degree ||
                "",
              college_degree:
                dbMatch.college_degree ||
                dbMatch.collegeDegree ||
                m.college_degree ||
                m.collegeDegree ||
                "",
              major:
                dbMatch.major !== undefined ? dbMatch.major : m.major || "",
              minor:
                dbMatch.minor !== undefined ? dbMatch.minor : m.minor || "N/A",
              highestEducationalAttainment:
                dbMatch.highestEducationalAttainment ||
                dbMatch.highest_educational_attainment ||
                m.highestEducationalAttainment ||
                m.highest_educational_attainment ||
                "",
              highest_educational_attainment:
                dbMatch.highest_educational_attainment ||
                dbMatch.highestEducationalAttainment ||
                m.highest_educational_attainment ||
                m.highestEducationalAttainment ||
                "",
              degreeRows:
                Array.isArray(dbMatch.degreeRows) &&
                dbMatch.degreeRows.length > 0
                  ? dbMatch.degreeRows
                  : m.degreeRows || [],
              collegeDegrees:
                Array.isArray(dbMatch.collegeDegrees) &&
                dbMatch.collegeDegrees.length > 0
                  ? dbMatch.collegeDegrees
                  : m.collegeDegrees || [],
              prcSpecialization:
                dbMatch.prcSpecialization ||
                dbMatch.prc_specialization ||
                m.prcSpecialization ||
                m.prc_specialization ||
                "",
              prc_specialization:
                dbMatch.prc_specialization ||
                dbMatch.prcSpecialization ||
                m.prc_specialization ||
                m.prcSpecialization ||
                "",
              eligibility:
                Array.isArray(dbMatch.eligibility) &&
                dbMatch.eligibility.length > 0
                  ? dbMatch.eligibility
                  : Array.isArray(m.eligibility)
                    ? m.eligibility
                    : [],
              workloadRows: resolvedWkl,
              designations:
                Array.isArray(dbMatch.designations) &&
                dbMatch.designations.length > 0
                  ? dbMatch.designations
                  : m.designations || [],
              trainings:
                Array.isArray(dbMatch.trainings) && dbMatch.trainings.length > 0
                  ? dbMatch.trainings
                  : m.trainings || [],
              position_title:
                dbMatch.position_title || m.position_title || m.position,
              collegeDegree:
                dbMatch.collegeDegree ||
                dbMatch.college_degree ||
                m.collegeDegree ||
                m.college_degree ||
                "",
              college_degree:
                dbMatch.college_degree ||
                dbMatch.collegeDegree ||
                m.college_degree ||
                m.collegeDegree ||
                "",
              major: dbMatch.major || m.major || "",
              minor: dbMatch.minor || m.minor || "N/A",
              highestEducationalAttainment:
                dbMatch.highestEducationalAttainment ||
                dbMatch.highest_educational_attainment ||
                m.highestEducationalAttainment ||
                m.highest_educational_attainment ||
                "",
              highest_educational_attainment:
                dbMatch.highest_educational_attainment ||
                dbMatch.highestEducationalAttainment ||
                m.highest_educational_attainment ||
                m.highestEducationalAttainment ||
                "",
              degreeRows:
                Array.isArray(dbMatch.degreeRows) &&
                dbMatch.degreeRows.length > 0
                  ? dbMatch.degreeRows
                  : m.degreeRows || [],
              collegeDegrees:
                Array.isArray(dbMatch.collegeDegrees) &&
                dbMatch.collegeDegrees.length > 0
                  ? dbMatch.collegeDegrees
                  : m.collegeDegrees || [],
              prcSpecialization:
                dbMatch.prcSpecialization ||
                dbMatch.prc_specialization ||
                m.prcSpecialization ||
                m.prc_specialization ||
                "",
              prc_specialization:
                dbMatch.prc_specialization ||
                dbMatch.prcSpecialization ||
                m.prc_specialization ||
                m.prcSpecialization ||
                "",
              workloadRows: resolvedWkl,
            };

        mergedList.push(mergedRecord);
      } else {
        const mWkl = getWorkloadForTeacher(
          m.id,
          m.prn,
          m.employee_no || m.employeeNo,
          m.legacyId || m.legacy_id || m.id,
        );
        if (mWkl && mWkl.length > 0) {
          m.workloadRows = mWkl;
        }
        mergedList.push(m);
      }
    }

    // Append any DB rows that were not part of the master list (e.g. manually added teachers)
    for (const dbRec of dbList) {
      const recId = String(dbRec.id).trim().toUpperCase();
      if (!usedDbIds.has(recId)) {
        mergedList.push(dbRec);
        usedDbIds.add(recId);
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
        e.actual_step,
        e.school_reported_step,
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
      const targetPrn = reqRow.master_prn || reqRow.personnel_id;
      const targetId =
        reqRow.personnel_id ||
        reqRow.master_prn ||
        `PER-${cleanSchoolId}-${targetPrn}`;
      const targetName =
        reqRow.personnel_name ||
        (reqRow.master_fn
          ? `${reqRow.master_fn} ${reqRow.master_ln}`
          : "SHARED TEACHER");
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

    // Final defensive deduplication pass by unique ID and normalized full name
    const dedupedMergedList = [];
    const seenFinalIds = new Set();
    const seenFinalNames = new Set();
    for (const p of mergedList) {
      const pId = p.id ? String(p.id).trim().toUpperCase() : null;
      const nKey = normalizeNameKey(
        p.firstName || p.first_name,
        p.lastName || p.last_name,
      );
      if (pId && seenFinalIds.has(pId)) continue;
      if (nKey && seenFinalNames.has(nKey)) continue;
      if (pId) seenFinalIds.add(pId);
      dedupedMergedList.push(p);
    }

    const {
      loadSchoolNormalizedData,
    } = require("../../services/personnelSharedReader");
    const normalizedSchoolData = await loadSchoolNormalizedData(
      db,
      cleanSchoolId,
    );

    for (const p of dedupedMergedList) {
      const norm = normalizedSchoolData.getForTeacher(
        p.id,
        p.prn,
        p.employeeNo || p.employee_no,
        p.legacyId || p.legacy_id,
      );
      p.neapTrainingRows = norm.neapTrainingRows;
      p.certificationRows = norm.certificationRows;
      p.otherTrainingRows = norm.otherTrainingRows;
      p.learningAreaMap = norm.learningAreaMap;
      p.matrix_data = norm.matrix_data;
    }

    const total = dedupedMergedList.length;
    if (req.query.page || req.query.limit) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(req.query.limit, 10) || 100),
      );
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedList = dedupedMergedList.slice(
        startIndex,
        startIndex + limit,
      );

      return res.json({
        data: paginatedList,
        total,
        page,
        limit,
        totalPages,
      });
    }

    res.json({
      data: dedupedMergedList,
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
// POST /api/personnel/bulk
// Set-based upsert: ONE lookup of the school's existing people, then multi-row
// INSERT ... ON CONFLICT DO UPDATE in chunks, in ONE short transaction. Rows whose data did not
// change are skipped by the ON CONFLICT ... WHERE ... IS DISTINCT FROM guard (no new row version,
// no index churn). A per-school+year advisory lock rejects a concurrent duplicate save.
const BULK_CHUNK = 50;

const PROFILE_COLS = [
  "id",
  "prn",
  "school_id",
  "school_year",
  "type",
  "salutation",
  "first_name",
  "middle_name",
  "last_name",
  "name_extension",
  "tin",
  "no_tin",
  "sex_at_birth",
  "civil_status",
  "solo_parent",
  "religion",
  "ethnic_group",
  "birthdate",
  "age",
  "philsys_no",
  "no_philsys",
  "employee_no",
  "deped_email",
  "no_deped_email",
  "allow_email_discrepancy",
  "is_school_head",
  "is_main_sh",
  "legacy_id",
];
// Columns the upsert may change (everything except the key); used for the skip-if-unchanged guard.
// is_school_head / is_main_sh are NOT in this list on purpose: a bulk roster save (which can replay an old
// outbox copy) must never flip who the School Head is. New rows still get the flags on INSERT; existing rows
// change them only through PUT /school-head-config or PUT /:id/school-head.
const PROFILE_UPDATE_COLS = PROFILE_COLS.filter(
  (c) =>
    c !== "id" &&
    c !== "legacy_id" &&
    c !== "is_school_head" &&
    c !== "is_main_sh",
);

const EMP_COLS = [
  "id",
  "personnel_id",
  "position_category",
  "position",
  "step_increment",
  "actual_step",
  "school_reported_step",
  "fund_source",
  "nature_of_appointment",
  "hiring_arrangement",
  "deployment_status",
  "assigned_schools",
  "grade_levels_taught",
  "first_service_date",
  "last_promotion_date",
  "new_station_date",
  "last_lateral_movement_date",
];
const EMP_JSONB = new Set(["assigned_schools", "grade_levels_taught"]);

const multiValues = (rows, cols, jsonb = new Set()) => {
  const params = [];
  const tuples = rows.map((row) => {
    const ph = cols.map((c) => {
      params.push(row[c]);
      return `$${params.length}${jsonb.has(c) ? "::jsonb" : ""}`;
    });
    return `(${ph.join(", ")}, NOW())`;
  });
  return { params, tuples };
};

router.post("/bulk", async (req, res) => {
  const schoolId =
    getSchoolIdFromRequest(req) ||
    req.body.schoolId ||
    req.body.school_id ||
    "108348";
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
  const schoolYear = req.body.schoolYear || req.body.school_year || "SY 26-27";
  const personnelList = req.body.personnelList || req.body.personnel || [];

  if (!Array.isArray(personnelList) || personnelList.length === 0) {
    return res.json({
      success: true,
      count: 0,
      message: "No personnel to save.",
    });
  }

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    // Single-flight per school + year: a concurrent duplicate is rejected, not queued behind
    // the same rows (that is what produced lock waits and statement timeouts).
    const lockRes = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
      [`personnel_bulk:${cleanSchoolId}:${schoolYear}`],
    );
    if (!lockRes.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error:
          "A roster save for this school and school year is already in progress. Please wait for it to finish.",
      });
    }

    // One lookup of the school's existing people (uses the school_id index) instead of one
    // SELECT per person.
    const existingRes = await client.query(
      `SELECT id, prn, legacy_id, first_name, last_name
         FROM esf7_personnel_profile
        WHERE school_id = ANY($1)`,
      [[cleanSchoolId, `SCH-${cleanSchoolId}`]],
    );
    const byId = new Map();
    const byPrn = new Map();
    const byName = new Map();
    for (const r of existingRes.rows) {
      byId.set(String(r.id), r);
      if (r.legacy_id) byId.set(String(r.legacy_id), r);
      if (r.prn) byPrn.set(String(r.prn), r);
      byName.set(`${r.first_name}|${r.last_name}`, r);
    }

    const needsNewId = (p) => {
      const pid = p.id;
      return (
        !pid ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          pid,
        ) ||
        String(pid).startsWith("PER-") ||
        String(pid).startsWith("local-p-") ||
        !/^\d+$/.test(String(pid))
      );
    };
    const nameKey = (p, seq) => {
      const fName = String(p.firstName || p.first_name || p.first || "TEACHER")
        .toUpperCase()
        .trim();
      const lName = String(
        p.lastName || p.last_name || p.last || "STAFF " + seq,
      )
        .toUpperCase()
        .trim();
      return { fName, lName };
    };
    const findExisting = (p, fName, lName) =>
      byId.get(String(p.id || "")) ||
      (p.prn ? byPrn.get(String(p.prn)) : undefined) ||
      byName.get(`${fName}|${lName}`);

    // New people need ids from the shared numeric counter. Allocate under a short global
    // advisory lock so two concurrent saves cannot hand out the same id.
    const anyNew = personnelList.some((p, i) => {
      const { fName, lName } = nameKey(p, i + 1);
      return !findExisting(p, fName, lName) && needsNewId(p);
    });
    let nextNumericId = 843140n;
    if (anyNew) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "personnel_id_alloc",
      ]);
      const maxIdRes = await client.query(
        "SELECT MAX(id::bigint) AS max_id FROM esf7_personnel_profile WHERE id ~ '^[0-9]+$'",
      );
      if (maxIdRes.rows[0]?.max_id) {
        nextNumericId = BigInt(maxIdRes.rows[0].max_id);
      }
    }

    const crypto = require("crypto");
    const profileById = new Map(); // last occurrence of an id wins (ON CONFLICT cannot hit a row twice)
    const empById = new Map();

    for (let idx = 0; idx < personnelList.length; idx++) {
      const p = personnelList[idx];
      const seq = idx + 1;
      const { fName, lName } = nameKey(p, seq);
      const mName =
        String(p.middleName || p.middle_name || p.middle || "")
          .toUpperCase()
          .trim() || null;
      const ext = p.nameExtension || p.name_extension || null;

      const existing = findExisting(p, fName, lName);
      let pId = p.id;
      let prn = null;
      if (existing) {
        pId = existing.id;
        prn = existing.prn || formatCanonicalPrn(p.prn, seq);
      } else {
        if (needsNewId(p)) {
          nextNumericId += 1n;
          pId = nextNumericId.toString();
        }
        prn = formatCanonicalPrn(p.prn, seq);
      }
      pId = String(pId);

      const salutation = String(p.salutation || "MR.").toUpperCase();
      const pType = String(p.type || "teaching").toLowerCase();
      const sex = String(
        p.sexAtBirth || p.sex_at_birth || p.gender || "MALE",
      ).toUpperCase();
      const bDate = p.birthdate || null;
      const age = p.age ? Number(p.age) : calculateAge(bDate) || null;
      const rawCivil = String(p.civilStatus || p.civil_status || "").trim();
      const rawEth = String(p.ethnicGroup || p.ethnic_group || "").trim();
      const rawPhilSys = String(p.philsysNo || p.philsys_no || "").trim();
      const noPhilsys = Boolean(p.noPhilsys || p.no_philsys) || !rawPhilSys;
      const isHead = Boolean(p.isSchoolHead || p.is_school_head);
      const isMainSh = isHead
        ? Boolean(
            p.isMainSchoolHead !== undefined
              ? p.isMainSchoolHead
              : p.is_main_sh !== undefined
                ? p.is_main_sh
                : p.isMainHead !== undefined
                  ? p.isMainHead
                  : true,
          )
        : false;

      profileById.set(pId, {
        id: pId,
        prn,
        school_id: cleanSchoolId,
        school_year: schoolYear,
        type: pType,
        salutation,
        first_name: fName,
        middle_name: mName,
        last_name: lName,
        name_extension: ext,
        tin: p.tin || null,
        no_tin: Boolean(p.noTin || p.no_tin),
        sex_at_birth: sex,
        civil_status: rawCivil ? rawCivil.toUpperCase() : "SINGLE",
        solo_parent: Boolean(p.soloParent || p.solo_parent),
        religion: p.religion || null,
        ethnic_group: rawEth ? rawEth.toUpperCase() : null,
        birthdate: bDate,
        age,
        philsys_no: noPhilsys ? null : rawPhilSys || null,
        no_philsys: noPhilsys,
        employee_no: p.employeeNo || p.employee_no || null,
        deped_email: p.depedEmail || p.deped_email || null,
        no_deped_email: Boolean(p.noDepedEmail || p.no_deped_email),
        allow_email_discrepancy: Boolean(
          p.allowEmailDiscrepancy || p.allow_email_discrepancy,
        ),
        is_school_head: isHead,
        is_main_sh: isMainSh,
        legacy_id: p.legacyId || p.legacy_id || pId,
      });

      const pos =
        p.position || p.plantilla_position || p.position_title || "TEACHER I";
      const isCook = String(pos).toUpperCase().trim() === "COOK";
      const step = sanitizeStepIncrement(p.stepIncrement || p.step_increment);
      let fund = (
        p.fundSource ||
        p.fund_source ||
        (isCook ? "SBFP" : "NATIONAL")
      ).toUpperCase();
      if (!isCook && fund === "SBFP") fund = "NATIONAL";
      empById.set(pId, {
        id: crypto.randomUUID(),
        personnel_id: pId,
        position_category: isCook
          ? "NON-TEACHING"
          : p.positionCategory || p.position_category || "TEACHING",
        position: pos,
        step_increment: step,
        actual_step: sanitizeStepIncrement(
          p.actualStep || p.actual_step || step,
        ),
        school_reported_step: sanitizeStepIncrement(
          p.schoolReportedStep || p.school_reported_step || step,
        ),
        fund_source: fund,
        nature_of_appointment: (
          p.natureOfAppointment ||
          p.nature_of_appointment ||
          (isCook ? "CONTRACTUAL" : "REGULAR PERMANENT")
        ).toUpperCase(),
        hiring_arrangement: (
          p.hiringArrangement ||
          p.hiring_arrangement ||
          (isCook ? "CONTRACTUAL" : "REGULAR")
        ).toUpperCase(),
        deployment_status: (
          p.deploymentStatus ||
          p.deployment_status ||
          "OWN STATION"
        ).toUpperCase(),
        assigned_schools: JSON.stringify(
          p.assignedSchools || p.assigned_schools || [],
        ),
        grade_levels_taught: JSON.stringify(
          sanitizeGradeArray(
            p.assignedGradeLevels ||
              p.assigned_grade_levels ||
              p.gradeLevelsTaught ||
              p.grade_levels_taught ||
              [],
          ),
        ),
        first_service_date: safeCoerceDate(
          p.firstServiceDate || p.first_service_date,
          "first_service_date",
        ),
        last_promotion_date: safeCoerceDate(
          p.lastPromotionDate || p.last_promotion_date,
          "last_promotion_date",
        ),
        new_station_date: safeCoerceDate(
          p.newStationDate || p.new_station_date,
          "new_station_date",
        ),
        last_lateral_movement_date: safeCoerceDate(
          p.lastLateralMovementDate || p.last_lateral_movement_date,
          "last_lateral_movement_date",
        ),
      });
    }

    // Non-heads first so a head hand-over inside one batch never trips the one-head-per-school index.
    const profileRows = [...profileById.values()].sort(
      (a, b) => Number(a.is_school_head) - Number(b.is_school_head),
    );
    const empRows = [...empById.values()];

    const profileSet = PROFILE_UPDATE_COLS.map(
      (c) => `${c} = EXCLUDED.${c}`,
    ).join(", ");
    const profileCmpOld = PROFILE_UPDATE_COLS.map(
      (c) => `esf7_personnel_profile.${c}`,
    ).join(", ");
    const profileCmpNew = PROFILE_UPDATE_COLS.map((c) => `EXCLUDED.${c}`).join(
      ", ",
    );

    let changed = 0;
    for (let i = 0; i < profileRows.length; i += BULK_CHUNK) {
      const { params, tuples } = multiValues(
        profileRows.slice(i, i + BULK_CHUNK),
        PROFILE_COLS,
      );
      const r = await client.query(
        `INSERT INTO esf7_personnel_profile (${PROFILE_COLS.join(", ")}, updated_at)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (id) DO UPDATE SET ${profileSet}, deleted = false, updated_at = NOW()
         WHERE (${profileCmpOld}) IS DISTINCT FROM (${profileCmpNew})
            OR esf7_personnel_profile.deleted IS DISTINCT FROM false`,
        params,
      );
      changed += r.rowCount || 0;
    }

    for (let i = 0; i < empRows.length; i += BULK_CHUNK) {
      const { params, tuples } = multiValues(
        empRows.slice(i, i + BULK_CHUNK),
        EMP_COLS,
        EMP_JSONB,
      );
      const r = await client.query(
        `INSERT INTO esf7_personnel_employment (${EMP_COLS.join(", ")}, updated_at)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (personnel_id) DO UPDATE SET
           position_category = EXCLUDED.position_category,
           position = EXCLUDED.position,
           step_increment = EXCLUDED.step_increment,
           actual_step = COALESCE(EXCLUDED.actual_step, esf7_personnel_employment.actual_step),
           school_reported_step = COALESCE(EXCLUDED.school_reported_step, esf7_personnel_employment.school_reported_step),
           fund_source = EXCLUDED.fund_source,
           nature_of_appointment = EXCLUDED.nature_of_appointment,
           hiring_arrangement = EXCLUDED.hiring_arrangement,
           deployment_status = COALESCE(EXCLUDED.deployment_status, esf7_personnel_employment.deployment_status),
           assigned_schools = CASE WHEN EXCLUDED.assigned_schools::text != '[]' THEN EXCLUDED.assigned_schools ELSE esf7_personnel_employment.assigned_schools END,
           grade_levels_taught = CASE WHEN EXCLUDED.grade_levels_taught::text != '[]' THEN EXCLUDED.grade_levels_taught ELSE esf7_personnel_employment.grade_levels_taught END,
           first_service_date = COALESCE(EXCLUDED.first_service_date, esf7_personnel_employment.first_service_date),
           last_promotion_date = COALESCE(EXCLUDED.last_promotion_date, esf7_personnel_employment.last_promotion_date),
           new_station_date = COALESCE(EXCLUDED.new_station_date, esf7_personnel_employment.new_station_date),
           last_lateral_movement_date = COALESCE(EXCLUDED.last_lateral_movement_date, esf7_personnel_employment.last_lateral_movement_date),
           updated_at = NOW()
         WHERE (
           esf7_personnel_employment.position_category, esf7_personnel_employment.position,
           esf7_personnel_employment.step_increment, esf7_personnel_employment.actual_step,
           esf7_personnel_employment.school_reported_step, esf7_personnel_employment.fund_source,
           esf7_personnel_employment.nature_of_appointment, esf7_personnel_employment.hiring_arrangement,
           esf7_personnel_employment.deployment_status, esf7_personnel_employment.assigned_schools::text,
           esf7_personnel_employment.grade_levels_taught::text, esf7_personnel_employment.first_service_date,
           esf7_personnel_employment.last_promotion_date, esf7_personnel_employment.new_station_date,
           esf7_personnel_employment.last_lateral_movement_date
         ) IS DISTINCT FROM (
           EXCLUDED.position_category, EXCLUDED.position, EXCLUDED.step_increment,
           EXCLUDED.actual_step, EXCLUDED.school_reported_step, EXCLUDED.fund_source,
           EXCLUDED.nature_of_appointment, EXCLUDED.hiring_arrangement, EXCLUDED.deployment_status,
           EXCLUDED.assigned_schools::text, EXCLUDED.grade_levels_taught::text, EXCLUDED.first_service_date,
           EXCLUDED.last_promotion_date, EXCLUDED.new_station_date, EXCLUDED.last_lateral_movement_date
         )`,
        params,
      );
      changed += r.rowCount || 0;
    }

    await client.query("COMMIT");

    // Verify: every person that was sent must now exist in the table. Success is never claimed on a guess.
    const sentIds = profileRows.map((r) => r.id);
    const stored = await db.query(
      "SELECT id FROM esf7_personnel_profile WHERE id = ANY($1::text[])",
      [sentIds],
    );
    const storedIds = new Set(stored.rows.map((r) => String(r.id)));
    const notStored = sentIds.filter((id) => !storedIds.has(String(id)));
    if (notStored.length > 0) {
      throw new Error(
        `The roster was not stored as requested (${notStored.length} record(s) missing after saving).`,
      );
    }

    try {
      const roomProfiling = require("../room_profiling");
      if (typeof roomProfiling.invalidateRosterCache === "function") {
        roomProfiling.invalidateRosterCache(cleanSchoolId);
      }
    } catch (_) {}

    res.json({
      success: true,
      count: profileRows.length,
      changed,
      message:
        "Successfully saved " +
        profileRows.length +
        " personnel into esf7_personnel_profile.",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error in POST /api/personnel/bulk:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---- School Head ----------------------------------------------------------------------------------
// Both routes are one atomic write that is read back and verified before they answer (see schoolHeads.js).
const schoolHeads = require("./schoolHeads");

const schoolOf = (req) =>
  schoolHeads.cleanSid(
    getSchoolIdFromRequest(req) ||
      req.query?.schoolId ||
      req.query?.school_id ||
      req.body?.schoolId ||
      req.body?.school_id,
  );

// PUT /api/personnel/school-head-config — the Change School Head dialog. Replaces the school's head(s) in one go:
// the previous head is unset and the new one set in the same transaction.
router.put("/school-head-config", async (req, res) => {
  try {
    const body = req.body || {};
    const hasMultipleHeads = Boolean(body.hasMultipleHeads);
    const assignments =
      body.assignments && typeof body.assignments === "object"
        ? body.assignments
        : {};
    const mainHeadId = body.mainHeadId ? String(body.mainHeadId) : null;

    const requested = new Map(); // personnel ref -> level
    for (const [level, ref] of Object.entries(assignments)) {
      if (ref) requested.set(String(ref), hasMultipleHeads ? level : null);
    }
    if (mainHeadId && !requested.has(mainHeadId))
      requested.set(mainHeadId, null);
    if (!hasMultipleHeads && requested.size > 1) {
      return res
        .status(400)
        .json({ error: "Only one School Head can be designated." });
    }

    const result = await schoolHeads.writeSchoolHeads(schoolOf(req), {
      setHeads: [...requested.entries()].map(([id, level]) => ({
        id,
        level,
        isMain: hasMultipleHeads ? String(mainHeadId) === id : true,
      })),
      clearOthers: true,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    if (!err.status) console.error("PUT /personnel/school-head-config:", err);
    return schoolHeads.sendError(res, err, req);
  }
});

// PUT /api/personnel/:id/school-head — set or remove ONE person as School Head.
router.put("/:id/school-head", async (req, res) => {
  const targetId = String(req.params.id || "").trim();
  try {
    const isSchoolHead = Boolean(
      req.body?.isSchoolHead ?? req.body?.is_school_head,
    );
    const hasMultipleHeads = Boolean(req.body?.hasMultipleHeads);
    const isMain = isSchoolHead
      ? Boolean(req.body?.isMainSh ?? req.body?.is_main_sh ?? true)
      : false;
    const level =
      req.body?.schoolHeadLevel || req.body?.school_head_level || null;

    const result = isSchoolHead
      ? await schoolHeads.writeSchoolHeads(schoolOf(req), {
          setHeads: [{ id: targetId, isMain, level }],
          clearOthers: !hasMultipleHeads,
          clearMainOthers: hasMultipleHeads && isMain,
        })
      : await schoolHeads.writeSchoolHeads(schoolOf(req), {
          unsetIds: [targetId],
        });
    res.json({
      success: true,
      id: targetId,
      isSchoolHead,
      isMainSh: isMain,
      heads: result.heads,
      message: isSchoolHead
        ? "School Head designated."
        : "School Head designation removed.",
    });
  } catch (err) {
    if (!err.status) console.error("PUT /personnel/:id/school-head:", err);
    return schoolHeads.sendError(res, err, req);
  }
});

// Tables that reference a person. Both lists are applied in ONE statement inside the delete
// transaction (see DELETE /:id). Columns/tables missing from a given database are skipped.
const CASCADE_UNLINK = [
  ["esf7_regular_sections", ["adviser_id"]],
  ["esf7_sned_sections", ["adviser_id"]],
  ["esf7_als_sections", ["adviser_id"]],
  ["esf7_aral_sections", ["tutor_id"]],
  ["esf7_remedial_enrichment_sections", ["assigned_teacher_id"]],
  ["esf7_workload_transfer", ["absent_personnel_id", "relieving_personnel_id"]],
];
const CASCADE_DELETE = [
  ...[
    "esf7_workload_rows",
    "esf7_workload_row",
    "esf7_shs_workload_rows",
    "esf7_admin_task",
    "esf7_related_task",
    "esf7_personnel_employment",
    "esf7_personnel_education",
    "esf7_personnel_educ",
    "esf7_perssonel_educ",
    "esf7_personnel_learning_areas",
    "esf7_personnel_learning_area",
    "esf7_personnel_ld_trainings",
    "esf7_personnel_trainings",
    "esf7_personnel_ld",
    "esf7_personnel_l&d",
    "esf7_personnel_designations",
    "esf7_personnel_designation",
    "esf7_personnel_extra_tasks",
    "esf7_personnel_allowances",
    "esf7_personnel_allowance",
    "esf7_overload_late_undertime",
    "overload_late_undertime",
    "esf7_overload_no_work",
    "overload_absences",
    "overload_pay_and_reason",
    "esf7_work_immersion",
    "esf7_personnel_node_status",
    "esf7_room_submissions_staging",
    "esf7_personnel_submission",
    "esf7_requests",
  ].map((t) => [t, ["personnel_id"]]),
  ["clustered_personnel", ["prn"]],
  ["esf7_personnel_id_mapping", ["legacy_id", "new_id"]],
];

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
      .query(
        `SELECT * FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1`,
        [targetId],
      )
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
      const mPool = db.insightEdPool || db;
      const mRes = isTest
        ? await mPool
            .query(
              `SELECT * FROM esf7_database_dummy WHERE (school_id = $1 OR schoool_id = $1) AND (id::text = $2 OR employee_no = $2)`,
              [sid, targetId],
            )
            .catch(() => ({ rows: [] }))
        : await mPool
            .query(
              `SELECT * FROM esf7_database WHERE (school_id = $1 OR schoool_id = $1) AND (id::text = $2 OR employee_no = $2)`,
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

    const validTargetId = isNonGenericVal(targetId) ? targetId : null;
    const validPrn = isNonGenericVal(prn) ? prn : null;
    const validEmpNo = isNonGenericVal(empNo) ? empNo : null;
    const allPersonnelIds = Array.from(
      new Set(
        [
          targetId,
          existingRec?.id != null ? String(existingRec.id) : null,
          existingRec?.legacy_id ? String(existingRec.legacy_id) : null,
          existingRec?.prn ? String(existingRec.prn) : null,
          validPrn ? String(validPrn) : null,
          validEmpNo ? String(validEmpNo) : null,
          validTargetId ? String(validTargetId) : null,
        ].filter(Boolean),
      ),
    );

    // Execute cascade cleanups across ALL pools
    // One transaction on ONE pooled client, released in `finally`. Only 4 round trips:
    // BEGIN, one schema lookup, ONE statement that unlinks references, deletes every child row and
    // finally the parent profile (data-modifying CTEs), then COMMIT. The response is sent only after
    // COMMIT, so a refresh right after the success can never still see the person.
    const executeCascadeDeletes = async (acquireClient) => {
      if (!allPersonnelIds || allPersonnelIds.length === 0) return 0;
      const client = await acquireClient();
      try {
        await client.query("BEGIN");

        // Which of the optional / legacy tables and columns exist in this database.
        const wanted = new Set([
          ...CASCADE_UNLINK.map(([t]) => t),
          ...CASCADE_DELETE.map(([t]) => t),
        ]);
        const colRes = await client.query(
          `SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = ANY(current_schemas(false)) AND table_name = ANY($1::text[])`,
          [[...wanted]],
        );
        const have = new Set(
          colRes.rows.map((r) => `${r.table_name}.${r.column_name}`),
        );
        const quote = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

        const ctes = [];
        for (const [table, cols] of CASCADE_UNLINK) {
          const live = cols.filter((c) => have.has(`${table}.${c}`));
          if (live.length === 0) continue;
          const sets = live
            .map(
              (c) =>
                `${quote(c)} = CASE WHEN ${quote(c)} = ANY($1::text[]) THEN NULL ELSE ${quote(c)} END`,
            )
            .join(", ");
          const where = live
            .map((c) => `${quote(c)} = ANY($1::text[])`)
            .join(" OR ");
          ctes.push(`UPDATE ${quote(table)} SET ${sets} WHERE ${where}`);
        }
        for (const [table, cols] of CASCADE_DELETE) {
          const live = cols.filter((c) => have.has(`${table}.${c}`));
          if (live.length === 0) continue;
          const where = live
            .map((c) => `${quote(c)} = ANY($1::text[])`)
            .join(" OR ");
          ctes.push(`DELETE FROM ${quote(table)} WHERE ${where}`);
        }

        const withClause =
          ctes.length > 0
            ? `WITH ${ctes.map((sql, i) => `c${i} AS (${sql})`).join(", ")} `
            : "";
        const result = await client.query(
          `${withClause}DELETE FROM esf7_personnel_profile
            WHERE id::text = ANY($1::text[]) OR legacy_id = ANY($1::text[]) OR prn = ANY($1::text[])
        RETURNING id`,
          [allPersonnelIds],
        );
        await client.query("COMMIT");
        return result.rowCount || 0;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    };

    // Request-scoped primary pool first, then any distinct explicit pool (staging/prod).
    const deletedProfiles = await executeCascadeDeletes(() => db.getClient());
    const primaryPool =
      process.env.NODE_ENV === "production" ? db.getProdPool() : db.getPool();
    const extraPools = new Set(
      [db.getStagingPool(), db.getProdPool()].filter(
        (pl) => pl && pl !== primaryPool,
      ),
    );
    for (const extra of extraPools) {
      await executeCascadeDeletes(() => extra.connect());
    }

    // Verify: nothing with any of this person's ids may be left in the profile table.
    const leftover = await db.query(
      `SELECT id FROM esf7_personnel_profile
        WHERE id::text = ANY($1::text[]) OR legacy_id = ANY($1::text[]) OR prn = ANY($1::text[])`,
      [allPersonnelIds],
    );
    if (leftover.rows.length > 0) {
      throw new Error(
        "The personnel record is still in the database after the delete, so it was not removed.",
      );
    }

    try {
      const roomProfiling = require("../room_profiling");
      if (typeof roomProfiling.invalidateRosterCache === "function") {
        roomProfiling.invalidateRosterCache(sid || cleanSchoolId);
      }
    } catch (_) {}

    res.json({
      success: true,
      count: 1,
      deletedProfiles,
      deletedIds: allPersonnelIds,
      message: `Personnel profile ${targetId} and all linked records deleted successfully.`,
    });
  } catch (err) {
    console.error("Error deleting personnel:", err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
