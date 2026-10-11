// Single source of the JWT signing secret with fail-fast production enforcement.
require("../loadEnv");

const crypto = require("crypto");

const MIN_LENGTH = 32;

function isProduction(env = process.env) {
  return String((env && env.NODE_ENV) || "").toLowerCase() === "production";
}

function assertJwtSecret(env = process.env) {
  const currentEnv = env || process.env;
  const s = currentEnv.JWT_SECRET;
  if (isProduction(currentEnv)) {
    if (!s || !String(s).trim()) {
      throw new Error(
        "JWT_SECRET is not set in production environment (refusing to start)",
      );
    }
    if (String(s).trim().length < MIN_LENGTH) {
      throw new Error(
        `JWT_SECRET is too short (minimum ${MIN_LENGTH} characters required)`,
      );
    }
  } else {
    if (s && String(s).trim().length > 0 && String(s).trim().length < MIN_LENGTH) {
      throw new Error(
        `JWT_SECRET is too short (minimum ${MIN_LENGTH} characters required)`,
      );
    }
    if (!s || !String(s).trim()) {
      // In development mode, set an ephemeral 32-byte (256-bit) cryptographically secure runtime secret
      currentEnv.JWT_SECRET = crypto.randomBytes(32).toString("hex");
    }
  }
}

function getJwtSecret(env = process.env) {
  const currentEnv = env || process.env;
  const s = currentEnv.JWT_SECRET;
  if (s && String(s).trim()) return s;
  if (isProduction(currentEnv)) {
    throw new Error("FATAL: JWT_SECRET is not set in production environment");
  }
  return (
    currentEnv.JWT_SECRET ||
    Buffer.from("dev_ephemeral_jwt_token_secret").toString("hex")
  );
}

module.exports = { getJwtSecret, assertJwtSecret, isProduction };
