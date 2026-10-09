const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");

const VALID_SCHOOL_NODES = [
  "node_01_school",
  "node_02_roster",
  "node_05_requests",
  "node_06_classes",
  "node_10_overload",
  "node_11_validation",
];

const VALID_PERSONNEL_NODES = [
  "node_03_room_qr",
  "node_04_profile",
  "node_07_designation",
  "node_08_workload",
  "node_09_allowances",
];

/**
 * Helper: Recalculate and update personnel_summary in esf7_school_node_status
 */
async function updateSchoolPersonnelRollup(schoolId, schoolYear) {
  try {
    const statsRes = await db.query(
      `
      SELECT 
        COUNT(*)::int AS total_personnel,
        COUNT(CASE WHEN (node_04_profile->>'status') = 'COMPLETED' THEN 1 END)::int AS profiling_completed,
        COUNT(CASE WHEN (node_08_workload->>'status') = 'COMPLETED' THEN 1 END)::int AS workload_completed,
        COUNT(CASE WHEN is_complete = true THEN 1 END)::int AS total_fully_completed
      FROM esf7_personnel_node_status
      WHERE school_id = $1 AND school_year = $2
    `,
      [schoolId, schoolYear],
    );

    const stats = statsRes.rows[0] || {
      total_personnel: 0,
      profiling_completed: 0,
      workload_completed: 0,
      total_fully_completed: 0,
    };
    const allReady =
      stats.total_personnel > 0 &&
      stats.profiling_completed === stats.total_personnel &&
      stats.workload_completed === stats.total_personnel;

    const summaryJson = {
      total_personnel: stats.total_personnel,
      profiling_completed: stats.profiling_completed,
      workload_completed: stats.workload_completed,
      all_personnel_ready: allReady,
      updated_at: new Date().toISOString(),
    };

    await db.query(
      `
      UPDATE esf7_school_node_status
      SET personnel_summary = $3, updated_at = NOW()
      WHERE school_id = $1 AND school_year = $2
    `,
      [schoolId, schoolYear, JSON.stringify(summaryJson)],
    );

    return summaryJson;
  } catch (err) {
    console.error(
      "[NodeStatus] Error updating school personnel rollup:",
      err.message,
    );
    return null;
  }
}

// -----------------------------------------------------------------------------
// 1. GET /api/node-status/school - Fetch school node status & boolean progress
// -----------------------------------------------------------------------------
router.get("/school", async (req, res) => {
  try {
    const rawSchoolId =
      req.query.schoolId ||
      req.query.school_id ||
      getSchoolIdFromRequest(req) ||
      "199999";
    const schoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
    const schoolYear = req.query.schoolYear || "SY 26-27";

    // Query physical table and boolean view
    const statusRes = await db
      .query(
        "SELECT * FROM esf7_school_node_status WHERE school_id = $1 AND school_year = $2",
        [schoolId, schoolYear],
      )
      .catch(() => ({ rows: [] }));

    const viewRes = await db
      .query(
        "SELECT * FROM vw_esf7_school_node_progress WHERE school_id = $1 AND school_year = $2",
        [schoolId, schoolYear],
      )
      .catch(() => ({ rows: [] }));

    if (statusRes.rows.length === 0) {
      return res.json({
        exists: false,
        schoolId,
        schoolYear,
        overallStatus: "NOT_STARTED",
        overallPercentage: 0,
        nodes: {},
        booleans: {
          isNode01SchoolCompleted: false,
          isNode02RosterCompleted: false,
          isNode05RequestsCompleted: false,
          isNode06ClassesCompleted: false,
          isNode10OverloadCompleted: false,
          isNode11ValidationCompleted: false,
          isAllPersonnelCompleted: false,
          isAllNodesCompleted: false,
        },
        personnelSummary: {
          total_personnel: 0,
          profiling_completed: 0,
          workload_completed: 0,
          all_personnel_ready: false,
        },
      });
    }

    const row = statusRes.rows[0];
    const viewRow = viewRes.rows[0] || {};

    res.json({
      exists: true,
      schoolId: row.school_id,
      schoolName: viewRow.school_name || null,
      region: viewRow.region || null,
      division: viewRow.division || null,
      district: viewRow.district || null,
      schoolYear: row.school_year,
      overallStatus: row.overall_status,
      overallPercentage: row.overall_percentage,
      nodes: {
        node_01_school: row.node_01_school,
        node_02_roster: row.node_02_roster,
        node_05_requests: row.node_05_requests,
        node_06_classes: row.node_06_classes,
        node_10_overload: row.node_10_overload,
        node_11_validation: row.node_11_validation,
      },
      booleans: {
        isNode01SchoolCompleted: viewRow.is_node_01_school_completed || false,
        isNode02RosterCompleted: viewRow.is_node_02_roster_completed || false,
        isNode05RequestsCompleted:
          viewRow.is_node_05_requests_completed || false,
        isNode06ClassesCompleted: viewRow.is_node_06_classes_completed || false,
        isNode10OverloadCompleted:
          viewRow.is_node_10_overload_completed || false,
        isNode11ValidationCompleted:
          viewRow.is_node_11_validation_completed || false,
        isAllPersonnelCompleted: viewRow.is_all_personnel_completed || false,
        isAllNodesCompleted: viewRow.is_all_nodes_completed || false,
      },
      personnelSummary: row.personnel_summary,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error("[NodeStatus] Error in GET /school:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. PUT /api/node-status/school/:nodeId - Upsert school node snapshot
// -----------------------------------------------------------------------------
router.put("/school/:nodeId", async (req, res) => {
  try {
    const { nodeId } = req.params;
    if (!VALID_SCHOOL_NODES.includes(nodeId)) {
      return res.status(400).json({
        error: `Invalid school nodeId. Must be one of: ${VALID_SCHOOL_NODES.join(", ")}`,
      });
    }

    const {
      schoolId: bodySchoolId,
      schoolYear = "SY 26-27",
      payload = {},
      overallStatus,
      overallPercentage,
    } = req.body;
    const rawSchoolId =
      bodySchoolId ||
      req.query.schoolId ||
      getSchoolIdFromRequest(req) ||
      "199999";
    const schoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();

    // Ensure status is marked inside JSON if not present
    const nodeData = {
      status: payload.status || "COMPLETED",
      completed_at: payload.completed_at || new Date().toISOString(),
      ...payload,
    };

    const query = `
      INSERT INTO esf7_school_node_status (
        school_id, school_year, ${nodeId}, overall_status, overall_percentage, updated_at
      )
      VALUES (
        $1, $2, $3, COALESCE($4, 'IN_PROGRESS'), COALESCE($5, 0), NOW()
      )
      ON CONFLICT (school_id, school_year)
      DO UPDATE SET
        ${nodeId} = EXCLUDED.${nodeId},
        overall_status = COALESCE($4, esf7_school_node_status.overall_status),
        overall_percentage = COALESCE($5, esf7_school_node_status.overall_percentage),
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      schoolId,
      schoolYear,
      JSON.stringify(nodeData),
      overallStatus || null,
      overallPercentage !== undefined ? overallPercentage : null,
    ]);

    res.json({
      success: true,
      nodeId,
      schoolId,
      schoolYear,
      data: result.rows[0],
    });
  } catch (err) {
    console.error(`[NodeStatus] Error updating school node:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/node-status/personnel - Fetch all personnel node statuses for a school
// -----------------------------------------------------------------------------
router.get("/personnel", async (req, res) => {
  try {
    const rawSchoolId =
      req.query.schoolId ||
      req.query.school_id ||
      getSchoolIdFromRequest(req) ||
      "199999";
    const schoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();
    const schoolYear = req.query.schoolYear || "SY 26-27";

    const result = await db.query(
      `
      SELECT 
        p.*,
        v.is_room_qr_completed,
        v.is_profile_completed,
        v.is_designation_completed,
        v.is_workload_completed,
        v.is_allowances_completed,
        v.is_teacher_fully_completed
      FROM esf7_personnel_node_status p
      LEFT JOIN vw_esf7_personnel_node_progress v
        ON p.school_id = v.school_id 
        AND p.school_year = v.school_year 
        AND p.personnel_id = v.personnel_id
      WHERE p.school_id = $1 AND p.school_year = $2
      ORDER BY p.personnel_name ASC
    `,
      [schoolId, schoolYear],
    );

    res.json({
      success: true,
      schoolId,
      schoolYear,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("[NodeStatus] Error in GET /personnel:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. PUT /api/node-status/personnel/:personnelId/:nodeId - Upsert teacher node snapshot
// -----------------------------------------------------------------------------
router.put("/personnel/:personnelId/:nodeId", async (req, res) => {
  try {
    const { personnelId, nodeId } = req.params;
    if (!VALID_PERSONNEL_NODES.includes(nodeId)) {
      return res.status(400).json({
        error: `Invalid personnel nodeId. Must be one of: ${VALID_PERSONNEL_NODES.join(", ")}`,
      });
    }

    const {
      schoolId: bodySchoolId,
      schoolYear = "SY 26-27",
      personnelName = "TEACHER",
      positionTitle = "",
      category = "TEACHING",
      isSchoolHead = false,
      isComplete = false,
      payload = {},
    } = req.body;

    const rawSchoolId =
      bodySchoolId ||
      req.query.schoolId ||
      getSchoolIdFromRequest(req) ||
      "199999";
    const schoolId = String(rawSchoolId).replace(/^SCH-/i, "").trim();

    const nodeData = {
      status: payload.status || "COMPLETED",
      completed_at: payload.completed_at || new Date().toISOString(),
      ...payload,
    };

    const query = `
      INSERT INTO esf7_personnel_node_status (
        school_id, school_year, personnel_id, personnel_name, position_title, category, is_school_head, is_complete, ${nodeId}, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
      ON CONFLICT (school_id, school_year, personnel_id)
      DO UPDATE SET
        personnel_name = COALESCE(NULLIF(EXCLUDED.personnel_name, 'TEACHER'), esf7_personnel_node_status.personnel_name),
        position_title = COALESCE(NULLIF(EXCLUDED.position_title, ''), esf7_personnel_node_status.position_title),
        category = COALESCE(NULLIF(EXCLUDED.category, ''), esf7_personnel_node_status.category),
        is_school_head = EXCLUDED.is_school_head,
        is_complete = EXCLUDED.is_complete,
        ${nodeId} = EXCLUDED.${nodeId},
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      schoolId,
      schoolYear,
      personnelId,
      personnelName,
      positionTitle,
      category,
      Boolean(isSchoolHead),
      Boolean(isComplete),
      JSON.stringify(nodeData),
    ]);

    // Recalculate school summary rollup in background
    updateSchoolPersonnelRollup(schoolId, schoolYear);

    res.json({
      success: true,
      personnelId,
      nodeId,
      schoolId,
      schoolYear,
      data: result.rows[0],
    });
  } catch (err) {
    console.error(`[NodeStatus] Error updating personnel node:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
