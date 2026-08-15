import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import ESF7UploadModal from '../components/ESF7UploadModal';
import { FiUsers, FiSliders, FiFileText, FiLayers, FiAlertCircle, FiCheckCircle, FiUserCheck, FiTarget, FiPieChart } from 'react-icons/fi';
import '../premium-dashboard.css';

export default function Dashboard() {
  const { personnel, classSections, schoolInfo, setActiveView, showToast } = useApp();
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
  const maleCount = personnel.filter(p => String(p.sexAtBirth || p.gender || '').toUpperCase().startsWith('M')).length;
  const femaleCount = personnel.filter(p => String(p.sexAtBirth || p.gender || '').toUpperCase().startsWith('F')).length;

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

  return (
    <section id="dashboard" className="view premium-dashboard" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. HERO HEADER BANNER */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        borderRadius: '20px',
        padding: '24px 32px',
        color: '#FFFFFF',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justify: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#60A5FA',
              border: '1px solid rgba(96, 165, 250, 0.3)',
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: '700',
              letterSpacing: '0.05em'
            }}>
              {termStatus.current_school_year}
            </span>

            <span style={{
              background: termStatus.block_type === 'INSTRUCTIONAL' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: termStatus.block_type === 'INSTRUCTIONAL' ? '#34D399' : '#FBBF24',
              border: `1px solid ${termStatus.block_type === 'INSTRUCTIONAL' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: termStatus.block_type === 'INSTRUCTIONAL' ? '#10B981' : '#F59E0B'
              }}></span>
              {termStatus.active_term} — {termStatus.block_type === 'INSTRUCTIONAL' ? 'Instructional Block' : 'End of Term'}
            </span>

            {termStatus.overload_pay_eligible ? (
              <span style={{ fontSize: '11px', color: '#A7F3D0', background: 'rgba(6, 78, 59, 0.4)', padding: '2px 8px', borderRadius: '6px' }}>
                ⚡ Overload Pay Eligible
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: '#FDE68A', background: 'rgba(120, 53, 15, 0.4)', padding: '2px 8px', borderRadius: '6px' }}>
                ⛔ No Overload Pay
              </span>
            )}
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#F8FAFC', letterSpacing: '-0.025em' }}>
            {schoolName}
          </h1>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '13px' }}>
            📅 Active Date Range: <strong style={{ color: '#E2E8F0' }}>{termStatus.active_date_range}</strong>
          </p>
        </div>

        {/* QUICK ACTION BUTTONS */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setActiveView('roster')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '10px 18px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <FiUsers size={16} /> + Add Personnel
          </button>

          <button 
            onClick={() => setActiveView('organized_classes')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '10px 18px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <FiLayers size={16} /> Organized Classes
          </button>

          <button 
            onClick={() => setActiveView('validation')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#FFFFFF',
              border: 0,
              padding: '10px 20px',
              borderRadius: '12px',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            <FiFileText size={16} /> Generate Form 7
          </button>
        </div>
      </div>

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

              <div style={{ display: 'flex', gap: '16px', background: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700' }}>MALE</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#1E40AF' }}>{maleCount}</div>
                </div>
                <div style={{ width: '1px', background: 'var(--line)' }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700' }}>FEMALE</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#9333EA' }}>{femaleCount}</div>
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

          {/* SECOND ROW: AGE BRACKETS & APPOINTMENT STATUS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
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
