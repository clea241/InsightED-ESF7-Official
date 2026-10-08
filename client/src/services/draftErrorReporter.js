// Single shared place for draft-related failures (auto-save, journey-state save, personnel fetch).
// Holds at most ONE current error, so repeated failures update the notice instead of stacking.

export const DRAFT_ACTIONS = {
  AUTO_SAVE: 'Draft auto-save',
  JOURNEY_SAVE: 'Journey-state save',
  PERSONNEL_FETCH: 'Draft-sync personnel fetch',
  INITIAL_LOAD: 'Initial data load'
};

let current = null;
let context = { userId: null, role: null };
const listeners = new Set();

const emit = () => listeners.forEach((fn) => { try { fn(current); } catch (e) {} });

export const subscribeDraftError = (fn) => {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
};

export const setDraftErrorContext = (ctx = {}) => {
  context = { ...context, ...ctx };
};

const getSchoolId = () => {
  try {
    return localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId') || 'unknown';
  } catch (e) {
    return 'unknown';
  }
};

// Remove anything that looks like a credential before it can reach the report.
const scrub = (text) => String(text == null ? '' : text)
  .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
  .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[redacted-token]')
  .replace(/((?:token|password|authorization|cookie|secret|api[_-]?key)["']?\s*[:=]\s*)["']?[^\s"',;&]+/gi, '$1[redacted]');

const scrubUrl = (url) => {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    ['token', 'access_token', 'auth', 'key', 'password'].forEach((k) => u.searchParams.delete(k));
    return u.pathname + u.search;
  } catch (e) {
    return scrub(url);
  }
};

export const buildErrorReport = (entry) => {
  const err = entry.error || {};
  const lines = [
    'InsightED eSF7 - Draft Error Report',
    `Timestamp: ${new Date(entry.timestamp).toISOString()}`,
    `Failing action: ${entry.action}`,
    `Error: ${scrub(err.name || 'Error')}: ${scrub(err.message || 'Unknown error')}`,
    `Occurrences since last success: ${entry.count}`
  ];
  if (err.url) lines.push(`Request URL: ${scrubUrl(err.url)}`);
  if (err.status) lines.push(`HTTP status: ${err.status}`);
  lines.push(
    `School ID: ${getSchoolId()}`,
    `User: ${context.userId || 'unknown'} (role: ${context.role || 'unknown'})`,
    `App version: ${import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_BUILD_HASH || import.meta.env.MODE || 'unknown'}`,
    '',
    'Stack trace:',
    scrub(err.stack || '(none)')
  );
  return lines.join('\n');
};

/**
 * @param {string} action
 * @param {any} error
 * @param {{ retry?: (() => unknown) | null }} [options]
 */
export const reportDraftError = (action, error, { retry } = {}) => {
  const e = error || {};
  current = {
    action,
    error: { name: e.name, message: e.message, stack: e.stack, url: e.url, status: e.status },
    timestamp: Date.now(),
    count: (current?.count || 0) + 1,
    retry: retry || current?.retry || null
  };
  console.error(`[DraftError] ${action} failed:`, error);
  emit();
};

// Call after any later successful draft save/fetch.
export const clearDraftError = () => {
  if (!current) return;
  current = null;
  emit();
};

export const copyTextToClipboard = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
};
