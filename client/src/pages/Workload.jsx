import React, { useState, useEffect, useRef } from 'react';

const isAdvisorySub = (sub) => {
  if (!sub) return false;
  const s = String(sub).toUpperCase();
  return s === 'ADVISORY' || s.includes('HOMEROOM GUIDANCE') || s.includes('HGP');
};

const isAdvisoryOrHgpPair = (rA, rB) => {
  if (!rA || !rB) return false;
  const subA = rA.subject || rA.task || '';
  const subB = rB.subject || rB.task || '';
  if (isAdvisorySub(subA) && isAdvisorySub(subB)) {
    const secA = String(rA.sectionId || rA.section_id || '');
    const secB = String(rB.sectionId || rB.section_id || '');
    if (secA && secB && secA === secB) return true;
    if (!secA || !secB) return true;
  }
  return false;
};



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

  const filteredOptions = options.filter(opt =>
    (opt.label || '').toLowerCase().includes(search.toLowerCase())
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
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="searchable-select-input"
          style={{
            width: '100%',
            paddingRight: '30px',
            cursor: disabled ? 'not-allowed' : 'pointer'
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
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: String(opt.value) === String(value) ? '700' : '500',
                  background: String(opt.value) === String(value) ? 'var(--blue-50)' : 'transparent',
                  color: String(opt.value) === String(value) ? 'var(--blue)' : 'var(--navy)',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--blue-50)'}
                onMouseLeave={(e) => e.target.style.background = String(opt.value) === String(value) ? 'var(--blue-50)' : 'transparent'}
              >
                {opt.label}
              </div>
            ))
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

import {
  useApp,
  SUBJECT_OPTIONS,
  TEACHING_RELATED_TASK_OPTIONS,
  ADMINISTRATIVE_TASK_OPTIONS,
  POSITION_OPTIONS_BY_CATEGORY
} from '../context/AppContext';
import { api } from '../services/api';

let GRADE_LEVEL_SUBJECTS = {
  'Kinder': [
    'ADVISORY',
    'KINDER BLOCKS OF TIME',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 1': [
    'ADVISORY',
    'LANGUAGE',
    'LANGUAGE',
    'READING AND LITERACY',
    'MAKABANSA',
    'MATHEMATICS',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 4': [
    'ADVISORY',
    'HGP',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 5': [
    'ADVISORY',
    'HGP',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 6': [
    'ADVISORY',
    'HGP',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'NON-GRADED': [
    'ADVISORY',
    'HGP',
    'KINDER BLOCKS OF TIME',
    'LANGUAGE',
    'READING AND LITERACY',
    'MAKABANSA',
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
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
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
  ]
};

const JHS_SUBJECTS = [
  'ADVISORY',
  'HGP',
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
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS',
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
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'PE AND HEALTH',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
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
  'RESEARCH PROJECT/CULMINATING ACTIVITY*',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
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
  'OTHERS SPECIALIZED SUBJECT',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
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
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
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
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
];

const ELEMENTARY_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'ADMINISTRATIVE',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT',
  'RELATED TASK'
];

const JHS_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'ADMINISTRATIVE',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT',
  'RELATED TASK'
];

const SHS_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'ADMINISTRATIVE',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT',
  'RELATED TASK'
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
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
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
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "EPP/TLE",
    "MAPEH",
    "VALUES EDUCATION",
    "GMRC"
  ],
  "ALL": [
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "EPP/TLE",
    "MAPEH",
    "VALUES EDUCATION",
    "GMRC"
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

export default function Workload() {
  const {
    personnel,
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
    showConfirm
  } = useApp();

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
  const [newSlot, setNewSlot] = useState({ teacherId: '', subject: '', startTime: '08:00', endTime: '09:00', days: ['M', 'T', 'W', 'TH', 'F'] });
  const [slotConflict, setSlotConflict] = useState(null);

  // Filter states
  const [gradeFilter, setGradeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [layoutType, setLayoutType] = useState('list'); // 'list' | 'card'
  const [timeSortOrder, setTimeSortOrder] = useState('desc'); // 'added' | 'asc' | 'desc'
  const [newlyAddedWorkloadId, setNewlyAddedWorkloadId] = useState(null);
  const workloadCardRefs = React.useRef({});

  useEffect(() => {
    if (newlyAddedWorkloadId && workloadCardRefs.current[newlyAddedWorkloadId]) {
      const el = workloadCardRefs.current[newlyAddedWorkloadId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
      const timer = setTimeout(() => {
        setNewlyAddedWorkloadId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedWorkloadId]);

  useEffect(() => {
    setNewlyAddedWorkloadId(null);
  }, [activePersonnelId]);

  const parseTimeToMinutes = (timeStr) => {
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
    if (parts.length < 2) return 99999;

    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  const getAssignedGradeLevels = (p) => {
    if (!p) return [];
    const assigned = [...(Array.isArray(p.assignedGradeLevels) ? p.assignedGradeLevels : [])];
    (classSections || []).forEach(s => {
      if (s.advisorId && p.id && String(s.advisorId) === String(p.id) && !assigned.includes(s.gradeLevel)) {
        assigned.push(s.gradeLevel);
      }
    });
    return assigned;
  };

  // Filter people list based on search query, grade level, and category (teaching / teaching-related)
  const filteredPeople = personnel.filter(p => {
    if (p.isDraft) return false;

    // 1. Search filter
    const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
    const position = (p.position || '').toLowerCase();
    const query = teacherSearch.toLowerCase().trim();
    const matchesSearch = fullName.includes(query) || position.includes(query);

    // 2. Category filter
    const matchesCat = categoryFilter === 'all' || p.type === categoryFilter;

    // 3. Grade Level filter
    let matchesGrade = true;
    if (gradeFilter !== 'all') {
      if (p.type === 'non-teaching') {
        matchesGrade = false;
      } else {
        const assigned = getAssignedGradeLevels(p);
        const rowGrades = (p.workloadRows || []).map(r => r.gradeLevel).filter(Boolean);
        matchesGrade = assigned.includes(gradeFilter) || rowGrades.includes(gradeFilter);
      }
    }

    return matchesSearch && matchesCat && matchesGrade;
  });

  const dbPerson = filteredPeople.find(p => p.id === activePersonnelId) || filteredPeople[0] || null;
  const [editPerson, setEditPerson] = useState(null);

  useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_workload_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let person = dbPerson;
      if (savedDraft) {
        try {
          person = JSON.parse(savedDraft);
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      let updatedRows = (person.workloadRows || []).map(r => {
        let normSecId = (r.sectionId !== undefined && r.sectionId !== null && r.sectionId !== '')
          ? String(r.sectionId)
          : ((r.section_id !== undefined && r.section_id !== null && r.section_id !== '') ? String(r.section_id) : '');
        const normSub = r.subject || r.subject_name || '';
        const normGrade = r.gradeLevel || r.grade_level || '';
        if (!normSecId && normGrade) {
          const normGradeClean = normGrade.replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
          const matchingSec = (classSections || []).find(s =>
            s.gradeLevel && s.gradeLevel.replace(/\s*[\u2013\u2014-]\s*/g, ' - ') === normGradeClean
          );
          if (matchingSec) {
            normSecId = String(matchingSec.id);
          }
        }
        let normCat = r.category;
        if (!normCat && normGrade) {
          for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
            if (grades.includes(normGrade)) {
              normCat = cat;
              break;
            }
          }
        }
        return {
          ...r,
          sectionId: normSecId,
          subject: normSub,
          gradeLevel: normGrade,
          category: normCat || 'Elementary'
        };
      });
      let rowsChanged = false;

      // Filter out obsolete HOMEROOM GUIDANCE rows and duplicate ADVISORY / HGP rows per section
      const seenAdvisorySecs = new Set();
      const seenHgpSecs = new Set();
      let cleanedRows = [];
      let didClean = false;

      updatedRows.forEach(r => {
        const subUpper = String(r.subject || '').toUpperCase().trim();
        if (subUpper === 'HOMEROOM GUIDANCE' || subUpper === 'HOMEROOM GUIDANCE (HGP)') {
          didClean = true;
          return;
        }
        if (subUpper === 'ADVISORY') {
          const secKey = String(r.sectionId || r.section_id || '');
          if (!seenAdvisorySecs.has(secKey)) {
            seenAdvisorySecs.add(secKey);
            cleanedRows.push({ ...r, subject: 'ADVISORY' });
          } else {
            didClean = true;
          }
        } else if (subUpper === 'HGP') {
          const secKey = String(r.sectionId || r.section_id || '');
          if (!seenHgpSecs.has(secKey)) {
            seenHgpSecs.add(secKey);
            cleanedRows.push({ ...r, subject: 'HGP' });
          } else {
            didClean = true;
          }
        } else {
          cleanedRows.push(r);
        }
      });

      if (didClean) {
        updatedRows = cleanedRows;
        rowsChanged = true;
      }

      const advisorySections = (classSections || []).filter(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));

      if (advisorySections.length === 0) {
        const initialLen = updatedRows.length;
        updatedRows = updatedRows.filter(r => r.subject !== 'ADVISORY' && r.subject !== 'HGP' && r.subject !== 'HOMEROOM GUIDANCE');
        if (updatedRows.length !== initialLen) rowsChanged = true;
      } else {
        advisorySections.forEach(sec => {
          // 1. Check if ADVISORY exists in the workload rows for this section
          let advisoryIdx = updatedRows.findIndex(r => r.subject === 'ADVISORY' && (String(r.sectionId) === String(sec.id) || !r.sectionId));
          if (advisoryIdx === -1) {
            const newAdv = {
              id: `local-work-adv-${sec.id}-${Date.now()}`,
              sectionId: String(sec.id),
              gradeLevel: sec.gradeLevel,
              subject: 'ADVISORY',
              startTime: '07:30',
              endTime: '08:30',
              days: ['M', 'T', 'W', 'TH', 'F']
            };
            updatedRows.push(newAdv);
            advisoryIdx = updatedRows.length - 1;
            rowsChanged = true;
          } else {
            // Ensure sectionId and gradeLevel are synced with the active class section
            const existing = updatedRows[advisoryIdx];
            if (String(existing.sectionId) !== String(sec.id) || existing.gradeLevel !== sec.gradeLevel) {
              updatedRows[advisoryIdx] = {
                ...existing,
                sectionId: String(sec.id),
                gradeLevel: sec.gradeLevel
              };
              rowsChanged = true;
            }
          }

          // 2. Check if HGP exists in the workload rows for this section
          const hgpIdx = updatedRows.findIndex(r => (r.subject === 'HGP' || r.subject === 'HOMEROOM GUIDANCE') && (String(r.sectionId) === String(sec.id) || !r.sectionId));
          const advRow = updatedRows[advisoryIdx];
          const startTime = advRow?.startTime || '07:30';
          const endTime = advRow?.endTime || '08:30';

          if (hgpIdx === -1) {
            updatedRows.push({
              id: `local-work-hgp-${sec.id}-${Date.now() + 1}`,
              sectionId: String(sec.id),
              gradeLevel: sec.gradeLevel,
              subject: 'HGP',
              startTime,
              endTime,
              days: ['F']
            });
            rowsChanged = true;
          } else {
            const existingHgp = updatedRows[hgpIdx];
            if (existingHgp.subject !== 'HGP' || String(existingHgp.sectionId) !== String(sec.id) || existingHgp.gradeLevel !== sec.gradeLevel) {
              updatedRows[hgpIdx] = {
                ...existingHgp,
                subject: 'HGP',
                sectionId: String(sec.id),
                gradeLevel: sec.gradeLevel,
                startTime: existingHgp.startTime || startTime,
                endTime: existingHgp.endTime || endTime
              };
              rowsChanged = true;
            }
          }
        });
      }

      if (rowsChanged) {
        const updatedPerson = { ...person, workloadRows: updatedRows };
        setEditPerson(updatedPerson);
        localStorage.setItem(draftKey, JSON.stringify(updatedPerson));
      } else {
        setEditPerson(person);
      }
    } else {
      setEditPerson(null);
    }
  }, [activePersonnelId, dbPerson, classSections]);

  const currentPerson = editPerson || dbPerson;



  const handleFieldChangeForPerson = (personId, key, value) => {
    if (!personId) return;
    const baseP = personnel.find(p => p.id === personId);
    if (!baseP) return;

    const draftKey = `draft_workload_${personId}`;
    const savedDraft = localStorage.getItem(draftKey);
    let targetPerson = baseP;
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed) targetPerson = parsed;
      } catch (e) {}
    }

    const updated = { ...targetPerson, [key]: value };
    if (currentPerson && currentPerson.id === personId) {
      setEditPerson(updated);
    }
    localStorage.setItem(draftKey, JSON.stringify(updated));
  };

  const handleFieldChange = (key, value) => {
    if (!currentPerson) return;
    handleFieldChangeForPerson(currentPerson.id, key, value);
  };

  const getSubjectsForGrade = (grade, category = '') => {
    const normGrade = grade ? String(grade).replace(/\s*[\u2013\u2014-]\s*/g, ' - ') : '';
    if (normGrade && normGrade.includes(' - ')) {
      const parts = normGrade.split(' - ');
      const union = new Set();
      parts.forEach(p => {
        const subs = getSubjectsForGrade(p, category);
        subs.forEach(s => union.add(s));
      });
      return Array.from(union);
    }

    if (grade === 'MONO-GRADE') {
      if (category === 'Elementary') return ELEMENTARY_MONO_GRADE_SUBJECTS;
      if (category === 'JHS') return JHS_MONO_GRADE_SUBJECTS;
      if (category === 'SHS') return SHS_MONO_GRADE_SUBJECTS;
    }
    if (grade === 'NON-GRADED') {
      if (category === 'JHS') return JHS_NON_GRADED_SUBJECTS;
      if (category === 'SHS') return SHS_NON_GRADED_SUBJECTS;
    }

    if (grade === 'Grade 11' || grade === 'Grade 12') {
      const isGrade12 = grade === 'Grade 12';
      if (category === 'SHS') {
        return isGrade12 ? SHS_GRADE12_SUBJECTS : SHS_SUBJECTS;
      }
      if (category === 'SHS-CORE SUBJECTS') {
        return isGrade12 ? SHS_CORE_GRADE12_SUBJECTS : SHS_CORE_SUBJECTS;
      }
      if (category === 'SHS-APPLIED SUBJECTS') {
        return isGrade12 ? SHS_APPLIED_GRADE12_SUBJECTS : SHS_APPLIED_SUBJECTS;
      }
      if (category === 'SHS-SPECIALIZED SUBJECTS') {
        return isGrade12 ? SHS_SPECIALIZED_GRADE12_SUBJECTS : SHS_SPECIALIZED_SUBJECTS;
      }
      if (category === 'SSHS-CORE') {
        return SSHS_CORE_SUBJECTS;
      }
      if (category === 'SSHS-ACADEMIC') {
        return isGrade12 ? SSHS_ACADEMIC_GRADE12_SUBJECTS : SSHS_ACADEMIC_SUBJECTS;
      }
      if (category === 'SSHS-TECHPRO') {
        return isGrade12 ? SSHS_TECHPRO_GRADE12_SUBJECTS : SSHS_TECHPRO_SUBJECTS;
      }
      return isGrade12 ? SHS_GRADE12_SUBJECTS : SHS_SUBJECTS;
    }

    return GRADE_LEVEL_SUBJECTS[grade] || SUBJECT_OPTIONS;
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

  // Compute dynamic default schedule time and day from previous workload entries
  const getWorkloadScheduleDefaults = (workloadRows) => {
    let nextStart = '08:00';
    let nextEnd = '08:40';
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

          let duration = 40; // Default 40-minute period
          if (startMins < 99999 && endMins > startMins) {
            duration = endMins - startMins;
          }

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

  // 1. Classroom Workload Rows (Vite Subject schedule rows)
  const addWorkloadRow = () => {
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
      category: initialCategory,
      subject: validInitialSubject,
      gradeLevel: initialGrade,
      sectionId: '',
      startTime: nextStart,
      endTime: nextEnd,
      days: nextDays
    };
    rows.unshift(newRow);
    setNewlyAddedWorkloadId(newId);
    handleFieldChange('workloadRows', rows);
  };

  const removeWorkloadRow = (index) => {
    const row = (currentPerson.workloadRows || [])[index];
    if (row && isAdvisorySub(row.subject)) {
      return;
    }
    const rows = [...(currentPerson.workloadRows || [])].filter((_, idx) => idx !== index);
    handleFieldChange('workloadRows', rows);
  };

  const updateWorkloadRow = (index, field, value) => {
    const rows = [...(currentPerson.workloadRows || [])];
    rows[index] = { ...rows[index], [field]: value };
    handleFieldChange('workloadRows', rows);
  };

  const updateWorkloadRowFields = (index, fieldValues) => {
    const rows = [...(currentPerson.workloadRows || [])];
    rows[index] = { ...rows[index], ...fieldValues };
    handleFieldChange('workloadRows', rows);
  };

  const handleSectionChangeForRow = (index, sectionId) => {
    const rows = [...(currentPerson.workloadRows || [])];
    const section = (classSections || []).find(s => String(s.id) === String(sectionId));

    if (section) {
      let resolvedCategory = 'Elementary';
      for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
        if (grades.includes(section.gradeLevel)) {
          resolvedCategory = cat;
          break;
        }
      }
      const newSubjects = getSubjectsForGrade(section.gradeLevel, resolvedCategory);

      rows[index] = {
        ...rows[index],
        sectionId: String(sectionId),
        gradeLevel: section.gradeLevel,
        category: resolvedCategory,
        subject: newSubjects.includes(rows[index].subject) ? rows[index].subject : (newSubjects.find(s => !isAdvisorySub(s)) || '')
      };
    } else {
      rows[index] = {
        ...rows[index],
        sectionId: ''
      };
    }
    handleFieldChange('workloadRows', rows);
  };

  const toggleWorkloadDay = (rowIndex, day) => {
    const rows = [...(currentPerson.workloadRows || [])];
    const targetRow = rows[rowIndex];
    if (!targetRow) return;
    const days = [...(targetRow.days || [])];
    if (days.includes(day)) {
      targetRow.days = days.filter(d => d !== day);
    } else {
      targetRow.days = [...days, day];
    }
    handleFieldChange('workloadRows', rows);
  };

  // 2. Extra Tasks (Teaching-Related / Administrative Tasks)
  const addTaskRow = (key, optionsList) => {
    const rows = [...(currentPerson[key] || [])];
    if (key === 'teachingRelatedRows' || key === 'administrativeRows') {
      rows.push({ task: optionsList[0], dates: [{ date: '', startTime: '08:00', endTime: '09:00' }] });
    } else {
      rows.push({ task: optionsList[0], hours: 0, days: [] });
    }
    handleFieldChange(key, rows);
  };

  const removeTaskRow = (key, index) => {
    const rows = [...(currentPerson[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  const updateTaskField = (key, index, field, value) => {
    const rows = [...(currentPerson[key] || [])];
    rows[index] = { ...rows[index], [field]: value };
    handleFieldChange(key, rows);
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

        const isTR = row.subject.toUpperCase().startsWith('TR -') || row.subject.toUpperCase() === 'ADVISORY' || row.subject.toUpperCase() === 'COACHING AND MENTORING';
        const isAdmin = row.subject.toUpperCase().startsWith('ADMIN TASK -') || row.subject.toUpperCase() === 'ADMINISTRATIVE' || row.subject.toUpperCase() === 'RELATED TASK';

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

  // Calculations for display
  const coverageLoads = getCoverageMinutes(workloadTransfers, currentPerson?.id || '');
  const coverageTeachingHours = (coverageLoads.teachingMins / 60);
  const coverageRelatedHours = (coverageLoads.relatedMins / 60);
  const coverageAdminHours = (coverageLoads.adminMins / 60);
  const totalCoverageHours = coverageTeachingHours + coverageRelatedHours + coverageAdminHours;

  const baseWeeklyTeachingMinutes = (() => {
    const rows = currentPerson?.workloadRows || [];
    const daysList = ['M', 'T', 'W', 'TH', 'F'];
    let totalMins = 0;

    for (const d of daysList) {
      const intervals = [];
      for (const r of rows) {
        if ((r.days || []).includes(d)) {
          if (r.subject === 'ADVISORY') {
            totalMins += 60;
          } else if (r.startTime && r.endTime) {
            const [startH, startM] = r.startTime.split(':').map(Number);
            const [endH, endM] = r.endTime.split(':').map(Number);
            intervals.push([startH * 60 + startM, endH * 60 + endM]);
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
  const teachingOverloadHours = Math.max(0, Number(weeklyTeachingHours) - 30).toFixed(1);

  const baseWeeklyRelatedHours = ((currentPerson?.teachingRelatedRows) || []).reduce((total, row) => {
    const daysCount = Array.isArray(row.days) ? row.days.length : 0;
    return total + ((Number(row.hours) || 0) * daysCount);
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

  const sectionSlots = (() => {
    if (!selectedSectionId) return [];
    const slots = [];
    personnel.forEach(p => {
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
        let rowSecId = row.sectionId;
        if (!rowSecId && row.subject === 'ADVISORY') {
          const advisorySec = (classSections || []).find(s => s.advisorId && p.id && String(s.advisorId) === String(p.id));
          if (advisorySec) rowSecId = String(advisorySec.id);
        }
        if (rowSecId && String(rowSecId) === String(selectedSectionId)) {
          slots.push({ ...row, sectionId: String(rowSecId), personnelId: p.id, personnelName: `${p.firstName} ${p.lastName}`, rowIdx });
        }
      });
    });
    return slots;
  })();

  const checkConflict = (teacherId, sectionId, startTime, endTime, days) => {
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
          ...(activeTeacher.workloadRows || []),
          ...(activeTeacher.teachingRelatedRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task })),
          ...(activeTeacher.administrativeRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task }))
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
      }
    }
    return null;
  };

  useEffect(() => {
    if (workloadView === 'by-section' && selectedSectionId) {
      const c = checkConflict(newSlot.teacherId, selectedSectionId, newSlot.startTime, newSlot.endTime, newSlot.days);
      setSlotConflict(c);
    }
  }, [newSlot.teacherId, newSlot.startTime, newSlot.endTime, newSlot.days, selectedSectionId, personnel, classSections, workloadView]);

  const handleAddSectionSlot = async () => {
    if (!selectedSectionId || !newSlot.teacherId || !newSlot.subject || !newSlot.startTime || !newSlot.endTime || !newSlot.days.length) {
      await showAlert("Fields Required", "Please fill in all fields before adding a slot.");
      return;
    }
    const conflict = checkConflict(newSlot.teacherId, selectedSectionId, newSlot.startTime, newSlot.endTime, newSlot.days);
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
    const newRow = { category: cat, subject: newSlot.subject, remediationSubject: newSlot.remediationSubject || '', gradeLevel: sec?.gradeLevel || '', sectionId: selectedSectionId, startTime: newSlot.startTime, endTime: newSlot.endTime, days: newSlot.days };

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

    handleFieldChangeForPerson(targetTeacher.id, 'workloadRows', [...activeRows, newRow]);
    setSlotConflict(null);
    const { nextStart: slotNextStart, nextEnd: slotNextEnd, nextDays: slotNextDays } = getWorkloadScheduleDefaults(sectionSlots);
    setNewSlot({ teacherId: '', subject: '', remediationSubject: '', startTime: slotNextStart, endTime: slotNextEnd, days: slotNextDays });
  };

  const handleRemoveSectionSlot = (personnelId, rowIdx) => {
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
  };

  const toggleNewSlotDay = (day) => {
    setNewSlot(prev => {
      const days = prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day];
      const updated = { ...prev, days };
      const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
      setSlotConflict(c);
      return updated;
    });
  };

  const handleSaveChangesDirectly = async () => {
    if (!currentPerson) return;

    // Check for workload conflicts
    const hasAnyConflict = (currentPerson.workloadRows || []).some((row, idx) => {
      return (currentPerson.workloadRows || []).some((otherRow, otherIdx) => {
        if (idx === otherIdx) return false;
        if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
        const daysOverlap = (row.days || []).some(d => (otherRow.days || []).includes(d));
        if (!daysOverlap) return false;
        const ns = parseTimeToMinutes(row.startTime), ne = parseTimeToMinutes(row.endTime);
        const rs = parseTimeToMinutes(otherRow.startTime), re = parseTimeToMinutes(otherRow.endTime);
        if (ns < re && ne > rs) {
          if (isAdvisoryOrHgpPair(row, otherRow)) return false;
          return true;
        }
        return false;
      });
    });

    if (hasAnyConflict) {
      await showAlert("Schedule Conflict", "Cannot save. There are overlapping schedule times in the workload rows. Please resolve them first.");
      return;
    }

    try {
      await savePersonnelChanges(currentPerson.id, currentPerson);

      // Sync workload schedule changes directly to PostgreSQL server
      await api.updatePersonnelWorkloadRows(
        currentPerson.id,
        currentPerson.workloadRows || [],
        currentPerson.teachingRelatedRows || [],
        currentPerson.administrativeRows || []
      );

      localStorage.removeItem(`draft_workload_${currentPerson.id}`);
      showToast("Workload changes saved to database successfully.");
    } catch (err) {
      await showAlert("Error", "Failed to save workload changes: " + err.message);
    }
  };

  const handleSaveValidate = async () => {
    if (!currentPerson) return;

    // Check for workload conflicts
    const hasAnyConflict = (currentPerson.workloadRows || []).some((row, idx) => {
      return (currentPerson.workloadRows || []).some((otherRow, otherIdx) => {
        if (idx === otherIdx) return false;
        if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
        const daysOverlap = (row.days || []).some(d => (otherRow.days || []).includes(d));
        if (!daysOverlap) return false;
        const ns = parseTimeToMinutes(row.startTime), ne = parseTimeToMinutes(row.endTime);
        const rs = parseTimeToMinutes(otherRow.startTime), re = parseTimeToMinutes(otherRow.endTime);
        if (ns < re && ne > rs) {
          if (isAdvisoryOrHgpPair(row, otherRow)) return false;
          return true;
        }
        return false;
      });
    });

    if (hasAnyConflict) {
      await showAlert("Schedule Conflict", "Cannot save. There are overlapping schedule times in the workload rows. Please resolve them first.");
      return;
    }

    try {
      const updated = { ...currentPerson, workloadVerified: true };
      setEditPerson(updated);

      // Update local state first
      await savePersonnelChanges(currentPerson.id, updated);

      // Sync workload schedule changes directly to PostgreSQL server
      await api.updatePersonnelWorkloadRows(
        currentPerson.id,
        updated.workloadRows || [],
        updated.teachingRelatedRows || [],
        updated.administrativeRows || []
      );

      // Verify workload status on PostgreSQL server
      await api.verifyPersonnel(currentPerson.id, { field: 'workload', value: true });

      localStorage.removeItem(`draft_workload_${currentPerson.id}`);
      showToast("Workload verified and saved successfully!");
    } catch (err) {
      await showAlert("Error", "Failed to save and validate workload: " + err.message);
    }
  };
  // ────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────

  return (
    <section id="workload" className="view grid">
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
      </datalist>
      <article className="card">
        <div className="card-inner">

          {/* ── View Mode Toggle ── */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', background: 'var(--blue-50)', padding: '5px', borderRadius: '12px', width: 'fit-content', border: '1.5px solid var(--line)' }}>
            <button type="button" onClick={() => setWorkloadView('by-personnel')}
              style={{
                padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s',
                background: workloadView === 'by-personnel' ? 'linear-gradient(180deg, var(--blue), var(--navy))' : 'transparent',
                color: workloadView === 'by-personnel' ? 'white' : 'var(--navy)'
              }}
            >👤 By Personnel</button>
            <button type="button" onClick={() => setWorkloadView('by-section')}
              style={{
                padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s',
                background: workloadView === 'by-section' ? 'linear-gradient(180deg, var(--blue), var(--navy))' : 'transparent',
                color: workloadView === 'by-section' ? 'white' : 'var(--navy)'
              }}
            >🏫 By Section</button>
          </div>

          {/* ── BY SECTION VIEW ── */}
          {workloadView === 'by-section' && (
            <div>
              <div className="workload-header" style={{ marginBottom: '20px' }}>
                <h2>Workload Management · By Section</h2>
                <p className="subtext">Assign teachers to class sections by subject and schedule. Conflicts are automatically detected and blocked.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div className="workload-personnel-picker" style={{ border: '2.5px solid var(--gold)', background: 'linear-gradient(180deg, #FFFBEB, #fff)', boxShadow: 'inset 0 -3px 0 rgba(251,191,36,.45)' }}>
                  <SearchableSelect
                    value={selectedSectionId}
                    placeholder="-- Choose a section --"
                    options={(classSections || []).map(s => ({ value: s.id, label: `${s.gradeLevel} — ${s.sectionName}` }))}
                    onChange={(e) => {
                      setSelectedSectionId(e.target.value);
                      setSlotConflict(null);
                      setNewSlot({ teacherId: '', subject: '', startTime: '08:00', endTime: '09:00', days: ['M', 'T', 'W', 'TH', 'F'] });
                    }}
                  />
                  <p className="field-help" style={{ marginTop: '4px' }}>Select a class section to manage its weekly subject schedule.</p>
                </div>

                {selectedSectionId && (() => {
                  const sec = (classSections || []).find(s => s.id === selectedSectionId);
                  const adviser = sec?.advisorId ? personnel.find(p => p.id === sec.advisorId) : null;
                  return (
                    <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--blue))', borderRadius: '14px', padding: '16px 20px', color: 'white' }}>
                      <p style={{ fontSize: '10px', opacity: 0.7, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Section Info</p>
                      <h3 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '800' }}>{sec?.gradeLevel} — {sec?.sectionName}</h3>
                      <p style={{ margin: '0 0 2px', fontSize: '12px', opacity: 0.85 }}>Class Adviser: <strong>{adviser ? `${adviser.firstName} ${adviser.lastName}` : 'Not assigned'}</strong></p>
                      <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>{sectionSlots.length} schedule slot{sectionSlots.length !== 1 ? 's' : ''} assigned</p>
                    </div>
                  );
                })()}
              </div>

              {!selectedSectionId && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: '16px' }}>
                  <p style={{ fontSize: '32px', margin: '0 0 8px' }}>🏫</p>
                  <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--navy)', margin: '0 0 6px' }}>Select a Section to Begin</p>
                  <p style={{ fontSize: '13px', maxWidth: '380px', margin: '0 auto' }}>Choose a class section above to view its schedule and assign teachers.</p>
                </div>
              )}

              {selectedSectionId && (<>

                {/* Schedule Table */}
                <div className="workload-section-panel" style={{ marginBottom: '24px' }}>
                  <div className="workload-section-title">
                    <div>
                      <h3>Current Section Schedule</h3>
                      <p className="subtext">All subjects assigned to this section with their teachers and time slots.</p>
                    </div>
                  </div>
                  {sectionSlots.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: '12px' }}>
                      <p style={{ fontSize: '24px', margin: '0 0 6px' }}>📋</p>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: 'var(--navy)', margin: '0 0 4px' }}>No schedule slots yet</p>
                      <p style={{ fontSize: '12px' }}>Use the form below to add subjects and assign teachers to this section.</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(180deg, var(--blue-50), white)', borderBottom: '1.5px solid var(--line)' }}>
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
                            <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--navy)' }}>{slot.subject}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--slate-700)' }}>{slot.personnelName}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--slate-700)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>{slot.startTime} – {slot.endTime}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                {(slot.days || []).map(d => (
                                  <span key={d} style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: '700' }}>{d}</span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <button className="btn danger" type="button" onClick={() => handleRemoveSectionSlot(slot.personnelId, slot.rowIdx)} style={{ padding: '4px 12px', fontSize: '11px', minHeight: 'auto' }}>Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Add Slot Form */}
                <div className="workload-section-panel" style={{ background: 'linear-gradient(180deg, #f0f9ff, #fff)', border: '1.5px solid #bfdbfe', borderRadius: '16px', padding: '20px' }}>
                  <div className="workload-section-title" style={{ marginBottom: '16px' }}>
                    <div>
                      <h3>+ Add Schedule Slot</h3>
                      <p className="subtext">Assign a teacher and subject to a time slot. Conflicts will be blocked automatically.</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Teacher</label>
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
                                const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
                                setSlotConflict(c);
                                return updated;
                              });
                            }}
                          />
                        );
                      })()}
                      {(() => {
                        const selectedTeacher = personnel.find(p => p.id === newSlot.teacherId);
                        if (!selectedTeacher) return null;
                        const teacherScheduleRows = [
                          ...(selectedTeacher.workloadRows || []),
                          ...(selectedTeacher.teachingRelatedRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task, isTR: true })),
                          ...(selectedTeacher.administrativeRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task, isAdmin: true }))
                        ];
                        return (
                          <div style={{ marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                            <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>📅 Teacher's Weekly Busy Schedule:</strong>
                            {teacherScheduleRows.length === 0 ? (
                              <span style={{ color: 'var(--muted)' }}>No assigned classes or tasks yet.</span>
                            ) : (
                              <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--slate-700)', maxHeight: '120px', overflowY: 'auto' }}>
                                {teacherScheduleRows.map((r, i) => (
                                  <li key={i} style={{ marginBottom: '2px' }}>
                                    <strong>{r.subject}</strong>: {r.startTime} – {r.endTime} [{(r.days || []).join(', ')}]
                                    {r.isTR && <span style={{ color: 'var(--blue)', marginLeft: '4px', fontSize: '9px', fontWeight: 'bold' }}>(TR)</span>}
                                    {r.isAdmin && <span style={{ color: 'var(--purple)', marginLeft: '4px', fontSize: '9px', fontWeight: 'bold' }}>(Admin)</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Subject</label>
                      {(() => {
                        const sec = (classSections || []).find(s => s.id === selectedSectionId);
                        let rawSubjects = [];
                        if (!sec) {
                          rawSubjects = SUBJECT_OPTIONS;
                        } else {
                          let cat = 'JHS';
                          for (const [c, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
                            if (grades.includes(sec.gradeLevel)) {
                              cat = c;
                              break;
                            }
                          }
                          rawSubjects = getSubjectsForGrade(sec.gradeLevel, cat);
                        }

                        const subjectOptions = rawSubjects
                          .filter(s => s !== 'ADVISORY')
                          .map(s => ({ value: s, label: s }));

                        return (
                          <SearchableSelect
                            value={newSlot.subject || ''}
                            placeholder="Select subject..."
                            options={subjectOptions}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'REMEDIATION') {
                                const defaultSub = (sec?.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
                                setNewSlot(prev => ({ ...prev, subject: val, remediationSubject: defaultSub }));
                              } else {
                                setNewSlot(prev => ({ ...prev, subject: val, remediationSubject: '' }));
                              }
                            }}
                          />
                        );
                      })()}

                      {/* Secondary Remediation Dropdown */}
                      {(() => {
                        const sec = (classSections || []).find(s => s.id === selectedSectionId);
                        if (newSlot.subject === 'REMEDIATION') {
                          const isKinder = sec?.gradeLevel === 'Kinder';
                          const subOptions = isKinder
                            ? [
                              'KINDER BLOCKS OF TIME',
                              'LANGUAGE',
                              'READING AND LITERACY',
                              'MAKABANSA',
                              'ARALING PANLIPUNAN',
                              'FILIPINO',
                              'ENGLISH',
                              'MATHEMATICS',
                              'SCIENCE',
                              'EPP/TLE',
                              'MAPEH',
                              'VALUES EDUCATION',
                              'GMRC'
                            ]
                            : [
                              'ARALING PANLIPUNAN',
                              'FILIPINO',
                              'ENGLISH',
                              'MATHEMATICS',
                              'SCIENCE',
                              'EPP/TLE',
                              'MAPEH',
                              'VALUES EDUCATION',
                              'GMRC'
                            ];
                          const subSubjectValue = newSlot.remediationSubject || (isKinder ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN');

                          return (
                            <div style={{ marginTop: '8px' }}>
                              <label style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 'bold' }}>Remediation Focus</label>
                              <select
                                value={subSubjectValue}
                                onChange={(e) => setNewSlot(prev => ({ ...prev, remediationSubject: e.target.value }))}
                                style={{ width: '100%' }}
                              >
                                {subOptions.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div>
                      <label>Start Time</label>
                      <input type="time" list="school-times" value={newSlot.startTime} onChange={(e) => {
                        const startTime = e.target.value;
                        setNewSlot(prev => {
                          const updated = { ...prev, startTime };
                          const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
                          setSlotConflict(c);
                          return updated;
                        });
                      }} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label>End Time</label>
                      <input type="time" list="school-times" value={newSlot.endTime} onChange={(e) => {
                        const endTime = e.target.value;
                        setNewSlot(prev => {
                          const updated = { ...prev, endTime };
                          const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
                          setSlotConflict(c);
                          return updated;
                        });
                      }} style={{ width: '100%' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Days</label>
                      <div className="day-checks">
                        {['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN'].map(day => (
                          <div key={day} className={`day-check ${newSlot.days.includes(day) ? 'checked' : ''}`} onClick={() => toggleNewSlotDay(day)}
                            style={{ background: newSlot.days.includes(day) ? 'linear-gradient(180deg, var(--blue), var(--navy))' : 'white', color: newSlot.days.includes(day) ? 'white' : 'var(--blue)' }}
                          >
                            {day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday'}
                          </div>
                        ))}
                      </div>
                    </div>
                    {slotConflict && (
                      <div style={{ gridColumn: '1 / -1', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
                        <div>
                          <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#b91c1c', fontSize: '13px' }}>
                            {slotConflict.type === 'section' ? 'Section Schedule Conflict Detected' : 'Teacher Schedule Conflict Detected'}
                          </p>
                          <p style={{ margin: 0, color: '#7f1d1d', fontSize: '12px' }}>
                            {slotConflict.type === 'section'
                              ? `This section already has ${slotConflict.subject} scheduled from ${slotConflict.startTime} – ${slotConflict.endTime} (assigned to ${slotConflict.teacherName}) on [${(slotConflict.days || []).join(', ')}]. Please choose a different time slot or day.`
                              : `${slotConflict.teacherName} is already assigned to ${slotConflict.subject} from ${slotConflict.startTime} – ${slotConflict.endTime} on [${(slotConflict.days || []).join(', ')}]. Please choose a different time or teacher.`}
                          </p>
                        </div>
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <button className="btn ok" type="button" onClick={handleAddSectionSlot}
                        disabled={!!slotConflict}
                        style={{
                          width: '100%',
                          background: slotConflict ? '#cbd5e1' : 'linear-gradient(180deg, var(--blue), var(--navy))',
                          color: slotConflict ? '#64748b' : 'white',
                          fontWeight: '700',
                          border: 'none',
                          cursor: slotConflict ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {slotConflict ? '⚠️ Fix Conflict to Add' : '+ Add Slot to Section'}
                      </button>
                    </div>
                  </div>
                </div>
              </>)}
            </div>
          )}

          {/* ── BY PERSONNEL VIEW (split-screen layout) ── */}
          {workloadView === 'by-personnel' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start', marginTop: '10px' }}>
              {/* Left Column: Teacher Roster Sidebar */}
              <div style={{ background: 'white', padding: '16px', borderRadius: '16px', border: '1.5px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px', height: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--navy)', margin: 0, fontWeight: 'bold' }}>Select Teacher</h3>

                {/* Search Input */}
                <input
                  type="text"
                  placeholder="Search name or position..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
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

                {/* Vertical Teacher List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                  {filteredPeople.map((p) => {
                    const isActive = currentPerson && p.id === currentPerson.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setActivePersonnelId(p.id)}
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
                    );
                  })}
                  {filteredPeople.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '13px' }}>
                      No matching teachers found.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Workload Editor */}
              <div style={{ minWidth: 0 }}>
                {!currentPerson ? (
                  <div className="card" style={{ padding: '40px', textAlign: 'center', border: '1.5px solid var(--line)', borderRadius: '16px', background: 'white' }}>
                    <h3 style={{ color: 'var(--navy)', margin: 0 }}>No Teacher Selected</h3>
                    <p className="subtext" style={{ margin: '8px 0 0 0' }}>Please select a teacher from the roster list on the left to configure workloads.</p>
                  </div>
                ) : (
                  <>
                    {/* Draft Banner if exists */}
                    {localStorage.getItem(`draft_workload_${currentPerson?.id}`) && (
                      <div style={{ padding: '12px 16px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '12px', color: '#B45309', fontSize: '13px', marginBottom: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>⚠️ You have unsaved workload changes for this personnel (draft stored locally).</span>
                        <button className="btn secondary" style={{ minHeight: '28px', padding: '0 10px', fontSize: '12px', background: 'white', color: '#B45309', borderColor: '#FCD34D' }} type="button" onClick={async () => {
                          if (await showConfirm("Discard Draft?", "Are you sure you want to discard your unsaved changes and revert to the server data?")) {
                            localStorage.removeItem(`draft_workload_${dbPerson.id}`);
                            setEditPerson(dbPerson);
                          }
                        }}>
                          Discard Draft
                        </button>
                      </div>
                    )}

                    {/* Workload KPIs */}
                    <div className="workload-kpis">
                      <div className="kpi">
                        <span>Weekly Teaching Load</span>
                        <strong>{weeklyTeachingHours} hrs</strong>
                        {coverageTeachingHours > 0 && <small style={{ color: 'var(--blue)', fontSize: '10px', display: 'block', marginTop: '2px' }}>(includes {coverageTeachingHours.toFixed(1)}h coverage)</small>}
                      </div>
                      <div className="kpi">
                        <span>Daily Avg Teaching</span>
                        <strong>{dailyAvgTeachingHours} hrs</strong>
                      </div>
                      <div className="kpi">
                        <span>Overload Hours</span>
                        <strong>{teachingOverloadHours} hrs</strong>
                      </div>
                      <div className="kpi">
                        <span>Weekly Teaching-Related</span>
                        <strong>{weeklyRelatedHours} hrs</strong>
                        {coverageRelatedHours > 0 && <small style={{ color: 'var(--blue)', fontSize: '10px', display: 'block', marginTop: '2px' }}>(includes {coverageRelatedHours.toFixed(1)}h coverage)</small>}
                      </div>
                      <div className="kpi">
                        <span>Weekly Administrative</span>
                        <strong>{weeklyAdminHours} hrs</strong>
                        {coverageAdminHours > 0 && <small style={{ color: 'var(--blue)', fontSize: '10px', display: 'block', marginTop: '2px' }}>(includes {coverageAdminHours.toFixed(1)}h coverage)</small>}
                      </div>
                    </div>

                    {/* Subject schedule panel */}
                    {currentPerson.type === 'teaching' && (
                      <div className="workload-section-panel">
                        <div className="workload-section-title">
                          <div>
                            <h3>Teaching Workload Rows</h3>
                            <p className="subtext">
                              Classroom subject periods assigned to this teacher.
                              {getAssignedGradeLevels(currentPerson).length > 0 ? (
                                <span style={{ marginLeft: '8px', color: 'var(--blue)', fontWeight: 'bold' }}>
                                  (Assigned Grades: {getAssignedGradeLevels(currentPerson).join(', ')})
                                </span>
                              ) : (
                                <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>
                                  (No pre-assigned grade levels - showing all options)
                                </span>
                              )}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            {/* Time Sort Select Dropdown */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600' }}>Sort Time:</span>
                              <select
                                value={timeSortOrder}
                                onChange={(e) => setTimeSortOrder(e.target.value)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: '1.5px solid var(--line)',
                                  fontSize: '12px',
                                  background: 'white',
                                  color: '#334155',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="added">Newest First (Added)</option>
                                <option value="asc">Earliest First (Asc)</option>
                                <option value="desc">Latest First (Desc)</option>
                              </select>
                            </div>

                            {/* View Mode Toggle Segmented Control */}
                            <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
                              <button
                                type="button"
                                onClick={() => setLayoutType('card')}
                                style={{
                                  padding: '8px 12px',
                                  background: layoutType === 'card' ? '#f1f5f9' : 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: layoutType === 'card' ? 'bold' : 'normal',
                                  color: layoutType === 'card' ? 'var(--blue)' : 'var(--muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Grid/Cards View"
                              >
                                <span>▦</span> Cards
                              </button>
                              <button
                                type="button"
                                onClick={() => setLayoutType('list')}
                                style={{
                                  padding: '8px 12px',
                                  background: layoutType === 'list' ? '#f1f5f9' : 'white',
                                  border: 'none',
                                  borderLeft: '1.5px solid var(--line)',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: layoutType === 'list' ? 'bold' : 'normal',
                                  color: layoutType === 'list' ? 'var(--blue)' : 'var(--muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="List View"
                              >
                                <span>≡</span> List
                              </button>
                            </div>
                            <button className="btn secondary" type="button" onClick={addWorkloadRow}>+ Add subject schedule</button>
                          </div>
                        </div>

                        <div className="workload-builder" style={layoutType === 'list' ? { display: 'block', background: 'white', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px' } : {}}>
                          {layoutType === 'list' && (currentPerson.workloadRows || []).length > 0 && (
                            <div style={{
                              display: 'flex',
                              gap: '12px',
                              padding: '8px 16px',
                              fontWeight: '700',
                              fontSize: '11px',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              borderBottom: '1.5px solid var(--line)',
                              marginBottom: '12px'
                            }}>
                              <div style={{ width: '120px' }}>Category</div>
                              <div style={{ width: '120px' }}>Grade</div>
                              <div style={{ width: '160px' }}>Section</div>
                              <div style={{ width: '160px' }}>Subject</div>
                              <div style={{ width: '90px' }}>Start Time</div>
                              <div style={{ width: '90px' }}>End Time</div>
                              <div style={{ flex: 1 }}>Usual Days</div>
                              <div style={{ width: '90px', textAlign: 'right' }}>Actions</div>
                            </div>
                          )}

                          {(() => {
                            const rawRows = currentPerson.workloadRows || [];
                            const indexedRows = rawRows.map((r, originalIdx) => ({ ...r, originalIdx }));
                            let sortedRows = [...indexedRows];
                            if (timeSortOrder === 'asc') {
                              sortedRows.sort((a, b) => {
                                const minA = parseTimeToMinutes(a.startTime);
                                const minB = parseTimeToMinutes(b.startTime);
                                if (minA !== minB) return minA - minB;
                                const endMinA = parseTimeToMinutes(a.endTime);
                                const endMinB = parseTimeToMinutes(b.endTime);
                                if (endMinA !== endMinB) return endMinA - endMinB;
                                return a.originalIdx - b.originalIdx;
                              });
                            } else if (timeSortOrder === 'desc') {
                              sortedRows.sort((a, b) => {
                                const minA = parseTimeToMinutes(a.startTime);
                                const minB = parseTimeToMinutes(b.startTime);
                                if (minA !== minB) return minB - minA;
                                const endMinA = parseTimeToMinutes(a.endTime);
                                const endMinB = parseTimeToMinutes(b.endTime);
                                if (endMinA !== endMinB) return endMinB - endMinA;
                                return a.originalIdx - b.originalIdx;
                              });
                            }

                            return sortedRows.map((row) => {
                              const idx = row.originalIdx;
                              const advisorySec = (classSections || []).find(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
                              if (isAdvisorySub(row.subject) && advisorySec && !row.sectionId) {
                                row.sectionId = String(advisorySec.id);
                                row.gradeLevel = advisorySec.gradeLevel;
                              }
                              const hasConflict = (currentPerson.workloadRows || []).some((otherRow, otherIdx) => {
                                if (idx === otherIdx) return false;
                                if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
                                const daysOverlap = (row.days || []).some(d => (otherRow.days || []).includes(d));
                                if (!daysOverlap) return false;
                                const ns = parseTimeToMinutes(row.startTime), ne = parseTimeToMinutes(row.endTime);
                                const rs = parseTimeToMinutes(otherRow.startTime), re = parseTimeToMinutes(otherRow.endTime);

                                if (ns < re && ne > rs) {
                                  if (isAdvisoryOrHgpPair(row, otherRow)) return false;
                                  return true;
                                }
                                return false;
                              });

                              const cardRowId = row.id || `workload-row-${idx}`;
                              const isNewlyAdded = newlyAddedWorkloadId && (String(row.id) === String(newlyAddedWorkloadId) || String(cardRowId) === String(newlyAddedWorkloadId));

                              const currentSecId = String(row.sectionId || row.section_id || '');

                              const cardHasError = hasConflict;

                              return (
                                <div
                                  key={idx}
                                  ref={(el) => {
                                    if (row.id) workloadCardRefs.current[row.id] = el;
                                    workloadCardRefs.current[cardRowId] = el;
                                  }}
                                  className={`${layoutType === 'card' ? 'workload-row' : ''} ${isNewlyAdded ? 'workload-card-newly-added' : ''}`}
                                  style={{
                                    ...(layoutType === 'list'
                                      ? {
                                          display: 'flex',
                                          gap: '12px',
                                          alignItems: 'center',
                                          padding: '10px 16px',
                                          borderBottom: '1px solid var(--line)',
                                          background: cardHasError ? '#FEF2F2' : 'white',
                                          borderLeft: cardHasError ? '4px solid #EF4444' : 'none'
                                        }
                                      : (cardHasError ? { border: '1.5px solid #EF4444', background: '#FEF2F2', padding: '16px', borderRadius: '12px' } : {})),
                                    position: 'relative'
                                  }}
                                >
                                  {isNewlyAdded && (
                                    <span className="badge-new-item">Just Added</span>
                                  )}




                                  {layoutType === 'list' ? (
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                                      {/* Category */}
                                      <div style={{ width: '120px' }}>
                                        <SearchableSelect
                                          disabled={row.subject === 'ADVISORY'}
                                          value={row.category || 'Elementary'}
                                          onChange={(e) => {
                                            const cat = e.target.value;
                                            const grades = GRADE_LEVELS_BY_CATEGORY[cat] || [];
                                            const newGrade = grades[0] || 'Grade 1';
                                            const newSubjects = getSubjectsForGrade(newGrade, cat);
                                            updateWorkloadRowFields(idx, {
                                              category: cat,
                                              gradeLevel: newGrade,
                                              sectionId: '',
                                              subject: newSubjects.includes(row.subject) ? row.subject : (newSubjects.find(s => s !== 'ADVISORY') || '')
                                            });
                                          }}
                                          options={(getExpandedOfferings() || ['Elementary']).map(c => ({ value: c, label: c }))}
                                        />
                                      </div>

                                      {/* Grade Level */}
                                      <div style={{ width: '120px' }}>
                                        <SearchableSelect
                                          disabled={row.subject === 'ADVISORY'}
                                          value={row.gradeLevel || ''}
                                          onChange={(e) => {
                                            const g = e.target.value;
                                            const newSubjects = getSubjectsForGrade(g, row.category || 'Elementary');
                                            updateWorkloadRowFields(idx, {
                                              gradeLevel: g,
                                              sectionId: '',
                                              subject: newSubjects.includes(row.subject) ? row.subject : (newSubjects.find(s => s !== 'ADVISORY') || '')
                                            });
                                          }}
                                          options={(GRADE_LEVELS_BY_CATEGORY[row.category || 'Elementary'] || []).map(g => ({ value: g, label: g }))}
                                        />
                                      </div>

                                      {/* Section */}
                                      <div style={{ width: '160px' }}>
                                        {(() => {
                                          const assignedGrades = getAssignedGradeLevels(currentPerson);
                                          const filteredSections = (classSections || []).filter(s => {
                                            if (assignedGrades.length === 0) return true;
                                            const sGradeNorm = (s.gradeLevel || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
                                            const assignedNorm = assignedGrades.map(g => (g || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - '));
                                            if (assignedGrades.includes(s.gradeLevel) || assignedNorm.includes(sGradeNorm)) return true;
                                            if (sGradeNorm.includes(' - ')) {
                                              const grades = sGradeNorm.split(' - ');
                                              return grades.some(g => assignedNorm.includes(g) || assignedGrades.includes(g));
                                            }
                                            return false;
                                          });

                                          const advisorySec = (classSections || []).find(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
                                          if (advisorySec && !filteredSections.some(s => String(s.id) === String(advisorySec.id))) {
                                            filteredSections.push(advisorySec);
                                          }
                                          const currentSecId = String(row.sectionId || row.section_id || '');
                                          if (currentSecId) {
                                            const currentSavedSec = (classSections || []).find(s => String(s.id) === currentSecId);
                                            if (currentSavedSec && !filteredSections.some(s => String(s.id) === currentSecId)) {
                                              filteredSections.push(currentSavedSec);
                                            }
                                          }

                                          const sectionOptions = filteredSections.map(s => ({
                                            value: String(s.id),
                                            label: `${s.sectionName} (${s.gradeLevel})`
                                          }));
                                          return (
                                            <SearchableSelect
                                              disabled={row.subject === 'ADVISORY' || row.subject === 'HGP'}
                                              value={(row.subject === 'ADVISORY' || row.subject === 'HGP') && advisorySec ? String(advisorySec.id) : currentSecId}
                                              onChange={(e) => handleSectionChangeForRow(idx, e.target.value)}
                                              options={sectionOptions}
                                              placeholder="Select section…"
                                            />
                                          );
                                        })()}
                                      </div>

                                      {/* Subject */}
                                      <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {(() => {
                                          const currentSecId = String(row.sectionId || row.section_id || '');
                                          const currentSub = row.subject || row.subject_name || '';
                                          const subjectList = (() => {
                                            if (!currentSecId && !currentSub) return [];
                                            const assignedGrades = getAssignedGradeLevels(currentPerson);
                                            if (row.gradeLevel) {
                                              return getSubjectsForGrade(row.gradeLevel, row.category || 'Elementary');
                                            } else if (assignedGrades.length > 0) {
                                              const unionSubjects = new Set();
                                              assignedGrades.forEach(g => {
                                                let resolvedCategory = 'Elementary';
                                                for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
                                                  if (grades.includes(g)) {
                                                    resolvedCategory = cat;
                                                    break;
                                                  }
                                                }
                                                getSubjectsForGrade(g, resolvedCategory).forEach(sub => unionSubjects.add(sub));
                                              });
                                              return Array.from(unionSubjects);
                                            } else {
                                              return SUBJECT_OPTIONS;
                                            }
                                          })();
                                          const filteredSubjectList = subjectList.filter(sub => {
                                            if (sub === 'ADVISORY' || sub === 'HGP') {
                                              const exists = (currentPerson.workloadRows || []).some((r, i) => i !== idx && r.subject === sub);
                                              return !exists;
                                            }
                                            return true;
                                          });
                                          if (currentSub && !filteredSubjectList.includes(currentSub)) {
                                            filteredSubjectList.push(currentSub);
                                          }
                                          const subjectOptions = filteredSubjectList.map(s => ({ value: s, label: s }));
                                          return (
                                            <SearchableSelect
                                              disabled={(!currentSecId && !currentSub) || row.subject === 'ADVISORY' || row.subject === 'HGP'}
                                              value={currentSub}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === 'REMEDIATION') {
                                                  const defaultSub = (row.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
                                                  updateWorkloadRowFields(idx, { subject: val, remediationSubject: defaultSub });
                                                } else {
                                                  updateWorkloadRowFields(idx, { subject: val, remediationSubject: '' });
                                                }
                                              }}
                                              options={subjectOptions}
                                              placeholder={!currentSecId ? 'Select section first…' : 'Select subject…'}
                                            />
                                          );
                                        })()}
                                        {row.subject === 'REMEDIATION' && (
                                          <SearchableSelect
                                            value={row.remediationSubject || (row.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN')}
                                            onChange={(e) => updateWorkloadRow(idx, 'remediationSubject', e.target.value)}
                                            options={
                                              (row.category === 'Elementary'
                                                ? REMEDIATION_FOCUS_BY_CATEGORY['Elementary']
                                                : (REMEDIATION_FOCUS_BY_CATEGORY[row.category] || REMEDIATION_FOCUS_BY_CATEGORY['ALL'])
                                              ).map(opt => ({ value: opt, label: opt }))
                                            }
                                          />
                                        )}
                                      </div>

                                      {/* Start Time */}
                                      <div style={{ width: '90px' }}>
                                        <input type="time" list="school-times" value={row.startTime} onChange={(e) => updateWorkloadRow(idx, 'startTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)' }} />
                                      </div>

                                      {/* End Time */}
                                      <div style={{ width: '90px' }}>
                                        <input type="time" list="school-times" value={row.endTime} onChange={(e) => updateWorkloadRow(idx, 'endTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)' }} />
                                      </div>

                                      {/* Usual Days */}
                                      <div style={{ flex: 1, minWidth: '150px' }}>
                                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                          {(row.subject === 'HGP' ? ['M', 'T', 'W', 'TH', 'F'] : ['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN']).map(day => (
                                            <div
                                              key={day}
                                              onClick={() => toggleWorkloadDay(idx, day)}
                                              style={{
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                minWidth: '28px',
                                                textAlign: 'center',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                background: row.days?.includes(day) ? 'linear-gradient(180deg, var(--blue), var(--navy))' : '#f1f5f9',
                                                color: row.days?.includes(day) ? 'white' : '#475569',
                                                border: '1px solid transparent',
                                                transition: 'all 0.15s'
                                              }}
                                              title={day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday'}
                                            >
                                              {day}
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Action Button */}
                                      <div style={{ width: '90px', display: 'flex', justifyContent: 'flex-end' }}>
                                        {row.subject === 'ADVISORY' || row.subject === 'HGP' ? (
                                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', paddingRight: '8px' }}>Locked 🔒</span>
                                        ) : (
                                          <button className="btn danger workload-remove-btn" type="button" onClick={() => removeWorkloadRow(idx)} style={{ minHeight: '30px', padding: '0 10px', fontSize: '12px' }}>Remove</button>
                                        )}
                                      </div>
                                      {hasConflict && (
                                        <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 'bold', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          ⚠️ Time conflict with another period.
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <>
                                      {/* ✕ Remove / Lock badge - top right */}
                                      {row.subject === 'ADVISORY' || row.subject === 'HGP' ? (
                                        <span style={{ position: 'absolute', top: '12px', right: '14px', fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>🔒 Locked</span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => removeWorkloadRow(idx)}
                                          style={{ position: 'absolute', top: '10px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', color: '#ef4444', opacity: 0.6, transition: 'opacity 0.15s', lineHeight: 1 }}
                                          onMouseEnter={(e) => e.target.style.opacity = 1}
                                          onMouseLeave={(e) => e.target.style.opacity = 0.6}
                                          title="Remove Schedule"
                                        >✕</button>
                                      )}

                                      {/* Badges row */}
                                      {(() => {
                                        let bgBadge = '#f0f9ff', clrBadge = '#0369a1';
                                        if (String(row.gradeLevel).toLowerCase().includes('kinder')) { bgBadge = '#fdf2f8'; clrBadge = '#be185d'; }
                                        else if (String(row.gradeLevel).toLowerCase().includes('grade 11') || String(row.gradeLevel).toLowerCase().includes('grade 12')) { bgBadge = '#faf5ff'; clrBadge = '#6b21a8'; }
                                        else if (String(row.gradeLevel).toLowerCase().includes('grade 7') || String(row.gradeLevel).toLowerCase().includes('grade 8') || String(row.gradeLevel).toLowerCase().includes('grade 9') || String(row.gradeLevel).toLowerCase().includes('grade 10')) { bgBadge = '#eff6ff'; clrBadge = '#1d4ed8'; }
                                        const linkedSec = (classSections || []).find(s => String(s.id) === String(row.sectionId || row.section_id || ''));
                                        return (
                                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginRight: '50px' }}>
                                            <span style={{ background: bgBadge, color: clrBadge, padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.02em' }}>{row.gradeLevel || 'No Grade'}</span>
                                            {linkedSec && (
                                              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                                                [{linkedSec.gradeLevel} - {linkedSec.sectionName}]
                                              </span>
                                            )}
                                            {(row.sectionId || row.section_id) && (
                                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Section Adviser</span>
                                            )}
                                            {row.category && (
                                              <span style={{ background: row.category === 'Elementary' ? '#f0fdf4' : '#fffbeb', color: row.category === 'Elementary' ? '#15803d' : '#b45309', padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{row.category}</span>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {/* Subject Title */}
                                      <h4 style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>{row.subject || 'Select Subject'}</h4>
                                      {/* Divider */}
                                      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '2px 0 4px' }} />

                                      {/* Compact fields grid */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                        <div>
                                          <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Section</label>
                                          {(() => {
                                            const assignedGrades = getAssignedGradeLevels(currentPerson);
                                            const filteredSections = (classSections || []).filter(s => {
                                              if (assignedGrades.length === 0) return true;
                                              const sGradeNorm = (s.gradeLevel || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
                                              const assignedNorm = assignedGrades.map(g => (g || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - '));
                                              if (assignedGrades.includes(s.gradeLevel) || assignedNorm.includes(sGradeNorm)) return true;
                                              if (sGradeNorm.includes(' - ')) {
                                                const grades = sGradeNorm.split(' - ');
                                                return grades.some(g => assignedNorm.includes(g) || assignedGrades.includes(g));
                                              }
                                              return false;
                                            });
                                            const advisorySec = (classSections || []).find(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
                                            if (advisorySec && !filteredSections.some(s => String(s.id) === String(advisorySec.id))) filteredSections.push(advisorySec);
                                            let currentSecId = String(row.sectionId || row.section_id || '');
                                            if (!currentSecId && row.gradeLevel) {
                                              const targetGradeNorm = row.gradeLevel.replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
                                              const autoSec = (classSections || []).find(s => (s.gradeLevel || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - ') === targetGradeNorm);
                                              if (autoSec) currentSecId = String(autoSec.id);
                                            }
                                            if (currentSecId) {
                                              const currentSavedSec = (classSections || []).find(s => String(s.id) === currentSecId);
                                              if (currentSavedSec && !filteredSections.some(s => String(s.id) === currentSecId)) filteredSections.push(currentSavedSec);
                                            }
                                            const sectionOptions = filteredSections.map(s => ({ value: String(s.id), label: `${s.sectionName} (${s.gradeLevel})` }));
                                            return (
                                              <SearchableSelect
                                                disabled={isAdvisorySub(row.subject)}
                                                value={isAdvisorySub(row.subject) && advisorySec ? String(advisorySec.id) : currentSecId}
                                                onChange={(e) => handleSectionChangeForRow(idx, e.target.value)}
                                                options={sectionOptions}
                                                placeholder="Select section…"
                                              />
                                            );
                                          })()}
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Subject</label>
                                          {(() => {
                                            const currentSecId = String(row.sectionId || row.section_id || '');
                                            const currentSub = row.subject || row.subject_name || '';
                                            const subjectList = (() => {
                                              if (!currentSecId && !currentSub) return [];
                                              const assignedGrades = getAssignedGradeLevels(currentPerson);
                                              if (row.gradeLevel) return getSubjectsForGrade(row.gradeLevel, row.category || 'Elementary');
                                              else if (assignedGrades.length > 0) {
                                                const unionSubjects = new Set();
                                                assignedGrades.forEach(g => {
                                                  let resolvedCategory = 'Elementary';
                                                  for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) { if (grades.includes(g)) { resolvedCategory = cat; break; } }
                                                  getSubjectsForGrade(g, resolvedCategory).forEach(sub => unionSubjects.add(sub));
                                                });
                                                return Array.from(unionSubjects);
                                              } else return SUBJECT_OPTIONS;
                                            })();
                                            const filteredSubjectList = subjectList.filter(sub => {
                                              if (sub === 'ADVISORY' || sub === 'HGP') { return !(currentPerson.workloadRows || []).some((r, i) => i !== idx && r.subject === sub); }
                                              return true;
                                            });
                                            if (currentSub && !filteredSubjectList.includes(currentSub)) {
                                              filteredSubjectList.push(currentSub);
                                            }
                                            return (
                                              <SearchableSelect
                                                disabled={(!currentSecId && !currentSub) || row.subject === 'ADVISORY' || row.subject === 'HGP'}
                                                value={currentSub}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  if (val === 'REMEDIATION') { updateWorkloadRowFields(idx, { subject: val, remediationSubject: (row.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN' }); }
                                                  else { updateWorkloadRowFields(idx, { subject: val, remediationSubject: '' }); }
                                                }}
                                                options={filteredSubjectList.map(s => ({ value: s, label: s }))}
                                                placeholder={!currentSecId ? 'Select section first…' : 'Select subject…'}
                                              />
                                            );
                                          })()}
                                        </div>
                                        {row.sectionId && (row.gradeLevel === 'Grade 11' || row.gradeLevel === 'Grade 12') && (
                                          <div>
                                            <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>SHS Category</label>
                                            <SearchableSelect
                                              value={row.category || 'SHS-CORE SUBJECTS'}
                                              onChange={(e) => {
                                                const newCat = e.target.value;
                                                const newSubjects = getSubjectsForGrade(row.gradeLevel, newCat);
                                                updateWorkloadRowFields(idx, { category: newCat, subject: newSubjects.includes(row.subject) ? row.subject : (newSubjects.find(s => s !== 'ADVISORY' && s !== 'HGP') || '') });
                                              }}
                                              options={[
                                                { value: 'SHS-CORE SUBJECTS', label: 'SHS-CORE SUBJECTS' },
                                                { value: 'SHS-APPLIED SUBJECTS', label: 'SHS-APPLIED SUBJECTS' },
                                                { value: 'SHS-SPECIALIZED SUBJECTS', label: 'SHS-SPECIALIZED SUBJECTS' },
                                                { value: 'SSHS-CORE', label: 'SSHS-CORE' },
                                                { value: 'SSHS-ACADEMIC', label: 'SSHS-ACADEMIC' },
                                                { value: 'SSHS-TECHPRO', label: 'SSHS-TECHPRO' }
                                              ]}
                                            />
                                          </div>
                                        )}
                                        {row.subject === 'REMEDIATION' && (
                                          <div>
                                            <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Remediation Focus</label>
                                            {(() => {
                                              const subOptions = row.category === 'Elementary' ? REMEDIATION_FOCUS_BY_CATEGORY['Elementary'] : (REMEDIATION_FOCUS_BY_CATEGORY[row.category] || REMEDIATION_FOCUS_BY_CATEGORY['ALL']);
                                              return (
                                                <SearchableSelect
                                                  value={row.remediationSubject || (row.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN')}
                                                  onChange={(e) => updateWorkloadRow(idx, 'remediationSubject', e.target.value)}
                                                  options={subOptions.map(opt => ({ value: opt, label: opt }))}
                                                />
                                              );
                                            })()}
                                          </div>
                                        )}
                                        <div>
                                          <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Start Time</label>
                                          <input type="time" list="school-times" value={row.startTime} onChange={(e) => updateWorkloadRow(idx, 'startTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }} />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>End Time</label>
                                          <input type="time" list="school-times" value={row.endTime} onChange={(e) => updateWorkloadRow(idx, 'endTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }} />
                                        </div>
                                      </div>

                                      {/* Day chips */}
                                      <div style={{ marginTop: '4px' }}>
                                        <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Usual Days</label>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                          {(row.subject === 'HGP' ? ['M', 'T', 'W', 'TH', 'F'] : ['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN']).map(day => (
                                            <div
                                              key={day}
                                              onClick={() => toggleWorkloadDay(idx, day)}
                                              style={{
                                                padding: '3px 8px', fontSize: '10px', minWidth: '26px', textAlign: 'center',
                                                borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                                                background: row.days?.includes(day) ? 'linear-gradient(180deg, var(--blue), var(--navy))' : '#f1f5f9',
                                                color: row.days?.includes(day) ? 'white' : '#475569',
                                                border: '1px solid transparent', transition: 'all 0.15s'
                                              }}
                                              title={day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday'}
                                            >{day}</div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Conflict warning inside card */}
                                      {hasConflict && (
                                        <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 'bold', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          ⚠️ Time conflict with another period on the same day(s).
                                        </div>
                                      )}
                                    </>
                                  )}
                              </div>
                            )
                          })
                        })()}
                        </div>
                      </div>
                    )}

                    {/* Extra Tasks builders */}
                    <div className="workload-section-panel" style={{ marginTop: '20px' }}>
                      <div className="workload-section-title">
                        <h3>Advisory and Extra Task Builders</h3>
                      </div>

                      <div className="task-assignment-grid">

                        {/* Teaching-related tasks */}
                        <div className="multi-task-panel">
                          <div className="multi-task-panel-head">
                            <label>Teaching-Related Tasks</label>
                            <button className="btn secondary" type="button" onClick={() => addTaskRow('teachingRelatedRows', TEACHING_RELATED_TASK_OPTIONS)}>
                              + Add task
                            </button>
                          </div>
                          <div className="multi-task-rows">
                            {(currentPerson.teachingRelatedRows || []).map((row, idx) => (
                              <div key={idx} className="multi-task-row teaching-related-layout" style={{ alignItems: 'flex-start' }}>
                                <div>
                                  <label>Task Type</label>
                                  <SearchableSelect
                                    value={row.task}
                                    onChange={(e) => updateTaskField('teachingRelatedRows', idx, 'task', e.target.value)}
                                    options={TEACHING_RELATED_TASK_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                  {(row.dates || []).map((dateEntry, dateIdx) => (
                                    <div key={dateIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                      <div style={{ flex: 1 }}>
                                        <label>Date</label>
                                        <DatePickerDropdowns
                                          value={dateEntry.date || ''}
                                          onChange={(val) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], date: val };
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>Start Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.startTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], startTime: e.target.value };
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>End Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.endTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], endTime: e.target.value };
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      {(row.dates || []).length > 1 && (
                                        <button
                                          type="button"
                                          style={{
                                            padding: 0,
                                            height: '34px',
                                            width: '34px',
                                            minWidth: '34px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '20px',
                                            fontSize: '14px',
                                            background: '#FEE2E2',
                                            color: '#EF4444',
                                            border: 'none',
                                            cursor: 'pointer',
                                            marginRight: '8px'
                                          }}
                                          onClick={() => {
                                            const updatedDates = (row.dates || []).filter((_, dIdx) => dIdx !== dateIdx);
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    style={{ alignSelf: 'flex-start', marginTop: '4px', fontSize: '11px', padding: '4px 10px', minHeight: 'auto' }}
                                    onClick={() => {
                                      const updatedDates = [...(row.dates || [])];
                                      updatedDates.push({ date: '', startTime: '08:00', endTime: '09:00' });
                                      updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                    }}
                                  >
                                    + Add Date
                                  </button>
                                </div>
                                <button className="btn danger" type="button" onClick={() => removeTaskRow('teachingRelatedRows', idx)} style={{ marginTop: '20px' }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Administrative tasks */}
                        <div className="multi-task-panel">
                          <div className="multi-task-panel-head">
                            <label>Administrative Tasks</label>
                            <button className="btn secondary" type="button" onClick={() => addTaskRow('administrativeRows', ADMINISTRATIVE_TASK_OPTIONS)}>
                              + Add task
                            </button>
                          </div>
                          <div className="multi-task-rows">
                            {(currentPerson.administrativeRows || []).map((row, idx) => (
                              <div key={idx} className="multi-task-row" style={{ alignItems: 'flex-start' }}>
                                <div>
                                  <label>Task Type</label>
                                  <SearchableSelect
                                    value={row.task}
                                    onChange={(e) => updateTaskField('administrativeRows', idx, 'task', e.target.value)}
                                    options={ADMINISTRATIVE_TASK_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                  {(row.dates || []).map((dateEntry, dateIdx) => (
                                    <div key={dateIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                      <div style={{ flex: 1 }}>
                                        <label>Date</label>
                                        <DatePickerDropdowns
                                          value={dateEntry.date || ''}
                                          onChange={(val) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], date: val };
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>Start Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.startTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], startTime: e.target.value };
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>End Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.endTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], endTime: e.target.value };
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      {(row.dates || []).length > 1 && (
                                        <button
                                          type="button"
                                          style={{
                                            padding: 0,
                                            height: '34px',
                                            width: '34px',
                                            minWidth: '34px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '20px',
                                            fontSize: '14px',
                                            background: '#FEE2E2',
                                            color: '#EF4444',
                                            border: 'none',
                                            cursor: 'pointer',
                                            marginRight: '8px'
                                          }}
                                          onClick={() => {
                                            const updatedDates = (row.dates || []).filter((_, dIdx) => dIdx !== dateIdx);
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    style={{ alignSelf: 'flex-start', marginTop: '4px', fontSize: '11px', padding: '4px 10px', minHeight: 'auto' }}
                                    onClick={() => {
                                      const updatedDates = [...(row.dates || [])];
                                      updatedDates.push({ date: '', startTime: '08:00', endTime: '09:00' });
                                      updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                    }}
                                  >
                                    + Add Date
                                  </button>
                                </div>
                                <button className="btn danger" type="button" onClick={() => removeTaskRow('administrativeRows', idx)} style={{ marginTop: '20px' }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px', borderTop: '1.5px solid var(--line)', paddingTop: '15px' }}>
                      <button className="btn" type="button" onClick={handleSaveChangesDirectly} style={{ background: '#0284c7', borderColor: '#0284c7', color: 'white' }}>
                        Save Changes
                      </button>
                      <button className="btn secondary" type="button" onClick={handleSaveValidate} style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}>
                        Save & Validate Workload
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
