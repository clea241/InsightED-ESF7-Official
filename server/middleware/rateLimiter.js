// Shared Rate Limiting Middleware for InsightED ESF7
// Enforces per-IP limits with Retry-After header and standard RateLimit headers.
// Designed to operate behind reverse proxies (nginx) when Express "trust proxy" is configured.

const rateLimit = require("express-rate-limit");

/**
 * Creates a rate limiter instance with custom window and request limits.
 * Guarantees 429 status code, Retry-After header, and RateLimit headers.
 */
function createLimiter({
  windowMs = 15 * 60 * 1000,
  max = 30,
  message = "Too many requests. Please try again later.",
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: { error: message },
    handler: (req, res, _next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(options.statusCode).json({
        error: options.message.error || options.message,
        retryAfter,
      });
    },
  });
}

// 1. General login rate limiter (30 requests per 15 minutes per IP)
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message:
    "Too many login attempts from this IP. Please try again in 15 minutes.",
});

// 2. Strict passcode and credential-check limiter (10 attempts per 15 minutes per IP)
const passcodeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message:
    "Too many passcode verification attempts from this IP. Please try again in 15 minutes.",
});

module.exports = {
  createLimiter,
  authLimiter,
  passcodeLimiter,
};
