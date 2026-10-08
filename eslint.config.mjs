// Single lint configuration for the React client and the Node/Express server.
//
// Two tiers:
//  * STRICT files (draft/save/sync/API client and the queue/Redis modules) enforce every rule as an error.
//  * Everything else enforces the bug-class rules as errors (no-undef, rules-of-hooks, use-before-define, dupe-else-if ...)
//    while legacy style rules (unused vars, exhaustive-deps, ...) are warnings. CI runs with --max-warnings set to the
//    current count (a ratchet): the number may only go down, never up.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const STRICT_FILES = [
  'client/src/services/api.js',
  'client/src/services/draftSaver.js',
  'client/src/services/serverHealth.js',
  'client/src/services/draftErrorReporter.js',
  'client/src/services/db.js',
  'client/src/components/ServerHealthModal.jsx',
  'client/src/components/SaveStatusIndicator.jsx',
  'server/services/redisQueue.js',
  'server/services/cacheService.js',
  'server/utils/redisConfig.js',
  'server/controllers/schools/index.js',
  'server/middleware/auth.js',
  'server/utils/jwtSecret.js'
];

const bugClassRules = {
  'no-undef': 'error',
  'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
  'no-dupe-else-if': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-async-promise-executor': 'error',
  'require-atomic-updates': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }]
};

export default [
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**',
      'server/uploads/**', 'server/scratch/**', 'server/client/**', 'server/drizzle/**', 'server/db/*.bak*',
      'esf7_agents/**', 'Running/**', '.agents/**', '.claude/**', 'docs/**', '__pycache__/**',
      // one-off maintenance/debug scripts at the server root (not part of the running application)
      'server/*.js', '!server/server.js', '!server/queue_worker.js',
      'server/scripts/**', 'server/tests/*verifier.js', 'server/tests/test_*.js',
      '*.js', '*.cjs'
    ]
  },
  js.configs.recommended,

  // ---------- Client (React, browser) ----------
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...bugClassRules,
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-cond-assign': 'warn',
      'no-case-declarations': 'warn',
      'no-fallthrough': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'warn',
      'no-inner-declarations': 'warn'
    }
  },
  // Vite injects import.meta.env; Node test files run in Node.
  {
    files: ['client/tests/**/*.{js,mjs}', 'client/*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } }
  },

  // ---------- Server (Node, CommonJS) ----------
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      ...bugClassRules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-cond-assign': 'warn',
      'no-case-declarations': 'warn',
      'no-fallthrough': 'warn',
      'no-control-regex': 'warn',
      'no-inner-declarations': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  },
  // Tests, scripts and tooling are ES modules (the server package itself is CommonJS).
  {
    files: ['server/tests/unit/**/*.js', 'server/tests/integration/**/*.{js,mjs}', 'client/tests/**/*.{js,mjs}', 'e2e/**/*.mjs', 'scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
  },

  // ---------- LEGACY files with KNOWN latent bugs (found by the first lint run, 2026-10-08) ----------
  // These still reference undeclared variables / call hooks conditionally. Fixing them changes application behavior,
  // so they are tracked as warnings (counted by the --max-warnings ratchet) instead of blocking CI.
  // Remove a file from this list as soon as its errors are fixed. See README "Known latent bugs".
  {
    files: [
      'client/src/pages/OrganizedClasses.jsx',
      'client/src/pages/ValidationCenter.jsx',
      'client/src/pages/PersonnelProfile.jsx',
      'client/src/pages/RoomQR.jsx',
      'server/controllers/dashboard/index.js'
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'warn',
      'no-constant-condition': 'warn',
      'no-dupe-else-if': 'warn',
      'react-hooks/rules-of-hooks': 'warn'
    }
  },

  // ---------- STRICT tier: everything is an error, plus type-aware promise checks ----------
  { ...tseslint.configs.base, files: STRICT_FILES },
  {
    files: STRICT_FILES,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      'require-await': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'error',
      'no-unused-expressions': 'error'
    }
  }
];
