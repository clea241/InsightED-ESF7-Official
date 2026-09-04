import React, { useState, useMemo } from 'react';
import {
  useApp,
  OFFICIAL_DESIGNATIONS,
  DESIGNATION_GRADE_LEVELS,
  SHS_TRACKS,
  SUBJECT_OPTIONS,
  PRIMARY_LEARNING_AREAS,
  getRegularSectionsEnrollment
} from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';
import PortalHeader from '../components/PortalHeader';
import { FiCheckCircle, FiAlertCircle, FiCheck, FiShield, FiFileText, FiFolder, FiUsers, FiUser, FiSearch, FiTag, FiBook, FiGrid, FiList, FiTrash2, FiX } from 'react-icons/fi';

function SdsToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: checked ? '#DCFCE7' : '#F1F5F9',
        border: checked ? '1px solid #86EFAC' : '1px solid #CBD5E1',
        borderRadius: '999px',
        padding: '3px 9px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none'
      }}
    >
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: checked ? '#16A34A' : '#94A3B8',
          display: 'inline-block',
          boxShadow: checked ? '0 0 5px rgba(22, 163, 74, 0.5)' : 'none',
          transition: 'all 0.15s ease'
        }}
      />
      <span style={{ fontSize: '10px', fontWeight: '800', color: checked ? '#15803D' : '#64748B', letterSpacing: '0.3px' }}>
        {checked ? 'APPROVED BY SDS' : 'APPROVE BY SDS'}
      </span>
    </button>
  );
}

export default function Designations() {
  const { personnel, setPersonnel, savePersonnelChanges, schoolEdited, schoolInfo, classSections, showToast, completeNode, setActiveView } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'matrix'

  // Dynamic enrollment calculation from regular sections
  const regularEnrollment = useMemo(() => {
    return getRegularSectionsEnrollment(classSections);
  }, [classSections]);

  const isAshRequired = regularEnrollment >= 1001;

  // Local state for parameterized choices per card
  const [cardParams, setCardParams] = useState({
    grade_level_chairperson: { grade: 'Grade 1' },
    learning_area_chairperson: { learningArea: 'Filipino' },
    department_head_ecp: { grade: 'Grade 1', learningArea: 'English', track: 'ACADEMIC' }
  });

  // State to track constraint violation alerts per card
  const [constraintErrors, setConstraintErrors] = useState({});

  // Active (non-draft) personnel list
  const activePersonnel = (Array.isArray(personnel) ? personnel : []).filter(p => !p.isDraft);

  // Active subjects from Organized Classes
  const activeSubjects = useMemo(() => {
    const list = new Set();
    if (schoolEdited?.subjects) {
      Object.values(schoolEdited.subjects).forEach(subList => {
        if (Array.isArray(subList)) {
          subList.forEach(s => {
            if (s?.name) list.add(s.name);
          });
        }
      });
    }
    if (list.size === 0) {
      SUBJECT_OPTIONS.forEach(s => {
        if (s !== 'ADVISORY') list.add(s);
      });
    }
    return Array.from(list);
  }, [schoolEdited]);

  // Offered grade levels based strictly on schoolInfo.curricularOffering
  const offeredGradeLevels = useMemo(() => {
    const offerings = (schoolInfo?.curricularOffering || []).map(o => String(o).toUpperCase());
    const grades = [];
    const hasElem = offerings.some(o => o.includes('ELEM') || o.includes('KINDER'));
    const hasJHS = offerings.some(o => o.includes('JHS') || o.includes('JUNIOR'));
    const hasSHS = offerings.some(o => o.includes('SHS') || o.includes('SENIOR'));

    if (hasElem || (!hasJHS && !hasSHS && offerings.length === 0)) {
      grades.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6');
    }
    if (hasJHS) {
      grades.push('Grade 7', 'Grade 8', 'Grade 9', 'Grade 10');
    }
    if (hasSHS) {
      grades.push('Grade 11', 'Grade 12');
    }
    return grades.length > 0 ? grades : DESIGNATION_GRADE_LEVELS;
  }, [schoolInfo]);

  // Helper to read current active parameters for a card
  const getParams = (desigId) => {
    return cardParams[desigId] || {};
  };

  // Helper to update card parameters
  const handleParamChange = (desigId, paramKey, value) => {
    setCardParams(prev => ({
      ...prev,
      [desigId]: {
        ...(prev[desigId] || {}),
        [paramKey]: value
      }
    }));
    // Clear any previous constraint error for this card
    setConstraintErrors(prev => ({ ...prev, [desigId]: null }));
  };

  // Helper to compute serialized designation key for a designation & its active params
  const getSerializedKey = (desig) => {
    const params = getParams(desig.id);
    if (desig.id === 'grade_level_chairperson') {
      return `GRADE LEVEL CHAIRPERSON - ${params.grade}`;
    }
    if (desig.id === 'learning_area_chairperson') {
      return `LEARNING AREA CHAIRPERSON - ${params.learningArea || 'Filipino'}`;
    }
    if (desig.id === 'department_head_ecp') {
      const grade = params.grade;
      if (['Kinder', 'Grade 1', 'Grade 2', 'Grade 3'].includes(grade)) {
        return `DEPARTMENT HEAD - ${grade}`;
      } else if (['Grade 11', 'Grade 12'].includes(grade)) {
        return `DEPARTMENT HEAD - ${grade} - ${params.track || 'ACADEMIC'}`;
      } else {
        return `DEPARTMENT HEAD - ${grade} - ${params.learningArea || 'English'}`;
      }
    }
    return desig.name;
  };

  // Check if a person is assigned to targetKey (matching with or without ::APPROVED_SDS suffix)
  const isAssignedToKey = (personDesignation, targetKey) => {
    if (!personDesignation || !targetKey) return false;
    const cleanPerson = String(personDesignation).replace('::APPROVED_SDS', '').trim().toUpperCase();
    const cleanTarget = String(targetKey).replace('::APPROVED_SDS', '').trim().toUpperCase();
    return cleanPerson === cleanTarget;
  };

  // Check constraint limits
  const checkConstraint = (desig, targetKey, activeAssigned) => {
    if (desig.id === 'department_head_ecp') {
      if (activeAssigned.length >= 1) {
        const subName = targetKey.replace('DEPARTMENT HEAD - ', '').replace('::APPROVED_SDS', '');
        return `Constraint Violation: Only 1 Department Head is allowed for ${subName} based on ECP rules. Unassign the current leader first.`;
      }
    }
    return null;
  };

  // Assign personnel directly to a target key
  const handleAssignDirectKey = async (targetKey, selectedPersonId, isSdsApproved = false) => {
    if (!selectedPersonId) return;

    let fullKey = targetKey;
    if (isSdsApproved && !fullKey.endsWith('::APPROVED_SDS')) {
      fullKey = `${fullKey}::APPROVED_SDS`;
    }

    const person = activePersonnel.find(p => p.id === selectedPersonId);
    if (!person) return;

    const updatedPerson = { ...person, designation: fullKey };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(`✓ Assigned ${person.firstName} ${person.lastName} as ${targetKey}`, 'success');
  };

  // Assign personnel to a serialized designation key (with optional SDS approval)
  const handleAddPersonnel = async (desig, selectedPersonId, isSdsApproved = false) => {
    if (!selectedPersonId) return;

    let targetKey = getSerializedKey(desig);
    if (isSdsApproved && !targetKey.endsWith('::APPROVED_SDS')) {
      targetKey = `${targetKey}::APPROVED_SDS`;
    }

    const assignedForSubKey = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));

    const violation = checkConstraint(desig, targetKey, assignedForSubKey);
    if (violation) {
      setConstraintErrors(prev => ({ ...prev, [desig.id]: violation }));
      return;
    }

    setConstraintErrors(prev => ({ ...prev, [desig.id]: null }));
    await handleAssignDirectKey(targetKey, selectedPersonId, isSdsApproved);
  };

  // Toggle SDS Approval on an assigned person
  const handleToggleSdsApproval = async (personId, isApproved) => {
    const person = activePersonnel.find(p => p.id === personId);
    if (!person || !person.designation) return;

    let baseKey = person.designation.replace('::APPROVED_SDS', '').trim();
    const newDesignation = isApproved ? `${baseKey}::APPROVED_SDS` : baseKey;

    const updatedPerson = { ...person, designation: newDesignation };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(isApproved ? `✓ SDS Approval marked for ${person.firstName} ${person.lastName}` : `SDS Approval removed for ${person.firstName} ${person.lastName}`, 'info');
  };

  // Unassign personnel from designation
  const handleRemovePersonnel = async (personId, desigName) => {
    const person = activePersonnel.find(p => p.id === personId);
    if (!person) return;

    const updatedPerson = { ...person, designation: '' };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(`Unassigned ${person.firstName} ${person.lastName} from ${desigName}`, 'info');
  };

  const filteredDesignations = (OFFICIAL_DESIGNATIONS || []).filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section id="designations" className="view grid">
      <PortalHeader
        title="Official School Designations"
        description="Assign official school designations, SDS approval status, and manage required DepEd school roles."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={() => {
          if (completeNode) completeNode('designation', 'validation');
          setActiveView('validation');
        }}
        continueText="Save & Continue to Validation"
      />
      <article className="card">
        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiTag size={20} /> School Designation Management
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Assign official school designations, SDS approval status, and manage required DepEd school roles.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Card vs Matrix View Toggle */}
              <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: '10px', overflow: 'hidden', background: '#F8FAFC' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: viewMode === 'card' ? '#0284C7' : 'transparent',
                    color: viewMode === 'card' ? 'white' : '#475569',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FiGrid size={13} /> Card View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('matrix')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: viewMode === 'matrix' ? '#0284C7' : 'transparent',
                    color: viewMode === 'matrix' ? 'white' : '#475569',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FiList size={13} /> Matrix View
                </button>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '240px' }}>
                <input
                  type="text"
                  placeholder="Search designation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--line)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px' }} />
              </div>
            </div>
          </div>

          {/* MANDATORY DESIGNATIONS STATUS BANNER */}
          {(() => {
            const reqList = [
              { id: 'guidance_designate', name: 'Guidance Designate', key: 'GUIDANCE DESIGNATE', icon: <FiShield size={14} />, isRequired: true },
              { id: 'learner_information_officer', name: 'Learner Information Officer', key: 'LEARNER INFORMATION OFFICER', altKey: 'LEARNER FORMATION OFFICER', icon: <FiFileText size={14} />, isRequired: true },
              { id: 'department_head_designate', name: 'Department Head Designate', key: 'DEPARTMENT HEAD DESIGNATE', icon: <FiFolder size={14} />, isRequired: true }
            ];

            if (isAshRequired) {
              reqList.push({
                id: 'assistant_school_head_designate',
                name: 'Assistant School Head Designate',
                key: 'ASSISTANT SCHOOL HEAD DESIGNATE',
                icon: <FiUsers size={14} />,
                isRequired: true
              });
            } else {
              reqList.push({
                id: 'assistant_school_head_designate',
                name: 'Assistant School Head Designate',
                key: 'ASSISTANT SCHOOL HEAD DESIGNATE',
                icon: <FiUsers size={14} />,
                isRequired: false
              });
            }

            const statusList = reqList.map(r => {
              const assigned = activePersonnel.filter(p => {
                const clean = String(p.designation || '').replace('::APPROVED_SDS', '').trim().toUpperCase();
                return clean === r.key || (r.altKey && clean === r.altKey);
              });
              return { ...r, assigned, count: assigned.length };
            });

            const requiredRoles = statusList.filter(s => s.isRequired);
            const allAssigned = requiredRoles.every(s => s.count > 0);
            const assignedCount = requiredRoles.filter(s => s.count > 0).length;
            const totalRequiredCount = requiredRoles.length;

            return (
              <div style={{
                background: allAssigned ? '#F0FDF4' : '#FEF2F2',
                border: allAssigned ? '1.5px solid #86EFAC' : '1.5px solid #FCA5A5',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '22px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {allAssigned ? <FiCheckCircle size={20} color="#15803D" /> : <FiAlertCircle size={20} color="#991B1B" />}
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: allAssigned ? '#15803D' : '#991B1B' }}>
                        Mandatory DepEd Designations ({assignedCount}/{totalRequiredCount} Assigned)
                      </h4>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: allAssigned ? '#166534' : '#B91C1C' }}>
                        {isAshRequired
                          ? (allAssigned 
                              ? `All 4 mandatory designations assigned (School regular enrollment: ${regularEnrollment} learners).`
                              : `4 official roles are mandatory for schools with 1,001+ regular learners (Current enrollment: ${regularEnrollment}).`)
                          : (allAssigned
                              ? `All 3 mandatory designations assigned. Assistant School Head is optional (School regular enrollment: ${regularEnrollment} <= 1,000).`
                              : `3 official roles are mandatory for validation (Guidance, LIO, Department Head). Assistant School Head is optional (School regular enrollment: ${regularEnrollment} <= 1,000).`)}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    background: allAssigned ? '#DCFCE7' : '#FEE2E2',
                    color: allAssigned ? '#166534' : '#991B1B',
                    fontWeight: '800',
                    fontSize: '11px'
                  }}>
                    {allAssigned ? 'FULLY COMPLIANT' : 'ACTION REQUIRED'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {statusList.map(s => (
                    <div key={s.id} style={{
                      background: '#FFFFFF',
                      border: s.count > 0 ? '1px solid #BBF7D0' : (s.isRequired ? '1px solid #FECACA' : '1px solid #E2E8F0'),
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{s.icon}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: s.count > 0 ? '#15803D' : (s.isRequired ? '#DC2626' : '#64748B'), fontWeight: '600', marginTop: '2px' }}>
                          {s.count > 0 
                            ? `${s.assigned[0].firstName} ${s.assigned[0].lastName}`
                            : (s.isRequired ? 'Vacant (Required)' : 'Vacant (Optional)')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* VIEW MODE 1: CARD VIEW */}
          {viewMode === 'card' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '18px' }}>
              {filteredDesignations.map((desig) => {
                const targetKey = getSerializedKey(desig);
                const params = getParams(desig.id);

                const assignedPersonnel = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));
                const availablePersonnel = activePersonnel.filter(p => !isAssignedToKey(p.designation, targetKey));

                const isDepartmentHead = desig.id === 'department_head_ecp';
                const isGrade4to10 = isDepartmentHead && ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].includes(params.grade);
                const isSHS = isDepartmentHead && ['Grade 11', 'Grade 12'].includes(params.grade);

                const constraintError = constraintErrors[desig.id];
                const isRequired = desig.id === 'assistant_school_head_designate' ? isAshRequired : Boolean(desig.isRequired);

                // Total assignments count across all offered grades for parameterized designations
                const totalAssignedForDesig = activePersonnel.filter(p => {
                  const clean = String(p.designation || '').replace('::APPROVED_SDS', '').trim().toUpperCase();
                  if (desig.id === 'grade_level_chairperson') return clean.startsWith('GRADE LEVEL CHAIRPERSON -');
                  if (desig.id === 'learning_area_chairperson') return clean.startsWith('LEARNING AREA CHAIRPERSON -');
                  if (desig.id === 'department_head_ecp') return clean.startsWith('DEPARTMENT HEAD -');
                  return clean === desig.name;
                }).length;

                return (
                  <div
                    key={desig.id}
                    style={{
                      background: '#FFFFFF',
                      border: (desig.parameterized ? totalAssignedForDesig > 0 : assignedPersonnel.length > 0)
                        ? '1.5px solid #0284C7' 
                        : isRequired 
                          ? '1.5px solid #FCA5A5' 
                          : '1.5px solid var(--line)',
                      borderRadius: '14px',
                      padding: '20px',
                      boxShadow: (desig.parameterized ? totalAssignedForDesig > 0 : assignedPersonnel.length > 0) ? '0 4px 14px rgba(2, 132, 199, 0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gridColumn: desig.id === 'grade_level_chairperson' || desig.id === 'learning_area_chairperson' || desig.id === 'department_head_ecp' ? '1 / -1' : 'auto'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                            {desig.name}
                          </h3>
                          {isRequired ? (
                            <span style={{ padding: '2px 6px', borderRadius: '6px', background: '#FEF2F2', color: '#DC2626', fontSize: '10px', fontWeight: '800', border: '1px solid #FCA5A5' }}>
                              * REQUIRED
                            </span>
                          ) : (
                            <span style={{ padding: '2px 6px', borderRadius: '6px', background: '#F8FAFC', color: '#64748B', fontSize: '10px', fontWeight: '700', border: '1px solid #CBD5E1' }}>
                              OPTIONAL
                            </span>
                          )}
                        </div>
                        {desig.parameterized ? (
                          <span style={{ padding: '3px 10px', borderRadius: '999px', background: totalAssignedForDesig > 0 ? '#EFF6FF' : '#F8FAFC', color: totalAssignedForDesig > 0 ? '#0284C7' : '#94A3B8', fontSize: '11px', fontWeight: '800', border: totalAssignedForDesig > 0 ? '1px solid #BAE6FD' : '1px solid #E2E8F0' }}>
                            {totalAssignedForDesig} Total Assigned
                          </span>
                        ) : assignedPersonnel.length > 0 ? (
                          <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#EFF6FF', color: '#0284C7', fontSize: '11px', fontWeight: '800', border: '1px solid #BAE6FD' }}>
                            {assignedPersonnel.length} Assigned
                          </span>
                        ) : isRequired ? (
                          <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: '800', border: '1px solid #FCA5A5' }}>
                            Vacant (Required)
                          </span>
                        ) : (
                          <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#F8FAFC', color: '#94A3B8', fontSize: '11px', fontWeight: '700', border: '1px solid #E2E8F0' }}>
                            0 Assigned
                          </span>
                        )}
                      </div>

                      <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B', lineHeight: '1.5' }}>
                        {desig.description}
                      </p>

                      {/* SPECIAL VIEW 1: GRADE LEVEL CHAIRPERSON QUICK-ASSIGN ROSTER */}
                      {desig.id === 'grade_level_chairperson' ? (
                        <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Quick-Assign per Offered Grade Level ({offeredGradeLevels.length} Grades in School)</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px' }}>
                            {offeredGradeLevels.map(grade => {
                              const gradeKey = `GRADE LEVEL CHAIRPERSON - ${grade}`;
                              const assignedToGrade = activePersonnel.filter(p => isAssignedToKey(p.designation, gradeKey));
                              const availableForGrade = activePersonnel.filter(p => !isAssignedToKey(p.designation, gradeKey));

                              return (
                                <div key={grade} style={{ background: '#FFFFFF', border: assignedToGrade.length > 0 ? '1.5px solid #BAE6FD' : '1px dashed #CBD5E1', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '800', fontSize: '12px', color: '#0F172A', background: '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>
                                      {grade}
                                    </span>
                                    {assignedToGrade.length > 0 ? (
                                      <span style={{ fontSize: '10px', fontWeight: '800', color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><FiCheck size={11} /> ASSIGNED</span>
                                    ) : (
                                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8' }}>Vacant</span>
                                    )}
                                  </div>

                                  <div>
                                    {assignedToGrade.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#EFF6FF', padding: '8px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div style={{ fontSize: '12px', fontWeight: '800', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <FiUser size={12} /> {assignedToGrade[0].firstName} {assignedToGrade[0].lastName}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleRemovePersonnel(assignedToGrade[0].id, gradeKey)}
                                            style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
                                          >
                                            Remove ✕
                                          </button>
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#64748B' }}>{assignedToGrade[0].position || 'Teacher'}</div>
                                        <div style={{ borderTop: '1px dashed #BFDBFE', paddingTop: '4px', marginTop: '2px' }}>
                                          <SdsToggle
                                            checked={(assignedToGrade[0].designation || '').includes('::APPROVED_SDS')}
                                            onChange={(val) => handleToggleSdsApproval(assignedToGrade[0].id, val)}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <SearchableDropdown
                                        options={availableForGrade.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                                        value=""
                                        onChange={(val) => {
                                          const person = availableForGrade.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                                          if (person) handleAssignDirectKey(gradeKey, person.id, false);
                                        }}
                                        placeholder={`Select Chairperson for ${grade}...`}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : desig.id === 'learning_area_chairperson' ? (
                        /* SPECIAL VIEW 2: LEARNING AREA CHAIRPERSON QUICK-ASSIGN */
                        <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Primary Learning Area Subject Leaders ({PRIMARY_LEARNING_AREAS.length} Primary Learning Areas)</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px' }}>
                            {PRIMARY_LEARNING_AREAS.map(sub => {
                              const subKey = `LEARNING AREA CHAIRPERSON - ${sub}`;
                              const assignedForSub = activePersonnel.filter(p => isAssignedToKey(p.designation, subKey));
                              const availableForSub = activePersonnel.filter(p => !isAssignedToKey(p.designation, subKey));

                              return (
                                <div key={sub} style={{ background: '#FFFFFF', border: assignedForSub.length > 0 ? '1.5px solid #BAE6FD' : '1px dashed #CBD5E1', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '800', fontSize: '12px', color: '#0F172A' }}>
                                      {sub}
                                    </span>
                                    {assignedForSub.length > 0 ? (
                                      <span style={{ fontSize: '10px', fontWeight: '800', color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><FiCheck size={11} /> ASSIGNED</span>
                                    ) : (
                                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8' }}>Vacant</span>
                                    )}
                                  </div>

                                  <div>
                                    {assignedForSub.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#EFF6FF', padding: '6px 8px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div style={{ fontSize: '12px', fontWeight: '800', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <FiUser size={12} /> {assignedForSub[0].firstName} {assignedForSub[0].lastName}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleRemovePersonnel(assignedForSub[0].id, subKey)}
                                            style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                        <SdsToggle
                                          checked={(assignedForSub[0].designation || '').includes('::APPROVED_SDS')}
                                          onChange={(val) => handleToggleSdsApproval(assignedForSub[0].id, val)}
                                        />
                                      </div>
                                    ) : (
                                      <SearchableDropdown
                                        options={availableForSub.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                                        value=""
                                        onChange={(val) => {
                                          const person = availableForSub.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                                          if (person) handleAssignDirectKey(subKey, person.id, false);
                                        }}
                                        placeholder={`Assign ${sub} Chairperson...`}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : desig.id === 'department_head_ecp' ? (
                        /* SPECIAL VIEW 3: DEPARTMENT HEAD (BASED ON ECP) */
                        <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Select Department Cluster ({offeredGradeLevels.length} Offered Grades in School):
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            {offeredGradeLevels.map(g => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => handleParamChange(desig.id, 'grade', g)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  border: params.grade === g ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                                  background: params.grade === g ? '#0284C7' : '#FFFFFF',
                                  color: params.grade === g ? '#FFFFFF' : '#475569',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  cursor: 'pointer'
                                }}
                              >
                                {g}
                              </button>
                            ))}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#E0F2FE', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', color: '#0369A1', fontWeight: '700' }}>
                              <span>Target Department: <code>{targetKey}</code></span>
                              <span>Constraint Limit: Max 1 Head</span>
                            </div>

                            {constraintError && (
                              <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#991B1B', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiAlertCircle size={14} /> {constraintError}
                              </div>
                            )}

                            <div>
                              {assignedPersonnel.length > 0 ? (
                                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px 12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <FiUser size={13} /> {assignedPersonnel[0].firstName} {assignedPersonnel[0].lastName}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{assignedPersonnel[0].position || 'Teacher'}</div>
                                    <div style={{ marginTop: '4px' }}>
                                      <SdsToggle
                                        checked={(assignedPersonnel[0].designation || '').includes('::APPROVED_SDS')}
                                        onChange={(val) => handleToggleSdsApproval(assignedPersonnel[0].id, val)}
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePersonnel(assignedPersonnel[0].id, targetKey)}
                                    style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                                  >
                                    Remove ✕
                                  </button>
                                </div>
                              ) : (
                                <SearchableDropdown
                                  options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                                  value=""
                                  onChange={(val) => {
                                    const person = availablePersonnel.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                                    if (person) handleAddPersonnel(desig, person.id, false);
                                  }}
                                  placeholder={`Assign Department Head for ${params.grade}...`}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* STANDARD CARD RENDERING FOR REGULAR DESIGNATIONS */
                        <>
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', marginBottom: '8px' }}>
                              ASSIGNED PERSONNEL ({assignedPersonnel.length})
                            </label>

                            {assignedPersonnel.length === 0 ? (
                              <div style={{ padding: '10px 12px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>
                                No personnel assigned to {targetKey} yet.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {assignedPersonnel.map(person => {
                                  const isSdsApproved = (person.designation || '').includes('::APPROVED_SDS');

                                  return (
                                    <div key={person.id} style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0284C7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '12px' }}>
                                          {`${(person.firstName || '')[0] || ''}${(person.lastName || '')[0] || ''}`.toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)' }}>
                                            {person.firstName} {person.lastName}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#64748B' }}>{person.position || 'Teacher'}</div>
                                        </div>
                                        <button type="button" onClick={() => handleRemovePersonnel(person.id, targetKey)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                                          Remove ✕
                                        </button>
                                      </div>

                                      {/* SDS Approval Toggle */}
                                      <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <SdsToggle
                                          checked={isSdsApproved}
                                          onChange={(val) => handleToggleSdsApproval(person.id, val)}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div style={{ marginTop: 'auto' }}>
                            <SearchableDropdown
                              options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                              value=""
                              onChange={(val) => {
                                const person = availablePersonnel.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                                if (person) handleAddPersonnel(desig, person.id, false);
                              }}
                              placeholder={`Assign teacher to ${desig.name}...`}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: MATRIX VIEW */}
          {viewMode === 'matrix' && (
            <div style={{ overflowX: 'auto', border: '1.5px solid var(--line)', borderRadius: '14px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid var(--line)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)' }}>Designation Category / Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)', width: '320px' }}>Assigned Personnel & SDS Approval</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)' }}>Sub-Options (Grade / Subject / Track)</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)', minWidth: '220px' }}>Add Personnel</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDesignations.map((desig, idx) => {
                    const targetKey = getSerializedKey(desig);
                    const params = getParams(desig.id);

                    const assignedPersonnel = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));
                    const availablePersonnel = activePersonnel.filter(p => !isAssignedToKey(p.designation, targetKey));

                    const isDepartmentHead = desig.id === 'department_head_ecp';
                    const isGrade4to10 = isDepartmentHead && ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].includes(params.grade);
                    const isSHS = isDepartmentHead && ['Grade 11', 'Grade 12'].includes(params.grade);

                    return (
                      <tr key={desig.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: '800', color: 'var(--navy)', fontSize: '13px' }}>{desig.name}</span>
                            {desig.isRequired && (
                              <span style={{ padding: '1px 5px', borderRadius: '4px', background: '#FEF2F2', color: '#DC2626', fontSize: '9px', fontWeight: '800', border: '1px solid #FCA5A5' }}>
                                * REQUIRED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{desig.description}</div>
                          <code style={{ display: 'inline-block', background: '#E0F2FE', padding: '2px 6px', borderRadius: '4px', color: '#0369A1', fontSize: '10px', marginTop: '6px' }}>
                            {targetKey}
                          </code>
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {assignedPersonnel.length === 0 ? (
                            desig.isRequired ? (
                              <span style={{ padding: '3px 8px', borderRadius: '999px', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: '800', border: '1px solid #FCA5A5' }}>
                                Vacant (Required)
                              </span>
                            ) : (
                              <span style={{ padding: '3px 8px', borderRadius: '999px', background: '#F8FAFC', color: '#94A3B8', fontSize: '11px', fontWeight: '700', border: '1px solid #CBD5E1' }}>
                                Vacant
                              </span>
                            )
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {assignedPersonnel.map(person => {
                                const isSdsApproved = (person.designation || '').includes('::APPROVED_SDS');

                                return (
                                  <div key={person.id} style={{ background: '#EFF6FF', border: '1px solid #BAE6FD', padding: '8px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: '800', color: '#0369A1', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <FiUser size={12} /> {person.firstName} {person.lastName}
                                      </span>
                                      <button type="button" onClick={() => handleRemovePersonnel(person.id, targetKey)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>
                                        ✕
                                      </button>
                                    </div>
                                    <div style={{ marginTop: '6px' }}>
                                      <SdsToggle
                                        checked={isSdsApproved}
                                        onChange={(val) => handleToggleSdsApproval(person.id, val)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {desig.parameterized ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div>
                                <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', display: 'block' }}>Grade Level</label>
                                <select value={params.grade} onChange={(e) => handleParamChange(desig.id, 'grade', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #7DD3FC', fontSize: '12px' }}>
                                  {offeredGradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                              {isGrade4to10 && (
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', display: 'block' }}>Learning Area</label>
                                  <select value={params.learningArea} onChange={(e) => handleParamChange(desig.id, 'learningArea', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #7DD3FC', fontSize: '12px' }}>
                                    {activeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              )}
                              {isSHS && (
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', display: 'block' }}>Track</label>
                                  <select value={params.track} onChange={(e) => handleParamChange(desig.id, 'track', e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #7DD3FC', fontSize: '12px' }}>
                                    {SHS_TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94A3B8' }}>N/A (Standard Role)</span>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <SearchableDropdown
                            options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                            value=""
                            onChange={(val) => {
                              const p = availablePersonnel.find(person => `${person.firstName} ${person.lastName} (${person.position || 'Teacher'})` === val);
                              if (p) handleAddPersonnel(desig, p.id);
                            }}
                            placeholder="+ Add personnel..."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
