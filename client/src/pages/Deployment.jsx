import React from 'react';
import { useApp, DIVISION_SCHOOL_OPTIONS } from '../context/AppContext';

export default function Deployment() {
  const {
    personnel,
    activePersonnelId,
    setActivePersonnelId,
    updatePersonnelInfo,
    savePersonnelChanges,
    showToast,
    showAlert,
    showConfirm
  } = useApp();

  const dbPerson = personnel.find(p => p.id === activePersonnelId) || personnel[0];
  const [editPerson, setEditPerson] = React.useState(null);

  React.useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_deployment_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          setEditPerson(JSON.parse(savedDraft));
          return;
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }
      setEditPerson(dbPerson);
    } else {
      setEditPerson(null);
    }
  }, [activePersonnelId, dbPerson]);

  const currentPerson = editPerson || dbPerson;

  if (!currentPerson) {
    return (
      <div className="card-inner">
        <h2>No Personnel Found</h2>
        <p className="subtext">Please add personnel in the Roster page first.</p>
      </div>
    );
  }

  const handleFieldChange = (key, value) => {
    if (!currentPerson) return;
    const updated = { ...currentPerson, [key]: value };
    setEditPerson(updated);
    localStorage.setItem(`draft_deployment_${currentPerson.id}`, JSON.stringify(updated));
  };

  const handleSaveChangesDirectly = async () => {
    if (!currentPerson) return;
    try {
      await savePersonnelChanges(currentPerson.id, currentPerson);
      localStorage.removeItem(`draft_deployment_${currentPerson.id}`);
      showToast("Deployment changes saved to database successfully.");
    } catch (err) {
      await showAlert("Error", "Failed to save deployment changes: " + err.message);
    }
  };

  return (
    <section id="deployment" className="view grid">
      <article className="card">
        <div className="card-inner">
          <h2>Deployment, Clustered Schools, and Transfers</h2>
          <p className="subtext">Separates profile ownership from school-specific workload assignment.</p>
          
          {localStorage.getItem(`draft_deployment_${dbPerson?.id}`) && (
            <div style={{ padding: '12px 16px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '12px', color: '#B45309', fontSize: '13px', marginBottom: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ You have unsaved deployment changes (draft stored locally).</span>
              <button className="btn secondary" style={{ minHeight: '28px', padding: '0 10px', fontSize: '12px', background: 'white', color: '#B45309', borderColor: '#FCD34D' }} type="button" onClick={async () => {
                if (await showConfirm("Discard Draft?", "Are you sure you want to discard your unsaved changes and revert to the server data?")) {
                  localStorage.removeItem(`draft_deployment_${dbPerson.id}`);
                  setEditPerson(dbPerson);
                }
              }}>
                Discard Draft
              </button>
            </div>
          )}

          <div className="form-grid" style={{ marginTop: '12px' }}>
            <div>
              <label>Selected Personnel</label>
              <select
                value={currentPerson.id}
                onChange={(e) => setActivePersonnelId(e.target.value)}
              >
                {personnel.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} · {p.position}
                  </option>
                ))}
              </select>
            <div>
              <label>Status of Deployment</label>
              <select
                value={currentPerson.deploymentStatus || 'OWN STATION'}
                onChange={(e) => handleFieldChange('deploymentStatus', e.target.value)}
              >
                <option value="OWN STATION">OWN STATION</option>
                <option value="CLUSTERED">CLUSTERED</option>
                <option value="REASSIGNED">REASSIGNED</option>
                <option value="BORROWED">BORROWED</option>
              </select>
            </div>
            <div>
              <label>Profile Owner / Original School</label>
              <select
                value={currentPerson.profileOwner || 'Sample National High School'}
                onChange={(e) => handleFieldChange('profileOwner', e.target.value)}
              >
                <option value="Sample National High School">Sample National High School</option>
                <option value="Receiving Integrated School">Receiving Integrated School</option>
                <option value="Clustered Elementary School">Clustered Elementary School</option>
              </select>
            </div>
            <div>
              <label>Record Visibility</label>
              <select
                value={currentPerson.recordVisibility || 'Owned full profile'}
                onChange={(e) => handleFieldChange('recordVisibility', e.target.value)}
              >
                <option value="Owned full profile">Owned full profile</option>
                <option value="Shared limited profile">Shared limited profile</option>
              </select>
            </div>
            <div>
              <label>Clustered School ID / Name</label>
              <select
                value={currentPerson.clusteredSchools || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleFieldChange('clusteredSchools', val);
                  handleFieldChange('assignedSchools', val ? [val] : []);
                }}
              >
                <option value="">N/A (Not clustered)</option>
                {DIVISION_SCHOOL_OPTIONS.map(s => (
                  <option key={s.schoolId} value={s.name}>
                    {s.name} ({s.schoolId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Clustered Acceptance Status</label>
              <select
                value={currentPerson.clusteredAcceptanceStatus || 'N/A'}
                onChange={(e) => handleFieldChange('clusteredAcceptanceStatus', e.target.value)}
              >
                <option value="N/A">N/A</option>
                <option value="Pending acceptance">Pending acceptance</option>
                <option value="Accepted">Accepted</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label>Transfer Status</label>
              <select
                value={currentPerson.transferStatus || 'N/A'}
                onChange={(e) => handleFieldChange('transferStatus', e.target.value)}
              >
                <option value="N/A">N/A</option>
                <option value="Receiving school initiated">Receiving school initiated</option>
                <option value="Originating school review">Originating school review</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px', borderTop: '1.5px solid var(--line)', paddingTop: '15px' }}>
            <button className="btn" type="button" onClick={handleSaveChangesDirectly} style={{ background: '#0284c7', borderColor: '#0284c7', color: 'white' }}>
              Save Changes
            </button>
          </div>

          <div className="issue-list" style={{ marginTop: '20px' }}>
            <div className="issue">
              Clustered schools may assign workload but cannot edit the full basic profile.
            </div>
            <div className="issue warn" style={{ borderLeftColor: 'var(--gold)', background: '#FFFBEB', color: '#92400E' }}>
              A formal transfer request is required before the receiving school becomes profile owner, even if the record is already visible through clustered deployment.
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
