#!/usr/bin/env node
// Read-only stack detector for the quality-gate skill. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const has = (f) => fs.existsSync(path.join(root, f));
const hasAny = (list) => list.some(has);
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + '\n'); process.exit(code); };

let pkg;
try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); }
catch (e) {
  out({ root, error: 'package.json missing or invalid: ' + e.message, packageManager: null, language: null, isGitRepo: has('.git'), frameworks: [], tools: {}, scripts: {}, missingLayers: [] }, 1);
}

const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const d = (...names) => names.filter((n) => n in deps);
const scripts = pkg.scripts || {};

const packageManager = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm';
const language = has('tsconfig.json') || 'typescript' in deps ? 'typescript' : 'javascript';
const configRe = (re) => { try { return fs.readdirSync(root).some((f) => re.test(f)); } catch { return false; } };

const tools = {
  eslint: d('eslint').length > 0 || configRe(/^(\.eslintrc(\..+)?|eslint\.config\.[cm]?[jt]s)$/),
  biome: d('@biomejs/biome').length > 0 || hasAny(['biome.json', 'biome.jsonc']),
  prettier: d('prettier').length > 0 || configRe(/^(\.prettierrc(\..+)?|prettier\.config\.[cm]?[jt]s)$/),
  vitest: d('vitest').length > 0,
  jest: d('jest').length > 0 || configRe(/^jest\.config\./),
  playwright: d('@playwright/test', 'playwright').length > 0 || configRe(/^playwright\.config\./),
  cypress: d('cypress').length > 0 || configRe(/^cypress\.config\./),
  knip: d('knip').length > 0 || hasAny(['knip.json', 'knip.jsonc', '.knip.json']),
  depcheck: d('depcheck').length > 0,
  husky: d('husky').length > 0 || has('.husky'),
  lintStaged: d('lint-staged').length > 0 || hasAny(['.lintstagedrc', '.lintstagedrc.json', 'lint-staged.config.js']) || 'lint-staged' in pkg,
};

const frameworks = [];
if ('react' in deps) frameworks.push('react');
if ('next' in deps) frameworks.push('nextjs');
if ('vue' in deps) frameworks.push('vue');
if ('svelte' in deps) frameworks.push('svelte');
if (d('express', 'fastify', 'koa', '@nestjs/core', 'hono').length) frameworks.push('node-api');
if ('vite' in deps) frameworks.push('vite');
if (!frameworks.length && (pkg.main || pkg.exports || pkg.module) && !pkg.private) frameworks.push('library');

const sc = (...names) => names.find((n) => scripts[n]) || null;
const missing = [];
if (language === 'typescript' && !sc('type-check', 'typecheck')) missing.push('type-check');
if (!sc('format:check') && !(tools.biome && sc('format'))) missing.push('format');
if (!sc('lint') && !tools.eslint && !tools.biome) missing.push('lint');
if (!tools.vitest && !tools.jest) missing.push('unit-tests');
if (!sc('test')) missing.push('test-script');
if (!tools.playwright && !tools.cypress && !sc('test:e2e')) missing.push('e2e-tests');
if (!sc('audit')) missing.push('audit');
if (!sc('knip') && !tools.knip && !tools.depcheck) missing.push('dead-code');
if (!(tools.husky && tools.lintStaged && sc('prepare'))) missing.push('git-hooks');
if (!sc('validate')) missing.push('validate');

out({
  root, error: null, packageManager, language, isGitRepo: has('.git'), frameworks, tools,
  scripts: {
    typeCheck: sc('type-check', 'typecheck'), format: sc('format'), formatCheck: sc('format:check'), lint: sc('lint'),
    test: sc('test'), testCoverage: sc('test:coverage'), testE2e: sc('test:e2e'), audit: sc('audit'), knip: sc('knip'),
    prepare: sc('prepare'), validate: sc('validate'),
  },
  missingLayers: missing,
});
