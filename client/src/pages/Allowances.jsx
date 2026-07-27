import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import PageTransition from '../components/PageTransition';

export default function Allowances() {
  const { personnel, showToast } = useApp();

  // Setup default allowances configurations
  const [allowanceConfig, setAllowanceConfig] = useState([
    { key: 'pera', label: 'PERA', type: 'fixed', defaultVal: 2000.00 },
    { key: 'uniform', label: 'Uniform Allowance', type: 'fixed', defaultVal: 6000.00 },
    { key: 'supplies', label: 'Teaching Supplies', type: 'fixed', defaultVal: 10000.00 },
    { key: 'medical', label: 'Medical Allowance', type: 'fixed', defaultVal: 7000.00 },
    { key: 'hardship', label: 'Special Hardship', type: 'variable', defaultVal: 0.00 },
    { key: 'overload', label: 'Overload Pay', type: 'variable', defaultVal: 0.00 }
  ]);

  // Stores grid states: key: `${personnelId}_${allowanceKey}` -> { checked: bool, amount: number }
  const [allowanceGrid, setAllowanceGrid] = useState(() => {
    const saved = localStorage.getItem('draft_allowance_grid');
    return saved ? JSON.parse(saved) : {};
  });

  // Dialog/Modal state for inputting variable allowance amounts
  const [modalState, setModalState] = useState({
    isOpen: false,
    personnelId: null,
    personnelName: '',
    allowanceKey: '',
    allowanceLabel: '',
    amount: ''
  });

  // Save changes locally in draft storage
  useEffect(() => {
    localStorage.setItem('draft_allowance_grid', JSON.stringify(allowanceGrid));
  }, [allowanceGrid]);

  const handleCheckboxToggle = (personId, name, conf) => {
    const gridKey = `${personId}_${conf.key}`;
    const cell = allowanceGrid[gridKey] || { checked: false, amount: 0 };

    if (cell.checked) {
      // Uncheck is immediate
      setAllowanceGrid(prev => ({
        ...prev,
        [gridKey]: { checked: false, amount: 0 }
      }));
      showToast(`Removed ${conf.label} for ${name}`);
    } else {
      // Check action
      if (conf.type === 'fixed') {
        // Fixed amount is set automatically
        setAllowanceGrid(prev => ({
          ...prev,
          [gridKey]: { checked: true, amount: conf.defaultVal }
        }));
        showToast(`Applied ${conf.label} (₱${conf.defaultVal.toLocaleString()}) to ${name}`);
      } else {
        // Variable amount prompts input
        setModalState({
          isOpen: true,
          personnelId: personId,
          personnelName: name,
          allowanceKey: conf.key,
          allowanceLabel: conf.label,
          amount: cell.amount || ''
        });
      }
    }
  };

  const handleSaveModal = () => {
    const val = parseFloat(modalState.amount) || 0;
    if (val <= 0) {
      showToast('Please enter a valid amount greater than 0.', 'error');
      return;
    }

    const gridKey = `${modalState.personnelId}_${modalState.allowanceKey}`;
    setAllowanceGrid(prev => ({
      ...prev,
      [gridKey]: { checked: true, amount: val }
    }));

    showToast(`Set ${modalState.allowanceLabel} to ₱${val.toLocaleString()} for ${modalState.personnelName}`);
    setModalState({ isOpen: false, personnelId: null, personnelName: '', allowanceKey: '', allowanceLabel: '', amount: '' });
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
              Select allowances and manage financial incentives for registered school personnel.
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
            
            {/* LEFT SIDE: FROZEN TABLE COLUMN */}
            <div style={{
              flexShrink: 0,
              width: '280px',
              borderRight: '2px solid var(--line, #cbd5e1)',
              background: '#f8fafc',
              zIndex: 10,
              position: 'sticky',
              left: 0
            }}>
              {/* Header */}
              <div style={{
                height: '52px',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                borderBottom: '2px solid var(--line, #cbd5e1)',
                fontWeight: '800',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#475569'
              }}>
                Personnel Name / Position
              </div>
              
              {/* Rows */}
              {personnel.filter(p => !p.isShared).length === 0 ? (
                <div style={{ padding: '24px 16px', fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>
                  No personnel listed in roster.
                </div>
              ) : (
                personnel.filter(p => !p.isShared).map(p => {
                  const fullName = `${p.firstName} ${p.lastName}`.toUpperCase();
                  return (
                    <div 
                      key={p.id} 
                      style={{
                        height: '60px',
                        padding: '0 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        borderBottom: '1px solid var(--line, #e2e8f0)',
                        background: '#f8fafc'
                      }}
                    >
                      <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--navy, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fullName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.position || 'N/A'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* RIGHT SIDE: HORIZONTAL SCROLL COLUMNS */}
            <div style={{ flex: 1, minWidth: '800px' }}>
              
              {/* Scrollable Headers */}
              <div style={{ display: 'flex', height: '52px', borderBottom: '2px solid var(--line, #cbd5e1)', background: '#f8fafc' }}>
                {allowanceConfig.map(conf => (
                  <div 
                    key={conf.key} 
                    style={{
                      flex: 1,
                      minWidth: '160px',
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
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                        {conf.type === 'fixed' ? `Fixed (₱${conf.defaultVal.toLocaleString()})` : 'Variable Input'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Scrollable Rows */}
              {personnel.filter(p => !p.isShared).length === 0 ? (
                <div style={{ height: '60px', borderBottom: '1px solid var(--line, #e2e8f0)' }}></div>
              ) : (
                personnel.filter(p => !p.isShared).map(p => {
                  const fullName = `${p.firstName} ${p.lastName}`.toUpperCase();
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
                        const gridKey = `${p.id}_${conf.key}`;
                        const cell = allowanceGrid[gridKey] || { checked: false, amount: 0 };
                        
                        return (
                          <div 
                            key={conf.key} 
                            style={{
                              flex: 1,
                              minWidth: '160px',
                              padding: '0 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
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
                              checked={cell.checked}
                              onChange={() => handleCheckboxToggle(p.id, fullName, conf)}
                            />
                            
                            {cell.checked && (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#10B981' }}>
                                  ₱{cell.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {conf.type === 'variable' && (
                                  <button
                                    onClick={() => setModalState({
                                      isOpen: true,
                                      personnelId: p.id,
                                      personnelName: fullName,
                                      allowanceKey: conf.key,
                                      allowanceLabel: conf.label,
                                      amount: cell.amount
                                    })}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--blue, #2563eb)',
                                      padding: 0,
                                      fontSize: '10px',
                                      fontWeight: '700',
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    Adjust
                                  </button>
                                )}
                              </div>
                            )}
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

        {/* POPUP ADJUST AMOUNT DIALOG */}
        {modalState.isOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}>
            <div style={{
              background: 'white',
              borderRadius: '20px',
              padding: '28px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
              animation: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              border: '1px solid #f1f5f9'
            }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '24px' }}>💰</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--navy, #0f172a)' }}>
                  Enter Allowance Amount
                </h3>
              </div>

              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                Set custom amount for <strong>{modalState.allowanceLabel}</strong> assigned to <strong style={{ color: '#09203b' }}>{modalState.personnelName}</strong>.
              </p>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Amount in PHP (₱)
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f8fafc',
                  border: '2px solid var(--line, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '0 16px'
                }}>
                  <span style={{ color: '#94a3b8', fontSize: '16px', fontWeight: '700', marginRight: '8px' }}>₱</span>
                  <input
                    type="number"
                    value={modalState.amount}
                    onChange={(e) => setModalState(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '15px',
                      outline: 'none',
                      fontWeight: '700',
                      color: 'var(--navy, #0f172a)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setModalState({ isOpen: false, personnelId: null, personnelName: '', allowanceKey: '', allowanceLabel: '', amount: '' })}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--line, #e2e8f0)',
                    background: 'white',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveModal}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--blue, #2563eb)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Confirm Amount
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </PageTransition>
  );
}
