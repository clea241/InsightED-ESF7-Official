import React from 'react';
import { useApp } from '../context/AppContext';
import PageTransition from '../components/PageTransition';

export default function Allowances() {
  const { personnel, showToast, allowancesMap, toggleAllowance, schoolInfo } = useApp();
  const currentSchoolYear = schoolInfo?.schoolYear || 'SY 26-27';

  // Configured Allowance Items (Boolean tracking per teacher)
  const allowanceConfig = [
    { key: 'pera', label: 'PERA (₱2,000 / mo)', desc: 'Personal Economic Relief Allowance' },
    { key: 'uniform', label: 'Uniform Allowance', desc: 'Clothing & Uniform Allowance' },
    { key: 'supplies', label: 'Teaching Supplies', desc: 'Cash Allowance for Teaching Supplies' },
    { key: 'medical', label: 'Medical Allowance', desc: 'Fixed Medical Allowance (₱7,000)' },
    { key: 'hardship', label: 'Special Hardship', desc: 'Special Hardship Allowance' }
  ];

  // Active personnel (exclude draft and shared personnel from main grid if applicable)
  const activePersonnelList = personnel.filter(p => !p.isDraft && !p.isShared);

  const handleCheckboxToggle = async (personId, name, conf) => {
    const personAllowances = allowancesMap[personId] || {};
    const currentlyGranted = Boolean(personAllowances[conf.key]);
    const nextGranted = !currentlyGranted;

    const res = await toggleAllowance(personId, conf.key, nextGranted, currentSchoolYear);
    if (res && res.success !== false) {
      if (nextGranted) {
        showToast(`Granted ${conf.label} for ${name}`);
      } else {
        showToast(`Removed ${conf.label} for ${name}`);
      }
    } else {
      showToast(`Failed to update ${conf.label} for ${name}`, 'error');
    }
  };

  return (
    <PageTransition>
      <div style={{ padding: '30px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        
        {/* Header Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: 'var(--navy, #0f172a)' }}>
              Allowances & Incentives Portal
            </h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
              Select allowances and manage financial incentives for registered school personnel ({currentSchoolYear}).
            </p>
          </div>
        </div>

        {/* Excel style Table Container */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          border: '1.5px solid var(--line, #e2e8f0)',
          overflow: 'hidden',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.00)'
        }}>
          
          <div style={{ display: 'flex', overflowX: 'auto', position: 'relative' }}>
            
            {/* LEFT SIDE: FROZEN TEACHER NAME COLUMN */}
            <div style={{
              flexShrink: 0,
              width: '280px',
              borderRight: '2px solid var(--line, #cbd5e1)',
              background: '#f8fafc',
              zIndex: 10
            }}>
              {/* Header */}
              <div style={{
                height: '52px',
                padding: '0 20px',
                display: 'flex',
                alignItems: 'center',
                fontWeight: '800',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#475569',
                borderBottom: '2px solid var(--line, #cbd5e1)',
                background: '#f8fafc'
              }}>
                Personnel / Teacher Name
              </div>

              {/* Rows */}
              {activePersonnelList.length === 0 ? (
                <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
                  No personnel registered yet.
                </div>
              ) : (
                activePersonnelList.map(p => {
                  const fullName = `${p.lastName}, ${p.firstName}`.toUpperCase();
                  return (
                    <div
                      key={p.id}
                      style={{
                        height: '60px',
                        padding: '0 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        borderBottom: '1px solid var(--line, #e2e8f0)',
                        background: '#ffffff'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--navy, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fullName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {p.position || 'Teacher'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* RIGHT SIDE: SCROLLABLE ALLOWANCE CHECKBOX COLUMNS */}
            <div style={{ flexGrow: 1, overflowX: 'auto' }}>
              
              {/* Headers */}
              <div style={{ display: 'flex', height: '52px', borderBottom: '2px solid var(--line, #cbd5e1)', background: '#f8fafc' }}>
                {allowanceConfig.map(conf => (
                  <div 
                    key={conf.key} 
                    style={{
                      flex: 1,
                      minWidth: '180px',
                      padding: '0 16px',
                      display: 'flex',
                      alignItems: 'center',
                      fontWeight: '800',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#475569',
                      borderRight: '1px solid var(--line, #cbd5e1)'
                    }}
                  >
                    <div>
                      <div>{conf.label}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', textTransform: 'none', fontWeight: 'normal' }}>
                        {conf.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {activePersonnelList.length === 0 ? (
                <div style={{ height: '60px', borderBottom: '1px solid var(--line, #e2e8f0)' }}></div>
              ) : (
                activePersonnelList.map(p => {
                  const fullName = `${p.lastName}, ${p.firstName}`.toUpperCase();
                  const personAllowances = allowancesMap[p.id] || {};

                  return (
                    <div 
                      key={p.id} 
                      style={{ 
                        display: 'flex', 
                        height: '60px', 
                        borderBottom: '1px solid var(--line, #e2e8f0)',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {allowanceConfig.map(conf => {
                        const isChecked = Boolean(personAllowances[conf.key]);
                        
                        return (
                          <div 
                            key={conf.key} 
                            style={{
                              flex: 1,
                              minWidth: '180px',
                              padding: '0 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              borderRight: '1px solid var(--line, #e2e8f0)'
                            }}
                          >
                            <input
                              type="checkbox"
                              style={{
                                width: '18px',
                                height: '18px',
                                minHeight: 'auto',
                                padding: '0',
                                margin: '0',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                appearance: 'checkbox',
                                WebkitAppearance: 'checkbox'
                              }}
                              checked={isChecked}
                              onChange={() => handleCheckboxToggle(p.id, fullName, conf)}
                            />
                            
                            <span 
                              style={{ 
                                fontSize: '11px', 
                                fontWeight: 'bold', 
                                padding: '3px 8px', 
                                borderRadius: '6px',
                                background: isChecked ? '#dcfce7' : '#f1f5f9',
                                color: isChecked ? '#15803d' : '#94a3b8',
                                border: isChecked ? '1px solid #bbf7d0' : '1px solid #e2e8f0'
                              }}
                            >
                              {isChecked ? '✓ GRANTED' : 'OFF'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div style={{
          marginTop: '30px',
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: '16px',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)'
        }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#F8FAFC' }}>
              Allowances & Incentives Configured
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Proceed to Node 11 (Validation Center) for final quality checks & eSF7 report generation.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveView('validation')}
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
                gap: '8px'
              }}
            >
              <span>Save & Proceed to Validation Center ➔</span>
            </button>
          </div>
        </div>

      </div>
    </PageTransition>
  );
}
