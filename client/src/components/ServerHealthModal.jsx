import React from 'react';
import { createPortal } from 'react-dom';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { subscribeHealth, checkNow } from '../services/serverHealth';
import { buildErrorReport, copyTextToClipboard } from '../services/draftErrorReporter';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Blocking modal shown while the server-health lock is on. Cannot be dismissed; unlocks itself on recovery.
export default function ServerHealthModal() {
  const [health, setHealth] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const [copied, setCopied] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const dialogRef = React.useRef(null);
  const locked = !!health?.locked;

  React.useEffect(() => subscribeHealth(setHealth), []);

  React.useEffect(() => {
    if (!locked) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  // Lock the rest of the app: inert page, no shortcuts, no form submits, focus trapped in the dialog.
  React.useEffect(() => {
    if (!locked) return undefined;
    const root = document.getElementById('root');
    const previouslyFocused = document.activeElement;
    if (root) root.setAttribute('inert', '');
    // The modal is portalled to document.body, outside #root, so it stays interactive.
    const onKeyDown = (e) => {
      const dialog = dialogRef.current;
      if (e.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled);
        if (items.length === 0) { e.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        return;
      }
      // Swallow Esc, Enter and every shortcut unless it targets this dialog's own buttons.
      const inDialog = dialog && dialog.contains(e.target);
      if (e.key === 'Escape' || !inDialog) { e.preventDefault(); e.stopPropagation(); }
    };
    const onSubmit = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('submit', onSubmit, true);
    const t = setTimeout(() => {
      const first = dialogRef.current && dialogRef.current.querySelector(FOCUSABLE);
      if (first) first.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('submit', onSubmit, true);
      if (root) root.removeAttribute('inert');
      try { if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus(); } catch (e) {}
    };
  }, [locked]);

  const handleRetry = async () => {
    setChecking(true);
    try { await checkNow(); } finally { setChecking(false); }
  };

  const handleCopy = async () => {
    const err = health?.lastError || {};
    const text = buildErrorReport({
      action: 'Server health check (app locked)',
      error: { name: err.name || 'ServerUnavailable', message: err.message || 'Server did not respond', stack: err.stack, url: err.url, status: err.status },
      timestamp: Date.now(),
      count: 1
    });
    if (await copyTextToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (health?.backOnline && !locked) {
    return createPortal(
      <div role="status" style={{
        position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #059669, #047857)', color: 'white', padding: '12px 24px',
        borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 100000,
        fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <FiCheckCircle size={18} /> <span>Back online. Your work has been synced.</span>
      </div>,
      document.body
    );
  }
  if (!locked) return null;

  const secondsLeft = health.nextCheckAt ? Math.max(0, Math.ceil((health.nextCheckAt - now) / 1000)) : null;
  const lastCheckedText = health.lastChecked ? new Date(health.lastChecked).toLocaleTimeString() : 'not yet';
  let status;
  if (health.recovering) status = 'Server is back. Syncing your work...';
  else if (checking) status = 'Checking now...';
  else if (secondsLeft != null) status = `Next check in ${secondsLeft}s`;
  else status = 'Checking...';

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000
    }}>
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="server-health-title"
        aria-describedby="server-health-desc"
        style={{
          background: 'white', borderRadius: '16px', width: '460px', maxWidth: '90%', padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1.5px solid var(--line)',
          animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        <h3 id="server-health-title" style={{ margin: '0 0 10px', fontSize: '18px', color: 'var(--navy)', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiAlertTriangle size={20} color="#B91C1C" /> The server is having a problem
        </h3>
        <p id="server-health-desc" style={{ margin: '0 0 12px', fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
          Your work is protected: everything you entered is saved on this device and will be synced automatically.
          The system will resume on its own as soon as the server is healthy again. Please keep this page open.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B' }}>
          {status} &middot; Last checked: {lastCheckedText}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={handleCopy} style={{ minHeight: '38px', padding: '0 16px' }}>
            {copied ? 'Copied' : 'Copy error details'}
          </button>
          <button
            className="btn"
            onClick={handleRetry}
            disabled={checking || health.recovering}
            style={{
              minHeight: '38px', padding: '0 16px',
              background: 'linear-gradient(180deg, var(--blue), var(--navy))',
              borderColor: 'var(--navy)', color: 'white'
            }}
          >
            Retry now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
