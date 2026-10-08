// Pure decision logic for "which draft do we load after login?". Kept free of React, storage and network
// so it can be unit tested. Decisions use the SERVER version number, never client clocks, except for an
// old server that does not report versions yet.

/**
 * @typedef {'none' | 'local' | 'cloud' | 'conflict'} DraftSource
 * @param {{
 *   hasLocal: boolean,
 *   hasCloud: boolean,
 *   cloudVersion: number | null,      // version reported by the server (null = server does not support versions)
 *   syncedVersion: number | null,     // version this device last saved/loaded successfully
 *   hasUnsyncedChanges: boolean,      // this device has edits the server has not confirmed
 *   localTime?: number,               // only used when cloudVersion is null
 *   cloudTime?: number
 * }} input
 * @returns {{ source: DraftSource, reason: string, adoptCloudVersion: boolean }}
 */
export function chooseDraftSource({ hasLocal, hasCloud, cloudVersion, syncedVersion, hasUnsyncedChanges, localTime = 0, cloudTime = 0 }) {
  if (!hasLocal && !hasCloud) return { source: 'none', reason: 'no draft anywhere', adoptCloudVersion: false };
  if (hasLocal && !hasCloud) return { source: 'local', reason: 'local-only draft', adoptCloudVersion: false };
  if (!hasLocal && hasCloud) return { source: 'cloud', reason: 'cloud-only draft', adoptCloudVersion: cloudVersion !== null };

  // Both exist.
  if (cloudVersion === null) {
    // Legacy server: timestamps, but never silently drop unsynced local work.
    const useLocal = localTime >= cloudTime || hasUnsyncedChanges;
    return { source: useLocal ? 'local' : 'cloud', reason: 'legacy timestamp comparison', adoptCloudVersion: false };
  }
  if (syncedVersion === cloudVersion) {
    return { source: 'local', reason: 'server unchanged since this device last synced', adoptCloudVersion: false };
  }
  if (!hasUnsyncedChanges) {
    return { source: 'cloud', reason: 'server has a newer version and nothing local is waiting to be saved', adoptCloudVersion: true };
  }
  return { source: 'conflict', reason: 'server changed and this device also has unsynced changes', adoptCloudVersion: true };
}
