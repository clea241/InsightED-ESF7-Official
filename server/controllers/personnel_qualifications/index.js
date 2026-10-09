const express = require("express");
const router = express.Router();
const db = require("../../db");

const parsePostGraduateDiscipline = (
  rawDiscipline,
  rawEduc = {},
  rawProfile = {},
  highestAttainment = "",
) => {
  let mastersWithUnits = [];
  let mastersGraduated = [];
  let doctorateWithUnits = [];
  let doctorateGraduated = [];
  let masters = [];
  let doctorate = [];

  const extractList = (val) => {
    if (!val) return [];
    if (Array.isArray(val))
      return val.map((s) => String(s).trim()).filter(Boolean);
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed))
            return parsed.map((s) => String(s).trim()).filter(Boolean);
        } catch (e) {}
      }
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const attainmentStr = String(highestAttainment || "").toUpperCase();
  const isDoc = attainmentStr.includes("DOCTOR");
  const isWithUnits = attainmentStr.includes("WITH UNITS");

  if (
    rawDiscipline &&
    typeof rawDiscipline === "object" &&
    !Array.isArray(rawDiscipline)
  ) {
    if (Array.isArray(rawDiscipline.mastersWithUnits))
      mastersWithUnits = rawDiscipline.mastersWithUnits;
    if (Array.isArray(rawDiscipline.mastersGraduated))
      mastersGraduated = rawDiscipline.mastersGraduated;
    if (Array.isArray(rawDiscipline.doctorateWithUnits))
      doctorateWithUnits = rawDiscipline.doctorateWithUnits;
    if (Array.isArray(rawDiscipline.doctorateGraduated))
      doctorateGraduated = rawDiscipline.doctorateGraduated;
    if (Array.isArray(rawDiscipline.masters)) masters = rawDiscipline.masters;
    if (Array.isArray(rawDiscipline.doctorate))
      doctorate = rawDiscipline.doctorate;
  } else if (
    typeof rawDiscipline === "string" &&
    rawDiscipline.trim().startsWith("{")
  ) {
    try {
      const parsed = JSON.parse(rawDiscipline);
      if (Array.isArray(parsed.mastersWithUnits))
        mastersWithUnits = parsed.mastersWithUnits;
      if (Array.isArray(parsed.mastersGraduated))
        mastersGraduated = parsed.mastersGraduated;
      if (Array.isArray(parsed.doctorateWithUnits))
        doctorateWithUnits = parsed.doctorateWithUnits;
      if (Array.isArray(parsed.doctorateGraduated))
        doctorateGraduated = parsed.doctorateGraduated;
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
  if (
    mastersWithUnits.length === 0 &&
    combinedSource.mastersWithUnitsDisciplines
  ) {
    mastersWithUnits = extractList(combinedSource.mastersWithUnitsDisciplines);
  }
  if (
    mastersGraduated.length === 0 &&
    combinedSource.mastersGraduatedDisciplines
  ) {
    mastersGraduated = extractList(combinedSource.mastersGraduatedDisciplines);
  }
  if (
    doctorateWithUnits.length === 0 &&
    combinedSource.doctorateWithUnitsDisciplines
  ) {
    doctorateWithUnits = extractList(
      combinedSource.doctorateWithUnitsDisciplines,
    );
  }
  if (
    doctorateGraduated.length === 0 &&
    combinedSource.doctorateGraduatedDisciplines
  ) {
    doctorateGraduated = extractList(
      combinedSource.doctorateGraduatedDisciplines,
    );
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

  if (
    mastersWithUnits.length === 0 &&
    mastersGraduated.length === 0 &&
    masters.length > 0
  ) {
    if (isWithUnits && !isDoc) mastersWithUnits = [...masters];
    else mastersGraduated = [...masters];
  }
  if (
    doctorateWithUnits.length === 0 &&
    doctorateGraduated.length === 0 &&
    doctorate.length > 0
  ) {
    if (isWithUnits && isDoc) doctorateWithUnits = [...doctorate];
    else doctorateGraduated = [...doctorate];
  }

  const allMasters = [
    ...new Set(
      [...mastersWithUnits, ...mastersGraduated, ...masters]
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const allDoctorate = [
    ...new Set(
      [...doctorateWithUnits, ...doctorateGraduated, ...doctorate]
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  mastersWithUnits = [
    ...new Set(
      mastersWithUnits
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  mastersGraduated = [
    ...new Set(
      mastersGraduated
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  doctorateWithUnits = [
    ...new Set(
      doctorateWithUnits
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  doctorateGraduated = [
    ...new Set(
      doctorateGraduated
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  return {
    mastersWithUnits,
    mastersGraduated,
    doctorateWithUnits,
    doctorateGraduated,
    masters: allMasters,
    doctorate: allDoctorate,
    mastersDiscipline: allMasters.join(", "),
    doctorateDiscipline: allDoctorate.join(", "),
    jsonString: JSON.stringify({
      mastersWithUnits,
      mastersGraduated,
      doctorateWithUnits,
      doctorateGraduated,
      masters: allMasters,
      doctorate: allDoctorate,
    }),
    rawObject: {
      mastersWithUnits,
      mastersGraduated,
      doctorateWithUnits,
      doctorateGraduated,
      masters: allMasters,
      doctorate: allDoctorate,
    },
  };
};

function formatEducRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const elList = Array.isArray(row.eligibility) ? row.eligibility : [];

  const parsedPostDisc = parsePostGraduateDiscipline(
    row.post_graduate_discipline,
    raw,
    raw,
    row.highest_educational_attainment,
  );

  let rawDegrees = [];
  if (Array.isArray(row.college_degrees)) {
    rawDegrees = row.college_degrees;
  } else if (typeof row.college_degrees === "string") {
    try {
      const p = JSON.parse(row.college_degrees);
      if (Array.isArray(p)) rawDegrees = p;
    } catch (e) {}
  } else if (Array.isArray(raw.collegeDegrees || raw.college_degrees)) {
    rawDegrees = raw.collegeDegrees || raw.college_degrees;
  } else if (row.college_degree) {
    rawDegrees = [
      {
        collegeDegree: row.college_degree,
        major: row.major || "",
        minor: row.minor || "",
      },
    ];
  }

  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    highestEducationalAttainment:
      row.highest_educational_attainment ||
      (row.college_degree ? "COLLEGE GRADUATE / BACCALAUREATE" : ""),
    highest_educational_attainment:
      row.highest_educational_attainment ||
      (row.college_degree ? "COLLEGE GRADUATE / BACCALAUREATE" : ""),
    shsTrack: row.shs_track || "",
    shs_track: row.shs_track || "",
    vocationalCourse: row.vocational_course || "",
    vocational_course: row.vocational_course || "",
    vocationalLevel: row.vocational_level || "",
    vocational_level: row.vocational_level || "",
    collegeDegree: row.college_degree || "",
    college_degree: row.college_degree || "",
    collegeDegrees: rawDegrees,
    college_degrees: rawDegrees,
    major: row.major || "",
    minor: row.minor || "",
    postGraduateDegree: row.post_graduate_degree || "N/A",
    post_graduate_degree: row.post_graduate_degree || "N/A",
    postGraduateDiscipline: parsedPostDisc.jsonString,
    post_graduate_discipline: parsedPostDisc.jsonString,
    mastersWithUnitsDisciplines: parsedPostDisc.mastersWithUnits,
    mastersGraduatedDisciplines: parsedPostDisc.mastersGraduated,
    doctorateWithUnitsDisciplines: parsedPostDisc.doctorateWithUnits,
    doctorateGraduatedDisciplines: parsedPostDisc.doctorateGraduated,
    mastersDiscipline: parsedPostDisc.mastersDiscipline,
    mastersDisciplines: parsedPostDisc.masters,
    doctorateDiscipline: parsedPostDisc.doctorateDiscipline,
    doctorateDisciplines: parsedPostDisc.doctorate,
    eligibility: elList,
    prcSpecialization: row.prc_specialization || "",
    prc_specialization: row.prc_specialization || "",
    rawPayload: raw,
  };
}

// GET education record for a personnel_id
router.get("/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM esf7_perssonel_educ WHERE personnel_id = $1 LIMIT 1`,
      [personnel_id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Education record not found" });
    }
    res.json(formatEducRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT Upsert education details for a personnel record
router.post("/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const {
      highest_educational_attainment,
      highestEducationalAttainment,
      shs_track,
      shsTrack,
      vocational_course,
      vocationalCourse,
      vocational_level,
      vocationalLevel,
      college_degree,
      collegeDegree,
      major,
      minor,
      college_degrees,
      collegeDegrees,
      post_graduate_degree,
      postGraduateDegree,
      post_graduate_discipline,
      postGraduateDiscipline,
      postGraduateDisciplineCustom,
      eligibility,
      prc_specialization,
      prcSpecialization,
    } = req.body;

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id],
    );
    const schoolId =
      personRes.rows.length > 0 ? personRes.rows[0].school_id : "108348";

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_perssonel_educ`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const eduId = `EDU-${schoolId.replace("SCH-", "")}-${seq}`;

    const eduHighestAttainment = (
      highest_educational_attainment ||
      highestEducationalAttainment ||
      (college_degree || collegeDegree
        ? "COLLEGE GRADUATE / BACCALAUREATE"
        : "COLLEGE GRADUATE / BACCALAUREATE")
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || "").toUpperCase() || null;
    const eduVocationalCourse =
      (vocational_course || vocationalCourse || "").toUpperCase() || null;
    const eduVocationalLevel =
      (vocational_level || vocationalLevel || "").toUpperCase() || null;
    let degree = (college_degree || collegeDegree || "").toUpperCase() || null;
    let maj = (major || "").toUpperCase();
    let min = (minor || "").toUpperCase();

    const rawCollegeDegrees = college_degrees || collegeDegrees;
    let eduCollegeDegrees = [];
    if (Array.isArray(rawCollegeDegrees)) {
      eduCollegeDegrees = rawCollegeDegrees
        .filter((d) => d && (d.collegeDegree || d.college_degree))
        .map((d) => ({
          collegeDegree: (d.collegeDegree || d.college_degree || "")
            .trim()
            .toUpperCase(),
          major: (d.major || "").trim().toUpperCase(),
          minor: (d.minor || "").trim().toUpperCase(),
        }));
    }
    if (eduCollegeDegrees.length > 0) {
      degree = eduCollegeDegrees[0].collegeDegree || degree;
      maj = eduCollegeDegrees[0].major || maj;
      min = eduCollegeDegrees[0].minor || min;
    } else if (degree) {
      eduCollegeDegrees = [
        {
          collegeDegree: degree,
          major: maj || "",
          minor: min || "",
        },
      ];
    }

    const postDeg = (
      post_graduate_degree ||
      postGraduateDegree ||
      "N/A"
    ).toUpperCase();

    const parsedPostDisc = parsePostGraduateDiscipline(
      post_graduate_discipline ||
        postGraduateDiscipline ||
        postGraduateDisciplineCustom,
      req.body,
      req.body,
      eduHighestAttainment,
    );
    const postDisc = parsedPostDisc.jsonString;
    const prcSpec = (
      prc_specialization ||
      prcSpecialization ||
      ""
    ).toUpperCase();

    // Process eligibility array preserving custom RA 1080 strings
    let eligibilityArray = [];
    if (Array.isArray(eligibility)) {
      eligibilityArray = eligibility;
    } else if (
      typeof eligibility === "string" &&
      eligibility.trim().length > 0
    ) {
      eligibilityArray = eligibility
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const elJson = JSON.stringify(eligibilityArray);

    const query = `
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, college_degrees, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb)
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
      RETURNING *;
    `;

    const values = [
      eduId,
      personnel_id,
      eduHighestAttainment,
      eduShsTrack,
      eduVocationalCourse,
      eduVocationalLevel,
      degree,
      JSON.stringify(eduCollegeDegrees),
      maj || null,
      min || null,
      postDeg,
      postDisc || null,
      elJson,
      prcSpec || null,
      JSON.stringify(req.body),
    ];

    const result = await db.query(query, values);
    res.json(formatEducRecord(result.rows[0]));
  } catch (err) {
    console.error("Error upserting esf7_perssonel_educ:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Single update route
router.put("/:personnel_id", async (req, res) => {
  return router.handle({ ...req, method: "POST" }, res);
});

module.exports = router;
