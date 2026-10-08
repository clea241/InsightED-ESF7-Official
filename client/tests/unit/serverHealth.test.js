// Server-error modal trigger logic. The lock is decided ONLY by the dedicated readiness check (GET /api/health):
// a failed ordinary request is just a hint that starts readiness probes; 3 consecutive failed probes lock the app.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

let health;
let healthyAnswer;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  globalThis.localStorage.clear();
  healthyAnswer = false;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: healthyAnswer ? 200 : 503, headers: { 'content-type': 'application/json' } })));
  health = await import('../../src/services/serverHealth.js');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Report a failed request while readiness is down, and let the probes (0s, 0.5s, 1.5s) run.
const lock = async (error = { message: 'a', status: 504, url: '/api/personnel' }) => {
  healthyAnswer = false;
  health.recordServerFailure(error);
  await vi.advanceTimersByTimeAsync(2500);
};

describe('what can and cannot lock the app', () => {
  test('a single failed request (readiness is fine) never locks', async () => {
    healthyAnswer = true;
    health.recordServerFailure({ name: 'TypeError', message: 'Failed to fetch', url: '/api/requests/incoming?schoolId=302261' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(health.isServerLocked()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1); // one readiness probe settled it
  });

  test('many failed requests while readiness is fine still never lock', async () => {
    healthyAnswer = true;
    for (let i = 0; i < 10; i += 1) health.recordServerFailure({ message: `blip ${i}` });
    await vi.advanceTimersByTimeAsync(5000);
    expect(health.isServerLocked()).toBe(false);
  });

  test('repeated readiness failures lock the app, after more than one probe, with backoff', async () => {
    health.recordServerFailure({ message: 'a' });
    healthyAnswer = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(health.isServerLocked()).toBe(false); // one failed probe is not enough
    await vi.advanceTimersByTimeAsync(600);
    expect(health.isServerLocked()).toBe(false); // two are not enough
    await vi.advanceTimersByTimeAsync(1100);
    expect(health.isServerLocked()).toBe(true); // three consecutive failures lock
  });

  test('a readiness check that recovers between probes cancels the lock', async () => {
    health.recordServerFailure({ message: 'a' });
    await vi.advanceTimersByTimeAsync(0); // probe 1 fails
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(2500);
    expect(health.isServerLocked()).toBe(false);
  });

  test('the failing request is kept as the evidence shown in the error report', async () => {
    await lock({ message: 'Server responded with HTTP 504', status: 504, url: '/api/personnel' });
    expect(health.isServerLocked()).toBe(true);
    expect(health.getHealthState().lastError).toMatchObject({ status: 504, url: '/api/personnel' });
  });

  test('only 502/503/504 count as server failures (4xx validation/auth/access errors, incl. 401 and 403, never do)', () => {
    expect([400, 401, 403, 404, 409, 422, 500].some(health.isServerFailureStatus)).toBe(false);
    expect([502, 503, 504].every(health.isServerFailureStatus)).toBe(true);
  });

  test('lock handlers run the moment the lock trips (persist work, abort saves)', async () => {
    const onLock = vi.fn();
    health.onServerLock(onLock);
    await lock();
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  test('the readiness answer decides: 200 with redis "degraded" is healthy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'degraded', db: 'up', redis: 'degraded' }), { status: 200, headers: { 'content-type': 'application/json' } })));
    health.recordServerFailure({ message: 'x', status: 503 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(health.isServerLocked()).toBe(false);
  });

  test('probes use only the readiness endpoint, never the deep monitoring check', async () => {
    health.configureHealth({ url: '/api/health/readiness' });
    await lock();
    const urls = fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => /\/api\/health\/readiness(\?|$)/.test(u) && !u.includes('/deep'))).toBe(true);
  });
});

describe('recovery', () => {
  test('new API calls wait while locked and resume after recovery', async () => {
    await lock();
    let resumed = false;
    health.waitUntilHealthy().then(() => { resumed = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(resumed).toBe(false);
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(40000);
    expect(health.isServerLocked()).toBe(false);
    expect(resumed).toBe(true);
  });

  test('needs several consecutive healthy checks (no flapping) and runs recovery steps before unlocking', async () => {
    const order = [];
    health.onServerRecover(async () => { order.push(`recover(locked=${health.isServerLocked()})`); });
    await lock();
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(health.getHealthState().healthyStreak).toBeLessThan(3);
    expect(health.isServerLocked()).toBe(true);
    await vi.advanceTimersByTimeAsync(40000);
    expect(health.isServerLocked()).toBe(false);
    expect(order).toEqual(['recover(locked=true)']); // drafts re-synced while still locked
  });

  test('a failed health check resets the healthy streak', async () => {
    await lock();
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(0);
    healthyAnswer = false;
    await vi.advanceTimersByTimeAsync(40000);
    expect(health.getHealthState().healthyStreak).toBe(0);
    expect(health.isServerLocked()).toBe(true);
  });

  test('stays locked if a recovery step (draft re-sync) fails, and the work stays flagged as unsynced', async () => {
    health.onServerRecover(async () => { throw new Error('draft sync failed'); });
    await lock();
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(20000);
    expect(health.isServerLocked()).toBe(true);
    expect(health.hasUnsynced()).toBe(true);
  });

  test('locking marks work as unsynced (drafts preserved for the next sync)', async () => {
    expect(health.hasUnsynced()).toBe(false);
    await lock();
    expect(health.hasUnsynced()).toBe(true);
  });

  test('unsynced flag survives until the server confirms (drives the beforeunload warning)', () => {
    expect(health.hasUnsynced()).toBe(false);
    health.markUnsynced();
    expect(health.hasUnsynced()).toBe(true);
    health.markSynced();
    expect(health.hasUnsynced()).toBe(false);
  });
});

describe('recovery cannot deadlock on its own requests', () => {
  test('a request paused by the lock is allowed through during the recovery phase, so draft re-sync can finish', async () => {
    await lock();
    let pausedSaveFinished = false;
    const pausedSave = health.waitUntilHealthy().then(() => { pausedSaveFinished = true; });
    health.onServerRecover(async () => { await pausedSave; });
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(40000);
    expect(pausedSaveFinished).toBe(true);
    expect(health.isServerLocked()).toBe(false); // recovery completed instead of hanging forever
  });

  test('new requests are still paused before the server has been confirmed healthy', async () => {
    await lock();
    let ran = false;
    health.waitUntilHealthy().then(() => { ran = true; });
    await vi.advanceTimersByTimeAsync(1500); // still failing health checks
    expect(ran).toBe(false);
  });
});
