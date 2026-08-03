import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';

const STANDARD_DESIGNATIONS = [
  { id: 'dept_head', name: 'Department Head', description: 'Oversees academic learning area departments and instructional supervision.' },
  { id: 'property_custodian', name: 'Property Custodian', description: 'Manages school equipment, inventory, and physical assets.' },
  { id: 'ict_coordinator', name: 'ICT Coordinator', description: 'Handles school IT infrastructure, DepEd computerization program, and digital reports.' },
  { id: 'guidance_coordinator', name: 'Guidance Coordinator', description: 'Manages student counseling, child protection policy, and career guidance.' },
  { id: 'bac_chair', name: 'BAC Chair / Member', description: 'Bids and Awards Committee member responsible for school procurement.' },
  { id: 'disbursing_officer', name: 'Disbursing Officer', description: 'Handles financial disbursements and petty cash management.' },
  { id: 'sdrrm_coordinator', name: 'SDRRM Coordinator', description: 'School Disaster Risk Reduction and Management coordinator for safety and emergency drills.' },
  { id: 'sslg_adviser', name: 'SSLG / Youth Formation Adviser', description: 'Advises Supreme Secondary Learner Government and student organizations.' },
  { id: 'feeding_coordinator', name: 'School Feeding Coordinator', description: 'Manages DepEd School-Based Feeding Program (SBFP) implementation.' },
  { id: 'reading_coordinator', name: 'Reading & Literacy Coordinator', description: 'Leads reading interventions, Phil-IRI assessments, and literacy programs.' }
];

export default function Designations() {
  const { personnel, setPersonnel, showToast } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  // Active (non-draft) personnel list
  const activePersonnel = (Array.isArray(personnel) ? personnel : []).filter(p => !p.isDraft);

  // Helper to update designation for a personnel member
  const handleAssignDesignation = (designationName, selectedPersonId) => {
    const updatedPersonnel = activePersonnel.map(p => {
      // If this person was assigned to this designation previously and is replaced, clear it
      if (selectedPersonId && p.id === selectedPersonId) {
        const updated = { ...p, designation: designationName };
        localStorage.setItem(`draft_personnel_${p.id}`, JSON.stringify(updated));
        return updated;
      } else if (!selectedPersonId && p.designation === designationName) {
        // Unassigned
        const updated = { ...p, designation: '' };
        localStorage.setItem(`draft_personnel_${p.id}`, JSON.stringify(updated));
        return updated;
      } else if (p.designation === designationName && p.id !== selectedPersonId) {
        // Replaced by someone else
        const updated = { ...p, designation: '' };
        localStorage.setItem(`draft_personnel_${p.id}`, JSON.stringify(updated));
        return updated;
      }
      return p;
    });

    setPersonnel(updatedPersonnel);
    const assignedPerson = activePersonnel.find(p => p.id === selectedPersonId);
    if (assignedPerson) {
      showToast(`✓ Assigned ${assignedPerson.firstName} ${assignedPerson.lastName} as ${designationName}`, 'success');
    } else {
      showToast(`Unassigned ${designationName}`, 'info');
    }
  };

  const filteredDesignations = STANDARD_DESIGNATIONS.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section id="designations" className="view grid">
      <article className="card">
        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--navy)' }}>
                🏅 School Designation Management
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Assign special ancillary school duties and designations (e.g. Department Head, Property Custodian) to qualified personnel.
              </p>
            </div>
            
            {/* Search Box */}
            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                placeholder="Search designation or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--line)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px' }}>🔍</span>
            </div>
          </div>

          {/* Grid of Designations */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
            {filteredDesignations.map((desig) => {
              const assignedPerson = activePersonnel.find(p => p.designation === desig.name);

              return (
                <div
                  key={desig.id}
                  style={{
                    background: '#FFFFFF',
                    border: assignedPerson ? '1.5px solid #3B82F6' : '1.5px solid var(--line)',
                    borderRadius: '14px',
                    padding: '18px',
                    boxShadow: assignedPerson ? '0 4px 12px rgba(59, 130, 246, 0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>
                        {desig.name}
                      </h3>
                      {assignedPerson ? (
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: '#EFF6FF',
                          color: '#1D4ED8',
                          fontSize: '11px',
                          fontWeight: '800',
                          border: '1px solid #BFDBFE'
                        }}>
                          Assigned
                        </span>
                      ) : (
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: '#F8FAFC',
                          color: '#94A3B8',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: '1px solid #E2E8F0'
                        }}>
                          Vacant
                        </span>
                      )}
                    </div>

                    <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B', lineHeight: '1.5' }}>
                      {desig.description}
                    </p>

                    {/* Assigned Personnel Card Preview */}
                    {assignedPerson && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: '#F8FAFC',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        marginBottom: '14px',
                        border: '1px solid #E2E8F0'
                      }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '13px'
                        }}>
                          {`${(assignedPerson.firstName || '')[0] || ''}${(assignedPerson.lastName || '')[0] || ''}`.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {assignedPerson.firstName} {assignedPerson.lastName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {assignedPerson.position || 'Teacher'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAssignDesignation(desig.name, null)}
                          style={{
                            background: '#FEE2E2',
                            color: '#EF4444',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                          title="Unassign this designation"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Assign Personnel Dropdown */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
                      {assignedPerson ? 'CHANGE ASSIGNED PERSONNEL' : 'ASSIGN PERSONNEL'}
                    </label>
                    <SearchableDropdown
                      options={activePersonnel.map(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})`)}
                      value={assignedPerson ? `${assignedPerson.firstName} ${assignedPerson.lastName} (${assignedPerson.position || 'Teacher'})` : ''}
                      onChange={(val) => {
                        const person = activePersonnel.find(p => `${p.firstName} ${p.lastName} (${p.position || 'Teacher'})` === val);
                        handleAssignDesignation(desig.name, person ? person.id : null);
                      }}
                      placeholder="Select school personnel to assign..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </article>
    </section>
  );
}
