/**
 * Data Migration: esf7_room_roster_cache -> normalized esf7_* tables
 *
 * Skill: .claude/skills/room-roster-cache-migration/ (read SKILL.md and rules.md first).
 *
 * The cache holds one row per school; roster_json is an ARRAY of personnel objects (mixed camelCase,
 * snake_case and harvester keys) with nested workloadRows / administrativeRows / teachingRelatedRows.
 * Field mapping lives in scripts/lib/roomRosterFieldMap.js (documented in reference/field-mapping.md).
 *
 * Guarantees:
 *   - Never modifies, deletes, vacuums or truncates esf7_room_roster_cache. Only inserts into target tables.
 *   - Safety gates before any write: loopback host, NODE_ENV != production, DB allowlist, --confirm-db match.
 *   - --dry-run is the default; --apply needs --confirm-db <db>.
 *   - Backup of every cache row about to be processed is written and re-read before the first write.
 *   - One transaction per school; a failing school is rolled back alone and recorded.
 *   - Existing normalized rows win: insert-if-absent only, never UPDATE/DELETE.
 *   - Personnel IDs: cache id is preserved unchanged in esf7_personnel_profile.legacy_id; the primary key is a
 *     new UUID (current schema; decision recorded in SKILL.md). Child rows get the UUID.
 *   - Child rows (employment, education, designations, workload, admin, related) are only inserted for a
 *     person who has none of that kind yet, so reruns insert 0 rows.
 *   - Sections are NOT created (cache has no section objects); distinct section ids/names go to needs_review.
 *   - Unmapped data is never dropped silently: it goes to needs_review.json.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const db = require("../db");
const { buildExtras: buildWorkloadExtras } = require("../utils/workloadPayload");
const { coerceDateField, isDatePlaceholder } = require("../utils/dateInput");
const { normalizeSchoolYear } = require("../utils/schoolYear");
const { pat, CHILDREN, classify } = require("./lib/roomRosterFieldMap");

const ALLOWED_DATABASES = new Set(["esf7_local", "insighted_esf7"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const HALT = { flaggedRate: 0.02, fkRate: 0.01, failedSchoolRate: 0.01, minSchoolsForRate: 20 };

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const get = (flag) => {
    const out = [];
    argv.forEach((a, i) => {
      if (a === flag && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[i + 1]);
    });
    return out;
  };
  const apply = argv.includes("--apply");
  const schools = get("--school")
    .flatMap((s) => s.split(","))
    .map((s) => s.trim().replace(/^SCH-/i, ""))
    .filter(Boolean);
  return {
    apply,
    confirmDb: get("--confirm-db")[0] || null,
    schools,
    batchSize: Math.max(1, parseInt(get("--batch-size")[0] || "50", 10) || 50),
    outDir: get("--out-dir")[0] || null,
  };
}

// ---------------------------------------------------------------- gates
async function enforceSafetyGate(opts) {
  const host = String(process.env.DB_HOST || "").toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();
  if (nodeEnv === "production") throw new Error('FATAL: NODE_ENV is "production". Refusing to run.');
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`FATAL: DB_HOST "${host}" is not loopback (localhost / 127.0.0.1 / ::1).`);
  const probe = await db.query("SELECT current_database() AS current_db, current_user AS current_user");
  const session = probe.rows[0];
  if (!ALLOWED_DATABASES.has(session.current_db)) {
    throw new Error(`FATAL: database "${session.current_db}" is not in the allowlist [${[...ALLOWED_DATABASES].join(", ")}].`);
  }
  if (opts.apply && opts.confirmDb !== session.current_db) {
    throw new Error(`FATAL: --apply requires --confirm-db "${session.current_db}". Got: "${opts.confirmDb}".`);
  }
  return session;
}

// ---------------------------------------------------------------- value helpers
const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && isDatePlaceholder(v));
const txt = (v) => {
  if (isBlank(v) || typeof v === "object") return null;
  const s = String(v).trim();
  return s || null;
};
const first = (o, ...keys) => {
  for (const k of keys) {
    const v = txt(o[k]);
    if (v !== null) return v;
  }
  return null;
};
const bool = (v) => v === true || (typeof v === "string" && ["true", "1", "yes"].includes(v.trim().toLowerCase()));
const firstBool = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return bool(o[k]);
  return false;
};
const int = (v) => {
  if (isBlank(v)) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};
const num = (v) => {
  if (isBlank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function time(t) {
  if (isBlank(t)) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [hh, mm, ss] = [+m[1], +m[2], m[3] ? +m[3] : 0];
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return [hh, mm, ss].map((x) => String(x).padStart(2, "0")).join(":");
}
const hash = (...parts) => crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
const idFormat = (id) => {
  const s = String(id || "");
  if (s.startsWith("PER-")) return "PER";
  if (s.startsWith("local-p-")) return "local-p";
  if (s.startsWith("P-HARVEST-")) return "P-HARVEST";
  return "other";
};
const STATUS_BY_FORMAT = { PER: "canonical", "local-p": "client-created", "P-HARVEST": "harvester-created", other: "client-created" };
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function dateFrom(p, direct, dd, mm, yyyy, flag, ctx) {
  let v = null;
  for (const k of direct) if (!isBlank(p[k])) { v = p[k]; break; }
  if (v === null && !isBlank(p[yyyy]) && !isBlank(p[mm]) && !isBlank(p[dd])) {
    const mi = MONTHS.indexOf(String(p[mm]).trim().toUpperCase());
    if (mi >= 0 && /^\d{4}$/.test(String(p[yyyy]).trim())) {
      v = `${String(p[yyyy]).trim()}-${String(mi + 1).padStart(2, "0")}-${String(p[dd]).trim().padStart(2, "0")}`;
    }
  }
  if (v === null) return null;
  try {
    return coerceDateField(v, flag);
  } catch {
    ctx.flag("coerced_to_null", `Invalid ${flag} "${String(v).slice(0, 30)}" stored as NULL`, { id: p.id });
    return null;
  }
}

// ---------------------------------------------------------------- per-school context
function newStats() {
  const t = () => ({ read: 0, planned: 0, inserted: 0, skipped_existing: 0, id_conflict: 0, flagged: 0 });
  return {
    personnel: { entries: 0, unique: 0, existing_won: 0, to_insert: 0, inserted: 0, flagged: 0, duplicates_collapsed: 0,
      by_format: { PER: 0, "local-p": 0, "P-HARVEST": 0, other: 0 }, noncanonical_existing_preserved: 0, noncanonical_new_unreferenced: 0 },
    tables: { esf7_personnel_profile: t(), esf7_personnel_employment: t(), esf7_perssonel_educ: t(), esf7_personnel_designations: t(), esf7_workload_rows: t(), esf7_admin_task: t(), esf7_related_task: t() },
    flagged: 0,
    items: 0,
    fk_failures: 0,
  };
}
function mergeStats(into, from) {
  for (const k of Object.keys(from.personnel)) {
    if (k === "by_format") for (const f of Object.keys(from.personnel.by_format)) into.personnel.by_format[f] += from.personnel.by_format[f];
    else into.personnel[k] += from.personnel[k];
  }
  for (const t of Object.keys(from.tables)) for (const k of Object.keys(from.tables[t])) into.tables[t][k] += from.tables[t][k];
  into.flagged += from.flagged; into.items += from.items; into.fk_failures += from.fk_failures;
}

// ---------------------------------------------------------------- inventory (never drop silently)
function inventoryEntry(inv, schoolId, entry) {
  const note = (p, v) => {
    let r = inv.get(p);
    if (!r) { r = { n: 0, schools: new Set(), sample: null, sampleSchool: schoolId }; inv.set(p, r); }
    r.n++; r.schools.add(schoolId);
    if (r.sample === null && v !== null && v !== undefined && v !== "" && typeof v !== "object") r.sample = String(v).slice(0, 60);
  };
  for (const k of Object.keys(entry)) {
    note(`[].${pat(k)}`, entry[k]);
    if (CHILDREN[k] !== undefined && Array.isArray(entry[k])) {
      for (const el of entry[k]) if (el && typeof el === "object" && !Array.isArray(el)) for (const ck of Object.keys(el)) note(`[].${k}[].${pat(ck)}`, el[ck]);
    }
  }
}

// ---------------------------------------------------------------- process one school
async function processSchool({ client, schoolId, payload, apply, inv, needsReview, ctxRun }) {
  const stats = newStats();
  const review = [];
  const existingWonList = [];
  const flagItem = (table, kind, reason, extra = {}, informational = false) => {
    review.push({ schoolId, table, kind, reason, ...extra });
    if (!informational) { stats.flagged++; if (stats.tables[table]) stats.tables[table].flagged++; }
  };
  const ctx = { flag: (kind, reason, extra) => flagItem("esf7_personnel_profile", kind, reason, extra) };
  const q = (sql, params) => (client || db).query(sql, params);

  if (!Array.isArray(payload)) {
    flagItem("-", "payload_shape", "roster_json is not an array; nothing migrated", { type: typeof payload });
    return { stats, review, existingWonList };
  }
  const entries = payload.filter((o) => o && typeof o === "object" && !Array.isArray(o));
  stats.personnel.entries = entries.length;
  for (const e of entries) inventoryEntry(inv, schoolId, e);

  // collapse repeated entries for the same id: prefer app-format (firstName) entry with most rows
  const byId = new Map();
  for (const e of entries) {
    const id = txt(e.id);
    if (!id) { flagItem("esf7_personnel_profile", "no_id", "personnel entry without id; not migrated", { name: e.name || null }); continue; }
    const score = (e.firstName ? 1000 : 0) + (e.workloadRows?.length || 0) + (e.administrativeRows?.length || 0) + (e.teachingRelatedRows?.length || 0);
    const cur = byId.get(id);
    if (!cur) byId.set(id, { e, score, n: 1 });
    else { cur.n++; if (score >= cur.score) { cur.e = e; cur.score = score; } }
  }
  stats.personnel.unique = byId.size;
  for (const v of byId.values()) stats.personnel.duplicates_collapsed += v.n - 1;
  const ids = [...byId.keys()];
  const prns = [...byId.values()].map((v) => txt(v.e.prn)).filter(Boolean);

  const exist = await q(
    `SELECT id, legacy_id, prn, school_id, first_name, last_name, birthdate::text AS birthdate FROM esf7_personnel_profile
      WHERE school_id = $1 OR legacy_id = ANY($2::text[]) OR prn = ANY($3::text[]) OR id = ANY($2::text[])`,
    [schoolId, ids, prns.length ? prns : ["__none__"]],
  );
  const byLegacy = new Map(); const byPrn = new Map(); const byName = new Map();
  for (const r of exist.rows) {
    if (r.legacy_id && r.school_id === schoolId) byLegacy.set(r.legacy_id, r);
    if (r.prn) byPrn.set(r.prn, r);
    byName.set(`${(r.last_name || "").toUpperCase()}|${(r.first_name || "").toUpperCase()}|${r.birthdate || ""}`, r);
  }

  const plan = []; // {e, uuid, legacy, existing:boolean}
  const seenPrn = new Map();
  const namesNew = new Map();
  for (const [legacy, { e }] of byId) {
    stats.items++;
    const fmt = idFormat(legacy);
    stats.personnel.by_format[fmt]++;
    const prn = txt(e.prn);
    const hit = byLegacy.get(legacy) || (prn && byPrn.get(prn)) || (exist.rows.find((r) => r.id === legacy) || null);
    if (hit) {
      stats.personnel.existing_won++;
      stats.tables.esf7_personnel_profile.skipped_existing++;
      if (fmt !== "PER") stats.personnel.noncanonical_existing_preserved++;
      existingWonList.push({ schoolId, cacheId: legacy, normalizedId: hit.id, matchedOn: hit.legacy_id === legacy ? "legacy_id" : hit.prn === prn ? "prn" : "id" });
      plan.push({ e, uuid: hit.id, legacy, existing: true });
      continue;
    }
    if (!prn) { stats.personnel.flagged++; flagItem("esf7_personnel_profile", "missing_prn", "missing or placeholder prn (NOT NULL UNIQUE); not migrated", { id: legacy, name: e.name || null }); continue; }
    if (seenPrn.has(prn)) { stats.personnel.flagged++; flagItem("esf7_personnel_profile", "prn_collision_in_payload", `prn ${prn} also used by ${seenPrn.get(prn)}; second entry not migrated`, { id: legacy }); continue; }
    let firstName = first(e, "firstName", "first_name", "first");
    let lastName = first(e, "lastName", "last_name", "last");
    if ((!firstName || !lastName) && txt(e.name) && String(e.name).includes(",")) {
      const [l, f] = String(e.name).split(",").map((s) => s.trim());
      lastName = lastName || l || null; firstName = firstName || f || null;
    }
    if (!firstName || !lastName) { stats.personnel.flagged++; flagItem("esf7_personnel_profile", "missing_name", "first/last name missing (NOT NULL); not migrated", { id: legacy }); continue; }
    seenPrn.set(prn, legacy);
    e.__first = firstName; e.__last = lastName;
    const birthdate = dateFrom(e, ["birthdate", "birthDate"], "birthday_dd", "birthday_mm", "birthday_yyyy", "birthdate", ctx);
    e.__birthdate = birthdate;
    const nk = `${lastName.toUpperCase()}|${firstName.toUpperCase()}|${birthdate || ""}`;
    const dup = byName.get(nk) || namesNew.get(nk);
    if (dup && birthdate) flagItem("esf7_personnel_profile", "possible_duplicate", `same name+birthdate as ${dup.legacy_id || dup.id || dup}, different id/prn; not merged`, { id: legacy, prn }, true);
    namesNew.set(nk, legacy);
    if (fmt !== "PER") {
      stats.personnel.noncanonical_new_unreferenced++;
      ctxRun.noncanonicalNew.push({ schoolId, id: legacy, format: fmt });
    }
    stats.personnel.to_insert++;
    stats.tables.esf7_personnel_profile.planned++;
    plan.push({ e, uuid: crypto.randomUUID(), legacy, existing: false, fmt, prn });
  }

  // which existing persons already have rows per child table
  const existingUuids = plan.filter((p) => p.existing).map((p) => p.uuid);
  const has = async (table) => {
    if (!existingUuids.length) return new Set();
    const r = await q(`SELECT DISTINCT personnel_id FROM ${table} WHERE personnel_id = ANY($1::text[])`, [existingUuids]);
    return new Set(r.rows.map((x) => x.personnel_id));
  };
  const haveEmp = await has("esf7_personnel_employment");
  const haveEdu = await has("esf7_perssonel_educ");
  const haveDes = await has("esf7_personnel_designations");
  const haveWkl = await has("esf7_workload_rows");
  const haveAdm = await has("esf7_admin_task");
  const haveRel = await has("esf7_related_task");

  // ---- insert profile for new persons first (FK parents)
  const ins = async (table, sql, params) => {
    if (!apply) return 1;
    const r = await q(sql, params);
    return r.rowCount;
  };
  const sy = (e) => normalizeSchoolYear(first(e, "schoolYear", "school_year") || "SY 26-27");
  const live = []; // persons whose profile now exists
  for (const p of plan) {
    if (p.existing) { live.push(p); continue; }
    const e = p.e;
    let sex = (first(e, "sexAtBirth", "sex_at_birth", "gender", "sex") || "").toUpperCase();
    if (sex !== "MALE" && sex !== "FEMALE") { if (sex) flagItem("esf7_personnel_profile", "coerced_to_null", `sex "${sex}" stored as NULL`, { id: p.legacy }); sex = null; }
    let type = (first(e, "type") || "teaching").toLowerCase();
    if (!["teaching", "teaching-related", "non-teaching"].includes(type)) { flagItem("esf7_personnel_profile", "coerced_value", `type "${type}" -> teaching`, { id: p.legacy }); type = "teaching"; }
    const solo = first(e, "soloParent", "solo_parent");
    const n = await ins("esf7_personnel_profile",
      `INSERT INTO esf7_personnel_profile (id, legacy_id, status, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name,
         name_extension, tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age, philsys_no, employee_no,
         deped_email, is_school_head, term, no_philsys, no_deped_email, allow_email_discrepancy, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,'{}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [p.uuid, p.legacy, STATUS_BY_FORMAT[p.fmt], p.prn, schoolId, sy(e), type, first(e, "salutation") || "MR.", e.__first, first(e, "middleName", "middle_name", "middle"), e.__last,
        first(e, "nameExtension", "name_extension", "extensionName"), first(e, "tin"), firstBool(e, "noTin", "no_tin"), sex, (first(e, "civilStatus", "civil_status") || "").toUpperCase() || null,
        solo ? bool(solo) : false, first(e, "religion"), first(e, "ethnicGroup", "ethnic_group", "ehtinic_group"), e.__birthdate, int(e.age),
        first(e, "philsysNo", "philsys_no", "phylsys_num"), first(e, "employeeNo", "employee_no"), first(e, "depedEmail", "deped_email", "email"),
        firstBool(e, "isSchoolHead", "is_school_head"), first(e, "term") || "1st", firstBool(e, "noPhilsys", "no_philsys"), firstBool(e, "noDepedEmail", "no_deped_email"),
        firstBool(e, "allowEmailDiscrepancy", "allow_email_discrepancy")]);
    if (n === 1) {
      stats.tables.esf7_personnel_profile.inserted++;
      stats.personnel.inserted++;
      live.push(p);
      if (apply && p.legacy && p.legacy !== p.uuid) {
        await q(
          `INSERT INTO esf7_personnel_id_mapping (legacy_id, new_id, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (legacy_id) DO UPDATE SET new_id = EXCLUDED.new_id, status = EXCLUDED.status`,
          [p.legacy, p.uuid, STATUS_BY_FORMAT[p.fmt] || "canonical"],
        ).catch(() => {});
      }
    } else {
      stats.tables.esf7_personnel_profile.skipped_existing++;
      stats.personnel.existing_won++;
      stats.personnel.to_insert--;
      flagItem("esf7_personnel_profile", "insert_conflict", "profile insert skipped by DB conflict (prn/id taken meanwhile)", { id: p.legacy }, true);
    }
  }

  // ---- children
  const sectionsSeen = new Map();
  const placeholders = {}; // NOT NULL employment columns filled with 'UNSPECIFIED' (informational, one record per school)
  const wklIdsSeen = new Set(); const admIdsSeen = new Set(); const relIdsSeen = new Set();
  // predict global id conflicts for explicit child ids
  const explicit = (rows, k) => rows.map((r) => txt(r?.id)).filter(Boolean);
  const allW = live.flatMap((p) => (Array.isArray(p.e.workloadRows) ? p.e.workloadRows : []));
  const takenW = new Set((await q("SELECT id FROM esf7_workload_rows WHERE id = ANY($1::text[])", [explicit(allW)])).rows.map((r) => r.id));
  const allA = live.flatMap((p) => [...(p.e.administrativeRows || []), ...(p.e.administrative_rows || [])].filter((x) => x && typeof x === "object"));
  const takenA = new Set((await q("SELECT id FROM esf7_admin_task WHERE id = ANY($1::text[])", [explicit(allA)])).rows.map((r) => r.id));
  const allR = live.flatMap((p) => (Array.isArray(p.e.teachingRelatedRows) ? p.e.teachingRelatedRows : []));
  const takenR = new Set((await q("SELECT id FROM esf7_related_task WHERE id = ANY($1::text[])", [explicit(allR)])).rows.map((r) => r.id));

  for (const p of live) {
    const e = p.e; const u = p.uuid; const T = stats.tables;

    // employment
    if (!haveEmp.has(u)) {
      const type = (first(e, "type") || "teaching").toLowerCase();
      let cat = (first(e, "positionCategory", "position_category") || ({ teaching: "TEACHING", "teaching-related": "RELATED TEACHING", "non-teaching": "NON-TEACHING" }[type] || "TEACHING")).toUpperCase();
      if (cat === "TEACHING-RELATED") cat = "RELATED TEACHING";
      if (!["TEACHING", "RELATED TEACHING", "NON-TEACHING"].includes(cat)) { flagItem("esf7_personnel_employment", "coerced_value", `position_category "${cat}" -> TEACHING`, { id: p.legacy }); cat = "TEACHING"; }
      const req = (v, col) => { if (v) return v; placeholders[col] = (placeholders[col] || 0) + 1; return "UNSPECIFIED"; };
      T.esf7_personnel_employment.read++; T.esf7_personnel_employment.planned++; stats.items++;
      const step = Math.max(1, Math.min(8, int(first(e, "stepIncrement", "step_increment")) || 1));
      const n = await ins("emp",
        `INSERT INTO esf7_personnel_employment (id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment, hiring_arrangement,
           deployment_status, assigned_schools, grade_levels_taught, first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,'{}'::jsonb) ON CONFLICT DO NOTHING`,
        [`EMP-${p.legacy}`, u, cat, req(first(e, "position", "position_title", "plantilla_position"), "position"), step, req(first(e, "fundSource", "fund_source"), "fund_source"),
          req(first(e, "natureOfAppointment", "nature_of_appointment"), "nature_of_appointment"), req(first(e, "hiringArrangement", "hiring_arrangement"), "hiring_arrangement"),
          first(e, "deploymentStatus", "deployment_status", "status__item_") || "OWN STATION",
          JSON.stringify(arr(e.assignedSchools) || arr(e.assigned_schools) || []), JSON.stringify(arr(e.gradeLevelsTaught) || arr(e.grade_levels_taught) || arr(e.assignedGradeLevels) || arr(e.assigned_grade_levels) || []),
          dateFrom(e, ["firstServiceDate", "first_service_date"], "appt_dd", "appt_mm", "appt_yyyy", "firstServiceDate", ctx),
          dateFrom(e, ["lastPromotionDate", "last_promotion_date"], "x", "x", "x", "lastPromotionDate", ctx),
          dateFrom(e, ["newStationDate", "new_station_date"], "station_dd", "station_mm", "station_yyyy", "newStationDate", ctx),
          dateFrom(e, ["lastLateralMovementDate", "last_lateral_movement_date"], "x", "x", "x", "lastLateralMovementDate", ctx)]);
      if (n === 1) T.esf7_personnel_employment.inserted++; else T.esf7_personnel_employment.skipped_existing++;
    } else T.esf7_personnel_employment.skipped_existing++;

    // education
    if (!haveEdu.has(u)) {
      T.esf7_perssonel_educ.read++; T.esf7_perssonel_educ.planned++; stats.items++;
      const degs = [e.degreeRows, e.collegeDegrees, e.college_degrees].filter(Array.isArray).sort((a, b) => b.length - a.length)[0] || [];
      const d0 = degs[0] || {};
      let pg = e.postGraduateDiscipline ?? e.post_graduate_discipline;
      if (typeof pg === "string") { try { pg = JSON.parse(pg); } catch { pg = txt(pg) ? { text: pg } : {}; } }
      if (!pg || typeof pg !== "object") pg = {};
      const extra = { masters: e.mastersDisciplines, mastersGraduated: e.mastersGraduatedDisciplines, mastersWithUnits: e.mastersWithUnitsDisciplines,
        doctorate: e.doctorateDisciplines, doctorateGraduated: e.doctorateGraduatedDisciplines, doctorateWithUnits: e.doctorateWithUnitsDisciplines };
      if (!Object.keys(pg).length) for (const [k, v] of Object.entries(extra)) if (Array.isArray(v) && v.length) pg[k] = v;
      const elig = Array.isArray(e.eligibility) ? e.eligibility : txt(e.eligibility) ? [String(e.eligibility).trim()] : [];
      const n = await ins("edu",
        `INSERT INTO esf7_perssonel_educ (id, personnel_id, college_degree, major, minor, post_graduate_degree, post_graduate_discipline, eligibility, prc_specialization,
           raw_payload, highest_educational_attainment, shs_track, vocational_course, vocational_level, college_degrees)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,'N/A'),$7::jsonb,$8::jsonb,$9,'{}'::jsonb,COALESCE($10,'COLLEGE GRADUATE / BACCALAUREATE'),$11,$12,$13,$14::jsonb) ON CONFLICT DO NOTHING`,
        [`EDU-${p.legacy}`, u, first(e, "collegeDegree", "college_degree", "degree_finished__baccalaureate") || txt(d0.collegeDegree), first(e, "major", "major__specialization") || txt(d0.major),
          first(e, "minor") || txt(d0.minor), first(e, "postGraduateDegree", "post_graduate_degree", "post_graduate__degree"), JSON.stringify(pg), JSON.stringify(elig),
          first(e, "prcSpecialization", "prc_specialization"), first(e, "highestEducationalAttainment", "highest_educational_attainment"), first(e, "shsTrack", "shs_track"),
          first(e, "vocationalCourse", "vocational_course"), first(e, "vocationalLevel", "vocational_level"), JSON.stringify(degs)]);
      if (n === 1) T.esf7_perssonel_educ.inserted++; else T.esf7_perssonel_educ.skipped_existing++;
    } else T.esf7_perssonel_educ.skipped_existing++;

    // designations
    if (!haveDes.has(u)) {
      const names = [];
      const add = (v) => { const s = typeof v === "string" ? txt(v) : v && typeof v === "object" ? first(v, "name", "designation_name", "designation") : null; if (s && !names.includes(s)) names.push(s); };
      if (Array.isArray(e.designations)) e.designations.forEach(add);
      add(e.designation);
      for (const nm of names) {
        T.esf7_personnel_designations.read++; T.esf7_personnel_designations.planned++; stats.items++;
        const n = await ins("des",
          `INSERT INTO esf7_personnel_designations (id, personnel_id, designation_name, serialized_key, raw_payload) VALUES ($1,$2,$3,$4,'{}'::jsonb) ON CONFLICT DO NOTHING`,
          [`DES-${hash(u, nm)}`, u, nm, nm.toUpperCase()]);
        if (n === 1) T.esf7_personnel_designations.inserted++; else T.esf7_personnel_designations.skipped_existing++;
      }
    }

    // workload rows
    if (!haveWkl.has(u) && Array.isArray(e.workloadRows)) {
      const nk = new Set();
      for (const w of e.workloadRows) {
        if (!w || typeof w !== "object") continue;
        T.esf7_workload_rows.read++; stats.items++;
        const subject = first(w, "subject", "subjectName", "subject_name", "task");
        if (!subject) { flagItem("esf7_workload_rows", "required_missing", "workload row without subject (NOT NULL); not migrated", { id: w.id, personnel: p.legacy }); continue; }
        const start = time(w.startTime ?? w.start_time); const end = time(w.endTime ?? w.end_time);
        const days = Array.isArray(w.days) ? w.days.map((d) => String(d).trim().toUpperCase()) : [];
        const secName = first(w, "sectionName", "section_name"); const secId = first(w, "sectionId", "section_id");
        const key = [subject.toUpperCase(), secName || "", start, end, days.join(","), first(w, "term") || "1st"].join("|");
        if (nk.has(key)) continue; nk.add(key);
        const id = txt(w.id) || `WKL-${hash(u, key)}`;
        if (takenW.has(id) || wklIdsSeen.has(id)) { T.esf7_workload_rows.id_conflict++; flagItem("esf7_workload_rows", "id_conflict", `workload id ${id} already used by another row; not migrated`, { personnel: p.legacy }); continue; }
        wklIdsSeen.add(id);
        const row = { id, personnel_id: u, school_id: schoolId, school_year: sy(e), grade_level: first(w, "gradeLevel", "grade_level"), section_id: secId, section_name: secName,
          subject, subject_id: first(w, "subjectId", "subject_id"), remediation_subject: first(w, "remediationSubject", "remediation_subject"), start_time: start, end_time: end, days, term: first(w, "term") || "1st" };
        if (secId || secName) { const sk = `${secId || ""}|${row.grade_level || ""}|${secName || ""}`; if (!sectionsSeen.has(sk)) sectionsSeen.set(sk, { sectionId: secId, gradeLevel: row.grade_level, sectionName: secName }); }
        T.esf7_workload_rows.planned++;
        const n = await ins("wkl",
          `INSERT INTO esf7_workload_rows (id, personnel_id, school_id, school_year, grade_level, section_id, section_name, subject, subject_id, remediation_subject, start_time, end_time, days, term, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb) ON CONFLICT (id) DO NOTHING`,
          [id, u, schoolId, row.school_year, row.grade_level, secId, secName, subject, row.subject_id, row.remediation_subject, start, end, JSON.stringify(days), row.term, JSON.stringify(buildWorkloadExtras(w, row))]);
        if (n === 1) T.esf7_workload_rows.inserted++; else T.esf7_workload_rows.id_conflict++;
      }
    } else if (haveWkl.has(u)) T.esf7_workload_rows.skipped_existing++;

    // admin tasks
    if (!haveAdm.has(u)) {
      const rows = [...(Array.isArray(e.administrativeRows) ? e.administrativeRows : []), ...(Array.isArray(e.administrative_rows) ? e.administrative_rows : [])];
      const seen = new Set();
      const TYPED = new Set(["id", "personnelId", "personnel_id", "schoolId", "school_id", "schoolYear", "school_year", "taskName", "task_name", "task", "taskCategory", "category", "durationMinutes", "duration_minutes",
        "startTime", "start_time", "endTime", "end_time", "days", "term", "dates", "startDate", "start_date", "endDate", "end_date", "termTotalHours", "isDesignationSynced", "is_designation_synced", "status", "rawPayload"]);
      for (const a of rows) {
        if (!a || typeof a !== "object") continue;
        T.esf7_admin_task.read++; stats.items++;
        const name = first(a, "taskName", "task_name", "task");
        if (!name) { flagItem("esf7_admin_task", "required_missing", "admin row without task name; not migrated", { personnel: p.legacy }); continue; }
        const st = time(a.startTime ?? a.start_time); const en = time(a.endTime ?? a.end_time);
        const days = Array.isArray(a.days) ? a.days : []; const term = first(a, "term") || "1st";
        const id = txt(a.id) || `ADM-${hash(u, name, term, st, en, days.join(","))}`;
        if (seen.has(id)) continue; seen.add(id);
        if (takenA.has(id) || admIdsSeen.has(id)) { T.esf7_admin_task.id_conflict++; flagItem("esf7_admin_task", "id_conflict", `admin id ${id} already used; not migrated`, { personnel: p.legacy }); continue; }
        admIdsSeen.add(id);
        const extras = {}; for (const [k, v] of Object.entries(a)) if (!TYPED.has(k)) extras[k] = v;
        const dur = int(a.durationMinutes ?? a.duration_minutes) ?? (num(a.hours) !== null ? Math.round(num(a.hours) * 60) : 60);
        T.esf7_admin_task.planned++;
        const n = await ins("adm",
          `INSERT INTO esf7_admin_task (id, personnel_id, school_id, school_year, task_name, dates, duration_minutes, task_category, start_date, end_date, start_time, end_time, days, term, term_total_hours, is_designation_synced, status, extras)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,COALESCE($17,'ACTIVE'),$18::jsonb) ON CONFLICT (id) DO NOTHING`,
          [id, u, schoolId, sy(e), name, JSON.stringify(Array.isArray(a.dates) ? a.dates : []), dur, first(a, "taskCategory", "category"),
            dateFrom(a, ["startDate", "start_date"], "x", "x", "x", "startDate", ctx), dateFrom(a, ["endDate", "end_date"], "x", "x", "x", "endDate", ctx), st, en, JSON.stringify(days), term,
            num(a.termTotalHours) ?? 0, firstBool(a, "isDesignationSynced", "is_designation_synced"), first(a, "status"), JSON.stringify(extras)]);
        if (n === 1) T.esf7_admin_task.inserted++; else T.esf7_admin_task.id_conflict++;
      }
    } else T.esf7_admin_task.skipped_existing++;

    // related tasks
    if (!haveRel.has(u) && Array.isArray(e.teachingRelatedRows)) {
      const TYPED = new Set(["id", "task_name", "task", "frequency", "cadence", "durationMinutes", "duration_minutes", "isDesignationSynced"]);
      const seen = new Set();
      for (const r of e.teachingRelatedRows) {
        if (!r || typeof r !== "object") continue;
        T.esf7_related_task.read++; stats.items++;
        const name = first(r, "task_name", "task");
        if (!name) { flagItem("esf7_related_task", "required_missing", "related task without name; not migrated", { personnel: p.legacy }); continue; }
        const freq = (first(r, "frequency", "cadence") || "weekly").toLowerCase();
        const id = txt(r.id) || `TRT-${hash(u, name, freq)}`;
        if (seen.has(id)) continue; seen.add(id);
        if (takenR.has(id) || relIdsSeen.has(id)) { T.esf7_related_task.id_conflict++; flagItem("esf7_related_task", "id_conflict", `related id ${id} already used; not migrated`, { personnel: p.legacy }); continue; }
        relIdsSeen.add(id);
        const extras = {}; for (const [k, v] of Object.entries(r)) if (!TYPED.has(k)) extras[k] = v;
        const dur = int(r.durationMinutes ?? r.duration_minutes) ?? (num(r.hours) !== null ? Math.round(num(r.hours) * 60) : 60);
        T.esf7_related_task.planned++;
        const n = await ins("rel",
          `INSERT INTO esf7_related_task (id, personnel_id, school_id, school_year, task_name, frequency, duration_minutes, is_designation_synced, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (id) DO NOTHING`,
          [id, u, schoolId, sy(e), name, freq, dur, firstBool(r, "isDesignationSynced"), JSON.stringify(extras)]);
        if (n === 1) T.esf7_related_task.inserted++; else T.esf7_related_task.id_conflict++;
      }
    } else if (haveRel.has(u)) T.esf7_related_task.skipped_existing++;
  }

  if (Object.keys(placeholders).length) {
    review.push({ schoolId, table: "esf7_personnel_employment", kind: "required_placeholder", informational: true,
      reason: "NOT NULL columns missing in cache; stored as 'UNSPECIFIED' (value not invented)", columns: placeholders });
  }
  if (sectionsSeen.size) {
    review.push({ schoolId, table: "esf7_regular_sections|esf7_sned_sections|esf7_als_sections", kind: "sections_not_created",
      reason: "cache has no section objects (no learner counts/advisers); sections referenced by workload rows were not created", sections: [...sectionsSeen.values()].slice(0, 200), count: sectionsSeen.size });
  }
  return { stats, review, existingWonList };
}
const arr = (v) => (Array.isArray(v) ? v : null);

// ---------------------------------------------------------------- backup
async function writeBackup(file, schoolIds, sessionDb) {
  const fd = fs.openSync(file, "w");
  const shas = new Map();
  fs.writeSync(fd, `{"database":${JSON.stringify(sessionDb)},"created_at":${JSON.stringify(new Date().toISOString())},"rows":[\n`);
  let first_ = true;
  for (const id of schoolIds) {
    const r = await db.query("SELECT school_id, roster_json, updated_at FROM esf7_room_roster_cache WHERE school_id = $1", [id]);
    if (!r.rows[0]) continue;
    const line = JSON.stringify({ school_id: r.rows[0].school_id, updated_at: r.rows[0].updated_at, roster_json: r.rows[0].roster_json });
    shas.set(id, crypto.createHash("sha256").update(line).digest("hex"));
    fs.writeSync(fd, (first_ ? "" : ",\n") + line);
    first_ = false;
  }
  fs.writeSync(fd, "\n]}\n");
  fs.closeSync(fd);
  // re-read and verify
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let ok = 0;
  for await (let line of rl) {
    if (!line.startsWith("{\"school_id\"") && !line.startsWith(",{\"school_id\"")) continue;
    line = line.replace(/^,/, "");
    const sid = JSON.parse(line).school_id;
    if (shas.get(sid) !== crypto.createHash("sha256").update(line).digest("hex")) throw new Error(`Backup verification failed for school ${sid}`);
    ok++;
  }
  if (ok !== shas.size) throw new Error(`Backup verification failed: read ${ok} rows, wrote ${shas.size}`);
  return { rows: ok, bytes: fs.statSync(file).size };
}

async function cacheSnapshot() {
  const r = await db.query("SELECT count(*)::int AS n, COALESCE(sum(pg_column_size(roster_json)),0)::bigint AS payload_bytes, pg_total_relation_size('esf7_room_roster_cache')::bigint AS total_bytes FROM esf7_room_roster_cache");
  return { rows: r.rows[0].n, payload_bytes: String(r.rows[0].payload_bytes), total_relation_bytes: String(r.rows[0].total_bytes) };
}

// ---------------------------------------------------------------- main
async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const session = await enforceSafetyGate(opts);
  const started = new Date();
  const ts = started.toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(opts.outDir || path.join("migration-output", "room-roster-cache", ts));
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[room-roster] db=${session.current_db} mode=${opts.apply ? "APPLY" : "DRY-RUN"} out=${outDir}`);

  const before = await cacheSnapshot();
  const all = (await db.query("SELECT school_id FROM esf7_room_roster_cache ORDER BY school_id")).rows.map((r) => r.school_id);
  const known = new Set(all);
  const selected = opts.schools.length ? opts.schools.filter((s) => known.has(s)) : all;
  const missingSchools = opts.schools.filter((s) => !known.has(s));

  const cacheOnly = new Set((await db.query("SELECT c.school_id FROM esf7_room_roster_cache c WHERE NOT EXISTS (SELECT 1 FROM esf7_personnel_profile p WHERE p.school_id = c.school_id)")).rows.map((r) => r.school_id));

  let backup = null;
  if (opts.apply && selected.length) {
    backup = await writeBackup(path.join(outDir, `backup_${ts}.json`), selected, session.current_db);
    console.log(`[room-roster] backup verified: ${backup.rows} rows, ${backup.bytes} bytes`);
  }

  const total = newStats();
  const inv = new Map();
  const needsReview = [];
  const existingWon = [];
  const failed = [];
  const ctxRun = { noncanonicalNew: [] };
  let processed = 0; let halted = null;
  let cacheOnlySelected = 0, cacheOnlyNowHavePersonnel = 0;

  for (let i = 0; i < selected.length && !halted; i += opts.batchSize) {
    const batch = selected.slice(i, i + opts.batchSize);
    let batchFailed = 0;
    for (const schoolId of batch) {
      const row = (await db.query("SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1", [schoolId])).rows[0];
      const client = opts.apply ? await db.pool.connect() : null;
      try {
        if (client) await client.query("BEGIN");
        const invLocal = new Map();
        const res = await processSchool({ client, schoolId, payload: row.roster_json, apply: opts.apply, inv: invLocal, needsReview, ctxRun });
        if (client) await client.query("COMMIT");
        mergeStats(total, res.stats);
        needsReview.push(...res.review);
        existingWon.push(...res.existingWonList);
        for (const [k, v] of invLocal) {
          const g = inv.get(k) || { n: 0, schools: new Set(), sample: null, sampleSchool: v.sampleSchool };
          g.n += v.n; v.schools.forEach((s) => g.schools.add(s)); if (g.sample === null) { g.sample = v.sample; g.sampleSchool = v.sampleSchool; }
          inv.set(k, g);
        }
        processed++;
        if (cacheOnly.has(schoolId)) cacheOnlySelected++;
      } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        batchFailed++;
        if (err.code === "23503") total.fk_failures++;
        failed.push({ schoolId, code: err.code || null, error: err.message });
        console.error(`[room-roster] school ${schoolId} FAILED: ${err.message}`);
      } finally {
        if (client) client.release();
      }
    }
    const done = processed + failed.length;
    if (opts.apply && done >= HALT.minSchoolsForRate) {
      if (total.items && total.flagged / total.items > HALT.flaggedRate) halted = `flagged ${total.flagged}/${total.items} items exceeds ${HALT.flaggedRate * 100}%`;
      else if (total.items && total.fk_failures / total.items > HALT.fkRate) halted = `FK failures ${total.fk_failures} exceed ${HALT.fkRate * 100}%`;
      else if (failed.length / done > HALT.failedSchoolRate) halted = `${failed.length}/${done} schools failed (> ${HALT.failedSchoolRate * 100}%)`;
    }
    if (halted) console.error(`[room-roster] HALTED after batch ${i / opts.batchSize + 1}: ${halted}`);
    else console.log(`[room-roster] batch ${Math.floor(i / opts.batchSize) + 1}: ${done}/${selected.length} schools, flagged ${total.flagged}, failed ${failed.length}`);
  }

  // classify inventory -> needs_review (unknown and out_of_scope keys; mapped/skipped are documented only)
  const keyReport = [];
  for (const [p, v] of [...inv.entries()].sort()) {
    const c = classify(p);
    keyReport.push({ path: p, disposition: c.disposition, target: c.target, occurrences: v.n, schools: v.schools.size });
    if (c.disposition === "unknown" || c.disposition === "out_of_scope") {
      needsReview.push({ schoolId: v.sampleSchool, table: c.target, kind: c.disposition === "unknown" ? "unmapped_key" : "out_of_scope_key", reason: c.note || "target table outside this skill",
        key: p, occurrences: v.n, schools: v.schools.size, sample: v.sample });
    }
  }
  if (ctxRun.noncanonicalNew.length) {
    needsReview.push({ schoolId: "*", table: "esf7_personnel_profile", kind: "non_canonical_unreferenced", informational: true,
      reason: "non-canonical cache ids (local-p-/P-HARVEST-/other) kept unchanged in legacy_id; decide on re-keying later",
      count: ctxRun.noncanonicalNew.length, sample: ctxRun.noncanonicalNew.slice(0, 25) });
  }

  const after = await cacheSnapshot();
  if (opts.apply) {
    const r = await db.query("SELECT count(DISTINCT school_id)::int AS n FROM esf7_personnel_profile WHERE school_id = ANY($1::text[])", [[...cacheOnly]]);
    cacheOnlyNowHavePersonnel = r.rows[0].n;
  }
  const cacheUnchanged = before.rows === after.rows && before.payload_bytes === after.payload_bytes && before.total_relation_bytes === after.total_relation_bytes;

  const summary = {
    mode: opts.apply ? "apply" : "dry-run", database: session.current_db, started_at: started.toISOString(), finished_at: new Date().toISOString(),
    schools: { selected: selected.length, processed, failed: failed.length, not_in_cache: missingSchools, cache_only_in_selection: cacheOnlySelected, cache_only_total_before: cacheOnly.size, cache_only_now_with_personnel: cacheOnlyNowHavePersonnel },
    personnel: total.personnel, tables: total.tables, items: total.items, flagged: total.flagged, fk_failures: total.fk_failures,
    failed_schools: failed, halted, backup, cache_before: before, cache_after: after, cache_unchanged: cacheUnchanged,
    existing_won_count: existingWon.length, key_inventory: keyReport,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, "needs_review.json"), JSON.stringify(needsReview, null, 2));
  fs.writeFileSync(path.join(outDir, "existing_won.json"), JSON.stringify(existingWon, null, 2));
  fs.writeFileSync(path.join(outDir, "report.md"), buildReport(summary, needsReview));
  printSummary(summary);
  console.log(`[room-roster] outputs in ${outDir}`);
  if (failed.length || halted || !cacheUnchanged) process.exitCode = 1;
  return summary;
}

function buildReport(s, nr) {
  const t = s.tables; const p = s.personnel;
  const kinds = {}; nr.forEach((r) => (kinds[r.kind] = (kinds[r.kind] || 0) + 1));
  const lines = [
    `# Room roster cache migration - ${s.mode} on ${s.database}`,
    ``, `Run: ${s.started_at} -> ${s.finished_at}`, ``,
    `## Schools`, `- selected: ${s.schools.selected} | processed: ${s.schools.processed} | failed: ${s.schools.failed}`,
    `- cache-only schools (no normalized personnel) in selection: ${s.schools.cache_only_in_selection} of ${s.schools.cache_only_total_before} in the whole cache`,
    ...(s.mode === "apply" ? [`- cache-only schools that now have normalized personnel: ${s.schools.cache_only_now_with_personnel}`] : []),
    ...(s.schools.not_in_cache.length ? [`- requested but not in cache: ${s.schools.not_in_cache.join(", ")}`] : []),
    ``, `## Personnel`,
    `- entries in payloads: ${p.entries} | unique ids: ${p.unique} | repeated entries collapsed: ${p.duplicates_collapsed}`,
    `- id formats: PER ${p.by_format.PER}, local-p ${p.by_format["local-p"]}, P-HARVEST ${p.by_format["P-HARVEST"]}, other ${p.by_format.other}`,
    `- already in normalized (existing row won): ${p.existing_won} (non-canonical ids among them, kept unchanged: ${p.noncanonical_existing_preserved})`,
    `- to insert: ${p.to_insert} | inserted: ${p.inserted} | new non-canonical ids kept in legacy_id: ${p.noncanonical_new_unreferenced}`,
    `- flagged (not migrated): ${p.flagged}`, ``, `## Tables (planned / inserted / already present / id conflict)`,
    ...Object.entries(t).map(([k, v]) => `- ${k}: ${v.planned} / ${v.inserted} / ${v.skipped_existing} / ${v.id_conflict}`),
    ``, `## Review`, `- flagged items: ${s.flagged} of ${s.items} processed items | FK failures: ${s.fk_failures}`,
    `- needs_review entries by kind: ${Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`,
    ``, `## Cache safety`, `- before: ${JSON.stringify(s.cache_before)}`, `- after:  ${JSON.stringify(s.cache_after)}`, `- unchanged: ${s.cache_unchanged}`,
    ...(s.backup ? [`- backup: ${s.backup.rows} rows, ${s.backup.bytes} bytes (verified by re-read)`] : []),
    ...(s.halted ? [``, `## HALTED`, s.halted] : []),
    ...(s.failed_schools.length ? [``, `## Failed schools`, ...s.failed_schools.map((f) => `- ${f.schoolId}: ${f.error}`)] : []),
  ];
  return lines.join("\n") + "\n";
}

function printSummary(s) {
  console.log("\n=== SUMMARY ===");
  console.log(`schools: selected ${s.schools.selected}, processed ${s.schools.processed}, failed ${s.schools.failed}`);
  console.log(`personnel: found ${s.personnel.entries}, unique ${s.personnel.unique}, existing-won ${s.personnel.existing_won}, to-insert ${s.personnel.to_insert}, inserted ${s.personnel.inserted}, flagged ${s.personnel.flagged}`);
  console.log(`id formats: ${JSON.stringify(s.personnel.by_format)}; non-canonical existing preserved: ${s.personnel.noncanonical_existing_preserved}`);
  for (const [k, v] of Object.entries(s.tables)) console.log(`  ${k}: planned ${v.planned}, inserted ${v.inserted}, existing ${v.skipped_existing}, conflict ${v.id_conflict}`);
  console.log(`flagged ${s.flagged}/${s.items}, fk_failures ${s.fk_failures}, cache_unchanged ${s.cache_unchanged}${s.halted ? ", HALTED: " + s.halted : ""}`);
}

module.exports = { main };

if (require.main === module) {
  main()
    .then(() => db.closeAllPools?.())
    .then(() => process.exit(process.exitCode || 0))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
