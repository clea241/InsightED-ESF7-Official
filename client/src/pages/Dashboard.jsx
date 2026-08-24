import React, { useState, useEffect, useMemo } from 'react';
import { useApp, detectPersonnelTypeFromPosition } from '../context/AppContext';
import { api } from '../services/api';
import ESF7UploadModal from '../components/ESF7UploadModal';
import PortalHeader from '../components/PortalHeader';
import { FiUsers, FiSliders, FiFileText, FiLayers, FiAlertCircle, FiCheckCircle, FiUserCheck, FiTarget, FiPieChart, FiArrowRight } from 'react-icons/fi';
import '../premium-dashboard.css';

export default function Dashboard() {
  const { personnel, classSections, schoolInfo, setActiveView, showToast, isNodeUnlocked, isNodeCompleted } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const fetchDashboardStats = async () => {
      setLoading(true);
      try {
        const data = await api.getDashboardStats();
        if (!isCancelled) {
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchDashboardStats();
    return () => { isCancelled = true; };
  }, [schoolInfo?.schoolId]);

  const schoolName = stats?.school_overview?.school_name || schoolInfo?.schoolName || 'DepEd Integrated School';
  const totalPersonnel = personnel.length;

  const NODES = [
    {
      id: 'school',
      nodeNumber: '01',
      title: 'School Profile',
      subtitle: 'School identity, shift configuration & offerings',
      icon: '🏛',
      view: 'school',
      summary: schoolInfo?.schoolId ? `School ID: ${schoolInfo.schoolId}` : 'Configure school identity'
    },
    {
      id: 'roster',
      nodeNumber: '02',
      title: 'Personnel Roster',
      subtitle: 'Master personnel list & appointment status',
      icon: '☷',
      view: 'roster',
      summary: `${personnel.length} Registered Personnel`
    },
    {
      id: 'profile',
      nodeNumber: '03',
      title: 'Personnel Profiling',
      subtitle: 'Educational qualifications, LET & eligibility',
      icon: '✎',
      view: 'profile',
      summary: `${personnel.filter(p => p.degreeMajor || p.major).length} Profiles Configured`
    },
    {
      id: 'classes',
      nodeNumber: '04',
      title: 'Organized Classes',
      subtitle: 'Section setup, advisers & learner counts',
      icon: '▦',
      view: 'classes',
      summary: `${classSections.length} Class Sections`
    },
    {
      id: 'workload',
      nodeNumber: '05',
      title: 'Workload & Timetable',
      subtitle: 'Teaching schedules, period durations & timetable',
      icon: '◷',
      view: 'workload',
      summary: `${personnel.reduce((acc, p) => acc + (p.workloadRows?.length || 0), 0)} Workload Slots`
    },
    {
      id: 'validation',
      nodeNumber: '06',
      title: 'Submission & Certification',
      subtitle: 'Validation rules, eSF7 preview & certification',
      icon: '⛨',
      view: 'validation',
      summary: 'Final review & digital school head certification'
    }
  ];

  const completedCount = NODES.filter(n => isNodeCompleted(n.id)).length;
  const maleCount = personnel.filter(p => String(p.sexAtBirth || p.sex_at_birth || p.sex || p.gender || '').toUpperCase().startsWith('M')).length;
  const femaleCount = personnel.filter(p => String(p.sexAtBirth || p.sex_at_birth || p.sex || p.gender || '').toUpperCase().startsWith('F')).length;

  const teachingCount = personnel.filter(p => {
    const autoType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    const t = String(autoType).toLowerCase().trim();
    return t === 'teaching';
  }).length;

  const relatedTeachingCount = personnel.filter(p => {
    const autoType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    const t = String(autoType).toLowerCase().trim();
    return t === 'teaching-related' || t === 'teaching_related' || t === 'related' || t.includes('related');
  }).length;

  const nonTeachingCount = personnel.filter(p => {
    const autoType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    const t = String(autoType).toLowerCase().trim();
    return t === 'non-teaching' || t === 'non_teaching' || (t !== 'teaching' && !t.includes('related'));
  }).length;

  const termStatus = stats?.term_calendar_status || {
    current_school_year: 'SY 2026-2027',
    active_term: 'Term 1',
    block_type: 'INSTRUCTIONAL',
    overload_pay_eligible: true,
    active_date_range: 'June 8, 2026 - September 1, 2026'
  };

  // 1. AGE BRACKET CALCULATION
  const ageBrackets = {
    '20-25': 0,
    '26-30': 0,
    '31-40': 0,
    '41-50': 0,
    '51-60': 0,
    '60+': 0,
    'Unspecified': 0
  };

  personnel.forEach(p => {
    const dob = p.birthdate || p.dateOfBirth || p.dob || p.birthDate;
    if (!dob) {
      ageBrackets['Unspecified']++;
      return;
    }
    const bday = new Date(dob);
    if (isNaN(bday.getTime())) {
      ageBrackets['Unspecified']++;
      return;
    }
    const today = new Date();
    let age = today.getFullYear() - bday.getFullYear();
    const m = today.getMonth() - bday.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) {
      age--;
    }

    if (age >= 20 && age <= 25) ageBrackets['20-25']++;
    else if (age >= 26 && age <= 30) ageBrackets['26-30']++;
    else if (age >= 31 && age <= 40) ageBrackets['31-40']++;
    else if (age >= 41 && age <= 50) ageBrackets['41-50']++;
    else if (age >= 51 && age <= 60) ageBrackets['51-60']++;
    else if (age > 60) ageBrackets['60+']++;
    else ageBrackets['Unspecified']++;
  });

  // 2. APPOINTMENT STATUS BREAKDOWN
  const appointmentCounts = {
    'PERMANENT': 0,
    'PROVISIONAL': 0,
    'SUBSTITUTE': 0,
    'CONTRACT OF SERVICE': 0,
    'OTHERS': 0
  };

  personnel.forEach(p => {
    const appt = String(p.natureOfAppointment || p.appointmentStatus || p.employmentStatus || '').toUpperCase().trim();
    if (appt.includes('PERMANENT') || appt.includes('REGULAR')) appointmentCounts['PERMANENT']++;
    else if (appt.includes('PROVISIONAL')) appointmentCounts['PROVISIONAL']++;
    else if (appt.includes('SUBSTITUTE')) appointmentCounts['SUBSTITUTE']++;
    else if (appt.includes('CONTRACT') || appt.includes('COS') || appt.includes('JOB ORDER')) appointmentCounts['CONTRACT OF SERVICE']++;
    else appointmentCounts['OTHERS']++;
  });

  // -------------------------------------------------------------
  // WORKLOAD HOURS & MONO/MULTI GRADE SUMMARY CALCULATIONS
  // -------------------------------------------------------------
  let underload6hCount = 0; // < 6 hours (< 360 mins)
  let standard6to7hCount = 0; // 6 to < 7 hours (360 - 419 mins)
  let heavy7hPlusCount = 0; // 7+ hours (>= 420 mins)

  let monoGradeTeacherCount = 0;
  let multiGradeTeacherCount = 0;

  personnel.forEach(p => {
    const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    if (pType === 'non-teaching') return; // Exclude non-teaching staff

    // Calculate daily workload minutes
    let dailyMins = 0;
    const rows = Array.isArray(p.workloadRows) ? p.workloadRows : [];
    rows.forEach(wk => {
      let mins = Number(wk.durationMinutes || wk.minutes) || 0;
      if (!mins && wk.startTime && wk.endTime) {
        const [sh, sm] = wk.startTime.split(':').map(Number);
        const [eh, em] = wk.endTime.split(':').map(Number);
        if (!isNaN(sh) && !isNaN(eh)) {
          mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
        }
      }
      if (mins > 0) dailyMins += mins;
    });

    if (dailyMins < 360) {
      underload6hCount++;
    } else if (dailyMins >= 420) {
      heavy7hPlusCount++;
    } else {
      standard6to7hCount++;
    }

    // Section Type (Mono-Grade vs Multi-Grade)
    let handlesMulti = false;
    let handlesMono = false;

    rows.forEach(wk => {
      const g = String(wk.gradeLevel || '').toUpperCase();
      const secType = String(wk.sectionType || '').toUpperCase();
      const secName = String(wk.sectionName || '').toUpperCase();

      const matchingSection = classSections.find(s => 
        (wk.sectionId && String(s.id) === String(wk.sectionId)) ||
        (s.sectionName && String(s.sectionName).toUpperCase() === secName && String(s.gradeLevel).toUpperCase() === g)
      );

      const isMulti = (matchingSection && (matchingSection.sectionType === 'MULTIGRADE' || String(matchingSection.sectionType).toUpperCase().includes('MULTI') || String(matchingSection.gradeLevel || '').includes(' - '))) ||
                      secType.includes('MULTI') || g.includes(' - ') || g.includes(',') || secName.includes('MULTI');

      if (isMulti) {
        handlesMulti = true;
      } else if (g || secName) {
        handlesMono = true;
      }
    });

    if (handlesMulti) {
      multiGradeTeacherCount++;
    } else if (handlesMono) {
      monoGradeTeacherCount++;
    }
  });

  // 3. ORGANIZED CLASSES BREAKDOWN BY GRADE LEVEL
  const gradeLevelSectionMap = {};
  classSections.forEach(sec => {
    const g = sec.gradeLevel || 'Unassigned';
    if (!gradeLevelSectionMap[g]) gradeLevelSectionMap[g] = 0;
    gradeLevelSectionMap[g]++;
  });

  // 4. TEACHER EXCESS & SHORTAGE BY GRADE LEVEL
  const gradeTeacherAnalysis = {};
  const allGrades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
  
  const activeGradeKeys = Array.from(new Set([...Object.keys(gradeLevelSectionMap), ...allGrades.filter(g => gradeLevelSectionMap[g])]));

  activeGradeKeys.forEach(g => {
    const sectionCount = gradeLevelSectionMap[g] || 0;
    const teachersInGrade = personnel.filter(p => {
      if (Array.isArray(p.assignedGradeLevels) && p.assignedGradeLevels.includes(g)) return true;
      if (Array.isArray(p.workloadRows) && p.workloadRows.some(r => r.gradeLevel === g)) return true;
      return false;
    });

    const teacherCount = teachersInGrade.length;
    let diff = teacherCount - sectionCount;
    let statusText = 'Balanced';
    let statusBadgeClass = 'balanced';

    if (sectionCount > 0) {
      if (diff === 0) {
        statusText = 'Ideal Ratio';
        statusBadgeClass = 'balanced';
      } else if (diff < 0) {
        statusText = `Shortage (${Math.abs(diff)} Needed)`;
        statusBadgeClass = 'shortage';
      } else {
        statusText = `Surplus (+${diff} Extra)`;
        statusBadgeClass = 'surplus';
      }
    } else {
      statusText = 'No Classes';
      statusBadgeClass = 'none';
    }

    gradeTeacherAnalysis[g] = {
      sectionCount,
      teacherCount,
      diff,
      statusText,
      statusBadgeClass
    };
  });

  // 5. OUT-OF-FIELD TEACHING & MAJOR ALIGNMENT KPI
  let inFieldCount = 0;
  let outOfFieldCount = 0;
  let totalEvaluated = 0;

  personnel.forEach(p => {
    const major = String(p.degreeMajor || p.major || p.specialization || '').toUpperCase().trim();
    if (!major || major === 'NONE' || major === 'N/A' || major === 'GENERALIST') {
      return;
    }
    totalEvaluated++;
    const teachingSubjects = (p.workloadRows || []).map(r => String(r.subject || r.subjectName || '').toUpperCase().trim());
    const isAligned = teachingSubjects.some(sub => sub.includes(major) || major.includes(sub));
    if (isAligned) {
      inFieldCount++;
    } else {
      outOfFieldCount++;
    }
  });

  // 6. SUBJECT-SPECIALIZATION ALIGNMENT SUMMARY (EXACT SUBJECTS FROM SCREENSHOT)
  const [activeSubjectLevel, setActiveSubjectLevel] = useState('jhs'); // 'jhs', 'elem', 'shs'

  const TARGET_SUBJECTS = useMemo(() => [
    { key: 'ENGLISH', label: 'ENGLISH', aliases: ['ENGLISH', 'ENG'] },
    { key: 'MATHEMATICS', label: 'MATHEMATICS', aliases: ['MATHEMATICS', 'MATH'] },
    { key: 'SCIENCE', label: 'SCIENCE', aliases: ['SCIENCE', 'SCI'] },
    { key: 'EPP/TLE', label: 'EPP/TLE', aliases: ['EPP', 'TLE', 'HOME ECONOMICS', 'AGRICULTURE', 'INDUSTRIAL ARTS', 'ICT', 'TVL', 'TECHNOLOGY'] },
    { key: 'ARALING PANLIPUNAN', label: 'ARALING PANLIPUNAN', aliases: ['ARALING PANLIPUNAN', 'AP', 'SOCIAL STUDIES', 'PANLIPUNAN'] },
    { key: 'FILIPINO', label: 'FILIPINO', aliases: ['FILIPINO', 'FIL'] },
    { key: 'MAPEH', label: 'MAPEH', aliases: ['MAPEH', 'MUSIC', 'ARTS', 'PHYSICAL EDUCATION', 'HEALTH', 'PE', 'SPORTS'] },
    { key: 'GMRC/ESP/VALUES EDUCATION', label: 'GMRC/ESP/VALUES EDUCATION', aliases: ['GMRC', 'ESP', 'VALUES', 'EDUKASYON SA PAGPAPAKATAO', 'VALUES EDUCATION', 'RELIGION'] }
  ], []);

  const subjectAlignmentData = useMemo(() => {
    const isLevelMatch = (gradeStr) => {
      const g = String(gradeStr || '').toLowerCase();
      if (activeSubjectLevel === 'elem') {
        return g.includes('kinder') || g.includes('grade 1') || g.includes('grade 2') || g.includes('grade 3') || g.includes('grade 4') || g.includes('grade 5') || g.includes('grade 6');
      }
      if (activeSubjectLevel === 'shs') {
        return g.includes('grade 11') || g.includes('grade 12');
      }
      return g.includes('grade 7') || g.includes('grade 8') || g.includes('grade 9') || g.includes('grade 10');
    };

    return TARGET_SUBJECTS.map(subj => {
      let alignedMinutes = 0;
      let misalignedMinutes = 0;

      personnel.forEach(p => {
        const pMajors = [
          p.degreeMajor, p.major, p.specialization, p.minor, p.discipline, p.prcSpecialization, p.collegeDegree
        ].filter(Boolean).map(s => String(s).toUpperCase().trim());

        const rows = Array.isArray(p.workloadRows) ? p.workloadRows : [];
        rows.forEach(r => {
          if (!r.gradeLevel || !isLevelMatch(r.gradeLevel)) return;

          const subName = String(r.subject || r.subjectName || '').toUpperCase().trim();
          const matchesSubject = subj.aliases.some(alias => subName.includes(alias) || alias.includes(subName));

          if (matchesSubject) {
            let mins = Number(r.durationMinutes) || 0;
            if (!mins && r.startTime && r.endTime) {
              const [sH, sM] = r.startTime.split(':').map(Number);
              const [eH, eM] = r.endTime.split(':').map(Number);
              mins = (eH * 60 + eM) - (sH * 60 + sM);
            }
            if (!mins) mins = 60;
            const daysCount = Array.isArray(r.days) ? r.days.length : (typeof r.daySchedule === 'string' ? r.daySchedule.split(',').length : 5);
            const weeklyMins = mins * (daysCount || 1);

            let isTeacherAligned = pMajors.some(m => subj.aliases.some(alias => m.includes(alias) || alias.includes(m)));

            if (!isTeacherAligned) {
              // Check Learning Area Matrix experience (any recorded years)
              const laRows = Array.isArray(p.learningAreaRows) ? p.learningAreaRows : [];
              const laMap = p.learningAreaMap || {};
              const hasLAExp = laRows.some(r => {
                const name = String(r.subject || r.subjectName || '').toUpperCase();
                return subj.aliases.some(alias => name.includes(alias) || alias.includes(name)) && (r.checked || Number(r.years) > 0);
              }) || Object.entries(laMap).some(([k, v]) => {
                const subName = k.split('||')[1] || '';
                return subj.aliases.some(alias => subName.toUpperCase().includes(alias)) && (v?.checked || Number(v?.years) > 0);
              });

              if (hasLAExp) {
                isTeacherAligned = true;
              }
            }

            if (!isTeacherAligned) {
              // Check L&D / Training seminars (>= 8 hours)
              const allTrainings = [
                ...(Array.isArray(p.neapTrainingRows) ? p.neapTrainingRows : []),
                ...(Array.isArray(p.certificationRows) ? p.certificationRows : []),
                ...(Array.isArray(p.otherTrainingRows) ? p.otherTrainingRows : [])
              ];
              const hasLDTraining = allTrainings.some(tr => {
                const title = String(tr.title || tr.topic || tr.name || tr.course || '').toUpperCase();
                const hrs = Number(tr.totalHours || tr.hours || tr.durationHours) || 0;
                return hrs >= 8 && subj.aliases.some(alias => title.includes(alias) || alias.includes(title));
              });

              if (hasLDTraining) {
                isTeacherAligned = true;
              }
            }

            if (isTeacherAligned) {
              alignedMinutes += weeklyMins;
            } else {
              misalignedMinutes += weeklyMins;
            }
          }
        });
      });

      const total = alignedMinutes + misalignedMinutes;
      const alignedPct = total > 0 ? Math.round((alignedMinutes / total) * 100) : 0;
      const misalignedPct = total > 0 ? (100 - alignedPct) : 0;

      return {
        ...subj,
        alignedMinutes,
        misalignedMinutes,
        total,
        alignedPct,
        misalignedPct
      };
    });
  }, [personnel, activeSubjectLevel, TARGET_SUBJECTS]);

  return (
    <section id="dashboard" className="view premium-dashboard" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* 1. TYPOGRAPHIC PORTAL HEADER SYSTEM */}
      <PortalHeader
        departmentText="DEPARTMENT OF EDUCATION"
        bureauText={`${schoolName} • ${termStatus.current_school_year}`}
        title="eSF7 Executive Dashboard"
        description="Real-time personnel analytics, specialization alignment, class section organization, and workload monitoring across regional divisions."
        showLogout={true}
        actionButton={
          <button
            type="button"
            onClick={() => setActiveView('nodemap')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '900',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#FFFFFF',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(16, 185, 129, 0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.35)';
              }}
            >
              <span>🗺️ Open Node Map</span>
              <FiArrowRight style={{ fontSize: '15px' }} />
            </button>
        }
      />

      {/* CONTENT GRID */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: '180px', borderRadius: '16px', background: '#E2E8F0', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          ))}
        </div>
      ) : (
        <>
          {/* TOP ROW: 3 STAT SUMMARY CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            
            {/* CARD 1: SCHOOL OVERVIEW */}
            <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiUsers style={{ color: '#2563EB' }} /> School Personnel Roster
                </h3>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px' }}>
                  Total Staff
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '36px', fontWeight: '900', color: 'var(--navy)', lineHeight: 1 }}>
                  {totalPersonnel}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>
                  Registered Personnel
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--line)', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>MALE</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#1E40AF' }}>{maleCount}</div>
                </div>
                <div style={{ width: '1px', background: 'var(--line)' }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>FEMALE</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#9333EA' }}>{femaleCount}</div>
                </div>
              </div>

              {/* Personnel Category Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <div style={{ background: '#F0F9FF', padding: '8px 6px', borderRadius: '8px', border: '1px solid #BAE6FD', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.02em' }}>TEACHING</div>
                  <div style={{ fontSize: '15px', fontWeight: '900', color: '#0284C7', marginTop: '2px' }}>{teachingCount}</div>
                </div>
                <div style={{ background: '#F5F3FF', padding: '8px 6px', borderRadius: '8px', border: '1px solid #DDD6FE', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.02em' }}>RELATED</div>
                  <div style={{ fontSize: '15px', fontWeight: '900', color: '#7C3AED', marginTop: '2px' }}>{relatedTeachingCount}</div>
                </div>
                <div style={{ background: '#ECFDF5', padding: '8px 6px', borderRadius: '8px', border: '1px solid #A7F3D0', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.02em' }}>NON-TEACHING</div>
                  <div style={{ fontSize: '15px', fontWeight: '900', color: '#059669', marginTop: '2px' }}>{nonTeachingCount}</div>
                </div>
              </div>
            </div>

            {/* CARD 2: ORGANIZED CLASSES SUMMARY */}
            <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiLayers style={{ color: '#10B981' }} /> Organized Classes
                </h3>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#047857', background: '#D1FAE5', padding: '2px 8px', borderRadius: '6px' }}>
                  Active SY
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '36px', fontWeight: '900', color: '#047857', lineHeight: 1 }}>
                  {classSections.length}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>
                  Organized Class Sections
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {Object.entries(gradeLevelSectionMap).slice(0, 6).map(([grade, count]) => (
                  <span key={grade} style={{ fontSize: '11px', fontWeight: '700', background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', padding: '3px 8px', borderRadius: '6px' }}>
                    {grade}: <strong>{count}</strong>
                  </span>
                ))}
                {Object.keys(gradeLevelSectionMap).length > 6 && (
                  <span style={{ fontSize: '11px', color: '#64748B', padding: '3px 6px' }}>
                    +{Object.keys(gradeLevelSectionMap).length - 6} more
                  </span>
                )}
              </div>
            </div>

            {/* CARD 3: MAJOR ALIGNMENT & OUT-OF-FIELD KPI */}
            <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiTarget style={{ color: '#6366F1' }} /> Major Alignment KPI
                </h3>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#4338CA', background: '#EEF2FF', padding: '2px 8px', borderRadius: '6px' }}>
                  Teaching Quality
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <div style={{ flex: 1, background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700' }}>IN-FIELD (MATCHING)</div>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#16A34A' }}>{inFieldCount}</div>
                </div>
                <div style={{ flex: 1, background: '#FEF2F2', padding: '10px 12px', borderRadius: '10px', border: '1px solid #FCA5A5' }}>
                  <div style={{ fontSize: '11px', color: '#991B1B', fontWeight: '700' }}>OUT-OF-FIELD</div>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#DC2626' }}>{outOfFieldCount}</div>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>🎯</span>
                <span>
                  {totalEvaluated > 0 ? (
                    <><strong>{Math.round((inFieldCount / totalEvaluated) * 100)}%</strong> of evaluated teachers teach their major discipline.</>
                  ) : (
                    'Degree majors loaded and ready for alignment check.'
                  )}
                </span>
              </div>
            </div>

          </div>

          {/* WORKLOAD HOURS & MONO/MULTI GRADE SUMMARY ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
            {/* WORKLOAD HOURS DISTRIBUTION CARD */}
            <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiSliders style={{ color: '#D97706' }} /> Teacher Workload Hours Summary
                </h3>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: '6px' }}>
                  Workload Audit
                </span>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B' }}>
                Daily teaching and ancillary load duration breakdown per teacher (<strong style={{ color: '#0F172A' }}>6 hrs standard</strong>).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#FFFBEB', padding: '12px 8px', borderRadius: '12px', border: '1.5px solid #FDE68A', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.03em' }}>&lt; 6 HOURS WORKLOAD</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#D97706', margin: '4px 0 2px' }}>{underload6hCount}</div>
                  <div style={{ fontSize: '10px', color: '#78350F', fontWeight: '700' }}>Teachers (Underload)</div>
                </div>

                <div style={{ background: '#F0F9FF', padding: '12px 8px', borderRadius: '12px', border: '1.5px solid #BAE6FD', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>6 - 7 HOURS WORKLOAD</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#0284C7', margin: '4px 0 2px' }}>{standard6to7hCount}</div>
                  <div style={{ fontSize: '10px', color: '#0C4A6E', fontWeight: '700' }}>Teachers (Standard)</div>
                </div>

                <div style={{ background: '#FDF2F8', padding: '12px 8px', borderRadius: '12px', border: '1.5px solid #FBCFE8', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#BE185D', textTransform: 'uppercase', letterSpacing: '0.03em' }}>7+ HOURS WORKLOAD</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#DB2777', margin: '4px 0 2px' }}>{heavy7hPlusCount}</div>
                  <div style={{ fontSize: '10px', color: '#831843', fontWeight: '700' }}>Teachers (Heavy Load)</div>
                </div>
              </div>
            </div>

            {/* MONO-GRADE vs MULTI-GRADE SECTION DELIVERY CARD */}
            <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiLayers style={{ color: '#059669' }} /> Section Delivery Type Summary
                </h3>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#047857', background: '#D1FAE5', padding: '2px 8px', borderRadius: '6px' }}>
                  Class Organization
                </span>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B' }}>
                Distribution of teachers handling single-grade vs. combined multigrade sections.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#ECFDF5', padding: '14px 16px', borderRadius: '12px', border: '1.5px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>MONO-GRADE TEACHERS</div>
                    <div style={{ fontSize: '11px', color: '#065F46', marginTop: '2px', fontWeight: '600' }}>Single grade sections</div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: '#059669' }}>{monoGradeTeacherCount}</div>
                </div>

                <div style={{ background: '#FFFBEB', padding: '14px 16px', borderRadius: '12px', border: '1.5px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>MULTI-GRADE TEACHERS</div>
                    <div style={{ fontSize: '11px', color: '#78350F', marginTop: '2px', fontWeight: '600' }}>Combined grade sections</div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: '#D97706' }}>{multiGradeTeacherCount}</div>
                </div>
              </div>
            </div>

          </div>

          {/* SECOND ROW: AGE BRACKETS, APPOINTMENT STATUS & SUBJECT SPECIALIZATION SUMMARY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
            
            {/* LEFT COLUMN: DEMOGRAPHICS & APPOINTMENTS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* AGE RANGE SUMMARY CARD */}
              <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiPieChart style={{ color: '#F59E0B' }} /> Personnel Age Bracket Summary
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: '6px' }}>
                    Demographic Profile
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(ageBrackets).map(([range, count]) => {
                    const pct = totalPersonnel > 0 ? Math.round((count / totalPersonnel) * 100) : 0;
                    return (
                      <div key={range}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', color: 'var(--navy)', marginBottom: '3px' }}>
                          <span>Ages {range}</span>
                          <span style={{ color: '#64748B' }}>{count} Staff ({pct}%)</span>
                        </div>
                        <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: range === '60+' ? '#EF4444' : (range === '51-60' ? '#F59E0B' : '#3B82F6'), borderRadius: '9999px' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PERSONNEL CLASSIFICATION SUMMARY CARD */}
              <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiUsers style={{ color: '#2563EB' }} /> Personnel Category Breakdown
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#1E40AF', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px' }}>
                    DepEd Staff Categories
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', padding: '14px 10px', borderRadius: '12px', border: '1.5px solid #BAE6FD', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>TEACHING</div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#0284C7', marginTop: '4px', lineHeight: 1 }}>{teachingCount}</div>
                    <div style={{ fontSize: '11px', color: '#0284C7', fontWeight: '700', marginTop: '6px' }}>
                      {totalPersonnel > 0 ? Math.round((teachingCount / totalPersonnel) * 100) : 0}% of Total
                    </div>
                  </div>

                  <div style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)', padding: '14px 10px', borderRadius: '12px', border: '1.5px solid #DDD6FE', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.03em' }}>RELATED TEACHING</div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#7C3AED', marginTop: '4px', lineHeight: 1 }}>{relatedTeachingCount}</div>
                    <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: '700', marginTop: '6px' }}>
                      {totalPersonnel > 0 ? Math.round((relatedTeachingCount / totalPersonnel) * 100) : 0}% of Total
                    </div>
                  </div>

                  <div style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', padding: '14px 10px', borderRadius: '12px', border: '1.5px solid #A7F3D0', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.03em' }}>NON-TEACHING</div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#059669', marginTop: '4px', lineHeight: 1 }}>{nonTeachingCount}</div>
                    <div style={{ fontSize: '11px', color: '#059669', fontWeight: '700', marginTop: '6px' }}>
                      {totalPersonnel > 0 ? Math.round((nonTeachingCount / totalPersonnel) * 100) : 0}% of Total
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  📊 Total Staff: <strong>{totalPersonnel}</strong> personnel (<strong>{teachingCount}</strong> Teaching, <strong>{relatedTeachingCount}</strong> Related Teaching, <strong>{nonTeachingCount}</strong> Non-Teaching).
                </div>
              </div>

              {/* APPOINTMENT STATUS BREAKDOWN CARD */}
              <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiUserCheck style={{ color: '#8B5CF6' }} /> Employment Appointment Status
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#6D28D9', background: '#F3E8FF', padding: '2px 8px', borderRadius: '6px' }}>
                    Plantilla & HR Status
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  {Object.entries(appointmentCounts).map(([status, count]) => (
                    <div key={status} style={{ background: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '700' }}>{status}</div>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--navy)', marginTop: '2px' }}>{count}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', background: '#F1F5F9', padding: '10px 12px', borderRadius: '8px' }}>
                  📌 Regular Permanent staff constitute <strong>{totalPersonnel > 0 ? Math.round(((appointmentCounts['PERMANENT'] || 0) / totalPersonnel) * 100) : 0}%</strong> of the school's personnel roster.
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: JUNIOR HIGH SCHOOL SUBJECTS (UNIFIED CARD WITH STACKED BARS & COMPETENCY MATRIX) */}
            <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              {/* Header & Level Filter Tabs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1D4ED8', margin: 0 }}>
                    {activeSubjectLevel === 'jhs' ? 'Junior High School Subjects' : activeSubjectLevel === 'elem' ? 'Elementary Subjects' : 'Senior High School Subjects'}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                    Subject workload specialization alignment & competency breakdown
                  </p>
                </div>

                {/* Level Filter Tabs */}
                <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <button
                    type="button"
                    onClick={() => setActiveSubjectLevel('elem')}
                    style={{
                      border: 0,
                      background: activeSubjectLevel === 'elem' ? '#FFFFFF' : 'transparent',
                      color: activeSubjectLevel === 'elem' ? '#1D4ED8' : '#64748B',
                      fontWeight: activeSubjectLevel === 'elem' ? '800' : '600',
                      fontSize: '11px',
                      padding: '4px 10px',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      boxShadow: activeSubjectLevel === 'elem' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    Elementary
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubjectLevel('jhs')}
                    style={{
                      border: 0,
                      background: activeSubjectLevel === 'jhs' ? '#FFFFFF' : 'transparent',
                      color: activeSubjectLevel === 'jhs' ? '#1D4ED8' : '#64748B',
                      fontWeight: activeSubjectLevel === 'jhs' ? '800' : '600',
                      fontSize: '11px',
                      padding: '4px 10px',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      boxShadow: activeSubjectLevel === 'jhs' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    Junior High School
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubjectLevel('shs')}
                    style={{
                      border: 0,
                      background: activeSubjectLevel === 'shs' ? '#FFFFFF' : 'transparent',
                      color: activeSubjectLevel === 'shs' ? '#1D4ED8' : '#64748B',
                      fontWeight: activeSubjectLevel === 'shs' ? '800' : '600',
                      fontSize: '11px',
                      padding: '4px 10px',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      boxShadow: activeSubjectLevel === 'shs' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    Senior High School
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '12px', fontWeight: '600', color: '#475569', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '16px', height: '12px', background: '#1D68D8', borderRadius: '3px', display: 'inline-block' }}></span>
                  <span>ALIGNED Subject-Specialization</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '16px', height: '12px', background: '#B91C1C', borderRadius: '3px', display: 'inline-block' }}></span>
                  <span>MISALIGNED Subject-Specialization</span>
                </div>
              </div>

              {/* SECTION A: Horizontal Stacked Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                {subjectAlignmentData.map(subj => {
                  const alignVal = subj.alignedPct;
                  const misalignVal = subj.misalignedPct;
                  const hasData = subj.total > 0;

                  return (
                    <div key={subj.key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '800', color: '#334155', textAlign: 'right', textTransform: 'uppercase', lineHeight: 1.2 }}>
                        {subj.label}
                      </div>
                      <div style={{ position: 'relative', height: '26px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                        {hasData ? (
                          <>
                            {alignVal > 0 && (
                              <div
                                style={{
                                  width: `${alignVal}%`,
                                  background: '#1D68D8',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justify: 'flex-end',
                                  paddingRight: alignVal > 15 ? '8px' : '2px',
                                  color: 'white',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  whiteSpace: 'nowrap',
                                  transition: 'width 0.3s ease'
                                }}
                              >
                                {alignVal}%
                              </div>
                            )}
                            {misalignVal > 0 && (
                              <div
                                style={{
                                  width: `${misalignVal}%`,
                                  background: '#B91C1C',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justify: 'center',
                                  color: 'white',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  whiteSpace: 'nowrap',
                                  transition: 'width 0.3s ease'
                                }}
                              >
                                {misalignVal}%
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#94A3B8', fontStyle: 'italic' }}>
                            No active workload rows
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-Axis Scale Labels */}
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', marginTop: '12px' }}>
                <div></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '700', color: '#94A3B8' }}>
                  <span>0%</span>
                  <span>20%</span>
                  <span>40%</span>
                  <span>60%</span>
                  <span>80%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

          </div>

          {/* THIRD ROW: TEACHER EXCESS & SHORTAGE BY GRADE LEVEL */}
          <div className="card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid var(--line)', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--navy)', margin: 0 }}>
                  ⚖️ Teacher Excess & Shortage Summary by Grade Level
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Analysis comparing organized class section demand against assigned teacher staffing levels per grade.
                </p>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#0369A1', background: '#E0F2FE', padding: '4px 10px', borderRadius: '6px' }}>
                Staff Balance Analysis
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {Object.entries(gradeTeacherAnalysis).map(([grade, data]) => {
                let bg = '#F8FAFC';
                let border = '#E2E8F0';
                let badgeBg = '#E2E8F0';
                let badgeColor = '#475569';

                if (data.statusBadgeClass === 'balanced') {
                  bg = '#F0FDF4';
                  border = '#BBF7D0';
                  badgeBg = '#DCFCE7';
                  badgeColor = '#15803D';
                } else if (data.statusBadgeClass === 'shortage') {
                  bg = '#FEF2F2';
                  border = '#FCA5A5';
                  badgeBg = '#FEE2E2';
                  badgeColor = '#991B1B';
                } else if (data.statusBadgeClass === 'surplus') {
                  bg = '#FEF3C7';
                  border = '#FCD34D';
                  badgeBg = '#FEF3C7';
                  badgeColor = '#92400E';
                }

                return (
                  <div key={grade} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>{grade}</strong>
                      <span style={{ fontSize: '10px', fontWeight: '800', background: badgeBg, color: badgeColor, padding: '2px 8px', borderRadius: '9999px' }}>
                        {data.statusText}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569' }}>
                      <span>Organized Sections:</span>
                      <strong>{data.sectionCount}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                      <span>Assigned Teachers:</span>
                      <strong>{data.teacherCount}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* UPLOAD MODAL */}
      {isUploadModalOpen && (
        <ESF7UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
      )}

    </section>
  );
}
