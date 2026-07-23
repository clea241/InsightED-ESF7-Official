const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'STRIDE_INSIGHTED_SECRET_2026_KEY_PROD';

function getSchoolIdFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.school_id) {
          return decoded.school_id;
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
