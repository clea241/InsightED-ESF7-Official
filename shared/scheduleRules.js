// Time-allotment limits for class schedules. Single source of truth: read by the
// client (Validation Center) and the server (workload save). Change values here only.
export const SCHEDULE_RULES = {
  // Regular and multigrade sections.
  regular: {
    minMinutesPerSubject: 40,
    // The minimum applies only when the section includes one of these grade numbers.
    minAppliesToGrades: [1, 2],
    maxMinutesPerSubjectPerDay: null, // no daily cap
    maxMinutesPerSubjectPerWeek: 480
  },
  // Special Curricular Programs (STE, SPA, SPFL, SPJ, SPS, SPTVE).
  scp: {
    minMinutesPerSubject: 40,
    minAppliesToGrades: null, // every grade
    maxMinutesPerSubjectPerDay: 120,
    maxMinutesPerSubjectPerWeek: 600
  },
  // Substrings (uppercase) in sectionType / gradeLevel that mark a Special Curricular Program.
  scpKeywords: ['SPECIAL PROGRAM', 'SPECIAL CURRICULAR', 'SCIENCE, TECHNOLOGY', '(STE)', '(SPA)', '(SPFL)', '(SPJ)', '(SPS)', '(SPTVE)', 'SCP'],
  contactNote: 'Please coordinate with CID for concerns.'
};

// Room QR passcode validity. Token generation and validation both derive from this.
export const QR_VALIDITY_HOURS = 24;
export const QR_VALIDITY_MS = QR_VALIDITY_HOURS * 60 * 60 * 1000;

// Natures of appointment that may be nationally funded even though they are non-permanent
// (COS and contractual hires paid from national funds). Other non-permanent natures stay local-fund only.
export const NATIONAL_FUND_ELIGIBLE_NATURES = ['CONTRACTUAL', 'JOB ORDER/CONTRACT OF SERVICE'];
