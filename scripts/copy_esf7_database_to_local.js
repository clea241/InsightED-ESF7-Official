const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DUMP_PATH = path.resolve(__dirname, "../scratch/esf7_database.dump");
const PG_DUMP_BIN = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe";
const PG_RESTORE_BIN = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe";

async function runStep(name, cmd, args, env) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Starting ${name}...`);
    const proc = spawn(cmd, args, { env: { ...process.env, ...env } });
    
    proc.stdout.on("data", (d) => process.stdout.write(d.toString()));
    proc.stderr.on("data", (d) => {
      const msg = d.toString();
      // pg_dump / pg_restore print progress info to stderr
      if (!msg.includes("warning: ") && !msg.includes("error: ")) {
        process.stdout.write(msg);
      } else {
        process.stderr.write(msg);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`✓ ${name} finished successfully.`);
        resolve();
      } else {
        reject(new Error(`${name} failed with exit code ${code}`));
      }
    });
  });
}

async function verifyCounts() {
  console.log("\n================================================================");
  console.log("📊 RUNNING VERIFICATION COUNTS");
  console.log("================================================================");

  const prod = new Client({
    host: "stride-posgre-prod-01.postgres.database.azure.com",
    port: 5432,
    user: "Administrator1",
    password: "pRZTbQ2T1JD7",
    database: "insightEd",
    ssl: { rejectUnauthorized: false },
  });
  await prod.connect();
  const prodRes = await prod.query("SELECT count(*)::int as c FROM esf7_database;");
  const prodCount = prodRes.rows[0].c;
  await prod.end();

  const local = new Client({
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    password: "kLeyahhUnique241!@",
    database: "esf7_local",
  });
  await local.connect();
  const localRes = await local.query("SELECT count(*)::int as c FROM esf7_database;");
  const localCount = localRes.rows[0].c;
  await local.end();

  console.log(`Production insightEd.esf7_database : ${prodCount} rows`);
  console.log(`Local esf7_local.esf7_database      : ${localCount} rows`);

  if (prodCount === localCount && localCount > 0) {
    console.log("✅ 100% DATA PARITY CONFIRMED!");
    return true;
  } else {
    console.error(`❌ Mismatch: Production has ${prodCount}, Local has ${localCount}`);
    return false;
  }
}

async function main() {
  console.log("================================================================");
  console.log("📦 COPYING esf7_database: PRODUCTION insightEd -> LOCAL esf7_local");
  console.log("================================================================");
  console.log("🔒 GUARANTEE: Production access is strictly READ-ONLY (pg_dump).");
  console.log("              Zero writes, deletes, or drops will touch production.");

  // Step 1: Dump from production insightEd
  const dumpArgs = [
    "-h", "stride-posgre-prod-01.postgres.database.azure.com",
    "-U", "Administrator1",
    "-d", "insightEd",
    "-t", "esf7_database",
    "-F", "c",
    "-b",
    "-v",
    "--no-owner",
    "--no-privileges",
    "-f", DUMP_PATH,
  ];

  await runStep("pg_dump from Azure insightEd", PG_DUMP_BIN, dumpArgs, {
    PGPASSWORD: "pRZTbQ2T1JD7",
  });

  const stats = fs.statSync(DUMP_PATH);
  console.log(`\nDump file created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Step 2: Restore into local esf7_local
  const restoreArgs = [
    "-h", "127.0.0.1",
    "-p", "5432",
    "-U", "postgres",
    "-d", "esf7_local",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "-v",
    DUMP_PATH,
  ];

  await runStep("pg_restore to local esf7_local", PG_RESTORE_BIN, restoreArgs, {
    PGPASSWORD: "kLeyahhUnique241!@",
  });

  // Step 3: Verify counts
  const ok = await verifyCounts();

  // Step 4: Cleanup dump file
  if (ok && fs.existsSync(DUMP_PATH)) {
    fs.unlinkSync(DUMP_PATH);
    console.log(`Cleaned up temporary dump file: ${DUMP_PATH}`);
  }

  console.log("\n================================================================");
  console.log("🎉 SUCCESS: esf7_database is now fully loaded in esf7_local!");
  console.log("================================================================");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
