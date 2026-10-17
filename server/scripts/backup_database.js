require("../db/directPort"); // direct Postgres connection (not PgBouncer): pg_dump needs a real session
// Takes a custom-format pg_dump of the application database and VERIFIES it (non-empty + pg_restore --list).
// Prints BACKUP_VERIFIED <file> on success; any other outcome exits non-zero.
//   node -r ./scripts/with_ecosystem_env.js scripts/backup_database.js --out /var/backups/esf7/x.dump --expect-db insighted_esf7_staging
// --expect-db refuses to run when the app's database is not the one the deploy is meant for (so a staging deploy can
// never back up and then migrate the wrong database).
const { spawnSync } = require("child_process");
const fs = require("fs");
const { directConnectionConfig } = require("../db/directPort");

function resolveDatabaseName(cfg, env = process.env) {
  if (cfg.database) return cfg.database;
  const url = env.PRIMARY_DATABASE_URL || env.DATABASE_URL;
  if (!url) return undefined;
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return undefined;
  }
}

function buildPgDumpArgs(cfg, database, out) {
  return [
    "-h",
    String(cfg.host),
    "-p",
    String(cfg.port),
    "-U",
    String(cfg.user),
    "-d",
    String(database),
    "-Fc",
    "-f",
    out,
  ];
}

function main(argv = process.argv.slice(2), env = process.env) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const out = arg("--out");
  const expectDb = arg("--expect-db");
  if (!out) {
    console.error("backup_database: --out <file> is required");
    return 1;
  }
  const cfg = directConnectionConfig(env);
  const database = resolveDatabaseName(cfg, env);
  if (!database) {
    console.error("backup_database: cannot tell which database the app uses");
    return 1;
  }
  if (expectDb && database !== expectDb) {
    console.error(
      `backup_database: the app is configured for database "${database}" but this deploy expects "${expectDb}". Nothing was backed up or changed.`,
    );
    return 2;
  }
  const dump = spawnSync("pg_dump", buildPgDumpArgs(cfg, database, out), {
    env: {
      ...env,
      PGPASSWORD: cfg.password || "",
      // a remote server (Azure) must be reached over TLS; a local one may fall back to plain
      PGSSLMODE:
        env.PGSSLMODE ||
        (/^(127\.0\.0\.1|localhost|::1)$/.test(String(cfg.host))
          ? "prefer"
          : "require"),
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (dump.status !== 0) {
    console.error("backup_database: pg_dump failed");
    return 1;
  }
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
    console.error("backup_database: the dump file is empty");
    return 1;
  }
  const list = spawnSync("pg_restore", ["--list", out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (list.status !== 0) {
    console.error("backup_database: pg_restore --list could not read the dump");
    return 1;
  }
  console.log(`BACKUP_VERIFIED ${out}`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { buildPgDumpArgs, resolveDatabaseName, main };
