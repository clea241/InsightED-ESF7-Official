import { SCHEDULE_RULES } from './scheduleRules.js';

const ALL_DAYS = ['M', 'T', 'W', 'TH', 'F'];

function toMins(t) {
  if (!t) return null;
  const [h, m] = String(t).substring(0, 5).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

function rowDays(r) {
  if (Array.isArray(r.days) && r.days.length > 0) return r.days;
  if (r.daySchedule) return String(r.daySchedule).split(',').map(s => s.trim()).filter(Boolean);
  return ALL_DAYS;
}

function isNonSubjectRow(r) {
  const s = String(r.subject || r.subjectName || r.task || '').trim().toUpperCase();
  return !s || s === 'ADVISORY' || s === 'HGP' || s.includes('HOMEROOM GUIDANCE');
}

/**
 * Multigrade sections: each grade level of the section may carry its own subject. A row records that grade in
 * `subjectGradeLevel` (the row's `gradeLevel` stays the section's label). Empty for mono-grade rows.
 */
export function rowSubjectGrade(r) {
  return String(r?.subjectGradeLevel || r?.subject_grade_level || '').trim().toUpperCase();
}

/** The individual grade levels of a section label such as "GRADE 1 - GRADE 2". */
export function splitSectionGrades(gradeLevel) {
  return String(gradeLevel || '').split(' - ').map(s => s.trim()).filter(Boolean);
}

/**
 * True when two rows are the same multigrade section but for different grade levels. Those rows run side by side
 * (the teacher handles both grades in one class period), so they are NOT a time or subject conflict.
 */
export function isPerGradeSharedSlot(a, b) {
  if (!a || !b) return false;
  const secA = String(a.sectionId || a.section_id || '');
  const secB = String(b.sectionId || b.section_id || '');
  if (!secA || secA !== secB) return false;
  const gA = rowSubjectGrade(a);
  const gB = rowSubjectGrade(b);
  return Boolean(gA && gB && gA !== gB);
}

/** Classify a section as SCP / multigrade and list the grade numbers it covers. */
export function classifySection(section, rules = SCHEDULE_RULES) {
  const type = String(section.sectionType || section.section_type || '').toUpperCase();
  const grade = String(section.gradeLevel || section.grade_level || '').toUpperCase();
  const name = String(section.sectionName || section.section_name || '').toLowerCase();
  const isScp = rules.scpKeywords.some(k => type.includes(k) || grade.includes(k));
  const isMultigrade = type.includes('MULTI') || grade.includes(' - ') || name.includes('multi');
  const gradeNumbers = [...grade.matchAll(/GRADE\s*(\d+)/g)].map(m => Number(m[1]));
  return { isScp, isMultigrade, gradeNumbers };
}

/**
 * Checks one section's rows (all teachers, one term) against the time-allotment rules.
 * Returns [{ code, subject, rowIds, message }]. Codes: BELOW_MINIMUM, OVER_DAILY_CAP, OVER_WEEKLY_CAP.
 */
export function validateTimeAllotment(section, rows, rules = SCHEDULE_RULES) {
  const { isScp, isMultigrade, gradeNumbers } = classifySection(section, rules);
  const limits = isScp ? rules.scp : rules.regular;
  const kind = isScp ? 'Special Curricular Program' : (isMultigrade ? 'multigrade' : 'regular');
  const capLabel = isScp ? 'Special Curricular Programs' : 'regular and multigrade sections';
  const minApplies = !limits.minAppliesToGrades || gradeNumbers.some(g => limits.minAppliesToGrades.includes(g));
  const label = `Section "${section.sectionName || section.section_name}" (${section.gradeLevel || section.grade_level}, ${kind})`;
  const out = [];
  const bySubject = new Map();

  for (const r of rows || []) {
    if (isNonSubjectRow(r)) continue;
    const s = toMins(r.startTime || r.start_time);
    const e = toMins(r.endTime || r.end_time);
    if (s === null || e === null || e <= s) continue;
    const subject = String(r.subject || r.subjectName).trim();
    // Multigrade: allotment is counted per grade level's subject, so Grade 1 Math and Grade 2 English stay separate.
    const gradeKey = isMultigrade ? rowSubjectGrade(r) : '';
    const key = gradeKey ? `${gradeKey}|${subject.toUpperCase()}` : subject.toUpperCase();
    const dur = e - s;
    const days = rowDays(r);

    if (minApplies && dur < limits.minMinutesPerSubject) {
      out.push({
        code: 'BELOW_MINIMUM', subject, rowIds: [r.id].filter(Boolean),
        message: `${label}: "${subject}" is scheduled for ${dur} mins/class, below the ${limits.minMinutesPerSubject}-min minimum per subject. ${rules.contactNote}`
      });
    }
    if (!bySubject.has(key)) bySubject.set(key, { subject: gradeKey ? `${subject} (${gradeKey})` : subject, perDay: {}, weekly: 0, rowIds: [] });
    const agg = bySubject.get(key);
    days.forEach(d => { agg.perDay[d] = (agg.perDay[d] || 0) + dur; });
    agg.weekly += dur * days.length;
    if (r.id) agg.rowIds.push(r.id);
  }

  for (const agg of bySubject.values()) {
    if (limits.maxMinutesPerSubjectPerDay != null) {
      for (const [day, mins] of Object.entries(agg.perDay)) {
        if (mins > limits.maxMinutesPerSubjectPerDay) {
          out.push({
            code: 'OVER_DAILY_CAP', subject: agg.subject, rowIds: agg.rowIds,
            message: `${label}: "${agg.subject}" totals ${mins} mins on ${day}, over the ${limits.maxMinutesPerSubjectPerDay}-min daily cap for ${capLabel}. ${rules.contactNote}`
          });
          break;
        }
      }
    }
    if (limits.maxMinutesPerSubjectPerWeek != null && agg.weekly > limits.maxMinutesPerSubjectPerWeek) {
      out.push({
        code: 'OVER_WEEKLY_CAP', subject: agg.subject, rowIds: agg.rowIds,
        message: `${label}: "${agg.subject}" totals ${agg.weekly} mins/week, over the ${limits.maxMinutesPerSubjectPerWeek}-min weekly cap for ${capLabel}. ${rules.contactNote}`
      });
    }
  }
  return out;
}
