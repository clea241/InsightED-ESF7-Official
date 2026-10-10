const express = require("express");
const router = express.Router();
const db = require("../../db");
const { loadScheduleRules } = require("../../utils/sharedRules");
const cacheService = require("../../services/cacheService");
const { passcodeLimiter } = require("../../middleware/rateLimiter");
const { validateRequest, z } = require("../../middleware/validate");

// Ensure ephemeral queue table & cross-device lockout table exist
let isTableInitialized = false;
const initQueueTable = async () => {
  try {
    await db.query(`
      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_personnel_submission (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        personnel_id VARCHAR(64) NOT NULL,
        personnel_name VARCHAR(255),
        room_name VARCHAR(255),
        status VARCHAR(32) DEFAULT 'PENDING',
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_timestamp BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_pers_sub_school_status ON esf7_personnel_submission(school_id, status);
      CREATE INDEX IF NOT EXISTS idx_pers_sub_school_personnel ON esf7_personnel_submission(school_id, personnel_id);

      CREATE TABLE IF NOT EXISTS esf7_personnel_submission_archive (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        personnel_id VARCHAR(64) NOT NULL,
        personnel_name VARCHAR(255),
        room_name VARCHAR(255),
        status VARCHAR(32) DEFAULT 'APPROVED',
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_timestamp BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_pers_archive_school ON esf7_personnel_submission_archive(school_id);
      CREATE INDEX IF NOT EXISTS idx_pers_archive_personnel ON esf7_personnel_submission_archive(school_id, personnel_id);

      CREATE TABLE IF NOT EXISTS esf7_profiling_snapshots (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        snapshot_name VARCHAR(255),
        personnel_count INT DEFAULT 0,
        verified_count INT DEFAULT 0,
        snapshot_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pers_snapshots_school ON esf7_profiling_snapshots(school_id);

      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_passcode_lockout (
        lockout_key VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        failed_attempts INT DEFAULT 0,
        lockout_until BIGINT DEFAULT 0,
        last_attempt_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_room_roster_cache (
        school_id VARCHAR(64) PRIMARY KEY,
        roster_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_room_roster_cache_school ON esf7_room_roster_cache(school_id);
      CREATE OR REPLACE VIEW esf7_room_cache AS SELECT * FROM esf7_room_roster_cache;
    `);
    isTableInitialized = true;
    console.log(
      "✅ [Room Profiling Queue, Archive, Snapshots & Roster Cache] Tables initialized successfully.",
    );
  } catch (err) {
    console.warn("[Room Profiling Table Init Warning]:", err.message);
  }
};
initQueueTable();

// Periodic self-cleanup: purge old PENDING queue and APPROVED rows (APPROVED records are preserved in archive)
setInterval(
  async () => {
    try {
      await db.query(
        `DELETE FROM esf7_personnel_submission WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '7 days'`,
      );
      await db.query(
        `DELETE FROM esf7_personnel_submission WHERE status = 'APPROVED' AND created_at < NOW() - INTERVAL '24 hours'`,
      );
      await db.query(
        `DELETE FROM esf7_passcode_lockout WHERE lockout_until > 0 AND lockout_until < $1`,
        [Date.now() - 3600 * 1000],
      );
    } catch (e) {}
  },
  15 * 60 * 1000,
);

// GET /api/room-profiling/check-lockout — Check if a passcode / personnel is locked out across all devices
router.get("/check-lockout", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, passcode, personnelId, personnel_id } =
      req.query;
    const activeSchoolId = String(schoolId || school_id || "502624")
      .replace("SCH-", "")
      .trim();
    const cleanCode = String(passcode || personnelId || personnel_id || "")
      .replace(/[\s-]/g, "")
      .trim()
      .toUpperCase();

    if (!cleanCode) {
      return res.json({
        isLockedOut: false,
        lockoutRemainingSecs: 0,
        failedAttempts: 0,
      });
    }

    const lockoutKey = `${activeSchoolId}:${cleanCode}`;
    const cacheKey = `room_profiling:lockout:${lockoutKey}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await db.query(
      `
      SELECT failed_attempts, lockout_until 
      FROM esf7_passcode_lockout 
      WHERE lockout_key = $1
    `,
      [lockoutKey],
    );

    if (rows && rows.length > 0) {
      const now = Date.now();
      const row = rows[0];
      const lockoutUntil = Number(row.lockout_until) || 0;
      if (lockoutUntil > now) {
        const remainingSecs = Math.ceil((lockoutUntil - now) / 1000);
        const resultObj = {
          isLockedOut: true,
          lockoutRemainingSecs: remainingSecs,
          failedAttempts: row.failed_attempts,
        };
        await cacheService.set(cacheKey, resultObj, 3);
        return res.json(resultObj);
      }
    }

    const notLocked = {
      isLockedOut: false,
      lockoutRemainingSecs: 0,
      failedAttempts: (rows && rows[0]?.failed_attempts) || 0,
    };
    await cacheService.set(cacheKey, notLocked, 3);
    res.json(notLocked);
  } catch (err) {
    console.error("[Room Profiling Check Lockout Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/record-attempt — Record successful or failed attempt across all devices
router.post("/record-attempt", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const {
      schoolId,
      school_id,
      passcode,
      personnelId,
      personnel_id,
      isSuccess,
    } = req.body;
    const activeSchoolId = String(schoolId || school_id || "502624")
      .replace("SCH-", "")
      .trim();
    const cleanCode = String(passcode || personnelId || personnel_id || "")
      .replace(/[\s-]/g, "")
      .trim()
      .toUpperCase();

    if (!cleanCode) {
      return res.json({
        isLockedOut: false,
        lockoutRemainingSecs: 0,
        failedAttempts: 0,
      });
    }

    const lockoutKey = `${activeSchoolId}:${cleanCode}`;
    const now = Date.now();

    // If verification succeeded: Reset lockout & attempts
    if (isSuccess) {
      await db.query(
        `
        DELETE FROM esf7_passcode_lockout 
        WHERE lockout_key = $1 OR (school_id = $2 AND lockout_key LIKE $3)
      `,
        [lockoutKey, activeSchoolId, `%${cleanCode}%`],
      );

      return res.json({
        isLockedOut: false,
        lockoutRemainingSecs: 0,
        failedAttempts: 0,
      });
    }

    // Otherwise, handle failed attempt
    const { rows } = await db.query(
      `
      SELECT failed_attempts, lockout_until 
      FROM esf7_passcode_lockout 
      WHERE lockout_key = $1
    `,
      [lockoutKey],
    );

    let currentAttempts = 0;
    let existingLockout = 0;

    if (rows && rows.length > 0) {
      currentAttempts = Number(rows[0].failed_attempts) || 0;
      existingLockout = Number(rows[0].lockout_until) || 0;

      // If previous lockout already expired, reset counter
      if (existingLockout > 0 && existingLockout <= now) {
        currentAttempts = 0;
        existingLockout = 0;
      }
    }

    const nextAttempts = currentAttempts + 1;
    let nextLockoutUntil = 0;
    let isLockedOut = false;
    let remainingSecs = 0;

    if (nextAttempts >= 3) {
      nextLockoutUntil = now + 10 * 60 * 1000; // 10 minutes
      isLockedOut = true;
      remainingSecs = 600;
    }

    await db.query(
      `
      INSERT INTO esf7_passcode_lockout (lockout_key, school_id, failed_attempts, lockout_until, last_attempt_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (lockout_key) DO UPDATE
      SET failed_attempts = $3, lockout_until = $4, last_attempt_at = NOW()
    `,
      [lockoutKey, activeSchoolId, nextAttempts, nextLockoutUntil],
    );

    console.log(
      `[Room Profiling Security] School ${activeSchoolId} Passcode ${cleanCode} Failed Attempt #${nextAttempts} (Locked: ${isLockedOut})`,
    );

    res.json({
      isLockedOut,
      lockoutRemainingSecs: remainingSecs,
      failedAttempts: nextAttempts,
      remainingAttempts: Math.max(0, 3 - nextAttempts),
    });
  } catch (err) {
    console.error("[Room Profiling Record Attempt Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/submit — Teacher submits verified profile from phone
router.post("/submit", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const {
      schoolId,
      school_id,
      room,
      roomName,
      personnelId,
      personnel_id,
      personnelName,
      personnel_name,
      profileData,
    } = req.body;
    const activeSchoolId = String(schoolId || school_id || "199998")
      .replace("SCH-", "")
      .trim();
    const activePersonnelId = String(
      personnelId || personnel_id || profileData?.id || "",
    ).trim();

    if (!activePersonnelId) {
      return res.status(400).json({ error: "personnelId is required" });
    }

    const subId = `SUB-${activePersonnelId}-${Date.now()}`;
    const pName =
      personnelName ||
      personnel_name ||
      `${profileData?.firstName || ""} ${profileData?.lastName || ""}`.trim() ||
      "Teacher";
    const activeRoom = room || roomName || "Faculty Room 1";
    const now = Date.now();

    // Replace any prior pending submission for this teacher
    await db.query(
      `
      DELETE FROM esf7_personnel_submission 
      WHERE school_id = $1 AND personnel_id = $2
    `,
      [activeSchoolId, activePersonnelId],
    );

    await db.query(
      `
      INSERT INTO esf7_personnel_submission (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_timestamp)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)
    `,
      [
        subId,
        activeSchoolId,
        activePersonnelId,
        pName,
        activeRoom,
        JSON.stringify(profileData || req.body),
        now,
      ],
    );

    await cacheService.delPattern("room_profiling:*");
    console.log(
      `[Room Profiling Queue] Enqueued submission ${subId} for ${pName} (School ${activeSchoolId}, Room: ${activeRoom})`,
    );
    res.json({
      success: true,
      queueId: subId,
      message: "Profile queued for School Head review.",
    });
  } catch (err) {
    console.error("[Room Profiling Queue Submit Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/pending — School Head checks for incoming teacher submissions
router.get("/pending", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const schoolId = req.query.schoolId || req.query.school_id || "199998";
    const cleanSchoolId = String(schoolId).replace("SCH-", "").trim();

    const cacheKey = `room_profiling:pending:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await db.query(
      `
      SELECT id, school_id as "schoolId", personnel_id as "personnelId", personnel_name as "personnelName", 
             room_name as "roomName", payload_json as "profileData", created_at as "submittedAt", created_timestamp as "submittedTimestamp"
      FROM esf7_personnel_submission 
      WHERE school_id = $1 AND status = 'PENDING'
      ORDER BY created_timestamp DESC
    `,
      [cleanSchoolId],
    );

    const result = rows || [];
    await cacheService.set(cacheKey, result, 3);
    res.json(result);
  } catch (err) {
    console.error("[Room Profiling Queue Pending GET Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/ack — School Head merges/acknowledges submissions (updates status to APPROVED & archives)
router.post("/ack", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, submissionIds, personnelIds } = req.body;
    const cleanSchoolId = String(schoolId || school_id || "199998")
      .replace("SCH-", "")
      .trim();

    const subIds =
      Array.isArray(submissionIds) && submissionIds.length > 0
        ? submissionIds
        : ["NONE"];
    const pIds =
      Array.isArray(personnelIds) && personnelIds.length > 0
        ? personnelIds
        : ["NONE"];

    const result = await db.query(
      `
      UPDATE esf7_personnel_submission 
      SET status = 'APPROVED'
      WHERE school_id = $1 AND (id = ANY($2::varchar[]) OR personnel_id = ANY($3::varchar[]))
      RETURNING *
    `,
      [cleanSchoolId, subIds, pIds],
    );

    // Archive approved submissions permanently
    if (result.rows && result.rows.length > 0) {
      for (const row of result.rows) {
        await db.query(
          `
          INSERT INTO esf7_personnel_submission_archive 
            (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_at, created_timestamp)
          VALUES ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET 
            payload_json = EXCLUDED.payload_json,
            status = 'APPROVED',
            created_at = EXCLUDED.created_at
        `,
          [
            row.id,
            row.school_id,
            row.personnel_id,
            row.personnel_name,
            row.room_name,
            row.payload_json,
            row.created_at,
            row.created_timestamp,
          ],
        );
      }
    }

    await cacheService.delPattern("room_profiling:*");
    console.log(
      `[Room Profiling Queue] Marked & Archived ${result.rowCount || 0} approved submissions for School ${cleanSchoolId}`,
    );
    res.json({ success: true, count: result.rowCount || 0 });
  } catch (err) {
    console.error("[Room Profiling Queue ACK Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper for chunked multi-row upsert operations inside a transaction
async function executeMultiRowUpsert(
  client,
  tableName,
  columns,
  conflictTarget,
  updateClause,
  rows,
  chunkSize = 50,
) {
  if (!rows || rows.length === 0) return { rowCount: 0 };
  let totalCount = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valueClauses = [];
    const flatParams = [];
    let paramIdx = 1;

    for (const row of chunk) {
      const rowPlaceholders = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIdx++}`);
        flatParams.push(row[col]);
      }
      valueClauses.push(`(${rowPlaceholders.join(", ")})`);
    }

    const doClause = updateClause.startsWith("NOTHING")
      ? "DO NOTHING"
      : `DO ${updateClause}`;

    const sql = `
      INSERT INTO ${tableName} (${columns.join(", ")})
      VALUES ${valueClauses.join(", ")}
      ON CONFLICT ${conflictTarget} ${doClause}
      ${updateClause.startsWith("NOTHING") ? "" : "RETURNING *"}
    `;

    const res = await client.query(sql, flatParams);
    totalCount += res.rowCount || 0;
  }
  return { rowCount: totalCount };
}

// Helpers for date, age, step, category formatting
const parseDateVal = (val) => {
  if (!val || val === "N/A" || val === "-") return null;
  if (val instanceof Date)
    return isNaN(val.getTime()) ? null : val.toISOString().split("T")[0];
  const s = String(val).trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
  return null;
};

const calcAge = (bDate) => {
  if (!bDate) return null;
  const d = new Date(bDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return Math.max(0, age);
};

const calcStepIncrement = (fsd, lpd) => {
  const eff = lpd && lpd !== "N/A" && String(lpd).trim() !== "" ? lpd : fsd;
  if (!eff || eff === "N/A") return 1;
  const s = String(eff).substring(0, 10);
  const base = new Date(s + "T00:00:00");
  if (isNaN(base.getTime())) return 1;
  const now = new Date();
  let years = now.getFullYear() - base.getFullYear();
  const m = now.getMonth() - base.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < base.getDate())) years--;
  years = Math.max(0, years);
  return Math.min(8, Math.max(1, 1 + Math.floor(years / 3)));
};

const getPositionCategory = (pos) => {
  const p = String(pos || "").toUpperCase();
  if (
    p.includes("PRINCIPAL") ||
    p.includes("HEAD TEACHER") ||
    p.includes("SUPERVISOR") ||
    p.includes("COORDINATOR")
  ) {
    return "TEACHING-RELATED";
  }
  if (
    p.includes("ADMIN") ||
    p.includes("AIDE") ||
    p.includes("CLERK") ||
    p.includes("OFFICER") ||
    p.includes("SECURITY") ||
    p.includes("COOK") ||
    p.includes("DRIVER")
  ) {
    return "NON-TEACHING";
  }
  return "TEACHING";
};

// POST /api/room-profiling/accept — High-performance atomic batched accept & persistence
router.post("/accept", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, submissions, submission, selectedFields } =
      req.body;
    const cleanSchoolId = String(schoolId || school_id || "108348")
      .replace(/^SCH-/i, "")
      .trim();

    let rawList = [];
    if (Array.isArray(submissions) && submissions.length > 0) {
      rawList = submissions;
    } else if (submission) {
      rawList = [submission];
    } else if (req.body.profileData) {
      rawList = [req.body];
    }

    if (rawList.length === 0) {
      return res.json({
        success: true,
        count: 0,
        updatedPersonnel: [],
        approvedSubmissions: [],
        message: "No submissions provided.",
      });
    }

    // 1. Gather candidate IDs, PRNs, submission IDs
    const candidateIds = new Set();
    const candidatePrns = new Set();
    const candidateSubIds = new Set();
    const normalizedItems = [];

    for (const item of rawList) {
      const pData =
        item.profileData || item.rawProfile || (item.fn ? item : item);
      const pId = String(pData.id || item.personnelId || item.id || "").trim();
      const pPrn = String(pData.prn || item.prn || "").trim();
      const sId = String(
        item.submissionId || item.id || (pId ? `sub-${pId}` : ""),
      ).trim();

      if (pId) candidateIds.add(pId);
      if (pPrn) candidatePrns.add(pPrn);
      if (sId) candidateSubIds.add(sId);

      normalizedItems.push({
        submissionId: sId,
        personnelId: pId,
        prn: pPrn,
        profileData: pData,
        selectedFields: Array.isArray(item.selectedFields)
          ? item.selectedFields
          : Array.isArray(selectedFields)
            ? selectedFields
            : null,
      });
    }

    const idList = Array.from(candidateIds);
    const prnList = Array.from(candidatePrns);
    const subIdList = Array.from(candidateSubIds);

    // 2. Upfront Single Read Query for all candidate profiles, employment, and education
    const { rows: existingRows } = await db.query(
      `
      SELECT 
        p.id, p.school_id, p.school_year, p.prn, p.type, p.salutation,
        p.first_name, p.middle_name, p.last_name, p.name_extension,
        p.birthdate, p.sex_at_birth, p.civil_status, p.solo_parent,
        p.religion, p.ethnic_group, p.philsys_no, p.no_philsys,
        p.employee_no, p.tin, p.no_tin, p.deped_email, p.no_deped_email,
        p.allow_email_discrepancy, p.is_school_head, p.disabled_service_years, p.raw_payload as profile_raw,
        e.id as emp_id, e.position, e.position_category, e.nature_of_appointment,
        e.fund_source, e.hiring_arrangement, e.deployment_status,
        e.assigned_schools, e.grade_levels_taught, e.first_service_date,
        e.last_promotion_date, e.new_station_date, e.last_lateral_movement_date,
        e.step_increment, e.raw_payload as emp_raw,
        ed.id as educ_id, ed.highest_educational_attainment, ed.shs_track,
        ed.vocational_course, ed.vocational_level, ed.college_degree,
        ed.major, ed.minor, ed.post_graduate_degree,
        ed.post_graduate_discipline, ed.eligibility, ed.prc_specialization,
        ed.raw_payload as educ_raw
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      WHERE (p.school_id = $1 OR p.school_id = ('SCH-' || $1) OR REPLACE(p.school_id, 'SCH-', '') = $1)
        AND (p.id = ANY($2::varchar[]) OR (p.prn IS NOT NULL AND p.prn = ANY($3::varchar[])))
    `,
      [
        cleanSchoolId,
        idList.length > 0 ? idList : ["NONE"],
        prnList.length > 0 ? prnList : ["NONE"],
      ],
    );

    const existingById = new Map();
    const existingByPrn = new Map();
    const existingByName = new Map();

    for (const r of existingRows) {
      if (r.id) existingById.set(String(r.id).toUpperCase(), r);
      if (r.prn) existingByPrn.set(String(r.prn).toUpperCase(), r);
      const nameKey =
        `${String(r.first_name || "").trim()} ${String(r.last_name || "").trim()}`.toUpperCase();
      if (nameKey) existingByName.set(nameKey, r);
    }

    // 3. In-memory data preparation and non-destructive merging
    const parsePostGrad = require("../personnel").parsePostGraduateDiscipline;

    const profileUpsertRows = [];
    const employmentUpsertRows = [];
    const educUpsertRows = [];
    const trainingsInsertRows = [];
    const archiveUpsertRows = [];
    const updatedPersonnelList = [];
    const approvedSubmissionsList = [];
    const personnelIdsInBatch = [];

    const now = new Date();
    const timestampNow = now.getTime();

    for (const norm of normalizedItems) {
      const sub = norm.profileData || {};
      const targetIdKey = String(
        norm.personnelId || sub.id || "",
      ).toUpperCase();
      const targetPrnKey = String(norm.prn || sub.prn || "").toUpperCase();
      const fn = String(sub.firstName || sub.first_name || "")
        .trim()
        .toUpperCase();
      const ln = String(sub.lastName || sub.last_name || "")
        .trim()
        .toUpperCase();
      const nameKey = `${fn} ${ln}`.trim();

      const existing =
        existingById.get(targetIdKey) ||
        (targetPrnKey ? existingByPrn.get(targetPrnKey) : null) ||
        (nameKey ? existingByName.get(nameKey) : null);

      const rawCandidateId = String(norm.personnelId || sub.id || "").trim();
      const isClientUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCandidateId);
      const resolvedId =
        existing?.id ||
        (isClientUuid ? rawCandidateId : null) ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : require("crypto").randomUUID());
      const resolvedPrn =
        existing?.prn ||
        norm.prn ||
        sub.prn ||
        `PRN-${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      personnelIdsInBatch.push(resolvedId);

      const selKeys =
        norm.selectedFields instanceof Set
          ? norm.selectedFields
          : Array.isArray(norm.selectedFields)
            ? new Set(norm.selectedFields)
            : null;
      const shouldFieldUpdate = (k) =>
        !selKeys ||
        selKeys.has(k) ||
        selKeys.has(k.replace(/([A-Z])/g, "_$1").toLowerCase());

      const val = (camelKey, snakeKey, fallbackVal) => {
        if (
          shouldFieldUpdate(camelKey) ||
          (snakeKey && shouldFieldUpdate(snakeKey))
        ) {
          const v =
            sub[camelKey] !== undefined
              ? sub[camelKey]
              : snakeKey
                ? sub[snakeKey]
                : undefined;
          if (v !== undefined && v !== null && v !== "") return v;
        }
        if (existing) {
          const ev =
            existing[snakeKey || camelKey] !== undefined
              ? existing[snakeKey || camelKey]
              : existing[camelKey];
          if (ev !== undefined && ev !== null && ev !== "") return ev;
        }
        return fallbackVal;
      };

      // Personal / Profile fields
      const fName = String(
        val("firstName", "first_name", existing?.first_name || "Teacher"),
      )
        .trim()
        .toUpperCase();
      const lName = String(
        val("lastName", "last_name", existing?.last_name || ""),
      )
        .trim()
        .toUpperCase();
      const mName = String(
        val("middleName", "middle_name", existing?.middle_name || ""),
      )
        .trim()
        .toUpperCase();
      const ext = String(
        val(
          "nameExtension",
          "name_extension",
          val(
            "extensionName",
            "extension_name",
            existing?.name_extension || "",
          ),
        ),
      ).trim();
      const pType = String(
        val("type", "type", existing?.type || "teaching"),
      ).toLowerCase();
      const salutation = String(
        val(
          "salutation",
          "salutation",
          existing?.salutation || (sub.sexAtBirth === "MALE" ? "MR." : "MS."),
        ),
      ).toUpperCase();
      const sex = String(
        val(
          "sexAtBirth",
          "sex_at_birth",
          val("sex", "sex", existing?.sex_at_birth || "FEMALE"),
        ),
      ).toUpperCase();
      const civil = String(
        val("civilStatus", "civil_status", existing?.civil_status || "SINGLE"),
      ).toUpperCase();
      const solo =
        val("soloParent", "solo_parent", existing?.solo_parent) === true ||
        val("soloParent", "solo_parent", existing?.solo_parent) === "YES";
      const religion = String(
        val("religion", "religion", existing?.religion || "ROMAN CATHOLIC"),
      )
        .trim()
        .toUpperCase();
      const ethnic = String(
        val("ethnicGroup", "ethnic_group", existing?.ethnic_group || "TAGALOG"),
      )
        .trim()
        .toUpperCase();
      const rawBDate = val("birthdate", "birthdate", existing?.birthdate);
      const bDate = parseDateVal(rawBDate);
      const age = val("age", "age", bDate ? calcAge(bDate) : null);

      const noPhilsys =
        val("noPhilsys", "no_philsys", existing?.no_philsys) === true;
      const philsys = noPhilsys
        ? null
        : val("philsysNo", "philsys_no", existing?.philsys_no) || null;

      const noTin = val("noTin", "no_tin", existing?.no_tin) === true;
      const tin = noTin ? null : val("tin", "tin", existing?.tin) || null;

      const noEmp =
        val("noEmployeeNo", "no_employee_no", existing?.no_employee_no) ===
        true;
      const empNo = noEmp
        ? null
        : val("employeeNo", "employee_no", existing?.employee_no) || null;

      const noEmail =
        val("noDepedEmail", "no_deped_email", existing?.no_deped_email) ===
          true ||
        String(sub.depedEmail || sub.deped_email || "").toUpperCase() === "N/A";
      const depedEmail = noEmail
        ? "N/A"
        : val(
            "depedEmail",
            "deped_email",
            val("email", "email", existing?.deped_email || ""),
          ) || null;

      const isHead =
        val("isSchoolHead", "is_school_head", existing?.is_school_head) ===
        true;

      // Employment fields
      const pos = String(
        val(
          "position",
          "position",
          val(
            "plantilla_position",
            "plantilla_position",
            existing?.position || "TEACHER I",
          ),
        ),
      )
        .trim()
        .toUpperCase();
      const posCat = String(
        val(
          "positionCategory",
          "position_category",
          existing?.position_category || getPositionCategory(pos),
        ),
      ).toUpperCase();
      const fund = String(
        val("fundSource", "fund_source", existing?.fund_source || "NATIONAL"),
      ).toUpperCase();
      const appt = String(
        val(
          "natureOfAppointment",
          "nature_of_appointment",
          existing?.nature_of_appointment || "REGULAR PERMANENT",
        ),
      ).toUpperCase();
      const hire = String(
        val(
          "hiringArrangement",
          "hiring_arrangement",
          existing?.hiring_arrangement || "REGULAR",
        ),
      ).toUpperCase();
      const deploy = String(
        val(
          "deploymentStatus",
          "deployment_status",
          existing?.deployment_status || "OWN STATION",
        ),
      ).toUpperCase();

      const fsd = parseDateVal(
        val(
          "firstServiceDate",
          "first_service_date",
          existing?.first_service_date,
        ),
      );
      const lpd = parseDateVal(
        val(
          "lastPromotionDate",
          "last_promotion_date",
          existing?.last_promotion_date,
        ),
      );
      const nsd =
        parseDateVal(
          val("newStationDate", "new_station_date", existing?.new_station_date),
        ) || fsd;
      const lmd = parseDateVal(
        val(
          "lastLateralMovementDate",
          "last_lateral_movement_date",
          existing?.last_lateral_movement_date,
        ),
      );

      const stepInc = val(
        "stepIncrement",
        "step_increment",
        existing?.step_increment,
      )
        ? Number(
            val("stepIncrement", "step_increment", existing?.step_increment),
          )
        : calcStepIncrement(fsd, lpd);

      const rawGrades = val(
        "assignedGradeLevels",
        "grade_levels_taught",
        val(
          "gradeLevelsTaught",
          "grade_levels_taught",
          existing?.grade_levels_taught || [],
        ),
      );
      const gradeLevels = Array.isArray(rawGrades)
        ? rawGrades
        : typeof rawGrades === "string" && rawGrades
          ? rawGrades
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const rawSchools = val(
        "assignedSchools",
        "assigned_schools",
        existing?.assigned_schools || [],
      );
      const assignedSchools = Array.isArray(rawSchools)
        ? rawSchools
        : typeof rawSchools === "string" && rawSchools
          ? rawSchools
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      // Education fields
      const rawAttainment = val(
        "highestEducationalAttainment",
        "highest_educational_attainment",
        existing?.highest_educational_attainment ||
          "COLLEGE GRADUATE / BACCALAUREATE",
      );
      const attainment = String(rawAttainment).trim().toUpperCase();

      const rawDegrees =
        sub.degreeRows ||
        sub.collegeDegrees ||
        sub.college_degrees ||
        existing?.college_degrees ||
        [];
      const collegeDegrees =
        Array.isArray(rawDegrees) && rawDegrees.length > 0
          ? rawDegrees
          : [
              {
                collegeDegree: val(
                  "collegeDegree",
                  "college_degree",
                  existing?.college_degree || "",
                ),
                major: val("major", "major", existing?.major || ""),
                minor: val("minor", "minor", existing?.minor || ""),
              },
            ];
      const cd =
        collegeDegrees[0]?.collegeDegree ||
        val("collegeDegree", "college_degree", existing?.college_degree || "");
      const major =
        collegeDegrees[0]?.major ||
        val("major", "major", existing?.major || "");
      const minor =
        collegeDegrees[0]?.minor ||
        val("minor", "minor", existing?.minor || "");

      const postDeg = String(
        val(
          "postGraduateDegree",
          "post_graduate_degree",
          existing?.post_graduate_degree || "N/A",
        ),
      ).toUpperCase();

      // Discipline resolution — NON-DESTRUCTIVE
      const subMasters =
        sub.mastersDiscipline ||
        (Array.isArray(sub.mastersDisciplines)
          ? sub.mastersDisciplines.join(", ")
          : "");
      const subDoc =
        sub.doctorateDiscipline ||
        sub.phdDiscipline ||
        sub.phd_discipline ||
        (Array.isArray(sub.doctorateDisciplines)
          ? sub.doctorateDisciplines.join(", ")
          : "");
      const subMwu = Array.isArray(sub.mastersWithUnitsDisciplines)
        ? sub.mastersWithUnitsDisciplines
        : [];
      const subMg = Array.isArray(sub.mastersGraduatedDisciplines)
        ? sub.mastersGraduatedDisciplines
        : [];
      const subDwu = Array.isArray(sub.doctorateWithUnitsDisciplines)
        ? sub.doctorateWithUnitsDisciplines
        : [];
      const subDg = Array.isArray(sub.doctorateGraduatedDisciplines)
        ? sub.doctorateGraduatedDisciplines
        : [];
      const subPgDisc =
        sub.postGraduateDiscipline || sub.post_graduate_discipline;

      const hasSubmittedDisciplines = Boolean(
        (subMasters && subMasters.trim()) ||
        (subDoc && subDoc.trim()) ||
        subMwu.length > 0 ||
        subMg.length > 0 ||
        subDwu.length > 0 ||
        subDg.length > 0 ||
        (subPgDisc &&
          typeof subPgDisc === "object" &&
          Object.keys(subPgDisc).length > 0) ||
        (typeof subPgDisc === "string" &&
          subPgDisc.trim() &&
          subPgDisc.trim() !== "{}" &&
          subPgDisc.trim() !== '{"masters":[],"doctorate":[]}'),
      );

      let parsedPostDisc;
      if (
        hasSubmittedDisciplines &&
        (shouldFieldUpdate("mastersDiscipline") ||
          shouldFieldUpdate("doctorateDiscipline") ||
          shouldFieldUpdate("postGraduateDiscipline") ||
          shouldFieldUpdate("degreeRows") ||
          !selKeys)
      ) {
        // Merge submitted disciplines with existing disciplines
        parsedPostDisc = parsePostGrad(
          subPgDisc || existing?.post_graduate_discipline,
          { ...existing, ...sub },
          { ...existing, ...sub },
          attainment,
        );
      } else {
        // Non-destructive: Preserve existing disciplines
        parsedPostDisc = parsePostGrad(
          existing?.post_graduate_discipline,
          existing || {},
          existing || {},
          attainment,
        );
      }

      const postDiscJson = parsedPostDisc.jsonString || "{}";
      const mastersDiscipline = parsedPostDisc.mastersDiscipline || "";
      const doctorateDiscipline = parsedPostDisc.doctorateDiscipline || "";

      const rawElig = val(
        "eligibility",
        "eligibility",
        existing?.eligibility || [],
      );
      const eligibility = Array.isArray(rawElig)
        ? rawElig
        : typeof rawElig === "string" && rawElig
          ? rawElig
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      const prcSpec = String(
        val(
          "prcSpecialization",
          "prc_specialization",
          existing?.prc_specialization || "",
        ),
      ).toUpperCase();

      const shsTrack = String(
        val("shsTrack", "shs_track", existing?.shs_track || ""),
      ).toUpperCase();
      const vocCourse = String(
        val(
          "vocationalCourse",
          "vocational_course",
          existing?.vocational_course || "",
        ),
      ).toUpperCase();
      const vocLevel = String(
        val(
          "vocationalLevel",
          "vocational_level",
          existing?.vocational_level || "",
        ),
      ).toUpperCase();

      // Combined raw payload for backups
      const fullRawPayload = {
        ...(existing?.profile_raw || {}),
        ...(existing?.emp_raw || {}),
        ...(existing?.educ_raw || {}),
        ...sub,
        id: resolvedId,
        prn: resolvedPrn,
        personalVerified: true,
        isVerified: true,
        verified: true,
        lastVerifiedAt: now.toISOString(),
      };

      // 1. Row for esf7_personnel_profile
      profileUpsertRows.push({
        id: resolvedId,
        prn: resolvedPrn,
        school_id: cleanSchoolId,
        school_year: existing?.school_year || "2026-2027",
        type: pType,
        salutation: salutation,
        first_name: fName,
        middle_name: mName,
        last_name: lName,
        name_extension: ext,
        tin: tin,
        no_tin: noTin,
        sex_at_birth: sex,
        civil_status: civil,
        solo_parent: solo,
        religion: religion,
        ethnic_group: ethnic,
        birthdate: bDate,
        age: age,
        philsys_no: philsys,
        no_philsys: noPhilsys,
        employee_no: empNo,
        deped_email: depedEmail,
        no_deped_email: noEmail,
        allow_email_discrepancy:
          sub.allowEmailDiscrepancy === true ||
          existing?.allow_email_discrepancy === true,
        is_school_head: isHead,
        raw_payload: JSON.stringify(fullRawPayload),
        updated_at: now,
      });

      // 2. Row for esf7_personnel_employment
      employmentUpsertRows.push({
        id:
          existing?.emp_id ||
          `EMP-${cleanSchoolId}-${resolvedId.split("-").pop()}`,
        personnel_id: resolvedId,
        position_category: posCat,
        position: pos,
        step_increment: stepInc,
        fund_source: fund,
        nature_of_appointment: appt,
        hiring_arrangement: hire,
        deployment_status: deploy,
        assigned_schools: JSON.stringify(assignedSchools),
        grade_levels_taught: JSON.stringify(gradeLevels),
        first_service_date: fsd,
        last_promotion_date: lpd,
        new_station_date: nsd,
        last_lateral_movement_date: lmd,
        raw_payload: JSON.stringify(fullRawPayload),
        updated_at: now,
      });

      // 3. Row for esf7_perssonel_educ
      educUpsertRows.push({
        id:
          existing?.educ_id ||
          `EDU-${cleanSchoolId}-${resolvedId.split("-").pop()}`,
        personnel_id: resolvedId,
        highest_educational_attainment: attainment,
        shs_track: shsTrack || null,
        vocational_course: vocCourse || null,
        vocational_level: vocLevel || null,
        college_degree: cd || null,
        major: major || null,
        minor: minor || null,
        post_graduate_degree: postDeg,
        post_graduate_discipline: postDiscJson,
        eligibility: JSON.stringify(eligibility),
        prc_specialization: prcSpec || null,
        raw_payload: JSON.stringify(fullRawPayload),
        updated_at: now,
      });

      // 4. Rows for trainings
      const allTrainings = [
        ...(Array.isArray(sub.neapTrainingRows)
          ? sub.neapTrainingRows.map((r) => ({ ...r, type: "NEAP" }))
          : []),
        ...(Array.isArray(sub.certificationRows)
          ? sub.certificationRows.map((r) => ({ ...r, type: "TESDA" }))
          : []),
        ...(Array.isArray(sub.otherTrainingRows)
          ? sub.otherTrainingRows.map((r) => ({ ...r, type: "OTHER" }))
          : []),
      ];

      for (let tIdx = 0; tIdx < allTrainings.length; tIdx++) {
        const tr = allTrainings[tIdx];
        trainingsInsertRows.push({
          id: `TRN-${resolvedId}-${tIdx + 1}-${timestampNow}`,
          personnel_id: resolvedId,
          training_type: tr.type || tr.training_type || "NEAP",
          title: tr.title || tr.programTitle || "Training Program",
          total_hours: Number(tr.totalHours || tr.hours) || 0,
          raw_payload: JSON.stringify(tr),
          created_at: now,
        });
      }

      // 5. Row for archive
      const subIdForArchive =
        norm.submissionId || `SUB-${resolvedId}-${timestampNow}`;
      archiveUpsertRows.push({
        id: subIdForArchive,
        school_id: cleanSchoolId,
        personnel_id: resolvedId,
        personnel_name: `${lName}, ${fName}`.trim(),
        room_name: sub.roomName || sub.room || "Faculty Room",
        status: "APPROVED",
        payload_json: JSON.stringify(fullRawPayload),
        created_at: now,
        created_timestamp: timestampNow,
      });

      // Response payload record
      const formattedPerson = {
        id: resolvedId,
        prn: resolvedPrn,
        schoolId: cleanSchoolId,
        school_id: cleanSchoolId,
        schoolYear: existing?.school_year || "2026-2027",
        school_year: existing?.school_year || "2026-2027",
        firstName: fName,
        first_name: fName,
        lastName: lName,
        last_name: lName,
        middleName: mName,
        middle_name: mName,
        nameExtension: ext,
        name_extension: ext,
        extensionName: ext,
        sexAtBirth: sex,
        sex_at_birth: sex,
        civilStatus: civil,
        civil_status: civil,
        soloParent: solo ? "YES" : "NO",
        solo_parent: solo ? "YES" : "NO",
        religion: religion,
        ethnicGroup: ethnic,
        ethnic_group: ethnic,
        birthdate: bDate,
        age: age,
        philsysNo: philsys,
        philsys_no: philsys,
        noPhilsys: noPhilsys,
        no_philsys: noPhilsys,
        tin: tin,
        noTin: noTin,
        no_tin: noTin,
        employeeNo: empNo,
        employee_no: empNo,
        noEmployeeNo: noEmp,
        no_employee_no: noEmp,
        depedEmail: depedEmail,
        deped_email: depedEmail,
        email: depedEmail,
        noDepedEmail: noEmail,
        no_deped_email: noEmail,
        isSchoolHead: isHead,
        is_school_head: isHead,
        position: pos,
        plantilla_position: pos,
        positionCategory: posCat,
        position_category: posCat,
        fundSource: fund,
        fund_source: fund,
        natureOfAppointment: appt,
        nature_of_appointment: appt,
        hiringArrangement: hire,
        hiring_arrangement: hire,
        deploymentStatus: deploy,
        deployment_status: deploy,
        firstServiceDate: fsd,
        first_service_date: fsd,
        lastPromotionDate: lpd || "N/A",
        last_promotion_date: lpd || "N/A",
        newStationDate: nsd || fsd || "N/A",
        new_station_date: nsd || fsd || "N/A",
        lastLateralMovementDate: lmd || "N/A",
        last_lateral_movement_date: lmd || "N/A",
        stepIncrement: stepInc,
        step_increment: stepInc,
        stepIncrementConfirmed: true,
        step_increment_confirmed: true,
        assignedGradeLevels: gradeLevels,
        gradeLevelsTaught: gradeLevels,
        assignedSchools: assignedSchools,
        assigned_schools: assignedSchools,
        highestEducationalAttainment: attainment,
        highest_educational_attainment: attainment,
        collegeDegree: cd,
        college_degree: cd,
        collegeDegrees: collegeDegrees,
        college_degrees: collegeDegrees,
        degreeRows: collegeDegrees,
        major: major,
        minor: minor,
        postGraduateDegree: postDeg,
        post_graduate_degree: postDeg,
        postGraduateDiscipline: postDiscJson,
        post_graduate_discipline: postDiscJson,
        mastersDiscipline: mastersDiscipline,
        doctorateDiscipline: doctorateDiscipline,
        phdDiscipline: doctorateDiscipline,
        phd_discipline: doctorateDiscipline,
        mastersDisciplines: parsedPostDisc.masters || [],
        doctorateDisciplines: parsedPostDisc.doctorate || [],
        mastersWithUnitsDisciplines: parsedPostDisc.mastersWithUnits || [],
        mastersGraduatedDisciplines: parsedPostDisc.mastersGraduated || [],
        doctorateWithUnitsDisciplines: parsedPostDisc.doctorateWithUnits || [],
        doctorateGraduatedDisciplines: parsedPostDisc.doctorateGraduated || [],
        eligibility: eligibility,
        prcSpecialization: prcSpec,
        prc_specialization: prcSpec,
        shsTrack: shsTrack,
        shs_track: shsTrack,
        vocationalCourse: vocCourse,
        vocational_course: vocCourse,
        vocationalLevel: vocLevel,
        vocational_level: vocLevel,
        neapTrainingRows: sub.neapTrainingRows || [],
        certificationRows: sub.certificationRows || [],
        otherTrainingRows: sub.otherTrainingRows || [],
        learningAreaMap:
          sub.learningAreaMap || sub.matrix_data || existing?.matrix_data || {},
        matrix_data:
          sub.learningAreaMap || sub.matrix_data || existing?.matrix_data || {},
        personalVerified: true,
        isVerified: true,
        verified: true,
        isDraft: false,
        lastVerifiedAt: now.toISOString(),
      };

      updatedPersonnelList.push(formattedPerson);

      approvedSubmissionsList.push({
        id: subIdForArchive,
        schoolId: cleanSchoolId,
        personnelId: resolvedId,
        personnelName: `${lName}, ${fName}`.trim(),
        roomName: sub.roomName || sub.room || "Faculty Room",
        profileData: formattedPerson,
        submittedAt: now.toISOString(),
        submittedTimestamp: timestampNow,
        status: "APPROVED",
      });
    }

    // 4. Deadlock Prevention: Sort rows consistently by ID
    profileUpsertRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    employmentUpsertRows.sort((a, b) =>
      String(a.personnel_id).localeCompare(String(b.personnel_id)),
    );
    educUpsertRows.sort((a, b) =>
      String(a.personnel_id).localeCompare(String(b.personnel_id)),
    );
    trainingsInsertRows.sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    archiveUpsertRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    // 5. Short Atomic Transaction on Single Pooled Connection
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // A. Batched Upsert esf7_personnel_profile
      await executeMultiRowUpsert(
        client,
        "esf7_personnel_profile",
        [
          "id",
          "prn",
          "school_id",
          "school_year",
          "type",
          "salutation",
          "first_name",
          "middle_name",
          "last_name",
          "name_extension",
          "tin",
          "no_tin",
          "sex_at_birth",
          "civil_status",
          "solo_parent",
          "religion",
          "ethnic_group",
          "birthdate",
          "age",
          "philsys_no",
          "no_philsys",
          "employee_no",
          "deped_email",
          "no_deped_email",
          "allow_email_discrepancy",
          "is_school_head",
          "raw_payload",
          "updated_at",
        ],
        "(id)",
        `UPDATE SET
          type = EXCLUDED.type,
          first_name = EXCLUDED.first_name,
          middle_name = EXCLUDED.middle_name,
          last_name = EXCLUDED.last_name,
          name_extension = EXCLUDED.name_extension,
          tin = EXCLUDED.tin,
          no_tin = EXCLUDED.no_tin,
          sex_at_birth = EXCLUDED.sex_at_birth,
          civil_status = EXCLUDED.civil_status,
          solo_parent = EXCLUDED.solo_parent,
          religion = EXCLUDED.religion,
          ethnic_group = EXCLUDED.ethnic_group,
          birthdate = COALESCE(EXCLUDED.birthdate, esf7_personnel_profile.birthdate),
          age = EXCLUDED.age,
          philsys_no = EXCLUDED.philsys_no,
          no_philsys = EXCLUDED.no_philsys,
          employee_no = EXCLUDED.employee_no,
          deped_email = EXCLUDED.deped_email,
          no_deped_email = EXCLUDED.no_deped_email,
          allow_email_discrepancy = EXCLUDED.allow_email_discrepancy,
          is_school_head = EXCLUDED.is_school_head,
          raw_payload = COALESCE(esf7_personnel_profile.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
          updated_at = NOW()`,
        profileUpsertRows,
      );

      // B. Batched Upsert esf7_personnel_employment
      await executeMultiRowUpsert(
        client,
        "esf7_personnel_employment",
        [
          "id",
          "personnel_id",
          "position_category",
          "position",
          "step_increment",
          "fund_source",
          "nature_of_appointment",
          "hiring_arrangement",
          "deployment_status",
          "assigned_schools",
          "grade_levels_taught",
          "first_service_date",
          "last_promotion_date",
          "new_station_date",
          "last_lateral_movement_date",
          "raw_payload",
          "updated_at",
        ],
        "(personnel_id)",
        `UPDATE SET
          position_category = EXCLUDED.position_category,
          position = EXCLUDED.position,
          step_increment = EXCLUDED.step_increment,
          fund_source = EXCLUDED.fund_source,
          nature_of_appointment = EXCLUDED.nature_of_appointment,
          hiring_arrangement = EXCLUDED.hiring_arrangement,
          deployment_status = EXCLUDED.deployment_status,
          assigned_schools = EXCLUDED.assigned_schools,
          grade_levels_taught = EXCLUDED.grade_levels_taught,
          first_service_date = EXCLUDED.first_service_date,
          last_promotion_date = EXCLUDED.last_promotion_date,
          new_station_date = EXCLUDED.new_station_date,
          last_lateral_movement_date = EXCLUDED.last_lateral_movement_date,
          raw_payload = COALESCE(esf7_personnel_employment.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
          updated_at = NOW()`,
        employmentUpsertRows,
      );

      // C. Batched Upsert esf7_perssonel_educ — with NON-DESTRUCTIVE discipline preservation
      await executeMultiRowUpsert(
        client,
        "esf7_perssonel_educ",
        [
          "id",
          "personnel_id",
          "highest_educational_attainment",
          "shs_track",
          "vocational_course",
          "vocational_level",
          "college_degree",
          "major",
          "minor",
          "post_graduate_degree",
          "post_graduate_discipline",
          "eligibility",
          "prc_specialization",
          "raw_payload",
          "updated_at",
        ],
        "(personnel_id)",
        `UPDATE SET
          highest_educational_attainment = EXCLUDED.highest_educational_attainment,
          shs_track = EXCLUDED.shs_track,
          vocational_course = EXCLUDED.vocational_course,
          vocational_level = EXCLUDED.vocational_level,
          college_degree = EXCLUDED.college_degree,
          major = EXCLUDED.major,
          minor = EXCLUDED.minor,
          post_graduate_degree = EXCLUDED.post_graduate_degree,
          post_graduate_discipline = CASE 
            WHEN EXCLUDED.post_graduate_discipline IS NOT NULL 
                 AND EXCLUDED.post_graduate_discipline::text != '{}' 
                 AND EXCLUDED.post_graduate_discipline::text != '{"masters":[],"doctorate":[]}'
                 AND EXCLUDED.post_graduate_discipline::text != 'null'
            THEN EXCLUDED.post_graduate_discipline 
            ELSE esf7_perssonel_educ.post_graduate_discipline 
          END,
          eligibility = EXCLUDED.eligibility,
          prc_specialization = EXCLUDED.prc_specialization,
          raw_payload = COALESCE(esf7_perssonel_educ.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
          updated_at = NOW()`,
        educUpsertRows,
      );

      // D. Batched Delete & Multi-Row Insert for Trainings
      if (personnelIdsInBatch.length > 0) {
        await client.query(
          `
          DELETE FROM esf7_personnel_ld_trainings 
          WHERE personnel_id = ANY($1::varchar[])
        `,
          [personnelIdsInBatch],
        );
      }

      if (trainingsInsertRows.length > 0) {
        await executeMultiRowUpsert(
          client,
          "esf7_personnel_ld_trainings",
          [
            "id",
            "personnel_id",
            "training_type",
            "title",
            "total_hours",
            "raw_payload",
            "created_at",
          ],
          "(id)",
          "NOTHING",
          trainingsInsertRows,
        );
      }

      // E. Update ephemeral queue status to APPROVED
      await client.query(
        `
        UPDATE esf7_personnel_submission 
        SET status = 'APPROVED'
        WHERE school_id = $1 AND (id = ANY($2::varchar[]) OR personnel_id = ANY($3::varchar[]))
      `,
        [
          cleanSchoolId,
          subIdList.length > 0 ? subIdList : ["NONE"],
          personnelIdsInBatch,
        ],
      );

      // F. Batched Upsert into Permanent Archive
      await executeMultiRowUpsert(
        client,
        "esf7_personnel_submission_archive",
        [
          "id",
          "school_id",
          "personnel_id",
          "personnel_name",
          "room_name",
          "status",
          "payload_json",
          "created_at",
          "created_timestamp",
        ],
        "(id)",
        `UPDATE SET 
          status = 'APPROVED',
          payload_json = EXCLUDED.payload_json,
          created_at = EXCLUDED.created_at`,
        archiveUpsertRows,
      );

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // 6. Cache cleanup
    await cacheService.delPattern("room_profiling:*");
    await cacheService.delPattern("personnel:*");

    console.log(
      `⚡ [Room Profiling Accept] Atomically accepted & persisted ${updatedPersonnelList.length} teacher record(s) for School ${cleanSchoolId}`,
    );

    res.json({
      success: true,
      count: updatedPersonnelList.length,
      updatedPersonnel: updatedPersonnelList,
      approvedSubmissions: approvedSubmissionsList,
      message: `Successfully accepted and saved ${updatedPersonnelList.length} submission(s).`,
    });
  } catch (err) {
    console.error("[Room Profiling Accept Error]:", err);
    res.status(500).json({
      error: err.message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    });
  }
});

// GET /api/room-profiling/approved — School Head fetches historical submissions from active queue, archive, and room cache
router.get("/approved", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const schoolId = req.query.schoolId || req.query.school_id || "199998";
    const cleanSchoolId = String(schoolId).replace("SCH-", "").trim();

    const cacheKey = `room_profiling:approved:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    // 1. Fetch from submissions queue & permanent archive
    const { rows: subRows } = await db.query(
      `
      SELECT * FROM (
        SELECT DISTINCT ON (personnel_id)
               id, school_id as "schoolId", personnel_id as "personnelId", personnel_name as "personnelName", 
               room_name as "roomName", payload_json as "profileData", created_at as "submittedAt", created_timestamp as "submittedTimestamp", status
        FROM (
          SELECT id, school_id, personnel_id, personnel_name, room_name, payload_json, created_at, created_timestamp, status
          FROM esf7_personnel_submission 
          WHERE (school_id = $1 OR school_id = ('SCH-' || $1) OR REPLACE(school_id, 'SCH-', '') = $1)
          UNION ALL
          SELECT id, school_id, personnel_id, personnel_name, room_name, payload_json, created_at, created_timestamp, status
          FROM esf7_personnel_submission_archive
          WHERE (school_id = $1 OR school_id = ('SCH-' || $1) OR REPLACE(school_id, 'SCH-', '') = $1)
        ) combined
        ORDER BY personnel_id, created_timestamp DESC NULLS LAST
      ) latest_sub
      ORDER BY "submittedTimestamp" DESC NULLS LAST, "personnelName" ASC
    `,
      [cleanSchoolId],
    );

    const results = Array.isArray(subRows) ? [...subRows] : [];
    const seenPersonnelIds = new Set(
      results.map((r) => String(r.personnelId || "").trim()).filter(Boolean),
    );

    // 2. Database-First: Load verified/profiled teachers from esf7_personnel_profile
    try {
      const { rows: profRows } = await db.query(
        `
        SELECT p.*, e.position, e.position_category, ed.highest_educational_attainment, ed.college_degree
        FROM esf7_personnel_profile p
        LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
        LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
        WHERE p.school_id = $1 OR p.school_id = ('SCH-' || $1)
      `,
        [cleanSchoolId],
      );

      if (profRows && profRows.length > 0) {
        for (const p of profRows) {
          const pId = String(p.id || p.prn || "").trim();
          if (pId && !seenPersonnelIds.has(pId)) {
            seenPersonnelIds.add(pId);
            const fn = (p.first_name || "").trim();
            const ln = (p.last_name || "").trim();
            const pName = ln && fn ? `${ln}, ${fn}` : ln || fn || "Teacher";
            results.push({
              id: `PROF_${cleanSchoolId}_${pId}`,
              schoolId: cleanSchoolId,
              personnelId: pId,
              personnelName: pName,
              roomName: "Faculty Room",
              profileData: {
                ...p,
                firstName: fn,
                lastName: ln,
                name: pName,
                position: p.position || "Teacher",
              },
              submittedAt: p.updated_at || p.created_at || new Date(),
              submittedTimestamp: new Date(p.updated_at || p.created_at || Date.now()).getTime(),
              status: "APPROVED",
            });
          }
        }
      } else {
        // Fallback to esf7_room_roster_cache only if no normalized profiles exist
        const { rows: cacheRows } = await db.query(
          `
          SELECT school_id, roster_json, updated_at
          FROM esf7_room_roster_cache
          WHERE (school_id = $1 OR school_id = ('SCH-' || $1) OR REPLACE(school_id, 'SCH-', '') = $1)
          LIMIT 1
        `,
          [cleanSchoolId],
        );

        if (
          cacheRows &&
          cacheRows.length > 0 &&
          Array.isArray(cacheRows[0].roster_json)
        ) {
          const roster = cacheRows[0].roster_json;
          const updatedAt = cacheRows[0].updated_at || new Date();
          const updatedTimestamp = new Date(updatedAt).getTime();

          for (const p of roster) {
            const pId = String(p.id || p.prn || "").trim();

            if (pId && !seenPersonnelIds.has(pId)) {
              seenPersonnelIds.add(pId);
              const fn = (p.firstName || p.first_name || "").trim();
              const ln = (p.lastName || p.last_name || "").trim();
              const pName =
                p.name || (ln && fn ? `${ln}, ${fn}` : ln || fn || "Teacher");

              results.push({
                id: `CACHE_${cleanSchoolId}_${pId}`,
                schoolId: cleanSchoolId,
                personnelId: pId,
                personnelName: pName,
                roomName: p.roomName || p.room || "Faculty Room",
                profileData: p,
                submittedAt: p.submitted_at || p.submittedAt || updatedAt,
                submittedTimestamp: p.submitted_at
                  ? new Date(p.submitted_at).getTime()
                  : updatedTimestamp,
                status: "APPROVED",
              });
            }
          }
        }
      }
    } catch (cacheErr) {
      console.warn(
        "[Room Profiling Approved GET] Fallback notice:",
        cacheErr.message,
      );
    }

    await cacheService.set(cacheKey, results, 5);
    res.json(results);
  } catch (err) {
    console.error("[Room Profiling Queue Approved GET Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/snapshots — List saved profiling snapshots for school
router.get("/snapshots", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const schoolId = req.query.schoolId || req.query.school_id || "199998";
    const cleanSchoolId = String(schoolId).replace("SCH-", "").trim();

    const { rows } = await db.query(
      `
      SELECT id, school_id as "schoolId", snapshot_name as "snapshotName", 
             personnel_count as "personnelCount", verified_count as "verifiedCount",
             created_at as "createdAt"
      FROM esf7_profiling_snapshots 
      WHERE school_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [cleanSchoolId],
    );

    res.json(rows || []);
  } catch (err) {
    console.error("[Room Profiling Snapshots GET Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/snapshots — Save new profiling snapshot
router.post("/snapshots", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { schoolId, school_id, snapshotName, personnel } = req.body;
    const cleanSchoolId = String(schoolId || school_id || "199998")
      .replace("SCH-", "")
      .trim();

    const pList = Array.isArray(personnel) ? personnel : [];
    const verifiedCount = pList.filter(
      (p) => p.personalVerified || p.isVerified || p.verified,
    ).length;
    const snapId = `SNAP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const name =
      snapshotName ||
      `Snapshot (${pList.length} staff, ${verifiedCount} profiled)`;

    await db.query(
      `
      INSERT INTO esf7_profiling_snapshots 
        (id, school_id, snapshot_name, personnel_count, verified_count, snapshot_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `,
      [
        snapId,
        cleanSchoolId,
        name,
        pList.length,
        verifiedCount,
        JSON.stringify(pList),
      ],
    );

    // Keep max 20 snapshots per school
    await db.query(
      `
      DELETE FROM esf7_profiling_snapshots 
      WHERE school_id = $1 AND id NOT IN (
        SELECT id FROM esf7_profiling_snapshots WHERE school_id = $1 ORDER BY created_at DESC LIMIT 20
      )
    `,
      [cleanSchoolId],
    );

    res.json({
      success: true,
      snapshotId: snapId,
      message: "Snapshot saved successfully.",
    });
  } catch (err) {
    console.error("[Room Profiling Snapshots POST Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/snapshots/:id — Fetch specific snapshot content
router.get("/snapshots/:id", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM esf7_profiling_snapshots WHERE id = $1`,
      [id],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Snapshot not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("[Room Profiling Snapshot GET By ID Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/sync-roster — School Head laptop broadcasts active roster
const activeRosterCache = new Map();

router.post("/sync-roster", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { schoolId, school_id, roster } = req.body;
    const cleanSchoolId = String(schoolId || school_id || "502624")
      .replace(/^SCH-/i, "")
      .trim();

    if (!Array.isArray(roster) || roster.length === 0) {
      return res.json({
        success: true,
        count: 0,
        message: "No personnel changes to sync",
      });
    }

    const profileUpsertRows = [];
    const employmentUpsertRows = [];
    const educUpsertRows = [];
    const designationsRows = [];

    for (let i = 0; i < roster.length; i++) {
      const p = roster[i];
      if (!p || typeof p !== "object") continue;

      let pId = String(p.id || "").trim();
      let legacyId = null;
      if (pId) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pId);
        if (!isUuid) {
          legacyId = pId;
          const mapped = await db
            .query(
              `SELECT id FROM esf7_personnel_profile WHERE legacy_id = $1 OR id = $1 LIMIT 1`,
              [legacyId],
            )
            .catch(() => ({ rows: [] }));
          if (mapped.rows.length > 0) {
            pId = mapped.rows[0].id;
          } else {
            const mTable = await db
              .query(
                `SELECT new_id FROM esf7_personnel_id_mapping WHERE legacy_id = $1 LIMIT 1`,
                [legacyId],
              )
              .catch(() => ({ rows: [] }));
            if (mTable.rows.length > 0) {
              pId = mTable.rows[0].new_id;
            }
          }
        }
      }

      if (!pId || legacyId === pId) {
        if (p.prn) {
          const existingPrn = await db
            .query(
              `SELECT id FROM esf7_personnel_profile WHERE (school_id = $1 OR school_id = $2) AND prn = $3 LIMIT 1`,
              [cleanSchoolId, `SCH-${cleanSchoolId}`, String(p.prn).trim()],
            )
            .catch(() => ({ rows: [] }));
          if (existingPrn.rows.length > 0) {
            pId = existingPrn.rows[0].id;
          }
        }
        if (!pId || legacyId === pId) {
          pId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : require("crypto").randomUUID();
        }
      }

      const pStatus =
        p.status ||
        (legacyId?.startsWith("local-p-")
          ? "client-created"
          : legacyId?.startsWith("P-HARVEST-")
            ? "harvester-created"
            : "canonical");

      const fn = String(p.firstName || p.first_name || "").trim().toUpperCase();
      const ln = String(p.lastName || p.last_name || "").trim().toUpperCase();
      const mn = String(p.middleName || p.middle_name || "").trim().toUpperCase();
      const ext = String(p.nameExtension || p.name_extension || "").trim().toUpperCase();
      const sal = String(p.salutation || "MR.").trim().toUpperCase();
      const prn = String(p.prn || "").trim();
      const tin = String(p.tin || "").trim();
      const noTin = Boolean(p.noTin || p.no_tin || !tin);
      const sex = String(p.sexAtBirth || p.sex_at_birth || p.sex || "FEMALE").trim().toUpperCase();
      const civil = String(p.civilStatus || p.civil_status || "SINGLE").trim().toUpperCase();
      const solo = Boolean(
        p.soloParent === true ||
          p.solo_parent === true ||
          p.soloParent === "YES" ||
          p.solo_parent === "YES",
      );
      const rel = String(p.religion || "CHRISTIANITY").trim().toUpperCase();
      const eth = String(p.ethnicGroup || p.ethnic_group || "").trim().toUpperCase();
      const bDate = parseDateVal(p.birthdate || p.birth_date);
      const computedAge = calcAge(bDate) || Number(p.age) || null;
      const empNo = String(p.employeeNo || p.employee_no || "").trim();
      const depedEmail = String(p.depedEmail || p.deped_email || "").trim();
      const noDepedEmail = Boolean(p.noDepedEmail || p.no_deped_email || !depedEmail);
      const isHead = Boolean(p.isSchoolHead || p.is_school_head);
      const pos = String(
        p.position ||
          p.plantilla_position ||
          p.position_title ||
          "TEACHER I",
      ).trim().toUpperCase();
      const posCat = String(
        p.positionCategory ||
          p.position_category ||
          getPositionCategory(pos),
      ).trim().toUpperCase();
      const type = p.type || (posCat.includes("NON") ? "non-teaching" : "teaching");
      const step = Number(p.stepIncrement || p.step_increment || 1);
      const fund = String(p.fundSource || p.fund_source || "DEPED").trim().toUpperCase();
      const natAppt = String(
        p.natureOfAppointment || p.nature_of_appointment || "REGULAR PERMANENT",
      ).trim().toUpperCase();
      const hireArr = String(
        p.hiringArrangement || p.hiring_arrangement || "REGULAR",
      ).trim().toUpperCase();
      const depStat = String(
        p.deploymentStatus || p.deployment_status || "OWN STATION",
      ).trim().toUpperCase();
      const assignedSchools = Array.isArray(p.assignedSchools) ? p.assignedSchools : [];
      const gradeLevelsTaught = Array.isArray(p.gradeLevelsTaught || p.grade_levels_taught)
        ? p.gradeLevelsTaught || p.grade_levels_taught
        : [];
      const firstSvcDate = parseDateVal(p.firstServiceDate || p.first_service_date);
      const lastPromoDate = parseDateVal(p.lastPromotionDate || p.last_promotion_date);
      const newStationDate = parseDateVal(p.newStationDate || p.new_station_date);
      const lastLateralMovementDate = parseDateVal(
        p.lastLateralMovementDate || p.last_lateral_movement_date,
      );

      const attainment = String(
        p.highestEducationalAttainment ||
          p.highest_educational_attainment ||
          "COLLEGE GRADUATE / BACCALAUREATE",
      ).trim().toUpperCase();
      const collegeDeg = String(
        p.collegeDegree || p.college_degree || "BACHELOR OF SECONDARY EDUCATION",
      ).trim().toUpperCase();
      const collegeDegs = p.degreeRows || p.collegeDegrees || [];
      const major = String(p.major || "GENERAL EDUCATION").trim().toUpperCase();
      const minor = String(p.minor || "N/A").trim().toUpperCase();
      const postGrad = String(
        p.postGraduateDegree || p.post_graduate_degree || "N/A",
      ).trim().toUpperCase();
      const postGradDisc = p.postGraduateDiscipline || p.post_graduate_discipline || null;
      const elig = Array.isArray(p.eligibility)
        ? p.eligibility
        : [p.eligibility || "Licensure Examination for Teachers"];
      const prcSpec = String(
        p.prcSpecialization || p.prc_specialization || major,
      ).trim().toUpperCase();

      profileUpsertRows.push({
        id: pId,
        prn: prn || null,
        status: pStatus,
        legacy_id: legacyId || null,
        school_id: cleanSchoolId,
        school_year: "2025-2026",
        type,
        salutation: sal,
        first_name: fn || "TEACHER",
        middle_name: mn,
        last_name: ln || "STAFF",
        name_extension: ext,
        tin: tin || null,
        no_tin: noTin,
        sex_at_birth: sex,
        civil_status: civil,
        solo_parent: solo,
        religion: rel,
        ethnic_group: eth,
        birthdate: bDate,
        age: computedAge,
        philsys_no: String(p.philsysNo || p.philsys_no || "").trim() || null,
        no_philsys: Boolean(p.noPhilsys || p.no_philsys),
        employee_no: empNo || null,
        deped_email: depedEmail || null,
        no_deped_email: noDepedEmail,
        allow_email_discrepancy: Boolean(p.allowEmailDiscrepancy || p.allow_email_discrepancy),
        is_school_head: isHead,
        raw_payload: JSON.stringify({
          position: pos,
          positionCategory: posCat,
          stepIncrement: step,
          profilingCode: p.profilingCode || "",
          learningAreaMap: p.learningAreaMap || p.matrix_data || {},
        }),
      });

      const safeSuffix = pId.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || String(i);
      employmentUpsertRows.push({
        id: `EMP-${cleanSchoolId}-${safeSuffix}`,
        personnel_id: pId,
        position_category: posCat,
        position: pos,
        step_increment: step,
        fund_source: fund,
        nature_of_appointment: natAppt,
        hiring_arrangement: hireArr,
        deployment_status: depStat,
        assigned_schools: JSON.stringify(assignedSchools),
        grade_levels_taught: JSON.stringify(gradeLevelsTaught),
        first_service_date: firstSvcDate,
        last_promotion_date: lastPromoDate,
        new_station_date: newStationDate,
        last_lateral_movement_date: lastLateralMovementDate,
        raw_payload: JSON.stringify({ position: pos, stepIncrement: step }),
      });

      educUpsertRows.push({
        id: `EDU-${cleanSchoolId}-${safeSuffix}`,
        personnel_id: pId,
        highest_educational_attainment: attainment,
        shs_track: p.shsTrack || p.shs_track || null,
        vocational_course: p.vocationalCourse || p.vocational_course || null,
        vocational_level: p.vocationalLevel || p.vocational_level || null,
        college_degree: collegeDeg,
        college_degrees: JSON.stringify(collegeDegs),
        major,
        minor,
        post_graduate_degree: postGrad,
        post_graduate_discipline: postGradDisc ? JSON.stringify(postGradDisc) : null,
        eligibility: JSON.stringify(elig),
        prc_specialization: prcSpec,
        raw_payload: JSON.stringify({ collegeDegree: collegeDeg, major }),
      });

      if (Array.isArray(p.designations) && p.designations.length > 0) {
        for (let dIdx = 0; dIdx < p.designations.length; dIdx++) {
          const dItem = p.designations[dIdx];
          const dName = typeof dItem === "string" ? dItem : dItem?.designation_name || dItem?.name;
          if (!dName) continue;
          designationsRows.push({
            id: `DSG-${cleanSchoolId}-${safeSuffix}-${dIdx}`,
            personnel_id: pId,
            designation_name: dName.toUpperCase(),
            grade_level: dItem?.grade_level || dItem?.gradeLevel || null,
            subject_area: dItem?.subject_area || dItem?.subjectArea || null,
            track: dItem?.track || null,
            is_sds_approved: Boolean(dItem?.is_sds_approved || dItem?.isSdsApproved),
            sds_confirmed: Boolean(dItem?.sds_confirmed || dItem?.sdsConfirmed),
            serialized_key: `${cleanSchoolId}_${pId}_${dName.toUpperCase()}`,
            raw_payload: JSON.stringify(typeof dItem === "object" ? dItem : { name: dName }),
          });
        }
      }
    }

    profileUpsertRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    employmentUpsertRows.sort((a, b) =>
      String(a.personnel_id).localeCompare(String(b.personnel_id)),
    );
    educUpsertRows.sort((a, b) =>
      String(a.personnel_id).localeCompare(String(b.personnel_id)),
    );

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      await executeMultiRowUpsert(
        client,
        "esf7_personnel_profile",
        [
          "id",
          "prn",
          "status",
          "legacy_id",
          "school_id",
          "school_year",
          "type",
          "salutation",
          "first_name",
          "middle_name",
          "last_name",
          "name_extension",
          "tin",
          "no_tin",
          "sex_at_birth",
          "civil_status",
          "solo_parent",
          "religion",
          "ethnic_group",
          "birthdate",
          "age",
          "philsys_no",
          "no_philsys",
          "employee_no",
          "deped_email",
          "no_deped_email",
          "allow_email_discrepancy",
          "is_school_head",
          "raw_payload",
        ],
        "(id)",
        `UPDATE SET
          prn = COALESCE(EXCLUDED.prn, esf7_personnel_profile.prn),
          status = COALESCE(EXCLUDED.status, esf7_personnel_profile.status),
          legacy_id = COALESCE(esf7_personnel_profile.legacy_id, EXCLUDED.legacy_id),
          type = COALESCE(EXCLUDED.type, esf7_personnel_profile.type),
          salutation = COALESCE(EXCLUDED.salutation, esf7_personnel_profile.salutation),
          first_name = CASE 
            WHEN EXCLUDED.first_name IS NOT NULL AND EXCLUDED.first_name != '' AND EXCLUDED.first_name != 'TEACHER' 
            THEN EXCLUDED.first_name 
            ELSE esf7_personnel_profile.first_name 
          END,
          middle_name = COALESCE(EXCLUDED.middle_name, esf7_personnel_profile.middle_name),
          last_name = CASE 
            WHEN EXCLUDED.last_name IS NOT NULL AND EXCLUDED.last_name != '' AND EXCLUDED.last_name NOT LIKE 'STAFF%' 
            THEN EXCLUDED.last_name 
            ELSE esf7_personnel_profile.last_name 
          END,
          name_extension = COALESCE(EXCLUDED.name_extension, esf7_personnel_profile.name_extension),
          tin = COALESCE(EXCLUDED.tin, esf7_personnel_profile.tin),
          no_tin = EXCLUDED.no_tin,
          sex_at_birth = COALESCE(EXCLUDED.sex_at_birth, esf7_personnel_profile.sex_at_birth),
          civil_status = COALESCE(EXCLUDED.civil_status, esf7_personnel_profile.civil_status),
          solo_parent = EXCLUDED.solo_parent,
          religion = COALESCE(EXCLUDED.religion, esf7_personnel_profile.religion),
          ethnic_group = COALESCE(EXCLUDED.ethnic_group, esf7_personnel_profile.ethnic_group),
          birthdate = COALESCE(EXCLUDED.birthdate, esf7_personnel_profile.birthdate),
          age = COALESCE(EXCLUDED.age, esf7_personnel_profile.age),
          philsys_no = COALESCE(EXCLUDED.philsys_no, esf7_personnel_profile.philsys_no),
          no_philsys = EXCLUDED.no_philsys,
          employee_no = COALESCE(EXCLUDED.employee_no, esf7_personnel_profile.employee_no),
          deped_email = COALESCE(EXCLUDED.deped_email, esf7_personnel_profile.deped_email),
          no_deped_email = EXCLUDED.no_deped_email,
          allow_email_discrepancy = EXCLUDED.allow_email_discrepancy,
          is_school_head = EXCLUDED.is_school_head,
          raw_payload = COALESCE(esf7_personnel_profile.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
          updated_at = NOW()`,
        profileUpsertRows,
      );

      // Upsert mappings for any legacy IDs encountered during sync
      for (const pRow of profileUpsertRows) {
        if (pRow.legacy_id && pRow.legacy_id !== pRow.id) {
          await client.query(
            `INSERT INTO esf7_personnel_id_mapping (legacy_id, new_id, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (legacy_id) DO UPDATE SET new_id = EXCLUDED.new_id, status = EXCLUDED.status`,
            [pRow.legacy_id, pRow.id, pRow.status || "canonical"],
          ).catch(() => {});
        }
      }

      await executeMultiRowUpsert(
        client,
        "esf7_personnel_employment",
        [
          "id",
          "personnel_id",
          "position_category",
          "position",
          "step_increment",
          "fund_source",
          "nature_of_appointment",
          "hiring_arrangement",
          "deployment_status",
          "assigned_schools",
          "grade_levels_taught",
          "first_service_date",
          "last_promotion_date",
          "new_station_date",
          "last_lateral_movement_date",
          "raw_payload",
        ],
        "(personnel_id)",
        `UPDATE SET
          position_category = EXCLUDED.position_category,
          position = EXCLUDED.position,
          step_increment = EXCLUDED.step_increment,
          fund_source = EXCLUDED.fund_source,
          nature_of_appointment = EXCLUDED.nature_of_appointment,
          hiring_arrangement = EXCLUDED.hiring_arrangement,
          deployment_status = EXCLUDED.deployment_status,
          assigned_schools = CASE 
            WHEN EXCLUDED.assigned_schools::text != '[]' THEN EXCLUDED.assigned_schools 
            ELSE esf7_personnel_employment.assigned_schools 
          END,
          grade_levels_taught = CASE 
            WHEN EXCLUDED.grade_levels_taught::text != '[]' THEN EXCLUDED.grade_levels_taught 
            ELSE esf7_personnel_employment.grade_levels_taught 
          END,
          first_service_date = COALESCE(EXCLUDED.first_service_date, esf7_personnel_employment.first_service_date),
          last_promotion_date = COALESCE(EXCLUDED.last_promotion_date, esf7_personnel_employment.last_promotion_date),
          new_station_date = COALESCE(EXCLUDED.new_station_date, esf7_personnel_employment.new_station_date),
          last_lateral_movement_date = COALESCE(EXCLUDED.last_lateral_movement_date, esf7_personnel_employment.last_lateral_movement_date),
          raw_payload = COALESCE(esf7_personnel_employment.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
          updated_at = NOW()`,
        employmentUpsertRows,
      );

      await executeMultiRowUpsert(
        client,
        "esf7_perssonel_educ",
        [
          "id",
          "personnel_id",
          "highest_educational_attainment",
          "shs_track",
          "vocational_course",
          "vocational_level",
          "college_degree",
          "college_degrees",
          "major",
          "minor",
          "post_graduate_degree",
          "post_graduate_discipline",
          "eligibility",
          "prc_specialization",
          "raw_payload",
        ],
        "(personnel_id)",
        `UPDATE SET
          highest_educational_attainment = EXCLUDED.highest_educational_attainment,
          shs_track = COALESCE(EXCLUDED.shs_track, esf7_perssonel_educ.shs_track),
          vocational_course = COALESCE(EXCLUDED.vocational_course, esf7_perssonel_educ.vocational_course),
          vocational_level = COALESCE(EXCLUDED.vocational_level, esf7_perssonel_educ.vocational_level),
          college_degree = EXCLUDED.college_degree,
          college_degrees = CASE 
            WHEN EXCLUDED.college_degrees::text != '[]' THEN EXCLUDED.college_degrees 
            ELSE esf7_perssonel_educ.college_degrees 
          END,
          major = EXCLUDED.major,
          minor = EXCLUDED.minor,
          post_graduate_degree = EXCLUDED.post_graduate_degree,
          post_graduate_discipline = CASE 
            WHEN EXCLUDED.post_graduate_discipline IS NOT NULL 
                 AND EXCLUDED.post_graduate_discipline::text != '{}' 
                 AND EXCLUDED.post_graduate_discipline::text != 'null'
            THEN EXCLUDED.post_graduate_discipline 
            ELSE esf7_perssonel_educ.post_graduate_discipline 
          END,
          eligibility = CASE 
            WHEN EXCLUDED.eligibility::text != '[]' THEN EXCLUDED.eligibility 
            ELSE esf7_perssonel_educ.eligibility 
          END,
          prc_specialization = EXCLUDED.prc_specialization,
          raw_payload = COALESCE(esf7_perssonel_educ.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
          updated_at = NOW()`,
        educUpsertRows,
      );

      if (designationsRows.length > 0) {
        await executeMultiRowUpsert(
          client,
          "esf7_personnel_designations",
          [
            "id",
            "personnel_id",
            "designation_name",
            "grade_level",
            "subject_area",
            "track",
            "is_sds_approved",
            "sds_confirmed",
            "serialized_key",
            "raw_payload",
          ],
          "(id)",
          "NOTHING",
          designationsRows,
        );
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // Keep activeRosterCache hot in memory for same-process lookups, but NEVER write to esf7_room_roster_cache
    activeRosterCache.set(cleanSchoolId, {
      roster,
      syncedAt: Date.now(),
    });
    await cacheService.delPattern("room_profiling:*");

    return res.json({
      success: true,
      count: profileUpsertRows.length,
      syncedToNormalizedTables: true,
    });
  } catch (err) {
    console.error("[Room Profiling Sync Roster Error]:", err);
    return res.status(500).json({ error: err.message, detail: err.detail });
  }
});

// GET /api/room-profiling/roster — Mobile device retrieves active School Head roster (Database-First)
router.get("/roster", async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const schoolId = req.query.schoolId || req.query.school_id || "502624";
    const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();

    // 1. Database-First: Load registered personnel from normalized tables
    const { rows } = await db
      .query(
        `
      SELECT 
        p.id, p.prn, p.status, p.legacy_id AS "legacyId", p.first_name AS "firstName", p.last_name AS "lastName", p.middle_name AS "middleName",
        p.name_extension AS "nameExtension", p.salutation, p.tin, p.no_tin AS "noTin",
        p.sex_at_birth AS "sexAtBirth", p.civil_status AS "civilStatus", p.solo_parent AS "soloParent",
        p.religion, p.ethnic_group AS "ethnicGroup", p.birthdate, p.age, p.employee_no AS "employeeNo",
        p.deped_email AS "depedEmail", p.no_deped_email AS "noDepedEmail", p.is_school_head AS "isSchoolHead",
        p.type, p.raw_payload,
        e.position, e.position_category AS "positionCategory", e.step_increment AS "stepIncrement",
        e.fund_source AS "fundSource", e.nature_of_appointment AS "natureOfAppointment",
        e.hiring_arrangement AS "hiringArrangement", e.deployment_status AS "deploymentStatus",
        ed.highest_educational_attainment AS "highestEducationalAttainment",
        ed.college_degree AS "collegeDegree", ed.college_degrees AS "degreeRows",
        ed.major, ed.minor, ed.post_graduate_degree AS "postGraduateDegree",
        ed.post_graduate_discipline AS "postGraduateDiscipline",
        ed.eligibility, ed.prc_specialization AS "prcSpecialization"
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      WHERE p.school_id = $1 OR p.school_id = $2
      ORDER BY p.last_name ASC, p.first_name ASC
    `,
        [cleanSchoolId, `SCH-${cleanSchoolId}`],
      )
      .catch(() => ({ rows: [] }));

    if (rows && rows.length > 0) {
      const formatted = rows.map((r) => {
        const fn = String(r.firstName || "").trim();
        const ln = String(r.lastName || "").trim();
        const pName = ln && fn ? `${ln}, ${fn}` : ln || fn || "Teacher";
        const bDateStr = r.birthdate
          ? r.birthdate instanceof Date
            ? r.birthdate.toISOString().split("T")[0]
            : String(r.birthdate).substring(0, 10)
          : "";
        const bYear = bDateStr ? bDateStr.substring(0, 4) : "";
        return {
          ...(r.raw_payload || {}),
          id: r.id,
          prn: r.prn || "",
          status: r.status || "canonical",
          legacyId: r.legacyId || null,
          name: pName,
          firstName: fn,
          lastName: ln,
          middleName: r.middleName || "",
          nameExtension: r.nameExtension || "",
          salutation: r.salutation || "MR.",
          tin: r.tin || "",
          noTin: Boolean(r.noTin),
          sexAtBirth: r.sexAtBirth || "FEMALE",
          civilStatus: r.civilStatus || "SINGLE",
          soloParent: Boolean(r.soloParent),
          religion: r.religion || "CHRISTIANITY",
          ethnicGroup: r.ethnicGroup || "",
          birthdate: bDateStr,
          birthYear: bYear,
          age: r.age,
          employeeNo: r.employeeNo || "",
          depedEmail: r.depedEmail || "",
          noDepedEmail: Boolean(r.noDepedEmail),
          isSchoolHead: Boolean(r.isSchoolHead),
          position: r.position || r.raw_payload?.position || "TEACHER I",
          positionCategory: r.positionCategory || "TEACHING",
          stepIncrement: r.stepIncrement || 1,
          fundSource: r.fundSource || "DEPED",
          natureOfAppointment: r.natureOfAppointment || "REGULAR PERMANENT",
          highestEducationalAttainment:
            r.highestEducationalAttainment ||
            "COLLEGE GRADUATE / BACCALAUREATE",
          collegeDegree:
            r.collegeDegree || "BACHELOR OF SECONDARY EDUCATION",
          degreeRows: r.degreeRows || [],
          major: r.major || "GENERAL EDUCATION",
          minor: r.minor || "N/A",
          postGraduateDegree: r.postGraduateDegree || "N/A",
          postGraduateDiscipline: r.postGraduateDiscipline,
          eligibility: r.eligibility || [
            "Licensure Examination for Teachers",
          ],
          prcSpecialization: r.prcSpecialization || r.major || "",
          type: r.type || "teaching",
          profilingCode: r.raw_payload?.profilingCode || "",
          sourceConfirmed: true,
          isFallback: false,
        };
      });

      activeRosterCache.set(cleanSchoolId, {
        roster: formatted,
        syncedAt: Date.now(),
      });
      return res.json(formatted);
    }

    // 2. Last-Resort Fallback: esf7_room_roster_cache (flagged NOT confirmed saved)
    console.warn(
      `[Room Profiling][SOURCE] Using esf7_room_roster_cache as a LAST RESORT for School ID ${cleanSchoolId} - this roster is NOT confirmed saved data.`,
    );
    const { rows: cacheRows } = await db
      .query(
        `SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1`,
        [cleanSchoolId],
      )
      .catch(() => ({ rows: [] }));

    if (
      cacheRows &&
      cacheRows.length > 0 &&
      Array.isArray(cacheRows[0].roster_json) &&
      cacheRows[0].roster_json.length > 0
    ) {
      const fallbackList = cacheRows[0].roster_json.map((item) => ({
        ...item,
        sourceConfirmed: false,
        isFallback: true,
      }));
      return res.json(fallbackList);
    }

    res.json([]);
  } catch (err) {
    console.error("[Room Profiling Get Roster Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper for deterministic passcode calculation (window length = shared QR_VALIDITY_MS, 24 hours)
function calculateDailyCode(key, offset, windowMs) {
  if (!key) return "00000000";
  const timeWindow = Math.floor(Date.now() / windowMs) + offset;
  const str = `${String(key).toUpperCase().trim()}_${timeWindow}_ESF7_SECRET_SALT_V2`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  let absHash = Math.abs(hash);
  for (let i = 0; i < 8; i++) {
    code += chars[(absHash + i * 7) % chars.length];
    absHash = Math.floor(absHash / 31) + str.charCodeAt(i % str.length) * 17;
  }
  return code;
}
const calculateHourlyCode = calculateDailyCode;

const roomVerifyPasscodeSchema = {
  body: z.object({
    schoolId: z.union([z.string(), z.number()]).optional(),
    school_id: z.union([z.string(), z.number()]).optional(),
    passcode: z
      .union([z.string(), z.number()])
      .refine((val) => String(val).trim().length > 0, {
        message: "Passcode is required",
      }),
  }),
};

// POST /api/room-profiling/verify-passcode — Robust multi-key and multi-window passcode authentication
router.post(
  "/verify-passcode",
  passcodeLimiter,
  validateRequest(roomVerifyPasscodeSchema),
  async (req, res) => {
    try {
      if (!isTableInitialized) await initQueueTable();
      const { schoolId, school_id, passcode } = req.body;
      const cleanSchoolId = String(schoolId || school_id || "502624")
        .replace("SCH-", "")
        .trim();
      const cleanCode = String(passcode || "")
        .replace(/[\s-]/g, "")
        .trim()
        .toUpperCase();

      if (!cleanCode) {
        return res
          .status(400)
          .json({ success: false, message: "Passcode is required" });
      }

      const { QR_VALIDITY_MS } = await loadScheduleRules();

      // 1. Database-First: Load active roster from normalized tables
      let roster = [];
      const { rows: profileRows } = await db
        .query(
          `
        SELECT 
          p.id, p.prn, p.first_name AS "firstName", p.last_name AS "lastName", p.middle_name AS "middleName",
          p.birthdate, p.age, p.raw_payload,
          e.position, e.position_category AS "positionCategory"
        FROM esf7_personnel_profile p
        LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
        WHERE p.school_id = $1 OR school_id = $2
        ORDER BY p.last_name ASC, p.first_name ASC
      `,
          [cleanSchoolId, `SCH-${cleanSchoolId}`],
        )
        .catch(() => ({ rows: [] }));

      if (profileRows && profileRows.length > 0) {
        roster = profileRows.map((r) => {
          const fn = String(r.firstName || "").trim();
          const ln = String(r.lastName || "").trim();
          const pName = ln && fn ? `${ln}, ${fn}` : ln || fn || "Teacher";
          const bDateStr = r.birthdate
            ? r.birthdate instanceof Date
              ? r.birthdate.toISOString().split("T")[0]
              : String(r.birthdate).substring(0, 10)
            : "";
          const bYear = bDateStr ? bDateStr.substring(0, 4) : "";
          return {
            id: r.id,
            prn: r.prn || "",
            name: pName,
            firstName: fn,
            lastName: ln,
            middleName: r.middleName || "",
            birthdate: bDateStr,
            birthYear: bYear,
            position: r.position || r.raw_payload?.position || "Teacher",
            profilingCode: r.raw_payload?.profilingCode || "",
            sourceConfirmed: true,
            isFallback: false,
          };
        });
      } else {
        // 2. Last-Resort Fallback: esf7_room_roster_cache (flagged NOT confirmed saved)
        console.warn(
          `[Room Profiling Passcode][SOURCE] Using esf7_room_roster_cache as a LAST RESORT for School ID ${cleanSchoolId} - this roster is NOT confirmed saved data.`,
        );
        const { rows: cacheRows } = await db
          .query(
            `SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1`,
            [cleanSchoolId],
          )
          .catch(() => ({ rows: [] }));

        if (
          cacheRows &&
          cacheRows.length > 0 &&
          Array.isArray(cacheRows[0].roster_json) &&
          cacheRows[0].roster_json.length > 0
        ) {
          roster = cacheRows[0].roster_json.map((item) => ({
            ...item,
            sourceConfirmed: false,
            isFallback: true,
          }));
        }
      }

      let matched = null;
      for (const teacher of roster) {
        const fn = (teacher.firstName || teacher.first_name || "")
          .toUpperCase()
          .trim();
        const ln = (teacher.lastName || teacher.last_name || "")
          .toUpperCase()
          .trim();

        const keysToCheck = [
          teacher.id,
          teacher.prn,
          fn && ln ? `${ln}_${fn}` : null,
          fn && ln ? `${ln}, ${fn}` : null,
          teacher.name,
          teacher.profilingCode,
        ].filter(Boolean);

        for (const k of keysToCheck) {
          const cleanK = String(k).toUpperCase().trim();
          if (cleanCode === cleanK) {
            matched = teacher;
            break;
          }
          for (const offset of [0, -1, 1]) {
            if (
              calculateHourlyCode(cleanK, offset, QR_VALIDITY_MS) === cleanCode
            ) {
              matched = teacher;
              break;
            }
          }
          if (matched) break;
        }
        if (matched) break;
      }

      if (matched) {
        return res.json({ success: true, teacher: matched });
      }

      return res.json({
        success: false,
        message: "Invalid passcode for this school.",
      });
    } catch (err) {
      console.error("[Room Profiling Verify Passcode Error]:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

module.exports = router;
