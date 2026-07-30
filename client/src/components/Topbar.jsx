import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import ESF7UploadModal from './ESF7UploadModal';
import { FiUploadCloud } from 'react-icons/fi';

export default function Topbar() {
  const { schoolInfo, getValidationIssues, hasUnsavedChanges, isSyncing, resetToDatabase } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const issues = getValidationIssues();
  const errorCount = issues.filter(i => i.type === 'error').length;

  return (
    <header className="topbar">
      <div className="page-title">
        <p className="eyebrow">National Education Command Center</p>
        <h1>InsightED eSF7 Personnel Portal</h1>
        <p>School personnel profile, workload, validation, clustered deployment, and final verification workflow.</p>
      </div>
      <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
          }}
        >
          <FiUploadCloud style={{ fontSize: '15px' }} /> Upload eSF7 (.xlsb)
        </button>

        {hasUnsavedChanges && (
          <button 
            type="button" 
            className="btn secondary" 
            onClick={resetToDatabase}
            style={{ fontSize: '11px', padding: '6px 12px', minHeight: 'auto', borderColor: '#E2E8F0', color: '#64748B' }}
          >
            Discard Changes
          </button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <strong id="topSchool" style={{ fontSize: '14px', color: 'var(--navy)' }}>{schoolInfo.schoolName || 'Sample National High School'}</strong>
          <span style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{schoolInfo.schoolYear}</span>
        </div>
        
        {isSyncing ? (
          <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }}>
            ● Autosaving...
          </span>
        ) : hasUnsavedChanges ? (
          <span className="badge warn" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            ● Local Draft ({errorCount} issues)
          </span>
        ) : (
          <span className="badge ok" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            ● Certified & Submitted
          </span>
        )}
      </div>

      <ESF7UploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </header>
  );
}
