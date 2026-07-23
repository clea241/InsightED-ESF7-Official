import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { deleteLocalDraft, getLocalDraft } from '../services/db';

export default function ValidationCenter() {
  const {
    personnel,
    getValidationIssues,
    setActivePersonnelId,
    setActiveView,
    schoolInfo,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showToast,
    showAlert
  } = useApp();

  const [certified, setCertified] = useState(false);
  const [principalName, setPrincipalName] = useState('');
  const [signature, setSignature] = useState('');
  const [jobId, setJobId] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showResubmitForm, setShowResubmitForm] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [submissionHistory, setSubmissionHistory] = useState([]);
  const [hasPriorSubmission, setHasPriorSubmission] = useState(false);

  // Reset states on school switch
  useEffect(() => {
    setSubmissionHistory([]);
    setHasPriorSubmission(false);
    setShowResubmitForm(false);
  }, [schoolInfo?.schoolId, schoolInfo?.schoolYear]);

  // Fetch submission history on load/school switch
  useEffect(() => {
    if (!schoolInfo?.schoolId) return;
    const fetchHistory = async () => {
      try {
        const history = await api.getSubmissionHistory();
        if (Array.isArray(history)) {
          setSubmissionHistory(history);
          const completedOrPending = history.some(job => job.status === 'completed' || job.status === 'pending' || job.status === 'processing');
          setHasPriorSubmission(completedOrPending || !!schoolInfo?.certifiedAt);
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      }
    };
    fetchHistory();
  }, [schoolInfo]);

  // Auto-fill principal/school head name & signature from roster/schoolInfo
  useEffect(() => {
    if (schoolInfo?.certifiedSignature && !signature) {
      setSignature(schoolInfo.certifiedSignature);
    }
  }, [schoolInfo]);

  useEffect(() => {
    const schoolHead = personnel.find(p => {
      const pos = (p.position || '').toUpperCase();
      return pos.includes('PRINCIPAL') || pos.includes('HEAD TEACHER') || pos.includes('TEACHER-IN-CHARGE') || pos.includes('TIC') || pos.includes('OIC');
    });

    if (schoolHead) {
      const middleInitial = schoolHead.middleName && schoolHead.middleName !== 'N/A' && schoolHead.middleName !== 'NONE'
        ? ` ${schoolHead.middleName.charAt(0)}.`
        : '';
      const fullName = `${schoolHead.firstName}${middleInitial} ${schoolHead.lastName}`;
      setPrincipalName(fullName.toUpperCase());

      if ((schoolHead.e_signature_url || schoolHead.signature) && !signature) {
        setSignature(schoolHead.e_signature_url || schoolHead.signature);
      }
    }
  }, [personnel]);

  // E-Signature Drawing & Upload state
  const [sigMode, setSigMode] = useState('draw'); // 'draw' | 'upload' | 'type'
  const canvasRef = useRef(null);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const drawingCtxRef = useRef(null);

  // Initialize Canvas context settings
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set matching display width/height dimensions
    canvas.width = canvas.parentElement.clientWidth || 800;
    canvas.height = 300;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#2563EB'; // Professional Blue Ink Color
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawingCtxRef.current = ctx;
  };

  useEffect(() => {
    if (showSignatureModal && sigMode === 'draw') {
      // Small timeout to allow modal element to render first
      const timeout = setTimeout(() => {
        initCanvas();
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.addEventListener('touchstart', startDrawing, { passive: false });
          canvas.addEventListener('touchmove', draw, { passive: false });
          canvas.addEventListener('touchend', stopDrawing, { passive: false });
        }
      }, 150);

      window.addEventListener('resize', initCanvas);
      return () => {
        clearTimeout(timeout);
        window.removeEventListener('resize', initCanvas);
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.removeEventListener('touchstart', startDrawing);
          canvas.removeEventListener('touchmove', draw);
          canvas.removeEventListener('touchend', stopDrawing);
        }
      };
    }
  }, [showSignatureModal, sigMode]);

  // Drawing event handlers
  const startDrawing = (e) => {
    if (e && e.cancelable) {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas || !drawingCtxRef.current) return;

    setIsDrawingActive(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    drawingCtxRef.current.beginPath();
    drawingCtxRef.current.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e) => {
    if (!isDrawingActive) return;
    if (e && e.cancelable) {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas || !drawingCtxRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    drawingCtxRef.current.lineTo(clientX - rect.left, clientY - rect.top);
    drawingCtxRef.current.stroke();
  };

  const stopDrawing = () => {
    if (isDrawingActive) {
      setIsDrawingActive(false);
      saveCanvasData();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingCtxRef.current) return;
    drawingCtxRef.current.clearRect(0, 0, canvas.width, canvas.height);
    setSignature('');
  };

  const saveCanvasData = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Export drawn image representation as DataURL base64 string
    const dataUrl = canvas.toDataURL('image/png');
    setSignature(dataUrl);
  };

  // Image Upload handler
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setSignature(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const issues = getValidationIssues();
  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warn');
  const duplicates = issues.filter(i => i.message.toLowerCase().includes('duplicate'));

  // Calculate ready records (personnel with 0 error-level issues)
  const readyRecords = personnel.filter(p => {
    const personErrors = errors.filter(e => e.personId === p.id);
    return personErrors.length === 0;
  });

  const handleNavigateToPerson = (personId) => {
    if (!personId) return;
    setActivePersonnelId(personId);
    setActiveView('profile');
  };

  // Poll for queue status
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.getSubmissionStatus(jobId);
        if (res.success) {
          setQueueStatus(res.status);
          setQueuePosition(res.queuePosition);
          setErrorMessage(res.errorMessage);

          if (res.status === 'completed') {
            clearInterval(interval);
            showToast("eSF7 Certified and Submitted successfully!");

            // Clear IndexedDB and database drafts to restart state
            const draftKey = `draft_${schoolInfo.schoolId}_${schoolInfo.schoolYear}`;
            await deleteLocalDraft(draftKey);
            try {
              await api.deleteSchoolDraft(schoolInfo.schoolYear);
            } catch (err) {
              console.error('Failed to delete cloud draft on submit:', err);
            }
            setHasUnsavedChanges(false);

            // Reload window to fetch fresh from database
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else if (res.status === 'failed') {
            clearInterval(interval);
            showAlert("Submission Failed", "The background queue worker failed to write to the database: " + res.errorMessage);
            setJobId(null);
          }
        }
      } catch (err) {
        console.error('Error polling submission status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, schoolInfo]);

  const handleSubmitToQueue = async (e) => {
    e.preventDefault();
    if (!certified || !principalName) {
      await showAlert("Missing Certification Fields", "Please tick the certification box and fill in your name.");
      return;
    }

    try {
      setErrorMessage(null);
      setQueueStatus('pending');

      // Grab local IndexedDB state for the payload
      const draftKey = `draft_${schoolInfo.schoolId}_${schoolInfo.schoolYear}`;
      const localDraft = await getLocalDraft(draftKey);

      const basePayload = localDraft || {
        schoolInfo,
        personnel,
        classSections,
        workloadTransfers: [],
        absences: []
      };

      const payload = {
        ...basePayload,
        personnel: (basePayload.personnel || []).filter(p => !p.isShared)
      };

      const res = await api.submitSchoolWorkload({
        schoolYear: schoolInfo.schoolYear,
        payload,
        signature: signature || null,
        certifiedBy: principalName
      });

      if (res.success) {
        setJobId(res.jobId);
        setQueueStatus(res.status);
        setQueuePosition(res.queuePosition);
      } else {
        await showAlert("Submission Error", res.error || "Failed to enqueue submission");
        setQueueStatus(null);
      }
    } catch (err) {
      console.error('Submit failed:', err);
      await showAlert("Network Error", "Unable to connect to the submission server.");
      setQueueStatus(null);
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const handleExportXLSB = async () => {
    try {
      setIsDownloading(true);
      await api.downloadESF7XLSB();
      if (showToast) showToast("eSF7 (.xlsb) Report downloaded successfully!");
    } catch (err) {
      console.error(err);
      if (showAlert) showAlert("Export Failed", err.message || "Failed to generate eSF7 .xlsb report.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section id="validation" className="view grid">
      <article className="card">
        <div className="card-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2>Validation Center</h2>
              <p className="subtext">
                Covers required fields, dependencies, uniqueness, duplicate detection, role constraints, workflow status, permissions, transfers, clustered schools, and computations.
              </p>
            </div>
            {/* PAUSED FOR NOW
            <button
              className="btn"
              type="button"
              onClick={handleExportXLSB}
              disabled={isDownloading}
              style={{
                background: 'linear-gradient(180deg, #10b981, #059669)',
                color: 'white',
                fontWeight: '700',
                fontSize: '13px',
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                cursor: isDownloading ? 'wait' : 'pointer',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isDownloading ? '⏳ Generating eSF7 (.xlsb)...' : '📥 Export Official eSF7 (.xlsb)'}
            </button>
            */}
          </div>

          <div className="kpis" style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div className="kpi">
              <span>Errors</span>
              <strong style={{ color: 'var(--red, #B91C1C)' }}>{errors.length}</strong>
            </div>
            <div className="kpi">
              <span>Warnings</span>
              <strong style={{ color: 'var(--amber, #D97706)' }}>{warnings.length}</strong>
            </div>
            <div className="kpi">
              <span>Duplicate Flags</span>
              <strong style={{ color: 'var(--purple, #7C3AED)' }}>{duplicates.length}</strong>
            </div>
            <div className="kpi">
              <span>Ready Records</span>
              <strong style={{ color: 'var(--green, #16A34A)' }}>{readyRecords.length} / {personnel.length}</strong>
            </div>
          </div>

          <div id="validationList" className="issue-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {issues.length === 0 ? (
              <div className="issue" style={{ borderLeftColor: 'var(--green)', background: '#F0FDF4', color: '#166534' }}>
                ✓ All personnel records are fully validated and ready for submission!
              </div>
            ) : (
              issues.map(issue => (
                <div
                  key={issue.id}
                  className={`issue ${issue.type === 'error' ? 'error' : 'warn'}`}
                  style={{
                    padding: '12px 16px',
                    borderLeft: `5px solid ${issue.type === 'error' ? 'var(--red)' : 'var(--gold)'}`,
                    background: issue.type === 'error' ? '#FEF2F2' : '#FFFBEB',
                    color: issue.type === 'error' ? 'var(--red)' : '#92400E',
                    cursor: issue.personId ? 'pointer' : 'default',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => issue.personId && handleNavigateToPerson(issue.personId)}
                >
                  <div>
                    <strong style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                      {issue.category} · {issue.type.toUpperCase()}
                    </strong>
                    <span>{issue.message}</span>
                  </div>
                  {issue.personId && (
                    <span style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline', color: 'var(--blue)' }}>
                      Fix Profile →
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Submission Queue & Certification Section */}
          {errors.length === 0 && (
            <div style={{
              marginTop: '32px',
              padding: '24px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
              border: '1.5px solid var(--line)',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--navy)', marginBottom: '8px' }}>
                Certification and Digital Submission
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px' }}>
                Upon submission, your local drafts will be processed in our VM background queue before being saved into the main database.
              </p>

              {hasPriorSubmission && (
                <div style={{
                  background: '#F0FDF4',
                  border: '1.5px solid #BBF7D0',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>✅</span>
                    <strong style={{ color: '#166534', fontSize: '14px' }}>
                      eSF7 Document Certified & Submitted
                    </strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#1E293B', display: 'grid', gap: '4px' }}>
                    <span>Certified By: <strong>{schoolInfo.certifiedBy || (submissionHistory[0] && submissionHistory[0].certified_by) || 'School Head'}</strong></span>
                    <span>Certified At: <strong>{schoolInfo.certifiedAt ? new Date(schoolInfo.certifiedAt).toLocaleString() : (submissionHistory[0] ? new Date(submissionHistory[0].created_at).toLocaleString() : 'Recent Submission')}</strong></span>
                  </div>
                  {!showResubmitForm && hasUnsavedChanges && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setShowResubmitForm(true)}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '10px 18px',
                          fontSize: '13px',
                          fontWeight: '700',
                          color: 'var(--blue, #2563eb)',
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#DBEAFE';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#EFF6FF';
                        }}
                      >
                        🔄 Did you make changes and want to submit again?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {queueStatus ? (
                <div style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'white',
                  border: '1.5px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  textAlign: 'center'
                }}>
                  {queueStatus === 'pending' && (
                    <>
                      <div className="spinner" style={{
                        width: '32px',
                        height: '32px',
                        border: '4px solid #E2E8F0',
                        borderTop: '4px solid #2563EB',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      <style>{`
                        @keyframes spin {
                          0% { transform: rotate(0deg); }
                          100% { transform: rotate(360deg); }
                        }
                      `}</style>
                      <strong style={{ color: 'var(--navy)' }}>Submission Queued</strong>
                      <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
                        Your submission is in **position #{queuePosition}** in line.
                      </span>
                    </>
                  )}
                  {queueStatus === 'processing' && (
                    <>
                      <div className="spinner" style={{
                        width: '32px',
                        height: '32px',
                        border: '4px solid #E2E8F0',
                        borderTop: '4px solid #059669',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      <strong style={{ color: '#059669' }}>Processing ESF7...</strong>
                      <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                        Writing changes to official PostgreSQL tables. Do not close this page.
                      </span>
                    </>
                  )}
                </div>
              ) : (!hasPriorSubmission || showResubmitForm) && (
                <form onSubmit={handleSubmitToQueue} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '13px',
                    color: 'var(--navy)',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}>
                    <input
                      type="checkbox"
                      checked={certified}
                      onChange={(e) => setCertified(e.target.checked)}
                      style={{ marginTop: '2px', width: '15px', height: '15px', accentColor: 'var(--blue)', flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span>
                      I hereby certify that the information entered in this ESF7 document has been thoroughly validated, reviewed, and matches the official school records.
                    </span>
                  </label>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    marginTop: '8px',
                    background: '#ffffff',
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1.5px solid var(--outline, #E2E8F0)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
                  }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        School Head / Principal Name
                      </label>
                      <input
                        type="text"
                        placeholder="NO SCHOOL HEAD DETECTED IN ROSTER"
                        value={principalName}
                        readOnly
                        disabled
                        required
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '2px solid var(--outline, #E2E8F0)',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#64748B',
                          background: '#E2E8F0',
                          cursor: 'not-allowed',
                          transition: 'all 0.2s'
                        }}
                      />
                    </div>

                    {/* E-Signature / Digital Sign-off Section */}
                    <div style={{ borderTop: '1.5px solid var(--outline, #E2E8F0)', paddingTop: '16px', marginTop: '4px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        School Head E-Signature / Digital Sign-Off
                      </label>

                      {signature ? (
                        <div style={{
                          background: '#F8FAFC',
                          border: '2px solid #BFDBFE',
                          borderRadius: '14px',
                          padding: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '6px 12px', display: 'flex', alignItems: 'center' }}>
                              <img src={signature} alt="School Head E-Signature" style={{ maxHeight: '50px', maxWidth: '160px', objectFit: 'contain' }} />
                            </div>
                            <div>
                              <span style={{ fontSize: '12px', color: '#059669', fontWeight: '700', display: 'block' }}>✓ E-Signature Attached & Verified</span>
                              <span style={{ fontSize: '11px', color: '#64748B' }}>Click "Re-sign" to draw or upload a new signature image.</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setShowSignatureModal(true)}
                              style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1.5px solid var(--blue, #2563EB)', background: '#EFF6FF', color: 'var(--blue, #2563EB)', cursor: 'pointer' }}
                            >
                              ✍️ Re-sign
                            </button>
                            <button
                              type="button"
                              onClick={clearCanvas}
                              style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => setShowSignatureModal(true)}
                          style={{
                            padding: '24px',
                            background: 'linear-gradient(135deg, #F0F9FF, #F8FAFC)',
                            border: '2px dashed #3B82F6',
                            borderRadius: '14px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#1D4ED8';
                            e.currentTarget.style.background = '#E0F2FE';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#3B82F6';
                            e.currentTarget.style.background = 'linear-gradient(135deg, #F0F9FF, #F8FAFC)';
                          }}
                        >
                          <div style={{ fontSize: '28px', marginBottom: '6px' }}>✍️</div>
                          <strong style={{ color: 'var(--blue, #2563EB)', fontSize: '15px', display: 'block' }}>
                            Click here to add E-Signature
                          </strong>
                          <span style={{ fontSize: '12px', color: '#64748B', display: 'block', marginTop: '4px' }}>
                            Opens the E-Signature Pad modal to draw or upload the School Head / Principal signature
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="btn"
                    style={{
                      background: 'linear-gradient(180deg, #0284c7, #0369a1)',
                      color: 'white',
                      alignSelf: 'flex-start',
                      marginTop: '12px',
                      padding: '10px 24px',
                      fontWeight: '600',
                      boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)'
                    }}
                  >
                    🚀 Submit Certified eSF7 to Queue
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </article>

      {/* E-Signature Writing Modal Overlay */}
      {showSignatureModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '28px',
            maxWidth: '600px',
            width: '100%',
            border: '1.5px solid var(--line, #E2E8F0)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--navy, #0f172a)', margin: 0 }}>
                  School Head E-Signature
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--muted, #64748b)', margin: '4px 0 0' }}>
                  Official sign-off for {principalName || 'School Head'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#64748B', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setSigMode('draw')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: 'none',
                  background: sigMode === 'draw' ? 'var(--blue, #2563EB)' : '#F1F5F9',
                  color: sigMode === 'draw' ? 'white' : '#64748B',
                  cursor: 'pointer'
                }}
              >
                ✍️ Draw Signature
              </button>
              <button
                type="button"
                onClick={() => setSigMode('upload')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: 'none',
                  background: sigMode === 'upload' ? 'var(--blue, #2563EB)' : '#F1F5F9',
                  color: sigMode === 'upload' ? 'white' : '#64748B',
                  cursor: 'pointer'
                }}
              >
                📁 Upload Image
              </button>
            </div>

            {/* Signature Input Canvas / File Upload */}
            {sigMode === 'draw' ? (
              <div>
                <div style={{ position: 'relative', background: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: '12px', overflow: 'hidden' }}>
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ width: '100%', height: '220px', cursor: 'crosshair', display: 'block', background: 'white' }}
                  />
                  <div style={{ position: 'absolute', bottom: '12px', right: '12px' }}>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F1F5F9', cursor: 'pointer' }}
                    >
                      Clear Pad
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: '#64748B', marginTop: '8px', textAlign: 'center' }}>
                  Use your mouse, trackpad, or touch screen to draw your signature inside the box.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '28px', background: '#F8FAFC', borderRadius: '12px', border: '2px dashed #CBD5E1' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ fontSize: '13px', color: 'var(--navy)' }}
                />
                <p style={{ fontSize: '12px', color: '#64748B', marginTop: '10px' }}>
                  Upload a clear PNG, JPG, or WEBP signature file.
                </p>
              </div>
            )}

            {/* Modal Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #CBD5E1', background: 'white', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sigMode === 'draw') saveCanvasData();
                  setShowSignatureModal(false);
                }}
                style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(180deg, #0284c7, #0369a1)', color: 'white', fontWeight: '700', cursor: 'pointer' }}
              >
                ✓ Apply Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
