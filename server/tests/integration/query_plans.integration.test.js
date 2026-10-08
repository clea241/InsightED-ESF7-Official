// Large-school case: with realistic volume the hot queries must use their indexes (no sequential scans).
// Catches a dropped/renamed index or a query rewritten so the planner can no longer use it.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { TEST_DATABASE_URL, SCHEMA_SQL, pointServerAtTestDatabase, nodeRequire } from './helpers.mjs';

describe.skipIf(!TEST_DATABASE_URL)('query plans on a large dataset', () => {
  let pool;

  beforeAll(async () => {
    pointServerAtTestDatabase();
    const { Pool } = nodeRequire('pg');
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(SCHEMA_SQL);
    await pool.query("ALTER TABLE school_drafts ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0");
    // ~60k completed jobs, a handful pending: the shape of a busy submission season.
    await pool.query(`INSERT INTO esf7_submission_queue (school_id, status, payload)
                      SELECT (100000 + (g % 3000))::text, 'completed', '{}'::jsonb FROM generate_series(1, 60000) g`);
    await pool.query(`INSERT INTO esf7_submission_queue (school_id, status, payload)
                      SELECT (100000 + g)::text, 'pending', '{}'::jsonb FROM generate_series(1, 25) g`);
    await pool.query(`INSERT INTO school_drafts (school_id, school_year, payload)
                      SELECT (100000 + g)::text, 'SY 26-27', '{}'::jsonb FROM generate_series(1, 6000) g`);
    await pool.query('ANALYZE esf7_submission_queue; ANALYZE school_drafts;');
  });
  afterAll(async () => { if (pool) await pool.end(); });

  const plan = async (sql, params = []) => (await pool.query(`EXPLAIN ${sql}`, params)).rows.map((r) => r['QUERY PLAN']).join('\n');

  test('picking the next pending job uses the (status, id) index, not a table scan', async () => {
    const p = await plan("SELECT id FROM esf7_submission_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED");
    expect(p).toMatch(/Index (Only )?Scan.*idx_esf7_submission_queue_status_id/);
    expect(p).not.toMatch(/Seq Scan/);
  });

  test('looking up a school\'s submissions uses the (school_id, school_year) index', async () => {
    const p = await plan("SELECT * FROM esf7_submission_queue WHERE school_id = '100500' AND school_year = '2026-2027'");
    expect(p).toMatch(/idx_esf7_submission_queue_school_sy/);
    expect(p).not.toMatch(/Seq Scan/);
  });

  test('loading a school\'s draft is a primary-key lookup', async () => {
    const p = await plan("SELECT payload, updated_at, version FROM school_drafts WHERE school_id = '103000' AND school_year = 'SY 26-27'");
    expect(p).toMatch(/school_drafts_pkey/);
    expect(p).not.toMatch(/Seq Scan/);
  });

  test('the pick-and-claim round trip stays fast with 60k rows', async () => {
    const started = Date.now();
    for (let i = 0; i < 25; i++) {
      const r = await pool.query("SELECT id FROM esf7_submission_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED");
      await pool.query("UPDATE esf7_submission_queue SET status = 'processing' WHERE id = $1", [r.rows[0].id]);
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
