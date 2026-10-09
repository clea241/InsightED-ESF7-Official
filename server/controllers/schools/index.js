const express = require("express");
const router = express.Router();
const db = require("../../db");
const { insightEdPool, usersDbPool } = require("../../db");
const cacheService = require("../../services/cacheService");

const { getSchoolIdFromRequest } = require("../../utils/auth");
const { dedupeSections, dedupePersonnel } = require("../../utils/draftDedupe");
const { resolveTestDivision } = require("../../utils/divisionTestRegistry");

// GET school info directly from unit1_school_identity

function parseCurricularOffering(rawOff) {
  const s = String(rawOff || "")
    .toUpperCase()
    .trim();
  if (!s) return ["Elementary"];

  if (s.includes("PURELY ES") || s === "PURELY ES") {
    return ["Elementary"];
  } else if (s.includes("PURELY JHS") || s === "PURELY JHS") {
    return ["JHS"];
  } else if (s.includes("PURELY SHS") || s === "PURELY SHS") {
    return ["SHS"];
  } else if (
    s.includes("ES AND JHS") ||
    s.includes("K TO 10") ||
    s.includes("K-10") ||
    s.includes("ELEMENTARY + JHS") ||
    s.includes("ELEMENTARY AND JUNIOR HIGH")
  ) {
    return ["Elementary", "JHS"];
  } else if (
    s.includes("JHS WITH SHS") ||
    s.includes("JHS AND SHS") ||
    s.includes("JUNIOR HIGH AND SENIOR HIGH") ||
    s.includes("JUNIOR HIGH & SENIOR HIGH") ||
    (s.includes("JUNIOR") && s.includes("SENIOR")) ||
    s.includes("7 TO 12") ||
    s.includes("7-12")
  ) {
    return ["JHS", "SHS"];
  } else if (
    s.includes("ALL OFFERING") ||
    s.includes("K TO 12") ||
    s.includes("K-12") ||
    s.includes("COMPREHENSIVE")
  ) {
    return ["Elementary", "JHS", "SHS"];
  }

  const offerings = [];
  if (
    s.includes("ELEM") ||
    s.includes("ES") ||
    s.includes("PRIMARY") ||
    s.includes("KINDER")
  ) {
    offerings.push("Elementary");
  }
  if (
    s.includes("JHS") ||
    s.includes("JUNIOR") ||
    s.includes("SEC") ||
    s.includes("HIGH")
  ) {
    offerings.push("JHS");
  }
  if (s.includes("SHS") || s.includes("SENIOR")) {
    offerings.push("SHS");
  }
  return offerings.length > 0 ? Array.from(new Set(offerings)) : ["Elementary"];
}

// GET school info with master identity resolution & local profile overlay
const handleGetSchool = async (req, res) => {
  try {
    const paramId =
      req.params && req.params.schoolId && req.params.schoolId !== "draft"
        ? req.params.schoolId
        : null;
    const rawSchoolId =
      paramId ||
      req.query.schoolId ||
      req.query.school_id ||
      req.headers["x-school-id"] ||
      getSchoolIdFromRequest(req) ||
      "199999";
    const cleanSchoolId = String(rawSchoolId).replace("SCH-", "").trim();

    let schoolName = `School ${cleanSchoolId}`;
    let region = "";
    let division = "";
    let district = "";
    let rawMCOC = null;
    let numberOfShifts = "1";
    let schoolYear = "SY 26-27";
    let certifiedBy = null;
    let certifiedSignature = null;
    let certifiedAt = null;
    let subjectsConfig = null;
    let hasElemSpecialPrograms = false;
    let hasJhsSpecialPrograms = false;
    let jhsSpecialPrograms = [];
    let shsCurriculumModel = "Standard K-12 SHS Curriculum";
    let specialPrograms = [];

    // Check 230 SDO and 7 MCOC archetype test accounts
    const testDiv = resolveTestDivision(cleanSchoolId);
    if (testDiv) {
      schoolName =
        testDiv.schoolName || `${testDiv.division} DEMONSTRATION SCHOOL`;
      region = testDiv.region || "REGION V";
      division = testDiv.division || "DIVISION TEST";
      district = testDiv.district || "DIVISION DEMO DISTRICT";
      rawMCOC = testDiv.mcoc || testDiv.curricularOffering || "ALL OFFERING";
    } else if (cleanSchoolId === "199999") {
      schoolName = "TEST K-12 INTEGRATED SCHOOL";
      region = "REGION V";
      division = "ALBAY";
      district = "DARAGA NORTH";
      rawMCOC = "ALL OFFERING";
    } else {
      // 1. Query live schools_iern table in users_database (Primary source of truth for live MCOC updates)
      const usersIernMatch = await usersDbPool
        .query(
          `SELECT school_id, school_name, region, division, district, mcoc, status 
         FROM schools_iern WHERE school_id::text = $1 LIMIT 1`,
          [cleanSchoolId],
        )
        .catch(() => ({ rows: [] }));

      if (usersIernMatch.rows.length > 0) {
        const row = usersIernMatch.rows[0];
        if (row.school_name) schoolName = row.school_name;
        if (row.region) region = row.region;
        if (row.division) division = row.division;
        if (row.district) district = row.district;
        if (row.mcoc) rawMCOC = row.mcoc;
      }

      // 2. Query master 2025-2026_SchoolID table (official DepEd 46k+ schools with accurate region, division, district, mcoc)
      if (!rawMCOC || !schoolName || schoolName === `School ${cleanSchoolId}`) {
        const schIdMatch = await insightEdPool
          .query(
            `SELECT "schoool_id", "school_name", "region", "division", "district", "mcoc" 
           FROM "2025-2026_SchoolID" WHERE "schoool_id" = $1 LIMIT 1`,
            [parseInt(cleanSchoolId, 10) || -1],
          )
          .catch(() => ({ rows: [] }));

        if (schIdMatch.rows.length > 0) {
          const row = schIdMatch.rows[0];
          if (!schoolName || schoolName === `School ${cleanSchoolId}`) {
            if (row.school_name) schoolName = row.school_name;
          }
          if (!region && row.region) region = row.region;
          if (!division && row.division) division = row.division;
          if (!district && row.district) district = row.district;
          if (!rawMCOC && row.mcoc) rawMCOC = row.mcoc;
        }
      }

      // 3. Query schools_IERN table in insightEd
      if (!rawMCOC || !schoolName || schoolName === `School ${cleanSchoolId}`) {
        const iernMatch = await insightEdPool
          .query(
            `SELECT "SchoolID", "School_Name", "Region", "Division", "District", "Curricular_Offering" 
           FROM "schools_IERN" WHERE "SchoolID" = $1 LIMIT 1`,
            [cleanSchoolId],
          )
          .catch(() => ({ rows: [] }));

        if (iernMatch.rows.length > 0) {
          const row = iernMatch.rows[0];
          if (!schoolName || schoolName === `School ${cleanSchoolId}`) {
            if (row.School_Name) schoolName = row.School_Name;
          }
          if (!region && row.Region && row.Region !== "CENTRAL OFFICE")
            region = row.Region;
          if (!division && row.Division && row.Division !== "BHROD-SED")
            division = row.Division;
          if (!district && row.District) district = row.District;
          if (!rawMCOC && row.Curricular_Offering)
            rawMCOC = row.Curricular_Offering;
        }
      }

      // 3. Query unit1_school_identity
      if (!rawMCOC || !schoolName || schoolName === `School ${cleanSchoolId}`) {
        const unit1Match = await insightEdPool
          .query(
            "SELECT * FROM unit1_school_identity WHERE CAST(school_id AS TEXT) = $1 OR CAST(school_id AS TEXT) = $2 ORDER BY updated_at DESC LIMIT 1",
            [cleanSchoolId, rawSchoolId],
          )
          .catch(() => ({ rows: [] }));

        if (unit1Match.rows.length > 0) {
          const row = unit1Match.rows[0];
          if (!schoolName || schoolName === `School ${cleanSchoolId}`)
            schoolName = row.school_name || schoolName;
          if (!region) region = row.region || "";
          if (!division) division = row.division || "";
          if (!district) district = row.district || "";
          if (!rawMCOC && row.curricular_offering)
            rawMCOC = row.curricular_offering;
        }
      }

      // 4. Query esf7_database or esf7_database_dummy
      if (!schoolName || schoolName === `School ${cleanSchoolId}`) {
        let esfMatch = await insightEdPool
          .query(
            `SELECT DISTINCT school_name, division, region, muncipality as district FROM esf7_database WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1 LIMIT 1`,
            [cleanSchoolId],
          )
          .catch(() => ({ rows: [] }));

        if (esfMatch.rows.length === 0) {
          esfMatch = await insightEdPool
            .query(
              `SELECT DISTINCT school_name, division, region, muncipality as district FROM esf7_database_dummy WHERE CAST(school_id AS TEXT) = $1 OR CAST(schoool_id AS TEXT) = $1 LIMIT 1`,
              [cleanSchoolId],
            )
            .catch(() => ({ rows: [] }));
        }

        if (esfMatch.rows.length > 0) {
          const esf = esfMatch.rows[0];
          if (esf.school_name) schoolName = esf.school_name;
          if (!region && esf.region)
            region = String(esf.region).toUpperCase().startsWith("REGION")
              ? esf.region
              : `REGION ${esf.region}`;
          if (!division && esf.division) division = esf.division;
          if (!district && esf.district) district = esf.district;
        }
      }
    }

    // Determine Curricular Offering
    let curricularOffering =
      cleanSchoolId === "199999"
        ? ["Elementary", "JHS", "SHS"]
        : parseCurricularOffering(rawMCOC);

    // 5. Query local schools table (for shifts, subjects_config, certifications)
    const localSchoolRes = await db
      .query(
        "SELECT * FROM schools WHERE school_id = $1 OR school_id = $2 LIMIT 1",
        [cleanSchoolId, `SCH-${cleanSchoolId}`],
      )
      .catch(() => ({ rows: [] }));

    if (localSchoolRes.rows.length > 0) {
      const ls = localSchoolRes.rows[0];
      if (ls.certified_by) certifiedBy = ls.certified_by;
      if (ls.certified_signature) certifiedSignature = ls.certified_signature;
      if (ls.certified_at) certifiedAt = ls.certified_at;
      if (ls.subjects_config) subjectsConfig = ls.subjects_config;
      if (ls.number_of_shifts) numberOfShifts = String(ls.number_of_shifts);
      if (ls.school_year) schoolYear = ls.school_year;
    }

    let hasElemInclusive = false;
    let elemInclusivePrograms = [];
    let hasJhsInclusive = false;
    let jhsInclusivePrograms = [];
    let hasShsInclusive = false;
    let shsInclusivePrograms = [];
    let inclusivePrograms = [];
    let hasAls = false;
    let hasSned = false;
    let hasIped = false;
    let hasMadrasah = false;
    let hasShifts = false;
    let shiftStartTime = null;
    let shiftEndTime = null;
    let shiftsConfig = {};
    let elemSpecialPrograms = [];

    // 6. Query esf7_school_profile (for user-configured special programs & SHS model & inclusive programs)
    const localProf = await db
      .query(
        "SELECT * FROM esf7_school_profile WHERE school_id = $1 OR school_id = $2 LIMIT 1",
        [cleanSchoolId, `SCH-${cleanSchoolId}`],
      )
      .catch(() => ({ rows: [] }));

    if (localProf.rows.length > 0) {
      const pRow = localProf.rows[0];
      if (pRow.school_year) schoolYear = pRow.school_year;
      if (pRow.shs_curriculum_model)
        shsCurriculumModel = pRow.shs_curriculum_model;
      hasElemSpecialPrograms = Boolean(pRow.has_elem_special_programs);
      elemSpecialPrograms = Array.isArray(pRow.elem_special_programs)
        ? pRow.elem_special_programs
        : hasElemSpecialPrograms
          ? ["SPECIAL SCIENCE ELEMENTARY SCHOOL"]
          : [];
      hasJhsSpecialPrograms = Boolean(pRow.has_jhs_special_programs);
      if (Array.isArray(pRow.jhs_special_programs)) {
        jhsSpecialPrograms = pRow.jhs_special_programs;
      }

      hasElemInclusive = Boolean(
        pRow.has_elem_inclusive ?? pRow.raw_payload?.hasElemInclusive,
      );
      elemInclusivePrograms = Array.isArray(pRow.elem_inclusive_programs)
        ? pRow.elem_inclusive_programs
        : Array.isArray(pRow.raw_payload?.elemInclusivePrograms)
          ? pRow.raw_payload.elemInclusivePrograms
          : [];

      hasJhsInclusive = Boolean(
        pRow.has_jhs_inclusive ?? pRow.raw_payload?.hasJhsInclusive,
      );
      jhsInclusivePrograms = Array.isArray(pRow.jhs_inclusive_programs)
        ? pRow.jhs_inclusive_programs
        : Array.isArray(pRow.raw_payload?.jhsInclusivePrograms)
          ? pRow.raw_payload.jhsInclusivePrograms
          : [];

      hasShsInclusive = Boolean(
        pRow.has_shs_inclusive ?? pRow.raw_payload?.hasShsInclusive,
      );
      shsInclusivePrograms = Array.isArray(pRow.shs_inclusive_programs)
        ? pRow.shs_inclusive_programs
        : Array.isArray(pRow.raw_payload?.shsInclusivePrograms)
          ? pRow.raw_payload.shsInclusivePrograms
          : [];

      inclusivePrograms = Array.isArray(pRow.inclusive_programs)
        ? pRow.inclusive_programs
        : Array.isArray(pRow.raw_payload?.inclusivePrograms)
          ? pRow.raw_payload.inclusivePrograms
          : [
              ...(hasElemInclusive ? elemInclusivePrograms : []),
              ...(hasJhsInclusive ? jhsInclusivePrograms : []),
              ...(hasShsInclusive ? shsInclusivePrograms : []),
            ];

      hasAls = Boolean(
        pRow.has_als ??
        inclusivePrograms.some((p) => String(p).toUpperCase().includes("ALS")),
      );
      hasSned = Boolean(
        pRow.has_sned ??
        inclusivePrograms.some(
          (p) =>
            String(p).toUpperCase().includes("SNED") ||
            String(p).toUpperCase().includes("SPED"),
        ),
      );
      hasIped = Boolean(
        pRow.has_iped ??
        inclusivePrograms.some(
          (p) =>
            String(p).toUpperCase().includes("IPED") ||
            String(p).toUpperCase().startsWith("IP-"),
        ),
      );
      hasMadrasah = Boolean(
        pRow.has_madrasah ??
        inclusivePrograms.some(
          (p) =>
            String(p).toUpperCase().includes("MADRASAH") ||
            String(p).toUpperCase().includes("MEP") ||
            String(p).toUpperCase().includes("ALIVE"),
        ),
      );

      hasShifts = Boolean(pRow.has_shifts ?? pRow.raw_payload?.hasShifts);
      shiftStartTime =
        pRow.shift_start_time || pRow.raw_payload?.shiftStartTime || null;
      shiftEndTime =
        pRow.shift_end_time || pRow.raw_payload?.shiftEndTime || null;
      shiftsConfig = pRow.shifts_config || pRow.raw_payload?.shiftsConfig || {};

      if (pRow.raw_payload && Array.isArray(pRow.raw_payload.specialPrograms)) {
        specialPrograms = pRow.raw_payload.specialPrograms;
      } else {
        const progs = [];
        if (hasElemSpecialPrograms)
          progs.push("SPECIAL SCIENCE ELEMENTARY SCHOOL");
        if (hasJhsSpecialPrograms && Array.isArray(jhsSpecialPrograms))
          progs.push(...jhsSpecialPrograms);
        specialPrograms = progs;
      }
    }

    // Align special programs, inclusive programs, and curriculum model with active offerings
    const isElem = curricularOffering.includes("Elementary");
    const isJHS = curricularOffering.includes("JHS");
    const isSHS = curricularOffering.includes("SHS");

    if (!isElem) {
      hasElemSpecialPrograms = false;
      elemSpecialPrograms = [];
      hasElemInclusive = false;
      elemInclusivePrograms = [];
      specialPrograms = specialPrograms.filter(
        (p) =>
          !p.toUpperCase().includes("ELEMENTARY") &&
          !p.toUpperCase().includes("SSES"),
      );
      inclusivePrograms = inclusivePrograms.filter((p) => !p.endsWith("-ES"));
    }
    if (!isJHS) {
      hasJhsSpecialPrograms = false;
      jhsSpecialPrograms = [];
      hasJhsInclusive = false;
      jhsInclusivePrograms = [];
      specialPrograms = specialPrograms.filter(
        (p) =>
          p.toUpperCase().includes("ELEMENTARY") ||
          p.toUpperCase().includes("SSES"),
      );
      inclusivePrograms = inclusivePrograms.filter((p) => !p.endsWith("-JHS"));
    }
    if (!isSHS) {
      shsCurriculumModel = null;
      hasShsInclusive = false;
      shsInclusivePrograms = [];
      inclusivePrograms = inclusivePrograms.filter((p) => !p.endsWith("-SHS"));
    }

    hasAls = inclusivePrograms.some((p) =>
      String(p).toUpperCase().includes("ALS"),
    );
    hasSned = inclusivePrograms.some(
      (p) =>
        String(p).toUpperCase().includes("SNED") ||
        String(p).toUpperCase().includes("SPED"),
    );
    hasIped = inclusivePrograms.some(
      (p) =>
        String(p).toUpperCase().includes("IPED") ||
        String(p).toUpperCase().startsWith("IP-"),
    );
    hasMadrasah = inclusivePrograms.some(
      (p) =>
        String(p).toUpperCase().includes("MADRASAH") ||
        String(p).toUpperCase().includes("MEP") ||
        String(p).toUpperCase().includes("ALIVE"),
    );

    return res.json({
      schoolId: cleanSchoolId,
      schoolName,
      region,
      division,
      district,
      schoolYear,
      numberOfShifts,
      curricularOffering,
      certifiedBy,
      certifiedSignature,
      certifiedAt,
      subjectsConfig,
      specialPrograms,
      hasElemSpecialPrograms,
      elemSpecialPrograms,
      hasJhsSpecialPrograms,
      jhsSpecialPrograms,
      shsCurriculumModel,
      hasElemInclusive,
      elemInclusivePrograms,
      hasJhsInclusive,
      jhsInclusivePrograms,
      hasShsInclusive,
      shsInclusivePrograms,
      hasAls,
      hasSned,
      hasIped,
      hasMadrasah,
      inclusivePrograms,
      hasShifts,
      shiftStartTime,
      shiftEndTime,
      shiftsConfig,
      // true when esf7_school_profile has a saved row for this school (the database, not a draft, holds the configuration)
      curricularConfigSaved: localProf.rows.length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Version column support is detected once (and re-checked if absent) so the routes work before/after the migration.
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

// Draft reads go straight to PostgreSQL on purpose: a per-worker in-memory/Redis cache could serve a stale
// draft right after login when requests land on a different PM2 worker than the one that took the save.
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
    const withVersion = await hasDraftVersionColumn();

    const result = await db.query(
      `SELECT payload, updated_at${withVersion ? ", version" : ""} FROM school_drafts WHERE school_id = $1 AND school_year = $2`,
      [schoolId, schoolYear],
    );

    res.set("Cache-Control", "no-store");
    if (result.rows.length === 0) {
      return res.json({ payload: null, updatedAt: null, version: 0 });
    }
    const row = result.rows[0];
    let payload = row.payload;

    // Filter out any deleted personnel from the retrieved draft payload
    if (
      payload &&
      typeof payload === "object" &&
      Array.isArray(payload.personnel)
    ) {
      try {
        const delRes = await db.query(
          `SELECT personnel_id, prn, employee_no, full_name_clean FROM esf7_deleted_personnel WHERE school_id = $1 OR school_id = $2`,
          [schoolId, `SCH-${schoolId}`],
        );
        if (delRes.rows.length > 0) {
          const delKeys = new Set();
          for (const d of delRes.rows) {
            if (d.personnel_id)
              delKeys.add(String(d.personnel_id).trim().toLowerCase());
            if (d.prn) delKeys.add(String(d.prn).trim().toLowerCase());
            if (d.employee_no)
              delKeys.add(String(d.employee_no).trim().toLowerCase());
            if (d.full_name_clean)
              delKeys.add(String(d.full_name_clean).trim().toLowerCase());
          }
          payload.personnel = payload.personnel.filter((p) => {
            const idK = String(p.id || "")
              .trim()
              .toLowerCase();
            const prnK = String(p.prn || "")
              .trim()
              .toLowerCase();
            const empK = String(p.employeeNo || p.employee_no || "")
              .trim()
              .toLowerCase();
            const nameK =
              `${String(p.firstName || "").trim()} ${String(p.lastName || "").trim()}`.toLowerCase();
            return (
              !delKeys.has(idK) &&
              !delKeys.has(prnK) &&
              (!empK || !delKeys.has(empK)) &&
              (!nameK || !delKeys.has(nameK))
            );
          });
        }
      } catch (e) {
        console.warn(
          "[handleGetDraft] Deletion filter check warning:",
          e.message,
        );
      }
    }

    // Read-only repair of already-duplicated drafts: the response is clean, nothing is written back from a GET.
    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.classSections))
        payload.classSections = dedupeSections(payload.classSections);
      if (Array.isArray(payload.sections))
        payload.sections = dedupeSections(payload.sections);
      if (Array.isArray(payload.personnel))
        payload.personnel = dedupePersonnel(payload.personnel);
    }

    res.json({
      payload: payload,
      updatedAt: row.updated_at,
      version: withVersion ? Number(row.version) : undefined,
    });
  } catch (err) {
    console.error("[DraftLoad][FAIL]", err.message);
    res.status(500).json({ error: err.message });
  }
};

router.get("/draft", handleGetDraft);
router.get("/", handleGetSchool);
router.get("/:schoolId", handleGetSchool);

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
      // Never invent an id here: a random one would create a brand-new row on every save. No stable key = no derived row.
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

    // Batched upsert: replaces N+1 individual serial queries with chunked multi-row upserts
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

// PUT / POST /api/school/draft - Upsert cloud draft. Responds ONLY after the row is committed to PostgreSQL.
// Optimistic concurrency: if the client sends baseVersion and the stored version differs, nothing is written and
// 409 is returned so the client can ask the user instead of silently overwriting a newer copy.
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

    // Fetch existing draft for merge protection
    const existing = await db.query(
      "SELECT payload FROM school_drafts WHERE school_id = $1 AND school_year = $2",
      [schoolId, schoolYear],
    );
    const existingPayload = existing.rows[0] && existing.rows[0].payload;
    const oldPersonnel = Array.isArray(existingPayload?.personnel)
      ? existingPayload.personnel
      : [];
    const oldSections = Array.isArray(existingPayload?.classSections)
      ? existingPayload.classSections
      : Array.isArray(existingPayload?.sections)
        ? existingPayload.sections
        : [];

    const finalPayload = { ...payload };

    // 1. Personnel Deletion Filter & Protection
    if (Array.isArray(payload.personnel)) {
      if (
        payload.personnel.length === 0 &&
        oldPersonnel.length > 0 &&
        (!payload.deletedPersonnelIds ||
          payload.deletedPersonnelIds.length === 0)
      ) {
        finalPayload.personnel = oldPersonnel;
      } else {
        const deletedIds = Array.isArray(payload.deletedPersonnelIds)
          ? new Set(
              payload.deletedPersonnelIds.map((k) =>
                String(k).trim().toLowerCase(),
              ),
            )
          : new Set();
        if (deletedIds.size > 0) {
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
            return (
              !deletedIds.has(idKey) &&
              !deletedIds.has(prnKey) &&
              (!empKey || !deletedIds.has(empKey)) &&
              (!nameKey || !deletedIds.has(nameKey))
            );
          });
        } else {
          finalPayload.personnel = payload.personnel;
        }
      }
    }

    // 2. Class Sections: Per-record upsert keyed by stable id and protection against accidental drops
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

      const getPrimaryId = (s) => {
        return s && s.id && String(s.id).trim() ? String(s.id).trim() : null;
      };

      if (oldSections.length > 0) {
        // If incoming list is empty and deletion was not explicitly confirmed, preserve existing sections
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
          // Section count dropped without explicit deletion confirmation -> merge by stable ID to prevent data loss
          console.warn(
            `[DraftSave] Merging sections by stable ID: incoming ${incomingSections.length} vs existing ${oldSections.length} for school ${schoolId}`,
          );
          const sectionMap = new Map();
          const naturalKeyIndex = new Map();

          // 1. Seed with old sections
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

          // 2. Overlay incoming items
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
              // preserve existing learner counts if incoming is null/undefined
              if (
                (s.numberOfLearners === null ||
                  s.numberOfLearners === undefined ||
                  s.numberOfLearners === "") &&
                prev.numberOfLearners !== null &&
                prev.numberOfLearners !== undefined &&
                prev.numberOfLearners !== ""
              ) {
                merged.numberOfLearners = prev.numberOfLearners;
                merged.maleLearners = prev.maleLearners;
                merged.femaleLearners = prev.femaleLearners;
              }
              sectionMap.set(targetKey, merged);
              if (nKey) naturalKeyIndex.set(nKey, targetKey);
            } else if (targetKey) {
              sectionMap.set(targetKey, { ...s });
              if (nKey) naturalKeyIndex.set(nKey, targetKey);
            }
          });

          finalPayload.classSections = Array.from(sectionMap.values());
        } else {
          // Normal save or explicit deletion: deduplicate incoming sections and filter deleted IDs
          const sectionMap = new Map();
          const naturalKeyIndex = new Map();

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
              sectionMap.set(targetKey, merged);
              if (nKey) naturalKeyIndex.set(nKey, targetKey);
            } else if (targetKey) {
              sectionMap.set(targetKey, { ...s });
              if (nKey) naturalKeyIndex.set(nKey, targetKey);
            }
          });

          finalPayload.classSections = Array.from(sectionMap.values());
        }
      } else {
        // No existing sections, deduplicate incoming
        const sectionMap = new Map();
        const naturalKeyIndex = new Map();

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
            sectionMap.set(targetKey, merged);
            if (nKey) naturalKeyIndex.set(nKey, targetKey);
          } else if (targetKey) {
            sectionMap.set(targetKey, { ...s });
            if (nKey) naturalKeyIndex.set(nKey, targetKey);
          }
        });

        finalPayload.classSections = Array.from(sectionMap.values());
      }
    }

    // Last line of defence: whatever path built the lists, a draft is never stored with two copies of one record.
    if (Array.isArray(finalPayload.classSections))
      finalPayload.classSections = dedupeSections(finalPayload.classSections);
    if (Array.isArray(finalPayload.sections))
      finalPayload.sections = dedupeSections(finalPayload.sections);
    if (Array.isArray(finalPayload.personnel))
      finalPayload.personnel = dedupePersonnel(finalPayload.personnel);

    const withVersion = await hasDraftVersionColumn();
    let saved;
    if (withVersion) {
      const r = await db.query(
        `INSERT INTO school_drafts (school_id, school_year, payload, updated_at, version)
         VALUES ($1, $2, $3, NOW(), 1)
         ON CONFLICT (school_id, school_year)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), version = school_drafts.version + 1
         WHERE $4::bigint IS NULL OR school_drafts.version = $4::bigint
         RETURNING version, updated_at`,
        [schoolId, schoolYear, JSON.stringify(finalPayload), baseVersion],
      );
      if (r.rows.length === 0) {
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
      const r = await db.query(
        `INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (school_id, school_year)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
         RETURNING updated_at`,
        [schoolId, schoolYear, JSON.stringify(finalPayload)],
      );
      saved = { version: undefined, updatedAt: r.rows[0].updated_at };
    }

    console.log(
      `[DraftSave][OK] school=${schoolId} user=${(req.auth && req.auth.uid) || "-"} year=${schoolYear} base=${baseVersion} version=${saved.version} bytes=${req.headers["content-length"] || "?"} ms=${Date.now() - startedAt}`,
    );

    cacheService.delPattern(`dashboard:stats:${schoolId}:*`).catch(() => {});
    // Derived node-status sync runs after the commit; a failure here is logged but never reported as a failed save.
    // The post-deploy smoke test (reserved school 000000 / year SMOKE) sends x-smoke-test so it leaves no derived rows behind.
    if (!req.headers["x-smoke-test"]) {
      syncDraftToNodeStatus(schoolId, schoolYear, finalPayload).catch((e) => {
        console.warn("[SyncDraftToNodeStatus Background Warning]:", e.message);
      });
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

router.put("/draft", handleSaveDraft);
router.post("/draft", handleSaveDraft);

// DELETE /api/school/draft - Clear cloud draft upon form reset
router.delete("/draft", async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || "123456";
    const schoolYear = req.query.schoolYear || "SY 26-27";

    await db.query(
      "DELETE FROM school_drafts WHERE school_id = $1 AND school_year = $2",
      [schoolId, schoolYear],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/school-info/shifts - Update number of shifts for current school
router.post("/shifts", async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || "123456";
    const { shifts } = req.body;

    if (!shifts || !["1", "2", "3"].includes(String(shifts))) {
      return res
        .status(400)
        .json({ error: "Invalid shifts value. Must be 1, 2, or 3" });
    }

    await db.query(
      `INSERT INTO schools (id, school_id, school_name, region, division, school_year, number_of_shifts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (school_id, school_year) DO UPDATE
       SET number_of_shifts = EXCLUDED.number_of_shifts, updated_at = NOW()`,
      [
        `SCH-${schoolId}`,
        schoolId,
        "School",
        "Region",
        "Division",
        "SY 26-27",
        parseInt(shifts, 10),
      ],
    );

    res.json({ success: true, numberOfShifts: String(shifts) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schools/subjects - Save subjects_config for current school
router.put("/subjects", async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || "123456";
    const { subjectsConfig } = req.body;

    if (!subjectsConfig) {
      return res.status(400).json({ error: "Missing subjectsConfig" });
    }

    await db.query(
      `INSERT INTO schools (id, school_id, school_name, region, division, school_year, subjects_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (school_id, school_year) DO UPDATE
       SET subjects_config = EXCLUDED.subjects_config, updated_at = NOW()`,
      [
        `SCH-${schoolId}`,
        schoolId,
        "School",
        "Region",
        "Division",
        "SY 26-27",
        JSON.stringify(subjectsConfig),
      ],
    );

    res.json({ success: true, subjectsConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to convert time string (HH:MM or HH:MM AM/PM) to minutes from midnight
function parseTimeToMins(tStr) {
  if (!tStr) return null;
  const match = String(tStr)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

// PUT /api/schools/curricular-config - Save esf7_school_profile Special Curricular & Inclusive Programs & Optional Shifts
router.put("/curricular-config", async (req, res) => {
  try {
    const schoolId =
      getSchoolIdFromRequest(req) ||
      req.body.schoolId ||
      req.body.school_id ||
      "108348";
    const {
      hasElemSpecialPrograms,
      has_elem_special_programs,
      elemSpecialPrograms,
      elem_special_programs,
      hasJhsSpecialPrograms,
      has_jhs_special_programs,
      jhsSpecialPrograms,
      jhs_special_programs,
      shsCurriculumModel,
      shs_curriculum_model,
      hasElemInclusive,
      has_elem_inclusive,
      elemInclusivePrograms,
      elem_inclusive_programs,
      hasJhsInclusive,
      has_jhs_inclusive,
      jhsInclusivePrograms,
      jhs_inclusive_programs,
      hasShsInclusive,
      has_shs_inclusive,
      shsInclusivePrograms,
      shs_inclusive_programs,
      inclusivePrograms,
      inclusive_programs,
      hasShifts,
      has_shifts,
      shiftStartTime,
      shift_start_time,
      shiftEndTime,
      shift_end_time,
      shiftsConfig,
      shifts_config,
      schoolYear = "2026-2027",
    } = req.body;

    const shiftFlag = hasShifts === true || has_shifts === true;
    const finalShiftStart =
      (shiftStartTime || shift_start_time || "").trim() || null;
    const finalShiftEnd = (shiftEndTime || shift_end_time || "").trim() || null;
    const finalShiftsConfig = shiftsConfig || shifts_config || {};

    if (shiftFlag) {
      const sMins = parseTimeToMins(finalShiftStart);
      const eMins = parseTimeToMins(finalShiftEnd);
      // Valid window: 4:00 AM (240 mins) to 10:00 PM (1320 mins)
      if (
        sMins === null ||
        eMins === null ||
        sMins < 240 ||
        eMins > 1320 ||
        eMins <= sMins
      ) {
        return res.status(400).json({
          error:
            "Shift times must be between 4:00 AM and 10:00 PM, and End Time must be later than Start Time.",
        });
      }
    }

    const profileId = `SCH-PROFILE-${schoolId.replace("SCH-", "")}`;
    const elemFlag =
      hasElemSpecialPrograms === true || has_elem_special_programs === true;
    const elemSpecialProgs = Array.isArray(elemSpecialPrograms)
      ? elemSpecialPrograms
      : Array.isArray(elem_special_programs)
        ? elem_special_programs
        : elemFlag
          ? ["SPECIAL SCIENCE ELEMENTARY SCHOOL"]
          : [];
    const jhsFlag =
      hasJhsSpecialPrograms === true || has_jhs_special_programs === true;
    const jhsProgs = Array.isArray(jhsSpecialPrograms)
      ? jhsSpecialPrograms
      : Array.isArray(jhs_special_programs)
        ? jhs_special_programs
        : [];
    const shsModel =
      shsCurriculumModel ||
      shs_curriculum_model ||
      "Standard K-12 SHS Curriculum";

    const elemIncFlag =
      hasElemInclusive === true || has_elem_inclusive === true;
    const elemIncProgs = Array.isArray(elemInclusivePrograms)
      ? elemInclusivePrograms
      : Array.isArray(elem_inclusive_programs)
        ? elem_inclusive_programs
        : [];
    const jhsIncFlag = hasJhsInclusive === true || has_jhs_inclusive === true;
    const jhsIncProgs = Array.isArray(jhsInclusivePrograms)
      ? jhsInclusivePrograms
      : Array.isArray(jhs_inclusive_programs)
        ? jhs_inclusive_programs
        : [];
    const shsIncFlag = hasShsInclusive === true || has_shs_inclusive === true;
    const shsIncProgs = Array.isArray(shsInclusivePrograms)
      ? shsInclusivePrograms
      : Array.isArray(shs_inclusive_programs)
        ? shs_inclusive_programs
        : [];
    const incProgs = Array.isArray(inclusivePrograms)
      ? inclusivePrograms
      : Array.isArray(inclusive_programs)
        ? inclusive_programs
        : [
            ...(elemIncFlag ? elemIncProgs : []),
            ...(jhsIncFlag ? jhsIncProgs : []),
            ...(shsIncFlag ? shsIncProgs : []),
          ];

    const hasAls = incProgs.some((p) =>
      String(p).toUpperCase().includes("ALS"),
    );
    const hasSned = incProgs.some(
      (p) =>
        String(p).toUpperCase().includes("SNED") ||
        String(p).toUpperCase().includes("SPED"),
    );
    const hasIped = incProgs.some(
      (p) =>
        String(p).toUpperCase().includes("IPED") ||
        String(p).toUpperCase().startsWith("IP-") ||
        String(p).toUpperCase().startsWith("IP_"),
    );
    const hasMadrasah = incProgs.some(
      (p) =>
        String(p).toUpperCase().includes("MADRASAH") ||
        String(p).toUpperCase().includes("MEP") ||
        String(p).toUpperCase().includes("ALIVE"),
    );

    const sql = `
      INSERT INTO esf7_school_profile (
        id, school_id, school_year,
        has_elem_special_programs, elem_special_programs,
        has_jhs_special_programs, jhs_special_programs,
        shs_curriculum_model,
        has_elem_inclusive, elem_inclusive_programs,
        has_jhs_inclusive, jhs_inclusive_programs,
        has_shs_inclusive, shs_inclusive_programs,
        has_als, has_sned, has_iped, has_madrasah,
        inclusive_programs,
        has_shifts, shift_start_time, shift_end_time, shifts_config,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14::jsonb, $15, $16, $17, $18, $19::jsonb, $20, $21, $22, $23::jsonb, $24::jsonb)
      ON CONFLICT (school_id, school_year) DO UPDATE
      SET
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
        has_shifts = EXCLUDED.has_shifts,
        shift_start_time = EXCLUDED.shift_start_time,
        shift_end_time = EXCLUDED.shift_end_time,
        shifts_config = EXCLUDED.shifts_config,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      profileId,
      schoolId,
      schoolYear,
      elemFlag,
      JSON.stringify(elemSpecialProgs),
      jhsFlag,
      JSON.stringify(jhsProgs),
      shsModel,
      elemIncFlag,
      JSON.stringify(elemIncProgs),
      jhsIncFlag,
      JSON.stringify(jhsIncProgs),
      shsIncFlag,
      JSON.stringify(shsIncProgs),
      hasAls,
      hasSned,
      hasIped,
      hasMadrasah,
      JSON.stringify(incProgs),
      shiftFlag,
      finalShiftStart,
      finalShiftEnd,
      JSON.stringify(finalShiftsConfig),
      JSON.stringify(req.body),
    ]);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        schoolId: result.rows[0].school_id,
        schoolYear: result.rows[0].school_year,
        hasElemSpecialPrograms: result.rows[0].has_elem_special_programs,
        elemSpecialPrograms: result.rows[0].elem_special_programs,
        hasJhsSpecialPrograms: result.rows[0].has_jhs_special_programs,
        jhsSpecialPrograms: result.rows[0].jhs_special_programs,
        shsCurriculumModel: result.rows[0].shs_curriculum_model,
        hasElemInclusive: result.rows[0].has_elem_inclusive,
        elemInclusivePrograms: result.rows[0].elem_inclusive_programs,
        hasJhsInclusive: result.rows[0].has_jhs_inclusive,
        jhsInclusivePrograms: result.rows[0].jhs_inclusive_programs,
        hasShsInclusive: result.rows[0].has_shs_inclusive,
        shsInclusivePrograms: result.rows[0].shs_inclusive_programs,
        hasAls: result.rows[0].has_als,
        hasSned: result.rows[0].has_sned,
        hasIped: result.rows[0].has_iped,
        hasMadrasah: result.rows[0].has_madrasah,
        inclusivePrograms: result.rows[0].inclusive_programs,
        hasShifts: result.rows[0].has_shifts,
        shiftStartTime: result.rows[0].shift_start_time,
        shiftEndTime: result.rows[0].shift_end_time,
        shiftsConfig: result.rows[0].shifts_config,
      },
    });
  } catch (err) {
    console.error("[Curricular Config PUT Error]:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Read-only block: PUT/edit is not allowed
router.put("/", (req, res) => {
  res.status(403).json({
    error:
      "Editing school profile is not allowed in the ESF7 Personnel Portal. This section is read-only.",
  });
});

module.exports = router;
