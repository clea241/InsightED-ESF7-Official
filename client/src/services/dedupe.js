// (Client twin of server/utils/draftDedupe.js - keep the two identical; there is no shared layer yet.)
// Stable-key de-duplication for the lists stored inside a school draft (class sections, personnel).
// A record is "the same record" when it shares its id, or (sections) its grade level + section name.
// The first copy wins its position; later copies are merged INTO it (never appended), so running this
// any number of times on the same data gives the same result.

const norm = (v) =>
  String(v == null ? "" : v)
    .trim()
    .toUpperCase();

function sectionKeys(s) {
  const keys = [];
  if (s && s.id != null && String(s.id).trim() !== "")
    keys.push(`id:${norm(s.id)}`);
  const gl = norm(s && (s.gradeLevel || s.grade_level));
  const sn = norm(s && (s.sectionName || s.section_name));
  if (gl && sn) keys.push(`gs:${gl}::${sn}`);
  return keys;
}

const GENERIC_KEYS = new Set([
  "",
  "N/A",
  "NA",
  "NONE",
  "NULL",
  "UNDEFINED",
  "-",
  "0",
  "PRN-N/A",
  "PRN-NONE",
  "PRN-0",
]);

function isNonGenericKey(val) {
  if (val == null) return false;
  const s = String(val).trim().toUpperCase();
  if (!s || GENERIC_KEYS.has(s) || s.length < 2) return false;
  return true;
}

function personnelKeys(p) {
  const keys = [];
  if (p && isNonGenericKey(p.id)) keys.push(`id:${norm(p.id)}`);
  if (p && isNonGenericKey(p.prn)) keys.push(`prn:${norm(p.prn)}`);
  return keys;
}

// `later` overlays `earlier`, but empty values never erase real ones.
function overlay(earlier, later) {
  const out = { ...earlier };
  for (const [k, v] of Object.entries(later)) {
    if (k === "id" || k === "prn") continue; // the kept (original) record keeps its identity
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

function dedupeByKeys(list, keysOf) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const indexByKey = new Map();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const keys = keysOf(item);
    const hit = keys.map((k) => indexByKey.get(k)).find((i) => i !== undefined);
    if (hit === undefined) {
      out.push(item);
      keys.forEach((k) => indexByKey.set(k, out.length - 1));
    } else {
      out[hit] = overlay(out[hit], item);
      keys.forEach((k) => indexByKey.set(k, hit));
    }
  }
  return out;
}

const dedupeSections = (list) => dedupeByKeys(list, sectionKeys);
const dedupePersonnel = (list) => dedupeByKeys(list, personnelKeys);

export { dedupeSections, dedupePersonnel, sectionKeys, personnelKeys };
