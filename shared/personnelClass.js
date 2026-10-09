// Position classes that need more than the broad Teaching / Teaching-Related / Non-Teaching category.
// School Principals are Related-Teaching, but unlike other Related-Teaching staff their workload is NOT
// generated or counted from Classes Organized (they carry administrative/supervisory duties only).
export const SCHOOL_PRINCIPAL_POSITIONS = [
  'SCHOOL PRINCIPAL I', 'SCHOOL PRINCIPAL II', 'SCHOOL PRINCIPAL III', 'SCHOOL PRINCIPAL IV',
  'SPECIAL SCHOOL PRINCIPAL I', 'SPECIAL SCHOOL PRINCIPAL II'
];

export const isSchoolPrincipalPosition = (position) =>
  SCHOOL_PRINCIPAL_POSITIONS.includes(String(position || '').trim().toUpperCase());

/** True when no Classes-Organized workload should be generated/counted for this person. */
export const isOrganizedClassWorkloadExempt = (person) =>
  isSchoolPrincipalPosition(person?.position || person?.plantilla_position || person?.position_title);
