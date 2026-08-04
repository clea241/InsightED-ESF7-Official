import React, { useState } from 'react';
import {
  useApp,
  OFFICIAL_DESIGNATIONS,
  DESIGNATION_GRADE_LEVELS,
  SHS_TRACKS,
  SUBJECT_OPTIONS
} from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';

export default function Designations() {
  const { personnel, setPersonnel, savePersonnelChanges, showToast } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  // Local state for parameterized choices per card
  // Structure: { [designationId]: { grade: 'Grade 1', learningArea: 'English', track: 'ACADEMIC' } }
  const [cardParams, setCardParams] = useState({
    grade_level_chairperson: { grade: 'Grade 1' },
    learning_area_chairperson: { grade: 'Grade 1' },
    department_head_ecp: { grade: 'Grade 1', learningArea: 'English', track: 'ACADEMIC' }
  });

  // State to track constraint violation alerts per card
  const [constraintErrors, setConstraintErrors] = useState({});

  // Active (non-draft) personnel list
  const activePersonnel = (Array.isArray(personnel) ? personnel : []).filter(p => !p.isDraft);

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
    // Clear error on parameter change
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

  // Helper to check assignment limit constraints
  const checkConstraint = (desig, targetKey, activeAssigned) => {
    if (desig.id === 'department_head_ecp') {
      if (activeAssigned.length >= 1) {
        const subName = targetKey.replace('DEPARTMENT HEAD - ', '');
        return `Constraint Violation: Only 1 Department Head is allowed for ${subName} based on ECP rules. Unassign the current leader first.`;
      }
    }
    return null;
  };

  // Assign personnel to a serialized designation key
  const handleAddPersonnel = async (desig, selectedPersonId) => {
    if (!selectedPersonId) return;

    const targetKey = getSerializedKey(desig);
    const assignedForSubKey = activePersonnel.filter(
      p => (p.designation || '').trim().toUpperCase() === targetKey.trim().toUpperCase()
    );

    // Check constraint before saving
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
                🏅 School Designation Management
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Assign official school designations and ancillary roles to qualified personnel with multi-assignment and ECP allocation limits.
              </p>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                placeholder="Search designation or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--line)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px' }}>🔍</span>
            </div>
          </div>

          {/* Grid of 13 Designations */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '18px' }}>
            {filteredDesignations.map((desig) => {
              const targetKey = getSerializedKey(desig);
              const params = getParams(desig.id);

              // Find assigned personnel for this targetKey
              const assignedPersonnel = activePersonnel.filter(
                p => (p.designation || '').trim().toUpperCase() === targetKey.trim().toUpperCase()
              );

              // Available personnel to assign (not already assigned to targetKey)
              const availablePersonnel = activePersonnel.filter(
                p => (p.designation || '').trim().toUpperCase() !== targetKey.trim().toUpperCase()
              );

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
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    {/* Role Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                        {desig.name}
                      </h3>
                      {assignedPersonnel.length > 0 ? (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          background: '#EFF6FF',
                          color: '#0284C7',
                          fontSize: '11px',
                          fontWeight: '800',
                          border: '1px solid #BAE6FD'
                        }}>
                          {assignedPersonnel.length} Assigned
                        </span>
                      ) : (
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          background: '#F8FAFC',
                          color: '#94A3B8',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: '1px solid #E2E8F0'
                        }}>
                          Vacant
                        </span>
                      )}
                    </div>

                    <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B', lineHeight: '1.5' }}>
                      {desig.description}
                    </p>

                    {/* Sub-categorization Dropdowns for Parameterized Designations */}
                    {desig.parameterized && (
                      <div style={{
                        background: '#F0F9FF',
                        border: '1.5px solid #BAE6FD',
                        borderRadius: '12px',
                        padding: '12px',
                        marginBottom: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase' }}>
                          ⚙️ Sub-Categorization & Limits
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: isGrade4to10 || isSHS ? '1fr 1fr' : '1fr', gap: '8px' }}>
                          {/* Grade Level Selector */}
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#075985', marginBottom: '3px' }}>
                              Grade Level
                            </label>
                            <select
                              value={params.grade}
                              onChange={(e) => handleParamChange(desig.id, 'grade', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '8px',
                                border: '1px solid #7DD3FC',
                                fontSize: '13px',
                                background: 'white',
                                color: '#0F172A',
                                fontWeight: '600'
                              }}
                            >
                              {DESIGNATION_GRADE_LEVELS.map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </div>

                          {/* Learning Area Selector for KS 2 & 3 */}
                          {isGrade4to10 && (
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#075985', marginBottom: '3px' }}>
                                Learning Area
                              </label>
                              <select
                                value={params.learningArea}
                                onChange={(e) => handleParamChange(desig.id, 'learningArea', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '8px',
                                  borderRadius: '8px',
                                  border: '1px solid #7DD3FC',
                                  fontSize: '13px',
                                  background: 'white',
                                  color: '#0F172A',
                                  fontWeight: '600'
                                }}
                              >
                                {SUBJECT_OPTIONS.filter(s => s !== 'ADVISORY').map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Track Selector for SHS */}
                          {isSHS && (
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#075985', marginBottom: '3px' }}>
                                Track
                              </label>
                              <select
                                value={params.track}
                                onChange={(e) => handleParamChange(desig.id, 'track', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '8px',
                                  borderRadius: '8px',
                                  border: '1px solid #7DD3FC',
                                  fontSize: '13px',
                                  background: 'white',
                                  color: '#0F172A',
                                  fontWeight: '600'
                                }}
                              >
                                {SHS_TRACKS.map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Active Target Key Display & Limit Indicator */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#0284C7', fontWeight: '700', borderTop: '1px dashed #7DD3FC', paddingTop: '8px', marginTop: '2px' }}>
                          <span>Target: <code style={{ background: '#E0F2FE', padding: '2px 6px', borderRadius: '4px', color: '#0369A1' }}>{targetKey}</code></span>
                          <span>{isDepartmentHead ? 'Max: 1 Person' : 'Unlimited Personnel'}</span>
                        </div>
                      </div>
                    )}

                    {/* Constraint Error Alert */}
                    {constraintError && (
                      <div style={{
                        padding: '10px 12px',
                        background: '#FEF2F2',
                        border: '1.5px solid #FCA5A5',
                        borderRadius: '10px',
                        color: '#991B1B',
                        fontSize: '12px',
                        fontWeight: '700',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}>
                        <span>⚠️ {constraintError}</span>
                        <button
                          type="button"
                          onClick={() => setConstraintErrors(prev => ({ ...prev, [desig.id]: null }))}
                          style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Assigned Personnel List (Multi-Select Pill Badges) */}
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
                          {assignedPersonnel.map(person => (
                            <div
                              key={person.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: '#F8FAFC',
                                padding: '8px 12px',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0'
                              }}
                            >
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '800',
                                fontSize: '12px'
                              }}>
                                {`${(person.firstName || '')[0] || ''}${(person.lastName || '')[0] || ''}`.toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {person.firstName} {person.lastName}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748B' }}>
                                  {person.position || 'Teacher'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemovePersonnel(person.id, targetKey)}
                                style={{
                                  background: '#FEE2E2',
                                  color: '#EF4444',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                                title="Unassign this personnel"
                              >
                                Remove ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Personnel Dropdown */}
                  <div style={{ marginTop: 'auto' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
                      ADD PERSONNEL TO DESIGNATION
                    </label>
                    <SearchableDropdown
                      options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                      value=""
                      onChange={(val) => {
                        const person = availablePersonnel.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                        if (person) {
                          handleAddPersonnel(desig, person.id);
                        }
                      }}
                      placeholder="Select school personnel to add..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </article>
    </section>
  );
}
