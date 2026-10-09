import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getLocalDraft, setLocalDraft } from '../services/db';
import { api } from '../services/api';
import PortalHeader from '../components/PortalHeader';
import useDirtyGuard from '../hooks/useDirtyGuard';
import { confirmServerDraftSaved } from '../services/screenSave';
import {
  FiShield,
  FiMapPin,
  FiTarget,
  FiStar,
  FiInfo,
  FiBookOpen,
  FiAward,
  FiBook,
  FiCheckCircle,
  FiClock,
  FiX
} from 'react-icons/fi';

const OFFERING_METADATA = {
  'Elementary': { title: 'Elementary', subtitle: 'Kinder to Grade 6', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  'JHS': { title: 'Junior High School', subtitle: 'Grade 7 to Grade 10', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'SHS': { title: 'Senior High School', subtitle: 'Grade 11 to Grade 12', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' }
};

const JHS_PROGRAM_OPTIONS = [
  { code: 'SPA', label: 'SPECIAL PROGRAM IN THE ARTS (SPA)' },
  { code: 'SPFL', label: 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)' },
  { code: 'SPJ', label: 'SPECIAL PROGRAM IN JOURNALISM (SPJ)' },
  { code: 'SPS', label: 'SPECIAL PROGRAM IN SPORTS (SPS)' },
  { code: 'STE', label: 'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM' },
  { code: 'SPTVE', label: 'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)' },
  { code: 'SCIENCE', label: 'SPECIAL PROGRAM IN SCIENCE' }
];

export default function SchoolProfile() {
  const { schoolInfo, setSchoolInfo, showToast, showAlert, showConfirm, completeNode, setActiveView, registerAutoSaveHandler } = useApp();
  const currentOfferings = Array.isArray(schoolInfo.curricularOffering) ? schoolInfo.curricularOffering : [];

  const isElemActive = currentOfferings.includes('Elementary');
  const isJHSActive = currentOfferings.includes('JHS');
  const isSHSActive = currentOfferings.includes('SHS');

  // Form State separated by level
  const [hasElemSpecialPrograms, setHasElemSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [elemSpecialProgram, setElemSpecialProgram] = useState(false);

  // Inclusive Programs State (ALS, SNED, IPED, MADRASAH)
  const [hasElemInclusive, setHasElemInclusive] = useState('no'); // 'yes' | 'no'
  const [elemInclusivePrograms, setElemInclusivePrograms] = useState([]); // ['ALS-ES', 'SNED-ES', 'IPED-ES', 'MADRASAH-ES']

  const [hasJhsSpecialPrograms, setHasJhsSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [jhsSpecialPrograms, setJhsSpecialPrograms] = useState([]);

  const [hasJhsInclusive, setHasJhsInclusive] = useState('no'); // 'yes' | 'no'
  const [jhsInclusivePrograms, setJhsInclusivePrograms] = useState([]); // ['ALS-JHS', 'SNED-JHS', 'IPED-JHS', 'MADRASAH-JHS']

  const [hasShsInclusive, setHasShsInclusive] = useState('no'); // 'yes' | 'no'
  const [shsInclusivePrograms, setShsInclusivePrograms] = useState([]); // ['ALS-SHS', 'SNED-SHS', 'IPED-SHS']

  const [shsCurriculumModel, setShsCurriculumModel] = useState('Standard K-12 SHS Curriculum');
  // School Shift Schedule State (Optional)
  const [hasShifts, setHasShifts] = useState('no'); // 'yes' | 'no'
  const [shiftStartTime, setShiftStartTime] = useState('07:00');
  const [shiftEndTime, setShiftEndTime] = useState('18:00');
  const [isSaving, setIsSaving] = useState(false);

  // Confirmation Modal & Spotlight Glow State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const savedSnapshotRef = useRef(null);

  const getCurrentConfigSnapshot = () => ({
    hasElemSpecialPrograms,
    elemSpecialProgram: !!elemSpecialProgram,
    hasJhsSpecialPrograms,
    jhsSpecialPrograms: [...(jhsSpecialPrograms || [])].sort(),
    hasElemInclusive,
    elemInclusivePrograms: [...(elemInclusivePrograms || [])].sort(),
    hasJhsInclusive,
    jhsInclusivePrograms: [...(jhsInclusivePrograms || [])].sort(),
    hasShsInclusive,
    shsInclusivePrograms: [...(shsInclusivePrograms || [])].sort(),
    shsCurriculumModel,
    hasShifts,
    shiftStartTime,
    shiftEndTime
  });

  const isDirty = Boolean(savedSnapshotRef.current && JSON.stringify(getCurrentConfigSnapshot()) !== savedSnapshotRef.current);

  const handleDiscard = () => {
    if (!savedSnapshotRef.current) return;
    try {
      const snap = JSON.parse(savedSnapshotRef.current);
      setHasElemSpecialPrograms(snap.hasElemSpecialPrograms);
      setElemSpecialProgram(snap.elemSpecialProgram);
      setHasJhsSpecialPrograms(snap.hasJhsSpecialPrograms);
      setJhsSpecialPrograms(snap.jhsSpecialPrograms || []);
      setHasElemInclusive(snap.hasElemInclusive);
      setElemInclusivePrograms(snap.elemInclusivePrograms || []);
      setHasJhsInclusive(snap.hasJhsInclusive);
      setJhsInclusivePrograms(snap.jhsInclusivePrograms || []);
      setHasShsInclusive(snap.hasShsInclusive);
      setShsInclusivePrograms(snap.shsInclusivePrograms || []);
      setShsCurriculumModel(snap.shsCurriculumModel);
      setHasShifts(snap.hasShifts || 'no');
      setShiftStartTime(snap.shiftStartTime || '07:00');
      setShiftEndTime(snap.shiftEndTime || '18:00');
    } catch (e) {}
  };

  const runSaveRef = useRef(() => Promise.resolve({ ok: true })); // the page's one save, shared with the unsaved-changes dialog
  useDirtyGuard({
    screenId: 'school_profile',
    isDirty,
    onDiscard: handleDiscard,
    onSave: () => runSaveRef.current()
  });

  // Load configuration on mount or when schoolInfo updates
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const draftKey = `insighted_school_curricular_config_${schoolInfo.schoolId || 'default'}`;
        const localDraft = await getLocalDraft(draftKey);
        const storedStr = localStorage.getItem(draftKey);
        const localConfig = localDraft || (storedStr ? JSON.parse(storedStr) : null);
        // Database first: the browser copy only wins while it holds edits that were NOT saved to the server yet.
        const config = (schoolInfo?.curricularConfigSaved && (!localConfig || localConfig.savedToServer)) ? null : localConfig;

        const allInclusive = Array.isArray(config?.inclusivePrograms)
          ? config.inclusivePrograms
          : (Array.isArray(schoolInfo?.inclusivePrograms) ? schoolInfo.inclusivePrograms : []);

        const elemInc = allInclusive.filter(p => p.endsWith('-ES'));
        const hasElemIncVal = config?.hasElemInclusive !== undefined
          ? (config.hasElemInclusive ? 'yes' : 'no')
          : (schoolInfo?.hasElemInclusive ? 'yes' : (elemInc.length > 0 ? 'yes' : 'no'));
        setHasElemInclusive(hasElemIncVal);
        setElemInclusivePrograms(elemInc.length > 0 ? elemInc : (config?.elemInclusivePrograms || schoolInfo?.elemInclusivePrograms || []));

        const jhsInc = allInclusive.filter(p => p.endsWith('-JHS'));
        const hasJhsIncVal = config?.hasJhsInclusive !== undefined
          ? (config.hasJhsInclusive ? 'yes' : 'no')
          : (schoolInfo?.hasJhsInclusive ? 'yes' : (jhsInc.length > 0 ? 'yes' : 'no'));
        setHasJhsInclusive(hasJhsIncVal);
        setJhsInclusivePrograms(jhsInc.length > 0 ? jhsInc : (config?.jhsInclusivePrograms || schoolInfo?.jhsInclusivePrograms || []));

        const shsInc = allInclusive.filter(p => p.endsWith('-SHS'));
        const hasShsIncVal = config?.hasShsInclusive !== undefined
          ? (config.hasShsInclusive ? 'yes' : 'no')
          : (schoolInfo?.hasShsInclusive ? 'yes' : (shsInc.length > 0 ? 'yes' : 'no'));
        setHasShsInclusive(hasShsIncVal);
        setShsInclusivePrograms(shsInc.length > 0 ? shsInc : (config?.shsInclusivePrograms || schoolInfo?.shsInclusivePrograms || []));

        const hasShiftsVal = config?.hasShifts !== undefined
          ? (config.hasShifts ? 'yes' : 'no')
          : (schoolInfo?.hasShifts ? 'yes' : 'no');
        setHasShifts(hasShiftsVal);
        setShiftStartTime(config?.shiftStartTime || schoolInfo?.shiftStartTime || '07:00');
        setShiftEndTime(config?.shiftEndTime || schoolInfo?.shiftEndTime || '18:00');

        if (config) {
          setHasElemSpecialPrograms(config.hasElemSpecialPrograms ? 'yes' : 'no');
          setElemSpecialProgram(!!config.elemSpecialProgram);

          setHasJhsSpecialPrograms(config.hasJhsSpecialPrograms ? 'yes' : 'no');
          setJhsSpecialPrograms(Array.isArray(config.jhsSpecialPrograms) ? config.jhsSpecialPrograms : []);

          if (config.shsCurriculumModel) {
            setShsCurriculumModel(config.shsCurriculumModel);
          }
        } else if (schoolInfo.specialPrograms || schoolInfo.shsCurriculumModel || schoolInfo.hasElemSpecialPrograms || schoolInfo.hasJhsSpecialPrograms) {
          const progs = Array.isArray(schoolInfo.specialPrograms) ? schoolInfo.specialPrograms : [];
          const hasElem = schoolInfo.hasElemSpecialPrograms || progs.includes('SPECIAL SCIENCE ELEMENTARY SCHOOL');
          const jhsProgs = Array.isArray(schoolInfo.jhsSpecialPrograms) && schoolInfo.jhsSpecialPrograms.length > 0
            ? schoolInfo.jhsSpecialPrograms
            : progs.filter(p => p !== 'SPECIAL SCIENCE ELEMENTARY SCHOOL');

          setHasElemSpecialPrograms(hasElem ? 'yes' : 'no');
          setElemSpecialProgram(hasElem);

          setHasJhsSpecialPrograms(schoolInfo.hasJhsSpecialPrograms || jhsProgs.length > 0 ? 'yes' : 'no');
          setJhsSpecialPrograms(jhsProgs);

          if (schoolInfo.shsCurriculumModel) {
            setShsCurriculumModel(schoolInfo.shsCurriculumModel);
          }
        }

        setTimeout(() => {
          savedSnapshotRef.current = JSON.stringify(getCurrentConfigSnapshot());
        }, 50);
      } catch (err) {
        console.error('Error loading school profile configuration:', err);
      }
    };
    loadConfig();
  }, [schoolInfo.schoolId, schoolInfo.inclusivePrograms, schoolInfo.specialPrograms]);

  // Register auto-save handler on navigation (e.g. clicking Node Map)
  useEffect(() => {
    if (!registerAutoSaveHandler) return;
    return registerAutoSaveHandler('school_profile', async () => {
      try {
        const draftKey = `insighted_school_curricular_config_${schoolInfo.schoolId || 'default'}`;
        const selectedPrograms = [
          ...(hasElemSpecialPrograms === 'yes' && elemSpecialProgram ? ['SPECIAL SCIENCE ELEMENTARY SCHOOL'] : []),
          ...(hasJhsSpecialPrograms === 'yes' ? jhsSpecialPrograms : [])
        ];
        const selectedInclusive = [
          ...(hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
          ...(hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
          ...(hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
        ];
        const configData = {
          hasElemSpecialPrograms: hasElemSpecialPrograms === 'yes',
          elemSpecialProgram: hasElemSpecialPrograms === 'yes' && elemSpecialProgram,
          hasElemInclusive: hasElemInclusive === 'yes',
          elemInclusivePrograms,
          hasJhsSpecialPrograms: hasJhsSpecialPrograms === 'yes',
          jhsSpecialPrograms,
          hasJhsInclusive: hasJhsInclusive === 'yes',
          jhsInclusivePrograms,
          hasShsInclusive: hasShsInclusive === 'yes',
          shsInclusivePrograms,
          shsCurriculumModel,
          hasShifts: hasShifts === 'yes',
          shiftStartTime: hasShifts === 'yes' ? shiftStartTime : '07:00',
          shiftEndTime: hasShifts === 'yes' ? shiftEndTime : '18:00',
          specialPrograms: selectedPrograms,
          inclusivePrograms: selectedInclusive
        };
        localStorage.setItem(draftKey, JSON.stringify(configData));
        await setLocalDraft(draftKey, configData);
        if (setSchoolInfo) {
          setSchoolInfo(prev => ({
            ...prev,
            ...configData,
            specialPrograms: selectedPrograms,
            shsCurriculumModel: configData.shsCurriculumModel,
            inclusivePrograms: selectedInclusive
          }));
        }
        return true;
      } catch (e) {
        console.warn('[SchoolProfile Auto-Save Notice]:', e);
        return false;
      }
    });
  }, [registerAutoSaveHandler, schoolInfo?.schoolId, hasElemSpecialPrograms, elemSpecialProgram, hasElemInclusive, elemInclusivePrograms, hasJhsSpecialPrograms, jhsSpecialPrograms, hasJhsInclusive, jhsInclusivePrograms, hasShsInclusive, shsInclusivePrograms, shsCurriculumModel, hasShifts, shiftStartTime, shiftEndTime, setSchoolInfo]);

  const syncConfigDraft = (overrides = {}) => {
    try {
      const draftKey = `insighted_school_curricular_config_${schoolInfo.schoolId || 'default'}`;
      const curHasElemSpecial = overrides.hasElemSpecialPrograms !== undefined ? overrides.hasElemSpecialPrograms : hasElemSpecialPrograms;
      const curElemSpecial = overrides.elemSpecialProgram !== undefined ? overrides.elemSpecialProgram : elemSpecialProgram;
      const curHasJhsSpecial = overrides.hasJhsSpecialPrograms !== undefined ? overrides.hasJhsSpecialPrograms : hasJhsSpecialPrograms;
      const curJhsSpecial = overrides.jhsSpecialPrograms !== undefined ? overrides.jhsSpecialPrograms : jhsSpecialPrograms;
      const curHasElemInc = overrides.hasElemInclusive !== undefined ? overrides.hasElemInclusive : hasElemInclusive;
      const curElemInc = overrides.elemInclusivePrograms !== undefined ? overrides.elemInclusivePrograms : elemInclusivePrograms;
      const curHasJhsInc = overrides.hasJhsInclusive !== undefined ? overrides.hasJhsInclusive : hasJhsInclusive;
      const curJhsInc = overrides.jhsInclusivePrograms !== undefined ? overrides.jhsInclusivePrograms : jhsInclusivePrograms;
      const curHasShsInc = overrides.hasShsInclusive !== undefined ? overrides.hasShsInclusive : hasShsInclusive;
      const curShsInc = overrides.shsInclusivePrograms !== undefined ? overrides.shsInclusivePrograms : shsInclusivePrograms;
      const curHasShifts = overrides.hasShifts !== undefined ? overrides.hasShifts : hasShifts;
      const curShiftStart = overrides.shiftStartTime !== undefined ? overrides.shiftStartTime : shiftStartTime;
      const curShiftEnd = overrides.shiftEndTime !== undefined ? overrides.shiftEndTime : shiftEndTime;

      const selectedPrograms = [
        ...(curHasElemSpecial === 'yes' && curElemSpecial ? ['SPECIAL SCIENCE ELEMENTARY SCHOOL'] : []),
        ...(curHasJhsSpecial === 'yes' ? curJhsSpecial : [])
      ];
      const selectedInclusive = [
        ...(curHasElemInc === 'yes' ? curElemInc : []),
        ...(curHasJhsInc === 'yes' ? curJhsInc : []),
        ...(curHasShsInc === 'yes' ? curShsInc : [])
      ];

      const configData = {
        hasElemSpecialPrograms: curHasElemSpecial === 'yes',
        elemSpecialProgram: curHasElemSpecial === 'yes' && curElemSpecial,
        hasJhsSpecialPrograms: curHasJhsSpecial === 'yes',
        jhsSpecialPrograms: curHasJhsSpecial === 'yes' ? curJhsSpecial : [],
        specialPrograms: selectedPrograms,
        hasElemInclusive: curHasElemInc === 'yes',
        elemInclusivePrograms: curHasElemInc === 'yes' ? curElemInc : [],
        hasJhsInclusive: curHasJhsInc === 'yes',
        jhsInclusivePrograms: curHasJhsInc === 'yes' ? curJhsInc : [],
        hasShsInclusive: curHasShsInc === 'yes',
        shsInclusivePrograms: curHasShsInc === 'yes' ? curShsInc : [],
        inclusivePrograms: selectedInclusive,
        shsCurriculumModel,
        hasShifts: curHasShifts === 'yes',
        shiftStartTime: curHasShifts === 'yes' ? curShiftStart : '07:00',
        shiftEndTime: curHasShifts === 'yes' ? curShiftEnd : '18:00',
        schoolYear: schoolInfo.schoolYear || 'SY 26-27'
      };

      localStorage.setItem(draftKey, JSON.stringify(configData));
      setLocalDraft(draftKey, configData).catch(() => {});
      if (setSchoolInfo) {
        setSchoolInfo(prev => ({
          ...prev,
          ...configData
        }));
      }
    } catch (e) {
      console.warn('Sync draft warning:', e);
    }
  };

  const handleToggleJhsProgram = (programLabel) => {
    setJhsSpecialPrograms(prev => {
      const next = prev.includes(programLabel) 
        ? prev.filter(p => p !== programLabel) 
        : [...prev, programLabel];
      syncConfigDraft({ jhsSpecialPrograms: next });
      return next;
    });
  };

  // The one School Profile save, used by the confirm dialog's Save button AND the unsaved-changes dialog's Save button.
  // It never opens its own alerts: it returns { ok: true } or { ok: false, title, message }.
  const runSchoolProfileSave = async () => {
    setIsSaving(true);
    try {
      if (hasShifts === 'yes') {
        const parseM = (t) => {
          if (!t) return null;
          const parts = String(t).split(':').map(Number);
          if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
          return parts[0] * 60 + parts[1];
        };
        const sM = parseM(shiftStartTime);
        const eM = parseM(shiftEndTime);
        if (sM === null || eM === null || sM < 240 || eM > 1320 || eM <= sM) {
          return {
            ok: false,
            title: 'Invalid Shift Window',
            message: 'Declared shift hours must fall between 4:00 AM (04:00) and 10:00 PM (22:00), and End Time must be later than Start Time.'
          };
        }
      }

      const selectedPrograms = [];
      if (isElemActive && hasElemSpecialPrograms === 'yes' && elemSpecialProgram) {
        selectedPrograms.push('SPECIAL SCIENCE ELEMENTARY SCHOOL');
      }
      if (isJHSActive && hasJhsSpecialPrograms === 'yes') {
        selectedPrograms.push(...jhsSpecialPrograms);
      }

      const selectedInclusive = [
        ...(isElemActive && hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
        ...(isJHSActive && hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
        ...(isSHSActive && hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
      ];

      const configData = {
        hasElemSpecialPrograms: hasElemSpecialPrograms === 'yes',
        elemSpecialProgram: hasElemSpecialPrograms === 'yes' && elemSpecialProgram,
        hasJhsSpecialPrograms: hasJhsSpecialPrograms === 'yes',
        jhsSpecialPrograms: hasJhsSpecialPrograms === 'yes' ? jhsSpecialPrograms : [],
        specialPrograms: selectedPrograms,
        hasElemInclusive: hasElemInclusive === 'yes',
        elemInclusivePrograms: hasElemInclusive === 'yes' ? elemInclusivePrograms : [],
        hasJhsInclusive: hasJhsInclusive === 'yes',
        jhsInclusivePrograms: hasJhsInclusive === 'yes' ? jhsInclusivePrograms : [],
        hasShsInclusive: hasShsInclusive === 'yes',
        shsInclusivePrograms: hasShsInclusive === 'yes' ? shsInclusivePrograms : [],
        inclusivePrograms: selectedInclusive,
        shsCurriculumModel: isSHSActive ? shsCurriculumModel : null,
        hasShifts: hasShifts === 'yes',
        shiftStartTime: hasShifts === 'yes' ? shiftStartTime : '07:00',
        shiftEndTime: hasShifts === 'yes' ? shiftEndTime : '18:00',
        schoolYear: schoolInfo.schoolYear || 'SY 26-27'
      };

      const draftKey = `insighted_school_curricular_config_${schoolInfo.schoolId || 'default'}`;
      
      // 1. Save to Local Storage & IndexedDB Draft (Local Database First)
      localStorage.setItem(draftKey, JSON.stringify(configData));
      await setLocalDraft(draftKey, configData);

      // 2. Update Global App Context
      if (setSchoolInfo) {
        setSchoolInfo(prev => ({
          ...prev,
          ...configData,
          specialPrograms: selectedPrograms,
          shsCurriculumModel: configData.shsCurriculumModel,
          inclusivePrograms: selectedInclusive
        }));
      }

      // 3. The configuration lives in esf7_school_profile: write it there (idempotent upsert on school + year) and check the
      //    row the server stored before anything is called saved. The draft below is only the backup of unsaved work.
      const stored = await api.updateCurricularConfig({
        ...configData,
        elemSpecialPrograms: configData.hasElemSpecialPrograms && configData.elemSpecialProgram ? ['SPECIAL SCIENCE ELEMENTARY SCHOOL'] : []
      });
      const row = stored && stored.data;
      const sameList = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
      if (!stored || stored.success !== true || !row
        || Boolean(row.hasElemSpecialPrograms) !== configData.hasElemSpecialPrograms
        || Boolean(row.hasJhsSpecialPrograms) !== configData.hasJhsSpecialPrograms
        || !sameList(row.jhsSpecialPrograms, configData.jhsSpecialPrograms)
        || !sameList(row.inclusivePrograms, configData.inclusivePrograms)) {
        throw new Error('The database did not return the school configuration that was sent, so it was not marked as saved.');
      }
      const savedConfig = { ...configData, savedToServer: true };
      localStorage.setItem(draftKey, JSON.stringify(savedConfig));
      await setLocalDraft(draftKey, savedConfig);
      if (setSchoolInfo) setSchoolInfo(prev => ({ ...prev, curricularConfigSaved: true }));

      // Success is reported only after the server confirmed the database write.
      const confirmed = await confirmServerDraftSaved();
      if (!confirmed.ok) return confirmed;

      savedSnapshotRef.current = JSON.stringify(getCurrentConfigSnapshot());
      setIsConfirmModalOpen(false);
      setConfirmInput('');

      // Complete Node without auto-navigating to Roster
      if (completeNode) {
        completeNode('school', null);
      }
      if (showToast) {
        showToast('School Profile configuration saved to database.', 'success');
      }
      return { ok: true };
    } catch (err) {
      console.error('Failed to save configuration:', err);
      return { ok: false, title: 'School Profile Not Saved', message: 'Failed to save configuration: ' + (err?.message || 'Unknown error') };
    } finally {
      setIsSaving(false);
    }
  };
  runSaveRef.current = runSchoolProfileSave;

  // Header Save opens the typed-CONFIRM step; confirming it runs the same save the unsaved-changes dialog uses.
  const handleConfirmAndProceed = async () => {
    if (confirmInput.trim().toUpperCase() !== 'CONFIRM') return;
    const result = await runSchoolProfileSave();
    if (result.ok === false && showAlert) {
      await showAlert(result.title, result.message);
    }
  };

  return (
    <section id="school" className="view grid">
      <style>{`
        .school-profile-split-layout {
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 32px;
          align-items: start;
          width: 100%;
        }
        @media (max-width: 1100px) {
          .school-profile-split-layout {
            grid-template-columns: 1fr;
          }
        }
        @keyframes specialProgGlow {
          0%, 100% {
            box-shadow: 0 0 25px rgba(59, 130, 246, 0.4), 0 0 50px rgba(99, 102, 241, 0.2);
            border-color: #3b82f6 !important;
          }
          50% {
            box-shadow: 0 0 45px rgba(59, 130, 246, 0.85), 0 0 85px rgba(99, 102, 241, 0.5);
            border-color: #60a5fa !important;
          }
        }
        .special-programs-glowing {
          animation: specialProgGlow 2s infinite ease-in-out !important;
          position: relative;
          z-index: 998;
        }
      `}</style>

      {/* Full Widescreen Portal Header */}
      <PortalHeader
        title="School Profile & Registry"
        description="Official administrative details, curricular offerings, and special programs setup."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={() => setIsConfirmModalOpen(true)}
        continueText="Save"
        continueDisabled={!isDirty || isSaving}
      />

      {/* 2-Column Split Dashboard Layout */}
      <div className="school-profile-split-layout">
        
        {/* LEFT COLUMN: School Identity & Curricular Offerings Portfolio (Pinned HUD) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <article className="card" style={{ border: '1px solid #e2e8f0', borderRadius: '22px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05)', position: 'sticky', top: '20px' }}>
            
            {/* Sleek Header Banner */}
            <div style={{
              background: 'radial-gradient(circle at top right, #1e293b 0%, #0f172a 100%)',
              padding: '26px 32px',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <FiBookOpen size={24} color="#f8fafc" />
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900', letterSpacing: '-0.025em', color: '#f8fafc' }}>
                    School Registry Identity
                  </h2>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
                  Official administrative details from **Unit 1 Schools Identity Registry**.
                </p>
              </div>

              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                padding: '7px 14px',
                borderRadius: '30px',
                fontSize: '12px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <FiShield size={15} /> Official Registry Match
              </div>
            </div>

            <div style={{ padding: '28px 32px', background: '#ffffff' }}>
              
              {/* Basic School Information */}
              <div style={{ marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <FiMapPin size={18} style={{ color: '#3b82f6' }} />
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Basic School Information
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>School ID</label>
                    <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' }}>{schoolInfo.schoolId || '—'}</span>
                  </div>

                  <div style={{ padding: '14px 18px', background: '#eff6ff', borderRadius: '14px', border: '1.5px solid #bfdbfe' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#1d4ed8', fontWeight: '800', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>School Year</label>
                    <span style={{ fontSize: '16px', fontWeight: '900', color: '#1e40af' }}>{schoolInfo.schoolYear || 'SY 26-27'}</span>
                  </div>

                  <div style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>School Name</label>
                    <span style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', lineHeight: '1.4' }}>{schoolInfo.schoolName || '—'}</span>
                  </div>

                  <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>Region</label>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>{schoolInfo.region || '—'}</span>
                  </div>

                  <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>Division</label>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>{schoolInfo.division || '—'}</span>
                  </div>

                  <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '800', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>District</label>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>{schoolInfo.district || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Curricular Offerings Section */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '26px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <FiTarget size={18} style={{ color: '#10b981' }} />
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Curricular Offerings Portfolio
                    </h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                    Active offerings automatically unlock levels and subjects in Workload.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(OFFERING_METADATA).map(([key, meta]) => {
                    const isActive = currentOfferings.includes(key);
                    return (
                      <div
                        key={key}
                        style={{
                          padding: '16px 20px',
                          borderRadius: '14px',
                          background: isActive ? meta.bg : '#ffffff',
                          border: isActive ? `1.5px solid ${meta.border}` : '1px solid #e2e8f0',
                          opacity: isActive ? 1 : 0.55,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '24px', display: 'flex', alignItems: 'center' }}>
                          {key === 'Elementary' ? <FiBookOpen size={24} color={meta.color} /> : key === 'JHS' ? <FiBook size={24} color={meta.color} /> : <FiAward size={24} color={meta.color} />}
                        </div>
                        
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: isActive ? '#0f172a' : '#64748b' }}>{meta.title}</h4>
                            <span style={{
                              fontSize: '11px',
                              background: isActive ? meta.color : '#e2e8f0',
                              color: isActive ? 'white' : '#64748b',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontWeight: '800'
                            }}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: isActive ? '#475569' : '#94a3b8' }}>{meta.subtitle}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </article>
        </div>

        {/* RIGHT COLUMN: Special Curricular Programs & SHS Curriculum Model */}
        <div>
          <article
            className={`card ${isConfirmModalOpen ? 'special-programs-glowing' : ''}`}
            style={{
              border: isConfirmModalOpen ? '2px solid #3b82f6' : '1px solid #e2e8f0',
              borderRadius: '22px',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05)',
              background: '#ffffff',
              transition: 'all 0.3s ease'
            }}
          >
            {/* Header Banner */}
            <div style={{
              padding: '26px 32px',
              borderBottom: '1px solid #f1f5f9',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '4px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #bfdbfe'
                }}>
                  <FiStar size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '21px', fontWeight: '900', color: '#0f172a' }}>
                    Special Curricular Programs & Curriculum Model
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Configure authorized special programs for Elementary, JHS, and Grade 12 SHS Curriculum Model.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Question 1: Elementary Special Curricular Programs */}
              {isElemActive ? (
                <div style={{ padding: '22px 28px', borderRadius: '16px', background: '#ecfdf5', border: '1.5px solid #a7f3d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: hasElemSpecialPrograms === 'yes' ? '14px' : '0' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '900', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>
                        Elementary Offering Active
                      </span>
                      <label style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        1. Does your Elementary School offer Special Curricular Programs?
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setHasElemSpecialPrograms('yes');
                          setElemSpecialProgram(true);
                        }}
                        style={{
                          padding: '8px 22px',
                          borderRadius: '10px',
                          border: hasElemSpecialPrograms === 'yes' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                          background: hasElemSpecialPrograms === 'yes' ? '#10b981' : '#ffffff',
                          color: hasElemSpecialPrograms === 'yes' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasElemSpecialPrograms('no');
                          setElemSpecialProgram(false);
                        }}
                        style={{
                          padding: '8px 22px',
                          borderRadius: '10px',
                          border: hasElemSpecialPrograms === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                          background: hasElemSpecialPrograms === 'no' ? '#64748b' : '#ffffff',
                          color: hasElemSpecialPrograms === 'no' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        NO
                      </button>
                    </div>
                  </div>

                  {hasElemSpecialPrograms === 'yes' && (
                    <div style={{ borderTop: '1px dashed #6ee7b7', paddingTop: '14px' }}>
                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: '1.5px solid #10b981',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: '800',
                        fontSize: '13px',
                        color: '#047857'
                      }}>
                        <input
                          type="checkbox"
                          checked={elemSpecialProgram}
                          onChange={(e) => setElemSpecialProgram(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                        />
                        <FiAward size={16} /> SPECIAL SCIENCE ELEMENTARY SCHOOL (SSES)
                      </label>
                    </div>
                  )}

                  {/* Elementary Inclusive Education Programs Question */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid #a7f3d0', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasElemInclusive === 'yes' ? '12px' : '0' }}>
                      <div>
                        <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          Does your Elementary School implement Inclusive Education Programs (ALS, SNED, IPED, Madrasah)?
                        </label>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#047857' }}>
                          Select authorized inclusive offerings (e.g. ALS-ES, SNED-ES, IPED-ES, MADRASAH-ES).
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setHasElemInclusive('yes');
                            if (elemInclusivePrograms.length === 0) setElemInclusivePrograms(['ALS-ES', 'SNED-ES']);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasElemInclusive === 'yes' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                            background: hasElemInclusive === 'yes' ? '#10b981' : '#ffffff',
                            color: hasElemInclusive === 'yes' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHasElemInclusive('no');
                            setElemInclusivePrograms([]);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasElemInclusive === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                            background: hasElemInclusive === 'no' ? '#64748b' : '#ffffff',
                            color: hasElemInclusive === 'no' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>

                    {hasElemInclusive === 'yes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        {[
                          { tag: 'ALS-ES', label: 'ALS (Alternative Learning System)' },
                          { tag: 'SNED-ES', label: 'SNED (Special Needs Education)' },
                          { tag: 'IPED-ES', label: 'IPED (Indigenous Peoples Education)' },
                          { tag: 'MADRASAH-ES', label: 'MADRASAH (ALIVE Program)' }
                        ].map(item => {
                          const isChecked = elemInclusivePrograms.includes(item.tag);
                          return (
                            <label
                              key={item.tag}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: isChecked ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#047857' : '#475569'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setElemInclusivePrograms(prev => 
                                    prev.includes(item.tag) ? prev.filter(t => t !== item.tag) : [...prev, item.tag]
                                  );
                                }}
                                style={{ width: '15px', height: '15px', accentColor: '#10b981' }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px 20px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiInfo size={16} /> Elementary Special Programs section is hidden because Elementary offering is inactive.
                </div>
              )}

              {/* Question 2: Junior High School Special Curricular Programs */}
              {isJHSActive ? (
                <div style={{ padding: '22px 28px', borderRadius: '16px', background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: hasJhsSpecialPrograms === 'yes' ? '16px' : '0' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: '900', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>
                        Junior High School (JHS) Offering Active
                      </span>
                      <label style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        2. Does your Junior High School offer Special Curricular Programs?
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setHasJhsSpecialPrograms('yes');
                          syncConfigDraft({ hasJhsSpecialPrograms: 'yes' });
                        }}
                        style={{
                          padding: '8px 22px',
                          borderRadius: '10px',
                          border: hasJhsSpecialPrograms === 'yes' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: hasJhsSpecialPrograms === 'yes' ? '#2563eb' : '#ffffff',
                          color: hasJhsSpecialPrograms === 'yes' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        YES
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasJhsSpecialPrograms('no');
                          setJhsSpecialPrograms([]);
                          syncConfigDraft({ hasJhsSpecialPrograms: 'no', jhsSpecialPrograms: [] });
                        }}
                        style={{
                          padding: '8px 22px',
                          borderRadius: '10px',
                          border: hasJhsSpecialPrograms === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                          background: hasJhsSpecialPrograms === 'no' ? '#64748b' : '#ffffff',
                          color: hasJhsSpecialPrograms === 'no' ? '#ffffff' : '#475569',
                          fontWeight: '800',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        NO
                      </button>
                    </div>
                  </div>

                  {hasJhsSpecialPrograms === 'yes' && (
                    <div style={{ borderTop: '1px dashed #93c5fd', paddingTop: '16px' }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#1e40af', fontWeight: '800' }}>
                        Select all JHS Special Programs implemented in your school:
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                        {JHS_PROGRAM_OPTIONS.map((item) => {
                          const isChecked = jhsSpecialPrograms.includes(item.label);
                          return (
                            <label
                              key={item.code}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: isChecked ? '1.5px solid #2563eb' : '1px solid #dbeafe',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#1e40af' : '#334155',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleJhsProgram(item.label)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                              />
                              <FiAward size={15} />
                              <span style={{ flex: 1, lineHeight: '1.4' }}>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* JHS Inclusive Education Programs Question */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid #bfdbfe', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasJhsInclusive === 'yes' ? '12px' : '0' }}>
                      <div>
                        <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          Does your Junior High School implement Inclusive Education Programs (ALS, SNED, IPED, Madrasah)?
                        </label>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#1d4ed8' }}>
                          Select authorized JHS inclusive offerings (e.g. ALS-JHS, SNED-JHS, IPED-JHS, MADRASAH-JHS).
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setHasJhsInclusive('yes');
                            if (jhsInclusivePrograms.length === 0) setJhsInclusivePrograms(['ALS-JHS', 'SNED-JHS']);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasJhsInclusive === 'yes' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: hasJhsInclusive === 'yes' ? '#2563eb' : '#ffffff',
                            color: hasJhsInclusive === 'yes' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHasJhsInclusive('no');
                            setJhsInclusivePrograms([]);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasJhsInclusive === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                            background: hasJhsInclusive === 'no' ? '#64748b' : '#ffffff',
                            color: hasJhsInclusive === 'no' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>

                    {hasJhsInclusive === 'yes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        {[
                          { tag: 'ALS-JHS', label: 'ALS (Alternative Learning System)' },
                          { tag: 'SNED-JHS', label: 'SNED (Special Needs Education)' },
                          { tag: 'IPED-JHS', label: 'IPED (Indigenous Peoples Education)' },
                          { tag: 'MADRASAH-JHS', label: 'MADRASAH (ALIVE Program)' }
                        ].map(item => {
                          const isChecked = jhsInclusivePrograms.includes(item.tag);
                          return (
                            <label
                              key={item.tag}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: isChecked ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#1d4ed8' : '#475569'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setJhsInclusivePrograms(prev => 
                                    prev.includes(item.tag) ? prev.filter(t => t !== item.tag) : [...prev, item.tag]
                                  );
                                }}
                                style={{ width: '15px', height: '15px', accentColor: '#2563eb' }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px 20px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiInfo size={16} /> JHS Special Programs section is hidden because Junior High School offering is inactive.
                </div>
              )}

              {/* Question 3: Senior High School Curriculum Model */}
              {isSHSActive ? (
                <div style={{ padding: '20px 24px', borderRadius: '16px', background: '#f5f3ff', border: '1.5px solid #ddd6fe' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '900', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>
                      Senior High School (SHS) Offering Active
                    </span>
                    <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                      3. Which Senior High School Curriculum model does your school offer for Grade 12?
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: shsCurriculumModel === 'Standard K-12 SHS Curriculum' ? '2px solid #8b5cf6' : '1px solid #cbd5e1',
                      background: shsCurriculumModel === 'Standard K-12 SHS Curriculum' ? '#ffffff' : '#f8fafc',
                      fontWeight: '800',
                      fontSize: '13px',
                      color: shsCurriculumModel === 'Standard K-12 SHS Curriculum' ? '#5b21b6' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}>
                      <input
                        type="radio"
                        name="shsCurriculumModel"
                        value="Standard K-12 SHS Curriculum"
                        checked={shsCurriculumModel === 'Standard K-12 SHS Curriculum'}
                        onChange={(e) => setShsCurriculumModel(e.target.value)}
                        style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                      />
                      <FiBook size={16} /> Standard K-12 SHS Curriculum
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)' ? '2px solid #8b5cf6' : '1.5px solid #cbd5e1',
                      background: shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)' ? '#ffffff' : '#f8fafc',
                      fontWeight: '800',
                      fontSize: '13px',
                      color: shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)' ? '#5b21b6' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}>
                      <input
                        type="radio"
                        name="shsCurriculumModel"
                        value="Strengthened Senior High School Curriculum (Grade 12)"
                        checked={shsCurriculumModel === 'Strengthened Senior High School Curriculum (Grade 12)'}
                        onChange={(e) => setShsCurriculumModel(e.target.value)}
                        style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                      />
                      <FiAward size={16} /> Strengthened SHS Curriculum (Grade 12)
                    </label>
                  </div>

                  {/* SHS Inclusive Education Programs Question */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid #ddd6fe', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasShsInclusive === 'yes' ? '12px' : '0' }}>
                      <div>
                        <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          Does your Senior High School implement Inclusive Education Programs (ALS, SNED, IPED, Madrasah)?
                        </label>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6d28d9' }}>
                          Select authorized SHS inclusive offerings (e.g. ALS-SHS, SNED-SHS, IPED-SHS, MADRASAH-SHS).
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setHasShsInclusive('yes');
                            if (shsInclusivePrograms.length === 0) setShsInclusivePrograms(['ALS-SHS', 'SNED-SHS']);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasShsInclusive === 'yes' ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                            background: hasShsInclusive === 'yes' ? '#8b5cf6' : '#ffffff',
                            color: hasShsInclusive === 'yes' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHasShsInclusive('no');
                            setShsInclusivePrograms([]);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasShsInclusive === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                            background: hasShsInclusive === 'no' ? '#64748b' : '#ffffff',
                            color: hasShsInclusive === 'no' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>

                    {hasShsInclusive === 'yes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        {[
                          { tag: 'ALS-SHS', label: 'ALS (Alternative Learning System)' },
                          { tag: 'SNED-SHS', label: 'SNED (Special Needs Education)' },
                          { tag: 'IPED-SHS', label: 'IPED (Indigenous Peoples Education)' },
                          { tag: 'MADRASAH-SHS', label: 'MADRASAH (ALIVE Program)' }
                        ].map(item => {
                          const isChecked = shsInclusivePrograms.includes(item.tag);
                          return (
                            <label
                              key={item.tag}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: isChecked ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#5b21b6' : '#475569'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setShsInclusivePrograms(prev => 
                                    prev.includes(item.tag) ? prev.filter(t => t !== item.tag) : [...prev, item.tag]
                                  );
                                }}
                                style={{ width: '15px', height: '15px', accentColor: '#8b5cf6' }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px 20px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiInfo size={16} /> Senior High School (Grade 12) Curriculum Model section is hidden because Senior High School offering is inactive.
                </div>
              )}

            </div>
          </article>

          {/* School Shift Schedule (Optional) */}
          <article
            className="card"
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '22px',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05)',
              background: '#ffffff',
              marginTop: '24px'
            }}
          >
            <div style={{
              padding: '24px 32px',
              borderBottom: '1px solid #f1f5f9',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '14px',
                background: '#f0f9ff',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #bae6fd'
              }}>
                <FiClock size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
                    School Shift Schedule
                  </h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    background: '#f1f5f9',
                    color: '#64748b',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    Optional
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Declare custom institutional shift operating hours for timetable scheduling and workload computations.
                </p>
              </div>
            </div>

            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0, display: 'block' }}>
                    Does your school operate on a declared custom shift schedule?
                  </label>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                    If disabled, timetables default to DepEd standard operational bounds (7:00 AM – 6:00 PM).
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setHasShifts('yes');
                      syncConfigDraft({ hasShifts: 'yes' });
                    }}
                    style={{
                      padding: '8px 22px',
                      borderRadius: '10px',
                      border: hasShifts === 'yes' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                      background: hasShifts === 'yes' ? '#0284c7' : '#ffffff',
                      color: hasShifts === 'yes' ? '#ffffff' : '#475569',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    YES
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasShifts('no');
                      syncConfigDraft({ hasShifts: 'no' });
                    }}
                    style={{
                      padding: '8px 22px',
                      borderRadius: '10px',
                      border: hasShifts === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                      background: hasShifts === 'no' ? '#64748b' : '#ffffff',
                      color: hasShifts === 'no' ? '#ffffff' : '#475569',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    NO
                  </button>
                </div>
              </div>

              {hasShifts === 'yes' && (
                <div style={{
                  padding: '20px',
                  background: '#f0f9ff',
                  borderRadius: '16px',
                  border: '1.5px solid #bae6fd',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                        Shift Start Time
                      </label>
                      <input
                        type="time"
                        value={shiftStartTime}
                        onChange={(e) => {
                          setShiftStartTime(e.target.value);
                          syncConfigDraft({ shiftStartTime: e.target.value });
                        }}
                        min="04:00"
                        max="21:59"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1.5px solid #7dd3fc',
                          background: '#ffffff',
                          fontSize: '14px',
                          fontWeight: '700',
                          color: '#0f172a',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                        Shift End Time
                      </label>
                      <input
                        type="time"
                        value={shiftEndTime}
                        onChange={(e) => {
                          setShiftEndTime(e.target.value);
                          syncConfigDraft({ shiftEndTime: e.target.value });
                        }}
                        min="04:01"
                        max="22:00"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1.5px solid #7dd3fc',
                          background: '#ffffff',
                          fontSize: '14px',
                          fontWeight: '700',
                          color: '#0f172a',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    paddingTop: '8px',
                    borderTop: '1px dashed #7dd3fc',
                    fontSize: '12px',
                    color: '#0369a1'
                  }}>
                    <span>Operational window: <strong>4:00 AM – 10:00 PM</strong> (e.g. 7:00 AM to 2:10 PM for 50-minute periods).</span>
                    <span style={{
                      background: '#e0f2fe',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontWeight: '800',
                      color: '#0284c7'
                    }}>
                      Active Window: {shiftStartTime} – {shiftEndTime}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>

      </div>

      {/* CONFIRMATION MODAL WITH SPOTLIGHT GLOW GATE */}
      {isConfirmModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSaving) {
              setIsConfirmModalOpen(false);
              setConfirmInput('');
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              maxWidth: '540px',
              width: '100%',
              padding: '32px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
              position: 'relative'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe'
                }}>
                  <FiShield size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
                    Confirm Curricular Programs
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Verify your school's Special Curricular Programs before proceeding.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSaving) {
                    setIsConfirmModalOpen(false);
                    setConfirmInput('');
                  }
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Program Breakdown Summary */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '20px'
            }}>
              <span style={{ fontSize: '10px', fontWeight: '900', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '10px' }}>
                Special Curricular Programs Summary
              </span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                {isElemActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#059669' }}>Elementary:</span>
                    <span style={{ fontWeight: '800', color: hasElemSpecialPrograms === 'yes' && elemSpecialProgram ? '#047857' : '#64748b' }}>
                      {hasElemSpecialPrograms === 'yes' && elemSpecialProgram ? 'Special Science Elementary (SSES)' : 'None'}
                    </span>
                  </div>
                )}

                {isJHSActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', gap: '12px' }}>
                    <span style={{ fontWeight: '700', color: '#2563eb' }}>Junior High:</span>
                    <span style={{ fontWeight: '800', color: hasJhsSpecialPrograms === 'yes' && jhsSpecialPrograms.length > 0 ? '#1d4ed8' : '#64748b', textAlign: 'right' }}>
                      {hasJhsSpecialPrograms === 'yes' && jhsSpecialPrograms.length > 0 ? jhsSpecialPrograms.join(', ') : 'None'}
                    </span>
                  </div>
                )}

                {isSHSActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#7c3aed' }}>Senior High Model:</span>
                    <span style={{ fontWeight: '800', color: '#5b21b6', textAlign: 'right' }}>
                      {shsCurriculumModel}
                    </span>
                  </div>
                )}

                {/* Inclusive Programs Summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', paddingTop: '4px' }}>
                  <span style={{ fontWeight: '700', color: '#0284c7' }}>Inclusive Programs:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                    {[
                      ...(hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
                      ...(hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
                      ...(hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
                    ].length > 0 ? (
                      [
                        ...(hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
                        ...(hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
                        ...(hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
                      ].map(tag => (
                        <span key={tag} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' }}>
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontWeight: '800', color: '#64748b' }}>None</span>
                    )}
                  </div>
                </div>

                {/* Shift Schedule Summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                  <span style={{ fontWeight: '700', color: '#0284c7' }}>Shift Schedule:</span>
                  <span style={{ fontWeight: '800', color: hasShifts === 'yes' ? '#0369a1' : '#64748b' }}>
                    {hasShifts === 'yes' ? `${shiftStartTime} – ${shiftEndTime}` : 'Standard (7:00 AM – 6:00 PM)'}
                  </span>
                </div>
              </div>
            </div>

            {/* CONFIRM Gate Input */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>
                Type <span style={{ color: '#2563eb', fontWeight: '900', letterSpacing: '0.05em' }}>CONFIRM</span> to certify that this is the official portfolio of your school:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                placeholder="Type CONFIRM"
                disabled={isSaving}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: confirmInput.trim() === 'CONFIRM' ? '2px solid #10b981' : '1.5px solid #cbd5e1',
                  background: confirmInput.trim() === 'CONFIRM' ? '#f0fdf4' : '#ffffff',
                  fontSize: '15px',
                  fontWeight: '900',
                  letterSpacing: '0.1em',
                  color: confirmInput.trim() === 'CONFIRM' ? '#047857' : '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmInput('');
                }}
                disabled={isSaving}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAndProceed}
                disabled={confirmInput.trim() !== 'CONFIRM' || isSaving}
                style={{
                  padding: '10px 24px',
                  borderRadius: '12px',
                  border: 'none',
                  background: confirmInput.trim() === 'CONFIRM' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#e2e8f0',
                  color: confirmInput.trim() === 'CONFIRM' ? '#ffffff' : '#94a3b8',
                  fontWeight: '800',
                  fontSize: '13px',
                  cursor: confirmInput.trim() === 'CONFIRM' && !isSaving ? 'pointer' : 'not-allowed',
                  boxShadow: confirmInput.trim() === 'CONFIRM' ? '0 10px 20px -5px rgba(16, 185, 129, 0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                {isSaving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
