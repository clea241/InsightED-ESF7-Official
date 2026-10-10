import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { codec, sameAsColumn, TABLES } = require("../../utils/payloadExtras");

describe("payloadExtras codec", () => {
  test("every configured table builds a codec with camelCase and snake_case aliases for its columns", () => {
    for (const table of Object.keys(TABLES)) {
      const cd = codec(table);
      expect(cd.aliases.get("id")).toBeTruthy();
      for (const col of Object.keys(TABLES[table].columns))
        expect(cd.aliases.get(col).col).toBe(col);
    }
    expect(codec("esf7_requests").aliases.get("requesterSchoolId").col).toBe(
      "requester_school_id",
    );
  });

  test("a body key equal to its typed column is dropped; a different or empty value is kept", () => {
    const cd = codec("esf7_requests");
    const row = {
      id: "r1",
      requester_school_id: "111",
      target_school_id: "222",
      request_type: "borrow",
      personnel_id: null,
      personnel_name: "T",
      remarks: "x",
    };
    const extras = cd.buildExtras(
      {
        requesterSchoolId: "111",
        targetSchoolId: "333",
        requestType: "borrow",
        personnelId: "P1",
        personnelName: "T",
        remarks: "x",
        note: "n",
        rawPayload: { old: 1 },
      },
      row,
    );
    expect(extras).toEqual({
      targetSchoolId: "333",
      personnelId: "P1",
      note: "n",
    });
  });

  test("numbers, booleans, json and time compare strictly", () => {
    expect(sameAsColumn("num", 60, "60.00")).toBe(true);
    expect(sameAsColumn("num", "60", 60)).toBe(false);
    expect(sameAsColumn("bool", false, false)).toBe(true);
    expect(sameAsColumn("bool", "false", false)).toBe(false);
    expect(sameAsColumn("json", ["M", "T"], ["M", "T"])).toBe(true);
    expect(sameAsColumn("json", ["M"], ["M", "T"])).toBe(false);
    expect(sameAsColumn("time", "13:00", "13:00:00")).toBe(true);
    expect(sameAsColumn("skip", "2026-01-01", "2026-01-01")).toBe(false);
    expect(sameAsColumn("skip", null, null)).toBe(true);
  });

  test("extra aliases map payload keys that spell a column differently (admin task: task -> task_name)", () => {
    const cd = codec("esf7_admin_task");
    const row = {
      id: "a1",
      task_name: "Records",
      task_category: "Records",
      start_time: "13:00:00",
      end_time: "14:00:00",
      days: ["M"],
      term: "1st",
      status: "ACTIVE",
    };
    expect(
      cd.buildExtras(
        {
          task: "Records",
          category: "Records",
          startTime: "13:00",
          endTime: "14:00",
          days: ["M"],
          term: "1st",
          hours: 1,
        },
        row,
      ),
    ).toEqual({ hours: 1 });
  });

  test("unaccountedKeys finds a key that is neither in a column nor in extras", () => {
    const cd = codec("esf7_personnel_allowances");
    const row = {
      id: "x",
      personnel_id: "P",
      school_year: "SY",
      extras: { isGranted: true },
    };
    expect(
      cd.unaccountedKeys(
        { personnelId: "P", schoolYear: "SY", isGranted: true },
        row,
      ),
    ).toEqual([]);
    expect(
      cd.unaccountedKeys({ personnelId: "P", allowanceKey: "pera" }, row),
    ).toEqual(["allowanceKey"]);
  });

  test("reconstruct returns the core keys from the columns plus extras (extras win)", () => {
    const cd = codec("esf7_regular_sections");
    const out = cd.reconstruct({
      id: "s1",
      grade_level: "Grade 7",
      section_name: "ROSE",
      section_type: "MONO GRADE",
      extras: { sectionName: "Rose", advisorId: "A1" },
    });
    expect(out).toMatchObject({
      id: "s1",
      gradeLevel: "Grade 7",
      sectionName: "Rose",
      sectionType: "MONO GRADE",
      advisorId: "A1",
    });
  });
});
