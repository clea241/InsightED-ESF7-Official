// Canonical storage keys for ESF7 local drafts and migration from legacy keys.
// Enforces naming: schoolId + schoolYear (canonical "SY 26-27" format) + teacherId + term.

/**
 * Normalizes school year into canonical format, e.g. "2026-2027" -> "SY 26-27", "SY 26-27" -> "SY 26-27".
 */
export function canonicalSchoolYear(sy) {
  if (!sy) return "SY 26-27";
  const s = String(sy).trim();
  const m = s.match(/(\d{4})\s*-\s*(\d{4})/);
  if (m) {
    const start = m[1].slice(2);
    const end = m[2].slice(2);
    return `SY ${start}-${end}`;
  }
  if (/^SY\s*\d{2}-\d{2}$/i.test(s)) {
    return s.toUpperCase();
  }
  return s;
}

/**
 * Normalizes term slug, e.g. "1st Term" -> "term_1", "2nd Term" -> "term_2", "term_1" -> "term_1".
 */
export function canonicalTermSlug(term) {
  if (!term) return "";
  const t = String(term).trim().toLowerCase();
  if (t.includes("1st") || t === "term_1" || t === "1") return "term_1";
  if (t.includes("2nd") || t === "term_2" || t === "2") return "term_2";
  if (t.includes("3rd") || t === "term_3" || t === "3") return "term_3";
  return t.replace(/\s+/g, "_");
}

export function cleanSchoolId(schoolId) {
  return String(schoolId || "").replace(/^SCH-/i, "").trim();
}

/**
 * Canonical master school draft key in IndexedDB / localStorage.
 * e.g. "draft_300488_SY 26-27" or "draft_300488_SY 26-27_term_1"
 */
export function getSchoolDraftKey(schoolId, schoolYear, term = null) {
  const sid = cleanSchoolId(schoolId);
  const sy = canonicalSchoolYear(schoolYear);
  const t = canonicalTermSlug(term);
  return t ? `draft_${sid}_${sy}_${t}` : `draft_${sid}_${sy}`;
}

/**
 * Canonical teacher profile draft key in localStorage.
 * e.g. "draft_personnel_300488_SY 26-27_PER-001"
 */
export function getPersonnelDraftKey(schoolId, schoolYear, personnelId, term = null) {
  const sid = cleanSchoolId(schoolId);
  const sy = canonicalSchoolYear(schoolYear);
  const pid = String(personnelId || "").trim();
  const t = canonicalTermSlug(term);
  return t
    ? `draft_personnel_${sid}_${sy}_${pid}_${t}`
    : `draft_personnel_${sid}_${sy}_${pid}`;
}

/**
 * Canonical teacher workload draft key in localStorage.
 * e.g. "draft_workload_300488_SY 26-27_PER-001_term_1"
 */
export function getWorkloadDraftKey(schoolId, schoolYear, personnelId, term = null) {
  const sid = cleanSchoolId(schoolId);
  const sy = canonicalSchoolYear(schoolYear);
  const pid = String(personnelId || "").trim();
  const t = canonicalTermSlug(term);
  return t
    ? `draft_workload_${sid}_${sy}_${pid}_${t}`
    : `draft_workload_${sid}_${sy}_${pid}`;
}

/**
 * Reads from localStorage with automatic one-time migration from legacy keys.
 * Never deletes a legacy key until the data has been successfully written to the new key.
 *
 * @param {string} newKey - The target canonical key
 * @param {string[]} legacyKeys - Array of fallback legacy keys in order of precedence
 * @returns {string|null} Raw string value stored, or null if none found
 */
export function readMigratedLocalStorage(newKey, legacyKeys = []) {
  if (typeof window === "undefined" || !window.localStorage) return null;

  try {
    const currentVal = localStorage.getItem(newKey);
    if (currentVal !== null) return currentVal;

    for (const oldKey of legacyKeys) {
      if (!oldKey || oldKey === newKey) continue;
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null) {
        // Re-save under the canonical key first
        localStorage.setItem(newKey, oldVal);
        // Only delete oldKey after successful write to newKey
        localStorage.removeItem(oldKey);
        console.info(`[StorageKeyMigration] Migrated localStorage key "${oldKey}" -> "${newKey}"`);
        return oldVal;
      }
    }
  } catch (err) {
    console.warn(`[StorageKeyMigration] Error migrating key ${newKey}:`, err);
  }
  return null;
}

/**
 * Writes to localStorage under the canonical key, and cleans up any legacy keys.
 */
export function writeWithLegacyCleanup(newKey, val, legacyKeys = []) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const stringVal = typeof val === "string" ? val : JSON.stringify(val);
  localStorage.setItem(newKey, stringVal);
  for (const oldKey of legacyKeys) {
    if (oldKey && oldKey !== newKey) {
      try {
        localStorage.removeItem(oldKey);
      } catch (e) {}
    }
  }
  return true;
}
