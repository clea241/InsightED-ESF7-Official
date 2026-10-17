// One rule for "the same subject is already assigned to another teacher in this section", used by the Workload page
// (dropdown availability + the red Duplicate Subject Assignment message) and by the server on save, so they cannot disagree.
import { rowSubjectGrade } from "./timeAllotment.js";

const up = (x) =>
  String(x || "")
    .trim()
    .toUpperCase();

const daysOf = (r) =>
  Array.isArray(r.days) && r.days.length > 0
    ? r.days.map((d) => String(d).trim().toUpperCase())
    : r.daySchedule
      ? String(r.daySchedule)
          .split(",")
          .map((s) => s.trim().toUpperCase())
      : ["M", "T", "W", "TH", "F"];

/**
 * Would giving `candidate` this subject duplicate the subject already held by `other` (a row of ANOTHER teacher)?
 * candidate: { sectionId, sectionName, gradeLevel, subject, term, days, subjectGradeLevel }
 * other: a workload row (camelCase or snake_case fields).
 * Same section (id, or name + grade), same term, same subject, at least one shared day. A multigrade section's
 * subject for a different grade level is a separate assignment.
 */
export const isDuplicateAssignment = (candidate, other) => {
  if (!candidate || !other) return false;
  const subject = up(candidate.subject);
  if (!subject || subject === "ADVISORY") return false;
  if (up(other.subject || other.subjectName) !== subject) return false;

  const secId = String(candidate.sectionId || "");
  const secName = up(candidate.sectionName);
  const grade = up(candidate.gradeLevel);
  const oSecId = String(other.sectionId || other.section_id || "");
  const oSecName = up(other.sectionName || other.section_name);
  const oGrade = up(other.gradeLevel || other.grade_level);
  const sameSection =
    (secId && oSecId && secId === oSecId) ||
    (secName &&
      oSecName &&
      secName === oSecName &&
      (!grade || !oGrade || grade === oGrade));
  if (!sameSection) return false;

  const wantedGrade = rowSubjectGrade({
    subjectGradeLevel: candidate.subjectGradeLevel,
  });
  const otherGrade = rowSubjectGrade(other);
  if (wantedGrade && otherGrade && wantedGrade !== otherGrade) return false;

  if ((other.term || other.semester || "1st") !== (candidate.term || "1st"))
    return false;

  const mine = daysOf(candidate);
  return daysOf(other).some((d) => mine.includes(d));
};
