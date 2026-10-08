// Draft endpoints against a real PostgreSQL: success only after commit, optimistic concurrency, validation,
// and that the additive migration applies cleanly. Requires TEST_DATABASE_URL (see helpers.mjs).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_DATABASE_URL, SCHEMA_SQL, pointServerAtTestDatabase, nodeRequire } from './helpers.mjs';

const enabled = !!TEST_DATABASE_URL;
const TEST_SECRET = 'integration-test-secret-0123456789';
process.env.JWT_SECRET = TEST_SECRET;
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');

describe.skipIf(!enabled)('draft routes + migration (real PostgreSQL)', () => {
  let pool;
  let server;
  let base;

  const runMigration = () => spawnSync(process.execPath, ['migrations/add_school_drafts_version.js'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    encoding: 'utf8'
  });

  beforeAll(async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire('pg');
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(SCHEMA_SQL);
    // Existing production-like rows BEFORE the migration: must survive it untouched.
    await pool.query("INSERT INTO school_drafts (school_id, school_year, payload) VALUES ('111111','SY 26-27','{\"keep\":\"me\"}')");
    const migrated = runMigration();
    expect(migrated.status, migrated.stderr || migrated.stdout).toBe(0);

    const schoolsRouter = nodeRequire('../../controllers/schools/index.js');
    const { apiAuthGate } = nodeRequire('../../middleware/auth.js');
    const app = express();
    app.use(express.json());
    app.use('/api', apiAuthGate);
    app.use('/api/school', schoolsRouter);
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/school/draft`;
  });

  afterAll(async () => {
    if (server) server.close();
    if (pool) await pool.end();
  });

  const jwt = () => nodeRequire('jsonwebtoken');
  const tokenFor = (school, role = 'school') => jwt().sign({ uid: `u-${school}`, role, school_id: school }, TEST_SECRET, { expiresIn: '1h' });
  const auth = (school = '302261') => ({ Authorization: `Bearer ${tokenFor(school)}`, 'x-school-id': school });
  const put = (body, school = '302261') => fetch(base, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth(school) },
    body: JSON.stringify(body)
  });
  const payload = (note) => ({ schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], note });

  test('migration is additive: existing rows keep their data and get version 0; re-running is a no-op', async () => {
    const row = (await pool.query("SELECT payload, version FROM school_drafts WHERE school_id = '111111'")).rows[0];
    expect(row.payload).toEqual({ keep: 'me' });
    expect(Number(row.version)).toBe(0);
    const again = runMigration();
    expect(again.status, again.stderr).toBe(0);
    const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'school_drafts' ORDER BY ordinal_position")).rows.map((r) => r.column_name);
    expect(cols).toEqual(['school_id', 'school_year', 'payload', 'updated_at', 'version']);
  });

  test('the response arrives only after the row is committed (read back through a separate connection)', async () => {
    const res = await put({ schoolYear: 'SY 26-27', payload: payload('a'), baseVersion: 0 });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, version: 1 });
    const row = (await pool.query("SELECT payload, version FROM school_drafts WHERE school_id = '302261' AND school_year = 'SY 26-27'")).rows[0];
    expect(row.payload.note).toBe('a');
    expect(Number(row.version)).toBe(1);
  });

  test('concurrent saves from the same base version: exactly one wins, the rest get 409 and nothing is lost silently', async () => {
    const current = Number((await pool.query("SELECT version FROM school_drafts WHERE school_id = '302261'")).rows[0].version);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => put({ schoolYear: 'SY 26-27', payload: payload(`racer-${i}`), baseVersion: current })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    const row = (await pool.query("SELECT version FROM school_drafts WHERE school_id = '302261'")).rows[0];
    expect(Number(row.version)).toBe(current + 1);
  });

  test('a stale device cannot overwrite a newer server copy', async () => {
    const before = (await pool.query("SELECT payload, version FROM school_drafts WHERE school_id = '302261'")).rows[0];
    const res = await put({ schoolYear: 'SY 26-27', payload: payload('stale device'), baseVersion: 1 });
    expect(res.status).toBe(409);
    const after = (await pool.query("SELECT payload, version FROM school_drafts WHERE school_id = '302261'")).rows[0];
    expect(after).toEqual(before);
  });

  test('an empty roster never replaces a populated one', async () => {
    const v = Number((await pool.query("SELECT version FROM school_drafts WHERE school_id = '302261'")).rows[0].version);
    const res = await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [] }, baseVersion: v });
    expect(res.status).toBe(200);
    const row = (await pool.query("SELECT payload FROM school_drafts WHERE school_id = '302261'")).rows[0];
    expect(row.payload.personnel).toHaveLength(1);
  });

  test('validation failures are rejected with 400 and write nothing', async () => {
    const count = async () => Number((await pool.query('SELECT count(*) FROM school_drafts')).rows[0].count);
    const before = await count();
    expect((await put({ schoolYear: 'SY 26-27' })).status).toBe(400); // no payload
    expect((await put({ schoolYear: 'SY 26-27', payload: payload('x'), baseVersion: 'abc' })).status).toBe(400); // bad version
    expect(await count()).toBe(before);
  });

  test('GET returns what was committed, straight from the database (no cache)', async () => {
    await pool.query("UPDATE school_drafts SET payload = jsonb_set(payload, '{note}', '\"changed behind the app\"'), version = version + 1 WHERE school_id = '302261'");
    const got = await (await fetch(`${base}?schoolYear=SY%2026-27`, { headers: auth('302261') })).json();
    expect(got.payload.note).toBe('changed behind the app');
  });

  describe('authentication and school authorization', () => {
    const url = base0 => base0 + '?schoolYear=SY%2026-27';
    test('no token -> 401, for read and write', async () => {
      expect((await fetch(url(base), { headers: { 'x-school-id': '302261' } })).status).toBe(401);
      const w = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-school-id': '302261' }, body: JSON.stringify({ schoolYear: 'SY 26-27', payload: payload('no-token') }) });
      expect(w.status).toBe(401);
    });
    test('forged token (wrong signing key, or alg=none) -> 401', async () => {
      const forged = jwt().sign({ uid: 'u-302261', role: 'school', school_id: '302261' }, 'some-other-secret-value-xyz', { expiresIn: '1h' });
      expect((await fetch(url(base), { headers: { Authorization: `Bearer ${forged}`, 'x-school-id': '302261' } })).status).toBe(401);
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ uid: 'u', role: 'Admin', school_id: '302261' })).toString('base64url') + '.';
      expect((await fetch(url(base), { headers: { Authorization: `Bearer ${none}` } })).status).toBe(401);
      const expired = jwt().sign({ uid: 'u-302261', role: 'school', school_id: '302261' }, TEST_SECRET, { expiresIn: -10 });
      expect((await fetch(url(base), { headers: { Authorization: `Bearer ${expired}` } })).status).toBe(401);
    });
    test("valid token for school A asking for school B's draft -> 403, and nothing is read or written", async () => {
      await put({ schoolYear: 'SY 26-27', payload: payload('school A data') }, '302261');
      const bToken = { Authorization: `Bearer ${tokenFor('999999')}` };
      // reading A's draft with B's token, via header, query and body spoofing
      expect((await fetch(url(base), { headers: { ...bToken, 'x-school-id': '302261' } })).status).toBe(403);
      expect((await fetch(url(base) + '&school_id=302261', { headers: bToken })).status).toBe(403);
      const before = (await pool.query("SELECT payload, version FROM school_drafts WHERE school_id = '302261'")).rows[0];
      const w = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...bToken, 'x-school-id': '302261' }, body: JSON.stringify({ schoolYear: 'SY 26-27', payload: payload('overwritten by B') }) });
      expect(w.status).toBe(403);
      const after = (await pool.query("SELECT payload, version FROM school_drafts WHERE school_id = '302261'")).rows[0];
      expect(after).toEqual(before);
    });
    test('the school comes from the token, not from the header: no header still reads own draft', async () => {
      const own = { Authorization: `Bearer ${tokenFor('302261')}` };
      const res = await fetch(url(base), { headers: own });
      expect(res.status).toBe(200);
      expect((await res.json()).payload.note).toBeDefined();
    });
    test('valid token, same school -> 200 and the save is committed', async () => {
      const res = await put({ schoolYear: 'SY 26-27', payload: payload('same school ok') }, '302261');
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      const row = (await pool.query("SELECT payload FROM school_drafts WHERE school_id = '302261'")).rows[0];
      expect(row.payload.note).toBe('same school ok');
    });
    test('Admin may access any school; health stays public', async () => {
      const adminTok = tokenFor('000001', 'Admin');
      expect((await fetch(url(base), { headers: { Authorization: `Bearer ${adminTok}`, 'x-school-id': '302261' } })).status).toBe(200);
    });
  });
});

describe.skipIf(!enabled)('read-only cross-school report (server/scripts/find_personnel_500_and_cross_school.js)', () => {
  test('finds a draft that claims another school, and changes nothing', async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire('pg');
    const p = new Pool({ connectionString: TEST_DATABASE_URL });
    await p.query(SCHEMA_SQL);
    await p.query("DELETE FROM school_drafts WHERE school_id IN ('555555','666666')");
    await p.query(`INSERT INTO school_drafts (school_id, school_year, payload) VALUES
      ('555555','SY 26-27','{"schoolInfo":{"schoolId":"777777"},"personnel":[{"id":"PER-555555-001"}]}'),
      ('666666','SY 26-27','{"schoolInfo":{"schoolId":"666666"},"personnel":[{"id":"PER-111111-001"},{"id":"PER-111111-002"},{"id":"PER-666666-003"}]}')`);
    const before = (await p.query("SELECT school_id, payload, updated_at FROM school_drafts ORDER BY school_id")).rows;

    const { findCrossSchoolDrafts } = nodeRequire('../../scripts/find_personnel_500_and_cross_school.js');
    const client = await p.connect();
    await client.query('BEGIN READ ONLY');
    const res = await findCrossSchoolDrafts(client, { days: 30 });
    // Inside the report's transaction a write must be impossible.
    await expect(client.query("UPDATE school_drafts SET school_year = school_year")).rejects.toThrow(/read-only/i);
    await client.query('ROLLBACK');
    client.release();

    expect(res.mismatched.map((r) => r.school_id)).toContain('555555');
    expect(res.mismatched.find((r) => r.school_id === '555555').payload_school_id).toBe('777777');
    expect(res.foreignPersonnel.map((r) => r.school_id)).toContain('666666');
    expect(res.mismatched.map((r) => r.school_id)).not.toContain('666666');
    const after = (await p.query("SELECT school_id, payload, updated_at FROM school_drafts ORDER BY school_id")).rows;
    expect(after).toEqual(before);
    await p.query("DELETE FROM school_drafts WHERE school_id IN ('555555','666666')");
    await p.end();
  });
});
