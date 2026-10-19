import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const read = (p) =>
  readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const {
  REQUIRED_COLUMNS,
  DATE_COLUMNS,
  findParityGaps,
} = require("../../db/personnelParity.js");

// ---- a tiny information_schema ----------------------------------------------------------------------------------
const makeSchema = (tables) => {
  const rows = [];
  for (const [table, cols] of Object.entries(tables))
    for (const [column, data_type] of Object.entries(cols))
      rows.push({ table_name: table, column_name: column, data_type });
  return async (sql, params) => {
    if (/information_schema\.columns/.test(sql)) {
      return { rows: rows.filter((r) => params[0].includes(r.table_name)) };
    }
    throw new Error("unexpected sql");
  };
};
const fullSchema = () => {
  const t = {};
  for (const [table, column, def] of REQUIRED_COLUMNS) {
    t[table] ||= {};
    t[table][column] = /^DATE\b/.test(def) ? "date" : "text";
  }
  return t;
};

describe("schema parity check", () => {
  it("reports nothing for a database that matches", async () => {
    expect(await findParityGaps(makeSchema(fullSchema()))).toEqual([]);
  });

  it("names every column a stale staging database is missing (the three fields in question)", async () => {
    const stale = fullSchema();
    delete stale.esf7_personnel_employment.actual_step;
    delete stale.esf7_personnel_employment.school_reported_step;
    delete stale.esf7_personnel_ld_trainings.conductor;
    delete stale.esf7_personnel_profile.philsys_no;
    const gaps = await findParityGaps(makeSchema(stale));
    const names = gaps.map((g) => `${g.table}.${g.column}`);
    expect(names).toEqual(
      expect.arrayContaining([
        "esf7_personnel_employment.actual_step",
        "esf7_personnel_employment.school_reported_step",
        "esf7_personnel_ld_trainings.conductor",
        "esf7_personnel_profile.philsys_no",
      ]),
    );
    expect(gaps.every((g) => g.problem === "column missing")).toBe(true);
  });

  it("flags a first-day-of-service column that is text instead of date", async () => {
    const stale = fullSchema();
    stale.esf7_personnel_employment.first_service_date = "character varying";
    const gaps = await findParityGaps(makeSchema(stale));
    expect(gaps).toContainEqual({
      table: "esf7_personnel_employment",
      column: "first_service_date",
      problem: "should be date",
      found: "character varying",
    });
  });

  it("covers the columns the code really uses", () => {
    const has = (t, c) => REQUIRED_COLUMNS.some(([x, y]) => x === t && y === c);
    // queries in personnel/roster.js, room_profiling and the profile save read/write these
    for (const [t, c] of [
      ["esf7_personnel_employment", "first_service_date"],
      ["esf7_personnel_employment", "actual_step"],
      ["esf7_personnel_employment", "school_reported_step"],
      ["esf7_personnel_ld_trainings", "conductor"],
      ["esf7_personnel_ld_trainings", "start_date"],
      ["esf7_personnel_ld_trainings", "end_date"],
      ["esf7_personnel_ld_trainings", "days"],
      ["esf7_personnel_ld_trainings", "total_hours"],
      ["esf7_personnel_profile", "philsys_no"],
      ["esf7_personnel_profile", "no_philsys"],
      ["esf7_personnel_profile", "school_head_level"],
      ["esf7_personnel_profile", "deleted"],
    ]) {
      expect(has(t, c), `${t}.${c}`).toBe(true);
    }
    expect(DATE_COLUMNS.map(([t, c]) => `${t}.${c}`)).toContain(
      "esf7_personnel_employment.first_service_date",
    );
  });
});

// ---- the migration steps, on a fake client -----------------------------------------------------------------------
const loadMigration = () => {
  const p = require.resolve("../../migrations/add_personnel_parity_columns.js");
  delete require.cache[p];
  return require(p);
};

const makeClient = ({ existing = {}, badDates = 0, dupes = 0 } = {}) => {
  const sql = [];
  const cols = JSON.parse(JSON.stringify(existing));
  return {
    sql,
    query: async (text, params = []) => {
      const t = text.trim().replace(/\s+/g, " ");
      sql.push(t);
      if (t.startsWith("SELECT to_regclass"))
        return { rows: [{ t: params[0] }] };
      if (t.startsWith("SELECT data_type FROM information_schema.columns")) {
        const type = cols[params[0]]?.[params[1]];
        return { rows: type ? [{ data_type: type }] : [] };
      }
      if (t.startsWith("ALTER TABLE") && /ADD COLUMN/.test(t)) {
        const [, table, column] =
          /ALTER TABLE (\S+) ADD COLUMN IF NOT EXISTS (\S+)/.exec(t);
        cols[table] ||= {};
        cols[table][column] = "added";
        return {};
      }
      if (
        /SELECT COUNT\(\*\)::int AS n FROM esf7_personnel_employment WHERE/.test(
          t,
        )
      )
        return { rows: [{ n: badDates }] };
      if (/GROUP BY/.test(t)) return { rows: [{ n: dupes }] };
      if (t.startsWith("SELECT 1 FROM pg_index")) return { rows: [] };
      return { rows: [], rowCount: 0 };
    },
  };
};

describe("add_personnel_parity_columns migration", () => {
  it("adds only what is missing, and a second run changes nothing (idempotent)", async () => {
    const { addMissingColumns } = loadMigration();
    const logs = [];
    const first = makeClient({
      existing: {
        esf7_personnel_profile: { id: "text" },
        esf7_personnel_employment: { id: "text" },
        esf7_personnel_ld_trainings: { id: "text" },
        esf7_personnel_learning_areas: { id: "text" },
      },
    });
    await addMissingColumns(first, (m) => logs.push(m));
    const alters = first.sql.filter((s) => s.startsWith("ALTER TABLE"));
    expect(alters.length).toBe(REQUIRED_COLUMNS.length);
    expect(
      logs.some((l) =>
        l.includes("ADDED esf7_personnel_employment.first_service_date DATE"),
      ),
    ).toBe(true);

    // run again against the state the first run produced: nothing left to add
    const all = {};
    for (const [t, c] of REQUIRED_COLUMNS) (all[t] ||= {})[c] = "x";
    const second = makeClient({ existing: all });
    await addMissingColumns(second, () => {});
    expect(second.sql.filter((s) => s.startsWith("ALTER TABLE"))).toHaveLength(
      0,
    );
  });

  it("never drops or deletes anything", async () => {
    const m = loadMigration();
    const client = makeClient({
      existing: { esf7_personnel_employment: { first_service_date: "text" } },
    });
    await m.addMissingColumns(client, () => {});
    await m.fixDateTypes(client, () => {});
    await m.addUniqueKeys(client, () => {});
    await m.backfill(client, () => {});
    expect(
      client.sql.some((s) => /\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i.test(s)),
    ).toBe(false);
  });

  it("converts a text first_service_date to date only when every value is a date, empty or N/A", async () => {
    const { fixDateTypes } = loadMigration();
    const logs = [];
    const ok = makeClient({
      existing: { esf7_personnel_employment: { first_service_date: "text" } },
      badDates: 0,
    });
    await fixDateTypes(ok, (m) => logs.push(m));
    expect(
      ok.sql.some((s) => /ALTER COLUMN first_service_date TYPE DATE/.test(s)),
    ).toBe(true);

    const bad = makeClient({
      existing: { esf7_personnel_employment: { first_service_date: "text" } },
      badDates: 3,
    });
    const logs2 = [];
    await fixDateTypes(bad, (m) => logs2.push(m));
    expect(bad.sql.some((s) => /TYPE DATE/.test(s))).toBe(false);
    expect(logs2.join("\n")).toMatch(/3 value\(s\) are not dates/);
  });

  it("backfill only fills EMPTY values (never overwrites)", async () => {
    const { backfill } = loadMigration();
    const client = makeClient({
      existing: {
        esf7_personnel_employment: {
          raw_payload: "jsonb",
          first_service_date: "date",
        },
        esf7_personnel_profile: { raw_payload: "jsonb", philsys_no: "text" },
      },
    });
    await backfill(client, () => {});
    const updates = client.sql.filter((s) => s.startsWith("UPDATE"));
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatch(/WHERE first_service_date IS NULL/);
    expect(updates[1]).toMatch(
      /philsys_no IS NULL OR BTRIM\(philsys_no\) = ''/,
    );
  });

  it("refuses to add a unique key over duplicates", async () => {
    const { addUniqueKeys } = loadMigration();
    const logs = [];
    const client = makeClient({
      dupes: 2,
      existing: { esf7_personnel_employment: { personnel_id: "x" } },
    });
    await addUniqueKeys(client, (m) => logs.push(m));
    expect(client.sql.some((s) => s.startsWith("CREATE UNIQUE INDEX"))).toBe(
      false,
    );
    expect(logs.join("\n")).toMatch(/duplicate group/);
  });
});

// ---- dates must mean the same day on every server --------------------------------------------------------------
describe("dates do not move with the server's time zone", () => {
  const { safeCoerceDate } = require("../../controllers/personnel/common.js");

  for (const tz of [
    "UTC",
    "Asia/Manila",
    "America/Los_Angeles",
    "Pacific/Auckland",
  ]) {
    it(`"May 31, 2018" stays 2018-05-31 on a ${tz} server`, () => {
      const before = process.env.TZ;
      process.env.TZ = tz;
      try {
        expect(safeCoerceDate("May 31, 2018", "first_service_date")).toBe(
          "2018-05-31",
        );
        expect(safeCoerceDate("2018-05-31", "first_service_date")).toBe(
          "2018-05-31",
        );
        expect(
          safeCoerceDate("2018-05-31T00:00:00.000Z", "first_service_date"),
        ).toBe("2018-05-31");
        expect(safeCoerceDate("5/31/2018", "first_service_date")).toBe(
          "2018-05-31",
        );
      } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
      }
    });
  }

  it("placeholders still mean 'no date'", () => {
    for (const v of ["N/A", "", null, undefined, "-"]) {
      expect(safeCoerceDate(v, "first_service_date")).toBeNull();
    }
  });

  it("the database driver hands DATE columns back as plain text (no Date object to shift)", () => {
    expect(read("../../db/index.js")).toMatch(
      /setTypeParser\(1082, \(val\) => val\)/,
    );
  });
});

// ---- Room QR uses the same normalized data and writes the whole L&D row -------------------------------------------
describe("Room QR reads and writes the same normalized tables", () => {
  const src = read("../../controllers/room_profiling/index.js");

  it("writes every L&D column (it used to keep only type, title and hours)", () => {
    const i = src.indexOf('"esf7_personnel_ld_trainings",\n          [');
    const body = src.slice(i, i + 400);
    for (const c of [
      "conductor",
      "start_date",
      "end_date",
      "days",
      "total_hours",
    ]) {
      expect(body).toContain(`"${c}"`);
    }
    expect(src).toMatch(
      /start_date: parseDateVal\(tr\.startDate \|\| tr\.start_date\)/,
    );
  });

  it("the roster loader does not turn a failed query into an empty roster", () => {
    const i = src.indexOf("async function loadRoomRosterFromDb");
    const body = src.slice(i, src.indexOf('router.get("/roster"', i));
    expect(body).not.toMatch(/\.catch\(\(\) => \(\{ rows: \[\] \}\)\)/);
    expect(body).toMatch(/formatPersonnelRecord/);
    expect(body).toMatch(/p\.\*/); // p.* includes philsys_no / no_philsys
  });
});

// ---- the client only reports "saved" when the stored record agrees -----------------------------------------------
describe("verifyStoredPersonnel", () => {
  let verify;
  it("loads", async () => {
    verify = (await import("../../../client/src/utils/verifyStored.js"))
      .verifyStoredPersonnel;
    expect(typeof verify).toBe("function");
  });

  it("passes when the stored record holds the three fields", () => {
    expect(
      verify(
        {
          firstServiceDate: "2018-05-31",
          philsysNo: "1234-5678",
          neapTrainingRows: [{}, {}],
        },
        {
          firstServiceDate: "2018-05-31",
          philsysNo: "1234-5678",
          neapTrainingRows: [{}, {}],
        },
      ),
    ).toEqual([]);
  });

  it("fails when the day moved, the PhilSys number is missing, or L&D rows were lost", () => {
    const problems = verify(
      {
        firstServiceDate: "2018-05-31",
        philsysNo: "1234",
        otherTrainingRows: [{}, {}, {}],
      },
      {
        firstServiceDate: "2018-05-30",
        philsysNo: "",
        otherTrainingRows: [{}],
      },
    );
    expect(problems.join("|")).toMatch(
      /1st Day of Service: sent 2018-05-31, stored 2018-05-30/,
    );
    expect(problems.join("|")).toMatch(
      /PhilSys number: sent 1234, stored nothing/,
    );
    expect(problems.join("|")).toMatch(
      /Other trainings: sent 3 row\(s\), stored 1/,
    );
  });

  it("does not enforce blanks, N/A, or 'No PhilSys' (those stay as they are)", () => {
    expect(
      verify(
        { firstServiceDate: "N/A", philsysNo: "N/A", noPhilsys: true },
        { firstServiceDate: null, philsysNo: "" },
      ),
    ).toEqual([]);
  });

  it("the profile save runs the check before it reports anything", () => {
    const ctx = read("../../../client/src/context/AppContext.jsx");
    const i = ctx.indexOf(
      "verifyStoredPersonnel(payloadToPersist, storedRecord)",
    );
    expect(i).toBeGreaterThan(-1);
    expect(ctx.slice(i, i + 300)).toMatch(/throw mismatch/);
  });
});

describe("startup tells you when the schema is behind", () => {
  it("server.js runs the parity check", () => {
    const s = read("../../server.js");
    expect(s).toMatch(/findParityGaps/);
    expect(s).toMatch(/SCHEMA BEHIND THE CODE/);
  });
});
