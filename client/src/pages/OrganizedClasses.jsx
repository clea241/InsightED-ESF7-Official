import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function OrganizedClasses() {
  const { classSections, addClassSection, updateSectionAdviser, removeClassSection, personnel, schoolInfo, showAlert, showConfirm } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMultigrade, setIsMultigrade] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'list'

  // Form state
  const [newSection, setNewSection] = useState({
    gradeLevel: '',
    sectionName: '',
    advisorId: '',
    advisoryMinutes: 300,
    hgpMinutes: 60
  });

  const offerings = (schoolInfo?.curricularOffering || []).map(o => o.toUpperCase());
  const showElem = offerings.includes('ELEMENTARY');
  const showJHS = offerings.includes('JHS');
  const showSHS = offerings.includes('SHS');

  const availableGrades = [];
  if (showElem) {
    availableGrades.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED');
  }
  if (showJHS) {
    availableGrades.push('Grade 7', 'Grade 8', 'Grade 9', 'Grade 10');
  }
  if (showSHS) {
    availableGrades.push('Grade 11', 'Grade 12');
  }
  if (availableGrades.length === 0) {
    availableGrades.push('Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12');
  }

  React.useEffect(() => {
    if (isModalOpen) {
      setIsMultigrade(false);
      setSelectedGrades([]);
      if (availableGrades.length > 0) {
        setNewSection({
          gradeLevel: availableGrades[0],
          sectionName: '',
          advisorId: '',
          advisoryMinutes: 300,
          hgpMinutes: 60
        });
      }
    }
  }, [isModalOpen]);

  const teachingPersonnel = personnel.filter(p => p.type === 'teaching');

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newSection.sectionName.trim()) {
      await showAlert('Validation Error', 'Please fill out Section Name.');
      return;
    }
    if (!newSection.advisorId) {
      await showAlert('Advisory Teacher Required', 'Please select an Advisory Teacher for the section.');
      return;
    }

    const isDuplicate = classSections.some(s => 
      s.gradeLevel === newSection.gradeLevel && 
      s.sectionName.toUpperCase().trim() === newSection.sectionName.toUpperCase().trim()
    );

    if (isDuplicate) {
      await showAlert('Duplicate Section', `A section named "${newSection.sectionName.toUpperCase().trim()}" already exists for ${newSection.gradeLevel}.`);
      return;
    }

    let finalGradeLevel = newSection.gradeLevel;
    let finalSectionType = 'MONO GRADE';

    if (isMultigrade) {
      if (selectedGrades.length < 2 || selectedGrades.length > 6) {
        await showAlert('Validation Error', 'Please select between 2 and 6 grade levels for a multigrade section.');
        return;
      }

      // Check if any of the selected grade levels are already in an existing multigrade section
      const alreadyTakenGrades = [];
      classSections.forEach(sec => {
        if (sec.sectionType === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ')) {
          const parts = String(sec.gradeLevel || '').split(' - ').map(s => s.trim());
          parts.forEach(g => {
            if (!alreadyTakenGrades.includes(g)) {
              alreadyTakenGrades.push(g);
            }
          });
        }
      });

      const conflictingGrades = selectedGrades.filter(g => alreadyTakenGrades.includes(g));
      if (conflictingGrades.length > 0) {
        await showAlert(
          'Multigrade Conflict', 
          `The following grade levels are already assigned to an existing multigrade combination: ${conflictingGrades.join(', ')}. They cannot be selected in another multigrade combination.`
        );
        return;
      }

      // Sort in order of availableGrades list
      const sortedGrades = [...selectedGrades].sort((a, b) => {
        return availableGrades.indexOf(a) - availableGrades.indexOf(b);
      });
      finalGradeLevel = sortedGrades.join(' - ');
      finalSectionType = 'MULTIGRADE';
    } else if (newSection.gradeLevel === 'NON-GRADED') {
      finalSectionType = 'NON GRADED';
    }

    addClassSection(
      finalGradeLevel,
      newSection.sectionName.toUpperCase().trim(),
      newSection.advisorId,
      finalSectionType,
      Number(newSection.advisoryMinutes || 300),
      Number(newSection.hgpMinutes || 60)
    );
    
    // Reset and close
    setNewSection({ gradeLevel: availableGrades[0] || 'Grade 7', sectionName: '', advisorId: '', advisoryMinutes: 300, hgpMinutes: 60 });
    setIsMultigrade(false);
    setSelectedGrades([]);
    setIsModalOpen(false);
  };

  const alreadyTakenGrades = [];
  classSections.forEach(sec => {
    if (sec.sectionType === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ')) {
      const parts = String(sec.gradeLevel || '').split(' - ').map(s => s.trim());
      parts.forEach(g => {
        if (!alreadyTakenGrades.includes(g)) {
          alreadyTakenGrades.push(g);
        }
      });
    }
  });

  const filteredSections = classSections.filter(sec => {
    const advisor = personnel.find(p => p.id === sec.advisorId);
    const advisorName = advisor ? `${advisor.firstName} ${advisor.lastName}` : '';
    const hay = `${sec.gradeLevel} ${sec.sectionName} ${advisorName}`.toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });

  return (
    <section id="classes" className="view grid">
      <article className="card">
        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <h2>Organized Classes Setup</h2>
              <p className="subtext">Configure curriculum-level sections and assign class advisers for the current school year.</p>
            </div>
            <button 
              className="btn" 
              onClick={() => setIsModalOpen(true)}
              style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white' }}
            >
              + Add Section
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', margin: '20px 0', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Search by grade, section or adviser..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1 }}
            />
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                style={{
                  padding: '8px 12px',
                  background: viewMode === 'cards' ? '#f1f5f9' : 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: viewMode === 'cards' ? 'bold' : 'normal',
                  color: viewMode === 'cards' ? 'var(--blue)' : 'var(--muted)',
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
                onClick={() => setViewMode('list')}
                style={{
                  padding: '8px 12px',
                  background: viewMode === 'list' ? '#f1f5f9' : 'white',
                  border: 'none',
                  borderLeft: '1.5px solid var(--line)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: viewMode === 'list' ? 'bold' : 'normal',
                  color: viewMode === 'list' ? 'var(--blue)' : 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Table/List View"
              >
                <span>☰</span> List
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <div style={{ overflowX: 'auto', border: '1.5px solid var(--line)', borderRadius: '16px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Grade Level</th>
                    <th>Section Name</th>
                    <th>Class Adviser</th>
                    <th>Position</th>
                    <th style={{ width: '80px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSections.map((sec) => {
                    const advisor = personnel.find(p => p.id === sec.advisorId);
                    return (
                      <tr key={sec.id}>
                        <td>{sec.gradeLevel}</td>
                        <td>{sec.sectionName}</td>
                        <td>
                          <select
                            value={sec.advisorId || ''}
                            onChange={(e) => updateSectionAdviser(sec.id, e.target.value)}
                            style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'white' }}
                          >
                            <option value="">-- Select Adviser --</option>
                            {teachingPersonnel.map(p => (
                              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                            ))}
                          </select>
                        </td>
                        <td>{advisor ? advisor.position : '—'}</td>
                        <td>
                          <button
                            className="btn danger"
                            style={{ minHeight: '28px', padding: '4px 8px', fontSize: '11px' }}
                            onClick={async () => {
                              const confirmed = await showConfirm(
                                'Remove Section',
                                `Remove section ${sec.gradeLevel} - ${sec.sectionName}?`
                              );
                              if (confirmed) {
                                removeClassSection(sec.id);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSections.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '15px' }}>No sections found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: '20px',
                marginTop: '20px'
              }}>
                {filteredSections.map((sec) => {
                  const advisor = personnel.find(p => p.id === sec.advisorId);
                  
                  // Get grade level badge color style
                  let badgeBg = '#f0f9ff';
                  let badgeColor = '#0369a1';
                  if (String(sec.gradeLevel).toLowerCase().includes('kinder')) {
                    badgeBg = '#fdf2f8';
                    badgeColor = '#be185d';
                  } else if (String(sec.gradeLevel).toLowerCase().includes('grade 11') || String(sec.gradeLevel).toLowerCase().includes('grade 12')) {
                    badgeBg = '#faf5ff';
                    badgeColor = '#6b21a8';
                  }
                  
                  return (
                    <div key={sec.id} style={{
                      background: 'white',
                      borderRadius: '16px',
                      border: '1.5px solid var(--line)',
                      padding: '20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s ease-in-out'
                    }}>
                      {/* Remove Button */}
                      <button
                        onClick={async () => {
                          const confirmed = await showConfirm(
                            'Remove Section',
                            `Remove section ${sec.gradeLevel} - ${sec.sectionName}?`
                          );
                          if (confirmed) {
                            removeClassSection(sec.id);
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#ef4444',
                          opacity: 0.6,
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = 1}
                        onMouseLeave={(e) => e.target.style.opacity = 0.6}
                        title="Remove Section"
                      >
                        ✕
                      </button>

                      {/* Badges / Header Info */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                          background: badgeBg,
                          color: badgeColor,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          letterSpacing: '0.02em'
                        }}>
                          {sec.gradeLevel}
                        </span>
                        {sec.sectionType && (
                          <span style={{
                            background: sec.sectionType === 'MULTIGRADE' ? '#fffbeb' : '#f0fdf4',
                            color: sec.sectionType === 'MULTIGRADE' ? '#b45309' : '#15803d',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase'
                          }}>
                            {sec.sectionType}
                          </span>
                        )}
                      </div>

                      {/* Section Title */}
                      <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                        {sec.sectionName}
                      </h3>

                      {/* Divider */}
                      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '8px 0' }} />

                      {/* Adviser Profile info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 'auto' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--blue), var(--navy))',
                          color: 'white',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {advisor ? `${advisor.firstName.charAt(0)}${advisor.lastName.charAt(0)}` : '—'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '2px' }}>
                            Class Adviser
                          </div>
                          <select
                            value={sec.advisorId || ''}
                            onChange={(e) => updateSectionAdviser(sec.id, e.target.value)}
                            style={{ width: '100%', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'white', fontWeight: '600', color: 'var(--navy)' }}
                          >
                            <option value="">-- Select Adviser --</option>
                            {teachingPersonnel.map(p => (
                              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                            ))}
                          </select>
                          {advisor && (
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                              {advisor.position}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredSections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', border: '1.5px dashed var(--line)', borderRadius: '16px', color: 'var(--muted)', marginTop: '20px' }}>
                  No sections found matching your search.
                </div>
              )}
            </>
          )}
        </div>
      </article>

      {/* Add Section Modal Popup */}
      {isModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '560px', padding: '32px 24px', background: 'white', borderRadius: '24px', border: '2.5px solid var(--outline)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'scaleUp 0.2s forwards' }}>
            <div className="modal-head" style={{ border: 0, padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', margin: 0, color: 'var(--navy)', fontWeight: 800 }}>Add Section</h2>
                <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Register a grade-level section and assign a teaching personnel as adviser.</p>
              </div>
              <button className="btn secondary" onClick={() => setIsModalOpen(false)} style={{ borderRadius: '50%', width: '36px', height: '36px', minWidth: '36px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}>&times;</button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ display: 'grid', gap: '20px' }}>
              <div style={{ display: 'grid', gap: '15px', borderBottom: '1.5px solid var(--line)', paddingBottom: '20px' }}>
                <div className="full">
                  <label className="checkline" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, color: 'var(--navy)', fontWeight: 'bold' }}>
                    <input
                      type="checkbox"
                      checked={isMultigrade}
                      onChange={(e) => {
                        setIsMultigrade(e.target.checked);
                        setSelectedGrades([]);
                      }}
                      style={{ width: 'auto', minHeight: 'auto', cursor: 'pointer' }}
                    />
                    THIS IS A MULTIGRADE SECTION
                  </label>
                </div>
                {isMultigrade ? (
                  <div className="full" style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 'bold' }}>SELECT GRADE LEVELS (2 TO 6 COMBINATIONS)</label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: 'var(--blue-50, #F0F9FF)', padding: '12px', borderRadius: '12px', border: '1.5px solid var(--line, #BAE6FD)', marginTop: '8px' }}>
                      {availableGrades.filter(g => g !== 'Kinder' && g !== 'NON-GRADED').map((g) => {
                        const isChecked = selectedGrades.includes(g);
                        const isDisabled = alreadyTakenGrades.includes(g);
                        return (
                          <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: isDisabled ? 'not-allowed' : 'pointer', margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '13px', fontWeight: 'bold', color: isDisabled ? '#94a3b8' : 'var(--navy)', opacity: isDisabled ? 0.6 : 1 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              style={{ width: 'auto', minHeight: 'auto', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedGrades(selectedGrades.filter(x => x !== g));
                                } else {
                                  if (selectedGrades.length >= 6) {
                                    alert('You can select a maximum of 6 grade levels.');
                                    return;
                                  }
                                  setSelectedGrades([...selectedGrades, g]);
                                }
                              }}
                            />
                            {g}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label>Grade Level</label>
                    <select
                      value={newSection.gradeLevel}
                      onChange={(e) => setNewSection({ ...newSection, gradeLevel: e.target.value })}
                    >
                      {availableGrades.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label>Section Name</label>
                  <input
                    placeholder="SECTION NAME"
                    value={newSection.sectionName}
                    onChange={(e) => setNewSection({ ...newSection, sectionName: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="full">
                  <label>Section Adviser</label>
                  <select
                    value={newSection.advisorId}
                    onChange={(e) => setNewSection({ ...newSection, advisorId: e.target.value })}
                  >
                    <option value="">No advisor assigned yet</option>
                    {teachingPersonnel.map((p) => {
                      const assignedSecs = classSections.filter(s => s.advisorId && String(s.advisorId) === String(p.id));
                      const secInfo = assignedSecs.length > 0
                        ? ` — (${assignedSecs.map(s => `${s.gradeLevel} ${s.sectionName}`).join(', ')})`
                        : '';
                      return (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} · {p.position}{secInfo}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button className="btn" type="submit">Add Section</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
