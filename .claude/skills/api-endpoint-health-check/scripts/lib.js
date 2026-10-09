'use strict';
// Shared helpers for the api-endpoint-health-check scripts. Node built-ins only. Nothing project-specific lives here:
// every project value comes from the config file.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

/** Finds the project root: --root, else the nearest ancestor of the cwd containing .git, else the cwd. */
function findRoot(args) {
  if (args.root) return path.resolve(args.root);
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
}

/** Reads only the requested keys from a .env file (never exposes the rest). */
function readEnvKeys(file, keys) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && (!keys || keys.includes(m[1]))) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (e) { /* missing file: caller decides */ }
  return out;
}

function loadConfig(args, root) {
  const explicit = args.config ? path.resolve(args.config) : null;
  const candidates = [explicit, path.join(root, 'endpoint-health.config.json'), path.join(SKILL_DIR, 'endpoint-health.config.json'), path.join(SKILL_DIR, 'endpoint-health.config.example.json')].filter(Boolean);
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error('No config found. Copy endpoint-health.config.example.json to endpoint-health.config.json.');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.__file = file;
  return cfg;
}

function outDir(cfg, args) {
  const d = args.out ? path.resolve(args.out) : (cfg.outDir ? path.resolve(cfg.outDir) : path.join(os.tmpdir(), 'api-endpoint-health-check'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** "$NAME" -> value of env var NAME (or the .env file values passed in `extra`); non-strings pass through. */
function interpolate(v, extra = {}) {
  if (typeof v === 'string' && /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v)) {
    const k = v.slice(1);
    return process.env[k] !== undefined ? process.env[k] : extra[k];
  }
  if (Array.isArray(v)) return v.map((x) => interpolate(x, extra));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, interpolate(x, extra)]));
  return v;
}

function assertLoopbackUrl(url, cfg) {
  let u;
  try { u = new URL(url); } catch (e) { throw new Error(`SAFETY: base URL "${url}" is not a valid URL.`); }
  const host = u.hostname.toLowerCase();
  const narrowed = cfg.allowedHosts ? cfg.allowedHosts.map((h) => h.toLowerCase()) : null;
  if (!LOOPBACK.has(host) || (narrowed && !narrowed.includes(host))) {
    throw new Error(`SAFETY: refusing to run. Base URL host "${u.hostname}" is not an allowed loopback host.`);
  }
  return u;
}

function assertAllowedDb(name, cfg) {
  const allow = (cfg.database && cfg.database.allowedNames) || [];
  if (!name) throw new Error('SAFETY: database name could not be determined; refusing to run database checks.');
  if (!allow.includes(name)) throw new Error(`SAFETY: refusing to run. Database "${name}" is not on the allowlist [${allow.join(', ')}].`);
}

function assertLoopbackHost(host) {
  if (!LOOPBACK.has(String(host || 'localhost').toLowerCase())) throw new Error(`SAFETY: DB host "${host}" is not loopback.`);
}

const SELECT_ONLY = /^\s*(select|with|show|explain)\b/i;
function assertSelectOnly(sql) {
  const stripped = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const stmt of stripped.split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!SELECT_ONLY.test(stmt) || /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy)\b/i.test(stmt.replace(/'[^']*'/g, "''"))) {
      throw new Error(`SAFETY: only SELECT statements are allowed. Refused: ${stmt.slice(0, 60)}`);
    }
  }
}

function normPath(...parts) {
  const p = ('/' + parts.filter(Boolean).join('/')).replace(/\/{2,}/g, '/');
  return p.length > 1 ? p.replace(/\/$/, '') : p;
}

const mask = (s, secrets = []) => {
  let t = String(s);
  for (const x of secrets) if (x && String(x).length >= 4) t = t.split(String(x)).join('***');
  return t
    .replace(/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, '[JWT]')
    .replace(/("(?:password|passcode|pin|token|secret|authorization|api[_-]?key|jwt)[^"]*"\s*:\s*)"[^"]*"/gi, '$1"***"');
};

module.exports = { fs, path, os, SKILL_DIR, LOOPBACK, parseArgs, findRoot, readEnvKeys, loadConfig, outDir, interpolate, assertLoopbackUrl, assertAllowedDb, assertLoopbackHost, assertSelectOnly, normPath, mask };

// Safety refusals and config errors should read as one line, not a stack trace.
process.on('uncaughtException', (e) => { console.error(e && e.message ? e.message : String(e)); process.exit(1); });
