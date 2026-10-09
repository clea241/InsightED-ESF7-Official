// Runs a command with a throw-away PostgreSQL (embedded, no Docker needed) exposed as TEST_DATABASE_URL.
// Usage: node scripts/with-test-db.mjs -- <command> [args...]
// The database lives in a temp folder, is named "esf7_test", and is deleted when the command finishes.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sep = process.argv.indexOf('--');
const command = sep >= 0 ? process.argv.slice(sep + 1) : [];
if (command.length === 0) {
  console.error('Usage: node scripts/with-test-db.mjs -- <command> [args...]');
  process.exit(2);
}

const dataDir = mkdtempSync(path.join(tmpdir(), 'esf7-test-pg-'));
const port = 54000 + Math.floor(Math.random() * 900);
const devPgUser = 'postgres';
const devPgPass = devPgUser;
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: devPgUser, password: devPgPass, port, persistent: false });

let exitCode = 1;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('esf7_test');
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/esf7_test`;
  console.log(`[with-test-db] PostgreSQL ready on port ${port} (database esf7_test)`);
  const runtimeSmokeSecret = Buffer.from(Date.now().toString()).toString('hex') + 'test_secret_smoke';
  exitCode = await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        TEST_DATABASE_URL: url,
        SMOKE_TEST_JWT_SECRET: process.env.SMOKE_TEST_JWT_SECRET || runtimeSmokeSecret
      }
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
} catch (err) {
  console.error('[with-test-db] failed:', err.message);
} finally {
  try { await pg.stop(); } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(exitCode);
