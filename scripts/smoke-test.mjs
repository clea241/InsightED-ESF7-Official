// Smoke test of the BUILT output: start the real server against a disposable database, check the health endpoint,
// do a real draft save + read, and make sure the built client is served with its assets.
// Requires TEST_DATABASE_URL (use `npm run smoke`, which provides an embedded PostgreSQL).
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { TEST_DATABASE_URL, SCHEMA_SQL, assertDisposableDatabase, nodeRequire } from '../server/tests/integration/helpers.mjs';

assertDisposableDatabase(TEST_DATABASE_URL);
const root = path.resolve('.');
const serverPort = 5600 + Math.floor(Math.random() * 300);
const clientPort = 5900 + Math.floor(Math.random() * 300);
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures.push(label); };

// 1. Prepare the disposable database exactly like the integration tests (schema + the real additive migration).
const { Pool } = nodeRequire('pg');
const pool = new Pool({ connectionString: TEST_DATABASE_URL });
await pool.query(SCHEMA_SQL);
const u = new URL(TEST_DATABASE_URL);
const dbEnv = {
  DATABASE_URL: TEST_DATABASE_URL, DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
  DB_USER: decodeURIComponent(u.username), DB_PASSWORD: decodeURIComponent(u.password), DB_SSL: 'false'
};
const mig = spawnSync(process.execPath, ['migrations/add_school_drafts_version.js'], { cwd: path.join(root, 'server'), env: { ...process.env, ...dbEnv }, encoding: 'utf8' });
check(mig.status === 0, 'additive migration applies');

// 2. Start the real server (with a throw-away JWT secret; the smoke test signs its own token for school 302261).
const SMOKE_SECRET = 'smoke-test-secret-not-used-anywhere-else';
const smokeToken = nodeRequire('jsonwebtoken').sign({ uid: 'smoke-302261', role: 'school', school_id: '302261' }, SMOKE_SECRET, { expiresIn: '10m' });
const authHeaders = { Authorization: `Bearer ${smokeToken}`, 'x-school-id': '302261' };
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, ...dbEnv, PORT: String(serverPort), START_LOCAL_WORKER: 'false', JWT_SECRET: SMOKE_SECRET },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

// 3. Serve the built client.
const dist = path.join(root, 'client', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const staticServer = createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => staticServer.listen(clientPort, r));

const waitFor = async (fn, ms = 45000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }
  return null;
};

try {
  // Readiness: 200 when the app and PostgreSQL are fine, even though no Redis runs here (queue falls back to PostgreSQL).
  let healthRes = null;
  const health = await waitFor(async () => { healthRes = await fetch(`http://127.0.0.1:${serverPort}/api/health/readiness`); return healthRes.status === 200 ? healthRes.json() : null; });
  check(!!health, 'GET /api/health/readiness answers 200 without Redis');
  check(health?.db === 'up', 'readiness reports the database is up (it runs a real query)');
  check(health?.redis === 'degraded' && health?.queue?.mode === 'postgres-fallback', 'readiness reports Redis as degraded in the body, queue in postgres-fallback');
  const deep = await fetch(`http://127.0.0.1:${serverPort}/api/health/deep`);
  check(deep.status === 503, 'GET /api/health/deep (monitoring only) fails when Redis is down');
  const strict = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
  check(strict.status === 503, 'GET /api/health (strict, for monitors) also fails when Redis is down: only /readiness may drive the lock');

  const put = await fetch(`http://127.0.0.1:${serverPort}/api/school/draft`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ schoolYear: 'SY 26-27', baseVersion: 0, payload: { schoolInfo: { schoolId: '302261' }, personnel: [{ id: 'P1' }], note: 'smoke' } })
  });
  const putBody = await put.json();
  check(put.status === 200 && putBody.success === true && putBody.version === 1, 'test draft save is confirmed with a version');
  const got = await (await fetch(`http://127.0.0.1:${serverPort}/api/school/draft?schoolYear=SY%2026-27`, { headers: authHeaders })).json();
  const noToken = await fetch(`http://127.0.0.1:${serverPort}/api/school/draft?schoolYear=SY%2026-27`, { headers: { 'x-school-id': '302261' } });
  check(noToken.status === 401, 'a request without a token is rejected (401)');
  check(got.payload?.note === 'smoke' && got.version === 1, 'the saved draft reads back');
  const row = await pool.query("SELECT payload->>'note' AS note FROM school_drafts WHERE school_id = '302261'");
  check(row.rows[0]?.note === 'smoke', 'the row is really in the database');

  const html = await (await fetch(`http://127.0.0.1:${clientPort}/`)).text();
  check(/<div id="root">/.test(html), 'built index.html loads');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check(assets.length > 0, 'index.html references built assets');
  const statuses = await Promise.all(assets.map(async (a) => (await fetch(`http://127.0.0.1:${clientPort}${a}`)).status));
  check(statuses.every((s) => s === 200), 'every referenced asset is served');
} finally {
  server.kill();
  staticServer.close();
  await pool.end();
}

if (failures.length) {
  console.error(`\n[smoke] ${failures.length} check(s) failed. Server log tail:\n${serverLog.split('\n').slice(-25).join('\n')}`);
  process.exit(1);
}
console.log('\n[smoke] all checks passed');
process.exit(0);
