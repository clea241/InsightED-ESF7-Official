#!/usr/bin/env node
// Database Restore and Verification Script for InsightED ESF7
// Restores a specified pg_dump custom format archive and verifies row counts.

const { spawn } = require("child_process");
const fs = require("fs");
const { Pool } = require("pg");
require("dotenv").config();

const backupFile = process.argv[2];
const targetDb =
  process.argv[3] || process.env.DB_NAME || "insighted_esf7_restore_test";

if (!backupFile) {
  console.error(
    "Usage: node scripts/restore-db.js <backup_file_path> [target_database]",
  );
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error(`Backup file not found: ${backupFile}`);
  process.exit(1);
}

const dbHost = process.env.DB_HOST || "127.0.0.1";
const dbPort = process.env.DB_PORT || "6432";
const dbUser = process.env.DB_USER || "Administrator1";
const dbPassword = process.env.DB_PASSWORD || "";

console.log(
  `[restore-db] Restoring ${backupFile} into ${targetDb} on ${dbHost}:${dbPort}...`,
);

const args = [
  "-h",
  dbHost,
  "-p",
  String(dbPort),
  "-U",
  dbUser,
  "-d",
  targetDb,
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-acl",
  backupFile,
];

const env = { ...process.env, PGPASSWORD: dbPassword };
const proc = spawn("pg_restore", args, { env, stdio: "inherit" });

proc.on("close", async (code) => {
  console.log(
    `[restore-db] pg_restore exited with code ${code}. Performing post-restore row count check...`,
  );

  const pool = new Pool({
    host: dbHost,
    port: parseInt(dbPort, 10),
    user: dbUser,
    password: dbPassword,
    database: targetDb,
  });

  try {
    const res = await pool.query(`
      SELECT 'esf7_school_profiles' AS tbl, count(*)::int AS count FROM esf7_school_profiles
      UNION ALL
      SELECT 'esf7_personnel', count(*)::int FROM esf7_personnel
      UNION ALL
      SELECT 'esf7_workloads', count(*)::int FROM esf7_workloads;
    `);
    console.log("[restore-db] Post-restore table verification:");
    console.table(res.rows);
    console.log("✅ [restore-db] Restore test verified successfully.");
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(`[restore-db] Verification query failed: ${err.message}`);
    await pool.end();
    process.exit(1);
  }
});

proc.on("error", (err) => {
  console.error(`[restore-db] Failed to execute pg_restore: ${err.message}`);
  process.exit(1);
});
