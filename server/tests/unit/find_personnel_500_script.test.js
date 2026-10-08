// The read-only report script: log parsing (pure functions). The database part is covered by an integration test.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const s = nodeRequire('../../scripts/find_personnel_500_and_cross_school.js');

const ESC = '\x1b';
const devLine = `2026-10-08 09:15:02: ${ESC}[90m[09:15:02]${ESC}[0m ${ESC}[32m${ESC}[1mPOST  ${ESC}[0m /api/personnel ${ESC}[90m➔${ESC}[0m ${ESC}[31m${ESC}[1m500${ESC}[0m ${ESC}[2m12.4ms${ESC}[0m ${ESC}[90m➔ payload: { school_id: "302261", first_name: "ANA" }${ESC}[0m`;

test('finds a personnel create that returned 500, with its date and school (ANSI colors and PM2 stamp ignored)', () => {
  assert.deepEqual(s.parsePersonnelCreate500(devLine), { kind: 'request', date: '2026-10-08', time: '09:15:02', school: '302261' });
});
test('ignores successful creates, other routes and other methods', () => {
  assert.equal(s.parsePersonnelCreate500(devLine.replace('500', '201')), null);
  assert.equal(s.parsePersonnelCreate500(devLine.replace('/api/personnel', '/api/personnel/PER-1')), null);
  assert.equal(s.parsePersonnelCreate500(devLine.replace('POST ', 'GET  ')), null);
});
test('reads the controller error text', () => {
  const e = s.parsePersonnelCreateError('2026-10-08 09:15:02: Error creating personnel record: ReferenceError: highest_educational_attainment is not defined');
  assert.equal(e.message, 'ReferenceError: highest_educational_attainment is not defined');
});
test('reads auth-gate refusals with and without school details', () => {
  const d403 = s.parseAuthDeny('2026-10-09 08:00:00: [AuthGate][DENY 403] method=PUT path=/api/school/draft uid=u-999999 role=School Division Office tokenSchool=999999 claimed=302261');
  assert.deepEqual({ code: d403.code, uid: d403.uid, role: d403.role, tokenSchool: d403.tokenSchool, claimed: d403.claimed }, { code: '403', uid: 'u-999999', role: 'School Division Office', tokenSchool: '999999', claimed: '302261' });
  const d401 = s.parseAuthDeny('[AuthGate][DENY 401] method=GET path=/api/school/draft uid=- role=-');
  assert.equal(d401.code, '401'); assert.equal(d401.tokenSchool, null);
});
test('flags a draft saved by an account that embeds another school', () => {
  const r = s.analyzeLogLines([
    '[DraftSave][OK] school=302261 user=pilot-302261 year=SY 26-27 base=3 version=4 bytes=10 ms=5',
    '[DraftSave][OK] school=302261 user=pilot-999999 year=SY 26-27 base=4 version=5 bytes=10 ms=5',
    '[DraftSave][OK] school=302261 user=1234-abcd year=SY 26-27 base=5 version=6 bytes=10 ms=5'
  ]);
  assert.equal(r.draftSaves.length, 3);
  assert.equal(r.crossSchoolDraftSaves.length, 1);
  assert.equal(r.crossSchoolDraftSaves[0].uid, 'pilot-999999');
});
