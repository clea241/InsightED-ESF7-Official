const express = require("express");
const router = express.Router();
const db = require("../../db");

const VALID_REASONS = [
  "Teacher Shortage",
  "Relieving Duty",
  "Remediation or Enhancement Class",
  "Class Advising Duty",
  "ARAL Tutor",
];

/**
 * GET /api/overload-reasons
 */
router.get("/", async (req, res) => {
  try {
    const schoolYear =
      req.query.schoolYear || req.query.school_year || "2026-2027";
    const term = req.query.term || "Term 1";

    const result = await db.query(
      `SELECT *
       FROM overload_pay_and_reason
       WHERE (school_year = $1 OR school_year = 'SY 26-27') AND (term = $2 OR term = 'Term 1')`,
      [schoolYear, term],
    );

    const reasonsMap = {};
    const records = result.rows.map((row) => {
      const reasons =
        Array.isArray(row.reasons) && row.reasons.length > 0
          ? row.reasons
          : ["Teacher Shortage"];
      reasonsMap[row.personnel_id] = reasons;
      return {
        id: row.id,
        personnelId: row.personnel_id,
        personnel_id: row.personnel_id,
        schoolId: row.school_id,
        school_id: row.school_id,
        schoolYear: row.school_year,
        school_year: row.school_year,
        term: row.term,
        month: row.month,
        overloadHours: parseFloat(row.overload_hours || 0),
        overload_hours: parseFloat(row.overload_hours || 0),
        overloadPay: parseFloat(row.overload_pay || 0),
        overload_pay: parseFloat(row.overload_pay || 0),
        netTermPay: parseFloat(row.net_term_pay || 0),
        net_term_pay: parseFloat(row.net_term_pay || 0),
        reasons,
        rawPayload: row.raw_payload || {},
      };
    });

    res.json({
      success: true,
      schoolYear,
      term,
      data: reasonsMap,
      raw: records,
    });
  } catch (error) {
    console.error("[Overload Reasons GET Error]:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch overload reasons." });
  }
});

/**
 * POST /api/overload-reasons/save
 */
router.post("/save", async (req, res) => {
  try {
    const {
      personnelId,
      personnel_id,
      schoolYear = "2026-2027",
      school_year,
      term = "Term 1",
      month = "All",
      overloadHours = 0,
      overload_hours,
      overloadPay = 0,
      overload_pay,
      netTermPay = 0,
      net_term_pay,
      reasons,
      rawPayload,
      raw_payload,
    } = req.body;

    const targetPersonnelId = personnelId || personnel_id;
    if (!targetPersonnelId) {
      return res
        .status(400)
        .json({ success: false, error: "personnelId is required." });
    }

    if (!Array.isArray(reasons) || reasons.length < 1) {
      return res.status(400).json({
        success: false,
        error: "At least 1 overload reason is required.",
      });
    }

    const cleanedReasons = reasons.filter((r) => VALID_REASONS.includes(r));
    if (cleanedReasons.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid reasons provided. Valid options: ${VALID_REASONS.join(", ")}`,
      });
    }

    const personRes = await db.query(
      `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId],
    );
    const targetSchoolId =
      personRes.rows.length > 0 ? personRes.rows[0].school_id : "108348";
    const targetSy = schoolYear || school_year || "2026-2027";

    const countRes = await db.query(
      `SELECT COUNT(*) FROM overload_pay_and_reason`,
    );
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const oprId =
      req.body.id || `OPR-${targetSchoolId.replace("SCH-", "")}-${seq}`;

    const numOverloadHours =
      parseFloat(
        overloadHours !== undefined
          ? overloadHours
          : overload_hours !== undefined
            ? overload_hours
            : 0,
      ) || 0;
    const numOverloadPay =
      parseFloat(
        overloadPay !== undefined
          ? overloadPay
          : overload_pay !== undefined
            ? overload_pay
            : 0,
      ) || 0;
    const numNetTermPay =
      parseFloat(
        netTermPay !== undefined
          ? netTermPay
          : net_term_pay !== undefined
            ? net_term_pay
            : numOverloadPay,
      ) || 0;

    const sql = `
      INSERT INTO overload_pay_and_reason (
        id, personnel_id, school_id, school_year, term, month,
        overload_hours, overload_pay, net_term_pay,
        reasons, raw_payload, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, NOW())
      ON CONFLICT (personnel_id, school_year, term, month)
      DO UPDATE SET
        overload_hours = CASE WHEN EXCLUDED.overload_hours > 0 THEN EXCLUDED.overload_hours ELSE overload_pay_and_reason.overload_hours END,
        overload_pay = CASE WHEN EXCLUDED.overload_pay > 0 THEN EXCLUDED.overload_pay ELSE overload_pay_and_reason.overload_pay END,
        net_term_pay = CASE WHEN EXCLUDED.net_term_pay > 0 THEN EXCLUDED.net_term_pay ELSE overload_pay_and_reason.net_term_pay END,
        reasons = EXCLUDED.reasons,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(sql, [
      oprId,
      targetPersonnelId,
      targetSchoolId,
      targetSy,
      term,
      month,
      numOverloadHours,
      numOverloadPay,
      numNetTermPay,
      JSON.stringify(cleanedReasons),
      JSON.stringify(rawPayload || raw_payload || req.body),
    ]);

    res.json({
      success: true,
      message: `Saved overload reasons and pay for ${targetPersonnelId}`,
      record: result.rows[0],
    });
  } catch (error) {
    console.error("[Overload Reasons SAVE Error]:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Failed to save overload reasons." });
  }
});

/**
 * POST /api/overload-reasons/batch
 */
router.post("/batch", async (req, res) => {
  try {
    const { items = [], schoolYear = "2026-2027", term = "Term 1" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Items array is required." });
    }

    const savedRecords = [];
    for (const item of items) {
      const targetPersonnelId =
        item.personnelId ||
        item.personnel_id ||
        item.teacherId ||
        item.teacher_id;
      if (!targetPersonnelId) continue;

      const reasons =
        Array.isArray(item.reasons) && item.reasons.length > 0
          ? item.reasons.filter((r) => VALID_REASONS.includes(r))
          : ["Teacher Shortage"];

      const personRes = await db.query(
        `SELECT school_id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
        [targetPersonnelId],
      );
      const targetSchoolId =
        personRes.rows.length > 0
          ? personRes.rows[0].school_id
          : item.schoolId || item.school_id || "108348";
      const targetSy = item.schoolYear || item.school_year || schoolYear;
      const targetTerm = item.term || term;
      const targetMonth = item.month || "All";

      const countRes = await db.query(
        `SELECT COUNT(*) FROM overload_pay_and_reason`,
      );
      const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
      const oprId =
        item.id || `OPR-${targetSchoolId.replace("SCH-", "")}-${seq}`;

      const numOverloadHours =
        parseFloat(
          item.overloadHours || item.overload_hours || item.hours || 0,
        ) || 0;
      const numOverloadPay =
        parseFloat(item.overloadPay || item.overload_pay || item.pay || 0) || 0;
      const numNetTermPay =
        parseFloat(item.netTermPay || item.net_term_pay || numOverloadPay) || 0;

      const sql = `
        INSERT INTO overload_pay_and_reason (
          id, personnel_id, school_id, school_year, term, month,
          overload_hours, overload_pay, net_term_pay,
          reasons, raw_payload, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, NOW())
        ON CONFLICT (personnel_id, school_year, term, month)
        DO UPDATE SET
          overload_hours = CASE WHEN EXCLUDED.overload_hours > 0 THEN EXCLUDED.overload_hours ELSE overload_pay_and_reason.overload_hours END,
          overload_pay = CASE WHEN EXCLUDED.overload_pay > 0 THEN EXCLUDED.overload_pay ELSE overload_pay_and_reason.overload_pay END,
          net_term_pay = CASE WHEN EXCLUDED.net_term_pay > 0 THEN EXCLUDED.net_term_pay ELSE overload_pay_and_reason.net_term_pay END,
          reasons = EXCLUDED.reasons,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
        RETURNING *;
      `;

      const result = await db.query(sql, [
        oprId,
        targetPersonnelId,
        targetSchoolId,
        targetSy,
        targetTerm,
        targetMonth,
        numOverloadHours,
        numOverloadPay,
        numNetTermPay,
        JSON.stringify(reasons.length > 0 ? reasons : ["Teacher Shortage"]),
        JSON.stringify(item),
      ]);

      savedRecords.push(result.rows[0]);
    }

    res.json({
      success: true,
      message: `Batch saved ${savedRecords.length} overload records`,
      records: savedRecords,
    });
  } catch (error) {
    console.error("[Overload Reasons BATCH Error]:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to batch save overload records.",
    });
  }
});

/**
 * POST /api/overload-reasons/sync
 * Syncs overload calculations from timetable workloads to overload_pay_and_reason
 */
router.post("/sync", async (req, res) => {
  try {
    const { schoolId, schoolYear } = req.body || {};
    const {
      syncAllOverloadPayAndReasons,
    } = require("../../services/overloadSync");
    const result = await syncAllOverloadPayAndReasons(schoolId, schoolYear);
    res.json(result);
  } catch (err) {
    console.error("[Overload Sync Endpoint Error]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
