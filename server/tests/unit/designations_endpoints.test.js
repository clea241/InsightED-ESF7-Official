import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const makeDb = ({ personSchool = "300488" } = {}) => {
  const log = { sql: [], params: [], released: 0 };
  const client = {
    query: async (sql, params) => {
      const t = String(sql).trim().replace(/\s+/g, " ");
      log.sql.push(t.slice(0, 60));
      log.params.push(params);
      if (/INSERT INTO esf7_school_designation_na/.test(t))
        log.naKeys = params[2];
      if (/FROM esf7_personnel_profile/.test(t))
        return { rows: [{ id: "PRN-1", school_id: personSchool }] };
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      log.released++;
    },
  };
  return {
    log,
    db: {
      query: async (sql, params) =>
        /SELECT designation_key FROM esf7_school_designation_na/.test(
          String(sql),
        )
          ? { rows: (log.naKeys || []).map((k) => ({ designation_key: k })) }
          : client.query(sql, params),
      getClient: async () => client,
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
  for (const m of [
    "../../controllers/personnel_designations/index.js",
    "../../controllers/personnel/profile.js",
  ]) {
    delete require.cache[require.resolve(m)];
  }
  return require("../../controllers/personnel_designations/index.js");
};

const call = (router, method, url, { body = {}, auth } = {}) =>
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
        method,
        url,
        params: {},
        query: Object.fromEntries(new URL(url, "http://x").searchParams),
        body,
        headers: {},
        auth,
      },
      res,
      () => resolve({ status: 404 }),
    );
  });

describe("designations endpoints", () => {
  it("PUT /na replaces the N/A set in one transaction and releases the client", async () => {
    const { db, log } = makeDb();
    const r = await call(load(db), "PUT", "/na", {
      body: { naMap: { guidance: true, ash: false }, schoolYear: "SY 26-27" },
      auth: { schoolId: "300488" },
    });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(log.sql).toContain("BEGIN");
    expect(
      log.sql.some((s) =>
        s.startsWith("DELETE FROM esf7_school_designation_na"),
      ),
    ).toBe(true);
    expect(log.sql).toContain("COMMIT");
    expect(log.released).toBe(1);
  });

  it("PUT /personnel/:id with no designations deletes the person's rows (remove)", async () => {
    const { db, log } = makeDb();
    const r = await call(load(db), "PUT", "/personnel/PRN-1", {
      body: { designation: "", designations: [] },
      auth: { schoolId: "300488" },
    });
    expect(r.status).toBe(200);
    expect(
      log.sql.some((s) =>
        s.startsWith("DELETE FROM esf7_personnel_designations"),
      ),
    ).toBe(true);
    expect(log.sql).toContain("COMMIT");
    expect(log.released).toBe(1);
  });

  it("PUT /personnel/:id refuses a person from another school", async () => {
    const { db, log } = makeDb({ personSchool: "111111" });
    const r = await call(load(db), "PUT", "/personnel/PRN-1", {
      body: { designations: ["X"] },
      auth: { schoolId: "300488" },
    });
    expect(r.status).toBe(403);
    expect(log.released).toBe(1);
  });
});
