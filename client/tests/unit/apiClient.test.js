// API client wrapper: non-OK statuses, 502/503/504 with an HTML body, malformed JSON, timeout, retry with backoff.
// These are the failure modes that used to surface as "Unexpected token '<'" in the console.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const health = vi.hoisted(() => ({
  recordServerFailure: vi.fn(),
  recordServerSuccess: vi.fn(),
  waitUntilHealthy: vi.fn(() => Promise.resolve()),
  configureHealth: vi.fn(),
  isServerFailureStatus: (status) => status === 502 || status === 503 || status === 504
}));
vi.mock('../../src/services/serverHealth.js', () => health);

const { api, ApiError } = await import('../../src/services/api.js');

const htmlResponse = (status) => new Response('<html><body>Gateway Timeout</body></html>', { status, headers: { 'content-type': 'text/html' } });
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('getPersonnel (GET with retry)', () => {
  test('a 504 HTML page becomes a clear ApiError, never a JSON parse error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(504)));
    const p = api.getPersonnel('302261');
    const assertion = expect(p).rejects.toMatchObject({ name: 'ApiError', status: 504 });
    await vi.runAllTimersAsync();
    await assertion;
    await p.catch((e) => {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.message).not.toMatch(/Unexpected token|JSON/);
      expect(e.message).toMatch(/504/);
    });
  });

  test('retries 502/503/504 with exponential backoff (0.5s, 1s, 2s) and then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(htmlResponse(502))
      .mockResolvedValueOnce(htmlResponse(503))
      .mockResolvedValueOnce(htmlResponse(504))
      .mockResolvedValueOnce(jsonResponse([{ id: 'P1' }]));
    vi.stubGlobal('fetch', fetchMock);
    const p = api.getPersonnel('302261');
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 500 ms
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual([{ id: 'P1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('gives up after the retry budget and reports the last status', async () => {
    const fetchMock = vi.fn(async () => htmlResponse(503));
    vi.stubGlobal('fetch', fetchMock);
    const p = api.getPersonnel('302261');
    const assertion = expect(p).rejects.toMatchObject({ status: 503 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 try + 3 retries
  });

  test('a 4xx is NOT retried and NOT counted as a server failure', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'bad' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.getPersonnel('302261')).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(health.recordServerFailure).not.toHaveBeenCalled();
    expect(health.recordServerSuccess).toHaveBeenCalled();
  });

  test('a 200 with a non-JSON body is rejected with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(api.getPersonnel('302261')).rejects.toThrow(/non-JSON/);
  });

  test('malformed JSON with a JSON content type is rejected with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"broken":', { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(api.getPersonnel('302261')).rejects.toThrow(/invalid JSON/);
  });

  test('network failures (TypeError) are retried and reported to the health monitor', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const p = api.getPersonnel('302261');
    await vi.advanceTimersByTimeAsync(600);
    await expect(p).resolves.toEqual([]);
    expect(health.recordServerFailure).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWithAuth timeout and health reporting', () => {
  test('a request that never answers is aborted after 60s and reported as a TimeoutError', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    const p = api.getDashboardStats();
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
    expect(health.recordServerFailure).toHaveBeenCalledTimes(1);
  });

  test('new calls wait while the app is locked (paused, not fired and failed)', async () => {
    let release;
    health.waitUntilHealthy.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const p = api.getDashboardStats();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).not.toHaveBeenCalled();
    release();
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('the auth token is sent but never logged or placed in the URL', async () => {
    globalThis.localStorage.setItem('token', 'header.payload.signature');
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await api.getPersonnel('302261');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('header.payload.signature');
    expect(init.headers.Authorization).toBe('Bearer header.payload.signature');
  });
});

describe('saveSchoolDraft', () => {
  test('returns the server confirmation (success + version)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, version: 7 })));
    await expect(api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 6)).resolves.toMatchObject({ success: true, version: 7 });
  });

  test('sends the base version so the server can detect a lost update', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, version: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).baseVersion).toBe(2);
  });

  test('HTTP 409 is returned as a conflict, not thrown and not treated as a server failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ conflict: true, currentVersion: 9 }, 409)));
    await expect(api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 2)).resolves.toEqual({ conflict: true, currentVersion: 9 });
    expect(health.recordServerFailure).not.toHaveBeenCalled();
  });

  test('a 500 or an HTML 504 rejects (the caller must never show "saved")', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'db down' }, 500)));
    await expect(api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 1)).rejects.toMatchObject({ status: 500 });
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(504)));
    await expect(api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 1)).rejects.toMatchObject({ status: 504 });
  });

  test('is never aborted by a newer save (no AbortController on the draft request)', async () => {
    const signals = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { signals.push(init.signal); return jsonResponse({ success: true, version: 1 }); }));
    await api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 0);
    await api.saveSchoolDraft('SY 26-27', { schoolInfo: { schoolId: '302261' } }, 1);
    expect(signals.every((s) => s && s.aborted === false)).toBe(true);
  });
});

// One shared response handler (parseJsonOrThrow) now backs every plain api method, not just the draft calls.
describe('shared response handler on ordinary methods', () => {
  test.each([
    ['getDashboardStats', () => api.getDashboardStats()],
    ['getAutofillTemplate', () => api.getAutofillTemplate('302261')],
    ['updateSchool', () => api.updateSchool({ schoolName: 'X' })],
    ['getAbsences', () => api.getAbsences()]
  ])('%s: an HTML gateway page is a clear ApiError, not "Unexpected token <"', async (_name, call) => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(502)));
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.message).not.toMatch(/Unexpected token|JSON/);
  });

  test('a 200 reply that is not JSON is rejected before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(api.getDashboardStats()).rejects.toMatchObject({ name: 'ApiError', message: expect.stringMatching(/non-JSON/) });
  });

  test('a 4xx keeps the server\'s own message and body for the screen to show', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'End date cannot be before start date.' }, 400)));
    const err = await api.updateSchool({}).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).toBe('End date cannot be before start date.');
    expect(err.body).toEqual({ error: 'End date cannot be before start date.' });
  });

  test('a good JSON reply passes through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ total: 5 })));
    await expect(api.getDashboardStats()).resolves.toEqual({ total: 5 });
  });
});
