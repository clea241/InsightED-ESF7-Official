const express = require("express");
const router = express.Router();
const db = require("../../db");
const {
  resolvePersonnelAliasIds,
  serializeLearningAreas,
} = require("../../services/personnelSharedReader");

function formatLearningAreasRecord(row) {
  if (!row) return { learningAreaMap: {}, matrix_data: {} };
  const serialized = serializeLearningAreas(row);
  return {
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    ...serialized,
    rawPayload: serialized.matrix_data,
  };
}

// GET learning area matrix (supports query param personnelId or personnel_id)
router.get("/", async (req, res) => {
  const personnel_id = req.query.personnelId || req.query.personnel_id;
  if (!personnel_id) {
    return res.json({ learningAreaMap: {}, matrix_data: {} });
  }
  try {
    const aliasIds = await resolvePersonnelAliasIds(db, personnel_id);
    const targetIds = aliasIds.length > 0 ? aliasIds : [personnel_id];

    const result = await db.query(
      `SELECT la.* FROM esf7_personnel_learning_areas la
       WHERE la.personnel_id = ANY($1::text[])
       ORDER BY la.updated_at DESC
       LIMIT 1`,
      [targetIds],
    );
    if (result.rows.length === 0) {
      return res.json({ learningAreaMap: {}, matrix_data: {} });
    }
    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /toggle — Toggle / update specific learning area cell
router.post("/toggle", async (req, res) => {
  try {
    const { personnelId, schoolYear, learningArea, checked, yearsTaught } =
      req.body;
    if (!personnelId)
      return res.status(400).json({ error: "personnelId is required" });

    const aliasIds = await resolvePersonnelAliasIds(db, personnelId);
    const targetIds = aliasIds.length > 0 ? aliasIds : [personnelId];

    // Ensure parent profile exists in esf7_personnel_profile
    const personRes = await db.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = ANY($1::text[]) OR legacy_id = ANY($1::text[]) OR prn = ANY($1::text[]) LIMIT 1`,
      [targetIds],
    );

    if (personRes.rows.length === 0) {
      return res.status(404).json({
        error: `Cannot toggle learning area: Personnel profile '${personnelId}' does not exist in esf7_personnel_profile.`,
      });
    }

    const resolvedPersonnelId = personRes.rows[0].id;
    const schoolId = personRes.rows[0].school_id || "108348";

    const existing = await db.query(
      `SELECT matrix_data FROM esf7_personnel_learning_areas WHERE personnel_id = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 1`,
      [targetIds],
    );

    let matrix =
      existing.rows.length > 0 && existing.rows[0].matrix_data
        ? existing.rows[0].matrix_data
        : {};
    if (typeof matrix === "string") {
      try {
        matrix = JSON.parse(matrix);
      } catch (e) {
        matrix = {};
      }
    }
    const cellKey = `${schoolYear}||${learningArea}`;

    if (checked) {
      matrix[cellKey] = { checked: true, years: Number(yearsTaught || 1) };
    } else {
      delete matrix[cellKey];
    }

    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
    const crypto = require("crypto");
    const laId = `LA-${cleanSchoolId}-${crypto.randomUUID()}`;

    const query = `
      INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (personnel_id) DO UPDATE SET
        matrix_data = EXCLUDED.matrix_data,
        updated_at = NOW()
      RETURNING *;
    `;

    await db.query(query, [laId, resolvedPersonnelId, JSON.stringify(matrix)]);

    // Verify stored
    const verifyRes = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1`,
      [resolvedPersonnelId],
    );
    if (verifyRes.rows.length === 0) {
      throw new Error(
        "Verification failed: learning area matrix was not persisted.",
      );
    }

    res.json(formatLearningAreasRecord(verifyRes.rows[0]));
  } catch (err) {
    console.error("Error toggling learning area:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET learning area matrix for a personnel_id param
router.get("/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const aliasIds = await resolvePersonnelAliasIds(db, personnel_id);
    const targetIds = aliasIds.length > 0 ? aliasIds : [personnel_id];

    const result = await db.query(
      `SELECT la.* FROM esf7_personnel_learning_areas la
       WHERE la.personnel_id = ANY($1::text[])
       ORDER BY la.updated_at DESC
       LIMIT 1`,
      [targetIds],
    );
    if (result.rows.length === 0) {
      return res.json({ learningAreaMap: {}, matrix_data: {} });
    }
    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT Upsert learning area matrix for a personnel record
router.post("/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const { learningAreaMap, matrix_data } = req.body;
    let targetMap = learningAreaMap || matrix_data || {};
    if (typeof targetMap === "string") {
      try {
        targetMap = JSON.parse(targetMap);
      } catch (e) {
        targetMap = {};
      }
    }

    const aliasIds = await resolvePersonnelAliasIds(db, personnel_id);
    const targetIds = aliasIds.length > 0 ? aliasIds : [personnel_id];

    const personRes = await db.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = ANY($1::text[]) OR legacy_id = ANY($1::text[]) OR prn = ANY($1::text[]) LIMIT 1`,
      [targetIds],
    );

    if (personRes.rows.length === 0) {
      return res.status(404).json({
        error: `Cannot save learning area record: Personnel profile '${personnel_id}' does not exist in esf7_personnel_profile.`,
      });
    }

    const resolvedPersonnelId = personRes.rows[0].id;
    const schoolId = personRes.rows[0].school_id || "108348";
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
    const crypto = require("crypto");
    const laId = `LA-${cleanSchoolId}-${crypto.randomUUID()}`;

    const query = `
      INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (personnel_id) DO UPDATE SET
        matrix_data = EXCLUDED.matrix_data,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      laId,
      resolvedPersonnelId,
      JSON.stringify(targetMap),
    ]);

    const verifyRes = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1`,
      [resolvedPersonnelId],
    );

    res.json(formatLearningAreasRecord(verifyRes.rows[0] || result.rows[0]));
  } catch (err) {
    console.error("Error upserting esf7_personnel_learning_areas:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT Single update route
router.put("/:personnel_id", async (req, res) => {
  return router.handle({ ...req, method: "POST" }, res);
});

module.exports = router;
