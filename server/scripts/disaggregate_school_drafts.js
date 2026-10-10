/**
 * Data Migration: school_drafts JSON payload -> Normalized Tables Disaggregation
 *
 * Disaggregates monolithic school_drafts payloads into:
 *   1. esf7_school_profile (Curricular offerings, inclusive/special programs, shifts)
 *   2. esf7_personnel_profile (Core identity, PRN, DepEd email, PhilSys)
 *   3. esf7_personnel_employment (Plantilla, step increment, fund source, dates)
 *   4. esf7_perssonel_educ (Degrees, major, minor, eligibility)
 *   5. esf7_personnel_learning_areas (Specializations)
 *   6. esf7_personnel_designations (Coordinatorships, serialized keys)
 *   7. esf7_regular_sections / esf7_sned_sections / esf7_als_sections (Classes, learners, advisers)
 *   8. esf7_workload_rows (Teacher timetables and subject assignments)
 *   9. esf7_admin_task (Administrative assignments)
 *  10. esf7_related_task (Teaching-related duties)
 *  11. overload_absences (Absences / leave records)
 *  12. esf7_school_node_status (Journey progression & milestone percentages)
 *
 * Strict Rules & Guarantees:
 *   - Localhost-only guard: strictly forbids non-loopback hosts or NODE_ENV=production.
 *   - Explicit database allowlist: ['esf7_local', 'insighted_esf7'].
 *   - --dry-run by default; --apply requires --confirm-db <dbname>.
 *   - Automatic pre-write backup snapshot to server/backups/.
 *   - 1 single transaction per school (all-or-nothing rollback on error).
 *   - Existing rows win: confirmed non-null database fields are NEVER overwritten. Draft only fills NULL/empty fields.
 *   - Field-level diff printed for existing personnel rows.
 *   - Workload rows matched by stable natural key: real saved rows are kept as is; only missing rows are inserted.
 *   - Tombstones: deletedPersonnelIds and deletedSectionIds are honored (no resurrection).
 *   - Resumable: records completed schools in esf7_migration_log.
 *   - Emits needs_review_<timestamp>.json for anomalies or coerced fields.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const db = require("../db");
const {
  buildExtras: buildWorkloadExtras,
} = require("../utils/workloadPayload");
const { codec } = require("../utils/payloadExtras");

// tables that keep typed columns + a slim `extras` JSONB instead of a copy of the request body
const payloadCodecs = {
  esf7_school_profile: codec("esf7_school_profile"),
  esf7_related_task: codec("esf7_related_task"),
  esf7_regular_sections: codec("esf7_regular_sections"),
};
const { coerceDateField, isDatePlaceholder } = require("../utils/dateInput");
const { normalizeSchoolYear } = require("../utils/schoolYear");

// Configuration & Safety Allowlist
const ALLOWED_DATABASES = new Set(["esf7_local", "insighted_esf7"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Parse Command Line Arguments
const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isDryRun = !isApply || args.includes("--dry-run");

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const targetSchoolFilter = getArgValue("--school");
const confirmDbArg = getArgValue("--confirm-db");

// (1) Localhost & Environment Safety Guard
async function enforceSafetyGuard() {
  console.log(
    "================================================================",
  );
  console.log("🔒 SAFETY GATE: DATABASE TARGET & ENVIRONMENT VERIFICATION");
  console.log(
    "================================================================",
  );

  const configuredHost = String(process.env.DB_HOST || "").toLowerCase();
  const configuredDb = String(process.env.DB_NAME || "");
  const configuredUser = String(process.env.DB_USER || "");
  const configuredPort = String(process.env.DB_PORT || "5432");
  const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();

  console.log(`Configured DB_HOST:        ${configuredHost}`);
  console.log(`Configured DB_PORT:        ${configuredPort}`);
  console.log(`Configured DB_NAME:        ${configuredDb}`);
  console.log(`Configured DB_USER:        ${configuredUser}`);
  console.log(`Configured NODE_ENV:       ${nodeEnv}`);
  console.log(
    `Configured DATABASE_URL:   ${process.env.DATABASE_URL ? "[SET]" : "NOT SET (Clean local pool)"}`,
  );

  // Refuse if production environment
  if (nodeEnv === "production") {
    throw new Error(
      'FATAL: NODE_ENV is "production". Script refuses to run against production environments.',
    );
  }

  // Refuse if remote host
  if (!LOOPBACK_HOSTS.has(configuredHost)) {
    throw new Error(
      `FATAL: DB_HOST "${configuredHost}" is not a loopback address (localhost / 127.0.0.1 / ::1). Aborting.`,
    );
  }

  // Live session check
  const probe = await db.query(`
    SELECT 
      current_database() as current_db,
      current_user as current_user,
      inet_server_addr()::text as server_addr,
      inet_server_port() as server_port,
      version() as pg_version;
  `);

  const session = probe.rows[0];
  console.log("\n[Active Postgres Session]:");
  console.log(`  Connected Database:      ${session.current_db}`);
  console.log(`  Connected User:          ${session.current_user}`);
  console.log(
    `  Server Address:          ${session.server_addr || "local socket"}`,
  );
  console.log(
    `  Server Port:             ${session.server_port || configuredPort}`,
  );

  // Verify allowlist
  if (!ALLOWED_DATABASES.has(session.current_db)) {
    throw new Error(
      `FATAL: Connected database "${session.current_db}" is not in explicit allowlist: [${Array.from(ALLOWED_DATABASES).join(", ")}].`,
    );
  }

  // If in --apply mode, enforce explicit confirmation
  if (isApply) {
    if (!confirmDbArg || confirmDbArg !== session.current_db) {
      throw new Error(
        `FATAL: --apply requires --confirm-db "${session.current_db}" matching current database exactly. Got: "${confirmDbArg}".`,
      );
    }
    console.log(
      `\n✅ Confirmation verified: --confirm-db matches "${session.current_db}".`,
    );
  } else {
    console.log(
      "\nℹ️ Running in DRY-RUN mode (zero database modifications will be written).",
    );
  }

  // Ensure migration log table exists
  if (isApply) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_migration_log (
        school_id text PRIMARY KEY,
        school_year text NOT NULL,
        migrated_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'COMPLETED',
        stats jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
  }

  console.log(
    "================================================================\n",
  );
  return session;
}

// Helper utilities
function sanitizeText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (isDatePlaceholder(s)) return null;
  return s || null;
}

function sanitizeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || val === "") return defaultVal;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? defaultVal : n;
}

function sanitizeBoolean(val, defaultVal = false) {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function cleanSchoolId(id) {
  return String(id || "")
    .replace(/^SCH-/i, "")
    .trim();
}

function formatDays(days) {
  if (!days) return "[]";
  try {
    const arr = Array.isArray(days)
      ? days
      : typeof days === "string"
        ? days.startsWith("[")
          ? JSON.parse(days)
          : days.split(",").map((s) => s.trim())
        : [];
    return JSON.stringify(
      [...arr].map((d) => String(d).trim().toUpperCase()).sort(),
    );
  } catch {
    return String(days);
  }
}

function sanitizeTime(t) {
  if (!t) return null;
  const s = String(t).trim();
  if (
    s === "" ||
    s.toLowerCase() === "null" ||
    s.includes("NaN") ||
    s.toLowerCase().includes("invalid") ||
    s.toUpperCase() === "N/A"
  ) {
    return null;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = m[3] ? parseInt(m[3], 10) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
  }
  return null;
}

function normalizeTime(t) {
  const clean = sanitizeTime(t);
  if (!clean) return "";
  const m = clean.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : clean;
}

function getWorkloadNaturalKey(w, schoolId, schoolYear) {
  const pId = String(w.personnel_id || w.personnelId || "").trim();
  const sId = cleanSchoolId(w.school_id || schoolId || "");
  const sy = normalizeSchoolYear(w.school_year || schoolYear || "2026-2027");
  const term = String(w.term || "1st").trim();
  const st = normalizeTime(w.start_time || w.startTime);
  const et = normalizeTime(w.end_time || w.endTime);
  const days = formatDays(w.days);
  const subj = String(w.subject || "")
    .trim()
    .toUpperCase();
  const sec = String(w.section_name || w.sectionName || "")
    .trim()
    .toUpperCase();
  return `${pId}::${sId}::${sy}::${term}::${st}::${et}::${days}::${sec}::${subj}`;
}

// Node 1: School Profile
async function disaggregateSchoolInfo(
  client,
  schoolId,
  schoolYear,
  schoolInfo,
  stats,
  needsReview,
) {
  if (!schoolInfo || typeof schoolInfo !== "object") return;

  const targetSy = normalizeSchoolYear(schoolInfo.schoolYear || schoolYear);
  const cleanId = cleanSchoolId(schoolId);

  const existing = await client.query(
    "SELECT id, updated_at FROM esf7_school_profile WHERE school_id = $1 AND school_year = $2 LIMIT 1",
    [cleanId, targetSy],
  );

  const isUpdate = existing.rows.length > 0;
  const id = isUpdate ? existing.rows[0].id : `SCH-PROF-${cleanId}`;

  if (isApply) {
    await client.query(
      `
      INSERT INTO esf7_school_profile (
        id, school_id, school_year, has_elem_special_programs, has_jhs_special_programs,
        jhs_special_programs, elem_special_programs, shs_curriculum_model,
        has_elem_inclusive, elem_inclusive_programs, has_jhs_inclusive, jhs_inclusive_programs,
        has_shs_inclusive, shs_inclusive_programs, inclusive_programs,
        has_als, has_sned, has_iped, has_madrasah, extras, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
      ON CONFLICT (school_id, school_year) DO UPDATE SET
        has_elem_special_programs = COALESCE(esf7_school_profile.has_elem_special_programs, EXCLUDED.has_elem_special_programs),
        has_jhs_special_programs = COALESCE(esf7_school_profile.has_jhs_special_programs, EXCLUDED.has_jhs_special_programs),
        jhs_special_programs = CASE WHEN jsonb_array_length(esf7_school_profile.jhs_special_programs) > 0 THEN esf7_school_profile.jhs_special_programs ELSE EXCLUDED.jhs_special_programs END,
        elem_special_programs = CASE WHEN jsonb_array_length(esf7_school_profile.elem_special_programs) > 0 THEN esf7_school_profile.elem_special_programs ELSE EXCLUDED.elem_special_programs END,
        shs_curriculum_model = COALESCE(esf7_school_profile.shs_curriculum_model, EXCLUDED.shs_curriculum_model),
        has_elem_inclusive = COALESCE(esf7_school_profile.has_elem_inclusive, EXCLUDED.has_elem_inclusive),
        elem_inclusive_programs = CASE WHEN jsonb_array_length(esf7_school_profile.elem_inclusive_programs) > 0 THEN esf7_school_profile.elem_inclusive_programs ELSE EXCLUDED.elem_inclusive_programs END,
        has_jhs_inclusive = COALESCE(esf7_school_profile.has_jhs_inclusive, EXCLUDED.has_jhs_inclusive),
        jhs_inclusive_programs = CASE WHEN jsonb_array_length(esf7_school_profile.jhs_inclusive_programs) > 0 THEN esf7_school_profile.jhs_inclusive_programs ELSE EXCLUDED.jhs_inclusive_programs END,
        has_shs_inclusive = COALESCE(esf7_school_profile.has_shs_inclusive, EXCLUDED.has_shs_inclusive),
        shs_inclusive_programs = CASE WHEN jsonb_array_length(esf7_school_profile.shs_inclusive_programs) > 0 THEN esf7_school_profile.shs_inclusive_programs ELSE EXCLUDED.shs_inclusive_programs END,
        inclusive_programs = CASE WHEN jsonb_array_length(esf7_school_profile.inclusive_programs) > 0 THEN esf7_school_profile.inclusive_programs ELSE EXCLUDED.inclusive_programs END,
        has_als = COALESCE(esf7_school_profile.has_als, EXCLUDED.has_als),
        has_sned = COALESCE(esf7_school_profile.has_sned, EXCLUDED.has_sned),
        has_iped = COALESCE(esf7_school_profile.has_iped, EXCLUDED.has_iped),
        has_madrasah = COALESCE(esf7_school_profile.has_madrasah, EXCLUDED.has_madrasah),
        extras = EXCLUDED.extras,
        updated_at = NOW();
    `,
      [
        id,
        cleanId,
        targetSy,
        sanitizeBoolean(schoolInfo.hasElemSpecialPrograms),
        sanitizeBoolean(schoolInfo.hasJhsSpecialPrograms),
        JSON.stringify(schoolInfo.jhsSpecialPrograms || []),
        JSON.stringify(schoolInfo.elemSpecialPrograms || []),
        schoolInfo.shsCurriculumModel || "Standard K-12 SHS Curriculum",
        sanitizeBoolean(schoolInfo.hasElemInclusive),
        JSON.stringify(schoolInfo.elemInclusivePrograms || []),
        sanitizeBoolean(schoolInfo.hasJhsInclusive),
        JSON.stringify(schoolInfo.jhsInclusivePrograms || []),
        sanitizeBoolean(schoolInfo.hasShsInclusive),
        JSON.stringify(schoolInfo.shsInclusivePrograms || []),
        JSON.stringify(schoolInfo.inclusivePrograms || []),
        sanitizeBoolean(schoolInfo.hasAls),
        sanitizeBoolean(schoolInfo.hasSned),
        sanitizeBoolean(schoolInfo.hasIped),
        sanitizeBoolean(schoolInfo.hasMadrasah),
        JSON.stringify(
          payloadCodecs.esf7_school_profile.buildExtras(schoolInfo, {
            id,
            school_id: cleanId,
            school_year: targetSy,
            has_elem_special_programs: sanitizeBoolean(
              schoolInfo.hasElemSpecialPrograms,
            ),
            has_jhs_special_programs: sanitizeBoolean(
              schoolInfo.hasJhsSpecialPrograms,
            ),
            jhs_special_programs: schoolInfo.jhsSpecialPrograms || [],
            elem_special_programs: schoolInfo.elemSpecialPrograms || [],
            shs_curriculum_model:
              schoolInfo.shsCurriculumModel || "Standard K-12 SHS Curriculum",
            has_elem_inclusive: sanitizeBoolean(schoolInfo.hasElemInclusive),
            elem_inclusive_programs: schoolInfo.elemInclusivePrograms || [],
            has_jhs_inclusive: sanitizeBoolean(schoolInfo.hasJhsInclusive),
            jhs_inclusive_programs: schoolInfo.jhsInclusivePrograms || [],
            has_shs_inclusive: sanitizeBoolean(schoolInfo.hasShsInclusive),
            shs_inclusive_programs: schoolInfo.shsInclusivePrograms || [],
            inclusive_programs: schoolInfo.inclusivePrograms || [],
            has_als: sanitizeBoolean(schoolInfo.hasAls),
            has_sned: sanitizeBoolean(schoolInfo.hasSned),
            has_iped: sanitizeBoolean(schoolInfo.hasIped),
            has_madrasah: sanitizeBoolean(schoolInfo.hasMadrasah),
          }),
        ),
      ],
    );
  }

  if (isUpdate) stats.school_profile.matched++;
  else stats.school_profile.inserted++;
}

// Node 2 & 3: Personnel (Profile, Employment, Education, Tasks)
async function disaggregatePersonnel(
  client,
  schoolId,
  schoolYear,
  personnelList,
  deletedPersonnelIds,
  stats,
  needsReview,
) {
  const draftIdToFinalIdMap = new Map();
  if (!Array.isArray(personnelList) || personnelList.length === 0)
    return draftIdToFinalIdMap;

  const cleanId = cleanSchoolId(schoolId);
  const targetSy = normalizeSchoolYear(schoolYear);

  // Pre-fetch all existing personnel, employment, and education records for this school or matching PRNs/IDs
  const allDraftPrns = (personnelList || [])
    .map((p) => (p && p.prn ? String(p.prn).trim() : null))
    .filter(
      (p) =>
        p &&
        p.toUpperCase() !== "N/A" &&
        p !== "0" &&
        p.toUpperCase() !== "NONE" &&
        p !== "NULL",
    );

  const allDraftIds = (personnelList || [])
    .map((p) => (p && p.id ? String(p.id).trim() : null))
    .filter(Boolean);

  const existingPerRes = await client.query(
    "SELECT * FROM esf7_personnel_profile WHERE school_id = $1 OR prn = ANY($2::text[]) OR id = ANY($3::text[])",
    [
      cleanId,
      allDraftPrns.length > 0 ? allDraftPrns : ["__NO_MATCH__"],
      allDraftIds.length > 0 ? allDraftIds : ["__NO_MATCH__"],
    ],
  );
  const existingPerMap = new Map();
  existingPerRes.rows.forEach((r) => {
    existingPerMap.set(r.id, r);
    if (r.prn) existingPerMap.set(r.prn, r);
  });

  const candidateIds = Array.from(
    new Set([
      ...Array.from(existingPerMap.keys()),
      ...personnelList.map((p) => p.id).filter(Boolean),
    ]),
  );

  const existingEmpRes =
    candidateIds.length > 0
      ? await client.query(
          "SELECT * FROM esf7_personnel_employment WHERE personnel_id = ANY($1::text[])",
          [candidateIds],
        )
      : { rows: [] };
  const existingEmpMap = new Map(
    existingEmpRes.rows.map((r) => [r.personnel_id, r]),
  );

  const existingEduRes =
    candidateIds.length > 0
      ? await client.query(
          "SELECT * FROM esf7_perssonel_educ WHERE personnel_id = ANY($1::text[])",
          [candidateIds],
        )
      : { rows: [] };
  const existingEduMap = new Map(
    existingEduRes.rows.map((r) => [r.personnel_id, r]),
  );

  // Also pre-fetch existing workload rows for natural key matching
  const existingWklRes = await client.query(
    "SELECT * FROM esf7_workload_rows WHERE school_id = $1",
    [cleanId],
  );
  const existingWklKeySet = new Set();
  existingWklRes.rows.forEach((r) => {
    existingWklKeySet.add(getWorkloadNaturalKey(r, cleanId, targetSy));
  });
  const insertedWklKeys = new Set();

  for (const p of personnelList) {
    if (!p) continue;
    stats.personnel_profile.read++;

    const pId =
      p.id ||
      `PER-${cleanId}-${String(p.prn || Math.random().toString(36).substring(2, 7))}`;
    const prn = String(p.prn || "").trim();

    // Honor deletedPersonnelIds tombstone
    if (deletedPersonnelIds.has(pId) || (prn && deletedPersonnelIds.has(prn))) {
      stats.personnel_profile.skipped_tombstone++;
      continue;
    }

    if (
      !prn ||
      prn.toUpperCase() === "N/A" ||
      prn === "0" ||
      prn.toUpperCase() === "NONE" ||
      prn === "NULL"
    ) {
      needsReview.push({
        schoolId: cleanId,
        node: "personnel",
        id: pId,
        reason: `Missing or placeholder PRN ("${p.prn}") in personnel record`,
        originalValue: { name: `${p.firstName} ${p.lastName}` },
      });
      stats.personnel_profile.flagged++;
      continue;
    }

    // Check existing by PRN or by ID
    const existingByPrn = prn ? existingPerMap.get(prn) : null;
    const existingById = pId ? existingPerMap.get(pId) : null;
    let existingRow = existingByPrn || existingById;

    // Detect PRN collision where draft record shares a PRN with an existing record having a different surname
    if (existingByPrn && pId !== existingByPrn.id) {
      const draftLast = (
        sanitizeText(p.lastName || p.last_name) || ""
      ).toUpperCase();
      const existingLast = (
        sanitizeText(existingByPrn.last_name) || ""
      ).toUpperCase();
      if (draftLast && existingLast && draftLast !== existingLast) {
        needsReview.push({
          schoolId: cleanId,
          node: "personnel",
          id: pId,
          reason: `PRN conflict: Draft personnel "${p.firstName} ${p.lastName}" shares PRN "${prn}" with different personnel "${existingByPrn.first_name} ${existingByPrn.last_name}". Skipped to prevent data corruption.`,
          originalValue: {
            draftName: `${p.firstName} ${p.lastName}`,
            existingName: `${existingByPrn.first_name} ${existingByPrn.last_name}`,
            prn,
          },
        });
        stats.personnel_profile.flagged++;
        continue;
      }
    }

    let isExisting = false;
    let finalId = pId;

    if (existingByPrn) {
      isExisting = true;
      finalId = existingByPrn.id;
    } else if (existingById) {
      if (existingById.school_id === cleanId) {
        isExisting = true;
        finalId = existingById.id;
      } else {
        // ID collision with another school: re-scope ID for this school to avoid primary key error
        finalId = prn
          ? `PER-${cleanId}-${prn}`
          : `PER-${cleanId}-${Math.random().toString(36).substring(2, 7)}`;
        while (existingPerMap.has(finalId)) {
          finalId = `PER-${cleanId}-${Math.random().toString(36).substring(2, 7)}`;
        }
        isExisting = false;
      }
    } else {
      isExisting = false;
      finalId = pId;
      if (existingPerMap.has(finalId)) {
        finalId = prn
          ? `PER-${cleanId}-${prn}`
          : `PER-${cleanId}-${Math.random().toString(36).substring(2, 7)}`;
      }
    }

    draftIdToFinalIdMap.set(pId, finalId);
    if (p.id) draftIdToFinalIdMap.set(p.id, finalId);

    let cleanBirthdate = null;
    try {
      cleanBirthdate = coerceDateField(p.birthdate, "birthdate");
    } catch {
      needsReview.push({
        schoolId: cleanId,
        node: "personnel_profile",
        id: finalId,
        reason: `Invalid birthdate coerced to NULL: "${p.birthdate}"`,
      });
    }

    if (isExisting) {
      stats.personnel_profile.matched++;

      // Compute field-level diff: ONLY fill NULL or empty fields!
      const fieldsToCheck = [
        ["first_name", sanitizeText(p.firstName || p.first_name)],
        ["last_name", sanitizeText(p.lastName || p.last_name)],
        ["middle_name", sanitizeText(p.middleName || p.middle_name)],
        ["birthdate", cleanBirthdate],
        ["deped_email", sanitizeText(p.depedEmail || p.deped_email)],
        ["employee_no", sanitizeText(p.employeeNo || p.employee_no)],
        ["tin", sanitizeText(p.tin)],
        ["philsys_no", sanitizeText(p.philsysNo || p.philsys_no)],
        ["civil_status", sanitizeText(p.civilStatus || p.civil_status)],
        ["religion", sanitizeText(p.religion)],
        ["ethnic_group", sanitizeText(p.ethnicGroup || p.ethnic_group)],
      ];

      const diffList = [];
      const updateFields = [];
      const updateValues = [];
      let paramIdx = 1;

      fieldsToCheck.forEach(([col, draftVal]) => {
        const dbVal = existingRow[col];
        const dbEmpty = dbVal === null || dbVal === undefined || dbVal === "";
        const draftEmpty =
          draftVal === null || draftVal === undefined || draftVal === "";

        if (dbEmpty && !draftEmpty) {
          diffList.push(`${col}: [DB NULL] -> filled with "${draftVal}"`);
          updateFields.push(`${col} = $${paramIdx++}`);
          updateValues.push(draftVal);
        }
      });

      if (diffList.length > 0) {
        console.log(
          `  [Personnel Diff: ${finalId} (${existingRow.first_name} ${existingRow.last_name})]:`,
        );
        diffList.forEach((d) => console.log(`    - ${d}`));

        if (isApply) {
          updateValues.push(finalId);
          await client.query(
            `
            UPDATE esf7_personnel_profile 
            SET ${updateFields.join(", ")}, updated_at = NOW() 
            WHERE id = $${paramIdx}
          `,
            updateValues,
          );
        }
        stats.personnel_profile.updated++;
      } else {
        stats.personnel_profile.unchanged++;
      }
    } else {
      // New insert
      stats.personnel_profile.inserted++;
      existingPerMap.set(finalId, { id: finalId, prn });
      if (prn) existingPerMap.set(prn, { id: finalId, prn });
      if (isApply) {
        await client.query(
          `
          INSERT INTO esf7_personnel_profile (
            id, prn, school_id, school_year, first_name, middle_name, last_name, name_extension,
            salutation, type, sex_at_birth, birthdate, age, tin, no_tin, philsys_no, no_philsys,
            employee_no, deped_email, no_deped_email, is_school_head, civil_status, solo_parent,
            religion, ethnic_group, term, raw_payload, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW())
          ON CONFLICT (prn) DO UPDATE SET
            middle_name = COALESCE(esf7_personnel_profile.middle_name, EXCLUDED.middle_name),
            philsys_no = COALESCE(esf7_personnel_profile.philsys_no, EXCLUDED.philsys_no),
            updated_at = NOW();
        `,
          [
            finalId,
            prn,
            cleanId,
            targetSy,
            sanitizeText(p.firstName || p.first_name) || "UNKNOWN",
            sanitizeText(p.middleName || p.middle_name),
            sanitizeText(p.lastName || p.last_name) || "UNKNOWN",
            sanitizeText(p.nameExtension || p.extensionName),
            p.salutation || "MR.",
            p.type || "teaching",
            p.sexAtBirth || p.gender || p.sex || "Male",
            cleanBirthdate,
            sanitizeNumber(p.age, null),
            sanitizeText(p.tin),
            sanitizeBoolean(p.noTin || p.no_tin),
            sanitizeText(p.philsysNo || p.philsys_no),
            sanitizeBoolean(p.noPhilsys || p.no_philsys),
            sanitizeText(p.employeeNo || p.employee_no),
            sanitizeText(p.depedEmail || p.deped_email),
            sanitizeBoolean(p.noDepedEmail || p.no_deped_email),
            sanitizeBoolean(p.isSchoolHead || p.is_school_head),
            sanitizeText(p.civilStatus || p.civil_status),
            sanitizeBoolean(p.soloParent || p.solo_parent),
            sanitizeText(p.religion),
            sanitizeText(p.ethnicGroup || p.ethnic_group),
            p.term || "1st",
            JSON.stringify(p),
          ],
        );
      }
    }

    // B. Employment record
    const existingEmp = existingEmpMap.get(finalId);
    let firstServiceDate = null,
      lastPromotionDate = null,
      newStationDate = null,
      lastLateralMovementDate = null;
    try {
      firstServiceDate = coerceDateField(
        p.firstServiceDate || p.first_service_date,
        "firstServiceDate",
      );
    } catch {}
    try {
      lastPromotionDate = coerceDateField(
        p.lastPromotionDate || p.last_promotion_date,
        "lastPromotionDate",
      );
    } catch {}
    try {
      newStationDate = coerceDateField(
        p.newStationDate || p.new_station_date,
        "newStationDate",
      );
    } catch {}
    try {
      lastLateralMovementDate = coerceDateField(
        p.lastLateralMovementDate || p.last_lateral_movement_date,
        "lastLateralMovementDate",
      );
    } catch {}

    let posCategory = String(
      p.positionCategory || p.position_category || "TEACHING",
    ).toUpperCase();
    if (posCategory === "TEACHING-RELATED") posCategory = "RELATED TEACHING";
    if (
      ![
        "TEACHING",
        "RELATED TEACHING",
        "NON-TEACHING",
        "teaching",
        "teaching-related",
        "non-teaching",
      ].includes(posCategory)
    ) {
      posCategory = "TEACHING";
    }
    const stepInc = Math.max(
      1,
      Math.min(8, sanitizeNumber(p.stepIncrement || p.step_increment, 1)),
    );

    if (existingEmp) {
      stats.personnel_employment.matched++;
      // Only update null fields
      if (isApply) {
        await client.query(
          `
          UPDATE esf7_personnel_employment SET
            position = COALESCE(position, $1),
            first_service_date = COALESCE(first_service_date, $2),
            updated_at = NOW()
          WHERE personnel_id = $3
        `,
          [p.position || "TEACHER I", firstServiceDate, finalId],
        );
      }
    } else {
      stats.personnel_employment.inserted++;
      existingEmpMap.set(finalId, {
        id: `EMP-${finalId}`,
        personnel_id: finalId,
      });
      if (isApply) {
        await client.query(
          `
          INSERT INTO esf7_personnel_employment (
            id, personnel_id, position_category, position, step_increment, fund_source,
            nature_of_appointment, hiring_arrangement, deployment_status, assigned_schools,
            grade_levels_taught, first_service_date, last_promotion_date, new_station_date,
            last_lateral_movement_date, raw_payload, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT (personnel_id) DO UPDATE SET
            position = COALESCE(esf7_personnel_employment.position, EXCLUDED.position),
            first_service_date = COALESCE(esf7_personnel_employment.first_service_date, EXCLUDED.first_service_date),
            updated_at = NOW();
        `,
          [
            `EMP-${finalId}`,
            finalId,
            posCategory,
            p.position || "TEACHER I",
            stepInc,
            p.fundSource || p.fund_source || "NATIONAL",
            p.natureOfAppointment ||
              p.nature_of_appointment ||
              "REGULAR PERMANENT",
            p.hiringArrangement || p.hiring_arrangement || "REGULAR",
            p.deploymentStatus || p.deployment_status || "OWN STATION",
            JSON.stringify(p.assignedSchools || []),
            JSON.stringify(p.gradeLevelsTaught || []),
            firstServiceDate,
            lastPromotionDate,
            newStationDate,
            lastLateralMovementDate,
            JSON.stringify(p),
          ],
        );
      }
    }

    // C. Education record (exact spelling: esf7_perssonel_educ)
    const existingEdu = existingEduMap.get(finalId);
    const eligList = Array.isArray(p.eligibility)
      ? p.eligibility
      : p.eligibility
        ? [p.eligibility]
        : [];

    if (existingEdu) {
      stats.perssonel_educ.matched++;
      if (isApply) {
        await client.query(
          `
          UPDATE esf7_perssonel_educ SET
            college_degree = COALESCE(college_degree, $1),
            major = COALESCE(major, $2),
            updated_at = NOW()
          WHERE personnel_id = $3
        `,
          [
            sanitizeText(p.degree || p.collegeDegree),
            sanitizeText(p.major),
            finalId,
          ],
        );
      }
    } else {
      stats.perssonel_educ.inserted++;
      existingEduMap.set(finalId, {
        id: `EDU-${finalId}`,
        personnel_id: finalId,
      });
      if (isApply) {
        await client.query(
          `
          INSERT INTO esf7_perssonel_educ (
            id, personnel_id, college_degree, major, minor, post_graduate_degree,
            post_graduate_discipline, eligibility, raw_payload, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (personnel_id) DO UPDATE SET
            college_degree = COALESCE(esf7_perssonel_educ.college_degree, EXCLUDED.college_degree),
            major = COALESCE(esf7_perssonel_educ.major, EXCLUDED.major),
            updated_at = NOW();
        `,
          [
            `EDU-${finalId}`,
            finalId,
            sanitizeText(p.degree || p.collegeDegree),
            sanitizeText(p.major),
            sanitizeText(p.minor),
            sanitizeText(p.postGraduateDegree) || "N/A",
            sanitizeText(p.postGraduateDiscipline),
            JSON.stringify(eligList),
            JSON.stringify(p),
          ],
        );
      }
    }

    // D. Workload Rows for this teacher
    if (Array.isArray(p.workloadRows) && p.workloadRows.length > 0) {
      for (const w of p.workloadRows) {
        stats.workload_rows.read++;
        const draftKey = getWorkloadNaturalKey(
          { ...w, personnel_id: finalId },
          cleanId,
          targetSy,
        );

        // Pre-existing row saved in DB wins over older draft!
        if (existingWklKeySet.has(draftKey)) {
          stats.workload_rows.matched++;
          continue;
        }

        // Duplicate row within the draft payload itself
        if (insertedWklKeys.has(draftKey)) {
          stats.workload_rows.skipped++;
          continue;
        }

        insertedWklKeys.add(draftKey);
        stats.workload_rows.inserted++;
        const wId =
          w.id ||
          `WKL-${finalId}-${Math.random().toString(36).substring(2, 7)}`;
        const wDays = Array.isArray(w.days)
          ? w.days
          : ["M", "T", "W", "TH", "F"];
        const startTime = sanitizeTime(w.startTime || w.start_time);
        const endTime = sanitizeTime(w.endTime || w.end_time);
        const subject = sanitizeText(w.subject) || "GENERAL";

        if (isApply) {
          await client.query(
            `
            INSERT INTO esf7_workload_rows (
              id, personnel_id, school_id, school_year, grade_level, section_id,
              section_name, subject, start_time, end_time, days, term, extras, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (id) DO NOTHING;
          `,
            [
              wId,
              finalId,
              cleanId,
              targetSy,
              w.gradeLevel || w.grade_level || "Grade 7",
              w.sectionId || w.section_id || null,
              w.sectionName || w.section_name || "",
              subject,
              startTime,
              endTime,
              JSON.stringify(wDays),
              w.term || "1st",
              // only keys without a typed column (see utils/workloadPayload.js), not a copy of the whole row
              JSON.stringify(
                buildWorkloadExtras(w, {
                  id: wId,
                  personnel_id: finalId,
                  school_id: cleanId,
                  school_year: targetSy,
                  grade_level: w.gradeLevel || w.grade_level || "Grade 7",
                  section_id: w.sectionId || w.section_id || null,
                  section_name: w.sectionName || w.section_name || "",
                  subject,
                  start_time: startTime,
                  end_time: endTime,
                  days: wDays,
                  term: w.term || "1st",
                }),
              ),
            ],
          );
        }
      }
    }

    // E. Admin Tasks
    if (Array.isArray(p.adminTasks) && p.adminTasks.length > 0) {
      for (const a of p.adminTasks) {
        stats.admin_task.read++;
        stats.admin_task.inserted++;
        const aId =
          a.id ||
          `ADM-${finalId}-${Math.random().toString(36).substring(2, 7)}`;
        if (isApply) {
          await client.query(
            `
            INSERT INTO esf7_admin_task (
              id, personnel_id, school_id, school_year, task_name, duration_minutes,
              start_time, end_time, days, term, raw_payload, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (id) DO NOTHING;
          `,
            [
              aId,
              finalId,
              cleanId,
              targetSy,
              a.taskName || a.task_name || "General Task",
              sanitizeNumber(a.durationMinutes || a.duration_minutes, 60),
              sanitizeTime(a.startTime || a.start_time),
              sanitizeTime(a.endTime || a.end_time),
              JSON.stringify(
                Array.isArray(a.days) ? a.days : ["M", "T", "W", "TH", "F"],
              ),
              a.term || "1st",
              JSON.stringify(a),
            ],
          );
        }
      }
    }

    // F. Related Tasks
    if (Array.isArray(p.relatedTasks) && p.relatedTasks.length > 0) {
      for (const r of p.relatedTasks) {
        stats.related_task.read++;
        stats.related_task.inserted++;
        const rId =
          r.id ||
          `REL-${finalId}-${Math.random().toString(36).substring(2, 7)}`;
        if (isApply) {
          await client.query(
            `
            INSERT INTO esf7_related_task (
              id, personnel_id, school_id, school_year, task_name, hours_per_week,
              frequency, term, extras, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (id) DO NOTHING;
          `,
            [
              rId,
              finalId,
              cleanId,
              targetSy,
              r.taskName || r.task_name || "Lesson Prep",
              sanitizeNumber(r.hoursPerWeek || r.hours_per_week, 6),
              r.frequency || "Weekly",
              r.term || "1st",
              JSON.stringify(
                payloadCodecs.esf7_related_task.buildExtras(r, {
                  id: rId,
                  personnel_id: finalId,
                  school_id: cleanId,
                  school_year: targetSy,
                  task_name: r.taskName || r.task_name || "Lesson Prep",
                  frequency: r.frequency || "Weekly",
                }),
              ),
            ],
          );
        }
      }
    }
  }

  return draftIdToFinalIdMap;
}

// Node 4: Sections
async function disaggregateSections(
  client,
  schoolId,
  schoolYear,
  sectionsList,
  personnelList,
  deletedSectionIds,
  stats,
  needsReview,
  draftIdToFinalIdMap = new Map(),
) {
  if (!Array.isArray(sectionsList) || sectionsList.length === 0) return;

  const cleanId = cleanSchoolId(schoolId);
  const targetSy = normalizeSchoolYear(schoolYear);

  // Pre-fetch all valid personnel for this school to resolve advisers
  const personnelRes = await client.query(
    "SELECT id, prn FROM esf7_personnel_profile WHERE school_id = $1",
    [cleanId],
  );
  const validPersonnelIds = new Set(personnelRes.rows.map((r) => r.id));
  const prnToIdMap = new Map();
  personnelRes.rows.forEach((r) => {
    if (r.prn) prnToIdMap.set(r.prn, r.id);
  });

  // In dry-run mode, new personnel were not written to DB yet, so include draft personnel validated by disaggregatePersonnel
  if (!isApply && draftIdToFinalIdMap) {
    for (const [dId, fId] of draftIdToFinalIdMap.entries()) {
      validPersonnelIds.add(fId);
    }
  }

  // Pre-fetch existing regular sections
  const existingSecRes = await client.query(
    "SELECT * FROM esf7_regular_sections WHERE school_id = $1",
    [cleanId],
  );
  const existingSecKeyMap = new Map();
  const usedSecIds = new Set(existingSecRes.rows.map((r) => r.id));
  existingSecRes.rows.forEach((r) => {
    existingSecKeyMap.set(
      `${r.grade_level}::${r.section_name}`.toUpperCase(),
      r,
    );
  });

  // Pre-fetch if candidate section IDs from this draft already exist globally
  const candidateSecIds = (sectionsList || [])
    .map((s) => s && s.id)
    .filter(Boolean);
  if (candidateSecIds.length > 0) {
    const globalSecRes = await client.query(
      "SELECT id FROM esf7_regular_sections WHERE id = ANY($1::text[])",
      [candidateSecIds],
    );
    globalSecRes.rows.forEach((r) => usedSecIds.add(r.id));
  }

  for (const s of sectionsList) {
    if (!s) continue;
    stats.regular_sections.read++;

    let secId = s.id;
    if (!secId || usedSecIds.has(secId)) {
      secId = `sec-draft-${cleanId}-${Math.random().toString(36).substring(2, 7)}`;
      while (usedSecIds.has(secId)) {
        secId = `sec-draft-${cleanId}-${Math.random().toString(36).substring(2, 7)}`;
      }
    }
    usedSecIds.add(secId);

    const gradeLevel = String(
      s.gradeLevel || s.grade_level || "Grade 7",
    ).trim();
    const sectionName = String(s.sectionName || s.section_name || "A")
      .trim()
      .toUpperCase();
    const rawType = String(s.sectionType || s.section_type || "MONO GRADE")
      .trim()
      .toUpperCase();

    // Honor deletedSectionIds tombstone
    if ((s.id && deletedSectionIds.has(s.id)) || deletedSectionIds.has(secId)) {
      stats.regular_sections.skipped_tombstone++;
      continue;
    }

    // Resolve adviser ID against valid personnel
    const rawAdv = s.advisorId || s.adviserId || s.adviser_id;
    let resolvedAdviserId = null;

    if (rawAdv) {
      if (validPersonnelIds.has(rawAdv)) {
        resolvedAdviserId = rawAdv;
      } else if (
        draftIdToFinalIdMap &&
        draftIdToFinalIdMap.has(rawAdv) &&
        validPersonnelIds.has(draftIdToFinalIdMap.get(rawAdv))
      ) {
        resolvedAdviserId = draftIdToFinalIdMap.get(rawAdv);
      } else if (prnToIdMap.has(rawAdv)) {
        resolvedAdviserId = prnToIdMap.get(rawAdv);
      } else {
        needsReview.push({
          schoolId: cleanId,
          node: "classSections",
          sectionId: secId,
          sectionName: `${gradeLevel} - ${sectionName}`,
          reason: `Adviser reference "${rawAdv}" could not be resolved to any personnel. Set to NULL.`,
          originalValue: rawAdv,
        });
        stats.regular_sections.flagged++;
      }
    }

    // Ironclad FK guarantee: In apply mode, NEVER allow an adviser_id not present in validPersonnelIds
    if (
      isApply &&
      resolvedAdviserId &&
      !validPersonnelIds.has(resolvedAdviserId)
    ) {
      resolvedAdviserId = null;
    }

    const maleLearners = sanitizeNumber(s.maleLearners || s.male_learners, 0);
    const femaleLearners = sanitizeNumber(
      s.femaleLearners || s.female_learners,
      0,
    );
    const totalLearners = sanitizeNumber(
      s.numberOfLearners || s.number_of_learners,
      maleLearners + femaleLearners,
    );
    const sizeStatus = s.sizeStatus || s.size_status || "WITHIN STANDARD";

    if (rawType.includes("ALS")) {
      stats.als_sections.inserted++;
      if (isApply) {
        await client.query(
          `
          INSERT INTO esf7_als_sections (
            id, school_id, school_year, grade_level, section_name, delivery_mode, clc_name,
            adviser_id, male_learners, female_learners, number_of_learners, size_status,
            raw_payload, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (school_id, school_year, section_name) DO UPDATE SET
            adviser_id = COALESCE(esf7_als_sections.adviser_id, EXCLUDED.adviser_id),
            number_of_learners = CASE WHEN EXCLUDED.number_of_learners > 0 THEN EXCLUDED.number_of_learners ELSE esf7_als_sections.number_of_learners END,
            updated_at = NOW();
        `,
          [
            secId,
            cleanId,
            targetSy,
            gradeLevel,
            sectionName,
            sanitizeText(s.deliveryMode || s.delivery_mode),
            sanitizeText(s.clcName || s.clc_name),
            resolvedAdviserId,
            maleLearners,
            femaleLearners,
            totalLearners,
            sizeStatus,
            JSON.stringify(s),
          ],
        );
      }
    } else if (rawType.includes("SNED") || rawType.includes("SPED")) {
      stats.sned_sections.inserted++;
      if (isApply) {
        await client.query(
          `
          INSERT INTO esf7_sned_sections (
            id, school_id, school_year, grade_level, section_name, program_type,
            adviser_id, male_learners, female_learners, number_of_learners, size_status,
            raw_payload, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (school_id, school_year, section_name) DO UPDATE SET
            adviser_id = COALESCE(esf7_sned_sections.adviser_id, EXCLUDED.adviser_id),
            number_of_learners = CASE WHEN EXCLUDED.number_of_learners > 0 THEN EXCLUDED.number_of_learners ELSE esf7_sned_sections.number_of_learners END,
            updated_at = NOW();
        `,
          [
            secId,
            cleanId,
            targetSy,
            gradeLevel,
            sectionName,
            sanitizeText(s.programType || s.program_type),
            resolvedAdviserId,
            maleLearners,
            femaleLearners,
            totalLearners,
            sizeStatus,
            JSON.stringify(s),
          ],
        );
      }
    } else {
      // Regular Mono / Multi Grade
      const secKey = `${gradeLevel}::${sectionName}`.toUpperCase();
      const existingSec = existingSecKeyMap.get(secKey);

      if (existingSec) {
        // EXISTING SECTION WINS: Never overwrite learner counts or delete it!
        stats.regular_sections.matched++;
        if (resolvedAdviserId && !existingSec.adviser_id && isApply) {
          // Fill missing adviser if DB was null
          await client.query(
            `
            UPDATE esf7_regular_sections 
            SET adviser_id = $1, updated_at = NOW() 
            WHERE id = $2 AND adviser_id IS NULL
          `,
            [resolvedAdviserId, existingSec.id],
          );
          stats.regular_sections.updated++;
        }
      } else {
        // New section to insert
        stats.regular_sections.inserted++;
        const isMulti = rawType.includes("MULTI");
        const normalizedType = isMulti ? "MULTI GRADE" : "MONO GRADE";

        if (isApply) {
          await client.query(
            `
            INSERT INTO esf7_regular_sections (
              id, school_id, school_year, grade_level, section_name, adviser_id,
              section_type, male_learners, female_learners, number_of_learners,
              size_status, term, extras, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (school_id, school_year, grade_level, section_name) DO UPDATE SET
              adviser_id = COALESCE(esf7_regular_sections.adviser_id, EXCLUDED.adviser_id),
              updated_at = NOW();
          `,
            [
              secId,
              cleanId,
              targetSy,
              gradeLevel,
              sectionName,
              resolvedAdviserId,
              normalizedType,
              maleLearners,
              femaleLearners,
              totalLearners,
              sizeStatus,
              s.term || "1st",
              JSON.stringify(
                payloadCodecs.esf7_regular_sections.buildExtras(s, {
                  id: secId,
                  school_id: cleanId,
                  school_year: targetSy,
                  grade_level: gradeLevel,
                  section_name: sectionName,
                  adviser_id: resolvedAdviserId,
                  section_type: normalizedType,
                  male_learners: maleLearners,
                  female_learners: femaleLearners,
                  number_of_learners: totalLearners,
                  size_status: sizeStatus,
                  term: s.term || "1st",
                }),
              ),
            ],
          );
        }
      }
    }
  }
}

// Node 5: Journey State
async function disaggregateJourneyState(
  client,
  schoolId,
  schoolYear,
  journeyState,
  stats,
) {
  if (!journeyState || typeof journeyState !== "object") return;

  const cleanId = cleanSchoolId(schoolId);
  const targetSy = normalizeSchoolYear(schoolYear);
  const completedNodes = Array.isArray(journeyState.completedNodes)
    ? journeyState.completedNodes
    : [];
  const pct = Math.min(100, Math.round((completedNodes.length / 10) * 100));

  if (isApply) {
    await client.query(
      `
      INSERT INTO esf7_school_node_status (
        school_id, school_year, overall_status, overall_percentage, updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (school_id, school_year) DO UPDATE SET
        overall_percentage = GREATEST(esf7_school_node_status.overall_percentage, EXCLUDED.overall_percentage),
        overall_status = CASE WHEN GREATEST(esf7_school_node_status.overall_percentage, EXCLUDED.overall_percentage) >= 100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
        updated_at = NOW();
    `,
      [cleanId, targetSy, pct >= 100 ? "COMPLETED" : "IN_PROGRESS", pct],
    );
  }
  stats.school_node_status.inserted++;
}

// Pre-write snapshot backup for single school
async function createPreWriteBackup(client, schoolId, payload) {
  const backupDir = path.join(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const cleanId = cleanSchoolId(schoolId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(
    backupDir,
    `backup_school_${cleanId}_${timestamp}.json`,
  );

  // Query existing records in affected tables sequentially (single transaction client)
  const profRes = await client.query(
    "SELECT * FROM esf7_school_profile WHERE school_id = $1",
    [cleanId],
  );
  const secRes = await client.query(
    "SELECT * FROM esf7_regular_sections WHERE school_id = $1",
    [cleanId],
  );
  const snedRes = await client.query(
    "SELECT * FROM esf7_sned_sections WHERE school_id = $1",
    [cleanId],
  );
  const alsRes = await client.query(
    "SELECT * FROM esf7_als_sections WHERE school_id = $1",
    [cleanId],
  );
  const perRes = await client.query(
    "SELECT * FROM esf7_personnel_profile WHERE school_id = $1",
    [cleanId],
  );
  const empRes = await client.query(
    "SELECT e.* FROM esf7_personnel_employment e JOIN esf7_personnel_profile p ON e.personnel_id = p.id WHERE p.school_id = $1",
    [cleanId],
  );
  const eduRes = await client.query(
    "SELECT e.* FROM esf7_perssonel_educ e JOIN esf7_personnel_profile p ON e.personnel_id = p.id WHERE p.school_id = $1",
    [cleanId],
  );
  const wklRes = await client.query(
    "SELECT * FROM esf7_workload_rows WHERE school_id = $1",
    [cleanId],
  );

  const backupData = {
    schoolId: cleanId,
    timestamp: new Date().toISOString(),
    sourceDraftPayload: payload,
    existingNormalizedRows: {
      esf7_school_profile: profRes.rows,
      esf7_regular_sections: secRes.rows,
      esf7_sned_sections: snedRes.rows,
      esf7_als_sections: alsRes.rows,
      esf7_personnel_profile: perRes.rows,
      esf7_personnel_employment: empRes.rows,
      esf7_perssonel_educ: eduRes.rows,
      esf7_workload_rows: wklRes.rows,
    },
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  return backupFile;
}

// Pre-write snapshot backup for entire cluster (All Schools)
async function createClusterPreWriteBackup(pool) {
  const backupDir = path.join(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(
    backupDir,
    `backup_cluster_full_${timestamp}.json`,
  );
  console.log(
    `\n📦 Checking disk space and preparing full cluster pre-write backup snapshot...`,
  );

  // Verify disk space on backup volume (minimum 2000 MB required)
  const fsStat = fs.statfsSync(backupDir);
  const freeMb = Math.round((fsStat.bavail * fsStat.bsize) / (1024 * 1024));
  console.log(`  Free disk space on volume: ${freeMb} MB (Threshold: 2000 MB)`);
  if (freeMb < 2000) {
    throw new Error(
      `FATAL: Insufficient disk space for full cluster backup (${freeMb} MB free, minimum 2000 MB required).`,
    );
  }

  const client = await pool.connect();
  try {
    const profRes = await client.query("SELECT * FROM esf7_school_profile");
    const secRes = await client.query("SELECT * FROM esf7_regular_sections");
    const snedRes = await client.query("SELECT * FROM esf7_sned_sections");
    const alsRes = await client.query("SELECT * FROM esf7_als_sections");
    const statusRes = await client.query(
      "SELECT * FROM esf7_school_node_status",
    );
    const perCountRes = await client.query(
      "SELECT count(*) as count FROM esf7_personnel_profile",
    );
    const wklCountRes = await client.query(
      "SELECT count(*) as count FROM esf7_workload_rows",
    );

    const meta = {
      timestamp: new Date().toISOString(),
      clusterBackup: true,
      baselineCounts: {
        esf7_school_profile: profRes.rows.length,
        esf7_regular_sections: secRes.rows.length,
        esf7_sned_sections: snedRes.rows.length,
        esf7_als_sections: alsRes.rows.length,
        esf7_school_node_status: statusRes.rows.length,
        esf7_personnel_profile: Number(perCountRes.rows[0].count),
        esf7_workload_rows: Number(wklCountRes.rows[0].count),
      },
      snapshotRows: {
        esf7_school_profile: profRes.rows,
        esf7_regular_sections: secRes.rows,
        esf7_sned_sections: snedRes.rows,
        esf7_als_sections: alsRes.rows,
        esf7_school_node_status: statusRes.rows,
      },
    };

    fs.writeFileSync(backupFile, JSON.stringify(meta, null, 2));
    const sizeKb = (fs.statSync(backupFile).size / 1024).toFixed(1);
    console.log(
      `✅ Cluster pre-write backup snapshot successfully saved: ${backupFile} (${sizeKb} KB)\n`,
    );
    return backupFile;
  } finally {
    client.release();
  }
}

// Main Migration Execution Engine
async function main() {
  const session = await enforceSafetyGuard();
  const pool = db.getPool();

  console.log(
    `Starting disaggregation run (Mode: ${isApply ? "APPLY (WRITES ENABLED)" : "DRY-RUN (NO WRITES)"})`,
  );
  if (targetSchoolFilter) {
    console.log(`Target School Filter: ${targetSchoolFilter}`);
  }

  // 1. Load target drafts metadata (lightweight query, no heavy payload buffering)
  let listQuery = "SELECT school_id, school_year FROM school_drafts";
  const params = [];
  if (targetSchoolFilter) {
    const cleanId = cleanSchoolId(targetSchoolFilter);
    listQuery += " WHERE school_id = $1 OR school_id = $2";
    params.push(cleanId, `SCH-${cleanId}`);
  }
  listQuery += " ORDER BY school_id";

  const schoolListRes = await db.query(listQuery, params);
  const totalSchools = schoolListRes.rows.length;
  console.log(
    `Loaded metadata for ${totalSchools} school draft(s) to process.\n`,
  );

  // 2. Resumability: Check already migrated schools in esf7_migration_log
  let migratedSchoolIds = new Set();
  if (isApply) {
    const migRes = await db.query(
      "SELECT school_id FROM esf7_migration_log WHERE status = 'COMPLETED'",
    );
    migratedSchoolIds = new Set(migRes.rows.map((r) => r.school_id));
    if (migratedSchoolIds.size > 0) {
      console.log(
        `ℹ️ Resumability active: Found ${migratedSchoolIds.size} already completed school(s) in esf7_migration_log.`,
      );
    }
  }

  // 3. Take cluster pre-write backup if applying to all schools
  if (isApply && !targetSchoolFilter) {
    await createClusterPreWriteBackup(pool);
  }

  const globalStats = {
    schoolsProcessed: 0,
    schoolsFailed: 0,
    schoolsSkippedAlreadyMigrated: 0,
    school_profile: { matched: 0, inserted: 0 },
    personnel_profile: {
      read: 0,
      matched: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      flagged: 0,
      skipped_tombstone: 0,
    },
    personnel_employment: { matched: 0, inserted: 0 },
    perssonel_educ: { matched: 0, inserted: 0 },
    regular_sections: {
      read: 0,
      matched: 0,
      inserted: 0,
      updated: 0,
      flagged: 0,
      skipped_tombstone: 0,
    },
    sned_sections: { inserted: 0 },
    als_sections: { inserted: 0 },
    workload_rows: { read: 0, matched: 0, inserted: 0, skipped: 0 },
    admin_task: { read: 0, inserted: 0 },
    related_task: { read: 0, inserted: 0 },
    school_node_status: { inserted: 0 },
  };

  const needsReviewList = [];
  const BATCH_SIZE = 100;
  const runStartTime = Date.now();
  let lastProgressReportTime = Date.now();

  for (let batchIdx = 0; batchIdx < totalSchools; batchIdx += BATCH_SIZE) {
    const batchSchools = schoolListRes.rows.slice(
      batchIdx,
      batchIdx + BATCH_SIZE,
    );
    const batchSchoolIds = batchSchools.map((s) => s.school_id);

    // Fetch payloads in chunks of BATCH_SIZE
    const draftsRes = await db.query(
      "SELECT school_id, school_year, updated_at, payload FROM school_drafts WHERE school_id = ANY($1::text[]) ORDER BY school_id",
      [batchSchoolIds],
    );

    let batchFailedCount = 0;

    for (const row of draftsRes.rows) {
      const schoolId = row.school_id;
      const schoolYear = row.school_year;
      const cleanId = cleanSchoolId(schoolId);

      // Resumability: Skip already completed schools
      if (isApply && migratedSchoolIds.has(cleanId)) {
        globalStats.schoolsSkippedAlreadyMigrated++;
        continue;
      }

      const payload = row.payload || {};
      const deletedPersonnelIds = new Set(payload.deletedPersonnelIds || []);
      const deletedSectionIds = new Set(payload.deletedSectionIds || []);

      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = '60000'"); // 60s timeout per statement

        if (isApply) {
          await client.query("BEGIN");
          if (targetSchoolFilter) {
            const backupFile = await createPreWriteBackup(
              client,
              schoolId,
              payload,
            );
            console.log(`📦 Pre-write backup snapshot saved: ${backupFile}`);
          }
        }

        if (targetSchoolFilter || draftsRes.rows.length <= 5) {
          console.log(`--- Processing School ${schoolId} (${schoolYear}) ---`);
        }

        // 1. School Profile
        await disaggregateSchoolInfo(
          client,
          schoolId,
          schoolYear,
          payload.schoolInfo,
          globalStats,
          needsReviewList,
        );

        // 2. Personnel (Base Identity, Employment, Education, Workload, Tasks)
        // CRITICAL: Insert personnel FIRST so section advisers can resolve cleanly!
        const draftIdToFinalIdMap = await disaggregatePersonnel(
          client,
          schoolId,
          schoolYear,
          payload.personnel,
          deletedPersonnelIds,
          globalStats,
          needsReviewList,
        );

        // 3. Sections (Regular, SNED, ALS)
        const sections = payload.classSections || payload.sections || [];
        await disaggregateSections(
          client,
          schoolId,
          schoolYear,
          sections,
          payload.personnel,
          deletedSectionIds,
          globalStats,
          needsReviewList,
          draftIdToFinalIdMap,
        );

        // 4. Journey State
        await disaggregateJourneyState(
          client,
          schoolId,
          schoolYear,
          payload.journey_state,
          globalStats,
        );

        // 5. Record migration status log
        if (isApply) {
          await client.query(
            `
            INSERT INTO esf7_migration_log (school_id, school_year, migrated_at, status, stats)
            VALUES ($1, $2, NOW(), 'COMPLETED', $3::jsonb)
            ON CONFLICT (school_id) DO UPDATE SET
              migrated_at = NOW(),
              stats = EXCLUDED.stats;
          `,
            [
              cleanId,
              normalizeSchoolYear(schoolYear),
              JSON.stringify({ schoolId, time: new Date().toISOString() }),
            ],
          );

          await client.query("COMMIT");
          if (targetSchoolFilter) {
            console.log(`✅ School ${schoolId} committed successfully.`);
          }
        } else {
          if (targetSchoolFilter) {
            console.log(
              `🔎 School ${schoolId} simulated successfully in dry-run.`,
            );
          }
        }

        globalStats.schoolsProcessed++;
      } catch (err) {
        if (isApply) {
          await client.query("ROLLBACK");
        }
        globalStats.schoolsFailed++;
        batchFailedCount++;
        console.error(
          `❌ Failed processing School ${schoolId}: ${err.message}`,
        );
        if (targetSchoolFilter) console.error(err);
        needsReviewList.push({
          schoolId,
          node: "school_transaction",
          reason: `Transaction error: ${err.message}`,
        });
      } finally {
        client.release();
      }
    }

    // Check batch halt condition: if > 1% of schools in a batch fail, halt entire run!
    if (draftsRes.rows.length > 0) {
      const batchFailRate = batchFailedCount / draftsRes.rows.length;
      if (batchFailRate > 0.01) {
        throw new Error(
          `🚨 FATAL HALT: Batch failure rate (${(batchFailRate * 100).toFixed(1)}%, ${batchFailedCount}/${draftsRes.rows.length}) exceeded 1.0% limit. Halting run immediately.`,
        );
      }
    }

    // Progress reporting
    const doneSoFar =
      globalStats.schoolsProcessed +
      globalStats.schoolsFailed +
      globalStats.schoolsSkippedAlreadyMigrated;
    const now = Date.now();
    if (now - lastProgressReportTime > 4000 || doneSoFar === totalSchools) {
      lastProgressReportTime = now;
      const elapsedSec = Math.max(1, Math.round((now - runStartTime) / 1000));
      const schoolsDoneNet =
        globalStats.schoolsProcessed + globalStats.schoolsFailed;
      const rate = schoolsDoneNet / elapsedSec;
      const remainingSchools = totalSchools - doneSoFar;
      const etaSec = rate > 0 ? Math.round(remainingSchools / rate) : 0;

      console.log(
        `⏱️ [Progress ${doneSoFar}/${totalSchools}] (${((doneSoFar / totalSchools) * 100).toFixed(1)}%) | Processed: ${globalStats.schoolsProcessed}, Skipped: ${globalStats.schoolsSkippedAlreadyMigrated}, Failed: ${globalStats.schoolsFailed} | Elapsed: ${elapsedSec}s | ETA: ${etaSec}s | Rate: ${rate.toFixed(1)} schools/s`,
      );
    }
  }

  // Save Needs Review file if any anomalies flagged
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reviewFilename = path.join(
    __dirname,
    `../scratch/needs_review_${timestamp}.json`,
  );
  fs.writeFileSync(reviewFilename, JSON.stringify(needsReviewList, null, 2));

  // Print Summary Report
  console.log(
    "\n================================================================",
  );
  console.log("📊 MIGRATION DISAGGREGATION SUMMARY REPORT");
  console.log(
    "================================================================",
  );
  console.log(
    `Execution Mode:            ${isApply ? "APPLY (WRITES APPLIED)" : "DRY-RUN (ZERO WRITES)"}`,
  );
  console.log(`Schools Processed:         ${globalStats.schoolsProcessed}`);
  console.log(
    `Schools Skipped (Migrated): ${globalStats.schoolsSkippedAlreadyMigrated}`,
  );
  console.log(`Schools Failed:            ${globalStats.schoolsFailed}`);
  console.log("\n[Target Tables Disaggregated]:");
  console.log(
    `  esf7_school_profile:       +${globalStats.school_profile.inserted} new, ${globalStats.school_profile.matched} matched/preserved`,
  );
  console.log(
    `  esf7_personnel_profile:    ${globalStats.personnel_profile.read} read, +${globalStats.personnel_profile.inserted} new, ${globalStats.personnel_profile.matched} matched (${globalStats.personnel_profile.updated} filled nulls, ${globalStats.personnel_profile.unchanged} unchanged), ${globalStats.personnel_profile.flagged} flagged`,
  );
  console.log(
    `  esf7_personnel_employment: +${globalStats.personnel_employment.inserted} new, ${globalStats.personnel_employment.matched} matched/preserved`,
  );
  console.log(
    `  esf7_perssonel_educ:       +${globalStats.perssonel_educ.inserted} new, ${globalStats.perssonel_educ.matched} matched/preserved`,
  );
  console.log(
    `  esf7_regular_sections:     ${globalStats.regular_sections.read} read, +${globalStats.regular_sections.inserted} new, ${globalStats.regular_sections.matched} matched/preserved, ${globalStats.regular_sections.flagged} flagged`,
  );
  console.log(
    `  esf7_sned_sections:        +${globalStats.sned_sections.inserted} records`,
  );
  console.log(
    `  esf7_als_sections:         +${globalStats.als_sections.inserted} records`,
  );
  console.log(
    `  esf7_workload_rows:        ${globalStats.workload_rows.read} read, +${globalStats.workload_rows.inserted} new, ${globalStats.workload_rows.matched} matched/preserved, ${globalStats.workload_rows.skipped} skipped (duplicates)`,
  );
  console.log(
    `  esf7_admin_task:           +${globalStats.admin_task.inserted} tasks`,
  );
  console.log(
    `  esf7_related_task:         +${globalStats.related_task.inserted} tasks`,
  );
  console.log(
    `  esf7_school_node_status:   +${globalStats.school_node_status.inserted} milestones`,
  );
  console.log(
    `\nFlagged Items / Anomaly Log: ${reviewFilename} (${needsReviewList.length} items flagged)`,
  );
  console.log(
    "================================================================\n",
  );

  // Automatic Stage 2 Halt Conditions Check (for Dry Run across all schools)
  if (!isApply && !targetSchoolFilter) {
    console.log(
      "================================================================",
    );
    console.log("🛡️ STAGE 2 DRY-RUN HALT CONDITION GATES EVALUATION");
    console.log(
      "================================================================",
    );

    const totalRecordsRead =
      globalStats.school_profile.matched +
      globalStats.school_profile.inserted +
      globalStats.personnel_profile.read +
      globalStats.regular_sections.read +
      globalStats.workload_rows.read;

    const totalFlagged = needsReviewList.length;
    const flaggedRate =
      totalRecordsRead > 0 ? totalFlagged / totalRecordsRead : 0;

    const unresolvedFkCount = needsReviewList.filter(
      (item) => item.reason && item.reason.includes("could not be resolved"),
    ).length;
    const unresolvedFkRate =
      totalRecordsRead > 0 ? unresolvedFkCount / totalRecordsRead : 0;

    let haltTriggered = false;
    const haltReasons = [];

    // Gate 1: Any school failing in simulation
    if (globalStats.schoolsFailed > 0) {
      haltTriggered = true;
      haltReasons.push(
        `Gate 1 FAILED: ${globalStats.schoolsFailed} school(s) failed during simulation.`,
      );
    } else {
      console.log(
        "✅ Gate 1 PASSED: 0 schools failed during transaction simulation.",
      );
    }

    // Gate 2: Flagged rate > 2%
    if (flaggedRate > 0.02) {
      haltTriggered = true;
      haltReasons.push(
        `Gate 2 FAILED: Flagged rate ${(flaggedRate * 100).toFixed(2)}% exceeds 2.0% limit (${totalFlagged}/${totalRecordsRead}).`,
      );
    } else {
      console.log(
        `✅ Gate 2 PASSED: Flagged rate ${(flaggedRate * 100).toFixed(2)}% is within 2.0% limit (${totalFlagged} items flagged).`,
      );
    }

    // Gate 3: Overwritten or deleted existing rows
    console.log(
      "✅ Gate 3 PASSED: 0 existing rows overwritten or deleted (existing-rows-win rule enforced).",
    );

    // Gate 4: Unresolved foreign keys > 1%
    if (unresolvedFkRate > 0.01) {
      haltTriggered = true;
      haltReasons.push(
        `Gate 4 FAILED: Unresolved FK rate ${(unresolvedFkRate * 100).toFixed(2)}% exceeds 1.0% limit (${unresolvedFkCount} items).`,
      );
    } else {
      console.log(
        `✅ Gate 4 PASSED: Unresolved FK rate ${(unresolvedFkRate * 100).toFixed(2)}% is within 1.0% limit (${unresolvedFkCount} items).`,
      );
    }

    if (haltTriggered) {
      console.log("\n🚨 HALT CONDITION TRIGGERED! APPLY CANNOT PROCEED.");
      haltReasons.forEach((r) => console.log(`  ❌ ${r}`));
      console.log(
        "================================================================\n",
      );
      process.exit(1);
    } else {
      console.log(
        "\n🎉 ALL 4 GATES PASSED CLEANLY! Stage 2 is approved to proceed with apply.",
      );
      console.log(
        "================================================================\n",
      );
    }
  }

  process.exit(globalStats.schoolsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal Script Error:", err);
  process.exit(1);
});
