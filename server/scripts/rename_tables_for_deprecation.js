#!/usr/bin/env node
const db = require('../db');

async function main() {
  const c = await db.pool.connect();
  try {
    console.log('[rename_tables_for_deprecation] Starting transaction on esf7_local...');
    await c.query('BEGIN');

    // 1. Drop dependent view
    console.log('[rename_tables_for_deprecation] Dropping view public.esf7_room_cache...');
    await c.query('DROP VIEW IF EXISTS public.esf7_room_cache CASCADE');

    // 2. Rename esf7_room_roster_cache -> esf7_room_roster_cache_deprecated_test
    console.log('[rename_tables_for_deprecation] Renaming esf7_room_roster_cache -> esf7_room_roster_cache_deprecated_test...');
    await c.query('ALTER TABLE public.esf7_room_roster_cache RENAME TO esf7_room_roster_cache_deprecated_test');

    // 3. Rename school_drafts -> school_drafts_deprecated_test
    console.log('[rename_tables_for_deprecation] Renaming school_drafts -> school_drafts_deprecated_test...');
    await c.query('ALTER TABLE public.school_drafts RENAME TO school_drafts_deprecated_test');

    await c.query('COMMIT');
    console.log('✅ [rename_tables_for_deprecation] Successfully renamed legacy tables within transaction!');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('❌ [rename_tables_for_deprecation] Error during rename, rolled back:', err.message);
    process.exit(1);
  } finally {
    c.release();
    process.exit(0);
  }
}

main();
