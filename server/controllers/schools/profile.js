const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const cacheService = require("../../services/cacheService");

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

/**
 * PUT /api/schools/curricular-config
 * Upserts Node 01 School Profile & Curricular Offerings into esf7_school_profile (31 clean columns, strictly isolated)
 */
router.put("/curricular-config", async (req, res) => {
  try {
    const rawSchoolId =
      getSchoolIdFromRequest(req) ||
      req.body.schoolId ||
      req.body.school_id ||
      "108348";
    const cleanSchoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
    const schoolYear = req.body.schoolYear || "SY 26-27";
    const profileId = `SCH-PROFILE-${cleanSchoolId}`;

    const {
      iern = null,
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
      // Granular stage flags (booleans)
      has_es_sned,
      has_es_als,
      has_es_iped,
      has_es_mad,
      has_jhs_sned,
      has_jhs_als,
      has_jhs_iped,
      has_jhs_mad,
      has_shs_sned,
      has_shs_iped,
      has_shs_mad,
      // Array tags support for backward compatibility with frontend selectors
      elemInclusivePrograms,
      elem_inclusive_programs,
      jhsInclusivePrograms,
      jhs_inclusive_programs,
      shsInclusivePrograms,
      shs_inclusive_programs,
      // Shifts configuration
      hasShifts,
      has_shifts,
      shiftsConfig,
      shifts_config,
    } = req.body;

    const shiftFlag = hasShifts === true || has_shifts === true;
    const finalShiftsConfig = shiftsConfig || shifts_config || {};

    // Special Programs
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

    // Inclusive stage arrays (from tags or booleans)
    const elemIncList = Array.isArray(elemInclusivePrograms)
      ? elemInclusivePrograms
      : Array.isArray(elem_inclusive_programs)
        ? elem_inclusive_programs
        : [];
    const jhsIncList = Array.isArray(jhsInclusivePrograms)
      ? jhsInclusivePrograms
      : Array.isArray(jhs_inclusive_programs)
        ? jhs_inclusive_programs
        : [];
    const shsIncList = Array.isArray(shsInclusivePrograms)
      ? shsInclusivePrograms
      : Array.isArray(shs_inclusive_programs)
        ? shs_inclusive_programs
        : [];

    // Derive 11 granular stage flags
    const final_has_es_sned = Boolean(
      has_es_sned ?? elemIncList.includes("SNED-ES"),
    );
    const final_has_es_als = Boolean(
      has_es_als ?? elemIncList.includes("ALS-ES"),
    );
    const final_has_es_iped = Boolean(
      has_es_iped ?? elemIncList.includes("IPED-ES"),
    );
    const final_has_es_mad = Boolean(
      has_es_mad ?? elemIncList.includes("MADRASAH-ES"),
    );

    const final_has_jhs_sned = Boolean(
      has_jhs_sned ?? jhsIncList.includes("SNED-JHS"),
    );
    const final_has_jhs_als = Boolean(
      has_jhs_als ?? jhsIncList.includes("ALS-JHS"),
    );
    const final_has_jhs_iped = Boolean(
      has_jhs_iped ?? jhsIncList.includes("IPED-JHS"),
    );
    const final_has_jhs_mad = Boolean(
      has_jhs_mad ?? jhsIncList.includes("MADRASAH-JHS"),
    );

    const final_has_shs_sned = Boolean(
      has_shs_sned ?? shsIncList.includes("SNED-SHS"),
    );
    const final_has_shs_iped = Boolean(
      has_shs_iped ?? shsIncList.includes("IPED-SHS"),
    );
    const final_has_shs_mad = Boolean(
      has_shs_mad ?? shsIncList.includes("MADRASAH-SHS"),
    );

    // Roll-up summary booleans
    const final_has_sned =
      final_has_es_sned || final_has_jhs_sned || final_has_shs_sned;
    const final_has_als = final_has_es_als || final_has_jhs_als;
    const final_has_iped =
      final_has_es_iped || final_has_jhs_iped || final_has_shs_iped;
    const final_has_madrasah =
      final_has_es_mad || final_has_jhs_mad || final_has_shs_mad;

    // Build canonical inclusive_programs array tags
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

    const sql = `
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
      ON CONFLICT (school_id, school_year) DO UPDATE
      SET
        iern = EXCLUDED.iern,
        has_elem_special_programs = EXCLUDED.has_elem_special_programs,
        elem_special_programs = EXCLUDED.elem_special_programs,
        has_jhs_special_programs = EXCLUDED.has_jhs_special_programs,
        jhs_special_programs = EXCLUDED.jhs_special_programs,
        shs_curriculum_model = EXCLUDED.shs_curriculum_model,
        has_es_sned = EXCLUDED.has_es_sned,
        has_es_als = EXCLUDED.has_es_als,
        has_es_iped = EXCLUDED.has_es_iped,
        has_es_mad = EXCLUDED.has_es_mad,
        has_jhs_sned = EXCLUDED.has_jhs_sned,
        has_jhs_als = EXCLUDED.has_jhs_als,
        has_jhs_iped = EXCLUDED.has_jhs_iped,
        has_jhs_mad = EXCLUDED.has_jhs_mad,
        has_shs_sned = EXCLUDED.has_shs_sned,
        has_shs_iped = EXCLUDED.has_shs_iped,
        has_shs_mad = EXCLUDED.has_shs_mad,
        has_sned = EXCLUDED.has_sned,
        has_als = EXCLUDED.has_als,
        has_iped = EXCLUDED.has_iped,
        has_madrasah = EXCLUDED.has_madrasah,
        inclusive_programs = EXCLUDED.inclusive_programs,
        has_shifts = EXCLUDED.has_shifts,
        shifts_config = EXCLUDED.shifts_config,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      profileId,
      cleanSchoolId,
      schoolYear,
      iern ? String(iern).trim() : null,
      elemFlag,
      JSON.stringify(elemSpecialProgs),
      jhsFlag,
      JSON.stringify(jhsProgs),
      shsModel,
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
      shiftFlag,
      JSON.stringify(finalShiftsConfig),
    ]);

    const row = result.rows[0];

    res.json({
      success: true,
      data: {
        id: row.id,
        schoolId: row.school_id,
        schoolYear: row.school_year,
        iern: row.iern,
        hasElemSpecialPrograms: row.has_elem_special_programs,
        elemSpecialPrograms: row.elem_special_programs,
        hasJhsSpecialPrograms: row.has_jhs_special_programs,
        jhsSpecialPrograms: row.jhs_special_programs,
        shsCurriculumModel: row.shs_curriculum_model,
        has_es_sned: row.has_es_sned,
        has_es_als: row.has_es_als,
        has_es_iped: row.has_es_iped,
        has_es_mad: row.has_es_mad,
        has_jhs_sned: row.has_jhs_sned,
        has_jhs_als: row.has_jhs_als,
        has_jhs_iped: row.has_jhs_iped,
        has_jhs_mad: row.has_jhs_mad,
        has_shs_sned: row.has_shs_sned,
        has_shs_iped: row.has_shs_iped,
        has_shs_mad: row.has_shs_mad,
        hasSned: row.has_sned,
        hasAls: row.has_als,
        hasIped: row.has_iped,
        hasMadrasah: row.has_madrasah,
        inclusivePrograms: row.inclusive_programs,
        hasShifts: row.has_shifts,
        shiftsConfig: row.shifts_config,
        updatedAt: row.updated_at,
      },
    });
    cacheService
      .delPattern(`esf7:school:identity:${cleanSchoolId}:*`)
      .catch(() => {});
  } catch (err) {
    console.error("[Curricular Config PUT Error]:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schools/shifts - Update number of shifts for current school
router.post("/shifts", async (req, res) => {
  try {
    const rawSchoolId = getSchoolIdFromRequest(req) || "123456";
    const cleanSchoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
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
        `SCH-${cleanSchoolId}`,
        cleanSchoolId,
        "School",
        "Region",
        "Division",
        "SY 26-27",
        parseInt(shifts, 10),
      ],
    );

    cacheService
      .delPattern(`esf7:school:identity:${cleanSchoolId}:*`)
      .catch(() => {});
    res.json({ success: true, numberOfShifts: String(shifts) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schools/subjects - Save subjects_config for current school
router.put("/subjects", async (req, res) => {
  try {
    const rawSchoolId = getSchoolIdFromRequest(req) || "123456";
    const cleanSchoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
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
        `SCH-${cleanSchoolId}`,
        cleanSchoolId,
        "School",
        "Region",
        "Division",
        "SY 26-27",
        JSON.stringify(subjectsConfig),
      ],
    );

    cacheService
      .delPattern(`esf7:school:identity:${cleanSchoolId}:*`)
      .catch(() => {});
    res.json({ success: true, subjectsConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read-only block: direct PUT / is not allowed
router.put("/", (req, res) => {
  res.status(403).json({
    error:
      "Editing school profile is not allowed in the ESF7 Personnel Portal. This section is read-only.",
  });
});

module.exports = router;
module.exports.parseTimeToMins = parseTimeToMins;
