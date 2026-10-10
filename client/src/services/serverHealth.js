// App-wide server health lock. The lock is decided ONLY by the dedicated readiness check (GET /api/health), never by
// an ordinary API request failing:
//  - the central fetch layer (api.js) reports 502/503/504 and network failures here as a hint;
//  - a hint only starts a short series of readiness probes with backoff (0.5s, 1s between them);
//  - the app locks only when PROBE_FAILURES_TO_LOCK consecutive readiness probes fail. One failed request, or a
//    request that failed while readiness answers fine, never locks. 4xx (including 401/403) never even count as hints.
// Once locked it polls readiness with backoff and unlocks only after several consecutive healthy checks. State is shared across tabs.

const PROBE_FAILURES_TO_LOCK = 3; // consecutive failed readiness probes needed to lock
const PROBE_BACKOFF_MS = 500; // probe delay doubles: 0.5s, 1s
const REQUIRED_HEALTHY_CHECKS = 3; // consecutive OK checks needed to unlock
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
const HEALTH_TIMEOUT_MS = 5000;
const CHANNEL_NAME = "insighted-server-health";
const LOCK_KEY = "insighted_server_locked";
const UNSYNCED_KEY = "insighted_unsynced_draft";

let healthUrl = "/api/health/readiness";
let state = {
  locked: false,
  recovering: false,
  backOnline: false,
  lastChecked: null,
  nextCheckAt: null,
  healthyStreak: 0,
  failureCount: 0, // failed API requests reported since the last success (shown in the error report)
  lastError: null, // { name, message, stack, url, status }
};
let probing = false;
let pendingError = null;
let pollTimer = null;
let attempt = 0;
let checking = false;
let follower = false; // true when the lock came from another tab: that tab runs the recovery steps
let channel = null;
const listeners = new Set();
const lockHandlers = new Set();
const recoveryHandlers = new Set();
let waiters = [];

const emit = () =>
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {}
  });
const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

export const configureHealth = ({ url }) => {
  if (url) healthUrl = url;
};
export const subscribeHealth = (fn) => {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
};
export const getHealthState = () => state;
export const isServerLocked = () => state.locked;

// Handlers run the moment the lock trips (persist state, abort in-flight saves).
export const onServerLock = (fn) => {
  lockHandlers.add(fn);
  return () => lockHandlers.delete(fn);
};
// Handlers run (in registration order, awaited) after the server is healthy but before the lock is released.
export const onServerRecover = (fn) => {
  recoveryHandlers.add(fn);
  return () => recoveryHandlers.delete(fn);
};

// ---- unsynced-data flag (drives beforeunload + "offer to sync on next load") ----
export const markUnsynced = () => {
  try {
    localStorage.setItem(UNSYNCED_KEY, String(Date.now()));
  } catch (e) {}
};
export const markSynced = () => {
  try {
    localStorage.removeItem(UNSYNCED_KEY);
  } catch (e) {}
};
export const hasUnsynced = () => {
  try {
    return !!localStorage.getItem(UNSYNCED_KEY);
  } catch (e) {
    return false;
  }
};

// ---- cross-tab sync ----
const broadcast = (type) => {
  try {
    if (channel) channel.postMessage({ type });
  } catch (e) {}
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ type, t: Date.now() }));
  } catch (e) {}
};

const initChannel = () => {
  if (typeof window === "undefined") return;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e) => handleRemote(e.data && e.data.type);
    }
  } catch (e) {}
  window.addEventListener("storage", (e) => {
    if (e.key !== LOCK_KEY || !e.newValue) return;
    try {
      handleRemote(JSON.parse(e.newValue).type);
    } catch (err) {}
  });
};

function handleRemote(type) {
  if (type === "lock" && !state.locked) enterLock(null, { fromRemote: true });
  if (type === "unlock" && state.locked) releaseLock({ fromRemote: true });
}

// ---- pause: new API calls wait here while locked ----
// During the recovery phase the server has already passed several health checks and the UI is still covered by the
// modal, so requests are allowed through: the draft re-sync itself (and any call that was paused) must be able to run
// BEFORE the lock is released. Pausing them here would deadlock recovery against its own requests.
export const waitUntilHealthy = () =>
  state.locked && !state.recovering
    ? new Promise((resolve) => {
        waiters.push(resolve);
      })
    : Promise.resolve();

function flushWaiters() {
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve());
}

// ---- failure / success reporting from the fetch layer ----
export const isServerFailureStatus = (status) =>
  status === 502 || status === 503 || status === 504;

// A failed request is only a hint. It never locks by itself: it triggers readiness probes, and those decide.
export const recordServerFailure = (error) => {
  if (state.locked) return;
  pendingError = error || pendingError;
  setState({ failureCount: state.failureCount + 1 });
  if (!probing) {
    probing = true;
    runProbes().catch(() => {
      probing = false;
    });
  }
};

export const recordServerSuccess = () => {
  if (state.failureCount) setState({ failureCount: 0 });
};

async function runProbes() {
  let failures = 0;
  while (!state.locked) {
    const ok = await runHealthCheck();
    if (ok) {
      probing = false;
      pendingError = null;
      setState({ failureCount: 0 });
      return;
    }
    failures += 1;
    if (failures >= PROBE_FAILURES_TO_LOCK) {
      probing = false;
      enterLock(
        pendingError || {
          name: "ServerUnavailable",
          message: "The server readiness check failed repeatedly.",
        },
      );
      return;
    }
    await new Promise((r) =>
      setTimeout(r, PROBE_BACKOFF_MS * 2 ** (failures - 1)),
    );
  }
  probing = false;
}

function enterLock(error, { fromRemote = false } = {}) {
  if (state.locked) return;
  markUnsynced();
  attempt = 0;
  follower = fromRemote;
  setState({
    locked: true,
    recovering: false,
    backOnline: false,
    healthyStreak: 0,
    lastError: error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          url: error.url,
          status: error.status,
        }
      : state.lastError,
  });
  lockHandlers.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("[ServerHealth] lock handler failed", e);
    }
  });
  if (!fromRemote) {
    broadcast("lock");
    schedulePoll(0); // first check right away; backoff applies if it fails
  } else {
    // Another tab owns polling; this tab only follows its lock/unlock.
    schedulePoll(60000);
  }
}

function releaseLock({ fromRemote = false } = {}) {
  clearTimeout(pollTimer);
  pendingError = null;
  setState({
    failureCount: 0,
    locked: false,
    recovering: false,
    backOnline: true,
    nextCheckAt: null,
    healthyStreak: 0,
  });
  flushWaiters();
  if (!fromRemote) broadcast("unlock");
  setTimeout(() => setState({ backOnline: false }), 3000);
}

// ---- health polling ----
async function runHealthCheck() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    // Raw fetch on purpose: must bypass the lock/pause in fetchWithAuth.
    const res = await fetch(
      `${healthUrl}${healthUrl.includes("?") ? "&" : "?"}_=${Date.now()}`,
      { cache: "no-store", signal: ctrl.signal },
    );
    if (!res.ok) return false;
    const type = res.headers.get("content-type") || "";
    return type.includes("application/json");
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  setState({ nextCheckAt: Date.now() + delay });
  pollTimer = setTimeout(checkNow, delay);
}

// Manual "Retry now" uses this too; it only re-runs the health check.
export async function checkNow() {
  if (!state.locked || checking || state.recovering) return;
  checking = true;
  clearTimeout(pollTimer);
  const ok = await runHealthCheck();
  checking = false;
  if (!state.locked) return;
  const healthyStreak = ok ? state.healthyStreak + 1 : 0;
  setState({ lastChecked: Date.now(), healthyStreak });

  if (!ok) {
    attempt += 1;
    schedulePoll(
      Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempt, 5)),
    );
    return;
  }
  if (healthyStreak < REQUIRED_HEALTHY_CHECKS) {
    schedulePoll(1000); // confirm quickly before unlocking
    return;
  }
  // Healthy: re-sync drafts and refetch before releasing the lock.
  setState({ recovering: true, nextCheckAt: null });
  flushWaiters(); // requests paused while locked may now run (see waitUntilHealthy)
  let failed = false;
  for (const fn of follower ? [] : recoveryHandlers) {
    try {
      await fn();
    } catch (e) {
      console.error("[ServerHealth] recovery step failed", e);
      failed = true;
    }
  }
  if (failed) {
    // Server answered health checks but real work still fails: stay locked and keep trying.
    attempt += 1;
    setState({ recovering: false, healthyStreak: 0 });
    schedulePoll(
      Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempt, 5)),
    );
    return;
  }
  releaseLock();
}

// Warn before closing the tab while unsynced data exists.
if (typeof window !== "undefined") {
  initChannel();
  window.addEventListener("beforeunload", (e) => {
    if (state.locked || hasUnsynced()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  // A tab opened while another tab is already locked starts locked too.
  try {
    const existing = JSON.parse(localStorage.getItem(LOCK_KEY) || "null");
    if (
      existing &&
      existing.type === "lock" &&
      Date.now() - existing.t < 5 * 60 * 1000
    ) {
      setTimeout(() => {
        handleRemote("lock");
        schedulePoll(0);
      }, 0);
    }
  } catch (e) {}
}
