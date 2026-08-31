const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'STRIDE_INSIGHTED_SECRET_2026_KEY_PROD';

function getSchoolIdFromRequest(req) {
  // 1. Explicit header or query param
  if (req.headers && req.headers['x-school-id']) {
    return String(req.headers['x-school-id']).trim();
  }
  if (req.query && (req.query.school_id || req.query.schoolId)) {
    return String(req.query.school_id || req.query.schoolId).trim();
  }

  // 2. JWT authorization token
  const authHeader = req.headers ? (req.headers.authorization || req.headers.Authorization) : null;
  if (authHeader) {
    const parts = authHeader.split(' ');
    const token = parts.length === 2 ? parts[1] : authHeader;
    if (token) {
      try {
        let decoded = null;
        try {
          decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
          decoded = jwt.decode(token);
        }
        if (decoded) {
          const sid = decoded.school_id || decoded.schoolId || decoded.school || decoded.user?.school_id || decoded.user?.schoolId;
          if (sid) return String(sid).trim();
        }
      } catch (err) {
        // ignore
      }
    }
  }
  return null;
}

module.exports = {
  getSchoolIdFromRequest
};
