/**
 * server/services/personnelSharedReader.js
 *
 * Canonical shared reader and serializer service for ESF7 Personnel.
 * Enforces the normalized database tables (`esf7_personnel_ld_trainings` and
 * `esf7_personnel_learning_areas`) as the SOLE SOURCE OF TRUTH.
 *
 * Used by:
 * - Personnel Profiling (GET /api/personnel/:id, PUT /api/personnel/:id)
 * - Personnel Roster (GET /api/personnel)
 * - Room QR Portal & Passcode Verification (GET /api/room-profiling/roster, POST /api/room-profiling/verify-passcode)
 * - Room QR Approve & Merge (POST /api/room-profiling/accept)
 * - Learning Area endpoints (GET /api/learning-areas, POST /api/learning-areas/toggle)
 */

const db = require("../db");

/**
 * Format a Date or date string to 'YYYY-MM-DD', or null if invalid/placeholder.
 */
function calendarDay(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || /^(|n\/?a|none|null|undefined|-|--|—)$/i.test(s)) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/**
 * Collect all known aliases and IDs for a personnel entity.
 * Resolves across:
 * - id
 * - legacy_id
 * - prn / canonical prn
 * - employee_no
 * - esf7_personnel_id_mapping (legacy_id <-> new_id)
 * - duplicate profile records in esf7_personnel_profile
 *
 * @param {object} poolOrClient - PG pool or client
 * @param {string|object} idOrObj - Personnel ID string or profile object
 * @returns {Promise<string[]>} Deduplicated array of string alias IDs
 */
async function resolvePersonnelAliasIds(poolOrClient, idOrObj) {
  const client = poolOrClient || db;
  const aliases = new Set();

  if (!idOrObj) return [];

  let rawId = null;
  let rawLegacy = null;
  let rawPrn = null;
  let rawEmpNo = null;
  let rawSchoolId = null;

  if (typeof idOrObj === "string") {
    rawId = idOrObj.trim();
  } else if (typeof idOrObj === "object") {
    rawId = idOrObj.id ? String(idOrObj.id).trim() : null;
    rawLegacy =
      idOrObj.legacy_id || idOrObj.legacyId
        ? String(idOrObj.legacy_id || idOrObj.legacyId).trim()
        : null;
    rawPrn = idOrObj.prn ? String(idOrObj.prn).trim() : null;
    rawEmpNo =
      idOrObj.employee_no || idOrObj.employeeNo
        ? String(idOrObj.employee_no || idOrObj.employeeNo).trim()
        : null;
    rawSchoolId =
      idOrObj.school_id || idOrObj.schoolId
        ? String(idOrObj.school_id || idOrObj.schoolId)
            .replace(/^SCH-/i, "")
            .trim()
        : null;
  }

  if (rawId) aliases.add(rawId);
  if (rawLegacy) aliases.add(rawLegacy);
  if (rawPrn) {
    aliases.add(rawPrn);
    const m = rawPrn.match(/^PRN-0*(\d+)$/i);
    if (m && m[1].length >= 6) {
      aliases.add(m[1]);
      aliases.add(`PRN-${parseInt(m[1], 10)}`);
    }
  }
  if (
    rawEmpNo &&
    rawEmpNo !== "N/A" &&
    rawEmpNo !== "NONE" &&
    rawEmpNo.length >= 4
  ) {
    aliases.add(rawEmpNo);
  }

  const seedList = Array.from(aliases);
  if (seedList.length === 0) return [];

  try {
    // If rawSchoolId was not provided, look up the target row first to determine school_id
    if (!rawSchoolId && rawId) {
      const initRow = await client.query(
        `SELECT school_id, legacy_id, prn, employee_no FROM esf7_personnel_profile WHERE id = $1 LIMIT 1`,
        [rawId],
      );
      if (initRow.rows.length > 0) {
        rawSchoolId = String(initRow.rows[0].school_id || "")
          .replace(/^SCH-/i, "")
          .trim();
        if (initRow.rows[0].legacy_id)
          aliases.add(String(initRow.rows[0].legacy_id).trim());
        if (initRow.rows[0].prn)
          aliases.add(String(initRow.rows[0].prn).trim());
        if (
          initRow.rows[0].employee_no &&
          initRow.rows[0].employee_no !== "N/A" &&
          initRow.rows[0].employee_no.length >= 4
        ) {
          aliases.add(String(initRow.rows[0].employee_no).trim());
        }
      }
    }

    // 1. Query esf7_personnel_profile for matching rows, strictly scoped to the same school if school_id is known
    const queryParams = [Array.from(aliases)];
    let schoolFilter = "";
    if (rawSchoolId) {
      queryParams.push(rawSchoolId);
      schoolFilter = `AND (school_id = $2 OR school_id = ('SCH-' || $2) OR REPLACE(school_id, 'SCH-', '') = $2)`;
    }

    const profRes = await client.query(
      `SELECT id, legacy_id, prn, employee_no, school_id
       FROM esf7_personnel_profile
       WHERE (id = ANY($1::text[]) 
          OR legacy_id = ANY($1::text[]) 
          OR (prn IS NOT NULL AND prn != '' AND prn = ANY($1::text[]))
          OR (employee_no IS NOT NULL AND employee_no != '' AND employee_no = ANY($1::text[])))
          ${schoolFilter}`,
      queryParams,
    );

    const cleanSchool = (v) =>
      String(v || "")
        .replace(/^SCH-/i, "")
        .trim();
    let matched = profRes.rows;
    if (!rawSchoolId) {
      // The school could not be determined from the input (a bare alias such as an employee number). If that alias
      // belongs to people in SEVERAL schools it is ambiguous: expanding it would pull another school's records in
      // under this teacher's name, so nothing is added from those rows. A single school is safe to adopt.
      const schools = new Set(matched.map((r) => cleanSchool(r.school_id)));
      if (schools.size > 1) matched = [];
      else if (schools.size === 1) rawSchoolId = [...schools][0];
    }

    for (const r of matched) {
      if (r.id) aliases.add(String(r.id).trim());
      if (r.legacy_id) aliases.add(String(r.legacy_id).trim());
      if (r.prn) aliases.add(String(r.prn).trim());
      if (
        r.employee_no &&
        r.employee_no !== "N/A" &&
        r.employee_no.length >= 4
      ) {
        aliases.add(String(r.employee_no).trim());
      }
    }

    // 2. Query esf7_personnel_id_mapping (legacy_id <-> new_id). The table has no school column, so a mapped id is
    // dropped when it belongs to a profile of a DIFFERENT school.
    const curList = Array.from(aliases);
    const mapRes = await client.query(
      `SELECT legacy_id, new_id 
       FROM esf7_personnel_id_mapping 
       WHERE legacy_id = ANY($1::text[]) OR new_id = ANY($1::text[])`,
      [curList],
    );

    const mappedIds = [];
    for (const m of mapRes.rows) {
      if (m.legacy_id) mappedIds.push(String(m.legacy_id).trim());
      if (m.new_id) mappedIds.push(String(m.new_id).trim());
    }
    let foreign = new Set();
    if (rawSchoolId && mappedIds.length > 0) {
      const owners = await client.query(
        `SELECT id, legacy_id, school_id FROM esf7_personnel_profile
          WHERE id = ANY($1::text[]) OR legacy_id = ANY($1::text[])`,
        [mappedIds],
      );
      for (const o of owners.rows) {
        if (cleanSchool(o.school_id) !== rawSchoolId) {
          if (o.id) foreign.add(String(o.id).trim());
          if (o.legacy_id) foreign.add(String(o.legacy_id).trim());
        }
      }
    }
    for (const id of mappedIds) {
      if (!foreign.has(id)) aliases.add(id);
    }
  } catch (err) {
    // Non-fatal, use whatever aliases were gathered
  }

  return Array.from(aliases).filter(Boolean);
}

/**
 * Standard serializer for an individual L&D training record.
 */
function serializeTrainingRow(r) {
  if (!r) return null;
  const rawType = (r.training_type || r.type || "OTHER").toUpperCase();
  const canonicalType =
    rawType === "TESDA" || rawType === "CERTIFICATION"
      ? "TESDA"
      : rawType === "NEAP"
        ? "NEAP"
        : "OTHER";

  const totalHrs =
    Number(
      r.total_hours != null
        ? r.total_hours
        : r.totalHours != null
          ? r.totalHours
          : r.hours,
    ) || 0;
  const daysVal = r.days != null && r.days !== "" ? Number(r.days) : null;
  const sDate = calendarDay(r.start_date || r.startDate);
  const eDate = calendarDay(r.end_date || r.endDate);

  return {
    id: String(r.id || `TRN-${r.personnel_id}-${Date.now()}`),
    personnelId: String(r.personnel_id || r.personnelId || ""),
    personnel_id: String(r.personnel_id || r.personnelId || ""),
    title: String(r.title || r.training_title || r.programTitle || "").trim(),
    trainingTitle: String(
      r.title || r.training_title || r.programTitle || "",
    ).trim(),
    training_title: String(
      r.title || r.training_title || r.programTitle || "",
    ).trim(),
    // One casing everywhere: the canonical value every write path stores (NEAP / TESDA / OTHER), identical in
    // `type`, `trainingType` and `training_type`. (The old per-controller formatter lower-cased `type`; nothing
    // in the client branches on it, and the three arrays already carry the category.)
    type: canonicalType,
    trainingType: canonicalType,
    training_type: canonicalType,
    conductor: String(r.conductor || "").trim(),
    startDate: sDate,
    start_date: sDate,
    endDate: eDate,
    end_date: eDate,
    days: daysVal,
    totalHours: totalHrs,
    total_hours: totalHrs,
    hours: totalHrs,
  };
}

/**
 * Serializes a list of raw L&D training rows into the 3 canonical category arrays.
 *
 * @param {Array} rows - Rows from esf7_personnel_ld_trainings
 * @returns {{ neapTrainingRows: Array, certificationRows: Array, otherTrainingRows: Array }}
 */
function serializeLdTrainings(rows = []) {
  const neapTrainingRows = [];
  const certificationRows = [];
  const otherTrainingRows = [];

  if (!Array.isArray(rows)) {
    return { neapTrainingRows, certificationRows, otherTrainingRows };
  }

  for (const raw of rows) {
    const formatted = serializeTrainingRow(raw);
    if (!formatted) continue;

    if (formatted.trainingType === "NEAP") {
      neapTrainingRows.push(formatted);
    } else if (formatted.trainingType === "TESDA") {
      certificationRows.push(formatted);
    } else {
      otherTrainingRows.push(formatted);
    }
  }

  return { neapTrainingRows, certificationRows, otherTrainingRows };
}

/**
 * Standard serializer for Learning Area Matrix.
 *
 * @param {object|string} rowOrMatrix - Database row containing matrix_data, or matrix object/string
 * @returns {{ learningAreaMap: object, matrix_data: object }}
 */
// Era/subject key used by the Learning Area matrix (the client writes "Kinder", the old rows say "Kinder Blocks of Time").
function learningAreaKey(era, area) {
  let name = String(area || "").trim();
  if (/^kinder blocks of time$/i.test(name)) name = "Kinder";
  return `${String(era || "").trim()}||${name}`;
}

// Disaggregated rows ({ school_year, learning_area, years_taught }) and/or table rows that carry a matrix_data
// object, in any mix, into one { "era||subject": { checked, years } } map. The first row for a key wins, so pass
// the newest rows first (as the loaders do).
function matrixFromRows(rows) {
  const out = {};
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if (r.learning_area || r.learningArea) {
      const key = learningAreaKey(
        r.school_year ?? r.schoolYear ?? r.era,
        r.learning_area ?? r.learningArea,
      );
      if (!key.endsWith("||") && !(key in out)) {
        const yrs = r.years_taught ?? r.yearsTaught ?? r.years;
        out[key] = {
          checked: true,
          years:
            yrs === undefined || yrs === null || yrs === "" ? 1 : Number(yrs),
        };
      }
      continue;
    }
    const nested = r.matrix_data ?? r.learningAreaMap;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const [k, v] of Object.entries(nested)) if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

function serializeLearningAreas(rowOrMatrix) {
  let matrix = {};

  if (Array.isArray(rowOrMatrix)) {
    matrix = matrixFromRows(rowOrMatrix);
  } else if (rowOrMatrix) {
    if (
      typeof rowOrMatrix === "object" &&
      (rowOrMatrix.matrix_data || rowOrMatrix.learningAreaMap)
    ) {
      matrix = rowOrMatrix.matrix_data || rowOrMatrix.learningAreaMap || {};
    } else if (typeof rowOrMatrix === "object") {
      matrix = rowOrMatrix;
    } else if (typeof rowOrMatrix === "string") {
      try {
        matrix = JSON.parse(rowOrMatrix);
      } catch (e) {
        matrix = {};
      }
    }
  }

  if (typeof matrix === "string") {
    try {
      matrix = JSON.parse(matrix);
    } catch (e) {
      matrix = {};
    }
  }

  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) {
    matrix = {};
  }

  // Ensure clean normalized structure: { [eraKey||subjectKey]: { checked: boolean, years: number } }
  const cleanMatrix = {};
  for (const [key, val] of Object.entries(matrix)) {
    if (!key || !key.includes("||")) continue;
    if (typeof val === "object" && val !== null) {
      // `years` is kept as stored: 0 and "" (checked but not filled in yet) must not be rewritten to 1.
      const rawYears = val.years ?? val.yearsTaught;
      cleanMatrix[key] = {
        checked: Boolean(val.checked ?? true),
        years:
          rawYears === undefined || rawYears === null
            ? 1
            : rawYears === ""
              ? ""
              : Number.isFinite(Number(rawYears))
                ? Number(rawYears)
                : rawYears,
      };
    } else if (val) {
      cleanMatrix[key] = {
        checked: true,
        years: Number(val) || 1,
      };
    }
  }

  return {
    learningAreaMap: cleanMatrix,
    matrix_data: cleanMatrix,
  };
}

/**
 * Reads normalized L&D and Learning Areas for a single personnel record from the database.
 * Uses resolvePersonnelAliasIds to guarantee that data keyed under any variant of the ID is found.
 *
 * @param {object} poolOrClient - PG pool or client
 * @param {string|object} personnelIdOrRow - Personnel ID or row object
 * @returns {Promise<{ neapTrainingRows: Array, certificationRows: Array, otherTrainingRows: Array, learningAreaMap: object, matrix_data: object, aliasIds: string[] }>}
 */
async function loadPersonnelNormalizedData(poolOrClient, personnelIdOrRow) {
  const client = poolOrClient || db;
  const aliasIds = await resolvePersonnelAliasIds(client, personnelIdOrRow);

  if (aliasIds.length === 0) {
    return {
      neapTrainingRows: [],
      certificationRows: [],
      otherTrainingRows: [],
      learningAreaMap: {},
      matrix_data: {},
      aliasIds: [],
    };
  }

  const [trRes, laRes] = await Promise.all([
    client
      .query(
        `SELECT * FROM esf7_personnel_ld_trainings 
       WHERE personnel_id = ANY($1::text[]) 
       ORDER BY created_at ASC`,
        [aliasIds],
      )
      .catch(() => ({ rows: [] })),
    client
      .query(
        `SELECT * FROM esf7_personnel_learning_areas 
       WHERE personnel_id = ANY($1::text[]) 
       ORDER BY updated_at DESC LIMIT 1`,
        [aliasIds],
      )
      .catch(() => ({ rows: [] })),
  ]);

  const { neapTrainingRows, certificationRows, otherTrainingRows } =
    serializeLdTrainings(trRes.rows);
  const { learningAreaMap, matrix_data } = serializeLearningAreas(
    laRes.rows[0],
  );

  return {
    neapTrainingRows,
    certificationRows,
    otherTrainingRows,
    learningAreaMap,
    matrix_data,
    aliasIds,
  };
}

/**
 * Reads all normalized L&D trainings and Learning Areas for an entire school.
 * Efficiently indexes by all aliases so each teacher's record is faithfully populated.
 *
 * @param {object} poolOrClient - PG pool or client
 * @param {string} schoolId - School ID (e.g. "300488")
 * @returns {Promise<{ getForTeacher: Function, allTrainings: Array, allLearningAreas: Array }>}
 */
async function loadSchoolNormalizedData(poolOrClient, schoolId) {
  const client = poolOrClient || db;
  const cleanSchoolId = String(schoolId).replace(/^SCH-/i, "").trim();
  const sidPair = [cleanSchoolId, `SCH-${cleanSchoolId}`];

  // 1. Fetch all profiles for this school to establish all alias sets
  const profRes = await client
    .query(
      `SELECT id, legacy_id, prn, employee_no, first_name, last_name, school_id 
     FROM esf7_personnel_profile 
     WHERE school_id = ANY($1::text[])`,
      [sidPair],
    )
    .catch(() => ({ rows: [] }));

  // Disjoint set / union-find to cluster all aliases for each teacher
  const parent = new Map();
  const find = (i) => {
    if (!parent.has(i)) parent.set(i, i);
    let root = i;
    while (root !== parent.get(root)) root = parent.get(root);
    let curr = i;
    while (curr !== root) {
      const nxt = parent.get(curr);
      parent.set(curr, root);
      curr = nxt;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const p of profRes.rows) {
    const keys = [
      p.id,
      p.legacy_id,
      p.prn,
      p.employee_no,
      p.first_name && p.last_name
        ? `${String(p.first_name).trim().toUpperCase()}__${String(p.last_name).trim().toUpperCase()}`
        : null,
    ]
      .filter(Boolean)
      .map((k) => String(k).trim().toUpperCase());

    if (keys.length > 0) {
      const primary = keys[0];
      for (let i = 1; i < keys.length; i++) {
        union(primary, keys[i]);
      }
      for (const k of keys) {
        const prnMatch = k.match(/^PRN-0*(\d+)$/);
        if (prnMatch) {
          union(primary, prnMatch[1]);
          union(primary, `PRN-${parseInt(prnMatch[1], 10)}`);
        }
      }
    }
  }

  // Also union mappings from esf7_personnel_id_mapping
  try {
    const allProfileIds = profRes.rows.map((r) =>
      String(r.id).trim().toUpperCase(),
    );
    if (allProfileIds.length > 0) {
      const mapRes = await client.query(
        `SELECT legacy_id, new_id FROM esf7_personnel_id_mapping WHERE legacy_id = ANY($1::text[]) OR new_id = ANY($1::text[])`,
        [allProfileIds],
      );
      for (const m of mapRes.rows) {
        if (m.legacy_id && m.new_id) {
          union(
            String(m.legacy_id).trim().toUpperCase(),
            String(m.new_id).trim().toUpperCase(),
          );
        }
      }
    }
  } catch (err) {}

  // 2. Fetch all L&D trainings for the school
  const trRes = await client
    .query(
      `SELECT t.* FROM esf7_personnel_ld_trainings t
     JOIN esf7_personnel_profile p ON p.id = t.personnel_id OR p.legacy_id = t.personnel_id
     WHERE p.school_id = ANY($1::text[])
     ORDER BY t.created_at ASC`,
      [sidPair],
    )
    .catch(() => ({ rows: [] }));

  // 3. Fetch all Learning Areas for the school
  const laRes = await client
    .query(
      `SELECT la.* FROM esf7_personnel_learning_areas la
     JOIN esf7_personnel_profile p ON p.id = la.personnel_id OR p.legacy_id = la.personnel_id
     WHERE p.school_id = ANY($1::text[])
     ORDER BY la.updated_at DESC`,
      [sidPair],
    )
    .catch(() => ({ rows: [] }));

  // Group by canonical teacher key (deduplicating by training row id)
  const trainingsByTeacher = new Map();
  const seenTrainings = new Set();
  for (const t of trRes.rows) {
    if (t.id && seenTrainings.has(String(t.id).trim())) continue;
    if (t.id) seenTrainings.add(String(t.id).trim());

    const rawKey = String(t.personnel_id).trim().toUpperCase();
    const canonId = find(rawKey);
    if (!trainingsByTeacher.has(canonId)) trainingsByTeacher.set(canonId, []);
    trainingsByTeacher.get(canonId).push(t);
  }

  const learningAreasByTeacher = new Map();
  for (const la of laRes.rows) {
    const rawKey = String(la.personnel_id).trim().toUpperCase();
    const canonId = find(rawKey);
    // Latest row wins if multiple
    if (!learningAreasByTeacher.has(canonId)) {
      learningAreasByTeacher.set(canonId, la);
    }
  }

  // Lookup helper function
  const getForTeacher = (
    teacherId,
    teacherPrn,
    teacherEmpNo,
    teacherLegacy,
  ) => {
    const candidateKeys = [teacherId, teacherLegacy, teacherPrn, teacherEmpNo]
      .filter(Boolean)
      .map((k) => String(k).trim().toUpperCase());

    let canonId = null;
    for (const k of candidateKeys) {
      if (parent.has(k)) {
        canonId = find(k);
        break;
      }
      const m = k.match(/^PRN-0*(\d+)$/);
      if (m && parent.has(m[1])) {
        canonId = find(m[1]);
        break;
      }
    }

    const tRows =
      (canonId && trainingsByTeacher.get(canonId)) ||
      candidateKeys
        .map((k) => trainingsByTeacher.get(k))
        .find((r) => r && r.length > 0) ||
      [];
    const laRow =
      (canonId && learningAreasByTeacher.get(canonId)) ||
      candidateKeys.map((k) => learningAreasByTeacher.get(k)).find(Boolean) ||
      null;

    const { neapTrainingRows, certificationRows, otherTrainingRows } =
      serializeLdTrainings(tRows);
    const { learningAreaMap, matrix_data } = serializeLearningAreas(laRow);

    return {
      neapTrainingRows,
      certificationRows,
      otherTrainingRows,
      learningAreaMap,
      matrix_data,
    };
  };

  return {
    getForTeacher,
    allTrainings: trRes.rows,
    allLearningAreas: laRes.rows,
  };
}

module.exports = {
  calendarDay,
  resolvePersonnelAliasIds,
  serializeTrainingRow,
  serializeLdTrainings,
  serializeLearningAreas,
  loadPersonnelNormalizedData,
  loadSchoolNormalizedData,
};
