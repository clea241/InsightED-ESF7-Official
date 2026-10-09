import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { isOrganizedClassWorkloadExempt } from '@shared/personnelClass.js';
import { isSectionSlotClash } from '@shared/schoolLevel.js';
import useDirtyGuard from '../hooks/useDirtyGuard';
import PortalHeader from '../components/PortalHeader';
import { useApp, detectPersonnelTypeFromPosition } from '../context/AppContext';
import { api } from '../services/api';
import { resolveSchoolId } from '../services/session';
import { versionOf, dedupeWorkloadRows, compareDraftToDatabase } from '../services/workloadMerge';
import { retryTransient, verifySavedRows, editedSinceSent } from '../services/workloadSave';
import { showWorkloadRestoreModal } from '../services/dirtyGuard';
import { reportError } from '../services/errorAlert';
import { isAllowanceDisabled, isAllowanceActive, hasActiveAllowance, ALLOWANCE_KEYS } from '@shared/allowances.js';
import { 
  FiUser, FiGrid, FiTrash2, FiCheck, FiFileText, FiCalendar, FiAlertCircle, 
  FiAlertTriangle, FiBriefcase, FiList, FiLock, FiUnlock, FiBookOpen, FiBook, 
  FiClock, FiPlus, FiX, FiBarChart2, FiSearch, FiFilter, FiCheckCircle, 
  FiChevronRight, FiCopy, FiDownload, FiTrendingUp, FiBookmark, FiArrowRight, 
  FiSliders, FiCheckSquare, FiSave, FiMove, FiRotateCcw, FiRotateCw,
  FiAward, FiSlash, FiSquare, FiInfo
} from 'react-icons/fi';

// What happened to the draft check for each teacher + term since this page was loaded (reset by a browser reload):
//  'clean' nothing worth restoring | 'restored' / 'declined' the user answered the restore prompt |
//  'edited' the user started editing | 'unreachable' the saved rows could not be read (the check runs again later) |
//  'prompting' the prompt is open. A teacher + term is only asked about once per load.
const restoreResolutions = new Map();
const restoreDeclined = new Set(); // teachers whose draft was declined: it stays in the browser, the editor shows the saved rows
const resolutionKey = (personId, term) => `${personId}:${term}`;

// The browser draft's rows may go into the editor only after the user confirmed the restore prompt, while the
// saved rows cannot be read, or once the user is editing. Until then the editor shows the saved baseline.
export const draftRowsMayOverlay = (personId, term, schoolId) => {
  if (!schoolId) return true;
  const resolution = restoreResolutions.get(resolutionKey(personId, term));
  return resolution === 'restored' || resolution === 'unreachable' || resolution === 'edited';
};

const noteUserEdit = (personId, term) => {
  restoreResolutions.set(resolutionKey(personId, term), 'edited');
  restoreDeclined.delete(String(personId));
};

export const isEligibleForTeachingOverload = (person) => {
  if (!person) return false;
  if (person.isSchoolHead || person.is_school_head) return false;

  const autoType = detectPersonnelTypeFromPosition(person.position || person.plantilla_position || person.position_title || '') || person.type || 'teaching';
  const t = String(autoType).toLowerCase().trim();
  const cat = String(person.positionCategory || '').toUpperCase().trim();
  if (t === 'non-teaching' || cat === 'NON-TEACHING' || cat.includes('NON-TEACHING')) {
    return false;
  }
  const pos = String(person.position || '').toUpperCase().trim();
  if (pos.includes('ADMINISTRATIVE') || pos.includes('ADAS') || pos.includes('ADA ') || pos.includes('UTILITY') || pos.includes('CLERK') || pos.includes('GUARD') || pos.includes('NURSE') || pos.includes('DRIVER') || pos.includes('BOOKKEEPER') || pos.includes('DISBURSING') || pos.includes('SECURITY') || pos.includes('ACCOUNTANT')) {
    return false;
  }
  return true;
};


export const normalizeSubjectName = (sub) => {
  if (!sub || typeof sub !== 'string') return '';
  const upper = sub.trim().toUpperCase();
  if (
    upper.includes('HOMEROOM GUIDANCE') ||
    upper.startsWith('HOMEROOM GUIDANCE') ||
    upper.startsWith('HGP (') ||
    upper === 'HGP'
  ) {
    return 'HGP';
  }
  return upper;
};

export const isNonTeachingTaskSubject = (subject) => {
  if (!subject) return false;
  const subUpper = String(subject).toUpperCase().trim();
  if (
    subUpper.startsWith('ADMIN') ||
    subUpper.includes('ADMIN') ||
    subUpper.startsWith('ADMINISTRATIVE') ||
    subUpper.includes('ADMINISTRATIVE') ||
    subUpper.startsWith('RELATED TASK') ||
    subUpper.startsWith('TR -') ||
    subUpper.startsWith('TR-') ||
    subUpper.startsWith('ANC -') ||
    subUpper.startsWith('ANCILLARY') ||
    subUpper.includes('DUTY') ||
    subUpper.includes('PERSONNEL') ||
    subUpper.includes('RECORDS') ||
    subUpper.includes('FACILITIES') ||
    subUpper.includes('FINANCIAL') ||
    subUpper === 'COACHING AND MENTORING'
  ) {
    return true;
  }
  return false;
};

export const formatSectionDisplay = (secOrName, secType, secId) => {
  if (!secOrName && !secId) return 'Section';
  const typeStr = String(secType || '').toUpperCase().trim();
  const idStr = String(secId || '').trim();
  const isNonReg = ['SNED', 'ALS', 'ARAL', 'REMEDIAL', 'ENRICHMENT'].some(k => typeStr.includes(k)) ||
    ['SNED-', 'ALS-', 'ARAL-', 'REM-', 'ENR-'].some(pfx => idStr.startsWith(pfx));
  if (isNonReg) {
    const fallbackType = typeStr || (idStr.startsWith('SNED-') ? 'SNED' : idStr.startsWith('ALS-') ? 'ALS' : idStr.startsWith('ARAL-') ? 'ARAL' : idStr.startsWith('ENR-') ? 'ENRICHMENT' : idStr.startsWith('REM-') ? 'REMEDIAL' : 'NON-REGULAR');
    return `${idStr || secOrName} [${fallbackType}]`;
  }
  return typeof secOrName === 'string' ? secOrName : (secOrName?.sectionName || secOrName?.id || 'Section');
};

export const normalizeWorkloadRowForComparison = (r) => {
  if (!r) return null;
  const term = String(r.term || '1st').trim();
  const rawSub = r.subject || r.subjectName || r.subject_name || r.task || '';
  const subject = normalizeSubjectName(rawSub);
  const gradeLevel = String(r.gradeLevel || r.grade_level || '').trim();
  const section = String(r.sectionName || r.section_name || r.sectionId || r.section_id || '').trim().toUpperCase();
  const startTime = String(r.startTime || r.start_time || '').trim().slice(0, 5);
  const endTime = String(r.endTime || r.end_time || '').trim().slice(0, 5);
  
  let daysArr = [];
  if (Array.isArray(r.days)) {
    daysArr = r.days.map(d => String(d).toUpperCase().trim());
  } else if (r.daySchedule) {
    daysArr = String(r.daySchedule).split(',').map(d => String(d).toUpperCase().trim());
  }
  const days = Array.from(new Set(daysArr)).filter(Boolean).sort().join(',');

  return {
    term,
    subject,
    gradeLevel,
    section,
    startTime,
    endTime,
    days
  };
};

export const normalizeRowsForComparison = (rows, termFilter = null) => {
  if (!Array.isArray(rows)) return [];
  const list = termFilter
    ? rows.filter(r => (r.term || '1st') === termFilter)
    : rows;
  const normalized = list.map(normalizeWorkloadRowForComparison).filter(Boolean);
  
  normalized.sort((a, b) => {
    const kA = `${a.term}|${a.subject}|${a.startTime}|${a.endTime}|${a.days}|${a.gradeLevel}|${a.section}`;
    const kB = `${b.term}|${b.subject}|${b.startTime}|${b.endTime}|${b.days}|${b.gradeLevel}|${b.section}`;
    return kA.localeCompare(kB);
  });
  return normalized;
};

export const ADMIN_TASK_OPTIONS = [
  'ADMIN TASK – PERSONNEL ADMINISTRATION',
  'ADMIN TASK – PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK – GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK – FINANCIAL MANAGEMENT',
  'ADMIN TASK – RECORDS MANAGEMENT',
  'ADMIN TASK – PROGRAM MANAGEMENT'
];

export const isAdminTaskRow = (row) => {
  if (!row) return false;
  if (row.is_admin_task || row.isAdminTask) return true;
  const sub = String(row.subject || row.task || row.task_name || '').toUpperCase().trim();
  return sub.startsWith('ADMIN') || sub.includes('ADMIN') || sub.startsWith('ADMINISTRATIVE') || sub.includes('ADMINISTRATIVE');
};

export const isNonTeachingPerson = (person) => {
  if (!person) return false;
  const autoType = (typeof detectPersonnelTypeFromPosition === 'function' ? detectPersonnelTypeFromPosition(person.position || person.plantilla_position || person.position_title || '') : null) || person.type || '';
  const t = String(autoType).toLowerCase().trim();
  const cat = String(person.positionCategory || person.category || '').toUpperCase().trim();
  if (t === 'non-teaching' || cat === 'NON-TEACHING' || cat.includes('NON-TEACHING')) {
    return true;
  }
  const pos = String(person.position || person.plantilla_position || person.position_title || '').toUpperCase().trim();
  if (
    pos.includes('ADMINISTRATIVE') || pos.includes('ADAS') || pos.includes('ADA ') || 
    pos.includes('UTILITY') || pos.includes('CLERK') || pos.includes('GUARD') || 
    pos.includes('NURSE') || pos.includes('DRIVER') || pos.includes('BOOKKEEPER') || 
    pos.includes('DISBURSING') || pos.includes('SECURITY') || pos.includes('ACCOUNTANT') ||
    pos.includes('AIDE')
  ) {
    return true;
  }
  return false;
};

// Reads the teacher's assigned grade levels as saved in Personnel Profiling (Teaching tab).
export const readAssignedGradeLevels = (p) => {
  if (!p) return [];
  let raw = p.assignedGradeLevels || p.assigned_grade_levels || p.gradeLevelsTaught || p.grade_levels_taught;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { raw = raw.split(',').map(s => s.trim()); }
  }
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
};

// Related-Teaching is decided by the position classification (detectPersonnelTypeFromPosition), never by title text,
// so every Related-Teaching position (Head Teacher, Librarian, Guidance, ...) follows the same workload rule.
export const isRelatedTeachingPerson = (p) => {
  if (!p) return false;
  const cat = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || '';
  return String(cat).toLowerCase().trim() === 'teaching-related';
};

// Related-Teaching staff teach the classes organized for them in Organized Classes (sections they advise),
// so those sections' grade levels count as their assigned grades in addition to any set in Personnel Profiling.
export const getOrganizedClassGradeLevels = (p, classSections = []) => {
  if (!p || !isRelatedTeachingPerson(p) || isOrganizedClassWorkloadExempt(p)) return [];
  const id = String(p.id || '');
  if (!id) return [];
  const grades = (classSections || [])
    .filter(s => [s.advisorId, s.advisor_id, s.adviserId, s.adviser_id].some(v => v && String(v) === id))
    .flatMap(s => String(s.gradeLevel || s.grade_level || '').split(' - ').map(g => g.trim()))
    .filter(Boolean);
  return [...new Set(grades)];
};

// Teaching / teaching-related personnel with no classes assigned in Personnel Profiling cannot have teaching blocks plotted.
export const TEACHING_PLOT_LOCK_MESSAGE = "No classes assigned yet. Set this teacher's assigned grade level(s) in Personnel Profiling first.";
export const isTeachingPlotLocked = (...people) => {
  const person = people.find(Boolean);
  if (!person || isNonTeachingPerson(person)) return false;
  return !people.some(p => readAssignedGradeLevels(p).length > 0);
};

const isAdvisorySub = (sub) => {
  if (!sub) return false;
  const s = String(sub).toUpperCase();
  return s === 'ADVISORY' || s.includes('HOMEROOM GUIDANCE') || s.includes('HGP');
};

export const isSnedSectionRow = (row, classSections = []) => {
  if (!row) return false;
  const subUpper = String(row.subject || '').toUpperCase().trim();
  if (subUpper === 'SNED MODIFIED SUBJECT' || subUpper === 'SNED' || subUpper === 'SPED MODIFIED SUBJECTS') return true;
  const secName = String(row.sectionName || '').toUpperCase().trim();
  const secId = String(row.sectionId || row.section_id || '');

  const matchedSec = (classSections || []).find(s => (secId && String(s.id) === secId) || (secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName && (!row.gradeLevel || s.gradeLevel === row.gradeLevel)));
  if (matchedSec) {
    const sType = String(matchedSec.sectionType || matchedSec.section_type || '').toUpperCase().trim();
    if (['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(sType)) return false;
  }

  const gUpper = String(row.gradeLevel || '').toUpperCase();
  if (gUpper.includes('SNED') || gUpper.includes('NON-GRADED') || gUpper.includes('SPED')) return true;

  return (classSections || []).some(s => {
    const isThisSecSned = String(s.sectionType || '').toUpperCase().includes('SNED') ||
                          String(s.gradeLevel || '').toUpperCase().includes('SNED') ||
                          String(s.gradeLevel || '').toUpperCase().includes('NON-GRADED') ||
                          String(s.gradeLevel || '').toUpperCase().includes('SPED');
    if (!isThisSecSned) return false;
    const sIdMatch = Boolean(secId && String(s.id) === secId);
    const sNameMatch = Boolean(secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName);
    return sIdMatch || (sNameMatch && (!row.gradeLevel || s.gradeLevel === row.gradeLevel));
  });
};

export const isAlsSectionRow = (row, classSections = []) => {
  if (!row) return false;
  const subUpper = String(row.subject || '').toUpperCase().trim();
  if (subUpper === 'ALS LEARNING STRAND' || subUpper === 'ALS' || subUpper.startsWith('LS 1') || subUpper.startsWith('LS 2') || subUpper.startsWith('LS 3') || subUpper.startsWith('LS 4') || subUpper.startsWith('LS 5') || subUpper.startsWith('LS 6') || subUpper.startsWith('LS:')) return true;
  const secName = String(row.sectionName || '').toUpperCase().trim();
  const secId = String(row.sectionId || row.section_id || '');

  const matchedSec = (classSections || []).find(s => (secId && String(s.id) === secId) || (secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName && (!row.gradeLevel || s.gradeLevel === row.gradeLevel)));
  if (matchedSec) {
    const sType = String(matchedSec.sectionType || matchedSec.section_type || '').toUpperCase().trim();
    if (['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(sType)) return false;
  }

  const gUpper = String(row.gradeLevel || '').toUpperCase();
  if (gUpper.includes('ALS')) return true;

  return (classSections || []).some(s => {
    const isThisSecAls = String(s.sectionType || '').toUpperCase().includes('ALS') ||
                          String(s.gradeLevel || '').toUpperCase().includes('ALS');
    if (!isThisSecAls) return false;
    const sIdMatch = Boolean(secId && String(s.id) === secId);
    const sNameMatch = Boolean(secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName);
    return sIdMatch || (sNameMatch && (!row.gradeLevel || s.gradeLevel === row.gradeLevel));
  });
};

export const isAralSectionRow = (row, classSections = []) => {
  if (!row) return false;
  const subUpper = String(row.subject || '').toUpperCase().trim();
  if (subUpper.startsWith('ARALING') || subUpper.includes('ARALING PANLIPUNAN')) return false;
  if (subUpper === 'REMEDIATION' || subUpper.includes('REMEDIAL') || subUpper.includes('ENRICHMENT')) return false;
  if (subUpper === 'ARAL' || subUpper.startsWith('ARAL -') || subUpper.startsWith('ARAL-') || subUpper.startsWith('ARAL ') || subUpper.includes('ARAL TUTORING') || subUpper.includes('ARAL PROGRAM')) return true;
  const secName = String(row.sectionName || '').toUpperCase().trim();
  const secId = String(row.sectionId || row.section_id || '');

  const matchedSec = (classSections || []).find(s => (secId && String(s.id) === secId) || (secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName && (!row.gradeLevel || s.gradeLevel === row.gradeLevel)));
  if (matchedSec) {
    const sType = String(matchedSec.sectionType || matchedSec.section_type || '').toUpperCase().trim();
    if (['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(sType)) return false;
  }

  const gUpper = String(row.gradeLevel || '').toUpperCase();
  if ((gUpper.startsWith('ARAL') && !gUpper.startsWith('ARALING')) || gUpper.includes('ARAL') || (secName.startsWith('ARAL') && !secName.startsWith('ARALING')) || secName.includes('ARAL')) return true;

  return (classSections || []).some(s => {
    const isThisSecRemedial = s.sectionType === 'REMEDIAL' || s.sectionType === 'ENRICHMENT';
    if (isThisSecRemedial) return false;
    const isThisSecReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
    if (isThisSecReg) return false;

    const isThisSecAral = String(s.sectionType || '').toUpperCase().includes('ARAL') ||
                          String(s.gradeLevel || '').toUpperCase().includes('ARAL') ||
                          String(s.sectionName || '').toUpperCase().includes('ARAL') ||
                          Boolean(s.aralBasis || s.aralToolKey || s.aralTool);
    if (!isThisSecAral) return false;
    const sIdMatch = Boolean(secId && String(s.id) === secId);
    const sNameMatch = Boolean(secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName);
    return sIdMatch || (sNameMatch && (!row.gradeLevel || s.gradeLevel === row.gradeLevel));
  });
};

export const isRemedialSectionRow = (row, classSections = []) => {
  if (!row) return false;
  const secName = String(row.sectionName || '').toUpperCase().trim();
  const secId = String(row.sectionId || row.section_id || '');

  const matchedSec = (classSections || []).find(s => (secId && String(s.id) === secId) || (secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName && (!row.gradeLevel || s.gradeLevel === row.gradeLevel)));
  if (matchedSec) {
    const sType = String(matchedSec.sectionType || matchedSec.section_type || '').toUpperCase().trim();
    return sType === 'REMEDIAL' || sType === 'ENRICHMENT';
  }

  return (classSections || []).some(s => {
    const isThisSecRemedial = s.sectionType === 'REMEDIAL' || s.sectionType === 'ENRICHMENT';
    if (!isThisSecRemedial) return false;
    const sIdMatch = Boolean(secId && String(s.id) === secId);
    const sNameMatch = Boolean(secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName);
    return sIdMatch || (sNameMatch && (!row.gradeLevel || s.gradeLevel === row.gradeLevel));
  });
};

const isRemediationSub = (sub) => {
  if (!sub) return false;
  const s = String(sub).toUpperCase();
  return s === 'REMEDIATION' || s.includes('REMEDIAL') || s.includes('ENHANCEMENT') || s.includes('ENRICHMENT');
};

export const isSameGradeLevel = (gradeA, gradeB) => {
  if (!gradeA || !gradeB) return true; // if either is missing, allow match
  const a = String(gradeA).toUpperCase().trim();
  const b = String(gradeB).toUpperCase().trim();
  if (a === b) return true;

  const extractGradeToken = (g) => {
    if (!g) return '';
    const norm = g.replace(/\s*[\u2013\u2014-]\s*/g, ' - ').trim();
    if (norm.includes('KINDER') || norm === 'K') return 'KINDER';
    if (norm.includes('SNED') || norm.includes('SPED') || norm.includes('NON-GRADED') || norm.includes('NON GRADED')) return 'SNED';
    if (norm.includes('ALS')) return 'ALS';
    if (norm.includes('ARAL')) return 'ARAL';
    const m = norm.match(/(?:GRADE\s*|G\s*)?(\d+)/i);
    if (m) return m[1];
    return norm;
  };

  const tokenA = extractGradeToken(a);
  const tokenB = extractGradeToken(b);
  if (tokenA && tokenB && tokenA === tokenB) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
};

export const matchSectionForWorkloadRow = (row, classSections = []) => {
  if (!row || !Array.isArray(classSections) || classSections.length === 0) return null;
  if (isAdminTaskRow(row) || isNonTeachingTaskSubject(row.subject || row.subject_name)) return null;

  const rawSecId = String(row.sectionId || row.section_id || '').trim();
  const rawSecName = String(row.sectionName || row.section_name || row.section || '').trim();
  const rawGrade = String(row.gradeLevel || row.grade_level || '').trim();

  // 1. Direct ID match
  if (rawSecId) {
    const idMatch = classSections.find(s => String(s.id).trim() === rawSecId);
    if (idMatch) return idMatch;
  }

  // 2. Section Name matching (fuzzy / normalized / track-stripped)
  if (rawSecName) {
    const normName = rawSecName.toUpperCase().trim();
    // Helper to strip track/strand prefix (e.g. "BE - ", "ASSH - ", "SSHS - ", "ABM - ", "STEM - ", "HUMSS - ", "GAS - ", "TVL - ", "TVL-ICT - ", "HE - ", "ICT - ", "IA - ", "ARTS - ", "SPORTS - ", "GRADE 11 - ")
    const getBaseSectionName = (name) => {
      if (!name) return '';
      let s = String(name).toUpperCase().trim();
      // Remove Grade prefix (e.g. "GRADE 11 - ", "G11 - ", "GRADE 11: ")
      s = s.replace(/^(?:GRADE|G)\s*\d+\s*[-–—:]\s*/i, '');
      // Strip any track / strand / specialization prefix
      s = s.replace(/^(?:BE|ASSH|SSHS|STEM|HUMSS|ABM|GAS|TVL|TVL-HE|TVL-ICT|TVL-IA|TVL-AFA|HE|ICT|IA|AFA|ARTS|SPORTS|ACAD|TECHPRO|TECH-PRO|TECHVOC|TECH-VOC|SPA|SPFL|SPJ|SPS|STE|SPTVE|SNED|SPED|ALS|ARAL)\s*[-–—:]\s*/i, '');
      // Fallback: If there is still a hyphen/colon prefix (e.g. "XXX - SECTION"), strip the prefix before the dash
      if (s.includes('-') || s.includes('–') || s.includes('—') || s.includes(':')) {
        const parts = s.split(/[-–—:]/);
        if (parts.length > 1) {
          const afterPrefix = parts.slice(1).join('-').trim();
          if (afterPrefix) return afterPrefix;
        }
      }
      return s.trim();
    };

    const baseRowName = getBaseSectionName(normName);

    // 2a. Exact full name match with matching grade level
    const exactGradeMatch = classSections.find(s => {
      const sName = String(s.sectionName || s.section_name || '').toUpperCase().trim();
      return sName === normName && isSameGradeLevel(s.gradeLevel || s.grade_level, rawGrade);
    });
    if (exactGradeMatch) return exactGradeMatch;

    // 2b. Exact full name match across any grade level
    const exactNameMatch = classSections.find(s => {
      const sName = String(s.sectionName || s.section_name || '').toUpperCase().trim();
      return sName === normName;
    });
    if (exactNameMatch) return exactNameMatch;

    // 2c. Base name match (e.g. "RESILIENT" matches "BE - RESILIENT" or "ABUEVA" matches "ASSH - ABUEVA") with matching grade level
    if (baseRowName) {
      const baseGradeMatch = classSections.find(s => {
        const sName = String(s.sectionName || s.section_name || '').toUpperCase().trim();
        const sBase = getBaseSectionName(sName);
        const gradeMatches = isSameGradeLevel(s.gradeLevel || s.grade_level, rawGrade);
        return gradeMatches && (sBase === baseRowName || sBase === normName || sName === baseRowName);
      });
      if (baseGradeMatch) return baseGradeMatch;

      // 2d. Base name match across any grade
      const baseAnyMatch = classSections.find(s => {
        const sName = String(s.sectionName || s.section_name || '').toUpperCase().trim();
        const sBase = getBaseSectionName(sName);
        return sBase === baseRowName || sBase === normName || sName === baseRowName;
      });
      if (baseAnyMatch) return baseAnyMatch;
    }

    // 2e. Substring / contains match within same grade
    const containsMatch = classSections.find(s => {
      const sName = String(s.sectionName || s.section_name || '').toUpperCase().trim();
      const gradeMatches = isSameGradeLevel(s.gradeLevel || s.grade_level, rawGrade);
      return gradeMatches && (sName.includes(normName) || normName.includes(sName));
    });
    if (containsMatch) return containsMatch;
  }

  // 3. If no sectionName was provided, ONLY match by grade level IF there is strictly ONE section in that grade
  if (!rawSecName && rawGrade) {
    const gradeSecs = classSections.filter(s => isSameGradeLevel(s.gradeLevel || s.grade_level, rawGrade));
    if (gradeSecs.length === 1) {
      return gradeSecs[0];
    }
  }

  return null;
};

// Grade 1/2 MATATAG core subjects (DepEd Order No. 12, s. 2024) are locked to exactly 40 mins/day
// wherever they're scheduled at those grades — mirrors the G1/G2 core lists in
// getMatatagFixedDurationMins below, used here just to badge the subject in the "Subjects Taught"
// sidebar list (which isn't grade-specific, so this flags "fixed at G1/G2" rather than a live row).
const MATATAG_40M_CORE_SUBJECTS = new Set([
  'LANGUAGE', 'READING AND LITERACY', 'READING & LITERACY', 'MAKABANSA', 'MATHEMATICS', 'MATH',
  'GMRC', 'GOOD MORAL AND RIGHT CONDUCT', 'FILIPINO', 'ENGLISH'
]);
export const isMatatagFixed40Subject = (subjectName) => MATATAG_40M_CORE_SUBJECTS.has(String(subjectName || '').toUpperCase().trim());

export const add60MinutesToTime = (timeStr) => {
  if (!timeStr) return '08:30';
  const parts = String(timeStr).split(':');
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (isNaN(h)) h = 7;
  if (isNaN(m)) m = 30;
  const newH = (h + 1) % 24;
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const isAdvisoryOrHgpPair = (rA, rB) => {
  if (!rA || !rB) return false;
  const normA = normalizeSubjectName(rA.subject || rA.task || '');
  const normB = normalizeSubjectName(rB.subject || rB.task || '');
  const isAdvA = normA === 'ADVISORY' || String(rA.subject || '').toUpperCase().trim() === 'ADVISORY';
  const isAdvB = normB === 'ADVISORY' || String(rB.subject || '').toUpperCase().trim() === 'ADVISORY';
  const isHgpA = normA === 'HGP' || String(rA.subject || '').toUpperCase().trim() === 'HGP' || String(rA.subject || '').toUpperCase().includes('HOMEROOM GUIDANCE');
  const isHgpB = normB === 'HGP' || String(rB.subject || '').toUpperCase().trim() === 'HGP' || String(rB.subject || '').toUpperCase().includes('HOMEROOM GUIDANCE');
  
  // ADVISORY is permitted to overlap with other subjects, tasks, and HGP
  if (isAdvA || isAdvB) return true;
  if (isHgpA && isHgpB) return false;
  
  return false;
};

function generateWorkloadDelegationHTML({ schoolInfo, selectedTeachers, classSections, customSubjects, GRADE_LEVEL_SUBJECTS, REMEDIATION_FOCUS_BY_CATEGORY }) {
  const payloadData = {
    version: 'INSIGHTED_WORKLOAD_DELEGATION_V1',
    schoolName: schoolInfo?.schoolName || 'DepEd School',
    schoolYear: schoolInfo?.schoolYear || 'SY 26-27',
    generatedAt: new Date().toISOString(),
    gradeSubjects: GRADE_LEVEL_SUBJECTS,
    remediationFocusMap: REMEDIATION_FOCUS_BY_CATEGORY,
    sections: (classSections || []).map(s => ({
      id: s.id,
      sectionName: s.sectionName || s.section_name || '',
      gradeLevel: s.gradeLevel || s.grade_level || ''
    })),
    teachers: selectedTeachers.map(t => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      position: t.position || 'Teacher',
      workloadRows: (t.workloadRows || []).slice().sort((a, b) => {
        const getPriority = (row) => {
          const sub = String(row.subject || '').toUpperCase().trim();
          if (sub === 'ADVISORY') return 0;
          if (sub === 'HGP' || sub.includes('HOMEROOM')) return 1;
          return 2;
        };
        return getPriority(a) - getPriority(b);
      }).map(r => ({
        id: r.id || `r-${Math.random().toString(36).substring(2, 7)}`,
        category: r.category || 'Elementary',
        subject: r.subject || '',
        remediationSubject: r.remediationSubject || '',
        gradeLevel: r.gradeLevel || '',
        sectionName: r.sectionName || r.section_name || '',
        startTime: r.startTime || (r.subject === 'ADVISORY' || r.subject === 'HGP' ? '07:30' : '08:00'),
        endTime: r.endTime || (r.subject === 'ADVISORY' || r.subject === 'HGP' ? '08:30' : '09:00'),
        days: Array.isArray(r.days) ? r.days : ['M', 'T', 'W', 'TH', 'F']
      }))
    })),
    customSubjects: customSubjects || []
  };

  const rawJson = JSON.stringify(payloadData);
  const jsonB64 = btoa(unescape(encodeURIComponent(rawJson)));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InsightED Workload Delegation Package — ${payloadData.schoolName}</title>
  <style>
    :root {
      --navy: #0f172a;
      --blue: #0284c7;
      --blue-light: #eff6ff;
      --border: #cbd5e1;
      --bg: #f8fafc;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: #334155;
    }
    header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    header h1 { margin: 0; font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
    header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .export-btn {
      background: linear-gradient(180deg, #10b981, #059669);
      color: white;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }
    .export-btn:hover { opacity: 0.95; }
    .container {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 20px;
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .sidebar {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      height: calc(100vh - 120px);
      overflow-y: auto;
    }
    .sidebar h3 { margin: 0 0 12px; font-size: 14px; color: var(--navy); }
    .teacher-item {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      margin-bottom: 4px;
      transition: all 0.15s;
    }
    .teacher-item:hover { background: #f1f5f9; }
    .teacher-item.active { background: #eff6ff; border-color: #bfdbfe; font-weight: bold; color: #1e40af; }
    .teacher-item .name { font-size: 13px; font-weight: 700; margin: 0; }
    .teacher-item .pos { font-size: 11px; color: #64748b; margin: 2px 0 0; }
    .main-editor {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid var(--border);
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .add-row-btn {
      background: #0284c7;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f8fafc; padding: 10px 8px; text-align: left; border-bottom: 2px solid var(--border); font-weight: 700; color: var(--navy); }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
    input, select { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 12px; width: 100%; box-sizing: border-box; }
    .day-chk { display: flex; gap: 4px; }
    .day-chk label { font-size: 10px; font-weight: bold; cursor: pointer; padding: 2px 4px; border: 1px solid #e2e8f0; border-radius: 4px; }
    .day-chk input { width: auto; }
    .del-btn { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Workload Delegation Package</h1>
      <p>${payloadData.schoolName} | ${payloadData.schoolYear}</p>
    </div>
    <button class="export-btn" onclick="exportReturnPayload()">Save & Download Return File (.json)</button>
  </header>

  <div class="container">
    <div class="sidebar">
      <h3>Assigned Teachers (<span id="t-count">0</span>)</h3>
      <div id="teacher-list"></div>
    </div>
    <div class="main-editor">
      <div class="editor-header">
        <div>
          <h2 id="active-t-name" style="margin: 0; font-size: 18px; color: var(--navy);">Select a Teacher</h2>
          <span id="active-t-pos" style="font-size: 12px; color: #64748b;">Choose a teacher from the left to edit workload.</span>
        </div>
        <button class="add-row-btn" onclick="addWorkloadRow()">+ Add Workload Row</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div style="background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Weekly Teaching Load</div>
          <div id="stat-weekly-hours" style="font-size: 18px; font-weight: 800; color: var(--navy);">0.0 hrs/wk</div>
        </div>
        <div style="background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Daily Avg Load</div>
          <div id="stat-daily-avg" style="font-size: 18px; font-weight: 800; color: var(--navy);">0.0 hrs/day</div>
        </div>
        <div id="stat-overload-card" style="background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Weekly Overload</div>
          <div id="stat-overload" style="font-size: 18px; font-weight: 800; color: var(--navy);">0.0 hrs/wk</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 240px;">Class Section</th>
            <th style="width: 220px;">Subject</th>
            <th style="width: 140px;">Duration</th>
            <th style="width: 160px;">Usual Days (M-F)</th>
            <th style="width: 60px;">Action</th>
          </tr>
        </thead>
        <tbody id="workload-rows">
          <tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 30px;">Select a teacher on the left to begin encoding workload.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let data = { teachers: [], sections: [] };
    try {
      const rawJsonStr = decodeURIComponent(escape(atob("${jsonB64}")));
      data = JSON.parse(rawJsonStr);
    } catch(e) {
      console.error("Payload decode error:", e);
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:red"><h2>Payload Parsing Error</h2><pre>' + e.message + '</pre></div>';
    }
    let activeTeacherId = null;

    document.getElementById('t-count').innerText = (data.teachers || []).length;

    function calculateTeacherWorkload(t) {
      if (!t || !t.workloadRows) return { weeklyHours: '0.0', dailyAvg: '0.0', overload: '0.0' };
      const daysList = ['M', 'T', 'W', 'TH', 'F'];
      let totalMins = 0;

      for (const d of daysList) {
        const intervals = [];
        for (const r of t.workloadRows) {
          if ((r.days || []).includes(d)) {
            const subUpper = String(r.subject || '').toUpperCase().trim();
            if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) {
              continue;
            } else if (subUpper === 'ADVISORY') {
              totalMins += 60;
            } else if (r.startTime && r.endTime) {
              const [sh, sm] = r.startTime.split(':').map(Number);
              const [eh, em] = r.endTime.split(':').map(Number);
              if (sh !== undefined && eh !== undefined) {
                intervals.push([sh * 60 + sm, eh * 60 + em]);
              }
            }
          }
        }

        if (intervals.length > 0) {
          intervals.sort((a, b) => a[0] - b[0]);
          let merged = [intervals[0]];
          for (let i = 1; i < intervals.length; i++) {
            const current = intervals[i];
            const lastMerged = merged[merged.length - 1];
            if (current[0] <= lastMerged[1]) {
              lastMerged[1] = Math.max(lastMerged[1], current[1]);
            } else {
              merged.push(current);
            }
          }
          for (const [start, end] of merged) {
            totalMins += (end - start);
          }
        }
      }

      const weeklyHoursNum = totalMins / 60;
      const weeklyHours = weeklyHoursNum.toFixed(1);
      const dailyAvg = (weeklyHoursNum / 5).toFixed(1);
      const overloadNum = Math.max(0, weeklyHoursNum - 30);
      const overload = overloadNum.toFixed(1);

      return { weeklyHours, dailyAvg, overload, overloadNum };
    }

    function getSubjectsForGradeInHTML(grade, category) {
      let list = [];
      if (grade && data.gradeSubjects && data.gradeSubjects[grade]) {
        list = data.gradeSubjects[grade];
      } else if (category && data.gradeSubjects && data.gradeSubjects[category]) {
        list = data.gradeSubjects[category];
      } else if (category && category.startsWith('SHS')) {
        list = (data.gradeSubjects && data.gradeSubjects['SHS-CORE SUBJECTS']) || [];
      } else {
        list = (data.gradeSubjects && (data.gradeSubjects['Grade 1'] || data.gradeSubjects['Elementary'])) || [];
      }

      // Unify REMEDIATION & REMEDIAL/ENHANCEMENT CLASS into one subject option, and filter out ADVISORY and HGP from dropdowns
      list = list.map(s => (s === 'REMEDIATION' || s === 'REMEDIAL/ENHANCEMENT CLASS') ? 'REMEDIAL / ENHANCEMENT CLASS' : s)
                 .filter(s => {
                   const u = String(s || '').toUpperCase().trim();
                   return u !== 'ADVISORY' && u !== 'HGP' && !u.includes('HOMEROOM GUIDANCE');
                 });

      return Array.from(new Set(list));
    }

    function renderTeacherList() {
      const listEl = document.getElementById('teacher-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      data.teachers.forEach((t, idx) => {
        const stats = calculateTeacherWorkload(t);
        const item = document.createElement('div');
        item.className = 'teacher-item' + (String(t.id) === String(activeTeacherId) ? ' active' : '');
        item.innerHTML = '<div class="name">' + (t.lastName || '') + ', ' + (t.firstName || '') + '</div><div class="pos">' + (t.position || 'Teacher') + ' (' + ((t.workloadRows || []).length) + ' rows · ' + stats.weeklyHours + 'h)</div>';
        item.onclick = () => selectTeacher(t.id);
        listEl.appendChild(item);
      });
    }

    function selectTeacher(id) {
      activeTeacherId = id;
      renderTeacherList();
      const t = data.teachers.find(x => String(x.id) === String(id));
      if (!t) return;
      const nameEl = document.getElementById('active-t-name');
      const posEl = document.getElementById('active-t-pos');
      if (nameEl) nameEl.innerText = (t.firstName || '') + ' ' + (t.lastName || '');
      if (posEl) posEl.innerText = t.position || 'Teacher';
      renderWorkloadRows();
    }

    function renderWorkloadRows() {
      const tbody = document.getElementById('workload-rows');
      if (!tbody) return;
      tbody.innerHTML = '';
      const t = data.teachers.find(x => String(x.id) === String(activeTeacherId));
      if (!t) return;

      const stats = calculateTeacherWorkload(t);
      document.getElementById('stat-weekly-hours').innerText = stats.weeklyHours + ' hrs/wk';
      document.getElementById('stat-daily-avg').innerText = stats.dailyAvg + ' hrs/day';
      document.getElementById('stat-overload').innerText = stats.overload + ' hrs/wk';

      const ovCard = document.getElementById('stat-overload-card');
      if (stats.overloadNum > 0) {
        ovCard.style.background = '#fffbeb';
        ovCard.style.borderColor = '#f59e0b';
        document.getElementById('stat-overload').style.color = '#b45309';
      } else {
        ovCard.style.background = '#f8fafc';
        ovCard.style.borderColor = 'var(--border)';
        document.getElementById('stat-overload').style.color = 'var(--navy)';
      }

      if (t.workloadRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 30px;">No workload rows. Click "+ Add Workload Row" above.</td></tr>';
        return;
      }

      t.workloadRows.sort((a, b) => {
        const getPriority = (row) => {
          const sub = String(row.subject || '').toUpperCase().trim();
          if (sub === 'ADVISORY') return 0;
          if (sub === 'HGP' || sub.includes('HOMEROOM')) return 1;
          return 2;
        };
        return getPriority(a) - getPriority(b);
      });

      t.workloadRows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const availableSubjects = getSubjectsForGradeInHTML(row.gradeLevel, row.category);
        const subUpper = String(row.subject || '').toUpperCase().trim();
        const isLockedSub = subUpper === 'ADVISORY' || subUpper === 'HGP' || subUpper === 'HOMEROOM GUIDANCE';

        // 1. Class Section Cell
        const tdSec = document.createElement('td');
        if (isLockedSub) {
          tdSec.innerHTML = '<span style="font-weight: 700; color: var(--navy); font-size: 12px;">[' + (row.gradeLevel || 'Advisory') + '] ' + (row.sectionName || 'Assigned Section') + ' [Locked]</span>';
        } else if (data.sections && data.sections.length > 0) {
          const selSec = document.createElement('select');
          selSec.onchange = function() { updateSection(idx, this.value); };
          let opts = '<option value="">-- Choose Section --</option>';
          data.sections.forEach(function(s) {
            const sel = (row.sectionName === s.sectionName) ? 'selected' : '';
            opts += '<option value="' + s.sectionName + '" ' + sel + '>[' + s.gradeLevel + '] ' + s.sectionName + '</option>';
          });
          selSec.innerHTML = opts;
          tdSec.appendChild(selSec);
        } else {
          const inpSec = document.createElement('input');
          inpSec.type = 'text';
          inpSec.value = row.sectionName || '';
          inpSec.placeholder = 'Section name...';
          inpSec.onchange = function() { updateRow(idx, 'sectionName', this.value); };
          tdSec.appendChild(inpSec);
        }
        tr.appendChild(tdSec);

        // 2. Subject Cell
        const tdSub = document.createElement('td');
        if (isLockedSub) {
          tdSub.innerHTML = '<span style="font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 4px 10px; border-radius: 12px; font-size: 11px;">' + row.subject + ' [Locked]</span>';
        } else {
          const selSub = document.createElement('select');
          const hasSection = Boolean(row.sectionId || row.sectionName);
          if (!hasSection) {
            selSub.disabled = true;
          }
          selSub.onchange = function() { updateSubjectWithRemediation(idx, this.value); };
          let subOpts = hasSection ? '<option value="">-- Select Subject --</option>' : '<option value="">-- Choose Section First --</option>';
          availableSubjects.forEach(function(sub) {
            const sel = (row.subject === sub) ? 'selected' : '';
            subOpts += '<option value="' + sub + '" ' + sel + '>' + sub + '</option>';
          });
          selSub.innerHTML = subOpts;
          tdSub.appendChild(selSub);

          if (subUpper.includes('REMEDIAL') || subUpper.includes('ENHANCEMENT') || subUpper === 'REMEDIATION') {
            const selRem = document.createElement('select');
            selRem.style.marginTop = '6px';
            selRem.style.borderColor = '#0284c7';
            selRem.style.background = '#f0f9ff';
            selRem.style.fontWeight = '600';
            selRem.style.color = '#0369a1';
            selRem.onchange = function() { updateRow(idx, 'remediationSubject', this.value); };

            const listOpts = (data.remediationFocusMap ? (row.category === 'Elementary' ? data.remediationFocusMap['Elementary'] : (data.remediationFocusMap[row.category] || data.remediationFocusMap['ALL'])) : []) || [];
            const currentRem = row.remediationSubject || (row.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN');
            let remOpts = '<option value="">-- Select Remediation Focus --</option>';
            listOpts.forEach(function(opt) {
              const sel = (currentRem === opt) ? 'selected' : '';
              remOpts += '<option value="' + opt + '" ' + sel + '>Focus: ' + opt + '</option>';
            });
            selRem.innerHTML = remOpts;
            tdSub.appendChild(selRem);
          }
        }
        tr.appendChild(tdSub);

        // 3. Days Cell
        const tdDays = document.createElement('td');
        const divDays = document.createElement('div');
        divDays.className = 'day-chk';
        ['M','T','W','TH','F'].forEach(function(d) {
          const lbl = document.createElement('label');
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          if ((row.days || []).includes(d)) chk.checked = true;
          chk.onchange = function() { toggleDay(idx, d); };
          lbl.appendChild(chk);
          lbl.appendChild(document.createTextNode(d));
          divDays.appendChild(lbl);
        });
        tdDays.appendChild(divDays);
        tr.appendChild(tdDays);

        // 4. Start & End Time Cells
        const tdStart = document.createElement('td');
        const inpStart = document.createElement('input');
        inpStart.type = 'time';
        inpStart.value = row.startTime || (isLockedSub ? '07:30' : '08:00');
        inpStart.onchange = function() { updateRow(idx, 'startTime', this.value); };
        tdStart.appendChild(inpStart);
        tr.appendChild(tdStart);

        const tdEnd = document.createElement('td');
        const inpEnd = document.createElement('input');
        inpEnd.type = 'time';
        inpEnd.value = row.endTime || (isLockedSub ? '08:30' : '09:00');
        inpEnd.onchange = function() { updateRow(idx, 'endTime', this.value); };
        tdEnd.appendChild(inpEnd);
        tr.appendChild(tdEnd);

        // 6. Action Cell
        const tdAct = document.createElement('td');
        if (isLockedSub) {
          tdAct.innerHTML = '<span style="font-size: 11px; color: #94a3b8; font-weight: bold;">Locked</span>';
        } else {
          const btnDel = document.createElement('button');
          btnDel.className = 'del-btn';
          btnDel.innerText = 'X';
          btnDel.onclick = function() { deleteRow(idx); };
          tdAct.appendChild(btnDel);
        }
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    function updateSection(idx, val) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (!t || !t.workloadRows[idx]) return;

      const sec = (data.sections || []).find(s => s.sectionName === val || String(s.id) === String(val));
      if (sec) {
        t.workloadRows[idx].sectionId = String(sec.id);
        t.workloadRows[idx].sectionName = sec.sectionName;
        t.workloadRows[idx].gradeLevel = sec.gradeLevel;

        const g = String(sec.gradeLevel || '').toUpperCase();
        if (g.includes('11') || g.includes('12')) {
          t.workloadRows[idx].category = 'SHS';
        } else if (g.includes('7') || g.includes('8') || g.includes('9') || g.includes('10')) {
          t.workloadRows[idx].category = 'JHS';
        } else {
          t.workloadRows[idx].category = 'Elementary';
        }

        if (!t.workloadRows[idx].subject) {
          const available = getSubjectsForGradeInHTML(sec.gradeLevel, t.workloadRows[idx].category);
          if (available.length > 0) {
            t.workloadRows[idx].subject = available[0];
          }
        }
      } else {
        t.workloadRows[idx].sectionId = '';
        t.workloadRows[idx].sectionName = '';
        t.workloadRows[idx].gradeLevel = '';
      }
      renderWorkloadRows();
      renderTeacherList();
    }

    function updateSubjectWithRemediation(idx, val) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (!t || !t.workloadRows[idx]) return;

      const row = t.workloadRows[idx];
      row.subject = val;
      const upperVal = String(val || '').toUpperCase().trim();
      if (upperVal.includes('REMEDIAL') || upperVal.includes('ENHANCEMENT') || upperVal === 'REMEDIATION') {
        if (!row.remediationSubject) {
          row.remediationSubject = (row.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
        }
      } else {
        row.remediationSubject = '';
      }
      renderWorkloadRows();
      renderTeacherList();
    }

    function addWorkloadRow() {
      if (!activeTeacherId) return alert('Please select a teacher first.');
      const t = data.teachers.find(x => x.id === activeTeacherId);

      let nextStart = '08:00';
      let nextEnd = '09:00';
      const rows = t.workloadRows || [];
      if (rows.length > 0) {
        const lastRow = rows[0];
        if (lastRow.endTime) {
          const [eh, em] = lastRow.endTime.split(':').map(Number);
          if (eh !== undefined && !isNaN(eh)) {
            const endMins = eh * 60 + (em || 0);
            nextStart = String(Math.floor(endMins / 60) % 24).padStart(2, '0') + ':' + String(endMins % 60).padStart(2, '0');
            const nextEndMins = endMins + 60;
            nextEnd = String(Math.floor(nextEndMins / 60) % 24).padStart(2, '0') + ':' + String(nextEndMins % 60).padStart(2, '0');
          }
        }
      }

      t.workloadRows.unshift({
        id: 'r-' + Date.now(),
        category: 'Elementary',
        gradeLevel: 'Grade 1',
        subject: '',
        sectionName: '',
        startTime: nextStart,
        endTime: nextEnd,
        days: ['M', 'T', 'W', 'TH', 'F']
      });

      renderTeacherList();
      renderWorkloadRows();
    }

    function checkTeacherConflictsInHTML(t) {
      if (!t || !t.workloadRows || t.workloadRows.length < 2) return null;

      for (let i = 0; i < t.workloadRows.length; i++) {
        for (let j = i + 1; j < t.workloadRows.length; j++) {
          const r1 = t.workloadRows[i];
          const r2 = t.workloadRows[j];

          const commonDays = (r1.days || []).filter(d => (r2.days || []).includes(d));
          if (commonDays.length === 0) continue;

          const sub1Upper = String(r1.subject || '').toUpperCase().trim();
          const sub2Upper = String(r2.subject || '').toUpperCase().trim();

          const isAdv1 = sub1Upper === 'ADVISORY' || isAdvisorySub(sub1Upper);
          const isAdv2 = sub2Upper === 'ADVISORY' || isAdvisorySub(sub2Upper);
          if (isAdv1 || isAdv2) continue;

          const isAdvHgpPair = (sub1Upper === 'ADVISORY' || sub1Upper === 'HGP' || sub1Upper.includes('HOMEROOM')) &&
                               (sub2Upper === 'ADVISORY' || sub2Upper === 'HGP' || sub2Upper.includes('HOMEROOM'));
          if (isAdvHgpPair) {
            const sec1 = String(r1.sectionId || r1.sectionName || '').trim();
            const sec2 = String(r2.sectionId || r2.sectionName || '').trim();
            if (!sec1 || !sec2 || sec1 === sec2) continue;
          }

          if (r1.startTime && r1.endTime && r2.startTime && r2.endTime) {
            const [s1h, s1m] = r1.startTime.split(':').map(Number);
            const [e1h, e1m] = r1.endTime.split(':').map(Number);
            const [s2h, s2m] = r2.startTime.split(':').map(Number);
            const [e2h, e2m] = r2.endTime.split(':').map(Number);

            const start1 = s1h * 60 + (s1m || 0);
            const end1 = e1h * 60 + (e1m || 0);
            const start2 = s2h * 60 + (s2m || 0);
            const end2 = e2h * 60 + (e2m || 0);

            if (start1 < end2 && end1 > start2) {
              return {
                sub1: r1.subject || 'Subject 1',
                sub2: r2.subject || 'Subject 2',
                days: commonDays.join(', '),
                time1: (r1.startTime || '') + ' - ' + (r1.endTime || ''),
                time2: (r2.startTime || '') + ' - ' + (r2.endTime || '')
              };
            }
          }
        }
      }
      return null;
    }

    function updateRow(idx, field, val) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (!t || !t.workloadRows[idx]) return;

      const row = t.workloadRows[idx];
      row[field] = val;

      const subUpper = String(row.subject || '').toUpperCase().trim();
      if (subUpper === 'ADVISORY') {
        if (!row.startTime) row.startTime = '07:30';
        row.endTime = add60MinutesToTime(row.startTime);
        row.days = ['M', 'T', 'W', 'TH', 'F'];
      }

      if (field === 'startTime') {
        row.startTime = val;
        row.endTime = add60MinutesToTime(val);
      }
      if (field === 'startTime' || field === 'endTime') {
        if (row.startTime && row.endTime) {
          const [sh, sm] = row.startTime.split(':').map(Number);
          const [eh, em] = row.endTime.split(':').map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            const startMins = sh * 60 + (sm || 0);
            const endMins = eh * 60 + (em || 0);
            const diff = endMins - startMins;

            if (diff < 0) {
              alert("Invalid Time Range: End time must be strictly after start time.");
            }
          }
        }
      }

      renderWorkloadRows();
      renderTeacherList();

      const conflict = checkTeacherConflictsInHTML(t);
      if (conflict) {
        alert(['Schedule Conflict Detected:', '"' + conflict.sub1 + '" (' + conflict.time1 + ') overlaps with "' + conflict.sub2 + '" (' + conflict.time2 + ') on ' + conflict.days + '.', 'Please adjust the schedule times to avoid double-booking.'].join('\\n'));
      }
    }

    function toggleDay(idx, day) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (t && t.workloadRows[idx]) {
        const row = t.workloadRows[idx];
        const days = row.days || [];
        if (days.includes(day)) {
          row.days = days.filter(d => d !== day);
        } else {
          row.days = [...days, day];
        }
        renderWorkloadRows();
        renderTeacherList();

        const conflict = checkTeacherConflictsInHTML(t);
        if (conflict) {
          alert(['Schedule Conflict Detected:', '"' + conflict.sub1 + '" (' + conflict.time1 + ') overlaps with "' + conflict.sub2 + '" (' + conflict.time2 + ') on ' + conflict.days + '.', 'Please adjust the schedule times to avoid double-booking.'].join('\\n'));
        }
      }
    }

    function deleteRow(idx) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (t && t.workloadRows[idx]) {
        const subUpper = String(t.workloadRows[idx].subject || '').toUpperCase().trim();
        if (subUpper === 'ADVISORY' || subUpper === 'HGP' || subUpper === 'HOMEROOM GUIDANCE') {
          return alert('Advisory and HGP workload schedules are locked and cannot be deleted.');
        }
        t.workloadRows.splice(idx, 1);
        renderTeacherList();
        renderWorkloadRows();
      }
    }

    function exportReturnPayload() {
      const returnPayload = {
        version: 'INSIGHTED_WORKLOAD_DELEGATION_V1',
        schoolName: data.schoolName,
        schoolYear: data.schoolYear,
        returnedAt: new Date().toISOString(),
        teachersWorkload: {}
      };

      data.teachers.forEach(t => {
        returnPayload.teachersWorkload[t.id] = t.workloadRows;
      });

      const jsonStr = JSON.stringify(returnPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Workload_Return_' + (data.schoolName || 'School').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      alert('Return Payload Downloaded Successfully! Send this .json file back to the School Head.');
    }

    renderTeacherList();
    if (data.teachers && data.teachers.length > 0) {
      selectTeacher(data.teachers[0].id);
    }
  </script>
</body>
</html>`;
}

const SearchableSelect = ({ value, onChange, options = [], disabled = false, placeholder = 'Select...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedOption ? selectedOption.label : '');
    }
  }, [value, isOpen, selectedOption]);

  const handleInputFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
  };

  // Deduplicate options by value to avoid React duplicate key warnings
  const uniqueOptionsMap = new Map();
  (options || []).forEach(opt => {
    if (opt && opt.value !== undefined && !uniqueOptionsMap.has(String(opt.value))) {
      uniqueOptionsMap.set(String(opt.value), opt);
    }
  });

  const filteredOptions = Array.from(uniqueOptionsMap.values()).filter(opt =>
    String(opt?.label || '').toLowerCase().includes(String(search || '').toLowerCase())
  );

  const handleSelect = (val) => {
    onChange({ target: { value: val } });
    setIsOpen(false);
  };

  return (
    <div className={`searchable-select-container ${disabled ? 'disabled' : ''}`} ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div className="searchable-select-input-wrapper" style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={isOpen ? search : (selectedOption ? selectedOption.label : '')}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="searchable-select-input"
          style={{
            width: '100%',
            paddingRight: '30px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: disabled ? '#F8FAFC' : 'white',
            color: disabled ? '#94A3B8' : 'inherit',
            borderColor: disabled ? '#E2E8F0' : undefined,
            opacity: disabled ? 0.75 : 1
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: `translateY(-50%) ${isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}`,
            pointerEvents: 'none',
            opacity: disabled ? 0.4 : 0.7,
            transition: 'transform 0.2s',
            fontSize: '10px'
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && !disabled && (
        <div
          className="searchable-select-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '100%',
            maxHeight: '220px',
            overflowY: 'auto',
            background: 'white',
            border: '1.5px solid var(--line)',
            borderRadius: '12px',
            marginTop: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 999
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => {
              const isOptDisabled = !!opt.disabled;
              return (
                <div
                  key={`${opt.value}-${idx}`}
                  onClick={() => {
                    if (isOptDisabled) return;
                    handleSelect(opt.value);
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: isOptDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: String(opt.value) === String(value) ? '700' : '500',
                    background: isOptDisabled ? '#F8FAFC' : (String(opt.value) === String(value) ? 'var(--blue-50)' : 'transparent'),
                    color: isOptDisabled ? '#94A3B8' : (String(opt.value) === String(value) ? 'var(--blue)' : 'var(--navy)'),
                    opacity: isOptDisabled ? 0.75 : 1,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isOptDisabled) e.target.style.background = 'var(--blue-50)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isOptDisabled) e.target.style.background = String(opt.value) === String(value) ? 'var(--blue-50)' : 'transparent';
                  }}
                >
                  {opt.label}
                </div>
              );
            })
          ) : (
            <div style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: '13px', textAlign: 'center' }}>
              No matches found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function DatePickerDropdowns({ value, onChange, disabled = false, maxDate, minDate, required = false }) {
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef(null);

  const formatDate = (date) => {
    if (!date) return '';
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const cleanValue = value ? (typeof value === 'string' ? value.substring(0, 10) : formatDate(value)) : '';
  const maxDateStr = maxDate ? formatDate(maxDate) : '';
  const minDateStr = minDate ? formatDate(minDate) : '';

  const parsedMaxDate = maxDateStr ? new Date(maxDateStr + 'T00:00:00') : null;
  const parsedMinDate = minDateStr ? new Date(minDateStr + 'T00:00:00') : null;

  const handleOpenCalendar = () => {
    if (disabled) return;
    if (!showCalendar) {
      if (cleanValue) {
        const d = new Date(cleanValue + 'T00:00:00');
        if (!isNaN(d.getTime())) setViewDate(d);
      } else if (parsedMaxDate && new Date() > parsedMaxDate) {
        setViewDate(parsedMaxDate);
      } else if (parsedMinDate && new Date() < parsedMinDate) {
        setViewDate(parsedMinDate);
      } else {
        setViewDate(new Date());
      }
    }
    setShowCalendar(!showCalendar);
  };

  React.useEffect(() => {
    if (!showCalendar && cleanValue) {
      const d = new Date(cleanValue + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [cleanValue, showCalendar]);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDisplayDate = () => {
    if (!cleanValue) return 'Select date...';
    const d = new Date(cleanValue + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Select date...';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const firstDayOfMonth = new Date(year, month, 1);
  let startDayIndex = firstDayOfMonth.getDay() - 1;
  if (startDayIndex < 0) startDayIndex = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDayIndex - 1; i >= 0; i--) {
    cells.push({
      day: daysInPrevMonth - i,
      monthOffset: -1,
      date: new Date(year, month - 1, daysInPrevMonth - i)
    });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      monthOffset: 0,
      date: new Date(year, month, i)
    });
  }
  const totalCells = 42;
  const nextPadding = totalCells - cells.length;
  for (let i = 1; i <= nextPadding; i++) {
    cells.push({
      day: i,
      monthOffset: 1,
      date: new Date(year, month + 1, i)
    });
  }

  const handleDaySelect = (cellDate, e) => {
    e.stopPropagation();
    if (disabled) return;

    const cellStr = formatDate(cellDate);
    if (maxDateStr && cellStr > maxDateStr) return;
    if (minDateStr && cellStr < minDateStr) return;

    if (typeof onChange === 'function') {
      onChange(cellStr);
    }
    setShowCalendar(false);
  };

  const isSelected = (cellDate) => {
    return cleanValue && formatDate(cellDate) === cleanValue;
  };

  const isDisabled = (cellDate) => {
    const cellStr = formatDate(cellDate);
    if (maxDateStr && cellStr > maxDateStr) return true;
    if (minDateStr && cellStr < minDateStr) return true;
    return false;
  };

  const isRed = required && !cleanValue;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={handleOpenCalendar}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: '12px',
          border: disabled ? '1.5px solid #e2e8f0' : (isRed ? '1.5px solid #EF4444' : '1.5px solid var(--line)'),
          background: disabled ? '#f1f5f9' : (isRed ? '#FEF2F2' : 'white'),
          color: cleanValue ? 'var(--navy)' : 'var(--muted)',
          fontFamily: 'inherit',
          fontSize: '14px',
          minHeight: '44px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <span style={{ fontWeight: cleanValue ? '500' : 'normal' }}>{getDisplayDate()}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--blue)', opacity: disabled ? 0.5 : 1 }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>

      {showCalendar && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '8px',
          width: '290px',
          background: 'white',
          border: '1.5px solid var(--line)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          padding: '16px',
          zIndex: 1000,
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#F1F5F9',
              borderRadius: '20px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--navy)',
              gap: '4px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--muted)', marginRight: '2px' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <select
                value={month}
                onChange={(e) => setViewDate(new Date(year, Number(e.target.value), 1))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--navy)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              >
                {monthNames.map((mName, idx) => (
                  <option key={idx} value={idx}>{mName.toUpperCase()}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setViewDate(new Date(Number(e.target.value), month, 1))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--navy)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              >
                {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i).map((yVal) => (
                  <option key={yVal} value={yVal}>{yVal}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--navy)'
                }}
              >
                ←
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--navy)'
                }}
              >
                →
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <span key={d} style={{
                fontSize: '12px',
                fontWeight: '500',
                color: 'var(--muted)'
              }}>
                {d}
              </span>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px',
            textAlign: 'center'
          }}>
            {cells.map((cell, idx) => {
              const active = cell.monthOffset === 0;
              const selected = isSelected(cell.date);
              const disabledDay = isDisabled(cell.date);

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabledDay}
                  onClick={(e) => handleDaySelect(cell.date, e)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: selected
                      ? '#2B3945'
                      : (formatDate(cell.date) === formatDate(new Date()) && !selected)
                        ? 'white'
                        : disabledDay
                          ? 'none'
                          : '#E9EFF6',
                    border: (formatDate(cell.date) === formatDate(new Date())) && !selected
                      ? '1.5px solid #2B3945'
                      : 'none',
                    color: selected
                      ? 'white'
                      : disabledDay
                        ? '#E2E8F0'
                        : active
                          ? '#2B3945'
                          : '#94A3B8',
                    fontSize: '13px',
                    fontWeight: selected ? '600' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: disabledDay ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!selected && !disabledDay) {
                      e.currentTarget.style.background = '#CBD5E1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected && !disabledDay) {
                      e.currentTarget.style.background = (formatDate(cell.date) === formatDate(new Date())) ? 'white' : '#E9EFF6';
                    }
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MultiDatePickerDropdown({ value = [], onChange, disabled = false }) {
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef(null);

  const selectedDates = Array.isArray(value)
    ? value.map(v => typeof v === 'string' ? v.substring(0, 10) : '').filter(Boolean)
    : (typeof value === 'string' && value ? [value.substring(0, 10)] : []);

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const firstDayOfMonth = new Date(year, month, 1);
  let startDayIndex = firstDayOfMonth.getDay() - 1;
  if (startDayIndex < 0) startDayIndex = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDayIndex - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, monthOffset: -1, date: new Date(year, month - 1, daysInPrevMonth - i) });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, monthOffset: 0, date: new Date(year, month, i) });
  }
  const totalCells = 42;
  const nextPadding = totalCells - cells.length;
  for (let i = 1; i <= nextPadding; i++) {
    cells.push({ day: i, monthOffset: 1, date: new Date(year, month + 1, i) });
  }

  const toggleAllDayOfWeekInMonth = (targetDayNumber) => {
    const monthDates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      if (dt.getDay() === targetDayNumber) {
        monthDates.push(formatDate(dt));
      }
    }

    const allSelected = monthDates.length > 0 && monthDates.every(dStr => selectedDates.includes(dStr));

    if (allSelected) {
      onChange(selectedDates.filter(dStr => !monthDates.includes(dStr)));
    } else {
      const newSet = new Set([...selectedDates, ...monthDates]);
      onChange(Array.from(newSet));
    }
  };

  const toggleAllWeekdaysInMonth = () => {
    const monthDates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const dayNum = dt.getDay();
      if (dayNum >= 1 && dayNum <= 5) { // Mon - Fri
        monthDates.push(formatDate(dt));
      }
    }

    const allSelected = monthDates.length > 0 && monthDates.every(dStr => selectedDates.includes(dStr));

    if (allSelected) {
      onChange(selectedDates.filter(dStr => !monthDates.includes(dStr)));
    } else {
      const newSet = new Set([...selectedDates, ...monthDates]);
      onChange(Array.from(newSet));
    }
  };

  const handleToggleDay = (cellDate, e) => {
    e.stopPropagation();
    if (disabled) return;
    const dateStr = formatDate(cellDate);
    if (!dateStr) return;

    if (selectedDates.includes(dateStr)) {
      onChange(selectedDates.filter(d => d !== dateStr));
    } else {
      onChange([...selectedDates, dateStr]);
    }
  };

  const handleRemoveDate = (dateStr, e) => {
    e.stopPropagation();
    onChange(selectedDates.filter(d => d !== dateStr));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '28px', alignItems: 'center' }}>
          {selectedDates.map(dateStr => (
            <span
              key={dateStr}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: '#E0F2FE',
                color: '#0369A1',
                border: '1px solid #BAE6FD',
                borderRadius: '6px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 'bold'
              }}
            >
              <FiCalendar size={11} /> {formatDisplayDate(dateStr)}
              <button
                type="button"
                onClick={(e) => handleRemoveDate(dateStr, e)}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: '#0284C7',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  padding: 0,
                  marginLeft: '2px'
                }}
              ><FiX size={14} /></button>
            </span>
          ))}
          {selectedDates.length === 0 && (
            <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No dates selected</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => !disabled && setShowCalendar(!showCalendar)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1.5px solid var(--blue)',
            background: showCalendar ? 'var(--blue)' : 'var(--blue-50)',
            color: showCalendar ? 'white' : 'var(--blue)',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: disabled ? 'not-allowed' : 'pointer',
            width: 'fit-content',
            transition: 'all 0.15s ease'
          }}
        >
          <FiCalendar size={12} /> {showCalendar ? 'Close' : 'Add Date'}
        </button>
      </div>

      {showCalendar && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 9999,
            background: '#FFFFFF',
            border: '1.5px solid var(--line)',
            borderRadius: '14px',
            boxShadow: '0 10px 25px -5px rgba(8, 49, 95, 0.25)',
            padding: '14px',
            width: '285px',
            boxSizing: 'border-box'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <button type="button" onClick={handlePrevMonth} style={{ background: '#F1F5F9', border: 0, borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontWeight: 'bold' }}>‹</button>
            <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--navy)' }}>
              {monthNames[month]} {year}
            </span>
            <button type="button" onClick={handleNextMonth} style={{ background: '#F1F5F9', border: 0, borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontWeight: 'bold' }}>›</button>
          </div>

          {/* Quick Shortcuts Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={toggleAllWeekdaysInMonth}
              style={{
                flex: 1,
                padding: '4px 2px',
                fontSize: '10px',
                fontWeight: 'bold',
                borderRadius: '6px',
                border: '1px solid #BAE6FD',
                background: '#E0F2FE',
                color: '#0369A1',
                cursor: 'pointer'
              }}
              title="Select/Unselect all Monday to Friday dates in this month"
            >
              + All Weekdays (M-F)
            </button>
            {selectedDates.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  padding: '4px 6px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: '1px solid #FECDD3',
                  background: '#FFF1F2',
                  color: '#E11D48',
                  cursor: 'pointer'
                }}
                title="Clear all selected dates"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Day of Week Clickable Headers (All Mon, All Tue, etc.) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '6px' }}>
            {[
              { label: 'Mon', dayNum: 1 },
              { label: 'Tue', dayNum: 2 },
              { label: 'Wed', dayNum: 3 },
              { label: 'Thu', dayNum: 4 },
              { label: 'Fri', dayNum: 5 },
              { label: 'Sat', dayNum: 6 },
              { label: 'Sun', dayNum: 0 }
            ].map(({ label, dayNum }) => (
              <button
                key={label}
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleAllDayOfWeekInMonth(dayNum); }}
                title={`Click to select/unselect all ${label}days in ${monthNames[month]}`}
                style={{
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px',
                  color: '#0284C7',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  padding: '3px 0',
                  cursor: 'pointer'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {cells.map((cell, idx) => {
              const dStr = formatDate(cell.date);
              const isSelected = selectedDates.includes(dStr);
              const isOtherMonth = cell.monthOffset !== 0;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => handleToggleDay(cell.date, e)}
                  style={{
                    padding: '5px 0',
                    fontSize: '11px',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? '#0284C7' : (isOtherMonth ? '#F8FAFC' : '#F1F5F9'),
                    color: isSelected ? 'white' : (isOtherMonth ? '#94A3B8' : '#1E293B'),
                    cursor: 'pointer',
                    transition: 'all 0.10s ease'
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowCalendar(false)}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '6px',
              background: '#0284C7',
              color: 'white',
              border: 0,
              borderRadius: '6px',
              fontWeight: 'bold',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            Done ({selectedDates.length} Selected)
          </button>
        </div>
      )}
    </div>
  );
}

import {
  SUBJECT_OPTIONS,
  TEACHING_RELATED_TASK_OPTIONS,
  ADMINISTRATIVE_TASK_OPTIONS,
  POSITION_OPTIONS_BY_CATEGORY,
  OFFICIAL_DESIGNATIONS,
  isSpecialProgramSubjectAllowed
} from '../context/AppContext';
import { getActiveSubjectsForSchool } from './OrganizedClasses';
import { isPerGradeSharedSlot, rowSubjectGrade, splitSectionGrades, classifySection } from '@shared/timeAllotment.js';

const isAralSubject = (sub) => {
  if (!sub) return false;
  const u = String(sub).trim().toUpperCase();
  if (u.startsWith('ARALING')) return false; // Never treat ARALING PANLIPUNAN as ARAL
  return u === 'ARAL' || u.startsWith('ARAL -') || u.startsWith('ARAL-') || u.startsWith('ARAL ') || u.includes('ARAL TUTORING') || u.includes('ARAL PROGRAM');
};

let GRADE_LEVEL_SUBJECTS = {
  'ARAL': [
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE'
  ],
  'Kinder': [
    'KINDER BLOCKS OF TIME'
  ],
  'Grade 1': [
    'ADVISORY',
    'LANGUAGE',
    'READING AND LITERACY',
    'MAKABANSA',
    'MATHEMATICS',
    'GMRC',
    'SPECIAL SCIENCE',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 2': [
    'ADVISORY',
    'HGP',
    'MAKABANSA',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'GMRC',
    'SPECIAL SCIENCE',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 3': [
    'ADVISORY',
    'HGP',
    'MAKABANSA',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'GMRC',
    'SPECIAL SCIENCE',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 4': [
    'ADVISORY',
    'HGP',
    'TLE',
    'MAPEH',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'GMRC',
    'EPP/TLE',
    'SPECIAL SCIENCE',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 5': [
    'ADVISORY',
    'HGP',
    'TLE',
    'MAPEH',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'GMRC',
    'EPP/TLE',
    'SPECIAL SCIENCE',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 6': [
    'ADVISORY',
    'HGP',
    'TLE',
    'MAPEH',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'GMRC',
    'EPP/TLE',
    'SPECIAL SCIENCE',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'NON-GRADED': [
    'ADVISORY',
    'HGP',
    'KINDER BLOCKS OF TIME',
    'LANGUAGE',
    'READING AND LITERACY',
    'MAKABANSA',
    'TLE',
    'MAPEH',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'VALUES EDUCATION',
    'GMRC',
    'EPP/TLE',
    'SPECIAL PROGRAM IN THE ARTS (SPA)',
    'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
    'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
    'SPECIAL PROGRAM IN SPORTS (SPS)',
    'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON',
    'COACHING AND MENTORING'
  ]
};

const JHS_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'TLE',
  'MAPEH',
  'ARALING PANLIPUNAN',
  'FILIPINO',
  'ENGLISH',
  'MATHEMATICS',
  'SCIENCE',
  'VALUES EDUCATION',
  'EPP/TLE',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON'
];

const SHS_SUBJECTS = [
  'ADVISORY',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ORAL COMMUNICATION',
  'READING AND WRITING',
  'KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO',
  "PAGBASA AT PAGSUSURI NG IBA'T-IBANG TEKSTO TUNGO SA PANANALIKSIK",
  '21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD',
  'CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS',
  'INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO',
  'UNDERSTANDING CULTURE, SOCIETY AND POLITICS',
  'MEDIA AND INFORMATION LITERACY',
  'GENERAL MATHEMATICS',
  'STATISTICS AND PROBABILITY',
  'PHYSICAL SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN',
  'PE AND HEALTH',
  'ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES',
  'ENTREPRENEURSHIP',
  'PRACTICAL RESEARCH 1',
  'EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)',
  'PRACTICAL RESEARCH 2',
  'RESEARCH PROJECT/CULMINATING ACTIVITY*',
  'BASIC CALCULUS',
  'GENERAL BIOLOGY 1',
  'GENERAL BIOLOGY 2',
  'GENERAL CHEMISTRY 1',
  'GENERAL CHEMISTRY 2',
  'GENERAL PHYSICS 1',
  'GENERAL PHYSICS 2',
  'PRE-CALCULUS',
  'APPLIED ECONOMICS',
  'BUSINESS ETHICS AND SOCIAL RESPONSIBILITY',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2',
  'BUSINESS MATH',
  'BUSINESS FINANCE',
  'ORGANIZATION AND MANAGEMENT',
  'PRINCIPLES OF MARKETING',
  'CREATIVE NONFICTION',
  'CREATIVE WRITING/MALIKHAING PAGSULAT',
  'INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS',
  'TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE',
  'COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP',
  'DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES',
  'DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES',
  'PHILIPPINE POLITICS AND GOVERNANCE',
  'DISASTER READINESS AND RISK REDUCTION (GAS)',
  'APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS',
  'CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION',
  'CREATIVE INDUSTRIES II: PERFORMING ARTS',
  'DEVELOPING FILIPINO IDENTITY IN THE ARTS',
  '(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)',
  'EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)',
  'INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS',
  'LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS',
  'PERFORMING ARTS PRODUCTION',
  'PHYSICAL AND PERSONAL DEVELOPMENT IN THE ARTS',
  'APPRENTICESHIP (OFF-CAMPUS)',
  'FITNESS TESTING AND EXERCISE PROGRAMMING',
  'FITNESS, SPORTS, AND RECREATION LEADERSHIP',
  'FUNDAMENTAL OF COACHING',
  'HUMAN MOVEMENT',
  'PRACTICUM (IN-CAMPUS)',
  'PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE',
  'SAFETY AND FIRST AID',
  'SPORTS OFFICIATING AND ACTIVITY MANAGEMENT',
  'AGRICULTURAL CROP PRODUCTION (NC I)',
  'AGRICULTURAL CROP PRODUCTION (NC II)',
  'AGRICULTURAL CROP PRODUCTION (NC III)',
  'ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  'ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  'ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  'ANIMAL PRODUCTION- SWINE (NC II)',
  'AQUACULTURE (NC II)',
  'ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  'ARTIFICIAL INSEMINATION- SWINE (NC II)',
  'FISH CAPTURE (NC II)',
  'FISH PRODUCTS PACKAGING (NC II)',
  'FISH WHARF OPERATION (NC I)',
  'FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  'FOOD PROCESSING (NC II)',
  'HORTICULTURE (NC III)',
  'LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  'ORGANIC AGRICULTURE PRODUCTION (NC II)',
  'PEST MANAGEMENT (NC II)',
  'RICE MACHINERY OPERATION (NC II)',
  'RUBBER PROCESSING (NC II)',
  'RUBBER PRODUCTION (NC I)',
  'SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  'ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  'BARBERING (NC II)',
  'BARTENDING (NC II)',
  'BEAUTY/ NAIL CARE (NC II)',
  'BREAD AND PASTRY PRODUCTION (NC II)',
  'CAREGIVING (NC II)',
  'COMMERCIAL COOKING (NC III)',
  'COOKERY (NC II)',
  'DRESSMAKING (NC II)',
  'EVENTS MANAGEMENT SERVICES (NC III)',
  'FASHION DESIGN (NC III)',
  'FOOD AND BEVERAGE SERVICES (NC II)',
  'FRONT OFFICE SERVICES (NC II)',
  'HAIRDRESSING (NC II)',
  'HAIRDRESSING (NC III)',
  'HANDICRAFT- FASHION ACCESSORIES AND PAPER CRAFT',
  'HANDICRAFT- NEEDLECRAFT',
  'HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  'HANDICRAFT- BASKETRY MACRAME',
  'HOUSEKEEPING (NC II)',
  'TAILORING (NC II)',
  'LOCAL GUIDING SERVICES (NC II)',
  'TOURISM PROMOTION SERVICES (NC II)',
  'TRAVEL SERVICES (NC II)',
  'WELLNESS MASSAGE (NC II)',
  'ANIMATION (NC II)',
  'BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  'COMPUTER SYSTEMS SERVICING (NC II)',
  'COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  'COMPUTER PROGRAMMING JAVA (NC III)',
  'COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  'CONTACT CENTER SERVICES (NC II)',
  'ILLUSTRATION (NC II)',
  'MEDICAL TRANSCRIPTION (NC II)',
  'TECHNICAL DRAFTING (NC II)',
  'TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  'TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  'AUTOMOTIVE SERVICING (NC I)',
  'AUTOMOTIVE SERVICING (NC II)',
  'CARPENTRY (NC II)',
  'CARPENTRY (NC III)',
  'CONSTRUCTION PAINTING (NC II)',
  'ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  'DRIVING (NC II)',
  'ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  'ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  'FURNITURE MAKING- FINISHING (NC II)',
  'GAS METAL ARC WELDING- GMAW (NC II)',
  'GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  'INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  'MACHINING (NC I)',
  'MACHINING (NC II)',
  'MASONRY (NC II)',
  'MECHATRONICS SERVICING (NC II)',
  'MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  'PLUMBING (NC I)',
  'PLUMBING (NC II)',
  'REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  'SHIELDED METAL ARC WELDING (NC I)',
  'SHIELDED METAL ARC WELDING (NC II)',
  'TILE SETTING (NC II)',
  'TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (80)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC I)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC II)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC III)',
  '(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  '(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  '(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  '(GAS) ANIMAL PRODUCTION- SWINE (NC II)',
  '(GAS) AQUACULTURE (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)',
  '(GAS) FISH CAPTURE (NC II)',
  '(GAS) FISH PRODUCTS PACKAGING (NC II)',
  '(GAS) FISH WHARF OPERATION (NC I)',
  '(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  '(GAS) FOOD PROCESSING (NC II)',
  '(GAS) HORTICULTURE (NC III)',
  '(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)',
  '(GAS) PEST MANAGEMENT (NC II)',
  '(GAS) RICE MACHINERY OPERATION (NC II)',
  '(GAS) RUBBER PROCESSING (NC II)',
  '(GAS) RUBBER PRODUCTION (NC I)',
  '(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  '(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  '(GAS) BARBERING (NC II)',
  '(GAS) BARTENDING (NC II)',
  '(GAS) BEAUTY/ NAIL CARE (NC II)',
  '(GAS) BREAD AND PASTRY PRODUCTION (NC II)',
  '(GAS) CAREGIVING (NC II)',
  '(GAS) COMMERCIAL COOKING (NC III)',
  '(GAS) COOKERY (NC II)',
  '(GAS) DRESSMAKING (NC II)',
  '(GAS) EVENTS MANAGEMENT SERVICES (NC III)',
  '(GAS) FASHION DESIGN (NC III)',
  '(GAS) FOOD AND BEVERAGE SERVICES (NC II)',
  '(GAS) FRONT OFFICE SERVICES (NC II)',
  '(GAS) HAIRDRESSING (NC II)',
  '(GAS) HAIRDRESSING (NC III)',
  '(GAS) HANDICRAFT- FASHION ACCESSORIES AND PAPER CRAFT',
  '(GAS) HANDICRAFT- NEEDLECRAFT',
  '(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  '(GAS) HANDICRAFT- BASKETRY MACRAME',
  '(GAS) HOUSEKEEPING (NC II)',
  '(GAS) TAILORING (NC II)',
  '(GAS) LOCAL GUIDING SERVICES (NC II)',
  '(GAS) TOURISM PROMOTION SERVICES (NC II)',
  '(GAS) TRAVEL SERVICES (NC II)',
  '(GAS) WELLNESS MASSAGE (NC II)',
  '(GAS) ANIMATION (NC II)',
  '(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  '(GAS) COMPUTER SYSTEMS SERVICING (NC II)',
  '(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  '(GAS) COMPUTER PROGRAMMING JAVA (NC III)',
  '(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  '(GAS) CONTACT CENTER SERVICES (NC II)',
  '(GAS) ILLUSTRATION (NC II)',
  '(GAS) MEDICAL TRANSCRIPTION (NC II)',
  '(GAS) TECHNICAL DRAFTING (NC II)',
  '(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  '(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  '(GAS) AUTOMOTIVE SERVICING (NC I)',
  '(GAS) AUTOMOTIVE SERVICING (NC II)',
  '(GAS) CARPENTRY (NC II)',
  '(GAS) CARPENTRY (NC III)',
  '(GAS) CONSTRUCTION PAINTING (NC II)',
  '(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  '(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  '(GAS) DRIVING (NC II)',
  '(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  '(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) FURNITURE MAKING- FINISHING (NC II)',
  '(GAS) GAS METAL ARC WELDING- GMAW (NC II)',
  '(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  '(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  '(GAS) MACHINING (NC I)',
  '(GAS) MACHINING (NC II)',
  '(GAS) MASONRY (NC II)',
  '(GAS) MECHATRONICS SERVICING (NC II)',
  '(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  '(GAS) PLUMBING (NC I)',
  '(GAS) PLUMBING (NC II)',
  '(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  '(GAS) SHIELDED METAL ARC WELDING (NC I)',
  '(GAS) SHIELDED METAL ARC WELDING (NC II)',
  '(GAS) TILE SETTING (NC II)',
  '(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (160)',
  'DISASTER READINESS AND RISK REDUCTION',
  'EARTH SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PHYSICAL SCIENCE',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (240)',
  'NAVIGATIONAL WATCH 1',
  'NAVIGATIONAL WATCH 2',
  'NAVIGATIONAL WATCH 3',
  'ENGINE WATCH 1',
  'ENGINE WATCH 2',
  'SAFETY 1',
  'SAFETY 2',
  'SHIP\'S CATERING SERVICES 1',
  'MARITIME (PB)',
  'INTRODUCTION TO MARITIME CAREER',
  'INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING',
  'INTRODUCTION TO MARITIME SAFETY',
  'INQUIRIES, INVESTIGATIONS AND IMMERSION',
  'RESEARCH/CAPSTONE PROJECT',
  'OTHERS SPECIALIZED SUBJECT',
  'EFFECTIVE COMMUNICATION',
  'MABISANG KOMUNIKASYON',
  'GENERAL SCIENCE',
  'LIFE AND CAREER SKILLS',
  'PAG-AARAL NG KASAYSAYAN AT LIPUNANG PILIPINO',
  'ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)',
  'ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)',
  'FILIPINO IDENTITY THROUGH THE ARTS',
  'LEADERSHIP AND MANGEMENT IN THE ARTS',
  'CITIZENSHIP AND CIVIC ENGAGEMENT',
  'CONTEMPORARY LITERATURE 1',
  'CONTEMPORARY LITERATURE 2',
  'CREATIVE COMPOSITION 1',
  'CREATIVE COMPOSITION 2',
  'FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)',
  'FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)',
  'FILIPINO 2 (FILIPINO SA ISPORTS)',
  'FILIPINO 2 (FILIPINO SA SINING AT DISENYO)',
  'INTRODUCTION TO PHILOSOPHY',
  'MALIKHAING PAGSULAT',
  'PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)',
  'SOCIAL SCIENCES (THEORY AND PRACTICE)',
  'BUSINESS 1 (BASIC ACCOUNTING)',
  'BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)',
  'BUSINESS 3 (BUSINESS ECONOMICS)',
  'CONTEMPORARY MARKETING',
  'INTRODUCTION TO ORGANIZATION AND MANAGEMENT',
  'ADVANCED MATHEMATICS 1',
  'ADVANCED MATHEMATICS 2',
  'BIOLOGY 1',
  'BIOLOGY 2',
  'BIOLOGY 3',
  'BIOLOGY 4',
  'CHEMISTRY 1',
  'CHEMISTRY 2',
  'CHEMISTRY 3',
  'CHEMISTRY 4',
  'DATABASE MANAGEMENT',
  'EARTH AND SPACE SCIENCE 1',
  'EARTH AND SPACE SCIENCE 2',
  'EARTH AND SPACE SCIENCE 3',
  'EARTH AND SPACE SCIENCE 4',
  'EMPOWERMENT TECHNOLOGIES',
  'FINITE MATHEMATICS 1',
  'FINITE MATHEMATICS 2',
  'FUNDAMENTALS IN DATA ANALYTICS',
  'GENERAL SCIENCE 3',
  'GENERAL SCIENCE 4',
  'PHYSICS 1',
  'PHYSICS 2',
  'PHYSICS 3',
  'PHYSICS 4',
  'PRE-CALCULUS 1',
  'PRE-CALCULUS 2',
  'TRIGONOMETRY 1',
  'TRIGONOMETRY 2',
  'EXERCISE AND SPORTS PROGRAMMING',
  'HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)',
  'HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)',
  'PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)',
  'PHYSICAL EDUCATION 2 (SPORTS AND DANCE)',
  'SPORTS ACTIVITY MANAGEMENT',
  'SPORTS COACHING',
  'SPORTS OFFICIATING',
  'ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)',
  'CREATIVE PRODUCTION AND PRESENTATION',
  'DESIGN AND INNOVATION',
  'RESEARCH METHODS',
  '(IN-CAMPUS) SPORTS',
  '(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)',
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL',
  'AESTHETIC SERVICES (BEAUTY CARE)',
  'BARBERING SERVICES',
  'CAREGIVING (ADULT CARE)',
  'CAREGIVING (CHILD CARE)',
  'HAIRDRESSING SERVICES',
  'WELLNESS SERVICES (HILOT/MASSAGE)',
  'AGRICULTURAL CROPS PRODUCTION',
  'AGRO-ENTREPRENEURSHIP',
  'FISH CAPTURE OPERATION',
  'POULTRY PRODUCTION (CHICKEN)',
  'RUMINANTS PRODUCTION',
  'SWINE PRODUCTION',
  'GARMENTS ARTISANRY',
  'HANDICRAFTS (WEAVING)',
  'AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)',
  'AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)',
  'DRIVING AND AUTOMOTIVE SERVICING',
  'MOTORCYCLE AND SMALL ENGINE SERVICING',
  'CONSTRUCTION OPERATION',
  'MANUAL METAL ARC WELDING',
  'BAKERY OPERATION',
  'FOOD AND BEVERAGE OPERATION',
  'HOTEL OPERATION (FRONT OFFICE SERVICES)',
  'HOTEL OPERATION (HOUSEKEEPING SERVICES)',
  'KITCHEN OPERATIONS',
  'TOURISM SERVICES',
  'COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING',
  'ELECTRICAL INSTALLATION MAINTENANCE',
  'ELECTRONICS PRODUCT ASSEMBLY AND SERVICING',
  'MECHATRONICS',
  'PHOTOVOLTAIC SYSTEMS INSTALLATION',
  'COMPUTER PROGRAMMING (JAVA)',
  'COMPUTER PROGRAMMING (.NET TECHNOLOGY)',
  'COMPUTER PROGRAMMING (ORACLE DATABASE)',
  'MARINE ENGINEERING AT THE SUPPORT LEVEL',
  'MARINE TRANSPORTATION AT THE SUPPORT LEVEL',
  'SHIPS CATERING SERVICES',
  'WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER',
  'WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION',
  'WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE',
  'WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES',
  'WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES',
  'WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES',
  'WORK IMMERSION - HOSPITALITY AND TOURISM',
  'WORK IMMERSION - INDUSTRIAL TECHNOLOGIES',
  'WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES',
  'WORK IMMERSION - MARITIME TRANSPORT'
];

const SHS_CORE_SUBJECTS = SHS_SUBJECTS.slice(30, 47);
const SHS_APPLIED_SUBJECTS = SHS_SUBJECTS.slice(47, 59);
const SHS_SPECIALIZED_SUBJECTS = SHS_SUBJECTS.slice(59, 290);
const SSHS_CORE_SUBJECTS = SHS_SUBJECTS.slice(290, 298);
const SSHS_ACADEMIC_SUBJECTS = SHS_SUBJECTS.slice(298, 381);
const SSHS_TECHPRO_SUBJECTS = SHS_SUBJECTS.slice(381);

const SHS_GRADE12_SUBJECTS = [
  'ADVISORY',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL  EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON'
];

const SHS_CORE_GRADE12_SUBJECTS = [
  'ORAL COMMUNICATION',
  'READING AND WRITING',
  "KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO",
  "PAGBASA AT PAGSUSURI NG IBA'T-IBANG TEKSTO TUNGO SA PANANALIKSIK",
  '21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD',
  'CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS',
  "INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO",
  'UNDERSTANDING CULTURE, SOCIETY AND POLITICS',
  'MEDIA AND INFORMATION LITERACY',
  'GENERAL MATHEMATICS',
  'STATISTICS AND PROBABILITY',
  'PHYSICAL SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN',
  'PE AND HEALTH'
];

const SHS_APPLIED_GRADE12_SUBJECTS = [
  'ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES',
  'ENTREPRENEURSHIP',
  'PRACTICAL RESEARCH 1',
  'EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)',
  'PRACTICAL RESEARCH 2',
  'RESEARCH PROJECT/CULMINATING ACTIVITY*'
];

const SHS_SPECIALIZED_GRADE12_SUBJECTS = [
  'BASIC CALCULUS',
  'GENERAL BIOLOGY 1',
  'GENERAL BIOLOGY 2',
  'GENERAL CHEMISTRY 1',
  'GENERAL CHEMISTRY 2',
  'GENERAL PHYSICS 1',
  'GENERAL PHYSICS 2',
  'PRE-CALCULUS',
  'APPLIED ECONOMICS',
  'BUSINESS ETHICS AND SOCIAL RESPONSIBILITY',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2',
  'BUSINESS MATH',
  'BUSINESS FINANCE',
  'ORGANIZATION AND MANAGEMENT',
  'PRINCIPLES OF MARKETING',
  'CREATIVE NONFICTION',
  'CREATIVE WRITING/MALIKHAING PAGSULAT',
  'INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS',
  'TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE',
  'COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP',
  'DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES',
  'DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES',
  'PHILIPPINE POLITICS AND GOVERNANCE',
  'APPLIED ECONOMICS',
  'DISASTER READINESS AND RISK REDUCTION (GAS)',
  'ORGANIZATION AND MANAGEMENT',
  'APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS',
  'CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION',
  'CREATIVE INDUSTRIES II: PERFORMING ARTS',
  'DEVELOPING FILIPINO IDENTITY IN THE ARTS',
  '(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)',
  'EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)',
  'INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS',
  'LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS',
  'PERFORMING ARTS PRODUCTION',
  'PHYSICAL AND PERSONAL DEVELOPMENT in the arts',
  'APPRENTICESHIP (OFF-CAMPUS)',
  'FITNESS TESTING AND EXERCISE PROGRAMMING',
  'FITNESS, SPORTS, AND RECREATION LEADERSHIP',
  'FUNDAMENTAL OF COACHING',
  'HUMAN MOVEMENT',
  'PRACTICUM (IN-CAMPUS)',
  'PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE',
  'SAFETY AND FIRST AID',
  'SPORTS OFFICIATING AND ACTIVITY MANAGEMENT',
  'AGRICULTURAL CROP PRODUCTION (NC I)',
  'AGRICULTURAL CROP PRODUCTION (NC II)',
  'AGRICULTURAL CROP PRODUCTION (NC III)',
  'ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  'ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  'ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  'ANIMAL PRODUCTION- SWINE (NC II)',
  'AQUACULTURE (NC II)',
  'ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  'ARTIFICIAL INSEMINATION- SWINE (NC II)',
  'FISH CAPTURE (NC II)',
  'FISH PRODUCTS PACKAGING (NC II)',
  'FISH WHARF OPERATION (NC I)',
  'FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  'FOOD PROCESSING (NC II)',
  'HORTICULTURE (NC III)',
  'LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  'ORGANIC AGRICULTURE PRODUCTION (NC II)',
  'PEST MANAGEMENT (NC II)',
  'RICE MACHINERY OPERATION (NC II)',
  'RUBBER PROCESSING (NC II)',
  'RUBBER PRODUCTION (NC I)',
  'SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  'ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  'BARBERING (NC II)',
  'BARTENDING (NC II)',
  'BEAUTY/ NAIL CARE (NC II)',
  'BREAD AND PASTRY PRODUCTION (NC II)',
  'CAREGIVING (NC II)',
  'COMMERCIAL COOKING (NC III)',
  'COOKERY (NC II)',
  'DRESSMAKING (NC II)',
  'EVENTS MANAGEMENT SERVICES (NC III)',
  'FASHION DESIGN (NC III)',
  'FOOD AND BEVERAGE SERVICES (NC II)',
  'FRONT OFFICE SERVICES (NC II)',
  'HAIRDRESSING (NC II)',
  'HAIRDRESSING (NC III)',
  'HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT',
  'HANDICRAFT- NEEDLECRAFT',
  'HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  'HANDICRAFT- BASKETRY MACRAME',
  'HOUSEKEEPING (NC II)',
  'TAILORING (NC II)',
  'LOCAL GUIDING SERVICES (NC II)',
  'TOURISM PROMOTION SERVICES (NC II)',
  'TRAVEL SERVICES (NC II)',
  'WELLNESS MASSAGE (NC II)',
  'ANIMATION (NC II)',
  'BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  'COMPUTER SYSTEMS SERVICING (NC II)',
  'COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  'COMPUTER PROGRAMMING JAVA (NC III)',
  'COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  'CONTACT CENTER SERVICES (NC II)',
  'ILLUSTRATION (NC II)',
  'MEDICAL TRANSCRIPTION (NC II)',
  'TECHNICAL DRAFTING (NC II)',
  'TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  'TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  'AUTOMOTIVE SERVICING (NC I)',
  'AUTOMOTIVE SERVICING (NC II)',
  'CARPENTRY (NC II)',
  'CARPENTRY (NC III)',
  'CONSTRUCTION PAINTING (NC II)',
  'ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  'DRIVING (NC II)',
  'ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  'ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  'FURNITURE MAKING- FINISHING (NC II)',
  'GAS METAL ARC WELDING- GMAW (NC II)',
  'GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  'INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  'MACHINING (NC I)',
  'MACHINING (NC II)',
  'MASONRY (NC II)',
  'MECHATRONICS SERVICING (NC II)',
  'MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  'PLUMBING (NC I)',
  'PLUMBING (NC II)',
  'REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  'SHIELDED METAL ARC WELDING (NC I)',
  'SHIELDED METAL ARC WELDING (NC II)',
  'TILE SETTING (NC II)',
  'TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (80)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC I)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC II)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC III)',
  '(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  '(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  '(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  '(GAS) ANIMAL PRODUCTION- SWINE (NC II)',
  '(GAS) AQUACULTURE (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)',
  '(GAS) FISH CAPTURE (NC II)',
  '(GAS) FISH PRODUCTS PACKAGING (NC II)',
  '(GAS) FISH WHARF OPERATION (NC I)',
  '(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  '(GAS) FOOD PROCESSING (NC II)',
  '(GAS) HORTICULTURE (NC III)',
  '(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)',
  '(GAS) PEST MANAGEMENT (NC II)',
  '(GAS) RICE MACHINERY OPERATION (NC II)',
  '(GAS) RUBBER PROCESSING (NC II)',
  '(GAS) RUBBER PRODUCTION (NC I)',
  '(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  '(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  '(GAS) BARBERING (NC II)',
  '(GAS) BARTENDING (NC II)',
  '(GAS) BEAUTY/ NAIL CARE (NC II)',
  '(GAS) BREAD AND PASTRY PRODUCTION (NC II)',
  '(GAS) CAREGIVING (NC II)',
  '(GAS) COMMERCIAL COOKING (NC III)',
  '(GAS) COOKERY (NC II)',
  '(GAS) DRESSMAKING (NC II)',
  '(GAS) EVENTS MANAGEMENT SERVICES (NC III)',
  '(GAS) FASHION DESIGN (NC III)',
  '(GAS) FOOD AND BEVERAGE SERVICES (NC II)',
  '(GAS) FRONT OFFICE SERVICES (NC II)',
  '(GAS) HAIRDRESSING (NC II)',
  '(GAS) HAIRDRESSING (NC III)',
  '(GAS) HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT',
  '(GAS) HANDICRAFT- NEEDLECRAFT',
  '(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  '(GAS) HANDICRAFT- BASKETRY MACRAME',
  '(GAS) HOUSEKEEPING (NC II)',
  '(GAS) TAILORING (NC II)',
  '(GAS) LOCAL GUIDING SERVICES (NC II)',
  '(GAS) TOURISM PROMOTION SERVICES (NC II)',
  '(GAS) TRAVEL SERVICES (NC II)',
  '(GAS) WELLNESS MASSAGE (NC II)',
  '(GAS) ANIMATION (NC II)',
  '(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  '(GAS) COMPUTER SYSTEMS SERVICING (NC II)',
  '(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  '(GAS) COMPUTER PROGRAMMING JAVA (NC III)',
  '(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  '(GAS) CONTACT CENTER SERVICES (NC II)',
  '(GAS) ILLUSTRATION (NC II)',
  '(GAS) MEDICAL TRANSCRIPTION (NC II)',
  '(GAS) TECHNICAL DRAFTING (NC II)',
  '(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  '(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  '(GAS) AUTOMOTIVE SERVICING (NC I)',
  '(GAS) AUTOMOTIVE SERVICING (NC II)',
  '(GAS) CARPENTRY (NC II)',
  '(GAS) CARPENTRY (NC III)',
  '(GAS) CONSTRUCTION PAINTING (NC II)',
  '(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  '(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  '(GAS) DRIVING (NC II)',
  '(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  '(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) FURNITURE MAKING- FINISHING (NC II)',
  '(GAS) GAS METAL ARC WELDING- GMAW (NC II)',
  '(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  '(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  '(GAS) MACHINING (NC I)',
  '(GAS) MACHINING (NC II)',
  '(GAS) MASONRY (NC II)',
  '(GAS) MECHATRONICS SERVICING (NC II)',
  '(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  '(GAS) PLUMBING (NC I)',
  '(GAS) PLUMBING (NC II)',
  '(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  '(GAS) SHIELDED METAL ARC WELDING (NC I)',
  '(GAS) SHIELDED METAL ARC WELDING (NC II)',
  '(GAS) TILE SETTING (NC II)',
  '(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (160)',
  'DISASTER READINESS AND RISK REDUCTION',
  'EARTH SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PHYSICAL SCIENCE',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (240)',
  'NAVIGATIONAL WATCH 1',
  'NAVIGATIONAL WATCH 2',
  'NAVIGATIONAL WATCH 3',
  'ENGINE WATCH 1',
  'ENGINE WATCH 2',
  'SAFETY 1',
  'SAFETY 2',
  'SHIP\'S CATERING SERVICES 1',
  'MARITIME (PB)',
  'PRE-CALCULUS',
  'BASIC CALCULUS',
  'GENERAL PHYSICS 1',
  'GENERAL PHYSICS 2',
  'GENERAL CHEMISTRY 1',
  'INTRODUCTION TO MARITIME CAREER',
  'INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING',
  'INTRODUCTION TO MARITIME SAFETY',
  'INQUIRIES, INVESTIGATIONS AND IMMERSION',
  'RESEARCH/CAPSTONE PROJECT',
  'OTHERS SPECIALIZED SUBJECT'
];

const SSHS_ACADEMIC_GRADE12_SUBJECTS = [
  'ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)',
  'ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)',
  'FILIPINO IDENTITY THROUGH THE ARTS',
  'LEADERSHIP AND MANGEMENT IN THE ARTS',
  'CITIZENSHIP AND CIVIC ENGAGEMENT',
  'CONTEMPORARY LITERATURE 1',
  'CONTEMPORARY LITERATURE 2',
  'CREATIVE COMPOSITION 1',
  'CREATIVE COMPOSITION 2',
  'FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)',
  'FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)',
  'FILIPINO 2 (FILIPINO SA ISPORTS)',
  'FILIPINO 2 (FILIPINO SA SINING AT DISENYO)',
  'INTRODUCTION TO PHILOSOPHY',
  'MALIKHAING PAGSULAT',
  'PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)',
  'SOCIAL SCIENCES (THEORY AND PRACTICE)',
  'BUSINESS 1 (BASIC ACCOUNTING)',
  'BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)',
  'BUSINESS 3 (BUSINESS ECONOMICS)',
  'CONTEMPORARY MARKETING',
  'ENTREPRENEURSHIP',
  'INTRODUCTION TO ORGANIZATION AND MANAGEMENT',
  'ADVANCED MATHEMATICS 1',
  'ADVANCED MATHEMATICS 2',
  'BIOLOGY 1',
  'BIOLOGY 2',
  'BIOLOGY 3',
  'BIOLOGY 4',
  'CHEMISTRY 1',
  'CHEMISTRY 2',
  'CHEMISTRY 3',
  'CHEMISTRY 4',
  'DATABASE MANAGEMENT',
  'EARTH AND SPACE SCIENCE 1',
  'EARTH AND SPACE SCIENCE 2',
  'EARTH AND SPACE SCIENCE 3',
  'EARTH AND SPACE SCIENCE 4',
  'EMPOWERMENT TECHNOLOGIES',
  'FINITE MATHEMATICS 1',
  'FINITE MATHEMATICS 2',
  'FUNDAMENTALS IN DATA ANALYTICS',
  'GENERAL SCIENCE 3',
  'GENERAL SCIENCE 4',
  'PHYSICS 1',
  'PHYSICS 2',
  'PHYSICS 3',
  'PHYSICS 4',
  'PRE-CALCULUS 1',
  'PRE-CALCULUS 2',
  'TRIGONOMETRY 1',
  'TRIGONOMETRY 2',
  'EXERCISE AND SPORTS PROGRAMMING',
  'HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)',
  'HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)',
  'PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)',
  'PHYSICAL EDUCATION 2 (SPORTS AND DANCE)',
  'SAFETY AND FIRST AID',
  'SPORTS ACTIVITY MANAGEMENT',
  'SPORTS COACHING',
  'SPORTS OFFICIATING',
  'ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)',
  'CREATIVE PRODUCTION AND PRESENTATION',
  'DESIGN AND INNOVATION',
  'RESEARCH METHODS',
  '(IN-CAMPUS) SPORTS',
  '(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)',
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL'
];

const SSHS_TECHPRO_GRADE12_SUBJECTS = [
  'AESTHETIC SERVICES (BEAUTY CARE)',
  'BARBERING SERVICES',
  'CAREGIVING (ADULT CARE)',
  'CAREGIVING (CHILD CARE)',
  'HAIRDRESSING SERVICES',
  'WELLNESS SERVICES (HILOT/MASSAGE)',
  'AGRICULTURAL CROPS PRODUCTION',
  'AGRO-ENTREPRENEURSHIP',
  'AQUACULTURE',
  'FISH CAPTURE OPERATION',
  'FOOD PROCESSING',
  'ORGANIC AGRICULTURE PRODUCTION',
  'POULTRY PRODUCTION (CHICKEN)',
  'RUMINANTS PRODUCTION',
  'SWINE PRODUCTION',
  'GARMENTS ARTISANRY',
  'HANDICRAFTS (WEAVING)',
  'AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)',
  'AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)',
  'DRIVING AND AUTOMOTIVE SERVICING',
  'MOTORCYCLE AND SMALL ENGINE SERVICING',
  'CARPENTRY',
  'CONSTRUCTION OPERATION',
  'MANUAL METAL ARC WELDING',
  'TECHNICAL DRAFTING',
  'ANIMATION',
  'ILLUSTRATION',
  'VISUAL GRAPHICS DESIGN',
  'BAKERY OPERATION',
  'EVENTS MANAGEMENT SERVICES',
  'FOOD AND BEVERAGE OPERATION',
  'HOTEL OPERATION (FRONT OFFICE SERVICES)',
  'HOTEL OPERATION (HOUSEKEEPING SERVICES)',
  'KITCHEN OPERATIONS',
  'TOURISM SERVICES',
  'COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING',
  'ELECTRICAL INSTALLATION MAINTENANCE',
  'ELECTRONICS PRODUCT ASSEMBLY AND SERVICING',
  'MECHATRONICS',
  'PHOTOVOLTAIC SYSTEMS INSTALLATION',
  'BROADBAND INSTALLATION',
  'COMPUTER PROGRAMMING (JAVA)',
  'COMPUTER PROGRAMMING (.NET TECHNOLOGY)',
  'COMPUTER PROGRAMMING (ORACLE DATABASE)',
  'COMPUTER SYSTEMS SERVICING',
  'CONTACT CENTER SERVICES',
  'MARINE ENGINEERING AT THE SUPPORT LEVEL',
  'MARINE TRANSPORTATION AT THE SUPPORT LEVEL',
  'SHIPS CATERING SERVICES',
  'WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER',
  'WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION',
  'WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE',
  'WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES',
  'WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES',
  'WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES',
  'WORK IMMERSION - HOSPITALITY AND TOURISM',
  'WORK IMMERSION - INDUSTRIAL TECHNOLOGIES',
  'WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES',
  'WORK IMMERSION - MARITIME TRANSPORT',
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL'
];

const ELEMENTARY_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT'
];

const JHS_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT'
];

const SHS_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT'
];

const JHS_NON_GRADED_SUBJECTS = [
  'ADVISORY',
  'ARALING PANLIPUNAN',
  'FILIPINO',
  'ENGLISH',
  'MATHEMATICS',
  'SCIENCE',
  'EPP/TLE',
  'MAPEH',
  'VALUES EDUCATION',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL  EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'COACHING AND MENTORING'
];

const SHS_NON_GRADED_SUBJECTS = [
  'ADVISORY',
  'ARALING PANLIPUNAN',
  'FILIPINO',
  'ENGLISH',
  'MATHEMATICS',
  'SCIENCE',
  'EPP/TLE',
  'MAPEH',
  'VALUES EDUCATION',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL  EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'COACHING AND MENTORING'
];

GRADE_LEVEL_SUBJECTS['Grade 7'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 8'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 9'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 10'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 11'] = SHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 12'] = SHS_GRADE12_SUBJECTS;

['Grade 4', 'GRADE 4', '4', 'G4', 'Grade 4 - MATATAG', 'GRADE 4 - MATATAG'].forEach(k => { if (GRADE_LEVEL_SUBJECTS['Grade 4']) GRADE_LEVEL_SUBJECTS[k] = GRADE_LEVEL_SUBJECTS['Grade 4']; });
['Grade 5', 'GRADE 5', '5', 'G5', 'Grade 5 - MATATAG', 'GRADE 5 - MATATAG'].forEach(k => { if (GRADE_LEVEL_SUBJECTS['Grade 5']) GRADE_LEVEL_SUBJECTS[k] = GRADE_LEVEL_SUBJECTS['Grade 5']; });
['Grade 6', 'GRADE 6', '6', 'G6', 'Grade 6 - MATATAG', 'GRADE 6 - MATATAG'].forEach(k => { if (GRADE_LEVEL_SUBJECTS['Grade 6']) GRADE_LEVEL_SUBJECTS[k] = GRADE_LEVEL_SUBJECTS['Grade 6']; });
['Grade 7', 'GRADE 7', '7', 'G7', 'Grade 7 - MATATAG', 'GRADE 7 - MATATAG'].forEach(k => { GRADE_LEVEL_SUBJECTS[k] = JHS_SUBJECTS; });
['Grade 8', 'GRADE 8', '8', 'G8', 'Grade 8 - MATATAG', 'GRADE 8 - MATATAG'].forEach(k => { GRADE_LEVEL_SUBJECTS[k] = JHS_SUBJECTS; });
['Grade 9', 'GRADE 9', '9', 'G9', 'Grade 9 - MATATAG', 'GRADE 9 - MATATAG'].forEach(k => { GRADE_LEVEL_SUBJECTS[k] = JHS_SUBJECTS; });
['Grade 10', 'GRADE 10', '10', 'G10', 'Grade 10 - MATATAG', 'GRADE 10 - MATATAG'].forEach(k => { GRADE_LEVEL_SUBJECTS[k] = JHS_SUBJECTS; });
['JHS', 'Junior High School', 'JUNIOR HIGH SCHOOL'].forEach(k => { GRADE_LEVEL_SUBJECTS[k] = JHS_SUBJECTS; });

// Filter out TR - options from GRADE_LEVEL_SUBJECTS lists programmatically
Object.keys(GRADE_LEVEL_SUBJECTS).forEach(key => {
  if (Array.isArray(GRADE_LEVEL_SUBJECTS[key])) {
    GRADE_LEVEL_SUBJECTS[key] = GRADE_LEVEL_SUBJECTS[key].filter(sub => !sub.startsWith('TR -'));
  }
});

// Also filter out TR - options from other standalone subject arrays in-place
[JHS_SUBJECTS, SHS_SUBJECTS, SHS_GRADE12_SUBJECTS].forEach(arr => {
  if (Array.isArray(arr)) {
    const filtered = arr.filter(sub => !sub.startsWith('TR -'));
    arr.length = 0;
    arr.push(...filtered);
  }
});

const GRADE_LEVELS_BY_CATEGORY = {
  'Elementary': ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'MONO-GRADE'],
  'JHS': ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'NON-GRADED', 'MONO-GRADE'],
  'SHS': ['Grade 11', 'Grade 12', 'NON-GRADED', 'MONO-GRADE'],
  'SHS-CORE SUBJECTS': ['Grade 11', 'Grade 12'],
  'SHS-APPLIED SUBJECTS': ['Grade 11', 'Grade 12'],
  'SHS-SPECIALIZED SUBJECTS': ['Grade 11', 'Grade 12'],
  'SSHS-CORE': ['Grade 11'],
  'SSHS-ACADEMIC': ['Grade 11', 'Grade 12'],
  'SSHS-TECHPRO': ['Grade 11', 'Grade 12']
};


const REMEDIATION_FOCUS_BY_CATEGORY = {
  "Elementary": [
    "KINDER BLOCKS OF TIME",
    "LANGUAGE",
    "READING AND LITERACY",
    "MAKABANSA",
    "TLE",
    "MAPEH",
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "GMRC",
    "EPP/TLE"
  ],
  "JHS": [
    "TLE",
    "MAPEH",
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "VALUES EDUCATION",
    "EPP/TLE"
  ],
  "ALL": [
    "TLE",
    "MAPEH",
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "VALUES EDUCATION",
    "GMRC",
    "EPP/TLE"
  ],
  "SHS-CORE SUBJECTS": [
    "ORAL COMMUNICATION",
    "READING AND WRITING",
    "KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO",
    "PAGBASA AT PAGSUSURI NG IBA'T-IBANG TEKSTO TUNGO SA PANANALIKSIK",
    "21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD",
    "CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS",
    "INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO",
    "UNDERSTANDING CULTURE, SOCIETY AND POLITICS",
    "MEDIA AND INFORMATION LITERACY",
    "GENERAL MATHEMATICS",
    "STATISTICS AND PROBABILITY",
    "PHYSICAL SCIENCE",
    "EARTH AND LIFE SCIENCE",
    "PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN",
    "PE AND HEALTH"
  ],
  "SHS-APPLIED SUBJECTS": [
    "ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES",
    "ENTREPRENEURSHIP",
    "PRACTICAL RESEARCH 1",
    "EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)",
    "PRACTICAL RESEARCH 2",
    "RESEARCH PROJECT/CULMINATING ACTIVITY*"
  ],
  "SHS-SPECIALIZED SUBJECTS": [
    "BASIC CALCULUS",
    "GENERAL BIOLOGY 1",
    "GENERAL BIOLOGY 2",
    "GENERAL CHEMISTRY 1",
    "GENERAL CHEMISTRY 2",
    "GENERAL PHYSICS 1",
    "GENERAL PHYSICS 2",
    "PRE-CALCULUS",
    "APPLIED ECONOMICS",
    "BUSINESS ETHICS AND SOCIAL RESPONSIBILITY",
    "FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1",
    "FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2",
    "BUSINESS MATH",
    "BUSINESS FINANCE",
    "ORGANIZATION AND MANAGEMENT",
    "PRINCIPLES OF MARKETING",
    "CREATIVE NONFICTION",
    "CREATIVE WRITING/MALIKHAING PAGSULAT",
    "INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS",
    "TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE",
    "COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP",
    "DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES",
    "DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES",
    "PHILIPPINE POLITICS AND GOVERNANCE",
    "APPLIED ECONOMICS",
    "DISASTER READINESS AND RISK REDUCTION (GAS)",
    "ORGANIZATION AND MANAGEMENT",
    "APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS",
    "CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION",
    "CREATIVE INDUSTRIES II: PERFORMING ARTS",
    "DEVELOPING FILIPINO IDENTITY IN THE ARTS",
    "(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)",
    "EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)",
    "INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS",
    "LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS",
    "PERFORMING ARTS PRODUCTION",
    "PHYSICAL AND PERSONAL DEVELOPMENT IN THE ARTS",
    "APPRENTICESHIP (OFF-CAMPUS)",
    "FITNESS TESTING AND EXERCISE PROGRAMMING",
    "FITNESS, SPORTS, AND RECREATION LEADERSHIP",
    "FUNDAMENTAL OF COACHING",
    "HUMAN MOVEMENT",
    "PRACTICUM (IN-CAMPUS)",
    "PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE",
    "SAFETY AND FIRST AID",
    "SPORTS OFFICIATING AND ACTIVITY MANAGEMENT",
    "AGRICULTURAL CROP PRODUCTION (NC I)",
    "AGRICULTURAL CROP PRODUCTION (NC II)",
    "AGRICULTURAL CROP PRODUCTION (NC III)",
    "ANIMAL HEALTH CARE MANAGEMENT (NC III)",
    "ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)",
    "ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)",
    "ANIMAL PRODUCTION- SWINE (NC II)",
    "AQUACULTURE (NC II)",
    "ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)",
    "ARTIFICIAL INSEMINATION- SWINE (NC II)",
    "FISH CAPTURE (NC II)",
    "FISH PRODUCTS PACKAGING (NC II)",
    "FISH WHARF OPERATION (NC I)",
    "FISHING GEAR REPAIR AND MAINTENANCE (NC III)",
    "FOOD PROCESSING (NC II)",
    "HORTICULTURE (NC III)",
    "LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)",
    "ORGANIC AGRICULTURE PRODUCTION (NC II)",
    "PEST MANAGEMENT (NC II)",
    "RICE MACHINERY OPERATION (NC II)",
    "RUBBER PROCESSING (NC II)",
    "RUBBER PRODUCTION (NC I)",
    "SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)",
    "ATTRACTIONS AND THEME PARKS TOURISM (NC II)",
    "BARBERING (NC II)",
    "BARTENDING (NC II)",
    "BEAUTY/ NAIL CARE (NC II)",
    "BREAD AND PASTRY PRODUCTION (NC II)",
    "CAREGIVING (NC II)",
    "COMMERCIAL COOKING (NC III)",
    "COOKERY (NC II)",
    "DRESSMAKING (NC II)",
    "EVENTS MANAGEMENT SERVICES (NC III)",
    "FASHION DESIGN (NC III)",
    "FOOD AND BEVERAGE SERVICES (NC II)",
    "FRONT OFFICE SERVICES (NC II)",
    "HAIRDRESSING (NC II)",
    "HAIRDRESSING (NC III)",
    "HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT",
    "HANDICRAFT- NEEDLECRAFT",
    "HANDICRAFT- WOODCRAFT LEATHERCRAFT",
    "HANDICRAFT- BASKETRY MACRAME",
    "HOUSEKEEPING (NC II)",
    "TAILORING (NC II)",
    "LOCAL GUIDING SERVICES (NC II)",
    "TOURISM PROMOTION SERVICES (NC II)",
    "TRAVEL SERVICES (NC II)",
    "WELLNESS MASSAGE (NC II)",
    "ANIMATION (NC II)",
    "BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)",
    "COMPUTER SYSTEMS SERVICING (NC II)",
    "COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)",
    "COMPUTER PROGRAMMING JAVA (NC III)",
    "COMPUTER PROGRAMMING ORACLE DATABASE (NC III)",
    "CONTACT CENTER SERVICES (NC II)",
    "ILLUSTRATION (NC II)",
    "MEDICAL TRANSCRIPTION (NC II)",
    "TECHNICAL DRAFTING (NC II)",
    "TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)",
    "TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)",
    "AUTOMOTIVE SERVICING (NC I)",
    "AUTOMOTIVE SERVICING (NC II)",
    "CARPENTRY (NC II)",
    "CARPENTRY (NC III)",
    "CONSTRUCTION PAINTING (NC II)",
    "ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)",
    "DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)",
    "DRIVING (NC II)",
    "ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)",
    "ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)",
    "FURNITURE MAKING- FINISHING (NC II)",
    "GAS METAL ARC WELDING- GMAW (NC II)",
    "GAS TUNGSTEN ARC WELDING- GTAW (NC II)",
    "INSTRUMENTATION AND CONTROL SERVICING (NC II)",
    "MACHINING (NC I)",
    "MACHINING (NC II)",
    "MASONRY (NC II)",
    "MECHATRONICS SERVICING (NC II)",
    "MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)",
    "PLUMBING (NC I)",
    "PLUMBING (NC II)",
    "REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)",
    "SHIELDED METAL ARC WELDING (NC I)",
    "SHIELDED METAL ARC WELDING (NC II)",
    "TILE SETTING (NC II)",
    "TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)",
    "WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (80)",
    "(GAS) AGRICULTURAL CROP PRODUCTION (NC I)",
    "(GAS) AGRICULTURAL CROP PRODUCTION (NC II)",
    "(GAS) AGRICULTURAL CROP PRODUCTION (NC III)",
    "(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)",
    "(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)",
    "(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)",
    "(GAS) ANIMAL PRODUCTION- SWINE (NC II)",
    "(GAS) AQUACULTURE (NC II)",
    "(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)",
    "(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)",
    "(GAS) FISH CAPTURE (NC II)",
    "(GAS) FISH PRODUCTS PACKAGING (NC II)",
    "(GAS) FISH WHARF OPERATION (NC I)",
    "(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)",
    "(GAS) FOOD PROCESSING (NC II)",
    "(GAS) HORTICULTURE (NC III)",
    "(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)",
    "(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)",
    "(GAS) PEST MANAGEMENT (NC II)",
    "(GAS) RICE MACHINERY OPERATION (NC II)",
    "(GAS) RUBBER PROCESSING (NC II)",
    "(GAS) RUBBER PRODUCTION (NC I)",
    "(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)",
    "(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)",
    "(GAS) BARBERING (NC II)",
    "(GAS) BARTENDING (NC II)",
    "(GAS) BEAUTY/ NAIL CARE (NC II)",
    "(GAS) BREAD AND PASTRY PRODUCTION (NC II)",
    "(GAS) CAREGIVING (NC II)",
    "(GAS) COMMERCIAL COOKING (NC III)",
    "(GAS) COOKERY (NC II)",
    "(GAS) DRESSMAKING (NC II)",
    "(GAS) EVENTS MANAGEMENT SERVICES (NC III)",
    "(GAS) FASHION DESIGN (NC III)",
    "(GAS) FOOD AND BEVERAGE SERVICES (NC II)",
    "(GAS) FRONT OFFICE SERVICES (NC II)",
    "(GAS) HAIRDRESSING (NC II)",
    "(GAS) HAIRDRESSING (NC III)",
    "(GAS) HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT",
    "(GAS) HANDICRAFT- NEEDLECRAFT",
    "(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT",
    "(GAS) HANDICRAFT- BASKETRY MACRAME",
    "(GAS) HOUSEKEEPING (NC II)",
    "(GAS) TAILORING (NC II)",
    "(GAS) LOCAL GUIDING SERVICES (NC II)",
    "(GAS) TOURISM PROMOTION SERVICES (NC II)",
    "(GAS) TRAVEL SERVICES (NC II)",
    "(GAS) WELLNESS MASSAGE (NC II)",
    "(GAS) ANIMATION (NC II)",
    "(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)",
    "(GAS) COMPUTER SYSTEMS SERVICING (NC II)",
    "(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)",
    "(GAS) COMPUTER PROGRAMMING JAVA (NC III)",
    "(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)",
    "(GAS) CONTACT CENTER SERVICES (NC II)",
    "(GAS) ILLUSTRATION (NC II)",
    "(GAS) MEDICAL TRANSCRIPTION (NC II)",
    "(GAS) TECHNICAL DRAFTING (NC II)",
    "(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)",
    "(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)",
    "(GAS) AUTOMOTIVE SERVICING (NC I)",
    "(GAS) AUTOMOTIVE SERVICING (NC II)",
    "(GAS) CARPENTRY (NC II)",
    "(GAS) CARPENTRY (NC III)",
    "(GAS) CONSTRUCTION PAINTING (NC II)",
    "(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)",
    "(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)",
    "(GAS) DRIVING (NC II)",
    "(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)",
    "(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)",
    "(GAS) FURNITURE MAKING- FINISHING (NC II)",
    "(GAS) GAS METAL ARC WELDING- GMAW (NC II)",
    "(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)",
    "(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)",
    "(GAS) MACHINING (NC I)",
    "(GAS) MACHINING (NC II)",
    "(GAS) MASONRY (NC II)",
    "(GAS) MECHATRONICS SERVICING (NC II)",
    "(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)",
    "(GAS) PLUMBING (NC I)",
    "(GAS) PLUMBING (NC II)",
    "(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)",
    "(GAS) SHIELDED METAL ARC WELDING (NC I)",
    "(GAS) SHIELDED METAL ARC WELDING (NC II)",
    "(GAS) TILE SETTING (NC II)",
    "(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)",
    "WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (160)",
    "DISASTER READINESS AND RISK REDUCTION",
    "EARTH SCIENCE",
    "EARTH AND LIFE SCIENCE",
    "PHYSICAL SCIENCE",
    "WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (240)",
    "NAVIGATIONAL WATCH 1",
    "NAVIGATIONAL WATCH 2",
    "NAVIGATIONAL WATCH 3",
    "ENGINE WATCH 1",
    "ENGINE WATCH 2",
    "SAFETY 1",
    "SAFETY 2",
    "SHIP'S CATERING SERVICES 1",
    "MARITIME (PB)",
    "PRE-CALCULUS",
    "BASIC CALCULUS",
    "GENERAL PHYSICS 1",
    "GENERAL PHYSICS 2",
    "GENERAL CHEMISTRY 1",
    "INTRODUCTION TO MARITIME CAREER",
    "INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING",
    "INTRODUCTION TO MARITIME SAFETY",
    "INQUIRIES, INVESTIGATIONS AND IMMERSION",
    "RESEARCH/CAPSTONE PROJECT",
    "OTHERS SPECIALIZED SUBJECT"
  ],
  "SSHS-CORE": [
    "EFFECTIVE COMMUNICATION",
    "MABISANG KOMUNIKASYON",
    "GENERAL MATHEMATICS",
    "GENERAL SCIENCE",
    "LIFE AND CAREER SKILLS",
    "PAG-AARAL NG KASAYSAYAN AT LIPUNANG PILIPINO"
  ],
  "SSHS-ACADEMIC": [
    "ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)",
    "ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)",
    "FILIPINO IDENTITY THROUGH THE ARTS",
    "LEADERSHIP AND MANGEMENT IN THE ARTS",
    "CITIZENSHIP AND CIVIC ENGAGEMENT",
    "CONTEMPORARY LITERATURE 1",
    "CONTEMPORARY LITERATURE 2",
    "CREATIVE COMPOSITION 1",
    "CREATIVE COMPOSITION 2",
    "FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)",
    "FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)",
    "FILIPINO 2 (FILIPINO SA ISPORTS)",
    "FILIPINO 2 (FILIPINO SA SINING AT DISENYO)",
    "INTRODUCTION TO PHILOSOPHY",
    "MALIKHAING PAGSULAT",
    "PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)",
    "SOCIAL SCIENCES (THEORY AND PRACTICE)",
    "BUSINESS 1 (BASIC ACCOUNTING)",
    "BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)",
    "BUSINESS 3 (BUSINESS ECONOMICS)",
    "CONTEMPORARY MARKETING",
    "ENTREPRENEURSHIP",
    "INTRODUCTION TO ORGANIZATION AND MANAGEMENT",
    "ADVANCED MATHEMATICS 1",
    "ADVANCED MATHEMATICS 2",
    "BIOLOGY 1",
    "BIOLOGY 2",
    "BIOLOGY 3",
    "BIOLOGY 4",
    "CHEMISTRY 1",
    "CHEMISTRY 2",
    "CHEMISTRY 3",
    "CHEMISTRY 4",
    "DATABASE MANAGEMENT",
    "EARTH AND SPACE SCIENCE 1",
    "EARTH AND SPACE SCIENCE 2",
    "EARTH AND SPACE SCIENCE 3",
    "EARTH AND SPACE SCIENCE 4",
    "EMPOWERMENT TECHNOLOGIES",
    "FINITE MATHEMATICS 1",
    "FINITE MATHEMATICS 2",
    "FUNDAMENTALS IN DATA ANALYTICS",
    "GENERAL SCIENCE 3",
    "GENERAL SCIENCE 4",
    "PHYSICS 1",
    "PHYSICS 2",
    "PHYSICS 3",
    "PHYSICS 4",
    "PRE-CALCULUS 1",
    "PRE-CALCULUS 2",
    "TRIGONOMETRY 1",
    "TRIGONOMETRY 2",
    "EXERCISE AND SPORTS PROGRAMMING",
    "HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)",
    "HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)",
    "PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)",
    "PHYSICAL EDUCATION 2 (SPORTS AND DANCE)",
    "SAFETY AND FIRST AID",
    "SPORTS ACTIVITY MANAGEMENT",
    "SPORTS COACHING",
    "SPORTS OFFICIATING",
    "ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)",
    "CREATIVE PRODUCTION AND PRESENTATION",
    "DESIGN AND INNOVATION",
    "RESEARCH METHODS",
    "(IN-CAMPUS) SPORTS",
    "(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)",
    "ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL"
  ],
  "SSHS-TECHPRO": [
    "AESTHETIC SERVICES (BEAUTY CARE)",
    "BARBERING SERVICES",
    "CAREGIVING (ADULT CARE)",
    "CAREGIVING (CHILD CARE)",
    "HAIRDRESSING SERVICES",
    "WELLNESS SERVICES (HILOT/MASSAGE)",
    "AGRICULTURAL CROPS PRODUCTION",
    "AGRO-ENTREPRENEURSHIP",
    "AQUACULTURE",
    "FISH CAPTURE OPERATION",
    "FOOD PROCESSING",
    "ORGANIC AGRICULTURE PRODUCTION",
    "POULTRY PRODUCTION (CHICKEN)",
    "RUMINANTS PRODUCTION",
    "SWINE PRODUCTION",
    "GARMENTS ARTISANRY",
    "HANDICRAFTS (WEAVING)",
    "AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)",
    "AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)",
    "DRIVING AND AUTOMOTIVE SERVICING",
    "MOTORCYCLE AND SMALL ENGINE SERVICING",
    "CARPENTRY",
    "CONSTRUCTION OPERATION",
    "MANUAL METAL ARC WELDING",
    "TECHNICAL DRAFTING",
    "ANIMATION",
    "ILLUSTRATION",
    "VISUAL GRAPHICS DESIGN",
    "BAKERY OPERATION",
    "EVENTS MANAGEMENT SERVICES",
    "FOOD AND BEVERAGE OPERATION",
    "HOTEL OPERATION (FRONT OFFICE SERVICES)",
    "HOTEL OPERATION (HOUSEKEEPING SERVICES)",
    "KITCHEN OPERATIONS",
    "TOURISM SERVICES",
    "COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING",
    "DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING",
    "ELECTRICAL INSTALLATION MAINTENANCE",
    "ELECTRONICS PRODUCT ASSEMBLY AND SERVICING",
    "MECHATRONICS",
    "PHOTOVOLTAIC SYSTEMS INSTALLATION",
    "BROADBAND INSTALLATION",
    "COMPUTER PROGRAMMING (JAVA)",
    "COMPUTER PROGRAMMING (.NET TECHNOLOGY)",
    "COMPUTER PROGRAMMING (ORACLE DATABASE)",
    "COMPUTER SYSTEMS SERVICING",
    "CONTACT CENTER SERVICES",
    "MARINE ENGINEERING AT THE SUPPORT LEVEL",
    "MARINE TRANSPORTATION AT THE SUPPORT LEVEL",
    "SHIPS CATERING SERVICES",
    "WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER",
    "WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION",
    "WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE",
    "WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES",
    "WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES",
    "WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES",
    "WORK IMMERSION - HOSPITALITY AND TOURISM",
    "WORK IMMERSION - INDUSTRIAL TECHNOLOGIES",
    "WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
    "WORK IMMERSION - MARITIME TRANSPORT",
    "ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL"
  ]
};

const formatMinutesToTime = (mins) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatMinutesTo12Hour = (mins) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

export const parseMins = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 99999;
  let str = timeStr.trim();
  if (str.includes('-')) {
    str = str.split('-')[0].trim();
  }
  const upperStr = str.toUpperCase();
  const isPM = upperStr.includes('PM');
  const isAM = upperStr.includes('AM');
  const cleanStr = upperStr.replace(/[^\d:]/g, '');
  const parts = cleanStr.split(':');
  if (parts.length < 2 || isNaN(parseInt(parts[0], 10))) return 99999;

  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  // DepEd school schedule context fallback: if neither AM nor PM is explicitly specified,
  // school hours 1:00 through 5:59 are strictly afternoon (PM) sessions (13:00 to 17:59)
  if (!isPM && !isAM && hours >= 1 && hours < 6) {
    hours += 12;
  }

  return hours * 60 + minutes;
};

export const getNormalizedRowDays = (row) => {
  if (!row) return ['M', 'T', 'W', 'TH', 'F'];
  const rawDays = (Array.isArray(row.days) && row.days.length > 0)
    ? row.days
    : (typeof row.days === 'string' && row.days.trim()
        ? row.days.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
        : (row.daySchedule ? String(row.daySchedule).split(/[,;\s]+/).map(s => s.trim()).filter(Boolean) : []));

  if (rawDays.length === 0) return ['M', 'T', 'W', 'TH', 'F'];

  const DAY_CODE_MAP = {
    'M': 'M', 'MON': 'M', 'MONDAY': 'M',
    'T': 'T', 'TUE': 'T', 'TUES': 'T', 'TUESDAY': 'T',
    'W': 'W', 'WED': 'W', 'WEDNESDAY': 'W',
    'TH': 'TH', 'THU': 'TH', 'THUR': 'TH', 'THURS': 'TH', 'THURSDAY': 'TH',
    'F': 'F', 'FRI': 'F', 'FRIDAY': 'F',
    'SAT': 'SAT', 'SATURDAY': 'SAT',
    'SUN': 'SUN', 'SUNDAY': 'SUN'
  };

  const normalized = rawDays
    .map(d => String(d).toUpperCase().trim())
    .map(d => DAY_CODE_MAP[d] || d)
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['M', 'T', 'W', 'TH', 'F'];
};

export const normalizeGhostDay = (dayStr) => {
  if (!dayStr) return 'M';
  const u = String(dayStr).trim().toUpperCase();
  if (u === 'M' || u.startsWith('MON')) return 'M';
  if (u === 'TH' || u.startsWith('THU')) return 'TH';
  if (u === 'T' || u.startsWith('TUE')) return 'T';
  if (u === 'W' || u.startsWith('WED')) return 'W';
  if (u === 'F' || u.startsWith('FRI')) return 'F';
  if (u === 'SAT' || u.startsWith('SAT')) return 'SAT';
  if (u === 'SUN' || u.startsWith('SUN')) return 'SUN';
  return u;
};

/**
 * Computes effective ghost locks for a clustered teacher on a given day:
 * 1. Individual ghost slots from partner school(s).
 * 2. Sandwich gap transit lockouts (gap between partner classes on the same day <= maxGapMinutes, default 120 mins).
 */
export const getClusteredLocksForDay = (ghostRows = [], dayCode = 'M', maxGapMinutes = 120) => {
  if (!Array.isArray(ghostRows) || ghostRows.length === 0) {
    return { ghostSlots: [], transitGapSlots: [], allLockedIntervals: [] };
  }

  const dayGhosts = [];
  ghostRows.forEach((g, idx) => {
    const rawDays = Array.isArray(g.days) && g.days.length > 0
      ? g.days
      : (g.day ? [g.day] : ['M', 'T', 'W', 'TH', 'F']);
    const normDays = rawDays.map(normalizeGhostDay);
    if (!normDays.includes(dayCode)) return;

    const sMins = parseMins(g.startTime || g.start_time || '');
    const eMins = parseMins(g.endTime || g.end_time || '');
    if (sMins < 99999 && eMins < 99999 && eMins > sMins) {
      dayGhosts.push({
        ...g,
        idx,
        sMins,
        eMins,
        diffMins: eMins - sMins,
        isGhostSlot: true
      });
    }
  });

  dayGhosts.sort((a, b) => a.sMins - b.sMins || a.eMins - b.eMins);

  const transitGapSlots = [];
  for (let i = 0; i < dayGhosts.length - 1; i++) {
    const cur = dayGhosts[i];
    const next = dayGhosts[i + 1];

    const gapStart = cur.eMins;
    const gapEnd = next.sMins;
    const gapMins = gapEnd - gapStart;

    if (gapMins > 0 && gapMins <= maxGapMinutes) {
      transitGapSlots.push({
        isTransitGap: true,
        sMins: gapStart,
        eMins: gapEnd,
        diffMins: gapMins,
        schoolName: cur.schoolName || next.schoolName || 'Partner Station',
        prevSubject: cur.subject || 'Class',
        nextSubject: next.subject || 'Class'
      });
    }
  }

  const allLockedIntervals = [
    ...dayGhosts.map(g => ({ sMins: g.sMins, eMins: g.eMins, type: 'ghost', item: g })),
    ...transitGapSlots.map(t => ({ sMins: t.sMins, eMins: t.eMins, type: 'transit_gap', item: t }))
  ];

  return {
    ghostSlots: dayGhosts,
    transitGapSlots,
    allLockedIntervals
  };
};

/**
 * Checks if a candidate slot on a set of days collides with any partner school ghost slots
 * or transit sandwich gaps (<= 2 hrs / 120 mins).
 */
export const checkCrossSchoolConflict = (slot, ghostRows = [], maxGapMinutes = 120) => {
  if (!slot || !slot.startTime || !slot.endTime || !Array.isArray(ghostRows) || ghostRows.length === 0) {
    return false;
  }
  const sMins = parseMins(slot.startTime);
  const eMins = parseMins(slot.endTime);
  if (sMins >= 99999 || eMins >= 99999 || eMins <= sMins) return false;

  const slotDays = Array.isArray(slot.days) && slot.days.length > 0
    ? slot.days
    : (slot.daySchedule ? String(slot.daySchedule).split(',').map(s => s.trim()) : ['M', 'T', 'W', 'TH', 'F']);

  for (const day of slotDays) {
    const normDay = normalizeGhostDay(day);
    const { allLockedIntervals } = getClusteredLocksForDay(ghostRows, normDay, maxGapMinutes);
    const hasCollision = allLockedIntervals.some(lock => sMins < lock.eMins && eMins > lock.sMins);
    if (hasCollision) return true;
  }
  return false;
};

export const isSectionMatchingTeacherGrades = (sec, assignedGrades, teacherId = null, teacherName = null) => {
  if (teacherId && (String(sec?.adviserId || sec?.adviser_id || '') === String(teacherId))) {
    return true; // Always match section where teacher is designated adviser
  }
  if (teacherName && String(sec?.adviser || sec?.adviserName || sec?.adviser_name || '').trim().toLowerCase() === String(teacherName).trim().toLowerCase()) {
    return true; // Always match section where teacher is designated adviser
  }

  if (!assignedGrades || !Array.isArray(assignedGrades) || assignedGrades.length === 0) {
    return true; // No assigned grade filter on teacher -> show all sections
  }
  const secGrade = String(sec?.gradeLevel || sec?.grade_level || '').toUpperCase().trim();
  const secType = String(sec?.sectionType || sec?.section_type || '').toUpperCase().trim();
  const secName = String(sec?.sectionName || sec?.section_name || '').toUpperCase().trim();
  const normAssigned = assignedGrades.map(g => String(g).toUpperCase().trim()).filter(Boolean);

  if (normAssigned.length === 0) return true;
  if (normAssigned.includes(secGrade)) return true;

  // Split multigrade sections e.g. "GRADE 1 - GRADE 2"
  const multiParts = secGrade.includes(' - ') ? secGrade.split(' - ').map(s => s.trim()) : [secGrade];

  for (const ag of normAssigned) {
    if (!ag) continue;
    if (multiParts.includes(ag)) return true;

    // Extract grade token for exact matching: "GRADE 1" vs "GRADE 10"
    const agMatch = ag.match(/^(?:GRADE\s*|G\s*)?(\d+|KINDER|K|ALS|SNED|SPED|NON-GRADED|NON GRADED)$/i);
    const agKey = agMatch ? agMatch[1] : ag;

    for (const part of multiParts) {
      const partMatch = part.match(/^(?:GRADE\s*|G\s*)?(\d+|KINDER|K|ALS|SNED|SPED|NON-GRADED|NON GRADED)$/i);
      const partKey = partMatch ? partMatch[1] : part;
      if (agKey === partKey) return true;
    }

    if ((ag.includes('KINDER') || ag === 'K') && (secGrade.includes('KINDER') || secGrade === 'K')) return true;
    if ((ag.includes('SNED') || ag.includes('SPED') || ag.includes('NON-GRADED') || ag.includes('NON GRADED')) &&
        (secGrade.includes('SNED') || secGrade.includes('SPED') || secGrade.includes('NON-GRADED') || secGrade.includes('NON GRADED') || secType.includes('SNED') || secType.includes('SPED'))) {
      return true;
    }
    if (ag.includes('ALS') && (secGrade.includes('ALS') || secType.includes('ALS') || secName.includes('ALS'))) return true;
    if (ag.includes('ARAL') && (secGrade.includes('ARAL') || secType.includes('ARAL') || secName.includes('ARAL'))) return true;
  }
  return false;
};

function WorkloadGanttScheduleView({
  currentPerson,
  classSections,
  updateWorkloadRowFields,
  removeWorkloadRow,
  addWorkloadRow,
  handleFieldChange,
  getSubjectsForGrade,
  getAssignedGradeLevels,
  getSubjectAssignmentForSection,
  getRequiredWeeklyMinutes,
  getSubjectAllocationForSection,
  getRowDurationError,
  getMatatagRowWarning,
  getMatatagFixedDurationMins,
  getDuplicateSectionSubjectError,
  getHgpWeeklyError,
  isAdvisoryOrHgpPair,
  isSHSRow,
  GRADE_LEVELS_BY_CATEGORY,
  SUBJECT_OPTIONS,
  REMEDIATION_FOCUS_BY_CATEGORY,
  GRADE_LEVEL_SUBJECTS,
  dbPerson,
  activePersonnelId,
  selectedBlockIdx,
  setSelectedBlockIdx,
  handleSaveChangesDirectly,
  isSaving = false,
  sharedWorkloadRows = [],
  activeTerm = '1st',
  onCopyFirstTerm,
  onClearTermWorkload
}) {
  const { schoolInfo, showToast, personnel = [] } = useApp();
  const activeSchoolSubjects = useMemo(() => getActiveSubjectsForSchool(schoolInfo), [schoolInfo]);

  // Teacher's assigned grade levels from Teaching Tab in Personnel Profiling (checks both active person and dbPerson)
  const teacherAssignedGrades = useMemo(() => {
    const fromCurrent = typeof getAssignedGradeLevels === 'function' ? getAssignedGradeLevels(currentPerson) : [];
    if (Array.isArray(fromCurrent) && fromCurrent.length > 0) return fromCurrent;
    const fromDb = typeof getAssignedGradeLevels === 'function' ? getAssignedGradeLevels(dbPerson) : [];
    if (Array.isArray(fromDb) && fromDb.length > 0) return fromDb;
    return [];
  }, [currentPerson, dbPerson, getAssignedGradeLevels]);

  // Locked when a teaching / teaching-related teacher has no assigned classes in Personnel Profiling.
  // Re-evaluated on every render from the saved assignments, so it follows teacher switches and profile edits.
  const isPlottingLocked = isTeachingPlotLocked(currentPerson, dbPerson) && teacherAssignedGrades.length === 0;
  const lockedLegacyBlockCount = isPlottingLocked
    ? (currentPerson?.workloadRows || []).filter(r => !isAdminTaskRow(r) && !isNonTeachingTaskSubject(r.subject)).length
    : 0;
  const notifyPlottingLocked = () => { if (showToast) showToast(TEACHING_PLOT_LOCK_MESSAGE, 'warning'); };

  // Section Clipboard state for Ctrl+C / Ctrl+V copy-paste workflow (copies section only, NOT subject)
  const [copiedSection, setCopiedSection] = useState(null);

  // Undo & Redo History Stacks (Ctrl+Z / Ctrl+Y)
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Multi-cell selection state for Ctrl+Click / Cmd+Click
  const [selectedCellKeys, setSelectedCellKeys] = useState(new Set());

  // Reset undo/redo stack, multi-selection, and block selection on teacher switch
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setSelectedCellKeys(new Set());
    if (typeof setSelectedBlockIdx === 'function') {
      setSelectedBlockIdx(null);
    }
  }, [currentPerson?.id, activePersonnelId, setSelectedBlockIdx]);

  // Auto-heal SNED, ALS, ARAL, Remedial/Enrichment, and Regular ADVISORY workloads & deduplicate
  useEffect(() => {
    if (!currentPerson || !Array.isArray(currentPerson.workloadRows) || currentPerson.workloadRows.length === 0 || isNonTeachingPerson(currentPerson)) return;
    let modified = false;

    // Helper to check if a teacher is assigned as adviser/tutor/teacher of a section
    const isTeacherAssignedToSection = (personObj, sec) => {
      if (!personObj || !sec) return false;
      const pIds = [
        String(personObj.id || ''),
        String(personObj._id || '')
      ].filter(Boolean);
      const sIds = [
        String(sec.advisorId || ''),
        String(sec.advisor_id || ''),
        String(sec.adviserId || ''),
        String(sec.adviser_id || ''),
        String(sec.tutorId || ''),
        String(sec.tutor_id || ''),
        String(sec.teacherId || ''),
        String(sec.teacher_id || ''),
        String(sec.advisor || ''),
        String(sec.tutor || '')
      ].filter(id => Boolean(id) && id !== 'null' && id !== 'undefined');

      // 1. Direct ID match
      if (pIds.some(pId => sIds.includes(pId))) return true;

      // If section has explicit ID assignment that belongs to another teacher in personnel, it cannot belong to personObj
      if (sIds.length > 0 && Array.isArray(personnel) && personnel.length > 0) {
        const isAssignedToOther = personnel.some(p => {
          const otherId = String(p.id || p._id || '');
          return !pIds.includes(otherId) && sIds.includes(otherId);
        });
        if (isAssignedToOther) return false;
      }

      // 2. Full Name match fallback (only when no explicit ID match is possible)
      const pFn = String(personObj.firstName || '').toLowerCase().trim();
      const pLn = String(personObj.lastName || '').toLowerCase().trim();
      const fullName = `${pFn} ${pLn}`.trim();
      const reverseFullName = `${pLn}, ${pFn}`.trim();
      const reverseFullNameNoComma = `${pLn} ${pFn}`.trim();

      const sNames = [
        String(sec.advisorName || ''),
        String(sec.advisor_name || ''),
        String(sec.adviserName || ''),
        String(sec.adviser_name || ''),
        String(sec.tutorName || ''),
        String(sec.tutor_name || ''),
        String(sec.teacherName || ''),
        String(sec.teacher_name || '')
      ].map(n => n.toLowerCase().trim()).filter(Boolean);

      if (fullName && sNames.length > 0) {
        return sNames.some(name =>
          name === fullName ||
          name === reverseFullName ||
          name === reverseFullNameNoComma ||
          (pFn && pLn && name.includes(pFn) && name.includes(pLn))
        );
      }

      return false;
    };

    // Track seen sections to deduplicate to strictly 1 row per section per term
    const seenAdvisorySecs = new Set();
    const seenHgpSecs = new Set();
    const seenSnedSecs = new Set();
    const seenAlsSecs = new Set();
    const seenAralSecs = new Set();
    const seenRemSecs = new Set();

    const cleanedAndHealedRows = [];

    currentPerson.workloadRows.forEach(r => {
      const isSned = isSnedSectionRow(r, classSections);
      const isAls = isAlsSectionRow(r, classSections);
      const isAral = isAralSectionRow(r, classSections);
      const isRem = isRemedialSectionRow(r, classSections);
      const subUpper = String(r.subject || '').toUpperCase().trim();
      const secId = String(r.sectionId || r.section_id || '');
      const secName = String(r.sectionName || '').toUpperCase().trim();
      const rTerm = r.term || '1st';
      const secKey = `${rTerm}__${secId || secName || `row_${r.id || Math.random()}`}`;

      // Matched section in classSections
      let matchedSec = (classSections || []).find(s =>
        (secId && String(s.id) === secId) ||
        (secName && s.sectionName && String(s.sectionName).trim().toUpperCase() === secName && (!r.gradeLevel || s.gradeLevel === r.gradeLevel))
      );

      // Fallback matching by program type if teacher is assigned in classSections
      if (!matchedSec && isAral) {
        matchedSec = (classSections || []).find(s => {
          const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
          if (isReg) return false;
          const isA = String(s.sectionType || '').toUpperCase().includes('ARAL') ||
                      String(s.gradeLevel || '').toUpperCase().includes('ARAL') ||
                      String(s.sectionName || '').toUpperCase().includes('ARAL') ||
                      Boolean(s.aralBasis || s.aralToolKey || s.aralTool);
          return isA && isTeacherAssignedToSection(currentPerson, s);
        });
      }
      if (!matchedSec && isAls) {
        matchedSec = (classSections || []).find(s => {
          const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
          if (isReg) return false;
          return String(s.sectionType || s.gradeLevel || '').toUpperCase().includes('ALS') && isTeacherAssignedToSection(currentPerson, s);
        });
      }
      if (!matchedSec && isSned) {
        matchedSec = (classSections || []).find(s => {
          const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
          if (isReg) return false;
          return String(s.sectionType || s.gradeLevel || '').toUpperCase().includes('SNED') && isTeacherAssignedToSection(currentPerson, s);
        });
      }
      if (!matchedSec && isRem) {
        matchedSec = (classSections || []).find(s => {
          const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
          if (isReg) return false;
          return (s.sectionType === 'REMEDIAL' || s.sectionType === 'ENRICHMENT') && isTeacherAssignedToSection(currentPerson, s);
        });
      }

      // 1. Drop ANY HGP or obsolete ADVISORY row attached to SNED, ALS, ARAL, or Remedial/Enrichment
      if ((isSned || isAls || isAral || isRem) && (subUpper === 'HGP' || subUpper.includes('HOMEROOM GUIDANCE'))) {
        modified = true;
        return; // Drop this HGP row
      }

      // 2. SNED Section Deduplication, Ownership & Subject Healing
      if (isSned) {
        const isOwnSned = matchedSec && isTeacherAssignedToSection(currentPerson, matchedSec);
        if (matchedSec && !isOwnSned) {
          modified = true;
          return; // Drop unassigned SNED row
        }
        if (seenSnedSecs.has(secKey)) {
          modified = true;
          return; // Drop duplicate row for this SNED section in this term
        }
        seenSnedSecs.add(secKey);
        if (subUpper !== 'SNED MODIFIED SUBJECT') {
          modified = true;
          cleanedAndHealedRows.push({ ...r, subject: 'SNED MODIFIED SUBJECT', subjectName: 'SNED MODIFIED SUBJECT' });
        } else {
          cleanedAndHealedRows.push(r);
        }
        return;
      }

      // 3. ALS Section Deduplication, Ownership & Subject Healing
      if (isAls) {
        const isOwnAls = matchedSec && isTeacherAssignedToSection(currentPerson, matchedSec);
        if (matchedSec && !isOwnAls) {
          modified = true;
          return; // Drop unassigned ALS row
        }
        const alsSlotKey = `${secKey}__${subUpper}__${r.startTime || ''}__${r.endTime || ''}__${getNormalizedRowDays(r).sort().join(',')}`;
        if (seenAlsSecs.has(alsSlotKey)) {
          modified = true;
          return; // Drop duplicate slot for this ALS section/subject/time in this term
        }
        seenAlsSecs.add(alsSlotKey);
        cleanedAndHealedRows.push(r);
        return;
      }

      // 4. ARAL Section Deduplication, Ownership & Subject Healing
      if (isAral) {
        const isOwnAral = matchedSec && isTeacherAssignedToSection(currentPerson, matchedSec);
        if (matchedSec && !isOwnAral) {
          modified = true;
          return; // Drop unassigned ARAL row
        }
        if (seenAralSecs.has(secKey)) {
          modified = true;
          return; // Drop duplicate row for this ARAL section in this term
        }
        seenAralSecs.add(secKey);
        if (subUpper !== 'ARAL TUTORING' && subUpper !== 'ARAL') {
          modified = true;
          cleanedAndHealedRows.push({ ...r, subject: 'ARAL TUTORING', subjectName: 'ARAL TUTORING' });
        } else {
          cleanedAndHealedRows.push(r);
        }
        return;
      }

      // 5. Remedial / Enrichment Section Deduplication, Ownership & Subject Healing
      if (isRem) {
        const remSlotKey = `${secKey}__${r.startTime || ''}__${r.endTime || ''}__${getNormalizedRowDays(r).sort().join(',')}`;
        if (seenRemSecs.has(remSlotKey)) {
          modified = true;
          return; // Drop duplicate slot for this Remedial section in this term
        }
        seenRemSecs.add(remSlotKey);
        cleanedAndHealedRows.push(r);
        return;
      }

      // 6. Regular Section Advisory / HGP Ownership Healing & Deduplication (Scoped per term)
      const isAdviserOfSec = matchedSec && isTeacherAssignedToSection(currentPerson, matchedSec);
      if (subUpper === 'ADVISORY' || subUpper === 'HGP' || subUpper.includes('HOMEROOM GUIDANCE')) {
        const isRegAdvisorySec = matchedSec && !isSned && !isAls && !isAral && !isRem && matchedSec.sectionType !== 'REMEDIAL' && matchedSec.sectionType !== 'ENRICHMENT' && isAdviserOfSec;
        if (!isRegAdvisorySec) {
          modified = true;
          return; // Drop orphaned advisory/HGP row
        }
        if (subUpper === 'ADVISORY') {
          const advSlotKey = `${secKey}__${r.startTime || ''}__${r.endTime || ''}__${getNormalizedRowDays(r).sort().join(',')}`;
          if (seenAdvisorySecs.has(advSlotKey)) {
            modified = true;
            return; // Drop duplicate ADVISORY for same section/time/days in this term
          }
          seenAdvisorySecs.add(advSlotKey);
        } else {
          if (seenHgpSecs.has(secKey)) {
            modified = true;
            return; // Drop duplicate HGP for same section in this term
          }
          seenHgpSecs.add(secKey);
        }
      }

      if ((subUpper === 'SNED' || subUpper === 'SNED MODIFIED SUBJECT' || subUpper === 'ALS' || subUpper === 'ARAL' || subUpper === 'ARAL TUTORING') && isAdviserOfSec && !isSned && !isAls && !isAral && !isRem) {
        modified = true;
        cleanedAndHealedRows.push({ ...r, subject: 'ADVISORY', subjectName: 'ADVISORY' });
        return;
      }

      // 7. General subject deduplication & day merging (same term, subject, section, time)
      if (subUpper && (secId || secName)) {
        const curStart = parseMins(r.startTime);
        const curEnd = parseMins(r.endTime);
        const curDays = getNormalizedRowDays(r);

        const existingMatchIdx = cleanedAndHealedRows.findIndex(existing => {
          const exTerm = existing.term || '1st';
          const exSub = String(existing.subject || '').toUpperCase().trim();
          const exSecId = String(existing.sectionId || existing.section_id || '');
          const exSecName = String(existing.sectionName || '').toUpperCase().trim();
          if (exTerm !== rTerm || exSub !== subUpper) return false;
          if (!((exSecId && secId && exSecId === secId) || (exSecName && secName && exSecName === secName))) return false;

          const exStart = parseMins(existing.startTime);
          const exEnd = parseMins(existing.endTime);
          return exStart === curStart && exEnd === curEnd;
        });

        if (existingMatchIdx !== -1) {
          const existingRow = cleanedAndHealedRows[existingMatchIdx];
          const exDays = getNormalizedRowDays(existingRow);
          const mergedDays = Array.from(new Set([...exDays, ...curDays]));
          cleanedAndHealedRows[existingMatchIdx] = {
            ...existingRow,
            days: mergedDays
          };
          modified = true;
          return; // Merged into existing row!
        }
      }

      cleanedAndHealedRows.push(r);
    });

    if (modified && typeof handleFieldChange === 'function') {
      handleFieldChange('workloadRows', cleanedAndHealedRows);
    }
  }, [currentPerson?.id, classSections]);

  // Record a snapshot of workloadRows before any mutation
  const recordUndoSnapshot = useCallback((customCurrentRows = null) => {
    const rowsToSave = customCurrentRows || (currentPerson?.workloadRows || []);
    setUndoStack(prev => {
      const next = [...prev, JSON.stringify(rowsToSave)];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
    setRedoStack([]); // Clear redo stack on new action
  }, [currentPerson?.workloadRows]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const currentSnapshot = JSON.stringify(currentPerson?.workloadRows || []);
    const prevSnapshot = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);

    try {
      const restoredRows = JSON.parse(prevSnapshot);
      setUndoStack(nextUndo);
      setRedoStack(prev => [...prev, currentSnapshot]);
      if (typeof handleFieldChange === 'function') {
        handleFieldChange('workloadRows', restoredRows);
      }
      setSelectedBlockIdx(prev => (prev !== null && prev >= restoredRows.length) ? (restoredRows.length > 0 ? 0 : null) : prev);
      if (showToast) {
        showToast('↶ Undo: Reverted previous workload schedule change', 'info');
      }
    } catch (e) {
      console.error('Failed to undo:', e);
    }
  }, [undoStack, currentPerson?.workloadRows, handleFieldChange, setSelectedBlockIdx, showToast]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const currentSnapshot = JSON.stringify(currentPerson?.workloadRows || []);
    const nextSnapshot = redoStack[redoStack.length - 1];
    const nextRedo = redoStack.slice(0, -1);

    try {
      const restoredRows = JSON.parse(nextSnapshot);
      setRedoStack(nextRedo);
      setUndoStack(prev => [...prev, currentSnapshot]);
      if (typeof handleFieldChange === 'function') {
        handleFieldChange('workloadRows', restoredRows);
      }
      setSelectedBlockIdx(prev => (prev !== null && prev >= restoredRows.length) ? (restoredRows.length > 0 ? 0 : null) : prev);
      if (showToast) {
        showToast('↷ Redo: Reapplied workload schedule change', 'info');
      }
    } catch (e) {
      console.error('Failed to redo:', e);
    }
  }, [redoStack, currentPerson?.workloadRows, handleFieldChange, setSelectedBlockIdx, showToast]);

  const updateWorkloadRowWithHistory = useCallback((rowIdx, updates) => {
    recordUndoSnapshot();
    const rawRows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
    const targetRow = rawRows[rowIdx];
    const allRows = [...(currentPerson?.workloadRows || [])];
    const matchIdx = targetRow ? allRows.findIndex(r => (r.id && r.id === targetRow.id) || r === targetRow) : -1;

    const rowToUpdate = matchIdx !== -1 ? allRows[matchIdx] : (rawRows[rowIdx] || targetRow);
    if (!rowToUpdate) return;

    if (typeof updateWorkloadRowFields === 'function') {
      updateWorkloadRowFields(rowToUpdate, updates);
    } else {
      if (matchIdx !== -1) {
        allRows[matchIdx] = { ...allRows[matchIdx], ...updates };
        if (typeof handleFieldChange === 'function') {
          handleFieldChange('workloadRows', allRows);
        }
      }
    }
  }, [recordUndoSnapshot, updateWorkloadRowFields, currentPerson?.workloadRows, activeTerm, handleFieldChange]);

  const handleSectionChangeForRow = useCallback((rowIdx, newSectionId) => {
    const rawRows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
    const targetRow = rawRows[rowIdx];
    if (!targetRow) return;

    const chosenSec = (classSections || []).find(s => String(s.id) === String(newSectionId));
    if (!chosenSec) {
      updateWorkloadRowWithHistory(rowIdx, {
        sectionId: '',
        sectionName: '',
        gradeLevel: '',
        subjectGradeLevel: ''
      });
      return;
    }

    const secGrade = chosenSec.gradeLevel || chosenSec.grade_level || '';
    const secName = chosenSec.sectionName || chosenSec.section_name || '';
    const secType = String(chosenSec.sectionType || chosenSec.section_type || '').toUpperCase();

    const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(secType);
    const isSned = !isReg && (secGrade.toUpperCase().includes('SNED') || secGrade.toUpperCase().includes('NON-GRADED') || secType.includes('SNED') || secType.includes('NON-GRADED') || secType.includes('SPED'));
    const isAls = !isReg && (secGrade.toUpperCase().includes('ALS') || secType.includes('ALS') || secName.toUpperCase().includes('ALS'));
    const isAral = !isReg && (secType.startsWith('ARAL') || secName.toUpperCase().includes('ARAL') || secGrade.toUpperCase().includes('ARAL') || Boolean(chosenSec.aralBasis || chosenSec.aralToolKey || chosenSec.aralTool));
    const isShs = (secGrade.includes('11') || secGrade.includes('12') || secGrade.toUpperCase().includes('SHS') || (typeof isSHSRow === 'function' && isSHSRow(chosenSec)));

    let updates = {
      sectionId: chosenSec.id,
      sectionName: secName,
      gradeLevel: secGrade,
      subjectGradeLevel: '', // multigrade: re-pick the grade level for the new section
      trackStrand: chosenSec.trackStrand || chosenSec.track_strand || ''
    };

    if (isSned) {
      updates.subject = 'SNED MODIFIED SUBJECT';
      updates.subjectName = 'SNED MODIFIED SUBJECT';
    } else if (isAls) {
      updates.subject = 'ALS';
      updates.subjectName = 'ALS';
    } else if (isAral) {
      if (!isAralSubject(targetRow.subject)) {
        updates.subject = 'ARAL - READING';
        updates.subjectName = 'ARAL - READING';
      }
    } else {
      if (isShs) {
        updates.category = chosenSec.category || targetRow.category || 'SHS-CORE SUBJECTS';
        const validSubjects = typeof getSubjectsForGrade === 'function' ? getSubjectsForGrade(secGrade, updates.category) : [];
        if (targetRow.subject && validSubjects.length > 0 && !validSubjects.includes(targetRow.subject)) {
          updates.subject = '';
          updates.subjectName = '';
        }
      } else {
        const validSubjects = typeof getSubjectsForGrade === 'function' ? getSubjectsForGrade(secGrade) : [];
        if (targetRow.subject && validSubjects.length > 0 && !validSubjects.includes(targetRow.subject)) {
          updates.subject = '';
          updates.subjectName = '';
        }
      }
    }

    updateWorkloadRowWithHistory(rowIdx, updates);
  }, [currentPerson?.workloadRows, activeTerm, classSections, updateWorkloadRowWithHistory, isSHSRow, getSubjectsForGrade]);

  // Subject-first creation: pick a subject in the sidebar, then click/drag an empty Gantt
  // slot to create a block pre-filled with it (Flow 1). Left null for the plain drag-first
  // flow (Flow 2), which instead leaves Subject/Class Section blank for the inspector to require.
  const [pendingCreateSubject, setPendingCreateSubject] = useState(null);
  // Section-first creation: pick an organized class/section in the sidebar, then click/drag an
  // empty Gantt slot to create a block pre-filled with that section's grade level/name. Independent
  // of pendingCreateSubject above — either, both, or neither can be set when a slot is created.
  const [pendingCreateSection, setPendingCreateSection] = useState(null); // { sectionId, sectionName, gradeLevel, category }

  // Block Inspector floating panel: null position = default (top-right, via CSS); once the user
  // drags it, panelPos holds explicit viewport coordinates that persist across block selections
  // for the rest of the session (only reset by a page reload, never automatically).
  const [panelPos, setPanelPos] = useState(null); // { x, y } in px, top-left origin
  const panelDragRef = useRef(null); // { startMouseX, startMouseY, startPanelX, startPanelY }
  const panelRef = useRef(null);

  const handlePanelDragStart = (e) => {
    if (e.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    panelDragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanelX: rect.left,
      startPanelY: rect.top
    };
  };

  useEffect(() => {
    const handleMove = (e) => {
      const drag = panelDragRef.current;
      if (!drag) return;
      const nextX = drag.startPanelX + (e.clientX - drag.startMouseX);
      const nextY = drag.startPanelY + (e.clientY - drag.startMouseY);
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 40;
      setPanelPos({ x: Math.max(-260, Math.min(maxX, nextX)), y: Math.max(0, Math.min(maxY, nextY)) });
    };
    const handleUp = () => {
      panelDragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const [showWeekend, setShowWeekend] = useState(() => {
    const rows = currentPerson?.workloadRows || [];
    return rows.some(r => {
      const days = Array.isArray(r.days) ? r.days : (r.daySchedule ? String(r.daySchedule).split(',').map(s=>s.trim()) : []);
      return days.includes('SAT') || days.includes('SUN');
    });
  });

  const [dragState, setDragState] = useState(null); // { type, rowIdx, day, initialMouseY, initialStartMins, initialEndMins, initialDays, createDay, createStartMins, createCurrentMins }
  const dragStateRef = useRef(null);
  dragStateRef.current = dragState;
  const pendingCreateSubjectRef = useRef(null);
  pendingCreateSubjectRef.current = pendingCreateSubject;
  const pendingCreateSectionRef = useRef(null);
  pendingCreateSectionRef.current = pendingCreateSection;

  // Same section list configured in Organized Classes Setup (Class Sections & Advisers,
  // ARAL Sections, Remedial & Enrichment Sections), reduced to a name + type label and filtered
  // by the teacher's assigned grade levels from the Teaching tab in Personnel Profiling.
  const organizedClassesList = useMemo(() => {
    const allSections = (classSections || []).map(sec => {
      const sectionType = String(sec.sectionType || '').toUpperCase();
      const gradeLevel = sec.gradeLevel || sec.grade_level || '';
      let typeLabel;
      if (sectionType.startsWith('ARAL')) {
        typeLabel = sec.aralBasis === 'assessment'
          ? `ARAL — ${sectionType.replace('ARAL - ', '').replace('ARAL', '').trim() || 'Assessment-Based'}`
          : 'ARAL — Grade Level';
      } else if (sectionType === 'REMEDIAL' || sectionType === 'ENRICHMENT') {
        typeLabel = sectionType === 'ENRICHMENT' ? 'Enrichment' : 'Remedial';
      } else if (sectionType.includes('SNED') || sectionType.includes('NON-GRADED') || gradeLevel.includes('SNED') || gradeLevel.includes('NON-GRADED')) {
        typeLabel = `SNED (Non-Graded) · ${gradeLevel}`;
      } else if (sectionType.includes('ALS') || gradeLevel.includes('ALS')) {
        typeLabel = `ALS · ${gradeLevel}`;
      } else if (String(gradeLevel).includes(' - ') || sectionType === 'MULTIGRADE') {
        typeLabel = `Multi Grade · ${gradeLevel}`;
      } else {
        typeLabel = `Mono Grade · ${gradeLevel || 'Grade'}`;
      }
      const isNonReg = ['SNED', 'ALS', 'ARAL', 'REMEDIAL', 'ENRICHMENT'].some(k => sectionType.includes(k)) ||
        ['SNED-', 'ALS-', 'ARAL-', 'REM-', 'ENR-'].some(pfx => String(sec.id).startsWith(pfx));
      const displaySectionName = isNonReg
        ? `${sec.id} [${sec.sectionType || typeLabel || 'NON-REGULAR'}]`
        : (sec.sectionName || sec.section_name || 'Section');

      return {
        id: String(sec.id),
        sectionName: displaySectionName,
        gradeLevel,
        category: sec.category || '',
        typeLabel,
        rawSec: sec
      };
    });

    const teacherId = currentPerson?.id || dbPerson?.id || null;
    const teacherName = `${currentPerson?.firstName || dbPerson?.firstName || ''} ${currentPerson?.lastName || dbPerson?.lastName || ''}`.trim();
    const matching = allSections.filter(sec => isSectionMatchingTeacherGrades(sec.rawSec || sec, teacherAssignedGrades, teacherId, teacherName));
    return (matching.length > 0 ? matching : allSections)
      .sort((a, b) => a.sectionName.localeCompare(b.sectionName));
  }, [classSections, teacherAssignedGrades, currentPerson?.id, currentPerson?.firstName, currentPerson?.lastName, dbPerson?.id, dbPerson?.firstName, dbPerson?.lastName]);

  const daysList = showWeekend
    ? [
        { code: 'M', label: 'Mon', full: 'Monday' },
        { code: 'T', label: 'Tue', full: 'Tuesday' },
        { code: 'W', label: 'Wed', full: 'Wednesday' },
        { code: 'TH', label: 'Thu', full: 'Thursday' },
        { code: 'F', label: 'Fri', full: 'Friday' },
        { code: 'SAT', label: 'Sat', full: 'Saturday' },
        { code: 'SUN', label: 'Sun', full: 'Sunday' }
      ]
    : [
        { code: 'M', label: 'Mon', full: 'Monday' },
        { code: 'T', label: 'Tue', full: 'Tuesday' },
        { code: 'W', label: 'Wed', full: 'Wednesday' },
        { code: 'TH', label: 'Thu', full: 'Thursday' },
        { code: 'F', label: 'Fri', full: 'Friday' }
      ];

  const personnelId = currentPerson?.id || activePersonnelId || 'default';

  // Derive custom shift bounds from schoolInfo if declared, otherwise fall back to 7:00 AM – 6:00 PM
  const declaredShift = useMemo(() => {
    const has = schoolInfo?.hasShifts === true || schoolInfo?.hasShifts === 'yes';
    if (!has) {
      return { hasShifts: false, startHour: 7, endHour: 18, startMins: 420, endMins: 1080 };
    }
    const sStr = schoolInfo?.shiftStartTime || '07:00';
    const eStr = schoolInfo?.shiftEndTime || '18:00';
    const sM = parseMins(sStr);
    const eM = parseMins(eStr);
    const validSM = (sM >= 240 && sM <= 1320) ? sM : 420;
    const validEM = (eM >= 240 && eM <= 1320 && eM > validSM) ? eM : 1080;
    return {
      hasShifts: true,
      startHour: Math.max(4, Math.floor(validSM / 60)),
      endHour: Math.min(22, Math.ceil(validEM / 60)),
      startMins: validSM,
      endMins: validEM
    };
  }, [schoolInfo?.hasShifts, schoolInfo?.shiftStartTime, schoolInfo?.shiftEndTime]);

  // Dynamically calculate grid time bounds from rows & custom shift settings
  const gridBounds = useMemo(() => {
    let minHour = declaredShift.startHour;
    let maxHour = declaredShift.endHour;
    const rows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
    rows.forEach(r => {
      if (r.startTime) {
        const sM = parseMins(r.startTime);
        if (sM < 99999) minHour = Math.min(minHour, Math.floor(sM / 60));
      }
      if (r.endTime) {
        const eM = parseMins(r.endTime);
        if (eM < 99999) maxHour = Math.max(maxHour, Math.ceil(eM / 60));
      }
    });
    return {
      startHour: Math.max(4, minHour),
      endHour: Math.min(22, Math.max(minHour + 1, maxHour))
    };
  }, [declaredShift, currentPerson?.workloadRows, activeTerm]);

  const { startHour, endHour } = gridBounds;
  const gridStartMins = startHour * 60;
  const totalGridMins = (endHour - startHour) * 60;
  const pxPerMin = 1.1; // 1 min = 1.1px (60 mins = 66px)
  const gridHeight = totalGridMins * pxPerMin;

  const hourLabels = [];
  for (let h = startHour; h <= endHour; h++) {
    hourLabels.push(h);
  }

  // Calculate daily workload minutes per day (for Teaching: excludes non-teaching tasks & HGP; for Non-Teaching: sums administrative duty tasks; merges overlapping intervals; factors in partner school ghost slots)
  const dailyTotalMins = useMemo(() => {
    const map = {};
    daysList.forEach(d => { map[d.code] = { local: 0, shared: 0, total: 0 }; });
    const rows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
    const ghosts = sharedWorkloadRows || [];
    const isNT = isNonTeachingPerson(currentPerson);

    for (const d of daysList) {
      const allIntervals = [];
      const localIntervals = [];
      const sharedIntervals = [];

      for (const r of rows) {
        if (!r.startTime || !r.endTime) continue;
        const rowDays = (Array.isArray(r.days) && r.days.length > 0)
          ? r.days
          : (r.daySchedule ? String(r.daySchedule).split(',').map(s => s.trim()) : ['M','T','W','TH','F']);
        if (!rowDays.includes(d.code)) continue;

        const subUpper = String(r.subject || '').toUpperCase().trim();
        if (!isNT) {
          if (isNonTeachingTaskSubject(subUpper)) continue;
          if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) continue;
        }

        const sM = parseMins(r.startTime);
        const eM = parseMins(r.endTime);
        if (sM < 99999 && eM < 99999 && eM > sM) {
          localIntervals.push([sM, eM]);
          allIntervals.push([sM, eM]);
        }
      }

      for (const g of ghosts) {
        const rawDays = (Array.isArray(g.days) && g.days.length > 0) ? g.days : (g.day ? [g.day] : ['M','T','W','TH','F']);
        const normDays = rawDays.map(dayStr => {
          if (!dayStr) return 'M';
          const u = String(dayStr).trim().toUpperCase();
          if (u === 'M' || u.startsWith('MON')) return 'M';
          if (u === 'TH' || u.startsWith('THU')) return 'TH';
          if (u === 'T' || u.startsWith('TUE')) return 'T';
          if (u === 'W' || u.startsWith('WED')) return 'W';
          if (u === 'F' || u.startsWith('FRI')) return 'F';
          if (u === 'SAT' || u.startsWith('SAT')) return 'SAT';
          if (u === 'SUN' || u.startsWith('SUN')) return 'SUN';
          return u;
        });
        if (!normDays.includes(d.code)) continue;

        const subUpper = String(g.subject || '').toUpperCase().trim();
        if (!isNT) {
          if (isNonTeachingTaskSubject(subUpper)) continue;
          if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) continue;
        }

        const sM = parseMins(g.startTime || g.start_time);
        const eM = parseMins(g.endTime || g.end_time);
        if (sM < 99999 && eM < 99999 && eM > sM) {
          sharedIntervals.push([sM, eM]);
          allIntervals.push([sM, eM]);
        }
      }

      const computeMerged = (intList) => {
        if (intList.length === 0) return 0;
        const sorted = [...intList].sort((a, b) => a[0] - b[0]);
        const merged = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
          const cur = sorted[i];
          const last = merged[merged.length - 1];
          if (cur[0] <= last[1]) {
            last[1] = Math.max(last[1], cur[1]);
          } else {
            merged.push(cur);
          }
        }
        return merged.reduce((acc, [st, en]) => acc + (en - st), 0);
      };

      map[d.code] = {
        local: computeMerged(localIntervals),
        shared: computeMerged(sharedIntervals),
        total: computeMerged(allIntervals)
      };
    }

    return map;
  }, [currentPerson?.workloadRows, sharedWorkloadRows, daysList]);

  const columnRefs = useRef({});

  // Global mouse handlers for Drag-Move, Drag-Resize, Drag-Create
  useEffect(() => {
    if (!dragState) return;

    const SNAP_MINS = 5; // 5-minute drag & resize snap

    const handleMouseMove = (e) => {
      const cur = dragStateRef.current;
      if (!cur) return;

      // Safety: If mouse button was released outside the window or without mouseup, terminate drag immediately
      if (e.buttons !== undefined && (e.buttons & 1) === 0) {
        handleMouseUp();
        return;
      }

      const deltaY = e.clientY - cur.initialMouseY;
      const deltaMins = Math.round((deltaY / pxPerMin) / SNAP_MINS) * SNAP_MINS;

      if (cur.type === 'create') {
        const newCurrentMins = Math.max(cur.createStartMins + SNAP_MINS, Math.min(gridStartMins + totalGridMins, cur.createStartMins + deltaMins));
        
        // Track horizontal column crossing all the way to Friday
        let hoveredDay = cur.createStartDay || cur.createDay;
        if (columnRefs.current && daysList.length > 0) {
          const firstCol = columnRefs.current[daysList[0].code];
          const lastCol = columnRefs.current[daysList[daysList.length - 1].code];
          if (firstCol && e.clientX < firstCol.getBoundingClientRect().left) {
            hoveredDay = daysList[0].code;
          } else if (lastCol && e.clientX > lastCol.getBoundingClientRect().right) {
            hoveredDay = daysList[daysList.length - 1].code;
          } else {
            daysList.forEach(d => {
              const colEl = columnRefs.current[d.code];
              if (colEl) {
                const rect = colEl.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right) {
                  hoveredDay = d.code;
                }
              }
            });
          }
        }

        const startDayCode = cur.createStartDay || cur.createDay;
        const startIdx = daysList.findIndex(d => d.code === startDayCode);
        const hoverIdx = daysList.findIndex(d => d.code === hoveredDay);
        let spanned = [startDayCode];
        if (startIdx !== -1 && hoverIdx !== -1) {
          const minI = Math.min(startIdx, hoverIdx);
          const maxI = Math.max(startIdx, hoverIdx);
          spanned = daysList.slice(minI, maxI + 1).map(d => d.code);
        }

        setDragState(prev => prev ? { 
          ...prev, 
          createCurrentMins: newCurrentMins,
          createCurrentDay: hoveredDay,
          spannedDays: spanned
        } : null);
      } else if (cur.type === 'extend-days') {
        let hoveredDay = cur.day;
        if (columnRefs.current && daysList.length > 0) {
          const firstCol = columnRefs.current[daysList[0].code];
          const lastCol = columnRefs.current[daysList[daysList.length - 1].code];
          if (firstCol && e.clientX < firstCol.getBoundingClientRect().left) {
            hoveredDay = daysList[0].code;
          } else if (lastCol && e.clientX > lastCol.getBoundingClientRect().right) {
            hoveredDay = daysList[daysList.length - 1].code;
          } else {
            daysList.forEach(d => {
              const colEl = columnRefs.current[d.code];
              if (colEl) {
                const rect = colEl.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right) {
                  hoveredDay = d.code;
                }
              }
            });
          }
        }

        const fromIdx = daysList.findIndex(d => d.code === cur.day);
        const toIdx = daysList.findIndex(d => d.code === hoveredDay);
        if (fromIdx !== -1 && toIdx !== -1) {
          const minI = Math.min(fromIdx, toIdx);
          const maxI = Math.max(fromIdx, toIdx);
          const newSpanned = daysList.slice(minI, maxI + 1).map(d => d.code);
          const combinedDays = Array.from(new Set([...cur.initialDays, ...newSpanned]));
          setDragState(prev => prev ? {
            ...prev,
            currentDays: combinedDays
          } : null);
        }
      } else if (cur.type === 'move') {
        const draggedRow = currentPerson?.workloadRows?.[cur.rowIdx];
        const isAdv = String(draggedRow?.subject || '').toUpperCase().trim() === 'ADVISORY';
        const duration = isAdv ? 60 : (cur.initialEndMins - cur.initialStartMins);
        let newStartMins = cur.initialStartMins + deltaMins;
        newStartMins = Math.max(gridStartMins, Math.min(gridStartMins + totalGridMins - duration, newStartMins));
        const newEndMins = newStartMins + duration;

        // Check if mouse X crossed into another day column
        let targetDay = cur.day;
        if (!isAdv && columnRefs.current && daysList.length > 0) {
          const firstCol = columnRefs.current[daysList[0].code];
          const lastCol = columnRefs.current[daysList[daysList.length - 1].code];
          if (firstCol && e.clientX < firstCol.getBoundingClientRect().left) {
            targetDay = daysList[0].code;
          } else if (lastCol && e.clientX > lastCol.getBoundingClientRect().right) {
            targetDay = daysList[daysList.length - 1].code;
          } else {
            daysList.forEach(d => {
              const colEl = columnRefs.current[d.code];
              if (colEl) {
                const rect = colEl.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right) {
                  targetDay = d.code;
                }
              }
            });
          }
        }

        setDragState(prev => prev ? {
          ...prev,
          currentStartMins: newStartMins,
          currentEndMins: newEndMins,
          targetDay: targetDay,
          currentDays: [targetDay]
        } : null);
      } else if (cur.type === 'resize-top') {
        let newStartMins = cur.initialStartMins + deltaMins;
        newStartMins = Math.max(gridStartMins, Math.min(cur.initialEndMins - SNAP_MINS, newStartMins));

        setDragState(prev => prev ? {
          ...prev,
          currentStartMins: newStartMins
        } : null);
      } else if (cur.type === 'resize-bottom') {
        let newEndMins = cur.initialEndMins + deltaMins;
        newEndMins = Math.max(cur.initialStartMins + SNAP_MINS, Math.min(gridStartMins + totalGridMins, newEndMins));

        setDragState(prev => prev ? {
          ...prev,
          currentEndMins: newEndMins
        } : null);
      }
    };

    const handleMouseUp = () => {
      const cur = dragStateRef.current;
      if (!cur) return;

      if (cur.type === 'create') {
        const sMins = Math.min(cur.createStartMins, cur.createCurrentMins);
        let eMins = Math.max(cur.createStartMins, cur.createCurrentMins);
        if (eMins - sMins < SNAP_MINS) eMins = sMins + 60;

        const activeDays = (cur.spannedDays && cur.spannedDays.length > 0)
          ? cur.spannedDays
          : [cur.createDay];

        const presetSubject = pendingCreateSubjectRef.current;
        const presetSection = pendingCreateSectionRef.current;

        let initialGrade = '';
        let initialCategory = '';
        let initialSectionId = '';
        let initialSectionName = '';
        let chosenSubject = '';

        const categoryForGrade = (grade) => {
          const gUpper = String(grade || '').toUpperCase();
          if (gUpper.includes('11') || gUpper.includes('12') || gUpper.includes('SHS') || gUpper.includes('SENIOR')) return 'SHS-CORE SUBJECTS';
          if (gUpper.includes('7') || gUpper.includes('8') || gUpper.includes('9') || gUpper.includes('10') || gUpper.includes('JHS')) return 'Junior High School';
          return 'Elementary';
        };

        const isPresetAdmin = isAdminTaskRow({ subject: presetSubject }) || (isNonTeachingPerson(currentPerson) && !presetSection);
        if (isPresetAdmin) {
          chosenSubject = presetSubject || ADMIN_TASK_OPTIONS[0];
          initialSectionId = '';
          initialSectionName = '';
          initialGrade = '';
          initialCategory = '';
        } else if (presetSection) {
          // Section-first (Organized Classes sidebar): use the exact section/grade picked.
          initialSectionId = presetSection.sectionId;
          initialSectionName = presetSection.sectionName;
          initialGrade = presetSection.gradeLevel;
          initialCategory = presetSection.category || categoryForGrade(presetSection.gradeLevel);
          if (presetSubject) chosenSubject = presetSubject;
        } else if (presetSubject) {
          // Flow 1 (subject-first): a subject was picked from the "Subjects Taught" sidebar
          // before clicking/dragging the slot. Best-effort match a class section/grade so the
          // inspector opens with sensible defaults, but the subject itself is exactly what was chosen.
          chosenSubject = presetSubject;
          const assignedGrades = getAssignedGradeLevels(currentPerson);
          let matchedSec = null;
          if (Array.isArray(classSections) && classSections.length > 0) {
            const activePersonIdToMatch = String(dbPerson?.id || currentPerson?.id || activePersonnelId || '');
            const advisorySec = classSections.find(s => {
              const advId = String(s.advisorId || s.advisor_id || s.advisor || '');
              return advId && advId === activePersonIdToMatch;
            });
            matchedSec = advisorySec || classSections.find(s => assignedGrades.includes(s.gradeLevel)) || classSections[0];
            if (matchedSec) {
              initialSectionId = String(matchedSec.id);
              initialSectionName = matchedSec.sectionName || matchedSec.section_name || '';
              initialGrade = matchedSec.gradeLevel || matchedSec.grade_level || '';
              initialCategory = categoryForGrade(initialGrade);
            }
          }
        }

        const rows = [...(currentPerson?.workloadRows || [])];
        const newId = `new-workload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const newRow = {
          id: newId,
          category: initialCategory,
          subject: chosenSubject,
          gradeLevel: initialGrade,
          sectionId: initialSectionId,
          sectionName: initialSectionName,
          startTime: formatMinutesToTime(sMins),
          endTime: formatMinutesToTime(eMins),
          days: activeDays,
          term: activeTerm
        };
        rows.unshift(newRow);
        if (typeof handleFieldChange === 'function') {
          handleFieldChange('workloadRows', rows);
        }
        setPendingCreateSubject(null);
        setPendingCreateSection(null);
        setSelectedBlockIdx(0);
      } else if (cur.type === 'move' || cur.type === 'resize-top' || cur.type === 'resize-bottom') {
        const finalStart = cur.currentStartMins !== undefined ? cur.currentStartMins : cur.initialStartMins;
        const finalEnd = cur.currentEndMins !== undefined ? cur.currentEndMins : cur.initialEndMins;
        const targetDay = (cur.type === 'move' && cur.targetDay) ? cur.targetDay : cur.day;

        const rawRows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
        const targetRow = rawRows[cur.rowIdx];
        if (targetRow) {
          const rowDays = (Array.isArray(targetRow.days) && targetRow.days.length > 0)
            ? [...targetRow.days]
            : (targetRow.daySchedule ? String(targetRow.daySchedule).split(',').map(s => s.trim()) : ['M','T','W','TH','F']);

          recordUndoSnapshot();
          const allRows = [...(currentPerson?.workloadRows || [])];
          const matchIdx = allRows.findIndex(r => (r.id && r.id === targetRow.id) || r === targetRow);
          const subUpper = String(targetRow.subject || '').toUpperCase().trim();
          const isSpecialSingletonRow = ['HGP', 'SNED MODIFIED SUBJECT', 'ALS LEARNING STRAND'].includes(subUpper) || isSnedSectionRow(targetRow, classSections);

          if (isSpecialSingletonRow || rowDays.length <= 1) {
            // Row is a singleton special slot (HGP/SNED/ALS) or single-day cell — update it directly in-place
            const updatedRow = {
              ...targetRow,
              startTime: formatMinutesToTime(finalStart),
              endTime: formatMinutesToTime(finalEnd),
              days: isSpecialSingletonRow ? rowDays : [targetDay]
            };
            if (matchIdx !== -1) {
              allRows[matchIdx] = updatedRow;
            } else {
              allRows[cur.rowIdx] = updatedRow;
            }
            if (typeof handleFieldChange === 'function') {
              handleFieldChange('workloadRows', allRows);
            }
          } else {
            // Row spanned multiple days: split the single dragged cell into its own independent row
            const remainingDays = rowDays.filter(d => d !== cur.day);
            const updatedOriginalRow = {
              ...targetRow,
              days: remainingDays
            };
            
            const newSingleCellRow = {
              ...targetRow,
              id: `workload-cell-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              startTime: formatMinutesToTime(finalStart),
              endTime: formatMinutesToTime(finalEnd),
              days: [targetDay],
              term: activeTerm
            };

            if (matchIdx !== -1) {
              allRows[matchIdx] = updatedOriginalRow;
              allRows.splice(matchIdx + 1, 0, newSingleCellRow);
            } else {
              allRows[cur.rowIdx] = updatedOriginalRow;
              allRows.splice(cur.rowIdx + 1, 0, newSingleCellRow);
            }

            if (typeof handleFieldChange === 'function') {
              handleFieldChange('workloadRows', allRows);
            }

            const newRawRows = allRows.filter(r => (r.term || '1st') === activeTerm);
            const newSelectedIdx = newRawRows.findIndex(r => r.id === newSingleCellRow.id);
            if (newSelectedIdx !== -1) {
              setSelectedBlockIdx(newSelectedIdx);
            }
          }
        }
      } else if (cur.type === 'extend-days') {
        const finalDays = cur.currentDays !== undefined ? cur.currentDays : cur.initialDays;
        updateWorkloadRowWithHistory(cur.rowIdx, {
          days: Array.from(new Set(finalDays))
        });
      }

      setDragState(null);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDragState(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState ? true : false, gridStartMins, totalGridMins, daysList, pxPerMin]);

  const handleStartDrag = (e, rowIdx, row, dayCode, type) => {
    if (e.button !== 0) return; // Left mouse button only
    if (isPlottingLocked && !isAdminTaskRow(row)) { e.preventDefault(); notifyPlottingLocked(); return; }
    const isMac = typeof navigator !== 'undefined' && navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    if (isCmdOrCtrl) {
      // If user is holding Ctrl/Cmd, do not start dragging — let the user toggle selection!
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    recordUndoSnapshot();

    const initialStartMins = parseMins(row.startTime || '07:30');
    const initialEndMins = parseMins(row.endTime || '08:30');
    const rowDays = (Array.isArray(row.days) && row.days.length > 0)
      ? row.days
      : (row.daySchedule ? String(row.daySchedule).split(',').map(s => s.trim()) : ['M','T','W','TH','F']);

    setDragState({
      type,
      rowIdx,
      day: dayCode,
      targetDay: dayCode,
      initialMouseY: e.clientY,
      initialStartMins,
      initialEndMins,
      initialDays: rowDays,
      currentStartMins: initialStartMins,
      currentEndMins: initialEndMins,
      currentDays: [dayCode]
    });
    setSelectedBlockIdx(rowIdx);
  };

  const handleGridMouseDown = (e, dayCode) => {
    if (e.target.closest('.gantt-block-card')) return;
    const isMac = typeof navigator !== 'undefined' && navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    if (!isCmdOrCtrl) {
      setSelectedCellKeys(new Set());
    }
    if (e.button !== 0) return; // Left mouse button only
    e.preventDefault();
    if (isPlottingLocked && !isAdminTaskRow({ subject: pendingCreateSubjectRef.current })) { notifyPlottingLocked(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickedMins = gridStartMins + Math.floor((clickY / pxPerMin) / 5) * 5;
    const startMins = Math.max(gridStartMins, Math.min(gridStartMins + totalGridMins - 30, clickedMins));

    recordUndoSnapshot();

    setDragState({
      type: 'create',
      createDay: dayCode,
      initialMouseY: e.clientY,
      createStartMins: startMins,
      createCurrentMins: startMins + 60
    });
  };

  const rawRows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
  const selectedRow = (selectedBlockIdx !== null && selectedBlockIdx >= 0 && selectedBlockIdx < (rawRows || []).length && rawRows[selectedBlockIdx]) ? rawRows[selectedBlockIdx] : null;

  // Copy Section Only (Ctrl+C): Copies sectionId, sectionName, gradeLevel, category, days (and preserves ADVISORY if copying Advisory)
  const handleCopySelectedSection = useCallback(() => {
    if (!selectedRow) return;
    const isAdv = String(selectedRow.subject || '').toUpperCase().trim() === 'ADVISORY';
    const secData = {
      sectionId: selectedRow.sectionId || selectedRow.section_id || '',
      sectionName: selectedRow.sectionName || selectedRow.section_name || '',
      gradeLevel: selectedRow.gradeLevel || selectedRow.grade_level || '',
      category: selectedRow.category || '',
      subject: isAdv ? 'ADVISORY' : '',
      days: (Array.isArray(selectedRow.days) && selectedRow.days.length > 0) ? [...selectedRow.days] : ['M', 'T', 'W', 'TH', 'F'],
      startTime: selectedRow.startTime || '07:30',
      endTime: selectedRow.endTime || '08:30'
    };
    setCopiedSection(secData);
    setPendingCreateSection({
      sectionId: secData.sectionId,
      sectionName: secData.sectionName,
      gradeLevel: secData.gradeLevel,
      category: secData.category
    });
    setPendingCreateSubject(isAdv ? 'ADVISORY' : null);
    if (showToast) {
      if (isAdv) {
        showToast(`📋 Copied Advisory slot for "${secData.sectionName || 'Section'}". Press Ctrl+V or click an empty slot to place 2nd Advisory.`, 'info');
      } else {
        showToast(`📋 Copied section "${secData.sectionName || 'Section'}" (${secData.gradeLevel || 'Grade'}). Press Ctrl+V or click an empty slot to place.`, 'info');
      }
    }
  }, [selectedRow, showToast]);

  // Duplicate Advisory Slot: Creates an instant 2nd 30-min Advisory slot for the same section
  const handleDuplicateAdvisorySlot = useCallback(() => {
    if (!selectedRow) return;
    const isAdv = String(selectedRow.subject || '').toUpperCase().trim() === 'ADVISORY';
    if (!isAdv) return;

    recordUndoSnapshot();

    const allRows = [...(currentPerson?.workloadRows || [])];
    const sMins = parseMins(selectedRow.startTime || '07:30');
    const eMins = parseMins(selectedRow.endTime || '08:00');
    let dur = (eMins > sMins && eMins < 99999) ? (eMins - sMins) : 30;
    if (dur > 60 || dur <= 0) dur = 30;

    // Default afternoon slot: 4:30 PM (16:30) or opposite session
    let newStartMins = 16 * 60 + 30;
    if (sMins >= 16 * 60) {
      newStartMins = 7 * 60 + 30;
    }
    const maxEndMins = declaredShift.endMins;
    const minStartMins = declaredShift.startMins;
    if (newStartMins + dur > maxEndMins) {
      newStartMins = Math.max(minStartMins, maxEndMins - dur);
    }

    const newId = `advisory-slot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAdvRow = {
      ...selectedRow,
      id: newId,
      subject: 'ADVISORY',
      subjectName: 'ADVISORY',
      startTime: formatMinutesToTime(newStartMins),
      endTime: formatMinutesToTime(newStartMins + dur),
      days: (Array.isArray(selectedRow.days) && selectedRow.days.length > 0) ? [...selectedRow.days] : ['M', 'T', 'W', 'TH', 'F'],
      term: activeTerm
    };

    allRows.unshift(newAdvRow);
    if (typeof handleFieldChange === 'function') {
      handleFieldChange('workloadRows', allRows);
    }
    setSelectedBlockIdx(0);
    if (showToast) {
      showToast(`📋 Created 2nd Advisory slot (${dur} mins) at ${formatMinutesToTime(newStartMins)} – ${formatMinutesToTime(newStartMins + dur)}! Drag or adjust its time.`, 'success');
    }
  }, [selectedRow, currentPerson?.workloadRows, declaredShift, activeTerm, handleFieldChange, setSelectedBlockIdx, showToast, recordUndoSnapshot]);

  // Paste Section (Ctrl+V): Creates a new schedule block with the copied section, WITHOUT the subject (or with ADVISORY if copying Advisory)
  const handlePasteSection = useCallback(() => {
    if (isPlottingLocked) { if (showToast) showToast(TEACHING_PLOT_LOCK_MESSAGE, 'warning'); return; }
    const secToUse = copiedSection || pendingCreateSection;
    if (!secToUse || (!secToUse.gradeLevel && !secToUse.sectionName)) {
      if (showToast) {
        showToast('Please select a schedule block and press Ctrl+C to copy its section first.', 'warning');
      }
      return;
    }

    recordUndoSnapshot();

    const isAdv = String(secToUse.subject || '').toUpperCase().trim() === 'ADVISORY';

    // Determine default start and end times for new block
    let newStartMins = isAdv ? (16 * 60 + 30) : (8 * 60);
    let durationMins = isAdv ? 30 : 60;

    if (selectedRow && selectedRow.endTime) {
      const sM = parseMins(selectedRow.startTime || '07:30');
      const eM = parseMins(selectedRow.endTime);
      durationMins = (eM > sM && eM < 99999) ? (eM - sM) : (isAdv ? 30 : 60);
      newStartMins = eM < 99999 ? eM : (isAdv ? 16 * 60 + 30 : 8 * 60);
    } else if (secToUse.startTime && secToUse.endTime) {
      const sM = parseMins(secToUse.startTime);
      const eM = parseMins(secToUse.endTime);
      durationMins = (eM > sM && eM < 99999) ? (eM - sM) : (isAdv ? 30 : 60);
      newStartMins = sM < 99999 ? sM : (isAdv ? 16 * 60 + 30 : 8 * 60);
    }

    // Clamp within shift bounds
    const maxEndMins = declaredShift.endMins;
    const minStartMins = declaredShift.startMins;
    if (newStartMins + durationMins > maxEndMins) {
      newStartMins = Math.max(minStartMins, maxEndMins - durationMins);
    }

    const newStart = formatMinutesToTime(newStartMins);
    const newEnd = formatMinutesToTime(newStartMins + durationMins);
    const daysToUse = (Array.isArray(secToUse.days) && secToUse.days.length > 0)
      ? secToUse.days
      : ((selectedRow && Array.isArray(selectedRow.days) && selectedRow.days.length > 0) ? selectedRow.days : ['M', 'T', 'W', 'TH', 'F']);

    const newId = `new-workload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newRow = {
      id: newId,
      sectionId: secToUse.sectionId || '',
      sectionName: secToUse.sectionName || '',
      gradeLevel: secToUse.gradeLevel || '',
      category: secToUse.category || '',
      subject: isAdv ? 'ADVISORY' : '', // If Advisory, keep ADVISORY
      remediationSubject: '',
      startTime: newStart,
      endTime: newEnd,
      days: daysToUse,
      term: activeTerm
    };

    const rows = [newRow, ...(currentPerson?.workloadRows || [])];
    if (typeof handleFieldChange === 'function') {
      handleFieldChange('workloadRows', rows);
    }
    setSelectedBlockIdx(0);
    if (showToast) {
      if (isAdv) {
        showToast(`📋 Pasted Advisory slot (${durationMins} mins) for "${secToUse.sectionName}"! Drag or adjust its time.`, 'success');
      } else {
        showToast(`📋 Pasted section "${secToUse.sectionName}"! Select the subject for this block.`, 'success');
      }
    }
  }, [isPlottingLocked, copiedSection, pendingCreateSection, selectedRow, declaredShift, currentPerson?.workloadRows, handleFieldChange, setSelectedBlockIdx, showToast, recordUndoSnapshot]);

  const handleRemoveRow = useCallback((rowIdx) => {
    recordUndoSnapshot();
    const rawRows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
    const targetRow = rawRows[rowIdx];
    if (!targetRow) return;
    if (typeof removeWorkloadRow === 'function') {
      removeWorkloadRow(targetRow);
    }
    setSelectedBlockIdx(null);
  }, [recordUndoSnapshot, currentPerson?.workloadRows, activeTerm, removeWorkloadRow]);

  // Global keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo), Ctrl+C (copy section), Ctrl+V (paste section), Del/Backspace (delete block)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable || Boolean(e.target?.closest?.('input, textarea, select, [contenteditable="true"]'));
      if (isEditable) return;
      if (dragState) return;

      const isMac = typeof navigator !== 'undefined' && navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (isCmdOrCtrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      } else if (isCmdOrCtrl && (e.key === 'c' || e.key === 'C')) {
        if (selectedBlockIdx !== null && selectedRow) {
          e.preventDefault();
          handleCopySelectedSection();
        }
      } else if (isCmdOrCtrl && (e.key === 'v' || e.key === 'V')) {
        if (copiedSection || pendingCreateSection) {
          e.preventDefault();
          handlePasteSection();
        }
      } else if (e.key === 'Escape') {
        setSelectedCellKeys(new Set());
        setSelectedBlockIdx(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockIdx !== null && selectedRow) {
          e.preventDefault();
          handleRemoveRow(selectedBlockIdx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockIdx, selectedRow, dragState, handleRemoveRow, handleCopySelectedSection, handlePasteSection, copiedSection, pendingCreateSection, handleUndo, handleRedo]);

  // Default duration to MATATAG-mandated length for new blocks without an explicit endTime,
  // while allowing teachers to freely customize and split sessions without forced reversion.
  useEffect(() => {
    if (selectedBlockIdx === null || !selectedRow || typeof getMatatagFixedDurationMins !== 'function') return;
    const fixedDurationMins = getMatatagFixedDurationMins(selectedRow);
    if (fixedDurationMins == null || !selectedRow.startTime) return;

    if (!selectedRow.endTime) {
      const [h, m] = selectedRow.startTime.split(':').map(Number);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const correctEndTime = formatMinutesToTime((h * 60 + m) + fixedDurationMins);
        updateWorkloadRowWithHistory(selectedBlockIdx, { endTime: correctEndTime });
      }
    }
  }, [selectedBlockIdx, selectedRow?.subject, selectedRow?.gradeLevel, selectedRow?.sectionId, selectedRow?.startTime, selectedRow?.endTime, getMatatagFixedDurationMins, updateWorkloadRowWithHistory]);

  return (
    <div className="gantt-schedule-container" style={{ background: '#F8FAFC', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      {/* Header Info Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1.5px solid var(--line)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiBarChart2 size={18} color="#0284C7" /> Drag-and-Drop Weekly Schedule Editor
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            Drag blocks to move time/day slots. 5-min snapping. Shortcuts: <strong style={{ color: '#0284C7' }}>Ctrl+Z</strong> (undo), <strong style={{ color: '#0284C7' }}>Ctrl+Y</strong> (redo), <strong style={{ color: '#0284C7' }}>Ctrl+C</strong> (copy section), <strong style={{ color: '#0284C7' }}>Ctrl+V</strong> (paste section), <strong style={{ color: '#EF4444' }}>Del</strong> (remove).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Undo / Redo Toolbar Controls */}
          <div style={{ display: 'inline-flex', border: '1.5px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              style={{
                padding: '6px 10px',
                border: 'none',
                background: undoStack.length > 0 ? '#FFFFFF' : '#F8FAFC',
                color: undoStack.length > 0 ? '#0F172A' : '#94A3B8',
                fontSize: '11px',
                fontWeight: '700',
                cursor: undoStack.length > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                borderRight: '1px solid #E2E8F0',
                transition: 'all 0.15s ease'
              }}
              title="Undo Schedule Action (Ctrl + Z)"
            >
              <FiRotateCcw size={12} color={undoStack.length > 0 ? '#0284C7' : '#94A3B8'} /> Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              style={{
                padding: '6px 10px',
                border: 'none',
                background: redoStack.length > 0 ? '#FFFFFF' : '#F8FAFC',
                color: redoStack.length > 0 ? '#0F172A' : '#94A3B8',
                fontSize: '11px',
                fontWeight: '700',
                cursor: redoStack.length > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
              title="Redo Schedule Action (Ctrl + Y or Ctrl + Shift + Z)"
            >
              <FiRotateCw size={12} color={redoStack.length > 0 ? '#0284C7' : '#94A3B8'} /> Redo
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowWeekend(!showWeekend)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1.5px solid #CBD5E1',
              background: showWeekend ? '#EFF6FF' : 'white',
              color: showWeekend ? '#1D4ED8' : '#475569',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FiCalendar size={14} /> {showWeekend ? 'Mon - Fri Only' : 'Show Weekend (Sat/Sun)'}
          </button>

          {/* Add Admin Task Button for Teaching & Teaching-Related Personnel */}
          {!isNonTeachingPerson(currentPerson) && (
            <button
              type="button"
              onClick={() => {
                setPendingCreateSection(null);
                setPendingCreateSubject(ADMIN_TASK_OPTIONS[0]);
                if (showToast) {
                  showToast('💼 Administrative Task selected! Click or drag any empty slot on the timetable to schedule administrative duties.', 'info');
                }
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: pendingCreateSubject && pendingCreateSubject.startsWith('ADMIN TASK') ? '1.5px solid #0F172A' : '1.5px solid #334155',
                background: pendingCreateSubject && pendingCreateSubject.startsWith('ADMIN TASK') ? '#0F172A' : '#1E293B',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(15, 23, 42, 0.2)',
                transition: 'all 0.15s ease'
              }}
              title="Add Administrative or Ancillary Task to schedule (No section required)"
            >
              <FiBriefcase size={14} color="#38BDF8" /> + Add Admin Task
            </button>
          )}

          {typeof handleSaveChangesDirectly === 'function' && (
            <button
              type="button"
              onClick={handleSaveChangesDirectly}
              disabled={isSaving}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1.5px solid #0284C7',
                background: isSaving ? '#94A3B8' : '#0284C7',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: '700',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)',
                transition: 'all 0.15s ease'
              }}
              title="Save teacher's weekly workload schedule directly to database"
            >
              <FiSave size={14} color="#FFFFFF" /> {isSaving ? 'Saving...' : 'Save Schedule'}
            </button>
          )}
        </div>
      </div>

      {/* 2nd Term Blank / Copy 1st Term Prompt Banner */}
      {activeTerm === '2nd' && rawRows.length === 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
          border: '1.5px dashed #0284C7',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(2, 132, 199, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#0284C7',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
            }}>
              <FiCopy size={20} />
            </div>
            <div>
              <div style={{ fontWeight: '800', color: '#0369A1', fontSize: '13.5px', letterSpacing: '-0.01em' }}>
                2nd Term Timetable is currently Blank
              </div>
              <div style={{ color: '#475569', fontSize: '12px', marginTop: '2px' }}>
                You can build a new schedule from scratch, or duplicate the complete 1st Term workload setup.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {typeof onCopyFirstTerm === 'function' && (
              <>
                <button
                  type="button"
                  onClick={() => onCopyFirstTerm('CURRENT')}
                  style={{
                    background: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Copy 1st Term workload for this teacher"
                >
                  <FiCopy size={13} /> Copy 1st Term (This Teacher)
                </button>
                <button
                  type="button"
                  onClick={() => onCopyFirstTerm('ALL')}
                  style={{
                    background: '#FFFFFF',
                    color: '#0369A1',
                    border: '1.5px solid #0284C7',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                  title="Copy 1st Term workload for all teachers across the school"
                >
                  <FiCopy size={13} /> Copy All Teachers
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {isPlottingLocked && (
        <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '10px', color: '#92400E', fontSize: '12px', fontWeight: '600' }}>
          {TEACHING_PLOT_LOCK_MESSAGE}
          {lockedLegacyBlockCount > 0 && (
            <div style={{ marginTop: '4px', fontWeight: '500' }}>
              ⚠ {lockedLegacyBlockCount} previously saved teaching block{lockedLegacyBlockCount === 1 ? '' : 's'} remain below for review. They are kept, not deleted. Assign classes in Personnel Profiling, or remove them manually.
            </div>
          )}
        </div>
      )}

      {/* Main Split View: Gantt Grid (left) + fixed "browse" sidebar (right) — the block-editing
          panel below floats separately once a block is clicked, but this browse sidebar (Select a
          Schedule Block / Subjects Taught / Organized Classes) stays docked in the layout. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>
        {/* Gantt Timetable Grid */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1.5px solid var(--line)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          {/* Day Headers Row */}
          <div style={{ display: 'grid', gridTemplateColumns: `75px repeat(${daysList.length}, 1fr)`, borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
            <div style={{ padding: '12px 8px', fontSize: '11px', fontWeight: '800', color: '#64748b', textAlign: 'center', borderRight: '1.5px solid var(--line)' }}>
              TIME
            </div>
            {daysList.map(d => {
              const dayData = typeof dailyTotalMins[d.code] === 'object' 
                ? dailyTotalMins[d.code] 
                : { local: dailyTotalMins[d.code] || 0, shared: 0, total: dailyTotalMins[d.code] || 0 };
              const dayMins = dayData.total;
              const dayHoursNum = dayMins / 60;
              const dayHours = dayHoursNum.toFixed(1);
              const isNT = isNonTeachingPerson(currentPerson);
              const isCurrentEligible = isEligibleForTeachingOverload(currentPerson);

              // Daily policy limit: 8.0 hrs/day for Non-Teaching (40 hrs/wk), 6.0 hrs/day for Teaching (30 hrs/wk)
              const dailyLimitHrs = isNT ? 8.0 : (30 / 5);
              const fillPct = Math.min(100, (dayHoursNum / dailyLimitHrs) * 100);

              let statusColor, statusBg, statusLabel;
              if (isNT) {
                statusColor = dayHoursNum === 0 ? '#64748B' : dayHoursNum < 8 ? '#0284C7' : dayHoursNum === 8 ? '#10B981' : '#F43F5E';
                statusBg = dayHoursNum === 0 ? '#F1F5F9' : dayHoursNum < 8 ? '#EFF6FF' : dayHoursNum === 8 ? '#ECFDF5' : '#FEF2F2';
                statusLabel = dayHoursNum === 0 ? null : dayHoursNum < 8 ? 'Partial' : dayHoursNum === 8 ? 'Target (8h)' : 'Extended';
              } else {
                statusColor = (!isCurrentEligible || dayHoursNum === 0) ? '#64748B' : dayHoursNum <= 4 ? '#10B981' : dayHoursNum <= 6 ? '#F59E0B' : '#F43F5E';
                statusBg = (!isCurrentEligible || dayHoursNum === 0) ? '#F1F5F9' : dayHoursNum <= 4 ? '#ECFDF5' : dayHoursNum <= 6 ? '#FFFBEB' : '#FEF2F2';
                statusLabel = (!isCurrentEligible || dayHoursNum === 0) ? null : dayHoursNum <= 4 ? 'Normal' : dayHoursNum <= 6 ? 'Full' : 'Overload';
              }
              const hasShared = dayData.shared > 0;

              return (
                <div key={d.code} style={{ position: 'relative', padding: '10px 8px', textAlign: 'center', borderRight: '1px solid var(--line)', background: '#F8FAFC', overflow: 'hidden' }}>
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${fillPct}%`, background: statusColor, opacity: 0.16, transition: 'height 0.25s ease' }}
                  />
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)' }}>{d.full} ({d.code})</div>
                    <div 
                      style={{ fontSize: '10px', fontWeight: '700', color: statusColor, background: statusBg, padding: '2px 6px', borderRadius: '12px', display: 'inline-block', marginTop: '4px' }}
                      title={hasShared ? `Combined: ${dayHours}h (${dayMins}m) [Local: ${(dayData.local / 60).toFixed(1)}h + Partner: ${(dayData.shared / 60).toFixed(1)}h]` : undefined}
                    >
                      <FiClock size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                      {dayHours} hrs ({dayMins}m){statusLabel ? ` · ${statusLabel}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grid Scrollable Timeline Body */}
          <div style={{ position: 'relative', height: `${gridHeight}px`, display: 'grid', gridTemplateColumns: `75px repeat(${daysList.length}, 1fr)` }}>
            {/* Left Time Axis Labels Column */}
            <div style={{ position: 'relative', borderRight: '1.5px solid var(--line)', background: '#FAFAFA', userSelect: 'none' }}>
              {hourLabels.map((h, i) => {
                const minsFromStart = (h - startHour) * 60;
                const topPx = minsFromStart * pxPerMin;
                return (
                  <div key={h} style={{ position: 'absolute', top: `${topPx}px`, left: 0, right: 0, height: '60px', padding: '4px 6px', fontSize: '10px', fontWeight: '700', color: '#64748b', textAlign: 'right', borderBottom: '1px dashed #E2E8F0', boxSizing: 'border-box' }}>
                    {formatMinutesTo12Hour(h * 60)}
                  </div>
                );
              })}
            </div>

            {/* Day Columns */}
            {daysList.map(d => (
              <div
                key={d.code}
                ref={el => columnRefs.current[d.code] = el}
                onMouseDown={(e) => handleGridMouseDown(e, d.code)}
                style={{
                  position: 'relative',
                  height: `${gridHeight}px`,
                  borderRight: '1px solid var(--line)',
                  background: 'white',
                  cursor: 'crosshair',
                  userSelect: 'none'
                }}
              >
                {/* Horizontal Background Hour/Half-Hour Grid Lines */}
                {hourLabels.map(h => {
                  const minsFromStart = (h - startHour) * 60;
                  const topPx = minsFromStart * pxPerMin;
                  return (
                    <React.Fragment key={h}>
                      {/* Hour Line */}
                      <div style={{ position: 'absolute', top: `${topPx}px`, left: 0, right: 0, borderTop: '1.5px solid #E2E8F0', pointerEvents: 'none' }} />
                      {/* 30-min Line */}
                      <div style={{ position: 'absolute', top: `${topPx + (30 * pxPerMin)}px`, left: 0, right: 0, borderTop: '1px dashed #F1F5F9', pointerEvents: 'none' }} />
                    </React.Fragment>
                  );
                })}

                {/* Drag Create Active Preview Box */}
                {dragState && dragState.type === 'create' && (() => {
                  const activeDays = dragState.spannedDays || [dragState.createDay];
                  if (!activeDays.includes(d.code)) return null;

                  const sM = Math.min(dragState.createStartMins, dragState.createCurrentMins);
                  const eM = Math.max(dragState.createStartMins, dragState.createCurrentMins);
                  const top = (sM - gridStartMins) * pxPerMin;
                  const height = Math.max(20, (eM - sM) * pxPerMin);
                  const durationMins = eM - sM;
                  const durationLabel = durationMins >= 60
                    ? `${(durationMins / 60).toFixed(durationMins % 60 === 0 ? 0 : 1)}h`
                    : `${durationMins}m`;
                  return (
                    <div style={{
                      position: 'absolute',
                      top: `${top}px`,
                      left: '4px',
                      right: '4px',
                      height: `${height}px`,
                      background: 'rgba(2, 132, 199, 0.18)',
                      border: '2px dashed #0284C7',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      zIndex: 10,
                      pointerEvents: 'none',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#0369A1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.15)'
                    }}>
                      <FiPlus size={13} />
                      <span>{formatMinutesTo12Hour(sM)} - {formatMinutesTo12Hour(eM)}</span>
                      <span style={{
                        background: '#0284C7',
                        color: 'white',
                        borderRadius: '10px',
                        padding: '1px 7px',
                        fontSize: '10px',
                        fontWeight: '800',
                        flexShrink: 0
                      }}>
                        {durationLabel}
                      </span>
                    </div>
                  );
                })()}

                {/* Render Clustered Partner School Ghost Slots & Transit Lockout Gap Zones */}
                {(() => {
                  const { ghostSlots, transitGapSlots } = getClusteredLocksForDay(sharedWorkloadRows, d.code, 120);

                  return (
                    <>
                      {/* 1. Ghost Slots (Partner School Classes) */}
                      {ghostSlots.map((ghost, gIdx) => {
                        const top = (ghost.sMins - gridStartMins) * pxPerMin;
                        const height = Math.max(32, ghost.diffMins * pxPerMin);

                        return (
                          <div
                            key={`ghost-${gIdx}-${d.code}`}
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              left: '4px',
                              right: '4px',
                              height: `${height}px`,
                              background: 'repeating-linear-gradient(45deg, #FEF3C7, #FEF3C7 10px, #FFFBEB 10px, #FFFBEB 20px)',
                              border: '1.5px dashed #F59E0B',
                              borderRadius: '8px',
                              padding: '4px 6px',
                              boxSizing: 'border-box',
                              cursor: 'not-allowed',
                              zIndex: 4,
                              color: '#92400E',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                            }}
                            title={`🔒 Locked Ghost Slot: Assigned by ${ghost.schoolName || 'Partner School'} • ${ghost.subject || 'Class'} (${ghost.startTime}-${ghost.endTime})`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '10px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FiLock size={10} color="#D97706" /> {ghost.subject || 'Class'}
                              </span>
                              <span style={{ fontSize: '9px', fontWeight: '700', background: 'rgba(217, 119, 6, 0.15)', color: '#92400E', padding: '1px 4px', borderRadius: '4px' }}>
                                {ghost.diffMins}m
                              </span>
                            </div>
                            <div style={{ fontSize: '9px', color: '#B45309', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              🏫 {ghost.schoolName || 'Partner Station'}
                            </div>
                          </div>
                        );
                      })}

                      {/* 2. Transit Lockout Zones (Sandwich Gaps <= 2 hours between partner classes) */}
                      {transitGapSlots.map((gap, tIdx) => {
                        const top = (gap.sMins - gridStartMins) * pxPerMin;
                        const height = Math.max(26, gap.diffMins * pxPerMin);

                        return (
                          <div
                            key={`transit-gap-${tIdx}-${d.code}`}
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              left: '4px',
                              right: '4px',
                              height: `${height}px`,
                              background: 'repeating-linear-gradient(45deg, #FEF9C3, #FEF9C3 8px, #FEF08A 8px, #FEF08A 16px)',
                              border: '1.5px dashed #CA8A04',
                              borderRadius: '8px',
                              padding: '3px 6px',
                              boxSizing: 'border-box',
                              cursor: 'not-allowed',
                              zIndex: 3,
                              color: '#854D0E',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                            }}
                            title={`🔒 Transit Lockout: Clustered personnel is stationed at ${gap.schoolName} (${gap.diffMins}m gap ≤ 2h between ${gap.prevSubject} and ${gap.nextSubject}). Campus transit restriction applies.`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '9.5px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <FiLock size={9} color="#CA8A04" /> Transit Lockout ({gap.diffMins}m)
                              </span>
                              <span style={{ fontSize: '8.5px', fontWeight: '700', background: 'rgba(202, 138, 4, 0.18)', color: '#854D0E', padding: '1px 3px', borderRadius: '3px' }}>
                                ≤ 2h Gap
                              </span>
                            </div>
                            <div style={{ fontSize: '8.5px', color: '#A16207', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              🚗 Stationed @ {gap.schoolName}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}

                {/* Render Subject Blocks for this Day */}
                {rawRows.map((row, rowIdx) => {
                  let rowDays = getNormalizedRowDays(row);

                  const isDraggingActive = dragState && dragState.rowIdx === rowIdx;
                  let isThisCellDragged = false;
                  let shouldRenderCellOnThisDay = false;

                  if (isDraggingActive) {
                    if (dragState.type === 'move') {
                      const targetDay = dragState.targetDay || dragState.day;
                      if (d.code === targetDay) {
                        isThisCellDragged = true;
                        shouldRenderCellOnThisDay = true;
                      } else if (d.code === dragState.day) {
                        shouldRenderCellOnThisDay = false;
                      } else if (rowDays.includes(d.code)) {
                        shouldRenderCellOnThisDay = true;
                      }
                    } else if (dragState.type === 'resize-top' || dragState.type === 'resize-bottom') {
                      if (d.code === dragState.day) {
                        isThisCellDragged = true;
                        shouldRenderCellOnThisDay = true;
                      } else if (rowDays.includes(d.code)) {
                        shouldRenderCellOnThisDay = true;
                      }
                    } else if (dragState.type === 'extend-days') {
                      const effDays = dragState.currentDays || rowDays;
                      shouldRenderCellOnThisDay = effDays.includes(d.code);
                      isThisCellDragged = d.code === dragState.day;
                    }
                  } else {
                    shouldRenderCellOnThisDay = rowDays.includes(d.code);
                  }

                  if (!shouldRenderCellOnThisDay) return null;

                  let sMins = parseMins(row.startTime || '07:30');
                  let eMins = parseMins(row.endTime || '08:30');
                  if (isThisCellDragged) {
                    if (dragState.currentStartMins !== undefined) sMins = dragState.currentStartMins;
                    if (dragState.currentEndMins !== undefined) eMins = dragState.currentEndMins;
                  }
                  if (sMins >= 99999 || eMins >= 99999) return null;

                  const isDraggingThisRow = isThisCellDragged;

                  const top = (sMins - gridStartMins) * pxPerMin;
                  const height = Math.max(32, (eMins - sMins) * pxPerMin);
                  const diffMins = eMins - sMins;

                  const subUpper = String(row.subject || '').toUpperCase().trim();
                  const isAdmin = isAdminTaskRow(row);
                  const isSnedSec = !isAdmin && isSnedSectionRow(row, classSections);
                  const isAlsSec = !isAdmin && isAlsSectionRow(row, classSections);
                  const isAralSec = !isAdmin && isAralSectionRow(row, classSections);
                  const isRemSec = !isAdmin && isRemedialSectionRow(row, classSections);
                  const isAdv = !isAdmin && !isSnedSec && !isAlsSec && !isAralSec && !isRemSec && subUpper === 'ADVISORY';
                  const isHgp = !isAdmin && !isSnedSec && !isAlsSec && !isAralSec && !isRemSec && (subUpper === 'HGP' || subUpper.includes('HOMEROOM GUIDANCE'));
                  const isSned = !isAdmin && (isSnedSec || subUpper === 'SNED MODIFIED SUBJECT' || subUpper === 'SNED' || subUpper === 'SPED MODIFIED SUBJECTS');
                  const isAls = !isAdmin && (isAlsSec || subUpper === 'ALS LEARNING STRAND' || subUpper === 'ALS');
                  const isAral = !isAdmin && (isAralSec || isAralSubject(subUpper) || subUpper === 'ARAL TUTORING' || subUpper === 'ARAL' || (subUpper.startsWith('ARAL') && !subUpper.startsWith('ARALING')));
                  const isRem = !isAdmin && (isRemSec || subUpper === 'REMEDIATION' || subUpper === 'ENRICHMENT' || isRemediationSub(subUpper));
                  const canResize = true;

                  // Validation errors (local overlap)
                  const normalizedRowDays = getNormalizedRowDays(row);
                  const hasConflict = rawRows.some((otherRow, otherIdx) => {
                    if (rowIdx === otherIdx) return false;
                    if (row.id && otherRow.id && String(row.id) === String(otherRow.id)) return false;
                    if ((otherRow.term || '1st') !== (row.term || '1st')) return false;
                    if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
                    const otherDays = getNormalizedRowDays(otherRow);
                    if (!otherDays.includes(d.code) || !normalizedRowDays.includes(d.code)) return false;
                    const ns = parseMins(row.startTime), ne = parseMins(row.endTime);
                    const rs = parseMins(otherRow.startTime), re = parseMins(otherRow.endTime);
                    if (ns >= 99999 || ne >= 99999 || rs >= 99999 || re >= 99999) return false;
                    if (ns >= ne || rs >= re) return false;
                    if (ns < re && ne > rs) {
                      if (isAdvisoryOrHgpPair(row, otherRow)) return false;
                      if (isPerGradeSharedSlot(row, otherRow)) return false; // multigrade: different grade levels run side by side
                      return true;
                    }
                    return false;
                  });

                  // Cross-school collision with Clustered Ghost Slots & 2h Transit Sandwich Gaps
                  const rowToCheck = isDraggingThisRow
                    ? {
                        ...row,
                        startTime: `${Math.floor(sMins / 60).toString().padStart(2, '0')}:${(sMins % 60).toString().padStart(2, '0')}`,
                        endTime: `${Math.floor(eMins / 60).toString().padStart(2, '0')}:${(eMins % 60).toString().padStart(2, '0')}`,
                        days: rowDays
                      }
                    : row;
                  const hasCrossSchoolConflict = checkCrossSchoolConflict(rowToCheck, sharedWorkloadRows, 120);

                  const blockKey = `${row.id || rowIdx}_${d.code}`;
                  const isMultiSelected = selectedCellKeys.has(blockKey);
                  const isSingleSelected = selectedBlockIdx === rowIdx && selectedCellKeys.size <= 1;
                  const isSelected = isMultiSelected || isSingleSelected;

                  const durationErr = getRowDurationError(row);
                  const matatagWarn = getMatatagRowWarning(row);
                  const duplicateSubErr = getDuplicateSectionSubjectError(row, row);
                  const hgpWeeklyErr = getHgpWeeklyError(row);
                  const cardHasError = hasConflict || hasCrossSchoolConflict || !!durationErr || !!duplicateSubErr || !!hgpWeeklyErr || (matatagWarn && matatagWarn.type === 'error');

                  const isSHS = isSHSRow(row);

                  let blockBg = 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%)';
                  let blockBorder = isSelected ? '2px solid #0284C7' : '1.5px solid #CBD5E1';
                  let textColor = '#0F172A';

                  if (isAdmin) {
                    blockBg = 'linear-gradient(135deg, #1E293B 0%, #334155 100%)';
                    blockBorder = isSelected ? '2px solid #38BDF8' : '1.5px solid #475569';
                    textColor = '#FFFFFF';
                  } else if (isAdv) {
                    blockBg = 'linear-gradient(135deg, #0284c7 0%, #1e40af 100%)';
                    blockBorder = '1.5px solid #1d4ed8';
                    textColor = '#FFFFFF';
                  } else if (isHgp) {
                    blockBg = 'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)';
                    blockBorder = '1.5px solid #0891b2';
                    textColor = '#FFFFFF';
                  } else if (isSned) {
                    blockBg = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                    blockBorder = isSelected ? '2px solid #10B981' : '1.5px solid #047857';
                    textColor = '#FFFFFF';
                  } else if (isAls) {
                    blockBg = 'linear-gradient(135deg, #7e22ce 0%, #6b21a8 100%)';
                    blockBorder = isSelected ? '2px solid #c084fc' : '1.5px solid #7e22ce';
                    textColor = '#FFFFFF';
                  } else if (isAral) {
                    blockBg = 'linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)';
                    blockBorder = isSelected ? '2px solid #FEF08A' : '1.5px solid #A16207';
                    textColor = '#FFFFFF';
                  } else if (isRem) {
                    blockBg = 'linear-gradient(135deg, #854D0E 0%, #78350F 100%)';
                    blockBorder = isSelected ? '2px solid #FDE68A' : '1.5px solid #78350F';
                    textColor = '#FFFFFF';
                  } else if (cardHasError) {
                    blockBg = 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)';
                    blockBorder = '2px solid #EF4444';
                    textColor = '#991B1B';
                  } else if (matatagWarn) {
                    blockBg = 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)';
                    blockBorder = '2px solid #F59E0B';
                    textColor = '#92400E';
                  } else if (isSHS) {
                    blockBg = 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)';
                    blockBorder = isSelected ? '2px solid #16A34A' : '1.5px solid #86EFAC';
                    textColor = '#14532D';
                  }

                  const displaySubject = isAdmin
                    ? (row.subject || 'ADMIN TASK')
                    : (isSned
                      ? 'SNED MODIFIED SUBJECT'
                      : (isAls
                        ? 'ALS LEARNING STRAND'
                        : (isAral
                          ? (row.subject || 'ARAL TUTORING')
                          : (isRem
                            ? (row.subject || 'REMEDIATION')
                            : (row.subject || 'Select Subject')))));

                  return (
                    <div
                      key={blockKey}
                      className="gantt-block-card"
                      onClick={(e) => {
                        e.stopPropagation();
                        const isMac = typeof navigator !== 'undefined' && navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                        const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                        if (isCmdOrCtrl) {
                          setSelectedCellKeys(prev => {
                            const next = new Set(prev);
                            if (next.has(blockKey)) {
                              next.delete(blockKey);
                            } else {
                              next.add(blockKey);
                            }
                            return next;
                          });
                          setSelectedBlockIdx(rowIdx);
                        } else {
                          setSelectedCellKeys(new Set([blockKey]));
                          setSelectedBlockIdx(rowIdx);
                        }
                      }}
                      onMouseDown={(e) => handleStartDrag(e, rowIdx, row, d.code, 'move')}
                      style={{
                        position: 'absolute',
                        top: `${top}px`,
                        left: '4px',
                        right: '4px',
                        height: `${height}px`,
                        background: blockBg,
                        border: blockBorder,
                        borderRadius: '8px',
                        padding: '4px 6px',
                        boxSizing: 'border-box',
                        cursor: isDraggingThisRow ? 'grabbing' : 'move',
                        zIndex: isDraggingThisRow ? 25 : (isSelected ? 5 : 2),
                        opacity: isDraggingThisRow ? 0.88 : 1,
                        boxShadow: isDraggingThisRow
                          ? '0 10px 25px rgba(2, 132, 199, 0.4), 0 0 0 2px #0284C7'
                          : (isSelected ? '0 0 0 3px rgba(2, 132, 199, 0.35), 0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.04)'),
                        color: textColor,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        pointerEvents: dragState ? (isDraggingThisRow ? 'auto' : 'none') : 'auto',
                        transition: isDraggingThisRow ? 'none' : 'box-shadow 0.15s ease'
                      }}
                      title={`${displaySubject} (${isAdmin ? 'Administrative Duty' : (row.sectionName || 'Section')}) • ${row.startTime} - ${row.endTime}`}
                    >
                      {/* Top Resize Handle (disabled for ADVISORY fixed 60m) */}
                      {canResize && (
                        <div
                          onMouseDown={(e) => handleStartDrag(e, rowIdx, row, d.code, 'resize-top')}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '6px',
                            cursor: 'ns-resize',
                            background: 'rgba(0,0,0,0.05)',
                            zIndex: 10
                          }}
                          title="Drag up/down to adjust start time"
                        />
                      )}

                      {/* Block Title & Details */}
                      <div style={{ pointerEvents: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            {selectedCellKeys.size > 1 && isMultiSelected && (
                              <span style={{
                                fontSize: '8px',
                                fontWeight: '900',
                                background: '#0284C7',
                                color: 'white',
                                borderRadius: '50%',
                                width: '13px',
                                height: '13px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                ✓
                              </span>
                            )}
                            {displaySubject}{row.remediationSubject ? `: ${row.remediationSubject}` : ''} {isAdv && <span style={{ fontSize: '9px', opacity: 0.85, marginLeft: '4px' }}>⏱️ {diffMins}m</span>}
                            {isSHS && <span title="Senior High School" style={{ fontSize: '8px', fontWeight: '800', background: '#16A34A', color: 'white', padding: '1px 3px', borderRadius: '3px' }}>SHS</span>}
                            {isAdmin && <span title="Administrative Duty" style={{ fontSize: '8px', fontWeight: '800', background: '#0284C7', color: 'white', padding: '1px 3px', borderRadius: '3px' }}>ADMIN</span>}
                          </span>
                          <span style={{ fontSize: '9px', fontWeight: '700', opacity: 0.85, background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                            {diffMins}m
                          </span>
                        </div>

                        {height >= 40 && (
                          <div style={{ fontSize: '10px', fontWeight: '600', opacity: 0.9, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {isAdmin ? '[Administrative Duty]' : `[${row.gradeLevel ? `${row.gradeLevel} • ` : ''}${(() => {
  const matched = (classSections || []).find(s => String(s.id) === String(row.sectionId));
  return formatSectionDisplay(row.sectionName, matched?.sectionType || row.sectionType, matched?.id || row.sectionId);
})()}]`}
                          </div>
                        )}

                        {height >= 55 && (
                          <div style={{ fontSize: '9px', opacity: 0.8, marginTop: '1px' }}>
                            {formatMinutesTo12Hour(sMins)} - {formatMinutesTo12Hour(eMins)}
                          </div>
                        )}

                        {/* Inline Warning / Conflict Badges */}
                        {cardHasError && height >= 45 && (
                          <div style={{ marginTop: '2px', display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                            {hasConflict && <span style={{ fontSize: '8px', fontWeight: '800', background: '#EF4444', color: 'white', padding: '1px 4px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><FiAlertCircle size={9} /> Overlap</span>}
                            {hgpWeeklyErr && <span style={{ fontSize: '8px', fontWeight: '800', background: '#EF4444', color: 'white', padding: '1px 4px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><FiAlertCircle size={9} /> HGP (60m)</span>}
                            {duplicateSubErr && <span title={duplicateSubErr} style={{ fontSize: '8px', fontWeight: '800', background: '#EF4444', color: 'white', padding: '1px 4px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px', cursor: 'help' }}><FiAlertCircle size={9} /> Duplicate</span>}
                            {matatagWarn && <span style={{ fontSize: '8px', fontWeight: '800', background: matatagWarn.type === 'error' ? '#EF4444' : '#F59E0B', color: 'white', padding: '1px 4px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><FiAlertTriangle size={9} /> MATATAG</span>}
                          </div>
                        )}
                      </div>

                      {/* Bottom Resize Handle (disabled for ADVISORY fixed 60m) */}
                      {canResize && (
                        <div
                          onMouseDown={(e) => handleStartDrag(e, rowIdx, row, d.code, 'resize-bottom')}
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '6px',
                            cursor: 'ns-resize',
                            background: 'rgba(0,0,0,0.05)',
                            zIndex: 10
                          }}
                          title="Drag up/down to adjust end time"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Fixed "Browse" Sidebar — Administrative Tasks for Non-Teaching, or Organized Classes + Subjects Taught + Admin Tasks for Teaching. Stays docked in the layout (not floating). */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1.5px solid var(--line)', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ padding: '4px 0' }}>
            <div style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px' }}><FiCalendar size={32} color="#0284C7" /></div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>
                {isNonTeachingPerson(currentPerson) ? 'Schedule Administrative Duties' : 'Select a Schedule Block'}
              </div>
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                {isNonTeachingPerson(currentPerson)
                  ? 'Pick an Administrative Duty below, then click or drag empty time slots on the Gantt chart to assign.'
                  : 'Click any block on the Gantt chart or drag across empty time slots to create and edit.'}
              </div>
            </div>

            {isNonTeachingPerson(currentPerson) ? (
              /* Non-Teaching Personnel Sidebar: 6 Canonical DepEd Admin Tasks */
              <div style={{ borderTop: '1.5px solid var(--line)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '800', color: '#0284C7', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <FiBriefcase size={12} /> Administrative Tasks ({ADMIN_TASK_OPTIONS.length})
                  </div>
                  {pendingCreateSubject && (
                    <button
                      type="button"
                      onClick={() => setPendingCreateSubject(null)}
                      style={{ border: 'none', background: 'none', color: '#0284C7', fontSize: '10px', fontWeight: '800', cursor: 'pointer', padding: 0 }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {pendingCreateSubject ? (
                  <div style={{ fontSize: '10.5px', color: '#0284C7', fontWeight: '700', marginBottom: '8px' }}>
                    "{pendingCreateSubject}" selected — click or drag an empty slot on the Gantt chart to place it.
                  </div>
                ) : (
                  <div style={{ fontSize: '10.5px', color: '#64748B', marginBottom: '8px' }}>
                    Select a task preset below, then click or drag an empty slot on the Gantt chart (Target: 8.0 hrs/day • 40.0 hrs/wk).
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto' }}>
                  {ADMIN_TASK_OPTIONS.map((taskName) => {
                    const isSelected = pendingCreateSubject === taskName;
                    const cleanLabel = taskName.replace(/^ADMIN TASK\s*[\u2013\u2014-]\s*/i, '');
                    return (
                      <button
                        key={taskName}
                        type="button"
                        onClick={() => setPendingCreateSubject(isSelected ? null : taskName)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '2px',
                          textAlign: 'left',
                          fontSize: '11px',
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? 'white' : '#1E293B',
                          background: isSelected ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : '#F8FAFC',
                          border: isSelected ? '1.5px solid #0284C7' : '1px solid var(--line)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.25)' : 'none'
                        }}
                      >
                        <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', color: isSelected ? 'rgba(255,255,255,0.85)' : '#64748B', letterSpacing: '0.3px' }}>
                          ADMIN TASK
                        </span>
                        <span style={{ width: '100%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', lineHeight: '1.3' }}>
                          {cleanLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Teaching Personnel Sidebar */
              <>
                {/* 1. Organized Classes at This School (Filtered by Teacher's Assigned Grades) */}
                <div style={{ borderTop: '1.5px solid var(--line)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                      1. Organized Classes ({organizedClassesList.length}{teacherAssignedGrades.length > 0 ? ` for ${teacherAssignedGrades.join(', ')}` : ''})
                    </div>
                    {pendingCreateSection && (
                      <button
                        type="button"
                        onClick={() => setPendingCreateSection(null)}
                        style={{ border: 'none', background: 'none', color: '#0284C7', fontSize: '10px', fontWeight: '800', cursor: 'pointer', padding: 0 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {pendingCreateSection ? (
                    <div style={{ fontSize: '10.5px', color: '#0284C7', fontWeight: '700', marginBottom: '8px' }}>
                      "{pendingCreateSection.sectionName}" ({pendingCreateSection.gradeLevel}) selected — subjects below filtered. Click/drag an empty slot to place.
                    </div>
                  ) : (
                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '8px' }}>
                      {teacherAssignedGrades.length > 0
                        ? `Showing sections for ${currentPerson?.firstName || 'teacher'}'s assigned grades (${teacherAssignedGrades.join(', ')}).`
                        : `Pick a class/section first to automatically filter subjects below.`}
                    </div>
                  )}
                  {isPlottingLocked ? (
                    <div style={{ fontSize: "11px", color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "6px", padding: "8px" }}>{TEACHING_PLOT_LOCK_MESSAGE}</div>
                  ) : organizedClassesList.length === 0 ? (
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {teacherAssignedGrades.length > 0
                        ? `No organized classes match assigned grades (${teacherAssignedGrades.join(', ')}). Configure them in Organized Classes Setup.`
                        : `No organized classes configured yet. Set them up in Organized Classes Setup.`}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                      {organizedClassesList.map((sec) => {
                        const isSelected = pendingCreateSection?.sectionId === sec.id;
                        return (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => {
                              const nextSec = isSelected ? null : {
                                sectionId: sec.id,
                                sectionName: sec.sectionName,
                                gradeLevel: sec.gradeLevel,
                                category: sec.category
                              };
                              setPendingCreateSection(nextSec);
                              // If a subject was already picked but is NOT valid for this new section, clear it
                              if (nextSec && pendingCreateSubject) {
                                const categoryForGrade = (gradeLevel) => {
                                  const g = String(gradeLevel || '').toUpperCase();
                                  if (g.includes('11') || g.includes('12') || g.includes('SHS') || g.includes('SENIOR')) return 'SHS';
                                  if (g.includes('7') || g.includes('8') || g.includes('9') || g.includes('10') || g.includes('JHS') || g.includes('JUNIOR')) return 'JHS';
                                  return 'Elementary';
                                };
                                const validSubs = (getSubjectsForGrade(nextSec.gradeLevel, nextSec.category || categoryForGrade(nextSec.gradeLevel)) || []).map(s => String(s).toUpperCase().trim());
                                if (!validSubs.includes(String(pendingCreateSubject).toUpperCase().trim())) {
                                  setPendingCreateSubject(null);
                                }
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              textAlign: 'left',
                              fontSize: '11px',
                              fontWeight: isSelected ? '800' : '600',
                              color: isSelected ? 'white' : '#334155',
                              background: isSelected ? 'var(--blue)' : '#F8FAFC',
                              border: isSelected ? '1px solid var(--blue)' : '1px solid var(--line)',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              cursor: 'pointer'
                            }}
                          >
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.sectionName}</span>
                            <span style={{
                              fontSize: '8.5px',
                              fontWeight: '800',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: isSelected ? 'rgba(255,255,255,0.25)' : '#F0FDF4',
                              color: isSelected ? 'white' : '#15803D',
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}>
                              {sec.typeLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Subjects Taught (Filtered by Teacher's Assigned Grades / Selected Section) */}
                <div style={{ borderTop: '1.5px solid var(--line)', paddingTop: '12px', marginTop: '14px' }}>
                  {(() => {
                    const categoryForGrade = (gradeLevel) => {
                      const g = String(gradeLevel || '').toUpperCase();
                      if (g.includes('11') || g.includes('12') || g.includes('SHS') || g.includes('SENIOR')) return 'SHS';
                      if (g.includes('7') || g.includes('8') || g.includes('9') || g.includes('10') || g.includes('JHS') || g.includes('JUNIOR')) return 'JHS';
                      return 'Elementary';
                    };

                    let visibleSubjects = activeSchoolSubjects;
                    if (pendingCreateSection) {
                      const secGrade = pendingCreateSection.gradeLevel;
                      const secCat = pendingCreateSection.category || categoryForGrade(secGrade);
                      const validSubs = (getSubjectsForGrade(secGrade, secCat) || []).map(s => String(s).toUpperCase().trim());
                      visibleSubjects = activeSchoolSubjects.filter(({ name: subj }) => {
                        const u = String(subj).toUpperCase().trim();
                        return validSubs.includes(u) || validSubs.some(vs => vs.includes(u) || u.includes(vs));
                      });
                    } else if (teacherAssignedGrades && teacherAssignedGrades.length > 0) {
                      // Filter by teacher's assigned grade levels (e.g. Kinder, Grade 1, Grade 2)
                      const allowedSubjectSet = new Set();
                      teacherAssignedGrades.forEach(grade => {
                        const gUpper = String(grade || '').toUpperCase().trim();
                        let cat = 'Elementary';
                        if (gUpper.includes('11') || gUpper.includes('12') || gUpper.includes('SHS') || gUpper.includes('SENIOR')) cat = 'SHS';
                        else if (gUpper.includes('7') || gUpper.includes('8') || gUpper.includes('9') || gUpper.includes('10') || gUpper.includes('JHS') || gUpper.includes('JUNIOR')) cat = 'JHS';
                        
                        const subs = getSubjectsForGrade(grade, cat) || [];
                        subs.forEach(s => allowedSubjectSet.add(String(s).toUpperCase().trim()));
                      });

                      visibleSubjects = activeSchoolSubjects.filter(({ name: subj }) => {
                        const u = String(subj).toUpperCase().trim();
                        return allowedSubjectSet.has(u) || Array.from(allowedSubjectSet).some(vs => vs.includes(u) || u.includes(vs));
                      });
                    }

                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                            2. Subjects Taught {pendingCreateSection ? `(${visibleSubjects.length} for ${pendingCreateSection.sectionName})` : (teacherAssignedGrades && teacherAssignedGrades.length > 0 ? `(${visibleSubjects.length} for ${teacherAssignedGrades.join(', ')})` : `(${activeSchoolSubjects.length})`)}
                          </div>
                          {pendingCreateSubject && (
                            <button
                              type="button"
                              onClick={() => setPendingCreateSubject(null)}
                              style={{ border: 'none', background: 'none', color: '#0284C7', fontSize: '10px', fontWeight: '800', cursor: 'pointer', padding: 0 }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {pendingCreateSubject ? (
                          <div style={{ fontSize: '10.5px', color: '#0284C7', fontWeight: '700', marginBottom: '8px' }}>
                            "{pendingCreateSubject}" selected — click or drag an empty slot on the Gantt chart to place it.
                          </div>
                        ) : (
                          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '8px' }}>
                            {pendingCreateSection
                              ? `Pick a subject below for ${pendingCreateSection.sectionName}, then drag to place.`
                              : (teacherAssignedGrades && teacherAssignedGrades.length > 0
                                  ? `Showing subjects for ${currentPerson?.firstName || 'teacher'}'s assigned grades (${teacherAssignedGrades.join(', ')}).`
                                  : `Pick a class section above to filter subjects by grade level, or pick a subject directly.`)}
                          </div>
                        )}
                        {isPlottingLocked ? (
                          <div style={{ fontSize: "11px", color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "6px", padding: "8px" }}>{TEACHING_PLOT_LOCK_MESSAGE}</div>
                        ) : visibleSubjects.length === 0 ? (
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {activeSchoolSubjects.length === 0
                              ? 'No active subjects configured yet. Set them up in Curriculum & Subjects Taught.'
                              : (pendingCreateSection
                                  ? `No subjects available for ${pendingCreateSection.sectionName} (${pendingCreateSection.gradeLevel}).`
                                  : (teacherAssignedGrades && teacherAssignedGrades.length > 0
                                      ? `No subjects found for assigned grades (${teacherAssignedGrades.join(', ')}).`
                                      : 'No subjects available.'))}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                            {visibleSubjects.map(({ name: subj, tag }) => {
                              const isSelected = pendingCreateSubject === subj;
                              const isFixed40 = isMatatagFixed40Subject(subj);
                              return (
                                <button
                                  key={subj}
                                  type="button"
                                  onClick={() => setPendingCreateSubject(isSelected ? null : subj)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    textAlign: 'left',
                                    fontSize: '11px',
                                    fontWeight: isSelected ? '800' : '600',
                                    color: isSelected ? 'white' : '#334155',
                                    background: isSelected ? 'var(--blue)' : '#F8FAFC',
                                    border: isSelected ? '1px solid var(--blue)' : '1px solid var(--line)',
                                    borderRadius: '6px',
                                    padding: '6px 8px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subj}</span>
                                  {isFixed40 && (
                                    <span
                                      title="MATATAG Policy: locked to exactly 40 mins/day at Grade 1/2 (DepEd Order No. 12, s. 2024)"
                                      style={{
                                        fontSize: '8.5px',
                                        fontWeight: '800',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        background: isSelected ? 'rgba(255,255,255,0.25)' : '#FEF2F2',
                                        color: isSelected ? 'white' : '#DC2626',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                      }}
                                    >
                                      🔒 40m
                                    </span>
                                  )}
                                  {tag && (
                                    <span style={{
                                      fontSize: '8.5px',
                                      fontWeight: '800',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: isSelected ? 'rgba(255,255,255,0.25)' : '#eef2ff',
                                      color: isSelected ? 'white' : '#4338ca',
                                      whiteSpace: 'nowrap',
                                      flexShrink: 0
                                    }}>
                                      {tag}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* 3. Administrative Tasks (Canonical DepEd Tasks) */}
                <div style={{ borderTop: '1.5px solid var(--line)', paddingTop: '12px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <FiBriefcase size={12} /> 3. Administrative Tasks ({ADMIN_TASK_OPTIONS.length})
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                    {ADMIN_TASK_OPTIONS.map((taskName) => {
                      const isSelected = pendingCreateSubject === taskName;
                      const cleanLabel = taskName.replace(/^ADMIN TASK\s*[\u2013\u2014-]\s*/i, '');
                      return (
                        <button
                          key={taskName}
                          type="button"
                          onClick={() => {
                            setPendingCreateSection(null);
                            setPendingCreateSubject(isSelected ? null : taskName);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            textAlign: 'left',
                            fontSize: '11px',
                            fontWeight: isSelected ? '800' : '600',
                            color: isSelected ? 'white' : '#334155',
                            background: isSelected ? '#1E293B' : '#F8FAFC',
                            border: isSelected ? '1px solid #1E293B' : '1px solid var(--line)',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            cursor: 'pointer'
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanLabel}
                          </span>
                          <span style={{
                            fontSize: '8.5px',
                            fontWeight: '800',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                            color: isSelected ? 'white' : '#475569',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}>
                            Admin
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Block Inspector & Editor Drawer — floating, draggable overlay that appears only when a block is selected */}
      {selectedRow && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos ? `${panelPos.y}px` : '50%',
            left: panelPos ? `${panelPos.x}px` : '50%',
            right: 'auto',
            transform: panelPos ? 'none' : 'translate(-50%, -50%)',
            width: '340px',
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
            background: 'white',
            borderRadius: '14px',
            border: '1.5px solid var(--line)',
            padding: '16px',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            zIndex: 200
          }}
        >
          {/* Drag Handle / Title Bar */}
          <div
            onMouseDown={handlePanelDragStart}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '-4px',
              paddingBottom: '8px',
              borderBottom: '1px dashed var(--line)',
              cursor: 'grab',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }}>
              <FiMove size={13} /> Drag to move
            </div>
            <button
              type="button"
              onClick={() => setSelectedBlockIdx(null)}
              title="Close panel"
              style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <FiX size={13} />
            </button>
          </div>

          {(() => {
            const idx = selectedBlockIdx;
            const subUpper = String(selectedRow.subject || '').toUpperCase().trim();
            const gUpper = String(selectedRow.gradeLevel || '').toUpperCase();
            const secName = String(selectedRow.sectionName || '').toUpperCase();
            const currentSecId = String(selectedRow.sectionId || selectedRow.section_id || '');
            const currentSub = selectedRow.subject || selectedRow.subject_name || '';
            const linkedSec = (classSections || []).find(s => String(s.id) === currentSecId || (selectedRow.sectionName && s.sectionName === selectedRow.sectionName));

            const isRegLinked = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(linkedSec?.sectionType || '').toUpperCase().trim());

            const isSnedSec = !isRegLinked && Boolean(
              gUpper.includes('SNED') || gUpper.includes('NON-GRADED') || gUpper.includes('SPED') ||
              subUpper === 'SNED MODIFIED SUBJECT' || subUpper === 'SNED' || subUpper === 'SPED MODIFIED SUBJECTS' ||
              (linkedSec && (String(linkedSec.sectionType || '').toUpperCase().includes('SNED') || String(linkedSec.gradeLevel || '').toUpperCase().includes('SNED') || String(linkedSec.gradeLevel || '').toUpperCase().includes('NON-GRADED') || String(linkedSec.gradeLevel || '').toUpperCase().includes('SPED')))
            );

            const isAlsSec = !isRegLinked && Boolean(
              gUpper.includes('ALS') ||
              subUpper === 'ALS LEARNING STRAND' || subUpper === 'ALS' ||
              (linkedSec && (String(linkedSec.sectionType || '').toUpperCase().includes('ALS') || String(linkedSec.gradeLevel || '').toUpperCase().includes('ALS')))
            );

            const isAralSection = !isRegLinked && Boolean(
              (linkedSec && (
                String(linkedSec.sectionType || '').startsWith('ARAL') ||
                String(linkedSec.sectionType || '').toUpperCase().includes('ARAL') ||
                String(linkedSec.sectionName || '').toUpperCase().includes('ARAL') ||
                String(linkedSec.gradeLevel || '').toUpperCase().includes('ARAL') ||
                Boolean(linkedSec.aralBasis || linkedSec.aralToolKey || linkedSec.aralTool)
              )) ||
              isAralSubject(subUpper) || subUpper === 'ARAL TUTORING' || subUpper === 'ARAL' || (subUpper.startsWith('ARAL') && !subUpper.startsWith('ARALING'))
            );

            const isRemSec = !isRegLinked && Boolean(
              (linkedSec && (linkedSec.sectionType === 'REMEDIAL' || linkedSec.sectionType === 'ENRICHMENT'))
            );

            const isSpecialProgram = Boolean(
              isSnedSec ||
              isAralSection ||
              isRemSec ||
              subUpper === 'SNED MODIFIED SUBJECT' ||
              subUpper === 'SNED' ||
              subUpper === 'ARAL TUTORING' ||
              subUpper === 'ARAL' ||
              subUpper === 'REMEDIATION' ||
              subUpper === 'ENRICHMENT'
            );
            const isAdvisoryOrHgp = Boolean(subUpper === 'ADVISORY' || subUpper === 'HGP' || subUpper.includes('HOMEROOM GUIDANCE'));
            const isLockedSectionAndSubject = isSpecialProgram || isAdvisoryOrHgp;
            const isLockedSub = isAdvisoryOrHgp;

            const durationErr = getRowDurationError(selectedRow);
            const matatagWarn = getMatatagRowWarning(selectedRow);
            const duplicateSubErr = getDuplicateSectionSubjectError(selectedRow, selectedRow);
            const hgpWeeklyErr = getHgpWeeklyError(selectedRow);
            const hasConflict = rawRows.some((otherRow, otherIdx) => {
              if (idx === otherIdx) return false;
              if (selectedRow.id && otherRow.id && String(selectedRow.id) === String(otherRow.id)) return false;
              if ((otherRow.term || '1st') !== (selectedRow.term || '1st')) return false;
              if (!selectedRow.startTime || !selectedRow.endTime || !otherRow.startTime || !otherRow.endTime) return false;
              const selDays = getNormalizedRowDays(selectedRow);
              const otherDays = getNormalizedRowDays(otherRow);
              const daysOverlap = selDays.some(d => otherDays.includes(d));
              if (!daysOverlap) return false;
              const ns = parseMins(selectedRow.startTime), ne = parseMins(selectedRow.endTime);
              const rs = parseMins(otherRow.startTime), re = parseMins(otherRow.endTime);
              if (ns >= 99999 || ne >= 99999 || rs >= 99999 || re >= 99999) return false;
              if (ns >= ne || rs >= re) return false;
              if (ns < re && ne > rs) {
                if (isAdvisoryOrHgpPair(selectedRow, otherRow)) return false;
                if (isPerGradeSharedSlot(selectedRow, otherRow)) return false; // multigrade: different grade levels run side by side
                return true;
              }
              return false;
            });
            const hasCrossSchoolConflict = checkCrossSchoolConflict(selectedRow, sharedWorkloadRows, 120);

            const isShsCategory = isSHSRow(selectedRow) || (selectedRow.gradeLevel && (String(selectedRow.gradeLevel).includes('11') || String(selectedRow.gradeLevel).includes('12') || String(selectedRow.gradeLevel).toUpperCase().includes('SHS')));
            const effectiveCategory = isShsCategory ? (selectedRow.category && selectedRow.category.includes('SHS') ? selectedRow.category : 'SHS-CORE SUBJECTS') : (selectedRow.category || 'Elementary');

            const effectiveSubjectVal = isSnedSec
              ? 'SNED MODIFIED SUBJECT'
              : (isAlsSec
                ? 'ALS LEARNING STRAND'
                : (isAralSection
                  ? (currentSub || 'ARAL TUTORING')
                  : (isRemSec
                    ? (currentSub || (linkedSec?.sectionType === 'ENRICHMENT' ? 'ENRICHMENT' : 'REMEDIATION'))
                    : currentSub)));

            const displayHeaderTitle = effectiveSubjectVal || 'Edit Schedule Slot';

            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--line)', paddingBottom: '10px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                      {displayHeaderTitle} {isLockedSectionAndSubject && <FiLock size={13} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />}
                    </h4>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Block Inspector & Settings</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {String(selectedRow?.subject || '').toUpperCase().trim() === 'ADVISORY' ? (
                      <button
                        type="button"
                        onClick={handleDuplicateAdvisorySlot}
                        style={{
                          background: '#EFF6FF',
                          color: '#1D4ED8',
                          border: '1px solid #BFDBFE',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Duplicate this Advisory slot (e.g. for a 2nd 30-min afternoon advisory session)"
                      >
                        <FiCopy size={12} /> Duplicate Advisory (30m)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCopySelectedSection}
                        style={{
                          background: '#EFF6FF',
                          color: '#1D4ED8',
                          border: '1px solid #BFDBFE',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Copy Section Only (Ctrl+C)"
                      >
                        <FiCopy size={12} /> Copy Section
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title="Remove Block (Delete)"
                    >
                      <FiTrash2 size={12} /> Delete
                    </button>
                  </div>
                </div>

                {/* Validation Warnings Callout */}
                {(hasConflict || hasCrossSchoolConflict || !!durationErr || !!duplicateSubErr || !!hgpWeeklyErr || !!matatagWarn) && (
                  <div style={{ background: (hasConflict || hasCrossSchoolConflict || !!durationErr || !!duplicateSubErr || !!hgpWeeklyErr || (matatagWarn && matatagWarn.type === 'error')) ? '#FEF2F2' : '#FFFBEB', color: (hasConflict || hasCrossSchoolConflict || !!durationErr || !!duplicateSubErr || !!hgpWeeklyErr || (matatagWarn && matatagWarn.type === 'error')) ? '#991B1B' : '#92400E', padding: '10px 12px', borderRadius: '8px', border: `1.5px solid ${(hasConflict || hasCrossSchoolConflict || !!durationErr || !!duplicateSubErr || !!hgpWeeklyErr || (matatagWarn && matatagWarn.type === 'error')) ? '#FCA5A5' : '#FCD34D'}`, fontSize: '11px', fontWeight: '700', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {hasConflict && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertCircle size={14} color="#EF4444" /> Schedule Overlap Conflict: Overlaps with another subject or task on selected days.</div>}
                    {hasCrossSchoolConflict && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertCircle size={14} color="#EF4444" /> Cross-School Conflict: Overlaps with partner station's schedule or transit lockout (≤2h gap).</div>}
                    {durationErr && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertCircle size={14} color="#EF4444" /> {durationErr}</div>}
                    {duplicateSubErr && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertCircle size={14} color="#EF4444" /> {duplicateSubErr}</div>}
                    {hgpWeeklyErr && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertCircle size={14} color="#EF4444" /> {hgpWeeklyErr}</div>}
                    {matatagWarn && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertTriangle size={14} color={matatagWarn.type === 'error' ? '#EF4444' : '#F59E0B'} /> {matatagWarn.message}</div>}
                  </div>
                )}

                {/* 1. Class Section & Subject (for Teaching) vs Administrative Task Type (for Non-Teaching / Admin Tasks) */}
                {(() => {
                  const isRowAdmin = isAdminTaskRow(selectedRow) || isNonTeachingPerson(currentPerson);
                  if (isRowAdmin) {
                    const currentVal = selectedRow.subject || ADMIN_TASK_OPTIONS[0];
                    const adminOptions = ADMIN_TASK_OPTIONS.map(opt => ({
                      value: opt,
                      label: opt
                    }));
                    if (currentVal && !ADMIN_TASK_OPTIONS.includes(currentVal)) {
                      adminOptions.unshift({ value: currentVal, label: currentVal });
                    }

                    return (
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <FiBriefcase size={12} color="#0284C7" /> Administrative Task Type <span title="Required" style={{ color: '#DC2626' }}>*</span>
                        </label>
                        <SearchableSelect
                          value={currentVal}
                          onChange={(e) => {
                            recordUndoSnapshot();
                            updateWorkloadRowWithHistory(idx, {
                              subject: e.target.value,
                              sectionId: '',
                              sectionName: '',
                              gradeLevel: '',
                              category: ''
                            });
                          }}
                          options={adminOptions}
                          placeholder="Select Administrative Task..."
                        />
                        <div style={{ fontSize: '9.5px', color: '#0284C7', fontWeight: '600', marginTop: '4px' }}>
                          Official DepEd Non-Teaching / Ancillary Duty (No class section required)
                        </div>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* 1. Class Section & Grade Level Select (FIRST - Filtered by Teacher's Assigned Grades) */}
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: !selectedRow.gradeLevel ? '#DC2626' : '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Class Section &amp; Grade Level {!selectedRow.gradeLevel && <span title="Required">*</span>}
                        </label>
                        {(() => {
                          const teacherId = currentPerson?.id || dbPerson?.id || null;
                          const teacherName = `${currentPerson?.firstName || dbPerson?.firstName || ''} ${currentPerson?.lastName || dbPerson?.lastName || ''}`.trim();
                          let matchingSections = (classSections || []).filter(s => isSectionMatchingTeacherGrades(s, teacherAssignedGrades, teacherId, teacherName));
                          const matchedSec = matchSectionForWorkloadRow(selectedRow, classSections);
                          let currentSecId = String(selectedRow.sectionId || selectedRow.section_id || matchedSec?.id || '');
                          if (currentSecId && !matchingSections.some(s => String(s.id) === currentSecId)) {
                            const matchInAll = (classSections || []).find(s => String(s.id) === currentSecId);
                            if (matchInAll) matchingSections.push(matchInAll);
                          }

                          // If no section matched filter or if assigned grades empty, show all classSections so teacher is never blocked
                          if (matchingSections.length === 0) {
                            matchingSections = classSections || [];
                          }

                          const sectionOptions = matchingSections.map(s => {
                            const trackInfo = s.trackStrand ? ` - ${s.trackStrand}` : '';
                            return {
                              value: String(s.id),
                              label: `${s.sectionName || s.section_name || 'Section'} (${s.gradeLevel || s.grade_level || 'Grade'}${trackInfo})`
                            };
                          });

                          // Fallback: If selectedRow has a sectionName but is not in classSections yet, add it so the dropdown is never blank!
                          const existingSecName = selectedRow.sectionName || selectedRow.section_name || matchedSec?.sectionName || '';
                          if (existingSecName && !currentSecId) {
                            const fallbackSecId = `sec-custom-${existingSecName.toLowerCase().replace(/\s+/g, '-')}`;
                            currentSecId = fallbackSecId;
                            if (!sectionOptions.some(opt => String(opt.value) === String(fallbackSecId))) {
                              sectionOptions.unshift({
                                value: fallbackSecId,
                                label: `${existingSecName} (${selectedRow.gradeLevel || matchedSec?.gradeLevel || 'Grade 11'})`
                              });
                            }
                          }

                          return (
                            <SearchableSelect
                              disabled={isLockedSectionAndSubject}
                              value={currentSecId}
                              onChange={(e) => {
                                recordUndoSnapshot();
                                handleSectionChangeForRow(idx, e.target.value);
                              }}
                              options={sectionOptions}
                              placeholder={sectionOptions.length === 0 ? "No sections configured in Organized Classes…" : "Select section…"}
                            />
                          );
                        })()}
                        {!selectedRow.gradeLevel && (
                          <div style={{ fontSize: '10px', color: '#DC2626', fontWeight: '700', marginTop: '4px' }}>Required — select a class section to set the grade level.</div>
                        )}
                        {teacherAssignedGrades && teacherAssignedGrades.length > 0 && (
                          <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '3px' }}>
                            Filtered by teacher's assigned grades ({teacherAssignedGrades.join(', ')})
                          </div>
                        )}
                      </div>

                      {/* Multigrade: each grade level of the section can carry its own subject */}
                      {isRegLinked && classifySection(linkedSec).isMultigrade && (
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: !selectedRow.subjectGradeLevel ? '#DC2626' : '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                            Grade Level of this Subject {!selectedRow.subjectGradeLevel && <span title="Required">*</span>}
                          </label>
                          <SearchableSelect
                            value={selectedRow.subjectGradeLevel || ''}
                            onChange={(e) => {
                              recordUndoSnapshot();
                              updateWorkloadRowWithHistory(idx, { subjectGradeLevel: e.target.value });
                            }}
                            options={splitSectionGrades(selectedRow.gradeLevel).map(g => ({ value: g, label: g }))}
                            placeholder="Select the grade level this subject is for…"
                          />
                          <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '3px' }}>
                            Different grade levels in this multigrade section may have different subjects at the same time.
                          </div>
                        </div>
                      )}

                      {/* SHS Category Selector if SHS Section or SHS Row */}
                      {isShsCategory && (
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#15803D', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiBook size={12} color="#16A34A" /> SHS Learning Category
                          </label>
                          <SearchableSelect
                            disabled={isLockedSectionAndSubject}
                            value={selectedRow.category || 'SHS-CORE SUBJECTS'}
                            onChange={(e) => {
                              const newCat = e.target.value;
                              const newSubjects = getSubjectsForGrade(selectedRow.gradeLevel || 'Grade 11', newCat);
                              updateWorkloadRowWithHistory(idx, {
                                category: newCat,
                                subject: (newSubjects || []).includes(selectedRow.subject) ? selectedRow.subject : ''
                              });
                            }}
                            options={[
                              { value: 'SHS-CORE SUBJECTS', label: 'SHS-CORE SUBJECTS' },
                              { value: 'SHS-APPLIED SUBJECTS', label: 'SHS-APPLIED SUBJECTS' },
                              { value: 'SHS-SPECIALIZED SUBJECTS', label: 'SHS-SPECIALIZED SUBJECTS' },
                              { value: 'SSHS-CORE', label: 'SSHS-CORE' },
                              { value: 'SSHS-ACADEMIC', label: 'SSHS-ACADEMIC' },
                              { value: 'SSHS-TECHPRO', label: 'SSHS-TECHPRO' },
                              { value: 'SHS', label: 'SHS (ALL SUBJECTS)' }
                            ]}
                            placeholder="Select SHS category…"
                          />
                        </div>
                      )}

                      {/* 2. Subject Select (SECOND - Disabled until Section is chosen, Filtered by Selected Section's Grade Level) */}
                      <div>
                        <label style={{
                          fontSize: '10px',
                          fontWeight: '800',
                          color: (!selectedRow.sectionId || !selectedRow.gradeLevel) ? '#94A3B8' : (!effectiveSubjectVal ? '#DC2626' : '#64748b'),
                          textTransform: 'uppercase',
                          marginBottom: '4px',
                          display: 'block'
                        }}>
                          Subject {!effectiveSubjectVal && (selectedRow.sectionId && selectedRow.gradeLevel) && <span title="Required">*</span>}
                        </label>
                        {(() => {
                          const isSectionSelected = Boolean(selectedRow.sectionId && selectedRow.gradeLevel);
                          const subjectList = (() => {
                            if (!isSectionSelected) return [];
                            if (isSnedSec) {
                              return ['SNED MODIFIED SUBJECT'];
                            }
                            if (isAlsSec) {
                              return [
                                'LS 1: Communication Skills',
                                'LS 2: Scientific Literacy and Critical Thinking',
                                'LS 3: Mathematical and Problem Solving Skills',
                                'LS 4: Life and Career Skills',
                                'LS 5: Understanding the Self and Society',
                                'LS 6: Digital Citizenship'
                              ];
                            }
                            if (isAralSection) {
                              return ['ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'];
                            }
                            if (isRemSec) {
                              return [linkedSec?.sectionType === 'ENRICHMENT' ? 'ENRICHMENT' : 'REMEDIATION'];
                            }
                            let rawList = [];
                            if (selectedRow.gradeLevel) {
                              rawList = getSubjectsForGrade(selectedRow.subjectGradeLevel || selectedRow.gradeLevel, effectiveCategory);
                            } else {
                              rawList = activeSchoolSubjects && activeSchoolSubjects.length > 0
                                ? activeSchoolSubjects.map(s => s.name)
                                : SUBJECT_OPTIONS;
                            }
                            return (rawList || []).filter(s => !isAralSubject(s) && s !== 'ADVISORY' && s !== 'HGP');
                          })();

                          const isCustom = effectiveSubjectVal && !subjectList.includes(effectiveSubjectVal) && !isSnedSec && !isAlsSec && !isAralSection && !isRemSec && effectiveSubjectVal !== 'ADVISORY' && effectiveSubjectVal !== 'HGP';
                          const subjectOptions = [
                            ...(isLockedSectionAndSubject && effectiveSubjectVal === 'ADVISORY' ? [{ value: 'ADVISORY', label: 'ADVISORY', disabled: false }] : []),
                            ...(isLockedSectionAndSubject && effectiveSubjectVal === 'HGP' ? [{ value: 'HGP', label: 'HGP', disabled: false }] : []),
                            ...(isLockedSectionAndSubject && (isSnedSec || subUpper.includes('SNED')) ? [{ value: 'SNED MODIFIED SUBJECT', label: 'SNED MODIFIED SUBJECT', disabled: false }] : []),
                            ...(isLockedSectionAndSubject && (isAralSection || (subUpper.includes('ARAL') && !subUpper.startsWith('ARALING'))) ? [{ value: effectiveSubjectVal || 'ARAL TUTORING', label: effectiveSubjectVal || 'ARAL TUTORING', disabled: false }] : []),
                            ...(isLockedSectionAndSubject && (isRemSec || subUpper.includes('REMEDIAL') || subUpper.includes('ENRICHMENT') || subUpper === 'REMEDIATION') ? [{ value: effectiveSubjectVal || 'REMEDIATION', label: effectiveSubjectVal || 'REMEDIATION', disabled: false }] : []),
                            ...(isCustom ? [{ value: effectiveSubjectVal, label: effectiveSubjectVal, disabled: false }] : []),
                            ...subjectList.map(sub => {
                              const isSelfCurrent = (sub === effectiveSubjectVal);
                              const otherTeacherAssignment = !isSelfCurrent ? getSubjectAssignmentForSection(currentSecId, selectedRow.sectionName, sub, isSHSRow(selectedRow) ? (selectedRow.term || '1st') : null, idx, selectedRow.gradeLevel, selectedRow.subjectGradeLevel) : null;

                              if (otherTeacherAssignment && otherTeacherAssignment.assigned && otherTeacherAssignment.isOtherTeacher) {
                                return { value: sub, label: `${sub} (${otherTeacherAssignment.teacherName})`, disabled: false };
                              }

                              return { value: sub, label: sub, disabled: false };
                            })
                          ];

                          return (
                            <SearchableSelect
                              disabled={!isSectionSelected || isLockedSectionAndSubject}
                              value={effectiveSubjectVal}
                              onChange={(e) => updateWorkloadRowWithHistory(idx, { subject: e.target.value })}
                              options={subjectOptions}
                              placeholder={!isSectionSelected ? "Select class section above first…" : "Select subject…"}
                            />
                          );
                        })()}
                        {!effectiveSubjectVal && (
                          <div style={{ fontSize: '10px', color: (!selectedRow.sectionId || !selectedRow.gradeLevel) ? '#94A3B8' : '#DC2626', fontWeight: '700', marginTop: '4px' }}>
                            {!selectedRow.gradeLevel ? 'Please select a class section above to filter available subjects.' : 'Required — select the subject for this block.'}
                          </div>
                        )}
                      </div>

                      {/* Remediation / Enrichment Focus Subject Selector */}
                      {isRemSec && (
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#78350F', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiBookOpen size={12} color="#78350F" /> Remediation Focus Subject
                          </label>
                          <SearchableSelect
                            value={selectedRow.remediationSubject || ''}
                            onChange={(e) => {
                              updateWorkloadRowWithHistory(idx, {
                                remediationSubject: e.target.value
                              });
                            }}
                            options={(getSubjectsForGrade(selectedRow.gradeLevel || 'Grade 2', selectedRow.category || 'Elementary') || [])
                              .filter(s => !isAralSubject(s) && s !== 'ADVISORY' && s !== 'HGP')
                              .map(s => ({ value: s, label: s }))}
                            placeholder="Select Focus Subject (e.g. English, Math, Filipino)…"
                          />
                          <div style={{ fontSize: '9.5px', color: '#78350F', opacity: 0.8, marginTop: '3px' }}>
                            Specific subject or learning area covered during remediation
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Usual Days Toggles */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', margin: 0 }}>Usual Days</label>
                    <button
                      type="button"
                      onClick={() => {
                        updateWorkloadRowWithHistory(idx, { days: ['M', 'T', 'W', 'TH', 'F'] });
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: '800',
                        borderRadius: '5px',
                        border: '1px solid #93C5FD',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Set days to Monday through Friday"
                    >
                      <FiClock size={10} /> Mon – Fri (M-F)
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN'].map(dayCode => {
                      const rowDays = getNormalizedRowDays(selectedRow);
                      const isSel = rowDays.includes(dayCode);
                      return (
                        <button
                          key={dayCode}
                          type="button"
                          onClick={() => {
                            const newDays = isSel ? rowDays.filter(d => d !== dayCode) : [...rowDays, dayCode];
                            updateWorkloadRowWithHistory(idx, { days: newDays });
                          }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '800',
                            borderRadius: '6px',
                            border: 'none',
                            background: isSel ? 'var(--navy)' : '#F1F5F9',
                            color: isSel ? 'white' : '#64748b',
                            cursor: 'pointer'
                          }}
                        >
                          {dayCode}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Range Pickers */}
                {(() => {
                  const fixedDurationMins = typeof getMatatagFixedDurationMins === 'function' ? getMatatagFixedDurationMins(selectedRow) : null;
                  const isFixedDuration = fixedDurationMins != null;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Start Time</label>
                        <input
                          type="time"
                          value={selectedRow.startTime || '07:30'}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            updateWorkloadRowWithHistory(idx, { startTime: newStart });
                          }}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid var(--line)', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>
                          End Time
                          {isFixedDuration && <span style={{ textTransform: 'none', fontWeight: 'normal', color: '#0284c7' }}> (MATATAG Standard: {fixedDurationMins}m total)</span>}
                        </label>
                        <input
                          type="time"
                          value={selectedRow.endTime || '08:30'}
                          onChange={(e) => updateWorkloadRowWithHistory(idx, { endTime: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white' }}
                        />
                        {isFixedDuration && (
                          <div style={{ fontSize: '10px', color: '#0284C7', fontWeight: '600', marginTop: '4px' }}>
                            MATATAG Standard: {selectedRow.subject} is {fixedDurationMins} mins/day total under DO 12, s. 2024. Split sessions are supported.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}


// ── WORKLOAD ERROR BOUNDARY ──
class WorkloadErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    reportError(error, {
      title: 'Workload Screen Crashed',
      action: 'Rendering Workload Timetable & Teacher View',
      handler: (errorInfo?.componentStack ? errorInfo.componentStack.split('\n').map(s => s.trim()).filter(Boolean)[0] : '') || 'Workload',
      source: 'Workload React Render Error'
    });
  }

  handleCopyDetails = async () => {
    const { error, errorInfo } = this.state;
    const text = [
      'InsightED eSF7 - Workload Render Error Details',
      `Time: ${new Date().toISOString()}`,
      `Error: ${error?.name || 'Error'}: ${error?.message || 'Unknown error'}`,
      `Component Stack:`,
      errorInfo?.componentStack || '(no component stack)',
      '',
      `Error Stack:`,
      error?.stack || '(no error stack)'
    ].join('\n');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2500);
        return;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch (e) {}
  };

  handleReset = () => {
    this.setState({ error: null, errorInfo: null, copied: false });
  };

  render() {
    if (this.state.error) {
      const err = this.state.error;
      const stack = this.state.errorInfo?.componentStack || err.stack || '';
      return (
        <div style={{ padding: '32px 24px', maxWidth: '840px', margin: '40px auto' }}>
          <div
            role="alert"
            style={{
              background: '#FFFBEB',
              border: '1.5px solid #FCD34D',
              borderRadius: '16px',
              padding: '28px 32px',
              boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.1), 0 8px 10px -6px rgba(245, 158, 11, 0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FiAlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#78350F' }}>
                  Workload View Encountered an Error
                </h3>
                <p style={{ margin: 0, fontSize: '13.5px', color: '#92400E', lineHeight: 1.5 }}>
                  The workload view crashed while rendering. Your saved timetable data is preserved. Exact technical details were captured and sent to the global alert dialog.
                </p>
              </div>
            </div>

            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '20px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '12px',
              color: '#0F172A',
              overflowX: 'auto',
              maxHeight: '220px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              <strong style={{ color: '#DC2626', display: 'block', marginBottom: '6px' }}>
                {err.name || 'Error'}: {err.message || 'Unknown render error'}
              </strong>
              {stack && (
                <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.45 }}>
                  {stack.slice(0, 1500)}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  background: '#0284C7',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FiRotateCcw size={14} /> Try Again
              </button>
              <button
                type="button"
                onClick={this.handleCopyDetails}
                style={{
                  background: this.state.copied ? '#15803D' : '#FFFFFF',
                  color: this.state.copied ? '#FFFFFF' : '#334155',
                  border: '1.5px solid',
                  borderColor: this.state.copied ? '#15803D' : '#CBD5E1',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <FiCopy size={14} /> {this.state.copied ? 'Copied ✓' : 'Copy Details'}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  background: '#F1F5F9',
                  color: '#475569',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function WorkloadInner() {
  const {
    personnel,
    setPersonnel,
    activePersonnelId,
    setActivePersonnelId,
    updatePersonnelInfo,
    savePersonnelChanges,
    classSections,
    schoolInfo,
    workloadTransfers,
    addWorkloadTransfer,
    removeWorkloadTransfer,
    showToast,
    showAlert,
    showConfirm,
    workImmersionSchedulesMap,
    fetchWorkImmersionSchedules,
    saveWorkImmersionSchedules,
    activeTerm,
    setActiveTerm,
    setHasUnsavedChanges,
    termStatuses,
    isTermLocked,
    unlockTerm,
    lockTerm,
    copyTermData,
    completeNode,
    setActiveView,
    registerAutoSaveHandler,
    incomingRequests,
    outgoingRequests,
    requestHistory,
    refreshRequests,
    allowancesMap,
    fetchAllowances,
    toggleAllowance,
    setAllowanceDisabled,
    currentSchoolYear
  } = useApp();



  // Term Unlock / Copy Modal state
  const [showUnlockTermModal, setShowUnlockTermModal] = useState(null);

  // Id of the workload row that was just added (set by handleAddWorkloadRow).
  const [, setNewlyAddedWorkloadId] = useState(null);

  // Clustered Personnel Ghost Sync State
  const [sharedWorkloadRows, setSharedWorkloadRows] = useState([]);

  // SHS Term Workload state
  const [selectedShsTerm, setSelectedShsTerm] = useState('1st');
  const [shsWorkloadMap, setShsWorkloadMap] = useState({}); // { [personId]: { '1st': [], '2nd': [], '3rd': [] } }

  useEffect(() => {
    if (activePersonnelId) {
      api.getShsWorkloads(activePersonnelId)
        .then(res => {
          if (res && res.success && Array.isArray(res.data)) {
            const grouped = { '1st': [], '2nd': [], '3rd': [] };
            res.data.forEach(r => {
              if (grouped[r.term]) grouped[r.term].push(r);
              else grouped['1st'].push(r);
            });
            setShsWorkloadMap(prev => ({
              ...prev,
              [activePersonnelId]: grouped
            }));
          }
        })
        .catch(err => console.error("Error fetching SHS workloads:", err));
    }
  }, [activePersonnelId]);

  // Helper to expand high-level offerings like SHS into the subcategories expected by Workload builder
  const getExpandedOfferings = () => {
    const raw = Array.isArray(schoolInfo?.curricularOffering) && schoolInfo.curricularOffering.length > 0
      ? schoolInfo.curricularOffering
      : ['Elementary', 'JHS', 'SHS'];
    const expanded = [...raw];
    if (expanded.includes('SHS')) {
      const shsSubCategories = ['SHS-CORE SUBJECTS', 'SHS-APPLIED SUBJECTS', 'SHS-SPECIALIZED SUBJECTS', 'SSHS-CORE', 'SSHS-ACADEMIC', 'SSHS-TECHPRO'];
      shsSubCategories.forEach(cat => {
        if (!expanded.includes(cat)) {
          expanded.push(cat);
        }
      });
    }
    return expanded;
  };

  // Form states for Workload Transfer
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [substituteTeacherId, setSubstituteTeacherId] = useState('');
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');
  const [selectedWorkloadIndexes, setSelectedWorkloadIndexes] = useState([]);

  // By-Section view state
  const [workloadView, setWorkloadView] = useState('by-personnel');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');
  const [sectionGradeFilter, setSectionGradeFilter] = useState('all');
  const [sectionViewMode, setSectionViewMode] = useState('timetable'); // 'timetable' | 'matrix'
  const [showAddSectionSlotModal, setShowAddSectionSlotModal] = useState(false);
  const [newSlot, setNewSlot] = useState({ teacherId: '', subject: '', remediationSubject: '', startTime: '08:00', endTime: '09:00', days: ['M', 'T', 'W', 'TH', 'F'] });
  const [slotConflict, setSlotConflict] = useState(null);

  useEffect(() => {
    if (workloadView === 'by-section' && !selectedSectionId && classSections && classSections.length > 0) {
      setSelectedSectionId(classSections[0].id);
    }
  }, [workloadView, selectedSectionId, classSections]);

  // Timetable Schedule Verification State & Modal
  const [showAttentionModal, setShowAttentionModal] = useState(false);
  const verifiedModalDismissedMap = useRef({});

  // Multi-Date Calendar Selector Modal State
  const [calendarModalConfig, setCalendarModalConfig] = useState(null); // { category, taskIdx, taskName }
  const [calendarSelectedDates, setCalendarSelectedDates] = useState([]); // Array of 'YYYY-MM-DD'
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth()); // 0-indexed
  const [calendarStartTime, setCalendarStartTime] = useState('08:00');
  const [calendarEndTime, setCalendarEndTime] = useState('17:00');

  const openCalendarModal = (category, taskIdx, task) => {
    const existingDates = (task.dates || []).map(d => d.date).filter(Boolean);
    const firstStartTime = task.dates?.[0]?.startTime || '08:00';
    const firstEndTime = task.dates?.[0]?.endTime || '17:00';

    setCalendarModalConfig({ category, taskIdx, taskName: task.task || 'Task' });
    setCalendarSelectedDates(existingDates);
    setCalendarStartTime(firstStartTime);
    setCalendarEndTime(firstEndTime);

    if (existingDates.length > 0) {
      const parts = existingDates[0].split('-');
      if (parts.length === 3) {
        setCalendarYear(parseInt(parts[0], 10));
        setCalendarMonth(parseInt(parts[1], 10) - 1);
      }
    } else {
      setCalendarYear(new Date().getFullYear());
      setCalendarMonth(new Date().getMonth());
    }
  };

  const handleApplyCalendarDates = () => {
    if (!calendarModalConfig) return;
    const { category, taskIdx } = calendarModalConfig;

    const newDates = calendarSelectedDates.map(dStr => ({
      date: dStr,
      startTime: calendarStartTime,
      endTime: calendarEndTime
    }));

    if (newDates.length === 0) {
      newDates.push({ date: '', startTime: calendarStartTime, endTime: calendarEndTime });
    }

    updateTaskField(category, taskIdx, 'dates', newDates);
    const appliedName = calendarModalConfig.taskName;
    const count = calendarSelectedDates.length;
    setCalendarModalConfig(null);
    if (showToast) showToast(`Applied ${count} selected date(s) to ${appliedName}!`);
  };

  const toggleCalendarDate = (dStr) => {
    setCalendarSelectedDates(prev => {
      if (prev.includes(dStr)) {
        return prev.filter(x => x !== dStr);
      } else {
        return [...prev, dStr];
      }
    });
  };

  const handleSelectAllWeekdaysInMonth = () => {
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const newDates = [...calendarSelectedDates];

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(calendarYear, calendarMonth, day);
      const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const mm = String(calendarMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dStr = `${calendarYear}-${mm}-${dd}`;
        if (!newDates.includes(dStr)) {
          newDates.push(dStr);
        }
      }
    }
    setCalendarSelectedDates(newDates);
  };

  const handleToggleSpecificDayOfWeek = (targetDayOfWeek) => {
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const monthDayStrings = [];

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(calendarYear, calendarMonth, day);
      if (d.getDay() === targetDayOfWeek) {
        const mm = String(calendarMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        monthDayStrings.push(`${calendarYear}-${mm}-${dd}`);
      }
    }

    const allAlreadySelected = monthDayStrings.length > 0 && monthDayStrings.every(dStr => calendarSelectedDates.includes(dStr));

    if (allAlreadySelected) {
      setCalendarSelectedDates(prev => prev.filter(dStr => !monthDayStrings.includes(dStr)));
    } else {
      setCalendarSelectedDates(prev => {
        const set = new Set([...prev, ...monthDayStrings]);
        return Array.from(set);
      });
    }
  };

  const handleVerifySchedule = (personId) => {
    if (!personId) return;

    // 1. Update AppContext React state
    setPersonnel(prev => (Array.isArray(prev) ? prev : []).map(p => {
      if (p.id === personId) {
        return { ...p, workloadVerified: true, needsTimeReview: false };
      }
      return p;
    }));

    // 2. Update active editPerson state in Workload component
    setEditPerson(prev => {
      if (prev && prev.id === personId) {
        return { ...prev, workloadVerified: true, needsTimeReview: false };
      }
      return prev;
    });

    // 3. Update localStorage draft if present
    const draftKey = `draft_workload_${personId}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed) {
          localStorage.setItem(draftKey, JSON.stringify({ ...parsed, workloadVerified: true, needsTimeReview: false }));
        }
      } catch (e) {}
    }

    verifiedModalDismissedMap.current[personId] = true;
    setShowAttentionModal(false);
    if (showToast) showToast("Timetable schedule confirmed and saved!");
  };

  const handleConfirmAllAndSave = async () => {
    let confirmedCount = 0;
    const errorTeachers = [];
    const failedSaveTeachers = [];
    const updatedPersonnelList = [];

    for (const p of (personnel || [])) {
      const draftKey = `draft_workload_${p.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let tRows = p.workloadRows || [];
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed && Array.isArray(parsed.workloadRows)) {
            tRows = parsed.workloadRows;
          } else if (Array.isArray(parsed)) {
            tRows = parsed;
          }
        } catch (e) {}
      }

      // Check if this teacher has duration or overlap blocking errors (term-isolated)
      const hasErrors = tRows.some((r, rIdx) => {
        if (getRowDurationError(r)) return true;
        const rTerm = r.term || '1st';
        const rDays = getNormalizedRowDays(r);
        return tRows.some((otherR, oIdx) => {
          if (rIdx === oIdx) return false;
          if (r.id && otherR.id && String(r.id) === String(otherR.id)) return false;
          if ((otherR.term || '1st') !== rTerm) return false; // Term isolation
          if (!r.startTime || !r.endTime || !otherR.startTime || !otherR.endTime) return false;
          const otherDays = getNormalizedRowDays(otherR);
          const daysOverlap = rDays.some(d => otherDays.includes(d));
          if (!daysOverlap) return false;
          const ns = parseMins(r.startTime), ne = parseMins(r.endTime);
          const rs = parseMins(otherR.startTime), re = parseMins(otherR.endTime);
          if (ns < re && ne > rs) {
            if (isAdvisoryOrHgpPair(r, otherR)) return false;
            return true;
          }
          return false;
        });
      });

      if (hasErrors) {
        errorTeachers.push(`${p.lastName || 'Teacher'}, ${p.firstName || ''}`);
        updatedPersonnelList.push(p);
        continue;
      }

      const updatedP = {
        ...p,
        workloadRows: tRows,
        workloadVerified: true,
        needsTimeReview: false
      };

      // Persist to PostgreSQL esf7_workload_rows first!
      try {
        const res = await persistWorkloadToServer(updatedP);
        const { person: fullySaved } = commitConfirmedSave(updatedP, res);

        confirmedCount++;
        updatedPersonnelList.push(fullySaved);

        if (savePersonnelChanges) {
          await savePersonnelChanges(p.id, fullySaved, { skipWorkloadSync: true, skipApiUpdate: true });
        }
      } catch (err) {
        console.warn("Error saving workload batch for", p.id, err);
        failedSaveTeachers.push({
          name: `${p.lastName || 'Teacher'}, ${p.firstName || ''}`,
          message: err?.message || 'Server error'
        });
        updatedPersonnelList.push(p);
      }
    }

    // Set personnel in AppContext
    setPersonnel(updatedPersonnelList);

    // If current active teacher is in the list, update editPerson so UI updates immediately without revert
    if (currentPerson) {
      const activeUpdated = updatedPersonnelList.find(x => String(x.id) === String(currentPerson.id));
      if (activeUpdated) {
        setEditPerson(activeUpdated);
      }
    }

    savedWorkloadSnapshotRef.current = JSON.stringify(getFullWorkloadSnapshot());

    setShowAttentionModal(false);

    if (failedSaveTeachers.length > 0 || errorTeachers.length > 0) {
      const failMsgs = failedSaveTeachers.map(f => `• ${f.name}: ${f.message}`).join('\n');
      const errMsgs = errorTeachers.map(name => `• ${name}: Duration or schedule overlap`).join('\n');
      let combined = '';
      if (failMsgs) combined += `Database save failed for:\n${failMsgs}\n\n`;
      if (errMsgs) combined += `Validation errors for:\n${errMsgs}\n\n`;
      combined += `Their drafts were kept locally in this browser. Successfully saved ${confirmedCount} teacher schedule(s).`;
      await showAlert("Batch Timetable Verification Notice", combined);
    } else {
      if (showToast) showToast(`Successfully confirmed & saved timetables for ALL ${confirmedCount} personnel!`);
      await showAlert("Batch Timetable Verification", `All ${confirmedCount} personnel schedules have been confirmed and saved to the database!`);
    }
  };

  const handleClearCurrentTeacherWorkload = async () => {
    if (!currentPerson) return;
    const teacherName = `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.trim() || 'this teacher';
    const allRows = Array.isArray(currentPerson.workloadRows) ? currentPerson.workloadRows : [];
    const termRows = allRows.filter(r => (r.term || '1st') === activeTerm);
    const otherTermRows = allRows.filter(r => (r.term || '1st') !== activeTerm);
    const totalSlots = termRows.length;

    const confirmed = await showConfirm(
      `Clear ${activeTerm} Term Workload?`,
      `Are you sure you want to remove all ${totalSlots} workload schedule periods for ${teacherName} in ${activeTerm} Term? Other terms will remain completely intact.`
    );
    if (!confirmed) return;

    try {
      const activePersonId = currentPerson.id;

      // 0. Delete the saved rows first; if that fails nothing is cleared locally either, so it cannot reappear later.
      let clearedVersion = null;
      try {
        const cleared = await api.clearTeacherTermWorkload(activePersonId, activeTerm, schoolInfo?.schoolId);
        clearedVersion = versionOf(cleared?.workloadSavedAt);
      } catch (err) {
        if (!(err?.status === 404 && err?.body?.error === 'Personnel not found')) { // that 404 = never saved to the database, so there is nothing to delete there
          if (showAlert) await showAlert("Error", "Could not clear the saved workload from the database: " + (err?.message || 'Unknown error') + " Nothing was cleared.");
          return;
        }
      }

      // 1. Update active editPerson state in Workload
      if (typeof setEditPerson === 'function') {
        setEditPerson(prev => (prev ? {
          ...prev,
          workloadRows: otherTermRows,
          workloadVerified: false,
          needsTimeReview: false
        } : null));
      }

      // 2. Update in AppContext with ONLY the workload delta so all profiling fields are preserved
      if (typeof savePersonnelChanges === 'function') {
        await savePersonnelChanges(activePersonId, {
          workloadRows: otherTermRows,
          workloadVerified: false,
          needsTimeReview: false,
          ...(clearedVersion ? { workloadBaseVersion: clearedVersion } : {})
        }, { skipApiUpdate: true });
      }
      if (clearedVersion) applyWorkloadToPerson(activePersonId, { termRows: null, baseVersion: clearedVersion });

      // 3. Update local storage workload draft only
      const draftKey = `draft_workload_${activePersonId}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed) {
            localStorage.setItem(draftKey, JSON.stringify({ ...parsed, workloadRows: otherTermRows }));
          }
        } catch (e) {}
      }

      // 4. Clear SHS map for this teacher and term
      setShsWorkloadMap(prev => ({
        ...prev,
        [activePersonId]: { ...(prev[activePersonId] || {}), [activeTerm]: [] }
      }));

      if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);
      if (showToast) showToast(`✓ ${activeTerm} Term workload for ${teacherName} cleared.`);
    } catch (err) {
      if (showAlert) await showAlert("Error", "Failed to clear workload: " + err.message);
    }
  };

  const handleClearAllTeachersWorkload = async () => {
    const totalTeachers = (personnel || []).filter(p => p.type === 'teaching').length || (personnel || []).length;
    const confirmed = await showConfirm(
      `Clear ${activeTerm} Term Workload (All Teachers)?`,
      `Are you sure you want to clear all ${activeTerm} Term workload schedule periods across ALL ${totalTeachers} teachers in the school? Other terms will remain intact.`
    );
    if (!confirmed) return;

    try {
      // 0. Delete the saved rows for this term first; if that fails nothing is cleared locally either.
      let clearedVersion = null;
      try {
        const cleared = await api.clearSchoolTermWorkload(schoolInfo?.schoolId, activeTerm);
        clearedVersion = versionOf(cleared?.workloadSavedAt);
      } catch (err) {
        if (showAlert) await showAlert("Error", "Could not clear the saved workloads from the database: " + (err?.message || 'Unknown error') + " Nothing was cleared.");
        return;
      }

      // 1. Update in AppContext & remove local teacher workload drafts while strictly preserving other terms and profile fields
      const updatedList = (personnel || []).map(p => {
        const pRows = Array.isArray(p.workloadRows) ? p.workloadRows : [];
        const preservedRows = pRows.filter(r => (r.term || '1st') !== activeTerm);
        const draftKey = `draft_workload_${p.id}`;
        const savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          try {
            const parsed = JSON.parse(savedDraft);
            if (parsed) {
              localStorage.setItem(draftKey, JSON.stringify({ ...parsed, workloadRows: preservedRows, workloadBaseVersion: clearedVersion }));
            }
          } catch (e) {}
        }
        return {
          ...p,
          workloadBaseVersion: clearedVersion,
          workloadRows: preservedRows,
          workloadVerified: false,
          needsTimeReview: false
        };
      });

      if (typeof setPersonnel === 'function') setPersonnel(updatedList);
      if (typeof setEditPerson === 'function') {
        setEditPerson(prev => {
          if (!prev) return null;
          const pRows = Array.isArray(prev.workloadRows) ? prev.workloadRows : [];
          return {
            ...prev,
            workloadBaseVersion: clearedVersion,
            workloadRows: pRows.filter(r => (r.term || '1st') !== activeTerm),
            workloadVerified: false,
            needsTimeReview: false
          };
        });
      }

      if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);
      if (showToast) showToast(`✓ All teachers' ${activeTerm} Term workloads have been cleared.`);
    } catch (err) {
      if (showAlert) await showAlert("Error", "Failed to clear all workloads: " + err.message);
    }
  };

  // Filter states
  const [gradeFilter, setGradeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [sidebarPage, setSidebarPage] = useState(1);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(null);

  useEffect(() => {
    setSidebarPage(1);
  }, [teacherSearch, gradeFilter, categoryFilter]);

  // Delegation & Batch Import state
  const [showOrganizedClassCheckModal, setShowOrganizedClassCheckModal] = useState(false);
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [selectedTeacherIdsForDelegation, setSelectedTeacherIdsForDelegation] = useState([]);
  const [delegationSearch, setDelegationSearch] = useState('');
  const [delegationGradeFilter, setDelegationGradeFilter] = useState('all');
  const [showImportBatchModal, setShowImportBatchModal] = useState(false);
  const [importedBatchData, setImportedBatchData] = useState(null);
  const batchImportFileRef = useRef(null);

  useEffect(() => {
    if (showDelegationModal && selectedTeacherIdsForDelegation.length === 0) {
      const validTeacherIds = (personnel || []).map(p => String(p.id));
      setSelectedTeacherIdsForDelegation(validTeacherIds);
    }
  }, [showDelegationModal, personnel]);

  const handleGenerateDelegationPackageHTML = () => {
    const selIds = selectedTeacherIdsForDelegation.map(id => String(id));
    console.log('[Delegation HTML] personnel count:', (personnel || []).length);
    console.log('[Delegation HTML] selIds:', selIds);
    console.log('[Delegation HTML] personnel IDs:', (personnel || []).map(p => String(p.id)));
    const rawSelected = (personnel || []).filter(p => selIds.includes(String(p.id)));
    console.log('[Delegation HTML] rawSelected count:', rawSelected.length);

    if (rawSelected.length === 0) {
      showAlert("No Teachers Selected", "Please select at least one teacher to delegate workload entry.");
      return;
    }

    const selectedTeachers = rawSelected.map(p => {
      const draftKey = `draft_workload_${p.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let personData = { ...p };
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed && Array.isArray(parsed.workloadRows)) {
            personData.workloadRows = parsed.workloadRows;
          }
        } catch (e) {
          console.error("Failed to parse draft workload for teacher", p.id, e);
        }
      }
      if (!Array.isArray(personData.workloadRows)) {
        personData.workloadRows = [];
      }
      return personData;
    });

    const htmlContent = generateWorkloadDelegationHTML({
      schoolInfo,
      selectedTeachers,
      classSections,
      customSubjects: schoolInfo?.subjectsConfig?.customSubjects || [],
      GRADE_LEVEL_SUBJECTS,
      REMEDIATION_FOCUS_BY_CATEGORY
    });

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Workload_Delegation_Package_${(schoolInfo?.schoolName || 'School').replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDelegationModal(false);
    showToast(`Workload Delegation Package HTML generated for ${selectedTeachers.length} teachers!`, 'success');
  };

  const handleBatchJSONImportSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        if (payload && payload.version === 'INSIGHTED_WORKLOAD_DELEGATION_V1' && payload.teachersWorkload) {
          setImportedBatchData(payload);
          setShowImportBatchModal(true);
        } else {
          showAlert("Invalid Data File", "The uploaded file is not a valid InsightED Workload Return payload.");
        }
      } catch (err) {
        console.error("Failed to parse batch JSON file", err);
        showAlert("File Read Error", "Could not read the JSON file. Please ensure it is valid.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApproveAndMergeBatchImport = async () => {
    if (!importedBatchData || !importedBatchData.teachersWorkload) return;

    let mergedCount = 0;
    const teachersMap = importedBatchData.teachersWorkload;

    Object.entries(teachersMap).forEach(([personnelId, rows]) => {
      const targetPerson = personnel.find(p => p.id === personnelId);
      if (targetPerson) {
        const draftKey = `draft_workload_${personnelId}`;
        const savedDraft = localStorage.getItem(draftKey);
        let basePerson = targetPerson;
        if (savedDraft) {
          try {
            const parsed = JSON.parse(savedDraft);
            if (parsed) basePerson = parsed;
          } catch (e) {}
        }
        const updated = { ...basePerson, workloadRows: rows };
        localStorage.setItem(draftKey, JSON.stringify(updated));
        mergedCount++;
      }
    });

    if (dbPerson && teachersMap[dbPerson.id]) {
      const updatedActive = { ...currentPerson, workloadRows: teachersMap[dbPerson.id] };
      setEditPerson(updatedActive);
    }

    setShowImportBatchModal(false);
    setImportedBatchData(null);
    showToast(`Successfully merged workloads for ${mergedCount} teachers locally!`, 'success');
  };



  const parseTimeToMinutes = (timeStr) => {
    return parseMins(timeStr);
  };

  // add60MinutesToTime is exported at module level (top of file)

  const getAssignedGradeLevels = (p) => {
    if (!p || typeof p !== 'object') return [];
    let raw = p.assignedGradeLevels || p.assigned_grade_levels || p.gradeLevelsTaught || p.grade_levels_taught;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = raw.split(',').map(s => String(s || '').trim()).filter(Boolean);
      }
    }
    const assigned = Array.isArray(raw) ? raw.filter(Boolean).map(String) : [];
    const organized = getOrganizedClassGradeLevels(p, classSections);
    return organized.length > 0 ? [...new Set([...assigned, ...organized])] : assigned;
  };

  // Filter people list based on search query, grade level, and category (teaching / teaching-related)
  const filteredPeople = useMemo(() => {
    if (!Array.isArray(personnel)) return [];
    const query = String(teacherSearch || '').toLowerCase().trim();

    return personnel.filter(p => {
      if (!p || typeof p !== 'object' || p.isDraft) return false;

      // 1. Search filter (safe against null, undefined, non-string positions)
      const firstName = String(p.firstName || '').toLowerCase().trim();
      const lastName = String(p.lastName || '').toLowerCase().trim();
      const middleName = String(p.middleName || '').toLowerCase().trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const position = String(p.position || p.plantilla_position || p.position_title || '').toLowerCase().trim();

      let matchesSearch = true;
      if (query) {
        matchesSearch = fullName.includes(query) || position.includes(query) || middleName.includes(query);
      }

      // 2. Category filter
      const matchesCat = categoryFilter === 'all' || p.type === categoryFilter;

      // 3. Grade Level filter
      let matchesGrade = true;
      if (gradeFilter !== 'all') {
        if (p.type === 'non-teaching') {
          matchesGrade = false;
        } else {
          const assigned = getAssignedGradeLevels(p);
          const rowGrades = (p.workloadRows || []).map(r => r?.gradeLevel).filter(Boolean);
          matchesGrade = assigned.includes(gradeFilter) || rowGrades.includes(gradeFilter);
        }
      }

      return matchesSearch && matchesCat && matchesGrade;
    });
  }, [personnel, teacherSearch, categoryFilter, gradeFilter, classSections]);

  const dbPerson = (personnel || []).find(p => p && (String(p.id) === String(activePersonnelId) || String(p._id) === String(activePersonnelId))) ||
                   (filteredPeople.length > 0 ? (filteredPeople.find(p => p && (String(p.id) === String(activePersonnelId) || String(p._id) === String(activePersonnelId))) || filteredPeople[0]) : null) ||
                   (personnel || []).find(p => p && !p.isDraft) ||
                   (personnel || [])[0] || null;
  const [editPerson, setEditPerson] = useState(null);
  const currentPerson = editPerson || dbPerson;

  // Clear selectedBlockIdx whenever switching active teachers to prevent stale index pointer collisions
  useEffect(() => {
    setSelectedBlockIdx(null);
  }, [currentPerson?.id]);

  // Memoized teaching hours map to eliminate heavy sorting/merging calculations on keystrokes
  const teacherHoursMap = useMemo(() => {
    const map = {};
    (personnel || []).forEach(p => {
      if (p?.id) {
        try {
          map[p.id] = getPersonWeeklyTeachingHours(p);
        } catch (e) {
          map[p.id] = 0;
        }
      }
    });
    return map;
  }, [personnel, workloadTransfers]);

  useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_workload_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let person = dbPerson;
      const draftOverlaid = draftRowsMayOverlay(dbPerson.id, activeTerm, schoolInfo?.schoolId);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed && !draftOverlaid && Array.isArray(parsed.workloadRows)) {
            // Not confirmed yet: this term shows the saved baseline; the draft's rows for it wait for the restore prompt.
            parsed.workloadRows = [
              ...(dbPerson.workloadRows || []).filter(r => (r.term || '1st') === activeTerm),
              ...parsed.workloadRows.filter(r => (r.term || '1st') !== activeTerm)
            ];
          }
          if (parsed) {
            person = {
              ...dbPerson,
              ...parsed,
              assignedGradeLevels: (Array.isArray(dbPerson.assignedGradeLevels) && dbPerson.assignedGradeLevels.length > 0) ? dbPerson.assignedGradeLevels : (parsed.assignedGradeLevels || []),
              assigned_grade_levels: (Array.isArray(dbPerson.assigned_grade_levels) && dbPerson.assigned_grade_levels.length > 0) ? dbPerson.assigned_grade_levels : (parsed.assigned_grade_levels || []),
              gradeLevelsTaught: (Array.isArray(dbPerson.gradeLevelsTaught) && dbPerson.gradeLevelsTaught.length > 0) ? dbPerson.gradeLevelsTaught : (parsed.gradeLevelsTaught || []),
              grade_levels_taught: (Array.isArray(dbPerson.grade_levels_taught) && dbPerson.grade_levels_taught.length > 0) ? dbPerson.grade_levels_taught : (parsed.grade_levels_taught || [])
            };
          }
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      const isNT = isNonTeachingPerson(person);

      if (isNT) {
        setEditPerson(person);
        return;
      }

      let updatedRows = (person.workloadRows || []).map(r => {
        const normSub = r.subject || r.subject_name || '';
        const normGrade = r.gradeLevel || r.grade_level || '';
        const matchedSec = matchSectionForWorkloadRow(r, classSections);
        let normSecId = matchedSec ? String(matchedSec.id) : (r.sectionId !== undefined && r.sectionId !== null && r.sectionId !== '' ? String(r.sectionId) : ((r.section_id !== undefined && r.section_id !== null && r.section_id !== '') ? String(r.section_id) : ''));
        let normSecName = matchedSec?.sectionName || r.sectionName || r.section_name || '';
        let finalGrade = matchedSec?.gradeLevel || normGrade;
        let normCat = r.category || matchedSec?.category;
        if (!normCat && finalGrade) {
          for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
            if (grades.includes(finalGrade)) {
              normCat = cat;
              break;
            }
          }
        }
        return {
          ...r,
          sectionId: normSecId,
          sectionName: normSecName,
          subject: String(normSub || '').toUpperCase().trim(),
          gradeLevel: finalGrade,
          category: normCat || (isAdminTaskRow(r) ? 'Administrative' : 'Elementary'),
          trackStrand: matchedSec?.trackStrand || r.trackStrand || ''
        };
      });
      let rowsChanged = false;

      // Project any existing administrativeRows into updatedRows if not already on the timetable
      const existingAdminSource = (Array.isArray(person.administrativeRows) && person.administrativeRows.length > 0)
        ? person.administrativeRows
        : ((Array.isArray(dbPerson?.administrativeRows) && dbPerson.administrativeRows.length > 0) ? dbPerson.administrativeRows : []);

      if (existingAdminSource.length > 0) {
        existingAdminSource.forEach(adm => {
          const admTask = adm.task || adm.task_name || adm.subject || ADMIN_TASK_OPTIONS[0];
          const hasAlready = updatedRows.some(r => isAdminTaskRow(r) && String(r.subject || r.task || '').toUpperCase() === String(admTask).toUpperCase());
          if (!hasAlready) {
            const newAdmId = `admin-row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            updatedRows.push({
              id: newAdmId,
              sectionId: '',
              sectionName: '',
              gradeLevel: '',
              category: 'Administrative',
              subject: admTask,
              startTime: adm.startTime || adm.start_time || '13:00',
              endTime: adm.endTime || adm.end_time || (adm.hours ? formatMinutesToTime(13 * 60 + Math.round(Number(adm.hours) * 60)) : '14:00'),
              days: Array.isArray(adm.days) && adm.days.length > 0 ? adm.days : ['M', 'T', 'W', 'TH', 'F'],
              term: adm.term || '1st'
            });
            rowsChanged = true;
          }
        });
      }

      const activePersonIdToMatch = String(dbPerson?.id || currentPerson?.id || activePersonnelId);
      const isSecOwnedByActivePerson = (s) => {
        if (!s || isOrganizedClassWorkloadExempt(currentPerson || dbPerson)) return false; // Principals: no Classes-Organized workload
        const pIds = [
          String(person?.id || ''),
          String(person?._id || ''),
          String(dbPerson?.id || ''),
          String(dbPerson?._id || ''),
          String(activePersonnelId || '')
        ].filter(Boolean);
        const sIds = [
          String(s.advisorId || ''),
          String(s.advisor_id || ''),
          String(s.adviserId || ''),
          String(s.adviser_id || ''),
          String(s.tutorId || ''),
          String(s.tutor_id || ''),
          String(s.teacherId || ''),
          String(s.teacher_id || ''),
          String(s.advisor || ''),
          String(s.tutor || '')
        ].filter(id => Boolean(id) && id !== 'null' && id !== 'undefined');

        // 1. Direct ID match
        if (pIds.some(pId => sIds.includes(pId))) return true;

        // If section has explicit ID assignment that belongs to another teacher in personnel, it cannot belong to active person
        if (sIds.length > 0 && Array.isArray(personnel) && personnel.length > 0) {
          const isAssignedToOther = personnel.some(p => {
            const otherId = String(p.id || p._id || '');
            return !pIds.includes(otherId) && sIds.includes(otherId);
          });
          if (isAssignedToOther) return false;
        }

        // 2. Full Name match fallback
        const pFn = String(person?.firstName || dbPerson?.firstName || '').toLowerCase().trim();
        const pLn = String(person?.lastName || dbPerson?.lastName || '').toLowerCase().trim();
        const fullName = `${pFn} ${pLn}`.trim();
        const reverseFullName = `${pLn}, ${pFn}`.trim();
        const reverseFullNameNoComma = `${pLn} ${pFn}`.trim();

        const sNames = [
          String(s.advisorName || ''),
          String(s.advisor_name || ''),
          String(s.adviserName || ''),
          String(s.adviser_name || ''),
          String(s.tutorName || ''),
          String(s.tutor_name || ''),
          String(s.teacherName || ''),
          String(s.teacher_name || '')
        ].map(n => n.toLowerCase().trim()).filter(Boolean);

        if (fullName && sNames.length > 0) {
          return sNames.some(name =>
            name === fullName ||
            name === reverseFullName ||
            name === reverseFullNameNoComma ||
            (pFn && pLn && name.includes(pFn) && name.includes(pLn))
          );
        }

        return false;
      };

      const isSecAdvisedByActivePerson = (s) => {
        if (!s || isOrganizedClassWorkloadExempt(currentPerson || dbPerson)) return false; // Principals: no Classes-Organized workload
        const pIds = [
          String(person?.id || ''),
          String(person?._id || ''),
          String(dbPerson?.id || ''),
          String(dbPerson?._id || ''),
          String(activePersonnelId || '')
        ].filter(Boolean);
        const sAdvIds = [
          String(s.advisorId || ''),
          String(s.advisor_id || ''),
          String(s.adviserId || ''),
          String(s.adviser_id || ''),
          String(s.advisor || '')
        ].filter(id => Boolean(id) && id !== 'null' && id !== 'undefined');

        if (pIds.some(pId => sAdvIds.includes(pId))) return true;

        if (sAdvIds.length > 0 && Array.isArray(personnel) && personnel.length > 0) {
          const isAssignedToOther = personnel.some(p => {
            const otherId = String(p.id || p._id || '');
            return !pIds.includes(otherId) && sAdvIds.includes(otherId);
          });
          if (isAssignedToOther) return false;
        }

        const pFn = String(person?.firstName || dbPerson?.firstName || '').toLowerCase().trim();
        const pLn = String(person?.lastName || dbPerson?.lastName || '').toLowerCase().trim();
        const fullName = `${pFn} ${pLn}`.trim();
        const reverseFullName = `${pLn}, ${pFn}`.trim();
        const reverseFullNameNoComma = `${pLn} ${pFn}`.trim();

        const sAdvNames = [
          String(s.advisorName || ''),
          String(s.advisor_name || ''),
          String(s.adviserName || ''),
          String(s.adviser_name || '')
        ].map(n => n.toLowerCase().trim()).filter(Boolean);

        if (fullName && sAdvNames.length > 0) {
          return sAdvNames.some(name =>
            name === fullName ||
            name === reverseFullName ||
            name === reverseFullNameNoComma ||
            (pFn && pLn && name.includes(pFn) && name.includes(pLn))
          );
        }

        return false;
      };

      const advisorySections = (classSections || []).filter(s => {
        const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
        if (isReg) return isSecAdvisedByActivePerson(s);
        return false;
      });
      const snedSections = (classSections || []).filter(s => {
        const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
        if (isReg) return false;
        const isSned = String(s.sectionType || '').toUpperCase().includes('SNED') ||
                       String(s.gradeLevel || '').toUpperCase().includes('SNED') ||
                       String(s.gradeLevel || '').toUpperCase().includes('NON-GRADED') ||
                       String(s.gradeLevel || '').toUpperCase().includes('SPED');
        if (!isSned) return false;
        return isSecOwnedByActivePerson(s);
      });
      const alsSections = (classSections || []).filter(s => {
        const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
        if (isReg) return false;
        const isAls = String(s.sectionType || '').toUpperCase().includes('ALS') ||
                      String(s.gradeLevel || '').toUpperCase().includes('ALS');
        if (!isAls) return false;
        return isSecOwnedByActivePerson(s);
      });
      const aralSections = (classSections || []).filter(s => {
        const isReg = ['MONO GRADE', 'MONOGRADE', 'MULTIGRADE', 'MULTI GRADE'].includes(String(s.sectionType || '').toUpperCase().trim());
        if (isReg) return false;
        const isAral = String(s.sectionType || '').toUpperCase().includes('ARAL') ||
                       String(s.gradeLevel || '').toUpperCase().includes('ARAL') ||
                       String(s.sectionName || '').toUpperCase().includes('ARAL') ||
                       Boolean(s.aralBasis || s.aralToolKey || s.aralTool);
        if (!isAral) return false;
        return isSecOwnedByActivePerson(s);
      });
      const remedialSections = (classSections || []).filter(s => {
        const isRem = s.sectionType === 'REMEDIAL' || s.sectionType === 'ENRICHMENT';
        if (!isRem) return false;
        return isSecOwnedByActivePerson(s);
      });
      const defaultAdvSecId = advisorySections.length > 0 ? String(advisorySections[0].id) : '';

      // Keep ADVISORY and HGP rows strictly 1 per active advisory section, clean up obsolete / duplicate rows (scoped per term)
      const seenAdvisorySecs = new Map();
      const seenHgpSecs = new Map();
      const seenSnedSecs = new Map();
      const seenAlsSecs = new Map();
      const seenAralSecs = new Map();
      const seenRemSecs = new Map();
      let otherCleanedRows = [];
      let didClean = false;

      updatedRows.forEach(r => {
        let subUpper = String(r.subject || '').toUpperCase().trim();
        const rTerm = r.term || '1st';
        if (subUpper === 'CUSTOM' || subUpper.startsWith('CUSTOM (')) {
          didClean = true;
          return;
        }
        if (subUpper.includes('HOMEROOM GUIDANCE') || subUpper.startsWith('HOMEROOM GUIDANCE') || subUpper.startsWith('HGP (')) {
          r.subject = 'HGP';
          subUpper = 'HGP';
        }
        const isSnedRow = isSnedSectionRow(r, classSections) || subUpper === 'SNED MODIFIED SUBJECT' || subUpper === 'SNED' || subUpper === 'SPED MODIFIED SUBJECTS';
        const isAlsRow = isAlsSectionRow(r, classSections) || subUpper === 'ALS LEARNING STRAND' || subUpper === 'ALS';
        const isAralRow = isAralSectionRow(r, classSections) || isAralSubject(subUpper) || subUpper === 'ARAL TUTORING' || subUpper === 'ARAL' || (subUpper.startsWith('ARAL') && !subUpper.startsWith('ARALING'));
        const isRemRow = isRemedialSectionRow(r, classSections);

        if (subUpper === 'ADVISORY') {
          if (isSnedRow || isAlsRow || isAralRow || isRemRow) {
            didClean = true;
            return;
          }
          // Verify this advisory section actually belongs to this teacher in advisorySections
          const matchingAdvSec = advisorySections.find(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || (advisorySections.length === 1 ? advisorySections[0] : null);
          if (!matchingAdvSec) {
            didClean = true;
            return;
          }
          const secIdToUse = String(matchingAdvSec.id);
          const secKey = `${rTerm}__${secIdToUse}`;
          if (!seenAdvisorySecs.has(secKey)) {
            seenAdvisorySecs.set(secKey, {
              ...r,
              subject: 'ADVISORY',
              sectionId: secIdToUse,
              sectionName: matchingAdvSec.sectionName,
              gradeLevel: matchingAdvSec.gradeLevel,
              term: rTerm
            });
          } else {
            // Deduplicate multiple advisory rows for this section: merge days into single row
            const existingAdv = seenAdvisorySecs.get(secKey);
            const rDays = Array.isArray(r.days) && r.days.length > 0 ? r.days : ['M'];
            const mergedDays = Array.from(new Set([...(existingAdv.days || []), ...rDays]));
            existingAdv.days = mergedDays;
            didClean = true;
          }
        } else if (subUpper === 'HGP') {
          // Verify this HGP section actually belongs to this teacher in advisorySections (never SNED, ALS, ARAL, or Remedial)
          if (isSnedRow || isAlsRow || isAralRow || isRemRow) {
            didClean = true;
            return; // No HGP for SNED, ALS, ARAL, or Remedial
          }
          const matchingAdvSec = advisorySections.find(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || (advisorySections.length === 1 ? advisorySections[0] : null);
          if (!matchingAdvSec) {
            didClean = true;
            return;
          }
          const secIdToUse = String(matchingAdvSec.id);
          const secKey = `${rTerm}__PRIMARY_HGP`;
          if (!seenHgpSecs.has(secKey)) {
            seenHgpSecs.set(secKey, {
              ...r,
              subject: 'HGP',
              sectionId: secIdToUse,
              sectionName: matchingAdvSec.sectionName,
              gradeLevel: matchingAdvSec.gradeLevel,
              term: rTerm
            });
          } else {
            didClean = true;
          }
        } else if (isSnedRow) {
          const isOwn = snedSections.some(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || snedSections.length > 0;
          if (!isOwn) {
            didClean = true;
            return;
          }
          const targetSec = snedSections.find(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || snedSections[0];
          const secKey = `${rTerm}__${String(targetSec?.id || r.sectionId || r.section_id || r.sectionName || 'GLOBAL_SNED')}`;
          if (!seenSnedSecs.has(secKey)) {
            seenSnedSecs.set(secKey, {
              ...r,
              sectionId: targetSec ? String(targetSec.id) : (r.sectionId || ''),
              sectionName: targetSec?.sectionName || r.sectionName || 'SNED',
              gradeLevel: targetSec?.gradeLevel || r.gradeLevel || 'SNED (NON-GRADED)',
              subject: 'SNED MODIFIED SUBJECT',
              subjectName: 'SNED MODIFIED SUBJECT',
              term: rTerm
            });
          } else {
            didClean = true;
          }
        } else if (isAlsRow) {
          const isOwn = alsSections.some(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || alsSections.length > 0;
          if (!isOwn) {
            didClean = true;
            return;
          }
          const targetSec = alsSections.find(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || alsSections[0];
          const secKey = `${rTerm}__${String(targetSec?.id || r.sectionId || r.section_id || r.sectionName || 'GLOBAL_ALS')}`;
          if (!seenAlsSecs.has(secKey)) {
            seenAlsSecs.set(secKey, {
              ...r,
              sectionId: targetSec ? String(targetSec.id) : (r.sectionId || ''),
              sectionName: targetSec?.sectionName || r.sectionName || 'ALS',
              gradeLevel: targetSec?.gradeLevel || r.gradeLevel || 'ALS',
              subject: 'ALS LEARNING STRAND',
              subjectName: 'ALS LEARNING STRAND',
              term: rTerm
            });
          } else {
            didClean = true;
          }
        } else if (isAralRow) {
          const isOwn = aralSections.some(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || aralSections.length > 0;
          if (!isOwn) {
            didClean = true;
            return;
          }
          const targetSec = aralSections.find(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) || aralSections[0];
          const secKey = `${rTerm}__${String(targetSec?.id || r.sectionId || r.section_id || r.sectionName || 'GLOBAL_ARAL')}`;
          if (!seenAralSecs.has(secKey)) {
            seenAralSecs.set(secKey, {
              ...r,
              sectionId: targetSec ? String(targetSec.id) : (r.sectionId || ''),
              sectionName: targetSec?.sectionName || r.sectionName || 'ARAL',
              gradeLevel: targetSec?.gradeLevel || r.gradeLevel || 'Grade 3',
              subject: 'ARAL TUTORING',
              subjectName: 'ARAL TUTORING',
              term: rTerm
            });
          } else {
            didClean = true;
          }
        } else if (isRemRow) {
          const targetSec = remedialSections.find(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())) ||
            (classSections || []).find(sec => (sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT') && (String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase())));

          const remSlotKey = `${rTerm}__${String(targetSec?.id || r.sectionId || r.section_id || r.sectionName || 'GLOBAL_REM')}__${r.startTime || ''}__${r.endTime || ''}__${getNormalizedRowDays(r).sort().join(',')}`;
          if (!seenRemSecs.has(remSlotKey)) {
            const expectedSub = targetSec?.sectionType === 'ENRICHMENT' ? 'ENRICHMENT' : (r.subject || 'REMEDIATION');
            seenRemSecs.set(remSlotKey, {
              ...r,
              sectionId: targetSec ? String(targetSec.id) : (r.sectionId || ''),
              sectionName: targetSec?.sectionName || r.sectionName || 'Remedial',
              gradeLevel: targetSec?.gradeLevel || r.gradeLevel || 'Grade 2',
              subject: expectedSub,
              subjectName: expectedSub,
              term: rTerm
            });
          } else {
            didClean = true;
          }
        } else {
          // Keep all assigned workload rows intact (including admin duties, immersion, and standard/custom subjects)
          let resolvedRow = r;
          if (!isAdminTaskRow(r) && !isNonTeachingTaskSubject(r.subject || r.subject_name)) {
            const matched = matchSectionForWorkloadRow(r, classSections);
            if (matched) {
              const matchedIdStr = String(matched.id);
              const matchedName = matched.sectionName || matched.section_name || r.sectionName;
              const matchedGrade = matched.gradeLevel || matched.grade_level || r.gradeLevel;
              if (String(r.sectionId) !== matchedIdStr || r.sectionName !== matchedName || r.gradeLevel !== matchedGrade) {
                resolvedRow = {
                  ...r,
                  sectionId: matchedIdStr,
                  sectionName: matchedName,
                  gradeLevel: matchedGrade
                };
                didClean = true;
              }
            }
          }
          otherCleanedRows.push(resolvedRow);
        }
      });

      const cleanedRows = [
        ...Array.from(seenAdvisorySecs.values()),
        ...Array.from(seenHgpSecs.values()),
        ...Array.from(seenSnedSecs.values()),
        ...Array.from(seenAlsSecs.values()),
        ...Array.from(seenAralSecs.values()),
        ...Array.from(seenRemSecs.values()),
        ...otherCleanedRows
      ];

      if (didClean) {
        updatedRows = cleanedRows;
        rowsChanged = true;
      }

      // effectiveAdvisorySections is strictly derived from regular classSections where this teacher is assigned Class Adviser
      const effectiveAdvisorySections = advisorySections;

      if (effectiveAdvisorySections.length === 0) {
        const initialLen = updatedRows.length;
        updatedRows = updatedRows.filter(r => r.subject !== 'ADVISORY' && r.subject !== 'HGP' && r.subject !== 'HOMEROOM GUIDANCE');
        if (updatedRows.length !== initialLen) rowsChanged = true;
      } else {
        const primarySec = effectiveAdvisorySections[0];
        const secIdStr = String(primarySec.id);

        let advisoryIdx = updatedRows.findIndex(r => (r.term || '1st') === '1st' && r.subject === 'ADVISORY');
        if (advisoryIdx === -1) {
          const newAdv = {
            id: `local-work-adv-${primarySec.id}-1st-${Date.now()}`,
            sectionId: secIdStr,
            sectionName: primarySec.sectionName,
            gradeLevel: primarySec.gradeLevel,
            subject: 'ADVISORY',
            startTime: '07:30',
            endTime: '08:30',
            days: ['M', 'T', 'W', 'TH', 'F'],
            term: '1st'
          };
          updatedRows.push(newAdv);
          advisoryIdx = updatedRows.length - 1;
          rowsChanged = true;
        } else {
          const existing = updatedRows[advisoryIdx];
          if (String(existing.sectionId) !== secIdStr || existing.gradeLevel !== primarySec.gradeLevel || existing.sectionName !== primarySec.sectionName) {
            updatedRows[advisoryIdx] = {
              ...existing,
              sectionId: secIdStr,
              sectionName: primarySec.sectionName,
              gradeLevel: primarySec.gradeLevel
            };
            rowsChanged = true;
          }
        }

        let hgpIdx = updatedRows.findIndex(r => (r.term || '1st') === '1st' && r.subject === 'HGP');
        const advRow = updatedRows[advisoryIdx];
        const defaultStartTime = advRow?.startTime || '07:30';
        const defaultEndTime = advRow?.endTime || '08:30';

        if (hgpIdx === -1) {
          updatedRows.push({
            id: `local-work-hgp-${primarySec.id}-1st-${Date.now() + 1}`,
            sectionId: secIdStr,
            sectionName: primarySec.sectionName,
            gradeLevel: primarySec.gradeLevel,
            subject: 'HGP',
            startTime: defaultStartTime,
            endTime: defaultEndTime,
            days: ['F'],
            term: '1st'
          });
          rowsChanged = true;
        } else {
          const existingHgp = updatedRows[hgpIdx];
          if (String(existingHgp.sectionId) !== secIdStr || existingHgp.gradeLevel !== primarySec.gradeLevel || existingHgp.sectionName !== primarySec.sectionName) {
            updatedRows[hgpIdx] = {
              ...existingHgp,
              sectionId: secIdStr,
              sectionName: primarySec.sectionName,
              gradeLevel: primarySec.gradeLevel
            };
            rowsChanged = true;
          }
        }
      }

      // Synchronize existing SNED sections if present on timetable
      snedSections.forEach(sec => {
        let snedIdx = updatedRows.findIndex(r => (r.term || '1st') === '1st' && (r.subject === 'SNED MODIFIED SUBJECT' || r.subject === 'SNED' || r.subject === 'SPED MODIFIED SUBJECTS') && (String(r.sectionId) === String(sec.id) || !r.sectionId || String(r.sectionName || '').toUpperCase() === String(sec.sectionName || '').toUpperCase()));
        if (snedIdx !== -1) {
          const existing = updatedRows[snedIdx];
          if (existing.subject !== 'SNED MODIFIED SUBJECT' || String(existing.sectionId) !== String(sec.id) || existing.gradeLevel !== sec.gradeLevel || existing.sectionName !== sec.sectionName) {
            updatedRows[snedIdx] = {
              ...existing,
              sectionId: String(sec.id),
              sectionName: sec.sectionName,
              gradeLevel: sec.gradeLevel || 'SNED (NON-GRADED)',
              subject: 'SNED MODIFIED SUBJECT',
              subjectName: 'SNED MODIFIED SUBJECT'
            };
            rowsChanged = true;
          }
        }
      });

      // Synchronize existing ALS sections if present on timetable
      alsSections.forEach(sec => {
        let alsIdx = updatedRows.findIndex(r => (r.term || '1st') === '1st' && (r.subject === 'ALS LEARNING STRAND' || r.subject === 'ALS') && (String(r.sectionId) === String(sec.id) || !r.sectionId || String(r.sectionName || '').toUpperCase() === String(sec.sectionName || '').toUpperCase()));
        if (alsIdx !== -1) {
          const existing = updatedRows[alsIdx];
          if (existing.subject !== 'ALS LEARNING STRAND' || String(existing.sectionId) !== String(sec.id) || existing.gradeLevel !== sec.gradeLevel || existing.sectionName !== sec.sectionName) {
            updatedRows[alsIdx] = {
              ...existing,
              sectionId: String(sec.id),
              sectionName: sec.sectionName,
              gradeLevel: sec.gradeLevel || 'ALS',
              subject: 'ALS LEARNING STRAND',
              subjectName: 'ALS LEARNING STRAND'
            };
            rowsChanged = true;
          }
        }
      });

      // Synchronize existing ARAL sections if present on timetable
      aralSections.forEach(sec => {
        let aralIdx = updatedRows.findIndex(r => (r.term || '1st') === '1st' && (r.subject === 'ARAL TUTORING' || r.subject === 'ARAL' || (String(r.subject || '').startsWith('ARAL') && !String(r.subject || '').startsWith('ARALING'))) && (String(r.sectionId) === String(sec.id) || !r.sectionId || String(r.sectionName || '').toUpperCase() === String(sec.sectionName || '').toUpperCase()));
        if (aralIdx !== -1) {
          const existing = updatedRows[aralIdx];
          if (String(existing.sectionId) !== String(sec.id) || existing.gradeLevel !== sec.gradeLevel || existing.sectionName !== sec.sectionName) {
            updatedRows[aralIdx] = {
              ...existing,
              sectionId: String(sec.id),
              sectionName: sec.sectionName,
              gradeLevel: sec.gradeLevel || existing.gradeLevel
            };
            rowsChanged = true;
          }
        }
      });

      // Synchronize existing Remedial / Enrichment sections if present on timetable
      remedialSections.forEach(sec => {
        updatedRows.forEach((r, idx) => {
          if ((r.term || '1st') === '1st' && String(r.sectionId) === String(sec.id)) {
            if (r.gradeLevel !== sec.gradeLevel || r.sectionName !== sec.sectionName) {
              updatedRows[idx] = {
                ...r,
                sectionName: sec.sectionName,
                gradeLevel: sec.gradeLevel || r.gradeLevel
              };
              rowsChanged = true;
            }
          }
        });
      });

      // Post-sanitization: Enforce maximum ONE ADVISORY row and ONE HGP row per section per term, and remove any orphaned advisory/HGP
      const finalSanitizedRows = [];
      const seenAdvFinal = new Set();
      const seenHgpFinal = new Set();

      updatedRows.forEach(r => {
        const subUpper = String(r.subject || '').toUpperCase().trim();
        const rTerm = r.term || '1st';
        if (subUpper === 'ADVISORY') {
          const isOwn = effectiveAdvisorySections.some(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase()));
          if (!isOwn) {
            rowsChanged = true;
            return;
          }
          const finalKey = `${rTerm}__${r.sectionId || 'ADVISORY_SINGLETON'}`;
          if (seenAdvFinal.has(finalKey)) {
            rowsChanged = true;
            return;
          }
          seenAdvFinal.add(finalKey);
        } else if (subUpper === 'HGP') {
          const isOwn = effectiveAdvisorySections.some(sec => String(sec.id) === String(r.sectionId) || (r.sectionName && String(sec.sectionName).toUpperCase() === String(r.sectionName).toUpperCase()));
          if (!isOwn) {
            rowsChanged = true;
            return;
          }
          const finalKey = `${rTerm}__${r.sectionId || 'HGP_SINGLETON'}`;
          if (seenHgpFinal.has(finalKey)) {
            rowsChanged = true;
            return;
          }
          seenHgpFinal.add(finalKey);
        }
        finalSanitizedRows.push(r);
      });

      finalSanitizedRows.sort((a, b) => {
        const getPriority = (row) => {
          const sub = String(row.subject || '').toUpperCase().trim();
          if (sub === 'ADVISORY') return 0;
          if (sub === 'HGP' || sub.includes('HOMEROOM')) return 1;
          return 2;
        };
        return getPriority(a) - getPriority(b);
      });

      if (finalSanitizedRows.length !== updatedRows.length) {
        updatedRows = finalSanitizedRows;
        rowsChanged = true;
      }

      if (!rowsChanged && JSON.stringify(updatedRows) !== JSON.stringify(person.workloadRows || [])) {
        rowsChanged = true;
      }

      const updatedPerson = { ...person, workloadRows: updatedRows };
      setEditPerson(updatedPerson);

      if (rowsChanged && savedDraft && draftOverlaid) {
        const schoolId = resolveSchoolId(schoolInfo?.schoolId);
        const snapKey = `${schoolId}__${dbPerson.id}__${activeTerm}`;
        const savedNorm = savedTeacherTermSnapshotRef.current?.get(snapKey);
        const currentNorm = normalizeRowsForComparison(updatedRows, activeTerm);
        if (savedNorm && JSON.stringify(currentNorm) === JSON.stringify(savedNorm)) {
          localStorage.removeItem(draftKey);
        } else {
          try { localStorage.setItem(draftKey, JSON.stringify(updatedPerson)); } catch (e) {}
        }
      }
    } else {
      setEditPerson(null);
    }
  }, [activePersonnelId, dbPerson, classSections]);

  // Allowances & Incentives Configuration Items (Teaching Supplies restricted to teaching staff)
  const ALLOWANCE_ITEMS = useMemo(() => [
    { key: 'uniform', label: 'Uniform Allowance', desc: 'Clothing & Uniform Allowance' },
    { key: 'supplies', label: 'Teaching Supplies', desc: 'Cash Allowance for Teaching Supplies (Teaching Only)', teachingOnly: true },
    { key: 'medical', label: 'Medical Allowance', desc: 'Fixed Medical Allowance (₱7,000)' },
    { key: 'hardship', label: 'Special Hardship (SHA)', desc: 'Special Hardship Allowance for Hardship Posts / Teaching' }
  ], []);

  const [updatingAllowanceKey, setUpdatingAllowanceKey] = useState(null);

  const activeSchoolYear = currentSchoolYear || schoolInfo?.schoolYear || 'SY 26-27';

  useEffect(() => {
    if (typeof fetchAllowances === 'function') {
      fetchAllowances(activeSchoolYear);
    }
  }, [activeSchoolYear, fetchAllowances]);

  const handleToggleAllowanceDisabled = useCallback(async (key, nextDisabled) => {
    if (!currentPerson?.id) return;
    const conf = ALLOWANCE_ITEMS.find(a => a.key === key) || { label: key };
    const teacherName = `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.trim() || 'Teacher';
    
    setUpdatingAllowanceKey(key);
    try {
      const res = await setAllowanceDisabled(currentPerson.id, key, nextDisabled, activeSchoolYear);
      if (res && res.success !== false) {
        if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);
        if (showToast) {
          showToast(`${nextDisabled ? '🚫 Disabled' : '✅ Re-enabled'} ${conf.label} for ${teacherName}`, 'info');
        }
      } else {
        if (showToast) {
          showToast(`Failed to update ${conf.label}: ${res?.error || 'Server error'}`, 'error');
        }
      }
    } catch (err) {
      if (showToast) showToast(`Error updating ${conf.label}`, 'error');
    } finally {
      setUpdatingAllowanceKey(null);
    }
  }, [currentPerson, activeSchoolYear, ALLOWANCE_ITEMS, setAllowanceDisabled, setHasUnsavedChanges, showToast]);

  const handleToggleAllowanceGrant = useCallback(async (key, nextGranted) => {
    if (!currentPerson?.id) return;
    const conf = ALLOWANCE_ITEMS.find(a => a.key === key) || { label: key };
    const teacherName = `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.trim() || 'Teacher';
    const pAllowances = (allowancesMap && allowancesMap[currentPerson.id]) || {};

    if (isAllowanceDisabled(pAllowances, key)) {
      if (showToast) showToast(`${conf.label} is currently disabled. Enable it first to grant.`, 'warning');
      return;
    }

    if (conf.teachingOnly && currentPerson.type === 'non-teaching') {
      if (showToast) showToast('Non-Teaching personnel are not eligible for Teaching Supplies Allowance.', 'warning');
      return;
    }

    setUpdatingAllowanceKey(key);
    try {
      const res = await toggleAllowance(currentPerson.id, key, nextGranted, activeSchoolYear);
      if (res && res.success !== false) {
        if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);
        if (showToast) {
          showToast(`${nextGranted ? 'Granted' : 'Revoked'} ${conf.label} for ${teacherName}`, 'success');
        }
      } else {
        if (showToast) {
          showToast(`Failed to grant ${conf.label}: ${res?.error || 'Server error'}`, 'error');
        }
      }
    } catch (err) {
      if (showToast) showToast(`Error updating ${conf.label}`, 'error');
    } finally {
      setUpdatingAllowanceKey(null);
    }
  }, [currentPerson, activeSchoolYear, allowancesMap, ALLOWANCE_ITEMS, toggleAllowance, setHasUnsavedChanges, showToast]);

  const savedWorkloadSnapshotRef = useRef(null);
  const savedTeacherTermSnapshotRef = useRef(new Map());
  const [isSaving, setIsSaving] = useState(false);

  const setTeacherTermSavedSnapshot = useCallback((personId, term, rows) => {
    if (!personId) return;
    const cleanSchool = resolveSchoolId(schoolInfo?.schoolId);
    const snapKey = `${cleanSchool}__${personId}__${term}`;
    savedTeacherTermSnapshotRef.current.set(snapKey, normalizeRowsForComparison(rows || [], term));
  }, [schoolInfo?.schoolId]);

  const isTeacherDirty = useCallback((personId, term, rows) => {
    if (!personId) return false;
    const cleanSchool = resolveSchoolId(schoolInfo?.schoolId);
    const snapKey = `${cleanSchool}__${personId}__${term}`;
    if (!savedTeacherTermSnapshotRef.current.has(snapKey)) return false;
    const savedNorm = savedTeacherTermSnapshotRef.current.get(snapKey) || [];
    const currentNorm = normalizeRowsForComparison(rows || [], term);
    return JSON.stringify(currentNorm) !== JSON.stringify(savedNorm);
  }, [schoolInfo?.schoolId]);

  const getPersonWorkloadSnapshot = useCallback((p) => {
    if (!p) return null;
    return {
      id: String(p.id),
      workloadRows: normalizeRowsForComparison(p.workloadRows || []),
      teachingRelatedRows: (p.teachingRelatedRows || p.teaching_related_rows || []).map(r => ({
        task: r.task || '',
        dates: Array.isArray(r.dates) ? r.dates : []
      })),
      administrativeRows: (p.administrativeRows || p.administrative_rows || []).map(r => ({
        task: r.task || '',
        dates: Array.isArray(r.dates) ? r.dates : []
      }))
    };
  }, []);

  const getFullWorkloadSnapshot = useCallback(() => {
    return (personnel || []).map(p => {
      const activeMatch = currentPerson && String(currentPerson.id) === String(p.id) ? currentPerson : p;
      return getPersonWorkloadSnapshot(activeMatch);
    });
  }, [personnel, currentPerson, getPersonWorkloadSnapshot]);

  useEffect(() => {
    if (savedWorkloadSnapshotRef.current === null && personnel && personnel.length > 0) {
      savedWorkloadSnapshotRef.current = JSON.stringify(getFullWorkloadSnapshot());
    }
  }, [personnel, getFullWorkloadSnapshot]);


  // ── Saved rows are the baseline ─────────────────────────────────────────────────────────────────
  // esf7_workload_rows (read through GET /workloads/personnel/:id/state) is the source of truth for a teacher + term.
  // The local copy (localStorage draft / school draft) is kept only when it holds unsaved changes made on top of the
  // version it started from (person.workloadBaseVersion); if the database moved on, the user chooses which to keep.
  const [workloadSync, setWorkloadSync] = useState({}); // personId -> { status: 'checking' | 'confirmed' | 'unconfirmed', term, message? }
  const hydrateSeqRef = useRef(0);
  const latestWorkloadRef = useRef({});
  latestWorkloadRef.current = { personnel, editPerson };
  const hydrateWorkloadRef = useRef(() => Promise.resolve());

  // Records `person` (with the term's rows replaced by the saved ones) as the saved baseline, so only real differences count as unsaved.
  const patchSavedSnapshot = useCallback((person) => {
    if (!person || !savedWorkloadSnapshotRef.current) return;
    try {
      const parsed = JSON.parse(savedWorkloadSnapshotRef.current);
      if (!Array.isArray(parsed)) return;
      const entry = getPersonWorkloadSnapshot(person);
      const idx = parsed.findIndex(sp => String(sp.id) === String(person.id));
      if (idx >= 0) parsed[idx] = entry; else parsed.push(entry);
      savedWorkloadSnapshotRef.current = JSON.stringify(parsed);
    } catch (e) { /* keep the previous baseline */ }
  }, [getPersonWorkloadSnapshot]);

  // Updates one teacher everywhere the page reads from: roster state, the open editor and the local draft.
  // termRows = { term, rows } replaces that term's rows (other terms are kept); baseVersion is the marker last seen.
  const saveInFlightRef = useRef(new Set()); // teacher ids with a save running: blocks double submits on every save path

  // baseRows = { term, rows } (or { all: true, rows }) are the saved rows the local copy was built on; the per-block merge diffs against them.
  const applyWorkloadToPerson = useCallback((personId, { termRows = null, baseVersion, baseRows = null, skipDraft = false }) => {
    const remap = (rows) => (Array.isArray(rows) ? rows : []).map(r => {
      const matched = matchSectionForWorkloadRow(r, classSections);
      if (matched) {
        return {
          ...r,
          sectionId: String(matched.id),
          sectionName: matched.sectionName || r.sectionName || '',
          gradeLevel: matched.gradeLevel || r.gradeLevel || '',
          trackStrand: matched.trackStrand || r.trackStrand || ''
        };
      }
      return r;
    });

    const patch = (p) => {
      const next = { ...p };
      if (baseVersion !== undefined) next.workloadBaseVersion = baseVersion;
      if (baseRows) {
        const remappedBase = remap(baseRows.rows);
        next.workloadBaseRows = baseRows.all
          ? remappedBase
          : [...(Array.isArray(p.workloadBaseRows) ? p.workloadBaseRows : []).filter(r => (r.term || '1st') !== baseRows.term), ...remappedBase];
      }
      if (termRows) {
        const remappedTerm = remap(termRows.rows);
        next.workloadRows = [
          ...(Array.isArray(p.workloadRows) ? p.workloadRows : []).filter(r => (r.term || '1st') !== termRows.term),
          ...remappedTerm
        ];
      }
      return next;
    };
    setPersonnel(prev => (Array.isArray(prev) ? prev : []).map(p => (String(p.id) === String(personId) ? patch(p) : p)));
    setEditPerson(prev => (prev && String(prev.id) === String(personId) ? patch(prev) : prev));
    if (skipDraft) return; // a declined draft stays exactly as it was
    const key = `draft_workload_${personId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) localStorage.setItem(key, JSON.stringify(patch(JSON.parse(raw))));
    } catch (e) { /* the draft is left as it was */ }
  }, [setPersonnel, classSections]);

  const hydrateWorkloadFromServer = useCallback(async (personId, term, { afterSave = false } = {}) => {
    const schoolId = schoolInfo?.schoolId;
    if (!personId || !schoolId) return;
    if (!afterSave && saveInFlightRef.current.has(String(personId))) return; // a save is running; its confirmation updates the editor
    const seq = ++hydrateSeqRef.current;
    setWorkloadSync(prev => ({ ...prev, [personId]: { status: 'checking', term } }));

    let state;
    try {
      state = await api.getWorkloadState(personId, term, schoolId);
    } catch (err) {
      if (seq !== hydrateSeqRef.current) return;
      if (err?.status === 404 && err?.body?.error === 'Personnel not found') {
        state = { rows: [], version: null }; // not in the database yet: nothing saved
      } else {
        // The database could not be read: do not compare or restore. Fall back to the browser draft (flagged below as not
        // yet confirmed saved) and run the comparison again once the database is reachable.
        restoreResolutions.set(resolutionKey(personId, term), 'unreachable');
        try {
          const rawDraft = localStorage.getItem(`draft_workload_${personId}`);
          const fallback = rawDraft ? JSON.parse(rawDraft) : null;
          if (fallback && Array.isArray(fallback.workloadRows)) {
            applyWorkloadToPerson(personId, { termRows: { term, rows: fallback.workloadRows.filter(r => (r.term || '1st') === term) }, skipDraft: true });
          }
        } catch (draftError) { /* keep what the editor holds */ }
        setWorkloadSync(prev => ({ ...prev, [personId]: { status: 'unconfirmed', term, message: err?.message || 'The server could not be reached.' } }));
        return;
      }
    }
    if (seq !== hydrateSeqRef.current) return;

    const { personnel: list, editPerson: open } = latestWorkloadRef.current;
    const person = (open && String(open.id) === String(personId)) ? open : (list || []).find(p => String(p.id) === String(personId));
    if (!person) return;

    const dbRows = dedupeWorkloadRows(personId, (state.rows || []).map(r => {
      const termRow = { ...r, term: r.term || term };
      const matched = matchSectionForWorkloadRow(termRow, classSections);
      if (matched) {
        return {
          ...termRow,
          sectionId: String(matched.id),
          sectionName: matched.sectionName || termRow.sectionName || '',
          gradeLevel: matched.gradeLevel || termRow.gradeLevel || '',
          trackStrand: matched.trackStrand || termRow.trackStrand || ''
        };
      }
      return termRow;
    }));
    const version = versionOf(state.version);
    const localRows = Array.isArray(person.workloadRows) ? person.workloadRows : [];

    // Store baseline from esf7_workload_rows per school, teacher, and term
    setTeacherTermSavedSnapshot(personId, term, dbRows);

    const draftKey = `draft_workload_${personId}`;
    const key = resolutionKey(personId, term);
    const prior = restoreResolutions.get(key);
    const teacherName = `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'this teacher';
    const outsideTerm = (rows) => (Array.isArray(rows) ? rows : []).filter(r => (r.term || '1st') !== term);

    let draftObj = null;
    try {
      const rawDraft = localStorage.getItem(draftKey);
      if (rawDraft) draftObj = JSON.parse(rawDraft);
    } catch (e) {
      localStorage.removeItem(draftKey);
    }
    const draftRowsAll = draftObj && Array.isArray(draftObj.workloadRows) ? draftObj.workloadRows : null;
    // The local copy is the browser draft when there is one; otherwise the rows the roster currently holds.
    const localCopy = draftRowsAll || localRows;

    const adoptSaved = () => applyWorkloadToPerson(personId, {
      termRows: { term, rows: dbRows }, baseVersion: version, baseRows: { term, rows: dbRows }
    });

    if (afterSave) {
      // A confirmed save (or an explicit discard): show exactly what is saved.
      adoptSaved();
      if (draftObj && outsideTerm(draftRowsAll).length === 0) localStorage.removeItem(draftKey);
      restoreResolutions.set(key, 'clean');
    } else if (prior && prior !== 'unreachable') {
      // Already checked in this page load: never ask again.
      if (prior === 'declined' && restoreDeclined.has(String(personId))) {
        applyWorkloadToPerson(personId, { termRows: { term, rows: dbRows }, baseVersion: version, baseRows: { term, rows: dbRows }, skipDraft: true });
      } else if (prior === 'clean') {
        adoptSaved();
      } else {
        // restored / edited: the editor's rows are the user's; only move the baseline to what is saved now.
        applyWorkloadToPerson(personId, { termRows: null, baseVersion: version, baseRows: { term, rows: dbRows } });
      }
    } else {
      const identical = JSON.stringify(normalizeRowsForComparison(localCopy, term)) === JSON.stringify(normalizeRowsForComparison(dbRows, term));
      const comparison = identical
        ? { action: 'clean', reason: 'identical' }
        : compareDraftToDatabase({
          personId, term, dbRows, dbVersion: state.version, localRows: localCopy,
          baseRows: Array.isArray(person.workloadBaseRows) ? person.workloadBaseRows : undefined,
          draftSavedAt: (draftObj && draftObj.workloadDraftSavedAt) || person.workloadDraftSavedAt
        });

      if (comparison.action === 'clean') {
        // Identical, or older with nothing extra: discard silently, no prompt, no unsaved-changes banner.
        adoptSaved();
        if (draftObj && outsideTerm(draftRowsAll).length === 0) localStorage.removeItem(draftKey);
        restoreResolutions.set(key, 'clean');
      } else {
        restoreResolutions.set(key, 'prompting');
        const choice = await showWorkloadRestoreModal({ teacherName, term, summary: comparison.summary });
        if (choice === 'restore') {
          // Only now does the draft go into the editor: its differences on top of the saved rows, as unsaved changes.
          restoreDeclined.delete(String(personId));
          restoreResolutions.set(key, 'restored');
          applyWorkloadToPerson(personId, {
            termRows: { term, rows: comparison.rows }, baseVersion: version, baseRows: { term, rows: dbRows }
          });
          try {
            localStorage.setItem(draftKey, JSON.stringify({
              ...person,
              workloadRows: [...outsideTerm(localCopy), ...comparison.rows],
              workloadBaseVersion: version,
              workloadBaseRows: [...outsideTerm(person.workloadBaseRows), ...dbRows],
              workloadDraftSavedAt: new Date().toISOString()
            }));
          } catch (e) { /* the restored rows are still in the editor */ }
        } else {
          // Declined: the editor shows the saved rows; the draft is kept untouched (stashed first if it only lived in the roster).
          restoreDeclined.add(String(personId));
          restoreResolutions.set(key, 'declined');
          if (!draftObj) {
            try { localStorage.setItem(draftKey, JSON.stringify({ ...person, workloadRows: localCopy })); } catch (e) { /* nothing to keep */ }
          }
          applyWorkloadToPerson(personId, {
            termRows: { term, rows: dbRows }, baseVersion: version, baseRows: { term, rows: dbRows }, skipDraft: true
          });
        }
      }
    }
    // The saved rows are the "saved" side of the comparison; local rows that differ from them show as unsaved.
    patchSavedSnapshot({ ...person, workloadRows: [...outsideTerm(localRows), ...dbRows] });
    setWorkloadSync(prev => ({ ...prev, [personId]: { status: 'confirmed', term } }));
  }, [schoolInfo?.schoolId, applyWorkloadToPerson, patchSavedSnapshot, setTeacherTermSavedSnapshot]);
  hydrateWorkloadRef.current = hydrateWorkloadFromServer;

  // Runs after the server confirmed a write (and the rows were verified). The editor is rebuilt from the rows the
  // server saved and the browser draft is cleared, unless the user changed something while the save was running:
  // those newer edits are compared against the rows that were SENT and are kept as the new draft, never discarded.
  const commitConfirmedSave = useCallback((sentPerson, res) => {
    const personId = sentPerson.id;
    const { personnel: list, editPerson: open } = latestWorkloadRef.current;
    const latest = (open && String(open.id) === String(personId))
      ? open
      : ((list || []).find(p => String(p.id) === String(personId)) || sentPerson);
    const sentRows = res?.sentRows || sentPerson.workloadRows || [];
    const serverRows = Array.isArray(res?.data) ? dedupeWorkloadRows(personId, res.data) : sentRows;
    const edited = editedSinceSent(sentRows, latest.workloadRows || []);
    const person = {
      ...sentPerson,
      ...(edited
        ? { workloadRows: latest.workloadRows || [], workloadVerified: false, workloadValidated: false }
        : { workloadRows: serverRows }),
      workloadBaseVersion: versionOf(res?.workloadSavedAt),
      workloadBaseRows: serverRows
    };
    const draftKey = `draft_workload_${personId}`;
    try {
      if (edited) localStorage.setItem(draftKey, JSON.stringify(person));
      else localStorage.removeItem(draftKey);
    } catch (e) { /* storage unavailable: nothing to clear */ }
    setPersonnel(prev => (Array.isArray(prev) ? prev : []).map(p => (String(p.id) === String(personId) ? person : p)));
    setEditPerson(prev => (prev && String(prev.id) === String(personId) ? person : prev));
    // The saved rows are the new "saved" side; newer edits (if any) then show as unsaved, and nothing else does.
    setTeacherTermSavedSnapshot(personId, activeTerm, serverRows);
    patchSavedSnapshot({ ...person, workloadRows: serverRows });
    return { person, edited };
  }, [setPersonnel, patchSavedSnapshot, setTeacherTermSavedSnapshot, activeTerm]);

  // If the saved rows could not be read, look again every 30 seconds and as soon as the browser reports it is back online.
  useEffect(() => {
    const id = currentPerson?.id;
    if (!id || workloadSync[id]?.status !== 'unconfirmed') return undefined;
    const retry = () => hydrateWorkloadRef.current(id, activeTerm);
    const timer = setInterval(retry, 30000);
    window.addEventListener('online', retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [currentPerson?.id, activeTerm, workloadSync]);

  // Re-read the saved rows whenever the selected teacher or term changes.
  useEffect(() => {
    if (!dbPerson?.id) return;
    hydrateWorkloadRef.current(dbPerson.id, activeTerm);
  }, [dbPerson?.id, activeTerm, schoolInfo?.schoolId]);

  // Real dirty checks: only flag dirty when normalized rows really differ from the saved database snapshot.
  const isCurrentTeacherDirty = useMemo(() => {
    if (!currentPerson?.id) return false;
    return isTeacherDirty(currentPerson.id, activeTerm, currentPerson.workloadRows);
  }, [currentPerson, activeTerm, isTeacherDirty, workloadSync]);

  const hasLocalDrafts = useMemo(() => {
    const cleanSchool = resolveSchoolId(schoolInfo?.schoolId);
    return (personnel || []).some(p => {
      if (!p?.id || (currentPerson && String(p.id) === String(currentPerson.id))) return false;
      const snapKey = `${cleanSchool}__${p.id}__${activeTerm}`;
      if (!savedTeacherTermSnapshotRef.current.has(snapKey)) return false;
      const raw = localStorage.getItem(`draft_workload_${p.id}`);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        const draftNorm = normalizeRowsForComparison(parsed.workloadRows || [], activeTerm);
        const savedNorm = savedTeacherTermSnapshotRef.current.get(snapKey) || [];
        return JSON.stringify(draftNorm) !== JSON.stringify(savedNorm);
      } catch (e) {
        return false;
      }
    });
  }, [personnel, currentPerson, activeTerm, schoolInfo?.schoolId, workloadSync]);

  const isDirty = Boolean(isCurrentTeacherDirty || hasLocalDrafts);
  // A draft the user declined to restore stays in the browser; leaving the page still offers it through the unsaved-changes alert.
  const hasDeclinedDraft = [...restoreDeclined].some(id => Boolean(localStorage.getItem(`draft_workload_${id}`)));

  const handleDiscard = useCallback(() => {
    (personnel || []).forEach(p => {
      localStorage.removeItem(`draft_workload_${p.id}`);
    });
    if (dbPerson?.id) {
      hydrateWorkloadFromServer(dbPerson.id, activeTerm, { afterSave: true });
    }
  }, [personnel, dbPerson?.id, activeTerm, hydrateWorkloadFromServer]);

  const isSavingRef = useRef(false);
  const runWorkloadSaveRef = useRef(() => Promise.resolve({ ok: true }));

  const { confirmAction } = useDirtyGuard({
    screenId: 'workload',
    isDirty: isDirty || hasDeclinedDraft,
    onDiscard: handleDiscard,
    onSave: () => runWorkloadSaveRef.current()
  });

  const currentPersonRef = useRef(currentPerson);
  useEffect(() => {
    currentPersonRef.current = currentPerson;
  }, [currentPerson]);

  // Register auto-save handler on navigation (e.g. clicking Node Map)
  useEffect(() => {
    if (!registerAutoSaveHandler) return;
    return registerAutoSaveHandler('workload', async () => {
      const p = currentPersonRef.current;
      if (!p || !p.id) return false;
      try {
        const draftKey = `draft_personnel_${p.id}`;
        localStorage.setItem(draftKey, JSON.stringify(p));
        localStorage.removeItem(`draft_workload_${p.id}`);
        return true;
      } catch (e) {
        console.warn('[Workload Auto-Save Notice]:', e);
      }
      return false;
    });
  }, [registerAutoSaveHandler]);

  const [validatedTeacherMap, setValidatedTeacherMap] = useState(() => {
    try {
      const activeId = schoolInfo?.schoolId || localStorage.getItem('activeSchoolId') || 'default';
      const saved = localStorage.getItem(`insighted_validated_workloads_${activeId}`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const markTeacherValidated = useCallback((personId, isValidated = true) => {
    if (!personId) return;
    setValidatedTeacherMap(prev => {
      const next = { ...prev, [personId]: isValidated };
      try {
        const activeId = schoolInfo?.schoolId || localStorage.getItem('activeSchoolId') || 'default';
        localStorage.setItem(`insighted_validated_workloads_${activeId}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, [schoolInfo?.schoolId]);

  const handleFieldChangeForPerson = (personId, key, value) => {
    if (!personId) return;
    const baseP = personnel.find(p => p.id === personId);
    if (!baseP) return;

    markTeacherValidated(personId, false);

    const draftKey = `draft_workload_${personId}`;
    let targetPerson = baseP;
    if (editPerson && editPerson.id === personId) {
      targetPerson = editPerson;
    } else {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed) targetPerson = parsed;
        } catch (e) {}
      }
    }

    const updated = { ...targetPerson, [key]: value, workloadValidated: false, workloadDraftSavedAt: new Date().toISOString() };
    // The user is editing: from now on the editor's own rows are the ones that count for this teacher and term.
    noteUserEdit(personId, activeTerm);
    if (currentPerson && currentPerson.id === personId) {
      setEditPerson(updated);
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleFieldChange = (key, value) => {
    if (!currentPerson) return;
    handleFieldChangeForPerson(currentPerson.id, key, value);
  };

  const handleCopyFirstTermToSecondTerm = useCallback(async (targetScope = 'CURRENT') => {
    if (targetScope === 'ALL') {
      if (window.confirm("Are you sure you want to copy the 1st Term workload setup to 2nd Term for ALL teachers in the school? Any existing 2nd Term schedules will be replaced with a fresh copy.")) {
        await copyTermData('1st', '2nd');
      }
    } else {
      if (!currentPerson) return;
      const rows = Array.isArray(currentPerson.workloadRows) ? [...currentPerson.workloadRows] : [];
      const firstTermRows = rows.filter(r => (r.term || '1st') === '1st');
      if (firstTermRows.length === 0) {
        if (showToast) showToast('No 1st Term schedule found to copy for this teacher.', 'warning');
        return;
      }
      const otherTermRows = rows.filter(r => (r.term || '1st') !== '2nd');
      const clonedRows = firstTermRows.map((r, idx) => ({
        ...r,
        id: `r-term-2nd-${currentPerson.id}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        term: '2nd'
      }));
      const updatedRows = [...otherTermRows, ...clonedRows];
      handleFieldChange('workloadRows', updatedRows);
      if (showToast) showToast(`✓ Copied 1st Term workload (${firstTermRows.length} classes) to 2nd Term for ${currentPerson.firstName || 'this teacher'}.`, 'success');
    }
  }, [copyTermData, currentPerson, handleFieldChange, showToast]);

  // Attention modal auto-popup disabled

  const allTeachingRelatedOptions = useMemo(() => {
    const list = new Set(TEACHING_RELATED_TASK_OPTIONS);
    (OFFICIAL_DESIGNATIONS || []).forEach(d => {
      if (d.name) {
        list.add(d.name);
        list.add(`TR - ${d.name}`);
      }
    });
    return Array.from(list);
  }, []);

  const personDesigSignature = `${currentPerson?.id || ''}_${currentPerson?.designation || ''}_${JSON.stringify(currentPerson?.designations || [])}`;

  useEffect(() => {
    if (!currentPerson) return;

    // Collect all official designations assigned to currentPerson
    const desigsToSync = [];
    if (currentPerson.designation && typeof currentPerson.designation === 'string' && currentPerson.designation.trim()) {
      desigsToSync.push(currentPerson.designation.trim());
    }
    if (Array.isArray(currentPerson.designations)) {
      currentPerson.designations.forEach(d => {
        if (d && !desigsToSync.includes(d)) desigsToSync.push(d);
      });
    }

    // Strict alignment: Teaching-Related Tasks apply ONLY when personnel is designated in Official Designations
    const updatedTR = desigsToSync.map(desigItem => {
      const rawDesig = typeof desigItem === 'string'
        ? String(desigItem).replace(/::APPROVED_SDS/gi, '').trim()
        : String(desigItem?.designationName || desigItem?.name || desigItem?.designation || '').replace(/::APPROVED_SDS/gi, '').trim();

      const isSds = typeof desigItem === 'string'
        ? String(desigItem).includes('::APPROVED_SDS')
        : !!(desigItem?.isSdsApproved || desigItem?.is_sds_approved);

      const existing = (currentPerson.teachingRelatedRows || []).find(r => {
        const rTask = String(r.task || r.task_name || '').toLowerCase().trim();
        return rTask === rawDesig.toLowerCase() || rTask.includes(rawDesig.toLowerCase()) || rawDesig.toLowerCase().includes(rTask);
      });

      const durMins = existing?.duration_minutes !== undefined
        ? Number(existing.duration_minutes)
        : (existing?.durationMinutes !== undefined ? Number(existing.durationMinutes) : (existing?.hours ? Math.round(Number(existing.hours) * 60) : 60));

      const cadence = existing?.cadence || existing?.frequency || 'weekly';

      return {
        task: rawDesig,
        task_name: rawDesig,
        cadence: cadence,
        frequency: cadence,
        duration_minutes: durMins,
        durationMinutes: durMins,
        hours: durMins / 60,
        isDesignationSynced: true,
        isLocked: true,
        isSdsApproved: isSds,
        designatedBySds: isSds
      };
    }).filter(r => Boolean(r.task));

    // Check if the current list differs from the strictly synced designations list
    const currentList = currentPerson.teachingRelatedRows || [];
    const hasDiff = currentList.length !== updatedTR.length || currentList.some((c, idx) => {
      const u = updatedTR[idx];
      return !u || c.task !== u.task || c.isSdsApproved !== u.isSdsApproved;
    });

    if (hasDiff) {
      handleFieldChange('teachingRelatedRows', updatedTR);
    }
  }, [personDesigSignature]);

  // Clustered Personnel: Comprehensive isClustered detector
  const isClustered = useMemo(() => {
    if (!currentPerson) return false;
    if (
      currentPerson.requestType === 'clustered_teacher' || 
      currentPerson.deploymentStatus === 'CLUSTERED' || 
      currentPerson.isClustered ||
      currentPerson.isShared
    ) {
      return true;
    }

    const pId = String(currentPerson.id || '').toUpperCase();
    const pPrn = String(currentPerson.prn || '').toUpperCase();
    const pName = `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.toUpperCase().trim();

    const allReqs = [...(requestHistory || []), ...(outgoingRequests || []), ...(incomingRequests || [])];
    return allReqs.some(r => {
      const isReqClustered = String(r.requestType || r.request_type || '').toLowerCase().includes('cluster');
      const isApproved = String(r.status || '').toLowerCase() === 'approved';
      if (!isReqClustered || !isApproved) return false;
      const reqPId = String(r.personnelId || r.personnel_id || '').toUpperCase();
      const reqPName = String(r.personnelName || r.personnel_name || '').toUpperCase().trim();
      return (reqPId && (reqPId === pId || reqPId === pPrn)) || (reqPName && pName && (reqPName.includes(pName) || pName.includes(reqPName)));
    });
  }, [currentPerson, requestHistory, outgoingRequests, incomingRequests]);

  // Broadcast local slots for Clustered Teachers on demand
  const broadcastClusteredSlots = useCallback((slotsToBroadcast) => {
    if (!isClustered || !currentPerson || !schoolInfo?.schoolId) return;

    const prn = currentPerson.prn || currentPerson.id || `${currentPerson.firstName} ${currentPerson.lastName}`;
    const schId = String(schoolInfo.schoolId).replace('SCH-', '').trim();

    api.broadcastClusteredGhostSlots(prn, {
      authorSchoolId: schId,
      authorSchoolName: schoolInfo.schoolName || `School ${schId}`,
      slots: slotsToBroadcast !== undefined ? slotsToBroadcast : (currentPerson?.workloadRows || [])
    }).then(data => {
      if (data && data.success && Array.isArray(data.sharedSlots)) {
        requestAnimationFrame(() => {
          setSharedWorkloadRows(prev => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(data.sharedSlots);
            return prevStr === nextStr ? prev : data.sharedSlots;
          });
        });
      }
    }).catch(err => console.error('[Clustered Sync Broadcast Error]:', err));
  }, [
    isClustered,
    currentPerson?.prn, 
    currentPerson?.id, 
    currentPerson?.firstName, 
    currentPerson?.lastName, 
    currentPerson?.workloadRows, 
    schoolInfo?.schoolId, 
    schoolInfo?.schoolName
  ]);

  // 1. Reactive Auto-Broadcast: whenever currentPerson.workloadRows changes, broadcast live to partner station
  useEffect(() => {
    if (!isClustered || !currentPerson || !schoolInfo?.schoolId) return;
    const prn = currentPerson.prn || currentPerson.id || `${currentPerson.firstName} ${currentPerson.lastName}`;
    const schId = String(schoolInfo.schoolId).replace('SCH-', '').trim();
    const mySlots = currentPerson.workloadRows || [];

    const debounceTimer = setTimeout(() => {
      api.broadcastClusteredGhostSlots(prn, {
        authorSchoolId: schId,
        authorSchoolName: schoolInfo.schoolName || `School ${schId}`,
        slots: mySlots
      }).then(data => {
        if (data && data.success && Array.isArray(data.sharedSlots)) {
          requestAnimationFrame(() => {
            setSharedWorkloadRows(prev => {
              const prevStr = JSON.stringify(prev);
              const nextStr = JSON.stringify(data.sharedSlots);
              return prevStr === nextStr ? prev : data.sharedSlots;
            });
          });
        }
      }).catch(err => console.warn('[Clustered Auto-Broadcast Error]:', err));
    }, 250);

    return () => clearTimeout(debounceTimer);
  }, [
    isClustered,
    currentPerson?.id,
    currentPerson?.prn,
    currentPerson?.firstName,
    currentPerson?.lastName,
    currentPerson?.workloadRows,
    schoolInfo?.schoolId,
    schoolInfo?.schoolName
  ]);

  // 2. Continuous Polling: Poll partner school slots strictly for clustered/reassigned personnel
  useEffect(() => {
    if (!isClustered || !currentPerson || !schoolInfo?.schoolId) {
      setSharedWorkloadRows([]);
      return;
    }

    const prn = currentPerson.prn || currentPerson.id || `${currentPerson.firstName} ${currentPerson.lastName}`;
    const schId = String(schoolInfo.schoolId).replace('SCH-', '').trim();

    const fetchPartnerSlots = () => {
      api.getClusteredGhostSlots(prn, schId)
        .then(data => {
          if (data && data.success && Array.isArray(data.sharedSlots)) {
            requestAnimationFrame(() => {
              setSharedWorkloadRows(prev => {
                const prevStr = JSON.stringify(prev);
                const nextStr = JSON.stringify(data.sharedSlots);
                return prevStr === nextStr ? prev : data.sharedSlots;
              });
            });
          }
        })
        .catch(err => console.warn('[Clustered Sync Polling Error]:', err));
    };

    fetchPartnerSlots();

    const pollTimer = setInterval(fetchPartnerSlots, 10000);
    return () => clearInterval(pollTimer);
  }, [
    isClustered,
    activePersonnelId, 
    currentPerson?.id, 
    currentPerson?.prn, 
    currentPerson?.deploymentStatus,
    currentPerson?.deployment_status,
    currentPerson?.clusteredSchools,
    schoolInfo?.schoolId
  ]);




  const getSubjectsForGrade = (grade, category = 'Elementary') => {
    const normGrade = grade ? String(grade).replace(/\s*[\u2013\u2014-]\s*/g, ' - ').trim() : '';

    // 1. SNED Rule: If section is SNED, return strictly SNED MODIFIED SUBJECT
    if (normGrade.toUpperCase() === 'SNED' || normGrade.toUpperCase().includes('SNED') || normGrade.toUpperCase().includes('NON-GRADED') || normGrade.toUpperCase().includes('SPED')) {
      return ['SNED MODIFIED SUBJECT'];
    }

    // 2. ALS Rule: If section is ALS, return strictly ALS Learning Strands (LS 1 to LS 6)
    if (normGrade.toUpperCase() === 'ALS' || normGrade.toUpperCase().includes('ALS') || String(category || '').toUpperCase().includes('ALS')) {
      return [
        'LS 1: Communication Skills',
        'LS 2: Scientific Literacy and Critical Thinking',
        'LS 3: Mathematical and Problem Solving Skills',
        'LS 4: Life and Career Skills',
        'LS 5: Understanding the Self and Society',
        'LS 6: Digital Citizenship'
      ];
    }

    // 3. ARAL Rule: If section or grade is ARAL, return strictly ARAL subjects ONLY
    if (normGrade.toUpperCase() === 'ARAL' || normGrade.toUpperCase().includes('ARAL')) {
      return ['ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'];
    }

    if (normGrade && normGrade.includes(' - ')) {
      const parts = normGrade.split(' - ');
      const gradeRegex = /^(grade\s*\d+|kinder|kindergarten|sned|als|aral|g\d+)$/i;
      const isTrueMultiGrade = parts.filter(p => gradeRegex.test(p.trim())).length > 1;
      if (isTrueMultiGrade) {
        const union = new Set();
        parts.forEach(p => {
          const subs = getSubjectsForGrade(p, category);
          subs.forEach(s => union.add(s));
        });
        return Array.from(union);
      }
    }

    let baseList = [];
    const uG = normGrade.toUpperCase();
    if (uG.includes('KINDER')) {
      return ['KINDER BLOCKS OF TIME'];
    } else if (grade === 'MONO-GRADE') {
      if (category === 'Elementary') baseList = ELEMENTARY_MONO_GRADE_SUBJECTS;
      else if (category === 'JHS') baseList = JHS_MONO_GRADE_SUBJECTS;
      else if (category === 'SHS') baseList = SHS_MONO_GRADE_SUBJECTS;
      else baseList = ELEMENTARY_MONO_GRADE_SUBJECTS;
    } else if (grade === 'NON-GRADED') {
      if (category === 'JHS') baseList = JHS_NON_GRADED_SUBJECTS;
      else if (category === 'SHS') baseList = SHS_NON_GRADED_SUBJECTS;
      else baseList = JHS_NON_GRADED_SUBJECTS;
    } else if (uG.includes('11') || uG.includes('12') || uG.includes('SHS') || uG.includes('SENIOR')) {
      const isGrade12 = uG.includes('12');
      if (category === 'SHS') baseList = isGrade12 ? SHS_GRADE12_SUBJECTS : SHS_SUBJECTS;
      else if (category === 'SHS-CORE SUBJECTS') baseList = isGrade12 ? SHS_CORE_GRADE12_SUBJECTS : SHS_CORE_SUBJECTS;
      else if (category === 'SHS-APPLIED SUBJECTS') baseList = isGrade12 ? SHS_APPLIED_GRADE12_SUBJECTS : SHS_APPLIED_SUBJECTS;
      else if (category === 'SHS-SPECIALIZED SUBJECTS') baseList = isGrade12 ? SHS_SPECIALIZED_GRADE12_SUBJECTS : SHS_SPECIALIZED_SUBJECTS;
      else if (category === 'SSHS-CORE') baseList = SSHS_CORE_SUBJECTS;
      else if (category === 'SSHS-ACADEMIC') baseList = isGrade12 ? SSHS_ACADEMIC_GRADE12_SUBJECTS : SSHS_ACADEMIC_SUBJECTS;
      else if (category === 'SSHS-TECHPRO') baseList = isGrade12 ? SSHS_TECHPRO_GRADE12_SUBJECTS : SSHS_TECHPRO_SUBJECTS;
      else baseList = isGrade12 ? SHS_GRADE12_SUBJECTS : SHS_SUBJECTS;
    } else if (
      (uG.includes('10') && !uG.includes('11') && !uG.includes('12')) ||
      uG.includes('9') ||
      uG.includes('8') ||
      uG.includes('7') ||
      uG.includes('JHS') ||
      uG.includes('JUNIOR') ||
      String(category || '').toUpperCase().includes('JHS') ||
      String(category || '').toUpperCase().includes('JUNIOR')
    ) {
      baseList = JHS_SUBJECTS;
    } else if (GRADE_LEVEL_SUBJECTS[grade]) {
      baseList = GRADE_LEVEL_SUBJECTS[grade];
    } else if (GRADE_LEVEL_SUBJECTS[normGrade]) {
      baseList = GRADE_LEVEL_SUBJECTS[normGrade];
    } else {
      if (uG.includes('4')) baseList = GRADE_LEVEL_SUBJECTS['Grade 4'] || [];
      else if (uG.includes('5')) baseList = GRADE_LEVEL_SUBJECTS['Grade 5'] || [];
      else if (uG.includes('6')) baseList = GRADE_LEVEL_SUBJECTS['Grade 6'] || [];
      else if (uG.includes('1') && !uG.includes('10') && !uG.includes('11') && !uG.includes('12')) baseList = GRADE_LEVEL_SUBJECTS['Grade 1'] || [];
      else if (uG.includes('2')) baseList = GRADE_LEVEL_SUBJECTS['Grade 2'] || [];
      else if (uG.includes('3')) baseList = GRADE_LEVEL_SUBJECTS['Grade 3'] || [];
      else baseList = SUBJECT_OPTIONS;
    }

    // Unify REMEDIATION & REMEDIAL/ENHANCEMENT CLASS into one subject option, and filter out ADVISORY
    const unifiedList = (baseList || []).map(s => {
      const u = String(s || '').toUpperCase().trim();
      return (u === 'REMEDIATION' || u === 'REMEDIAL/ENHANCEMENT CLASS') ? 'REMEDIAL / ENHANCEMENT CLASS' : u;
    });

    // Check disabled map for standard subjects
    const disabledMap = (() => {
      try {
        return schoolInfo?.subjectsConfig?.disabledMap || (localStorage.getItem('school_disabled_subjects') ? JSON.parse(localStorage.getItem('school_disabled_subjects')) : {});
      } catch (e) {
        return {};
      }
    })();

    const filtered = unifiedList.filter(subName => {
      const u = String(subName || '').toUpperCase().trim();
      if (u === 'ADVISORY' || u === 'HGP' || u.includes('HOMEROOM GUIDANCE')) return false; 
      if (isAralSubject(u)) return false; // ARAL only in ARAL sections
      if (!isSpecialProgramSubjectAllowed(subName, normGrade || category, schoolInfo)) return false;
      if (u !== 'ARALING PANLIPUNAN' && disabledMap[subName] === true) return false;
      return true;
    });

    // Explicitly guarantee ARALING PANLIPUNAN in subjects for Grade 4 to 10
    const isGrade4To10 = (
      uG.includes('4') || uG.includes('5') || uG.includes('6') ||
      uG.includes('7') || uG.includes('8') || uG.includes('9') ||
      (uG.includes('10') && !uG.includes('11') && !uG.includes('12')) ||
      uG.includes('JHS') || uG.includes('JUNIOR') ||
      String(category || '').toUpperCase().includes('JHS') ||
      String(category || '').toUpperCase().includes('JUNIOR')
    );
    if (isGrade4To10 && !filtered.some(s => String(s).toUpperCase() === 'ARALING PANLIPUNAN')) {
      filtered.push('ARALING PANLIPUNAN');
    }

    // Read and include custom subjects added in Organized Classes / School Subjects
    const customSubjects = (() => {
      try {
        if (Array.isArray(schoolInfo?.subjectsConfig?.customSubjects) && schoolInfo.subjectsConfig.customSubjects.length > 0) {
          return schoolInfo.subjectsConfig.customSubjects;
        }
        const raw = typeof window !== 'undefined' ? localStorage.getItem('school_custom_subjects') : null;
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    })();

    (customSubjects || []).forEach(cs => {
      if (!cs || !cs.name) return;
      const csName = String(cs.name).trim().toUpperCase();
      if (!csName || csName === 'ADVISORY' || csName === 'HGP' || csName.includes('HOMEROOM GUIDANCE') || csName.includes('MOTHER TONGUE')) return;
      if (disabledMap[cs.name] === true || disabledMap[csName] === true) return;

      const csBand = String(cs.band || '').toUpperCase().trim();
      const csGrade = String(cs.gradeLevel || '').toUpperCase().trim();
      const uGrade = String(normGrade || grade || '').toUpperCase().trim();
      const uCat = String(category || '').toUpperCase().trim();

      const isJHS = uGrade.includes('7') || uGrade.includes('8') || uGrade.includes('9') || uGrade.includes('10') || uGrade.includes('JHS') || uCat.includes('JHS') || uCat.includes('JUNIOR');
      const isSHS = uGrade.includes('11') || uGrade.includes('12') || uGrade.includes('SHS') || uCat.includes('SHS') || uCat.includes('SENIOR');
      const isElem = !isJHS && !isSHS;

      let matches = false;
      if (csGrade === 'ALL' || !csGrade || csGrade === uGrade) {
        if (isJHS && (csBand.includes('JHS') || csBand.includes('JUNIOR') || !csBand)) matches = true;
        else if (isSHS && (csBand.includes('SHS') || csBand.includes('SENIOR') || !csBand)) matches = true;
        else if (isElem && (csBand.includes('ELEM') || !csBand)) matches = true;
      }

      if (matches && !filtered.some(s => String(s).toUpperCase() === csName)) {
        filtered.push(cs.name);
      }
    });

    return filtered;
  };

  const handleCommitTransfer = async () => {
    if (!absentTeacherId || !substituteTeacherId || !transferStartDate || !transferEndDate || selectedWorkloadIndexes.length === 0) {
      await showAlert("Fields Required", "Please fill out all transfer fields and select at least one workload item to transfer.");
      return;
    }

    if (absentTeacherId === substituteTeacherId) {
      await showAlert("Validation Error", "The absent teacher and substitute teacher cannot be the same person.");
      return;
    }

    const absentTeacher = personnel.find(p => p.id === absentTeacherId);
    const subTeacher = personnel.find(p => p.id === substituteTeacherId);

    const transferredRows = selectedWorkloadIndexes.map(idx => absentTeacher.workloadRows[idx]);

    addWorkloadTransfer({
      absentTeacherId,
      substituteTeacherId,
      startDate: transferStartDate,
      endDate: transferEndDate,
      workloadRows: transferredRows
    });

    // Reset form
    setAbsentTeacherId('');
    setSubstituteTeacherId('');
    setTransferStartDate('');
    setTransferEndDate('');
    setSelectedWorkloadIndexes([]);
    showToast("Workload transfer committed successfully!");
  };

  const handleCancelTransfer = async (transferId) => {
    if (await showConfirm("End Coverage?", "Are you sure you want to end/cancel this workload transfer coverage?")) {
      removeWorkloadTransfer(transferId);
      showToast("Workload transfer ended.");
    }
  };

  // Compute dynamic default schedule time and day from previous workload entries (Default 1 hour)
  const getWorkloadScheduleDefaults = (workloadRows) => {
    let nextStart = '08:00';
    let nextEnd = '09:00';
    let nextDays = ['M', 'T', 'W', 'TH', 'F'];

    const rows = Array.isArray(workloadRows) ? workloadRows.filter(r => r && r.startTime && r.endTime) : [];

    if (rows.length > 0) {
      // Find the most recently added teaching subject row, or fallback to top row
      const candidateRow = rows.find(r => !isAdvisorySub(r.subject)) || rows[0];

      if (candidateRow && candidateRow.endTime) {
        const startMins = parseTimeToMinutes(candidateRow.startTime);
        const endMins = parseTimeToMinutes(candidateRow.endTime);

        if (endMins < 99999) {
          const hours = Math.floor(endMins / 60) % 24;
          const mins = endMins % 60;
          const pad = (v) => String(v).padStart(2, '0');
          nextStart = `${pad(hours)}:${pad(mins)}`;

          let duration = 60; // Default 1 hour (60-minute) period
          if (startMins < 99999 && endMins > startMins) {
            duration = Math.min(60, endMins - startMins);
          }
          if (duration <= 0) duration = 60;

          const nextEndMins = endMins + duration;
          const endHours = Math.floor(nextEndMins / 60) % 24;
          const endMinsRem = nextEndMins % 60;
          nextEnd = `${pad(endHours)}:${pad(endMinsRem)}`;
        }

        if (Array.isArray(candidateRow.days) && candidateRow.days.length > 0) {
          nextDays = [...candidateRow.days];
        }
      }
    }

    return { nextStart, nextEnd, nextDays };
  };

  const addWorkloadRow = () => {
    if (currentPerson?.type === 'non-teaching') {
      if (showToast) showToast("Non-teaching personnel cannot be assigned classroom teaching subjects.", "warning");
      return;
    }
    const assignedGrades = getAssignedGradeLevels(currentPerson);

    let initialGrade = 'Grade 1';
    let initialCategory = 'Elementary';

    if (assignedGrades.length > 0) {
      initialGrade = assignedGrades[0];
      // Find a category that supports this grade level
      const validCats = [];
      for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
        if (grades.includes(initialGrade)) {
          validCats.push(cat);
        }
      }
      if (validCats.length > 0) {
        // If there's school curricular offerings filter, try to match it
        const offerings = getExpandedOfferings();
        const matchedCat = validCats.find(c => offerings.includes(c));
        initialCategory = matchedCat || validCats[0];
      }
    } else {
      const offerings = getExpandedOfferings();
      initialCategory = offerings[0] || 'Elementary';
      const gradesForCategory = GRADE_LEVELS_BY_CATEGORY[initialCategory] || [];
      initialGrade = gradesForCategory[0] || 'Grade 1';
    }

    const initialSubjects = getSubjectsForGrade(initialGrade, initialCategory);
    const validInitialSubject = initialSubjects.find(s => !isAdvisorySub(s)) || initialSubjects[0] || '';

    const rows = [...(currentPerson.workloadRows || [])];
    const { nextStart, nextEnd, nextDays } = getWorkloadScheduleDefaults(rows);

    const newId = `new-workload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newRow = {
      id: newId,
      category: '',
      subject: '',
      gradeLevel: '',
      sectionId: '',
      startTime: nextStart,
      endTime: nextEnd,
      days: nextDays,
      term: activeTerm
    };
    rows.unshift(newRow);
    setNewlyAddedWorkloadId(newId);
    setSelectedBlockIdx(0);
    handleFieldChange('workloadRows', rows);
  };

  const removeWorkloadRow = (targetRowOrIndex) => {
    const allRows = currentPerson.workloadRows || [];
    let index = -1;
    if (typeof targetRowOrIndex === 'number') {
      index = targetRowOrIndex;
    } else if (typeof targetRowOrIndex === 'object' && targetRowOrIndex) {
      index = allRows.findIndex(r => (r.id && targetRowOrIndex.id && String(r.id) === String(targetRowOrIndex.id)) || r === targetRowOrIndex);
    } else if (typeof targetRowOrIndex === 'string') {
      index = allRows.findIndex(r => String(r.id) === String(targetRowOrIndex));
    }
    if (index === -1 || index >= allRows.length) return;
    const removedRow = allRows[index];
    const rows = [...allRows].filter((_, idx) => idx !== index);
    handleFieldChange('workloadRows', rows);

    if (removedRow && removedRow.id && !String(removedRow.id).startsWith('new-') && !String(removedRow.id).startsWith('wk-') && !String(removedRow.id).startsWith('local-')) {
      if (typeof api !== 'undefined' && api.deleteWorkloadRow) {
        const removedFromPersonId = currentPerson.id;
        api.deleteWorkloadRow(removedRow.id)
          .then((res) => applyWorkloadToPerson(removedFromPersonId, { termRows: null, baseVersion: versionOf(res?.workloadSavedAt) }))
          .catch((e) => {
            console.warn('Delete from database failed:', e);
            if (showToast) showToast('This block could not be removed from the database yet. It will be removed when you press Save.', 'warning');
          });
      }
    }
  };

  const isSHSRow = (row) => {
    if (!row) return false;
    const grade = String(row.gradeLevel || '').toUpperCase().trim();
    const category = String(row.category || '').toUpperCase().trim();
    const subject = String(row.subject || '').toUpperCase().trim();

    return (
      grade.includes('11') ||
      grade.includes('12') ||
      grade.includes('SHS') ||
      grade.includes('SENIOR') ||
      category.includes('SHS') ||
      category.includes('SSHS') ||
      subject.includes('SHS') ||
      subject.includes('WORK IMMERSION')
    );
  };

  const getTimeDiffMins = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm] = String(start).split(':').map(Number);
    const [eh, em] = String(end).split(':').map(Number);
    if (isNaN(sh) || isNaN(eh)) return 0;
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  const getRowDurationError = (row) => {
    if (!row || !row.startTime || !row.endTime) return null;
    const diffMins = getTimeDiffMins(row.startTime, row.endTime);
    if (diffMins <= 0) return "End time must be after start time";
    return null;
  };

  const getMatatagRowWarning = (row) => {
    return null;
  };

  // Only Grade 1 and Grade 2 MATATAG core subjects have an exact fixed-minute mandate (40 mins/day,
  // no flexible range) — Grade 3+ allows 45/50/55/60, so those stay freely editable. Mirrors the
  // Grade 1/2 matching logic in getMatatagRowWarning above, but returns the mandated minutes (or
  // null) instead of a warning message, so the Block Inspector can hard-lock the duration.
  const getMatatagFixedDurationMins = (row) => {
    if (!row) return null;
    const gStr = String(row.gradeLevel || '').trim().toUpperCase();
    const subStr = String(row.subject || row.task || '').trim().toUpperCase();

    const matchedSec = (classSections || []).find(s => String(s.id) === String(row.sectionId) || (s.sectionName === row.sectionName && (s.gradeLevel === row.gradeLevel || !row.gradeLevel)));
    let secGLevel = String(matchedSec?.gradeLevel || gStr).trim().toUpperCase();
    if (secGLevel === 'GRADE 1 - MATATAG') secGLevel = 'GRADE 1';
    if (secGLevel === 'GRADE 2 - MATATAG') secGLevel = 'GRADE 2';

    const isMulti = (matchedSec && (matchedSec.sectionType === 'MULTIGRADE' || String(matchedSec.sectionType).includes('MULTI') || String(matchedSec.gradeLevel).includes(' - '))) ||
                    gStr.includes(' - ') || gStr.includes('MULTI');
    if (isMulti) return null;

    if (secGLevel === 'GRADE 1') {
      const G1_MATATAG_CORE = ['LANGUAGE', 'READING AND LITERACY', 'READING & LITERACY', 'MAKABANSA', 'MATHEMATICS', 'MATH', 'GMRC', 'GOOD MORAL AND RIGHT CONDUCT'];
      if (G1_MATATAG_CORE.some(c => subStr === c || subStr.startsWith(`${c} `))) return 40;
    }
    if (secGLevel === 'GRADE 2') {
      const G2_MATATAG_CORE = ['MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'MATH', 'GMRC', 'GOOD MORAL AND RIGHT CONDUCT'];
      if (G2_MATATAG_CORE.some(c => subStr === c || subStr.startsWith(`${c} `))) return 40;
    }
    return null;
  };

  // Helper: Get standard DepEd required weekly minutes for a grade level and subject
  const getRequiredWeeklyMinutes = (gradeLevel, subjectName) => {
    if (!gradeLevel || !subjectName) return null;
    const g = String(gradeLevel).trim().toUpperCase();
    const sub = String(subjectName).trim().toUpperCase();

    // Grade 1 & Grade 2 Core Subjects (40 mins/day * 5 days = 200 mins/week)
    if (g.includes('GRADE 1') || g.includes('GRADE 2')) {
      const g1g2Core = ['LANGUAGE', 'READING AND LITERACY', 'READING & LITERACY', 'MAKABANSA', 'MATHEMATICS', 'MATH', 'GMRC', 'GOOD MORAL AND RIGHT CONDUCT', 'FILIPINO', 'ENGLISH'];
      if (g1g2Core.some(c => sub === c || sub.startsWith(`${c} `))) return 200;
    }

    // Grade 3
    if (g.includes('GRADE 3')) {
      if (sub.includes('MAKABANSA') || sub.includes('FILIPINO')) return 200;
      if (sub.includes('ENGLISH') || sub.includes('MATH') || sub.includes('SCIENCE') || sub.includes('GMRC') || sub.includes('GOOD MORAL')) return 225;
    }

    // Grades 4 - 10 (JHS & Intermediate)
    if (g.match(/GRADE\s*(4|5|6|7|8|9|10)\b/)) {
      if (sub.includes('EPP') || sub.includes('TLE') || sub.includes('MAPEH') || sub.includes('ARALING PANLIPUNAN') || sub.includes('AP') || sub.includes('FILIPINO')) return 200;
      if (sub.includes('ENGLISH') || sub.includes('MATH') || sub.includes('SCIENCE') || sub.includes('VALUES') || sub.includes('ESP') || sub.includes('GMRC')) return 225;
    }

    // SHS (Grades 11 - 12)
    if (g.includes('GRADE 11') || g.includes('GRADE 12')) {
      return 240;
    }

    return null;
  };

  // Helper: Total scheduled minutes and days for a section + subject across the school in the active term
  const getSubjectAllocationForSection = (sectionId, sectionName, subjectName, term = null, excludeRowOrId = null, gradeLevel = null) => {
    if ((!sectionId && !sectionName) || !subjectName) return { scheduledMins: 0, scheduledDays: [], teachers: [] };
    const normSub = String(subjectName).trim().toUpperCase();
    const secIdStr = String(sectionId || '');
    const secNameStr = String(sectionName || '').trim().toUpperCase();
    const targetGrade = String(gradeLevel || '').trim().toUpperCase();
    const targetTerm = term || activeTerm || '1st';

    let totalMins = 0;
    const daysSet = new Set();
    const teacherSet = new Set();

    const checkRow = (r, tName, pId) => {
      if (!r || !r.subject) return;
      if (excludeRowOrId != null) {
        if (typeof excludeRowOrId === 'object' && (r === excludeRowOrId || (r.id && excludeRowOrId.id && String(r.id) === String(excludeRowOrId.id)))) return;
        if (typeof excludeRowOrId === 'string' && r.id && String(r.id) === excludeRowOrId) return;
        if (typeof excludeRowOrId === 'number' && (currentPerson?.workloadRows || [])[excludeRowOrId] === r) return;
      }
      const rSecId = String(r.sectionId || r.section_id || '');
      const rSecName = String(r.sectionName || r.section_name || '').trim().toUpperCase();
      const rGrade = String(r.gradeLevel || r.grade_level || '').trim().toUpperCase();

      const matchSec = (secIdStr && rSecId && secIdStr === rSecId) || 
                       (secNameStr && rSecName && secNameStr === rSecName && (!targetGrade || !rGrade || targetGrade === rGrade));
      if (!matchSec) return;

      const rTerm = r.term || r.semester || '1st';
      if (rTerm !== targetTerm) return;

      const rSub = String(r.subject || r.subjectName || '').trim().toUpperCase();
      if (rSub === normSub) {
        const rDays = (Array.isArray(r.days) && r.days.length > 0)
          ? r.days
          : (r.daySchedule ? String(r.daySchedule).split(',').map(s => s.trim()) : ['M', 'T', 'W', 'TH', 'F']);
        const diffMins = (r.startTime && r.endTime) ? getTimeDiffMins(r.startTime, r.endTime) : (Number(r.minutesPerDay) || 0);
        totalMins += (diffMins * rDays.length);
        rDays.forEach(d => daysSet.add(d));
        if (tName) teacherSet.add(tName);
      }
    };

    for (const p of (personnel || [])) {
      if (p.isDraft || !Array.isArray(p.workloadRows)) continue;
      const tName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Teacher';
      for (const r of p.workloadRows) {
        checkRow(r, tName, p.id);
      }
    }

    return {
      scheduledMins: totalMins,
      scheduledDays: Array.from(daysSet),
      teachers: Array.from(teacherSet)
    };
  };

  // Helper: Find who is currently assigned to a subject in a specific section across all personnel (term-isolated)
  const getSubjectAssignmentForSection = (sectionId, sectionName, subjectName, term = null, currentRowOrId = null, gradeLevel = null, subjectGrade = null) => {
    if ((!sectionId && !sectionName) || !subjectName) return null;
    const normSub = String(subjectName).trim().toUpperCase();
    if (normSub === 'ADVISORY') return null;

    const secIdStr = String(sectionId || '');
    const secNameStr = String(sectionName || '').trim().toUpperCase();
    const targetGrade = String(gradeLevel || '').trim().toUpperCase();
    const targetTerm = term || activeTerm || '1st';

    const currentRowId = (typeof currentRowOrId === 'object' && currentRowOrId) ? String(currentRowOrId.id || '') : (typeof currentRowOrId === 'string' ? currentRowOrId : null);
    const currentRowObj = (typeof currentRowOrId === 'object') ? currentRowOrId : null;
    const currentDays = (currentRowObj && Array.isArray(currentRowObj.days) && currentRowObj.days.length > 0)
      ? currentRowObj.days
      : (currentRowObj?.daySchedule ? String(currentRowObj.daySchedule).split(',').map(s => s.trim()) : ['M', 'T', 'W', 'TH', 'F']);

    // Identification of the current teacher being edited to strictly avoid false duplicate alerts against self
    const currentPersonIds = [
      String(currentPerson?.id || ''),
      String(currentPerson?._id || ''),
      String(dbPerson?.id || ''),
      String(dbPerson?._id || ''),
      String(activePersonnelId || '')
    ].filter(Boolean);

    const currentPersonPrns = [
      String(currentPerson?.prn || ''),
      String(dbPerson?.prn || '')
    ].filter(Boolean);

    const currentFn = String(currentPerson?.firstName || dbPerson?.firstName || '').trim().toLowerCase();
    const currentLn = String(currentPerson?.lastName || dbPerson?.lastName || '').trim().toLowerCase();

    // Scan other personnel in the school
    for (const p of (personnel || [])) {
      const pId = String(p.id || p._id || '');
      const pPrn = String(p.prn || '');
      const pFn = String(p.firstName || '').trim().toLowerCase();
      const pLn = String(p.lastName || '').trim().toLowerCase();

      // Check if p is the current teacher (by id, prn, or full name)
      if (pId && currentPersonIds.includes(pId)) continue;
      if (pPrn && currentPersonPrns.includes(pPrn)) continue;
      if (currentFn && currentLn && pFn === currentFn && pLn === currentLn) continue;

      if (p.isDraft || !Array.isArray(p.workloadRows)) continue;

      for (const r of p.workloadRows) {
        if (!r || !r.subject) continue;
        if (currentRowId && r.id && String(r.id) === currentRowId) continue;
        if (currentRowObj && r === currentRowObj) continue;

        const rSecId = String(r.sectionId || r.section_id || '');
        const rSecName = String(r.sectionName || r.section_name || '').trim().toUpperCase();
        const rGrade = String(r.gradeLevel || r.grade_level || '').trim().toUpperCase();
        const rSub = String(r.subject || r.subjectName || '').trim().toUpperCase();

        const matchSec = (secIdStr && rSecId && secIdStr === rSecId) || 
                         (secNameStr && rSecName && secNameStr === rSecName && (!targetGrade || !rGrade || targetGrade === rGrade));
        if (!matchSec) continue;

        // Multigrade section: the same subject for a different grade level is a separate assignment, not a duplicate
        const wantedGrade = rowSubjectGrade({ subjectGradeLevel: subjectGrade });
        const otherGrade = rowSubjectGrade(r);
        if (wantedGrade && otherGrade && wantedGrade !== otherGrade) continue;

        // Check term
        const rTerm = r.term || r.semester || '1st';
        if (rTerm !== targetTerm) continue;

        if (rSub === normSub) {
          const rDays = (Array.isArray(r.days) && r.days.length > 0)
            ? r.days
            : (r.daySchedule ? String(r.daySchedule).split(',').map(s => s.trim()) : ['M', 'T', 'W', 'TH', 'F']);
          const hasDayOverlap = currentDays.some(d => rDays.includes(d));
          if (hasDayOverlap) {
            const teacherName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Another Teacher';
            return {
              assigned: true,
              teacherName,
              isOtherTeacher: true,
              teacherId: p.id
            };
          }
        }
      }
    }

    return null;
  };

  const getDuplicateSectionSubjectError = (row, rowRefOrIdx = null) => {
    if (!row || !row.subject) return null;
    if (isAdminTaskRow(row) || isNonTeachingTaskSubject(row.subject)) return null;
    const normSub = String(row.subject).trim().toUpperCase();
    if (normSub === 'ADVISORY') return null;

    const matchedSec = matchSectionForWorkloadRow(row, classSections);
    const secId = String(row.sectionId || row.section_id || matchedSec?.id || '');
    const secName = String(row.sectionName || row.section_name || matchedSec?.sectionName || '').trim().toUpperCase();
    if (!secId && !secName) return null;

    const term = row.term || row.semester || activeTerm || '1st';
    const assignment = getSubjectAssignmentForSection(secId, secName, normSub, term, rowRefOrIdx || row, row.gradeLevel || matchedSec?.gradeLevel, row.subjectGradeLevel);

    const targetSec = matchedSec || (classSections || []).find(s => String(s.id) === secId || (s.sectionName && String(s.sectionName).trim().toUpperCase() === secName));
    const displaySecName = targetSec?.sectionName || row.sectionName || 'this section';

    if (assignment && assignment.assigned && assignment.isOtherTeacher) {
      return `Duplicate Subject Assignment: Section "${displaySecName}" already has "${row.subject}" assigned to Teacher ${assignment.teacherName} in ${term} Term.`;
    }

    return null;
  };

  const getHgpWeeklyError = (row) => {
    if (!row) return null;
    const subStr = String(row.subject || row.subjectName || '').trim().toUpperCase();
    const isHgp = subStr === 'HGP' || subStr.includes('HOMEROOM GUIDANCE');
    if (!isHgp) return null;

    if (!row.startTime || !row.endTime) {
      return 'HGP Schedule Required: Start Time and End Time must be set.';
    }

    const diffMins = getTimeDiffMins(row.startTime, row.endTime);
    const rowDays = (Array.isArray(row.days) && row.days.length > 0)
      ? row.days
      : (row.daySchedule ? String(row.daySchedule).split(',').map(s => s.trim()) : []);

    if (rowDays.length === 0) {
      return 'HGP Schedule Required: At least one day (Monday to Friday) must be selected for HGP.';
    }

    const weeklyMins = diffMins * rowDays.length;
    if (weeklyMins !== 60) {
      return `HGP Policy: Homeroom Guidance (HGP) must total exactly 60 minutes per week across selected days under DepEd policy (Current: ${diffMins} mins/day × ${rowDays.length} day${rowDays.length > 1 ? 's' : ''} = ${weeklyMins} mins/week).`;
    }

    return null;
  };

  const updateWorkloadRow = async (index, field, value) => {
    const rows = [...(currentPerson.workloadRows || [])];
    let updatedRow = { ...rows[index], [field]: value };

    if (field === 'startTime' || field === 'endTime') {
      const sTime = updatedRow.startTime;
      const eTime = updatedRow.endTime;
      if (sTime && eTime) {
        const diff = getTimeDiffMins(sTime, eTime);
        if (diff < 0) {
          await showAlert(
            "Invalid Time Range",
            "End time must be after start time."
          );
        }
      }
    } else if (field === 'hgpMinutes') {
      if (value > 60) {
        updatedRow.hgpMinutes = 60;
        await showAlert(
          "HGP Duration Limit",
          "HGP duration cannot exceed 60 minutes (1 hour)."
        );
      }
    }

    rows[index] = updatedRow;
    handleFieldChange('workloadRows', rows);
  };

  const updateWorkloadRowFields = async (targetRowOrIndex, fieldValues) => {
    const rows = [...(currentPerson.workloadRows || [])];
    let index = -1;
    if (typeof targetRowOrIndex === 'number') {
      index = targetRowOrIndex;
    } else if (typeof targetRowOrIndex === 'object' && targetRowOrIndex) {
      index = rows.findIndex(r => (r.id && targetRowOrIndex.id && String(r.id) === String(targetRowOrIndex.id)) || r === targetRowOrIndex);
    } else if (typeof targetRowOrIndex === 'string') {
      index = rows.findIndex(r => String(r.id) === String(targetRowOrIndex));
    }
    if (index === -1 || index >= rows.length) return;
    let updatedRow = { ...rows[index], ...fieldValues };

    const isAdv = String(updatedRow.subject || '').toUpperCase().trim() === 'ADVISORY';
    if (isAdv) {
      if (fieldValues.startTime && !fieldValues.endTime && !updatedRow.endTime) {
        updatedRow.endTime = add60MinutesToTime(fieldValues.startTime);
      }
    }

    const curTerm = updatedRow.term || '1st';
    const curSub = String(updatedRow.subject || '').toUpperCase().trim();
    const curSecId = String(updatedRow.sectionId || updatedRow.section_id || '');
    const curSecName = String(updatedRow.sectionName || '').toUpperCase().trim();
    const curDays = getNormalizedRowDays(updatedRow);

    // If updating days or subject/section, ensure other fragment rows of same section & subject do not create day collisions
    if (curSub && (curSecId || curSecName)) {
      const curStart = parseMins(updatedRow.startTime);
      const curEnd = parseMins(updatedRow.endTime);

      for (let i = rows.length - 1; i >= 0; i--) {
        if (i === index) continue;
        const other = rows[i];
        const oTerm = other.term || '1st';
        const oSub = String(other.subject || '').toUpperCase().trim();
        const oSecId = String(other.sectionId || other.section_id || '');
        const oSecName = String(other.sectionName || '').toUpperCase().trim();

        if (oTerm === curTerm && oSub === curSub && ((curSecId && oSecId && curSecId === oSecId) || (curSecName && oSecName && curSecName === oSecName))) {
          const oStart = parseMins(other.startTime);
          const oEnd = parseMins(other.endTime);

          if (oStart === curStart && oEnd === curEnd) {
            // Same time -> merge days into updatedRow and delete redundant other row
            const oDays = getNormalizedRowDays(other);
            updatedRow.days = Array.from(new Set([...curDays, ...oDays]));
            rows.splice(i, 1);
            if (i < index) index--;
          } else if (fieldValues.days && curSub !== 'ADVISORY') {
            // Different time (for non-advisory subjects) -> remove newly claimed days from other row to avoid day overlap collision
            const oDays = getNormalizedRowDays(other);
            const remainingODays = oDays.filter(d => !curDays.includes(d));
            if (remainingODays.length === 0) {
              rows.splice(i, 1);
              if (i < index) index--;
            } else {
              rows[i] = { ...other, days: remainingODays };
            }
          }
        }
      }
    }

    rows[index] = updatedRow;
    handleFieldChange('workloadRows', rows);
  };

  const handleSectionChangeForRow = (index, sectionId) => {
    const rows = [...(currentPerson.workloadRows || [])];
    const section = (classSections || []).find(s => String(s.id) === String(sectionId));

    if (section) {
      const secGradeUpper = String(section.gradeLevel || '').toUpperCase().trim();
      let resolvedCategory = 'Elementary';

      if (secGradeUpper.includes('11') || secGradeUpper.includes('12') || secGradeUpper.includes('SHS') || secGradeUpper.includes('SENIOR')) {
        resolvedCategory = rows[index].category && rows[index].category.includes('SHS') ? rows[index].category : 'SHS-CORE SUBJECTS';
      } else if (secGradeUpper.includes('7') || secGradeUpper.includes('8') || secGradeUpper.includes('9') || secGradeUpper.includes('10') || secGradeUpper.includes('JHS')) {
        resolvedCategory = 'JHS';
      } else {
        for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
          if (grades.includes(section.gradeLevel)) {
            resolvedCategory = cat;
            break;
          }
        }
      }

      const isSned = Boolean(
        secGradeUpper.includes('SNED') || secGradeUpper.includes('NON-GRADED') || secGradeUpper.includes('SPED') ||
        String(section.sectionType || '').toUpperCase().includes('SNED') ||
        String(section.gradeLevel || '').toUpperCase().includes('SNED')
      );
      const isAls = Boolean(
        secGradeUpper.includes('ALS') || String(section.sectionType || '').toUpperCase().includes('ALS') ||
        String(section.gradeLevel || '').toUpperCase().includes('ALS')
      );
      const isAral = Boolean(
        String(section.sectionType || '').toUpperCase().includes('ARAL') ||
        String(section.sectionName || '').toUpperCase().includes('ARAL') ||
        String(section.gradeLevel || '').toUpperCase().includes('ARAL') ||
        Boolean(section.aralBasis || section.aralToolKey || section.aralTool) ||
        ['PHIL-IRI', 'PHIL IRI', 'CRLA', 'EGRA', 'ALNAT', 'RMA', 'TOS'].some(t =>
          String(section.gradeLevel || '').toUpperCase().includes(t) ||
          String(section.sectionType || '').toUpperCase().includes(t) ||
          String(section.sectionName || '').toUpperCase().includes(t)
        )
      );
      const newSubjects = isSned
        ? ['SNED MODIFIED SUBJECT']
        : (isAls
          ? ['ALS LEARNING STRAND']
          : (isAral
            ? ['ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE']
            : getSubjectsForGrade(section.gradeLevel, resolvedCategory)));
      const isCurrentValid = (newSubjects || []).includes(rows[index].subject);
      let nextSubject = isCurrentValid ? rows[index].subject : '';
      if (!nextSubject && isSned) nextSubject = 'SNED MODIFIED SUBJECT';
      if (!nextSubject && isAls) nextSubject = 'ALS LEARNING STRAND';

      // Automatically set 60 minutes duration for Grade 3 to Grade 10 sections
      const isGrade3To10 = (() => {
        if (secGradeUpper.includes('KINDER') || secGradeUpper.includes('11') || secGradeUpper.includes('12') || isSned || isAls) return false;
        if (secGradeUpper === 'GRADE 1' || secGradeUpper === 'GRADE 2' || secGradeUpper === 'G1' || secGradeUpper === 'G2') return false;
        if (secGradeUpper.includes('3') || secGradeUpper.includes('4') || secGradeUpper.includes('5') || secGradeUpper.includes('6') ||
            secGradeUpper.includes('7') || secGradeUpper.includes('8') || secGradeUpper.includes('9') || secGradeUpper.includes('10') ||
            String(resolvedCategory).toUpperCase().includes('JHS') || String(resolvedCategory).toUpperCase().includes('JUNIOR')) {
          return true;
        }
        return false;
      })();

      let curStart = rows[index].startTime || '07:30';
      let curEnd = rows[index].endTime || '08:30';
      if (isGrade3To10 && curStart) {
        curEnd = add60MinutesToTime(curStart);
      }

      rows[index] = {
        ...rows[index],
        sectionId: String(sectionId),
        sectionName: section.sectionName,
        gradeLevel: section.gradeLevel,
        category: resolvedCategory,
        subject: nextSubject,
        subjectName: nextSubject,
        remediationSubject: isCurrentValid ? rows[index].remediationSubject : '',
        startTime: curStart,
        endTime: curEnd
      };
    } else {
      rows[index] = {
        ...rows[index],
        sectionId: '',
        sectionName: '',
        gradeLevel: '',
        subject: '',
        remediationSubject: ''
      };
    }
    handleFieldChange('workloadRows', rows);
  };

  const toggleWorkloadDay = (rowIndex, day) => {
    const rows = [...(currentPerson.workloadRows || [])];
    const targetRow = rows[rowIndex];
    if (!targetRow) return;

    const subUpper = String(targetRow.subject || '').toUpperCase().trim();
    if (subUpper === 'ADVISORY') {
      return alert('Advisory days are fixed to Monday through Friday (M-F).');
    }

    if (subUpper === 'HGP') {
      const advRow = rows.find(r => r.subject === 'ADVISORY' && (String(r.sectionId) === String(targetRow.sectionId) || (!r.sectionId && !targetRow.sectionId)));
      const advDays = advRow?.days || ['M', 'T', 'W', 'TH', 'F'];
      if (!advDays.includes(day)) return; // Restrict HGP to ADVISORY days only
      targetRow.days = [day]; // HGP is strictly 1 day only
      handleFieldChange('workloadRows', rows);
      return;
    }

    const days = [...(targetRow.days || [])];
    let newDays = [];
    if (days.includes(day)) {
      newDays = days.filter(d => d !== day);
    } else {
      newDays = [...days, day];
    }
    targetRow.days = newDays;

    handleFieldChange('workloadRows', rows);
  };

  // 2. Extra Tasks (Teaching-Related / Administrative Tasks)
  const addTaskRow = (key, optionsList) => {
    const rows = [...(currentPerson[key] || [])];
    rows.push({
      task: optionsList[0],
      dates: [],
      startTime: '08:00',
      endTime: '09:00'
    });
    handleFieldChange(key, rows);
  };

  const removeTaskRow = (key, index) => {
    const rows = [...(currentPerson[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  const updateTaskFields = (key, index, fieldsObject) => {
    const rows = [...((currentPerson && currentPerson[key]) || [])];
    if (rows[index]) {
      rows[index] = { ...rows[index], ...fieldsObject };
      handleFieldChange(key, rows);
    }
  };

  const updateTaskField = (key, index, field, value) => {
    const rows = [...((currentPerson && currentPerson[key]) || [])];
    if (rows[index]) {
      if (field === 'startTime') {
        const sTime = value;
        const eTime = rows[index].endTime || add60MinutesToTime(sTime);
        rows[index] = { ...rows[index], startTime: sTime, endTime: eTime };
      } else {
        rows[index] = { ...rows[index], [field]: value };
      }
      handleFieldChange(key, rows);
    }
  };


  const toggleTaskDay = (key, rowIndex, day) => {
    const rows = [...(currentPerson[key] || [])];
    const days = [...(rows[rowIndex].days || [])];
    if (days.includes(day)) {
      rows[rowIndex].days = days.filter(d => d !== day);
    } else {
      rows[rowIndex].days = [...days, day];
    }
    handleFieldChange(key, rows);
  };

  // Helper to compute coverage minutes for a teacher
  const getCoverageMinutes = (transfers, teacherId) => {
    let teachingMins = 0;
    let relatedMins = 0;
    let adminMins = 0;

    const activeCoverages = (transfers || []).filter(t => t.substituteTeacherId === teacherId);
    activeCoverages.forEach(cov => {
      (cov.workloadRows || []).forEach(row => {
        if (!row.startTime || !row.endTime) return;
        const [startH, startM] = row.startTime.split(':').map(Number);
        const [endH, endM] = row.endTime.split(':').map(Number);
        const diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        const daysCount = Array.isArray(row.days) ? row.days.length : 0;
        const totalRowMins = diffMinutes > 0 ? diffMinutes * daysCount : 0;

        const subUpper = String(row.subject || '').toUpperCase().trim();
        if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) {
          return; // HGP does not add teaching minutes
        }

        const isTR = subUpper.startsWith('TR -') || subUpper === 'ADVISORY' || subUpper === 'COACHING AND MENTORING';
        const isAdmin = subUpper.startsWith('ADMIN TASK -') || subUpper === 'ADMINISTRATIVE' || subUpper === 'RELATED TASK';

        if (isTR) {
          relatedMins += totalRowMins;
        } else if (isAdmin) {
          adminMins += totalRowMins;
        } else {
          teachingMins += totalRowMins;
        }
      });
    });

    return { teachingMins, relatedMins, adminMins };
  };

  // Same weekly teaching-hours computation used below for currentPerson (base schedule minutes,
  // merged per-day overlaps, plus any covered/substitute minutes), but parameterized so the
  // "Select Teacher" sidebar can flag any person's card as Overload without opening their schedule.
  const getPersonWeeklyTeachingHours = (person) => {
    if (!isEligibleForTeachingOverload(person)) return 0;
    const rows = person?.workloadRows || [];
    const daysList = ['M', 'T', 'W', 'TH', 'F'];
    let totalMins = 0;

    for (const d of daysList) {
      const intervals = [];
      for (const r of rows) {
        const rowDays = (Array.isArray(r.days) && r.days.length > 0) ? r.days : ['M','T','W','TH','F'];
        if (rowDays.includes(d)) {
          const subUpper = String(r.subject || '').toUpperCase().trim();
          if (isNonTeachingTaskSubject(subUpper)) {
            continue; // Exclude admin tasks and related tasks
          }
          if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) {
            continue;
          }
          if (r.startTime && r.endTime) {
            const sM = parseMins(r.startTime);
            const eM = parseMins(r.endTime);
            if (sM < 99999 && eM < 99999 && eM > sM) {
              intervals.push([sM, eM]);
            }
          }
        }
      }

      if (intervals.length > 0) {
        intervals.sort((a, b) => a[0] - b[0]);
        let merged = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
          const current = intervals[i];
          const lastMerged = merged[merged.length - 1];
          if (current[0] <= lastMerged[1]) {
            lastMerged[1] = Math.max(lastMerged[1], current[1]);
          } else {
            merged.push(current);
          }
        }
        for (const [start, end] of merged) {
          totalMins += (end - start);
        }
      }
    }

    const baseHours = totalMins / 60;
    const coverageHours = getCoverageMinutes(workloadTransfers, person?.id || '').teachingMins / 60;
    return baseHours + coverageHours;
  };

  // Calculations for display
  const coverageLoads = getCoverageMinutes(workloadTransfers, currentPerson?.id || '');
  const coverageTeachingHours = (coverageLoads.teachingMins / 60);
  const coverageRelatedHours = (coverageLoads.relatedMins / 60);
  const coverageAdminHours = (coverageLoads.adminMins / 60);
  const totalCoverageHours = coverageTeachingHours + coverageRelatedHours + coverageAdminHours;

  const baseWeeklyTeachingMinutes = (() => {
    const rows = currentPerson?.workloadRows || [];
    const ghosts = sharedWorkloadRows || [];
    const daysList = ['M', 'T', 'W', 'TH', 'F'];
    let totalMins = 0;

    for (const d of daysList) {
      const intervals = [];
      for (const r of rows) {
        const rowDays = (Array.isArray(r.days) && r.days.length > 0) ? r.days : ['M','T','W','TH','F'];
        if (rowDays.includes(d)) {
          const subUpper = String(r.subject || '').toUpperCase().trim();
          if (isNonTeachingTaskSubject(subUpper)) {
            // Exclude administrative tasks & related tasks from teaching load minutes
            continue;
          }
          if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) {
            // HGP is tracked for program duration and timetable schedule only and does not add teaching workload minutes
            continue;
          }
          if (r.startTime && r.endTime) {
            const sM = parseMins(r.startTime);
            const eM = parseMins(r.endTime);
            if (sM < 99999 && eM < 99999 && eM > sM) {
              intervals.push([sM, eM]);
            }
          }
        }
      }

      for (const g of ghosts) {
        const rawDays = (Array.isArray(g.days) && g.days.length > 0) ? g.days : (g.day ? [g.day] : ['M','T','W','TH','F']);
        const normDays = rawDays.map(dayStr => {
          if (!dayStr) return 'M';
          const u = String(dayStr).trim().toUpperCase();
          if (u === 'M' || u.startsWith('MON')) return 'M';
          if (u === 'TH' || u.startsWith('THU')) return 'TH';
          if (u === 'T' || u.startsWith('TUE')) return 'T';
          if (u === 'W' || u.startsWith('WED')) return 'W';
          if (u === 'F' || u.startsWith('FRI')) return 'F';
          if (u === 'SAT' || u.startsWith('SAT')) return 'SAT';
          if (u === 'SUN' || u.startsWith('SUN')) return 'SUN';
          return u;
        });
        if (normDays.includes(d)) {
          const subUpper = String(g.subject || '').toUpperCase().trim();
          if (isNonTeachingTaskSubject(subUpper)) continue;
          if (subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) continue;
          const sM = parseMins(g.startTime || g.start_time);
          const eM = parseMins(g.endTime || g.end_time);
          if (sM < 99999 && eM < 99999 && eM > sM) {
            intervals.push([sM, eM]);
          }
        }
      }

      // Merge overlapping intervals for this day
      if (intervals.length > 0) {
        intervals.sort((a, b) => a[0] - b[0]);
        let merged = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
          const current = intervals[i];
          const lastMerged = merged[merged.length - 1];
          if (current[0] <= lastMerged[1]) {
            lastMerged[1] = Math.max(lastMerged[1], current[1]);
          } else {
            merged.push(current);
          }
        }
        for (const [start, end] of merged) {
          totalMins += (end - start);
        }
      }
    }
    return totalMins;
  })();

  const baseWeeklyTeachingHours = baseWeeklyTeachingMinutes / 60;
  const totalWeeklyTeachingHours = baseWeeklyTeachingHours + coverageTeachingHours;
  const weeklyTeachingHours = totalWeeklyTeachingHours.toFixed(1);
  const dailyAvgTeachingHours = (Number(weeklyTeachingHours) / 5).toFixed(1);
  const isCurrentEligibleForOverload = isEligibleForTeachingOverload(currentPerson);
  const teachingOverloadHours = isCurrentEligibleForOverload ? Math.max(0, Number(weeklyTeachingHours) - 30).toFixed(1) : '0.0';
  const dailyOverloadHours = isCurrentEligibleForOverload ? (Number(teachingOverloadHours) / 5).toFixed(1) : '0.0';

  const baseWeeklyRelatedHours = ((currentPerson?.teachingRelatedRows) || []).reduce((total, row) => {
    const cadence = row.cadence || row.frequency || (Array.isArray(row.days) && row.days.length > 0 ? 'custom' : 'weekly');
    const durMins = row.duration_minutes !== undefined ? Number(row.duration_minutes) : (row.hours !== undefined && row.hours !== '' ? Math.round(Number(row.hours) * 60) : 60);
    const hrs = durMins / 60;
    if (cadence === 'daily') {
      return total + (hrs * 5);
    } else if (cadence === 'monthly') {
      return total + (hrs / 4);
    } else if (cadence === 'custom' && Array.isArray(row.days)) {
      return total + (hrs * row.days.length);
    } else {
      return total + hrs;
    }
  }, 0);
  const totalWeeklyRelatedHours = baseWeeklyRelatedHours + coverageRelatedHours;
  const weeklyRelatedHours = totalWeeklyRelatedHours.toFixed(1);

  const baseWeeklyAdminHours = ((currentPerson?.administrativeRows) || []).reduce((total, row) => {
    const daysCount = Array.isArray(row.days) ? row.days.length : 0;
    return total + ((Number(row.hours) || 0) * daysCount);
  }, 0);
  const totalWeeklyAdminHours = baseWeeklyAdminHours + coverageAdminHours;
  const weeklyAdminHours = totalWeeklyAdminHours.toFixed(1);

  // ── By-Section helpers ────────────────────────────────────────────────

  const selectedSection = useMemo(() => {
    return (classSections || []).find(s => String(s.id) === String(selectedSectionId)) || null;
  }, [classSections, selectedSectionId]);

  const sectionSlots = useMemo(() => {
    if (!selectedSectionId || !selectedSection) return [];
    const targetSecName = String(selectedSection.sectionName || '').trim().toLowerCase();
    const targetSecGrade = String(selectedSection.gradeLevel || '').trim().toLowerCase();
    const slots = [];

    (personnel || []).forEach(p => {
      const draftKey = `draft_workload_${p.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let activeP = p;
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed) activeP = parsed;
        } catch (e) {}
      }

      (activeP.workloadRows || []).forEach((row, rowIdx) => {
        if ((row.term || '1st') !== activeTerm) return;
        let isMatch = false;
        if (row.sectionId && String(row.sectionId) === String(selectedSectionId)) {
          isMatch = true;
        } else if (row.sectionName && String(row.sectionName).trim().toLowerCase() === targetSecName) {
          if (!row.gradeLevel || String(row.gradeLevel).trim().toLowerCase() === targetSecGrade) {
            isMatch = true;
          }
        } else if (row.subject === 'ADVISORY' && selectedSection.advisorId && String(selectedSection.advisorId) === String(p.id)) {
          isMatch = true;
        }

        if (isMatch) {
          slots.push({
            ...row,
            sectionId: String(selectedSection.id),
            sectionName: selectedSection.sectionName,
            gradeLevel: selectedSection.gradeLevel,
            personnelId: p.id,
            personnelName: `${p.firstName} ${p.lastName}`,
            personnelPosition: p.position || 'Teacher',
            rowIdx
          });
        }
      });
    });

    return slots.sort((a, b) => {
      const aTime = parseTimeToMinutes(a.startTime || '00:00');
      const bTime = parseTimeToMinutes(b.startTime || '00:00');
      return aTime - bTime;
    });
  }, [selectedSectionId, selectedSection, personnel, classSections, activeTerm]);

  const checkConflict = (teacherId, sectionId, startTime, endTime, days, subject = '') => {
    if (!startTime || !endTime || !days || !days.length) return null;

    const ns = parseTimeToMinutes(startTime);
    const ne = parseTimeToMinutes(endTime);

    if (ns >= ne) {
      return {
        type: 'invalid_time',
        message: 'End time must be strictly later than start time.'
      };
    }

    // 1. Check Section Schedule Conflict
    if (sectionId) {
      for (const slot of sectionSlots) {
        const daysOverlap = (days || []).some(d => (slot.days || []).includes(d));
        if (!daysOverlap) continue;
        const rs = parseTimeToMinutes(slot.startTime);
        const re = parseTimeToMinutes(slot.endTime);
        if (ns < re && ne > rs) {
          // JHS/SHS: a section may be split into different subjects in one slot (own teacher, own learner group)
          if (!isSectionSlotClash(slot.gradeLevel, slot.subject, subject)) continue;
          return {
            type: 'section',
            subject: slot.subject,
            teacherName: slot.personnelName,
            startTime: slot.startTime,
            endTime: slot.endTime,
            days: slot.days
          };
        }
      }
    }

    // 2. Check Teacher Busy Conflict
    if (teacherId) {
      const teacher = personnel.find(p => p.id === teacherId);
      if (teacher) {
        const draftKey = `draft_workload_${teacherId}`;
        const savedDraft = localStorage.getItem(draftKey);
        let activeTeacher = teacher;
        if (savedDraft) {
          try {
            const parsed = JSON.parse(savedDraft);
            if (parsed) activeTeacher = parsed;
          } catch (e) {}
        }

        const allRows = [
          ...(activeTeacher.workloadRows || []).filter(r => (r.term || '1st') === activeTerm),
          ...(activeTeacher.teachingRelatedRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days || ['M', 'T', 'W', 'TH', 'F'], subject: r.task })),
          ...(activeTeacher.administrativeRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days || ['M', 'T', 'W', 'TH', 'F'], subject: r.task }))
        ];

        for (const row of allRows) {
          if (!row.startTime || !row.endTime) continue;
          const daysOverlap = (days || []).some(d => (row.days || []).includes(d));
          if (!daysOverlap) continue;
          const rs = parseTimeToMinutes(row.startTime);
          const re = parseTimeToMinutes(row.endTime);
          if (ns < re && ne > rs) {
            return {
              type: 'teacher',
              subject: row.subject,
              teacherName: `${teacher.firstName} ${teacher.lastName}`,
              startTime: row.startTime,
              endTime: row.endTime,
              days: row.days
            };
          }
        }
        if (teacher.sharedWorkloadRows && Array.isArray(teacher.sharedWorkloadRows)) {
          const crossConflict = checkCrossSchoolConflict({ startTime, endTime, days }, teacher.sharedWorkloadRows, 120);
          if (crossConflict) {
            return {
              type: 'invalid_time',
              subject: 'Partner Station Clustered Schedule',
              teacherName: `${teacher.firstName} ${teacher.lastName}`,
              startTime,
              endTime,
              days,
              message: `Cross-School Conflict: ${teacher.firstName} ${teacher.lastName} is stationed at a partner school or transit restriction (gap ≤ 2h).`
            };
          }
        }
      }
    }

    return null;
  };

  useEffect(() => {
    if (workloadView === 'by-section' && selectedSectionId) {
      const c = checkConflict(newSlot.teacherId, selectedSectionId, newSlot.startTime, newSlot.endTime, newSlot.days, newSlot.subject);
      setSlotConflict(c);
    }
  }, [newSlot.teacherId, newSlot.startTime, newSlot.endTime, newSlot.days, selectedSectionId, personnel, classSections, workloadView, sectionSlots]);

  const handleAddSectionSlot = async () => {
    if (!selectedSectionId || !newSlot.teacherId || !newSlot.subject || !newSlot.startTime || !newSlot.endTime || !newSlot.days.length) {
      await showAlert("Fields Required", "Please fill in all fields before adding a slot.");
      return;
    }
    const slotTeacher = personnel.find(p => p.id === newSlot.teacherId);
    if (isTeachingPlotLocked(slotTeacher)) {
      await showAlert("No Classes Assigned", TEACHING_PLOT_LOCK_MESSAGE);
      return;
    }
    const conflict = checkConflict(newSlot.teacherId, selectedSectionId, newSlot.startTime, newSlot.endTime, newSlot.days, newSlot.subject);
    if (conflict) {
      setSlotConflict(conflict);
      await showAlert("Schedule Conflict", conflict.type === 'invalid_time' ? conflict.message : "Cannot add slot due to a time conflict with an existing schedule.");
      return;
    }
    const sec = (classSections || []).find(s => s.id === selectedSectionId);
    let cat = 'JHS';
    for (const [c, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
      if (grades.includes(sec?.gradeLevel || '')) { cat = c; break; }
    }
    const newRow = {
      id: `r-${Math.random().toString(36).substring(2, 7)}`,
      category: cat,
      subject: newSlot.subject,
      remediationSubject: newSlot.remediationSubject || '',
      gradeLevel: sec?.gradeLevel || '',
      sectionId: selectedSectionId,
      sectionName: sec?.sectionName || '',
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
      days: newSlot.days,
      term: activeTerm
    };

    const targetTeacher = personnel.find(p => p.id === newSlot.teacherId);
    if (!targetTeacher) return;

    const draftKey = `draft_workload_${targetTeacher.id}`;
    const savedDraft = localStorage.getItem(draftKey);
    let activeRows = targetTeacher.workloadRows || [];
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed && Array.isArray(parsed.workloadRows)) activeRows = parsed.workloadRows;
      } catch (e) {}
    }

    const updatedRows = [...activeRows, newRow];
    handleFieldChangeForPerson(targetTeacher.id, 'workloadRows', updatedRows);
    setPersonnel(prev => (Array.isArray(prev) ? prev : []).map(p => {
      if (p.id === targetTeacher.id) {
        return { ...p, workloadRows: updatedRows };
      }
      return p;
    }));
    if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);

    setSlotConflict(null);
    setShowAddSectionSlotModal(false);
    const { nextStart: slotNextStart, nextEnd: slotNextEnd, nextDays: slotNextDays } = getWorkloadScheduleDefaults(sectionSlots);
    setNewSlot({ teacherId: '', subject: '', remediationSubject: '', startTime: slotNextStart, endTime: slotNextEnd, days: slotNextDays });
    if (showToast) showToast(`Added ${newSlot.subject} to ${sec?.sectionName || 'section'}!`);
  };

  const handleRemoveSectionSlot = async (personnelId, rowIdx) => {
    const confirmed = await showConfirm("Remove Schedule Slot", "Are you sure you want to remove this schedule slot from this section?");
    if (!confirmed) return;

    const targetTeacher = personnel.find(p => p.id === personnelId);
    if (!targetTeacher) return;

    const draftKey = `draft_workload_${targetTeacher.id}`;
    const savedDraft = localStorage.getItem(draftKey);
    let activeRows = targetTeacher.workloadRows || [];
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed && Array.isArray(parsed.workloadRows)) activeRows = parsed.workloadRows;
      } catch (e) {}
    }

    const updatedRows = activeRows.filter((_, i) => i !== rowIdx);
    handleFieldChangeForPerson(targetTeacher.id, 'workloadRows', updatedRows);
    setPersonnel(prev => (Array.isArray(prev) ? prev : []).map(p => {
      if (p.id === targetTeacher.id) {
        return { ...p, workloadRows: updatedRows };
      }
      return p;
    }));
    if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);
    if (showToast) showToast("Schedule slot removed.");
  };

  const toggleNewSlotDay = (day) => {
    setNewSlot(prev => {
      const days = prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day];
      const updated = { ...prev, days };
      const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days, updated.subject);
      setSlotConflict(c);
      return updated;
    });
  };

  // Awaited write to esf7_workload_rows. Throws on any failure; a 422 surfaces the server's own message.
  const persistWorkloadToServer = async (person) => {
    const lockKey = String(person.id);
    if (saveInFlightRef.current.has(lockKey)) {
      throw new Error('A save for this teacher is already running. Please wait a moment and try again.');
    }
    saveInFlightRef.current.add(lockKey);
    try {
      const activeSchoolId = resolveSchoolId(schoolInfo?.schoolId || person.school_id || person.schoolId || localStorage.getItem('activeSchoolId'));
      const activeSy = schoolInfo?.schoolYear || person.school_year || person.schoolYear || '2026-2027';
      const assignedGrades = (typeof getAssignedGradeLevels === 'function' ? getAssignedGradeLevels(person) : []) || person.assignedGradeLevels || person.assigned_grade_levels || person.gradeLevelsTaught || person.grade_levels_taught || [];

      const sentRows = dedupeWorkloadRows(person.id, person.workloadRows || []);
      // Retrying is safe: the server replaces the teacher's term in one transaction, so a retry never creates duplicates.
      let res = await retryTransient(() => api.saveWorkloadBatch({
        personnel_id: person.id,
        workloadRows: sentRows,
        teachingRelatedRows: person.teachingRelatedRows || person.teaching_related_rows || [],
        administrativeRows: person.administrativeRows || person.administrative_rows || [],
        assignedGradeLevels: assignedGrades,
        school_id: activeSchoolId || '108348',
        school_year: activeSy,
        term: activeTerm || '1st'
      }));

      // The server reports how many rows it wrote. Rows were sent but none (or fewer) were written = the save failed.
      if (sentRows.length > 0 && Number(res?.rowsWritten ?? res?.count ?? 0) < sentRows.length) {
        throw new Error(`The server reported writing ${Number(res?.rowsWritten ?? res?.count ?? 0)} of ${sentRows.length} schedule blocks, so nothing was marked as saved. Your changes are kept on this device; please press Save again.`);
      }

      // Verify the write: what the server says it saved must be what was sent. If the reply does not prove it,
      // read the rows back from the database before anyone shows success or clears a draft.
      const terms = Array.from(new Set([...sentRows.map(r => r.term || '1st'), activeTerm || '1st']));
      let check = Array.isArray(res?.data) ? verifySavedRows(person.id, sentRows, res.data, terms) : { ok: false, mismatchedTerms: terms };
      if (!check.ok) {
        const fromDatabase = [];
        for (const t of terms) {
          const state = await retryTransient(() => api.getWorkloadState(person.id, t, activeSchoolId));
          fromDatabase.push(...(state.rows || []).map(r => ({ ...r, term: r.term || t })));
        }
        check = verifySavedRows(person.id, sentRows, fromDatabase, terms);
        if (check.ok) res = { ...res, data: fromDatabase };
      }
      if (!check.ok) {
        throw new Error(`The server did not confirm every schedule block (${check.mismatchedTerms.join(', ')} term). Your changes are kept on this device; please press Save again.`);
      }
      return { ...res, sentRows };
    } catch (err) {
      if (err?.body?.message) throw new Error(err.body.message);
      if (err?.body?.error && typeof err.body.error === 'string') throw new Error(err.body.error);
      if (err?.message) throw err;
      throw new Error(String(err));
    } finally {
      saveInFlightRef.current.delete(lockKey);
    }
  };

  const handleSaveChangesDirectly = async () => {
    if (!currentPerson) return;

    const hasIncompleteBlock = (currentPerson.workloadRows || []).some(row => {
      if (!row.subject) return true;
      if (isAdminTaskRow(row) || isNonTeachingTaskSubject(row.subject) || isNonTeachingPerson(currentPerson)) return false;
      return !row.gradeLevel;
    });
    if (hasIncompleteBlock) {
      await showAlert("Incomplete Schedule Block", "Cannot save. One or more schedule blocks are missing a Subject or Class Section/Grade Level. Please complete them first.");
      return;
    }

    // Check for workload conflicts (isolated per term)
    const currentTermRows = (currentPerson.workloadRows || []).filter(row => (row.term || '1st') === activeTerm);
    const hasAnyConflict = currentTermRows.some((row, idx) => {
      const rowDays = getNormalizedRowDays(row);
      return currentTermRows.some((otherRow, otherIdx) => {
        if (idx === otherIdx) return false;
        if (row.id && otherRow.id && String(row.id) === String(otherRow.id)) return false;
        if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
        const otherDays = getNormalizedRowDays(otherRow);
        const daysOverlap = rowDays.some(d => otherDays.includes(d));
        if (!daysOverlap) return false;
        const ns = parseMins(row.startTime), ne = parseMins(row.endTime);
        const rs = parseMins(otherRow.startTime), re = parseMins(otherRow.endTime);
        if (ns < re && ne > rs) {
          if (isAdvisoryOrHgpPair(row, otherRow)) return false;
          return true;
        }
        return false;
      });
    });

    if (hasAnyConflict) {
      await showAlert("Schedule Conflict", `Cannot save. There are overlapping schedule times in the ${activeTerm} Term workload rows. Please resolve them first.`);
      return;
    }

    // Check for cross-school conflicts with Clustered Ghost Slots & Transit Sandwich Gaps (<= 2h)
    const hasCrossSchoolConflict = currentTermRows.some(row => {
      return checkCrossSchoolConflict(row, sharedWorkloadRows, 120);
    });

    if (hasCrossSchoolConflict) {
      await showAlert("Cross-School Schedule Conflict", `Cannot save. Clustered personnel has a schedule collision or transit restriction (gap ≤ 2h between partner station classes) in ${activeTerm} Term. Please adjust times to avoid double-booking.`);
      return;
    }

    setIsSaving(true);
    try {
      const res = await persistWorkloadToServer(currentPerson);
      // Only after the server confirmed (and the rows were verified): rebuild from the saved rows and clear the draft,
      // keeping anything edited while the save was running as the new draft.
      const { person: updatedPerson, edited } = commitConfirmedSave(currentPerson, res);

      if (savePersonnelChanges) {
        await savePersonnelChanges(currentPerson.id, updatedPerson, { skipWorkloadSync: true, skipApiUpdate: true });
      }

      broadcastClusteredSlots(updatedPerson.workloadRows);
      setHasUnsavedChanges(edited);

      showToast("Workload changes saved to database.", "success");
    } catch (err) {
      console.warn("Save workload error:", err);
      const errMsg = err?.message || 'Failed to save workload changes';
      await showAlert("Error", errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveValidate = async () => {
    if (!currentPerson) return;

    // Check for workload conflicts (isolated per term)
    const currentTermRows = (currentPerson.workloadRows || []).filter(row => (row.term || '1st') === activeTerm);
    const hasAnyConflict = currentTermRows.some((row, idx) => {
      const rowDays = getNormalizedRowDays(row);
      return currentTermRows.some((otherRow, otherIdx) => {
        if (idx === otherIdx) return false;
        if (row.id && otherRow.id && String(row.id) === String(otherRow.id)) return false;
        if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
        const otherDays = getNormalizedRowDays(otherRow);
        const daysOverlap = rowDays.some(d => otherDays.includes(d));
        if (!daysOverlap) return false;
        const ns = parseMins(row.startTime), ne = parseMins(row.endTime);
        const rs = parseMins(otherRow.startTime), re = parseMins(otherRow.endTime);
        if (ns < re && ne > rs) {
          if (isAdvisoryOrHgpPair(row, otherRow)) return false;
          return true;
        }
        return false;
      });
    });

    if (hasAnyConflict) {
      await showAlert("Schedule Conflict", `Cannot save. There are overlapping schedule times in the ${activeTerm} Term workload rows. Please resolve them first.`);
      return;
    }

    setIsSaving(true);
    try {
      const updated = { ...currentPerson, workloadVerified: true, workloadValidated: true };

      // The server must confirm the write before anything is marked verified or the browser copy is removed.
      const res = await persistWorkloadToServer(updated);
      const { person: fullyUpdated, edited } = commitConfirmedSave(updated, res);
      if (savePersonnelChanges) {
        await savePersonnelChanges(currentPerson.id, fullyUpdated, { skipWorkloadSync: true, skipApiUpdate: true });
      }

      // Validated only if nothing was edited while the save was running.
      markTeacherValidated(currentPerson.id, !edited);
      setHasUnsavedChanges(edited);

      showToast(edited ? "Saved. Your newer edits are kept and still need saving." : "Workload verified and saved to database!", edited ? "warning" : "success");
    } catch (err) {
      console.warn("Save and validate workload error:", err);
      const errMsg = err?.message || 'Failed to save and validate workload';
      await showAlert("Error", errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // The one workload save used by the header Save button AND the unsaved-changes dialog's Save button.
  // It never opens its own alerts: it returns { ok: true } or { ok: false, title, message } so each caller shows the error its own way.
  const runWorkloadSave = async () => {
    if (isSavingRef.current) {
      return { ok: false, title: 'Save in Progress', message: 'A save is already running. Please wait a moment and try again.' };
    }
    if (currentPerson) {
      const hasIncompleteBlock = (currentPerson.workloadRows || []).some(row => {
        if (!row.subject) return true;
        if (isAdminTaskRow(row) || isNonTeachingTaskSubject(row.subject) || isNonTeachingPerson(currentPerson)) return false;
        return !row.gradeLevel;
      });
      if (hasIncompleteBlock) {
        return { ok: false, title: "Incomplete Schedule Block", message: "Cannot save. One or more schedule blocks are missing a Subject or Class Section/Grade Level. Please complete them first." };
      }

      const currentTermRows = (currentPerson.workloadRows || []).filter(row => (row.term || '1st') === activeTerm);
      const hasAnyConflict = currentTermRows.some((row, idx) => {
        const rowDays = getNormalizedRowDays(row);
        return currentTermRows.some((otherRow, otherIdx) => {
          if (idx === otherIdx) return false;
          if (row.id && otherRow.id && String(row.id) === String(otherRow.id)) return false;
          if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
          const otherDays = getNormalizedRowDays(otherRow);
          const daysOverlap = rowDays.some(d => otherDays.includes(d));
          if (!daysOverlap) return false;
          const ns = parseMins(row.startTime), ne = parseMins(row.endTime);
          const rs = parseMins(otherRow.startTime), re = parseMins(otherRow.endTime);
          if (ns < re && ne > rs) {
            if (isAdvisoryOrHgpPair(row, otherRow)) return false;
            return true;
          }
          return false;
        });
      });

      if (hasAnyConflict) {
        return { ok: false, title: "Schedule Conflict", message: `Cannot save. There are overlapping schedule times in the ${activeTerm} Term workload rows. Please resolve them first.` };
      }

      const hasCrossSchoolConflict = currentTermRows.some(row => {
        return checkCrossSchoolConflict(row, sharedWorkloadRows, 120);
      });

      if (hasCrossSchoolConflict) {
        return { ok: false, title: "Cross-School Schedule Conflict", message: `Cannot save. Clustered personnel has a schedule collision or transit restriction (gap ≤ 2h between partner station classes) in ${activeTerm} Term. Please adjust times to avoid double-booking.` };
      }
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      let prevWorkloadMap = new Map();
      if (savedWorkloadSnapshotRef.current) {
        try {
          const parsed = JSON.parse(savedWorkloadSnapshotRef.current);
          if (Array.isArray(parsed)) {
            parsed.forEach(sp => prevWorkloadMap.set(String(sp.id), sp));
          }
        } catch (e) {}
      }

      const changedTeachers = (personnel || []).map(p => {
        const effective = currentPerson && String(currentPerson.id) === String(p.id) ? currentPerson : p;
        return effective;
      }).filter(p => {
        const prev = prevWorkloadMap.get(String(p.id));
        if (!prev) return true;
        const curSnap = getPersonWorkloadSnapshot(p);
        if (JSON.stringify(curSnap) !== JSON.stringify(prev)) return true;
        if (localStorage.getItem(`draft_workload_${p.id}`)) return true;
        return false;
      });

      // Per teacher: only a server-confirmed write clears the browser copy and marks the teacher validated.
      const failedSaves = [];
      const successfulTeachers = [];
      for (const p of changedTeachers) {
        const updated = { ...p, workloadVerified: true, workloadValidated: true };
        try {
          const res = await persistWorkloadToServer(updated);
          const { person: fullyUpdated, edited } = commitConfirmedSave(updated, res);

          if (savePersonnelChanges) {
            await savePersonnelChanges(p.id, fullyUpdated, { skipWorkloadSync: true, skipApiUpdate: true });
          }
          markTeacherValidated(p.id, !edited);
          successfulTeachers.push(fullyUpdated);
        } catch (err) {
          console.warn('Save workload batch error for', p.id, err);
          failedSaves.push({ name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || String(p.id), message: err?.message || 'Unknown error' });
        }
      }

      if (successfulTeachers.length > 0) {
        const successMap = new Map(successfulTeachers.map(sp => [String(sp.id), sp]));
        setPersonnel(prev => (prev || []).map(p => successMap.get(String(p.id)) || p));
        if (currentPerson && successMap.has(String(currentPerson.id))) {
          setEditPerson(successMap.get(String(currentPerson.id)));
        }
      }

      if (failedSaves.length > 0) {
        // Leave the saved snapshot and node status untouched so the failed teachers stay "changed" and can be retried.
        const list = failedSaves.slice(0, 8).map(f => `• ${f.name}: ${f.message}`).join('\n');
        const more = failedSaves.length > 8 ? `\n…and ${failedSaves.length - 8} more.` : '';
        return { ok: false, title: "Some Workloads Were Not Saved", message: `${failedSaves.length} of ${changedTeachers.length} teacher(s) could not be saved to the database. Their changes are kept in this browser; press Save again to retry.\n${list}${more}` };
      }

      if (currentPerson) {
        broadcastClusteredSlots(currentPerson.workloadRows);
      }
      // (Each saved teacher already refreshed its own saved baseline in commitConfirmedSave, so edits made while saving still show as unsaved.)

      if (completeNode) {
        completeNode('workload', null);
      }

      showToast("Workload schedule saved to database successfully.", "success");
      return { ok: true };
    } catch (err) {
      console.warn("Failed to save workload schedule:", err);
      return { ok: false, title: "Error", message: "Failed to save workload schedule: " + err.message };
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Header Save button: same save, errors shown in the existing alert.
  const handleSave = async () => {
    const result = await runWorkloadSave();
    if (result && result.ok === false) {
      await showAlert(result.title, result.message);
    }
  };

  // Always points at the latest render's save (it reads current state), for the dialog's Save button.
  runWorkloadSaveRef.current = runWorkloadSave;
  // ────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────

  return (
    <section id="workload" className="view grid">
      <PortalHeader
        title="Workload & Timetable Schedule"
        description="Manage teacher teaching loads, HGP advisory rules, relieving duties, and schedule conflict resolution."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        showDiscard={false}
        onContinue={handleSave}
        continueText={isDirty ? (isSaving ? "Saving..." : "Save Changes") : "Save"}
        continueDisabled={!isDirty || isSaving}
      />

      <datalist id="school-times">
        <option value="06:00" />
        <option value="06:30" />
        <option value="07:00" />
        <option value="07:30" />
        <option value="08:00" />
        <option value="08:30" />
        <option value="09:00" />
        <option value="09:30" />
        <option value="10:00" />
        <option value="10:30" />
        <option value="11:00" />
        <option value="11:30" />
        <option value="12:00" />
        <option value="12:30" />
        <option value="13:00" />
        <option value="13:30" />
        <option value="14:00" />
        <option value="14:30" />
        <option value="15:00" />
        <option value="15:30" />
        <option value="16:00" />
        <option value="16:30" />
        <option value="17:00" />
        <option value="17:30" />
        <option value="18:00" />
        <option value="18:30" />
        <option value="19:00" />
        <option value="19:30" />
        <option value="20:00" />
      </datalist>
      <article className="card">
        <div className="card-inner">

          {/* ── View Mode Toggle, Term Selector & Actions ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '5px', borderRadius: '12px', width: 'fit-content', border: '1.5px solid #E2E8F0' }}>
                <button type="button" onClick={() => setWorkloadView('by-personnel')}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.2s',
                    background: workloadView === 'by-personnel' ? 'linear-gradient(180deg, #0F172A, #1E293B)' : 'transparent',
                    color: workloadView === 'by-personnel' ? '#FFFFFF' : '#475569',
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    boxShadow: workloadView === 'by-personnel' ? '0 2px 4px rgba(0,0,0,0.15)' : 'none'
                  }}
                ><FiUser size={14} /> By Personnel</button>
                <button type="button" onClick={() => setWorkloadView('by-section')}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.2s',
                    background: workloadView === 'by-section' ? 'linear-gradient(180deg, #0284C7, #0369A1)' : 'transparent',
                    color: workloadView === 'by-section' ? '#FFFFFF' : '#475569',
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    boxShadow: workloadView === 'by-section' ? '0 2px 4px rgba(2,132,199,0.25)' : 'none'
                  }}
                ><FiBookOpen size={14} /> By Section Timetable</button>
              </div>

              {/* Term Selector (1st, 2nd, 3rd Terms) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', padding: '5px 10px', borderRadius: '12px', border: '1.5px solid #E2E8F0' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '4px' }}>
                  Term:
                </span>
                {[
                  { id: '1st', name: '1st Term' },
                  { id: '2nd', name: '2nd Term' },
                  { id: '3rd', name: '3rd Term' }
                ].map(t => {
                  const isLocked = termStatuses[t.id] === 'LOCKED';
                  const isActive = activeTerm === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          setShowUnlockTermModal(t.id);
                        } else {
                          confirmAction(() => setActiveTerm(t.id));
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: isActive ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                        background: isActive ? '#0284C7' : (isLocked ? '#F1F5F9' : '#FFFFFF'),
                        color: isActive ? '#FFFFFF' : (isLocked ? '#94A3B8' : '#334155'),
                        fontSize: '12px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isLocked ? <FiLock size={12} /> : (isActive ? <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80' }}></span> : null)}
                      {t.name}
                      {isLocked && <span style={{ fontSize: '10px', fontWeight: '700', background: '#E2E8F0', color: '#64748B', padding: '1px 5px', borderRadius: '4px' }}>Locked</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {activeTerm === '2nd' && (
                <button
                  type="button"
                  onClick={() => handleCopyFirstTermToSecondTerm('ALL')}
                  style={{
                    background: '#EFF6FF',
                    color: '#0284C7',
                    border: '1.5px solid #BAE6FD',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#DBEAFE';
                    e.currentTarget.style.borderColor = '#0284C7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#EFF6FF';
                    e.currentTarget.style.borderColor = '#BAE6FD';
                  }}
                  title="Copy 1st Term workload setup to 2nd Term for all teachers"
                >
                  <FiCopy size={13} /> Copy 1st Term Workload (All)
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                onClick={handleClearAllTeachersWorkload}
                style={{
                  background: '#F8FAFC',
                  color: '#334155',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F1F5F9';
                  e.currentTarget.style.color = '#0F172A';
                  e.currentTarget.style.borderColor = '#94A3B8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.color = '#334155';
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }}
                title={`Clear all workload schedules for ${activeTerm} Term across all teachers`}
              >
                <FiTrash2 size={13} /> Clear All Teachers ({activeTerm} Term)
              </button>
              {currentPerson && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSaveValidate}
                  style={{
                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                    color: 'white',
                    fontWeight: '800',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    fontSize: '12.5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  title="Validate and save workload changes for active teacher"
                >
                  <FiCheckCircle size={15} /> Save & Validate Teacher Workload
                </button>
              )}
              {/* Temporarily hidden: Delegation Package (HTML) & Import Batch (.json) */}
              <input
                type="file"
                ref={batchImportFileRef}
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleBatchJSONImportSelect}
              />
            </div>
          </div>

          {/* ── Locked Term Status Banner ── */}
          {isTermLocked(activeTerm) && (
            <div style={{
              background: '#FEF3C7',
              border: '1.5px solid #FCD34D',
              borderRadius: '12px',
              padding: '12px 18px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FiLock size={18} color="#B45309" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#92400E' }}>
                    {activeTerm} Term is currently LOCKED (Read-Only Archive)
                  </div>
                  <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                    Timetable modifications and schedule changes for this term are restricted.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUnlockTermModal(activeTerm)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#D97706',
                  color: '#FFFFFF',
                  fontWeight: '800',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Unlock {activeTerm} Term</span>
              </button>
            </div>
          )}

          {/* ── BY SECTION VIEW (Option 1 Master Redesign) ── */}
          {workloadView === 'by-section' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start', marginTop: '10px' }}>
              {/* Left Column: Section Roster Sidebar */}
              <div style={{
                background: 'white',
                padding: '16px',
                borderRadius: '16px',
                border: '1.5px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '850px',
                maxHeight: 'calc(100vh - 80px)',
                position: 'sticky',
                top: '20px',
                overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '15px', color: 'var(--navy)', margin: 0, fontWeight: 'bold' }}>Class Sections</h3>
                  <span style={{ fontSize: '11px', fontWeight: '700', background: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: '12px' }}>
                    {(classSections || []).length} Total
                  </span>
                </div>

                {/* Search Input */}
                <div style={{ position: 'relative' }}>
                  <FiSearch size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Search section or adviser..."
                    value={sectionSearch}
                    onChange={(e) => setSectionSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{ width: '100%', padding: '10px 14px 10px 34px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                  />
                </div>

                {/* Grade Level Filter Pills */}
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Filter by Grade</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {['all', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'SNED', 'ALS'].map(g => {
                      const isActive = sectionGradeFilter === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setSectionGradeFilter(g)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            border: isActive ? '1px solid #0284C7' : '1px solid #E2E8F0',
                            background: isActive ? '#0284C7' : '#F8FAFC',
                            color: isActive ? '#FFFFFF' : '#475569',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {g === 'all' ? 'All Grades' : g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section List Cards */}
                {(() => {
                  const filteredSections = (classSections || []).filter(sec => {
                    if (!sec || typeof sec !== 'object') return false;
                    if (sectionGradeFilter !== 'all') {
                      const sGrade = String(sec.gradeLevel || '').trim().toLowerCase();
                      const fGrade = String(sectionGradeFilter).trim().toLowerCase();
                      const matchGrade = sGrade === fGrade || 
                        (fGrade === 'grade 1' ? (sGrade === 'grade 1' || sGrade.startsWith('grade 1 ') || sGrade.startsWith('grade 1-')) : sGrade.startsWith(fGrade)) ||
                        (fGrade === 'sned' && sGrade.includes('sned')) ||
                        (fGrade === 'als' && sGrade.includes('als'));
                      if (!matchGrade) return false;
                    }
                    if (sectionSearch && String(sectionSearch).trim()) {
                      const q = String(sectionSearch).toLowerCase().trim();
                      const secName = String(sec.sectionName || '').toLowerCase();
                      const secGrade = String(sec.gradeLevel || '').toLowerCase();
                      const adviser = sec.advisorId ? (personnel || []).find(p => p && p.id === sec.advisorId) : null;
                      const advName = adviser ? `${String(adviser.firstName || '')} ${String(adviser.lastName || '')}`.trim().toLowerCase() : '';
                      return secName.includes(q) || secGrade.includes(q) || advName.includes(q);
                    }
                    return true;
                  });

                  if (filteredSections.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94A3B8', fontSize: '13px' }}>
                        No sections match your filter criteria.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, minHeight: '600px' }}>
                      {filteredSections.map(sec => {
                        const isSelected = selectedSectionId === sec.id;
                        const adviser = sec.advisorId ? (personnel || []).find(p => p.id === sec.advisorId) : null;

                        // Calculate coverage metrics for this section
                        let cat = 'JHS';
                        for (const [c, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
                          if (grades.includes(sec.gradeLevel || '')) { cat = c; break; }
                        }
                        const reqSubs = (getSubjectsForGrade(sec.gradeLevel, cat) || []).filter(s => s !== 'ADVISORY');

                        // Find distinct subjects assigned to this section
                        const secNameLower = String(sec.sectionName || '').trim().toLowerCase();
                        const secGradeLower = String(sec.gradeLevel || '').trim().toLowerCase();
                        const assignedSubjectSet = new Set();
                        let totalSecMins = 0;

                        (personnel || []).forEach(p => {
                          const draftKey = `draft_workload_${p.id}`;
                          const savedDraft = localStorage.getItem(draftKey);
                          let activeP = p;
                          if (savedDraft) {
                            try {
                              const parsed = JSON.parse(savedDraft);
                              if (parsed) activeP = parsed;
                            } catch (e) {}
                          }
                          (activeP.workloadRows || []).forEach(r => {
                            let match = false;
                            if (r.sectionId && String(r.sectionId) === String(sec.id)) match = true;
                            else if (r.sectionName && String(r.sectionName).trim().toLowerCase() === secNameLower) {
                              if (!r.gradeLevel || String(r.gradeLevel).trim().toLowerCase() === secGradeLower) match = true;
                            } else if (r.subject === 'ADVISORY' && sec.advisorId && String(sec.advisorId) === String(p.id)) match = true;

                            if (match) {
                              const subNorm = normalizeSubjectName(r.subject);
                              if (subNorm !== 'ADVISORY' && subNorm !== 'HGP') {
                                assignedSubjectSet.add(subNorm);
                              }
                              if (r.startTime && r.endTime && Array.isArray(r.days)) {
                                const mins = getTimeDiffMins(r.startTime, r.endTime);
                                totalSecMins += mins * r.days.length;
                              }
                            }
                          });
                        });

                        const assignedCount = assignedSubjectSet.size;
                        const totalReq = reqSubs.length || 8;
                        const isFull = assignedCount >= totalReq && totalReq > 0;
                        const totalHours = (totalSecMins / 60).toFixed(1);

                        return (
                          <div
                            key={sec.id}
                            onClick={() => {
                              setSelectedSectionId(sec.id);
                              setSlotConflict(null);
                              const { nextStart: slotNextStart, nextEnd: slotNextEnd, nextDays: slotNextDays } = getWorkloadScheduleDefaults(sectionSlots);
                              setNewSlot({ teacherId: '', subject: '', remediationSubject: '', startTime: slotNextStart, endTime: slotNextEnd, days: slotNextDays });
                            }}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '12px',
                              border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                              background: isSelected ? 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)' : '#FFFFFF',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              boxShadow: isSelected ? '0 4px 6px -1px rgba(2, 132, 199, 0.15)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '800',
                                  background: isSelected ? '#0284C7' : '#F1F5F9',
                                  color: isSelected ? '#FFFFFF' : '#475569',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  textTransform: 'uppercase'
                                }}>
                                  {sec.gradeLevel || 'Section'}
                                </span>
                                <h4 style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: '800', color: 'var(--navy)' }}>
                                  {formatSectionDisplay(sec.sectionName, sec.sectionType, sec.id)}
                                </h4>
                              </div>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: '700',
                                color: isFull ? '#059669' : (assignedCount > 0 ? '#D97706' : '#94A3B8'),
                                background: isFull ? '#D1FAE5' : (assignedCount > 0 ? '#FEF3C7' : '#F1F5F9'),
                                padding: '2px 7px',
                                borderRadius: '10px'
                              }}>
                                {isFull ? `${assignedCount}/${totalReq} (Full)` : `${assignedCount}/${totalReq} Subs`}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FiUser size={11} /> {adviser ? `${adviser.firstName} ${adviser.lastName}` : 'No Adviser'}
                              </span>
                              <span style={{ fontWeight: '700', color: '#334155' }}>{totalHours}h/wk</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Right Column: Section Timetable & Curriculum Workspace */}
              {!selectedSection ? (
                <div className="card" style={{ padding: '60px 40px', textAlign: 'center', border: '1.5px solid var(--line)', borderRadius: '16px', background: 'white' }}>
                  <FiBookOpen size={48} color="#94A3B8" style={{ margin: '0 auto 16px', display: 'block' }} />
                  <h3 style={{ color: 'var(--navy)', margin: '0 0 8px', fontSize: '18px' }}>Select a Class Section</h3>
                  <p className="subtext" style={{ maxWidth: '400px', margin: '0 auto' }}>
                    Choose a class section from the left sidebar to view its complete weekly timetable, verify curriculum coverage, and assign teachers.
                  </p>
                </div>
              ) : (() => {
                const sec = selectedSection;
                const adviser = sec.advisorId ? (personnel || []).find(p => p.id === sec.advisorId) : null;
                let cat = 'JHS';
                for (const [c, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
                  if (grades.includes(sec.gradeLevel || '')) { cat = c; break; }
                }
                const requiredCurriculumSubjects = (getSubjectsForGrade(sec.gradeLevel, cat) || []).filter(s => s !== 'ADVISORY');

                // Compute Distinct Subjects scheduled
                const assignedSubMap = new Map();
                let totalWeeklySectionMins = 0;
                sectionSlots.forEach(slot => {
                  const normSub = normalizeSubjectName(slot.subject);
                  if (normSub !== 'ADVISORY' && normSub !== 'HGP') {
                    if (!assignedSubMap.has(normSub)) assignedSubMap.set(normSub, []);
                    assignedSubMap.get(normSub).push(slot);
                  }
                  if (slot.startTime && slot.endTime && Array.isArray(slot.days)) {
                    const durationMins = getTimeDiffMins(slot.startTime, slot.endTime);
                    totalWeeklySectionMins += durationMins * slot.days.length;
                  }
                });

                const totalScheduledSubs = assignedSubMap.size;
                const totalReqCount = requiredCurriculumSubjects.length || 8;
                const coveragePercent = Math.min(100, Math.round((totalScheduledSubs / (totalReqCount || 1)) * 100));
                const totalWeeklyHours = (totalWeeklySectionMins / 60).toFixed(1);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
                    {/* Executive Section Header Card */}
                    <div style={{
                      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                      borderRadius: '16px',
                      padding: '24px',
                      color: 'white',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '18px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <span style={{
                              background: '#0284C7',
                              color: 'white',
                              fontSize: '11px',
                              fontWeight: '800',
                              padding: '3px 10px',
                              borderRadius: '6px',
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase'
                            }}>
                              {sec.gradeLevel || 'Class Section'}
                            </span>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              padding: '3px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              color: '#E2E8F0'
                            }}>
                              <FiUser size={12} /> Adviser: <strong>{adviser ? `${adviser.firstName} ${adviser.lastName}` : 'Not Assigned'}</strong>
                            </span>
                          </div>
                          <h2 style={{ margin: 0, fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                            {formatSectionDisplay(sec.sectionName, sec.sectionType, sec.id)}
                          </h2>
                          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8' }}>
                            Class Program & Weekly Timetable for {sec.gradeLevel} · {schoolInfo?.schoolYear || 'SY 26-27'}
                          </p>
                        </div>

                        {/* View Switchers & Add Action */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)' }}>
                            <button
                              type="button"
                              onClick={() => setSectionViewMode('timetable')}
                              style={{
                                padding: '6px 14px',
                                borderRadius: '7px',
                                border: 'none',
                                background: sectionViewMode === 'timetable' ? '#0284C7' : 'transparent',
                                color: '#FFFFFF',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <FiCalendar size={13} /> Weekly Timetable
                            </button>
                            <button
                              type="button"
                              onClick={() => setSectionViewMode('matrix')}
                              style={{
                                padding: '6px 14px',
                                borderRadius: '7px',
                                border: 'none',
                                background: sectionViewMode === 'matrix' ? '#0284C7' : 'transparent',
                                color: '#FFFFFF',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <FiList size={13} /> Curriculum Matrix
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const { nextStart: slotNextStart, nextEnd: slotNextEnd, nextDays: slotNextDays } = getWorkloadScheduleDefaults(sectionSlots);
                              setNewSlot({ teacherId: '', subject: '', remediationSubject: '', startTime: slotNextStart, endTime: slotNextEnd, days: slotNextDays });
                              setSlotConflict(null);
                              setShowAddSectionSlotModal(true);
                            }}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '10px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                              color: '#FFFFFF',
                              fontSize: '12px',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                            }}
                          >
                            <FiPlus size={14} /> Add Schedule Slot
                          </button>
                        </div>
                      </div>

                      {/* 3 Horizontal Executive KPI Badges */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subjects Scheduled</span>
                          <div style={{ fontSize: '20px', fontWeight: '800', color: '#FFFFFF', marginTop: '2px' }}>
                            {totalScheduledSubs} <span style={{ fontSize: '13px', color: '#64748B', fontWeight: '600' }}>/ {totalReqCount}</span>
                          </div>
                        </div>
                        <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Weekly Teaching Time</span>
                          <div style={{ fontSize: '20px', fontWeight: '800', color: '#38BDF8', marginTop: '2px' }}>
                            {totalWeeklyHours}h <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: '600' }}>({totalWeeklySectionMins} mins)</span>
                          </div>
                        </div>
                        <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Curriculum Coverage</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <span style={{ fontSize: '20px', fontWeight: '800', color: coveragePercent === 100 ? '#4ADE80' : '#FBBF24' }}>
                              {coveragePercent}%
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', background: coveragePercent === 100 ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)', color: coveragePercent === 100 ? '#4ADE80' : '#FBBF24' }}>
                              {coveragePercent === 100 ? 'Complete' : `${totalReqCount - totalScheduledSubs} Missing`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* VIEW 1: Visual 5-Day Weekly Timetable Grid */}
                    {sectionViewMode === 'timetable' && (() => {
                      const daysList = [
                        { code: 'M', label: 'Monday' },
                        { code: 'T', label: 'Tuesday' },
                        { code: 'W', label: 'Wednesday' },
                        { code: 'TH', label: 'Thursday' },
                        { code: 'F', label: 'Friday' }
                      ];

                      // If weekend slots exist, include Saturday/Sunday
                      const hasSat = sectionSlots.some(s => (s.days || []).includes('SAT'));
                      const hasSun = sectionSlots.some(s => (s.days || []).includes('SUN'));
                      if (hasSat) daysList.push({ code: 'SAT', label: 'Saturday' });
                      if (hasSun) daysList.push({ code: 'SUN', label: 'Sunday' });

                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${daysList.length}, minmax(170px, 1fr))`, gap: '12px', overflowX: 'auto', paddingBottom: '10px' }}>
                          {daysList.map(d => {
                            const daySlots = sectionSlots.filter(s => (s.days || []).includes(d.code));
                            let dayMins = 0;
                            daySlots.forEach(s => {
                              if (s.startTime && s.endTime) dayMins += getTimeDiffMins(s.startTime, s.endTime);
                            });
                            const dayHours = (dayMins / 60).toFixed(1);

                            return (
                              <div
                                key={d.code}
                                style={{
                                  background: 'white',
                                  borderRadius: '14px',
                                  border: '1.5px solid var(--line)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  minHeight: '480px',
                                  overflow: 'hidden'
                                }}
                              >
                                <div style={{
                                  background: '#F8FAFC',
                                  padding: '12px 14px',
                                  borderBottom: '1.5px solid var(--line)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <strong style={{ fontSize: '13px', color: 'var(--navy)' }}>{d.label}</strong>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', background: '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>
                                    {dayHours}h
                                  </span>
                                </div>

                                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                  {daySlots.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94A3B8', fontSize: '11.5px' }}>
                                      No classes scheduled
                                    </div>
                                  ) : (
                                    daySlots.map((slot, idx) => {
                                      const isAdvisory = slot.subject === 'ADVISORY' || slot.subject === 'HGP';
                                      const duration = slot.startTime && slot.endTime ? getTimeDiffMins(slot.startTime, slot.endTime) : 60;
                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: isAdvisory ? '1.5px solid #FCD34D' : '1.5px solid #BAE6FD',
                                            background: isAdvisory ? '#FFFBEB' : '#F0F9FF',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            position: 'relative'
                                          }}
                                        >
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{
                                              fontSize: '10px',
                                              fontWeight: '800',
                                              color: isAdvisory ? '#B45309' : '#0284C7',
                                              fontFamily: 'monospace'
                                            }}>
                                              {slot.startTime} – {slot.endTime} ({duration}m)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveSectionSlot(slot.personnelId, slot.rowIdx)}
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#EF4444',
                                                cursor: 'pointer',
                                                padding: '2px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                opacity: 0.7
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                                              title="Remove slot"
                                            >
                                              <FiTrash2 size={12} />
                                            </button>
                                          </div>

                                          <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--navy)', marginTop: '2px' }}>
                                            {slot.subject}
                                            {slot.remediationSubject && (
                                              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600' }}>
                                                Focus: {slot.remediationSubject}
                                              </div>
                                            )}
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                                            <FiUser size={11} color="#0284C7" />
                                            <span style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {slot.personnelName}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* VIEW 2: Curriculum Coverage Matrix & Slot Table */}
                    {sectionViewMode === 'matrix' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Required Curriculum Checklist */}
                        <div className="card" style={{ padding: '20px', borderRadius: '16px', border: '1.5px solid var(--line)', background: 'white' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy)', fontWeight: '800' }}>
                                Curriculum Subject Coverage Checklist
                              </h3>
                              <p className="subtext" style={{ margin: '2px 0 0' }}>
                                Required DepEd curriculum subjects for {sec.gradeLevel} and their assigned teachers.
                              </p>
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#0284C7', background: '#F0F9FF', padding: '4px 10px', borderRadius: '8px', border: '1px solid #BAE6FD' }}>
                              {totalScheduledSubs} of {totalReqCount} Staffed
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                            {requiredCurriculumSubjects.map(sub => {
                              const normSub = normalizeSubjectName(sub);
                              const assignedList = assignedSubMap.get(normSub) || [];
                              const isAssigned = assignedList.length > 0;

                              return (
                                <div
                                  key={sub}
                                  style={{
                                    padding: '12px 14px',
                                    borderRadius: '12px',
                                    border: isAssigned ? '1.5px solid #86EFAC' : '1.5px dashed #CBD5E1',
                                    background: isAssigned ? '#F0FDF4' : '#F8FAFC',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px'
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {isAssigned ? (
                                        <FiCheckCircle size={14} color="#16A34A" />
                                      ) : (
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
                                      )}
                                      <strong style={{ fontSize: '13px', color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {sub}
                                      </strong>
                                    </div>
                                    {isAssigned ? (
                                      <div style={{ fontSize: '11px', color: '#15803D', marginTop: '3px', fontWeight: '600', paddingLeft: '20px' }}>
                                        {assignedList.map(a => a.personnelName).join(', ')}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px', paddingLeft: '14px' }}>
                                        No teacher assigned yet
                                      </div>
                                    )}
                                  </div>

                                  {!isAssigned && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const { nextStart: slotNextStart, nextEnd: slotNextEnd, nextDays: slotNextDays } = getWorkloadScheduleDefaults(sectionSlots);
                                        setNewSlot({ teacherId: '', subject: sub, remediationSubject: '', startTime: slotNextStart, endTime: slotNextEnd, days: slotNextDays });
                                        setSlotConflict(null);
                                        setShowAddSectionSlotModal(true);
                                      }}
                                      style={{
                                        padding: '5px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #0284C7',
                                        background: '#0284C7',
                                        color: '#FFFFFF',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      + Assign
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* All Current Section Slots Table */}
                        <div className="card" style={{ padding: '20px', borderRadius: '16px', border: '1.5px solid var(--line)', background: 'white' }}>
                          <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--navy)', fontWeight: '800' }}>
                            All Scheduled Section Slots ({sectionSlots.length})
                          </h3>
                          {sectionSlots.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: '13px' }}>
                              No schedule slots configured for this section.
                            </div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Subject</th>
                                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Teacher</th>
                                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Time</th>
                                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Days</th>
                                  <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sectionSlots.map((slot, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--navy)' }}>
                                      {slot.subject}
                                      {slot.remediationSubject && <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 'normal', marginLeft: '6px' }}>({slot.remediationSubject})</span>}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                                      <strong>{slot.personnelName}</strong> <span style={{ fontSize: '11px', color: '#64748B' }}>({slot.personnelPosition})</span>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#334155', fontFamily: 'monospace', fontSize: '12px' }}>
                                      {slot.startTime} – {slot.endTime}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                        {(slot.days || []).map(d => (
                                          <span key={d} style={{ background: '#0284C7', color: 'white', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: '700' }}>
                                            {d}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSectionSlot(slot.personnelId, slot.rowIdx)}
                                        style={{
                                          width: '28px',
                                          height: '28px',
                                          padding: 0,
                                          background: '#FEE2E2',
                                          border: '1px solid #FCA5A5',
                                          borderRadius: '6px',
                                          color: '#DC2626',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center'
                                        }}
                                        title="Remove Slot"
                                      >
                                        <FiTrash2 size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Add Schedule Slot Modal / Dialog */}
                    {showAddSectionSlotModal && (
                      <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px'
                      }}>
                        <div style={{
                          background: 'white',
                          borderRadius: '16px',
                          border: '1.5px solid #E2E8F0',
                          width: '100%',
                          maxWidth: '560px',
                          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column'
                        }}>
                          {/* Modal Header */}
                          <div style={{
                            padding: '18px 22px',
                            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                            color: 'white',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>+ Add Schedule Slot</h3>
                              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>
                                Assign a teacher to <strong>{sec.gradeLevel} — {sec.sectionName}</strong>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowAddSectionSlotModal(false)}
                              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px', display: 'flex' }}
                            >
                              <FiX size={20} />
                            </button>
                          </div>

                          {/* Modal Form Content */}
                          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
                            {/* Teacher Select */}
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>TEACHER</label>
                              {(() => {
                                const teacherOptions = personnel
                                  .filter(p => !p.isDraft && (p.type === 'teaching' || p.type === 'teaching-related') && getAssignedGradeLevels(p).length > 0)
                                  .map(p => ({
                                    value: p.id,
                                    label: `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}`
                                  }));

                                return (
                                  <SearchableSelect
                                    value={newSlot.teacherId}
                                    placeholder="Select teacher..."
                                    options={teacherOptions}
                                    onChange={(e) => {
                                      const teacherId = e.target.value;
                                      setNewSlot(prev => {
                                        const updated = { ...prev, teacherId };
                                        const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days, updated.subject);
                                        setSlotConflict(c);
                                        return updated;
                                      });
                                    }}
                                  />
                                );
                              })()}

                              {/* Teacher's Busy Schedule preview */}
                              {(() => {
                                const selectedTeacher = personnel.find(p => p.id === newSlot.teacherId);
                                if (!selectedTeacher) return null;
                                const teacherScheduleRows = [
                                  ...(selectedTeacher.workloadRows || []),
                                  ...(selectedTeacher.teachingRelatedRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task, isTR: true })),
                                  ...(selectedTeacher.administrativeRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task, isAdmin: true }))
                                ];
                                return (
                                  <div style={{ marginTop: '8px', padding: '8px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}>
                                    <strong style={{ color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                      <FiCalendar size={12} /> Teacher's Current Busy Schedule:
                                    </strong>
                                    {teacherScheduleRows.length === 0 ? (
                                      <span style={{ color: '#94A3B8' }}>No assigned classes or tasks yet. Free to assign.</span>
                                    ) : (
                                      <ul style={{ margin: 0, paddingLeft: '16px', color: '#475569', maxHeight: '100px', overflowY: 'auto' }}>
                                        {teacherScheduleRows.map((r, i) => (
                                          <li key={i} style={{ marginBottom: '2px' }}>
                                            <strong>{r.subject}</strong>: {r.startTime} – {r.endTime} [{(r.days || []).join(', ')}]
                                            {r.isTR && <span style={{ color: '#0284C7', marginLeft: '4px', fontSize: '9px', fontWeight: 'bold' }}>(TR)</span>}
                                            {r.isAdmin && <span style={{ color: '#9333EA', marginLeft: '4px', fontSize: '9px', fontWeight: 'bold' }}>(Admin)</span>}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Subject Select */}
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>SUBJECT</label>
                              {(() => {
                                const isAral = Boolean(
                                  String(sec.sectionType || '').toUpperCase().includes('ARAL') ||
                                  String(sec.sectionName || '').toUpperCase().includes('ARAL') ||
                                  String(sec.gradeLevel || '').toUpperCase().includes('ARAL') ||
                                  Boolean(sec.aralBasis || sec.aralToolKey || sec.aralTool) ||
                                  ['PHIL-IRI', 'PHIL IRI', 'CRLA', 'EGRA', 'ALNAT', 'RMA', 'TOS'].some(t =>
                                    String(sec.gradeLevel || '').toUpperCase().includes(t) ||
                                    String(sec.sectionType || '').toUpperCase().includes(t) ||
                                    String(sec.sectionName || '').toUpperCase().includes(t)
                                  )
                                );
                                const rawSubjects = isAral
                                  ? ['ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE']
                                  : (getSubjectsForGrade(sec.gradeLevel, cat) || []).filter(s => !isAralSubject(s));
                                const subjectOptions = rawSubjects
                                  .filter(s => s !== 'ADVISORY')
                                  .map(s => ({ value: s, label: s }));

                                return (
                                  <SearchableSelect
                                    value={newSlot.subject || ''}
                                    placeholder="Select subject…"
                                    options={subjectOptions}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (isRemediationSub(val)) {
                                        const defaultSub = (sec.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
                                        setNewSlot(prev => ({ ...prev, subject: val, remediationSubject: defaultSub }));
                                      } else {
                                        setNewSlot(prev => ({ ...prev, subject: val, remediationSubject: '' }));
                                      }
                                    }}
                                  />
                                );
                              })()}

                              {/* Remediation Focus Dropdown */}
                              {isRemediationSub(newSlot.subject) && (
                                <div style={{ marginTop: '8px' }}>
                                  <label style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>REMEDIATION FOCUS</label>
                                  <select
                                    value={newSlot.remediationSubject || (sec.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN')}
                                    onChange={(e) => setNewSlot(prev => ({ ...prev, remediationSubject: e.target.value }))}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px' }}
                                  >
                                    {[
                                      'ARALING PANLIPUNAN',
                                      'FILIPINO',
                                      'ENGLISH',
                                      'MATHEMATICS',
                                      'SCIENCE',
                                      'EPP/TLE',
                                      'MAPEH',
                                      'VALUES EDUCATION',
                                      'GMRC'
                                    ].map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>

                            {/* Time Slots */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>START TIME</label>
                                <input
                                  type="time"
                                  list="school-times"
                                  value={newSlot.startTime}
                                  onChange={(e) => {
                                    const startTime = e.target.value;
                                    const endTime = add60MinutesToTime(startTime);
                                    setNewSlot(prev => {
                                      const updated = { ...prev, startTime, endTime, days: prev.days && prev.days.length > 0 ? prev.days : ['M', 'T', 'W', 'TH', 'F'] };
                                      const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days, updated.subject);
                                      setSlotConflict(c);
                                      return updated;
                                    });
                                  }}
                                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>END TIME</label>
                                <input
                                  type="time"
                                  list="school-times"
                                  value={newSlot.endTime || add60MinutesToTime(newSlot.startTime)}
                                  onChange={(e) => {
                                    const endTime = e.target.value;
                                    setNewSlot(prev => {
                                      const updated = { ...prev, endTime };
                                      const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days, updated.subject);
                                      setSlotConflict(c);
                                      return updated;
                                    });
                                  }}
                                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                                />
                              </div>
                            </div>

                            {/* Days of Week */}
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>SCHEDULE DAYS</label>
                              <div className="day-checks">
                                {['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN'].map(day => (
                                  <div
                                    key={day}
                                    className={`day-check ${newSlot.days.includes(day) ? 'checked' : ''}`}
                                    onClick={() => toggleNewSlotDay(day)}
                                    style={{
                                      background: newSlot.days.includes(day) ? 'linear-gradient(180deg, #0284C7, #0369A1)' : 'white',
                                      color: newSlot.days.includes(day) ? 'white' : '#0284C7'
                                    }}
                                  >
                                    {day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday'}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Conflict Alert Box */}
                            {slotConflict && (
                              <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <FiAlertCircle size={20} color="#B91C1C" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                  <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#B91C1C', fontSize: '13px' }}>
                                    {slotConflict.type === 'section' ? 'Section Schedule Conflict' : 'Teacher Schedule Conflict'}
                                  </p>
                                  <p style={{ margin: 0, color: '#7F1D1D', fontSize: '12px', lineHeight: '1.4' }}>
                                    {slotConflict.type === 'section'
                                      ? `This section already has ${slotConflict.subject} scheduled from ${slotConflict.startTime} – ${slotConflict.endTime} (assigned to ${slotConflict.teacherName}) on [${(slotConflict.days || []).join(', ')}]. Please choose a different time slot or day.`
                                      : `${slotConflict.teacherName} is already assigned to ${slotConflict.subject} from ${slotConflict.startTime} – ${slotConflict.endTime} on [${(slotConflict.days || []).join(', ')}]. Please choose a different time or teacher.`}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Modal Footer Actions */}
                          <div style={{ padding: '16px 22px', background: '#F8FAFC', borderTop: '1.5px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                              type="button"
                              onClick={() => setShowAddSectionSlotModal(false)}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1.5px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#475569',
                                fontWeight: '700',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddSectionSlot}
                              disabled={!!slotConflict}
                              style={{
                                padding: '8px 20px',
                                borderRadius: '8px',
                                border: 'none',
                                background: slotConflict ? '#CBD5E1' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: slotConflict ? '#64748B' : '#FFFFFF',
                                fontWeight: '800',
                                fontSize: '12px',
                                cursor: slotConflict ? 'not-allowed' : 'pointer',
                                boxShadow: slotConflict ? 'none' : '0 2px 4px rgba(16, 185, 129, 0.25)'
                              }}
                            >
                              {slotConflict ? 'Fix Conflict to Add' : '+ Add Slot to Section'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── BY PERSONNEL VIEW (split-screen layout) ── */}
          {workloadView === 'by-personnel' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start', marginTop: '10px' }}>
              {/* Left Column: Teacher Roster Sidebar */}
              <div style={{
                background: 'white',
                padding: '16px',
                borderRadius: '16px',
                border: '1.5px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '850px',
                maxHeight: 'calc(100vh - 80px)',
                position: 'sticky',
                top: '20px',
                overflowY: 'auto'
              }}>
                <h3 style={{ fontSize: '15px', color: 'var(--navy)', margin: 0, fontWeight: 'bold' }}>Select Teacher</h3>

                {/* Search Input */}
                <input
                  type="text"
                  placeholder="Search name or position..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                />

                {/* Dropdown Filters Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>GRADE LEVEL</label>
                    <select
                      value={gradeFilter}
                      onChange={(e) => setGradeFilter(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white' }}
                    >
                      <option value="all">All Grades</option>
                      {['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'MONO-GRADE'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>CATEGORY</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white' }}
                    >
                      <option value="all">ALL CATEGORIES</option>
                      <option value="teaching">TEACHING</option>
                      <option value="teaching-related">RELATED-TEACHING</option>
                      <option value="non-teaching">NON-TEACHING</option>
                    </select>
                  </div>
                </div>

                {/* Vertical Teacher List (15 per page) */}
                {(() => {
                  const totalSidebarPages = Math.ceil(filteredPeople.length / 15) || 1;
                  const paginatedPeople = filteredPeople.slice((sidebarPage - 1) * 15, sidebarPage * 15);

                  return (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, minHeight: '600px' }}>
                        {paginatedPeople.map((p) => {
                          const isActive = currentPerson && p.id === currentPerson.id;
                          const hasSavedWorkload = Boolean(
                            validatedTeacherMap[p.id] &&
                            ((Array.isArray(p.workloadRows) && p.workloadRows.length > 0) ||
                             (currentPerson && currentPerson.id === p.id && Array.isArray(currentPerson.workloadRows) && currentPerson.workloadRows.length > 0))
                          );
                          const pHours = teacherHoursMap[p.id] || 0;
                          const isShaOff = isAllowanceDisabled(allowancesMap?.[p.id], 'hardship');
                          return (
                            <div
                              key={p.id}
                              onClick={() => confirmAction(() => setActivePersonnelId(p.id))}
                              style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: isActive ? '1.5px solid var(--blue)' : '1.5px solid var(--line)',
                                background: isActive ? '#F0F9FF' : 'white',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                              }}
                            >
                              <span style={{ fontWeight: '700', fontSize: '13.5px', color: isActive ? 'var(--blue)' : 'var(--navy)' }}>
                                {p.firstName} {p.lastName}
                              </span>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)' }}>
                                <span>{p.position}</span>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  {isShaOff && (
                                    <span style={{
                                      background: '#F1F5F9',
                                      color: '#64748B',
                                      border: '1px solid #CBD5E1',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      fontSize: '8.5px',
                                      fontWeight: '700'
                                    }}>
                                      SHA Off
                                    </span>
                                  )}
                                  {isEligibleForTeachingOverload(p) && pHours > 30 && (
                                    <span style={{
                                      background: '#FEF2F2',
                                      color: '#F43F5E',
                                      border: '1px solid #FCA5A5',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      fontSize: '8.5px',
                                      fontWeight: '700'
                                    }}>
                                      Overload
                                    </span>
                                  )}
                                  {p.workloadVerified === false && (
                                    <span style={{
                                      background: '#FEF3C7',
                                      color: '#D97706',
                                      border: '1px solid #FCD34D',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      fontSize: '8.5px',
                                      fontWeight: '700'
                                    }}>
                                      Time Review
                                    </span>
                                  )}
                                  {hasSavedWorkload && (
                                    <span style={{
                                      background: '#DCFCE7',
                                      color: '#15803D',
                                      border: '1px solid #86EFAC',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      fontSize: '8.5px',
                                      fontWeight: '700'
                                    }}>
                                      Saved
                                    </span>
                                  )}
                                  {(p.isClustered || p.deploymentStatus === 'CLUSTERED') && (
                                    <span style={{
                                      background: '#FEF3C7',
                                      color: '#B45309',
                                      border: '1px solid #FCD34D',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      fontSize: '8.5px',
                                      fontWeight: '700'
                                    }}>
                                      Clustered
                                    </span>
                                  )}
                                  <span style={{
                                    background: p.type === 'teaching' ? '#e0f2fe' : p.type === 'teaching-related' ? '#fae8ff' : '#f1f5f9',
                                    color: p.type === 'teaching' ? '#0369a1' : p.type === 'teaching-related' ? '#a21caf' : '#475569',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '9px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                  }}>
                                    {p.type === 'teaching-related' ? 'Related' : p.type}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {filteredPeople.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '13px' }}>
                            No matching teachers found.
                          </div>
                        )}
                      </div>

                      {/* Pagination Controls Bar */}
                      {totalSidebarPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1.5px solid var(--line)', marginTop: 'auto' }}>
                          <button
                            type="button"
                            disabled={sidebarPage === 1}
                            onClick={() => setSidebarPage(prev => Math.max(1, prev - 1))}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--line)',
                              background: sidebarPage === 1 ? '#f8fafc' : 'white',
                              color: sidebarPage === 1 ? '#cbd5e1' : 'var(--navy)',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: sidebarPage === 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            ◀ Prev
                          </button>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>
                            Page {sidebarPage} of {totalSidebarPages} ({filteredPeople.length} total)
                          </span>
                          <button
                            type="button"
                            disabled={sidebarPage >= totalSidebarPages}
                            onClick={() => setSidebarPage(prev => Math.min(totalSidebarPages, prev + 1))}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--line)',
                              background: sidebarPage >= totalSidebarPages ? '#f8fafc' : 'white',
                              color: sidebarPage >= totalSidebarPages ? '#cbd5e1' : 'var(--navy)',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: sidebarPage >= totalSidebarPages ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Next ▶
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Right Column: Workload Editor */}
              {!currentPerson ? (
                <div style={{ minWidth: 0 }}>
                  <div className="card" style={{ padding: '40px', textAlign: 'center', border: '1.5px solid var(--line)', borderRadius: '16px', background: 'white' }}>
                    <h3 style={{ color: 'var(--navy)', margin: 0 }}>No Teacher Selected</h3>
                    <p className="subtext" style={{ margin: '8px 0 0 0' }}>Please select a teacher from the roster list on the left to configure workloads.</p>
                  </div>
                </div>
              ) : (
                <div style={{ minWidth: 0 }}>
                    {/* Schedule Time Verification Banner */}
                    {(() => {
                      const currentTeacherRows = (currentPerson?.workloadRows || []).filter(r => (r.term || '1st') === activeTerm);
                      const hasBlockingErrors = currentTeacherRows.some((r, rIdx) => {
                        if (getRowDurationError(r)) return true;
                        const rDays = getNormalizedRowDays(r);
                        return currentTeacherRows.some((otherR, oIdx) => {
                          if (rIdx === oIdx) return false;
                          if (r.id && otherR.id && String(r.id) === String(otherR.id)) return false;
                          if (!r.startTime || !r.endTime || !otherR.startTime || !otherR.endTime) return false;
                          const otherDays = getNormalizedRowDays(otherR);
                          const daysOverlap = rDays.some(d => otherDays.includes(d));
                          if (!daysOverlap) return false;
                          const ns = parseMins(r.startTime), ne = parseMins(r.endTime);
                          const rs = parseMins(otherR.startTime), re = parseMins(otherR.endTime);
                          if (ns < re && ne > rs) {
                            if (isAdvisoryOrHgpPair(r, otherR)) return false;
                            return true;
                          }
                          return false;
                        });
                      });

                      if (!currentPerson || currentPerson.workloadVerified !== false) return null;

                      return (
                        <div style={{
                          background: hasBlockingErrors ? '#FEF2F2' : '#FFFBEB',
                          border: `1.5px solid ${hasBlockingErrors ? '#EF4444' : '#F59E0B'}`,
                          borderRadius: '12px',
                          padding: '14px 18px',
                          marginBottom: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                          boxShadow: '0 2px 4px rgba(245, 158, 11, 0.15)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {hasBlockingErrors ? <FiAlertCircle size={24} color="#EF4444" /> : <FiAlertTriangle size={24} color="#F59E0B" />}
                            <div>
                              <strong style={{ color: hasBlockingErrors ? '#991B1B' : '#92400E', fontSize: '13.5px', display: 'block' }}>
                                {hasBlockingErrors ? 'Fix Invalid Duration / Overlapping Time Slots First' : 'Auto-Populated Schedule Requires Time Verification'}
                              </strong>
                              <span style={{ color: hasBlockingErrors ? '#B91C1C' : '#B45309', fontSize: '12px', fontWeight: hasBlockingErrors ? '600' : '400' }}>
                                {hasBlockingErrors
                                  ? `Please fix red duration errors (> 60m / > 6h SHS) or overlaps for ${currentPerson.firstName} ${currentPerson.lastName} before confirming.`
                                  : `Please inspect all Start Times, End Times, and Days for ${currentPerson.firstName} ${currentPerson.lastName}.`}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={hasBlockingErrors}
                            onClick={() => handleVerifySchedule(currentPerson.id)}
                            style={{
                              background: hasBlockingErrors ? '#CBD5E1' : 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                              color: hasBlockingErrors ? '#64748B' : '#FFFFFF',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px 18px',
                              fontWeight: '700',
                              fontSize: '12px',
                              cursor: hasBlockingErrors ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                              boxShadow: hasBlockingErrors ? 'none' : '0 4px 6px -1px rgba(217, 119, 6, 0.3)'
                            }}
                            title={hasBlockingErrors ? "Fix red duration errors or overlapping schedules before confirming" : "Confirm and save schedule"}
                          >
                            {hasBlockingErrors ? <><FiAlertCircle size={14} style={{ marginRight: '6px' }} /> Fix Errors First</> : <><FiCheck size={14} style={{ marginRight: '6px' }} /> Confirm Schedule</>}
                          </button>
                        </div>
                      );
                    })()}

                    {/* Non-Teaching Personnel Banner */}
                    {currentPerson?.type === 'non-teaching' && (
                      <div style={{
                        background: '#F1F5F9', border: '1.5px solid #CBD5E1', borderRadius: '12px',
                        padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px'
                      }}>
                        <FiBriefcase size={28} color="#0284c7" />
                        <div>
                          <strong style={{ color: '#1E293B', fontSize: '14px', display: 'block' }}>
                            Non-Teaching Personnel
                          </strong>
                          <span style={{ color: '#475569', fontSize: '12px' }}>
                            {currentPerson.firstName} {currentPerson.lastName} ({currentPerson.position || 'Non-Teaching'}) is classified as non-teaching with <strong>0.0 teaching workload hours</strong>. Administrative duty assignments and daily 8.0-hour schedule (40.0 hrs/week target) are configured in the timetable below.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Draft Banner if real unsaved changes exist */}
                    {isCurrentTeacherDirty && (
                      <div style={{ padding: '12px 16px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '12px', color: '#B45309', fontSize: '13px', marginBottom: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiAlertTriangle size={15} color="#F59E0B" /> You have unsaved workload changes for this personnel (draft stored locally).</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            className="btn primary"
                            style={{ minHeight: '28px', padding: '0 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', background: '#0284C7', borderColor: '#0284C7', color: '#FFFFFF' }}
                            type="button"
                            onClick={handleSaveChangesDirectly}
                            disabled={isSaving}
                          >
                            <FiSave size={13} /> {isSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button className="btn secondary" style={{ minHeight: '28px', padding: '0 10px', fontSize: '12px', background: 'white', color: '#B45309', borderColor: '#FCD34D' }} type="button" onClick={async () => {
                            if (await showConfirm("Discard Draft?", "Are you sure you want to discard your unsaved changes and revert to the server data?")) {
                              localStorage.removeItem(`draft_workload_${dbPerson.id}`);
                              await hydrateWorkloadFromServer(dbPerson.id, activeTerm, { afterSave: true });
                            }
                          }}>
                            Discard Draft
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Reassigned Personnel (Mother School) Banner */}
                    {(currentPerson?.requestType === 'reassigned_teacher' || currentPerson?.deploymentStatus === 'REASSIGNED' || currentPerson?.isReassignedOut) && !currentPerson?.isShared && (
                      <div style={{
                        background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                        border: '1.5px solid #93C5FD',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.08)'
                      }}>
                        <FiBriefcase size={28} color="#2563EB" />
                        <div>
                          <strong style={{ color: '#1E40AF', fontSize: '14px', display: 'block' }}>
                            Reassigned Personnel (Mother Station)
                          </strong>
                          <span style={{ color: '#1E3A8A', fontSize: '12px' }}>
                            {currentPerson.firstName} {currentPerson.lastName} is officially reassigned/deployed out to a partner school. Official master profile and plantilla appointment are retained at Mother Station with <strong>0.0 teaching workload hours</strong> (workload is assigned and certified at the host station).
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Clustered Teacher Dual-Station Sync Banner & Teaching Meter */}
                    {isClustered && (
                      <div style={{
                        background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                        border: '1.5px solid #F59E0B',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 6px rgba(245, 158, 11, 0.12)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <FiClock size={26} color="#D97706" />
                            <div>
                              <strong style={{ color: '#92400E', fontSize: '14px', display: 'block' }}>
                                Clustered Personnel — Dual-School Real-Time Workload Sync
                              </strong>
                              <span style={{ color: '#78350F', fontSize: '12px' }}>
                                Teaching load is coordinated across both stations. Partner school assignments appear as locked ghost slots on the timetable.
                              </span>
                            </div>
                          </div>
                          
                          {/* Combined Teaching Meter */}
                          {(() => {
                            const computeWeeklyMins = (slots) => {
                              let total = 0;
                              const daysList = ['M', 'T', 'W', 'TH', 'F'];
                              for (const d of daysList) {
                                const intervals = [];
                                for (const r of (slots || [])) {
                                  if (!r.startTime || !r.endTime) continue;
                                  const rawDays = Array.isArray(r.days) && r.days.length > 0 ? r.days : (r.day ? [r.day] : ['M','T','W','TH','F']);
                                  const normDays = rawDays.map(dayStr => {
                                    if (!dayStr) return 'M';
                                    const u = String(dayStr).trim().toUpperCase();
                                    if (u === 'M' || u.startsWith('MON')) return 'M';
                                    if (u === 'TH' || u.startsWith('THU')) return 'TH';
                                    if (u === 'T' || u.startsWith('TUE')) return 'T';
                                    if (u === 'W' || u.startsWith('WED')) return 'W';
                                    if (u === 'F' || u.startsWith('FRI')) return 'F';
                                    if (u === 'SAT' || u.startsWith('SAT')) return 'SAT';
                                    if (u === 'SUN' || u.startsWith('SUN')) return 'SUN';
                                    return u;
                                  });
                                  if (!normDays.includes(d)) continue;
                                  const subUpper = String(r.subject || '').toUpperCase().trim();
                                  if (isNonTeachingTaskSubject(subUpper) || subUpper === 'HGP' || subUpper.startsWith('HGP (') || subUpper.includes('HOMEROOM GUIDANCE')) continue;
                                  const sM = parseMins(r.startTime || r.start_time);
                                  const eM = parseMins(r.endTime || r.end_time);
                                  if (sM < 99999 && eM < 99999 && eM > sM) {
                                    intervals.push([sM, eM]);
                                  }
                                }
                                if (intervals.length > 0) {
                                  intervals.sort((a, b) => a[0] - b[0]);
                                  let merged = [intervals[0]];
                                  for (let i = 1; i < intervals.length; i++) {
                                    const cur = intervals[i];
                                    const last = merged[merged.length - 1];
                                    if (cur[0] <= last[1]) {
                                      last[1] = Math.max(last[1], cur[1]);
                                    } else {
                                      merged.push(cur);
                                    }
                                  }
                                  for (const [st, en] of merged) {
                                    total += (en - st);
                                  }
                                }
                              }
                              return total;
                            };

                            const myWeeklyMins = computeWeeklyMins(currentPerson.workloadRows);
                            const sharedWeeklyMins = computeWeeklyMins(sharedWorkloadRows);
                            const totalWeeklyMins = myWeeklyMins + sharedWeeklyMins;
                            const totalWeeklyHrs = (totalWeeklyMins / 60).toFixed(1);
                            const dailyAvgHrs = (Number(totalWeeklyHrs) / 5).toFixed(1);
                            const isStandard = totalWeeklyMins <= (30 * 60);

                            return (
                              <div style={{
                                background: 'white',
                                border: '1.5px solid #FCD34D',
                                borderRadius: '10px',
                                padding: '8px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                              }}>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '10px', color: '#92400E', fontWeight: 'bold', textTransform: 'uppercase' }}>This School</div>
                                  <div style={{ fontSize: '13px', color: '#0284C7', fontWeight: '800' }}>{(myWeeklyMins / 60).toFixed(1)} hrs/wk</div>
                                </div>
                                <div style={{ fontSize: '16px', color: '#D97706', fontWeight: 'bold' }}>+</div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '10px', color: '#92400E', fontWeight: 'bold', textTransform: 'uppercase' }}>Partner School</div>
                                  <div style={{ fontSize: '13px', color: '#7C3AED', fontWeight: '800' }}>{(sharedWeeklyMins / 60).toFixed(1)} hrs/wk</div>
                                </div>
                                <div style={{ fontSize: '16px', color: '#D97706', fontWeight: 'bold' }}>=</div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '10px', color: '#92400E', fontWeight: 'bold', textTransform: 'uppercase' }}>Combined Total</div>
                                  <div style={{ fontSize: '13px', color: isStandard ? '#16A34A' : '#DC2626', fontWeight: '800' }}>
                                    {totalWeeklyHrs} hrs/wk ({dailyAvgHrs}h/day)
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    {currentPerson && workloadSync[currentPerson.id]?.status === 'unconfirmed' && (
                      <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '10px', color: '#92400E', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <span>
                          Could not confirm this teacher's saved workload with the server ({workloadSync[currentPerson.id].message}). You are seeing your local copy, which is not yet confirmed saved. Nothing has been cleared.
                        </span>
                        <button
                          type="button"
                          onClick={() => hydrateWorkloadRef.current(currentPerson.id, activeTerm)}
                          style={{ flexShrink: 0, border: '1.5px solid #D97706', background: 'white', color: '#92400E', borderRadius: '8px', padding: '5px 12px', fontSize: '11.5px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          Try Again
                        </button>
                      </div>
                    )}
                    {/* Workload Schedule (Gantt Timetable View) */}
                    <div style={{ marginBottom: '24px' }}>
                      <WorkloadGanttScheduleView
                        currentPerson={currentPerson}
                        classSections={classSections}
                        updateWorkloadRowFields={updateWorkloadRowFields}
                        removeWorkloadRow={removeWorkloadRow}
                        addWorkloadRow={addWorkloadRow}
                        handleFieldChange={handleFieldChange}
                        getSubjectsForGrade={getSubjectsForGrade}
                        getAssignedGradeLevels={getAssignedGradeLevels}
                        getSubjectAssignmentForSection={getSubjectAssignmentForSection}
                        getRequiredWeeklyMinutes={getRequiredWeeklyMinutes}
                        getSubjectAllocationForSection={getSubjectAllocationForSection}
                        getRowDurationError={getRowDurationError}
                        getMatatagRowWarning={getMatatagRowWarning}
                        getMatatagFixedDurationMins={getMatatagFixedDurationMins}
                        getDuplicateSectionSubjectError={getDuplicateSectionSubjectError}
                        getHgpWeeklyError={getHgpWeeklyError}
                        isAdvisoryOrHgpPair={isAdvisoryOrHgpPair}
                        isSHSRow={isSHSRow}
                        GRADE_LEVELS_BY_CATEGORY={GRADE_LEVELS_BY_CATEGORY}
                        SUBJECT_OPTIONS={SUBJECT_OPTIONS}
                        REMEDIATION_FOCUS_BY_CATEGORY={REMEDIATION_FOCUS_BY_CATEGORY}
                        GRADE_LEVEL_SUBJECTS={GRADE_LEVEL_SUBJECTS}
                        dbPerson={dbPerson}
                        activePersonnelId={activePersonnelId}
                        selectedBlockIdx={selectedBlockIdx}
                        setSelectedBlockIdx={setSelectedBlockIdx}
                        handleSaveChangesDirectly={handleSaveChangesDirectly}
                        isSaving={isSaving}
                        sharedWorkloadRows={sharedWorkloadRows}
                        activeTerm={activeTerm}
                        onCopyFirstTerm={(scope) => handleCopyFirstTermToSecondTerm(scope || 'CURRENT')}
                        onClearTermWorkload={handleClearCurrentTeacherWorkload}
                      />
                    </div>

                    {/* ── WORK IMMERSION MONTHLY CALENDAR & OVERLOAD INTEGRATION ── */}
                    {(() => {
                      const elemJhsRows = (currentPerson?.workloadRows || []).filter(r => {
                        const g = String(r.gradeLevel || '').toUpperCase();
                        const isShsGrade = g.includes('11') || g.includes('12') || g.includes('SHS') || g.includes('SENIOR');
                        return !isShsGrade && (r.sectionName || r.sectionId);
                      });

                      const personShsMap = shsWorkloadMap[currentPerson?.id] || {};
                      const activeShsRows = [
                        ...(personShsMap['1st'] || []),
                        ...(personShsMap['2nd'] || []),
                        ...(personShsMap['3rd'] || [])
                      ].filter(r => r.sectionName || r.sectionId);

                      const activeAssignedRows = [...elemJhsRows, ...activeShsRows];

                      const hasImmersion = activeAssignedRows.some(r => {
                        const sub = String(r.subject || '').toUpperCase().trim();
                        return sub.includes('WORK IMMERSION');
                      });
                      if (!hasImmersion) return null;

                      return (
                        <WorkImmersionSection
                          currentPerson={currentPerson}
                          schoolInfo={schoolInfo}
                          showToast={showToast}
                          workImmersionSchedulesMap={workImmersionSchedulesMap}
                          fetchWorkImmersionSchedules={fetchWorkImmersionSchedules}
                          saveWorkImmersionSchedules={saveWorkImmersionSchedules}
                        />
                      );
                    })()}

                    {/* Extra Tasks builders */}
                    <div className="workload-section-panel" style={{ marginTop: '20px' }}>
                      <div className="workload-section-title">
                        <h3>Extra Task Builder</h3>
                      </div>

                      <div className="task-assignment-grid">

                        {/* Teaching-related tasks */}
                        <div className="multi-task-panel">
                          <div className="multi-task-panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <label style={{ fontSize: '14px', fontWeight: '800', color: 'var(--navy)' }}>Teaching-Related Tasks</label>
                              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B' }}>
                                Auto-synced from Official Designations (Guidance Designate, Coordinators, Officers). Tasks are locked.
                              </p>
                            </div>
                            <button 
                              type="button" 
                              className="btn secondary sm" 
                              onClick={() => typeof setActiveView === 'function' && setActiveView('designation')}
                              style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px' }}
                              title="Assign or unassign official designations in the Designations tab"
                            >
                              <FiBookmark size={12} color="#0284C7" /> Manage Designations
                            </button>
                          </div>

                          {/* Empty State when no designations assigned */}
                          {(!currentPerson.teachingRelatedRows || currentPerson.teachingRelatedRows.length === 0) && (
                            <div style={{ background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '12px', padding: '24px 16px', textAlign: 'center', margin: '14px 0' }}>
                              <FiBookmark size={28} color="#94A3B8" style={{ marginBottom: '6px' }} />
                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>No Teaching-Related Designations Assigned</div>
                              <div style={{ fontSize: '11px', color: '#64748B', maxWidth: '420px', margin: '4px auto 12px', lineHeight: '1.5' }}>
                                Teaching-related tasks are automatically assigned through official designations (e.g. Guidance Designate, Property Custodian, Reading Coordinator).
                              </div>
                              <button 
                                type="button" 
                                className="btn sm" 
                                onClick={() => typeof setActiveView === 'function' && setActiveView('designation')}
                                style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', color: 'white', border: 'none', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <FiPlus size={12} /> Assign Role in Designations
                              </button>
                            </div>
                          )}

                          <div className="multi-task-rows" style={{ marginTop: '12px' }}>
                            {(currentPerson.teachingRelatedRows || []).map((row, idx) => {
                              const cadence = row.cadence || row.frequency || 'weekly';
                              const durMins = row.duration_minutes !== undefined ? Number(row.duration_minutes) : (row.hours !== undefined ? Math.round(Number(row.hours) * 60) : 60);
                              const hours = (durMins / 60);
                              
                              // Calculate 1st term total:
                              // Term 1: 12 wks / 60 school days (3 mos)
                              let term1Hrs = 0;
                              if (cadence === 'daily') {
                                term1Hrs = (hours * 60).toFixed(1);
                              } else if (cadence === 'monthly') {
                                term1Hrs = (hours * 3).toFixed(1);
                              } else {
                                term1Hrs = (hours * 12).toFixed(1);
                              }

                              return (
                                <div 
                                  key={idx} 
                                  style={{ 
                                    background: '#FFFFFF', 
                                    border: '1.5px solid #E2E8F0', 
                                    borderRadius: '12px', 
                                    padding: '16px', 
                                    marginBottom: '12px',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                                  }}
                                >
                                  {/* Row Header: Designation Task Name (Locked) */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ background: '#E0F2FE', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <FiLock size={14} color="#0284C7" />
                                      </div>
                                      <div>
                                        <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)', letterSpacing: '0.2px' }}>
                                          {row.task || row.task_name || 'Official Designation'}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                          <span style={{ background: '#F1F5F9', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                            Official Designation
                                          </span>
                                          <span style={{ color: '#0284C7', fontWeight: '700' }}>
                                            Locked (Remove in Designations)
                                          </span>
                                          {row.isSdsApproved && (
                                            <span style={{ background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                              SDS Approved
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                                      Non-removable in Workload
                                    </div>
                                  </div>

                                  {/* Cadence & Hours Controller Grid */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', alignItems: 'center', marginTop: '14px' }}>
                                    {/* Frequency Cadence Buttons */}
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                        How often is this task performed?
                                      </label>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                        {[
                                          { id: 'daily', label: 'Daily' },
                                          { id: 'weekly', label: 'Weekly' },
                                          { id: 'monthly', label: 'Monthly' }
                                        ].map(cOpt => {
                                          const isSel = cadence === cOpt.id;
                                          return (
                                            <button
                                              key={cOpt.id}
                                              type="button"
                                              onClick={() => {
                                                updateTaskFields('teachingRelatedRows', idx, {
                                                  cadence: cOpt.id,
                                                  frequency: cOpt.id
                                                });
                                              }}
                                              style={{
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: isSel ? '1.5px solid #0284C7' : '1.5px solid #CBD5E1',
                                                background: isSel ? '#EFF6FF' : '#FFFFFF',
                                                color: isSel ? '#0369A1' : '#475569',
                                                fontWeight: isSel ? '800' : '600',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                              }}
                                            >
                                              {cOpt.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {/* Number of Hours Input */}
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                        {cadence === 'daily' ? 'Hours / Day' : cadence === 'weekly' ? 'Hours / Week' : 'Hours / Month'}
                                      </label>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                          type="number"
                                          step="0.5"
                                          min="0.5"
                                          max="40"
                                          value={row.hours !== undefined ? row.hours : (durMins / 60)}
                                          onChange={(e) => {
                                            const inputVal = e.target.value;
                                            if (inputVal === '') {
                                              updateTaskFields('teachingRelatedRows', idx, {
                                                hours: '',
                                                duration_minutes: 0,
                                                durationMinutes: 0
                                              });
                                              return;
                                            }
                                            const val = parseFloat(inputVal);
                                            if (!isNaN(val)) {
                                              updateTaskFields('teachingRelatedRows', idx, {
                                                hours: val,
                                                duration_minutes: Math.round(val * 60),
                                                durationMinutes: Math.round(val * 60)
                                              });
                                            }
                                          }}
                                          onBlur={(e) => {
                                            const val = parseFloat(e.target.value);
                                            const finalVal = (!val || isNaN(val) || val <= 0) ? 0.5 : val;
                                            updateTaskFields('teachingRelatedRows', idx, {
                                              hours: finalVal,
                                              duration_minutes: Math.round(finalVal * 60),
                                              durationMinutes: Math.round(finalVal * 60)
                                            });
                                          }}
                                          style={{
                                            width: '100px',
                                            padding: '7px 10px',
                                            borderRadius: '8px',
                                            border: '1.5px solid var(--line)',
                                            fontSize: '13px',
                                            fontWeight: '700',
                                            color: 'var(--navy)'
                                          }}
                                        />
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>
                                          {cadence === 'daily' ? 'hrs/day' : cadence === 'weekly' ? 'hrs/wk' : 'hrs/mo'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 1st Term Allocation Badge */}
                                  <div style={{ marginTop: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                                        1st Term Allocation:
                                      </span>
                                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '800', color: '#1E40AF' }}>
                                        1st Term Total: <strong>{term1Hrs} hrs</strong> ({durMins} mins / {cadence})
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Administrative Tasks (Ancillary Duties) */}
                        <div className="multi-task-panel">
                          <div className="multi-task-panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <label style={{ fontSize: '14px', fontWeight: '800', color: 'var(--navy)' }}>Administrative Tasks (Ancillary Duties)</label>
                              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B' }}>
                                Scheduled directly on the unified Gantt chart timetable above.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => {
                                const newId = `admin-workload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                                const newRow = {
                                  id: newId,
                                  sectionId: '',
                                  sectionName: '',
                                  gradeLevel: '',
                                  category: '',
                                  subject: ADMIN_TASK_OPTIONS[0],
                                  startTime: '13:00',
                                  endTime: '14:00',
                                  days: ['M', 'T', 'W', 'TH', 'F'],
                                  term: activeTerm
                                };
                                const updated = [newRow, ...(currentPerson.workloadRows || [])];
                                if (typeof handleFieldChange === 'function') {
                                  handleFieldChange('workloadRows', updated);
                                }
                                setSelectedBlockIdx(0);
                                if (showToast) {
                                  showToast('💼 Added Administrative Task to timetable! Adjust hours or days in the inspector.', 'success');
                                }
                                const el = document.querySelector('.gantt-schedule-container');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                              }}
                              style={{
                                background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '11px',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                boxShadow: '0 2px 4px rgba(15, 23, 42, 0.2)',
                                cursor: 'pointer'
                              }}
                            >
                              <FiBriefcase size={13} color="#38BDF8" /> + Add Admin Task
                            </button>
                          </div>

                          {/* List of currently assigned Admin Tasks on timetable */}
                          {(() => {
                            const adminRows = (currentPerson.workloadRows || []).filter(r => (r.term || '1st') === activeTerm && isAdminTaskRow(r));
                            if (adminRows.length === 0) {
                              return (
                                <div style={{ background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '12px', padding: '24px 16px', textAlign: 'center', margin: '14px 0' }}>
                                  <FiBriefcase size={28} color="#94A3B8" style={{ marginBottom: '6px' }} />
                                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>No Administrative Tasks Scheduled</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', maxWidth: '420px', margin: '4px auto 12px', lineHeight: '1.5' }}>
                                    If this teacher performs school-level administrative duties (Personnel Administration, Property Custodianship, Financial Management, etc.), click <strong>+ Add Admin Task</strong> to schedule on the Gantt chart.
                                  </div>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    onClick={() => {
                                      const newId = `admin-workload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                                      const newRow = {
                                        id: newId,
                                        sectionId: '',
                                        sectionName: '',
                                        gradeLevel: '',
                                        category: '',
                                        subject: ADMIN_TASK_OPTIONS[0],
                                        startTime: '13:00',
                                        endTime: '14:00',
                                        days: ['M', 'T', 'W', 'TH', 'F'],
                                        term: activeTerm
                                      };
                                      const updated = [newRow, ...(currentPerson.workloadRows || [])];
                                      if (typeof handleFieldChange === 'function') {
                                        handleFieldChange('workloadRows', updated);
                                      }
                                      setSelectedBlockIdx(0);
                                      if (showToast) {
                                        showToast('💼 Added Administrative Task to timetable! Adjust hours or days in the inspector.', 'success');
                                      }
                                      const el = document.querySelector('.gantt-schedule-container');
                                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    style={{
                                      background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                                      color: '#FFFFFF',
                                      border: 'none',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '7px 16px',
                                      borderRadius: '8px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <FiPlus size={12} /> + Add Admin Task to Timetable
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {adminRows.map((r, rIdx) => {
                                  const sDays = (Array.isArray(r.days) && r.days.length > 0) ? r.days.join(', ') : 'M-F';
                                  const diffMins = getTimeDiffMins(r.startTime, r.endTime);
                                  const hrs = (diffMins / 60).toFixed(1);
                                  return (
                                    <div
                                      key={r.id || rIdx}
                                      style={{
                                        background: '#F8FAFC',
                                        border: '1.5px solid #CBD5E1',
                                        borderRadius: '10px',
                                        padding: '12px 14px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ background: '#1E293B', color: '#38BDF8', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <FiBriefcase size={16} />
                                        </div>
                                        <div>
                                          <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>
                                            {r.subject || 'Administrative Duty'}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                            <span><strong>Time:</strong> {r.startTime} – {r.endTime} ({hrs} hrs/day)</span>
                                            <span>•</span>
                                            <span><strong>Days:</strong> {sDays}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const globalIdx = (currentPerson.workloadRows || []).filter(row => (row.term || '1st') === activeTerm).findIndex(row => row.id === r.id);
                                            if (globalIdx !== -1) {
                                              setSelectedBlockIdx(globalIdx);
                                              const el = document.querySelector('.gantt-schedule-container');
                                              if (el) el.scrollIntoView({ behavior: 'smooth' });
                                            }
                                          }}
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            background: '#FFFFFF',
                                            color: '#0F172A',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          Edit Slot
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const globalIdx = (currentPerson.workloadRows || []).filter(row => (row.term || '1st') === activeTerm).findIndex(row => row.id === r.id);
                                            if (globalIdx !== -1) {
                                              removeWorkloadRow(globalIdx);
                                            }
                                          }}
                                          style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid #FCA5A5',
                                            background: '#FEF2F2',
                                            color: '#EF4444',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            cursor: 'pointer'
                                          }}
                                          title="Remove Admin Task"
                                        >
                                          <FiTrash2 size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* ── ALLOWANCES & COMPENSATION INCENTIVES (SHA & ALLOWANCE MANAGEMENT) ── */}
                    {currentPerson && (
                      <div style={{
                        background: 'white',
                        borderRadius: '14px',
                        border: '1.5px solid var(--line)',
                        padding: '22px 24px',
                        marginTop: '20px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: '#EFF6FF',
                              color: '#2563EB',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <FiAward size={20} />
                            </div>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                                Allowances & Compensation Incentives
                              </h3>
                              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                                Manage allowances and hardship incentives (e.g. SHA) for {currentPerson.firstName} {currentPerson.lastName}. Disabled allowances are excluded from compliance checks, totals, and badges.
                              </p>
                            </div>
                          </div>

                          {/* Summary Status Badges */}
                          {(() => {
                            const pAllowances = (allowancesMap && allowancesMap[currentPerson.id]) || {};
                            const activeCount = ALLOWANCE_ITEMS.filter(item => isAllowanceActive(pAllowances, item.key)).length;
                            const disabledCount = ALLOWANCE_ITEMS.filter(item => isAllowanceDisabled(pAllowances, item.key)).length;
                            return (
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                  background: '#DCFCE7',
                                  color: '#15803D',
                                  border: '1px solid #86EFAC',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '700'
                                }}>
                                  {activeCount} Active
                                </span>
                                {disabledCount > 0 && (
                                  <span style={{
                                    background: '#F1F5F9',
                                    color: '#64748B',
                                    border: '1px solid #CBD5E1',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                  }}>
                                    {disabledCount} Disabled
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Allowance Items Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                          {ALLOWANCE_ITEMS.map((item) => {
                            const pAllowances = (allowancesMap && allowancesMap[currentPerson.id]) || {};
                            const isDis = isAllowanceDisabled(pAllowances, item.key);
                            const isAct = isAllowanceActive(pAllowances, item.key);
                            const isGranted = Boolean(pAllowances[item.key]);
                            const isPending = updatingAllowanceKey === item.key;
                            const isNonTeachingBlocked = item.teachingOnly && currentPerson.type === 'non-teaching';

                            return (
                              <div
                                key={item.key}
                                style={{
                                  background: isDis ? '#F8FAFC' : isAct ? '#F0FDF4' : 'white',
                                  border: `1.5px solid ${isDis ? '#E2E8F0' : isAct ? '#BBF7D0' : 'var(--line)'}`,
                                  borderRadius: '10px',
                                  padding: '14px 16px',
                                  opacity: isDis ? 0.75 : 1,
                                  transition: 'all 0.15s ease',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  gap: '12px'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <span style={{
                                      fontWeight: '700',
                                      fontSize: '13px',
                                      color: isDis ? '#64748B' : isAct ? '#166534' : 'var(--navy)',
                                      textDecoration: isDis ? 'line-through' : 'none'
                                    }}>
                                      {item.label}
                                    </span>

                                    {isDis ? (
                                      <span style={{
                                        background: '#F1F5F9',
                                        color: '#64748B',
                                        border: '1px solid #CBD5E1',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase'
                                      }}>
                                        Disabled (Excluded)
                                      </span>
                                    ) : isAct ? (
                                      <span style={{
                                        background: '#DCFCE7',
                                        color: '#15803D',
                                        border: '1px solid #86EFAC',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase'
                                      }}>
                                        Active / Granted
                                      </span>
                                    ) : (
                                      <span style={{
                                        background: '#F8FAFC',
                                        color: '#94A3B8',
                                        border: '1px solid #E2E8F0',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase'
                                      }}>
                                        Not Granted
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#64748B', lineHeight: 1.4 }}>
                                    {item.desc}
                                  </p>
                                  {isNonTeachingBlocked && (
                                    <span style={{ fontSize: '10.5px', color: '#EF4444', fontWeight: '600', marginTop: '4px', display: 'block' }}>
                                      Not eligible (Non-Teaching personnel)
                                    </span>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                                  {/* Grant / Revoke toggle */}
                                  <button
                                    type="button"
                                    disabled={isDis || isPending || isNonTeachingBlocked}
                                    onClick={() => handleToggleAllowanceGrant(item.key, !isGranted)}
                                    style={{
                                      background: isDis || isNonTeachingBlocked ? '#F1F5F9' : isGranted ? '#DCFCE7' : '#FFFFFF',
                                      color: isDis || isNonTeachingBlocked ? '#94A3B8' : isGranted ? '#15803D' : '#334155',
                                      border: `1.5px solid ${isDis || isNonTeachingBlocked ? '#E2E8F0' : isGranted ? '#86EFAC' : '#CBD5E1'}`,
                                      borderRadius: '6px',
                                      padding: '5px 10px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: (isDis || isPending || isNonTeachingBlocked) ? 'not-allowed' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      transition: 'all 0.15s ease'
                                    }}
                                    title={isDis ? 'Enable allowance first to grant or revoke' : isGranted ? 'Click to revoke grant' : 'Click to grant'}
                                  >
                                    {isGranted ? <FiCheckSquare size={13} /> : <FiSquare size={13} />}
                                    {isGranted ? 'Granted' : 'Grant'}
                                  </button>

                                  {/* Disable / Enable toggle */}
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => handleToggleAllowanceDisabled(item.key, !isDis)}
                                    style={{
                                      background: isDis ? '#F0F9FF' : '#FEF2F2',
                                      color: isDis ? '#0284C7' : '#DC2626',
                                      border: `1.5px solid ${isDis ? '#BAE6FD' : '#FECACA'}`,
                                      borderRadius: '6px',
                                      padding: '5px 10px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: isPending ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      transition: 'all 0.15s ease'
                                    }}
                                    title={isDis ? 'Re-enable allowance (restores previous granted value)' : 'Disable allowance (excludes from all computations, badges, and compliance)'}
                                  >
                                    {isDis ? <FiCheckCircle size={12} /> : <FiSlash size={12} />}
                                    {isDis ? 'Enable' : 'Disable'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>
        </article>

      {/* ── ORGANIZED CLASS COMPLETION CHECK MODAL ── */}
      {showOrganizedClassCheckModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                <FiGrid size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                  Is Organized Classes Completed?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Confirmation required before downloading Delegation Package
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: '0 0 16px' }}>
              The downloaded HTML Delegation package embeds your school's official <strong>Organized Class Sections</strong> so encoders (Person A) can select class sections directly from a dropdown list.
            </p>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--navy)' }}>Registered School Sections:</span>
              <span style={{ background: '#0284c7', color: 'white', fontWeight: '800', fontSize: '12px', padding: '4px 10px', borderRadius: '20px' }}>
                {(classSections || []).length} Section(s) Found
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowOrganizedClassCheckModal(false)}
                style={{ padding: '10px 16px', borderRadius: '8px' }}
              >
                Not Yet — Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setShowOrganizedClassCheckModal(false);
                  const allIds = (personnel || []).map(p => String(p.id));
                  console.log('[OrganizedCheck → Delegation] setting teacher IDs:', allIds);
                  setSelectedTeacherIdsForDelegation(allIds);
                  setShowDelegationModal(true);
                }}
                style={{ padding: '10px 20px', fontWeight: 'bold', borderRadius: '8px', background: '#0284c7' }}
              >
                Yes, Complete → Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WORKLOAD DELEGATION PACKAGE (HTML EXPORT) MODAL ── */}
      {showDelegationModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
              Export Workload Delegation Package (HTML)
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
              Select the teachers you want Person A (or Department Head) to encode. This exports a standalone HTML file that works offline on any computer.
            </p>

            {/* Search & Grade Level Filter controls */}
            {(() => {
              const visibleTeachers = (personnel || []).filter(p => {
                if (!p || typeof p !== 'object') return false;
                const fullName = `${String(p.firstName || '')} ${String(p.lastName || '')} ${String(p.position || '')}`.toLowerCase();
                const q = String(delegationSearch || '').toLowerCase().trim();
                const matchesSearch = !q || fullName.includes(q);
                if (!matchesSearch) return false;
                if (delegationGradeFilter === 'all') return true;

                const assigned = getAssignedGradeLevels(p);
                const rowGrades = (p.workloadRows || []).map(r => r?.gradeLevel).filter(Boolean);
                const allGrades = Array.from(new Set([...assigned, ...rowGrades]));
                return allGrades.includes(delegationGradeFilter);
              });

              const selIdsStr = selectedTeacherIdsForDelegation.map(String);
              const allVisibleSelected = visibleTeachers.length > 0 && visibleTeachers.every(p => selIdsStr.includes(String(p.id)));

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Search teacher..."
                      value={delegationSearch}
                      onChange={(e) => setDelegationSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px' }}
                    />
                    <select
                      value={delegationGradeFilter}
                      onChange={(e) => setDelegationGradeFilter(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white', fontWeight: 'bold', color: 'var(--navy)' }}
                    >
                      <option value="all">All Grades</option>
                      {['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        const visibleIdsStr = visibleTeachers.map(p => String(p.id));
                        if (allVisibleSelected) {
                          setSelectedTeacherIdsForDelegation(prev => prev.filter(id => !visibleIdsStr.includes(String(id))));
                        } else {
                          setSelectedTeacherIdsForDelegation(prev => Array.from(new Set([...prev.map(String), ...visibleIdsStr])));
                        }
                      }}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                    >
                      {allVisibleSelected ? 'Deselect Visible' : 'Select Visible'}
                    </button>
                  </div>

                  {/* Teachers Checklist */}
                  <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '10px', padding: '8px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {visibleTeachers.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        No teachers found for the selected grade filter.
                      </div>
                    ) : (
                      visibleTeachers.map(p => {
                        const pIdStr = String(p.id);
                        const isChecked = selIdsStr.includes(pIdStr);
                        const assignedGrades = getAssignedGradeLevels(p);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px',
                              background: isChecked ? '#eff6ff' : 'transparent', cursor: 'pointer', fontSize: '12px',
                              border: isChecked ? '1px solid #bfdbfe' : '1px solid transparent'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedTeacherIdsForDelegation(prev => prev.filter(id => String(id) !== pIdStr));
                                  } else {
                                    setSelectedTeacherIdsForDelegation(prev => [...prev, pIdStr]);
                                  }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <div>
                                <div style={{ fontWeight: isChecked ? '700' : '600', color: isChecked ? '#1e40af' : '#334155' }}>
                                  {p.lastName}, {p.firstName}
                                </div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>{p.position || 'Teacher'}</div>
                              </div>
                            </div>
                            {assignedGrades.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {assignedGrades.slice(0, 3).map(g => (
                                  <span key={g} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: 'bold' }}>
                                    {g}
                                  </span>
                                ))}
                                {assignedGrades.length > 3 && (
                                  <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: 'bold' }}>
                                    +{assignedGrades.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)' }}>
                Selected: {selectedTeacherIdsForDelegation.length} teachers
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowDelegationModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={selectedTeacherIdsForDelegation.length === 0}
                  onClick={handleGenerateDelegationPackageHTML}
                  style={{ padding: '8px 20px', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  Generate HTML Package →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BATCH IMPORT PREVIEW & MERGE MODAL ── */}
      {showImportBatchModal && importedBatchData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px', width: '560px', maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
              Batch Workload Import Preview
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              From: <strong>{importedBatchData.schoolName}</strong> ({importedBatchData.schoolYear})
            </p>

            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid var(--line)', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--navy)', marginBottom: '8px' }}>
                Workload Payload Summary:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#334155', maxHeight: '200px', overflowY: 'auto' }}>
                {Object.entries(importedBatchData.teachersWorkload || {}).map(([pId, rows]) => {
                  const p = personnel.find(x => x.id === pId);
                  return (
                    <li key={pId} style={{ marginBottom: '4px' }}>
                      <strong>{p ? `${p.lastName}, ${p.firstName}` : pId}</strong>: {rows.length} workload rows
                    </li>
                  );
                })}
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShowImportBatchModal(false);
                  setImportedBatchData(null);
                }}
                style={{ padding: '10px 18px', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleApproveAndMergeBatchImport}
                style={{ padding: '10px 24px', fontWeight: 'bold', borderRadius: '8px' }}
              >
                Approve & Merge Workloads
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ── MULTI-DATE CALENDAR SELECTOR MODAL ── */}
      {calendarModalConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '16px', padding: '24px',
            width: '500px', maxWidth: '92vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1.5px solid var(--line)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--navy)' }}>
                  <FiCalendar size={13} style={{ marginRight: '6px' }} /> Select Dates on Calendar
                </h3>
                <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: '700' }}>
                  {calendarModalConfig.taskName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCalendarModalConfig(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontWeight: 'bold' }}
              ><FiX size={14} /></button>
            </div>

            {/* Month Header Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary"
                style={{ minHeight: 'auto', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear(prev => prev - 1);
                  } else {
                    setCalendarMonth(prev => prev - 1);
                  }
                }}
              >
                ◀ Prev
              </button>
              <span style={{ fontWeight: '800', fontSize: '15px', color: 'var(--navy)' }}>
                {new Date(calendarYear, calendarMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                className="btn secondary"
                style={{ minHeight: 'auto', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear(prev => prev + 1);
                  } else {
                    setCalendarMonth(prev => prev + 1);
                  }
                }}
              >
                Next ▶
              </button>
            </div>

            {/* Quick Select Bar & Time Configuration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px', background: '#EFF6FF', padding: '12px', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#1E40AF', display: 'block', marginBottom: '2px' }}>Start Time</label>
                <input
                  type="time"
                  list="school-times"
                  value={calendarStartTime}
                  onChange={(e) => setCalendarStartTime(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#1E40AF', display: 'block', marginBottom: '2px' }}>End Time</label>
                <input
                  type="time"
                  list="school-times"
                  value={calendarEndTime}
                  onChange={(e) => setCalendarEndTime(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: '11px', padding: '4px 10px', minHeight: 'auto', flex: 1 }}
                onClick={handleSelectAllWeekdaysInMonth}
              >
                Select All Weekdays (M-F)
              </button>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: '11px', padding: '4px 10px', minHeight: 'auto', color: '#EF4444', borderColor: '#FCA5A5' }}
                onClick={() => setCalendarSelectedDates([])}
              >
                Clear All
              </button>
            </div>

            {/* Quick Specific Day Selection Toolbar */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px', background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--navy)', marginRight: '2px' }}>Toggle Day:</span>
              {[
                { label: 'All M', dayIndex: 1 },
                { label: 'All T', dayIndex: 2 },
                { label: 'All W', dayIndex: 3 },
                { label: 'All TH', dayIndex: 4 },
                { label: 'All F', dayIndex: 5 },
                { label: 'All SAT', dayIndex: 6 },
                { label: 'All SUN', dayIndex: 0 },
              ].map(({ label, dayIndex }) => {
                const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const monthDayStrings = [];
                for (let day = 1; day <= totalDays; day++) {
                  const d = new Date(calendarYear, calendarMonth, day);
                  if (d.getDay() === dayIndex) {
                    const mm = String(calendarMonth + 1).padStart(2, '0');
                    const dd = String(day).padStart(2, '0');
                    monthDayStrings.push(`${calendarYear}-${mm}-${dd}`);
                  }
                }
                const isFullySelected = monthDayStrings.length > 0 && monthDayStrings.every(dStr => calendarSelectedDates.includes(dStr));

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleToggleSpecificDayOfWeek(dayIndex)}
                    style={{
                      padding: '3px 7px',
                      fontSize: '10.5px',
                      fontWeight: '700',
                      borderRadius: '6px',
                      border: isFullySelected ? 'none' : '1px solid #CBD5E1',
                      background: isFullySelected ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : '#FFFFFF',
                      color: isFullySelected ? '#FFFFFF' : '#334155',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Click to select or unselect all ${label.replace('All ', '')}s in this month`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Calendar Days Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '16px' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dName, dIdx) => (
                <div
                  key={dName}
                  onClick={() => handleToggleSpecificDayOfWeek(dIdx)}
                  style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', padding: '4px 0', cursor: 'pointer', borderRadius: '4px', userSelect: 'none' }}
                  title={`Click to toggle all ${dName}s in this month`}
                >
                  {dName}
                </div>
              ))}
              {(() => {
                const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
                const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const gridCells = [];

                for (let i = 0; i < firstDayIndex; i++) {
                  gridCells.push(<div key={`blank-${i}`} style={{ height: '36px' }} />);
                }

                for (let day = 1; day <= totalDays; day++) {
                  const mm = String(calendarMonth + 1).padStart(2, '0');
                  const dd = String(day).padStart(2, '0');
                  const dStr = `${calendarYear}-${mm}-${dd}`;
                  const isSelected = calendarSelectedDates.includes(dStr);
                  const dObj = new Date(calendarYear, calendarMonth, day);
                  const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;

                  gridCells.push(
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleCalendarDate(dStr)}
                      style={{
                        height: '36px',
                        borderRadius: '8px',
                        border: isSelected ? 'none' : '1px solid var(--line)',
                        background: isSelected ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : isWeekend ? '#F8FAFC' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : isWeekend ? '#94A3B8' : '#1E293B',
                        fontWeight: isSelected ? '800' : '600',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 4px rgba(2, 132, 199, 0.3)' : 'none'
                      }}
                    >
                      {day}
                    </button>
                  );
                }
                return gridCells;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Unlock / Initialize Term Modal ── */}
      {showUnlockTermModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: '#FEF3C7', padding: '10px', borderRadius: '12px' }}>
                <FiLock size={22} color="#D97706" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>
                  Unlock {showUnlockTermModal} Term
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                  {showUnlockTermModal} Term is currently locked for encoding.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', lineHeight: '1.6', marginBottom: '20px' }}>
              Unlocking will open <strong>{showUnlockTermModal} Term</strong> for timetable scheduling. You can choose to copy existing class schedules from <strong>1st Term</strong> as a baseline or start with a blank timetable.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => {
                  unlockTerm(showUnlockTermModal);
                  copyTermData('1st', showUnlockTermModal);
                  setActiveTerm(showUnlockTermModal);
                  setShowUnlockTermModal(null);
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                  color: '#FFFFFF',
                  fontWeight: '800',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiCopy size={15} /> Unlock & Duplicate from 1st Term</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  unlockTerm(showUnlockTermModal);
                  setActiveTerm(showUnlockTermModal);
                  setShowUnlockTermModal(null);
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Unlock with Blank Timetable
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowUnlockTermModal(null)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#64748B',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── WORK IMMERSION MONTHLY CALENDAR & MINUTES MANAGER ── */
const WorkImmersionSection = ({ currentPerson, schoolInfo, showToast, workImmersionSchedulesMap, fetchWorkImmersionSchedules, saveWorkImmersionSchedules }) => {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(9); // 0-indexed (9 = October)
  const [editingDate, setEditingDate] = useState(null); // 'YYYY-MM-DD'
  const [editingStartTime, setEditingStartTime] = useState('08:00');
  const [editingEndTime, setEditingEndTime] = useState('12:00');
  const [copiedPattern, setCopiedPattern] = useState(null); // { dayOfWeek: { startTime, endTime } }

  const schoolYear = schoolInfo?.schoolYear || '2026-2027';
  const personId = currentPerson?.id;

  // Load immersion schedules on mount or teacher change
  useEffect(() => {
    if (personId && fetchWorkImmersionSchedules) {
      fetchWorkImmersionSchedules(personId, schoolYear);
    }
  }, [personId, schoolYear]);

  const personImmersionList = workImmersionSchedulesMap[personId] || [];

  // Month Names
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Days in selected month
  const totalDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 = Sun

  // Maps date string 'YYYY-MM-DD' to entry
  const dateMap = {};
  personImmersionList.forEach(item => {
    dateMap[item.date] = item;
  });

  const getFormattedDateStr = (day) => {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${selectedYear}-${mm}-${dd}`;
  };

  const handleOpenDateEditor = (day) => {
    const dStr = getFormattedDateStr(day);
    const existing = dateMap[dStr];
    setEditingDate(dStr);
    setEditingStartTime(existing ? existing.startTime : '08:00');
    setEditingEndTime(existing ? existing.endTime : '12:00');
  };

  const handleSaveSingleDate = async () => {
    if (!editingDate || !personId) return;
    const existingList = personImmersionList.filter(item => item.date !== editingDate);
    const newEntry = { date: editingDate, startTime: editingStartTime, endTime: editingEndTime };
    const updatedSchedules = [...existingList, newEntry];

    const res = await saveWorkImmersionSchedules(personId, updatedSchedules, schoolYear, schoolInfo?.schoolId);
    if (res && res.success !== false) {
      if (showToast) showToast(`Saved Work Immersion schedule for ${editingDate} (${editingStartTime} - ${editingEndTime})`);
      setEditingDate(null);
    }
  };

  const handleRemoveSingleDate = async (dStr) => {
    if (!personId) return;
    const updatedSchedules = personImmersionList.filter(item => item.date !== dStr);
    const res = await saveWorkImmersionSchedules(personId, updatedSchedules, schoolYear, schoolInfo?.schoolId);
    if (res && res.success !== false) {
      if (showToast) showToast(`Removed Work Immersion schedule for ${dStr}`);
      if (editingDate === dStr) setEditingDate(null);
    }
  };

  // Copy Month Schedule Pattern (by weekday M-F)
  const handleCopyMonthPattern = () => {
    const pattern = {};
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dStr = getFormattedDateStr(day);
      const entry = dateMap[dStr];
      if (entry) {
        const dObj = new Date(selectedYear, selectedMonth, day);
        const dayOfWeek = dObj.getDay(); // 0-6
        pattern[dayOfWeek] = { startTime: entry.startTime, endTime: entry.endTime };
      }
    }

    if (Object.keys(pattern).length === 0) {
      if (showToast) showToast("No active Work Immersion schedules found in this month to copy.", "error");
      return;
    }

    setCopiedPattern({
      sourceMonthName: `${monthNames[selectedMonth]} ${selectedYear}`,
      pattern
    });

    if (showToast) showToast(`Copied ${Object.keys(pattern).length} weekday immersion pattern(s) from ${monthNames[selectedMonth]} ${selectedYear}!`);
  };

  // Paste Month Schedule Pattern onto Target Month
  const handlePasteMonthPattern = async () => {
    if (!copiedPattern || !copiedPattern.pattern) {
      if (showToast) showToast("Please copy a month schedule first before pasting.", "error");
      return;
    }

    const { pattern } = copiedPattern;
    const newSchedules = [...personImmersionList];

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dObj = new Date(selectedYear, selectedMonth, day);
      const dayOfWeek = dObj.getDay();
      if (pattern[dayOfWeek]) {
        const targetDStr = getFormattedDateStr(day);
        const matchTime = pattern[dayOfWeek];
        // Remove old entry if exists for target date
        const existingIdx = newSchedules.findIndex(x => x.date === targetDStr);
        if (existingIdx >= 0) {
          newSchedules[existingIdx] = { date: targetDStr, startTime: matchTime.startTime, endTime: matchTime.endTime };
        } else {
          newSchedules.push({ date: targetDStr, startTime: matchTime.startTime, endTime: matchTime.endTime });
        }
      }
    }

    const res = await saveWorkImmersionSchedules(personId, newSchedules, schoolYear, schoolInfo?.schoolId);
    if (res && res.success !== false) {
      if (showToast) showToast(`Pasted immersion schedule pattern to ${monthNames[selectedMonth]} ${selectedYear}!`);
    }
  };

  // Calculate total immersion hours for selected month
  const currentMonthEntries = personImmersionList.filter(item => {
    if (!item.date) return false;
    const [y, m] = item.date.split('-').map(Number);
    return y === selectedYear && m === (selectedMonth + 1);
  });

  const totalMonthMins = currentMonthEntries.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
  const totalMonthHours = (totalMonthMins / 60).toFixed(1);

  return (
    <div className="workload-section-panel" style={{ marginTop: '24px', background: 'linear-gradient(130deg, #FFFFFF 0%, #F0F9FF 100%)', border: '2px solid #0284C7' }}>
      <div className="workload-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ color: '#0369A1', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FiClock size={18} color="#0284C7" /> Work Immersion Monthly Calendar & Overload Integration
          </h3>
          <p className="subtext" style={{ margin: '4px 0 0', color: '#0369A1' }}>
            Track daily Work Immersion supervision start/end times. Immersion hours are added 1-to-1 to regular teaching load for <strong>Overload Pay Authorization</strong>.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: '12px', padding: '6px 12px', background: 'white', borderColor: '#0284C7', color: '#0284C7', fontWeight: 'bold' }}
            onClick={handleCopyMonthPattern}
          >
            Copy {monthNames[selectedMonth]} Schedule
          </button>
          <button
            type="button"
            className="btn"
            style={{ fontSize: '12px', padding: '6px 12px', background: copiedPattern ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : '#CBD5E1', color: 'white', fontWeight: 'bold', cursor: copiedPattern ? 'pointer' : 'not-allowed' }}
            onClick={handlePasteMonthPattern}
            disabled={!copiedPattern}
            title={copiedPattern ? `Paste pattern from ${copiedPattern.sourceMonthName} to ${monthNames[selectedMonth]} ${selectedYear}` : "Copy a month schedule first"}
          >
            Paste to {monthNames[selectedMonth]}
          </button>
        </div>
      </div>

      {/* Copied Banner indicator */}
      {copiedPattern && (
        <div style={{ background: '#E0F2FE', border: '1px solid #7DD3FC', color: '#0369A1', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Copied schedule pattern from <strong>{copiedPattern.sourceMonthName}</strong>. Select another month and click "Paste to [Month]" to duplicate.</span>
          <button type="button" onClick={() => setCopiedPattern(null)} style={{ background: 'none', border: 'none', color: '#0369A1', cursor: 'pointer', fontWeight: 'bold' }}><FiX size={14} /></button>
        </div>
      )}

      {/* Month Selector Bar & Month Summary KPI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', marginBottom: '16px', background: 'white', padding: '12px 16px', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369A1' }}>Select Month & Year:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #0284C7', fontSize: '13px', fontWeight: 'bold', color: '#0369A1', background: 'white' }}
          >
            {monthNames.map((name, idx) => (
              <option key={idx} value={idx}>{name}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #0284C7', fontSize: '13px', fontWeight: 'bold', color: '#0369A1', background: 'white' }}
          >
            {[2025, 2026, 2027].map(yr => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Monthly Immersion Total</span>
            <strong style={{ fontSize: '16px', color: '#0284C7' }}>{totalMonthHours} Hours</strong>
          </div>
          <div style={{ background: '#F0F9FF', padding: '6px 10px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '11px', color: '#0369A1', fontWeight: 'bold' }}>
            <FiTrendingUp size={13} style={{ marginRight: '4px' }} /> Integrated into Overload Pay
          </div>
        </div>
      </div>

      {/* Calendar Grid View */}
      <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #CBD5E1' }}>
        {/* Days of week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', color: '#475569', paddingBottom: '8px', borderBottom: '1px solid #E2E8F0', marginBottom: '8px' }}>
          <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
        </div>

        {/* Month Days Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {/* Empty leading cells */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} style={{ height: '75px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #F1F5F9' }}></div>
          ))}

          {/* Actual Month Days */}
          {Array.from({ length: totalDaysInMonth }).map((_, i) => {
            const day = i + 1;
            const dStr = getFormattedDateStr(day);
            const entry = dateMap[dStr];
            const isEditing = editingDate === dStr;
            const dObj = new Date(selectedYear, selectedMonth, day);
            const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;

            return (
              <div
                key={day}
                onClick={() => handleOpenDateEditor(day)}
                style={{
                  height: '75px',
                  padding: '6px',
                  borderRadius: '8px',
                  border: isEditing ? '2px solid #0284C7' : entry ? '1.5px solid #7DD3FC' : '1px solid #E2E8F0',
                  background: isEditing ? '#EFF6FF' : entry ? '#F0F9FF' : isWeekend ? '#F8FAFC' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: entry ? '#0369A1' : '#475569' }}>{day}</span>
                  {entry && (
                    <span style={{ fontSize: '9px', background: '#0284C7', color: 'white', padding: '1px 5px', borderRadius: '10px', fontWeight: 'bold' }}>
                      {(entry.durationMinutes / 60).toFixed(1)}h
                    </span>
                  )}
                </div>

                {entry ? (
                  <div style={{ fontSize: '10px', color: '#0369A1', fontWeight: 'bold', background: 'white', padding: '2px 4px', borderRadius: '4px', border: '1px solid #BAE6FD', textAlign: 'center' }}>
                    <FiClock size={11} style={{ marginRight: '4px' }} /> {entry.startTime} - {entry.endTime}
                  </div>
                ) : (
                  <span style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>+ Set time</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Editor Drawer / Modal */}
      {editingDate && (
        <div style={{ marginTop: '16px', background: '#F0F9FF', padding: '16px', borderRadius: '12px', border: '1.5px solid #0284C7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '14px', color: '#0369A1', display: 'block' }}>
              Editing Work Immersion Time for {editingDate}
            </strong>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Set exact Start Time and End Time for immersion supervision on this date.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369A1', display: 'block' }}>START TIME</label>
              <input
                type="time"
                value={editingStartTime}
                onChange={(e) => setEditingStartTime(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #0284C7', fontSize: '13px', fontWeight: 'bold', background: 'white' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369A1', display: 'block' }}>END TIME</label>
              <input
                type="time"
                value={editingEndTime}
                onChange={(e) => setEditingEndTime(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #0284C7', fontSize: '13px', fontWeight: 'bold', background: 'white' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
              <button
                type="button"
                className="btn ok"
                onClick={handleSaveSingleDate}
                style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', color: 'white', fontWeight: 'bold', fontSize: '12px', padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
              >
                Save Date Slot
              </button>
              {dateMap[editingDate] && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => handleRemoveSingleDate(editingDate)}
                  style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px' }}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditingDate(null)}
                style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function Workload(props) {
  return (
    <WorkloadErrorBoundary>
      <WorkloadInner {...props} />
    </WorkloadErrorBoundary>
  );
}
