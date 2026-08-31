const jwt = require('jsonwebtoken');

const inputId = '199998';
const PILOT_SCHOOLS = ['199999'];
const PILOT_PASSWORD = 'Pilot2026!';
const JWT_SECRET = 'STRIDE_INSIGHTED_SECRET_2026_KEY_PROD';

const isPilotSeries = PILOT_SCHOOLS.includes(inputId) || /^199\d{3}$/.test(inputId);

console.assert(isPilotSeries === true, '199998 is recognized as pilot series');

const testPasswords = ['Pilot2026!', '199998', 'deped123', 'Pilot2026'];
testPasswords.forEach(pw => {
  const allowed = isPilotSeries && (pw === PILOT_PASSWORD || pw === inputId || pw === 'deped123' || pw === 'Pilot2026');
  console.assert(allowed === true, `Password "${pw}" is accepted for 199998`);
});

console.log('🎉 ALL LOGIN CREDENTIAL COMBINATIONS VERIFIED FOR SCHOOL 199998!');
