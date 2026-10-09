// Authentication and school authorization for every route that reads or writes school data.
//  - 401: no token, malformed token, forged/expired token.
//  - 403: valid token, but the user may not access the school the request is about.
// The school a request acts on is derived from the VERIFIED token (or, for division/region/admin roles,
// from a server-side lookup), never from the client-supplied x-school-id header.
const jwt = require("jsonwebtoken");
// One-line audit record for every refused request (never the token itself): lets operators find who tried what.
const denyLog = (req, code, claims, extra = "") =>
  console.warn(
    `[AuthGate][DENY ${code}] method=${req.method} path=${req.originalUrl ? String(req.originalUrl).split("?")[0] : req.path} uid=${(claims && claims.uid) || "-"} role=${(claims && claims.role) || "-"} ${extra}`.trim(),
  );
const { getJwtSecret } = require("../utils/jwtSecret");

const ADMIN_ROLES = new Set(["admin", "super admin"]);
const SCOPED_ROLES = new Set([
  "school division office",
  "regional division office",
]);

const cleanId = (v) => String(v).replace(/^SCH-/i, "").trim();
const SCHOOL_ID_SEGMENT = /^(?:SCH-)?\d{6}$/i;
// Mounts whose URL path carries a school id (e.g. /reports/esf7/:schoolId).
const PATH_SCHOOL_MOUNTS =
  /^\/(school|schools|reports|validation|esf7-validation|esf7-upload|dev|dashboard)(\/|$)/i;

// Routes that must stay reachable without a login.
const PUBLIC_PREFIXES = [
  "/health",
  "/auth",
  "/room-profiling",
  "/salary-matrix",
];

function isPublicPath(p) {
  return PUBLIC_PREFIXES.some((pre) => p === pre || p.startsWith(pre + "/"));
}

function extractToken(req) {
  const h =
    req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!h) return null;
  const parts = String(h).split(" ");
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) return null;
  return parts[1] || null;
}

/** Verifies the token. Returns the decoded claims, or null when missing/invalid/expired. Never falls back to jwt.decode. */
function verifyRequestToken(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
  } catch (_e) {
    return null;
  }
}

/** The school this user belongs to, from verified claims only. */
function tokenSchoolId(claims) {
  const direct =
    claims.school_id ||
    claims.schoolId ||
    (claims.user && (claims.user.school_id || claims.user.schoolId));
  if (direct) return cleanId(direct);
  const uid = String(claims.uid || "");
  if (uid.startsWith("divtest-")) return cleanId(uid.replace("divtest-", ""));
  if (uid.startsWith("pilot-")) return cleanId(uid.replace("pilot-", ""));
  return null;
}

/** Every school id the client claims this request is about (query, body, header, school-carrying URL paths). */
function claimedSchoolIds(req) {
  const out = new Set();
  const add = (v) => {
    if (v !== undefined && v !== null && String(v).trim() !== "")
      out.add(cleanId(v));
  };
  const q = req.query || {};
  add(q.school_id);
  add(q.schoolId);
  add(q.schoolID);
  const b = req.body && typeof req.body === "object" ? req.body : {};
  add(b.school_id);
  add(b.schoolId);
  add(b.schoolID);
  if (b.school && typeof b.school === "object") {
    add(b.school.schoolId);
    add(b.school.school_id);
  }
  if (b.schoolHead && typeof b.schoolHead === "object") {
    add(b.schoolHead.school_id);
    add(b.schoolHead.schoolId);
  }
  if (b.payload && b.payload.schoolInfo) {
    add(b.payload.schoolInfo.schoolId);
    add(b.payload.schoolInfo.school_id);
  }
  add(req.headers && req.headers["x-school-id"]);
  if (PATH_SCHOOL_MOUNTS.test(req.path || "")) {
    for (const seg of String(req.path).split("/"))
      if (SCHOOL_ID_SEGMENT.test(seg)) add(seg);
  }
  return out;
}

// division/region scope lookups (cached briefly) for School/Regional Division Office accounts.
const scopeCache = new Map();
const SCOPE_TTL_MS = 5 * 60 * 1000;
async function cachedLookup(key, fn) {
  const hit = scopeCache.get(key);
  if (hit && Date.now() - hit.at < SCOPE_TTL_MS) return hit.value;
  const value = await fn();
  scopeCache.set(key, { at: Date.now(), value });
  return value;
}

async function officeCanAccessSchool(claims, role, schoolId) {
  try {
    const db = require("../db");
    const userRows = await cachedLookup(`u:${claims.uid}`, async () => {
      for (const pool of [db.usersDatabasePool, db.insightEdPool]) {
        try {
          const r = await pool.query(
            "SELECT division, region FROM user_schoolhead WHERE uid = $1",
            [claims.uid],
          );
          if (r.rows[0]) return r.rows[0];
        } catch (_e) {
          /* try next source */
        }
      }
      try {
        const r = await db.insightEdPool.query(
          "SELECT division, region FROM users WHERE uid = $1",
          [claims.uid],
        );
        return r.rows[0] || null;
      } catch (_e) {
        return null;
      }
    });
    if (!userRows) return false;
    const school = await cachedLookup(`s:${schoolId}`, async () => {
      const r = await db.insightEdPool.query(
        "SELECT division, region FROM schools WHERE school_id = $1 LIMIT 1",
        [schoolId],
      );
      return r.rows[0] || null;
    });
    if (!school) return false;
    const same = (a, b) =>
      a &&
      b &&
      String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    return role === "regional division office"
      ? same(userRows.region, school.region)
      : same(userRows.division, school.division);
  } catch (_e) {
    return false; // when in doubt, deny
  }
}

/** Express middleware: verify token, then verify every claimed school id is one this user may access. */
async function requireAuth(req, res, next) {
  const claims = verifyRequestToken(req);
  if (!claims) {
    denyLog(req, 401, null);
    return res
      .status(401)
      .json({ error: "Authentication required: missing or invalid token." });
  }

  const role = String(claims.role || "")
    .trim()
    .toLowerCase();
  const own = tokenSchoolId(claims);
  const claimed = claimedSchoolIds(req);
  req.auth = { claims, uid: claims.uid, role: claims.role, schoolId: own };

  if (ADMIN_ROLES.has(role)) return next();

  if (SCOPED_ROLES.has(role)) {
    for (const id of claimed) {
      if (id === own) continue;
      if (!(await officeCanAccessSchool(claims, role, id))) {
        denyLog(
          req,
          403,
          claims,
          `tokenSchool=${own || "-"} claimed=${[...claimed].join(",")}`,
        );
        return res
          .status(403)
          .json({ error: "You do not have access to this school." });
      }
    }
    return next();
  }

  // Everyone else (school heads, personnel, ...) can act only on their own school.
  if (!own) {
    if (claimed.size > 0) {
      denyLog(
        req,
        403,
        claims,
        `tokenSchool=${own || "-"} claimed=${[...claimed].join(",")}`,
      );
      return res
        .status(403)
        .json({ error: "You do not have access to this school." });
    }
    return next();
  }
  for (const id of claimed) {
    if (id !== own) {
      denyLog(
        req,
        403,
        claims,
        `tokenSchool=${own || "-"} claimed=${[...claimed].join(",")}`,
      );
      return res
        .status(403)
        .json({ error: "You do not have access to this school." });
    }
  }
  // Downstream code reads the header; make it the verified value so hard-coded fallbacks are never reached.
  req.headers["x-school-id"] = own;
  return next();
}

/** App-level gate for /api: public paths pass, everything else needs requireAuth. */
function apiAuthGate(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (isPublicPath(req.path || "")) return next();
  return requireAuth(req, res, next);
}

module.exports = {
  requireAuth,
  apiAuthGate,
  verifyRequestToken,
  tokenSchoolId,
  claimedSchoolIds,
  isPublicPath,
};
