# Hard rules

- Never replace or remove an existing linter, formatter, or test runner without explicit user approval.
- Never add more than one tool per layer.
- Never use `--no-verify`. Never disable lint rules or add `@ts-ignore` / `eslint-disable` just to make a check pass; fix the cause or report it.
- Never delete tests or lower coverage thresholds to get green.
- Never run `npm audit fix --force`.
- Keep `audit` and `knip` out of the blocking `validate` chain.
- Never commit. Leave changes staged or unstaged for the user to review. The only exception is the temporary hook test: use a temp file, confirm the commit is blocked, then remove the file and restore the index.
- Stay in JS/TS quality tooling: no deployment, CI generation or feature-test writing.

## Known failure modes to prevent

- `validate` referencing a script that does not exist.
- Husky installed but `prepare` script missing, so hooks never activate.
- Prettier and ESLint fighting over formatting (install `eslint-config-prettier` only if conflicts appear).
- Running `prettier --write .` on generated or build folders: make sure `.prettierignore` covers `dist`, `build`, `.next`, `coverage` and lockfiles.
- Mixing package managers in one repo: use the one matching the existing lockfile.
