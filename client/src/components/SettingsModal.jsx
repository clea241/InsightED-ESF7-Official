import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { clearAllLocalDatabases } from '../services/db';
import {
  FiSettings,
  FiX,
  FiDatabase,
  FiTrash2,
  FiAlertTriangle,
  FiCheckCircle,
  FiRefreshCw,
  FiInfo,
  FiHardDrive,
  FiUsers,
  FiLayers,
  FiShield
} from 'react-icons/fi';

export default function SettingsModal({ isOpen, onClose }) {
  const { schoolInfo, personnel, classSections, showToast } = useApp();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearedSuccess, setClearedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleClearDatabase = async () => {
    try {
      setIsClearing(true);
      await clearAllLocalDatabases();
      setClearedSuccess(true);
      if (showToast) {
        showToast('Local database and browser caches successfully cleared. Reloading...', 'success');
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error('Failed to clear local database:', err);
      setIsClearing(false);
      if (showToast) {
        showToast('Error clearing local storage: ' + (err?.message || 'Unknown error'), 'error');
      }
    }
  };

  const handleClose = () => {
    if (isClearing) return;
    setIsConfirmingClear(false);
    setClearedSuccess(false);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.68)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isClearing) handleClose();
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '640px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          animation: 'fadeInModal 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1.5px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to bottom, #FAFAFA, #FFFFFF)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(15, 23, 42, 0.15)'
              }}
            >
              <FiSettings size={20} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '800',
                  color: '#0F172A',
                  letterSpacing: '-0.02em'
                }}
              >
                eSF7 System & Storage Settings
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '12.5px',
                  color: '#64748B',
                  fontWeight: '500'
                }}
              >
                Manage offline caching, synchronization, and local database storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isClearing}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isClearing ? 'not-allowed' : 'pointer',
              color: '#64748B',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!isClearing) {
                e.currentTarget.style.background = '#E2E8F0';
                e.currentTarget.style.color = '#0F172A';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.color = '#64748B';
            }}
          >
            <FiX size={16} />
          </button>
        </div>

        {/* MODAL CONTENT BODY */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* SECTION 1: ACTIVE SCHOOL IDENTITY & REPOSITORY CONTEXT */}
          <div
            style={{
              padding: '16px',
              borderRadius: '16px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiHardDrive size={16} color="#0284C7" />
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B' }}>
                  Active School Registry Context
                </span>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#0369A1',
                  background: '#E0F2FE',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                Local-First Mode
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px'
              }}
            >
              <div
                style={{
                  background: '#FFFFFF',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0'
                }}
              >
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>School Name</div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#0F172A',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={schoolInfo?.schoolName}
                >
                  {schoolInfo?.schoolName || 'DepEd Integrated School'}
                </div>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0'
                }}
              >
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>School ID</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                  {schoolInfo?.schoolId || 'Not Configured'}
                </div>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FiUsers size={16} color="#475569" />
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Roster Personnel</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                    {personnel?.length || 0} Registered
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FiLayers size={16} color="#475569" />
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Class Sections</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                    {classSections?.length || 0} Sections
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: STORAGE ENGINE ARCHITECTURE */}
          <div
            style={{
              padding: '16px',
              borderRadius: '16px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiDatabase size={16} color="#6366F1" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B' }}>
                Browser Storage & IndexedDB Subsystem
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748B', lineHeight: '1.5' }}>
              InsightED eSF7 utilizes high-performance browser <strong>IndexedDB (esf7_drafts_db)</strong> combined with LocalStorage keys to provide lightning-fast offline capability. All changes are stored safely on your machine and committed across registry nodes.
            </p>
          </div>

          {/* SECTION 3: DATABASE MAINTENANCE & RESET CARD */}
          <div
            style={{
              padding: '18px',
              borderRadius: '16px',
              background: isConfirmingClear ? '#FEF2F2' : '#FFFBEB',
              border: isConfirmingClear ? '1.5px solid #FCA5A5' : '1.5px solid #FDE68A',
              transition: 'all 0.2s ease'
            }}
          >
            {!isConfirmingClear ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: '#FEF3C7',
                        color: '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <FiTrash2 size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#92400E' }}>
                        Local Database Maintenance
                      </div>
                      <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                        Clear local IndexedDB drafts, cached schedules, and browser storage
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsConfirmingClear(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '800',
                      color: '#B91C1C',
                      background: '#FFFFFF',
                      border: '1.5px solid #FCA5A5',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(185, 28, 28, 0.08)',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#FEE2E2';
                      e.currentTarget.style.borderColor = '#EF4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#FCA5A5';
                    }}
                  >
                    <FiTrash2 size={13} />
                    <span>Clear Local Database</span>
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    color: '#92400E'
                  }}
                >
                  <FiInfo size={14} style={{ flexShrink: 0 }} />
                  <span>
                    Use this button if you want to reset your local draft data or perform a fresh import of your eSF7 file.
                  </span>
                </div>
              </div>
            ) : (
              /* CONFIRMATION STATE */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: '#FEE2E2',
                      color: '#DC2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <FiAlertTriangle size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#991B1B' }}>
                      Are you sure you want to clear the local database?
                    </div>
                    <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px', lineHeight: '1.5' }}>
                      This action will <strong>permanently erase</strong> all locally cached eSF7 drafts, IndexedDB tables (<code>esf7_drafts_db</code>), organized class allocations, and local storage on this computer. Any unsaved drafts will be lost.
                    </div>
                  </div>
                </div>

                {clearedSuccess ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: '#DCFCE7',
                      color: '#166534',
                      fontSize: '12.5px',
                      fontWeight: '700'
                    }}
                  >
                    <FiCheckCircle size={16} />
                    <span>Database successfully cleared! Reloading system...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingClear(false)}
                      disabled={isClearing}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: '700',
                        color: '#475569',
                        background: '#FFFFFF',
                        border: '1.5px solid #CBD5E1',
                        cursor: isClearing ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isClearing) e.currentTarget.style.background = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#FFFFFF';
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleClearDatabase}
                      disabled={isClearing}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 18px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: '800',
                        color: '#FFFFFF',
                        background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                        border: 'none',
                        boxShadow: '0 4px 10px rgba(220, 38, 38, 0.3)',
                        cursor: isClearing ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isClearing ? (
                        <>
                          <FiRefreshCw size={13} className="spin" />
                          <span>Clearing Data...</span>
                        </>
                      ) : (
                        <>
                          <FiTrash2 size={13} />
                          <span>Yes, Clear Local Database</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1.5px solid #F1F5F9',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            color: '#64748B'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FiShield size={14} color="#0284C7" />
            <span>DepEd Electronic School Form 7 (eSF7) • Local-First Architecture</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isClearing}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#334155',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              cursor: isClearing ? 'not-allowed' : 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
