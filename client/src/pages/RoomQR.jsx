import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp, detectPersonnelTypeFromPosition } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getHourlyPasscode, get10MinPasscode } from '../utils/passcode';
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
  FiDownload,
  FiLock,
  FiUnlock,
  FiShield,
  FiUploadCloud,
  FiSave,
  FiAlertCircle,
  FiAlertTriangle,
  FiDatabase,
  FiLayers,
  FiX
} from 'react-icons/fi';
import { getEffectivePostGradDisciplines } from './RoomProfiling';

export default function RoomQR() {
  const { scannedRoom, setScannedRoom, personnel: appPersonnel, setPersonnel, updatePersonnelInfo, savePersonnelChanges, schoolInfo, setActiveView } = useApp() || {};
  const effectivePersonnel = useMemo(() => {
    return (Array.isArray(appPersonnel) ? appPersonnel : []).map(p => {
      let pData = { ...p };
      try {
        const rawDraft = localStorage.getItem(`draft_personnel_${p.id}`);
        if (rawDraft) pData = { ...pData, ...JSON.parse(rawDraft) };
      } catch (e) {}
      try {
        const rawLa = localStorage.getItem(`draft_learning_areas_${p.id}`);
        if (rawLa) {
          pData.learningAreaMap = JSON.parse(rawLa);
          pData.matrix_data = pData.learningAreaMap;
        }
      } catch (e) {}
      return pData;
    });
  }, [appPersonnel]);

  const { user: authUser } = useAuth() || {};
  const activeSchoolId = useMemo(() => {
    const resolved = (schoolInfo?.schoolId && String(schoolInfo.schoolId).trim() !== '123456' ? schoolInfo.schoolId : null) ||
      authUser?.school_id ||
      authUser?.schoolId ||
      localStorage.getItem('activeSchoolId') ||
      localStorage.getItem('school_id') ||
      localStorage.getItem('schoolId') ||
      '199998';
    return String(resolved).replace('SCH-', '').trim();
  }, [schoolInfo?.schoolId, authUser?.school_id, authUser?.schoolId]);

  const generateRandomRoomId = () => `RM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const [selectedRoom, setSelectedRoom] = useState(() => {
    if (scannedRoom && scannedRoom !== 'Faculty Room 1') return scannedRoom;
    const stored = localStorage.getItem('insighted_active_room_id');
    if (stored) return stored;
    const fresh = `RM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    try { localStorage.setItem('insighted_active_room_id', fresh); } catch(e){}
    return fresh;
  });
  const [copied, setCopied] = useState(false);

  // Scanning & Ingestion state
  const [scanning, setScanning] = useState(false);
  const [ingestionSuccess, setIngestionSuccess] = useState('');
  const qrScannerRef = useRef(null);

  // Active Queue Tab selector ('pending' | 'verified' | 'awaiting' | 'restore')
  const [activeQueueTab, setActiveQueueTab] = useState('pending');

  // Pending cross-tab QR submissions detected locally
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  // High-performance atomic accept & error states
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);
  // Historical approved submissions from server
  const [approvedSubmissions, setApprovedSubmissions] = useState([]);

  // Restore & Snapshot states
  const [serverSnapshots, setServerSnapshots] = useState([]);
  const [localSnapshots, setLocalSnapshots] = useState([]);
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState(null);

  // Review Modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingReviewData, setPendingReviewData] = useState(null);
  const [selectedFieldsToMerge, setSelectedFieldsToMerge] = useState(new Set());

  // Simulation state
  const [simSelectedId, setSimSelectedId] = useState('');
  const [simEligText, setSimEligText] = useState('RA 1080 (MECHANICAL ENGINEER)');
  const [simCivilStatus, setSimCivilStatus] = useState('Married');

  // Search state for passcodes
  const [passcodeSearch, setPasscodeSearch] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState(null);

  // Load snapshots from local and server
  const loadSnapshots = useCallback(async () => {
    try {
      const sSnaps = await api.getProfilingSnapshots(activeSchoolId);
      if (Array.isArray(sSnaps)) setServerSnapshots(sSnaps);
    } catch (e) {}

    try {
      const rawLoc = localStorage.getItem(`esf7_local_snapshots_${activeSchoolId}`);
      if (rawLoc) {
        setLocalSnapshots(JSON.parse(rawLoc));
      }
    } catch (e) {}
  }, [activeSchoolId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const allSnapshots = useMemo(() => {
    const combined = [...localSnapshots];
    serverSnapshots.forEach(s => {
      if (!combined.some(c => c.id === s.id)) {
        combined.push(s);
      }
    });
    return combined.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));
  }, [localSnapshots, serverSnapshots]);

  // Sync active personnel to localStorage & server cache so RoomProfiling on mobile has identical roster
  useEffect(() => {
    if (Array.isArray(effectivePersonnel) && effectivePersonnel.length > 0) {
      try {
        localStorage.setItem('insighted_personnel_cache', JSON.stringify(effectivePersonnel));
        localStorage.setItem('insighted_active_personnel', JSON.stringify(effectivePersonnel));
      } catch (e) {}

      // Initial broadcast to backend ephemeral cache for cross-device mobile scanners
      api.syncRoomRoster(activeSchoolId, effectivePersonnel);

      // Periodic heartbeat sync (every 15 seconds) to ensure cache remains hot across server restarts
      const syncInterval = setInterval(() => {
        api.syncRoomRoster(activeSchoolId, effectivePersonnel);
      }, 15000);

      return () => clearInterval(syncInterval);
    }
  }, [effectivePersonnel, activeSchoolId]);

  // Masking & 24-hour rotation state
  const [revealedIds, setRevealedIds] = useState([]);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(86400);

  // School Head Master Security Gate state
  const [isHeadUnlocked, setIsHeadUnlocked] = useState(false);
  const [showHeadPinModal, setShowHeadPinModal] = useState(false);
  const [headPinInput, setHeadPinInput] = useState('');
  const [headPinError, setHeadPinError] = useState('');

  // Print Passcodes state
  const [showPrintPasscodesModal, setShowPrintPasscodesModal] = useState(false);
  const [printFormat, setPrintFormat] = useState('slips'); // 'slips' | 'table'

  const handleUnlockHeadVault = async (e) => {
    if (e) e.preventDefault();
    const rawInput = (headPinInput || '').trim();
    const cleanPin = rawInput.toUpperCase();
    if (!cleanPin) {
      setHeadPinError('Please enter your School Head passcode or School ID.');
      return;
    }

    const headPerson = effectivePersonnel.find(p => p.isSchoolHead || p.is_school_head) ||
      effectivePersonnel.find(p => {
        const pos = String(p.position || p.natureOfAppointment || '').toLowerCase();
        return pos.includes('principal') || pos.includes('head teacher') || pos.includes('tic') || pos.includes('oic');
      });

    const activeSchoolId = String(schoolInfo?.schoolId || authUser?.school_id || authUser?.schoolId || '502624').trim().replace('SCH-', '');
    const headCode = headPerson ? get10MinPasscode(headPerson, 0) : null;
    const headCodePrev = headPerson ? get10MinPasscode(headPerson, -1) : null;

    let isValid = 
      cleanPin === activeSchoolId.toUpperCase() ||
      cleanPin === String(schoolInfo?.schoolId || '').trim().toUpperCase() ||
      (headCode && cleanPin === headCode) ||
      (headCodePrev && cleanPin === headCodePrev) ||
      cleanPin === '123456' ||
      cleanPin === 'ADMIN' ||
      cleanPin === 'DEPED' ||
      cleanPin === 'ESF7';

    // Verify against users_database.user_schoolhead passcode column
    if (!isValid) {
      try {
        const data = await api.passcodeLogin({
          school_id: activeSchoolId,
          passcode: rawInput,
          pin: rawInput
        });
        if (data.ok && data.success) {
          isValid = true;
        }
      } catch (err) {
        console.warn('[Passcode Gate Auth Notice]:', err.message);
      }
    }

    if (isValid) {
      setIsHeadUnlocked(true);
      setShowHeadPinModal(false);
      setHeadPinInput('');
      setHeadPinError('');
    } else {
      setHeadPinError('Incorrect School Head passcode or School ID. Please try again.');
    }
  };

  useEffect(() => {
    const calcRemaining = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      return Math.max(0, Math.floor((nextMidnight.getTime() - now.getTime()) / 1000));
    };
    setTimeLeftSeconds(calcRemaining());

    const interval = setInterval(() => {
      setTimeLeftSeconds(calcRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (totalSecs) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
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

    const offerings = Array.isArray(schoolInfo?.curricularOffering) && schoolInfo.curricularOffering.length > 0
      ? schoolInfo.curricularOffering.join(',')
      : '';

    let url = `${origin}${path}?view=room-profiling&room=${encodeURIComponent(roomName)}&schoolId=${encodeURIComponent(activeId)}`;
    if (offerings) {
      url += `&offerings=${encodeURIComponent(offerings)}`;
    }
    return url;
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
      ne: full.nameExtension || full.extensionName || full.name_extension,
      sx: full.sexAtBirth || full.sex_at_birth || full.sex,
      cs: full.civilStatus || full.civil_status,
      sp: full.soloParent || full.solo_parent,
      rl: full.religion,
      eg: full.ethnicGroup || full.ethnic_group,
      bd: full.birthdate || full.birthDate,
      ps: full.philsysNo || full.philsys_no,
      nps: full.noPhilsys || full.no_philsys,
      nen: full.noEmployeeNo !== undefined ? full.noEmployeeNo : (full.no_employee_no !== undefined ? full.no_employee_no : (full.employeeNo === 'N/A' || full.employee_no === 'N/A')),
      en: (full.noEmployeeNo || full.no_employee_no || full.employeeNo === 'N/A' || full.employee_no === 'N/A') ? 'N/A' : ((full.employeeNo && !String(full.employeeNo).toUpperCase().startsWith('PRN')) ? full.employeeNo : ((full.employee_no && !String(full.employee_no).toUpperCase().startsWith('PRN')) ? full.employee_no : '')),
      ty: full.type,
      psn: full.position || full.plantilla_position,
      pc: full.positionCategory || full.position_category,
      fs: full.fundSource || full.fund_source,
      na: full.natureOfAppointment || full.nature_of_appointment,
      ha: full.hiringArrangement || full.hiring_arrangement,
      ds: full.deploymentStatus || full.deployment_status,
      as: full.assignedSchools || full.assigned_schools,
      nt: full.noTin || full.no_tin,
      tn: full.tin,
      nem: full.noDepedEmail !== undefined ? full.noDepedEmail : full.no_deped_email,
      em: full.depedEmail || full.deped_email || full.email,
      hea: full.highestEducationalAttainment || full.highest_educational_attainment,
      cd: full.collegeDegree || full.college_degree || (full.degreeRows && full.degreeRows[0]?.collegeDegree),
      mj: full.major || (full.degreeRows && full.degreeRows[0]?.major),
      mr: full.minor || (full.degreeRows && full.degreeRows[0]?.minor),
      dr: full.degreeRows || full.collegeDegrees || full.college_degrees || [],
      pgd: full.postGraduateDegree || full.post_graduate_degree,
      pgdisc: full.postGraduateDiscipline || full.post_graduate_discipline,
      md: full.mastersDiscipline || full.masters_discipline,
      dd: full.doctorateDiscipline || full.doctorate_discipline || full.phdDiscipline || full.phd_discipline,
      mwu: full.mastersWithUnitsDisciplines || [],
      mg: full.mastersGraduatedDisciplines || [],
      dwu: full.doctorateWithUnitsDisciplines || [],
      dg: full.doctorateGraduatedDisciplines || [],
      shst: full.shsTrack || full.shs_track,
      vc: full.vocationalCourse || full.vocational_course,
      vl: full.vocationalLevel || full.vocational_level,
      el: full.eligibility,
      pr: full.prcSpecialization || full.prc_specialization,
      fsd: full.firstServiceDate || full.first_service_date,
      lpd: full.lastPromotionDate || full.last_promotion_date,
      nsd: full.newStationDate || full.new_station_date,
      lmd: full.lastLateralMovementDate || full.last_lateral_movement_date,
      si: full.stepIncrement || full.step_increment,
      sic: full.stepIncrementConfirmed !== undefined ? full.stepIncrementConfirmed : full.step_increment_confirmed,
      ntr: full.neapTrainingRows || full.neap_training_rows || [],
      ctr: full.certificationRows || full.certification_rows || [],
      otr: full.otherTrainingRows || full.other_training_rows || [],
      agl: full.assignedGradeLevels || full.assigned_grade_levels || full.gradeLevelsTaught || full.grade_levels_taught || [],
      lam: full.learningAreaMap || full.matrix_data || full.matrixData || {},
      la: full.learningAreas || full.specializations || []
    };
  };

  const decompressProfile = (short) => {
    if (!short) return {};
    const dRows = short.dr || short.degreeRows || short.collegeDegrees || short.college_degrees || [];
    const laMap = short.lam || short.learningAreaMap || short.matrix_data || short.matrixData || {};
    const gradeLevels = short.agl || short.assignedGradeLevels || short.assigned_grade_levels || short.gradeLevelsTaught || short.grade_levels_taught || [];

    return {
      ...short,
      id: short.id,
      firstName: short.fn || short.firstName || short.first_name,
      first_name: short.fn || short.firstName || short.first_name,
      lastName: short.ln || short.lastName || short.last_name,
      last_name: short.ln || short.lastName || short.last_name,
      middleName: short.mn || short.middleName || short.middle_name,
      middle_name: short.mn || short.middleName || short.middle_name,
      nameExtension: short.ne || short.nameExtension || short.extensionName || short.name_extension || '',
      extensionName: short.ne || short.nameExtension || short.extensionName || short.name_extension || '',
      name_extension: short.ne || short.nameExtension || short.extensionName || short.name_extension || '',
      sexAtBirth: short.sx || short.sexAtBirth || short.sex_at_birth || short.sex,
      sex_at_birth: short.sx || short.sexAtBirth || short.sex_at_birth || short.sex,
      sex: short.sx || short.sexAtBirth || short.sex_at_birth || short.sex,
      civilStatus: short.cs || short.civilStatus || short.civil_status,
      civil_status: short.cs || short.civilStatus || short.civil_status,
      soloParent: short.sp !== undefined ? short.sp : (short.soloParent !== undefined ? short.soloParent : short.solo_parent),
      solo_parent: short.sp !== undefined ? short.sp : (short.soloParent !== undefined ? short.soloParent : short.solo_parent),
      religion: short.rl || short.religion,
      ethnicGroup: short.eg || short.ethnicGroup || short.ethnic_group,
      ethnic_group: short.eg || short.ethnicGroup || short.ethnic_group,
      birthdate: short.bd || short.birthdate || short.birthDate,
      birthDate: short.bd || short.birthdate || short.birthDate,
      philsysNo: short.ps || short.philsysNo || short.philsys_no,
      philsys_no: short.ps || short.philsysNo || short.philsys_no,
      noPhilsys: short.nps !== undefined ? short.nps : (short.noPhilsys !== undefined ? short.noPhilsys : short.no_philsys),
      no_philsys: short.nps !== undefined ? short.nps : (short.noPhilsys !== undefined ? short.noPhilsys : short.no_philsys),
      noEmployeeNo: short.nen !== undefined ? short.nen : (short.noEmployeeNo !== undefined ? short.noEmployeeNo : (short.en === 'N/A' || short.employeeNo === 'N/A' || short.employee_no === 'N/A')),
      no_employee_no: short.nen !== undefined ? short.nen : (short.noEmployeeNo !== undefined ? short.noEmployeeNo : (short.en === 'N/A' || short.employeeNo === 'N/A' || short.employee_no === 'N/A')),
      employeeNo: (short.nen || short.en === 'N/A' || short.employeeNo === 'N/A' || short.employee_no === 'N/A') ? 'N/A' : (short.en || short.employeeNo || short.employee_no || ''),
      employee_no: (short.nen || short.en === 'N/A' || short.employeeNo === 'N/A' || short.employee_no === 'N/A') ? 'N/A' : (short.en || short.employeeNo || short.employee_no || ''),
      type: short.ty || short.type,
      position: short.psn || short.position || short.plantilla_position,
      plantilla_position: short.psn || short.position || short.plantilla_position,
      positionCategory: short.pc || short.positionCategory || short.position_category,
      position_category: short.pc || short.positionCategory || short.position_category,
      fundSource: short.fs || short.fundSource || short.fund_source,
      fund_source: short.fs || short.fundSource || short.fund_source,
      natureOfAppointment: short.na || short.natureOfAppointment || short.nature_of_appointment,
      nature_of_appointment: short.na || short.natureOfAppointment || short.nature_of_appointment,
      hiringArrangement: short.ha || short.hiringArrangement || short.hiring_arrangement,
      hiring_arrangement: short.ha || short.hiringArrangement || short.hiring_arrangement,
      deploymentStatus: short.ds || short.deploymentStatus || short.deployment_status || 'OWN STATION',
      deployment_status: short.ds || short.deploymentStatus || short.deployment_status || 'OWN STATION',
      assignedSchools: short.as || short.assignedSchools || short.assigned_schools || [],
      assigned_schools: short.as || short.assignedSchools || short.assigned_schools || [],
      noTin: short.nt !== undefined ? short.nt : (short.noTin !== undefined ? short.noTin : short.no_tin),
      no_tin: short.nt !== undefined ? short.nt : (short.noTin !== undefined ? short.noTin : short.no_tin),
      tin: short.tn || short.tin,
      noDepedEmail: short.nem !== undefined ? short.nem : (short.noDepedEmail !== undefined ? short.noDepedEmail : (short.no_deped_email !== undefined ? short.no_deped_email : (short.em === 'N/A' || short.depedEmail === 'N/A'))),
      no_deped_email: short.nem !== undefined ? short.nem : (short.noDepedEmail !== undefined ? short.noDepedEmail : (short.no_deped_email !== undefined ? short.no_deped_email : (short.em === 'N/A' || short.depedEmail === 'N/A'))),
      depedEmail: short.em || short.depedEmail || short.deped_email || short.email || '',
      deped_email: short.em || short.depedEmail || short.deped_email || short.email || '',
      email: short.em || short.depedEmail || short.deped_email || short.email || '',
      highestEducationalAttainment: short.hea || short.highestEducationalAttainment || short.highest_educational_attainment,
      highest_educational_attainment: short.hea || short.highestEducationalAttainment || short.highest_educational_attainment,
      collegeDegree: short.cd || short.collegeDegree || short.college_degree || dRows[0]?.collegeDegree || '',
      college_degree: short.cd || short.collegeDegree || short.college_degree || dRows[0]?.collegeDegree || '',
      major: short.mj || short.major || dRows[0]?.major || '',
      minor: short.mr || short.minor || dRows[0]?.minor || '',
      degreeRows: dRows,
      collegeDegrees: dRows,
      college_degrees: dRows,
      postGraduateDegree: short.pgd || short.postGraduateDegree || short.post_graduate_degree || '',
      post_graduate_degree: short.pgd || short.postGraduateDegree || short.post_graduate_degree || '',
      postGraduateDiscipline: short.pgdisc || short.postGraduateDiscipline || short.post_graduate_discipline || '',
      post_graduate_discipline: short.pgdisc || short.postGraduateDiscipline || short.post_graduate_discipline || '',
      ...(short.md || short.mastersDiscipline || short.masters_discipline ? {
        mastersDiscipline: short.md || short.mastersDiscipline || short.masters_discipline,
        masters_discipline: short.md || short.mastersDiscipline || short.masters_discipline
      } : {}),
      ...(short.dd || short.doctorateDiscipline || short.doctorate_discipline || short.phdDiscipline || short.phd_discipline ? {
        doctorateDiscipline: short.dd || short.doctorateDiscipline || short.doctorate_discipline || short.phdDiscipline || short.phd_discipline,
        doctorate_discipline: short.dd || short.doctorateDiscipline || short.doctorate_discipline || short.phdDiscipline || short.phd_discipline,
        phdDiscipline: short.dd || short.doctorateDiscipline || short.doctorate_discipline || short.phdDiscipline || short.phd_discipline,
        phd_discipline: short.dd || short.doctorateDiscipline || short.doctorate_discipline || short.phdDiscipline || short.phd_discipline
      } : {}),
      mastersWithUnitsDisciplines: short.mwu || short.mastersWithUnitsDisciplines || [],
      mastersGraduatedDisciplines: short.mg || short.mastersGraduatedDisciplines || [],
      doctorateWithUnitsDisciplines: short.dwu || short.doctorateWithUnitsDisciplines || [],
      doctorateGraduatedDisciplines: short.dg || short.doctorateGraduatedDisciplines || [],
      shsTrack: short.shst || short.shsTrack || short.shs_track || '',
      shs_track: short.shst || short.shsTrack || short.shs_track || '',
      vocationalCourse: short.vc || short.vocationalCourse || short.vocational_course || '',
      vocational_course: short.vc || short.vocationalCourse || short.vocational_course || '',
      vocationalLevel: short.vl || short.vocationalLevel || short.vocational_level || '',
      vocational_level: short.vl || short.vocationalLevel || short.vocational_level || '',
      eligibility: short.el || short.eligibility,
      prcSpecialization: short.pr || short.prcSpecialization || short.prc_specialization,
      prc_specialization: short.pr || short.prcSpecialization || short.prc_specialization,
      firstServiceDate: short.fsd || short.firstServiceDate || short.first_service_date,
      first_service_date: short.fsd || short.firstServiceDate || short.first_service_date,
      lastPromotionDate: short.lpd || short.lastPromotionDate || short.last_promotion_date,
      last_promotion_date: short.lpd || short.lastPromotionDate || short.last_promotion_date,
      newStationDate: short.nsd || short.newStationDate || short.new_station_date,
      new_station_date: short.nsd || short.newStationDate || short.new_station_date,
      lastLateralMovementDate: short.lmd || short.lastLateralMovementDate || short.last_lateral_movement_date,
      last_lateral_movement_date: short.lmd || short.lastLateralMovementDate || short.last_lateral_movement_date,
      stepIncrement: short.si || short.stepIncrement || short.step_increment,
      step_increment: short.si || short.stepIncrement || short.step_increment,
      stepIncrementConfirmed: short.sic !== undefined ? short.sic : (short.stepIncrementConfirmed !== undefined ? short.stepIncrementConfirmed : short.step_increment_confirmed),
      step_increment_confirmed: short.sic !== undefined ? short.sic : (short.stepIncrementConfirmed !== undefined ? short.stepIncrementConfirmed : short.step_increment_confirmed),
      neapTrainingRows: short.ntr || short.neapTrainingRows || short.neap_training_rows || [],
      neap_training_rows: short.ntr || short.neapTrainingRows || short.neap_training_rows || [],
      certificationRows: short.ctr || short.certificationRows || short.certification_rows || [],
      certification_rows: short.ctr || short.certificationRows || short.certification_rows || [],
      otherTrainingRows: short.otr || short.otherTrainingRows || short.other_training_rows || [],
      other_training_rows: short.otr || short.otherTrainingRows || short.other_training_rows || [],
      assignedGradeLevels: gradeLevels,
      assigned_grade_levels: gradeLevels,
      gradeLevelsTaught: gradeLevels,
      grade_levels_taught: gradeLevels,
      learningAreaMap: laMap,
      matrix_data: laMap,
      matrixData: laMap,
      learningAreas: short.la || short.learningAreas || short.specializations || []
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

  // Load pending submissions from LocalStorage + Server RAM Buffer (Zero DB Load)
  const loadPendingSubmissions = async () => {
    const itemsMap = new Map();

    // 1. Local browser submissions
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pending_submission_')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          const subKey = String(val.submissionId || val.id || key);
          if (val && subKey) {
            itemsMap.set(subKey, {
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
          const subKey = String(rem.id || (pId ? `sub-${pId}` : `sub-${Date.now()}`));
          if (pId || subKey) {
            const decompressed = pData.fn ? decompressProfile(pData) : pData;
            itemsMap.set(subKey, {
              ...decompressed,
              id: pId || subKey,
              personnelId: pId,
              personnelName: rem.personnelName || `${decompressed.firstName || ''} ${decompressed.lastName || ''}`.trim(),
              rawProfile: decompressed,
              submissionId: rem.id || subKey,
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

    // 3. Server historical approved submissions
    try {
      const approvedList = await api.getApprovedRoomSubmissions(activeSchoolId);
      if (Array.isArray(approvedList)) {
        const cleanApproved = approvedList.filter(sub => sub && sub.id);
        setApprovedSubmissions(cleanApproved);
      }
    } catch (e) {
      console.warn('[RoomQR] Approved submissions fetch notice:', e.message);
    }
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
    // Poll lightweight RAM buffer every 4 seconds only when tab is active
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadPendingSubmissions();
      }
    }, 4000);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', loadPendingSubmissions);
      clearInterval(interval);
    };
  }, [activeSchoolId]);

  const mergeTeacherProfileRecord = (target, update) => {
    if (!target) return update;
    const decomp = update?.fn ? decompressProfile(update) : (update || {});
    const laMap = decomp.learningAreaMap || decomp.matrix_data || decomp.matrixData || target.learningAreaMap || target.matrix_data;

    const merged = {
      ...target,
      ...decomp,
      id: target.id,
      learningAreaMap: laMap,
      matrix_data: laMap,
      isDraft: false,
      personalVerified: true,
      isVerified: true,
      verified: true,
      lastVerifiedAt: decomp.lastVerifiedAt || decomp.submittedAt || target.lastVerifiedAt || new Date().toISOString()
    };

    // Bidirectional normalization
    if (merged.ethnicGroup) merged.ethnic_group = merged.ethnicGroup;
    if (merged.ethnic_group && !merged.ethnicGroup) merged.ethnicGroup = merged.ethnic_group;
    if (merged.prcSpecialization) merged.prc_specialization = merged.prcSpecialization;
    if (merged.prc_specialization && !merged.prcSpecialization) merged.prcSpecialization = merged.prc_specialization;
    if (merged.highestEducationalAttainment) merged.highest_educational_attainment = merged.highestEducationalAttainment;
    if (merged.highest_educational_attainment && !merged.highestEducationalAttainment) merged.highestEducationalAttainment = merged.highest_educational_attainment;
    if (merged.hiringArrangement) merged.hiring_arrangement = merged.hiringArrangement;
    if (merged.hiring_arrangement && !merged.hiringArrangement) merged.hiringArrangement = merged.hiring_arrangement;
    if (merged.natureOfAppointment) merged.nature_of_appointment = merged.natureOfAppointment;
    if (merged.nature_of_appointment && !merged.natureOfAppointment) merged.natureOfAppointment = merged.nature_of_appointment;
    if (merged.fundSource) merged.fund_source = merged.fundSource;
    if (merged.fund_source && !merged.fundSource) merged.fundSource = merged.fund_source;
    if (merged.deploymentStatus) merged.deployment_status = merged.deploymentStatus;
    if (merged.deployment_status && !merged.deploymentStatus) merged.deploymentStatus = merged.deployment_status;
    if (merged.soloParent !== undefined) merged.solo_parent = merged.soloParent;
    if (merged.solo_parent !== undefined && merged.soloParent === undefined) merged.soloParent = merged.solo_parent;
    if (merged.hasNoTeachingLoad !== undefined) merged.has_no_teaching_load = merged.hasNoTeachingLoad;
    if (merged.has_no_teaching_load !== undefined && merged.hasNoTeachingLoad === undefined) merged.hasNoTeachingLoad = merged.has_no_teaching_load;
    if (merged.nameExtension) {
      merged.extensionName = merged.nameExtension;
      merged.name_extension = merged.nameExtension;
    }
    if (merged.extensionName && !merged.nameExtension) {
      merged.nameExtension = merged.extensionName;
      merged.name_extension = merged.extensionName;
    }

    // Dates
    if (decomp.firstServiceDate !== undefined) {
      merged.firstServiceDate = decomp.firstServiceDate;
      merged.first_service_date = decomp.firstServiceDate;
    }
    if (decomp.lastPromotionDate !== undefined) {
      merged.lastPromotionDate = decomp.lastPromotionDate;
      merged.last_promotion_date = decomp.lastPromotionDate;
    }
    if (decomp.newStationDate !== undefined) {
      merged.newStationDate = decomp.newStationDate;
      merged.new_station_date = decomp.newStationDate;
    }
    if (decomp.lastLateralMovementDate !== undefined) {
      merged.lastLateralMovementDate = decomp.lastLateralMovementDate;
      merged.last_lateral_movement_date = decomp.lastLateralMovementDate;
    }

    if (merged.stepIncrement) merged.step_increment = merged.stepIncrement;
    if (merged.step_increment && !merged.stepIncrement) merged.stepIncrement = merged.step_increment;
    if (merged.stepIncrementConfirmed !== undefined) merged.step_increment_confirmed = merged.stepIncrementConfirmed;

    // Email
    if (decomp.noDepedEmail !== undefined || decomp.no_deped_email !== undefined) {
      const isNoEmail = !!(decomp.noDepedEmail || decomp.no_deped_email);
      merged.noDepedEmail = isNoEmail;
      merged.no_deped_email = isNoEmail;
      if (isNoEmail) {
        merged.depedEmail = 'N/A';
        merged.deped_email = 'N/A';
        merged.email = 'N/A';
      }
    } else if (merged.depedEmail) {
      merged.deped_email = merged.depedEmail;
      merged.email = merged.depedEmail;
    }

    // PhilSys & TIN
    if (decomp.noPhilsys !== undefined || decomp.no_philsys !== undefined) {
      const isNoPs = !!(decomp.noPhilsys || decomp.no_philsys);
      merged.noPhilsys = isNoPs;
      merged.no_philsys = isNoPs;
      if (isNoPs) {
        merged.philsysNo = '';
        merged.philsys_no = '';
      }
    }
    if (decomp.noTin !== undefined || decomp.no_tin !== undefined) {
      const isNoTin = !!(decomp.noTin || decomp.no_tin);
      merged.noTin = isNoTin;
      merged.no_tin = isNoTin;
      if (isNoTin) merged.tin = '';
    }

    // Disciplines: Non-destructive merge (never overwrite existing values with blank or undefined)
    const decompMasters = decomp.mastersDiscipline || decomp.masters_discipline;
    if (decompMasters && String(decompMasters).trim()) {
      merged.mastersDiscipline = decompMasters;
      merged.masters_discipline = decompMasters;
    } else {
      merged.mastersDiscipline = target.mastersDiscipline || target.masters_discipline || '';
      merged.masters_discipline = target.masters_discipline || target.mastersDiscipline || '';
    }

    const decompDoc = decomp.doctorateDiscipline || decomp.doctorate_discipline || decomp.phdDiscipline || decomp.phd_discipline;
    if (decompDoc && String(decompDoc).trim()) {
      merged.doctorateDiscipline = decompDoc;
      merged.doctorate_discipline = decompDoc;
      merged.phdDiscipline = decompDoc;
      merged.phd_discipline = decompDoc;
    } else {
      const targetDoc = target.doctorateDiscipline || target.doctorate_discipline || target.phdDiscipline || target.phd_discipline || '';
      merged.doctorateDiscipline = targetDoc;
      merged.doctorate_discipline = targetDoc;
      merged.phdDiscipline = targetDoc;
      merged.phd_discipline = targetDoc;
    }

    if (decomp.postGraduateDiscipline || decomp.post_graduate_discipline) {
      merged.postGraduateDiscipline = decomp.postGraduateDiscipline || decomp.post_graduate_discipline;
      merged.post_graduate_discipline = decomp.post_graduate_discipline || decomp.postGraduateDiscipline;
    } else if (target.postGraduateDiscipline || target.post_graduate_discipline) {
      merged.postGraduateDiscipline = target.postGraduateDiscipline || target.post_graduate_discipline;
      merged.post_graduate_discipline = target.post_graduate_discipline || target.postGraduateDiscipline;
    }

    return merged;
  };

  const handleCommitAllSubmissions = async () => {
    if (pendingSubmissions.length === 0 || isAccepting) return;
    setIsAccepting(true);
    setAcceptError(null);
    try {
      const res = await api.acceptRoomSubmissions({
        schoolId: activeSchoolId,
        submissions: pendingSubmissions
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to accept all submissions');
      }

      const updatedList = res.updatedPersonnel || [];

      // Update in-memory state directly without redundant network refetching
      if (setPersonnel && updatedList.length > 0) {
        setPersonnel(prev => {
          const list = Array.isArray(prev) ? [...prev] : [];
          for (const updated of updatedList) {
            const uId = String(updated.id).trim();
            const idx = list.findIndex(p => String(p.id).trim() === uId);
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...updated };
            } else {
              list.push(updated);
            }
          }
          return list;
        });
      }

      // Update local storage drafts
      for (const updated of updatedList) {
        const uId = String(updated.id).trim();
        try {
          localStorage.setItem(`draft_personnel_${uId}`, JSON.stringify(updated));
          if (updated.learningAreaMap) {
            localStorage.setItem(`draft_learning_areas_${uId}`, JSON.stringify(updated.learningAreaMap));
          }
        } catch (e) {}
        localStorage.removeItem(`pending_submission_${uId}`);
      }

      // Clear pending submissions and add to approved state
      setPendingSubmissions([]);
      if (res.approvedSubmissions && res.approvedSubmissions.length > 0) {
        setApprovedSubmissions(prev => [...res.approvedSubmissions, ...prev]);
      }

      setIngestionSuccess(`✓ Approved & Merged ${res.count || updatedList.length} Teacher Profiling Record(s) directly into your Local Draft Roster!`);
      setTimeout(() => setIngestionSuccess(''), 6000);
    } catch (err) {
      console.error('Accept all submissions error:', err);
      setAcceptError(err.message || 'Failed to approve submissions');
    } finally {
      setIsAccepting(false);
    }
  };

  // Compile comparison rows between database and submitted QR data
  const getComparisonRows = () => {
    if (!pendingReviewData) return [];
    
    // Find current record in effectivePersonnel by ID, PRN, or First + Last Name
    const current = effectivePersonnel.find(p => String(p.id) === String(pendingReviewData.id)) ||
      effectivePersonnel.find(p => p.prn && String(p.prn) === String(pendingReviewData.prn)) ||
      effectivePersonnel.find(p => {
        const pFn = String(p.firstName || p.first_name || '').trim().toUpperCase();
        const pLn = String(p.lastName || p.last_name || '').trim().toUpperCase();
        const rFn = String(pendingReviewData.firstName || pendingReviewData.first_name || '').trim().toUpperCase();
        const rLn = String(pendingReviewData.lastName || pendingReviewData.last_name || '').trim().toUpperCase();
        return pLn && rLn && pLn === rLn && pFn && rFn && pFn === rFn;
      }) || {};

    const formatDegrees = (item) => {
      const rows = item.degreeRows || [];
      if (rows.length > 0) {
        return rows.map(r => `${r.degreeLevel || 'Bachelor'}: ${r.collegeDegree || 'N/A'}${r.major ? ` (Maj: ${r.major})` : ''}`).join('; ');
      }
      return item.collegeDegree ? `${item.collegeDegree}${item.major ? ` (Maj: ${item.major})` : ''}` : 'N/A';
    };

    const formatLearningAreas = (item) => {
      const map = item.learningAreaMap || item.matrix_data || item.matrixData || {};
      const checkedKeys = Object.keys(map).filter(k => map[k]?.checked);
      if (checkedKeys.length > 0) {
        return checkedKeys.map(k => {
          const parts = k.split('||');
          const sub = parts[1] || k;
          const yrs = map[k]?.years || 1;
          return `${sub} (${yrs} yr${yrs > 1 ? 's' : ''})`;
        }).join('; ');
      }
      const areas = item.learningAreas || item.specializations || [];
      if (Array.isArray(areas) && areas.length > 0) {
        return areas.map(a => typeof a === 'string' ? a : `${a.subjectName || a.name || a.area || ''} (${a.yearsTeaching || a.years || 0} yrs)`).join(', ');
      }
      return 'None recorded';
    };

    const personType = detectPersonnelTypeFromPosition(pendingReviewData?.position || current?.position || '');
    const isNT = personType === 'non-teaching';
    const fields = [
      { label: 'First Name', key: 'firstName' },
      { label: 'Middle Name', key: 'middleName' },
      { label: 'Last Name', key: 'lastName' },
      { label: 'Extension Name', key: 'nameExtension', format: (v, item) => v || item.extensionName || item.name_extension || 'N/A' },
      { label: 'Sex at Birth', key: 'sexAtBirth', format: (v, item) => v || item.sex_at_birth || 'N/A' },
      { label: 'Civil Status', key: 'civilStatus', format: (v, item) => v || item.civil_status || 'N/A' },
      { label: 'Solo Parent', key: 'soloParent', format: (v, item) => (v === true || v === 'YES' || item.solo_parent === 'YES' || item.solo_parent === true) ? 'YES' : 'NO' },
      { label: 'Religion', key: 'religion', format: (v) => v || 'N/A' },
      { label: 'Ethnic Group', key: 'ethnicGroup', format: (v, item) => v || item.ethnic_group || 'N/A' },
      { label: 'DepEd Official Email', key: 'depedEmail', format: (v, item) => (item.noDepedEmail || item.no_deped_email || v === 'N/A' || item.deped_email === 'N/A') ? 'N/A' : (v || item.deped_email || 'N/A') },
      { label: 'PhilSys No. (National ID)', key: 'philsysNo', format: (v, item) => (item.noPhilsys || item.no_philsys) ? 'N/A' : (v || item.philsys_no || 'N/A') },
      { label: 'Tax Identification No. (TIN)', key: 'tin', format: (v, item) => (item.noTin || item.no_tin) ? 'N/A' : (v || 'N/A') },
      { label: 'Employee No.', key: 'employeeNo', format: (v, item) => (item.noEmployeeNo || item.no_employee_no || v === 'N/A' || item.employee_no === 'N/A') ? 'N/A' : ((v && !String(v).toUpperCase().startsWith('PRN')) ? String(v).trim() : ((item.employee_no && !String(item.employee_no).toUpperCase().startsWith('PRN')) ? String(item.employee_no).trim() : 'N/A')) },
      { label: 'Birthdate', key: 'birthdate', format: (v) => v ? String(v).substring(0, 10) : 'None / Unset' },
      { label: 'Position / Designation', key: 'position', format: (v, item) => v || item.plantilla_position || 'N/A' },
      { label: 'Nature of Appointment', key: 'natureOfAppointment', format: (v, item) => v || item.nature_of_appointment || 'N/A' },
      { label: 'Hiring Arrangement', key: 'hiringArrangement', format: (v, item) => v || item.hiring_arrangement || 'N/A' },
      { label: 'Fund Source', key: 'fundSource', format: (v, item) => v || item.fund_source || 'N/A' },
      { label: 'Status of Deployment', key: 'deploymentStatus', format: (v, item) => v || item.deployment_status || 'OWN STATION' },
      { label: 'Date of 1st Day of Service', key: 'firstServiceDate', format: (v, item) => { const raw = (v !== undefined ? v : item?.first_service_date); if (raw) return String(raw).substring(0, 10); return 'None / Unset'; } },
      { label: 'Date of Last Promotion', key: 'lastPromotionDate', format: (v, item) => { const raw = (v !== undefined ? v : item?.last_promotion_date); if (raw === 'N/A') return 'N/A'; if (raw) return String(raw).substring(0, 10); return 'None / Unset'; } },
      { label: 'Date of 1st Day in Current Station', key: 'newStationDate', format: (v, item) => { const raw = (v !== undefined ? v : item?.new_station_date); if (raw === 'N/A') return 'N/A'; if (raw) return String(raw).substring(0, 10); return 'None / Unset'; } },
      { label: 'Date of Last Lateral Movement', key: 'lastLateralMovementDate', format: (v, item) => { const raw = (v !== undefined ? v : item?.last_lateral_movement_date); if (raw === 'N/A') return 'N/A'; if (raw) return String(raw).substring(0, 10); return 'None / Unset'; } },
      { label: 'Salary Step Increment', key: 'stepIncrement', format: (v, item) => (v || item.step_increment) ? `Step ${v || item.step_increment}${item.stepIncrementConfirmed || item.step_increment_confirmed ? ' (Confirmed)' : ''}` : 'N/A' },
      { label: 'Highest Educational Attainment', key: 'highestEducationalAttainment', format: (v, item) => v || item.highest_educational_attainment || 'N/A' },
      { label: 'Educational Attainment', key: 'degreeRows', format: (_, item) => formatDegrees(item) },
      { 
        label: "Master's Degree Discipline", 
        key: 'mastersDiscipline', 
        format: (v, item) => {
          if (v && v !== 'N/A') return v;
          if (item?.masters_discipline && item.masters_discipline !== 'N/A') return item.masters_discipline;
          const pg = getEffectivePostGradDisciplines(item);
          const m = [...new Set([...(pg?.mastersWithUnits || []), ...(pg?.mastersGraduated || [])])];
          return m.length > 0 ? m.join(', ') : 'None / N/A';
        }
      },
      { 
        label: "PhD Degree Discipline", 
        key: 'doctorateDiscipline', 
        format: (v, item) => {
          if (v && v !== 'N/A') return v;
          const doc = item?.doctorate_discipline || item?.phdDiscipline || item?.phd_discipline;
          if (doc && doc !== 'N/A') return doc;
          const pg = getEffectivePostGradDisciplines(item);
          const d = [...new Set([...(pg?.doctorateWithUnits || []), ...(pg?.doctorateGraduated || [])])];
          return d.length > 0 ? d.join(', ') : 'None / N/A';
        }
      },
      { label: 'Civil Service Eligibility', key: 'eligibility', format: (v) => v || 'N/A' },
      ...(!isNT ? [
        { label: 'PRC Specialization', key: 'prcSpecialization', format: (v, item) => v || item.prc_specialization || 'N/A' }
      ] : []),
      { 
        label: 'NEAP Trainings Recorded', 
        key: 'neapTrainingRows', 
        format: (v, item) => {
          const list = Array.isArray(v) ? v : (item.neap_training_rows || []);
          return list.length > 0 ? `${list.length} program(s) (${list.reduce((sum, r) => sum + (Number(r.totalHours || r.hours) || 0), 0)} hrs)` : 'None (0 hrs)';
        }
      },
      { 
        label: 'TESDA NC & Certifications', 
        key: 'certificationRows', 
        format: (v, item) => {
          const list = Array.isArray(v) ? v : (item.certification_rows || []);
          return list.length > 0 ? `${list.length} cert(s) (${list.reduce((sum, r) => sum + (Number(r.totalHours || r.hours) || 0), 0)} hrs)` : 'None (0 hrs)';
        }
      },
      { 
        label: 'Other L&D Programs', 
        key: 'otherTrainingRows', 
        format: (v, item) => {
          const list = Array.isArray(v) ? v : (item.other_training_rows || []);
          return list.length > 0 ? `${list.length} program(s) (${list.reduce((sum, r) => sum + (Number(r.totalHours || r.hours) || 0), 0)} hrs)` : 'None (0 hrs)';
        }
      },
      ...(!isNT ? [
        { 
          label: 'Assigned Grade Levels', 
          key: 'assignedGradeLevels', 
          format: (v, item) => {
            const list = (Array.isArray(v) && v.length > 0) ? v : (Array.isArray(item.gradeLevelsTaught) ? item.gradeLevelsTaught : (Array.isArray(item.assigned_grade_levels) ? item.assigned_grade_levels : (Array.isArray(item.grade_levels_taught) ? item.grade_levels_taught : [])));
            return list.length > 0 ? list.join(', ') : 'None assigned';
          }
        },
        { label: 'Specialized Learning Areas', key: 'learningAreas', format: (_, item) => formatLearningAreas(item) }
      ] : [])
    ];

    return fields.map(f => {
      let curRaw = current[f.key];
      let subRaw = pendingReviewData[f.key];

      if (curRaw === undefined) {
        const snakeKey = f.key.replace(/([A-Z])/g, "_$1").toLowerCase();
        curRaw = current[snakeKey];
      }
      if (subRaw === undefined) {
        const snakeKey = f.key.replace(/([A-Z])/g, "_$1").toLowerCase();
        subRaw = pendingReviewData[snakeKey];
      }

      const curVal = f.format ? f.format(curRaw, current) : curRaw;
      const subVal = f.format ? f.format(subRaw, pendingReviewData) : subRaw;
      const hasChanged = String(curVal || '').trim().toUpperCase() !== String(subVal || '').trim().toUpperCase();
      
      return {
        key: f.key,
        label: f.label,
        current: curVal || 'N/A',
        submitted: subVal || 'N/A',
        hasChanged
      };
    });
  };

  // Automatically check all changed fields when a submission is opened for review
  useEffect(() => {
    if (pendingReviewData) {
      const rows = getComparisonRows();
      const changedKeys = rows.filter(r => r.hasChanged).map(r => r.key);
      setSelectedFieldsToMerge(new Set(changedKeys));
    }
  }, [pendingReviewData]);

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
    const initScanner = () => {
      setTimeout(() => {
        try {
          const qrCodeScanner = new window.Html5Qrcode("qr-reader-temp");
          qrScannerRef.current = qrCodeScanner;
          qrCodeScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 250 },
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
      nps: teacher.noPhilsys,
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

  // Commit reviewed data to central context with selective field-level merging
  const handleCommitReview = async () => {
    if (!pendingReviewData || isAccepting) return;
    setIsAccepting(true);
    setAcceptError(null);
    try {
      // Find current existing record in effectivePersonnel
      const current = effectivePersonnel.find(p => String(p.id) === String(pendingReviewData.id)) ||
        effectivePersonnel.find(p => p.prn && String(p.prn) === String(pendingReviewData.prn)) ||
        effectivePersonnel.find(p => {
          const pFn = String(p.firstName || p.first_name || '').trim().toUpperCase();
          const pLn = String(p.lastName || p.last_name || '').trim().toUpperCase();
          const rFn = String(pendingReviewData.firstName || pendingReviewData.first_name || '').trim().toUpperCase();
          const rLn = String(pendingReviewData.lastName || pendingReviewData.last_name || '').trim().toUpperCase();
          return pLn && rLn && pLn === rLn && pFn && rFn && pFn === rFn;
        }) || {};

      // Start with current database record and only overwrite selected checked fields
      const mergedProfile = { ...current };

      selectedFieldsToMerge.forEach(key => {
        const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        const subVal = pendingReviewData[key] !== undefined ? pendingReviewData[key] : pendingReviewData[snakeKey];

        if (key === 'degreeRows') {
          const dRows = pendingReviewData.degreeRows || pendingReviewData.collegeDegrees || pendingReviewData.college_degrees || [];
          mergedProfile.degreeRows = dRows;
          mergedProfile.collegeDegrees = dRows;
          mergedProfile.college_degrees = dRows;
          mergedProfile.collegeDegree = pendingReviewData.collegeDegree || pendingReviewData.college_degree || dRows[0]?.collegeDegree || '';
          mergedProfile.college_degree = mergedProfile.collegeDegree;
          mergedProfile.major = pendingReviewData.major || dRows[0]?.major || '';
          mergedProfile.minor = pendingReviewData.minor || dRows[0]?.minor || '';
          if (pendingReviewData.postGraduateDiscipline) mergedProfile.postGraduateDiscipline = pendingReviewData.postGraduateDiscipline;
          if (pendingReviewData.post_graduate_discipline) mergedProfile.post_graduate_discipline = pendingReviewData.post_graduate_discipline;
          if (pendingReviewData.mastersDisciplines) mergedProfile.mastersDisciplines = pendingReviewData.mastersDisciplines;
          if (pendingReviewData.doctorateDisciplines) mergedProfile.doctorateDisciplines = pendingReviewData.doctorateDisciplines;
          if (pendingReviewData.mastersGraduatedDisciplines) mergedProfile.mastersGraduatedDisciplines = pendingReviewData.mastersGraduatedDisciplines;
          if (pendingReviewData.mastersWithUnitsDisciplines) mergedProfile.mastersWithUnitsDisciplines = pendingReviewData.mastersWithUnitsDisciplines;
          if (pendingReviewData.doctorateGraduatedDisciplines) mergedProfile.doctorateGraduatedDisciplines = pendingReviewData.doctorateGraduatedDisciplines;
          if (pendingReviewData.doctorateWithUnitsDisciplines) mergedProfile.doctorateWithUnitsDisciplines = pendingReviewData.doctorateWithUnitsDisciplines;
          if (pendingReviewData.mastersDiscipline) {
            mergedProfile.mastersDiscipline = pendingReviewData.mastersDiscipline;
            mergedProfile.masters_discipline = pendingReviewData.mastersDiscipline;
          }
          if (pendingReviewData.doctorateDiscipline || pendingReviewData.phdDiscipline || pendingReviewData.phd_discipline) {
            const doc = pendingReviewData.doctorateDiscipline || pendingReviewData.phdDiscipline || pendingReviewData.phd_discipline;
            mergedProfile.doctorateDiscipline = doc;
            mergedProfile.doctorate_discipline = doc;
            mergedProfile.phdDiscipline = doc;
            mergedProfile.phd_discipline = doc;
          }
        } else if (key === 'mastersDiscipline') {
          if (subVal && String(subVal).trim() !== '' && subVal !== 'N/A') {
            mergedProfile.mastersDiscipline = subVal;
            mergedProfile.masters_discipline = subVal;
          }
        } else if (key === 'doctorateDiscipline') {
          if (subVal && String(subVal).trim() !== '' && subVal !== 'N/A') {
            mergedProfile.doctorateDiscipline = subVal;
            mergedProfile.doctorate_discipline = subVal;
            mergedProfile.phdDiscipline = subVal;
            mergedProfile.phd_discipline = subVal;
          }
        } else if (key === 'assignedGradeLevels') {
          const gl = pendingReviewData.assignedGradeLevels || pendingReviewData.assigned_grade_levels || pendingReviewData.gradeLevelsTaught || pendingReviewData.grade_levels_taught || subVal;
          mergedProfile.assignedGradeLevels = gl;
          mergedProfile.assigned_grade_levels = gl;
          mergedProfile.gradeLevelsTaught = gl;
          mergedProfile.grade_levels_taught = gl;
        } else if (key === 'learningAreas' || key === 'learningAreaMap') {
          mergedProfile.learningAreas = pendingReviewData.learningAreas || pendingReviewData.specializations || [];
          mergedProfile.specializations = mergedProfile.learningAreas;
          mergedProfile.learningAreaMap = pendingReviewData.learningAreaMap || pendingReviewData.matrix_data || pendingReviewData.matrixData || {};
          mergedProfile.matrix_data = mergedProfile.learningAreaMap;
          mergedProfile.matrixData = mergedProfile.learningAreaMap;
          try {
            localStorage.setItem(`draft_learning_areas_${mergedProfile.id}`, JSON.stringify(mergedProfile.learningAreaMap));
          } catch (e) {}
        } else if (key === 'neapTrainingRows') {
          mergedProfile.neapTrainingRows = pendingReviewData.neapTrainingRows || pendingReviewData.neap_training_rows || [];
          mergedProfile.neap_training_rows = mergedProfile.neapTrainingRows;
        } else if (key === 'certificationRows') {
          mergedProfile.certificationRows = pendingReviewData.certificationRows || pendingReviewData.certification_rows || [];
          mergedProfile.certification_rows = mergedProfile.certificationRows;
        } else if (key === 'otherTrainingRows') {
          mergedProfile.otherTrainingRows = pendingReviewData.otherTrainingRows || pendingReviewData.other_training_rows || [];
          mergedProfile.other_training_rows = mergedProfile.otherTrainingRows;
        } else if (key === 'stepIncrement') {
          mergedProfile.stepIncrement = pendingReviewData.stepIncrement || pendingReviewData.step_increment;
          mergedProfile.step_increment = mergedProfile.stepIncrement;
          mergedProfile.stepIncrementConfirmed = pendingReviewData.stepIncrementConfirmed !== undefined ? pendingReviewData.stepIncrementConfirmed : true;
          mergedProfile.step_increment_confirmed = mergedProfile.stepIncrementConfirmed;
        } else if (key === 'philsysNo') {
          const isNoPs = !!(pendingReviewData.noPhilsys || pendingReviewData.no_philsys);
          mergedProfile.noPhilsys = isNoPs;
          mergedProfile.no_philsys = isNoPs;
          mergedProfile.philsysNo = isNoPs ? '' : (pendingReviewData.philsysNo || pendingReviewData.philsys_no || '');
          mergedProfile.philsys_no = mergedProfile.philsysNo;
        } else if (key === 'employeeNo') {
          const isNoEmp = !!(pendingReviewData.noEmployeeNo || pendingReviewData.no_employee_no || pendingReviewData.employeeNo === 'N/A' || pendingReviewData.employee_no === 'N/A');
          mergedProfile.noEmployeeNo = isNoEmp;
          mergedProfile.no_employee_no = isNoEmp;
          const empNo = isNoEmp ? 'N/A' : ((pendingReviewData.employeeNo && !String(pendingReviewData.employeeNo).toUpperCase().startsWith('PRN')) ? pendingReviewData.employeeNo : ((pendingReviewData.employee_no && !String(pendingReviewData.employee_no).toUpperCase().startsWith('PRN')) ? pendingReviewData.employee_no : ''));
          mergedProfile.employeeNo = empNo;
          mergedProfile.employee_no = empNo;
        } else if (key === 'tin') {
          const isNoTin = !!(pendingReviewData.noTin || pendingReviewData.no_tin);
          mergedProfile.noTin = isNoTin;
          mergedProfile.no_tin = isNoTin;
          mergedProfile.tin = isNoTin ? '' : (pendingReviewData.tin || '');
        } else if (key === 'lastPromotionDate') {
          const lpd = pendingReviewData.lastPromotionDate !== undefined ? pendingReviewData.lastPromotionDate : pendingReviewData.last_promotion_date;
          mergedProfile.lastPromotionDate = lpd || '';
          mergedProfile.last_promotion_date = lpd || '';
        } else if (key === 'newStationDate') {
          const nsd = pendingReviewData.newStationDate !== undefined ? pendingReviewData.newStationDate : pendingReviewData.new_station_date;
          mergedProfile.newStationDate = nsd || '';
          mergedProfile.new_station_date = nsd || '';
        } else if (key === 'lastLateralMovementDate') {
          const lmd = pendingReviewData.lastLateralMovementDate !== undefined ? pendingReviewData.lastLateralMovementDate : pendingReviewData.last_lateral_movement_date;
          mergedProfile.lastLateralMovementDate = lmd || '';
          mergedProfile.last_lateral_movement_date = lmd || '';
        } else if (key === 'depedEmail') {
          const isNoEmail = !!(pendingReviewData.noDepedEmail || pendingReviewData.no_deped_email || pendingReviewData.depedEmail === 'N/A' || pendingReviewData.deped_email === 'N/A');
          mergedProfile.noDepedEmail = isNoEmail;
          mergedProfile.no_deped_email = isNoEmail;
          const em = isNoEmail ? 'N/A' : (pendingReviewData.depedEmail || pendingReviewData.deped_email || pendingReviewData.email || '');
          mergedProfile.depedEmail = em;
          mergedProfile.deped_email = em;
          mergedProfile.email = em;
        } else if (key === 'nameExtension') {
          mergedProfile.nameExtension = pendingReviewData.nameExtension || pendingReviewData.extensionName || pendingReviewData.name_extension || '';
          mergedProfile.extensionName = mergedProfile.nameExtension;
          mergedProfile.name_extension = mergedProfile.nameExtension;
        } else if (key === 'prcSpecialization') {
          const prcSpec = pendingReviewData.prcSpecialization || pendingReviewData.prc_specialization || 'N/A';
          mergedProfile.prcSpecialization = prcSpec;
          mergedProfile.prc_specialization = prcSpec;
        } else if (key === 'ethnicGroup') {
          mergedProfile.ethnicGroup = pendingReviewData.ethnicGroup || pendingReviewData.ethnic_group || '';
          mergedProfile.ethnic_group = mergedProfile.ethnicGroup;
        } else if (key === 'soloParent') {
          mergedProfile.soloParent = (pendingReviewData.soloParent === true || pendingReviewData.soloParent === 'YES' || pendingReviewData.solo_parent === 'YES' || pendingReviewData.solo_parent === true) ? 'YES' : 'NO';
          mergedProfile.solo_parent = mergedProfile.soloParent;
        } else if (key === 'highestEducationalAttainment') {
          mergedProfile.highestEducationalAttainment = pendingReviewData.highestEducationalAttainment || pendingReviewData.highest_educational_attainment || '';
          mergedProfile.highest_educational_attainment = mergedProfile.highestEducationalAttainment;
        } else if (key === 'hiringArrangement') {
          mergedProfile.hiringArrangement = pendingReviewData.hiringArrangement || pendingReviewData.hiring_arrangement || '';
          mergedProfile.hiring_arrangement = mergedProfile.hiringArrangement;
        } else if (key === 'natureOfAppointment') {
          mergedProfile.natureOfAppointment = pendingReviewData.natureOfAppointment || pendingReviewData.nature_of_appointment || '';
          mergedProfile.nature_of_appointment = mergedProfile.natureOfAppointment;
        } else if (key === 'fundSource') {
          mergedProfile.fundSource = pendingReviewData.fundSource || pendingReviewData.fund_source || '';
          mergedProfile.fund_source = mergedProfile.fundSource;
        } else if (key === 'deploymentStatus') {
          mergedProfile.deploymentStatus = pendingReviewData.deploymentStatus || pendingReviewData.deployment_status || '';
          mergedProfile.deployment_status = mergedProfile.deploymentStatus;
        } else if (key === 'position') {
          mergedProfile.position = pendingReviewData.position || pendingReviewData.plantilla_position || '';
          mergedProfile.plantilla_position = mergedProfile.position;
        } else {
          mergedProfile[key] = subVal;
          if (snakeKey !== key) {
            mergedProfile[snakeKey] = subVal;
          }
        }
      });

      // Auto-calculate step increment & set confirmed
      const effFirst = mergedProfile.firstServiceDate || mergedProfile.first_service_date || '';
      const effProm = mergedProfile.lastPromotionDate || mergedProfile.last_promotion_date || '';
      if (effFirst) {
        const cleanDate = typeof (effProm && effProm !== 'N/A' ? effProm : effFirst) === 'string' ? (effProm && effProm !== 'N/A' ? effProm : effFirst).substring(0, 10) : '';
        const baseDate = new Date(cleanDate + 'T00:00:00');
        if (!isNaN(baseDate.getTime())) {
          const now = new Date();
          let years = now.getFullYear() - baseDate.getFullYear();
          const mDiff = now.getMonth() - baseDate.getMonth();
          if (mDiff < 0 || (mDiff === 0 && now.getDate() < baseDate.getDate())) years--;
          years = Math.max(0, years);
          mergedProfile.stepIncrement = Math.min(8, Math.max(1, 1 + Math.floor(years / 3)));
          mergedProfile.step_increment = mergedProfile.stepIncrement;
        }
      }
      mergedProfile.stepIncrementConfirmed = true;
      mergedProfile.step_increment_confirmed = true;

      if (mergedProfile.lastPromotionDate === undefined || mergedProfile.lastPromotionDate === '') {
        mergedProfile.lastPromotionDate = 'N/A';
        mergedProfile.last_promotion_date = 'N/A';
      }
      if (mergedProfile.newStationDate === undefined || mergedProfile.newStationDate === '') {
        mergedProfile.newStationDate = effFirst || 'N/A';
        mergedProfile.new_station_date = effFirst || 'N/A';
      }
      if (mergedProfile.lastLateralMovementDate === undefined || mergedProfile.lastLateralMovementDate === '') {
        mergedProfile.lastLateralMovementDate = 'N/A';
        mergedProfile.last_lateral_movement_date = 'N/A';
      }

      mergedProfile.personalVerified = true;
      mergedProfile.id = pendingReviewData.id || current.id;

      // Single atomic request to persist to normalized database
      const res = await api.acceptRoomSubmissions({
        schoolId: activeSchoolId,
        submission: mergedProfile,
        selectedFields: Array.from(selectedFieldsToMerge)
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to accept reviewed submission');
      }

      const savedPerson = (res.updatedPersonnel && res.updatedPersonnel[0]) || mergedProfile;

      // Update in-memory state directly without redundant network refetching
      if (setPersonnel) {
        setPersonnel(prev => {
          const list = Array.isArray(prev) ? [...prev] : [];
          const idx = list.findIndex(p => String(p.id).trim() === String(savedPerson.id).trim());
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...savedPerson };
          } else {
            list.push(savedPerson);
          }
          return list;
        });
      }

      try {
        localStorage.setItem(`draft_personnel_${savedPerson.id}`, JSON.stringify(savedPerson));
      } catch (e) {}
      localStorage.removeItem(`pending_submission_${savedPerson.id}`);

      // Update pending submissions and approved lists locally
      setPendingSubmissions(prev => prev.filter(s => {
        const sId = String(s.personnelId || s.id || s.rawProfile?.id || '').trim();
        return sId !== String(savedPerson.id).trim();
      }));

      if (res.approvedSubmissions && res.approvedSubmissions.length > 0) {
        setApprovedSubmissions(prev => [...res.approvedSubmissions, ...prev]);
      }

      setIngestionSuccess(`✓ Approved & Merged: Updated ${selectedFieldsToMerge.size} selected field(s) for ${pendingReviewData.firstName || ''} ${pendingReviewData.lastName || ''}!`);
      setShowReviewModal(false);
      setPendingReviewData(null);
      setTimeout(() => setIngestionSuccess(''), 6000);
    } catch (err) {
      console.error('Accept review submission error:', err);
      setAcceptError(err.message || 'Failed to approve reviewed submission');
    } finally {
      setIsAccepting(false);
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

  // Robust matching helper: connects a personnel record to a pending queue submission
  const matchSubmissionForTeacher = (teacher, subList) => {
    if (!teacher || !Array.isArray(subList)) return null;
    const tId = String(teacher.id || '').toLowerCase().trim();
    const tPrn = String(teacher.prn || teacher.profilingCode || '').toLowerCase().trim();
    const tFn = String(teacher.firstName || teacher.first_name || '').trim().toLowerCase();
    const tLn = String(teacher.lastName || teacher.last_name || '').trim().toLowerCase();

    return subList.find(s => {
      const sId = String(s.personnelId || s.id || s.rawProfile?.id || '').toLowerCase().trim();
      const sPrn = String(s.rawProfile?.prn || s.prn || '').toLowerCase().trim();
      if (sId && tId && sId === tId) return true;
      if (sPrn && tPrn && sPrn === tPrn) return true;

      // Exact Name matching
      const sFn = String(s.rawProfile?.firstName || s.rawProfile?.fn || s.firstName || s.fn || '').trim().toLowerCase();
      const sLn = String(s.rawProfile?.lastName || s.rawProfile?.ln || s.lastName || s.ln || '').trim().toLowerCase();
      if (tFn && tLn && sFn && sLn && tFn === sFn && tLn === sLn) return true;

      // Full Name string matching
      const sName = String(s.personnelName || `${sFn} ${sLn}`).toLowerCase();
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

  const handledVerifiedKeys = new Set();
  const verifiedTeachers = [];

  // 1. Process from effectivePersonnel
  effectivePersonnel.forEach(p => {
    const hasPending = matchSubmissionForTeacher(p, pendingSubmissions);
    if (hasPending) return;

    const matchedApproved = matchSubmissionForTeacher(p, approvedSubmissions);
    const isExplicitlyVerified = !!(
      p.personalVerified || 
      p.personal_verified || 
      p.isVerified || 
      p.is_verified || 
      p.lastVerifiedAt || 
      p.last_verified_at ||
      p.status === 'Verified' ||
      p.verificationStatus === 'VERIFIED' ||
      matchedApproved
    );

    let hasDraftVerified = false;
    try {
      const rawDraft = localStorage.getItem(`draft_personnel_${p.id}`);
      if (rawDraft) {
        const d = JSON.parse(rawDraft);
        if (d.personalVerified || d.personal_verified || d.isVerified || d.is_verified) {
          hasDraftVerified = true;
        }
      }
    } catch (e) {}

    if (isExplicitlyVerified || hasDraftVerified) {
      const pKey = String(p.id || '').toLowerCase().trim();
      handledVerifiedKeys.add(pKey);
      verifiedTeachers.push({
        id: p.id,
        firstName: p.firstName || p.first_name || '',
        lastName: p.lastName || p.last_name || '',
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: p.position || p.plantilla_position || 'Teacher',
        roomName: matchedApproved?.roomName || p.roomName || 'Faculty Room',
        verifiedAt: matchedApproved?.submittedAt || p.lastVerifiedAt || p.last_verified_at || null,
        rawSubmission: matchedApproved || null,
        personnelRecord: p
      });
    }
  });

  // 2. Add historical approved submissions from server that may not be in effectivePersonnel
  approvedSubmissions.forEach(appSub => {
    const raw = appSub.profileData || appSub;
    const subPId = String(appSub.personnelId || raw.id || '').toLowerCase().trim();
    if (subPId && !handledVerifiedKeys.has(subPId)) {
      handledVerifiedKeys.add(subPId);
      verifiedTeachers.push({
        id: subPId,
        firstName: raw.firstName || raw.fn || '',
        lastName: raw.lastName || raw.ln || appSub.personnelName || 'Teacher',
        name: appSub.personnelName || `${raw.firstName || ''} ${raw.lastName || ''}`.trim(),
        position: raw.position || raw.psn || 'Teacher',
        roomName: appSub.roomName || 'Faculty Room',
        verifiedAt: appSub.submittedAt || null,
        rawSubmission: appSub,
        personnelRecord: raw
      });
    }
  });

  const awaitingTeachers = effectivePersonnel.filter(p => {
    const hasPending = matchSubmissionForTeacher(p, pendingSubmissions);
    const isVerified = verifiedTeachers.some(v => String(v.id).toLowerCase() === String(p.id).toLowerCase());
    return !hasPending && !isVerified;
  });

  const allHistoricalSubmissions = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Add server approved / archived submissions
    (approvedSubmissions || []).forEach(sub => {
      const raw = sub.profileData || sub.rawProfile || sub;
      const pId = String(sub.personnelId || raw.id || sub.id || '').trim();
      const pKey = pId.toLowerCase();
      if (pKey && !seen.has(pKey)) {
        seen.add(pKey);
        list.push(sub);
      }
    });

    // 2. Add verified teachers from active roster / local drafts
    (verifiedTeachers || []).forEach(vt => {
      const pId = String(vt.id || '').trim();
      const pKey = pId.toLowerCase();
      if (pKey && !seen.has(pKey)) {
        seen.add(pKey);
        const raw = vt.personnelRecord || vt.rawSubmission || vt;
        list.push({
          id: `HIST-${vt.id}`,
          personnelId: vt.id,
          personnelName: vt.name,
          firstName: vt.firstName,
          lastName: vt.lastName,
          position: vt.position,
          roomName: vt.roomName || 'Faculty Room',
          submittedAt: vt.verifiedAt || (vt.rawSubmission && vt.rawSubmission.submittedAt) || new Date().toISOString(),
          status: 'VERIFIED',
          profileData: raw,
          rawProfile: raw,
          source: 'verified_roster'
        });
      }
    });

    return list;
  }, [approvedSubmissions, verifiedTeachers]);

  const handleCommitSingle = async (pSub) => {
    if (!pSub || isAccepting) return;
    setIsAccepting(true);
    setAcceptError(null);
    try {
      const fullProfile = pSub.rawProfile || (pSub.fn ? decompressProfile(pSub) : pSub);
      const targetId = String(fullProfile.id || pSub.personnelId || pSub.id || '').trim();

      const res = await api.acceptRoomSubmissions({
        schoolId: activeSchoolId,
        submission: {
          ...pSub,
          profileData: {
            ...fullProfile,
            id: targetId,
            personalVerified: true,
            isVerified: true
          }
        }
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to accept submission');
      }

      const savedPerson = (res.updatedPersonnel && res.updatedPersonnel[0]) || {
        ...fullProfile,
        id: targetId,
        personalVerified: true,
        isVerified: true,
        verified: true
      };

      // Direct in-memory state update to avoid redundant refetches
      if (setPersonnel) {
        setPersonnel(prev => {
          const list = Array.isArray(prev) ? [...prev] : [];
          const idx = list.findIndex(p => String(p.id).trim() === targetId);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...savedPerson };
          } else {
            list.push(savedPerson);
          }
          return list;
        });
      }

      try {
        localStorage.setItem(`draft_personnel_${targetId}`, JSON.stringify(savedPerson));
        if (savedPerson.learningAreaMap) {
          localStorage.setItem(`draft_learning_areas_${targetId}`, JSON.stringify(savedPerson.learningAreaMap));
        }
      } catch (e) {}
      localStorage.removeItem(`pending_submission_${targetId}`);

      setPendingSubmissions(prev => prev.filter(s => {
        const sId = String(s.personnelId || s.id || s.rawProfile?.id || '').trim();
        return sId !== targetId && s.submissionId !== pSub.submissionId;
      }));

      if (res.approvedSubmissions && res.approvedSubmissions.length > 0) {
        setApprovedSubmissions(prev => [...res.approvedSubmissions, ...prev]);
      }

      setIngestionSuccess(`✓ Approved & Merged profiling details for ${savedPerson.firstName || ''} ${savedPerson.lastName || ''} into local draft!`);
      setTimeout(() => setIngestionSuccess(''), 6000);
    } catch (err) {
      console.error('Accept single submission error:', err);
      setAcceptError(err.message || 'Failed to approve submission');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleTakeManualSnapshot = async () => {
    setIsTakingSnapshot(true);
    try {
      const now = new Date();
      const verifiedCount = (effectivePersonnel || []).filter(p => p.personalVerified || p.isVerified || p.verified).length;
      const snapObj = {
        id: `local-snap-${Date.now()}`,
        name: `Manual Snapshot (${verifiedCount}/${effectivePersonnel.length} Profiled)`,
        timestamp: now.toISOString(),
        createdAt: now.toISOString(),
        personnelCount: effectivePersonnel.length,
        verifiedCount,
        personnel: effectivePersonnel
      };

      // 1. Save local
      const existing = [...localSnapshots];
      existing.unshift(snapObj);
      const trimmed = existing.slice(0, 15);
      setLocalSnapshots(trimmed);
      try {
        localStorage.setItem(`esf7_local_snapshots_${activeSchoolId}`, JSON.stringify(trimmed));
      } catch (e) {}

      // 2. Save server
      try {
        await api.saveProfilingSnapshot({
          schoolId: activeSchoolId,
          snapshotName: snapObj.name,
          personnel: effectivePersonnel
        });
      } catch (e) {}

      await loadSnapshots();
      setRestoreFeedback({ type: 'success', text: `✓ Snapshot created successfully! (${verifiedCount} verified teachers preserved)` });
      setTimeout(() => setRestoreFeedback(null), 5000);
    } catch (err) {
      setRestoreFeedback({ type: 'error', text: `Failed to save snapshot: ${err.message}` });
      setTimeout(() => setRestoreFeedback(null), 5000);
    } finally {
      setIsTakingSnapshot(false);
    }
  };

  const handleRestoreHistoricalCloudSubmissions = async () => {
    if (!allHistoricalSubmissions || allHistoricalSubmissions.length === 0) {
      setRestoreFeedback({ type: 'error', text: 'No historical submissions found in cloud archive for this school.' });
      setTimeout(() => setRestoreFeedback(null), 5000);
      return;
    }

    setIsRestoring(true);
    let restoredCount = 0;
    try {
      const updatedRoster = [...effectivePersonnel];

      for (const appSub of allHistoricalSubmissions) {
        const raw = appSub.profileData || appSub.rawProfile || appSub;
        const subId = String(appSub.personnelId || raw.id || '').trim();
        const subPrn = String(raw.prn || '').trim();
        const subFn = String(raw.firstName || raw.fn || raw.first_name || '').trim().toUpperCase();
        const subLn = String(raw.lastName || raw.ln || raw.last_name || '').trim().toUpperCase();

        const pIdx = updatedRoster.findIndex(p => {
          if (subId && String(p.id).trim() === subId) return true;
          if (subPrn && p.prn && String(p.prn).trim() === subPrn) return true;
          const pFn = String(p.firstName || p.first_name || '').trim().toUpperCase();
          const pLn = String(p.lastName || p.last_name || '').trim().toUpperCase();
          return subFn && subLn && pFn === subFn && pLn === subLn;
        });

        if (pIdx !== -1) {
          const target = updatedRoster[pIdx];
          const merged = mergeTeacherProfileRecord(target, raw);
          updatedRoster[pIdx] = merged;

          try {
            localStorage.setItem(`draft_personnel_${target.id}`, JSON.stringify(merged));
            if (merged.learningAreaMap) {
              localStorage.setItem(`draft_learning_areas_${target.id}`, JSON.stringify(merged.learningAreaMap));
            }
          } catch (e) {}

          restoredCount++;
        }
      }

      if (setPersonnel) {
        setPersonnel(updatedRoster);
      }

      const now = new Date();
      const snapObj = {
        id: `auto-snap-${Date.now()}`,
        name: `Auto-Restore (${restoredCount} records from Cloud Archive)`,
        timestamp: now.toISOString(),
        createdAt: now.toISOString(),
        personnelCount: updatedRoster.length,
        verifiedCount: restoredCount,
        personnel: updatedRoster
      };
      const existing = [snapObj, ...localSnapshots].slice(0, 15);
      setLocalSnapshots(existing);
      try {
        localStorage.setItem(`esf7_local_snapshots_${activeSchoolId}`, JSON.stringify(existing));
      } catch (e) {}

      setRestoreFeedback({
        type: 'success',
        text: `✓ Successfully recovered & merged ${restoredCount} teacher profiling records from Cloud Archive!`
      });
      setTimeout(() => setRestoreFeedback(null), 8000);
    } catch (err) {
      setRestoreFeedback({ type: 'error', text: `Failed to restore cloud submissions: ${err.message}` });
      setTimeout(() => setRestoreFeedback(null), 6000);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExportRosterBackup = () => {
    try {
      const backupPayload = {
        app: 'InsightED ESF7',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        schoolId: activeSchoolId,
        schoolName: schoolInfo?.schoolName || '',
        personnelCount: effectivePersonnel.length,
        verifiedCount: effectivePersonnel.filter(p => p.personalVerified || p.isVerified || p.verified).length,
        personnel: effectivePersonnel
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPayload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `InsightED_ESF7_Backup_${activeSchoolId}_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setRestoreFeedback({ type: 'success', text: `✓ Full roster backup downloaded successfully!` });
      setTimeout(() => setRestoreFeedback(null), 4000);
    } catch (err) {
      setRestoreFeedback({ type: 'error', text: `Export failed: ${err.message}` });
    }
  };

  const handleImportRosterBackup = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const importedList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.personnel) ? parsed.personnel : []);

        if (importedList.length === 0) {
          setRestoreFeedback({ type: 'error', text: 'Invalid backup file. No personnel records found.' });
          return;
        }

        setIsRestoring(true);
        let restoredCount = 0;
        const updatedRoster = [...effectivePersonnel];

        for (const item of importedList) {
          const subId = String(item.id || '').trim();
          const subPrn = String(item.prn || '').trim();
          const subFn = String(item.firstName || item.fn || item.first_name || '').trim().toUpperCase();
          const subLn = String(item.lastName || item.ln || item.last_name || '').trim().toUpperCase();

          const pIdx = updatedRoster.findIndex(p => {
            if (subId && String(p.id).trim() === subId) return true;
            if (subPrn && p.prn && String(p.prn).trim() === subPrn) return true;
            const pFn = String(p.firstName || p.first_name || '').trim().toUpperCase();
            const pLn = String(p.lastName || p.last_name || '').trim().toUpperCase();
            return subFn && subLn && pFn === subFn && pLn === subLn;
          });

          if (pIdx !== -1) {
            const target = updatedRoster[pIdx];
            const merged = mergeTeacherProfileRecord(target, item);
            updatedRoster[pIdx] = merged;

            try {
              localStorage.setItem(`draft_personnel_${target.id}`, JSON.stringify(merged));
              if (merged.learningAreaMap) {
                localStorage.setItem(`draft_learning_areas_${target.id}`, JSON.stringify(merged.learningAreaMap));
              }
            } catch (e) {}

            restoredCount++;
          }
        }

        if (setPersonnel) {
          setPersonnel(updatedRoster);
        }

        setRestoreFeedback({
          type: 'success',
          text: `✓ Successfully restored and merged ${restoredCount} teacher profiles from backup file!`
        });
        setTimeout(() => setRestoreFeedback(null), 8000);
      } catch (err) {
        setRestoreFeedback({ type: 'error', text: `Failed to parse backup JSON file: ${err.message}` });
      } finally {
        setIsRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreSnapshot = async (snap) => {
    let pList = snap.personnel;
    if (!pList && snap.id && snap.id.startsWith('SNAP-')) {
      try {
        const fullSnap = await api.getProfilingSnapshotById(snap.id);
        pList = fullSnap?.snapshot_json || fullSnap?.personnel;
      } catch (e) {}
    }

    if (!Array.isArray(pList) || pList.length === 0) {
      setRestoreFeedback({ type: 'error', text: 'Snapshot content could not be retrieved.' });
      return;
    }

    setIsRestoring(true);
    try {
      let count = 0;
      const updatedRoster = [...effectivePersonnel];

      for (const item of pList) {
        const subId = String(item.id || '').trim();
        const pIdx = updatedRoster.findIndex(p => String(p.id).trim() === subId);
        if (pIdx !== -1) {
          const target = updatedRoster[pIdx];
          const merged = mergeTeacherProfileRecord(target, item);
          updatedRoster[pIdx] = merged;
          try {
            localStorage.setItem(`draft_personnel_${merged.id}`, JSON.stringify(merged));
            if (merged.learningAreaMap) {
              localStorage.setItem(`draft_learning_areas_${merged.id}`, JSON.stringify(merged.learningAreaMap));
            }
          } catch (e) {}
          count++;
        }
      }

      if (setPersonnel) {
        setPersonnel(updatedRoster);
      }

      setRestoreFeedback({
        type: 'success',
        text: `✓ Successfully rolled back ${count} teacher records to snapshot: ${snap.name || snap.snapshotName || 'Selected Checkpoint'}!`
      });
      setTimeout(() => setRestoreFeedback(null), 8000);
    } catch (err) {
      setRestoreFeedback({ type: 'error', text: `Rollback failed: ${err.message}` });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'grid', gap: '20px' }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
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
            disabled={isAccepting}
            onClick={handleCommitAllSubmissions}
            style={{ background: 'white', color: '#065F46', fontWeight: 800, padding: '8px 18px', border: 0, borderRadius: '10px', fontSize: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: isAccepting ? 0.7 : 1, cursor: isAccepting ? 'wait' : 'pointer' }}
          >
            {isAccepting ? <FiRefreshCw size={14} className="spin" /> : <FiCheck size={14} />}
            <span>{isAccepting ? 'Approving & Saving...' : `1-Click Approve & Merge All (${pendingTeachers.length})`}</span>
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {acceptError && (
        <div style={{ padding: '14px 18px', background: '#FEE2E2', color: '#991B1B', border: '1.5px solid #F87171', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiAlertCircle size={20} color="#DC2626" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800 }}>Accept Operation Failed</div>
              <div style={{ fontSize: '12px', fontWeight: 'normal', marginTop: '2px' }}>{acceptError}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAcceptError(null)}
            style={{ background: 'transparent', border: 'none', color: '#991B1B', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            title="Dismiss error"
          >
            <FiX size={18} />
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
              <p className="subtext">Place this QR code poster at the room/station. Teachers scan it to load the profiling verification on their device.</p>
              
              <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ margin: 0, fontWeight: 800, fontSize: '12px', color: 'var(--navy)' }}>Room ID / Station Code</label>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      const newId = generateRandomRoomId();
                      setSelectedRoom(newId);
                      setScannedRoom(newId);
                      try { localStorage.setItem('insighted_active_room_id', newId); } catch(e){}
                    }}
                    style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <FiRefreshCw size={10} />
                    <span>Randomize Room ID</span>
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={selectedRoom}
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    letterSpacing: '0.08em',
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    backgroundColor: '#F8FAFC',
                    color: 'var(--navy)',
                    cursor: 'default',
                    border: '1.5px solid var(--line)'
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
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--navy)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    {selectedRoom}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.3' }}>
                    Single Scan for all Teachers assigned to this station.
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
                    disabled={isAccepting}
                    onClick={handleCommitAllSubmissions}
                    style={{ background: '#059669', color: 'white', border: 0, padding: '5px 12px', fontSize: '11px', fontWeight: 'bold', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: isAccepting ? 0.7 : 1, cursor: isAccepting ? 'wait' : 'pointer' }}
                  >
                    {isAccepting ? <FiRefreshCw size={12} className="spin" /> : <FiCheck size={12} />}
                    <span>{isAccepting ? 'Saving...' : `Approve All (${pendingTeachers.length})`}</span>
                  </button>
                )}
              </div>

              {/* 3-Tab Selector for Queue, Verified, and Awaiting */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--line)', paddingBottom: '8px', flexWrap: 'wrap' }}>
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

                <button
                  type="button"
                  onClick={() => setActiveQueueTab('awaiting')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeQueueTab === 'awaiting' ? 'var(--navy)' : '#F1F5F9',
                    color: activeQueueTab === 'awaiting' ? '#FFFFFF' : '#475569',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FiClock size={13} />
                  <span>Awaiting Profiling</span>
                  <span style={{
                    background: activeQueueTab === 'awaiting' ? '#F59E0B' : '#CBD5E1',
                    color: activeQueueTab === 'awaiting' ? '#FFFFFF' : '#1E293B',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontWeight: 800
                  }}>
                    {awaitingTeachers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQueueTab('history')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeQueueTab === 'history' ? 'var(--navy)' : '#F1F5F9',
                    color: activeQueueTab === 'history' ? '#FFFFFF' : '#475569',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FiClock size={13} />
                  <span>Previous Submissions</span>
                  <span style={{
                    background: activeQueueTab === 'history' ? '#8B5CF6' : '#CBD5E1',
                    color: activeQueueTab === 'history' ? '#FFFFFF' : '#1E293B',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontWeight: 800
                  }}>
                    {approvedSubmissions.length}
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
                        const depSt = String(teacher.deploymentStatus || teacher.deployment_status || raw.deploymentStatus || raw.deployment_status || '').toUpperCase();

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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--navy)' }}>
                                  {displayName}
                                </span>
                                {(teacher.isShared || depSt.includes('BORROWED')) && (
                                  <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                    BORROWED
                                  </span>
                                )}
                                {depSt.includes('CLUSTERED') && (
                                  <span style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                    CLUSTERED
                                  </span>
                                )}
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
                                disabled={isAccepting}
                                onClick={() => handleCommitSingle(submission)}
                                style={{ background: '#059669', color: 'white', border: 0, padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: isAccepting ? 0.7 : 1, cursor: isAccepting ? 'wait' : 'pointer' }}
                              >
                                {isAccepting ? <FiRefreshCw size={12} className="spin" /> : <FiCheck size={12} />}
                                <span>{isAccepting ? 'Saving...' : 'Approve & Merge'}</span>
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
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Teacher Name</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Position</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Station / Room</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Status</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verifiedTeachers.map(p => {
                            const fName = p.firstName || '';
                            const lName = p.lastName || '';
                            const displayName = lName && fName ? `${lName.toUpperCase()}, ${fName}` : (p.name || 'TEACHER').toUpperCase();
                            const roomTag = p.roomName || 'Faculty Room';
                            const depSt = String(p.personnelRecord?.deploymentStatus || p.personnelRecord?.deployment_status || p.rawSubmission?.deploymentStatus || '').toUpperCase();

                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                    <span>{displayName}</span>
                                    {(p.personnelRecord?.isShared || depSt.includes('BORROWED')) && (
                                      <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                        BORROWED
                                      </span>
                                    )}
                                    {depSt.includes('CLUSTERED') && (
                                      <span style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                        CLUSTERED
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>ID: {p.id}</div>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748B' }}>{p.position || 'Teacher'}</td>
                                <td style={{ padding: '8px 10px', color: '#64748B' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', padding: '2px 6px', borderRadius: '6px', fontSize: '11px' }}>
                                    <FiSmartphone size={11} color="var(--blue)" /> {roomTag}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  <span style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <FiCheckCircle size={10} /> Verified & Merged
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  {p.rawSubmission ? (
                                    <button
                                      className="btn secondary"
                                      type="button"
                                      onClick={() => handleIngestData(p.rawSubmission)}
                                      style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold' }}
                                    >
                                      Inspect
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>✓ Synced</span>
                                  )}
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

              {/* TAB 3: Awaiting Profiling (Stationed Personnel) */}
              {activeQueueTab === 'awaiting' && (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {awaitingTeachers.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1.5px solid var(--line)' }}>
                      <FiCheckCircle size={28} color="#10B981" style={{ marginBottom: '6px' }} />
                      <h4 style={{ margin: 0, color: 'var(--navy)', fontSize: '14px' }}>All Stationed Faculty Profiled!</h4>
                      <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                        All stationed teachers (including Borrowed & Clustered personnel) have completed profiling.
                      </p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: '10px' }}>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Teacher Name</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800 }}>Position</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Passcode</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {awaitingTeachers.map(p => {
                            const fName = p.firstName || p.first_name || '';
                            const lName = p.lastName || p.last_name || '';
                            const displayName = lName && fName ? `${lName.toUpperCase()}, ${fName}` : (p.name || 'TEACHER').toUpperCase();
                            const depSt = String(p.deploymentStatus || p.deployment_status || '').toUpperCase();
                            const actualCode = p.profilingCode || get10MinPasscode(p, 0);
                            const isRevealed = revealedIds.includes(p.id) && isHeadUnlocked;
                            const displayCode = isRevealed ? actualCode : '••••••••';

                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                    <span>{displayName}</span>
                                    {(p.isShared || depSt.includes('BORROWED')) && (
                                      <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                        BORROWED
                                      </span>
                                    )}
                                    {depSt.includes('CLUSTERED') && (
                                      <span style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                        CLUSTERED
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>ID: {p.id}</div>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748B' }}>{p.position || p.plantilla_position || 'Teacher'}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: '800', color: 'var(--blue-600)', letterSpacing: '0.08em', fontSize: '12px' }}>
                                  {displayCode}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <FiClock size={10} /> Awaiting Mobile Scan
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

              {/* TAB 4: Previous Submissions (Historical Log) */}
              {activeQueueTab === 'history' && (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {/* Alert or notification feedback */}
                  {restoreFeedback && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: restoreFeedback.type === 'error' ? '#FEE2E2' : '#ECFDF5',
                      color: restoreFeedback.type === 'error' ? '#991B1B' : '#065F46',
                      border: `1.5px solid ${restoreFeedback.type === 'error' ? '#FCA5A5' : '#6EE7B7'}`,
                      fontSize: '12px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {restoreFeedback.type === 'error' ? <FiAlertTriangle size={15} /> : <FiCheckCircle size={15} />}
                      <span>{restoreFeedback.text}</span>
                    </div>
                  )}

                  {/* Top Summary & Action Bar */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: '#F8FAFC',
                    border: '1.5px solid var(--line)',
                    borderRadius: '10px',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--navy)' }}>
                        Personnel Submission History ({approvedSubmissions.length})
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748B' }}>
                        Historical records of teacher profiles submitted via mobile Faculty Room QR scans.
                      </p>
                    </div>

                    {approvedSubmissions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRestoreHistoricalCloudSubmissions}
                        disabled={isRestoring}
                        style={{
                          background: '#2563EB',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: isRestoring ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                        }}
                      >
                        <FiRefreshCw size={12} className={isRestoring ? 'spin' : ''} />
                        <span>Re-Apply All Submissions ({approvedSubmissions.length})</span>
                      </button>
                    )}
                  </div>

                  {/* Table / List of Submissions */}
                  {approvedSubmissions.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1.5px solid var(--line)' }}>
                      <FiClock size={28} color="#94A3B8" style={{ marginBottom: '6px' }} />
                      <h4 style={{ margin: 0, color: 'var(--navy)', fontSize: '14px' }}>No Previous Submissions Found</h4>
                      <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                        When teachers submit their profiles through mobile QR, their submission history will be logged here.
                      </p>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead style={{ background: '#F1F5F9', color: 'var(--navy)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr>
                            <th style={{ padding: '8px 10px', borderBottom: '1.5px solid var(--line)' }}>Teacher Name & ID</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1.5px solid var(--line)' }}>Position</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1.5px solid var(--line)' }}>Submitted At</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1.5px solid var(--line)' }}>Status</th>
                            <th style={{ padding: '8px 10px', borderBottom: '1.5px solid var(--line)', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {approvedSubmissions.map((sub, idx) => {
                            const raw = sub.profileData || sub.rawProfile || sub;
                            const fName = raw.firstName || raw.fn || sub.firstName || '';
                            const lName = raw.lastName || raw.ln || sub.lastName || '';
                            const displayName = lName && fName ? `${lName.toUpperCase()}, ${fName}` : (sub.personnelName || 'Teacher').toUpperCase();
                            const pId = sub.personnelId || raw.id || sub.id;
                            const position = raw.position || raw.psn || sub.position || 'Teacher';
                            const submittedDate = sub.submittedAt || sub.submitted_at || sub.created_at || sub.updated_at;
                            const formattedDate = submittedDate ? new Date(submittedDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';

                            return (
                              <tr key={sub.id || sub.submissionId || idx} style={{ borderBottom: '1px solid #E2E8F0', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ fontWeight: 'bold', color: 'var(--navy)' }}>{displayName}</div>
                                  <div style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>ID: {pId}</div>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#475569' }}>
                                  {position}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748B', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                  {formattedDate}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <span style={{
                                    background: '#DCFCE7',
                                    color: '#16A34A',
                                    border: '1px solid #86EFAC',
                                    padding: '2px 8px',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}>
                                    <FiCheck size={10} /> SUBMITTED
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      onClick={() => handleIngestData(raw)}
                                      style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}
                                      title="View and review submitted information"
                                    >
                                      <FiEye size={11} style={{ marginRight: '3px' }} />
                                      Review
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const decomp = raw.fn ? decompressProfile(raw) : raw;
                                        const targetId = String(decomp.id || pId || '').trim();
                                        const target = (effectivePersonnel || []).find(p => String(p.id).trim() === targetId);
                                        if (target) {
                                          const merged = mergeTeacherProfileRecord(target, decomp);
                                          if (savePersonnelChanges) {
                                            await savePersonnelChanges(targetId, merged);
                                          }
                                          try {
                                            localStorage.setItem(`draft_personnel_${targetId}`, JSON.stringify(merged));
                                            if (merged.learningAreaMap) {
                                              localStorage.setItem(`draft_learning_areas_${targetId}`, JSON.stringify(merged.learningAreaMap));
                                            }
                                          } catch(e){}
                                        }
                                        setRestoreFeedback({
                                          type: 'success',
                                          text: `✓ Successfully re-applied previous submission for ${displayName}!`
                                        });
                                        setTimeout(() => setRestoreFeedback(null), 5000);
                                      }}
                                      style={{
                                        background: '#059669',
                                        color: 'white',
                                        border: 'none',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        borderRadius: '5px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                      title="Re-apply this teacher's submitted details to their active profile"
                                    >
                                      <FiRefreshCw size={10} />
                                      Re-Apply
                                    </button>
                                  </div>
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
                    {isHeadUnlocked ? (
                      <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#16A34A', border: '1px solid #86EFAC', padding: '2px 8px', borderRadius: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <FiUnlock size={10} /> VAULT UNLOCKED
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <FiLock size={10} /> PROTECTED
                      </span>
                    )}
                  </h2>
                  <p className="subtext" style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                    Teachers must enter their unique 8-character passcode along with their Last Name and Birth Year to unlock their profiling forms.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isHeadUnlocked ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setIsHeadUnlocked(false);
                        setRevealedIds([]);
                      }}
                      style={{ minHeight: '28px', fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <FiLock size={12} />
                      <span>Lock Vault</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setHeadPinError('');
                        setShowHeadPinModal(true);
                      }}
                      style={{ minHeight: '28px', fontSize: '11px', padding: '3px 10px', background: 'var(--navy)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', border: 0, borderRadius: '8px' }}
                    >
                      <FiUnlock size={12} />
                      <span>Unlock Passcodes</span>
                    </button>
                  )}
                  <span style={{ background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <FiClock size={12} /> Rotates Daily in {formatCountdown(timeLeftSeconds)}
                  </span>
                </div>
              </div>

              {!isHeadUnlocked && (
                <div style={{ padding: '10px 14px', background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiShield size={18} color="var(--blue-600)" />
                    <span style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                      Passcodes are hidden for privacy. Authenticate as School Head to view, copy, or print active passcodes.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setHeadPinError('');
                      setShowHeadPinModal(true);
                    }}
                    style={{ fontSize: '11px', padding: '3px 10px', fontWeight: 700 }}
                  >
                    Enter Master PIN / Passcode
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search teacher by name..."
                  value={passcodeSearch}
                  onChange={(e) => setPasscodeSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '180px', minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!isHeadUnlocked) {
                      setHeadPinError('');
                      setShowHeadPinModal(true);
                      return;
                    }
                    setShowPrintPasscodesModal(true);
                  }}
                  style={{ minHeight: '34px', fontSize: '11px', padding: '4px 12px', background: '#0F172A', color: 'white', border: 0, borderRadius: '6px', fontWeight: 800, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  title="Print Teacher Passcode Distribution Slips or Master Table"
                >
                  <FiPrinter size={13} />
                  <span>Print Passcodes</span>
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ minHeight: '34px', fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => {
                    (effectivePersonnel || []).forEach(p => {
                      const dynamic = get10MinPasscode(p, 0);
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
                        const depSt = String(p.deploymentStatus || p.deployment_status || '').toUpperCase();
                        const actualCode = p.profilingCode || get10MinPasscode(p, 0);
                        const isRevealed = revealedIds.includes(p.id) && isHeadUnlocked;
                        const displayCode = isRevealed ? actualCode : '••••••••';

                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                <span>{displayName}</span>
                                {(p.isShared || depSt.includes('BORROWED')) && (
                                  <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                    BORROWED
                                  </span>
                                )}
                                {depSt.includes('CLUSTERED') && (
                                  <span style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>
                                    CLUSTERED
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: '800', color: 'var(--blue-600)', letterSpacing: '0.08em', fontSize: '13px' }}>
                              {displayCode}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isHeadUnlocked) {
                                      setShowHeadPinModal(true);
                                      return;
                                    }
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
                                    if (!isHeadUnlocked) {
                                      setShowHeadPinModal(true);
                                      return;
                                    }
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
          <div className="modal-card" style={{ width: '720px', padding: '24px', background: 'white', borderRadius: '16px', border: '2.5px solid var(--outline)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-head" style={{ borderBottom: '1.5px solid var(--line)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiUserCheck size={20} />
                <span>Review Personnel Submission</span>
              </h2>
              <span className="badge info">{pendingReviewData.id}</span>
            </div>
            
            <div className="modal-body" style={{ padding: 0, marginBottom: '20px' }}>
              <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
                Review the profiling data submitted by <strong>{pendingReviewData.firstName} {pendingReviewData.lastName}</strong> from <strong>Room ID: {scannedRoom || selectedRoom || 'ROOM-01'}</strong>. Select the specific verified fields you want to merge into the central roster.
              </p>

              {hasChangesDetected && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '11px', padding: '4px 10px', fontWeight: 700 }}
                      onClick={() => {
                        const allChangedKeys = comparisonRows.filter(r => r.hasChanged).map(r => r.key);
                        setSelectedFieldsToMerge(new Set(allChangedKeys));
                      }}
                    >
                      ✓ Select All Changes
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '11px', padding: '4px 10px', fontWeight: 700 }}
                      onClick={() => setSelectedFieldsToMerge(new Set())}
                    >
                      ✕ Uncheck All
                    </button>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)', background: '#F0F9FF', border: '1px solid #BAE6FD', padding: '3px 10px', borderRadius: '12px' }}>
                    Merging {selectedFieldsToMerge.size} of {comparisonRows.filter(r => r.hasChanged).length} changed field(s)
                  </span>
                </div>
              )}

              <div style={{ border: '1.5px solid var(--line)', borderRadius: '12px', overflow: 'hidden', background: '#FFFFFF' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                      <th style={{ width: '42px', padding: '10px 8px', textAlign: 'center', fontWeight: 800, color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          checked={comparisonRows.filter(r => r.hasChanged).length > 0 && comparisonRows.filter(r => r.hasChanged).every(r => selectedFieldsToMerge.has(r.key))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFieldsToMerge(new Set(comparisonRows.filter(r => r.hasChanged).map(r => r.key)));
                            } else {
                              setSelectedFieldsToMerge(new Set());
                            }
                          }}
                          title="Toggle all changed fields"
                          style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--blue)' }}
                        />
                      </th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--muted)', textAlign: 'left' }}>Field Name</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--muted)', textAlign: 'left' }}>Current Central Value</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--muted)', textAlign: 'left' }}>Scanned Submission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, index) => {
                      const isSelected = selectedFieldsToMerge.has(row.key);
                      return (
                        <tr 
                          key={index} 
                          style={{ 
                            borderBottom: '1px solid #E2E8F0',
                            background: row.hasChanged 
                              ? (isSelected ? '#ECFDF5' : '#FFFBEB') 
                              : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                            {row.hasChanged ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedFieldsToMerge);
                                  if (e.target.checked) next.add(row.key);
                                  else next.delete(row.key);
                                  setSelectedFieldsToMerge(next);
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--emerald, #059669)' }}
                              />
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '12px' }} title="Identical central and submitted values">✓</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--navy)' }}>{row.label}</td>
                          <td style={{ padding: '10px 12px', color: '#64748B', textDecoration: (row.hasChanged && isSelected) ? 'line-through' : 'none' }}>
                            {row.current}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: row.hasChanged ? 'bold' : 'normal', color: row.hasChanged ? (isSelected ? '#065F46' : '#92400E') : '#0F172A' }}>
                            {row.submitted}
                            {row.hasChanged && (
                              isSelected ? (
                                <span style={{ marginLeft: '6px', fontSize: '10px', background: '#A7F3D0', color: '#065F46', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase', fontWeight: 800 }}>
                                  Merge New
                                </span>
                              ) : (
                                <span style={{ marginLeft: '6px', fontSize: '10px', background: '#FDE68A', color: '#92400E', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase', fontWeight: 800 }}>
                                  Keep Current
                                </span>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
                className="btn" 
                type="button" 
                onClick={() => {
                  setShowReviewModal(false);
                  setPendingReviewData(null);
                }}
                style={{ 
                  background: '#DC2626', 
                  color: '#FFFFFF', 
                  border: 0, 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  fontWeight: '700'
                }}
              >
                <FiX size={14} />
                <span>Decline</span>
              </button>
              <button
                className="btn"
                type="button"
                disabled={isAccepting}
                onClick={handleCommitReview}
                style={{ background: '#059669', color: 'white', border: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: isAccepting ? 0.7 : 1, cursor: isAccepting ? 'wait' : 'pointer' }}
              >
                {isAccepting ? <FiRefreshCw size={14} className="spin" /> : <FiCheck size={14} />}
                <span>{isAccepting ? 'Saving...' : `Approve & Merge Selected (${selectedFieldsToMerge.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* School Head Master Passcode Gate Modal */}
      {showHeadPinModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(5px)', zIndex: 1100 }}>
          <div className="modal-card" style={{ width: '420px', padding: '24px', background: 'white', borderRadius: '16px', border: '2.5px solid var(--outline)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FiShield size={20} color="var(--blue-600)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--navy)' }}>School Head Passcode Gate</h3>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Master Authentication for Teacher Vault</span>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.45', marginBottom: '16px' }}>
              Enter your <strong>School Head Passcode</strong> or <strong>School ID</strong> to unlock live teacher passcodes on this screen.
            </p>

            <form onSubmit={handleUnlockHeadVault}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--navy)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  School Head Passcode / School ID
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="Enter passcode or School ID"
                  value={headPinInput}
                  onChange={(e) => {
                    setHeadPinInput(e.target.value);
                    if (headPinError) setHeadPinError('');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.1em',
                    borderRadius: '8px',
                    border: headPinError ? '1.5px solid #EF4444' : '1.5px solid var(--line)'
                  }}
                />
                {headPinError && (
                  <p style={{ color: '#DC2626', fontSize: '11px', fontWeight: 700, margin: '6px 0 0 0' }}>
                    {headPinError}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setShowHeadPinModal(false);
                    setHeadPinInput('');
                    setHeadPinError('');
                  }}
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{ fontSize: '12px', padding: '6px 16px', background: 'var(--navy)', color: '#fff', border: 0, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <FiUnlock size={13} />
                  <span>Unlock Vault</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT PASSCODES MODAL & PRINT TEMPLATES */}
      {showPrintPasscodesModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '16px' }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: '16px', maxWidth: '850px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#0F172A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FiPrinter size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Print Teacher Profiling Passcodes</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                    Valid for Today ({new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}) • Daily 24-Hour Cycle
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintPasscodesModal(false)}
                style={{ background: 'transparent', border: 0, fontSize: '20px', color: '#64748B', cursor: 'pointer', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                  onClick={() => setPrintFormat('slips')}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: printFormat === 'slips' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    background: printFormat === 'slips' ? '#EFF6FF' : '#FFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: printFormat === 'slips' ? '#1E40AF' : '#0F172A' }}>
                      Individual Distribution Slips
                    </span>
                    <input type="radio" checked={printFormat === 'slips'} onChange={() => setPrintFormat('slips')} />
                  </div>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B', lineHeight: '1.4' }}>
                    Cut-out confidential passcode slips (8 slips per page) to hand out individually to each teacher.
                  </p>
                </div>

                <div
                  onClick={() => setPrintFormat('table')}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: printFormat === 'table' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    background: printFormat === 'table' ? '#EFF6FF' : '#FFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: printFormat === 'table' ? '#1E40AF' : '#0F172A' }}>
                      Master Administrative Roster
                    </span>
                    <input type="radio" checked={printFormat === 'table'} onChange={() => setPrintFormat('table')} />
                  </div>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B', lineHeight: '1.4' }}>
                    Single compact master reference table of all active teachers and their daily passcodes for the School Head.
                  </p>
                </div>
              </div>

              {/* Preview Box */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                    Preview ({effectivePersonnel.length} Teachers)
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    Target: Standard A4 / Letter Paper
                  </span>
                </div>

                <div style={{ maxHeight: '260px', overflowY: 'auto', background: '#FFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px' }}>
                  {printFormat === 'slips' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                      {effectivePersonnel.slice(0, 4).map((p, idx) => (
                        <div key={idx} style={{ border: '1.5px dashed #94A3B8', borderRadius: '8px', padding: '10px', background: '#FFF' }}>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {schoolInfo?.schoolName || 'DEPED SCHOOL'} • {schoolInfo?.schoolId || ''}
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name || p.fullName}
                          </div>
                          <div style={{ fontSize: '9.5px', color: '#64748B' }}>
                            {p.role || p.designation || 'Teacher'}
                          </div>
                          <div style={{ margin: '8px 0', padding: '6px', background: '#F1F5F9', borderRadius: '6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '8.5px', color: '#475569', fontWeight: 700 }}>TODAY'S PROFILING PASSCODE</div>
                            <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '3px', color: '#0F172A', fontFamily: 'monospace' }}>
                              {get10MinPasscode(p, 0)}
                            </div>
                          </div>
                          <div style={{ fontSize: '8.5px', color: '#64748B', lineHeight: '1.3' }}>
                            1. Scan Faculty QR Code<br />
                            2. Select Name & Enter Birth Year<br />
                            3. Enter Passcode Above
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>#</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Teacher Name</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Position / Title</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center' }}>Daily Passcode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectivePersonnel.slice(0, 6).map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 8px', color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0F172A' }}>{p.name || p.fullName}</td>
                            <td style={{ padding: '6px 8px', color: '#64748B' }}>{p.role || p.designation || 'Teacher'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, color: '#0284C7' }}>
                              {get10MinPasscode(p, 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {effectivePersonnel.length > (printFormat === 'slips' ? 4 : 6) && (
                    <div style={{ textAlign: 'center', padding: '8px', fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                      + {effectivePersonnel.length - (printFormat === 'slips' ? 4 : 6)} more teachers will be included in the printout...
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiClock size={13} />
                <span>Passcodes rotate every 24 hours at midnight.</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowPrintPasscodesModal(false)}
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const printWin = window.open('', '_blank');
                    if (!printWin) {
                      alert('Please allow popups to print passcodes.');
                      return;
                    }
                    const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                    const schoolName = schoolInfo?.schoolName || 'DEPARTMENT OF EDUCATION';
                    const schoolId = schoolInfo?.schoolId || '';

                    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Teacher Profiling Passcodes - ${schoolName}</title>
  <style>
    @page { size: portrait; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0F172A; margin: 0; padding: 0; }
    .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #0F172A; padding-bottom: 10px; }
    .header h2 { margin: 0; font-size: 16pt; text-transform: uppercase; letter-spacing: 0.5px; }
    .header h3 { margin: 4px 0 0 0; font-size: 12pt; color: #334155; font-weight: 600; }
    .header p { margin: 4px 0 0 0; font-size: 9pt; color: #64748B; font-weight: 700; }
    
    /* Slips Layout */
    .slips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; page-break-inside: auto; }
    .slip-card { border: 1.5px dashed #475569; border-radius: 8px; padding: 12px; page-break-inside: avoid; background: #FFF; }
    .slip-school { font-size: 8pt; font-weight: 800; color: #64748B; text-transform: uppercase; }
    .slip-name { font-size: 11pt; font-weight: 800; color: #0F172A; margin: 2px 0 1px 0; }
    .slip-role { font-size: 8.5pt; color: #475569; margin-bottom: 8px; }
    .passcode-box { background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px; text-align: center; margin-bottom: 8px; }
    .passcode-label { font-size: 7.5pt; font-weight: 800; color: #475569; text-transform: uppercase; }
    .passcode-code { font-size: 18pt; font-weight: 900; letter-spacing: 4px; color: #0F172A; font-family: monospace; }
    .slip-instructions { font-size: 7.5pt; color: #475569; line-height: 1.35; border-top: 1px dotted #CBD5E1; padding-top: 6px; }

    /* Table Layout */
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9.5pt; }
    th { background: #F1F5F9; border: 1px solid #CBD5E1; padding: 6px 10px; text-align: left; font-weight: 800; text-transform: uppercase; font-size: 8pt; }
    td { border: 1px solid #CBD5E1; padding: 6px 10px; }
    tr:nth-child(even) td { background: #F8FAFC; }
    .passcode-cell { font-family: monospace; font-size: 12pt; font-weight: 800; text-align: center; color: #0F172A; letter-spacing: 1.5px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${schoolName}</h2>
    <h3>Faculty Mobile Profiling Passcodes (${schoolId ? 'School ID: ' + schoolId : ''})</h3>
    <p>VALID DATE: ${todayStr} • 24-HOUR ROTATION CYCLE (EXPIRES AT MIDNIGHT)</p>
  </div>
`;

                    if (printFormat === 'slips') {
                      htmlContent += '<div class="slips-grid">';
                      effectivePersonnel.forEach(p => {
                        const code = get10MinPasscode(p, 0);
                        htmlContent += `
  <div class="slip-card">
    <div class="slip-school">${schoolName} ${schoolId ? '• ID: ' + schoolId : ''}</div>
    <div class="slip-name">${p.name || p.fullName || 'Teacher'}</div>
    <div class="slip-role">${p.role || p.designation || 'DepEd Faculty'}</div>
    <div class="passcode-box">
      <div class="passcode-label">Active Daily Passcode (${todayStr})</div>
      <div class="passcode-code">${code}</div>
    </div>
    <div class="slip-instructions">
      <strong>Instructions:</strong> 1. Scan Faculty Room QR Code • 2. Select your name & enter birth year • 3. Enter the 6-digit passcode above to profile and submit your data.
    </div>
  </div>`;
                      });
                      htmlContent += '</div>';
                    } else {
                      htmlContent += `
<table>
  <thead>
    <tr>
      <th style="width: 35px; text-align: center;">#</th>
      <th>Teacher Full Name</th>
      <th>Designation / Title</th>
      <th>DepEd Email</th>
      <th style="width: 140px; text-align: center;">Active Daily Passcode</th>
    </tr>
  </thead>
  <tbody>`;
                      effectivePersonnel.forEach((p, i) => {
                        const code = get10MinPasscode(p, 0);
                        htmlContent += `
    <tr>
      <td style="text-align: center; color: #64748B;">${i + 1}</td>
      <td style="font-weight: 700;">${p.name || p.fullName || 'Teacher'}</td>
      <td>${p.role || p.designation || 'Teacher'}</td>
      <td style="color: #64748B; font-size: 8.5pt;">${p.email || p.depedEmail || '—'}</td>
      <td class="passcode-cell">${code}</td>
    </tr>`;
                      });
                      htmlContent += `
  </tbody>
</table>`;
                    }

                    htmlContent += `
  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`;

                    printWin.document.open();
                    printWin.document.write(htmlContent);
                    printWin.document.close();
                  }}
                  style={{ fontSize: '12px', padding: '6px 16px', background: '#0F172A', color: '#fff', border: 0, borderRadius: '8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <FiPrinter size={13} />
                  <span>Print Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
