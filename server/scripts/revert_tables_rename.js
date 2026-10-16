#!/usr/bin/env node
require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const db = require("../db");

async function main() {
  const c = await db.pool.connect();
  try {
    console.log("[revert_tables_rename] Starting transaction on esf7_local...");
    await c.query("BEGIN");

    // 1. Rename school_drafts_deprecated_test -> school_drafts
    console.log(
      "[revert_tables_rename] Reverting school_drafts_deprecated_test -> school_drafts...",
    );
    await c.query(
      "ALTER TABLE IF EXISTS public.school_drafts_deprecated_test RENAME TO school_drafts",
    );

    // 2. Rename esf7_room_roster_cache_deprecated_test -> esf7_room_roster_cache
    console.log(
      "[revert_tables_rename] Reverting esf7_room_roster_cache_deprecated_test -> esf7_room_roster_cache...",
    );
    await c.query(
      "ALTER TABLE IF EXISTS public.esf7_room_roster_cache_deprecated_test RENAME TO esf7_room_roster_cache",
    );

    // 3. Recreate dependent view
    console.log(
      "[revert_tables_rename] Recreating view public.esf7_room_cache...",
    );
    await c.query(`
      CREATE OR REPLACE VIEW public.esf7_room_cache AS
      SELECT school_id, roster_json, updated_at
      FROM public.esf7_room_roster_cache
    `);

    await c.query("COMMIT");
    console.log(
      "✅ [revert_tables_rename] Successfully reverted tables and view within transaction!",
    );
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(
      "❌ [revert_tables_rename] Error during revert, rolled back:",
      err.message,
    );
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
}

main();
