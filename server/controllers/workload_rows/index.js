const express = require("express");
const router = express.Router();
const db = require("../../db");
const { resolvePersonnelId } = require("../personnel/common");
const {
  findBlockedTeachingRows,
  isExemptFromTeachingLock,
  isNonTeaching,
  parseGrades,
} = require("../../utils/teachingAssignments");
const {
  loadTimeAllotment,
  loadSchoolLevel,
  loadTeacherSections,
  loadDuplicateAssignment,
} = require("../../utils/sharedRules");
const {
  validateWorkloadSchedules,
  timeToMins,
} = require("../../utils/scheduleValidator");
const {
  buildExtras,
  reconstructPayload,
} = require("../../utils/workloadPayload");
const { codec } = require("../../utils/payloadExtras");

function sanitizeTime(val) {
  if (!val || typeof val !== "string") return null;
  const m = val.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const mm = m[2];
  const ss = m[3] ? m[3] : "00";
  return `${hh}:${mm}:${ss}`;
}

// esf7_workload_rows keeps typed columns plus a slim `extras` JSONB (keys without a typed column). The old whole-body
// copy in raw_payload is no longer written or read here; see utils/workloadPayload.js.
function formatWorkloadRecord(row) {
  if (!row) return null;
  const raw = row.extras || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level || raw.gradeLevel || raw.grade_level || "",
    grade_level: row.grade_level || raw.gradeLevel || raw.grade_level || "",
    sectionId: row.section_id || raw.sectionId || raw.section_id || null,
    section_id: row.section_id || raw.sectionId || raw.section_id || null,
    sectionName: row.section_name || raw.sectionName || raw.section_name || "",
    section_name: row.section_name || raw.sectionName || raw.section_name || "",
    subject:
      row.subject || raw.subject || raw.subjectName || raw.subject_name || "",
    subjectId: row.subject_id || raw.subjectId || raw.subject_id || null,
    subject_id: row.subject_id || raw.subjectId || raw.subject_id || null,
    remediationSubject:
      row.remediation_subject ||
      raw.remediationSubject ||
      raw.remediation_subject ||
      "",
    remediation_subject:
      row.remediation_subject ||
      raw.remediationSubject ||
      raw.remediation_subject ||
      "",
    startTime: row.start_time
      ? String(row.start_time).substring(0, 5)
      : raw.startTime || null,
    start_time: row.start_time
      ? String(row.start_time).substring(0, 5)
      : raw.startTime || null,
    endTime: row.end_time
      ? String(row.end_time).substring(0, 5)
      : raw.endTime || null,
    end_time: row.end_time
      ? String(row.end_time).substring(0, 5)
      : raw.endTime || null,
    days: row.days || raw.days || ["M", "T", "W", "TH", "F"],
    term: row.term || raw.term || "1st",
    // aliases of the typed `subject` column that the old payload spread supplied on some rows; now always present
    subjectName: raw.subjectName ?? row.subject ?? "",
    subject_name: raw.subject_name ?? row.subject ?? "",
    rawPayload: reconstructPayload(row),
  };
}

const adminTaskPayload = codec("esf7_admin_task");
const relatedTaskPayload = codec("esf7_related_task");

function formatAdminTaskRecord(row) {
  if (!row) return null;
  const raw = row.extras || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    task: row.task_name,
    task_name: row.task_name,
    taskName: row.task_name,
    category: row.task_category || raw.category || "General Administration",
    taskCategory: row.task_category || raw.category || "General Administration",
    startTime: row.start_time
      ? String(row.start_time).substring(0, 5)
      : raw.startTime || "13:00",
    start_time: row.start_time
      ? String(row.start_time).substring(0, 5)
      : raw.startTime || "13:00",
    endTime: row.end_time
      ? String(row.end_time).substring(0, 5)
      : raw.endTime || "14:00",
    end_time: row.end_time
      ? String(row.end_time).substring(0, 5)
      : raw.endTime || "14:00",
    days: row.days || raw.days || ["M", "T", "W", "TH", "F"],
    term: row.term || raw.term || "1st",
    startDate: row.start_date || raw.startDate || null,
    start_date: row.start_date || raw.startDate || null,
    endDate: row.end_date || raw.endDate || null,
    end_date: row.end_date || raw.endDate || null,
    dates: row.dates || raw.dates || [],
    durationMinutes: row.duration_minutes || raw.durationMinutes || 60,
    duration_minutes: row.duration_minutes || raw.durationMinutes || 60,
    termTotalHours: row.term_total_hours
      ? parseFloat(row.term_total_hours)
      : raw.termTotalHours || 0,
    isDesignationSynced: !!row.is_designation_synced,
    is_designation_synced: !!row.is_designation_synced,
    status: row.status || "ACTIVE",
    rawPayload: adminTaskPayload.reconstruct(row),
  };
}

// GET all workload rows for a personnel
router.get("/personnel/:personnel_id", async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT * FROM esf7_workload_rows 
       WHERE personnel_id = $1 
          OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
          OR personnel_id IN (SELECT prn FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
       ORDER BY created_at ASC`,
      [personnel_id],
    );
    res.json(result.rows.map(formatWorkloadRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all administrative tasks (Gantt blocks) for a personnel
router.get("/personnel/:personnel_id/admin-tasks", async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT * FROM esf7_admin_task 
       WHERE personnel_id = $1 
          OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
          OR personnel_id IN (SELECT prn FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
       ORDER BY created_at ASC`,
      [personnel_id],
    );
    res.json(result.rows.map(formatAdminTaskRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET workload rows, one page at a time (keyset pagination on (created_at, id)).
// Query: ?limit=1..500 (default 100) &cursor=<X-Next-Cursor from the previous page>.
// The body stays a plain array. Paging info is in response headers:
//   X-Next-Cursor (absent on the last page), X-Page-Limit, and X-Total-Count (first page only, i.e. when no cursor is sent).
const WORKLOAD_LIST_DEFAULT_LIMIT = 100;
const WORKLOAD_LIST_MAX_LIMIT = 500;
const CURSOR_TS = /^\d{4}-\d{2}-\d{2}[ T][\d:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

function encodeWorkloadCursor(ts, id) {
  return Buffer.from(JSON.stringify([ts, id])).toString("base64url");
}
function decodeWorkloadCursor(cursor) {
  try {
    const [ts, id] = JSON.parse(
      Buffer.from(String(cursor), "base64url").toString("utf8"),
    );
    if (
      typeof ts === "string" &&
      CURSOR_TS.test(ts) &&
      typeof id === "string" &&
      id.length <= 200
    )
      return { ts, id };
  } catch (_e) {
    /* fall through */
  }
  return null;
}

router.get("/", async (req, res) => {
  try {
    const requested = parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(
        Number.isFinite(requested) ? requested : WORKLOAD_LIST_DEFAULT_LIMIT,
        1,
      ),
      WORKLOAD_LIST_MAX_LIMIT,
    );
    let cursor = null;
    if (req.query.cursor) {
      cursor = decodeWorkloadCursor(req.query.cursor);
      if (!cursor) return res.status(400).json({ error: "Invalid cursor" });
    }

    const params = [];
    let where = "";
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      where = "WHERE (created_at, id) > ($1::timestamptz, $2::text)";
    }
    params.push(limit + 1); // one extra row tells us whether a next page exists
    const pageQuery = db.query(
      `SELECT *, created_at::text AS _cursor_ts FROM esf7_workload_rows ${where} ORDER BY created_at ASC, id ASC LIMIT $${params.length}`,
      params,
    );
    const totalQuery = cursor
      ? null
      : db.query("SELECT COUNT(*)::int AS n FROM esf7_workload_rows");
    const [result, total] = await Promise.all([pageQuery, totalQuery]);

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    res.set(
      "Access-Control-Expose-Headers",
      "X-Next-Cursor, X-Total-Count, X-Page-Limit",
    );
    res.set("X-Page-Limit", String(limit));
    if (total) res.set("X-Total-Count", String(total.rows[0].n));
    if (hasMore) {
      const last = rows[rows.length - 1];
      res.set("X-Next-Cursor", encodeWorkloadCursor(last._cursor_ts, last.id));
    }
    res.json(rows.map(({ _cursor_ts, ...row }) => formatWorkloadRecord(row)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Add a new workload row into esf7_workload_rows
router.post("/", async (req, res) => {
  try {
    const {
      personnel_id,
      personnelId,
      school_id,
      schoolId: bodySchoolId,
      school_year,
      schoolYear: bodySchoolYear,
      grade_level,
      gradeLevel,
      section_id,
      sectionId,
      section_name,
      sectionName,
      subject,
      subject_id,
      subjectId,
      remediation_subject,
      remediationSubject,
      start_time,
      startTime,
      end_time,
      endTime,
      days,
    } = req.body;

    const targetPersonnelId = personnel_id || personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: "personnel_id is required" });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId],
    );
    const targetSchoolId =
      school_id ||
      bodySchoolId ||
      (personRes.rows.length > 0 ? personRes.rows[0].school_id : "108348");
    const targetSchoolYear =
      school_year ||
      bodySchoolYear ||
      (personRes.rows.length > 0 ? personRes.rows[0].school_year : "2026-2027");

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_workload_rows`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
    const wklId =
      req.body.id || `WKL-${targetSchoolId.replace("SCH-", "")}-${seq}`;

    const query = `
      INSERT INTO esf7_workload_rows (
        id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
        subject, subject_id, remediation_subject, start_time, end_time, days, extras
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
      RETURNING *;
    `;

    const typedRow = {
      id: wklId,
      personnel_id: targetPersonnelId,
      school_id: targetSchoolId,
      school_year: targetSchoolYear,
      grade_level: grade_level || gradeLevel || null,
      section_id: section_id || sectionId || null,
      section_name: section_name || sectionName || null,
      subject: subject || "MATHEMATICS",
      subject_id: subject_id || subjectId || null,
      remediation_subject: remediation_subject || remediationSubject || null,
      start_time: start_time || startTime || null,
      end_time: end_time || endTime || null,
      days: days || ["M", "T", "W", "TH", "F"],
      term: "1st", // column default; this endpoint has never written the term column
    };
    const values = [
      typedRow.id,
      typedRow.personnel_id,
      typedRow.school_id,
      typedRow.school_year,
      typedRow.grade_level,
      typedRow.section_id,
      typedRow.section_name,
      typedRow.subject,
      typedRow.subject_id,
      typedRow.remediation_subject,
      typedRow.start_time,
      typedRow.end_time,
      JSON.stringify(typedRow.days),
      // only keys without a typed column (or with a different value) are kept, not the whole body
      JSON.stringify(buildExtras(req.body, typedRow)),
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatWorkloadRecord(result.rows[0]));
  } catch (err) {
    console.error("Error inserting esf7_workload_rows:", err);
    res.status(500).json({ error: err.message });
  }
});

// Batch replace workload rows for a personnel (supports PUT/POST /personnel/:personnel_id and POST /bulk)
// Deduplicates by explicit ID and schedule slot to prevent constraint violations and ghost duplicates.
const rowSignature = (r) =>
  [
    r.subject || r.subjectName || r.subject_name || "",
    r.startTime || r.start_time || "",
    r.endTime || r.end_time || "",
    Array.isArray(r.days) ? [...r.days].sort().join(",") : String(r.days || ""),
    r.sectionId || r.section_id || r.sectionName || r.section_name || "",
    r.term || "1st",
  ].join("|");

function dedupeRowsById(rows) {
  const seenIds = new Set();
  const seenSigs = new Set();
  return rows.filter((r) => {
    if (!r) return false;
    const id = r.id ? String(r.id).trim() : "";
    if (id && seenIds.has(id)) return false;

    const sig = rowSignature(r);
    if (seenSigs.has(sig)) return false;

    if (id) seenIds.add(id);
    seenSigs.add(sig);
    return true;
  });
}

// A teaching block may only be saved for a section that belongs to a grade level assigned to the teacher in
// Personnel Profiling (esf7_personnel_employment.grade_levels_taught), or one they advise. Read from the database,
// never from the request. Only new rows, or rows moved to another section, are checked; blocks already saved,
// admin / advisory / HGP / teaching-related blocks, and non-teaching staff are left alone.
async function findSectionsOutsideProfile(
  client,
  personId,
  profileGrades,
  incomingRows,
  existingRows,
  profileRow,
) {
  if (isNonTeaching(profileRow)) return [];
  const savedSection = new Map(
    (existingRows || []).map((r) => [String(r.id), String(r.section_id || "")]),
  );
  const toCheck = incomingRows.filter((r) => {
    if (!r || isExemptFromTeachingLock(r)) return false;
    const sid = String(r.sectionId || r.section_id || "");
    if (!sid) return false;
    return !(r.id && savedSection.get(String(r.id)) === sid);
  });
  if (toCheck.length === 0) return [];

  const sectionIds = [
    ...new Set(toCheck.map((r) => String(r.sectionId || r.section_id))),
  ];
  let secRows = [];
  try {
    const secRes = await client.query(
      `SELECT id, grade_level, section_name, COALESCE(section_type, 'MONO GRADE') AS section_type FROM esf7_regular_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, 'SNED' AS section_type FROM esf7_sned_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, 'ALS' AS section_type FROM esf7_als_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, 'ARAL' AS section_type FROM esf7_aral_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, COALESCE(intervention_type, 'REMEDIAL') AS section_type FROM esf7_remedial_enrichment_sections WHERE id = ANY($1)`,
      [sectionIds],
    );
    secRows = secRes.rows;
  } catch (e) {
    return []; // section tables unavailable: other rules still apply
  }
  const advised = new Set();
  try {
    const advRes = await client.query(
      `SELECT id FROM esf7_regular_sections WHERE id = ANY($1) AND adviser_id = $2`,
      [sectionIds, personId],
    );
    advRes.rows.forEach((r) => advised.add(String(r.id)));
  } catch (e) {}

  const { isSectionMatchingTeacherGrades } = await loadTeacherSections();
  const bySection = new Map(secRows.map((s) => [String(s.id), s]));
  const blocked = [];
  for (const r of toCheck) {
    const sid = String(r.sectionId || r.section_id);
    const sec = bySection.get(sid);
    if (!sec) continue; // unknown section id: nothing to match against
    if (advised.has(sid)) continue;
    const ok =
      profileGrades.length > 0 &&
      isSectionMatchingTeacherGrades(
        {
          gradeLevel: sec.grade_level,
          sectionType: sec.section_type,
          sectionName: sec.section_name,
        },
        profileGrades,
      );
    if (!ok) blocked.push({ id: r.id || null, section: sec });
  }
  return blocked;
}

// The same subject cannot be held by two teachers in one section, term and shared day (the rule the Workload page
// shows as "Duplicate Subject Assignment", from shared/duplicateAssignment.js). Only new or changed rows are checked,
// so older data does not block unrelated edits.
async function findDuplicateAssignments(client, personId, incomingRows) {
  const toCheck = incomingRows.filter(
    (r) => r && !isExemptFromTeachingLock(r) && (r.sectionId || r.section_id),
  );
  if (toCheck.length === 0) return [];
  const sectionIds = [
    ...new Set(toCheck.map((r) => String(r.sectionId || r.section_id))),
  ];
  const dayKey = (d) =>
    (Array.isArray(d) ? d : [])
      .map((x) => String(x).trim().toUpperCase())
      .sort()
      .join(",");
  const sig = (r) =>
    [
      String(r.sectionId || r.section_id || ""),
      String(r.subject || "")
        .trim()
        .toUpperCase(),
      timeToMins(r.startTime || r.start_time),
      timeToMins(r.endTime || r.end_time),
      dayKey(r.days),
      r.term || "1st",
    ].join("|");
  const mineRes = await client.query(
    `SELECT section_id, subject, start_time, end_time, days, term FROM esf7_workload_rows WHERE personnel_id = $1`,
    [personId],
  );
  const saved = new Set(mineRes.rows.map((r) => sig(r)));
  const othersRes = await client.query(
    `SELECT w.section_id, w.section_name, w.grade_level, w.subject, w.days, w.term, w.extras,
            p.first_name, p.last_name
       FROM esf7_workload_rows w
       LEFT JOIN esf7_personnel_profile p ON p.id = w.personnel_id
      WHERE w.section_id = ANY($1) AND w.personnel_id <> $2`,
    [sectionIds, personId],
  );
  const { isDuplicateAssignment } = await loadDuplicateAssignment();
  const found = [];
  for (const row of toCheck) {
    if (saved.has(sig(row))) continue;
    const candidate = {
      sectionId: row.sectionId || row.section_id,
      sectionName: row.sectionName || row.section_name,
      gradeLevel: row.gradeLevel || row.grade_level,
      subject: row.subject,
      term: row.term || "1st",
      days: row.days,
      subjectGradeLevel: row.subjectGradeLevel || row.subject_grade_level,
    };
    for (const o of othersRes.rows) {
      const ex = o.extras || {};
      const other = {
        sectionId: o.section_id,
        sectionName: o.section_name,
        gradeLevel: o.grade_level,
        subject: o.subject,
        term: o.term || "1st",
        days: o.days,
        subjectGradeLevel: ex.subjectGradeLevel || ex.subject_grade_level,
      };
      if (!isDuplicateAssignment(candidate, other)) continue;
      const who =
        `${o.first_name || ""} ${o.last_name || ""}`.trim() ||
        "another teacher";
      found.push({
        rowId: row.id || null,
        message: `Duplicate Subject Assignment: Section "${candidate.sectionName || candidate.sectionId}" already has "${row.subject}" assigned to Teacher ${who} in ${candidate.term} Term.`,
      });
      break;
    }
  }
  return found;
}

// A section holds one class at a time (elementary) or one class per subject (JHS/SHS splits). Rejects a new or
// changed row that overlaps, in the same term, a row another teacher already holds for the same section.
// Rows saved earlier are left alone so legacy data does not block unrelated edits.
async function findSectionClashes(client, personId, incomingRows) {
  const sectionIds = [
    ...new Set(
      incomingRows
        .map((r) => r && (r.sectionId || r.section_id))
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (sectionIds.length === 0) return [];

  const dayList = (d) =>
    (Array.isArray(d) ? d : []).map((x) => String(x).trim().toUpperCase());
  const norm = (r) =>
    [
      String(r.sectionId || r.section_id || ""),
      String(r.subject || "")
        .trim()
        .toUpperCase(),
      timeToMins(r.startTime || r.start_time),
      timeToMins(r.endTime || r.end_time),
      dayList(r.days).sort().join(","),
      r.term || "1st",
    ].join("|");

  const mineRes = await client.query(
    `SELECT section_id, subject, start_time, end_time, days, term FROM esf7_workload_rows WHERE personnel_id = $1`,
    [personId],
  );
  const alreadySaved = new Set(mineRes.rows.map((r) => norm(r)));

  const othersRes = await client.query(
    `SELECT w.section_id, w.grade_level, w.subject, w.start_time, w.end_time, w.days, w.term, w.extras,
            p.first_name, p.last_name
       FROM esf7_workload_rows w
       LEFT JOIN esf7_personnel_profile p ON p.id = w.personnel_id
      WHERE w.section_id = ANY($1) AND w.personnel_id <> $2`,
    [sectionIds, personId],
  );
  const { isSectionSlotClash } = await loadSchoolLevel();
  const isAdvisory = (s) =>
    String(s || "")
      .trim()
      .toUpperCase() === "ADVISORY";
  const perGrade = (r, ex) =>
    String((ex || r).subjectGradeLevel || (ex || r).subject_grade_level || "")
      .trim()
      .toUpperCase();

  const found = [];
  for (const row of incomingRows) {
    if (!row) continue;
    const sectionId = String(row.sectionId || row.section_id || "");
    if (!sectionId || isAdvisory(row.subject) || alreadySaved.has(norm(row)))
      continue;
    const ns = timeToMins(row.startTime || row.start_time);
    const ne = timeToMins(row.endTime || row.end_time);
    if (ns >= 99999 || ne >= 99999 || ns >= ne) continue;
    const days = dayList(row.days);
    const term = row.term || "1st";
    const rowGrade = perGrade(row);

    for (const o of othersRes.rows) {
      if (String(o.section_id) !== sectionId || (o.term || "1st") !== term)
        continue;
      if (isAdvisory(o.subject)) continue;
      const oGrade = perGrade(o, o.extras || {});
      if (rowGrade && oGrade && rowGrade !== oGrade) continue; // multigrade: other grade, same slot
      if (!dayList(o.days).some((d) => days.includes(d))) continue;
      if (!(ns < timeToMins(o.end_time) && ne > timeToMins(o.start_time)))
        continue;
      if (
        !isSectionSlotClash(
          row.gradeLevel || row.grade_level || o.grade_level,
          o.subject,
          row.subject,
        )
      )
        continue;
      const who =
        `${o.first_name || ""} ${o.last_name || ""}`.trim() ||
        "another teacher";
      found.push({
        rowId: row.id || null,
        message: `This section already has ${o.subject} scheduled (${String(o.start_time).slice(0, 5)} – ${String(o.end_time).slice(0, 5)}, assigned to ${who}). Choose a different time or day.`,
      });
      break;
    }
  }
  return found;
}

// Violations (from shared/timeAllotment.js) that involve at least one new or changed incoming row.
async function findTimeAllotmentViolations(
  client,
  personId,
  incomingRows,
  existingRows,
) {
  const incoming = incomingRows.map((r, i) => ({
    ...r,
    id: r.id || `incoming-${i}`,
  }));
  const sectionIds = [
    ...new Set(
      incoming
        .map((r) => r.sectionId || r.section_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (sectionIds.length === 0) return [];

  const { validateTimeAllotment } = await loadTimeAllotment();
  const existingSigs = new Map(
    (existingRows || [])
      .filter((r) => r && r.id)
      .map((r) => [String(r.id), rowSignature(r)]),
  );
  const changedIds = new Set(
    incoming
      .filter((r) => existingSigs.get(String(r.id)) !== rowSignature(r))
      .map((r) => String(r.id)),
  );
  if (changedIds.size === 0) return [];

  let secRes;
  try {
    secRes = await client.query(
      `SELECT id, grade_level, section_name, COALESCE(section_type, 'MONO GRADE') AS section_type FROM esf7_regular_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, 'SNED' AS section_type FROM esf7_sned_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, 'ALS' AS section_type FROM esf7_als_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, 'ARAL' AS section_type FROM esf7_aral_sections WHERE id = ANY($1)
       UNION ALL
       SELECT id, grade_level, section_name, COALESCE(intervention_type, 'REMEDIAL') AS section_type FROM esf7_remedial_enrichment_sections WHERE id = ANY($1)`,
      [sectionIds],
    );
  } catch (secErr) {
    try {
      secRes = await client.query(
        `SELECT id, grade_level, section_name, section_type FROM esf7_class_sections WHERE id = ANY($1)`,
        [sectionIds],
      );
    } catch (fallbackErr) {
      secRes = { rows: [] };
    }
  }
  const othersRes = await client.query(
    `SELECT id, section_id, subject, start_time, end_time, days, term, extras
       FROM esf7_workload_rows WHERE section_id = ANY($1) AND personnel_id <> $2`,
    [sectionIds, personId],
  );
  const others = othersRes.rows.map(({ extras, ...r }) => ({
    ...r,
    term: r.term || "1st",
    subjectGradeLevel:
      extras && (extras.subjectGradeLevel || extras.subject_grade_level),
  }));

  const found = [];
  for (const sec of secRes.rows) {
    const mine = incoming.filter(
      (r) => String(r.sectionId || r.section_id) === String(sec.id),
    );
    const terms = [...new Set(mine.map((r) => r.term || "1st"))];
    for (const t of terms) {
      const combined = [
        ...others.filter(
          (r) => String(r.section_id) === String(sec.id) && r.term === t,
        ),
        ...mine.filter((r) => (r.term || "1st") === t),
      ];
      for (const v of validateTimeAllotment(sec, combined)) {
        if (v.rowIds.some((id) => changedIds.has(String(id)))) found.push(v);
      }
    }
  }
  return found;
}

const saveWorkloadBatchHandler = async (req, res) => {
  const client = await db.getClient();
  try {
    const targetPersonnelId =
      req.params.personnel_id || req.body.personnel_id || req.body.personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: "personnel_id is required" });
    }

    const {
      workloadRows = [],
      workload_rows = [],
      shsWorkloads = null,
      schoolId: bodySchoolId,
      school_id: bodySnakeSchoolId,
      schoolYear: bodySchoolYear,
      school_year: bodySnakeSchoolYear,
    } = req.body;

    const teachingRelatedRows =
      req.body.teachingRelatedRows !== undefined
        ? req.body.teachingRelatedRows
        : req.body.teaching_related_rows;
    const administrativeRows =
      req.body.administrativeRows !== undefined
        ? req.body.administrativeRows
        : req.body.administrative_rows;

    const rowsToSave = dedupeRowsById(
      Array.isArray(workloadRows) && workloadRows.length > 0
        ? workloadRows
        : Array.isArray(workload_rows)
          ? workload_rows
          : [],
    );

    await client.query("BEGIN");
    // Saves for the same teacher run one after another (retry / double submit / two browsers), so each full replace sees the last one's committed rows.
    const idProbe = await client.query(
      "SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1",
      [targetPersonnelId],
    );
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "workload:" +
        (idProbe.rows[0] ? idProbe.rows[0].id : String(targetPersonnelId)),
    ]);
    // Version marker for this teacher's workload; clients compare it to detect data saved from another browser/device.
    const workloadSavedAt = new Date().toISOString();

    // 1. Locate or create personnel profile record to satisfy FK
    const resolvedId = await resolvePersonnelId(client, targetPersonnelId);
    let personRes = await client.query(
      // An exact id match always wins over a legacy id / PRN that happens to be the same text (a numeric legacy id such as
      // "176505" could otherwise pick another person's profile, and the profile grades checked below would be theirs).
      `SELECT id, school_id, school_year FROM esf7_personnel_profile
        WHERE id = $1 OR legacy_id = $1 OR prn = $1 OR id = $2
        ORDER BY (id = $1) DESC, (id = $2) DESC, (school_id = $3) DESC, (prn = $1) DESC
        LIMIT 1`,
      [
        targetPersonnelId,
        resolvedId,
        String(bodySchoolId || bodySnakeSchoolId || "").replace(/^SCH-/i, ""),
      ],
    );

    // Rule: no teaching blocks for a teacher with no classes assigned in Personnel Profiling.
    // Already-saved rows pass through (flagged client-side); only newly added teaching rows are rejected.
    if (personRes.rows.length > 0) {
      const empRes = await client.query(
        `SELECT grade_levels_taught FROM esf7_personnel_employment WHERE personnel_id = $1 LIMIT 1`,
        [personRes.rows[0].id],
      );
      const incomingGrades =
        req.body.assignedGradeLevels ||
        req.body.assigned_grade_levels ||
        req.body.gradeLevelsTaught ||
        req.body.grade_levels_taught;
      const profileForRule = {
        ...personRes.rows[0],
        grade_levels_taught:
          empRes.rows[0] && empRes.rows[0].grade_levels_taught
            ? empRes.rows[0].grade_levels_taught
            : incomingGrades,
      };
      const existingSavedRes = await client.query(
        "SELECT * FROM esf7_workload_rows WHERE personnel_id = $1",
        [personRes.rows[0].id],
      );
      const existingSaved = existingSavedRes.rows;
      const blocked = findBlockedTeachingRows(
        profileForRule,
        rowsToSave,
        existingSaved,
      );
      const outsideProfile = await findSectionsOutsideProfile(
        client,
        personRes.rows[0].id,
        parseGrades(empRes.rows[0] && empRes.rows[0].grade_levels_taught),
        rowsToSave,
        existingSaved,
        profileForRule,
      );
      if (blocked.length === 0 && outsideProfile.length > 0) {
        await client.query("ROLLBACK");
        const first = outsideProfile[0].section;
        return res.status(422).json({
          error: "SECTION_NOT_IN_PROFILE",
          message: `${first.grade_level} — ${first.section_name} is not among the grade levels assigned to this teacher in Personnel Profiling. Update the assignment there first.`,
          blockedRowIds: outsideProfile.map((b) => b.id),
        });
      }
      if (blocked.length > 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          error: "NO_CLASSES_ASSIGNED",
          message:
            "This teacher has no classes assigned. Set assignments in Personnel Profiling before adding teaching blocks.",
          blockedRowIds: blocked.map((r) => r.id || null),
        });
      }
    }

    // Rule: time-allotment limits per subject (shared/scheduleRules.js). The weekly cap spans every teacher of a
    // section, so other teachers' saved rows are loaded. As with the rule above, only new or changed rows can be
    // rejected; rows saved earlier are left alone so legacy data does not block unrelated edits.
    const timeViolations = await findTimeAllotmentViolations(
      client,
      personRes.rows[0] ? personRes.rows[0].id : targetPersonnelId,
      rowsToSave,
      personRes.rows[0]
        ? (personRes.rows[0].extras || {}).workloadRows || []
        : [],
    );
    if (timeViolations.length > 0) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "TIME_ALLOTMENT_VIOLATION",
        message: timeViolations[0].message,
        violations: timeViolations.map((v) => ({
          code: v.code,
          subject: v.subject,
          message: v.message,
        })),
      });
    }

    // Rule: Schedule conflict validation (overlap checking across days & times)
    const scheduleConflict = validateWorkloadSchedules(rowsToSave);
    if (scheduleConflict && scheduleConflict.error) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "SCHEDULE_CONFLICT",
        message: scheduleConflict.error,
      });
    }

    // Rule: a section holds one class at a time; another teacher's saved block for it cannot be overlapped.
    const sectionClashes = await findSectionClashes(
      client,
      personRes.rows[0] ? personRes.rows[0].id : targetPersonnelId,
      rowsToSave,
    );
    if (sectionClashes.length > 0) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "SECTION_SCHEDULE_CONFLICT",
        message: sectionClashes[0].message,
        blockedRowIds: sectionClashes.map((c) => c.rowId),
      });
    }

    // Rule: the same subject cannot be assigned to two teachers in one section (see findDuplicateAssignments).
    const duplicates = await findDuplicateAssignments(
      client,
      personRes.rows[0] ? personRes.rows[0].id : targetPersonnelId,
      rowsToSave,
    );
    if (duplicates.length > 0) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "DUPLICATE_SUBJECT_ASSIGNMENT",
        message: duplicates[0].message,
        blockedRowIds: duplicates.map((d) => d.rowId),
      });
    }

    let targetPersonId = targetPersonnelId;
    let targetSchoolId = bodySchoolId || bodySnakeSchoolId || "108348";
    let targetSchoolYear = bodySchoolYear || bodySnakeSchoolYear || "2026-2027";

    const targetTerm =
      req.body.term ||
      (rowsToSave.length > 0 ? rowsToSave[0].term || "1st" : null);
    const replaceTerms = () =>
      Array.from(
        new Set([
          ...rowsToSave.map((r) => r.term || targetTerm || "1st"),
          ...(req.body.term ? [String(req.body.term)] : []),
        ]),
      );

    if (personRes.rows.length > 0) {
      targetPersonId = personRes.rows[0].id;
      targetSchoolId =
        bodySchoolId ||
        bodySnakeSchoolId ||
        personRes.rows[0].school_id ||
        targetSchoolId;
      targetSchoolYear =
        bodySchoolYear ||
        bodySnakeSchoolYear ||
        personRes.rows[0].school_year ||
        targetSchoolYear;

      await client.query(
        `UPDATE esf7_personnel_profile SET updated_at = NOW() WHERE id = $1`,
        [targetPersonId],
      );
    } else {
      const generatedPrn = String(targetPersonId).startsWith("PRN-")
        ? targetPersonId
        : `PRN-${String(targetPersonId).replace(/^PER-/, "")}`;
      // Baseline profile fallback so foreign key constraint does not fail
      await client.query(
        `
        INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'TEACHER', 'STAFF', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      `,
        [targetPersonId, generatedPrn, targetSchoolId, targetSchoolYear],
      );
    }

    // Clean school ID
    targetSchoolId = String(targetSchoolId).replace("SCH-", "");

    // 2. Delete existing workload rows for this personnel (scoped by terms present in payload to preserve other terms)
    const allTargetPersonIds = Array.from(
      new Set(
        [
          targetPersonId,
          targetPersonnelId,
          resolvedId,
          personRes.rows[0]?.legacy_id,
          personRes.rows[0]?.prn,
        ]
          .filter(Boolean)
          .map(String),
      ),
    );
    const termsInPayload = replaceTerms();
    if (termsInPayload.length > 0) {
      await client.query(
        `DELETE FROM esf7_workload_rows WHERE personnel_id = ANY($1::text[]) AND COALESCE(term, '1st') = ANY($2::text[])`,
        [allTargetPersonIds, termsInPayload],
      );
    } else if (targetTerm) {
      await client.query(
        `DELETE FROM esf7_workload_rows WHERE personnel_id = ANY($1::text[]) AND (term = $2 OR (term IS NULL AND $2 = '1st'))`,
        [allTargetPersonIds, targetTerm],
      );
    } else {
      await client.query(
        `DELETE FROM esf7_workload_rows WHERE personnel_id = ANY($1::text[])`,
        [allTargetPersonIds],
      );
    }

    // 3. Load school sections to resolve and guarantee all section columns (section_id, section_name, grade_level)
    let schoolSections = [];
    try {
      const secRes = await client.query(
        `SELECT id, section_name, grade_level FROM esf7_regular_sections WHERE school_id = $1
         UNION ALL
         SELECT id, section_name, grade_level FROM esf7_sned_sections WHERE school_id = $1
         UNION ALL
         SELECT id, section_name, grade_level FROM esf7_als_sections WHERE school_id = $1
         UNION ALL
         SELECT id, section_name, grade_level FROM esf7_aral_sections WHERE school_id = $1
         UNION ALL
         SELECT id, section_name, grade_level FROM esf7_remedial_enrichment_sections WHERE school_id = $1`,
        [targetSchoolId],
      );
      schoolSections = secRes.rows || [];
    } catch (_secErr) {
      schoolSections = [];
    }

    // 4. Insert each workload row
    const insertedRows = [];
    for (let i = 0; i < rowsToSave.length; i++) {
      const r = rowsToSave[i];
      const seq = String(i + 1).padStart(3, "0");
      const rawId = r.id ? String(r.id).trim() : "";
      const isEphemeral =
        !rawId ||
        rawId.startsWith("new-") ||
        rawId.startsWith("wk-") ||
        rawId.startsWith("incoming-");
      const wklId = !isEphemeral
        ? rawId
        : `WKL-${targetSchoolId}-${targetPersonId.replace("PER-", "").replace("PRN-", "")}-${seq}-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).substring(2, 6)}`;

      let sectionId = r.sectionId || r.section_id || null;
      let sectionName = r.sectionName || r.section_name || "";
      let gradeLevel = r.gradeLevel || r.grade_level || "";

      // Match against school sections if sectionId is provided
      if (sectionId) {
        const matched = schoolSections.find(
          (s) => String(s.id).toLowerCase() === String(sectionId).toLowerCase(),
        );
        if (matched) {
          if (!sectionName) sectionName = matched.section_name;
          if (!gradeLevel) gradeLevel = matched.grade_level;
        }
      }

      // Match against school sections if sectionName is provided
      if (sectionName) {
        const cleanName = sectionName.trim().toLowerCase();
        const matched = schoolSections.find(
          (s) => String(s.section_name).trim().toLowerCase() === cleanName,
        );
        if (matched) {
          if (!sectionId) sectionId = matched.id;
          if (!gradeLevel) gradeLevel = matched.grade_level;
        } else if (!sectionId) {
          const secSlug = sectionName
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 30);
          sectionId = `SEC-${targetSchoolId}-${secSlug || "GEN"}`;
        }
      }

      if (!sectionId) {
        sectionId = `SEC-${targetSchoolId}-GEN`;
      }
      if (!sectionName) {
        sectionName = r.subject || "GENERAL";
      }
      if (!gradeLevel) {
        gradeLevel = r.category?.includes("Elementary") ? "Grade 1" : "Grade 7";
      }

      const subject =
        r.subject || r.subjectName || r.subject_name || "MATHEMATICS";
      let subjectId = r.subjectId || r.subject_id || null;
      if (!subjectId) {
        const subSlug = subject
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 30);
        subjectId = `SUB-${targetSchoolId}-${subSlug || "GEN"}`;
      }

      const remediationSubject =
        r.remediationSubject || r.remediation_subject || null;
      const startTime = sanitizeTime(r.startTime || r.start_time) || "08:00:00";
      const endTime = sanitizeTime(r.endTime || r.end_time) || "09:00:00";
      const rawDays =
        r.days ||
        (r.daySchedule
          ? String(r.daySchedule)
              .split(",")
              .map((s) => s.trim())
          : ["M", "T", "W", "TH", "F"]);
      const days =
        Array.isArray(rawDays) && rawDays.length > 0
          ? rawDays
          : ["M", "T", "W", "TH", "F"];
      const term = r.term || targetTerm || "1st";

      const insertQuery = `
        INSERT INTO esf7_workload_rows (
          id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
          subject, subject_id, remediation_subject, start_time, end_time, days, term, extras, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          personnel_id = EXCLUDED.personnel_id,
          school_id = EXCLUDED.school_id,
          school_year = EXCLUDED.school_year,
          grade_level = EXCLUDED.grade_level,
          section_id = EXCLUDED.section_id,
          section_name = EXCLUDED.section_name,
          subject = EXCLUDED.subject,
          subject_id = EXCLUDED.subject_id,
          remediation_subject = EXCLUDED.remediation_subject,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          days = EXCLUDED.days,
          term = EXCLUDED.term,
          extras = EXCLUDED.extras,
          updated_at = NOW()
        RETURNING *;
      `;

      // typed values as stored; extras keeps only the keys of the incoming row that these do not already hold
      const typedRow = {
        id: wklId,
        personnel_id: targetPersonId,
        school_id: targetSchoolId,
        school_year: targetSchoolYear,
        grade_level: gradeLevel,
        section_id: sectionId,
        section_name: sectionName,
        subject,
        subject_id: subjectId,
        remediation_subject: remediationSubject,
        start_time: startTime,
        end_time: endTime,
        days,
        term,
      };
      const insertValues = [
        wklId,
        targetPersonId,
        targetSchoolId,
        targetSchoolYear,
        gradeLevel,
        sectionId,
        sectionName,
        subject,
        subjectId,
        remediationSubject,
        startTime,
        endTime,
        JSON.stringify(days),
        term,
        JSON.stringify(
          buildExtras(
            {
              ...r,
              id: wklId,
              sectionId,
              sectionName,
              gradeLevel,
              subject,
              subjectId,
              remediationSubject,
              startTime,
              endTime,
              days,
              term,
            },
            typedRow,
          ),
        ),
      ];

      const resRow = await client.query(insertQuery, insertValues);
      insertedRows.push(formatWorkloadRecord(resRow.rows[0]));
    }

    // 4. Also handle SHS workloads if provided or present
    if (shsWorkloads) {
      if (targetTerm) {
        await client.query(
          `DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1 AND (term = $2 OR (term IS NULL AND $2 = '1st'))`,
          [targetPersonId, targetTerm],
        );
      } else {
        await client.query(
          `DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1`,
          [targetPersonId],
        );
      }

      let allShsList = [];
      if (Array.isArray(shsWorkloads)) {
        allShsList = shsWorkloads;
      } else if (typeof shsWorkloads === "object") {
        Object.entries(shsWorkloads).forEach(([tKey, tRows]) => {
          if (Array.isArray(tRows)) {
            tRows.forEach((tr) =>
              allShsList.push({ ...tr, term: tr.term || tKey }),
            );
          }
        });
      }

      for (let sIdx = 0; sIdx < allShsList.length; sIdx++) {
        const sr = allShsList[sIdx];
        const sSeq = String(sIdx + 1).padStart(3, "0");
        const shsId =
          sr.id && !String(sr.id).startsWith("shs-")
            ? String(sr.id)
            : `SHS-WKL-${targetSchoolId}-${targetPersonId.replace("PER-", "")}-${sSeq}`;

        await client.query(
          `
          INSERT INTO esf7_shs_workload_rows (
            id, personnel_id, school_id, school_year, term, semester, grade_level,
            track_strand, shs_subject_category, section_id, section_name,
            subject, subject_id, remediation_subject, start_time, end_time, days, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, days = EXCLUDED.days, updated_at = NOW()
        `,
          [
            shsId,
            targetPersonId,
            targetSchoolId,
            targetSchoolYear,
            sr.term || targetTerm || "1st",
            sr.semester || null,
            sr.gradeLevel || sr.grade_level || "Grade 11",
            sr.trackStrand || sr.track_strand || null,
            sr.shsSubjectCategory ||
              sr.shs_subject_category ||
              sr.category ||
              null,
            sr.sectionId || sr.section_id || null,
            sr.sectionName || sr.section_name || null,
            sr.subject || "GENERAL MATHEMATICS",
            sr.subjectId || sr.subject_id || null,
            sr.remediationSubject || sr.remediation_subject || null,
            sr.startTime || sr.start_time || null,
            sr.endTime || sr.end_time || null,
            JSON.stringify(sr.days || ["M", "T", "W", "TH", "F"]),
          ],
        );
      }
    }

    // 5. Ingest Teaching-Related Tasks (esf7_related_task)
    if (Array.isArray(teachingRelatedRows)) {
      await client.query(
        "DELETE FROM esf7_related_task WHERE personnel_id = ANY($1::text[])",
        [allTargetPersonIds],
      );
      let trCounter = 1;
      for (const tr of teachingRelatedRows) {
        if (!tr || (!tr.task && !tr.task_name && !tr.designationName)) continue;
        const trId = `TRT-${targetSchoolId}-${targetPersonId.split("-").pop()}-${String(trCounter++).padStart(3, "0")}`;
        const tName =
          tr.task ||
          tr.task_name ||
          tr.designationName ||
          "Teaching-Related Task";
        const freq = String(
          tr.cadence || tr.frequency || "weekly",
        ).toLowerCase();

        let durMins = 60;
        if (tr.duration_minutes !== undefined && tr.duration_minutes !== null) {
          durMins = parseInt(tr.duration_minutes, 10) || 60;
        } else if (
          tr.durationMinutes !== undefined &&
          tr.durationMinutes !== null
        ) {
          durMins = parseInt(tr.durationMinutes, 10) || 60;
        } else if (tr.hours !== undefined && tr.hours !== null) {
          durMins = Math.round(parseFloat(tr.hours) * 60) || 60;
        }

        const durHours = durMins / 60;
        let t1Hrs = 0;
        if (freq === "daily") {
          t1Hrs = parseFloat((durHours * 60).toFixed(2));
        } else if (freq === "monthly") {
          t1Hrs = parseFloat((durHours * 3).toFixed(2));
        } else {
          t1Hrs = parseFloat((durHours * 12).toFixed(2));
        }

        const isDesig = !!(
          tr.isDesignationSynced ||
          tr.is_designation_synced ||
          tr.isLocked ||
          tr.isSdsApproved
        );

        await client.query(
          `INSERT INTO esf7_related_task (
             id, personnel_id, school_id, school_year, task_name, frequency,
             duration_minutes, term1_hours, is_designation_synced, extras, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET
             personnel_id = EXCLUDED.personnel_id,
             school_id = EXCLUDED.school_id,
             school_year = EXCLUDED.school_year,
             task_name = EXCLUDED.task_name,
             frequency = EXCLUDED.frequency,
             duration_minutes = EXCLUDED.duration_minutes,
             term1_hours = EXCLUDED.term1_hours,
             is_designation_synced = EXCLUDED.is_designation_synced,
             extras = EXCLUDED.extras,
             updated_at = NOW()`,
          [
            trId,
            targetPersonId,
            targetSchoolId,
            targetSchoolYear,
            tName,
            freq,
            durMins,
            t1Hrs,
            isDesig,
            // only keys without a typed column (or with a different value), not a copy of the whole row
            JSON.stringify(
              relatedTaskPayload.buildExtras(tr, {
                id: trId,
                personnel_id: targetPersonId,
                school_id: targetSchoolId,
                school_year: targetSchoolYear,
                task_name: tName,
                frequency: freq,
                duration_minutes: durMins,
                term1_hours: t1Hrs,
                is_designation_synced: isDesig,
              }),
            ),
          ],
        );
      }
    }

    // 6. Ingest Administrative Tasks (esf7_admin_task)
    if (Array.isArray(administrativeRows)) {
      if (targetTerm) {
        await client.query(
          "DELETE FROM esf7_admin_task WHERE personnel_id = ANY($1::text[]) AND (term = $2 OR (term IS NULL AND $2 = '1st'))",
          [allTargetPersonIds, targetTerm],
        );
      } else {
        await client.query(
          "DELETE FROM esf7_admin_task WHERE personnel_id = ANY($1::text[])",
          [allTargetPersonIds],
        );
      }
      let admCounter = 1;
      for (const adm of administrativeRows) {
        if (!adm || (!adm.task && !adm.task_name && !adm.name && !adm.subject))
          continue;
        const admId = `ADM-${targetSchoolId}-${targetPersonId.split("-").pop()}-${String(admCounter++).padStart(3, "0")}`;
        const tName =
          adm.task ||
          adm.task_name ||
          adm.name ||
          adm.subject ||
          "Administrative Task";
        const datesArr = Array.isArray(adm.dates)
          ? adm.dates
          : adm.taskDate
            ? [adm.taskDate]
            : adm.date
              ? [adm.date]
              : [];
        const category =
          adm.category ||
          adm.taskCategory ||
          adm.task_category ||
          "General Administration";
        const term = adm.term || targetTerm || "1st";
        const days = Array.isArray(adm.days)
          ? adm.days
          : ["M", "T", "W", "TH", "F"];
        const startTime = adm.startTime || adm.start_time || null;
        const endTime = adm.endTime || adm.end_time || null;
        const startDate = adm.startDate || adm.start_date || null;
        const endDate = adm.endDate || adm.end_date || null;

        let durMins = 60;
        if (
          adm.duration_minutes !== undefined &&
          adm.duration_minutes !== null
        ) {
          durMins = parseInt(adm.duration_minutes, 10) || 60;
        } else if (
          adm.durationMinutes !== undefined &&
          adm.durationMinutes !== null
        ) {
          durMins = parseInt(adm.durationMinutes, 10) || 60;
        } else if (adm.minutes !== undefined && adm.minutes !== null) {
          durMins = parseInt(adm.minutes, 10) || 60;
        } else if (adm.hours !== undefined && adm.hours !== null) {
          durMins = Math.round(parseFloat(adm.hours) * 60) || 60;
        } else if (startTime && endTime) {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            durMins = Math.max(15, eh * 60 + em - (sh * 60 + sm));
          }
        }

        const daysCount = days.length > 0 ? days.length : 5;
        const weeklyHours = (durMins / 60) * daysCount;
        const termTotalHours = parseFloat((weeklyHours * 12).toFixed(2));
        const isDesig = !!(
          adm.isDesignationSynced || adm.is_designation_synced
        );

        await client.query(
          `INSERT INTO esf7_admin_task (
             id, personnel_id, school_id, school_year, task_name, task_category,
             start_date, end_date, start_time, end_time, days, dates, term,
             duration_minutes, term_total_hours, is_designation_synced, status,
             extras, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET
             personnel_id = EXCLUDED.personnel_id,
             school_id = EXCLUDED.school_id,
             school_year = EXCLUDED.school_year,
             task_name = EXCLUDED.task_name,
             task_category = EXCLUDED.task_category,
             start_date = EXCLUDED.start_date,
             end_date = EXCLUDED.end_date,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             days = EXCLUDED.days,
             dates = EXCLUDED.dates,
             term = EXCLUDED.term,
             duration_minutes = EXCLUDED.duration_minutes,
             term_total_hours = EXCLUDED.term_total_hours,
             is_designation_synced = EXCLUDED.is_designation_synced,
             status = EXCLUDED.status,
             extras = EXCLUDED.extras,
             updated_at = NOW()`,
          [
            admId,
            targetPersonId,
            targetSchoolId,
            targetSchoolYear,
            tName,
            category,
            startDate,
            endDate,
            startTime,
            endTime,
            JSON.stringify(days),
            JSON.stringify(datesArr),
            term,
            durMins,
            termTotalHours,
            isDesig,
            "ACTIVE",
            JSON.stringify(
              adminTaskPayload.buildExtras(adm, {
                id: admId,
                personnel_id: targetPersonId,
                school_id: targetSchoolId,
                school_year: targetSchoolYear,
                task_name: tName,
                task_category: category,
                start_date: startDate,
                end_date: endDate,
                start_time: startTime,
                end_time: endTime,
                days,
                dates: datesArr,
                term,
                duration_minutes: durMins,
                term_total_hours: termTotalHours,
                is_designation_synced: isDesig,
                status: "ACTIVE",
              }),
            ),
          ],
        );
      }
    }

    // Zero (or fewer) rows written for rows that were sent is a failure, never a quiet success: roll everything back.
    if (insertedRows.length !== rowsToSave.length) {
      throw new Error(
        `Workload save wrote ${insertedRows.length} of ${rowsToSave.length} rows for ${targetPersonId}; nothing was saved.`,
      );
    }

    await client.query("COMMIT");
    res.json({
      success: true,
      message: `Saved ${insertedRows.length} workload rows for personnel ${targetPersonId} successfully.`,
      rowsRequested: rowsToSave.length,
      rowsWritten: insertedRows.length,
      count: insertedRows.length,
      workloadSavedAt,
      data: insertedRows,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating personnel workload rows:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

router.put("/personnel/:personnel_id", saveWorkloadBatchHandler);
router.post("/personnel/:personnel_id", saveWorkloadBatchHandler);
router.post("/bulk", saveWorkloadBatchHandler);
router.put("/bulk", saveWorkloadBatchHandler);

// PUT Update an existing workload row
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      grade_level,
      gradeLevel,
      section_id,
      sectionId,
      section_name,
      sectionName,
      subject,
      subject_id,
      subjectId,
      remediation_subject,
      remediationSubject,
      start_time,
      startTime,
      end_time,
      endTime,
      days,
    } = req.body;

    const existingRes = await db.query(
      `SELECT * FROM esf7_workload_rows WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: `Workload row ${id} not found` });
    }

    const current = existingRes.rows[0];
    const baseExtras = current.extras || {};
    const fill = {};
    const nextColumns = {
      grade_level: grade_level || gradeLevel || fill.grade_level || null,
      section_id: section_id || sectionId || fill.section_id || null,
      section_name: section_name || sectionName || fill.section_name || null,
      subject: subject || fill.subject || null,
      subject_id: subject_id || subjectId || fill.subject_id || null,
      remediation_subject:
        remediation_subject ||
        remediationSubject ||
        fill.remediation_subject ||
        null,
      start_time: start_time || startTime || fill.start_time || null,
      end_time: end_time || endTime || fill.end_time || null,
      days: days || null,
    };
    // typed values as they will be stored (same COALESCE rule as the UPDATE below)
    const after = { ...current };
    for (const [col, v] of Object.entries(nextColumns)) {
      if (v !== null && v !== undefined) after[col] = v;
    }
    const nextExtras = buildExtras({ ...baseExtras, ...req.body }, after);

    const query = `
      UPDATE esf7_workload_rows
      SET
        grade_level = COALESCE($1, grade_level),
        section_id = COALESCE($2, section_id),
        section_name = COALESCE($3, section_name),
        subject = COALESCE($4, subject),
        subject_id = COALESCE($5, subject_id),
        remediation_subject = COALESCE($6, remediation_subject),
        start_time = COALESCE($7, start_time),
        end_time = COALESCE($8, end_time),
        days = COALESCE($9::jsonb, days),
        extras = $10::jsonb,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *;
    `;

    const values = [
      nextColumns.grade_level,
      nextColumns.section_id,
      nextColumns.section_name,
      nextColumns.subject,
      nextColumns.subject_id,
      nextColumns.remediation_subject,
      nextColumns.start_time,
      nextColumns.end_time,
      days ? JSON.stringify(days) : null,
      JSON.stringify(nextExtras),
      id,
    ];

    const result = await db.query(query, values);
    res.json(formatWorkloadRecord(result.rows[0]));
  } catch (err) {
    console.error("Error updating esf7_workload_rows:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows for a personnel
router.delete("/personnel/:personnel_id", async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const aliases = [personnel_id];
    const profRes = await db
      .query(
        `SELECT id, legacy_id, prn, employee_no FROM esf7_personnel_profile WHERE id::text = $1 OR legacy_id = $1 OR prn = $1`,
        [personnel_id],
      )
      .catch(() => ({ rows: [] }));
    if (profRes.rows.length > 0) {
      const r = profRes.rows[0];
      if (r.id) aliases.push(String(r.id));
      if (r.legacy_id) aliases.push(String(r.legacy_id));
      if (r.prn) aliases.push(String(r.prn));
      if (r.employee_no) aliases.push(String(r.employee_no));
    }
    const uniqueAliases = Array.from(new Set(aliases.filter(Boolean)));

    const executeDelete = async (pool) => {
      if (!pool || !pool.query) return;
      await Promise.all([
        pool
          .query(
            `DELETE FROM esf7_workload_rows WHERE personnel_id = ANY($1::text[])`,
            [uniqueAliases],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_workload_row WHERE personnel_id = ANY($1::text[])`,
            [uniqueAliases],
          )
          .catch(() => {}),
        pool
          .query(
            `DELETE FROM esf7_shs_workload_rows WHERE personnel_id = ANY($1::text[])`,
            [uniqueAliases],
          )
          .catch(() => {}),
      ]);
    };

    await executeDelete(db);
    if (db.getStagingPool) await executeDelete(db.getStagingPool());
    if (db.getProdPool) await executeDelete(db.getProdPool());

    res.json({
      success: true,
      message: `All workload rows for personnel ${personnel_id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows in a school
router.delete("/school/:school_id", async (req, res) => {
  try {
    const { school_id } = req.params;
    await db.query(`DELETE FROM esf7_workload_rows WHERE school_id = $1`, [
      school_id,
    ]);
    res.json({
      success: true,
      message: `All workload rows for school ${school_id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows (bulk clear)
router.delete("/clear-all", async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_workload_rows`);
    res.json({
      success: true,
      message: "All workload rows deleted successfully.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a specific workload row by ID
router.delete("/:id", async (req, res) => {
  try {
    const rowRes = await db.query(
      `SELECT personnel_id FROM esf7_workload_rows WHERE id = $1`,
      [req.params.id],
    );
    const pId = rowRes.rows.length > 0 ? rowRes.rows[0].personnel_id : null;

    await db.query(`DELETE FROM esf7_workload_rows WHERE id = $1`, [
      req.params.id,
    ]);
    const workloadSavedAt = new Date().toISOString();

    if (pId) {
      await db.query(
        `UPDATE esf7_personnel_profile SET updated_at = NOW() WHERE id = $1`,
        [pId],
      );
    }

    res.json({
      success: true,
      workloadSavedAt,
      message: `Workload row ${req.params.id} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────── Source-of-truth reads and term-scoped clears ─────────────────────────
const cleanSchool = (v) =>
  String(v || "")
    .replace(/^SCH-/i, "")
    .trim();

// The school is always named in the query (?schoolId=...) so the auth gate can check it against the login token.
function requireSchoolQuery(req, res) {
  const schoolId = cleanSchool(req.query.schoolId || req.query.school_id);
  if (!schoolId) {
    res.status(400).json({ error: "schoolId is required" });
    return null;
  }
  return schoolId;
}

// Loads the teacher and confirms they belong to the named school. Returns null after sending the error response.
async function loadTeacherInSchool(runner, res, personnelId, schoolId) {
  const resolvedId = await resolvePersonnelId(runner, personnelId);
  const r = await runner.query(
    `SELECT id, school_id, updated_at FROM esf7_personnel_profile WHERE id = $1 OR legacy_id = $1 OR prn = $1 OR id = $2 LIMIT 1`,
    [personnelId, resolvedId],
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Personnel not found" });
    return null;
  }
  if (cleanSchool(r.rows[0].school_id) !== schoolId) {
    res
      .status(403)
      .json({ error: "This teacher does not belong to the named school." });
    return null;
  }
  return r.rows[0];
}

// GET one teacher's saved workload for a term plus the version marker the page uses to detect newer saved data.
router.get("/personnel/:personnel_id/state", async (req, res) => {
  try {
    const schoolId = requireSchoolQuery(req, res);
    if (!schoolId) return;
    const teacher = await loadTeacherInSchool(
      db,
      res,
      req.params.personnel_id,
      schoolId,
    );
    if (!teacher) return;
    const term = req.query.term ? String(req.query.term) : null;
    const result = term
      ? await db.query(
          `SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2 ORDER BY created_at ASC`,
          [teacher.id, term],
        )
      : await db.query(
          `SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`,
          [teacher.id],
        );
    const maxRowUpdated = result.rows.reduce((latest, r) => {
      const rowDate = r.updated_at || r.created_at;
      if (!rowDate) return latest;
      return !latest || new Date(rowDate) > new Date(latest) ? rowDate : latest;
    }, null);
    const latestVersion = maxRowUpdated || teacher.updated_at || null;
    const version = latestVersion
      ? new Date(latestVersion).toISOString()
      : null;
    res.json({
      personnelId: teacher.id,
      term,
      version,
      rows: result.rows.map(formatWorkloadRecord),
    });
  } catch (err) {
    console.error("[Workload State GET Error]:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE one teacher's rows for one term (workload rows, SHS rows, and the copy in the profile payload).
router.delete("/personnel/:personnel_id/term/:term", async (req, res) => {
  const client = await db.getClient();
  try {
    const schoolId = requireSchoolQuery(req, res);
    if (!schoolId) return;
    const term = String(req.params.term);
    await client.query("BEGIN");
    const teacher = await loadTeacherInSchool(
      client,
      res,
      req.params.personnel_id,
      schoolId,
    );
    if (!teacher) {
      await client.query("ROLLBACK");
      return;
    }
    const workloadSavedAt = new Date().toISOString();
    const del = await client.query(
      `DELETE FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2`,
      [teacher.id, term],
    );
    await client.query(
      `DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2`,
      [teacher.id, term],
    );
    await client.query(
      `UPDATE esf7_personnel_profile SET updated_at = NOW() WHERE id = $1`,
      [teacher.id],
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      deleted: del.rowCount,
      term,
      workloadSavedAt,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      /* already rolled back */
    }
    console.error("[Workload term clear (teacher) Error]:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE every teacher's rows for one term in the named school (other terms and other schools are untouched).
router.delete("/term-clear/school", async (req, res) => {
  const client = await db.getClient();
  try {
    const schoolId = requireSchoolQuery(req, res);
    if (!schoolId) return;
    const term = req.query.term ? String(req.query.term) : "";
    if (!term) return res.status(400).json({ error: "term is required" });
    const ids = [schoolId, `SCH-${schoolId}`];
    const workloadSavedAt = new Date().toISOString();
    await client.query("BEGIN");
    const del = await client.query(
      `DELETE FROM esf7_workload_rows WHERE school_id = ANY($1::text[]) AND COALESCE(term, '1st') = $2`,
      [ids, term],
    );
    await client.query(
      `DELETE FROM esf7_shs_workload_rows WHERE school_id = ANY($1::text[]) AND COALESCE(term, '1st') = $2`,
      [ids, term],
    );
    const upd = await client.query(
      `UPDATE esf7_personnel_profile SET updated_at = NOW() WHERE school_id = ANY($1::text[])`,
      [ids],
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      deleted: del.rowCount,
      teachers: upd.rowCount,
      term,
      workloadSavedAt,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      /* already rolled back */
    }
    console.error("[Workload term clear (school) Error]:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.formatWorkloadRecord = formatWorkloadRecord;
module.exports = router;
