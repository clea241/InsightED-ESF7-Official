// Stable-key de-duplication for the lists stored inside a school draft (class sections, personnel).
// A record is "the same record" when it shares its id, or (sections) its grade level + section name.
// The first copy wins its position; later copies are merged INTO it (never appended), so running this
// any number of times on the same data gives the same result.

const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();

function sectionKeys(s) {
  const keys = [];
  if (s && s.id != null && String(s.id).trim() !== '') keys.push(`id:${norm(s.id)}`);
  const gl = norm(s && (s.gradeLevel || s.grade_level));
  const sn = norm(s && (s.sectionName || s.section_name));
  if (gl && sn) keys.push(`gs:${gl}::${sn}`);
  return keys;
}

function personnelKeys(p) {
  const keys = [];
  if (p && p.id != null && String(p.id).trim() !== '') keys.push(`id:${norm(p.id)}`);
  if (p && p.prn != null && String(p.prn).trim() !== '') keys.push(`prn:${norm(p.prn)}`);
  return keys;
}

// `later` overlays `earlier`, but empty values never erase real ones.
function overlay(earlier, later) {
  const out = { ...earlier };
  for (const [k, v] of Object.entries(later)) {
    if (k === 'id' || k === 'prn') continue; // the kept (original) record keeps its identity
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

function dedupeByKeys(list, keysOf) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const indexByKey = new Map();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
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

module.exports = { dedupeSections, dedupePersonnel, sectionKeys, personnelKeys };
