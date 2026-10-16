const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const {
  sanitizeStepIncrement,
  calculateAge,
  formatWorkloadRecord,
  formatDesignationRecord,
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
        `SELECT d.*, p.prn AS p_prn, p.legacy_id AS p_legacy_id FROM esf7_personnel_designations d
         LEFT JOIN esf7_personnel_profile p ON p.id = d.personnel_id
         WHERE d.school_id = ANY($1) OR p.school_id = ANY($1)
         ORDER BY d.created_at ASC`,
        [sidPair],
      )
      .catch(() => ({ rows: [] }));
    const delPromise = db
      .query(`SELECT * FROM esf7_deleted_personnel WHERE school_id = ANY($1)`, [
        sidPair,
      ])
      .catch(() => ({ rows: [] }));

    // 1. Fetch locally saved records from esf7_personnel_profile first
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
      WHERE (
        p.school_id = ANY($1) 
        OR TRIM(p.school_id) = ANY($1) 
        OR REPLACE(UPPER(TRIM(p.school_id)), 'SCH-', '') = $2
      ) AND (p.deleted IS FALSE OR p.deleted IS NULL)
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC, p.id ASC
    `,
      [sidPair, cleanSchoolId],
    );

    // 2. Fetch master records from esf7_database / dummy so unprofiled faculty are never lost
    const delRes = await delPromise;
    const masterStart = Date.now();
    const masterList = await fetchMasterPersonnelFromInsightEd(
      cleanSchoolId,
    ).catch((err) => {
      console.warn("[Master Personnel Fetch Warning]:", err.message);
      return [];
    });
    timing.master = Date.now() - masterStart;

    // 3. Fetch all workload rows for this school from esf7_workload_rows and esf7_shs_workload_rows
    const [wklRes, shsWklRes] = await Promise.all([
      wklPromise,
      typeof shsWklPromise !== "undefined"
        ? shsWklPromise
        : Promise.resolve({ rows: [] }),
    ]);

    const workloadMap = new Map();
    const getSlotSig = (r) =>
      `${r.term || "1st"}|${r.startTime || ""}|${r.endTime || ""}|${String(
        r.sectionName || "",
      )
        .trim()
        .toUpperCase()}|${String(r.subject || "")
        .trim()
        .toUpperCase()}`;
    for (const wRow of [...wklRes.rows, ...(shsWklRes?.rows || [])]) {
      const pKey = String(wRow.personnel_id || "")
        .trim()
        .toUpperCase();
      if (!pKey) continue;
      const formattedWkl = formatWorkloadRecord(wRow);
      const slotSig = getSlotSig(formattedWkl);
      if (!workloadMap.has(pKey)) workloadMap.set(pKey, []);
      const existing = workloadMap.get(pKey);
      if (
        !existing.some((r) => r.id === wRow.id || getSlotSig(r) === slotSig)
      ) {
        existing.push(formattedWkl);
      }

      // Also index clean numeric key if personnel_id is PER-xxxxxx-nnn or PRN-xxxxxx-nnn
      const stripped = pKey.replace(/^PER-/, "").replace(/^PRN-/, "");
      if (stripped && stripped !== pKey) {
        if (!workloadMap.has(stripped)) workloadMap.set(stripped, []);
        const strippedExisting = workloadMap.get(stripped);
        if (
          !strippedExisting.some(
            (r) => r.id === wRow.id || getSlotSig(r) === slotSig,
          )
        ) {
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
      if (dRow.p_prn) {
        const prnKey = String(dRow.p_prn).toUpperCase();
        if (!designationsMap.has(prnKey)) designationsMap.set(prnKey, []);
        if (!designationsMap.get(prnKey).includes(dRow))
          designationsMap.get(prnKey).push(dRow);
      }
      if (dRow.p_legacy_id) {
        const legKey = String(dRow.p_legacy_id).toUpperCase();
        if (!designationsMap.has(legKey)) designationsMap.set(legKey, []);
        if (!designationsMap.get(legKey).includes(dRow))
          designationsMap.get(legKey).push(dRow);
      }
    }

    // Build persistent deletion tombstone sets (strictly filter out generic/placeholder keys)
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
      if (isNonGenericKey(dRow.personnel_id)) {
        const idUpper = String(dRow.personnel_id).trim().toUpperCase();
        deletedIdSet.add(idUpper);
        const bare = idUpper
          .replace(/^PER-/, "")
          .replace(/^PRN-/, "")
          .replace(/^0+/, "");
        if (bare) {
          deletedIdSet.add(bare);
          deletedPrnSet.add(bare);
        }
      }
      if (isNonGenericKey(dRow.prn)) {
        const pUpper = String(dRow.prn).trim().toUpperCase();
        deletedPrnSet.add(pUpper);
        const bare = pUpper.replace(/^PRN-/, "").replace(/^0+/, "");
        if (bare) {
          deletedPrnSet.add(bare);
          deletedPrnSet.add(`PRN-${bare}`);
          deletedPrnSet.add(`PRN-${bare.padStart(3, "0")}`);
          deletedPrnSet.add(`PRN-${bare.padStart(7, "0")}`);
        }
      }
      if (isNonGenericKey(dRow.employee_no)) {
        const empUpper = String(dRow.employee_no).trim().toUpperCase();
        deletedEmpNoSet.add(empUpper);
        const bareDigits = empUpper.replace(/\D/g, "");
        if (bareDigits) deletedEmpNoSet.add(bareDigits);
      }
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
        .toUpperCase()
        .replace(/\s+/g, " ");

      if (isNonGenericKey(idUpper) && deletedIdSet.has(idUpper)) return true;
      if (isNonGenericKey(prnUpper) && deletedPrnSet.has(prnUpper)) return true;
      if (isNonGenericKey(empUpper) && deletedEmpNoSet.has(empUpper))
        return true;

      // Name tombstone check: if the name is explicitly tombstoned, it was deleted by the user
      if (
        isNonGenericKey(nameUpper) &&
        nameUpper !== "TEACHER STAFF" &&
        deletedNameSet.has(nameUpper)
      ) {
        return true;
      }

      // Stripped / bare numeric checks across PRN and ID
      const barePrn = prnUpper.replace(/^PRN-0*/i, "").replace(/^0+/, "");
      if (barePrn && deletedPrnSet.has(barePrn)) return true;

      const bareId = idUpper
        .replace(/^PER-/, "")
        .replace(/^PRN-0*/i, "")
        .replace(/^0+/, "");
      if (bareId && (deletedIdSet.has(bareId) || deletedPrnSet.has(bareId)))
        return true;

      const bareEmp = empUpper.replace(/\D/g, "");
      if (bareEmp && deletedEmpNoSet.has(bareEmp)) return true;

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
      const rowIdUpper = String(row.id || "")
        .trim()
        .toUpperCase();
      const rowPrnUpper = String(row.prn || "")
        .trim()
        .toUpperCase();

      // Active records in esf7_personnel_profile are skipped if their explicit ID, PRN, Employee No, or Full Name is tombstoned
      const rowEmpUpper = String(row.employee_no || "")
        .trim()
        .toUpperCase();
      const rowNameUpper =
        `${String(row.first_name || "").trim()} ${String(row.last_name || "").trim()}`
          .trim()
          .toUpperCase();
      if (
        (rowIdUpper &&
          isNonGenericKey(rowIdUpper) &&
          deletedIdSet.has(rowIdUpper)) ||
        (rowPrnUpper &&
          isNonGenericKey(rowPrnUpper) &&
          deletedPrnSet.has(rowPrnUpper)) ||
        (rowEmpUpper &&
          isNonGenericKey(rowEmpUpper) &&
          deletedEmpNoSet.has(rowEmpUpper)) ||
        (rowNameUpper &&
          isNonGenericKey(rowNameUpper) &&
          rowNameUpper !== "TEACHER STAFF" &&
          deletedNameSet.has(rowNameUpper))
      ) {
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
        dbById.set(String(formatted.id).trim().toUpperCase(), formatted);
      }
      if (row.legacy_id || formatted.legacy_id || formatted.legacyId) {
        const leg = String(
          row.legacy_id || formatted.legacy_id || formatted.legacyId,
        )
          .trim()
          .toUpperCase();
        dbByLegacyId.set(leg, formatted);
      }
      if (formatted.prn && isNonGenericKey(formatted.prn)) {
        dbByPrn.set(String(formatted.prn).trim().toUpperCase(), formatted);
        dbByPrn.set(normalizePrnKey(formatted.prn), formatted);
      }
      const rawEmp =
        row.employee_no || formatted.employeeNo || formatted.employee_no;
      if (rawEmp && isNonGenericKey(rawEmp)) {
        const emp = String(rawEmp).trim().toUpperCase();
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
          isNonGenericKey(idKey) &&
          (dbById.get(idKey) || dbByLegacyId.get(idKey))) ||
        (prnKey && isNonGenericKey(prnKey) && dbByPrn.get(prnKey)) ||
        (normPrn && isNonGenericKey(normPrn) && dbByPrn.get(normPrn)) ||
        (empKey && isNonGenericKey(empKey) && dbByEmpNo.get(empKey)) ||
        (nameKey && isNonGenericKey(nameKey) && dbByName.get(nameKey));

      if (dbMatch) {
        usedDbIds.add(String(dbMatch.id).trim().toUpperCase());

        const isDbMatchPlaceholder =
          (!dbMatch.position && m.position) ||
          (dbMatch.firstName === "TEACHER" &&
            String(dbMatch.lastName || "").startsWith("STAFF") &&
            m.firstName !== "TEACHER");

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
              ...m,
              ...dbMatch,
              firstName: m.firstName,
              first_name: m.first_name,
              lastName: m.lastName,
              last_name: m.last_name,
              middleName: m.middleName || dbMatch.middleName,
              middle_name: m.middle_name || dbMatch.middle_name,
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
              deploymentStatus: (
                dbMatch.deploymentStatus ||
                dbMatch.deployment_status ||
                m.deploymentStatus ||
                m.deployment_status ||
                "OWN STATION"
              ).toUpperCase(),
              deployment_status: (
                dbMatch.deployment_status ||
                dbMatch.deploymentStatus ||
                m.deployment_status ||
                m.deploymentStatus ||
                "OWN STATION"
              ).toUpperCase(),
            }
          : {
              ...m,
              ...dbMatch,
              position: dbMatch.position || m.position,
              position_title:
                dbMatch.position_title || m.position_title || m.position,
              deploymentStatus: (
                dbMatch.deploymentStatus ||
                dbMatch.deployment_status ||
                m.deploymentStatus ||
                m.deployment_status ||
                "OWN STATION"
              ).toUpperCase(),
              deployment_status: (
                dbMatch.deployment_status ||
                dbMatch.deploymentStatus ||
                m.deployment_status ||
                m.deploymentStatus ||
                "OWN STATION"
              ).toUpperCase(),
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
        const mDsgList =
          designationsMap.get(String(m.id).toUpperCase()) ||
          (m.prn ? designationsMap.get(String(m.prn).toUpperCase()) : null) ||
          (m.legacyId
            ? designationsMap.get(String(m.legacyId).toUpperCase())
            : null) ||
          (m.legacy_id
            ? designationsMap.get(String(m.legacy_id).toUpperCase())
            : null) ||
          [];
        if (mDsgList && mDsgList.length > 0) {
          const formattedDsg = mDsgList.map(formatDesignationRecord);
          m.designations = formattedDsg;
          if (!m.designation && formattedDsg[0]) {
            m.designation =
              formattedDsg[0].serializedKey || formattedDsg[0].designationName;
          }
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

    // Final defensive deduplication pass by unique ID, PRN, or legacy ID
    const dedupedMergedList = [];
    const seenFinalIds = new Set();
    const seenFinalPrns = new Set();
    const seenFinalNames = new Set();
    for (const p of mergedList) {
      const pId = p.id ? String(p.id).trim().toUpperCase() : null;
      const pPrn = p.prn ? String(p.prn).trim().toUpperCase() : null;
      const pLegacyId =
        p.legacy_id || p.legacyId
          ? String(p.legacy_id || p.legacyId)
              .trim()
              .toUpperCase()
          : null;
      const nKey = normalizeNameKey(
        p.firstName || p.first_name,
        p.lastName || p.last_name,
      );

      // Deduplicate by explicit identifiers
      if (pId && seenFinalIds.has(pId)) continue;
      if (pPrn && isNonGenericKey(pPrn) && seenFinalPrns.has(pPrn)) continue;
      if (
        pLegacyId &&
        isNonGenericKey(pLegacyId) &&
        seenFinalIds.has(pLegacyId)
      )
        continue;

      // Only check name key if record has NO unique ID or PRN
      const hasUniqueKey = Boolean(
        pId ||
        (pPrn && isNonGenericKey(pPrn)) ||
        (pLegacyId && isNonGenericKey(pLegacyId)),
      );
      if (!hasUniqueKey && nKey && seenFinalNames.has(nKey)) continue;

      if (pId) seenFinalIds.add(pId);
      if (pPrn && isNonGenericKey(pPrn)) seenFinalPrns.add(pPrn);
      if (pLegacyId && isNonGenericKey(pLegacyId)) seenFinalIds.add(pLegacyId);
      if (nKey) seenFinalNames.add(nKey);
      dedupedMergedList.push(p);
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
router.post("/bulk", async (req, res) => {
  const client = await db.pool.connect();
  try {
    const schoolId =
      getSchoolIdFromRequest(req) ||
      req.body.schoolId ||
      req.body.school_id ||
      "108348";
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
    const schoolYear =
      req.body.schoolYear || req.body.school_year || "SY 26-27";
    const personnelList = req.body.personnelList || req.body.personnel || [];

    if (!Array.isArray(personnelList) || personnelList.length === 0) {
      return res.json({
        success: true,
        count: 0,
        message: "No personnel to save.",
      });
    }

    await client.query("BEGIN");

    const maxIdRes = await client.query(
      "SELECT MAX(id::bigint) AS max_id FROM esf7_personnel_profile WHERE id ~ '^[0-9]+$'",
    );
    let nextNumericId = maxIdRes.rows[0]?.max_id
      ? BigInt(maxIdRes.rows[0].max_id)
      : 843140n;

    // 1. Fetch all existing personnel for this school in a single query to eliminate N+1 SELECTs
    const existingRes = await client.query(
      `SELECT id, prn, legacy_id, employee_no, first_name, last_name, is_school_head, is_main_sh, school_head_level 
       FROM esf7_personnel_profile 
       WHERE REPLACE(school_id, 'SCH-', '') = $1 AND (deleted IS NOT TRUE)`,
      [cleanSchoolId],
    );

    const existingById = new Map();
    const existingByLegacy = new Map();
    const existingByPrn = new Map();
    const existingByEmpNo = new Map();
    const existingByName = new Map();

    const normalizeKey = (s) => (s ? String(s).trim().toUpperCase() : "");
    const bareDigits = (s) => (s ? String(s).replace(/\D/g, "") : "");

    for (const ex of existingRes.rows) {
      if (ex.id) existingById.set(normalizeKey(ex.id), ex);
      if (ex.legacy_id) existingByLegacy.set(normalizeKey(ex.legacy_id), ex);
      if (ex.prn) {
        existingByPrn.set(normalizeKey(ex.prn), ex);
        const b = bareDigits(ex.prn);
        if (b) existingByPrn.set(b, ex);
      }
      if (ex.employee_no) {
        existingByEmpNo.set(normalizeKey(ex.employee_no), ex);
        const b = bareDigits(ex.employee_no);
        if (b) existingByEmpNo.set(b, ex);
      }
      const fn = normalizeKey(ex.first_name);
      const ln = normalizeKey(ex.last_name);
      if (fn && ln) existingByName.set(`${fn}__${ln}`, ex);
    }

    const isExplicitHead = req.body?.isExplicitHeadDesignation === true;
    const crypto = require("crypto");

    const profileRecords = [];
    const employmentRecords = [];

    for (let idx = 0; idx < personnelList.length; idx++) {
      const p = personnelList[idx];
      const seq = idx + 1;

      const fName = String(p.firstName || p.first_name || p.first || "TEACHER")
        .toUpperCase()
        .trim();
      const lName = String(
        p.lastName || p.last_name || p.last || "STAFF " + seq,
      )
        .toUpperCase()
        .trim();
      const mName =
        String(p.middleName || p.middle_name || p.middle || "")
          .toUpperCase()
          .trim() || null;
      const ext = p.nameExtension || p.name_extension || null;

      const rawIdKey = normalizeKey(p.id);
      const rawPrnKey = normalizeKey(p.prn);
      const barePPrn = bareDigits(p.prn);
      const rawEmpKey = normalizeKey(p.employeeNo || p.employee_no);
      const barePEmp = bareDigits(p.employeeNo || p.employee_no);
      const nameKey = `${fName}__${lName}`;

      const matched =
        existingById.get(rawIdKey) ||
        existingByLegacy.get(rawIdKey) ||
        (rawPrnKey && existingByPrn.get(rawPrnKey)) ||
        (barePPrn && existingByPrn.get(barePPrn)) ||
        (rawEmpKey && existingByEmpNo.get(rawEmpKey)) ||
        (barePEmp && existingByEmpNo.get(barePEmp)) ||
        existingByName.get(nameKey) ||
        null;

      let pId = p.id;
      let prn = null;
      if (matched) {
        pId = matched.id;
        prn = matched.prn || formatCanonicalPrn(p.prn, seq);
      } else {
        if (
          !pId ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            pId,
          ) ||
          String(pId).startsWith("PER-") ||
          String(pId).startsWith("local-p-") ||
          !/^\d+$/.test(pId)
        ) {
          nextNumericId += 1n;
          pId = nextNumericId.toString();
        }
        prn = formatCanonicalPrn(p.prn, seq);
      }

      const salutation = String(p.salutation || "MR.").toUpperCase();
      const pType = String(p.type || "teaching").toLowerCase();
      const sex = String(
        p.sexAtBirth || p.sex_at_birth || p.gender || "MALE",
      ).toUpperCase();
      const bDate = p.birthdate || null;
      const age = p.age ? Number(p.age) : calculateAge(bDate) || null;
      const tin = p.tin || null;
      const noTin = Boolean(p.noTin || p.no_tin);
      const rawCivil = String(p.civilStatus || p.civil_status || "").trim();
      const civilStatus = rawCivil ? rawCivil.toUpperCase() : "SINGLE";
      const soloParent = Boolean(p.soloParent || p.solo_parent);
      const religion = p.religion || null;
      const rawEth = String(p.ethnicGroup || p.ethnic_group || "").trim();
      const ethnic = rawEth ? rawEth.toUpperCase() : null;
      const rawPhilSys = String(p.philsysNo || p.philsys_no || "").trim();
      const noPhilsys = Boolean(p.noPhilsys || p.no_philsys) || !rawPhilSys;
      const philsys = noPhilsys ? null : rawPhilSys || null;
      const rawEmpNo = String(p.employeeNo || p.employee_no || "").trim();
      const empNo =
        rawEmpNo && !rawEmpNo.toUpperCase().startsWith("PRN") ? rawEmpNo : null;
      const noEmail = Boolean(
        p.noDepedEmail ||
        p.no_deped_email ||
        p.depedEmail === "N/A" ||
        p.deped_email === "N/A",
      );
      const depedEmail = noEmail
        ? "N/A"
        : p.depedEmail || p.deped_email || null;
      const allowDisc = Boolean(
        p.allowEmailDiscrepancy || p.allow_email_discrepancy,
      );

      // School Head fields: PRESERVE existing DB designations unless this is an explicit school head configuration save
      let isHead = false;
      let isMainSh = false;
      if (isExplicitHead) {
        isHead = Boolean(p.isSchoolHead ?? p.is_school_head ?? false);
        isMainSh = isHead
          ? Boolean(p.isMainSchoolHead ?? p.is_main_sh ?? p.isMainHead ?? false)
          : false;
      } else if (matched) {
        isHead = Boolean(matched.is_school_head);
        isMainSh = Boolean(matched.is_main_sh);
      }

      profileRecords.push([
        pId,
        prn,
        cleanSchoolId,
        schoolYear,
        pType,
        salutation,
        fName,
        mName,
        lName,
        ext,
        tin,
        noTin,
        sex,
        civilStatus,
        soloParent,
        religion,
        ethnic,
        bDate,
        age,
        philsys,
        noPhilsys,
        empNo,
        depedEmail,
        noEmail,
        allowDisc,
        isHead,
        isMainSh,
        p.legacyId || p.legacy_id || pId,
      ]);

      const pos =
        p.position || p.plantilla_position || p.position_title || "TEACHER I";
      const isCook = String(pos).toUpperCase().trim() === "COOK";
      const posCat = isCook
        ? "NON-TEACHING"
        : p.positionCategory || p.position_category || "TEACHING";
      const step = sanitizeStepIncrement(p.stepIncrement || p.step_increment);
      const actualStep = sanitizeStepIncrement(
        p.actualStep || p.actual_step || step,
      );
      const schoolReportedStep = sanitizeStepIncrement(
        p.schoolReportedStep || p.school_reported_step || step,
      );
      let fund = (
        p.fundSource ||
        p.fund_source ||
        (isCook ? "SBFP" : "NATIONAL")
      ).toUpperCase();
      if (!isCook && fund === "SBFP") fund = "NATIONAL";
      const appt = (
        p.natureOfAppointment ||
        p.nature_of_appointment ||
        (isCook ? "CONTRACTUAL" : "REGULAR PERMANENT")
      ).toUpperCase();
      const hiring = (
        p.hiringArrangement ||
        p.hiring_arrangement ||
        (isCook ? "CONTRACTUAL" : "REGULAR")
      ).toUpperCase();
      const rawDeploy = p.deploymentStatus || p.deployment_status;
      let deploy = rawDeploy ? String(rawDeploy).trim().toUpperCase() : null;
      if (deploy === "STATIONED" || deploy === "STATIONED (OWN STATION)") {
        deploy = "OWN STATION";
      }
      const assignedSchools = JSON.stringify(
        p.assignedSchools || p.assigned_schools || [],
      );
      const gradeLevelsTaught = JSON.stringify(
        sanitizeGradeArray(
          p.assignedGradeLevels ||
            p.assigned_grade_levels ||
            p.gradeLevelsTaught ||
            p.grade_levels_taught ||
            [],
        ),
      );
      const firstServiceDate = safeCoerceDate(
        p.firstServiceDate || p.first_service_date,
        "first_service_date",
      );
      const lastPromotionDate = safeCoerceDate(
        p.lastPromotionDate || p.last_promotion_date,
        "last_promotion_date",
      );
      const newStationDate = safeCoerceDate(
        p.newStationDate || p.new_station_date,
        "new_station_date",
      );
      const lastLateralMovementDate = safeCoerceDate(
        p.lastLateralMovementDate || p.last_lateral_movement_date,
        "last_lateral_movement_date",
      );
      const empId = crypto.randomUUID();

      employmentRecords.push([
        empId,
        pId,
        posCat,
        pos,
        step,
        actualStep,
        schoolReportedStep,
        fund,
        appt,
        hiring,
        deploy,
        assignedSchools,
        gradeLevelsTaught,
        firstServiceDate,
        lastPromotionDate,
        newStationDate,
        lastLateralMovementDate,
      ]);
    }

    // 2. Batched multi-row upsert into esf7_personnel_profile (chunk size 40)
    const PROFILE_CHUNK = 40;
    for (let i = 0; i < profileRecords.length; i += PROFILE_CHUNK) {
      const chunk = profileRecords.slice(i, i + PROFILE_CHUNK);
      const valuePlaceholders = [];
      const flatParams = [];
      let pIdx = 1;

      for (const row of chunk) {
        const rowPlaceholders = [];
        for (let col = 0; col < 28; col++) {
          rowPlaceholders.push(`$${pIdx++}`);
          flatParams.push(row[col]);
        }
        valuePlaceholders.push(
          `(${rowPlaceholders.join(", ")}, false, 'canonical', NOW())`,
        );
      }

      const sql = `
        INSERT INTO esf7_personnel_profile (
          id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
          tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
          philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head, is_main_sh,
          legacy_id, deleted, status, updated_at
        )
        VALUES ${valuePlaceholders.join(",\n")}
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
          is_school_head = ${isExplicitHead ? "EXCLUDED.is_school_head" : "COALESCE(esf7_personnel_profile.is_school_head, EXCLUDED.is_school_head)"},
          is_main_sh = ${isExplicitHead ? "EXCLUDED.is_main_sh" : "COALESCE(esf7_personnel_profile.is_main_sh, EXCLUDED.is_main_sh)"},
          deleted = false,
          updated_at = NOW();
      `;

      await client.query(sql, flatParams);
    }

    // 3. Batched multi-row upsert into esf7_personnel_employment (chunk size 40)
    const EMP_CHUNK = 40;
    for (let i = 0; i < employmentRecords.length; i += EMP_CHUNK) {
      const chunk = employmentRecords.slice(i, i + EMP_CHUNK);
      const valuePlaceholders = [];
      const flatParams = [];
      let eIdx = 1;

      for (const row of chunk) {
        const rowPlaceholders = [];
        for (let col = 0; col < 17; col++) {
          if (col === 10) {
            rowPlaceholders.push(`COALESCE($${eIdx++}, 'OWN STATION')`);
          } else if (col === 11 || col === 12) {
            rowPlaceholders.push(`$${eIdx++}::jsonb`);
          } else {
            rowPlaceholders.push(`$${eIdx++}`);
          }
          flatParams.push(row[col]);
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(", ")}, NOW())`);
      }

      const sql = `
        INSERT INTO esf7_personnel_employment (
          id, personnel_id, position_category, position, step_increment,
          actual_step, school_reported_step, fund_source, nature_of_appointment,
          hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught,
          first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date,
          updated_at
        )
        VALUES ${valuePlaceholders.join(",\n")}
        ON CONFLICT (personnel_id) DO UPDATE SET
          position_category = EXCLUDED.position_category,
          position = EXCLUDED.position,
          step_increment = EXCLUDED.step_increment,
          actual_step = COALESCE(EXCLUDED.actual_step, esf7_personnel_employment.actual_step),
          school_reported_step = COALESCE(EXCLUDED.school_reported_step, esf7_personnel_employment.school_reported_step),
          fund_source = EXCLUDED.fund_source,
          nature_of_appointment = EXCLUDED.nature_of_appointment,
          hiring_arrangement = EXCLUDED.hiring_arrangement,
          deployment_status = CASE 
            WHEN EXCLUDED.deployment_status IS NOT NULL AND EXCLUDED.deployment_status != '' THEN EXCLUDED.deployment_status
            ELSE esf7_personnel_employment.deployment_status
          END,
          assigned_schools = CASE 
            WHEN EXCLUDED.assigned_schools::text != '[]' THEN EXCLUDED.assigned_schools 
            ELSE esf7_personnel_employment.assigned_schools 
          END,
          grade_levels_taught = CASE 
            WHEN EXCLUDED.grade_levels_taught::text != '[]' THEN EXCLUDED.grade_levels_taught 
            ELSE esf7_personnel_employment.grade_levels_taught 
          END,
          first_service_date = COALESCE(EXCLUDED.first_service_date, esf7_personnel_employment.first_service_date),
          last_promotion_date = EXCLUDED.last_promotion_date,
          new_station_date = EXCLUDED.new_station_date,
          last_lateral_movement_date = EXCLUDED.last_lateral_movement_date,
          updated_at = NOW();
      `;

      await client.query(sql, flatParams);
    }

    // 4. Recompute and update node_02_roster server-side in the same transaction
    await client
      .query(
        `WITH counts AS (
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE type = 'teaching')::int AS teaching,
          count(*) FILTER (WHERE type = 'teaching-related')::int AS related_teaching,
          count(*) FILTER (WHERE type = 'non-teaching')::int AS non_teaching
        FROM esf7_personnel_profile
        WHERE REPLACE(school_id, 'SCH-', '') = $1 AND (deleted IS NOT TRUE)
      )
      UPDATE esf7_school_node_status
      SET node_02_roster = jsonb_build_object(
        'status', 'COMPLETED',
        'total_personnel', counts.total,
        'teaching', counts.teaching,
        'related_teaching', counts.related_teaching,
        'non_teaching', counts.non_teaching,
        'last_updated', NOW()
      ),
      updated_at = NOW()
      FROM counts
      WHERE REPLACE(school_id, 'SCH-', '') = $1`,
        [cleanSchoolId],
      )
      .catch(() => {});

    await client.query("COMMIT");
    res.json({
      success: true,
      count: profileRecords.length,
      message: `Successfully saved ${profileRecords.length} personnel into esf7_personnel_profile in batched transaction.`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in POST /api/personnel/bulk:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/personnel/school-heads/config — Atomic endpoint to configure and save School Head(s)
router.post("/school-heads/config", async (req, res) => {
  const { hasMultipleHeads, mainHeadId, assignments, schoolId } =
    req.body || {};
  const authSchoolId =
    getSchoolIdFromRequest(req) ||
    req.query.schoolId ||
    req.query.school_id ||
    schoolId ||
    "";
  const cleanSchoolId = String(authSchoolId).replace(/^SCH-/i, "").trim();
  if (!cleanSchoolId) {
    return res.status(400).json({ error: "Missing schoolId" });
  }

  const sidPair = [cleanSchoolId, `SCH-${cleanSchoolId}`];
  const assignedIds = Object.values(assignments || {})
    .filter(Boolean)
    .map(String);

  const pool =
    db.pool || (typeof db.getPool === "function" ? db.getPool() : null);
  if (!pool || typeof pool.connect !== "function") {
    return res.status(500).json({ error: "Database pool unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Atomically reset all personnel is_school_head and is_main_sh in this school
    await client.query(
      "UPDATE esf7_personnel_profile SET is_school_head = FALSE, is_main_sh = FALSE, school_head_level = NULL, updated_at = NOW() WHERE school_id = ANY($1)",
      [sidPair],
    );
    await client
      .query(
        "UPDATE esf7_personnel_node_status SET is_school_head = FALSE, updated_at = NOW() WHERE school_id = ANY($1)",
        [sidPair],
      )
      .catch(() => {});

    // 2. Map of id -> assigned level
    const idToLevelMap = {};
    for (const [lvl, pId] of Object.entries(assignments || {})) {
      if (pId) idToLevelMap[String(pId)] = lvl;
    }

    // 3. Set is_school_head = TRUE for all assigned personnel
    for (const pId of assignedIds) {
      const isMain = hasMultipleHeads
        ? String(mainHeadId) === String(pId)
        : assignedIds.length === 1 || String(mainHeadId) === String(pId);
      const level = hasMultipleHeads ? idToLevelMap[pId] || null : null;

      await client.query(
        `UPDATE esf7_personnel_profile 
         SET is_school_head = TRUE, is_main_sh = $1, school_head_level = $2, updated_at = NOW() 
         WHERE school_id = ANY($3) AND (id = $4 OR legacy_id = $4 OR prn = $4)`,
        [isMain, level, sidPair, pId],
      );

      await client
        .query(
          `UPDATE esf7_personnel_node_status 
           SET is_school_head = TRUE, updated_at = NOW() 
           WHERE school_id = ANY($1) AND personnel_id = $2`,
          [sidPair, pId],
        )
        .catch(() => {});
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      hasMultipleHeads: Boolean(hasMultipleHeads),
      mainHeadId: mainHeadId || null,
      assignments: assignments || {},
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /api/personnel/school-heads/config] Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/personnel/:id/school-head — Dedicated endpoint to toggle or designate a School Head
router.put("/:id/school-head", async (req, res) => {
  console.log(
    "--> [PUT /api/personnel/:id/school-head] hit with params:",
    req.params,
    "body:",
    req.body,
  );
  const targetId = String(req.params.id || "").trim();
  const schoolId =
    getSchoolIdFromRequest(req) ||
    req.query.schoolId ||
    req.query.school_id ||
    req.body?.schoolId ||
    req.body?.school_id ||
    "";
  let cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
  const isSchoolHead = Boolean(
    req.body?.isSchoolHead ?? req.body?.is_school_head,
  );
  const isMainSh = isSchoolHead
    ? Boolean(req.body?.isMainSh ?? req.body?.is_main_sh ?? true)
    : false;
  const hasMultipleHeads = Boolean(req.body?.hasMultipleHeads);
  const schoolHeadLevel =
    req.body?.schoolHeadLevel || req.body?.school_head_level || null;

  try {
    const pool =
      db.pool || (typeof db.getPool === "function" ? db.getPool() : null);
    if (!pool || typeof pool.connect !== "function") {
      throw new Error("Database pool unavailable");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let effectiveSchoolId = cleanSchoolId;
      if (!effectiveSchoolId) {
        const pCheck = await client.query(
          "SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1",
          [targetId],
        );
        if (pCheck.rows.length > 0 && pCheck.rows[0].school_id) {
          effectiveSchoolId = String(pCheck.rows[0].school_id)
            .replace(/^SCH-/i, "")
            .trim();
        }
      }
      const sidPair = effectiveSchoolId
        ? [effectiveSchoolId, `SCH-${effectiveSchoolId}`]
        : [];

      // 1. If designating as School Head, unset existing heads / main heads
      if (isSchoolHead && sidPair.length > 0) {
        if (!hasMultipleHeads) {
          await client.query(
            "UPDATE esf7_personnel_profile SET is_school_head = FALSE, is_main_sh = FALSE, school_head_level = NULL, updated_at = NOW() WHERE school_id = ANY($1) AND (is_school_head = TRUE OR is_main_sh = TRUE)",
            [sidPair],
          );
        } else if (isMainSh) {
          await client.query(
            "UPDATE esf7_personnel_profile SET is_main_sh = FALSE, updated_at = NOW() WHERE school_id = ANY($1) AND is_main_sh = TRUE",
            [sidPair],
          );
        }
      }

      // 2. Update the target personnel in esf7_personnel_profile
      await client.query(
        "UPDATE esf7_personnel_profile SET is_school_head = $1, is_main_sh = $2, school_head_level = $3, updated_at = NOW() WHERE id = $4 OR legacy_id = $4 OR prn = $4",
        [
          isSchoolHead,
          isMainSh,
          isSchoolHead ? schoolHeadLevel : null,
          targetId,
        ],
      );

      // 2b. Sync normalized esf7_personnel_node_status and esf7_school_profile
      if (isSchoolHead && sidPair.length > 0 && !hasMultipleHeads) {
        await client
          .query(
            "UPDATE esf7_personnel_node_status SET is_school_head = FALSE, updated_at = NOW() WHERE school_id = ANY($1) AND is_school_head = TRUE",
            [sidPair],
          )
          .catch(() => {});
      }
      await client
        .query(
          "UPDATE esf7_personnel_node_status SET is_school_head = $1, updated_at = NOW() WHERE personnel_id = $2",
          [isSchoolHead, targetId],
        )
        .catch(() => {});

      if (sidPair.length > 0) {
        const pRow = await client
          .query(
            "SELECT first_name, last_name, full_name_clean FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1",
            [targetId],
          )
          .catch(() => ({ rows: [] }));
        const headName = pRow.rows[0]
          ? pRow.rows[0].full_name_clean ||
            `${pRow.rows[0].first_name || ""} ${pRow.rows[0].last_name || ""}`.trim()
          : null;

        if (isSchoolHead) {
          await client
            .query(
              `UPDATE esf7_school_profile 
               SET school_head_id = $1, school_head_name = COALESCE($2, school_head_name), school_head_level = $3, updated_at = NOW() 
               WHERE school_id = ANY($4)`,
              [targetId, headName, schoolHeadLevel, sidPair],
            )
            .catch(() => {});
        } else {
          await client
            .query(
              `UPDATE esf7_school_profile 
               SET school_head_id = NULL, school_head_name = NULL, school_head_level = NULL, updated_at = NOW() 
               WHERE school_id = ANY($1) AND school_head_id = $2`,
              [sidPair, targetId],
            )
            .catch(() => {});
        }
      }

      // Normalized relational tables are the single source of truth

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[PUT /api/personnel/:id/school-head] Toggle error:", err);
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      id: targetId,
      isSchoolHead,
      isMainSh,
      message: isSchoolHead
        ? "School Head designated."
        : "School Head designation removed.",
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
    const cleanDigits = (s) => (s ? String(s).replace(/\D/g, "") : "");
    const rawPrnDigits = cleanDigits(prn);
    const rawIdDigits = cleanDigits(targetId);
    const rawEmpDigits = cleanDigits(empNo);

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
          rawPrnDigits ? `PRN-${rawPrnDigits}` : null,
          rawPrnDigits ? `PRN-${rawPrnDigits.padStart(3, "0")}` : null,
          rawPrnDigits ? `PRN-${rawPrnDigits.padStart(7, "0")}` : null,
          rawPrnDigits || null,
          rawIdDigits ? `PRN-${rawIdDigits}` : null,
          rawIdDigits ? `PRN-${rawIdDigits.padStart(7, "0")}` : null,
          rawIdDigits || null,
          rawEmpDigits ? `PRN-${rawEmpDigits}` : null,
          rawEmpDigits || null,
        ].filter(Boolean),
      ),
    );

    const pool =
      db.pool || (typeof db.getPool === "function" ? db.getPool() : db);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Helper for optional/cleanup queries: wrap in SAVEPOINT so optional/cleanup queries cannot abort the outer transaction!
      const safeQuery = async (sql, params) => {
        try {
          await client.query("SAVEPOINT sp_del");
          const res = await client.query(sql, params);
          await client.query("RELEASE SAVEPOINT sp_del");
          return res;
        } catch (e) {
          await client.query("ROLLBACK TO SAVEPOINT sp_del");
          return { rows: [], rowCount: 0 };
        }
      };

      // 1. Unlink foreign references in section & school profile tables
      await safeQuery(
        `UPDATE esf7_regular_sections SET adviser_id = NULL WHERE adviser_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `UPDATE esf7_sned_sections SET adviser_id = NULL WHERE adviser_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `UPDATE esf7_als_sections SET adviser_id = NULL WHERE adviser_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `UPDATE esf7_aral_sections SET tutor_id = NULL WHERE tutor_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `UPDATE esf7_remedial_enrichment_sections SET assigned_teacher_id = NULL WHERE assigned_teacher_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `UPDATE esf7_workload_transfer SET absent_personnel_id = NULL WHERE absent_personnel_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `UPDATE esf7_workload_transfer SET relieving_personnel_id = NULL WHERE relieving_personnel_id = ANY($1::text[])`,
        [allPersonnelIds],
      );
      // Cascade clear school head designation if the deleted person held the role
      await safeQuery(
        `UPDATE esf7_school_profile SET school_head_id = NULL, school_head_name = NULL, school_head_level = NULL, updated_at = NOW() WHERE school_head_id = ANY($1::text[])`,
        [allPersonnelIds],
      );

      // 2. Cascade delete from all verified child tables
      const childTables = [
        "esf7_workload_rows",
        "esf7_workload_row",
        "esf7_shs_workload_rows",
        "esf7_admin_task",
        "esf7_admin_tasks",
        "esf7_related_task",
        "esf7_related_tasks",
        "esf7_personnel_employment",
        "esf7_personnel_educ",
        "esf7_perssonel_educ",
        "esf7_personnel_learning_areas",
        "esf7_personnel_learning_area",
        "esf7_personnel_ld_trainings",
        "esf7_personnel_ld",
        '"esf7_personnel_l&d"',
        "esf7_personnel_designations",
        "esf7_personnel_designation",
        "esf7_personnel_extra_tasks",
        "esf7_personnel_allowances",
        "esf7_personnel_allowance",
        "overload_late_undertime",
        "overload_no_work",
        "overload_absences",
        "overload_pay_and_reason",
        "esf7_work_immersion",
        "esf7_personnel_node_status",
        "esf7_room_submissions_staging",
        "esf7_personnel_submission",
        "esf7_personnel_submission_archive",
        "esf7_requests",
        "esf7_hrmo_corrections",
        "esf7_po3_corrections",
      ];

      for (const table of childTables) {
        await safeQuery(
          `DELETE FROM ${table} WHERE personnel_id = ANY($1::text[])`,
          [allPersonnelIds],
        );
      }
      await safeQuery(
        `DELETE FROM clustered_personnel WHERE prn = ANY($1::text[])`,
        [allPersonnelIds],
      );
      await safeQuery(
        `DELETE FROM esf7_personnel_id_mapping WHERE legacy_id = ANY($1::text[]) OR new_id = ANY($1::text[])`,
        [allPersonnelIds],
      );

      // 3. Delete parent profile record
      await client.query(
        `DELETE FROM esf7_personnel_profile WHERE id::text = ANY($1::text[]) OR legacy_id = ANY($1::text[]) OR prn = ANY($1::text[])`,
        [allPersonnelIds],
      );

      // 4. Record persistent tombstone in esf7_deleted_personnel
      if (sid && (validTargetId || validPrn || validEmpNo || validName)) {
        const tombstoneId = `DEL-${sid}-${String(validPrn || validTargetId || Math.random().toString(36).substring(2, 9)).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        await client.query(
          `INSERT INTO esf7_deleted_personnel (id, school_id, personnel_id, prn, employee_no, first_name, last_name, full_name_clean, deleted_by, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHOOL_HEAD', NOW())
           ON CONFLICT (id) DO UPDATE SET
             personnel_id = EXCLUDED.personnel_id,
             prn = EXCLUDED.prn,
             employee_no = EXCLUDED.employee_no,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             full_name_clean = EXCLUDED.full_name_clean,
             deleted_at = NOW()`,
          [
            tombstoneId,
            sid,
            validTargetId,
            validPrn,
            validEmpNo,
            fName,
            lName,
            cleanFullName,
          ],
        );
      }

      // 5. Server-side automatic recomputation of node_02_roster counts in esf7_school_node_status
      if (sid) {
        await safeQuery(
          `WITH counts AS (
            SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE type = 'teaching')::int AS teaching,
              count(*) FILTER (WHERE type = 'teaching-related')::int AS related_teaching,
              count(*) FILTER (WHERE type = 'non-teaching')::int AS non_teaching
            FROM esf7_personnel_profile
            WHERE REPLACE(school_id, 'SCH-', '') = $1 AND (deleted IS NOT TRUE)
          )
          UPDATE esf7_school_node_status
          SET node_02_roster = jsonb_build_object(
            'status', 'COMPLETED',
            'total_personnel', counts.total,
            'teaching', counts.teaching,
            'related_teaching', counts.related_teaching,
            'non_teaching', counts.non_teaching,
            'last_updated', NOW()
          ),
          updated_at = NOW()
          FROM counts
          WHERE REPLACE(school_id, 'SCH-', '') = $1`,
          [sid],
        );
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

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
