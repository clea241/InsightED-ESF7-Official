// Run with: npm run test:unit
import { test, expect } from 'vitest';
import {
  NO_VERSION, versionOf, compositeRowKey, dedupeWorkloadRows, rowsFingerprint, decideWorkloadMerge
} from '../../src/services/workloadMerge.js';

const P = 'PER-1';
const block = (over = {}) => ({
  id: 'r-1', term: '1st', subject: 'MATHEMATICS', sectionId: 'S1', gradeLevel: 'Grade 1',
  startTime: '08:00', endTime: '09:00', days: ['M', 'W'], ...over
});

test('versionOf maps a missing marker to NO_VERSION', () => {
  expect(versionOf(null)).toBe(NO_VERSION);
  expect(versionOf(undefined)).toBe(NO_VERSION);
  expect(versionOf('2026-10-09T03:25:49.303Z')).toBe('2026-10-09T03:25:49.303Z');
});

test('the composite key ignores the id, day order and seconds, but not the slot or subject', () => {
  const a = block({ id: 'x', days: ['W', 'M'], startTime: '08:00:00' });
  const b = block({ id: 'y', days: ['M', 'W'], startTime: '08:00' });
  expect(compositeRowKey(P, a)).toBe(compositeRowKey(P, b));
  expect(compositeRowKey(P, block({ startTime: '09:00' }))).not.toBe(compositeRowKey(P, b));
  expect(compositeRowKey(P, block({ subject: 'SCIENCE' }))).not.toBe(compositeRowKey(P, b));
  expect(compositeRowKey(P, block({ term: '2nd' }))).not.toBe(compositeRowKey(P, b));
});

test('dedupe drops the same id twice and the same slot under a new id (regenerated Advisory/HGP), keeping the first', () => {
  const dbAdvisory = block({ id: 'WKL-1', subject: 'ADVISORY', startTime: '16:30', endTime: '17:00' });
  const regenerated = block({ id: 'r-new-77', subject: 'ADVISORY', startTime: '16:30', endTime: '17:00' });
  const sameIdAgain = block({ id: 'WKL-1', subject: 'ADVISORY', startTime: '16:30', endTime: '17:00' });
  const other = block({ id: 'WKL-2', subject: 'SCIENCE', startTime: '10:00', endTime: '11:00' });
  const out = dedupeWorkloadRows(P, [dbAdvisory, regenerated, sameIdAgain, other]);
  expect(out.map((r) => r.id)).toEqual(['WKL-1', 'WKL-2']);
});

test('fingerprints compare one term only and ignore order and ids', () => {
  const a = [block({ id: '1' }), block({ id: '2', startTime: '10:00' }), block({ id: '3', term: '2nd' })];
  const b = [block({ id: 'z', startTime: '10:00' }), block({ id: 'y' })];
  expect(rowsFingerprint(P, a, '1st')).toBe(rowsFingerprint(P, b, '1st'));
  expect(rowsFingerprint(P, a, '2nd')).not.toBe(rowsFingerprint(P, b, '2nd'));
});

const decide = (over) => decideWorkloadMerge({ personId: P, term: '1st', dbRows: [], dbVersion: null, localRows: [], hasDraft: false, ...over });

test('same schedule on both sides: show the saved rows', () => {
  const r = decide({ dbRows: [block({ id: 'WKL-1' })], dbVersion: 'v1', localRows: [block({ id: 'r-1' })], localBaseVersion: 'v0' });
  expect(r).toEqual({ action: 'adopt-db', reason: 'in-sync' });
});

test('nothing saved yet but local rows exist: the local copy is the only copy, keep it', () => {
  expect(decide({ localRows: [block()], hasDraft: true }).action).toBe('keep-local');
});

test('local edits made on top of the current saved version: keep them (including a local deletion)', () => {
  const dbRows = [block({ id: 'WKL-1' }), block({ id: 'WKL-2', startTime: '10:00' })];
  const r = decide({ dbRows, dbVersion: 'v1', localRows: [block({ id: 'WKL-1' })], localBaseVersion: 'v1', hasDraft: true });
  expect(r).toEqual({ action: 'keep-local', reason: 'unsaved-changes' });
});

test('local draft built on an older version while the database moved on: conflict, never a silent overwrite', () => {
  const r = decide({ dbRows: [block({ id: 'WKL-9', startTime: '11:00' })], dbVersion: 'v2', localRows: [block()], localBaseVersion: 'v1', hasDraft: true });
  expect(r).toEqual({ action: 'conflict', reason: 'database-is-newer' });
});

test('local rows with no known baseline that differ from saved rows: conflict', () => {
  const r = decide({ dbRows: [block({ id: 'WKL-9', startTime: '11:00' })], dbVersion: 'v2', localRows: [block()], hasDraft: true });
  expect(r).toEqual({ action: 'conflict', reason: 'unknown-baseline' });
});

test('nothing local and no draft: just show the saved rows', () => {
  const r = decide({ dbRows: [block({ id: 'WKL-1' })], dbVersion: 'v1', localRows: [], hasDraft: false });
  expect(r).toEqual({ action: 'adopt-db', reason: 'no-local-data' });
});

test('an intentionally emptied local draft is not overwritten silently when the database has newer rows', () => {
  const r = decide({ dbRows: [block({ id: 'WKL-1' })], dbVersion: 'v2', localRows: [], localBaseVersion: 'v1', hasDraft: true });
  expect(r.action).toBe('conflict');
});

test('other terms never influence the decision', () => {
  const r = decide({
    dbRows: [block({ id: 'WKL-1' }), block({ id: 'WKL-2', term: '2nd', startTime: '13:00' })], dbVersion: 'v1',
    localRows: [block({ id: 'r-1' })], localBaseVersion: 'v0'
  });
  expect(r.action).toBe('adopt-db');
});

// ── block-by-block merge ──
import { threeWayMergeTerm, decideWorkloadMergeDetailed, rowsContentFingerprint, rowContentKey } from '../../src/services/workloadMerge.js';

const slot = (id, start, over = {}) => block({ id, startTime: start, endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`, ...over });
const merge = (base, local, db) => threeWayMergeTerm({ personId: P, term: '1st', baseRows: base, localRows: local, dbRows: db });
const ids = (rows) => rows.map((r) => r.id).sort();

test('content key ignores the id and server bookkeeping fields, but sees a real edit', () => {
  const saved = { ...slot('WKL-1', '08:00'), personnelId: P, createdAt: 'x', rawPayload: {}, start_time: '08:00' };
  expect(rowContentKey(saved)).toBe(rowContentKey(slot('r-9', '08:00')));
  expect(rowContentKey(slot('r-9', '09:00'))).not.toBe(rowContentKey(slot('r-9', '08:00')));
  expect(rowsContentFingerprint([slot('a', '08:00'), slot('b', '09:00')])).toBe(rowsContentFingerprint([slot('y', '09:00'), slot('x', '08:00')]));
});

test('untouched local blocks take the database version; a block added elsewhere appears once', () => {
  const base = [slot('1', '08:00'), slot('2', '09:00')];
  const db = [slot('1', '08:00'), slot('2', '09:00', { subject: 'SCIENCE' }), slot('3', '10:00')]; // 2 edited and 3 added from another device
  const r = merge(base, base, db);
  expect(r.hasLocalChanges).toBe(false);
  expect(r.useDatabase.find((x) => x.id === '2').subject).toBe('SCIENCE');
  expect(ids(r.keepMine)).toEqual(['1', '2', '3']);
  expect(r.conflicts).toEqual([]);
});

test('only the blocks edited locally are overlaid on top of the saved rows', () => {
  const base = [slot('1', '08:00'), slot('2', '09:00')];
  const local = [slot('1', '08:00'), slot('2', '09:00', { subject: 'ENGLISH' }), slot('4', '13:00')]; // 2 edited, 4 added here
  const db = [slot('1', '08:00'), slot('2', '09:00'), slot('3', '10:00')]; // 3 added elsewhere
  const r = merge(base, local, db);
  expect(r.conflicts).toEqual([]);
  expect(r.hasLocalChanges).toBe(true);
  expect(ids(r.keepMine)).toEqual(['1', '2', '3', '4']);
  expect(r.keepMine.find((x) => x.id === '2').subject).toBe('ENGLISH');
});

test('a block removed locally stays removed, and one removed elsewhere is not resurrected from the draft', () => {
  const base = [slot('1', '08:00'), slot('2', '09:00'), slot('3', '10:00')];
  const local = [slot('2', '09:00'), slot('3', '10:00')];           // removed 1 here
  const db = [slot('1', '08:00'), slot('2', '09:00')];               // removed 3 elsewhere
  const r = merge(base, local, db);
  expect(ids(r.keepMine)).toEqual(['2']);
  expect(r.hasLocalChanges).toBe(true);
});

test('the same block edited differently on both sides is a conflict, with both outcomes available', () => {
  const base = [slot('1', '08:00')];
  const local = [slot('1', '08:00', { subject: 'ENGLISH' })];
  const db = [slot('1', '08:00', { subject: 'SCIENCE' })];
  const r = merge(base, local, db);
  expect(r.conflicts).toHaveLength(1);
  expect(r.keepMine[0].subject).toBe('ENGLISH');
  expect(r.useDatabase[0].subject).toBe('SCIENCE');
});

test('the same edit made on both sides is not a conflict and not an unsaved change', () => {
  const base = [slot('1', '08:00')];
  const edited = [slot('1', '08:00', { subject: 'ENGLISH' })];
  const r = merge(base, edited, edited);
  expect(r.conflicts).toEqual([]);
  expect(r.hasLocalChanges).toBe(false);
});

test('a regenerated Advisory/HGP row with a new id is the saved block, not a second one', () => {
  const advisory = (id) => slot(id, '16:30', { subject: 'ADVISORY' });
  const r = merge([advisory('WKL-5')], [advisory('r-new-1')], [advisory('WKL-5')]);
  expect(r.keepMine).toHaveLength(1);
  expect(r.keepMine[0].id).toBe('WKL-5');
  expect(r.hasLocalChanges).toBe(false);
});

test('a draft entry identical to the database leaves nothing to keep', () => {
  const rows = [slot('1', '08:00'), slot('2', '09:00')];
  const d = decideWorkloadMergeDetailed({ personId: P, term: '1st', dbRows: rows, dbVersion: 'v2', localRows: rows.map((r) => ({ ...r, id: `local-${r.id}` })), baseRows: [], localBaseVersion: 'v1', hasDraft: true });
  expect(d.action).toBe('adopt-db');
  expect(d.hasLocalChanges).toBe(false);
});

test('detailed decision: merged edits, conflict, and the whole-term fallback when no baseline is known', () => {
  const base = [slot('1', '08:00')];
  expect(decideWorkloadMergeDetailed({ personId: P, term: '1st', dbRows: base, dbVersion: 'v1', localRows: [...base, slot('2', '09:00')], baseRows: base, localBaseVersion: 'v1', hasDraft: true }).action).toBe('merged');
  expect(decideWorkloadMergeDetailed({
    personId: P, term: '1st', dbVersion: 'v2', baseRows: base, hasDraft: true,
    dbRows: [slot('1', '08:00', { subject: 'SCIENCE' })], localRows: [slot('1', '08:00', { subject: 'ENGLISH' })]
  }).action).toBe('conflict');
  const legacy = decideWorkloadMergeDetailed({ personId: P, term: '1st', dbRows: [slot('9', '11:00')], dbVersion: 'v2', localRows: [slot('1', '08:00')], hasDraft: true });
  expect(legacy).toMatchObject({ action: 'conflict', reason: 'unknown-baseline', wholeTerm: true });
});

test('"8:00", "08:00" and "08:00:00" are the same time in a block key (formatting alone never looks like an edit)', () => {
  const a = block({ startTime: '8:00', endTime: '9:00' });
  const b = block({ startTime: '08:00:00', endTime: '09:00' });
  expect(compositeRowKey(P, a)).toBe(compositeRowKey(P, b));
});

// ── restore prompt: draft vs saved rows ──
import { compareDraftToDatabase, isDraftNewer, summarizeWorkloadDiff } from '../../src/services/workloadMerge.js';

const cmp = (over) => compareDraftToDatabase({ personId: P, term: '1st', dbRows: [], dbVersion: '2026-10-09T03:00:00.000Z', localRows: [], ...over });
const DB = [slot('WKL-1', '08:00'), slot('WKL-2', '09:00')];

test('isDraftNewer compares the draft time with the database time, and says null when either is unknown', () => {
  expect(isDraftNewer('2026-10-09T04:00:00.000Z', '2026-10-09T03:00:00.000Z')).toBe(true);
  expect(isDraftNewer('2026-10-09T02:00:00.000Z', '2026-10-09T03:00:00.000Z')).toBe(false);
  expect(isDraftNewer(undefined, '2026-10-09T03:00:00.000Z')).toBe(null);
  expect(isDraftNewer('2026-10-09T04:00:00.000Z', null)).toBe(null);
});

test('a draft identical to the database (different ids, order, time format) is clean: no prompt', () => {
  const draft = [slot('r-9', '09:00'), slot('local-1', '08:00', { startTime: '8:00' })];
  expect(cmp({ dbRows: DB, localRows: draft }).action).toBe('clean');
});

test('an older draft with nothing extra (a subset of the database) is clean', () => {
  const r = cmp({ dbRows: DB, localRows: [slot('x', '08:00')], draftSavedAt: '2026-10-09T01:00:00.000Z' });
  expect(r).toMatchObject({ action: 'clean', reason: 'older-with-nothing-extra' });
});

test('a draft with an extra block prompts, restoring it on top of the saved rows without duplicates', () => {
  const draft = [slot('a', '08:00'), slot('b', '09:00'), slot('c', '13:00')];
  const r = cmp({ dbRows: DB, localRows: draft, draftSavedAt: '2026-10-09T01:00:00.000Z' });
  expect(r.action).toBe('prompt');
  expect(r.summary).toMatchObject({ added: 1, changed: 0, removed: 0 });
  expect(r.rows).toHaveLength(3);
});

test('a changed block is counted as changed, and the draft version replaces the saved one', () => {
  const draft = [slot('WKL-1', '08:00'), slot('WKL-2', '09:00', { subject: 'SCIENCE' })];
  const r = cmp({ dbRows: DB, localRows: draft });
  expect(r.action).toBe('prompt');
  expect(r.summary).toMatchObject({ added: 0, changed: 1, removed: 0 });
  expect(r.rows.find((x) => x.id === 'WKL-2').subject).toBe('SCIENCE');
});

test('a newer draft that lacks a saved block counts it as removed; an older one keeps it', () => {
  const draft = [slot('WKL-1', '08:00'), slot('n', '13:00')];
  const newer = cmp({ dbRows: DB, localRows: draft, draftSavedAt: '2026-10-09T05:00:00.000Z' });
  expect(newer.summary).toMatchObject({ added: 1, removed: 1 });
  expect(newer.rows.map((x) => x.startTime).sort()).toEqual(['08:00', '13:00']);
  const older = cmp({ dbRows: DB, localRows: draft, draftSavedAt: '2026-10-09T01:00:00.000Z' });
  expect(older.summary).toMatchObject({ added: 1, removed: 0 });
  expect(older.rows).toHaveLength(3);
});

test('a restored block never overlaps a saved block: the saved one it overlaps is replaced and counted', () => {
  const draft = [slot('WKL-1', '08:00'), slot('WKL-2', '09:00'), slot('n', '08:30', { endTime: '09:30' })];
  const r = cmp({ dbRows: DB, localRows: draft, draftSavedAt: '2026-10-09T01:00:00.000Z' });
  expect(r.action).toBe('prompt');
  expect(r.summary.overlapsReplaced).toBeGreaterThan(0);
  const overlapping = r.rows.filter((a, i) => r.rows.some((b, j) => i < j && a.startTime < b.endTime && a.endTime > b.startTime));
  expect(overlapping).toEqual([]);
});

test('with a known baseline only the draft\'s own edits are restored, and saved-elsewhere changes are not undone', () => {
  const base = [slot('1', '08:00'), slot('2', '09:00')];
  const db = [slot('1', '08:00'), slot('2', '09:00'), slot('3', '10:00')]; // 3 added from another device
  const draft = [...base, slot('4', '13:00')];                             // 4 added in this browser
  const r = cmp({ dbRows: db, localRows: draft, baseRows: base });
  expect(r.action).toBe('prompt');
  expect(r.rows.map((x) => x.id).sort()).toEqual(['1', '2', '3', '4']);
  expect(r.summary).toMatchObject({ added: 1, changed: 0, removed: 0 });
});

test('with a known baseline and no edits of its own, the draft is clean even though the database moved on', () => {
  const base = [slot('1', '08:00')];
  expect(cmp({ dbRows: [slot('1', '08:00'), slot('2', '09:00')], localRows: base, baseRows: base }).action).toBe('clean');
});

test('summarizeWorkloadDiff counts added, changed and removed against the saved rows', () => {
  const result = [slot('WKL-1', '08:00', { subject: 'SCIENCE' }), slot('new', '14:00')];
  expect(summarizeWorkloadDiff(P, '1st', DB, result)).toEqual({ added: 1, changed: 1, removed: 1 });
});
