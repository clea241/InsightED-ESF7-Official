import React, { useState, useEffect } from 'react';
import SearchableDropdown from '../components/SearchableDropdown';
import {
  useApp,
  POSITION_OPTIONS_BY_CATEGORY,
  RELIGION_OPTIONS,
  ETHNIC_GROUP_OPTIONS,
  MAJOR_OPTIONS,
  MINOR_OPTIONS,
  DISCIPLINE_OPTIONS,
  PRC_SPECIALIZATION_OPTIONS,
  DIVISION_SCHOOL_OPTIONS,
  NATURE_OF_APPOINTMENT_OPTIONS,
  HIRING_ARRANGEMENT_OPTIONS,
  POST_GRADUATE_DEGREE_OPTIONS,
  COLLEGE_DEGREE_OPTIONS,
  TESDA_CERTIFICATION_OPTIONS,
  NEAP_TRAINING_OPTIONS
} from '../context/AppContext';

function DatePickerDropdowns({ value, onChange, disabled = false, maxDate, minDate, required = false }) {
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef(null);

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
    }
  }, [cleanValue]);

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

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
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

            {/* Navigation Arrows */}
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

  const displayText = value.length > 0 ? value.join(', ') : placeholder;

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
          background: options.length === 0 ? '#f1f5f9' : 'white',
          border: options.length === 0 ? '1.5px solid #e2e8f0' : (isOpen ? '1.5px solid var(--blue-600, #0284c7)' : '1.5px solid var(--line, #BAE6FD)'),
          borderRadius: '12px',
          color: options.length === 0 ? '#94a3b8' : (value.length > 0 ? 'var(--text, #0F172A)' : 'var(--muted, #64748B)'),
          cursor: options.length === 0 ? 'not-allowed' : 'pointer',
          minHeight: '42px',
          fontSize: '14px',
          boxSizing: 'border-box',
          boxShadow: (!isOpen || options.length === 0) ? 'none' : '0 0 0 3px rgba(125, 211, 252, .32)',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '90%' }}>
          {displayText}
        </span>
        <span style={{ fontSize: '10px', color: options.length === 0 ? '#94a3b8' : 'var(--blue, #075985)', marginLeft: '8px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
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
    districtSchools
  } = useApp();

  const [activeTab, setActiveTab] = useState('identity');
  const [showRa1080Modal, setShowRa1080Modal] = useState(false);
  const [ra1080InputText, setRa1080InputText] = useState('');

  // Sidebar search & filter states
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');

  const nonDraftPersonnel = personnel.filter(p => !p.isDraft);
  const dbPerson = nonDraftPersonnel.find(p => p.id === activePersonnelId) || nonDraftPersonnel[0];
  const [editPerson, setEditPerson] = useState(null);

  useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_personnel_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          setEditPerson(JSON.parse(savedDraft));
          return;
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }
      setEditPerson(dbPerson);
    }
  }, [activePersonnelId, dbPerson]);

  const currentPerson = editPerson || dbPerson;

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
    const updated = { ...currentPerson, [key]: value };
    setEditPerson(updated);
    localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
  };

  // Age calculation
  const getAge = (dobString) => {
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

  const age = getAge(currentPerson.birthdate);
  let ageStatusText = 'No birthdate';
  let ageStatusClass = 'badge info';
  if (age !== null) {
    if (age < 18 || age > 80) {
      ageStatusText = 'Questionable age';
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

    // Automatically recalculate days and hours
    if (field === 'startDate' || field === 'endDate') {
      const cleanStart = rows[index].startDate && typeof rows[index].startDate === 'string' ? rows[index].startDate.substring(0, 10) : '';
      const cleanEnd = rows[index].endDate && typeof rows[index].endDate === 'string' ? rows[index].endDate.substring(0, 10) : '';
      const start = cleanStart ? new Date(cleanStart + "T00:00:00") : null;
      const end = cleanEnd ? new Date(cleanEnd + "T00:00:00") : null;

      // Enforce end date must be on or after start date
      if (start && end && end < start) {
        rows[index].endDate = '';
        rows[index].days = 0;
        rows[index].totalHours = 0;
      } else if (start && end && end >= start) {
        const days = Math.round((end - start) / 86400000) + 1;
        rows[index].days = days;
        rows[index].hoursPerDay = 8;
        rows[index].totalHours = days * 8;
      } else {
        rows[index].days = 0;
        rows[index].totalHours = 0;
      }
    }

    handleFieldChange(key, rows);
  };

  const addTrainingRow = (key) => {
    const rows = [...(currentPerson[key] || [])];
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    rows.push({ clientKey: tempId, title: '', startDate: '', endDate: '', days: 0, hoursPerDay: 0, totalHours: 0 });
    handleFieldChange(key, rows);
  };

  const removeTrainingRow = (key, index) => {
    const rows = [...(currentPerson[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
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

  const handleSaveValidate = async () => {
    if (!currentPerson) return;
    const p = currentPerson;

    const conflict = checkSchoolHeadConflict(p);
    if (conflict) {
      await showAlert("School Head Conflict", conflict);
      return;
    }

    const errors = [];

    // Names
    if (!p.firstName?.trim()) errors.push("FIRST NAME");
    if (!p.middleName?.trim()) errors.push("MIDDLE NAME");
    if (!p.lastName?.trim()) errors.push("LAST NAME");

    // Demographics & IDs
    if (!p.sexAtBirth) errors.push("SEX AT BIRTH");
    if (!p.civilStatus) errors.push("CIVIL STATUS");
    if (!p.religion) errors.push("RELIGION");
    if (!p.ethnicGroup) errors.push("ETHNIC GROUP");
    if (!p.birthdate) errors.push("BIRTHDATE");
    if (!p.philsysNo?.trim()) errors.push("PHILSYS NO.");
    if (!p.depedEmail?.trim()) errors.push("DEPED EMAIL");
    if (!p.noTin && !p.tin?.trim()) errors.push("TIN NUMBER");

    // Employment
    if (!p.position) errors.push("POSITION / DESIGNATION");
    if (!p.fundSource) errors.push("FUND SOURCE");
    if (!p.natureOfAppointment) errors.push("NATURE OF APPOINTMENT");
    if (!p.hiringArrangement) errors.push("HIRING ARRANGEMENT");
    if (!p.deploymentStatus) errors.push("STATUS OF DEPLOYMENT");
    if (['Clustered', 'Reassigned', 'Borrowed', 'Detailed', 'CLUSTERED', 'REASSIGNED', 'BORROWED', 'DETAILED'].includes(p.deploymentStatus) && !p.clusteredSchools && (!Array.isArray(p.assignedSchools) || p.assignedSchools.length === 0)) {
      errors.push("OTHER SCHOOL ASSIGNMENT");
    }
    if (!p.firstServiceDate) errors.push("DATE OF FIRST DAY OF SERVICE");
    if (!p.lastPromotionDate) errors.push("DATE OF LAST PROMOTION");
    if (!p.lastLateralMovementDate) errors.push("DATE OF LAST LATERAL MOVEMENT");
    if (!p.newStationDate) errors.push("DATE OF FIRST DAY IN CURRENT STATION");

    // Education / Qualifications
    if (!p.collegeDegree) errors.push("COLLEGE DEGREE");
    if (!p.eligibility) errors.push("ELIGIBILITY");
    if (['let', 'pbet'].includes(String(p.eligibility || '').toLowerCase()) && !p.prcSpecialization?.trim()) {
      errors.push("PRC SPECIALIZATION");
    }

    // Trainings / Prof. Development
    const totalTrainingsCount = (p.neapTrainingRows || []).length + (p.certificationRows || []).length + (p.otherTrainingRows || []).length;
    if (totalTrainingsCount === 0) {
      errors.push("AT LEAST ONE PROFESSIONAL DEVELOPMENT / TRAINING RECORD");
    }

    if (errors.length > 0) {
      await showAlert("Validation Checklist Needed", `Cannot save record. The following fields are empty:\n\n• ${errors.join('\n• ')}`);
      return;
    }

    try {
      const updated = { ...p, personalVerified: true, workloadVerified: true };
      setEditPerson(updated);
      await savePersonnelChanges(p.id, updated);
      localStorage.removeItem(`draft_personnel_${p.id}`);
      showToast("Record validated and saved successfully!");
    } catch (err) {
      await showAlert("Error", "Failed to save and validate record: " + err.message);
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
      if (!p.birthdate) errors.push("BIRTHDATE");
      if (!p.philsysNo?.trim()) errors.push("PHILSYS NO.");
      if (!p.depedEmail?.trim()) errors.push("DEPED EMAIL");
      if (!p.noTin && !p.tin?.trim()) errors.push("TIN NUMBER");
      if (!p.position) errors.push("POSITION / DESIGNATION");
      if (!p.fundSource) errors.push("FUND SOURCE");
      if (!p.natureOfAppointment) errors.push("NATURE OF APPOINTMENT");
      if (!p.hiringArrangement) errors.push("HIRING ARRANGEMENT");
      if (!p.deploymentStatus) errors.push("STATUS OF DEPLOYMENT");
      if (['Clustered', 'Reassigned', 'Borrowed', 'Detailed', 'CLUSTERED', 'REASSIGNED', 'BORROWED', 'DETAILED'].includes(p.deploymentStatus) && !p.clusteredSchools && (!Array.isArray(p.assignedSchools) || p.assignedSchools.length === 0)) {
        errors.push("OTHER SCHOOL ASSIGNMENT");
      }
      if (!p.firstServiceDate) errors.push("DATE OF FIRST DAY OF SERVICE");
      if (!p.lastPromotionDate) errors.push("DATE OF LAST PROMOTION");
      if (!p.lastLateralMovementDate) errors.push("DATE OF LAST LATERAL MOVEMENT");
      if (!p.newStationDate) errors.push("DATE OF FIRST DAY IN CURRENT STATION");
      if (!p.collegeDegree) errors.push("COLLEGE DEGREE");
      if (!p.eligibility) errors.push("ELIGIBILITY");
      if (['let', 'pbet'].includes(String(p.eligibility || '').toLowerCase()) && !p.prcSpecialization?.trim()) {
        errors.push("PRC SPECIALIZATION");
      }
      const totalTrainingsCount = (p.neapTrainingRows || []).length + (p.certificationRows || []).length + (p.otherTrainingRows || []).length;
      if (totalTrainingsCount === 0) {
        errors.push("AT LEAST ONE PROFESSIONAL DEVELOPMENT / TRAINING RECORD");
      }

      if (errors.length > 0) {
        await showAlert("Validation Checklist Needed", `To save this draft personnel to the database, the following fields must not be empty:\n\n• ${errors.join('\n• ')}`);
        return;
      }
    }

    try {
      await savePersonnelChanges(currentPerson.id, currentPerson);
      localStorage.removeItem(`draft_personnel_${currentPerson.id}`);
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
    return email.split('@')[0] || '';
  };

  const handleEmailLocalChange = (val) => {
    const local = val.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    handleFieldChange('depedEmail', local ? `${local}@deped.gov.ph` : '');
  };

  // Filtered list for sidebar
  const sidebarPeople = nonDraftPersonnel.filter(p => {
    const matchesCat = categoryFilter === 'all' || p.type === categoryFilter;
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
    { tab: 'identity', label: 'Identity', icon: '🪪' }
  ] : [
    { tab: 'identity', label: 'Identity', icon: '🪪' },
    { tab: 'personal', label: 'Personal', icon: '👤' },
    { tab: 'employment', label: 'Employment', icon: '💼' },
    { tab: 'education', label: 'Education', icon: '🎓' },
    { tab: 'development', label: 'Development', icon: '📋' },
    ...(currentPerson && currentPerson.type !== 'non-teaching' ? [{ tab: 'teaching', label: 'Teaching', icon: '📚' }] : [])
  ];

  return (
    <section id="profile" className="view grid">
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
              <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '800', color: 'var(--navy)' }}>Personnel Profiling</h2>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--muted)' }}>{nonDraftPersonnel.length} personnel record{nonDraftPersonnel.length !== 1 ? 's' : ''}</p>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8' }}>🔍</span>
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

            {/* Scrollable People List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {sidebarPeople.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No personnel match your search.
                </div>
              )}
              {sidebarPeople.map(p => {
                const isActive = p.id === currentPerson.id;
                const hasDraft = !!localStorage.getItem(`draft_personnel_${p.id}`);
                const catInfo = categoryLabels[p.type] || { label: p.type, color: '#64748b', bg: '#f1f5f9' };
                const initials = `${(p.firstName || '')[0] || ''}${(p.lastName || '')[0] || ''}`.toUpperCase();
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
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.position || 'No position set'}
                      </p>
                    </div>
                    {/* Category badge */}
                    <span style={{
                      padding: '2px 6px', borderRadius: '6px',
                      background: catInfo.bg, color: catInfo.color,
                      fontSize: '10px', fontWeight: '700', flexShrink: 0
                    }}>{catInfo.label}</span>
                  </div>
                );
              })}
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
                  {currentPerson.salutation} {currentPerson.firstName} {currentPerson.lastName}{currentPerson.nameExtension ? ` ${currentPerson.nameExtension}` : ''}
                </h2>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{currentPerson.position || 'No position'}</span>
                  {currentPerson.profilingCode && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em' }}>PRN: {currentPerson.profilingCode}</span>
                  )}
                  {currentPerson.isShared && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: '700' }}>🔗 Shared from {DIVISION_SCHOOL_OPTIONS.find(s => s.schoolId === currentPerson.sourceSchoolId)?.name?.toUpperCase() || 'Mother School'}</span>
                  )}
                  {currentPerson.personalVerified && (
                    <span style={{ padding: '1px 7px', borderRadius: '5px', background: '#d1fae5', color: '#065f46', fontSize: '11px', fontWeight: '700' }}>✓ Verified</span>
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
              overflowX: 'auto',
              flexShrink: 0
            }}>
              {tabs.map(({ tab, label, icon }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '11px 18px',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2.5px solid var(--blue)' : '2.5px solid transparent',
                    background: activeTab === tab ? 'white' : 'transparent',
                    color: activeTab === tab ? 'var(--blue)' : '#64748b',
                    fontWeight: activeTab === tab ? '700' : '500',
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <span>{icon}</span>
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
                  <div style={{ background: '#e0e7ff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #c7d2fe', marginBottom: '20px' }}>
                    <p style={{ margin: 0, color: '#3730a3', fontSize: '13px', fontWeight: '600' }}>
                      ℹ️ This personnel is shared from their Mother School. Basic details are read-only. You can manage their workload for your school in the <strong>Workload Profile</strong> module.
                    </p>
                  </div>
                )}
                <div className="profile-editor-layout">

                  {/* Editing Form fields dynamically */}
                  <div>
                    <p className="profile-section-note">
                      {activeTab === 'identity' && "🪪 Editing identity and minimum record creation fields."}
                      {activeTab === 'personal' && "👤 Editing demographic, civil status, birthdate, PhilSys, religion, and ethnicity fields."}
                      {activeTab === 'employment' && "💼 Editing position, designation, fund source, appointment, hiring arrangement, email, deployment, and service dates."}
                      {activeTab === 'education' && "🎓 Editing degree, major/minor, post-graduate degree, discipline, eligibility, and PRC specialization."}
                      {activeTab === 'development' && "📋 Editing NEAP trainings, TESDA NCs, certifications, and other professional development records."}
                      {activeTab === 'teaching' && "📚 Editing teaching grade level assignments."}
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
                            <label>Designation</label>
                            <select
                              value={currentPerson.salutation || 'MR.'}
                              onChange={(e) => handleFieldChange('salutation', e.target.value)}
                              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: 'white' }}
                            >
                              <option>MR.</option>
                              <option>MRS.</option>
                              <option>MS.</option>
                            </select>
                          </div>
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
                            <input value={currentPerson.nameExtension || ''} onChange={(e) => handleFieldChange('nameExtension', e.target.value.toUpperCase())} placeholder="e.g. JR., SR., III, IV" />
                          </div>
                        </>
                      )}

                      {activeTab === 'personal' && (
                        <>
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
                            <label>PhilSys No. / National ID</label>
                            <input
                              placeholder="16-digit PhilSys Card Number"
                              maxLength={16}
                              value={currentPerson.philsysNo || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, ''); // numbers only
                                handleFieldChange('philsysNo', val);
                              }}
                            />
                          </div>
                          <div>
                            <label>Birthdate</label>
                            <DatePickerDropdowns
                              value={currentPerson.birthdate || ''}
                              onChange={(val) => handleFieldChange('birthdate', val)}
                              maxDate={new Date()}
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
                                currentPerson.type === 'teaching' ? 'TEACHING' :
                                  currentPerson.type === 'teaching-related' ? 'RELATED TEACHING' :
                                    currentPerson.type === 'non-teaching' ? 'NON-TEACHING' : ''
                              }
                              onChange={(val) => {
                                const mapping = {
                                  'TEACHING': 'teaching',
                                  'RELATED TEACHING': 'teaching-related',
                                  'NON-TEACHING': 'non-teaching'
                                };
                                const newType = mapping[val];
                                const updated = {
                                  ...currentPerson,
                                  type: newType,
                                  position: POSITION_OPTIONS_BY_CATEGORY[newType][0]
                                };
                                setEditPerson(updated);
                                localStorage.setItem(`draft_personnel_${currentPerson.id}`, JSON.stringify(updated));
                              }}
                              placeholder="SELECT CATEGORY..."
                            />
                          </div>
                          <div>
                            <label>Designation/Position</label>
                            <SearchableDropdown
                              options={POSITION_OPTIONS_BY_CATEGORY[currentPerson.type || 'teaching'].map(p => p.toUpperCase())}
                              value={currentPerson.position || ''}
                              onChange={(val) => handleFieldChange('position', val)}
                              placeholder="SELECT DESIGNATION/POSITION..."
                              required
                            />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Salary Step Increment</label>
                            <div style={{
                              display: 'flex',
                              gap: '0',
                              border: '1.5px solid var(--line)',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              marginTop: '4px'
                            }}>
                              {[1, 2, 3, 4, 5, 6, 7, 8].map((step, idx) => {
                                const isActive = (currentPerson.stepIncrement || 1) === step;
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
                                    <span style={{ fontSize: '9px', opacity: isActive ? 0.85 : 0.5, fontWeight: '700', letterSpacing: '0.03em' }}>STEP</span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="field-help">Current: Step {currentPerson.stepIncrement || 1} — Click any step to change.</p>
                          </div>
                          <div>
                            <label>Fund Source</label>
                            <SearchableDropdown
                              options={['NATIONAL', 'SEF', 'LGU', 'PTA', 'NGO', 'MOOE', 'OTHERS']}
                              value={currentPerson.fundSource || ''}
                              onChange={(val) => handleFieldChange('fundSource', val)}
                              placeholder="SELECT FUND SOURCE..."
                              required
                            />
                          </div>
                          <div>
                            <label>Nature of Appointment</label>
                            <SearchableDropdown
                              options={NATURE_OF_APPOINTMENT_OPTIONS}
                              value={currentPerson.natureOfAppointment || ''}
                              onChange={(val) => handleFieldChange('natureOfAppointment', val)}
                              placeholder="Select nature of appointment..."
                              required
                            />
                          </div>
                          <div>
                            <label>Hiring Arrangement</label>
                            <SearchableDropdown
                              options={HIRING_ARRANGEMENT_OPTIONS}
                              value={currentPerson.hiringArrangement || ''}
                              onChange={(val) => handleFieldChange('hiringArrangement', val)}
                              placeholder="Select hiring arrangement..."
                              required
                            />
                          </div>
                          <div>
                            <label>Employee No.</label>
                            <input className={!currentPerson.employeeNo ? 'empty-field' : ''} value={currentPerson.employeeNo || ''} onChange={(e) => handleFieldChange('employeeNo', e.target.value)} />
                          </div>
                          <div>
                            <label>DepEd Email</label>
                            <div className="deped-email-field" style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                style={{ borderRight: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                                value={getEmailLocal(currentPerson.depedEmail)}
                                onChange={(e) => handleEmailLocalChange(e.target.value)}
                                placeholder="name"
                                className={!getEmailLocal(currentPerson.depedEmail) ? 'empty-field' : ''}
                              />
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: '42px',
                                padding: '0 12px',
                                background: 'var(--blue-50)',
                                border: '1.5px solid var(--line)',
                                borderLeft: 0,
                                borderTopRightRadius: '12px',
                                borderBottomRightRadius: '12px',
                                fontSize: '13px',
                                color: 'var(--blue)',
                                fontWeight: 'bold'
                              }}>
                                @deped.gov.ph
                              </span>
                            </div>
                          </div>

                          <div className="profile-subsection">Deployment and Service Dates</div>
                          <div>
                            <label>Status of Deployment</label>
                            <SearchableDropdown
                              options={['OWN STATION', 'CLUSTERED', 'REASSIGNED', 'BORROWED', 'DETAILED']}
                              value={currentPerson.deploymentStatus || ''}
                              onChange={(val) => handleFieldChange('deploymentStatus', val)}
                              placeholder="SELECT STATUS OF DEPLOYMENT..."
                            />
                          </div>

                          {['Clustered', 'Reassigned', 'Borrowed', 'Detailed', 'CLUSTERED', 'REASSIGNED', 'BORROWED', 'DETAILED'].includes(currentPerson.deploymentStatus) && (
                            <div className="full" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '15px' }}>

                              {String(currentPerson.deploymentStatus).toUpperCase() !== 'CLUSTERED' && (
                                <div>
                                  <label>Other School Assignment</label>
                                  <SearchableDropdown
                                    options={DIVISION_SCHOOL_OPTIONS.map(s => `${s.name.toUpperCase()} (${s.schoolId})`)}
                                    value={
                                      (() => {
                                        const activeSchool = (Array.isArray(currentPerson.assignedSchools) && currentPerson.assignedSchools[0]) ||
                                          (typeof currentPerson.assignedSchools === 'string' ? currentPerson.assignedSchools : '');

                                        if (!activeSchool) return '';

                                        return DIVISION_SCHOOL_OPTIONS.map(s => `${s.name.toUpperCase()} (${s.schoolId})`)
                                          .find(opt => opt.toUpperCase().startsWith(activeSchool.toUpperCase())) || activeSchool;
                                      })()
                                    }
                                    onChange={(val) => {
                                      const schoolName = val.split(' (')[0];
                                      handleFieldChange('assignedSchools', schoolName ? [schoolName] : []);
                                    }}
                                    placeholder="SELECT OTHER ASSIGNED SCHOOL..."
                                  />
                                  <p className="field-help">Appears only for Reassigned, Borrowed, or Detailed deployment.</p>
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
                                  <span style={{ fontWeight: 'bold', color: 'var(--navy)', fontSize: '13px' }}>Clustered School Assignments</span>
                                  <p className="field-help" style={{ marginTop: '-8px' }}>Select the satellite schools where this personnel is deployed to teach.</p>

                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                                    {(Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : []).map((school, index) => (
                                      <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50)', border: '1.5px solid var(--line)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                        <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 'bold' }}>{school}</span>
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
                                    options={DIVISION_SCHOOL_OPTIONS.map(s => `${s.name.toUpperCase()} (${s.schoolId})`)}
                                    value=""
                                    onChange={(val) => {
                                      if (!val) return;
                                      const schoolName = val.split(' (')[0];
                                      const currentList = Array.isArray(currentPerson.assignedSchools) ? currentPerson.assignedSchools : [];
                                      if (!currentList.includes(schoolName)) {
                                        handleFieldChange('assignedSchools', [...currentList, schoolName]);
                                      }
                                    }}
                                    placeholder="+ ADD CLUSTERED SCHOOL..."
                                  />

                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ marginTop: '8px', width: 'fit-content' }}
                                    disabled={!currentPerson.profilingCode || (Array.isArray(currentPerson.assignedSchools) && currentPerson.assignedSchools.length === 0)}
                                    onClick={async () => {
                                      if (!currentPerson.profilingCode) {
                                        await showAlert("Missing PRN", "A valid PRN is required before sharing.");
                                        return;
                                      }
                                      try {
                                        const { api } = await import('../services/api');
                                        const targetSchoolIds = currentPerson.assignedSchools.map(name => {
                                          const match = DIVISION_SCHOOL_OPTIONS.find(s => s.name.toUpperCase() === name.toUpperCase());
                                          return match ? match.schoolId : null;
                                        }).filter(Boolean);

                                        if (targetSchoolIds.length === 0) {
                                          await showAlert("Error", "No valid target schools found.");
                                          return;
                                        }

                                        await api.sharePersonnelToClusteredSchools(currentPerson.profilingCode, targetSchoolIds, currentPerson.firstName, currentPerson.lastName);
                                        await showAlert("Success", "Personnel shared to clustered schools successfully.");
                                      } catch (err) {
                                        await showAlert("Error", "Failed to share personnel: " + err.message);
                                      }
                                    }}
                                  >
                                    Share to Clustered Schools 🔗
                                  </button>
                                  {!currentPerson.profilingCode && (
                                    <p className="field-help" style={{ color: 'var(--danger)' }}>Note: You must save this personnel profile first to generate a PRN before sharing.</p>
                                  )}
                                </div>
                              )}
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
                                Never Promoted / N/A
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={currentPerson.lastPromotionDate === 'N/A' ? '' : (currentPerson.lastPromotionDate || '')}
                              onChange={(val) => handleFieldChange('lastPromotionDate', val)}
                              maxDate={new Date()}
                              disabled={currentPerson.lastPromotionDate === 'N/A'}
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
                                Not Applicable
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={currentPerson.lastLateralMovementDate === 'N/A' ? '' : (currentPerson.lastLateralMovementDate || '')}
                              onChange={(val) => handleFieldChange('lastLateralMovementDate', val)}
                              maxDate={new Date()}
                              disabled={currentPerson.lastLateralMovementDate === 'N/A'}
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
                                Not Applicable
                              </label>
                            </div>
                            <DatePickerDropdowns
                              value={currentPerson.newStationDate === 'N/A' ? '' : (currentPerson.newStationDate || '')}
                              onChange={(val) => handleFieldChange('newStationDate', val)}
                              maxDate={new Date()}
                              disabled={currentPerson.newStationDate === 'N/A'}
                            />
                          </div>
                        </>
                      )}

                      {activeTab === 'education' && (
                        <>
                          <div className="profile-subsection">Degree Information</div>
                          <div>
                            <label>College Degree / Baccalaureate</label>
                            <SearchableDropdown
                              options={COLLEGE_DEGREE_OPTIONS}
                              value={currentPerson.collegeDegree || ''}
                              onChange={(val) => {
                                handleFieldChange('collegeDegree', val);
                                if (val && !val.toUpperCase().includes('EDUCATION')) {
                                  handleFieldChange('major', '');
                                }
                              }}
                              placeholder="Select college degree..."
                              required
                            />
                          </div>

                          {currentPerson.collegeDegree && currentPerson.collegeDegree !== 'NONE' && currentPerson.collegeDegree.toUpperCase().includes('EDUCATION') && (
                            <div>
                              <label>Major</label>
                              <SearchableDropdown
                                options={MINOR_OPTIONS}
                                value={currentPerson.major || ''}
                                onChange={(val) => handleFieldChange('major', val)}
                                placeholder="Select major..."
                              />
                            </div>
                          )}

                          <div>
                            <label>PRC Specialization</label>
                            <SearchableDropdown
                              options={PRC_SPECIALIZATION_OPTIONS}
                              value={currentPerson.prcSpecialization || ''}
                              onChange={(val) => handleFieldChange('prcSpecialization', val)}
                              placeholder="Select specialization..."
                            />
                          </div>
                          <div>
                            <label>Minor</label>
                            <SearchableDropdown
                              options={MINOR_OPTIONS}
                              value={currentPerson.minor || ''}
                              onChange={(val) => handleFieldChange('minor', val)}
                              placeholder="Select minor subject..."
                            />
                          </div>
                          <div className="profile-subsection">Post-Graduate and Eligibility</div>
                          <div>
                            <label>Post-Graduate Degree</label>
                            <SearchableDropdown
                              options={POST_GRADUATE_DEGREE_OPTIONS}
                              value={currentPerson.postGraduateDegree || ''}
                              onChange={(val) => {
                                handleFieldChange('postGraduateDegree', val);
                                if (val === 'N/A' || val === 'NONE') {
                                  handleFieldChange('postGraduateDiscipline', '');
                                }
                              }}
                              placeholder="Select post-graduate degree..."
                            />
                          </div>
                          {currentPerson.postGraduateDegree && currentPerson.postGraduateDegree !== 'NONE' && currentPerson.postGraduateDegree !== 'N/A' && (
                            <div>
                              <label>Post-Graduate Discipline</label>
                              <input
                                type="text"
                                value={currentPerson.postGraduateDiscipline || ''}
                                onChange={(e) => handleFieldChange('postGraduateDiscipline', e.target.value.toUpperCase())}
                                placeholder="Enter post-graduate discipline..."
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '10px 14px',
                                  borderRadius: '12px',
                                  border: '1.5px solid var(--line)',
                                  background: 'white',
                                  color: 'var(--navy)',
                                  fontFamily: 'inherit',
                                  fontSize: '14px',
                                  minHeight: '44px'
                                }}
                              />
                            </div>
                          )}
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
                                style={{ maxWidth: '400px' }}
                              >
                                <option value="">+ Add Eligibility...</option>
                                <option value="LICENSURE EXAMINATION FOR TEACHERS">LICENSURE EXAMINATION FOR TEACHERS</option>
                                <option value="PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)">PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)</option>
                                <option value="PROVISIONAL TEACHERS">PROVISIONAL TEACHERS</option>
                                <option value="PROVISIONAL TEACHERS - DOST SCHOLAR GRADUATES">PROVISIONAL TEACHERS - DOST SCHOLAR GRADUATES</option>
                                <option value="REGISTERED GUIDANCE COUNSELOR">REGISTERED GUIDANCE COUNSELOR</option>
                                <option value="REGISTERED LIBRARIAN">REGISTERED LIBRARIAN</option>
                                <option value="REGISTERED NURSE">REGISTERED NURSE</option>
                                <option value="CS - 1ST LEVEL (SUB-PROFESSIONAL)">CS - 1ST LEVEL (SUB-PROFESSIONAL)</option>
                                <option value="CS - 2ND LEVEL (PROFESSIONAL)">CS - 2ND LEVEL (PROFESSIONAL)</option>
                                <option value="RA 1080 (OTHERS, PLEASE SPECIFY)">RA 1080 (OTHERS, PLEASE SPECIFY)</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </div>
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
                                      options={NEAP_TRAINING_OPTIONS}
                                      value={tr.title || ''}
                                      onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'title', val)}
                                      placeholder="SELECT NEAP TRAINING..."
                                    />
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
                                    <label>Total Hours</label>
                                    <input type="number" value={tr.totalHours || 0} onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'totalHours', Number(e.target.value))} />
                                  </div>
                                  <button className="btn danger" style={{ minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" onClick={() => removeTrainingRow('neapTrainingRows', index)}>✕</button>
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
                                    <label>Total Hours</label>
                                    <input type="number" value={tr.totalHours || 0} onChange={(e) => handleTrainingChange('certificationRows', index, 'totalHours', Number(e.target.value))} />
                                  </div>
                                  <button className="btn danger" style={{ minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" onClick={() => removeTrainingRow('certificationRows', index)}>✕</button>
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
                                      placeholder="SELECT OTHER TRAINING..."
                                    />
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
                                    <label>Total Hours</label>
                                    <input type="number" value={tr.totalHours || 0} onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'totalHours', Number(e.target.value))} />
                                  </div>
                                  <button className="btn danger" style={{ minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" onClick={() => removeTrainingRow('otherTrainingRows', index)}>✕</button>
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
                              {(Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : []).map((grade, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', background: 'var(--blue-50)', border: '1.5px solid var(--line)', borderRadius: '12px', padding: '6px 12px', gap: '8px' }}>
                                  <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 'bold' }}>{grade}</span>
                                  <button
                                    type="button"
                                    style={{ background: 'transparent', border: 0, color: 'var(--blue)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: 0 }}
                                    onClick={() => {
                                      const currentList = Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [];
                                      const newList = currentList.filter((_, idx) => idx !== index);
                                      handleFieldChange('assignedGradeLevels', newList);
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              {(Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : []).length === 0 && (
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

                                  const currentList = Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [];
                                  if (currentList.includes(selectedVal)) {
                                    await showAlert("Duplicate Entry", "This grade level has already been assigned.");
                                    return;
                                  }

                                  handleFieldChange('assignedGradeLevels', [...currentList, selectedVal]);
                                }}
                                style={{ maxWidth: '400px' }}
                              >
                                <option value="">+ Add Grade Level...</option>
                                {(() => {
                                  const offerings = (schoolInfo?.curricularOffering || []).map(o => o.toUpperCase());
                                  const showElem = offerings.includes('ELEMENTARY');
                                  const showJHS = offerings.includes('JHS');
                                  const showSHS = offerings.includes('SHS');

                                  const list = [];
                                  if (showElem) {
                                    list.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED');
                                  }
                                  if (showJHS) {
                                    list.push('Grade 7', 'Grade 8', 'Grade 9', 'Grade 10');
                                  }
                                  if (showSHS) {
                                    list.push('Grade 11', 'Grade 12');
                                  }
                                  if (list.length === 0) {
                                    list.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12');
                                  }

                                  if (Array.isArray(classSections)) {
                                    classSections.forEach(s => {
                                      if (s.gradeLevel && s.gradeLevel.includes(' - ') && !list.includes(s.gradeLevel)) {
                                        list.push(s.gradeLevel);
                                      }
                                    });
                                  }

                                  const selected = Array.isArray(currentPerson.assignedGradeLevels) ? currentPerson.assignedGradeLevels : [];
                                  return list.filter(item => !selected.includes(item)).map(g => (
                                    <option key={g} value={g}>{g}</option>
                                  ));
                                })()}
                              </select>
                            </div>
                          </div>
                        </>
                      )}

                    </div>

                    {!currentPerson.isShared && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px', borderTop: '1.5px solid var(--line)', paddingTop: '15px', alignItems: 'center' }}>
                        <button className="btn" type="button" onClick={handleSaveChangesDirectly} style={{ background: '#0284c7', borderColor: '#0284c7', color: 'white' }}>
                          💾 Save Changes
                        </button>
                        <button className="btn secondary" type="button" onClick={handleSaveValidate} style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}>
                          ✓ Save & Validate
                        </button>
                        <button className="btn secondary" type="button" onClick={handleDuplicate}>
                          ⧉ Duplicate
                        </button>
                        <div style={{ marginLeft: 'auto' }}>
                          <button className="btn danger" type="button" onClick={handleDelete}>
                            🗑 Delete
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
    </section>
  );
}
