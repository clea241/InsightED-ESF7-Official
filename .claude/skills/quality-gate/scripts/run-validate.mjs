#!/usr/bin/env node
// Runs every available quality check and prints a uniform JSON summary. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let only = null;
let rootArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only = args[++i];
  else rootArg = args[i];
}
const root = path.resolve(rootArg || process.cwd());
let pkg;
try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); }
catch { process.stdout.write(JSON.stringify({ root, packageManager: null, ok: false, error: 'package.json missing or invalid', checks: [] }, null, 2) + '\n'); process.exit(1); }
const scripts = pkg.scripts || {};
const pm = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm';
const win = process.platform === 'win32';

const PLAN = [
  { name: 'format:check', blocking: true }, { name: 'lint', blocking: true },
  { name: 'type-check', blocking: true, alt: 'typecheck' }, { name: 'test', blocking: true },
  { name: 'audit', blocking: false }, { name: 'knip', blocking: false },
];
const checks = [];
for (const c of PLAN) {
  if (only && only !== c.name) continue;
  const script = scripts[c.name] ? c.name : c.alt && scripts[c.alt] ? c.alt : null;
  if (!script) { checks.push({ name: c.name, status: 'skipped', blocking: c.blocking, durationMs: 0, outputHead: ['no "' + c.name + '" script in package.json'] }); continue; }
  const t0 = Date.now();
  const r = spawnSync(pm, ['run', script], { cwd: root, encoding: 'utf8', shell: win, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' } });
  const ok = r.status === 0;
  const text = ((r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error.message) : '')).split(/\r?\n/);
  checks.push({ name: c.name, status: ok ? 'pass' : 'fail', blocking: c.blocking, durationMs: Date.now() - t0, outputHead: ok ? [] : text.slice(0, 40) });
}
if (!only) checks.push(scripts['test:e2e']
  ? { name: 'test:e2e', status: 'skipped', blocking: false, durationMs: 0, outputHead: ['never run automatically (slow, needs browsers)'] }
  : { name: 'test:e2e', status: 'skipped', blocking: false, durationMs: 0, outputHead: ['no "test:e2e" script in package.json'] });
const ok = checks.every((c) => !c.blocking || c.status !== 'fail');
process.stdout.write(JSON.stringify({ root, packageManager: pm, ok, error: null, checks }, null, 2) + '\n');
process.exit(ok ? 0 : 1);
