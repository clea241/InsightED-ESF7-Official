import React from 'react';
import { FiAlertTriangle, FiLogOut, FiUploadCloud } from 'react-icons/fi';

export default function ForceLogoutNoticeModal({ isOpen, onConfirmLogout, onCancelStay }) {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px'
      }}
    >
      <div 
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          overflow: 'hidden',
          animation: 'modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        <style>{`
          @keyframes modalSlideIn {
            from { transform: scale(0.94) translateY(10px); opacity: 0; }
            to { transform: scale(1) translateY(0); opacity: 1; }
          }
        `}</style>

        {/* Modal Top Accent Header */}
        <div style={{
          padding: '24px 28px 20px',
          background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
          borderBottom: '1px solid #FECACA',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
          }}>
            <FiAlertTriangle size={24} />
          </div>

          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              background: '#FCA5A5',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#991B1B',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '6px'
            }}>
              Official DepEd Requirement
            </div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#7F1D1D', lineHeight: 1.3 }}>
              Submission Required
            </h3>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px 28px' }}>
          <p style={{
            margin: '0 0 16px',
            fontSize: '15px',
            fontWeight: '600',
            color: '#1E293B',
            lineHeight: 1.5
          }}>
            Notice: Established DepEd schools must submit their official SY 2025–2026 eSF7 file to initialize their station. Do you want to cancel and log out?
          </p>

          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '12px',
            color: '#64748B',
            lineHeight: 1.5
          }}>
            Station initialization is mandatory under DepEd guidelines. Without your official eSF7 spreadsheet, faculty plantillas, teaching workloads, and section allocations cannot be populated.
          </div>
        </div>

        {/* Modal Footer Buttons */}
        <div style={{
          padding: '16px 28px 24px',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          background: '#FAFAFA',
          borderTop: '1px solid #F1F5F9'
        }}>
          <button
            type="button"
            onClick={onConfirmLogout}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#DC2626',
              background: '#FFFFFF',
              border: '1.5px solid #FECACA',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FEF2F2';
              e.currentTarget.style.borderColor = '#F87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.borderColor = '#FECACA';
            }}
          >
            <FiLogOut size={16} /> Cancel & Log Out
          </button>

          <button
            type="button"
            onClick={onCancelStay}
            style={{
              padding: '10px 22px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#FFFFFF',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.45)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.35)';
            }}
          >
            <FiUploadCloud size={16} /> Stay & Upload File
          </button>
        </div>
      </div>
    </div>
  );
}
