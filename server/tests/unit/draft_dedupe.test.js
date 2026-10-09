import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { dedupeSections, dedupePersonnel } = require("../../utils/draftDedupe");

describe("draftDedupe", () => {
  test("exact repeats collapse and keep first position", () => {
    const a = { id: "s1", gradeLevel: "Grade 7", sectionName: "A" };
    const b = { id: "s2", gradeLevel: "Grade 8", sectionName: "B" };
    expect(dedupeSections([a, { ...a }, b, { ...b }])).toEqual([a, b]);
  });
  test("same grade+name under a different id merges into the first", () => {
    const out = dedupeSections([
      {
        id: "x",
        gradeLevel: "Grade 7",
        sectionName: "a",
        numberOfLearners: 30,
      },
      {
        id: "y",
        grade_level: "grade 7",
        section_name: "A",
        numberOfLearners: null,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("x");
    expect(out[0].numberOfLearners).toBe(30);
  });
  test("idempotent", () => {
    const list = [{ id: "a" }, { id: "a" }, { id: "b" }];
    expect(dedupeSections(dedupeSections(list))).toEqual(dedupeSections(list));
  });
  test("personnel keyed by id or prn", () => {
    expect(
      dedupePersonnel([
        { id: "P1", prn: "9" },
        { id: "P2", prn: "9" },
        { id: "P3", prn: "3" },
      ]),
    ).toHaveLength(2);
  });
});
