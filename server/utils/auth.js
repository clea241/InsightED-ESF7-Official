const jwt = require('jsonwebtoken');
require('dotenv').config();
const { getJwtSecret } = require('./jwtSecret');

function isDepEdSchoolId(val) {
  if (!val) return false;
  const s = String(val).replace(/^SCH-/i, '').trim();
  if (/^\d{5,7}$/.test(s)) return true;
  if (/^900\d{3}$/.test(s) || /^800\d{3}$/.test(s) || /^199\d{3}$/.test(s)) return true;
  if (s.startsWith('divtest-') || s.startsWith('pilot-')) return true;
  return false;
}

function cleanSchoolId(val) {
  if (!val) return null;
  return String(val).replace(/^SCH-/i, '').trim();
}

function getSchoolIdFromRequest(req) {
  if (!req) return null;

  // 0. A verified token (set by middleware/auth.js) always wins over anything the client sent.
  if (req.auth && req.auth.schoolId) return req.auth.schoolId;

  // 1. Check explicit query param
  if (req.query) {
    const q = req.query.school_id || req.query.schoolId || req.query.schoolID;
    if (isDepEdSchoolId(q)) return cleanSchoolId(q);
  }

  // 2. Check explicit request body & nested payload
  if (req.body) {
    const b = req.body.school_id || req.body.schoolId || req.body.schoolID ||
              (req.body.school && (req.body.school.schoolId || req.body.school.school_id)) ||
              (req.body.schoolHead && (req.body.schoolHead.school_id || req.body.schoolHead.schoolId)) ||
              (req.body.payload && req.body.payload.schoolInfo && (req.body.payload.schoolInfo.schoolId || req.body.payload.schoolInfo.school_id));
    if (isDepEdSchoolId(b)) return cleanSchoolId(b);
  }

  // 3. Check explicit header
  if (req.headers && req.headers['x-school-id']) {
    const h = req.headers['x-school-id'];
    if (isDepEdSchoolId(h)) return cleanSchoolId(h);
  }

  // 4. Check request params
  if (req.params) {
    const p = req.params.school_id || req.params.schoolId || req.params.schoolID;
    if (isDepEdSchoolId(p)) return cleanSchoolId(p);
  }

  // 5. Check JWT authorization token
  const authHeader = req.headers ? (req.headers.authorization || req.headers.Authorization) : null;
  if (authHeader) {
    const parts = authHeader.split(' ');
    const token = parts.length === 2 ? parts[1] : authHeader;
    if (token) {
      try {
        // Signature must verify; an unverified (forged) token is never trusted.
        let decoded = null;
        try {
          decoded = jwt.verify(token, getJwtSecret());
        } catch (err) {
          decoded = null;
        }
        if (decoded) {
          const directSchool = decoded.school_id || decoded.schoolId ||
                               (decoded.user && (decoded.user.school_id || decoded.user.schoolId));
          if (isDepEdSchoolId(directSchool)) return cleanSchoolId(directSchool);

          if (decoded.uid) {
            if (decoded.uid.startsWith('divtest-')) return cleanSchoolId(decoded.uid.replace('divtest-', ''));
            if (decoded.uid.startsWith('pilot-')) return cleanSchoolId(decoded.uid.replace('pilot-', ''));
            if (isDepEdSchoolId(decoded.uid)) return cleanSchoolId(decoded.uid);
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // 6. Last resort fallback from body/query if not strictly numeric (e.g. division test slugs)
  if (req.query && (req.query.school_id || req.query.schoolId)) {
    return cleanSchoolId(req.query.school_id || req.query.schoolId);
  }
  if (req.body && (req.body.school_id || req.body.schoolId)) {
    return cleanSchoolId(req.body.school_id || req.body.schoolId);
  }

  return null;
}

module.exports = {
  getSchoolIdFromRequest
};

