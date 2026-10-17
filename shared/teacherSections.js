// Does a class section belong to the grade levels a teacher is assigned in Personnel Profiling?
// Shared by the Workload page (section pickers) and the server (workload save), so both apply one rule.
// With no assigned grades it returns true ("no filter"); callers that must be strict check for empty grades first.
export const isSectionMatchingTeacherGrades = (
  sec,
  assignedGrades,
  teacherId = null,
  teacherName = null,
) => {
  if (
    teacherId &&
    String(sec?.adviserId || sec?.adviser_id || "") === String(teacherId)
  ) {
    return true; // Always match section where teacher is designated adviser
  }
  if (
    teacherName &&
    String(sec?.adviser || sec?.adviserName || sec?.adviser_name || "")
      .trim()
      .toLowerCase() === String(teacherName).trim().toLowerCase()
  ) {
    return true; // Always match section where teacher is designated adviser
  }

  if (
    !assignedGrades ||
    !Array.isArray(assignedGrades) ||
    assignedGrades.length === 0
  ) {
    return true; // No assigned grade filter on teacher -> show all sections
  }
  const secGrade = String(sec?.gradeLevel || sec?.grade_level || "")
    .toUpperCase()
    .trim();
  const secType = String(sec?.sectionType || sec?.section_type || "")
    .toUpperCase()
    .trim();
  const secName = String(sec?.sectionName || sec?.section_name || "")
    .toUpperCase()
    .trim();
  const normAssigned = assignedGrades
    .map((g) => String(g).toUpperCase().trim())
    .filter(Boolean);

  if (normAssigned.length === 0) return true;
  if (normAssigned.includes(secGrade)) return true;

  // Split multigrade sections e.g. "GRADE 1 - GRADE 2"
  const multiParts = secGrade.includes(" - ")
    ? secGrade.split(" - ").map((s) => s.trim())
    : [secGrade];

  for (const ag of normAssigned) {
    if (!ag) continue;
    if (multiParts.includes(ag)) return true;

    // Extract grade token for exact matching: "GRADE 1" vs "GRADE 10"
    const agMatch = ag.match(
      /^(?:GRADE\s*|G\s*)?(\d+|KINDER|K|ALS|SNED|SPED|NON-GRADED|NON GRADED)$/i,
    );
    const agKey = agMatch ? agMatch[1] : ag;

    for (const part of multiParts) {
      const partMatch = part.match(
        /^(?:GRADE\s*|G\s*)?(\d+|KINDER|K|ALS|SNED|SPED|NON-GRADED|NON GRADED)$/i,
      );
      const partKey = partMatch ? partMatch[1] : part;
      if (agKey === partKey) return true;
    }

    if (
      (ag.includes("KINDER") || ag === "K") &&
      (secGrade.includes("KINDER") || secGrade === "K")
    )
      return true;
    if (
      (ag.includes("SNED") ||
        ag.includes("SPED") ||
        ag.includes("NON-GRADED") ||
        ag.includes("NON GRADED")) &&
      (secGrade.includes("SNED") ||
        secGrade.includes("SPED") ||
        secGrade.includes("NON-GRADED") ||
        secGrade.includes("NON GRADED") ||
        secType.includes("SNED") ||
        secType.includes("SPED"))
    ) {
      return true;
    }
    if (
      ag.includes("ALS") &&
      (secGrade.includes("ALS") ||
        secType.includes("ALS") ||
        secName.includes("ALS"))
    )
      return true;
    if (
      ag.includes("ARAL") &&
      (secGrade.includes("ARAL") ||
        secType.includes("ARAL") ||
        secName.includes("ARAL"))
    )
      return true;
  }
  return false;
};
