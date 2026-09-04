import React, { useState } from 'react';
import { parseESF7File } from '../utils/esf7Harvester';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { FiUploadCloud, FiCheckCircle, FiAlertCircle, FiX, FiFileText, FiUsers, FiCalendar, FiHome } from 'react-icons/fi';

export default function ESF7UploadModal({ isOpen, onClose, onImportSuccess, isForceUpload = false, pendingSchool = null, onLogout }) {
  const { personnel, setPersonnel, classSections, setClassSections, schoolInfo, setSchoolInfo, setHasUnsavedChanges, showToast } = useApp();
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  const handleCancelOrLogout = () => {
    if (isForceUpload) {
      if (onLogout) {
        onLogout();
      } else {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsb') && !file.name.endsWith('.xlsx')) {
      setErrorMsg('Please select a valid eSF7 file (.xlsb or .xlsx format).');
      return;
    }

    setErrorMsg('');
    setRawFile(file);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const result = parseESF7File(buffer);

        if (result.success) {
          setParsedData(result);
          setSelectedPersonnel(result.personnelList.map((_, idx) => idx));
        } else {
          setErrorMsg(result.error || 'Failed to parse eSF7 spreadsheet.');
        }
      } catch (err) {
        setErrorMsg('Error reading eSF7 file: ' + err.message);
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const toggleSelectAll = () => {
    if (selectedPersonnel.length === parsedData.personnelList.length) {
      setSelectedPersonnel([]);
    } else {
      setSelectedPersonnel(parsedData.personnelList.map((_, idx) => idx));
    }
  };

  const toggleSelectPerson = (idx) => {
    if (selectedPersonnel.includes(idx)) {
      setSelectedPersonnel(selectedPersonnel.filter(i => i !== idx));
    } else {
      setSelectedPersonnel([...selectedPersonnel, idx]);
    }
  };

  const isNonClassSection = (name) => {
    if (!name) return true;
    const upper = name.toUpperCase().trim();
    return (
      upper.includes('ANCILLARY') ||
      upper.includes('COLLABORATIVE') ||
      upper.includes('ADMINISTRATIVE') ||
      upper.includes('OFFICE') ||
      upper.includes('FLASH VISITS') ||
      upper.includes('COACHING') ||
      upper.includes('MENTORING') ||
      upper.includes('INTERVENTION') ||
      upper.includes('TECHNICAL ASSISTANCE')
    );
  };

  const handleConfirmImport = async () => {
    if (!parsedData || selectedPersonnel.length === 0) return;

    setIsUploading(true);
    setErrorMsg('');

    try {
      const listToImport = selectedPersonnel.map(idx => parsedData.personnelList[idx]);

      let updatedPersonnel = Array.isArray(personnel) ? [...personnel] : [];
      let updatedSections = Array.isArray(classSections) ? [...classSections] : [];

      const normalizeGradeLevel = (gl) => {
        if (!gl) return 'Grade 1';
        const str = String(gl).trim();
        if (str === '1' || str === 'G1') return 'Grade 1';
        if (str === '2' || str === 'G2') return 'Grade 2';
        if (str === '3' || str === 'G3') return 'Grade 3';
        if (str === '4' || str === 'G4') return 'Grade 4';
        if (str === '5' || str === 'G5') return 'Grade 5';
        if (str === '6' || str === 'G6') return 'Grade 6';
        if (str === '7' || str === 'G7') return 'Grade 7';
        if (str === '8' || str === 'G8') return 'Grade 8';
        if (str === '9' || str === 'G9') return 'Grade 9';
        if (str === '10' || str === 'G10') return 'Grade 10';
        if (str === '11' || str === 'G11') return 'Grade 11';
        if (str === '12' || str === 'G12') return 'Grade 12';
        if (str.toUpperCase().includes('KINDER')) return 'Kinder';
        if (str.toUpperCase().includes('MONO') || str.toUpperCase().includes('NON')) return 'Grade 1';
        return str.startsWith('Grade') ? str : `Grade ${str}`;
      };

      listToImport.forEach((p, pIdx) => {
        const teacherGradesSet = new Set();
        const teachingWorkloads = [];
        const teachingRelatedRows = [];
        const administrativeRows = [];

        // Determine target person ID first (existing or new)
        let targetPersonId = '';
        const existingIdx = updatedPersonnel.findIndex(item => {
          if (p.tin && item.tin && String(p.tin).trim() === String(item.tin).trim()) return true;
          return (
            String(item.lastName || '').toLowerCase() === String(p.lastName || '').toLowerCase() &&
            String(item.firstName || '').toLowerCase() === String(p.firstName || '').toLowerCase()
          );
        });

        if (existingIdx !== -1) {
          targetPersonId = updatedPersonnel[existingIdx].id;
        } else {
          targetPersonId = `P-HARVEST-${Date.now()}-${pIdx}`;
        }

        // Map extracted workloads into appropriate task categories
        (p.workloads || []).forEach((w, wIdx) => {
          let taskOrSubj = String(w.subject || w.task || '').trim();
          let taskUpper = taskOrSubj.toUpperCase();

          if (taskUpper.includes('HOMEROOM GUIDANCE') || taskUpper.startsWith('HOMEROOM GUIDANCE') || taskUpper.startsWith('HGP (')) {
            taskOrSubj = 'HGP';
            taskUpper = 'HGP';
          }

          const secName = w.sectionName || '';
          const normGrade = normalizeGradeLevel(w.gradeLevel);

          // Classification logic:
          // 1. TR -> Teaching-Related Tasks
          // 2. ADMIN, ANCILLARY, COACHING, MENTORING -> Administrative Tasks
          // 3. Subject periods -> Classroom Subject Periods
          const isTR = taskUpper.startsWith('TR') || taskUpper.includes('TR -') || taskUpper.includes('TEACHING RELATED') || taskUpper.includes('TEACHING-RELATED');
          const isAdmin = taskUpper.includes('ADMIN') || taskUpper.includes('COACHING') || taskUpper.includes('MENTORING') || taskUpper.includes('ANCILLARY') || taskUpper.includes('FLASH VISITS');

          if (isTR) {
            teachingRelatedRows.push({
              id: `tr-ext-${Date.now()}-${pIdx}-${wIdx}`,
              task: taskOrSubj,
              dates: [
                {
                  date: '',
                  startTime: w.startTime || '08:00',
                  endTime: w.endTime || '09:00',
                  days: w.days || ['M', 'T', 'W', 'TH', 'F']
                }
              ]
            });
          } else if (isAdmin) {
            administrativeRows.push({
              id: `adm-ext-${Date.now()}-${pIdx}-${wIdx}`,
              task: taskOrSubj,
              dates: [
                {
                  date: '',
                  startTime: w.startTime || '08:00',
                  endTime: w.endTime || '09:00',
                  days: w.days || ['M', 'T', 'W', 'TH', 'F']
                }
              ]
            });
          } else {
            // Classroom Teaching Subject
            const isNonTeachingPerson = (p.type === 'non-teaching') || (
              String(p.position || '').toUpperCase().includes('ADMINISTRATIVE') ||
              String(p.position || '').toUpperCase().includes('ADAS') ||
              String(p.position || '').toUpperCase().includes('BOOKKEEPER') ||
              String(p.position || '').toUpperCase().includes('SECURITY') ||
              String(p.position || '').toUpperCase().includes('UTILITY') ||
              String(p.position || '').toUpperCase().includes('NURSE') ||
              String(p.position || '').toUpperCase().includes('DRIVER') ||
              String(p.position || '').toUpperCase().includes('AIDE') ||
              String(p.position || '').toUpperCase().includes('ACCOUNTANT') ||
              String(p.position || '').toUpperCase().includes('DISBURSING')
            );

            if (isNonTeachingPerson) {
              // Non-teaching personnel automatically has NO teaching workload.
              // Workloads are placed under Administrative Tasks or Teaching-Related Tasks!
              const isTRTask = taskUpper.startsWith('TR') || taskUpper.includes('TR -') || taskUpper.includes('TEACHING RELATED') || taskUpper.includes('TEACHING-RELATED');
              if (isTRTask) {
                teachingRelatedRows.push({
                  id: `tr-ext-${Date.now()}-${pIdx}-${wIdx}`,
                  task: taskOrSubj || 'Teaching-Related Duties',
                  dates: [
                    {
                      date: '',
                      startTime: w.startTime || '08:00',
                      endTime: w.endTime || '17:00',
                      days: w.days || ['M', 'T', 'W', 'TH', 'F']
                    }
                  ]
                });
              } else {
                administrativeRows.push({
                  id: `adm-ext-${Date.now()}-${pIdx}-${wIdx}`,
                  task: taskOrSubj || 'Administrative Duties',
                  dates: [
                    {
                      date: '',
                      startTime: w.startTime || '08:00',
                      endTime: w.endTime || '17:00',
                      days: w.days || ['M', 'T', 'W', 'TH', 'F']
                    }
                  ]
                });
              }
              return;
            }

            const isValidSection = secName && !isNonClassSection(secName);

            if (isValidSection) {
              teacherGradesSet.add(normGrade);
            }

            let targetSecId = '';
            if (isValidSection) {
              let existingSec = updatedSections.find(s => 
                String(s.sectionName || s.section_name || '').toLowerCase().trim() === secName.toLowerCase().trim()
              );

              if (existingSec) {
                targetSecId = String(existingSec.id);
                if (taskUpper.includes('ADVISORY') || taskUpper.includes('HOMEROOM GUIDANCE') || taskUpper === 'HGP') {
                  existingSec.advisorId = targetPersonId;
                  existingSec.adviserId = targetPersonId;
                  existingSec.adviser_id = targetPersonId;
                }
              } else {
                targetSecId = `sec-ext-${Date.now()}-${pIdx}-${Math.random().toString(36).substr(2, 5)}`;
                existingSec = {
                  id: targetSecId,
                  sectionName: secName,
                  section_name: secName,
                  gradeLevel: normGrade,
                  grade_level: normGrade,
                  sectionType: 'MONO GRADE',
                  section_type: 'MONO GRADE',
                  ...(taskUpper.includes('ADVISORY') || taskUpper.includes('HOMEROOM GUIDANCE') || taskUpper === 'HGP' ? { advisorId: targetPersonId, adviserId: targetPersonId, adviser_id: targetPersonId } : {})
                };
                updatedSections.push(existingSec);
              }
              if (taskUpper === 'ADVISORY' || taskUpper === 'CLASS ADVISORY') {
                // ADVISORY marks section advisorId; do not push duplicate subject workload row
                return;
              }
            }

            teachingWorkloads.push({
              id: `wrk-ext-${Date.now()}-${pIdx}-${wIdx}`,
              rowType: 'teaching',
              subject: String(taskOrSubj || 'GENERAL').toUpperCase().trim(),
              subject_name: String(taskOrSubj || 'GENERAL').toUpperCase().trim(),
              task: String(taskOrSubj || 'GENERAL').toUpperCase().trim(),
              gradeLevel: normGrade,
              grade_level: normGrade,
              sectionName: isValidSection ? secName : '',
              section_name: isValidSection ? secName : '',
              sectionId: targetSecId,
              section_id: targetSecId,
              startTime: w.startTime || '08:00',
              endTime: w.endTime || '09:00',
              days: w.days || ['M', 'T', 'W', 'TH', 'F'],
              minsPerDay: w.minsPerDay || 0
            });
          }
        });

        const assignedGradesArr = Array.from(teacherGradesSet);

        if (existingIdx !== -1) {
          // Merge with existing local person
          const existing = updatedPersonnel[existingIdx];
          const mergedGrades = Array.from(new Set([...(existing.assignedGradeLevels || existing.gradeLevelsTaught || []), ...assignedGradesArr]));
          updatedPersonnel[existingIdx] = {
            ...existing,
            firstName: p.firstName || existing.firstName,
            middleName: p.middleName || existing.middleName,
            lastName: p.lastName || existing.lastName,
            sexAtBirth: p.sex || existing.sexAtBirth,
            tin: p.tin || existing.tin,
            position: p.position || existing.position,
            fundSource: p.fundSource || existing.fundSource,
            natureOfAppointment: p.appointmentStatus || existing.natureOfAppointment,
            collegeDegree: p.degree || existing.collegeDegree,
            major: p.major || existing.major,
            minor: p.minor || existing.minor,
            type: p.type || existing.type || 'teaching',
            assignedGradeLevels: mergedGrades.length > 0 ? mergedGrades : (existing.assignedGradeLevels || ['Grade 1']),
            gradeLevelsTaught: mergedGrades.length > 0 ? mergedGrades : (existing.gradeLevelsTaught || ['Grade 1']),
            workloadRows: teachingWorkloads.length > 0 ? teachingWorkloads : existing.workloadRows,
            teachingRelatedRows: teachingRelatedRows.length > 0 ? teachingRelatedRows : (existing.teachingRelatedRows || []),
            administrativeRows: administrativeRows.length > 0 ? administrativeRows : (existing.administrativeRows || [])
          };
        } else {
          // Create new local personnel object
          updatedPersonnel.push({
            id: targetPersonId,
            prn: p.tin ? `PRN-${p.tin}` : `PRN-HARVEST-${Date.now()}-${pIdx}`,
            firstName: p.firstName,
            middleName: p.middleName || '',
            lastName: p.lastName,
            salutation: p.sex === 'Male' ? 'Mr.' : 'Ms.',
            sexAtBirth: p.sex || 'Male',
            civilStatus: 'Single',
            tin: p.tin || '',
            noTin: !p.tin,
            position: p.position || 'TEACHER I',
            fundSource: p.fundSource || 'NATIONAL',
            natureOfAppointment: p.appointmentStatus || 'REGULAR PERMANENT',
            collegeDegree: p.degree || 'BACHELOR',
            major: p.major || 'GENERAL EDUCATION',
            minor: p.minor || 'N/A',
            type: p.type || 'teaching',
            assignedGradeLevels: assignedGradesArr.length > 0 ? assignedGradesArr : ['Grade 1'],
            gradeLevelsTaught: assignedGradesArr.length > 0 ? assignedGradesArr : ['Grade 1'],
            depedEmail: `${(p.firstName || 'teacher').toLowerCase().replace(/[^a-z0-9]/g,'')}.${(p.lastName || 'deped').toLowerCase().replace(/[^a-z0-9]/g,'')}@deped.gov.ph`,
            deploymentStatus: 'Stationed',
            personalVerified: true,
            workloadVerified: false,
            needsTimeReview: true,
            workloadRows: teachingWorkloads,
            teachingRelatedRows: teachingRelatedRows,
            administrativeRows: administrativeRows
          });
        }
      });

      // Filter out unassigned dummy sections so harvested sections take priority
      const harvestedSecNames = new Set(
        listToImport.flatMap(p => (p.workloads || []).map(w => (w.sectionName || '').toLowerCase().trim())).filter(name => name && !isNonClassSection(name))
      );

      let finalSections = updatedSections.filter(s => {
        const sName = String(s.sectionName || s.section_name || '').toLowerCase().trim();
        return harvestedSecNames.has(sName) || s.advisorId || s.adviserId;
      });

      if (finalSections.length === 0 && updatedSections.length > 0) {
        finalSections = updatedSections;
      }

      // Update Local State & Trigger IndexedDB Auto-Save
      setPersonnel(updatedPersonnel);
      setClassSections(finalSections);
      
      if (parsedData.schoolName || parsedData.schoolId) {
        setSchoolInfo(prev => ({
          ...prev,
          ...(parsedData.schoolName ? { schoolName: parsedData.schoolName } : {}),
          ...(parsedData.schoolId ? { schoolId: parsedData.schoolId } : {})
        }));
      }

      setHasUnsavedChanges(true);

      // Submit raw spreadsheet binary to national queue (esf7_link -> VM harvester)
      if (rawFile) {
        try {
          const formData = new FormData();
          formData.append('file', rawFile);
          const targetSchoolId = (schoolInfo?.schoolId || parsedData.schoolId || 'UNKNOWN').replace(/^SCH-/i, '').trim();
          formData.append('school_id', targetSchoolId);

          fetch('/api/esf7-upload', {
            method: 'POST',
            body: formData
          }).then(res => res.json()).then(data => {
            if (data.success) {
              console.log('✅ [eSF7 Queue] File registered in national harvester queue:', data);
            }
          }).catch(uploadErr => {
            console.warn('⚠️ [eSF7 Queue Warning]:', uploadErr.message);
          });
        } catch (e) {
          console.warn('Background queue dispatch error:', e);
        }
      }

      if (showToast) {
        showToast(`Harvested ${listToImport.length} Personnel into Local Draft!`, 'success');
      }

      if (onImportSuccess) onImportSuccess({ success: true, count: listToImport.length });
      onClose();
    } catch (err) {
      console.error('Local Harvester Import Error:', err);
      setErrorMsg('Failed to process local import: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="modal-card" style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        width: '90%',
        maxWidth: '850px',
        maxHeight: '90vh',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          color: '#FFFFFF'
        }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '6px', fontSize: '11px', color: '#38BDF8', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>
              DepEd Official • School Year 2025–2026
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiFileText style={{ color: '#38BDF8' }} /> Submit eSF7 File for SY 2025–2026
            </h2>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 0 0' }}>
              You need to submit your eSF7 file for SY 2025–2026. Please upload your official .xlsb (or .xlsx) file to automatically populate your faculty roster, plantillas, and workloads.
            </p>
          </div>
          <button 
            onClick={handleCancelOrLogout}
            title={isForceUpload ? 'Cancel & Log Out' : 'Close'}
            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '20px' }}
          >
            <FiX />
          </button>
        </div>

        {/* Exemption & Conversion Banners */}
        {pendingSchool?.registrationType === 'newly-established' && (
          <div style={{ padding: '12px 24px', background: '#F0FDF4', borderBottom: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: '8px', color: '#15803D', fontSize: '12px', fontWeight: '700' }}>
            <FiCheckCircle size={16} /> Newly Established School (DepEd Verified) — Historical eSF7 upload is optional. You may encode your faculty manually.
          </div>
        )}

        {pendingSchool?.registrationType === 'conversion' && (
          <div style={{ padding: '12px 24px', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', color: '#1D4ED8', fontSize: '12px', fontWeight: '700', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiAlertCircle size={16} /> Converted Station (Previous School ID: {pendingSchool.oldSchoolId})
            </div>
            {pendingSchool.oldSchoolDataCount > 0 && (
              <button
                type="button"
                disabled={isCloning}
                onClick={async () => {
                  setIsCloning(true);
                  try {
                    const res = await fetch('/api/esf7-upload/import-converted', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        school_id: schoolInfo?.schoolId,
                        old_school_id: pendingSchool.oldSchoolId
                      })
                    });
                    const data = await res.json();
                    if (data.success) {
                      if (showToast) showToast(`Imported ${data.importedCount} faculty from previous Station ${pendingSchool.oldSchoolId}!`, 'success');
                      if (onImportSuccess) onImportSuccess({ success: true, count: data.importedCount });
                      onClose();
                    } else {
                      setErrorMsg(data.error || 'Failed to import from converted station.');
                    }
                  } catch (err) {
                    setErrorMsg(err.message);
                  } finally {
                    setIsCloning(false);
                  }
                }}
                style={{
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: '800',
                  cursor: isCloning ? 'not-allowed' : 'pointer'
                }}
              >
                {isCloning ? 'Importing...' : `Import ${pendingSchool.oldSchoolDataCount} Faculty from Previous School ID (${pendingSchool.oldSchoolId}) ➔`}
              </button>
            )}
          </div>
        )}

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <FiAlertCircle /> {errorMsg}
            </div>
          )}

          {!parsedData && (
            <div 
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              style={{
                border: `2px dashed ${dragActive ? '#3B82F6' : '#CBD5E1'}`,
                borderRadius: '12px',
                padding: '40px 24px',
                textAlign: 'center',
                background: dragActive ? '#EFF6FF' : '#F8FAFC',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={() => document.getElementById('esf7-file-input').click()}
            >
              <input 
                id="esf7-file-input" 
                type="file" 
                accept=".xlsb,.xlsx" 
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />
              <FiUploadCloud style={{ fontSize: '48px', color: '#3B82F6', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1E293B', margin: '0 0 6px 0' }}>
                {isParsing ? 'Parsing eSF7 Spreadsheet...' : 'Click to Upload or Drag & Drop eSF7 (.xlsb) File'}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Supports official DepEd eSF7 spreadsheets (e.g. eSF7-DB-131754-SY2024-2025.xlsb)
              </p>

              {isParsing && (
                <div style={{ marginTop: '16px', fontSize: '13px', color: '#2563EB', fontWeight: '500' }}>
                  Extracting Personnel & Workload records in browser...
                </div>
              )}
            </div>
          )}

          {parsedData && (
            <div>
              {/* Summary Bar */}
              <div style={{
                background: '#F1F5F9',
                padding: '16px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px'
              }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FiHome style={{ color: 'var(--navy)' }} /> {parsedData.schoolName || 'School Profile'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    School ID: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{parsedData.schoolId || 'N/A'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#2563EB' }}>
                      <FiUsers style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {parsedData.stats.totalPersonnel}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Personnel</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#059669' }}>
                      <FiCalendar style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {parsedData.stats.totalWorkloads}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Workload Slots</div>
                  </div>
                </div>
              </div>

              {/* Table Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                  Extracted Personnel List ({selectedPersonnel.length} / {parsedData.personnelList.length} selected)
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  style={{
                    background: '#E2E8F0',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  {selectedPersonnel.length === parsedData.personnelList.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Personnel Table */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', maxHeight: '350px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px 12px', width: '40px' }}>#</th>
                      <th style={{ padding: '10px 12px' }}>Personnel Name</th>
                      <th style={{ padding: '10px 12px' }}>TIN</th>
                      <th style={{ padding: '10px 12px' }}>Position</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Workload Slots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.personnelList.map((p, idx) => {
                      const isSelected = selectedPersonnel.includes(idx);
                      return (
                        <tr 
                          key={idx} 
                          onClick={() => toggleSelectPerson(idx)}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            background: isSelected ? '#F0F9FF' : 'transparent',
                            cursor: 'pointer'
                          }}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => {}}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: '600', color: '#0F172A' }}>
                            {p.lastName}, {p.firstName} {p.middleName ? p.middleName.charAt(0) + '.' : ''}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#64748B' }}>
                            {p.tin || 'No TIN'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155' }}>
                            <span style={{
                              background: p.type === 'teaching' ? '#DBEAFE' : '#F3E8FF',
                              color: p.type === 'teaching' ? '#1D4ED8' : '#7E22CE',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {p.position}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: '#059669' }}>
                            {p.workloads.length} slots
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E2E8F0',
          background: '#F8FAFC',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {parsedData && (
              <button
                type="button"
                onClick={() => setParsedData(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Choose Another File
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {pendingSchool?.registrationType === 'newly-established' && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#F0FDF4',
                  border: '1.5px solid #86EFAC',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#15803D',
                  cursor: 'pointer'
                }}
              >
                Encode Roster Manually
              </button>
            )}

            <button
              type="button"
              onClick={handleCancelOrLogout}
              style={{
                background: isForceUpload ? '#FEF2F2' : '#E2E8F0',
                border: isForceUpload ? '1px solid #FECACA' : 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: '700',
                color: isForceUpload ? '#DC2626' : '#475569',
                cursor: 'pointer'
              }}
            >
              {isForceUpload ? 'Cancel & Log Out' : 'Cancel'}
            </button>

            {parsedData && (
              <button
                type="button"
                disabled={isUploading || selectedPersonnel.length === 0}
                onClick={handleConfirmImport}
                style={{
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  cursor: (isUploading || selectedPersonnel.length === 0) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
                }}
              >
                {isUploading ? 'Loading into Local Draft...' : `Auto-Populate ${selectedPersonnel.length} Personnel (Local Draft)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
