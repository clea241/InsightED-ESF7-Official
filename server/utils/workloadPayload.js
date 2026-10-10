// esf7_workload_rows: typed columns + a slim `extras` JSONB instead of a copy of the whole request body in `raw_payload`.
// `extras` holds only keys that have no typed column (task, rowType, category, daySchedule, ...) and any alias key whose
// value differs from the typed column. Used by every writer, by the reader (formatters), by the backfill and by the verifier.

// payload key -> [typed column, kind]
const ALIAS_LIST = [
  ["id", "id", "text"],
  ["personnelId", "personnel_id", "text"],
  ["personnel_id", "personnel_id", "text"],
  ["schoolId", "school_id", "text"],
  ["school_id", "school_id", "text"],
  ["schoolYear", "school_year", "text"],
  ["school_year", "school_year", "text"],
  ["gradeLevel", "grade_level", "text"],
  ["grade_level", "grade_level", "text"],
  ["sectionId", "section_id", "text"],
  ["section_id", "section_id", "text"],
  ["sectionName", "section_name", "text"],
  ["section_name", "section_name", "text"],
  ["subject", "subject", "text"],
  ["subjectName", "subject", "text"],
  ["subject_name", "subject", "text"],
  ["subjectId", "subject_id", "text"],
  ["subject_id", "subject_id", "text"],
  ["remediationSubject", "remediation_subject", "text"],
  ["remediation_subject", "remediation_subject", "text"],
  ["startTime", "start_time", "time"],
  ["start_time", "start_time", "time"],
  ["endTime", "end_time", "time"],
  ["end_time", "end_time", "time"],
  ["days", "days", "json"],
  ["term", "term", "text"],
];
const ALIASES = new Map(
  ALIAS_LIST.map(([key, col, kind]) => [key, { col, kind }]),
);

// When a typed column is empty and the legacy payload has a value, the value moves into the column (same order the
// old formatter used as fallback: camelCase, then snake_case).
const FILL_ORDER = {
  grade_level: ["gradeLevel", "grade_level"],
  section_id: ["sectionId", "section_id"],
  section_name: ["sectionName", "section_name"],
  subject: ["subject", "subjectName", "subject_name"],
  subject_id: ["subjectId", "subject_id"],
  remediation_subject: ["remediationSubject", "remediation_subject"],
  start_time: ["startTime", "start_time"],
  end_time: ["endTime", "end_time"],
};

// Echo keys that are never stored (they would nest the previous payload inside the new one).
const ECHO_KEYS = new Set(["rawPayload", "raw_payload", "extras"]);
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const isEmpty = (v) => v === null || v === undefined || v === "";

function deepEqual(a, b) {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]),
  );
}

const hhmm = (t) => String(t).slice(0, 5);
const hhmmss = (t) => (String(t).length === 5 ? `${t}:00` : String(t));

/** Strict rule: payload value `v` is already stored in the typed column value `col`. */
function sameAsColumn(kind, v, col) {
  if (v === null || v === undefined) return col === null || col === undefined;
  if (col === null || col === undefined) return false;
  if (kind === "json") return deepEqual(v, col);
  if (typeof v !== "string") return false;
  if (kind === "time") return v === hhmm(col) || v === hhmmss(col);
  return v === String(col);
}

/**
 * Keys of `source` (a request body or legacy payload) that the typed values in `row` do not already hold.
 * `row` holds the typed values as stored: id, personnel_id, ..., start_time, end_time, days, term.
 */
function buildExtras(source, row, { dropEcho = true } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(source || {})) {
    if (v === undefined) continue;
    if (dropEcho && ECHO_KEYS.has(k)) continue;
    const a = ALIASES.get(k);
    if (a && sameAsColumn(a.kind, v, row[a.col])) continue;
    out[k] = v;
  }
  return out;
}

/** Backfill split for one legacy row: typed-column fills (only into empty columns) plus the extras. */
function splitLegacyPayload(payload, row) {
  const p =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  const typed = { ...row };
  const fills = {};
  for (const [col, keys] of Object.entries(FILL_ORDER)) {
    if (!isEmpty(typed[col])) continue;
    for (const k of keys) {
      const v = p[k];
      if (typeof v !== "string" || v === "") continue;
      if ((col === "start_time" || col === "end_time") && !TIME_RE.test(v))
        continue;
      fills[col] = v;
      typed[col] = v;
      break;
    }
  }
  return { fills, extras: buildExtras(p, typed, { dropEcho: false }) };
}

/** True when every key/value of the legacy payload is held by the typed columns or by extras. Returns the keys that are not. */
function unaccountedKeys(payload, row) {
  const extras = row.extras || {};
  const missing = [];
  for (const [k, v] of Object.entries(payload || {})) {
    const a = ALIASES.get(k);
    if (a && sameAsColumn(a.kind, v, row[a.col])) continue;
    if (
      Object.prototype.hasOwnProperty.call(extras, k) &&
      deepEqual(extras[k], v)
    )
      continue;
    missing.push(k);
  }
  return missing;
}

/**
 * What the old `raw_payload` looked like, rebuilt from typed columns + extras. The eight keys every old payload carried
 * come from the columns; extras (which win) add everything else. Other alias spellings (snake_case copies) are regenerated by the formatters.
 */
function reconstructPayload(row) {
  const t = (c) => (c === null || c === undefined ? null : hhmm(c));
  return {
    id: row.id,
    gradeLevel: row.grade_level ?? null,
    sectionId: row.section_id ?? null,
    sectionName: row.section_name ?? null,
    subject: row.subject ?? null,
    startTime: t(row.start_time),
    endTime: t(row.end_time),
    days: row.days ?? null,
    ...(row.extras || {}),
  };
}

module.exports = {
  ALIASES,
  ALIAS_LIST,
  FILL_ORDER,
  ECHO_KEYS,
  buildExtras,
  splitLegacyPayload,
  unaccountedKeys,
  reconstructPayload,
  sameAsColumn,
  deepEqual,
};
