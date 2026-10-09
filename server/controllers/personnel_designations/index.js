const express = require("express");
const router = express.Router();
const db = require("../../db");

function formatDesignationRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    designationName: row.designation_name,
    designation_name: row.designation_name,
    keyStage: row.key_stage || raw.keyStage || null,
    key_stage: row.key_stage || raw.keyStage || null,
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
    rawPayload: raw,
  };
}

// GET all designations for a personnel_id
router.get("/personnel/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
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

// POST Add or update a designation for a personnel record
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
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonId],
    );
    const schoolId =
      personRes.rows.length > 0 ? personRes.rows[0].school_id : "108348";

    const dsgId =
      req.body.id ||
      `DSG-${schoolId.replace("SCH-", "")}-${String(targetPersonId).split("-").pop()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

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

    const query = `
      INSERT INTO esf7_personnel_designations (
        id, personnel_id, designation_name, key_stage, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      RETURNING *;
    `;

    const values = [
      dsgId,
      targetPersonId,
      name,
      finalKeyStage || null,
      grade_level || gradeLevel || null,
      subject_area || subjectArea || null,
      track || null,
      isApproved,
      isConfirmed,
      key,
      JSON.stringify(req.body),
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
