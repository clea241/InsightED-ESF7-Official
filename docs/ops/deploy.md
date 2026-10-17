# Deploying staging and production

Both scripts are thin configs over one module, `deploy_common.py`, so they cannot drift apart.

```
python deploy_esf7_staging.py [--skip-gate] [--ship-env]
python deploy_esf7_prod.py    [--skip-gate] [--ship-env]
```

## What a deploy does (and when it says "Deployment Complete")

1. **Gate.** Prints the branch and commit being deployed. Production requires `npm run verify` to have passed for exactly this commit (clean tree, stamp not older than 24h). Staging requires clean tracked files and a branch that is not behind its remote. `--skip-gate` skips this with a loud warning; there is no hardcoded bypass.
2. **Same-environment check.** Aborts, before touching anything, unless `REMOTE_ROOT`, the PM2 name, the port and the ecosystem file (read from the real file) all belong to the same environment. Both scripts target the same host, so a mixed-up config would otherwise deploy to the wrong place.
3. **Build and archive.** Writes `BUILD_INFO.json` (git SHA, branch, UTC time, environment) into the archive. The archive never contains `.env` files, `server/uploads`, `server/scratch`, `server/backups`, `server/tests`, `server/**/test_*.js`, `.git`, `node_modules`, `.turbo`, `*.bak*`, logs (Windows paths are normalised before matching).
4. **Server.** Snapshot of the current release to `<root>.prev` (without logs/uploads), clear the old release's files (keeping `uploads`, `logs`, `.env`, `node_modules`), extract, `npm install`, read `BUILD_INFO.json` back and require its SHA to equal the local HEAD, **verified `pg_dump` backup**, run the migrations, then `pm2 reload` (or `start` if the process does not exist).
5. **Checks, all required:** readiness endpoint `/api/health/readiness` answers `db: up` **and reports the SHA that was deployed**; every PM2 process online with no restart during a 10 s window; `node server/scripts/check_merge_pipeline.js` and `node server/migrations/add_personnel_parity_columns.js --check` exit 0; the smoke test (health, 401 without a token, verify-passcode, a real draft save/read/delete on the reserved school 000000).
6. **Any failure after the server was touched:** the previous release is restored from `.prev` (uploads, logs and `.env` untouched), PM2 reloaded, health re-checked, and the script exits **non-zero** with a clear message. "Deployment Complete" prints only when every check passed. A failure before the server is touched leaves it unchanged.

Steps that must not be ignored use `must=`; retries are only used for SSH/upload connectivity. The remote extract/install step runs once with a 25-minute timeout. The staging watchdog deploy lock is always released in `finally`.

## How the server gets its environment (checked in the repo)

`server/loadEnv.js` reads the **root `.env` on the VM** (`<root>/.env`), falling back to `server/.env`. Values already in the process environment (set by PM2 from the ecosystem file) win for `DB_*`, `PORT`, `NODE_ENV`, `DATABASE_URL`. `DATABASE_URL` and the other `*_URL` values are **not** pinned by the ecosystem files, so the VM's `.env` decides them. That is why the scripts no longer ship the local `.env`: production used to upload the developer's root `.env` (which here points at the staging database) over the server's.

- `--ship-env` ships the local `.env` / `server/.env` as `.env.shipped` and installs each **only if the server has no such file**. It never overwrites an existing `.env`.
- Ops scripts on the server (migration, backup, checks) run with `ESF7_ECOSYSTEM=... node -r ./scripts/with_ecosystem_env.js ...` so they see the same environment as the running app, and the backup refuses (`--expect-db`) if the app's database is not the one this deploy is for.

## Production migrations

`MIGRATIONS` is no longer empty: both environments run `migrations/add_personnel_parity_columns.js` (additive, idempotent) after a verified backup. The backup file is `/var/backups/esf7/<db>_pre_deploy_<time>.dump`.

## Manual steps / things to know

- First time: make sure the VM has a root `.env` (`<root>/.env`) with the database settings for that environment. A deploy prints a warning if neither `.env` exists.
- Rolling back needs a previous release: the very first deploy has none (the script says so).
- The release is rolled back by file copy, not by restoring the database. Migrations here are additive, so the old code runs against the migrated schema; restore the dump only for a real data problem.
- Tests for the shared module: `py -m unittest scripts/test_deploy_common.py -v` (no server needed).
