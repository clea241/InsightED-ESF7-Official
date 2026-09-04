import React, { useState, useEffect } from 'react';
import { useApp, POSITION_OPTIONS_BY_CATEGORY, detectPersonnelTypeFromPosition, validateDepEdEmail } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';
import DepEdEmailInfoModal from '../components/DepEdEmailInfoModal';
import ESF7UploadModal from '../components/ESF7UploadModal';
import PortalHeader from '../components/PortalHeader';
import { FiPlus, FiSave, FiTag, FiLink, FiUser, FiTrash2, FiInfo, FiX, FiUploadCloud, FiRefreshCw, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';


export default function Roster() {
  const { personnel, setPersonnel, schoolInfo, addPersonnel, deletePersonnel, toggleSchoolHead, commitDraftPersonnel, setActivePersonnelId, setActiveView, showConfirm, showToast, hasUnsavedChanges, completeNode } = useApp();
  
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'lastName', direction: 'asc' });
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [isEmailInfoOpen, setIsEmailInfoOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [harvestStatus, setHarvestStatus] = useState(null);
  const [isCheckingHarvest, setIsCheckingHarvest] = useState(false);

  // Poll eSF7 Harvester Queue status if roster is empty
  useEffect(() => {
    const rawSchoolId = schoolInfo?.schoolId ? String(schoolInfo.schoolId).replace(/^SCH-/i, '').trim() : '';
    if (!rawSchoolId || personnel.length > 0) return;

    let isMounted = true;
    const checkHarvest = async () => {
      try {
        setIsCheckingHarvest(true);
        const res = await fetch(`/api/esf7-upload/status/${rawSchoolId}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.status && data.status !== 'NOT_FOUND') {
          setHarvestStatus(data);
          // If status completed, trigger personnel reload from backend
          if (data.status === 'VERIFIED') {
            try {
              const pRes = await fetch(`/api/personnel?school_id=${rawSchoolId}`);
              const pData = await pRes.json();
              if (Array.isArray(pData) && pData.length > 0 && isMounted) {
                setPersonnel(pData);
                if (showToast) showToast('Auto-populated faculty roster from harvested eSF7!', 'success');
              }
            } catch (pErr) {
              console.warn('Personnel reload warning:', pErr);
            }
          }
        }
      } catch (err) {
        console.warn('Harvest check warning:', err.message);
      } finally {
        if (isMounted) setIsCheckingHarvest(false);
      }
    };

    checkHarvest();
    const interval = setInterval(checkHarvest, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [schoolInfo?.schoolId, personnel.length]);

  // Add Personnel Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({
    salutation: 'MR.',
    firstName: '',
    middleName: '',
    lastName: '',
    nameExtension: '',
    depedEmailLocal: '',
    type: 'teaching',
    position: POSITION_OPTIONS_BY_CATEGORY.teaching[0]
  });

  // Real-time email validation for Add Personnel modal matching PersonnelProfile
  const addModalEmail = newPerson.depedEmailLocal?.trim()
    ? `${newPerson.depedEmailLocal.toLowerCase().trim()}@deped.gov.ph`
    : '';
  const addModalEmailVal = addModalEmail
    ? validateDepEdEmail(addModalEmail, newPerson.firstName, newPerson.lastName)
    : { isValid: true, error: null };
  const hasAddEmailError = Boolean(addModalEmail && !addModalEmailVal.isValid);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newPerson.firstName || !newPerson.lastName) {
      alert('Please fill out First Name and Last Name');
      return;
    }
    const checkIsHead = (pos, des) => {
      const roleText = `${pos || ""} ${des || ""}`.toLowerCase();
      if (roleText.includes("assistant")) return false;
      return ["school principal", "principal", "teacher-in-charge", "officer-in-charge"].some(token => roleText.includes(token)) ||
        /\b(tic|oic)\b/.test(roleText);
    };

    const isSchoolHeadPos = checkIsHead(newPerson.position, newPerson.designation);
    if (isSchoolHeadPos) {
      const otherHead = personnel.find(p => checkIsHead(p.position, p.designation));
      if (otherHead) {
        const otherName = `${otherHead.firstName} ${otherHead.lastName}`;
        const otherRole = otherHead.position || otherHead.designation;
        alert(`School head conflict: ${otherName} is already assigned as a school head (${otherRole}) for this school. Only one School Head (Principal, OIC, or TIC) is allowed per school.`);
        return;
      }
    }

    const email = newPerson.depedEmailLocal.trim()
      ? `${newPerson.depedEmailLocal.toLowerCase().trim()}@deped.gov.ph`
      : null;

    if (email) {
      const emailVal = validateDepEdEmail(email, newPerson.firstName, newPerson.lastName);
      if (!emailVal.isValid) {
        alert(`Invalid DepEd Email: ${emailVal.error}`);
        return;
      }
    }

    const addedId = await addPersonnel({
      salutation: newPerson.salutation,
      firstName: newPerson.firstName.toUpperCase().trim(),
      middleName: newPerson.middleName ? newPerson.middleName.toUpperCase().trim() : 'N/A',
      lastName: newPerson.lastName.toUpperCase().trim(),
      nameExtension: newPerson.nameExtension ? newPerson.nameExtension.toUpperCase().trim() : '',
      depedEmail: email,
      type: newPerson.type,
      position: newPerson.position
    });

    // Close modal & reset form
    setIsModalOpen(false);
    setNewPerson({
      salutation: 'MR.',
      firstName: '',
      middleName: '',
      lastName: '',
      nameExtension: '',
      depedEmailLocal: '',
      type: 'teaching',
      position: POSITION_OPTIONS_BY_CATEGORY.teaching[0]
    });
    // Go to profiling to fill other details
    setActivePersonnelId(addedId);
    setActiveView('profile');
  };

  // Filter & Search Logic
  const filteredPersonnel = personnel
    .filter(p => {
      const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
      const matchesType = typeFilter === 'all' || pType === typeFilter;
      
      const fullName = `${p.firstName || ''} ${p.middleName || ''} ${p.lastName || ''} ${p.nameExtension || ''}`.toLowerCase();
      const email = (p.depedEmail || '').toLowerCase();
      const pos = (p.position || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch = fullName.includes(query) || email.includes(query) || pos.includes(query);

      return matchesType && matchesSearch;
    })
    .sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      if (typeof aValue === 'boolean') {
        aValue = aValue ? 1 : 0;
        bValue = bValue ? 1 : 0;
      } else {
        aValue = (aValue || '').toString().toLowerCase();
        bValue = (bValue || '').toString().toLowerCase();
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <section id="roster" className="view grid">
      <PortalHeader
        title="Personnel Roster & Profile Directory"
        description="Master roster of all registered school personnel, position items, and status tracking."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={() => completeNode('roster', 'profile')}
        continueText="Save & Continue to Profiling ➔"
      />
      <article className="card">

        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <h2>Personnel Roster</h2>
              <p className="subtext">View and manage all school staff members.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                className="btn secondary" 
                type="button" 
                onClick={() => setIsUploadModalOpen(true)} 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="Upload last year's official eSF7 (.xlsb) to auto-populate faculty"
              >
                <FiUploadCloud size={15} /> <span>Upload eSF7 (.xlsb)</span>
              </button>
              <button className="btn" type="button" onClick={() => setIsModalOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FiPlus size={15} /> <span>Add Personnel</span>
              </button>
            </div>
          </div>

          {(() => {
            const drafts = personnel.filter(p => p.isDraft);
            if (drafts.length === 0) return null;
            return (
              <div style={{
                background: '#FEF3C7',
                border: '1.5px solid #FCD34D',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '15px',
                marginTop: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '15px',
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ color: '#92400E', margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Unsaved Auto-Fill Records Detected</h4>
                  <p style={{ color: '#B45309', margin: '4px 0 0 0', fontSize: '13px' }}>
                    {drafts.length} teacher profile(s) were auto-filled from the master database as drafts. Click <strong>Save Changes</strong> to commit them to the database.
                  </p>
                </div>
                <button 
                  className="btn" 
                  type="button" 
                  disabled={isSavingDrafts}
                  onClick={async () => {
                    setIsSavingDrafts(true);
                    await commitDraftPersonnel();
                    setIsSavingDrafts(false);
                  }}
                  style={{ background: '#D97706', color: 'white', border: 0 }}
                >
                  {isSavingDrafts ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            );
          })()}
          
          <div className="tabs" style={{ margin: '12px 0' }}>
            {['all', 'teaching', 'teaching-related', 'non-teaching'].map((type) => (
              <button
                key={type}
                className={`tab ${typeFilter === type ? 'active' : ''}`}
                onClick={() => setTypeFilter(type)}
                type="button"
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          <div className="roster-search-row">
            <label>Search roster</label>
            <input
              placeholder="Search name, DepEd email, category, or position…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Empty State Hero Card when no faculty records exist */}
          {personnel.length === 0 ? (
            <div style={{
              margin: '24px 0',
              padding: '40px 24px',
              backgroundColor: '#F8FAFC',
              borderRadius: '16px',
              border: '2px dashed #CBD5E1',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)'
              }}>
                <FiUploadCloud size={32} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: '0 0 8px' }}>
                No Faculty Records Found for Your Station
              </h3>
              <p style={{ maxWidth: '580px', color: '#64748B', fontSize: '13px', lineHeight: '1.6', margin: '0 0 20px' }}>
                No historical personnel records were detected for this school. Upload your school's official DepEd eSF7 spreadsheet (.xlsb or .xlsx) from the previous school year to automatically populate your faculty profiles, plantillas, and item numbers.
              </p>

              {/* Ingestion Status Badge */}
              {harvestStatus && (harvestStatus.status === 'QUEUED' || harvestStatus.status === 'HARVESTING') && (
                <div style={{
                  marginBottom: '20px',
                  padding: '10px 18px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#1D4ED8',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  <FiRefreshCw className="spin" size={15} />
                  <span>
                    {harvestStatus.status === 'QUEUED' 
                      ? 'eSF7 spreadsheet queued for background ingestion...' 
                      : 'VM Harvester actively extracting personnel plantillas...'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                  }}
                  onClick={() => setIsUploadModalOpen(true)}
                >
                  <FiUploadCloud size={16} /> Upload Last Year's eSF7 Spreadsheet (.xlsb)
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '10px 18px', fontSize: '13px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setIsModalOpen(true)}
                >
                  <FiPlus size={15} /> Encode Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '70px' }}><button className="roster-sort-button" type="button" onClick={() => handleSort('salutation')}>Desig.</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('firstName')}>First Name</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('middleName')}>Middle Name</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('lastName')}>Last Name</button></th>
                  <th>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <button className="roster-sort-button" type="button" onClick={() => handleSort('depedEmail')}>DepEd Email</button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsEmailInfoOpen(true); }}
                        title="DepEd Email Policy & Validation Notice"
                        style={{
                          background: '#E0F2FE',
                          color: '#0284C7',
                          border: '1px solid #BAE6FD',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: '800',
                          cursor: 'pointer',
                          lineHeight: 1,
                          padding: 0
                        }}
                      >
                        i
                      </button>
                    </div>
                  </th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('type')}>Position Category</button></th>
                  <th><button className="roster-sort-button" type="button" onClick={() => handleSort('position')}>Position</button></th>
                  <th style={{ width: '100px', textAlign: 'center' }}><button className="roster-sort-button" type="button" onClick={() => handleSort('isSchoolHead')}>School Head</button></th>
                  <th style={{ width: '190px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersonnel.map((p) => (
                  <tr key={p.id} className="roster-row">
                    <td style={{ width: '70px', fontSize: '11px' }}>{p.salutation || '—'}</td>
                    <td>{p.firstName}</td>
                    <td>{p.middleName || '—'}</td>
                    <td>
                      {p.lastName}{p.nameExtension ? ` ${p.nameExtension}` : ''}
                      {p.isDraft && (
                        <span style={{
                          marginLeft: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 6px',
                          background: '#FEF3C7',
                          color: '#D97706',
                          border: '1px solid #FCD34D',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }}>
                          Draft
                        </span>
                      )}
                      {p.isShared && (
                        <span style={{
                          marginLeft: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 6px',
                          background: String(p.deploymentStatus).toUpperCase() === 'BORROWED' ? '#FEF3C7' : '#e0e7ff',
                          color: String(p.deploymentStatus).toUpperCase() === 'BORROWED' ? '#92400E' : '#3730a3',
                          border: String(p.deploymentStatus).toUpperCase() === 'BORROWED' ? '1px solid #FCD34D' : '1px solid #c7d2fe',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }} title="Borrowed from Mother School">
                          {String(p.deploymentStatus).toUpperCase() === 'BORROWED' ? (
                            <>
                              <FiTag size={10} style={{ marginRight: '3px' }} /> BORROWED
                            </>
                          ) : (
                            <>
                              <FiLink size={10} style={{ marginRight: '3px' }} /> SHARED
                            </>
                          )}
                        </span>
                      )}
                    </td>
                    <td>{p.depedEmail}</td>
                    <td>
                      {(() => {
                        const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
                        return (
                          <span className={`category-badge category-${pType}`}>
                            {pType === 'teaching' ? 'Teaching' : pType === 'teaching-related' ? 'Related' : 'Non-Teaching'}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{p.position}</td>
                    <td style={{ textAlign: 'center', width: '100px' }}>
                       {(() => {
                         const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
                         const isNonTeaching = pType === 'non-teaching';
                         return (
                           <label
                             className="switch"
                             style={{
                               position: 'relative',
                               display: 'inline-block',
                               width: '36px',
                               height: '20px',
                               opacity: isNonTeaching ? 0.4 : 1,
                               cursor: isNonTeaching ? 'not-allowed' : 'pointer'
                             }}
                             title={isNonTeaching ? "Non-Teaching personnel cannot be designated as School Head" : (p.isSchoolHead ? "Remove School Head Designation" : "Designate as School Head")}
                           >
                             <input
                               type="checkbox"
                               checked={p.isSchoolHead || false}
                               disabled={isNonTeaching}
                               onChange={async (e) => {
                                 if (isNonTeaching) {
                                   showToast("Non-Teaching personnel cannot be designated as School Head.");
                                   return;
                                 }
                                 const val = e.target.checked;
                                 if (val) {
                                   const currentHead = personnel.find(x => x.isSchoolHead === true && x.id !== p.id);
                                   if (currentHead) {
                                     const confirmed = await showConfirm(
                                       "Change School Head",
                                       `Designate ${p.firstName} ${p.lastName} as the new School Head? This will replace ${currentHead.firstName} ${currentHead.lastName}.`
                                     );
                                     if (confirmed) {
                                       await toggleSchoolHead(p.id, true);
                                     }
                                   } else {
                                     await toggleSchoolHead(p.id, true);
                                   }
                                 } else {
                                   await toggleSchoolHead(p.id, false);
                                 }
                               }}
                               style={{ opacity: 0, width: 0, height: 0 }}
                             />
                             <span style={{
                               position: 'absolute',
                               cursor: isNonTeaching ? 'not-allowed' : 'pointer',
                               top: 0, left: 0, right: 0, bottom: 0,
                               backgroundColor: p.isSchoolHead ? 'var(--blue)' : '#cbd5e1',
                               transition: '0.3s', borderRadius: '20px'
                             }}>
                               <span style={{
                                 position: 'absolute', content: '""', height: '14px', width: '14px', left: p.isSchoolHead ? '18px' : '3px', bottom: '3px',
                                 backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                               }} />
                             </span>
                           </label>
                         );
                       })()}
                     </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {p.isDraft ? (
                          <button
                            className="btn"
                            style={{ 
                              minHeight: '34px', 
                              padding: '6px 12px', 
                              fontSize: '12px', 
                              background: '#D97706', 
                              color: 'white', 
                              border: 0 
                            }}
                            onClick={async () => {
                              await commitDraftPersonnel(p.id);
                            }}
                          >
                            Save
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn secondary"
                              style={{ minHeight: '34px', padding: '6px 12px', fontSize: '12px', border: '1px solid var(--blue)' }}
                              onClick={() => {
                                setActivePersonnelId(p.id);
                                setActiveView('profile');
                              }}
                            >
                              Profile
                            </button>
                            <button
                              className="btn secondary"
                              style={{ minHeight: '34px', padding: '6px 12px', fontSize: '12px', border: '1px solid var(--blue-600)' }}
                              onClick={() => {
                                setActivePersonnelId(p.id);
                                setActiveView('workload');
                              }}
                            >
                              Work
                            </button>
                          </>
                        )}
                        <button
                          className="btn danger"
                          style={{ minHeight: '34px', padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Delete Personnel"
                          onClick={async () => {
                            if (await showConfirm("Delete Personnel?", `Are you sure you want to delete ${p.firstName} ${p.lastName}?`)) {
                              deletePersonnel(p.id);
                            }
                          }}
                        >
                          <FiTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </article>

      {/* Add Personnel Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Personnel</h2>
                <p className="subtext">Encode the minimum roster information first. Additional profile details can be completed later.</p>
              </div>
              <button className="btn secondary modal-close" onClick={() => setIsModalOpen(false)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <FiX size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="modal-body">
              <div className="form-grid">
                <div>
                  <label>First Name</label>
                  <input
                    placeholder="First name"
                    value={newPerson.firstName}
                    onChange={(e) => setNewPerson({ ...newPerson, firstName: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div>
                  <label>Middle Name (Optional)</label>
                  <input
                    placeholder="Middle name"
                    value={newPerson.middleName}
                    onChange={(e) => setNewPerson({ ...newPerson, middleName: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label>Last Name</label>
                  <input
                    placeholder="Last name"
                    value={newPerson.lastName}
                    onChange={(e) => setNewPerson({ ...newPerson, lastName: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div>
                  <label>Extension Name (Optional)</label>
                  <input
                    placeholder="e.g. JR., SR., III"
                    maxLength={5}
                    value={newPerson.nameExtension}
                    onChange={(e) => setNewPerson({ ...newPerson, nameExtension: e.target.value.toUpperCase().slice(0, 5) })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>DepEd Email</label>
                    <button
                      type="button"
                      onClick={() => setIsEmailInfoOpen(true)}
                      title="DepEd Email Policy & Validation Notice"
                      style={{
                        background: '#E0F2FE',
                        color: '#0284C7',
                        border: '1px solid #BAE6FD',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        lineHeight: 1,
                        padding: 0
                      }}
                    >
                      i
                    </button>
                  </div>
                  <div 
                    className="deped-email-field"
                    style={{
                      border: hasAddEmailError ? '2px solid #EF4444' : '1.5px solid var(--line, #BAE6FD)',
                      background: hasAddEmailError ? '#FEF2F2' : 'white',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      placeholder="firstname.lastname"
                      value={newPerson.depedEmailLocal}
                      onKeyDown={(e) => {
                        if (e.key === '@') {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => setNewPerson({ ...newPerson, depedEmailLocal: e.target.value.replace(/@/g, '').toLowerCase().replace(/[^a-z0-9.]/g, '') })}
                      required
                      style={{
                        color: hasAddEmailError ? '#B91C1C' : 'var(--text)'
                      }}
                    />
                    <span style={{
                      background: hasAddEmailError ? '#FEE2E2' : 'var(--blue-50, #F0F9FF)',
                      color: hasAddEmailError ? '#DC2626' : 'var(--blue, #0284C7)',
                      borderLeft: hasAddEmailError ? '1px solid #FCA5A5' : '1px solid var(--line, #BAE6FD)',
                      fontWeight: '700'
                    }}>
                      @deped.gov.ph
                    </span>
                  </div>
                  {hasAddEmailError && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#DC2626', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FiAlertCircle size={14} color="#DC2626" /> {addModalEmailVal.error}
                    </p>
                  )}
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label>Position Category</label>
                    <select
                      value={newPerson.type}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setNewPerson({
                          ...newPerson,
                          type: newType,
                          position: POSITION_OPTIONS_BY_CATEGORY[newType][0]
                        });
                      }}
                    >
                      <option value="teaching">TEACHING PERSONNEL</option>
                      <option value="teaching-related">RELATED TEACHING PERSONNEL</option>
                      <option value="non-teaching">NON-TEACHING PERSONNEL</option>
                    </select>
                  </div>

                  <div>
                    <label>Position</label>
                    <SearchableDropdown
                      options={POSITION_OPTIONS_BY_CATEGORY[newPerson.type] || []}
                      value={newPerson.position?.startsWith('OTHERS') ? 'OTHERS' : newPerson.position}
                      onChange={(val) => {
                        if (val === 'OTHERS') {
                          setNewPerson({ ...newPerson, position: 'OTHERS' });
                        } else {
                          setNewPerson({ ...newPerson, position: val });
                        }
                      }}
                      placeholder="SELECT POSITION..."
                    />
                    {newPerson.type === 'non-teaching' && (newPerson.position === 'OTHERS' || newPerson.position?.startsWith('OTHERS')) && (
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#64748B' }}>Specify Position (Max 50 characters)</label>
                        <input
                          type="text"
                          maxLength={50}
                          placeholder="Specify position title..."
                          value={newPerson.position === 'OTHERS' ? '' : newPerson.position.replace(/^OTHERS\s*-\s*/i, '')}
                          onChange={(e) => {
                            const val = e.target.value.substring(0, 50).toUpperCase();
                            setNewPerson({ ...newPerson, position: val ? `OTHERS - ${val}` : 'OTHERS' });
                          }}
                          required
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            fontSize: '13px',
                            borderRadius: '8px',
                            border: '1.5px solid #BAE6FD',
                            background: '#F0F9FF'
                          }}
                        />
                        <div style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'right', marginTop: '2px' }}>
                          {(newPerson.position === 'OTHERS' ? '' : newPerson.position.replace(/^OTHERS\s*-\s*/i, '')).length}/50 characters
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button 
                  className="btn" 
                  type="submit"
                  disabled={hasAddEmailError}
                  style={{
                    opacity: hasAddEmailError ? 0.6 : 1,
                    cursor: hasAddEmailError ? 'not-allowed' : 'pointer'
                  }}
                >
                  Add Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ESF7 Upload Modal */}
      <ESF7UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onImportSuccess={() => {
          if (showToast) showToast('Faculty profiles auto-populated successfully!', 'success');
        }} 
      />
    </section>
  );
}
