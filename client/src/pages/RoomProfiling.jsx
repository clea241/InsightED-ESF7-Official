import React, { useState, useEffect, useRef } from 'react';
import SearchableDropdown from '../components/SearchableDropdown';
import { 
  useApp, 
  TESDA_CERTIFICATION_OPTIONS, 
  NEAP_TRAINING_OPTIONS,
  validateDepEdEmail
} from '../context/AppContext';
import { get10MinPasscode } from '../utils/passcode';
import { api } from '../services/api';

function DatePickerDropdowns({ value, onChange, disabled = false, maxDate, minDate, required = false }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const containerRef = useRef(null);

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

  useEffect(() => {
    if (cleanValue) {
      const d = new Date(cleanValue + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    } else if (minDate) {
      const d = minDate instanceof Date ? minDate : new Date(minDate);
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [cleanValue, minDate]);

  useEffect(() => {
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

    if (maxDate && cellDate > maxDate) return;
    if (minDate && cellDate < minDate) return;

    onChange(formatDate(cellDate));
    setShowCalendar(false);
  };

  const isSelected = (cellDate) => {
    return cleanValue && formatDate(cellDate) === cleanValue;
  };

  const isDisabled = (cellDate) => {
    if (maxDate && cellDate > maxDate) return true;
    if (minDate && cellDate < minDate) return true;
    return false;
  };

  const isToday = (cellDate) => {
    return formatDate(cellDate) === formatDate(new Date());
  };

  const isRed = required && !cleanValue;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
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
        <span style={{ fontWeight: cleanValue ? '600' : 'normal' }}>{getDisplayDate()}</span>
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
                  background: '#F8FAFC',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--navy)'
                }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--navy)'
                }}
              >
                ›
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map(d => (
              <span key={d} style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>
                {d}
              </span>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '2px'
          }}>
            {cells.map((c, i) => {
              const selected = isSelected(c.date);
              const today = isToday(c.date);
              const disabledDay = isDisabled(c.date);
              const isCurrentMonth = c.monthOffset === 0;

              return (
                <div
                  key={i}
                  onClick={(e) => !disabledDay && handleDaySelect(c.date, e)}
                  style={{
                    height: '32px',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12px',
                    fontWeight: selected || today ? '700' : '500',
                    borderRadius: '8px',
                    cursor: disabledDay ? 'not-allowed' : 'pointer',
                    background: selected ? 'var(--blue)' : (today ? '#E0F2FE' : 'transparent'),
                    color: selected ? 'white' : (disabledDay ? '#CBD5E1' : (isCurrentMonth ? 'var(--navy)' : '#94A3B8')),
                    border: today && !selected ? '1px solid var(--blue)' : 'none',
                    opacity: disabledDay ? 0.4 : 1,
                    transition: 'all 0.1s'
                  }}
                >
                  {c.day}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setShowCalendar(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(formatDate(new Date()));
                setShowCalendar(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--blue)',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '700'
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoomProfiling() {
  const { personnel: appPersonnel, setPersonnel, scannedRoom } = useApp() || {};
  const [personnelList, setPersonnelList] = useState(appPersonnel || []);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [formData, setFormData] = useState(null);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'development'
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetSchoolId = urlParams.get('schoolId') || urlParams.get('school_id');

    if (targetSchoolId) {
      api.getPersonnel(targetSchoolId).then(res => {
        if (Array.isArray(res) && res.length > 0) {
          setPersonnelList(res);
          try {
            localStorage.setItem('insighted_personnel_cache', JSON.stringify(res));
          } catch (e) {}
        } else {
          api.getAutofillTemplate(targetSchoolId).then(tmpl => {
            if (Array.isArray(tmpl) && tmpl.length > 0) {
              setPersonnelList(tmpl);
            }
          });
        }
      }).catch(() => {
        api.getAutofillTemplate(targetSchoolId).then(tmpl => {
          if (Array.isArray(tmpl) && tmpl.length > 0) {
            setPersonnelList(tmpl);
          }
        });
      });
    } else if (Array.isArray(appPersonnel) && appPersonnel.length > 0) {
      setPersonnelList(appPersonnel);
      try {
        localStorage.setItem('insighted_personnel_cache', JSON.stringify(appPersonnel));
      } catch (e) {}
    } else {
      let cached = null;
      try {
        const raw = localStorage.getItem('insighted_personnel_cache');
        if (raw) cached = JSON.parse(raw);
      } catch (e) {}

      if (Array.isArray(cached) && cached.length > 0) {
        setPersonnelList(cached);
      } else {
        api.getPersonnel().then(res => {
          if (Array.isArray(res) && res.length > 0) {
            setPersonnelList(res);
            if (setPersonnel) setPersonnel(res);
            try {
              localStorage.setItem('insighted_personnel_cache', JSON.stringify(res));
            } catch (e) {}
          } else {
            api.getAutofillTemplate().then(tmpl => {
              if (Array.isArray(tmpl) && tmpl.length > 0) {
                setPersonnelList(tmpl);
                if (setPersonnel) setPersonnel(tmpl);
              }
            });
          }
        }).catch(() => {
          api.getAutofillTemplate().then(tmpl => {
            if (Array.isArray(tmpl) && tmpl.length > 0) {
              setPersonnelList(tmpl);
              if (setPersonnel) setPersonnel(tmpl);
            }
          });
        });
      }
    }
  }, [appPersonnel, setPersonnel]);

  // Map personnel to label strings for SearchableDropdown
  const teacherOptions = (personnelList || []).map(p => 
    `${(p.lastName || p.last || '').toUpperCase()}, ${p.firstName || p.first || ''} ${p.middleName || p.middle || ''} (${p.position || 'TEACHER'}) [${p.id}]`
  );

  const selectedTeacherLabel = selectedTeacherId
    ? (() => {
        const p = (personnelList || []).find(p => String(p.id) === String(selectedTeacherId));
        return p ? `${(p.lastName || p.last || '').toUpperCase()}, ${p.firstName || p.first || ''} ${p.middleName || p.middle || ''} (${p.position || 'TEACHER'}) [${p.id}]` : '';
      })()
    : '';

  const handleTeacherChange = (label) => {
    const match = label.match(/\[([^\]]+)\]$/);
    if (match && match[1]) {
      setSelectedTeacherId(match[1]);
    }
  };

  // Handle teacher selection change and baseline auto-population
  useEffect(() => {
    if (selectedTeacherId) {
      const teacher = (personnelList || []).find(p => String(p.id) === String(selectedTeacherId));
      if (teacher) {
        setFormData({
          ...teacher,
          firstName: teacher.firstName || teacher.first_name || '',
          lastName: teacher.lastName || teacher.last_name || '',
          middleName: teacher.middleName || teacher.middle_name || '',
          nameExtension: teacher.nameExtension || teacher.extensionName || teacher.ext_name || '',
          depedEmail: teacher.depedEmail || teacher.deped_email || '',
          birthdate: teacher.birthdate ? String(teacher.birthdate).substring(0, 10) : '',
          philsysNo: teacher.philsysNo || teacher.philsys_no || '',
          neapTrainingRows: Array.isArray(teacher.neapTrainingRows) ? teacher.neapTrainingRows : [],
          certificationRows: Array.isArray(teacher.certificationRows) ? teacher.certificationRows : [],
          otherTrainingRows: Array.isArray(teacher.otherTrainingRows) ? teacher.otherTrainingRows : []
        });
        setIsSubmitted(false);
        setIsUnlocked(false);
        setEnteredPasscode('');
        setErrorMessage('');
      }
    } else {
      setFormData(null);
      setIsUnlocked(false);
      setEnteredPasscode('');
      setErrorMessage('');
    }
  }, [selectedTeacherId, personnelList]);

  const handleVerifyPasscode = (e) => {
    e.preventDefault();
    if (!enteredPasscode) return;
    const cleanCode = enteredPasscode.trim().toUpperCase();
    const latestTeacher = (personnelList || []).find(p => String(p.id) === String(selectedTeacherId));
    if (!latestTeacher) {
      setErrorMessage('Please select a valid teacher.');
      return;
    }

    const currentCodeObj = get10MinPasscode(latestTeacher, 0);
    const prevCodeObj = get10MinPasscode(latestTeacher, -1);
    const currentCodeId = get10MinPasscode(latestTeacher.id, 0);
    const prevCodeId = get10MinPasscode(latestTeacher.id, -1);
    const overrideCode = latestTeacher.profilingCode ? latestTeacher.profilingCode.trim().toUpperCase() : '';

    if (
      cleanCode === currentCodeObj || 
      cleanCode === prevCodeObj || 
      cleanCode === currentCodeId || 
      cleanCode === prevCodeId || 
      (overrideCode && cleanCode === overrideCode)
    ) {
      setIsUnlocked(true);
      setErrorMessage('');
    } else {
      setErrorMessage('Incorrect or expired passcode. Please request the latest code from the School Head.');
    }
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
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

  // DO NOT AUTO-POPULATE HOURS: User manually specifies total hours
  const handleTrainingChange = (key, index, field, value) => {
    const rows = [...(formData[key] || [])];
    rows[index] = { ...rows[index], [field]: value };
    handleFieldChange(key, rows);
  };

  const addTrainingRow = (key) => {
    const rows = [...(formData[key] || [])];
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    rows.push({ clientKey: tempId, title: '', startDate: '', endDate: '', totalHours: '' });
    handleFieldChange(key, rows);
  };

  const removeTrainingRow = (key, index) => {
    const rows = [...(formData[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  // VALIDATION LOGIC:
  const rawEmail = formData ? formData.depedEmail || '' : '';
  const emailVal = validateDepEdEmail(rawEmail);
  const isEmailNA = rawEmail === 'N/A';
  const localVal = isEmailNA ? 'N/A' : getEmailLocal(rawEmail);
  const hasEmailError = !emailVal.isValid && !isEmailNA && !!rawEmail;

  const cleanPhilsys = String(formData?.philsysNo || '').replace(/\D/g, '');
  const isPhilsysValid = cleanPhilsys.length === 16;
  const isFirstNameValid = !!formData?.firstName?.trim();
  const isLastNameValid = !!formData?.lastName?.trim();
  const isBirthdateValid = !!formData?.birthdate;

  const allTrainings = [
    ...(formData?.neapTrainingRows || []),
    ...(formData?.certificationRows || []),
    ...(formData?.otherTrainingRows || [])
  ];

  const areTrainingsValid = allTrainings.every(tr => 
    !!tr.title?.trim() && 
    !!tr.startDate && 
    !!tr.endDate && 
    tr.totalHours !== '' && 
    Number(tr.totalHours) > 0
  );

  const isFormValid = isFirstNameValid && isLastNameValid && isBirthdateValid && isPhilsysValid && areTrainingsValid && !hasEmailError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData || !isFormValid) return;

    setIsSubmitting(true);
    const urlParams = new URLSearchParams(window.location.search);
    const targetSchoolId = urlParams.get('schoolId') || urlParams.get('school_id') || '199998';
    const targetRoom = urlParams.get('room') || scannedRoom || 'Faculty Room 1';

    try {
      const channel = new BroadcastChannel('insighted_room_qr_channel');
      channel.postMessage({ type: 'NEW_SUBMISSION', payload: formData });
      channel.close();
    } catch (err) {}

    try {
      const result = await api.submitRoomProfiling({
        schoolId: targetSchoolId,
        room: targetRoom,
        personnelId: formData.id,
        personnelName: `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
        profileData: formData
      });
      if (result && (result.success || result.queueId)) {
        setIsSubmitted(true);
      } else {
        alert(result?.error || 'Failed to submit profile to School Head queue. Please try again.');
      }
    } catch (err) {
      console.warn('Queue submission notice:', err.message);
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAge = (dobString) => {
    if (!dobString) return null;
    const birth = new Date(dobString + "T00:00:00");
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const currentAge = formData ? getAge(formData.birthdate) : null;

  if (isSubmitted) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '16px' }}>
        <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '24px', textAlign: 'center', background: '#FFFFFF', boxShadow: '0 12px 32px rgba(8, 49, 95, 0.08)' }}>
          <div className="card-inner" style={{ padding: '48px 24px', display: 'grid', gap: '20px', justifyItems: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'grid', placeItems: 'center', fontSize: '40px' }}>
              ✓
            </div>
            
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#16A34A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                VERIFICATION SUBMITTED
              </span>
              <h1 style={{ color: 'var(--navy)', fontSize: '24px', fontWeight: 800, margin: '6px 0 0 0' }}>
                Profile & L&D Submitted!
              </h1>
            </div>

            <p className="subtext" style={{ fontSize: '14px', color: 'var(--muted)', margin: 0, lineHeight: '1.6', maxWidth: '440px' }}>
              Thank you, <strong>{formData.firstName} {formData.lastName}</strong>! Your updated identity and L&D training details have been transmitted directly to your <strong>School Head</strong> for review.
            </p>

            <div style={{ marginTop: '8px', fontSize: '13px', padding: '14px 18px', background: '#F8FAFC', borderRadius: '16px', border: '1.5px solid var(--line)', color: 'var(--navy)', lineHeight: '1.5', width: '100%', maxWidth: '440px' }}>
              ℹ️ <strong>No further action required.</strong> Your School Head will merge your verified details directly into the official eSF7 roster.
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', width: '100%', maxWidth: '360px' }}>
              <button 
                className="btn secondary" 
                onClick={() => {
                  setSelectedTeacherId('');
                  setFormData(null);
                  setIsSubmitted(false);
                }}
                style={{ flex: 1, minHeight: '44px' }}
              >
                Switch Teacher
              </button>
              <button 
                className="btn" 
                onClick={() => window.close()}
                style={{ flex: 1, minHeight: '44px', background: 'var(--navy)', color: 'white' }}
              >
                Done
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 16px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <header style={{ 
        background: 'linear-gradient(135deg, var(--navy), var(--blue))', 
        padding: '24px 28px', 
        borderRadius: '24px', 
        color: 'white',
        boxShadow: '0 10px 30px rgba(8, 49, 95, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          INSIGHTED FACULTY ROOM PORTAL
        </span>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Personnel Profile & L&D Verification
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
          Update and verify your identity details and professional development for <strong>{scannedRoom || 'Faculty Room 1'}</strong>.
        </p>
      </header>

      {/* Roster Search / Selection */}
      {(!formData || !isUnlocked) && (
        <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '22px' }}>
          <div className="card-inner" style={{ display: 'grid', gap: '10px' }}>
            <label htmlFor="teacher-select" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 800 }}>
              Select Your Name from Roster:
            </label>
            <SearchableDropdown
              options={teacherOptions}
              value={selectedTeacherLabel}
              onChange={handleTeacherChange}
              placeholder="Search / Select your name..."
            />
          </div>
        </article>
      )}

      {/* Passcode Lock Screen */}
      {formData && !isUnlocked && (
        <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '22px', background: '#FFFFFF', overflow: 'hidden' }}>
          <div className="card-inner" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--blue-50)', display: 'grid', placeItems: 'center', fontSize: '32px', marginBottom: '8px' }}>
              🔐
            </div>
            
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)', margin: '0 0 8px 0' }}>
                Enter Profiling Passcode
              </h2>
              <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, maxWidth: '400px', lineHeight: '1.5' }}>
                To edit the profile of <strong>{formData.firstName} {formData.lastName}</strong>, please enter your 6-character dynamic passcode provided by your School Head.
              </p>
            </div>

            <form onSubmit={handleVerifyPasscode} style={{ width: '100%', maxWidth: '320px', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                <label htmlFor="passcode-input" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 800 }}>
                  6-Character Passcode
                </label>
                <input
                  id="passcode-input"
                  type="text"
                  maxLength={6}
                  placeholder="e.g. M1A2R3"
                  value={enteredPasscode}
                  onChange={(e) => setEnteredPasscode(e.target.value.toUpperCase())}
                  style={{
                    textAlign: 'center',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    letterSpacing: '0.2em',
                    padding: '12px',
                    textTransform: 'uppercase',
                    fontFamily: 'monospace',
                    borderRadius: '12px',
                    border: errorMessage ? '2px solid var(--red)' : '1.5px solid var(--line)'
                  }}
                  autoFocus
                  required
                />
              </div>

              {errorMessage && (
                <div style={{ color: 'var(--red)', fontSize: '12px', fontWeight: 700, padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                  ⚠️ {errorMessage}
                </div>
              )}

              <button type="submit" className="btn" style={{ width: '100%', marginTop: '4px', minHeight: '44px' }}>
                Unlock & Edit My Profile
              </button>
            </form>
          </div>
        </article>
      )}

      {/* Main Interactive Form: Personal Profile & L&D Training Only */}
      {formData && isUnlocked && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Sub Navigation Tabs */}
          <div className="tabs" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              👤 Personnel Profile {!isPhilsysValid && <span style={{ color: '#EF4444' }}>●</span>}
            </button>
            <button
              type="button"
              className={`tab ${activeTab === 'development' ? 'active' : ''}`}
              onClick={() => setActiveTab('development')}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              📋 L&D Training ({
                (formData.neapTrainingRows?.length || 0) + 
                (formData.certificationRows?.length || 0) + 
                (formData.otherTrainingRows?.length || 0)
              }) {!areTrainingsValid && <span style={{ color: '#EF4444' }}>●</span>}
            </button>
          </div>

          {/* Form Card */}
          <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '22px', background: '#FFFFFF' }}>
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* TAB 1: PERSONNEL PROFILE */}
              {activeTab === 'profile' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  
                  {/* Legal Name */}
                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>
                    Legal Name
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>First Name *</label>
                    <input 
                      type="text" 
                      value={formData.firstName || ''} 
                      onChange={(e) => handleFieldChange('firstName', e.target.value.toUpperCase())}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Middle Name</label>
                    <input 
                      type="text" 
                      value={formData.middleName || ''} 
                      onChange={(e) => handleFieldChange('middleName', e.target.value.toUpperCase())}
                      placeholder="Leave blank if none"
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Last Name *</label>
                    <input 
                      type="text" 
                      value={formData.lastName || ''} 
                      onChange={(e) => handleFieldChange('lastName', e.target.value.toUpperCase())}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Extension Name (Optional)</label>
                    <input 
                      type="text" 
                      value={formData.nameExtension || ''} 
                      onChange={(e) => handleFieldChange('nameExtension', e.target.value.toUpperCase())}
                      placeholder="e.g. JR., SR., III, IV"
                    />
                  </div>

                  {/* DepEd Email */}
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '4px' }}>
                    <label>DepEd Official Email</label>
                    <div className="deped-email-field" style={{
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '12px',
                      border: hasEmailError ? '2px solid #EF4444' : '1.5px solid var(--line)',
                      background: hasEmailError ? '#FEF2F2' : 'white',
                      overflow: 'hidden'
                    }}>
                      <input
                        type="text"
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
                        placeholder="firstname.lastname"
                        style={{
                          flex: 1,
                          border: 'none',
                          background: 'transparent',
                          borderRadius: 0,
                          padding: '10px 14px',
                          fontSize: '14px',
                          color: hasEmailError ? '#B91C1C' : 'var(--navy)',
                          outline: 'none'
                        }}
                      />
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: '42px',
                        padding: '0 14px',
                        background: hasEmailError ? '#FEE2E2' : 'var(--blue-50)',
                        borderLeft: hasEmailError ? '1px solid #FCA5A5' : '1px solid var(--line)',
                        fontSize: '13px',
                        color: hasEmailError ? '#DC2626' : 'var(--blue)',
                        fontWeight: 'bold',
                        userSelect: 'none',
                        whiteSpace: 'nowrap'
                      }}>
                        @deped.gov.ph
                      </span>
                    </div>

                    {hasEmailError && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#DC2626', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>⚠️</span> {emailVal.error}
                      </p>
                    )}
                  </div>

                  {/* Government ID and Birthdate */}
                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>
                    Required Government ID & Birthdate
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>PhilSys No. (National ID) *</span>
                      <span style={{ color: isPhilsysValid ? '#059669' : '#DC2626', fontWeight: 700 }}>
                        {cleanPhilsys.length}/16 digits {isPhilsysValid ? '✓' : '(Required 16 digits)'}
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="16-digit PhilSys Card Number"
                      maxLength={16}
                      value={formData.philsysNo || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        handleFieldChange('philsysNo', val);
                      }}
                      required
                      style={{
                        borderColor: !isPhilsysValid ? '#EF4444' : undefined,
                        background: !isPhilsysValid ? '#FEF2F2' : undefined
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Birthdate *</label>
                    <DatePickerDropdowns
                      value={formData.birthdate || ''}
                      onChange={(val) => handleFieldChange('birthdate', val)}
                      maxDate={new Date()}
                      required
                    />
                    {currentAge !== null && (
                      <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: '700', marginTop: '2px' }}>
                        Age: {currentAge} years old
                      </span>
                    )}
                  </div>

                </div>
              )}

              {/* TAB 2: L&D TRAINING */}
              {activeTab === 'development' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* 1. NEAP SECTION */}
                  <div style={{ border: '1.5px solid var(--line)', padding: '20px', borderRadius: '16px', background: 'var(--blue-50)22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '15px' }}>NEAP Recognized Programs</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--muted)' }}>National Educators Academy of the Philippines accredited trainings.</p>
                      </div>
                      <button className="btn secondary" type="button" onClick={() => addTrainingRow('neapTrainingRows')}>
                        + Add NEAP Row
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(formData.neapTrainingRows || []).map((tr, index) => {
                        const isHoursMissing = tr.totalHours === '' || Number(tr.totalHours) <= 0;

                        return (
                          <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '16px', background: 'white', border: isHoursMissing ? '1.5px solid #FCA5A5' : '1.5px solid var(--line)', borderRadius: '14px' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label>Training Program Title *</label>
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
                              <label>Start Date *</label>
                              <DatePickerDropdowns
                                value={tr.startDate || ''}
                                onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'startDate', val)}
                                maxDate={new Date()}
                                required
                              />
                            </div>
                            <div>
                              <label>End Date *</label>
                              <DatePickerDropdowns
                                value={tr.endDate || ''}
                                onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'endDate', val)}
                                maxDate={new Date()}
                                minDate={tr.startDate || undefined}
                                required
                              />
                            </div>
                            <div>
                              <label style={{ color: isHoursMissing ? '#DC2626' : undefined }}>
                                Total Hours * {isHoursMissing && '(Required)'}
                              </label>
                              <input 
                                type="number" 
                                min={1}
                                placeholder="Enter hours (e.g. 40)"
                                value={tr.totalHours === '' || tr.totalHours === undefined ? '' : tr.totalHours} 
                                onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'totalHours', e.target.value === '' ? '' : Number(e.target.value))}
                                required
                                style={{
                                  borderColor: isHoursMissing ? '#EF4444' : undefined,
                                  background: isHoursMissing ? '#FEF2F2' : undefined
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                              <button className="btn danger" type="button" onClick={() => removeTrainingRow('neapTrainingRows', index)} style={{ width: '100%', minHeight: '44px' }}>
                                🗑️ Delete Row
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(formData.neapTrainingRows || []).length === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No NEAP training records encoded.</p>
                      )}
                    </div>
                  </div>

                  {/* 2. TESDA / CERTIFICATION SECTION */}
                  <div style={{ border: '1.5px solid var(--line)', padding: '20px', borderRadius: '16px', background: 'var(--blue-50)22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '15px' }}>TESDA National Certificates & Certifications</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--muted)' }}>NC I, NC II, NC III, NC IV, TM I or international credentials.</p>
                      </div>
                      <button className="btn secondary" type="button" onClick={() => addTrainingRow('certificationRows')}>
                        + Add Cert Row
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(formData.certificationRows || []).map((tr, index) => {
                        const isHoursMissing = tr.totalHours === '' || Number(tr.totalHours) <= 0;

                        return (
                          <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '16px', background: 'white', border: isHoursMissing ? '1.5px solid #FCA5A5' : '1.5px solid var(--line)', borderRadius: '14px' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label>Certification Title *</label>
                              <SearchableDropdown
                                options={TESDA_CERTIFICATION_OPTIONS}
                                value={tr.title || ''}
                                onChange={(val) => handleTrainingChange('certificationRows', index, 'title', val)}
                                placeholder="SELECT TESDA NC / CERTIFICATION..."
                                allowCustom={true}
                              />
                            </div>
                            <div>
                              <label>Start Date *</label>
                              <DatePickerDropdowns
                                value={tr.startDate || ''}
                                onChange={(val) => handleTrainingChange('certificationRows', index, 'startDate', val)}
                                maxDate={new Date()}
                                required
                              />
                            </div>
                            <div>
                              <label>End Date *</label>
                              <DatePickerDropdowns
                                value={tr.endDate || ''}
                                onChange={(val) => handleTrainingChange('certificationRows', index, 'endDate', val)}
                                maxDate={new Date()}
                                minDate={tr.startDate || undefined}
                                required
                              />
                            </div>
                            <div>
                              <label style={{ color: isHoursMissing ? '#DC2626' : undefined }}>
                                Total Hours * {isHoursMissing && '(Required)'}
                              </label>
                              <input 
                                type="number" 
                                min={1}
                                placeholder="Enter hours (e.g. 40)"
                                value={tr.totalHours === '' || tr.totalHours === undefined ? '' : tr.totalHours} 
                                onChange={(e) => handleTrainingChange('certificationRows', index, 'totalHours', e.target.value === '' ? '' : Number(e.target.value))}
                                required
                                style={{
                                  borderColor: isHoursMissing ? '#EF4444' : undefined,
                                  background: isHoursMissing ? '#FEF2F2' : undefined
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                              <button className="btn danger" type="button" onClick={() => removeTrainingRow('certificationRows', index)} style={{ width: '100%', minHeight: '44px' }}>
                                🗑️ Delete Row
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(formData.certificationRows || []).length === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No TESDA or Certification records encoded.</p>
                      )}
                    </div>
                  </div>

                  {/* 3. OTHER TRAININGS SECTION */}
                  <div style={{ border: '1.5px solid var(--line)', padding: '20px', borderRadius: '16px', background: 'var(--blue-50)22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '15px' }}>Other L&D Programs</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--muted)' }}>School-based INSET, LAC Sessions, Division Workshops, Child Protection, etc.</p>
                      </div>
                      <button className="btn secondary" type="button" onClick={() => addTrainingRow('otherTrainingRows')}>
                        + Add Training Row
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(formData.otherTrainingRows || []).map((tr, index) => {
                        const isHoursMissing = tr.totalHours === '' || Number(tr.totalHours) <= 0;

                        return (
                          <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '16px', background: 'white', border: isHoursMissing ? '1.5px solid #FCA5A5' : '1.5px solid var(--line)', borderRadius: '14px' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label>Training Title *</label>
                              <SearchableDropdown
                                options={[
                                  'OTHER (SPECIFY CUSTOM...)',
                                  'SCHOOL-BASED INSET',
                                  'DIVISION TRAINING WORKSHOP',
                                  'REGIONAL MASS TRAINING',
                                  'LEARNING ACTION CELL (LAC)',
                                  'RESEARCH CAPABILITY BUILDING',
                                  'DRRM TRAINING',
                                  'CHILD PROTECTION POLICY SEMINAR',
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
                                'LEARNING ACTION CELL (LAC)',
                                'RESEARCH CAPABILITY BUILDING',
                                'DRRM TRAINING',
                                'CHILD PROTECTION POLICY SEMINAR',
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
                              <label>Start Date *</label>
                              <DatePickerDropdowns
                                value={tr.startDate || ''}
                                onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'startDate', val)}
                                maxDate={new Date()}
                                required
                              />
                            </div>
                            <div>
                              <label>End Date *</label>
                              <DatePickerDropdowns
                                value={tr.endDate || ''}
                                onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'endDate', val)}
                                maxDate={new Date()}
                                minDate={tr.startDate || undefined}
                                required
                              />
                            </div>
                            <div>
                              <label style={{ color: isHoursMissing ? '#DC2626' : undefined }}>
                                Total Hours * {isHoursMissing && '(Required)'}
                              </label>
                              <input 
                                type="number" 
                                min={1}
                                placeholder="Enter hours (e.g. 40)"
                                value={tr.totalHours === '' || tr.totalHours === undefined ? '' : tr.totalHours} 
                                onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'totalHours', e.target.value === '' ? '' : Number(e.target.value))}
                                required
                                style={{
                                  borderColor: isHoursMissing ? '#EF4444' : undefined,
                                  background: isHoursMissing ? '#FEF2F2' : undefined
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                              <button className="btn danger" type="button" onClick={() => removeTrainingRow('otherTrainingRows', index)} style={{ width: '100%', minHeight: '44px' }}>
                                🗑️ Delete Row
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(formData.otherTrainingRows || []).length === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No other training records encoded.</p>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </article>

          {/* Validation Checklist / Guidance */}
          {!isFormValid && (
            <div style={{ padding: '12px 18px', background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '12px', fontSize: '12px', color: '#B91C1C' }}>
              <strong>⚠️ To submit, please complete the following required fields:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {!isFirstNameValid && <li>First Name is required.</li>}
                {!isLastNameValid && <li>Last Name is required.</li>}
                {!isBirthdateValid && <li>Birthdate is required.</li>}
                {!isPhilsysValid && <li>PhilSys Card No. must be exactly 16 digits ({cleanPhilsys.length}/16 entered).</li>}
                {!areTrainingsValid && <li>All training rows must have Title, Start Date, End Date, and positive Total Hours.</li>}
                {hasEmailError && <li>Please enter a valid DepEd email address.</li>}
              </ul>
            </div>
          )}

          {/* Bottom Action Submit Button */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button 
              type="button" 
              className="btn secondary"
              onClick={() => {
                if (window.confirm('Reset all changes back to baseline school records?')) {
                  const teacher = (personnelList || []).find(p => String(p.id) === String(selectedTeacherId));
                  if (teacher) setFormData({ ...teacher });
                }
              }}
              style={{ minHeight: '46px', padding: '10px 20px', fontSize: '13px' }}
            >
              Reset to Baseline
            </button>

            <button 
              type="submit" 
              className="btn"
              disabled={isSubmitting || !isFormValid}
              style={{ 
                padding: '12px 28px', 
                fontSize: '14px', 
                fontWeight: 800, 
                minHeight: '46px', 
                background: isFormValid ? 'var(--navy)' : '#94A3B8', 
                color: 'white',
                cursor: isFormValid ? 'pointer' : 'not-allowed',
                opacity: isFormValid ? 1 : 0.6
              }}
            >
              {isSubmitting ? 'Submitting to School Head...' : '✓ Submit Verified Profile & L&D'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
