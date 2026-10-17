import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const registry = require("../../controllers/room_profiling/upsertRegistry.js");

describe("upsert registry: one source of truth", () => {
  it("registers the L&D trainings table (the name from the error) with the exact spelling used in the schema", () => {
    expect(registry.UPSERT_TABLES).toContain("esf7_personnel_ld_trainings");
    const schema = read("../../schema.sql");
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS esf7_personnel_ld_trainings/,
    );
  });

  it("every table the accept code writes is registered (so a new table can't be forgotten again)", () => {
    const src = read("../../controllers/room_profiling/index.js");
    const used = [
      ...src.matchAll(/executeMultiRowUpsert\(\s*client,\s*"([a-z0-9_]+)"/g),
    ].map((m) => m[1]);
    expect(used.length).toBeGreaterThanOrEqual(7);
    for (const t of used) {
      expect(registry.UPSERT_TABLES, t).toContain(t);
    }
  });

  it("the helper no longer carries its own hand-written table list", () => {
    const src = read("../../controllers/room_profiling/index.js");
    const i = src.indexOf("async function executeMultiRowUpsert");
    const body = src.slice(i, i + 2200);
    expect(body).toMatch(/buildMultiRowUpsertSql\(/);
    expect(body).not.toMatch(/case "esf7_/);
  });

  it("builds the statement for every registered table and rejects anything else", () => {
    for (const t of registry.UPSERT_TABLES) {
      const sql = registry.buildMultiRowUpsertSql({
        tableName: t,
        columns: ["id", "personnel_id"],
        valueClauses: ["($1, $2)"],
        conflictTarget: "(id)",
        doClause: "DO NOTHING",
        retClause: "",
      });
      expect(sql).toMatch(
        new RegExp(`^INSERT INTO ${t} \\(id, personnel_id\\)`),
      );
    }
    expect(() =>
      registry.buildMultiRowUpsertSql({
        tableName: "esf7_not_registered",
        columns: ["id"],
        valueClauses: ["($1)"],
        conflictTarget: "(id)",
        doClause: "DO NOTHING",
        retClause: "",
      }),
    ).toThrow(
      /Unsupported table for executeMultiRowUpsert: esf7_not_registered/,
    );
    expect(() =>
      registry.buildMultiRowUpsertSql({
        tableName: "esf7_personnel_profile",
        columns: ["id; DROP TABLE x"],
        valueClauses: ["($1)"],
        conflictTarget: "(id)",
        doClause: "DO NOTHING",
        retClause: "",
      }),
    ).toThrow(/Invalid column name/);
  });
});

describe("startup / deploy-time check", () => {
  it("names every pipeline table that is missing in the database", async () => {
    const present = new Set(registry.PIPELINE_TABLES);
    present.delete("esf7_personnel_ld_trainings");
    const problems = await registry.findMergePipelineProblems(
      async (_sql, [t]) => ({
        rows: [{ t: present.has(t) ? t : null }],
      }),
    );
    expect(problems).toEqual([
      "table missing in the database: esf7_personnel_ld_trainings",
    ]);
  });

  it("reports nothing when every table exists", async () => {
    expect(
      await registry.findMergePipelineProblems(async (_s, [t]) => ({
        rows: [{ t }],
      })),
    ).toEqual([]);
  });

  it("is wired into server startup and available as a deploy script that exits non-zero", () => {
    expect(read("../../server.js")).toMatch(/findMergePipelineProblems/);
    const script = read("../../scripts/check_merge_pipeline.js");
    expect(script).toMatch(/process\.exitCode = 2/);
  });
});

// ---- the accept route, against a fake database that records its statements -------------------------------------
const makeDb = ({ failOn = null, dropTrainingCount = false } = {}) => {
  const log = [];
  const state = { released: 0 };
  const client = {
    query: async (sql, params = []) => {
      const t = String(sql).trim().replace(/\s+/g, " ");
      log.push(t);
      if (failOn && t.includes(failOn))
        throw new Error(`relation "${failOn}" does not exist`);
      // verification read-backs: answer with what the statements above "wrote"
      if (/^SELECT id FROM esf7_personnel_profile WHERE id = ANY/.test(t))
        return { rows: params[0].map((id) => ({ id })) };
      if (
        /^SELECT personnel_id FROM esf7_personnel_(employment|learning_areas) WHERE/.test(
          t,
        )
      )
        return { rows: params[0].map((personnel_id) => ({ personnel_id })) };
      if (/^SELECT personnel_id, COUNT/.test(t))
        return dropTrainingCount
          ? { rows: [] }
          : { rows: params[0].map((personnel_id) => ({ personnel_id, n: 1 })) };
      if (/^SELECT id FROM esf7_personnel_submission_archive WHERE/.test(t))
        return { rows: params[0].map((id) => ({ id })) };
      return { rows: [], rowCount: 1 };
    },
    release: () => {
      state.released += 1;
    },
  };
  return {
    log,
    state,
    db: {
      getClient: async () => client,
      query: async () => ({ rows: [] }),
    },
  };
};

const loadRouter = (db) => {
  const mock = (p, exports) => {
    const f = require.resolve(p);
    require.cache[f] = { id: f, filename: f, loaded: true, exports };
  };
  mock("../../db", db);
  mock("../../services/cacheService", {
    delPattern: async () => {},
    get: async () => null,
    set: async () => {},
  });
  const rPath = require.resolve("../../controllers/room_profiling/index.js");
  delete require.cache[rPath];
  return require(rPath);
};

const post = (router, body) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        resolve({ status: this.statusCode, body: b });
      },
    };
    router.handle(
      {
        method: "POST",
        url: "/accept",
        params: {},
        query: {},
        body,
        headers: {},
        ip: "127.0.0.1",
      },
      res,
      (err) => resolve({ status: err?.status || 500, error: err }),
    );
  });

const submission = (withTraining) => ({
  schoolId: "300488",
  submission: {
    submissionId: "sub-1001",
    personnelId: "1001",
    profileData: {
      id: "1001",
      firstName: "MAEROSE",
      lastName: "ACUPIDO",
      position: "TEACHER I",
      birthdate: "1990-01-02",
      ...(withTraining
        ? {
            neapTrainingRows: [
              {
                title: "Reading",
                conductor: "NEAP",
                startDate: "2026-01-05",
                endDate: "2026-01-07",
                days: 3,
                totalHours: 24,
              },
            ],
          }
        : {}),
    },
  },
});

describe("Approve & Merge is all-or-nothing and verified before it commits", () => {
  it("a submission with L&D trainings is saved and committed (the case that failed)", async () => {
    const { db, log, state } = makeDb();
    const r = await post(loadRouter(db), submission(true));
    expect(r.error).toBeUndefined();
    expect(r.body.success).toBe(true);
    expect(
      log.some((s) => s.startsWith("INSERT INTO esf7_personnel_ld_trainings")),
    ).toBe(true);
    expect(log).toContain("COMMIT");
    expect(log).not.toContain("ROLLBACK");
    // the whole L&D row is written, not just title and hours
    expect(
      log.find((s) => s.startsWith("INSERT INTO esf7_personnel_ld_trainings")),
    ).toContain("conductor");
    expect(state.released).toBe(1);
  });

  it("if any table write fails: everything rolls back, nothing commits, the error is passed on verbatim", async () => {
    const { db, log, state } = makeDb({
      failOn: "INSERT INTO esf7_personnel_ld_trainings",
    });
    const r = await post(loadRouter(db), submission(true));
    expect(r.body?.success).toBeUndefined();
    expect(r.error.message).toMatch(/esf7_personnel_ld_trainings/);
    expect(log).toContain("ROLLBACK");
    expect(log).not.toContain("COMMIT");
    // the queue status is only moved to APPROVED by a transaction that committed
    const rolledBackAt = log.indexOf("ROLLBACK");
    expect(
      log
        .slice(rolledBackAt + 1)
        .some((s) => /UPDATE esf7_personnel_submission/.test(s)),
    ).toBe(false);
    expect(state.released).toBe(1);
  });

  it("if the read-back does not match what was written, it rolls back instead of committing", async () => {
    const { db, log } = makeDb({ dropTrainingCount: true });
    const r = await post(loadRouter(db), submission(true));
    expect(r.body?.success).toBeUndefined();
    expect(r.error.message).toMatch(
      /Verification failed after saving L&D trainings/,
    );
    expect(log).toContain("ROLLBACK");
    expect(log).not.toContain("COMMIT");
  });

  it("verification happens before COMMIT, inside the transaction", () => {
    const src = read("../../controllers/room_profiling/index.js");
    const v = src.indexOf(
      "G. Read everything back inside the SAME transaction",
    );
    const commit = src.indexOf('await client.query("COMMIT");', v);
    expect(v).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(v);
  });
});

describe("client: success only after the confirmed response; failure banner clears on a successful retry", () => {
  const qr = read("../../../client/src/pages/RoomQR.jsx");
  it("a failed accept throws before any queue/state change", () => {
    const i = qr.indexOf("const applyAcceptResult");
    const body = qr.slice(i, i + 700);
    expect(body).toMatch(/!res \|\| !res\.success \|\| saved\.length === 0/);
    expect(body).toMatch(/throw new Error/);
  });
  it("every handler clears the previous banner when a new attempt starts", () => {
    for (const fn of [
      "const handleCommitAllSubmissions",
      "const handleCommitSingle",
      "const handleCommitReview",
    ]) {
      const i = qr.indexOf(fn);
      expect(qr.slice(i, i + 700), fn).toMatch(/setAcceptError\(null\)/);
    }
  });
});
