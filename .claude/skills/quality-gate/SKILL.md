---
name: quality-gate
description: "Sets up and runs a layered code-quality pipeline in a JavaScript or TypeScript repo: type-check, format check, unit and e2e tests, dependency audit, dead-code detection (knip), Husky + lint-staged pre-commit hooks, and a single `npm run validate` script, then runs it and fixes failures. Use when the user says 'set up code quality checks', 'add a validate script', 'add pre-commit hooks', 'what should I add besides lint', 'run the full quality pipeline', or 'fix the validate failures'. Do not use for non-JS/TS repos, deployment pipelines, or writing new feature tests from scratch."
---

# Quality gate

Different checks catch different bug classes: types find wrong calls, formatting keeps diffs clean, tests catch regressions, audit finds known CVEs, knip finds dead code, hooks stop forgotten checks. Lint alone is only the first layer. This skill detects what a JS/TS repo has, adds the missing layers, wires one `validate` script, runs everything and fixes failures.

## Workflow

1. **Detect.** Run `node .claude/skills/quality-gate/scripts/detect-stack.mjs` directly (do not write new detection code). It prints JSON: package manager, language, tools, scripts, frameworks, git status and `missingLayers`.
2. **Choose tools.** Read `reference/tool-matrix.md` and pick, per missing layer, the tool that fits the stack. Prefer what is already installed or configured. Never replace a working existing tool.
3. **Show the plan.** Before installing anything, print a short plan: layers to add, tools chosen and why, scripts to add, files to create. Wait for user confirmation if the plan adds more than three dev dependencies or touches existing config.
4. **Install and wire.** Install missing dev dependencies with the detected package manager. Add only the missing scripts to `package.json` (`type-check`, `format`, `format:check`, `test`, `test:coverage`, `knip`, `audit`, `validate`). Create tool config only where none exists.
5. **Hooks.** If the repo is a git repo, set up Husky + lint-staged with a `.lintstagedrc.json` covering the repo's source extensions (format then lint with `--fix`), and a `prepare` script so hooks activate. Skip hooks if there is no `.git` directory and say so.
6. **Master script.** Build `validate` from only the scripts that exist, in this order: format:check, lint, type-check, test. `audit` and `knip` stay separate (they can fail for reasons unrelated to the change) and are run by step 7 as non-blocking checks.
7. **Run.** Run `node .claude/skills/quality-gate/scripts/run-validate.mjs` directly. It runs each check, captures output and prints a JSON summary (name, status, blocking, durationMs, first 40 lines of failure output). `--only <check>` runs one check.
8. **Fix loop.** For each failure: apply auto-fixes first (`format`, `eslint --fix`), then fix remaining issues by hand, then re-run `run-validate.mjs`. Stop after 3 full passes and report anything still failing.

Read `reference/tool-matrix.md` in step 2 or whenever a layer's tool is unclear. Read `rules.md` before changing any file; its constraints are hard rules.

## Acceptance criteria

- `package.json` contains a `validate` script that chains only scripts that exist.
- `node .claude/skills/quality-gate/scripts/run-validate.mjs` exits 0, or every remaining failure is listed in the report with its cause.
- No existing tool or config was replaced without explicit user approval.
- Git hook fires: `git commit` on a deliberately badly formatted staged file is blocked (test on a temp file, then remove it and restore the index).
- `git status` shows only the intended files changed.

## Verification step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using the `run-validate.mjs` JSON summary, `git status`, `git diff --stat`, and a test commit that must be blocked by the hook, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
