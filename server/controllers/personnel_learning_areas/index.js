const express = require("express");
const router = express.Router();
const db = require("../../db");

function formatLearningAreasRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    learningAreaMap: row.matrix_data || {},
    matrix_data: row.matrix_data || {},
    rawPayload: row.matrix_data || {},
  };
}

// GET learning area matrix (supports query param personnelId or personnel_id)
router.get("/", async (req, res) => {
  const personnel_id = req.query.personnelId || req.query.personnel_id;
  if (!personnel_id) {
    return res.json({ learningAreaMap: {}, matrix_data: {} });
  }
  try {
    const result = await db.query(
      `SELECT la.* FROM esf7_personnel_learning_areas la
       LEFT JOIN esf7_personnel_profile p ON p.id = la.personnel_id
       WHERE la.personnel_id = $1 OR p.prn = $1 OR p.legacy_id = $1
       LIMIT 1`,
      [personnel_id],
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

    // Ensure parent profile exists in esf7_personnel_profile
    const personRes = await db.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1`,
      [personnelId],
    );

    if (personRes.rows.length === 0) {
      return res.status(404).json({
        error: `Cannot toggle learning area: Personnel profile '${personnelId}' does not exist in esf7_personnel_profile.`,
      });
    }

    const resolvedPersonnelId = personRes.rows[0].id;
    const schoolId = personRes.rows[0].school_id || "108348";

    const existing = await db.query(
      `SELECT matrix_data FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [resolvedPersonnelId],
    );

    let matrix =
      existing.rows.length > 0 && existing.rows[0].matrix_data
        ? existing.rows[0].matrix_data
        : {};
    const cellKey = `${schoolYear}||${learningArea}`;

    if (checked) {
      matrix[cellKey] = { checked: true, years: Number(yearsTaught || 1) };
    } else {
      delete matrix[cellKey];
    }

    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
    const laId = `LA-${cleanSchoolId}-${resolvedPersonnelId.slice(0, 8)}`;

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
      JSON.stringify(matrix),
    ]);

    res.json(formatLearningAreasRecord(result.rows[0]));
  } catch (err) {
    console.error("Error toggling learning area:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET learning area matrix for a personnel_id param
router.get("/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT la.* FROM esf7_personnel_learning_areas la
       LEFT JOIN esf7_personnel_profile p ON p.id = la.personnel_id
       WHERE la.personnel_id = $1 OR p.prn = $1 OR p.legacy_id = $1
       LIMIT 1`,
      [personnel_id],
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

    const personRes = await db.query(
      `SELECT id, school_id FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id],
    );

    if (personRes.rows.length === 0) {
      return res.status(404).json({
        error: `Cannot save learning area record: Personnel profile '${personnel_id}' does not exist in esf7_personnel_profile.`,
      });
    }

    const resolvedPersonnelId = personRes.rows[0].id;
    const schoolId = personRes.rows[0].school_id || "108348";
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
    const laId = `LA-${cleanSchoolId}-${resolvedPersonnelId.slice(0, 8)}`;

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

    res.json(formatLearningAreasRecord(result.rows[0]));
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
