const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const {
  normalizeSchoolYear,
  sameSchoolYear,
} = require("../../utils/schoolYear");

function isInvalidSectionRecord(row) {
  if (!row) return true;
  const g = String(row.grade_level || row.gradeLevel || "")
    .toUpperCase()
    .trim();
  const n = String(row.section_name || row.sectionName || "")
    .toUpperCase()
    .trim();
  return (
    g.includes("MULTI-GRADE") ||
    g.includes("MULTIGRADE") ||
    g.includes("MULTI GRADE") ||
    g.includes("MONO-GRADE") ||
    g.includes("MONOGRADE") ||
    g.includes("MONO GRADE") ||
    n.includes("MULTI-GRADE") ||
    n.includes("MULTIGRADE") ||
    n.includes("MULTI GRADE") ||
    n.includes("MONO-GRADE") ||
    n.includes("MONOGRADE") ||
    n.includes("MONO GRADE")
  );
}

// The adviser of a regular section: the foreign-key column first, else the id the UI saved in raw_payload.
function storedAdviser(row) {
  if (row.adviser_id) return String(row.adviser_id);
  const raw = row.raw_payload || {};
  const v = raw.advisorId || raw.adviserId || raw.adviser_id || raw.advisor_id;
  return v ? String(v) : null;
}

function formatRegularRecord(row) {
  if (!row || isInvalidSectionRecord(row)) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total =
    row.number_of_learners !== null && row.number_of_learners !== undefined
      ? Number(row.number_of_learners)
      : m + f;

  let cleanGrade = row.grade_level;
  const upperG = String(cleanGrade || "")
    .toUpperCase()
    .trim();
  if (upperG.includes("KINDER")) cleanGrade = "Kinder";

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: cleanGrade,
    grade_level: cleanGrade,
    sectionName: row.section_name,
    section_name: row.section_name,
    sectionType: row.section_type || "MONO GRADE",
    section_type: row.section_type || "MONO GRADE",
    adviserId: storedAdviser(row),
    adviser_id: storedAdviser(row),
    advisorId: storedAdviser(row),
    advisor_id: storedAdviser(row),
    // true = adviser_id is set and enforced by the foreign key; false with an adviser = chosen from the roster but that
    // person has no profile row yet (kept in raw_payload, not an error, shown as "not yet profiled").
    adviserLinked: Boolean(row.adviser_id),
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    numberOfLearners: total,
    number_of_learners: total,
    sizeStatus: row.size_status || "WITHIN STANDARD",
    size_status: row.size_status || "WITHIN STANDARD",
    updatedAt: row.updated_at,
    rawPayload: raw,
  };
}

function formatSnedRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total =
    row.number_of_learners !== null && row.number_of_learners !== undefined
      ? Number(row.number_of_learners)
      : m + f;

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: "SNED (NON-GRADED)",
    grade_level: "SNED (NON-GRADED)",
    sectionName: row.section_name || row.id,
    section_name: row.section_name || row.id,
    sectionType: row.section_type || "SNED (NON-GRADED)",
    section_type: row.section_type || "SNED (NON-GRADED)",
    programType: row.program_type || null,
    program_type: row.program_type || null,
    adviserId: row.adviser_id ? String(row.adviser_id) : null,
    adviser_id: row.adviser_id ? String(row.adviser_id) : null,
    advisorId: row.adviser_id ? String(row.adviser_id) : null,
    advisor_id: row.adviser_id ? String(row.adviser_id) : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    numberOfLearners: total,
    number_of_learners: total,
    sizeStatus: row.size_status || "WITHIN STANDARD",
    size_status: row.size_status || "WITHIN STANDARD",
    rawPayload: raw,
  };
}

function formatAlsRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total =
    row.number_of_learners !== null && row.number_of_learners !== undefined
      ? Number(row.number_of_learners)
      : m + f;

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level || "ALS",
    grade_level: row.grade_level || "ALS",
    sectionName: row.section_name || row.id,
    section_name: row.section_name || row.id,
    sectionType: row.section_type || "ALS",
    section_type: row.section_type || "ALS",
    deliveryMode: row.delivery_mode || null,
    delivery_mode: row.delivery_mode || null,
    clcName: row.clc_name || null,
    clc_name: row.clc_name || null,
    adviserId: row.adviser_id ? String(row.adviser_id) : null,
    adviser_id: row.adviser_id ? String(row.adviser_id) : null,
    advisorId: row.adviser_id ? String(row.adviser_id) : null,
    advisor_id: row.adviser_id ? String(row.adviser_id) : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    numberOfLearners: total,
    number_of_learners: total,
    sizeStatus: row.size_status || "WITHIN STANDARD",
    size_status: row.size_status || "WITHIN STANDARD",
    rawPayload: raw,
  };
}

function formatAralRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total =
    row.total_learners !== null && row.total_learners !== undefined
      ? Number(row.total_learners)
      : m + f;

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    basisType: row.basis_type || "grade",
    basis_type: row.basis_type || "grade",
    gradeLevel: row.grade_level,
    grade_level: row.grade_level,
    assessmentTool: row.assessment_tool || null,
    assessment_tool: row.assessment_tool || null,
    profileLevel: row.profile_level || null,
    profile_level: row.profile_level || null,
    sectionName: row.section_name || row.id,
    section_name: row.section_name || row.id,
    sectionType: row.section_type || "ARAL",
    section_type: row.section_type || "ARAL",
    tutorId: row.tutor_id ? String(row.tutor_id) : null,
    tutor_id: row.tutor_id ? String(row.tutor_id) : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    totalLearners: total,
    total_learners: total,
    numberOfLearners: total,
    rawPayload: raw,
  };
}

function formatRemedialRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  const m = Number(row.male_learners || 0);
  const f = Number(row.female_learners || 0);
  const total =
    row.total_learners !== null && row.total_learners !== undefined
      ? Number(row.total_learners)
      : m + f;

  return {
    ...raw,
    id: row.id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    interventionType: row.intervention_type || "REMEDIAL",
    intervention_type: row.intervention_type || "REMEDIAL",
    sectionType: row.intervention_type || "REMEDIAL",
    section_type: row.intervention_type || "REMEDIAL",
    gradeLevel: row.grade_level,
    grade_level: row.grade_level,
    sectionName: row.section_name || row.id,
    section_name: row.section_name || row.id,
    assignedTeacherId: row.assigned_teacher_id
      ? String(row.assigned_teacher_id)
      : null,
    assigned_teacher_id: row.assigned_teacher_id
      ? String(row.assigned_teacher_id)
      : null,
    adviserId: row.assigned_teacher_id ? String(row.assigned_teacher_id) : null,
    adviser_id: row.assigned_teacher_id
      ? String(row.assigned_teacher_id)
      : null,
    maleLearners: m,
    male_learners: m,
    femaleLearners: f,
    female_learners: f,
    totalLearners: total,
    total_learners: total,
    numberOfLearners: total,
    rawPayload: raw,
  };
}

// GET all sections across all 5 tables
router.get("/", async (req, res) => {
  try {
    const schoolId = getSchoolIdFromRequest(req) || "108348";
    const cleanSchoolId = schoolId.replace("SCH-", "");

    const [regRes, snedRes, alsRes, aralRes, remRes] = await Promise.all([
      db.query(
        `SELECT * FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`,
        [schoolId, cleanSchoolId],
      ),
      db.query(
        `SELECT * FROM esf7_sned_sections WHERE school_id = $1 OR school_id = $2 ORDER BY section_name ASC`,
        [schoolId, cleanSchoolId],
      ),
      db.query(
        `SELECT * FROM esf7_als_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`,
        [schoolId, cleanSchoolId],
      ),
      db.query(
        `SELECT * FROM esf7_aral_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`,
        [schoolId, cleanSchoolId],
      ),
      db.query(
        `SELECT * FROM esf7_remedial_enrichment_sections WHERE school_id = $1 OR school_id = $2 ORDER BY grade_level ASC, section_name ASC`,
        [schoolId, cleanSchoolId],
      ),
    ]);

    const regularSections = regRes.rows
      .map(formatRegularRecord)
      .filter(Boolean);
    const snedSections = snedRes.rows.map(formatSnedRecord).filter(Boolean);
    const alsSections = alsRes.rows.map(formatAlsRecord).filter(Boolean);
    const aralSections = aralRes.rows.map(formatAralRecord).filter(Boolean);
    const remedialEnrichmentSections = remRes.rows
      .map(formatRemedialRecord)
      .filter(Boolean);

    res.json({
      success: true,
      regularSections,
      snedSections,
      alsSections,
      aralSections,
      remedialEnrichmentSections,
      // Flat list for backward compatibility across all modules
      allSections: [
        ...regularSections,
        ...snedSections,
        ...alsSections,
        ...aralSections,
        ...remedialEnrichmentSections,
      ],
    });
  } catch (err) {
    console.error("Error fetching section tables:", err);
    res.status(500).json({ error: err.message });
  }
});

function calculateSizeStatus(gradeLevel, totalLearners, sectionType = "") {
  const total = Number(totalLearners) || 0;
  if (!total || total === 0) return "UNSET";

  const gradeStr = String(gradeLevel || "")
    .toUpperCase()
    .trim();
  const typeStr = String(sectionType || "")
    .toUpperCase()
    .trim();

  if (
    typeStr.includes("MULTI") ||
    gradeStr.includes("MULTI") ||
    gradeStr.includes("MG")
  ) {
    if (total <= 25) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (gradeStr.includes("SNED") || gradeStr.includes("SPED")) {
    if (total < 5) return "BELOW STANDARD";
    if (total <= 15) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (gradeStr.includes("ALS")) {
    if (total < 15) return "BELOW STANDARD";
    if (total <= 50) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (gradeStr.includes("KINDER")) {
    if (total < 25) return "BELOW STANDARD";
    if (total <= 30) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (
    ["GRADE 1", "GRADE 2", "GRADE 3", "1", "2", "3", "G1", "G2", "G3"].some(
      (g) => gradeStr === g || gradeStr.includes(g),
    )
  ) {
    if (total < 30) return "BELOW STANDARD";
    if (total <= 35) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (
    gradeStr === "GRADE 4" ||
    gradeStr === "4" ||
    gradeStr === "G4" ||
    gradeStr.includes("GRADE 4")
  ) {
    if (total < 40) return "BELOW STANDARD";
    if (total <= 45) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (
    [
      "GRADE 5",
      "GRADE 6",
      "GRADE 7",
      "GRADE 8",
      "GRADE 9",
      "GRADE 10",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "G5",
      "G6",
      "G7",
      "G8",
      "G9",
      "G10",
      "JHS",
    ].some((g) => gradeStr === g || gradeStr.includes(g))
  ) {
    if (total < 40) return "BELOW STANDARD";
    if (total <= 45) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (
    ["GRADE 11", "GRADE 12", "11", "12", "G11", "G12", "SHS"].some(
      (g) => gradeStr === g || gradeStr.includes(g),
    )
  ) {
    if (total < 30) return "BELOW STANDARD";
    if (total <= 40) return "WITHIN STANDARD";
    return "ABOVE STANDARD";
  }
  if (total < 40) return "BELOW STANDARD";
  if (total <= 45) return "WITHIN STANDARD";
  return "ABOVE STANDARD";
}

// POST /regular - Insert/Update Regular Section.
// One stable-key rule: the row id first, then school + canonical school year + grade level + section name (also the
// duplicate guard). An existing row keeps its id forever; a "sec-draft-" id that is already saved is just a saved row.
async function upsertRegularSection(client, body) {
  const {
    id,
    school_id,
    schoolId: bodySchoolId,
    school_year,
    schoolYear: bodySchoolYear,
    grade_level,
    gradeLevel,
    section_name,
    sectionName,
    adviser_id,
    advisor_id,
    advisorId,
    adviserId,
    section_type,
    sectionType,
    male_learners,
    maleLearners,
    female_learners,
    femaleLearners,
    number_of_learners,
    numberOfLearners,
    size_status,
    sizeStatus,
  } = body;

  const targetSchoolId = String(school_id || bodySchoolId || "108348").replace(
    /^SCH-/i,
    "",
  );
  const targetSchoolYear = normalizeSchoolYear(school_year || bodySchoolYear);
  const targetGradeLevel = grade_level || gradeLevel || "Grade 1";
  const targetSectionName = (section_name || sectionName || "SECTION 1")
    .toUpperCase()
    .trim();
  const targetType = section_type || sectionType || "MONO GRADE";

  // Adviser semantics: a payload WITHOUT any adviser field leaves the stored adviser alone; an adviser field that is
  // empty/null ("Unassigned") clears it on purpose; a value is stored (foreign key when that person has a profile row).
  const adviserKeys = [adviser_id, advisor_id, advisorId, adviserId];
  const adviserProvided = adviserKeys.some((v) => v !== undefined);
  const targetAdviserId =
    adviserKeys.find(
      (v) => v !== undefined && v !== null && String(v).trim() !== "",
    ) || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal =
    number_of_learners !== undefined ? number_of_learners : numberOfLearners;
  const totalLearners =
    rawTotal !== undefined && rawTotal !== null && rawTotal !== ""
      ? Number(rawTotal)
      : mVal + fVal;
  const targetSizeStatus =
    size_status ||
    sizeStatus ||
    calculateSizeStatus(targetGradeLevel, totalLearners, targetType);

  let validAdviserId = null;
  if (targetAdviserId) {
    const pCheck = await client.query(
      "SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1",
      [targetAdviserId],
    );
    if (pCheck.rows.length > 0) validAdviserId = pCheck.rows[0].id;
  }

  const sidPair = [targetSchoolId, "SCH-" + targetSchoolId];
  const byId = id
    ? (
        await client.query(
          "SELECT * FROM esf7_regular_sections WHERE id = $1 AND school_id = ANY($2)",
          [id, sidPair],
        )
      ).rows[0]
    : null;
  const sameName = (
    await client.query(
      "SELECT * FROM esf7_regular_sections WHERE school_id = ANY($1) AND grade_level = $2 AND section_name = $3 ORDER BY created_at, id",
      [sidPair, targetGradeLevel, targetSectionName],
    )
  ).rows.filter((r) => sameSchoolYear(r.school_year, targetSchoolYear));
  const byNatural = sameName[0] || null;

  if (byId && byNatural && byId.id !== byNatural.id) {
    const err = new Error(
      "Section " +
        targetGradeLevel +
        " " +
        targetSectionName +
        " already exists under another id (" +
        byNatural.id +
        ").",
    );
    err.status = 409;
    throw err;
  }
  const existing = byId || byNatural;
  // raw_payload keeps what the UI sent (including the adviser id for people without a profile row yet). A partial update
  // is merged over the stored payload, so fields it does not mention (like the adviser) survive.
  const payloadJson = JSON.stringify(
    adviserProvided
      ? body
      : {
          ...(existing && existing.raw_payload ? existing.raw_payload : {}),
          ...body,
        },
  );

  if (existing) {
    const r = await client.query(
      "UPDATE esf7_regular_sections SET " +
        "grade_level = $2, section_name = $3, adviser_id = CASE WHEN $11::boolean THEN $4 ELSE adviser_id END, section_type = $5, " +
        "male_learners = $6, female_learners = $7, number_of_learners = $8, size_status = $9, " +
        "raw_payload = $10::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *",
      [
        existing.id,
        targetGradeLevel,
        targetSectionName,
        validAdviserId,
        targetType,
        mVal,
        fVal,
        totalLearners,
        targetSizeStatus,
        payloadJson,
        adviserProvided,
      ],
    );
    return r.rows[0];
  }

  const countRes = await client.query(
    "SELECT COUNT(*) FROM esf7_regular_sections WHERE school_id = $1",
    [targetSchoolId],
  );
  const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
  const secId = id || "REG-" + targetSchoolId + "-" + seq;
  const r = await client.query(
    "INSERT INTO esf7_regular_sections (id, school_id, school_year, grade_level, section_name, section_type, " +
      "adviser_id, male_learners, female_learners, number_of_learners, size_status, raw_payload) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) " +
      "ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET " +
      "adviser_id = EXCLUDED.adviser_id, section_type = EXCLUDED.section_type, " +
      "male_learners = EXCLUDED.male_learners, female_learners = EXCLUDED.female_learners, " +
      "number_of_learners = EXCLUDED.number_of_learners, size_status = EXCLUDED.size_status, " +
      "raw_payload = EXCLUDED.raw_payload, updated_at = NOW() RETURNING *",
    [
      secId,
      targetSchoolId,
      targetSchoolYear,
      targetGradeLevel,
      targetSectionName,
      targetType,
      validAdviserId,
      mVal,
      fVal,
      totalLearners,
      targetSizeStatus,
      payloadJson,
    ],
  );
  return r.rows[0];
}

async function inTransaction(fn) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

router.post("/regular", async (req, res) => {
  try {
    const row = await inTransaction((client) =>
      upsertRegularSection(client, req.body),
    );
    res.status(201).json(formatRegularRecord(row));
  } catch (err) {
    console.error("Error upserting esf7_regular_sections:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /regular/sync - the whole regular-section save in ONE transaction: upsert every listed section and delete
// the explicitly removed ids (only inside this school). Any failure rolls everything back.
router.post("/regular/sync", async (req, res) => {
  try {
    const { sections = [], deletedIds = [] } = req.body || {};
    const schoolId = String(
      req.body.schoolId || getSchoolIdFromRequest(req) || "",
    ).replace(/^SCH-/i, "");
    if (!schoolId)
      return res.status(400).json({ error: "schoolId is required" });
    const result = await inTransaction(async (client) => {
      const saved = [];
      for (const sec of sections) {
        saved.push(
          await upsertRegularSection(client, {
            ...sec,
            schoolId,
            schoolYear: sec.schoolYear || req.body.schoolYear,
          }),
        );
      }
      let removed = 0;
      if (deletedIds.length) {
        const d = await client.query(
          "DELETE FROM esf7_regular_sections WHERE id = ANY($1) AND school_id = ANY($2)",
          [deletedIds.map(String), [schoolId, "SCH-" + schoolId]],
        );
        removed = d.rowCount;
      }
      return { saved, removed };
    });
    res.json({
      success: true,
      sections: result.saved.map(formatRegularRecord).filter(Boolean),
      removed: result.removed,
    });
  } catch (err) {
    console.error("Error syncing esf7_regular_sections:", err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /sned - Insert/Update SNED Section
router.post("/sned", async (req, res) => {
  const {
    id,
    school_id,
    schoolId: bodySchoolId,
    school_year,
    schoolYear: bodySchoolYear,
    section_type,
    sectionType,
    grade_level,
    gradeLevel,
    section_name,
    sectionName,
    program_type,
    programType,
    adviser_id,
    advisor_id,
    advisorId,
    adviserId,
    male_learners,
    maleLearners,
    female_learners,
    femaleLearners,
    number_of_learners,
    numberOfLearners,
    size_status,
    sizeStatus,
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || "108348";
  const targetSchoolYear = school_year || bodySchoolYear || "2026-2027";
  const targetGradeLevel = grade_level || gradeLevel || "SNED (NON-GRADED)";
  const targetSectionName = (section_name || sectionName || "SNED SECTION 1")
    .toUpperCase()
    .trim();
  const targetProgramType = program_type || programType || null;
  const targetAdviserId =
    adviser_id || advisor_id || advisorId || adviserId || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal =
    number_of_learners !== undefined ? number_of_learners : numberOfLearners;
  const totalLearners =
    rawTotal !== undefined && rawTotal !== null && rawTotal !== ""
      ? Number(rawTotal)
      : mVal + fVal;
  const targetSizeStatus =
    size_status ||
    sizeStatus ||
    calculateSizeStatus("SNED", totalLearners, "SNED (NON-GRADED)");

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM esf7_sned_sections WHERE school_id = $1`,
      [targetSchoolId],
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const secId =
      id && !String(id).startsWith("sec-draft-")
        ? id
        : `SNED-${targetSchoolId.replace(/^SCH-/i, "")}-${seq}`;
    const targetSectionType =
      section_type || sectionType || "SNED (NON-GRADED)";
    const targetSectionName = (section_name || sectionName || secId)
      .toUpperCase()
      .trim();

    let validAdviserId = null;
    if (targetAdviserId) {
      const pCheck = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetAdviserId],
      );
      if (pCheck.rows.length > 0) validAdviserId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_sned_sections (
        id, school_id, school_year, section_type, grade_level, section_name, program_type,
        adviser_id, male_learners, female_learners, number_of_learners, size_status, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      ON CONFLICT (school_id, school_year, section_name) DO UPDATE SET
        section_type = EXCLUDED.section_type,
        grade_level = EXCLUDED.grade_level,
        program_type = EXCLUDED.program_type,
        adviser_id = COALESCE(EXCLUDED.adviser_id, esf7_sned_sections.adviser_id),
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        number_of_learners = EXCLUDED.number_of_learners,
        size_status = EXCLUDED.size_status,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId,
      targetSchoolId,
      targetSchoolYear,
      targetSectionType,
      targetGradeLevel,
      targetSectionName,
      targetProgramType,
      validAdviserId,
      mVal,
      fVal,
      totalLearners,
      targetSizeStatus,
      JSON.stringify(req.body),
    ]);
    res.status(201).json(formatSnedRecord(result.rows[0]));
  } catch (err) {
    console.error("Error inserting esf7_sned_sections:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /als - Insert/Update ALS Section
router.post("/als", async (req, res) => {
  const {
    id,
    school_id,
    schoolId: bodySchoolId,
    school_year,
    schoolYear: bodySchoolYear,
    section_type,
    sectionType,
    grade_level,
    gradeLevel,
    section_name,
    sectionName,
    delivery_mode,
    deliveryMode,
    clc_name,
    clcName,
    adviser_id,
    advisor_id,
    advisorId,
    adviserId,
    male_learners,
    maleLearners,
    female_learners,
    femaleLearners,
    number_of_learners,
    numberOfLearners,
    size_status,
    sizeStatus,
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || "108348";
  const targetSchoolYear = school_year || bodySchoolYear || "2026-2027";
  const targetGradeLevel = grade_level || gradeLevel || "ALS";
  const targetSectionName = (section_name || sectionName || "ALS SECTION 1")
    .toUpperCase()
    .trim();
  const targetDeliveryMode = delivery_mode || deliveryMode || null;
  const targetClcName = clc_name || clcName || null;
  const targetAdviserId =
    adviser_id || advisor_id || advisorId || adviserId || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal =
    number_of_learners !== undefined ? number_of_learners : numberOfLearners;
  const totalLearners =
    rawTotal !== undefined && rawTotal !== null && rawTotal !== ""
      ? Number(rawTotal)
      : mVal + fVal;
  const targetSizeStatus =
    size_status ||
    sizeStatus ||
    calculateSizeStatus("ALS", totalLearners, "ALS");

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM esf7_als_sections WHERE school_id = $1`,
      [targetSchoolId],
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const secId =
      id && !String(id).startsWith("sec-draft-")
        ? id
        : `ALS-${targetSchoolId.replace(/^SCH-/i, "")}-${seq}`;
    const targetSectionType = section_type || sectionType || "ALS";
    const targetSectionName = (section_name || sectionName || secId)
      .toUpperCase()
      .trim();

    let validAdviserId = null;
    if (targetAdviserId) {
      const pCheck = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetAdviserId],
      );
      if (pCheck.rows.length > 0) validAdviserId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_als_sections (
        id, school_id, school_year, section_type, grade_level, section_name, delivery_mode, clc_name,
        adviser_id, male_learners, female_learners, number_of_learners, size_status, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
      ON CONFLICT (school_id, school_year, section_name) DO UPDATE SET
        section_type = EXCLUDED.section_type,
        grade_level = EXCLUDED.grade_level,
        delivery_mode = EXCLUDED.delivery_mode,
        clc_name = EXCLUDED.clc_name,
        adviser_id = COALESCE(EXCLUDED.adviser_id, esf7_als_sections.adviser_id),
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        number_of_learners = EXCLUDED.number_of_learners,
        size_status = EXCLUDED.size_status,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId,
      targetSchoolId,
      targetSchoolYear,
      targetSectionType,
      targetGradeLevel,
      targetSectionName,
      targetDeliveryMode,
      targetClcName,
      validAdviserId,
      mVal,
      fVal,
      totalLearners,
      targetSizeStatus,
      JSON.stringify(req.body),
    ]);
    res.status(201).json(formatAlsRecord(result.rows[0]));
  } catch (err) {
    console.error("Error inserting esf7_als_sections:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /aral - Insert/Update ARAL Section
router.post("/aral", async (req, res) => {
  const {
    id,
    school_id,
    schoolId: bodySchoolId,
    school_year,
    schoolYear: bodySchoolYear,
    section_type,
    sectionType,
    basis_type,
    basisType,
    grade_level,
    gradeLevel,
    assessment_tool,
    assessmentTool,
    profile_level,
    profileLevel,
    section_name,
    sectionName,
    tutor_id,
    tutorId,
    male_learners,
    maleLearners,
    female_learners,
    femaleLearners,
    total_learners,
    totalLearners,
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || "108348";
  const targetSchoolYear = school_year || bodySchoolYear || "2026-2027";
  const targetBasis = basis_type || basisType || "grade";
  const targetGrade = grade_level || gradeLevel || "Grade 3";
  const targetTool = assessment_tool || assessmentTool || null;
  const targetProfile = profile_level || profileLevel || null;
  const targetName = section_name || sectionName || `ARAL Section`;
  const targetTutorId = tutor_id || tutorId || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal =
    total_learners !== undefined ? total_learners : totalLearners;
  const computedTotal =
    rawTotal !== undefined && rawTotal !== null && rawTotal !== ""
      ? Number(rawTotal)
      : mVal + fVal;

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM esf7_aral_sections WHERE school_id = $1`,
      [targetSchoolId],
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const secId =
      id && !String(id).startsWith("sec-draft-")
        ? id
        : `ARAL-${targetSchoolId.replace(/^SCH-/i, "")}-${seq}`;
    const targetSectionType = section_type || sectionType || "ARAL";
    const targetName = (section_name || sectionName || secId)
      .toUpperCase()
      .trim();

    let validTutorId = null;
    if (targetTutorId) {
      const pCheck = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetTutorId],
      );
      if (pCheck.rows.length > 0) validTutorId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_aral_sections (
        id, school_id, school_year, basis_type, section_type, grade_level, assessment_tool,
        profile_level, section_name, tutor_id, male_learners, female_learners, total_learners, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        basis_type = EXCLUDED.basis_type,
        section_type = EXCLUDED.section_type,
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
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId,
      targetSchoolId,
      targetSchoolYear,
      targetBasis,
      targetSectionType,
      targetGrade,
      targetTool,
      targetProfile,
      targetName,
      validTutorId,
      mVal,
      fVal,
      computedTotal,
      JSON.stringify(req.body),
    ]);
    res.status(201).json(formatAralRecord(result.rows[0]));
  } catch (err) {
    console.error("Error inserting esf7_aral_sections:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /remedial-enrichment - Insert/Update Remedial/Enrichment Section
router.post("/remedial-enrichment", async (req, res) => {
  const {
    id,
    school_id,
    schoolId: bodySchoolId,
    school_year,
    schoolYear: bodySchoolYear,
    intervention_type,
    interventionType,
    section_type,
    sectionType,
    grade_level,
    gradeLevel,
    section_name,
    sectionName,
    assigned_teacher_id,
    assignedTeacherId,
    adviser_id,
    adviserId,
    male_learners,
    maleLearners,
    female_learners,
    femaleLearners,
    total_learners,
    totalLearners,
  } = req.body;

  const targetSchoolId = school_id || bodySchoolId || "108348";
  const targetSchoolYear = school_year || bodySchoolYear || "2026-2027";
  const targetIntervention =
    intervention_type ||
    interventionType ||
    section_type ||
    sectionType ||
    "REMEDIAL";
  const targetGrade = grade_level || gradeLevel || "Grade 1";
  const targetName = (
    section_name ||
    sectionName ||
    `${targetIntervention} SECTION`
  )
    .toUpperCase()
    .trim();
  const targetTeacherId =
    assigned_teacher_id || assignedTeacherId || adviser_id || adviserId || null;

  const mVal = Number(male_learners || maleLearners || 0);
  const fVal = Number(female_learners || femaleLearners || 0);
  const rawTotal =
    total_learners !== undefined ? total_learners : totalLearners;
  const computedTotal =
    rawTotal !== undefined && rawTotal !== null && rawTotal !== ""
      ? Number(rawTotal)
      : mVal + fVal;

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM esf7_remedial_enrichment_sections WHERE school_id = $1`,
      [targetSchoolId],
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const prefix = targetIntervention.includes("ENRICHMENT") ? "ENR" : "REM";
    const secId =
      id && !String(id).startsWith("sec-draft-")
        ? id
        : `${prefix}-${targetSchoolId.replace(/^SCH-/i, "")}-${seq}`;
    const targetSectionType = targetIntervention.includes("ENRICHMENT")
      ? "ENRICHMENT"
      : "REMEDIAL";
    const targetFinalName = (section_name || sectionName || secId)
      .toUpperCase()
      .trim();

    let validTeacherId = null;
    if (targetTeacherId) {
      const pCheck = await db.query(
        `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetTeacherId],
      );
      if (pCheck.rows.length > 0) validTeacherId = pCheck.rows[0].id;
    }

    const query = `
      INSERT INTO esf7_remedial_enrichment_sections (
        id, school_id, school_year, intervention_type, section_type, grade_level, section_name,
        assigned_teacher_id, male_learners, female_learners, total_learners, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        intervention_type = EXCLUDED.intervention_type,
        section_type = EXCLUDED.section_type,
        grade_level = EXCLUDED.grade_level,
        section_name = EXCLUDED.section_name,
        assigned_teacher_id = EXCLUDED.assigned_teacher_id,
        male_learners = EXCLUDED.male_learners,
        female_learners = EXCLUDED.female_learners,
        total_learners = EXCLUDED.total_learners,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      secId,
      targetSchoolId,
      targetSchoolYear,
      targetIntervention,
      targetSectionType,
      targetGrade,
      targetFinalName,
      validTeacherId,
      mVal,
      fVal,
      computedTotal,
      JSON.stringify(req.body),
    ]);
    res.status(201).json(formatRemedialRecord(result.rows[0]));
  } catch (err) {
    console.error("Error inserting esf7_remedial_enrichment_sections:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE endpoints for each table category
router.delete("/regular/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_regular_sections WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({
      success: true,
      message: `Regular section ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/sned/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_sned_sections WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({
      success: true,
      message: `SNED section ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/als/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_als_sections WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({
      success: true,
      message: `ALS section ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/aral/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_aral_sections WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({
      success: true,
      message: `ARAL section ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/remedial-enrichment/:id", async (req, res) => {
  try {
    await db.query(
      `DELETE FROM esf7_remedial_enrichment_sections WHERE id = $1`,
      [req.params.id],
    );
    res.json({
      success: true,
      message: `Remedial section ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /clear-all — Remove all sections for a school
router.delete("/clear-all", async (req, res) => {
  try {
    const schoolId =
      getSchoolIdFromRequest(req) ||
      req.query.schoolId ||
      req.query.school_id ||
      "108348";
    const cleanSchoolId = String(schoolId).replace("SCH-", "").trim();

    await Promise.all([
      db
        .query(
          `DELETE FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
      db
        .query(
          `DELETE FROM esf7_sned_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
      db
        .query(
          `DELETE FROM esf7_als_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
      db
        .query(
          `DELETE FROM esf7_aral_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
      db
        .query(
          `DELETE FROM esf7_remedial_enrichment_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
      db
        .query(
          `DELETE FROM esf7_class_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
      db
        .query(
          `DELETE FROM class_sections WHERE school_id = $1 OR school_id = $2`,
          [schoolId, cleanSchoolId],
        )
        .catch(() => {}),
    ]);

    res.json({
      success: true,
      message: `All class sections for school ${schoolId} cleared successfully.`,
    });
  } catch (err) {
    console.error("Error clearing class sections:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generic DELETE endpoint (checks all 5 section tables)
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await Promise.all([
      db
        .query(`DELETE FROM esf7_regular_sections WHERE id = $1`, [id])
        .catch(() => {}),
      db
        .query(`DELETE FROM esf7_sned_sections WHERE id = $1`, [id])
        .catch(() => {}),
      db
        .query(`DELETE FROM esf7_als_sections WHERE id = $1`, [id])
        .catch(() => {}),
      db
        .query(`DELETE FROM esf7_aral_sections WHERE id = $1`, [id])
        .catch(() => {}),
      db
        .query(`DELETE FROM esf7_remedial_enrichment_sections WHERE id = $1`, [
          id,
        ])
        .catch(() => {}),
      db
        .query(`DELETE FROM esf7_class_sections WHERE id = $1`, [id])
        .catch(() => {}),
      db
        .query(`DELETE FROM class_sections WHERE id = $1`, [id])
        .catch(() => {}),
    ]);
    res.json({ success: true, message: `Section ${id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.upsertRegularSection = upsertRegularSection;
router.formatRegularRecord = formatRegularRecord; // exposed for tests
module.exports = router;
