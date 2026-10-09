# Tool matrix

Existing tools always win. Never add a second tool to a layer.

## What each layer catches
- Types: undefined access, wrong arguments.
- Formatting: inconsistent style.
- Lint: suspicious patterns, unused variables.
- Tests: logic and regression bugs.
- Audit: known CVEs in dependencies.
- Knip: unused files, exports and dependencies.
- Hooks: forgotten checks before commit.

## Type checking
| Pick this when | Tool / script |
|---|---|
| TS repo (`tsconfig.json` or `typescript` dep) | `"type-check": "tsc --noEmit"` |
| JS repo | Skip the layer; offer `checkJs` only if the user asks |

## Formatting
| Pick this when | Tool / script |
|---|---|
| Biome is the linter | Keep Biome: `format` = `biome format --write .`, `format:check` = `biome format .` |
| Otherwise | Prettier: `format` = `prettier --write .`, `format:check` = `prettier --check .`; add `.prettierignore` (dist, build, .next, coverage, lockfiles) |

## Linting
| Pick this when | Tool |
|---|---|
| ESLint or Biome exists | Keep it. Never add a second linter |
| None exists | Ask the user before adding one |

## Unit tests
| Pick this when | Tool / script |
|---|---|
| A runner exists | Keep it; only add the missing `test` script |
| New setup, Vite or ESM/TS project | Vitest: `test` = `vitest run`, `test:coverage` = `vitest run --coverage` |
| New setup, otherwise | Jest |

## E2E
| Pick this when | Tool |
|---|---|
| Default | Playwright |
| Cypress already present | Cypress |

Suggest only; install only if the user asks. `validate` never runs e2e.

## Dependency audit
| Pick this when | Tool / script |
|---|---|
| Default | `"audit": "npm audit"` (or `pnpm audit` / `yarn npm audit`), non-blocking |
| User asks | Snyk |

## Dead code
| Pick this when | Tool / script |
|---|---|
| Default | Knip: `"knip": "knip"`, non-blocking |
| Knip unsuitable | depcheck |

## Git hooks
| Pick this when | Setup |
|---|---|
| Repo has `.git` | Husky + lint-staged, `"prepare": "husky"`, `.husky/pre-commit` running `npx lint-staged` (or the pnpm/yarn equivalent) |

Sample `.lintstagedrc.json`:
```json
{
  "*.{js,jsx,ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,css,md}": ["prettier --write"]
}
```
Adapt to Biome (`biome check --write`) when Biome is the tool. Cover only extensions the repo has.

## Master script
`"validate": "npm run format:check && npm run lint && npm run type-check && npm run test"`

Adapt to scripts that actually exist, in this order: format:check, lint, type-check, test. Never include `audit` or `knip`.
