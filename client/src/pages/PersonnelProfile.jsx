import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { reportError } from '../services/errorAlert';
import SearchableDropdown from '../components/SearchableDropdown';
import DepEdEmailInfoModal from '../components/DepEdEmailInfoModal';
import PortalHeader from '../components/PortalHeader';
import useDirtyGuard from '../hooks/useDirtyGuard';
import { confirmServerDraftSaved } from '../services/screenSave';
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
  FiMapPin,
  FiPlus,
  FiTag,
  FiShield,
  FiRefreshCw
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
import { NATIONAL_FUND_ELIGIBLE_NATURES } from '@shared/scheduleRules.js';

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
export const getEffectiveCollegeDegrees = (p) => {
  if (!p) return [];
  if (Array.isArray(p.collegeDegrees) && p.collegeDegrees.length > 0) {
    return p.collegeDegrees.map(d => typeof d === 'string' ? { collegeDegree: d, major: '', minor: '' } : d);
  }
  if (p.collegeDegree && !['NONE', 'N/A', ''].includes(String(p.collegeDegree).toUpperCase())) {
    return [{
      collegeDegree: p.collegeDegree,
      major: p.major || '',
      minor: p.minor || ''
    }];
  }
  return [];
};

export const getEffectivePostGradDisciplines = (p) => {
  if (!p) return { mastersWithUnits: [], mastersGraduated: [], doctorateWithUnits: [], doctorateGraduated: [] };
  
  let mastersWithUnits = Array.isArray(p.mastersWithUnitsDisciplines) ? p.mastersWithUnitsDisciplines : [];
  let mastersGraduated = Array.isArray(p.mastersGraduatedDisciplines) ? p.mastersGraduatedDisciplines : [];
  let doctorateWithUnits = Array.isArray(p.doctorateWithUnitsDisciplines) ? p.doctorateWithUnitsDisciplines : [];
  let doctorateGraduated = Array.isArray(p.doctorateGraduatedDisciplines) ? p.doctorateGraduatedDisciplines : [];

  if (mastersWithUnits.length === 0 && mastersGraduated.length === 0 && doctorateWithUnits.length === 0 && doctorateGraduated.length === 0) {
    const raw = p.postGraduateDiscipline || p.post_graduate_discipline || '';
    if (raw) {
      if (typeof raw === 'object' && raw !== null) {
        mastersWithUnits = Array.isArray(raw.mastersWithUnits) ? raw.mastersWithUnits : [];
        mastersGraduated = Array.isArray(raw.mastersGraduated) ? raw.mastersGraduated : [];
        doctorateWithUnits = Array.isArray(raw.doctorateWithUnits) ? raw.doctorateWithUnits : [];
        doctorateGraduated = Array.isArray(raw.doctorateGraduated) ? raw.doctorateGraduated : [];
        if (mastersWithUnits.length === 0 && mastersGraduated.length === 0 && Array.isArray(raw.masters)) {
          const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
          if (attainment.includes('WITH UNITS')) {
            mastersWithUnits = raw.masters;
          } else {
            mastersGraduated = raw.masters;
          }
        }
        if (doctorateWithUnits.length === 0 && doctorateGraduated.length === 0 && Array.isArray(raw.doctorate)) {
          const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
          if (attainment.includes('WITH UNITS')) {
            doctorateWithUnits = raw.doctorate;
          } else {
            doctorateGraduated = raw.doctorate;
          }
        }
      } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            mastersWithUnits = Array.isArray(parsed.mastersWithUnits) ? parsed.mastersWithUnits : [];
            mastersGraduated = Array.isArray(parsed.mastersGraduated) ? parsed.mastersGraduated : [];
            doctorateWithUnits = Array.isArray(parsed.doctorateWithUnits) ? parsed.doctorateWithUnits : [];
            doctorateGraduated = Array.isArray(parsed.doctorateGraduated) ? parsed.doctorateGraduated : [];
            if (mastersWithUnits.length === 0 && mastersGraduated.length === 0 && Array.isArray(parsed.masters)) {
              const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
              if (attainment.includes('WITH UNITS')) {
                mastersWithUnits = parsed.masters;
              } else {
                mastersGraduated = parsed.masters;
              }
            }
            if (doctorateWithUnits.length === 0 && doctorateGraduated.length === 0 && Array.isArray(parsed.doctorate)) {
              const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
              if (attainment.includes('WITH UNITS')) {
                doctorateWithUnits = parsed.doctorate;
              } else {
                doctorateGraduated = parsed.doctorate;
              }
            }
          } catch(e) {}
        } else {
          const split = trimmed.split(',').map(s => s.trim()).filter(Boolean);
          const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
          if (attainment.includes('DOCTOR')) {
            if (attainment.includes('WITH UNITS')) doctorateWithUnits = split;
            else doctorateGraduated = split;
          } else {
            if (attainment.includes('WITH UNITS')) mastersWithUnits = split;
            else mastersGraduated = split;
          }
        }
      }
    }
  }

  if (mastersWithUnits.length === 0 && mastersGraduated.length === 0 && p.mastersDiscipline) {
    const list = String(p.mastersDiscipline).split(',').map(s => s.trim()).filter(Boolean);
    const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
    if (attainment === "MASTER'S DEGREE (WITH UNITS)") mastersWithUnits = list;
    else mastersGraduated = list;
  }
  if (doctorateWithUnits.length === 0 && doctorateGraduated.length === 0 && p.doctorateDiscipline) {
    const list = String(p.doctorateDiscipline).split(',').map(s => s.trim()).filter(Boolean);
    const attainment = String(p.highestEducationalAttainment || '').toUpperCase();
    if (attainment === "DOCTORATE DEGREE (WITH UNITS)") doctorateWithUnits = list;
    else doctorateGraduated = list;
  }

  return { mastersWithUnits, mastersGraduated, doctorateWithUnits, doctorateGraduated };
};

export const getEffectiveDegreeRows = (p) => {
  if (!p) return [];
  const collegeList = getEffectiveCollegeDegrees(p);
  if (collegeList.length > 0) {
    return collegeList.map((d, idx) => ({
      clientKey: `baccalaureate-${idx}`,
      level: 'BACCALAUREATE',
      collegeDegree: d.collegeDegree || '',
      major: d.major || '',
      minor: d.minor || ''
    }));
  }
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

export const PostGradDisciplineSection = ({
  title,
  levelLabel,
  isRequired,
  graduatedList = [],
  withUnitsList = [],
  defaultStatus = 'GRADUATED',
  onAdd,
  onRemove
}) => {
  const [selectedDisc, setSelectedDisc] = useState('');
  const [status, setStatus] = useState(defaultStatus);

  useEffect(() => {
    setStatus(defaultStatus);
  }, [defaultStatus]);

  const handleAdd = () => {
    if (!selectedDisc || !selectedDisc.trim()) return;
    onAdd(selectedDisc.trim().toUpperCase(), status);
    setSelectedDisc('');
  };

  const handleSelectDiscipline = (val) => {
    if (val && val.trim()) {
      onAdd(val.trim().toUpperCase(), status);
      setSelectedDisc('');
    } else {
      setSelectedDisc('');
    }
  };

  const totalCount = graduatedList.length + withUnitsList.length;

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy, #0F172A)', margin: 0 }}>
          {title} {isRequired && <span style={{ color: '#EF4444' }}>*</span>}
        </label>
        {totalCount > 0 && (
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--blue, #0284C7)', background: 'var(--blue-50, #EFF6FF)', padding: '2px 8px', borderRadius: '8px' }}>
            {totalCount} {totalCount === 1 ? 'Discipline' : 'Disciplines'}
          </span>
        )}
      </div>

      <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {totalCount > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {graduatedList.map((disc, idx) => (
              <div 
                key={`grad-${idx}`} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  background: '#F0FDF4', 
                  border: '1.5px solid #BBF7D0', 
                  borderRadius: '12px', 
                  padding: '6px 12px', 
                  gap: '8px' 
                }}
              >
                <span style={{ fontSize: '12px', color: '#14532D', fontWeight: 'bold' }}>{disc}</span>
                <span style={{ fontSize: '10px', color: '#16A34A', background: '#DCFCE7', padding: '1px 6px', borderRadius: '6px', fontWeight: '700' }}>
                  GRADUATED
                </span>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 0, color: '#16A34A', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                  onClick={() => onRemove(disc, 'GRADUATED')}
                  title="Remove discipline"
                >
                  ✕
                </button>
              </div>
            ))}
            {withUnitsList.map((disc, idx) => (
              <div 
                key={`units-${idx}`} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  background: '#EFF6FF', 
                  border: '1.5px solid #BAE6FD', 
                  borderRadius: '12px', 
                  padding: '6px 12px', 
                  gap: '8px' 
                }}
              >
                <span style={{ fontSize: '12px', color: '#0F172A', fontWeight: 'bold' }}>{disc}</span>
                <span style={{ fontSize: '10px', color: '#0284C7', background: '#E0F2FE', padding: '1px 6px', borderRadius: '6px', fontWeight: '700' }}>
                  WITH UNITS
                </span>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 0, color: '#0284C7', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                  onClick={() => onRemove(disc, 'WITH UNITS')}
                  title="Remove discipline"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
            <SearchableDropdown
              options={DISCIPLINE_OPTIONS}
              value={selectedDisc}
              onChange={handleSelectDiscipline}
              placeholder={`+ SELECT OR TYPE ${levelLabel.toUpperCase()} DISCIPLINE...`}
              allowCustom={true}
            />
          </div>
          
          <div style={{ flex: '0 1 210px', minWidth: '180px' }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1.5px solid var(--line, #CBD5E1)',
                background: '#FFFFFF',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--navy, #0F172A)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="GRADUATED">GRADUATED (COMPLETED)</option>
              <option value="WITH UNITS">WITH UNITS (ONGOING)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedDisc}
            style={{
              height: '42px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: selectedDisc ? '#0284C7' : '#E2E8F0',
              color: selectedDisc ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '8px',
              padding: '0 16px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: selectedDisc ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap'
            }}
          >
            <FiPlus size={14} /> Add Discipline
          </button>
        </div>
        <p className="field-help" style={{ margin: 0, fontSize: '11px', color: '#64748B' }}>
          Selecting or typing a discipline title automatically adds it as <strong>{status === 'GRADUATED' ? 'Graduated' : 'With Units'}</strong>. You can add multiple disciplines.
        </p>
      </div>
    </div>
  );
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
  check('firstName', "First Name", !!(p.firstName?.trim() || p.first_name?.trim()), "Identity", "identity");
  const hasMiddle = !!(p.middleName?.trim() || p.middle_name?.trim() || p.noMiddleName || p.no_middle_name || p.middleName === 'N/A' || p.middle_name === 'N/A');
  check('middleName', "Middle Name", hasMiddle, "Identity", "identity");
  check('lastName', "Last Name", !!(p.lastName?.trim() || p.last_name?.trim()), "Identity", "identity");

  // 2. Demographics & IDs
  check('sexAtBirth', "Sex at Birth", !!(p.sexAtBirth || p.sex || p.sex_at_birth), "Personal", "personal");
  check('civilStatus', "Civil Status", !!(p.civilStatus || p.civil_status), "Personal", "personal");
  check('religion', "Religion", !!(p.religion || p.religion === 'N/A' || p.religion === 'NONE' || true), "Personal", "personal");
  check('ethnicGroup', "Ethnic Group", !!(p.ethnicGroup || p.ethnic_group || p.ethnicGroup === 'N/A' || p.ethnic_group === 'N/A' || true), "Personal", "personal");

  const hasBirthdate = !!(p.birthdate || p.birthDate || p.birth_date);
  const bdateStr = p.birthdate || p.birthDate || p.birth_date;
  const ageVal = hasBirthdate ? getAge(bdateStr) : null;
  const validAge = hasBirthdate && ageVal !== null && ageVal >= 15;
  check('birthdate', "Valid Birthdate (Must be at least 15 yrs old)", validAge, "Personal", "personal");

  const cleanPhilsys = String(p.philsysNo || p.philsys_no || '').replace(/\D/g, '');
  const hasValidPhilsys = !!(p.noPhilsys || p.no_philsys || cleanPhilsys.length === 16);
  const isPermAppt = String(p.natureOfAppointment || p.nature_of_appointment || '').toUpperCase() === 'REGULAR PERMANENT';
  const hasDiscrepancyAllowed = Boolean(p.allowEmailDiscrepancy || p.allow_email_discrepancy);
  const hasValidDepedEmail = isPermAppt
    ? (!!p.depedEmail?.trim() && p.depedEmail !== 'N/A' && !p.noDepedEmail && !p.no_deped_email && validateDepEdEmail(p.depedEmail, p.firstName, p.lastName, p.middleName, hasDiscrepancyAllowed).isValid)
    : !!(p.noDepedEmail || p.no_deped_email || p.depedEmail === 'N/A' || p.deped_email === 'N/A' || (p.depedEmail?.trim() && validateDepEdEmail(p.depedEmail, p.firstName, p.lastName, p.middleName, hasDiscrepancyAllowed).isValid));
  check('depedEmail', isPermAppt ? "DepEd Official Email (@deped.gov.ph)" : "DepEd Official Email (or N/A)", hasValidDepedEmail, "Employment", "employment");
  check('tin', "TIN Number", !!(p.noTin || p.no_tin || p.tin?.trim()), "Personal", "personal");

  // 3. Employment
  check('position', "Plantilla Position", !!(p.position?.trim() || p.plantilla_position?.trim() || p.position_title?.trim()), "Employment", "employment");
  check('fundSource', "Fund Source", !!(p.fundSource || p.fund_source), "Employment", "employment");
  check('natureOfAppointment', "Nature of Appointment", !!(p.natureOfAppointment || p.nature_of_appointment), "Employment", "employment");
  check('hiringArrangement', "Hiring Arrangement", !!(p.hiringArrangement || p.hiring_arrangement), "Employment", "employment");
  check('deploymentStatus', "Status of Deployment", !!(p.deploymentStatus || p.deployment_status), "Employment", "employment");

  const depStatus = String(p.deploymentStatus || p.deployment_status || '').toUpperCase();
  if (['CLUSTERED', 'REASSIGNED', 'BORROWED'].includes(depStatus)) {
    const hasOtherSchool = !!(p.clusteredSchools || (Array.isArray(p.assignedSchools) && p.assignedSchools.length > 0) || (Array.isArray(p.assigned_schools) && p.assigned_schools.length > 0));
    check('assignedSchools', "Other School Assignment", hasOtherSchool, "Employment", "employment");
  }

  const hasFirstService = !!(p.firstServiceDate || p.first_service_date);
  check('firstServiceDate', "Date of First Day of Service", hasFirstService, "Employment", "employment");
  
  const hasLastPromotion = !!(p.lastPromotionDate || p.last_promotion_date || p.lastPromotionDate === 'N/A' || p.last_promotion_date === 'N/A' || hasFirstService);
  check('lastPromotionDate', "Date of Last Promotion", hasLastPromotion, "Employment", "employment");

  const hasLastLateral = !!(p.lastLateralMovementDate || p.last_lateral_movement_date || p.lastLateralMovementDate === 'N/A' || p.last_lateral_movement_date === 'N/A' || true);
  check('lastLateralMovementDate', "Date of Last Lateral Movement", hasLastLateral, "Employment", "employment");

  const hasNewStation = !!(p.newStationDate || p.new_station_date || p.newStationDate === 'N/A' || p.new_station_date === 'N/A' || hasFirstService);
  check('newStationDate', "Date of First Day in Current Station", hasNewStation, "Employment", "employment");

  const hasStepConfirmed = !!(p.stepIncrementConfirmed || p.step_increment_confirmed || (p.stepIncrement && Number(p.stepIncrement) >= 1) || (p.step_increment && Number(p.step_increment) >= 1));
  check('stepIncrementConfirmed', "Salary Step Increment Confirmation", hasStepConfirmed, "Employment", "employment");

  // 4. Education / Qualifications
  const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
  const isNonTeaching = ['non-teaching', 'NON-TEACHING'].includes(pType) || ['non-teaching', 'NON-TEACHING'].includes(p.type) || ['NON-TEACHING'].includes(p.positionCategory);

  const attainment = p.highestEducationalAttainment || p.highest_educational_attainment || '';

  if (!isNonTeaching) {
    check('highestEducationalAttainment', "Highest Educational Attainment", !!attainment, "Education", "education");
  }

  const isSHS = attainment === 'SENIOR HIGH SCHOOL GRADUATE';
  const isVocational = attainment === 'VOCATIONAL / TECH-VOC COURSE';
  const isCollege = ['COLLEGE GRADUATE / BACCALAUREATE', 'COLLEGE UNDERGRADUATE'].includes(attainment);
  const isPostGrad = [
    "MASTER'S DEGREE",
    "DOCTORATE DEGREE",
    "MASTER'S DEGREE (WITH UNITS)",
    "MASTER'S DEGREE (GRADUATED)",
    "DOCTORATE DEGREE (WITH UNITS)",
    "DOCTORATE DEGREE (GRADUATED)"
  ].includes(attainment) || attainment.includes("MASTER") || attainment.includes("DOCTOR");

  if (isSHS) {
    check('shsTrack', "Senior High School Track", !!(p.shsTrack || p.shs_track), "Education", "education");
  }
  if (isVocational) {
    check('vocationalCourse', "Vocational / TESDA Course", !!(p.vocationalCourse?.trim() || p.vocational_course?.trim()), "Education", "education");
    check('vocationalLevel', "NC Level / Qualification Level", !!(p.vocationalLevel?.trim() || p.vocational_level?.trim()), "Education", "education");
  }
  if (isCollege || isPostGrad || (!isNonTeaching && !isSHS && !isVocational)) {
    const degrees = getEffectiveCollegeDegrees(p);
    const hasValidDegree = degrees.length > 0
      ? degrees.some(d => d.collegeDegree?.trim() && d.collegeDegree !== 'NONE' && d.collegeDegree !== 'N/A')
      : !!(p.collegeDegree?.trim() || p.college_degree?.trim());
    check('collegeDegree', "College Degree / Baccalaureate", hasValidDegree, "Education", "education");

    let allEduHaveMajors = true;
    let hasAnyEdu = false;
    if (degrees.length > 0) {
      degrees.forEach(d => {
        const str = String(d.collegeDegree || '').toUpperCase();
        const isEdu = str && str !== 'NONE' && str !== 'N/A' && (
          str.includes('EDUCATION') || str.includes('SPECIAL ED') || str.includes('KINDERGARTEN') || str.includes('EARLY CHILDHOOD')
        );
        if (isEdu) {
          hasAnyEdu = true;
          if (!d.major?.trim()) allEduHaveMajors = false;
        }
      });
    } else {
      const d = String(p.collegeDegree || p.college_degree || '').toUpperCase();
      const isEdu = d && d !== 'NONE' && d !== 'N/A' && (
        d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
      );
      if (isEdu) {
        hasAnyEdu = true;
        if (!p.major?.trim()) allEduHaveMajors = false;
      }
    }
    if (hasAnyEdu) {
      check('major', "Major in Education", allEduHaveMajors, "Education", "education");
    }
  }

  const postGrads = getEffectivePostGradDisciplines(p);
  if (attainment.includes("MASTER")) {
    const hasDisc = postGrads.mastersWithUnits.length > 0 || postGrads.mastersGraduated.length > 0 || (Array.isArray(p.mastersDisciplines) && p.mastersDisciplines.length > 0) || !!p.mastersDiscipline?.trim();
    check('postGraduateDiscipline', "Master's Discipline", hasDisc, "Education", "education");
  } else if (attainment.includes("DOCTOR")) {
    const hasDisc = postGrads.doctorateWithUnits.length > 0 || postGrads.doctorateGraduated.length > 0 || (Array.isArray(p.doctorateDisciplines) && p.doctorateDisciplines.length > 0) || !!p.doctorateDiscipline?.trim();
    check('doctorateDiscipline', "Doctorate Discipline", hasDisc, "Education", "education");
  }

  check('eligibility', "Civil Service / PRC Eligibility", !!(p.eligibility && (!Array.isArray(p.eligibility) || p.eligibility.length > 0)), "Education", "education");
  const eligStr = (Array.isArray(p.eligibility) ? p.eligibility.join(',') : String(p.eligibility || '')).toUpperCase();
  if (eligStr.includes('LET') || eligStr.includes('PBET') || eligStr.includes('LICENSURE EXAMINATION FOR TEACHERS') || eligStr.includes('PROFESSIONAL BOARD EXAMINATION FOR TEACHERS')) {
    check('prcSpecialization', "PRC Specialization", !!(p.prcSpecialization?.trim() || p.prc_specialization?.trim()), "Education", "education");
  }

  // 5. Professional Development / Trainings (for teaching & teaching-related)
  if (!isNonTeaching) {
    const allTrainings = [...(p.neapTrainingRows || []), ...(p.certificationRows || []), ...(p.otherTrainingRows || [])];
    if (allTrainings.length > 0) {
      const validHours = allTrainings.every(tr => tr.totalHours && Number(tr.totalHours) > 0);
      if (!validHours) {
        check('trainingHours', "Total Hours for all L&D / Training records", false, "L&D", "development");
      }
    }
  }

  // 6. Teaching Assignment (for teaching & teaching-related personnel)
  if (!isNonTeaching) {
    const rawGrades = p.assignedGradeLevels || p.assigned_grade_levels || p.gradeLevelsTaught || p.grade_levels_taught;
    const assignedGrades = Array.isArray(rawGrades)
      ? rawGrades
      : (typeof rawGrades === 'string' && rawGrades.trim() ? rawGrades.split(',').map(s => s.trim()).filter(Boolean) : []);

    const isPersonSchoolHead = p.isSchoolHead === true || p.is_school_head === true ||
      String(p.position || p.plantilla_position || p.position_title || '').toUpperCase().includes('PRINCIPAL') ||
      String(p.designation || '').toUpperCase().includes('PRINCIPAL') ||
      String(p.designation || '').toUpperCase().includes('SCHOOL HEAD');

    const isRelatedTeaching = p.type === 'teaching-related' || p.type === 'related-teaching' || p.type === 'related' ||
      String(p.positionCategory || p.position_category || '').toUpperCase() === 'RELATED TEACHING';

    const hasExplicitNoLoad = (isPersonSchoolHead || isRelatedTeaching) && (p.hasNoTeachingLoad === true || p.has_no_teaching_load === true);
    const hasAssignedGrades = (assignedGrades.length > 0) || hasExplicitNoLoad;

    check('assignedGradeLevels', "Assigned Grade Level(s)", hasAssignedGrades, "Teaching", "teaching");
  }

  const total = required.length;
  const completed = total - errors.length;
  const percentage = total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;

  return { total, completed, percentage, errors };
};

export const getTeachingPrerequisitesValidationErrors = (p) => {
  if (!p) return [];
  const pos = p.position || p.plantilla_position || p.position_title || '';
  const pType = detectPersonnelTypeFromPosition(pos) || p.type || 'teaching';
  const isNonTeaching = ['non-teaching', 'NON-TEACHING'].includes(pType) || ['non-teaching', 'NON-TEACHING'].includes(p.type) || ['NON-TEACHING'].includes(p.positionCategory);

  // Non-teaching personnel are strictly exempt from blocking Organized Classes
  if (isNonTeaching) return [];

  const errors = [];
  const check = (id, label, isPassed, category, tab) => {
    if (!isPassed) {
      errors.push({ id, label, category, tab });
    }
  };

  // 1. Employment Details
  check('position', "Plantilla Position", !!(p.position?.trim() || p.plantilla_position?.trim() || p.position_title?.trim()), "Employment", "employment");
  check('fundSource', "Fund Source", !!(p.fundSource || p.fund_source), "Employment", "employment");
  check('natureOfAppointment', "Nature of Appointment", !!(p.natureOfAppointment || p.nature_of_appointment), "Employment", "employment");
  check('hiringArrangement', "Hiring Arrangement", !!(p.hiringArrangement || p.hiring_arrangement), "Employment", "employment");
  check('deploymentStatus', "Status of Deployment", !!(p.deploymentStatus || p.deployment_status), "Employment", "employment");

  const depStatus = String(p.deploymentStatus || p.deployment_status || '').toUpperCase();
  if (['CLUSTERED', 'REASSIGNED', 'BORROWED'].includes(depStatus)) {
    const hasOtherSchool = !!(p.clusteredSchools || (Array.isArray(p.assignedSchools) && p.assignedSchools.length > 0) || (Array.isArray(p.assigned_schools) && p.assigned_schools.length > 0));
    check('assignedSchools', "Other School Assignment", hasOtherSchool, "Employment", "employment");
  }

  check('firstServiceDate', "Date of First Day of Service", !!(p.firstServiceDate || p.first_service_date), "Employment", "employment");
  const hasStepConfirmed = !!(p.stepIncrementConfirmed || p.step_increment_confirmed || (p.stepIncrement && Number(p.stepIncrement) >= 1) || (p.step_increment && Number(p.step_increment) >= 1));
  check('stepIncrementConfirmed', "Salary Step Increment Confirmation", hasStepConfirmed, "Employment", "employment");

  // 2. Teaching Assignment
  const rawGrades = p.assignedGradeLevels || p.assigned_grade_levels || p.gradeLevelsTaught || p.grade_levels_taught;
  const assignedGrades = Array.isArray(rawGrades)
    ? rawGrades
    : (typeof rawGrades === 'string' && rawGrades.trim() ? rawGrades.split(',').map(s => s.trim()).filter(Boolean) : []);

  const isPersonSchoolHead = p.isSchoolHead === true || p.is_school_head === true ||
    String(p.position || p.plantilla_position || p.position_title || '').toUpperCase().includes('PRINCIPAL') ||
    String(p.designation || '').toUpperCase().includes('PRINCIPAL') ||
    String(p.designation || '').toUpperCase().includes('SCHOOL HEAD');

  const isRelatedTeaching = p.type === 'teaching-related' || p.type === 'related-teaching' || p.type === 'related' ||
    String(p.positionCategory || p.position_category || '').toUpperCase() === 'RELATED TEACHING';

  const hasExplicitNoLoad = (isPersonSchoolHead || isRelatedTeaching) && (p.hasNoTeachingLoad === true || p.has_no_teaching_load === true);
  const hasAssignedGrades = (assignedGrades.length > 0) || hasExplicitNoLoad;

  check('assignedGradeLevels', "Assigned Grade Level(s)", hasAssignedGrades, "Teaching", "teaching");

  return errors;
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

function DatePickerDropdowns({ value, onChange, disabled = false, maxDate, minDate, required = false, placement = 'top' }) {
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

  // Calendar logic
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-based

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const currentMaxYear = parsedMaxDate ? parsedMaxDate.getFullYear() : new Date().getFullYear();
  const currentMinYear = parsedMinDate ? parsedMinDate.getFullYear() : (currentMaxYear - 80);

  const isPrevDisabled = Boolean(minDateStr && formatDate(new Date(year, month, 0)) < minDateStr.substring(0, 7) + '-01');
  const isNextDisabled = Boolean(maxDateStr && formatDate(new Date(year, month + 1, 1)) > maxDateStr);

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

  const isToday = (cellDate) => {
    return formatDate(cellDate) === formatDate(new Date());
  };

  const isRed = required && !cleanValue;

  const yearOptions = [];
  for (let y = currentMaxYear; y >= currentMinYear; y--) {
    yearOptions.push(y);
  }

  const [actualPlacement, setActualPlacement] = React.useState(placement);

  React.useEffect(() => {
    if (showCalendar && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const calendarHeight = 360;

      if (placement === 'bottom') {
        if (spaceBelow < 200 && spaceAbove >= calendarHeight) {
          setActualPlacement('top');
        } else {
          setActualPlacement('bottom');
        }
      } else if (placement === 'top') {
        if (spaceAbove < calendarHeight) {
          setActualPlacement('bottom');
        } else {
          setActualPlacement('top');
        }
      } else {
        if (spaceAbove >= calendarHeight && spaceAbove > spaceBelow) {
          setActualPlacement('top');
        } else {
          setActualPlacement('bottom');
        }
      }
    } else {
      setActualPlacement(placement);
    }
  }, [showCalendar, placement]);

  const isTop = actualPlacement === 'top';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', zIndex: showCalendar ? 99999 : 'auto' }}>
      {/* Input box trigger */}
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

      {/* Custom Calendar Dropdown Card — Top Layer & Smart Placement */}
      {showCalendar && (
        <div style={{
          position: 'absolute',
          bottom: isTop ? '100%' : 'auto',
          top: isTop ? 'auto' : '100%',
          left: '0',
          marginBottom: isTop ? '8px' : '0',
          marginTop: isTop ? '0' : '8px',
          width: '300px',
          background: 'white',
          border: '1.5px solid var(--line)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 12px 24px -6px rgba(0,0,0,0.15)',
          padding: '16px',
          zIndex: 999999,
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
              gap: '6px'
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
                  fontWeight: '700',
                  color: 'var(--navy)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit',
                  paddingRight: '4px'
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
                  fontWeight: '700',
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
    resolveBorrowedPersonnel,
    savePersonnelChanges,
    classSections,
    schoolInfo,
    showToast,
    showAlert,
    showConfirm,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    districtSchools,
    loadDistrictSchools,
    outgoingRequests,
    requestHistory,
    refreshRequests,
    completeNode,
    setActiveView,
    registerAutoSaveHandler
  } = useApp();

  const [activeTab, setActiveTab] = useState('identity');
  const [isEmailInfoOpen, setIsEmailInfoOpen] = useState(false);
  const [isConfirmDiscrepancyModalOpen, setIsConfirmDiscrepancyModalOpen] = useState(false);
  const [confirmDiscrepancyInput, setConfirmDiscrepancyInput] = useState('');

  useEffect(() => {
    const activeId = schoolInfo?.schoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    if (activeId && loadDistrictSchools) {
      loadDistrictSchools(activeId, schoolInfo?.division);
    }
  }, [schoolInfo?.schoolId, schoolInfo?.division, activeTab]);
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

  const currentPersonDirty = Boolean(
    editPerson && dbPerson && JSON.stringify(editPerson) !== JSON.stringify(dbPerson)
  ) || Boolean(dbPerson && localStorage.getItem(`draft_personnel_${dbPerson.id}`));

  const anyOtherDrafts = useMemo(() => {
    return (personnel || []).some(p => p.id !== dbPerson?.id && localStorage.getItem(`draft_personnel_${p.id}`));
  }, [personnel, dbPerson?.id]);

  const isDirty = currentPersonDirty || anyOtherDrafts;

  const handleDiscard = useCallback(() => {
    if (dbPerson) {
      localStorage.removeItem(`draft_personnel_${dbPerson.id}`);
      localStorage.removeItem(`draft_learning_areas_${dbPerson.id}`);
      setEditPerson(dbPerson);
    }
  }, [dbPerson]);

  const runSaveRef = useRef(() => Promise.resolve({ ok: true })); // the page's one save, shared with the unsaved-changes dialog
  const { confirmAction } = useDirtyGuard({
    screenId: 'personnel_profile',
    isDirty,
    onDiscard: handleDiscard,
    onSave: () => runSaveRef.current()
  });

  useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_personnel_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let personObj = dbPerson;
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          // Preserve all fields from parsed draft, while giving precedence to draft's explicit values
          personObj = {
            ...dbPerson,
            ...parsed,
            noTin: parsed.noTin !== undefined ? parsed.noTin : (parsed.no_tin !== undefined ? parsed.no_tin : (dbPerson.noTin !== undefined ? dbPerson.noTin : !!dbPerson.no_tin)),
            no_tin: parsed.noTin !== undefined ? parsed.noTin : (parsed.no_tin !== undefined ? parsed.no_tin : (dbPerson.noTin !== undefined ? dbPerson.noTin : !!dbPerson.no_tin)),
            noPhilsys: parsed.noPhilsys !== undefined ? parsed.noPhilsys : (parsed.no_philsys !== undefined ? parsed.no_philsys : (dbPerson.noPhilsys !== undefined ? dbPerson.noPhilsys : !!dbPerson.no_philsys)),
            no_philsys: parsed.noPhilsys !== undefined ? parsed.noPhilsys : (parsed.no_philsys !== undefined ? parsed.no_philsys : (dbPerson.noPhilsys !== undefined ? dbPerson.noPhilsys : !!dbPerson.no_philsys)),
            lastPromotionDate: parsed.lastPromotionDate !== undefined ? parsed.lastPromotionDate : (parsed.last_promotion_date !== undefined ? parsed.last_promotion_date : (dbPerson.lastPromotionDate !== undefined ? dbPerson.lastPromotionDate : dbPerson.last_promotion_date || '')),
            last_promotion_date: parsed.lastPromotionDate !== undefined ? parsed.lastPromotionDate : (parsed.last_promotion_date !== undefined ? parsed.last_promotion_date : (dbPerson.lastPromotionDate !== undefined ? dbPerson.lastPromotionDate : dbPerson.last_promotion_date || '')),
            newStationDate: parsed.newStationDate !== undefined ? parsed.newStationDate : (parsed.new_station_date !== undefined ? parsed.new_station_date : (dbPerson.newStationDate !== undefined ? dbPerson.newStationDate : dbPerson.new_station_date || '')),
            new_station_date: parsed.newStationDate !== undefined ? parsed.newStationDate : (parsed.new_station_date !== undefined ? parsed.new_station_date : (dbPerson.newStationDate !== undefined ? dbPerson.newStationDate : dbPerson.new_station_date || '')),
            lastLateralMovementDate: parsed.lastLateralMovementDate !== undefined ? parsed.lastLateralMovementDate : (parsed.last_lateral_movement_date !== undefined ? parsed.last_lateral_movement_date : (dbPerson.lastLateralMovementDate !== undefined ? dbPerson.lastLateralMovementDate : dbPerson.last_lateral_movement_date || '')),
            last_lateral_movement_date: parsed.lastLateralMovementDate !== undefined ? parsed.lastLateralMovementDate : (parsed.last_lateral_movement_date !== undefined ? parsed.last_lateral_movement_date : (dbPerson.lastLateralMovementDate !== undefined ? dbPerson.lastLateralMovementDate : dbPerson.last_lateral_movement_date || ''))
          };
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      // Ensure all fields and learning areas are preserved
      const laMap = personObj.learningAreaMap || personObj.matrix_data || personObj.matrixData || dbPerson.learningAreaMap || dbPerson.matrix_data || dbPerson.matrixData;
      if (laMap && typeof laMap === 'object' && Object.keys(laMap).length > 0) {
        personObj.learningAreaMap = laMap;
        personObj.matrix_data = laMap;
        personObj.matrixData = laMap;
        try {
          localStorage.setItem(`draft_learning_areas_${dbPerson.id}`, JSON.stringify(laMap));
        } catch (e) {}
      }

      // Ensure Education degree rows & post-grad disciplines
      if (!Array.isArray(personObj.degreeRows) || personObj.degreeRows.length === 0) {
        const dRows = personObj.collegeDegrees || personObj.college_degrees || dbPerson.degreeRows || dbPerson.collegeDegrees || dbPerson.college_degrees;
        if (Array.isArray(dRows) && dRows.length > 0) {
          personObj.degreeRows = dRows;
        } else if (personObj.collegeDegree || dbPerson.collegeDegree) {
          personObj.degreeRows = [{
            collegeDegree: personObj.collegeDegree || dbPerson.collegeDegree,
            major: personObj.major || dbPerson.major || '',
            minor: personObj.minor || dbPerson.minor || ''
          }];
        }
      }
      if (!personObj.collegeDegree && personObj.degreeRows?.[0]?.collegeDegree) {
        personObj.collegeDegree = personObj.degreeRows[0].collegeDegree;
        personObj.major = personObj.degreeRows[0].major || '';
        personObj.minor = personObj.degreeRows[0].minor || '';
      }

      // Ensure Trainings / L&D rows
      if (!Array.isArray(personObj.neapTrainingRows) || personObj.neapTrainingRows.length === 0) {
        const rows = personObj.neap_training_rows || dbPerson.neapTrainingRows || dbPerson.neap_training_rows;
        if (Array.isArray(rows)) personObj.neapTrainingRows = rows;
      }
      if (!Array.isArray(personObj.certificationRows) || personObj.certificationRows.length === 0) {
        const rows = personObj.certification_rows || dbPerson.certificationRows || dbPerson.certification_rows;
        if (Array.isArray(rows)) personObj.certificationRows = rows;
      }
      if (!Array.isArray(personObj.otherTrainingRows) || personObj.otherTrainingRows.length === 0) {
        const rows = personObj.other_training_rows || dbPerson.otherTrainingRows || dbPerson.other_training_rows;
        if (Array.isArray(rows)) personObj.otherTrainingRows = rows;
      }

      // Ensure Teaching Assignment grade levels
      const gl = personObj.assignedGradeLevels || personObj.gradeLevelsTaught || personObj.assigned_grade_levels || personObj.grade_levels_taught || dbPerson.assignedGradeLevels || dbPerson.gradeLevelsTaught || dbPerson.assigned_grade_levels || dbPerson.grade_levels_taught;
      if (Array.isArray(gl) && gl.length > 0) {
        personObj.assignedGradeLevels = gl;
        personObj.gradeLevelsTaught = gl;
        personObj.assigned_grade_levels = gl;
        personObj.grade_levels_taught = gl;
      }

      // Ensure Employment dates & step increments
      if (!personObj.firstServiceDate && (personObj.first_service_date || dbPerson.firstServiceDate || dbPerson.first_service_date)) {
        personObj.firstServiceDate = personObj.first_service_date || dbPerson.firstServiceDate || dbPerson.first_service_date;
      }
      if (personObj.lastPromotionDate === undefined) {
        personObj.lastPromotionDate = personObj.last_promotion_date !== undefined ? personObj.last_promotion_date : (dbPerson.lastPromotionDate !== undefined ? dbPerson.lastPromotionDate : dbPerson.last_promotion_date || '');
      }
      if (personObj.newStationDate === undefined) {
        personObj.newStationDate = personObj.new_station_date !== undefined ? personObj.new_station_date : (dbPerson.newStationDate !== undefined ? dbPerson.newStationDate : dbPerson.new_station_date || '');
      }
      if (personObj.lastLateralMovementDate === undefined) {
        personObj.lastLateralMovementDate = personObj.last_lateral_movement_date !== undefined ? personObj.last_lateral_movement_date : (dbPerson.lastLateralMovementDate !== undefined ? dbPerson.lastLateralMovementDate : dbPerson.last_lateral_movement_date || '');
      }
      if (personObj.noTin === undefined) {
        personObj.noTin = !!(personObj.no_tin !== undefined ? personObj.no_tin : (dbPerson.noTin !== undefined ? dbPerson.noTin : dbPerson.no_tin));
      }
      personObj.no_tin = !!personObj.noTin;
      if (personObj.noPhilsys === undefined) {
        personObj.noPhilsys = !!(personObj.no_philsys !== undefined ? personObj.no_philsys : (dbPerson.noPhilsys !== undefined ? dbPerson.noPhilsys : dbPerson.no_philsys));
      }
      personObj.no_philsys = !!personObj.noPhilsys;
      if (personObj.stepIncrement && (personObj.step_increment || dbPerson.stepIncrement || dbPerson.step_increment)) {
        personObj.stepIncrement = personObj.step_increment || dbPerson.stepIncrement || dbPerson.step_increment;
      }
      if (personObj.stepIncrementConfirmed === undefined && (personObj.step_increment_confirmed !== undefined || dbPerson.stepIncrementConfirmed !== undefined || dbPerson.step_increment_confirmed !== undefined)) {
        personObj.stepIncrementConfirmed = personObj.step_increment_confirmed !== undefined ? personObj.step_increment_confirmed : (dbPerson.stepIncrementConfirmed !== undefined ? dbPerson.stepIncrementConfirmed : dbPerson.step_increment_confirmed);
      }

      if (!personObj.employeeNo && (personObj.employee_no || dbPerson.employeeNo || dbPerson.employee_no)) {
        personObj.employeeNo = personObj.employee_no || dbPerson.employeeNo || dbPerson.employee_no;
        personObj.employee_no = personObj.employeeNo;
      }
      if (!personObj.prcSpecialization && (personObj.prc_specialization || dbPerson.prcSpecialization || dbPerson.prc_specialization)) {
        personObj.prcSpecialization = personObj.prc_specialization || dbPerson.prcSpecialization || dbPerson.prc_specialization;
        personObj.prc_specialization = personObj.prcSpecialization;
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

  const currentPersonRef = useRef(currentPerson);
  useEffect(() => {
    currentPersonRef.current = currentPerson;
  }, [currentPerson]);

  // Register auto-save handler on navigation (e.g. clicking Node Map)
  useEffect(() => {
    if (!registerAutoSaveHandler) return;
    return registerAutoSaveHandler('personnel_profile', async () => {
      const p = currentPersonRef.current;
      if (!p || !p.id) return false;
      try {
        const draftKey = `draft_personnel_${p.id}`;
        localStorage.setItem(draftKey, JSON.stringify(p));
        return true;
      } catch (e) {
        console.warn('[PersonnelProfile Auto-Save Notice]:', e);
      }
      return false;
    });
  }, [registerAutoSaveHandler]);

  // Personnel who are Reassigned Out from Mother School (Workload tracked at receiving school, full editing in Mother School)
  const isReassignedOutInMotherSchool = false;

  // Inter-school Reassignment Rejection Status
  const isReassignedRejected = useMemo(() => {
    if (!currentPerson) return false;
    if (currentPerson.reassignmentStatus === 'rejected' || currentPerson.requestStatus === 'rejected') return true;
    const depStatus = String(currentPerson.deploymentStatus || currentPerson.deployment_status || '').toUpperCase();
    if (depStatus.includes('REJECTED')) return true;

    const pId = String(currentPerson.id || '').replace(/^(PER-|PRN-)/i, '').trim();
    const prn = String(currentPerson.prn || currentPerson.profilingCode || '').replace(/^PRN-/i, '').trim();
    const pFn = String(currentPerson.firstName || currentPerson.first_name || '').trim().toUpperCase();
    const pLn = String(currentPerson.lastName || currentPerson.last_name || '').trim().toUpperCase();

    const allReqs = [...(outgoingRequests || []), ...(requestHistory || [])];
    const matched = allReqs.find(req => {
      const reqPId = String(req.personnel_id || req.personnelId || '').replace(/^(PER-|PRN-)/i, '').trim();
      if (pId && reqPId && (pId === reqPId || reqPId.endsWith(pId) || pId.endsWith(reqPId))) return true;
      if (prn && reqPId && (prn === reqPId || reqPId.endsWith(prn) || prn.endsWith(reqPId))) return true;
      const reqName = String(req.personnel_name || req.personnelName || '').toUpperCase();
      if (pLn && pFn && reqName && reqName.includes(pLn) && reqName.includes(pFn)) return true;
      return false;
    });

    return matched ? String(matched.status || '').toLowerCase() === 'rejected' : false;
  }, [currentPerson, outgoingRequests, requestHistory]);

  // Unresolved Borrowed Personnel Prompt State
  const isBorrowedUnresolved = useMemo(() => {
    if (!currentPerson) return false;
    const st = String(currentPerson.deploymentStatus || currentPerson.deployment_status || '').toUpperCase();
    return st.includes('BORROWED') && !currentPerson.isShared;
  }, [currentPerson]);

  const [dismissedPromptPersonId, setDismissedPromptPersonId] = useState(null);
  const [showBorrowedPromptModal, setShowBorrowedPromptModal] = useState(false);

  // Fetch Learning Areas for active personnel
  useEffect(() => {
    if (!currentPerson?.id) {
      setLearningAreaMap({});
      return;
    }
    let isMounted = true;
    setLearningAreaLoading(true);

    // CRITICAL: Reset learningAreaMap to local/current draft immediately on personnel change before fetching!
    let initialMap = {};
    const localDraft = localStorage.getItem(`draft_learning_areas_${currentPerson.id}`);
    if (localDraft) {
      try {
        initialMap = JSON.parse(localDraft) || {};
      } catch (e) {}
    } else if (currentPerson.learningAreaMap || currentPerson.matrix_data) {
      initialMap = currentPerson.learningAreaMap || currentPerson.matrix_data || {};
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
        
        // If DB returned 0 learning areas, but we have local draft / verified QR learning areas, PRESERVE THEM!
        if (Object.keys(incomingMap).length === 0 && (Object.keys(initialMap).length > 0 || currentPerson.learningAreaMap || currentPerson.matrix_data)) {
          incomingMap = Object.keys(initialMap).length > 0 ? initialMap : (currentPerson.learningAreaMap || currentPerson.matrix_data || {});
        }

        const finalMap = incomingMap && typeof incomingMap === 'object' ? incomingMap : {};
        setLearningAreaMap(finalMap);
        if (Object.keys(finalMap).length > 0) {
          localStorage.setItem(`draft_learning_areas_${currentPerson.id}`, JSON.stringify(finalMap));
        } else if (!localDraft && !currentPerson.learningAreaMap && !currentPerson.matrix_data) {
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

  // Years counted from the first day of service, before any disabled years are taken off.
  const getGrossServiceYears = (person) => {
    const d = person?.firstServiceDate || person?.first_service_date || '';
    if (!d || typeof d !== 'string' || d.length < 4) return 70;
    const startYear = parseInt(d.substring(0, 4), 10);
    if (isNaN(startYear)) return 70;
    const currentYear = new Date().getFullYear();
    const years = currentYear - startYear;
    return Math.min(70, Math.max(1, years));
  };

  // Learning Area years available = service years minus the years the user disabled (e.g. non-teaching years).
  // Records with no disabled years keep exactly their previous value.
  const getMaxAllowedServiceYears = (person) => {
    const disabled = Math.max(0, Number(person?.disabledServiceYears ?? person?.disabled_service_years ?? 0) || 0);
    const gross = getGrossServiceYears(person);
    return disabled > 0 ? Math.max(0, gross - disabled) : gross;
  };

  const [showDisableYears, setShowDisableYears] = useState(false);
  const [disableYearsInput, setDisableYearsInput] = useState('0');

  // Saves with the rest of the profile (Save Changes) as disabledServiceYears on the personnel record.
  const applyDisabledYears = () => {
    const n = Math.floor(Number(disableYearsInput));
    const gross = getGrossServiceYears(currentPerson);
    if (!Number.isFinite(n) || n < 0 || n > gross) {
      showToast(`Enter a whole number from 0 to ${gross}.`, 'warning');
      return;
    }
    const assigned = getTotalAssignedLearningYears(learningAreaMap);
    if (gross - n < assigned) {
      showToast(`${assigned} learning-area years are already recorded. Remove ${assigned - (gross - n)} year(s) from the matrix first.`, 'warning');
      return;
    }
    handleFieldChange('disabledServiceYears', n);
    setShowDisableYears(false);
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
    if (!currentPerson?.id || isReassignedOutInMotherSchool) return;
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
    if (!currentPerson?.id || isReassignedOutInMotherSchool) return;
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

  // Age calculation (must stay above the early return below: hooks may not be called conditionally)
  const maxBirthdate = React.useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    return d;
  }, []);

  if (!currentPerson) {
    return (
      <div className="card-inner">
        <h2>No Personnel Found</h2>
        <p className="subtext">Please add personnel in the Roster page first.</p>
      </div>
    );
  }


  const handleFieldChange = (key, value) => {
    setEditPerson(prev => {
      const base = prev || dbPerson;
      if (!base) return base;
      let updated = { ...base, [key]: value };

      if (key === 'assignedGradeLevels' || key === 'gradeLevelsTaught') {
        const rawGrades = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : []);
        const grades = rawGrades.map(g => {
          const u = String(g || '').toUpperCase();
          if (u.includes('KINDER')) return 'Kinder';
          if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
          if (u === 'ALS' || u.startsWith('ALS-') || u.startsWith('ALS ')) return 'ALS';
          return g;
        });
        const hasShs = grades.some(g => String(g).includes('11') || String(g).includes('12'));
        updated.teachesShs = hasShs;
        updated.teaches_shs = hasShs;
        updated.assignedGradeLevels = grades;
        updated.assigned_grade_levels = grades;
        updated.gradeLevelsTaught = grades;
        updated.grade_levels_taught = grades;
        if (grades.length > 0) {
          updated.hasNoTeachingLoad = false;
          updated.has_no_teaching_load = false;
        }
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
          if (updated.depedEmail === 'N/A' || updated.deped_email === 'N/A' || updated.noDepedEmail || updated.no_deped_email) {
            updated.depedEmail = '';
            updated.deped_email = '';
            updated.noDepedEmail = false;
            updated.no_deped_email = false;
          }
        } else if (nature === 'PROVISIONAL') {
          updated.natureOfAppointment = 'PROVISIONAL';
          updated.fundSource = 'NATIONAL';
          updated.hiringArrangement = 'DOST';
        } else if (['CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'].includes(nature)) {
          updated.natureOfAppointment = nature;
          updated.hiringArrangement = 'N/A';
          if (String(updated.fundSource || '').toUpperCase() === 'NATIONAL' && !NATIONAL_FUND_ELIGIBLE_NATURES.includes(nature)) {
            updated.fundSource = '';
          }
        }
      }

      if (key === 'position' && value) {
        const autoType = detectPersonnelTypeFromPosition(value);
        if (autoType && autoType !== updated.type) {
          updated.type = autoType;
        }
        const isCook = String(value || '').trim().toUpperCase() === 'COOK';
        if (isCook) {
          updated.natureOfAppointment = 'CONTRACTUAL';
          updated.nature_of_appointment = 'CONTRACTUAL';
          updated.hiringArrangement = 'CONTRACTUAL';
          updated.hiring_arrangement = 'CONTRACTUAL';
          updated.fundSource = 'SBFP';
          updated.fund_source = 'SBFP';
        } else {
          if (String(updated.fundSource || '').toUpperCase() === 'SBFP') {
            updated.fundSource = 'NATIONAL';
            updated.fund_source = 'NATIONAL';
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
        }
        if (String(updated.natureOfAppointment || '').toUpperCase() === 'REGULAR PERMANENT' && updated.depedEmail === 'N/A') {
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
        } else if (String(updated.natureOfAppointment || '').toUpperCase() === 'REGULAR PERMANENT' && updated.depedEmail === 'N/A') {
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
          updated.stepIncrementConfirmed = false;
        }
      }

      if (key === 'stepIncrement') {
        updated.stepIncrementConfirmed = true;
      }

      if (base.id) {
        try {
          localStorage.setItem(`draft_personnel_${base.id}`, JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });
  };

  const handleMultipleFieldsChange = (fieldsObj) => {
    setEditPerson(prev => {
      const base = prev || dbPerson;
      if (!base) return base;
      const updated = { ...base, ...fieldsObj };
      if (base.id) {
        try {
          localStorage.setItem(`draft_personnel_${base.id}`, JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });
  };

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
    // Allowed in personnel profiling and roster
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



  // The one Personnel Profile save, used by the header Save button AND the unsaved-changes dialog's Save button.
  // It never opens its own alerts: it returns { ok: true } or { ok: false, title, message }.
  const runProfileSave = async () => {
    try {
      const recordsToSave = [];

      // 1. If currentPerson is edited vs dbPerson, validate and add to recordsToSave
      if (currentPerson && (currentPersonDirty || (editPerson && JSON.stringify(editPerson) !== JSON.stringify(dbPerson)))) {
        const conflict = checkSchoolHeadConflict(currentPerson);
        if (conflict) {
          return { ok: false, title: 'School Head Conflict', message: conflict };
        }
        recordsToSave.push(currentPerson);
      }

      // 2. Add other personnel with pending local drafts
      (personnel || []).forEach(p => {
        if (p.id !== dbPerson?.id) {
          const savedDraft = localStorage.getItem(`draft_personnel_${p.id}`);
          if (savedDraft) {
            try {
              recordsToSave.push({ ...p, ...JSON.parse(savedDraft) });
            } catch (e) {}
          }
        }
      });

      if (recordsToSave.length === 0) return { ok: true };

      // 3. Save ONLY the changed records to database
      for (const p of recordsToSave) {
        if (typeof savePersonnelChanges === 'function') {
          await savePersonnelChanges(p.id, p);
        }
        if (api && api.savePersonnelNode) {
          api.savePersonnelNode(p.id, 'profile', {
            schoolYear: schoolInfo?.schoolYear || 'SY 26-27',
            personnelName: `${p.lastName || ''}, ${p.firstName || ''}`,
            positionTitle: p.position || p.position_title || '',
            category: p.positionCategory || p.position_category || 'TEACHING',
            isSchoolHead: !!p.isSchoolHead,
            isComplete: true,
            payload: {
              status: 'COMPLETED',
              degrees: p.degreeRows || p.collegeDegrees || [],
              highest_educational_attainment: p.highestEducationalAttainment || p.highest_educational_attainment || ''
            }
          }).catch(err => reportError(err, { action: `Updating Node Map progress for ${p.id}`, handler: 'runProfileSave', ids: { personnel_id: String(p.id) } }));
        }
      }

      // Success is reported, and the local drafts cleared, only after the server confirmed the database write.
      const confirmed = await confirmServerDraftSaved();
      if (!confirmed.ok) return confirmed;

      for (const p of recordsToSave) {
        localStorage.removeItem(`draft_personnel_${p.id}`);
        localStorage.removeItem(`draft_learning_areas_${p.id}`);
      }

      if (currentPerson) {
        setEditPerson(currentPerson);
      }

      // Complete Node without forcing navigation
      if (completeNode) {
        completeNode('profile', null);
      }

      if (showToast) {
        showToast("Personnel profile changes saved to database.", "success");
      }
      return { ok: true };
    } catch (err) {
      console.warn("Save personnel changes error:", err);
      return { ok: false, title: 'Personnel Profile Not Saved', message: "Failed to save personnel profile: " + err.message };
    }
  };
  runSaveRef.current = runProfileSave;

  const handleSave = async () => {
    const result = await runProfileSave();
    if (result.ok === false) {
      if (result.title === 'School Head Conflict') {
        await showAlert(result.title, result.message);
      } else if (showToast) {
        showToast(result.message, "error");
      }
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
      const isPermAppt = String(p.natureOfAppointment || p.nature_of_appointment || '').toUpperCase() === 'REGULAR PERMANENT';
      if (isPermAppt) {
        if (!p.depedEmail?.trim() || p.depedEmail === 'N/A' || p.noDepedEmail || p.no_deped_email) {
          errors.push("DEPED EMAIL (MANDATORY FOR REGULAR PERMANENT)");
        }
      } else {
        if (!p.noDepedEmail && !p.no_deped_email && !p.depedEmail?.trim()) {
          errors.push("DEPED EMAIL");
        }
      }
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
    const trimmed = String(val || '').trim();
    if (trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'na') {
      handleMultipleFieldsChange({ depedEmail: 'N/A', deped_email: 'N/A', noDepedEmail: true, no_deped_email: true });
      return;
    }
    const raw = trimmed.replace(/@/g, '').toLowerCase().replace(/[^a-z0-9.ñ]/g, '');
    if (!raw) {
      handleMultipleFieldsChange({ depedEmail: '', deped_email: '', noDepedEmail: false, no_deped_email: false });
      return;
    }
    handleMultipleFieldsChange({ depedEmail: `${raw}@deped.gov.ph`, deped_email: `${raw}@deped.gov.ph`, noDepedEmail: false, no_deped_email: false });
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

  const tabs = [
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
        onContinue={handleSave}
        continueText="Save"
        continueDisabled={!isDirty}
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
                            onClick={() => confirmAction(() => { setActivePersonnelId(p.id); setActiveTab('identity'); }, { actionType: 'tab' })}
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
                                {p.firstName} {p.lastName}{p.nameExtension ? ` ${p.nameExtension}` : ''}
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
                      background: isReassignedRejected ? '#FEE2E2' : String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '#FEF3C7' : '#E0F2FE',
                      color: isReassignedRejected ? '#DC2626' : String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '#92400E' : '#0369A1',
                      border: isReassignedRejected ? '1px solid #F87171' : String(currentPerson.deploymentStatus).toUpperCase() === 'BORROWED' ? '1px solid #FCD34D' : '1px solid #BAE6FD',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>
                      STATUS: {isReassignedRejected ? 'REJECTED' : String(currentPerson.deploymentStatus).toUpperCase()}
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
                  {dbPerson && localStorage.getItem(`draft_personnel_${dbPerson.id}`) && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '700' }}>● Unsaved Draft</span>
                  )}
                </div>
              </div>
              {/* Discard Draft button in header area */}
              {dbPerson && localStorage.getItem(`draft_personnel_${dbPerson.id}`) && (
                <button className="btn secondary" style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap' }} type="button" onClick={async () => {
                  if (await showConfirm("Discard Draft?", "Revert to the saved database version?")) {
                    localStorage.removeItem(`draft_personnel_${dbPerson.id}`);
                    setEditPerson(dbPerson);
                  }
                }}>Discard Draft</button>
              )}
            </div>

            {/* Borrowed Personnel Notice Banner */}
            {isBorrowedUnresolved && (
              <div style={{
                margin: '16px 24px 0 24px',
                padding: '16px',
                borderRadius: '12px',
                background: '#eff6ff',
                border: '1.5px solid #93c5fd',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e40af', fontWeight: '800', fontSize: '14px' }}>
                    <FiAlertCircle size={18} />
                    <span>Incoming Borrowed Personnel Notice</span>
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>
                    This teacher is marked as <strong>BORROWED</strong> from a Mother School. In DepEd plantilla operations, borrowed teachers must be initiated by their Mother School as Reassigned and accepted via the Request Center, or converted to Permanent (Own Station).
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowBorrowedPromptModal(true)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: '700',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
                    }}
                  >
                    <FiTag size={14} /> Review & Resolve Status
                  </button>
                </div>
              </div>
            )}

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
                  onClick={() => confirmAction(() => setActiveTab(tab), { actionType: 'tab' })}
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
              <div>
                {isReassignedRejected && (
                  <div style={{
                    background: '#FEF2F2',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    border: '1.5px solid #FCA5A5',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '8px',
                        background: '#FEE2E2', color: '#DC2626',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <FiAlertCircle size={20} />
                      </div>
                      <div>
                        <strong style={{ fontSize: '13px', color: '#991B1B', display: 'block' }}>
                          Inter-School Reassignment Request Rejected
                        </strong>
                        <span style={{ fontSize: '12px', color: '#B91C1C' }}>
                          The target receiving school declined this transfer request. You can edit all profile details or revert status back to Own Station.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleFieldChange('deploymentStatus', 'Stationed');
                        showToast('Reset status to Stationed (Own Station)', 'info');
                      }}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: '700',
                        background: '#DC2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <FiRefreshCw size={13} /> Revert to Own Station
                    </button>
                  </div>
                )}
                {currentPerson.isShared && (
                  <div style={{ background: '#F0FDF4', padding: '14px 16px', borderRadius: '12px', border: '1.5px solid #BBF7D0', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FiInfo size={16} />
                        <span>Active Stationed Faculty (Borrowed / Reassigned)</span>
                      </strong>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '20px',
                        background: '#DCFCE7',
                        color: '#15803D',
                        fontWeight: 'bold',
                        fontSize: '11px',
                        border: '1px solid #86EFAC'
                      }}>
                        EDITING ENABLED IN HOST STATION
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', color: '#14532D', fontSize: '12px' }}>
                      This personnel is stationed at your school. You have full administrative access to edit and complete their profile, qualifications, and learning areas.
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
                                  checked={!!(currentPerson.noTin || currentPerson.no_tin)}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setEditPerson(prev => {
                                      const updated = { ...prev, noTin: isChecked, no_tin: isChecked };
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
                                const isCook = String(selectedPos || '').trim().toUpperCase() === 'COOK';
                                const updated = {
                                  ...currentPerson,
                                  position: selectedPos,
                                  plantilla_position: selectedPos,
                                  type: autoType,
                                  positionCategory: catName,
                                  position_category: catName,
                                  ...(isCook ? {
                                    natureOfAppointment: 'CONTRACTUAL',
                                    nature_of_appointment: 'CONTRACTUAL',
                                    hiringArrangement: 'CONTRACTUAL',
                                    hiring_arrangement: 'CONTRACTUAL',
                                    fundSource: 'SBFP',
                                    fund_source: 'SBFP'
                                  } : (String(currentPerson.fundSource || '').toUpperCase() === 'SBFP' ? {
                                    fundSource: 'NATIONAL',
                                    fund_source: 'NATIONAL'
                                  } : {}))
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
                            const isCookPosition = String(currentPerson.position || '').trim().toUpperCase() === 'COOK';
                            let fundOptions = [];
                            let isFundDisabled = false;
                            let fundValue = currentPerson.fundSource || '';

                            if (currentNature === 'REGULAR PERMANENT' || currentNature === 'PROVISIONAL') {
                              fundOptions = ['NATIONAL'];
                              fundValue = 'NATIONAL';
                              isFundDisabled = true;
                            } else if (['CONTRACTUAL', 'SUBSTITUTE', 'CASUAL/EMERGENCY', 'JOB ORDER/CONTRACT OF SERVICE', 'VOLUNTEER'].includes(currentNature)) {
                              const allowsNational = NATIONAL_FUND_ELIGIBLE_NATURES.includes(currentNature);
                              fundOptions = isCookPosition 
                                ? ['SBFP', ...(allowsNational ? ['NATIONAL'] : []), 'SEF', 'LGU', 'PTA', 'NGO', 'SCHOOL MOOE'] 
                                : [...(allowsNational ? ['NATIONAL'] : []), 'SEF', 'LGU', 'PTA', 'NGO', 'SCHOOL MOOE'];
                              isFundDisabled = false;
                              if (!isCookPosition && String(fundValue).toUpperCase() === 'SBFP') {
                                fundValue = 'SEF';
                              } else if (String(fundValue).toUpperCase() === 'NATIONAL' && !allowsNational) {
                                fundValue = isCookPosition ? 'SBFP' : '';
                              } else if (String(fundValue).toUpperCase() === 'MOOE') {
                                fundValue = 'SCHOOL MOOE';
                              }
                            } else {
                              fundOptions = isCookPosition 
                                ? ['SBFP', 'NATIONAL', 'SEF', 'LGU', 'PTA', 'NGO', 'SCHOOL MOOE']
                                : ['NATIONAL', 'SEF', 'LGU', 'PTA', 'NGO', 'SCHOOL MOOE'];
                              isFundDisabled = false;
                              if (!isCookPosition && String(fundValue).toUpperCase() === 'SBFP') {
                                fundValue = 'NATIONAL';
                              }
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
                              const isPermanent = String(currentPerson.natureOfAppointment || currentPerson.nature_of_appointment || '').toUpperCase() === 'REGULAR PERMANENT';
                              const isEmailNA = !isPermanent && Boolean(currentPerson.noDepedEmail || currentPerson.no_deped_email || currentPerson.depedEmail === 'N/A' || currentPerson.deped_email === 'N/A');
                              const hasDiscrepancy = Boolean(currentPerson.allowEmailDiscrepancy || currentPerson.allow_email_discrepancy);
                              const rawEmail = isEmailNA ? 'N/A' : (currentPerson.depedEmail || currentPerson.deped_email || '');
                              const emailVal = (!rawEmail || isEmailNA)
                                ? { isValid: true, error: null }
                                : validateDepEdEmail(rawEmail, currentPerson.firstName, currentPerson.lastName, currentPerson.middleName, hasDiscrepancy);

                              const localVal = isEmailNA ? 'N/A' : getEmailLocal(rawEmail);
                              const hasError = !emailVal.isValid && !isEmailNA && !!rawEmail;

                              return (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <label style={{ margin: 0 }}>DepEd Official Email</label>
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
                                    {isEmailNA && (
                                      <span style={{ fontSize: '10.5px', color: '#047857', background: '#ECFDF5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #A7F3D0', fontWeight: '700' }}>
                                        N/A (No Issuance)
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

                                  {/* Allow Email Discrepancy (Birth Certificate / Legal Name Change) Premium Toggle Card */}
                                  {!isEmailNA && (
                                    <div 
                                      onClick={() => {
                                        if (!hasDiscrepancy) {
                                          setConfirmDiscrepancyInput('');
                                          setIsConfirmDiscrepancyModalOpen(true);
                                        } else {
                                          handleMultipleFieldsChange({ allowEmailDiscrepancy: false, allow_email_discrepancy: false });
                                        }
                                      }}
                                      style={{
                                        marginTop: '8px',
                                        padding: '10px 14px',
                                        borderRadius: '12px',
                                        border: hasDiscrepancy ? '1.5px solid #38BDF8' : '1.5px solid #E2E8F0',
                                        background: hasDiscrepancy ? 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)' : '#F8FAFC',
                                        boxShadow: hasDiscrepancy ? '0 4px 12px -2px rgba(14, 165, 233, 0.15)' : 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        userSelect: 'none'
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!hasDiscrepancy) {
                                          e.currentTarget.style.borderColor = '#CBD5E1';
                                          e.currentTarget.style.background = '#F1F5F9';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!hasDiscrepancy) {
                                          e.currentTarget.style.borderColor = '#E2E8F0';
                                          e.currentTarget.style.background = '#F8FAFC';
                                        }
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                        <div style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '9px',
                                          background: hasDiscrepancy ? '#0284C7' : '#E2E8F0',
                                          color: hasDiscrepancy ? '#FFFFFF' : '#64748B',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          flexShrink: 0,
                                          transition: 'all 0.2s ease'
                                        }}>
                                          <FiShield size={16} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span style={{
                                            fontSize: '12.5px',
                                            fontWeight: 700,
                                            color: hasDiscrepancy ? '#0369A1' : '#1E293B'
                                          }}>
                                            Legal Name Discrepancy Override
                                          </span>
                                          {hasDiscrepancy && (
                                            <span style={{
                                              fontSize: '10px',
                                              fontWeight: 800,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.5px',
                                              padding: '1px 6px',
                                              borderRadius: '6px',
                                              background: '#0284C7',
                                              color: '#FFFFFF'
                                            }}>
                                              Active
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Modern iOS-Style Switch Pill */}
                                      <div style={{
                                        width: '42px',
                                        height: '24px',
                                        borderRadius: '999px',
                                        background: hasDiscrepancy ? '#0284C7' : '#CBD5E1',
                                        padding: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        transition: 'background-color 0.25s ease',
                                        flexShrink: 0,
                                        position: 'relative'
                                      }}>
                                        <div style={{
                                          width: '20px',
                                          height: '20px',
                                          borderRadius: '50%',
                                          background: '#FFFFFF',
                                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                          transform: hasDiscrepancy ? 'translateX(18px)' : 'translateX(0px)',
                                          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }} />
                                      </div>
                                    </div>
                                  )}

                                  {/* No DepEd Email Toggle Card - Only shown for Non-Permanent Personnel */}
                                  {!isPermanent && (
                                    <div
                                      onClick={() => {
                                        if (!isEmailNA) {
                                          handleMultipleFieldsChange({ depedEmail: 'N/A', deped_email: 'N/A', noDepedEmail: true, no_deped_email: true });
                                        } else {
                                          handleMultipleFieldsChange({ depedEmail: '', deped_email: '', noDepedEmail: false, no_deped_email: false });
                                        }
                                      }}
                                      style={{
                                        marginTop: '8px',
                                        padding: '10px 14px',
                                        borderRadius: '12px',
                                        border: isEmailNA ? '1.5px solid #10B981' : '1.5px solid #E2E8F0',
                                        background: isEmailNA ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' : '#F8FAFC',
                                        boxShadow: isEmailNA ? '0 4px 12px -2px rgba(16, 185, 129, 0.15)' : 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        userSelect: 'none'
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isEmailNA) {
                                          e.currentTarget.style.borderColor = '#CBD5E1';
                                          e.currentTarget.style.background = '#F1F5F9';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isEmailNA) {
                                          e.currentTarget.style.borderColor = '#E2E8F0';
                                          e.currentTarget.style.background = '#F8FAFC';
                                        }
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                        <div style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '9px',
                                          background: isEmailNA ? '#059669' : '#E2E8F0',
                                          color: isEmailNA ? '#FFFFFF' : '#64748B',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          flexShrink: 0,
                                          transition: 'all 0.2s ease'
                                        }}>
                                          <FiCheck size={16} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span style={{
                                            fontSize: '12.5px',
                                            fontWeight: 700,
                                            color: isEmailNA ? '#065F46' : '#1E293B'
                                          }}>
                                            No DepEd Email Issued (N/A)
                                          </span>
                                          {isEmailNA && (
                                            <span style={{
                                              fontSize: '10px',
                                              fontWeight: 800,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.5px',
                                              padding: '1px 6px',
                                              borderRadius: '6px',
                                              background: '#059669',
                                              color: '#FFFFFF'
                                            }}>
                                              N/A
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Modern iOS-Style Switch Pill */}
                                      <div style={{
                                        width: '42px',
                                        height: '24px',
                                        borderRadius: '999px',
                                        background: isEmailNA ? '#059669' : '#CBD5E1',
                                        padding: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        transition: 'background-color 0.25s ease',
                                        flexShrink: 0,
                                        position: 'relative'
                                      }}>
                                        <div style={{
                                          width: '20px',
                                          height: '20px',
                                          borderRadius: '50%',
                                          background: '#FFFFFF',
                                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                          transform: isEmailNA ? 'translateX(18px)' : 'translateX(0px)',
                                          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }} />
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          <div className="profile-subsection">Deployment and Service Dates</div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Status of Deployment</label>
                            <SearchableDropdown
                              options={['OWN STATION', 'CLUSTERED', 'REASSIGNED', 'BORROWED']}
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
                                  : DIVISION_SCHOOL_OPTIONS.filter(s => getSchoolId(s) !== currentSchoolIdStr);

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
                                          <label>Reassigned Target School (Same Division)</label>
                                          <SearchableDropdown
                                            options={schoolOptionsList}
                                            allowCustom={true}
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
                                              handleFieldChange('assignedSchools', val ? [val] : []);
                                            }}
                                            placeholder="SELECT REASSIGNED TARGET SCHOOL..."
                                          />
                                          <p className="field-help">Select the destination school in {schoolInfo?.division || 'the same division'} where this personnel is reassigned to teach.</p>
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
                                                    const meta = resolveSchoolMeta(rawSchool);
                                                    const rawStr = String(rawSchool || '').trim();
                                                    const parenMatch = rawStr.match(/\((\d{5,})\)/);
                                                    const directDigits = rawStr.match(/\b(\d{5,})\b/);
                                                    const targetSchoolId = meta?.schoolId || (parenMatch ? parenMatch[1] : (directDigits ? directDigits[1] : rawStr.replace(/^SCH-/i, '').trim()));

                                                    if (!targetSchoolId) {
                                                      await showAlert("No Target School", "Please select a target destination school from the dropdown before sending the reassignment request.");
                                                      return;
                                                    }

                                                    const curSchoolId = String(schoolInfo?.schoolId || '').replace(/^SCH-/i, '').trim();
                                                    await api.createRequest({
                                                      requesterSchoolId: curSchoolId,
                                                      targetSchoolId: targetSchoolId,
                                                      requestType: 'reassigned_teacher',
                                                      personnelId: prnToShare,
                                                      personnelName: `${currentPerson.firstName || ''} ${currentPerson.lastName || ''}`.trim()
                                                    });

                                                    showToast("Reassignment request sent successfully!", "success");
                                                    await showAlert(
                                                      "Reassignment Request Sent",
                                                      `Reassignment request for ${currentPerson.firstName || ''} ${currentPerson.lastName || ''} (${prnToShare}) has been sent to School ${targetSchoolId} successfully!\n\nOnce accepted by that school, the personnel's status in their roster will be BORROWED.`
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
                                        <label>Origin / Mother Station (Same Division)</label>
                                        <SearchableDropdown
                                          options={schoolOptionsList}
                                          allowCustom={true}
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
                                            handleFieldChange('assignedSchools', val ? [val] : []);
                                          }}
                                          placeholder="SELECT ORIGIN STATION..."
                                        />
                                        <p className="field-help">Mother station from which this personnel is borrowed within {schoolInfo?.division || 'the same division'}.</p>
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
                                            <FiMapPin size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />Division: {schoolInfo?.division || 'Same Division'}
                                          </span>
                                        </div>
                                        <p className="field-help" style={{ marginTop: '-8px' }}>Select satellite schools in the same division where this personnel is deployed to teach.</p>

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
                                          allowCustom={true}
                                          value=""
                                          onChange={(val) => {
                                            if (!val) return;
                                            const currentList = Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : [];
                                            if (!currentList.includes(val)) {
                                              handleFieldChange('assignedSchools', [...currentList, val]);
                                            }
                                          }}
                                          placeholder="+ ADD CLUSTERED SCHOOL (SAME DIVISION)..."
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
                                                      if (meta && meta.schoolId) return meta.schoolId;
                                                      const rawStr = String(item || '').trim();
                                                      const parenMatch = rawStr.match(/\((\d{5,})\)/);
                                                      if (parenMatch) return parenMatch[1];
                                                      const directDigits = rawStr.match(/\b(\d{5,})\b/);
                                                      if (directDigits) return directDigits[1];
                                                      return rawStr.replace(/^SCH-/i, '').trim();
                                                    }).filter(Boolean);

                                                    if (targetSchoolIds.length === 0) {
                                                      await showAlert("No Target Schools", "Please add at least one clustered school from the dropdown before sharing.");
                                                      return;
                                                    }

                                                    const curSchoolId = String(schoolInfo?.schoolId || '').replace(/^SCH-/i, '').trim();
                                                    for (const targetId of targetSchoolIds) {
                                                      await api.createRequest({
                                                        requesterSchoolId: curSchoolId,
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
                                  checked={currentPerson.lastPromotionDate === 'N/A' || currentPerson.last_promotion_date === 'N/A'}
                                  onChange={(e) => handleFieldChange('lastPromotionDate', e.target.checked ? 'N/A' : '')}
                                />
                                N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={(currentPerson.lastPromotionDate === 'N/A' || currentPerson.last_promotion_date === 'N/A') ? '' : (currentPerson.lastPromotionDate || currentPerson.last_promotion_date || '')}
                              onChange={(val) => handleFieldChange('lastPromotionDate', val)}
                              maxDate={new Date()}
                              minDate={currentPerson.firstServiceDate ? new Date(currentPerson.firstServiceDate + 'T00:00:00') : undefined}
                              disabled={currentPerson.lastPromotionDate === 'N/A' || currentPerson.last_promotion_date === 'N/A'}
                            />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>Date of First Day in Current Station</label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                                <input
                                  type="checkbox"
                                  style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                                  checked={currentPerson.newStationDate === 'N/A' || currentPerson.new_station_date === 'N/A'}
                                  onChange={(e) => handleFieldChange('newStationDate', e.target.checked ? 'N/A' : '')}
                                />
                                N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={(currentPerson.newStationDate === 'N/A' || currentPerson.new_station_date === 'N/A') ? '' : (currentPerson.newStationDate || currentPerson.new_station_date || '')}
                              onChange={(val) => handleFieldChange('newStationDate', val)}
                              maxDate={new Date()}
                              minDate={currentPerson.firstServiceDate ? new Date(currentPerson.firstServiceDate + 'T00:00:00') : undefined}
                              disabled={currentPerson.newStationDate === 'N/A' || currentPerson.new_station_date === 'N/A'}
                            />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>Date of Last Lateral Movement</label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                                <input
                                  type="checkbox"
                                  style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                                  checked={currentPerson.lastLateralMovementDate === 'N/A' || currentPerson.last_lateral_movement_date === 'N/A'}
                                  onChange={(e) => handleFieldChange('lastLateralMovementDate', e.target.checked ? 'N/A' : '')}
                                />
                                N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={(currentPerson.lastLateralMovementDate === 'N/A' || currentPerson.last_lateral_movement_date === 'N/A') ? '' : (currentPerson.lastLateralMovementDate || currentPerson.last_lateral_movement_date || '')}
                              onChange={(val) => handleFieldChange('lastLateralMovementDate', val)}
                              maxDate={new Date()}
                              minDate={currentPerson.firstServiceDate ? new Date(currentPerson.firstServiceDate + 'T00:00:00') : undefined}
                              disabled={currentPerson.lastLateralMovementDate === 'N/A' || currentPerson.last_lateral_movement_date === 'N/A'}
                            />
                          </div>

                          <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                            {(() => {
                              const computed = computeStepIncrement(currentPerson.firstServiceDate, currentPerson.lastPromotionDate);
                              const isConfirmed = Boolean(currentPerson.stepIncrementConfirmed);
                              const currentStep = currentPerson.stepIncrement || computed.step || 1;

                              return (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ margin: 0 }}>Salary Step Increment *</label>
                                    {isConfirmed ? (
                                      <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 800, background: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
                                        ✓ Confirmed: Step {currentStep}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '11px', color: '#0369A1', fontWeight: 800, background: '#E0F2FE', padding: '2px 8px', borderRadius: '4px' }}>
                                        ✨ Suggested: Step {computed.step} (Click to confirm)
                                      </span>
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
                                      const isStepConfirmed = isConfirmed && currentStep === step;
                                      const isStepSuggested = !isConfirmed && computed.step === step;

                                      let bg = 'white';
                                      let color = 'var(--navy)';
                                      let borderLeft = idx > 0 ? '1.5px solid var(--line)' : 'none';

                                      if (isStepConfirmed) {
                                        bg = 'var(--blue, #0284c7)';
                                        color = 'white';
                                      } else if (isStepSuggested) {
                                        bg = '#E0F2FE';
                                        color = '#0369A1';
                                      }

                                      return (
                                        <button
                                          key={step}
                                          type="button"
                                          onClick={() => handleMultipleFieldsChange({ stepIncrement: step, stepIncrementConfirmed: true })}
                                          style={{
                                            flex: 1,
                                            padding: '10px 6px',
                                            border: 'none',
                                            borderLeft,
                                            background: bg,
                                            color,
                                            fontWeight: isStepConfirmed ? '800' : (isStepSuggested ? '800' : '600'),
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            lineHeight: 1.3,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '2px'
                                          }}
                                          onMouseEnter={e => { if (!isStepConfirmed && !isStepSuggested) e.currentTarget.style.background = '#f0f9ff'; }}
                                          onMouseLeave={e => { if (!isStepConfirmed && !isStepSuggested) e.currentTarget.style.background = 'white'; }}
                                          title={isStepSuggested ? `Click to confirm Step ${step}` : `Select Step ${step}`}
                                        >
                                          <span style={{ fontSize: '15px', fontWeight: '800' }}>{step}</span>
                                          <span style={{ fontSize: '9px', opacity: isStepConfirmed ? 0.85 : 0.6, fontWeight: '700', letterSpacing: '0.03em' }}>
                                            STEP
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {!isConfirmed ? (
                                    <p className="field-help" style={{ color: '#0369A1', fontWeight: 600 }}>
                                      ✨ <strong>Step {computed.step}</strong> suggested — <em>Click Step {computed.step} or your actual step above to confirm.</em>
                                    </p>
                                  ) : (
                                    <p className="field-help" style={{ color: '#16A34A', fontWeight: 600 }}>
                                      ✓ <strong>Step {currentStep}</strong> confirmed by personnel.
                                    </p>
                                  )}
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
                                    } else if (val === "MASTER'S DEGREE (GRADUATED)" || val === "MASTER'S DEGREE (WITH UNITS)") {
                                      updates.shsTrack = '';
                                      updates.vocationalCourse = '';
                                      updates.vocationalLevel = '';
                                      updates.postGraduateDegree = 'MASTERS DEGREE';
                                    } else if (val === "DOCTORATE DEGREE (GRADUATED)" || val === "DOCTORATE DEGREE (WITH UNITS)") {
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

                          {/* College Degree(s) Section if College, Master's, or Doctorate */}
                          {([
                            'COLLEGE GRADUATE / BACCALAUREATE', 
                            'COLLEGE UNDERGRADUATE', 
                            "MASTER'S DEGREE", 
                            "DOCTORATE DEGREE", 
                            "MASTER'S DEGREE (WITH UNITS)", 
                            "MASTER'S DEGREE (GRADUATED)", 
                            "DOCTORATE DEGREE (WITH UNITS)", 
                            "DOCTORATE DEGREE (GRADUATED)"
                          ].includes(
                            currentPerson.highestEducationalAttainment || (currentPerson.collegeDegree ? 'COLLEGE GRADUATE / BACCALAUREATE' : '')
                          ) || String(currentPerson.highestEducationalAttainment || '').includes("MASTER") || String(currentPerson.highestEducationalAttainment || '').includes("DOCTOR")) && (() => {
                            const collegeList = getEffectiveCollegeDegrees(currentPerson);
                            const effectiveList = collegeList.length > 0 ? collegeList : [{ collegeDegree: '', major: '', minor: '' }];

                            const updateCollegeList = (newList) => {
                              const primary = newList[0] || { collegeDegree: '', major: '', minor: '' };
                              const degreeRows = newList.map((d, idx) => ({
                                clientKey: `baccalaureate-${idx}`,
                                level: 'BACCALAUREATE',
                                collegeDegree: d.collegeDegree || '',
                                major: d.major || '',
                                minor: d.minor || ''
                              }));
                              handleMultipleFieldsChange({
                                collegeDegrees: newList,
                                collegeDegree: primary.collegeDegree || '',
                                major: primary.major || '',
                                minor: primary.minor || '',
                                degreeRows: degreeRows
                              });
                            };

                            const handleRowChange = (index, field, value) => {
                              const nextList = effectiveList.map((row, i) => {
                                if (i !== index) return row;
                                const updatedRow = { ...row, [field]: value };
                                if (field === 'collegeDegree') {
                                  const d = (value || '').toUpperCase();
                                  const isEdu = value && value !== 'NONE' && value !== 'N/A' && (
                                    d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
                                  );
                                  if (!isEdu) {
                                    updatedRow.major = '';
                                    updatedRow.minor = '';
                                  }
                                }
                                return updatedRow;
                              });
                              updateCollegeList(nextList);
                            };

                            const handleAddDegree = () => {
                              updateCollegeList([...effectiveList, { collegeDegree: '', major: '', minor: '' }]);
                            };

                            const handleRemoveDegree = (index) => {
                              if (effectiveList.length <= 1) {
                                updateCollegeList([{ collegeDegree: '', major: '', minor: '' }]);
                              } else {
                                const nextList = effectiveList.filter((_, i) => i !== index);
                                updateCollegeList(nextList);
                              }
                            };

                            return (
                              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy, #0F172A)', margin: 0 }}>
                                    College / Baccalaureate Degree(s) <span style={{ color: '#EF4444' }}>*</span>
                                  </label>
                                  {effectiveList.length > 0 && (
                                    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--blue, #0284C7)', background: 'var(--blue-50, #EFF6FF)', padding: '2px 8px', borderRadius: '8px' }}>
                                      {effectiveList.length} {effectiveList.length === 1 ? 'Degree' : 'Degrees'}
                                    </span>
                                  )}
                                </div>

                                {effectiveList.map((degRow, index) => {
                                  const d = (degRow.collegeDegree || '').toUpperCase();
                                  const isEdu = degRow.collegeDegree && degRow.collegeDegree !== 'NONE' && degRow.collegeDegree !== 'N/A' && (
                                    d.includes('EDUCATION') || d.includes('SPECIAL ED') || d.includes('KINDERGARTEN') || d.includes('EARLY CHILDHOOD')
                                  );

                                  return (
                                    <div 
                                      key={index}
                                      style={{
                                        background: '#F8FAFC',
                                        border: '1.5px solid #E2E8F0',
                                        borderRadius: '12px',
                                        padding: '14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px'
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#475569', letterSpacing: '0.03em' }}>
                                          {index === 0 ? 'PRIMARY BACCALAUREATE / COLLEGE DEGREE' : `ADDITIONAL COLLEGE DEGREE #${index + 1}`}
                                        </span>
                                        {effectiveList.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveDegree(index)}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              background: '#FEE2E2',
                                              border: '1px solid #FCA5A5',
                                              color: '#DC2626',
                                              borderRadius: '6px',
                                              padding: '3px 8px',
                                              fontSize: '11px',
                                              fontWeight: '600',
                                              cursor: 'pointer'
                                            }}
                                            title="Remove this degree"
                                          >
                                            <FiTrash2 size={12} /> Remove
                                          </button>
                                        )}
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: isEdu ? 'repeat(auto-fit, minmax(240px, 1fr))' : '1fr', gap: '12px' }}>
                                        <div>
                                          <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                            Degree Title <span style={{ color: '#EF4444' }}>*</span>
                                          </label>
                                          <SearchableDropdown
                                            options={COLLEGE_DEGREE_OPTIONS}
                                            value={degRow.collegeDegree || ''}
                                            onChange={(val) => handleRowChange(index, 'collegeDegree', val)}
                                            placeholder="Select college degree..."
                                            required
                                          />
                                        </div>

                                        {isEdu && (
                                          <>
                                            <div>
                                              <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                                Major in Education <span style={{ color: '#EF4444' }}>*</span>
                                              </label>
                                              <SearchableDropdown
                                                options={MAJOR_OPTIONS}
                                                value={degRow.major || ''}
                                                onChange={(val) => handleRowChange(index, 'major', val)}
                                                placeholder="Select major..."
                                                required
                                              />
                                            </div>
                                            <div>
                                              <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                                Minor <span style={{ fontSize: '11px', color: 'var(--muted, #64748B)', fontWeight: 'normal' }}>(Optional)</span>
                                              </label>
                                              <SearchableDropdown
                                                options={MINOR_OPTIONS}
                                                value={degRow.minor || ''}
                                                onChange={(val) => handleRowChange(index, 'minor', val)}
                                                placeholder="Select minor subject (optional)..."
                                              />
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                <div>
                                  <button
                                    type="button"
                                    onClick={handleAddDegree}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      background: '#F0F9FF',
                                      border: '1.5px dashed #0284C7',
                                      color: '#0284C7',
                                      padding: '8px 14px',
                                      borderRadius: '8px',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <FiPlus size={14} /> + Add Another Baccalaureate / College Degree
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Modular Master's and Doctorate Studies Section with Status Selector */}
                          {(() => {
                            const attainment = String(currentPerson.highestEducationalAttainment || '').toUpperCase();
                            const postGrads = getEffectivePostGradDisciplines(currentPerson);
                            const mastersWithUnits = postGrads.mastersWithUnits;
                            const mastersGraduated = postGrads.mastersGraduated;
                            const doctorateWithUnits = postGrads.doctorateWithUnits;
                            const doctorateGraduated = postGrads.doctorateGraduated;

                            const showMasters = attainment.includes("MASTER") || attainment.includes("DOCTOR") || 
                              mastersWithUnits.length > 0 || mastersGraduated.length > 0;
                            
                            const showDoctorate = attainment.includes("DOCTOR") ||
                              doctorateWithUnits.length > 0 || doctorateGraduated.length > 0;

                            if (!showMasters && !showDoctorate) return null;

                            const updateDisciplines = ({
                              nextMastersWithUnits = mastersWithUnits,
                              nextMastersGraduated = mastersGraduated,
                              nextDoctorateWithUnits = doctorateWithUnits,
                              nextDoctorateGraduated = doctorateGraduated
                            }) => {
                              const allMasters = [...new Set([...nextMastersWithUnits, ...nextMastersGraduated])];
                              const allDoctorate = [...new Set([...nextDoctorateWithUnits, ...nextDoctorateGraduated])];
                              const jsonStr = JSON.stringify({
                                mastersWithUnits: nextMastersWithUnits,
                                mastersGraduated: nextMastersGraduated,
                                doctorateWithUnits: nextDoctorateWithUnits,
                                doctorateGraduated: nextDoctorateGraduated,
                                masters: allMasters,
                                doctorate: allDoctorate
                              });
                              handleMultipleFieldsChange({
                                mastersWithUnitsDisciplines: nextMastersWithUnits,
                                mastersGraduatedDisciplines: nextMastersGraduated,
                                doctorateWithUnitsDisciplines: nextDoctorateWithUnits,
                                doctorateGraduatedDisciplines: nextDoctorateGraduated,
                                mastersDisciplines: allMasters,
                                doctorateDisciplines: allDoctorate,
                                mastersDiscipline: allMasters.join(', '),
                                doctorateDiscipline: allDoctorate.join(', '),
                                postGraduateDiscipline: jsonStr,
                                post_graduate_discipline: jsonStr
                              });
                            };

                            const defaultMastersStatus = attainment === "MASTER'S DEGREE (WITH UNITS)" ? 'WITH UNITS' : 'GRADUATED';
                            const defaultDoctorateStatus = attainment === "DOCTORATE DEGREE (WITH UNITS)" ? 'WITH UNITS' : 'GRADUATED';

                            return (
                              <>
                                {showMasters && (
                                  <PostGradDisciplineSection
                                    title="Master's Degree Discipline(s)"
                                    levelLabel="Master's"
                                    isRequired={attainment.includes("MASTER")}
                                    graduatedList={mastersGraduated}
                                    withUnitsList={mastersWithUnits}
                                    defaultStatus={defaultMastersStatus}
                                    onAdd={(disc, status) => {
                                      if (status === 'WITH UNITS') {
                                        if (!mastersWithUnits.includes(disc)) {
                                          updateDisciplines({ nextMastersWithUnits: [...mastersWithUnits, disc] });
                                        }
                                      } else {
                                        if (!mastersGraduated.includes(disc)) {
                                          updateDisciplines({ nextMastersGraduated: [...mastersGraduated, disc] });
                                        }
                                      }
                                    }}
                                    onRemove={(disc, status) => {
                                      if (status === 'WITH UNITS') {
                                        updateDisciplines({ nextMastersWithUnits: mastersWithUnits.filter(d => d !== disc) });
                                      } else {
                                        updateDisciplines({ nextMastersGraduated: mastersGraduated.filter(d => d !== disc) });
                                      }
                                    }}
                                  />
                                )}

                                {showDoctorate && (
                                  <PostGradDisciplineSection
                                    title="Doctorate Degree Discipline(s)"
                                    levelLabel="Doctorate"
                                    isRequired={attainment.includes("DOCTOR")}
                                    graduatedList={doctorateGraduated}
                                    withUnitsList={doctorateWithUnits}
                                    defaultStatus={defaultDoctorateStatus}
                                    onAdd={(disc, status) => {
                                      if (status === 'WITH UNITS') {
                                        if (!doctorateWithUnits.includes(disc)) {
                                          updateDisciplines({ nextDoctorateWithUnits: [...doctorateWithUnits, disc] });
                                        }
                                      } else {
                                        if (!doctorateGraduated.includes(disc)) {
                                          updateDisciplines({ nextDoctorateGraduated: [...doctorateGraduated, disc] });
                                        }
                                      }
                                    }}
                                    onRemove={(disc, status) => {
                                      if (status === 'WITH UNITS') {
                                        updateDisciplines({ nextDoctorateWithUnits: doctorateWithUnits.filter(d => d !== disc) });
                                      } else {
                                        updateDisciplines({ nextDoctorateGraduated: doctorateGraduated.filter(d => d !== disc) });
                                      }
                                    }}
                                  />
                                )}
                              </>
                            );
                          })()}

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
                                      minDate={new Date('2020-01-01T00:00:00')}
                                      maxDate={new Date()}
                                      placement="bottom"
                                    />
                                  </div>
                                  <div>
                                    <label>End Date</label>
                                    <DatePickerDropdowns
                                      value={tr.endDate || ''}
                                      onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'endDate', val)}
                                      maxDate={new Date()}
                                      minDate={tr.startDate ? new Date(tr.startDate.substring(0, 10) + 'T00:00:00') : new Date('2020-01-01T00:00:00')}
                                      placement="bottom"
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
                                  No NEAP trainings added yet. Click “Add NEAP Training” to encode credentials, inclusive dates (2020 – present), and hours.
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
                                      minDate={new Date('2020-01-01T00:00:00')}
                                      maxDate={new Date()}
                                      placement="bottom"
                                    />
                                  </div>
                                  <div>
                                    <label>End Date</label>
                                    <DatePickerDropdowns
                                      value={tr.endDate || ''}
                                      onChange={(val) => handleTrainingChange('certificationRows', index, 'endDate', val)}
                                      maxDate={new Date()}
                                      minDate={tr.startDate ? new Date(tr.startDate.substring(0, 10) + 'T00:00:00') : new Date('2020-01-01T00:00:00')}
                                      placement="bottom"
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
                                  No TESDA NC / certification records added yet. Click “Add TESDA / Certification” to encode credentials, inclusive dates (2020 – present), and hours.
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
                                      minDate={new Date('2020-01-01T00:00:00')}
                                      maxDate={new Date()}
                                      placement="bottom"
                                    />
                                  </div>
                                  <div>
                                    <label>End Date</label>
                                    <DatePickerDropdowns
                                      value={tr.endDate || ''}
                                      onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'endDate', val)}
                                      maxDate={new Date()}
                                      minDate={tr.startDate ? new Date(tr.startDate.substring(0, 10) + 'T00:00:00') : new Date('2020-01-01T00:00:00')}
                                      placement="bottom"
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

                          {(() => {
                            const isPersonSchoolHead = currentPerson.isSchoolHead === true || 
                              currentPerson.is_school_head === true || 
                              String(currentPerson.position || currentPerson.plantilla_position || '').toUpperCase().includes('PRINCIPAL') || 
                              String(currentPerson.designation || '').toUpperCase().includes('PRINCIPAL') ||
                              String(currentPerson.designation || '').toUpperCase().includes('SCHOOL HEAD') ||
                              String(currentPerson.designation || '').toUpperCase().includes('HEAD TEACHER (ADMIN)');
                            
                            const isRelatedTeaching = isPersonSchoolHead ||
                              currentPerson.type === 'teaching-related' ||
                              currentPerson.type === 'related-teaching' ||
                              currentPerson.type === 'related' ||
                              String(currentPerson.positionCategory || currentPerson.position_category || '').toUpperCase() === 'RELATED TEACHING';

                            const hasAssignedGrades = Array.isArray(currentPerson.assignedGradeLevels) && currentPerson.assignedGradeLevels.length > 0;
                            const hasNoTeaching = !hasAssignedGrades && (currentPerson.hasNoTeachingLoad === true || currentPerson.has_no_teaching_load === true || isPersonSchoolHead || isRelatedTeaching);

                            if (!isRelatedTeaching) return null;

                            const titleText = isPersonSchoolHead 
                              ? 'School Head Workload Designation' 
                              : 'Related Teaching Workload Designation';
                            
                            const subtitleText = hasNoTeaching
                              ? (isPersonSchoolHead 
                                  ? '✓ Designated with 0 teaching loads (Purely administrative and supervisory functions).'
                                  : '✓ Designated with 0 teaching loads (Purely administrative, supervisory, or non-classroom functions).')
                              : 'Currently has grade level(s) assigned. Click button to set 0 teaching load.';

                            return (
                              <div style={{
                                gridColumn: '1 / -1',
                                background: hasNoTeaching ? '#F0FDF4' : '#F8FAFC',
                                border: `1.5px solid ${hasNoTeaching ? '#86EFAC' : 'var(--line)'}`,
                                borderRadius: '12px',
                                padding: '14px 18px',
                                marginTop: '10px',
                                marginBottom: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    background: hasNoTeaching ? '#DCFCE7' : '#E2E8F0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: hasNoTeaching ? '#15803D' : '#475569'
                                  }}>
                                    <FiUser size={18} />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--navy)' }}>
                                      {titleText}
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                                      {subtitleText}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className={`btn ${hasNoTeaching ? 'btn-primary' : 'secondary'}`}
                                    style={{
                                      fontSize: '11.5px',
                                      fontWeight: 800,
                                      padding: '7px 14px',
                                      borderRadius: '8px',
                                      background: hasNoTeaching ? '#16A34A' : '#FFFFFF',
                                      borderColor: hasNoTeaching ? '#16A34A' : 'var(--line)',
                                      color: hasNoTeaching ? '#FFFFFF' : 'var(--navy)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      cursor: 'pointer'
                                    }}
                                    onClick={() => {
                                      const nextNoTeaching = !hasNoTeaching;
                                      handleMultipleFieldsChange({
                                        assignedGradeLevels: [],
                                        assigned_grade_levels: [],
                                        gradeLevelsTaught: [],
                                        grade_levels_taught: [],
                                        hasNoTeachingLoad: nextNoTeaching,
                                        has_no_teaching_load: nextNoTeaching,
                                        teachesShs: false,
                                        teaches_shs: false
                                      });
                                      if (showToast) showToast(nextNoTeaching ? `${isPersonSchoolHead ? "School Head" : "Related Teaching personnel"} designated with 0 teaching loads (Purely Administrative).` : "0-load designation removed. Please select grade levels.", "info");
                                    }}
                                  >
                                    <FiCheckCircle size={13} />
                                    <span>No Teaching Assignment (0 Teaching Load)</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="full" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                              <div>
                                <label style={{ fontWeight: '800', fontSize: '14px', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <FiLayers size={16} color="#0284C7" /> Assigned Grade Levels (Teaching / Teaching-Related)
                                </label>
                                <p className="field-help" style={{ margin: '2px 0 0', color: '#64748B', fontSize: '12px' }}>
                                  Click any grade level pill below to assign or unassign it for this teacher.
                                </p>
                              </div>

                              {/* Quick Action Presets */}
                              {(() => {
                                const curr = (Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [])
                                  .map(g => {
                                    const u = String(g || '').toUpperCase();
                                    if (u.includes('KINDER')) return 'Kinder';
                                    if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
                                    if (u === 'ALS' || u.startsWith('ALS-') || u.startsWith('ALS ')) return 'ALS';
                                    return g;
                                  });

                                const updateGrades = (newList) => {
                                  const hasShs = newList.some(g => String(g).includes('11') || String(g).includes('12'));
                                  handleMultipleFieldsChange({
                                    assignedGradeLevels: newList,
                                    assigned_grade_levels: newList,
                                    gradeLevelsTaught: newList,
                                    grade_levels_taught: newList,
                                    teachesShs: hasShs,
                                    teaches_shs: hasShs,
                                    hasNoTeachingLoad: false,
                                    has_no_teaching_load: false
                                  });
                                };

                                return (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      style={{ fontSize: '11px', padding: '4px 8px', fontWeight: '700' }}
                                      onClick={() => {
                                        const elemGrades = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
                                        const merged = Array.from(new Set([...curr, ...elemGrades]));
                                        updateGrades(merged);
                                      }}
                                    >
                                      + All Elem (K-6)
                                    </button>
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      style={{ fontSize: '11px', padding: '4px 8px', fontWeight: '700' }}
                                      onClick={() => {
                                        const jhsGrades = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
                                        const merged = Array.from(new Set([...curr, ...jhsGrades]));
                                        updateGrades(merged);
                                      }}
                                    >
                                      + All JHS (7-10)
                                    </button>
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      style={{ fontSize: '11px', padding: '4px 8px', fontWeight: '700' }}
                                      onClick={() => {
                                        const shsGrades = ['Grade 11', 'Grade 12'];
                                        const merged = Array.from(new Set([...curr, ...shsGrades]));
                                        updateGrades(merged);
                                      }}
                                    >
                                      + All SHS (11-12)
                                    </button>
                                    {curr.length > 0 && (
                                      <button
                                        type="button"
                                        className="btn secondary"
                                        style={{ fontSize: '11px', padding: '4px 8px', color: '#DC2626', borderColor: '#FCA5A5' }}
                                        onClick={() => {
                                          updateGrades([]);
                                        }}
                                      >
                                        Clear All
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Clickable Grade Level Badges Grid */}
                            {(() => {
                              const groups = [
                                {
                                  title: 'Elementary',
                                  grades: ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6']
                                },
                                {
                                  title: 'Junior High School',
                                  grades: ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']
                                },
                                {
                                  title: 'Senior High School',
                                  grades: ['Grade 11', 'Grade 12']
                                },
                                {
                                  title: 'Inclusive & Special Programs',
                                  grades: ['SNED (NON-GRADED)', 'ALS']
                                }
                              ];

                              const currentGrades = (Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [])
                                .map(g => {
                                  const u = String(g || '').toUpperCase();
                                  if (u.includes('KINDER')) return 'Kinder';
                                  if (u === 'SNED' || u === 'SPED' || u === 'NON-GRADED' || u === 'NON GRADED' || u.includes('SNED') || u.includes('NON-GRADED') || u.includes('NON GRADED')) return 'SNED (NON-GRADED)';
                                  if (u === 'ALS' || u.startsWith('ALS-') || u.startsWith('ALS ')) return 'ALS';
                                  return g;
                                });

                              const updateGrades = (newList) => {
                                const hasShs = newList.some(g => String(g).includes('11') || String(g).includes('12'));
                                handleMultipleFieldsChange({
                                  assignedGradeLevels: newList,
                                  assigned_grade_levels: newList,
                                  gradeLevelsTaught: newList,
                                  grade_levels_taught: newList,
                                  teachesShs: hasShs,
                                  teaches_shs: hasShs,
                                  hasNoTeachingLoad: false,
                                  has_no_teaching_load: false
                                });
                              };

                              return (
                                <div style={{ display: 'grid', gap: '14px', margin: '10px 0 16px' }}>
                                  {groups.map((grp, gIdx) => (
                                    <div key={gIdx} style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                      <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748B', marginBottom: '8px' }}>
                                        {grp.title}
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {grp.grades.map(grade => {
                                          const isSelected = currentGrades.includes(grade);
                                          return (
                                            <button
                                              key={grade}
                                              type="button"
                                              onClick={() => {
                                                let updatedList;
                                                if (isSelected) {
                                                  updatedList = currentGrades.filter(g => g !== grade);
                                                } else {
                                                  updatedList = [...currentGrades, grade];
                                                }
                                                updateGrades(updatedList);
                                              }}
                                              style={{
                                                background: isSelected ? 'linear-gradient(135deg, #0284C7, #0369A1)' : '#FFFFFF',
                                                color: isSelected ? '#FFFFFF' : '#1E293B',
                                                border: `1.5px solid ${isSelected ? '#0284C7' : '#CBD5E1'}`,
                                                borderRadius: '8px',
                                                padding: '7px 14px',
                                                fontSize: '12.5px',
                                                fontWeight: isSelected ? 800 : 600,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: isSelected ? '0 2px 6px rgba(2,132,199,0.3)' : '0 1px 2px rgba(0,0,0,0.03)',
                                                transition: 'all 0.15s ease'
                                              }}
                                            >
                                              {isSelected ? <FiCheckCircle size={14} color="#FFFFFF" /> : <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1.5px solid #94A3B8' }} />}
                                              <span>{grade}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}

                            {/* Dropdown to add a new custom grade level if needed */}
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
                                      if (u === 'ALS' || u.startsWith('ALS-') || u.startsWith('ALS ')) return 'ALS';
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
                                  const hasShs = newList.some(g => String(g).includes('11') || String(g).includes('12'));
                                  handleMultipleFieldsChange({
                                    assignedGradeLevels: newList,
                                    assigned_grade_levels: newList,
                                    gradeLevelsTaught: newList,
                                    grade_levels_taught: newList,
                                    teachesShs: hasShs,
                                    teaches_shs: hasShs,
                                    hasNoTeachingLoad: false,
                                    has_no_teaching_load: false
                                  });
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
                                {['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'SNED (NON-GRADED)', 'ALS']
                                  .filter(item => !(Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : []).includes(item))
                                  .map(g => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
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
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {showDisableYears ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                                  <label style={{ margin: 0 }}>Years to disable</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={getGrossServiceYears(currentPerson)}
                                    value={disableYearsInput}
                                    onChange={(e) => setDisableYearsInput(e.target.value)}
                                    style={{ width: '70px', minHeight: 'auto', padding: '4px 6px' }}
                                  />
                                  <button type="button" className="btn" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={applyDisabledYears}>Apply</button>
                                  <button type="button" className="btn secondary" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={() => setShowDisableYears(false)}>Cancel</button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn secondary"
                                  style={{ fontSize: '11px', padding: '6px 12px' }}
                                  title="Exclude years that should not be counted (e.g. years served as non-teaching before becoming a teacher)"
                                  onClick={() => {
                                    setDisableYearsInput(String(Number(currentPerson?.disabledServiceYears ?? currentPerson?.disabled_service_years ?? 0) || 0));
                                    setShowDisableYears(true);
                                  }}
                                >
                                  Disable Years{Number(currentPerson?.disabledServiceYears || 0) > 0 ? ` (${currentPerson.disabledServiceYears})` : ''}
                                </button>
                              )}
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
                                            const isCheckboxDisabled = isReassignedOutInMotherSchool || isDisabledEra || (!isChecked && isCapacityFull);

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
                                                            disabled={isDisabledEra}
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
                    Teaching Faculty Setup Required for Organized Classes
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                    DepEd eSF7 requires all teaching and related-teaching personnel to complete their Employment details and Assigned Grade Levels before setting up Organized Classes.
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
                  {allPersonnelValidationModal.incompleteList.length} of {allPersonnelValidationModal.totalPersonnel} teaching faculty have incomplete Employment or Teaching records.
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
                Click on any teaching faculty below to open their profile and complete their missing Employment/Teaching fields:
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
                      const targetTab = item.errors?.[0]?.tab || 'employment';
                      if (setActiveTab) setActiveTab(targetTab);
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
    
      {/* Borrowed Personnel Specific Prompt Modal */}
      {showBorrowedPromptModal && currentPerson && isBorrowedUnresolved && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setDismissedPromptPersonId(currentPerson.id);
            setShowBorrowedPromptModal(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              animation: 'modalSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px'
                }}>
                  ⚠️
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#ffffff' }}>
                    Incoming Borrowed Personnel Notice
                  </h3>
                  <div style={{ fontSize: '13px', color: '#bfdbfe', marginTop: '2px', fontWeight: '600' }}>
                    {currentPerson.firstName} {currentPerson.lastName} ({currentPerson.position || 'Teacher'})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDismissedPromptPersonId(currentPerson.id);
                  setShowBorrowedPromptModal(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#334155', lineHeight: '1.6' }}>
                This teacher is marked as <strong>BORROWED</strong> from a Mother School in historical/auto-populated data.
              </p>

              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px 16px',
                fontSize: '13px',
                color: '#475569',
                lineHeight: '1.5'
              }}>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '6px' }}>To maintain official DepEd plantilla synchronization:</strong>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <strong>If they are still borrowed:</strong> They must be initiated by their Mother School as Reassigned. You will then accept them via the <strong>Request Center</strong> with zero duplicate records.
                  </li>
                  <li>
                    <strong>If their status has changed:</strong> You can keep them as a permanent regular plantilla item in this school (Own Station).
                  </li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={async () => {
                    const personId = currentPerson.id;
                    setShowBorrowedPromptModal(false);
                    await resolveBorrowedPersonnel(personId, 'remove_and_await');
                    if (setActiveView) setActiveView('roster');
                  }}
                  style={{
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: '700',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    border: '1.5px solid #fecaca',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s'
                  }}
                >
                  <FiTrash2 size={16} /> Remove & Await Mother School in Request Center
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const personId = currentPerson.id;
                    await resolveBorrowedPersonnel(personId, 'convert_to_permanent');
                    setEditPerson(prev => prev ? ({ ...prev, deploymentStatus: 'Stationed', deployment_status: 'Stationed' }) : prev);
                    setShowBorrowedPromptModal(false);
                  }}
                  style={{
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: '700',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    transition: 'all 0.15s'
                  }}
                >
                  <FiCheckCircle size={16} /> Keep & Convert to Permanent (Own Station)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal to Confirm DepEd Email Name Discrepancy */}
      {isConfirmDiscrepancyModalOpen && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-card" style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FiAlertCircle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Confirm Email Name Discrepancy
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                  Override strict name matching for @deped.gov.ph email
                </p>
              </div>
            </div>

            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#92400E', lineHeight: '1.5' }}>
              You are enabling an override for this employee's official <strong>@deped.gov.ph</strong> email due to a legal name correction on their <strong>PSA Birth Certificate or Court Order</strong> while a Google Workspace account update is pending.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                Please type <span style={{ color: '#DC2626', fontWeight: 800 }}>CONFIRM</span> to activate this override:
              </label>
              <input
                type="text"
                value={confirmDiscrepancyInput}
                onChange={(e) => setConfirmDiscrepancyInput(e.target.value)}
                placeholder="Type CONFIRM"
                autoFocus
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setIsConfirmDiscrepancyModalOpen(false);
                  setConfirmDiscrepancyInput('');
                }}
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={confirmDiscrepancyInput.trim() !== 'CONFIRM'}
                onClick={() => {
                  if (confirmDiscrepancyInput.trim() === 'CONFIRM') {
                    handleMultipleFieldsChange({ allowEmailDiscrepancy: true, allow_email_discrepancy: true });
                    setIsConfirmDiscrepancyModalOpen(false);
                    setConfirmDiscrepancyInput('');
                    if (showToast) showToast('Email name discrepancy override enabled!', 'success');
                  }
                }}
                style={{
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: confirmDiscrepancyInput.trim() === 'CONFIRM' ? '#0284C7' : '#94A3B8',
                  cursor: confirmDiscrepancyInput.trim() === 'CONFIRM' ? 'pointer' : 'not-allowed'
                }}
              >
                Unlock Override
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
