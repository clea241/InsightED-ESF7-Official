const express = require("express");
const router = express.Router();
const db = require("../../db");
const { insightEdPool, usersDbPool } = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const { resolveTestDivision } = require("../../utils/divisionTestRegistry");

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
    let iern = null;
    let hasElemSpecialPrograms = false;
    let elemSpecialPrograms = [];
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
      // 1. Query live schools_iern table in users_database
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

      // 2. Query master 2025-2026_SchoolID table
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

      // 4. Query unit1_school_identity
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

      // 5. Query esf7_database or esf7_database_dummy
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

    // 6. Query local schools table (for shifts, subjects_config, certifications)
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

    // Default inclusive & shift values
    let has_es_sned = false;
    let has_es_als = false;
    let has_es_iped = false;
    let has_es_mad = false;

    let has_jhs_sned = false;
    let has_jhs_als = false;
    let has_jhs_iped = false;
    let has_jhs_mad = false;

    let has_shs_sned = false;
    let has_shs_als = false;
    let has_shs_iped = false;
    let has_shs_mad = false;

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

    // 7. Query esf7_school_profile (31 clean columns)
    const localProf = await db
      .query(
        "SELECT * FROM esf7_school_profile WHERE school_id = $1 OR school_id = $2 LIMIT 1",
        [cleanSchoolId, `SCH-${cleanSchoolId}`],
      )
      .catch(() => ({ rows: [] }));

    if (localProf.rows.length > 0) {
      const pRow = localProf.rows[0];
      if (pRow.school_year) schoolYear = pRow.school_year;
      if (pRow.iern) iern = pRow.iern;
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

      // Granular stage flags
      has_es_sned = Boolean(pRow.has_es_sned);
      has_es_als = Boolean(pRow.has_es_als);
      has_es_iped = Boolean(pRow.has_es_iped);
      has_es_mad = Boolean(pRow.has_es_mad);

      has_jhs_sned = Boolean(pRow.has_jhs_sned);
      has_jhs_als = Boolean(pRow.has_jhs_als);
      has_jhs_iped = Boolean(pRow.has_jhs_iped);
      has_jhs_mad = Boolean(pRow.has_jhs_mad);

      has_shs_sned = Boolean(pRow.has_shs_sned);
      has_shs_als = Boolean(
        pRow.has_shs_als ||
        (Array.isArray(pRow.inclusive_programs) &&
          pRow.inclusive_programs.includes("ALS-SHS")),
      );
      has_shs_iped = Boolean(pRow.has_shs_iped);
      has_shs_mad = Boolean(pRow.has_shs_mad);

      // Rollups
      hasSned = Boolean(
        pRow.has_sned ?? (has_es_sned || has_jhs_sned || has_shs_sned),
      );
      hasAls = Boolean(
        pRow.has_als ?? (has_es_als || has_jhs_als || has_shs_als),
      );
      hasIped = Boolean(
        pRow.has_iped ?? (has_es_iped || has_jhs_iped || has_shs_iped),
      );
      hasMadrasah = Boolean(
        pRow.has_madrasah ?? (has_es_mad || has_jhs_mad || has_shs_mad),
      );

      // Reconstruct program tags
      elemInclusivePrograms = [];
      if (has_es_als) elemInclusivePrograms.push("ALS-ES");
      if (has_es_sned) elemInclusivePrograms.push("SNED-ES");
      if (has_es_iped) elemInclusivePrograms.push("IPED-ES");
      if (has_es_mad) elemInclusivePrograms.push("MADRASAH-ES");
      hasElemInclusive = elemInclusivePrograms.length > 0;

      jhsInclusivePrograms = [];
      if (has_jhs_als) jhsInclusivePrograms.push("ALS-JHS");
      if (has_jhs_sned) jhsInclusivePrograms.push("SNED-JHS");
      if (has_jhs_iped) jhsInclusivePrograms.push("IPED-JHS");
      if (has_jhs_mad) jhsInclusivePrograms.push("MADRASAH-JHS");
      hasJhsInclusive = jhsInclusivePrograms.length > 0;

      shsInclusivePrograms = [];
      if (has_shs_sned) shsInclusivePrograms.push("SNED-SHS");
      if (has_shs_als) shsInclusivePrograms.push("ALS-SHS");
      if (has_shs_iped) shsInclusivePrograms.push("IPED-SHS");
      if (has_shs_mad) shsInclusivePrograms.push("MADRASAH-SHS");
      hasShsInclusive = shsInclusivePrograms.length > 0;

      inclusivePrograms =
        Array.isArray(pRow.inclusive_programs) &&
        pRow.inclusive_programs.length > 0
          ? pRow.inclusive_programs
          : [
              ...elemInclusivePrograms,
              ...jhsInclusivePrograms,
              ...shsInclusivePrograms,
            ];

      hasShifts = Boolean(pRow.has_shifts);
      shiftsConfig = pRow.shifts_config || {};
      shiftStartTime =
        shiftsConfig.shiftStartTime ||
        shiftsConfig.shift_start_time ||
        pRow.shift_start_time ||
        null;
      shiftEndTime =
        shiftsConfig.shiftEndTime ||
        shiftsConfig.shift_end_time ||
        pRow.shift_end_time ||
        null;
    }

    specialPrograms = [
      ...(hasElemSpecialPrograms ? elemSpecialPrograms : []),
      ...(hasJhsSpecialPrograms ? jhsSpecialPrograms : []),
    ];

    return res.json({
      schoolId: cleanSchoolId,
      schoolName,
      region,
      division,
      district,
      schoolYear,
      numberOfShifts,
      curricularOffering,
      mcoc:
        rawMCOC ||
        (Array.isArray(curricularOffering)
          ? curricularOffering.join(", ")
          : null),
      certifiedBy,
      certifiedSignature,
      certifiedAt,
      subjectsConfig,
      specialPrograms,
      iern,
      hasElemSpecialPrograms,
      elemSpecialPrograms,
      hasJhsSpecialPrograms,
      jhsSpecialPrograms,
      shsCurriculumModel,
      has_es_sned,
      has_es_als,
      has_es_iped,
      has_es_mad,
      has_jhs_sned,
      has_jhs_als,
      has_jhs_iped,
      has_jhs_mad,
      has_shs_sned,
      has_shs_als,
      has_shs_iped,
      has_shs_mad,
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
      curricularConfigSaved: localProf.rows.length > 0,
    });
  } catch (err) {
    console.error("[GetSchool Error]:", err.message);
    res.status(500).json({ error: err.message });
  }
};

router.get("/", handleGetSchool);
router.get("/:schoolId", handleGetSchool);

module.exports = router;
module.exports.handleGetSchool = handleGetSchool;
module.exports.parseCurricularOffering = parseCurricularOffering;
