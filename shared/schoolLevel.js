// School-level rules shared by client and server.
// A Department Head per key stage only applies where Key Stage 3/4 (JHS/SHS) is offered; elementary-only
// schools (Kinder-Grade 6) do not need one. If the offering is unknown/empty we keep the old behavior (required).
export const offersSecondary = (curricularOffering) => {
  const list = Array.isArray(curricularOffering)
    ? curricularOffering.map((o) => String(o).toUpperCase())
    : [];
  if (list.length === 0) return true;
  return list.some(
    (o) =>
      o === "JHS" ||
      o === "SHS" ||
      o.startsWith("SHS") ||
      o.startsWith("SSHS") ||
      o.includes("JUNIOR") ||
      o.includes("SENIOR"),
  );
};

export const requiresDepartmentHead = (curricularOffering) =>
  offersSecondary(curricularOffering);

// JHS/SHS sections may be split into separate classes in the same time slot (e.g. one TLE section split by
// specialization, each split with its own teacher and learner group). Elementary sections keep one class per slot.
export const isSecondaryGradeLevel = (gradeLevel) => {
  const g = String(gradeLevel || "").toUpperCase();
  if (g.includes("SHS") || g.includes("SENIOR")) return true;
  return [...g.matchAll(/GRADE\s*(\d+)/g)].some((m) => Number(m[1]) >= 7);
};

/**
 * A new class in a section's time slot clashes with an existing class of that section when:
 *  - elementary: any overlap (one class at a time), or
 *  - JHS/SHS: only when it repeats the same subject (the same-teacher check is made separately).
 */
export const isSectionSlotClash = (gradeLevel, existingSubject, newSubject) => {
  if (!isSecondaryGradeLevel(gradeLevel)) return true;
  const a = String(existingSubject || "")
    .trim()
    .toUpperCase();
  const b = String(newSubject || "")
    .trim()
    .toUpperCase();
  return !a || !b || a === b; // unknown subject: stay strict
};
