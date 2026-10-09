import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildReport, reportToText, describeRequest, summarizePayload, noteApiError, noteApiSuccess, takeRecentApiError, markErrorHandled, reportError } from '../../src/services/errorAlert';

const apiErr = (over = {}) => Object.assign(new Error('invalid input syntax for type date: "N/A"'), {
  name: 'ApiError', status: 500, statusText: 'Internal Server Error', method: 'PUT', url: '/api/personnel/PER-300488-001?token=abc123',
  body: { error: 'invalid input syntax for type date: "N/A"' }, payloadKeys: ['id', 'last_promotion_date'], requestIds: { personnel_id: 'PER-300488-001' }, ...over
});

describe('report building', () => {
  test('carries status, method+url, server body, ids and a plain-language action', () => {
    const r = buildReport(apiErr(), {});
    expect(r.status).toBe(500);
    expect(r.method).toBe('PUT');
    expect(r.action).toBe('Saving personnel record PER-300488-001');
    expect(r.responseBody).toContain('invalid input syntax');
    expect(r.payloadKeys).toContain('last_promotion_date');
    expect(reportToText(r)).toContain('Request: PUT');
  });
  test('tokens never reach the report', () => {
    const r = buildReport(apiErr({ message: 'bad Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk token=secret123' }), {});
    const text = reportToText(r);
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('secret123');
    expect(text).not.toContain('eyJhbGci');
  });
  test('describeRequest names common screens', () => {
    expect(describeRequest('POST', '/api/sections/regular/sync')).toBe('Saving class sections');
    expect(describeRequest('PUT', '/api/workloads/personnel/PER-1')).toContain('Saving workload');
  });
  test('summarizePayload keeps field names and ids, drops secrets', () => {
    const s = summarizePayload(JSON.stringify({ personnel_id: 'P1', password: 'x', notes: 'long text' }));
    expect(s.payloadKeys).toEqual(['personnel_id', 'notes']);
    expect(s.ids).toEqual({ personnel_id: 'P1' });
  });
});

describe('claiming and noise rules', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('a later success of the same request cancels the pending failure', () => {
    const e = apiErr();
    noteApiError(e);
    noteApiSuccess('PUT', '/api/personnel/PER-300488-001');
    vi.advanceTimersByTime(10000);
    expect(e.__reported).toBeUndefined();
  });
  test('takeRecentApiError hands back the failure once and claims it', () => {
    const e = apiErr({ url: '/api/x/claim' });
    noteApiError(e);
    expect(takeRecentApiError()).toBe(e);
    expect(takeRecentApiError()).toBeNull();
    vi.advanceTimersByTime(10000);
    expect(e.__reported).toBe(true);
  });
  test('401 and 404 are not reported on their own', () => {
    const a = apiErr({ status: 404, url: '/api/a' });
    const b = apiErr({ status: 401, url: '/api/b' });
    noteApiError(a); noteApiError(b);
    expect(takeRecentApiError()).toBeNull();
  });
  test('aborts, handled errors and expected statuses never show a dialog', async () => {
    const abort = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
    await reportError(abort);
    const handled = apiErr({ url: '/api/h' });
    markErrorHandled(handled);
    await reportError(handled);
    await reportError(apiErr({ status: 404, url: '/api/n' }), { expectedStatuses: [404] });
    expect(console.error).not.toHaveBeenCalled();
  });
});
