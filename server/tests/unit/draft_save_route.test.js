// Run with: npm run test:unit
// Exercises PUT/GET /api/school/draft with an in-memory stand-in for PostgreSQL (no real database is touched).
import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequire } from 'node:module';

// Load through Node's own require so the stubbed db object is the SAME instance the controller gets.
const nodeRequire = createRequire(import.meta.url);
const db = nodeRequire('../../db/index.js');
const schoolsRouter = nodeRequire('../../controllers/schools/index.js');

// --- fake school_drafts table implementing the same semantics as the SQL in the route ---
const rows = new Map(); // "school|year" -> { payload, version, updated_at }
let failWrites = false;

db.query = async (sql, params = []) => {
  const text = String(sql);
  if (/information_schema\.columns/.test(text)) return { rows: [{ '?column?': 1 }] };
  if (/^\s*SELECT payload FROM school_drafts/.test(text)) {
    const r = rows.get(`${params[0]}|${params[1]}`);
    return { rows: r ? [{ payload: r.payload }] : [] };
  }
  if (/SELECT version, updated_at FROM school_drafts/.test(text)) {
    const r = rows.get(`${params[0]}|${params[1]}`);
    return { rows: r ? [{ version: r.version, updated_at: r.updated_at }] : [] };
  }
  if (/SELECT payload, updated_at/.test(text)) {
    const r = rows.get(`${params[0]}|${params[1]}`);
    return { rows: r ? [{ payload: r.payload, updated_at: r.updated_at, version: r.version }] : [] };
  }
  if (/INSERT INTO school_drafts/.test(text)) {
    if (failWrites) throw new Error('simulated database failure');
    const key = `${params[0]}|${params[1]}`;
    const existing = rows.get(key);
    const base = params[3];
    if (existing && base !== null && base !== undefined && existing.version !== Number(base)) return { rows: [] };
    const next = { payload: JSON.parse(params[2]), version: existing ? existing.version + 1 : 1, updated_at: new Date().toISOString() };
    rows.set(key, next);
    return { rows: [{ version: next.version, updated_at: next.updated_at }] };
  }
  return { rows: [] };
};

let server;
let base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/school', schoolsRouter);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/school/draft`;
});
afterAll(() => { server.close(); });

const put = (body) => fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-school-id': '302261' }, body: JSON.stringify(body) });
const payloadOf = (text) => ({ schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], note: text });

test('save responds only after the row is committed, and login-time read sees it', async () => {
  const res = await put({ schoolYear: 'SY 26-27', payload: payloadOf('a'), baseVersion: null });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.version, 1);
  assert.equal(rows.get('302261|SY 26-27').payload.note, 'a'); // already in the table when the response arrived
  const got = await (await fetch(`${base}?schoolYear=SY%2026-27`, { headers: { 'x-school-id': '302261' } })).json();
  assert.equal(got.payload.note, 'a');
  assert.equal(got.version, 1);
});

test('database failure is reported as an error, never as success', async () => {
  failWrites = true;
  const res = await put({ schoolYear: 'SY 26-27', payload: payloadOf('b'), baseVersion: 1 });
  failWrites = false;
  assert.equal(res.status, 500);
  assert.notEqual((await res.json()).success, true);
  assert.equal(rows.get('302261|SY 26-27').payload.note, 'a'); // nothing was changed
});

test('stale baseVersion gets 409 and does not overwrite the newer copy', async () => {
  await put({ schoolYear: 'SY 26-27', payload: payloadOf('c'), baseVersion: 1 }); // -> version 2 (another session)
  const res = await put({ schoolYear: 'SY 26-27', payload: payloadOf('old device'), baseVersion: 1 });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.conflict, true);
  assert.equal(body.currentVersion, 2);
  assert.equal(rows.get('302261|SY 26-27').payload.note, 'c');
});

test('an empty roster never replaces a populated one', async () => {
  const res = await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [] }, baseVersion: 2 });
  assert.equal(res.status, 200);
  assert.equal(rows.get('302261|SY 26-27').payload.personnel.length, 1);
});

test('sections merge by stable ID when incoming count drops without explicit confirmation (44 + 2 = 46)', async () => {
  // 1. Setup 44 sections in the draft
  const initialSections = Array.from({ length: 44 }, (_, i) => ({
    id: `sec-${i + 1}`,
    gradeLevel: `Grade ${7 + (i % 3)}`,
    sectionName: `Section ${i + 1}`,
    numberOfLearners: 35
  }));
  await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], classSections: initialSections }, baseVersion: 3 });
  assert.equal(rows.get('302261|SY 26-27').payload.classSections.length, 44);

  // 2. Incoming payload only sends 2 sections (user added 2 new sections or partial state)
  const incomingTwo = [
    { id: 'sec-new-1', gradeLevel: 'Grade 7', sectionName: 'New Sec 1', numberOfLearners: 30 },
    { id: 'sec-new-2', gradeLevel: 'Grade 7', sectionName: 'New Sec 2', numberOfLearners: 32 }
  ];
  const res = await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], classSections: incomingTwo }, baseVersion: 4 });
  assert.equal(res.status, 200);

  // 3. Merged result must retain all 44 original + 2 new = 46 sections! Zero data loss!
  const savedSections = rows.get('302261|SY 26-27').payload.classSections;
  assert.equal(savedSections.length, 46);
  assert.ok(savedSections.some(s => s.id === 'sec-1'));
  assert.ok(savedSections.some(s => s.id === 'sec-new-1'));
  assert.ok(savedSections.some(s => s.id === 'sec-new-2'));
});

test('empty classSections never replaces populated classSections without explicit delete confirmation', async () => {
  const res = await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], classSections: [] }, baseVersion: 5 });
  assert.equal(res.status, 200);
  assert.equal(rows.get('302261|SY 26-27').payload.classSections.length, 46);
});

test('allowSectionDeletion allows clearing sections when user explicitly confirms', async () => {
  const res = await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], classSections: [], allowSectionDeletion: true }, baseVersion: 6 });
  assert.equal(res.status, 200);
  assert.equal(rows.get('302261|SY 26-27').payload.classSections.length, 0);
});

test('duplicate sections with same ID or same grade+name are automatically deduplicated on save', async () => {
  const duplicateSections = [
    { id: 'sec-1', gradeLevel: 'Grade 7', sectionName: 'Section A', numberOfLearners: 40 },
    { id: 'sec-1', gradeLevel: 'Grade 7', sectionName: 'Section A', numberOfLearners: 40 },
    { id: 'sec-2', gradeLevel: 'Grade 8', sectionName: 'Section B', numberOfLearners: 35 },
    { id: 'sec-diff-id', gradeLevel: 'Grade 8', sectionName: 'Section B', numberOfLearners: 35 }
  ];
  const res = await put({ schoolYear: 'SY 26-27', payload: { schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], classSections: duplicateSections }, baseVersion: 7 });
  assert.equal(res.status, 200);
  const saved = rows.get('302261|SY 26-27').payload.classSections;
  assert.equal(saved.length, 2);
  assert.ok(saved.some(s => s.sectionName === 'Section A'));
  assert.ok(saved.some(s => s.sectionName === 'Section B'));
});


