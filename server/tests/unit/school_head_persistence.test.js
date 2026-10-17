import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// ---- A small stateful stand-in for PostgreSQL, faithful to the one behaviour that mattered here ------------
// A statement that fails inside a transaction ABORTS it: every later statement errors until ROLLBACK TO SAVEPOINT,
// and a plain COMMIT then silently ends as a ROLLBACK (no error). That is how the old route "saved" nothing.
const makeDb = (opts = {}) => {
  const state = {
    rows: [
      {
        id: "1001",
        legacy_id: "1001",
        prn: "PRN-1",
        school_id: "300488",
        is_school_head: true,
        is_main_sh: true,
        school_head_level: null,
      }, // VALENTIN (current head)
      {
        id: "1002",
        legacy_id: "1002",
        prn: "PRN-2",
        school_id: "300488",
        is_school_head: false,
        is_main_sh: false,
        school_head_level: null,
      }, // CARMELA
      {
        id: "9001",
        legacy_id: "9001",
        prn: "PRN-9",
        school_id: "111111",
        is_school_head: false,
        is_main_sh: false,
        school_head_level: null,
      }, // another school
    ],
    released: 0,
  };
  let snapshot = null;
  let aborted = false;
  const clone = (r) => r.map((x) => ({ ...x }));
  const inSchool = (r, pair) => pair.includes(r.school_id);

  const client = {
    query: async (sql, params = []) => {
      const t = String(sql).trim().replace(/\s+/g, " ");
      if (t === "BEGIN") {
        snapshot = clone(state.rows);
        aborted = false;
        return {};
      }
      if (t === "COMMIT") {
        if (aborted)
          state.rows = snapshot; // PostgreSQL: COMMIT of an aborted transaction is a ROLLBACK
        else if (opts.dropOnCommit) state.rows = snapshot; // simulate a write that never became durable
        snapshot = null;
        aborted = false;
        return {};
      }
      if (t === "ROLLBACK") {
        if (snapshot) state.rows = snapshot;
        snapshot = null;
        aborted = false;
        return {};
      }
      if (/^SAVEPOINT|^RELEASE SAVEPOINT/.test(t)) return {};
      if (/^ROLLBACK TO SAVEPOINT/.test(t)) {
        aborted = false;
        return {};
      }
      if (aborted)
        throw new Error(
          "current transaction is aborted, commands ignored until end of transaction block",
        );

      if (t.startsWith("SELECT pg_try_advisory_xact_lock"))
        return { rows: [{ locked: opts.locked !== false }] };

      if (
        t.startsWith("SELECT id, legacy_id, prn FROM esf7_personnel_profile")
      ) {
        const [pair, wanted] = params;
        return {
          rows: state.rows.filter(
            (r) =>
              inSchool(r, pair) &&
              (wanted.includes(r.id) ||
                wanted.includes(r.legacy_id) ||
                wanted.includes(r.prn)),
          ),
        };
      }
      if (t.startsWith("UPDATE esf7_personnel_profile")) {
        if (opts.failProfileUpdate) throw new Error("deadlock detected");
        if (/SET is_school_head = TRUE/.test(t)) {
          const [id, isMain, level] = params;
          const row = state.rows.find((r) => r.id === id);
          if (opts.zeroRowUpdate || !row) return { rowCount: 0 };
          Object.assign(row, {
            is_school_head: true,
            is_main_sh: isMain,
            school_head_level: level,
          });
          return { rowCount: 1 };
        }
        if (/SET is_school_head = FALSE/.test(t) && /NOT \(id = ANY/.test(t)) {
          const [pair, keep] = params;
          state.rows
            .filter(
              (r) =>
                inSchool(r, pair) &&
                (r.is_school_head || r.is_main_sh) &&
                !keep.includes(r.id),
            )
            .forEach((r) =>
              Object.assign(r, {
                is_school_head: false,
                is_main_sh: false,
                school_head_level: null,
              }),
            );
          return {};
        }
        if (/SET is_main_sh = FALSE/.test(t)) {
          const [pair, keep] = params;
          state.rows
            .filter(
              (r) => inSchool(r, pair) && r.is_main_sh && !keep.includes(r.id),
            )
            .forEach((r) => (r.is_main_sh = false));
          return {};
        }
        if (/SET is_school_head = FALSE/.test(t)) {
          const [ids] = params;
          state.rows
            .filter((r) => ids.includes(r.id))
            .forEach((r) =>
              Object.assign(r, {
                is_school_head: false,
                is_main_sh: false,
                school_head_level: null,
              }),
            );
          return {};
        }
      }
      if (/esf7_personnel_node_status|esf7_school_profile/.test(t)) {
        if (opts.sideTablesBroken) {
          aborted = true; // the failed statement poisons the transaction, exactly like PostgreSQL
          throw new Error('column "is_school_head" does not exist');
        }
        return {};
      }
      throw new Error("unexpected SQL in test: " + t.slice(0, 80));
    },
    release: () => {
      state.released += 1;
    },
  };

  const db = {
    getClient: async () => client,
    // what a page load reads
    query: async (sql, params = []) => {
      const t = String(sql).trim().replace(/\s+/g, " ");
      if (/is_school_head = TRUE/.test(t)) {
        const [pair] = params;
        return {
          rows: state.rows
            .filter((r) => inSchool(r, pair) && r.is_school_head)
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .map((r) => ({
              id: r.id,
              is_main_sh: r.is_main_sh,
              school_head_level: r.school_head_level,
            })),
        };
      }
      return { rows: [] };
    },
  };
  return { db, state };
};

const loadRouter = (db) => {
  const dbPath = require.resolve("../../db");
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: db,
  };
  for (const m of [
    "../../controllers/personnel/schoolHeads.js",
    "../../controllers/personnel/roster.js",
  ]) {
    delete require.cache[require.resolve(m)];
  }
  return require("../../controllers/personnel/roster.js");
};

const call = (router, method, url, body) =>
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
        query: {},
        body,
        headers: {},
        auth: { schoolId: "300488" },
      },
      res,
      () => resolve({ status: 404, body: null }),
    );
  });

// A page load: read the heads from the database, exactly as the roster's card does.
const reload = async (db) =>
  (
    await db.query("SELECT ... is_school_head = TRUE", [
      ["300488", "SCH-300488"],
    ])
  ).rows.map((r) => r.id);

const changeHead = (router, id = "1002") =>
  call(router, "PUT", "/school-head-config", {
    hasMultipleHeads: false,
    mainHeadId: id,
    assignments: { All: id },
  });

describe("Change School Head: persisted, verified, and still there after a reload", () => {
  it("saves the new head, unsets the previous one in the same write, and a reload shows the new head", async () => {
    const { db, state } = makeDb();
    const r = await changeHead(loadRouter(db));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.heads).toEqual([{ id: "1002", isMain: true, level: null }]);
    expect(await reload(db)).toEqual(["1002"]); // CARMELA, not VALENTIN
    expect(state.rows.find((x) => x.id === "1001").is_school_head).toBe(false);
    expect(state.released).toBe(1);
  });

  it("survives a broken optional table: the failure can no longer silently roll the whole change back", async () => {
    const { db } = makeDb({ sideTablesBroken: true });
    const r = await changeHead(loadRouter(db));
    expect(r.status).toBe(200);
    expect(await reload(db)).toEqual(["1002"]);
  });

  it("is idempotent: saving the same head twice leaves exactly one head", async () => {
    const { db } = makeDb();
    const router = loadRouter(db);
    await changeHead(router);
    const again = await changeHead(router);
    expect(again.status).toBe(200);
    expect(await reload(db)).toEqual(["1002"]);
  });

  it("a write that fails reports the error and keeps the previous head (no success)", async () => {
    const { db, state } = makeDb({ failProfileUpdate: true });
    const r = await changeHead(loadRouter(db));
    expect(r.status).toBe(500);
    expect(r.body.success).toBeUndefined();
    expect(r.body.error).toMatch(/deadlock/);
    expect(await reload(db)).toEqual(["1001"]); // VALENTIN still the head
    expect(state.released).toBe(1);
  });

  it("an UPDATE that touches no row is an error, not a silent success", async () => {
    const { db } = makeDb({ zeroRowUpdate: true });
    const r = await changeHead(loadRouter(db));
    expect(r.status).toBe(500);
    expect(r.body.success).toBeUndefined();
    expect(await reload(db)).toEqual(["1001"]);
  });

  it("a change that did not actually become durable is caught by the read-back and never reported as saved", async () => {
    const { db } = makeDb({ dropOnCommit: true });
    const r = await changeHead(loadRouter(db));
    expect(r.status).toBe(500);
    expect(r.body.success).toBeUndefined();
    expect(r.body.error).toMatch(/not stored as requested/);
    expect(await reload(db)).toEqual(["1001"]);
  });

  it("refuses a person who is not in this school's roster", async () => {
    const { db } = makeDb();
    const r = await changeHead(loadRouter(db), "9001");
    expect(r.status).toBe(404);
    expect(await reload(db)).toEqual(["1001"]);
  });

  it("a second change at the same moment is rejected, not interleaved", async () => {
    const { db } = makeDb({ locked: false });
    const r = await changeHead(loadRouter(db));
    expect(r.status).toBe(409);
    expect(await reload(db)).toEqual(["1001"]);
  });

  it("removing the head is stored and read back too", async () => {
    const { db } = makeDb();
    const r = await call(loadRouter(db), "PUT", "/school-head-config", {
      hasMultipleHeads: false,
      mainHeadId: null,
      assignments: {},
    });
    expect(r.status).toBe(200);
    expect(r.body.heads).toEqual([]);
    expect(await reload(db)).toEqual([]);
  });

  it("the single-person route is verified the same way", async () => {
    const { db } = makeDb();
    const router = loadRouter(db);
    const ok = await call(router, "PUT", "/1002/school-head", {
      isSchoolHead: true,
      isMainSh: true,
    });
    expect(ok.status).toBe(200);
    expect(await reload(db)).toEqual(["1002"]);
    const bad = makeDb({ zeroRowUpdate: true });
    const fail = await call(loadRouter(bad.db), "PUT", "/1002/school-head", {
      isSchoolHead: true,
    });
    expect(fail.status).toBe(500);
  });
});

describe("a roster bulk save can no longer flip the School Head", () => {
  const src = read("../../controllers/personnel/roster.js");
  it("is_school_head / is_main_sh are excluded from the bulk update list", () => {
    const i = src.indexOf("const PROFILE_UPDATE_COLS");
    const body = src.slice(i, i + 400);
    expect(body).toMatch(/c !== "is_school_head"/);
    expect(body).toMatch(/c !== "is_main_sh"/);
  });
});

describe("client: nothing is shown as saved unless the server stored it", () => {
  const ctx = read("../../../client/src/context/AppContext.jsx");
  const start = ctx.indexOf("const designateSchoolHeadsConfig = async");
  const end = ctx.indexOf("const addClassSection = async", start);
  const body = ctx.slice(start, end);

  const build = ({ apiImpl }) => {
    const calls = {
      setPersonnel: [],
      setSchoolInfo: [],
      toasts: [],
      dirty: [],
    };
    const runSaveFlow = async (_o, task) => {
      try {
        return { ok: true, result: await task({}) };
      } catch (error) {
        return { ok: false, error };
      }
    };
    const fn = new Function(
      "personnel",
      "showToast",
      "runSaveFlow",
      "api",
      "schoolInfo",
      "setPersonnel",
      "setSchoolInfo",
      "setHasUnsavedChanges",
      `return (${body.replace(/^const designateSchoolHeadsConfig = /, "").replace(/;\s*$/, "")});`,
    )(
      [
        { id: "1001", firstName: "VALENTIN" },
        { id: "1002", firstName: "CARMELA" },
      ],
      (m) => calls.toasts.push(m),
      runSaveFlow,
      { saveSchoolHeadConfig: apiImpl },
      { schoolId: "300488" },
      (u) => calls.setPersonnel.push(u),
      (u) => calls.setSchoolInfo.push(u),
      (v) => calls.dirty.push(v),
    );
    return { fn, calls };
  };

  it("failure: no local state change, no toast, previous head stays, returns false", async () => {
    const { fn, calls } = build({
      apiImpl: async () => {
        throw new Error("Request timed out");
      },
    });
    const out = await fn({
      hasMultipleHeads: false,
      mainHeadId: "1002",
      assignments: { All: "1002" },
    });
    expect(out).toBe(false);
    expect(calls.setPersonnel).toHaveLength(0);
    expect(calls.setSchoolInfo).toHaveLength(0);
    expect(calls.toasts).toHaveLength(0);
    expect(calls.dirty).toHaveLength(0);
  });

  it("an answer that is not a verified success is treated as a failure", async () => {
    const { fn, calls } = build({ apiImpl: async () => ({ success: true }) }); // no stored heads returned
    expect(
      await fn({
        hasMultipleHeads: false,
        mainHeadId: "1002",
        assignments: { All: "1002" },
      }),
    ).toBe(false);
    expect(calls.setPersonnel).toHaveLength(0);
  });

  it("success: the screen is rendered from the heads the server returned, with no toast", async () => {
    const { fn, calls } = build({
      apiImpl: async () => ({
        success: true,
        heads: [{ id: "1002", isMain: true, level: null }],
      }),
    });
    const out = await fn({
      hasMultipleHeads: false,
      mainHeadId: "1002",
      assignments: { All: "1002" },
    });
    expect(out).toEqual({
      ok: true,
      heads: [{ id: "1002", isMain: true, level: null }],
    });
    expect(calls.setPersonnel).toHaveLength(1);
    const next = calls.setPersonnel[0]([
      { id: "1001", isSchoolHead: true },
      { id: "1002", isSchoolHead: false },
    ]);
    expect(next.find((p) => p.id === "1002").isSchoolHead).toBe(true);
    expect(next.find((p) => p.id === "1001").isSchoolHead).toBe(false);
    expect(calls.toasts).toHaveLength(0);
  });

  it("the Roster no longer toasts on selection and acts only on the verified result", () => {
    const roster = read("../../../client/src/pages/Roster.jsx");
    expect(roster).not.toMatch(/designated as School Head\./);
    expect(roster).not.toMatch(/School Head designation removed\./);
    const i = roster.indexOf("const saved = await designateSchoolHeadsConfig");
    expect(roster.slice(i, i + 700)).toMatch(/if \(!saved\) return;/);
  });
});
