# Fix prompt template

`run-gate.mjs` writes `fix-prompt.md` (in the temp dir it prints) with a short header, then one section per failed step in this exact structure:

```
## <step> failed (exit code <code>, status <failed|missing|timeout>)

**Command:** `<failing command>`

**Error excerpt:**
(fenced code block: up to 20 lines matching error|Error|FAIL|✖|✕|failed; falls back to the last 60 lines)

**Last 60 lines:** see `<path to step log>`

**Files likely involved:**
- path/to/file.ext:LINE

**Signature:** `<step: first error line, numbers and paths stripped>`

**Instruction:** Fix the root cause in source code, then re-run only this command to confirm; do not change lint/test/build config, do not skip or delete tests, do not add suppression comments.
```

Steps are `npm-ci`, `lint`, `build`, `test`. The structure never changes; only content does.

## Interpreting failures

- **Cascades.** A failed `npm ci` can cause build, lint and test failures (missing modules, wrong versions). Fix it first and ignore later failures until it passes. A failed `build` can cause test failures (missing generated output, type errors imported by tests). Fix order: npm-ci, build, lint, test.
- **Lockfile problems.** Fix by making `package.json` and the lockfile consistent (e.g. run the package manager so the lockfile reflects `package.json`). Never delete the lockfile or `node_modules` to get past the error unless the user approves.
- **`missing` status.** The npm script does not exist. It is a failure, not a pass. Report it; do not add or edit scripts in `package.json` (rules.md forbids it).
- **`timeout`.** Usually a watch-mode runner or a hung process. Look for open handles or missing teardown in source, not for a longer timeout.
- **Signatures.** If the same signature appears in two consecutive rounds, no progress was made: stop and report.
- **After the final round**, a fix to one step may regress another, so always re-run all of lint, build and test.
