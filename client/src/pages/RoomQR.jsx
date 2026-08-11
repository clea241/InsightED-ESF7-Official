import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { get10MinPasscode } from '../utils/passcode';

export default function RoomQR() {
  const { scannedRoom, setScannedRoom, personnel, updatePersonnelInfo, savePersonnelChanges } = useApp();
  const [selectedRoom, setSelectedRoom] = useState(scannedRoom || 'Faculty Room 1');
  const [copied, setCopied] = useState(false);

  // Scanning & Ingestion state
  const [scanning, setScanning] = useState(false);
  const [ingestionSuccess, setIngestionSuccess] = useState('');
  const qrScannerRef = useRef(null);

  // Pending cross-tab QR submissions detected locally
  const [pendingSubmissions, setPendingSubmissions] = useState([]);

  // Review Modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingReviewData, setPendingReviewData] = useState(null);

  // Simulation state
  const [simSelectedId, setSimSelectedId] = useState('');
  const [simEligText, setSimEligText] = useState('RA 1080 (MECHANICAL ENGINEER)');
  const [simCivilStatus, setSimCivilStatus] = useState('Married');

  // Search state for passcodes
  const [passcodeSearch, setPasscodeSearch] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState(null);

  // Masking & 10-minute rotation state
  const [revealedIds, setRevealedIds] = useState([]);
  const [allRevealed, setAllRevealed] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(600);

  useEffect(() => {
    const calcRemaining = () => 600 - (Math.floor(Date.now() / 1000) % 600);
    setTimeLeftSeconds(calcRemaining());

    const interval = setInterval(() => {
      setTimeLeftSeconds(calcRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (totalSecs) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Auto-generate missing passcodes for personnel who don't have one yet
  useEffect(() => {
    if (Array.isArray(personnel) && personnel.length > 0) {
      personnel.forEach(p => {
        if (!p.profilingCode && !p.profiling_code && !p.passcode) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let code = '';
          for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          updatePersonnelInfo(p.id, { profilingCode: code });
        }
      });
    }
  }, [personnel]);

  const getPortalUrl = (roomName) => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    return `${origin}${path}?view=room-profiling&room=${encodeURIComponent(roomName)}`;
  };

  const handleCopyLink = () => {
    const url = getPortalUrl(selectedRoom);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSimulateScanLink = () => {
    setScannedRoom(selectedRoom);
    const url = getPortalUrl(selectedRoom);
    window.open(url, '_blank');
  };

  const decompressProfile = (short) => {
    return {
      id: short.id,
      firstName: short.fn,
      lastName: short.ln,
      middleName: short.mn,
      sexAtBirth: short.sx,
      civilStatus: short.cs,
      soloParent: short.sp,
      religion: short.rl,
      ethnicGroup: short.eg,
      birthdate: short.bd,
      philsysNo: short.ps,
      type: short.ty,
      position: short.psn,
      fundSource: short.fs,
      natureOfAppointment: short.na,
      noTin: short.nt,
      tin: short.tn,
      collegeDegree: short.cd,
      major: short.mj,
      minor: short.mr,
      eligibility: short.el,
      prcSpecialization: short.pr,
      neapTrainingRows: short.ntr || [],
      certificationRows: short.ctr || [],
      otherTrainingRows: short.otr || []
    };
  };

  const handleIngestData = (compressedData) => {
    try {
      const fullProfile = decompressProfile(compressedData);
      setPendingReviewData(fullProfile);
      setShowReviewModal(true);
    } catch (err) {
      console.error(err);
      alert('Error parsing scanned data. Make sure it is a valid InsightED QR.');
    }
  };

  // Load pending submissions from localStorage
  const loadPendingSubmissions = () => {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pending_submission_')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          items.push(val);
        } catch (e) {}
      }
    }
    setPendingSubmissions(items);
  };

  useEffect(() => {
    loadPendingSubmissions();
    window.addEventListener('storage', loadPendingSubmissions);
    const interval = setInterval(loadPendingSubmissions, 2000);
    return () => {
      window.removeEventListener('storage', loadPendingSubmissions);
      clearInterval(interval);
    };
  }, []);

  // File Upload QR Code Reader
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    scanImageFile(file);
  };

  const scanImageFile = (file) => {
    const performScan = () => {
      try {
        const html5QrCode = new window.Html5Qrcode("file-scanner-temp");
        html5QrCode.scanFile(file, false)
          .then(decodedText => {
            try {
              const parsed = JSON.parse(decodedText);
              if (parsed && parsed.id) {
                handleIngestData(parsed);
                const fileInput = document.getElementById('qr-image-upload');
                if (fileInput) fileInput.value = '';
              }
            } catch (e) {
              alert("QR image scanned successfully, but it does not contain valid InsightED data.");
            }
          })
          .catch(err => {
            console.error(err);
            alert("Could not find a QR code in this image. Please select a clear, high-contrast QR code image.");
          });
      } catch (err) {
        console.error(err);
      }
    };

    if (!window.Html5Qrcode) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode';
      script.onload = performScan;
      document.body.appendChild(script);
    } else {
      performScan();
    }
  };

  // Start webcam scanner
  const startCameraScan = () => {
    setScanning(true);
    setIngestionSuccess('');
    
    const initScanner = () => {
      setTimeout(() => {
        try {
          const scanner = new window.Html5Qrcode("scanner-video");
          qrScannerRef.current = scanner;
          
          scanner.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 220, height: 220 }
            },
            (decodedText) => {
              try {
                const parsed = JSON.parse(decodedText);
                if (parsed && parsed.id) {
                  handleIngestData(parsed);
                  stopCameraScan();
                }
              } catch (e) {
                console.error("Invalid JSON inside scanned QR", e);
              }
            },
            (errorMessage) => {}
          ).catch(err => {
            console.error("Camera start failed", err);
            alert("Could not open camera. Please check browser permissions.");
            setScanning(false);
          });
        } catch (err) {
          console.error("Scanner setup error", err);
          setScanning(false);
        }
      }, 300);
    };

    if (!window.Html5Qrcode) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode';
      script.onload = initScanner;
      document.body.appendChild(script);
    } else {
      initScanner();
    }
  };

  const stopCameraScan = () => {
    if (qrScannerRef.current) {
      qrScannerRef.current.stop().then(() => {
        setScanning(false);
        qrScannerRef.current = null;
      }).catch(err => {
        console.error("Failed to stop scanner", err);
        setScanning(false);
      });
    } else {
      setScanning(false);
    }
  };

  const handleSimulatedSubmission = () => {
    if (!simSelectedId) {
      alert("Please select a teacher to simulate.");
      return;
    }
    const teacher = personnel.find(p => p.id === simSelectedId);
    if (!teacher) return;

    const simulatedCompressed = {
      id: teacher.id,
      fn: teacher.firstName,
      ln: teacher.lastName,
      mn: teacher.middleName,
      sx: teacher.sexAtBirth,
      cs: simCivilStatus,
      sp: teacher.soloParent,
      rl: teacher.religion,
      eg: teacher.ethnicGroup,
      bd: teacher.birthdate,
      ps: teacher.philsysNo,
      ty: teacher.type,
      psn: teacher.position,
      fs: teacher.fundSource,
      na: teacher.natureOfAppointment,
      nt: teacher.noTin,
      tn: teacher.tin,
      cd: teacher.collegeDegree,
      mj: teacher.major,
      mr: teacher.minor,
      el: simEligText,
      pr: teacher.prcSpecialization
    };

    handleIngestData(simulatedCompressed);
  };

  // Commit reviewed data to central context
  const handleCommitReview = async () => {
    if (pendingReviewData) {
      await savePersonnelChanges(pendingReviewData.id, {
        ...pendingReviewData,
        personalVerified: true
      });
      
      // Clean up localStorage keys if they exist
      localStorage.removeItem(`pending_submission_${pendingReviewData.id}`);
      loadPendingSubmissions();

      setIngestionSuccess(`✓ Approved & Merged: Profiling details for ${pendingReviewData.firstName} ${pendingReviewData.lastName} have been successfully saved locally!`);
      setShowReviewModal(false);
      setPendingReviewData(null);
      setTimeout(() => setIngestionSuccess(''), 6000);
    }
  };

  // Compile comparison rows between database and submitted QR data
  const getComparisonRows = () => {
    if (!pendingReviewData) return [];
    
    // Find current record in DB
    const current = personnel.find(p => p.id === pendingReviewData.id) || {};

    const fields = [
      { label: 'First Name', key: 'firstName' },
      { label: 'Last Name', key: 'lastName' },
      { label: 'Middle Name', key: 'middleName' },
      { label: 'Sex at Birth', key: 'sexAtBirth' },
      { label: 'Civil Status', key: 'civilStatus' },
      { label: 'Solo Parent?', key: 'soloParent' },
      { label: 'Religion', key: 'religion' },
      { label: 'Birthdate', key: 'birthdate' },
      { label: 'TIN Number', key: 'tin', format: (v, item) => item.noTin ? 'No TIN (N/A)' : (v || 'N/A') },
      { label: 'College Degree', key: 'collegeDegree' },
      { label: 'Major', key: 'major' },
      { label: 'Minor', key: 'minor' },
      { label: 'Eligibilities', key: 'eligibility' },
      { label: 'PRC Specialization', key: 'prcSpecialization' }
    ];

    return fields.map(f => {
      const curVal = f.format ? f.format(current[f.key], current) : current[f.key];
      const subVal = f.format ? f.format(pendingReviewData[f.key], pendingReviewData) : pendingReviewData[f.key];
      const hasChanged = String(curVal || '').trim().toUpperCase() !== String(subVal || '').trim().toUpperCase();
      
      return {
        label: f.label,
        current: curVal || 'N/A',
        submitted: subVal || 'N/A',
        hasChanged
      };
    });
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(e => console.log(e));
      }
    };
  }, []);

  const comparisonRows = getComparisonRows();
  const hasChangesDetected = comparisonRows.some(r => r.hasChanged);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gap: '24px' }}>
      
      {/* Status Messages */}
      {ingestionSuccess && (
        <div style={{ padding: '16px', background: '#D4EDDA', color: '#155724', border: '1.5px solid #C3E6CB', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>💚</span> {ingestionSuccess}
        </div>
      )}



      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Column: Admin QR Poster & Setup */}
        <div style={{ display: 'grid', gap: '20px' }}>
          
          <article className="card">
            <div className="card-inner" style={{ display: 'grid', gap: '16px' }}>
              <h2>1. Room Poster QR Generator</h2>
              <p className="subtext">Select a room and place this QR code poster outside. Teachers scan it to load the profiling page on their device.</p>
              
              <div style={{ display: 'grid', gap: '6px' }}>
                <label>Assigned Room Name</label>
                <input
                  type="text"
                  placeholder="e.g. Grade 10 Advisory Room"
                  value={selectedRoom}
                  onChange={(e) => {
                    setSelectedRoom(e.target.value);
                    setScannedRoom(e.target.value);
                  }}
                />
              </div>

              {/* Dynamic Room QR Code Display */}
              <div style={{ 
                margin: '12px auto', 
                padding: '16px', 
                background: 'white', 
                border: '1.5px solid var(--line)', 
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                boxShadow: '0 8px 16px rgba(8, 49, 95, 0.05)',
                boxSizing: 'border-box'
              }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getPortalUrl(selectedRoom))}`}
                  alt="Room QR Code"
                  style={{ width: '150px', height: '150px', borderRadius: '8px', border: '1.5px solid var(--line)' }}
                />
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--navy)' }}>
                  ROOM QR POSTER
                </span>
                
                {/* Clickable Link directly under QR */}
                <a 
                  href={getPortalUrl(selectedRoom)} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ 
                    fontSize: '11px', 
                    color: 'var(--blue)', 
                    fontWeight: 700, 
                    textDecoration: 'underline', 
                    marginTop: '4px', 
                    wordBreak: 'break-all', 
                    textAlign: 'center',
                    maxWidth: '100%'
                  }}
                >
                  {getPortalUrl(selectedRoom)}
                </a>
              </div>

              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
                <button className="btn" onClick={handleSimulateScanLink}>
                  🔗 Simulate Scan
                </button>
                <button className="btn secondary" onClick={handleCopyLink}>
                  {copied ? '✓ Copied' : '📋 Copy Link'}
                </button>
              </div>
            </div>
          </article>

          {/* Pending Submissions Dropdown Box */}
          <article className="card" style={{ border: '2.5px solid var(--blue-400)', background: 'var(--blue-50)' }}>
            <div className="card-inner" style={{ display: 'grid', gap: '10px' }}>
              <h2 style={{ fontSize: '16px', color: 'var(--navy)' }}>📨 Detected Local Submissions</h2>
              <p className="subtext" style={{ fontSize: '12px' }}>
                InsightED automatically detects when a teacher completes profiling in the other tab. Choose their name to review and validate it!
              </p>

              {pendingSubmissions.length > 0 ? (
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label htmlFor="pending-ingest-select" style={{ fontSize: '9px', fontWeight: 800 }}>Pending submissions</label>
                  <select
                    id="pending-ingest-select"
                    onChange={(e) => {
                      const val = pendingSubmissions.find(p => p.id === e.target.value);
                      if (val) {
                        handleIngestData(val);
                      }
                    }}
                    value=""
                    style={{ background: '#FFF', border: '1.5px solid var(--blue)', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    <option value="">-- Choose teacher submission to scan --</option>
                    {pendingSubmissions.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.ln.toUpperCase()}, {p.fn} (Pending Submission QR)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ padding: '12px', background: '#FFF', color: 'var(--muted)', borderRadius: '10px', fontSize: '12px', textAlign: 'center', border: '1.5px solid var(--line)' }}>
                  No pending teacher submissions detected yet. Open the teacher portal, submit a profile, and it will appear here.
                </div>
              )}
            </div>
          </article>

        </div>

        {/* Right Column: Scanner & Passcodes */}
        <div style={{ display: 'grid', gap: '20px' }}>
          
          {/* Scanner Panel */}
          <article className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h2>2. Scan Teacher Submissions</h2>
              <p className="subtext">Scan the Submission QR Code using your device's camera, or upload/drop a QR Code screenshot file.</p>
              
              {!scanning ? (
                <div style={{ display: 'grid', gap: '14px' }}>
                  
                  {/* Compact Webcam Option */}
                  <div style={{ 
                    border: '2px solid var(--line)', 
                    borderRadius: '16px', 
                    background: '#F0F9FF', 
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', justifyContent: 'center' }}>
                      <span style={{ fontSize: '24px' }}>📷</span>
                      <button className="btn" onClick={startCameraScan} style={{ minHeight: '38px', padding: '6px 16px' }}>
                        Scan with Webcam
                      </button>
                    </div>
                    
                    <div style={{ width: '100%', height: '1.5px', background: 'var(--line)' }}></div>
                    
                    {/* File Drop/Upload Option */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%' }}>
                      <label htmlFor="qr-image-upload" style={{ margin: 0, fontWeight: 800, color: 'var(--navy)', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📁</span> Upload QR Screenshot File:
                      </label>
                      <input 
                        type="file" 
                        id="qr-image-upload" 
                        accept="image/*"
                        onChange={handleFileChange}
                        style={{ fontSize: '12px', border: '1px solid var(--line)', background: '#F8FAFC', borderRadius: '8px', padding: '6px', width: '100%', maxWidth: '240px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  
                  {/* Hidden temporary div required by Html5Qrcode for file scanning */}
                  <div id="file-scanner-temp" style={{ display: 'none' }}></div>

                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ 
                    position: 'relative', 
                    width: '100%', 
                    maxWidth: '300px',
                    margin: '0 auto',
                    background: '#000', 
                    borderRadius: '12px', 
                    overflow: 'hidden',
                    aspectRatio: '4/3',
                    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
                  }}>
                    <div id="scanner-video" style={{ width: '100%', height: '100%' }}></div>
                  </div>
                  
                  <button className="btn danger" onClick={stopCameraScan} style={{ width: '100%', minHeight: '36px', padding: '6px' }}>
                    Cancel Scanning
                  </button>
                </div>
              )}
            </div>
          </article>

          {/* Roster Passcodes Management Card */}
          <article className="card" style={{ border: '2.5px solid var(--outline)' }}>
            <div className="card-inner" style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h2 style={{ margin: 0 }}>🔑 Teacher Passcodes</h2>
                <span style={{ background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  ⏱️ Rotates in {formatCountdown(timeLeftSeconds)}
                </span>
              </div>
              <p className="subtext" style={{ margin: 0 }}>
                Teachers must enter their unique 6-digit passcode to unlock their profiling forms. Codes dynamically rotate every 10 minutes.
              </p>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search teacher by name..."
                  value={passcodeSearch}
                  onChange={(e) => setPasscodeSearch(e.target.value)}
                  style={{ flex: 1, minHeight: '36px', padding: '6px 12px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  style={{ minHeight: '36px', fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => setAllRevealed(prev => !prev)}
                >
                  {allRevealed ? '🙈 Hide All' : '👁 Reveal All'}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ minHeight: '36px', fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    (personnel || []).forEach(p => {
                      const dynamic = get10MinPasscode(p.id, 0);
                      updatePersonnelInfo(p.id, { profilingCode: dynamic });
                    });
                  }}
                >
                  ⚡ Refresh
                </button>
              </div>

              <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: '12px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Teacher Name</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Passcode</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filteredList = (personnel || []).filter(p => {
                        const fn = (p.firstName || p.first_name || '').toLowerCase();
                        const ln = (p.lastName || p.last_name || '').toLowerCase();
                        const full = `${fn} ${ln} ${p.name || ''}`.toLowerCase();
                        return full.includes((passcodeSearch || '').toLowerCase());
                      });

                      if (filteredList.length === 0) {
                        return (
                          <tr>
                            <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                              {(personnel || []).length === 0 ? 'No personnel records loaded.' : 'No teachers matching search.'}
                            </td>
                          </tr>
                        );
                      }

                      return filteredList.map(p => {
                        const fName = p.firstName || p.first_name || '';
                        const lName = p.lastName || p.last_name || '';
                        const displayName = lName && fName ? `${lName.toUpperCase()}, ${fName}` : (lName || fName || p.name || 'TEACHER').toUpperCase();
                        const actualCode = p.profilingCode || get10MinPasscode(p, 0);
                        const isRevealed = allRevealed || revealedIds.includes(p.id);
                        const displayCode = isRevealed ? actualCode : '••••••';

                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{displayName}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: '800', color: 'var(--blue-600)', letterSpacing: '0.08em', fontSize: '13px' }}>
                              {displayCode}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevealedIds(prev =>
                                      prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                    );
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                                  title={isRevealed ? "Hide Passcode" : "Reveal Passcode"}
                                >
                                  {isRevealed ? '🙈' : '👁'}
                                </button>
                                <span style={{ color: '#CBD5E1' }}>|</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (actualCode && actualCode !== 'N/A') {
                                      navigator.clipboard.writeText(actualCode);
                                      setCopiedCodeId(p.id);
                                      setTimeout(() => setCopiedCodeId(null), 1500);
                                    }
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: copiedCodeId === p.id ? 'var(--emerald, #059669)' : 'var(--blue)',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {copiedCodeId === p.id ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </article>

        </div>

      </div>

      {/* Review & Validate QR Submission Modal */}
      {showReviewModal && pendingReviewData && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '680px', padding: '24px', background: 'white', borderRadius: '16px', border: '2.5px solid var(--outline)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-head" style={{ borderBottom: '1.5px solid var(--line)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--navy)' }}>🧐 Review Teacher Submission</h2>
              <span className="badge info">{pendingReviewData.id}</span>
            </div>
            
            <div className="modal-body" style={{ padding: 0, marginBottom: '20px' }}>
              <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                Review the profile differences submitted by <strong>{pendingReviewData.firstName} {pendingReviewData.lastName}</strong> from <strong>{scannedRoom || 'Faculty Room 1'}</strong>. Modified values are highlighted in green.
              </p>

              <div style={{ border: '1.5px solid var(--line)', borderRadius: '12px', overflow: 'hidden', background: '#FFFFFF' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--muted)' }}>Field Name</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--muted)' }}>Current Central Value</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--muted)' }}>New Scanned Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, index) => (
                      <tr 
                        key={index} 
                        style={{ 
                          borderBottom: '1px solid #E2E8F0',
                          background: row.hasChanged ? '#E6FFFA' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--navy)' }}>{row.label}</td>
                        <td style={{ padding: '10px 12px', color: '#64748B', textDecoration: row.hasChanged ? 'line-through' : 'none' }}>{row.current}</td>
                        <td style={{ padding: '10px 12px', fontWeight: row.hasChanged ? 'bold' : 'normal', color: row.hasChanged ? '#0F766E' : '#0F172A' }}>
                          {row.submitted} {row.hasChanged && <span style={{ marginLeft: '4px', fontSize: '10px', background: '#2DD4BF', color: '#0F766E', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase' }}>New</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!hasChangesDetected && (
                <div style={{ marginTop: '12px', padding: '10px', background: '#F8FAFC', color: 'var(--muted)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', border: '1px solid var(--line)' }}>
                  ✓ Checked: No changes detected. Submitted profile is identical to the current central record.
                </div>
              )}

              {((pendingReviewData.neapTrainingRows && pendingReviewData.neapTrainingRows.length > 0) ||
                (pendingReviewData.certificationRows && pendingReviewData.certificationRows.length > 0) ||
                (pendingReviewData.otherTrainingRows && pendingReviewData.otherTrainingRows.length > 0)) && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏅 Submitted Trainings ({
                    (pendingReviewData.neapTrainingRows?.length || 0) + 
                    (pendingReviewData.certificationRows?.length || 0) + 
                    (pendingReviewData.otherTrainingRows?.length || 0)
                  } records)</span>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: '12px', padding: '10px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {pendingReviewData.neapTrainingRows && pendingReviewData.neapTrainingRows.length > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--blue)', marginBottom: '4px', textTransform: 'uppercase' }}>NEAP Programs</div>
                        {pendingReviewData.neapTrainingRows.map((t, idx) => (
                          <div key={idx} style={{ fontSize: '11px', padding: '6px 8px', borderLeft: '3px solid var(--blue)', background: 'white', borderRadius: '4px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 'bold' }}>{t.title}</span> &middot; {t.startDate?.substring(0,10)} to {t.endDate?.substring(0,10)} &middot; {t.totalHours} hrs
                          </div>
                        ))}
                      </div>
                    )}
                    {pendingReviewData.certificationRows && pendingReviewData.certificationRows.length > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--amber)', marginBottom: '4px', textTransform: 'uppercase' }}>TESDA NC & Certifications</div>
                        {pendingReviewData.certificationRows.map((t, idx) => (
                          <div key={idx} style={{ fontSize: '11px', padding: '6px 8px', borderLeft: '3px solid var(--amber)', background: 'white', borderRadius: '4px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 'bold' }}>{t.title}</span> &middot; {t.startDate?.substring(0,10)} to {t.endDate?.substring(0,10)} &middot; {t.totalHours} hrs
                          </div>
                        ))}
                      </div>
                    )}
                    {pendingReviewData.otherTrainingRows && pendingReviewData.otherTrainingRows.length > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--purple)', marginBottom: '4px', textTransform: 'uppercase' }}>Other Programs</div>
                        {pendingReviewData.otherTrainingRows.map((t, idx) => (
                          <div key={idx} style={{ fontSize: '11px', padding: '6px 8px', borderLeft: '3px solid var(--purple)', background: 'white', borderRadius: '4px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 'bold' }}>{t.title}</span> &middot; {t.startDate?.substring(0,10)} to {t.endDate?.substring(0,10)} &middot; {t.totalHours} hrs
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1.5px solid var(--line)', paddingTop: '15px' }}>
              <button 
                className="btn secondary danger" 
                type="button" 
                onClick={() => {
                  setShowReviewModal(false);
                  setPendingReviewData(null);
                }}
                style={{ border: '1.5px solid var(--red)', color: 'var(--red)' }}
              >
                Reject & Discard
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleCommitReview}
              >
                Approve & Commit Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
