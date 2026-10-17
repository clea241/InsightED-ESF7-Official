const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const { syncDesignationsInTransaction } = require("../personnel/profile");

const cleanSid = (v) =>
  String(v || "")
    .replace(/^SCH-/i, "")
    .trim();

function formatDesignationRecord(row) {
  if (!row) return null;
  const extras = row.extras || {};
  return {
    ...extras,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    designationName: row.designation_name,
    designation_name: row.designation_name,
    keyStage: row.key_stage || extras.keyStage || null,
    key_stage: row.key_stage || extras.keyStage || null,
    gradeLevel: row.grade_level || "",
    grade_level: row.grade_level || "",
    subjectArea: row.subject_area || "",
    subject_area: row.subject_area || "",
    track: row.track || "",
    isSdsApproved: !!row.is_sds_approved,
    is_sds_approved: !!row.is_sds_approved,
    sdsConfirmed: !!row.sds_confirmed,
    sds_confirmed: !!row.sds_confirmed,
    serializedKey: row.serialized_key,
    serialized_key: row.serialized_key,
    rawPayload: extras,
    extras,
  };
}

// GET all designations for a personnel_id (supports canonical id, prn, or legacy_id)
router.get("/personnel/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT d.* FROM esf7_personnel_designations d
       LEFT JOIN esf7_personnel_profile p ON p.id = d.personnel_id
       WHERE d.personnel_id = $1 OR p.prn = $1 OR p.legacy_id = $1
       ORDER BY d.created_at ASC`,
      [personnel_id],
    );
    res.json(result.rows.map(formatDesignationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET designations by Key Stage (e.g. KS1, KS2, KS3, KS4)
router.get("/key-stage/:ks", async (req, res) => {
  const ks = String(req.params.ks).toUpperCase();
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE UPPER(key_stage) = $1 ORDER BY created_at ASC`,
      [ks],
    );
    res.json(result.rows.map(formatDesignationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all designations in the school
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_designations ORDER BY created_at ASC`,
    );
    res.json(result.rows.map(formatDesignationRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to extract key stage from string if not explicitly passed
function extractKeyStage(keyStr) {
  if (!keyStr) return null;
  const upper = String(keyStr).toUpperCase();
  if (
    upper.startsWith("DEPARTMENT HEAD") &&
    (upper.includes("KEY STAGE 1") ||
      upper.includes("KS1") ||
      upper.includes("KINDER") ||
      upper.includes("GRADE 1") ||
      upper.includes("GRADE 2") ||
      upper.includes("GRADE 3")) &&
    !upper.includes("KEY STAGE 2") &&
    !upper.includes("KEY STAGE 3") &&
    !upper.includes("KEY STAGE 4") &&
    !upper.includes("GRADE 4") &&
    !upper.includes("GRADE 5") &&
    !upper.includes("GRADE 6") &&
    !upper.includes("GRADE 7") &&
    !upper.includes("GRADE 8") &&
    !upper.includes("GRADE 9") &&
    !upper.includes("GRADE 10")
  ) {
    return "KS1";
  }
  if (upper.includes("KEY STAGE 2") || upper.includes("KS2")) return "KS2";
  if (upper.includes("KEY STAGE 3") || upper.includes("KS3")) return "KS3";
  if (
    upper.includes("KEY STAGE 4") ||
    upper.includes("KS4") ||
    upper.includes("ACADEMIC TRACK") ||
    upper.includes("TECH-PRO TRACK")
  )
    return "KS4";
  return null;
}

// PUT Sync all designations for ONE personnel member (Designations page save).
// Replaces only that person's designation rows (add / change / remove) in one short
// transaction using the same sync as the profile save; nothing else is rewritten.
router.put("/personnel/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  const { designations = [], designation = "" } = req.body || {};
  const sessionSchoolId = cleanSid(getSchoolIdFromRequest(req));
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const personRes = await client.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id],
    );
    if (personRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: `Cannot sync designations: Personnel profile '${personnel_id}' does not exist in esf7_personnel_profile.`,
      });
    }
    const person = personRes.rows[0];
    const personSchool = cleanSid(person.school_id);
    if (sessionSchoolId && personSchool && sessionSchoolId !== personSchool) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Personnel belongs to a different school." });
    }
    await syncDesignationsInTransaction(
      client,
      person.id,
      personSchool,
      typeof designation === "string" ? designation : "",
      Array.isArray(designations) ? designations : [],
      req.body,
    );
    const out = await client.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [person.id],
    );
    await client.query("COMMIT");
    res.json(out.rows.map(formatDesignationRecord));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error syncing designations:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---- "Mark N/A" status for required school designations (Section 1) ----
// One row per (school, school year, designation key) that the school marked N/A.
let naTableReady = false;
async function ensureNaTable() {
  if (naTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS esf7_school_designation_na (
      school_id TEXT NOT NULL,
      school_year TEXT NOT NULL,
      designation_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (school_id, school_year, designation_key)
    )`);
  naTableReady = true;
}

const naScope = (req) => ({
  schoolId: cleanSid(
    getSchoolIdFromRequest(req) || req.query.schoolId || req.body?.schoolId,
  ),
  schoolYear: String(
    req.query.schoolYear || req.body?.schoolYear || "SY 26-27",
  ).trim(),
});

router.get("/na", async (req, res) => {
  try {
    const { schoolId, schoolYear } = naScope(req);
    if (!schoolId) return res.status(400).json({ error: "schoolId required" });
    await ensureNaTable();
    const r = await db.query(
      `SELECT designation_key FROM esf7_school_designation_na WHERE school_id = $1 AND school_year = $2`,
      [schoolId, schoolYear],
    );
    const naMap = {};
    r.rows.forEach((row) => {
      naMap[row.designation_key] = true;
    });
    res.json({ schoolId, schoolYear, naMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Replaces the N/A set for this school + year (so un-marking N/A deletes the row).
router.put("/na", async (req, res) => {
  const { schoolId, schoolYear } = naScope(req);
  if (!schoolId) return res.status(400).json({ error: "schoolId required" });
  const naMap = req.body?.naMap;
  if (!naMap || typeof naMap !== "object" || Array.isArray(naMap)) {
    return res.status(400).json({ error: "naMap object required" });
  }
  const keys = Object.keys(naMap)
    .filter((k) => naMap[k] === true)
    .map((k) => String(k).trim())
    .filter(Boolean);
  const client = await db.getClient();
  try {
    await ensureNaTable();
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM esf7_school_designation_na WHERE school_id = $1 AND school_year = $2`,
      [schoolId, schoolYear],
    );
    if (keys.length > 0) {
      await client.query(
        `INSERT INTO esf7_school_designation_na (school_id, school_year, designation_key)
         SELECT $1, $2, k FROM unnest($3::text[]) AS k`,
        [schoolId, schoolYear, keys],
      );
    }
    await client.query("COMMIT");
    // Verify: the stored set must equal what was asked for.
    const stored = await db.query(
      `SELECT designation_key FROM esf7_school_designation_na WHERE school_id = $1 AND school_year = $2`,
      [schoolId, schoolYear],
    );
    const storedKeys = new Set(stored.rows.map((r) => r.designation_key));
    if (
      storedKeys.size !== keys.length ||
      keys.some((k) => !storedKeys.has(k))
    ) {
      throw new Error("The N/A status was not stored as requested.");
    }
    res.json({ success: true, count: keys.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error saving designation N/A status:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST Add or update a single designation for a personnel record
router.post("/", async (req, res) => {
  try {
    const {
      personnel_id,
      personnelId,
      designation_name,
      designationName,
      key_stage,
      keyStage,
      grade_level,
      gradeLevel,
      subject_area,
      subjectArea,
      track,
      is_sds_approved,
      isSdsApproved,
      sds_confirmed,
      sdsConfirmed,
      serialized_key,
      serializedKey,
      designation,
    } = req.body;

    const targetPersonId = personnel_id || personnelId;
    if (!targetPersonId) {
      return res.status(400).json({ error: "personnel_id is required" });
    }

    const personRes = await db.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 OR legacy_id = $1 LIMIT 1`,
      [targetPersonId],
    );
    if (personRes.rows.length === 0) {
      return res.status(404).json({
        error: `Cannot assign designation: Personnel profile '${targetPersonId}' does not exist in esf7_personnel_profile.`,
      });
    }

    const resolvedPersonnelId = personRes.rows[0].id;
    const schoolId = String(personRes.rows[0].school_id || "108348").replace(
      /^SCH-/i,
      "",
    );

    const key =
      serialized_key ||
      serializedKey ||
      designation ||
      designation_name ||
      designationName ||
      "OFFICIAL DESIGNATION";

    const isApproved =
      is_sds_approved === true ||
      isSdsApproved === true ||
      key.endsWith("::APPROVED_SDS");
    const isConfirmed = sds_confirmed === true || sdsConfirmed === true;
    const name =
      designation_name ||
      designationName ||
      key.split(" - ")[0].replace("::APPROVED_SDS", "").trim();
    const finalKeyStage = key_stage || keyStage || extractKeyStage(key);

    const dsgId =
      req.body.id ||
      `DSG-${schoolId}-${String(resolvedPersonnelId).split("-").pop()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const query = `
      INSERT INTO esf7_personnel_designations (
        id, personnel_id, school_id, designation_name, key_stage, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (personnel_id, serialized_key) DO UPDATE SET
        designation_name = EXCLUDED.designation_name,
        key_stage = EXCLUDED.key_stage,
        grade_level = EXCLUDED.grade_level,
        subject_area = EXCLUDED.subject_area,
        track = EXCLUDED.track,
        is_sds_approved = EXCLUDED.is_sds_approved,
        sds_confirmed = EXCLUDED.sds_confirmed,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      dsgId,
      resolvedPersonnelId,
      schoolId,
      name,
      finalKeyStage || null,
      grade_level || gradeLevel || null,
      subject_area || subjectArea || null,
      track || null,
      isApproved,
      isConfirmed,
      key,
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatDesignationRecord(result.rows[0]));
  } catch (err) {
    console.error("Error inserting designation:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a designation by ID
router.delete("/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_personnel_designations WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({
      success: true,
      message: `Designation ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
