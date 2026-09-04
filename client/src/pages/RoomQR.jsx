import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { get10MinPasscode } from '../utils/passcode';
import { api } from '../services/api';
import PortalHeader from '../components/PortalHeader';
import { 
  FiBell, 
  FiCheck, 
  FiCheckCircle, 
  FiInbox, 
  FiKey, 
  FiClock, 
  FiEye, 
  FiEyeOff, 
  FiRefreshCw, 
  FiSmartphone, 
  FiFileText, 
  FiUserCheck, 
  FiAward,
  FiPrinter,
  FiDownload
} from 'react-icons/fi';

export default function RoomQR() {
  const { scannedRoom, setScannedRoom, personnel: appPersonnel, setPersonnel, updatePersonnelInfo, savePersonnelChanges, schoolInfo, setActiveView } = useApp() || {};

  const { user: authUser } = useAuth() || {};
  const effectivePersonnel = Array.isArray(appPersonnel) ? appPersonnel : [];
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

  const getPortalUrl = (roomName) => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const activeId = (schoolInfo?.schoolId && schoolInfo.schoolId !== '123456' ? schoolInfo.schoolId : null) ||
      authUser?.school_id ||
      authUser?.schoolId ||
      (effectivePersonnel && effectivePersonnel[0] && (effectivePersonnel[0].schoolId || effectivePersonnel[0].school_id)) ||
      localStorage.getItem('activeSchoolId') ||
      localStorage.getItem('school_id') ||
      localStorage.getItem('schoolId') ||
      schoolInfo?.schoolId ||
      '502624';

    return `${origin}${path}?view=room-profiling&room=${encodeURIComponent(roomName)}&schoolId=${encodeURIComponent(activeId)}`;
  };

  const getQrApiUrl = (roomName) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getPortalUrl(roomName))}`;
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

  const compressProfile = (full) => {
    if (!full) return {};
    return {
      id: full.id,
      fn: full.firstName || full.first_name,
      ln: full.lastName || full.last_name,
      mn: full.middleName || full.middle_name,
      sx: full.sexAtBirth || full.sex_at_birth,
      cs: full.civilStatus || full.civil_status,
      sp: full.soloParent || full.solo_parent,
      rl: full.religion,
      eg: full.ethnicGroup || full.ethnic_group,
      bd: full.birthdate,
      ps: full.philsysNo || full.philsys_no,
      ty: full.type,
      psn: full.position,
      fs: full.fundSource || full.fund_source,
      na: full.natureOfAppointment || full.nature_of_appointment,
      nt: full.noTin || full.no_tin,
      tn: full.tin,
      cd: full.collegeDegree || full.college_degree,
      mj: full.major,
      mr: full.minor,
      el: full.eligibility,
      pr: full.prcSpecialization || full.prc_specialization,
      ntr: full.neapTrainingRows || [],
      ctr: full.certificationRows || [],
      otr: full.otherTrainingRows || []
    };
  };

  const decompressProfile = (short) => {
    if (!short) return {};
    return {
      id: short.id,
      firstName: short.fn || short.firstName,
      lastName: short.ln || short.lastName,
      middleName: short.mn || short.middleName,
      sexAtBirth: short.sx || short.sexAtBirth,
      civilStatus: short.cs || short.civilStatus,
      soloParent: short.sp !== undefined ? short.sp : short.soloParent,
      religion: short.rl || short.religion,
      ethnicGroup: short.eg || short.ethnicGroup,
      birthdate: short.bd || short.birthdate,
      philsysNo: short.ps || short.philsysNo,
      type: short.ty || short.type,
      position: short.psn || short.position,
      fundSource: short.fs || short.fundSource,
      natureOfAppointment: short.na || short.natureOfAppointment,
      noTin: short.nt !== undefined ? short.nt : short.noTin,
      tin: short.tn || short.tin,
      collegeDegree: short.cd || short.collegeDegree,
      major: short.mj || short.major,
      minor: short.mr || short.minor,
      eligibility: short.el || short.eligibility,
      prcSpecialization: short.pr || short.prcSpecialization,
      neapTrainingRows: short.ntr || short.neapTrainingRows || [],
      certificationRows: short.ctr || short.certificationRows || [],
      otherTrainingRows: short.otr || short.otherTrainingRows || []
    };
  };

  const handleIngestData = (compressedOrFullData) => {
    try {
      let fullProfile;
      if (compressedOrFullData.rawProfile) {
        fullProfile = compressedOrFullData.rawProfile;
      } else if (compressedOrFullData.firstName || compressedOrFullData.first_name) {
        fullProfile = compressedOrFullData;
      } else {
        fullProfile = decompressProfile(compressedOrFullData);
      }
      setPendingReviewData(fullProfile);
      setShowReviewModal(true);
    } catch (err) {
      console.error(err);
      alert('Error parsing scanned data. Make sure it is a valid InsightED QR.');
    }
  };

  const activeSchoolId = String(
    (schoolInfo?.schoolId && schoolInfo.schoolId !== '123456' ? schoolInfo.schoolId : null) ||
    authUser?.school_id ||
    authUser?.schoolId ||
    localStorage.getItem('activeSchoolId') ||
    localStorage.getItem('school_id') ||
    localStorage.getItem('schoolId') ||
    '199998'
  ).replace('SCH-', '').trim();

  // Load pending submissions from LocalStorage + Server RAM Buffer (Zero DB Load)
  const loadPendingSubmissions = async () => {
    const itemsMap = new Map();

    // 1. Local browser submissions
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pending_submission_')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          if (val && val.id) {
            itemsMap.set(String(val.id), {
              ...val,
              source: 'local'
            });
          }
        } catch (e) {}
      }
    }

    // 2. Server Ephemeral RAM submissions from mobile teachers
    try {
      const remoteList = await api.getPendingRoomSubmissions(activeSchoolId);
      if (Array.isArray(remoteList)) {
        for (const rem of remoteList) {
          const pData = rem.profileData || {};
          const pId = String(rem.personnelId || pData.id || '');
          if (pId) {
            const decompressed = pData.fn ? decompressProfile(pData) : pData;
            itemsMap.set(pId, {
              ...decompressed,
              id: pId,
              personnelId: pId,
              personnelName: rem.personnelName || `${decompressed.firstName || ''} ${decompressed.lastName || ''}`.trim(),
              rawProfile: decompressed,
              submissionId: rem.id,
              submittedAt: rem.submittedAt,
              roomName: rem.roomName || rem.room || 'Faculty Room',
              source: 'remote'
            });
          }
        }
      }
    } catch (e) {
      console.warn('[RoomQR] Pending submissions fetch notice:', e.message);
    }

    setPendingSubmissions(Array.from(itemsMap.values()));
  };

  useEffect(() => {
    loadPendingSubmissions();

    let channel;
    try {
      channel = new BroadcastChannel('insighted_room_qr_channel');
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'NEW_SUBMISSION') {
          loadPendingSubmissions();
        }
      };
    } catch (e) {}

    window.addEventListener('storage', loadPendingSubmissions);
    // Poll lightweight RAM buffer every 3 seconds
    const interval = setInterval(loadPendingSubmissions, 3000);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', loadPendingSubmissions);
      clearInterval(interval);
    };
  }, [activeSchoolId]);

  const handleCommitAllSubmissions = async () => {
    if (pendingSubmissions.length === 0) return;
    let count = 0;
    const remoteSubmissionIds = [];
    const remotePersonnelIds = [];

    for (const item of pendingSubmissions) {
      if (item && item.id) {
        const fullProfile = item.rawProfile || decompressProfile(item);
        if (savePersonnelChanges) {
          await savePersonnelChanges(fullProfile.id, {
            ...fullProfile,
            personalVerified: true
          });
        }
        localStorage.removeItem(`pending_submission_${fullProfile.id}`);
        if (item.submissionId) {
          remoteSubmissionIds.push(item.submissionId);
        }
        remotePersonnelIds.push(fullProfile.id);
        count++;
      }
    }

    if (remoteSubmissionIds.length > 0 || remotePersonnelIds.length > 0) {
      try {
        await api.ackRoomSubmissions({
          schoolId: activeSchoolId,
          submissionIds: remoteSubmissionIds,
          personnelIds: remotePersonnelIds
        });
      } catch (e) {}
    }

    await loadPendingSubmissions();
    setIngestionSuccess(`✓ Approved & Merged ${count} Teacher Profiling Record(s) directly into your Local Draft Roster!`);
    setTimeout(() => setIngestionSuccess(''), 6000);
  };

  // Compile comparison rows between database and submitted QR data
  const getComparisonRows = () => {
    if (!pendingReviewData) return [];
    
    // Find current record in effectivePersonnel
    const current = effectivePersonnel.find(p => p.id === pendingReviewData.id) || {};

    const fields = [
      { label: 'First Name', key: 'firstName' },
      { label: 'Middle Name', key: 'middleName' },
      { label: 'Last Name', key: 'lastName' },
      { label: 'Extension Name', key: 'nameExtension', format: (v, item) => v || item.extensionName || 'N/A' },
      { label: 'DepEd Official Email', key: 'depedEmail', format: (v) => v || 'N/A' },
      { label: 'PhilSys No. (National ID)', key: 'philsysNo', format: (v) => v || 'N/A' },
      { label: 'Birthdate', key: 'birthdate', format: (v) => v ? String(v).substring(0, 10) : 'N/A' },
      { 
        label: 'NEAP Trainings Recorded', 
        key: 'neapTrainingRows', 
        format: (v) => Array.isArray(v) && v.length > 0 ? `${v.length} program(s) (${v.reduce((sum, r) => sum + (Number(r.totalHours) || 0), 0)} hrs)` : 'None (0 hrs)' 
      },
      { 
        label: 'TESDA NC & Certifications', 
        key: 'certificationRows', 
        format: (v) => Array.isArray(v) && v.length > 0 ? `${v.length} cert(s) (${v.reduce((sum, r) => sum + (Number(r.totalHours) || 0), 0)} hrs)` : 'None (0 hrs)' 
      },
      { 
        label: 'Other L&D Programs', 
        key: 'otherTrainingRows', 
        format: (v) => Array.isArray(v) && v.length > 0 ? `${v.length} program(s) (${v.reduce((sum, r) => sum + (Number(r.totalHours) || 0), 0)} hrs)` : 'None (0 hrs)' 
      }
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
      if (savePersonnelChanges) {
        await savePersonnelChanges(pendingReviewData.id, {
          ...pendingReviewData,
          personalVerified: true
        });
      }
      
      // Clean up localStorage keys if they exist
      localStorage.removeItem(`pending_submission_${pendingReviewData.id}`);

      try {
        await api.ackRoomSubmissions({
          schoolId: activeSchoolId,
          personnelIds: [pendingReviewData.id]
        });
      } catch (e) {}

      await loadPendingSubmissions();

      setIngestionSuccess(`✓ Approved & Merged: Profiling details for ${pendingReviewData.firstName} ${pendingReviewData.lastName} have been successfully saved locally!`);
      setShowReviewModal(false);
      setPendingReviewData(null);
      setTimeout(() => setIngestionSuccess(''), 6000);
    }
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

  const [activeQueueTab, setActiveQueueTab] = useState('pending'); // 'pending' | 'verified' | 'awaiting'

  // Robust matching helper: connects a personnel record to a pending queue submission
  const matchSubmissionForTeacher = (teacher, subList) => {
    if (!teacher || !Array.isArray(subList)) return null;
    const tId = String(teacher.id || '').toLowerCase().trim();
    const tFn = String(teacher.firstName || teacher.first_name || '').trim().toLowerCase();
    const tLn = String(teacher.lastName || teacher.last_name || '').trim().toLowerCase();

    return subList.find(s => {
      const sId = String(s.personnelId || s.id || s.rawProfile?.id || '').toLowerCase().trim();
      if (sId && tId && sId === tId) return true;

      // Numeric suffix matching (e.g. PER-199998-003 vs PER-003 vs 3)
      const cleanTId = tId.replace(/[^0-9]/g, '');
      const cleanSId = sId.replace(/[^0-9]/g, '');
      if (cleanTId && cleanSId && (cleanTId.endsWith(cleanSId) || cleanSId.endsWith(cleanTId))) return true;

      // Full Name matching
      const sName = String(s.personnelName || `${s.firstName || s.fn || s.rawProfile?.firstName || ''} ${s.lastName || s.ln || s.rawProfile?.lastName || ''}`).toLowerCase();
      if (tFn && tLn && sName.includes(tFn) && sName.includes(tLn)) return true;

      return false;
    });
  };

  // Compute 3 structured groups
  const pendingTeachers = [];
  const handledSubKeys = new Set();

  effectivePersonnel.forEach(p => {
    const matchedSub = matchSubmissionForTeacher(p, pendingSubmissions);
    if (matchedSub) {
      pendingTeachers.push({ teacher: p, submission: matchedSub });
      handledSubKeys.add(matchedSub.submissionId || matchedSub.id || matchedSub.personnelId);
    }
  });

  // Include any pending submission that arrived for a teacher not yet in the active local array
  pendingSubmissions.forEach(s => {
    const sKey = s.submissionId || s.id || s.personnelId;
    if (!handledSubKeys.has(sKey)) {
      const raw = s.rawProfile || s;
      pendingTeachers.push({
        teacher: {
          id: s.personnelId || s.id,
          firstName: raw.firstName || raw.fn || '',
          lastName: raw.lastName || raw.ln || s.personnelName || 'Teacher',
          position: raw.position || raw.psn || 'Teacher',
          name: s.personnelName
        },
        submission: s
      });
    }
  });

  const verifiedTeachers = effectivePersonnel.filter(p => {
    const hasPending = matchSubmissionForTeacher(p, pendingSubmissions);
    return !hasPending && p.personalVerified;
  });

  const awaitingTeachers = effectivePersonnel.filter(p => {
    const hasPending = matchSubmissionForTeacher(p, pendingSubmissions);
    return !hasPending && !p.personalVerified;
  });

  const handleCommitSingle = async (pSub) => {
    if (!pSub) return;
    const fullProfile = pSub.rawProfile || decompressProfile(pSub);
    const targetId = fullProfile.id || pSub.personnelId || pSub.id;

    if (savePersonnelChanges) {
      await savePersonnelChanges(targetId, {
        ...fullProfile,
        personalVerified: true
      });
    }

    localStorage.removeItem(`pending_submission_${targetId}`);
    try {
      await api.ackRoomSubmissions({
        schoolId: activeSchoolId,
        submissionIds: pSub.submissionId ? [pSub.submissionId] : [],
        personnelIds: [targetId]
      });
    } catch (e) {}

    await loadPendingSubmissions();
    setIngestionSuccess(`✓ Approved & Merged profiling details for ${fullProfile.firstName || ''} ${fullProfile.lastName || ''} into local draft!`);
    setTimeout(() => setIngestionSuccess(''), 6000);
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'grid', gap: '20px' }}>
      <PortalHeader
        title="Room QR Mobile Profiling Station"
        description="Scan room QR codes to allow teachers to self-profile directly on mobile devices."
        onBack={() => setActiveView && setActiveView('dashboard')}
      />

      {/* Prominent Top Notification Banner when Submissions are In Queue */}
      {pendingTeachers.length > 0 && (
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #065F46, #047857)',
          color: 'white',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(4, 120, 87, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <FiBell size={26} color="white" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                {pendingTeachers.length} Teacher Profiling Submission{pendingTeachers.length > 1 ? 's' : ''} Ready for Review!
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
                {pendingTeachers.map(({ teacher, submission }) => {
                  const name = submission.personnelName || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                  const room = submission.roomName || submission.room || 'Faculty Room';
                  return `${name} (${room})`;
                }).filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            className="btn"
            onClick={handleCommitAllSubmissions}
            style={{ background: 'white', color: '#065F46', fontWeight: 800, padding: '8px 18px', border: 0, borderRadius: '10px', fontSize: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FiCheck size={14} />
            <span>1-Click Approve & Merge All ({pendingTeachers.length})</span>
          </button>
        </div>
      )}

      {/* Status Messages */}
      {ingestionSuccess && (
        <div style={{ padding: '16px', background: '#D4EDDA', color: '#155724', border: '1.5px solid #C3E6CB', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FiCheck size={16} /> <span>{ingestionSuccess}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', alignItems: 'start' }}>
        
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
                gap: '12px',
                maxWidth: '260px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(8, 49, 95, 0.05)'
              }}>
                <div style={{ 
                  background: 'white', 
                  padding: '8px', 
                  borderRadius: '8px', 
                  border: '1px solid var(--line)'
                }}>
                  <img 
                    src={getQrApiUrl(selectedRoom)} 
                    alt={`QR Code for ${selectedRoom}`} 
                    style={{ width: '180px', height: '180px', display: 'block' }}
                  />
                </div>
                
                <div style={{ width: '100%' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    FACULTY ROOM POSTER
                  </span>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--navy)' }}>
                    {selectedRoom}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.3' }}>
                    Single Scan for all Teachers assigned to this room.
                  </p>
                </div>

                <a 
                  href={getPortalUrl(selectedRoom)} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ 
                    fontSize: '10px', 
                    color: 'var(--muted)', 
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
                <button className="btn" onClick={handleSimulateScanLink} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <FiSmartphone size={14} />
                  <span>Simulate Scan</span>
                </button>
                <button className="btn secondary" onClick={handleCopyLink} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {copied ? <><FiCheck size={14} /> Copied</> : <><FiFileText size={14} /> Copy Link</>}
                </button>
              </div>
            </div>
          </article>

        </div>

        {/* Right Column: Profiling Queue & Passcodes */}
        <div style={{ display: 'grid', gap: '20px' }}>
          
          {/* Panel 1: Teacher Submissions & Verification Queue */}
          <article className="card" style={{ border: '2.5px solid var(--outline)', background: '#FFFFFF' }}>
            <div className="card-inner" style={{ display: 'grid', gap: '14px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiInbox size={18} />
                    <span>Teacher Submissions & Ingestion Queue</span>
                  </h2>
                  <p className="subtext" style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                    Review and approve verified profile updates submitted by teachers on mobile.
                  </p>
                </div>
                {pendingTeachers.length > 0 && (
                  <button
                    className="btn"
                    onClick={handleCommitAllSubmissions}
                    style={{ background: '#059669', color: 'white', border: 0, padding: '5px 12px', fontSize: '11px', fontWeight: 'bold', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <FiCheck size={12} />
                    <span>Approve All ({pendingTeachers.length})</span>
                  </button>
                )}
              </div>

              {/* 2-Tab Selector for Queue & Verified */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--line)', paddingBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveQueueTab('pending')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeQueueTab === 'pending' ? 'var(--navy)' : '#F1F5F9',
                    color: activeQueueTab === 'pending' ? '#FFFFFF' : '#475569',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FiInbox size={13} />
                  <span>In Queue</span>
                  <span style={{
                    background: activeQueueTab === 'pending' ? '#10B981' : '#CBD5E1',
                    color: activeQueueTab === 'pending' ? '#FFFFFF' : '#1E293B',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontWeight: 800
                  }}>
                    {pendingTeachers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQueueTab('verified')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeQueueTab === 'verified' ? 'var(--navy)' : '#F1F5F9',
                    color: activeQueueTab === 'verified' ? '#FFFFFF' : '#475569',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FiCheckCircle size={13} />
                  <span>Verified Profiles</span>
                  <span style={{
                    background: activeQueueTab === 'verified' ? '#3B82F6' : '#CBD5E1',
                    color: activeQueueTab === 'verified' ? '#FFFFFF' : '#1E293B',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontWeight: 800
                  }}>
                    {verifiedTeachers.length}
                  </span>
                </button>
              </div>

              {/* TAB 1: In Queue Submissions */}
              {activeQueueTab === 'pending' && (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {pendingTeachers.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1.5px solid var(--line)' }}>
                      <FiCheckCircle size={28} color="#10B981" style={{ marginBottom: '6px' }} />
                      <h4 style={{ margin: 0, color: 'var(--navy)', fontSize: '14px' }}>No Pending Submissions</h4>
                      <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                        When teachers submit their profiles via mobile, they will appear here for your review and approval.
                      </p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
                      {pendingTeachers.map(({ teacher, submission }) => {
                        const raw = submission.rawProfile || submission;
                        const fName = teacher.firstName || raw.firstName || '';
                        const lName = teacher.lastName || raw.lastName || '';
                        const displayName = lName && fName ? `${lName.toUpperCase()}, ${fName}` : (teacher.name || submission.personnelName || 'Teacher').toUpperCase();
                        const roomTag = submission.roomName || submission.room || 'Faculty Room';

                        return (
                          <div
                            key={submission.submissionId || submission.id || teacher.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: '#F0FDF4',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: '1.5px solid #86EFAC',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                              flexWrap: 'wrap',
                              gap: '8px'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--navy)' }}>
                                  {displayName}
                                </span>
                                <span style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #86EFAC', padding: '1px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <FiCheck size={10} /> SUBMITTED
                                </span>
                              </div>
                              <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                {teacher.position || raw.position || 'Teacher'} · <FiSmartphone size={11} /> {roomTag} · ID: {teacher.id}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                className="btn secondary"
                                type="button"
                                onClick={() => handleIngestData(submission)}
                                style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 'bold' }}
                              >
                                Review
                              </button>
                              <button
                                className="btn"
                                type="button"
                                onClick={() => handleCommitSingle(submission)}
                                style={{ background: '#059669', color: 'white', border: 0, padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <FiCheck size={12} />
                                <span>Approve & Merge</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Already Verified Profiles */}
              {activeQueueTab === 'verified' && (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {verifiedTeachers.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1.5px solid var(--line)' }}>
                      <FiFileText size={28} color="#94A3B8" style={{ marginBottom: '6px' }} />
                      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px' }}>
                        No profiles marked as verified yet. When you approve submissions, they will be listed here.
                      </p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: '10px' }}>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800 }}>Teacher Name</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800 }}>Position</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 800 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verifiedTeachers.map(p => {
                            const fName = p.firstName || p.first_name || '';
                            const lName = p.lastName || p.last_name || '';
                            const displayName = lName && fName ? `${lName.toUpperCase()}, ${fName}` : (p.name || 'TEACHER').toUpperCase();

                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>{displayName}</td>
                                <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.position || 'Teacher'}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <span style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <FiCheckCircle size={10} /> Verified & Merged
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          </article>

          {/* Panel 2: Teacher Passcodes (Dedicated Full Panel) */}
          <article className="card" style={{ border: '2.5px solid var(--outline)', background: '#FFFFFF' }}>
            <div className="card-inner" style={{ display: 'grid', gap: '12px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiKey size={18} />
                    <span>Teacher Passcodes</span>
                  </h2>
                  <p className="subtext" style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                    Teachers must enter their unique 6-digit passcode to unlock their profiling forms.
                  </p>
                </div>
                <span style={{ background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <FiClock size={12} /> Rotates in {formatCountdown(timeLeftSeconds)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search teacher by name..."
                  value={passcodeSearch}
                  onChange={(e) => setPasscodeSearch(e.target.value)}
                  style={{ flex: 1, minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  style={{ minHeight: '34px', fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setAllRevealed(prev => !prev)}
                >
                  {allRevealed ? <><FiEyeOff size={13} /> Hide All</> : <><FiEye size={13} /> Reveal All</>}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ minHeight: '34px', fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => {
                    (effectivePersonnel || []).forEach(p => {
                      const dynamic = get10MinPasscode(p.id, 0);
                      if (updatePersonnelInfo) updatePersonnelInfo(p.id, { profilingCode: dynamic });
                    });
                  }}
                >
                  <FiRefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: '10px' }}>
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
                      const filteredList = (effectivePersonnel || []).filter(p => {
                        const fn = (p.firstName || p.first_name || '').toLowerCase();
                        const ln = (p.lastName || p.last_name || '').toLowerCase();
                        const full = `${fn} ${ln} ${p.name || ''}`.toLowerCase();
                        return full.includes((passcodeSearch || '').toLowerCase());
                      });

                      if (filteredList.length === 0) {
                        return (
                          <tr>
                            <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                              {(effectivePersonnel || []).length === 0 ? 'No personnel records loaded.' : 'No teachers matching search.'}
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
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0, display: 'flex', alignItems: 'center' }}
                                  title={isRevealed ? "Hide Passcode" : "Reveal Passcode"}
                                >
                                  {isRevealed ? <FiEyeOff size={14} color="#64748B" /> : <FiEye size={14} color="#64748B" />}
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
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  {copiedCodeId === p.id ? <><FiCheck size={12} /> Copied</> : 'Copy'}
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
              <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiUserCheck size={20} />
                <span>Review Teacher Submission</span>
              </h2>
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
                <div style={{ marginTop: '12px', padding: '10px', background: '#F8FAFC', color: 'var(--muted)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <FiCheckCircle size={14} color="#10B981" />
                  <span>Checked: No changes detected. Submitted profile is identical to the current central record.</span>
                </div>
              )}

              {((pendingReviewData.neapTrainingRows && pendingReviewData.neapTrainingRows.length > 0) ||
                (pendingReviewData.certificationRows && pendingReviewData.certificationRows.length > 0) ||
                (pendingReviewData.otherTrainingRows && pendingReviewData.otherTrainingRows.length > 0)) && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FiAward size={15} />
                    <span>Submitted Trainings ({
                      (pendingReviewData.neapTrainingRows?.length || 0) + 
                      (pendingReviewData.certificationRows?.length || 0) + 
                      (pendingReviewData.otherTrainingRows?.length || 0)
                    } records)</span>
                  </span>
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
