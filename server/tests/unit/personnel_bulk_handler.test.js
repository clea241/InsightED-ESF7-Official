import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const makeDb = ({ locked = true, existing = [], failOn = null } = {}) => {
  const log = { sql: [], released: 0, clients: 0 };
  const client = {
    query: async (sql) => {
      const t = String(sql).trim().replace(/\s+/g, " ");
      log.sql.push(t);
      if (failOn && t.includes(failOn)) throw new Error("boom");
      if (t.startsWith("SELECT pg_try_advisory_xact_lock"))
        return { rows: [{ locked }] };
      if (t.includes("FROM esf7_personnel_profile WHERE school_id"))
        return { rows: existing };
      if (t.includes("MAX(id::bigint)"))
        return { rows: [{ max_id: "843200" }] };
      return { rows: [], rowCount: 1 };
    },
    release: () => {
      log.released++;
    },
  };
  return {
    log,
    db: {
      getClient: async () => {
        log.clients++;
        return client;
      },
      // read-back used to verify the write: every id that was sent is "stored"
      query: async (sql, params) =>
        /WHERE id = ANY/.test(String(sql))
          ? { rows: (params[0] || []).map((id) => ({ id })) }
          : { rows: [] },
    },
  };
};

const load = (db) => {
  const dbPath = require.resolve("../../db");
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: db,
  };
  const rPath = require.resolve("../../controllers/personnel/roster.js");
  delete require.cache[rPath];
  return require(rPath);
};

const post = (router, body) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.headersSent = true;
        resolve({ status: this.statusCode, body: b });
      },
    };
    router.handle(
      {
        method: "POST",
        url: "/bulk",
        params: {},
        query: {},
        headers: {},
        auth: { schoolId: "300488" },
        body,
      },
      res,
      () => resolve({ status: 404 }),
    );
  });

const people = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(1000 + i),
    firstName: `FIRST${i}`,
    lastName: `LAST${i}`,
    position: "TEACHER I",
  }));

describe("POST /api/personnel/bulk", () => {
  it("uses set-based statements, not one query per person", async () => {
    const { db, log } = makeDb();
    const r = await post(load(db), {
      personnelList: people(84),
      schoolYear: "SY 26-27",
    });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(84);
    // 84 people = 2 profile chunks + 2 employment chunks (50/chunk), NOT 84 x 3 queries.
    const inserts = log.sql.filter((s) => s.startsWith("INSERT INTO"));
    expect(inserts).toHaveLength(4);
    expect(log.sql.length).toBeLessThan(15);
    expect(log.sql).toContain("COMMIT");
    expect(log.released).toBe(1);
  });

  it("skips unchanged rows in SQL instead of rewriting them", async () => {
    const { db, log } = makeDb();
    await post(load(db), { personnelList: people(2) });
    const profileInsert = log.sql.find((s) =>
      s.startsWith("INSERT INTO esf7_personnel_profile"),
    );
    expect(profileInsert).toMatch(/IS DISTINCT FROM/);
  });

  it("rejects a concurrent duplicate save for the same school + year", async () => {
    const { db, log } = makeDb({ locked: false });
    const r = await post(load(db), { personnelList: people(3) });
    expect(r.status).toBe(409);
    expect(log.sql.some((s) => s.startsWith("INSERT INTO"))).toBe(false);
    expect(log.sql).toContain("ROLLBACK");
    expect(log.released).toBe(1);
  });

  it("rolls back cleanly and releases the client when a write fails", async () => {
    const { db, log } = makeDb({
      failOn: "INSERT INTO esf7_personnel_employment",
    });
    const r = await post(load(db), { personnelList: people(3) });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("boom");
    expect(log.sql).toContain("ROLLBACK");
    expect(log.sql).not.toContain("COMMIT");
    expect(log.released).toBe(1);
  });

  it("writes a person listed twice only once (no ON CONFLICT double-hit)", async () => {
    const { db, log } = makeDb();
    const dup = people(1).concat(people(1));
    const r = await post(load(db), { personnelList: dup });
    expect(r.body.count).toBe(1);
    expect(log.released).toBe(1);
  });
});
