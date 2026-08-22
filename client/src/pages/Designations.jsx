import React, { useState, useMemo } from 'react';
import {
  useApp,
  OFFICIAL_DESIGNATIONS,
  DESIGNATION_GRADE_LEVELS,
  SHS_TRACKS,
  SUBJECT_OPTIONS
} from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';

function SdsToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: checked ? '#DCFCE7' : '#F1F5F9',
        border: checked ? '1px solid #86EFAC' : '1px solid #CBD5E1',
        borderRadius: '999px',
        padding: '3px 9px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none'
      }}
    >
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: checked ? '#16A34A' : '#94A3B8',
          display: 'inline-block',
          boxShadow: checked ? '0 0 5px rgba(22, 163, 74, 0.5)' : 'none',
          transition: 'all 0.15s ease'
        }}
      />
      <span style={{ fontSize: '10px', fontWeight: '800', color: checked ? '#15803D' : '#64748B', letterSpacing: '0.3px' }}>
        {checked ? '✓ APPROVED BY SDS' : 'APPROVE BY SDS'}
      </span>
    </button>
  );
}

export default function Designations() {
  const { personnel, setPersonnel, savePersonnelChanges, schoolEdited, showToast, completeNode, setActiveView } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'matrix'

  // Local state for parameterized choices per card
  const [cardParams, setCardParams] = useState({
    grade_level_chairperson: { grade: 'Grade 1' },
    learning_area_chairperson: { grade: 'Grade 1' },
    department_head_ecp: { grade: 'Grade 1', learningArea: 'English', track: 'ACADEMIC' }
  });

  // State to track constraint violation alerts per card
  const [constraintErrors, setConstraintErrors] = useState({});

  // Active (non-draft) personnel list
  const activePersonnel = (Array.isArray(personnel) ? personnel : []).filter(p => !p.isDraft);

  // Active subjects from Organized Classes
  const activeSubjects = useMemo(() => {
    const list = new Set();
    if (schoolEdited?.subjects) {
      Object.values(schoolEdited.subjects).forEach(subList => {
        if (Array.isArray(subList)) {
          subList.forEach(s => {
            if (s?.name) list.add(s.name);
          });
        }
      });
    }
    if (list.size === 0) {
      SUBJECT_OPTIONS.forEach(s => {
        if (s !== 'ADVISORY') list.add(s);
      });
    }
    return Array.from(list);
  }, [schoolEdited]);

  // Helper to get selected params for a card
  const getParams = (desigId) => {
    return cardParams[desigId] || { grade: 'Grade 1', learningArea: 'English', track: 'ACADEMIC' };
  };

  // Helper to update params for a card
  const handleParamChange = (desigId, field, value) => {
    setCardParams(prev => ({
      ...prev,
      [desigId]: {
        ...getParams(desigId),
        [field]: value
      }
    }));
    setConstraintErrors(prev => ({ ...prev, [desigId]: null }));
  };

  // Helper to compute serialized designation key for a designation & its active params
  const getSerializedKey = (desig) => {
    const params = getParams(desig.id);
    if (desig.id === 'grade_level_chairperson') {
      return `GRADE LEVEL CHAIRPERSON - ${params.grade}`;
    }
    if (desig.id === 'learning_area_chairperson') {
      return `LEARNING AREA CHAIRPERSON - ${params.grade}`;
    }
    if (desig.id === 'department_head_ecp') {
      const grade = params.grade;
      if (['Kinder', 'Grade 1', 'Grade 2', 'Grade 3'].includes(grade)) {
        return `DEPARTMENT HEAD - ${grade}`;
      } else if (['Grade 11', 'Grade 12'].includes(grade)) {
        return `DEPARTMENT HEAD - ${grade} - ${params.track || 'ACADEMIC'}`;
      } else {
        return `DEPARTMENT HEAD - ${grade} - ${params.learningArea || 'English'}`;
      }
    }
    return desig.name;
  };

  // Check if a person is assigned to targetKey (matching with or without ::APPROVED_SDS suffix)
  const isAssignedToKey = (personDesignation, targetKey) => {
    if (!personDesignation || !targetKey) return false;
    const cleanPerson = String(personDesignation).replace('::APPROVED_SDS', '').trim().toUpperCase();
    const cleanTarget = String(targetKey).replace('::APPROVED_SDS', '').trim().toUpperCase();
    return cleanPerson === cleanTarget;
  };

  // Check constraint limits
  const checkConstraint = (desig, targetKey, activeAssigned) => {
    if (desig.id === 'department_head_ecp') {
      if (activeAssigned.length >= 1) {
        const subName = targetKey.replace('DEPARTMENT HEAD - ', '').replace('::APPROVED_SDS', '');
        return `Constraint Violation: Only 1 Department Head is allowed for ${subName} based on ECP rules. Unassign the current leader first.`;
      }
    }
    return null;
  };

  // Assign personnel to a serialized designation key (with optional SDS approval)
  const handleAddPersonnel = async (desig, selectedPersonId, isSdsApproved = false) => {
    if (!selectedPersonId) return;

    let targetKey = getSerializedKey(desig);
    if (isSdsApproved && !targetKey.endsWith('::APPROVED_SDS')) {
      targetKey = `${targetKey}::APPROVED_SDS`;
    }

    const assignedForSubKey = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));

    const violation = checkConstraint(desig, targetKey, assignedForSubKey);
    if (violation) {
      setConstraintErrors(prev => ({ ...prev, [desig.id]: violation }));
      return;
    }

    setConstraintErrors(prev => ({ ...prev, [desig.id]: null }));

    const person = activePersonnel.find(p => p.id === selectedPersonId);
    if (!person) return;

    const updatedPerson = { ...person, designation: targetKey };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(`✓ Assigned ${person.firstName} ${person.lastName} as ${targetKey}`, 'success');
  };

  // Toggle SDS Approval on an assigned person
  const handleToggleSdsApproval = async (personId, isApproved) => {
    const person = activePersonnel.find(p => p.id === personId);
    if (!person || !person.designation) return;

    let baseKey = person.designation.replace('::APPROVED_SDS', '').trim();
    const newDesignation = isApproved ? `${baseKey}::APPROVED_SDS` : baseKey;

    const updatedPerson = { ...person, designation: newDesignation };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(isApproved ? `✓ SDS Approval marked for ${person.firstName} ${person.lastName}` : `SDS Approval removed for ${person.firstName} ${person.lastName}`, 'info');
  };

  // Unassign personnel from designation
  const handleRemovePersonnel = async (personId, desigName) => {
    const person = activePersonnel.find(p => p.id === personId);
    if (!person) return;

    const updatedPerson = { ...person, designation: '' };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(`Unassigned ${person.firstName} ${person.lastName} from ${desigName}`, 'info');
  };

  const filteredDesignations = (OFFICIAL_DESIGNATIONS || []).filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section id="designations" className="view grid">
      <article className="card">
        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--navy)' }}>
                ⚜ School Designation Management
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Assign official school designations, SDS approval status, and manage ECP allocation limits.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Card vs Matrix View Toggle */}
              <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: '10px', overflow: 'hidden', background: '#F8FAFC' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: viewMode === 'card' ? '#0284C7' : 'transparent',
                    color: viewMode === 'card' ? 'white' : '#475569',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  ▦ Card View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('matrix')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: viewMode === 'matrix' ? '#0284C7' : 'transparent',
                    color: viewMode === 'matrix' ? 'white' : '#475569',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  ▤ Matrix View
                </button>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '240px' }}>
                <input
                  type="text"
                  placeholder="Search designation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--line)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px' }}>🔍</span>
              </div>
            </div>
          </div>

          {/* VIEW MODE 1: CARD VIEW */}
          {viewMode === 'card' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '18px' }}>
              {filteredDesignations.map((desig) => {
                const targetKey = getSerializedKey(desig);
                const params = getParams(desig.id);

                const assignedPersonnel = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));
                const availablePersonnel = activePersonnel.filter(p => !isAssignedToKey(p.designation, targetKey));

                const isDepartmentHead = desig.id === 'department_head_ecp';
                const isGrade4to10 = isDepartmentHead && ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].includes(params.grade);
                const isSHS = isDepartmentHead && ['Grade 11', 'Grade 12'].includes(params.grade);

                const constraintError = constraintErrors[desig.id];

                return (
                  <div
                    key={desig.id}
                    style={{
                      background: '#FFFFFF',
                      border: assignedPersonnel.length > 0 ? '1.5px solid #0284C7' : '1.5px solid var(--line)',
                      borderRadius: '14px',
                      padding: '20px',
                      boxShadow: assignedPersonnel.length > 0 ? '0 4px 14px rgba(2, 132, 199, 0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                          {desig.name}
                        </h3>
                        {assignedPersonnel.length > 0 ? (
                          <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#EFF6FF', color: '#0284C7', fontSize: '11px', fontWeight: '800', border: '1px solid #BAE6FD' }}>
                            {assignedPersonnel.length} Assigned
                          </span>
                        ) : (
                          <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#F8FAFC', color: '#94A3B8', fontSize: '11px', fontWeight: '700', border: '1px solid #E2E8F0' }}>
                            Vacant
                          </span>
                        )}
                      </div>

                      <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B', lineHeight: '1.5' }}>
                        {desig.description}
                      </p>

                      {/* Sub-categorization Dropdowns */}
                      {desig.parameterized && (
                        <div style={{ background: '#F0F9FF', border: '1.5px solid #BAE6FD', borderRadius: '12px', padding: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase' }}>
                            ⚙️ Sub-Categorization & Limits
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: isGrade4to10 || isSHS ? '1fr 1fr' : '1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#075985', marginBottom: '3px' }}>Grade Level</label>
                              <select
                                value={params.grade}
                                onChange={(e) => handleParamChange(desig.id, 'grade', e.target.value)}
                                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '13px', background: 'white', color: '#0F172A', fontWeight: '600' }}
                              >
                                {DESIGNATION_GRADE_LEVELS.map(g => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                            </div>

                            {isGrade4to10 && (
                              <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#075985', marginBottom: '3px' }}>Learning Area</label>
                                <select
                                  value={params.learningArea}
                                  onChange={(e) => handleParamChange(desig.id, 'learningArea', e.target.value)}
                                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '13px', background: 'white', color: '#0F172A', fontWeight: '600' }}
                                >
                                  {activeSubjects.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {isSHS && (
                              <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#075985', marginBottom: '3px' }}>Track</label>
                                <select
                                  value={params.track}
                                  onChange={(e) => handleParamChange(desig.id, 'track', e.target.value)}
                                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '13px', background: 'white', color: '#0F172A', fontWeight: '600' }}
                                >
                                  {SHS_TRACKS.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#0284C7', fontWeight: '700', borderTop: '1px dashed #7DD3FC', paddingTop: '8px' }}>
                            <span>Target: <code style={{ background: '#E0F2FE', padding: '2px 6px', borderRadius: '4px' }}>{targetKey}</code></span>
                            <span>{isDepartmentHead ? 'Max: 1 Person' : 'Unlimited'}</span>
                          </div>
                        </div>
                      )}

                      {/* Constraint Error Alert */}
                      {constraintError && (
                        <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', color: '#991B1B', fontSize: '12px', fontWeight: '700', marginBottom: '14px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>⚠️ {constraintError}</span>
                          <button type="button" onClick={() => setConstraintErrors(prev => ({ ...prev, [desig.id]: null }))} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer' }}>✕</button>
                        </div>
                      )}

                      {/* Assigned Personnel List */}
                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', marginBottom: '8px' }}>
                          ASSIGNED PERSONNEL ({assignedPersonnel.length})
                        </label>

                        {assignedPersonnel.length === 0 ? (
                          <div style={{ padding: '10px 12px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>
                            No personnel assigned to {targetKey} yet.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {assignedPersonnel.map(person => {
                              const isSdsApproved = (person.designation || '').includes('::APPROVED_SDS');

                              return (
                                <div key={person.id} style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0284C7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '12px' }}>
                                      {`${(person.firstName || '')[0] || ''}${(person.lastName || '')[0] || ''}`.toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)' }}>
                                        {person.firstName} {person.lastName}
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#64748B' }}>{person.position || 'Teacher'}</div>
                                    </div>
                                    <button type="button" onClick={() => handleRemovePersonnel(person.id, targetKey)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                                      Remove ✕
                                    </button>
                                  </div>

                                  {/* SDS Approval Toggle */}
                                  <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <SdsToggle
                                      checked={isSdsApproved}
                                      onChange={(val) => handleToggleSdsApproval(person.id, val)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                      <SearchableDropdown
                        options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                        value=""
                        onChange={(val) => {
                          const person = availablePersonnel.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                          if (person) handleAddPersonnel(desig, person.id);
                        }}
                        placeholder="Select school personnel to add..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: MATRIX VIEW */}
          {viewMode === 'matrix' && (
            <div style={{ overflowX: 'auto', border: '1.5px solid var(--line)', borderRadius: '14px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid var(--line)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)' }}>Designation Category / Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)', width: '320px' }}>Assigned Personnel & SDS Approval</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)' }}>Sub-Options (Grade / Subject / Track)</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)', minWidth: '220px' }}>Add Personnel</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDesignations.map((desig, idx) => {
                    const targetKey = getSerializedKey(desig);
                    const params = getParams(desig.id);

                    const assignedPersonnel = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));
                    const availablePersonnel = activePersonnel.filter(p => !isAssignedToKey(p.designation, targetKey));

                    const isDepartmentHead = desig.id === 'department_head_ecp';
                    const isGrade4to10 = isDepartmentHead && ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].includes(params.grade);
                    const isSHS = isDepartmentHead && ['Grade 11', 'Grade 12'].includes(params.grade);

                    return (
                      <tr key={desig.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '800', color: 'var(--navy)', fontSize: '13px' }}>{desig.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{desig.description}</div>
                          <code style={{ display: 'inline-block', background: '#E0F2FE', padding: '2px 6px', borderRadius: '4px', color: '#0369A1', fontSize: '10px', marginTop: '6px' }}>
                            {targetKey}
                          </code>
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {assignedPersonnel.length === 0 ? (
                            <span style={{ padding: '3px 8px', borderRadius: '999px', background: '#FFFBEB', color: '#B45309', fontSize: '11px', fontWeight: '700', border: '1px solid #FDE68A' }}>
                              ⚪ Vacant
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {assignedPersonnel.map(person => {
                                const isSdsApproved = (person.designation || '').includes('::APPROVED_SDS');

                                return (
                                  <div key={person.id} style={{ background: '#EFF6FF', border: '1px solid #BAE6FD', padding: '8px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: '800', color: '#0369A1', fontSize: '12px' }}>
                                        👤 {person.firstName} {person.lastName}
                                      </span>
                                      <button type="button" onClick={() => handleRemovePersonnel(person.id, targetKey)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>
                                        ✕
                                      </button>
                                    </div>
                                    <div style={{ marginTop: '6px' }}>
                                      <SdsToggle
                                        checked={isSdsApproved}
                                        onChange={(val) => handleToggleSdsApproval(person.id, val)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {desig.parameterized ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div>
                                <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', display: 'block' }}>Grade Level</label>
                                <select value={params.grade} onChange={(e) => handleParamChange(desig.id, 'grade', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #7DD3FC', fontSize: '12px' }}>
                                  {DESIGNATION_GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                              {isGrade4to10 && (
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', display: 'block' }}>Learning Area</label>
                                  <select value={params.learningArea} onChange={(e) => handleParamChange(desig.id, 'learningArea', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #7DD3FC', fontSize: '12px' }}>
                                    {activeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              )}
                              {isSHS && (
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', display: 'block' }}>Track</label>
                                  <select value={params.track} onChange={(e) => handleParamChange(desig.id, 'track', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #7DD3FC', fontSize: '12px' }}>
                                    {SHS_TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94A3B8' }}>N/A (Standard Role)</span>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <SearchableDropdown
                            options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                            value=""
                            onChange={(val) => {
                              const p = availablePersonnel.find(person => `${person.firstName} ${person.lastName} (${person.position || 'Teacher'})` === val);
                              if (p) handleAddPersonnel(desig, p.id);
                            }}
                            placeholder="+ Add personnel..."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </article>

      {/* STICKY BOTTOM JOURNEY ACTION BAR */}
      <div className="sticky-journey-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            background: 'rgba(59, 130, 246, 0.25)',
            color: '#60A5FA',
            border: '1px solid rgba(96, 165, 250, 0.4)',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: '900'
          }}>
            NODE 04 OF 09
          </span>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#F8FAFC' }}>
              School Designation Management
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Assign official school designations & SDS approval status, then proceed to Node 05 (Organized Classes).
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => setActiveView('nodemap')}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#E2E8F0',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            🗺️ Node Map
          </button>

          <button
            type="button"
            onClick={() => completeNode('designation', 'classes')}
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Save & Continue to Organized Classes ➔
          </button>
        </div>
      </div>
    </section>
  );
}
