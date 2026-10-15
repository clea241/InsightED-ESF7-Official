// Local test database helper for the failure-path runner. Test database only; re-checks the guard rules itself.
//   node test-db.mjs start [stopFile]   start a disposable embedded PostgreSQL on the host/port of DATABASE_URL in .env.test
//                                       (stays up until killed, or until stopFile appears)
//   node test-db.mjs bootstrap          drop and recreate the database named in .env.test, then apply the project's schema
// Reads .env.test only. Never prints credentials.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const req = createRequire(path.join(root, "server", "package.json"));
const reqRoot = createRequire(path.join(root, "package.json"));
const env = {};
for (const l of fs
  .readFileSync(path.join(root, ".env.test"), "utf8")
  .split(/\r?\n/)) {
  const m = l.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
  if (m && !l.trim().startsWith("#"))
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const u = new URL(env.DATABASE_URL);
const dbName = decodeURIComponent(u.pathname.slice(1));
const host = u.hostname.replace(/^\[|\]$/g, "");
if (
  !["localhost", "127.0.0.1", "::1"].includes(host) ||
  !dbName.toLowerCase().includes("test") ||
  /^drill_/i.test(dbName)
) {
  console.error(
    'REFUSED: only a local database whose name contains "test" may be created or reset.',
  );
  process.exit(2);
}
const port = Number(u.port || 5432);
const user = decodeURIComponent(u.username);
const password = decodeURIComponent(u.password);

if (process.argv[2] === "start") {
  const EmbeddedPostgres =
    reqRoot("embedded-postgres").default || reqRoot("embedded-postgres");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "esf7-failurepath-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user,
    password,
    port,
    persistent: false,
  });
  const stop = async () => {
    // The cluster is disposable (non-persistent temp directory), so no graceful shutdown is needed. pg.stop() can take very long or hang on
    // Windows, and a runner that gives up waiting leaves orphaned postgres.exe processes that wedge the next run. So: kill the postmaster
    // tree at once (only the one whose data directory is this run's own temp directory).
    try {
      const postmaster = Number(
        fs
          .readFileSync(path.join(dir, "postmaster.pid"), "utf8")
          .split(/\r?\n/)[0],
      );
      if (postmaster > 0) {
        if (process.platform === "win32") {
          // Children first, while the postmaster is still alive and they can be found through it. Killing the postmaster first leaves
          // postgres.exe children that keep the listening port (and the next run's bootstrap) hanging. taskkill /T is not enough here.
          const script =
            "function K($p){ Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $p) | ForEach-Object { K $_.ProcessId }; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }; K " +
            postmaster;
          spawnSync(
            "powershell",
            ["-NoProfile", "-NonInteractive", "-Command", script],
            { stdio: "ignore", timeout: 20000 },
          );
        } else process.kill(postmaster, "SIGKILL");
      }
    } catch {
      /* no postmaster.pid: it shut down cleanly */
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  await pg.initialise();
  await pg.start();
  console.log(`embedded PostgreSQL ready on ${host}:${port}`);
  // Stay alive until the runner stops us: SIGTERM, or the stop file appearing (portable on Windows, where signals are hard kills).
  const stopFile = process.argv[3];
  setInterval(() => {
    if (stopFile && fs.existsSync(stopFile)) stop();
  }, 500);
} else if (process.argv[2] === "bootstrap") {
  const { Client } = req("pg");
  const admin = new Client({
    host,
    port,
    user,
    password,
    database: "postgres",
  });
  await admin.connect();
  const q = '"' + dbName.replace(/"/g, '""') + '"';
  await admin.query(`DROP DATABASE IF EXISTS ${q} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${q}`);
  await admin.end();

  // The project's own schema: server/schema.sql is what server.js initDB() applies to an empty database. (The generated drizzle file and the
  // legacy create_*.js scripts are older than the code and some hard-code the real database name, so they are deliberately NOT used.)
  const schemaFile = path.join(root, "server", "schema.sql");
  if (!fs.existsSync(schemaFile)) {
    console.error("server/schema.sql not found");
    process.exit(2);
  }
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  await c.query(fs.readFileSync(schemaFile, "utf8"));
  const n = await c.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
  );
  await c.end();
  // Production also has school_drafts (the versioned draft table the save endpoint writes first). Two small project scripts create it;
  // pin-db.cjs forces their connection to the test database whatever they ask for.
  const pinDb = fileURLToPath(new URL("./pin-db.cjs", import.meta.url))
    .split(path.sep)
    .join("/");
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    TEST_DATABASE_URL: env.DATABASE_URL,
    DATABASE_URL: env.DATABASE_URL,
    PRIMARY_DATABASE_URL: env.DATABASE_URL,
    USERS_DATABASE_URL: env.DATABASE_URL,
    INSIGHTED_DATABASE_URL: env.DATABASE_URL,
    DB_HOST: host,
    DB_PORT: String(port),
    DB_NAME: dbName,
    DB_USER: user,
    DB_PASSWORD: password,
    DB_SSL: "false",
    NODE_OPTIONS: `--require "${pinDb}"`,
  };
  for (const script of [
    "ensure_school_drafts_table.js",
    "migrations/add_school_drafts_version.js",
  ]) {
    const r = spawnSync(process.execPath, [script], {
      cwd: path.join(root, "server"),
      env: childEnv,
      stdio: "ignore",
      timeout: 60000,
    });
    if (r.status !== 0) {
      console.error("schema step failed: " + script);
      process.exit(2);
    }
  }
  console.log(`schema.sql applied to ${dbName}: ${n.rows[0].n} tables`);
} else {
  console.error("usage: node test-db.mjs start|bootstrap");
  process.exit(2);
}
