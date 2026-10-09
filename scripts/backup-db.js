#!/usr/bin/env node
// Automated Database Backup Runner for InsightED ESF7
// Runs pg_dump with compression, retention cleanup, and safe credential handling from process.env.
// Can be scheduled as a PM2 cron script or standalone cron job.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
require("dotenv").config();

const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  (process.platform === "win32"
    ? path.join(os.homedir(), "insighted_backups")
    : "/var/backups/insighted_esf7");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "14", 10);

const dbHost = process.env.DB_HOST || process.env.PGHOST || "127.0.0.1";
const dbPort = process.env.DB_PORT || process.env.PGPORT || "6432";
const dbName =
  process.env.DB_NAME || process.env.PGDATABASE || "insighted_esf7";
const dbUser = process.env.DB_USER || process.env.PGUSER || "Administrator1";
const dbPassword = process.env.DB_PASSWORD || process.env.PGPASSWORD || "";

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(BACKUP_DIR, `${dbName}_${timestamp}.dump`);

console.log(`[backup-db] Starting pg_dump for ${dbName} to ${outputFile}...`);

const args = [
  "-h",
  dbHost,
  "-p",
  String(dbPort),
  "-U",
  dbUser,
  "-d",
  dbName,
  "-F",
  "c",
  "-b",
  "-f",
  outputFile,
];

const env = { ...process.env, PGPASSWORD: dbPassword };
const proc = spawn("pg_dump", args, { env, stdio: "inherit" });

proc.on("close", (code) => {
  if (code !== 0) {
    console.error(`[backup-db] pg_dump failed with exit code ${code}`);
    process.exit(code);
  }

  const stat = fs.statSync(outputFile);
  console.log(`[backup-db] Backup finished successfully (${stat.size} bytes).`);

  // Retention cleanup: remove files older than RETENTION_DAYS
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (file.startsWith(dbName) && file.endsWith(".dump")) {
        const filePath = path.join(BACKUP_DIR, file);
        const fstat = fs.statSync(filePath);
        if (fstat.mtimeMs < cutoff) {
          console.log(`[backup-db] Pruning expired backup: ${file}`);
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (err) {
    console.warn(`[backup-db] Retention pruning warning: ${err.message}`);
  }

  console.log("[backup-db] All tasks completed.");
  process.exit(0);
});

proc.on("error", (err) => {
  console.error(`[backup-db] Failed to launch pg_dump: ${err.message}`);
  process.exit(1);
});
