// Workload source-of-truth endpoints against a real PostgreSQL: the version marker, the state read, and the
// term-scoped clears (one teacher / the whole school) that must delete database rows, not just local state.
// Requires TEST_DATABASE_URL (see helpers.mjs); tables are created with only the columns the controller uses.
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import {
  TEST_DATABASE_URL,
  pointServerAtTestDatabase,
  nodeRequire,
} from "./helpers.mjs";

const enabled = !!TEST_DATABASE_URL;
const TEST_SECRET = "integration-test-secret-0123456789";
process.env.JWT_SECRET = TEST_SECRET;

const TABLES_SQL = `
  DROP TABLE IF EXISTS esf7_shs_workload_rows, esf7_workload_rows, esf7_personnel_employment, esf7_personnel_profile CASCADE;
  CREATE TABLE esf7_personnel_profile (
    id VARCHAR(50) PRIMARY KEY, prn TEXT UNIQUE NOT NULL, school_id TEXT NOT NULL, school_year TEXT NOT NULL,
    first_name TEXT, last_name TEXT, raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE esf7_personnel_employment (personnel_id VARCHAR(50) UNIQUE, grade_levels_taught JSONB);
  CREATE TABLE esf7_workload_rows (
    id VARCHAR(80) PRIMARY KEY, personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL, school_year TEXT NOT NULL, grade_level TEXT, section_id VARCHAR(50), section_name TEXT,
    subject TEXT NOT NULL, subject_id VARCHAR(50), remediation_subject TEXT, start_time TIME, end_time TIME,
    days JSONB DEFAULT '["M","T","W","TH","F"]'::jsonb, term TEXT DEFAULT '1st', raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE esf7_shs_workload_rows (
    id VARCHAR(80) PRIMARY KEY, personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL, term TEXT NOT NULL DEFAULT '1st', subject TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

describe.skipIf(!enabled)(
  "workload state + term-scoped clears (real PostgreSQL)",
  () => {
    let pool;
    let server;
    let base;

    beforeAll(async () => {
      pointServerAtTestDatabase();
      const { Pool } = nodeRequire("pg");
      pool = new Pool({ connectionString: TEST_DATABASE_URL });
      await pool.query(TABLES_SQL);
      for (const [id, school] of [
        ["PER-A-1", "111111"],
        ["PER-A-2", "111111"],
        ["PER-B-1", "222222"],
      ]) {
        await pool.query(
          `INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name, raw_payload)
         VALUES ($1, $2, $3, 'SY 26-27', 'T', $2, '{"assignedGradeLevels":["Grade 1"],"type":"teaching"}'::jsonb)`,
          [id, `PRN-${id}`, school],
        );
      }
      const router = nodeRequire("../../controllers/workload_rows/index.js");
      const { apiAuthGate } = nodeRequire("../../middleware/auth.js");
      const app = express();
      app.use(express.json());
      app.use("/api", apiAuthGate);
      app.use("/api/workloads", router);
      await new Promise((resolve) => {
        server = app.listen(0, resolve);
      });
      base = `http://127.0.0.1:${server.address().port}/api/workloads`;
    });

    afterAll(async () => {
      if (server) server.close();
      if (pool) await pool.end();
    });

    const tokenFor = (school) =>
      nodeRequire("jsonwebtoken").sign(
        { uid: `u-${school}`, role: "school", school_id: school },
        TEST_SECRET,
        { expiresIn: "1h" },
      );
    const call = (method, path, school, body) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenFor(school)}`,
          "x-school-id": school,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const row = (id, term, start) => ({
      id,
      term,
      subject: "MATHEMATICS",
      gradeLevel: "Grade 1",
      startTime: start,
      endTime: "09:00",
      days: ["M"],
    });
    const save = (personId, school, rows, term) =>
      call("PUT", `/personnel/${personId}`, school, {
        workloadRows: rows,
        school_id: school,
        school_year: "SY 26-27",
        term,
      });
    const state = (personId, school, term) =>
      call(
        "GET",
        `/personnel/${personId}/state?schoolId=${school}&term=${term}`,
        school,
      );
    const count = async (personId, term) =>
      Number(
        (
          await pool.query(
            "SELECT COUNT(*) n FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term,'1st') = $2",
            [personId, term],
          )
        ).rows[0].n,
      );

    test("save stamps a version marker, and the state read returns the term rows with that same version", async () => {
      const saved = await (
        await save(
          "PER-A-1",
          "111111",
          [
            row("r-1", "1st", "08:00"),
            row("r-2", "1st", "09:00"),
            row("r-3", "2nd", "08:00"),
          ],
          "1st",
        )
      ).json();
      expect(saved.success).toBe(true);
      expect(typeof saved.workloadSavedAt).toBe("string");

      const res = await state("PER-A-1", "111111", "1st");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.version).toBe(saved.workloadSavedAt);
      expect(body.rows.map((r) => r.id).sort()).toEqual(["r-1", "r-2"]);
    });

    test("state read refuses another school and a teacher outside the named school", async () => {
      expect((await state("PER-A-1", "222222", "1st")).status).toBe(403); // other school's token naming its own id, teacher is not theirs
      expect(
        (
          await call(
            "GET",
            "/personnel/PER-A-1/state?schoolId=111111",
            "222222",
          )
        ).status,
      ).toBe(403); // token cannot name school 111111
      expect(
        (await call("GET", "/personnel/PER-A-1/state", "111111")).status,
      ).toBe(400); // schoolId required
    });

    test("clearing one teacher + term deletes the database rows and the payload copy, keeps other terms, and moves the version", async () => {
      const before = (await (await state("PER-A-1", "111111", "1st")).json())
        .version;
      const res = await call(
        "DELETE",
        "/personnel/PER-A-1/term/1st?schoolId=111111",
        "111111",
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.deleted).toBe(2);
      expect(await count("PER-A-1", "1st")).toBe(0);
      expect(await count("PER-A-1", "2nd")).toBe(1);

      const payload = (
        await pool.query(
          "SELECT raw_payload FROM esf7_personnel_profile WHERE id = 'PER-A-1'",
        )
      ).rows[0].raw_payload;
      expect(payload.workloadRows.map((r) => r.id)).toEqual(["r-3"]);
      expect(body.workloadSavedAt).not.toBe(before);
      expect(
        (await (await state("PER-A-1", "111111", "1st")).json()).version,
      ).toBe(body.workloadSavedAt);
    });

    test("clearing a teacher of another school is refused and deletes nothing", async () => {
      await save("PER-B-1", "222222", [row("b-1", "1st", "08:00")], "1st");
      const res = await call(
        "DELETE",
        "/personnel/PER-B-1/term/1st?schoolId=111111",
        "111111",
      );
      expect(res.status).toBe(403);
      expect(await count("PER-B-1", "1st")).toBe(1);
    });

    test("Clear All Teachers (one term): deletes that term for every teacher in the school only", async () => {
      await save(
        "PER-A-2",
        "111111",
        [row("a2-1", "1st", "08:00"), row("a2-2", "2nd", "08:00")],
        "1st",
      );
      await save(
        "PER-A-1",
        "111111",
        [row("a1-9", "1st", "10:00"), row("r-3", "2nd", "08:00")],
        "1st",
      );

      expect(
        (await call("DELETE", "/term-clear/school?schoolId=111111", "111111"))
          .status,
      ).toBe(400); // term required
      const res = await call(
        "DELETE",
        "/term-clear/school?schoolId=111111&term=1st",
        "111111",
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.deleted).toBeGreaterThanOrEqual(2);

      expect(await count("PER-A-1", "1st")).toBe(0);
      expect(await count("PER-A-2", "1st")).toBe(0);
      expect(await count("PER-A-1", "2nd")).toBe(1); // other term kept
      expect(await count("PER-A-2", "2nd")).toBe(1);
      expect(await count("PER-B-1", "1st")).toBe(1); // other school untouched

      const payloadA2 = (
        await pool.query(
          "SELECT raw_payload FROM esf7_personnel_profile WHERE id = 'PER-A-2'",
        )
      ).rows[0].raw_payload;
      expect(payloadA2.workloadRows.map((r) => r.id)).toEqual(["a2-2"]);
      // it can no longer reappear from the database on the next load
      expect(
        (await (await state("PER-A-2", "111111", "1st")).json()).rows,
      ).toEqual([]);
    });

    test("a school cannot clear another school's term", async () => {
      const res = await call(
        "DELETE",
        "/term-clear/school?schoolId=222222&term=1st",
        "111111",
      );
      expect(res.status).toBe(403);
      expect(await count("PER-B-1", "1st")).toBe(1);
    });

    test("single-row delete moves the version marker and removes the payload copy", async () => {
      await save(
        "PER-B-1",
        "222222",
        [row("b-1", "1st", "08:00"), row("b-2", "1st", "09:00")],
        "1st",
      );
      const res = await call("DELETE", "/b-2", "222222");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(typeof body.workloadSavedAt).toBe("string");
      expect(
        (await (await state("PER-B-1", "222222", "1st")).json()).rows.map(
          (r) => r.id,
        ),
      ).toEqual(["b-1"]);
    });

    describe("save is atomic and idempotent", () => {
      const ids = async (personId, term) =>
        (
          await pool.query(
            "SELECT id FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term,'1st') = $2 ORDER BY id",
            [personId, term],
          )
        ).rows.map((r) => r.id);

      test("sending the same save twice (a retry after a lost response) leaves exactly the same rows, no duplicates", async () => {
        const rows = [
          row("idem-1", "1st", "08:00"),
          row("idem-2", "1st", "09:00"),
        ];
        expect((await save("PER-A-2", "111111", rows, "1st")).status).toBe(200);
        expect((await save("PER-A-2", "111111", rows, "1st")).status).toBe(200);
        expect(await ids("PER-A-2", "1st")).toEqual(["idem-1", "idem-2"]);
      });

      test("rows without a stable id are replaced, not piled up, when the save is retried", async () => {
        const rows = [
          { ...row("new-1", "1st", "08:00") },
          { ...row("new-2", "1st", "09:00") },
        ];
        await save("PER-A-2", "111111", rows, "1st");
        await save("PER-A-2", "111111", rows, "1st");
        expect(await count("PER-A-2", "1st")).toBe(2);
      });

      test("removing the last block of a term deletes it in the database (an empty term is still replaced)", async () => {
        await save(
          "PER-A-2",
          "111111",
          [row("t1-a", "1st", "08:00"), row("t2-a", "2nd", "08:00")],
          "1st",
        );
        // the editor removed the only 1st-term block; the payload now carries only the 2nd-term block
        const res = await save(
          "PER-A-2",
          "111111",
          [row("t2-a", "2nd", "08:00")],
          "1st",
        );
        expect(res.status).toBe(200);
        expect(await count("PER-A-2", "1st")).toBe(0);
        expect(await count("PER-A-2", "2nd")).toBe(1);
        expect(
          (await (await state("PER-A-2", "111111", "1st")).json()).rows,
        ).toEqual([]);
      });

      test("a repeated block id inside one payload does not fail the save or create two rows", async () => {
        const res = await save(
          "PER-A-2",
          "111111",
          [
            row("dup-1", "1st", "08:00"),
            row("dup-1", "1st", "08:00"),
            row("dup-2", "1st", "10:00"),
          ],
          "1st",
        );
        expect(res.status).toBe(200);
        expect(await ids("PER-A-2", "1st")).toEqual(["dup-1", "dup-2"]);
      });

      test("legacy rows saved without a term are replaced like 1st-term rows", async () => {
        await pool.query(
          "INSERT INTO esf7_workload_rows (id, personnel_id, school_id, school_year, subject, term) VALUES ('legacy-1', 'PER-A-2', '111111', 'SY 26-27', 'MATHEMATICS', NULL)",
        );
        await save(
          "PER-A-2",
          "111111",
          [row("fresh-1", "1st", "08:00")],
          "1st",
        );
        expect(await ids("PER-A-2", "1st")).toEqual(["fresh-1"]);
      });

      test("simultaneous saves (double submit / two browsers) are serialized: all succeed and the result is one complete set", async () => {
        const results = await Promise.all(
          Array.from({ length: 6 }, () =>
            save(
              "PER-A-2",
              "111111",
              [row("race-1", "1st", "08:00"), row("race-2", "1st", "09:00")],
              "1st",
            ),
          ),
        );
        expect(results.map((r) => r.status)).toEqual([
          200, 200, 200, 200, 200, 200,
        ]);
        expect(await ids("PER-A-2", "1st")).toEqual(["race-1", "race-2"]);
      });

      test("the response lists every row that was written, so the client can verify it against what it sent", async () => {
        const sent = [
          row("v-1", "1st", "08:00"),
          row("v-2", "1st", "09:00"),
          row("v-3", "2nd", "08:00"),
        ];
        const body = await (
          await save("PER-A-2", "111111", sent, "1st")
        ).json();
        expect(body.data.map((r) => r.id).sort()).toEqual([
          "v-1",
          "v-2",
          "v-3",
        ]);
        expect(body.data.find((r) => r.id === "v-2")).toMatchObject({
          term: "1st",
          subject: "MATHEMATICS",
          startTime: "09:00",
          endTime: "09:00",
        });
      });
    });
  },
);
