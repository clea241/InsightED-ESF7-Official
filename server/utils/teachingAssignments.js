// Rule: a teaching / teaching-related teacher with no classes assigned in Personnel Profiling
// cannot have teaching workload blocks persisted. Admin / relieving-duty / advisory / HGP blocks are unaffected.

const NON_TEACHING_POSITION_HINTS = [
  "ADMINISTRATIVE",
  "ADAS",
  "ADA ",
  "UTILITY",
  "CLERK",
  "GUARD",
  "NURSE",
  "DRIVER",
  "BOOKKEEPER",
  "DISBURSING",
  "SECURITY",
  "ACCOUNTANT",
  "AIDE",
];

function parseGrades(raw) {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      raw = raw.split(",").map((s) => s.trim());
    }
  }
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function getAssignedGrades(profileRow, existingRows) {
  if (!profileRow) return [];
  const raw = profileRow.extras || {};
  const candidates = [
    profileRow.grade_levels_taught,
    raw.assignedGradeLevels,
    raw.assigned_grade_levels,
    raw.gradeLevelsTaught,
    raw.grade_levels_taught,
  ];
  for (const c of candidates) {
    const g = parseGrades(c);
    if (g.length > 0) return g;
  }
  // Fallback: check existing saved workload rows for grade levels
  if (Array.isArray(existingRows)) {
    const gradesFromRows = existingRows
      .map((r) => r && (r.grade_level || r.gradeLevel))
      .filter(Boolean);
    if (gradesFromRows.length > 0) {
      return Array.from(new Set(gradesFromRows));
    }
  }
  return [];
}

function isNonTeaching(profileRow) {
  const raw = (profileRow && profileRow.extras) || {};
  const type = String(raw.type || (profileRow && profileRow.type) || "")
    .toLowerCase()
    .trim();
  const cat = String(
    raw.positionCategory ||
      raw.position_category ||
      (profileRow && profileRow.position_category) ||
      "",
  )
    .toUpperCase()
    .trim();
  if (type === "non-teaching" || cat.includes("NON-TEACHING")) return true;
  const pos = String(
    raw.position ||
      raw.plantilla_position ||
      (profileRow && profileRow.position) ||
      "",
  ).toUpperCase();
  return NON_TEACHING_POSITION_HINTS.some((h) => pos.includes(h));
}

function isAdminRow(row) {
  if (!row) return false;
  if (row.is_admin_task || row.isAdminTask) return true;
  return String(row.subject || row.task || row.task_name || "")
    .toUpperCase()
    .includes("ADMIN");
}

function isExemptFromTeachingLock(row) {
  if (!row) return false;
  if (isAdminRow(row)) return true;
  if (row.is_admin_task || row.isAdminTask) return true;
  if (row.is_teaching_related || row.isTeachingRelated) return true;
  const id = String(row.id || "").toLowerCase();
  if (
    id.startsWith("wk-adv-") ||
    id.startsWith("wk-hgp-") ||
    id.startsWith("wk-tr-") ||
    id.startsWith("wk-adm-")
  ) {
    return true;
  }
  const subj = String(
    row.subject || row.subjectName || row.task || row.task_name || "",
  )
    .toUpperCase()
    .trim();
  if (
    subj === "ADVISORY" ||
    subj === "CLASS ADVISING" ||
    subj === "CLASS ADVISORY" ||
    subj === "HGP" ||
    subj === "HOMEROOM GUIDANCE" ||
    subj === "HOMEROOM GUIDANCE PROGRAM" ||
    subj.includes("RELIEVING")
  ) {
    return true;
  }
  return false;
}

function isTeachingPlotLocked(profileRow, existingRows) {
  return (
    !!profileRow &&
    !isNonTeaching(profileRow) &&
    getAssignedGrades(profileRow, existingRows).length === 0
  );
}

// Teaching rows that would be newly persisted. Rows already saved (same id),
// or non-teaching blocks (admin, advisory, HGP, teaching-related) are exempt.
function findBlockedTeachingRows(profileRow, incomingRows, existingRows) {
  if (!isTeachingPlotLocked(profileRow, existingRows)) return [];
  const existingIds = new Set((existingRows || []).map((r) => String(r.id)));
  return (incomingRows || []).filter(
    (r) =>
      !isExemptFromTeachingLock(r) && !(r.id && existingIds.has(String(r.id))),
  );
}

module.exports = {
  parseGrades,
  isNonTeaching,
  getAssignedGrades,
  isTeachingPlotLocked,
  findBlockedTeachingRows,
  isExemptFromTeachingLock,
};
