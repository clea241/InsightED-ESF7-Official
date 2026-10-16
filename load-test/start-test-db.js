const { spawn, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const root = path.resolve(__dirname, "..");
const pgCtl = path.join(
  root,
  "node_modules",
  "@embedded-postgres",
  "windows-x64",
  "native",
  "bin",
  "pg_ctl.exe",
);
const postgresBin = path.join(
  root,
  "node_modules",
  "@embedded-postgres",
  "windows-x64",
  "native",
  "bin",
  "postgres.exe",
);
const dataDir = path.join(os.tmpdir(), "esf7_load_pg");

// Stop if running
try {
  execFileSync(pgCtl, ["-D", dataDir, "stop", "-m", "immediate"], {
    stdio: "ignore",
  });
} catch (e) {}

// Start postgres directly in background
console.log("Starting PostgreSQL on port 54332...");
const child = spawn(postgresBin, ["-D", dataDir, "-p", "54332"], {
  detached: true,
  stdio: "ignore",
});
child.unref();

// Wait up to 10s for connection
const { Client } = require(path.join(root, "server", "node_modules", "pg"));
async function wait() {
  for (let i = 0; i < 20; i++) {
    try {
      const c = new Client({
        connectionString:
          "postgresql://postgres:postgres@127.0.0.1:54332/postgres",
      });
      await c.connect();
      console.log("PostgreSQL test database is READY on port 54332.");
      // Ensure esf7_load_test database exists
      const res = await c.query(
        "SELECT datname FROM pg_database WHERE datname='esf7_load_test'",
      );
      if (!res.rows.length) {
        await c.query("CREATE DATABASE esf7_load_test");
        console.log("Created database esf7_load_test.");
      } else {
        console.log("Database esf7_load_test exists.");
      }
      await c.end();
      process.exit(0);
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.error("Failed to connect to PostgreSQL within 10s");
  process.exit(1);
}
wait();
