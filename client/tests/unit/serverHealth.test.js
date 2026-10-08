// Server-error modal trigger logic: when the app locks, what is ignored, and when it unlocks again.
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

describe('lock trigger', () => {
  test('one failed request does not lock (a single blip is ignored)', () => {
    health.recordServerFailure({ message: 'blip' });
    expect(health.isServerLocked()).toBe(false);
  });

  test('two failures in a row lock the app', () => {
    health.recordServerFailure({ message: 'a' });
    health.recordServerFailure({ message: 'b', status: 504, url: '/api/personnel' });
    expect(health.isServerLocked()).toBe(true);
    expect(health.getHealthState().lastError).toMatchObject({ status: 504, url: '/api/personnel' });
  });

  test('a success between two failures resets the streak', () => {
    health.recordServerFailure({ message: 'a' });
    health.recordServerSuccess();
    health.recordServerFailure({ message: 'b' });
    expect(health.isServerLocked()).toBe(false);
  });

  test('failures more than 30s apart do not add up', async () => {
    health.recordServerFailure({ message: 'a' });
    await vi.advanceTimersByTimeAsync(31000);
    health.recordServerFailure({ message: 'b' });
    expect(health.isServerLocked()).toBe(false);
  });

  test('only 502/503/504 count as server failures (4xx validation/auth errors never do)', () => {
    expect([400, 401, 403, 404, 409, 422, 500].some(health.isServerFailureStatus)).toBe(false);
    expect([502, 503, 504].every(health.isServerFailureStatus)).toBe(true);
  });

  test('lock handlers run the moment the lock trips (persist work, abort saves)', () => {
    const onLock = vi.fn();
    health.onServerLock(onLock);
    health.recordServerFailure({ message: 'a' });
    health.recordServerFailure({ message: 'b' });
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});

describe('recovery', () => {
  const lock = () => { health.recordServerFailure({ message: 'a' }); health.recordServerFailure({ message: 'b' }); };

  test('new API calls wait while locked and resume after recovery', async () => {
    lock();
    let resumed = false;
    health.waitUntilHealthy().then(() => { resumed = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(resumed).toBe(false);
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(10000);
    expect(health.isServerLocked()).toBe(false);
    expect(resumed).toBe(true);
  });

  test('needs several consecutive healthy checks (no flapping) and runs recovery steps before unlocking', async () => {
    const order = [];
    health.onServerRecover(async () => { order.push(`recover(locked=${health.isServerLocked()})`); });
    lock();
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(health.getHealthState().healthyStreak).toBeLessThan(3);
    expect(health.isServerLocked()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(health.isServerLocked()).toBe(false);
    expect(order).toEqual(['recover(locked=true)']); // drafts re-synced while still locked
  });

  test('a failed health check resets the healthy streak', async () => {
    lock();
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(0);
    healthyAnswer = false;
    await vi.advanceTimersByTimeAsync(1500);
    expect(health.getHealthState().healthyStreak).toBe(0);
    expect(health.isServerLocked()).toBe(true);
  });

  test('stays locked if a recovery step (draft re-sync) fails', async () => {
    health.onServerRecover(async () => { throw new Error('draft sync failed'); });
    lock();
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(8000);
    expect(health.isServerLocked()).toBe(true);
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
    // Simulates draftSaver: a save is paused at the lock, and the recovery step waits for that save.
    health.recordServerFailure({ message: 'a' });
    health.recordServerFailure({ message: 'b' });
    let pausedSaveFinished = false;
    const pausedSave = health.waitUntilHealthy().then(() => { pausedSaveFinished = true; });
    health.onServerRecover(async () => { await pausedSave; });
    healthyAnswer = true;
    await vi.advanceTimersByTimeAsync(8000);
    expect(pausedSaveFinished).toBe(true);
    expect(health.isServerLocked()).toBe(false); // recovery completed instead of hanging forever
  });

  test('new requests are still paused before the server has been confirmed healthy', async () => {
    health.recordServerFailure({ message: 'a' });
    health.recordServerFailure({ message: 'b' });
    let ran = false;
    health.waitUntilHealthy().then(() => { ran = true; });
    await vi.advanceTimersByTimeAsync(1500); // still failing health checks
    expect(ran).toBe(false);
  });
});

describe('Redis outage never locks users out', () => {
  test('a readiness reply of 200 with redis "degraded" counts as healthy and unlocks', async () => {
    fetch.mockImplementation(async () => new Response(JSON.stringify({ status: 'degraded', db: 'up', redis: 'degraded', queue: { mode: 'postgres-fallback' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    health.recordServerFailure({ message: 'a' });
    health.recordServerFailure({ message: 'b', status: 503 });
    expect(health.isServerLocked()).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(health.isServerLocked()).toBe(false);
  });

  test('the lock polls the readiness endpoint, never the deep monitoring check', async () => {
    health.configureHealth({ url: '/api/health' });
    health.recordServerFailure({ message: 'a' });
    health.recordServerFailure({ message: 'b', status: 503 });
    await vi.advanceTimersByTimeAsync(3000);
    const urls = fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => /\/api\/health(\?|$)/.test(u) && !u.includes('/deep'))).toBe(true);
  });
});
