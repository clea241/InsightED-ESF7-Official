const express = require("express");
const router = express.Router();
const db = require("../../db");
const { safeCoerceDate } = require("../personnel/common");

function formatTrainingRecord(row) {
  if (!row) return null;
  const extras = row.extras || {};
  return {
    ...extras,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    type: String(row.training_type).toLowerCase(),
    trainingType: row.training_type,
    training_type: row.training_type,
    title: row.title,
    conductor: row.conductor || "N/A",
    startDate: row.start_date
      ? row.start_date instanceof Date
        ? row.start_date.toISOString().split("T")[0]
        : String(row.start_date).split("T")[0]
      : null,
    endDate: row.end_date
      ? row.end_date instanceof Date
        ? row.end_date.toISOString().split("T")[0]
        : String(row.end_date).split("T")[0]
      : null,
    days: row.days || 0,
    totalHours: Number(row.total_hours || 0),
    total_hours: Number(row.total_hours || 0),
    rawPayload: extras,
  };
}

// GET all training rows for a personnel_id
router.get("/personnel/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  try {
    const result = await db.query(
      `SELECT t.* FROM esf7_personnel_ld_trainings t
       LEFT JOIN esf7_personnel_profile p ON p.id = t.personnel_id
       WHERE t.personnel_id = $1 OR p.prn = $1 OR p.legacy_id = $1
       ORDER BY t.created_at ASC`,
      [personnel_id],
    );

    const neapRows = [];
    const certRows = [];
    const otherRows = [];

    for (const r of result.rows) {
      const formatted = formatTrainingRecord(r);
      const type = String(r.training_type).toUpperCase();
      if (type === "NEAP") {
        neapRows.push(formatted);
      } else if (type === "TESDA" || type === "CERTIFICATION") {
        certRows.push(formatted);
      } else {
        otherRows.push(formatted);
      }
    }

    res.json({
      neapTrainingRows: neapRows,
      certificationRows: certRows,
      otherTrainingRows: otherRows,
      allTrainings: result.rows.map(formatTrainingRecord),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync all training rows for a personnel (transactionally replaces training rows)
router.put("/personnel/:personnel_id", async (req, res) => {
  const { personnel_id } = req.params;
  const { neapTrainingRows, certificationRows, otherTrainingRows } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve canonical id from esf7_personnel_profile
    const personRes = await client.query(
      `SELECT id FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 LIMIT 1`,
      [personnel_id],
    );
    if (personRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: `Cannot save trainings: Personnel profile '${personnel_id}' does not exist in esf7_personnel_profile.`,
      });
    }
    const resolvedPersonnelId = personRes.rows[0].id;

    // Clear old training rows for this personnel
    await client.query(
      "DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = $1",
      [resolvedPersonnelId],
    );

    const allTrainings = [
      ...(neapTrainingRows || []).map((t) => ({ ...t, training_type: "NEAP" })),
      ...(certificationRows || []).map((t) => ({
        ...t,
        training_type: "TESDA",
      })),
      ...(otherTrainingRows || []).map((t) => ({
        ...t,
        training_type: "OTHER",
      })),
    ];

    const inserted = [];
    let counter = 1;
    for (const t of allTrainings) {
      const trnId = `TRN-${resolvedPersonnelId.replace("PER-", "")}-${String(counter++).padStart(3, "0")}`;
      const type = (t.training_type || t.type || "OTHER").toUpperCase();
      const title = t.title || "Professional Training";
      const conductor = t.conductor || "NEAP / DepEd";
      const startDate = safeCoerceDate(
        t.startDate || t.start_date,
        "start_date",
      );
      const endDate = safeCoerceDate(t.endDate || t.end_date, "end_date");
      const days = t.days ? Number(t.days) : 0;
      const totalHours = t.totalHours
        ? Number(t.totalHours)
        : t.total_hours
          ? Number(t.total_hours)
          : 0;

      const result = await client.query(
        `INSERT INTO esf7_personnel_ld_trainings (
          id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          trnId,
          resolvedPersonnelId,
          type,
          title,
          conductor,
          startDate,
          endDate,
          days,
          totalHours,
        ],
      );
      inserted.push(formatTrainingRecord(result.rows[0]));
    }

    await client.query("COMMIT");
    res.json(inserted);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error syncing esf7_personnel_ld_trainings:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE a training row by ID
router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM esf7_personnel_ld_trainings WHERE id = $1", [
      req.params.id,
    ]);
    res.json({
      success: true,
      message: `Training record ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
