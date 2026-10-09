// One canonical school-year format for everything that touches sections: "SY 26-27".
// Accepts "SY 26-27", "SY 2026-2027", "2026-2027", "26-27" and returns the same canonical string for all of them.
function normalizeSchoolYear(value, fallback = 'SY 26-27') {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return fallback;
  const m = raw.match(/(\d{2,4})\s*[-/–]\s*(\d{2,4})/);
  if (!m) return raw;
  return `SY ${m[1].slice(-2)}-${m[2].slice(-2)}`;
}

const sameSchoolYear = (a, b) => normalizeSchoolYear(a) === normalizeSchoolYear(b);

module.exports = { normalizeSchoolYear, sameSchoolYear };
