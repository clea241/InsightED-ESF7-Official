// Which person is reported as the school head (reports, SF7, Validation Center). Used by the client.
// Precedence: the school head designated in the roster ALWAYS wins; the SDO-supplied OIC record
// (esf7_school_head_sdo) is only used when the roster has no designated head.
export const isRosterSchoolHead = (p) =>
  Boolean(p) && (p.isSchoolHead === true || p.is_school_head === true || p.isSchoolHead === 'true' || p.is_school_head === 'true');

export const findRosterSchoolHead = (personnel) => (personnel || []).find(isRosterSchoolHead) || null;

/** Returns { source: 'roster' | 'sdo', person?, name, positionTitle, email } or null when neither exists. */
export function resolveSchoolHead(personnel, sdoRecord) {
  const head = findRosterSchoolHead(personnel);
  if (head) {
    const mid = head.middleName && !['N/A', 'NONE'].includes(head.middleName) ? ` ${head.middleName.charAt(0)}.` : '';
    return {
      source: 'roster',
      person: head,
      name: `${head.lastName || ''}, ${head.firstName || ''}${mid}`.toUpperCase(),
      positionTitle: head.position || head.plantilla_position || '',
      email: head.depedEmail || head.deped_email || ''
    };
  }
  if (sdoRecord && sdoRecord.name) {
    return {
      source: 'sdo',
      person: null,
      name: String(sdoRecord.name).toUpperCase(),
      positionTitle: sdoRecord.positionTitle || '',
      email: sdoRecord.email || ''
    };
  }
  return null;
}
