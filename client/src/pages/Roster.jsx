import React, { useState } from 'react';
import { useApp, POSITION_OPTIONS_BY_CATEGORY, detectPersonnelTypeFromPosition } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';
import DepEdEmailInfoModal from '../components/DepEdEmailInfoModal';
import PortalHeader from '../components/PortalHeader';


export default function Roster() {
  const { personnel, addPersonnel, deletePersonnel, toggleSchoolHead, commitDraftPersonnel, setActivePersonnelId, setActiveView, showConfirm, showToast, hasUnsavedChanges, completeNode } = useApp();
  
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'lastName', direction: 'asc' });
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [isEmailInfoOpen, setIsEmailInfoOpen] = useState(false);

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
            <button className="btn" type="button" onClick={() => setIsModalOpen(true)}>+ Add personnel</button>
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
                          {String(p.deploymentStatus).toUpperCase() === 'BORROWED' ? '🏷️ BORROWED' : '🔗 SHARED'}
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
                                   showToast("⚠️ Non-Teaching personnel cannot be designated as School Head.");
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
                          style={{ minHeight: '34px', padding: '6px 10px', fontSize: '12px' }}
                          onClick={async () => {
                            if (await showConfirm("Delete Personnel?", `Are you sure you want to delete ${p.firstName} ${p.lastName}?`)) {
                              deletePersonnel(p.id);
                            }
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              <button className="btn secondary modal-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleAddSubmit} className="modal-body">
              <div className="form-grid">
                <div>
                  <label>Designation</label>
                  <select
                    value={newPerson.salutation}
                    onChange={(e) => setNewPerson({ ...newPerson, salutation: e.target.value })}
                  >
                    <option>MR.</option>
                    <option>MRS.</option>
                    <option>MS.</option>
                  </select>
                </div>
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
                    value={newPerson.nameExtension}
                    onChange={(e) => setNewPerson({ ...newPerson, nameExtension: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
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
                  <div className="deped-email-field">
                    <input
                      placeholder="name"
                      value={newPerson.depedEmailLocal}
                      onChange={(e) => setNewPerson({ ...newPerson, depedEmailLocal: e.target.value.toLowerCase().replace(/[^a-z0-9.]/g, '') })}
                      required
                    />
                    <span>@deped.gov.ph</span>
                  </div>
                </div>
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
                <div className="full">
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
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button className="btn" type="submit">Add Personnel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
