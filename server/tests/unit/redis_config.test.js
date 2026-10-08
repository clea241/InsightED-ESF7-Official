// Run with: npm run test:unit
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseRedisConfig, RedisConfigError } from '../../utils/redisConfig.js';

test('defaults to 127.0.0.1:6379 when nothing is set', () => {
  const cfg = parseRedisConfig({});
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 6379);
});

test('rejects the 66379 typo from the startup log with a clear message', () => {
  assert.throws(() => parseRedisConfig({ REDIS_PORT: '66379' }), (e) => {
    assert.ok(e instanceof RedisConfigError);
    assert.match(e.message, /REDIS_PORT/);
    assert.match(e.message, /65535/);
    assert.match(e.message, /66379/);
    return true;
  });
});

test('rejects non-numeric, zero, negative and decimal ports', () => {
  for (const bad of ['abc', '0', '-1', '63.79', '6379abc', '65536']) {
    assert.throws(() => parseRedisConfig({ REDIS_PORT: bad }), RedisConfigError, `port "${bad}" should be rejected`);
  }
});

test('accepts the boundaries 1 and 65535', () => {
  assert.equal(parseRedisConfig({ REDIS_PORT: '1' }).port, 1);
  assert.equal(parseRedisConfig({ REDIS_PORT: '65535' }).port, 65535);
});

test('REDIS_URL is parsed and its port validated', () => {
  const ok = parseRedisConfig({ REDIS_URL: 'redis://:secret@cache.internal:6380/0' });
  assert.equal(ok.host, 'cache.internal');
  assert.equal(ok.port, 6380);
  assert.ok(!ok.display.includes('secret'), 'display string must not contain the password');
  assert.throws(() => parseRedisConfig({ REDIS_URL: 'redis://cache.internal:66379' }), RedisConfigError);
  assert.throws(() => parseRedisConfig({ REDIS_URL: 'not a url' }), RedisConfigError);
  assert.throws(() => parseRedisConfig({ REDIS_URL: 'http://cache.internal:6379' }), RedisConfigError);
});

test('unreachable Redis is reported as postgres-fallback, logged once, and never throws', async () => {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '1'; // valid port, nothing listening
  delete process.env.REDIS_URL;
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  const redisQueue = (await import('../../services/redisQueue.js')).default;
  try {
    redisQueue.startMonitor();
    await new Promise((r) => setTimeout(r, 3500)); // several reconnect attempts
    const status = redisQueue.getQueueStatus();
    assert.equal(status.mode, 'postgres-fallback');
    assert.equal(status.redisReachable, false);
    const switchLogs = warnings.filter((w) => w.includes('POSTGRES-FALLBACK'));
    assert.equal(switchLogs.length, 1, 'the reason must be logged once per outage, not on every retry');
  } finally {
    console.warn = origWarn;
    try { redisQueue.getRedisClient().disconnect(); } catch (e) {}
  }
});

test('a REDIS_URL with an out-of-range port reports the port, not a generic URL error', () => {
  assert.throws(() => parseRedisConfig({ REDIS_URL: 'redis://:pw@cache.internal:66379/0' }), /REDIS_URL port must be between 1 and 65535, but got 66379/);
});

test('host validation and empty values', () => {
  assert.throws(() => parseRedisConfig({ REDIS_HOST: 'bad host' }), RedisConfigError);
  assert.equal(parseRedisConfig({ REDIS_PORT: '   ' }).port, 6379); // blank means "use the default"
  assert.equal(parseRedisConfig({ REDIS_URL: '  ' }).host, '127.0.0.1');
  assert.equal(parseRedisConfig({ REDIS_URL: 'rediss://secure.cache:6380' }).port, 6380);
});
