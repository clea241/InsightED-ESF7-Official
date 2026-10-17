import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  serializeLdTrainings,
  serializeLearningAreas,
  resolvePersonnelAliasIds,
  loadSchoolNormalizedData,
} from "../../services/personnelSharedReader";

const nodeRequire = createRequire(import.meta.url);

describe("Shared Personnel Serializers (L&D and Learning Areas)", () => {
  it("serializeLdTrainings partitions rows into neap, certification, other and normalizes fields", () => {
    const rawRows = [
      {
        id: "TRN-1",
        personnel_id: "176501",
        training_type: "NEAP",
        title: "School Leaders Program",
        conductor: "NEAP Central",
        start_date: "2024-01-15",
        end_date: "2024-01-19",
        days: 5,
        total_hours: 40,
      },
      {
        id: "TRN-2",
        personnel_id: "176501",
        training_type: "TESDA",
        title: "Bread and Pastry Production NC II",
        conductor: "TESDA Regional",
        start_date: "2023-05-10",
        end_date: "2023-05-20",
        days: 10,
        total_hours: 80,
      },
      {
        id: "TRN-3",
        personnel_id: "176501",
        training_type: "OTHER",
        title: "Division ICT In-Service Training",
        conductor: "Division Office",
        start_date: "2022-10-01",
        end_date: "2022-10-03",
        days: 3,
        total_hours: 24,
      },
    ];

    const serialized = serializeLdTrainings(rawRows);

    expect(serialized.neapTrainingRows).toHaveLength(1);
    expect(serialized.certificationRows).toHaveLength(1);
    expect(serialized.otherTrainingRows).toHaveLength(1);

    const neap = serialized.neapTrainingRows[0];
    expect(neap.type).toBe("NEAP");
    expect(neap.title).toBe("School Leaders Program");
    expect(neap.totalHours).toBe(40);
    expect(neap.total_hours).toBe(40);
    expect(neap.startDate).toBe("2024-01-15");
    expect(neap.start_date).toBe("2024-01-15");

    const cert = serialized.certificationRows[0];
    expect(cert.type).toBe("TESDA");
    expect(cert.totalHours).toBe(80);

    const other = serialized.otherTrainingRows[0];
    expect(other.type).toBe("OTHER");
    expect(other.totalHours).toBe(24);
  });

  it("serializeLearningAreas provides identical learningAreaMap and matrix_data shapes", () => {
    const rawMatrix = {
      "2023-Present||English": { checked: true, years: 3 },
      "2011-2023||Science": { checked: true, years: 5 },
    };

    const serialized = serializeLearningAreas(rawMatrix);

    expect(serialized.learningAreaMap).toBeDefined();
    expect(serialized.matrix_data).toBeDefined();
    expect(serialized.learningAreaMap).toEqual(serialized.matrix_data);
    expect(serialized.learningAreaMap["2023-Present||English"].years).toBe(3);
    expect(serialized.learningAreaMap["2011-2023||Science"].years).toBe(5);
  });

  it("serializeLearningAreas formats disaggregated rows into era||subject map", () => {
    const rows = [
      {
        school_year: "2023-Present",
        learning_area: "English",
        years_taught: 3,
      },
      {
        school_year: "2011-2023",
        learning_area: "KINDER BLOCKS OF TIME",
        years_taught: 2,
      },
    ];

    const serialized = serializeLearningAreas(rows);

    expect(serialized.learningAreaMap["2023-Present||English"]).toEqual({
      checked: true,
      years: 3,
    });
    expect(serialized.learningAreaMap["2011-2023||Kinder"]).toEqual({
      checked: true,
      years: 2,
    });
  });
});

describe("Single Source of Truth Code Architecture", () => {
  it("personnel profile controller uses alias resolution for normalized lookups", () => {
    const src = readFileSync(
      new URL("../../controllers/personnel/profile.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/resolvePersonnelAliasIds/);
    expect(src).toMatch(/esf7_personnel_ld_trainings/);
    expect(src).toMatch(/esf7_personnel_learning_areas/);
  });

  it("common personnel helper re-exports and uses shared normalized serializers", () => {
    const src = readFileSync(
      new URL("../../controllers/personnel/common.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/serializeLdTrainings/);
    expect(src).toMatch(/serializeLearningAreas/);
    expect(src).toMatch(/loadPersonnelNormalizedData/);
    expect(src).toMatch(/loadSchoolNormalizedData/);
  });

  it("room profiling controller uses shared school normalized loader", () => {
    const src = readFileSync(
      new URL("../../controllers/room_profiling/index.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/loadSchoolNormalizedData/);
    expect(src).toMatch(/formatPersonnelRecord/);
  });

  it("personnel roster controller populates L&D and Learning Areas via loadSchoolNormalizedData", () => {
    const src = readFileSync(
      new URL("../../controllers/personnel/roster.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/loadSchoolNormalizedData/);
  });

  it("learning areas controller uses shared serializer and alias resolver", () => {
    const src = readFileSync(
      new URL(
        "../../controllers/personnel_learning_areas/index.js",
        import.meta.url,
      ),
      "utf8",
    );
    expect(src).toMatch(/serializeLearningAreas/);
    expect(src).toMatch(/resolvePersonnelAliasIds/);
  });

  it("accept route in room profiling supports learningAreas and training aliases in shouldFieldUpdate", () => {
    const src = readFileSync(
      new URL("../../controllers/room_profiling/index.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/shouldFieldUpdate\("learningAreas"\)/);
    expect(src).toMatch(/shouldFieldUpdate\("trainings"\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Regression cases for the bugs this work fixed
// ---------------------------------------------------------------------------------------------------------------

describe("serializer shape is identical for every caller", () => {
  it("the same training row serializes identically whether it came from the database or the client", () => {
    const fromDb = serializeLdTrainings([
      {
        id: "t1",
        personnel_id: "p",
        training_type: "neap",
        title: "A",
        total_hours: 8,
      },
    ]).neapTrainingRows[0];
    const fromClient = serializeLdTrainings([
      { id: "t1", personnelId: "p", type: "NEAP", title: "A", totalHours: 8 },
    ]).neapTrainingRows[0];
    expect(fromDb.type).toBe("NEAP");
    expect(fromClient.type).toBe("NEAP");
    expect(fromDb.training_type).toBe(fromDb.type);
    expect(fromDb).toEqual(fromClient);
  });

  it("CERTIFICATION is stored/served as TESDA, unknown types as OTHER", () => {
    const s = serializeLdTrainings([
      {
        id: "a",
        personnel_id: "p",
        training_type: "CERTIFICATION",
        title: "x",
      },
      { id: "b", personnel_id: "p", training_type: "whatever", title: "y" },
    ]);
    expect(s.certificationRows[0].type).toBe("TESDA");
    expect(s.otherTrainingRows[0].type).toBe("OTHER");
  });

  it("learning areas keep 0 and blank years instead of rewriting them to 1", () => {
    const { learningAreaMap } = serializeLearningAreas({
      "2023-Present||English": { checked: true, years: 0 },
      "2023-Present||Math": { checked: true, years: "" },
    });
    expect(learningAreaMap["2023-Present||English"].years).toBe(0);
    expect(learningAreaMap["2023-Present||Math"].years).toBe("");
  });

  it("a list of table rows (each with its own matrix_data) merges, first row wins", () => {
    const s = serializeLearningAreas([
      { matrix_data: { "2023-Present||English": { checked: true, years: 9 } } },
      {
        matrix_data: {
          "2023-Present||English": { checked: true, years: 1 },
          "2011-2023||Science": { checked: true, years: 5 },
        },
      },
    ]);
    expect(s.learningAreaMap["2023-Present||English"].years).toBe(9);
    expect(s.learningAreaMap["2011-2023||Science"].years).toBe(5);
    expect(s.matrix_data).toEqual(s.learningAreaMap);
  });

  it("empty / garbage input gives an empty map in the same shape", () => {
    for (const bad of [undefined, null, "", "{not json", [], 42]) {
      const s = serializeLearningAreas(bad);
      expect(s).toEqual({ learningAreaMap: {}, matrix_data: {} });
    }
  });
});

describe("child rows keyed by a numeric ID resolve to the right personnel", () => {
  const profiles = [
    {
      id: "uuid-a",
      legacy_id: "176501",
      prn: "PRN-0176501",
      employee_no: "E-1001",
      first_name: "MAEROSE",
      last_name: "ACUPIDO",
      school_id: "300488",
    },
    {
      id: "uuid-b",
      legacy_id: "176502",
      prn: "PRN-0176502",
      employee_no: "E-1002",
      first_name: "BEN",
      last_name: "REYES",
      school_id: "300488",
    },
    {
      id: "uuid-c",
      legacy_id: "999001",
      prn: "PRN-0999001",
      employee_no: "E-9001",
      first_name: "OTHER",
      last_name: "SCHOOLPERSON",
      school_id: "111111",
    },
  ];
  const trainings = [
    {
      id: "t-numeric",
      personnel_id: "176501",
      training_type: "NEAP",
      title: "Keyed by numeric legacy id",
      created_at: 1,
    },
    {
      id: "t-uuid",
      personnel_id: "uuid-a",
      training_type: "OTHER",
      title: "Keyed by canonical uuid",
      created_at: 2,
    },
    {
      id: "t-b",
      personnel_id: "176502",
      training_type: "NEAP",
      title: "Belongs to BEN",
      created_at: 3,
    },
    {
      id: "t-other-school",
      personnel_id: "999001",
      training_type: "NEAP",
      title: "Other school",
      created_at: 4,
    },
  ];
  const learningAreas = [
    {
      id: "la-a",
      personnel_id: "176501",
      matrix_data: { "2023-Present||English": { checked: true, years: 3 } },
      updated_at: 5,
    },
    {
      id: "la-b",
      personnel_id: "uuid-b",
      matrix_data: { "2023-Present||Math": { checked: true, years: 2 } },
      updated_at: 6,
    },
  ];

  const client = {
    query: async (sql, params) => {
      const t = sql.replace(/\s+/g, " ");
      const schools = params[0];
      const inSchool = profiles.filter((p) => schools.includes(p.school_id));
      if (/FROM esf7_personnel_profile WHERE school_id = ANY/.test(t))
        return { rows: inSchool };
      if (/FROM esf7_personnel_id_mapping/.test(t)) return { rows: [] };
      const joins = (rows) =>
        rows.filter((r) =>
          inSchool.some(
            (p) => p.id === r.personnel_id || p.legacy_id === r.personnel_id,
          ),
        );
      if (/esf7_personnel_ld_trainings t/.test(t))
        return { rows: joins(trainings) };
      if (/esf7_personnel_learning_areas la/.test(t))
        return { rows: joins(learningAreas) };
      throw new Error("unexpected sql: " + t.slice(0, 80));
    },
  };

  it("the numeric-keyed and uuid-keyed rows both land on the same teacher, and only on that teacher", async () => {
    const school = await loadSchoolNormalizedData(client, "300488");
    const a = school.getForTeacher("uuid-a", "PRN-0176501", "E-1001", "176501");
    expect(a.neapTrainingRows.map((r) => r.id)).toEqual(["t-numeric"]);
    expect(a.otherTrainingRows.map((r) => r.id)).toEqual(["t-uuid"]);
    expect(a.learningAreaMap["2023-Present||English"].years).toBe(3);

    const b = school.getForTeacher("uuid-b", "PRN-0176502", "E-1002", "176502");
    expect(b.neapTrainingRows.map((r) => r.id)).toEqual(["t-b"]);
    expect(b.otherTrainingRows).toEqual([]);
    expect(b.learningAreaMap["2023-Present||Math"].years).toBe(2);
    expect(b.learningAreaMap["2023-Present||English"]).toBeUndefined();
  });

  it("looking a teacher up by the numeric id alone, or by PRN alone, finds the same rows", async () => {
    const school = await loadSchoolNormalizedData(client, "300488");
    expect(
      school.getForTeacher(null, null, null, "176501").neapTrainingRows,
    ).toHaveLength(1);
    expect(
      school.getForTeacher(null, "PRN-0176501", null, null).neapTrainingRows,
    ).toHaveLength(1);
    expect(school.getForTeacher("uuid-a").otherTrainingRows).toHaveLength(1);
  });

  it("another school's rows never appear, and an unknown teacher gets an empty (not borrowed) result", async () => {
    const school = await loadSchoolNormalizedData(client, "300488");
    const all = JSON.stringify(school.allTrainings);
    expect(all).not.toContain("t-other-school");
    const nobody = school.getForTeacher(
      "uuid-zzz",
      "PRN-0000000",
      null,
      "424242",
    );
    expect(nobody.neapTrainingRows).toEqual([]);
    expect(nobody.learningAreaMap).toEqual({});
  });
});

describe("resolvePersonnelAliasIds never matches across schools", () => {
  const profiles = [
    {
      id: "uuid-1",
      legacy_id: "111111",
      prn: "PRN-0111111",
      employee_no: "EMP-9000",
      school_id: "300488",
    },
    {
      id: "uuid-2",
      legacy_id: "222222",
      prn: "PRN-0222222",
      employee_no: "EMP-9000",
      school_id: "400500",
    }, // same employee no, other school
    {
      id: "uuid-foreign",
      legacy_id: "333333",
      prn: "PRN-0333333",
      employee_no: "EMP-7000",
      school_id: "400500",
    },
  ];
  const mapping = [
    { legacy_id: "111111", new_id: "uuid-foreign" }, // maps this school's legacy id onto another school's profile
    { legacy_id: "111111", new_id: "uuid-1-old" }, // maps onto an id with no profile (legitimate old key)
  ];
  const clean = (v) => String(v || "").replace(/^SCH-/i, "");
  const client = {
    query: async (sql, params) => {
      const t = sql.replace(/\s+/g, " ");
      if (
        /SELECT school_id, legacy_id, prn, employee_no FROM esf7_personnel_profile WHERE id = \$1/.test(
          t,
        )
      ) {
        return { rows: profiles.filter((p) => p.id === params[0]) };
      }
      if (/SELECT id, legacy_id, prn, employee_no, school_id/.test(t)) {
        const [aliases, school] = params;
        return {
          rows: profiles.filter(
            (p) =>
              [p.id, p.legacy_id, p.prn, p.employee_no].some((k) =>
                aliases.includes(k),
              ) &&
              (!school || clean(p.school_id) === school),
          ),
        };
      }
      if (/FROM esf7_personnel_id_mapping/.test(t)) {
        return {
          rows: mapping.filter(
            (m) =>
              params[0].includes(m.legacy_id) || params[0].includes(m.new_id),
          ),
        };
      }
      if (
        /SELECT id, legacy_id, school_id FROM esf7_personnel_profile/.test(t)
      ) {
        return {
          rows: profiles.filter(
            (p) => params[0].includes(p.id) || params[0].includes(p.legacy_id),
          ),
        };
      }
      throw new Error("unexpected sql: " + t.slice(0, 90));
    },
  };

  it("a profile row carrying its school only ever resolves inside that school", async () => {
    const ids = await resolvePersonnelAliasIds(client, {
      id: "uuid-1",
      school_id: "300488",
      employee_no: "EMP-9000",
      legacy_id: "111111",
    });
    expect(ids).toEqual(
      expect.arrayContaining(["uuid-1", "111111", "PRN-0111111"]),
    );
    for (const foreign of ["uuid-2", "222222", "PRN-0222222"])
      expect(ids).not.toContain(foreign);
  });

  it("a bare profile id finds its own school first, so the shared employee number does not collide", async () => {
    const ids = await resolvePersonnelAliasIds(client, "uuid-1");
    expect(ids).toContain("111111");
    expect(ids).not.toContain("uuid-2");
    expect(ids).not.toContain("222222");
  });

  it("an alias that exists in two schools is ambiguous: nothing from either school is pulled in", async () => {
    const ids = await resolvePersonnelAliasIds(client, "EMP-9000");
    expect(ids).toEqual(["EMP-9000"]);
  });

  it("the id-mapping table cannot smuggle in another school's profile, but legitimate old keys stay", async () => {
    const ids = await resolvePersonnelAliasIds(client, {
      id: "uuid-1",
      school_id: "300488",
    });
    expect(ids).not.toContain("uuid-foreign");
    expect(ids).not.toContain("333333");
    expect(ids).toContain("uuid-1-old");
  });

  it("the SCH- prefix on a school id does not defeat the school filter", async () => {
    const ids = await resolvePersonnelAliasIds(client, {
      id: "uuid-2",
      school_id: "SCH-400500",
      employee_no: "EMP-9000",
    });
    expect(ids).toContain("uuid-2");
    expect(ids).not.toContain("uuid-1");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// POST /accept: every selectedFields key that names learning areas or L&D
// ---------------------------------------------------------------------------------------------------------------
describe("POST /accept honours each selectedFields key", () => {
  const makeDb = () => {
    const log = [];
    const client = {
      query: async (sql, params = []) => {
        const t = String(sql).trim().replace(/\s+/g, " ");
        log.push(t);
        if (/^SELECT id FROM esf7_personnel_profile WHERE id = ANY/.test(t))
          return { rows: params[0].map((id) => ({ id })) };
        if (
          /^SELECT personnel_id FROM esf7_personnel_(employment|learning_areas) WHERE/.test(
            t,
          )
        )
          return { rows: params[0].map((personnel_id) => ({ personnel_id })) };
        if (/^SELECT personnel_id, COUNT/.test(t))
          return {
            rows: params[0].map((personnel_id) => ({ personnel_id, n: 1 })),
          };
        if (/^SELECT id FROM esf7_personnel_submission_archive WHERE/.test(t))
          return { rows: params[0].map((id) => ({ id })) };
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };
    return {
      log,
      db: { getClient: async () => client, query: async () => ({ rows: [] }) },
    };
  };

  const loadRouter = (db) => {
    const mock = (p, exports) => {
      const f = nodeRequire.resolve(p);
      nodeRequire.cache[f] = { id: f, filename: f, loaded: true, exports };
    };
    mock("../../db", db);
    mock("../../services/cacheService", {
      delPattern: async () => {},
      get: async () => null,
      set: async () => {},
    });
    const rPath = nodeRequire.resolve(
      "../../controllers/room_profiling/index.js",
    );
    delete nodeRequire.cache[rPath];
    return nodeRequire(rPath);
  };

  const accept = (router, selectedFields) =>
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
          headers: {},
          ip: "127.0.0.1",
          body: {
            schoolId: "300488",
            ...(selectedFields ? { selectedFields } : {}),
            submission: {
              submissionId: "sub-1001",
              personnelId: "1001",
              profileData: {
                id: "1001",
                firstName: "MAEROSE",
                lastName: "ACUPIDO",
                position: "TEACHER I",
                birthdate: "1990-01-02",
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
                learningAreaMap: {
                  "2023-Present||English": { checked: true, years: 3 },
                },
              },
            },
          },
        },
        res,
        (err) => resolve({ status: err?.status || 500, error: err }),
      );
    });

  const wrote = (log) => ({
    trainings: log.some((s) =>
      s.startsWith("INSERT INTO esf7_personnel_ld_trainings"),
    ),
    learningAreas: log.some((s) =>
      s.startsWith("INSERT INTO esf7_personnel_learning_areas"),
    ),
  });

  const LA_KEYS = [
    "learningAreas",
    "learning_areas",
    "matrixData",
    "matrix_data",
    "learningAreaMap",
  ];
  const LD_KEYS = [
    "trainings",
    "ld",
    "trainingRows",
    "neapTrainingRows",
    "development",
  ];

  for (const key of LA_KEYS) {
    it(`selectedFields ["${key}"] updates learning areas and leaves L&D untouched`, async () => {
      const { db, log } = makeDb();
      const r = await accept(loadRouter(db), [key]);
      expect(r.error).toBeUndefined();
      expect(r.body.success).toBe(true);
      expect(wrote(log)).toEqual({ trainings: false, learningAreas: true });
      expect(log).toContain("COMMIT");
    });
  }

  for (const key of LD_KEYS) {
    it(`selectedFields ["${key}"] updates L&D trainings and leaves learning areas untouched`, async () => {
      const { db, log } = makeDb();
      const r = await accept(loadRouter(db), [key]);
      expect(r.error).toBeUndefined();
      expect(r.body.success).toBe(true);
      expect(wrote(log)).toEqual({ trainings: true, learningAreas: false });
    });
  }

  it("an unrelated selection touches neither", async () => {
    const { db, log } = makeDb();
    const r = await accept(loadRouter(db), ["firstName"]);
    expect(r.body.success).toBe(true);
    expect(wrote(log)).toEqual({ trainings: false, learningAreas: false });
  });

  it("no selection (Approve All) writes both", async () => {
    const { db, log } = makeDb();
    const r = await accept(loadRouter(db), undefined);
    expect(r.body.success).toBe(true);
    expect(wrote(log)).toEqual({ trainings: true, learningAreas: true });
  });
});
