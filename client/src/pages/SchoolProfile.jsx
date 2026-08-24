import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getLocalDraft, setLocalDraft } from '../services/db';
import { api } from '../services/api';
import PortalHeader from '../components/PortalHeader';


const OFFERING_METADATA = {
  'Elementary': { title: 'Elementary', subtitle: 'Kinder to Grade 6', icon: '🏫', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  'JHS': { title: 'Junior High School', subtitle: 'Grade 7 to Grade 10', icon: '📖', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'SHS': { title: 'Senior High School', subtitle: 'Grade 11 to Grade 12', icon: '🎓', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' }
};

const JHS_PROGRAM_OPTIONS = [
  { code: 'SPA', label: 'SPECIAL PROGRAM IN THE ARTS (SPA)', icon: '🎨' },
  { code: 'SPFL', label: 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)', icon: '🌐' },
  { code: 'SPJ', label: 'SPECIAL PROGRAM IN JOURNALISM (SPJ)', icon: '📰' },
  { code: 'SPS', label: 'SPECIAL PROGRAM IN SPORTS (SPS)', icon: '🏆' },
  { code: 'STE', label: 'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM', icon: '🔬' },
  { code: 'SPTVE', label: 'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)', icon: '⚙️' },
  { code: 'SCIENCE', label: 'SPECIAL PROGRAM IN SCIENCE', icon: '🧪' }
];

export default function SchoolProfile() {
  const { schoolInfo, setSchoolInfo, showAlert, showConfirm, completeNode, setActiveView } = useApp();
  const currentOfferings = Array.isArray(schoolInfo.curricularOffering) ? schoolInfo.curricularOffering : [];

  const isElemActive = currentOfferings.includes('Elementary');
  const isJHSActive = currentOfferings.includes('JHS');
  const isSHSActive = currentOfferings.includes('SHS');

  // Form State separated by level
  const [hasElemSpecialPrograms, setHasElemSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [elemSpecialProgram, setElemSpecialProgram] = useState(false);

  const [hasJhsSpecialPrograms, setHasJhsSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [jhsSpecialPrograms, setJhsSpecialPrograms] = useState([]);

  const [shsCurriculumModel, setShsCurriculumModel] = useState('Standard K-12 SHS Curriculum');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Load configuration on mount or when schoolInfo updates
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const draftKey = `insighted_school_curricular_config_${schoolInfo.schoolId || 'default'}`;
        const localDraft = await getLocalDraft(draftKey);
        const storedStr = localStorage.getItem(draftKey);
        const config = localDraft || (storedStr ? JSON.parse(storedStr) : null);

        if (config) {
          setHasElemSpecialPrograms(config.hasElemSpecialPrograms ? 'yes' : 'no');
          setElemSpecialProgram(!!config.elemSpecialProgram);

          setHasJhsSpecialPrograms(config.hasJhsSpecialPrograms ? 'yes' : 'no');
          setJhsSpecialPrograms(Array.isArray(config.jhsSpecialPrograms) ? config.jhsSpecialPrograms : []);

          if (config.shsCurriculumModel) {
            setShsCurriculumModel(config.shsCurriculumModel);
          }
        } else if (schoolInfo.specialPrograms || schoolInfo.shsCurriculumModel) {
          const progs = Array.isArray(schoolInfo.specialPrograms) ? schoolInfo.specialPrograms : [];
          const hasElem = progs.includes('SPECIAL SCIENCE ELEMENTARY SCHOOL');
          const jhsProgs = progs.filter(p => p !== 'SPECIAL SCIENCE ELEMENTARY SCHOOL');

          setHasElemSpecialPrograms(hasElem ? 'yes' : 'no');
          setElemSpecialProgram(hasElem);

          setHasJhsSpecialPrograms(jhsProgs.length > 0 ? 'yes' : 'no');
          setJhsSpecialPrograms(jhsProgs);

          if (schoolInfo.shsCurriculumModel) {
            setShsCurriculumModel(schoolInfo.shsCurriculumModel);
          }
        }
      } catch (err) {
        console.error('Error loading school profile configuration:', err);
      }
    };
    loadConfig();
  }, [schoolInfo.schoolId]);

  const handleToggleJhsProgram = (programLabel) => {
    setJhsSpecialPrograms(prev => 
      prev.includes(programLabel) 
        ? prev.filter(p => p !== programLabel) 
        : [...prev, programLabel]
    );
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const selectedPrograms = [];
      if (isElemActive && hasElemSpecialPrograms === 'yes' && elemSpecialProgram) {
        selectedPrograms.push('SPECIAL SCIENCE ELEMENTARY SCHOOL');
      }
      if (isJHSActive && hasJhsSpecialPrograms === 'yes') {
        selectedPrograms.push(...jhsSpecialPrograms);
      }

      const configData = {
        hasElemSpecialPrograms: hasElemSpecialPrograms === 'yes',
        elemSpecialProgram: hasElemSpecialPrograms === 'yes' && elemSpecialProgram,
        hasJhsSpecialPrograms: hasJhsSpecialPrograms === 'yes',
        jhsSpecialPrograms: hasJhsSpecialPrograms === 'yes' ? jhsSpecialPrograms : [],
        specialPrograms: selectedPrograms,
        shsCurriculumModel: isSHSActive ? shsCurriculumModel : null,
        schoolYear: schoolInfo.schoolYear || 'SY 26-27'
      };

      const draftKey = `insighted_school_curricular_config_${schoolInfo.schoolId || 'default'}`;
      
      // 1. Save to Local Storage & IndexedDB Draft (Local Database First)
      localStorage.setItem(draftKey, JSON.stringify(configData));
      await setLocalDraft(draftKey, configData);

      // 2. Update Global App Context
      if (setSchoolInfo) {
        setSchoolInfo(prev => ({
          ...prev,
          specialPrograms: selectedPrograms,
          shsCurriculumModel: configData.shsCurriculumModel
        }));
      }

      // 3. Attempt Backend Server Database Sync
      try {
        await api.updateCurricularConfig(configData);
      } catch (backendErr) {
        console.warn('Backend database sync deferred (saved locally):', backendErr.message);
      }

      setSaveStatus('✅ Saved to Local DB!');
      if (showConfirm) {
        showConfirm('Configuration Saved!', 'Your Special Curricular Programs & Curriculum Model have been saved to your local database.');
      } else if (showAlert) {
        showAlert('Your Special Curricular Programs & Curriculum Model have been saved to your local database.');
      }
    } catch (err) {
      console.error('Failed to save configuration:', err);
      setSaveStatus('❌ Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="school" className="view grid" style={{ padding: '20px', maxWidth: '1240px', margin: '0 auto' }}>
      <PortalHeader
        title="School Profile & Registry"
        description="Official administrative details, curricular offerings, and special programs setup."
        onBack={() => setActiveView('dashboard')}
      />
      <article className="card" style={{ border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05)' }}>

        
        {/* Sleek Header Banner */}
        <div style={{
          background: 'radial-gradient(circle at top right, #1e293b 0%, #0f172a 100%)',
          padding: '24px 32px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '24px' }}>🏫</span>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900', letterSpacing: '-0.025em', color: '#f8fafc' }}>
                School Profile & Registry
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', maxWidth: '640px', lineHeight: '1.4' }}>
              Official administrative details from **Unit 1 Schools Identity Registry**. Synced with your local database for offline-first readiness.
            </p>
          </div>

          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            padding: '6px 14px',
            borderRadius: '30px',
            fontSize: '11px',
            fontWeight: '800',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 1
          }}>
            <span>🛡️</span> Official Registry Match
          </div>
        </div>

        <div style={{ padding: '24px 32px', background: '#ffffff' }}>
          
          {/* Identity Grid Section */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', color: '#3b82f6' }}>📌</span>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Basic School Information
              </h3>
            </div>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>School ID</label>
                <span style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' }}>{schoolInfo.schoolId || '999163'}</span>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>School Name</label>
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{schoolInfo.schoolName || 'Test School'}</span>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>Region</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{schoolInfo.region || 'Region IV-A'}</span>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>Division</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{schoolInfo.division || 'Sample Division'}</span>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>District</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{schoolInfo.district || 'Sample District'}</span>
              </div>

              <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#1d4ed8', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>School Year</label>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e40af' }}>{schoolInfo.schoolYear || '2026-2027'}</span>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>Shifts</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{schoolInfo.numberOfShifts || '1'} Shift</span>
              </div>
            </div>
          </div>

          {/* Curricular Offerings Section */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '24px', marginBottom: '28px' }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '15px', color: '#10b981' }}>🎯</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                  Curricular Offerings Portfolio
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Active programs automatically unlock grade levels and subjects in your Workload builder.
              </p>
            </div>

            {/* Visual Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {Object.entries(OFFERING_METADATA).map(([key, meta]) => {
                const isActive = currentOfferings.includes(key);
                return (
                  <div
                    key={key}
                    style={{
                      padding: '14px 18px',
                      borderRadius: '12px',
                      background: isActive ? meta.bg : '#ffffff',
                      border: isActive ? `1.5px solid ${meta.border}` : '1px solid #e2e8f0',
                      opacity: isActive ? 1 : 0.55,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <div style={{ fontSize: '22px' }}>{meta.icon}</div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: isActive ? '#0f172a' : '#64748b' }}>{meta.title}</h4>
                        {isActive && (
                          <span style={{ fontSize: '9px', background: meta.color, color: 'white', padding: '1px 6px', borderRadius: '12px', fontWeight: '800' }}>Active</span>
                        )}
                      </div>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: isActive ? '#475569' : '#94a3b8' }}>{meta.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NEW SECTION: Special Curricular Programs & SHS Curriculum Configuration (Compact Layout) */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '18px' }}>⭐</span>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '900', color: '#0f172a' }}>
                    Special Curricular Programs & SHS Curriculum Model
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Select special offer programs for Elementary & JHS, and Senior High School curriculum models.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {saveStatus && (
                  <span style={{ fontSize: '11px', fontWeight: '800', color: saveStatus.includes('✅') ? '#059669' : '#dc2626', background: saveStatus.includes('✅') ? '#ecfdf5' : '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${saveStatus.includes('✅') ? '#a7f3d0' : '#fecaca'}` }}>
                    {saveStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    fontWeight: '800',
                    fontSize: '12px',
                    cursor: isSaving ? 'wait' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>💾</span> {isSaving ? 'Saving...' : 'Save Config'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Question 1: Elementary Special Curricular Programs (Compact) */}
              {isElemActive ? (
                <div style={{ padding: '16px 20px', borderRadius: '14px', background: '#ecfdf5', border: '1.5px solid #a7f3d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasElemSpecialPrograms === 'yes' ? '12px' : '0' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: '900', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>
                        🏫 Elementary Offering Active
                      </span>
                      <label style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        1. Does your Elementary School offer Special Curricular Programs?
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setHasElemSpecialPrograms('yes');
                          setElemSpecialProgram(true);
                        }}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '8px',
                          border: hasElemSpecialPrograms === 'yes' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                          background: hasElemSpecialPrograms === 'yes' ? '#10b981' : '#ffffff',
                          color: hasElemSpecialPrograms === 'yes' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasElemSpecialPrograms('no');
                          setElemSpecialProgram(false);
                        }}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '8px',
                          border: hasElemSpecialPrograms === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                          background: hasElemSpecialPrograms === 'no' ? '#64748b' : '#ffffff',
                          color: hasElemSpecialPrograms === 'no' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        NO
                      </button>
                    </div>
                  </div>

                  {hasElemSpecialPrograms === 'yes' && (
                    <div style={{ borderTop: '1px dashed #6ee7b7', paddingTop: '10px' }}>
                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1.5px solid #10b981',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: '800',
                        fontSize: '12px',
                        color: '#047857'
                      }}>
                        <input
                          type="checkbox"
                          checked={elemSpecialProgram}
                          onChange={(e) => setElemSpecialProgram(e.target.checked)}
                          style={{ width: '15px', height: '15px', accentColor: '#10b981' }}
                        />
                        <span>🧪</span> SPECIAL SCIENCE ELEMENTARY SCHOOL
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>
                  ℹ️ Elementary Special Programs section is hidden because Elementary offering is inactive.
                </div>
              )}

              {/* Question 2: Junior High School (JHS) Special Curricular Programs (Compact) */}
              {isJHSActive ? (
                <div style={{ padding: '16px 20px', borderRadius: '14px', background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasJhsSpecialPrograms === 'yes' ? '14px' : '0' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: '900', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>
                        📖 Junior High School (JHS) Offering Active
                      </span>
                      <label style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        2. Does your Junior High School offer Special Curricular Programs?
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setHasJhsSpecialPrograms('yes')}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '8px',
                          border: hasJhsSpecialPrograms === 'yes' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: hasJhsSpecialPrograms === 'yes' ? '#2563eb' : '#ffffff',
                          color: hasJhsSpecialPrograms === 'yes' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasJhsSpecialPrograms('no');
                          setJhsSpecialPrograms([]);
                        }}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '8px',
                          border: hasJhsSpecialPrograms === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                          background: hasJhsSpecialPrograms === 'no' ? '#64748b' : '#ffffff',
                          color: hasJhsSpecialPrograms === 'no' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        NO
                      </button>
                    </div>
                  </div>

                  {hasJhsSpecialPrograms === 'yes' && (
                    <div style={{ borderTop: '1px dashed #93c5fd', paddingTop: '14px' }}>
                      <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#1e40af', fontWeight: '800' }}>
                        Select all JHS Special Programs implemented in your school:
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                        {JHS_PROGRAM_OPTIONS.map((item) => {
                          const isChecked = jhsSpecialPrograms.includes(item.label);
                          return (
                            <label
                              key={item.code}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: isChecked ? '1.5px solid #2563eb' : '1px solid #dbeafe',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '11px',
                                color: isChecked ? '#1e40af' : '#334155',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleJhsProgram(item.label)}
                                style={{ width: '15px', height: '15px', accentColor: '#2563eb' }}
                              />
                              <span style={{ fontSize: '14px' }}>{item.icon}</span>
                              <span style={{ flex: 1, lineHeight: '1.3' }}>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>
                  ℹ️ JHS Special Programs section is hidden because Junior High School offering is inactive.
                </div>
              )}

              {/* Question 3: Senior High School (SHS) Curriculum Model (Compact) */}
              {isSHSActive ? (
                <div style={{ padding: '16px 20px', borderRadius: '14px', background: '#f5f3ff', border: '1.5px solid #ddd6fe' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '900', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>
                      🎓 Senior High School (SHS) Offering Active
                    </span>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                      3. Which Senior High School Curriculum model does your school offer for Grade 12?
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: shsCurriculumModel === 'Standard K-12 SHS Curriculum' ? '2px solid #8b5cf6' : '1px solid #cbd5e1',
                      background: shsCurriculumModel === 'Standard K-12 SHS Curriculum' ? '#ffffff' : '#f8fafc',
                      fontWeight: '800',
                      fontSize: '12px',
                      color: shsCurriculumModel === 'Standard K-12 SHS Curriculum' ? '#5b21b6' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}>
                      <input
                        type="radio"
                        name="shsCurriculumModel"
                        value="Standard K-12 SHS Curriculum"
                        checked={shsCurriculumModel === 'Standard K-12 SHS Curriculum'}
                        onChange={(e) => setShsCurriculumModel(e.target.value)}
                        style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                      />
                      <span>📜</span> Standard K-12 SHS Curriculum
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)' ? '2px solid #8b5cf6' : '1.5px solid #cbd5e1',
                      background: shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)' ? '#ffffff' : '#f8fafc',
                      fontWeight: '800',
                      fontSize: '12px',
                      color: shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)' ? '#5b21b6' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}>
                      <input
                        type="radio"
                        name="shsCurriculumModel"
                        value="Strengthened Senior High School Curriculum (Grade 12)"
                        checked={shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)'}
                        onChange={(e) => setShsCurriculumModel(e.target.value)}
                        style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                      />
                      <span>🚀</span> Strengthened SHS Curriculum (Grade 12)
                    </label>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>
                  ℹ️ Senior High School (Grade 12) Curriculum Model section is hidden because Senior High School offering is inactive.
                </div>
              )}

            </div>
          </div>

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
            NODE 01 OF 09
          </span>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#F8FAFC' }}>
              School Profile Configuration
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Save school identity settings and proceed to Node 02 (Personnel Roster).
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
            onClick={() => completeNode('school', 'roster')}
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
            Save & Continue to Roster ➔
          </button>
        </div>
      </div>
    </section>
  );
}
