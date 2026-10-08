// Session expiry (HTTP 401 on an authenticated call, e.g. after the server's JWT_SECRET was rotated or the token expired).
// This is NOT a server failure: it never trips the server-health lock or its modal. The registered handlers protect
// local work and send the user to the login screen. Nothing here deletes drafts, localStorage or IndexedDB data.
let expired = false;
/** @type {Set<(info: { url?: string }) => void | Promise<void>>} */
const handlers = new Set();

/** @param {(info: { url?: string }) => void | Promise<void>} fn */
export const onSessionExpired = (fn) => { handlers.add(fn); return () => handlers.delete(fn); };
export const isSessionExpired = () => expired;
export const clearSessionExpired = () => { expired = false; };

/** Called by the API layer when an authenticated request is answered with 401. Idempotent until the next login. */
export const reportUnauthorized = (info = {}) => {
  if (expired) return;
  expired = true;
  handlers.forEach((fn) => {
    try { Promise.resolve(fn(info)).catch((e) => console.warn('[Session] expiry handler failed:', e && e.message)); } catch (e) { console.warn('[Session] expiry handler failed:', e && e.message); }
  });
};

export const __resetSessionForTests = () => { expired = false; handlers.clear(); };
