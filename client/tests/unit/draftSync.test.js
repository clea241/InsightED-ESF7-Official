// Login-time draft selection: decided by the SERVER version, never by client clocks, and never silently dropping newer data.
import { describe, test, expect } from 'vitest';
import { chooseDraftSource } from '../../src/services/draftSync.js';

const base = { hasLocal: true, hasCloud: true, cloudVersion: 5, syncedVersion: 5, hasUnsyncedChanges: false };

describe('chooseDraftSource', () => {
  test('nothing anywhere', () => {
    expect(chooseDraftSource({ ...base, hasLocal: false, hasCloud: false }).source).toBe('none');
  });

  test('local only / cloud only', () => {
    expect(chooseDraftSource({ ...base, hasCloud: false }).source).toBe('local');
    const cloudOnly = chooseDraftSource({ ...base, hasLocal: false });
    expect(cloudOnly.source).toBe('cloud');
    expect(cloudOnly.adoptCloudVersion).toBe(true);
  });

  test('server unchanged since this device last synced: keep local (it is the latest)', () => {
    expect(chooseDraftSource({ ...base, syncedVersion: 5, cloudVersion: 5, hasUnsyncedChanges: true }).source).toBe('local');
  });

  test('a NEWER server copy is never overwritten by an older local copy when nothing local is pending', () => {
    const d = chooseDraftSource({ ...base, syncedVersion: 3, cloudVersion: 5, hasUnsyncedChanges: false });
    expect(d.source).toBe('cloud');
    expect(d.adoptCloudVersion).toBe(true);
  });

  test('server changed AND this device has unsynced edits: conflict, never a silent choice', () => {
    const d = chooseDraftSource({ ...base, syncedVersion: 3, cloudVersion: 5, hasUnsyncedChanges: true });
    expect(d.source).toBe('conflict');
  });

  test('a device that never synced (no stored version) with unsynced edits is a conflict, not a silent overwrite', () => {
    expect(chooseDraftSource({ ...base, syncedVersion: null, cloudVersion: 2, hasUnsyncedChanges: true }).source).toBe('conflict');
  });

  test('wrong client clocks cannot change the outcome when versions are available', () => {
    const farFutureLocal = chooseDraftSource({ ...base, syncedVersion: 3, cloudVersion: 5, localTime: Date.now() + 1e10, cloudTime: 0 });
    expect(farFutureLocal.source).toBe('cloud');
    const farPastLocal = chooseDraftSource({ ...base, syncedVersion: 5, cloudVersion: 5, localTime: 0, cloudTime: Date.now() + 1e10 });
    expect(farPastLocal.source).toBe('local');
  });

  test('legacy server without versions: timestamps decide, but unsynced local work is never dropped', () => {
    const legacy = { ...base, cloudVersion: null, syncedVersion: null };
    expect(chooseDraftSource({ ...legacy, localTime: 10, cloudTime: 20, hasUnsyncedChanges: false }).source).toBe('cloud');
    expect(chooseDraftSource({ ...legacy, localTime: 10, cloudTime: 20, hasUnsyncedChanges: true }).source).toBe('local');
    expect(chooseDraftSource({ ...legacy, localTime: 30, cloudTime: 20 }).source).toBe('local');
  });
});
