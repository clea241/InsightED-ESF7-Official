import React, { useState, useEffect, useMemo } from 'react';
import { useApp, POSITION_OPTIONS_BY_CATEGORY, detectPersonnelTypeFromPosition, isCanonicalPosition, getCategoryForCanonicalPosition, validateDepEdEmail } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';
import DepEdEmailInfoModal from '../components/DepEdEmailInfoModal';
import ESF7UploadModal from '../components/ESF7UploadModal';
import PortalHeader from '../components/PortalHeader';
import { api } from '../services/api';
import { FiPlus, FiSave, FiTag, FiLink, FiUser, FiTrash2, FiInfo, FiX, FiUploadCloud, FiRefreshCw, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';


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
      <div
        onClick={handleOpenCalendar}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: '12px',
          border: disabled ? '1.5px solid #e2e8f0' : (isRed ? '1.5px solid #EF4444' : '1.5px solid var(--line, #cbd5e1)'),
          background: disabled ? '#f1f5f9' : (isRed ? '#FEF2F2' : 'white'),
          color: cleanValue ? 'var(--navy)' : '#94a3b8',
          fontFamily: 'inherit',
          fontSize: '13px',
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
          style={{ color: 'var(--blue, #0284C7)', opacity: disabled ? 0.5 : 1 }}
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
          border: '1.5px solid var(--line, #cbd5e1)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.08)',
          padding: '16px',
          zIndex: 99999,
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
              fontSize: '13px',
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
                  fontSize: '12px',
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
                  fontSize: '12px',
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

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={isPrevDisabled}
                style={{
                  background: isPrevDisabled ? '#F1F5F9' : '#F8FAFC',
                  border: '1px solid var(--line, #cbd5e1)',
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
                  border: '1px solid var(--line, #cbd5e1)',
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

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <span key={d} style={{
                fontSize: '11px',
                fontWeight: '600',
                color: '#64748b'
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
                    width: '30px',
                    height: '30px',
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
                    fontSize: '12px',
                    fontWeight: selected ? '700' : 'normal',
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

export default function Roster() {
  const { personnel, setPersonnel, schoolInfo, addPersonnel, deletePersonnel, resolveBorrowedPersonnel, toggleSchoolHead, commitDraftPersonnel, setActivePersonnelId, setActiveView, showConfirm, showToast, hasUnsavedChanges, completeNode, outgoingRequests, requestHistory } = useApp();
  
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'lastName', direction: 'asc' });
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [isEmailInfoOpen, setIsEmailInfoOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [harvestStatus, setHarvestStatus] = useState(null);
  const [isCheckingHarvest, setIsCheckingHarvest] = useState(false);
  const [isHeadRequiredModalOpen, setIsHeadRequiredModalOpen] = useState(false);
  const [highlightHeadColumn, setHighlightHeadColumn] = useState(false);

  // Poll eSF7 Harvester Queue status if roster is empty
  useEffect(() => {
    const rawSchoolId = schoolInfo?.schoolId ? String(schoolInfo.schoolId).replace(/^SCH-/i, '').trim() : '';
    if (!rawSchoolId || personnel.length > 0) return;

    let isMounted = true;
    const checkHarvest = async () => {
      try {
        setIsCheckingHarvest(true);
        const data = await api.getHarvestStatus(rawSchoolId);
        if (!isMounted) return;

        if (data.status && data.status !== 'NOT_FOUND') {
          setHarvestStatus(data);
          // If status completed, trigger personnel reload from backend
          if (data.status === 'VERIFIED') {
            try {
              const pData = await api.getPersonnel(rawSchoolId);
              if (Array.isArray(pData) && pData.length > 0 && isMounted) {
                setPersonnel(pData);
                if (showToast) showToast('Auto-populated faculty roster from harvested eSF7!', 'success');
              }
            } catch (pErr) {
              console.warn('Personnel reload warning:', pErr);
            }
          }
        }
      } catch (err) {
        console.warn('Harvest check warning:', err.message);
      } finally {
        if (isMounted) setIsCheckingHarvest(false);
      }
    };

    checkHarvest();
    const interval = setInterval(checkHarvest, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [schoolInfo?.schoolId, personnel.length]);

  // Add Personnel Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({
    salutation: 'MR.',
    firstName: '',
    middleName: '',
    lastName: '',
    nameExtension: '',
    birthdate: '',
    depedEmailLocal: '',
    type: 'teaching',
    position: POSITION_OPTIONS_BY_CATEGORY.teaching[0]
  });

  const maxBirthdate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    return d;
  }, []);

  const newPersonAge = getAge(newPerson.birthdate);
  let newPersonAgeStatusText = 'No birthdate';
  let newPersonAgeStatusClass = 'badge info';
  if (newPersonAge !== null) {
    if (newPersonAge < 15) {
      newPersonAgeStatusText = 'Underage (<15 yrs)';
      newPersonAgeStatusClass = 'badge warn';
    } else if (newPersonAge > 80) {
      newPersonAgeStatusText = 'Questionable age (>80 yrs)';
      newPersonAgeStatusClass = 'badge warn';
    } else {
      newPersonAgeStatusText = 'Age valid';
      newPersonAgeStatusClass = 'badge ok';
    }
  }



  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSaveAndContinue = async () => {
    // 1. DepEd eSF7 School Head Verification Gate
    const currentHead = personnel.find(p => p.isSchoolHead === true || p.is_school_head === true);
    if (!currentHead) {
      setIsHeadRequiredModalOpen(true);
      setHighlightHeadColumn(true);
      return;
    }

    // 2. Commit any pending auto-fill drafts
    const drafts = personnel.filter(p => p.isDraft);
    if (drafts.length > 0) {
      try {
        setIsSavingDrafts(true);
        await commitDraftPersonnel();
      } catch (err) {
        console.warn('Draft auto-commit warning:', err);
      } finally {
        setIsSavingDrafts(false);
      }
    }

    // 3. Confirm and transition to Profiling
    if (showToast) {
      showToast(`School Head verified: ${currentHead.firstName} ${currentHead.lastName}`, 'success');
    }

    if (completeNode) {
      completeNode('roster', 'profile');
    } else if (setActiveView) {
      setActiveView('profile');
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newPerson.firstName || !newPerson.lastName) {
      alert('Please fill out First Name and Last Name');
      return;
    }
    if (!newPerson.birthdate) {
      alert('Please select a valid birthdate.');
      return;
    }
    const personAge = getAge(newPerson.birthdate);
    if (personAge !== null && personAge < 15) {
      alert('Personnel must be at least 15 years old.');
      return;
    }


    const isCook = String(newPerson.position || '').trim().toUpperCase() === 'COOK';
    const addedId = await addPersonnel({
      salutation: newPerson.salutation,
      firstName: newPerson.firstName.toUpperCase().trim(),
      middleName: newPerson.middleName ? newPerson.middleName.toUpperCase().trim() : 'N/A',
      lastName: newPerson.lastName.toUpperCase().trim(),
      nameExtension: newPerson.nameExtension ? newPerson.nameExtension.toUpperCase().trim() : '',
      birthdate: newPerson.birthdate || '',
      depedEmail: '',
      noDepedEmail: false,
      no_deped_email: false,
      type: newPerson.type,
      position: newPerson.position,
      natureOfAppointment: isCook ? 'CONTRACTUAL' : (newPerson.natureOfAppointment || 'REGULAR PERMANENT'),
      hiringArrangement: isCook ? 'CONTRACTUAL' : (newPerson.hiringArrangement || 'REGULAR'),
      fundSource: isCook ? 'SBFP' : (newPerson.fundSource || 'NATIONAL')
    });

    // Close modal & reset form
    setIsModalOpen(false);
    setNewPerson({
      salutation: 'MR.',
      firstName: '',
      middleName: '',
      lastName: '',
      nameExtension: '',
      birthdate: '',
      type: 'teaching',
      position: POSITION_OPTIONS_BY_CATEGORY.teaching[0]
    });
    
    showToast('Personnel successfully added to roster.');
  };

  // Filter & Search Logic
  const filteredPersonnel = personnel
    .filter(p => {
      const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
      const matchesType = typeFilter === 'all' || pType === typeFilter;
      
      const fullName = `${p.firstName || ''} ${p.middleName || ''} ${p.lastName || ''} ${p.nameExtension || ''}`.toLowerCase();
      const email = (p.depedEmail || '').toLowerCase();
      const pos = (p.position || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch = fullName.includes(query) || email.includes(query) || pos.includes(query);

      return matchesType && matchesSearch;
    })
    .sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      if (typeof aValue === 'boolean') {
        aValue = aValue ? 1 : 0;
        bValue = bValue ? 1 : 0;
      } else {
        aValue = (aValue || '').toString().toLowerCase();
        bValue = (bValue || '').toString().toLowerCase();
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <section id="roster" className="view grid">
      <style>{`
        @keyframes headColumnPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
            border-color: #ef4444;
          }
          50% {
            box-shadow: 0 0 16px 4px rgba(239, 68, 68, 0.7);
            border-color: #dc2626;
          }
        }
        .school-head-highlight-cell {
          animation: headColumnPulse 1.8s infinite ease-in-out !important;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.6) !important;
        }
      `}</style>
      <PortalHeader
        title="Personnel Roster & Profile Directory"
        description="Master roster of all registered school personnel, position items, and status tracking."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={handleSaveAndContinue}
        continueText="Save & Continue to Profiling ➔"
      />
      <article className="card">

        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <h2>Personnel Roster</h2>
              <p className="subtext">View and manage all school staff members.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn" type="button" onClick={() => setIsModalOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FiPlus size={15} /> <span>Add Personnel</span>
              </button>
            </div>
          </div>

          {(() => {
            const drafts = personnel.filter(p => p.isDraft);
            if (drafts.length === 0) return null;
            return (
              <div style={{
                background: '#FEF3C7',
                border: '1.5px solid #FCD34D',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '15px',
                marginTop: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '15px',
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ color: '#92400E', margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Unsaved Auto-Fill Records Detected</h4>
                  <p style={{ color: '#B45309', margin: '4px 0 0 0', fontSize: '13px' }}>
                    {drafts.length} teacher profile(s) were auto-filled from the master database as drafts. Click <strong>Save Changes</strong> to commit them to the database.
                  </p>
                </div>
                <button 
                  className="btn" 
                  type="button" 
                  disabled={isSavingDrafts}
                  onClick={async () => {
                    setIsSavingDrafts(true);
                    await commitDraftPersonnel();
                    setIsSavingDrafts(false);
                  }}
                  style={{ background: '#D97706', color: 'white', border: 0 }}
                >
                  {isSavingDrafts ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            );
          })()}
          
          <div className="tabs" style={{ margin: '12px 0' }}>
            {['all', 'teaching', 'teaching-related', 'non-teaching'].map((type) => (
              <button
                key={type}
                className={`tab ${typeFilter === type ? 'active' : ''}`}
                onClick={() => setTypeFilter(type)}
                type="button"
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          <div className="roster-search-row">
            <label>Search roster</label>
            <input
              placeholder="Search name, DepEd email, category, or plantilla position…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Empty State Hero Card when no faculty records exist */}
          {personnel.length === 0 ? (
            <div style={{
              margin: '24px 0',
              padding: '40px 24px',
              backgroundColor: '#F8FAFC',
              borderRadius: '16px',
              border: '2px dashed #CBD5E1',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)'
              }}>
                <FiUser size={32} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: '0 0 8px' }}>
                No Faculty Records Found for Your Station
              </h3>
              <p style={{ maxWidth: '580px', color: '#64748B', fontSize: '13px', lineHeight: '1.6', margin: '0 0 20px' }}>
                No faculty records were detected for this school station. Click <strong>+ Add Personnel</strong> to encode your faculty profiles, plantilla positions, and item numbers.
              </p>

              {/* Ingestion Status Badge */}
              {harvestStatus && (harvestStatus.status === 'QUEUED' || harvestStatus.status === 'HARVESTING') && (
                <div style={{
                  marginBottom: '20px',
                  padding: '10px 18px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#1D4ED8',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  <FiRefreshCw className="spin" size={15} />
                  <span>
                    {harvestStatus.status === 'QUEUED' 
                      ? 'eSF7 spreadsheet queued for background ingestion...' 
                      : 'VM Harvester actively extracting personnel plantillas...'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                  }}
                  onClick={() => setIsModalOpen(true)}
                >
                  <FiPlus size={16} /> Add Personnel
                </button>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('firstName')}>First Name</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('middleName')}>Middle Name</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('lastName')}>Last Name</button></th>
                  <th>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <button className="roster-sort-button" type="button" onClick={() => handleSort('depedEmail')}>DepEd Email</button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsEmailInfoOpen(true); }}
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
                  </th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('type')}>Position Category</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('position')}>Plantilla Position</button></th>
                  <th style={{
                    width: '110px',
                    textAlign: 'center',
                    background: highlightHeadColumn ? '#fef2f2' : undefined,
                    border: highlightHeadColumn ? '2px dashed #ef4444' : undefined,
                    borderRadius: highlightHeadColumn ? '8px' : undefined,
                    transition: 'all 0.3s ease'
                  }}>
                    <button className="roster-sort-button" type="button" onClick={() => handleSort('isSchoolHead')}>
                      School Head {highlightHeadColumn && <span style={{ color: '#ef4444', fontWeight: '900' }}>*</span>}
                    </button>
                  </th>
                  <th style={{ width: '190px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersonnel.map((p) => (
                  <tr key={p.id} className="roster-row">
                    <td>{p.firstName}</td>
                    <td>{p.middleName || '—'}</td>
                    <td>
                      {p.lastName}{p.nameExtension ? ` ${p.nameExtension}` : ''}
                      {p.isDraft && (
                        <span style={{
                          marginLeft: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 6px',
                          background: '#FEF3C7',
                          color: '#D97706',
                          border: '1px solid #FCD34D',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }}>
                          Draft
                        </span>
                      )}
                      {(() => {
                        const isRejected = (() => {
                          if (p.reassignmentStatus === 'rejected' || p.requestStatus === 'rejected') return true;
                          const depStatus = String(p.deploymentStatus || p.deployment_status || '').toUpperCase();
                          if (depStatus.includes('REJECTED')) return true;

                          const pId = String(p.id || '').replace(/^(PER-|PRN-)/i, '').trim();
                          const prn = String(p.prn || p.profilingCode || '').replace(/^PRN-/i, '').trim();
                          const pFn = String(p.firstName || p.first_name || '').trim().toUpperCase();
                          const pLn = String(p.lastName || p.last_name || '').trim().toUpperCase();

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
                        })();

                        if (isRejected) {
                          return (
                            <span style={{
                              marginLeft: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              background: '#FEE2E2',
                              color: '#DC2626',
                              border: '1px solid #F87171',
                              borderRadius: '6px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }} title="Inter-School Reassignment Request Rejected by Target School">
                              <FiAlertCircle size={10} style={{ marginRight: '3px' }} /> REJECTED
                            </span>
                          );
                        }

                        if (p.isShared || String(p.deploymentStatus || p.deployment_status || '').toUpperCase().includes('BORROWED')) {
                          return (
                            <span style={{
                              marginLeft: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 6px',
                              background: String(p.deploymentStatus || p.deployment_status || '').toUpperCase().includes('BORROWED') ? '#FEF3C7' : '#e0e7ff',
                              color: String(p.deploymentStatus || p.deployment_status || '').toUpperCase().includes('BORROWED') ? '#92400E' : '#3730a3',
                              border: String(p.deploymentStatus || p.deployment_status || '').toUpperCase().includes('BORROWED') ? '1px solid #FCD34D' : '1px solid #c7d2fe',
                              borderRadius: '6px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }} title={String(p.deploymentStatus || p.deployment_status || '').toUpperCase().includes('BORROWED') ? "Borrowed from Mother School" : "Shared Personnel"}>
                              {String(p.deploymentStatus || p.deployment_status || '').toUpperCase().includes('BORROWED') ? (
                                <>
                                  <FiTag size={10} style={{ marginRight: '3px' }} /> BORROWED
                                </>
                              ) : (
                                <>
                                  <FiLink size={10} style={{ marginRight: '3px' }} /> SHARED
                                </>
                              )}
                            </span>
                          );
                        }

                        return null;
                      })()}
                    </td>
                    <td>{p.depedEmail}</td>
                    <td>
                      {(() => {
                        const isCanon = isCanonicalPosition(p.position);
                        if (!isCanon) {
                          return <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>—</span>;
                        }
                        const pType = getCategoryForCanonicalPosition(p.position) || detectPersonnelTypeFromPosition(p.position || '') || p.type || 'teaching';
                        return (
                          <span className={`category-badge category-${pType}`}>
                            {pType === 'teaching' ? 'Teaching' : pType === 'teaching-related' ? 'Related' : 'Non-Teaching'}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {isCanonicalPosition(p.position) ? p.position : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', width: '100px' }}>
                       {(() => {
                         const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || '';
                         const isNonTeaching = pType === 'non-teaching';
                         const isHead = Boolean(p.isSchoolHead === true || p.is_school_head === true);
                         return (
                           <label
                             className="switch"
                             style={{
                               position: 'relative',
                               display: 'inline-block',
                               width: '36px',
                               height: '20px',
                               opacity: isNonTeaching ? 0.4 : 1,
                               cursor: isNonTeaching ? 'not-allowed' : 'pointer'
                             }}
                             title={isNonTeaching ? "Non-Teaching personnel cannot be designated as School Head" : (isHead ? "Remove School Head Designation" : "Designate as School Head")}
                           >
                             <input
                               type="checkbox"
                               checked={isHead}
                               disabled={isNonTeaching}
                               onChange={async (e) => {
                                 if (isNonTeaching) {
                                   showToast("Non-Teaching personnel cannot be designated as School Head.");
                                   return;
                                 }
                                 const val = e.target.checked;
                                 if (val) {
                                   setHighlightHeadColumn(false);
                                   setIsHeadRequiredModalOpen(false);
                                   const currentHead = personnel.find(x => (x.isSchoolHead === true || x.is_school_head === true) && String(x.id) !== String(p.id));
                                   if (currentHead) {
                                     const confirmed = await showConfirm(
                                       "Change School Head",
                                       `Designate ${p.firstName} ${p.lastName} as the new School Head? This will replace ${currentHead.firstName} ${currentHead.lastName}.`
                                     );
                                     if (confirmed) {
                                       await toggleSchoolHead(p.id, true);
                                     }
                                   } else {
                                     await toggleSchoolHead(p.id, true);
                                   }
                                 } else {
                                   await toggleSchoolHead(p.id, false);
                                 }
                               }}
                               style={{ opacity: 0, width: 0, height: 0 }}
                             />
                             <span style={{
                               position: 'absolute',
                               cursor: isNonTeaching ? 'not-allowed' : 'pointer',
                               top: 0, left: 0, right: 0, bottom: 0,
                               backgroundColor: isHead ? 'var(--blue)' : '#cbd5e1',
                               transition: '0.3s', borderRadius: '20px'
                             }}
                             className={highlightHeadColumn && !isNonTeaching && !isHead ? 'school-head-highlight-cell' : ''}
                             >
                               <span style={{
                                 position: 'absolute', content: '""', height: '14px', width: '14px', left: isHead ? '18px' : '3px', bottom: '3px',
                                 backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                               }} />
                             </span>
                           </label>
                         );
                       })()}
                     </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {p.isDraft ? (
                          <button
                            className="btn"
                            style={{ 
                              minHeight: '34px', 
                              padding: '6px 12px', 
                              fontSize: '12px', 
                              background: '#D97706', 
                              color: 'white', 
                              border: 0 
                            }}
                            onClick={async () => {
                              await commitDraftPersonnel(p.id);
                            }}
                          >
                            Save
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn secondary"
                              style={{ minHeight: '34px', padding: '6px 12px', fontSize: '12px', border: '1px solid var(--blue)' }}
                              onClick={() => {
                                setActivePersonnelId(p.id);
                                setActiveView('profile');
                              }}
                            >
                              Profile
                            </button>
                            <button
                              className="btn secondary"
                              style={{ minHeight: '34px', padding: '6px 12px', fontSize: '12px', border: '1px solid var(--blue-600)' }}
                              onClick={() => {
                                setActivePersonnelId(p.id);
                                setActiveView('workload');
                              }}
                            >
                              Work
                            </button>
                          </>
                        )}
                        <button
                          className="btn danger"
                          style={{ minHeight: '34px', padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Delete Personnel"
                          onClick={async () => {
                            if (await showConfirm("Delete Personnel?", `Are you sure you want to delete ${p.firstName} ${p.lastName}?`)) {
                              deletePersonnel(p.id);
                            }
                          }}
                        >
                          <FiTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </article>

      {/* Add Personnel Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Personnel</h2>
                <p className="subtext">Encode the minimum roster information first. Additional profile details can be completed later.</p>
              </div>
              <button className="btn secondary modal-close" onClick={() => setIsModalOpen(false)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <FiX size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="modal-body">
              <div className="form-grid">
                <div>
                  <label>First Name</label>
                  <input
                    placeholder="First name"
                    value={newPerson.firstName}
                    onChange={(e) => setNewPerson({ ...newPerson, firstName: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div>
                  <label>Middle Name (Optional)</label>
                  <input
                    placeholder="Middle name"
                    value={newPerson.middleName}
                    onChange={(e) => setNewPerson({ ...newPerson, middleName: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label>Last Name</label>
                  <input
                    placeholder="Last name"
                    value={newPerson.lastName}
                    onChange={(e) => setNewPerson({ ...newPerson, lastName: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div>
                  <label>Extension Name (Optional)</label>
                  <input
                    placeholder="e.g. JR., SR., III"
                    maxLength={5}
                    value={newPerson.nameExtension}
                    onChange={(e) => setNewPerson({ ...newPerson, nameExtension: e.target.value.toUpperCase().slice(0, 5) })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.2fr', gap: '14px', alignItems: 'flex-start' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '700', fontSize: '12px', color: 'var(--navy)' }}>
                      Birthdate <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <DatePickerDropdowns
                      value={newPerson.birthdate || ''}
                      onChange={(val) => setNewPerson({ ...newPerson, birthdate: val })}
                      maxDate={maxBirthdate}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '700', fontSize: '12px', color: 'var(--navy)' }}>
                      Computed Age
                    </label>
                    <input 
                      value={newPersonAge === null ? '—' : `${newPersonAge} yrs`} 
                      disabled 
                      style={{ 
                        background: '#f1f5f9', 
                        color: '#334155', 
                        fontWeight: '700', 
                        cursor: 'not-allowed', 
                        width: '100%', 
                        minHeight: '44px', 
                        borderRadius: '12px', 
                        border: '1.5px solid var(--line, #cbd5e1)', 
                        padding: '0 14px', 
                        boxSizing: 'border-box' 
                      }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '700', fontSize: '12px', color: 'var(--navy)' }}>
                      Age Validation
                    </label>
                    <div style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
                      <span className={newPersonAgeStatusClass} style={{ padding: '8px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {newPersonAgeStatusText}
                      </span>
                    </div>
                  </div>
                </div>


                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label>Position Category</label>
                    <select
                      value={newPerson.type}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setNewPerson({
                          ...newPerson,
                          type: newType,
                          position: POSITION_OPTIONS_BY_CATEGORY[newType][0]
                        });
                      }}
                    >
                      <option value="teaching">TEACHING PERSONNEL</option>
                      <option value="teaching-related">RELATED TEACHING PERSONNEL</option>
                      <option value="non-teaching">NON-TEACHING PERSONNEL</option>
                    </select>
                  </div>

                  <div>
                    <label>Plantilla Position</label>
                    <SearchableDropdown
                      options={POSITION_OPTIONS_BY_CATEGORY[newPerson.type] || []}
                      value={newPerson.position?.startsWith('OTHERS') ? 'OTHERS' : newPerson.position}
                      onChange={(val) => {
                        if (val === 'OTHERS') {
                          setNewPerson({ ...newPerson, position: 'OTHERS' });
                        } else if (val === 'COOK') {
                          setNewPerson({
                            ...newPerson,
                            position: 'COOK',
                            type: 'non-teaching',
                            natureOfAppointment: 'CONTRACTUAL',
                            hiringArrangement: 'CONTRACTUAL',
                            fundSource: 'SBFP'
                          });
                        } else {
                          setNewPerson({ ...newPerson, position: val });
                        }
                      }}
                      placeholder="SELECT PLANTILLA POSITION..."
                    />
                    {newPerson.type === 'non-teaching' && (newPerson.position === 'OTHERS' || newPerson.position?.startsWith('OTHERS')) && (
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#64748B' }}>Specify Position (Max 50 characters)</label>
                        <input
                          type="text"
                          maxLength={50}
                          placeholder="Specify position title..."
                          value={newPerson.position === 'OTHERS' ? '' : newPerson.position.replace(/^OTHERS\s*-\s*/i, '')}
                          onChange={(e) => {
                            const val = e.target.value.substring(0, 50).toUpperCase();
                            setNewPerson({ ...newPerson, position: val ? `OTHERS - ${val}` : 'OTHERS' });
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
                          {(newPerson.position === 'OTHERS' ? '' : newPerson.position.replace(/^OTHERS\s*-\s*/i, '')).length}/50 characters
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button 
                  className="btn" 
                  type="submit"
                >
                  Add Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ESF7 Upload Modal */}
      <ESF7UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onImportSuccess={() => {
          if (showToast) showToast('Faculty profiles auto-populated successfully!', 'success');
        }} 
      />

      {/* School Head Required Alert Modal */}
      {isHeadRequiredModalOpen && (
        <div 
          className="modal-overlay" 
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
          onClick={() => setIsHeadRequiredModalOpen(false)}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '520px', 
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
            {/* Header with warm warning banner */}
            <div style={{
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              padding: '24px 28px',
              borderBottom: '1.5px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '16px',
                background: '#fef3c7',
                border: '2px solid #f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706',
                flexShrink: 0
              }}>
                <FiAlertCircle size={26} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#92400e' }}>
                  School Head Designation Required
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b45309' }}>
                  DepEd eSF7 Institutional Compliance Gate
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: '#334155' }}>
                Under <strong>DepEd Electronic School Form 7 (eSF7)</strong> guidelines, every school must have <strong>at least one official School Head</strong> (Principal, Teacher-in-Charge, or Head Teacher) designated before continuing to Personnel Profiling.
              </p>

              <div style={{
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: '14px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <div style={{ color: '#dc2626', marginTop: '2px' }}>
                  <FiAlertCircle size={18} />
                </div>
                <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: '1.5' }}>
                  <strong>Current Status:</strong> No School Head is currently selected.
                  <div style={{ marginTop: '4px', color: '#7f1d1d' }}>
                    Please toggle ON the <strong>School Head</strong> switch for the school administrator in the roster list.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIsHeadRequiredModalOpen(false);
                    setHighlightHeadColumn(true);
                  }}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: '800',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  Understood, Designate School Head
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
