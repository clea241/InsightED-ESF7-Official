import { describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { coerceDateField } = require('../../utils/dateInput');

describe('coerceDateField', () => {
  test.each(['N/A', 'n/a', '', '-', 'None', null, undefined])('placeholder %p -> null', (v) => {
    expect(coerceDateField(v, 'x')).toBeNull();
  });
  test('valid dates normalize to YYYY-MM-DD', () => {
    expect(coerceDateField('2026-01-05T08:00:00.000Z', 'x')).toBe('2026-01-05');
    expect(coerceDateField('3/4/2020', 'x')).toBe('2020-03-04');
  });
  test('garbage gives a 422 that names the field', () => {
    expect.assertions(3);
    try { coerceDateField('soon', 'new_station_date'); } catch (e) {
      expect(e.status).toBe(422);
      expect(e.field).toBe('new_station_date');
      expect(e.message).toContain('new_station_date');
    }
  });
});
