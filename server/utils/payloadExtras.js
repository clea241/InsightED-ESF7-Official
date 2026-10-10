// Generic "typed columns + slim extras" codec for tables that used to keep a whole copy of the request body in raw_payload.
// (esf7_workload_rows uses the older, table-specific utils/workloadPayload.js.)
//
// extras = the keys of the incoming body that no typed column already holds (or holds with a different value). A key counts as
// "held by a column" when it is the column name or its camelCase spelling (or a listed extra alias) AND the value is strictly equal.
// Nothing is filled into columns: a differing or empty value simply stays in extras, so the change is lossless.

// column kinds: text | num | bool | json | time | skip (dates/timestamps: only null == null counts as equal)
const TABLES = {
  esf7_personnel_allowances: {
    columns: {
      id: "text",
      personnel_id: "text",
      school_id: "text",
      school_year: "text",
      has_pera: "bool",
      pera_amount: "num",
      has_uniform: "bool",
      uniform_amount: "num",
      has_supplies: "bool",
      supplies_amount: "num",
      has_medical: "bool",
      medical_amount: "num",
      has_hardship: "bool",
      hardship_amount: "num",
      disabled_allowances: "json",
    },
    extraAliases: {},
    core: ["id", "personnelId", "schoolId", "schoolYear"],
  },
  esf7_requests: {
    columns: {
      id: "text",
      requester_school_id: "text",
      target_school_id: "text",
      school_year: "text",
      request_type: "text",
      personnel_id: "text",
      personnel_name: "text",
      status: "text",
      remarks: "text",
    },
    extraAliases: {},
    core: [
      "id",
      "requesterSchoolId",
      "targetSchoolId",
      "schoolYear",
      "requestType",
      "personnelId",
      "personnelName",
      "status",
      "remarks",
    ],
  },
  esf7_school_profile: {
    columns: {
      id: "text",
      school_id: "text",
      school_year: "text",
      has_elem_special_programs: "bool",
      has_jhs_special_programs: "bool",
      jhs_special_programs: "json",
      shs_curriculum_model: "text",
      has_elem_inclusive: "bool",
      elem_inclusive_programs: "json",
      has_jhs_inclusive: "bool",
      jhs_inclusive_programs: "json",
      has_shs_inclusive: "bool",
      shs_inclusive_programs: "json",
      inclusive_programs: "json",
      elem_special_programs: "json",
      has_als: "bool",
      has_sned: "bool",
      has_iped: "bool",
      has_madrasah: "bool",
      has_shifts: "bool",
      shift_start_time: "text",
      shift_end_time: "text",
      shifts_config: "json",
    },
    extraAliases: {},
    core: ["schoolId", "schoolYear"],
  },
  esf7_related_task: {
    columns: {
      id: "text",
      personnel_id: "text",
      school_id: "text",
      school_year: "text",
      task_name: "text",
      frequency: "text",
      duration_minutes: "num",
      term1_hours: "num",
      is_designation_synced: "bool",
    },
    extraAliases: { task: "task_name" },
    core: ["id", "task_name", "frequency"],
  },
  esf7_admin_task: {
    columns: {
      id: "text",
      personnel_id: "text",
      school_id: "text",
      school_year: "text",
      task_name: "text",
      dates: "json",
      duration_minutes: "num",
      task_category: "text",
      start_date: "skip",
      end_date: "skip",
      start_time: "time",
      end_time: "time",
      days: "json",
      term: "text",
      term_total_hours: "num",
      is_designation_synced: "bool",
      status: "text",
    },
    extraAliases: {
      task: "task_name",
      taskName: "task_name",
      category: "task_category",
    },
    core: ["id", "task", "startTime", "endTime", "days", "term"],
  },
  esf7_regular_sections: {
    columns: {
      id: "text",
      school_id: "text",
      school_year: "text",
      grade_level: "text",
      section_name: "text",
      adviser_id: "text",
      section_type: "text",
      male_learners: "num",
      female_learners: "num",
      number_of_learners: "num",
      term: "text",
      size_status: "text",
    },
    extraAliases: { advisorId: "adviser_id" },
    core: ["id", "gradeLevel", "sectionName", "sectionType"],
  },
};

const ECHO_KEYS = new Set(["rawPayload", "raw_payload", "extras"]);
const camel = (c) => c.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());

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

/** Strict rule: payload value `v` is already stored in typed column value `col`. */
function sameAsColumn(kind, v, col) {
  if (v === null || v === undefined) return col === null || col === undefined;
  if (col === null || col === undefined) return false;
  switch (kind) {
    case "json":
      return deepEqual(v, col);
    case "time":
      return typeof v === "string" && (v === hhmm(col) || v === hhmmss(col));
    case "num":
      return typeof v === "number" && Number(col) === v;
    case "bool":
      return typeof v === "boolean" && v === col;
    case "text":
      return typeof v === "string" && v === String(col);
    default:
      return false;
  }
}

function codec(table, opts = {}) {
  const cfg = TABLES[table];
  if (!cfg) throw new Error(`payloadExtras: no config for ${table}`);
  // `exclude`: payload keys that must stay in extras even when equal to a column (the formatter does not re-emit them)
  const skip = new Set(opts.exclude || cfg.exclude || []);
  const aliases = new Map(); // payload key -> { col, kind }
  for (const [col, kind] of Object.entries(cfg.columns)) {
    for (const key of new Set([col, camel(col)]))
      if (!skip.has(key)) aliases.set(key, { col, kind });
  }
  for (const [key, col] of Object.entries(cfg.extraAliases))
    if (!skip.has(key)) aliases.set(key, { col, kind: cfg.columns[col] });

  const held = (k, v, row) => {
    const a = aliases.get(k);
    return !!a && sameAsColumn(a.kind, v, row[a.col]);
  };
  return {
    table,
    aliases,
    columns: cfg.columns,
    /** keys of `source` that the typed values in `row` do not already hold */
    buildExtras(source, row, { dropEcho = true } = {}) {
      const out = {};
      for (const [k, v] of Object.entries(source || {})) {
        if (v === undefined) continue;
        if (dropEcho && ECHO_KEYS.has(k)) continue;
        if (held(k, v, row)) continue;
        out[k] = v;
      }
      return out;
    },
    /** payload keys that are neither held by a column nor present in row.extras with an equal value */
    unaccountedKeys(payload, row) {
      const extras = row.extras || {};
      const missing = [];
      for (const [k, v] of Object.entries(payload || {})) {
        if (held(k, v, row)) continue;
        if (
          Object.prototype.hasOwnProperty.call(extras, k) &&
          deepEqual(extras[k], v)
        )
          continue;
        missing.push(k);
      }
      return missing;
    },
    /** approximate old payload: core camelCase keys from the columns, then extras */
    reconstruct(row) {
      const out = {};
      for (const key of cfg.core) {
        const a = aliases.get(key);
        if (!a) continue;
        let v = row[a.col];
        if (v === undefined) continue;
        if (a.kind === "time" && v !== null) v = hhmm(v);
        if (a.kind === "num" && v !== null) v = Number(v);
        out[key] = v;
      }
      return { ...out, ...(row.extras || {}) };
    },
  };
}

module.exports = { TABLES, codec, sameAsColumn, deepEqual, ECHO_KEYS };
