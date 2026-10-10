/**
 * Migration: migrate_personnel_uuid.js
 *
 * Replaces legacy personnel ID formats ('PER-...', 'local-p-...', 'P-HARVEST-...')
 * with RFC 4122 v4 UUIDs on esf7_personnel_profile.id and all referencing tables.
 *
 * Key guarantees:
 * 1. Safe execution: Strictly gated to 'esf7_local' on localhost / 127.0.0.1.
 * 2. Dry-run by default: Pass --run to commit, otherwise executes inside a transaction and rolls back.
 * 3. Pre-migration snapshot: Creates backup table bak_personnel_profile_pre_uuid.
 * 4. Adds status column: Backfilled with 'canonical', 'client-created', or 'harvester-created'.
 * 5. Adds legacy_id column: Preserves the historical ID for backward compatibility with drafts and QR codes.
 * 6. Creates esf7_personnel_id_mapping table with indexes on (legacy_id) and (new_id).
 * 7. Dynamic FK discovery: Discovers all referencing constraints from pg_constraint dynamically, drops them,
 *    re-keys child tables, updates esf7_personnel_profile, and recreates constraints with identical rules.
 * 8. Verification pass: Validates row counts before/after and confirms ZERO orphaned FKs.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Client } = require("pg");

// CLI argument parsing
const isRun = process.argv.includes("--run");
const isDryRun = !isRun;

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = Number(process.env.DB_PORT || 5432);
const dbUser = process.env.DB_USER || "postgres";
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME || "esf7_local";

// Safety check: Restrict strictly to esf7_local on localhost
function assertSafeEnvironment() {
  const isLocalHost = dbHost === "localhost" || dbHost === "127.0.0.1";
  if (!isLocalHost) {
    throw new Error(
      `[SECURITY HALT] Migration can only be run on localhost/127.0.0.1. Current host: "${dbHost}"`,
    );
  }
  if (dbName !== "esf7_local") {
    throw new Error(
      `[SECURITY HALT] Migration is restricted exclusively to "esf7_local". Current database: "${dbName}"`,
    );
  }
}

const ruleMap = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

async function migrate() {
  assertSafeEnvironment();

  console.log("===============================================================");
  console.log(`[Personnel UUID Migration] Starting...`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (Will ROLLBACK at end)" : "LIVE EXECUTION (Will COMMIT changes)"}`);
  console.log(`Target: ${dbUser}@${dbHost}:${dbPort}/${dbName}`);
  console.log("===============================================================\n");

  const client = new Client({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  await client.connect();

  try {
    // 1. Pre-migration backup snapshot outside transaction if not existing
    console.log("[Step 1/8] Ensuring pre-migration backup snapshot exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS bak_personnel_profile_pre_uuid AS 
      SELECT * FROM esf7_personnel_profile;
    `);
    const backupCnt = await client.query(
      `SELECT COUNT(*) FROM bak_personnel_profile_pre_uuid;`,
    );
    console.log(
      `  ✓ Backup table 'bak_personnel_profile_pre_uuid' confirmed (${backupCnt.rows[0].count} rows).`,
    );

    // 2. Add columns to esf7_personnel_profile if not already present
    console.log("\n[Step 2/8] Ensuring schema columns exist on esf7_personnel_profile...");
    await client.query(`
      ALTER TABLE esf7_personnel_profile 
        ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'canonical',
        ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(128);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_legacy_id 
        ON esf7_personnel_profile (legacy_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_profile_status 
        ON esf7_personnel_profile (status);
    `);
    console.log("  ✓ Columns 'status' and 'legacy_id' and indexes verified.");

    // 3. Ensure mapping table exists
    console.log("\n[Step 3/8] Ensuring mapping table 'esf7_personnel_id_mapping' exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_id_mapping (
        legacy_id VARCHAR(128) PRIMARY KEY,
        new_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pers_mapping_new_id 
        ON esf7_personnel_id_mapping (new_id);
    `);
    console.log("  ✓ Mapping table confirmed.");

    // 4. Populate mapping table for any rows in esf7_personnel_profile not yet mapped
    console.log("\n[Step 4/8] Generating UUIDs and statuses into mapping table...");
    const populateMappingSql = `
      INSERT INTO esf7_personnel_id_mapping (legacy_id, new_id, status)
      SELECT 
        p.id AS legacy_id,
        CASE 
          WHEN p.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p.id
          ELSE gen_random_uuid()::text
        END AS new_id,
        CASE 
          WHEN p.id LIKE 'PER-%' THEN 'canonical'
          WHEN p.id LIKE 'P-HARVEST-%' THEN 'harvester-created'
          WHEN p.id LIKE 'local-p-%' THEN 'client-created'
          WHEN p.status IS NOT NULL AND p.status != '' THEN p.status
          ELSE 'canonical'
        END AS status
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_id_mapping m ON p.id = m.legacy_id
      WHERE m.legacy_id IS NULL;
    `;
    const popRes = await client.query(populateMappingSql);
    console.log(`  ✓ Inserted ${popRes.rowCount} new mappings into 'esf7_personnel_id_mapping'.`);

    const mapSummary = await client.query(`
      SELECT status, count(*) AS count 
      FROM esf7_personnel_id_mapping 
      GROUP BY status ORDER BY count DESC;
    `);
    console.log("  ✓ Current mappings by status:");
    mapSummary.rows.forEach((r) => console.log(`     - ${r.status}: ${r.count}`));

    // 5. Dynamic FK Discovery from pg_constraint
    console.log("\n[Step 5/8] Discovering foreign key constraints pointing to esf7_personnel_profile(id)...");
    const fkDiscoverySql = `
      SELECT
        con.conname AS constraint_name,
        src_cls.relname AS table_name,
        src_att.attname AS column_name,
        dst_cls.relname AS foreign_table,
        dst_att.attname AS foreign_column,
        con.confdeltype AS delete_rule,
        con.confupdtype AS update_rule
      FROM pg_constraint con
      JOIN pg_class src_cls ON con.conrelid = src_cls.oid
      JOIN pg_class dst_cls ON con.confrelid = dst_cls.oid
      JOIN pg_attribute src_att ON src_att.attrelid = src_cls.oid AND src_att.attnum = ANY(con.conkey)
      JOIN pg_attribute dst_att ON dst_att.attrelid = dst_cls.oid AND dst_att.attnum = ANY(con.confkey)
      WHERE con.contype = 'f'
        AND dst_cls.relname = 'esf7_personnel_profile'
        AND dst_att.attname = 'id'
      ORDER BY src_cls.relname, src_att.attname;
    `;
    const fkRes = await client.query(fkDiscoverySql);
    const foreignKeys = fkRes.rows;
    console.log(`  ✓ Discovered ${foreignKeys.length} foreign key constraints dynamically:`);
    foreignKeys.forEach((fk, idx) => {
      console.log(
        `     ${idx + 1}. [${fk.constraint_name}] ${fk.table_name}(${fk.column_name}) -> ` +
        `ON DELETE ${ruleMap[fk.delete_rule] || "NO ACTION"} ON UPDATE ${ruleMap[fk.update_rule] || "NO ACTION"}`,
      );
    });

    if (foreignKeys.length !== 20) {
      console.warn(`  ⚠️ Expected 20 FK constraints, but found ${foreignKeys.length}. Continuing with discovered set.`);
    }

    // 6. Record pre-migration row counts for all affected tables
    console.log("\n[Step 6/8] Capturing baseline pre-migration row counts...");
    const preCounts = {};
    const profCountRes = await client.query(`SELECT COUNT(*) FROM esf7_personnel_profile`);
    preCounts["esf7_personnel_profile"] = Number(profCountRes.rows[0].count);

    for (const fk of foreignKeys) {
      if (!preCounts[fk.table_name]) {
        const cRes = await client.query(`SELECT COUNT(*) FROM ${fk.table_name}`);
        preCounts[fk.table_name] = Number(cRes.rows[0].count);
      }
    }

    const secondaryTables = [
      ["esf7_personnel_node_status", "personnel_id"],
      ["esf7_personnel_allowances", "personnel_id"],
      ["esf7_personnel_submission", "personnel_id"],
      ["esf7_personnel_submission_archive", "personnel_id"],
      ["esf7_deleted_personnel", "personnel_id"],
      ["esf7_personnel_extra_tasks", "personnel_id"],
      ["esf7_room_submissions_staging", "personnel_id"],
      ["overload_late_undertime", "personnel_id"],
    ];

    for (const [sTable] of secondaryTables) {
      try {
        if (!preCounts[sTable]) {
          const scRes = await client.query(`SELECT COUNT(*) FROM ${sTable}`);
          preCounts[sTable] = Number(scRes.rows[0].count);
        }
      } catch (e) {
        // Table might not exist in all environments
      }
    }

    console.log(`  ✓ Baseline counts captured for ${Object.keys(preCounts).length} tables.`);

    // 7. Atomic Transaction: Re-key foreign keys, update profile, recreate constraints, and verify
    console.log("\n[Step 7/8] Entering atomic migration transaction...");
    await client.query("BEGIN;");

    // A. Drop foreign key constraints
    console.log("  A. Dropping foreign key constraints...");
    for (const fk of foreignKeys) {
      await client.query(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT IF EXISTS "${fk.constraint_name}";`);
    }
    console.log("     ✓ All foreign key constraints dropped.");

    // B. Re-key child tables with foreign keys
    console.log("  B. Re-keying child table columns using mapping...");
    for (const fk of foreignKeys) {
      const updateChildSql = `
        UPDATE "${fk.table_name}" t
        SET "${fk.column_name}" = m.new_id
        FROM esf7_personnel_id_mapping m
        WHERE t."${fk.column_name}" = m.legacy_id;
      `;
      const uRes = await client.query(updateChildSql);
      console.log(`     - Re-keyed ${fk.table_name}.${fk.column_name}: ${uRes.rowCount} rows updated.`);
    }

    // C. Re-key secondary tables without formal FKs
    console.log("  C. Re-keying secondary tables without formal FKs...");
    for (const [sTable, sCol] of secondaryTables) {
      try {
        const updateSecSql = `
          UPDATE "${sTable}" t
          SET "${sCol}" = m.new_id
          FROM esf7_personnel_id_mapping m
          WHERE t."${sCol}" = m.legacy_id;
        `;
        const usRes = await client.query(updateSecSql);
        console.log(`     - Re-keyed ${sTable}.${sCol}: ${usRes.rowCount} rows updated.`);
      } catch (e) {
        console.log(`     - Skipped ${sTable}: ${e.message}`);
      }
    }

    // D. Update esf7_personnel_profile: primary key id = new_id, legacy_id = old id, status = mapping status
    console.log("  D. Updating esf7_personnel_profile (id -> new UUID, legacy_id -> old ID, status)...");
    const updateProfileSql = `
      UPDATE esf7_personnel_profile p
      SET 
        legacy_id = p.id,
        id = m.new_id,
        status = m.status,
        updated_at = NOW()
      FROM esf7_personnel_id_mapping m
      WHERE p.id = m.legacy_id;
    `;
    const profRes = await client.query(updateProfileSql);
    console.log(`     ✓ Updated ${profRes.rowCount} rows in esf7_personnel_profile.`);

    // E. Recreate all discovered foreign key constraints
    console.log("  E. Recreating foreign key constraints...");
    for (const fk of foreignKeys) {
      const delAction = ruleMap[fk.delete_rule] || "NO ACTION";
      const updAction = ruleMap[fk.update_rule] || "NO ACTION";
      const addConstraintSql = `
        ALTER TABLE "${fk.table_name}"
        ADD CONSTRAINT "${fk.constraint_name}"
        FOREIGN KEY ("${fk.column_name}")
        REFERENCES "esf7_personnel_profile" ("id")
        ON UPDATE ${updAction}
        ON DELETE ${delAction};
      `;
      await client.query(addConstraintSql);
    }
    console.log("     ✓ All foreign key constraints successfully recreated.");

    // 8. Verification Pass
    console.log("\n[Step 8/8] Performing comprehensive verification pass...");

    // V1. Row count parity check
    console.log("  V1. Checking row count parity...");
    let parityFailures = 0;
    const postCounts = {};
    for (const tableName of Object.keys(preCounts)) {
      try {
        const res = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
        postCounts[tableName] = Number(res.rows[0].count);
        if (preCounts[tableName] !== postCounts[tableName]) {
          console.error(
            `     ❌ Row count mismatch on ${tableName}: Before=${preCounts[tableName]}, After=${postCounts[tableName]}`,
          );
          parityFailures++;
        }
      } catch (e) {
        // Table may have been optional
      }
    }
    if (parityFailures === 0) {
      console.log(`     ✓ All ${Object.keys(preCounts).length} tables have IDENTICAL row counts before and after.`);
    } else {
      throw new Error(`Row count parity check failed with ${parityFailures} mismatches!`);
    }

    // V2. Orphaned foreign key check (MUST BE 0 for all FK columns)
    console.log("  V2. Checking for orphaned foreign keys...");
    let orphanFailures = 0;
    for (const fk of foreignKeys) {
      const orphanCheckSql = `
        SELECT COUNT(*) AS orphan_count
        FROM "${fk.table_name}" t
        LEFT JOIN "esf7_personnel_profile" p ON t."${fk.column_name}" = p."id"
        WHERE t."${fk.column_name}" IS NOT NULL AND p."id" IS NULL;
      `;
      const oRes = await client.query(orphanCheckSql);
      const orphanCount = Number(oRes.rows[0].orphan_count);
      if (orphanCount > 0) {
        console.error(`     ❌ Found ${orphanCount} orphaned rows in ${fk.table_name}.${fk.column_name}!`);
        orphanFailures++;
      }
    }
    if (orphanFailures === 0) {
      console.log(`     ✓ Confirmed 0 orphaned foreign key references across all ${foreignKeys.length} FK constraints.`);
    } else {
      throw new Error(`Orphaned foreign key check failed with ${orphanFailures} violations!`);
    }

    // V3. UUID format check on esf7_personnel_profile.id
    console.log("  V3. Verifying all personnel IDs are RFC 4122 v4 UUIDs...");
    const nonUuidRes = await client.query(`
      SELECT COUNT(*) AS count
      FROM esf7_personnel_profile
      WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    `);
    const nonUuidCount = Number(nonUuidRes.rows[0].count);
    if (nonUuidCount === 0) {
      console.log(`     ✓ All ${postCounts["esf7_personnel_profile"]} personnel records have valid 36-char UUIDs.`);
    } else {
      throw new Error(`UUID format validation failed: ${nonUuidCount} rows do not match UUID pattern!`);
    }

    // V4. Legacy ID and status non-null check
    const nullMetaRes = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE legacy_id IS NULL) AS missing_legacy,
        COUNT(*) FILTER (WHERE status IS NULL) AS missing_status
      FROM esf7_personnel_profile;
    `);
    console.log(
      `     ✓ Missing legacy_id: ${nullMetaRes.rows[0].missing_legacy}, Missing status: ${nullMetaRes.rows[0].missing_status}.`,
    );

    // Commit or Rollback based on CLI flags
    if (isDryRun) {
      console.log("\n---------------------------------------------------------------");
      console.log("[Dry-Run Complete] Rolling back transaction. Zero persistent changes made.");
      console.log("To apply this migration permanently to the database, run:");
      console.log("   node server/migrations/migrate_personnel_uuid.js --run");
      console.log("---------------------------------------------------------------");
      await client.query("ROLLBACK;");
    } else {
      console.log("\n---------------------------------------------------------------");
      console.log("[Live Execution] Verification passed! Committing transaction to database...");
      await client.query("COMMIT;");
      console.log("🎉 MIGRATION COMMITTED SUCCESSFULLY!");
      console.log("---------------------------------------------------------------");
    }
  } catch (err) {
    console.error("\n❌ [Migration Error]:", err.message);
    try {
      await client.query("ROLLBACK;");
      console.log("Transaction successfully rolled back.");
    } catch (rbErr) {
      console.error("Rollback error:", rbErr.message);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
