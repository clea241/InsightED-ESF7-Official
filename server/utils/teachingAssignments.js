// Rule: a teaching / teaching-related teacher with no classes assigned in Personnel Profiling
// cannot have teaching workload blocks persisted. Admin / relieving-duty blocks are unaffected.

const NON_TEACHING_POSITION_HINTS = [
  'ADMINISTRATIVE', 'ADAS', 'ADA ', 'UTILITY', 'CLERK', 'GUARD', 'NURSE', 'DRIVER',
  'BOOKKEEPER', 'DISBURSING', 'SECURITY', 'ACCOUNTANT', 'AIDE'
];

function parseGrades(raw) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { raw = raw.split(',').map(s => s.trim()); }
  }
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function getAssignedGrades(profileRow) {
  if (!profileRow) return [];
  const raw = profileRow.raw_payload || {};
  const candidates = [
    profileRow.grade_levels_taught,
    raw.assignedGradeLevels, raw.assigned_grade_levels, raw.gradeLevelsTaught, raw.grade_levels_taught
  ];
  for (const c of candidates) {
    const g = parseGrades(c);
    if (g.length > 0) return g;
  }
  return [];
}

function isNonTeaching(profileRow) {
  const raw = (profileRow && profileRow.raw_payload) || {};
  const type = String(raw.type || '').toLowerCase().trim();
  const cat = String(raw.positionCategory || raw.position_category || '').toUpperCase().trim();
  if (type === 'non-teaching' || cat.includes('NON-TEACHING')) return true;
  const pos = String(raw.position || raw.plantilla_position || profileRow.position || '').toUpperCase();
  return NON_TEACHING_POSITION_HINTS.some(h => pos.includes(h));
}

function isAdminRow(row) {
  if (!row) return false;
  if (row.is_admin_task || row.isAdminTask) return true;
  return String(row.subject || row.task || row.task_name || '').toUpperCase().includes('ADMIN');
}

function isTeachingPlotLocked(profileRow) {
  return !!profileRow && !isNonTeaching(profileRow) && getAssignedGrades(profileRow).length === 0;
}

// Teaching rows that would be newly persisted. Rows already saved (same id) are kept as-is
// so legacy data is flagged for the user rather than silently deleted.
function findBlockedTeachingRows(profileRow, incomingRows, existingRows) {
  if (!isTeachingPlotLocked(profileRow)) return [];
  const existingIds = new Set((existingRows || []).map(r => String(r.id)));
  return (incomingRows || []).filter(r => !isAdminRow(r) && !(r.id && existingIds.has(String(r.id))));
}

module.exports = { getAssignedGrades, isTeachingPlotLocked, findBlockedTeachingRows };
