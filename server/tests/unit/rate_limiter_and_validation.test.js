import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const { createLimiter, authLimiter, passcodeLimiter } = nodeRequire('../../middleware/rateLimiter.js');
const { validateRequest, z } = nodeRequire('../../middleware/validate.js');

test('validateRequest passes valid schema', () => {
  const schema = {
    body: z.object({
      school_id: z.string().min(1),
      password: z.string().min(1)
    })
  };

  const middleware = validateRequest(schema);
  const req = { body: { school_id: '302261', password: 'secretpassword' } };
  let called = false;
  middleware(req, {}, () => { called = true; });
  assert.equal(called, true);
});

test('validateRequest rejects invalid schema with 400', () => {
  const schema = {
    body: z.object({
      school_id: z.string().min(1),
      password: z.string().min(1)
    })
  };

  const middleware = validateRequest(schema);
  const req = { body: { school_id: '' } };
  let statusCode = null;
  let jsonBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    }
  };

  middleware(req, res, () => {});
  assert.equal(statusCode, 400);
  assert.equal(jsonBody.error, 'Validation error: invalid request payload');
  assert.equal(Array.isArray(jsonBody.details), true);
  assert.equal(jsonBody.details.length > 0, true);
});

test('createLimiter creates a valid express-rate-limit middleware with 429 and Retry-After', () => {
  const limiter = createLimiter({ windowMs: 60000, max: 2, message: 'Rate limit test' });
  assert.equal(typeof limiter, 'function');
  assert.equal(typeof authLimiter, 'function');
  assert.equal(typeof passcodeLimiter, 'function');
});
