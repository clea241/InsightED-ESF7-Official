// ONE shared error reporter for the whole app: a single SweetAlert template that shows what the user was doing and the
// exact technical details (message, HTTP status, method + URL, server body, handler, school/record ids, time, stack).
//
//   reportError(err, { action, handler, ids })   show the dialog (deduplicated + queued, one at a time)
//   noteApiError(err)                            called by api.js for every failed request; reports it after a short
//                                                grace period UNLESS a catch block already reported/handled it
//   takeRecentApiError()                         lets an existing alert (showAlert, the unsaved-changes dialog) reuse the
//                                                detailed format for the failure that just happened instead of a 2nd dialog
//   installGlobalErrorHandlers()                 window "unhandledrejection" + "error"
//
// A save that reports through here must still behave as failed: reportError never swallows - callers rethrow or return
// { ok: false } as before. It only makes the failure impossible to miss.
import { getSessionSchoolId } from './session';
import { scrub, scrubUrl, setExternalDraftReporter } from './draftErrorReporter';

const DEDUPE_WINDOW_MS = 8000;
const UNCLAIMED_GRACE_MS = 3500;
const RECENT_WINDOW_MS = 10000;
const MAX_BODY_CHARS = 4000;

let context = { userId: null, role: null };
export const setErrorAlertContext = (ctx = {}) => { context = { ...context, ...ctx }; };

const schoolId = () => { try { return getSessionSchoolId() || 'unknown'; } catch (e) { return 'unknown'; } };
const isDev = () => { try { return Boolean(import.meta.env.DEV); } catch (e) { return false; } };

// ---------- plain-language "what was the user doing" ----------
const ROUTES = [
  [/\/workloads?\b/i, (m, id) => `Saving workload${id ? ` for ${id}` : ''}`],
  [/\/personnel\/[^/]+\/verify/i, () => 'Verifying a personnel record'],
  [/\/personnel\b/i, (m, id) => (m === 'GET' ? 'Loading personnel records' : `Saving personnel record${id ? ` ${id}` : ''}`)],
  [/\/(sections|class-sections)\b/i, (m) => (m === 'GET' ? 'Loading class sections' : 'Saving class sections')],
  [/\/school\/draft|\/schools?\/draft/i, (m) => (m === 'GET' ? 'Loading your saved draft' : 'Saving your draft')],
  [/\/node-status\b/i, (m) => (m === 'GET' ? 'Loading Node Map progress' : 'Updating Node Map progress')],
  [/\/requests?\b/i, (m) => (m === 'GET' ? 'Loading requests' : 'Sending a request')],
  [/\/overload/i, (m) => (m === 'GET' ? 'Loading overload data' : 'Saving overload data')],
  [/\/allowances?\b/i, (m) => (m === 'GET' ? 'Loading allowances' : 'Saving allowances')],
  [/\/validation\b/i, (m) => (m === 'GET' ? 'Loading validation results' : 'Saving validation')],
  [/\/esf7[-_]?upload|\/upload/i, () => 'Importing an ESF7 file'],
  [/\/auth\b/i, () => 'Signing in']
];

export const describeRequest = (method, url, ids = {}) => {
  const m = String(method || 'GET').toUpperCase();
  const path = String(url || '');
  const id = ids.personnel_id || ids.personnelId || ids.id || (path.match(/\/(PER-[\w-]+|local-p-[\w-]+)/i) || [])[1] || '';
  const hit = ROUTES.find(([re]) => re.test(path));
  if (hit) return hit[1](m, id);
  return m === 'GET' ? 'Loading data from the server' : 'Saving changes to the server';
};

// ---------- request details captured by api.js ----------
const ID_KEYS = ['id', 'personnel_id', 'personnelId', 'school_id', 'schoolId', 'section_id', 'sectionId', 'prn', 'term', 'school_year', 'schoolYear'];

/** Top-level payload keys plus the id-like values (never tokens, passwords or free text). */
export const summarizePayload = (body) => {
  let obj = body;
  if (typeof body === 'string') { try { obj = JSON.parse(body); } catch (e) { return { payloadKeys: [], ids: {} }; } }
  if (!obj || typeof obj !== 'object') return { payloadKeys: [], ids: {} };
  const keys = Object.keys(obj).filter((k) => !/token|password|secret|authorization|cookie/i.test(k));
  const ids = {};
  for (const k of ID_KEYS) {
    const v = obj[k];
    if (v !== undefined && v !== null && typeof v !== 'object' && String(v).length <= 80) ids[k] = String(v);
  }
  return { payloadKeys: keys.slice(0, 60), ids };
};

// ---------- normalizing ----------
const firstAppFrame = (stack) => {
  const lines = String(stack || '').split('\n').slice(1);
  for (const line of lines) {
    const m = line.match(/at\s+(?:async\s+)?([\w$.<>]+)\s+\(/);
    if (m && !/^(Object\.|Array\.|Promise\.|fetchWithAuth|parseJsonOrThrow|fetchJsonWithRetry|retryTransient|ApiError)/.test(m[1]) && !/node_modules/.test(line)) return m[1];
  }
  return '';
};

export const buildReport = (err, ctx = {}) => {
  const e = err || {};
  const isApi = Boolean(e.method || e.status || e.url);
  const method = e.method || ctx.method || '';
  const url = e.url ? scrubUrl(e.url) : '';
  const ids = { ...(e.requestIds || {}), ...(ctx.ids || {}) };
  const action = ctx.action || (isApi ? describeRequest(method, url, ids) : 'Using the app');
  let responseBody = '';
  if (e.body !== undefined && e.body !== null) {
    try { responseBody = typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2); } catch (x) { responseBody = String(e.body); }
  }
  return {
    timestamp: new Date().toISOString(),
    title: ctx.title || 'Something went wrong',
    action,
    userMessage: ctx.userMessage || '',
    name: scrub(e.name || 'Error'),
    message: scrub(e.message || (typeof err === 'string' ? err : 'Unknown error')),
    status: e.status || null,
    statusText: e.statusText || '',
    method: method ? String(method).toUpperCase() : '',
    url,
    responseBody: scrub(responseBody).slice(0, MAX_BODY_CHARS),
    payloadKeys: e.payloadKeys || [],
    handler: ctx.handler || firstAppFrame(e.stack) || '',
    source: ctx.source || '',
    schoolId: schoolId(),
    ids,
    user: `${context.userId || 'unknown'} (${context.role || 'unknown'})`,
    page: typeof window !== 'undefined' ? scrubUrl(window.location.pathname + window.location.search) : '',
    stack: scrub(e.stack || ''),
    attempts: e.attempts || null
  };
};

export const reportToText = (r) => {
  const lines = [
    'InsightED eSF7 - Error Report',
    `Time: ${r.timestamp}`,
    `What was happening: ${r.action}`,
    r.userMessage ? `Message shown to user: ${r.userMessage}` : null,
    `Error: ${r.name}: ${r.message}`,
    r.status ? `HTTP status: ${r.status}${r.statusText ? ' ' + r.statusText : ''}` : null,
    r.url ? `Request: ${r.method || 'GET'} ${r.url}` : null,
    r.payloadKeys.length ? `Payload fields sent: ${r.payloadKeys.join(', ')}` : null,
    r.responseBody ? `Server response:\n${r.responseBody}` : null,
    r.handler ? `Handler / function: ${r.handler}` : null,
    r.source ? `Source: ${r.source}` : null,
    `School ID: ${r.schoolId}`,
    Object.keys(r.ids).length ? `Record ids: ${Object.entries(r.ids).map(([k, v]) => `${k}=${v}`).join(', ')}` : null,
    `User: ${r.user}`,
    `Page: ${r.page}`,
    `App mode: ${(() => { try { return import.meta.env.VITE_APP_VERSION || import.meta.env.MODE; } catch (e) { return 'unknown'; } })()}`,
    '',
    'Stack trace:',
    r.stack || '(none)'
  ];
  return lines.filter((l) => l !== null).join('\n');
};

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const detailsHtml = (r) => {
  const row = (k, v) => (v ? `<div><strong>${esc(k)}:</strong> ${esc(v)}</div>` : '');
  const stackBlock = r.stack
    ? (isDev()
      ? `<div style="margin-top:6px"><strong>Stack trace:</strong><pre style="${PRE}">${esc(r.stack)}</pre></div>`
      : `<details style="margin-top:6px"><summary style="cursor:pointer">Stack trace</summary><pre style="${PRE}">${esc(r.stack)}</pre></details>`)
    : '';
  return `<div style="text-align:left;font-size:12px;line-height:1.55;max-height:260px;overflow:auto;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;font-family:ui-monospace,Consolas,monospace;word-break:break-word">`
    + row('Error', `${r.name}: ${r.message}`)
    + row('HTTP status', r.status ? `${r.status}${r.statusText ? ' ' + r.statusText : ''}` : '')
    + row('Request', r.url ? `${r.method || 'GET'} ${r.url}` : '')
    + row('Payload fields', r.payloadKeys.join(', '))
    + (r.responseBody ? `<div><strong>Server response:</strong><pre style="${PRE}">${esc(r.responseBody)}</pre></div>` : '')
    + row('Handler', r.handler)
    + row('Source', r.source)
    + row('School ID', r.schoolId)
    + row('Record ids', Object.entries(r.ids).map(([k, v]) => `${k}=${v}`).join(', '))
    + row('Time', r.timestamp)
    + stackBlock
    + '</div>';
};
const PRE = 'margin:4px 0 0;white-space:pre-wrap;font-size:11px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:6px;max-height:140px;overflow:auto';

/** Short HTML for the unsaved-changes dialog's validation line - same facts, same wording. */
export const inlineDetailsHtml = (err) => {
  const r = buildReport(err, {});
  const parts = [];
  if (r.status || r.url) parts.push(`${r.status ? 'HTTP ' + r.status : ''} ${r.method ? r.method + ' ' : ''}${r.url}`.trim());
  const bodyMsg = (() => { try { const b = typeof err.body === 'string' ? JSON.parse(err.body) : err.body; return b && (b.error || b.message); } catch (e) { return ''; } })();
  if (bodyMsg) parts.push(`Server said: ${bodyMsg}`);
  if (r.handler) parts.push(`In: ${r.handler}`);
  parts.push(`School ${r.schoolId}${Object.keys(r.ids).length ? ', ' + Object.entries(r.ids).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ') : ''} - ${r.timestamp}`);
  return parts.map(esc).join('<br>');
};

// ---------- filtering, dedupe, queue ----------
const isAbort = (err) => Boolean(err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || '')) && !err.status));
const isNoise = (message) => /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection captured/i.test(String(message || ''));

const signatureOf = (r) => `${r.method}|${r.url.replace(/\?.*$/, '')}|${r.status}|${r.message}`.slice(0, 300);

const queue = [];
const recent = new Map(); // signature -> { at, count }
let showing = false;

const pump = async () => {
  if (showing || queue.length === 0) return;
  showing = true;
  const item = queue.shift();
  try {
    const [{ default: Swal }] = await Promise.all([import('sweetalert2'), import('sweetalert2/dist/sweetalert2.min.css')]);
    const more = queue.length;
    const repeats = item.count > 1 ? `<div style="font-size:12px;color:#B45309;margin-top:6px">This happened ${item.count} times.</div>` : '';
    const waiting = more > 0 ? `<div style="font-size:12px;color:#B45309;margin-top:6px">${more} more error${more === 1 ? '' : 's'} waiting after this one.</div>` : '';
    const sub = item.report.userMessage ? `<div style="margin-top:4px;color:#475569">${esc(item.report.userMessage)}</div>` : '';
    await Swal.fire({
      title: item.report.title,
      icon: 'error',
      iconColor: '#DC2626',
      html: `<div style="text-align:left;font-size:14px;color:#0F172A"><strong>${esc(item.report.action)}</strong> did not complete.${sub}${repeats}${waiting}</div><div style="margin-top:12px">${detailsHtml(item.report)}</div>`,
      width: 640,
      confirmButtonText: 'Close',
      confirmButtonColor: '#2563EB',
      showDenyButton: true,
      denyButtonText: 'Copy details',
      denyButtonColor: '#15803D',
      reverseButtons: true,
      allowOutsideClick: false, // stays until the user dismisses it
      preDeny: async () => {
        const ok = await copyText(reportToText(item.report));
        const btn = Swal.getDenyButton();
        if (btn) btn.textContent = ok ? 'Copied ✓' : 'Copy failed - select the text above';
        return false; // keep the dialog open
      },
      customClass: {
        popup: 'insighted-swal-modal',
        title: 'insighted-swal-title',
        htmlContainer: 'insighted-swal-text',
        confirmButton: 'insighted-swal-stay-btn',
        denyButton: 'insighted-swal-save-btn'
      }
    });
  } catch (swalErr) {
    console.error('[errorAlert] Could not open the error dialog:', swalErr, reportToText(item.report));
  } finally {
    showing = false;
    item.resolve();
    pump();
  }
};

const copyText = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
};

/**
 * Show the shared error dialog. Safe to call from any catch block; never throws; resolves when the user closes it.
 * @param {any} err
 * @param {{ action?: string, handler?: string, ids?: Record<string,string>, title?: string, userMessage?: string,
 *           source?: string, expectedStatuses?: number[], silent?: boolean }} [ctx]
 */
export const reportError = (err, ctx = {}) => {
  try {
    if (ctx.silent || isAbort(err)) return Promise.resolve();
    const status = err && err.status;
    if (status && (ctx.expectedStatuses || []).includes(status)) return Promise.resolve();
    if (err && typeof err === 'object') {
      if (err.__reported) return Promise.resolve();
      try { Object.defineProperty(err, '__reported', { value: true, configurable: true }); } catch (e) { /* frozen */ }
      cancelPending(err);
    }
    const report = buildReport(err, ctx);
    if (isNoise(report.message)) return Promise.resolve();
    console.error(`[ErrorAlert] ${report.action}:`, err);

    const sig = signatureOf(report);
    const now = Date.now();
    const seen = recent.get(sig);
    if (seen && now - seen.at < DEDUPE_WINDOW_MS) {
      seen.count += 1;
      seen.at = now;
      if (seen.item) seen.item.count = seen.count; // update the count shown if still queued / showing
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const item = { report, count: 1, resolve };
      recent.set(sig, { at: now, count: 1, item });
      queue.push(item);
      pump();
    });
  } catch (e) {
    console.error('[errorAlert] reporter failed:', e, err);
    return Promise.resolve();
  }
};

// ---------- API failures nobody claimed ----------
const pending = new Map(); // key -> { err, timer, at }
const keyOf = (err) => `${err.method || ''} ${String(err.url || '').replace(/\?.*$/, '')}`;

function cancelPending(err) {
  for (const [k, v] of pending) if (v.err === err) { clearTimeout(v.timer); pending.delete(k); }
}

/** A later success of the same request (e.g. a retry) means the earlier failure no longer matters. */
export const noteApiSuccess = (method, url) => {
  const k = `${String(method || 'GET').toUpperCase()} ${String(url || '').replace(/\?.*$/, '')}`;
  const p = pending.get(k);
  if (p) { clearTimeout(p.timer); pending.delete(k); }
};

/** api.js calls this for each failed request. Reported after a grace period unless something handled it. */
export const noteApiError = (err) => {
  try {
    if (!err || isAbort(err)) return;
    if (err.status === 401 || err.status === 404) return; // session handling / "not found" is usually handled on purpose
    const k = keyOf(err);
    const old = pending.get(k);
    if (old) clearTimeout(old.timer);
    const timer = setTimeout(() => {
      pending.delete(k);
      if (!err.__reported) reportError(err, { source: 'API request failed and nothing handled it' });
    }, UNCLAIMED_GRACE_MS);
    pending.set(k, { err, timer, at: Date.now() });
  } catch (e) { /* never break a request because of reporting */ }
};

/** A catch block that deals with the failure itself (shows its own message on purpose) calls this. */
export const markErrorHandled = (err) => {
  if (err && typeof err === 'object') {
    try { Object.defineProperty(err, '__reported', { value: true, configurable: true }); } catch (e) { /* frozen */ }
    cancelPending(err);
  }
};

/** The newest API failure from the last few seconds that has not been shown yet (and claims it), or null. */
export const takeRecentApiError = (windowMs = RECENT_WINDOW_MS) => {
  let best = null;
  for (const v of pending.values()) if (!best || v.at > best.at) best = v;
  if (!best || Date.now() - best.at > windowMs || best.err.__reported) return null;
  markErrorHandled(best.err);
  return best.err;
};

setExternalDraftReporter((err, ctx) => reportError(err, ctx));

// ---------- global handlers ----------
let installed = false;
export const installGlobalErrorHandlers = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const err = reason instanceof Error ? reason : Object.assign(new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection'), { body: typeof reason === 'object' ? reason : undefined });
    reportError(err, { source: 'Unhandled promise rejection' });
  });
  window.addEventListener('error', (ev) => {
    // Resource load failures (img/script tags) have no ev.error and are not app bugs.
    if (!ev.error && (!ev.message || isNoise(ev.message))) return;
    const err = ev.error instanceof Error ? ev.error : new Error(ev.message || 'Uncaught error');
    reportError(err, { source: `Uncaught error${ev.filename ? ` (${scrubUrl(ev.filename)}:${ev.lineno})` : ''}` });
  });
};
