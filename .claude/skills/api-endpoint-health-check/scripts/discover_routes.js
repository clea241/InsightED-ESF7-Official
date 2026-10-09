#!/usr/bin/env node
'use strict';
// Static Express route discovery -> endpoints.manifest.json (read-only; reads source files only).
// Usage: node discover_routes.js [--root <dir>] [--config <file>] [--out <dir>]
const { fs, path, parseArgs, findRoot, loadConfig, outDir, normPath } = require('./lib');
const js = require('./jsscan');

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'head', 'options'];
const args = parseArgs();
const root = findRoot(args);
const cfg = loadConfig(args, root);
const entry = path.resolve(root, cfg.entryFile);
const authCfg = cfg.auth || {};
const authRe = authCfg.middlewareNames && authCfg.middlewareNames.length ? new RegExp(`\\b(${authCfg.middlewareNames.join('|')})\\b`) : null;
const gateRe = authCfg.gateNames && authCfg.gateNames.length ? new RegExp(`\\b(${authCfg.gateNames.join('|')})\\b`) : null;
const publicPrefixes = authCfg.publicPrefixes || [];
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

const endpoints = [];
const notes = [];       // things the scan could not resolve (dynamic paths, unresolved mounts)
const mountLog = [];
let gate = null;        // {mount, line} of the global auth gate in the entry file

const routerVars = (src) => {
  const set = new Set();
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\.)?Router\s*\(/g;
  let m;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
};

function chainNames(argTexts) {
  return argTexts.map((t) => t.replace(/^require([^)]*)./, '')).map((t) => (/^[A-Za-z_$][\w$.]*(\([^)]*\))?$/.test(t) ? t.replace(/\(.*$/, '') : (/=>|function/.test(t) ? 'inline' : t.slice(0, 40))));
}

function pathArg(text) {
  const lit = js.stringLiteral(text);
  if (lit !== null) return [lit];
  const arr = text.match(/^\[([\s\S]*)\]$/);
  if (arr) { const parts = arr[1].split(',').map((x) => js.stringLiteral(x.trim())); if (parts.every((p) => p !== null)) return parts; }
  return null;
}

/** Scan one file (entry or router) for routes and mounts. `prefix` is the full mount path; `inherited` the middleware that applies. */
function scanFile(file, prefix, inherited, seen, isEntry) {
  const src = js.readFile(file);
  if (src == null) { notes.push({ file: rel(file), reason: 'file not readable' }); return; }
  if (seen.includes(file)) { notes.push({ file: rel(file), reason: 'router mounted recursively; stopped' }); return; }
  const chainSeen = [...seen, file];
  const rvars = routerVars(src);
  const receivers = new Set([...rvars, 'app']);
  const imports = js.importsOf(file);
  const localMw = []; // router-level middleware in source order: {idx, names}

  // Collect events in source order: .use() and METHOD() and .route()
  const events = [];
  const reCall = /\b([A-Za-z_$][\w$]*)\.(use|route|get|post|put|patch|delete|all|head|options)\s*\(/g;
  let m;
  while ((m = reCall.exec(src))) {
    if (!receivers.has(m[1])) continue;
    const open = m.index + m[0].length - 1;
    const parsed = js.splitArgs(src, open);
    if (!parsed) continue;
    events.push({ recv: m[1], kind: m[2], idx: m.index, open, ...parsed });
  }

  for (const ev of events) {
    const line = js.lineOf(src, ev.idx);
    const argTexts = ev.args.map((a) => a.text);
    if (ev.kind === 'use') {
      const paths = pathArg(argTexts[0] || '');
      const rest = paths ? argTexts.slice(1) : argTexts;
      const mwNames = chainNames(rest);
      // find a router target among the args: require('./x') (no property access), or an identifier bound to a relative module
      let target = null;
      for (const t of rest) {
        const rq = t.match(/^require\(\s*['"]([^'"]+)['"]\s*\)(\.[\w$]+)?$/);
        if (rq && !rq[2]) { target = { spec: rq[1], file: js.resolveRequire(file, rq[1]) }; break; }
        const id = t.match(/^[A-Za-z_$][\w$]*$/);
        if (id && imports.has(t) && !imports.get(t).exportName) { target = { spec: imports.get(t).spec, file: imports.get(t).file }; break; }
      }
      if (!paths && !target) {
        localMw.push({ idx: ev.idx, names: mwNames, line });
        continue;
      }
      if (target) {
        if (!target.file) { notes.push({ file: rel(file), line, reason: `router "${target.spec}" mounted at ${paths ? paths[0] : '/'} could not be resolved` }); continue; }
        for (const p of (paths || ['/'])) {
          const full = normPath(prefix, p);
          mountLog.push({ mount: full, router: rel(target.file), declaredIn: `${rel(file)}:${line}` });
          scanFile(target.file, full, [...inherited, ...(isEntry ? [] : localMw.map((x) => ({ names: x.names, scope: prefix }))), ...scopedFromEntry(file, ev.idx, full, isEntry)], chainSeen, false);
        }
      } else if (paths && isEntry) {
        // path-scoped middleware at the entry (e.g. the auth gate)
        for (const p of paths) {
          entryMw.push({ path: normPath(p), names: mwNames, idx: ev.idx, line });
          if (gateRe && mwNames.some((n) => gateRe.test(n)) && !gate) gate = { mount: normPath(p), line, idx: ev.idx };
        }
      } else if (paths) {
        localMw.push({ idx: ev.idx, names: mwNames, line, path: paths[0] });
      }
      continue;
    }
    if (ev.kind === 'route') {
      const paths = pathArg(argTexts[0] || '');
      if (!paths) { notes.push({ file: rel(file), line, reason: 'router.route() path is not a string literal' }); continue; }
      let pos = ev.close + 1;
      for (;;) {
        const mm = src.slice(pos).match(/^\s*\.\s*(get|post|put|patch|delete|all|head|options)\s*\(/);
        if (!mm) break;
        const open = pos + mm[0].length - 1;
        const parsed = js.splitArgs(src, open);
        if (!parsed) break;
        for (const p of paths) record(file, src, prefix, inherited, localMw, mm[1], p, parsed.args.map((a) => a.text), js.lineOf(src, open), imports, ev.idx, isEntry);
        pos = parsed.close + 1;
      }
      continue;
    }
    // METHOD(path, ...handlers)
    const paths = pathArg(argTexts[0] || '');
    if (!paths) { notes.push({ file: rel(file), line, reason: `${ev.recv}.${ev.kind}() path is not a string literal (dynamic or regex)` }); continue; }
    for (const p of paths) record(file, src, prefix, inherited, localMw, ev.kind, p, argTexts.slice(1), line, imports, ev.idx, isEntry);
  }
}

const entryMw = [];
function scopedFromEntry(file, idx, fullMount, isEntry) {
  if (!isEntry) return [];
  return entryMw.filter((e) => e.idx < idx && (fullMount === e.path || fullMount.startsWith(e.path === '/' ? '/' : e.path + '/'))).map((e) => ({ names: e.names, scope: e.path }));
}

function record(file, src, prefix, inherited, localMw, method, routePath, handlerArgs, line, imports, idx, isEntry) {
  const full = normPath(prefix, routePath);
  const mw = [...inherited.flatMap((x) => x.names), ...localMw.filter((x) => x.idx < idx).flatMap((x) => x.names), ...chainNames(handlerArgs.slice(0, -1))];
  const handlerText = handlerArgs[handlerArgs.length - 1] || '';
  let handler = { name: 'inline', file: rel(file), line };
  const id = handlerText.match(/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$/);
  if (id) {
    const [base, member] = handlerText.split('.');
    const fn = js.functionsOf(file).get(base);
    if (!member && fn) handler = { name: base, file: rel(file), line: fn.line };
    else if (imports.has(base) && imports.get(base).file) {
      const imp = imports.get(base);
      const target = member || imp.exportName || base;
      const f2 = js.functionsOf(imp.file).get(target);
      handler = { name: handlerText, file: rel(imp.file), line: f2 ? f2.line : 1, unresolved: !f2 };
    } else handler = { name: handlerText, file: rel(file), line, unresolved: true };
  }
  const params = [...full.matchAll(/:([A-Za-z_]\w*)/g)].map((x) => x[1]);
  // auth decision from the middleware chain and the global gate; the evidence is recorded
  let auth = 'unknown';
  let authEvidence = 'no auth middleware found in the chain';
  const isPublic = publicPrefixes.some((p) => full === p || full.startsWith(p + '/'));
  if (authRe && mw.some((n) => authRe.test(n))) { auth = 'yes'; authEvidence = `route/router middleware matches ${authCfg.middlewareNames.join('|')}`; }
  else if (gate && full.startsWith(gate.mount === '/' ? '/' : gate.mount + '/') || (gate && full === gate.mount)) {
    if (isPublic) { auth = 'no'; authEvidence = `under gate ${gate.mount} but listed in auth.publicPrefixes`; }
    else if (isEntry && idx < gate.idx) { auth = 'no'; authEvidence = `registered in the entry file before the auth gate (line ${gate.line})`; }
    else { auth = 'yes'; authEvidence = `global gate mounted at ${gate.mount} (entry line ${gate.line}); path not public`; }
  } else if (gate) { auth = 'no'; authEvidence = `outside the gated mount ${gate.mount}`; }
  endpoints.push({
    id: `${method.toUpperCase()} ${full}`,
    method: method.toUpperCase(), path: full, pathParams: params,
    auth, authEvidence,
    effect: ['get', 'head', 'options'].includes(method) ? 'read' : 'write',
    handler, source: 'code', middleware: mw.filter((n) => n !== 'inline'),
    routeDeclaredAt: `${rel(file)}:${line}`,
    tablesRead: null, tablesWritten: null, tableMappingConfidence: 'unresolved', tableMappingNotes: ['map_tables.js has not run']
  });
}

// ---------------------------------------------------------------- run
scanFile(entry, '/', [], [], true); // pass 1 only establishes where the auth gate sits (routes before it are public)
endpoints.length = 0; notes.length = 0; mountLog.length = 0; entryMw.length = 0; // `gate` is kept from pass 1
scanFile(entry, '/', [], [], true);

// Cross-check 1: gate public prefixes declared in code vs. config
let gatePublicCheck = null;
if (authCfg.gateFile) {
  const g = js.readFile(path.resolve(root, authCfg.gateFile)) || '';
  const arr = g.match(/PUBLIC_PREFIXES\s*=\s*\[([^\]]*)\]/);
  if (arr && gate) {
    const inCode = arr[1].split(',').map((x) => js.stringLiteral(x.trim())).filter(Boolean).map((p) => normPath(gate.mount, p)).sort();
    const inCfg = [...publicPrefixes].sort();
    gatePublicCheck = { inCode, inConfig: inCfg, match: JSON.stringify(inCode) === JSON.stringify(inCfg) };
  }
}

// Cross-check 2: independent count by a simpler method (every router.METHOD( / app.METHOD( call in files reached by the scan)
const scannedFiles = new Set([rel(entry), ...mountLog.map((m) => m.router)]);
let independentCalls = 0;
const perFile = {};
for (const f of scannedFiles) {
  const src = js.readFile(path.resolve(root, f)) || '';
  const n = (src.match(new RegExp(`\\b(router|app)\\.(${METHODS.join('|')})\\s*\\(\\s*['"\`\\[]`, 'g')) || []).length + (src.match(/\.route\s*\(/g) || []).length * 0;
  perFile[f] = n;
  independentCalls += n;
}
// each router file may be mounted several times, so compare per-file declarations with distinct declarations seen
const declared = new Set(endpoints.map((e) => e.routeDeclaredAt));
const countCheck = { distinctDeclarationsInManifest: declared.size, independentGrepDeclarations: independentCalls, perFile,
  differences: Object.entries(perFile).filter(([f, n]) => n !== new Set(endpoints.filter((e) => e.routeDeclaredAt.startsWith(f + ':')).map((e) => e.routeDeclaredAt)).size).map(([f, n]) => ({ file: f, grepCount: n, manifestDistinct: new Set(endpoints.filter((e) => e.routeDeclaredAt.startsWith(f + ':')).map((e) => e.routeDeclaredAt)).size })) };

// Cross-check 3: OpenAPI / Postman files if present
const spec = { found: [], onlyInCode: [], onlyInSpec: [], note: null };
const walk = (dir, depth = 0) => {
  if (depth > 3) return [];
  let out = [];
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const it of items) {
    if (['node_modules', '.git', 'coverage', 'dist', 'build'].includes(it.name)) continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) out = out.concat(walk(p, depth + 1));
    else if (/(openapi|swagger).*\.(json|ya?ml)$|\.postman_collection\.json$/i.test(it.name)) out.push(p);
  }
  return out;
};
const specFiles = walk(root);
const specRoutes = new Set();
for (const f of specFiles) {
  spec.found.push(rel(f));
  if (/\.ya?ml$/i.test(f)) { spec.note = (spec.note || '') + `${rel(f)}: YAML not parsed (no dependencies); compare manually. `; continue; }
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.paths) for (const [p, ops] of Object.entries(j.paths)) for (const mth of Object.keys(ops)) if (METHODS.includes(mth)) specRoutes.add(`${mth.toUpperCase()} ${normPath(p.replace(/\{(\w+)\}/g, ':$1'))}`);
    const walkItems = (items) => (items || []).forEach((it) => { if (it.item) walkItems(it.item); else if (it.request) { const u = typeof it.request.url === 'string' ? it.request.url : (it.request.url && it.request.url.path || []).join('/'); specRoutes.add(`${it.request.method} ${normPath(String(u).replace(/^https?:\/\/[^/]+/, '').replace(/\{\{[^}]+\}\}/g, ''))}`); } });
    walkItems(j.item);
  } catch (e) { spec.note = (spec.note || '') + `${rel(f)}: unreadable (${e.message}). `; }
}
if (spec.found.length) {
  const codeIds = new Set(endpoints.map((e) => e.id.replace(/:[A-Za-z_]\w*/g, ':p')));
  const specIds = new Set([...specRoutes].map((x) => x.replace(/:[A-Za-z_]\w*/g, ':p')));
  spec.onlyInCode = [...codeIds].filter((x) => !specIds.has(x));
  spec.onlyInSpec = [...specIds].filter((x) => !codeIds.has(x));
} else spec.note = 'No OpenAPI/Swagger/Postman file found; code is the only source.';

const duplicates = Object.entries(endpoints.reduce((a, e) => { a[e.id] = (a[e.id] || 0) + 1; return a; }, {})).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));

const manifest = {
  meta: { generatedAt: new Date().toISOString(), project: cfg.project || null, root: root.replace(/\\/g, '/'), entryFile: cfg.entryFile, configFile: path.basename(cfg.__file),
    endpointCount: endpoints.length, gate, gatePublicCheck, mounts: mountLog, unresolvedRoutes: notes, countCheck, spec, duplicateIds: duplicates },
  endpoints
};
const dir = outDir(cfg, args);
const file = path.join(dir, 'endpoints.manifest.json');
fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
console.log(`Discovered ${endpoints.length} endpoints across ${mountLog.length} mounts (${scannedFiles.size} files).`);
console.log(`Auth: ${endpoints.filter((e) => e.auth === 'yes').length} protected, ${endpoints.filter((e) => e.auth === 'no').length} public, ${endpoints.filter((e) => e.auth === 'unknown').length} unknown.`);
console.log(`Unresolved routes/mounts: ${notes.length}. Independent grep declarations: ${independentCalls}; manifest distinct declarations: ${declared.size}.`);
if (countCheck.differences.length) console.log(`Count differences: ${JSON.stringify(countCheck.differences)}`);
console.log(`Manifest: ${file}`);
