// Single place that sends the cloud draft. Guarantees:
//  - one request in flight at a time (no aborting a save that may already be committing server-side),
//  - the newest state always wins: while a save is in flight only the latest snapshot is kept for the next send,
//  - every save carries the server version it was based on, so a newer server copy is never overwritten silently,
//  - "saved" is only reported after the server confirms the database write.
import { markUnsynced, markSynced } from './serverHealth.js';

const RETRY_DELAY_MS = 10000;
const VERSION_PREFIX = 'insighted_draft_version_';

export class DraftConflictError extends Error {
  /**
   * @param {string} message
   * @param {{ currentVersion?: number, key?: string }} [details]
   */
  constructor(message, { currentVersion, key } = {}) {
    super(message);
    this.name = 'DraftConflictError';
    this.currentVersion = currentVersion;
    this.key = key;
  }
}

let status = 'idle'; // idle | saving | saved | failed | conflict
let lastError = null;
let lastSavedAt = null;
let generation = 0;       // bumps on every local change
let savedGeneration = 0;  // generation covered by the last confirmed save
let pending = null;       // newest snapshot waiting to be sent
let runner = null;
let retryTimer = null;
let snapshotProvider = null;
let transport = null;
let authPaused = false; // session expired (401): keep everything queued, send nothing until the user logs in again
const listeners = new Set();

const emit = () => listeners.forEach((fn) => { try { fn(getDraftSaveState()); } catch (e) {} });
/** @param {string} next @param {Error | null} [err] */
const setStatus = (next, err = null) => { status = next; lastError = err; emit(); };

export const getDraftSaveState = () => ({ status, lastError, lastSavedAt, dirty: generation !== savedGeneration });
export const subscribeDraftSave = (fn) => { listeners.add(fn); fn(getDraftSaveState()); return () => listeners.delete(fn); };

const keyOf = (schoolId, schoolYear) => `${String(schoolId).replace(/^SCH-/i, '')}_${schoolYear}`;

// The version each save is based on lives in memory PER TAB. localStorage (shared by all tabs of a browser) only
// remembers it for the next page load; using it as the save base would let a second tab overwrite the first tab's work.
const bases = new Map();

export const getSyncedVersion = (schoolId, schoolYear) => {
  try {
    const v = localStorage.getItem(VERSION_PREFIX + keyOf(schoolId, schoolYear));
    return v === null ? null : Number(v);
  } catch (e) { return null; }
};
export const setSyncedVersion = (schoolId, schoolYear, version) => {
  if (typeof version !== 'number' || !Number.isFinite(version)) return;
  bases.set(keyOf(schoolId, schoolYear), version);
  try { localStorage.setItem(VERSION_PREFIX + keyOf(schoolId, schoolYear), String(version)); } catch (e) {}
};

// The transport (api.saveSchoolDraft) is injected by api.js, which keeps this module free of browser-only imports and testable.
export const configureDraftSaver = ({ send }) => { transport = send; };

// The app registers how to get the current full draft (and persist it locally) so flush() can save the newest state.
export const registerSnapshotProvider = (fn) => { snapshotProvider = fn; };

// Call on every local change (not debounced).
export const markDraftDirty = () => {
  generation += 1;
  markUnsynced();
};

const sendOnce = async (job) => {
  const { schoolId, schoolYear, payload, gen } = job;
  const baseKey = keyOf(schoolId, schoolYear);
  const baseVersion = bases.has(baseKey) ? bases.get(baseKey) : getSyncedVersion(schoolId, schoolYear);
  setStatus('saving');
  console.info(`[DraftSave] attempt school=${schoolId} year=${schoolYear} base=${baseVersion} gen=${gen}`);
  try {
    if (!transport) throw new Error('Draft saver is not configured');
    const res = await transport(schoolYear, payload, baseVersion);
    if (res && res.conflict) {
      throw new DraftConflictError('The draft was changed by another session.', { currentVersion: res.currentVersion, key: keyOf(schoolId, schoolYear) });
    }
    if (!res || res.success !== true) {
      throw new Error((res && res.error) || 'Server did not confirm the save');
    }
    setSyncedVersion(schoolId, schoolYear, res.version);
    savedGeneration = Math.max(savedGeneration, gen);
    lastSavedAt = Date.now();
    if (generation === savedGeneration && !pending) markSynced();
    console.info(`[DraftSave] success school=${schoolId} year=${schoolYear} version=${res.version}`);
    setStatus(generation === savedGeneration && !pending ? 'saved' : 'saving');
  } catch (err) {
    if (err instanceof DraftConflictError) {
      console.warn(`[DraftSave] version conflict school=${schoolId} year=${schoolYear} base=${baseVersion} current=${err.currentVersion}`);
      setStatus('conflict', err);
    } else {
      console.warn(`[DraftSave] failure school=${schoolId} year=${schoolYear}: ${err.message}`);
      setStatus('failed', err);
      // A 401 will not fix itself: the snapshot stays queued and is replayed after the next login (resumeAfterLogin).
      if (/** @type {any} */ (err).status === 401) authPaused = true;
      else scheduleRetry();
    }
    throw err;
  }
};

const scheduleRetry = () => {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { drain().catch(() => {}); }, RETRY_DELAY_MS);
};

const drain = () => {
  if (runner) return runner;
  if (authPaused) return Promise.resolve();
  runner = (async () => {
    try {
      while (pending) {
        const job = pending;
        pending = null;
        try {
          await sendOnce(job);
        } catch (err) {
          // Keep the unsent snapshot unless a newer one has already replaced it.
          if (!pending) pending = job;
          throw err;
        }
      }
    } finally {
      runner = null;
    }
  })();
  return runner;
};

// Queue the newest snapshot and send it (after any in-flight save finishes). Resolves when it is confirmed saved.
export const saveDraft = (schoolId, schoolYear, payload) => {
  pending = { schoolId, schoolYear, payload, gen: generation };
  clearTimeout(retryTimer);
  return drain();
};

// Used by logout / unload paths: persist locally, queue the newest state, wait until the server confirms.
// Rejects if the save fails or conflicts so the caller can block the action.
export const flushDrafts = async () => {
  if (snapshotProvider && (generation !== savedGeneration || pending)) {
    const snap = await snapshotProvider();
    if (snap) pending = { schoolId: snap.schoolId, schoolYear: snap.schoolYear, payload: snap.payload, gen: generation };
  }
  if (runner) { try { await runner; } catch (e) { /* re-drained below */ } }
  if (pending) await drain();
  if (generation !== savedGeneration) {
    // A change landed during the flush: send that too.
    if (snapshotProvider) {
      const snap = await snapshotProvider();
      if (snap) pending = { schoolId: snap.schoolId, schoolYear: snap.schoolYear, payload: snap.payload, gen: generation };
      await drain();
    }
  }
};

// Session expiry (401): persist the newest state on this device and stop sending until the user logs in again.
export const pauseForAuth = async () => {
  authPaused = true;
  clearTimeout(retryTimer);
  markUnsynced();
  if (snapshotProvider) { try { await snapshotProvider(); } catch (e) { /* the debounced local save already ran, or the fallback copy exists */ } }
};
// After login: replay the queued snapshot (existing version checks apply: a newer server copy raises the conflict prompt).
// A snapshot that belongs to a different school than the account that just logged in is left on the device (IndexedDB)
// and not sent.
export const resumeAfterLogin = (schoolId) => {
  authPaused = false;
  if (pending && schoolId && keyOf(pending.schoolId, '') !== keyOf(schoolId, '')) { pending = null; return Promise.resolve(); }
  return drain().catch(() => {});
};

// Resolution helpers for a version conflict.
export const acceptServerVersion = (schoolId, schoolYear, serverVersion) => {
  setSyncedVersion(schoolId, schoolYear, serverVersion);
  setStatus('idle');
};
export const retryNow = () => drain();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (status === 'failed') drain().catch(() => {}); });
}

// Test-only: reset module state between scenarios.
export const __resetForTests = () => {
  status = 'idle'; lastError = null; lastSavedAt = null; generation = 0; savedGeneration = 0;
  pending = null; runner = null; authPaused = false; clearTimeout(retryTimer); snapshotProvider = null; bases.clear();
};
