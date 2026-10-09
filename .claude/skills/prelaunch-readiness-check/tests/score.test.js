'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCORE = path.join(ROOT, 'scripts', 'score.js');
const COLLECT = path.join(ROOT, 'scripts', 'collect-evidence.js');
const CHECKS = path.join(ROOT, 'reference', 'checks.json');
const SAMPLE = path.join(__dirname, 'fixtures', 'results-sample.json');
const FAKE_APP = path.join(__dirname, 'fixtures', 'fake-app');
const collector = require(COLLECT);
const checks = JSON.parse(fs.readFileSync(CHECKS, 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-test-'));

const all = (status, overrides) => checks.map((c) => Object.assign({ id: c.id, status, evidence: 'evidence.json#/x', note: '' }, (overrides && overrides[c.id]) || {}));

function runScore(results, extra) {
  const dir = tmp();
  const rf = path.join(dir, 'results.json');
  fs.writeFileSync(rf, JSON.stringify(results));
  const out = path.join(dir, 'out');
  const r = cp.spawnSync(process.execPath, [SCORE, '--results', rf, '--checks', CHECKS, '--out-dir', out].concat(extra || []), { encoding: 'utf8' });
  const read = (f) => (fs.existsSync(path.join(out, f)) ? fs.readFileSync(path.join(out, f), 'utf8') : null);
  return { r, out, score: read('score.json') && JSON.parse(read('score.json')), prompt: read('fix-prompt.md'), report: read('report.md') };
}

const silent = { stdout() {}, stderr() {} };
function recorder(extra) {
  const calls = { exec: [], http: [], tls: [] };
  const deps = Object.assign({
    execFile(file, args, opts, cb) {
      calls.exec.push({ file, args, env: opts && opts.env });
      if (file === 'git') return cp.execFile(file, args, opts, cb);
      return cb(new Error('unexpected command ' + file), '', '');
    },
    async httpRequest(req) { calls.http.push(req); return { status: 200, headers: {}, body: '{}', timeMs: 5 }; },
    async tlsInfo(h, p) { calls.tls.push([h, p]); return { protocol: 'TLSv1.3', authorized: true, daysRemaining: 60 }; },
    sleep: async () => {},
    env: {},
  }, silent, extra || {});
  return { calls, deps };
}
const collect = (argv, deps) => collector.main(argv, deps);

// ---------------------------------------------------------------- score.js

test('1. all pass -> 100 and GO', () => {
  const s = runScore(all('pass'));
  assert.strictEqual(s.r.status, 0, s.r.stderr);
  assert.strictEqual(s.score.overall.score, 100);
  assert.strictEqual(s.score.overall.verdict, 'GO');
});

test('2. one critical fail -> NO-GO even above 90', () => {
  const s = runScore(all('pass', { 'SEC-01': { status: 'fail' } }));
  assert.ok(s.score.overall.score > 90);
  assert.strictEqual(s.score.overall.verdict, 'NO-GO (critical blockers)');
  assert.deepStrictEqual(s.score.critical_blockers.map((b) => b.id), ['SEC-01']);
});

test('3. na is excluded from the denominator', () => {
  const s = runScore(all('pass', { 'LB-09': { status: 'na', note: 'static assets served by CDN' } }));
  assert.strictEqual(s.score.overall.score, 100);
  const total = checks.reduce((a, c) => a + { critical: 10, high: 5, medium: 3, low: 1 }[c.severity], 0);
  assert.strictEqual(s.score.overall.possible, total - 1);
});

test('4. unknown scores 0 and appears in the fix prompt', () => {
  const s = runScore(all('pass', { 'LB-06': { status: 'unknown', evidence: '', note: 'no load test recorded' } }));
  assert.ok(s.score.overall.score < 100);
  assert.ok(s.prompt.includes('### LB-06'));
});

test('5. pass without evidence is rejected', () => {
  const s = runScore(all('pass', { 'API-01': { evidence: '' } }));
  assert.strictEqual(s.r.status, 1);
  assert.match(s.r.stderr, /API-01/);
});

test('6. missing and unknown IDs are rejected', () => {
  const missing = all('pass').slice(1);
  assert.strictEqual(runScore(missing).r.status, 1);
  const extra = all('pass').concat([{ id: 'ZZZ-99', status: 'pass', evidence: 'x' }]);
  const s = runScore(extra);
  assert.strictEqual(s.r.status, 1);
  assert.match(s.r.stderr, /ZZZ-99/);
});

test('7. fix-prompt.md is generated when everything passes and says no fixes are required', () => {
  const s = runScore(all('pass'));
  assert.ok(s.prompt);
  assert.match(s.prompt, /No fixes are required/);
  assert.match(s.prompt, /Guardrails/);
  assert.ok(s.report && s.score);
});

test('8. fix prompt orders P0 -> P1 -> P2 -> P3', () => {
  const s = runScore(all('pass', {
    'API-08': { status: 'fail' }, // low
    'API-04': { status: 'fail' }, // medium
    'API-01': { status: 'fail' }, // high
    'API-07': { status: 'fail' }, // critical
    'API-02': { status: 'partial' }, // high partial -> P3
  }));
  const idx = (id) => s.prompt.indexOf('### ' + id + ' ');
  assert.ok(idx('API-07') > -1 && idx('API-07') < idx('API-01'));
  assert.ok(idx('API-01') < idx('API-04'));
  assert.ok(idx('API-04') < idx('API-08'));
  assert.ok(idx('API-04') < idx('API-02'), 'partial items are P3');
  assert.ok(s.prompt.indexOf('### P3') < idx('API-02'));
});

test('9. different inputs give identical score.json structure', () => {
  const shape = (o) => (Array.isArray(o) ? 'array' : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape(o[k])])) : typeof o === 'number' || o === null ? 'scalar' : typeof o);
  const a = runScore(all('pass')).score;
  const b = runScore(JSON.parse(fs.readFileSync(SAMPLE, 'utf8'))).score;
  assert.deepStrictEqual(shape(a), shape(b));
});

test('results-sample.json is valid and the CLI emits all three files', () => {
  const out = tmp();
  const r = cp.spawnSync(process.execPath, [SCORE, '--results', SAMPLE, '--checks', CHECKS, '--out-dir', out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  for (const f of ['report.md', 'score.json', 'fix-prompt.md']) assert.ok(fs.existsSync(path.join(out, f)), f);
});

test('checks.json has unique IDs and required fields', () => {
  assert.strictEqual(new Set(checks.map((c) => c.id)).size, checks.length);
  for (const c of checks) {
    for (const k of ['id', 'category', 'title', 'severity', 'verify_by', 'fix_hint']) assert.ok(c[k] && typeof c[k] === 'string', c.id + ' ' + k);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(c.severity));
  }
});

test('--min-score returns exit code 2 when below, files still written', () => {
  const s = runScore(all('fail'), ['--min-score', '50']);
  assert.strictEqual(s.r.status, 2);
  assert.ok(s.prompt);
});

// ---------------------------------------------------------------- collect-evidence.js

const SECTIONS = ['meta', 'coverage', 'repo', 'sql', 'secrets', 'routes', 'security', 'deps', 'ratelimit', 'db', 'nginx', 'pm2', 'health', 'observability', 'backups', 'staging', 'ratelimitProbe'];

test('10. collector on fake-app: all sections, seeded findings, no secret value', () => {
  const dir = tmp();
  const out = path.join(dir, 'evidence.json');
  const r = cp.spawnSync(process.execPath, [COLLECT, '--repo', FAKE_APP, '--out', out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const raw = fs.readFileSync(out, 'utf8');
  const ev = JSON.parse(raw);
  for (const s of SECTIONS) assert.ok(s in ev, 'missing section ' + s);
  assert.ok(ev.sql.hits.some((h) => h.file === 'server.js' && typeof h.line === 'number' && h.type === 'template-literal-sql'));
  assert.ok(ev.secrets.hits.some((h) => h.file === 'server.js' && typeof h.line === 'number' && h.type === 'hardcoded-secret'));
  for (const h of ev.secrets.hits.concat(ev.sql.hits)) assert.deepStrictEqual(Object.keys(h).sort(), ['file', 'line', 'type']);
  assert.ok(!raw.includes('FAKE_SECRET_DO_NOT_USE_1234'));
  assert.ok(ev.routes.unprotected.some((x) => x.path === '/api/invoices'));
  assert.ok(!ev.routes.unprotected.some((x) => x.path === '/api/users'));
  assert.ok(ev.security.cors.wildcardOrigin.length > 0);
  assert.deepStrictEqual(ev.db.local.missingInMigrations, ['invoices']);
  assert.strictEqual(ev.health.path, '/health');
});

test('11. safe mode is truly local', async () => {
  const { calls, deps } = recorder();
  const out = path.join(tmp(), 'e.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out], deps), 0);
  const ev = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(ev.staging.status, 'skipped');
  assert.strictEqual(ev.ratelimitProbe.status, 'skipped');
  assert.strictEqual(ev.db.status, 'skipped');
  assert.strictEqual(ev.deps.status, 'skipped');
  assert.strictEqual(ev.nginx.status === 'unavailable' || ev.nginx.nginxTest.status === 'skipped', true);
  assert.ok(calls.exec.length > 0);
  for (const c of calls.exec) {
    assert.strictEqual(c.file, 'git');
    assert.ok(['ls-files', 'log'].includes(c.args[0]), c.args[0]);
  }
  assert.strictEqual(calls.http.length, 0);
  assert.strictEqual(calls.tls.length, 0);
  assert.strictEqual(ev.coverage.safeMode, true);
});

test('12. opt-ins without --confirm-staging exit 1 and do nothing', async () => {
  for (const argv of [['--probe-staging', '--staging-url', 'https://staging.example.com'], ['--probe-rate-limit', '--staging-url', 'https://staging.example.com'], ['--check-db']]) {
    const { calls, deps } = recorder({ env: { STAGING_DATABASE_URL: 'postgres://u:p@staging-db:5432/x' } });
    const out = path.join(tmp(), 'e.json');
    assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out].concat(argv), deps), 1, argv.join(' '));
    assert.strictEqual(calls.exec.length + calls.http.length + calls.tls.length, 0);
    assert.ok(!fs.existsSync(out));
  }
});

test('13. production-looking staging hosts are refused even with --confirm-staging', async () => {
  for (const url of ['https://prod.example.com', 'https://api-production.example.com', 'https://app.production.example.org']) {
    const { calls, deps } = recorder();
    const out = path.join(tmp(), 'e.json');
    assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out, '--probe-staging', '--confirm-staging', '--staging-url', url], deps), 1, url);
    assert.strictEqual(calls.http.length, 0);
    assert.ok(!fs.existsSync(out));
  }
  assert.strictEqual(collector.assessStagingHost('www.example.com', ['example.com']).ok, false);
  assert.strictEqual(collector.assessStagingHost('staging.example.com', ['staging.example.com']).ok, true);
});

const base = { rolsuper: false, rolcreatedb: false, rolcreaterole: false, dbCreate: false, schemasCreate: [], tablesWrite: [], memberOf: [] };
test('14. evaluateRolePrivileges refuses each write capability and passes read-only', () => {
  const ev = collector.evaluateRolePrivileges;
  const cases = [
    [{ rolsuper: true }, /superuser/],
    [{ schemasCreate: ['public'] }, /CREATE on 1 schema/],
    [{ tablesWrite: [{ table: 't', privileges: ['INSERT'] }] }, /INSERT/],
    [{ tablesWrite: [{ table: 't', privileges: ['TRUNCATE'] }] }, /TRUNCATE/],
    [{ memberOf: ['pg_write_server_files'] }, /pg_write_server_files/],
  ];
  for (const [patch, re] of cases) {
    const res = ev(Object.assign({}, base, patch));
    assert.strictEqual(res.ok, false);
    assert.match(res.reasons.join(','), re);
  }
  assert.deepStrictEqual(ev([base]), { ok: true, reasons: [] });
});

const PW = 'Zz9PlainPw';
const DB_URL = 'postgres://ro_user:' + PW + '@staging-db.internal:5432/appdb';
function psqlStub(roleRow) {
  const queries = [];
  const handler = (file, args, opts, cb) => {
    if (file === 'git') return cp.execFile(file, args, opts, cb);
    if (file !== 'psql') return cb(new Error('unexpected ' + file), '', '');
    const sql = args[args.indexOf('-c') + 1];
    queries.push(sql);
    const D = collector.DB_QUERIES;
    let body = '[]';
    if (sql.includes(D.guard)) body = JSON.stringify(roleRow);
    else if (sql.includes(D.columns)) body = JSON.stringify([{ table: 'users', columns: ['id', 'email'] }, { table: 'audit_log', columns: ['id'] }]);
    else if (sql.includes(D.noPk)) body = '["audit_log"]';
    else if (sql.includes(D.maxConnections)) body = '{"max_connections":"100"}';
    else if (sql.includes(D.roleSettings)) body = '[["statement_timeout=30000"]]';
    return cb(null, body + '\n', '');
  };
  return { queries, handler };
}

test('15. guard refusal issues exactly one psql call and nothing else', async () => {
  const stub = psqlStub(Object.assign({ rolname: 'ro_user' }, base, { rolsuper: true }));
  const { calls, deps } = recorder({ execFile: stub.handler, env: { STAGING_DATABASE_URL: DB_URL } });
  const out = path.join(tmp(), 'e.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out, '--check-db', '--confirm-staging'], deps), 0);
  assert.strictEqual(stub.queries.length, 1);
  const ev = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(ev.db.status, 'refused');
  assert.match(ev.db.reason, /^role has write privileges: .*superuser/);
  assert.strictEqual(ev.db.missingInDb, null);
  assert.strictEqual(calls.http.length, 0);
});

test('16. only SELECT against information_schema/pg_catalog reaches the database', async () => {
  const stub = psqlStub(Object.assign({ rolname: 'ro_user' }, base));
  const { deps } = recorder({ execFile: stub.handler, env: { STAGING_DATABASE_URL: DB_URL } });
  const out = path.join(tmp(), 'e.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out, '--check-db', '--confirm-staging'], deps), 0);
  assert.ok(stub.queries.length > 1);
  for (const q of stub.queries) {
    const stmts = q.split(';').map((s) => s.trim()).filter(Boolean);
    assert.strictEqual(stmts[0], 'BEGIN READ ONLY');
    for (const s of stmts.slice(1)) {
      assert.match(s, /^(SELECT|WITH)\b/i);
      assert.doesNotMatch(s, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE\s|DROP\s|ALTER\s|CREATE\s+(TABLE|ROLE)|GRANT\s|COPY\s)/i);
      for (const m of s.matchAll(/\b(?:FROM|JOIN)\s+([\w.(]+)/gi)) assert.match(m[1], /^(pg_catalog\.|information_schema\.|\(|unnest)/i, m[1]);
      assert.doesNotMatch(s, /\b(users|invoices|audit_log)\b/);
    }
  }
  const ev = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(ev.db.status, 'ok');
  assert.deepStrictEqual(ev.db.missingInDb, ['invoices']);
  assert.deepStrictEqual(ev.db.tablesWithoutPk, ['audit_log']);
  assert.strictEqual(ev.db.remote.maxConnections, 100);
});

test('17. without --safe-routes only the health endpoint and fixed paths are requested (GET/HEAD/OPTIONS)', async () => {
  const { calls, deps } = recorder();
  const out = path.join(tmp(), 'e.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out, '--probe-staging', '--confirm-staging', '--staging-url', 'https://staging.example.com'], deps), 0);
  assert.ok(calls.http.length > 5);
  const allowed = new Set(['/health'].concat(collector.FIXED_PROBE_PATHS));
  for (const r of calls.http) {
    assert.ok(['GET', 'HEAD', 'OPTIONS'].includes(r.method), r.method);
    assert.ok(allowed.has(new URL(r.url).pathname), r.url);
  }
  const ev = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(ev.staging.status, 'ok');
  assert.deepStrictEqual(ev.staging.safeRoutes, []);
});

test('--safe-routes adds only the listed GET paths; rate-limit probe stops on 429 and caps requests', async () => {
  const dir = tmp();
  const sr = path.join(dir, 'safe.txt');
  fs.writeFileSync(sr, '# safe\n/api/version\n');
  const rec = recorder();
  const out = path.join(dir, 'e.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out, '--probe-staging', '--confirm-staging', '--staging-url', 'https://staging.example.com', '--safe-routes', sr], rec.deps), 0);
  assert.ok(rec.calls.http.some((r) => new URL(r.url).pathname === '/api/version' && r.method === 'GET'));
  let n = 0;
  const rl = recorder({ async httpRequest(req) { rl.calls.http.push(req); n++; return n >= 4 ? { status: 429, headers: { 'retry-after': '5' }, body: '' } : { status: 200, headers: {}, body: '' }; } });
  const out2 = path.join(dir, 'e2.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out2, '--probe-rate-limit', '--confirm-staging', '--staging-url', 'https://staging.example.com'], rl.deps), 0);
  const ev = JSON.parse(fs.readFileSync(out2, 'utf8'));
  assert.strictEqual(ev.ratelimitProbe.requestsSent, 4);
  assert.strictEqual(ev.ratelimitProbe.got429, true);
});

test('18. output permissions and no credentials or row data in evidence', async (t) => {
  const stub = psqlStub(Object.assign({ rolname: 'ro_user' }, base));
  const { deps } = recorder({ execFile: stub.handler, env: { STAGING_DATABASE_URL: DB_URL } });
  const dir = path.join(tmp(), 'reports', '2026-01-01-0000');
  const out = path.join(dir, 'evidence.json');
  assert.strictEqual(await collect(['--repo', FAKE_APP, '--out', out, '--check-db', '--confirm-staging'], deps), 0);
  const raw = fs.readFileSync(out, 'utf8');
  assert.ok(!raw.includes(PW));
  assert.ok(!raw.includes('postgres://'));
  assert.ok(!raw.includes('FAKE_SECRET_DO_NOT_USE_1234'));
  if (process.platform === 'win32') return t.diagnostic('POSIX file modes are not enforced on Windows; mode assertions skipped');
  assert.strictEqual(fs.statSync(dir).mode & 0o777, 0o700);
  assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
  const s = runScore(all('pass'));
  assert.strictEqual(fs.statSync(path.join(s.out, 'report.md')).mode & 0o777, 0o600);
});

test('rules.md agrees with the collector on opt-in flags and allowed commands', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'rules.md'), 'utf8');
  for (const f of collector.OPT_IN_FLAGS) assert.ok(rules.includes('--' + f), f);
  assert.ok(rules.includes('--confirm-staging') && rules.includes('--safe-routes'));
  assert.deepStrictEqual(Object.keys(collector.ALLOWED_COMMANDS).sort(), ['git', 'nginx', 'npm', 'psql']);
  for (const phrase of ['git ls-files', 'git log', 'npm audit --json', 'nginx -t', 'psql']) assert.ok(rules.includes(phrase), phrase);
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  for (const f of collector.OPT_IN_FLAGS) assert.ok(skill.includes('--' + f), 'SKILL.md ' + f);
  assert.ok(skill.split('\n').length < 500);
});
