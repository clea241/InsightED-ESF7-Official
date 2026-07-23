import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';

export default function RequestCenter() {
  const { 
    incomingRequests, 
    outgoingRequests, 
    districtSchools, 
    refreshRequests, 
    showToast, 
    showAlert 
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState('incoming');
  const [mergeTargetSchool, setMergeTargetSchool] = useState('');
  const [isSubmittingMerge, setIsSubmittingMerge] = useState(false);

  const handleRespond = async (id, action) => {
    try {
      const res = await api.respondToRequest(id, action);
      if (res.success) {
        showToast(`Request successfully ${action === 'approved' ? 'Approved' : 'Rejected'}.`);
        refreshRequests();
        if (action === 'approved') {
          // Reload the window to clear local draft overrides and load the newly transferred/approved personnel fresh from PostgreSQL
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      } else {
        showAlert('Action Failed', res.error || 'Could not process response.');
      }
    } catch (e) {
      console.error(e);
      showAlert('Error', 'A network error occurred.');
    }
  };

  const handleMergeSubmit = async (e) => {
    e.preventDefault();
    if (!mergeTargetSchool) return;

    // Extract School ID from format "School Name (123456)"
    const match = mergeTargetSchool.match(/\((\d+)\)/);
    const targetSchoolId = match ? match[1] : mergeTargetSchool;

    setIsSubmittingMerge(true);
    try {
      const res = await api.createRequest({
        targetSchoolId,
        requestType: 'school_merger'
      });
      if (res.success) {
        showToast('Merger request sent successfully!');
        setMergeTargetSchool('');
        refreshRequests();
      } else {
        showAlert('Request Failed', res.error || 'Failed to submit merger request.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Could not send request.');
    } finally {
      setIsSubmittingMerge(false);
    }
  };

  return (
    <section id="requests" className="view grid">
      <article className="card">
        <div className="card-inner">
          <h2>Request Center</h2>
          <p className="subtext">
            Manage incoming teacher clustering requests and school mergers, or initiate integration requests to other schools.
          </p>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderBottom: '1.5px solid var(--line)', paddingBottom: '1px' }}>
            <button
              onClick={() => setActiveSubTab('incoming')}
              style={{
                background: 'none',
                border: 0,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: activeSubTab === 'incoming' ? 'var(--blue)' : 'var(--muted)',
                borderBottom: activeSubTab === 'incoming' ? '3px solid var(--blue)' : '3px solid transparent'
              }}
            >
              Incoming Requests ({incomingRequests.length})
            </button>
            <button
              onClick={() => setActiveSubTab('outgoing')}
              style={{
                background: 'none',
                border: 0,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: activeSubTab === 'outgoing' ? 'var(--blue)' : 'var(--muted)',
                borderBottom: activeSubTab === 'outgoing' ? '3px solid var(--blue)' : '3px solid transparent'
              }}
            >
              Outgoing Requests ({outgoingRequests.length})
            </button>
            <button
              onClick={() => setActiveSubTab('merge')}
              style={{
                background: 'none',
                border: 0,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: activeSubTab === 'merge' ? 'var(--blue)' : 'var(--muted)',
                borderBottom: activeSubTab === 'merge' ? '3px solid var(--blue)' : '3px solid transparent'
              }}
            >
              Initiate Integration/Merger
            </button>
          </div>

          <div style={{ marginTop: '20px' }}>
            {activeSubTab === 'incoming' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {incomingRequests.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic', padding: '10px' }}>No incoming requests pending.</p>
                ) : (
                  incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: '16px',
                        background: '#F8FAFC',
                        border: '1.5px solid var(--line)',
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>
                          {req.request_type === 'school_merger' ? 'Integration / School Merger Request' : 'Incoming Clustered Personnel'}
                        </strong>
                        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0 0' }}>
                          {req.request_type === 'school_merger'
                            ? `School ID ${req.requester_school_id} requested to merge and transfer all their personnel into your school.`
                            : `School ID ${req.requester_school_id} (Mother School) shared a clustered teacher "${req.personnel_name}" to your school.`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleRespond(req.id, 'approved')}
                          className="btn"
                          style={{ minHeight: 'auto', padding: '8px 16px', background: 'var(--green)', border: 0, color: 'white' }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRespond(req.id, 'rejected')}
                          className="btn secondary"
                          style={{ minHeight: 'auto', padding: '8px 16px', border: '1px solid var(--red)', color: 'var(--red)' }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSubTab === 'outgoing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {outgoingRequests.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic', padding: '10px' }}>No outgoing requests sent.</p>
                ) : (
                  outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: '16px',
                        background: 'white',
                        border: '1.5px solid var(--line)',
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>
                          {req.request_type === 'school_merger' ? 'Integration / School Merger Request' : 'Outgoing Clustered Personnel'}
                        </strong>
                        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0 0' }}>
                          {req.request_type === 'school_merger'
                            ? `Requested merger into School ID ${req.target_school_id}`
                            : `Shared clustered teacher "${req.personnel_name}" to Clustered School ID ${req.target_school_id}`}
                        </p>
                      </div>
                      <div>
                        <span
                          className={`badge ${
                            req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'err' : 'warn'
                          }`}
                          style={{
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            fontSize: '11px',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            background: req.status === 'approved' ? '#E0F2FE' : req.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                            color: req.status === 'approved' ? '#0369A1' : req.status === 'rejected' ? '#B91C1C' : '#D97706'
                          }}
                        >
                          ● {req.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSubTab === 'merge' && (
              <div
                style={{
                  maxWidth: '500px',
                  background: '#F8FAFC',
                  border: '1.5px solid var(--line)',
                  padding: '24px',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '15px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)' }}>Request School Integration</h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Submit a merger request to integrate your school into a host/mother school. <strong>Once approved, all your personnel will be permanently transferred to the host school.</strong>
                </p>

                <form onSubmit={handleMergeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' }}>
                      Select Target Host School (Within District)
                    </label>
                    <SearchableDropdown
                      options={districtSchools.map(s => `${s.school_name.toUpperCase()} (${s.school_id})`)}
                      value={mergeTargetSchool}
                      onChange={(val) => setMergeTargetSchool(val)}
                      placeholder="Select target school..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn"
                    disabled={isSubmittingMerge || !mergeTargetSchool}
                    style={{ background: 'var(--blue)', color: 'white', border: 0 }}
                  >
                    {isSubmittingMerge ? 'Sending Request...' : 'Send Merger Request'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
