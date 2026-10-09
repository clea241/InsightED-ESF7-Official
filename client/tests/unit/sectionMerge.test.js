import { describe, test, expect } from 'vitest';
import { mergeSectionsByKey, normalizeSchoolYear, inSchoolYear } from '../../src/services/sectionMerge';

const db = (id, name, extra = {}) => ({ id, gradeLevel: 'Grade 7', sectionName: name, numberOfLearners: 40, schoolYear: 'SY 26-27', ...extra });

describe('normalizeSchoolYear', () => {
  test('all spellings give one format', () => {
    for (const v of ['SY 26-27', 'SY 2026-2027', '2026-2027', '26-27']) expect(normalizeSchoolYear(v)).toBe('SY 26-27');
  });
  test('inSchoolYear keeps old-format rows', () => {
    expect(inSchoolYear([{ id: 1, schoolYear: '2026-2027' }, { id: 2, schoolYear: 'SY 25-26' }], 'SY 2026-2027').map(s => s.id)).toEqual([1]);
  });
});

describe('mergeSectionsByKey', () => {
  const rows = [db('sec-draft-1', 'A'), db('sec-draft-2', 'B')];
  test('identical draft -> no differences, nothing appended', () => {
    const m = mergeSectionsByKey(rows, rows.map(r => ({ ...r })));
    expect(m.hasDifferences).toBe(false);
    expect(m.merged).toHaveLength(2);
  });
  test('draft copy under a different id but same grade+name is not added twice', () => {
    const m = mergeSectionsByKey(rows, [db('other-id', 'a')]);
    expect(m.merged).toHaveLength(2);
    expect(m.added).toHaveLength(0);
  });
  test('empty or stale draft never hides database rows', () => {
    expect(mergeSectionsByKey(rows, []).merged).toHaveLength(2);
    expect(mergeSectionsByKey(rows, [db('sec-draft-1', 'A')]).merged).toHaveLength(2);
  });
  test('new and edited sections are overlaid, db id kept', () => {
    const m = mergeSectionsByKey(rows, [db('x', 'A', { numberOfLearners: 33 }), db('sec-draft-9', 'C')]);
    expect(m.merged).toHaveLength(3);
    expect(m.merged[0].id).toBe('sec-draft-1');
    expect(m.merged[0].numberOfLearners).toBe(33);
    expect(m.added).toHaveLength(1);
    expect(m.edited).toHaveLength(1);
  });
  test('only explicit deletedIds remove a section', () => {
    const m = mergeSectionsByKey(rows, [], { deletedIds: ['sec-draft-2'] });
    expect(m.merged.map(s => s.id)).toEqual(['sec-draft-1']);
    expect(m.removed).toHaveLength(1);
  });
  test('db duplicates collapse', () => {
    expect(mergeSectionsByKey([...rows, ...rows], []).merged).toHaveLength(2);
  });
  test('draft older than newest db row is flagged', () => {
    const m = mergeSectionsByKey([db('1', 'A', { updatedAt: '2026-10-09T10:00:00Z' })], [db('2', 'Z')], { draftUpdatedAt: '2026-10-09T09:00:00Z' });
    expect(m.draftIsOlder).toBe(true);
  });
});

import { diffSections } from '../../src/services/sectionMerge';

describe('diffSections (unsaved-changes check)', () => {
  const saved = [
    { id: 'a', gradeLevel: 'Grade 7', sectionName: 'A', numberOfLearners: 40, maleLearners: 20, femaleLearners: 20, advisorId: 'PER-1', sectionType: 'MONO GRADE' },
    { id: 'b', gradeLevel: 'Grade 8', sectionName: 'B', numberOfLearners: null, advisorId: null }
  ];
  test('identical content in a different order, with different ids and defaults, is clean', () => {
    const current = [
      { id: 'zzz', grade_level: 'grade 8', section_name: ' b ', numberOfLearners: 0, maleLearners: null, adviserId: '', sectionType: undefined },
      { id: 'a', gradeLevel: 'Grade 7', sectionName: 'A', numberOfLearners: '40', maleLearners: 20, femaleLearners: 20, advisorId: 'per-1', extraDerivedName: 'JUAN' }
    ];
    expect(diffSections(saved, current)).toEqual([]);
  });
  test('a real edit names the section, field, old and new value', () => {
    const current = [{ ...saved[0], advisorId: 'PER-2' }, saved[1]];
    expect(diffSections(saved, current)).toEqual([{ section: 'Grade 7 A', field: 'advisorId', from: 'PER-1', to: 'PER-2' }]);
  });
  test('added and removed sections are changes', () => {
    expect(diffSections(saved, [saved[0]]).map(d => d.to)).toContain('removed');
    expect(diffSections(saved, [...saved, { id: 'c', gradeLevel: 'Grade 9', sectionName: 'C' }]).map(d => d.to)).toContain('added');
  });
});
