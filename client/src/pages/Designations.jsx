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
import {
  FiCheckCircle,
  FiAlertCircle,
  FiCheck,
  FiShield,
  FiFileText,
  FiFolder,
  FiUsers,
  FiUser,
  FiSearch,
  FiTag,
  FiBook,
  FiGrid,
  FiList,
  FiTrash2,
  FiX,
  FiPlus,
  FiBookmark,
  FiAward,
  FiLayers
} from 'react-icons/fi';

function SdsToggle({ checked, onChange }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '9px',
        background: checked
          ? (isHovered ? '#DCFCE7' : '#F0FDF4')
          : (isHovered ? '#F1F5F9' : '#FFFFFF'),
        border: checked
          ? (isHovered ? '1.5px solid #16A34A' : '1.5px solid #86EFAC')
          : (isHovered ? '1.5px solid #0284C7' : '1.5px solid #CBD5E1'),
        borderRadius: '10px',
        padding: '5px 10px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none',
        boxShadow: isHovered ? '0 2px 6px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
        outline: 'none'
      }}
      title={checked ? 'Division Superintendent (SDS) approval is ON. Click to turn OFF.' : 'Click to mark as Officially Approved by SDS.'}
    >
      {/* Switch Track and Knob */}
      <div
        style={{
          width: '34px',
          height: '20px',
          borderRadius: '999px',
          background: checked ? '#16A34A' : '#CBD5E1',
          position: 'relative',
          transition: 'background 0.2s ease',
          flexShrink: 0
        }}
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#FFFFFF',
            position: 'absolute',
            top: '2px',
            left: checked ? '16px' : '2px',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {checked && <FiCheck size={11} color="#16A34A" strokeWidth={3} />}
        </div>
      </div>

      <span style={{
        fontSize: '11px',
        fontWeight: '800',
        color: checked ? '#15803D' : '#64748B',
        letterSpacing: '0.3px'
      }}>
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

  // Check if a person is assigned to targetKey (matching with or without ::APPROVED_SDS suffix)
  const isAssignedToKey = (personDesignation, targetKey) => {
    if (!personDesignation || !targetKey) return false;
    const cleanPerson = String(personDesignation).replace('::APPROVED_SDS', '').trim().toUpperCase();
    const cleanTarget = String(targetKey).replace('::APPROVED_SDS', '').trim().toUpperCase();
    return cleanPerson === cleanTarget;
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

    const updatedPerson = {
      ...person,
      designation: '',
      designations: Array.isArray(person.designations)
        ? person.designations.filter(d => !isAssignedToKey(d, desigName))
        : []
    };
    localStorage.setItem(`draft_personnel_${person.id}`, JSON.stringify(updatedPerson));

    if (savePersonnelChanges) {
      await savePersonnelChanges(person.id, updatedPerson);
    } else {
      setPersonnel(prev => prev.map(p => p.id === person.id ? updatedPerson : p));
    }

    showToast(`Unassigned ${person.firstName} ${person.lastName} from ${desigName}`, 'info');
  };

  // DEFINITION OF MANDATORY ROLES (Pre-loaded at top of Option A)
  const mandatoryRoles = useMemo(() => {
    const list = [
      {
        id: 'guidance_designate',
        name: 'Guidance Designate',
        canonicalKey: 'GUIDANCE DESIGNATE',
        altKeys: ['GUIDANCE DESIGNATE'],
        icon: <FiShield size={20} color="#0284C7" />,
        badgeColor: '#0284C7',
        description: 'Handles student guidance, counseling, child protection policy, and student welfare support.',
        isRequired: true
      },
      {
        id: 'learner_information_officer',
        name: 'Learner Information Officer',
        canonicalKey: 'LEARNER INFORMATION OFFICER',
        altKeys: ['LEARNER INFORMATION OFFICER', 'LEARNER FORMATION OFFICER'],
        icon: <FiFileText size={20} color="#0D9488" />,
        badgeColor: '#0D9488',
        description: 'Oversees learner information, student records, LIS management, and learner support services.',
        isRequired: true
      },
      {
        id: 'department_head_designate',
        name: 'Department Head Designate',
        canonicalKey: 'DEPARTMENT HEAD DESIGNATE',
        altKeys: ['DEPARTMENT HEAD DESIGNATE', 'DEPARTMENT HEAD'],
        icon: <FiFolder size={20} color="#D97706" />,
        badgeColor: '#D97706',
        description: 'Designated Department Head leading subject area faculty management and curriculum implementation.',
        isRequired: true
      }
    ];

    if (isAshRequired) {
      list.push({
        id: 'assistant_school_head_designate',
        name: 'Assistant School Head Designate',
        canonicalKey: 'ASSISTANT SCHOOL HEAD DESIGNATE',
        altKeys: ['ASSISTANT SCHOOL HEAD DESIGNATE', 'ASSISTANT SCHOOL HEAD'],
        icon: <FiUsers size={20} color="#7C3AED" />,
        badgeColor: '#7C3AED',
        description: `Mandatory for schools with regular enrollment of 1,001 or more (Current regular enrollment: ${regularEnrollment} learners). Assists the School Head in school operations.`,
        isRequired: true
      });
    }

    return list;
  }, [isAshRequired, regularEnrollment]);

  // Helper to find who is assigned to each mandatory role
  const getAssignedPersonnelForRole = (role) => {
    return activePersonnel.filter(p => {
      const clean = String(p.designation || '').replace(/::APPROVED_SDS/gi, '').trim().toUpperCase();
      const desigsList = Array.isArray(p.designations)
        ? p.designations.map(d => String(d || '').replace(/::APPROVED_SDS/gi, '').trim().toUpperCase())
        : [];
      return role.altKeys.some(k =>
        clean === k ||
        clean.startsWith(`${k} -`) ||
        clean.startsWith(`${k}:`) ||
        desigsList.some(d => d === k || d.startsWith(`${k} -`) || d.startsWith(`${k}:`))
      );
    });
  };

  // Helper to check if a designation string belongs to a mandatory role
  const isMandatoryDesignationKey = (designationStr) => {
    if (!designationStr) return false;
    const cleanUpper = String(designationStr).replace(/::APPROVED_SDS/gi, '').trim().toUpperCase();
    const mandatoryKeys = [
      'GUIDANCE DESIGNATE',
      'LEARNER INFORMATION OFFICER',
      'LEARNER FORMATION OFFICER',
      'DEPARTMENT HEAD DESIGNATE'
    ];
    if (isAshRequired) {
      mandatoryKeys.push('ASSISTANT SCHOOL HEAD DESIGNATE', 'ASSISTANT SCHOOL HEAD');
    }
    return mandatoryKeys.some(k =>
      cleanUpper === k || cleanUpper.startsWith(`${k} -`) || cleanUpper.startsWith(`${k}:`)
    );
  };

  // ADDITIONAL ASSIGNMENTS (Only roles that have been actively assigned by the school)
  const additionalAssignments = useMemo(() => {
    const list = [];
    activePersonnel.forEach(p => {
      const keysToCheck = [];
      if (p.designation) keysToCheck.push(p.designation);
      if (Array.isArray(p.designations)) {
        p.designations.forEach(d => {
          if (d && !keysToCheck.includes(d)) keysToCheck.push(d);
        });
      }

      keysToCheck.forEach(fullKey => {
        const isApproved = fullKey.includes('::APPROVED_SDS');
        const clean = fullKey.replace(/::APPROVED_SDS/gi, '').trim();

        if (clean && !isMandatoryDesignationKey(clean)) {
          // Parse any parameter tag (e.g., "GRADE LEVEL CHAIRPERSON - Grade 1" -> category + param)
          let category = clean;
          let parameter = null;

          if (clean.includes(' - ')) {
            const parts = clean.split(' - ');
            category = parts[0];
            parameter = parts.slice(1).join(' - ');
          }

          list.push({
            person: p,
            fullKey,
            cleanKey: clean,
            category,
            parameter,
            isSdsApproved: isApproved,
            id: `${p.id}_${clean}`
          });
        }
      });
    });

    return list;
  }, [activePersonnel, isAshRequired]);

  // OPTIONS AVAILABLE IN "+ ADD DESIGNATION" MODAL
  const additionalRoleOptions = useMemo(() => {
    return (OFFICIAL_DESIGNATIONS || []).filter(d => {
      // Exclude permanently mandatory roles (they are always visible in Section 1)
      if (['guidance_designate', 'learner_information_officer', 'department_head_designate'].includes(d.id)) {
        return false;
      }
      // Assistant School Head is mandatory when regular enrollment >= 1001
      if (d.id === 'assistant_school_head_designate' && isAshRequired) {
        return false;
      }
      return true;
    });
  }, [isAshRequired]);

  // ADD DESIGNATION MODAL STATE
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalRoleId, setModalRoleId] = useState('');
  const [modalGrade, setModalGrade] = useState('Grade 1');
  const [modalLearningArea, setModalLearningArea] = useState('Filipino');
  const [modalTrack, setModalTrack] = useState('ACADEMIC');
  const [modalTeacherId, setModalTeacherId] = useState('');
  const [modalIsSds, setModalIsSds] = useState(false);
  const [modalError, setModalError] = useState('');

  const openAddModal = (roleId = null) => {
    const targetRole = (roleId && additionalRoleOptions.some(r => r.id === roleId))
      ? roleId
      : (additionalRoleOptions[0]?.id || '');
    setModalRoleId(targetRole);
    setModalGrade(offeredGradeLevels[0] || 'Grade 1');
    setModalLearningArea(PRIMARY_LEARNING_AREAS[0] || 'Filipino');
    setModalTrack(SHS_TRACKS[0] || 'ACADEMIC');
    setModalTeacherId('');
    setModalIsSds(false);
    setModalError('');
    setIsAddModalOpen(true);
  };

  const handleSaveModalDesignation = async () => {
    if (!modalTeacherId) {
      setModalError('Please select a teacher to assign.');
      return;
    }
    const selectedDesig = additionalRoleOptions.find(d => d.id === modalRoleId);
    if (!selectedDesig) {
      setModalError('Please select a designation role.');
      return;
    }

    let targetKey = selectedDesig.name;
    if (selectedDesig.id === 'grade_level_chairperson') {
      targetKey = `GRADE LEVEL CHAIRPERSON - ${modalGrade}`;
    } else if (selectedDesig.id === 'learning_area_chairperson') {
      targetKey = `LEARNING AREA CHAIRPERSON - ${modalLearningArea}`;
    } else if (selectedDesig.id === 'department_head_ecp') {
      if (['Kinder', 'Grade 1', 'Grade 2', 'Grade 3'].includes(modalGrade)) {
        targetKey = `DEPARTMENT HEAD - ${modalGrade}`;
      } else if (['Grade 11', 'Grade 12'].includes(modalGrade)) {
        targetKey = `DEPARTMENT HEAD - ${modalGrade} - ${modalTrack}`;
      } else {
        targetKey = `DEPARTMENT HEAD - ${modalGrade} - ${modalLearningArea}`;
      }
    }

    // ECP Department Head constraint check: only 1 head per cluster
    if (selectedDesig.id === 'department_head_ecp') {
      const existing = activePersonnel.filter(p => isAssignedToKey(p.designation, targetKey));
      if (existing.length >= 1) {
        setModalError(`Constraint Violation: Only 1 Department Head is allowed for ${targetKey}. Unassign current leader first.`);
        return;
      }
    }

    await handleAssignDirectKey(targetKey, modalTeacherId, modalIsSds);
    setIsAddModalOpen(false);
  };

  // CHECK MISSING REQUIRED DESIGNATIONS FOR WORKLOAD NAVIGATION GATE
  const [missingDesignationsModal, setMissingDesignationsModal] = useState({
    isOpen: false,
    missingList: []
  });

  const getMissingRequiredDesignations = () => {
    const missing = [];
    mandatoryRoles.forEach(req => {
      const assigned = getAssignedPersonnelForRole(req);
      if (assigned.length === 0) {
        missing.push(req);
      }
    });
    return missing;
  };

  const handleContinueToWorkload = () => {
    const missing = getMissingRequiredDesignations();
    if (missing.length > 0) {
      setMissingDesignationsModal({
        isOpen: true,
        missingList: missing
      });
      return;
    }

    if (completeNode) completeNode('designation', 'workload');
    else if (setActiveView) setActiveView('workload');
  };

  // Mandatory compliance calculation
  const totalMandatoryCount = mandatoryRoles.length;
  const assignedMandatoryCount = mandatoryRoles.filter(r => getAssignedPersonnelForRole(r).length > 0).length;
  const isAllMandatoryAssigned = assignedMandatoryCount === totalMandatoryCount;

  // Search filtering
  const filteredMandatoryRoles = mandatoryRoles.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchesName = r.name.toLowerCase().includes(term);
    const matchesDesc = r.description.toLowerCase().includes(term);
    const assigned = getAssignedPersonnelForRole(r);
    const matchesTeacher = assigned.some(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(term));
    return matchesName || matchesDesc || matchesTeacher;
  });

  const filteredAdditionalAssignments = additionalAssignments.filter(a => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchesRole = a.cleanKey.toLowerCase().includes(term);
    const matchesTeacher = `${a.person.firstName} ${a.person.lastName}`.toLowerCase().includes(term);
    return matchesRole || matchesTeacher;
  });

  return (
    <section id="designations" className="view grid">
      <style>{`
        @keyframes pulseGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.75), 0 3px 10px rgba(2, 132, 199, 0.35);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(2, 132, 199, 0), 0 5px 16px rgba(2, 132, 199, 0.5);
            transform: scale(1.02);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(2, 132, 199, 0), 0 3px 10px rgba(2, 132, 199, 0.35);
            transform: scale(1);
          }
        }
        @keyframes beaconBlink {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 8px #38BDF8, 0 0 14px #38BDF8;
          }
          50% {
            opacity: 0.25;
            transform: scale(0.8);
            box-shadow: 0 0 2px #38BDF8;
          }
        }
      `}</style>

      <PortalHeader
        title="Official School Designations"
        description="Assign official faculty roles, school program coordinators, and Division (SDS) approval status."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={handleContinueToWorkload}
        continueText="Save & Continue to Workload ➔"
      />

      <article className="card">
        <div style={{ padding: '24px' }}>
          {/* Top Bar with Header, View Mode Toggle, and Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiTag size={20} /> School Designation Management
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Manage school leadership roles, program coordinators (Reading, ICT, Sports, etc.), and committee chairpersons.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                  placeholder="Search designation or teacher..."
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

          {/* CARD VIEW MODE */}
          {viewMode === 'card' && (
            <div>
              {/* SECTION 1: CORE ROLES */}
              <div style={{ marginBottom: '36px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiShield size={18} color="#0284C7" /> Core School Designations
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
                      Primary school administration and student support roles.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
                  {filteredMandatoryRoles.map(role => {
                    const assignedPersonnel = getAssignedPersonnelForRole(role);
                    const isAssigned = assignedPersonnel.length > 0;
                    const availablePersonnel = activePersonnel.filter(p => !isAssignedToKey(p.designation, role.canonicalKey));

                    return (
                      <div
                        key={role.id}
                        id={`mandatory-slot-${role.id}`}
                        style={{
                          background: '#FFFFFF',
                          border: isAssigned ? '1.5px solid #86EFAC' : '1.5px solid var(--line)',
                          borderRadius: '16px',
                          padding: '20px',
                          boxShadow: isAssigned ? '0 4px 12px rgba(22, 163, 74, 0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative'
                        }}
                      >
                        <div>
                          {/* Card Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: isAssigned ? '#F0FDF4' : '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: isAssigned ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                              }}>
                                {role.icon}
                              </div>
                              <div>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                                  {role.name}
                                </h4>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  background: '#F1F5F9',
                                  color: '#475569',
                                  border: '1px solid #CBD5E1',
                                  display: 'inline-block',
                                  marginTop: '2px'
                                }}>
                                  CORE ROLE
                                </span>
                              </div>
                            </div>

                            <span style={{
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: '800',
                              background: isAssigned ? '#DCFCE7' : '#F1F5F9',
                              color: isAssigned ? '#166534' : '#64748B',
                              border: isAssigned ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              {isAssigned ? <FiCheck size={12} /> : null}
                              {isAssigned ? 'ASSIGNED' : 'VACANT'}
                            </span>
                          </div>

                          <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748B', lineHeight: '1.45' }}>
                            {role.description}
                          </p>

                          {/* Assigned Teacher Box */}
                          {isAssigned ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {assignedPersonnel.map(person => {
                                const isSdsApproved = (person.designation || '').includes('::APPROVED_SDS');
                                const initials = `${(person.firstName || '')[0] || ''}${(person.lastName || '')[0] || ''}`.toUpperCase();

                                return (
                                  <div
                                    key={person.id}
                                    style={{
                                      background: '#F8FAFC',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '12px',
                                      padding: '12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '10px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                        <div style={{
                                          width: '36px',
                                          height: '36px',
                                          borderRadius: '50%',
                                          background: '#0284C7',
                                          color: 'white',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontWeight: '800',
                                          fontSize: '13px',
                                          flexShrink: 0
                                        }}>
                                          {initials}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {person.firstName} {person.lastName}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                                            {person.position || 'Teacher'}
                                          </div>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleRemovePersonnel(person.id, role.canonicalKey)}
                                        style={{
                                          background: '#FEE2E2',
                                          color: '#DC2626',
                                          border: 'none',
                                          borderRadius: '6px',
                                          padding: '5px 9px',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          cursor: 'pointer'
                                        }}
                                        title="Unassign teacher from this role"
                                      >
                                        Remove ✕
                                      </button>
                                    </div>

                                    {/* SDS Toggle */}
                                    <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                      <span style={{ fontSize: '11px', color: '#475569', fontWeight: '700' }}>SDS Endorsement:</span>
                                      <SdsToggle
                                        checked={isSdsApproved}
                                        onChange={(val) => handleToggleSdsApproval(person.id, val)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{
                              background: '#F8FAFC',
                              border: '1.5px dashed #CBD5E1',
                              borderRadius: '12px',
                              padding: '14px',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: '800', color: '#334155', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <FiUser size={14} color="#0284C7" /> Assign Faculty Member
                              </div>
                              <p style={{ margin: '0 0 10px', fontSize: '11px', color: '#64748B' }}>
                                Select an available personnel from the school roster below:
                              </p>
                              <SearchableDropdown
                                options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                                value=""
                                onChange={(val) => {
                                  const p = availablePersonnel.find(person => `${person.firstName} ${person.lastName} (${person.position || 'Teacher'})` === val);
                                  if (p) handleAssignDirectKey(role.canonicalKey, p.id, false);
                                }}
                                placeholder={`Select teacher as ${role.name}...`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: ADDITIONAL SCHOOL DESIGNATIONS (DYNAMIC + GLOWING ADD BUTTON) */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  paddingBottom: '14px',
                  borderBottom: '1.5px solid var(--line)',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiBookmark size={18} color="#0D9488" /> School Coordinators & Committee Chairpersons
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
                      Assign coordinators (Reading, ICT, Sports, Research, SNED, SELG), Grade Level Chairs, or Subject Leaders for your school.
                    </p>
                  </div>

                  {/* GLOWING ADD DESIGNATION BUTTON WITH BLINKING BEACON */}
                  <button
                    type="button"
                    onClick={() => openAddModal()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '9px',
                      padding: '10px 22px',
                      fontSize: '13px',
                      fontWeight: '800',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      animation: 'pulseGlow 2.2s infinite ease-in-out',
                      transition: 'all 0.2s ease',
                      userSelect: 'none'
                    }}
                  >
                    {/* Blinking Beacon Light */}
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#38BDF8',
                      animation: 'beaconBlink 1.4s infinite ease-in-out',
                      display: 'inline-block'
                    }} />
                    <FiPlus size={16} strokeWidth={2.5} />
                    <span>+ Add Designation</span>
                  </button>
                </div>

                {filteredAdditionalAssignments.length === 0 ? (
                  /* High-Engagement Empty State with Quick Chips and Glowing Button */
                  <div style={{
                    background: 'linear-gradient(180deg, #F8FAFC 0%, #F0F9FF 100%)',
                    border: '2px dashed #7DD3FC',
                    borderRadius: '18px',
                    padding: '36px 24px',
                    textAlign: 'center',
                    maxWidth: '720px',
                    margin: '0 auto',
                    boxShadow: '0 4px 16px rgba(2, 132, 199, 0.05)'
                  }}>
                    <div style={{
                      width: '58px',
                      height: '58px',
                      borderRadius: '50%',
                      background: '#E0F2FE',
                      color: '#0284C7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px'
                    }}>
                      <FiLayers size={28} />
                    </div>

                    <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>
                      Add Your School's Program Coordinators & Chairpersons
                    </h4>
                    <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#475569', lineHeight: '1.5', maxWidth: '540px', marginLeft: 'auto', marginRight: 'auto' }}>
                      Does your school have designated faculty for any of the following roles? Click a quick-role below or click the Add button:
                    </p>

                    {/* Quick-Pick Role Chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '22px' }}>
                      {[
                        { id: 'reading_literacy_numeracy', label: '📖 Reading / Literacy Coordinator' },
                        { id: 'ict_coordinator', label: '💻 ICT School Coordinator' },
                        { id: 'grade_level_chairperson', label: '👥 Grade Level Chairperson' },
                        { id: 'learning_area_chairperson', label: '📚 Learning Area Chairperson' },
                        { id: 'sports_development_adviser', label: '🏆 Sports Programs Adviser' },
                        { id: 'research_coordinator', label: '🔬 Research Coordinator' },
                        { id: 'sned_coordinator', label: '🧩 SNED Coordinator' },
                        { id: 'selg_sslg_adviser', label: '🏛️ SELG / SSLG Adviser' }
                      ].map(chip => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => openAddModal(chip.id)}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #BAE6FD',
                            color: '#0369A1',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#E0F2FE';
                            e.currentTarget.style.borderColor = '#0284C7';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#FFFFFF';
                            e.currentTarget.style.borderColor = '#BAE6FD';
                          }}
                        >
                          <FiPlus size={11} color="#0284C7" />
                          <span>{chip.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Central Glowing Button */}
                    <button
                      type="button"
                      onClick={() => openAddModal()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 28px',
                        fontSize: '14px',
                        fontWeight: '800',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                        color: '#FFFFFF',
                        cursor: 'pointer',
                        animation: 'pulseGlow 2.2s infinite ease-in-out',
                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
                      }}
                    >
                      <span style={{
                        width: '9px',
                        height: '9px',
                        borderRadius: '50%',
                        background: '#38BDF8',
                        animation: 'beaconBlink 1.4s infinite ease-in-out',
                        display: 'inline-block'
                      }} />
                      <FiPlus size={18} strokeWidth={2.5} />
                      <span>+ Add School Designation</span>
                    </button>
                  </div>
                ) : (
                  /* Active Additional Designation Cards Grid */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                    {filteredAdditionalAssignments.map(item => {
                      const initials = `${(item.person.firstName || '')[0] || ''}${(item.person.lastName || '')[0] || ''}`.toUpperCase();

                      return (
                        <div
                          key={item.id}
                          style={{
                            background: '#FFFFFF',
                            border: '1.5px solid #BAE6FD',
                            borderRadius: '14px',
                            padding: '16px',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.06)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}
                        >
                          <div>
                            {/* Role Badge and Parameter Pill */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                              <div>
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  color: '#0369A1',
                                  background: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  marginBottom: '4px'
                                }}>
                                  {item.category}
                                </span>
                                {item.parameter && (
                                  <span style={{
                                    display: 'inline-block',
                                    marginLeft: '6px',
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    color: '#0F766E',
                                    background: '#F0FDFA',
                                    border: '1px solid #99F6E4',
                                    borderRadius: '6px',
                                    padding: '3px 8px'
                                  }}>
                                    {item.parameter}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemovePersonnel(item.person.id, item.cleanKey)}
                                style={{
                                  background: '#FEE2E2',
                                  color: '#DC2626',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                                title="Remove designation"
                              >
                                Remove ✕
                              </button>
                            </div>

                            {/* Personnel Details */}
                            <div style={{
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              borderRadius: '10px',
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              marginTop: '6px'
                            }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: '#0D9488',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '800',
                                fontSize: '12px',
                                flexShrink: 0
                              }}>
                                {initials}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.person.firstName} {item.person.lastName}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748B' }}>
                                  {item.person.position || 'Teacher'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* SDS Approval Toggle */}
                          <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#475569', fontWeight: '700' }}>SDS Endorsement:</span>
                            <SdsToggle
                              checked={item.isSdsApproved}
                              onChange={(val) => handleToggleSdsApproval(item.person.id, val)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MATRIX VIEW MODE */}
          {viewMode === 'matrix' && (
            <div style={{ overflowX: 'auto', border: '1.5px solid var(--line)', borderRadius: '14px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid var(--line)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)' }}>Designation Category / Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)', width: '320px' }}>Assigned Personnel & SDS Approval</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)' }}>Status / Requirement</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', color: 'var(--navy)', minWidth: '220px' }}>Quick Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row group 1: Mandatory Roles */}
                  {mandatoryRoles.map((role, idx) => {
                    const assignedPersonnel = getAssignedPersonnelForRole(role);
                    const isAssigned = assignedPersonnel.length > 0;
                    const availablePersonnel = activePersonnel.filter(p => !isAssignedToKey(p.designation, role.canonicalKey));

                    return (
                      <tr key={role.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '800', color: 'var(--navy)', fontSize: '13px' }}>{role.name}</span>
                            <span style={{ padding: '1px 5px', borderRadius: '4px', background: '#FEF2F2', color: '#DC2626', fontSize: '9px', fontWeight: '800', border: '1px solid #FCA5A5' }}>
                              * REQUIRED
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{role.description}</div>
                          <code style={{ display: 'inline-block', background: '#E0F2FE', padding: '2px 6px', borderRadius: '4px', color: '#0369A1', fontSize: '10px', marginTop: '6px' }}>
                            {role.canonicalKey}
                          </code>
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {isAssigned ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {assignedPersonnel.map(person => {
                                const isSdsApproved = (person.designation || '').includes('::APPROVED_SDS');
                                return (
                                  <div key={person.id} style={{ background: '#EFF6FF', border: '1px solid #BAE6FD', padding: '8px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: '800', color: '#0369A1', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <FiUser size={12} /> {person.firstName} {person.lastName}
                                      </span>
                                      <button type="button" onClick={() => handleRemovePersonnel(person.id, role.canonicalKey)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>
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
                          ) : (
                            <span style={{ padding: '3px 8px', borderRadius: '999px', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: '800', border: '1px solid #FCA5A5' }}>
                              Vacant (Required)
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: isAssigned ? '#15803D' : '#DC2626' }}>
                            {isAssigned ? '✓ Compliant' : '⚠ Action Required'}
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          {!isAssigned && (
                            <SearchableDropdown
                              options={availablePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                              value=""
                              onChange={(val) => {
                                const p = availablePersonnel.find(person => `${person.firstName} ${person.lastName} (${person.position || 'Teacher'})` === val);
                                if (p) handleAssignDirectKey(role.canonicalKey, p.id, false);
                              }}
                              placeholder={`Assign ${role.name}...`}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Row group 2: Additional Active Roles */}
                  {additionalAssignments.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: '800', color: 'var(--navy)', fontSize: '13px' }}>
                          {item.category}
                        </div>
                        {item.parameter && (
                          <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: '800', color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: '4px', padding: '2px 6px', marginTop: '4px' }}>
                            {item.parameter}
                          </span>
                        )}
                        <code style={{ display: 'block', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', color: '#475569', fontSize: '10px', marginTop: '6px', width: 'fit-content' }}>
                          {item.cleanKey}
                        </code>
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '8px', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '800', color: '#1E293B', fontSize: '12px' }}>
                              {item.person.firstName} {item.person.lastName}
                            </span>
                            <button type="button" onClick={() => handleRemovePersonnel(item.person.id, item.cleanKey)} style={{ background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                          <div style={{ marginTop: '6px' }}>
                            <SdsToggle
                              checked={item.isSdsApproved}
                              onChange={(val) => handleToggleSdsApproval(item.person.id, val)}
                            />
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#0369A1' }}>
                          Additional Role
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>Assigned</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </article>

      {/* "+ ADD DESIGNATION" MODAL (OPTION A) */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: '560px',
              width: '100%',
              background: '#ffffff',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              border: '1.5px solid #BAE6FD'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FiPlus size={20} color="white" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>
                    Add School Designation
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.9 }}>
                    Select a coordinator or teacher leader role to add to your school.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.8
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {modalError && (
                <div style={{
                  padding: '10px 14px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '10px',
                  color: '#991B1B',
                  fontSize: '12px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <FiAlertCircle size={16} /> {modalError}
                </div>
              )}

              {/* 1. Designation Role Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>
                  1. Select Designation Role *
                </label>
                <select
                  value={modalRoleId}
                  onChange={(e) => {
                    setModalRoleId(e.target.value);
                    setModalError('');
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: '600',
                    outline: 'none',
                    background: '#FFFFFF'
                  }}
                >
                  {additionalRoleOptions.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Dynamic Parameters (Grade, Learning Area, Track) */}
              {modalRoleId === 'grade_level_chairperson' && (
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#0369A1', marginBottom: '6px' }}>
                    Select Grade Level *
                  </label>
                  <select
                    value={modalGrade}
                    onChange={(e) => setModalGrade(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '12px' }}
                  >
                    {offeredGradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}

              {modalRoleId === 'learning_area_chairperson' && (
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#0369A1', marginBottom: '6px' }}>
                    Select Learning Area *
                  </label>
                  <select
                    value={modalLearningArea}
                    onChange={(e) => setModalLearningArea(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '12px' }}
                  >
                    {PRIMARY_LEARNING_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}

              {modalRoleId === 'department_head_ecp' && (
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#0369A1', marginBottom: '4px' }}>
                      Select Department Grade Level *
                    </label>
                    <select
                      value={modalGrade}
                      onChange={(e) => setModalGrade(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '12px' }}
                    >
                      {offeredGradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].includes(modalGrade) && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#0369A1', marginBottom: '4px' }}>
                        Select Subject / Learning Area *
                      </label>
                      <select
                        value={modalLearningArea}
                        onChange={(e) => setModalLearningArea(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '12px' }}
                      >
                        {activeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}

                  {['Grade 11', 'Grade 12'].includes(modalGrade) && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#0369A1', marginBottom: '4px' }}>
                        Select Senior High Track *
                      </label>
                      <select
                        value={modalTrack}
                        onChange={(e) => setModalTrack(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #7DD3FC', fontSize: '12px' }}
                      >
                        {SHS_TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Teacher Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>
                  2. Select Teacher from Roster *
                </label>
                <SearchableDropdown
                  options={activePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                  value={
                    modalTeacherId
                      ? (() => {
                          const found = activePersonnel.find(p => p.id === modalTeacherId);
                          return found ? `${found.firstName} ${found.lastName} (${found.position || 'Teacher'})` : '';
                        })()
                      : ''
                  }
                  onChange={(val) => {
                    const found = activePersonnel.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                    setModalTeacherId(found ? found.id : '');
                    setModalError('');
                  }}
                  placeholder="Type or select a teacher..."
                />
              </div>

              {/* 4. Division Endorsement / SDS Toggle */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#1E293B' }}>
                    Schools Division Superintendent (SDS) Endorsement
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    Toggle if this teacher's designation has official Division Office approval.
                  </div>
                </div>
                <SdsToggle
                  checked={modalIsSds}
                  onChange={setModalIsSds}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              background: '#F8FAFC',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="btn secondary"
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalDesignation}
                className="btn primary"
                style={{ padding: '8px 20px', fontSize: '12px', fontWeight: '800' }}
              >
                Assign Designation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY DESIGNATIONS VALIDATION GATE MODAL */}
      {missingDesignationsModal.isOpen && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(5px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000,
            padding: '20px' 
          }}
          onClick={() => setMissingDesignationsModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '620px', 
              width: '100%', 
              background: '#ffffff', 
              borderRadius: '24px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', 
              overflow: 'hidden',
              border: '2px solid #fca5a5',
              animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)',
              padding: '22px 28px',
              borderBottom: '1.5px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: '#fef2f2',
                  border: '2px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0
                }}>
                  <FiAlertCircle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#991b1b' }}>
                    Mandatory School Designations Incomplete
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                    DepEd eSF7 requires all mandatory school roles to be designated before proceeding to Workload.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMissingDesignationsModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#991b1b',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '18px',
                fontSize: '13px',
                color: '#7F1D1D'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '4px' }}>
                  School Regular Enrollment: {regularEnrollment} Learners
                </div>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  {isAshRequired
                    ? 'Schools with 1,001 or more regular learners require 4 mandatory designations (Guidance, LIO, Department Head, and Assistant School Head).'
                    : 'All DepEd schools require at least 3 mandatory designations (Guidance Designate, Learner Information Officer, Department Head Designate).'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {missingDesignationsModal.missingList.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1.5px solid #F87171',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{m.name}</span>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#FEE2E2',
                          color: '#B91C1C'
                        }}>
                          REQUIRED
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
                        {m.description}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                        borderColor: '#DC2626',
                        color: '#DC2626'
                      }}
                      onClick={() => {
                        setMissingDesignationsModal({ isOpen: false, missingList: [] });
                        const el = document.getElementById(`mandatory-slot-${m.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      Assign Now ➔
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 28px',
              background: '#f8fafc',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                type="button"
                className="btn primary"
                style={{ minWidth: '130px', fontWeight: '700' }}
                onClick={() => setMissingDesignationsModal(prev => ({ ...prev, isOpen: false }))}
              >
                Close & Assign Designations
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
