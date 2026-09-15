import React, { useState, useEffect } from 'react';
import SearchableDropdown from '../components/SearchableDropdown';
import DepEdEmailInfoModal from '../components/DepEdEmailInfoModal';
import PortalHeader from '../components/PortalHeader';
import { api } from '../services/api';
import { 
  FiCreditCard, 
  FiUser, 
  FiBriefcase, 
  FiAward, 
  FiFileText, 
  FiLayers, 
  FiBook, 
  FiTrash2, 
  FiLink, 
  FiCheck, 
  FiInfo, 
  FiAlertCircle, 
  FiSearch, 
  FiZap, 
  FiChevronLeft, 
  FiChevronRight,
  FiCalendar,
  FiSave,
  FiCheckCircle,
  FiCopy,
  FiLock,
  FiX,
  FiMapPin
} from 'react-icons/fi';

import {
  useApp,
  POSITION_OPTIONS_BY_CATEGORY,
  detectPersonnelTypeFromPosition,
  isCanonicalPosition,
  getCategoryForCanonicalPosition,
  RELIGION_OPTIONS,
  ETHNIC_GROUP_OPTIONS,
  MAJOR_OPTIONS,
  MINOR_OPTIONS,
  DISCIPLINE_OPTIONS,
  PRC_SPECIALIZATION_OPTIONS,
  DIVISION_SCHOOL_OPTIONS,
  NATURE_OF_APPOINTMENT_OPTIONS,
  HIRING_ARRANGEMENT_OPTIONS,
  HIGHEST_EDUCATIONAL_ATTAINMENT_OPTIONS,
  HIGHEST_EDUCATIONAL_ATTAINMENT_TEACHING_OPTIONS,
  HIGHEST_EDUCATIONAL_ATTAINMENT_NON_TEACHING_OPTIONS,
  SHS_TRACK_OPTIONS,
  TESDA_NC_LEVEL_OPTIONS,
  TESDA_COURSE_TO_LEVELS_MAP,
  TESDA_COURSES,
  POST_GRADUATE_DEGREE_OPTIONS,
  COLLEGE_DEGREE_OPTIONS,
  TESDA_CERTIFICATION_OPTIONS,
  NEAP_TRAINING_OPTIONS,
  validateDepEdEmail
} from '../context/AppContext';

export const getAge = (dobString) => {
  if (!dobString) return null;
  const cleanDob = typeof dobString === 'string' ? dobString.substring(0, 10) : '';
  if (!cleanDob) return null;
  const birth = new Date(cleanDob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// Degree records used to live as a single collegeDegree/major/minor + a separate
// postGraduateDegree/postGraduateDiscipline block tied to one "highest attainment" value.
// They now live as a proper array (p.degreeRows), each entry tagged with its own level
// (BACCALAUREATE/MASTERS/DOCTORATE) and, for MASTERS/DOCTORATE, its own discipline field.
// Old records may only have the legacy flat fields — synthesize an equivalent array from
// them on the fly so nothing is lost, without requiring a destructive migration.
export const getEffectiveDegreeRows = (p) => {
  if (!p) return [];
  if (Array.isArray(p.degreeRows) && p.degreeRows.length > 0) return p.degreeRows;

  const rows = [];
  if (p.collegeDegree) {
    rows.push({ clientKey: 'legacy-baccalaureate', level: 'BACCALAUREATE', collegeDegree: p.collegeDegree, major: p.major || '', minor: p.minor || '' });
  }
  const legacyPostGradLevel = String(p.postGraduateDegree || '').toUpperCase().includes('DOCTOR') ? 'DOCTORATE' : 'MASTERS';
  if (p.postGraduateDegree && !['NONE', 'N/A', ''].includes(String(p.postGraduateDegree).toUpperCase())) {
    rows.push({ clientKey: 'legacy-postgrad', level: legacyPostGradLevel, collegeDegree: p.postGraduateDegree, postGraduateDiscipline: p.postGraduateDiscipline || '' });
  }
  return rows;
};

export const getPersonnelValidationChecklist = (p) => {
  if (!p) return { total: 0, completed: 0, percentage: 0, errors: [] };
  const errors = [];
  const required = [];

  const check = (id, label, isPassed, category, tab) => {
    required.push(id);
    if (!isPassed) {
      errors.push({ id, label, category, tab });
    }
  };

  // 1. Names
  check('firstName', "First Name", !!p.firstName?.trim(), "Identity", "identity");
  check('middleName', "Middle Name", !!p.middleName?.trim(), "Identity", "identity");
  check('lastName', "Last Name", !!p.lastName?.trim(), "Identity", "identity");

  // 2. Demographics & IDs
  check('sexAtBirth', "Sex at Birth", !!(p.sexAtBirth || p.sex), "Personal", "personal");
  check('civilStatus', "Civil Status", !!p.civilStatus, "Personal", "personal");
  check('religion', "Religion", !!p.religion, "Personal", "personal");
  check('ethnicGroup', "Ethnic Group", !!p.ethnicGroup, "Personal", "personal");

  const hasBirthdate = !!(p.birthdate || p.birthDate);
  const bdateStr = p.birthdate || p.birthDate;
  const ageVal = hasBirthdate ? getAge(bdateStr) : null;
  const validAge = hasBirthdate && ageVal !== null && ageVal >= 15;
  check('birthdate', "Valid Birthdate (Must be at least 15 yrs old)", validAge, "Personal", "personal");

  const cleanPhilsys = String(p.philsysNo || p.philsys_no || '').replace(/\D/g, '');
  const hasValidPhilsys = !!(p.noPhilsys || p.no_philsys || cleanPhilsys.length === 16);
  check('philsysNo', "PhilSys No. / National ID (16 digits or N/A)", hasValidPhilsys, "Personal", "personal");
  check('depedEmail', "DepEd Official Email", !!(p.depedEmail?.trim() || p.email?.trim()), "Employment", "employment");
  check('tin', "TIN Number", !!(p.noTin || p.tin?.trim()), "Personal", "personal");

  // 3. Employment
  check('position', "Plantilla Position", !!(p.position?.trim() || p.plantilla_position?.trim() || p.position_title?.trim()), "Employment", "employment");
  check('fundSource', "Fund Source", !!p.fundSource, "Employment", "employment");
  check('natureOfAppointment', "Nature of Appointment", !!p.natureOfAppointment, "Employment", "employment");
  check('hiringArrangement', "Hiring Arrangement", !!p.hiringArrangement, "Employment", "employment");
  check('deploymentStatus', "Status of Deployment", !!p.deploymentStatus, "Employment", "employment");

  if (['Clustered', 'Reassigned', 'Borrowed', 'CLUSTERED', 'REASSIGNED', 'BORROWED'].includes(p.deploymentStatus)) {
    const hasOtherSchool = !!(p.clusteredSchools || (Array.isArray(p.assignedSchools) && p.assignedSchools.length > 0));
    check('assignedSchools', "Other School Assignment", hasOtherSchool, "Employment", "employment");
  }

  check('firstServiceDate', "Date of First Day of Service", !!p.firstServiceDate, "Employment", "employment");
  check('lastPromotionDate', "Date of Last Promotion", !!p.lastPromotionDate, "Employment", "employment");
  check('lastLateralMovementDate', "Date of Last Lateral Movement", !!p.lastLateralMovementDate, "Employment", "employment");
  check('newStationDate', "Date of First Day in Current Station", !!p.newStationDate, "Employment", "employment");

  // 4. Education / Qualifications
  const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
  const isNonTeaching = ['non-teaching', 'NON-TEACHING'].includes(pType) || ['non-teaching', 'NON-TEACHING'].includes(p.type) || ['NON-TEACHING'].includes(p.positionCategory);

  const attainment = p.highestEducationalAttainment || '';

  if (!isNonTeaching) {
    check('highestEducationalAttainment', "Highest Educational Attainment", !!attainment, "Education", "education");
  }

  const isSHS = attainment === 'SENIOR HIGH SCHOOL GRADUATE';
  const isVocational = attainment === 'VOCATIONAL / TECH-VOC COURSE';
  const isCollege = ['COLLEGE GRADUATE / BACCALAUREATE', 'COLLEGE UNDERGRADUATE'].includes(attainment);
  const isPostGrad = ["MASTER'S DEGREE (GRADUATED)", "DOCTORATE DEGREE (GRADUATED)"].includes(attainment);

  if (isSHS) {
    check('shsTrack', "Senior High School Track", !!p.shsTrack, "Education", "education");
  }
  if (isVocational) {
    check('vocationalCourse', "Vocational / TESDA Course", !!p.vocationalCourse?.trim(), "Education", "education");
    check('vocationalLevel', "NC Level / Qualification Level", !!p.vocationalLevel?.trim(), "Education", "education");
  }
  if (isCollege || isPostGrad || (!isNonTeaching && !isSHS && !isVocational)) {
    check('collegeDegree', "College Degree / Baccalaureate", !!(p.collegeDegree?.trim() && p.collegeDegree !== 'NONE' && p.collegeDegree !== 'N/A'), "Education", "education");
    const d = String(p.collegeDegree || '').toUpperCase();
    const isEdu = p.collegeDegree && p.collegeDegree !== 'NONE' && p.collegeDegree !== 'N/A' && (
      d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
    );
    if (isEdu) {
      check('major', "Major in Education", !!p.major?.trim(), "Education", "education");
    }
  }
  if (attainment === "MASTER'S DEGREE (GRADUATED)") {
    const rawDisc = p.mastersDiscipline || p.postGraduateDiscipline || '';
    const listDisc = Array.isArray(p.mastersDisciplines) && p.mastersDisciplines.length > 0
      ? p.mastersDisciplines
      : (rawDisc ? rawDisc.split(',').map(s => s.trim()).filter(Boolean) : []);
    check('postGraduateDiscipline', "Master's Discipline", listDisc.length > 0, "Education", "education");
  } else if (attainment === "DOCTORATE DEGREE (GRADUATED)") {
    const rawDocDisc = p.doctorateDiscipline || p.postGraduateDiscipline || '';
    const listDocDisc = Array.isArray(p.doctorateDisciplines) && p.doctorateDisciplines.length > 0
      ? p.doctorateDisciplines
      : (rawDocDisc ? rawDocDisc.split(',').map(s => s.trim()).filter(Boolean) : []);
    check('doctorateDiscipline', "Doctorate Discipline", listDocDisc.length > 0, "Education", "education");
  }

  check('eligibility', "Civil Service / PRC Eligibility", !!(p.eligibility && (!Array.isArray(p.eligibility) || p.eligibility.length > 0)), "Education", "education");
  const eligStr = (Array.isArray(p.eligibility) ? p.eligibility.join(',') : String(p.eligibility || '')).toUpperCase();
  if (eligStr.includes('LET') || eligStr.includes('PBET') || eligStr.includes('LICENSURE EXAMINATION FOR TEACHERS') || eligStr.includes('PROFESSIONAL BOARD EXAMINATION FOR TEACHERS')) {
    check('prcSpecialization', "PRC Specialization", !!p.prcSpecialization?.trim(), "Education", "education");
  }

  // 5. Professional Development / Trainings (for teaching & teaching-related)
  if (!isNonTeaching) {
    const totalTrainingsCount = (p.neapTrainingRows || []).length + (p.certificationRows || []).length + (p.otherTrainingRows || []).length;
    check('hasTrainings', "At least one Professional Development / Training record", totalTrainingsCount > 0, "L&D", "development");

    const allTrainings = [...(p.neapTrainingRows || []), ...(p.certificationRows || []), ...(p.otherTrainingRows || [])];
    if (allTrainings.length > 0) {
      const validHours = allTrainings.every(tr => tr.totalHours && Number(tr.totalHours) > 0);
      if (!validHours) {
        check('trainingHours', "Total Hours for all L&D / Training records", false, "L&D", "development");
      }
    }
  }

  const total = required.length;
  const completed = total - errors.length;
  const percentage = total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;

  return { total, completed, percentage, errors };
};

export function calculatePersonCompletionPercentage(p, activePerson) {
  if (!p) return 0;
  let data = p;
  if (activePerson && (String(activePerson.id) === String(p.id))) {
    data = activePerson;
  } else if (p.id) {
    const savedDraft = localStorage.getItem(`draft_personnel_${p.id}`);
    if (savedDraft) {
      try {
        data = { ...p, ...JSON.parse(savedDraft) };
      } catch (e) {}
    }
  }

  const result = getPersonnelValidationChecklist(data);
  return result.percentage;
}



const CURRICULUM_ERAS = [
  { key: '1973-2002', label: '1973–2002 (NSEC / NEP)', startYear: 1973, endYear: 2002 },
  { key: '2002-2011', label: '2002–2011 (2002 Basic Education Curriculum)', startYear: 2002, endYear: 2011 },
  { key: '2011-2023', label: '2011–2023 (K to 12 Basic Education Program)', startYear: 2011, endYear: 2023 },
  { key: '2023-Present', label: '2023–Present (MATATAG Curriculum)', startYear: 2023, endYear: 2099 }
];

const PRIMARY_SUBJECTS = [
  'Kinder',
  'Filipino',
  'English',
  'Mathematics',
  'Science',
  'Araling Panlipunan (AP)',
  'Edukasyon sa Pagpapakatao (EsP)',
  'Technology and Livelihood Education (TLE)',
  'MAPEH'
];

const computeStepIncrement = (firstServiceDate, lastPromotionDate) => {
  const effectiveDateStr = (lastPromotionDate && lastPromotionDate !== 'N/A' && String(lastPromotionDate).trim() !== '')
    ? lastPromotionDate
    : firstServiceDate;

  if (!effectiveDateStr || effectiveDateStr === 'N/A') {
    return { step: 1, years: 0, basedOn: 'Initial Appointment' };
  }

  const cleanDate = typeof effectiveDateStr === 'string' ? effectiveDateStr.substring(0, 10) : '';
  const baseDate = new Date(cleanDate + 'T00:00:00');
  if (isNaN(baseDate.getTime())) {
    return { step: 1, years: 0, basedOn: 'Initial Appointment' };
  }

  const now = new Date();
  let years = now.getFullYear() - baseDate.getFullYear();
  const mDiff = now.getMonth() - baseDate.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < baseDate.getDate())) {
    years--;
  }
  years = Math.max(0, years);

  // DepEd 3-Year Rule: 1 + Math.floor(years / 3), capped at 8
  const computedStep = Math.min(8, Math.max(1, 1 + Math.floor(years / 3)));
  const basedOn = (lastPromotionDate && lastPromotionDate !== 'N/A' && String(lastPromotionDate).trim() !== '')
    ? 'Last Promotion Date'
    : 'First Day of Service';

  return { step: computedStep, years, basedOn };
};

function DatePickerDropdowns({ value, onChange, disabled = false, maxDate, minDate, required = false }) {
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef(null);

  const parsedMaxDate = maxDate ? (maxDate instanceof Date ? maxDate : new Date(maxDate)) : null;
  const parsedMinDate = minDate ? (minDate instanceof Date ? minDate : new Date(minDate)) : null;

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const cleanValue = value ? (typeof value === 'string' ? value.substring(0, 10) : formatDate(value)) : '';

  React.useEffect(() => {
    if (cleanValue) {
      const d = new Date(cleanValue + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    } else if (parsedMaxDate && new Date() > parsedMaxDate) {
      setViewDate(parsedMaxDate);
    } else if (parsedMinDate && new Date() < parsedMinDate) {
      setViewDate(parsedMinDate);
    }
  }, [cleanValue, maxDate, minDate]);

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

  // Calendar logic
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-based

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentMaxYear = parsedMaxDate ? parsedMaxDate.getFullYear() : new Date().getFullYear();
  const currentMinYear = parsedMinDate ? parsedMinDate.getFullYear() : (currentMaxYear - 80);

  const isPrevDisabled = parsedMinDate && new Date(year, month, 0) < parsedMinDate;
  const isNextDisabled = parsedMaxDate && new Date(year, month + 1, 1) > parsedMaxDate;

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (isPrevDisabled) return;
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (isNextDisabled) return;
    setViewDate(new Date(year, month + 1, 1));
  };

  // Generate days grid
  const firstDayOfMonth = new Date(year, month, 1);
  // Monday-based start index (0 = Mon, 6 = Sun)
  let startDayIndex = firstDayOfMonth.getDay() - 1;
  if (startDayIndex < 0) startDayIndex = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  // Prev month padding
  for (let i = startDayIndex - 1; i >= 0; i--) {
    cells.push({
      day: daysInPrevMonth - i,
      monthOffset: -1,
      date: new Date(year, month - 1, daysInPrevMonth - i)
    });
  }
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      monthOffset: 0,
      date: new Date(year, month, i)
    });
  }
  // Next month padding
  const totalCells = 42; // 6 rows of 7
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

    // Check min/max bounds
    if (parsedMaxDate && cellDate > parsedMaxDate) return;
    if (parsedMinDate && cellDate < parsedMinDate) return;

    onChange(formatDate(cellDate));
    setShowCalendar(false);
  };

  const isSelected = (cellDate) => {
    return cleanValue && formatDate(cellDate) === cleanValue;
  };

  const isDisabled = (cellDate) => {
    if (parsedMaxDate && cellDate > parsedMaxDate) return true;
    if (parsedMinDate && cellDate < parsedMinDate) return true;
    return false;
  };

  const isToday = (cellDate) => {
    return formatDate(cellDate) === formatDate(new Date());
  };

  const isRed = required && !cleanValue;

  const yearOptions = [];
  for (let y = currentMaxYear; y >= currentMinYear; y--) {
    yearOptions.push(y);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Input box trigger */}
      <div
        onClick={() => !disabled && setShowCalendar(!showCalendar)}
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

      {/* Custom Calendar Dropdown Card */}
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
          {/* Calendar Header */}
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
                {monthNames.map((mName, idx) => {
                  const isMonthDisabled = (parsedMaxDate && year === currentMaxYear && idx > parsedMaxDate.getMonth()) ||
                                          (parsedMinDate && year === currentMinYear && idx < parsedMinDate.getMonth());
                  return (
                    <option key={idx} value={idx} disabled={isMonthDisabled}>
                      {mName.toUpperCase()}
                    </option>
                  );
                })}
              </select>
              <select
                value={year}
                onChange={(e) => {
                  const newYear = Number(e.target.value);
                  let newMonth = month;
                  if (parsedMaxDate && newYear === currentMaxYear && newMonth > parsedMaxDate.getMonth()) {
                    newMonth = parsedMaxDate.getMonth();
                  }
                  if (parsedMinDate && newYear === currentMinYear && newMonth < parsedMinDate.getMonth()) {
                    newMonth = parsedMinDate.getMonth();
                  }
                  setViewDate(new Date(newYear, newMonth, 1));
                }}
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
                {yearOptions.map((yVal) => (
                  <option key={yVal} value={yVal}>{yVal}</option>
                ))}
              </select>
            </div>

            {/* Navigation Arrows */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={isPrevDisabled}
                style={{
                  background: isPrevDisabled ? '#F1F5F9' : '#F8FAFC',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isPrevDisabled ? 'not-allowed' : 'pointer',
                  color: isPrevDisabled ? '#CBD5E1' : 'var(--navy)',
                  padding: 0
                }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                disabled={isNextDisabled}
                style={{
                  background: isNextDisabled ? '#F1F5F9' : '#F8FAFC',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isNextDisabled ? 'not-allowed' : 'pointer',
                  color: isNextDisabled ? '#CBD5E1' : 'var(--navy)',
                  padding: 0
                }}
              >
                ›
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
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

          {/* Days Grid */}
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
                      : isToday(cell.date)
                        ? 'white'
                        : disabledDay
                          ? 'none'
                          : '#E9EFF6',
                    border: isToday(cell.date) && !selected
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
                      e.currentTarget.style.background = isToday(cell.date) ? 'white' : '#E9EFF6';
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

function MultiSelectDropdown({ options = [], value = [], onChange, placeholder = 'Select...' }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const wrapperRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (opt) => {
    let updated;
    if (value.includes(opt)) {
      updated = value.filter(v => v !== opt);
    } else {
      updated = [...value, opt];
    }
    onChange(updated);
  };

  const isAnswered = value.length > 0;
  const displayText = isAnswered ? `${value.length} selected: ${value.join(', ')}` : placeholder;

  return (
    <div ref={wrapperRef} className="searchable-dropdown-container" style={{ position: 'relative', width: '100%' }}>
      <div
        className="searchable-dropdown-trigger"
        onClick={() => options.length > 0 && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 11px',
          background: options.length === 0 ? '#f1f5f9' : (isAnswered ? '#f0f9ff' : 'white'),
          border: options.length === 0 ? '1.5px solid #e2e8f0' : (isAnswered ? '1.5px solid #0284c7' : (isOpen ? '1.5px solid var(--blue-600, #0284c7)' : '1.5px solid var(--line, #BAE6FD)')),
          borderRadius: '12px',
          color: options.length === 0 ? '#94a3b8' : (isAnswered ? '#0369a1' : 'var(--muted, #64748B)'),
          cursor: options.length === 0 ? 'not-allowed' : 'pointer',
          minHeight: '42px',
          fontSize: '14px',
          fontWeight: isAnswered ? '600' : 'normal',
          boxSizing: 'border-box',
          boxShadow: (!isOpen || options.length === 0) ? 'none' : '0 0 0 3px rgba(125, 211, 252, .32)',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
          {displayText}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isAnswered && (
            <span style={{ background: '#0284c7', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>
              <FiCheck size={11} style={{ marginRight: '3px' }} />{value.length} Selected
            </span>
          )}
          <span style={{ fontSize: '10px', color: options.length === 0 ? '#94a3b8' : 'var(--blue, #075985)', marginLeft: '4px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
        </div>
      </div>

      {isOpen && options.length > 0 && (
        <div
          className="searchable-dropdown-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'white',
            border: '1.5px solid var(--line, #BAE6FD)',
            borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 100,
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '4px'
          }}
        >
          <input
            type="text"
            className="searchable-dropdown-search"
            placeholder="Type to search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1.5px solid var(--line, #BAE6FD)',
              borderRadius: '8px',
              marginBottom: '4px',
              boxSizing: 'border-box',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
              No options found
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = value.includes(opt);
              return (
                <div
                  key={opt}
                  className="searchable-dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(opt);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    background: isSelected ? '#F0F9FF' : 'transparent',
                    color: isSelected ? 'var(--blue-700, #0369a1)' : 'var(--text, #0F172A)',
                    fontWeight: isSelected ? 'bold' : 'normal'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    style={{ width: 'auto', minHeight: 'auto', cursor: 'pointer' }}
                  />
                  <span>{opt}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function PersonnelProfile() {
  const {
    personnel,
    activePersonnelId,
    setActivePersonnelId,
    updatePersonnelInfo,
    addPersonnel,
    deletePersonnel,
    savePersonnelChanges,
    classSections,
    schoolInfo,
    showToast,
    showAlert,
    showConfirm,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    districtSchools,
    completeNode,
    setActiveView
  } = useApp();

  const [isEmailInfoOpen, setIsEmailInfoOpen] = useState(false);

  const [activeTab, setActiveTab] = useState('identity');
  const [showRa1080Modal, setShowRa1080Modal] = useState(false);
  const [ra1080InputText, setRa1080InputText] = useState('');

  // High-Clarity Personnel Validation Modal State
  const [validationModal, setValidationModal] = useState({
    isOpen: false,
    personName: '',
    position: '',
    department: '',
    errors: []
  });

  // All-Personnel Progression Restriction Modal State
  const [allPersonnelValidationModal, setAllPersonnelValidationModal] = useState({
    isOpen: false,
    incompleteList: [],
    totalPersonnel: 0
  });


  // Feature A: Learning Area Matrix State
  const [learningAreaMap, setLearningAreaMap] = useState({}); // key: `${eraKey}||${subjectKey}` -> { checked: boolean, years: number }
  const [learningAreaLoading, setLearningAreaLoading] = useState(false);

  // Sidebar search & filter states
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [sidebarPage, setSidebarPage] = useState(1);

  useEffect(() => {
    setSidebarPage(1);
  }, [personnelSearch, categoryFilter, positionFilter]);

  const nonDraftPersonnel = personnel.filter(p => !p.isDraft);
  const dbPerson = nonDraftPersonnel.find(p => p.id === activePersonnelId) || nonDraftPersonnel[0];
  const [editPerson, setEditPerson] = useState(null);

  useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_personnel_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let personObj = dbPerson;
      if (savedDraft) {
        try {
          personObj = JSON.parse(savedDraft);
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      const rawPos = personObj.position || dbPerson.position || '';
      if (!isCanonicalPosition(rawPos)) {
        personObj = { ...personObj, position: '', type: '', positionCategory: '', position_category: '' };
      } else {
        const autoType = getCategoryForCanonicalPosition(rawPos) || detectPersonnelTypeFromPosition(rawPos);
        if (autoType && (personObj.type !== autoType || !personObj.type)) {
          personObj = { ...personObj, type: autoType, position: rawPos };
        }
      }

      setEditPerson(personObj);
    }
  }, [activePersonnelId, dbPerson]);

  const currentPerson = editPerson || dbPerson;

  // Fetch Learning Areas for active personnel
  useEffect(() => {
    if (!currentPerson?.id) {
      setLearningAreaMap({});
      return;
    }
    let isMounted = true;
    setLearningAreaLoading(true);

    // CRITICAL: Reset learningAreaMap to empty immediately on personnel change before fetching!
    let initialMap = {};
    const localDraft = localStorage.getItem(`draft_learning_areas_${currentPerson.id}`);
    if (localDraft) {
      try {
        initialMap = JSON.parse(localDraft) || {};
      } catch (e) {}
    }
    setLearningAreaMap(initialMap);

    api.getLearningAreas(currentPerson.id)
      .then(res => {
        if (!isMounted) return;
        let incomingMap = res?.learningAreaMap || res?.matrix_data || {};
        if (Array.isArray(res?.rows)) {
          const mapped = {};
          res.rows.forEach(r => {
            let areaName = r.learning_area;
            if (areaName === 'Kinder Blocks of Time' || areaName === 'KINDER BLOCKS OF TIME') {
              areaName = 'Kinder';
            }
            mapped[`${r.school_year}||${areaName}`] = {
              checked: true,
              years: Number(r.years_taught || 1)
            };
          });
          incomingMap = { ...incomingMap, ...mapped };
        }
        
        // Always set incomingMap (even if empty, so teacher with 0 learning areas shows 0 learning areas!)
        const finalMap = incomingMap && typeof incomingMap === 'object' ? incomingMap : {};
        setLearningAreaMap(finalMap);
        if (Object.keys(finalMap).length > 0) {
          localStorage.setItem(`draft_learning_areas_${currentPerson.id}`, JSON.stringify(finalMap));
        } else if (!localDraft) {
          localStorage.removeItem(`draft_learning_areas_${currentPerson.id}`);
        }
      })
      .catch(err => {
        console.error('Failed to fetch learning areas:', err);
      })
      .finally(() => {
        if (isMounted) setLearningAreaLoading(false);
      });
    return () => { isMounted = false; };
  }, [currentPerson?.id]);

  const getMaxAllowedServiceYears = (person) => {
    const d = person?.firstServiceDate || person?.first_service_date || '';
    if (!d || typeof d !== 'string' || d.length < 4) return 70;
    const startYear = parseInt(d.substring(0, 4), 10);
    if (isNaN(startYear)) return 70;
    const currentYear = new Date().getFullYear();
    const years = currentYear - startYear;
    return Math.min(70, Math.max(1, years));
  };

  const getTotalAssignedLearningYears = (map) => {
    let sum = 0;
    Object.keys(map || {}).forEach(k => {
      if (map[k]?.checked) {
        sum += Number(map[k]?.years || 0);
      }
    });
    return sum;
  };

  const getCellMaxYears = (eraKey, subjectKey, person, currentMap) => {
    const totalMaxService = getMaxAllowedServiceYears(person);
    const d = person?.firstServiceDate || person?.first_service_date || '';
    const firstServiceYear = (d && typeof d === 'string' && d.length >= 4) ? parseInt(d.substring(0, 4), 10) : null;
    const currentYear = new Date().getFullYear();

    const era = CURRICULUM_ERAS.find(e => e.key === eraKey);
    let eraMax = totalMaxService;
    if (era && firstServiceYear !== null) {
      const start = Math.max(era.startYear, firstServiceYear);
      const end = Math.min(era.endYear, currentYear);
      eraMax = Math.max(1, end - start + 1);
    }

    const currentCellKey = `${eraKey}||${subjectKey}`;
    const currentCellYears = currentMap?.[currentCellKey]?.checked ? Number(currentMap[currentCellKey]?.years || 0) : 0;
    const otherCellsSum = getTotalAssignedLearningYears(currentMap) - currentCellYears;

    const remainingGlobal = Math.max(0, totalMaxService - otherCellsSum);
    return Math.min(totalMaxService, eraMax, remainingGlobal);
  };

  const handleToggleLearningAreaCell = async (eraKey, subjectKey) => {
    if (!currentPerson?.id || currentPerson.isShared) return;
    const key = `${eraKey}||${subjectKey}`;
    const existing = learningAreaMap[key];
    const newChecked = !existing?.checked;
    
    let newYears = 0;
    if (newChecked) {
      const totalMax = getMaxAllowedServiceYears(currentPerson);
      const currentTotal = getTotalAssignedLearningYears(learningAreaMap);
      if (currentTotal >= totalMax) {
        showToast(`⚠️ Maximum teaching experience limit (${totalMax} yrs) has already been reached. Cannot add more subjects.`, 'warning');
        return;
      }
      const cellMax = getCellMaxYears(eraKey, subjectKey, currentPerson, learningAreaMap);
      if (cellMax <= 0) {
        showToast(`⚠️ Cannot add ${subjectKey}. Total service limit (${totalMax} yrs) reached.`, 'warning');
        return;
      }
      newYears = Math.min(cellMax, Math.max(1, existing?.years || 1));
    }

    setLearningAreaMap(prev => {
      const updated = { ...prev, [key]: { checked: newChecked, years: newYears } };
      localStorage.setItem(`draft_learning_areas_${currentPerson.id}`, JSON.stringify(updated));
      if (typeof handleFieldChange === 'function') {
        handleFieldChange('learningAreaMap', updated);
        handleFieldChange('matrix_data', updated);
      }
      return updated;
    });

    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
    showToast(`Learning area ${newChecked ? 'added' : 'removed'} in draft`, 'success');
  };

  const handleYearsChange = async (eraKey, subjectKey, yearsVal) => {
    if (!currentPerson?.id || currentPerson.isShared) return;
    const key = `${eraKey}||${subjectKey}`;
    let cleanVal = String(yearsVal || '').replace(/\D/g, '');
    if (cleanVal.length > 2) {
      cleanVal = cleanVal.slice(0, 2);
    }
    const cellMax = getCellMaxYears(eraKey, subjectKey, currentPerson, learningAreaMap);
    const inputVal = parseInt(cleanVal || '1', 10);
    const parsedYears = Math.min(cellMax, Math.max(1, inputVal));

    if (inputVal > cellMax && cellMax > 0) {
      showToast(`⚠️ Capped at ${cellMax} yr(s) (Combined service cannot exceed ${getMaxAllowedServiceYears(currentPerson)} yrs)`, 'warning');
    }

    setLearningAreaMap(prev => {
      const updated = { ...prev, [key]: { checked: true, years: parsedYears } };
      localStorage.setItem(`draft_learning_areas_${currentPerson.id}`, JSON.stringify(updated));
      if (typeof handleFieldChange === 'function') {
        handleFieldChange('learningAreaMap', updated);
        handleFieldChange('matrix_data', updated);
      }
      return updated;
    });

    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
  };

  useEffect(() => {
    if (currentPerson && currentPerson.isShared && activeTab !== 'identity') {
      setActiveTab('identity');
    }
  }, [currentPerson?.id, currentPerson?.isShared, activeTab]);

  if (!currentPerson) {
    return (
      <div className="card-inner">
        <h2>No Personnel Found</h2>
        <p className="subtext">Please add personnel in the Roster page first.</p>
      </div>
    );
  }


  const handleFieldChange = (key, value) => {
    if (!currentPerson) return;
    let updated = { ...currentPerson, [key]: value };

    if (key === 'assignedGradeLevels') {
      const grades = Array.isArray(value) ? value : [];
      const hasShs = grades.some(g => String(g).includes('11') || String(g).includes('12'));
      updated.teachesShs = hasShs;
      updated.teaches_shs = hasShs;
    }

    if (key === 'fundSource' && String(value).toUpperCase() === 'NATIONAL') {
      if (updated.lastPromotionDate === 'N/A') updated.lastPromotionDate = '';
      if (updated.lastLateralMovementDate === 'N/A') updated.lastLateralMovementDate = '';
      if (updated.newStationDate === 'N/A') updated.newStationDate = '';
      if (updated.depedEmail === 'N/A') updated.depedEmail = '';
    }

    if (key === 'natureOfAppointment') {
      const pType = detectPersonnelTypeFromPosition(updated.position) || updated.type || 'teaching';
      const isNT = pType === 'non-teaching';
      const nature = String(value || '').toUpperCase();

      if (nature === 'REGULAR PERMANENT') {
        updated.natureOfAppointment = 'REGULAR PERMANENT';
        updated.fundSource = 'NATIONAL';
        const allowedHiring = isNT ? ['REGULAR'] : ['REGULAR', 'SPIMS', '4PS', 'DOST'];
        if (!allowedHiring.includes(String(updated.hiringArrangement || '').toUpperCase())) {
          updated.hiringArrangement = 'REGULAR';
        }
        if (updated.lastPromotionDate === 'N/A') updated.lastPromotionDate = '';
        if (updated.lastLateralMovementDate === 'N/A') updated.lastLateralMovementDate = '';
        if (updated.newStationDate === 'N/A') updated.newStationDate = '';
        if (updated.depedEmail === 'N/A') updated.depedEmail = '';
      } else if (nature === 'PROVISIONAL') {
        updated.natureOfAppointment = 'PROVISIONAL';
        updated.fundSource = 'NATIONAL';
        updated.hiringArrangement = 'DOST';
        if (updated.lastPromotionDate === 'N/A') updated.lastPromotionDate = '';
        if (updated.lastLateralMovementDate === 'N/A') updated.lastLateralMovementDate = '';
        if (updated.newStationDate === 'N/A') updated.newStationDate = '';
        if (updated.depedEmail === 'N/A') updated.depedEmail = '';
      } else if (['CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'].includes(nature)) {
        updated.natureOfAppointment = nature;
        updated.hiringArrangement = 'N/A';
        if (String(updated.fundSource || '').toUpperCase() === 'NATIONAL') {
          updated.fundSource = '';
        }
      }
    }

    if (key === 'position' && value) {
      const autoType = detectPersonnelTypeFromPosition(value);
      if (autoType && autoType !== updated.type) {
        updated.type = autoType;
      }
      if (autoType === 'non-teaching') {
        const nat = String(updated.natureOfAppointment || '').toUpperCase();
        if (nat === 'PROVISIONAL' || nat === 'SUBSTITUTE') {
          updated.natureOfAppointment = 'REGULAR PERMANENT';
          updated.fundSource = 'NATIONAL';
          updated.hiringArrangement = 'REGULAR';
        } else if (nat === 'REGULAR PERMANENT') {
          updated.hiringArrangement = 'REGULAR';
        }
      }
      if (autoType !== 'non-teaching' && updated.depedEmail === 'N/A') {
        updated.depedEmail = '';
      }
    }

    if (key === 'type') {
      if (value === 'non-teaching') {
        const nat = String(updated.natureOfAppointment || '').toUpperCase();
        if (nat === 'PROVISIONAL' || nat === 'SUBSTITUTE') {
          updated.natureOfAppointment = 'REGULAR PERMANENT';
          updated.fundSource = 'NATIONAL';
          updated.hiringArrangement = 'REGULAR';
        } else if (nat === 'REGULAR PERMANENT') {
          updated.hiringArrangement = 'REGULAR';
        }
      } else if (updated.depedEmail === 'N/A') {
        updated.depedEmail = '';
      }
    }

    if (key === 'firstServiceDate' && value && typeof value === 'string' && value.length >= 10) {
      const firstDateStr = value.substring(0, 10);
      let resetCount = 0;

      if (updated.lastPromotionDate && updated.lastPromotionDate !== 'N/A' && updated.lastPromotionDate.substring(0, 10) < firstDateStr) {
        updated.lastPromotionDate = '';
        resetCount++;
      }
      if (updated.lastLateralMovementDate && updated.lastLateralMovementDate !== 'N/A' && updated.lastLateralMovementDate.substring(0, 10) < firstDateStr) {
        updated.lastLateralMovementDate = '';
        resetCount++;
      }
      if (updated.newStationDate && updated.newStationDate !== 'N/A' && updated.newStationDate.substring(0, 10) < firstDateStr) {
        updated.newStationDate = '';
        resetCount++;
      }

      if (resetCount > 0) {
        showToast(`⚠️ Reset ${resetCount} service date(s) that were earlier than 1st Day of Service (${firstDateStr})`, 'warning');
      }
    }

    if (key === 'firstServiceDate' || key === 'lastPromotionDate') {
      const effFirst = key === 'firstServiceDate' ? value : updated.firstServiceDate;
      const effProm = key === 'lastPromotionDate' ? value : updated.lastPromotionDate;
      const computed = computeStepIncrement(effFirst, effProm);
      if (computed && computed.step) {
        updated.stepIncrement = computed.step;
      }
    }

    setEditPerson(updated);
    localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
  };

  const handleMultipleFieldsChange = (fieldsObj) => {
    if (!currentPerson) return;
    const updated = { ...currentPerson, ...fieldsObj };
    setEditPerson(updated);
    localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
  };

  // Age calculation
  const maxBirthdate = React.useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    return d;
  }, []);

  // getAge is exported at module level

  const age = getAge(currentPerson.birthdate);
  let ageStatusText = 'No birthdate';
  let ageStatusClass = 'badge info';
  if (age !== null) {
    if (age < 15) {
      ageStatusText = 'Underage (<15 yrs)';
      ageStatusClass = 'badge warn';
    } else if (age > 80) {
      ageStatusText = 'Questionable age (>80 yrs)';
      ageStatusClass = 'badge warn';
    } else {
      ageStatusText = 'Age valid';
      ageStatusClass = 'badge ok';
    }
  }

  // Dynamic training helpers
  const handleTrainingChange = (key, index, field, value) => {
    const rows = [...(currentPerson[key] || [])];
    rows[index] = { ...rows[index], [field]: value };

    // Automatically recalculate NO. OF DAYS only
    if (field === 'startDate' || field === 'endDate') {
      const cleanStart = rows[index].startDate && typeof rows[index].startDate === 'string' ? rows[index].startDate.substring(0, 10) : '';
      const cleanEnd = rows[index].endDate && typeof rows[index].endDate === 'string' ? rows[index].endDate.substring(0, 10) : '';
      const start = cleanStart ? new Date(cleanStart + "T00:00:00") : null;
      const end = cleanEnd ? new Date(cleanEnd + "T00:00:00") : null;

      // Enforce end date must be on or after start date
      if (start && end && end < start) {
        rows[index].endDate = '';
        rows[index].days = 0;
      } else if (start && end && end >= start) {
        const days = Math.round((end - start) / 86400000) + 1;
        rows[index].days = days;
      } else {
        rows[index].days = 0;
      }
    }

    handleFieldChange(key, rows);
  };

  const addTrainingRow = (key) => {
    const rows = [...(currentPerson[key] || [])];
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    rows.push({ clientKey: tempId, title: '', startDate: '', endDate: '', days: 0, hoursPerDay: 0, totalHours: '' });
    handleFieldChange(key, rows);
  };

  const removeTrainingRow = (key, index) => {
    const rows = [...(currentPerson[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  // Once degreeRows is edited directly, it becomes the sole source of truth — the legacy flat
  // fields are cleared alongside so getEffectiveDegreeRows never resurrects them as a fallback.
  const commitDegreeRows = (rows) => {
    handleMultipleFieldsChange({
      degreeRows: rows,
      postGraduateDegree: '', postGraduateDiscipline: '', collegeDegree: '', major: '', minor: ''
    });
  };

  const handleDegreeChange = (index, field, value) => {
    const rows = [...getEffectiveDegreeRows(currentPerson)];
    rows[index] = { ...rows[index], [field]: value };
    if (field === 'collegeDegree' && rows[index].level !== 'MASTERS' && rows[index].level !== 'DOCTORATE') {
      const d = (value || '').toUpperCase();
      const isEdu = value && value !== 'NONE' && value !== 'N/A' && (
        d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
      );
      if (!isEdu) {
        rows[index].major = '';
        rows[index].minor = '';
      }
    }
    commitDegreeRows(rows);
  };

  const addDegreeRow = (level) => {
    const rows = [...getEffectiveDegreeRows(currentPerson)];
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const newRow = { clientKey: tempId, level, collegeDegree: '', major: '', minor: '' };
    if (level === 'MASTERS' || level === 'DOCTORATE') {
      newRow.postGraduateDiscipline = '';
    }
    rows.push(newRow);
    commitDegreeRows(rows);
  };

  const removeDegreeRow = (index) => {
    const rows = [...getEffectiveDegreeRows(currentPerson)].filter((_, idx) => idx !== index);
    commitDegreeRows(rows);
  };

  const checkSchoolHeadConflict = (person) => {
    const checkIsHead = (pos, des) => {
      const roleText = `${pos || ""} ${des || ""}`.toLowerCase();
      if (roleText.includes("assistant")) return false;
      return ["school principal", "principal", "teacher-in-charge", "officer-in-charge"].some(token => roleText.includes(token)) ||
        /\b(tic|oic)\b/.test(roleText);
    };

    const isSettingAsHead = checkIsHead(person.position, person.designation);

    if (isSettingAsHead) {
      const otherHead = personnel.find(p => {
        if (p.id === person.id) return false;
        return checkIsHead(p.position, p.designation);
      });

      if (otherHead) {
        const otherName = `${otherHead.firstName} ${otherHead.lastName}`;
        const otherRole = otherHead.position || otherHead.designation;
        return `School head conflict: ${otherName} is already assigned as a school head (${otherRole}) for this school. Only one School Head (Principal, OIC, or TIC) is allowed per school.`;
      }
    }
    return null;
  };

  const getPersonnelValidationErrors = (p) => {
    if (!p) return [];
    return getPersonnelValidationChecklist(p).errors;
  };

  const handleValidateOnly = async () => {
    if (!currentPerson) return;
    const p = currentPerson;

    const conflict = checkSchoolHeadConflict(p);
    if (conflict) {
      await showAlert("School Head Conflict", conflict);
      return;
    }

    const errors = getPersonnelValidationErrors(p);

    if (errors.length > 0) {
      const personName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Selected Personnel';
      const pos = p.position || p.plantilla_position || p.position_title || 'Unassigned Position';
      const pType = detectPersonnelTypeFromPosition(pos) || p.type || 'teaching';
      const dept = pType === 'teaching' ? 'Teaching Faculty' : pType === 'teaching-related' ? 'Related Teaching' : 'Non-Teaching';

      setValidationModal({
        isOpen: true,
        personName,
        position: pos,
        department: dept,
        errors
      });
      return;
    }

    try {
      const updated = { ...p, personalVerified: true, workloadVerified: true };
      setEditPerson(updated);
      await savePersonnelChanges(p.id, updated);
      localStorage.removeItem(`draft_personnel_${p.id}`);
      showToast(`✨ ${p.firstName || ''} ${p.lastName || ''}'s profile is 100% complete and validated!`, 'success');
    } catch (err) {
      await showAlert("Error", "Failed to save and validate record: " + err.message);
    }
  };

  // Backwards compatibility alias
  const handleSaveValidate = handleValidateOnly;



  const handleContinueToClasses = async () => {
    // 1. Scan ALL personnel in the school roster (excluding shared borrowed teachers)
    const targetPersonnel = (personnel || []).filter(p => !p.isShared);
    const incompleteList = [];


    targetPersonnel.forEach(p => {
      // Use active in-memory editPerson if IDs match, otherwise check localStorage draft or raw personnel object
      let personToCheck = p;
      if (currentPerson && currentPerson.id === p.id) {
        personToCheck = currentPerson;
      } else {
        const savedDraft = localStorage.getItem(`draft_personnel_${p.id}`);
        if (savedDraft) {
          try {
            personToCheck = { ...p, ...JSON.parse(savedDraft) };
          } catch (e) {
            personToCheck = p;
          }
        }
      }

      const errors = getPersonnelValidationErrors(personToCheck);
      if (errors.length > 0) {
        const personName = `${personToCheck.firstName || ''} ${personToCheck.lastName || ''}`.trim() || 'Unnamed Personnel';
        const pos = personToCheck.position || personToCheck.plantilla_position || personToCheck.position_title || 'Unassigned Position';
        const pType = detectPersonnelTypeFromPosition(pos) || personToCheck.type || 'teaching';
        const dept = pType === 'teaching' ? 'Teaching Faculty' : pType === 'teaching-related' ? 'Related Teaching' : 'Non-Teaching';

        incompleteList.push({
          id: personToCheck.id,
          personName,
          position: pos,
          department: dept,
          errors
        });
      }
    });

    // 2. If ANY personnel are incomplete, block progression and show the All-Personnel Restriction Modal
    if (incompleteList.length > 0) {
      setAllPersonnelValidationModal({
        isOpen: true,
        incompleteList,
        totalPersonnel: targetPersonnel.length
      });
      return;
    }

    // 3. All personnel are validated! Auto-save current person if needed and advance to Organized Classes
    if (currentPerson) {
      try {
        const updated = { ...currentPerson, personalVerified: true, workloadVerified: true };
        setEditPerson(updated);
        await savePersonnelChanges(currentPerson.id, updated);
        localStorage.removeItem(`draft_personnel_${currentPerson.id}`);
      } catch (e) {
        console.warn("Auto-save on continue warning:", e);
      }
    }

    if (completeNode) {
      completeNode('profile', 'classes');
    } else if (setActiveView) {
      setActiveView('classes');
    }
  };

  const handleSaveChangesDirectly = async () => {
    if (!currentPerson) return;

    const conflict = checkSchoolHeadConflict(currentPerson);
    if (conflict) {
      await showAlert("School Head Conflict", conflict);
      return;
    }

    // If it's a draft, it MUST pass validation to be saved to the database!
    if (String(currentPerson.id).startsWith('draft-')) {
      const errors = [];
      const p = currentPerson;
      if (!p.firstName?.trim()) errors.push("FIRST NAME");
      if (!p.middleName?.trim()) errors.push("MIDDLE NAME");
      if (!p.lastName?.trim()) errors.push("LAST NAME");
      if (!p.sexAtBirth) errors.push("SEX AT BIRTH");
      if (!p.civilStatus) errors.push("CIVIL STATUS");
      if (!p.religion) errors.push("RELIGION");
      if (!p.ethnicGroup) errors.push("ETHNIC GROUP");
      if (!p.birthdate) {
        errors.push("BIRTHDATE");
      } else {
        const ageVal = getAge(p.birthdate);
        if (ageVal !== null && ageVal < 15) {
          errors.push("VALID BIRTHDATE (PERSONNEL MUST BE AT LEAST 15 YEARS OLD)");
        }
      }
      if (!p.depedEmail?.trim()) errors.push("DEPED EMAIL");
      if (!p.noTin && !p.tin?.trim()) errors.push("TIN NUMBER");
      if (!p.position) errors.push("PLANTILLA POSITION");
      if (!p.fundSource) errors.push("FUND SOURCE");
      if (!p.natureOfAppointment) errors.push("NATURE OF APPOINTMENT");
      if (!p.hiringArrangement) errors.push("HIRING ARRANGEMENT");
      if (!p.deploymentStatus) errors.push("STATUS OF DEPLOYMENT");
      if (['Clustered', 'Reassigned', 'Borrowed', 'CLUSTERED', 'REASSIGNED', 'BORROWED'].includes(p.deploymentStatus) && !p.clusteredSchools && (!Array.isArray(p.assignedSchools) || p.assignedSchools.length === 0)) {
        errors.push("OTHER SCHOOL ASSIGNMENT");
      }
      if (!p.firstServiceDate) errors.push("DATE OF FIRST DAY OF SERVICE");
      if (!p.lastPromotionDate) errors.push("DATE OF LAST PROMOTION");
      if (!p.lastLateralMovementDate) errors.push("DATE OF LAST LATERAL MOVEMENT");
      if (!p.newStationDate) errors.push("DATE OF FIRST DAY IN CURRENT STATION");

      // Education / Qualifications
      const draftPType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
      const isDraftNonTeaching = ['non-teaching', 'NON-TEACHING'].includes(draftPType) || ['non-teaching', 'NON-TEACHING'].includes(p.type) || ['NON-TEACHING'].includes(p.positionCategory);
      const draftDegreeRows = getEffectiveDegreeRows(p);
      const draftHasAnyDegree = draftDegreeRows.some(d => d.collegeDegree);
      const draftAttainment = p.highestEducationalAttainment || (draftHasAnyDegree ? 'COLLEGE UNDERGRADUATE' : (isDraftNonTeaching ? 'N/A' : ''));
      if (!draftAttainment && !draftHasAnyDegree && !p.vocationalCourse && !isDraftNonTeaching) {
        errors.push("HIGHEST EDUCATIONAL ATTAINMENT");
      }
      const isDraftSHS = draftAttainment === 'SENIOR HIGH SCHOOL GRADUATE';
      const isDraftVocational = draftAttainment === 'VOCATIONAL / TECH-VOC COURSE';
      const isDraftCollegeOrPostGrad = draftAttainment === 'COLLEGE UNDERGRADUATE' || draftHasAnyDegree;

      if (isDraftSHS && !p.shsTrack) {
        errors.push("SENIOR HIGH SCHOOL TRACK");
      }
      if (isDraftVocational) {
        if (!p.vocationalCourse?.trim()) errors.push("VOCATIONAL / TESDA COURSE");
        if (!p.vocationalLevel?.trim()) errors.push("NC LEVEL / QUALIFICATION LEVEL");
      }
      if (isDraftCollegeOrPostGrad && !(draftDegreeRows.length > 0 && draftDegreeRows.every(d => !!d.collegeDegree))) {
        errors.push("COLLEGE DEGREE / BACCALAUREATE");
      }
      draftDegreeRows.forEach(d => {
        const isDraftEdu = d.collegeDegree && d.level !== 'MASTERS' && d.level !== 'DOCTORATE' && String(d.collegeDegree).toUpperCase().includes('EDUCATION');
        if (isDraftCollegeOrPostGrad && isDraftEdu && !d.major) {
          errors.push("MAJOR IN EDUCATION");
        }
        if ((d.level === 'MASTERS' || d.level === 'DOCTORATE') && !d.postGraduateDiscipline?.trim()) {
          errors.push("POST-GRADUATE DISCIPLINE");
        }
      });
      if (!p.eligibility || (Array.isArray(p.eligibility) && p.eligibility.length === 0)) {
        errors.push("ELIGIBILITY");
      }
      if (['let', 'pbet'].includes(String(p.eligibility || '').toLowerCase()) && !p.prcSpecialization?.trim()) {
        errors.push("PRC SPECIALIZATION");
      }
      const totalTrainingsCount = (p.neapTrainingRows || []).length + (p.certificationRows || []).length + (p.otherTrainingRows || []).length;
      if (totalTrainingsCount === 0) {
        errors.push("AT LEAST ONE PROFESSIONAL DEVELOPMENT / TRAINING RECORD");
      }
      const allDraftTrainings = [...(p.neapTrainingRows || []), ...(p.certificationRows || []), ...(p.otherTrainingRows || [])];
      if (allDraftTrainings.some(tr => !tr.totalHours || Number(tr.totalHours) <= 0)) {
        errors.push("TOTAL HOURS FOR ALL L&D / TRAINING RECORDS (REQUIRED)");
      }

      if (errors.length > 0) {
        await showAlert("Validation Checklist Needed", `To save this draft personnel to the database, the following fields must not be empty:\n\n• ${errors.join('\n• ')}`);
        return;
      }
    }

    try {
      await savePersonnelChanges(currentPerson.id, {
        ...currentPerson,
        learningAreaMap,
        matrix_data: learningAreaMap
      });
      localStorage.removeItem(`draft_personnel_${currentPerson.id}`);
      localStorage.removeItem(`draft_learning_areas_${currentPerson.id}`);
      showToast("Changes saved to database successfully.");
    } catch (err) {
      await showAlert("Error", "Failed to save changes: " + err.message);
    }
  };

  const handleDuplicate = () => {
    const sequence = personnel.length + 1;
    const addedId = addPersonnel({
      salutation: currentPerson.salutation || 'MR.',
      firstName: `${currentPerson.firstName} Copy`,
      middleName: currentPerson.middleName || '',
      lastName: currentPerson.lastName || '',
      nameExtension: currentPerson.nameExtension || '',
      type: currentPerson.type,
      position: currentPerson.position,
      depedEmail: `copy.${currentPerson.depedEmail || ''}`
    });
    setActivePersonnelId(addedId);
    showToast("Record duplicated successfully.");
  };

  const handleDelete = async () => {
    if (await showConfirm("Delete Profile?", "Are you sure you want to delete this personnel profile?")) {
      deletePersonnel(currentPerson.id);
      showToast("Record deleted.");
    }
  };

  // DepEd email local sync helpers
  const getEmailLocal = (email) => {
    if (!email) return '';
    if (email === 'N/A') return 'N/A';
    if (email.endsWith('@deped.gov.ph')) {
      return email.slice(0, -13);
    }
    return email;
  };

  const handleEmailLocalChange = (val) => {
    const raw = String(val || '').replace(/@/g, '').trim().toLowerCase();
    if (!raw) {
      handleFieldChange('depedEmail', '');
      return;
    }
    if (raw === 'n/a') {
      handleFieldChange('depedEmail', 'N/A');
      return;
    }
    handleFieldChange('depedEmail', `${raw}@deped.gov.ph`);
  };

  // Filtered list for sidebar
  const handleAutoPopulateMissingInfo = () => {
    let populatedCount = 0;
    const updatedPersonnelList = (personnel || []).map(p => {
      let isModified = false;
      const updatedP = { ...p };

      // 1. Position-based type classification
      if (!updatedP.type || updatedP.type === 'teaching') {
        const posUpper = String(updatedP.position || '').toUpperCase();
        if (posUpper.includes('PRINCIPAL') || posUpper.includes('TIC') || posUpper.includes('HEAD TEACHER') || posUpper.includes('SUPERVISOR')) {
          updatedP.type = 'teaching-related';
          isModified = true;
        } else if (posUpper.includes('ADMINISTRATIVE') || posUpper.includes('ACCOUNTANT') || posUpper.includes('CLERK') || posUpper.includes('DISBURSING') || posUpper.includes('DRIVER') || posUpper.includes('NURSE') || posUpper.includes('SECURITY') || posUpper.includes('UTILITY') || posUpper.includes('ADAS')) {
          updatedP.type = 'non-teaching';
          isModified = true;
        }
      }

      // 2. Sex at birth default
      if (!updatedP.sexAtBirth) {
        updatedP.sexAtBirth = updatedP.sex ? (String(updatedP.sex).toUpperCase().startsWith('M') ? 'Male' : 'Female') : 'Male';
        isModified = true;
      }

      // 3. Fund Source default
      if (!updatedP.fundSource) {
        updatedP.fundSource = 'NATIONAL';
        isModified = true;
      }

      // 4. Nature of Appointment default
      if (!updatedP.natureOfAppointment) {
        updatedP.natureOfAppointment = updatedP.appointmentStatus || 'REGULAR PERMANENT';
        isModified = true;
      }

      // 5. Hiring Arrangement default
      if (!updatedP.hiringArrangement) {
        if (['CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'].includes(String(updatedP.natureOfAppointment).toUpperCase())) {
          updatedP.hiringArrangement = 'N/A';
        } else if (String(updatedP.natureOfAppointment).toUpperCase() === 'PROVISIONAL') {
          updatedP.hiringArrangement = 'DOST';
        } else {
          updatedP.hiringArrangement = 'REGULAR';
        }
        isModified = true;
      }

      // 6. Status of Deployment default
      if (!updatedP.deploymentStatus) {
        updatedP.deploymentStatus = 'Stationed';
        isModified = true;
      }

      // 7. Salutation default
      if (!updatedP.salutation) {
        updatedP.salutation = updatedP.sexAtBirth === 'Female' ? 'MS.' : 'MR.';
        isModified = true;
      }

      // 8. Assigned Grade Levels: preserve user-assigned grade levels from Teaching Tab
      if (!Array.isArray(updatedP.assignedGradeLevels) || updatedP.assignedGradeLevels.length === 0) {
        const fallbackGrades = [];
        (updatedP.workloadRows || []).forEach(r => {
          if (r.gradeLevel && !fallbackGrades.includes(r.gradeLevel)) {
            fallbackGrades.push(r.gradeLevel);
            isModified = true;
          }
        });
        if (fallbackGrades.length > 0) {
          updatedP.assignedGradeLevels = fallbackGrades;
        }
      }

      if (isModified) {
        populatedCount++;
        localStorage.setItem(`draft_personnel_${updatedP.id}`, JSON.stringify(updatedP));
      }

      return updatedP;
    });

    if (populatedCount > 0) {
      setPersonnel(updatedPersonnelList);
      if (currentPerson) {
        const found = updatedPersonnelList.find(x => x.id === currentPerson.id);
        if (found) setEditPerson(found);
      }
      showToast(`✨ Auto-populated missing profile details for ${populatedCount} personnel!`, 'success');
    } else {
      showToast(`All personnel profiles are already complete!`, 'info');
    }
  };

  const getPersonCategoryType = (p) => {
    return detectPersonnelTypeFromPosition(p?.position || p?.plantilla_position || p?.position_title || '') || p?.type || 'teaching';
  };

  const sidebarPeople = nonDraftPersonnel.filter(p => {
    const pType = getPersonCategoryType(p);
    const matchesCat = categoryFilter === 'all' || pType === categoryFilter;
    const fullName = `${p.firstName || ''} ${p.lastName || ''} ${p.position || ''}`.toLowerCase();
    const matchesSearch = !personnelSearch || fullName.includes(personnelSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const categoryLabels = {
    teaching: { label: 'Teaching', color: '#0ea5e9', bg: '#e0f2fe' },
    'teaching-related': { label: 'Related', color: '#7c3aed', bg: '#ede9fe' },
    'non-teaching': { label: 'Non-Teaching', color: '#059669', bg: '#d1fae5' },
  };

  const tabs = currentPerson && currentPerson.isShared ? [
    { tab: 'identity', label: 'Identity & Personal', Icon: FiCreditCard }
  ] : [
    { tab: 'identity', label: 'Identity & Personal', Icon: FiCreditCard },
    { tab: 'employment', label: 'Employment', Icon: FiBriefcase },
    { tab: 'education', label: 'Education', Icon: FiAward },
    { tab: 'development', label: 'L&D', Icon: FiFileText },
    ...(currentPerson && getPersonCategoryType(currentPerson) !== 'non-teaching' ? [
      { tab: 'teaching', label: 'Teaching', Icon: FiLayers },
      { tab: 'learning-area', label: 'Learning Area', Icon: FiBook }
    ] : [])
  ];

  return (
    <section id="profile" className="view grid">
      <PortalHeader
        title="Personnel Profile & Specialization"
        description="Detailed personnel identity, employment history, degree specializations, and Learning Area matrix."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={handleContinueToClasses}
        continueText="Save & Continue to Organized Classes ➔"
      />
      <article className="card" style={{ overflow: 'hidden' }}>

        <div style={{ display: 'flex', height: '100%', minHeight: '80vh' }}>

          {/* ── LEFT SIDEBAR ─────────────────────────────── */}
          <div style={{
            width: '300px',
            minWidth: '300px',
            borderRight: '1.5px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            background: '#f8fafc'
          }}>
            {/* Header */}
            <div style={{ padding: '18px 16px 12px', borderBottom: '1.5px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--navy)' }}>Personnel Profiling</h2>
                <button
                  type="button"
                  onClick={handleAutoPopulateMissingInfo}
                  style={{
                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Auto-fill missing profile details & classifications for all personnel"
                >
                  <FiZap size={12} />
                  <span>Auto-Populate</span>
                </button>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--muted)' }}>{nonDraftPersonnel.length} personnel record{nonDraftPersonnel.length !== 1 ? 's' : ''}</p>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                  <FiSearch size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search name or position..."
                  value={personnelSearch}
                  onChange={e => setPersonnelSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 32px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--line)',
                    fontSize: '13px',
                    background: 'white',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--blue)'}
                  onBlur={e => e.target.style.borderColor = 'var(--line)'}
                />
              </div>
              {/* Category Pills */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                {[['all', 'All', '#64748b', '#f1f5f9'], ['teaching', 'Teaching', '#0369a1', '#e0f2fe'], ['teaching-related', 'Related', '#6d28d9', '#ede9fe'], ['non-teaching', 'Non-Teaching', '#065f46', '#d1fae5']].map(([val, label, color, bg]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCategoryFilter(val)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '999px',
                      border: `1.5px solid ${categoryFilter === val ? color : 'transparent'}`,
                      background: categoryFilter === val ? bg : 'transparent',
                      color: categoryFilter === val ? color : '#94a3b8',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Scrollable People List (10 per page) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column' }}>
              {(() => {
                const totalPages = Math.ceil(sidebarPeople.length / 10) || 1;
                const paginatedPeople = sidebarPeople.slice((sidebarPage - 1) * 10, sidebarPage * 10);

                return (
                  <>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {sidebarPeople.length === 0 && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                          No personnel match your search.
                        </div>
                      )}
                      {paginatedPeople.map(p => {
                        const isActive = p.id === currentPerson.id;
                        const hasDraft = !!localStorage.getItem(`draft_personnel_${p.id}`);
                        const pType = getPersonCategoryType(p);
                        const catInfo = categoryLabels[pType] || { label: pType, color: '#64748b', bg: '#f1f5f9' };
                        const initials = `${(p.firstName || '')[0] || ''}${(p.lastName || '')[0] || ''}`.toUpperCase();
                        const completionPct = calculatePersonCompletionPercentage(p, currentPerson);
                        return (
                          <div
                            key={p.id}
                            onClick={() => { setActivePersonnelId(p.id); setActiveTab('identity'); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '12px',
                              marginBottom: '4px',
                              cursor: 'pointer',
                              background: isActive ? 'white' : 'transparent',
                              border: isActive ? '1.5px solid var(--line)' : '1.5px solid transparent',
                              boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'white'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          >
                            {/* Avatar */}
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              background: isActive ? catInfo.bg : '#e2e8f0',
                              color: isActive ? catInfo.color : '#64748b',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: '800', fontSize: '13px', flexShrink: 0, position: 'relative'
                            }}>
                              {initials || '?'}
                              {hasDraft && (
                                <span style={{
                                  position: 'absolute', top: '-2px', right: '-2px',
                                  width: '10px', height: '10px', borderRadius: '50%',
                                  background: '#f59e0b', border: '2px solid #f8fafc'
                                }} title="Has unsaved changes" />
                              )}
                            </div>
                            {/* Name & Position */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '13px', fontWeight: isActive ? '700' : '600', color: isActive ? 'var(--navy)' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p.salutation} {p.firstName} {p.lastName}{p.nameExtension ? ` ${p.nameExtension}` : ''}
                              </p>
                              <p style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                  {p.position || 'No position set'}
                                </span>
                                <span style={{
                                  padding: '1px 6px', borderRadius: '6px',
                                  background: catInfo.bg, color: catInfo.color,
                                  fontSize: '9px', fontWeight: '700', flexShrink: 0, whiteSpace: 'nowrap'
                                }}>{catInfo.label}</span>
                              </p>
                              {/* Completion percentage progress bar */}
                              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ flex: 1, height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ width: `${completionPct}%`, height: '100%', background: completionPct === 100 ? '#10b981' : '#0284c7', borderRadius: '2px', transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', minWidth: '24px', textAlign: 'right' }}>
                                  {completionPct}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination Bar */}
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1.5px solid var(--line)', marginTop: 'auto' }}>
                        <button
                          type="button"
                          disabled={sidebarPage === 1}
                          onClick={() => setSidebarPage(prev => Math.max(1, prev - 1))}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--line)',
                            background: sidebarPage === 1 ? '#f8fafc' : 'white',
                            color: sidebarPage === 1 ? '#cbd5e1' : 'var(--navy)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: sidebarPage === 1 ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <FiChevronLeft size={12} />
                          <span>Prev</span>
                        </button>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>
                          Page {sidebarPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={sidebarPage >= totalPages}
                          onClick={() => setSidebarPage(prev => Math.min(totalPages, prev + 1))}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--line)',
                            background: sidebarPage >= totalPages ? '#f8fafc' : 'white',
                            color: sidebarPage >= totalPages ? '#cbd5e1' : 'var(--navy)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: sidebarPage >= totalPages ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <span>Next</span>
                          <FiChevronRight size={12} />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── RIGHT EDITOR PANEL ───────────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── Personnel Header ── */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1.5px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              background: 'white'
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: categoryLabels[currentPerson.type]?.bg || '#e2e8f0',
                color: categoryLabels[currentPerson.type]?.color || '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '900', fontSize: '17px', flexShrink: 0
              }}>
                {`${(currentPerson.firstName || '')[0] || ''}${(currentPerson.lastName || '')[0] || ''}`.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 2px', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                  {currentPerson.firstName} {currentPerson.lastName}{currentPerson.nameExtension ? ` ${currentPerson.nameExtension}` : ''}
                </h2>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{currentPerson.position || 'No position'}</span>
                  {currentPerson.profilingCode && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em' }}>PRN: {currentPerson.profilingCode}</span>
                  )}
                  {currentPerson.tin && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em' }}>TIN: {currentPerson.tin}</span>
                  )}
                  {currentPerson.deploymentStatus && (
                    <span style={{
                      padding: '1px 7px',
                      borderRadius: '5px',
                      background: String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '#FEF3C7' : '#E0F2FE',
                      color: String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '#92400E' : '#0369A1',
                      border: String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '1px solid #FCD34D' : '1px solid #BAE6FD',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>
                      STATUS: {String(currentPerson.deploymentStatus).toUpperCase()}
                    </span>
                  )}
                  {currentPerson.isShared && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <FiLink size={11} /> Shared from {DIVISION_SCHOOL_OPTIONS.find(s => s.schoolId === currentPerson.sourceSchoolId)?.name?.toUpperCase() || 'Mother School'}
                    </span>
                  )}
                  {currentPerson.personalVerified && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#d1fae5', color: '#065f46', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <FiCheck size={11} /> Verified
                    </span>
                  )}
                  {dbPerson && localStorage.getItem(`draft_personnel_${dbPerson.id}`) && !currentPerson.isShared && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '700' }}>● Unsaved Draft</span>
                  )}
                </div>
              </div>
              {/* Discard Draft button in header area */}
              {dbPerson && localStorage.getItem(`draft_personnel_${dbPerson.id}`) && !currentPerson.isShared && (
                <button className="btn secondary" style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap' }} type="button" onClick={async () => {
                  if (await showConfirm("Discard Draft?", "Revert to the saved database version?")) {
                    localStorage.removeItem(`draft_personnel_${dbPerson.id}`);
                    setEditPerson(dbPerson);
                  }
                }}>Discard Draft</button>
              )}
            </div>

            {/* ── Horizontal Tabs ── */}
            <div style={{
              display: 'flex',
              gap: '0',
              borderBottom: '1.5px solid var(--line)',
              background: '#f8fafc',
              padding: '0 24px'
            }}>
              {tabs.map(({ tab, label, Icon }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '12px 18px',
                    fontSize: '13px',
                    fontWeight: activeTab === tab ? '700' : '600',
                    color: activeTab === tab ? 'var(--blue)' : '#64748b',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab ? '3px solid var(--blue)' : '3px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* ── Form Content ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', position: 'relative' }}>
              {currentPerson.isShared && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  zIndex: 10, background: 'rgba(255,255,255,0.4)', pointerEvents: 'none'
                }}></div>
              )}
              <div style={{ pointerEvents: currentPerson.isShared ? 'none' : 'auto', opacity: currentPerson.isShared ? 0.8 : 1 }}>
                {currentPerson.isShared && (
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1.5px solid var(--line)', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FiInfo size={16} />
                        <span>Reassigned / Borrowed Personnel Profile</span>
                      </strong>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        background: String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '#FEF3C7' : '#E0E7FF',
                        color: String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '#92400E' : '#3730A3',
                        fontWeight: 'bold',
                        fontSize: '11px',
                        border: String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '1px solid #FCD34D' : '1px solid #C7D2FE'
                      }}>
                        STATUS: {String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? 'BORROWED' : String(currentPerson.deploymentStatus).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px', background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <div><span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>First Name</span><strong>{currentPerson.firstName || '—'}</strong></div>
                      <div><span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Last Name</span><strong>{currentPerson.lastName || '—'}</strong></div>
                      <div><span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>TIN</span><strong>{currentPerson.tin || 'N/A'}</strong></div>
                      <div><span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>PRN</span><strong>{currentPerson.profilingCode || '—'}</strong></div>
                    </div>
                    <p style={{ margin: '10px 0 0 0', color: '#64748B', fontSize: '12px' }}>
                      This personnel is borrowed from their Mother School. Basic identity details are managed by the Mother Station. You can manage their subject schedules in <strong>Workload Profile</strong>.
                    </p>
                  </div>
                )}
                <div className="profile-editor-layout">

                  {/* Editing Form fields dynamically */}
                  <div>
                    <p className="profile-section-note" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {activeTab === 'identity' && <><FiCreditCard size={14} /> <span>Editing identity and minimum record creation fields.</span></>}
                      {activeTab === 'personal' && <><FiUser size={14} /> <span>Editing demographic, civil status, birthdate, PhilSys, religion, and ethnicity fields.</span></>}
                      {activeTab === 'employment' && <><FiBriefcase size={14} /> <span>Editing position, designation, fund source, appointment, hiring arrangement, email, deployment, and service dates.</span></>}
                      {activeTab === 'education' && <><FiAward size={14} /> <span>Editing degree, major/minor, post-graduate degree, discipline, eligibility, and PRC specialization.</span></>}
                      {activeTab === 'development' && <><FiFileText size={14} /> <span>Editing NEAP trainings, TESDA NCs, certifications, and other professional development records.</span></>}
                      {activeTab === 'teaching' && <><FiLayers size={14} /> <span>Editing teaching grade level assignments.</span></>}
                      {activeTab === 'learning-area' && <><FiBook size={14} /> <span>Record taught learning areas per school year.</span></>}
                    </p>

                    <div className="form-grid profile-form-grid">

                      {activeTab === 'identity' && (
                        <>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>TIN</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="text"
                                  placeholder="123-456-789"
                                  disabled={currentPerson.noTin}
                                  value={currentPerson.tin || ''}
                                  maxLength={11}
                                  className={!currentPerson.noTin && !currentPerson.tin ? 'empty-field' : ''}
                                  style={{ width: '160px', textAlign: 'center', fontWeight: '500', letterSpacing: '0.05em' }}
                                  onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, ''); // Extract numbers only
                                    val = val.slice(0, 9); // Limit to max 9 digits

                                    let formatted = '';
                                    if (val.length > 0) {
                                      formatted += val.slice(0, 3);
                                    }
                                    if (val.length > 3) {
                                      formatted += '-' + val.slice(3, 6);
                                    }
                                    if (val.length > 6) {
                                      formatted += '-' + val.slice(6, 9);
                                    }

                                    handleFieldChange('tin', formatted);
                                  }}
                                />
                              </div>
                              <label className="checkline" style={{ textTransform: 'none', fontSize: '12px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                  type="checkbox"
                                  checked={!!currentPerson.noTin}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setEditPerson(prev => {
                                      const updated = { ...prev, noTin: isChecked };
                                      if (isChecked) updated.tin = '';
                                      localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
                                      return updated;
                                    });
                                  }}
                                /> No TIN available
                              </label>
                            </div>
                            <p className="field-help" style={{ marginTop: '6px' }}>PRN is used as the professional system ID, so no temporary ID is needed.</p>
                          </div>
                          <div className="profile-subsection">Legal Name</div>
                          <div>
                            <label>First Name</label>
                            <input className={!currentPerson.firstName ? 'empty-field' : ''} value={currentPerson.firstName || ''} onChange={(e) => handleFieldChange('firstName', e.target.value.toUpperCase())} />
                          </div>
                          <div>
                            <label>Middle Name</label>
                            <input value={currentPerson.middleName || ''} onChange={(e) => handleFieldChange('middleName', e.target.value.toUpperCase())} />
                          </div>
                          <div>
                            <label>Last Name</label>
                            <input className={!currentPerson.lastName ? 'empty-field' : ''} value={currentPerson.lastName || ''} onChange={(e) => handleFieldChange('lastName', e.target.value.toUpperCase())} />
                          </div>
                          <div>
                            <label>Extension Name (Optional)</label>
                            <input
                              maxLength={5}
                              value={currentPerson.nameExtension || ''}
                              onChange={(e) => handleFieldChange('nameExtension', e.target.value.toUpperCase().slice(0, 5))}
                              placeholder="e.g. JR., SR., III, IV"
                            />
                          </div>

                          <div className="profile-subsection">Demographic Profile</div>
                          <div>
                            <label>Sex at Birth</label>
                            <SearchableDropdown
                              options={['FEMALE', 'MALE']}
                              value={currentPerson.sexAtBirth || ''}
                              onChange={(val) => handleFieldChange('sexAtBirth', val)}
                              placeholder="SELECT SEX..."
                              required
                            />
                          </div>
                          <div>
                            <label>Civil Status</label>
                            <SearchableDropdown
                              options={['SINGLE', 'MARRIED', 'WIDOWED', 'LEGALLY SEPARATED']}
                              value={currentPerson.civilStatus || ''}
                              onChange={(val) => handleFieldChange('civilStatus', val)}
                              placeholder="SELECT CIVIL STATUS..."
                              required
                            />
                          </div>
                          <div>
                            <label>Solo Parent</label>
                            <SearchableDropdown
                              options={['NO', 'YES']}
                              value={currentPerson.soloParent || 'NO'}
                              onChange={(val) => handleFieldChange('soloParent', val)}
                              placeholder="SELECT SOLO PARENT STATUS..."
                            />
                          </div>
                          <div>
                            <label>Religion</label>
                            <SearchableDropdown
                              options={RELIGION_OPTIONS.map(r => r.toUpperCase())}
                              value={currentPerson.religion || ''}
                              onChange={(val) => handleFieldChange('religion', val)}
                              placeholder="SELECT RELIGION..."
                              required
                            />
                          </div>
                          <div>
                            <label>Ethnic Group</label>
                            <SearchableDropdown
                              options={ETHNIC_GROUP_OPTIONS}
                              value={currentPerson.ethnicGroup || ''}
                              onChange={(val) => handleFieldChange('ethnicGroup', val)}
                              placeholder="Select or search ethnic group..."
                              required
                            />
                          </div>
                          <div className="profile-subsection">Government ID and Birthdate</div>
                          <div>
                            {(() => {
                              const cleanPs = String(currentPerson.philsysNo || currentPerson.philsys_no || '').replace(/\D/g, '');
                              const isNA = !!(currentPerson.noPhilsys || currentPerson.no_philsys);
                              const isValid = isNA || cleanPs.length === 16;
                              return (
                                <>
                                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>PhilSys No. / National ID</span>
                                    {(isNA || cleanPs.length > 0) && (
                                      <span style={{ 
                                        color: isNA ? '#64748b' : cleanPs.length === 16 ? '#059669' : '#DC2626', 
                                        fontWeight: 600, 
                                        fontSize: '11px' 
                                      }}>
                                        {isNA 
                                          ? 'N/A' 
                                          : (cleanPs.length === 16 ? '16/16 digits ✓' : `${cleanPs.length}/16 digits`)}
                                      </span>
                                    )}
                                  </label>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <input
                                      placeholder="16-digit PhilSys Card Number"
                                      maxLength={16}
                                      disabled={isNA}
                                      value={isNA ? '' : (currentPerson.philsysNo || '')}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, ''); // numbers only
                                        handleFieldChange('philsysNo', val);
                                      }}
                                      style={{
                                        flex: 1,
                                        minWidth: '160px',
                                        ...(isNA ? { background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' } : {}),
                                        ...(!isValid && cleanPs.length > 0 ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                                      }}
                                    />
                                    <label className="checkline" style={{ textTransform: 'none', fontSize: '12px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                                      <input
                                        type="checkbox"
                                        checked={isNA}
                                        onChange={(e) => {
                                          const isChecked = e.target.checked;
                                          setEditPerson(prev => {
                                            const updated = { ...prev, noPhilsys: isChecked, no_philsys: isChecked };
                                            if (isChecked) {
                                              updated.philsysNo = '';
                                              updated.philsys_no = '';
                                            }
                                            localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
                                            return updated;
                                          });
                                        }}
                                      /> N/A
                                    </label>
                                  </div>
                                  <p className="field-help" style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                                    16-digit PhilSys National ID number. If not yet issued or unavailable, click <strong>N/A</strong>.
                                  </p>
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <label>Birthdate</label>
                            <DatePickerDropdowns
                              value={currentPerson.birthdate || ''}
                              onChange={(val) => handleFieldChange('birthdate', val)}
                              maxDate={maxBirthdate}
                              required
                            />
                          </div>
                          <div>
                            <label>Computed Age</label>
                            <input value={age === null ? '—' : age} disabled style={{ background: '#f1f5f9', color: '#64748b' }} />
                          </div>
                          <div>
                            <label>Age Validation</label>
                            <div style={{ marginTop: '8px' }}>
                              <span className={ageStatusClass} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>
                                {ageStatusText}
                              </span>
                            </div>
                          </div>
                        </>
                      )}

                      {activeTab === 'employment' && (
                        <>
                          <div className="profile-subsection">Role and Appointment</div>
                          <div>
                            <label>Personnel Category</label>
                            <SearchableDropdown
                              options={['TEACHING', 'RELATED TEACHING', 'NON-TEACHING']}
                              value={
                                (!currentPerson.type && !isCanonicalPosition(currentPerson.position)) ? '' :
                                (currentPerson.type === 'non-teaching') ? 'NON-TEACHING' :
                                (currentPerson.type === 'teaching-related') ? 'RELATED TEACHING' :
                                (currentPerson.type === 'teaching') ? 'TEACHING' : ''
                              }
                              onChange={(val) => {
                                const mapping = {
                                  'TEACHING': 'teaching',
                                  'RELATED TEACHING': 'teaching-related',
                                  'NON-TEACHING': 'non-teaching'
                                };
                                const newType = mapping[val] || '';
                                const validPositions = (POSITION_OPTIONS_BY_CATEGORY[newType] || []).map(p => p.toUpperCase());
                                let newPosition = currentPerson.position || '';
                                if (newPosition && !validPositions.includes(newPosition.toUpperCase()) && !newPosition.toUpperCase().startsWith('OTHERS')) {
                                  newPosition = '';
                                }
                                const updated = {
                                  ...currentPerson,
                                  type: newType,
                                  position: newPosition,
                                  positionCategory: val || '',
                                  position_category: val || ''
                                };
                                setEditPerson(updated);
                                localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
                              }}
                              placeholder="SELECT CATEGORY..."
                            />
                          </div>
                          <div>
                            <label>Plantilla Position</label>
                            <SearchableDropdown
                              options={
                                (() => {
                                  const rawType = String(currentPerson.type || '').toLowerCase();
                                  const categoryKey = rawType === 'teaching'
                                    ? 'teaching'
                                    : rawType === 'teaching-related'
                                      ? 'teaching-related'
                                      : rawType === 'non-teaching'
                                        ? 'non-teaching'
                                        : null;
                                  if (!categoryKey) {
                                    // If no category selected yet, offer all positions
                                    return [
                                      ...POSITION_OPTIONS_BY_CATEGORY.teaching,
                                      ...POSITION_OPTIONS_BY_CATEGORY['teaching-related'],
                                      ...POSITION_OPTIONS_BY_CATEGORY['non-teaching']
                                    ].map(p => p.toUpperCase());
                                  }
                                  const list = POSITION_OPTIONS_BY_CATEGORY[categoryKey] || [];
                                  return list.map(p => p.toUpperCase());
                                })()
                              }
                              value={
                                isCanonicalPosition(currentPerson.position)
                                  ? (currentPerson.position?.startsWith('OTHERS') ? 'OTHERS' : (currentPerson.position || ''))
                                  : ''
                              }
                              onChange={(val) => {
                                const selectedPos = val === 'OTHERS' ? 'OTHERS' : val;
                                const autoType = getCategoryForCanonicalPosition(selectedPos) || detectPersonnelTypeFromPosition(selectedPos) || currentPerson.type || '';
                                const catName = autoType === 'teaching' ? 'TEACHING' : autoType === 'teaching-related' ? 'RELATED TEACHING' : autoType === 'non-teaching' ? 'NON-TEACHING' : '';
                                const updated = {
                                  ...currentPerson,
                                  position: selectedPos,
                                  plantilla_position: selectedPos,
                                  type: autoType,
                                  positionCategory: catName,
                                  position_category: catName
                                };
                                setEditPerson(updated);
                                localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
                              }}
                              placeholder="SELECT PLANTILLA POSITION..."
                              required
                            />
                            {(currentPerson.type === 'non-teaching' || currentPerson.type === 'NON-TEACHING') && (currentPerson.position === 'OTHERS' || currentPerson.position?.startsWith('OTHERS')) && (
                              <div style={{ marginTop: '8px' }}>
                                <label style={{ fontSize: '11px', color: '#64748B' }}>Specify Position (Max 50 characters)</label>
                                <input
                                  type="text"
                                  maxLength={50}
                                  placeholder="Specify position title..."
                                  value={currentPerson.position === 'OTHERS' ? '' : currentPerson.position.replace(/^OTHERS\s*-\s*/i, '')}
                                  onChange={(e) => {
                                    const val = e.target.value.substring(0, 50).toUpperCase();
                                    handleFieldChange('position', val ? `OTHERS - ${val}` : 'OTHERS');
                                  }}
                                  required
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '13px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #BAE6FD',
                                    background: '#F0F9FF'
                                  }}
                                />
                                <div style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'right', marginTop: '2px' }}>
                                  {(currentPerson.position === 'OTHERS' ? '' : currentPerson.position.replace(/^OTHERS\s*-\s*/i, '')).length}/50 characters
                                </div>
                              </div>
                            )}
                          </div>
                          {(() => {
                            const personCategory = detectPersonnelTypeFromPosition(currentPerson.position) || currentPerson.type || 'teaching';
                            const isNonTeaching = personCategory === 'non-teaching';
                            const currentNature = String(currentPerson.natureOfAppointment || '').toUpperCase();

                            // 1. Nature of Appointment Options
                            const natureOptions = isNonTeaching
                              ? ['REGULAR PERMANENT', 'CONTRACTUAL', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER']
                              : ['REGULAR PERMANENT', 'PROVISIONAL', 'CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'];

                            // 2. Hiring Arrangement Config
                            let hiringOptions = [];
                            let isHiringDisabled = false;
                            let hiringValue = currentPerson.hiringArrangement || '';

                            if (currentNature === 'REGULAR PERMANENT') {
                              if (isNonTeaching) {
                                hiringOptions = ['REGULAR'];
                                hiringValue = 'REGULAR';
                                isHiringDisabled = true;
                              } else {
                                hiringOptions = ['REGULAR', 'SPIMS', '4PS', 'DOST'];
                                isHiringDisabled = false;
                                if (!hiringValue || hiringValue === 'N/A' || !hiringOptions.includes(hiringValue.toUpperCase())) {
                                  hiringValue = 'REGULAR';
                                }
                              }
                            } else if (currentNature === 'PROVISIONAL') {
                              hiringOptions = ['DOST'];
                              hiringValue = 'DOST';
                              isHiringDisabled = true;
                            } else if (['CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'].includes(currentNature)) {
                              hiringOptions = ['N/A'];
                              hiringValue = 'N/A';
                              isHiringDisabled = true;
                            } else {
                              hiringOptions = isNonTeaching ? ['REGULAR', 'N/A'] : ['REGULAR', 'SPIMS', '4PS', 'DOST', 'N/A'];
                              isHiringDisabled = false;
                            }

                            // 3. Fund Source Config
                            let fundOptions = [];
                            let isFundDisabled = false;
                            let fundValue = currentPerson.fundSource || '';

                            if (currentNature === 'REGULAR PERMANENT' || currentNature === 'PROVISIONAL') {
                              fundOptions = ['NATIONAL'];
                              fundValue = 'NATIONAL';
                              isFundDisabled = true;
                            } else if (['CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'].includes(currentNature)) {
                              fundOptions = ['SEF', 'LGU', 'PTA', 'NGO', 'SCHOOL MOOE'];
                              isFundDisabled = false;
                              if (String(fundValue).toUpperCase() === 'NATIONAL') {
                                fundValue = '';
                              } else if (String(fundValue).toUpperCase() === 'MOOE') {
                                fundValue = 'SCHOOL MOOE';
                              }
                            } else {
                              fundOptions = ['NATIONAL', 'SEF', 'LGU', 'PTA', 'NGO', 'SCHOOL MOOE'];
                              isFundDisabled = false;
                            }

                            return (
                              <>
                                <div>
                                  <label>Nature of Appointment</label>
                                  <SearchableDropdown
                                    options={natureOptions}
                                    value={currentPerson.natureOfAppointment || ''}
                                    onChange={(val) => handleFieldChange('natureOfAppointment', val)}
                                    placeholder="Select nature of appointment..."
                                    required
                                  />
                                </div>
                                <div>
                                  <label>Hiring Arrangement</label>
                                  <SearchableDropdown
                                    options={hiringOptions}
                                    value={hiringValue}
                                    disabled={isHiringDisabled}
                                    onChange={(val) => handleFieldChange('hiringArrangement', val)}
                                    placeholder="Select hiring arrangement..."
                                    required
                                  />
                                </div>
                                <div>
                                  <label>Fund Source</label>
                                  <SearchableDropdown
                                    options={fundOptions}
                                    value={fundValue}
                                    disabled={isFundDisabled}
                                    onChange={(val) => handleFieldChange('fundSource', val)}
                                    placeholder="SELECT FUND SOURCE..."
                                    required
                                  />
                                </div>
                              </>
                            );
                          })()}
                          <div>
                            <label>Employee No.</label>
                            {(() => {
                              const cleanEmpNo = (currentPerson.employeeNo && !String(currentPerson.employeeNo).toUpperCase().startsWith('PRN')) ? currentPerson.employeeNo : '';
                              return (
                                <input
                                  type="text"
                                  placeholder="e.g. 4250732"
                                  className={!cleanEmpNo ? 'empty-field' : ''}
                                  value={cleanEmpNo}
                                  onChange={(e) => handleFieldChange('employeeNo', e.target.value)}
                                />
                              );
                            })()}
                          </div>
                          <div>
                            {(() => {
                              const isNonTeaching = currentPerson.type === 'non-teaching';
                              const isNationalFund = String(currentPerson.fundSource || '').trim().toUpperCase() === 'NATIONAL';
                              const isNonNationalNonTeaching = isNonTeaching && !isNationalFund;
                              const isEmailNA = isNonNationalNonTeaching && currentPerson.depedEmail === 'N/A';
                              const rawEmail = isNonNationalNonTeaching ? (currentPerson.depedEmail || '') : (currentPerson.depedEmail === 'N/A' ? '' : (currentPerson.depedEmail || ''));
                              const emailVal = (!rawEmail || isEmailNA)
                                ? { isValid: true, error: null }
                                : validateDepEdEmail(rawEmail, currentPerson.firstName, currentPerson.lastName, currentPerson.middleName);

                              const localVal = isEmailNA ? 'N/A' : getEmailLocal(rawEmail);
                              const hasError = !emailVal.isValid && !isEmailNA;

                              return (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <label style={{ margin: 0 }}>DepEd Email</label>
                                      <button
                                        type="button"
                                        onClick={() => setIsEmailInfoOpen(true)}
                                        title="DepEd Email Policy & Validation Notice"
                                        style={{
                                          background: '#E0F2FE',
                                          color: '#0284C7',
                                          border: '1px solid #BAE6FD',
                                          borderRadius: '50%',
                                          width: '18px',
                                          height: '18px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '11px',
                                          fontWeight: '800',
                                          cursor: 'pointer',
                                          lineHeight: 1,
                                          padding: 0
                                        }}
                                      >
                                        i
                                      </button>
                                    </div>
                                    {isNonNationalNonTeaching && (
                                      <span style={{ fontSize: '10.5px', color: '#047857', background: '#ECFDF5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #A7F3D0', fontWeight: '700' }}>
                                        Optional for Non-National
                                      </span>
                                    )}
                                  </div>

                                  <div className="deped-email-field" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    borderRadius: '12px',
                                    border: hasError ? '2px solid #EF4444' : (isEmailNA ? '1.5px solid #CBD5E1' : '1.5px solid var(--line, #BAE6FD)'),
                                    background: hasError ? '#FEF2F2' : (isEmailNA ? '#F1F5F9' : 'white'),
                                    overflow: 'hidden'
                                  }}>
                                    <input
                                      type="text"
                                      disabled={isEmailNA}
                                      value={localVal}
                                      onKeyDown={(e) => {
                                        if (e.key === '@') {
                                          e.preventDefault();
                                        }
                                      }}
                                      onChange={(e) => {
                                        const clean = e.target.value.replace(/@/g, '');
                                        handleEmailLocalChange(clean);
                                      }}
                                      placeholder={isEmailNA ? 'N/A' : ''}
                                      className={!localVal && !isEmailNA ? 'empty-field' : ''}
                                      style={{
                                        flex: 1,
                                        border: 'none',
                                        background: 'transparent',
                                        borderRadius: 0,
                                        padding: '10px 12px',
                                        fontSize: '14px',
                                        color: isEmailNA ? '#64748B' : (hasError ? '#B91C1C' : 'var(--text, #0F172A)'),
                                        fontWeight: isEmailNA ? 'bold' : 'normal',
                                        outline: 'none'
                                      }}
                                    />
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      height: '42px',
                                      padding: '0 12px',
                                      background: hasError ? '#FEE2E2' : (isEmailNA ? '#E2E8F0' : 'var(--blue-50, #F0F9FF)'),
                                      borderLeft: hasError ? '1px solid #FCA5A5' : '1px solid var(--line, #BAE6FD)',
                                      fontSize: '13px',
                                      color: hasError ? '#DC2626' : (isEmailNA ? '#94A3B8' : 'var(--blue, #0284C7)'),
                                      fontWeight: 'bold',
                                      userSelect: 'none',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      @deped.gov.ph
                                    </span>
                                  </div>

                                  {/* Red error alert inline if invalid */}
                                  {hasError && (
                                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#DC2626', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <FiAlertCircle size={14} color="#DC2626" /> {emailVal.error}
                                    </p>
                                  )}

                                  {/* N/A Checkbox Toggle for Non-National Non-Teaching */}
                                  {isNonNationalNonTeaching && (
                                    <label style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      marginTop: '6px',
                                      fontSize: '12px',
                                      color: 'var(--navy)',
                                      cursor: 'pointer',
                                      fontWeight: '600'
                                    }}>
                                      <input
                                        type="checkbox"
                                        checked={isEmailNA}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            handleFieldChange('depedEmail', 'N/A');
                                          } else {
                                            handleFieldChange('depedEmail', '');
                                          }
                                        }}
                                        style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                      />
                                      <span>No DepEd email issued (Mark as N/A)</span>
                                    </label>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          <div className="profile-subsection">Deployment and Service Dates</div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Status of Deployment</label>
                            <SearchableDropdown
                              options={['OWN STATION', 'CLUSTERED', 'REASSIGNED']}
                              value={currentPerson.deploymentStatus || ''}
                              onChange={(val) => handleFieldChange('deploymentStatus', val)}
                              placeholder="SELECT STATUS OF DEPLOYMENT..."
                            />
                          </div>

                          {['Clustered', 'Reassigned', 'Borrowed', 'CLUSTERED', 'REASSIGNED', 'BORROWED'].includes(currentPerson.deploymentStatus) && (
                            <div className="full" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                              {(() => {
                                const currentDistrictStr = String(schoolInfo?.district || '').trim().toLowerCase();
                                const currentSchoolIdStr = String(schoolInfo?.schoolId || '').trim();

                                const formatSchoolOption = (s) => {
                                  if (typeof s === 'string') return s;
                                  const name = s.schoolName || s.school_name || s.name || s.school || 'SCHOOL';
                                  const id = s.schoolId || s.school_id || s.id || s.schoolid || '';
                                  return id ? `${String(name).toUpperCase()} (${id})` : String(name).toUpperCase();
                                };

                                const getSchoolId = (s) => String(s.schoolId || s.school_id || s.id || s.schoolid || '');
                                const getSchoolDistrict = (s) => String(s.district || s.school_district || '').trim().toLowerCase();

                                const filteredDistrictSchools = (Array.isArray(districtSchools) && districtSchools.length > 0)
                                  ? districtSchools.filter(s => getSchoolId(s) !== currentSchoolIdStr)
                                  : DIVISION_SCHOOL_OPTIONS.filter(s => {
                                      if (getSchoolId(s) === currentSchoolIdStr) return false;
                                      if (!currentDistrictStr || currentDistrictStr === 'district' || currentDistrictStr === 'unspecified') return true;
                                      const sDist = getSchoolDistrict(s);
                                      return !sDist || sDist === 'district' || sDist === currentDistrictStr || sDist.includes(currentDistrictStr) || currentDistrictStr.includes(sDist);
                                    });

                                const schoolOptionsList = filteredDistrictSchools.map(formatSchoolOption).filter(Boolean);

                                const resolveSchoolMeta = (item) => {
                                  if (!item) return null;
                                  const str = String(item).trim();
                                  const parenMatch = str.match(/\((\d{5,})\)/);
                                  const idFromParen = parenMatch ? parenMatch[1] : null;
                                  const cleanName = str.split(' (')[0].trim().toUpperCase();

                                  const dsMatch = filteredDistrictSchools.find(s => {
                                    const sId = String(s.schoolId || s.school_id || s.id || s.schoolid || '');
                                    const sName = String(s.schoolName || s.school_name || s.name || s.school || '').trim().toUpperCase();
                                    return (idFromParen && sId === idFromParen) || sName === cleanName || sId === str;
                                  });
                                  if (dsMatch) {
                                    return {
                                      schoolId: String(dsMatch.schoolId || dsMatch.school_id || dsMatch.id || dsMatch.schoolid || ''),
                                      name: dsMatch.schoolName || dsMatch.school_name || dsMatch.name || cleanName
                                    };
                                  }

                                  const divMatch = DIVISION_SCHOOL_OPTIONS.find(s => {
                                    const sId = String(s.schoolId || s.id || '');
                                    const sName = String(s.name || '').trim().toUpperCase();
                                    return (idFromParen && sId === idFromParen) || sName === cleanName || sId === str;
                                  });
                                  if (divMatch) {
                                    return {
                                      schoolId: String(divMatch.schoolId || divMatch.id || ''),
                                      name: divMatch.name || cleanName
                                    };
                                  }

                                  if (idFromParen) return { schoolId: idFromParen, name: cleanName };
                                  if (/^\d{5,}$/.test(str)) return { schoolId: str, name: str };

                                  return null;
                                };

                                return (
                                  <>
                                    {String(currentPerson.deploymentStatus).toUpperCase() === 'REASSIGNED' && (
                                      <div style={{
                                        padding: '16px',
                                        background: '#F8FAFC',
                                        border: '1.5px solid var(--line)',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        marginTop: '10px'
                                      }}>
                                        <div>
                                          <label>Reassigned Target School (Same District)</label>
                                          <SearchableDropdown
                                            options={schoolOptionsList}
                                            value={
                                              (() => {
                                                const activeSchool = (Array.isArray(currentPerson.assignedSchools) && currentPerson.assignedSchools[0]) ||
                                                  (typeof currentPerson.assignedSchools === 'string' ? currentPerson.assignedSchools : '');

                                                if (!activeSchool) return '';

                                                return schoolOptionsList
                                                  .find(opt => opt.toUpperCase().startsWith(activeSchool.toUpperCase())) || activeSchool;
                                              })()
                                            }
                                            onChange={(val) => {
                                              const schoolName = val.split(' (')[0];
                                              handleFieldChange('assignedSchools', schoolName ? [schoolName] : []);
                                            }}
                                            placeholder="SELECT REASSIGNED TARGET SCHOOL..."
                                          />
                                          <p className="field-help">Select the destination school in {schoolInfo?.district || 'the same district'} where this personnel is reassigned to teach.</p>
                                        </div>

                                        {(() => {
                                          const prnToShare = currentPerson.prn || currentPerson.profilingCode || (currentPerson.id && String(currentPerson.id).startsWith('PRN') ? currentPerson.id : (currentPerson.id ? 'PRN-' + String(currentPerson.id).replace('PER-', '') : null));
                                          const hasAssignedSchools = (Array.isArray(currentPerson.assignedSchools) && currentPerson.assignedSchools.length > 0) || (typeof currentPerson.assignedSchools === 'string' && currentPerson.assignedSchools.trim().length > 0);
                                          const canSend = Boolean(prnToShare) && hasAssignedSchools;

                                          return (
                                            <>
                                              <button
                                                type="button"
                                                className="btn btn-primary"
                                                style={{ marginTop: '8px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                disabled={!canSend}
                                                onClick={async () => {
                                                  if (!prnToShare) {
                                                    await showAlert("Missing PRN", "A valid PRN is required before sending a reassignment request. Please save this personnel profile first.");
                                                    return;
                                                  }
                                                  try {
                                                    const { api } = await import('../services/api');
                                                    const rawSchool = Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools[0] : currentPerson.assignedSchools;
                                                    const match = resolveSchoolMeta(rawSchool);
                                                    const targetSchoolId = match?.schoolId || (typeof rawSchool === 'string' ? rawSchool.match(/\((\d+)\)/)?.[1] : null);

                                                    if (!targetSchoolId) {
                                                      await showAlert("No Target School", "Please select a target destination school from the dropdown before sending the reassignment request.");
                                                      return;
                                                    }

                                                    await api.createRequest({
                                                      targetSchoolId: targetSchoolId,
                                                      requestType: 'reassigned_teacher',
                                                      personnelId: prnToShare,
                                                      personnelName: `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.trim()
                                                    });

                                                    showToast("Reassignment request sent successfully!", "success");
                                                    await showAlert(
                                                      "Reassignment Request Sent",
                                                      `Reassignment request for ${currentPerson.firstName || ''} ${currentPerson.lastName || ''} (${prnToShare}) has been sent to ${match?.name || rawSchool} successfully!\n\nOnce accepted by that school, the personnel's status in their roster will be BORROWED.`
                                                    );
                                                  } catch (err) {
                                                    await showAlert("Reassignment Request Error", "Failed to send reassignment request: " + err.message);
                                                  }
                                                }}
                                              >
                                                <FiLink size={13} style={{ marginRight: '6px' }} />Send Reassignment Request
                                              </button>
                                              {!prnToShare && (
                                                <p className="field-help" style={{ color: 'var(--danger)' }}>Note: You must save this personnel profile first to generate a PRN before sending reassignment request.</p>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' && (
                                      <div>
                                        <label>Origin / Mother Station (Same District)</label>
                                        <SearchableDropdown
                                          options={schoolOptionsList}
                                          value={
                                            (() => {
                                              const activeSchool = (Array.isArray(currentPerson.assignedSchools) && currentPerson.assignedSchools[0]) ||
                                                (typeof currentPerson.assignedSchools === 'string' ? currentPerson.assignedSchools : '');

                                              if (!activeSchool) return '';

                                              return schoolOptionsList
                                                .find(opt => opt.toUpperCase().startsWith(activeSchool.toUpperCase())) || activeSchool;
                                            })()
                                          }
                                          onChange={(val) => {
                                            const schoolName = val.split(' (')[0];
                                            handleFieldChange('assignedSchools', schoolName ? [schoolName] : []);
                                          }}
                                          placeholder="SELECT ORIGIN STATION..."
                                        />
                                        <p className="field-help">Mother station from which this personnel is borrowed within {schoolInfo?.district || 'the same district'}.</p>
                                      </div>
                                    )}

                                    {String(currentPerson.deploymentStatus).toUpperCase() === 'CLUSTERED' && (
                                      <div style={{
                                        padding: '16px',
                                        background: '#F8FAFC',
                                        border: '1.5px solid var(--line)',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        marginTop: '10px'
                                      }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontWeight: 'bold', color: 'var(--navy)', fontSize: '13px' }}>Clustered School Assignments</span>
                                          <span style={{ fontSize: '11px', color: '#0369A1', background: '#E0F2FE', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                                            <FiMapPin size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />District: {schoolInfo?.district || 'Same District'}
                                          </span>
                                        </div>
                                        <p className="field-help" style={{ marginTop: '-8px' }}>Select satellite schools in the same district where this personnel is deployed to teach.</p>

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                                          {(Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : []).map((school, index) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50)', border: '1.5px solid var(--line)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                              <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 'bold' }}>{school.split(' (')[0]}</span>
                                              <button
                                                type="button"
                                                style={{ background: 'transparent', border: 0, color: 'var(--blue)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                                                onClick={() => {
                                                  const currentList = Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : [];
                                                  const newList = currentList.filter((_, idx) => idx !== index);
                                                  handleFieldChange('assignedSchools', newList);
                                                }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))}
                                          {(Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : []).length === 0 && (
                                            <span style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>No clustered schools assigned yet.</span>
                                          )}
                                        </div>

                                        <SearchableDropdown
                                          options={schoolOptionsList}
                                          value=""
                                          onChange={(val) => {
                                            if (!val) return;
                                            const currentList = Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : [];
                                            if (!currentList.includes(val)) {
                                              handleFieldChange('assignedSchools', [...currentList, val]);
                                            }
                                          }}
                                          placeholder="+ ADD CLUSTERED SCHOOL (SAME DISTRICT)..."
                                        />

                                        {(() => {
                                          const prnToShare = currentPerson.prn || currentPerson.profilingCode || (currentPerson.id && String(currentPerson.id).startsWith('PRN') ? currentPerson.id : (currentPerson.id ? 'PRN-' + String(currentPerson.id).replace('PER-', '') : null));
                                          const hasAssignedSchools = Array.isArray(currentPerson.assignedSchools) && currentPerson.assignedSchools.length > 0;
                                          const canShare = Boolean(prnToShare) && hasAssignedSchools;

                                          return (
                                            <>
                                              <button
                                                type="button"
                                                className="btn btn-primary"
                                                style={{ marginTop: '8px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                disabled={!canShare}
                                                onClick={async () => {
                                                  if (!prnToShare) {
                                                    await showAlert("Missing PRN", "A valid PRN is required before sharing. Please save this personnel profile first.");
                                                    return;
                                                  }
                                                  try {
                                                    const { api } = await import('../services/api');
                                                    const targetSchoolIds = (currentPerson.assignedSchools || []).map(item => {
                                                      const meta = resolveSchoolMeta(item);
                                                      return meta ? meta.schoolId : (typeof item === 'string' ? item : null);
                                                    }).filter(Boolean);

                                                    if (targetSchoolIds.length === 0) {
                                                      await showAlert("No Target Schools", "Please add at least one clustered school from the dropdown before sharing.");
                                                      return;
                                                    }

                                                    for (const targetId of targetSchoolIds) {
                                                      await api.createRequest({
                                                        targetSchoolId: targetId,
                                                        requestType: 'clustered_teacher',
                                                        personnelId: prnToShare,
                                                        personnelName: `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.trim()
                                                      });
                                                    }

                                                    showToast("Clustered personnel request(s) sent successfully!", "success");
                                                    await showAlert(
                                                      "Clustered Request(s) Sent",
                                                      `Clustering request for ${currentPerson.firstName || ''} ${currentPerson.lastName || ''} (${prnToShare}) has been sent to the selected satellite school(s)!\n\nOnce accepted in their Request Center, the personnel will appear in their Roster as CLUSTERED.`
                                                    );
                                                  } catch (err) {
                                                    await showAlert("Share Error", "Failed to share personnel: " + err.message);
                                                  }
                                                }}
                                              >
                                                <FiLink size={13} style={{ marginRight: '6px' }} />Share to Clustered Schools
                                              </button>
                                              {!prnToShare && (
                                                <p className="field-help" style={{ color: 'var(--danger)' }}>Note: You must save this personnel profile first to generate a PRN before sharing.</p>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          <div>
                            <label>Date of First Day of Service</label>
                            <DatePickerDropdowns
                              value={currentPerson.firstServiceDate || ''}
                              onChange={(val) => handleFieldChange('firstServiceDate', val)}
                              maxDate={new Date()}
                            />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>Date of Last Promotion</label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                                <input
                                  type="checkbox"
                                  style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                                  checked={currentPerson.lastPromotionDate === 'N/A'}
                                  onChange={(e) => handleFieldChange('lastPromotionDate', e.target.checked ? 'N/A' : '')}
                                />
                                N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={currentPerson.lastPromotionDate === 'N/A' ? '' : (currentPerson.lastPromotionDate || '')}
                              onChange={(val) => handleFieldChange('lastPromotionDate', val)}
                              maxDate={new Date()}
                              minDate={currentPerson.firstServiceDate ? new Date(currentPerson.firstServiceDate + 'T00:00:00') : undefined}
                              disabled={currentPerson.lastPromotionDate === 'N/A'}
                            />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>Date of First Day in Current Station</label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                                <input
                                  type="checkbox"
                                  style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                                  checked={currentPerson.newStationDate === 'N/A'}
                                  onChange={(e) => handleFieldChange('newStationDate', e.target.checked ? 'N/A' : '')}
                                />
                                N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={currentPerson.newStationDate === 'N/A' ? '' : (currentPerson.newStationDate || '')}
                              onChange={(val) => handleFieldChange('newStationDate', val)}
                              maxDate={new Date()}
                              minDate={currentPerson.firstServiceDate ? new Date(currentPerson.firstServiceDate + 'T00:00:00') : undefined}
                              disabled={currentPerson.newStationDate === 'N/A'}
                            />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>Date of Last Lateral Movement</label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                                <input
                                  type="checkbox"
                                  style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                                  checked={currentPerson.lastLateralMovementDate === 'N/A'}
                                  onChange={(e) => handleFieldChange('lastLateralMovementDate', e.target.checked ? 'N/A' : '')}
                                />
                                N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={currentPerson.lastLateralMovementDate === 'N/A' ? '' : (currentPerson.lastLateralMovementDate || '')}
                              onChange={(val) => handleFieldChange('lastLateralMovementDate', val)}
                              maxDate={new Date()}
                              minDate={currentPerson.firstServiceDate ? new Date(currentPerson.firstServiceDate + 'T00:00:00') : undefined}
                              disabled={currentPerson.lastLateralMovementDate === 'N/A'}
                            />
                          </div>

                          <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                            {(() => {
                              const computed = computeStepIncrement(currentPerson.firstServiceDate, currentPerson.lastPromotionDate);
                              const currentStep = currentPerson.stepIncrement || computed.step || 1;

                              return (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ margin: 0 }}>Salary Step Increment</label>
                                    {currentStep !== computed.step && (
                                      <button
                                        type="button"
                                        onClick={() => handleFieldChange('stepIncrement', computed.step)}
                                        style={{
                                          background: '#E0F2FE',
                                          color: '#0284C7',
                                          border: '1px solid #BAE6FD',
                                          borderRadius: '6px',
                                          padding: '2px 8px',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          cursor: 'pointer'
                                        }}
                                        title="Restore auto-calculated step based on dates"
                                      >
                                        ↺ Reset to Auto (Step {computed.step})
                                      </button>
                                    )}
                                  </div>

                                  <div style={{
                                    display: 'flex',
                                    gap: '0',
                                    border: '1.5px solid var(--line)',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    marginTop: '4px'
                                  }}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map((step, idx) => {
                                      const isActive = currentStep === step;

                                      return (
                                        <button
                                          key={step}
                                          type="button"
                                          onClick={() => handleFieldChange('stepIncrement', step)}
                                          style={{
                                            flex: 1,
                                            padding: '10px 6px',
                                            border: 'none',
                                            borderLeft: idx > 0 ? '1.5px solid var(--line)' : 'none',
                                            background: isActive ? 'var(--blue, #0284c7)' : 'white',
                                            color: isActive ? 'white' : 'var(--navy)',
                                            fontWeight: isActive ? '800' : '600',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            lineHeight: 1.3,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '2px'
                                          }}
                                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f0f9ff'; }}
                                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'white'; }}
                                        >
                                          <span style={{ fontSize: '15px', fontWeight: '800' }}>{step}</span>
                                          <span style={{ fontSize: '9px', opacity: isActive ? 0.85 : 0.5, fontWeight: '700', letterSpacing: '0.03em' }}>
                                            STEP
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p className="field-help">Current: Step {currentStep} — Click any step to change.</p>
                                </>
                              );
                            })()}
                          </div>
                        </>
                      )}

                      {activeTab === 'education' && (
                        <>
                          <div className="profile-subsection">Educational Attainment</div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Highest Educational Attainment <span style={{ color: '#EF4444' }}>*</span></label>
                            {(() => {
                              const isTeachingOrRelated = ['teaching', 'teaching-related', 'TEACHING', 'TEACHING-RELATED'].includes(currentPerson.type) || ['TEACHING', 'TEACHING-RELATED'].includes(currentPerson.positionCategory);
                              const options = isTeachingOrRelated 
                                ? HIGHEST_EDUCATIONAL_ATTAINMENT_TEACHING_OPTIONS 
                                : HIGHEST_EDUCATIONAL_ATTAINMENT_NON_TEACHING_OPTIONS;

                              return (
                                <SearchableDropdown
                                  options={options}
                                  value={
                                    currentPerson.highestEducationalAttainment ||
                                    (() => {
                                      if (currentPerson.postGraduateDegree && !['NONE', 'N/A', ''].includes(currentPerson.postGraduateDegree)) {
                                        return String(currentPerson.postGraduateDegree).toUpperCase().includes('DOCTOR')
                                          ? 'DOCTORATE DEGREE (GRADUATED)'
                                          : "MASTER'S DEGREE (GRADUATED)";
                                      }
                                      const deg = String(currentPerson.collegeDegree || '').toUpperCase();
                                      if (deg.includes('ELEMENTARY')) return 'ELEMENTARY GRADUATE';
                                      if (deg.includes('HIGH SCHOOL')) return 'HIGH SCHOOL GRADUATE';
                                      if (deg.includes('SENIOR HIGH') || deg.includes('SHS')) return 'SENIOR HIGH SCHOOL GRADUATE';
                                      if (deg.includes('VOCATIONAL') || deg.includes('TECH-VOC')) return 'VOCATIONAL / TECH-VOC COURSE';
                                      if (deg.includes('COLLEGE UNDER')) return 'COLLEGE UNDERGRADUATE';
                                      if (deg && deg !== 'NONE' && deg !== 'N/A') return 'COLLEGE GRADUATE / BACCALAUREATE';
                                      return isTeachingOrRelated ? 'COLLEGE GRADUATE / BACCALAUREATE' : 'N/A';
                                    })()
                                  }
                                  onChange={(val) => {
                                    const updates = { highestEducationalAttainment: val };
                                    const isElemOrHSOrNA = ['ELEMENTARY GRADUATE', 'HIGH SCHOOL GRADUATE', 'N/A'].includes(val);
                                    const isSeniorHS = val === 'SENIOR HIGH SCHOOL GRADUATE';
                                    const isVocational = val === 'VOCATIONAL / TECH-VOC COURSE';
                                    const isCollegeOnly = ['COLLEGE GRADUATE / BACCALAUREATE', 'COLLEGE UNDERGRADUATE'].includes(val);

                                    if (isElemOrHSOrNA) {
                                      updates.shsTrack = '';
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                      updates.collegeDegree = '';
                                      updates.major = '';
                                      updates.minor = '';
                                      updates.postGraduateDegree = '';
                                      updates.postGraduateDiscipline = '';
                                    } else if (isSeniorHS) {
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                      updates.collegeDegree = '';
                                      updates.major = '';
                                      updates.minor = '';
                                      updates.postGraduateDegree = '';
                                      updates.postGraduateDiscipline = '';
                                    } else if (isVocational) {
                                      updates.shsTrack = '';
                                      updates.collegeDegree = '';
                                      updates.major = '';
                                      updates.minor = '';
                                      updates.postGraduateDegree = '';
                                      updates.postGraduateDiscipline = '';
                                    } else if (isCollegeOnly) {
                                      updates.shsTrack = '';
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                      updates.postGraduateDegree = '';
                                      updates.postGraduateDiscipline = '';
                                    } else if (val === "MASTER'S DEGREE (GRADUATED)") {
                                      updates.shsTrack = '';
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                      updates.postGraduateDegree = 'MASTERS DEGREE';
                                    } else if (val === "DOCTORATE DEGREE (GRADUATED)") {
                                      updates.shsTrack = '';
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                      updates.postGraduateDegree = 'DOCTORATE DEGREE';
                                    } else {
                                      updates.shsTrack = '';
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                    }
                                    handleMultipleFieldsChange(updates);
                                  }}
                                  placeholder="SELECT HIGHEST EDUCATIONAL ATTAINMENT..."
                                  required
                                />
                              );
                            })()}
                          </div>

                          {/* SHS Track if Senior High School */}
                          {currentPerson.highestEducationalAttainment === 'SENIOR HIGH SCHOOL GRADUATE' && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label>Senior High School Track <span style={{ color: '#EF4444' }}>*</span></label>
                              <SearchableDropdown
                                options={SHS_TRACK_OPTIONS}
                                value={currentPerson.shsTrack || ''}
                                onChange={(val) => handleFieldChange('shsTrack', val)}
                                placeholder="SELECT SHS TRACK..."
                                required
                              />
                            </div>
                          )}

                          {/* Vocational / Tech-Voc Course & NC Level */}
                          {currentPerson.highestEducationalAttainment === 'VOCATIONAL / TECH-VOC COURSE' && (
                            <>
                              <div>
                                <label>Vocational / TESDA Course <span style={{ color: '#EF4444' }}>*</span></label>
                                <SearchableDropdown
                                  options={TESDA_COURSES || Object.keys(TESDA_COURSE_TO_LEVELS_MAP)}
                                  value={currentPerson.vocationalCourse || ''}
                                  onChange={(val) => {
                                    const availableLevels = TESDA_COURSE_TO_LEVELS_MAP[val] || [];
                                    const nextLevel = availableLevels.length === 1 ? availableLevels[0] : (availableLevels.includes(currentPerson.vocationalLevel) ? currentPerson.vocationalLevel : '');
                                    handleMultipleFieldsChange({
                                      vocationalCourse: val,
                                      vocationalLevel: nextLevel
                                    });
                                  }}
                                  placeholder="SELECT TESDA / VOCATIONAL COURSE..."
                                  required
                                />
                              </div>

                              <div>
                                <label>NC Level / Qualification Level <span style={{ color: '#EF4444' }}>*</span></label>
                                <SearchableDropdown
                                  options={
                                    currentPerson.vocationalCourse && TESDA_COURSE_TO_LEVELS_MAP[currentPerson.vocationalCourse]
                                      ? TESDA_COURSE_TO_LEVELS_MAP[currentPerson.vocationalCourse]
                                      : TESDA_NC_LEVEL_OPTIONS
                                  }
                                  value={currentPerson.vocationalLevel || ''}
                                  onChange={(val) => handleFieldChange('vocationalLevel', val)}
                                  placeholder={
                                    currentPerson.vocationalCourse
                                      ? "SELECT NC LEVEL..."
                                      : "Select Vocational Course first..."
                                  }
                                  required
                                />
                              </div>
                            </>
                          )}

                          {/* College Degree if College, Master's, or Doctorate */}
                          {['COLLEGE GRADUATE / BACCALAUREATE', 'COLLEGE UNDERGRADUATE', "MASTER'S DEGREE (GRADUATED)", "DOCTORATE DEGREE (GRADUATED)"].includes(
                            currentPerson.highestEducationalAttainment || (currentPerson.collegeDegree ? 'COLLEGE GRADUATE / BACCALAUREATE' : '')
                          ) && (
                            <>
                              <div>
                                <label>College Degree / Baccalaureate <span style={{ color: '#EF4444' }}>*</span></label>
                                <SearchableDropdown
                                  options={COLLEGE_DEGREE_OPTIONS}
                                  value={currentPerson.collegeDegree || ''}
                                  onChange={(val) => {
                                    const d = (val || '').toUpperCase();
                                    const isEdu = val && val !== 'NONE' && val !== 'N/A' && (
                                      d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
                                    );
                                    if (!isEdu) {
                                      handleMultipleFieldsChange({ collegeDegree: val, major: '', minor: '' });
                                    } else {
                                      handleFieldChange('collegeDegree', val);
                                    }
                                  }}
                                  placeholder="Select college degree..."
                                  required
                                />
                              </div>

                              {(() => {
                                const d = (currentPerson.collegeDegree || '').toUpperCase();
                                const isEdu = currentPerson.collegeDegree && currentPerson.collegeDegree !== 'NONE' && currentPerson.collegeDegree !== 'N/A' && (
                                  d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
                                );
                                if (!isEdu) return null;
                                return (
                                  <>
                                    <div>
                                      <label>Major in Education <span style={{ color: '#EF4444' }}>*</span></label>
                                      <SearchableDropdown
                                        options={MAJOR_OPTIONS}
                                        value={currentPerson.major || ''}
                                        onChange={(val) => handleFieldChange('major', val)}
                                        placeholder="Select major..."
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label>Minor <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'normal' }}>(Optional)</span></label>
                                      <SearchableDropdown
                                        options={MINOR_OPTIONS}
                                        value={currentPerson.minor || ''}
                                        onChange={(val) => handleFieldChange('minor', val)}
                                        placeholder="Select minor subject (optional)..."
                                      />
                                    </div>
                                  </>
                                );
                              })()}
                            </>
                          )}

                          {/* Master's Degree Discipline(s) for Master's or Doctorate */}
                          {["MASTER'S DEGREE (GRADUATED)", "DOCTORATE DEGREE (GRADUATED)"].includes(currentPerson.highestEducationalAttainment) && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label>
                                Master's Degree Discipline(s) <span style={{ color: currentPerson.highestEducationalAttainment === "MASTER'S DEGREE (GRADUATED)" ? '#EF4444' : '#0284C7' }}>*</span>
                              </label>

                              {(() => {
                                const parseDiscs = (val) => {
                                  if (!val) return [];
                                  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
                                  if (typeof val === 'string') {
                                    const trimmed = val.trim();
                                    if (trimmed.startsWith('{')) {
                                      try {
                                        const obj = JSON.parse(trimmed);
                                        if (Array.isArray(obj.masters)) return obj.masters.map(s => String(s).trim()).filter(Boolean);
                                      } catch(e) {}
                                    }
                                    if (trimmed.startsWith('[')) {
                                      try {
                                        const arr = JSON.parse(trimmed);
                                        if (Array.isArray(arr)) return arr.map(s => String(s).trim()).filter(Boolean);
                                      } catch(e) {}
                                    }
                                    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
                                  }
                                  return [];
                                };

                                let list = Array.isArray(currentPerson.mastersDisciplines) && currentPerson.mastersDisciplines.length > 0
                                  ? currentPerson.mastersDisciplines
                                  : parseDiscs(currentPerson.mastersDiscipline || currentPerson.postGraduateDiscipline || currentPerson.post_graduate_discipline);

                                const updateDisciplines = (newList) => {
                                  const str = newList.join(', ');
                                  const docList = Array.isArray(currentPerson.doctorateDisciplines) ? currentPerson.doctorateDisciplines : [];
                                  const jsonStr = JSON.stringify({ masters: newList, doctorate: docList });
                                  const updates = {
                                    mastersDisciplines: newList,
                                    mastersDiscipline: str,
                                    postGraduateDiscipline: jsonStr,
                                    post_graduate_discipline: jsonStr
                                  };
                                  handleMultipleFieldsChange(updates);
                                };

                                return (
                                  <>
                                    {list.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                        {list.map((disc, index) => (
                                          <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50, #EFF6FF)', border: '1.5px solid var(--line, #BAE6FD)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--navy, #0F172A)', fontWeight: 'bold' }}>{disc}</span>
                                            <button
                                              type="button"
                                              style={{ background: 'transparent', border: 0, color: 'var(--blue, #0284C7)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                                              onClick={() => {
                                                const newList = list.filter((_, idx) => idx !== index);
                                                updateDisciplines(newList);
                                              }}
                                              title="Remove discipline"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                      <SearchableDropdown
                                        options={DISCIPLINE_OPTIONS}
                                        value=""
                                        onChange={(val) => {
                                          if (!val) return;
                                          if (!list.includes(val)) {
                                            updateDisciplines([...list, val]);
                                          }
                                        }}
                                        placeholder={list.length === 0 ? "+ SELECT OR TYPE MASTER'S DISCIPLINE..." : "+ ADD ANOTHER MASTER'S DISCIPLINE..."}
                                        allowCustom={true}
                                      />
                                    </div>
                                    <p className="field-help" style={{ marginTop: '6px', fontSize: '11px', color: '#64748B' }}>
                                      Select from preset disciplines or type a custom Master's discipline title and press Enter.
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Doctorate Degree Discipline(s) for Doctorate */}
                          {currentPerson.highestEducationalAttainment === "DOCTORATE DEGREE (GRADUATED)" && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label>
                                Doctorate Degree Discipline(s) <span style={{ color: '#EF4444' }}>*</span>
                              </label>

                              {(() => {
                                const parseDiscs = (val) => {
                                  if (!val) return [];
                                  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
                                  if (typeof val === 'string') {
                                    const trimmed = val.trim();
                                    if (trimmed.startsWith('{')) {
                                      try {
                                        const obj = JSON.parse(trimmed);
                                        if (Array.isArray(obj.doctorate)) return obj.doctorate.map(s => String(s).trim()).filter(Boolean);
                                      } catch(e) {}
                                    }
                                    if (trimmed.startsWith('[')) {
                                      try {
                                        const arr = JSON.parse(trimmed);
                                        if (Array.isArray(arr)) return arr.map(s => String(s).trim()).filter(Boolean);
                                      } catch(e) {}
                                    }
                                    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
                                  }
                                  return [];
                                };

                                let list = Array.isArray(currentPerson.doctorateDisciplines) && currentPerson.doctorateDisciplines.length > 0
                                  ? currentPerson.doctorateDisciplines
                                  : parseDiscs(currentPerson.doctorateDiscipline || currentPerson.postGraduateDiscipline || currentPerson.post_graduate_discipline);

                                const updateDisciplines = (newList) => {
                                  const str = newList.join(', ');
                                  const mList = Array.isArray(currentPerson.mastersDisciplines) ? currentPerson.mastersDisciplines : [];
                                  const jsonStr = JSON.stringify({ masters: mList, doctorate: newList });
                                  handleMultipleFieldsChange({
                                    doctorateDisciplines: newList,
                                    doctorateDiscipline: str,
                                    postGraduateDiscipline: jsonStr,
                                    post_graduate_discipline: jsonStr
                                  });
                                };

                                return (
                                  <>
                                    {list.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                        {list.map((disc, index) => (
                                          <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50, #EFF6FF)', border: '1.5px solid var(--line, #BAE6FD)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--navy, #0F172A)', fontWeight: 'bold' }}>{disc}</span>
                                            <button
                                              type="button"
                                              style={{ background: 'transparent', border: 0, color: 'var(--blue, #0284C7)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                                              onClick={() => {
                                                const newList = list.filter((_, idx) => idx !== index);
                                                updateDisciplines(newList);
                                              }}
                                              title="Remove discipline"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                      <SearchableDropdown
                                        options={DISCIPLINE_OPTIONS}
                                        value=""
                                        onChange={(val) => {
                                          if (!val) return;
                                          if (!list.includes(val)) {
                                            updateDisciplines([...list, val]);
                                          }
                                        }}
                                        placeholder={list.length === 0 ? "+ SELECT OR TYPE DOCTORATE DISCIPLINE..." : "+ ADD ANOTHER DOCTORATE DISCIPLINE..."}
                                        allowCustom={true}
                                      />
                                    </div>
                                    <p className="field-help" style={{ marginTop: '6px', fontSize: '11px', color: '#64748B' }}>
                                      Select from preset disciplines or type a custom Doctorate discipline title and press Enter.
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          <div className="profile-subsection">Civil Service and Professional Eligibilities</div>
                          <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                            <label>Eligibilities</label>

                            {/* List of currently selected eligibilities */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                              {(Array.isArray(currentPerson.eligibility)
                                ? currentPerson.eligibility
                                : String(currentPerson.eligibility || '').split(',').map(s => s.trim()).filter(Boolean)
                              ).map((el, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50)', border: '1.5px solid var(--line)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                  <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 'bold' }}>{el}</span>
                                  <button
                                    type="button"
                                    style={{ background: 'transparent', border: 0, color: 'var(--blue)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                                    onClick={() => {
                                      const currentList = Array.isArray(currentPerson.eligibility)
                                        ? currentPerson.eligibility
                                        : String(currentPerson.eligibility || '').split(',').map(s => s.trim()).filter(Boolean);
                                      const newList = currentList.filter((_, idx) => idx !== index);
                                      handleFieldChange('eligibility', newList.join(', '));
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>

                            {/* Dropdown to add a new eligibility */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <select
                                  value=""
                                  onChange={async (e) => {
                                    const selectedVal = e.target.value;
                                    if (!selectedVal) return;

                                    const currentList = Array.isArray(currentPerson.eligibility)
                                      ? currentPerson.eligibility
                                      : String(currentPerson.eligibility || '').split(',').map(s => s.trim()).filter(Boolean);

                                    const isDup = currentList.includes(selectedVal) || currentList.some(el => el.startsWith(selectedVal) && selectedVal.startsWith('RA 1080'));
                                    if (isDup) {
                                      await showAlert("Duplicate Entry", "This eligibility category has already been added.");
                                      return;
                                    }

                                    if (selectedVal === 'RA 1080 (OTHERS, PLEASE SPECIFY)') {
                                      setRa1080InputText('');
                                      setShowRa1080Modal(true);
                                    } else {
                                      handleFieldChange('eligibility', [...currentList, selectedVal].join(', '));
                                    }
                                  }}
                                  className={!currentPerson.eligibility ? 'empty-field' : ''}
                                  style={{
                                    maxWidth: '400px',
                                    background: (Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.length : String(currentPerson.eligibility || '').split(',').filter(Boolean).length) > 0 ? '#f0f9ff' : 'white',
                                    borderColor: (Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.length : String(currentPerson.eligibility || '').split(',').filter(Boolean).length) > 0 ? '#0284c7' : 'var(--line)',
                                    color: (Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.length : String(currentPerson.eligibility || '').split(',').filter(Boolean).length) > 0 ? '#0369a1' : 'var(--text)',
                                    fontWeight: (Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.length : String(currentPerson.eligibility || '').split(',').filter(Boolean).length) > 0 ? '600' : 'normal'
                                  }}
                                >
                                  <option value="">
                                    {(Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.length : String(currentPerson.eligibility || '').split(',').filter(Boolean).length) > 0
                                      ? `+ Add another eligibility (${Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.length : String(currentPerson.eligibility || '').split(',').filter(Boolean).length} added)...`
                                      : '+ Add Eligibility...'}
                                  </option>
                                <option value="LICENSURE EXAMINATION FOR TEACHERS">LICENSURE EXAMINATION FOR TEACHERS</option>
                                <option value="PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)">PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)</option>
                                <option value="PROVISIONAL TEACHERS">PROVISIONAL TEACHERS</option>
                                <option value="PROVISIONAL TEACHERS - DOST SCHOLAR GRADUATES">PROVISIONAL TEACHERS - DOST SCHOLAR GRADUATES</option>
                                <option value="REGISTERED GUIDANCE COUNSELOR">REGISTERED GUIDANCE COUNSELOR</option>
                                <option value="REGISTERED LIBRARIAN">REGISTERED LIBRARIAN</option>
                                <option value="REGISTERED NURSE">REGISTERED NURSE</option>
                                {(currentPerson.type === 'non-teaching' || currentPerson.type === 'teaching-related') && (
                                  <>
                                    <option value="CS - 1ST LEVEL (SUB-PROFESSIONAL)">CS - 1ST LEVEL (SUB-PROFESSIONAL)</option>
                                    <option value="CS - 2ND LEVEL (PROFESSIONAL)">CS - 2ND LEVEL (PROFESSIONAL)</option>
                                  </>
                                )}
                                <option value="RA 1080 (OTHERS, PLEASE SPECIFY)">RA 1080 (OTHERS, PLEASE SPECIFY)</option>
                                {currentPerson.type === 'non-teaching' && <option value="N/A">N/A</option>}
                              </select>
                            </div>

                            {/* PRC Specialization (Conditional on LET / PBET eligibility) */}
                            {(() => {
                              const elStr = (Array.isArray(currentPerson.eligibility) ? currentPerson.eligibility.join(',') : String(currentPerson.eligibility || '')).toUpperCase();
                              const isLetPbet = elStr.includes('LICENSURE EXAMINATION FOR TEACHERS') || elStr.includes('PROFESSIONAL BOARD EXAMINATION FOR TEACHERS') || elStr.includes('LET') || elStr.includes('PBET');
                              if (!isLetPbet) return null;
                              return (
                                <div style={{ marginTop: '16px' }}>
                                  <label>PRC Specialization</label>
                                  <SearchableDropdown
                                    options={PRC_SPECIALIZATION_OPTIONS}
                                    value={currentPerson.prcSpecialization || ''}
                                    onChange={(val) => handleFieldChange('prcSpecialization', val)}
                                    placeholder="Select specialization..."
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        </>
                      )}

                      {activeTab === 'development' && (
                        <>
                          <div className="profile-subsection">Standard Training Credentials</div>

                          {/* NEAP SECTION */}
                          <div className="credential-group" style={{ gridColumn: '1 / -1', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <label style={{ margin: 0 }}>NEAP Trainings</label>
                              <button className="btn secondary" style={{ minHeight: '34px' }} type="button" onClick={() => addTrainingRow('neapTrainingRows')}>
                                + Add NEAP Training
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {(currentPerson.neapTrainingRows || []).map((tr, index) => (
                                <div key={tr.clientKey || tr.id || index} className="multi-task-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 80px 80px 40px', gap: '8px', padding: '10px', background: '#fff', border: '1.5px solid var(--line)', borderRadius: '12px' }}>
                                  <div>
                                    <label>NEAP Training</label>
                                    <SearchableDropdown
                                      options={['OTHER (SPECIFY CUSTOM...)', ...NEAP_TRAINING_OPTIONS]}
                                      value={tr.title || ''}
                                      onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'title', val)}
                                      placeholder="SELECT NEAP TRAINING OR TYPE CUSTOM..."
                                      allowCustom={true}
                                    />
                                    {(tr.title === 'OTHER (SPECIFY CUSTOM...)' || (tr.title && !NEAP_TRAINING_OPTIONS.includes(tr.title))) && (
                                      <input
                                        type="text"
                                        placeholder="Type custom NEAP training title *"
                                        value={tr.title === 'OTHER (SPECIFY CUSTOM...)' ? '' : tr.title}
                                        onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'title', e.target.value.toUpperCase())}
                                        style={{ marginTop: '6px', fontSize: '13px', background: '#FFFBEB', borderColor: '#F59E0B' }}
                                        required
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <label>Start Date</label>
                                    <DatePickerDropdowns
                                      value={tr.startDate || ''}
                                      onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'startDate', val)}
                                      maxDate={new Date()}
                                    />
                                  </div>
                                  <div>
                                    <label>End Date</label>
                                    <DatePickerDropdowns
                                      value={tr.endDate || ''}
                                      onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'endDate', val)}
                                      maxDate={new Date()}
                                      minDate={tr.startDate ? new Date(tr.startDate.substring(0, 10) + 'T00:00:00') : null}
                                    />
                                  </div>
                                  <div>
                                    <label>No. of Days</label>
                                    <input value={tr.days || 0} disabled style={{ background: '#f1f5f9' }} />
                                  </div>
                                  <div>
                                    <label>Total Hours <span style={{ color: '#EF4444' }}>*</span></label>
                                    <input type="number" min="1" placeholder="Hours *" required value={tr.totalHours || ''} onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'totalHours', e.target.value ? Number(e.target.value) : '')} />
                                  </div>
                                  <button className="btn danger" style={{ minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" onClick={() => removeTrainingRow('neapTrainingRows', index)} title="Remove"><FiTrash2 size={14} /></button>
                                </div>
                              ))}
                              {(currentPerson.neapTrainingRows || []).length === 0 && (
                                <div style={{ padding: '15px', background: '#F0F9FF', color: 'var(--blue)', border: '1.5px solid var(--line)', borderRadius: '12px', fontSize: '13px', textAlign: 'center' }}>
                                  No NEAP trainings added yet. Click “Add NEAP Training” to encode credentials, inclusive dates, and hours.
                                </div>
                              )}
                            </div>
                          </div>

                          {/* TESDA / CERTIFICATION SECTION */}
                          <div className="credential-group" style={{ gridColumn: '1 / -1', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <label style={{ margin: 0 }}>TESDA NC / Certifications</label>
                              <button className="btn secondary" style={{ minHeight: '34px' }} type="button" onClick={() => addTrainingRow('certificationRows')}>
                                + Add TESDA / Certification
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {(currentPerson.certificationRows || []).map((tr, index) => (
                                <div key={tr.clientKey || tr.id || index} className="multi-task-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 80px 80px 40px', gap: '8px', padding: '10px', background: '#fff', border: '1.5px solid var(--line)', borderRadius: '12px' }}>
                                  <div>
                                    <label>TESDA / Certification</label>
                                    <SearchableDropdown
                                      options={TESDA_CERTIFICATION_OPTIONS}
                                      value={tr.title || ''}
                                      onChange={(val) => handleTrainingChange('certificationRows', index, 'title', val)}
                                      placeholder="SELECT TESDA NC / CERTIFICATION..."
                                    />
                                  </div>
                                  <div>
                                    <label>Start Date</label>
                                    <DatePickerDropdowns
                                      value={tr.startDate || ''}
                                      onChange={(val) => handleTrainingChange('certificationRows', index, 'startDate', val)}
                                      maxDate={new Date()}
                                    />
                                  </div>
                                  <div>
                                    <label>End Date</label>
                                    <DatePickerDropdowns
                                      value={tr.endDate || ''}
                                      onChange={(val) => handleTrainingChange('certificationRows', index, 'endDate', val)}
                                      maxDate={new Date()}
                                      minDate={tr.startDate ? new Date(tr.startDate.substring(0, 10) + 'T00:00:00') : null}
                                    />
                                  </div>
                                  <div>
                                    <label>No. of Days</label>
                                    <input value={tr.days || 0} disabled style={{ background: '#f1f5f9' }} />
                                  </div>
                                  <div>
                                    <label>Total Hours <span style={{ color: '#EF4444' }}>*</span></label>
                                    <input type="number" min="1" placeholder="Hours *" required value={tr.totalHours || ''} onChange={(e) => handleTrainingChange('certificationRows', index, 'totalHours', e.target.value ? Number(e.target.value) : '')} />
                                  </div>
                                  <button className="btn danger" style={{ minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" onClick={() => removeTrainingRow('certificationRows', index)} title="Remove"><FiTrash2 size={14} /></button>
                                </div>
                              ))}
                              {(currentPerson.certificationRows || []).length === 0 && (
                                <div style={{ padding: '15px', background: '#F0F9FF', color: 'var(--blue)', border: '1.5px solid var(--line)', borderRadius: '12px', fontSize: '13px', textAlign: 'center' }}>
                                  No TESDA NC / certification records added yet. Click “Add TESDA / Certification” to encode credentials, inclusive dates, and hours.
                                </div>
                              )}
                            </div>
                          </div>

                          {/* OTHER TRAININGS SECTION */}
                          <div className="credential-group" style={{ gridColumn: '1 / -1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <label style={{ margin: 0 }}>Other Trainings</label>
                              <button className="btn secondary" style={{ minHeight: '34px' }} type="button" onClick={() => addTrainingRow('otherTrainingRows')}>
                                + Add training
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {(currentPerson.otherTrainingRows || []).map((tr, index) => (
                                <div key={tr.clientKey || tr.id || index} className="multi-task-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 80px 80px 40px', gap: '8px', padding: '10px', background: '#fff', border: '1.5px solid var(--line)', borderRadius: '12px' }}>
                                  <div>
                                    <label>Training Title</label>
                                    <SearchableDropdown
                                      options={[
                                        'OTHER (SPECIFY CUSTOM...)',
                                        'SCHOOL-BASED INSET',
                                        'DIVISION TRAINING WORKSHOP',
                                        'REGIONAL MASS TRAINING',
                                        'LEARNING ACTION CELL',
                                        'RESEARCH CAPABILITY BUILDING',
                                        'DRRM TRAINING',
                                        'CHILD PROTECTION TRAINING',
                                        'MENTAL HEALTH AND PSYCHOSOCIAL SUPPORT'
                                      ]}
                                      value={tr.title || ''}
                                      onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'title', val)}
                                      placeholder="SELECT OTHER TRAINING OR TYPE CUSTOM..."
                                      allowCustom={true}
                                    />
                                    {(tr.title === 'OTHER (SPECIFY CUSTOM...)' || (tr.title && ![
                                      'SCHOOL-BASED INSET',
                                      'DIVISION TRAINING WORKSHOP',
                                      'REGIONAL MASS TRAINING',
                                      'LEARNING ACTION CELL',
                                      'RESEARCH CAPABILITY BUILDING',
                                      'DRRM TRAINING',
                                      'CHILD PROTECTION TRAINING',
                                      'MENTAL HEALTH AND PSYCHOSOCIAL SUPPORT'
                                    ].includes(tr.title))) && (
                                      <input
                                        type="text"
                                        placeholder="Type custom training title *"
                                        value={tr.title === 'OTHER (SPECIFY CUSTOM...)' ? '' : tr.title}
                                        onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'title', e.target.value.toUpperCase())}
                                        style={{ marginTop: '6px', fontSize: '13px', background: '#FFFBEB', borderColor: '#F59E0B' }}
                                        required
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <label>Start Date</label>
                                    <DatePickerDropdowns
                                      value={tr.startDate || ''}
                                      onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'startDate', val)}
                                      maxDate={new Date()}
                                    />
                                  </div>
                                  <div>
                                    <label>End Date</label>
                                    <DatePickerDropdowns
                                      value={tr.endDate || ''}
                                      onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'endDate', val)}
                                      maxDate={new Date()}
                                      minDate={tr.startDate ? new Date(tr.startDate.substring(0, 10) + 'T00:00:00') : null}
                                    />
                                  </div>
                                  <div>
                                    <label>No. of Days</label>
                                    <input value={tr.days || 0} disabled style={{ background: '#f1f5f9' }} />
                                  </div>
                                  <div>
                                    <label>Total Hours <span style={{ color: '#EF4444' }}>*</span></label>
                                    <input type="number" min="1" placeholder="Hours *" required value={tr.totalHours || ''} onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'totalHours', e.target.value ? Number(e.target.value) : '')} />
                                  </div>
                                  <button className="btn danger" style={{ minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" onClick={() => removeTrainingRow('otherTrainingRows', index)} title="Remove"><FiTrash2 size={14} /></button>
                                </div>
                              ))}
                              {(currentPerson.otherTrainingRows || []).length === 0 && (
                                <div style={{ padding: '15px', background: '#F0F9FF', color: 'var(--blue)', border: '1.5px solid var(--line)', borderRadius: '12px', fontSize: '13px', textAlign: 'center' }}>
                                  No other trainings added yet. Click “Add training” to encode inclusive dates and hours.
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                      {activeTab === 'teaching' && currentPerson.type !== 'non-teaching' && (
                        <>
                          <div className="profile-subsection">Teaching Assignment</div>
                          <div className="full" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                            <label style={{ fontWeight: 'bold' }}>Assigned Grade Levels (Teaching / Teaching-Related)</label>
                            <p className="field-help" style={{ marginBottom: '12px' }}>Select the grade levels this personnel is assigned to teach or manage.</p>

                            {/* List of currently selected grade levels as tags */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                              {(Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [])
                                .map(g => {
                                  const u = String(g || '').toUpperCase();
                                  if (u.includes('KINDER')) return 'Kinder';
                                  if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
                                  return g;
                                })
                                .filter(g => {
                                  const u = String(g).toUpperCase();
                                  return !u.includes('MULTI-GRADE') && !u.includes('MULTIGRADE') && !u.includes('MULTI GRADE') &&
                                         !u.includes('MONO-GRADE') && !u.includes('MONOGRADE') && !u.includes('MONO GRADE') &&
                                         u !== 'GRADE KINDER';
                                })
                                .map((grade, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50)', border: '1.5px solid var(--line)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                  <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 'bold' }}>{grade}</span>
                                  <button
                                    type="button"
                                    style={{ background: 'transparent', border: 0, color: 'var(--blue)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                                    onClick={() => {
                                      const currentList = (Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [])
                                        .map(g => {
                                          const u = String(g || '').toUpperCase();
                                          if (u.includes('KINDER')) return 'Kinder';
                                          if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
                                          return g;
                                        })
                                        .filter(g => {
                                          const u = String(g).toUpperCase();
                                          return !u.includes('MULTI-GRADE') && !u.includes('MULTIGRADE') && !u.includes('MULTI GRADE') &&
                                                 !u.includes('MONO-GRADE') && !u.includes('MONOGRADE') && !u.includes('MONO GRADE') &&
                                                 u !== 'GRADE KINDER';
                                        });
                                      const newList = currentList.filter((_, idx) => idx !== index);
                                      handleFieldChange('assignedGradeLevels', newList);
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              {(Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : []).filter(g => {
                                const u = String(g).toUpperCase();
                                return !u.includes('MULTI-GRADE') && !u.includes('MULTIGRADE') && !u.includes('MULTI GRADE') &&
                                       !u.includes('MONO-GRADE') && !u.includes('MONOGRADE') && !u.includes('MONO GRADE') &&
                                       u !== 'GRADE KINDER';
                              }).length === 0 && (
                                <span style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>No grade levels assigned yet.</span>
                              )}
                            </div>

                            {/* Dropdown to add a new grade level */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <select
                                value=""
                                onChange={async (e) => {
                                  const selectedVal = e.target.value;
                                  if (!selectedVal) return;

                                  const currentList = (Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [])
                                    .map(g => {
                                      const u = String(g || '').toUpperCase();
                                      if (u.includes('KINDER')) return 'Kinder';
                                      if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
                                      return g;
                                    })
                                    .filter(g => {
                                      const u = String(g).toUpperCase();
                                      return !u.includes('MULTI-GRADE') && !u.includes('MULTIGRADE') && !u.includes('MULTI GRADE') &&
                                             !u.includes('MONO-GRADE') && !u.includes('MONOGRADE') && !u.includes('MONO GRADE') &&
                                             u !== 'GRADE KINDER';
                                    });
                                  if (currentList.includes(selectedVal)) {
                                    await showAlert("Duplicate Entry", "This grade level has already been assigned.");
                                    return;
                                  }

                                  const newList = [...currentList, selectedVal];
                                  handleFieldChange('assignedGradeLevels', newList);
                                }}
                                style={{
                                  maxWidth: '400px',
                                  background: (Array.isArray(currentPerson.assignedGradeLevels) && currentPerson.assignedGradeLevels.length > 0) ? '#f0f9ff' : 'white',
                                  borderColor: (Array.isArray(currentPerson.assignedGradeLevels) && currentPerson.assignedGradeLevels.length > 0) ? '#0284c7' : 'var(--line)',
                                  color: (Array.isArray(currentPerson.assignedGradeLevels) && currentPerson.assignedGradeLevels.length > 0) ? '#0369a1' : 'var(--text)',
                                  fontWeight: (Array.isArray(currentPerson.assignedGradeLevels) && currentPerson.assignedGradeLevels.length > 0) ? '600' : 'normal'
                                }}
                              >
                                <option value="">
                                  {(Array.isArray(currentPerson.assignedGradeLevels) && currentPerson.assignedGradeLevels.length > 0)
                                    ? `+ Add another grade level (${currentPerson.assignedGradeLevels.length} assigned)...`
                                    : '+ Add Grade Level...'}
                                </option>
                                {(() => {
                                  const offerings = (schoolInfo?.curricularOffering || []).map(o => String(o).toUpperCase());
                                  const showElem = offerings.length === 0 || offerings.some(o => o.includes('ELEM') || o.includes('KINDER') || o.includes('PRIMARY') || o.includes('K-12') || o.includes('INTEGRATED'));
                                  const showJHS = offerings.length === 0 || offerings.some(o => o.includes('JHS') || o.includes('JUNIOR') || o.includes('SECONDARY') || o.includes('HIGH') || o.includes('K-12') || o.includes('INTEGRATED'));
                                  const showSHS = offerings.length === 0 || offerings.some(o => o.includes('SHS') || o.includes('SENIOR') || o.includes('K-12') || o.includes('INTEGRATED'));

                                  const list = [];
                                  if (showElem) {
                                    list.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6');
                                  }
                                  if (showJHS) {
                                    list.push('Grade 7', 'Grade 8', 'Grade 9', 'Grade 10');
                                  }
                                  if (showSHS) {
                                    list.push('Grade 11', 'Grade 12');
                                  }
                                  if (list.length === 0) {
                                    list.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12');
                                  }

                                  // Include SNED (NON-GRADED) and ALS for inclusive education faculty
                                  if (!list.includes('SNED (NON-GRADED)')) list.push('SNED (NON-GRADED)');
                                  if (!list.includes('ALS')) list.push('ALS');

                                  if (Array.isArray(classSections)) {
                                    classSections.forEach(s => {
                                      const rawG = String(s.gradeLevel || '').trim();
                                      const u = rawG.toUpperCase();
                                      if (
                                        !rawG ||
                                        u.includes('MULTI-GRADE') || u.includes('MULTIGRADE') || u.includes('MULTI GRADE') ||
                                        u.includes('MONO-GRADE') || u.includes('MONOGRADE') || u.includes('MONO GRADE') ||
                                        u === 'GRADE KINDER'
                                      ) {
                                        return;
                                      }
                                      let cleanG = rawG;
                                      if (u.includes('KINDER')) cleanG = 'Kinder';
                                      else if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) cleanG = 'SNED (NON-GRADED)';
                                      
                                      if (!list.includes(cleanG)) {
                                        list.push(cleanG);
                                      }
                                    });
                                  }

                                  const cleanList = list.filter(g => {
                                    const u = String(g).toUpperCase();
                                    return !u.includes('MULTI-GRADE') && !u.includes('MULTIGRADE') && !u.includes('MULTI GRADE') &&
                                           !u.includes('MONO-GRADE') && !u.includes('MONOGRADE') && !u.includes('MONO GRADE') &&
                                           u !== 'GRADE KINDER' && u !== 'NON-GRADED' && u !== 'NON GRADED' && u !== 'SNED';
                                  });

                                  // Ensure SNED (NON-GRADED) and ALS are present
                                  if (!cleanList.includes('SNED (NON-GRADED)')) cleanList.push('SNED (NON-GRADED)');
                                  if (!cleanList.includes('ALS')) cleanList.push('ALS');

                                  const selected = (Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [])
                                    .map(g => {
                                      const u = String(g || '').toUpperCase();
                                      if (u.includes('KINDER')) return 'Kinder';
                                      if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
                                      return g;
                                    })
                                    .filter(g => {
                                      const u = String(g).toUpperCase();
                                      return !u.includes('MULTI-GRADE') && !u.includes('MULTIGRADE') && !u.includes('MULTI GRADE') &&
                                             !u.includes('MONO-GRADE') && !u.includes('MONOGRADE') && !u.includes('MONO GRADE') &&
                                             u !== 'GRADE KINDER';
                                    });

                                  return cleanList.filter(item => !selected.includes(item)).map(g => (
                                    <option key={g} value={g}>{g}</option>
                                  ));
                                })()}
                              </select>
                            </div>
                          </div>
                        </>
                      )}

                      {activeTab === 'learning-area' && getPersonCategoryType(currentPerson) !== 'non-teaching' && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiBook size={16} /> Learning Area Matrix
                              </h3>
                              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                                Record taught primary learning areas across DepEd curriculum eras. Check a subject to enter total years taught.
                              </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                type="button"
                                className="btn secondary"
                                style={{ fontSize: '11px', padding: '6px 12px' }}
                                onClick={() => {
                                  const totalMax = getMaxAllowedServiceYears(currentPerson);
                                  let budget = totalMax;
                                  const newMap = {};
                                  const firstServiceYear = (() => {
                                    const d = currentPerson?.firstServiceDate || currentPerson?.first_service_date || '';
                                    if (!d) return null;
                                    const y = parseInt(d.substring(0, 4), 10);
                                    return isNaN(y) ? null : y;
                                  })();
                                  // Allocate budget starting from newest curriculum era
                                  const activeEras = [...CURRICULUM_ERAS].reverse();
                                  for (const era of activeEras) {
                                    const isDisabled = firstServiceYear !== null && firstServiceYear > era.endYear;
                                    if (!isDisabled && budget > 0) {
                                      for (const sub of PRIMARY_SUBJECTS) {
                                        if (budget > 0) {
                                          newMap[`${era.key}||${sub}`] = { checked: true, years: 1 };
                                          budget -= 1;
                                        }
                                      }
                                    }
                                  }
                                  setLearningAreaMap(newMap);
                                  localStorage.setItem(`draft_learning_areas_${currentPerson.id}`, JSON.stringify(newMap));
                                  if (setHasUnsavedChanges) setHasUnsavedChanges(true);
                                }}
                              >
                                Select All Active
                              </button>
                              <button
                                type="button"
                                className="btn secondary"
                                style={{ fontSize: '11px', padding: '6px 12px' }}
                                onClick={() => {
                                  setLearningAreaMap({});
                                  localStorage.setItem(`draft_learning_areas_${currentPerson.id}`, JSON.stringify({}));
                                  if (setHasUnsavedChanges) setHasUnsavedChanges(true);
                                }}
                              >
                                Clear All
                              </button>
                            </div>
                          </div>

                          {(() => {
                            const maxYears = getMaxAllowedServiceYears(currentPerson);
                            const totalAssigned = getTotalAssignedLearningYears(learningAreaMap);
                            const isAtCapacity = totalAssigned >= maxYears;
                            const serviceStartYear = currentPerson?.firstServiceDate || currentPerson?.first_service_date;

                            return (
                              <div style={{
                                background: isAtCapacity ? '#FEF3C7' : '#EFF6FF',
                                border: `1.5px solid ${isAtCapacity ? '#F59E0B' : '#93C5FD'}`,
                                padding: '12px 18px',
                                borderRadius: '14px',
                                fontSize: '12.5px',
                                color: isAtCapacity ? '#92400E' : '#1E40AF',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <FiInfo size={18} style={{ color: isAtCapacity ? '#D97706' : '#2563EB', flexShrink: 0 }} />
                                  <span>
                                    {serviceStartYear
                                      ? `Max allowed teaching experience: ${maxYears} ${maxYears === 1 ? 'Year' : 'Years'} (calculated from 1st Service Date: ${serviceStartYear.substring(0, 10)})`
                                      : 'Max allowed experience: 70 Years (specify Date of First Day of Service in Employment tab to enable dynamic service validation)'}
                                  </span>
                                </div>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: isAtCapacity ? '#FDE68A' : '#DBEAFE',
                                  padding: '4px 12px',
                                  borderRadius: '20px',
                                  fontSize: '11.5px',
                                  fontWeight: '700',
                                  color: isAtCapacity ? '#78350F' : '#1D4ED8'
                                }}>
                                  <span>Assigned: {totalAssigned} / {maxYears} yrs</span>
                                  {isAtCapacity && <span style={{ color: '#B45309' }}>(Max Reached - Unchecked Locked)</span>}
                                </div>
                              </div>
                            );
                          })()}

                          {learningAreaLoading ? (
                            <p style={{ padding: '1rem', color: 'var(--muted)' }}>Loading learning area matrix...</p>
                          ) : (
                            <div style={{ overflowX: 'auto', border: '1.5px solid var(--line)', borderRadius: '14px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid var(--line)' }}>
                                    {/* Y Axis Header (Curriculum Era) */}
                                    <th style={{ position: 'sticky', left: 0, background: '#F8FAFC', padding: '12px 16px', textAlign: 'left', zIndex: 3, minWidth: '240px', maxWidth: '300px', fontWeight: '800', color: 'var(--navy)', borderRight: '2px solid var(--line)' }}>
                                      Curriculum Era (Y) ↓ / Primary Subject (X) →
                                    </th>
                                    {/* X Axis Headers (8 Primary Subjects) */}
                                    {PRIMARY_SUBJECTS.map(sub => (
                                      <th key={sub} style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '800', color: 'var(--navy)', borderRight: '1px solid var(--line)', minWidth: '110px' }}>
                                        {sub}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    const firstServiceYear = (() => {
                                      const d = currentPerson?.firstServiceDate || currentPerson?.first_service_date || '';
                                      if (!d) return null;
                                      const y = parseInt(d.substring(0, 4), 10);
                                      return isNaN(y) ? null : y;
                                    })();
                                    const totalMax = getMaxAllowedServiceYears(currentPerson);
                                    const currentTotal = getTotalAssignedLearningYears(learningAreaMap);
                                    const isCapacityFull = currentTotal >= totalMax;

                                    return CURRICULUM_ERAS.map(era => {
                                      const isDisabledEra = firstServiceYear !== null && firstServiceYear > era.endYear;

                                      return (
                                        <tr 
                                          key={era.key} 
                                          style={{ 
                                            borderBottom: '1px solid var(--line)',
                                            background: isDisabledEra ? '#F1F5F9' : '#FFFFFF',
                                            opacity: isDisabledEra ? 0.65 : 1
                                          }}
                                        >
                                          {/* Y Axis Row Value (Curriculum Era) */}
                                          <td style={{ position: 'sticky', left: 0, background: isDisabledEra ? '#F1F5F9' : '#FFFFFF', padding: '12px 16px', fontWeight: '800', color: isDisabledEra ? '#64748B' : 'var(--navy)', zIndex: 2, borderRight: '2px solid var(--line)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              <span>{era.label}</span>
                                              {isDisabledEra && (
                                                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                  <FiLock size={9} /> Prior to Service Start ({firstServiceYear})
                                                </span>
                                              )}
                                            </div>
                                          </td>

                                          {/* X Axis Matrix Cells for 8 Primary Subjects */}
                                          {PRIMARY_SUBJECTS.map(sub => {
                                            const cellKey = `${era.key}||${sub}`;
                                            const cellData = learningAreaMap[cellKey];
                                            const isChecked = !!cellData?.checked;
                                            const isCheckboxDisabled = currentPerson.isShared || isDisabledEra || (!isChecked && isCapacityFull);

                                            return (
                                              <td key={sub} style={{ textAlign: 'center', padding: '10px 8px', borderRight: '1px solid var(--line)', background: isChecked && !isDisabledEra ? '#EFF6FF' : 'transparent' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => handleToggleLearningAreaCell(era.key, sub)}
                                                    disabled={isCheckboxDisabled}
                                                    title={!isChecked && isCapacityFull ? `Max allowed service years (${totalMax} yrs) reached. Cannot add more subjects.` : undefined}
                                                    style={{ cursor: isCheckboxDisabled ? 'not-allowed' : 'pointer', width: '18px', height: '18px', accentColor: '#0284C7', opacity: !isChecked && isCapacityFull ? 0.35 : 1 }}
                                                  />
                                                  {isChecked && !isDisabledEra && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                                      {(() => {
                                                        const cellMax = getCellMaxYears(era.key, sub, currentPerson, learningAreaMap);
                                                        return (
                                                          <input
                                                            type="number"
                                                            min="1"
                                                            max={cellMax}
                                                            value={cellData.years || 1}
                                                            onInput={(e) => {
                                                              if (e.target.value.length > 2) {
                                                                e.target.value = e.target.value.slice(0, 2);
                                                              }
                                                              if (parseInt(e.target.value, 10) > cellMax) {
                                                                e.target.value = String(cellMax);
                                                              }
                                                            }}
                                                            onChange={(e) => handleYearsChange(era.key, sub, e.target.value)}
                                                            disabled={currentPerson.isShared || isDisabledEra}
                                                            style={{ width: '42px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', padding: '2px', border: '1.5px solid #0284C7', borderRadius: '4px', background: '#FFFFFF' }}
                                                          />
                                                        );
                                                      })()}
                                                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--navy)' }}>yr{cellData.years > 1 ? 's' : ''}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                    </div>

                    {!currentPerson.isShared && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px', borderTop: '1.5px solid var(--line)', paddingTop: '15px', alignItems: 'center' }}>
                        <button className="btn" type="button" onClick={handleSaveChangesDirectly} style={{ background: '#0284c7', borderColor: '#0284c7', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <FiSave size={14} /> <span>Save Changes</span>
                        </button>
                        <button className="btn secondary" type="button" onClick={handleValidateOnly} style={{ borderColor: 'var(--blue)', color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '800' }}>
                          <FiCheckCircle size={14} /> <span>Validate</span>
                        </button>
                        <button className="btn secondary" type="button" onClick={handleDuplicate} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <FiCopy size={14} /> <span>Duplicate</span>
                        </button>
                        <div style={{ marginLeft: 'auto' }}>
                          <button className="btn danger" type="button" onClick={handleDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <FiTrash2 size={14} /> <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
      {showRa1080Modal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '450px', padding: '24px', background: 'white', borderRadius: '16px', border: '1.5px solid var(--line)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div className="modal-head" style={{ border: 0, padding: 0, marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--navy)' }}>Specify RA 1080 Details</h2>
            </div>
            <div className="modal-body" style={{ padding: 0, marginBottom: '20px' }}>
              <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
                Please specify the exact board exam or profession name under Republic Act 1080 (e.g., REGISTERED SOCIAL WORKER, MECHANICAL ENGINEER).
              </p>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Mechanical Engineer"
                value={ra1080InputText}
                onChange={(e) => setRa1080InputText(e.target.value)}
                style={{ width: '100%' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ra1080InputText.trim()) {
                    const currentList = Array.isArray(currentPerson.eligibility)
                      ? currentPerson.eligibility
                      : String(currentPerson.eligibility || '').split(',').map(s => s.trim()).filter(Boolean);
                    handleFieldChange('eligibility', [...currentList, `RA 1080 (${ra1080InputText.trim().toUpperCase()})`].join(', '));
                    setShowRa1080Modal(false);
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn secondary" type="button" onClick={() => setShowRa1080Modal(false)}>
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                disabled={!ra1080InputText.trim()}
                onClick={() => {
                  const currentList = Array.isArray(currentPerson.eligibility)
                    ? currentPerson.eligibility
                    : String(currentPerson.eligibility || '').split(',').map(s => s.trim()).filter(Boolean);
                  handleFieldChange('eligibility', [...currentList, `RA 1080 (${ra1080InputText.trim().toUpperCase()})`].join(', '));
                  setShowRa1080Modal(false);
                }}
              >
                Add Eligibility
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DepEd Email Warning & Policy Info Modal */}
      <DepEdEmailInfoModal 
        isOpen={isEmailInfoOpen}
        onClose={() => setIsEmailInfoOpen(false)}
      />
    

{/* High-Clarity Personnel Validation Checklist Modal */}
      {validationModal.isOpen && (
        <div 
          className="modal-backdrop" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.7)', 
            backdropFilter: 'blur(5px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000,
            padding: '20px' 
          }}
          onClick={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '580px', 
              width: '100%', 
              background: '#ffffff', 
              borderRadius: '24px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', 
              overflow: 'hidden',
              border: '2px solid #fed7aa',
              animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              padding: '22px 28px',
              borderBottom: '1.5px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: '#fef3c7',
                  border: '2px solid #f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d97706',
                  flexShrink: 0
                }}>
                  <FiAlertCircle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#92400e' }}>
                    Validation Checklist Needed
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#b45309' }}>
                    Required profile information must be completed before proceeding.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#92400e',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Personnel Being Checked Banner */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '14px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #bae6fd'
                  }}>
                    <FiUser size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Faculty Profile Being Checked
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                      {validationModal.personName}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569' }}>
                      {validationModal.position} • <span style={{ color: '#0284c7', fontWeight: '700' }}>{validationModal.department}</span>
                    </div>
                  </div>
                </div>

                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '800',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                  {validationModal.errors.length} Missing Field{validationModal.errors.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Instructions */}
              <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                The following fields currently have <strong>no inputted data</strong>. Please click a field below to jump directly to its tab:
              </p>

              {/* Missing Fields List / Grid */}
              <div style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                gap: '8px',
                paddingRight: '4px'
              }}>
                {validationModal.errors.map((err, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (err.tab && setActiveTab) {
                        setActiveTab(err.tab);
                      }
                      setValidationModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    style={{
                      padding: '10px 14px',
                      background: '#fff1f2',
                      border: '1.5px solid #fecdd3',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Click to jump to ${err.category} tab`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#e11d48', fontSize: '14px', fontWeight: '900' }}>•</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#9f1239' }}>
                        {err.label}
                      </span>
                    </div>
                    {err.category && (
                      <span style={{
                        fontSize: '9px',
                        fontWeight: '800',
                        color: '#be123c',
                        background: '#ffe4e6',
                        padding: '2px 6px',
                        borderRadius: '6px',
                        textTransform: 'uppercase'
                      }}>
                        {err.category}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
                  style={{
                    padding: '10px 22px',
                    fontSize: '13px',
                    fontWeight: '800',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  Complete Fields ➔
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal: Incomplete Personnel Restriction Modal for ALL Personnel */}
      {allPersonnelValidationModal.isOpen && (
        <div 
          className="modal-backdrop" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(5px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000,
            padding: '20px' 
          }}
          onClick={() => setAllPersonnelValidationModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '640px', 
              width: '100%', 
              background: '#ffffff', 
              borderRadius: '24px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', 
              overflow: 'hidden',
              border: '2px solid #fca5a5',
              animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)',
              padding: '22px 28px',
              borderBottom: '1.5px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: '#fef2f2',
                  border: '2px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0
                }}>
                  <FiAlertCircle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#991b1b' }}>
                    All Faculty Profiles Must Be Complete
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                    DepEd eSF7 requires all school personnel profiles to be completed before proceeding to Organized Classes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllPersonnelValidationModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#991b1b',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{
                background: '#fff7ed',
                border: '1.5px solid #ffedd5',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#9a3412' }}>
                  {allPersonnelValidationModal.incompleteList.length} of {allPersonnelValidationModal.totalPersonnel} personnel have missing required information.
                </span>
                <span style={{
                  background: '#ea580c',
                  color: 'white',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '800'
                }}>
                  Action Required
                </span>
              </div>

              <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                Click on any faculty member below to open their profile and complete their missing fields:
              </p>

              {/* Incomplete Personnel List */}
              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingRight: '4px'
              }}>
                {allPersonnelValidationModal.incompleteList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setActivePersonnelId(item.id);
                      setAllPersonnelValidationModal(prev => ({ ...prev, isOpen: false }));
                      setValidationModal({
                        isOpen: true,
                        personName: item.personName,
                        position: item.position,
                        department: item.department,
                        errors: item.errors
                      });
                    }}
                    style={{
                      padding: '12px 16px',
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#0284c7';
                      e.currentTarget.style.background = '#f0f9ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#475569'
                      }}>
                        <FiUser size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
                          {item.personName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {item.position} • {item.department}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '800',
                        color: '#dc2626',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        padding: '4px 10px',
                        borderRadius: '12px'
                      }}>
                        {item.errors.length} missing field{item.errors.length !== 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        Fix Profile ➔
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setAllPersonnelValidationModal(prev => ({ ...prev, isOpen: false }))}
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: '700' }}
                >
                  Close & Complete Roster
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    
    </section>
  );
}
