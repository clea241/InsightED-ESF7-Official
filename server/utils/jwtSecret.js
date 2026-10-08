// Single source of the JWT signing secret. There is no hard-coded fallback.
//  - production (NODE_ENV=production): JWT_SECRET is required; assertJwtSecret() throws a clear error at startup.
//  - development/test: if JWT_SECRET is unset, a random per-process secret is used (tokens stop working on restart).
const crypto = require('crypto');
require('dotenv').config();

const MIN_LENGTH = 16;
let devSecret = null;

function isProduction(env = process.env) {
  return String(env.NODE_ENV || '').toLowerCase() === 'production';
}

function assertJwtSecret(env = process.env) {
  const s = env.JWT_SECRET;
  if (isProduction(env)) {
    if (!s || !String(s).trim()) {
      throw new Error('JWT_SECRET is not set. The server refuses to start in production without it. Set a random value of at least 16 characters in the server environment.');
    }
    if (String(s).length < MIN_LENGTH) {
      throw new Error(`JWT_SECRET is too short (minimum ${MIN_LENGTH} characters).`);
    }
  }
}

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s && String(s).trim()) return s;
  assertJwtSecret(); // throws in production
  if (!devSecret) {
    devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] JWT_SECRET is not set; using a random per-process secret (development only). Logins will not survive a restart.');
  }
  return devSecret;
}

module.exports = { getJwtSecret, assertJwtSecret, isProduction };
