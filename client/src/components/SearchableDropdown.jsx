import React, { useState, useEffect, useRef } from 'react';
import { FiChevronDown, FiEdit3 } from 'react-icons/fi';

export default function SearchableDropdown({ options = [], value = '', onChange, placeholder = 'Select...', disabled = false, required = false, allowCustom = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update search text when value changes
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const displayValue = typeof value === 'string' ? value.toUpperCase() : (value || '');
  const isRed = required && !displayValue;

  const isCustomOptionMatch = allowCustom && search.trim().length > 0 && !options.some(opt => opt.toUpperCase() === search.trim().toUpperCase());

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isCustomOptionMatch) {
        onChange(search.trim().toUpperCase());
        setIsOpen(false);
      } else if (filteredOptions.length > 0) {
        onChange(filteredOptions[0]);
        setIsOpen(false);
      }
    }
  };

  return (
    <div ref={wrapperRef} className="searchable-dropdown-container" style={{ position: 'relative', width: '100%' }}>
      <div
        className={`searchable-dropdown-toggle ${isOpen ? 'active' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: disabled ? '#f1f5f9' : 'white',
          border: isRed ? '1.5px solid var(--red, #EF4444)' : (isOpen ? '1.5px solid var(--blue, #0284C7)' : '1.5px solid var(--line, #BAE6FD)'),
          borderRadius: '12px',
          color: disabled ? '#94a3b8' : (displayValue ? 'var(--text, #0F172A)' : 'var(--muted, #64748B)'),
          cursor: disabled ? 'not-allowed' : 'pointer',
          minHeight: '42px',
          fontSize: '14px',
          boxSizing: 'border-box',
          boxShadow: (!disabled && isOpen) ? '0 0 0 3px rgba(125, 211, 252, .32)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <span>{displayValue || placeholder}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', color: disabled ? '#94a3b8' : 'var(--blue, #075985)', marginLeft: '8px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
          <FiChevronDown size={14} />
        </span>
      </div>

      {isOpen && (
        <div
          className="searchable-dropdown-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 999,
            background: 'white',
            border: '1.5px solid var(--line, #BAE6FD)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(8, 49, 95, 0.15), 0 8px 10px -6px rgba(8, 49, 95, 0.15)',
            overflow: 'hidden',
            maxHeight: '300px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1.5px solid var(--line, #BAE6FD)', background: 'var(--blue-50, #F0F9FF)' }}>
            <input
              type="text"
              autoFocus
              placeholder={allowCustom ? "Type to search or enter custom title..." : "Type to search..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'white',
                border: '1.5px solid var(--line, #BAE6FD)',
                borderRadius: '8px',
                color: 'var(--text, #0F172A)',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: '220px' }}>
            {isCustomOptionMatch && (
              <div
                onClick={() => {
                  onChange(search.trim().toUpperCase());
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#0284C7',
                  fontWeight: '700',
                  background: '#F0F9FF',
                  borderBottom: '1.5px dashed #BAE6FD',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FiEdit3 size={13} style={{ flexShrink: 0 }} /> Use Custom: "{search.trim().toUpperCase()}"
              </div>
            )}
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: opt === value ? 'var(--blue-600, #0284C7)' : 'var(--text, #0F172A)',
                    fontWeight: opt === value ? '700' : 'normal',
                    background: opt === value ? 'var(--blue-100, #E0F2FE)' : 'transparent',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    if (opt !== value) e.target.style.background = 'var(--blue-50, #F0F9FF)';
                  }}
                  onMouseLeave={(e) => {
                    if (opt !== value) e.target.style.background = 'transparent';
                  }}
                >
                  {opt}
                </div>
              ))
            ) : !isCustomOptionMatch && (
              <div style={{ padding: '12px 14px', color: 'var(--muted, #64748B)', fontSize: '13px', textAlign: 'center' }}>
                No matching options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
