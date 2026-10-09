#!/usr/bin/env node
'use strict';
// Runs health probes from endpoints.manifest.json + config and writes results.json. Built-in fetch only.
// Default mode is non-destructive: GET/HEAD/OPTIONS, no-auth, bad-input and INVALID-payload writer probes only.
// Usage: node run_probes.js [--root d] [--config f] [--out d] [--base-url u] [--db-name n] [--start-server]
//                           [--only <regex on "METHOD /path">] [--limit N] [--include-writes] [--no-db]
const { fs, path, parseArgs, findRoot, loadConfig, outDir, readEnvKeys, interpolate, assertLoopbackUrl, assertAllowedDb, assertLoopbackHost, assertSelectOnly, mask, SKILL_DIR } = require('./lib');
const { spawn } = require('child_process');

const args = parseArgs();
const root = findRoot(args);
const cfg = loadConfig(args, root);
const dir = outDir(cfg, args);
const th = { slowMs: 1500, timeoutMs: 15000, bodyPreviewChars: 300, maxLargeBodyBytes: 5e6, ...(cfg.thresholds || {}) };
const rate = { concurrency: 1, delayMs: 25, abortAfterConsecutiveFailures: 5, ...(cfg.rate || {}) };
const dbCfg = cfg.database || {};
const SENTINEL = '__healthcheck_nonexistent__';
const secrets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ safety gates (run before anything touches the network)
let baseUrl = args['base-url'] || cfg.baseUrl;
const sc = cfg.startServer || {};
const startOwn = Boolean(args['start-server'] || sc.enabled);
if (startOwn) baseUrl = `http://localhost:${sc.port || 5099}`;
assertLoopbackUrl(baseUrl, cfg);
if (String(process.env.NODE_ENV).toLowerCase() === 'production') throw new Error('SAFETY: refusing to run with NODE_ENV=production.');
const envFromFile = readEnvKeys(path.resolve(root, dbCfg.envFile || '.env'));
const dbName = args['db-name'] || process.env.DB_NAME || envFromFile.DB_NAME;
const dbHost = process.env.DB_HOST || envFromFile.DB_HOST || 'localhost';
const dbChecksOn = dbCfg.enabled !== false && !args['no-db'];
if (dbChecksOn) { assertAllowedDb(dbName, cfg); assertLoopbackHost(dbHost); }
const configFindings = [];
for (const [k, want] of Object.entries(dbCfg.expectedEnv || {})) {
  const got = process.env[k] || envFromFile[k];
  if (got !== want) configFindings.push({ severity: 'HIGH', endpoint: '(config)', probe: 'config', title: `${k} is "${got}" but must equal "${want}"`, expected: want, actual: String(got), fix: `Set ${k}=${want} in ${dbCfg.envFile}.` });
}
if (args['include-writes']) {
  if (!(cfg.writeCases || []).length) throw new Error('SAFETY: --include-writes needs "writeCases" in the config (each body must contain "__healthcheck_").');
  for (const c of cfg.writeCases) if (!JSON.stringify(c.body || {}).includes('__healthcheck_')) throw new Error(`SAFETY: write case ${c.id} body must contain the "__healthcheck_" prefix.`);
}

// ------------------------------------------------------------------ server (optional: start our own, which also gives us its logs)
const logLines = [];
let child = null;
let childExit = null;
async function startServer() {
  const cwd = path.resolve(root, sc.cwd || '.');
  child = spawn(sc.command || 'node', sc.args || ['server.js'], { cwd, env: { ...process.env, ...(sc.env || {}), PORT: String(sc.port || 5099) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const feed = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach((l) => logLines.push(l));
  child.stdout.on('data', feed); child.stderr.on('data', feed);
  child.on('exit', (code, sig) => { childExit = { code, sig }; });
  const t0 = Date.now();
  while (Date.now() - t0 < (sc.readyTimeoutMs || 60000)) {
    if (childExit) throw new Error(`Server exited during startup (code ${childExit.code}). Last log: ${logLines.slice(-3).join(' | ')}`);
    try { const r = await fetch(baseUrl + (sc.readyPath || '/'), { signal: AbortSignal.timeout(2000) }); if (r.status > 0) return; } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Server did not become ready in time.');
}
async function stopServer() {
  if (!child || childExit) return;
  child.kill('SIGINT');
  const t0 = Date.now();
  while (!childExit && Date.now() - t0 < 20000) await sleep(200);
  if (!childExit) child.kill('SIGKILL');
}
const LOG_BAD = /unhandled\s*(?:promise\s*)?rejection|uncaught\s*exception|FATAL|\b3D000\b|\b28P01\b|ECONNREFUSED|\b42P01\b|\b42703\b|TypeError:|ReferenceError:|process (?:exited|restart)/i;
const LOG_IGNORE = ((cfg.logs && cfg.logs.ignorePatterns) || []).map((p) => new RegExp(p, 'i'));
function newLogHits(from) { return logLines.slice(from).filter((l) => LOG_BAD.test(l) && !LOG_IGNORE.some((re) => re.test(l))).map((l) => mask(l.slice(0, 240), secrets)); }

// ------------------------------------------------------------------ HTTP
async function call(method, urlPath, { token, body, rawBody, query } = {}) {
  const qs = query && Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  const url = baseUrl + urlPath + qs;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (rawBody !== undefined) { headers['Content-Type'] = 'application/json'; payload = rawBody; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(th.timeoutMs) });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ms: Date.now() - t0, ct: res.headers.get('content-type') || '', bytes: buf.length, text: buf.toString('utf8'), binary: /(spreadsheet|octet-stream|pdf|zip|image\/|csv|excel)/i.test(res.headers.get('content-type') || '') };
  } catch (e) {
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    return { status: 0, ms: Date.now() - t0, ct: '', bytes: 0, text: '', error: timeout ? 'timeout' : `network: ${e.cause && e.cause.code ? e.cause.code : e.message}` };
  }
}

// ------------------------------------------------------------------ response analysis
const LEAK = [
  ['stack trace', /\n\s+at\s+.+\(.+:\d+:\d+\)|\bat\s+(?:async\s+)?\S+\s+\(.+\.js:\d+:\d+\)/],
  ['file path', /node_modules[\\/]|[A-Za-z]:\\(?:Users|InsightED|Windows)\\|\/(?:var|home|usr|opt)\/[\w./-]+\.js/],
  ['SQL text', /\b(?:select|insert\s+into|update|delete\s+from)\b[\s\S]{0,300}\b(?:from|set|values|where)\b[\s\S]{0,40}\$\d|syntax error at or near|relation "[^"]+" does not exist|column "[^"]+" (?:does not exist|of relation)|violates (?:foreign key|unique|not-null|check) constraint|invalid input syntax for type|duplicate key value/i],
  ['secret', /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*|"(?:password|password_hash|passcode_hash|jwt_secret|secret)"\s*:\s*"[^"]{3,}"/i]
];
const DB_ERR = /\b3D000\b|\b28P01\b|\bECONNREFUSED\b|database "[^"]*" does not exist|password authentication failed|Connection terminated|too many clients/i;
const BAD_VALUES = /\bNaN\b|\bundefined\b|\[object Object\]/;
const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function analyze(ep, probe, r, expectedClass, ctx) {
  const out = [];
  const add = (severity, title, expected, actual) => out.push({ severity, endpoint: ep.id, probe, title, expected, actual });
  if (r.error) { add(r.error === 'timeout' ? 'HIGH' : 'CRITICAL', r.error === 'timeout' ? `Request timed out after ${th.timeoutMs} ms` : `Request failed (${r.error})`, 'a response', r.error); return out; }
  if (r.status >= 500) add('CRITICAL', `Server error ${r.status}`, expectedClass, `HTTP ${r.status}`);
  if (r.ms > th.timeoutMs * 0.8) add('HIGH', `Response took ${r.ms} ms (limit ${th.timeoutMs} ms)`, `< ${th.timeoutMs} ms`, `${r.ms} ms`);
  else if (r.ms > th.slowMs) add('MEDIUM', `Slow response (${r.ms} ms)`, `< ${th.slowMs} ms`, `${r.ms} ms`);
  if (r.bytes > th.maxLargeBodyBytes) add('MEDIUM', `Very large response (${r.bytes} bytes)`, `< ${th.maxLargeBodyBytes} bytes`, `${r.bytes} bytes`);
  if (!r.binary && r.text) {
    const isHtml = /^\s*<(!doctype|html)/i.test(r.text) || /text\/html/i.test(r.ct);
    const looksJson = /^\s*[\[{]/.test(r.text);
    let parsed;
    if (looksJson || /json/i.test(r.ct)) { try { parsed = JSON.parse(r.text); } catch (e) { add('HIGH', 'Body is not valid JSON', 'parseable JSON', `parse error: ${e.message}`); } }
    if (isHtml && !ctx.htmlOk) add('HIGH', 'HTML returned where JSON is expected', 'application/json', r.ct || 'text/html');
    else if (parsed !== undefined && !/json/i.test(r.ct)) add('MEDIUM', 'JSON body with wrong Content-Type', 'application/json', r.ct || '(none)');
    const leaks = LEAK.filter(([label, re]) => re.test(r.text) && !(label === 'secret' && ctx.tokenOk));
    if (leaks.length) add('CRITICAL', `Response leaks internals (${leaks.map(([l]) => l).join(', ')})`, 'a generic error message', mask(r.text.match(leaks[0][1])[0].slice(0, 100), secrets));
    if (DB_ERR.test(r.text)) add('HIGH', 'Database connection/config error surfaced in response', 'no DB error details', mask(r.text.match(DB_ERR)[0], secrets));
    if (BAD_VALUES.test(r.text) && parsed !== undefined) add('MEDIUM', 'Payload contains NaN / undefined / [object Object]', 'clean values', r.text.match(BAD_VALUES)[0]);
    if (r.text.includes('�')) add('MEDIUM', 'Replacement character (U+FFFD) in body: broken UTF-8', 'intact UTF-8', 'U+FFFD found');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && r.status >= 200 && r.status < 300 && (parsed.error || parsed.success === false || parsed.status === 'error') && !ctx.errorOk) add('HIGH', 'Error reported inside an HTTP 2xx response', '4xx/5xx status', `HTTP ${r.status} with error body`);
    if (parsed !== undefined) ctx.parsed = parsed;
  } else if (!r.binary && r.status >= 200 && r.status < 300 && r.status !== 204 && ctx.expectBody && !r.text) add('MEDIUM', 'Empty body with 2xx', 'a body', '(empty)');
  if (r.text && !r.ct && r.status !== 204 && r.status !== 0) add('MEDIUM', 'Missing Content-Type header', 'a Content-Type', '(none)');
  return out;
}

const walkDates = (v, found, depth = 0, key = '') => {
  if (depth > 4 || found.size > 20) return;
  if (Array.isArray(v)) return v.slice(0, 30).forEach((x) => walkDates(x, found, depth + 1, key));
  if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => walkDates(x, found, depth + 1, k));
  if (typeof v === 'string' && /(_at|At|_date|Date)$/.test(key) && v && !ISO.test(v)) found.add(`${key}="${v.slice(0, 30)}"`);
};
function harvest(urlPath, parsed, pool) {
  const first = Array.isArray(parsed) ? parsed[0] : (parsed && typeof parsed === 'object' ? (Array.isArray(parsed.data) ? parsed.data[0] : parsed) : null);
  if (first && typeof first === 'object') pool.set(urlPath, first);
}

// ------------------------------------------------------------------ database stats (read-only)
let pg = null;
async function dbConnect() {
  if (!dbChecksOn) return null;
  try {
    const mod = require(require.resolve('pg', { paths: [path.join(root, 'server'), root] }));
    const client = new mod.Client({ host: dbHost, port: Number(process.env.DB_PORT || envFromFile.DB_PORT || 5432), user: process.env.DB_USER || envFromFile.DB_USER || 'postgres', password: process.env.DB_PASSWORD || envFromFile.DB_PASSWORD, database: dbName });
    secrets.push(process.env.DB_PASSWORD || envFromFile.DB_PASSWORD);
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    return client;
  } catch (e) { return { error: e.message }; }
}
const SNAP_SQL = fs.readFileSync(path.join(SKILL_DIR, 'scripts', 'snapshot_tables.sql'), 'utf8');
assertSelectOnly(SNAP_SQL);
async function snapshot() {
  if (!pg || pg.error) return null;
  const { rows } = await pg.query(SNAP_SQL);
  return Object.fromEntries(rows.map((r) => [r.table_name, { ins: Number(r.n_tup_ins), upd: Number(r.n_tup_upd), del: Number(r.n_tup_del), live: Number(r.n_live_tup) }]));
}
const delta = (a, b) => (!a || !b ? null : Object.keys(b).filter((t) => a[t] && (b[t].ins - a[t].ins || b[t].upd - a[t].upd || b[t].del - a[t].del)).map((t) => ({ table: t, ins: b[t].ins - a[t].ins, upd: b[t].upd - a[t].upd, del: b[t].del - a[t].del })));

// ------------------------------------------------------------------ main
(async () => {
  const manifestFile = path.join(dir, 'endpoints.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const startedAt = new Date().toISOString();
  const findings = [...configFindings];
  const results = [];
  const notVerified = [];
  const destructive = new RegExp(cfg.destructivePathPattern || '(clear|delete-all|truncate|reset|purge|wipe|drop|migrate|seed)', 'i');
  const skipRules = (cfg.skip || []).map((s) => ({ re: new RegExp(s.match), reason: s.reason }));

  if (startOwn) { console.log(`Starting server on ${baseUrl} ...`); await startServer(); }
  // reachability
  const ping = await call('GET', (cfg.startServer && cfg.startServer.readyPath) || '/');
  if (ping.status === 0) throw new Error(`Server not reachable at ${baseUrl} (${ping.error}). Start it, or pass --start-server.`);

  pg = await dbConnect();
  if (pg && pg.error) { notVerified.push(`Database runtime checks unavailable: ${pg.error}`); pg = null; }
  if (!dbChecksOn) notVerified.push('Database runtime checks disabled (--no-db or config).');

  // authentication
  const a = cfg.auth || {};
  const extraEnv = a.credentialsEnvFile ? readEnvKeys(path.resolve(root, a.credentialsEnvFile)) : {};
  const loginBody = interpolate(a.loginBody || {}, extraEnv);
  let token = null; let tokenInfo = null;
  if (Object.values(loginBody).every((v) => v)) {
    Object.values(loginBody).forEach((v) => secrets.push(String(v)));
    const lr = await call('POST', a.loginPath, { body: loginBody });
    try { const j = JSON.parse(lr.text); token = (a.tokenField && j[a.tokenField]) || (j.data && j.data[a.tokenField]) || null; } catch (e) { /* not json */ }
    if (token) {
      secrets.push(token);
      try { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); tokenInfo = { role: claims.role || claims.userRole || null, schoolId: claims.school_id || claims.schoolId || null }; } catch (e) { tokenInfo = {}; }
    } else notVerified.push(`Login at ${a.loginPath} returned HTTP ${lr.status} without a token; protected endpoints skipped.`);
  } else notVerified.push('No test credentials in the environment (see auth.loginBody); protected endpoints skipped. No accounts were created.');
  const sample = interpolate(cfg.sampleParams || {}, extraEnv);
  if (!sample.schoolId && tokenInfo && tokenInfo.schoolId) { sample.schoolId = tokenInfo.schoolId; sample.school_id = tokenInfo.schoolId; }

  // calibration: is the stats view quiet while we are idle?
  let statsNoisy = null; let startSnap = null;
  if (pg) {
    const s1 = await snapshot(); startSnap = s1;
    await sleep((dbCfg.settleMs || 1200) + 300);
    const s2 = await snapshot();
    statsNoisy = delta(s1, s2).length > 0;
    if (statsNoisy) notVerified.push('pg_stat counters changed while the check was idle (other DB activity): table-change confirmation is inconclusive and is reported as "possible", never "confirmed".');
  }

  // select and order endpoints
  let eps = manifest.endpoints;
  if (args.only) { const re = new RegExp(args.only); eps = eps.filter((e) => re.test(e.id)); }
  if (args.limit) eps = eps.slice(0, Number(args.limit));
  eps = [...eps].sort((x, y) => (x.pathParams.length - y.pathParams.length) || (x.effect === 'read' ? -1 : 1));

  const pool = new Map(); const errorShapes = new Map(); const dateIssues = new Map(); const notFoundForBad = [];
  let consecutiveFailures = 0; let aborted = null;
  const subst = (ep, how) => ep.path.replace(/:([A-Za-z_]\w*)\??/g, (m, p) => {
    if (how === 'bad') return encodeURIComponent(SENTINEL);
    if (sample[p] !== undefined && sample[p] !== null && sample[p] !== '') return encodeURIComponent(sample[p]);
    const parent = ep.path.slice(0, ep.path.indexOf('/:' + p));
    const row = pool.get(parent);
    if (row) { const v = row[p] ?? (/id$/i.test(p) ? row.id : undefined); if (v !== undefined && v !== null) return encodeURIComponent(v); }
    return null;
  });

  for (const ep of eps) {
    if (aborted) { results.push({ id: ep.id, status: 'skipped', reason: `run aborted: ${aborted}`, probes: [] }); continue; }
    const res = { id: ep.id, method: ep.method, path: ep.path, auth: ep.auth, handler: `${ep.handler.file}:${ep.handler.line}`, tablesRead: ep.tablesRead, tablesWritten: ep.tablesWritten, tableMappingConfidence: ep.tableMappingConfidence, probes: [], skipped: [], status: null, reasons: [] };
    results.push(res);
    const rule = skipRules.find((s) => s.re.test(ep.id));
    if (rule) { res.status = 'skipped'; res.reason = `skip list: ${rule.reason}`; continue; }
    const needsToken = ep.auth !== 'no';
    const writer = ep.effect === 'write';
    const useToken = token && needsToken;

    const run = async (probe, method, urlPath, opts, expected, ctx = {}) => {
      const logFrom = logLines.length;
      const r = await call(method, urlPath, opts);
      const f = analyze(ep, probe, r, expected, ctx);
      const hits = startOwn ? newLogHits(logFrom) : [];
      hits.forEach((h) => f.push({ severity: 'CRITICAL', endpoint: ep.id, probe, title: 'Server log shows a runtime error during this probe', expected: 'clean log', actual: h }));
      if (childExit) f.push({ severity: 'CRITICAL', endpoint: ep.id, probe, title: 'Server process exited during this probe', expected: 'process stays up', actual: `exit code ${childExit.code}` });
      const preview = mask(r.binary ? `(binary ${r.ct}, ${r.bytes} bytes)` : r.text.replace(/\s+/g, ' ').slice(0, th.bodyPreviewChars), secrets);
      const pr = { probe, request: { method, path: mask(urlPath + (opts && opts.query && Object.keys(opts.query).length ? '?' + new URLSearchParams(opts.query) : ''), secrets), auth: opts && opts.token ? 'bearer (masked)' : 'none' }, status: r.status, ms: r.ms, contentType: r.ct, bodyPreview: preview, findings: f.length };
      res.probes.push(pr);
      f.forEach((x) => { x.request = pr.request; x.status = r.status; x.bodyPreview = preview; x.handler = res.handler; findings.push(x); });
      consecutiveFailures = r.status === 0 ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= rate.abortAfterConsecutiveFailures) aborted = `server stopped responding (${consecutiveFailures} consecutive failures)`;
      if (r.status >= 400 && ctx.parsed && typeof ctx.parsed === 'object' && !Array.isArray(ctx.parsed)) { const sig = Object.keys(ctx.parsed).sort().join(','); errorShapes.set(sig, (errorShapes.get(sig) || 0) + 1); }
      await sleep(rate.delayMs);
      return { r, pr, ctx };
    };

    // 1. happy path
    if (!writer) {
      const p = subst(ep, 'sample');
      if (p === null) res.skipped.push({ probe: 'happy', reason: 'skipped: no sample data for path parameter(s)' });
      else if (needsToken && !token) res.skipped.push({ probe: 'happy', reason: 'skipped: no credentials' });
      else if (ep.method !== 'GET' && ep.method !== 'HEAD' && ep.method !== 'OPTIONS' && ep.method !== 'ALL') res.skipped.push({ probe: 'happy', reason: 'method not read-only' });
      else {
        const m = ep.method === 'ALL' ? 'GET' : ep.method;
        const { r, ctx } = await run('happy', m, p, { token: useToken ? token : undefined, query: cfg.queryDefaults }, '2xx JSON', { expectBody: m === 'GET', htmlOk: false });
        if (r.status >= 200 && r.status < 300) {
          if (ctx.parsed !== undefined) { harvest(ep.path, ctx.parsed, pool); const found = new Set(); walkDates(ctx.parsed, found); found.forEach((d) => dateIssues.set(d.split('=')[0], (dateIssues.get(d.split('=')[0]) || 0) + 1)); }
        } else if ([400, 401, 403, 404, 422].includes(r.status)) res.reasons.push(`happy path inconclusive: HTTP ${r.status} (role, sample data or required query may be missing)`);
        else if (r.status >= 300 && r.status < 400) findings.push({ severity: 'LOW', endpoint: ep.id, probe: 'happy', title: `Unexpected redirect ${r.status}`, expected: '2xx', actual: `HTTP ${r.status}`, handler: res.handler });
      }
    }

    // 2. no-auth probe
    if (needsToken) {
      const p = subst(ep, 'bad');
      const skipNoAuth = writer && (destructive.test(ep.path) || (ep.method === 'DELETE' && !ep.pathParams.length));
      if (skipNoAuth) res.skipped.push({ probe: 'no-auth', reason: 'skipped: destructive-looking route, not sent without a safe identifier' });
      else {
        const { r } = await run('no-auth', ep.method === 'ALL' ? 'GET' : ep.method, p, writer ? { body: {} } : {}, '401 or 403');
        if (r.status >= 200 && r.status < 300) findings.push({ severity: ep.auth === 'yes' ? 'CRITICAL' : 'HIGH', endpoint: ep.id, probe: 'no-auth', title: 'Protected route answered 2xx without credentials', expected: '401/403', actual: `HTTP ${r.status}`, request: res.probes[res.probes.length - 1].request, status: r.status, bodyPreview: res.probes[res.probes.length - 1].bodyPreview, handler: res.handler });
        else if (r.status !== 401 && r.status !== 403 && r.status !== 0 && r.status < 500) findings.push({ severity: 'MEDIUM', endpoint: ep.id, probe: 'no-auth', title: `Unauthenticated request got ${r.status} instead of 401/403 (auth is not the first check)`, expected: '401/403', actual: `HTTP ${r.status}`, request: res.probes[res.probes.length - 1].request, status: r.status, bodyPreview: res.probes[res.probes.length - 1].bodyPreview, handler: res.handler });
      }
    }

    // 3. bad input (read routes)
    if (!writer && (useToken || !needsToken)) {
      const p = subst(ep, 'bad');
      const { r } = await run('bad-input', ep.method === 'ALL' ? 'GET' : ep.method, p, { token: useToken ? token : undefined, query: { limit: 'abc', page: '-1', schoolYear: '\u0000%', q: "'" } }, '4xx (or 2xx if the query is ignored)', { htmlOk: false, errorOk: true });
      if (ep.pathParams.length && r.status === 404) notFoundForBad.push(ep.id);
    }

    // 4. writer probes (invalid payloads only)
    if (writer && (useToken || !needsToken)) {
      const m = ep.method;
      if (destructive.test(ep.path)) res.skipped.push({ probe: 'writer', reason: 'skipped: destructive-looking route (config.destructivePathPattern)' });
      else if ((ep.jsonbPayloadWrites || []).length) res.skipped.push({ probe: 'writer', reason: `skipped: writes a whole-form JSON column (${ep.jsonbPayloadWrites.join(', ')}); an empty body could overwrite saved data if validation is missing` });
      else if (m === 'DELETE' && !ep.pathParams.length) res.skipped.push({ probe: 'writer', reason: 'skipped: DELETE without a path identifier could remove many rows' });
      else {
        const p = subst(ep, 'bad');
        const before = pg ? await snapshot() : null;
        // Malformed JSON is rejected by the body parser before any handler runs, so it can never write. Bodies that DO reach the
        // handler are not sent to public routes (anyone can reach them), and escalation stops at the first 2xx.
        const all = m === 'DELETE' ? [['no-body', {}]] : [['malformed-json', { rawBody: '{"a":' }], ['empty-object', { body: {} }], ['wrong-types', { body: { id: ['x'], name: 12345, schoolId: {}, items: 'not-an-array', date: 'not-a-date' } }]];
        const payloads = ep.auth === 'no' ? all.filter(([l]) => l === 'malformed-json' || l === 'no-body') : all;
        if (ep.auth === 'no' && payloads.length < all.length) res.skipped.push({ probe: 'writer', reason: 'public route: only malformed JSON sent (other invalid bodies could create rows for anyone)' });
        let accepted = false;
        for (const [label, o] of payloads) {
          if (accepted) { res.skipped.push({ probe: `writer:${label}`, reason: 'not sent: an earlier invalid body was already accepted with 2xx' }); continue; }
          const { r } = await run(`writer:${label}`, m === 'ALL' ? 'POST' : m, p, { token: useToken ? token : undefined, ...o }, '400/422 and nothing written', { htmlOk: false, errorOk: true });
          if (r.status >= 200 && r.status < 300 && m !== 'DELETE') accepted = true;
          if (r.status >= 200 && r.status < 300 && m !== 'DELETE') findings.push({ severity: 'CRITICAL', endpoint: ep.id, probe: `writer:${label}`, title: 'Invalid write payload accepted with 2xx', expected: '400/422', actual: `HTTP ${r.status}`, request: res.probes[res.probes.length - 1].request, status: r.status, bodyPreview: res.probes[res.probes.length - 1].bodyPreview, handler: res.handler });
        }
        if (pg) {
          await sleep(dbCfg.settleMs || 1200);
          const changed = delta(before, await snapshot());
          res.runtimeTableChanges = changed;
          if (changed && changed.length) {
            const predicted = new Set(ep.tablesWritten || []);
            findings.push({ severity: statsNoisy ? 'HIGH' : 'CRITICAL', endpoint: ep.id, probe: 'writer:table-check', title: statsNoisy ? 'Tables possibly changed during invalid-payload probes (DB stats noisy: not confirmed)' : 'Invalid-payload probes changed tables', expected: 'no table changes', actual: changed.map((c) => `${c.table} +${c.ins}/~${c.upd}/-${c.del}`).join(', '), handler: res.handler });
            for (const c of changed) if (!predicted.has(c.table)) findings.push({ severity: 'HIGH', endpoint: ep.id, probe: 'writer:table-check', title: `Runtime change in ${c.table}, which the static map did not predict`, expected: [...predicted].join(', ') || '(none)', actual: c.table, handler: res.handler });
          }
        }
      }
    }
    if (aborted) res.reasons.push(`run aborted: ${aborted}`);
  }

  // opt-in write mode (explicit user instruction only)
  const writeResults = [];
  if (args['include-writes'] && !aborted) {
    for (const wc of cfg.writeCases) {
      const ep = manifest.endpoints.find((e) => e.id === wc.id);
      const before = await snapshot();
      const r = await call(wc.method || (ep && ep.method) || 'POST', wc.path || (ep && ep.path), { token, body: wc.body });
      await sleep(dbCfg.settleMs || 1200);
      const changed = delta(before, await snapshot());
      let cleanup = 'no cleanup configured';
      if (wc.cleanup) { let idv; try { idv = JSON.parse(r.text)[wc.cleanup.idFrom || 'id']; } catch (e) { /* none */ } const cr = await call(wc.cleanup.method || 'DELETE', String(wc.cleanup.path).replace('{{id}}', encodeURIComponent(idv)), { token }); cleanup = `cleanup HTTP ${cr.status}`; if (cr.status >= 300) findings.push({ severity: 'HIGH', endpoint: wc.id, probe: 'write-mode', title: 'Cleanup of test data failed; rows may be left behind (prefix __healthcheck_)', expected: '2xx', actual: `HTTP ${cr.status}` }); }
      const predicted = new Set((ep && ep.tablesWritten) || []);
      (changed || []).filter((c) => !predicted.has(c.table)).forEach((c) => findings.push({ severity: 'CRITICAL', endpoint: wc.id, probe: 'write-mode', title: `Wrote to ${c.table}, which the static map did not predict`, expected: [...predicted].join(', '), actual: c.table }));
      [...predicted].filter((t) => !(changed || []).some((c) => c.table === t)).forEach((t) => findings.push({ severity: 'HIGH', endpoint: wc.id, probe: 'write-mode', title: `Predicted table ${t} was never touched at runtime`, expected: t, actual: '(no change)' }));
      writeResults.push({ id: wc.id, status: r.status, changed, cleanup });
    }
  }

  // cross-endpoint findings
  if (errorShapes.size > 1) findings.push({ severity: 'MEDIUM', endpoint: '(all)', probe: 'error-shape', title: 'Inconsistent error body shapes across routes', expected: 'one shape', actual: [...errorShapes].map(([k, n]) => `{${k}}: ${n}`).join('; ') });
  if (notFoundForBad.length) findings.push({ severity: 'LOW', endpoint: '(all)', probe: 'bad-input', title: `${notFoundForBad.length} route(s) return 404 for a malformed id (400 may be clearer)`, expected: '400 for malformed ids', actual: notFoundForBad.slice(0, 6).join(', ') + (notFoundForBad.length > 6 ? ', ...' : '') });
  if (dateIssues.size) findings.push({ severity: 'LOW', endpoint: '(all)', probe: 'format', title: 'Date-like fields that are not ISO 8601', expected: 'ISO 8601', actual: [...dateIssues].map(([k, n]) => `${k} (${n}x)`).join(', ') });
  for (const ep of manifest.endpoints) if (ep.tableMappingConfidence !== 'resolved') findings.push({ severity: 'MEDIUM', endpoint: ep.id, probe: 'table-map', title: `Table mapping ${ep.tableMappingConfidence}`, expected: 'resolved', actual: ep.tableMappingNotes.filter((n) => !/intentional/.test(n)).slice(0, 2).join('; ') || ep.tableMappingConfidence, handler: `${ep.handler.file}:${ep.handler.line}` });
  for (const t of (manifest.meta.tableMapping && manifest.meta.tableMapping.tablesNotInSchema) || []) findings.push({ severity: 'HIGH', endpoint: '(code)', probe: 'table-map', title: `Table "${t.table}" is referenced in code but not in the schema`, expected: 'table exists', actual: 'missing', handler: t.at });
  for (const ep of manifest.endpoints) if ((ep.jsonbPayloadWrites || []).length) findings.push({ severity: 'HIGH', endpoint: ep.id, probe: 'table-map', title: `Writes a whole-form JSON body into ${ep.jsonbPayloadWrites.join(', ')}` + (ep.tablesWritten.includes('school_drafts') ? ' (see draft-normalization-audit)' : ''), expected: 'normalized columns/tables', actual: ep.jsonbPayloadWrites.join(', '), handler: `${ep.handler.file}:${ep.handler.line}` });

  // process / logs
  let logSummary = { source: 'none', note: null, hits: [] };
  if (startOwn) logSummary = { source: 'server started by the skill', lines: logLines.length, hits: newLogHits(0), crashed: Boolean(childExit) };
  else if (cfg.logs && cfg.logs.pm2App) {
    try { const out = require('child_process').execSync(`pm2 logs ${cfg.logs.pm2App} --nostream --lines 300`, { encoding: 'utf8', timeout: 15000 }); logSummary = { source: 'pm2 logs (not correlated to probes)', hits: out.split(/\r?\n/).filter((l) => LOG_BAD.test(l)).slice(-20).map((l) => mask(l.slice(0, 240), secrets)) }; } catch (e) { notVerified.push(`pm2 logs unavailable: ${e.message.split('\n')[0]}`); }
  } else notVerified.push('Server logs were not captured (server not started by the skill and logs.file / logs.pm2App not configured), so runtime errors that never reach a response are not detected.');

  let endSnap = null; let tableTotals = null;
  if (pg) { await sleep(dbCfg.settleMs || 1200); endSnap = await snapshot(); tableTotals = delta(startSnap, endSnap); await pg.end().catch(() => {}); }
  await stopServer();

  // per-endpoint status
  for (const res of results) {
    if (res.status) continue;
    const mine = findings.filter((f) => f.endpoint === res.id && f.probe !== 'table-map');
    const sev = (s) => mine.some((f) => f.severity === s);
    const gateOnly = res.auth !== 'no' && res.probes.length > 0 && res.probes.every((p) => p.probe === 'no-auth');
    res.status = gateOnly && !(findings.some((f) => f.endpoint === res.id && f.probe !== 'table-map')) ? 'gate-only' : !res.probes.length ? (res.skipped.length ? 'skipped' : 'not-testable') : sev('CRITICAL') || sev('HIGH') ? 'failing' : mine.length ? 'warnings' : res.reasons.length ? 'inconclusive' : 'healthy';
    if (!res.probes.length && !res.reason) res.reason = res.skipped.map((s) => s.reason).join('; ') || 'no probe applicable';
  }

  const out = {
    meta: { startedAt, finishedAt: new Date().toISOString(), baseUrl, startedOwnServer: startOwn, mode: args['include-writes'] ? 'write-mode (opt-in)' : 'default (non-destructive)', db: dbChecksOn ? { name: dbName, host: dbHost } : null, role: tokenInfo, statsNoisy, aborted, manifestEndpoints: manifest.endpoints.length, selectedEndpoints: eps.length, thresholds: th, rate },
    notVerified, results, findings, writeResults, logs: logSummary, tableTotalsDuringRun: tableTotals
  };
  const text = JSON.stringify(out, null, 2);
  for (const s of secrets) if (s && String(s).length >= 6 && text.includes(String(s))) throw new Error('SAFETY: a secret value was found in results.json; refusing to write it.');
  fs.writeFileSync(path.join(dir, 'results.json'), text);
  const by = (k) => findings.filter((f) => f.severity === k).length;
  console.log(`Probed ${results.filter((r) => r.probes.length).length}/${eps.length} endpoints. Findings: CRITICAL ${by('CRITICAL')}, HIGH ${by('HIGH')}, MEDIUM ${by('MEDIUM')}, LOW ${by('LOW')}.`);
  console.log(`results.json: ${path.join(dir, 'results.json')}`);
})().catch(async (e) => { console.error(e.message); try { await stopServer(); } catch (x) { /* ignore */ } process.exit(1); });
