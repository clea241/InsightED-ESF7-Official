// Regression: POST /api/personnel read education fields it never took from the request body (ReferenceError ->
// every create rolled back with HTTP 500), and PUT /api/personnel/:id did the same for the DepEd-email flags.
// A recording stand-in for PostgreSQL checks the save succeeds and that the values written match the request.
import { test, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const db = nodeRequire('../../db/index.js');
const personnelRouter = nodeRequire('../../controllers/personnel/index.js');

let log = [];
const respond = (sql, params = []) => {
  const text = String(sql);
  log.push({ sql: text, params });
  if (/SELECT COUNT\(\*\)/.test(text)) return { rows: [{ count: '0' }] };
  if (/INSERT INTO esf7_personnel_profile/.test(text)) return { rows: [{ id: params[0], prn: params[1], school_id: params[2], first_name: params[6], last_name: params[8] }] };
  if (/SELECT \* FROM esf7_personnel_profile WHERE id/.test(text)) {
    return { rows: [{ id: params[0], school_id: '302261', first_name: 'ANA', last_name: 'REYES', type: 'teaching', no_deped_email: false, allow_email_discrepancy: false }] };
  }
  if (/UPDATE esf7_personnel_profile SET/.test(text)) return { rows: [{ id: 'PER-302261-001', school_id: '302261', type: 'teaching' }], rowCount: 1 };
  if (/RETURNING/.test(text)) return { rows: [{ id: params[0] ?? 'X' }], rowCount: 1 };
  if (/FROM esf7_personnel_profile p\s+LEFT JOIN/.test(text)) {
    const edu = log.find((l) => /INSERT INTO esf7_perssonel_educ/.test(l.sql));
    return { rows: [{ id: 'PER-302261-001', first_name: 'ANA', last_name: 'REYES', highest_educational_attainment: edu ? edu.params[2] : null }] };
  }
  return { rows: [], rowCount: 0 };
};
const fakeClient = { query: async (sql, params) => respond(sql, params), release() {} };
db.query = async (sql, params) => respond(sql, params);
db.pool.connect = async () => fakeClient; // instance method on the real (never-connected) pool
db.getClient = async () => fakeClient;

let server;
let base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/personnel', personnelRouter);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/personnel`;
});
afterAll(() => { server.close(); });
beforeEach(() => { log = []; });

const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('POST saves a new personnel record with the education fields from the request body', async () => {
  const res = await send('POST', base, {
    school_id: '302261', school_year: '2026-2027', first_name: 'Ana', last_name: 'Reyes', sex_at_birth: 'FEMALE',
    highest_educational_attainment: 'Master of Arts', shs_track: 'ABM', vocational_course: 'Welding', vocational_level: 'NC II',
    college_degree: 'BSEd', major: 'English', position: 'Teacher I', nature_of_appointment: 'REGULAR PERMANENT'
  });
  assert.equal(res.status, 201, await res.clone().text());
  assert.ok(log.some((l) => /^\s*COMMIT/.test(l.sql)), 'transaction committed');
  assert.ok(!log.some((l) => /ROLLBACK/.test(l.sql)), 'no rollback');
  const edu = log.find((l) => /INSERT INTO esf7_perssonel_educ/.test(l.sql));
  assert.ok(edu, 'education row written');
  assert.equal(edu.params[2], 'MASTER OF ARTS'); // highest_educational_attainment
  assert.equal(edu.params[3], 'ABM'); // shs_track
  assert.equal(edu.params[4], 'WELDING'); // vocational_course
  assert.equal(edu.params[5], 'NC II'); // vocational_level
  assert.equal(edu.params[6], 'BSED'); // college_degree
  const profile = log.find((l) => /INSERT INTO esf7_personnel_profile/.test(l.sql));
  assert.equal(profile.params[6], 'ANA');
  assert.equal(profile.params[8], 'REYES');
});

test('POST also accepts the camelCase education field names', async () => {
  const res = await send('POST', base, {
    school_id: '302261', firstName: 'Ben', lastName: 'Cruz', highestEducationalAttainment: 'Doctorate', shsTrack: 'STEM',
    vocationalCourse: 'Cookery', vocationalLevel: 'NC I', collegeDegree: 'BSN'
  });
  assert.equal(res.status, 201, await res.clone().text());
  const edu = log.find((l) => /INSERT INTO esf7_perssonel_educ/.test(l.sql));
  assert.deepEqual(edu.params.slice(2, 7), ['DOCTORATE', 'STEM', 'COOKERY', 'NC I', 'BSN']);
});

test('PUT updates a record carrying the DepEd-email flags (no_deped_email / allow_email_discrepancy)', async () => {
  const res = await send('PUT', `${base}/PER-302261-001`, {
    school_id: '302261', first_name: 'Ana', last_name: 'Reyes', nature_of_appointment: 'JOB ORDER',
    no_deped_email: true, allow_email_discrepancy: 'true'
  });
  assert.notEqual(res.status, 500, await res.clone().text());
  const upd = log.find((l) => /UPDATE esf7_personnel_profile SET/.test(l.sql));
  assert.ok(upd, 'profile UPDATE issued');
  assert.ok(upd.params.includes(true), 'flags reached the UPDATE parameters');
  assert.ok(!log.some((l) => /ROLLBACK/.test(l.sql)), 'no rollback');
});
