// The additive worker-schema migration and the boot check, against a disposable PostgreSQL (see helpers.mjs).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  TEST_DATABASE_URL,
  applyAppSchema,
  pointServerAtTestDatabase,
  nodeRequire,
} from "./helpers.mjs";

describe.skipIf(!TEST_DATABASE_URL)(
  "add_worker_schema_columns migration",
  () => {
    let pool;
    const MIG = fileURLToPath(
      new URL("../../migrations/add_worker_schema_columns.js", import.meta.url),
    );

    const run = (...args) => {
      const u = new URL(TEST_DATABASE_URL);
      return execFileSync(process.execPath, [MIG, ...args], {
        env: {
          ...process.env,
          TEST_DATABASE_URL,
          DATABASE_URL: TEST_DATABASE_URL,
          PRIMARY_DATABASE_URL: TEST_DATABASE_URL,
          DB_HOST: u.hostname,
          DB_PORT: u.port,
          DB_NAME: u.pathname.slice(1),
          DB_USER: decodeURIComponent(u.username),
          DB_PASSWORD: decodeURIComponent(u.password),
          DB_SSL: "false",
        },
        stdio: "pipe",
      }).toString();
    };
    const exists = async (table, column) =>
      (
        await pool.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
          [table, column],
        )
      ).rows.length > 0;

    beforeAll(async () => {
      pointServerAtTestDatabase();
      const { Pool } = nodeRequire("pg");
      pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 3 });
      await applyAppSchema(pool);
      // Other test files in the same disposable database add these columns to their fixtures; start from the repo schema.
      await pool.query(
        `ALTER TABLE esf7_school_profile
         DROP COLUMN IF EXISTS has_elem_inclusive, DROP COLUMN IF EXISTS elem_inclusive_programs,
         DROP COLUMN IF EXISTS has_jhs_inclusive, DROP COLUMN IF EXISTS jhs_inclusive_programs,
         DROP COLUMN IF EXISTS has_shs_inclusive, DROP COLUMN IF EXISTS shs_inclusive_programs`,
      );
      await pool.query(
        "ALTER TABLE esf7_personnel_employment DROP COLUMN IF EXISTS raw_payload",
      );
      await pool.query("DROP TABLE IF EXISTS schema_migration_log");
    });
    afterAll(async () => {
      if (pool) await pool.end();
    });

    test("before: the boot check finds exactly the repo-uncreatable columns missing", async () => {
      const { findMissingWorkerColumns } = nodeRequire(
        "../../db/workerSchemaCheck.js",
      );
      const { missingTables, missingColumns } =
        await findMissingWorkerColumns(pool);
      expect(missingTables).toEqual([]);
      expect(missingColumns.esf7_personnel_employment).toContain("raw_payload");
      expect(missingColumns.esf7_school_profile).toEqual(
        expect.arrayContaining([
          "has_elem_inclusive",
          "elem_inclusive_programs",
          "has_jhs_inclusive",
          "jhs_inclusive_programs",
          "has_shs_inclusive",
          "shs_inclusive_programs",
        ]),
      );
    });

    test("dry run changes nothing", async () => {
      run("--dry-run");
      expect(await exists("esf7_school_profile", "has_elem_inclusive")).toBe(
        false,
      );
    });

    test("up adds the columns with the types the worker inserts, and is safe to repeat", async () => {
      run();
      const types = await pool.query(
        `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE (table_name = 'esf7_school_profile' AND column_name LIKE '%inclusive%' AND column_name <> 'inclusive_programs')
           OR (table_name = 'esf7_personnel_employment' AND column_name = 'raw_payload')`,
      );
      const byName = Object.fromEntries(
        types.rows.map((r) => [r.column_name, r]),
      );
      expect(byName.raw_payload.data_type).toBe("jsonb");
      for (const c of [
        "has_elem_inclusive",
        "has_jhs_inclusive",
        "has_shs_inclusive",
      ]) {
        expect(byName[c]).toMatchObject({
          data_type: "boolean",
          is_nullable: "NO",
        });
      }
      for (const c of [
        "elem_inclusive_programs",
        "jhs_inclusive_programs",
        "shs_inclusive_programs",
      ]) {
        expect(byName[c].data_type).toBe("jsonb");
      }
      run(); // second run: nothing to do, no error
      const log = await pool.query(
        "SELECT count(*)::int AS n FROM schema_migration_log",
      );
      expect(log.rows[0].n).toBe(7);
    });

    test("after: the worker's own INSERT for the school profile works", async () => {
      await pool.query(
        `INSERT INTO esf7_school_profile (id, school_id, school_year, has_elem_inclusive, elem_inclusive_programs, extras)
       VALUES ('SCH-PROFILE-777001', '777001', '2026-2027', true, '["SPED"]'::jsonb, '{}'::jsonb)`,
      );
      const r = await pool.query(
        "SELECT has_elem_inclusive, elem_inclusive_programs FROM esf7_school_profile WHERE school_id = '777001'",
      );
      expect(r.rows[0]).toEqual({
        has_elem_inclusive: true,
        elem_inclusive_programs: ["SPED"],
      });
    });

    test("down drops only the columns the migration itself added", async () => {
      // A column that existed before the migration must survive a down run.
      await pool.query(
        "ALTER TABLE esf7_school_profile DROP COLUMN has_shs_inclusive",
      );
      await pool.query(
        "ALTER TABLE esf7_school_profile ADD COLUMN has_shs_inclusive BOOLEAN NOT NULL DEFAULT FALSE",
      );
      await pool.query(
        "DELETE FROM schema_migration_log WHERE column_name = 'has_shs_inclusive'",
      ); // i.e. it was not added by the migration
      expect(run("--down", "--dry-run")).toMatch(/would drop/);
      expect(await exists("esf7_school_profile", "has_elem_inclusive")).toBe(
        true,
      );
      run("--down");
      expect(await exists("esf7_school_profile", "has_elem_inclusive")).toBe(
        false,
      );
      expect(await exists("esf7_personnel_employment", "raw_payload")).toBe(
        false,
      );
      expect(await exists("esf7_school_profile", "has_shs_inclusive")).toBe(
        true,
      ); // untouched
      // data in other columns is intact
      const r = await pool.query(
        "SELECT school_id FROM esf7_school_profile WHERE school_id = '777001'",
      );
      expect(r.rows).toHaveLength(1);
    });
  },
);
