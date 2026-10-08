/**
 * Generates a deterministic 8-character 1-Day (24-hour) TOTP passcode for a personnel ID.
 * Resets every 1 day (86,400,000 ms).
 * @param {string|object} personOrId - The ID or object of the personnel.
 * @param {number} windowOffset - Time window offset (0 for today, -1 for yesterday).
 * @returns {string} 8-character uppercase passcode.
 */
export function getDailyPasscode(personOrId, windowOffset = 0) {
  if (!personOrId) return '00000000';
  let key = '';
  if (typeof personOrId === 'object' && personOrId !== null) {
    if (personOrId.id) {
      key = String(personOrId.id).toUpperCase().trim();
    } else if (personOrId.prn) {
      key = String(personOrId.prn).toUpperCase().trim();
    } else {
      const fn = (personOrId.firstName || personOrId.first_name || '').toUpperCase().trim();
      const ln = (personOrId.lastName || personOrId.last_name || '').toUpperCase().trim();
      key = fn && ln ? `${ln}_${fn}` : 'TEACHER';
    }
  } else if (typeof personOrId === 'string') {
    key = personOrId.toUpperCase().trim();
  } else {
    key = String(personOrId).toUpperCase().trim();
  }

  // 1-Day (24-hour) TOTP window (86,400,000 ms)
  const timeWindow = Math.floor(Date.now() / 86400000) + windowOffset;
  const str = `${key}_${timeWindow}_ESF7_SECRET_SALT_V2`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  let absHash = Math.abs(hash);
  for (let i = 0; i < 8; i++) {
    code += chars[(absHash + i * 7) % chars.length];
    absHash = Math.floor(absHash / 31) + (str.charCodeAt(i % str.length) * 17);
  }
  return code;
}

// Aliases for backwards compatibility with existing imports
export const getHourlyPasscode = getDailyPasscode;
export const get10MinPasscode = getDailyPasscode;



