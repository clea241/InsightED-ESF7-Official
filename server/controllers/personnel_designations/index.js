const express = require("express");
const router = express.Router();
const db = require("../../db");
const { formatCanonicalPrn } = require("../personnel/common");

function extractCleanDesignationKey(item) {
  if (!item) return "";
  if (typeof item === "string") {
    const s = item.replace(/::APPROVED_SDS/gi, "").trim();
    if (
      !s ||
      s === "[object Object]" ||
      s === "object Object" ||
      s === "{}" ||
      s.startsWith("[object")
    ) {
      return "";
    }
    return s;
  }
  if (typeof item === "object") {
    const candidate =
      (typeof item.serializedKey === "string" && item.serializedKey) ||
      (typeof item.serialized_key === "string" && item.serialized_key) ||
      (typeof item.designationName === "string" && item.designationName) ||
      (typeof item.designation_name === "string" && item.designation_name) ||
      (typeof item.designation === "string" && item.designation) ||
      (typeof item.name === "string" && item.name) ||
      (typeof item.title === "string" && item.title) ||
      "";
    if (candidate) return extractCleanDesignationKey(candidate);
    if (item.designation && typeof item.designation === "object") {
      return extractCleanDesignationKey(item.designation);
    }
  }
  return "";
}

function formatDesignationRecord(row) {
  if (!row) return null;
  const extras = row.extras || {};
  const sKey = row.serialized_key || row.designation_name || "";
  const dName = row.designation_name || sKey;
  return {
    ...extras,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    designationName: dName,
    designation_name: dName,
    name: sKey || dName,
    designation: sKey || dName,
    title: sKey || dName,
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
    serializedKey: sKey,
    serialized_key: sKey,
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

// PUT Sync all designations for a personnel member
router.put("/personnel/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  const { designations = [], designation = "" } = req.body || {};
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const personRes = await client.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id],
    );
    let resolvedPersonnelId;
    let targetSchoolId;

    if (personRes.rows.length === 0) {
      // Auto-upsert personnel profile if loaded from master list or draft (prevents 404 & foreign key violation)
      const cleanSchoolId = String(
        req.body.school_id || req.body.schoolId || "108348",
      ).replace(/^SCH-/i, "");
      const targetSchoolYear = String(
        req.body.school_year || req.body.schoolYear || "2024-2025",
      );
      const pPrn = req.body.prn
        ? formatCanonicalPrn(req.body.prn)
        : `PRN-${personnel_id}`;
      const fName = String(
        req.body.first_name || req.body.firstName || "TEACHER",
      )
        .toUpperCase()
        .trim();
      const lName = String(req.body.last_name || req.body.lastName || "STAFF")
        .toUpperCase()
        .trim();
      const pType = String(req.body.type || "teaching").toLowerCase();

      const insRes = await client.query(
        `INSERT INTO esf7_personnel_profile (
          id, prn, school_id, school_year, type, first_name, last_name, status, legacy_id, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'canonical', $8, NOW())
        ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
        RETURNING id, school_id`,
        [
          personnel_id,
          pPrn,
          cleanSchoolId,
          targetSchoolYear,
          pType,
          fName,
          lName,
          personnel_id,
        ],
      );
      resolvedPersonnelId = insRes.rows[0].id;
      targetSchoolId = String(
        insRes.rows[0].school_id || cleanSchoolId,
      ).replace(/^SCH-/i, "");
    } else {
      resolvedPersonnelId = personRes.rows[0].id;
      targetSchoolId = String(personRes.rows[0].school_id || "108348").replace(
        /^SCH-/i,
        "",
      );
    }

    await client.query(
      "DELETE FROM esf7_personnel_designations WHERE personnel_id = $1",
      [resolvedPersonnelId],
    );

    const rawDesigList = [];
    if (designation && typeof designation === "string" && designation.trim()) {
      rawDesigList.push(designation.trim());
    }
    if (Array.isArray(designations)) {
      designations.forEach((d) => {
        if (d) rawDesigList.push(d);
      });
    }

    const processedKeys = new Set();
    const inserted = [];
    let counter = 1;

    for (const item of rawDesigList) {
      if (!item) continue;
      const cleanKey = extractCleanDesignationKey(item);
      if (
        !cleanKey ||
        cleanKey === "[object Object]" ||
        processedKeys.has(cleanKey.toUpperCase())
      )
        continue;
      processedKeys.add(cleanKey.toUpperCase());

      const isSds =
        (typeof item === "string" &&
          (item.includes("::APPROVED_SDS") ||
            item.toUpperCase().includes("APPROVED_SDS"))) ||
        (item &&
          (item.isSdsApproved === true || item.is_sds_approved === true));
      const isConf =
        (item && (item.sdsConfirmed === true || item.sds_confirmed === true)) ||
        isSds;

      let dsgName = cleanKey;
      let keyStage =
        (item && (item.keyStage || item.key_stage)) ||
        extractKeyStage(cleanKey);
      let gradeLevel = (item && (item.gradeLevel || item.grade_level)) || null;
      let subjectArea =
        (item && (item.subjectArea || item.subject_area)) || null;
      let track = (item && item.track) || null;

      if (cleanKey.includes(" - ")) {
        const parts = cleanKey.split(" - ").map((p) => p.trim());
        dsgName = parts[0];
        if (parts.length === 2) {
          gradeLevel = parts[1];
        } else if (parts.length >= 3) {
          gradeLevel = parts[1];
          subjectArea = parts[2];
          if (parts.length >= 4) track = parts[3];
        }
      }

      const dsgObj = {
        designationName:
          typeof item === "object" &&
          (item.designationName || item.designation_name)
            ? item.designationName || item.designation_name
            : dsgName,
        keyStage,
        gradeLevel: gradeLevel || "",
        subjectArea: subjectArea || "",
        track: track || "",
        isSdsApproved: isSds,
        sdsConfirmed: isConf,
        serializedKey: cleanKey,
      };

      if (
        !dsgObj.designationName ||
        dsgObj.designationName === "[object Object]"
      )
        continue;

      const dsgId = `DSG-${targetSchoolId}-${String(resolvedPersonnelId).split("-").pop()}-${String(counter++).padStart(3, "0")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const insRes = await client.query(
        `INSERT INTO esf7_personnel_designations (
          id, personnel_id, school_id, designation_name, key_stage, grade_level, subject_area, track,
          is_sds_approved, sds_confirmed, serialized_key, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          designation_name = EXCLUDED.designation_name,
          key_stage = EXCLUDED.key_stage,
          grade_level = EXCLUDED.grade_level,
          subject_area = EXCLUDED.subject_area,
          track = EXCLUDED.track,
          is_sds_approved = EXCLUDED.is_sds_approved,
          sds_confirmed = EXCLUDED.sds_confirmed,
          serialized_key = EXCLUDED.serialized_key,
          updated_at = NOW()
        RETURNING *`,
        [
          dsgId,
          resolvedPersonnelId,
          targetSchoolId,
          dsgObj.designationName,
          dsgObj.keyStage || null,
          dsgObj.gradeLevel || null,
          dsgObj.subjectArea || null,
          dsgObj.track || null,
          !!dsgObj.isSdsApproved,
          !!dsgObj.sdsConfirmed,
          dsgObj.serializedKey || dsgObj.designationName,
        ],
      );
      inserted.push(formatDesignationRecord(insRes.rows[0]));
    }

    await client.query("COMMIT");
    res.json(inserted);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error syncing designations:", err);
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
