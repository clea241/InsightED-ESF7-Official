// Single source of the JWT signing secret with safe production fallback.
require('dotenv').config();

const MIN_LENGTH = 16;
const DEFAULT_PROD_SECRET = 'insighted_super_secret_jwt_token_key_2026_esf7_prod_secure';

function isProduction(env = process.env) {
  return String((env && env.NODE_ENV) || '').toLowerCase() === 'production';
}

function assertJwtSecret(env = process.env) {
  const currentEnv = env || process.env;
  if (isProduction(currentEnv)) {
    const s = currentEnv.JWT_SECRET;
    if (!s || !String(s).trim()) {
      throw new Error('JWT_SECRET is not set in production environment');
    }
    if (String(s).trim().length < MIN_LENGTH) {
      throw new Error(`JWT_SECRET is too short (minimum ${MIN_LENGTH} characters required)`);
    }
  } else if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = DEFAULT_PROD_SECRET;
  }
}

function getJwtSecret(env = process.env) {
  const currentEnv = env || process.env;
  const s = currentEnv.JWT_SECRET || DEFAULT_PROD_SECRET;
  if (s && String(s).trim()) return s;
  return DEFAULT_PROD_SECRET;
}

module.exports = { getJwtSecret, assertJwtSecret, isProduction };


