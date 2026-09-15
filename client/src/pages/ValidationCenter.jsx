import React, { useState, useEffect, useRef } from 'react';
import { useApp, detectPersonnelTypeFromPosition } from '../context/AppContext';
import { api } from '../services/api';
import { deleteLocalDraft, getLocalDraft } from '../services/db';
import ESF7PrintableReportModal from '../components/ESF7PrintableReportModal';
import PortalHeader from '../components/PortalHeader';
import { 
  FiFileText, FiPrinter, FiShield, FiCheckCircle, FiCheck, FiRepeat, 
  FiEdit3, FiUploadCloud, FiAward, FiCalendar, FiUser, FiLayers, 
  FiX, FiExternalLink, FiDownload, FiHome, FiClock, FiCheckSquare 
} from 'react-icons/fi';


export default function ValidationCenter() {
  const {
    personnel,
    classSections,
    getValidationIssues,
    setActivePersonnelId,
    setActiveView,
    schoolInfo,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showToast,
    showAlert,
    completeNode,
    allowancesMap
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

  // Celebratory Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submissionDetails, setSubmissionDetails] = useState(null);

  // Tab & Preview filters for VIEW Sheet / Teacher Class Programs
  const [activeTab, setActiveTab] = useState('validation'); // 'validation' | 'view_preview'
  const [searchQuery, setSearchQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL'); // 'ALL' | 'TEACHING' | 'NON_TEACHING'
  const [expandedTeacherId, setExpandedTeacherId] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Reset states on school switch
  useEffect(() => {
    setSubmissionHistory([]);
    setHasPriorSubmission(false);
    setShowResubmitForm(false);
  }, [schoolInfo?.schoolId, schoolInfo?.schoolYear]);

  // Fetch submission history on load/school switch
  const fetchHistory = async () => {
    if (!schoolInfo?.schoolId) return;
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

  useEffect(() => {
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
            const draftKey = `draft_${schoolInfo?.schoolId}_${schoolInfo?.schoolYear}`;
            await deleteLocalDraft(draftKey);
            try {
              await api.deleteSchoolDraft(schoolInfo?.schoolYear);
            } catch (err) {
              console.error('Failed to delete cloud draft on submit:', err);
            }
            setHasUnsavedChanges(false);
            setQueueStatus(null);
            setHasPriorSubmission(true);
            setShowResubmitForm(false);
            if (completeNode) completeNode('submission');

            // Refresh history
            await fetchHistory();

            // Set detailed submission info and show celebratory success modal!
            const now = new Date();
            setSubmissionDetails({
              jobId: jobId || res.jobId,
              schoolId: schoolInfo?.schoolId,
              schoolName: schoolInfo?.schoolName || schoolInfo?.school_name || `School ${schoolInfo?.schoolId}`,
              schoolYear: schoolInfo?.schoolYear || 'SY 26-27',
              certifiedBy: principalName || schoolInfo?.certifiedBy || 'School Head',
              certifiedAt: now.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }),
              personnelCount: personnel.length,
              sectionsCount: classSections.length
            });
            setShowSuccessModal(true);
            setJobId(null);
          } else if (res.status === 'failed') {
            clearInterval(interval);
            showAlert("Submission Failed", "The background queue worker failed to write to the database: " + res.errorMessage);
            setJobId(null);
            setQueueStatus(null);
          }
        }
      } catch (err) {
        console.error('Error polling submission status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, schoolInfo, personnel, classSections, principalName, completeNode, showToast, showAlert, setHasUnsavedChanges]);

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
        absences: [],
        allowancesMap: allowancesMap || {}
      };

      const payload = {
        ...basePayload,
        personnel: (basePayload.personnel || []).filter(p => !p.isShared),
        allowancesMap: allowancesMap || basePayload.allowancesMap || {}
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
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

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

  const handleExportPDF = async () => {
    try {
      setIsDownloadingPdf(true);
      await api.downloadESF7PDF(schoolInfo?.schoolId);
      if (showToast) showToast("eSF7 PDF Report downloaded successfully!");
    } catch (err) {
      console.error(err);
      if (showAlert) showAlert("PDF Export Failed", err.message || "Failed to generate eSF7 PDF report.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <section id="validation" className="view grid">
      <PortalHeader
        title="Validation Center & Digital Certification"
        description="Review data completeness, run compliance checks, and submit eSF7 with School Head E-Signature."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={() => {
          if (completeNode) completeNode('validation', null);
          if (showToast) showToast('eSF7 Quality Audit & Validation completed!', 'success');
        }}
        continueText="Mark Validation Complete ➔"
      />
      <article className="card">

        <div className="card-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--navy)' }}>Validation Center & Reports</h2>
              <p className="subtext" style={{ margin: '4px 0 0 0' }}>
                Review personnel record validation, verify teacher class programs, and export official DepEd eSF7 reports.
              </p>
            </div>
              <button
                className="btn"
                type="button"
                onClick={() => setShowPrintModal(true)}
                style={{
                  background: errors.length > 0 ? '#F8FAFC' : 'linear-gradient(180deg, #10b981, #059669)',
                  color: errors.length > 0 ? '#334155' : 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: errors.length > 0 ? '1.5px solid #CBD5E1' : 'none',
                  cursor: 'pointer',
                  boxShadow: errors.length > 0 ? 'none' : '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
                title={errors.length > 0 ? `Preview Draft Report (${errors.length} pending validation issues)` : "Print Official Certified eSF7 Report"}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {errors.length > 0 ? (
                    <>
                      <FiFileText size={15} /> <span>Preview Draft eSF7</span>
                    </>
                  ) : (
                    <>
                      <FiPrinter size={15} /> <span>Print Official eSF7 Report</span>
                    </>
                  )}
                </span>
                {errors.length > 0 && (
                  <span style={{ background: '#EF4444', color: 'white', fontSize: '10px', padding: '2px 7px', borderRadius: '10px', fontWeight: '800' }}>
                    {errors.length} Issues
                  </span>
                )}
              </button>
          </div>

          {/* Sub-Navigation Tabs */}
          <div style={{
            display: 'flex',
            gap: '10px',
            borderBottom: '2px solid var(--outline, #E2E8F0)',
            marginBottom: '20px',
            paddingBottom: '2px'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('validation')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '700',
                border: 'none',
                borderBottom: activeTab === 'validation' ? '3px solid var(--blue, #2563EB)' : '3px solid transparent',
                background: 'none',
                color: activeTab === 'validation' ? 'var(--blue, #2563EB)' : 'var(--muted, #64748B)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FiShield size={16} /> Validation Issues & Submission
              {errors.length > 0 && (
                <span style={{
                  background: '#EF4444',
                  color: 'white',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '800'
                }}>
                  {errors.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('view_preview')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '700',
                border: 'none',
                borderBottom: activeTab === 'view_preview' ? '3px solid var(--blue, #2563EB)' : '3px solid transparent',
                background: 'none',
                color: activeTab === 'view_preview' ? 'var(--blue, #2563EB)' : 'var(--muted, #64748B)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FiFileText size={16} /> Teacher Class Programs (VIEW Sheet Preview)
              <span style={{
                background: '#3B82F6',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: '800'
              }}>
                {personnel.filter(p => {
                  const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
                  return pType === 'teaching' || pType === 'teaching-related' || pType === 'related-teaching';
                }).length} Teachers
              </span>
            </button>
          </div>

          {activeTab === 'validation' ? (
            <>

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
              <div className="issue" style={{ borderLeftColor: 'var(--green)', background: '#F0FDF4', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiCheck size={16} /> All personnel records are fully validated and ready for submission!
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
                  {issue.category === 'Allowances & Financial Incentives' ? (
                    <span 
                      onClick={() => setActiveView('allowances')}
                      style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline', color: 'var(--blue)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Go to Allowances Portal →
                    </span>
                  ) : (issue.category === 'MATATAG Curriculum Compliance' || issue.category === 'Schedule Conflicts & Duplicate Subjects') ? (
                    <span 
                      onClick={() => {
                        if (issue.personId) setActivePersonnelId(issue.personId);
                        setActiveView('workload');
                      }}
                      style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline', color: 'var(--red, #b91c1c)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Go to Workload Builder →
                    </span>
                  ) : issue.personId && (
                    <span 
                      onClick={() => handleNavigateToPerson(issue.personId)}
                      style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline', color: 'var(--blue)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
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
                    <FiCheckCircle size={18} color="#166534" />
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
                        <FiRepeat size={14} /> Did you make changes and want to submit again?
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
                              <span style={{ fontSize: '12px', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}><FiCheckCircle size={14} /> E-Signature Attached & Verified</span>
                              <span style={{ fontSize: '11px', color: '#64748B' }}>Click "Re-sign" to draw or upload a new signature image.</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setShowSignatureModal(true)}
                              style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1.5px solid var(--blue, #2563EB)', background: '#EFF6FF', color: 'var(--blue, #2563EB)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <FiEdit3 size={13} /> Re-sign
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
                          <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'center' }}><FiEdit3 size={28} color="var(--blue, #2563EB)" /></div>
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
                      boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <FiUploadCloud size={16} /> Submit Certified eSF7 to Queue
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      ) : (
        /* ================= VIEW SHEET & TEACHER CLASS PROGRAM PREVIEW ================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* NOTE: Teacher Class Programs lock banner commented out for development mode
          {errors.length > 0 && (
            <div style={{
              background: '#FEF2F2',
              border: '1.5px solid #FCA5A5',
              borderRadius: '14px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🔒</span>
                <div>
                  <strong style={{ color: '#991B1B', fontSize: '14px', display: 'block' }}>
                    Teacher Class Programs Locked from Formal Certification ({errors.length} Blocking Issues)
                  </strong>
                  <span style={{ color: '#B91C1C', fontSize: '12px' }}>
                    Schedules cannot be officially certified or signed by the School Head until all pending validation errors are resolved.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveTab('validation')}
                style={{
                  background: '#DC2626',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Resolve Issues →
              </button>
            </div>
          )}
          */}

          {/* Header Metadata Card Matching Official DepEd SF7 Template */}
          <div style={{
            background: 'white',
            border: '2px solid #1E40AF',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.08)',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              {/* DepEd Official Logo */}
              <div style={{ flexShrink: 0, paddingLeft: '8px' }}>
                <img
                  src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/deped.png`}
                  alt="DepEd Official Seal Logo"
                  style={{ height: '80px', width: 'auto', objectFit: 'contain', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>

              {/* Title & Metadata Grid */}
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '900', color: 'var(--navy)' }}>
                    School Form 7 (SF7) School Personnel Assignment List and Basic Profile
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', display: 'block' }}>
                    (This replaces Form 12-Monthly Status Report for Teachers, Form 19-Assignment List, Form 29-Teacher Program and Form 31-Summary Information of Teachers)
                  </span>
                </div>

                {/* Outlined Input Box Metadata Grid Matching Screenshot */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--navy)' }}>
                  {/* Row 1: School ID, Region, Division */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--muted)' }}>School ID</span>
                      <div style={{ border: '1.5px solid #0F172A', borderRadius: '4px', padding: '3px 14px', minWidth: '130px', textAlign: 'center', fontWeight: '800', background: '#F8FAFC' }}>
                        {schoolInfo?.schoolId || schoolInfo?.school_id || '108348'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--muted)' }}>Region</span>
                      <div style={{ border: '1.5px solid #0F172A', borderRadius: '4px', padding: '3px 14px', minWidth: '100px', textAlign: 'center', fontWeight: '800', background: '#F8FAFC' }}>
                        {schoolInfo?.region || 'REGION IV-A'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--muted)' }}>Division</span>
                      <div style={{ border: '1.5px solid #0F172A', borderRadius: '4px', padding: '3px 14px', minWidth: '180px', textAlign: 'center', fontWeight: '800', background: '#F8FAFC' }}>
                        {schoolInfo?.division || 'LAGUNA'}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: School Name, District, School Year */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--muted)' }}>School Name</span>
                      <div style={{ border: '1.5px solid #0F172A', borderRadius: '4px', padding: '3px 14px', minWidth: '240px', textAlign: 'center', fontWeight: '800', background: '#F8FAFC' }}>
                        {schoolInfo?.schoolName || schoolInfo?.school_name || 'MAJAYJAY ELEMENTARY SCHOOL'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--muted)' }}>District</span>
                      <div style={{ border: '1.5px solid #0F172A', borderRadius: '4px', padding: '3px 14px', minWidth: '140px', textAlign: 'center', fontWeight: '800', background: '#F8FAFC' }}>
                        {schoolInfo?.district || 'MAJAYJAY'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--muted)' }}>School Year</span>
                      <div style={{ border: '1.5px solid #0F172A', borderRadius: '4px', padding: '3px 14px', minWidth: '110px', textAlign: 'center', fontWeight: '800', background: '#F8FAFC' }}>
                        {schoolInfo?.schoolYear || schoolInfo?.school_year || 'SY 2026-2027'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Position Summary Tallies Table matching official eSF7 template */}
          <div style={{
            background: 'white',
            border: '1.5px solid var(--outline, #E2E8F0)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
          }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: '800', color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📊 Personnel Position Incumbent Summary (Per Position)
            </h4>
            {(() => {
              const teachingMap = {};
              const nonTeachingMap = {};
              const otherFundingRows = [];
              let totalTeachingCount = 0;
              let totalNonTeachingCount = 0;

              (personnel || []).forEach(p => {
                const pos = (p.position || p.plantilla_position || p.position_title || 'TEACHER I').toUpperCase().trim();
                const fund = String(p.fundSource || p.fund_source || 'NATIONAL').toUpperCase().trim();
                const isNational = fund === 'NATIONAL';

                if (isNational) {
                  const detectedType = detectPersonnelTypeFromPosition(pos) || p.type || 'teaching';
                  const isNonTeaching = ['non-teaching', 'NON-TEACHING'].includes(detectedType) || ['non-teaching', 'NON-TEACHING'].includes(p.type) || ['NON-TEACHING'].includes(p.positionCategory);
                  if (isNonTeaching) {
                    nonTeachingMap[pos] = (nonTeachingMap[pos] || 0) + 1;
                    totalNonTeachingCount++;
                  } else {
                    teachingMap[pos] = (teachingMap[pos] || 0) + 1;
                    totalTeachingCount++;
                  }
                } else {
                  // (C) Other Appointments and Funding Source (MOOE, SEF, LGU, PTA, NGO, OTHERS, etc.)
                  otherFundingRows.push({
                    title: pos,
                    appointment: String(p.natureOfAppointment || p.nature_of_appointment || p.hiringArrangement || p.hiring_arrangement || 'JOB ORDER / COS').toUpperCase(),
                    fundSource: fund
                  });
                }
              });

              const activeTeachingRows = Object.keys(teachingMap).map(t => ({ title: t, count: teachingMap[t] }));
              const activeNonTeachingRows = Object.keys(nonTeachingMap).map(t => ({ title: t, count: nonTeachingMap[t] }));
              const maxRows = Math.max(activeTeachingRows.length, activeNonTeachingRows.length, otherFundingRows.length, 6);

              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1.5px solid #0F172A' }}>
                    <thead>
                      <tr style={{ background: '#F1F5F9', textAlign: 'center', fontWeight: '800', color: 'var(--navy)' }}>
                        <th colSpan="2" style={{ border: '1px solid #CBD5E1', padding: '8px', width: '34%' }}>
                          (A) Nationally-Funded Teaching & Teaching Related Items
                        </th>
                        <th colSpan="2" style={{ border: '1px solid #CBD5E1', padding: '8px', width: '33%' }}>
                          (B) Nationally-Funded Non Teaching Items
                        </th>
                        <th colSpan="3" style={{ border: '1px solid #CBD5E1', padding: '8px', width: '33%' }}>
                          (C) Other Appointments and Funding Source
                        </th>
                      </tr>
                      <tr style={{ background: '#F8FAFC', fontSize: '10px', textAlign: 'center', fontWeight: '700', color: '#475569' }}>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px' }}>Title of Plantilla Position</th>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px', width: '60px' }}>Incumbents</th>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px' }}>Title of Plantilla Position</th>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px', width: '60px' }}>Incumbents</th>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px' }}>Title of Position</th>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px' }}>Appointment</th>
                        <th style={{ border: '1px solid #CBD5E1', padding: '6px' }}>Fund Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxRows }).map((_, rIdx) => {
                        const tItem = activeTeachingRows[rIdx];
                        const ntItem = activeNonTeachingRows[rIdx];
                        const otherItem = otherFundingRows[rIdx];

                        return (
                          <tr key={rIdx} style={{ textAlign: 'left', height: '22px' }}>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', fontWeight: '600', color: '#0F172A' }}>
                              {tItem ? tItem.title : ''}
                            </td>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', textAlign: 'center', fontWeight: '800', color: '#047857' }}>
                              {tItem ? tItem.count : ''}
                            </td>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', fontWeight: '600', color: '#0F172A' }}>
                              {ntItem ? ntItem.title : ''}
                            </td>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', textAlign: 'center', fontWeight: '800', color: '#1D4ED8' }}>
                              {ntItem ? ntItem.count : ''}
                            </td>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', fontWeight: '600', color: otherItem ? '#0F172A' : '#94A3B8' }}>
                              {otherItem ? otherItem.title : ''}
                            </td>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', color: otherItem ? '#334155' : '#94A3B8' }}>
                              {otherItem ? otherItem.appointment : ''}
                            </td>
                            <td style={{ border: '1px solid #E2E8F0', padding: '4px 8px', fontWeight: otherItem ? '700' : 'normal', color: otherItem ? '#D97706' : '#94A3B8' }}>
                              {otherItem ? otherItem.fundSource : ''}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ fontWeight: '800', background: '#F1F5F9', color: 'var(--navy)' }}>
                        <td style={{ border: '1px solid #CBD5E1', padding: '6px 8px', textTransform: 'uppercase' }}>TOTAL</td>
                        <td style={{ border: '1px solid #CBD5E1', padding: '6px 8px', textAlign: 'center', color: '#047857', fontSize: '13px' }}>{totalTeachingCount}</td>
                        <td style={{ border: '1px solid #CBD5E1', padding: '6px 8px', textTransform: 'uppercase' }}>TOTAL</td>
                        <td style={{ border: '1px solid #CBD5E1', padding: '6px 8px', textAlign: 'center', color: '#1D4ED8', fontSize: '13px' }}>{totalNonTeachingCount}</td>
                        <td colSpan="3" style={{ border: '1px solid #CBD5E1', padding: '6px 8px', textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                          {otherFundingRows.length > 0 ? `TOTAL (OTHER): ${otherFundingRows.length}` : ''}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Search & Filter Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
              <input
                type="text"
                placeholder="🔍 Search teacher name, TIN, position, or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--outline, #CBD5E1)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setPosFilter('ALL')}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: posFilter === 'ALL' ? 'var(--blue, #2563EB)' : 'white',
                  color: posFilter === 'ALL' ? 'white' : '#475569',
                  cursor: 'pointer'
                }}
              >
                All Teaching & Related
              </button>
              <button
                type="button"
                onClick={() => setPosFilter('TEACHING')}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: posFilter === 'TEACHING' ? 'var(--blue, #2563EB)' : 'white',
                  color: posFilter === 'TEACHING' ? 'white' : '#475569',
                  cursor: 'pointer'
                }}
              >
                Teaching Only
              </button>
              <button
                type="button"
                onClick={() => setPosFilter('TEACHING_RELATED')}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: posFilter === 'TEACHING_RELATED' ? 'var(--blue, #2563EB)' : 'white',
                  color: posFilter === 'TEACHING_RELATED' ? 'white' : '#475569',
                  cursor: 'pointer'
                }}
              >
                Related-Teaching Only
              </button>
            </div>
          </div>

          {/* Personnel Teacher Class Program List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {personnel
              .filter(p => {
                const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
                // Strictly exclude non-teaching personnel from Teacher Class Programs
                if (pType === 'non-teaching') return false;
                
                if (posFilter === 'TEACHING' && pType !== 'teaching') return false;
                if (posFilter === 'TEACHING_RELATED' && pType !== 'teaching-related' && pType !== 'related-teaching') return false;
                
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                const name = `${p.firstName} ${p.lastName} ${p.tin} ${p.position}`.toLowerCase();
                const hasSubj = (p.workloadRows || []).some(w => (w.subject || w.task || '').toLowerCase().includes(q));
                return name.includes(q) || hasSubj;
              })
              .map((p, pIdx) => {
                const isExpanded = expandedTeacherId === p.id || searchQuery.length > 0;
                const workloads = p.workloadRows || [];
                let teacherTotalMins = 0;

                return (
                  <div
                    key={p.id || pIdx}
                    style={{
                      background: 'white',
                      border: '1.5px solid var(--outline, #E2E8F0)',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Teacher Summary Header Row */}
                    <div
                      onClick={() => setExpandedTeacherId(expandedTeacherId === p.id ? null : p.id)}
                      style={{
                        padding: '16px 20px',
                        background: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: isExpanded ? '1.5px solid #E2E8F0' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '15px'
                        }}>
                          {(p.firstName || 'T').charAt(0)}{(p.lastName || '').charAt(0)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '15px', color: 'var(--navy)' }}>
                              {p.lastName}, {p.firstName} {p.middleName ? `${p.middleName.charAt(0)}.` : ''}
                            </strong>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              background: '#DBEAFE',
                              color: '#1E40AF',
                              padding: '2px 8px',
                              borderRadius: '6px'
                            }}>
                              {p.position || 'TEACHER I'}
                            </span>
                            <span style={{
                              fontSize: '10.5px',
                              fontWeight: '800',
                              background: String(p.fundSource || p.fund_source || 'NATIONAL').toUpperCase() === 'NATIONAL' ? '#ECFDF5' : '#FEF3C7',
                              color: String(p.fundSource || p.fund_source || 'NATIONAL').toUpperCase() === 'NATIONAL' ? '#047857' : '#B45309',
                              border: String(p.fundSource || p.fund_source || 'NATIONAL').toUpperCase() === 'NATIONAL' ? '1px solid #A7F3D0' : '1px solid #FCD34D',
                              padding: '2px 7px',
                              borderRadius: '6px'
                            }}>
                              FUND: {String(p.fundSource || p.fund_source || 'NATIONAL').toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                            TIN: <strong>{p.tin || p.philsysNo || 'N/A'}</strong> · {p.natureOfAppointment || 'REGULAR PERMANENT'} · {p.collegeDegree || 'BACHELOR DEGREE'} ({p.major || 'GENERAL'})
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>
                            Assigned Workloads
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>
                            {workloads.length} Slots
                          </strong>
                        </div>
                        <span style={{ fontSize: '18px', color: 'var(--muted)' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Teacher Workload Detail Table */}
                    {isExpanded && (
                      <div style={{ padding: '16px 20px', background: 'white' }}>
                        {workloads.length === 0 ? (
                          <div style={{ padding: '16px', textTransform: 'uppercase', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                            No active workload rows assigned yet.
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F1F5F9', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  <th style={{ padding: '10px 12px' }}>Subject / Assignment</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Grade</th>
                                  <th style={{ padding: '10px 12px' }}>Section</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Days</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>From</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>To</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Weekly Mins</th>
                                </tr>
                              </thead>
                              <tbody>
                                {workloads.map((w, wIdx) => {
                                  const startStr = w.startTime || w.start_time || '07:30';
                                  const endStr   = w.endTime || w.end_time || '08:15';
                                  const sMins    = parseInt(startStr.split(':')[0] || 0) * 60 + parseInt(startStr.split(':')[1] || 0);
                                  const eMins    = parseInt(endStr.split(':')[0] || 0) * 60 + parseInt(endStr.split(':')[1] || 0);
                                  const dailyMins = Math.max(0, eMins - sMins);
                                  const daysArr  = Array.isArray(w.days) ? w.days : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
                                  const weeklyMins = dailyMins * (daysArr.length || 5);
                                  teacherTotalMins += weeklyMins;

                                  const format12Hr = (timeStr) => {
                                    if (!timeStr) return '';
                                    if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) return timeStr;
                                    const parts = timeStr.split(':');
                                    let h = parseInt(parts[0], 10);
                                    const m = parts[1] || '00';
                                    if (isNaN(h)) return timeStr;
                                    const ampm = h >= 12 ? 'PM' : 'AM';
                                    h = h % 12;
                                    if (h === 0) h = 12;
                                    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
                                  };

                                  const rawGrade = w.gradeLevel || w.grade_level || (p.type === 'non-teaching' || (p.position || '').toUpperCase().includes('PRINCIPAL') ? 'NG' : '4');
                                  let gradeVal   = String(rawGrade).trim();
                                  if (gradeVal.toUpperCase() === 'NG' || gradeVal.toUpperCase().includes('NON')) {
                                    gradeVal = 'NG';
                                  } else if (gradeVal.toUpperCase().includes('KINDER') || gradeVal.toUpperCase() === 'K') {
                                    gradeVal = 'K';
                                  } else {
                                    const m = gradeVal.match(/\d+/);
                                    if (m) gradeVal = m[0];
                                  }
                                   const matchedSec = (classSections || []).find(s => String(s.id) === String(w.sectionId)) || 
                                                      (classSections || []).find(s => String(s.adviserId || s.adviser_id) === String(p.id));
                                   const secVal   = (w.sectionName || w.section_name || matchedSec?.sectionName || matchedSec?.section_name || (w.subject === 'ADVISORY' || w.subject === 'HGP' ? 'ADVISORY SECTION' : 'GENERIC')).toUpperCase();

                                  return (
                                    <tr key={w.id || wIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                      <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--navy)' }}>
                                        {w.subject || w.subject_name || w.task || 'TEACHING'}
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#1E40AF' }}>
                                        {gradeVal}
                                      </td>
                                      <td style={{ padding: '10px 12px', color: '#0F172A', fontWeight: '700' }}>
                                        {secVal}
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                          {['M', 'T', 'W', 'TH', 'F'].map(code => {
                                            const str = daysArr.map(d => String(d).toUpperCase()).join(' ');
                                            let active = false;
                                            if (code === 'M') active = str.includes('MON') || str.includes('M');
                                            if (code === 'T') active = str.includes('TUE') || str.includes('T');
                                            if (code === 'W') active = str.includes('WED') || str.includes('W');
                                            if (code === 'TH') active = str.includes('THU') || str.includes('TH');
                                            if (code === 'F') active = str.includes('FRI') || str.includes('F');

                                            return (
                                              <span key={code} style={{
                                                padding: '2px 5px',
                                                fontSize: '10px',
                                                fontWeight: '800',
                                                borderRadius: '4px',
                                                background: active ? '#2563EB' : '#E2E8F0',
                                                color: active ? 'white' : '#94A3B8'
                                              }}>
                                                {code}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: '600' }}>
                                        {format12Hr(startStr)}
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: '600' }}>
                                        {format12Hr(endStr)}
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800', color: '#059669' }}>
                                        {weeklyMins} min
                                      </td>
                                    </tr>
                                  );
                                })}
                                <tr style={{ background: '#F8FAFC', fontWeight: '800', borderTop: '2px solid #CBD5E1' }}>
                                  <td colSpan="6" style={{ padding: '10px 12px', textAlign: 'right', textTransform: 'uppercase', color: 'var(--navy)' }}>Total Teaching Minutes</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#047857', fontSize: '15px' }}>{teacherTotalMins} min</td>
                                </tr>
                              </tbody>
                            </table>

                            <div style={{
                              marginTop: '12px',
                              padding: '10px 14px',
                              background: '#F0FDF4',
                              borderRadius: '8px',
                              border: '1px solid #BBF7D0',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: '#166534', textTransform: 'uppercase' }}>
                                Total Workload Minutes / Week
                              </span>
                              <strong style={{ fontSize: '15px', color: '#15803D' }}>
                                {teacherTotalMins} Mins ({(teacherTotalMins / 60).toFixed(1)} Hours/Week)
                              </strong>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
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
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FiEdit3 size={14} /> Draw Signature
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
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FiUploadCloud size={14} /> Upload Image
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
                style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(180deg, #0284c7, #0369a1)', color: 'white', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FiCheck size={16} /> Apply Signature
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTML Printable Report Modal Overlay */}
      <ESF7PrintableReportModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        schoolInfo={schoolInfo}
        personnel={personnel}
        signature={signature}
        isLocked={errors.length > 0}
        errorsCount={errors.length}
      />

      {/* Official Certified Submission Success Modal */}
      {showSuccessModal && submissionDetails && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            textAlign: 'center'
          }}>
            {/* Modal Header Bar with Close Button */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '16px 20px 0 20px'
            }}>
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748B',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.color = '#0F172A'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; }}
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Hero Content */}
            <div style={{ padding: '0 32px 28px 32px' }}>
              <div style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 24px -6px rgba(16, 185, 129, 0.45)',
                margin: '0 auto 18px auto'
              }}>
                <FiCheckCircle size={42} color="#ffffff" />
              </div>

              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ECFDF5',
                color: '#047857',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '800',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '10px',
                border: '1px solid #A7F3D0'
              }}>
                <FiAward size={13} /> Official Submission Confirmed
              </span>

              <h2 style={{
                fontSize: '22px',
                fontWeight: '800',
                color: '#0F172A',
                marginBottom: '8px',
                letterSpacing: '-0.02em'
              }}>
                eSF7 Certified & Submitted!
              </h2>

              <p style={{
                fontSize: '13px',
                color: '#64748B',
                lineHeight: '1.5',
                marginBottom: '24px'
              }}>
                Your Electronic School Form 7 has been successfully verified, electronically certified, and committed to the official database.
              </p>

              {/* Summary Metadata Card */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '16px 20px',
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                marginBottom: '24px'
              }}>
                <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                    School Name & ID
                  </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>
                    {submissionDetails.schoolName} ({submissionDetails.schoolId})
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                    School Year
                  </span>
                  <strong style={{ fontSize: '13px', color: '#1E293B' }}>
                    {submissionDetails.schoolYear}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                    Certified By
                  </span>
                  <strong style={{ fontSize: '13px', color: '#1E293B' }}>
                    {submissionDetails.certifiedBy}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                    Total Faculty
                  </span>
                  <strong style={{ fontSize: '13px', color: '#1E293B' }}>
                    {submissionDetails.personnelCount} Personnel Records
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
                    Organized Classes
                  </span>
                  <strong style={{ fontSize: '13px', color: '#1E293B' }}>
                    {submissionDetails.sectionsCount} Sections
                  </strong>
                </div>

                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #E2E8F0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <FiClock size={13} /> {submissionDetails.certifiedAt}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#059669', background: '#DEF7EC', padding: '2px 8px', borderRadius: '8px' }}>
                    Job #{submissionDetails.jobId} · COMPLETED
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSuccessModal(false);
                    setShowPrintModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.4)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)'; }}
                >
                  <FiPrinter size={16} /> Print Official Certified eSF7 Report
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      handleExportXLSB();
                    }}
                    style={{
                      padding: '11px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid #BBF7D0',
                      background: '#F0FDF4',
                      color: '#166534',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#DCFCE7'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#F0FDF4'; }}
                  >
                    <FiDownload size={14} /> Download .XLSB
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSuccessModal(false);
                      setActiveView('dashboard');
                    }}
                    style={{
                      padding: '11px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
                  >
                    <FiHome size={14} /> Go to Dashboard
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSuccessModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748B',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: '6px',
                    marginTop: '4px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#0F172A'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B'; }}
                >
                  Close and Stay on Submission Center
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

