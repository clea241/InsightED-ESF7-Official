// Session expiry (HTTP 401 on an authenticated call, e.g. after the server's JWT_SECRET was rotated or the token expired).
// This is NOT a server failure: it never trips the server-health lock or its modal. The registered handlers protect
// local work and send the user to the login screen. Nothing here deletes drafts, localStorage or IndexedDB data.
let expired = false;
/** @type {Set<(info: { url?: string }) => void | Promise<void>>} */
const handlers = new Set();

/** @param {(info: { url?: string }) => void | Promise<void>} fn */
export const onSessionExpired = (fn) => {
  handlers.add(fn);
  return () => handlers.delete(fn);
};
export const isSessionExpired = () => expired;
export const clearSessionExpired = () => {
  expired = false;
};

/** Called by the API layer when an authenticated request is answered with 401. Idempotent until the next login. */
export const reportUnauthorized = (info = {}) => {
  if (expired) return;
  expired = true;
  handlers.forEach((fn) => {
    try {
      Promise.resolve(fn(info)).catch((e) =>
        console.warn("[Session] expiry handler failed:", e && e.message),
      );
    } catch (e) {
      console.warn("[Session] expiry handler failed:", e && e.message);
    }
  });
};

export const __resetSessionForTests = () => {
  expired = false;
  handlers.clear();
};

// ---- The single authoritative school id ----
// Every API call takes its school from the logged-in session (the token payload; the server verifies the signature),
// never from component state that may be stale (a previous login, a placeholder default, a closure captured before
// the school loaded). Roles that legitimately work on other schools (Admin, Super Admin, SDO, RDO) may pass an
// explicit school. Any other account that asks for a different school gets its own school instead, and the mismatch is
// recorded so it can be reported (see getSchoolIdMismatches).
const MULTI_SCHOOL_ROLES = new Set([
  "admin",
  "super admin",
  "school division office",
  "regional division office",
]);
const clean = (v) =>
  v === undefined || v === null ? "" : String(v).replace(/^SCH-/i, "").trim();

function tokenClaims() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
  } catch (e) {
    return null;
  }
}

/** The school of the logged-in session, or '' when the token has none (e.g. some office accounts). */
export function getSessionSchoolId() {
  const c = tokenClaims();
  const fromToken =
    c &&
    (c.school_id ||
      c.schoolId ||
      (c.user && (c.user.school_id || c.user.schoolId)));
  if (fromToken) return clean(fromToken);
  if (c && typeof c.uid === "string") {
    const m = /^(?:divtest|pilot)-(.+)$/.exec(c.uid);
    if (m) return clean(m[1]);
  }
  return "";
}

const mismatches = [];
export const getSchoolIdMismatches = () => mismatches.slice();

/** @param {unknown} [explicit] a school id a caller wants to use @returns {string} the school id to send */
export function resolveSchoolId(explicit) {
  const claims = tokenClaims();
  const own = getSessionSchoolId();
  const wanted = clean(explicit);
  const role = String((claims && claims.role) || "").toLowerCase();
  if (own) {
    if (wanted && wanted !== own && !MULTI_SCHOOL_ROLES.has(role)) {
      mismatches.push({
        at: new Date().toISOString(),
        sessionSchoolId: own,
        requestedSchoolId: wanted,
      });
      if (mismatches.length > 50) mismatches.shift();
      console.warn(
        `[SchoolId] a call asked for school ${wanted} but the session belongs to ${own}; using ${own}`,
      );
      return own;
    }
    return wanted || own;
  }
  // No school in the token: a multi-school/office account (explicit allowed) or no session at all.
  return wanted || clean(localStorage.getItem("activeSchoolId")) || "";
}
