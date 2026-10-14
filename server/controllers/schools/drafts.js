const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../../db");
const cacheService = require("../../services/cacheService");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const { dedupeSections, dedupePersonnel } = require("../../utils/draftDedupe");
const { coerceDateField } = require("../../utils/dateInput");
const { buildExtras: buildWorkloadExtras } = require("../../utils/workloadPayload");
const { codec } = require("../../utils/payloadExtras");

const regularSectionPayload = codec("esf7_regular_sections");

function safeCoerceDate(val, fieldName) {
  if (!val) return null;
  try {
    return coerceDateField(val, fieldName || "date");
  } catch (e) {
    return null;
  }
}

function sanitizeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || val === "") return defaultVal;
  const num = Number(val);
  return Number.isFinite(num) ? num : defaultVal;
}

function sanitizeBoolean(val) {
  if (val === true || val === "true" || val === 1 || val === "1") return true;
  return false;
}

function sanitizeTime(val) {
  if (!val || typeof val !== "string") return null;
  const m = val.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const mm = m[2];
  const ss = m[3] ? m[3] : "00";
  return `${hh}:${mm}:${ss}`;
}

async function acquireClient() {
  if (typeof db.getClient === "function") {
    try {
      const client = await db.getClient();
      if (client && typeof client.query === "function") {
        return client;
      }
    } catch (e) {
      // Stubbed pool fallback
    }
  }
  return {
    query: (text, params) => db.query(text, params),
    release: () => {},
  };
}

let spDraftCounter = 0;
async function safeDraftQuery(client, namePrefix, queryFn) {
  const sp = `${namePrefix}_${++spDraftCounter}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await queryFn();
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
    throw err;
  }
}

let draftVersionColumn = null;
let draftVersionCheckedAt = 0;
async function hasDraftVersionColumn() {
  if (draftVersionColumn === true) return true;
  if (
    draftVersionColumn === false &&
    Date.now() - draftVersionCheckedAt < 30000
  )
    return false;
  try {
    const r = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'school_drafts' AND column_name = 'version'",
    );
    draftVersionColumn = r.rows.length > 0;
  } catch (e) {
    draftVersionColumn = false;
  }
  draftVersionCheckedAt = Date.now();
  return draftVersionColumn;
}

const schoolPersistenceQueues = new Map();

function queueNormalizedPersistence(schoolId, schoolYear, payload) {
  const key = `${schoolId}::${schoolYear}`;
  const existing = schoolPersistenceQueues.get(key);
  if (existing) {
    existing.pendingPayload = payload;
    return;
  }

  const queueEntry = {
    pendingPayload: null,
  };
  schoolPersistenceQueues.set(key, queueEntry);

  setImmediate(async () => {
    let nextPayload = payload;
    while (nextPayload) {
      queueEntry.pendingPayload = null;
      let client = null;
      try {
        client = await acquireClient();
        await persistNormalizedDraft(client, schoolId, schoolYear, nextPayload);
      } catch (err) {
        console.warn(`[NormalizedDraftQueue] Error normalizing ${key}:`, err.message);
      } finally {
        if (client && typeof client.release === "function") {
          client.release();
        }
      }
      nextPayload = queueEntry.pendingPayload;
    }
    schoolPersistenceQueues.delete(key);
  });
}

// Background helper: Synchronize school and personnel node status from draft payload
async function syncDraftToNodeStatus(schoolId, schoolYear, payload) {
  try {
    const schoolInfo = payload.schoolInfo || {};
    const personnelList = Array.isArray(payload.personnel)
      ? payload.personnel
      : [];
    const classSections = Array.isArray(payload.classSections)
      ? payload.classSections
      : [];
    const journeyState = payload.journey_state || {};
    const completedNodes = Array.isArray(journeyState.completedNodes)
      ? journeyState.completedNodes
      : [];

    const node01School = {
      status:
        completedNodes.includes("school") || schoolInfo.schoolName
          ? "COMPLETED"
          : "IN_PROGRESS",
      completed_at: new Date().toISOString(),
      school_name: schoolInfo.schoolName || `School ${schoolId}`,
      region: schoolInfo.region || "",
      division: schoolInfo.division || "",
      district: schoolInfo.district || "",
      curricular_offering: schoolInfo.curricularOffering || ["Elementary"],
      number_of_shifts: schoolInfo.numberOfShifts || "1",
      shs_curriculum_model:
        schoolInfo.shsCurriculumModel || "Standard K-12 SHS Curriculum",
      special_programs: schoolInfo.specialPrograms || [],
    };

    const teachingCount = personnelList.filter(
      (p) => p.type === "teaching",
    ).length;
    const relatedCount = personnelList.filter(
      (p) =>
        p.type === "teaching-related" ||
        p.positionCategory === "RELATED TEACHING",
    ).length;
    const nonTeachingCount = personnelList.filter(
      (p) => p.type === "non-teaching",
    ).length;

    const node02Roster = {
      status:
        completedNodes.includes("roster") || personnelList.length > 0
          ? "COMPLETED"
          : "IN_PROGRESS",
      completed_at: new Date().toISOString(),
      total_personnel: personnelList.length,
      teaching: teachingCount,
      related_teaching: relatedCount,
      non_teaching: nonTeachingCount,
    };

    const node05Requests = {
      status: completedNodes.includes("requests") ? "COMPLETED" : "IN_PROGRESS",
      completed_at: new Date().toISOString(),
    };

    const node06Classes = {
      status:
        completedNodes.includes("classes") || classSections.length > 0
          ? "COMPLETED"
          : "IN_PROGRESS",
      completed_at: new Date().toISOString(),
      total_sections: classSections.length,
      sections: classSections,
    };

    const node10Overload = {
      status: completedNodes.includes("overload") ? "COMPLETED" : "IN_PROGRESS",
      completed_at: new Date().toISOString(),
    };

    const node11Validation = {
      status: completedNodes.includes("validation")
        ? "COMPLETED"
        : "IN_PROGRESS",
      completed_at: new Date().toISOString(),
      certified_by: schoolInfo.certifiedBy || null,
      certified_at: schoolInfo.certifiedAt || null,
    };

    let profilingDoneCount = 0;
    let workloadDoneCount = 0;
    const rowsToUpsert = [];

    for (const p of personnelList) {
      if (!p || (!p.id && !p.prn)) continue;
      const pId = String(p.id || p.prn);
      const pName =
        `${p.lastName || ""}, ${p.firstName || ""} ${p.middleName || ""}`.trim() ||
        "TEACHER";
      const pPos = p.position || p.plantilla_position || p.position_title || "";
      const pCat =
        p.type === "teaching-related" ||
        p.positionCategory === "RELATED TEACHING"
          ? "RELATED TEACHING"
          : p.type === "non-teaching"
            ? "NON-TEACHING"
            : "TEACHING";
      const isHead = Boolean(
        p.isSchoolHead ||
        p.is_school_head ||
        String(pPos).toUpperCase().includes("PRINCIPAL"),
      );

      const hasEduc =
        p.collegeDegree ||
        (Array.isArray(p.degreeRows) && p.degreeRows.length > 0) ||
        (Array.isArray(p.collegeDegrees) && p.collegeDegrees.length > 0);
      const hasLearningArea =
        (p.matrixData && Object.keys(p.matrixData).length > 0) ||
        (p.learningAreaMap && Object.keys(p.learningAreaMap).length > 0);
      const profDone =
        !p.isDraft &&
        Boolean(
          hasEduc ||
          hasLearningArea ||
          p.personalVerified ||
          p.workloadVerified,
        );

      const hasNoLoad =
        p.hasNoTeachingLoad === true || p.has_no_teaching_load === true;
      const workDone =
        hasNoLoad ||
        (Array.isArray(p.workloadRows) && p.workloadRows.length > 0);

      if (profDone) profilingDoneCount++;
      if (workDone) workloadDoneCount++;

      const node03RoomQr = {
        status: p.roomQrSubmitted ? "COMPLETED" : "NOT_STARTED",
        completed_at: p.roomQrSubmittedAt || null,
      };
      const node04Profile = {
        status: profDone ? "COMPLETED" : "IN_PROGRESS",
        completed_at: new Date().toISOString(),
        highest_educational_attainment:
          p.highestEducationalAttainment ||
          p.highest_educational_attainment ||
          "",
        prc_license_no: p.prcLicenseNo || p.prc_license_no || "",
        degrees: p.degreeRows || p.collegeDegrees || [],
        learning_area_matrix: p.matrixData || p.learningAreaMap || {},
      };
      const node07Designation = {
        status:
          Array.isArray(p.designations) && p.designations.length > 0
            ? "COMPLETED"
            : "IN_PROGRESS",
        designations: p.designations || [],
      };
      const node08Workload = {
        status: workDone ? "COMPLETED" : "IN_PROGRESS",
        completed_at: new Date().toISOString(),
        is_zero_teaching_load: Boolean(hasNoLoad),
        workload_rows: p.workloadRows || [],
      };
      const node09Allowances = {
        status: "COMPLETED",
        uniform: true,
        cash: true,
      };

      rowsToUpsert.push({
        pId,
        pName,
        pPos,
        pCat,
        isHead,
        isComplete: profDone && workDone,
        node03: JSON.stringify(node03RoomQr),
        node04: JSON.stringify(node04Profile),
        node07: JSON.stringify(node07Designation),
        node08: JSON.stringify(node08Workload),
        node09: JSON.stringify(node09Allowances),
      });
    }

    if (rowsToUpsert.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
        const chunk = rowsToUpsert.slice(i, i + BATCH_SIZE);
        const valueClauses = [];
        const params = [schoolId, schoolYear];
        let pIdx = 3;

        for (const r of chunk) {
          valueClauses.push(
            `($1, $2, $${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, $${pIdx + 7}, $${pIdx + 8}, $${pIdx + 9}, $${pIdx + 10}, NOW())`,
          );
          params.push(
            r.pId,
            r.pName,
            r.pPos,
            r.pCat,
            r.isHead,
            r.isComplete,
            r.node03,
            r.node04,
            r.node07,
            r.node08,
            r.node09,
          );
          pIdx += 11;
        }

        const batchQuery = `
          INSERT INTO esf7_personnel_node_status (
            school_id, school_year, personnel_id, personnel_name, position_title, category, is_school_head, is_complete,
            node_03_room_qr, node_04_profile, node_07_designation, node_08_workload, node_09_allowances, updated_at
          )
          VALUES ${valueClauses.join(", ")}
          ON CONFLICT (school_id, school_year, personnel_id)
          DO UPDATE SET
            personnel_name = EXCLUDED.personnel_name,
            position_title = EXCLUDED.position_title,
            category = EXCLUDED.category,
            is_school_head = EXCLUDED.is_school_head,
            is_complete = EXCLUDED.is_complete,
            node_03_room_qr = EXCLUDED.node_03_room_qr,
            node_04_profile = EXCLUDED.node_04_profile,
            node_07_designation = EXCLUDED.node_07_designation,
            node_08_workload = EXCLUDED.node_08_workload,
            node_09_allowances = EXCLUDED.node_09_allowances,
            updated_at = NOW()
        `;

        await db.query(batchQuery, params).catch((err) => {
          console.warn(
            "[syncDraftToNodeStatus] Batch upsert warning:",
            err.message,
          );
        });
      }
    }

    const allReady =
      personnelList.length > 0 &&
      profilingDoneCount === personnelList.length &&
      workloadDoneCount === personnelList.length;
    const personnelSummary = {
      total_personnel: personnelList.length,
      teaching: teachingCount,
      related_teaching: relatedCount,
      non_teaching: nonTeachingCount,
      profiling_completed: profilingDoneCount,
      workload_completed: workloadDoneCount,
      all_personnel_ready: allReady,
    };
    const overallPct = Math.min(
      100,
      Math.round(((completedNodes.length + (allReady ? 2 : 0)) / 11) * 100),
    );

    await db
      .query(
        `
      INSERT INTO esf7_school_node_status (
        school_id, school_year, overall_status, overall_percentage,
        node_01_school, node_02_roster, node_05_requests, node_06_classes, node_10_overload, node_11_validation,
        personnel_summary, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (school_id, school_year)
      DO UPDATE SET
        overall_status = EXCLUDED.overall_status,
        overall_percentage = EXCLUDED.overall_percentage,
        node_01_school = EXCLUDED.node_01_school,
        node_02_roster = EXCLUDED.node_02_roster,
        node_05_requests = EXCLUDED.node_05_requests,
        node_06_classes = EXCLUDED.node_06_classes,
        node_10_overload = EXCLUDED.node_10_overload,
        node_11_validation = EXCLUDED.node_11_validation,
        personnel_summary = EXCLUDED.personnel_summary,
        updated_at = NOW()
    `,
        [
          schoolId,
          schoolYear,
          completedNodes.includes("validation") ? "COMPLETED" : "IN_PROGRESS",
          overallPct,
          JSON.stringify(node01School),
          JSON.stringify(node02Roster),
          JSON.stringify(node05Requests),
          JSON.stringify(node06Classes),
          JSON.stringify(node10Overload),
          JSON.stringify(node11Validation),
          JSON.stringify(personnelSummary),
        ],
      )
      .catch(() => {});
  } catch (err) {
    console.warn("[SyncDraftToNodeStatus Notice]:", err.message);
  }
}

/**
 * Persist normalized draft data into relational tables.
 * Section 1: esf7_school_profile strictly writes 31 columns without extras or raw_payload.
 */
async function persistNormalizedDraft(client, schoolId, schoolYear, finalPayload) {
  const cleanId = String(schoolId).replace(/^SCH-/i, "").trim();

  // 1. esf7_school_profile
  if (finalPayload.schoolInfo) {
    const sInfo = finalPayload.schoolInfo || {};
    const profId = `SCH-PROF-${cleanId}`;

    const elemSpecialPrograms = Array.isArray(sInfo.elemSpecialPrograms)
      ? sInfo.elemSpecialPrograms
      : Array.isArray(sInfo.elem_special_programs)
        ? sInfo.elem_special_programs
        : [];
    const jhsSpecialPrograms = Array.isArray(sInfo.jhsSpecialPrograms)
      ? sInfo.jhsSpecialPrograms
      : Array.isArray(sInfo.jhs_special_programs)
        ? sInfo.jhs_special_programs
        : [];

    const elemIncList = Array.isArray(sInfo.elemInclusivePrograms)
      ? sInfo.elemInclusivePrograms
      : Array.isArray(sInfo.elem_inclusive_programs)
        ? sInfo.elem_inclusive_programs
        : [];
    const jhsIncList = Array.isArray(sInfo.jhsInclusivePrograms)
      ? sInfo.jhsInclusivePrograms
      : Array.isArray(sInfo.jhs_inclusive_programs)
        ? sInfo.jhs_inclusive_programs
        : [];
    const shsIncList = Array.isArray(sInfo.shsInclusivePrograms)
      ? sInfo.shsInclusivePrograms
      : Array.isArray(sInfo.shs_inclusive_programs)
        ? sInfo.shs_inclusive_programs
        : [];

    const final_has_es_sned = Boolean(sInfo.has_es_sned ?? elemIncList.includes("SNED-ES"));
    const final_has_es_als = Boolean(sInfo.has_es_als ?? elemIncList.includes("ALS-ES"));
    const final_has_es_iped = Boolean(sInfo.has_es_iped ?? elemIncList.includes("IPED-ES"));
    const final_has_es_mad = Boolean(sInfo.has_es_mad ?? elemIncList.includes("MADRASAH-ES"));

    const final_has_jhs_sned = Boolean(sInfo.has_jhs_sned ?? jhsIncList.includes("SNED-JHS"));
    const final_has_jhs_als = Boolean(sInfo.has_jhs_als ?? jhsIncList.includes("ALS-JHS"));
    const final_has_jhs_iped = Boolean(sInfo.has_jhs_iped ?? jhsIncList.includes("IPED-JHS"));
    const final_has_jhs_mad = Boolean(sInfo.has_jhs_mad ?? jhsIncList.includes("MADRASAH-JHS"));

    const final_has_shs_sned = Boolean(sInfo.has_shs_sned ?? shsIncList.includes("SNED-SHS"));
    const final_has_shs_iped = Boolean(sInfo.has_shs_iped ?? shsIncList.includes("IPED-SHS"));
    const final_has_shs_mad = Boolean(sInfo.has_shs_mad ?? shsIncList.includes("MADRASAH-SHS"));

    const final_has_sned = final_has_es_sned || final_has_jhs_sned || final_has_shs_sned || sanitizeBoolean(sInfo.hasSned || sInfo.has_sned);
    const final_has_als = final_has_es_als || final_has_jhs_als || sanitizeBoolean(sInfo.hasAls || sInfo.has_als);
    const final_has_iped = final_has_es_iped || final_has_jhs_iped || final_has_shs_iped || sanitizeBoolean(sInfo.hasIped || sInfo.has_iped);
    const final_has_madrasah = final_has_es_mad || final_has_jhs_mad || final_has_shs_mad || sanitizeBoolean(sInfo.hasMadrasah || sInfo.has_madrasah);

    const inclusiveProgs = [];
    if (final_has_es_sned) inclusiveProgs.push("SNED-ES");
    if (final_has_es_als) inclusiveProgs.push("ALS-ES");
    if (final_has_es_iped) inclusiveProgs.push("IPED-ES");
    if (final_has_es_mad) inclusiveProgs.push("MADRASAH-ES");

    if (final_has_jhs_sned) inclusiveProgs.push("SNED-JHS");
    if (final_has_jhs_als) inclusiveProgs.push("ALS-JHS");
    if (final_has_jhs_iped) inclusiveProgs.push("IPED-JHS");
    if (final_has_jhs_mad) inclusiveProgs.push("MADRASAH-JHS");

    if (final_has_shs_sned) inclusiveProgs.push("SNED-SHS");
    if (final_has_shs_iped) inclusiveProgs.push("IPED-SHS");
    if (final_has_shs_mad) inclusiveProgs.push("MADRASAH-SHS");

    await safeDraftQuery(client, "sp_prof", () =>
      client.query(
        `
        INSERT INTO esf7_school_profile (
          id, school_id, school_year, iern,
          has_elem_special_programs, elem_special_programs,
          has_jhs_special_programs, jhs_special_programs,
          shs_curriculum_model,
          has_es_sned, has_es_als, has_es_iped, has_es_mad,
          has_jhs_sned, has_jhs_als, has_jhs_iped, has_jhs_mad,
          has_shs_sned, has_shs_iped, has_shs_mad,
          has_sned, has_als, has_iped, has_madrasah,
          inclusive_programs,
          has_shifts, shifts_config,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6::jsonb,
          $7, $8::jsonb,
          $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20,
          $21, $22, $23, $24,
          $25::jsonb,
          $26, $27::jsonb,
          NOW()
        )
        ON CONFLICT (school_id, school_year) DO UPDATE SET
          iern = COALESCE(EXCLUDED.iern, esf7_school_profile.iern),
          has_elem_special_programs = COALESCE(EXCLUDED.has_elem_special_programs, esf7_school_profile.has_elem_special_programs),
          elem_special_programs = EXCLUDED.elem_special_programs,
          has_jhs_special_programs = COALESCE(EXCLUDED.has_jhs_special_programs, esf7_school_profile.has_jhs_special_programs),
          jhs_special_programs = EXCLUDED.jhs_special_programs,
          shs_curriculum_model = COALESCE(EXCLUDED.shs_curriculum_model, esf7_school_profile.shs_curriculum_model),
          has_es_sned = COALESCE(EXCLUDED.has_es_sned, esf7_school_profile.has_es_sned),
          has_es_als = COALESCE(EXCLUDED.has_es_als, esf7_school_profile.has_es_als),
          has_es_iped = COALESCE(EXCLUDED.has_es_iped, esf7_school_profile.has_es_iped),
          has_es_mad = COALESCE(EXCLUDED.has_es_mad, esf7_school_profile.has_es_mad),
          has_jhs_sned = COALESCE(EXCLUDED.has_jhs_sned, esf7_school_profile.has_jhs_sned),
          has_jhs_als = COALESCE(EXCLUDED.has_jhs_als, esf7_school_profile.has_jhs_als),
          has_jhs_iped = COALESCE(EXCLUDED.has_jhs_iped, esf7_school_profile.has_jhs_iped),
          has_jhs_mad = COALESCE(EXCLUDED.has_jhs_mad, esf7_school_profile.has_jhs_mad),
          has_shs_sned = COALESCE(EXCLUDED.has_shs_sned, esf7_school_profile.has_shs_sned),
          has_shs_iped = COALESCE(EXCLUDED.has_shs_iped, esf7_school_profile.has_shs_iped),
          has_shs_mad = COALESCE(EXCLUDED.has_shs_mad, esf7_school_profile.has_shs_mad),
          has_sned = COALESCE(EXCLUDED.has_sned, esf7_school_profile.has_sned),
          has_als = COALESCE(EXCLUDED.has_als, esf7_school_profile.has_als),
          has_iped = COALESCE(EXCLUDED.has_iped, esf7_school_profile.has_iped),
          has_madrasah = COALESCE(EXCLUDED.has_madrasah, esf7_school_profile.has_madrasah),
          inclusive_programs = EXCLUDED.inclusive_programs,
          has_shifts = COALESCE(EXCLUDED.has_shifts, esf7_school_profile.has_shifts),
          shifts_config = COALESCE(EXCLUDED.shifts_config, esf7_school_profile.shifts_config),
          updated_at = NOW()
        `,
        [
          profId,
          cleanId,
          schoolYear,
          sInfo.iern ? String(sInfo.iern).trim() : null,
          sanitizeBoolean(sInfo.hasElemSpecialPrograms || sInfo.has_elem_special_programs),
          JSON.stringify(elemSpecialPrograms),
          sanitizeBoolean(sInfo.hasJhsSpecialPrograms || sInfo.has_jhs_special_programs),
          JSON.stringify(jhsSpecialPrograms),
          sInfo.shsCurriculumModel || sInfo.shs_curriculum_model || "Standard K-12 SHS Curriculum",
          final_has_es_sned,
          final_has_es_als,
          final_has_es_iped,
          final_has_es_mad,
          final_has_jhs_sned,
          final_has_jhs_als,
          final_has_jhs_iped,
          final_has_jhs_mad,
          final_has_shs_sned,
          final_has_shs_iped,
          final_has_shs_mad,
          final_has_sned,
          final_has_als,
          final_has_iped,
          final_has_madrasah,
          JSON.stringify(inclusiveProgs),
          sanitizeBoolean(sInfo.hasShifts || sInfo.has_shifts),
          JSON.stringify(sInfo.shiftsConfig || sInfo.shifts_config || {}),
        ],
      )
    ).catch((err) => {
      console.warn("[persistNormalizedDraft] school_profile warning:", err.message);
    });
  }

  // 2. Personnel: Resolution & Batch Inserts
  const validPersonnelIds = new Set();
  const draftIdToFinalId = new Map();

  const existingPersRes = await client.query(
    "SELECT id, prn, legacy_id, first_name, last_name FROM esf7_personnel_profile WHERE school_id = $1 OR school_id = $2",
    [cleanId, `SCH-${cleanId}`],
  ).catch(() => ({ rows: [] }));

  const existingByPrn = new Map();
  const existingById = new Map();
  const existingByLegacyId = new Map();
  const existingByName = new Map();
  for (const r of (existingPersRes.rows || [])) {
    if (r.id) {
      existingById.set(r.id, r);
      validPersonnelIds.add(r.id);
    }
    if (r.prn) {
      existingByPrn.set(r.prn, r);
    }
    if (r.legacy_id) {
      existingByLegacyId.set(r.legacy_id, r);
    }
    if (r.first_name && r.last_name) {
      const nameKey = `${String(r.first_name).trim().toUpperCase()}__${String(r.last_name).trim().toUpperCase()}`;
      existingByName.set(nameKey, r);
    }
  }

  // If school already has normalized personnel in esf7_personnel_profile, skip legacy draft personnel loop
  if (existingPersRes.rows.length === 0 && Array.isArray(finalPayload.personnel) && finalPayload.personnel.length > 0) {
    for (const p of finalPayload.personnel) {
      if (!p) continue;
      const rawId = p.id ? String(p.id).trim() : null;
      const rawPrn = p.prn ? String(p.prn).trim() : null;
      const fName = String(p.firstName || p.first_name || p.first || "").trim().toUpperCase();
      const lName = String(p.lastName || p.last_name || p.last || "").trim().toUpperCase();
      const nameKey = fName && lName ? `${fName}__${lName}` : null;

      let finalId = null;
      let legacyId = null;
      let pStatus = p.status || null;

      if (rawId && existingById.has(rawId)) {
        finalId = existingById.get(rawId).id;
      } else if (rawId && existingByLegacyId.has(rawId)) {
        finalId = existingByLegacyId.get(rawId).id;
        legacyId = rawId;
      } else if (rawPrn && existingByPrn.has(rawPrn)) {
        finalId = existingByPrn.get(rawPrn).id;
        if (rawId && rawId !== finalId) legacyId = rawId;
      } else if (nameKey && existingByName.has(nameKey)) {
        finalId = existingByName.get(nameKey).id;
        if (rawId && rawId !== finalId) legacyId = rawId;
      } else if (rawId) {
        const mapRes = await safeDraftQuery(client, "sp_get_map", () =>
          client.query(
            "SELECT new_id, status FROM esf7_personnel_id_mapping WHERE legacy_id = $1 LIMIT 1",
            [rawId],
          )
        ).catch(() => ({ rows: [] }));
        if (mapRes.rows.length > 0) {
          finalId = mapRes.rows[0].new_id;
          legacyId = rawId;
          if (!pStatus) pStatus = mapRes.rows[0].status;
        }
      }
  const rawPersonnelList = Array.isArray(finalPayload.personnel) ? finalPayload.personnel : [];
  const allRawIds = rawPersonnelList.map(p => p && p.id ? String(p.id).trim() : null).filter(Boolean);
  const existingMappingRes = allRawIds.length > 0
    ? await client.query(
        "SELECT legacy_id, new_id, status FROM esf7_personnel_id_mapping WHERE legacy_id = ANY($1)",
        [allRawIds],
      ).catch(() => ({ rows: [] }))
    : { rows: [] };
  const existingMappings = new Map();
  for (const m of existingMappingRes.rows || []) {
    existingMappings.set(m.legacy_id, m);
  }

  const mappingsToUpsert = [];
  const profileParams = [];
  const empParams = [];
  const educParams = [];

  for (const p of rawPersonnelList) {
    if (!p) continue;
    const rawId = p.id ? String(p.id).trim() : null;
    const rawPrn = p.prn ? String(p.prn).trim() : null;
    const fName = String(p.firstName || p.first_name || p.first || "").trim().toUpperCase();
    const lName = String(p.lastName || p.last_name || p.last || "").trim().toUpperCase();
    const nameKey = fName && lName ? `${fName}__${lName}` : null;

    let finalId = null;
    let legacyId = null;
    let pStatus = p.status || null;

    if (rawId && existingById.has(rawId)) {
      finalId = existingById.get(rawId).id;
    } else if (rawId && existingByLegacyId.has(rawId)) {
      finalId = existingByLegacyId.get(rawId).id;
      legacyId = rawId;
    } else if (rawPrn && existingByPrn.has(rawPrn)) {
      finalId = existingByPrn.get(rawPrn).id;
      if (rawId && rawId !== finalId) legacyId = rawId;
    } else if (nameKey && existingByName.has(nameKey)) {
      finalId = existingByName.get(nameKey).id;
      if (rawId && rawId !== finalId) legacyId = rawId;
    } else if (rawId && existingMappings.has(rawId)) {
      const m = existingMappings.get(rawId);
      finalId = m.new_id;
      legacyId = rawId;
      if (!pStatus) pStatus = m.status;
    }

    if (!finalId) {
      if (rawId && !rawId.startsWith("temp-") && !rawId.startsWith("local-p-")) {
        finalId = rawId;
      } else {
        finalId = crypto.randomUUID();
        if (rawId && !legacyId) legacyId = rawId;
      }
    }

    if (legacyId && legacyId !== finalId) {
      mappingsToUpsert.push({ legacy_id: legacyId, new_id: finalId, status: pStatus || "canonical" });
    }

    if (!pStatus) {
      pStatus = (legacyId && legacyId.startsWith("local-p-"))
        ? "client-created"
        : (legacyId && legacyId.startsWith("P-HARVEST-"))
          ? "harvester-created"
          : "canonical";
    }

    let finalPrn = rawPrn;
    if (!finalPrn || ["N/A", "NA", "NONE", "NULL", "0"].includes(finalPrn.toUpperCase())) {
      finalPrn = finalId;
    }

    existingById.set(finalId, { id: finalId, prn: finalPrn, legacy_id: legacyId, first_name: fName, last_name: lName });
    if (rawId) existingById.set(rawId, { id: finalId });
    if (legacyId) existingByLegacyId.set(legacyId, { id: finalId });
    if (finalPrn) existingByPrn.set(finalPrn, { id: finalId });
    if (nameKey) existingByName.set(nameKey, { id: finalId });

    if (rawId) draftIdToFinalId.set(rawId, finalId);
    draftIdToFinalId.set(finalId, finalId);
    validPersonnelIds.add(finalId);

    let pType = String(p.type || "teaching").toLowerCase().trim();
    if (!["teaching", "teaching-related", "non-teaching"].includes(pType)) {
      pType = "teaching";
    }

      const birthDate = safeCoerceDate(p.birthdate, "birthdate");
      const age = Number.isInteger(Number(p.age)) && Number(p.age) > 0 ? Number(p.age) : null;

      // Upsert esf7_personnel_profile
      await safeDraftQuery(client, "sp_ins_pers", () =>
        client.query(
          `
          INSERT INTO esf7_personnel_profile (
            id, prn, status, legacy_id, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
            tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
            philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW())
          ON CONFLICT (id) DO UPDATE SET
            prn = COALESCE(EXCLUDED.prn, esf7_personnel_profile.prn),
            status = COALESCE(EXCLUDED.status, esf7_personnel_profile.status),
            legacy_id = COALESCE(esf7_personnel_profile.legacy_id, EXCLUDED.legacy_id),
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
            updated_at = NOW()
          `,
          [
            finalId,
            finalPrn,
            pStatus,
            legacyId,
            cleanId,
            schoolYear,
            pType,
            p.salutation || "MR.",
            String(p.firstName || p.first_name || "UNKNOWN").trim(),
            p.middleName || p.middle_name || null,
            String(p.lastName || p.last_name || "UNKNOWN").trim(),
            p.nameExtension || p.name_extension || null,
            p.tin || null,
            sanitizeBoolean(p.noTin || p.no_tin),
            sex,
            p.civilStatus || p.civil_status || null,
            sanitizeBoolean(p.soloParent || p.solo_parent),
            p.religion || null,
            p.ethnicGroup || p.ethnic_group || null,
            birthDate,
            age,
            p.philsysNo || p.philsys_no || null,
            sanitizeBoolean(p.noPhilsys || p.no_philsys),
            p.employeeNo || p.employee_no || null,
            p.depedEmail || p.deped_email || null,
            sanitizeBoolean(p.noDepedEmail || p.no_deped_email),
            sanitizeBoolean(p.allowEmailDiscrepancy || p.allow_email_discrepancy),
            sanitizeBoolean(p.isSchoolHead || p.is_school_head),
          ],
        )
      ).catch((err) => {
        console.warn(`[persistNormalizedDraft] personnel_profile warning (${finalId}):`, err.message);
      });

    const birthDate = safeCoerceDate(p.birthdate, "birthdate");
    const age = Number.isInteger(Number(p.age)) && Number(p.age) > 0 ? Number(p.age) : null;

    profileParams.push({
      id: finalId,
      prn: finalPrn,
      status: pStatus,
      legacy_id: legacyId,
      school_id: cleanId,
      school_year: schoolYear,
      type: pType,
      salutation: p.salutation || "MR.",
      first_name: String(p.firstName || p.first_name || "UNKNOWN").trim(),
      middle_name: p.middleName || p.middle_name || null,
      last_name: String(p.lastName || p.last_name || "UNKNOWN").trim(),
      name_extension: p.nameExtension || p.name_extension || null,
      tin: p.tin || null,
      no_tin: sanitizeBoolean(p.noTin || p.no_tin),
      sex_at_birth: sex,
      civil_status: p.civilStatus || p.civil_status || null,
      solo_parent: sanitizeBoolean(p.soloParent || p.solo_parent),
      religion: p.religion || null,
      ethnic_group: p.ethnicGroup || p.ethnic_group || null,
      birthdate: birthDate,
      age,
      philsys_no: p.philsysNo || p.philsys_no || null,
      no_philsys: sanitizeBoolean(p.noPhilsys || p.no_philsys),
      employee_no: p.employeeNo || p.employee_no || null,
      deped_email: p.depedEmail || p.deped_email || null,
      no_deped_email: sanitizeBoolean(p.noDepedEmail || p.no_deped_email),
      allow_email_discrepancy: sanitizeBoolean(p.allowEmailDiscrepancy || p.allow_email_discrepancy),
      is_school_head: sanitizeBoolean(p.isSchoolHead || p.is_school_head),
      is_main_sh: sanitizeBoolean(
        p.isMainSchoolHead !== undefined
          ? p.isMainSchoolHead
          : (p.is_main_sh !== undefined
            ? p.is_main_sh
            : (p.isMainHead !== undefined
              ? p.isMainHead
              : (p.isSchoolHead || p.is_school_head)))
      ),
      raw_payload: JSON.stringify(p),
    });

    let posCat = String(p.positionCategory || p.position_category || "TEACHING").toUpperCase().trim();
    if (posCat === "TEACHING-RELATED") posCat = "RELATED TEACHING";
    if (!["TEACHING", "RELATED TEACHING", "NON-TEACHING"].includes(posCat)) {
      posCat = "TEACHING";
    }
    const stepInc = Math.max(1, Math.min(8, Number(p.stepIncrement || p.step_increment) || 1));
    const firstServiceDate = safeCoerceDate(p.firstServiceDate || p.first_service_date, "first_service_date");
    const lastPromotionDate = safeCoerceDate(p.lastPromotionDate || p.last_promotion_date, "last_promotion_date");
    const newStationDate = safeCoerceDate(p.newStationDate || p.new_station_date, "new_station_date");
    const lastLateralMovementDate = safeCoerceDate(p.lastLateralMovementDate || p.last_lateral_movement_date, "last_lateral_movement_date");

    empParams.push({
      id: crypto.randomUUID(),
      personnel_id: finalId,
      position_category: posCat,
      position: p.position || "TEACHER I",
      step_increment: stepInc,
      fund_source: p.fundSource || p.fund_source || "NATIONAL",
      nature_of_appointment: p.natureOfAppointment || p.nature_of_appointment || "REGULAR PERMANENT",
      hiring_arrangement: p.hiringArrangement || p.hiring_arrangement || "PERMANENT",
      deployment_status: p.deploymentStatus || p.deployment_status || "OWN STATION",
      assigned_schools: JSON.stringify(p.assignedSchools || []),
      grade_levels_taught: JSON.stringify(p.gradeLevelsTaught || p.grade_levels_taught || []),
      first_service_date: firstServiceDate,
      last_promotion_date: lastPromotionDate,
      new_station_date: newStationDate,
      last_lateral_movement_date: lastLateralMovementDate,
    });

    const eligList = Array.isArray(p.eligibility) ? p.eligibility : (p.eligibility ? [p.eligibility] : []);
    educParams.push({
      id: `EDU-${finalId}`,
      personnel_id: finalId,
      highest_educational_attainment: p.highestEducationalAttainment || p.highest_educational_attainment || "COLLEGE GRADUATE / BACCALAUREATE",
      shs_track: p.shsTrack || p.shs_track || null,
      vocational_course: p.vocationalCourse || p.vocational_course || null,
      vocational_level: p.vocationalLevel || p.vocational_level || null,
      college_degree: p.degree || p.collegeDegree || p.college_degree || null,
      college_degrees: JSON.stringify(Array.isArray(p.collegeDegrees || p.college_degrees) ? (p.collegeDegrees || p.college_degrees) : []),
      major: p.major || null,
      minor: p.minor || null,
      post_graduate_degree: p.postGraduateDegree || p.post_graduate_degree || "N/A",
      post_graduate_discipline: JSON.stringify(p.postGraduateDiscipline || p.post_graduate_discipline || {}),
      eligibility: JSON.stringify(eligList),
      prc_specialization: p.prcSpecialization || p.prc_specialization || null,
    });
  }

  // Batch insert mapping
  if (mappingsToUpsert.length > 0) {
    const leg = mappingsToUpsert.map(m => m.legacy_id);
    const nid = mappingsToUpsert.map(m => m.new_id);
    const st = mappingsToUpsert.map(m => m.status);
    await client.query(`
      INSERT INTO esf7_personnel_id_mapping (legacy_id, new_id, status)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[])
      ON CONFLICT (legacy_id) DO UPDATE SET new_id = EXCLUDED.new_id, status = EXCLUDED.status
    `, [leg, nid, st]).catch(() => {});
  }

  // Batch insert personnel profiles in chunks of 50
  for (let i = 0; i < profileParams.length; i += 50) {
    const chunk = profileParams.slice(i, i + 50);
    const vals = [];
    const pars = [];
    let idx = 1;
    for (const pr of chunk) {
      vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}, $${idx+12}, $${idx+13}, $${idx+14}, $${idx+15}, $${idx+16}, $${idx+17}, $${idx+18}, $${idx+19}, $${idx+20}, $${idx+21}, $${idx+22}, $${idx+23}, $${idx+24}, $${idx+25}, $${idx+26}, $${idx+27}, $${idx+28}, $${idx+29}::jsonb, NOW())`);
      pars.push(
        pr.id, pr.prn, pr.status, pr.legacy_id, pr.school_id, pr.school_year, pr.type, pr.salutation,
        pr.first_name, pr.middle_name, pr.last_name, pr.name_extension, pr.tin, pr.no_tin,
        pr.sex_at_birth, pr.civil_status, pr.solo_parent, pr.religion, pr.ethnic_group,
        pr.birthdate, pr.age, pr.philsys_no, pr.no_philsys, pr.employee_no, pr.deped_email,
        pr.no_deped_email, pr.allow_email_discrepancy, pr.is_school_head, pr.is_main_sh, pr.raw_payload
      );
      idx += 30;
    }
    await client.query(`
      INSERT INTO esf7_personnel_profile (
        id, prn, status, legacy_id, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
        tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
        philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head, is_main_sh,
        raw_payload, updated_at
      )
      VALUES ${vals.join(", ")}
      ON CONFLICT (id) DO UPDATE SET
        prn = COALESCE(EXCLUDED.prn, esf7_personnel_profile.prn),
        status = COALESCE(EXCLUDED.status, esf7_personnel_profile.status),
        legacy_id = COALESCE(esf7_personnel_profile.legacy_id, EXCLUDED.legacy_id),
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
        is_main_sh = EXCLUDED.is_main_sh,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `, pars).catch((err) => {
      console.warn("[persistNormalizedDraft] personnel_profile batch warning:", err.message);
    });
  }

  // Batch insert employment in chunks of 50
  for (let i = 0; i < empParams.length; i += 50) {
    const chunk = empParams.slice(i, i + 50);
    const vals = [];
    const pars = [];
    let idx = 1;
    for (const em of chunk) {
      vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}::jsonb, $${idx+10}::jsonb, $${idx+11}, $${idx+12}, $${idx+13}, $${idx+14}, NOW())`);
      pars.push(
        em.id, em.personnel_id, em.position_category, em.position, em.step_increment,
        em.fund_source, em.nature_of_appointment, em.hiring_arrangement, em.deployment_status,
        em.assigned_schools, em.grade_levels_taught, em.first_service_date, em.last_promotion_date,
        em.new_station_date, em.last_lateral_movement_date
      );
      idx += 15;
    }
    await client.query(`
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment,
        hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught,
        first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, updated_at
      )
      VALUES ${vals.join(", ")}
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
        updated_at = NOW()
    `, pars).catch((err) => {
      console.warn("[persistNormalizedDraft] personnel_employment batch warning:", err.message);
    });
  }

  // Batch insert education in chunks of 50
  for (let i = 0; i < educParams.length; i += 50) {
    const chunk = educParams.slice(i, i + 50);
    const vals = [];
    const pars = [];
    let idx = 1;
    for (const ed of chunk) {
      vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}::jsonb, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}::jsonb, $${idx+12}::jsonb, $${idx+13}, NOW())`);
      pars.push(
        ed.id, ed.personnel_id, ed.highest_educational_attainment, ed.shs_track, ed.vocational_course, ed.vocational_level,
        ed.college_degree, ed.college_degrees, ed.major, ed.minor, ed.post_graduate_degree, ed.post_graduate_discipline,
        ed.eligibility, ed.prc_specialization
      );
      idx += 14;
    }
    await client.query(`
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, college_degrees, major, minor, post_graduate_degree, post_graduate_discipline,
        eligibility, prc_specialization, updated_at
      )
      VALUES ${vals.join(", ")}
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
        updated_at = NOW()
    `, pars).catch((err) => {
      console.warn("[persistNormalizedDraft] perssonel_educ batch warning:", err.message);
    });
  }

  // 3. Sections: Batch Upsert
  const incomingSections = Array.isArray(finalPayload.classSections)
    ? finalPayload.classSections
    : (Array.isArray(finalPayload.sections) ? finalPayload.sections : []);

  if (incomingSections.length > 0) {
    const sectionParams = [];
    for (const s of incomingSections) {
      if (!s) continue;
      const secId = s.id ? String(s.id).trim() : `sec-draft-${cleanId}-${Math.random().toString(36).substring(2, 7)}`;
      const gradeLevel = String(s.gradeLevel || s.grade_level || "Grade 7").trim();
      const sectionName = String(s.sectionName || s.section_name || "A").trim().toUpperCase();
      const secType = String(s.sectionType || s.section_type || "MONO GRADE").trim().toUpperCase();

      const rawAdv = s.advisorId || s.adviserId || s.adviser_id;
      let resolvedAdviserId = null;
      if (rawAdv) {
        if (validPersonnelIds.has(rawAdv)) {
          resolvedAdviserId = rawAdv;
        } else if (draftIdToFinalId.has(rawAdv) && validPersonnelIds.has(draftIdToFinalId.get(rawAdv))) {
          resolvedAdviserId = draftIdToFinalId.get(rawAdv);
        } else if (existingByLegacyId.has(rawAdv)) {
          resolvedAdviserId = existingByLegacyId.get(rawAdv).id;
        } else if (existingMappings.has(rawAdv)) {
          resolvedAdviserId = existingMappings.get(rawAdv).new_id;
        }
      }

      const maleLearners = sanitizeNumber(s.maleLearners || s.male_learners, 0);
      const femaleLearners = sanitizeNumber(s.femaleLearners || s.female_learners, 0);
      const numLearners = sanitizeNumber(s.numberOfLearners || s.number_of_learners, maleLearners + femaleLearners);
      const sizeStatus = s.sizeStatus || s.size_status || "WITHIN STANDARD";
      const extras = JSON.stringify(regularSectionPayload.buildExtras(s, {
        id: secId, school_id: cleanId, school_year: schoolYear, grade_level: gradeLevel,
        section_name: sectionName, section_type: secType, adviser_id: resolvedAdviserId,
        male_learners: maleLearners, female_learners: femaleLearners, number_of_learners: numLearners,
        size_status: sizeStatus
      }));

      sectionParams.push({
        id: secId, school_id: cleanId, school_year: schoolYear, grade_level: gradeLevel,
        section_name: sectionName, section_type: secType, adviser_id: resolvedAdviserId,
        male_learners: maleLearners, female_learners: femaleLearners, number_of_learners: numLearners,
        size_status: sizeStatus, extras
      });
    }

    for (let i = 0; i < sectionParams.length; i += 50) {
      const chunk = sectionParams.slice(i, i + 50);
      const vals = [];
      const pars = [];
      let idx = 1;
      for (const sc of chunk) {
        vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}::jsonb, NOW())`);
        pars.push(
          sc.id, sc.school_id, sc.school_year, sc.grade_level, sc.section_name, sc.section_type,
          sc.adviser_id, sc.male_learners, sc.female_learners, sc.number_of_learners, sc.size_status, sc.extras
        );
        idx += 12;
      }
      await client.query(`
        INSERT INTO esf7_regular_sections (
          id, school_id, school_year, grade_level, section_name, section_type, adviser_id,
          male_learners, female_learners, number_of_learners, size_status, extras, updated_at
        )
        VALUES ${vals.join(", ")}
        ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
          section_type = EXCLUDED.section_type,
          adviser_id = EXCLUDED.adviser_id,
          male_learners = CASE WHEN EXCLUDED.male_learners IS NOT NULL THEN EXCLUDED.male_learners ELSE esf7_regular_sections.male_learners END,
          female_learners = CASE WHEN EXCLUDED.female_learners IS NOT NULL THEN EXCLUDED.female_learners ELSE esf7_regular_sections.female_learners END,
          number_of_learners = CASE WHEN EXCLUDED.number_of_learners > 0 THEN EXCLUDED.number_of_learners ELSE esf7_regular_sections.number_of_learners END,
          size_status = COALESCE(EXCLUDED.size_status, esf7_regular_sections.size_status),
          extras = EXCLUDED.extras,
          updated_at = NOW()
      `, pars).catch((err) => {
        console.warn("[persistNormalizedDraft] regular_sections batch warning:", err.message);
      });
    }
  }

  // 4. Workloads: Batch Upsert
  const allWorkloadRows = [];
  for (const p of rawPersonnelList) {
    if (!p) continue;
    const targetPId = draftIdToFinalId.get(p.id) || p.id;
    const rows = Array.isArray(p.workloadRows) ? p.workloadRows : (Array.isArray(p.workload_rows) ? p.workload_rows : []);
    for (const w of rows) {
      if (w) allWorkloadRows.push({ ...w, personnel_id: targetPId });
    }
  }
  if (Array.isArray(finalPayload.workloadRows)) {
    for (const w of finalPayload.workloadRows) {
      if (w) {
        const targetPId = draftIdToFinalId.get(w.personnel_id || w.personnelId) || w.personnel_id || w.personnelId;
        allWorkloadRows.push({ ...w, personnel_id: targetPId });
      }
    }
  }

  for (let i = 0; i < allWorkloadRows.length; i += 50) {
    const chunk = allWorkloadRows.slice(i, i + 50);
    const vals = [];
    const pars = [];
    let idx = 1;

    for (const w of chunk) {
      const pId = w.personnel_id;
      if (!pId || !validPersonnelIds.has(pId)) continue;
      const wId = w.id ? String(w.id).trim() : `WKL-${pId}-${Math.random().toString(36).substring(2, 7)}`;
      const startTime = sanitizeTime(w.startTime || w.start_time);
      const endTime = sanitizeTime(w.endTime || w.end_time);
      const days = Array.isArray(w.days) ? w.days : ["M", "T", "W", "TH", "F"];
      const extras = JSON.stringify(buildWorkloadExtras(w, {
        id: wId, personnel_id: pId, school_id: cleanId, school_year: schoolYear,
        grade_level: w.gradeLevel || w.grade_level || null,
        section_id: null, section_name: w.sectionName || w.section_name || null,
        subject: w.subject || "GENERAL", subject_id: w.subjectId || w.subject_id || null,
        remediation_subject: w.remediationSubject || w.remediation_subject || null,
        start_time: startTime, end_time: endTime, days, term: w.term || "1st"
      }));

      vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}, $${idx+12}::jsonb, $${idx+13}, $${idx+14}::jsonb, NOW())`);
      pars.push(
        wId, pId, cleanId, schoolYear,
        w.gradeLevel || w.grade_level || null,
        null,
        w.sectionName || w.section_name || null,
        w.subject || "GENERAL",
        w.subjectId || w.subject_id || null,
        w.remediationSubject || w.remediation_subject || null,
        startTime, endTime,
        JSON.stringify(days),
        w.term || "1st",
        extras
      );
      idx += 15;
    }

    if (vals.length > 0) {
      await client.query(`
        INSERT INTO esf7_workload_rows (
          id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
          subject, subject_id, remediation_subject, start_time, end_time, days, term, extras, updated_at
        )
        VALUES ${vals.join(", ")}
        ON CONFLICT (id) DO UPDATE SET
          personnel_id = EXCLUDED.personnel_id,
          school_id = EXCLUDED.school_id,
          school_year = EXCLUDED.school_year,
          grade_level = EXCLUDED.grade_level,
          section_id = EXCLUDED.section_id,
          section_name = EXCLUDED.section_name,
          subject = EXCLUDED.subject,
          subject_id = EXCLUDED.subject_id,
          remediation_subject = EXCLUDED.remediation_subject,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          days = EXCLUDED.days,
          term = EXCLUDED.term,
          extras = EXCLUDED.extras,
          updated_at = NOW()
      `, pars).catch((err) => {
        console.warn("[persistNormalizedDraft] workload_rows batch warning:", err.message);
      });
    }
  }
}

// Helper: Assemble complete draft payload directly from normalized relational tables (ZERO reads from school_drafts)
async function loadNormalizedDraft(schoolId, schoolYear) {
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
  const sidPair = [cleanSchoolId, `SCH-${cleanSchoolId}`];

  const [profileRes, schoolMasterRes, personnelRes, workloadRes, sectionsRes, nodeStatusRes, deletedRes] =
    await Promise.all([
      db
        .query(
          "SELECT * FROM esf7_school_profile WHERE school_id = ANY($1) ORDER BY updated_at DESC LIMIT 1",
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
      db
        .query("SELECT * FROM schools WHERE school_id = ANY($1) LIMIT 1", [
          sidPair,
        ])
        .catch(() => ({ rows: [] })),
      db
        .query(
          `SELECT 
            p.*,
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
            la.matrix_data
          FROM esf7_personnel_profile p
          LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
          LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
          LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
          WHERE p.school_id = ANY($1)
          ORDER BY p.last_name ASC, p.first_name ASC`,
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
      db
        .query(
          "SELECT * FROM esf7_workload_rows WHERE school_id = ANY($1) ORDER BY created_at ASC",
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
      db
        .query(
          "SELECT * FROM esf7_regular_sections WHERE school_id = ANY($1) ORDER BY grade_level ASC, section_name ASC",
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
      db
        .query(
          "SELECT * FROM esf7_school_node_status WHERE school_id = ANY($1) LIMIT 1",
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
      db
        .query(
          "SELECT personnel_id, prn, employee_no, full_name_clean FROM esf7_deleted_personnel WHERE school_id = ANY($1)",
          [sidPair],
        )
        .catch(() => ({ rows: [] })),
    ]);

  const prof = profileRes.rows[0] || {};
  const master = schoolMasterRes.rows[0] || {};

  const schoolInfo = {
    schoolId: cleanSchoolId,
    schoolName: master.school_name || `School ${cleanSchoolId}`,
    region: master.region || "",
    division: master.division || "",
    district: master.district || "",
    municipality: master.municipality || "",
    schoolYear: prof.school_year || schoolYear || "SY 26-27",
    iern: prof.iern || null,
    hasElemSpecialPrograms: Boolean(prof.has_elem_special_programs),
    elemSpecialPrograms: Array.isArray(prof.elem_special_programs)
      ? prof.elem_special_programs
      : [],
    hasJhsSpecialPrograms: Boolean(prof.has_jhs_special_programs),
    jhsSpecialPrograms: Array.isArray(prof.jhs_special_programs)
      ? prof.jhs_special_programs
      : [],
    shsCurriculumModel:
      prof.shs_curriculum_model || "Standard K-12 SHS Curriculum",
    has_es_sned: Boolean(prof.has_es_sned),
    has_es_als: Boolean(prof.has_es_als),
    has_es_iped: Boolean(prof.has_es_iped),
    has_es_mad: Boolean(prof.has_es_mad),
    has_jhs_sned: Boolean(prof.has_jhs_sned),
    has_jhs_als: Boolean(prof.has_jhs_als),
    has_jhs_iped: Boolean(prof.has_jhs_iped),
    has_jhs_mad: Boolean(prof.has_jhs_mad),
    has_shs_sned: Boolean(prof.has_shs_sned),
    has_shs_iped: Boolean(prof.has_shs_iped),
    has_shs_mad: Boolean(prof.has_shs_mad),
    hasSned: Boolean(prof.has_sned),
    hasAls: Boolean(prof.has_als),
    hasIped: Boolean(prof.has_iped),
    hasMadrasah: Boolean(prof.has_madrasah),
    inclusivePrograms: Array.isArray(prof.inclusive_programs)
      ? prof.inclusive_programs
      : [],
    hasShifts: Boolean(prof.has_shifts),
    shiftsConfig: prof.shifts_config || master.shifts_config || {},
    curricularConfigSaved: profileRes.rows.length > 0,
    certifiedBy: master.certified_by || null,
    certifiedSignature: master.certified_signature || null,
    certifiedAt: master.certified_at || null,
  };

  // Group workloads by personnel_id
  const workloadsByPerson = new Map();
  for (const w of workloadRes.rows) {
    const pId = String(w.personnel_id || "").trim();
    if (!pId) continue;
    if (!workloadsByPerson.has(pId)) workloadsByPerson.set(pId, []);
    workloadsByPerson.get(pId).push({
      id: w.id,
      sectionId: w.section_id,
      sectionName: w.section_name,
      gradeLevel: w.grade_level,
      subject: w.subject,
      subjectId: w.subject_id,
      remediationSubject: w.remediation_subject,
      startTime: w.start_time,
      endTime: w.end_time,
      days: Array.isArray(w.days)
        ? w.days
        : typeof w.days === "string"
          ? w.days.split(",")
          : [],
      term: w.term,
      schoolYear: w.school_year,
    });
  }

  // Build deleted set
  const delKeys = new Set();
  for (const d of deletedRes.rows) {
    if (d.personnel_id) delKeys.add(String(d.personnel_id).trim().toLowerCase());
    if (d.prn) delKeys.add(String(d.prn).trim().toLowerCase());
    if (d.employee_no) delKeys.add(String(d.employee_no).trim().toLowerCase());
    if (d.full_name_clean)
      delKeys.add(String(d.full_name_clean).trim().toLowerCase());
  }

  // Format personnel
  const personnel = [];
  for (const p of personnelRes.rows) {
    const idKey = String(p.id || "").trim().toLowerCase();
    const prnKey = String(p.prn || "").trim().toLowerCase();
    const empKey = String(p.employee_no || "").trim().toLowerCase();
    const nameKey =
      `${String(p.first_name || "").trim()} ${String(p.last_name || "").trim()}`.toLowerCase();
    if (
      delKeys.has(idKey) ||
      delKeys.has(prnKey) ||
      (empKey && delKeys.has(empKey)) ||
      (nameKey && delKeys.has(nameKey))
    ) {
      continue;
    }

    const wkl =
      workloadsByPerson.get(String(p.id)) ||
      workloadsByPerson.get(String(p.prn)) ||
      [];

    personnel.push({
      id: p.id,
      prn: p.prn,
      legacyId: p.legacy_id,
      schoolId: p.school_id,
      schoolYear: p.school_year || schoolYear,
      firstName: p.first_name,
      lastName: p.last_name,
      middleName: p.middle_name,
      extName: p.ext_name,
      gender: p.gender,
      birthDate: p.birth_date,
      depedEmail: p.deped_email,
      personalEmail: p.personal_email,
      contactNumber: p.contact_number,
      employeeNo: p.employee_no,
      isSchoolHead: Boolean(p.is_school_head),
      position: p.position || "",
      positionCategory: p.position_category || "",
      stepIncrement: p.step_increment,
      fundSource: p.fund_source,
      natureOfAppointment: p.nature_of_appointment,
      hiringArrangement: p.hiring_arrangement,
      deploymentStatus: p.deployment_status,
      assignedSchools: p.assigned_schools,
      gradeLevelsTaught: p.grade_levels_taught,
      firstServiceDate: p.first_service_date,
      lastPromotionDate: p.last_promotion_date,
      newStationDate: p.new_station_date,
      lastLateralMovementDate: p.last_lateral_movement_date,
      highestEducationalAttainment: p.highest_educational_attainment,
      collegeDegree: p.college_degree,
      collegeDegrees: Array.isArray(p.college_degrees) ? p.college_degrees : [],
      degreeRows: Array.isArray(p.college_degrees) ? p.college_degrees : [],
      major: p.major,
      minor: p.minor,
      postGraduateDegree: p.post_graduate_degree,
      postGraduateDiscipline: p.post_graduate_discipline,
      eligibility: Array.isArray(p.eligibility) ? p.eligibility : [],
      prcSpecialization: p.prc_specialization,
      matrixData: p.matrix_data || {},
      workloadRows: wkl,
      is_db_saved: true,
    });
  }

  // Format sections
  let classSections = sectionsRes.rows.map((s) => ({
    id: s.id,
    schoolId: s.school_id,
    schoolYear: s.school_year,
    gradeLevel: s.grade_level,
    sectionName: s.section_name,
    sectionType: s.section_type || "MONO GRADE",
    advisorId:
      s.adviser_id || s.advisor_id ? String(s.adviser_id || s.advisor_id) : null,
    numberOfLearners: s.number_of_learners,
    maleLearners: s.male_learners,
    femaleLearners: s.female_learners,
    advisoryMinutes:
      s.extras?.advisoryMinutes || s.advisory_minutes || 300,
    hgpMinutes: s.extras?.hgpMinutes || s.hgp_minutes || 60,
  }));

  // Journey state from node status
  const nodeStatus = nodeStatusRes.rows[0];
  const journeyState = nodeStatus?.nodes
    ? {
        completedNodes: Object.keys(nodeStatus.nodes)
          .filter((k) => nodeStatus.nodes[k]?.status === "COMPLETED")
          .map((k) => k.replace(/^node_\d+_/, "")),
        currentNode: "school",
      }
    : { completedNodes: [], currentNode: "school" };

  return {
    schoolInfo,
    personnel: dedupePersonnel(personnel),
    classSections: dedupeSections(classSections),
    deletedPersonnelIds: Array.from(delKeys),
    journey_state: journeyState,
    lastUpdated: prof.updated_at || new Date().toISOString(),
  };
}

// GET /api/school/draft - Reads directly from normalized relational tables (ZERO reads from school_drafts)
const handleGetDraft = async (req, res) => {
  try {
    const rawSchoolId =
      req.query.school_id ||
      req.query.schoolId ||
      req.query.schoolID ||
      req.headers["x-school-id"] ||
      getSchoolIdFromRequest(req) ||
      "123456";
    const schoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
    const schoolYear = req.query.schoolYear || "SY 26-27";

    const payload = await loadNormalizedDraft(schoolId, schoolYear);

    res.set("Cache-Control", "no-store");
    res.json({
      payload: payload,
      updatedAt: payload.lastUpdated || new Date().toISOString(),
      version: 1,
    });
  } catch (err) {
    console.error("[DraftLoad][FAIL]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// PUT / POST /api/school/draft
const handleSaveDraft = async (req, res) => {
  const startedAt = Date.now();
  let schoolId = "?";
  let schoolYear = "SY 26-27";
  try {
    const { payload } = req.body;
    schoolYear = req.body.schoolYear || schoolYear;
    const rawBase = req.body.baseVersion;
    const baseVersion =
      rawBase === undefined || rawBase === null || rawBase === ""
        ? null
        : Number(rawBase);

    if (!payload) {
      return res.status(400).json({ error: "Missing draft payload" });
    }
    if (baseVersion !== null && !Number.isFinite(baseVersion)) {
      return res.status(400).json({ error: "Invalid baseVersion" });
    }

    const explicitId =
      payload.schoolInfo &&
      (payload.schoolInfo.schoolId || payload.schoolInfo.school_id);
    const rawSchoolId =
      explicitId ||
      req.query.schoolId ||
      req.query.school_id ||
      getSchoolIdFromRequest(req) ||
      "123456";
    schoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();

    // Load baseline from normalized tables instead of reading from school_drafts
    const existingPayload = await loadNormalizedDraft(schoolId, schoolYear).catch(() => null);
    const oldPersonnel = Array.isArray(existingPayload?.personnel)
      ? existingPayload.personnel
      : [];
    const oldSections = Array.isArray(existingPayload?.classSections)
      ? existingPayload.classSections
      : [];

    const finalPayload = { ...payload };

    // 1. Personnel Deletion Filter & Protection
    if (Array.isArray(payload.personnel)) {
      const cleanSchoolId = schoolId.replace(/^SCH-/i, "");
      const sidPair = [schoolId, cleanSchoolId, "SCH-" + cleanSchoolId];

      const delDbRes = await Promise.all([
        db
          .query(
            `SELECT personnel_id, prn, employee_no, full_name_clean FROM esf7_deleted_personnel WHERE school_id = ANY($1)`,
            [sidPair],
          )
          .catch(() => ({ rows: [] })),
        db.getStagingPool
          ? db
              .getStagingPool()
              .query(
                `SELECT personnel_id, prn, employee_no, full_name_clean FROM esf7_deleted_personnel WHERE school_id = ANY($1)`,
                [sidPair],
              )
              .catch(() => ({ rows: [] }))
          : Promise.resolve({ rows: [] }),
      ]).then(([r1, r2]) => [...(r1.rows || []), ...(r2.rows || [])]);

      const dbTombstoneKeys = delDbRes
        .flatMap((d) => [
          d.personnel_id,
          d.prn,
          d.employee_no,
          d.full_name_clean,
        ])
        .filter(Boolean)
        .map((k) => String(k).trim().toLowerCase());

      const rawDeletedPers = [
        ...(Array.isArray(payload.deletedPersonnelIds)
          ? payload.deletedPersonnelIds
          : []),
        ...(Array.isArray(existingPayload?.deletedPersonnelIds)
          ? existingPayload.deletedPersonnelIds
          : []),
        ...dbTombstoneKeys,
      ];

      const deletedPersSet = new Set(
        rawDeletedPers
          .map((k) => String(k).trim().toLowerCase())
          .filter(
            (k) =>
              k &&
              k.length >= 2 &&
              k !== "teacher staff" &&
              k !== "teacher" &&
              k !== "staff",
          ),
      );

      if (deletedPersSet.size > 0) {
        finalPayload.deletedPersonnelIds = Array.from(deletedPersSet);
      }

      if (
        payload.personnel.length === 0 &&
        oldPersonnel.length > 0 &&
        deletedPersSet.size === 0
      ) {
        finalPayload.personnel = oldPersonnel;
      } else {
        if (deletedPersSet.size > 0) {
          finalPayload.personnel = payload.personnel.filter((p) => {
            const idKey = String(p.id || "")
              .trim()
              .toLowerCase();
            const prnKey = String(p.prn || "")
              .trim()
              .toLowerCase();
            const empKey = String(p.employeeNo || p.employee_no || "")
              .trim()
              .toLowerCase();
            const nameKey =
              `${String(p.firstName || "").trim()} ${String(p.lastName || "").trim()}`.toLowerCase();
            const stripId = idKey.replace(/^per-/, "").replace(/^prn-/, "");
            const stripPrn = prnKey.replace(/^prn-/, "");
            return (
              !deletedPersSet.has(idKey) &&
              !deletedPersSet.has(prnKey) &&
              (!empKey || !deletedPersSet.has(empKey)) &&
              (!nameKey || !deletedPersSet.has(nameKey)) &&
              (!stripId || !deletedPersSet.has(stripId)) &&
              (!stripPrn || !deletedPersSet.has(stripPrn))
            );
          });
        } else {
          finalPayload.personnel = payload.personnel;
        }
      }
    }

    // 2. Class Sections: Per-record upsert keyed by stable id
    const incomingSections = Array.isArray(payload.classSections)
      ? payload.classSections
      : Array.isArray(payload.sections)
        ? payload.sections
        : null;
    if (incomingSections !== null) {
      const allowDeletion = Boolean(
        payload.allowSectionDeletion || req.body.allowSectionDeletion,
      );
      const deletedIds = Array.isArray(payload.deletedSectionIds)
        ? new Set(payload.deletedSectionIds.map(String))
        : new Set();

      const getPrimaryId = (s) => {
        return s && s.id && String(s.id).trim() ? String(s.id).trim() : null;
      };

      const getNaturalKey = (s) => {
        if (!s) return null;
        const gl = String(s.gradeLevel || s.grade_level || "")
          .trim()
          .toUpperCase();
        const sn = String(s.sectionName || s.section_name || "")
          .trim()
          .toUpperCase();
        const st = String(s.sectionType || s.section_type || "MONO GRADE")
          .trim()
          .toUpperCase();
        if (!gl || !sn) return null;
        return `${gl}::${sn}::${st}`;
      };

      if (allowDeletion && oldSections.length > 0) {
        const incomingIdSet = new Set(
          incomingSections.map(getPrimaryId).filter(Boolean),
        );
        oldSections.forEach((oldSec) => {
          const oldId = getPrimaryId(oldSec);
          if (oldId && !incomingIdSet.has(oldId)) {
            deletedIds.add(oldId);
          }
        });
      }

      if (oldSections.length > 0) {
        if (incomingSections.length === 0 && !allowDeletion) {
          console.warn(
            `[DraftSave] Prevented empty section array from overwriting ${oldSections.length} existing sections for school ${schoolId}`,
          );
          finalPayload.classSections = oldSections;
        } else if (
          !allowDeletion &&
          incomingSections.length < oldSections.length &&
          deletedIds.size === 0
        ) {
          console.warn(
            `[DraftSave] Merging sections by stable ID: incoming ${incomingSections.length} vs existing ${oldSections.length} for school ${schoolId}`,
          );
          const sectionMap = new Map();
          const naturalKeyIndex = new Map();

          oldSections.forEach((s) => {
            if (!s) return;
            const pid = getPrimaryId(s);
            const nKey = getNaturalKey(s);
            if (pid && deletedIds.has(pid)) return;

            const canonicalKey = pid || nKey;
            if (!canonicalKey) return;

            if (nKey && naturalKeyIndex.has(nKey)) {
              const prevKey = naturalKeyIndex.get(nKey);
              const prev = sectionMap.get(prevKey);
              sectionMap.set(prevKey, { ...prev, ...s });
            } else {
              sectionMap.set(canonicalKey, { ...s });
              if (nKey) naturalKeyIndex.set(nKey, canonicalKey);
            }
          });

          incomingSections.forEach((s) => {
            if (!s) return;
            const pid = getPrimaryId(s);
            const nKey = getNaturalKey(s);
            if (pid && deletedIds.has(pid)) return;

            let targetKey = null;
            if (pid && sectionMap.has(pid)) {
              targetKey = pid;
            } else if (nKey && naturalKeyIndex.has(nKey)) {
              targetKey = naturalKeyIndex.get(nKey);
            } else {
              targetKey = pid || nKey;
            }

            if (targetKey && sectionMap.has(targetKey)) {
              const prev = sectionMap.get(targetKey);
              const merged = { ...prev, ...s };
              if (
                (s.numberOfLearners === null ||
                  s.numberOfLearners === undefined ||
                  s.numberOfLearners === 0) &&
                prev.numberOfLearners > 0
              ) {
                merged.numberOfLearners = prev.numberOfLearners;
                merged.maleLearners = prev.maleLearners;
                merged.femaleLearners = prev.femaleLearners;
              }
              sectionMap.set(targetKey, merged);
            } else if (targetKey) {
              sectionMap.set(targetKey, { ...s });
              if (nKey) naturalKeyIndex.set(nKey, targetKey);
            }
          });

          finalPayload.classSections = Array.from(sectionMap.values());
        } else {
          finalPayload.classSections = incomingSections;
        }
      } else {
        finalPayload.classSections = incomingSections;
      }
    }

    if (Array.isArray(finalPayload.classSections)) {
      finalPayload.classSections = dedupeSections(finalPayload.classSections);
    }
    if (Array.isArray(finalPayload.sections)) {
      finalPayload.sections = dedupeSections(finalPayload.sections);
    }
    if (Array.isArray(finalPayload.personnel)) {
      finalPayload.personnel = dedupePersonnel(finalPayload.personnel);
    }

    // 3. Atomic school_drafts write
    const client = await acquireClient();
    let saved = null;

    try {
      await client.query("BEGIN");

      try {
        if (withVersion) {
          const sql =
            baseVersion === null
              ? `INSERT INTO school_drafts (school_id, school_year, payload, version, updated_at)
                 VALUES ($1, $2, $3, 1, NOW())
                 ON CONFLICT (school_id, school_year)
                 DO UPDATE SET payload = EXCLUDED.payload, version = school_drafts.version + 1, updated_at = NOW()
                 RETURNING version, updated_at`
              : `INSERT INTO school_drafts (school_id, school_year, payload, version, updated_at)
                 VALUES ($1, $2, $3, $4 + 1, NOW())
                 ON CONFLICT (school_id, school_year)
                 DO UPDATE SET payload = EXCLUDED.payload, version = school_drafts.version + 1, updated_at = NOW()
                 WHERE school_drafts.version = $4
                 RETURNING version, updated_at`;
          const params =
            baseVersion === null
              ? [schoolId, schoolYear, JSON.stringify(finalPayload)]
              : [schoolId, schoolYear, JSON.stringify(finalPayload), baseVersion];
          const r = await client.query(sql, params);

          if (r.rows.length === 0) {
            await client.query("ROLLBACK");
            const cur = await db.query(
              "SELECT version, updated_at FROM school_drafts WHERE school_id = $1 AND school_year = $2",
              [schoolId, schoolYear],
            );
            const curRow = cur.rows[0] || {};
            console.warn(
              `[DraftSave][CONFLICT] school=${schoolId} user=${(req.auth && req.auth.uid) || "-"} year=${schoolYear} base=${baseVersion} current=${curRow.version}`,
            );
            return res.status(409).json({
              error: "Draft was changed by another session",
              conflict: true,
              currentVersion: Number(curRow.version),
              updatedAt: curRow.updated_at,
            });
          }
          saved = {
            version: Number(r.rows[0].version),
            updatedAt: r.rows[0].updated_at,
          };
        } else {
          const r = await client.query(
            `INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (school_id, school_year)
             DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
             RETURNING updated_at`,
            [schoolId, schoolYear, JSON.stringify(finalPayload)],
          );
          saved = { version: undefined, updatedAt: r.rows[0].updated_at };
        }
      } catch (draftErr) {
        if (draftErr.code === "42P01") {
          console.warn("[DraftSave] school_drafts table not found or deprecated; skipping draft cache write.");
          saved = { version: baseVersion ? Number(baseVersion) + 1 : 1, updatedAt: new Date().toISOString() };
        } else {
          throw draftErr;
        }
      }

      await client.query("COMMIT");
      saved = {
        version: baseVersion ? Number(baseVersion) + 1 : 1,
        updatedAt: new Date().toISOString(),
      };
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      if (typeof client.release === "function") {
        client.release();
      }
    }

    console.log(
      `[DraftSave][OK] school=${schoolId} user=${(req.auth && req.auth.uid) || "-"} year=${schoolYear} base=${baseVersion} version=${saved.version} ms=${Date.now() - startedAt}`,
    );

    cacheService.delPattern(`dashboard:stats:${schoolId}:*`).catch(() => {});
    if (!req.headers["x-smoke-test"]) {
      syncDraftToNodeStatus(schoolId, schoolYear, finalPayload).catch((e) => {
        console.warn("[SyncDraftToNodeStatus Background Warning]:", e.message);
      });
    }

    // Persist normalized relational tables
    if (req.headers["x-sync-normalize"] === "true") {
      let normClient = null;
      try {
        normClient = await acquireClient();
        await persistNormalizedDraft(normClient, schoolId, schoolYear, finalPayload);
      } finally {
        if (normClient && typeof normClient.release === "function") {
          normClient.release();
        }
      }
    } else {
      queueNormalizedPersistence(schoolId, schoolYear, finalPayload);
    }

    res.json({
      success: true,
      version: saved.version,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    console.error(
      `[DraftSave][FAIL] school=${schoolId} year=${schoolYear} ms=${Date.now() - startedAt}: ${err.message}`,
    );
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/school/draft
router.delete("/draft", async (req, res) => {
  try {
    const rawSchoolId = getSchoolIdFromRequest(req) || "123456";
    const cleanSchoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
    const schoolYear = req.query.schoolYear || "SY 26-27";

    try {
      await db.query(
        "DELETE FROM school_drafts WHERE school_id = $1 AND school_year = $2",
        [cleanSchoolId, schoolYear],
      );
    } catch (e) {
      if (e.code !== "42P01") throw e;
    }

    res.json({ success: true, message: "Draft deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/draft", handleGetDraft);
router.put("/draft", handleSaveDraft);
router.post("/draft", handleSaveDraft);

module.exports = router;
module.exports.handleGetDraft = handleGetDraft;
module.exports.handleSaveDraft = handleSaveDraft;
module.exports.persistNormalizedDraft = persistNormalizedDraft;
module.exports.syncDraftToNodeStatus = syncDraftToNodeStatus;
module.exports.safeDraftQuery = safeDraftQuery;
