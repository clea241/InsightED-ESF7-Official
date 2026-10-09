// Request Validation Middleware using Zod
// Validates req.body, req.query, and req.params before controller execution.

const { z } = require("zod");

/**
 * Higher-order middleware to validate incoming request data against a Zod schema.
 * Rejects invalid input with 400 Bad Request and structured error details.
 *
 * @param {Object} schemas - { body?: z.ZodType, query?: z.ZodType, params?: z.ZodType }
 */
function validateRequest(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.body && req.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query && req.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params && req.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues || err.errors || [];
        return res.status(400).json({
          error: "Validation error: invalid request payload",
          details: issues.map((e) => ({
            field: Array.isArray(e.path) ? e.path.join(".") : "",
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

module.exports = {
  validateRequest,
  z,
};
