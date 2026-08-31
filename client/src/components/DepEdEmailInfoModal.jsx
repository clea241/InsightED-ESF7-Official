import React from 'react';

export default function DepEdEmailInfoModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: '16px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)',
          color: 'white',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid #EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            color: '#F87171'
          }}>
            ⚠️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', letterSpacing: '-0.2px' }}>
              Important DepEd Email Verification
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>
              DepEd Official Email Policy & eSF7 Validation Notice
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', fontSize: '13.5px', color: '#334155', lineHeight: '1.6' }}>
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '16px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: '18px' }}>🚫</span>
            <div style={{ fontSize: '13px', color: '#991B1B', fontWeight: '600' }}>
              Submitting duplicate DepEd emails across different schools will result in an <strong>INVALID eSF7 Submission</strong>.
            </div>
          </div>

          <p style={{ margin: '0 0 12px 0' }}>
            Please make sure to carefully check every <strong>DepEd Email</strong>:
          </p>

          <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              DepEd emails must end in <code>@deped.gov.ph</code> and correspond to the personnel's official registered name (numbers like <code>0001</code> are accepted).
            </li>
            <li>
              DepEd Email is <strong>MANDATORY</strong> for all Teaching, Teaching-Related, and Nationally-Funded staff.
            </li>
            <li>
              Non-Nationally Funded Non-Teaching staff (e.g. MOOE Utility Workers, Contractual/JO) may be marked as <strong>N/A</strong> if no official email was issued.
            </li>
            <li>
              Duplicate DepEd emails across different personnel or schools will cause submission errors.
            </li>
          </ul>

          <div style={{
            background: '#F8FAFC',
            border: '1px dashed #CBD5E1',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#64748B'
          }}>
            ℹ️ Correct email addresses ensure smooth personnel tracking and avoid submission errors during district/division consolidation.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#0F172A',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
