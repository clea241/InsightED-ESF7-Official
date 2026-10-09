#!/usr/bin/env node
'use strict';
/*
 * collect-evidence.js - read-only fact collector for prelaunch-readiness-check.
 * Node built-ins only. Safe mode (no opt-in flags) reads local files only and runs
 * nothing except `git ls-files` and `git log`. See ../rules.md for the full rules.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const http = require('http');
const https = require('https');
const tls = require('tls');

const VERSION = 1;
const OPT_IN_FLAGS = ['probe-staging', 'check-db', 'allow-npm-audit', 'run-nginx-test', 'probe-rate-limit'];
const VALUE_FLAGS = ['repo', 'nginx-conf', 'pm2', 'audit-file', 'out', 'staging-url', 'safe-routes', 'health-path'];
const BOOL_FLAGS = [...OPT_IN_FLAGS, 'confirm-staging'];
const NEEDS_CONFIRM = ['probe-staging', 'probe-rate-limit', 'check-db'];

// Allowlist of external commands. Anything else is refused by run().
const ALLOWED_COMMANDS = {
  git: { subcommands: ['ls-files', 'log'], flag: null },
  npm: { subcommands: ['audit'], flag: 'allow-npm-audit' },
  nginx: { subcommands: ['-t'], flag: 'run-nginx-test' },
  psql: { subcommands: null, flag: 'check-db' },
};

const SECTIONS = ['meta', 'coverage', 'repo', 'sql', 'secrets', 'routes', 'security', 'deps', 'ratelimit',
  'db', 'nginx', 'pm2', 'health', 'observability', 'backups', 'staging', 'ratelimitProbe'];

// The only paths ever requested on staging besides the health endpoint and --safe-routes.
const SENSITIVE_PATHS = ['/.env', '/.git/HEAD', '/debug', '/metrics', '/api-docs', '/swagger', '/server-status',
  '/main.js.map', '/static/js/main.js.map', '/assets/index.js.map'];
const UNKNOWN_API_PATH = '/api/__readiness_probe_404__';
const FIXED_PROBE_PATHS = [...SENSITIVE_PATHS, UNKNOWN_API_PATH];

const DB_QUERIES = {
  guard: "SELECT json_build_object('rolname', r.rolname, 'rolsuper', r.rolsuper, 'rolcreatedb', r.rolcreatedb, " +
    "'rolcreaterole', r.rolcreaterole, 'dbCreate', has_database_privilege(current_database(), 'CREATE'), " +
    "'schemasCreate', (SELECT coalesce(json_agg(n.nspname), '[]'::json) FROM pg_catalog.pg_namespace n " +
    "WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' AND has_schema_privilege(n.oid, 'CREATE')), " +
    "'tablesWrite', (SELECT coalesce(json_agg(json_build_object('table', c.relname, 'privileges', array_remove(ARRAY[" +
    "CASE WHEN has_table_privilege(c.oid, 'INSERT') THEN 'INSERT' END, CASE WHEN has_table_privilege(c.oid, 'UPDATE') THEN 'UPDATE' END, " +
    "CASE WHEN has_table_privilege(c.oid, 'DELETE') THEN 'DELETE' END, CASE WHEN has_table_privilege(c.oid, 'TRUNCATE') THEN 'TRUNCATE' END], NULL))), '[]'::json) " +
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p') " +
    "AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' AND has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')), " +
    "'memberOf', (SELECT coalesce(json_agg(g), '[]'::json) FROM unnest(ARRAY['pg_write_server_files', 'pg_execute_server_program', 'pg_read_server_files']) g " +
    "WHERE pg_has_role(current_user, g, 'MEMBER'))) FROM pg_catalog.pg_roles r WHERE r.rolname = current_user",
  columns: "SELECT coalesce(json_agg(json_build_object('table', t.table_name, 'columns', t.cols)), '[]'::json) FROM " +
    "(SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS cols FROM information_schema.columns " +
    "WHERE table_schema NOT IN ('pg_catalog', 'information_schema') GROUP BY table_name) t",
  noPk: "SELECT coalesce(json_agg(c.relname), '[]'::json) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    "WHERE c.relkind IN ('r', 'p') AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' " +
    "AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')",
  fkNoIndex: "SELECT coalesce(json_agg(c.relname || '.' || k.conname), '[]'::json) FROM pg_catalog.pg_constraint k " +
    "JOIN pg_catalog.pg_class c ON c.oid = k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    "WHERE k.contype = 'f' AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' " +
    "AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid = k.conrelid AND i.indkey[0] = k.conkey[1])",
  roleSettings: "SELECT coalesce(json_agg(s.setconfig), '[]'::json) FROM pg_catalog.pg_db_role_setting s",
  maxConnections: "SELECT json_build_object('max_connections', (SELECT setting FROM pg_catalog.pg_settings WHERE name = 'max_connections'))",
};

// ---------------------------------------------------------------- helpers

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) throw new Error('Unexpected argument: ' + t);
    const k = t.slice(2);
    if (BOOL_FLAGS.includes(k)) a[k] = true;
    else if (VALUE_FLAGS.includes(k)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error('Flag --' + k + ' needs a value');
      a[k] = v;
    } else throw new Error('Unknown flag: ' + t);
  }
  return a;
}

function redact(str, secrets) {
  let s = String(str == null ? '' : str);
  for (const x of secrets || []) if (x && x.length >= 3) s = s.split(x).join('***');
  return s.replace(/(:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/g, '$1***@');
}

function evaluateRolePrivileges(rows) {
  const r = Array.isArray(rows) ? rows[0] : rows;
  if (!r || typeof r !== 'object') return { ok: false, reasons: ['role privilege query returned no usable result'] };
  const reasons = [];
  if (r.rolsuper) reasons.push('superuser');
  if (r.rolcreatedb) reasons.push('CREATEDB');
  if (r.rolcreaterole) reasons.push('CREATEROLE');
  if (r.dbCreate) reasons.push('CREATE on database');
  const sc = r.schemasCreate || [];
  if (sc.length) reasons.push('CREATE on ' + sc.length + ' schema(s)');
  const privs = {};
  for (const t of r.tablesWrite || []) for (const p of t.privileges || []) privs[p] = (privs[p] || 0) + 1;
  for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) if (privs[p]) reasons.push(p + ' on ' + privs[p] + ' table(s)');
  for (const g of r.memberOf || []) reasons.push('member of ' + g);
  return { ok: reasons.length === 0, reasons };
}

function assessStagingHost(hostname, serverNames) {
  const h = String(hostname || '').toLowerCase();
  if (/prod/.test(h)) return { ok: false, reason: 'hostname contains "prod"/"production"' };
  const names = (serverNames || []).map((s) => s.toLowerCase());
  const bare = h.replace(/^www\./, '');
  const stagingMarker = /(staging|stage|stg|uat|qa|test|dev|sandbox)/;
  if (!stagingMarker.test(h) && (names.includes(h) || names.includes(bare) || names.includes('www.' + bare))) {
    return { ok: false, reason: 'hostname is a production server_name in the nginx config' };
  }
  return { ok: true };
}

function defaultHttpRequest({ method, url, headers, timeoutMs }) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    const req = lib.request(u, { method, headers: Object.assign({ 'user-agent': 'prelaunch-readiness-check/1' }, headers || {}), timeout: timeoutMs || 8000 }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => { if (size < 4096) { chunks.push(c); size += c.length; } });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8').slice(0, 4096), timeMs: Date.now() - t0 }));
      res.on('error', (e) => resolve({ error: e.code || e.message }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ error: e.code || e.message, timeMs: Date.now() - t0 }));
    req.end();
  });
}

function defaultTlsInfo(host, port) {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = s.getPeerCertificate();
      const validTo = cert && cert.valid_to ? new Date(cert.valid_to) : null;
      resolve({
        protocol: s.getProtocol(), authorized: s.authorized, authorizationError: s.authorizationError ? String(s.authorizationError) : null,
        validTo: validTo ? validTo.toISOString() : null,
        daysRemaining: validTo ? Math.floor((validTo.getTime() - Date.now()) / 86400000) : null,
      });
      s.end();
    });
    s.on('error', (e) => resolve({ error: e.code || e.message }));
    s.on('timeout', () => { s.destroy(); resolve({ error: 'timeout' }); });
  });
}

// ---------------------------------------------------------------- file access

const TEXT_EXT = /\.(?:[cm]?jsx?|tsx?|json|sql|ya?ml|conf|sh|toml|ini|md|txt|cfg|properties|env)$|(?:^|\/)(?:Dockerfile|Makefile|crontab|Jenkinsfile|\.env[\w.]*)$/;
const CODE_EXT = /\.(?:[cm]?jsx?|tsx?)$/;
const SKIP_PATH = /(?:^|\/)(?:node_modules|\.git|dist|build|coverage|\.next|readiness-reports|\.claude\/skills\/prelaunch-readiness-check)\//;
const LOCK = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|__mocks__|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

function walk(root, rel, out) {
  let ents;
  try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_PATH.test(r + '/')) walk(root, r, out); } else if (e.isFile()) out.push(r);
  }
  return out;
}

function makeCtx(repo, files) {
  const cache = new Map();
  const lineCache = new Map();
  const ctx = {
    repo, files,
    read(rel) {
      if (cache.has(rel)) return cache.get(rel);
      let t = '';
      try {
        const p = path.join(repo, rel);
        if (fs.statSync(p).size <= 1500000) t = fs.readFileSync(p, 'utf8');
      } catch { t = ''; }
      cache.set(rel, t);
      return t;
    },
    lines(rel) {
      if (!lineCache.has(rel)) lineCache.set(rel, ctx.read(rel).split(/\r?\n/));
      return lineCache.get(rel);
    },
  };
  ctx.scannable = files.filter((f) => TEXT_EXT.test(f) && !LOCK.test(f) && !/\.min\./.test(f) && !SKIP_PATH.test(f));
  ctx.code = ctx.scannable.filter((f) => CODE_EXT.test(f));
  ctx.appCode = ctx.code.filter((f) => !TEST_PATH.test(f));
  return ctx;
}

function scanLines(ctx, files, re, cap) {
  const hits = [];
  for (const f of files) {
    const ls = ctx.lines(f);
    for (let i = 0; i < ls.length; i++) {
      if (ls[i].length < 2000 && re.test(ls[i])) { hits.push({ file: f, line: i + 1 }); if (hits.length >= (cap || 200)) return hits; }
    }
  }
  return hits;
}

function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; }
const anyText = (ctx, files, re) => files.some((f) => re.test(ctx.read(f)));
const uniq = (a) => [...new Set(a)];

// ---------------------------------------------------------------- local sections

function collectRepo(ctx) {
  const pkgFiles = ctx.files.filter((f) => /(^|\/)package\.json$/.test(f) && !SKIP_PATH.test(f));
  const interesting = ['verify', 'lint', 'test', 'build', 'typecheck', 'start'];
  const scripts = Object.fromEntries(interesting.map((k) => [k, []]));
  const depNames = new Set();
  const packages = [];
  let engines = null;
  for (const p of pkgFiles) {
    let j; try { j = JSON.parse(ctx.read(p)); } catch { continue; }
    packages.push({ file: p, name: j.name || null, scripts: Object.keys(j.scripts || {}) });
    for (const k of interesting) if (j.scripts && j.scripts[k]) scripts[k].push(p);
    for (const d of Object.keys(Object.assign({}, j.dependencies, j.devDependencies))) depNames.add(d);
    if (j.engines && !engines) engines = j.engines;
  }
  const dn = [...depNames];
  const frameworks = ['express', 'fastify', 'koa', '@nestjs/core', 'next', 'react', 'vue', 'hapi'].filter((d) => depNames.has(d));
  const ciFiles = ctx.files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)\.gitlab-ci\.yml$|(^|\/)Jenkinsfile$|azure-pipelines\.ya?ml$|\.circleci\/config\.yml$/.test(f));
  const ciHint = (re) => anyText(ctx, ciFiles, re);
  const eslintCfg = ctx.files.filter((f) => /(^|\/)(\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?js)$/.test(f));
  const deployFiles = ctx.scannable.filter((f) => /(deploy|release|rollback)/i.test(path.basename(f)) && /\.(sh|ya?ml|[cm]?js|ps1)$/.test(f))
    .concat(ciFiles);
  const dep = uniq(deployFiles);
  return {
    packages, scripts, engines, dependencyCount: dn.length, frameworks,
    lockfiles: ctx.files.filter((f) => LOCK.test(f) && !SKIP_PATH.test(f)),
    ci: {
      files: ciFiles,
      hints: {
        tests: ciHint(/npm (?:run )?(?:test|verify)|yarn test|pnpm test|jest|vitest|node --test/),
        sast: ciHint(/semgrep|codeql|snyk code/i),
        npmAudit: ciHint(/npm audit|audit-ci/),
        secretScan: ciHint(/gitleaks|trufflehog|detect-secrets/i),
      },
    },
    lintConfig: { files: eslintCfg, noUndef: anyText(ctx, eslintCfg, /no-undef|eslint:recommended|js\.configs\.recommended|recommended/), reactHooks: anyText(ctx, eslintCfg, /react-hooks/) },
    testFiles: ctx.files.filter((f) => TEST_PATH.test(f) && CODE_EXT.test(f) && !SKIP_PATH.test(f)).length,
    openapi: ctx.files.filter((f) => /(openapi|swagger)[^/]*\.(json|ya?ml)$/i.test(f)),
    docs: ctx.files.filter((f) => /\.md$/i.test(f) && /(runbook|incident|disaster|restore|rpo|rto|on-?call|security|architecture|offboard|patch)/i.test(f) && !SKIP_PATH.test(f)),
    dockerfile: ctx.files.some((f) => /(^|\/)Dockerfile/.test(f)),
    deploy: {
      files: dep,
      pm2Reload: anyText(ctx, dep, /pm2\s+(?:startOrReload|reload|gracefulReload)/),
      pm2Restart: anyText(ctx, dep, /pm2\s+restart/),
      nginxTest: anyText(ctx, dep, /nginx\s+-t\b/),
      nginxReload: anyText(ctx, dep, /nginx\s+-s\s+reload|systemctl\s+reload\s+nginx|service\s+nginx\s+reload/),
      nginxRestart: anyText(ctx, dep, /systemctl\s+restart\s+nginx|service\s+nginx\s+restart/),
      backupStep: anyText(ctx, dep, /pg_dump|pgbackrest|backup/i),
      smokeTest: anyText(ctx, dep, /smoke|curl[^\n]*health/i),
      rollback: anyText(ctx, dep, /rollback/i),
    },
  };
}

function collectSql(ctx) {
  const hits = [];
  const seen = new Set();
  const add = (file, line, type) => { const k = file + ':' + line + ':' + type; if (!seen.has(k) && hits.length < 300) { seen.add(k); hits.push({ file, line, type }); } };
  const tpl = /`[^`]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^`]*\$\{[^`]*`/gi;
  const call = /\.(?:query|execute|raw)\s*\(\s*(?:"[^"\n]*"|'[^'\n]*')\s*\+/g;
  for (const f of ctx.appCode) {
    const t = ctx.read(f);
    let m;
    tpl.lastIndex = 0; while ((m = tpl.exec(t))) add(f, lineOf(t, m.index), 'template-literal-sql');
    call.lastIndex = 0; while ((m = call.exec(t))) add(f, lineOf(t, m.index), 'string-concat-in-query');
  }
  return { hits, count: hits.length };
}

function collectSecrets(ctx, run) {
  const patterns = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
    ['jwt-fallback', /process\.env\.\w*(?:SECRET|KEY|TOKEN)\w*\s*(?:\|\||\?\?)\s*["'`]/],
    ['hardcoded-password', /\w*(?:password|passwd|pwd)\w*\s*[:=]\s*["'][^"'\s]{4,}["']/i],
    ['hardcoded-secret', /\w*(?:secret|api_?key|access_?token|auth_?token|private_?key)\w*\s*[:=]\s*["'][^"'\s]{6,}["']/i],
  ];
  const files = ctx.scannable.filter((f) => !/\.md$/i.test(f));
  const hits = [];
  for (const f of files) {
    const ls = ctx.lines(f);
    for (let i = 0; i < ls.length && hits.length < 300; i++) {
      if (ls[i].length > 2000) continue;
      for (const [type, re] of patterns) if (re.test(ls[i])) { hits.push({ file: f, line: i + 1, type }); break; }
    }
  }
  const trackedEnvFiles = ctx.files.filter((f) => /(^|\/)\.env(?:\.[\w.]+)?$/.test(f) && !/\.(example|sample|template)$/.test(f));
  const gi = ctx.read('.gitignore');
  return {
    hits, count: hits.length, trackedEnvFiles,
    gitignoreCoversEnv: /^\.env/m.test(gi),
    gitHistoryHits: run ? run.historyHits : null,
  };
}

async function gitHistoryHits(run) {
  const r = await run('git', ['log', '--all', '--oneline', '-n', '20', '-G', 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}', '--', '.'], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (r.err) return { status: 'unavailable', reason: 'git log failed' };
  return { status: 'ok', commitsMatching: r.stdout.split('\n').filter(Boolean).length };
}

const AUTH_RE = /(auth|authenticate|authorize|requireAuth|verifyToken|verifyJwt|jwt|protect|isLoggedIn|ensureLoggedIn|requireRole|requireLogin|passport|guard|checkToken)/i;
const ROUTE_RE = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all|options|head)\(\s*(['"`])(\/[^'"`]*|\*)\3\s*(,|\))/;
const RECEIVER_RE = /^(?:app|router|routes?|\w*Router|\w*Routes?)$/;

function resolveLocal(ctx, fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const c of [base, base + '.js', base + '.cjs', base + '.mjs', base + '.ts', base + '/index.js', base + '/index.ts']) if (ctx.files.includes(c)) return c;
  return null;
}

function collectRoutes(ctx) {
  const routes = [];
  const mounts = [];
  const mountedAuthed = new Set();
  const mountedOpen = new Set();
  for (const f of ctx.appCode) {
    const t = ctx.read(f);
    if (!/\.(get|post|put|patch|delete|all|use)\(/.test(t)) continue;
    const idents = {};
    for (const m of t.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) idents[m[1]] = m[2];
    for (const m of t.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g)) idents[m[1]] = m[2];
    const ls = ctx.lines(f);
    let fileAuthLine = Infinity;
    let gatePrefix = null; // app.use('/api', authGate) protects later mounts under that prefix
    ls.forEach((line, i) => {
      const u = line.match(/\b(?:app|router|\w*Router)\.use\((.*)$/);
      if (!u) return;
      const args = u[1].split(',').map((s) => s.trim());
      const hasPath = /^['"`]/.test(args[0] || '');
      const prefix = hasPath ? args[0].slice(1, -1) : '';
      const mw = hasPath ? args.slice(1) : args;
      const last = (mw[mw.length - 1] || '').replace(/\).*$/, '').replace(/;$/, '');
      const reqm = (mw[mw.length - 1] || '').match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
      const spec = reqm ? reqm[1] : idents[last];
      const target = spec ? resolveLocal(ctx, f, spec) : null;
      const expr = (mw[0] || '').replace(/\)\s*;?\s*$/, '').trim();
      const isGate = mw.length === 1 && AUTH_RE.test(expr) &&
        (/^require\(\s*['"][^'"]+['"]\s*\)\s*\.\s*\w+$/.test(expr) || (/^[\w$]+$/.test(expr) && !/(?:Router|Routes?)$/i.test(expr)));
      if (isGate) {
        if (i + 1 < fileAuthLine) fileAuthLine = i + 1;
        if (gatePrefix === null) gatePrefix = prefix;
        mounts.push({ file: f, line: i + 1, gate: true, prefix: prefix || '/' });
        return;
      }
      const authed = mw.slice(0, -1).some((a) => AUTH_RE.test(a)) || (gatePrefix !== null && i + 1 > fileAuthLine && prefix.startsWith(gatePrefix));
      if (target) {
        (authed ? mountedAuthed : mountedOpen).add(target);
        mounts.push({ file: f, line: i + 1, mountedFile: target, authenticated: authed, via: authed && !mw.slice(0, -1).some((a) => AUTH_RE.test(a)) ? 'gate' : 'mount-middleware' });
      }
    });
    ls.forEach((line, i) => {
      if (line.length > 2000) return;
      const m = line.match(ROUTE_RE);
      if (!m || !RECEIVER_RE.test(m[1])) return;
      const rest = (line.slice(m.index + m[0].length - 1) + ' ' + (ls[i + 1] || '')).trim();
      const cut = rest.search(/\(?\s*(?:async\s*)?\(?\s*req\b|=>|function\b/);
      let mwArgs;
      if (cut >= 0) mwArgs = rest.slice(0, cut).split(',');
      else mwArgs = rest.replace(/\)\s*;?\s*$/, '').split(',').slice(0, -1);
      let by = null;
      if (mwArgs.some((a) => AUTH_RE.test(a))) by = 'route-middleware';
      else if (i + 1 > fileAuthLine) by = 'file-use';
      else if (mountedAuthed.has(f)) by = 'mount';
      routes.push({ method: m[2].toUpperCase(), path: m[4], file: f, line: i + 1, protectedBy: by, mountedWithoutAuth: mountedOpen.has(f) });
    });
  }
  // second pass: mounts discovered after the route file was processed
  for (const r of routes) if (!r.protectedBy && mountedAuthed.has(r.file)) r.protectedBy = 'mount';
  const unprotected = routes.filter((r) => !r.protectedBy);
  const publicRe = /health|ready|live|ping|status|login|signin|register|signup|forgot|reset|public|webhook|callback|version/i;
  return {
    total: routes.length,
    protectedCount: routes.length - unprotected.length,
    routes: routes.slice(0, 600),
    unprotected: unprotected.slice(0, 600),
    publicAllowlistCandidates: unprotected.filter((r) => publicRe.test(r.path)).slice(0, 100),
    mounts: mounts.slice(0, 100),
    note: 'Heuristic (gate exemptions such as public login routes are NOT analysed; open the gate middleware to confirm): auth detected from middleware names on the route line, app/router.use(auth) earlier in the file, or an authenticated mount. Verify by opening the cited files.',
  };
}

function collectSecurity(ctx) {
  const code = ctx.appCode;
  const all = ctx.code;
  const dn = new Set();
  for (const p of ctx.files.filter((f) => /(^|\/)package\.json$/.test(f) && !SKIP_PATH.test(f))) {
    try { const j = JSON.parse(ctx.read(p)); Object.keys(Object.assign({}, j.dependencies, j.devDependencies)).forEach((d) => dn.add(d)); } catch { /* ignore */ }
  }
  const has = (...names) => names.filter((n) => dn.has(n));
  const corsLines = scanLines(ctx, code, /\bcors\s*\(/);
  const corsWild = scanLines(ctx, code, /origin\s*:\s*['"`]\*['"`]/);
  const bareCors = scanLines(ctx, code, /\bcors\(\s*\)/);
  const execHits = [];
  for (const h of scanLines(ctx, code, /(?<![.\w])exec(?:Sync)?\(|child_process\.exec(?:Sync)?\(/)) {
    const ln = ctx.lines(h.file)[h.line - 1];
    const arg = (ln.match(/exec(?:Sync)?\(\s*(.*)/) || [])[1] || '';
    if (/\$\{|\s\+\s|^[A-Za-z_$]/.test(arg)) execHits.push(h);
  }
  return {
    helmet: has('helmet').length > 0 || scanLines(ctx, code, /helmet\s*\(/, 1).length > 0,
    csp: scanLines(ctx, code, /contentSecurityPolicy|Content-Security-Policy/i, 5),
    hsts: scanLines(ctx, code, /hsts|Strict-Transport-Security/i, 5),
    cors: { usage: corsLines, wildcardOrigin: corsWild, bareCors, credentialsTrue: scanLines(ctx, code, /credentials\s*:\s*true/, 20), library: has('cors') },
    csrf: { libraries: has('csurf', 'csrf-csrf', 'lusca'), sameSite: scanLines(ctx, code, /sameSite/i, 20) },
    cookies: { httpOnly: scanLines(ctx, code, /httpOnly/i, 10).length, secure: scanLines(ctx, code, /secure\s*:/i, 10).length },
    innerHtml: scanLines(ctx, all, /dangerouslySetInnerHTML|\.innerHTML\s*=|\binsertAdjacentHTML\(/, 100),
    sanitizers: has('dompurify', 'isomorphic-dompurify', 'sanitize-html', 'xss'),
    evalUse: scanLines(ctx, code, /(?<![.\w])eval\s*\(|new Function\s*\(/, 50),
    execWithVariables: execHits,
    uploadLibs: has('multer', 'formidable', 'busboy', 'express-fileupload', 'multiparty'),
    passwordHashing: has('bcrypt', 'bcryptjs', 'argon2', '@node-rs/argon2', 'scrypt-kdf'),
    jwtLibraries: has('jsonwebtoken', 'jose', 'passport-jwt', 'fast-jwt'),
    jwtExpiry: scanLines(ctx, code, /expiresIn/, 20),
    validationLibs: has('zod', 'joi', 'yup', 'ajv', 'express-validator', 'celebrate', 'valibot', '@sinclair/typebox', 'class-validator'),
    bodyLimit: scanLines(ctx, code, /(?:express\.json|bodyParser\.json|json)\(\s*\{[^}]*limit/, 10),
    requestTimeouts: scanLines(ctx, code, /requestTimeout|headersTimeout|connect-timeout|server\.timeout|setTimeout\(\s*\d+\s*\)/, 20),
    errorHandlers: scanLines(ctx, code, /\(\s*(?:err|error)\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/, 20),
    processHandling: {
      unhandledRejection: scanLines(ctx, code, /['"]unhandledRejection['"]/, 5),
      uncaughtException: scanLines(ctx, code, /['"]uncaughtException['"]/, 5),
      sigterm: scanLines(ctx, code, /['"]SIGTERM['"]/, 5),
      sigint: scanLines(ctx, code, /['"]SIGINT['"]/, 5),
      serverClose: scanLines(ctx, code, /server\.close\(|\.close\(\s*\(?\s*(?:err)?/, 5),
      sendReady: scanLines(ctx, code, /process\.send\(\s*['"]ready['"]/, 5),
      asyncErrorLibs: has('express-async-errors', 'express-async-handler', 'express'),
    },
    envValidation: scanLines(ctx, code, /envalid|dotenv-safe|@t3-oss\/env|env-var|if\s*\(\s*!process\.env\.\w+\s*\)/, 20),
  };
}

function parseNginx(text) {
  const out = {};
  const grabAll = (re) => [...text.matchAll(re)].map((m) => m[1].trim());
  out.serverBlocks = (text.match(/\bserver\s*\{/g) || []).length;
  out.serverNames = uniq(grabAll(/server_name\s+([^;]+);/g).flatMap((s) => s.split(/\s+/)).filter((s) => s && s !== '_'));
  out.upstreams = [...text.matchAll(/upstream\s+([\w.-]+)\s*\{([^}]*)\}/g)].map((m) => ({
    name: m[1], servers: (m[2].match(/^\s*server\s/gm) || []).length,
    keepalive: /\bkeepalive\s+\d+/.test(m[2]), maxFails: /max_fails=/.test(m[2]), failTimeout: /fail_timeout=/.test(m[2]),
    leastConn: /\bleast_conn\b/.test(m[2]), ipHash: /\bip_hash\b/.test(m[2]),
  }));
  const timeoutKeys = ['proxy_read_timeout', 'proxy_connect_timeout', 'proxy_send_timeout', 'client_body_timeout', 'client_header_timeout', 'send_timeout', 'keepalive_timeout', 'client_max_body_size', 'client_body_buffer_size', 'large_client_header_buffers'];
  out.timeouts = Object.fromEntries(timeoutKeys.map((k) => [k, grabAll(new RegExp('\\b' + k + '\\s+([^;]+);', 'g'))]));
  out.connectionHardcodedUpgrade = /proxy_set_header\s+Connection\s+["']?upgrade["']?\s*;/i.test(text);
  out.connectionUpgradeMap = /map\s+\$http_upgrade\s+\$connection_upgrade/.test(text);
  out.gzip = /\bgzip\s+on\s*;/.test(text);
  out.securityHeaders = Object.fromEntries(['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy', 'Permissions-Policy']
    .map((h) => [h, new RegExp('add_header\\s+' + h + '\\b', 'i').test(text)]));
  out.serverTokensOff = /server_tokens\s+off\s*;/.test(text);
  out.tls = {
    listen443: /listen\s+[^;]*\b443\b/.test(text), sslCertificate: /ssl_certificate\s/.test(text),
    protocols: grabAll(/ssl_protocols\s+([^;]+);/g), httpsRedirect: /return\s+30[1278]\s+https:\/\//.test(text),
    acmeOrCertbot: /certbot|acme-challenge|letsencrypt/i.test(text), http2: /\bhttp2\b/.test(text),
  };
  out.denyDotfiles = /location\s+~\s+\/\\\.[^{]*\{[^}]*(deny\s+all|return\s+40[34])/.test(text);
  out.denySourceMaps = /location\s+~\*?\s+[^{]*\\\.map[^{]*\{[^}]*(deny\s+all|return\s+40[34])/.test(text);
  out.autoindex = /autoindex\s+on\s*;/.test(text);
  out.maintenance503 = /return\s+503/.test(text);
  out.retryAfterHeader = /Retry-After/i.test(text);
  out.limitReqZones = grabAll(/limit_req_zone\s+([^;]+);/g);
  out.limitReq = grabAll(/\blimit_req\s+([^;]+);/g);
  out.limitConn = grabAll(/\blimit_conn\s+([^;]+);/g);
  out.proxyPass = grabAll(/proxy_pass\s+([^;]+);/g).map((s) => s.replace(/\/\/[^/@]*@/, '//***@'));
  out.locationsWithLimitReq = [...text.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)].filter((m) => /limit_req\s/.test(m[2])).map((m) => m[1].trim());
  return out;
}

function pickFile(ctx, explicit, re) {
  if (explicit) {
    const abs = path.resolve(explicit);
    if (fs.existsSync(abs)) return { abs, rel: path.relative(ctx.repo, abs).split(path.sep).join('/') };
    const inRepo = path.join(ctx.repo, explicit);
    if (fs.existsSync(inRepo)) return { abs: inRepo, rel: explicit };
    return null;
  }
  const rel = ctx.files.find((f) => re.test(f) && !SKIP_PATH.test(f));
  return rel ? { abs: path.join(ctx.repo, rel), rel } : null;
}

function collectNginx(ctx, args) {
  let cfgs = [];
  if (args['nginx-conf']) { const p = pickFile(ctx, args['nginx-conf']); if (p) cfgs = [p]; }
  else cfgs = ctx.files.filter((f) => /(?:^|\/)nginx[^/]*\.conf$|(?:^|\/)nginx\/[^/]+\.conf$|(?:^|\/)(?:sites-available|conf\.d)\/[^/]+$/.test(f) && !SKIP_PATH.test(f)).map((f) => ({ abs: path.join(ctx.repo, f), rel: f }));
  if (!cfgs.length) return { status: 'unavailable', reason: 'no nginx config found (pass --nginx-conf PATH)' };
  let text = '';
  for (const c of cfgs) { try { text += '\n' + fs.readFileSync(c.abs, 'utf8'); } catch { /* ignore */ } }
  const tracked = cfgs.every((c) => ctx.files.includes(c.rel));
  return Object.assign({ status: 'ok', files: cfgs.map((c) => c.rel), trackedInRepo: tracked, nginxTest: { status: 'skipped', reason: 'not opted in' } }, parseNginx(text), { _paths: cfgs.map((c) => c.abs) });
}

function collectPm2(ctx, args) {
  const p = pickFile(ctx, args.pm2, /(?:^|\/)(?:ecosystem|pm2)[^/]*\.(?:config\.)?(?:[cm]?js|json|ya?ml)$/);
  if (!p) return { status: 'unavailable', reason: 'no PM2 ecosystem file found (pass --pm2 PATH)' };
  let t = ''; try { t = fs.readFileSync(p.abs, 'utf8'); } catch { return { status: 'unavailable', reason: 'cannot read ' + p.rel }; }
  const val = (k) => { const m = t.match(new RegExp('["\']?' + k + '["\']?\\s*:\\s*["\']?([\\w.\\-]+)["\']?')); return m ? m[1] : null; };
  const keys = ['instances', 'exec_mode', 'max_memory_restart', 'wait_ready', 'kill_timeout', 'listen_timeout', 'autorestart', 'max_restarts', 'min_uptime', 'restart_delay', 'exp_backoff_restart_delay'];
  return Object.assign({ status: 'ok', file: p.rel, trackedInRepo: ctx.files.includes(p.rel), apps: (t.match(/\bname\s*:/g) || []).length }, Object.fromEntries(keys.map((k) => [k, val(k)])));
}

function collectRatelimit(ctx, routes, nginx) {
  const libs = [];
  for (const p of ctx.files.filter((f) => /(^|\/)package\.json$/.test(f) && !SKIP_PATH.test(f))) {
    try {
      const j = JSON.parse(ctx.read(p));
      for (const d of Object.keys(Object.assign({}, j.dependencies, j.devDependencies))) if (/rate-?limit|slow-down|throttl/i.test(d)) libs.push(d);
    } catch { /* ignore */ }
  }
  const authRe = /login|signin|sign-in|register|signup|sign-up|reset|forgot|token|password|otp|verify/i;
  const nginxLoc = (nginx && nginx.locationsWithLimitReq) || [];
  const authRoutes = (routes.routes || []).filter((r) => authRe.test(r.path) && r.method !== 'GET').map((r) => {
    const line = ctx.lines(r.file)[r.line - 1] || '';
    const limiterOnRoute = /limit|throttle|slowDown/i.test(line);
    return { method: r.method, path: r.path, file: r.file, line: r.line, limiterOnRoute, nginxLocationLimit: nginxLoc.some((l) => r.path.startsWith(l.replace(/^[~*=\s^]+/, ''))) };
  });
  return {
    libraries: uniq(libs),
    appUsage: scanLines(ctx, ctx.appCode, /rateLimit\s*\(|new RateLimiter|rate-limiter-flexible|Throttle/i, 30),
    redisStore: anyText(ctx, ctx.appCode, /rate-limit-redis|RateLimiterRedis/),
    standardHeaders: anyText(ctx, ctx.appCode, /standardHeaders|legacyHeaders/),
    nginx: nginx && nginx.status === 'ok' ? { zones: nginx.limitReqZones, limitReq: nginx.limitReq, limitConn: nginx.limitConn, locations: nginxLoc } : { status: 'unavailable', reason: 'no nginx config' },
    authRoutes,
    authRoutesUncovered: authRoutes.filter((r) => !r.limiterOnRoute && !r.nginxLocationLimit).length,
  };
}

function collectDbLocal(ctx) {
  const ref = new Map();
  const stop = new Set(['the', 'a', 'an', 'which', 'any', 'all', 'this', 'that', 'it', 'one', 'each', 'your', 'our', 'each', 'both', 'database', 'db', 'state', 'roster', 'select', 'where', 'set', 'values', 'lateral', 'unnest', 'json_populate_recordset', 'generate_series', 'information_schema', 'pg_catalog', 'dual', 'only', 'table']);
  const pats = [
    /\bselect\b[\s\S]{0,400}?\bfrom\s+("?)([a-z_][\w.]*)\1/gi,
    /\binsert\s+into\s+("?)([a-z_][\w.]*)\1/gi,
    /\bupdate\s+("?)([a-z_][\w.]*)\1\s+set\b/gi,
    /\bdelete\s+from\s+("?)([a-z_][\w.]*)\1/gi,
    /\bjoin\s+("?)([a-z_][\w.]*)\1(?:\s+(?:as\s+)?\w+)?\s+on\b/gi,
  ];
  for (const f of ctx.appCode.filter((x) => !/(^|\/)migrations?\//i.test(x))) {
    const t = ctx.read(f).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
    for (const re of pats) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(t))) {
        let name = m[2].toLowerCase().replace(/^public\./, '');
        if (stop.has(name) || /^(pg_|information_schema)/.test(name) || name.includes('.')) continue;
        if (!ref.has(name)) ref.set(name, { name, file: f, line: lineOf(t, m.index) });
      }
    }
  }
  const migFiles = ctx.files.filter((f) => /\.sql$/i.test(f) || /(^|\/)(migrations?|db\/migrate)\/[^/]+\.[cm]?[jt]s$/i.test(f)).filter((f) => !SKIP_PATH.test(f));
  const migrated = new Set();
  for (const f of migFiles) {
    const t = ctx.read(f);
    for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][\w.]*)"?/gi)) migrated.add(m[1].toLowerCase().replace(/^public\./, ''));
    for (const m of t.matchAll(/(?:createTable|pgTable|define)\(\s*['"]([\w.]+)['"]/g)) migrated.add(m[1].toLowerCase());
  }
  const refList = [...ref.values()];
  const pool = [];
  for (const f of ctx.appCode) {
    const ls = ctx.lines(f);
    ls.forEach((line, i) => {
      if (!/new\s+(?:pg\.)?Pool\s*\(|pool\s*:\s*\{|connectionLimit/.test(line)) return;
      const win = ls.slice(i, i + 15).join('\n');
      const m = win.match(/\b(?:max|connectionLimit)\s*:\s*(\d+)/);
      pool.push({ file: f, line: i + 1, max: m ? Number(m[1]) : null });
    });
  }
  return {
    referencedTables: refList.slice(0, 300),
    migrationFiles: migFiles.sort(),
    migratedTables: [...migrated].sort(),
    missingInMigrations: migFiles.length ? refList.filter((r) => !migrated.has(r.name)).map((r) => r.name) : null,
    poolSettings: pool.slice(0, 20),
    timeoutSettings: scanLines(ctx, ctx.appCode, /statement_timeout|idle_in_transaction_session_timeout|connectionTimeoutMillis|query_timeout/, 20),
    transactionUsage: scanLines(ctx, ctx.appCode, /['"`]BEGIN['"`]|\.transaction\(|\.begin\(|START TRANSACTION/, 30),
    upsertUsage: scanLines(ctx, ctx.appCode, /ON CONFLICT|onConflict|\.upsert\(/i, 30),
    wholeCollectionReplace: scanLines(ctx, ctx.appCode, /DELETE\s+FROM\s+\w+\s*(?:;|`|'|")/i, 20),
  };
}

function collectHealth(ctx, routes, stagingHealth) {
  const re = /health|ready|readiness|live|liveness|ping|status/i;
  const endpoints = (routes.routes || []).filter((r) => r.method === 'GET' && re.test(r.path)).map((r) => ({ path: r.path, file: r.file, line: r.line, protectedBy: r.protectedBy }));
  const preferred = endpoints.find((e) => /^\/(?:api\/)?health(?:z)?$/.test(e.path)) || endpoints.find((e) => /health/.test(e.path)) || endpoints[0];
  return { endpoints, path: preferred ? preferred.path : '/health', pathSource: preferred ? 'code' : 'default', staging: stagingHealth || { status: 'skipped', reason: 'not opted in' } };
}

function collectObservability(ctx) {
  const deps = new Set();
  for (const p of ctx.files.filter((f) => /(^|\/)package\.json$/.test(f) && !SKIP_PATH.test(f))) {
    try { const j = JSON.parse(ctx.read(p)); Object.keys(Object.assign({}, j.dependencies, j.devDependencies)).forEach((d) => deps.add(d)); } catch { /* ignore */ }
  }
  const pick = (re) => [...deps].filter((d) => re.test(d));
  return {
    errorMonitoring: pick(/^@sentry\/|^@bugsnag|^rollbar|^newrelic|^dd-trace|^@datadog|^@opentelemetry\/sdk/),
    loggers: pick(/^(?:pino|pino-http|winston|bunyan|morgan|log4js)$/),
    metrics: pick(/^(?:prom-client|@opentelemetry\/api|express-prom-bundle)$/),
    correlationId: scanLines(ctx, ctx.appCode, /x-request-id|correlation[-_]?id|requestId|AsyncLocalStorage|pino-http|express-request-id/i, 20),
    logRotation: {
      files: ctx.files.filter((f) => /logrotate/i.test(f)),
      libraries: pick(/rotate/i).concat(anyText(ctx, ctx.files.filter((f) => /ecosystem|pm2/.test(f)), /pm2-logrotate/) ? ['pm2-logrotate (config text)'] : []),
    },
    consoleLogCalls: scanLines(ctx, ctx.appCode, /console\.log\(/, 50).length,
  };
}

function collectBackups(ctx) {
  const scriptFiles = ctx.scannable.filter((f) => /(backup|restore|pg_dump)/i.test(path.basename(f)) && /\.(sh|[cm]?js|ps1|ya?ml)$/.test(f));
  const tooling = ctx.scannable.filter((f) => /\.(sh|ya?ml|[cm]?js|ps1|conf|crontab)$/.test(f) || /crontab/.test(f))
    .filter((f) => /pg_dump|pg_basebackup|pgbackrest|wal-g|barman|pg_restore/.test(ctx.read(f)));
  const cron = scanLines(ctx, ctx.scannable, /^\s*(?:[\d*/,-]+\s+){4}[\d*/,-]+\s+.*(?:pg_dump|backup)/, 20);
  const restoreDocs = ctx.files.filter((f) => /\.md$/i.test(f) && !SKIP_PATH.test(f) && /restore/i.test(ctx.read(f))).slice(0, 20);
  return { scriptFiles, filesUsingBackupTools: uniq(tooling), cronEntries: cron, restoreDocs, offHostHints: anyText(ctx, scriptFiles.concat(tooling), /\bs3\b|rclone|gsutil|az storage|scp |rsync/i), encryptionHints: anyText(ctx, scriptFiles.concat(tooling), /gpg|age |openssl enc|--encrypt/i) };
}

function parseAudit(text) {
  try {
    const j = JSON.parse(text);
    const v = (j.metadata && j.metadata.vulnerabilities) || null;
    if (!v) return { status: 'unavailable', reason: 'audit JSON has no metadata.vulnerabilities' };
    return { status: 'ok', counts: { info: v.info || 0, low: v.low || 0, moderate: v.moderate || 0, high: v.high || 0, critical: v.critical || 0, total: v.total != null ? v.total : Object.values(v).reduce((a, b) => a + (+b || 0), 0) } };
  } catch { return { status: 'unavailable', reason: 'audit output is not valid JSON' }; }
}

// ---------------------------------------------------------------- opt-in sections

async function collectStaging(args, d, healthPath, secrets) {
  const base = new URL(args['staging-url']);
  const baseStr = base.origin;
  const requests = [];
  const keep = ['server', 'x-powered-by', 'content-type', 'location', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods', 'retry-after', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy', 'permissions-policy', 'cache-control'];
  const call = async (method, url, headers) => {
    const r = await d.httpRequest({ method, url, headers, timeoutMs: 8000 });
    const p = new URL(url);
    requests.push({ method, scheme: p.protocol.replace(':', ''), path: p.pathname, status: r.status != null ? r.status : null, error: r.error || null });
    const h = {};
    for (const k of keep) if (r.headers && r.headers[k] != null) h[k] = String(r.headers[k]).slice(0, 300);
    return Object.assign({}, r, { h });
  };
  const out = { status: 'ok', baseHost: base.hostname, healthPath };
  const health = await call('GET', baseStr + healthPath);
  out.health = { status: health.status != null ? health.status : null, timeMs: health.timeMs != null ? health.timeMs : null, error: health.error || null };
  out.securityHeaders = {
    hsts: health.h['strict-transport-security'] || null, xContentTypeOptions: health.h['x-content-type-options'] || null,
    xFrameOptions: health.h['x-frame-options'] || null, referrerPolicy: health.h['referrer-policy'] || null,
    contentSecurityPolicy: !!health.h['content-security-policy'], permissionsPolicy: !!health.h['permissions-policy'],
  };
  out.banners = ['server', 'x-powered-by'].filter((k) => health.h[k]).map((k) => ({ header: k, value: health.h[k] }));
  if (base.protocol === 'https:') {
    out.tls = await d.tlsInfo(base.hostname, Number(base.port) || 443);
    const redir = await call('GET', 'http://' + base.hostname + healthPath);
    out.httpRedirect = { status: redir.status != null ? redir.status : null, toHttps: /^https:\/\//i.test(redir.h.location || ''), error: redir.error || null };
  } else {
    out.tls = { status: 'unavailable', reason: 'staging URL is not https' };
    out.httpRedirect = { status: 'unavailable', reason: 'staging URL is not https' };
  }
  out.sensitivePaths = [];
  for (const p of SENSITIVE_PATHS) {
    const r = await call('GET', baseStr + p);
    const body = r.body || '';
    const ct = r.h['content-type'] || '';
    out.sensitivePaths.push({
      path: p, status: r.status != null ? r.status : null, error: r.error || null, contentType: ct.split(';')[0],
      looksLikeHtml: /text\/html/i.test(ct) || /^\s*</.test(body),
      looksLikeEnvFile: p === '/.env' ? /^[A-Z][A-Z0-9_]*=/m.test(body) : undefined,
      looksLikeGitHead: p === '/.git/HEAD' ? /^ref:\s/.test(body) : undefined,
    });
  }
  const nf = await call('GET', baseStr + UNKNOWN_API_PATH);
  let isJson = false; try { JSON.parse(nf.body || ''); isJson = true; } catch { /* not json */ }
  out.unknownApiRoute = { status: nf.status != null ? nf.status : null, contentType: (nf.h['content-type'] || '').split(';')[0], isJson, isHtml: /text\/html/i.test(nf.h['content-type'] || '') || /^\s*<(?:!doctype|html)/i.test(nf.body || '') };
  out.stackTraceLeak = /\n\s+at .*\(.*:\d+:\d+\)|node_modules\//.test(nf.body || '') || /\n\s+at .*\(.*:\d+:\d+\)/.test(health.body || '');
  const origin = 'https://evil.example';
  const pre = await call('OPTIONS', baseStr + healthPath, { Origin: origin, 'Access-Control-Request-Method': 'GET' });
  const acao = pre.h['access-control-allow-origin'] || null;
  out.corsPreflight = { status: pre.status != null ? pre.status : null, allowOrigin: acao, allowCredentials: pre.h['access-control-allow-credentials'] || null, reflectsOrigin: acao === origin || acao === '*' };
  out.safeRoutes = [];
  if (args['safe-routes']) {
    let list = [];
    try {
      list = fs.readFileSync(args['safe-routes'], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    } catch { out.safeRoutesError = 'cannot read --safe-routes file'; }
    for (const p of list) {
      if (!p.startsWith('/')) { out.safeRoutes.push({ path: p.slice(0, 80), skipped: 'must be a path starting with /' }); continue; }
      const r = await call('GET', baseStr + p);
      out.safeRoutes.push({ path: p, status: r.status != null ? r.status : null, timeMs: r.timeMs != null ? r.timeMs : null, error: r.error || null });
    }
  }
  out.requests = requests;
  return JSON.parse(redact(JSON.stringify(out), secrets));
}

async function collectRatelimitProbe(args, d, healthPath) {
  const url = new URL(args['staging-url']).origin + healthPath;
  const statuses = {};
  let sent = 0, got429 = false, got5xx = false, headersSeen = false, retryAfter = null, stoppedBy = null;
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) {
    if (i > 0) await d.sleep(10000 / 30);
    const r = await d.httpRequest({ method: 'GET', url, headers: {}, timeoutMs: 8000 });
    sent++;
    const s = r.status != null ? r.status : 'error';
    statuses[s] = (statuses[s] || 0) + 1;
    const h = r.headers || {};
    if (Object.keys(h).some((k) => /^ratelimit/i.test(k) || /^x-ratelimit/i.test(k)) ) headersSeen = true;
    if (h['retry-after'] != null) retryAfter = String(h['retry-after']).slice(0, 40);
    if (s === 429) { got429 = true; stoppedBy = '429'; break; }
    if (typeof s === 'number' && s >= 500) { got5xx = true; stoppedBy = '5xx'; break; }
    if (Date.now() - t0 > 10500) break;
  }
  return { status: 'ok', path: healthPath, requestsSent: sent, statusCounts: statuses, got429, got5xx, rateLimitHeadersSeen: headersSeen, retryAfter, stoppedBy };
}

function parseDbUrl(raw) {
  const u = new URL(raw);
  return { host: u.hostname, port: u.port || '5432', user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//, ''), sslmode: u.searchParams.get('sslmode') };
}

async function collectDbRemote(d, run, local, pm2, secrets, urlRaw) {
  let c;
  try { c = parseDbUrl(urlRaw); } catch { return { status: 'unavailable', reason: 'STAGING_DATABASE_URL is not a valid URL' }; }
  secrets.push(c.password, c.user && c.user.length > 3 ? c.user : '');
  const env = Object.assign({}, d.env);
  delete env.STAGING_DATABASE_URL; delete env.DATABASE_URL;
  Object.assign(env, {
    PGHOST: c.host, PGPORT: c.port, PGUSER: c.user, PGPASSWORD: c.password, PGDATABASE: c.database, PGCONNECT_TIMEOUT: '10',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000',
  });
  if (c.sslmode) env.PGSSLMODE = c.sslmode;
  const query = async (sql) => {
    const r = await run('psql', ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'BEGIN READ ONLY; ' + sql], { env, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    if (r.err) throw new Error(redact((r.stderr || r.err.message || 'psql failed').split('\n')[0], secrets));
    const txt = r.stdout.trim();
    return txt ? JSON.parse(txt) : null;
  };
  let guardRow;
  try { guardRow = await query(DB_QUERIES.guard); } catch (e) { return { status: 'unavailable', reason: 'role check failed: ' + e.message }; }
  const verdict = evaluateRolePrivileges(guardRow);
  if (!verdict.ok) return { status: 'refused', reason: 'role has write privileges: ' + verdict.reasons.join(', ') };
  try {
    const columns = await query(DB_QUERIES.columns);
    const noPk = await query(DB_QUERIES.noPk);
    const fk = await query(DB_QUERIES.fkNoIndex);
    const roleSettings = await query(DB_QUERIES.roleSettings);
    const mc = await query(DB_QUERIES.maxConnections);
    const tables = (columns || []).map((t) => t.table).sort();
    const refd = new Set(local.referencedTables.map((r) => r.name));
    const ignore = /^(schema_migrations|__drizzle_migrations|knex_migrations(_lock)?|pgmigrations|_prisma_migrations|migrations|sequelizemeta|spatial_ref_sys)$/i;
    const flat = (roleSettings || []).flat().filter(Boolean);
    return {
      status: 'ok', rolePrivileges: { ok: true, checked: ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'database CREATE', 'schema CREATE', 'table INSERT/UPDATE/DELETE/TRUNCATE', 'pg_write_server_files', 'pg_execute_server_program', 'pg_read_server_files'] },
      tables, tableCount: tables.length,
      missingInDb: [...refd].filter((t) => !tables.includes(t)).sort(),
      unreferencedInDb: tables.filter((t) => !refd.has(t) && !ignore.test(t)),
      columnsChecked: false, tablesWithoutPk: noPk || [], fkWithoutIndex: fk || [],
      roleSettings: flat.filter((s) => /timeout|statement|idle/.test(s)), maxConnections: mc ? Number(mc.max_connections) : null,
      poolBudget: { pm2Instances: pm2 && pm2.status === 'ok' ? pm2.instances : null, poolMax: local.poolSettings.map((p) => p.max) },
    };
  } catch (e) { return { status: 'unavailable', reason: 'schema query failed: ' + e.message }; }
}

// ---------------------------------------------------------------- main

function writeSecure(outFile, obj) {
  const dir = path.dirname(path.resolve(outFile));
  const existed = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!existed) { try { fs.chmodSync(dir, 0o700); } catch { /* best effort on non-POSIX */ } }
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(outFile, 0o600); } catch { /* best effort */ }
}

async function main(argv, deps) {
  const d = Object.assign({
    execFile: cp.execFile, httpRequest: defaultHttpRequest, tlsInfo: defaultTlsInfo,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), env: process.env,
    stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s),
  }, deps || {});
  let args;
  try { args = parseArgs(argv); } catch (e) { d.stderr('Error: ' + e.message + '\n'); return 1; }

  // Gate 1: nothing is touched until the opt-ins are consistent and confirmed.
  const requested = NEEDS_CONFIRM.filter((f) => args[f]);
  if (requested.length && !args['confirm-staging']) {
    d.stderr('Refused: ' + requested.map((f) => '--' + f).join(', ') + ' require --confirm-staging (confirms the target is staging, never production). Nothing was run.\n');
    return 1;
  }
  if ((args['probe-staging'] || args['probe-rate-limit']) && !args['staging-url']) { d.stderr('Refused: --probe-staging/--probe-rate-limit need --staging-url. Nothing was run.\n'); return 1; }
  let stagingHost = null;
  if (args['staging-url']) {
    try {
      const u = new URL(args['staging-url']);
      if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol');
      stagingHost = u.hostname;
    } catch { d.stderr('Refused: --staging-url is not a valid http(s) URL. Nothing was run.\n'); return 1; }
    const a = assessStagingHost(stagingHost, []);
    if (!a.ok && (args['probe-staging'] || args['probe-rate-limit'])) { d.stderr('Refused: staging host looks like production (' + a.reason + '). Nothing was run.\n'); return 1; }
  }
  if (args['check-db'] && d.env.STAGING_DATABASE_URL) {
    try {
      const h = new URL(d.env.STAGING_DATABASE_URL).hostname;
      if (/prod/i.test(h)) { d.stderr('Refused: STAGING_DATABASE_URL host looks like production. Nothing was run.\n'); return 1; }
    } catch { /* reported later as unavailable */ }
  }

  const repo = path.resolve(args.repo || '.');
  const secrets = [];
  const commandsRun = [];
  const run = (file, cmdArgs, opts) => new Promise((resolve) => {
    const rule = ALLOWED_COMMANDS[file];
    const ok = rule && (!rule.flag || args[rule.flag]) && (!rule.subcommands || rule.subcommands.includes(cmdArgs[0]));
    if (!ok) { resolve({ err: new Error('command not allowed: ' + file), stdout: '', stderr: '' }); return; }
    commandsRun.push({ command: file, subcommand: rule.subcommands ? cmdArgs[0] : null });
    d.execFile(file, cmdArgs, Object.assign({ cwd: repo, encoding: 'utf8' }, opts || {}), (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });

  let files;
  const ls = await run('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { maxBuffer: 64 * 1024 * 1024, timeout: 20000 });
  if (!ls.err && ls.stdout.trim()) files = ls.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter((f) => fs.existsSync(path.join(repo, f)));
  else files = walk(repo, '', []);
  files = files.filter((f) => !SKIP_PATH.test(f));
  const ctx = makeCtx(repo, files);

  const evidence = {};
  evidence.repo = collectRepo(ctx);
  evidence.sql = collectSql(ctx);
  const hist = await gitHistoryHits(run);
  evidence.secrets = collectSecrets(ctx, { historyHits: hist });
  evidence.routes = collectRoutes(ctx);
  evidence.security = collectSecurity(ctx);

  // deps
  if (args['audit-file']) {
    let t = null; try { t = fs.readFileSync(args['audit-file'], 'utf8'); } catch { /* handled below */ }
    evidence.deps = t == null ? { status: 'unavailable', reason: 'cannot read --audit-file' } : Object.assign({ source: 'audit-file' }, parseAudit(t));
  } else if (args['allow-npm-audit']) {
    const r = await run('npm', ['audit', '--json'], { shell: false, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    evidence.deps = (r.stdout.trim() || !r.err) ? Object.assign({ source: 'npm audit' }, parseAudit(r.stdout)) : { status: 'unavailable', reason: 'npm audit failed (registry unreachable?)' };
  } else evidence.deps = { status: 'skipped', reason: 'not opted in' };

  const nginx = collectNginx(ctx, args);
  const nginxPaths = nginx._paths || [];
  delete nginx._paths;
  const pm2 = collectPm2(ctx, args);
  evidence.nginx = nginx;
  evidence.pm2 = pm2;
  evidence.ratelimit = collectRatelimit(ctx, evidence.routes, nginx);
  const dbLocal = collectDbLocal(ctx);
  evidence.observability = collectObservability(ctx);
  evidence.backups = collectBackups(ctx);

  // Gate 2: staging hostname against the nginx production server_name list (before any network use).
  if (stagingHost && (args['probe-staging'] || args['probe-rate-limit'])) {
    const a = assessStagingHost(stagingHost, nginx.serverNames || []);
    if (!a.ok) { d.stderr('Refused: staging host looks like production (' + a.reason + '). Nothing was probed.\n'); return 1; }
  }

  const health = collectHealth(ctx, evidence.routes, null);
  const healthPath = args['health-path'] || health.path;

  if (args['run-nginx-test'] && nginx.status === 'ok' && nginxPaths.length) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngx-readiness-'));
    const r = await run('nginx', ['-t', '-c', nginxPaths[0], '-p', tmp, '-e', os.devNull], { timeout: 15000 });
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    const msg = redact((r.stderr || r.stdout || (r.err && r.err.message) || '').split('\n').slice(0, 4).join(' | '), secrets).replace(/\/[^\s|]*\//g, '<path>/');
    nginx.nginxTest = r.err && /ENOENT/.test(String(r.err.code || r.err.message)) ? { status: 'unavailable', reason: 'nginx binary not found' } : { status: r.err ? 'failed' : 'ok', summary: msg };
  } else if (args['run-nginx-test']) nginx.nginxTest = { status: 'unavailable', reason: 'no nginx config to test' };

  if (args['probe-staging']) {
    evidence.staging = await collectStaging(args, d, healthPath, secrets);
    health.staging = evidence.staging.health;
  } else evidence.staging = { status: 'skipped', reason: 'not opted in' };
  evidence.ratelimitProbe = args['probe-rate-limit'] ? await collectRatelimitProbe(args, d, healthPath) : { status: 'skipped', reason: 'not opted in' };
  evidence.health = health;

  let remote = { status: 'skipped', reason: 'not opted in' };
  if (args['check-db']) {
    remote = d.env.STAGING_DATABASE_URL ? await collectDbRemote(d, run, dbLocal, pm2, secrets, d.env.STAGING_DATABASE_URL) : { status: 'unavailable', reason: 'STAGING_DATABASE_URL is not set' };
  }
  const ok = remote.status === 'ok';
  evidence.db = Object.assign({ status: remote.status, reason: remote.reason || null, local: dbLocal, remote },
    { missingInMigrations: dbLocal.missingInMigrations, missingInDb: ok ? remote.missingInDb : null, unreferencedInDb: ok ? remote.unreferencedInDb : null, tablesWithoutPk: ok ? remote.tablesWithoutPk : null, fkWithoutIndex: ok ? remote.fkWithoutIndex : null });

  // coverage
  const state = (name, v, enableWith) => ({ section: name, status: v.status || 'ran', reason: v.reason || null, enableWith });
  const cov = [
    state('deps', evidence.deps, '--audit-file PATH or --allow-npm-audit'),
    state('staging', evidence.staging, '--probe-staging --staging-url URL --confirm-staging'),
    state('ratelimitProbe', evidence.ratelimitProbe, '--probe-rate-limit --staging-url URL --confirm-staging'),
    state('db.remote', remote, '--check-db --confirm-staging (with STAGING_DATABASE_URL, read-only role)'),
    state('nginx.nginxTest', nginx.nginxTest || { status: 'unavailable', reason: 'no nginx config' }, '--run-nginx-test'),
    state('nginx', nginx, '--nginx-conf PATH'),
    state('pm2', pm2, '--pm2 PATH'),
  ];
  const notRan = (c) => ['skipped', 'unavailable', 'refused', 'failed'].includes(c.status);
  evidence.coverage = {
    ran: ['repo', 'sql', 'secrets', 'routes', 'security', 'ratelimit', 'db.local', 'health', 'observability', 'backups'].concat(cov.filter((c) => !notRan(c)).map((c) => c.section)),
    skipped: cov.filter(notRan),
    safeMode: !OPT_IN_FLAGS.some((f) => args[f]),
  };
  evidence.meta = {
    version: VERSION, generatedAt: new Date().toISOString(), repo: path.basename(repo), filesScanned: ctx.scannable.length,
    flags: Object.fromEntries(BOOL_FLAGS.map((f) => [f, !!args[f]])), commandsRun,
    stagingHost: evidence.staging.status === 'ok' ? stagingHost : null,
    notes: ['No secret values, credentials or database row data are stored; secrets are reported as {file,line,type} only.'],
  };
  const ordered = {};
  for (const s of SECTIONS) ordered[s] = evidence[s];
  const out = args.out || 'evidence.json';
  writeSecure(out, JSON.parse(redact(JSON.stringify(ordered), secrets)));
  d.stdout('evidence written: ' + out + '\nmode: ' + (evidence.coverage.safeMode ? 'safe (local files only)' : 'opt-in sections enabled') + '\nskipped/unavailable: ' + (evidence.coverage.skipped.map((c) => c.section + ' (' + c.status + ')').join(', ') || 'none') + '\n');
  return 0;
}

module.exports = { main, parseArgs, evaluateRolePrivileges, assessStagingHost, redact, FIXED_PROBE_PATHS, OPT_IN_FLAGS, ALLOWED_COMMANDS, SECTIONS, DB_QUERIES };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write('Error: ' + redact(e && e.message) + '\n'); process.exit(1); });
}
