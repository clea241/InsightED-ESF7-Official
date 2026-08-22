import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import OverloadPayModal from '../components/OverloadPayModal';

export default function Submission() {
  const { getValidationIssues, setActiveView, school, completeNode } = useApp();
  const [isOverloadModalOpen, setIsOverloadModalOpen] = useState(false);

  const issues = getValidationIssues();
  const errors = issues.filter(i => i.type === 'error');
  const hasErrors = errors.length > 0;

  const handleSubmit = () => {
    if (hasErrors) {
      alert("Submission blocked. Please resolve all critical validation errors first.");
      return;
    }
    alert("🎉 eSF7 submitted successfully! Official records updated in command center.");
  };

  return (
    <section id="submission" className="view grid" style={{ gap: '20px' }}>
      <article className="card">
        <div className="card-inner">
          <h2>Final Review and Submission</h2>
          <p className="subtext">Blocks submission until critical eSF7 validations are complete.</p>

          <div id="submissionChecklist" className="issue-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {hasErrors ? (
              <div className="issue error" style={{ padding: '16px', borderLeft: '5px solid var(--red)', background: '#FEF2F2', color: 'var(--red)', borderRadius: '8px' }}>
                <strong>⚠️ Submission Blocked</strong>
                <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
                  You have {errors.length} unresolved critical error(s) in your personnel registry or workload assignments.
                </p>
              </div>
            ) : (
              <div className="issue" style={{ padding: '16px', borderLeft: '5px solid var(--green)', background: '#F0FDF4', color: '#166534', borderRadius: '8px' }}>
                <strong>✓ Ready to Submit</strong>
                <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
                  All quality validations passed! The registry matches division specifications.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px' }}>
            <button
              id="submitButton"
              className="btn"
              type="button"
              onClick={handleSubmit}
              disabled={hasErrors}
              style={{
                opacity: hasErrors ? 0.5 : 1,
                cursor: hasErrors ? 'not-allowed' : 'pointer',
                background: hasErrors ? '#94a3b8' : 'var(--blue)',
                borderColor: hasErrors ? '#cbd5e1' : 'var(--blue)'
              }}
            >
              Submit eSF7
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => setActiveView('validation')}
            >
              Review Validation Center
            </button>
          </div>
        </div>
      </article>

      {/* Overload Pay Report Generator Card */}
      <article className="card" style={{ background: 'linear-gradient(to right, #f8fafc, #ffffff)', border: '1px solid #e2e8f0' }}>
        <div className="card-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
                📊 Overload Pay Report Engine
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>
                Generate monthly overload pay calculations incorporating the DepEd 3-Term School Calendar (SY 2026-2027) with automatic non-teaching and vacation period exclusions.
              </p>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => setIsOverloadModalOpen(true)}
              style={{
                background: '#0284c7',
                borderColor: '#0284c7',
                color: '#ffffff',
                fontWeight: '700',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)'
              }}
            >
              🗓️ Generate Overload Pay Report
            </button>
          </div>
        </div>
      </article>

      <OverloadPayModal
        isOpen={isOverloadModalOpen}
        onClose={() => setIsOverloadModalOpen(false)}
        schoolId={school?.school_id || '123456'}
        schoolYear={school?.school_year || 'SY 2026-2027'}
      />

      {/* STICKY BOTTOM JOURNEY ACTION BAR */}
      <div className="sticky-journey-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            background: 'rgba(16, 185, 129, 0.25)',
            color: '#34D399',
            border: '1px solid rgba(52, 211, 153, 0.4)',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: '900'
          }}>
            NODE 09 OF 09 (FINAL STEP)
          </span>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#F8FAFC' }}>
              eSF7 Final Submission & Certification
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Final sign-off, digital certification & official eSF7 submission to command center.
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
            onClick={() => {
              if (completeNode) completeNode('submission', null);
              setActiveView('nodemap');
            }}
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
            Finish & Return to Node Map 🎉
          </button>
        </div>
      </div>
    </section>
  );
}
