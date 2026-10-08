// Startup configuration validation, exercised by launching the real server entry point.
// No database is needed: a malformed Redis setting must stop the process BEFORE any connection is attempted.
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const startServer = (env) => spawnSync(process.execPath, ['server.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: '0', ...env },
  encoding: 'utf8',
  timeout: 20000
});

describe('server startup refuses malformed configuration', () => {
  test.each([
    ['port above 65535 (the 66379 typo from the production log)', { REDIS_PORT: '66379' }, /REDIS_PORT must be between 1 and 65535, but got 66379/],
    ['non-numeric port', { REDIS_PORT: 'abc' }, /REDIS_PORT must be a whole number/],
    ['invalid REDIS_URL', { REDIS_URL: 'not a url' }, /REDIS_URL is not a valid URL/],
    ['REDIS_URL with a bad port', { REDIS_URL: 'redis://cache.internal:66379' }, /REDIS_URL port must be between 1 and 65535/]
  ])('%s', (_label, env, message) => {
    const run = startServer(env);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Invalid Redis configuration/);
    expect(run.stderr).toMatch(message);
    expect(run.stdout + run.stderr).not.toMatch(/Express server running/); // never got as far as listening
  });
});

describe('server startup requires a real JWT secret in production (no hard-coded fallback)', () => {
  // An empty JWT_SECRET also stops dotenv from filling it in from a developer's server/.env.
  test.each([
    ['missing', { NODE_ENV: 'production', JWT_SECRET: '' }, /JWT_SECRET is not set/],
    ['too short', { NODE_ENV: 'production', JWT_SECRET: 'short' }, /JWT_SECRET is too short/]
  ])('production with a %s JWT_SECRET refuses to start', (_label, env, message) => {
    const run = startServer(env);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(message);
    expect(run.stdout + run.stderr).not.toMatch(/Express server running/);
  });

  test('the old hard-coded secret is gone from the server code', () => {
    const run = spawnSync(process.execPath, ['-e', `
      const fs = require('fs'), path = require('path');
      const bad = [];
      (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (['node_modules', 'tests', 'scratch', 'uploads'].includes(e.name)) continue;
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.js$/.test(e.name) && !/^(test_|scratch_)/.test(e.name) && fs.readFileSync(p, 'utf8').includes('STRIDE_INSIGHTED_SECRET')) bad.push(p);
        }
      })(process.cwd());
      console.log(JSON.stringify(bad));
    `], { cwd: serverDir, encoding: 'utf8' });
    expect(JSON.parse(run.stdout)).toEqual([]);
  });
});
