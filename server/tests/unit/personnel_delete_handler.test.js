import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Fake `db` with the REAL export shape: query + getClient (+ pools), NOT a Pool itself.
const makeDb = () => {
  const calls = { sql: [], released: 0, clientsOpened: 0 };
  const client = {
    query: async (sql) => {
      calls.sql.push(String(sql).trim().split(/\s+/).slice(0, 3).join(" "));
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      calls.released++;
    },
  };
  const pool = { connect: async () => client };
  const db = {
    query: async () => ({ rows: [] }),
    getClient: async () => {
      calls.clientsOpened++;
      return client;
    },
    getPool: () => pool,
    getStagingPool: () => pool,
    getProdPool: () => pool,
  };
  return { db, calls };
};

const loadRouter = (db) => {
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

const runDelete = (router, id) =>
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
        method: "DELETE",
        url: `/${id}`,
        params: {},
        query: {},
        body: {},
        headers: {},
      },
      res,
      () => resolve({ status: 404, body: null }),
    );
  });

describe("DELETE /api/personnel/:id handler", () => {
  let ctx;
  beforeEach(() => {
    ctx = makeDb();
  });

  it("succeeds with the real db export shape and releases every client it opens", async () => {
    const router = loadRouter(ctx.db);
    const r = await runDelete(router, "176535");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(ctx.calls.clientsOpened).toBe(1);
    expect(ctx.calls.released).toBe(1);
    expect(ctx.calls.sql).toContain("BEGIN");
    expect(ctx.calls.sql).toContain("COMMIT");
  });
});

describe("DELETE /api/personnel/:id speed and atomicity", () => {
  it("removes children and parent in a single statement (few round trips, no savepoints)", async () => {
    const ctx = makeDb();
    const orig = ctx.db.getClient;
    const seen = [];
    ctx.db.getClient = async () => {
      const c = await orig();
      const q = c.query;
      c.query = async (sql, p) => {
        seen.push(String(sql).trim().replace(/\s+/g, " "));
        if (/information_schema\.columns/.test(String(sql))) {
          return {
            rows: [
              {
                table_name: "esf7_personnel_ld_trainings",
                column_name: "personnel_id",
              },
              {
                table_name: "esf7_workload_transfer",
                column_name: "absent_personnel_id",
              },
            ],
          };
        }
        return q(sql, p);
      };
      return c;
    };
    const router = loadRouter(ctx.db);
    const r = await runDelete(router, "176535");
    expect(r.status).toBe(200);
    const big = seen.find((s) => /DELETE FROM esf7_personnel_profile/.test(s));
    expect(big).toBeTruthy();
    expect(big).toMatch(/DELETE FROM "esf7_personnel_ld_trainings"/);
    expect(big).toMatch(/UPDATE "esf7_workload_transfer"/);
    expect(seen.some((s) => /SAVEPOINT/.test(s))).toBe(false);
    expect(seen.length).toBeLessThanOrEqual(6);
    expect(seen[seen.length - 1]).toBe("COMMIT");
  });
});
