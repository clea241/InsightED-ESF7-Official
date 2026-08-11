/**
 * Generates a deterministic 6-character 10-minute TOTP passcode for a personnel ID.
 * @param {string} personId - The ID of the personnel.
 * @param {number} windowOffset - Time window offset (0 for current, -1 for previous 10 mins).
 * @returns {string} 6-character uppercase passcode.
 */
export function get10MinPasscode(personOrId, windowOffset = 0) {
  if (!personOrId) return '000000';
  let key = '';
  if (typeof personOrId === 'object' && personOrId !== null) {
    const fn = (personOrId.firstName || personOrId.first_name || '').toUpperCase().trim();
    const ln = (personOrId.lastName || personOrId.last_name || '').toUpperCase().trim();
    key = personOrId.employeeReferenceId || personOrId.prn || (fn && ln ? `${ln}_${fn}` : String(personOrId.id || ''));
  } else if (typeof personOrId === 'string') {
    key = personOrId.trim();
  } else {
    key = String(personOrId);
  }

  const timeWindow = Math.floor(Date.now() / 600000) + windowOffset;
  const str = `${key}_${timeWindow}_ESF7_SECRET_SALT`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  let absHash = Math.abs(hash);
  for (let i = 0; i < 6; i++) {
    code += chars[(absHash + i * 7) % chars.length];
    absHash = Math.floor(absHash / 31) + (str.charCodeAt(i % str.length) * 17);
  }
  return code;
}
