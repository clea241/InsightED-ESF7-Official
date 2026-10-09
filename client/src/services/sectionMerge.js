// Pure rules for "database is the truth, the draft is only an overlay" for class sections.
// No React, storage or network, so it can be unit tested. Never appends: every draft entry is matched to a database
// row by stable key first (row id, then grade level + section name) and only genuine differences are applied.
import { dedupeSections, sectionKeys } from './dedupe';

// Single school-year helper (client twin of server/utils/schoolYear.js): "SY 2026-2027", "2026-2027", "26-27" -> "SY 26-27".
export function normalizeSchoolYear(value, fallback = 'SY 26-27') {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return fallback;
  const m = raw.match(/(\d{2,4})\s*[-/–]\s*(\d{2,4})/);
  if (!m) return raw;
  return `SY ${m[1].slice(-2)}-${m[2].slice(-2)}`;
}

const up = (v) => String(v == null ? '' : v).trim().toUpperCase();
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Only the fields a person can actually edit, normalized, so cosmetic differences never count as changes.
export function comparableSection(s) {
  return {
    grade: up(s.gradeLevel || s.grade_level),
    name: up(s.sectionName || s.section_name),
    type: up(s.sectionType || s.section_type || 'MONO GRADE'),
    advisor: up(s.advisorId || s.adviserId || s.advisor_id || s.adviser_id),
    total: num(s.numberOfLearners ?? s.number_of_learners),
    male: num(s.maleLearners ?? s.male_learners),
    female: num(s.femaleLearners ?? s.female_learners),
    program: up(s.specialProgramType),
    aralBasis: up(s.aralBasis),
    aralTool: up(s.aralToolKey)
  };
}

const sameContent = (a, b) => JSON.stringify(comparableSection(a)) === JSON.stringify(comparableSection(b));

// Keep only rows of the school year being loaded (tolerant of the "SY 26-27" / "SY 2026-2027" spellings).
export function inSchoolYear(list, schoolYear) {
  const want = normalizeSchoolYear(schoolYear);
  return (Array.isArray(list) ? list : []).filter((s) => {
    const y = s && (s.schoolYear || s.school_year);
    return !y || normalizeSchoolYear(y) === want;
  });
}

/**
 * @param dbRows       sections from the database (baseline)
 * @param draftRows    sections from the draft (overlay)
 * @param opts.deletedIds        ids the draft explicitly removed (an absent entry alone NEVER removes a database row)
 * @param opts.draftUpdatedAt    when the draft was last changed (ms or ISO)
 * @returns { merged, added, edited, removed, hasDifferences, draftIsOlder }
 */
export function mergeSectionsByKey(dbRows, draftRows, opts = {}) {
  const baseline = dedupeSections(dbRows);
  const draft = dedupeSections(draftRows);
  const deleted = new Set((opts.deletedIds || []).map(String));

  const indexByKey = new Map();
  baseline.forEach((s, i) => sectionKeys(s).forEach((k) => indexByKey.set(k, i)));

  const merged = baseline.map((s) => s);
  const added = [];
  const edited = [];

  for (const d of draft) {
    const hit = sectionKeys(d).map((k) => indexByKey.get(k)).find((i) => i !== undefined);
    if (hit === undefined) {
      if (d.id != null && deleted.has(String(d.id))) continue;
      merged.push(d);
      added.push(d);
      sectionKeys(d).forEach((k) => indexByKey.set(k, merged.length - 1));
    } else if (!sameContent(merged[hit], d)) {
      // The database row keeps its id; only the editable fields come from the draft.
      merged[hit] = { ...merged[hit], ...d, id: merged[hit].id };
      edited.push(merged[hit]);
    }
  }

  const removed = merged.filter((s) => s.id != null && deleted.has(String(s.id)));
  const final = merged.filter((s) => !(s.id != null && deleted.has(String(s.id))));

  const newestDb = baseline.reduce((mx, s) => Math.max(mx, s.updatedAt ? new Date(s.updatedAt).getTime() : 0), 0);
  const draftTime = opts.draftUpdatedAt ? new Date(opts.draftUpdatedAt).getTime() : 0;
  const draftIsOlder = Boolean(newestDb && draftTime && draftTime < newestDb);

  return { merged: final, added, edited, removed, hasDifferences: added.length + edited.length + removed.length > 0, draftIsOlder };
}

// ---------- unsaved-changes comparison ----------
const n0 = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

// Only what a person can edit, with derived/empty variants made equal (null = 0 learners, total = male + female when unset,
// grade/section/adviser case and spacing ignored). Order, ids, timestamps and display names are not part of it.
const editableFields = (s) => {
  const male = n0(s.maleLearners ?? s.male_learners);
  const female = n0(s.femaleLearners ?? s.female_learners);
  const rawTotal = s.numberOfLearners ?? s.number_of_learners;
  return {
    gradeLevel: up(s.gradeLevel || s.grade_level),
    sectionName: up(s.sectionName || s.section_name),
    sectionType: up(s.sectionType || s.section_type || 'MONO GRADE'),
    advisorId: up(s.advisorId || s.adviserId || s.advisor_id || s.adviser_id || s.tutorId),
    numberOfLearners: rawTotal === null || rawTotal === undefined || rawTotal === '' ? male + female : n0(rawTotal),
    maleLearners: male,
    femaleLearners: female,
    specialProgramType: up(s.specialProgramType),
    aralBasis: up(s.aralBasis),
    aralToolKey: up(s.aralToolKey)
  };
};

/**
 * What differs between the saved sections and the current ones, as [{ section, field, from, to }]. Matched by stable
 * key (row id, else grade + section name), so ordering and regenerated ids never count. Empty array = clean.
 */
export function diffSections(savedList, currentList) {
  const saved = dedupeSections(savedList);
  const current = dedupeSections(currentList);
  const index = new Map();
  saved.forEach((s, i) => sectionKeys(s).forEach((k) => index.set(k, i)));
  const matched = new Set();
  const out = [];
  const label = (s) => `${s.gradeLevel || s.grade_level || '?'} ${s.sectionName || s.section_name || '?'}`.trim();
  for (const cur of current) {
    const hit = sectionKeys(cur).map((k) => index.get(k)).find((i) => i !== undefined);
    if (hit === undefined) { out.push({ section: label(cur), field: '(section)', from: null, to: 'added' }); continue; }
    matched.add(hit);
    const a = editableFields(saved[hit]);
    const b = editableFields(cur);
    for (const f of Object.keys(a)) if (a[f] !== b[f]) out.push({ section: label(cur), field: f, from: a[f], to: b[f] });
  }
  saved.forEach((s, i) => { if (!matched.has(i)) out.push({ section: label(s), field: '(section)', from: 'present', to: 'removed' }); });
  return out;
}
