import React from 'react';
import { FiCheckCircle, FiAlertTriangle, FiLoader } from 'react-icons/fi';
import { subscribeDraftSave, retryNow } from '../services/draftSaver';

// Small pill showing the real cloud-save state. "Saved" appears only after the server confirmed the database write.
export default function SaveStatusIndicator() {
  const [state, setState] = React.useState({ status: 'idle' });
  React.useEffect(() => subscribeDraftSave(setState), []);

  if (state.status === 'idle') return null;

  const base = {
    position: 'fixed',
    left: '16px',
    bottom: '16px',
    zIndex: 9000,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
    border: '1px solid var(--line)',
    background: 'white'
  };

  if (state.status === 'saving') {
    return <div role="status" style={{ ...base, color: '#475569' }}><FiLoader size={14} /> Saving...</div>;
  }
  if (state.status === 'saved') {
    return <div role="status" style={{ ...base, color: '#047857' }}><FiCheckCircle size={14} /> Saved</div>;
  }
  if (state.status === 'conflict') {
    return <div role="status" style={{ ...base, color: '#B45309' }}><FiAlertTriangle size={14} /> Two versions found, choose one</div>;
  }
  return (
    <button
      type="button"
      onClick={() => { retryNow().catch(() => {}); }}
      style={{ ...base, color: '#B91C1C', cursor: 'pointer' }}
    >
      <FiAlertTriangle size={14} /> Failed to save, retry
    </button>
  );
}
