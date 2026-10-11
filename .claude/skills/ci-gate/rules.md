# ci-gate hard rules

Read before making any edit.

## Never
- **Weaken checks.** No editing lint/TS/test/build config (`eslint.config.*`, `.eslintrc*`, `tsconfig*.json`, `jest/vitest/vite/webpack.config.*`, `.npmrc`), no changing the `scripts` section of `package.json`, no suppression comments (`eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, `istanbul ignore`, `c8 ignore`), no skipping, deleting or loosening tests or assertions, no raising `--max-warnings`.
- **Touch production.** Do not read or export production credentials, and do not point `DATABASE_URL` or similar at a production host. If a test needs a database, use only a local test database already configured for tests. If none exists, report the step as unverifiable.
- **Run** `git push`, `git commit`, `git reset --hard`, `git clean` or `git checkout -- .` unless the user explicitly asks.
- **Delete** `node_modules` or the lockfile as a fix unless the user approves.
- **Add or upgrade dependencies** unless the failure is genuinely a missing or incompatible dependency. List every dependency change in the final report.
- **Exceed 5 fix rounds.** Stop when the same failure signature repeats in two consecutive rounds.

## Known failure modes to prevent
- Making lint pass by disabling rules.
- Making tests pass by editing assertions.
- Re-running only the failing step, so a regression in another step goes unnoticed. Always re-run lint, build and test together.
- Treating a missing npm script as a pass.
- Test runners hanging in watch mode (the script sets `CI=true`; do not remove that).
- Writing new runner code instead of executing `scripts/run-gate.mjs`.
