const express = require("express");
const router = express.Router();
const db = require("../../db");
const { resolveRequestSchool } = require("../../utils/requestSchool");
const {
  enqueueSubmission,
  InvalidSubmissionIdError,
} = require("../../services/submissionQueue");
// queueWorker removed

// Ensure table exists on first hit if not already initialized
let tableEnsured = false;
async function ensureValidationTable() {
  if (tableEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_validation (
        id SERIAL PRIMARY KEY,
        school_id VARCHAR(50) NOT NULL UNIQUE,
        school_year VARCHAR(50) DEFAULT 'SY 26-27',
        po3_validation TEXT DEFAULT 'PENDING',
        hrmo_validation TEXT DEFAULT 'PENDING',
        special_program_validation TEXT DEFAULT 'PENDING',
        sections_density_validation TEXT DEFAULT 'PENDING',
        staffing_composition_validation TEXT DEFAULT 'PENDING',
        validation_details JSONB DEFAULT '{}'::jsonb,
        validated_by JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      ALTER TABLE esf7_validation ADD COLUMN IF NOT EXISTS school_year VARCHAR(50) DEFAULT 'SY 26-27';
      CREATE INDEX IF NOT EXISTS idx_esf7_validation_school_id ON esf7_validation(school_id);
    `);
    tableEnsured = true;
  } catch (err) {
    console.error(
      "[esf7_validation] Table init error (non-fatal):",
      err.message,
    );
  }
}

// GET /api/validation/status/:schoolId
router.get("/status/:schoolId", async (req, res) => {
  try {
    await ensureValidationTable();
    const rawSchoolId = req.params.schoolId;
    if (!rawSchoolId) {
      return res.status(400).json({ error: "Missing schoolId parameter" });
    }

    const cleanSchoolId = String(rawSchoolId).replace(/^SCH-/, "").trim();
    const result = await db.query(
      `SELECT * FROM esf7_validation WHERE school_id = $1 OR school_id = $2 LIMIT 1`,
      [cleanSchoolId, `SCH-${cleanSchoolId}`],
    );

    if (result.rows.length === 0) {
      return res.json({
        exists: false,
        schoolId: cleanSchoolId,
        po3Validation: "PENDING",
        hrmoValidation: "PENDING",
        specialProgramValidation: "PENDING",
        sectionsDensityValidation: "PENDING",
        staffingCompositionValidation: "PENDING",
        validationDetails: {},
        validatedBy: {},
        updatedAt: null,
      });
    }

    const row = result.rows[0];
    res.json({
      exists: true,
      schoolId: row.school_id,
      schoolYear: row.school_year || "SY 26-27",
      po3Validation: row.po3_validation || "PENDING",
      hrmoValidation: row.hrmo_validation || "PENDING",
      specialProgramValidation:
        row.special_program_validation || row.po3_validation || "PENDING",
      sectionsDensityValidation:
        row.sections_density_validation || row.po3_validation || "PENDING",
      staffingCompositionValidation:
        row.staffing_composition_validation || row.hrmo_validation || "PENDING",
      validationDetails: row.validation_details || {},
      validatedBy: row.validated_by || {},
      updatedAt: row.updated_at || row.created_at,
    });
  } catch (err) {
    console.error("Error fetching esf7_validation status:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/validation (fallback with query string ?schoolId=xxx)
router.get("/", async (req, res) => {
  const schoolId = req.query.schoolId || req.query.school_id;
  if (!schoolId) {
    return res.status(400).json({ error: "schoolId is required" });
  }
  req.params.schoolId = schoolId;
  return router.handle(req, res);
});

// POST /api/validation/resubmit
router.post("/resubmit", async (req, res) => {
  try {
    await ensureValidationTable();
    const {
      schoolYear = "SY 26-27",
      payload,
      signature,
      certifiedBy,
      submissionId,
    } = req.body;

    // Same rule as POST /api/submissions: the school is the logged-in user's own; a different one in the body is a 403.
    const resolved = resolveRequestSchool(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const cleanSchoolId = resolved.schoolId;

    // 1. Enqueue into esf7_submission_queue
    // ARCHITECTURAL NOTE: esf7_submission_queue.payload is INTENTIONALLY an asynchronous job envelope (Outbox Pattern).
    // It stages certified/resubmitted school payloads for transactional normalization into 20+ tables by server/queue_worker.js.
    // Row is committed first, then the Redis pointer is published; same idempotency rules as POST /api/submissions.
    const queued = await enqueueSubmission(db, {
      schoolId: cleanSchoolId,
      schoolYear,
      payloadJson:
        typeof payload === "string" ? payload : JSON.stringify(payload || {}),
      signature: signature || null,
      certifiedBy: certifiedBy || "School Head",
      submissionId,
    });
    const jobId = queued.jobId;

    // Processing happens in the queue worker process (see QUEUE_CONSUMER_ENABLED in server/queue_worker.js).

    // Atomic Upsert to esf7_validation: mark status as RESUBMITTED
    await db.query(
      `INSERT INTO esf7_validation (
        school_id, school_year,
        po3_validation, hrmo_validation,
        special_program_validation, sections_density_validation, staffing_composition_validation,
        updated_at
      ) VALUES ($1, $2, 'RESUBMITTED', 'RESUBMITTED', 'RESUBMITTED', 'RESUBMITTED', 'RESUBMITTED', NOW())
      ON CONFLICT (school_id) DO UPDATE SET
        school_year = EXCLUDED.school_year,
        po3_validation = 'RESUBMITTED',
        hrmo_validation = 'RESUBMITTED',
        special_program_validation = 'RESUBMITTED',
        sections_density_validation = 'RESUBMITTED',
        staffing_composition_validation = 'RESUBMITTED',
        updated_at = NOW()`,
      [cleanSchoolId, schoolYear],
    );

    res.json({
      success: true,
      jobId,
      status: "RESUBMITTED",
      message:
        "eSF7 resubmission enqueued successfully and status updated to RESUBMITTED.",
    });
  } catch (err) {
    if (err instanceof InvalidSubmissionIdError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Error during validation resubmit:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
