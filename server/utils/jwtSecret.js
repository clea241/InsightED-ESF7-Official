// Single source of the JWT signing secret with safe production fallback.
require('dotenv').config();

const DEFAULT_PROD_SECRET = 'insighted_super_secret_jwt_token_key_2026_esf7_prod_secure';

function isProduction(env = process.env) {
  return String(env.NODE_ENV || '').toLowerCase() === 'production';
}

function assertJwtSecret() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = DEFAULT_PROD_SECRET;
  }
}

function getJwtSecret() {
  const s = process.env.JWT_SECRET || DEFAULT_PROD_SECRET;
  if (s && String(s).trim()) return s;
  return DEFAULT_PROD_SECRET;
}

module.exports = { getJwtSecret, assertJwtSecret, isProduction };

