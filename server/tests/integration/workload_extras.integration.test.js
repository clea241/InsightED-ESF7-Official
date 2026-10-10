// esf7_workload_rows stores typed columns + a slim `extras` JSONB (not a copy of the request body in raw_payload).
// Real PostgreSQL; requires TEST_DATABASE_URL (see helpers.mjs).
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
    days JSONB DEFAULT '["M","T","W","TH","F"]'::jsonb, term TEXT DEFAULT '1st', extras JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE esf7_shs_workload_rows (
    id VARCHAR(80) PRIMARY KEY, personnel_id VARCHAR(50) NOT NULL REFERENCES esf7_personnel_profile(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL, term TEXT NOT NULL DEFAULT '1st', subject TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

describe.skipIf(!enabled)(
  "workload rows store typed columns + extras (real PostgreSQL)",
  () => {
    let pool;
    let server;
    let base;
    const school = "111111";

    beforeAll(async () => {
      pointServerAtTestDatabase();
      const { Pool } = nodeRequire("pg");
      pool = new Pool({ connectionString: TEST_DATABASE_URL });
      await pool.query(TABLES_SQL);
      await pool.query(
        `INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name, raw_payload)
       VALUES ('PER-X-1', 'PRN-X-1', $1, 'SY 26-27', 'T', 'X', '{"assignedGradeLevels":["Grade 1"],"type":"teaching"}'::jsonb)`,
        [school],
      );
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

    const call = (method, path, body) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${nodeRequire("jsonwebtoken").sign({ uid: "u1", role: "school", school_id: school }, TEST_SECRET, { expiresIn: "1h" })}`,
          "x-school-id": school,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const dbRow = async (id) =>
      (await pool.query("SELECT * FROM esf7_workload_rows WHERE id = $1", [id]))
        .rows[0];

    test("POST / keeps typed columns and only payload-only keys in extras; the response keeps its keys", async () => {
      const res = await call("POST", "/", {
        id: "p-1",
        personnel_id: "PER-X-1",
        school_id: school,
        school_year: "SY 26-27",
        gradeLevel: "Grade 1",
        sectionName: "Rose",
        subject: "MATHEMATICS",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M", "W"],
        task: "Advisory",
        rowType: "teaching",
        minsPerDay: 60,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.task).toBe("Advisory");
      expect(body.subject_name).toBe("MATHEMATICS");
      expect(body.gradeLevel).toBe("Grade 1");
      const r = await dbRow("p-1");
      expect(r.raw_payload).toEqual({});
      expect(r.extras).toEqual({
        task: "Advisory",
        rowType: "teaching",
        minsPerDay: 60,
      });
      expect(r.grade_level).toBe("Grade 1");
      expect(r.start_time).toBe("08:00:00");
    });

    test("bulk save writes extras, never the whole row, and never nests a rawPayload echo", async () => {
      const res = await call("PUT", "/personnel/PER-X-1", {
        workloadRows: [
          {
            id: "b-1",
            subject: "SCIENCE",
            gradeLevel: "Grade 2",
            sectionName: "Lily",
            startTime: "10:00",
            endTime: "11:00",
            days: ["T"],
            daySchedule: "Tue",
            category: "core",
            rawPayload: { old: "echo" },
          },
        ],
        school_id: school,
        school_year: "SY 26-27",
        term: "1st",
      });
      expect(res.status).toBe(200);
      const r = (
        await pool.query(
          "SELECT * FROM esf7_workload_rows WHERE personnel_id = 'PER-X-1' AND subject = 'SCIENCE'",
        )
      ).rows[0];
      expect(r.raw_payload).toEqual({});
      expect(r.extras).toEqual({ daySchedule: "Tue", category: "core" });
      expect(r.subject).toBe("SCIENCE");
    });

    test("PUT /:id on a legacy row folds the old payload into extras and clears raw_payload", async () => {
      await pool.query(
        `INSERT INTO esf7_workload_rows (id, personnel_id, school_id, school_year, grade_level, subject, start_time, end_time, raw_payload)
       VALUES ('legacy-9', 'PER-X-1', $1, 'SY 26-27', 'Grade 3', 'ENGLISH', '07:00', '08:00',
               '{"id":"legacy-9","subject":"ENGLISH","gradeLevel":"Grade 3","startTime":"07:00","task":"Reading","trackStrand":"STEM","sectionName":"Daisy"}'::jsonb)`,
        [school],
      );
      const res = await call("PUT", "/legacy-9", { subject: "FILIPINO" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.task).toBe("Reading");
      const r = await dbRow("legacy-9");
      expect(r.raw_payload).toEqual({});
      expect(r.subject).toBe("FILIPINO");
      expect(r.section_name).toBe("Daisy"); // empty typed column filled from the legacy payload
      // subject / gradeLevel / sectionName live in typed columns now, so only the payload-only keys remain
      expect(r.extras).toEqual({ task: "Reading", trackStrand: "STEM" });
    });

    test("GET / returns rows including payload-only keys, paged, without raw_payload", async () => {
      const res = await call("GET", "/?limit=2");
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows.length).toBeLessThanOrEqual(2);
      expect(
        rows.some((x) => "task" in x || "category" in x || "daySchedule" in x),
      ).toBe(true);
      expect(res.headers.get("x-page-limit")).toBe("2");
    });

    test("after raw_payload is dropped (contract step) POST, bulk save, PUT and GET still work", async () => {
      await pool.query(
        "ALTER TABLE esf7_workload_rows DROP COLUMN raw_payload",
      );
      const post = await call("POST", "/", {
        id: "c-1",
        personnel_id: "PER-X-1",
        school_id: school,
        school_year: "SY 26-27",
        subject: "ARTS",
        task: "Club",
      });
      expect(post.status).toBe(201);
      const bulk = await call("PUT", "/personnel/PER-X-1", {
        workloadRows: [
          {
            id: "c-2",
            subject: "MAPEH",
            gradeLevel: "Grade 4",
            startTime: "07:00",
            endTime: "08:00",
            category: "x",
          },
        ],
        school_id: school,
        school_year: "SY 26-27",
        term: "1st",
      });
      expect(bulk.status).toBe(200);
      const saved = (
        await pool.query(
          "SELECT id FROM esf7_workload_rows WHERE subject = 'MAPEH'",
        )
      ).rows[0].id;
      const put = await call("PUT", `/${saved}`, {
        subject: "MUSIC",
        task: "Choir",
      });
      expect(put.status).toBe(200);
      expect((await put.json()).task).toBe("Choir");
      const list = await call("GET", "/?limit=5");
      expect(list.status).toBe(200);
    });
  },
);
