const { execFileSync } = require("child_process");
const path = require("path");
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
const dataDir = path.join(os.tmpdir(), "esf7_load_pg");

try {
  execFileSync(pgCtl, ["-D", dataDir, "stop"], {
    encoding: "utf8",
    stdio: "inherit",
  });
  console.log("PostgreSQL test database stopped.");
} catch (e) {
  console.log("PostgreSQL test database already stopped or error:", e.message);
}
